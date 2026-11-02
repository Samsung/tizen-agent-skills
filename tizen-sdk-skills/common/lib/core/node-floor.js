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

/** Normalise a path for prefix tests: forward slashes, no trailing slash, lower case on Windows. */
function normPath(p, win) {
  const n = String(p || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  return win ? n.toLowerCase() : n;
}

/** True when `file` lies under directory `dir` (both raw paths). */
function isUnder(file, dir, win) {
  if (!dir) return false;
  const d = normPath(dir, win);
  return d !== "" && normPath(file, win).startsWith(`${d}/`);
}

/**
 * Node version managers. A manager is recognised when the running
 * interpreter lies under a directory its environment variables name, or —
 * when they are not visible (sandboxed / minimal env) — matches its standard
 * layout. Under a manager a system-wide install would not replace the Node
 * it puts first on PATH, so the hint must be the manager's own command.
 */
const VERSION_MANAGERS = [
  {
    name: "nvm",
    platforms: ["linux", "darwin"],
    dirs: (env) => [env.NVM_DIR && `${env.NVM_DIR}/versions/node`],
    // ~/.nvm or $XDG_CONFIG_HOME/nvm
    layout: /\/\.?nvm\/versions\/node\//,
    command: `nvm install ${NODE_MIN_MAJOR} && nvm alias default ${NODE_MIN_MAJOR}`,
  },
  {
    // nvm-windows runs node through NVM_SYMLINK (by default the same folder
    // as a system install), so the path alone looks like a system install.
    name: "nvm-windows",
    platforms: ["win32"],
    dirs: (env) => [env.NVM_SYMLINK, env.NVM_HOME],
    layout: null,
    command: `nvm install ${NODE_MIN_MAJOR} && nvm use ${NODE_MIN_MAJOR}`,
  },
  {
    name: "fnm",
    platforms: null,
    dirs: (env) => [
      env.FNM_DIR,
      env.FNM_MULTISHELL_PATH &&
        env.FNM_MULTISHELL_PATH.replace(/[\\/]+[^\\/]+[\\/]*$/, ""),
    ],
    layout: /\/fnm_multishells\/|\/\.?fnm\/node-versions\//i,
    command: `fnm install ${NODE_MIN_MAJOR} && fnm default ${NODE_MIN_MAJOR}`,
  },
  {
    name: "volta",
    platforms: null,
    dirs: (env) => [env.VOLTA_HOME && `${env.VOLTA_HOME}/tools/image/node`],
    layout: /\/\.?volta\/tools\/image\/node\//i,
    command: `volta install node@${NODE_MIN_MAJOR}`,
  },
];

/**
 * Homebrew's own node formula (not a keg-only node@NN, not the nodejs.org
 * .pkg in /usr/local/bin). process.execPath is normally the resolved Cellar
 * path; the opt/ link and /opt/homebrew/bin (Homebrew's alone on Apple
 * Silicon) are accepted for an unresolved path.
 */
const HOMEBREW_NODE =
  /^(\/opt\/homebrew|\/usr\/local)\/(Cellar\/node\/|opt\/node\/)|^\/opt\/homebrew\/bin\/node$/;

/**
 * The Node.js install command to suggest, or null when there is none that is
 * both safe and certain to replace the running Node — then the caller points
 * at NODE_DOWNLOAD_URL instead.
 *
 * Only commands that change nothing but Node.js, and only when the source of
 * the running interpreter is known:
 * - under nvm / nvm-windows / fnm / volta: that manager's command;
 * - Windows, interpreter at %ProgramFiles%\nodejs\node.exe (the MSI that
 *   winget's OpenJS.NodeJS.LTS manages) and no nvm-windows: winget;
 * - macOS, interpreter from Homebrew's node formula: brew.
 * Everything else gets null: a Linux system Node (its distribution package is
 * below the floor on current LTS releases, and replacing it is not a
 * one-liner), asdf, mise, n, nodenv, a keg-only brew node@NN, the nodejs.org
 * .pkg. The commands are for the user's own terminal (nvm is a shell
 * function, loaded only in interactive shells).
 *
 * @param {object} [opts]
 * @param {string} [opts.platform] - default process.platform
 * @param {string} [opts.execPath] - default process.execPath
 * @param {object} [opts.env] - default process.env
 * @returns {string|null}
 */
function nodeInstallCommand(opts = {}) {
  const platform = opts.platform || process.platform;
  const execPath = String(opts.execPath || process.execPath || "");
  const env = opts.env || process.env;
  const win = platform === "win32";
  const exe = normPath(execPath, win);

  for (const m of VERSION_MANAGERS) {
    if (m.platforms && !m.platforms.includes(platform)) continue;
    if (m.dirs(env).some((d) => isUnder(execPath, d, win))) return m.command;
    if (m.layout && m.layout.test(exe)) return m.command;
  }

  if (win) {
    // nvm-windows is installed but not running this node: its symlink is
    // usually %ProgramFiles%\nodejs, so winget would write into it.
    if (env.NVM_HOME || env.NVM_SYMLINK) return null;
    const programFiles = env.ProgramFiles || "C:/Program Files";
    return exe === normPath(`${programFiles}/nodejs/node.exe`, true)
      ? "winget install OpenJS.NodeJS.LTS"
      : null;
  }
  if (platform === "darwin" && HOMEBREW_NODE.test(exe)) {
    return "brew upgrade node";
  }
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
    message += ` Install command (run it yourself in a terminal): ${installCommand}`;
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
