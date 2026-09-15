// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * shell-safety tests
 *
 * Every value that execPluginScript / runSdb splice into a command line goes
 * through a shell. These tests pin the shared screen (core/shell-safety.js)
 * and the two boundaries that adopted it:
 *   - sdb.resolveSerial: an explicit --serial is checked before any caller
 *     renders `-s "<serial>"`
 *   - sdb-helper.buildCommand shell-command: the Windows branch refuses a
 *     command cmd.exe cannot carry safely inside a quoted argument
 * Real paths with spaces, parentheses, apostrophes and non-ASCII must keep
 * working — the screen is about the quote boundary, not about tidiness.
 */

const {
  shellUnsafeReason,
  checkShellSafe,
  isValidSerial,
} = require("../core/shell-safety");
const { resolveSerial } = require("../core/sdb");
const { buildCommand } = require("../core/sdb-helper");

console.log("=== shell-safety Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

// Test 1: values that must pass
console.log("Test 1: shellUnsafeReason accepts real paths");
const safe = [
  "/home/user/tizen-apps/MyApp",
  "C:\\Users\\me\\tizen-apps\\MyApp",
  "C:/Program Files (x86)/Tizen/rootstrap.zip",
  "/w/John's Project/app",
  "/w/프로젝트/앱",
  "/tmp/a b c/x.tpk",
  "relative/dir",
];
for (const v of safe)
  check(`  ${JSON.stringify(v)}`, shellUnsafeReason(v), null);

// Test 2: values that must be rejected
console.log("\nTest 2: shellUnsafeReason rejects the quote boundary breakers");
const unsafe = [
  '/w/app"; rm -rf ~; "',
  "/w/app`id`",
  "/w/$(id)/app",
  "/w/app; calc",
  "/w/app | tee x",
  "/w/app && calc",
  "/w/app < in",
  "/w/app > out",
  "/w/app\nrm -rf ~",
  "/w/app\r\nrm",
  "C:\\Users\\me\\app\\",
];
for (const v of unsafe) {
  check(
    `  ${JSON.stringify(v)} is rejected`,
    typeof shellUnsafeReason(v),
    "string",
  );
}
check(
  "  trailing backslash names the reason",
  /backslash/.test(shellUnsafeReason("C:\\x\\")),
  true,
);

// Test 3: checkShellSafe envelope contract
console.log("\nTest 3: checkShellSafe envelope");
check("  empty value → null", checkShellSafe("", "path", "tizen-sdk x"), null);
check(
  "  undefined → null",
  checkShellSafe(undefined, "path", "tizen-sdk x"),
  null,
);
check(
  "  safe value → null",
  checkShellSafe("/w/app", "path", "tizen-sdk x"),
  null,
);
const env = checkShellSafe(
  '/w/app"&calc',
  "project path",
  "tizen-sdk build-project",
  Date.now(),
);
check("  unsafe → failure envelope", env && env.status, "failure");
check(
  "  unsafe → invalid_parameters",
  env && env.errors[0].error_category,
  "invalid_parameters",
);
check(
  "  message names the label",
  /project path/.test(env.errors[0].message),
  true,
);
check("  command is kept", env.command, "tizen-sdk build-project");

// Test 4: serial pattern
console.log("\nTest 4: isValidSerial");
for (const s of [
  "emulator-26101",
  "0123456789ABCDEF",
  "192.168.0.10:26101",
  "a.b_c-d",
]) {
  check(`  ${s} valid`, isValidSerial(s), true);
}
for (const s of ['x" & calc & "', "$(curl x|sh)", "emu 26101", "emu;ls", ""]) {
  check(`  ${JSON.stringify(s)} invalid`, isValidSerial(s), false);
}

// Test 5: resolveSerial screens an explicit serial before any sdb call
// (an invalid serial must return without touching sdb — the fake sdbPath
// would otherwise fail with io_error).
console.log("\nTest 5: resolveSerial rejects an unsafe explicit serial");
const bad = resolveSerial("/nonexistent/sdb", 'emu"&calc');
check("  errorCategory", bad.errorCategory, "invalid_parameters");
check(
  "  message mentions the serial",
  /Invalid device serial/.test(bad.message),
  true,
);
const good = resolveSerial("/nonexistent/sdb", "emulator-26101");
check("  valid explicit serial passes through", good, {
  serial: "emulator-26101",
});

// Test 6: shell-command on Windows refuses quotes and percent signs
console.log("\nTest 6: buildCommand shell-command host-shell guard");
const quoted = buildCommand(
  "shell-command",
  "emulator-26101",
  'run shell command echo "hi" & calc',
);
if (process.platform === "win32") {
  check("  win32: quote → empty command", quoted.command, "");
  check(
    "  win32: quote → note explains",
    /cmd\.exe/.test(quoted.note || ""),
    true,
  );
  const percent = buildCommand(
    "shell-command",
    "emulator-26101",
    "shell echo %PATH%",
  );
  check("  win32: percent → empty command", percent.command, "");
} else {
  check(
    "  posix: quote is escaped for the host shell",
    quoted.command.includes('echo \\"hi\\" & calc'),
    true,
  );
}
const plain = buildCommand(
  "shell-command",
  "emulator-26101",
  "run shell command ls -la",
);
check(
  "  plain command still builds",
  plain.command.startsWith('-s "emulator-26101" shell "ls -la;'),
  true,
);

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
