// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Manual verification for docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Implementation Order
 * step 3: "Prove getAppInstallPath + sdb root on against a real emulator
 * now, not at step 15."
 *
 * Exercises the real common/lib/core/sdb-helper.js RDS primitives —
 * execute(), getAppInstallPath(), root() — against an actual connected
 * device/emulator. Not part of the automated suite: run-all.js only picks up
 * `*.test.js` in common/lib/tests/ (non-recursive), and this needs real
 * hardware to mean anything.
 *
 * Usage:
 *   node common/lib/tests/manual/verify-rds-sdb.js [serial]
 *
 * With no serial, auto-selects when exactly one device is connected (same
 * resolveSerial() the rest of sdb-helper uses). Requires TIZEN_SDK to be
 * configured (tizen-sdk-init) or sdb on PATH, and a device/emulator already
 * running — this script does not launch one.
 */

const { resolveSdbBinary, resolveSerial } = require("../../core/sdb");
const { execute, root, getAppInstallPath } = require("../../core/sdb-helper");

function log(label, value) {
  console.log(`${label}: ${value}`);
}

async function main() {
  const argSerial = process.argv[2];
  let failures = 0;

  const sdbResolved = resolveSdbBinary();
  if (sdbResolved.error) {
    console.error(`FATAL: could not resolve sdb binary: ${sdbResolved.error}`);
    process.exit(1);
  }
  log("sdb binary", `${sdbResolved.sdbPath} (source: ${sdbResolved.source})`);

  const serialResult = resolveSerial(sdbResolved.sdbPath, argSerial);
  if (serialResult.errorCategory) {
    console.error(`FATAL: ${serialResult.message}`);
    process.exit(1);
  }
  const serial = serialResult.serial;
  log("device serial", serial);

  // ── 1. execute(): baseline — does a plain shell command round-trip at all ──
  console.log("\n--- execute(serial, ['whoami']) ---");
  try {
    const whoami = await execute(serial, ["whoami"]);
    log("output", JSON.stringify(whoami.trim()));
    console.log("PASS execute() ran a shell command");
  } catch (err) {
    failures++;
    console.log(`FAIL execute() threw: ${err.message}`);
  }

  // ── 2. getAppInstallPath(): which of the 4 fallback tiers actually wins on
  //    this device/platform image, and does the resolved path really exist ──
  console.log("\n--- getAppInstallPath(serial) ---");
  try {
    const installPath = await getAppInstallPath(serial);
    log("resolved install path", installPath);
    console.log("PASS getAppInstallPath() resolved a path");
    try {
      await execute(serial, ["test", "-d", installPath]);
      console.log(`PASS ${installPath} exists on device (test -d)`);
    } catch (err) {
      failures++;
      console.log(
        `FAIL ${installPath} does NOT exist on device: ${err.message}`,
      );
    }
  } catch (err) {
    failures++;
    console.log(`FAIL getAppInstallPath() threw: ${err.message}`);
  }

  // ── 3. root(serial, 'on' / 'off'): does toggling actually change the
  //    device shell's effective uid ──
  console.log("\n--- root(serial, 'on') ---");
  try {
    const onOut = await root(serial, "on");
    log("output", JSON.stringify(onOut.trim()));
    const uid = (await execute(serial, ["id", "-u"])).trim();
    log("id -u after root on", uid);
    if (uid === "0") {
      console.log("PASS root on: id -u == 0");
    } else {
      failures++;
      console.log(`FAIL root on: expected id -u == 0, got "${uid}"`);
    }
  } catch (err) {
    failures++;
    console.log(`FAIL root('on') threw: ${err.message}`);
  }

  console.log("\n--- root(serial, 'off') ---");
  try {
    const offOut = await root(serial, "off");
    log("output", JSON.stringify(offOut.trim()));
    const uid = (await execute(serial, ["id", "-u"])).trim();
    log("id -u after root off", uid);
    if (uid !== "0") {
      console.log(`PASS root off: id -u == ${uid} (non-root)`);
    } else {
      console.log(
        "NOTE root off: id -u is still 0 — this device's shell may always be root regardless of the root toggle",
      );
    }
  } catch (err) {
    failures++;
    console.log(`FAIL root('off') threw: ${err.message}`);
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
