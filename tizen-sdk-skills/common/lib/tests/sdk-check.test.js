// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * SDK installation status check tests
 *
 * Covers the file-only parts of the pre-install status check:
 *   - checkSdkInstallStatus: sdk.info is the completion marker
 *   - checkIfSdkAlreadyInstalled: stage 1 (local marker) short-circuits
 *     BEFORE the installer script's check mode is ever invoked
 *   - checkSdkInstallationViaScript: argument guard (no script run)
 *
 * Stage 2 (running tizen-sdk-install --check) needs the real installer script
 * and is deliberately not exercised here. Everything below runs against a
 * temp sandbox; nothing outside it is read or written.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  checkSdkInstallStatus,
  checkSdkInstallationViaScript,
  checkIfSdkAlreadyInstalled,
} = require("../core/sdk-commands");

console.log("=== SDK Install Status Check Test ===\n");

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

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-sdk-check-"));
const installedSdk = path.join(sandbox, "installed-sdk");
const emptySdk = path.join(sandbox, "empty-sdk");
const missingSdk = path.join(sandbox, "does-not-exist");
fs.mkdirSync(installedSdk);
fs.mkdirSync(emptySdk);
fs.writeFileSync(
  path.join(installedSdk, "sdk.info"),
  "TIZEN_SDK_INSTALLED_PATH=" + installedSdk,
);

(async () => {
  try {
    // --- 1. checkSdkInstallStatus --------------------------------------------
    console.log("--- checkSdkInstallStatus ---");
    {
      const r = checkSdkInstallStatus(installedSdk);
      check("sdk.info present → installed", r.installed, true);
      check("sdkPath echoed", r.sdkPath, installedSdk);
      check(
        "sdkInfoPath is <sdkPath>/sdk.info",
        r.sdkInfoPath,
        path.join(installedSdk, "sdk.info"),
      );
      check(
        "message says installed",
        r.message.includes("already installed"),
        true,
      );
    }
    {
      const r = checkSdkInstallStatus(emptySdk);
      check("dir without sdk.info → not installed", r.installed, false);
      check("sdkPath still echoed", r.sdkPath, emptySdk);
      check(
        "sdkInfoPath still reported (where the marker would be)",
        r.sdkInfoPath,
        path.join(emptySdk, "sdk.info"),
      );
      check(
        "message says not installed",
        r.message.includes("not installed"),
        true,
      );
    }
    {
      const r = checkSdkInstallStatus(missingSdk);
      check("non-existent dir → not installed (no throw)", r.installed, false);
    }
    {
      const r = checkSdkInstallStatus(null);
      check("null path → not installed", r.installed, false);
      check("null path → sdkPath null", r.sdkPath, null);
      check("null path → sdkInfoPath null", r.sdkInfoPath, null);
      check(
        "null path → message says not configured",
        r.message,
        "SDK path not configured",
      );
      check(
        "empty string behaves like null",
        checkSdkInstallStatus("").sdkPath,
        null,
      );
    }
    {
      // A marker at the wrong depth must not count.
      const nested = path.join(sandbox, "nested-sdk");
      fs.mkdirSync(path.join(nested, "tools"), { recursive: true });
      fs.writeFileSync(path.join(nested, "tools", "sdk.info"), "");
      check(
        "sdk.info in a subdirectory does not count",
        checkSdkInstallStatus(nested).installed,
        false,
      );
    }

    // --- 2. checkSdkInstallationViaScript: argument guard ----------------------
    console.log("\n--- checkSdkInstallationViaScript (guard only) ---");
    {
      const r = await checkSdkInstallationViaScript(null);
      check("null path → status error", r.status, "error");
      check("null path → exitCode 1", r.exitCode, 1);
      check("null path → alreadyInstalled false", r.alreadyInstalled, false);
      check("null path → message", r.message, "SDK path is required");
    }

    // --- 3. checkIfSdkAlreadyInstalled: stage-1 short-circuit ------------------
    console.log("\n--- checkIfSdkAlreadyInstalled ---");
    {
      // Marker present and no --force: must stop at stage 1 without touching
      // the installer script. This is what prevents an accidental reinstall.
      const r = await checkIfSdkAlreadyInstalled(installedSdk, false);
      check(
        "installed + no force → alreadyInstalled",
        r.alreadyInstalled,
        true,
      );
      check(
        "installed + no force → shouldProceed false",
        r.shouldProceed,
        false,
      );
      check(
        "installed + no force → reason mentions --force",
        r.reason.includes("--force"),
        true,
      );
    }
    {
      // Default for `force` must be false (same short-circuit).
      const r = await checkIfSdkAlreadyInstalled(installedSdk);
      check("force defaults to false", r.shouldProceed, false);
    }
    {
      // Result object is exactly the documented contract — agents read these keys.
      const r = await checkIfSdkAlreadyInstalled(installedSdk, false);
      check("result keys", Object.keys(r).sort(), [
        "alreadyInstalled",
        "reason",
        "shouldProceed",
      ]);
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
