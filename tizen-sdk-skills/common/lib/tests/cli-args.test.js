// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI argument-contract tests
 *
 * Covers the shared option-parsing layer in cli-runner.js and the CLI-level
 * contract of sdb-helper-cli.js:
 *   - parseArgs: flag binding (space and = forms), booleans, `--` separator,
 *     UsageError on unknown options / missing values, default booleanFlags
 *   - sdb-helper-cli.js spawned as a child process:
 *     usage errors → invalid_parameters envelope on STDERR, exit 1;
 *     missing --request → Standard JSON Envelope from the core on STDOUT
 *     (these paths terminate before any sdb/SDK access, so they are
 *     environment-independent)
 */

const { spawnSync } = require("child_process");
const path = require("path");
const { parseArgs, UsageError } = require("../cli/cli-runner");

console.log("=== cli-args Test ===\n");

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

function checkThrowsUsage(name, fn) {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  const ok = thrown instanceof UsageError && thrown.__usage === true;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok ? "" : ` — got ${thrown ? thrown.constructor.name : "no throw"}`),
  );
}

const OPTS = { "--request": "request", "--serial": "serial" };
const BOOLS = { "--verbose": "verbose" };

// Test 1: parseArgs binding
console.log("Test 1: parseArgs flag binding");
check(
  "  space form",
  parseArgs(["--request", "tail the logs"], OPTS, BOOLS).options,
  { request: "tail the logs" },
);
check(
  "  equals form",
  parseArgs(["--request=open a shell", "--serial=emulator-26101"], OPTS, BOOLS)
    .options,
  { request: "open a shell", serial: "emulator-26101" },
);
check("  boolean flag", parseArgs(["--verbose"], OPTS, BOOLS).options, {
  verbose: true,
});
check(
  "  boolean equals-false form",
  parseArgs(["--verbose=false"], OPTS, BOOLS).options,
  { verbose: false },
);
check(
  "  -- separator makes the rest positional",
  parseArgs(["--", "--request", "x"], OPTS, BOOLS).positional,
  ["--request", "x"],
);
check(
  "  value starting with -- accepted when not a known flag",
  parseArgs(["--request", "--myOddName"], OPTS, BOOLS).options,
  { request: "--myOddName" },
);
check(
  "  bare tokens are positional",
  parseArgs(["scan", "192.168.1.0"], OPTS, BOOLS).positional,
  ["scan", "192.168.1.0"],
);

// Test 2: parseArgs usage errors
console.log("\nTest 2: parseArgs usage errors");
checkThrowsUsage("  unknown option (space form)", () =>
  parseArgs(["--bogus", "x"], OPTS, BOOLS),
);
checkThrowsUsage("  unknown option (equals form)", () =>
  parseArgs(["--bogus=x"], OPTS, BOOLS),
);
checkThrowsUsage("  missing value at end of args", () =>
  parseArgs(["--request"], OPTS, BOOLS),
);
checkThrowsUsage("  known flag where a value was expected", () =>
  parseArgs(["--request", "--serial"], OPTS, BOOLS),
);

// Test 3: booleanFlags defaults to {} when omitted
console.log("\nTest 3: booleanFlags default");
check(
  "  space form without booleanFlags",
  parseArgs(["--request", "x"], OPTS).options,
  { request: "x" },
);
check(
  "  equals form without booleanFlags (regression: unguarded deref)",
  parseArgs(["--request=x"], OPTS).options,
  { request: "x" },
);

// Test 4: sdb-helper-cli.js CLI contract (spawned; no sdb/SDK access needed)
console.log("\nTest 4: sdb-helper-cli.js contract");
const CLI = path.join(__dirname, "..", "cli", "sdb-helper-cli.js");

function runCliProc(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// 4a. Missing --request → core validation → Standard JSON Envelope on STDOUT
{
  const r = runCliProc([]);
  check("  no args: exit code", r.status, 1);
  let env = null;
  try {
    env = JSON.parse(r.stdout);
  } catch (_e) {
    /* handled by checks below */
  }
  check("  no args: stdout is JSON", env !== null, true);
  check("  no args: status", env && env.status, "failure");
  check(
    "  no args: error_category",
    env && env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
  check(
    "  no args: suggested_fix present",
    Boolean(env && env.errors && env.errors[0].suggested_fix),
    true,
  );
}

// 4b. Unknown option → usage envelope on STDERR, empty STDOUT
{
  const r = runCliProc(["--bogus"]);
  check("  unknown option: exit code", r.status, 1);
  check("  unknown option: stdout empty", r.stdout.trim(), "");
  let env = null;
  try {
    env = JSON.parse(r.stderr);
  } catch (_e) {
    /* handled by checks below */
  }
  check("  unknown option: stderr is JSON", env !== null, true);
  check(
    "  unknown option: code",
    env && env.errors && env.errors[0].code,
    "invalid_parameters",
  );
  check(
    "  unknown option: message names the flag",
    Boolean(env && env.errors[0].message.includes("--bogus")),
    true,
  );
}

// 4c. Old positional calling convention → rejected with usage envelope
{
  const r = runCliProc(["tail the logs", "emulator-26101"]);
  check("  positional args: exit code", r.status, 1);
  let env = null;
  try {
    env = JSON.parse(r.stderr);
  } catch (_e) {
    /* handled by checks below */
  }
  check(
    "  positional args: message says unexpected",
    Boolean(env && env.errors[0].message.includes("Unexpected argument(s)")),
    true,
  );
}

// 4d. --request without a value → usage envelope
{
  const r = runCliProc(["--request"]);
  check("  missing value: exit code", r.status, 1);
  let env = null;
  try {
    env = JSON.parse(r.stderr);
  } catch (_e) {
    /* handled by checks below */
  }
  check(
    "  missing value: message says value required",
    Boolean(env && env.errors[0].message.includes("requires a value")),
    true,
  );
}

// ---------------------------------------------------------------------------
// 5. dotnet-setup-cli.js: the --sdk-channel value is interpolated into an
//    execSync shell string, so setupDotnet()'s charset validation is the only
//    barrier between argv and the shell. These paths reject BEFORE script
//    resolution/execution, so they are environment-independent.
// ---------------------------------------------------------------------------
console.log("\n--- dotnet-setup-cli.js: sdk-channel validation gate ---");

const DOTNET_CLI = path.join(__dirname, "..", "cli", "dotnet-setup-cli.js");

function runDotnetCliProc(args) {
  const r = spawnSync(process.execPath, [DOTNET_CLI, ...args], {
    encoding: "utf-8",
    timeout: 30000,
  });
  let env = null;
  try {
    env = JSON.parse(r.stdout);
  } catch (_e) {
    /* handled by checks below */
  }
  return { r, env };
}

// 5a. Shell metacharacters in --sdk-channel → invalid_parameters, exit 1.
//     Flags are given FIRST (before any positional) to pin the anywhere-in-argv
//     parsing — the old tail-only scan read `--sdk-channel X` as force+version.
{
  const { r, env } = runDotnetCliProc([
    "--sdk-channel",
    '9.0"; rm -rf /tmp/x; echo "',
  ]);
  check("  metachar channel: exit code", r.status, 1);
  check(
    "  metachar channel: invalid_parameters",
    env && env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
}

// 5b. A hyphen-led value (mistyped flag swallowed as the channel) is rejected
//     at validation instead of reaching the script as a bogus argument.
{
  const { r, env } = runDotnetCliProc(["--sdk-channel", "--no-install-sdk"]);
  check("  hyphen-led channel: exit code", r.status, 1);
  check(
    "  hyphen-led channel: invalid_parameters",
    env && env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
}

// 5c. A trailing --sdk-channel with NO value must fail, not silently fall
//     back to the default channel (the tizen-cli/commander path errors on a
//     missing <channel> value — the runner's failure mode must match).
{
  const { r, env } = runDotnetCliProc(["--sdk-channel"]);
  check("  valueless channel: exit code", r.status, 1);
  check(
    "  valueless channel: invalid_parameters",
    env && env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
}

// 5d. The workload version positional goes through the same gate.
{
  const { r, env } = runDotnetCliProc(["-", "10.0.1;whoami"]);
  check("  metachar version: exit code", r.status, 1);
  check(
    "  metachar version: invalid_parameters",
    env && env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
}

// Test 6: device-manager-cli.js action parsing (spawned; no sdb/SDK access)
//   `node device-manager-cli.js stop` used to read "stop" as timeoutSec and fail
//   with "Invalid timeout: stop" (TIZEN_SDK_PARAM_E001) because the runner
//   hard-coded action=start. Every case below pairs the action with an invalid
//   timeout so manageDevice() returns at validation — the envelope's `command`
//   (which manageDevice derives from the action) proves what was parsed, and
//   the tizen-device-manager script is never run (no emulator is stopped).
console.log("\nTest 6: device-manager-cli.js action parsing");
const DEVICE_CLI = path.join(__dirname, "..", "cli", "device-manager-cli.js");

function runDeviceCliProc(args) {
  const r = spawnSync(process.execPath, [DEVICE_CLI, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
  let env = null;
  try {
    env = JSON.parse(r.stdout);
  } catch (_e) {
    /* handled by checks below */
  }
  return { r, env };
}

const firstMessage = (env) =>
  (env && env.errors && env.errors[0] && env.errors[0].message) || "";

// 6a. Bare `stop` is the action, not the timeout (the reported bug).
{
  const { r, env } = runDeviceCliProc(["stop", "abc"]);
  check("  bare stop: exit code", r.status, 1);
  check(
    "  bare stop: command carries the stop action",
    env && env.command,
    "tizen-sdk device-manager stop",
  );
  check(
    "  bare stop: the timeout complaint is about abc, not stop",
    firstMessage(env).includes("Invalid timeout: abc"),
    true,
  );
}

// 6b. `--action stop` / `--action=stop` — same spelling as tizen-cli.
for (const form of [
  ["--action", "stop", "abc"],
  ["--action=stop", "abc"],
  ["abc", "--action", "stop"],
]) {
  const { env } = runDeviceCliProc(form);
  check(
    `  ${form.join(" ")}: command carries the stop action`,
    env && env.command,
    "tizen-sdk device-manager stop",
  );
  check(
    `  ${form.join(" ")}: positional timeout still validated`,
    firstMessage(env).includes("Invalid timeout: abc"),
    true,
  );
}

// 6c. Historical positional convention unchanged: first token is timeoutSec.
{
  const { env } = runDeviceCliProc(["abc"]);
  check(
    "  legacy positional: start action",
    env && env.command,
    "tizen-sdk device-manager",
  );
  check(
    "  legacy positional: first token is the timeout",
    firstMessage(env).includes("Invalid timeout: abc"),
    true,
  );
}

// 6d. Explicit `start` is accepted and shifts the positionals.
{
  const { env } = runDeviceCliProc(["start", "abc"]);
  check(
    "  explicit start: start action",
    env && env.command,
    "tizen-sdk device-manager",
  );
  check(
    "  explicit start: next token is the timeout",
    firstMessage(env).includes("Invalid timeout: abc"),
    true,
  );
}

// 6e. Unknown / valueless --action → invalid_parameters from the core.
for (const form of [["--action", "bogus"], ["--action"]]) {
  const { r, env } = runDeviceCliProc(form);
  check(`  ${form.join(" ")}: exit code`, r.status, 1);
  check(
    `  ${form.join(" ")}: invalid_parameters`,
    env && env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
  check(
    `  ${form.join(" ")}: message names the action`,
    firstMessage(env).includes("Invalid action"),
    true,
  );
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
