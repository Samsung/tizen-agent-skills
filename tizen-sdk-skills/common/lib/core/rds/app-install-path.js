// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS App Install Path Resolution — locates the on-device app install path.
 *
 * Core responsibility:
 * - Parse the package ID from the project's manifest (native/dotnet: tizen-manifest.xml,
 *   web: config.xml)
 * - Query the device for its app-install base directory (varies by Tizen version —
 *   see sdb-helper.js's multi-tier `getAppInstallPath()`)
 * - Combine the two into the absolute device path where RDS metadata
 *   (`.rds_deploy_marker`, `.rds_snapshot.json`) lives alongside the app's own files —
 *   this is the app's install directory itself, not a separate "rds_info" subdirectory
 *
 * Reference: packages/server/src/features/rds/rds-deploy-service.ts:getRdsInfoPath,
 *            parseWebPackageId, findManifestPath, parseManifestPackageId
 *
 * Deliberate divergence: the extension caches resolved paths per (projectDir,
 * deviceSerial) since it's a long-running server process, with a
 * `clearRdsInfoPathCache()` invalidation API. Each CLI invocation is a fresh
 * process — a cache that never survives past one command can never hit — so no
 * cache is ported here (docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 4, app-install-path.js row).
 *
 * @module core/rds/app-install-path
 */

const fs = require("fs");
const path = require("path");
const { detectAppType, findFilesByName } = require("./app-type-detector");
const { isSafePackageId, isSafeDevicePath } = require("./device-shell");
const {
  getAppInstallPath: queryDeviceAppInstallBase,
} = require("../sdb-helper");

/**
 * Parse the package ID from a web project's config.xml.
 *
 * Reads the `package` attribute from the `<tizen:application>` element, which
 * contains the full package ID (e.g., "com.example.myapp"). Falls back to
 * `<tizen:addon>` for addon-type projects.
 *
 * @param {string} projectDir - absolute path to project directory
 * @returns {string | null} package ID, or null if not found
 */
function parseWebPackageId(projectDir) {
  const configPath = path.join(projectDir, "config.xml");
  if (!fs.existsSync(configPath)) return null;

  try {
    const content = fs.readFileSync(configPath, "utf-8");

    const appMatch = content.match(
      /<tizen:application[^>]+package=["']([^"']+)["']/,
    );
    if (appMatch) return appMatch[1].trim();

    const addonMatch = content.match(
      /<tizen:addon[^>]+package=["']([^"']+)["']/,
    );
    if (addonMatch) return addonMatch[1].trim();

    return null;
  } catch {
    return null;
  }
}

/**
 * Find the tizen-manifest.xml path for native/dotnet projects.
 *
 * Search order:
 * 1. Project root (native projects have tizen-manifest.xml at root)
 * 2. Subdirectories alongside a `.csproj` file (dotnet projects)
 *
 * @param {string} projectDir - absolute path to project directory
 * @returns {string | null} absolute path to tizen-manifest.xml, or null if not found
 */
function findManifestPath(projectDir) {
  const rootManifest = path.join(projectDir, "tizen-manifest.xml");
  if (fs.existsSync(rootManifest)) {
    return rootManifest;
  }

  const manifestPaths = findFilesByName(projectDir, "tizen-manifest.xml");
  if (manifestPaths.length > 0) {
    const manifestDir = path.dirname(manifestPaths[0]);
    const hasCsproj = fs
      .readdirSync(manifestDir)
      .some((entry) => entry.endsWith(".csproj"));
    if (hasCsproj) {
      return manifestPaths[0];
    }
  }

  return null;
}

/**
 * Parse the package ID from a native/dotnet project's tizen-manifest.xml.
 *
 * Looks for the `package` attribute on the `<manifest>` element.
 *
 * @param {string} projectDir - absolute path to project directory
 * @returns {string | null} package ID, or null if not found
 */
function parseManifestPackageId(projectDir) {
  const manifestPath = findManifestPath(projectDir);
  if (!manifestPath) return null;

  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    const match = content.match(/package=["']([^"']+)["']/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Parse the launchable *app* ID (not the package ID) from a web project's
 * config.xml: `<tizen:application id="<pkgid>.<Name>" package="<pkgid>">`.
 *
 * This is the value `app_launcher -s` / `dlog --app-id` expect, and the value
 * the full-install path reports as `app_id` (it reads it back from
 * `app_launcher -l`). The RDS path has no install-script output to parse, so
 * it takes the same ID from the manifest instead.
 *
 * @param {string} projectDir
 * @returns {string | null}
 */
function parseWebAppId(projectDir) {
  const configPath = path.join(projectDir, "config.xml");
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const match = content.match(/<tizen:application[^>]*\sid=["']([^"']+)["']/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Parse the launchable app ID from a native/dotnet tizen-manifest.xml: the
 * `appid` attribute of the first `<ui-application>` / `<service-application>`
 * / `<widget-application>` / `<watch-application>` element.
 *
 * @param {string} projectDir
 * @returns {string | null}
 */
function parseManifestAppId(projectDir) {
  const manifestPath = findManifestPath(projectDir);
  if (!manifestPath) return null;
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    const match = content.match(
      /<(?:ui|service|widget|watch)-application[^>]*\sappid=["']([^"']+)["']/,
    );
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Get the RDS info path on the device.
 *
 * Parses the project manifest to determine the package ID, then queries the
 * device for its app installation base path and constructs the full device
 * path: `<appInstallBase>/<packageId>`.
 *
 * This is the directory on the device where RDS metadata (deploy marker,
 * snapshot) is stored alongside the app installation — it IS the app's own
 * install directory, not a separate "rds_info" subdirectory.
 *
 * No caching (see module doc comment) — every call re-queries the device.
 *
 * @param {string} projectDir - absolute path to project directory
 * @param {string} deviceSerial - device serial number, used to query the device
 *   for its app-install base path
 * @param {string} [appType] - optional app type override (auto-detected if omitted)
 * @param {{sdbPath?: string, timeoutMs?: number}} [opts] - forwarded to
 *   sdb-helper.js's `getAppInstallPath()`. Not present in the reference — added
 *   solely so tests can inject a fake `sdb` binary instead of hitting a real
 *   device (mirrors sdb-helper.js's own `opts.sdbPath` convention).
 * @returns {Promise<string | null>} device path, or null if it cannot be determined
 */
async function getRdsInfoPath(projectDir, deviceSerial, appType, opts = {}) {
  const resolvedAppType = appType ?? detectAppType(projectDir);
  if (!resolvedAppType) {
    return null;
  }

  const packageId =
    resolvedAppType === "web"
      ? parseWebPackageId(projectDir)
      : parseManifestPackageId(projectDir);

  if (!packageId) {
    console.warn(`[RDS] Could not parse package ID for project: ${projectDir}`);
    return null;
  }
  // The package ID is spliced into device-shell command lines (`cat`, `rm -f`)
  // and push destinations — refuse anything outside the Tizen ID alphabet
  // before a single sdb call is made.
  if (!isSafePackageId(packageId)) {
    console.warn(
      `[RDS] Package ID contains characters unsafe for the device shell, RDS disabled for this project: ${JSON.stringify(packageId)}`,
    );
    return null;
  }

  try {
    const appInstallBase = await queryDeviceAppInstallBase(deviceSerial, opts);
    const rdsInfoPath = `${appInstallBase}/${packageId}`;
    if (!isSafeDevicePath(rdsInfoPath)) {
      console.warn(
        `[RDS] Device app-install path contains unsafe characters: ${JSON.stringify(rdsInfoPath)}`,
      );
      return null;
    }
    return rdsInfoPath;
  } catch (err) {
    console.warn(
      `[RDS] Failed to get app install path from device: ${err.message}`,
    );
    return null;
  }
}

module.exports = {
  parseWebPackageId,
  parseWebAppId,
  findManifestPath,
  parseManifestPackageId,
  parseManifestAppId,
  getRdsInfoPath,
};
