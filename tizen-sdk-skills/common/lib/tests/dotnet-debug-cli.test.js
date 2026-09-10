// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * dotnet-debug-cli argument contract (issue #97)
 *
 * The bare "Debug my .NET Tizen app <id>" prompt reaches the runner with no
 * mode argument. On Tizen a normally-launched .NET app has no CoreCLR debug
 * transport, so attach can never succeed — the default MUST be launch.
 *
 * Run: node lib/tests/dotnet-debug-cli.test.js
 */

const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");
const { parseDotnetDebugArgs } = require("../cli/dotnet-debug-cli");

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

console.log("=== parseDotnetDebugArgs — default mode is launch ===");

test("no mode argument → launch", () => {
  const { appId, opts } = parseDotnetDebugArgs(["org.tizen.example.MyApp"]);
  assert.strictEqual(appId, "org.tizen.example.MyApp");
  assert.strictEqual(opts.launch, true);
});

test('"-" placeholder → launch', () => {
  const { opts } = parseDotnetDebugArgs([
    "org.tizen.example.MyApp",
    "-",
    "Program.cs:25",
  ]);
  assert.strictEqual(opts.launch, true);
  assert.strictEqual(opts.breakpoints, "Program.cs:25");
});

test("explicit launch → launch", () => {
  const { opts } = parseDotnetDebugArgs(["org.tizen.example.MyApp", "launch"]);
  assert.strictEqual(opts.launch, true);
});

test("explicit attach is the ONLY way to get attach", () => {
  const { opts } = parseDotnetDebugArgs(["org.tizen.example.MyApp", "attach"]);
  assert.strictEqual(opts.launch, false);
});

test("breakpoints '-' means none; port/serial pass through", () => {
  const { opts } = parseDotnetDebugArgs([
    "org.tizen.example.MyApp",
    "launch",
    "-",
    "4712",
    "emulator-26101",
  ]);
  assert.strictEqual(opts.breakpoints, "");
  assert.strictEqual(opts.port, "4712");
  assert.strictEqual(opts.serial, "emulator-26101");
});

console.log("\n=== runner process: usage error without appId ===");

test("no appId → invalid_parameters on stderr, exit 1, usage names launch first", () => {
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, "..", "cli", "dotnet-debug-cli.js")],
    { encoding: "utf8" },
  );
  assert.strictEqual(r.status, 1);
  const err = JSON.parse(r.stderr);
  assert.strictEqual(err.errors[0].code, "invalid_parameters");
  assert.match(err.errors[0].message, /\[launch\|attach\]/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
