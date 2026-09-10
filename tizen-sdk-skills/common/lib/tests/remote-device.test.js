// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * remote-device tests
 *
 * Covers the pure (no-network, no-device) parts of the remote-device domain:
 *   - isValidIp / isValidSubnet / isValidPort: input validation
 *   - computeSubnets: /24 prefix derivation from injected interface data
 *   - parseRemoteConnections: extracting <ip>:<port> entries from `sdb devices`
 *   - scanRemoteDevices / connectRemoteDevice: invalid-parameter envelopes
 */

const {
  isValidIp,
  isValidSubnet,
  isValidPort,
  computeSubnets,
  parseRemoteConnections,
  parseDeviceListLine,
  scanRemoteDevices,
  connectRemoteDevice,
  addRemoteDeviceToList,
  removeRemoteDeviceFromList,
  editRemoteDeviceInList,
  DEFAULT_SDB_PORT,
} = require("../core/remote-device");

console.log("=== remote-device Test ===\n");

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

// Test 1: validation helpers
console.log("Test 1: validation helpers");
check("  default port is 26101", DEFAULT_SDB_PORT, 26101);
check("  valid ip", isValidIp("192.168.1.100"), true);
check("  octet > 255 rejected", isValidIp("192.168.1.300"), false);
check("  subnet is not an ip", isValidIp("192.168.1"), false);
check("  ip:port is not an ip", isValidIp("192.168.1.100:26101"), false);
check("  empty ip rejected", isValidIp(""), false);
check("  valid subnet", isValidSubnet("192.168.1"), true);
check("  full ip is not a subnet", isValidSubnet("192.168.1.0"), false);
check("  subnet octet > 255 rejected", isValidSubnet("192.999.1"), false);
check("  valid port", isValidPort(26101), true);
check("  string port accepted", isValidPort("26101"), true);
check("  port 0 rejected", isValidPort(0), false);
check("  port 65536 rejected", isValidPort(65536), false);
check("  non-numeric port rejected", isValidPort("abc"), false);

// Test 2: computeSubnets — IPv4 external interfaces only, deduplicated
console.log("\nTest 2: computeSubnets");
const ifaces = {
  lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
  eth0: [
    { address: "192.168.1.10", family: "IPv4", internal: false },
    { address: "fe80::1", family: "IPv6", internal: false },
  ],
  wlan0: [{ address: "192.168.1.20", family: 4, internal: false }], // Node >=18 numeric family, same subnet
  tun0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
};
check("  external /24 prefixes, deduped", computeSubnets(ifaces), [
  "192.168.1",
  "10.0.0",
]);
check("  no interfaces -> empty", computeSubnets({}), []);

// Test 3: parseRemoteConnections — only <ip>:<port> serials, state preserved
console.log("\nTest 3: parseRemoteConnections");
const devicesOutput = [
  "List of devices attached",
  "emulator-26101      device  tizen-vm-default",
  "192.168.1.100:26101 device  SamsungTV",
  "10.0.0.5:26102      offline",
  "USBSERIAL123        device",
  "",
].join("\n");
check("  extracts remote entries only", parseRemoteConnections(devicesOutput), [
  { ip: "192.168.1.100", port: 26101, state: "device" },
  { ip: "10.0.0.5", port: 26102, state: "offline" },
]);

// Test 4: parseDeviceListLine — Device Manager's "name/ip/port" bookmark format
console.log("\nTest 4: parseDeviceListLine");
check("  valid line", parseDeviceListLine("Office TV/192.168.1.42/26101"), {
  name: "Office TV",
  ip: "192.168.1.42",
  port: 26101,
});
check(
  "  name may contain any non-'/' chars",
  parseDeviceListLine("Living Room TV/192.168.1.100/26101"),
  {
    name: "Living Room TV",
    ip: "192.168.1.100",
    port: 26101,
  },
);
check(
  "  wrong field count -> null",
  parseDeviceListLine("name/only-two-fields"),
  null,
);
check("  too many fields -> null", parseDeviceListLine("a/b/c/d"), null);
check(
  "  invalid ip in line -> null",
  parseDeviceListLine("name/300.1.1.1/26101"),
  null,
);
check(
  "  invalid port in line -> null",
  parseDeviceListLine("name/192.168.1.100/99999"),
  null,
);
check(
  "  empty name -> null",
  parseDeviceListLine("/192.168.1.100/26101"),
  null,
);

// Test 5: sdkRootFromSdb — SDK root is two levels up from <root>/tools/sdb
console.log("\nTest 5: sdkRootFromSdb");
const { sdkRootFromSdb } = require("../core/sdb");
const sep = require("path").sep;
check(
  "  windows layout",
  sdkRootFromSdb(["C:", "tizen-studio", "tools", "sdb.exe"].join(sep)),
  ["C:", "tizen-studio"].join(sep),
);
check(
  "  non-C drive / nested install dir",
  sdkRootFromSdb(["D:", "tools", "tizen-studio", "tools", "sdb.exe"].join(sep)),
  ["D:", "tools", "tizen-studio"].join(sep),
);
check(
  "  home-dir install",
  sdkRootFromSdb(
    ["C:", "Users", "me", "tizen-sdk", "tools", "sdb.exe"].join(sep),
  ),
  ["C:", "Users", "me", "tizen-sdk"].join(sep),
);

// Test 6: invalid-parameter envelopes (async, no network/sdb/filesystem touched)
console.log("\nTest 6: invalid-parameter envelopes");
(async () => {
  const badSubnet = await scanRemoteDevices("not-a-subnet");
  check("  scan bad subnet -> failure", badSubnet.status, "failure");
  check(
    "  scan bad subnet category",
    badSubnet.errors[0].error_category,
    "invalid_parameters",
  );

  const badPort = await scanRemoteDevices("192.168.1", 99999);
  check("  scan bad port -> failure", badPort.status, "failure");

  const badTimeout = await scanRemoteDevices("192.168.1", 26101, 5);
  check("  scan bad timeout -> failure", badTimeout.status, "failure");

  const badIp = await connectRemoteDevice("300.1.1.1");
  check("  connect bad ip -> failure", badIp.status, "failure");
  check(
    "  connect bad ip category",
    badIp.errors[0].error_category,
    "invalid_parameters",
  );

  const noIp = await connectRemoteDevice(undefined);
  check("  connect missing ip -> failure", noIp.status, "failure");

  const addNoName = await addRemoteDeviceToList("", "192.168.1.100");
  check("  add empty name -> failure", addNoName.status, "failure");
  check(
    "  add empty name category",
    addNoName.errors[0].error_category,
    "invalid_parameters",
  );

  const addSlashName = await addRemoteDeviceToList("bad/name", "192.168.1.100");
  check("  add name with '/' -> failure", addSlashName.status, "failure");

  const addBadIp = await addRemoteDeviceToList("MyTV", "300.1.1.1");
  check("  add bad ip -> failure", addBadIp.status, "failure");

  const removeBadIp = await removeRemoteDeviceFromList("300.1.1.1");
  check("  remove bad ip -> failure", removeBadIp.status, "failure");

  const editBadIp = await editRemoteDeviceInList("300.1.1.1", 26101, "MyTV");
  check("  edit bad ip -> failure", editBadIp.status, "failure");

  const editNoChange = await editRemoteDeviceInList("192.168.1.100");
  check("  edit with no new values -> failure", editNoChange.status, "failure");
  check(
    "  edit with no new values category",
    editNoChange.errors[0].error_category,
    "invalid_parameters",
  );

  const editSlashName = await editRemoteDeviceInList(
    "192.168.1.100",
    26101,
    "bad/name",
  );
  check("  edit name with '/' -> failure", editSlashName.status, "failure");

  const editBadNewIp = await editRemoteDeviceInList(
    "192.168.1.100",
    26101,
    undefined,
    "300.1.1.1",
  );
  check("  edit bad new ip -> failure", editBadNewIp.status, "failure");

  const editBadNewPort = await editRemoteDeviceInList(
    "192.168.1.100",
    26101,
    undefined,
    undefined,
    99999,
  );
  check("  edit bad new port -> failure", editBadNewPort.status, "failure");

  console.log(
    `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
