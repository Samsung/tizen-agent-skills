// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS Deploy Service — orchestrates RDS delta deployment to devices.
 *
 * Implements the full RDS deploy flow (CLI variant):
 * 1. Check RDS state + device state exist
 * 2. Validate device baseline (read marker via SDB, reject if device is ahead)
 * 3. Reconcile output against the stored baseline (writes drift into changelist.json —
 *    there is no file watcher on the CLI, so this module must drive reconcile itself)
 * 4. Bail to full install if reconcile says `full` is required
 * 5. Compute the device's delta via forward-scan composition, resolve device-relative paths
 * 6. No delta → fast-deploy (launch only); delta → push files, then launch
 * 7. Launch only if the caller asked for it — state is synced either way
 * 8. Sync deploy state: baseline manifest, device marker + snapshot, changelist promotion,
 *    server state commit, build-manifest cleanup
 *
 * Reference: packages/server/src/features/rds/rds-deploy-service.ts
 *
 * CLI-specific divergences from the reference (see docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 2d/2e/3):
 * - `tryRdsDeploy()` takes a third `runAfterInstall` argument and drives
 *   `reconcileDetailedAsync()` itself (the reference relies on the VS Code file watcher
 *   to have already populated the changelist via `POST /rds/changes`).
 * - `syncDeployState()` accepts an optional `currentManifest` (threaded from reconcile)
 *   to skip regenerating it — saves one full tree hash per deploy.
 * - `syncDeployState()` calls `clearBuildManifest()` directly instead of the reference's
 *   `clearInputChanges()` → `clearBuildManifest()` indirection (no in-memory input
 *   tracker exists on the CLI).
 * - No `rdsInfoPathCache` — dropped module-wide (see app-install-path.js); every call
 *   re-queries the device. `updateRdsState()` therefore has nothing to invalidate.
 * - Benchmark timing instrumentation via `TIZEN_BENCHMARK=1` — measures reconcile, delta
 *   computation, push, launch, and state sync phases; zero overhead when disabled.
 *
 * @module core/rds/deploy-service
 */

const {
  existsSync,
  writeFileSync,
  rmSync,
  linkSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
} = require("fs");
const { dirname, join } = require("path");
const { tmpdir } = require("os");

const { detectAppType } = require("./app-type-detector");
const { assertDevicePathSafe, quoteDeviceArg } = require("./device-shell");
const {
  generateBaselineManifestAsync,
  getIgnoreList,
} = require("./baseline-manager");
const {
  loadState,
  saveState,
  saveBaselineManifest,
  getBaselineManifestPath,
  getDeltaForDevice,
  promoteNextGroup,
  pruneOldDeploys,
  getOrCreateState,
  clearBuildManifest,
} = require("./state-manager");
const { getRdsInfoPath } = require("./app-install-path");
const { resolveDevicePaths } = require("./device-path-resolver");
const { reconcileDetailedAsync } = require("./reconcile-service");
const { runNoChain } = require("./launch");
const { execute, pushDirectory, root } = require("../sdb-helper");

// ─── Constants ───────────────────────────────────────────────────────────────────

/** Name of the deploy marker file on the device */
const DEPLOY_MARKER_FILE = ".rds_deploy_marker";

/** Name of the device snapshot file (baseline manifest on device) */
const DEVICE_SNAPSHOT_FILE = ".rds_snapshot.json";

/** Chunk size for batched `rm -f` / `chmod` — keeps the shell command line under typical limits */
const MAX_CMD_LEN = 4000;

// ─── Benchmark Timing Instrumentation ──────────────────────────────────────────────

/**
 * Whether benchmark timing mode is enabled.
 *
 * Zero overhead when disabled — a single env check, no allocations.
 *
 * @returns {boolean}
 */
function isBenchmarkMode() {
  return process.env.TIZEN_BENCHMARK === "1";
}

/**
 * Lightweight timing collector for RDS deploy phases.
 *
 * Uses `performance.now()` for sub-millisecond precision. Only instantiated
 * when `isBenchmarkMode()` returns true.
 */
class RdsDeployTimings {
  constructor() {
    this.startTime = performance.now();
    /** @type {Record<string, number>} */
    this.phases = {};
    /** @type {Record<string, number>} */
    this.durations = {};
  }

  /**
   * Mark the start of a phase.
   * @param {string} phaseName
   */
  startPhase(phaseName) {
    if (!isBenchmarkMode()) return;
    this.phases[phaseName] = performance.now();
  }

  /**
   * Mark the end of a phase and record its duration.
   * @param {string} phaseName
   */
  endPhase(phaseName) {
    if (!isBenchmarkMode()) return;
    const start = this.phases[phaseName];
    if (start !== undefined) {
      this.durations[phaseName] = performance.now() - start;
    }
  }

  /**
   * Get the total elapsed time since construction.
   * @returns {number} milliseconds
   */
  total() {
    return performance.now() - this.startTime;
  }

  /**
   * Get a plain object with all phase durations and total.
   * @returns {{total: number, phases: Record<string, number>}}
   */
  toJSON() {
    return {
      total: Math.round(this.total() * 100) / 100,
      phases: Object.fromEntries(
        Object.entries(this.durations).map(([k, v]) => [
          k,
          Math.round(v * 100) / 100,
        ]),
      ),
    };
  }

  /**
   * Print timings to stderr in a readable format.
   * @param {string} prefix - label for the log output
   */
  print(prefix = "[RDS Benchmark]") {
    if (!isBenchmarkMode()) return;
    const json = this.toJSON();
    console.error(`${prefix} Total: ${json.total.toFixed(2)}ms`);
    for (const [phase, duration] of Object.entries(json.phases)) {
      console.error(`${prefix}   ${phase}: ${duration.toFixed(2)}ms`);
    }
  }
}

/**
 * Split already-quoted device arguments into groups whose joined length stays
 * under {@link MAX_CMD_LEN}, so one `sdb shell <cmd> <args…>` never exceeds
 * the device shell's command-line limit.
 *
 * @param {string[]} args
 * @returns {string[][]} at least one (possibly empty) chunk
 */
function chunkForCommandLine(args) {
  const chunks = [[]];
  let currentLen = 0;
  for (const arg of args) {
    if (currentLen + arg.length + 1 > MAX_CMD_LEN && chunks.at(-1).length) {
      chunks.push([]);
      currentLen = 0;
    }
    chunks[chunks.length - 1].push(arg);
    currentLen += arg.length + 1;
  }
  return chunks;
}

// ─── Device marker operations ──────────────────────────────────────────────────────

/**
 * Read the deploy marker from a device via SDB.
 *
 * The marker is a JSON file at `<rdsInfoPath>/.rds_deploy_marker`. `sdb shell`
 * often exits 0 even when the remote command failed, so a missing file is
 * detected two ways: a thrown error (device unreachable, sdb failure) or a
 * `cat: ...` prefix surviving in stdout.
 *
 * @param {string} deviceSerial - device serial number
 * @param {string} rdsInfoPath - RDS info path on the device
 * @param {{sdbPath?: string, timeoutMs?: number}} [opts] - forwarded to sdb-helper.js
 * @returns {Promise<{deployId: number, deployType: string, timestamp: string} | null>}
 *   the parsed marker, or null if not found or invalid
 */
async function readDeviceMarker(deviceSerial, rdsInfoPath, opts = {}) {
  const markerPath = `${rdsInfoPath}/${DEPLOY_MARKER_FILE}`;

  try {
    assertDevicePathSafe(markerPath, "marker path");
    const output = await execute(
      deviceSerial,
      ["cat", quoteDeviceArg(markerPath)],
      opts,
    );
    if (!output || output.trim().startsWith("cat:")) {
      return null;
    }
    return JSON.parse(output.trim());
  } catch {
    return null;
  }
}

// ─── Delta file push ──────────────────────────────────────────────────────────────

/**
 * Push delta files to the device via a single batched SDB invocation.
 *
 * Instead of spawning one `sdb push` per file (N process spawns), this:
 * 1. Stages all add/modify files into a temp directory mirroring the
 *    device-relative layout (`entry.devicePath`), using hard links (fast,
 *    same-filesystem) with a copy fallback.
 * 2. Pushes the entire staging directory in a single `sdb push` call.
 * 3. Batches all deletes into one `sdb shell rm -f` call (chunked if the
 *    command line would be too long).
 *
 * `root on`/`root off` wrap the batch. `root off` runs in a `finally` block
 * so the device is always un-rooted, even on error.
 *
 * Every device path is validated against the device-shell allowlist *before*
 * `root on` (so nothing is attempted with an unsafe entry) and single-quoted
 * when spliced into `rm -f` — `sdb shell` re-parses its arguments through the
 * device's `/bin/sh`, so an unquoted `my icon.png` would become two words.
 *
 * @param {string} deviceSerial - device serial number
 * @param {string} projectDir - absolute path to the project directory
 * @param {Array<{path: string, type: string, devicePath?: string}>} deltaEntries -
 *   delta entries with `devicePath` already resolved (see device-path-resolver.js)
 * @param {string} rdsInfoPath - RDS info path on the device (push destination base)
 * @param {{sdbPath?: string, timeoutMs?: number}} [opts] - forwarded to sdb-helper.js
 * @throws {Error} if any entry is missing `devicePath`, a device path contains
 *   characters unsafe for the device shell, or the underlying sdb operations fail
 */
async function pushDeltaFiles(
  deviceSerial,
  projectDir,
  deltaEntries,
  rdsInfoPath,
  opts = {},
) {
  const pushEntries = deltaEntries.filter((e) => e.type !== "delete");
  const deleteEntries = deltaEntries.filter((e) => e.type === "delete");

  assertDevicePathSafe(rdsInfoPath, "RDS info path");
  for (const entry of deltaEntries) {
    if (!entry.devicePath) {
      throw new Error(
        `entry "${entry.path}" has no devicePath — call resolveDevicePaths() first`,
      );
    }
    assertDevicePathSafe(entry.devicePath, `device path for "${entry.path}"`);
  }

  await root(deviceSerial, "on", opts);

  try {
    // ── Batch deletes into one shell call (chunked if command line is long) ──
    if (deleteEntries.length > 0) {
      const deletePaths = deleteEntries.map((e) =>
        quoteDeviceArg(`${rdsInfoPath}/${e.devicePath}`),
      );

      for (const chunk of chunkForCommandLine(deletePaths)) {
        await execute(deviceSerial, ["rm", "-f", ...chunk], opts);
      }
    }

    // ── Stage + single push for file additions/modifications ──
    if (pushEntries.length > 0) {
      // mkdtempSync, not a name derived from the serial: TCP-connected devices
      // have serials like `192.168.0.10:26101`, and `:` is not a legal path
      // character on Windows.
      const stagingDir = mkdtempSync(join(tmpdir(), "rds_push_"));

      try {
        for (const entry of pushEntries) {
          const localPath = join(projectDir, entry.path);
          const stagingPath = join(stagingDir, entry.devicePath);
          const stagingParent = dirname(stagingPath);

          mkdirSync(stagingParent, { recursive: true });

          try {
            linkSync(localPath, stagingPath);
          } catch {
            copyFileSync(localPath, stagingPath);
          }
        }

        await pushDirectory(
          deviceSerial,
          stagingDir,
          rdsInfoPath,
          pushEntries.length,
          opts,
        );

        // `sdb push` recreates files with the host's mode bits, which from a
        // Windows/NTFS host means 0777 — verified on a Tizen 11 emulator:
        // pushed files landed as `-rwxr-xrwx root root` next to the
        // installer's `-rw-r--r--`. The Smack label is inherited from the
        // directory (`User::Pkg::<pkgid>::RO`), so the app reads them fine;
        // only the world-writable bit needs stripping. Still rooted here.
        const pushedPaths = pushEntries.map((e) =>
          quoteDeviceArg(`${rdsInfoPath}/${e.devicePath}`),
        );
        for (const chunk of chunkForCommandLine(pushedPaths)) {
          await execute(deviceSerial, ["chmod", "go-w", ...chunk], opts);
        }
      } finally {
        rmSync(stagingDir, { recursive: true, force: true });
      }
    }
  } finally {
    try {
      await root(deviceSerial, "off", opts);
    } catch (rootOffErr) {
      console.error("[RDS] root off failed:", rootOffErr.message);
    }
  }
}

// ─── Combined marker + snapshot push ─────────────────────────────────────────────

/**
 * Push the deploy marker and baseline snapshot to the device in a single
 * `sdb push` invocation.
 *
 * Both files land in `<rdsInfoPath>/`. The snapshot is the baseline manifest
 * file on disk, which must already have been saved by the caller (i.e., this
 * runs after `saveBaselineManifest`).
 *
 * @param {string} deviceSerial - device serial number
 * @param {string} rdsInfoPath - RDS info path on the device (push destination)
 * @param {number} deployId - the deploy ID to record in the marker
 * @param {string} deployType - the deploy type to record in the marker
 * @param {string} timestamp - the deploy success timestamp (ISO 8601)
 * @param {string} projectDir - absolute path to the project directory (for baseline manifest path)
 * @param {{sdbPath?: string, timeoutMs?: number}} [opts] - forwarded to sdb-helper.js
 */
async function pushDeviceMarkerAndSnapshot(
  deviceSerial,
  rdsInfoPath,
  deployId,
  deployType,
  timestamp,
  projectDir,
  opts = {},
) {
  assertDevicePathSafe(rdsInfoPath, "RDS info path");
  // See pushDeltaFiles(): the serial must not end up in the directory name.
  const stagingDir = mkdtempSync(join(tmpdir(), "rds_sync_"));
  try {
    const marker = { deployId, deployType, timestamp };
    writeFileSync(
      join(stagingDir, DEPLOY_MARKER_FILE),
      JSON.stringify(marker, null, 2),
      "utf-8",
    );

    const baselinePath = getBaselineManifestPath(projectDir);
    const baselineExists = existsSync(baselinePath);
    if (baselineExists) {
      try {
        linkSync(baselinePath, join(stagingDir, DEVICE_SNAPSHOT_FILE));
      } catch {
        copyFileSync(baselinePath, join(stagingDir, DEVICE_SNAPSHOT_FILE));
      }
    } else {
      console.warn(
        `[RDS] pushDeviceMarkerAndSnapshot: baseline manifest not found at ${baselinePath}, pushing marker only`,
      );
    }

    const expectedCount = baselineExists ? 2 : 1;
    await pushDirectory(
      deviceSerial,
      stagingDir,
      rdsInfoPath,
      expectedCount,
      opts,
    );
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

// ─── Deploy state synchronization ─────────────────────────────────────────────────

/**
 * Synchronize deploy state across CLI state, baseline manifest, and device.
 *
 * Ordering ensures correctness:
 * - Generate (or reuse) and save the baseline manifest — must complete before push
 * - Push marker + snapshot in a single SDB invocation
 * - Commit state (device record + nextDeployId) *before* promoting the
 *   changelist group: if the process dies in between, the pending `next`
 *   group is simply promoted under the following deployId and re-pushed —
 *   harmless. The reverse order would leave nextDeployId stale so the next
 *   deploy reused the same ID and overwrote the just-promoted group.
 * - Promote changelist groups, clear the build manifest
 *
 * @param {object} params
 * @param {string} params.projectDir
 * @param {string} params.deviceSerial
 * @param {object} params.state - the project's DeployState (mutated and saved)
 * @param {number} params.deployId
 * @param {string} params.deployType
 * @param {string} params.appType
 * @param {string} params.deployTimestamp - ISO 8601, captured at the moment success was confirmed
 * @param {object} [params.currentManifest] - manifest from `reconcileDetailedAsync()` (§2e) —
 *   reused instead of regenerating when present
 * @param {{sdbPath?: string, tzPath?: string, timeoutMs?: number}} [params.opts]
 */
async function syncDeployState(params) {
  const {
    projectDir,
    deviceSerial,
    state,
    deployId,
    deployType,
    appType,
    deployTimestamp,
    currentManifest,
    opts = {},
  } = params;

  const rdsInfoPath = await getRdsInfoPath(
    projectDir,
    deviceSerial,
    appType,
    opts,
  );

  const manifest =
    currentManifest ??
    (await generateBaselineManifestAsync(
      projectDir,
      getIgnoreList(),
      deployId,
    ));
  saveBaselineManifest(projectDir, manifest);

  if (rdsInfoPath) {
    await pushDeviceMarkerAndSnapshot(
      deviceSerial,
      rdsInfoPath,
      deployId,
      deployType,
      deployTimestamp,
      projectDir,
      opts,
    );
  }

  state.devices[deviceSerial] = {
    lastDeployId: deployId,
    lastDeployTimestamp: deployTimestamp,
    deployType,
    appInstalled: true,
  };
  state.nextDeployId = deployId + 1;
  saveState(projectDir, state);

  promoteNextGroup(projectDir, deployId);

  // No in-memory input tracker on the CLI (Part 4) — clear the build manifest
  // directly instead of the reference's clearInputChanges() → clearBuildManifest()
  // indirection (Part 3).
  clearBuildManifest(projectDir);
  pruneOldDeploys(projectDir);

  // stderr, never stdout: the CLI runner prints the JSON envelope on stdout.
  console.error(
    `[RDS] Deploy state synchronized (deployId=${deployId}, type=${deployType}, device=${deviceSerial})`,
  );
}

// ─── Main RDS deploy flow ─────────────────────────────────────────────────────────

/**
 * Attempt an RDS delta deploy.
 *
 * Does **not** throw on RDS failure — returns a result indicating the reason
 * so the caller can fall back to a full install.
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {string} deviceSerial - device serial number
 * @param {boolean} runAfterInstall - whether to launch the app after deploying.
 *   When `false`, `runNoChain()` is skipped but `syncDeployState()` still runs —
 *   the device's files match the new baseline regardless of whether the app
 *   was relaunched (Part 2d).
 * @param {{sdbPath?: string, tzPath?: string, timeoutMs?: number}} [opts]
 * @returns {Promise<{deployed: boolean, type?: 'fast-deploy'|'rds', reason?: string}>}
 */
async function tryRdsDeploy(
  projectDir,
  deviceSerial,
  runAfterInstall,
  opts = {},
) {
  try {
    return await tryRdsDeployInternal(
      projectDir,
      deviceSerial,
      runAfterInstall,
      opts,
    );
  } catch (err) {
    console.error(`[RDS] Unexpected error during RDS deploy: ${err.message}`);
    return { deployed: false, reason: `rds-error: ${err.message}` };
  }
}

/**
 * Internal implementation of tryRdsDeploy, separated so the outer wrapper can
 * catch all unexpected errors (including a thrown `resolveDevicePaths()`).
 */
async function tryRdsDeployInternal(
  projectDir,
  deviceSerial,
  runAfterInstall,
  opts,
) {
  // All progress logging goes to stderr: the CLI runner owns stdout for the
  // JSON envelope, and a stray line in front of it breaks every consumer.
  const timings = isBenchmarkMode() ? new RdsDeployTimings() : null;
  const state = loadState(projectDir);
  if (!state) {
    console.error(
      "[RDS] No RDS state for project — first deploy or state cleared",
    );
    return { deployed: false, reason: "no-state" };
  }

  const deviceState = state.devices[deviceSerial];
  if (!deviceState) {
    console.error(
      `[RDS] No device state for ${deviceSerial} — device not yet deployed via RDS`,
    );
    return { deployed: false, reason: "no-device-state" };
  }

  const appType = detectAppType(projectDir);
  if (!appType) {
    return { deployed: false, reason: "no-app-type" };
  }

  timings?.startPhase("getRdsInfoPath");
  const rdsInfoPath = await getRdsInfoPath(
    projectDir,
    deviceSerial,
    appType,
    opts,
  );
  timings?.endPhase("getRdsInfoPath");
  if (!rdsInfoPath) {
    return { deployed: false, reason: "no-install-path" };
  }

  timings?.startPhase("readDeviceMarker");
  const marker = await readDeviceMarker(deviceSerial, rdsInfoPath, opts);
  timings?.endPhase("readDeviceMarker");
  if (!marker) {
    console.error(
      "[RDS] No deploy marker on device — app not installed or marker removed",
    );
    return { deployed: false, reason: "marker-missing" };
  }
  // The device must be exactly where host state says it is. Ahead means the
  // host state was reset/replaced; behind means the device was restored
  // (emulator snapshot, shared serial, re-flash) to an older deploy — either
  // way a delta computed from `lastDeployId` would skip files the device never
  // received, so fall back to a full install and let updateRdsState re-seed.
  if (marker.deployId > deviceState.lastDeployId) {
    console.warn(
      `[RDS] Device marker (deployId=${marker.deployId}) is ahead of server state ` +
        `(lastDeployId=${deviceState.lastDeployId}) — state mismatch`,
    );
    return { deployed: false, reason: "marker-ahead" };
  }
  if (marker.deployId < deviceState.lastDeployId) {
    console.warn(
      `[RDS] Device marker (deployId=${marker.deployId}) is behind server state ` +
        `(lastDeployId=${deviceState.lastDeployId}) — device was restored or replaced`,
    );
    return { deployed: false, reason: "marker-behind" };
  }

  // CLI-specific: there is no file watcher populating the changelist, so drive
  // reconcile ourselves (Part 2d). Bail to full install if drift is too high or
  // no baseline exists yet.
  timings?.startPhase("reconcile");
  const reconcileResult = await reconcileDetailedAsync(projectDir);
  timings?.endPhase("reconcile");
  if (reconcileResult.rdsStatus === "full") {
    return { deployed: false, reason: "full-required" };
  }

  timings?.startPhase("getDelta");
  const deltaEntries = getDeltaForDevice(projectDir, deviceSerial);
  timings?.endPhase("getDelta");
  timings?.startPhase("resolveDevicePaths");
  resolveDevicePaths(deltaEntries, projectDir, appType);
  timings?.endPhase("resolveDevicePaths");

  if (deltaEntries.length === 0) {
    console.error("[RDS] No pending changes — fast-deploy (launch only)");
    if (runAfterInstall) {
      timings?.startPhase("launch");
      const launchResult = await runNoChain(projectDir, deviceSerial, opts);
      timings?.endPhase("launch");
      if (launchResult.status !== "success") {
        console.error(
          `[RDS] Fast-deploy launch failed: ${launchResult.output}`,
        );
        return {
          deployed: false,
          reason: `launch-failed: ${launchResult.output}`,
        };
      }
    }

    const deployTimestamp = new Date().toISOString();
    timings?.startPhase("syncState");
    await syncDeployState({
      projectDir,
      deviceSerial,
      state,
      deployId: state.nextDeployId,
      deployType: "fast-deploy",
      appType,
      deployTimestamp,
      currentManifest: reconcileResult.currentManifest,
      opts,
    });
    timings?.endPhase("syncState");

    const result = { deployed: true, type: "fast-deploy" };
    if (timings) {
      result.rdsTimings = timings.toJSON();
      timings.print("[RDS Benchmark] fast-deploy");
    }
    return result;
  }

  console.error(`[RDS] ${deltaEntries.length} delta file(s) to push to device`);

  timings?.startPhase("pushDelta");
  await pushDeltaFiles(
    deviceSerial,
    projectDir,
    deltaEntries,
    rdsInfoPath,
    opts,
  );
  timings?.endPhase("pushDelta");

  if (runAfterInstall) {
    timings?.startPhase("launch");
    const launchResult = await runNoChain(projectDir, deviceSerial, opts);
    timings?.endPhase("launch");
    if (launchResult.status !== "success") {
      console.error(
        `[RDS] RDS delta deploy launch failed: ${launchResult.output}`,
      );
      return {
        deployed: false,
        reason: `launch-failed: ${launchResult.output}`,
      };
    }
  }

  const deployTimestamp = new Date().toISOString();
  timings?.startPhase("syncState");
  await syncDeployState({
    projectDir,
    deviceSerial,
    state,
    deployId: state.nextDeployId,
    deployType: "rds",
    appType,
    deployTimestamp,
    currentManifest: reconcileResult.currentManifest,
    opts,
  });
  timings?.endPhase("syncState");

  const result = { deployed: true, type: "rds" };
  if (timings) {
    result.rdsTimings = timings.toJSON();
    timings.print("[RDS Benchmark] rds-delta");
  }
  return result;
}

// ─── Post-deploy RDS state update ─────────────────────────────────────────────────

/**
 * Update RDS state after a successful non-RDS deploy (e.g. a full install).
 *
 * Sets up the RDS state for the project (if this is the first deploy) and
 * records the device as having the current baseline.
 *
 * The baseline manifest is shared by every device of the project, but each
 * device only ever receives the changelist groups newer than its own
 * `lastDeployId`. So before the baseline is overwritten with the current
 * output, the baseline→current delta is reconciled into the `next` group and
 * promoted under this deploy's ID — otherwise a full install to device B
 * would silently erase the delta device A still needs, and A's next install
 * would report a no-op "fast-deploy" while running stale files.
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {string} deviceSerial - device serial number
 * @param {string} deployType - the type of deploy that just completed (typically 'full')
 * @param {{sdbPath?: string, tzPath?: string, timeoutMs?: number}} [opts]
 * @returns {Promise<{rdsTimings?: object} | undefined>} - timings object when benchmark mode is enabled
 */
async function updateRdsState(projectDir, deviceSerial, deployType, opts = {}) {
  const timings = isBenchmarkMode() ? new RdsDeployTimings() : null;
  try {
    const state = getOrCreateState(projectDir);
    const appType = detectAppType(projectDir);
    const deployTimestamp = new Date().toISOString();

    // Records the drift as the pending `next` group (replaced, not appended)
    // and hands back the freshly scanned manifest so syncDeployState() does
    // not hash the tree a second time. With no prior baseline this is a
    // no-op returning currentManifest: null → regenerated below.
    timings?.startPhase("reconcile");
    const reconcileResult = await reconcileDetailedAsync(projectDir);
    timings?.endPhase("reconcile");

    timings?.startPhase("syncState");
    await syncDeployState({
      projectDir,
      deviceSerial,
      state,
      deployId: state.nextDeployId,
      deployType,
      appType,
      deployTimestamp,
      currentManifest: reconcileResult.currentManifest ?? undefined,
      opts,
    });
    timings?.endPhase("syncState");

    if (timings) {
      const result = { rdsTimings: timings.toJSON() };
      timings.print("[RDS Benchmark] updateRdsState");
      return result;
    }
  } catch (err) {
    // RDS state update failure should not break the install flow — log, don't throw.
    console.warn(
      `[RDS] Failed to update RDS state after ${deployType} deploy: ${err.message}`,
    );
  }
  return undefined;
}

module.exports = {
  readDeviceMarker,
  pushDeltaFiles,
  pushDeviceMarkerAndSnapshot,
  syncDeployState,
  tryRdsDeploy,
  updateRdsState,
  // Benchmark timing exports
  isBenchmarkMode,
  RdsDeployTimings,
};
