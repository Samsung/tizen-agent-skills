// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * .NET setup failure-classification tests
 *
 * Regression cover: the setup
 * runner used to blame elevation for EVERY non-zero exit, so a workload that
 * had been installed into a different .NET SDK band came back as "re-run from
 * an Administrator PowerShell" — which is what sent the calling agent into
 * blind `--force` retries and manual `dotnet --list-sdks` probing.
 *
 * Run: node lib/tests/dotnet-setup.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  parseDiagLines,
  parseInstallTarget,
  parseWorkloadStatus,
  summarizeSuccessWarnings,
  classifyDotnetSetupFailure,
  summarizeDotnetSetupOutput,
} = require("../core/dotnet");
const { formatError } = require("../envelope/response-formatter");
const { ERROR_CODES } = require("../envelope/envelope");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message}`);
  }
}

// The exact shape the scripts print when verification fails, modelled on the
// machine state reported in issue #258.
const MISMATCH_OUTPUT = [
  "[*] === Verifying the Tizen workload ===",
  "[ERROR] Tizen workload not found after installation.",
  "[DIAG] dotnet_path=C:\\Program Files\\dotnet\\dotnet.exe",
  "[DIAG] dotnet_version=10.0.302",
  "[DIAG] dotnet_root=C:\\Program Files\\dotnet",
  "[DIAG] sdk_band=10.0.300",
  "[DIAG] env_dotnet_root=C:\\Users\\<username>\\.dotnet",
  "[DIAG] installer_pinned_dir=C:\\Program Files\\dotnet",
  "[DIAG] installer_update_all=false",
  "[DIAG] installer_checked_sdks=9.0.304",
  "[DIAG] installer_checked_bands=9.0.300",
  "[DIAG] manifest_expected=C:\\Program Files\\dotnet\\sdk-manifests\\10.0.300\\samsung.net.sdk.tizen\\[<manifest-version>\\]WorkloadManifest.json exists=false",
  "[DIAG] manifest_found_in_bands=9.0.300",
  "[DIAG] workload_version_line=Workload version: 10.0.300-manifests.714b12c0",
  "[DIAG] permission_denied=false",
].join("\n");

function err(status, stdout, message = "Command failed") {
  const e = new Error(message);
  e.status = status;
  e.stdout = stdout;
  e.stderr = "";
  return e;
}

console.log("=== parseDiagLines ===");

test("parses every [DIAG] key=value pair", () => {
  const diag = parseDiagLines(MISMATCH_OUTPUT);
  assert.strictEqual(diag.dotnet_version, "10.0.302");
  assert.strictEqual(diag.sdk_band, "10.0.300");
  assert.strictEqual(diag.installer_checked_sdks, "9.0.304");
  assert.strictEqual(diag.installer_checked_bands, "9.0.300");
  assert.strictEqual(diag.manifest_found_in_bands, "9.0.300");
  assert.strictEqual(diag.env_dotnet_root, "C:\\Users\\<username>\\.dotnet");
});

test('keeps a value that itself contains "=" (manifest_expected ... exists=false)', () => {
  const diag = parseDiagLines(MISMATCH_OUTPUT);
  assert.ok(
    diag.manifest_expected.endsWith("exists=false"),
    diag.manifest_expected,
  );
});

test("returns {} for output with no [DIAG] lines", () => {
  assert.deepStrictEqual(parseDiagLines("[ERROR] nope\n"), {});
  assert.deepStrictEqual(parseDiagLines(""), {});
  assert.deepStrictEqual(parseDiagLines(undefined), {});
});

console.log("\n=== classifyDotnetSetupFailure ===");

test("exit 2 -> dotnet_sdk_not_found, no elevation hint", () => {
  const r = classifyDotnetSetupFailure(
    err(2, "[ERROR] .NET SDK (dotnet) is not installed"),
  );
  assert.strictEqual(r.error_category, "dotnet_sdk_not_found");
  assert.ok(!/elevated privileges/i.test(r.message), r.message);
  assert.ok(/install the \.NET SDK manually/i.test(r.message));
  // Exit 2 now means the script's own user-scope auto-install was skipped or
  // failed — the message must say so, and name the usual cause (offline/proxy).
  assert.ok(/could not auto-install/i.test(r.message), r.message);
  assert.ok(/http_proxy\/https_proxy/.test(r.message), r.message);
});

// The install guidance used to hardcode winget, so an Ubuntu user whose setup
// exited 2 was told to run a Windows-only command. It is now keyed off the
// platform the runner executes on.
test("exit 2 on linux suggests dotnet-install.sh first (no sudo), apt as alternative, never winget", () => {
  const r = classifyDotnetSetupFailure(err(2, ""), "linux");
  assert.ok(!/winget/i.test(r.message), r.message);
  assert.ok(/apt-get install -y dotnet-sdk-8\.0/.test(r.message), r.message);
  assert.ok(/dotnet-install\.sh/.test(r.message), r.message);
  // The copy-pasteable command is the no-sudo user-scope route, not apt.
  assert.ok(
    /dotnet-install\.sh/.test(r.suggested_command),
    r.suggested_command,
  );
  assert.ok(!/sudo/.test(r.suggested_command), r.suggested_command);
});

test("exit 2 on darwin suggests brew, never winget", () => {
  const r = classifyDotnetSetupFailure(err(2, ""), "darwin");
  assert.ok(!/winget/i.test(r.message), r.message);
  assert.ok(/brew install --cask dotnet-sdk/.test(r.message), r.message);
  assert.strictEqual(r.suggested_command, "brew install --cask dotnet-sdk");
});

test("exit 2 on win32 still suggests winget, plus the no-admin user-scope route", () => {
  const r = classifyDotnetSetupFailure(err(2, ""), "win32");
  assert.ok(
    /winget install Microsoft\.DotNet\.SDK\.8/.test(r.message),
    r.message,
  );
  assert.ok(/dotnet-install\.ps1/.test(r.message), r.message);
  assert.strictEqual(
    r.suggested_command,
    "winget install Microsoft.DotNet.SDK.8",
  );
});

test("exit 2 on an unknown platform falls back to the portable linux guidance", () => {
  const r = classifyDotnetSetupFailure(err(2, ""), "freebsd");
  assert.ok(!/winget/i.test(r.message), r.message);
  assert.ok(/dotnet-install\.sh/.test(r.message), r.message);
});

test('prototype-property platform names also fall back, never leak "undefined"', () => {
  // A bare `SDK_INSTALL_GUIDANCE[platform] ||` resolved "constructor"/"toString"
  // to inherited functions — truthy, so the fallback was skipped and the string
  // "undefined" landed in the guidance. Unreachable from process.platform, but
  // the function is exported and takes arbitrary strings.
  for (const platform of [
    "constructor",
    "toString",
    "hasOwnProperty",
    "__proto__",
    "",
  ]) {
    const r = classifyDotnetSetupFailure(err(2, ""), platform);
    assert.ok(
      !/undefined/.test(r.message),
      `${platform}: ${r.message.slice(0, 120)}`,
    );
    assert.ok(
      /dotnet-install\.sh/.test(r.message),
      `${platform}: no linux fallback`,
    );
    assert.ok(
      /dotnet-install\.sh/.test(r.suggested_command),
      `${platform}: ${r.suggested_command}`,
    );
  }
});

test("exit 2 spells out that the workload comes from the RE-RUN, not the SDK install", () => {
  // Field report: a user installed the SDK from the suggested command and
  // believed setup was complete — nothing said the Tizen workload was still
  // missing and that re-running this setup is what installs it.
  const { message } = classifyDotnetSetupFailure(err(2, ""), "linux");
  assert.ok(/does NOT install the Tizen workload/i.test(message), message);
  assert.ok(/re-run this same setup/i.test(message), message);
  // apt/dnf installs are root-owned, so pre-warn about the sudo step on linux.
  assert.ok(/root-owned/i.test(message), message);
});

test("exit 2 on win32 does not carry the package-manager root-owned note", () => {
  const { message } = classifyDotnetSetupFailure(err(2, ""), "win32");
  assert.ok(/does NOT install the Tizen workload/i.test(message), message);
  assert.ok(!/root-owned/i.test(message), message);
});

test("exit 3 -> dotnet_workload_target_mismatch", () => {
  const r = classifyDotnetSetupFailure(err(3, MISMATCH_OUTPUT));
  assert.strictEqual(r.error_category, "dotnet_workload_target_mismatch");
});

test("exit 3 message names both SDKs, the manifest band and DOTNET_ROOT", () => {
  const { message } = classifyDotnetSetupFailure(err(3, MISMATCH_OUTPUT));
  assert.ok(message.includes("10.0.302"), "in-use SDK missing");
  assert.ok(
    message.includes("9.0.304"),
    "the SDK the installer walked is missing",
  );
  assert.ok(message.includes("9.0.300"), "manifest band missing");
  assert.ok(
    message.includes("C:\\Users\\<username>\\.dotnet"),
    "DOTNET_ROOT missing",
  );
});

test("exit 3 explicitly rules out elevation (this is the #258 mis-diagnosis)", () => {
  const { message } = classifyDotnetSetupFailure(err(3, MISMATCH_OUTPUT));
  assert.ok(!/Administrator PowerShell/i.test(message), message);
  assert.ok(/NOT a permissions problem/i.test(message), message);
});

test("exit 3 carries the [DIAG] facts as structured details", () => {
  const { details } = classifyDotnetSetupFailure(err(3, MISMATCH_OUTPUT));
  assert.ok(Array.isArray(details));
  assert.ok(
    details.some((d) => d.startsWith("sdk_band=10.0.300")),
    details.join(" | "),
  );
  assert.ok(
    details.some((d) => d.startsWith("installer_checked_sdks=9.0.304")),
  );
});

test("exit 3 that ALSO reports a permission problem does not deny it", () => {
  // Regression guard: the categorical "NOT a permissions problem" wording was
  // emitted unconditionally, so a permission failure could be answered with
  // "do not retry with elevated privileges" — the #258 mis-diagnosis inverted.
  const withPermission = MISMATCH_OUTPUT.replace(
    "[DIAG] permission_denied=false",
    "[DIAG] permission_denied=true",
  );
  const { message } = classifyDotnetSetupFailure(err(3, withPermission));
  assert.ok(!/NOT a permissions problem/i.test(message), message);
  assert.ok(/permission problem/i.test(message), message);
  assert.ok(/resolve the permission failure first/i.test(message), message);
});

test('exit 3 omits placeholder [DIAG] values instead of printing "(none)"', () => {
  const sparse = [
    "[DIAG] dotnet_version=10.0.302",
    "[DIAG] sdk_band=10.0.300",
    "[DIAG] dotnet_root=/usr/share/dotnet",
    "[DIAG] env_dotnet_root=(unset)",
    "[DIAG] installer_checked_sdks=(none)",
    "[DIAG] installer_checked_bands=(none)",
    "[DIAG] manifest_found_in_bands=(none)",
    "[DIAG] permission_denied=false",
  ].join("\n");
  const { message } = classifyDotnetSetupFailure(err(3, sparse));
  assert.ok(!message.includes("(none)"), message);
  assert.ok(!message.includes("(unset)"), message);
});

test("exit 1 WITHOUT a permission problem -> io_error, no elevation talk", () => {
  const r = classifyDotnetSetupFailure(
    err(1, "[ERROR] Fallback 'dotnet workload install tizen' failed (exit 1)."),
  );
  assert.strictEqual(r.error_category, "io_error");
  assert.ok(!/elevated|sudo|Administrator/i.test(r.message), r.message);
});

test("exit 1 WITH a permission problem -> dotnet_workload_permission_denied", () => {
  const r = classifyDotnetSetupFailure(
    err(1, "No permission to install. Try run with administrator mode."),
  );
  assert.strictEqual(r.error_category, "dotnet_workload_permission_denied");
});

test("permission failure on linux suggests sudo bash <script>, never PowerShell", () => {
  // The in-script sudo retry cannot prompt under the runner (no tty), so the
  // envelope must hand the user the exact elevated command to run instead.
  const out = [
    "No permission to install manifest. Try again with sudo.",
    "[DIAG] dotnet_root=/usr/lib/dotnet",
    "[DIAG] permission_denied=true",
  ].join("\n");
  const r = classifyDotnetSetupFailure(err(1, out), "linux", {
    scriptPath:
      "/home/user/.tizen/plugins/tizen-sdk/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh",
  });
  assert.strictEqual(r.error_category, "dotnet_workload_permission_denied");
  assert.strictEqual(
    r.suggested_command,
    'sudo bash "/home/user/.tizen/plugins/tizen-sdk/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"',
  );
  assert.ok(/\/usr\/lib\/dotnet/.test(r.message), r.message);
  assert.ok(/cannot prompt for a sudo password/i.test(r.message), r.message);
  assert.ok(!/Administrator PowerShell/i.test(r.message), r.message);
});

test("permission failure on win32 points at Administrator PowerShell, never sudo", () => {
  const r = classifyDotnetSetupFailure(
    err(1, "[DIAG] permission_denied=true"),
    "win32",
    { scriptPath: "C:\\plugins\\tizen-dotnet-setup.ps1" },
  );
  assert.strictEqual(r.error_category, "dotnet_workload_permission_denied");
  assert.ok(/Administrator/i.test(r.message), r.message);
  assert.ok(!/sudo/i.test(r.message), r.message);
  // Like the linux `sudo bash` branch, the fix must be paste-ready for the
  // elevated shell — resolveScript returns the .ps1 on win32.
  assert.strictEqual(
    r.suggested_command,
    'powershell -ExecutionPolicy Bypass -File "C:\\plugins\\tizen-dotnet-setup.ps1"',
  );
});

test("permission failure on win32 without a scriptPath still gives usable prose", () => {
  const r = classifyDotnetSetupFailure(
    err(1, "[DIAG] permission_denied=true"),
    "win32",
  );
  assert.strictEqual(r.error_category, "dotnet_workload_permission_denied");
  assert.ok(
    /Administrator PowerShell/i.test(r.suggested_command),
    r.suggested_command,
  );
  assert.ok(!/sudo/i.test(r.suggested_command), r.suggested_command);
});

test("permission failure without a scriptPath still gives usable prose", () => {
  const r = classifyDotnetSetupFailure(
    err(1, "[DIAG] permission_denied=true"),
    "linux",
  );
  assert.strictEqual(r.error_category, "dotnet_workload_permission_denied");
  assert.ok(/sudo bash/.test(r.suggested_command), r.suggested_command);
});

test('the word "sudo" in our own guidance text does not classify as permission', () => {
  // The old regex matched /denied|elevated|administrator|sudo/i against output
  // that legitimately mentions the sudo retry, firing the hint on unrelated failures.
  const r = classifyDotnetSetupFailure(
    err(
      1,
      "[WARN]  Retrying under sudo (you may be prompted for your password)...",
    ),
  );
  assert.strictEqual(r.error_category, "io_error");
});

// The three literals below are OUR OWN prose. Each used to be its own alternative
// in PERMISSION_PATTERN, so any failure whose log happened to contain the guidance
// got the elevation hint — the #258 mis-diagnosis, rebuilt from the other side.
// The sudo case above was covered; these paths were not.
test('our own "needs elevated permissions" warning does not classify as permission', () => {
  const r = classifyDotnetSetupFailure(
    err(
      1,
      "[WARN]  Install did not complete — this often means the .NET SDK dir needs elevated permissions.",
    ),
  );
  assert.strictEqual(r.error_category, "io_error");
});

test('our own "Run as Administrator" guidance does not classify as permission', () => {
  const r = classifyDotnetSetupFailure(
    err(
      1,
      "[ERROR] Re-run this setup from an elevated (Run as Administrator) PowerShell.",
    ),
  );
  assert.strictEqual(r.error_category, "io_error");
});

test('"Administrator PowerShell required" install guidance does not classify as permission', () => {
  const r = classifyDotnetSetupFailure(
    err(
      1,
      "[INFO]  Windows quick install options (Administrator PowerShell required):",
    ),
  );
  assert.strictEqual(r.error_category, "io_error");
});

test("[DIAG] permission_denied=false overrules permission-looking prose", () => {
  // The authoritative verdict is the script's own, computed from installer output.
  const r = classifyDotnetSetupFailure(
    err(
      1,
      [
        "[WARN]  Install did not complete — this often means the .NET SDK dir needs elevated permissions.",
        "[WARN]  Retrying under sudo (you may be prompted for your password)...",
        "[DIAG] permission_denied=false",
      ].join("\n"),
    ),
  );
  assert.strictEqual(r.error_category, "io_error");
  assert.ok(
    !/elevated|Administrator/i.test(r.message.split(" — ")[0]),
    r.message,
  );
});

test("[DIAG] permission_denied=true classifies as permission even without tool wording", () => {
  const r = classifyDotnetSetupFailure(err(1, "[DIAG] permission_denied=true"));
  assert.strictEqual(r.error_category, "dotnet_workload_permission_denied");
});

test("real tool wording still classifies as permission when no [DIAG] block exists", () => {
  for (const line of [
    "Access to the path 'C:\\Program Files\\dotnet\\metadata' is denied.",
    "System.UnauthorizedAccessException: Access to the path is denied",
    "mkdir: cannot create directory: Permission denied",
    "No permission to install. Try run with administrator mode.",
  ]) {
    const r = classifyDotnetSetupFailure(err(1, line));
    assert.strictEqual(
      r.error_category,
      "dotnet_workload_permission_denied",
      `missed: ${line}`,
    );
  }
});

console.log("\n=== parseWorkloadStatus / summarizeSuccessWarnings ===");

// Field report (Ubuntu): a run whose FALLBACK performed the install came back
// as workload_status "already_installed", because /already installed/ matched
// the SAMSUNG installer's manifest line — not our idempotency sentence.
const RECOVERED_RUN = [
  "[OK]    .NET SDK found: dotnet 8.0.130",
  "Tizen Workload 10.0.121 version is already installed.", // Samsung, about the MANIFEST
  "No permission to install manifest. Try again with sudo.",
  "[WARN]  Samsung installer failed.",
  "[INFO]  Method 2 (fallback): dotnet workload install tizen ",
  "[OK]    Fallback workload install completed.",
  "[OK]    Tizen workload installed successfully.",
].join("\n");

test("the Samsung installer's manifest wording does not mean 'already_installed'", () => {
  assert.strictEqual(parseWorkloadStatus(RECOVERED_RUN), "installed");
});

test("our own idempotency sentence DOES mean 'already_installed'", () => {
  assert.strictEqual(
    parseWorkloadStatus(
      "[OK]    Tizen workload is already installed.\n[INFO]  Run again with --force to reinstall.",
    ),
    "already_installed",
  );
});

test("a recovered run prepends the no-action clarifier to its warnings", () => {
  const warnings = summarizeSuccessWarnings(RECOVERED_RUN);
  assert.ok(warnings.length >= 2, warnings.join("\n"));
  assert.ok(/setup SUCCEEDED/.test(warnings[0]), warnings[0]);
  assert.ok(/No action is needed/.test(warnings[0]), warnings[0]);
  // The historical failure lines are still there, after the clarifier.
  assert.ok(
    warnings.some((w) => /No permission to install/.test(w)),
    warnings.join("\n"),
  );
});

test("a clean run gets no clarifier and no warnings", () => {
  const clean = [
    "[OK]    .NET SDK found: dotnet 8.0.130",
    "[OK]    Tizen workload is already installed.",
  ].join("\n");
  assert.deepStrictEqual(summarizeSuccessWarnings(clean), []);
});

test("a success with only unrelated warnings (e.g. DOTNET_ROOT mismatch) gets no clarifier", () => {
  const out = [
    "[WARN]  DOTNET_ROOT (/opt/old) does not match the dotnet being used (/usr/lib/dotnet).",
    "[OK]    Tizen workload installed successfully.",
  ].join("\n");
  const warnings = summarizeSuccessWarnings(out);
  assert.ok(
    !warnings.some((w) => /setup SUCCEEDED/.test(w)),
    warnings.join("\n"),
  );
  assert.ok(warnings.some((w) => /DOTNET_ROOT/.test(w)));
});

// Field report (Ubuntu): right after the user-scope auto-install, the SAME
// already-open shell failed with "/usr/bin/dotnet: No such file or directory"
// (stale command hash from a removed apt install). The script prints the
// hash -r hint as log_info, which the envelope filters out — so the envelope
// must restate it, or the CLI user never sees it.
test("a unix auto-install adds the stale-hash hint to the envelope warnings", () => {
  const out = [
    "[WARN]  dotnet is not on PATH — searching for an existing .NET SDK install...",
    "[*] === Installing the .NET SDK (user-scope, no sudo) ===",
    "[OK]    .NET SDK installed to /home/user/.dotnet",
    "[OK]    Tizen workload installed successfully.",
  ].join("\n");
  const warnings = summarizeSuccessWarnings(out);
  const hint = warnings.find((w) => /hash -r/.test(w));
  assert.ok(hint, warnings.join("\n"));
  assert.ok(/~\/\.dotnet/.test(hint), hint);
  assert.ok(/rehash/.test(hint), hint);
  // It is a hint, not a recovered-failure clarifier.
  assert.ok(
    !warnings.some((w) => /setup SUCCEEDED/.test(w)),
    warnings.join("\n"),
  );
});

test("a windows auto-install adds the new-terminal hint instead of hash -r", () => {
  const out = [
    "[WARN]  dotnet is not on PATH - searching for an existing .NET SDK install...",
    "[*] === Installing the .NET SDK (user-scope, no admin rights) ===",
    "[OK]    .NET SDK installed to C:\\Users\\me\\AppData\\Local\\Microsoft\\dotnet",
    "[OK]    Tizen workload installed successfully.",
  ].join("\n");
  const warnings = summarizeSuccessWarnings(out);
  const hint = warnings.find((w) => /LOCALAPPDATA/.test(w));
  assert.ok(hint, warnings.join("\n"));
  assert.ok(/new terminal/i.test(hint), hint);
  assert.ok(!warnings.some((w) => /hash -r/.test(w)), warnings.join("\n"));
});

test("a run without the auto-install gets no user-scope hint", () => {
  const clean = [
    "[OK]    .NET SDK found: dotnet 8.0.130",
    "[OK]    Tizen workload is already installed.",
  ].join("\n");
  assert.ok(
    !summarizeSuccessWarnings(clean).some((w) =>
      /hash -r|LOCALAPPDATA/.test(w),
    ),
  );
});

console.log("\n=== summarizeDotnetSetupOutput ===");

test("keeps [DIAG] lines so they survive into envelope warnings", () => {
  const lines = summarizeDotnetSetupOutput(MISMATCH_OUTPUT);
  assert.ok(
    lines.some((l) => l.includes("[DIAG] sdk_band=10.0.300")),
    lines.join("\n"),
  );
});

test("[DIAG] survives a noisy log that exceeds the line budget", () => {
  // The [DIAG] block is printed LAST while the summarizer keeps the FIRST N
  // matches, so folding both into one budget dropped exactly the useful lines.
  const noise = Array.from(
    { length: 40 },
    (_, i) => `[WARN]  Failed to install Tizen Workload for sdk 9.0.${100 + i}`,
  ).join("\n");
  const lines = summarizeDotnetSetupOutput(`${noise}\n${MISMATCH_OUTPUT}`);
  assert.ok(
    lines.some((l) => l.includes("[DIAG] sdk_band=10.0.300")),
    lines.join("\n"),
  );
  assert.ok(lines.some((l) => l.includes("[DIAG] permission_denied=false")));
});

test("still drops redundant success chatter", () => {
  const lines = summarizeDotnetSetupOutput(
    "[OK]    .NET SDK found: dotnet 10.0.302\n[WARN]  DOTNET_ROOT does not match\n",
  );
  assert.ok(!lines.some((l) => l.includes(".NET SDK found")));
  assert.ok(lines.some((l) => l.includes("DOTNET_ROOT does not match")));
});

console.log("\n=== script <-> parser contract ===");

// The [DIAG] block and the "Install target:" line are a contract between two
// scripts and one parser, kept in sync BY HAND. Nothing else would notice a
// rename: the failure mode is silent — a key quietly missing from the envelope,
// or dotnet_root/sdk_band quietly null. These tests are the enforcement.
const SCRIPT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "tizen-dotnet-setup",
);
const PS1 = fs.readFileSync(
  path.join(SCRIPT_DIR, "tizen-dotnet-setup.ps1"),
  "utf8",
);
const SH = fs.readFileSync(
  path.join(SCRIPT_DIR, "tizen-dotnet-setup.sh"),
  "utf8",
);
const DOTNET_JS = fs.readFileSync(
  path.join(__dirname, "..", "core", "dotnet.js"),
  "utf8",
);

const diagKeysIn = (src) =>
  [...src.matchAll(/\[DIAG\]\s+([A-Za-z_][A-Za-z0-9_]*)=/g)].map((m) => m[1]);

test(".ps1 and .sh emit the identical [DIAG] key set", () => {
  const ps1Keys = diagKeysIn(PS1);
  const shKeys = diagKeysIn(SH);
  assert.ok(
    ps1Keys.length > 0,
    "no [DIAG] keys found in .ps1 — did the format change?",
  );
  assert.deepStrictEqual(
    ps1Keys,
    shKeys,
    `.ps1 emits [${ps1Keys}] but .sh emits [${shKeys}]`,
  );
});

test("every [DIAG] key dotnet.js reads is emitted by BOTH scripts", () => {
  const consumed = [
    ...new Set([...DOTNET_JS.matchAll(/\bdiag\.([a-z_]+)/g)].map((m) => m[1])),
  ];
  assert.ok(
    consumed.length > 0,
    "no diag.<key> reads found — did the accessor style change?",
  );
  const ps1Keys = diagKeysIn(PS1);
  const shKeys = diagKeysIn(SH);
  const orphaned = consumed.filter(
    (k) => !ps1Keys.includes(k) || !shKeys.includes(k),
  );
  assert.deepStrictEqual(
    orphaned,
    [],
    `dotnet.js reads keys no script emits: ${orphaned}`,
  );
});

test("parseDiagLines survives CRLF (the .ps1 case) without leaking CR into values", () => {
  const crlf = MISMATCH_OUTPUT.split("\n").join("\r\n");
  const diag = parseDiagLines(crlf);
  assert.strictEqual(diag.sdk_band, "10.0.300");
  const dirty = Object.keys(diag).filter((k) => /[\r\n]/.test(diag[k]));
  assert.deepStrictEqual(dirty, [], `values still carry CR/LF: ${dirty}`);
});

// ---------------------------------------------------------------------------
// The exit-3 decision is implemented twice, in two languages. A 36-case
// differential run (single/multi bands, membership at first/middle/last
// position, substring-looking needles, empty lists, permission override)
// showed the two agreeing — but only after two semantic gaps were closed:
//
//   * .sh used `case ",$list," in *",$needle,"*)`, a SUBSTRING test, so a needle
//     spanning several entries matched where PowerShell's element compare did not.
//   * .ps1 used -notcontains, which is case-INsensitive, unlike .sh's `=`.
//
// Neither is reachable while bands come from sdk_band()/Get-SdkBand (numeric,
// comma-free), so nothing else would catch a regression to those forms.
// ---------------------------------------------------------------------------
test(".sh decides band membership by exact element, not substring", () => {
  assert.ok(
    /band_in_list "\$SDK_BAND" "\$MANIFEST_BANDS"/.test(SH) &&
      /band_in_list "\$SDK_BAND" "\$INSTALLER_CHECKED_BANDS"/.test(SH),
    "both WRONG_BAND clauses must go through band_in_list()",
  );
  assert.ok(
    !/case ",\$(MANIFEST_BANDS|INSTALLER_CHECKED_BANDS)," in/.test(SH),
    'the substring `case ",$list," in *",$needle,"*` form is back — it accepts needles spanning entries',
  );
});

test(".ps1 compares bands case-sensitively (-cnotcontains), matching .sh", () => {
  const decision = SH && PS1.slice(PS1.indexOf("$wrongBand ="));
  assert.ok(
    /-cnotcontains/.test(decision),
    "$wrongBand must use -cnotcontains",
  );
  assert.ok(
    !/[^c]-notcontains/.test(decision),
    "bare -notcontains is case-insensitive, unlike the .sh `=` comparison",
  );
});

test("both scripts test permission BEFORE the wrong-band branch", () => {
  // Order matters: a permission failure wrote nothing, so band evidence is a
  // symptom. Reversing these is how "this is NOT a permissions problem" got
  // attached to permission problems.
  const shTail = SH.slice(SH.lastIndexOf("[DIAG] permission_denied="));
  const shPerm = shTail.indexOf('if [ "$PERMISSION_DENIED" = true ]');
  const shBand = shTail.indexOf('if [ "$WRONG_BAND" = true ]');
  assert.ok(
    shPerm !== -1 && shBand !== -1,
    ".sh: could not locate both branches",
  );
  assert.ok(
    shPerm < shBand,
    `.sh checks WRONG_BAND (${shBand}) before PERMISSION_DENIED (${shPerm})`,
  );

  const psTail = PS1.slice(PS1.lastIndexOf("[DIAG] permission_denied="));
  const psPerm = psTail.indexOf("if ($permissionDenied)");
  const psBand = psTail.indexOf("if ($wrongBand)");
  assert.ok(
    psPerm !== -1 && psBand !== -1,
    ".ps1: could not locate both branches",
  );
  assert.ok(
    psPerm < psBand,
    `.ps1 checks $wrongBand (${psBand}) before $permissionDenied (${psPerm})`,
  );
});

console.log("\n=== parseInstallTarget ===");

test("parses the .ps1 form (Write-Info prefix, path with spaces)", () => {
  const r = parseInstallTarget(
    "[INFO]  Install target: C:\\Program Files\\dotnet (SDK 10.0.302, band 10.0.300)",
  );
  assert.strictEqual(r.dotnet_root, "C:\\Program Files\\dotnet");
  assert.strictEqual(r.sdk_band, "10.0.300");
});

test("parses the .sh form, including ANSI colour from log_info on a tty", () => {
  const esc = String.fromCharCode(27);
  const plain = parseInstallTarget(
    "[INFO]  Install target: /usr/share/dotnet (SDK 10.0.302, band 10.0.300)",
  );
  assert.strictEqual(plain.dotnet_root, "/usr/share/dotnet");
  assert.strictEqual(plain.sdk_band, "10.0.300");

  // common.sh: log_info() { echo -e "${BLUE}[INFO]${NC}  $*" >&2; }
  const coloured = parseInstallTarget(
    `${esc}[0;34m[INFO]${esc}[0m  Install target: /usr/share/dotnet (SDK 10.0.302, band 10.0.300)`,
  );
  assert.deepStrictEqual(coloured, plain, "ANSI colour codes broke the match");
});

test("an unparseable SDK version yields nulls, not a half-filled result", () => {
  // Get-SdkBand/sdk_band return empty, so the line renders "band )".
  const r = parseInstallTarget(
    "[INFO]  Install target: /usr/share/dotnet (SDK weird, band )",
  );
  assert.deepStrictEqual(r, { dotnet_root: null, sdk_band: null });
});

test("both scripts really print the line parseInstallTarget expects", () => {
  for (const [name, src] of [
    ["ps1", PS1],
    ["sh", SH],
  ]) {
    const m = src.match(/Install target: [^"]*"/);
    assert.ok(m, `${name}: no "Install target:" line found`);
    // Render the template with concrete values, then round-trip it.
    const rendered = m[0]
      .replace(/"$/, "")
      .replace(/\$\{?\w+\}?/g, (v) =>
        /band|BAND/i.test(v)
          ? "10.0.300"
          : /version|VERSION/i.test(v)
            ? "10.0.302"
            : "/opt/dotnet",
      );
    const r = parseInstallTarget(rendered);
    assert.strictEqual(
      r.sdk_band,
      "10.0.300",
      `${name}: rendered "${rendered}" -> ${JSON.stringify(r)}`,
    );
    assert.strictEqual(
      r.dotnet_root,
      "/opt/dotnet",
      `${name}: rendered "${rendered}" -> ${JSON.stringify(r)}`,
    );
  }
});

console.log("\n=== envelope wiring ===");

test("dotnet_workload_target_mismatch maps to TIZEN_SDK_DOTNET_E002", () => {
  const { error_category, message, details } = classifyDotnetSetupFailure(
    err(3, MISMATCH_OUTPUT),
  );
  const env = formatError(
    "tizen-sdk dotnet-setup",
    error_category,
    message,
    null,
    Date.now(),
    details,
  );
  assert.strictEqual(env.status, "failure");
  assert.strictEqual(env.errors[0].error_code, "TIZEN_SDK_DOTNET_E002");
  assert.strictEqual(
    env.errors[0].error_category,
    "dotnet_workload_target_mismatch",
  );
  assert.ok(
    Array.isArray(env.errors[0].details) && env.errors[0].details.length > 0,
  );
  assert.ok(/DOTNET_ROOT/i.test(env.errors[0].suggested_fix.command));
});

test("dotnet_sdk_not_found maps to TIZEN_SDK_DOTNET_E001 (was UNKNOWN_E001)", () => {
  const { error_category, message } = classifyDotnetSetupFailure(err(2, ""));
  const env = formatError(
    "tizen-sdk dotnet-setup",
    error_category,
    message,
    null,
    Date.now(),
  );
  assert.strictEqual(env.errors[0].error_code, "TIZEN_SDK_DOTNET_E001");
  assert.strictEqual(
    env.errors[0].suggested_fix.guide_url,
    "https://dotnet.microsoft.com/download",
  );
});

test("dotnet_workload_permission_denied maps to TIZEN_SDK_DOTNET_E003 with the sudo command", () => {
  // Mirrors setupDotnet's exact call for the Ubuntu apt-SDK scenario.
  const { error_category, message, details, suggested_command } =
    classifyDotnetSetupFailure(
      err(
        1,
        "No permission to install manifest. Try again with sudo.\n[DIAG] dotnet_root=/usr/lib/dotnet\n[DIAG] permission_denied=true",
      ),
      "linux",
      {
        scriptPath:
          "/home/user/.tizen/plugins/tizen-sdk/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh",
      },
    );
  const env = formatError(
    "tizen-sdk dotnet-setup",
    error_category,
    message,
    suggested_command,
    Date.now(),
    details,
  );
  assert.strictEqual(env.errors[0].error_code, "TIZEN_SDK_DOTNET_E003");
  assert.strictEqual(
    env.errors[0].error_category,
    "dotnet_workload_permission_denied",
  );
  assert.ok(
    /^sudo bash "/.test(env.errors[0].suggested_fix.command),
    env.errors[0].suggested_fix.command,
  );
});

test("every branch routes suggested_command through the envelope consistently", () => {
  // The classify → setupDotnet → formatError contract, per branch:
  //   exit 2 / permission : classify SUPPLIES the command -> lands verbatim
  //   exit 3              : classify supplies NONE        -> registry E002 fallback
  //   generic io_error    : classify supplies NONE        -> no suggested_fix at all
  //                         (IO_ERROR has no registry fix and none should appear)
  const run = (e) => {
    const r = classifyDotnetSetupFailure(e, "linux", {
      scriptPath: "/opt/s.sh",
    });
    const env = formatError(
      "tizen-sdk dotnet-setup",
      r.error_category,
      r.message,
      r.suggested_command || null,
      Date.now(),
      r.details,
    );
    return { r, fix: env.errors[0].suggested_fix };
  };

  const sdk = run(err(2, ""));
  assert.strictEqual(sdk.fix.command, sdk.r.suggested_command);

  const perm = run(err(1, "[DIAG] permission_denied=true"));
  assert.strictEqual(perm.fix.command, perm.r.suggested_command);
  assert.strictEqual(perm.fix.command, 'sudo bash "/opt/s.sh"');

  const mismatch = run(
    err(
      3,
      "[DIAG] sdk_band=10.0.300\n[DIAG] manifest_found_in_bands=9.0.300\n[DIAG] permission_denied=false",
    ),
  );
  assert.strictEqual(mismatch.r.suggested_command, undefined);
  assert.ok(
    /DOTNET_ROOT/.test(mismatch.fix.command),
    "registry E002 fallback expected",
  );

  const generic = run(err(1, "[ERROR] Could not download Samsung installer."));
  assert.strictEqual(generic.r.suggested_command, undefined);
  assert.strictEqual(
    generic.fix,
    undefined,
    "io_error must not grow a suggested_fix",
  );
});

test("a suggestedCommand override preserves guide_url for EVERY registry shape", () => {
  // The conditional spread in formatError must behave for all three registry
  // shapes — fix+guide_url (preserve it), fix-only (no key to preserve, no
  // crash), and no-suggested_fix-at-all (short-circuit, no crash) — plus the
  // unknown-category literal. Sweep the whole registry so a future entry of
  // any shape is covered automatically.
  for (const def of Object.values(ERROR_CODES)) {
    const regUrl = (def.suggested_fix && def.suggested_fix.guide_url) || null;
    const env = formatError(
      "cmd",
      def.error_category,
      "msg",
      "OVERRIDE_CMD",
      Date.now(),
    );
    const fix = env.errors[0].suggested_fix;
    assert.ok(
      fix,
      `${def.error_category}: suggested_fix missing under override`,
    );
    assert.strictEqual(fix.command, "OVERRIDE_CMD", def.error_category);
    assert.strictEqual(
      fix.guide_url,
      regUrl,
      `${def.error_category}: guide_url ${JSON.stringify(fix.guide_url)} != registry ${JSON.stringify(regUrl)}`,
    );

    // Passthrough (no override) must keep matching the registry too.
    const env2 = formatError(
      "cmd",
      def.error_category,
      "msg",
      null,
      Date.now(),
    );
    const fix2 = env2.errors[0].suggested_fix;
    if (def.suggested_fix) {
      assert.strictEqual(
        fix2.guide_url,
        regUrl,
        `${def.error_category}: passthrough guide_url drifted`,
      );
    } else {
      assert.strictEqual(
        fix2,
        undefined,
        `${def.error_category}: passthrough grew a suggested_fix`,
      );
    }
  }

  // Unregistered category -> UNKNOWN_E001 literal with no suggested_fix:
  // the spread's `errorDef.suggested_fix &&` guard must short-circuit safely.
  const env = formatError(
    "cmd",
    "no_such_category_xyz",
    "msg",
    "OVERRIDE_CMD",
    Date.now(),
  );
  assert.strictEqual(env.errors[0].error_code, "TIZEN_SDK_UNKNOWN_E001");
  assert.strictEqual(env.errors[0].suggested_fix.command, "OVERRIDE_CMD");
  assert.strictEqual(env.errors[0].suggested_fix.guide_url, null);
});

test("the envelope suggested_fix is platform-correct AND keeps the guide_url", () => {
  // Mirrors setupDotnet's call exactly: the classifier's suggested_command is
  // passed through formatError, which must not drop the registry's guide_url.
  const { error_category, message, suggested_command } =
    classifyDotnetSetupFailure(err(2, ""), "linux");
  const env = formatError(
    "tizen-sdk dotnet-setup",
    error_category,
    message,
    suggested_command,
    Date.now(),
  );
  assert.ok(
    /dotnet-install\.sh/.test(env.errors[0].suggested_fix.command),
    env.errors[0].suggested_fix.command,
  );
  assert.ok(!/winget/i.test(env.errors[0].suggested_fix.command));
  assert.strictEqual(
    env.errors[0].suggested_fix.guide_url,
    "https://dotnet.microsoft.com/download",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
