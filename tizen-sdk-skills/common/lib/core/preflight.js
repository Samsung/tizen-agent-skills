// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Installation pre-flight checks: Node.js / disk space
 *
 * Environment validation functions performed first before SDK installation.
 * installSdk() in sdk.js uses this module.
 *
 * Both checks accept an optional `deps` object so the tests can substitute the
 * process/filesystem probes (statfs, execFileSync, platform, execPath) without
 * touching the real host.
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const {
  formatError,
  formatDiskSpace,
} = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");

/** path module for a platform name — win32 paths must parse as win32 even on a Linux host. */
function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/**
 * Verify Node.js installation (first check before SDK installation)
 *
 * The runner itself IS a Node.js process, so the interpreter that started it
 * is the proof: `process.version` / `process.execPath` are authoritative.
 * Spawning `node --version` through a shell was the previous approach and it
 * failed under sandboxed hosts (Codex CLI) whose child PATH does not include
 * the interactively installed node (nvm/fnm shims) — issue #71 — even though
 * the runner was visibly running under Node.
 *
 * `where node` / `which node` is still run, best-effort, only to report
 * whether `node` resolves on the PATH of shells spawned from here; a miss is
 * a warning, never a failure.
 *
 * @param {string} [command]
 * @param {object} [deps] - test seams: execPath, version, isPkg, platform, spawnSync
 * @returns {object} Standard JSON Envelope
 *   - installed: success + version/path info
 *   - not installed: failure + node_not_found error + OS-specific guide
 */
async function checkNode(command = "tizen-sdk check-node", deps = {}) {
  const startTime = Date.now();
  const platform = deps.platform || process.platform;
  const isWin = platform === "win32";
  const execPath = deps.execPath || process.execPath;
  const version = deps.version || process.version;
  const isPkg = deps.isPkg !== undefined ? deps.isPkg : !!process.pkg;
  const spawnSync = deps.spawnSync || require("child_process").spawnSync;

  try {
    const warnings = [];

    // 1. Version: this process is the interpreter. A pkg-compiled binary
    // (tizen-cli) embeds Node too, so the same fields apply.
    const versionMatch = String(version).match(/^v(\d+)/);
    const majorVersion = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    if (!versionMatch) {
      // Only reachable when a caller injected a broken version string —
      // process.version is always "vN.N.N".
      const installGuide = isWin
        ? "winget install OpenJS.NodeJS.LTS"
        : platform === "darwin"
          ? "brew install node"
          : "sudo apt update && sudo apt install -y nodejs npm";
      return formatError(
        command,
        "node_not_found",
        "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 18+. " +
          "Please install Node.js LTS from https://nodejs.org/ and retry.",
        installGuide,
        startTime,
      );
    }

    // 2. Is `node` resolvable on the PATH of shells spawned from here? Only
    // informational: the runner already proved Node is installed.
    let onPath = null;
    let pathResolved = null;
    if (!isPkg) {
      try {
        const r = spawnSync(isWin ? "where" : "which", ["node"], {
          encoding: "utf-8",
          timeout: 10000,
          windowsHide: true,
        });
        if (!r.error && r.status === 0 && r.stdout && r.stdout.trim()) {
          onPath = true;
          pathResolved = r.stdout.trim().split(/\r?\n/)[0];
        } else {
          onPath = false;
        }
      } catch (_e) {
        onPath = false;
      }
      if (onPath === false) {
        warnings.push(
          `Node.js ${version} is running this runner from ${execPath}, but 'node' does not resolve on the PATH of ` +
            "shells spawned from here (sandboxed or minimal PATH). Runners started with an absolute node path, or " +
            "with escalated permissions, still work.",
        );
      }
    }

    // 3. Validate version (v18+ recommended)
    if (majorVersion > 0 && majorVersion < 18) {
      warnings.push(
        `Node.js ${version} is older than the recommended v18+. Consider upgrading to Node.js 18 LTS or later from https://nodejs.org/`,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        installed: true,
        version,
        path: execPath,
        major_version: majorVersion > 0 ? majorVersion : null,
        source: isPkg ? "pkg" : "process",
        ...(onPath !== null ? { on_path: onPath } : {}),
        ...(pathResolved && pathResolved !== execPath
          ? { path_on_path: pathResolved }
          : {}),
      },
      { warnings },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to check Node.js: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Verify disk space (pre-check before SDK installation)
 *
 * Probe order: fs.statfsSync(path) → fs.statfsSync(<root>) → platform command
 * chain (Windows: PowerShell Get-PSDrive → fsutil volume diskfree → wmic;
 * Linux/macOS: df -Pk). `wmic` is gone from Windows 11 24H2+, which is why it
 * is last (issue #69: the old wmic-only fallback returned "0 GB free" and
 * blocked the install on a drive with 66 GB free).
 *
 * When NO probe can measure the drive the check does not fail: it returns a
 * success envelope with free_gb/total_gb/sufficient = null, source "unknown"
 * and a warning, so a broken probe never blocks an install. Only a real
 * measurement below requiredGb is an insufficient_disk_space failure.
 *
 * @param {string} [targetPath] - path to check (default: user home directory)
 * @param {number} [requiredGb=15] - Tizen SDK minimum required space (GB)
 * @param {string} [command]
 * @param {object} [deps] - test seams: statfsSync, execFileSync, platform, homedir
 * @returns {object} Standard JSON Envelope
 *   - sufficient (or unknown): success + disk info
 *   - insufficient: failure + insufficient_disk_space error
 */
async function checkDiskSpace(
  targetPath,
  requiredGb = 15,
  command = "tizen-sdk check-disk-space",
  deps = {},
) {
  const startTime = Date.now();
  try {
    // Determine path: argument > user home directory (check home drive only)
    let checkPath = targetPath;
    if (!checkPath) {
      checkPath = deps.homedir ? deps.homedir() : os.homedir();
    }

    // Normalize path (with the path flavour of the platform being probed — the
    // tests inject deps.platform, and a win32 drive path must stay a win32 path
    // when the suite runs on Linux CI)
    checkPath = pathFor(deps.platform || process.platform).resolve(checkPath);
    const GB = 1024 * 1024 * 1024;
    const requiredBytes = Math.round(requiredGb * GB);

    const measured = measureDiskSpace(checkPath, deps);

    if (!measured) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success(
        {
          path: checkPath,
          total_bytes: null,
          free_bytes: null,
          used_bytes: null,
          total_gb: null,
          free_gb: null,
          required_gb: requiredGb,
          sufficient: null,
          source: "unknown",
        },
        {
          warnings: [
            `Free disk space could not be determined for ${checkPath} (statfs, PowerShell, fsutil, wmic and df all ` +
              `failed or are unavailable on this host). Proceeding without the check — make sure at least ` +
              `${requiredGb} GB is free on that drive before installing the Tizen SDK.`,
          ],
        },
      );
    }

    const { total: totalBytes, free: freeBytes, source } = measured;
    const usedBytes = totalBytes - freeBytes;
    const totalGb = Math.round((totalBytes / GB) * 100) / 100;
    const freeGb = Math.round((freeBytes / GB) * 100) / 100;
    const sufficient = freeBytes >= requiredBytes;

    if (!sufficient) {
      const deficitGb =
        Math.round(((requiredBytes - freeBytes) / GB) * 100) / 100;
      return formatError(
        command,
        "insufficient_disk_space",

        `Insufficient disk space: ${freeGb} GB free, but ${requiredGb} GB required for Tizen SDK installation. ` +
          `Need ${deficitGb} GB more on the target drive.`,
        `Free up at least ${deficitGb} GB on the drive containing ${checkPath} before installing Tizen SDK.`,
        startTime,
      );
    }

    const diskInfo = {
      path: checkPath,
      total_bytes: totalBytes,
      free_bytes: freeBytes,
      used_bytes: usedBytes,
      total_gb: totalGb,
      free_gb: freeGb,
      required_gb: requiredGb,
      sufficient: true,
      source,
    };

    return formatDiskSpace(diskInfo, startTime, command);
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to check disk space: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Measure a drive: statfs on the path, statfs on its root, then the platform
 * command chain. Returns null when nothing produced a usable total.
 *
 * @param {string} checkPath
 * @param {object} [deps]
 * @returns {{total: number, free: number, source: string}|null}
 */
function measureDiskSpace(checkPath, deps = {}) {
  const statfsSync =
    deps.statfsSync !== undefined
      ? deps.statfsSync
      : typeof fs.statfsSync === "function"
        ? fs.statfsSync
        : null;

  if (typeof statfsSync === "function") {
    const root = pathFor(deps.platform || process.platform).parse(
      checkPath,
    ).root;
    for (const candidate of [checkPath, root]) {
      if (!candidate) continue;
      try {
        const stats = statfsSync(candidate);
        // bavail (blocks available to unprivileged users), not bfree — bfree
        // would overstate free space by including root-reserved blocks.
        const total = Number(stats.bsize) * Number(stats.blocks);
        const free = Number(stats.bsize) * Number(stats.bavail);
        if (Number.isFinite(total) && total > 0 && Number.isFinite(free)) {
          return { total, free, source: "statfs" };
        }
      } catch (_statfsErr) {
        // try the next candidate / the command chain
      }
      if (candidate === root) break;
    }
  }

  return _getDiskSpaceViaCommand(checkPath, deps);
}

/**
 * Disk space via platform commands (statfs unavailable or failed).
 *
 * Windows: PowerShell Get-PSDrive → fsutil volume diskfree → wmic (legacy).
 * Linux/macOS: df -Pk. Every probe runs through execFileSync with an argument
 * array — checkPath is user input and must not pass through a shell.
 *
 * @param {string} checkPath - path to check
 * @param {object} [deps] - test seams: execFileSync, platform
 * @returns {{total: number, free: number, source: string}|null}
 */
function _getDiskSpaceViaCommand(checkPath, deps = {}) {
  const execFileSync =
    deps.execFileSync || require("child_process").execFileSync;
  const platform = deps.platform || process.platform;
  const run = (file, args) =>
    execFileSync(file, args, {
      encoding: "utf-8",
      timeout: 15000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });

  if (platform === "win32") {
    // Drive letter only (C:) — UNC and other roots have no command probe.
    const drive = path.win32.parse(checkPath).root.replace(/[\\/]+$/, "");
    if (!/^[A-Za-z]:$/.test(drive)) return null;
    const letter = drive[0];

    // 1. PowerShell Get-PSDrive (present on every supported Windows).
    try {
      const output = run("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$d = Get-PSDrive -Name '${letter}' -PSProvider FileSystem -ErrorAction Stop; ` +
          `Write-Output ('FREE=' + $d.Free); Write-Output ('TOTAL=' + ($d.Used + $d.Free))`,
      ]);
      const free = parseInt((output.match(/FREE=(\d+)/) || [])[1], 10);
      const total = parseInt((output.match(/TOTAL=(\d+)/) || [])[1], 10);
      if (total > 0 && Number.isFinite(free)) {
        return { total, free, source: "powershell" };
      }
    } catch (_e) {
      // PowerShell unavailable or blocked — next probe
    }

    // 2. fsutil volume diskfree: line order is stable across locales
    //    (Total free bytes / Total bytes / Total quota free bytes), the labels
    //    are not, so take the first two numbers.
    try {
      const output = run("fsutil", ["volume", "diskfree", drive]);
      const numbers = output
        .split(/\r?\n/)
        .map((line) => line.match(/:\s*([\d,.]+)/))
        .filter(Boolean)
        .map((m) => parseInt(m[1].replace(/[,.]/g, ""), 10))
        .filter((n) => Number.isFinite(n));
      if (numbers.length >= 2 && numbers[1] > 0) {
        return { total: numbers[1], free: numbers[0], source: "fsutil" };
      }
    } catch (_e) {
      // fsutil failed — next probe
    }

    // 3. wmic — removed from Windows 11 24H2+, kept for older hosts.
    try {
      const output = run("wmic", [
        "logicaldisk",
        "where",
        `Caption='${drive}'`,
        "get",
        "FreeSpace,Size",
        "/format:value",
      ]);
      let free = 0,
        total = 0;
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("FreeSpace=")) {
          free = parseInt(trimmed.split("=")[1], 10) || 0;
        } else if (trimmed.startsWith("Size=")) {
          total = parseInt(trimmed.split("=")[1], 10) || 0;
        }
      }
      if (total > 0) return { total, free, source: "wmic" };
    } catch (_e) {
      // wmic missing — nothing left
    }
    return null;
  }

  // Linux/macOS: df -Pk (POSIX output format: one line per filesystem)
  try {
    const output = run("df", ["-Pk", checkPath]);
    const lines = output.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[lines.length - 1].trim().split(/\s+/);
      // Filesystem 1024-blocks Used Available Capacity Mounted on
      const total = parseInt(parts[1], 10) * 1024;
      const free = parseInt(parts[3], 10) * 1024;
      if (Number.isFinite(total) && total > 0 && Number.isFinite(free)) {
        return { total, free, source: "df" };
      }
    }
  } catch (_e) {
    // df failed
  }
  return null;
}

module.exports = {
  checkNode,
  checkDiskSpace,
  measureDiskSpace,
  _getDiskSpaceViaCommand,
};
