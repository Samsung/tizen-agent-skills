// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Emulator domain: the full em-cli surface for emulator VMs
 *
 * Supports:
 *   - create:        Create a VM with configurable platform, template, profile, and hardware
 *   - delete:        Delete a VM
 *   - launch:        Launch a VM and wait for it to connect via sdb
 *   - list-platform: List available emulator platform images
 *   - list-template: List available templates for a platform
 *   - list-vm:       List existing emulator VMs
 *   - detail:        Print one VM's configuration, or the emulator manager's own info
 *   - modify:        Change an existing VM's template, RAM, skin, sharing, or acceleration
 *   - reset:         Format a VM's disk image (destructive — gated behind opts.confirm)
 *   - create-image:  Capture a VM's disk as a reusable platform image
 *
 * manageEmulator() is the single entry point covering all of the above.
 * createEmulator() and launchEmulator() remain as the narrower, long-standing
 * entry points that tizen-cli's create-emulator/launch-emulator commands call.
 *
 * Executes scripts/tizen-emulator-manager and parses stdout to return Standard JSON Envelope.
 */

const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { resolveScript, execPluginScript } = require("./plugin-cache");
const { summarizeOutput } = require("./output-summary");

/**
 * Screen size used when the caller does not ask for one.
 * "1080" resolves to the 1920x1080 template of the target profile.
 */
const DEFAULT_SIZE = "1080";

/**
 * Values em-cli accepts for its enum-ish flags.
 *
 * These are screened here, not only in the script, because buildEmulatorArgs()
 * renders every option into the single shell command line that execPluginScript()
 * hands to execSync. Anything injected there runs BEFORE the script starts, so
 * the script's own validation cannot be the boundary that protects it.
 */
const ENUM_OPTIONS = {
  skin: ["1", "2"],
  ramSize: ["512", "768", "1024"],
  hwVirtualization: ["yes", "no"],
  hwGlAcceleration: ["yes", "no"],
};

/**
 * Path-valued options, which reach the script inside double quotes.
 */
const PATH_OPTIONS = [
  "fileSharingPath",
  "customPath",
  "rawImagePath",
  "outputDir",
  "emulatorPath",
];

/**
 * Characters that would end the double-quoted argument a path is rendered into,
 * or start a substitution inside it. Everything else — spaces, drive letters,
 * non-ASCII directory names — is left alone so real paths still work.
 */
const SHELL_METACHARACTERS = /["'`$;&|<>(){}[\]!*?\r\n\t]/;
const SHELL_METACHARACTER_LIST = "\" ' ` $ ; & | < > ( ) { } [ ] ! * ?";

/**
 * Template names may contain spaces, so they get their own allow-list rather
 * than the path screen.
 */
const TEMPLATE_PATTERN = /^[A-Za-z0-9._\s-]+$/;

/** VM and platform names are plain identifiers — no spaces, no punctuation. */
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Screen the options that are interpolated into the script command line.
 *
 * vmName / platform / template have always been validated at their call sites;
 * this covers the hardware, path, and timeout options that are passed through.
 *
 * @param {object} opts
 * @param {string} command
 * @returns {object|null} An error envelope, or null when every option is safe
 */
function validatePassThroughOptions(opts, command) {
  for (const [key, allowed] of Object.entries(ENUM_OPTIONS)) {
    const value = opts[key];
    if (value === undefined || value === null || value === "") continue;
    if (!allowed.includes(String(value))) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid ${key}: ${value}. em-cli accepts ${allowed.join(", ")}.`,
      );
    }
  }

  for (const key of PATH_OPTIONS) {
    const value = opts[key];
    if (value === undefined || value === null || value === "") continue;
    const text = String(value);
    // A trailing backslash would escape the closing quote: bash reads "C:\" as
    // an unterminated string and swallows the rest of the command line.
    if (SHELL_METACHARACTERS.test(text) || text.endsWith("\\")) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid ${key}: ${text}. A path must not end with a backslash or contain ` +
          `any of these characters: ${SHELL_METACHARACTER_LIST}`,
      );
    }
  }

  return null;
}

/**
 * Machine-readable output lines of the emulator scripts. Each of these is
 * parsed into a structured field elsewhere (result fields, LAUNCH_DIAG via
 * parseLaunchDiagnostics, HOMESCREEN_STATUS via parseHomescreenStatus), so repeating
 * them as text would duplicate every finding. Shared by
 * summarizeEmulatorOutput() and rawOutputTail() so both views filter the
 * SAME set — a machine line must never resurface as a warning or a `raw:`
 * evidence line.
 */
const MACHINE_LINE =
  /^(EMULATOR_|VM_|PLATFORM_|TEMPLATE_|LAUNCH_DIAG=|LAUNCH_WARN=|HOMESCREEN_STATUS=|HW_VIRT_AUTOFIX=|SDB_SERVER_RESTARTED=|EMCLI_MISMATCH=|EMCLI_EXIT=|EMCLI_OUTPUT_BEGIN|EMCLI_OUTPUT_END|VM_LIST|PLATFORM_LIST|TEMPLATE_LIST)/;

/**
 * Summarize em-cli output for envelope warnings
 */
function summarizeEmulatorOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|manual|em-cli|jna|qemu|platform|template|created|deleted|launch|kvm|virtualiz|xcb|ldd|not found|emulator\.log/i,
    skip: MACHINE_LINE,
    max: 15,
  });
}

/**
 * Signature of em-cli dying inside its own Java runtime (missing JNA native
 * bridge, missing classes, broken JVM) rather than reporting a VM problem.
 * The JVM prints qualified class names, and the plugin scripts' own warnings
 * say "Java/JNA", so both are covered.
 *
 * SINGLE SOURCE for Java/JNA detection: doctor.ts imports this constant, and
 * the `grep -qiE` in tizen-emulator-manager.sh launch_vm() carries a literal
 * copy of the same alternation (the shell cannot import it) — the test suite
 * compares the two token-for-token, so change them together.
 */
const JAVA_JNA_PATTERN =
  /jna|NoClassDefFoundError|UnsatisfiedLinkError|ClassNotFoundException|NoSuchFieldError|NoSuchMethodError|ExceptionInInitializerError|java\.lang\.|Could not create the Java Virtual Machine|Error occurred during initialization of VM|java: command not found/i;

/**
 * Subset of JAVA_JNA_PATTERN with a different root cause: NoSuchFieldError /
 * NoSuchMethodError means a class LOADED but its members do not match what the
 * caller was compiled against — an emulator-manager core vs platform emulator
 * plugin VERSION MISMATCH, not a missing dependency. Real case:
 * `java.lang.NoSuchFieldError: isVirgl` launching tizen-11.0, fixed by
 * tizen-update-package taking emulator-manager 2.6.60 → 2.6.67. The fix is the
 * update-package flow, so javaJnaHint must not send these to a JNA reinstall.
 */
const JAVA_VERSION_MISMATCH_PATTERN = /NoSuchFieldError|NoSuchMethodError/i;

/**
 * Guidance for a Java/JNA em-cli crash.
 *
 * Issue #40: the old hint ("launch an emulator manually via Tizen Studio
 * Emulator Manager") assumed a human at a GUI on the SDK host — exactly what a
 * headless MCP client cannot satisfy. Point at the raw output now carried in
 * details, and at fixes that work over a shell.
 */
function javaJnaHint(output) {
  if (!JAVA_JNA_PATTERN.test(output)) return "";
  if (JAVA_VERSION_MISMATCH_PATTERN.test(output)) {
    return (
      " em-cli (a Java tool) crashed with a NoSuchFieldError/NoSuchMethodError before it could touch the VM —" +
      " its emulator-manager core and the platform's emulator plugin are at mismatched versions" +
      " (e.g. java.lang.NoSuchFieldError: isVirgl), not a missing dependency." +
      " The raw em-cli output is in the error details — check it for the exact Java error." +
      " Fix on the SDK host: update the SDK packages (tizen-update-package) so emulator-manager and the" +
      " platform plugins match again. Run 'doctor' to re-check em-cli health after updating."
    );
  }
  return (
    " em-cli (a Java tool) crashed with a Java/JNA dependency error before it could touch the VM." +
    " The raw em-cli output is in the error details — check it for the exact Java error." +
    " Typical fixes on the SDK host: reinstall the emulator package (download-emulator-package," +
    " it restores the JNA jar), and verify the SDK's bundled JRE runs." +
    " Run 'doctor' to re-check em-cli health after fixing."
  );
}

/**
 * The part of a script's captured output that em-cli itself printed.
 *
 * report_emcli_failure / Report-EmCliFailure wrap the raw em-cli output in
 * EMCLI_OUTPUT_BEGIN / EMCLI_OUTPUT_END marker lines. Only that part may feed
 * JAVA_JNA_PATTERN: the scripts' own diagnostics used to say "Java/JNA" and
 * "NoClassDefFoundError", so every failure — including a sandboxed em-cli that
 * printed nothing — was reported as a JNA crash (issue #82). Output from an
 * older script without markers is returned whole, minus lines that are
 * visibly the script's own ([WARN]/[INFO]/[ERROR] prefixed).
 *
 * @param {string} scriptOutput
 * @returns {string}
 */
function emcliOutputOf(scriptOutput) {
  const text = String(scriptOutput || "");
  const blocks = [];
  const re = /^EMCLI_OUTPUT_BEGIN\r?\n([\s\S]*?)^EMCLI_OUTPUT_END/gm;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push(m[1]);
  if (blocks.length) return blocks.join("\n");
  if (/^EMCLI_OUTPUT_BEGIN/m.test(text)) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\[(WARN|INFO|ERROR|OK)\]/.test(line.trim()))
    .join("\n");
}

/**
 * em-cli exited (EMCLI_EXIT=<rc> machine line) but printed nothing: the JVM
 * never got to run — a sandbox/permission policy killed or blocked it, or it
 * could not start. Distinct from a Java stack trace, which javaJnaHint covers.
 *
 * @param {string} scriptOutput
 * @returns {string} sentence starting with a space, or ""
 */
function emcliExitHint(scriptOutput) {
  const text = String(scriptOutput || "");
  const exit = text.match(/^EMCLI_EXIT=(\d+)$/m);
  if (!exit) return "";
  if (emcliOutputOf(text).trim()) return "";
  const rc = exit[1];
  return (
    ` em-cli exited with code ${rc} without printing anything — it was blocked before it could run ` +
    "(a sandbox or permission policy: under Codex CLI re-run this command with escalated permissions" +
    (rc === "124"
      ? "; 124 means it hit the em-cli wall-clock cap, i.e. a hung JVM"
      : "") +
    "), or the SDK's bundled JRE could not start. Run 'doctor' to re-check em-cli health."
  );
}

/**
 * Suggested fix for an emulator-manager core vs platform emulator plugin
 * version mismatch (NoSuchFieldError/NoSuchMethodError, real case
 * java.lang.NoSuchFieldError: isVirgl): update the SDK packages, then retry
 * the exact create that failed. The update is deliberately NOT executed here —
 * it can download hundreds of MB of emulator images (minutes), so it must run
 * through the update-package flow instead of blocking inside this call. Note
 * for the caller: the update overwrites the platform's emulator-v2/bin host
 * libraries, so any manual workarounds there must be re-applied.
 */
function versionMismatchFix(action, opts = {}) {
  const update =
    "node update-package-cli.js (long-running package download — run it in the background)";
  if (action !== "create") {
    return `${update}, then retry the failed '${action}' once`;
  }
  const retry = ["node emulator-manager-cli.js create"];
  if (opts.vmName) retry.push(`--vm-name ${opts.vmName}`);
  if (opts.platform) retry.push(`--platform ${opts.platform}`);
  if (opts.profile && opts.profile !== "tizen")
    retry.push(`--profile ${opts.profile}`);
  if (opts.template) retry.push(`--template "${opts.template}"`);
  else if (opts.size) retry.push(`--size ${opts.size}`);
  if (opts.launch) retry.push("--launch");
  return `${update}, then retry once: ${retry.join(" ")}`;
}

/**
 * Last lines of the raw script output, for the error envelope's details.
 *
 * Issue #40: a remote MCP client cannot read the temp file on the SDK host
 * (execPluginScript deletes it after reading anyway), so the categorised
 * message was all it ever saw — not enough to tell a missing native library
 * from a JVM version mismatch. This carries the untouched tail of
 * stdout+stderr, truncated per line, so the original stack trace survives
 * into the payload. MACHINE_LINE entries are dropped — they already reach
 * the caller through the structured fields, and the filter is the same set
 * summarizeEmulatorOutput() skips, so the two views stay consistent.
 */
function rawOutputTail(output, { maxLines = 20, maxLineLength = 300 } = {}) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, "").trim())
    .filter((line) => line && !MACHINE_LINE.test(line));
  const tail = lines
    .slice(-maxLines)
    .map((line) => {
      if (line.length <= maxLineLength) return line;
      // Never split a surrogate pair at the cut: JSON.stringify escapes a lone
      // surrogate into valid JSON, but it reaches the client as garbage.
      let cut = maxLineLength;
      const boundary = line.charCodeAt(cut - 1);
      if (boundary >= 0xd800 && boundary <= 0xdbff) cut -= 1;
      return `${line.slice(0, cut)} ...`;
    })
    .map((line) => `raw: ${line}`);
  if (lines.length > maxLines) {
    tail.unshift(
      `raw: ... (${lines.length - maxLines} earlier line(s) omitted)`,
    );
  }
  return tail;
}

/**
 * Parse LAUNCH_DIAG=<key>|<value> lines emitted by diagnose_launch_failure()
 * in tizen-emulator-manager.sh into a structured diagnosis.
 *
 * @param {string} output - combined script stdout/stderr
 * @returns {{phase: string|null, vm: string|null, hw_virtualization: string|null,
 *   kvm: string|null, kvm_writable: string|null, cpu_virt_flags: string|null,
 *   missing_libs: string[], missing_qt_libs: string[], qt_xcb: boolean,
 *   qt_display: boolean, display: string|null, display_socket_missing: boolean,
 *   xcb_packages: string|null, java_jna: boolean, wsl: boolean,
 *   emulator_log: string|null, log_tail: string[], suggestions: string[],
 *   fixes: string[]} | null}
 *   null when the output carries no LAUNCH_DIAG lines (old script, or the
 *   failure never reached the diagnosis stage).
 */
function parseLaunchDiagnostics(output) {
  const diag = {
    phase: null,
    vm: null,
    hw_virtualization: null,
    kvm: null,
    kvm_writable: null,
    cpu_virt_flags: null,
    missing_libs: [],
    missing_qt_libs: [],
    qt_xcb: false,
    qt_display: false,
    display: null,
    display_socket_missing: false,
    xcb_packages: null,
    java_jna: false,
    wsl: false,
    emulator_log: null,
    log_tail: [],
    suggestions: [],
    fixes: [],
  };
  let seen = false;
  for (const line of String(output || "").split(/\r?\n/)) {
    const m = line.match(/^LAUNCH_DIAG=(.+?)\|(.*)$/);
    if (!m) continue;
    seen = true;
    const [, key, value] = m;
    switch (key) {
      case "phase":
        diag.phase = value;
        break;
      case "vm":
        diag.vm = value;
        break;
      case "hw_virtualization":
        diag.hw_virtualization = value;
        break;
      case "kvm":
        diag.kvm = value;
        break;
      case "kvm_writable":
        diag.kvm_writable = value;
        break;
      case "cpu_virt_flags":
        diag.cpu_virt_flags = value;
        break;
      case "missing_libs":
        diag.missing_libs = value.split(",").filter(Boolean);
        break;
      case "missing_qt_libs":
        diag.missing_qt_libs = value.split(",").filter(Boolean);
        break;
      case "qt_xcb":
        diag.qt_xcb = value === "failed";
        break;
      case "qt_display":
        diag.qt_display = value === "failed";
        break;
      case "display":
        diag.display = value;
        break;
      case "display_socket":
        diag.display_socket_missing = value === "missing";
        break;
      case "xcb_packages":
        diag.xcb_packages = value;
        break;
      case "java_jna":
        diag.java_jna = value === "failed";
        break;
      case "wsl":
        diag.wsl = value === "yes";
        break;
      case "emulator_log":
        diag.emulator_log = value;
        break;
      case "log":
        diag.log_tail.push(value);
        break;
      case "suggest":
        diag.suggestions.push(value);
        break;
      case "fix":
        diag.fixes.push(value);
        break;
      default:
        break;
    }
  }
  return seen ? diag : null;
}

/**
 * Render a parsed launch diagnosis into the error envelope's details array.
 *
 * The consolidated host-fix guide goes FIRST — it is the "what do I do now"
 * answer (ordered, copy-pasteable commands assembled by the script from its
 * own findings); everything after it is the evidence. Shared by the launch
 * action and the create --launch path so both failures read the same.
 *
 * @param {object} diag - parseLaunchDiagnostics() result (non-null)
 * @param {string} combined - raw script stdout+stderr for the evidence tail
 * @returns {string[]}
 */
function launchDiagnosisDetails(diag, combined) {
  return [
    `phase: ${diag.phase || "unknown"}`,
    ...(diag.fixes.length > 0
      ? [
          "HOST FIX REQUIRED — run these in order, then relaunch:",
          ...diag.fixes.map((f) => `  ${f}`),
        ]
      : []),
    diag.java_jna &&
      "em-cli crashed inside its own Java runtime (JNA) before the VM could start — the emulator never ran. " +
        "Reinstall the emulator package (download-emulator-package) and verify the SDK's bundled JRE; " +
        "a NoSuchFieldError/NoSuchMethodError instead means an emulator-manager vs platform-plugin version " +
        "mismatch — update the SDK packages (tizen-update-package); " +
        "the exact Java error is in the raw: lines below.",
    diag.wsl &&
      `Running in WSL — ensure Windows .wslconfig has nestedVirtualization=true under [interop] or [experimental]`,
    diag.hw_virtualization !== null &&
      `vm_config hwVirtualization: ${diag.hw_virtualization}`,
    diag.kvm &&
      `/dev/kvm: ${diag.kvm}${diag.kvm_writable ? ` (writable: ${diag.kvm_writable})` : ""}`,
    diag.kvm === "missing" &&
      diag.cpu_virt_flags !== null &&
      `cpu virtualization flags (vmx/svm) in /proc/cpuinfo: ${diag.cpu_virt_flags}`,
    diag.missing_libs.length > 0 &&
      `missing libraries: ${diag.missing_libs.join(", ")} — install the matching host packages (libasound2, libsdl1.2debian, libv4l-0, libxcb-*)`,
    diag.missing_qt_libs.length > 0 &&
      `Qt xcb plugin missing libraries: ${diag.missing_qt_libs.join(", ")} — the host-fix steps above name the packages`,
    diag.display === "missing" &&
      "DISPLAY is not set — the emulator GUI has no X server to open on (common in SSH sessions; WSLg sets DISPLAY=:0)",
    diag.display &&
      diag.display !== "missing" &&
      diag.display_socket_missing &&
      `DISPLAY=${diag.display} is set but its X socket does not exist — no X server is listening (WSLg off, or X not running)`,
    diag.qt_display &&
      "Qt could not connect to an X display — a DISPLAY/WSLg problem, not a missing package",
    diag.qt_xcb &&
      diag.xcb_packages !== "installed" &&
      "Qt xcb platform plugin failed to LOAD (file found, deps unmet) — install libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libxcb-shape0 libxcb-xinerama0 libxkbcommon-x11-0",
    diag.qt_xcb &&
      diag.xcb_packages === "installed" &&
      "Qt xcb platform plugin failed to LOAD, but the xcb runtime packages are all installed — the cause is elsewhere (see the DISPLAY and missing-library findings)",
    ...diag.log_tail.map((l) => `emulator.log: ${l}`),
    // The untouched script output tail — the structured lines above are
    // an interpretation, this is the evidence (issue #40).
    ...rawOutputTail(combined, { maxLines: 10 }),
  ].filter(Boolean);
}

/**
 * The one-command suggested_fix for a launch diagnosis, when there is one.
 * Prefers the script-resolved VM name: on a no-name launch the script picks
 * the first VM itself, so the caller's own vmName may be empty.
 */
function launchDiagnosisSuggestedFix(diag, vmName) {
  return diag.suggestions.includes("enable_hw_virtualization")
    ? `node emulator-manager-cli.js modify --vm-name ${diag.vm || vmName || "<vm>"} --hw-virtualization yes`
    : null;
}

/**
 * Parse the HW_VIRT_AUTOFIX=<vm> line emitted by maybe_enable_hw_virtualization()
 * in tizen-emulator-manager.sh — the pre-launch auto-heal that re-enables
 * hwVirtualization on a VM whose profile disabled it while host KVM is usable.
 *
 * @param {string} output - combined script stdout/stderr
 * @returns {string|null} The healed VM's name, or null when no fix was applied.
 */
function parseHwVirtAutofix(output) {
  const m = String(output || "").match(/^HW_VIRT_AUTOFIX=(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * Warning text for a HW_VIRT_AUTOFIX report — shared by the launch and
 * create --launch paths so both envelopes describe the heal identically.
 *
 * Every claim here is gated by maybe_enable_hw_virtualization() in
 * tizen-emulator-manager.sh, which only emits HW_VIRT_AUTOFIX when the host is
 * Linux, $KVM_DEVICE exists and is writable, the profile really said false, AND
 * the em-cli modify was verified to have taken (em-cli lies in both directions,
 * so the script double-checks). Keep the two in sync: this is the only text the
 * user sees, and it is unit-tested for exactly that reason.
 */
function hwVirtAutofixWarning(vm) {
  return (
    `VM '${vm}' had CPU virtualization disabled in its profile ` +
    `(<hwVirtualization>false</hwVirtualization> — em-cli writes that when KVM was ` +
    `inaccessible at create time). Host KVM is usable, so it was auto-enabled before ` +
    `launch (em-cli modify -n ${vm} -w yes). No action needed; this is a one-time fix.`
  );
}

/**
 * Parse LAUNCH_WARN=<key> lines emitted on an otherwise SUCCESSFUL launch
 * (see warn_if_virgl_scanout_failing in tizen-emulator-manager.sh).
 * Deliberately a separate prefix from LAUNCH_DIAG: those are failure-path
 * keys whose script/parser sync is enforced by the key-sync test, while these
 * ride along with DEVICE_SERIAL on the success path.
 *
 * @param {string} output - combined script stdout/stderr
 * @returns {string[]} warning keys, in emission order
 */
function parseLaunchWarnings(output) {
  return [...String(output || "").matchAll(/^LAUNCH_WARN=([a-z_]+)$/gm)].map(
    (m) => m[1],
  );
}

/**
 * The user-facing text for a LAUNCH_WARN key. An unknown key still surfaces —
 * a warning the script bothered to emit must never vanish just because this
 * map lags behind it.
 */
function launchWarningText(key) {
  switch (key) {
    case "virgl_scanout_failing":
      return (
        "The VM log is flooding with virgl scanout failures (virtio_gpu error 0x1203): the host " +
        "virglrenderer cannot handle this platform's GL scanout, so the emulator window may show " +
        "'Display output is not active' or stay black even though boot and sdb succeeded. " +
        "Host virglrenderer >= 1.0 is required."
      );
    default:
      return `Launch warning from the emulator script: ${key}`;
  }
}

/**
 * The home screen binary the WSL fix execs directly, bypassing launchpad.
 * KEEP IN SYNC with HOMESCREEN_RUNNER in tizen-emulator-manager.sh.
 */
const HOMESCREEN_RUNNER = "/usr/apps/org.tizen.homescreen/bin/runner";

/**
 * The single source of truth for what a home screen fix result means to the
 * user. Both callers (launchEmulator and the fix-homescreen action) use this, so
 * the two can never drift apart, and every branch is unit-tested — the prose
 * here is the only place the behaviour is explained, and a stale claim in it
 * (an earlier version blamed WSL's 9p filesystem, which was wrong) reaches the
 * user directly.
 *
 * Deliberately does NOT name the env vars as the cause of `detected`: that state
 * is also reached via the retired TIZEN_BUXTON_AUTOFIX=0 opt-out, so naming
 * TIZEN_HOMESCREEN_* would point at variables the caller never set. The script's
 * own log says which knob applied.
 *
 * @param {"ok"|"detected"|"fixed"|"popup_fixed"|"fix_failed"|null} status
 * @param {object} opts
 * @param {string} [opts.serial] - device serial, for copy-pasteable commands
 * @param {string} [opts.vmName] - VM name, for the TV-profile suggestion
 * @param {boolean} [opts.explicit] - true when the user asked for the fix
 *   directly (the action). Then "nothing to do" outcomes are worth reporting;
 *   on a plain launch they are noise.
 * @returns {string|null} warning text, or null when there is nothing to say
 */
function homescreenFixWarning(
  status,
  { serial, vmName, explicit = false } = {},
) {
  const sdb = `sdb${serial ? ` -s ${serial}` : ""}`;
  const restore = `${sdb} shell "systemctl --global unmask starter.service starter.path"`;

  switch (status) {
    case "fixed":
      return (
        "The home screen was crash-looping (on WSL the Flutter home screen fails EGL config " +
        "selection when launched through launchpad) and this was fixed: starter's user units " +
        'were masked and stopped so its retry loop and its "Unable to launch" popup stop, the ' +
        `accumulated crash dumps were deleted to free /opt, and ${HOMESCREEN_RUNNER} was started ` +
        "directly. Two caveats: it runs as root rather than the session user, so behaviour that " +
        "depends on the user session may differ; and it does not survive a guest reboot, so the " +
        `launch flow re-applies it. To restore stock behaviour: ${restore} and reboot the guest.`
      );
    case "popup_fixed":
      return (
        "The home screen was crash-looping and its retry loop was stopped (starter masked, crash " +
        "dumps cleared to free /opt), but the home screen itself was not started, so the display " +
        "stays empty until you launch an app. App development is unaffected: " +
        `${sdb} shell app_launcher -l, then app_launcher -s <app-id>. To restore stock ` +
        `behaviour: ${restore} and reboot the guest.`
      );
    case "detected":
      return (
        "The home screen is crash-looping and this was only reported — the fixes are switched off " +
        "(see the script log above for which setting applied). Left alone, starter keeps retrying, " +
        'shows "Unable to launch org.tizen.homescreen." and the crash dumps fill /opt until ' +
        `unrelated things start failing (check: ${sdb} shell df -h /opt). App development still ` +
        "works without the home screen."
      );
    case "fix_failed":
      return (
        "The home screen is crash-looping and could not be brought up. Its retry loop and popup " +
        "are stopped, so app development still works: installs/launches via sdb are unaffected " +
        `(verify by launching an installed app — list them with ${sdb} shell app_launcher -l; ` +
        "preinstalled UG/panel components may not open standalone windows, so test with a real " +
        "app). For a home-screen UI that works unattended, switch to the TV profile: " +
        `em-cli delete -n ${vmName || "<vm>"}, then re-create it with -p tv.`
      );
    case "ok":
      return explicit
        ? "No home screen crash loop found — nothing needed fixing and the guest was left untouched."
        : null;
    case null:
    case undefined:
      return explicit
        ? "The home screen fix did not apply to this target and nothing was changed. It is " +
            "verified only for the standard tizen emulator profile on WSL, so it is skipped for " +
            "real devices, TV/wearable images and non-WSL hosts (the script log above says which " +
            "gate stopped it). TIZEN_HOMESCREEN_CHECK=force runs it anyway — unverified elsewhere."
        : null;
    default:
      return null;
  }
}

/**
 * Parse the HOMESCREEN_STATUS=<status> line emitted by
 * check_and_fix_homescreen() in tizen-emulator-manager.sh — the post-launch
 * check that detects the WSL home screen crash loop (Flutter home screen fails
 * EGL config selection when launched through launchpad), stops starter's retry
 * loop and popup, and starts the home screen directly.
 *
 * @param {string} output - combined script stdout/stderr
 * @returns {"ok"|"detected"|"fixed"|"popup_fixed"|"fix_failed"|null} null when
 *   the check did not apply (non-WSL host, non-emulator target, non-tizen
 *   platform, TIZEN_HOMESCREEN_CHECK=off, or an older script).
 */
function parseHomescreenStatus(output) {
  const m = String(output || "").match(
    /^HOMESCREEN_STATUS=(ok|detected|fixed|popup_fixed|fix_failed)$/m,
  );
  return m ? m[1] : null;
}

/**
 * Build the platform-specific script arguments for one emulator action.
 *
 * @returns {{winArgs: string[], unixArgs: string[]}}
 */
function buildEmulatorArgs({
  action,
  profile,
  vmName,
  platform,
  template,
  launch,
  skin,
  ramSize,
  fileSharingPath,
  hwVirtualization,
  hwGlAcceleration,
  customPath,
  rawImagePath,
  outputDir,
  compress,
  detail,
  count,
  timeoutSec,
  emulatorPath,
}) {
  const winArgs = [`-Action ${action}`, `-Profile ${profile}`];
  const unixArgs = [`-a ${action}`, `-p ${profile}`];

  if (vmName) {
    winArgs.push(`-VmName "${vmName}"`);
    unixArgs.push(`-n "${vmName}"`);
  }
  if (platform) {
    winArgs.push(`-Platform "${platform}"`);
    unixArgs.push(`-P "${platform}"`);
  }
  if (template) {
    winArgs.push(`-Template "${template}"`);
    unixArgs.push(`-T "${template}"`);
  }
  if (launch) {
    winArgs.push(`-Launch`);
    unixArgs.push(`-l`);
  }
  if (skin) {
    winArgs.push(`-Skin ${skin}`);
    unixArgs.push(`-s ${skin}`);
  }
  if (ramSize) {
    winArgs.push(`-RamSize ${ramSize}`);
    unixArgs.push(`-r ${ramSize}`);
  }
  if (fileSharingPath) {
    winArgs.push(`-FileSharingPath "${fileSharingPath}"`);
    unixArgs.push(`-f "${fileSharingPath}"`);
  }
  if (hwVirtualization) {
    winArgs.push(`-HwVirtualization ${hwVirtualization}`);
    unixArgs.push(`-w ${hwVirtualization}`);
  }
  if (hwGlAcceleration) {
    winArgs.push(`-HwGlAcceleration ${hwGlAcceleration}`);
    unixArgs.push(`-g ${hwGlAcceleration}`);
  }
  if (customPath) {
    winArgs.push(`-CustomPath "${customPath}"`);
    unixArgs.push(`-c "${customPath}"`);
  }
  if (rawImagePath) {
    winArgs.push(`-RawImagePath "${rawImagePath}"`);
    unixArgs.push(`-R "${rawImagePath}"`);
  }
  if (outputDir) {
    winArgs.push(`-OutputDir "${outputDir}"`);
    unixArgs.push(`-o "${outputDir}"`);
  }
  if (compress) {
    winArgs.push(`-Compress`);
    unixArgs.push(`-z`);
  }
  if (detail) {
    winArgs.push(`-Detail`);
    unixArgs.push(`-d`);
  }
  if (count) {
    winArgs.push(`-Count`);
    unixArgs.push(`-C`);
  }
  if (timeoutSec) {
    winArgs.push(`-Timeout ${timeoutSec}`);
    unixArgs.push(`-t ${timeoutSec}`);
  }
  if (emulatorPath) {
    winArgs.push(`-EmulatorPath "${emulatorPath}"`);
    unixArgs.push(`-E "${emulatorPath}"`);
  }

  return { winArgs, unixArgs };
}

/**
 * Run the emulator script for one action and return its stdout.
 */
/** Actions that only read em-cli state; a hang there is a broken host, not work. */
const READ_ONLY_EMCLI_ACTIONS = [
  "list-vm",
  "list-platform",
  "list-template",
  "detail",
];

/**
 * Wall-clock cap for read-only script runs. The scripts already cap each
 * em-cli call (TIZEN_EMCLI_TIMEOUT / TIZEN_EMCLI_TIMEOUT_MS, 120 s); this is
 * the outer safety net so a hung JVM (issue #82, Windows list-vm) yields an
 * envelope instead of execPluginScript's 30-minute default.
 */
const READ_ONLY_SCRIPT_TIMEOUT_MS =
  parseInt(process.env.TIZEN_EMCLI_LIST_TIMEOUT_MS, 10) || 180000;

function runEmulatorScript(scriptPath, args) {
  const { winArgs, unixArgs } = buildEmulatorArgs(args);
  const readOnly = READ_ONLY_EMCLI_ACTIONS.includes(args && args.action);
  return execPluginScript(scriptPath, winArgs.join(" "), unixArgs.join(" "), {
    captureViaTempFile: true,
    ...(readOnly ? { timeout: READ_ONLY_SCRIPT_TIMEOUT_MS } : {}),
  });
}

/**
 * Parse the TEMPLATE_DETAIL= lines emitted by the list-template action into
 * template records. em-cli repeats some templates, so duplicates by name are
 * dropped (first wins).
 *
 * Each line is `TEMPLATE_DETAIL=<name>|<profile>|<resolution>|<ram>`.
 *
 * @param {string} output - Raw script stdout
 * @returns {Array<{name: string, profile: string, resolution: string, size: string, ram: string}>}
 */
function parseTemplateDetails(output) {
  if (!output) return [];

  const seen = new Set();
  const details = [];

  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^TEMPLATE_DETAIL=(.*)$/);
    if (!match) continue;

    const [name, profile, resolution, ram] = match[1].split("|");
    const trimmedName = (name || "").trim();
    if (!trimmedName || seen.has(trimmedName)) continue;

    // em-cli prints its errors ("Error: foo does not match any platform") as
    // unindented lines, which look exactly like a template name to the block
    // parser. A real template always reports a WxH resolution, so require one
    // — otherwise a failed lookup turns into a bogus zero-size "template" and
    // the caller gets "size not available" instead of the actual error.
    const trimmedResolution = (resolution || "").trim();
    if (!/^\d{3,5}\s*[xX]\s*\d{3,5}$/.test(trimmedResolution)) continue;

    seen.add(trimmedName);

    details.push({
      name: trimmedName,
      profile: (profile || "").trim(),
      resolution: trimmedResolution,
      size: templateSizeKey(trimmedName, trimmedResolution),
      ram: (ram || "").trim(),
    });
  }

  return details;
}

/**
 * Parse the pipe-delimited `<PREFIX>=<header>|<v1>|<v2>|...` lines the script
 * emits for the -d block formats into objects.
 *
 * The script already did the hard part (joining em-cli's wrapped values, and
 * dropping its unindented "Error:" lines), so this is a plain split. Missing
 * trailing fields come back as "" rather than undefined, so callers can render
 * them without null checks.
 *
 * @param {string} output - Raw script stdout
 * @param {string} prefix - Line prefix, e.g. "VM_DETAIL"
 * @param {string[]} fields - Property names for the values after the header
 * @param {string} headerField - Property name for the leading header value
 * @returns {Array<object>}
 */
function parsePipeRecords(output, prefix, fields, headerField = "name") {
  if (!output) return [];

  const records = [];
  const pattern = new RegExp(`^${prefix}=(.*)$`);

  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;

    const parts = match[1].split("|");
    const header = (parts[0] || "").trim();
    if (!header) continue;

    const record = { [headerField]: header };
    fields.forEach((field, index) => {
      record[field] = (parts[index + 1] || "").trim();
    });
    records.push(record);
  }

  return records;
}

/**
 * Parse the PLATFORM_LIST=<csv> line of the list-platform action. The script
 * has already filtered by profile (tv → tv-* images, tizen → everything else).
 *
 * @param {string} output - Raw script stdout
 * @returns {string[]}
 */
function parsePlatformList(output) {
  const match = String(output || "").match(/^PLATFORM_LIST=(.*)$/m);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The platform a create uses when the caller named none — the same rule the
 * scripts' own auto-detect applies: tv → the first tv-* image, otherwise the
 * first non-tv image. Returns null when nothing suitable is installed.
 *
 * @param {string[]} platforms - names from parsePlatformList()
 * @param {string} profile - 'tizen' or 'tv'
 * @returns {string|null}
 */
function pickPlatform(platforms, profile) {
  if (!Array.isArray(platforms) || platforms.length === 0) return null;
  const isTv = (p) => /^tv/i.test(p);
  const pick =
    profile === "tv"
      ? platforms.find(isTv)
      : platforms.find((p) => !isTv(p)) || null;
  return pick || null;
}

/**
 * Parse VM_DETAIL= lines emitted by list-vm --detail, detail, create, and modify.
 */
function parseVmDetails(output) {
  return parsePipeRecords(output, "VM_DETAIL", [
    "platform",
    "template",
    "resolution",
    "ram",
    "cpu_arch",
    "cpu_count",
    "type",
    "skin_path",
  ]);
}

/**
 * Parse PLATFORM_DETAIL= lines emitted by list-platform --detail.
 */
function parsePlatformDetails(output) {
  return parsePipeRecords(output, "PLATFORM_DETAIL", [
    "profile",
    "version",
    "cpu_arch",
    "skin_shape",
    "image_path",
  ]);
}

/**
 * Parse MANAGER_DETAIL= lines emitted by the detail action with no VM name.
 *
 * Unlike the other blocks this is a single record, so it comes back as one flat
 * key/value object keyed by em-cli's own labels ("Version", "Workspace path").
 */
function parseManagerDetails(output) {
  if (!output) return {};

  const info = {};
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^MANAGER_DETAIL=(.*)$/);
    if (!match) continue;
    const separator = match[1].indexOf("|");
    if (separator === -1) continue;
    const key = match[1].slice(0, separator).trim();
    if (key) info[key] = match[1].slice(separator + 1).trim();
  }
  return info;
}

/**
 * Derive the size key a user would ask for from a template.
 *
 * The name's own number is authoritative: "HD3840 TV" is 3840x1080, so keying
 * off the resolution height would make it collide with "HD1080 TV".
 * Falls back to the resolution height for templates named without a number.
 */
function templateSizeKey(name, resolution) {
  const fromName = name.match(/(\d{3,5})/);
  if (fromName) return fromName[1];

  const fromResolution = resolution.match(/^(\d{3,5})\s*[xX]\s*(\d{3,5})$/);
  return fromResolution ? fromResolution[2] : "";
}

/**
 * Normalize a user-supplied size into a comparable key.
 *
 * Accepts "1080", "1080p", "HD1080", " 1080 " → "1080", and passes a full
 * "1920x1080" resolution through as "1920x1080".
 *
 * @param {string|number} input
 * @returns {string} Normalized size, or "" when the input is unusable
 */
function normalizeSize(input) {
  if (input === undefined || input === null) return "";

  const raw = String(input).trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return "";

  const resolution = raw.match(/^(\d{3,5})[x*](\d{3,5})$/);
  if (resolution) return `${resolution[1]}x${resolution[2]}`;

  const size = raw.match(/^(?:hd)?(\d{3,5})p?$/);
  return size ? size[1] : "";
}

/**
 * Pick the template that provides the requested size for a profile.
 *
 * @param {Array} details - Records from parseTemplateDetails()
 * @param {string} size - Normalized size ("1080" or "1920x1080")
 * @param {string} profile - 'tizen' or 'tv'
 * @returns {object|null} The matching template record, or null
 */
function matchTemplateForSize(details, size, profile) {
  if (!size || !Array.isArray(details) || details.length === 0) return null;

  // em-cli's own profile field is authoritative; tolerate templates that
  // report no profile rather than dropping them.
  const candidates = details.filter((t) => !t.profile || t.profile === profile);
  const pool = candidates.length > 0 ? candidates : details;

  const isResolution = size.includes("x");
  const matches = pool.filter((t) =>
    isResolution ? t.resolution.toLowerCase() === size : t.size === size,
  );
  if (matches.length === 0) return null;

  // Prefer the plain name over a platform-qualified duplicate such as
  // "HD1080 TV (tv-samsung-10.0-x86_64)" — em-cli accepts either, but the
  // plain one is what its own docs use.
  return matches.find((t) => !t.name.includes("(")) || matches[0];
}

/**
 * Render the available sizes for an error message the caller can show the user.
 */
function describeAvailableSizes(details) {
  return details
    .filter((t) => t.size)
    .map((t) => `${t.size} (${t.resolution}, ${t.name})`)
    .join(", ");
}

/**
 * Create / list / delete a custom Tizen emulator VM via em-cli.
 *
 * @param {object} opts - Options object
 * @param {string} [opts.action='create'] - Action: 'create' | 'list-platform' | 'list-template' | 'list-vm' | 'delete'
 * @param {string} [opts.vmName] - Emulator VM name (required for create/delete)
 * @param {string} [opts.platform] - Platform image name (auto-detect if omitted for create)
 * @param {string} [opts.template] - Exact template name; overrides opts.size when given
 * @param {string} [opts.size] - Screen size to create at: '1080', '720', '3840', or '1920x1080'.
 *   Required for the create action (unless opts.template or opts.assumeDefaults is set) — the size is
 *   a user choice, so omitting it returns a 'user_input_required' failure instead of silently using 1080.
 * @param {boolean} [opts.assumeDefaults=false] - Opt in to the default size ('1080') without being asked.
 *   For non-interactive callers only; an interactive caller should ask the user instead.
 * @param {string} [opts.profile='tizen'] - Profile: 'tizen' or 'tv'
 * @param {boolean} [opts.launch=false] - Launch the VM after creating (create action only)
 * @returns {object} Standard JSON Envelope
 */
async function createEmulator(
  opts = {},
  command = "tizen-sdk create-emulator",
) {
  const action = opts.action || "create";
  const vmName = opts.vmName;
  // `let`: a create without --platform resolves it below (issue #48).
  let platform = opts.platform;
  const profile = opts.profile || "tizen";
  const launch = opts.launch === true || opts.launch === "true";
  const assumeDefaults =
    opts.assumeDefaults === true || opts.assumeDefaults === "true";

  // A template name copied straight out of `list-template` can carry a
  // platform suffix — "HD1080 TV (tv-samsung-10.0-x86_64)". em-cli resolves the
  // plain name, so drop the suffix instead of rejecting the round-tripped value.
  let template = opts.template
    ? String(opts.template)
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim()
    : undefined;

  const startTime = Date.now();

  try {
    // Validate action
    const validActions = [
      "create",
      "list-platform",
      "list-template",
      "list-vm",
      "delete",
    ];
    if (!validActions.includes(action)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid action: ${action}. Must be one of: ${validActions.join(", ")}.`,
      );
    }

    // Validate profile
    if (profile !== "tizen" && profile !== "tv") {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid profile: ${profile}. Must be 'tizen' or 'tv'.`,
      );
    }

    // Validate vmName for create/delete
    if ((action === "create" || action === "delete") && !vmName) {
      return formatError(
        command,
        "invalid_parameters",
        `vmName is required for action '${action}'.`,
        action === "create"
          ? `tizen-sdk emulator-manager --action create --vm-name <name>`
          : `tizen-sdk emulator-manager --action list-vm`,
      );
    }

    // Validate vmName characters (shell safety)
    if (vmName && !NAME_PATTERN.test(vmName)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid VM name: ${vmName}. Use only letters, digits, dot, underscore, hyphen.`,
      );
    }

    // Validate platform characters if provided
    if (platform && !NAME_PATTERN.test(platform)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid platform name: ${platform}. Use only letters, digits, dot, underscore, hyphen.`,
      );
    }

    // Validate template characters if provided (spaces allowed — template names can contain spaces)
    if (template) {
      const trimmedTemplate = template.trim();
      if (!trimmedTemplate || !TEMPLATE_PATTERN.test(trimmedTemplate)) {
        return formatError(
          command,
          "invalid_parameters",
          `Invalid template name: ${template}. Use only letters, digits, dot, underscore, hyphen, space.`,
        );
      }
    }

    const optionError = validatePassThroughOptions(opts, command);
    if (optionError) return optionError;

    // Validate the requested size before doing any work
    const requestedSize =
      opts.size === undefined || opts.size === null || opts.size === ""
        ? undefined
        : normalizeSize(opts.size);
    if (
      opts.size !== undefined &&
      opts.size !== null &&
      opts.size !== "" &&
      !requestedSize
    ) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid size: ${opts.size}. Use a height like 1080, 720, 3840 (or a full resolution like 1920x1080). ` +
          `Run action 'list-template' to see the sizes this SDK supports.`,
      );
    }

    const resolved = resolveScript("tizen-emulator-manager");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    // Hardware/skin options are passed through to em-cli. Their values were
    // screened by validatePassThroughOptions() above — the script re-checks them,
    // but that check runs too late to keep an injected value out of the shell.
    const hardware = {
      skin: opts.skin,
      ramSize: opts.ramSize,
      fileSharingPath: opts.fileSharingPath,
      hwVirtualization: opts.hwVirtualization,
      hwGlAcceleration: opts.hwGlAcceleration,
      customPath: opts.customPath,
      rawImagePath: opts.rawImagePath,
    };

    // Resolve the requested size to a template. em-cli create has no
    // width/height flag — resolution is a property of the device template — so
    // the size is applied by picking the template that carries it.
    // An explicit template always wins; no size lookup is needed then.
    // When a raw image path is given, the disk image comes from the raw image,
    // so no template/size resolution is needed — em-cli create -a bypasses the
    // template entirely.
    const explicitTemplate = Boolean(template);
    const sizeWarnings = [];
    let matchedTemplate = null;

    if (explicitTemplate && requestedSize) {
      sizeWarnings.push(
        `Both a template ('${template}') and a size (${requestedSize}) were given — the template wins, ` +
          `so the size was not used. Pass only one.`,
      );
    }
    if (action === "create" && !template && !opts.rawImagePath) {
      let details = [];
      let listErrorMessage = null;

      // No --platform: resolve it HERE, from em-cli's own platform list, instead
      // of leaving it to the script's auto-detect. Templates are looked up per
      // platform (bug-044: profile-based "HD1080 Tizen" does not exist on
      // "mobile-7.0-x86"), so with no platform the size→template step used to be
      // skipped and `create --size 1080` silently produced em-cli's default
      // 720x1280 VM (issue #48). Same pick rule as the scripts: tv → first tv
      // image; otherwise the first non-tv image. The resolved name is passed
      // down as -P, so the script's own auto-detect (one more JVM) is skipped.
      if (!platform) {
        try {
          const listed = parsePlatformList(
            runEmulatorScript(resolved.scriptPath, {
              action: "list-platform",
              profile,
            }),
          );
          platform = pickPlatform(listed, profile);
          if (!platform) {
            return formatError(
              command,
              "execution_error",
              profile === "tv"
                ? "No TV emulator platform image is installed — cannot create a TV VM. " +
                    "Install the TV SDK extension (tizen-tv-sdk-install), then retry."
                : "No emulator platform image is installed — cannot create a VM. " +
                    "Install one with tizen-sdk-install (e.g. the tizen-10.0-x86_64 emulator image), then retry.",
              null,
              startTime,
            );
          }
          sizeWarnings.push(
            `No platform was given; resolved to '${platform}' (the first ${profile} platform ` +
              `em-cli lists) so the requested size could be applied.`,
          );
        } catch (error) {
          // Listing failed (em-cli hiccup) — let the script auto-detect, at the
          // cost of the size possibly not applying; the warning below says so.
          listErrorMessage = error.message;
        }
      }

      if (platform) {
        try {
          details = parseTemplateDetails(
            runEmulatorScript(resolved.scriptPath, {
              action: "list-template",
              profile,
              platform,
            }),
          );
        } catch (error) {
          // Listing failed (old SDK, em-cli hiccup) — fall back to today's
          // behaviour and let em-cli pick the template itself.
          listErrorMessage = error.message;
        }
      }

      // The screen size is a USER CHOICE, so refuse to guess it. Without an
      // explicit size, the caller must either ask the user or opt in to the
      // default on purpose (assumeDefaults) — silently picking 1080 is how the
      // question ends up never being asked.
      if (!requestedSize && !assumeDefaults) {
        const supported =
          details.length > 0 ? describeAvailableSizes(details) : null;
        return formatError(
          command,
          "user_input_required",
          `No screen size was given. Ask the user which screen size to create at, then pass it as 'size'. ` +
            (supported
              ? `Supported sizes for profile '${profile}' on platform '${platform}': ${supported}. `
              : supported === null && !platform
                ? `No platform was specified, so available sizes are unknown. Pass a platform with --platform. `
                : "") +
            `Default (offer this one first): ${DEFAULT_SIZE}. ` +
            `For a non-interactive run, pass size=${DEFAULT_SIZE} explicitly or assumeDefaults=true.`,
          `tizen-sdk create-emulator --action create --vm-name ${vmName} --size ${DEFAULT_SIZE}${platform ? " --platform " + platform : ""}`,
          startTime,
        );
      }

      const size = requestedSize || DEFAULT_SIZE;
      if (listErrorMessage) {
        sizeWarnings.push(
          `Could not list ${platform ? "templates" : "platforms"} to apply size ${size} (${listErrorMessage}) — em-cli will choose the screen size.`,
        );
      }

      if (details.length > 0) {
        matchedTemplate = matchTemplateForSize(details, size, profile);
        if (!matchedTemplate) {
          return formatError(
            command,
            "invalid_parameters",
            `Size ${size} is not available for profile '${profile}'${platform ? ` on platform '${platform}'` : ""}. Supported sizes: ` +
              `${describeAvailableSizes(details) || "none reported by em-cli"}.`,
          );
        }
        template = matchedTemplate.name;
      } else if (sizeWarnings.length === 0 && !platform) {
        sizeWarnings.push(
          `No platform specified, so available templates are unknown — em-cli will choose the screen size.`,
        );
      } else if (sizeWarnings.length === 0 && platform) {
        sizeWarnings.push(
          `em-cli reported no templates for platform '${platform}', so size ${size} could not be applied — em-cli will choose the screen size.`,
        );
      }
    }

    console.error(
      `[tizen-emulator] Action: ${action}, profile: ${profile}` +
        (vmName ? `, vm: ${vmName}` : "") +
        (platform ? `, platform: ${platform}` : "") +
        (template ? `, template: ${template}` : "") +
        (matchedTemplate
          ? ` (size ${matchedTemplate.size}, ${matchedTemplate.resolution})`
          : "") +
        (launch ? `, launch: yes` : ""),
    );

    let output;
    try {
      output = runEmulatorScript(resolved.scriptPath, {
        action,
        profile,
        vmName,
        platform,
        template,
        launch,
        detail: opts.detail,
        count: opts.count,
        ...hardware,
      });
    } catch (error) {
      // The script's real diagnostics land in the temp file that
      // execPluginScript attaches to error.stdout. They must reach the
      // envelope: without them the message is only "Command failed: bash …
      // > /tmp/tizen-plugin-*.out", which tells the caller nothing and sends
      // it off to cat temp files or improvise raw em-cli commands.
      const scriptOutput = `${error.stdout || ""}\n${error.stderr || ""}`;

      // The most common create failure, and the one with a clear user action.
      const existsMatch = scriptOutput.match(/VM '(.+?)' already exists/i);
      if (existsMatch) {
        return formatError(
          command,
          "invalid_parameters",
          `An emulator VM named '${existsMatch[1]}' already exists. ` +
            `Use a different name, or delete that VM first.`,
          `node emulator-manager-cli.js delete --vm-name ${existsMatch[1]}`,
          startTime,
        );
      }

      // create --launch: the create half succeeded but the launch half failed
      // and ran diagnose_launch_failure(). Report it as the launch action
      // would — host-fix guide first — instead of a bare exec error, and say
      // clearly that the VM exists (the user should relaunch, not re-create).
      const diag = parseLaunchDiagnostics(scriptOutput);
      const createdMatch = scriptOutput.match(/^VM_CREATED=(.+)$/m);
      if (diag && createdMatch) {
        const createdVm = createdMatch[1].trim();
        return formatError(
          command,
          "emulator_boot_failed",
          `VM '${createdVm}' was created, but launching it failed. The VM exists — after fixing ` +
            `the host (see details), relaunch it instead of re-creating: ` +
            `node emulator-manager-cli.js launch --vm-name ${createdVm}.`,
          launchDiagnosisSuggestedFix(diag, createdVm),
          startTime,
          launchDiagnosisDetails(diag, scriptOutput),
        );
      }

      // em-cli crashed with NoSuchFieldError/NoSuchMethodError (emulator-manager
      // core vs platform emulator plugin version mismatch), or the pre-create
      // probe gate refused to start (EMCLI_MISMATCH=1). Same fix either way:
      // update the SDK packages, then retry — so return a dedicated category
      // with an executable suggested_fix instead of a bare execution_error.
      const gateRefused = /^EMCLI_MISMATCH=1$/m.test(scriptOutput);
      if (
        gateRefused ||
        JAVA_VERSION_MISMATCH_PATTERN.test(emcliOutputOf(scriptOutput))
      ) {
        return formatError(
          command,
          "package_version_mismatch",
          `Emulator ${action} failed: ${
            gateRefused
              ? "the pre-create em-cli probe found an emulator-manager core vs platform emulator " +
                "plugin version mismatch (NoSuchFieldError/NoSuchMethodError), so the create was " +
                "refused before touching any VM (set TIZEN_EMCLI_GATE=off to bypass the gate)."
              : `${error.message}.${javaJnaHint(emcliOutputOf(scriptOutput))}`
          } Caution: the package update overwrites the platform's emulator-v2/bin host libraries — ` +
            `re-apply any manual workarounds there after updating.`,
          versionMismatchFix(action, {
            vmName,
            platform,
            profile,
            template,
            size: opts.size,
            launch,
          }),
          startTime,
          rawOutputTail(scriptOutput),
        );
      }

      const diagnostics = summarizeEmulatorOutput(scriptOutput).slice(0, 6);
      return formatError(
        command,
        "execution_error",
        `Emulator ${action} failed: ${error.message}.${javaJnaHint(emcliOutputOf(scriptOutput))}${emcliExitHint(scriptOutput)}` +
          (diagnostics.length
            ? ` Script output: ${diagnostics.join(" | ")}`
            : ""),
        null,
        startTime,
        rawOutputTail(scriptOutput),
      );
    }

    // Parse output based on action
    if (action === "list-platform") {
      const platforms = [];
      const platformMatch = output.match(/^PLATFORM_LIST=(.+)$/m);
      if (platformMatch) {
        platforms.push(
          ...platformMatch[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success(
        {
          platforms,
          // Only populated when the caller asked for --detail; an empty array
          // means "not requested", not "none exist".
          platform_details: parsePlatformDetails(output),
          count: platforms.length,
          profile,
        },
        { warnings: summarizeEmulatorOutput(output) },
      );
    }

    if (action === "list-template") {
      const templates = [];
      const templateMatch = output.match(/^TEMPLATE_LIST=(.+)$/m);
      if (templateMatch) {
        templates.push(
          ...templateMatch[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      // template_details carries the resolution of each template, which is what
      // lets the caller offer real screen sizes instead of opaque names.
      const templateDetails = parseTemplateDetails(output);
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success(
        {
          templates,
          template_details: templateDetails,
          available_sizes: [
            ...new Set(templateDetails.map((t) => t.size).filter(Boolean)),
          ],
          default_size: DEFAULT_SIZE,
          count: templates.length,
          profile,
        },
        { warnings: summarizeEmulatorOutput(output) },
      );
    }

    if (action === "list-vm") {
      const vms = [];
      const vmMatch = output.match(/^VM_LIST=(.+)$/m);
      if (vmMatch) {
        vms.push(
          ...vmMatch[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }
      // list-vm --count short-circuits in the script: it prints VM_COUNT= only.
      const countMatch = output.match(/^VM_COUNT=(\d+)$/m);
      const reportedCount = countMatch ? Number(countMatch[1]) : vms.length;

      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success(
        {
          vms,
          // Only populated when the caller asked for --detail. This is where the
          // resolution and RAM of each existing VM come from.
          vm_details: parseVmDetails(output),
          count: reportedCount,
        },
        { warnings: summarizeEmulatorOutput(output) },
      );
    }

    if (action === "delete") {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success(
        { vm_name: vmName, action: "delete", status: "deleted" },
        { warnings: summarizeEmulatorOutput(output) },
      );
    }

    // action === "create"
    const createdMatch = output.match(/^VM_CREATED=(.+)$/m);
    const createdVmName = createdMatch ? createdMatch[1].trim() : vmName;
    const launchedMatch = output.match(/^VM_LAUNCHED=(.+)$/m);
    const launchedSerial = launchedMatch ? launchedMatch[1].trim() : null;

    // Check if the script reported a cleanup (partial VM deleted after failed create)
    const cleanupMatch = output.match(/Cleaning up partial VM/i);

    // create --launch where the emulator never connected: the script exits 0
    // with a warning (the VM exists), but reporting `launched: true` with no
    // serial made a boot timeout read as a success (issue #48).
    const launchTimedOut = launch && !launchedSerial && !cleanupMatch;
    if (launchTimedOut) {
      sizeWarnings.push(
        `VM '${createdVmName}' was created, but the emulator did not connect to sdb within the ` +
          `launch wait — it may still be booting, or the boot failed. Check or relaunch with: ` +
          `node emulator-manager-cli.js launch --vm-name ${createdVmName}`,
      );
    }

    // The script dropped the template and retried (TV profile), so the VM exists
    // but not at the requested size.
    const fallbackMatch = output.match(/^TEMPLATE_FALLBACK=(.+)$/m);
    if (fallbackMatch) {
      sizeWarnings.push(
        `Template '${fallbackMatch[1].trim()}' was rejected by em-cli, so the VM was created at em-cli's ` +
          `default size. Apply the size later with: em-cli modify -n ${createdVmName} -t "${fallbackMatch[1].trim()}".`,
      );
    }

    // create --launch shares the pre-launch auto-heal with the launch action.
    const healedVm = parseHwVirtAutofix(output);
    if (healedVm) sizeWarnings.push(hwVirtAutofixWarning(healedVm));

    // ...and the post-launch home screen check, for the same reason: a freshly
    // created VM is the most likely one to hit the WSL crash loop, and
    // create --launch is the first command most users run.
    const createHomescreenStatus = parseHomescreenStatus(output);
    const createHomescreenWarning = homescreenFixWarning(
      createHomescreenStatus,
      {
        serial: launchedSerial,
        vmName: createdVmName,
      },
    );
    if (createHomescreenWarning) sizeWarnings.push(createHomescreenWarning);

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        vm_name: createdVmName,
        platform: platform || "auto-detected",
        // template field rules:
        //  - If TEMPLATE_FALLBACK detected: null (template was rejected by em-cli)
        //  - If explicit template provided: the template name
        //  - Otherwise: null (size-based creation, no template specified)
        template: fallbackMatch ? null : template || null,
        // size field rules:
        //  - If explicit template: null (size selection is bypassed)
        //  - If size requested: the requested size (e.g., "1080")
        //  - Otherwise: default size (e.g., "1080")
        size: explicitTemplate ? null : requestedSize || DEFAULT_SIZE,
        // resolution field rules:
        //  - If TEMPLATE_FALLBACK: null (template was rejected, no size applied)
        //  - If matchedTemplate exists: the resolution from that template (e.g., "1920x1080")
        //  - Otherwise: null (no template matched the requested size, or explicit template used)
        resolution:
          fallbackMatch || !matchedTemplate ? null : matchedTemplate.resolution,
        // size_applied field rules:
        //  - true: only when size was requested AND matched AND no fallback AND not explicit template
        //  - false: otherwise (explicit template, fallback, unavailable size, or no match)
        // When size_applied is false but size is reported, the requested size is not available.
        // When size_applied is false and size is null, either a template was explicit or fallback occurred.
        size_applied:
          !explicitTemplate && !fallbackMatch && Boolean(matchedTemplate),
        // What the VM actually ended up with, read back from em-cli after the
        // create. Unlike the fields above this is observed, not inferred, so it
        // is the honest answer to "did my size/RAM take effect?".
        vm_detail: parseVmDetails(output)[0] || null,
        profile: profile,
        // Observed, not requested: true only when the script reported a serial.
        launched: Boolean(launchedSerial),
        device_serial: launchedSerial,
        raw_image_path: opts.rawImagePath || null,
        status: cleanupMatch
          ? "create_failed_cleaned_up"
          : launchTimedOut
            ? "created_launch_timeout"
            : "created",
        ...(createHomescreenStatus
          ? { homescreen_fix: createHomescreenStatus }
          : {}),
      },
      {
        warnings: [...sizeWarnings, ...summarizeEmulatorOutput(output)],
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to manage emulator: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Launch an existing Tizen emulator VM via em-cli.
 *
 * If no vmName is given, launches the first VM from `em-cli list-vm`.
 * After launching, waits for the emulator to connect via sdb.
 *
 * @param {object} opts - Options object
 * @param {string} [opts.vmName] - Emulator VM name to launch (default: first VM from list-vm)
 * @param {number|string} [opts.timeoutSec=300] - Emulator connection wait time (seconds, 1-540)
 * @returns {object} Standard JSON Envelope
 */
async function launchEmulator(
  opts = {},
  command = "tizen-sdk launch-emulator",
) {
  const vmName = opts.vmName;
  const timeoutSec = opts.timeoutSec || 300;
  const startTime = Date.now();

  try {
    const timeout = parseInt(timeoutSec, 10);
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 540) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid timeout: ${timeoutSec}. Must be 1-540 seconds (Bash tool max is 600s; leave headroom).`,
      );
    }

    // Validate vmName characters if provided (shell safety)
    if (vmName && !NAME_PATTERN.test(vmName)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid VM name: ${vmName}. Use only letters, digits, dot, underscore, hyphen.`,
      );
    }

    // emulatorPath is a path option and reaches the script inside double quotes.
    const optionError = validatePassThroughOptions(opts, command);
    if (optionError) return optionError;

    const resolved = resolveScript("tizen-emulator-manager");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    console.error(
      `[tizen-emulator] Launching VM${vmName ? `: ${vmName}` : " (first from list)"}, wait up to ${timeout}s`,
    );

    let output;
    try {
      // captureViaTempFile required: long-lived processes spawned by script
      // (emulator qemu, sdb server) inherit stdout pipe, and execSync blocks
      // forever waiting for pipe close even after script exits.
      output = runEmulatorScript(resolved.scriptPath, {
        action: "launch",
        profile: "tizen",
        vmName,
        timeoutSec: timeout,
        emulatorPath: opts.emulatorPath,
      });
    } catch (error) {
      const combined = `${error.stdout || ""}\n${error.stderr || ""}`;

      // The script's diagnostics land in the temp file execPluginScript attaches
      // to error.stdout. Surface the actionable ones by name, otherwise the
      // caller only sees "Command failed: bash … > /tmp/tizen-plugin-*.out".
      const notFound = combined.match(/VM '(.+?)' not found/i);
      if (notFound) {
        return formatError(
          command,
          "emulator_not_found",
          `No emulator VM named '${notFound[1]}' exists. Create it first, or launch a different one.`,
          `node emulator-manager-cli.js list-vm`,
          startTime,
        );
      }
      if (/No emulator VMs found/i.test(combined)) {
        return formatError(
          command,
          "emulator_not_found",
          `No emulator VMs exist yet — create one before launching.`,
          `node emulator-manager-cli.js create --vm-name my-vm --size 1080`,
          startTime,
        );
      }

      // The script ran diagnose_launch_failure() — turn its LAUNCH_DIAG lines
      // into a structured boot-failure envelope instead of a bare exec error.
      const diag = parseLaunchDiagnostics(combined);
      if (diag) {
        return formatError(
          command,
          "emulator_boot_failed",
          diag.phase === "connect_timeout"
            ? `Emulator launch failed: the VM started but never connected to sdb within ${timeout}s. See details for the boot diagnosis.`
            : `Emulator launch failed: em-cli reported a launch error. See details for the boot diagnosis.`,
          launchDiagnosisSuggestedFix(diag, vmName),
          startTime,
          launchDiagnosisDetails(diag, combined),
        );
      }

      const diagnostics = summarizeEmulatorOutput(combined).slice(0, 6);
      return formatError(
        command,
        "execution_error",
        `Emulator launch failed: ${error.message}.${javaJnaHint(emcliOutputOf(combined))}${emcliExitHint(combined)}` +
          (diagnostics.length
            ? ` Script output: ${diagnostics.join(" | ")}`
            : ""),
        null,
        startTime,
        rawOutputTail(combined),
      );
    }

    // Parse DEVICE_SERIAL=... line from script output
    const serialMatch = output.match(/^DEVICE_SERIAL=(.+)$/m);
    if (!serialMatch) {
      return formatError(
        command,
        "emulator_not_found",
        "Script exited successfully but printed no DEVICE_SERIAL=... line.",
        null,
        startTime,
      );
    }
    const serial = serialMatch[1].trim();

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    const warnings = summarizeEmulatorOutput(output);

    // Pre-launch auto-heal: the script re-enabled hwVirtualization on a VM
    // whose profile disabled it — report what happened and that it stuck.
    const healedVm = parseHwVirtAutofix(output);
    if (healedVm) warnings.push(hwVirtAutofixWarning(healedVm));

    // The script bounced a wedged sdb server to make the booted emulator
    // visible — the launch succeeded, but the restart reset every other sdb
    // connection, so the caller deserves to know it happened.
    if (/^SDB_SERVER_RESTARTED=1$/m.test(output)) {
      warnings.push(
        "The sdb server was not seeing the booted emulator and was restarted " +
          "(sdb kill-server / start-server) to pick it up. Any other sdb connections were reset.",
      );
    }

    // Post-launch findings on a successful boot (e.g. virgl scanout failing:
    // display black despite boot + sdb OK) — see LAUNCH_WARN in the script.
    for (const key of parseLaunchWarnings(output)) {
      warnings.push(launchWarningText(key));
    }

    // Post-launch home screen check (WSL + tizen emulator only): the script
    // detects the crash loop, masks starter to stop its retry loop and popup,
    // reclaims the crash dumps, and starts the home screen directly — see
    // check_and_fix_homescreen in tizen-emulator-manager.sh. Here we only
    // report what it found and did.
    const homescreenStatus = parseHomescreenStatus(output);
    const homescreenWarning = homescreenFixWarning(homescreenStatus, {
      serial,
      vmName,
    });
    if (homescreenWarning) warnings.push(homescreenWarning);
    if (homescreenStatus === null && /wsl/i.test(output)) {
      // The check did not apply (TIZEN_HOMESCREEN_CHECK=off, non-tizen image, or
      // an older script) — keep the preventive note for WSL users.
      warnings.push(
        "WSL home screen note: if the home screen fails to start, apply the fix with the " +
          "fix-homescreen action, or use the TV profile instead: " +
          `em-cli modify -n ${vmName || "<vm>"} -P tv-<platform>-<version>-<arch>`,
      );
    }
    // homescreenStatus === "ok": checked and healthy — nothing to warn about.

    const data = {
      device_serial: serial,
      device_type: /^emulator-/i.test(serial) ? "emulator" : "usb",
      vm_name: vmName || null,
      status: "launched",
      // --timeout is the sdb-connect WAIT CAP, not a lifetime: the runner
      // returns as soon as the VM appears in `sdb devices` and never stops the
      // emulator afterwards (issue #98). Report both so a caller can see the
      // wait ended early rather than "nothing happened after N seconds".
      timeout_sec: timeout,
      waited_ms: Date.now() - startTime,
      emulator_keeps_running: true,
    };
    if (homescreenStatus) data.homescreen_fix = homescreenStatus;

    return envelope.success(data, { warnings });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to launch emulator: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Every action manageEmulator() accepts — the full em-cli command surface.
 */
const MANAGE_ACTIONS = [
  "create",
  "delete",
  "launch",
  "list-vm",
  "list-platform",
  "list-template",
  "detail",
  "modify",
  "reset",
  "create-image",
  "fix-homescreen",
];

/**
 * Apply the WSL home screen fix to an already running emulator, without a
 * relaunch. Same work the post-launch hook does: stop starter's retry loop and
 * its "Unable to launch" popup, reclaim the crash dumps that fill /opt, and
 * start the home screen directly (bypassing launchpad). The script owns the
 * gate — WSL + emulator serial + tizen platform — and simply emits no
 * HOMESCREEN_STATUS line when the fix does not apply.
 *
 * @param {object} opts - `vmName` optional; defaults to the first connected device
 * @param {string} command - envelope command label
 */
async function fixHomescreen(
  opts = {},
  command = "tizen-sdk emulator-manager fix-homescreen",
) {
  const vmName = opts.vmName;
  const startTime = Date.now();

  if (vmName && !NAME_PATTERN.test(vmName)) {
    return formatError(
      command,
      "invalid_parameters",
      `Invalid VM name: ${vmName}. Use only letters, digits, dot, underscore, hyphen.`,
      null,
      startTime,
    );
  }

  const resolved = resolveScript("tizen-emulator-manager");
  if (resolved.error)
    return formatError(command, "io_error", resolved.error, null, startTime);

  let output;
  try {
    output = runEmulatorScript(resolved.scriptPath, {
      action: "fix-homescreen",
      profile: "tizen",
      vmName,
    });
  } catch (error) {
    const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
    if (/No connected device|is not connected/i.test(combined)) {
      return formatError(
        command,
        "emulator_not_found",
        vmName
          ? `VM '${vmName}' is not connected. Launch it first.`
          : "No connected device. Launch an emulator first.",
        `node emulator-manager-cli.js launch${vmName ? ` --vm-name ${vmName}` : ""}`,
        startTime,
        rawOutputTail(combined),
      );
    }
    return formatError(
      command,
      "execution_error",
      `fix-homescreen failed: ${error.message}.`,
      null,
      startTime,
      rawOutputTail(combined),
    );
  }

  const envelope = new Envelope(command);
  envelope.startTime = startTime;
  const warnings = summarizeEmulatorOutput(output);
  const status = parseHomescreenStatus(output);
  const serial =
    (output.match(/^DEVICE_SERIAL=(.+)$/m) || [])[1]?.trim() || null;

  // Same wording as the launch path — explicit: true because the caller asked
  // for the fix, so "nothing to do" outcomes are the answer, not noise.
  const warning = homescreenFixWarning(status, {
    serial,
    vmName,
    explicit: true,
  });
  if (warning) warnings.push(warning);

  const data = { vm_name: vmName || null, action: "fix-homescreen" };
  if (serial) data.device_serial = serial;
  if (status) data.homescreen_fix = status;
  return envelope.success(data, { warnings });
}

/**
 * Properties `modify` can change. em-cli rejects a modify with no property, so
 * catching it here turns a cryptic failure into a usable message.
 */
const MODIFY_PROPERTIES = [
  "template",
  "size",
  "skin",
  "ramSize",
  "fileSharingPath",
  "hwVirtualization",
  "hwGlAcceleration",
];

/**
 * Manage a Tizen emulator VM across the full em-cli surface.
 *
 * create / delete / list-* delegate to createEmulator() and launch delegates to
 * launchEmulator(); those paths are long-standing and unchanged. The remaining
 * actions — detail, modify, reset, create-image — are implemented here.
 *
 * @param {object} opts
 * @param {string} [opts.action='create'] - One of MANAGE_ACTIONS
 * @param {string} [opts.vmName] - VM name (required for every action except detail and the list-*)
 * @param {string} [opts.platform] - Platform image name
 * @param {string} [opts.template] - Exact template name; overrides opts.size
 * @param {string} [opts.size] - Screen size ('1080', '720', '1920x1080') for create/modify
 * @param {string} [opts.profile='tizen'] - 'tizen' or 'tv'
 * @param {string} [opts.skin] - Skin style number: '1' or '2'
 * @param {string} [opts.ramSize] - RAM in MiB: '512', '768', or '1024'
 * @param {string} [opts.fileSharingPath] - Host directory shared with the VM
 * @param {string} [opts.hwVirtualization] - 'yes' or 'no'
 * @param {string} [opts.hwGlAcceleration] - 'yes' or 'no'
 * @param {string} [opts.customPath] - Custom base disk image path (create)
 * @param {string} [opts.rawImagePath] - Raw disk image directory (create)
 * @param {string} [opts.outputDir] - Output directory (create-image); must already exist
 * @param {boolean} [opts.compress=false] - Compress the created image (create-image)
 * @param {boolean} [opts.confirm=false] - Required for reset, which is destructive
 * @param {boolean} [opts.detail=false] - Detail mode for the list-* actions
 * @param {boolean} [opts.count=false] - Count-only mode for list-vm
 * @returns {object} Standard JSON Envelope
 */
async function manageEmulator(
  opts = {},
  command = "tizen-sdk emulator-manager",
) {
  const action = opts.action || "create";

  if (!MANAGE_ACTIONS.includes(action)) {
    return formatError(
      command,
      "invalid_parameters",
      `Invalid action: ${action}. Must be one of: ${MANAGE_ACTIONS.join(", ")}.`,
    );
  }

  // These already implement their action end to end, warnings and all.
  if (action === "launch") return launchEmulator(opts, command);
  if (action === "fix-homescreen") return fixHomescreen(opts, command);
  if (!["detail", "modify", "reset", "create-image"].includes(action)) {
    return createEmulator({ ...opts, action }, command);
  }

  const vmName = opts.vmName;
  const profile = opts.profile || "tizen";
  const startTime = Date.now();

  try {
    if (vmName && !NAME_PATTERN.test(vmName)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid VM name: ${vmName}. Use only letters, digits, dot, underscore, hyphen.`,
      );
    }

    // platform reaches the script as -P "<value>" on both the main call and the
    // list-template lookup below, so it needs the same screen createEmulator()
    // gives it.
    if (opts.platform && !NAME_PATTERN.test(opts.platform)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid platform name: ${opts.platform}. Use only letters, digits, dot, underscore, hyphen.`,
      );
    }

    // detail is the one action that is meaningful without a VM: it then reports
    // the emulator manager's own version and workspace path.
    if (action !== "detail" && !vmName) {
      return formatError(
        command,
        "invalid_parameters",
        `vmName is required for action '${action}'.`,
        action === "create"
          ? `tizen-sdk emulator-manager --action create --vm-name <name>`
          : `tizen-sdk emulator-manager --action list-vm`,
      );
    }

    // reset formats the disk image and deletes every app installed on the VM.
    // That is a user's call to make, so refuse to infer it — same reasoning as
    // the screen-size gate in createEmulator().
    if (
      action === "reset" &&
      opts.confirm !== true &&
      opts.confirm !== "true"
    ) {
      return formatError(
        command,
        "user_input_required",
        `Resetting VM '${vmName}' formats its disk image and deletes every app installed on it. ` +
          `This cannot be undone. Ask the user to confirm, then pass confirm=true.`,
        `tizen-sdk emulator-manager --action reset --vm-name ${vmName} --confirm true`,
        startTime,
      );
    }

    if (action === "modify" && !MODIFY_PROPERTIES.some((key) => opts[key])) {
      return formatError(
        command,
        "invalid_parameters",
        `modify needs at least one property to change. Pass one or more of: ${MODIFY_PROPERTIES.join(", ")}.`,
      );
    }

    // A template name copied straight out of `list-template` can carry a
    // platform suffix — "HD1080 TV (tv-samsung-10.0-x86_64)". em-cli resolves the
    // plain name, so drop the suffix instead of rejecting the round-tripped value.
    let template = opts.template
      ? String(opts.template)
          .replace(/\s*\([^)]*\)\s*$/, "")
          .trim()
      : undefined;

    // Same screen createEmulator() applies. modify accepts a template too, and it
    // is rendered into the script command line the same way, so it needs the same
    // check — not just the suffix strip above. Both screens run before
    // resolveScript() so a bad option is reported as such even when the plugin
    // cache is missing.
    if (template && !TEMPLATE_PATTERN.test(template)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid template name: ${opts.template}. Use only letters, digits, dot, underscore, hyphen, space.`,
      );
    }

    const optionError = validatePassThroughOptions(opts, command);
    if (optionError) return optionError;

    const resolved = resolveScript("tizen-emulator-manager");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    const warnings = [];

    // modify accepts a size for the same reason create does: resolution lives on
    // the template, so changing the size means swapping the template.
    if (action === "modify" && opts.size) {
      if (template) {
        warnings.push(
          `Both a template ('${template}') and a size (${opts.size}) were given — the template wins, ` +
            `so the size was not used. Pass only one.`,
        );
      } else {
        const requestedSize = normalizeSize(opts.size);
        if (!requestedSize) {
          return formatError(
            command,
            "invalid_parameters",
            `Invalid size: ${opts.size}. Use a height like 1080, 720, 3840 (or a full resolution like 1920x1080). ` +
              `Run action 'list-template' to see the sizes this SDK supports.`,
          );
        }

        let details = [];
        try {
          details = parseTemplateDetails(
            runEmulatorScript(resolved.scriptPath, {
              action: "list-template",
              profile,
              platform: opts.platform,
            }),
          );
        } catch (error) {
          return formatError(
            command,
            "execution_error",
            `Could not list templates to resolve size ${requestedSize}: ${error.message}. ` +
              `Pass an exact template name instead.`,
            null,
            startTime,
          );
        }

        const matched = matchTemplateForSize(details, requestedSize, profile);
        if (!matched) {
          return formatError(
            command,
            "invalid_parameters",
            `Size ${requestedSize} is not available for profile '${profile}'. Supported sizes: ` +
              `${describeAvailableSizes(details) || "none reported by em-cli"}.`,
          );
        }
        template = matched.name;
      }
    }

    console.error(
      `[tizen-emulator] Action: ${action}` +
        (vmName ? `, vm: ${vmName}` : " (emulator manager)") +
        (template ? `, template: ${template}` : ""),
    );

    let output;
    try {
      output = runEmulatorScript(resolved.scriptPath, {
        action,
        profile,
        vmName,
        template,
        platform: opts.platform,
        skin: opts.skin,
        ramSize: opts.ramSize,
        fileSharingPath: opts.fileSharingPath,
        hwVirtualization: opts.hwVirtualization,
        hwGlAcceleration: opts.hwGlAcceleration,
        outputDir: opts.outputDir,
        compress: opts.compress === true || opts.compress === "true",
      });
    } catch (error) {
      // The script's real diagnostics land in the temp file that
      // execPluginScript attaches to error.stdout — without them the message is
      // only "Command failed: bash … > /tmp/tizen-plugin-*.out".
      const scriptOutput = `${error.stdout || ""}\n${error.stderr || ""}`;

      const notFound = scriptOutput.match(/VM '(.+?)' not found/i);
      if (notFound) {
        return formatError(
          command,
          "emulator_not_found",
          `No emulator VM named '${notFound[1]}' exists.`,
          `node emulator-manager-cli.js list-vm`,
          startTime,
        );
      }

      // em-cli refuses to write an image into a directory it did not find.
      if (/This directory does not exist/i.test(scriptOutput)) {
        return formatError(
          command,
          "io_error",
          `The output directory '${opts.outputDir}' does not exist. em-cli will not create it — ` +
            `make the directory first, then retry.`,
          null,
          startTime,
        );
      }

      const diagnostics = summarizeEmulatorOutput(scriptOutput).slice(0, 6);
      return formatError(
        command,
        "execution_error",
        `Emulator ${action} failed: ${error.message}.${javaJnaHint(emcliOutputOf(scriptOutput))}${emcliExitHint(scriptOutput)}` +
          (diagnostics.length
            ? ` Script output: ${diagnostics.join(" | ")}`
            : ""),
        null,
        startTime,
        rawOutputTail(scriptOutput),
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    const scriptWarnings = summarizeEmulatorOutput(output);

    if (action === "detail") {
      if (!vmName) {
        return envelope.success(
          { target: "emulator-manager", manager: parseManagerDetails(output) },
          { warnings: [...warnings, ...scriptWarnings] },
        );
      }
      const vmDetail = parseVmDetails(output)[0] || null;
      if (!vmDetail) {
        return formatError(
          command,
          "emulator_not_found",
          `em-cli returned no detail block for VM '${vmName}'.`,
          `node emulator-manager-cli.js list-vm`,
          startTime,
        );
      }
      return envelope.success(
        { target: "vm", vm_name: vmName, vm_detail: vmDetail },
        { warnings: [...warnings, ...scriptWarnings] },
      );
    }

    if (action === "modify") {
      return envelope.success(
        {
          vm_name: vmName,
          action: "modify",
          template: template || null,
          // Read back from em-cli after the change, so this reflects what
          // actually took rather than what was asked for.
          vm_detail: parseVmDetails(output)[0] || null,
          status: "modified",
        },
        { warnings: [...warnings, ...scriptWarnings] },
      );
    }

    if (action === "reset") {
      return envelope.success(
        { vm_name: vmName, action: "reset", status: "reset" },
        { warnings: [...warnings, ...scriptWarnings] },
      );
    }

    // action === "create-image"
    const imageMatch = output.match(/^IMAGE_CREATED=(.+)$/m);
    return envelope.success(
      {
        vm_name: vmName,
        action: "create-image",
        image_path: imageMatch ? imageMatch[1].trim() : null,
        compressed: opts.compress === true || opts.compress === "true",
        status: "image_created",
      },
      { warnings: [...warnings, ...scriptWarnings] },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to manage emulator: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  manageEmulator,
  createEmulator,
  launchEmulator,
  DEFAULT_SIZE,
  MANAGE_ACTIONS,
  // Exported for tests — size resolution and output parsing are pure and worth
  // covering without em-cli.
  parseTemplateDetails,
  parseVmDetails,
  parsePlatformDetails,
  parseManagerDetails,
  parseLaunchDiagnostics,
  parseHomescreenStatus,
  homescreenFixWarning,
  fixHomescreen,
  parseHwVirtAutofix,
  hwVirtAutofixWarning,
  parseLaunchWarnings,
  launchWarningText,
  launchDiagnosisDetails,
  launchDiagnosisSuggestedFix,
  summarizeEmulatorOutput,
  rawOutputTail,
  javaJnaHint,
  emcliOutputOf,
  emcliExitHint,
  READ_ONLY_EMCLI_ACTIONS,
  versionMismatchFix,
  JAVA_JNA_PATTERN,
  JAVA_VERSION_MISMATCH_PATTERN,
  buildEmulatorArgs,
  normalizeSize,
  matchTemplateForSize,
  parsePlatformList,
  pickPlatform,
};
