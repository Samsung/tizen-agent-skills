// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * DUID (Device Unique ID) utilities for Samsung distributor certificates.
 *
 * Handles:
 *   - DUID file import: parse, uppercase, dedupe, cap at 50
 *   - DUID acquisition from connected devices via sdb
 *   - DUID validation and version detection
 *
 * DUID format examples:
 *   ""           → V0 (Gear2 devices, empty prefix)
 *   "1.0#XXXX"   → V1 (version 1 devices)
 *   "-XXXX"      → VD (VD mode devices)
 *   "2.0#XXXX"   → V2 (version 2 devices, default)
 *
 * DUID retrieval commands (selected based on device capabilities):
 *
 *   ┌─────────────────────────────────────┐
 *   │  sdb -s <serial> capability          │
 *   └──────────────┬──────────────────────┘
 *                │
 *       ┌────────▼─────────┐
 *       │ secure_protocol? │
 *       └───┬──────────┬───┘
 *        No  │          │  Yes
 *            ▼          ▼
 *      ┌─────────┐  ┌──────────────────┐
 *      │CMD_DUID │  │ product_version  │
 *      │(standard│  │   == "1.0"?      │
 *       command)│  └───┬──────────┬───┘
 *      └─────────┘   Yes│          │No
 *                     ▼          ▼
 *              ┌────────────┐ ┌──────────────┐
 *              │CMD_SECURE_ │ │CMD_SECURE_   │
 *              │DUID        │ │DUIDGADGET    │
 *              │(getduidgad-│ │(getduid)     │
 *              │  get)      │ │              │
 *              └────────────┘ └──────────────┘
 */

const fs = require("fs");
const { execSync } = require("child_process");

const { resolveSdbBinary } = require("./sdb");

/** Maximum number of DUIDs allowed in a single distributor certificate request. */
const MAX_DUIDS = 50;

/**
 * Shell commands used to retrieve the DUID from a device.
 *
 * | Constant              | Command                                  | Used When                                        |
 * |-----------------------|------------------------------------------|--------------------------------------------------|
 * | CMD_DUID              | /opt/etc/duid-gadget 2.0 2> /dev/null   | Device does NOT support secure protocol          |
 * | CMD_SECURE_DUIDGADGET | 0 getduid                               | Secure protocol AND product_version != "1.0"     |
 * | CMD_SECURE_DUID       | 0 getduidgadget                          | Secure protocol AND product_version == "1.0"     |
 */
const CMD_DUID = "/opt/etc/duid-gadget 2.0 2> /dev/null";
const CMD_SECURE_DUIDGADGET = "0 getduid";
const CMD_SECURE_DUID = "0 getduidgadget";

/**
 * Device version enum, matching the reference implementation.
 */
const DeviceVersion = {
  V0: 0, // Gear2 devices (empty prefix)
  V1: 1, // Version 1 devices (prefix "1.0")
  V2: 2, // Version 2 devices (default)
  VD: 3, // VD mode devices (prefix "-")
};

/**
 * Validate a single DUID string.
 *
 * A valid DUID is a non-empty alphanumeric string optionally prefixed with
 * a version segment separated by '#'. Examples:
 *   "1.0#DEVICE001"
 *   "-DEVICE001"
 *   "#DEVICE001"  (V0)
 *   "2.0#DEVICE001"
 *
 * @param {string} duid
 * @returns {boolean}
 */
function isValidDuid(duid) {
  if (typeof duid !== "string" || duid.trim().length === 0) return false;
  // Allow alphanumeric, '#', '-', '.', and ':'
  return /^[A-Za-z0-9#.\-:=]+$/.test(duid.trim());
}

/**
 * Determine the device version from a DUID string.
 *
 * @param {string} duid
 * @returns {number} DeviceVersion enum value
 */
function getVersionFromDuid(duid) {
  const parts = duid.split("#");
  const prefix = parts.length > 0 ? parts[0] : "";

  switch (prefix) {
    case "":
      return DeviceVersion.V0;
    case "1.0":
      return DeviceVersion.V1;
    case "-":
      return DeviceVersion.VD;
    default:
      return DeviceVersion.V2;
  }
}

/**
 * Get the minimum device version from a list of DUIDs.
 *
 * This determines whether the distributor certificate needs V0 (Gear2)
 * platform data or VD mode handling.
 *
 * @param {string[]} duidList
 * @returns {number} DeviceVersion enum value
 */
function getMinVersion(duidList) {
  if (!duidList || duidList.length === 0) {
    return DeviceVersion.V2;
  }

  let minVersion = DeviceVersion.V2;
  for (const duid of duidList) {
    const version = getVersionFromDuid(duid);
    if (version < minVersion) {
      minVersion = version;
    }
  }
  return minVersion;
}

/**
 * Check if any DUID in the list indicates VD mode.
 *
 * VD mode DUIDs have a prefix of "-" (e.g. "-DEVICE001").
 *
 * @param {string[]} duidList
 * @returns {boolean}
 */
function hasVDMode(duidList) {
  if (!duidList) return false;
  return duidList.some((duid) => getVersionFromDuid(duid) === DeviceVersion.VD);
}

/**
 * Parse and normalize a list of DUIDs from raw input.
 *
 * Operations:
 *   1. Split on newlines, commas, and whitespace
 *   2. Trim each entry
 *   3. Uppercase each entry
 *   4. Filter out empty strings
 *   5. Validate each DUID
 *   6. Deduplicate (case-insensitive, but they're already uppercased)
 *   7. Cap at MAX_DUIDS (50)
 *
 * @param {string|string[]} input - raw DUID text (newline/comma separated) or array
 * @returns {{duids: string[], skipped: string[], truncated: boolean}}
 */
function parseDuidList(input) {
  if (!input) {
    return { duids: [], skipped: [], truncated: false };
  }

  let rawEntries;

  if (Array.isArray(input)) {
    rawEntries = input;
  } else if (typeof input === "string") {
    // Split on newlines, commas, and any whitespace
    rawEntries = input.split(/[\n\r,]+/);
  } else {
    return { duids: [], skipped: [], truncated: false };
  }

  const seen = new Set();
  const duids = [];
  const skipped = [];
  let truncated = false;

  for (const raw of rawEntries) {
    const trimmed = String(raw).trim();
    if (trimmed.length === 0) continue;

    const upper = trimmed.toUpperCase();

    // Skip duplicates
    if (seen.has(upper)) continue;
    seen.add(upper);

    // Validate
    if (!isValidDuid(upper)) {
      skipped.push(trimmed);
      continue;
    }

    // Cap at MAX_DUIDS
    if (duids.length >= MAX_DUIDS) {
      truncated = true;
      break;
    }

    duids.push(upper);
  }

  return { duids, skipped, truncated };
}

/**
 * Import DUIDs from a file.
 *
 * Reads the file, parses its contents, and returns normalized DUIDs.
 * The file can contain DUIDs separated by newlines, commas, or whitespace.
 *
 * @param {string} filePath - path to the DUID file
 * @returns {{duids: string[], skipped: string[], truncated: boolean}}
 * @throws {Error} if the file cannot be read
 */
function importDuidsFromFile(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("File path is required");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`DUID file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return parseDuidList(content);
}

/**
 * Parse the `sdb capability` output to extract device capability fields.
 *
 * The capability output contains key:value pairs, one per line. This function
 * extracts the fields relevant to DUID command selection:
 *   - `secure_protocol` — whether the device supports the secure protocol
 *   - `product_version` — the device's product version (e.g. "1.0", "2.0")
 *
 * @param {string} capabilityOutput - raw output from `sdb -s <serial> capability`
 * @returns {{secureProtocol: boolean, productVersion: string|null, raw: Object<string,string>}}
 */
function parseCapability(capabilityOutput) {
  const result = {
    secureProtocol: false,
    productVersion: null,
    raw: {},
  };

  if (!capabilityOutput) return result;

  const lines = capabilityOutput.split(/\r?\n/);
  for (const line of lines) {
    // Match "key: value" or "key = value" (case-insensitive key)
    const match = line.match(/^\s*([A-Za-z_]+)\s*[:=]\s*(.+?)\s*$/);
    if (match && match[1]) {
      const key = match[1].toLowerCase().trim();
      const value = match[2].trim();
      result.raw[key] = value;
    }
  }

  // Determine secure_protocol
  const sp = result.raw["secure_protocol"];
  if (sp !== undefined) {
    result.secureProtocol = /^(true|yes|1|enabled)$/i.test(sp.trim());
  }

  // Determine product_version
  const pv = result.raw["product_version"];
  if (pv !== undefined) {
    result.productVersion = pv.trim();
  }

  return result;
}

/**
 * Select the appropriate DUID retrieval command based on device capabilities.
 *
 * Selection logic:
 *   1. If secure_protocol is NOT enabled → CMD_DUID (standard command)
 *   2. If secure_protocol IS enabled:
 *      a. product_version == "1.0" → CMD_SECURE_DUID (getduidgadget)
 *      b. product_version != "1.0" → CMD_SECURE_DUIDGADGET (getduid)
 *
 * @param {{secureProtocol: boolean, productVersion: string|null}} capability - parsed capability info
 * @returns {string} the selected DUID command string
 */
function selectDuidCommand(capability) {
  if (!capability.secureProtocol) {
    return CMD_DUID;
  }

  if (capability.productVersion === "1.0") {
    return CMD_SECURE_DUID;
  }

  return CMD_SECURE_DUIDGADGET;
}

/**
 * Run a shell command on the device via `sdb shell` and return the output.
 *
 * @param {string} sdbPath - path to the sdb binary
 * @param {string} serial - target device serial
 * @param {string} shellCmd - the shell command to execute on the device
 * @param {number} [timeout=15000] - timeout in milliseconds
 * @returns {string} the command's stdout output
 * @throws {Error} if the command fails
 */
function runDeviceShellCommand(sdbPath, serial, shellCmd, timeout) {
  const cmd = `"${sdbPath}" -s "${serial}" shell "${shellCmd}"`;
  return execSync(cmd, {
    encoding: "utf-8",
    timeout: timeout || 15000,
    windowsHide: true,
  });
}

/**
 * Acquire DUID from a connected Tizen device via sdb.
 *
 * Uses `sdb -s <serial> capability` to query device capabilities, then selects
 * the appropriate DUID retrieval command based on secure_protocol and
 * product_version:
 *
 *   - No secure protocol → `/opt/etc/duid-gadget 2.0 2> /dev/null`
 *   - Secure protocol, product_version == "1.0" → `0 getduidgadget`
 *   - Secure protocol, product_version != "1.0" → `0 getduid`
 *
 * The selected command is executed via `sdb -s <serial> shell`.
 *
 * @param {string} [serial] - optional device serial; if omitted, uses the first connected device
 * @returns {{duid: string, serial: string, deviceName: string, command: string}}
 * @throws {Error} if no device is connected or DUID cannot be extracted
 */
function acquireDuidFromDevice(serial) {
  const resolved = resolveSdbBinary();
  if (resolved.error) {
    throw new Error(`sdb not available: ${resolved.error}`);
  }

  const sdbPath = resolved.sdbPath;

  // Serials are interpolated into shell command lines below — reject anything
  // that isn't a plain serial (also blocks shell metacharacters)
  if (serial && !/^[A-Za-z0-9._:-]+$/.test(serial)) {
    throw new Error(`Invalid device serial: ${serial}`);
  }

  // If no serial given, list devices and pick the first one
  let targetSerial = serial;
  let deviceName = "";

  if (!targetSerial) {
    let devicesOutput;
    try {
      devicesOutput = execSync(`"${sdbPath}" devices`, {
        encoding: "utf-8",
        timeout: 10000,
        windowsHide: true,
      });
    } catch (err) {
      throw new Error(`Failed to list devices: ${err.message}`);
    }

    const lines = devicesOutput.split(/\r?\n/).filter((l) => l.trim());
    // Skip header line
    const deviceLines = lines.filter((l) => !l.startsWith("List of devices"));

    if (deviceLines.length === 0) {
      throw new Error(
        "No connected devices found. Connect a device or start an emulator.",
      );
    }

    // Parse first device line: "serial\tdevice"
    const firstLine = deviceLines[0].split(/\s+/);
    targetSerial = firstLine[0];
    deviceName = firstLine[1] || "unknown";
  }

  // Query device capabilities
  let capabilityOutput;
  try {
    capabilityOutput = execSync(
      `"${sdbPath}" -s "${targetSerial}" capability`,
      {
        encoding: "utf-8",
        timeout: 15000,
        windowsHide: true,
      },
    );
  } catch (err) {
    throw new Error(
      `Failed to get device capability for ${targetSerial}: ${err.message}`,
    );
  }

  // Parse capabilities and select the appropriate DUID command
  const capability = parseCapability(capabilityOutput);
  const duidCommand = selectDuidCommand(capability);

  // Execute the selected DUID command on the device via sdb shell
  let duidOutput;
  try {
    duidOutput = runDeviceShellCommand(sdbPath, targetSerial, duidCommand);
  } catch (err) {
    throw new Error(
      `Failed to execute DUID command "${duidCommand}" on device ${targetSerial}: ${err.message}`,
    );
  }

  // Extract the DUID from the command output
  const duid = extractDuidFromOutput(duidOutput);

  if (!duid) {
    throw new Error(
      `Could not extract DUID from device ${targetSerial} using command "${duidCommand}". ` +
        `Output: ${duidOutput ? duidOutput.trim() : "(empty)"}`,
    );
  }

  return {
    duid: duid.toUpperCase(),
    serial: targetSerial,
    deviceName,
    command: duidCommand,
  };
}

/**
 * Acquire DUIDs from all connected Tizen devices.
 *
 * For each device, queries capabilities and selects the appropriate DUID
 * command based on secure_protocol and product_version.
 *
 * @returns {{duids: Array<{duid: string, serial: string, deviceName: string, command: string}>, errors: Array<{serial: string, error: string}>}}
 * @throws {Error} if sdb is not available
 */
function acquireDuidsFromAllDevices() {
  const resolved = resolveSdbBinary();
  if (resolved.error) {
    throw new Error(`sdb not available: ${resolved.error}`);
  }

  const sdbPath = resolved.sdbPath;

  let devicesOutput;
  try {
    devicesOutput = execSync(`"${sdbPath}" devices`, {
      encoding: "utf-8",
      timeout: 10000,
      windowsHide: true,
    });
  } catch (err) {
    throw new Error(`Failed to list devices: ${err.message}`);
  }

  const lines = devicesOutput.split(/\r?\n/).filter((l) => l.trim());
  const deviceLines = lines.filter((l) => !l.startsWith("List of devices"));

  const results = [];
  const errors = [];

  for (const line of deviceLines) {
    const parts = line.split(/\s+/);
    const serial = parts[0];
    const deviceName = parts[1] || "unknown";

    try {
      // Query device capabilities
      let capabilityOutput;
      try {
        capabilityOutput = execSync(`"${sdbPath}" -s "${serial}" capability`, {
          encoding: "utf-8",
          timeout: 15000,
          windowsHide: true,
        });
      } catch (err) {
        errors.push({
          serial,
          error: `capability query failed: ${err.message}`,
        });
        continue;
      }

      // Parse capabilities and select the appropriate DUID command
      const capability = parseCapability(capabilityOutput);
      const duidCommand = selectDuidCommand(capability);

      // Execute the selected DUID command on the device via sdb shell
      let duidOutput;
      try {
        duidOutput = runDeviceShellCommand(sdbPath, serial, duidCommand);
      } catch (err) {
        errors.push({
          serial,
          error: `DUID command "${duidCommand}" failed: ${err.message}`,
        });
        continue;
      }

      const duid = extractDuidFromOutput(duidOutput);
      if (duid) {
        results.push({
          duid: duid.toUpperCase(),
          serial,
          deviceName,
          command: duidCommand,
        });
      } else {
        errors.push({
          serial,
          error: `DUID not found in output of command "${duidCommand}"`,
        });
      }
    } catch (err) {
      errors.push({ serial, error: err.message });
    }
  }

  return { duids: results, errors };
}

/**
 * Extract DUID from sdb capability output.
 *
 * The capability output contains key:value pairs. The DUID field may
 * appear as "duid:", "DUID:", or "duid =" depending on the device.
 *
 * @private
 * @param {string} capabilityOutput
 * @returns {string|null}
 */
function extractDuidFromCapability(capabilityOutput) {
  if (!capabilityOutput) return null;

  const lines = capabilityOutput.split(/\r?\n/);
  for (const line of lines) {
    // Match "duid: <value>" or "DUID: <value>" (case-insensitive)
    const match = line.match(/^\s*duid\s*[:=]\s*(.+?)\s*$/i);
    if (match && match[1]) {
      const value = match[1].trim();
      // Strip any surrounding quotes
      return value.replace(/^["']|["']$/g, "");
    }
  }

  return null;
}

/**
 * Extract DUID from the output of a DUID retrieval shell command.
 *
 * The shell command output may be:
 *   - A single line containing the DUID directly
 *   - Multi-line output where the DUID is on its own line
 *   - Key:value format (e.g. "duid: <value>")
 *
 * This function tries each strategy in order and returns the first valid DUID.
 *
 * @private
 * @param {string} output - raw output from the DUID shell command
 * @returns {string|null}
 */
function extractDuidFromOutput(output) {
  if (!output) return null;

  const trimmed = output.trim();
  if (trimmed.length === 0) return null;

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Strategy 1: Look for a "duid:" key:value pair in the output
  // (checked first so that "duid: VALUE" is not treated as a raw DUID)
  const fromCapability = extractDuidFromCapability(trimmed);
  if (fromCapability) return fromCapability;

  // Strategy 2: If the output is a single line, treat it as the DUID directly
  if (lines.length === 1) {
    const value = lines[0].trim().replace(/^["']|["']$/g, "");
    if (value.length > 0) return value;
  }

  // Strategy 3: Return the first non-empty line that looks like a DUID
  for (const line of lines) {
    const value = line.trim().replace(/^["']|["']$/g, "");
    if (value.length > 0) return value;
  }

  return null;
}

module.exports = {
  MAX_DUIDS,
  // DUID command constants
  CMD_DUID,
  CMD_SECURE_DUIDGADGET,
  CMD_SECURE_DUID,
  // Device version enum
  DeviceVersion,
  // Validation and parsing
  isValidDuid,
  getVersionFromDuid,
  getMinVersion,
  hasVDMode,
  parseDuidList,
  importDuidsFromFile,
  // Capability parsing and command selection
  parseCapability,
  selectDuidCommand,
  // DUID acquisition
  acquireDuidFromDevice,
  acquireDuidsFromAllDevices,
  // Internal helpers (exported for testing)
  extractDuidFromCapability,
  extractDuidFromOutput,
  runDeviceShellCommand,
};
