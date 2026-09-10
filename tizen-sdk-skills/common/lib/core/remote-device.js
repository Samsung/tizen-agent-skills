// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Remote device domain: network scan (search), sdb connect / disconnect / list,
 * and the persisted remote device list (Tizen Studio Device Manager's
 * "Remote Device Manager" bookmark list).
 *
 * A "remote device" is a physical Tizen device (TV, watch, phone) reachable
 * over the network instead of USB. Tizen devices listen for SDB connections
 * on TCP port 26101, so discovery is a parallel TCP reachability sweep of the
 * local /24 subnet(s) against that port — the same mechanism the Tizen
 * VS Code extension uses.
 *
 * Actions:
 *   - scan:       sweep subnet(s) for hosts answering on the SDB port (no SDK needed)
 *   - connect:    `sdb connect <ip>:<port>` (verified via `sdb devices`)
 *   - disconnect: `sdb disconnect <ip>:<port>`
 *   - list:       remote entries (`<ip>:<port>` serials) from `sdb devices`
 *   - add:        bookmark a device (name/ip/port) in Device Manager's remote_device_scan.list
 *   - remove:     remove a bookmarked device from that same list
 *   - edit:       change the name/ip/port of a bookmarked device
 *   - list-saved: read back the bookmarked device list
 */

const net = require("net");
const os = require("os");
const fs = require("fs");
const path = require("path");

const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const {
  resolveSdb,
  runSdb,
  parseDevices,
  resolveSdkDataPath,
} = require("./sdb");

/** Default SDB port Tizen devices listen on for network connections */
const DEFAULT_SDB_PORT = 26101;
/** Per-host TCP connect timeout during a scan */
const DEFAULT_SCAN_TIMEOUT_MS = 3000;
/** sdb connect is retried this many times before declaring failure */
const CONNECT_ATTEMPTS = 2;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const SUBNET_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Validate a dotted-quad IPv4 address (each octet 0-255).
 * @param {string} ip
 * @returns {boolean}
 */
function isValidIp(ip) {
  const m = IPV4_RE.exec(ip || "");
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) <= 255);
}

/**
 * Validate a /24 subnet prefix like "192.168.1" (each octet 0-255).
 * @param {string} subnet
 * @returns {boolean}
 */
function isValidSubnet(subnet) {
  const m = SUBNET_RE.exec(subnet || "");
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) <= 255);
}

/**
 * Validate a TCP port (1-65535).
 * @param {number|string} port
 * @returns {boolean}
 */
function isValidPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

/**
 * Derive the /24 subnet prefixes of all external IPv4 interfaces.
 *
 * @param {Object} [ifaces] - os.networkInterfaces() result (injectable for tests)
 * @returns {string[]} unique subnet prefixes, e.g. ["192.168.1", "10.0.0"]
 */
function computeSubnets(ifaces = os.networkInterfaces()) {
  const subnets = new Set();
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries || []) {
      // Node <18 reports family as "IPv4", >=18 may report 4
      const isV4 = entry.family === "IPv4" || entry.family === 4;
      if (!isV4 || entry.internal) continue;
      const m = IPV4_RE.exec(entry.address);
      if (m) subnets.add(`${m[1]}.${m[2]}.${m[3]}`);
    }
  }
  return [...subnets];
}

/**
 * Extract remote-device entries (serials of the form <ip>:<port>) from
 * `sdb devices` output.
 *
 * @param {string} output - stdout from `sdb devices`
 * @returns {Array<{ip: string, port: number, state: string}>}
 */
function parseRemoteConnections(output) {
  return parseDevices(output)
    .map((d) => {
      const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/.exec(d.serial);
      if (!m || !isValidIp(m[1])) return null;
      return { ip: m[1], port: Number(m[2]), state: d.state };
    })
    .filter(Boolean);
}

/**
 * TCP reachability check: can we open a socket to ip:port within timeout?
 *
 * @param {string} ip
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function isPortReachable(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, ip);
  });
}

/**
 * Sweep one /24 subnet (.1-.254) for hosts answering on the SDB port.
 * All 254 probes run in parallel; unreachable hosts resolve false, so the
 * whole sweep completes in ~timeoutMs.
 *
 * @param {string} subnet - prefix like "192.168.1"
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<string[]>} reachable IPs
 */
async function sweepSubnet(subnet, port, timeoutMs) {
  const probes = [];
  for (let host = 1; host <= 254; host++) {
    const ip = `${subnet}.${host}`;
    probes.push(
      isPortReachable(ip, port, timeoutMs).then((ok) => (ok ? ip : null)),
    );
  }
  return (await Promise.all(probes)).filter(Boolean);
}

/**
 * Best-effort read of current remote connections from `sdb devices`.
 * Returns { connections, warning } — never throws. The scan itself does not
 * need the SDK, so a missing/failing sdb only degrades status info.
 */
function readRemoteConnections() {
  const resolved = resolveSdb();
  if (resolved.error) {
    return {
      connections: [],
      warning: `sdb unavailable — connection status not checked (${resolved.error})`,
    };
  }
  try {
    const output = runSdb(resolved.sdbPath, "devices");
    return { connections: parseRemoteConnections(output) };
  } catch (error) {
    return {
      connections: [],
      warning: `sdb devices failed — connection status not checked (${error.message})`,
    };
  }
}

/**
 * Search the local network for Tizen devices (SDB port sweep).
 *
 * @param {string} [subnet] - /24 prefix like "192.168.1"; omit to scan all local interface subnets
 * @param {number|string} [port=26101] - SDB port to probe
 * @param {number|string} [timeoutMs=3000] - per-host TCP connect timeout
 * @returns {Promise<object>} Standard JSON Envelope — result.devices lists discovered hosts
 */
async function scanRemoteDevices(
  subnet,
  port = DEFAULT_SDB_PORT,
  timeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
  command = "tizen-sdk remote-device scan",
) {
  const startTime = Date.now();
  try {
    const portNum = Number(port);
    if (!isValidPort(portNum)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${port}. Must be 1-65535.`,
      );
    }
    const timeout = Number(timeoutMs);
    if (!Number.isFinite(timeout) || timeout < 100 || timeout > 30000) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid timeout: ${timeoutMs}. Must be 100-30000 ms.`,
      );
    }

    let subnets;
    if (subnet) {
      if (!isValidSubnet(subnet)) {
        return formatError(
          command,
          "invalid_parameters",
          `Invalid subnet: ${subnet}. Use a /24 prefix like "192.168.1".`,
        );
      }
      subnets = [subnet];
    } else {
      subnets = computeSubnets();
      if (subnets.length === 0) {
        return formatError(
          command,
          "io_error",
          "No external IPv4 network interface found — cannot determine a subnet to scan. Pass a subnet explicitly.",
          null,
          startTime,
        );
      }
    }

    console.error(
      `[tizen-remote-device] Scanning ${subnets.join(", ")}.0/24 on port ${portNum} (timeout ${timeout}ms per host)`,
    );

    const perSubnet = await Promise.all(
      subnets.map((s) => sweepSubnet(s, portNum, timeout)),
    );
    const reachableIps = perSubnet.flat();

    // Best-effort: mark which discovered hosts are already sdb-connected
    const { connections, warning } = readRemoteConnections();
    const connectedSet = new Set(
      connections
        .filter((c) => c.state === "device")
        .map((c) => `${c.ip}:${c.port}`),
    );

    const devices = reachableIps.map((ip) => ({
      ip,
      port: portNum,
      status: connectedSet.has(`${ip}:${portNum}`)
        ? "connected"
        : "disconnected",
    }));

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        subnets_scanned: subnets.map((s) => `${s}.0/24`),
        port: portNum,
        device_count: devices.length,
        devices,
      },
      { warnings: warning ? [warning] : [] },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Remote device scan failed: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Connect to a remote Tizen device via `sdb connect <ip>:<port>`.
 * Retries up to CONNECT_ATTEMPTS times and verifies the connection via
 * `sdb devices` (entry must be in state "device", not "offline").
 *
 * @param {string} ip - device IPv4 address
 * @param {number|string} [port=26101]
 * @returns {Promise<object>} Standard JSON Envelope — result.device_serial is "<ip>:<port>"
 */
async function connectRemoteDevice(
  ip,
  port = DEFAULT_SDB_PORT,
  command = "tizen-sdk remote-device connect",
) {
  const startTime = Date.now();
  try {
    if (!isValidIp(ip)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid IP address: ${ip}`,
      );
    }
    const portNum = Number(port);
    if (!isValidPort(portNum)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${port}. Must be 1-65535.`,
      );
    }

    const resolved = resolveSdb();
    if (resolved.error) {
      return formatError(command, "sdk_path_not_set", resolved.error);
    }

    const target = `${ip}:${portNum}`;
    console.error(`[tizen-remote-device] Connecting to ${target}`);

    let lastOutput = "";
    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
      try {
        lastOutput = runSdb(resolved.sdbPath, `connect ${target}`);
      } catch (error) {
        lastOutput = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message}`;
      }
      // Verify: the entry must show up as "device" (not "offline") in sdb devices
      const { connections } = readRemoteConnections();
      const entry = connections.find((c) => c.ip === ip && c.port === portNum);
      if (entry && entry.state === "device") {
        const envelope = new Envelope(command);
        envelope.startTime = startTime;
        return envelope.success({
          device_serial: target,
          ip,
          port: portNum,
          status: "connected",
          attempts: attempt,
        });
      }
    }

    return formatError(
      command,
      "device_not_found",
      `Failed to connect to ${target} after ${CONNECT_ATTEMPTS} attempts. ` +
        `Ensure the device is on the network with developer mode enabled. sdb output: ${lastOutput.trim()}`,
      null,
      startTime,
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to connect remote device: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Disconnect a remote Tizen device via `sdb disconnect <ip>:<port>`.
 *
 * @param {string} ip - device IPv4 address
 * @param {number|string} [port=26101]
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function disconnectRemoteDevice(
  ip,
  port = DEFAULT_SDB_PORT,
  command = "tizen-sdk remote-device disconnect",
) {
  const startTime = Date.now();
  try {
    if (!isValidIp(ip)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid IP address: ${ip}`,
      );
    }
    const portNum = Number(port);
    if (!isValidPort(portNum)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${port}. Must be 1-65535.`,
      );
    }

    const resolved = resolveSdb();
    if (resolved.error) {
      return formatError(command, "sdk_path_not_set", resolved.error);
    }

    const target = `${ip}:${portNum}`;
    console.error(`[tizen-remote-device] Disconnecting ${target}`);

    try {
      runSdb(resolved.sdbPath, `disconnect ${target}`);
    } catch (error) {
      return formatError(
        command,
        "io_error",
        `sdb disconnect failed: ${error.message}`,
        null,
        startTime,
      );
    }

    // Verify the entry no longer shows as connected
    const { connections } = readRemoteConnections();
    const stillConnected = connections.some(
      (c) => c.ip === ip && c.port === portNum && c.state === "device",
    );
    if (stillConnected) {
      return formatError(
        command,
        "io_error",
        `${target} is still listed as connected after sdb disconnect.`,
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      device_serial: target,
      ip,
      port: portNum,
      status: "disconnected",
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to disconnect remote device: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * List remote device connections currently known to sdb
 * (entries of `sdb devices` whose serial is <ip>:<port>).
 *
 * @returns {Promise<object>} Standard JSON Envelope — result.devices
 */
async function listRemoteDevices(command = "tizen-sdk remote-device list") {
  const startTime = Date.now();
  try {
    const resolved = resolveSdb();
    if (resolved.error) {
      return formatError(command, "sdk_path_not_set", resolved.error);
    }
    let output;
    try {
      output = runSdb(resolved.sdbPath, "devices");
    } catch (error) {
      return formatError(
        command,
        "io_error",
        `sdb devices failed: ${error.message}`,
        null,
        startTime,
      );
    }
    const connections = parseRemoteConnections(output);
    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      device_count: connections.length,
      devices: connections.map((c) => ({
        device_serial: `${c.ip}:${c.port}`,
        ip: c.ip,
        port: c.port,
        status: c.state === "device" ? "connected" : c.state,
      })),
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to list remote devices: ${error.message}`,
      null,
      startTime,
    );
  }
}

/** Path segments of the Device Manager remote device list, relative to the SDK data path */
const DEVICE_LIST_RELATIVE_PATH = [
  "device-manager",
  "config",
  "remote_device_scan.list",
];

/**
 * Resolve the path to Tizen Studio Device Manager's remote device bookmark
 * list (`<sdk-data-path>/device-manager/config/remote_device_scan.list`).
 *
 * The SDK data path comes from resolveSdkDataPath() in ./sdb: the configured
 * SDK root when it really is an SDK (sdk.info or tools/sdb present), else the
 * SDK the sdb on PATH belongs to; then TIZEN_SDK_DATA_PATH from sdk.info or
 * the `<sdk-root>-data` sibling. A machine without an SDK gets an error, not a
 * fabricated path.
 *
 * @returns {{listPath: string, dataPath: string, sdkRoot: string, source: string}|{error: string}}
 */
function resolveDeviceListPath() {
  const resolved = resolveSdkDataPath();
  if (resolved.error) return { error: resolved.error };
  return {
    ...resolved,
    listPath: path.join(resolved.dataPath, ...DEVICE_LIST_RELATIVE_PATH),
  };
}

/**
 * Parse one line of the remote device list file ("name/ip/port", matching
 * the format Device Manager itself reads/writes — String.split("/") into
 * exactly 3 fields).
 *
 * @param {string} line
 * @returns {{name: string, ip: string, port: number}|null}
 */
function parseDeviceListLine(line) {
  const parts = line.split("/");
  if (parts.length !== 3) return null;
  const [name, ip, portStr] = parts;
  const port = Number(portStr);
  if (!name || !isValidIp(ip) || !isValidPort(port)) return null;
  return { name, ip, port };
}

/**
 * Read and parse the remote device list file. Missing file -> empty list
 * (Device Manager itself treats a missing file the same way).
 *
 * @param {string} listPath
 * @returns {Array<{name: string, ip: string, port: number}>}
 */
function readDeviceListFile(listPath) {
  if (!fs.existsSync(listPath)) return [];
  const content = fs.readFileSync(listPath, "utf-8");
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseDeviceListLine)
    .filter(Boolean);
}

/**
 * Write the remote device list file, creating parent directories as needed.
 * Uses CRLF line endings to match the format Device Manager itself writes.
 *
 * @param {string} listPath
 * @param {Array<{name: string, ip: string, port: number}>} entries
 */
function writeDeviceListFile(listPath, entries) {
  fs.mkdirSync(path.dirname(listPath), { recursive: true });
  const content =
    entries.map((e) => `${e.name}/${e.ip}/${e.port}`).join("\r\n") +
    (entries.length ? "\r\n" : "");
  fs.writeFileSync(listPath, content, "utf-8");
}

/**
 * Add (bookmark) a device to Device Manager's remote device list.
 * Rejects duplicates by <ip>:<port> — matches Device Manager's own behavior.
 *
 * @param {string} name - display name, must not contain "/"
 * @param {string} ip - device IPv4 address
 * @param {number|string} [port=26101]
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function addRemoteDeviceToList(
  name,
  ip,
  port = DEFAULT_SDB_PORT,
  command = "tizen-sdk remote-device add",
) {
  const startTime = Date.now();
  try {
    if (!name || typeof name !== "string" || name.includes("/")) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid device name: "${name}". Must be a non-empty string that does not contain "/".`,
      );
    }
    if (!isValidIp(ip)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid IP address: ${ip}`,
      );
    }
    const portNum = Number(port);
    if (!isValidPort(portNum)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${port}. Must be 1-65535.`,
      );
    }

    const location = resolveDeviceListPath();
    if (location.error) {
      return formatError(command, "sdk_path_not_set", location.error);
    }
    const listPath = location.listPath;
    const entries = readDeviceListFile(listPath);

    const dup = entries.find((e) => e.ip === ip && e.port === portNum);
    if (dup) {
      return formatError(
        command,
        "invalid_parameters",
        `${ip}:${portNum} is already in the remote device list (as "${dup.name}"). Remove it first if you want to re-add it with a different name.`,
      );
    }

    entries.push({ name, ip, port: portNum });
    writeDeviceListFile(listPath, entries);

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      name,
      ip,
      port: portNum,
      device_count: entries.length,
      list_path: listPath,
      sdk_root: location.sdkRoot,
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to add device to remote device list: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Remove a bookmarked device from Device Manager's remote device list by
 * <ip>:<port>.
 *
 * @param {string} ip - device IPv4 address
 * @param {number|string} [port=26101]
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function removeRemoteDeviceFromList(
  ip,
  port = DEFAULT_SDB_PORT,
  command = "tizen-sdk remote-device remove",
) {
  const startTime = Date.now();
  try {
    if (!isValidIp(ip)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid IP address: ${ip}`,
      );
    }
    const portNum = Number(port);
    if (!isValidPort(portNum)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${port}. Must be 1-65535.`,
      );
    }

    const location = resolveDeviceListPath();
    if (location.error) {
      return formatError(command, "sdk_path_not_set", location.error);
    }
    const listPath = location.listPath;
    const entries = readDeviceListFile(listPath);
    const remaining = entries.filter(
      (e) => !(e.ip === ip && e.port === portNum),
    );

    if (remaining.length === entries.length) {
      return formatError(
        command,
        "device_not_found",
        `${ip}:${portNum} was not found in the remote device list.`,
        null,
        startTime,
      );
    }

    writeDeviceListFile(listPath, remaining);

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      ip,
      port: portNum,
      device_count: remaining.length,
      list_path: listPath,
      sdk_root: location.sdkRoot,
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to remove device from remote device list: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Edit a bookmarked device in Device Manager's remote device list.
 * The entry is located by its CURRENT <ip>:<port>; any of name / ip / port can
 * be changed. At least one new value must be supplied, and the resulting
 * <ip>:<port> must not collide with a different existing entry.
 *
 * @param {string} ip - current device IPv4 address (identifies the entry)
 * @param {number|string} [port=26101] - current SDB port (identifies the entry)
 * @param {string} [newName] - new display name, must not contain "/"
 * @param {string} [newIp] - new IPv4 address
 * @param {number|string} [newPort] - new SDB port
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function editRemoteDeviceInList(
  ip,
  port = DEFAULT_SDB_PORT,
  newName,
  newIp,
  newPort,
  command = "tizen-sdk remote-device edit",
) {
  const startTime = Date.now();
  try {
    if (!isValidIp(ip)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid IP address: ${ip}`,
      );
    }
    const portNum = Number(port);
    if (!isValidPort(portNum)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${port}. Must be 1-65535.`,
      );
    }
    if (newName === undefined && newIp === undefined && newPort === undefined) {
      return formatError(
        command,
        "invalid_parameters",
        "Nothing to edit — supply at least one of new name, new IP or new port.",
      );
    }
    if (
      newName !== undefined &&
      (!newName || typeof newName !== "string" || newName.includes("/"))
    ) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid device name: "${newName}". Must be a non-empty string that does not contain "/".`,
      );
    }
    if (newIp !== undefined && !isValidIp(newIp)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid new IP address: ${newIp}`,
      );
    }
    let newPortNum;
    if (newPort !== undefined) {
      newPortNum = Number(newPort);
      if (!isValidPort(newPortNum)) {
        return formatError(
          command,
          "invalid_parameters",
          `Invalid new port: ${newPort}. Must be 1-65535.`,
        );
      }
    }

    const location = resolveDeviceListPath();
    if (location.error) {
      return formatError(command, "sdk_path_not_set", location.error);
    }
    const listPath = location.listPath;
    const entries = readDeviceListFile(listPath);

    const index = entries.findIndex((e) => e.ip === ip && e.port === portNum);
    if (index === -1) {
      return formatError(
        command,
        "device_not_found",
        `${ip}:${portNum} was not found in the remote device list.`,
        null,
        startTime,
      );
    }

    const before = entries[index];
    const after = {
      name: newName === undefined ? before.name : newName,
      ip: newIp === undefined ? before.ip : newIp,
      port: newPortNum === undefined ? before.port : newPortNum,
    };

    // Moving to an <ip>:<port> that another bookmark already occupies would
    // create the duplicate that `add` refuses to make.
    const clash = entries.find(
      (e, i) => i !== index && e.ip === after.ip && e.port === after.port,
    );
    if (clash) {
      return formatError(
        command,
        "invalid_parameters",
        `${after.ip}:${after.port} is already in the remote device list (as "${clash.name}").`,
      );
    }

    entries[index] = after;
    writeDeviceListFile(listPath, entries);

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      previous: { name: before.name, ip: before.ip, port: before.port },
      name: after.name,
      ip: after.ip,
      port: after.port,
      device_count: entries.length,
      list_path: listPath,
      sdk_root: location.sdkRoot,
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to edit device in remote device list: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Read back Device Manager's bookmarked remote device list.
 *
 * @returns {Promise<object>} Standard JSON Envelope — result.devices
 */
async function listSavedRemoteDevices(
  command = "tizen-sdk remote-device list-saved",
) {
  const startTime = Date.now();
  try {
    const location = resolveDeviceListPath();
    if (location.error) {
      return formatError(command, "sdk_path_not_set", location.error);
    }
    const entries = readDeviceListFile(location.listPath);
    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      device_count: entries.length,
      devices: entries,
      list_path: location.listPath,
      sdk_root: location.sdkRoot,
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to read remote device list: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  scanRemoteDevices,
  connectRemoteDevice,
  disconnectRemoteDevice,
  listRemoteDevices,
  addRemoteDeviceToList,
  removeRemoteDeviceFromList,
  editRemoteDeviceInList,
  listSavedRemoteDevices,
  // pure helpers exported for tests
  isValidIp,
  isValidSubnet,
  isValidPort,
  computeSubnets,
  parseRemoteConnections,
  parseDeviceListLine,
  resolveDeviceListPath,
  DEFAULT_SDB_PORT,
};
