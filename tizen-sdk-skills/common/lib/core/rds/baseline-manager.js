// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Baseline manifest management for RDS.
 *
 * Responsible for:
 * - Generating baseline manifests (XXH3-128 file hashes)
 * - Comparing current filesystem state against a stored baseline
 * - Resolving ignore lists per app type
 * - Detecting the application type from project files
 *
 * Reference: packages/server/src/features/rds/baseline-manager.ts
 *
 * @module core/rds/baseline-manager
 */

const picomatch = require("../../vendor/picomatch");
const { detectAppType } = require("./app-type-detector");
const { DEFAULT_IGNORE_LIST } = require("./constants");
const { loadState } = require("./state-manager");
const { prefixIgnorePatterns, buildHashRecord } = require("./scanner-shared");
const { scanInputFilesAsync } = require("./input-scanner");
const { scanOutputFilesAsync } = require("./output-scanner");

// ─── Ignore list resolution ──────────────────────────────────────────────────

/**
 * Resolve the ignore list.
 *
 * Always the default list today — there is no per-project override yet. Kept
 * as a function (rather than exporting the constant) so a future
 * `.tizen-rds/ignore-list.json` merge has one place to land; it takes no
 * arguments until then so callers don't pass values that are silently ignored.
 *
 * @returns {{patterns: string[]}} a fresh copy of the ignore list config
 */
function getIgnoreList() {
  return { ...DEFAULT_IGNORE_LIST };
}

// ─── Baseline manifest generation ────────────────────────────────────────────

/**
 * Generate a baseline manifest asynchronously by scanning both input (source)
 * and build output files, computing XXH3-128 hashes for each.
 *
 * **Input files** are discovered via YAML config interest lists:
 * - Native: expands entries from `tizen_native_project.yaml`
 * - Web: globs project dir minus `excludes` from `tizen_web_project.yaml`
 * - Dotnet: expands entries from `tizen_dotnet_project.yaml`
 *
 * **Output files** are discovered via the strategy-based output scanner:
 * - Native: parses `Debug/tpk_contents`
 * - Web: globs `Debug/projects/<projectName>/**`
 * - Dotnet: globs `bin/Debug/<TargetFramework>/tpkroot/**`
 *
 * @param {string} projectDir - Absolute path to the project directory
 * @param {object} [ignoreList] - Patterns to exclude (auto-resolved if omitted)
 * @param {number} [deployId=0] - The deploy ID to tag the manifest with (0 for initial)
 * @returns {Promise<object>} A BaselineManifest object
 */
async function generateBaselineManifestAsync(
  projectDir,
  ignoreList,
  deployId = 0,
) {
  const resolvedIgnore = ignoreList ?? getIgnoreList();
  const appType = detectAppType(projectDir);

  if (!appType) {
    return {
      deployId,
      projectDir,
      timestamp: new Date().toISOString(),
      hashAlgorithm: "xxh3-128",
      input: {},
      output: {},
    };
  }

  const inputHashes = await scanInputFilesAsync(projectDir, appType);
  const outputHashes = await scanOutputFilesAsync(
    projectDir,
    appType,
    resolvedIgnore,
  );

  return {
    deployId,
    projectDir,
    timestamp: new Date().toISOString(),
    hashAlgorithm: "xxh3-128",
    input: inputHashes,
    output: outputHashes,
  };
}

// ─── Baseline comparison ─────────────────────────────────────────────────────

/**
 * Compare the current filesystem state against a stored baseline manifest.
 *
 * For each file:
 * - Exists and hash matches → unchanged (not included in result)
 * - Exists but hash differs → `modify`
 * - In baseline but missing on disk → `delete`
 * - On disk but not in baseline → `add`
 *
 * @param {object} currentManifest - The freshly generated manifest of current state
 * @param {object} storedManifest - The previously saved baseline manifest
 * @returns {object} A comparison object with modified/added/deleted arrays and driftRatio
 */
function compareAgainstBaseline(currentManifest, storedManifest) {
  const modified = [];
  const added = [];
  const deleted = [];

  const currentFiles = currentManifest.output || {};
  const storedFiles = storedManifest.output || {};

  // Find modified and deleted files
  for (const [path, entry] of Object.entries(storedFiles)) {
    if (path in currentFiles) {
      if (currentFiles[path].hash !== entry.hash) {
        modified.push({ path, type: "modify" });
      }
    } else {
      deleted.push({ path, type: "delete" });
    }
  }

  // Find added files
  for (const path of Object.keys(currentFiles)) {
    if (!(path in storedFiles)) {
      added.push({ path, type: "add" });
    }
  }

  const baselineFileCount = Object.keys(storedFiles).length;
  const currentFileCount = Object.keys(currentFiles).length;
  const totalChanged = modified.length + added.length + deleted.length;

  // When baseline is empty but current files exist, that's 100% drift (forces full deploy).
  // When both are empty, there's truly no drift.
  const driftRatio =
    baselineFileCount > 0
      ? totalChanged / baselineFileCount
      : currentFileCount > 0
        ? 1
        : 0;

  return {
    modified,
    added,
    deleted,
    baselineFileCount,
    currentFileCount,
    driftRatio,
  };
}

/**
 * Generate a fresh baseline manifest, compare it against the stored one,
 * and return the comparison result along with the current manifest for reuse.
 *
 * **Comparison flow:**
 * 1. Detect app type → resolve interest list + ignore list
 * 2. Scan current interest-list files → compute XXH3-128 hash for each
 * 3. Compare against stored baseline manifest:
 *    - File exists and hash matches → unchanged
 *    - File exists but hash differs → `modify`
 *    - File in manifest but missing on disk → `delete`
 *    - File on disk but not in manifest → `add`
 *
 * **Manifest reuse (§2e)**: The currentManifest is returned so that calling
 * code can pass it to `syncDeployState()` instead of regenerating it. This
 * removes one full tree hash per deploy.
 *
 * @param {string} projectDir - Absolute path to the project directory
 * @param {object} storedManifest - The previously saved baseline manifest
 * @returns {Promise<object>} Object with { comparison: {...}, currentManifest: {...} }
 */
async function compareCurrentAgainstStoredAsync(projectDir, storedManifest) {
  const ignoreList = getIgnoreList();

  // Use nextDeployId from state — the current snapshot represents the state
  // that will be deployed next, not the already-deployed baseline.
  const state = loadState(projectDir);
  const nextDeployId = state?.nextDeployId ?? storedManifest.deployId + 1;

  const currentManifest = await generateBaselineManifestAsync(
    projectDir,
    ignoreList,
    nextDeployId,
  );

  // Filter stored manifest: strip entries matching current ignore list.
  // Old manifests may contain entries now on the ignore list (e.g., .tizen-rds/**).
  // Without filtering, those would appear as "deleted" and the delta would
  // delete RDS state files on the device.
  const prefixedIgnore = prefixIgnorePatterns(ignoreList.patterns);
  const isIgnored = picomatch(prefixedIgnore, { dot: true });
  const filteredOutput = {};
  for (const [path, entry] of Object.entries(storedManifest.output || {})) {
    if (!isIgnored(path)) {
      filteredOutput[path] = entry;
    }
  }
  const filteredManifest = { ...storedManifest, output: filteredOutput };

  const comparison = compareAgainstBaseline(currentManifest, filteredManifest);

  return {
    comparison,
    currentManifest,
  };
}

module.exports = {
  prefixIgnorePatterns,
  buildHashRecord,
  getIgnoreList,
  generateBaselineManifestAsync,
  compareAgainstBaseline,
  compareCurrentAgainstStoredAsync,
};
