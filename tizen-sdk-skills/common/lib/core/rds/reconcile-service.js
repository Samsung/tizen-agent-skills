// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS Reconciliation Service — determines deployment type via output comparison.
 *
 * Core responsibility:
 * - Load current baseline manifest and compare against current filesystem state
 * - Compute drift ratio (changed files / baseline file count)
 * - Determine deploy type: "rds" (delta), "fast-deploy" (no delta), or "full"
 * - Write changelist to disk for later device push
 *
 * Note: On the CLI, there is no file watcher (unlike the server). Reconcile runs
 * synchronously on every install — the changelist is filled fresh, not accumulated
 * over time.
 *
 * Reference: packages/server/src/features/rds/reconcile-service.ts
 *
 * @module core/rds/reconcile-service
 */

const { compareCurrentAgainstStoredAsync } = require("./baseline-manager");
const { loadBaselineManifest, replaceNextChanges } = require("./state-manager");
const { DRIFT_THRESHOLD } = require("./constants");

/**
 * Output files whose change cannot be applied by copying the file into the
 * app directory: the package manager reads them only at install time
 * (privileges, app-controls, app IDs, metadata). A delta that touches one of
 * these must go through a full `tz install` so pkgmgr re-registers the app.
 */
const PACKAGE_MANAGER_FILES = new Set(["tizen-manifest.xml", "config.xml"]);

/**
 * @param {Array<{path: string, type: string}>} deltaEntries
 * @returns {boolean} true when any entry is a package-manager file
 */
function touchesPackageManagerFile(deltaEntries) {
  return deltaEntries.some((entry) => {
    const basename = entry.path.slice(entry.path.lastIndexOf("/") + 1);
    return PACKAGE_MANAGER_FILES.has(basename);
  });
}

/**
 * Determine the next deploy type from a pre-computed drift ratio.
 *
 * - ratio === 0 → `'fast-deploy'` (just launch, no file push)
 * - ratio > DRIFT_THRESHOLD → `'full'` (full install)
 * - otherwise → `'rds'` (delta deploy + launch)
 *
 * Not exported — internal helper for {@link determineRdsStatusByRatio}, matching
 * the reference's `determineNextDeployTypeByRatio()` (also module-private there).
 *
 * @param {number} driftRatio - Fraction of files that have drifted (0 = no changes)
 * @returns {'rds' | 'fast-deploy' | 'full'} deploy type
 */
function determineNextDeployTypeByRatio(driftRatio) {
  if (driftRatio === 0) return "fast-deploy";
  return driftRatio > DRIFT_THRESHOLD ? "full" : "rds";
}

/**
 * Determine the RDS status from a pre-computed drift ratio.
 *
 * Same signature as the server's `determineRdsStatusByRatio(buildNeeded, driftRatio)`
 * (reconcile-service.ts:78) — preserved so the CLI and extension logic stay provably
 * identical. The CLI has no input-change tracker (Part 4: "no isBuildNeeded(), no
 * trackers, no flags"), so every call site hardwires `buildNeeded` to `false`; the
 * `'build-needed'` branch below exists only for signature parity and never triggers
 * on the CLI path.
 *
 * @param {boolean} buildNeeded - Whether source (input) files have changed. Always
 *   `false` on the CLI — see docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 2d.
 * @param {number} driftRatio - Fraction of files that have drifted (0 = no changes)
 * @returns {'rds' | 'fast-deploy' | 'full' | 'build-needed'} RDS status for the next deploy
 */
function determineRdsStatusByRatio(buildNeeded, driftRatio) {
  if (buildNeeded) return "build-needed";
  return determineNextDeployTypeByRatio(driftRatio);
}

/**
 * Reconcile the project by comparing current build output against the stored baseline.
 *
 * **Flow:**
 * 1. Load RDS state and baseline manifest from disk
 * 2. If no baseline exists → return `{rdsStatus: 'full', driftRatio: 1, currentManifest: null}` (first deploy)
 * 3. Scan current output files and compare against baseline
 * 4. Compute drift ratio and delta entries
 * 5. Determine deploy type (full/rds/fast-deploy); a delta touching
 *    `tizen-manifest.xml` / `config.xml` is always `full` because the package
 *    manager only reads those at install time
 * 6. Replace the changelist's `next` group with the fresh delta (for later push
 *    to device) — replaced, not appended, so an aborted previous attempt can't
 *    leave stale entries behind
 * 7. Return `{ rdsStatus, driftRatio, currentManifest }`
 *
 * **Note on currentManifest reuse (§2e):**
 * The freshly-generated current manifest is returned so that `syncDeployState()`
 * can reuse it instead of regenerating — this saves one full tree hash per deploy.
 *
 * @param {string} projectDir - Absolute path to project directory
 * @returns {Promise<object>} Object with:
 *   - rdsStatus: 'full' | 'rds' | 'fast-deploy'
 *   - driftRatio: number [0..1]
 *   - currentManifest: the freshly-generated manifest for reuse
 *
 * @throws {Error} If manifest scanning fails unrecoverably
 */
async function reconcileDetailedAsync(projectDir) {
  // Load existing baseline manifest
  const baseline = loadBaselineManifest(projectDir);

  // First deploy: no baseline exists yet
  if (!baseline) {
    return {
      rdsStatus: "full",
      driftRatio: 1,
      currentManifest: null,
    };
  }

  // Compare current output against stored baseline
  const { comparison, currentManifest } =
    await compareCurrentAgainstStoredAsync(projectDir, baseline);

  const { driftRatio, modified, added, deleted } = comparison;

  // Build delta entries (modified + added + deleted)
  const deltaEntries = [...modified, ...added, ...deleted];

  // Determine deploy type — buildNeeded hardwired to false (The CLI
  // has no input-change tracker; sequencing build-before-install is the agent's job)
  let rdsStatus = determineRdsStatusByRatio(false, driftRatio);
  if (rdsStatus !== "full" && touchesPackageManagerFile(deltaEntries)) {
    console.error(
      "[RDS] Delta touches a package-manager file (tizen-manifest.xml / config.xml) — full install required",
    );
    rdsStatus = "full";
  }

  // Replace the pending delta for later push to device. The CLI recomputes the
  // complete baseline→current delta on every reconcile, so whatever a previous
  // (possibly aborted) attempt left in `next` is stale and must not be replayed.
  replaceNextChanges(projectDir, deltaEntries);

  return {
    rdsStatus,
    driftRatio,
    currentManifest,
  };
}

module.exports = {
  determineRdsStatusByRatio,
  touchesPackageManagerFile,
  reconcileDetailedAsync,
};
