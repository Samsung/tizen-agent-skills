// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Tests for the post-launch running verification in tizen-install-app.sh and
 * the APP_RUNNING parsing wired into lib/core/project.js.
 *
 * 'app_launcher -s' printing "successfully launched pid = N" only proves
 * launchpad forked the process — an app that crashes on startup (classic
 * cause: /opt full of crash dumps) still prints it. run_app() now polls
 * `app_launcher -S` (running list) and emits a tri-state APP_RUNNING marker:
 *   yes      the app id showed up in the running list
 *   no       -S worked but the app vanished → warn about /opt
 *   unknown  -S unusable on this profile → exact legacy behavior
 *
 * RPM platform apps are not in app_launcher's list; run_rpm_app() launches
 * /usr/bin/<name> and polls `pgrep -f <name>` instead, emitting the same
 * yes/no marker (never unknown — pgrep always answers).
 *
 * Stub knobs:
 *   STUB_RUNNING_LIST  what `app_launcher -S` reports:
 *     "present" → running list containing the app id
 *     "absent"  → a valid running list without it
 *     "error"   → the -S flag is not supported on this profile
 *   STUB_PGREP         what `pgrep -f <name>` reports for the rpm path:
 *     "found"   → a pid
 *     "missing" → nothing (process gone)
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

console.log("=== Install-App Launch Verify Test ===\n");

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

const SCRIPT_PATH = path.join(
  __dirname,
  "../../scripts/tizen-install-app/tizen-install-app.sh",
);

check("tizen-install-app.sh exists", fs.existsSync(SCRIPT_PATH), SCRIPT_PATH);
if (!fs.existsSync(SCRIPT_PATH)) {
  console.log(`\n=== CRITICAL: script missing at ${SCRIPT_PATH} ===`);
  process.exit(1);
}

if (process.platform === "win32") {
  console.log(
    "\nSKIP: behavioural tests need bash (see tizen-install-app.ps1 for the Windows path)",
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

const APP_ID = "xA4DHr9cFv.MyTizenWebApp";
const RPM_NAME = "my-platform-project";
const RPM_PKG = `${RPM_NAME}-1.0.0-1.x86_64.rpm`;

const STUB_SDB = `#!/usr/bin/env bash
# Stub sdb for install-app tests — see install-app-launch-verify.test.js.
set -u
printf 'sdb %s\\n' "$*" >> "$STUB_LOG"

# Drop a leading "-s <serial>" so the remaining args are the plain command.
if [ "\${1:-}" = "-s" ]; then shift 2; fi

case "\${1:-}" in
  devices)
    echo "List of devices attached"
    echo "emulator-26101          device          my-vm"
    ;;
  root|push)
    ;;
  shell)
    shift
    case "$*" in
      "rpm -ivh "*|"rpm -Uvh "*)
        echo "Preparing...   ################# [100%]"
        ;;
      "rpm -q "*)
        echo "${RPM_NAME}-1.0.0-1.x86_64"
        ;;
      "ls /usr/bin/"*)
        echo "/usr/bin/${RPM_NAME}"
        ;;
      "command -v su")
        echo "/bin/su"
        ;;
      "su - owner "*)
        echo "PID=4242"
        ;;
      "pgrep -f "*)
        [ "\${STUB_PGREP:-found}" = "found" ] && echo "4242"
        ;;
      "tail -n 20 "*)
        echo "failed to connect to display: wayland-0"
        ;;
      "app_launcher -l")
        echo "	 Application List for user 5001"
        echo "	 User's Application"
        echo "	 Name                                     AppID"
        echo "	 'MyTizenWebApp'                          '${APP_ID}'"
        ;;
      "app_launcher -s "*)
        echo "... successfully launched pid = 4242 with debug 0"
        ;;
      "app_launcher -S")
        case "\${STUB_RUNNING_LIST:-present}" in
          present)
            echo "	 Application List for user 5001"
            echo "	 'MyTizenWebApp' (${APP_ID}) pid: 4242"
            ;;
          absent)
            echo "	 Application List for user 5001"
            echo "	 'SomeOtherApp' (org.tizen.other) pid: 99"
            ;;
          error)
            echo "app_launcher: unknown option -- S"
            echo "usage: app_launcher [OPTION]"
            ;;
        esac
        ;;
    esac
    ;;
esac
exit 0
`;

const STUB_TZ = `#!/usr/bin/env bash
printf 'tz %s\\n' "$*" >> "$STUB_LOG"
echo "Installed the package"
exit 0
`;

function makeTree(pkgName = "MyTizenWebApp-1.0.0.wgt") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-install-test-"));
  const toolsDir = path.join(root, "sdk", "tools");
  fs.mkdirSync(path.join(toolsDir, "tizen-core"), { recursive: true });
  fs.writeFileSync(path.join(toolsDir, "sdb"), STUB_SDB, { mode: 0o755 });
  fs.writeFileSync(path.join(toolsDir, "tizen-core", "tz"), STUB_TZ, {
    mode: 0o755,
  });
  const pkg = path.join(root, pkgName);
  fs.writeFileSync(pkg, "stub package");
  return {
    root,
    sdk: path.join(root, "sdk"),
    pkg,
    log: path.join(root, "log"),
  };
}

function runInstall(args, stubEnv = {}, pkgName) {
  const tree = makeTree(pkgName);
  fs.writeFileSync(tree.log, "");
  const result = spawnSync("bash", [SCRIPT_PATH, "-p", tree.pkg, ...args], {
    encoding: "utf8",
    timeout: 60000,
    env: {
      ...process.env,
      // The rpm path writes ~/bin/run-<name>.sh — keep it inside the temp tree.
      HOME: tree.root,
      TIZEN_SDK_PATH: tree.sdk,
      STUB_LOG: tree.log,
      ...stubEnv,
    },
  });
  const code = typeof result.status === "number" ? result.status : 1;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const calls = fs.readFileSync(tree.log, "utf8").split("\n").filter(Boolean);
  fs.rmSync(tree.root, { recursive: true, force: true });
  return { code, output, calls };
}

const statusPolls = (calls) =>
  calls.filter((c) => c.includes("app_launcher -S")).length;

// --- 1. App stays running → APP_RUNNING=yes ---------------------------------
console.log("\n--- app running after launch ---");
{
  const r = runInstall(["-r"], { STUB_RUNNING_LIST: "present" });
  check("install+run exits 0", r.code === 0, `exit=${r.code}\n${r.output}`);
  check(
    "APP_RUNNING=yes emitted",
    r.output.includes("APP_RUNNING=yes"),
    r.output,
  );
  check(
    "verified message logged",
    r.output.includes("App is running (verified via app_launcher -S)"),
    r.output,
  );
  check(
    "found on the first poll",
    statusPolls(r.calls) === 1,
    r.calls.join("\n"),
  );
}

// --- 2. App vanished → APP_RUNNING=no + /opt hints, still success -----------
console.log("\n--- app exited right after launch ---");
{
  const r = runInstall(["-r"], { STUB_RUNNING_LIST: "absent" });
  check(
    "install still exits 0 (install DID succeed)",
    r.code === 0,
    `exit=${r.code}`,
  );
  check(
    "APP_RUNNING=no emitted",
    r.output.includes("APP_RUNNING=no"),
    r.output,
  );
  check(
    "warning names the /opt partition",
    r.output.includes("df -h /opt"),
    r.output,
  );
  check(
    "warning names the crash-dump dir and root on",
    r.output.includes("/opt/usr/share/crash/dump") &&
      r.output.includes("root on"),
    r.output,
  );
  check(
    "all 3 polls were spent",
    statusPolls(r.calls) === 3,
    r.calls.join("\n"),
  );
}

// --- 3. -S unsupported → APP_RUNNING=unknown, legacy behavior ----------------
console.log("\n--- app_launcher -S unusable on this profile ---");
{
  const r = runInstall(["-r"], { STUB_RUNNING_LIST: "error" });
  check("install exits 0", r.code === 0, `exit=${r.code}`);
  check(
    "APP_RUNNING=unknown emitted",
    r.output.includes("APP_RUNNING=unknown"),
    r.output,
  );
  check(
    "no /opt warning when the check was inconclusive",
    !r.output.includes("df -h /opt"),
    r.output,
  );
  check(
    "gave up after the first poll",
    statusPolls(r.calls) === 1,
    r.calls.join("\n"),
  );
}

// --- 4. Install-only (no -r) → no APP_RUNNING marker at all ------------------
console.log("\n--- install without launch ---");
{
  const r = runInstall([]);
  check("install-only exits 0", r.code === 0, `exit=${r.code}`);
  check("no APP_RUNNING line", !r.output.includes("APP_RUNNING="), r.output);
  check("no -S poll issued", statusPolls(r.calls) === 0, r.calls.join("\n"));
}

const pgrepPolls = (calls) =>
  calls.filter((c) => c.includes(`pgrep -f ${RPM_NAME}`)).length;

// --- 5. RPM platform app stays running → APP_RUNNING=yes via pgrep ------------
console.log("\n--- rpm platform app running after launch ---");
{
  const r = runInstall(["-r"], { STUB_PGREP: "found" }, RPM_PKG);
  check("rpm install+run exits 0", r.code === 0, `exit=${r.code}\n${r.output}`);
  check(
    "launched via /usr/bin binary as owner, not app_launcher",
    r.calls.some((c) => c.includes("su - owner")) &&
      !r.calls.some((c) => c.includes("app_launcher")),
    r.calls.join("\n"),
  );
  check(
    "App launched successfully (PID) logged",
    /App launched successfully \(PID: 4242\)/.test(r.output),
    r.output,
  );
  check(
    "APP_RUNNING=yes emitted",
    r.output.includes("APP_RUNNING=yes"),
    r.output,
  );
  check(
    "pgrep answered on the first poll",
    pgrepPolls(r.calls) === 1,
    r.calls.join("\n"),
  );
}

// --- 6. RPM platform app vanished → APP_RUNNING=no + app-log, no /opt advice --
console.log("\n--- rpm platform app exited right after launch ---");
{
  const r = runInstall(["-r"], { STUB_PGREP: "missing" }, RPM_PKG);
  check(
    "install still exits 0 (rpm install DID succeed)",
    r.code === 0,
    `exit=${r.code}`,
  );
  check(
    "APP_RUNNING=no emitted",
    r.output.includes("APP_RUNNING=no"),
    r.output,
  );
  check(
    "device app log surfaced with a display hint",
    r.output.includes("[ERROR] app-log: failed to connect to display") &&
      r.output.includes("display server connection failed"),
    r.output,
  );
  check(
    "no /opt crash-dump advice on the rpm path",
    !r.output.includes("df -h /opt"),
    r.output,
  );
  check(
    "all 5 pgrep polls were spent",
    pgrepPolls(r.calls) === 5,
    r.calls.join("\n"),
  );
}

// --- 7. RPM install-only → no APP_RUNNING marker, no launch -----------------
console.log("\n--- rpm install without launch ---");
{
  const r = runInstall([], {}, RPM_PKG);
  check("rpm install-only exits 0", r.code === 0, `exit=${r.code}`);
  check("no APP_RUNNING line", !r.output.includes("APP_RUNNING="), r.output);
  check("no pgrep poll issued", pgrepPolls(r.calls) === 0, r.calls.join("\n"));
}

// --- project.js parsing ------------------------------------------------------
console.log("\n--- project.js APP_RUNNING parsing ---");
{
  const { parseAppRunning } = require("../core/project");
  check("yes → true", parseAppRunning("noise\nAPP_RUNNING=yes\nmore") === true);
  check("no → false", parseAppRunning("APP_RUNNING=no") === false);
  check("unknown → null", parseAppRunning("APP_RUNNING=unknown") === null);
  check(
    "absent marker → null (install-only / old script)",
    parseAppRunning("Installed the package") === null,
  );
  check("empty output → null", parseAppRunning("") === null);
  check(
    "CRLF line endings (Windows .ps1 output) still match",
    parseAppRunning("Found app ID: x.y\r\nAPP_RUNNING=no\r\n") === false,
  );
  check(
    "marker must fill the whole line (no substring false-positives)",
    parseAppRunning("echo APP_RUNNING=yes was skipped\nAPP_RUNNING=nope") ===
      null,
  );

  // The envelope wiring around the parser: field present, warning only on false.
  const source = fs.readFileSync(
    path.join(__dirname, "../core/project.js"),
    "utf8",
  );
  check(
    "install envelope carries app_running",
    /app_running:\s*appRunning/.test(source),
  );
  check(
    "warning is added ONLY on the strict false case",
    /appRunning === false/.test(source),
  );
  check(
    "/opt crash-dump warning is skipped for .rpm platform apps",
    /appRunning === false && !\/\\\.rpm\$\/i\.test\(resolvedPath\)/.test(
      source,
    ),
  );
  check(
    "summarizeInstallOutput skips the APP_RUNNING machine line",
    /skip:.*APP_RUNNING=/.test(source),
  );
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
