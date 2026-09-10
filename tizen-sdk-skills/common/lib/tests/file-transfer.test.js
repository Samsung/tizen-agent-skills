// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * file-transfer tests (issue #95)
 *
 * Covers the environment-independent surface of the tizen-file-transfer stack:
 *   - normalizeLocalPath: Windows backslash paths are accepted (normalized),
 *     not rejected
 *   - fileTransfer parameter validation: every path returns an
 *     invalid_parameters envelope BEFORE any sdb/SDK/plugin-cache access
 *   - classifyTransferFailure: a missing remote object on pull is reported as
 *     remote_path_not_found (not a bare io_error), with a "do not retry" fix
 *   - summarizeFileTransferOutput: sdb's "cannot stat ... No such file" line
 *     survives the warning filter
 *
 * Run: node lib/tests/file-transfer.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  fileTransfer,
  normalizeLocalPath,
  classifyTransferFailure,
  summarizeFileTransferOutput,
} = require("../core/file-transfer");
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

async function run() {
  console.log("=== normalizeLocalPath ===");

  test("Windows drive path: backslashes become forward slashes", () => {
    assert.strictEqual(normalizeLocalPath("C:\\logs\\"), "C:/logs/");
  });
  test("mixed separators are unified", () => {
    assert.strictEqual(
      normalizeLocalPath("C:\\Users\\me/out\\log.txt"),
      "C:/Users/me/out/log.txt",
    );
  });
  test("POSIX path is untouched", () => {
    assert.strictEqual(normalizeLocalPath("/tmp/logs/"), "/tmp/logs/");
  });
  test("undefined / empty pass through", () => {
    assert.strictEqual(normalizeLocalPath(undefined), undefined);
    assert.strictEqual(normalizeLocalPath(""), "");
  });

  console.log("\n=== fileTransfer parameter validation (no sdb access) ===");

  const validation = async (label, args, expectMessageRe) => {
    const env = await fileTransfer(...args);
    test(label, () => {
      assert.strictEqual(env.status, "failure", JSON.stringify(env));
      assert.strictEqual(env.errors[0].error_category, "invalid_parameters");
      if (expectMessageRe) assert.match(env.errors[0].message, expectMessageRe);
    });
    return env;
  };

  await validation("bad direction", ["copy", "/a", "/b"], /Invalid direction/);
  await validation("missing remote", ["pull", undefined, ""], /Remote path/);
  await validation("push without local", ["push", "", "/tmp/x"], /Local path/);
  await validation(
    "bad serial",
    ["pull", undefined, "/tmp/x", "emu;rm -rf"],
    /Invalid device serial/,
  );
  await validation(
    "shell metachar in local path",
    ["pull", "/tmp/$(whoami)", "/tmp/x"],
    /Local path contains unsupported characters/,
  );
  await validation(
    "shell metachar in remote path",
    ["pull", undefined, "/tmp/`id`"],
    /Remote path contains unsupported characters/,
  );
  await validation(
    "backslash in REMOTE path is still rejected (device paths are POSIX)",
    ["pull", undefined, "C:\\tmp\\x"],
    /Remote path contains unsupported characters/,
  );

  // push with a host path that does not exist must fail BEFORE sdb, name the
  // path, and tell the caller not to retry it.
  {
    const missing = path.join(os.tmpdir(), `tz-ft-missing-${process.pid}.bin`);
    const env = await validation(
      "push: missing local path fails before sdb with a named path",
      ["push", missing, "/tmp/x"],
      /Local path not found/,
    );
    test("push: missing local path message names the path", () => {
      assert.ok(env.errors[0].message.includes(missing.replace(/\\/g, "/")));
    });
    test("push: missing local path carries a do-not-retry fix", () => {
      assert.match(env.errors[0].suggested_fix.command, /do not retry/i);
    });
  }

  // A Windows-style LOCAL path must NOT be rejected as invalid_parameters.
  // It proceeds to the script stage, where (with no device / SDK in a unit
  // test) it fails for an unrelated reason — any category but
  // invalid_parameters proves the path passed validation.
  {
    const tmpFile = path.join(os.tmpdir(), `tz-ft-src-${process.pid}.txt`);
    fs.writeFileSync(tmpFile, "x");
    try {
      const winStyle = tmpFile.replace(/\//g, "\\");
      const env = await fileTransfer("push", winStyle, "/tmp/x", "emulator-0");
      test("push: Windows backslash local path passes validation", () => {
        assert.notStrictEqual(
          env.errors && env.errors[0] && env.errors[0].error_category,
          "invalid_parameters",
          JSON.stringify(env),
        );
      });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  }

  console.log("\n=== classifyTransferFailure ===");

  const sdbMissing =
    "[INFO]  Pulling: /tmp/log.txt -> C:/logs/\ncannot stat '/tmp/log.txt': No such file or directory\n[ERROR] Transfer failed (sdb exit code: 1)\nDEVICE_SERIAL=emulator-26101\n";

  test("pull + sdb 'cannot stat' → remote_path_not_found", () => {
    const v = classifyTransferFailure(sdbMissing, "pull");
    assert.strictEqual(v.category, "remote_path_not_found");
    assert.match(v.message, /does not exist on the device/);
    assert.match(v.suggestedFix, /do not retry the same path/i);
  });

  test("pull + script pre-check marker → remote_path_not_found with the path", () => {
    const v = classifyTransferFailure(
      "[ERROR] Remote path does not exist on device emulator-26101: /tmp/log.txt\nDEVICE_SERIAL=emulator-26101\nREMOTE_NOT_FOUND=/tmp/log.txt\n",
      "pull",
    );
    assert.strictEqual(v.category, "remote_path_not_found");
    assert.ok(v.message.includes("/tmp/log.txt"), v.message);
  });

  test("push + same wording → stays io_error (local existence is checked up front)", () => {
    const v = classifyTransferFailure(sdbMissing, "push");
    assert.strictEqual(v.category, "io_error");
  });

  test("'No devices found' → device_not_found", () => {
    const v = classifyTransferFailure(
      "[ERROR] No devices found. Run device-manager first.",
      "pull",
    );
    assert.strictEqual(v.category, "device_not_found");
  });

  test("'Multiple devices found' → multiple_devices", () => {
    const v = classifyTransferFailure(
      "Found multiple devices:\n1. a\n2. b\n[ERROR] Multiple devices found. Please specify device serial with -s parameter.",
      "pull",
    );
    assert.strictEqual(v.category, "multiple_devices");
  });

  test("unrelated failure → io_error", () => {
    const v = classifyTransferFailure("[ERROR] sdb: connection reset", "pull");
    assert.strictEqual(v.category, "io_error");
  });

  console.log("\n=== registry ===");

  test("remote_path_not_found is registered with a do-not-retry suggested_fix", () => {
    const def = ERROR_CODES.REMOTE_PATH_NOT_FOUND;
    assert.ok(def, "REMOTE_PATH_NOT_FOUND missing from ERROR_CODES");
    assert.strictEqual(def.error_category, "remote_path_not_found");
    assert.match(def.error_code, /^TIZEN_SDK_IO_E\d{3}$/);
    assert.match(def.suggested_fix.command, /Do not retry the same path/);
  });

  console.log("\n=== summarizeFileTransferOutput ===");

  test("sdb's 'cannot stat' line survives the warning filter", () => {
    const lines = summarizeFileTransferOutput(sdbMissing);
    assert.ok(
      lines.some((l) => /cannot stat/.test(l)),
      `missing cause line in ${JSON.stringify(lines)}`,
    );
  });
  test("machine marker lines are filtered out", () => {
    const lines = summarizeFileTransferOutput(
      sdbMissing + "REMOTE_NOT_FOUND=/tmp/log.txt\n",
    );
    assert.ok(
      lines.every((l) => !/^(DEVICE_SERIAL|REMOTE_NOT_FOUND)=/.test(l)),
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
