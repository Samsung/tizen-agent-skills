// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * runsInstallerInline() — the gate in front of every installer branch of
 * common/lib/core/sdk.js (installSdk, installTvSdk, updatePackage,
 * installSdkFromRepo, downloadEmulatorPackage, installPlatform,
 * downloadMobilePlatform, installRootstrap, installTvSdkFromZip).
 *
 * It must be true inside the pkg-compiled tizen-cli (process.pkg) and when the
 * integration suite sets TIZEN_SDK_INLINE_INSTALLER=1 — exactly "1", so a
 * stray "true"/"0" in someone's environment never flips an agent harness into
 * running a 15-minute install inline — and false otherwise.
 *
 * Run: node lib/tests/inline-installer.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runsInstallerInline } = require("../core/sdk");

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

const savedEnv = process.env.TIZEN_SDK_INLINE_INSTALLER;
const savedPkg = process.pkg;
function withEnv(value, fn) {
  if (value === undefined) delete process.env.TIZEN_SDK_INLINE_INSTALLER;
  else process.env.TIZEN_SDK_INLINE_INSTALLER = value;
  try {
    return fn();
  } finally {
    if (savedEnv === undefined) delete process.env.TIZEN_SDK_INLINE_INSTALLER;
    else process.env.TIZEN_SDK_INLINE_INSTALLER = savedEnv;
  }
}

console.log("=== runsInstallerInline Test ===\n");

test("false under plain node with the env var unset", () => {
  delete process.pkg;
  withEnv(undefined, () => assert.strictEqual(runsInstallerInline(), false));
});

test("true when TIZEN_SDK_INLINE_INSTALLER=1", () => {
  delete process.pkg;
  withEnv("1", () => assert.strictEqual(runsInstallerInline(), true));
});

test('only the exact value "1" enables it', () => {
  delete process.pkg;
  for (const v of ["true", "0", "yes", "", " 1"])
    withEnv(v, () =>
      assert.strictEqual(
        runsInstallerInline(),
        false,
        `value ${JSON.stringify(v)}`,
      ),
    );
});

test("true inside a pkg binary regardless of the env var", () => {
  process.pkg = { entrypoint: "tizen-sdk" };
  try {
    withEnv(undefined, () => assert.strictEqual(runsInstallerInline(), true));
    withEnv("0", () => assert.strictEqual(runsInstallerInline(), true));
  } finally {
    if (savedPkg === undefined) delete process.pkg;
    else process.pkg = savedPkg;
  }
});

test("every installer branch in sdk.js goes through the helper", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "core", "sdk.js"),
    "utf-8",
  );
  const direct = src.match(/const isPkg = !!process\.pkg;/g) || [];
  assert.strictEqual(
    direct.length,
    0,
    `${direct.length} branch(es) still read process.pkg directly`,
  );
  const viaHelper = src.match(/const isPkg = runsInstallerInline\(\);/g) || [];
  assert.strictEqual(
    viaHelper.length,
    9,
    `expected 9 gates, found ${viaHelper.length}`,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
