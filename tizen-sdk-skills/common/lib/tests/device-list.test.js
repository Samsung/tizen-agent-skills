// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * device-manager list tests
 *
 *   - parseDeviceTable: every device line is kept whatever its state
 *     (`no permissions`, `unknown`, a 3rd name column), daemon banners are
 *     skipped, and `error:` / `protocol fault` lines are collected
 *   - `device-manager-cli.js list` against a fake sdb on PATH with no SDK
 *     configured (POSIX only): sdb is found on PATH, an sdb error that exits
 *     0 is an error envelope, and a failing sdb carries its output
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { parseDeviceTable } = require("../core/device");

console.log("=== device-manager list Test ===\n");

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

// Test 1: parseDeviceTable
console.log("Test 1: parseDeviceTable");
check(
  "  every state kept, banners and header skipped",
  parseDeviceTable(
    [
      "* daemon not running. starting it now on port 26099 *",
      "* daemon started successfully *",
      "List of devices attached",
      "emulator-26101  device  tizen-vm-default",
      "emulator-26107  host",
      "emulator-26109   device\tm-0311-1",
      "203.0.113.10:26101\toffline",
      "0000d85900006200  no permissions",
      "R3CN1234\tunknown",
      "emulator-26103\trecovery\tTV-name",
      "",
    ].join("\n"),
  ),
  {
    devices: [
      { serial: "emulator-26101", state: "device" },
      { serial: "emulator-26107", state: "host" },
      { serial: "emulator-26109", state: "device" },
      { serial: "203.0.113.10:26101", state: "offline" },
      { serial: "0000d85900006200", state: "no permissions" },
      { serial: "R3CN1234", state: "unknown" },
      { serial: "emulator-26103", state: "recovery" },
    ],
    errors: [],
    other: [],
    header: true,
  },
);
check(
  "  tab line with an unknown state is not a device",
  parseDeviceTable("List of devices attached\nwarning\tsomething happened\n"),
  {
    devices: [],
    errors: [],
    other: ["warning\tsomething happened"],
    header: true,
  },
);
check(
  "  stderr message is not a device",
  parseDeviceTable(
    "sdb server version (39) doesn't match this client (41); killing...\nList of devices attached\n",
  ),
  {
    devices: [],
    errors: [],
    other: [
      "sdb server version (39) doesn't match this client (41); killing...",
    ],
    header: true,
  },
);
check(
  "  `sdb: …` prose line is not a device",
  parseDeviceTable("sdb: device offline\nsdb: unknown option\n").devices,
  [],
);
check(
  "  a message before the header is never a device",
  parseDeviceTable("target device not found\nList of devices attached\n")
    .devices,
  [],
);
check(
  "  state is lower case",
  parseDeviceTable("List of devices attached\nemulator-26101\tDEVICE\n")
    .devices,
  [{ serial: "emulator-26101", state: "device" }],
);
check(
  "  a sentence after the header is not a device",
  parseDeviceTable("List of devices attached\ntarget device not found\n")
    .devices,
  [],
);
check(
  "  unusual serials (IPv6, long) are listed",
  parseDeviceTable(
    `List of devices attached\n[fe80::1%eth0]:26101\tdevice\n${"a".repeat(80)}\toffline\n`,
  ).devices,
  [
    { serial: "[fe80::1%eth0]:26101", state: "device" },
    { serial: "a".repeat(80), state: "offline" },
  ],
);
check("  empty table", parseDeviceTable("List of devices attached\n\n"), {
  devices: [],
  errors: [],
  other: [],
  header: true,
});
check(
  "  error lines collected, not listed as devices",
  parseDeviceTable(
    "error: protocol fault (couldn't read status): Success\nList of devices attached\n",
  ),
  {
    devices: [],
    errors: ["error: protocol fault (couldn't read status): Success"],
    other: [],
    header: true,
  },
);

// Test 2: the CLI against a fake sdb on PATH
console.log("\nTest 2: device-manager-cli.js list with a fake sdb on PATH");
if (process.platform === "win32") {
  console.log("  (skipped on Windows: the fake sdb is a shell script)");
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "device-list-"));
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  fs.mkdirSync(bin);
  fs.mkdirSync(home);
  fs.writeFileSync(
    path.join(bin, "sdb"),
    '#!/bin/sh\n[ "$1" = devices ] || exit 0\nprintf "%b" "$FAKE_OUT"\nexit "${FAKE_RC:-0}"\n',
    { mode: 0o755 },
  );
  const cli = path.join(__dirname, "..", "cli", "device-manager-cli.js");
  const list = (out, rc = 0) => {
    const r = spawnSync(process.execPath, [cli, "list"], {
      encoding: "utf8",
      timeout: 60000,
      env: {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        HOME: home,
        FAKE_OUT: out,
        FAKE_RC: String(rc),
      },
    });
    try {
      return JSON.parse(r.stdout);
    } catch (_e) {
      return { parse_error: r.stdout + r.stderr };
    }
  };

  const ok = list(
    "List of devices attached\\nemulator-26101\\tdevice\\n0000d859\\tno permissions\\n",
  );
  check("  sdb on PATH used (no SDK configured)", ok.status, "success");
  check("  no-permissions device listed", ok.result && ok.result.devices, [
    { serial: "emulator-26101", state: "device", device_type: "emulator" },
    { serial: "0000d859", state: "no permissions", device_type: "usb" },
  ]);
  check(
    "  counts",
    ok.result && [ok.result.device_count, ok.result.online_count],
    [2, 1],
  );

  const fault = list("error: protocol fault (couldn't read status)\\n");
  check(
    "  sdb error and no table (exit 0) is an error",
    fault.status,
    "failure",
  );
  check(
    "  error message names sdb's line",
    (
      (fault.errors && fault.errors[0] && fault.errors[0].message) ||
      ""
    ).includes("protocol fault"),
    true,
  );

  const partial = list(
    "error: protocol fault (remote target dropped)\\nList of devices attached\\nemulator-26101\\tDEVICE\\n",
  );
  check("  error next to a device is a warning", partial.status, "success");
  check(
    "  that device is listed and counted online (any case)",
    partial.result && [
      partial.result.device_count,
      partial.result.online_count,
    ],
    [1, 1],
  );
  check(
    "  the error line is in warnings",
    (partial.warnings || []).some((w) => w.includes("protocol fault")),
    true,
  );

  const emptyWithError = list("error: closed\\nList of devices attached\\n");
  check(
    "  empty table next to an error is a success",
    [
      emptyWithError.status,
      emptyWithError.result && emptyWithError.result.device_count,
    ],
    ["success", 0],
  );
  check(
    "  that error line is a warning",
    (emptyWithError.warnings || []).some((w) => w.includes("error: closed")),
    true,
  );

  const failed = list("error: cannot connect to daemon\\n", 1);
  check("  failing sdb is an error", failed.status, "failure");
  check(
    "  failing sdb output carried",
    JSON.stringify(failed).includes("cannot connect to daemon"),
    true,
  );
  // A configured SDK without sdb, and no sdb on PATH: a broken install
  // (io_error), not a missing setting (sdk_path_not_set).
  const brokenHome = path.join(root, "broken-home");
  fs.mkdirSync(brokenHome);
  fs.writeFileSync(
    path.join(brokenHome, ".tizen.sdk.path.config"),
    path.join(root, "no-sdk"),
  );
  const broken = spawnSync(process.execPath, [cli, "list"], {
    encoding: "utf8",
    timeout: 60000,
    env: { PATH: path.join(root, "home"), HOME: brokenHome },
  });
  let brokenEnv = {};
  try {
    brokenEnv = JSON.parse(broken.stdout);
  } catch (_e) {
    /* checked below */
  }
  check(
    "  configured SDK without sdb is io_error",
    brokenEnv.errors &&
      brokenEnv.errors[0] &&
      brokenEnv.errors[0].error_category,
    "io_error",
  );
  // An empty config file is no setting at all: sdk-init fixes it.
  fs.writeFileSync(path.join(brokenHome, ".tizen.sdk.path.config"), "");
  const empty = spawnSync(process.execPath, [cli, "list"], {
    encoding: "utf8",
    timeout: 60000,
    env: { PATH: path.join(root, "home"), HOME: brokenHome },
  });
  let emptyEnv = {};
  try {
    emptyEnv = JSON.parse(empty.stdout);
  } catch (_e) {
    /* checked below */
  }
  check(
    "  empty SDK path config is sdk_path_not_set",
    emptyEnv.errors && emptyEnv.errors[0] && emptyEnv.errors[0].error_category,
    "sdk_path_not_set",
  );
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(
  `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
