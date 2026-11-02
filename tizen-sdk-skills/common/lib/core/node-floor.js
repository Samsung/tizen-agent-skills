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
 * Leaf module: only Node built-ins, so envelope.js can use it without a cycle.
 */

/** Lowest Node.js major the runners support and CI tests (`.nvmrc`). */
const NODE_MIN_MAJOR = 22;
/** Below this major the runners are known not to work at all. */
const NODE_HARD_MIN_MAJOR = 18;

/** Node.js download page (guide_url, and the hint where no command fits). */
const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";

/**
 * Linux install commands by distribution family. Not the distribution
 * "nodejs" package: on current LTS releases it is below the floor (Ubuntu
 * 24.04 and Debian 12 ship Node 18), so both use the NodeSource repository,
 * whose nodejs package bundles npm.
 *
 * debian: first remove the distro packages NodeSource's nodejs collides
 * with — nodejs, npm, libnode-dev and the versioned runtime library
 * libnodeNN (libnode72 on 22.04, libnode109 on 24.04; dpkg refuses to
 * overwrite its /usr/share/systemtap/tapset/node.stp). dpkg-query lists only
 * the ones actually installed: `apt-get remove` with a name it does not know
 * aborts and removes nothing, and with no names it is a no-op. No `-y`: apt
 * shows what it would remove (packages depending on nodejs go too) and asks.
 * `&&` throughout, so declining stops before the conflicting install.
 */
const DEBIAN_NODE_REMOVE =
  "sudo apt-get remove $(dpkg-query -W -f='${db:Status-Abbrev}${Package}\\n' " +
  "nodejs npm 'libnode*' 2>/dev/null | awk '/^ii/{print $2}')";
const LINUX_NODE_INSTALL = {
  debian:
    `${DEBIAN_NODE_REMOVE} && ` +
    `curl -fsSL https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x | sudo -E bash - ` +
    "&& sudo apt-get install -y nodejs",
  rhel:
    `curl -fsSL https://rpm.nodesource.com/setup_${NODE_MIN_MAJOR}.x | sudo bash - ` +
    "&& sudo dnf install -y nodejs",
  other: `Install Node.js ${NODE_MIN_MAJOR} LTS for your distribution from ${NODE_DOWNLOAD_URL}`,
};

/**
 * Distribution family from /etc/os-release text (ID, ID_LIKE, VERSION_ID).
 *
 * "rhel" only where NodeSource's rpm repository and dnf both exist: Fedora,
 * RHEL-family 8+ and Amazon Linux 2023. RHEL/CentOS 7 and Amazon Linux 2
 * have yum only, and NodeSource does not build current Node for el7
 * (glibc 2.17), so they are "other".
 *
 * @param {string} osRelease - contents of /etc/os-release ("" if unreadable)
 * @returns {"debian"|"rhel"|"other"}
 */
function linuxDistroFamily(osRelease) {
  const field = (name) => {
    const m = String(osRelease || "").match(
      new RegExp(`^${name}=["']?([^"'\\n]*)`, "m"),
    );
    return m ? m[1].trim().toLowerCase() : "";
  };
  const id = field("ID");
  const ids = [id, ...field("ID_LIKE").split(/\s+/)].filter(Boolean);
  const versionMajor = parseInt(field("VERSION_ID"), 10);

  if (ids.some((x) => x === "debian" || x === "ubuntu")) return "debian";
  if (id === "fedora") return "rhel";
  if (id === "amzn") return versionMajor >= 2023 ? "rhel" : "other";
  if (ids.some((x) => ["rhel", "centos", "fedora"].includes(x))) {
    return versionMajor >= 8 ? "rhel" : "other";
  }
  return "other";
}

/**
 * The Node.js install command to suggest on a platform.
 *
 * @param {string} platform - process.platform value
 * @param {string} [osRelease] - /etc/os-release contents (Linux only)
 * @returns {string}
 */
function nodeInstallCommand(platform, osRelease = "") {
  if (platform === "win32") return "winget install OpenJS.NodeJS.LTS";
  if (platform === "darwin") return "brew install node";
  if (platform === "linux") {
    return LINUX_NODE_INSTALL[linuxDistroFamily(osRelease)];
  }
  return LINUX_NODE_INSTALL.other;
}

/**
 * The install command for this host. Reads /etc/os-release on Linux only,
 * so callers ask for it only when they are about to show it.
 *
 * @param {object} [deps] - test seams: platform, osRelease (string)
 * @returns {string}
 */
function hostNodeInstallCommand(deps = {}) {
  const platform = deps.platform || process.platform;
  let osRelease = deps.osRelease;
  if (osRelease === undefined) {
    osRelease = "";
    if (platform === "linux") {
      try {
        osRelease = require("fs").readFileSync("/etc/os-release", "utf-8");
      } catch (_e) {
        // unreadable → "other" Linux
      }
    }
  }
  return nodeInstallCommand(platform, osRelease);
}

/**
 * All-OS install text for the error registry, whose default suggested_fix
 * cannot know the host.
 */
const ALL_OS_NODE_INSTALL =
  "Windows: winget install OpenJS.NodeJS.LTS / macOS: brew install node / " +
  `Ubuntu/Debian: ${LINUX_NODE_INSTALL.debian} / ` +
  `Fedora/RHEL 8+: ${LINUX_NODE_INSTALL.rhel} / other Linux: ${NODE_DOWNLOAD_URL}`;

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
 * @param {object} [opts]
 * @param {string} [opts.version] - default process.version
 * @param {boolean} [opts.isPkg] - default !!process.pkg
 * @returns {{major: number|null, status: "ok"|"warn"|"fail",
 *   skipped: boolean, message: string|null}} message is the user-facing
 *   problem text for warn/fail, null otherwise
 */
function nodeFloorCheck(opts = {}) {
  const version = opts.version !== undefined ? opts.version : process.version;
  const isPkg = opts.isPkg !== undefined ? opts.isPkg : !!process.pkg;
  const m = String(version).match(/^v?(\d+)/);
  const major = m ? parseInt(m[1], 10) : null;

  if (isPkg) return { major, status: "ok", skipped: true, message: null };

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
  return { major, status, skipped: false, message };
}

module.exports = {
  NODE_MIN_MAJOR,
  NODE_HARD_MIN_MAJOR,
  NODE_DOWNLOAD_URL,
  LINUX_NODE_INSTALL,
  ALL_OS_NODE_INSTALL,
  linuxDistroFamily,
  nodeInstallCommand,
  hostNodeInstallCommand,
  nodeVersionStatus,
  nodeFloorCheck,
};
