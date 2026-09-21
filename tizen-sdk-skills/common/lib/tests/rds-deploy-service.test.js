// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS deploy-service.js tests (step 17 of the RDS plan).
 *
 * Exercises the full deploy orchestration — readDeviceMarker, pushDeltaFiles,
 * pushDeviceMarkerAndSnapshot, syncDeployState, tryRdsDeploy, updateRdsState —
 * against the fake `sdb` and `tz` binaries (fixtures/rds-sdb-bin/sdb,
 * fixtures/rds-tz-bin/tz) so real argv construction and file staging is
 * proven, not just asserted, without needing a Tizen emulator.
 *
 * NOT covered here: real on-device behavior (marker/snapshot format
 * round-tripping through an actual device, real `sdb root on` permission
 * semantics). Verified manually on a Tizen 11 emulator — see
 * docs/rds/RDS_FAST_DEPLOY_PLAN.en.md "Real-device verification".
 */

const { join } = require("path");
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require("fs");
const { tmpdir } = require("os");

const ds = require("../core/rds/deploy-service");
const { computeFileHash } = require("../core/rds/hash");
const {
  saveState,
  loadState,
  saveBaselineManifest,
  loadBaselineManifest,
  loadChangelist,
  addChanges,
  getDeltaForDevice,
  saveBuildManifest,
  loadBuildManifest,
  getBaselineManifestPath,
} = require("../core/rds/state-manager");

console.log("=== rds/deploy-service.js Test ===\n");

if (process.platform === "win32") {
  // The fake `sdb`/`tz` fixtures are POSIX shell scripts spawned via execFile;
  // Windows cannot execute them. CI runs this file on Linux.
  console.log(
    "SKIP: needs the POSIX fake sdb/tz fixtures (fixtures/rds-sdb-bin, rds-tz-bin)",
  );
  process.exit(0);
}

let failures = 0;

function check(name, condition, details = "") {
  const ok = condition === true;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${details ? " — " + details : ""}`,
  );
}

function assertEquals(name, actual, expected, details = "") {
  check(
    name,
    actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${details ? " — " + details : ""}`,
  );
}

const FAKE_SDB = join(__dirname, "fixtures", "rds-sdb-bin", "sdb");
const FAKE_TZ = join(__dirname, "fixtures", "rds-tz-bin", "tz");
const PKG_ID = "com.example.rdsdeploytest";
const RDS_INFO_PATH = `/opt/usr/apps/${PKG_ID}`;

/** Create a minimal native project directory (detectAppType => 'native'). */
function makeNativeProject(baseDir, name) {
  const projectDir = join(baseDir, name);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "project_def.prop"), "APPNAME = App\n");
  writeFileSync(
    join(projectDir, "tizen-manifest.xml"),
    `<manifest package="${PKG_ID}"/>`,
  );
  return projectDir;
}

/** Create an app-type-less project (detectAppType => null). */
function makeUnknownProject(baseDir, name) {
  const projectDir = join(baseDir, name);
  mkdirSync(projectDir, { recursive: true });
  return projectDir;
}

function writeDeployState(projectDir, { nextDeployId, devices }) {
  saveState(projectDir, {
    projectDir,
    nextDeployId,
    baselineManifestPath: getBaselineManifestPath(projectDir),
    devices,
  });
}

(async () => {
  let tempDir;

  try {
    // ═══ readDeviceMarker ═══════════════════════════════════════════════

    console.log("\n=== readDeviceMarker ===");

    const validMarker = await ds.readDeviceMarker(
      "rds-fast-ok",
      RDS_INFO_PATH,
      { sdbPath: FAKE_SDB },
    );
    check(
      "parses a valid marker",
      validMarker &&
        validMarker.deployId === 1 &&
        validMarker.deployType === "rds",
    );

    const missingMarker = await ds.readDeviceMarker(
      "deploy-marker-missing",
      RDS_INFO_PATH,
      { sdbPath: FAKE_SDB },
    );
    assertEquals(
      'returns null for "cat:" prefixed output',
      missingMarker,
      null,
    );

    const unreachableMarker = await ds.readDeviceMarker(
      "all-fail",
      RDS_INFO_PATH,
      { sdbPath: FAKE_SDB },
    );
    assertEquals(
      "returns null when sdb execute throws",
      unreachableMarker,
      null,
    );

    // ═══ Test project setup ═══════════════════════════════════════════

    tempDir = mkdtempSync(join(tmpdir(), "rds-deploy-test-"));

    // ═══ pushDeltaFiles ═════════════════════════════════════════════════

    console.log("\n=== pushDeltaFiles ===");

    const pushProjectDir = makeNativeProject(tempDir, "PushOnly");
    mkdirSync(join(pushProjectDir, "Debug", "tpk", "bin"), { recursive: true });
    mkdirSync(join(pushProjectDir, "Debug", "tpk", "res"), { recursive: true });
    writeFileSync(
      join(pushProjectDir, "Debug", "tpk", "bin", "myapp"),
      "binary-content",
    );
    writeFileSync(
      join(pushProjectDir, "Debug", "tpk", "res", "newfile.txt"),
      "new-file-content",
    );

    // Guard: missing devicePath
    let threwMissingDevicePath = false;
    try {
      await ds.pushDeltaFiles(
        "rds-delta-ok",
        pushProjectDir,
        [{ path: "Debug/tpk/bin/myapp", type: "modify" }],
        RDS_INFO_PATH,
        { sdbPath: FAKE_SDB },
      );
    } catch (err) {
      threwMissingDevicePath = /has no devicePath/.test(err.message);
    }
    check("throws when an entry has no devicePath", threwMissingDevicePath);

    // Guard: characters the device shell would interpret. `sdb shell` re-parses
    // its argv through the device's /bin/sh, so these must be rejected before
    // `root on` — for every entry type, not just deletes.
    const unsafeDevicePaths = [
      ["metacharacter", "bin/evil;rm", "delete"],
      ["space", "res/my icon.png", "delete"],
      ["glob bracket", "res/pages/[id].js", "delete"],
      ["pipe", "bin/x|reboot", "add"],
      ["redirect", "bin/x>etc", "modify"],
      ["parent traversal", "../../etc/passwd", "delete"],
    ];
    for (const [label, devicePath, type] of unsafeDevicePaths) {
      let threwUnsafe = false;
      try {
        await ds.pushDeltaFiles(
          "rds-delta-ok",
          pushProjectDir,
          [{ path: `Debug/tpk/${devicePath}`, type, devicePath }],
          RDS_INFO_PATH,
          { sdbPath: FAKE_SDB },
        );
      } catch (err) {
        threwUnsafe = /unsafe for the device shell/.test(err.message);
      }
      check(`rejects a device path with a ${label}`, threwUnsafe);
    }

    // Guard: the install root itself is screened too
    let threwUnsafeRoot = false;
    try {
      await ds.pushDeltaFiles(
        "rds-delta-ok",
        pushProjectDir,
        [
          {
            path: "Debug/tpk/bin/myapp",
            type: "delete",
            devicePath: "bin/myapp",
          },
        ],
        "/opt/usr/apps/pkg;reboot",
        { sdbPath: FAKE_SDB },
      );
    } catch (err) {
      threwUnsafeRoot = /unsafe for the device shell/.test(err.message);
    }
    check("rejects an unsafe RDS info path", threwUnsafeRoot);

    // Happy path: push two add/modify entries (no deletes)
    await ds.pushDeltaFiles(
      "rds-delta-ok",
      pushProjectDir,
      [
        {
          path: "Debug/tpk/bin/myapp",
          type: "modify",
          devicePath: "bin/myapp",
        },
        {
          path: "Debug/tpk/res/newfile.txt",
          type: "add",
          devicePath: "res/newfile.txt",
        },
      ],
      RDS_INFO_PATH,
      { sdbPath: FAKE_SDB },
    );
    check("push+modify entries complete without throwing", true);

    // Happy path: push + delete combined
    await ds.pushDeltaFiles(
      "rds-delta-delete-ok",
      pushProjectDir,
      [
        {
          path: "Debug/tpk/bin/myapp",
          type: "modify",
          devicePath: "bin/myapp",
        },
        {
          path: "Debug/tpk/res/old.txt",
          type: "delete",
          devicePath: "res/old.txt",
        },
      ],
      RDS_INFO_PATH,
      { sdbPath: FAKE_SDB },
    );
    check("push+delete entries complete without throwing", true);

    // TCP-connected device: the serial contains ':' — must not leak into the
    // host staging-directory name (illegal path character on Windows).
    await ds.pushDeltaFiles(
      "192.168.0.10:26101",
      pushProjectDir,
      [
        {
          path: "Debug/tpk/bin/myapp",
          type: "modify",
          devicePath: "bin/myapp",
        },
        {
          path: "Debug/tpk/res/old.txt",
          type: "delete",
          devicePath: "res/old.txt",
        },
      ],
      RDS_INFO_PATH,
      { sdbPath: FAKE_SDB },
    );
    check("push with a TCP serial (contains ':') completes", true);

    // ═══ pushDeviceMarkerAndSnapshot ═══════════════════════════════════

    console.log("\n=== pushDeviceMarkerAndSnapshot ===");

    const markerProjectDir = makeNativeProject(tempDir, "MarkerOnly");

    // No baseline manifest yet — expects only 1 file (marker, no snapshot)
    await ds.pushDeviceMarkerAndSnapshot(
      "rds-fast-ok",
      RDS_INFO_PATH,
      1,
      "fast-deploy",
      "2026-01-01T00:00:00.000Z",
      markerProjectDir,
      { sdbPath: FAKE_SDB },
    );
    check("pushes marker only when no baseline exists", true);

    // With a baseline manifest present — expects 2 files (marker + snapshot)
    saveBaselineManifest(markerProjectDir, {
      deployId: 1,
      projectDir: markerProjectDir,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: {},
    });
    await ds.pushDeviceMarkerAndSnapshot(
      "rds-fast-ok",
      RDS_INFO_PATH,
      2,
      "rds",
      "2026-01-02T00:00:00.000Z",
      markerProjectDir,
      { sdbPath: FAKE_SDB },
    );
    check("pushes marker + snapshot when baseline exists", true);

    await ds.pushDeviceMarkerAndSnapshot(
      "192.168.0.10:26101",
      RDS_INFO_PATH,
      3,
      "full",
      "2026-01-03T00:00:00.000Z",
      markerProjectDir,
      { sdbPath: FAKE_SDB },
    );
    check("marker push with a TCP serial (contains ':') completes", true);

    // ═══ syncDeployState ═══════════════════════════════════════════════

    console.log("\n=== syncDeployState ===");

    const syncProjectDir = makeNativeProject(tempDir, "SyncTest");
    mkdirSync(join(syncProjectDir, "Debug", "tpk", "bin"), { recursive: true });
    writeFileSync(
      join(syncProjectDir, "Debug", "tpk", "bin", "myapp"),
      "content",
    );
    writeFileSync(
      join(syncProjectDir, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );

    let syncState = {
      projectDir: syncProjectDir,
      nextDeployId: 1,
      baselineManifestPath: getBaselineManifestPath(syncProjectDir),
      devices: {},
    };

    // Reuses a provided currentManifest instead of regenerating — proven by a
    // distinctive input entry generateBaselineManifestAsync would never produce.
    const sentinelManifest = {
      deployId: 1,
      projectDir: syncProjectDir,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: { __sentinel__: { hash: "deadbeef" } },
      output: {},
    };

    await ds.syncDeployState({
      projectDir: syncProjectDir,
      deviceSerial: "rds-fast-ok",
      state: syncState,
      deployId: 1,
      deployType: "fast-deploy",
      appType: "native",
      deployTimestamp: "2026-01-01T00:00:00.000Z",
      currentManifest: sentinelManifest,
      opts: { sdbPath: FAKE_SDB },
    });

    const savedManifest = loadBaselineManifest(syncProjectDir);
    check(
      "reuses the provided currentManifest verbatim",
      savedManifest &&
        savedManifest.input.__sentinel__ &&
        savedManifest.input.__sentinel__.hash === "deadbeef",
    );

    assertEquals(
      "updates device state with the new deployId",
      syncState.devices["rds-fast-ok"].lastDeployId,
      1,
    );
    assertEquals(
      "records the deploy type",
      syncState.devices["rds-fast-ok"].deployType,
      "fast-deploy",
    );
    check(
      "marks the device as installed",
      syncState.devices["rds-fast-ok"].appInstalled === true,
    );
    assertEquals("advances nextDeployId", syncState.nextDeployId, 2);

    // Regenerates when currentManifest is absent — verify the saved output
    // reflects the ACTUAL scanned file (not the stale sentinel above).
    await ds.syncDeployState({
      projectDir: syncProjectDir,
      deviceSerial: "rds-fast-ok",
      state: syncState,
      deployId: syncState.nextDeployId,
      deployType: "fast-deploy",
      appType: "native",
      deployTimestamp: "2026-01-02T00:00:00.000Z",
      opts: { sdbPath: FAKE_SDB },
    });
    const regeneratedManifest = loadBaselineManifest(syncProjectDir);
    check(
      "regenerates from disk when currentManifest is absent",
      regeneratedManifest &&
        !regeneratedManifest.input.__sentinel__ &&
        !!regeneratedManifest.output["Debug/tpk/bin/myapp"],
    );

    // clearBuildManifest side effect
    saveBuildManifest(syncProjectDir, {
      projectDir: syncProjectDir,
      timestamp: "x",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: {},
    });
    check(
      "build-manifest.json exists before sync",
      loadBuildManifest(syncProjectDir) !== null,
    );
    await ds.syncDeployState({
      projectDir: syncProjectDir,
      deviceSerial: "rds-fast-ok",
      state: syncState,
      deployId: syncState.nextDeployId,
      deployType: "fast-deploy",
      appType: "native",
      deployTimestamp: "2026-01-03T00:00:00.000Z",
      opts: { sdbPath: FAKE_SDB },
    });
    check(
      "clears build-manifest.json as part of sync",
      loadBuildManifest(syncProjectDir) === null,
    );

    // ═══ tryRdsDeploy — early-exit gates ═══════════════════════════════

    console.log("\n=== tryRdsDeploy — early-exit gates ===");

    const gateOpts = { sdbPath: FAKE_SDB, tzPath: FAKE_TZ };

    // no-state: no .tizen-rds/ at all
    const noStateProject = makeNativeProject(tempDir, "NoState");
    const noStateResult = await ds.tryRdsDeploy(
      noStateProject,
      "rds-fast-ok",
      true,
      gateOpts,
    );
    check(
      "no-state",
      noStateResult.deployed === false && noStateResult.reason === "no-state",
    );

    // no-device-state: state exists, but no entry for this serial
    const noDeviceStateProject = makeNativeProject(tempDir, "NoDeviceState");
    writeDeployState(noDeviceStateProject, { nextDeployId: 1, devices: {} });
    const noDeviceStateResult = await ds.tryRdsDeploy(
      noDeviceStateProject,
      "rds-fast-ok",
      true,
      gateOpts,
    );
    check(
      "no-device-state",
      noDeviceStateResult.deployed === false &&
        noDeviceStateResult.reason === "no-device-state",
    );

    // no-app-type: state + device entry exist, but no manifest at all
    const noAppTypeProject = makeUnknownProject(tempDir, "NoAppType");
    writeDeployState(noAppTypeProject, {
      nextDeployId: 1,
      devices: {
        "rds-fast-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    const noAppTypeResult = await ds.tryRdsDeploy(
      noAppTypeProject,
      "rds-fast-ok",
      true,
      gateOpts,
    );
    check(
      "no-app-type",
      noAppTypeResult.deployed === false &&
        noAppTypeResult.reason === "no-app-type",
    );

    // no-install-path: valid project, but the device query fails on every tier
    const noInstallPathProject = makeNativeProject(tempDir, "NoInstallPath");
    writeDeployState(noInstallPathProject, {
      nextDeployId: 1,
      devices: {
        "all-fail": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    const noInstallPathResult = await ds.tryRdsDeploy(
      noInstallPathProject,
      "all-fail",
      true,
      gateOpts,
    );
    check(
      "no-install-path",
      noInstallPathResult.deployed === false &&
        noInstallPathResult.reason === "no-install-path",
    );

    // marker-missing: device query succeeds, but no marker file on device
    const markerMissingProject = makeNativeProject(tempDir, "MarkerMissing");
    writeDeployState(markerMissingProject, {
      nextDeployId: 1,
      devices: {
        "deploy-marker-missing": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    const markerMissingResult = await ds.tryRdsDeploy(
      markerMissingProject,
      "deploy-marker-missing",
      true,
      gateOpts,
    );
    check(
      "marker-missing",
      markerMissingResult.deployed === false &&
        markerMissingResult.reason === "marker-missing",
    );

    // marker-ahead: device marker's deployId (99) is ahead of server state (1)
    const markerAheadProject = makeNativeProject(tempDir, "MarkerAhead");
    writeDeployState(markerAheadProject, {
      nextDeployId: 2,
      devices: {
        "deploy-marker-ahead": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    const markerAheadResult = await ds.tryRdsDeploy(
      markerAheadProject,
      "deploy-marker-ahead",
      true,
      gateOpts,
    );
    check(
      "marker-ahead",
      markerAheadResult.deployed === false &&
        markerAheadResult.reason === "marker-ahead",
    );

    // marker-behind: device marker (1) is behind server state (3) — the device
    // was restored/re-flashed, so a delta from lastDeployId would skip files
    const markerBehindProject = makeNativeProject(tempDir, "MarkerBehind");
    writeDeployState(markerBehindProject, {
      nextDeployId: 4,
      devices: {
        "deploy-marker-behind": {
          lastDeployId: 3,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    const markerBehindResult = await ds.tryRdsDeploy(
      markerBehindProject,
      "deploy-marker-behind",
      true,
      gateOpts,
    );
    check(
      "marker-behind",
      markerBehindResult.deployed === false &&
        markerBehindResult.reason === "marker-behind",
      JSON.stringify(markerBehindResult),
    );

    // full-required: marker is valid, but no baseline-manifest.json exists to reconcile against
    const fullRequiredProject = makeNativeProject(tempDir, "FullRequired");
    writeDeployState(fullRequiredProject, {
      nextDeployId: 2,
      devices: {
        "rds-fast-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    const fullRequiredResult = await ds.tryRdsDeploy(
      fullRequiredProject,
      "rds-fast-ok",
      true,
      gateOpts,
    );
    check(
      "full-required",
      fullRequiredResult.deployed === false &&
        fullRequiredResult.reason === "full-required",
    );

    // ═══ tryRdsDeploy — fast-deploy happy path ══════════════════════════

    console.log("\n=== tryRdsDeploy — fast-deploy happy path ===");

    const fastDeployProject = makeNativeProject(tempDir, "FastDeploy");
    mkdirSync(join(fastDeployProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    writeFileSync(
      join(fastDeployProject, "Debug", "tpk", "bin", "myapp"),
      "unchanged-content",
    );
    writeFileSync(
      join(fastDeployProject, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );

    const fastDeployHash = await computeFileHash(
      join(fastDeployProject, "Debug", "tpk", "bin", "myapp"),
    );
    saveBaselineManifest(fastDeployProject, {
      deployId: 1,
      projectDir: fastDeployProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: { "Debug/tpk/bin/myapp": { hash: fastDeployHash } },
    });
    writeDeployState(fastDeployProject, {
      nextDeployId: 2,
      devices: {
        "rds-fast-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });

    const fastDeployResult = await ds.tryRdsDeploy(
      fastDeployProject,
      "rds-fast-ok",
      true,
      gateOpts,
    );
    check(
      "fast-deploy: reports deployed with type fast-deploy",
      fastDeployResult.deployed === true &&
        fastDeployResult.type === "fast-deploy",
    );
    const fastDeployState = loadState(fastDeployProject);
    assertEquals(
      "fast-deploy: advances lastDeployId",
      fastDeployState.devices["rds-fast-ok"].lastDeployId,
      2,
    );
    assertEquals(
      "fast-deploy: records deployType",
      fastDeployState.devices["rds-fast-ok"].deployType,
      "fast-deploy",
    );

    // ═══ tryRdsDeploy — rds delta happy path ═════════════════════════════

    console.log("\n=== tryRdsDeploy — rds delta happy path (modify + add) ===");

    const rdsDeltaProject = makeNativeProject(tempDir, "RdsDelta");
    mkdirSync(join(rdsDeltaProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    mkdirSync(join(rdsDeltaProject, "Debug", "tpk", "res"), {
      recursive: true,
    });

    // 4 baseline files; only bin/myapp changes and res/newfile.txt is added —
    // totalChanged(2)/baselineFileCount(4) = 0.5, at (not above) DRIFT_THRESHOLD.
    writeFileSync(
      join(rdsDeltaProject, "Debug", "tpk", "bin", "myapp"),
      "old-binary-v1",
    );
    writeFileSync(
      join(rdsDeltaProject, "Debug", "tpk", "res", "icon.png"),
      "icon-bytes",
    );
    writeFileSync(
      join(rdsDeltaProject, "Debug", "tpk", "res", "lib1.so"),
      "lib1-bytes",
    );
    writeFileSync(
      join(rdsDeltaProject, "Debug", "tpk", "res", "lib2.so"),
      "lib2-bytes",
    );

    const oldMyappHash = await computeFileHash(
      join(rdsDeltaProject, "Debug", "tpk", "bin", "myapp"),
    );
    const iconHash = await computeFileHash(
      join(rdsDeltaProject, "Debug", "tpk", "res", "icon.png"),
    );
    const lib1Hash = await computeFileHash(
      join(rdsDeltaProject, "Debug", "tpk", "res", "lib1.so"),
    );
    const lib2Hash = await computeFileHash(
      join(rdsDeltaProject, "Debug", "tpk", "res", "lib2.so"),
    );

    saveBaselineManifest(rdsDeltaProject, {
      deployId: 1,
      projectDir: rdsDeltaProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: {
        "Debug/tpk/bin/myapp": { hash: oldMyappHash },
        "Debug/tpk/res/icon.png": { hash: iconHash },
        "Debug/tpk/res/lib1.so": { hash: lib1Hash },
        "Debug/tpk/res/lib2.so": { hash: lib2Hash },
      },
    });
    writeDeployState(rdsDeltaProject, {
      nextDeployId: 2,
      devices: {
        "rds-delta-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });

    // Simulate a rebuild: bin/myapp changes, a new file appears, the rest is untouched
    writeFileSync(
      join(rdsDeltaProject, "Debug", "tpk", "bin", "myapp"),
      "new-binary-v2",
    );
    writeFileSync(
      join(rdsDeltaProject, "Debug", "tpk", "res", "newfile.txt"),
      "brand-new-file",
    );
    writeFileSync(
      join(rdsDeltaProject, "Debug", "tpk_contents"),
      JSON.stringify([
        "tpk/bin/myapp || .tpk/bin/myapp",
        "tpk/res/icon.png || .tpk/res/icon.png",
        "tpk/res/lib1.so || .tpk/res/lib1.so",
        "tpk/res/lib2.so || .tpk/res/lib2.so",
        "tpk/res/newfile.txt || .tpk/res/newfile.txt",
      ]),
    );

    const rdsDeltaResult = await ds.tryRdsDeploy(
      rdsDeltaProject,
      "rds-delta-ok",
      true,
      gateOpts,
    );
    check(
      "rds-delta: reports deployed with type rds",
      rdsDeltaResult.deployed === true && rdsDeltaResult.type === "rds",
      JSON.stringify(rdsDeltaResult),
    );
    const rdsDeltaBaseline = loadBaselineManifest(rdsDeltaProject);
    check(
      "rds-delta: new baseline includes the added file",
      rdsDeltaBaseline &&
        !!rdsDeltaBaseline.output["Debug/tpk/res/newfile.txt"],
    );
    const rdsDeltaChangelist = loadChangelist(rdsDeltaProject);
    check(
      'rds-delta: promotes "next" into a numeric deploy group',
      rdsDeltaChangelist &&
        rdsDeltaChangelist.deploys["2"] &&
        !rdsDeltaChangelist.deploys["next"],
    );

    // ═══ resolveDevicePaths safe-degradation: unmappable native delete ══

    console.log(
      "\n=== rds delta: unmappable native delete falls back to full install ===",
    );

    // A rebuild's tpk_contents naturally no longer lists a file that was
    // deleted from source — resolveNativeDevicePaths() has no mapping for it
    // and throws (per device-path-resolver.js's documented behavior), which
    // tryRdsDeploy's outer wrapper turns into a safe fallback signal rather
    // than a crash. This is the reference's documented "safe degradation
    // path", not a bug — verified as its own case rather than assumed.
    const unmappableDeleteProject = makeNativeProject(
      tempDir,
      "UnmappableDelete",
    );
    mkdirSync(join(unmappableDeleteProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    mkdirSync(join(unmappableDeleteProject, "Debug", "tpk", "res"), {
      recursive: true,
    });

    writeFileSync(
      join(unmappableDeleteProject, "Debug", "tpk", "bin", "myapp"),
      "stable-binary",
    );
    writeFileSync(
      join(unmappableDeleteProject, "Debug", "tpk", "res", "stale.txt"),
      "stale",
    );

    const stableHash = await computeFileHash(
      join(unmappableDeleteProject, "Debug", "tpk", "bin", "myapp"),
    );
    const staleHash = await computeFileHash(
      join(unmappableDeleteProject, "Debug", "tpk", "res", "stale.txt"),
    );

    saveBaselineManifest(unmappableDeleteProject, {
      deployId: 1,
      projectDir: unmappableDeleteProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: {
        "Debug/tpk/bin/myapp": { hash: stableHash },
        "Debug/tpk/res/stale.txt": { hash: staleHash },
      },
    });
    writeDeployState(unmappableDeleteProject, {
      nextDeployId: 2,
      devices: {
        "rds-delta-delete-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });

    rmSync(join(unmappableDeleteProject, "Debug", "tpk", "res", "stale.txt"));
    writeFileSync(
      join(unmappableDeleteProject, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );

    const unmappableDeleteResult = await ds.tryRdsDeploy(
      unmappableDeleteProject,
      "rds-delta-delete-ok",
      true,
      gateOpts,
    );
    check(
      "falls back safely (rds-error) instead of throwing out of tryRdsDeploy",
      unmappableDeleteResult.deployed === false &&
        unmappableDeleteResult.reason.startsWith("rds-error:"),
      JSON.stringify(unmappableDeleteResult),
    );
    const unmappableDeleteState = loadState(unmappableDeleteProject);
    assertEquals(
      "does not advance device state on fallback",
      unmappableDeleteState.devices["rds-delta-delete-ok"].lastDeployId,
      1,
    );

    // ═══ tryRdsDeploy — rds delta with a delete (web app) ════════════════

    console.log("\n=== tryRdsDeploy — rds delta with a delete (web app) ===");

    // Web delete resolution is plain prefix-stripping (Debug/projects/<name>/
    // -> res/wgt/), unlike native's tpk_contents lookup — it doesn't require
    // the deleted file to still be listed anywhere, so this is where a
    // delete can actually reach a successful 'rds' push.
    const rdsDeleteProject = join(tempDir, "RdsDeleteWeb");
    mkdirSync(rdsDeleteProject, { recursive: true });
    writeFileSync(
      join(rdsDeleteProject, "config.xml"),
      `<?xml version="1.0"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets">
  <tizen:application id="RdsDeleteWeb.App" package="${PKG_ID}"/>
</widget>`,
    );
    const webProjectName = "RdsDeleteWeb";
    const webOutDir = join(
      rdsDeleteProject,
      "Debug",
      "projects",
      webProjectName,
    );
    mkdirSync(webOutDir, { recursive: true });

    writeFileSync(join(webOutDir, "index.html"), "<html>a</html>");
    writeFileSync(join(webOutDir, "stale.js"), "stale-script");
    // Unchanged filler files so 2 changes (1 modify + 1 delete) stay at the
    // DRIFT_THRESHOLD boundary (2/4 = 0.5) instead of tripping it (2/2 = 1.0).
    writeFileSync(join(webOutDir, "style.css"), "body{}");
    writeFileSync(join(webOutDir, "app.js"), "console.log(1)");

    const webIndexHash = await computeFileHash(join(webOutDir, "index.html"));
    const webStaleHash = await computeFileHash(join(webOutDir, "stale.js"));
    const webStyleHash = await computeFileHash(join(webOutDir, "style.css"));
    const webAppJsHash = await computeFileHash(join(webOutDir, "app.js"));

    saveBaselineManifest(rdsDeleteProject, {
      deployId: 1,
      projectDir: rdsDeleteProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: {
        [`Debug/projects/${webProjectName}/index.html`]: { hash: webIndexHash },
        [`Debug/projects/${webProjectName}/stale.js`]: { hash: webStaleHash },
        [`Debug/projects/${webProjectName}/style.css`]: { hash: webStyleHash },
        [`Debug/projects/${webProjectName}/app.js`]: { hash: webAppJsHash },
      },
    });
    writeDeployState(rdsDeleteProject, {
      nextDeployId: 2,
      devices: {
        "rds-delta-delete-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });

    // stale.js is removed, index.html is modified — a delete + a modify
    rmSync(join(webOutDir, "stale.js"));
    writeFileSync(join(webOutDir, "index.html"), "<html>b</html>");

    const rdsDeleteResult = await ds.tryRdsDeploy(
      rdsDeleteProject,
      "rds-delta-delete-ok",
      true,
      gateOpts,
    );
    check(
      "rds-delete: reports deployed with type rds",
      rdsDeleteResult.deployed === true && rdsDeleteResult.type === "rds",
      JSON.stringify(rdsDeleteResult),
    );
    const rdsDeleteBaseline = loadBaselineManifest(rdsDeleteProject);
    check(
      "rds-delete: new baseline no longer includes the deleted file",
      rdsDeleteBaseline &&
        !rdsDeleteBaseline.output[`Debug/projects/${webProjectName}/stale.js`],
    );

    // ═══ tryRdsDeploy — launch failure and runAfterInstall=false ════════

    console.log(
      "\n=== tryRdsDeploy — launch failure / runAfterInstall=false ===",
    );

    const launchFailProject = makeNativeProject(tempDir, "LaunchFail");
    mkdirSync(join(launchFailProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    writeFileSync(
      join(launchFailProject, "Debug", "tpk", "bin", "myapp"),
      "content",
    );
    writeFileSync(
      join(launchFailProject, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );
    const launchFailHash = await computeFileHash(
      join(launchFailProject, "Debug", "tpk", "bin", "myapp"),
    );
    saveBaselineManifest(launchFailProject, {
      deployId: 1,
      projectDir: launchFailProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: { "Debug/tpk/bin/myapp": { hash: launchFailHash } },
    });
    writeDeployState(launchFailProject, {
      nextDeployId: 2,
      devices: {
        "launch-fail": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });

    const launchFailResult = await ds.tryRdsDeploy(
      launchFailProject,
      "launch-fail",
      true,
      gateOpts,
    );
    check(
      "launch failure surfaces as launch-failed reason, not deployed",
      launchFailResult.deployed === false &&
        launchFailResult.reason.startsWith("launch-failed:"),
      JSON.stringify(launchFailResult),
    );
    const launchFailState = loadState(launchFailProject);
    assertEquals(
      "launch failure does not advance device state",
      launchFailState.devices["launch-fail"].lastDeployId,
      1,
    );

    // runAfterInstall=false: reuse the same fixture but with a broken tzPath —
    // if runNoChain() were called despite the flag, the result would be
    // launch-failed instead of deployed:true, proving the launch was skipped.
    const skipLaunchProject = makeNativeProject(tempDir, "SkipLaunch");
    mkdirSync(join(skipLaunchProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    writeFileSync(
      join(skipLaunchProject, "Debug", "tpk", "bin", "myapp"),
      "content",
    );
    writeFileSync(
      join(skipLaunchProject, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );
    const skipLaunchHash = await computeFileHash(
      join(skipLaunchProject, "Debug", "tpk", "bin", "myapp"),
    );
    saveBaselineManifest(skipLaunchProject, {
      deployId: 1,
      projectDir: skipLaunchProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: { "Debug/tpk/bin/myapp": { hash: skipLaunchHash } },
    });
    writeDeployState(skipLaunchProject, {
      nextDeployId: 2,
      devices: {
        "rds-fast-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });

    const skipLaunchResult = await ds.tryRdsDeploy(
      skipLaunchProject,
      "rds-fast-ok",
      false,
      {
        sdbPath: FAKE_SDB,
        tzPath: "/nonexistent/tz-should-not-run",
      },
    );
    check(
      "runAfterInstall=false skips launch and still syncs state",
      skipLaunchResult.deployed === true &&
        skipLaunchResult.type === "fast-deploy",
      JSON.stringify(skipLaunchResult),
    );

    // ═══ updateRdsState ═══════════════════════════════════════════════

    console.log("\n=== updateRdsState ===");

    const updateStateProject = makeNativeProject(tempDir, "UpdateState");
    mkdirSync(join(updateStateProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    writeFileSync(
      join(updateStateProject, "Debug", "tpk", "bin", "myapp"),
      "content",
    );
    writeFileSync(
      join(updateStateProject, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );

    await ds.updateRdsState(
      updateStateProject,
      "rds-fast-ok",
      "full",
      gateOpts,
    );
    const updatedState = loadState(updateStateProject);
    check(
      "updateRdsState initializes state on first deploy",
      updatedState !== null,
    );
    check(
      "updateRdsState records the device as installed with the given deployType",
      updatedState &&
        updatedState.devices["rds-fast-ok"] &&
        updatedState.devices["rds-fast-ok"].deployType === "full" &&
        updatedState.devices["rds-fast-ok"].appInstalled === true,
    );
    assertEquals(
      "updateRdsState advances nextDeployId",
      updatedState.nextDeployId,
      2,
    );

    // Errors are swallowed, not thrown — pushDirectory() will throw internally
    // ("1 file(s) skipped") via the sync-push-fail fixture serial.
    const updateFailProject = makeNativeProject(tempDir, "UpdateFail");
    let updateFailThrew = false;
    try {
      await ds.updateRdsState(
        updateFailProject,
        "sync-push-fail",
        "full",
        gateOpts,
      );
    } catch {
      updateFailThrew = true;
    }
    check(
      "updateRdsState does not throw when the underlying sync fails",
      updateFailThrew === false,
    );

    // ═══ updateRdsState — full install must not erase other devices' delta ═

    console.log(
      "\n=== updateRdsState — records the drift so other devices still get it ===",
    );

    // Device A was deployed at deployId 1 with bin/myapp v1. The developer
    // rebuilds (v2) and full-installs to device B. Device A's next install must
    // still see the v1→v2 modify — i.e. it must have been promoted into a
    // numeric changelist group rather than swallowed by the baseline rewrite.
    const multiDeviceProject = makeNativeProject(tempDir, "MultiDevice");
    mkdirSync(join(multiDeviceProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    writeFileSync(
      join(multiDeviceProject, "Debug", "tpk", "bin", "myapp"),
      "multi-v1",
    );
    writeFileSync(
      join(multiDeviceProject, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );
    const multiV1Hash = await computeFileHash(
      join(multiDeviceProject, "Debug", "tpk", "bin", "myapp"),
    );
    saveBaselineManifest(multiDeviceProject, {
      deployId: 1,
      projectDir: multiDeviceProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: { "Debug/tpk/bin/myapp": { hash: multiV1Hash } },
    });
    writeDeployState(multiDeviceProject, {
      nextDeployId: 2,
      devices: {
        "device-a": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "full",
          appInstalled: true,
        },
      },
    });

    writeFileSync(
      join(multiDeviceProject, "Debug", "tpk", "bin", "myapp"),
      "multi-v2",
    );
    await ds.updateRdsState(
      multiDeviceProject,
      "rds-fast-ok", // device B
      "full",
      gateOpts,
    );

    const multiState = loadState(multiDeviceProject);
    assertEquals(
      "device B recorded at deployId 2",
      multiState.devices["rds-fast-ok"].lastDeployId,
      2,
    );
    assertEquals(
      "device A still at deployId 1",
      multiState.devices["device-a"].lastDeployId,
      1,
    );
    const multiChangelist = loadChangelist(multiDeviceProject);
    check(
      "full install promoted the v1→v2 modify into group 2",
      !!multiChangelist &&
        Array.isArray(multiChangelist.deploys["2"]) &&
        multiChangelist.deploys["2"].some(
          (e) => e.path === "Debug/tpk/bin/myapp" && e.type === "modify",
        ) &&
        !multiChangelist.deploys["next"],
      JSON.stringify(multiChangelist),
    );
    const deviceADelta = getDeltaForDevice(multiDeviceProject, "device-a");
    check(
      "device A's pending delta contains the modified file",
      deviceADelta.some(
        (e) => e.path === "Debug/tpk/bin/myapp" && e.type === "modify",
      ),
      JSON.stringify(deviceADelta),
    );
    const multiBaseline = loadBaselineManifest(multiDeviceProject);
    check(
      "baseline now describes v2",
      !!multiBaseline &&
        multiBaseline.output["Debug/tpk/bin/myapp"].hash !== multiV1Hash,
    );

    // ═══ reconcile replaces a stale `next` group instead of appending ═════

    console.log("\n=== reconcile — stale `next` from an aborted attempt ===");

    // An earlier attempt recorded "delete stale.txt" in `next` and then died.
    // The file has since been restored, so the fresh reconcile finds zero
    // drift — the stale delete must not be replayed against the device.
    const staleNextProject = makeNativeProject(tempDir, "StaleNext");
    mkdirSync(join(staleNextProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    writeFileSync(
      join(staleNextProject, "Debug", "tpk", "bin", "myapp"),
      "stable",
    );
    writeFileSync(
      join(staleNextProject, "Debug", "tpk_contents"),
      JSON.stringify(["tpk/bin/myapp || .tpk/bin/myapp"]),
    );
    const staleNextHash = await computeFileHash(
      join(staleNextProject, "Debug", "tpk", "bin", "myapp"),
    );
    saveBaselineManifest(staleNextProject, {
      deployId: 1,
      projectDir: staleNextProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: { "Debug/tpk/bin/myapp": { hash: staleNextHash } },
    });
    writeDeployState(staleNextProject, {
      nextDeployId: 2,
      devices: {
        "rds-fast-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    addChanges(staleNextProject, [
      { path: "Debug/tpk/res/stale.txt", type: "delete" },
    ]);

    const staleNextResult = await ds.tryRdsDeploy(
      staleNextProject,
      "rds-fast-ok",
      false,
      gateOpts,
    );
    check(
      "zero drift after a stale `next` is a fast-deploy, not a replayed delete",
      staleNextResult.deployed === true &&
        staleNextResult.type === "fast-deploy",
      JSON.stringify(staleNextResult),
    );
    const staleNextChangelist = loadChangelist(staleNextProject);
    check(
      "stale `next` entry was discarded",
      !staleNextChangelist ||
        (!staleNextChangelist.deploys["next"] &&
          !staleNextChangelist.deploys["2"]),
      JSON.stringify(staleNextChangelist),
    );

    // ═══ manifest change forces a full install ════════════════════════════

    console.log("\n=== tryRdsDeploy — tizen-manifest.xml change ===");

    // Four files, one changed = 25% drift → would be "rds"; but the changed
    // file is the manifest, which only the package manager can apply.
    const manifestProject = makeNativeProject(tempDir, "ManifestChange");
    mkdirSync(join(manifestProject, "Debug", "tpk", "bin"), {
      recursive: true,
    });
    mkdirSync(join(manifestProject, "Debug", "tpk", "res"), {
      recursive: true,
    });
    const manifestFiles = {
      "bin/myapp": "bin",
      "res/a.png": "a",
      "res/b.png": "b",
      "tizen-manifest.xml": '<manifest package="x"><privilege/></manifest>',
    };
    const manifestBaselineOutput = {};
    for (const [rel, content] of Object.entries(manifestFiles)) {
      writeFileSync(join(manifestProject, "Debug", "tpk", rel), content);
      manifestBaselineOutput[`Debug/tpk/${rel}`] = {
        hash: await computeFileHash(join(manifestProject, "Debug", "tpk", rel)),
      };
    }
    writeFileSync(
      join(manifestProject, "Debug", "tpk_contents"),
      JSON.stringify(
        Object.keys(manifestFiles).map((rel) => `tpk/${rel} || .tpk/${rel}`),
      ),
    );
    saveBaselineManifest(manifestProject, {
      deployId: 1,
      projectDir: manifestProject,
      timestamp: "2026-01-01T00:00:00.000Z",
      hashAlgorithm: "xxh3-128",
      input: {},
      output: manifestBaselineOutput,
    });
    writeDeployState(manifestProject, {
      nextDeployId: 2,
      devices: {
        "rds-delta-ok": {
          lastDeployId: 1,
          lastDeployTimestamp: "x",
          deployType: "rds",
          appInstalled: true,
        },
      },
    });
    writeFileSync(
      join(manifestProject, "Debug", "tpk", "tizen-manifest.xml"),
      '<manifest package="x"><privilege>http://tizen.org/privilege/internet</privilege></manifest>',
    );

    const manifestResult = await ds.tryRdsDeploy(
      manifestProject,
      "rds-delta-ok",
      true,
      gateOpts,
    );
    check(
      "manifest change → full-required even below the drift threshold",
      manifestResult.deployed === false &&
        manifestResult.reason === "full-required",
      JSON.stringify(manifestResult),
    );

    console.log("\n=== All tests complete ===");
    console.log(`Failures: ${failures}`);
  } catch (err) {
    console.error("FATAL ERROR:", err);
    failures++;
  } finally {
    if (tempDir) {
      try {
        rmSync(tempDir, { force: true, recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
})();
