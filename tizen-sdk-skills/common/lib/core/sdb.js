// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Shared sdb utilities: binary resolution, device listing, serial auto-selection.
 *
 * Single source for the sdb plumbing used by sdb-helper.js and screenshot.js —
 * do not re-implement these per module.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readSdkPath } = require("./sdk");
const { isValidSerial } = require("./shell-safety");

/**
 * Resolve the sdb binary path from the configured SDK path.
 * @returns {{sdbPath: string}|{error: string}}
 */
function resolveSdb() {
  const sdkPath = readSdkPath();
  if (!sdkPath) {
    return {
      error: "Tizen SDK path is not configured. Run tizen-sdk-init first.",
    };
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  const sdbPath = path.join(sdkPath, "tools", `sdb${ext}`);
  return { sdbPath };
}

/**
 * Locate an sdb binary on PATH.
 *
 * Used only as a fallback when the configured SDK path has no sdb — e.g. the
 * config is stale, or the SDK was installed somewhere else entirely.
 *
 * @returns {string|null} absolute path to sdb, or null if not on PATH
 */
function findSdbOnPath() {
  const probe = process.platform === "win32" ? "where sdb" : "command -v sdb";
  try {
    const out = execSync(probe, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    });
    // `where` can print several matches — take the first that exists
    for (const line of out.split(/\r?\n/)) {
      const candidate = line.trim();
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  } catch (_error) {
    // not on PATH
  }
  return null;
}

/**
 * Resolve an sdb binary that actually exists on disk.
 *
 * Order: the configured SDK's `<sdk>/tools/sdb[.exe]`, then sdb on PATH.
 * Unlike resolveSdb(), this verifies the file is really there. Callers that
 * need to *run* sdb use this; resolveSdkDataPath() below has its own
 * config-first order and only falls back to PATH when the configured
 * directory is not an SDK at all.
 *
 * @returns {{sdbPath: string, source: 'sdk_path'|'path_env'}|{error: string}}
 */
function resolveSdbBinary() {
  const resolved = resolveSdb();
  if (!resolved.error && fs.existsSync(resolved.sdbPath)) {
    return { sdbPath: resolved.sdbPath, source: "sdk_path" };
  }
  const onPath = findSdbOnPath();
  if (onPath) return { sdbPath: onPath, source: "path_env" };

  return {
    error:
      resolved.error ||
      `sdb not found at ${resolved.sdbPath} and not on PATH. Run tizen-sdk-init with the correct SDK path.`,
  };
}

/**
 * Derive the Tizen SDK root directory from an sdb binary path.
 * sdb always lives at `<sdk-root>/tools/sdb[.exe]`.
 *
 * @param {string} sdbPath
 * @returns {string} the SDK root
 */
function sdkRootFromSdb(sdbPath) {
  return path.dirname(path.dirname(sdbPath));
}

/**
 * Does `dir` look like an installed Tizen SDK root? The installer writes
 * `sdk.info` (the same marker sdk.js's checkSdkInstallStatus() uses); a
 * manually unpacked SDK at least has `tools/sdb[.exe]`.
 *
 * @param {string} dir
 * @returns {boolean}
 */
function looksLikeSdkRoot(dir) {
  if (!dir) return false;
  const ext = process.platform === "win32" ? ".exe" : "";
  return (
    fs.existsSync(path.join(dir, "sdk.info")) ||
    fs.existsSync(path.join(dir, "tools", `sdb${ext}`))
  );
}

/**
 * Resolve the Tizen SDK *data* directory (where Device Manager, the emulator
 * manager, and keystores keep their per-user state).
 *
 * Config first, but never blindly: the configured path must actually be an
 * SDK, and a stale config still recovers via the sdb that is on PATH.
 *
 *   1. SDK root = `~/.tizen.sdk.path.config` (default `~/tizen-sdk`) if that
 *      directory holds `sdk.info` or `tools/sdb[.exe]`        -> source `sdk_path`
 *   2. else SDK root = two levels up from the sdb on PATH       -> source `path_env`
 *   3. else error (callers report it as `sdk_path_not_set`) — nothing is
 *      derived from a directory that does not exist, so no phantom
 *      `~/tizen-sdk-data` gets created on a machine without an SDK.
 *
 * Data path from the chosen root:
 *   a. `TIZEN_SDK_DATA_PATH` in `<sdk-root>/sdk.info` (authoritative — this is
 *      what the installer writes and what Tizen Studio reads) -> `+sdk.info`
 *   b. else the `<sdk-root>-data` sibling convention
 *      (e.g. `D:\tools\tizen-studio` -> `D:\tools\tizen-studio-data`) -> `+sibling`
 *
 * Why config wins over PATH: a machine with two SDKs (say Tizen Studio on D:
 * with its tools on PATH, and a `tz`-only SDK the user pointed the config at)
 * must resolve to the configured one, or keystores and profiles.xml end up in
 * the other SDK's data directory.
 *
 * @returns {{dataPath: string, sdkRoot: string, source: string}|{error: string}}
 */
function resolveSdkDataPath() {
  const configured = readSdkPath();
  let sdkRoot = null;
  let source = null;
  let sdbOnPath = null;

  if (looksLikeSdkRoot(configured)) {
    sdkRoot = configured;
    source = "sdk_path";
  } else {
    sdbOnPath = findSdbOnPath();
    const fromPath = sdbOnPath ? sdkRootFromSdb(sdbOnPath) : null;
    if (looksLikeSdkRoot(fromPath)) {
      sdkRoot = fromPath;
      source = "path_env";
    }
  }

  if (!sdkRoot) {
    const pathHint = sdbOnPath
      ? `the sdb on PATH (${sdbOnPath}) is not inside an SDK either`
      : "sdb is not on PATH";
    return {
      error:
        `Tizen SDK not found at ${configured} (no sdk.info or tools/sdb) and ${pathHint}. ` +
        "Run tizen-sdk-init with the correct SDK path.",
    };
  }

  // sdk.info is authoritative — the data path is not required to be a sibling
  try {
    const sdkInfoPath = path.join(sdkRoot, "sdk.info");
    if (fs.existsSync(sdkInfoPath)) {
      const info = fs.readFileSync(sdkInfoPath, "utf-8");
      const m = /^\s*TIZEN_SDK_DATA_PATH\s*=\s*(.+?)\s*$/m.exec(info);
      if (m && m[1]) {
        return { dataPath: m[1], sdkRoot, source: `${source}+sdk.info` };
      }
    }
  } catch (_error) {
    // unreadable sdk.info -> fall through to the sibling convention
  }

  // Convention: the data dir sits next to the SDK root, same name + "-data"
  const dataPath = path.join(
    path.dirname(sdkRoot),
    `${path.basename(sdkRoot)}-data`,
  );
  return { dataPath, sdkRoot, source: `${source}+sibling` };
}

/**
 * Run sdb and return stdout. Throws on non-zero exit.
 *
 * @param {string} sdbPath
 * @param {string} args
 * @param {{timeout?: number, viaTempFile?: boolean}} [opts]
 * @param {boolean} [opts.viaTempFile] - redirect output to a temp file instead of a pipe.
 *   REQUIRED when sdb has to start its own server daemon (e.g. a cold `sdb devices` with
 *   no server running yet): the daemon inherits the pipe write handle, so the pipe never
 *   closes when `sdb` itself exits and execSync blocks forever — file redirection returns
 *   as soon as the immediate child exits, regardless of what the daemon still holds open
 *   (same fix as plugin-cache.js's `execPluginScript({ captureViaTempFile: true })`).
 */
function runSdb(sdbPath, args, opts = {}) {
  const timeout = opts.timeout || 30000;
  const cmd = `"${sdbPath}" ${args}`;

  if (!opts.viaTempFile) {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
      timeout,
    });
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `tizen-sdb-${process.pid}-${Date.now()}.out`,
  );
  const readTmp = () => {
    try {
      return fs.readFileSync(tmpFile, "utf-8");
    } catch (_e) {
      return "";
    }
  };
  try {
    execSync(`${cmd} > "${tmpFile}" 2>&1`, {
      stdio: ["ignore", "ignore", "ignore"],
      timeout,
    });
    return readTmp();
  } catch (error) {
    error.stdout = readTmp();
    throw error;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch (_e) {
      // ignore — a still-running daemon may hold the file open
    }
  }
}

/**
 * Parse `sdb devices` output into an array of device objects.
 * Skips the "List of devices attached" header.
 * Matches on the state column (device/offline/locked), not column position.
 *
 * @param {string} output - stdout from `sdb devices`
 * @returns {Array<{serial: string, state: string}>}
 */
function parseDevices(output) {
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const devices = [];
  for (const line of lines) {
    // Skip header lines
    if (/list of devices/i.test(line)) continue;
    // Each device line: "<serial>    <state>    [optional name/extra]"
    // Some Tizen sdb versions output a 3rd column (device name, e.g.
    // "emulator-26101  device  tizen-vm-default"), so we only check the
    // 2nd column for the state value, not the entire remainder of the line.
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const serial = parts[0];
      const state = parts[1];
      if (/^(device|offline|locked|unauthorized)$/i.test(state)) {
        devices.push({ serial, state });
      }
    }
  }
  return devices;
}

/**
 * Resolve the target device serial: use the given serial as-is, otherwise
 * auto-select when exactly one online device is connected.
 *
 * @param {string} sdbPath
 * @param {string|null|undefined} serial - explicit serial (skips discovery)
 * @param {{viaTempFile?: boolean}} [opts] - forwarded to runSdb() — pass
 *   `{viaTempFile: true}` when the sdb server may not be running yet (see
 *   runSdb()'s doc comment)
 * @returns {{serial: string, devices?: Array}|{errorCategory: string, message: string, devices?: Array}}
 *   On failure, errorCategory is one of "io_error" | "device_not_found" | "multiple_devices".
 */
function resolveSerial(sdbPath, serial, opts = {}) {
  if (serial) {
    // Every caller splices the serial into `-s "<serial>"` on a command line
    // that goes through a shell (runSdb → execSync). Screening it here covers
    // all of them at once instead of relying on each call site to remember
    // (file-transfer, screenshot and project already check at their own edge;
    // sdb-helper did not).
    if (!isValidSerial(serial)) {
      return {
        errorCategory: "invalid_parameters",
        message: `Invalid device serial "${serial}": only letters, digits, '.', '_', ':' and '-' are allowed.`,
      };
    }
    return { serial };
  }
  let output;
  try {
    output = runSdb(sdbPath, "devices", opts);
  } catch (error) {
    return {
      errorCategory: "io_error",
      message: `sdb devices failed: ${error.message}`,
    };
  }
  const devices = parseDevices(output);
  const online = devices.filter((d) => d.state === "device");
  if (online.length === 0) {
    return {
      errorCategory: "device_not_found",
      message:
        "No connected Tizen device or emulator found. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it.",
      devices,
    };
  }
  if (online.length > 1) {
    return {
      errorCategory: "multiple_devices",
      message: `Multiple devices connected (${online.map((d) => d.serial).join(", ")}). Specify --serial to select one.`,
      devices,
    };
  }
  return { serial: online[0].serial, devices };
}

/**
 * Online entries of a parseDevices() table, reduced to `{serial, state}`.
 *
 * Offline / unauthorized / locked entries are dropped: they appear in
 * `sdb devices` but cannot be targeted with `-s`, so listing them next to a
 * "pick one" prompt only sends the user into a second failure.
 *
 * @param {Array|undefined} devices
 * @returns {Array<{serial: string, state: string}>}
 */
function onlineDevices(devices) {
  return (devices || [])
    .filter((d) => d && d.state === "device")
    .map((d) => ({ serial: d.serial, state: d.state }));
}

/**
 * Describe a failed resolveSerial() result in Standard JSON Envelope terms.
 *
 * Every device command maps the same resolveSerial() failure onto its
 * envelope; before this helper each module hand-wrote that mapping (sdb-helper,
 * screenshot, project, vd, dlog-analyzer) and they drifted — one attached a
 * suggested_fix, another listed offline serials, a third collapsed every
 * category into device_not_found. This is the single place that decides:
 *
 *   - `category`      — resolveSerial()'s errorCategory, unchanged
 *                       (device_not_found / multiple_devices / io_error /
 *                       invalid_parameters)
 *   - `devices`       — the ONLINE devices only (see onlineDevices()); empty
 *                       for every category but multiple_devices
 *   - `message`       — resolveSerial()'s message, except multiple_devices,
 *                       which is rebuilt around the caller's serial option so
 *                       the agent is told how THIS command takes a serial
 *   - `suggestedFix`  — multiple_devices: "Re-run with <serial option>" with
 *                       the online serials spliced in; device_not_found:
 *                       `opts.noDeviceFix` (null → formatError() falls back to
 *                       the ERROR_CODES registry default); otherwise null
 *   - `detailLines`   — one "<serial> (<state>)" line per online device, for
 *                       formatError()'s `details` (diagnostic lines)
 *
 * @param {{errorCategory: string, message: string, devices?: Array}} result -
 *   a failed resolveSerial() result (errorCategory set)
 * @param {{serialOption?: string, noDeviceFix?: string|null}} [opts]
 *   - serialOption: how the caller's command takes an explicit serial, with
 *     the literal `<serial>` as placeholder. Default "--serial <serial>".
 *     e.g. "--device-serial <serial>", or "the positional [serial] argument".
 *   - noDeviceFix: suggested_fix command for device_not_found.
 * @returns {{category: string, message: string, devices: Array<{serial: string, state: string}>, serials: string[], suggestedFix: string|null, detailLines: string[]}}
 */
function describeSerialFailure(result, opts = {}) {
  const serialOption = opts.serialOption || "--serial <serial>";
  const devices = onlineDevices(result.devices);
  const serials = devices.map((d) => d.serial);
  const category = result.errorCategory;
  let message = result.message;
  let suggestedFix = null;
  if (category === "multiple_devices") {
    message = `Multiple devices connected (${serials.join(", ")}). Pick one and re-run with ${serialOption}.`;
    suggestedFix = `Re-run with ${serialOption.split("<serial>").join(`<one-of: ${serials.join(", ")}>`)}`;
  } else if (category === "device_not_found") {
    suggestedFix = opts.noDeviceFix || null;
  }
  return {
    category,
    message,
    devices,
    serials,
    suggestedFix,
    detailLines: devices.map((d) => `${d.serial} (${d.state})`),
  };
}

/**
 * Make sure the sdb server daemon is running before any argv-style
 * (`execFile`, piped stdout) sdb call is made.
 *
 * A cold `sdb` client that has to spawn the daemon leaves the daemon holding
 * the client's stdout pipe, so an `execFile`-based caller waiting for the
 * pipe to close hangs even after the client exits (the reason `runSdb()`
 * has `viaTempFile`). `sdb start-server` through the temp-file path pays
 * that cost once, safely; afterwards every `execFile` call talks to an
 * already-running daemon. Failures are swallowed — the caller's own sdb
 * call will surface a real problem with a better message.
 *
 * @param {string} sdbPath
 */
function ensureSdbServer(sdbPath) {
  try {
    runSdb(sdbPath, "start-server", { viaTempFile: true, timeout: 15000 });
  } catch (_e) {
    // best effort — see doc comment
  }
}

module.exports = {
  resolveSdb,
  resolveSdbBinary,
  ensureSdbServer,
  findSdbOnPath,
  sdkRootFromSdb,
  looksLikeSdkRoot,
  resolveSdkDataPath,
  runSdb,
  parseDevices,
  resolveSerial,
  onlineDevices,
  describeSerialFailure,
};
