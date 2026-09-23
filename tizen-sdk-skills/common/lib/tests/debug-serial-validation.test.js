// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * gdb-debug / dotnet-debug --serial screening.
 *
 * Both setup functions splice the serial into the script argument string
 * (`-Serial "<s>"` on Windows, `-s "<s>"` on POSIX) and the scripts pass it
 * to `sdb -s <s>`. The value must therefore be a plain device identifier:
 * the shared SERIAL_PATTERN (letters, digits, . _ : -), no leading "-"
 * (getopts / PowerShell -File would read it as the next option) and at most
 * 64 characters. A rejected serial must come back as invalid_parameters
 * BEFORE any script is resolved or run.
 *
 * Run: node lib/tests/debug-serial-validation.test.js
 */

const assert = require("assert");
const { setupGdbDebug, setupDotnetDebug } = require("../core/debug");
const { isValidSerial, SERIAL_PATTERN } = require("../core/shell-safety");

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed++;
        console.log(`  ok   ${name}`);
      },
      (e) => {
        failed++;
        console.log(`  FAIL ${name}`);
        console.log(`       ${e.message}`);
      },
    );
}

const REJECT = [
  "-Launch", // would be parsed as the next option
  "-N",
  "emulator 26101", // space splits the argument
  'emu"; rm -rf x', // quote / metacharacters
  "emu`whoami`",
  "emu$HOME",
  "emu|cat",
  "a".repeat(65), // over the cap
  "", // empty: rejected by isValidSerial (setup treats "" as "not given")
];
const ACCEPT = [
  "emulator-26101",
  "0123456789ABCDEF",
  "192.168.0.10:26101",
  "a".repeat(64),
];

(async () => {
  await test("SERIAL_PATTERN accepts real serial shapes", () => {
    for (const s of ACCEPT)
      assert.ok(isValidSerial(s), `${JSON.stringify(s)} should be valid`);
    assert.ok(SERIAL_PATTERN.test("dev_1.x"), "underscore/dot allowed");
  });

  await test("SERIAL_PATTERN rejects options, whitespace, metacharacters, length", () => {
    for (const s of REJECT)
      assert.ok(!isValidSerial(s), `${JSON.stringify(s)} should be rejected`);
  });

  await test("setupGdbDebug rejects a bad --serial with invalid_parameters", async () => {
    for (const s of REJECT.filter(Boolean)) {
      const env = await setupGdbDebug(
        "org.example.app",
        "C:/ws/app/Debug/tpk/bin/app",
        {
          serial: s,
        },
      );
      assert.strictEqual(env.status, "failure", `${JSON.stringify(s)}: status`);
      assert.strictEqual(
        env.errors[0].error_category,
        "invalid_parameters",
        `${JSON.stringify(s)}: category ${env.errors[0].error_category}`,
      );
      assert.ok(
        /Invalid device serial/.test(env.errors[0].message),
        `${JSON.stringify(s)}: message ${env.errors[0].message}`,
      );
    }
  });

  await test("setupDotnetDebug rejects a bad --serial with invalid_parameters", async () => {
    for (const s of REJECT.filter(Boolean)) {
      const env = await setupDotnetDebug("org.tizen.example.App", {
        serial: s,
      });
      assert.strictEqual(env.status, "failure", `${JSON.stringify(s)}: status`);
      assert.strictEqual(
        env.errors[0].error_category,
        "invalid_parameters",
        `${JSON.stringify(s)}: category ${env.errors[0].error_category}`,
      );
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
