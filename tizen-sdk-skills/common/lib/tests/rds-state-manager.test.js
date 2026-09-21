// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS state-manager.js tests.
 *
 * Verifies state file I/O, caching, and change tracking operations work
 * correctly. Tests use temporary directories to avoid side effects.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const sm = require("../core/rds/state-manager");

console.log("=== rds/state-manager.js Test ===\n");

let failures = 0;
let tmpDir = null;

function check(name, condition, details = "") {
  const ok = condition === true;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${details ? " — " + details : ""}`,
  );
}

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rds-state-test-"));
  sm.clearCaches();
}

function teardown() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  sm.clearCaches();
}

(async () => {
  try {
    // ─── Test: getOrCreateState / loadState / saveState ────────────────

    console.log("\n=== Deploy State Operations ===");

    setup();

    check(
      "rdsStateExists returns false before initialization",
      !sm.rdsStateExists(tmpDir),
    );

    const state1 = sm.getOrCreateState(tmpDir);
    check("getOrCreateState creates initial state", state1 !== null);
    check("initial state has nextDeployId = 1", state1.nextDeployId === 1);
    check(
      "initial state has empty devices",
      Object.keys(state1.devices).length === 0,
    );
    check(
      "rdsStateExists returns true after initialization",
      sm.rdsStateExists(tmpDir),
    );

    // Verify .tizen-rds directory was created
    check(
      ".tizen-rds directory exists",
      fs.existsSync(path.join(tmpDir, ".tizen-rds")),
    );

    // Verify deploy-state.json was written
    check(
      "deploy-state.json was written",
      fs.existsSync(path.join(tmpDir, ".tizen-rds", "deploy-state.json")),
    );

    // Verify caching works (second call returns same cached object)
    const state2 = sm.getOrCreateState(tmpDir);
    check("getOrCreateState caches state", state1 === state2);

    teardown();

    // ─── Test: addChanges / getDeltaForDevice ───────────────────────

    console.log("\n=== Change Tracking ===");

    setup();

    sm.getOrCreateState(tmpDir);

    sm.addChanges(tmpDir, [{ path: "src/main.c", type: "modify" }]);
    check("addChanges accepts single change", true);

    let changelist = sm.loadChangelist(tmpDir);
    check(
      "changelist has next group after addChanges",
      changelist.deploys["next"] !== undefined,
    );
    check("next group has 1 change", changelist.deploys["next"].length === 1);

    // Test composition (add then modify should stay as add)
    sm.addChanges(tmpDir, [{ path: "src/main.c", type: "add" }]);
    changelist = sm.loadChangelist(tmpDir);
    check(
      "composition: modify then add = add",
      changelist.deploys["next"][0].type === "add",
    );

    // Test delta before device state exists (should be empty)
    const delta1 = sm.getDeltaForDevice(tmpDir, "emulator-26101");
    check(
      "getDeltaForDevice returns empty for unknown device",
      delta1.length === 0,
    );

    teardown();

    // ─── Test: promoteNextGroup / pruneOldDeploys ────────────────────

    console.log("\n=== Deploy ID Management ===");

    setup();

    const state = sm.getOrCreateState(tmpDir);
    state.nextDeployId = 5;
    state.devices["emulator-1"] = {
      lastDeployId: 2,
      lastDeployTimestamp: new Date().toISOString(),
      deployType: "full",
      appInstalled: true,
    };
    sm.saveState(tmpDir, state);

    sm.addChanges(tmpDir, [
      { path: "Debug/app", type: "add" },
      { path: "src/main.c", type: "modify" },
    ]);

    sm.promoteNextGroup(tmpDir, 5);
    changelist = sm.loadChangelist(tmpDir);
    check(
      "promoteNextGroup moves next to numeric key",
      changelist.deploys["5"] !== undefined,
    );
    check(
      "promoteNextGroup deletes next",
      changelist.deploys["next"] === undefined,
    );

    sm.pruneOldDeploys(tmpDir);
    changelist = sm.loadChangelist(tmpDir);
    check(
      "pruneOldDeploys removes deploy ID < minDeployId",
      Object.keys(changelist.deploys).every(
        (k) => k === "next" || Number(k) >= 2,
      ),
    );

    teardown();

    // ─── Test: buildManifest operations ───────────────────────────

    console.log("\n=== Build Manifest ===");

    setup();

    sm.getOrCreateState(tmpDir);

    const manifest = {
      projectDir: tmpDir,
      timestamp: new Date().toISOString(),
      hashAlgorithm: "xxh3-128",
      input: { "src/main.c": { hash: "abc123def456" } },
      output: { "Debug/app": { hash: "def456ghi789" } },
    };

    sm.saveBuildManifest(tmpDir, manifest);
    check(
      "saveBuildManifest writes file",
      fs.existsSync(path.join(tmpDir, ".tizen-rds", "build-manifest.json")),
    );

    const loaded = sm.loadBuildManifest(tmpDir);
    check("loadBuildManifest retrieves manifest", loaded !== null);
    check(
      "loaded manifest has correct projectDir",
      loaded.projectDir === tmpDir,
    );

    sm.clearBuildManifest(tmpDir);
    check(
      "clearBuildManifest deletes file",
      !fs.existsSync(path.join(tmpDir, ".tizen-rds", "build-manifest.json")),
    );
    check(
      "clearBuildManifest clears cache",
      sm.loadBuildManifest(tmpDir) === null,
    );

    teardown();

    // ─── Test: baselineManifest operations ──────────────────────────

    console.log("\n=== Baseline Manifest ===");

    setup();

    sm.getOrCreateState(tmpDir);

    const baseline = {
      deployId: 1,
      projectDir: tmpDir,
      timestamp: new Date().toISOString(),
      hashAlgorithm: "xxh3-128",
      input: { "src/main.c": { hash: "abc123def456" } },
      output: { "Debug/app": { hash: "def456ghi789" } },
    };

    sm.saveBaselineManifest(tmpDir, baseline);
    check(
      "saveBaselineManifest writes file",
      fs.existsSync(sm.getBaselineManifestPath(tmpDir)),
    );

    const loadedBaseline = sm.loadBaselineManifest(tmpDir);
    check("loadBaselineManifest retrieves manifest", loadedBaseline !== null);
    check(
      "loaded baseline has correct deployId",
      loadedBaseline.deployId === 1,
    );

    teardown();

    // ─── Test: atomic writes ────────────────────────────────────────

    console.log("\n=== Atomic Writes ===");

    setup();

    sm.getOrCreateState(tmpDir);
    const rdsFiles = fs.readdirSync(path.join(tmpDir, ".tizen-rds"));
    check(
      "no temp file is left behind after a write",
      !rdsFiles.some((f) => f.endsWith(".tmp")),
    );
    check(
      "deploy-state.json and changelist.json were written",
      rdsFiles.includes("deploy-state.json") &&
        rdsFiles.includes("changelist.json"),
    );

    teardown();

    // ─── Test: resetAllRdsState ─────────────────────────────────────

    console.log("\n=== Full Reset ===");

    setup();

    sm.getOrCreateState(tmpDir);
    sm.addChanges(tmpDir, [{ path: "src/main.c", type: "add" }]);
    sm.saveBuildManifest(tmpDir, manifest);
    sm.saveBaselineManifest(tmpDir, baseline);

    check("rdsStateExists before reset", sm.rdsStateExists(tmpDir));

    sm.resetAllRdsState(tmpDir);

    check(
      "resetAllRdsState deletes all state files",
      !sm.rdsStateExists(tmpDir),
    );
    check(
      "resetAllRdsState removes the .tizen-rds directory",
      !fs.existsSync(path.join(tmpDir, ".tizen-rds")),
    );
    check(
      "resetAllRdsState deletes changelist",
      !fs.existsSync(path.join(tmpDir, ".tizen-rds", "changelist.json")),
    );
    check(
      "resetAllRdsState deletes baseline",
      !fs.existsSync(sm.getBaselineManifestPath(tmpDir)),
    );
    check(
      "resetAllRdsState deletes build-manifest",
      !fs.existsSync(path.join(tmpDir, ".tizen-rds", "build-manifest.json")),
    );
    check(
      "resetAllRdsState clears loadState cache",
      sm.loadState(tmpDir) === null,
    );

    teardown();

    // ─── Test: clearCaches ──────────────────────────────────────────

    console.log("\n=== Cache Management ===");

    setup();

    sm.getOrCreateState(tmpDir);
    const stateBeforeClear = sm.loadState(tmpDir);
    check("loadState returns cached state", stateBeforeClear !== null);

    sm.clearCaches();
    const stateAfterClear = sm.loadState(tmpDir);
    check(
      "clearCaches invalidates state cache (reloads from disk)",
      stateAfterClear !== stateBeforeClear,
    );
    check(
      "clearCaches cache still loads data correctly",
      stateAfterClear !== null,
    );

    teardown();

    // ─── Summary ────────────────────────────────────────────────────

    console.log("\n" + "=".repeat(40));
    if (failures === 0) {
      console.log("✓ All tests passed!");
      process.exit(0);
    } else {
      console.log(`✗ ${failures} test(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    process.exit(1);
  }
})();
