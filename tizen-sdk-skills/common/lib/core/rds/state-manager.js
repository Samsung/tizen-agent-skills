// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS State Manager — Core state management for Rapid Development Support.
 *
 * Manages per-project RDS state persisted to disk under `<projectDir>/.tizen-rds/`.
 * All state is kept in-memory and explicitly saved/loaded via JSON files.
 *
 * Directory structure on disk (per project):
 * ```
 * <projectDir>/
 *   .tizen-rds/
 *     deploy-state.json
 *     changelist.json
 *     baseline-manifest.json
 *     build-manifest.json
 * ```
 *
 * @module core/rds/state-manager
 */

const {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} = require("fs");
const { join } = require("path");

const { computeDelta, composeChanges } = require("./forward-scan-composer");

// ─── Constants ───────────────────────────────────────────────────────────────────

const RDS_DIR = ".tizen-rds";
const DEPLOY_STATE_FILE = "deploy-state.json";
const CHANGELIST_FILE = "changelist.json";
const BASELINE_MANIFEST_FILE = "baseline-manifest.json";
const BUILD_MANIFEST_FILE = "build-manifest.json";

// ─── In-memory cache ──────────────────────────────────────────────────────────────

const stateCache = new Map();
const changelistCache = new Map();
const baselineCache = new Map();
const buildManifestCache = new Map();

// ─── Path helpers ─────────────────────────────────────────────────────────────────

function rdsDir(projectDir) {
  return join(projectDir, RDS_DIR);
}

function deployStatePath(projectDir) {
  return join(rdsDir(projectDir), DEPLOY_STATE_FILE);
}

function changelistPath(projectDir) {
  return join(rdsDir(projectDir), CHANGELIST_FILE);
}

function getBaselineManifestPath(projectDir) {
  return join(rdsDir(projectDir), BASELINE_MANIFEST_FILE);
}

function buildManifestPath(projectDir) {
  return join(rdsDir(projectDir), BUILD_MANIFEST_FILE);
}

// ─── JSON read/write helpers ──────────────────────────────────────────────────────

function readJsonFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[RDS] Failed to read/parse JSON file: ${filePath} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Atomic JSON write: serialize to a sibling temp file, then rename over the
 * target. A crash mid-write therefore never leaves a truncated state file —
 * which matters here because `readJsonFile()` turns unparsable JSON into
 * `null`, and a `null` deploy-state would make `getOrCreateState()` re-init
 * the project and wipe every other device's changelist groups.
 */
function writeJsonFile(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // best effort
    }
    throw err;
  }
}

// ─── Deploy State ─────────────────────────────────────────────────────────────────

function loadState(projectDir) {
  const cached = stateCache.get(projectDir);
  if (cached) return cached;

  const state = readJsonFile(deployStatePath(projectDir));
  if (state) {
    stateCache.set(projectDir, state);
  }
  return state;
}

function saveState(projectDir, state) {
  const dir = rdsDir(projectDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeJsonFile(deployStatePath(projectDir), state);
  stateCache.set(projectDir, state);
}

// ─── Changelist ───────────────────────────────────────────────────────────────────

function loadChangelist(projectDir) {
  const cached = changelistCache.get(projectDir);
  if (cached) return cached;

  const changelist = readJsonFile(changelistPath(projectDir));
  if (changelist) {
    changelistCache.set(projectDir, changelist);
  }
  return changelist;
}

function saveChangelist(projectDir, changelist) {
  const dir = rdsDir(projectDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeJsonFile(changelistPath(projectDir), changelist);
  changelistCache.set(projectDir, changelist);
}

// ─── Baseline Manifest ───────────────────────────────────────────────────────────

function loadBaselineManifest(projectDir) {
  const cached = baselineCache.get(projectDir);
  if (cached) return cached;

  const manifest = readJsonFile(getBaselineManifestPath(projectDir));
  if (manifest) {
    baselineCache.set(projectDir, manifest);
  }
  return manifest;
}

function saveBaselineManifest(projectDir, manifest) {
  const dir = rdsDir(projectDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeJsonFile(getBaselineManifestPath(projectDir), manifest);
  baselineCache.set(projectDir, manifest);
}

// ─── Build Manifest ──────────────────────────────────────────────────────────────

function loadBuildManifest(projectDir) {
  const cached = buildManifestCache.get(projectDir);
  if (cached) return cached;

  const manifest = readJsonFile(buildManifestPath(projectDir));
  if (manifest) {
    buildManifestCache.set(projectDir, manifest);
  }
  return manifest;
}

function saveBuildManifest(projectDir, manifest) {
  const dir = rdsDir(projectDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeJsonFile(buildManifestPath(projectDir), manifest);
  buildManifestCache.set(projectDir, manifest);
}

function clearBuildManifest(projectDir) {
  buildManifestCache.delete(projectDir);
  const filePath = buildManifestPath(projectDir);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // Ignore — file may already be gone
    }
  }
}

// ─── Change operations ───────────────────────────────────────────────────────────

function addChanges(projectDir, changes) {
  let changelist = loadChangelist(projectDir);

  if (!changelist) {
    changelist = {
      projectDir,
      deploys: {},
    };
  }

  const existing = changelist.deploys["next"] ?? [];
  changelist.deploys["next"] = composeChanges([...existing, ...changes]);

  saveChangelist(projectDir, changelist);
}

/**
 * Replace the pending `next` group outright instead of composing onto it.
 *
 * The CLI has no file watcher: every reconcile recomputes the *complete*
 * baseline→current delta, so the previous `next` contents (possibly left over
 * from an aborted deploy) are stale by definition and must not be replayed.
 * An empty `changes` array removes the `next` group.
 *
 * @param {string} projectDir
 * @param {Array<{path: string, type: string}>} changes
 */
function replaceNextChanges(projectDir, changes) {
  let changelist = loadChangelist(projectDir);

  if (!changelist) {
    if (changes.length === 0) return;
    changelist = {
      projectDir,
      deploys: {},
    };
  }

  if (changes.length === 0) {
    delete changelist.deploys["next"];
  } else {
    changelist.deploys["next"] = composeChanges([...changes]);
  }

  saveChangelist(projectDir, changelist);
}

function getDeltaForDevice(projectDir, deviceId) {
  const state = loadState(projectDir);
  if (!state || !state.devices[deviceId]) {
    return [];
  }

  const changelist = loadChangelist(projectDir);
  if (!changelist) {
    return [];
  }

  const lastDeployId = state.devices[deviceId].lastDeployId;
  return computeDelta(changelist, lastDeployId);
}

function promoteNextGroup(projectDir, newDeployId) {
  const changelist = loadChangelist(projectDir);
  if (!changelist) return;

  const nextChanges = changelist.deploys["next"];
  if (!nextChanges || nextChanges.length === 0) return;

  changelist.deploys[String(newDeployId)] = nextChanges;
  delete changelist.deploys["next"];

  saveChangelist(projectDir, changelist);
}

function pruneOldDeploys(projectDir) {
  const state = loadState(projectDir);
  const changelist = loadChangelist(projectDir);
  if (!state || !changelist) return;

  const deviceIds = Object.keys(state.devices);
  if (deviceIds.length === 0) return;

  const minDeployId = deviceIds.reduce(
    (min, id) => Math.min(min, state.devices[id].lastDeployId),
    Infinity,
  );

  let modified = false;
  for (const key of Object.keys(changelist.deploys)) {
    if (key === "next") continue;
    const id = Number(key);
    if (!isNaN(id) && id < minDeployId) {
      delete changelist.deploys[key];
      modified = true;
    }
  }

  if (modified) {
    saveChangelist(projectDir, changelist);
  }
}

// ─── Device operations ───────────────────────────────────────────────────────────

// ─── Full reset ───────────────────────────────────────────────────────────────────

/**
 * Remove every host-side RDS artifact for a project (the whole `.tizen-rds/`
 * directory) and drop the in-memory caches.
 *
 * @param {string} projectDir
 * @returns {boolean} true when nothing is left on disk; false when the
 *   directory (or part of it) survived — e.g. a locked file on Windows —
 *   so callers can report the failure instead of claiming a clean reset
 */
function resetAllRdsState(projectDir) {
  stateCache.delete(projectDir);
  changelistCache.delete(projectDir);
  baselineCache.delete(projectDir);
  buildManifestCache.delete(projectDir);

  const dir = rdsDir(projectDir);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Fall through — the existence check below decides the outcome
  }
  return !existsSync(dir);
}

// ─── Initialization ──────────────────────────────────────────────────────────────

function initializeRdsState(projectDir) {
  const existing = loadState(projectDir);
  if (existing) {
    return existing;
  }

  const dir = rdsDir(projectDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const state = {
    projectDir,
    nextDeployId: 1,
    baselineManifestPath: getBaselineManifestPath(projectDir),
    devices: {},
  };
  saveState(projectDir, state);

  const changelist = {
    projectDir,
    deploys: {},
  };
  saveChangelist(projectDir, changelist);

  return state;
}

function getOrCreateState(projectDir) {
  const existing = loadState(projectDir);
  if (existing) {
    return existing;
  }
  return initializeRdsState(projectDir);
}

// ─── Cache management ─────────────────────────────────────────────────────────────

function clearCaches() {
  stateCache.clear();
  changelistCache.clear();
  baselineCache.clear();
  buildManifestCache.clear();
}

// ─── State file existence check ───────────────────────────────────────────────────

function rdsStateExists(projectDir) {
  return existsSync(deployStatePath(projectDir));
}

// ─── Exports ──────────────────────────────────────────────────────────────────────

module.exports = {
  // State file paths (public for testing)
  getBaselineManifestPath,

  // Deploy state
  loadState,
  saveState,

  // Changelist
  loadChangelist,
  saveChangelist,

  // Baseline manifest
  loadBaselineManifest,
  saveBaselineManifest,

  // Build manifest — written by buildProject() for the VS Code extension's
  // cross-process isBuildNeeded() (docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 1/3);
  // the CLI itself only writes and clears it, `loadBuildManifest` exists for
  // tests and tooling.
  loadBuildManifest,
  saveBuildManifest,
  clearBuildManifest,

  // Change operations
  addChanges,
  replaceNextChanges,
  getDeltaForDevice,
  promoteNextGroup,
  pruneOldDeploys,

  // Full reset
  resetAllRdsState,

  // Initialization
  initializeRdsState,
  getOrCreateState,

  // Cache management
  clearCaches,

  // Utility
  rdsStateExists,
};
