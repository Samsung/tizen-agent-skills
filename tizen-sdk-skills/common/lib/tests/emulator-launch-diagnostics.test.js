// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Tests for the launch-failure paths in tizen-emulator-manager.sh and the
 * LAUNCH_DIAG parsing in lib/core/emulator.js.
 *
 * Like emulator-fallback.test.js, these RUN the script against stub tools
 * rather than grepping its source. The bug that motivated the launch_vm()
 * helper is invisible to a source grep: em-cli prints "Error: Failed to start
 * this VM." on stdout and still exits 0, so the old exit-status check passed
 * the failure through to the sdb wait and burned the full WAIT_TIMEOUT.
 *
 * Stub knobs:
 *   STUB_LAUNCH_PRINTS_ERROR  em-cli launch prints "Error: Failed to start..."
 *   STUB_LAUNCH_RC            exit code for em-cli launch (default 0)
 *   STUB_SDB_DEVICES          device row sdb reports AFTER a launch happened
 *   STUB_SDB_DEVICES_AFTER_RESTART  device row sdb reports only after a
 *                             kill-server was issued (models a wedged sdb
 *                             server that the restart rescue fixes)
 *   STUB_VM_PLATFORM          Platform em-cli detail reports (default tizen-*)
 *   STUB_HS_CRASH             1 = the crash-dump dir lists org.tizen.homescreen
 *                             dumps (home screen crash loop, signal 1)
 *   STUB_HS_EGL               1 = dlog carries the EGL config failure (signal 2)
 *   STUB_HS_NO_RUNNER         1 = the home screen binary is absent
 *   STUB_HS_RUNNER_DIES       1 = the direct launch never shows up in ps
 *                             (models a fix that did not take)
 *   TIZEN_KVM_DEVICE          KVM device path the diagnosis checks (a plain
 *                             file in the throwaway tree — never the real host)
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

const {
  parseLaunchDiagnostics,
  parseHomescreenStatus,
  homescreenFixWarning,
  parseHwVirtAutofix,
  hwVirtAutofixWarning,
  parseLaunchWarnings,
  launchWarningText,
  launchDiagnosisDetails,
  launchDiagnosisSuggestedFix,
  summarizeEmulatorOutput,
  rawOutputTail,
  javaJnaHint,
  versionMismatchFix,
  JAVA_JNA_PATTERN,
  emcliOutputOf,
  emcliExitHint,
  JAVA_VERSION_MISMATCH_PATTERN,
} = require("../core/emulator");

console.log("=== Emulator Launch Diagnostics Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  if (!condition) {
    failures++;
    console.log(`FAIL ${name}`);
    if (details) console.log(`     ${details}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Pure-function tests — parseLaunchDiagnostics / summarizeEmulatorOutput
// ---------------------------------------------------------------------------
console.log("--- parseLaunchDiagnostics ---");

const FIXTURE = [
  "some em-cli noise",
  "LAUNCH_DIAG=phase|launch_failed",
  "LAUNCH_DIAG=vm|my-vm",
  "LAUNCH_DIAG=hw_virtualization|false",
  "LAUNCH_DIAG=kvm|present",
  "LAUNCH_DIAG=kvm_writable|yes",
  "LAUNCH_DIAG=wsl|yes",
  "LAUNCH_DIAG=suggest|enable_hw_virtualization",
  "LAUNCH_DIAG=missing_libs|libasound.so.2,libSDL-1.2.so.0",
  "LAUNCH_DIAG=missing_qt_libs|libxcb-icccm.so.4",
  "LAUNCH_DIAG=qt_xcb|failed",
  "LAUNCH_DIAG=qt_display|failed",
  "LAUNCH_DIAG=display|missing",
  "LAUNCH_DIAG=display_socket|missing",
  "LAUNCH_DIAG=xcb_packages|installed",
  "LAUNCH_DIAG=java_jna|failed",
  "LAUNCH_DIAG=emulator_log|/home/u/tizen-sdk-data/emulator/vms/x/logs/emulator.log",
  "LAUNCH_DIAG=log|qemu: sanitized pipe here",
  "LAUNCH_DIAG=fix|1. sudo usermod -aG kvm $USER",
  "LAUNCH_DIAG=fix|2. sudo apt install libasound2t64",
].join("\n");

const parsed = parseLaunchDiagnostics(FIXTURE);
check("fixture parses to a diagnosis object", parsed !== null);
check("phase parsed", parsed && parsed.phase === "launch_failed");
check(
  "script-resolved vm name parsed (fills suggested_fix on no-name launches)",
  parsed && parsed.vm === "my-vm",
);
check(
  "hw_virtualization parsed",
  parsed && parsed.hw_virtualization === "false",
);
check(
  "kvm state parsed",
  parsed && parsed.kvm === "present" && parsed.kvm_writable === "yes",
);
check(
  "missing_libs split on commas",
  parsed &&
    parsed.missing_libs.length === 2 &&
    parsed.missing_libs[1] === "libSDL-1.2.so.0",
);
check("qt_xcb flagged", parsed && parsed.qt_xcb === true);
check(
  "qt plugin missing libs parsed",
  parsed &&
    parsed.missing_qt_libs.length === 1 &&
    parsed.missing_qt_libs[0] === "libxcb-icccm.so.4",
);
check("qt_display flagged", parsed && parsed.qt_display === true);
check("display parsed", parsed && parsed.display === "missing");
check(
  "display socket missing flagged",
  parsed && parsed.display_socket_missing === true,
);
check(
  "xcb package state parsed",
  parsed && parsed.xcb_packages === "installed",
);
check("java_jna flagged", parsed && parsed.java_jna === true);
check("wsl detected", parsed && parsed.wsl === true);
check("log tail collected", parsed && parsed.log_tail.length === 1);
check(
  "suggestion collected",
  parsed && parsed.suggestions.includes("enable_hw_virtualization"),
);
check(
  "fix steps collected in order",
  parsed &&
    parsed.fixes.length === 2 &&
    parsed.fixes[0].includes("usermod -aG kvm") &&
    parsed.fixes[1].includes("apt install"),
);

console.log("\n--- launchDiagnosisDetails / launchDiagnosisSuggestedFix ---");
{
  // A diagnosis that carried neither fix lines nor the hw-virt suggestion.
  const bareDiag = parseLaunchDiagnostics(
    "LAUNCH_DIAG=phase|launch_failed\nLAUNCH_DIAG=vm|my-vm",
  );
  const details = launchDiagnosisDetails(parsed, FIXTURE);
  check(
    "host-fix guide leads the details (right after phase)",
    details[0].startsWith("phase:") &&
      details[1] === "HOST FIX REQUIRED — run these in order, then relaunch:" &&
      details[2].includes("usermod -aG kvm") &&
      details[3].includes("apt install"),
    JSON.stringify(details.slice(0, 4)),
  );
  check(
    "evidence still follows the guide",
    details.some((l) => l.startsWith("vm_config hwVirtualization")) &&
      details.some((l) => l.startsWith("missing libraries:")),
    JSON.stringify(details),
  );
  check(
    "no guide header when the script emitted no fix lines",
    !launchDiagnosisDetails(bareDiag, "x").some((l) =>
      l.startsWith("HOST FIX REQUIRED"),
    ),
  );
  check(
    "suggested fix uses the script-resolved vm name",
    launchDiagnosisSuggestedFix(parsed, null) ===
      "node emulator-manager-cli.js modify --vm-name my-vm --hw-virtualization yes",
  );
  check(
    "no suggested fix without the enable_hw_virtualization hint",
    launchDiagnosisSuggestedFix(bareDiag, "x") === null,
  );
}
check(
  "no LAUNCH_DIAG lines → null (old script / early failure)",
  parseLaunchDiagnostics("Error: Failed to start this VM.\n") === null,
);
check("empty input → null", parseLaunchDiagnostics("") === null);

const FIXTURE_NO_WSL = [
  "LAUNCH_DIAG=phase|launch_failed",
  "LAUNCH_DIAG=vm|my-vm",
  "LAUNCH_DIAG=wsl|no",
].join("\n");
const parsedNoWsl = parseLaunchDiagnostics(FIXTURE_NO_WSL);
check("wsl=no parsed as false", parsedNoWsl && parsedNoWsl.wsl === false);
check(
  "java_jna defaults to false when the line is absent",
  parsedNoWsl && parsedNoWsl.java_jna === false,
);

// ---------------------------------------------------------------------------
// rawOutputTail / javaJnaHint — the issue #40 payload additions: the raw
// script output must survive into errors[0].details, and the JNA hint must
// not send a headless client to a GUI.
// ---------------------------------------------------------------------------
console.log("\n--- rawOutputTail ---");

const JAVA_TRACE = [
  "[INFO] Found em-cli: /home/u/tizen-sdk/tools/emulator/bin/em-cli",
  "LAUNCH_DIAG=phase|launch_failed",
  'Exception in thread "main" java.lang.NoClassDefFoundError: com/sun/jna/Native',
  "\tat org.tizen.emulator.manager.EmulatorManager.main(EmulatorManager.java:42)",
  "Caused by: java.lang.ClassNotFoundException: com.sun.jna.Native",
].join("\n");

const tail = rawOutputTail(JAVA_TRACE);
check(
  "raw tail keeps the Java stack trace headline",
  tail.some((l) => l.includes("NoClassDefFoundError: com/sun/jna/Native")),
  JSON.stringify(tail),
);
check(
  "raw tail keeps the Caused by root cause",
  tail.some((l) => l.includes("Caused by: java.lang.ClassNotFoundException")),
  JSON.stringify(tail),
);
check(
  "raw tail drops LAUNCH_DIAG machine lines (already structured)",
  !tail.some((l) => l.includes("LAUNCH_DIAG=")),
  JSON.stringify(tail),
);
check(
  "raw tail lines are prefixed for the details array",
  tail.every((l) => l.startsWith("raw: ")),
  JSON.stringify(tail),
);
check("empty output → empty tail", rawOutputTail("").length === 0);

const longOutput = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join(
  "\n",
);
const cappedTail = rawOutputTail(longOutput, { maxLines: 10 });
check(
  "tail is capped at maxLines plus one omission marker",
  cappedTail.length === 11 && cappedTail[0].includes("earlier line(s) omitted"),
  JSON.stringify(cappedTail),
);
check(
  "tail keeps the LAST lines (where the error is)",
  cappedTail[cappedTail.length - 1] === "raw: line 30",
  JSON.stringify(cappedTail),
);

const longLine = rawOutputTail(`${"x".repeat(400)}`, { maxLineLength: 300 });
check(
  "overlong lines are truncated per line",
  longLine[0].length < 320 && longLine[0].endsWith("..."),
  JSON.stringify(longLine),
);

// Filter consistency: rawOutputTail must drop the SAME machine-line set that
// summarizeEmulatorOutput skips — a structured line resurfacing as raw:
// evidence would duplicate every finding for the remote client.
const MACHINE_FIXTURE = [
  "VM_LIST=my-vm",
  "HOMESCREEN_STATUS=ok",
  "HW_VIRT_AUTOFIX=my-vm",
  "TEMPLATE_DETAIL=HD1080 Tizen|tizen|1920x1080|512",
  "EMULATOR_STOPPED=1",
  "LAUNCH_DIAG=phase|launch_failed",
  "Error: Failed to start this VM.",
].join("\n");
const machineTail = rawOutputTail(MACHINE_FIXTURE);
check(
  "machine lines (VM_/HOMESCREEN_STATUS=/HW_VIRT_AUTOFIX=/TEMPLATE_/EMULATOR_) are filtered like summarize's skip set",
  machineTail.length === 1 &&
    machineTail[0] === "raw: Error: Failed to start this VM.",
  JSON.stringify(machineTail),
);

// Envelope safety: details is JSON-serialized verbatim for the MCP client, so
// quotes/backslashes/control chars and the truncation marker must survive a
// round-trip, and a truncation cut must never leave a lone surrogate.
const NASTY = 'quote " backslash \\ tab \t brace } 한글';
const nastyTail = rawOutputTail(NASTY);
check(
  "raw lines survive a JSON round-trip verbatim",
  JSON.parse(JSON.stringify(nastyTail))[0] === `raw: ${NASTY}`,
  JSON.stringify(nastyTail),
);

const surrogateLine = `${"x".repeat(299)}\u{1F600}after`;
const surrogateTail = rawOutputTail(surrogateLine, { maxLineLength: 300 });
const surrogateBody = surrogateTail[0]
  .replace(/^raw: /, "")
  .replace(/ \.\.\.$/, "");
check(
  "truncation backs off one unit instead of splitting a surrogate pair",
  surrogateBody === "x".repeat(299) &&
    JSON.parse(JSON.stringify(surrogateTail))[0] === surrogateTail[0],
  JSON.stringify(surrogateTail),
);
check(
  "truncated tail contains no lone surrogate",
  !/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(
    surrogateTail[0],
  ),
  JSON.stringify(surrogateTail),
);

console.log("\n--- javaJnaHint ---");

check("JNA crash triggers the hint", javaJnaHint(JAVA_TRACE) !== "");
check(
  "hint points at the details payload, not a GUI-only fix",
  /details/.test(javaJnaHint(JAVA_TRACE)) &&
    !/Tizen Studio/.test(javaJnaHint(JAVA_TRACE)),
  javaJnaHint(JAVA_TRACE),
);
check(
  "hint names the emulator package reinstall",
  /download-emulator-package/.test(javaJnaHint(JAVA_TRACE)),
  javaJnaHint(JAVA_TRACE),
);
check(
  "plain em-cli error does not trigger the hint",
  javaJnaHint("Error: Failed to start this VM.") === "",
);
// Issue #82: the scripts' own diagnostics used to say "Java/JNA" and turned
// EVERY em-cli failure into a JNA crash report. emcliOutputOf() keeps only
// what em-cli printed (between the EMCLI_OUTPUT_BEGIN/END markers), so the
// script's wording — old or new — never triggers the hint.
check(
  "script's own warning (old wording) is dropped by emcliOutputOf → no hint",
  javaJnaHint(
    emcliOutputOf(
      "[WARN] em-cli failed a basic 'list-vm' probe — it may have a Java/JNA dependency issue.",
    ),
  ) === "",
);
check(
  "with markers only em-cli's own lines are classified (empty block → no hint)",
  javaJnaHint(
    emcliOutputOf(
      "[WARN]  em-cli failed on 'list-template' (exit 1).\nEMCLI_OUTPUT_BEGIN\nEMCLI_OUTPUT_END\n[WARN] If the em-cli output above is a Java stack trace about a missing native bridge or class,",
    ),
  ) === "",
);
check(
  "a real trace inside the markers still triggers the hint",
  javaJnaHint(
    emcliOutputOf(
      "[WARN]  em-cli failed on 'list-vm' (exit 1).\nEMCLI_OUTPUT_BEGIN\n" +
        JAVA_TRACE +
        "\nEMCLI_OUTPUT_END",
    ),
  ) !== "",
);
check(
  "an exit without output is explained as blocked/hung, not as a JNA crash",
  /exited with code 1 without printing anything/.test(
    emcliExitHint(
      "[WARN]  em-cli failed on 'list-template' (exit 1).\nEMCLI_EXIT=1\nEMCLI_OUTPUT_BEGIN\nEMCLI_OUTPUT_END",
    ),
  ) &&
    emcliExitHint(
      "EMCLI_EXIT=1\nEMCLI_OUTPUT_BEGIN\n" + JAVA_TRACE + "\nEMCLI_OUTPUT_END",
    ) === "",
);
check(
  "exit 124 is named as the em-cli wall-clock cap",
  /hung JVM/.test(
    emcliExitHint("EMCLI_EXIT=124\nEMCLI_OUTPUT_BEGIN\nEMCLI_OUTPUT_END"),
  ),
);

// NoSuchFieldError/NoSuchMethodError is a loaded-but-mismatched class — an
// emulator-manager core vs platform plugin version skew (real case:
// java.lang.NoSuchFieldError: isVirgl on tizen-11.0, fixed by updating
// emulator-manager 2.6.60 → 2.6.67) — so the hint must send these to the
// update-package flow, not to a JNA reinstall.
const MISMATCH_TRACE =
  'Exception in thread "main" java.lang.NoSuchFieldError: isVirgl\n' +
  "\tat org.tizen.emulator.manager.vms.SKINMode.<init>(SKINMode.java:87)";
check(
  "NoSuchFieldError triggers the version-mismatch hint (tizen-update-package)",
  /tizen-update-package/.test(javaJnaHint(MISMATCH_TRACE)) &&
    /mismatch/i.test(javaJnaHint(MISMATCH_TRACE)),
  javaJnaHint(MISMATCH_TRACE),
);
check(
  "version-mismatch hint does not misdirect to the emulator-package reinstall",
  !/download-emulator-package/.test(javaJnaHint(MISMATCH_TRACE)),
  javaJnaHint(MISMATCH_TRACE),
);
check(
  "plain JNA crash still gets the reinstall hint, not the update flow",
  /download-emulator-package/.test(javaJnaHint(JAVA_TRACE)) &&
    !/tizen-update-package/.test(javaJnaHint(JAVA_TRACE)),
  javaJnaHint(JAVA_TRACE),
);

console.log("\n--- versionMismatchFix ---");
{
  const fix = versionMismatchFix("create", {
    vmName: "tizen-vm-11",
    platform: "tizen-11.0-x86_64",
    profile: "tizen",
    template: "HD1080 Tizen",
    launch: true,
  });
  check(
    "fix leads with the update-package CLI",
    /update-package-cli\.js/.test(fix),
    fix,
  );
  check(
    "fix says the update is long-running / background it",
    /background/i.test(fix),
    fix,
  );
  check(
    "fix carries the exact create retry command",
    fix.includes(
      "node emulator-manager-cli.js create --vm-name tizen-vm-11 " +
        '--platform tizen-11.0-x86_64 --template "HD1080 Tizen" --launch',
    ),
    fix,
  );
  check(
    "default profile is not repeated in the retry",
    !/--profile tizen\b/.test(fix),
    fix,
  );
  check("retry is bounded to a single attempt", /retry once/i.test(fix), fix);

  const tvFix = versionMismatchFix("create", {
    vmName: "v",
    profile: "tv",
    size: "3840",
  });
  check(
    "non-default profile and size survive into the retry",
    /--profile tv\b/.test(tvFix) && /--size 3840/.test(tvFix),
    tvFix,
  );

  const otherFix = versionMismatchFix("delete", { vmName: "v" });
  check(
    "non-create action gets the update command without a create retry",
    /update-package-cli\.js/.test(otherFix) &&
      !/emulator-manager-cli\.js create/.test(otherFix),
    otherFix,
  );
}

console.log("\n--- EMCLI_MISMATCH machine line ---");

// The gate's machine line must behave like every other machine line: parsed
// into a structured decision (the package_version_mismatch envelope), never
// resurfacing as a warning or a raw evidence line.
check(
  "the mismatch branch trigger matches the machine line, not prose mentioning it",
  /^EMCLI_MISMATCH=1$/m.test("noise\nEMCLI_MISMATCH=1\n[ERROR] refused") &&
    !/^EMCLI_MISMATCH=1$/m.test("docs say EMCLI_MISMATCH=1 is emitted"),
);
check(
  "EMCLI_MISMATCH is filtered from raw evidence lines",
  rawOutputTail("EMCLI_MISMATCH=1\nboom").every(
    (l) => !l.includes("EMCLI_MISMATCH"),
  ),
  JSON.stringify(rawOutputTail("EMCLI_MISMATCH=1\nboom")),
);
check(
  "EMCLI_MISMATCH is filtered from summarized warnings",
  !summarizeEmulatorOutput("EMCLI_MISMATCH=1\n[ERROR] creation refused").some(
    (l) => l.startsWith("EMCLI_MISMATCH="),
  ),
);
{
  const { ERROR_CODES } = require("../envelope/envelope");
  check(
    "package_version_mismatch is registered as TIZEN_SDK_EXEC_E002",
    ERROR_CODES.PACKAGE_VERSION_MISMATCH &&
      ERROR_CODES.PACKAGE_VERSION_MISMATCH.error_code ===
        "TIZEN_SDK_EXEC_E002" &&
      ERROR_CODES.PACKAGE_VERSION_MISMATCH.error_category ===
        "package_version_mismatch",
  );
}

console.log("\n--- parseHwVirtAutofix ---");

check(
  "autofix line parsed to the vm name",
  parseHwVirtAutofix(
    "noise\nHW_VIRT_AUTOFIX=my-vm\nDEVICE_SERIAL=emulator-26101",
  ) === "my-vm",
);
check(
  "no line → null (no fix applied)",
  parseHwVirtAutofix("DEVICE_SERIAL=x") === null,
);
check("empty input → null", parseHwVirtAutofix("") === null);

console.log("\n--- parseLaunchWarnings / launchWarningText ---");

check(
  "LAUNCH_WARN key parsed from a success output",
  JSON.stringify(
    parseLaunchWarnings(
      "noise\nLAUNCH_WARN=virgl_scanout_failing\nDEVICE_SERIAL=emulator-26101",
    ),
  ) === JSON.stringify(["virgl_scanout_failing"]),
);
check(
  "no LAUNCH_WARN lines → empty",
  parseLaunchWarnings("DEVICE_SERIAL=x").length === 0,
);
check("empty input → empty", parseLaunchWarnings("").length === 0);
check(
  "LAUNCH_DIAG lines are not mistaken for launch warnings",
  parseLaunchWarnings("LAUNCH_DIAG=phase|connect_timeout").length === 0,
);
{
  const w = launchWarningText("virgl_scanout_failing");
  check(
    "virgl warning names the black-display symptom and the host requirement",
    /Display output is not active/.test(w) &&
      /virglrenderer/.test(w) &&
      /1\.0/.test(w),
    w,
  );
  check(
    "virgl warning says boot and sdb still succeeded",
    /boot and sdb succeeded/.test(w),
    w,
  );
  check(
    "an unknown key still surfaces instead of vanishing",
    launchWarningText("mystery_key").includes("mystery_key"),
  );
}

console.log("\n--- parseHomescreenStatus ---");

check(
  "fixed parsed",
  parseHomescreenStatus(
    "noise\nHOMESCREEN_STATUS=fixed\nDEVICE_SERIAL=emulator-26101",
  ) === "fixed",
);
check("ok parsed", parseHomescreenStatus("HOMESCREEN_STATUS=ok") === "ok");
check(
  "detected parsed",
  parseHomescreenStatus("HOMESCREEN_STATUS=detected") === "detected",
);
check(
  "popup_fixed parsed",
  parseHomescreenStatus("HOMESCREEN_STATUS=popup_fixed") === "popup_fixed",
);
check(
  "fix_failed parsed",
  parseHomescreenStatus("HOMESCREEN_STATUS=fix_failed") === "fix_failed",
);
check(
  "no line → null (check did not apply)",
  parseHomescreenStatus("DEVICE_SERIAL=x") === null,
);
check(
  "unknown value → null",
  parseHomescreenStatus("HOMESCREEN_STATUS=banana") === null,
);
check("empty input → null", parseHomescreenStatus("") === null);

console.log("\n--- hwVirtAutofixWarning ---");
{
  // The pre-launch auto-heal is invisible to the user apart from this sentence,
  // and its every claim is gated by maybe_enable_hw_virtualization() in the
  // script — so the two must not drift.
  const w = hwVirtAutofixWarning("my-vm");
  check("hw virt: names the healed VM", w.includes("'my-vm'"), w);
  check(
    "hw virt: carries the command that was run, with the vm name",
    w.includes("em-cli modify -n my-vm -w yes"),
    w,
  );
  check(
    "hw virt: says the profile was the problem, not the host",
    /disabled in its profile/.test(w) && /Host KVM is usable/.test(w),
    w,
  );
  check(
    "hw virt: makes clear it is already done and one-time",
    /auto-enabled/.test(w) && /No action needed/.test(w) && /one-time/.test(w),
    w,
  );
  // It must not read as an instruction: the command is shown as a record of what
  // ran, so no imperative lead-in may precede it.
  check(
    "hw virt: does not tell the user to run anything",
    !/\b(run|please run|execute)\b/i.test(w),
    w,
  );
}

console.log("\n--- homescreenFixWarning ---");
{
  // The user-facing explanation of the WSL fix lives ONLY in these strings, and
  // until now nothing asserted them — which is how an earlier version shipped a
  // wrong root cause ("WSL's 9p rejects the chown") to users unnoticed.
  const opts = { serial: "emulator-26101", vmName: "my-vm" };
  const fixed = homescreenFixWarning("fixed", opts);
  const popup = homescreenFixWarning("popup_fixed", opts);
  const detected = homescreenFixWarning("detected", opts);
  const failed = homescreenFixWarning("fix_failed", opts);

  check(
    "fixed: names both caveats (runs as root, lost on reboot)",
    /runs as root/.test(fixed) && /does not survive a guest reboot/.test(fixed),
    fixed,
  );
  check(
    "fixed: carries the exact revert command",
    fixed.includes("systemctl --global unmask starter.service starter.path"),
    fixed,
  );
  check(
    "popup_fixed: says the display stays empty",
    /stays empty/.test(popup),
    popup,
  );
  check(
    "popup_fixed: also carries the revert command",
    popup.includes("--global unmask starter.service"),
    popup,
  );
  check(
    "fix_failed: points at the TV profile with the vm name",
    failed.includes("-p tv") && failed.includes("my-vm"),
    failed,
  );
  check(
    "fix_failed: says app development still works",
    /app development still works/i.test(failed),
    failed,
  );

  // detected is reachable both from TIZEN_HOMESCREEN_* and from the honoured
  // TIZEN_BUXTON_AUTOFIX=0 opt-out, so it must not blame a specific variable —
  // that would name a setting the caller never touched.
  check(
    "detected: blames no specific env var (also reached via the legacy opt-out)",
    !/TIZEN_HOMESCREEN_(MASK_STARTER|LAUNCH)=0/.test(detected) &&
      !/TIZEN_BUXTON/.test(detected),
    detected,
  );
  check(
    "detected: warns that /opt fills up",
    detected.includes("df -h /opt"),
    detected,
  );

  // Silent on a plain launch; the answer itself when the fix was requested.
  check("ok: silent on launch", homescreenFixWarning("ok", opts) === null);
  check(
    "ok: reported when explicitly asked",
    /nothing needed fixing/.test(
      homescreenFixWarning("ok", { ...opts, explicit: true }),
    ),
  );
  check(
    "not applicable: silent on launch",
    homescreenFixWarning(null, opts) === null,
  );
  check(
    "not applicable: explains the gate when explicitly asked",
    /did not apply/.test(
      homescreenFixWarning(null, { ...opts, explicit: true }),
    ),
  );
  check("unknown status → null", homescreenFixWarning("banana", opts) === null);

  // Regression guard: the retired explanations must never come back.
  for (const [label, text] of [
    ["fixed", fixed],
    ["popup_fixed", popup],
    ["detected", detected],
    ["fix_failed", failed],
  ]) {
    check(
      `${label}: no retired 9p/chmod/buxton claims`,
      !/9p|chmod|buxton/i.test(text),
      text,
    );
  }
}

console.log("\n--- summarizeEmulatorOutput ---");

const summary = summarizeEmulatorOutput(
  [
    "LAUNCH_DIAG=phase|launch_failed",
    "HOMESCREEN_STATUS=fix_failed",
    "[ERROR] /dev/kvm not found — kernel KVM is unavailable",
    "Qt failed to LOAD the xcb platform plugin",
    "totally irrelevant chatter",
  ].join("\n"),
);
check(
  "HOMESCREEN_STATUS lines are skipped from warnings (parsed separately)",
  !summary.some((l) => l.startsWith("HOMESCREEN_STATUS=")),
  JSON.stringify(summary),
);
check(
  "LAUNCH_DIAG lines are skipped from warnings",
  !summary.some((l) => l.startsWith("LAUNCH_DIAG=")),
  JSON.stringify(summary),
);
check(
  "kvm line survives the keep filter",
  summary.some((l) => /kvm/i.test(l)),
  JSON.stringify(summary),
);
check(
  "xcb line survives the keep filter",
  summary.some((l) => /xcb/i.test(l)),
  JSON.stringify(summary),
);

// ---------------------------------------------------------------------------
// Behavioural tests — run the real script against stub em-cli/sdb
// ---------------------------------------------------------------------------
const SCRIPT_PATH = path.join(
  __dirname,
  "../../scripts/tizen-emulator-manager/tizen-emulator-manager.sh",
);

check(
  "tizen-emulator-manager.sh exists",
  fs.existsSync(SCRIPT_PATH),
  SCRIPT_PATH,
);

// ---------------------------------------------------------------------------
// Java/JNA pattern sync — JAVA_JNA_PATTERN vs the script's grep.
//
// The shell cannot import the JS constant, so launch_vm() carries a literal
// copy of the alternation. Token drift means the same crash gets a java_jna
// diagnosis from one path and a bare execution_error from another (doctor.ts
// imports the constant directly, so it cannot drift). This is a source-level
// check on purpose: it must run on every platform, including win32 where the
// behavioural tests are skipped.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Claim sync — hwVirtAutofixWarning promises things only the script can keep.
//
// The warning tells the user "Host KVM is usable" and "the profile had it
// disabled", and that the heal already succeeded. All three are true only while
// maybe_enable_hw_virtualization() keeps its gate: KVM writable, profile really
// false, and HW_VIRT_AUTOFIX emitted after the verified modify. Loosening the
// gate would turn the warning into a false statement, which no behavioural test
// would catch. Source-level so it also runs on win32.
// ---------------------------------------------------------------------------
console.log(
  "\n--- hwVirtAutofixWarning claim sync (warning text vs script gate) ---",
);
{
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const fn = source.slice(
    source.indexOf("maybe_enable_hw_virtualization()"),
    source.indexOf("HW_VIRT_AUTOFIX=$vm"),
  );
  check("claim sync: the auto-heal function was located", fn.length > 0);
  check(
    'claim sync: "Host KVM is usable" is still gated on a writable KVM device',
    /-w "\$KVM_DEVICE"/.test(fn),
    fn,
  );
  check(
    'claim sync: "disabled in its profile" is still gated on hwVirtualization=false',
    /hwvirt" = "false"/.test(fn),
    fn,
  );
  check(
    'claim sync: "auto-enabled" is still gated on a verified modify',
    /emcli_failed "\$out"/.test(fn),
    fn,
  );
}

console.log("\n--- Java/JNA pattern sync (JS constant vs script grep) ---");
{
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const grepPatterns = [...source.matchAll(/grep -qiE '([^']+)'/g)].map(
    (m) => m[1],
  );
  const shellPattern = grepPatterns.find((p) =>
    p.includes("NoClassDefFoundError"),
  );
  check(
    "launch_vm carries a Java/JNA grep pattern",
    Boolean(shellPattern),
    `grep -qiE patterns found: ${JSON.stringify(grepPatterns)}`,
  );
  if (shellPattern) {
    const jsTokens = JAVA_JNA_PATTERN.source.split("|").sort();
    const shTokens = shellPattern.split("|").sort();
    check(
      "shell grep tokens match JAVA_JNA_PATTERN token-for-token",
      JSON.stringify(jsTokens) === JSON.stringify(shTokens),
      `js=${JSON.stringify(jsTokens)}\n     sh=${JSON.stringify(shTokens)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Version-mismatch pattern sync — JAVA_VERSION_MISMATCH_PATTERN vs the
// script's greps (probe gate + launch_vm). Same rationale as the Java/JNA
// sync above: the shell carries literal copies of the alternation, and drift
// means the same crash is gated in one path and misclassified in another.
// ---------------------------------------------------------------------------
console.log(
  "\n--- Version-mismatch pattern sync (JS constant vs script greps) ---",
);
{
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const mismatchGreps = [...source.matchAll(/grep -qE '([^']+)'/g)]
    .map((m) => m[1])
    .filter((p) => p.includes("NoSuchFieldError"));
  check(
    "script carries the mismatch grep in both the probe gate and launch_vm",
    mismatchGreps.length >= 2,
    `grep -qE mismatch patterns found: ${JSON.stringify(mismatchGreps)}`,
  );
  const jsTokens = JSON.stringify(
    JAVA_VERSION_MISMATCH_PATTERN.source.split("|").sort(),
  );
  for (const p of mismatchGreps) {
    check(
      "mismatch grep matches JAVA_VERSION_MISMATCH_PATTERN token-for-token",
      JSON.stringify(p.split("|").sort()) === jsTokens,
      `js=${jsTokens}\n     sh=${JSON.stringify(p.split("|").sort())}`,
    );
  }
}

// ---------------------------------------------------------------------------
// EMCLI mismatch gate claim sync — the docs promise the gate is create-only
// and honours TIZEN_EMCLI_GATE=off, and the JS envelope branch depends on the
// EMCLI_MISMATCH=1 machine line being emitted before exit. Source-level so it
// runs on every platform, and it covers the .ps1 mirror too (no bash there).
// ---------------------------------------------------------------------------
console.log("\n--- EMCLI mismatch gate claim sync (script vs docs/parser) ---");
{
  const shSource = fs.readFileSync(SCRIPT_PATH, "utf8");
  // The gate lives in report_emcli_failure(), fed by the create's own first
  // em-cli call (issue #48 removed the separate pre-action probe).
  const gate = shSource.slice(
    shSource.indexOf("report_emcli_failure() {"),
    shSource.indexOf("Shared helpers"),
  );
  check(
    "sh gate: diagnosis function located and emits the machine line",
    gate.includes('echo "EMCLI_MISMATCH=1"'),
  );
  check(
    "sh gate: fires for the create action only",
    /\[ "\$ACTION" = "create" \]/.test(gate),
  );
  check(
    "sh gate: honours TIZEN_EMCLI_GATE=off",
    /\$\{TIZEN_EMCLI_GATE:-on\}.*!= "off"/.test(gate),
  );
  check("sh gate: refuses with exit 1 before any VM work", /exit 1/.test(gate));
  check(
    "sh gate: still points at the update flow, not a reinstall",
    /tizen-update-package/.test(gate),
  );

  const ps1Source = fs.readFileSync(
    path.join(path.dirname(SCRIPT_PATH), "tizen-emulator-manager.ps1"),
    "utf8",
  );
  // Write-Host, not Write-Output: the gate runs inside Get-VmList's pipeline,
  // where Write-Output would land in the caller's variable instead of stdout.
  check(
    "ps1 gate: mirror emits the same machine line",
    ps1Source.includes('Write-Host "EMCLI_MISMATCH=1"'),
  );
  check(
    "ps1: no unconditional pre-action em-cli probe remains (issue #48)",
    !/\$emcliProbeOut\s*=/.test(ps1Source),
  );
  check(
    "sh: no unconditional pre-action em-cli probe remains (issue #48)",
    !/EMCLI_PROBE_OUT=\$\(/.test(shSource),
  );
  check(
    "ps1 gate: mirror is create-only and honours the same env knob",
    /\$Action -eq "create" -and \$env:TIZEN_EMCLI_GATE -ne "off"/.test(
      ps1Source,
    ),
  );

  // The JS side must consume the machine line: the createEmulator catch block
  // returns package_version_mismatch with the versionMismatchFix command.
  const jsSource = fs.readFileSync(
    path.join(__dirname, "../core/emulator.js"),
    "utf8",
  );
  const catchStart = jsSource.indexOf("async function createEmulator");
  const catchBody = jsSource.slice(
    catchStart,
    jsSource.indexOf("async function launchEmulator"),
  );
  check(
    "emulator.js: createEmulator consumes EMCLI_MISMATCH=1",
    /EMCLI_MISMATCH=1\$\/m\.test\(scriptOutput\)/.test(catchBody),
  );
  check(
    "emulator.js: the mismatch branch returns package_version_mismatch with the fix",
    /"package_version_mismatch"/.test(catchBody) &&
      /versionMismatchFix\(/.test(catchBody),
  );
}

// ---------------------------------------------------------------------------
// LAUNCH_DIAG key sync — the script's emitted keys vs the parser's switch.
//
// parseLaunchDiagnostics drops unknown keys silently (default: break), so a
// key added on the shell side without a parser case would vanish without any
// failure. Like the Java/JNA pattern sync above, this is a source-level check
// on purpose: it must run on every platform, including win32.
// ---------------------------------------------------------------------------
console.log("\n--- LAUNCH_DIAG key sync (script emits vs parser handles) ---");
{
  const shSource = fs.readFileSync(SCRIPT_PATH, "utf8");
  // [a-z_]+ deliberately skips the header's generic "LAUNCH_DIAG=<key>|" doc line.
  const emitted = new Set(
    [...shSource.matchAll(/LAUNCH_DIAG=([a-z_]+)\|/g)].map((m) => m[1]),
  );
  const jsSource = fs.readFileSync(
    path.join(__dirname, "../core/emulator.js"),
    "utf8",
  );
  const parserStart = jsSource.indexOf("function parseLaunchDiagnostics");
  const parserBody = jsSource.slice(
    parserStart,
    jsSource.indexOf("\nfunction ", parserStart + 1),
  );
  const handled = new Set(
    [...parserBody.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]),
  );
  const unhandled = [...emitted].filter((k) => !handled.has(k));
  const dead = [...handled].filter((k) => !emitted.has(k));
  check(
    "key sync: extraction found a plausible key set",
    emitted.size >= 15 && handled.size >= 15,
    `emitted=${emitted.size}, handled=${handled.size}`,
  );
  check(
    "key sync: every emitted LAUNCH_DIAG key has a parser case",
    unhandled.length === 0,
    `unhandled: ${unhandled.join(", ")}`,
  );
  check(
    "key sync: the parser has no case for a key the script never emits",
    dead.length === 0,
    `dead: ${dead.join(", ")}`,
  );
}

if (process.platform === "win32") {
  console.log(
    "\nSKIP: behavioural tests need bash (see tizen-emulator-manager.ps1 for the Windows path)",
  );
  console.log(
    `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

try {
  execFileSync("bash", ["-n", SCRIPT_PATH], { stdio: "pipe" });
  check("script passes `bash -n` syntax check", true);
} catch (error) {
  check(
    "script passes `bash -n` syntax check",
    false,
    String(error.stderr || error.message).trim(),
  );
}

const STUB_EM_CLI = `#!/usr/bin/env bash
# Stub em-cli for launch tests — see emulator-launch-diagnostics.test.js.
set -u
printf '%s\\n' "$*" >> "$STUB_LOG"
action="\${1:-}"
shift || true

case "$action" in
  list-vm)
    for n in \${STUB_VMS:-my-vm}; do
      echo "$n            stopped"
    done
    ;;
  launch)
    # Model em-cli dying inside its own JVM before touching the VM (issue #40).
    if [ "\${STUB_LAUNCH_JAVA_ERROR:-0}" = "1" ]; then
      echo 'Exception in thread "main" java.lang.NoClassDefFoundError: com/sun/jna/Native' >&2
      echo '	at org.tizen.emulator.manager.EmulatorManager.main(EmulatorManager.java:42)' >&2
      exit 1
    fi
    # Model a VM whose profile disables hwVirtualization: launch fails until a
    # modify -w yes was recorded (the pre-launch auto-heal path).
    if [ "\${STUB_LAUNCH_FAIL_UNLESS_MODIFIED:-0}" = "1" ] && [ ! -f "$STUB_STATE/modified" ]; then
      echo "Error: Failed to start this VM."
      exit 0
    fi
    # Model the real quirk: the error goes to STDOUT and the exit code lies.
    if [ "\${STUB_LAUNCH_PRINTS_ERROR:-0}" = "1" ]; then
      echo "Error: Failed to start this VM."
    else
      touch "$STUB_STATE/launched"
    fi
    exit "\${STUB_LAUNCH_RC:-0}"
    ;;
  modify)
    # Model em-cli's two failure shapes: "Error:" text with exit 0 (its usual
    # lie), and a Java crash exiting non-zero WITHOUT an "Error:" line.
    if [ "\${STUB_MODIFY_PRINTS_ERROR:-0}" = "1" ]; then
      echo "Error: Failed to modify the VM."
      exit 0
    fi
    if [ "\${STUB_MODIFY_RC:-0}" != "0" ]; then
      echo 'Exception in thread "main" java.lang.NoClassDefFoundError: com/sun/jna/Native' >&2
      exit "\${STUB_MODIFY_RC}"
    fi
    # Record only a hwVirtualization enable — that is what the auto-heal sends.
    if printf '%s' "$*" | grep -q -- '-w yes'; then
      touch "$STUB_STATE/modified"
    fi
    echo "The virtual machine is modified"
    ;;
  detail)
    # maybe_check_buxton reads the Platform field to skip TV-profile VMs.
    echo "my-vm"
    printf '  Platform          : %s\\n' "\${STUB_VM_PLATFORM:-tizen-10.0-x86_64}"
    ;;
esac
exit 0
`;

const STUB_SDB = `#!/usr/bin/env bash
# Stub sdb: reports devices only after the stub em-cli recorded a launch.
set -u
printf 'sdb %s\\n' "$*" >> "$STUB_LOG"
case "\${1:-}" in
  devices)
    echo "List of devices attached"
    if [ -f "$STUB_STATE/launched" ] && [ -n "\${STUB_SDB_DEVICES:-}" ]; then
      # STUB_SDB_DEVICE_DELAY models a boot that takes a moment to connect: the
      # device stays absent for the first N calls. create --launch needs this —
      # it snapshots the device list right after launching and only accepts a
      # serial that appears afterwards, so an instantly-present device is never
      # seen as new.
      if [ -n "\${STUB_SDB_DEVICE_DELAY:-}" ]; then
        n=0
        [ -f "$STUB_STATE/devices_calls" ] && n=$(cat "$STUB_STATE/devices_calls")
        n=$((n + 1)); echo "$n" > "$STUB_STATE/devices_calls"
        [ "$n" -le "\${STUB_SDB_DEVICE_DELAY}" ] && exit 0
      fi
      printf '%s\\n' "$STUB_SDB_DEVICES"
    fi
    # A wedged sdb server: the device surfaces only after the restart rescue
    # bounced the server (kill-server recorded below).
    if [ -f "$STUB_STATE/launched" ] && [ -f "$STUB_STATE/sdb_restarted" ] \\
        && [ -n "\${STUB_SDB_DEVICES_AFTER_RESTART:-}" ]; then
      printf '%s\\n' "$STUB_SDB_DEVICES_AFTER_RESTART"
    fi
    ;;
  kill-server)
    touch "$STUB_STATE/sdb_restarted"
    ;;
  -e)
    # -e wait-for-device: connect immediately when a device exists, otherwise
    # block until the script's \`timeout\` kills us.
    if [ -f "$STUB_STATE/launched" ] && [ -n "\${STUB_SDB_DEVICES:-}" ]; then
      exit 0
    fi
    sleep 30
    exit 1
    ;;
  -s)
    # Serial-targeted calls made by check_and_fix_homescreen: root on, and shell
    # commands. STUB_HS_CRASH=1 models a home screen crash loop — the crash-dump
    # listing then reports dumps, which is the first detection signal.
    # STUB_HS_RUNNER_DIES=1 models a direct launch that does not stay up: the
    # runner is "started" but never shows up in ps.
    sub="\${3:-}"
    case "$sub" in
      shell)
        shift 3 || true
        cmd="$*"
        case "$cmd" in
          *"rm -rf /opt/usr/share/crash/dump"*)
            touch "$STUB_STATE/dumps_cleared"
            ;;
          *"ls /opt/usr/share/crash/dump"*)
            # Detection signal 1. Cleared dumps stay cleared so a re-check after
            # the fix does not re-trigger.
            if [ "\${STUB_HS_CRASH:-0}" = "1" ] && [ ! -f "$STUB_STATE/dumps_cleared" ]; then
              echo "org.tizen.homescreen_3008_20260814195806.zip"
              echo "org.tizen.homescreen_3061_20260814195812.zip"
            fi
            ;;
          *dlogutil*)
            # Detection signal 2, only consulted when signal 1 is silent.
            if [ "\${STUB_HS_EGL:-0}" = "1" ]; then
              echo "E/ConsoleMessage( 123): tizen_renderer_egl.cc: ChooseEGLConfiguration(265) > No matching configuration found."
            fi
            ;;
          *"systemctl --global mask"*)
            touch "$STUB_STATE/starter_masked"
            ;;
          *"readlink /etc/systemd/user/starter.service"*)
            # Detection signal 3: a previous fix left starter masked, so no crash
            # loop exists any more and nothing would relaunch the home screen.
            if [ "\${STUB_HS_STARTER_MASKED:-0}" = "1" ] || [ -f "$STUB_STATE/starter_masked" ]; then
              echo /dev/null
            fi
            ;;
          *"pkill -9 starter"*)
            touch "$STUB_STATE/starter_killed"
            ;;
          *"-x /usr/apps/org.tizen.homescreen/bin/runner"*)
            [ "\${STUB_HS_NO_RUNNER:-0}" = "1" ] || echo yes
            ;;
          *"nohup /usr/apps/org.tizen.homescreen/bin/runner"*)
            touch "$STUB_STATE/homescreen_started"
            ;;
          *"for d in /run/user"*)
            # Runtime-dir discovery. Must be matched by the loop, NOT by a bare
            # "/run/user + wayland" pattern — the launch command above carries
            # both (XDG_RUNTIME_DIR=/run/user/5001 WAYLAND_DISPLAY=wayland-0)
            # and would be swallowed here.
            echo "/run/user/5001"
            ;;
          *"stat -c %U"*)
            echo owner
            ;;
          *"systemctl --user stop starter"*)
            # The in-session stop, run as the session user over its user bus.
            # Masking alone does not stop the loaded units.
            touch "$STUB_STATE/starter_stopped"
            ;;
          *"pgrep -u root -f"*)
            # Alive-check after the direct launch — scoped to root so
            # launchpad's own crashing instances do not count.
            if [ -f "$STUB_STATE/homescreen_started" ] && [ "\${STUB_HS_RUNNER_DIES:-0}" != "1" ]; then
              echo 7798
            fi
            ;;
        esac
        ;;
    esac
    ;;
esac
exit 0
`;

const STUB_LDD = `#!/usr/bin/env bash
# Stub ldd: the emulator binary misses libasound, the Qt xcb plugin misses
# libxcb-icccm; a resolved lib is included and must NOT be reported.
for arg; do last="$arg"; done
case "$last" in
  *libqxcb.so)
    # STUB_LDD_QXCB_CLEAN=1 models a plugin whose deps all resolve — the
    # "packages installed, failure is elsewhere" scenario.
    if [ "\${STUB_LDD_QXCB_CLEAN:-0}" = "1" ]; then
      echo "	libxcb-icccm.so.4 => /usr/lib/x86_64-linux-gnu/libxcb-icccm.so.4 (0x0)"
    else
      echo "	libxcb-icccm.so.4 => not found"
    fi
    ;;
  *)
    echo "	libasound.so.2 => not found"
    echo "	libSDL-1.2.so.0 => not found"
    echo "	libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f)"
    ;;
esac
exit 0
`;

// dpkg stub: the xcb package check must not depend on what the machine
// running the tests has installed. Default exit 1 = packages missing;
// STUB_DPKG_RC=0 models an all-installed host.
const STUB_DPKG = `#!/usr/bin/env bash
exit "\${STUB_DPKG_RC:-1}"
`;

/**
 * Build a throwaway tree: stub SDK (em-cli, sdb, emulator binary), a fake HOME
 * for tizen-sdk-data fixtures, and a PATH-prepended bin dir for the stub ldd.
 */
function makeTree({
  hwVirtualization = null,
  emulatorLog = null,
  stubLdd = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-launch-test-"));
  const emcliDir = path.join(root, "sdk", "tools", "emulator", "bin");
  fs.mkdirSync(emcliDir, { recursive: true });
  fs.writeFileSync(path.join(emcliDir, "em-cli"), STUB_EM_CLI, { mode: 0o755 });
  fs.writeFileSync(path.join(root, "sdk", "tools", "sdb"), STUB_SDB, {
    mode: 0o755,
  });

  const home = path.join(root, "home");
  const vmDir = path.join(home, "tizen-sdk-data", "emulator", "vms", "my-vm");
  fs.mkdirSync(vmDir, { recursive: true });
  if (hwVirtualization !== null) {
    fs.writeFileSync(
      path.join(vmDir, "vm_config.xml"),
      `<?xml version="1.0"?>\n<EmulatorConfiguration><baseInformation>` +
        `<hwVirtualization>${hwVirtualization}</hwVirtualization>` +
        `</baseInformation></EmulatorConfiguration>\n`,
    );
  }
  if (emulatorLog !== null) {
    const logDir = path.join(vmDir, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, "emulator.log"), emulatorLog);
  }

  const binDir = path.join(root, "bin");
  fs.mkdirSync(binDir);
  // Always stub dpkg so the xcb package check is hermetic (see STUB_DPKG).
  fs.writeFileSync(path.join(binDir, "dpkg"), STUB_DPKG, { mode: 0o755 });
  if (stubLdd) {
    fs.writeFileSync(path.join(binDir, "ldd"), STUB_LDD, { mode: 0o755 });
    // The diagnosis only runs ldd when the SDK ships an emulator binary.
    const emulBin = path.join(
      root,
      "sdk",
      "platforms",
      "tizen-10.0",
      "common",
      "emulator",
      "bin",
    );
    fs.mkdirSync(emulBin, { recursive: true });
    fs.writeFileSync(path.join(emulBin, "emulator-x86_64"), "");
    // The Qt xcb plugin is probed separately (it is dlopen'ed at runtime).
    const qtPlugins = path.join(emulBin, "plugins", "platforms");
    fs.mkdirSync(qtPlugins, { recursive: true });
    fs.writeFileSync(path.join(qtPlugins, "libqxcb.so"), "");
  }

  // A plain file stands in for a usable /dev/kvm; tests that want "missing"
  // point TIZEN_KVM_DEVICE at a path that does not exist.
  const kvmFile = path.join(root, "kvm");
  fs.writeFileSync(kvmFile, "");

  const state = path.join(root, "state");
  fs.mkdirSync(state);
  return {
    root,
    sdk: path.join(root, "sdk"),
    home,
    binDir,
    kvmFile,
    state,
    log: path.join(root, "log"),
  };
}

function runLaunch(
  tree,
  stubEnv = {},
  args = ["-a", "launch", "-n", "my-vm", "-t", "1"],
) {
  fs.writeFileSync(tree.log, "");
  const result = spawnSync("bash", [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    timeout: 60000,
    env: {
      ...process.env,
      PATH: `${tree.binDir}:${process.env.PATH}`,
      HOME: tree.home,
      TIZEN_SDK_PATH: tree.sdk,
      STUB_LOG: tree.log,
      STUB_STATE: tree.state,
      // Hermetic defaults: the home screen check must never depend on whether
      // the machine running the tests is itself WSL, and must not sleep. The
      // home screen tests below re-enable it with TIZEN_HOMESCREEN_CHECK=force.
      TIZEN_HOMESCREEN_CHECK: "off",
      TIZEN_HOMESCREEN_CHECK_TIMEOUT: "0",
      TIZEN_HOMESCREEN_VERIFY_DELAY: "0",
      // The sdb-restart rescue re-polls for 30s by default, which would slow
      // every connect-timeout test to a crawl. The rescue test re-enables it.
      TIZEN_SDB_RESTART_RETRY: "0",
      ...stubEnv,
    },
  });
  const code = typeof result.status === "number" ? result.status : 1;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  // What the stubs recorded (chmod_applied, dlog_cleared, ...) — read before
  // the tree is destroyed so tests can assert on side effects.
  let state = [];
  try {
    state = fs.readdirSync(tree.state);
  } catch {
    /* tree gone */
  }
  fs.rmSync(tree.root, { recursive: true, force: true });
  return { code, output, state };
}

// --- 1. The core bug: "Error:" on stdout with exit 0 must fail immediately --
console.log("\n--- exit-0 Error: launch failure ---");
{
  const r = runLaunch(makeTree(), {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check("launch exits non-zero", r.code !== 0, `exit=${r.code}`);
  check(
    "no sdb wait is entered (the 300s burn is gone)",
    !r.output.includes("Waiting up to"),
    r.output,
  );
  check(
    "phase is launch_failed",
    r.output.includes("LAUNCH_DIAG=phase|launch_failed"),
    r.output,
  );
  check(
    "resolved vm name is emitted",
    r.output.includes("LAUNCH_DIAG=vm|my-vm"),
    r.output,
  );
}

// --- 1b. em-cli crashes in Java → java_jna diagnosis (issue #40) ------------
console.log("\n--- Java/JNA crash detection ---");
{
  const r = runLaunch(makeTree(), {
    STUB_LAUNCH_JAVA_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check("java crash exits non-zero", r.code !== 0, `exit=${r.code}`);
  check(
    "java_jna diagnosis emitted",
    r.output.includes("LAUNCH_DIAG=java_jna|failed"),
    r.output,
  );
  check(
    "the raw Java stack trace reaches the captured output",
    r.output.includes("NoClassDefFoundError: com/sun/jna/Native"),
    r.output,
  );
  check(
    "phase is still launch_failed",
    r.output.includes("LAUNCH_DIAG=phase|launch_failed"),
    r.output,
  );
}

// --- 2. hwVirtualization=false + KVM present → actionable suggestion --------
console.log("\n--- hwVirtualization suggestion ---");
{
  const tree = makeTree({ hwVirtualization: "false" });
  const kvm = tree.kvmFile;
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: kvm,
  });
  check(
    "hw_virtualization=false reported",
    r.output.includes("LAUNCH_DIAG=hw_virtualization|false"),
    r.output,
  );
  check(
    "kvm present reported",
    r.output.includes("LAUNCH_DIAG=kvm|present"),
    r.output,
  );
  check(
    "enable_hw_virtualization suggested",
    r.output.includes("LAUNCH_DIAG=suggest|enable_hw_virtualization"),
    r.output,
  );
  check(
    "guidance names the modify -w yes fix",
    /modify -n my-vm -w yes/.test(r.output),
    r.output,
  );
}

// --- 2b. hwVirtualization=false + usable KVM → pre-launch auto-heal ---------
console.log("\n--- hwVirtualization auto-heal ---");
{
  // The stub refuses to launch until a modify -w yes was recorded, exactly like
  // a real VM whose profile disables virtualization. The auto-heal must apply
  // the fix BEFORE the first launch attempt, so the launch succeeds outright.
  const tree = makeTree({ hwVirtualization: "false" });
  const r = runLaunch(tree, {
    TIZEN_KVM_DEVICE: tree.kvmFile,
    STUB_LAUNCH_FAIL_UNLESS_MODIFIED: "1",
    STUB_SDB_DEVICES: "emulator-26101          device          my-vm",
  });
  check(
    "auto-heal: launch succeeds",
    r.code === 0,
    `exit=${r.code}\n${r.output}`,
  );
  check(
    "auto-heal: HW_VIRT_AUTOFIX emitted",
    r.output.includes("HW_VIRT_AUTOFIX=my-vm"),
    r.output,
  );
  check(
    "auto-heal: modify -w yes reached em-cli",
    r.state.includes("modified"),
    r.state.join(","),
  );
  check(
    "auto-heal: DEVICE_SERIAL printed",
    r.output.includes("DEVICE_SERIAL=emulator-26101"),
    r.output,
  );
  check(
    "auto-heal: no LAUNCH_DIAG (the launch never failed)",
    !r.output.includes("LAUNCH_DIAG="),
    r.output,
  );
}

// The heal's modify fails with em-cli's exit-0 "Error:" lie → no
// HW_VIRT_AUTOFIX, and the launch still proceeds.
{
  const tree = makeTree({ hwVirtualization: "false" });
  const r = runLaunch(tree, {
    TIZEN_KVM_DEVICE: tree.kvmFile,
    STUB_MODIFY_PRINTS_ERROR: "1",
    STUB_SDB_DEVICES: "emulator-26101          device          my-vm",
  });
  check(
    "heal fails (Error text): no HW_VIRT_AUTOFIX emitted",
    !r.output.includes("HW_VIRT_AUTOFIX="),
    r.output,
  );
  check(
    "heal fails (Error text): launch still proceeds and connects",
    r.code === 0 && r.output.includes("DEVICE_SERIAL=emulator-26101"),
    `exit=${r.code}\n${r.output}`,
  );
  check(
    "heal fails (Error text): manual fix is pointed out",
    r.output.includes("Could not enable hwVirtualization automatically"),
    r.output,
  );
}

// The heal's modify dies non-zero WITHOUT an "Error:" line (Java crash) —
// the exit code alone must block the HW_VIRT_AUTOFIX emit.
{
  const tree = makeTree({ hwVirtualization: "false" });
  const r = runLaunch(tree, {
    TIZEN_KVM_DEVICE: tree.kvmFile,
    STUB_MODIFY_RC: "1",
    STUB_SDB_DEVICES: "emulator-26101          device          my-vm",
  });
  check(
    "heal fails (rc!=0, no Error text): no HW_VIRT_AUTOFIX emitted",
    !r.output.includes("HW_VIRT_AUTOFIX="),
    r.output,
  );
  check(
    "heal fails (rc!=0): launch still proceeds and connects",
    r.code === 0 && r.output.includes("DEVICE_SERIAL=emulator-26101"),
    `exit=${r.code}\n${r.output}`,
  );
}

// hwVirtualization already enabled → nothing to heal, no modify sent
{
  const tree = makeTree({ hwVirtualization: "true" });
  const r = runLaunch(tree, {
    TIZEN_KVM_DEVICE: tree.kvmFile,
    STUB_SDB_DEVICES: "emulator-26101          device          my-vm",
  });
  check(
    "no-heal (already true): no HW_VIRT_AUTOFIX",
    !r.output.includes("HW_VIRT_AUTOFIX="),
    r.output,
  );
  check(
    "no-heal (already true): no modify issued",
    !r.state.includes("modified"),
    r.state.join(","),
  );
}

// --- 3. KVM missing → no profile suggestion -------------------------------
console.log("\n--- KVM missing ---");
{
  const tree = makeTree({ hwVirtualization: "false" });
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "kvm missing reported",
    r.output.includes("LAUNCH_DIAG=kvm|missing"),
    r.output,
  );
  check(
    "no enable_hw_virtualization suggestion without KVM",
    !r.output.includes("LAUNCH_DIAG=suggest|enable_hw_virtualization"),
    r.output,
  );
  check(
    "no auto-heal without KVM",
    !r.output.includes("HW_VIRT_AUTOFIX=") && !r.state.includes("modified"),
    r.output,
  );
}

// --- 4. Qt xcb failure in emulator.log ------------------------------------
console.log("\n--- Qt xcb detection + log tail ---");
{
  const tree = makeTree({
    emulatorLog:
      "qemu boot line one\n" +
      "value|with|pipes\n" +
      'This application failed to start because it could not find or load the Qt platform plugin "xcb" in "".\n',
  });
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "qt_xcb failure detected",
    r.output.includes("LAUNCH_DIAG=qt_xcb|failed"),
    r.output,
  );
  check(
    "qt_xcb packages appear in the host-fix guide",
    /LAUNCH_DIAG=fix\|\d+\. sudo apt install libxcb-icccm4 .*libxkbcommon-x11-0/.test(
      r.output,
    ),
    r.output,
  );
  check(
    "emulator.log tail lines emitted",
    r.output.includes("LAUNCH_DIAG=log|qemu boot line one"),
    r.output,
  );
  check(
    "pipes inside log lines are sanitized to spaces",
    r.output.includes("LAUNCH_DIAG=log|value with pipes"),
    r.output,
  );
}

// --- 4b. Qt xcb failure but the packages are all installed ------------------
console.log("\n--- Qt xcb with packages installed ---");
{
  const tree = makeTree({
    emulatorLog:
      'This application failed to start because it could not find or load the Qt platform plugin "xcb" in "".\n',
  });
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
    STUB_DPKG_RC: "0",
  });
  check(
    "xcb installed: state reported",
    r.output.includes("LAUNCH_DIAG=xcb_packages|installed"),
    r.output,
  );
  check(
    "xcb installed: the guide does not re-suggest installed packages",
    !/LAUNCH_DIAG=fix\|\d+\. sudo apt install .*libxcb-icccm4/.test(r.output),
    r.output,
  );
  check(
    "xcb installed: the guide points past the packages instead",
    /LAUNCH_DIAG=fix\|\d+\. xcb runtime packages are already installed/.test(
      r.output,
    ),
    r.output,
  );
}

// --- 4b2. Guide ordering: runnable commands before the advisory --------------
// Both an apt step (binary lib missing) and the xcb-installed advisory
// (plugin deps clean, packages installed) in one guide: commands must come
// first — the advisory is not a command and forwards to later steps.
{
  const tree = makeTree({
    stubLdd: true,
    emulatorLog:
      'This application failed to start because it could not find or load the Qt platform plugin "xcb" in "".\n',
  });
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
    STUB_DPKG_RC: "0",
    STUB_LDD_QXCB_CLEAN: "1",
  });
  const apt = r.output.match(/LAUNCH_DIAG=fix\|(\d+)\. sudo apt install/);
  const note = r.output.match(
    /LAUNCH_DIAG=fix\|(\d+)\. xcb runtime packages are already installed/,
  );
  check(
    "ordering: both the apt step and the advisory are present",
    Boolean(apt && note),
    r.output,
  );
  check(
    "ordering: the apt command precedes the advisory",
    apt && note && Number(apt[1]) < Number(note[1]),
    `apt=${apt && apt[1]}, note=${note && note[1]}\n${r.output}`,
  );
}

// --- 4c. Qt display-connect failure is NOT an xcb package problem ------------
console.log("\n--- Qt display-connect detection ---");
{
  const tree = makeTree({
    emulatorLog: "qt.qpa.xcb: could not connect to display\n",
  });
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "qt_display failure detected",
    r.output.includes("LAUNCH_DIAG=qt_display|failed"),
    r.output,
  );
  check(
    "not misdiagnosed as a qt_xcb dependency failure",
    !r.output.includes("LAUNCH_DIAG=qt_xcb|failed"),
    r.output,
  );
  check(
    "DISPLAY fix step present",
    /LAUNCH_DIAG=fix\|\d+\. .*DISPLAY/.test(r.output),
    r.output,
  );
}

// Qt prints BOTH fatals when the xcb plugin loads but cannot reach an X
// server — the display cause must win, and the two classifications must
// stay mutually exclusive.
{
  const tree = makeTree({
    emulatorLog:
      "qt.qpa.xcb: could not connect to display\n" +
      'This application failed to start because it could not find or load the Qt platform plugin "xcb" in "".\n',
  });
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "both fatals present: classified as qt_display",
    r.output.includes("LAUNCH_DIAG=qt_display|failed"),
    r.output,
  );
  check(
    "both fatals present: qt_xcb NOT emitted (mutually exclusive)",
    !r.output.includes("LAUNCH_DIAG=qt_xcb|failed"),
    r.output,
  );
}

// --- 4d. DISPLAY unset → display probe + fix step ----------------------------
console.log("\n--- DISPLAY probe ---");
{
  const r = runLaunch(makeTree(), {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
    DISPLAY: "",
  });
  check(
    "missing DISPLAY reported",
    r.output.includes("LAUNCH_DIAG=display|missing"),
    r.output,
  );
  check(
    "missing DISPLAY: fix step names DISPLAY",
    /LAUNCH_DIAG=fix\|\d+\. .*DISPLAY/.test(r.output),
    r.output,
  );
}
{
  // DISPLAY set but its socket does not exist (dead WSLg / stopped X server).
  const r = runLaunch(makeTree(), {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
    DISPLAY: ":7",
    TIZEN_X11_DIR: "/nonexistent/.X11-unix",
  });
  check(
    "dead X socket reported",
    r.output.includes("LAUNCH_DIAG=display_socket|missing"),
    r.output,
  );
}

// --- 5. Missing system libraries via ldd -----------------------------------
console.log("\n--- missing libs via ldd ---");
{
  const tree = makeTree({ stubLdd: true });
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "missing_libs reports the unresolved libs and not the resolved one",
    /LAUNCH_DIAG=missing_libs\|(?=.*libasound\.so\.2)(?=.*libSDL-1\.2\.so\.0)(?!.*libc\.so\.6)/.test(
      r.output,
    ),
    r.output,
  );
  check(
    "the Qt plugin's own unresolved lib is probed and reported",
    r.output.includes("LAUNCH_DIAG=missing_qt_libs|libxcb-icccm.so.4"),
    r.output,
  );
  check(
    "one apt step maps the binary's and the plugin's libs to real packages",
    // libsdl1.2debian is pinned by name: it exists on both Ubuntu 22.04 and
    // 24.04, unlike the never-existing "libsdl1.2compat" this once referenced.
    /LAUNCH_DIAG=fix\|\d+\. sudo apt install (?=.*libasound2)(?=.*libsdl1\.2debian)(?=.*libxcb-icccm4)/.test(
      r.output,
    ),
    r.output,
  );
}

// --- 5b. Consolidated host-fix guide -----------------------------------------
// The user-reported scenario end to end: KVM present but unwritable (not in
// the kvm group), hwVirtualization=false in the profile, and missing host
// libraries — the diagnosis must close with ONE ordered command list.
console.log("\n--- host-fix guide ---");
{
  const tree = makeTree({ hwVirtualization: "false", stubLdd: true });
  fs.chmodSync(tree.kvmFile, 0o444);
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: tree.kvmFile,
  });
  if (process.getuid && process.getuid() === 0) {
    // root writes through mode 0444, so the unwritable-KVM premise cannot hold.
    console.log("SKIP: kvm-unwritable fix checks (running as root)");
  } else {
    check(
      "fix guide: usermod step emitted",
      /LAUNCH_DIAG=fix\|\d+\. sudo usermod -aG kvm/.test(r.output),
      r.output,
    );
    check(
      "fix guide: relaunch note names the auto-heal",
      /LAUNCH_DIAG=fix\|\d+\. relaunch — hwVirtualization is re-enabled automatically/.test(
        r.output,
      ),
      r.output,
    );
    check(
      "fix guide: no auto-heal attempted while KVM is unwritable",
      !r.output.includes("HW_VIRT_AUTOFIX=") && !r.state.includes("modified"),
      r.output,
    );
  }
  check(
    "fix guide: apt install step maps libasound to its host package",
    /LAUNCH_DIAG=fix\|\d+\. sudo apt install .*libasound2/.test(r.output),
    r.output,
  );
  check(
    "fix guide: steps are numbered from 1",
    /LAUNCH_DIAG=fix\|1\. /.test(r.output),
    r.output,
  );
}

// A clean host with a broken launch gets no guide — nothing to fix on the host.
{
  const r = runLaunch(makeTree(), {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "fix guide: no usermod/apt steps when KVM is simply missing and libs resolve",
    !/LAUNCH_DIAG=fix\|\d+\. sudo (usermod|apt)/.test(r.output),
    r.output,
  );
}

// --- 6. Launch OK but never connects → connect_timeout ---------------------
console.log("\n--- connect timeout ---");
{
  const r = runLaunch(makeTree(), { TIZEN_KVM_DEVICE: "/nonexistent/kvm" });
  check("timeout exits non-zero", r.code !== 0, `exit=${r.code}`);
  check(
    "phase is connect_timeout",
    r.output.includes("LAUNCH_DIAG=phase|connect_timeout"),
    r.output,
  );
  check(
    "no rescue attempted with TIZEN_SDB_RESTART_RETRY=0",
    !r.state.includes("sdb_restarted"),
    r.state.join(","),
  );
}

// --- 6b. Connect timeout rescued by an sdb server restart -------------------
// A wedged sdb server: the emulator is up but `sdb devices` never shows it
// until the server is bounced. The rescue must kill/start the server, find
// the serial on the re-poll, emit SDB_SERVER_RESTARTED=1 and still succeed.
console.log("\n--- sdb server restart rescue ---");
{
  const r = runLaunch(makeTree(), {
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
    TIZEN_SDB_RESTART_RETRY: "6",
    STUB_SDB_DEVICES_AFTER_RESTART:
      "emulator-26101          device          my-vm",
  });
  check("rescue: launch exits 0", r.code === 0, `exit=${r.code}\n${r.output}`);
  check(
    "rescue: the server was actually bounced",
    r.state.includes("sdb_restarted"),
    r.state.join(","),
  );
  check(
    "rescue: SDB_SERVER_RESTARTED=1 emitted for the JS side",
    r.output.includes("SDB_SERVER_RESTARTED=1"),
    r.output,
  );
  check(
    "rescue: DEVICE_SERIAL still reported",
    r.output.includes("DEVICE_SERIAL=emulator-26101"),
    r.output,
  );
  check(
    "rescue: no failure diagnosis on a rescued launch",
    !r.output.includes("LAUNCH_DIAG="),
    r.output,
  );
}

// When the restart does not surface the device either, the existing failure
// path must run unchanged.
{
  const r = runLaunch(makeTree(), {
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
    TIZEN_SDB_RESTART_RETRY: "3",
  });
  check("rescue miss: launch still fails", r.code !== 0, `exit=${r.code}`);
  check(
    "rescue miss: server was bounced before giving up",
    r.state.includes("sdb_restarted"),
    r.state.join(","),
  );
  check(
    "rescue miss: falls through to the connect_timeout diagnosis",
    r.output.includes("LAUNCH_DIAG=phase|connect_timeout") &&
      !r.output.includes("SDB_SERVER_RESTARTED=1"),
    r.output,
  );
}

// --- 7. WSL detection in failure path -----------------------------------
console.log("\n--- WSL detection ---");
{
  const tree = makeTree();
  const r = runLaunch(tree, {
    STUB_LAUNCH_PRINTS_ERROR: "1",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
    // Simulate WSL environment by creating /proc/version with Microsoft
    // (actual test would need bash integration; this documents the expectation)
  });
  // The script always emits LAUNCH_DIAG=wsl|{yes|no}, so check for its presence
  check(
    "wsl diagnostic emitted (yes or no)",
    /LAUNCH_DIAG=wsl\|(yes|no)/.test(r.output),
    r.output,
  );
}

// --- 8. Success regression --------------------------------------------------
console.log("\n--- success path ---");
{
  const r = runLaunch(makeTree(), {
    STUB_SDB_DEVICES: "emulator-26101          device          my-vm",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "successful launch exits 0",
    r.code === 0,
    `exit=${r.code}\n${r.output}`,
  );
  check(
    "DEVICE_SERIAL printed",
    r.output.includes("DEVICE_SERIAL=emulator-26101"),
    r.output,
  );
  check(
    "no LAUNCH_DIAG lines on success",
    !r.output.includes("LAUNCH_DIAG="),
    r.output,
  );
  check(
    "no HOMESCREEN_STATUS when the check is off",
    !r.output.includes("HOMESCREEN_STATUS="),
    r.output,
  );
  check(
    "no LAUNCH_WARN on a clean success (no emulator.log at all)",
    !r.output.includes("LAUNCH_WARN="),
    r.output,
  );
}

// --- 8b. Success but the VM log floods with virgl scanout failures ----------
// Host virglrenderer too old for the platform: boot and sdb succeed, so no
// failure path ever runs, but the display stays black. The success report
// must carry LAUNCH_WARN=virgl_scanout_failing (never a LAUNCH_DIAG key —
// those are failure-path keys enforced by the key-sync test above).
console.log("\n--- virgl scanout warning ---");
{
  const flood =
    Array.from(
      { length: 25 },
      () => "virtio_gpu_virgl_process_cmd: ctrl 0x103, error 0x1203",
    ).join("\n") + "\n";
  const r = runLaunch(makeTree({ emulatorLog: flood }), {
    STUB_SDB_DEVICES: "emulator-26101          device          my-vm",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check(
    "virgl flood: launch still succeeds",
    r.code === 0,
    `exit=${r.code}\n${r.output}`,
  );
  check(
    "virgl flood: LAUNCH_WARN=virgl_scanout_failing emitted with DEVICE_SERIAL",
    r.output.includes("LAUNCH_WARN=virgl_scanout_failing") &&
      r.output.includes("DEVICE_SERIAL=emulator-26101"),
    r.output,
  );
  check(
    "virgl flood: warned as LAUNCH_WARN, not smuggled in as a LAUNCH_DIAG key",
    !r.output.includes("LAUNCH_DIAG="),
    r.output,
  );
}

// A handful of scanout errors (transient during boot) must not trigger it.
{
  const fewErrors =
    "some qemu boot line\n" +
    Array.from(
      { length: 5 },
      () => "virtio_gpu_virgl_process_cmd: ctrl 0x103, error 0x1203",
    ).join("\n") +
    "\n";
  const r = runLaunch(makeTree({ emulatorLog: fewErrors }), {
    STUB_SDB_DEVICES: "emulator-26101          device          my-vm",
    TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  });
  check("few virgl errors: launch succeeds", r.code === 0, `exit=${r.code}`);
  check(
    "few virgl errors: below the flood threshold, no LAUNCH_WARN",
    !r.output.includes("LAUNCH_WARN="),
    r.output,
  );
}

// --- 9. Home screen crash-loop detection + fix ------------------------------
console.log("\n--- home screen detect + fix ---");
const SDB_DEVICE_ROW = "emulator-26101          device          my-vm";
const USB_DEVICE_ROW = "0000d85b3f3a6c00        device          SM-R800";

// The gate is deliberately narrow (WSL + emulator serial + tizen platform), so
// every case below forces the host layer and varies exactly one other input.
const HS_BASE = {
  STUB_SDB_DEVICES: SDB_DEVICE_ROW,
  TIZEN_KVM_DEVICE: "/nonexistent/kvm",
  TIZEN_HOMESCREEN_CHECK: "force",
};

// 9a. Crash dumps present → default path: starter masked, dumps cleared, home
// screen started directly and verified alive → fixed.
{
  const r = runLaunch(makeTree(), { ...HS_BASE, STUB_HS_CRASH: "1" });
  check(
    "hs fix: launch still succeeds",
    r.code === 0,
    `exit=${r.code}\n${r.output}`,
  );
  check(
    "hs fix: status is fixed",
    r.output.includes("HOMESCREEN_STATUS=fixed"),
    r.output,
  );
  check(
    "hs fix: starter masked",
    r.state.includes("starter_masked"),
    r.state.join(","),
  );
  check(
    "hs fix: starter stopped in the running session (mask alone does not)",
    r.state.includes("starter_stopped"),
    r.state.join(","),
  );
  check(
    "hs fix: running starter killed",
    r.state.includes("starter_killed"),
    r.state.join(","),
  );
  check(
    "hs fix: crash dumps reclaimed",
    r.state.includes("dumps_cleared"),
    r.state.join(","),
  );
  check(
    "hs fix: home screen started directly (launchpad bypassed)",
    r.state.includes("homescreen_started"),
    r.state.join(","),
  );
  check(
    "hs fix: DEVICE_SERIAL still printed",
    r.output.includes("DEVICE_SERIAL=emulator-26101"),
    r.output,
  );
}

// 9b. The EGL failure in dlog is the second, independent detection signal — it
// must trigger the fix even when the crash-dump dir is empty.
{
  const r = runLaunch(makeTree(), { ...HS_BASE, STUB_HS_EGL: "1" });
  check(
    "hs dlog signal: status is fixed",
    r.output.includes("HOMESCREEN_STATUS=fixed"),
    r.output,
  );
  check(
    "hs dlog signal: home screen started",
    r.state.includes("homescreen_started"),
    r.state.join(","),
  );
}

// 9b2. A previous fix left starter masked, so a later boot has no crash dumps
// and no fresh EGL errors — but also nothing to launch the home screen. Without
// this signal the guest boots to a blank display and the hook reports ok, which
// is how the fix used to defeat itself on every boot after the first.
{
  const r = runLaunch(makeTree(), { ...HS_BASE, STUB_HS_STARTER_MASKED: "1" });
  check(
    "hs masked-but-blank: detected and fixed rather than reported ok",
    r.output.includes("HOMESCREEN_STATUS=fixed"),
    r.output,
  );
  check(
    "hs masked-but-blank: the home screen was started",
    r.state.includes("homescreen_started"),
    r.state.join(","),
  );
}

// 9b3. create --launch must run the same check. It reaches a booted emulator by
// its own connect loop, and a freshly created VM is the most likely one to hit
// the crash loop — this path shipped without the hook once and the popup came
// back on the first command most users run.
{
  const r = runLaunch(
    makeTree(),
    { ...HS_BASE, STUB_HS_CRASH: "1", STUB_SDB_DEVICE_DELAY: "1" },
    [
      "-a",
      "create",
      "-n",
      "new-vm",
      "-P",
      "tizen-10.0-x86_64",
      "-T",
      "HD1080 Tizen",
      "-l",
      "-t",
      "10",
    ],
  );
  check(
    "create --launch: VM_LAUNCHED reported",
    r.output.includes("VM_LAUNCHED="),
    r.output,
  );
  check(
    "create --launch: home screen check ran",
    r.output.includes("HOMESCREEN_STATUS=fixed"),
    r.output,
  );
  check(
    "create --launch: home screen was started",
    r.state.includes("homescreen_started"),
    r.state.join(","),
  );
}

// 9c. The direct launch does not stay up → fix_failed (still exit 0 — the
// emulator is up and app development works without the home screen).
{
  const r = runLaunch(makeTree(), {
    ...HS_BASE,
    STUB_HS_CRASH: "1",
    STUB_HS_RUNNER_DIES: "1",
  });
  check("hs dies: launch still succeeds", r.code === 0, `exit=${r.code}`);
  check(
    "hs dies: status is fix_failed",
    r.output.includes("HOMESCREEN_STATUS=fix_failed"),
    r.output,
  );
  check(
    "hs dies: retry loop still stopped",
    r.state.includes("starter_masked"),
    r.state.join(","),
  );
}

// 9d. The home screen binary is missing (unexpected image) → fix_failed rather
// than a silent success.
{
  const r = runLaunch(makeTree(), {
    ...HS_BASE,
    STUB_HS_CRASH: "1",
    STUB_HS_NO_RUNNER: "1",
  });
  check(
    "hs no runner: status is fix_failed",
    r.output.includes("HOMESCREEN_STATUS=fix_failed"),
    r.output,
  );
  check(
    "hs no runner: nothing was exec'd",
    !r.state.includes("homescreen_started"),
    r.state.join(","),
  );
}

// 9e. TIZEN_HOMESCREEN_LAUNCH=0 → popup and retry loop stopped, home screen
// deliberately left down.
{
  const r = runLaunch(makeTree(), {
    ...HS_BASE,
    STUB_HS_CRASH: "1",
    TIZEN_HOMESCREEN_LAUNCH: "0",
  });
  check(
    "hs launch off: status is popup_fixed",
    r.output.includes("HOMESCREEN_STATUS=popup_fixed"),
    r.output,
  );
  check(
    "hs launch off: starter masked",
    r.state.includes("starter_masked"),
    r.state.join(","),
  );
  check(
    "hs launch off: home screen not started",
    !r.state.includes("homescreen_started"),
    r.state.join(","),
  );
}

// 9f. Both fixes disabled → report only, guest untouched.
{
  const r = runLaunch(makeTree(), {
    ...HS_BASE,
    STUB_HS_CRASH: "1",
    TIZEN_HOMESCREEN_LAUNCH: "0",
    TIZEN_HOMESCREEN_MASK_STARTER: "0",
  });
  check(
    "hs report only: status is detected",
    r.output.includes("HOMESCREEN_STATUS=detected"),
    r.output,
  );
  check(
    "hs report only: starter untouched",
    !r.state.includes("starter_masked"),
    r.state.join(","),
  );
  check(
    "hs report only: dumps kept",
    !r.state.includes("dumps_cleared"),
    r.state.join(","),
  );
}

// 9g. Healthy home screen → ok, and nothing is touched on the device.
{
  const r = runLaunch(makeTree(), HS_BASE);
  check(
    "hs clean: status is ok",
    r.output.includes("HOMESCREEN_STATUS=ok"),
    r.output,
  );
  check(
    "hs clean: starter untouched",
    !r.state.includes("starter_masked"),
    r.state.join(","),
  );
  check(
    "hs clean: home screen not started",
    !r.state.includes("homescreen_started"),
    r.state.join(","),
  );
}

// 9g2. The retired TIZEN_BUXTON_* knobs must not be silently ignored. This hook
// is MORE invasive than the buxton probe it replaced, so an existing opt-out has
// to survive the rename — otherwise upgrading silently starts masking starter on
// guests whose owner had opted out.
{
  const withCrash = { ...HS_BASE, STUB_HS_CRASH: "1" };

  // Empty (not "force") so the legacy value is the only thing deciding, while
  // still not depending on whether the test host itself is WSL.
  const off = runLaunch(makeTree(), {
    ...withCrash,
    TIZEN_HOMESCREEN_CHECK: "",
    TIZEN_BUXTON_CHECK: "off",
  });
  check(
    "legacy compat: TIZEN_BUXTON_CHECK=off still disables the check",
    !off.output.includes("HOMESCREEN_STATUS="),
    off.output,
  );
  check(
    "legacy compat: obsolete knob is called out",
    off.output.includes("TIZEN_BUXTON_* is obsolete"),
    off.output,
  );
  check(
    "legacy compat: check=off leaves the guest alone",
    !off.state.includes("starter_masked"),
    off.state.join(","),
  );

  const reportOnly = runLaunch(makeTree(), {
    ...withCrash,
    TIZEN_BUXTON_AUTOFIX: "0",
  });
  check(
    "legacy compat: TIZEN_BUXTON_AUTOFIX=0 still means report-only",
    reportOnly.output.includes("HOMESCREEN_STATUS=detected"),
    reportOnly.output,
  );
  check(
    "legacy compat: autofix=0 does not mask starter",
    !reportOnly.state.includes("starter_masked"),
    reportOnly.state.join(","),
  );
  check(
    "legacy compat: report-only names the legacy knob, not the new ones",
    reportOnly.output.includes(
      "switched off (honouring the obsolete TIZEN_BUXTON_AUTOFIX=0)",
    ),
    reportOnly.output,
  );

  // An explicit new-style value always wins over the legacy one.
  const newWins = runLaunch(makeTree(), {
    ...withCrash,
    TIZEN_BUXTON_AUTOFIX: "0",
    TIZEN_HOMESCREEN_LAUNCH: "1",
  });
  check(
    "legacy compat: explicit TIZEN_HOMESCREEN_* overrides the legacy knob",
    newWins.output.includes("HOMESCREEN_STATUS=fixed"),
    newWins.output,
  );
}

// 9h. Gates: every one of these must emit NO status line at all (so the JS side
// can tell "checked and healthy" apart from "does not apply") and must leave the
// guest alone. The platform gate is a tizen* whitelist, not a tv blacklist, so
// wearable images are skipped too.
{
  const gates = [
    ["tv platform", { STUB_VM_PLATFORM: "tv-samsung-10.0-x86_64" }],
    ["wearable platform", { STUB_VM_PLATFORM: "wearable-6.0-x86" }],
    ["real device target", { STUB_SDB_DEVICES: USB_DEVICE_ROW }],
    ["check off", { TIZEN_HOMESCREEN_CHECK: "off" }],
  ];
  for (const [label, env] of gates) {
    const r = runLaunch(makeTree(), { ...HS_BASE, STUB_HS_CRASH: "1", ...env });
    check(
      `hs gate (${label}): no HOMESCREEN_STATUS emitted`,
      !r.output.includes("HOMESCREEN_STATUS="),
      r.output,
    );
    check(
      `hs gate (${label}): guest untouched`,
      !r.state.includes("starter_masked"),
      r.state.join(","),
    );
  }
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
