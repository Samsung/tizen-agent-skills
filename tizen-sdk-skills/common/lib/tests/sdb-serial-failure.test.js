// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * describeSerialFailure / onlineDevices tests (common/lib/core/sdb.js)
 *
 * The one place that turns a failed resolveSerial() result into envelope
 * fields, shared by sdb-helper, screenshot, project (install-app), vd
 * (remove-app) and dlog-analyzer. Before it existed each module hand-wrote
 * the mapping and they drifted (offline serials listed, categories collapsed,
 * suggested_fix present in one module and absent in the next). Covers:
 *   - the category is passed through for all four resolveSerial() categories
 *   - only online devices are listed, reduced to {serial, state}
 *   - multiple_devices: message and suggested_fix are built around the
 *     caller's serial option (default --serial <serial>), with the online
 *     serials spliced into every <serial> placeholder
 *   - device_not_found: no listing; suggested_fix is the caller's noDeviceFix
 *     or null (→ registry default in formatError)
 *   - detailLines: one "<serial> (<state>)" line per online device
 *
 * Plus a drift guard: every module that calls resolveSerial() and maps its
 * failure onto an envelope goes through describeSerialFailure(), so the next
 * device command cannot quietly add a sixth hand-written copy.
 */

const fs = require("fs");
const path = require("path");
const { describeSerialFailure, onlineDevices } = require("../core/sdb");

console.log("=== sdb describeSerialFailure Test ===\n");

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

const table = [
  { serial: "emulator-26101", state: "device", name: "T-1080" },
  { serial: "0000d1d2", state: "offline" },
  { serial: "192.168.0.10:26101", state: "device" },
  { serial: "abc", state: "unauthorized" },
];

// Test 1: onlineDevices
console.log("Test 1: onlineDevices");
check(
  "keeps state=device only, reduced to {serial, state}",
  onlineDevices(table),
  [
    { serial: "emulator-26101", state: "device" },
    { serial: "192.168.0.10:26101", state: "device" },
  ],
);
check("undefined → []", onlineDevices(undefined), []);
check("null entries tolerated", onlineDevices([null, table[0]]), [
  { serial: "emulator-26101", state: "device" },
]);

// Test 2: multiple_devices with the default serial option
console.log("\nTest 2: multiple_devices (default --serial <serial>)");
const multi = describeSerialFailure({
  errorCategory: "multiple_devices",
  message: "Multiple devices connected (x). Specify --serial to select one.",
  devices: table,
});
check("category", multi.category, "multiple_devices");
check("serials are the online ones", multi.serials, [
  "emulator-26101",
  "192.168.0.10:26101",
]);
check("devices are the online ones", multi.devices, [
  { serial: "emulator-26101", state: "device" },
  { serial: "192.168.0.10:26101", state: "device" },
]);
check(
  "message is rebuilt around the serial option",
  multi.message,
  "Multiple devices connected (emulator-26101, 192.168.0.10:26101). Pick one and re-run with --serial <serial>.",
);
check(
  "suggested_fix is sdb-helper's historical wording",
  multi.suggestedFix,
  "Re-run with --serial <one-of: emulator-26101, 192.168.0.10:26101>",
);
check("detailLines", multi.detailLines, [
  "emulator-26101 (device)",
  "192.168.0.10:26101 (device)",
]);

// Test 3: multiple_devices with a caller-specific serial option
console.log("\nTest 3: multiple_devices (custom serialOption)");
const dual = describeSerialFailure(
  { errorCategory: "multiple_devices", message: "m", devices: table },
  {
    serialOption:
      "--serial <serial> in tizen-cli, --device-serial <serial> in the plugin runner",
  },
);
check(
  "message uses the caller's option verbatim",
  dual.message,
  "Multiple devices connected (emulator-26101, 192.168.0.10:26101). Pick one and re-run with --serial <serial> in tizen-cli, --device-serial <serial> in the plugin runner.",
);
check(
  "every <serial> placeholder gets the online serials",
  dual.suggestedFix,
  "Re-run with --serial <one-of: emulator-26101, 192.168.0.10:26101> in tizen-cli, --device-serial <one-of: emulator-26101, 192.168.0.10:26101> in the plugin runner",
);
check(
  "option without a placeholder is used as-is",
  describeSerialFailure(
    { errorCategory: "multiple_devices", message: "m", devices: table },
    { serialOption: "the positional [serial] argument" },
  ).suggestedFix,
  "Re-run with the positional [serial] argument",
);

// Test 4: device_not_found
console.log("\nTest 4: device_not_found");
const none = describeSerialFailure({
  errorCategory: "device_not_found",
  message: "No connected Tizen device or emulator found.",
  devices: [{ serial: "0000d1d2", state: "offline" }],
});
check("category", none.category, "device_not_found");
check(
  "message passed through",
  none.message,
  "No connected Tizen device or emulator found.",
);
check("offline-only table → no devices", none.devices, []);
check("no detailLines", none.detailLines, []);
check(
  "suggestedFix null by default (registry fallback)",
  none.suggestedFix,
  null,
);
check(
  "noDeviceFix is used for device_not_found",
  describeSerialFailure(
    { errorCategory: "device_not_found", message: "n" },
    { noDeviceFix: "tizen-sdk device-manager" },
  ).suggestedFix,
  "tizen-sdk device-manager",
);
check(
  "noDeviceFix is NOT applied to multiple_devices",
  describeSerialFailure(
    { errorCategory: "multiple_devices", message: "m", devices: table },
    { noDeviceFix: "tizen-sdk device-manager" },
  ).suggestedFix,
  "Re-run with --serial <one-of: emulator-26101, 192.168.0.10:26101>",
);

// Test 5: the other categories pass through untouched
console.log("\nTest 5: invalid_parameters / io_error");
check(
  "invalid_parameters",
  describeSerialFailure({
    errorCategory: "invalid_parameters",
    message: 'Invalid device serial "emu;rm"',
  }),
  {
    category: "invalid_parameters",
    message: 'Invalid device serial "emu;rm"',
    devices: [],
    serials: [],
    suggestedFix: null,
    detailLines: [],
  },
);
check(
  "io_error",
  describeSerialFailure({
    errorCategory: "io_error",
    message: "sdb devices failed: spawn ENOENT",
  }),
  {
    category: "io_error",
    message: "sdb devices failed: spawn ENOENT",
    devices: [],
    serials: [],
    suggestedFix: null,
    detailLines: [],
  },
);

// Test 6: drift guard — every resolveSerial() caller maps through the helper.
// Modules left out of the public tree (scripts/publication/internal-only-paths.txt)
// are skipped when absent, so this test runs unchanged in both trees.
console.log("\nTest 6: resolveSerial() callers use describeSerialFailure");
const coreDir = path.resolve(__dirname, "../core");
for (const file of [
  "sdb-helper.js",
  "screenshot.js",
  "project.js",
  "vd.js",
  "dlog-analyzer.js",
]) {
  const filePath = path.join(coreDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP ${file} (not in this tree)`);
    continue;
  }
  const src = fs.readFileSync(filePath, "utf-8");
  check(`${file} calls resolveSerial`, /\bresolveSerial\(/.test(src), true);
  check(
    `${file} maps the failure through describeSerialFailure`,
    /\bdescribeSerialFailure\(/.test(src),
    true,
  );
  check(
    `${file} has no hand-written "Re-run with --serial <one-of:" string`,
    /Re-run with --serial <one-of:/.test(src),
    false,
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
