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

/** Where to send users whose Linux has no command below. */
const NODE_DOWNLOAD_URL = "https://nodejs.org/en/download";

/**
 * Linux install commands by distribution family. Not the distribution
 * "nodejs" package: on current LTS releases it is below the floor (Ubuntu
 * 24.04 and Debian 12 ship Node 18), so both use the NodeSource repository,
 * whose nodejs package bundles npm.
 *
 * debian: the distro nodejs / npm / libnode-dev packages (what the old
 * `apt install nodejs npm` hint pulled in) are removed first — NodeSource's
 * nodejs overwrites their files and dpkg refuses. `;` not `&&`, so a package
 * that is not installed or not known does not stop the install.
 */
const LINUX_NODE_INSTALL = {
  debian:
    "sudo apt-get remove -y nodejs npm libnode-dev; " +
    `curl -fsSL https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x | sudo -E bash - ` +
    "&& sudo apt-get install -y nodejs",
  rhel:
    `curl -fsSL https://rpm.nodesource.com/setup_${NODE_MIN_MAJOR}.x | sudo bash - ` +
    "&& sudo dnf install -y nodejs",
  other: `Install Node.js ${NODE_MIN_MAJOR} LTS for your distribution from ${NODE_DOWNLOAD_URL}`,
};

/**
 * Distribution family from /etc/os-release text (ID and ID_LIKE).
 *
 * @param {string} osRelease - contents of /etc/os-release ("" if unreadable)
 * @returns {"debian"|"rhel"|"other"}
 */
function linuxDistroFamily(osRelease) {
  const field = (name) => {
    const m = String(osRelease || "").match(
      new RegExp(`^${name}=["']?([^"'\\n]*)`, "m"),
    );
    return m ? m[1].toLowerCase().split(/\s+/) : [];
  };
  const ids = [...field("ID"), ...field("ID_LIKE")];
  if (ids.some((id) => id === "debian" || id === "ubuntu")) return "debian";
  if (
    ids.some((id) =>
      ["rhel", "fedora", "centos", "rocky", "almalinux", "amzn"].includes(id),
    )
  ) {
    return "rhel";
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
 * All-OS install text for the error registry, whose default suggested_fix
 * cannot know the host.
 */
const ALL_OS_NODE_INSTALL =
  "Windows: winget install OpenJS.NodeJS.LTS / macOS: brew install node / " +
  `Ubuntu/Debian: ${LINUX_NODE_INSTALL.debian} / ` +
  `Fedora/RHEL: ${LINUX_NODE_INSTALL.rhel} / other Linux: ${NODE_DOWNLOAD_URL}`;

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
      `untested). Upgrade to Node.js ${NODE_MIN_MAJOR} LTS or later from https://nodejs.org/`;
  } else if (status === "fail") {
    message =
      `Node.js ${version} is not supported: Tizen SDK CLI runners do not work below v${NODE_HARD_MIN_MAJOR} ` +
      `and require v${NODE_MIN_MAJOR}+. Upgrade to Node.js ${NODE_MIN_MAJOR} LTS or later from https://nodejs.org/`;
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
  nodeVersionStatus,
  nodeFloorCheck,
};
