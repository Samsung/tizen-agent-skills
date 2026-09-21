// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS baseline-manager.js tests.
 *
 * Verifies baseline manifest generation, comparison, and ignore list
 * resolution work correctly. Uses mock manifests to avoid filesystem overhead.
 */

const bm = require("../core/rds/baseline-manager");

console.log("=== rds/baseline-manager.js Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  const ok = condition === true;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${details ? " — " + details : ""}`,
  );
}

(async () => {
  try {
    // ─── Test: getIgnoreList ───────────────────────────────────────

    console.log("\n=== Ignore List ===");

    const ignoreList = bm.getIgnoreList();
    check(
      "getIgnoreList returns object",
      ignoreList && typeof ignoreList === "object",
    );
    check("ignoreList has patterns array", Array.isArray(ignoreList.patterns));
    check(
      "ignoreList has .tizen-rds pattern",
      ignoreList.patterns.some((p) => p.includes(".tizen-rds")),
    );

    // ─── Test: prefixIgnorePatterns ────────────────────────────────

    console.log("\n=== Ignore Pattern Prefixing ===");

    const patterns = ["*.tmp", "**/node_modules/**", "Debug/**"];
    const prefixed = bm.prefixIgnorePatterns(patterns);
    check("prefixIgnorePatterns returns array", Array.isArray(prefixed));
    check(
      "prefixed array has same length",
      prefixed.length === patterns.length,
    );
    check(
      "already-prefixed pattern unchanged",
      prefixed[1] === "**/node_modules/**",
    );
    check(
      "non-prefixed pattern gets prefix",
      prefixed[0] === "**/**.tmp" || prefixed[0] === "**/*.tmp",
    );
    check(
      "all patterns start with **/",
      prefixed.every((p) => p.startsWith("**/")),
    );

    // ─── Test: compareAgainstBaseline ──────────────────────────────

    console.log("\n=== Baseline Comparison ===");

    const baseline = {
      deployId: 1,
      projectDir: "/test",
      timestamp: new Date().toISOString(),
      hashAlgorithm: "xxh3-128",
      input: { "src/main.c": { hash: "abc123" } },
      output: {
        "Debug/app": { hash: "hash1" },
        "Debug/lib.so": { hash: "hash2" },
        "Debug/old-file.so": { hash: "hash_old" },
      },
    };

    const current = {
      deployId: 2,
      projectDir: "/test",
      timestamp: new Date().toISOString(),
      hashAlgorithm: "xxh3-128",
      input: { "src/main.c": { hash: "abc123" } },
      output: {
        "Debug/app": { hash: "hash1" }, // unchanged
        "Debug/lib.so": { hash: "hash2_modified" }, // modified
        "Debug/new-file.so": { hash: "hash_new" }, // added
        // 'Debug/old-file.so' is deleted
      },
    };

    const comparison = bm.compareAgainstBaseline(current, baseline);
    check("comparison has modified array", Array.isArray(comparison.modified));
    check("comparison has added array", Array.isArray(comparison.added));
    check("comparison has deleted array", Array.isArray(comparison.deleted));
    check("modified count is 1", comparison.modified.length === 1);
    check(
      "modified entry is lib.so",
      comparison.modified[0]?.path === "Debug/lib.so",
    );
    check("modified type is modify", comparison.modified[0]?.type === "modify");
    check("added count is 1", comparison.added.length === 1);
    check(
      "added entry is new-file.so",
      comparison.added[0]?.path === "Debug/new-file.so",
    );
    check("deleted count is 1", comparison.deleted.length === 1);
    check(
      "deleted entry is old-file.so",
      comparison.deleted[0]?.path === "Debug/old-file.so",
    );
    check(
      "driftRatio is 1.0 (3 changes/3 baseline files)",
      comparison.driftRatio === 1.0,
    );
    check("baselineFileCount is 3", comparison.baselineFileCount === 3);
    check("currentFileCount is 3", comparison.currentFileCount === 3);

    // ─── Test: drift ratio edge cases ────────────────────────────

    console.log("\n=== Drift Ratio Edge Cases ===");

    // Empty baseline, empty current → 0 drift
    const emptyComparison = bm.compareAgainstBaseline(
      { output: {} },
      { output: {} },
    );
    check(
      "empty baseline + empty current = 0 drift",
      emptyComparison.driftRatio === 0,
    );

    // Empty baseline, current files exist → 100% drift (forces full)
    const addedComparison = bm.compareAgainstBaseline(
      { output: { "file.so": { hash: "xyz" } } },
      { output: {} },
    );
    check(
      "empty baseline + current files = 100% drift",
      addedComparison.driftRatio === 1,
    );

    // Baseline files, current empty → 100% drift (all deleted)
    const deletedComparison = bm.compareAgainstBaseline(
      { output: {} },
      { output: { "file.so": { hash: "xyz" } } },
    );
    check(
      "baseline files + empty current = 100% drift",
      deletedComparison.driftRatio === 1,
    );

    // ─── Test: compareCurrentAgainstStoredAsync ────────────────────

    console.log("\n=== Current vs Stored Comparison ===");

    // Note: This test is simplified since we can't easily mock the filesystem.
    // Real testing happens in integration tests when buildProject/installApp flow is complete.
    check(
      "compareCurrentAgainstStoredAsync is exported",
      typeof bm.compareCurrentAgainstStoredAsync === "function",
    );

    // ─── Test: generateBaselineManifestAsync ───────────────────────

    console.log("\n=== Baseline Generation ===");

    check(
      "generateBaselineManifestAsync is exported",
      typeof bm.generateBaselineManifestAsync === "function",
    );

    // Summary
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
