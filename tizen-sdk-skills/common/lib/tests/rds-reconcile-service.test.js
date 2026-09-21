// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS reconcile-service.js tests.
 *
 * Verifies reconciliation logic: comparing current output against baseline,
 * determining deploy type by drift ratio, and managing the changelist.
 */

const { join } = require("path");
const { mkdtempSync, rmSync } = require("fs");
const { tmpdir } = require("os");

const rs = require("../core/rds/reconcile-service");
const { DRIFT_THRESHOLD } = require("../core/rds/constants");
const {
  saveBaselineManifest,
  loadChangelist,
} = require("../core/rds/state-manager");

console.log("=== rds/reconcile-service.js Test ===\n");

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
    `expected ${expected}, got ${actual}${details ? " — " + details : ""}`,
  );
}

(async () => {
  let tempDir;
  let projectDir;

  try {
    // ─── Test: determineRdsStatusByRatio(buildNeeded, driftRatio) ───

    console.log("\n=== determineRdsStatusByRatio ===");

    // Zero drift → fast-deploy (checked before the threshold comparison)
    assertEquals(
      'returns "fast-deploy" at 0% drift',
      rs.determineRdsStatusByRatio(false, 0),
      "fast-deploy",
    );

    // Low, nonzero drift → rds
    assertEquals(
      'returns "rds" with drift below threshold',
      rs.determineRdsStatusByRatio(false, DRIFT_THRESHOLD - 0.1),
      "rds",
    );

    // Exactly at threshold → rds (only ratio > threshold triggers full)
    assertEquals(
      'returns "rds" exactly at threshold',
      rs.determineRdsStatusByRatio(false, DRIFT_THRESHOLD),
      "rds",
    );

    // Just above threshold → full
    assertEquals(
      'returns "full" just above threshold',
      rs.determineRdsStatusByRatio(false, DRIFT_THRESHOLD + 0.001),
      "full",
    );

    // High drift → full
    assertEquals(
      'returns "full" with 90% drift',
      rs.determineRdsStatusByRatio(false, 0.9),
      "full",
    );

    // 100% drift → full
    assertEquals(
      'returns "full" with 100% drift',
      rs.determineRdsStatusByRatio(false, 1.0),
      "full",
    );

    // buildNeeded=true short-circuits regardless of driftRatio — exercised only to
    // prove signature parity with the reference; the CLI never actually passes true.
    assertEquals(
      'returns "build-needed" when buildNeeded is true',
      rs.determineRdsStatusByRatio(true, 0),
      "build-needed",
    );

    // ─── Test: reconcileDetailedAsync ──────────────────────────────

    console.log("\n=== reconcileDetailedAsync ===");

    tempDir = mkdtempSync(join(tmpdir(), "rds-test-"));
    projectDir = join(tempDir, "MyProject");
    rmSync(projectDir, { force: true, recursive: true });

    // First deploy: no baseline exists
    let result = await rs.reconcileDetailedAsync(projectDir);
    check(
      'returns "full" when no baseline exists',
      result.rdsStatus === "full" &&
        result.driftRatio === 1 &&
        result.currentManifest === null,
    );

    // With empty baseline
    saveBaselineManifest(projectDir, {
      deployId: 1,
      projectDir,
      timestamp: new Date().toISOString(),
      hashAlgorithm: "xxh3-128",
      input: {},
      output: {},
    });

    result = await rs.reconcileDetailedAsync(projectDir);
    assertEquals(
      'returns "fast-deploy" with empty baseline',
      result.rdsStatus,
      "fast-deploy",
    );
    assertEquals("empty baseline has 0% drift", result.driftRatio, 0);
    check(
      "currentManifest is returned for reuse",
      result.currentManifest !== null,
    );
    check(
      "currentManifest has hashAlgorithm",
      result.currentManifest.hashAlgorithm === "xxh3-128",
    );
    check(
      "currentManifest has output object",
      typeof result.currentManifest.output === "object",
    );

    // Verify changelist behavior: no changes → no changelist written
    const changelist = loadChangelist(projectDir);
    check("changelist is null when no changes", changelist === null);

    // Drift ratio is a number [0..1]
    result = await rs.reconcileDetailedAsync(projectDir);
    check("driftRatio is a number", typeof result.driftRatio === "number");
    check(
      "driftRatio in valid range",
      result.driftRatio >= 0 && result.driftRatio <= 1,
    );

    console.log("\n=== All tests complete ===");
    console.log(`Failures: ${failures}`);

    if (failures > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("FATAL ERROR:", err);
    failures++;
    process.exit(1);
  } finally {
    if (tempDir) {
      try {
        rmSync(tempDir, { force: true, recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
})();
