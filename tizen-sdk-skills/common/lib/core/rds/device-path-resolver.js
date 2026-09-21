// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS Device Path Resolver — converts host build-output paths to device-relative
 * paths for delta deployment.
 *
 * Core responsibility:
 * - Mutate each delta entry in place, adding a `devicePath` relative to the app's
 *   own install directory on the device (e.g. `bin/myapp`, `res/wgt/index.html`)
 * - Handle app-type-specific path prefixes (native/web/dotnet)
 *
 * `devicePath` is always relative to the app install root — never an absolute
 * device filesystem path. Resolving the absolute base (which requires a device
 * query) is a separate concern handled by `app-install-path.js`, used later when
 * actually pushing files.
 *
 * Reference: packages/server/src/features/rds/rds-deploy-service.ts:resolveDevicePaths,
 *            resolveNativeDevicePaths, resolveWebDevicePaths, resolveDotnetDevicePaths,
 *            stripNativePrefix
 *
 * @module core/rds/device-path-resolver
 */

const { join, basename } = require("path");
const {
  findTpkContentsPath,
  parseTpkContents,
} = require("./tpk-contents-parser");

/**
 * Strip the native app's build output prefix from a path.
 *
 * Best-effort fallback used only when `tpk_contents` is unavailable (see
 * {@link resolveNativeDevicePaths}) — the `Debug/tpk/` → device-root mapping is
 * reliable for standard native builds but does not account for custom staging
 * layouts the way `tpk_contents` does.
 *
 * @param {string} hostPath - relative path in the build output
 * @returns {string} path with native prefix removed (unchanged if no prefix matches)
 */
function stripNativePrefix(hostPath) {
  const prefixes = ["Debug/tpk/", "Release/tpk/"];
  for (const prefix of prefixes) {
    if (hostPath.startsWith(prefix)) {
      return hostPath.substring(prefix.length);
    }
  }
  return hostPath;
}

/**
 * Resolve device paths for native apps using `tpk_contents`.
 *
 * `tpk_contents` contains `sourcePath → destPath` mappings where `sourcePath` is
 * host-relative (e.g., `Debug/tpk/bin/myapp`) and `destPath` is device-relative
 * (e.g., `bin/myapp`).
 *
 * Falls back to {@link stripNativePrefix} for every entry when `tpk_contents` is
 * missing entirely. When it exists but doesn't cover an entry, throws — the
 * caller (`tryRdsDeploy`) catches this and falls back to a full install.
 *
 * @param {Array<{path: string, type: string, devicePath?: string}>} entries - mutated in place
 * @param {string} projectDir - absolute path to the project directory
 * @throws {Error} if a device path cannot be determined for any entry
 */
function resolveNativeDevicePaths(entries, projectDir) {
  const buildDir = join(projectDir, "Debug");
  const tpkContentsPath = findTpkContentsPath(buildDir);

  if (!tpkContentsPath) {
    console.warn(
      "[RDS] resolveDevicePaths: tpk_contents not found, using fallback path stripping for native",
    );
    for (const entry of entries) {
      entry.devicePath = stripNativePrefix(entry.path);
    }
    return;
  }

  const result = parseTpkContents(tpkContentsPath, "Debug");
  const pathMap = new Map();
  for (const e of result.entries) {
    pathMap.set(e.sourcePath, e.destPath);
  }

  for (const entry of entries) {
    const destPath = pathMap.get(entry.path);
    if (destPath) {
      entry.devicePath = destPath;
    } else {
      throw new Error(
        `No tpk_contents mapping for "${entry.path}" — cannot determine device path`,
      );
    }
  }
}

/**
 * Resolve device paths for web apps.
 *
 * Web build output is at `Debug/projects/<projectName>/` on the host, but on
 * the device the widget contents live under `res/wgt/`. Strip the host prefix
 * and re-root under `res/wgt/`.
 *
 * @param {Array<{path: string, type: string, devicePath?: string}>} entries - mutated in place
 * @param {string} projectDir - absolute path to the project directory
 * @throws {Error} if an entry's path doesn't match the expected host prefix
 */
function resolveWebDevicePaths(entries, projectDir) {
  const projectName = basename(projectDir);
  const prefix = `Debug/projects/${projectName}/`;

  for (const entry of entries) {
    if (entry.path.startsWith(prefix)) {
      const devicePathTail = entry.path.substring(prefix.length);
      entry.devicePath = `res/wgt/${devicePathTail}`;
    } else {
      throw new Error(
        `Web path "${entry.path}" doesn't match expected prefix "${prefix}" — cannot determine device path`,
      );
    }
  }
}

/**
 * Resolve device paths for .NET apps.
 *
 * Dotnet build output is at `<csprojDir>/bin/Debug/<TFM>/tpkroot/` on the host,
 * but on the device files are at the app root. Strip everything up to and
 * including `tpkroot/` to get the device-relative path.
 *
 * @param {Array<{path: string, type: string, devicePath?: string}>} entries - mutated in place
 * @throws {Error} if an entry's path doesn't contain `tpkroot/`
 */
function resolveDotnetDevicePaths(entries) {
  for (const entry of entries) {
    const tpkrootIdx = entry.path.indexOf("tpkroot/");
    if (tpkrootIdx !== -1) {
      entry.devicePath = entry.path.substring(tpkrootIdx + "tpkroot/".length);
    } else {
      throw new Error(
        `Dotnet path "${entry.path}" doesn't contain "tpkroot/" — cannot determine device path`,
      );
    }
  }
}

/**
 * Resolve device paths for delta entries based on app type.
 *
 * Mutates `entries` in place, setting `devicePath` on each. Dispatches to the
 * appropriate resolver (native/web/dotnet); falls back to `devicePath = path`
 * for an unrecognized app type.
 *
 * @param {Array<{path: string, type: string, devicePath?: string}>} entries - mutated in place
 * @param {string} projectDir - absolute path to project directory
 * @param {string} appType - 'native' | 'web' | 'dotnet'
 * @throws {Error} if a device path cannot be determined for any entry (native/web/dotnet only)
 */
function resolveDevicePaths(entries, projectDir, appType) {
  switch (appType) {
    case "native":
      resolveNativeDevicePaths(entries, projectDir);
      break;
    case "web":
      resolveWebDevicePaths(entries, projectDir);
      break;
    case "dotnet":
      resolveDotnetDevicePaths(entries);
      break;
    default:
      for (const entry of entries) {
        entry.devicePath = entry.path;
      }
  }
}

module.exports = {
  stripNativePrefix,
  resolveNativeDevicePaths,
  resolveWebDevicePaths,
  resolveDotnetDevicePaths,
  resolveDevicePaths,
};
