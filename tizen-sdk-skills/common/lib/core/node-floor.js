// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * The supported Node.js floor, in one place.
 *
 * check-node (preflight.js), sdk-install (sdk.js) and `tizen-sdk --doctor`
 * all classify the running Node.js through nodeFloorCheck(), and every
 * user-facing "Node.js N+" string is built from NODE_MIN_MAJOR, so a floor
 * bump is this file plus `.nvmrc` (a test keeps the two equal).
 *
 * Leaf module: no requires, so envelope.js can use it without a cycle.
 */

/** Lowest Node.js major the runners support and CI tests (`.nvmrc`). */
const NODE_MIN_MAJOR = 22;
/** Below this major the runners are known not to work at all. */
const NODE_HARD_MIN_MAJOR = 18;

/** Node.js download page (guide_url, and the only hint where no safe command fits). */
const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";

/**
 * Node version managers recognised from the running interpreter's path, and
 * the command that installs the floor with each. When the runners run under
 * one, a system-wide install would not replace the Node on PATH, so the hint
 * must be the manager's own command. (nvm-windows is not listed: it runs node
 * through a symlink, so its execPath does not show the manager.)
 */
const VERSION_MANAGERS = [
  {
    name: "nvm",
    match: /[\\/]\.nvm[\\/]versions[\\/]node[\\/]/,
    command: `nvm install ${NODE_MIN_MAJOR} && nvm alias default ${NODE_MIN_MAJOR}`,
  },
  {
    name: "fnm",
    match: /[\\/]fnm(_multishells)?[\\/]|[\\/]\.?fnm[\\/]node-versions[\\/]/,
    command: `fnm install ${NODE_MIN_MAJOR} && fnm default ${NODE_MIN_MAJOR}`,
  },
  {
    name: "volta",
    match: /[\\/]\.?volta[\\/]/i,
    command: `volta install node@${NODE_MIN_MAJOR}`,
  },
];

/**
 * The Node.js install command to suggest, or null when there is no command
 * that is both safe and right for the host — then the caller points at
 * NODE_DOWNLOAD_URL instead.
 *
 * Only non-destructive commands: a version manager's own install (when the
 * runner runs under one), winget on Windows, Homebrew on macOS. Linux system
 * installs get none: the distribution's nodejs is below the floor on current
 * LTS releases (Ubuntu 24.04 / Debian 12 ship Node 18), and replacing it
 * (NodeSource and the like) means removing packages, distribution- and
 * release-specific steps and an interactive confirmation — not something to
 * hand an agent as a one-line command. tizen-check-node's SKILL.md describes
 * it for the user.
 *
 * @param {object} [opts]
 * @param {string} [opts.platform] - default process.platform
 * @param {string} [opts.execPath] - default process.execPath
 * @returns {string|null}
 */
function nodeInstallCommand(opts = {}) {
  const platform = opts.platform || process.platform;
  const execPath = String(opts.execPath || process.execPath || "");
  const manager = VERSION_MANAGERS.find((m) => m.match.test(execPath));
  if (manager) return manager.command;
  if (platform === "win32") return "winget install OpenJS.NodeJS.LTS";
  if (platform === "darwin") return "brew install node";
  return null;
}

/**
 * Classify a Node.js major version against the supported floor.
 *
 * @param {number} major - Node.js major version (e.g. 22)
 * @returns {"ok"|"warn"|"fail"} ok at or above NODE_MIN_MAJOR; warn for
 *   end-of-life majors that may still run; fail below NODE_HARD_MIN_MAJOR
 *   or for an unparseable value
 */
function nodeVersionStatus(major) {
  if (!Number.isFinite(major) || major < NODE_HARD_MIN_MAJOR) return "fail";
  return major >= NODE_MIN_MAJOR ? "ok" : "warn";
}

/**
 * Check a running Node.js against the floor.
 *
 * A pkg-compiled binary embeds its own Node: `process.version` is that
 * build-time runtime, which the user cannot upgrade, so the floor is not
 * applied there (status "ok", skipped true).
 *
 * For warn/fail, `message` is the full user-facing text — check-node and
 * doctor show it as is — and ends with the install command when there is one.
 *
 * @param {object} [opts]
 * @param {string} [opts.version] - default process.version
 * @param {boolean} [opts.isPkg] - default !!process.pkg
 * @param {string} [opts.platform] - default process.platform
 * @param {string} [opts.execPath] - default process.execPath
 * @returns {{major: number|null, status: "ok"|"warn"|"fail",
 *   skipped: boolean, message: string|null, installCommand: string|null}}
 */
function nodeFloorCheck(opts = {}) {
  const version = opts.version !== undefined ? opts.version : process.version;
  const isPkg = opts.isPkg !== undefined ? opts.isPkg : !!process.pkg;
  const m = String(version).match(/^v?(\d+)/);
  const major = m ? parseInt(m[1], 10) : null;
  const installCommand = nodeInstallCommand(opts);

  if (isPkg) {
    return {
      major,
      status: "ok",
      skipped: true,
      message: null,
      installCommand,
    };
  }

  const status = nodeVersionStatus(major === null ? NaN : major);
  let message = null;
  if (status === "warn") {
    message =
      `Node.js ${version} is older than the required v${NODE_MIN_MAJOR}+ (older majors are end-of-life and ` +
      `untested). Upgrade to Node.js ${NODE_MIN_MAJOR} LTS or later from ${NODE_DOWNLOAD_URL}.`;
  } else if (status === "fail") {
    message =
      `Node.js ${version} is not supported: Tizen SDK CLI runners do not work below v${NODE_HARD_MIN_MAJOR} ` +
      `and require v${NODE_MIN_MAJOR}+. Upgrade to Node.js ${NODE_MIN_MAJOR} LTS or later from ${NODE_DOWNLOAD_URL}.`;
  }
  if (message && installCommand) {
    message += ` Install command: ${installCommand}`;
  }
  return { major, status, skipped: false, message, installCommand };
}

module.exports = {
  NODE_MIN_MAJOR,
  NODE_HARD_MIN_MAJOR,
  NODE_DOWNLOAD_URL,
  nodeInstallCommand,
  nodeVersionStatus,
  nodeFloorCheck,
};
