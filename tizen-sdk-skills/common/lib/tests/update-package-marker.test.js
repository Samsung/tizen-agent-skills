// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * .package-update-result marker tests
 *
 * tizen-update-package.sh/.ps1 write this marker when they exit. In Claude
 * Code / Cline / Codex the Phase 1 CLI (updatePackage, non-pkg) cannot run the
 * updater itself, so the agent's re-run after Phase 2 relies on the marker to
 * turn into a real success/failure envelope instead of the launcher envelope
 * again. These tests pin the three pure helpers behind that:
 *   - parseUpdateResultMarker: field extraction, CRLF, malformed input
 *   - isUpdateResultFresh:     the 30-minute window, clock skew, NaN
 *   - updateResultSatisfies:   which recorded Mode answers which request
 *
 * Run: node lib/tests/update-package-marker.test.js
 */

const assert = require("assert");
const {
  UPDATE_RESULT_MAX_AGE_MS,
  parseUpdateResultMarker,
  isUpdateResultFresh,
  updateResultSatisfies,
} = require("../core/sdk");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message}`);
  }
}

const FULL_MARKER = [
  "Package update finished at 2026-09-09T05:10:00-04:00",
  "Mode: update",
  "Exit: 0",
  "Outdated: 3",
  "Result: updated 3 / skipped 0 / failed 0 / up-to-date 120 (total 123)",
].join("\n");

const FAILED_MARKER = [
  "Package update finished at 2026-09-09T05:12:00-04:00",
  "Mode: force",
  "Exit: 1",
  "Outdated: 174",
  "Result: updated 170 / skipped 0 / failed 4 / up-to-date 0 (total 174)",
].join("\n");

console.log("=== parseUpdateResultMarker ===");

test("extracts every field from a full marker", () => {
  const m = parseUpdateResultMarker(FULL_MARKER);
  assert.strictEqual(m.finished_at, "2026-09-09T05:10:00-04:00");
  assert.strictEqual(m.mode, "update");
  assert.strictEqual(m.exit_code, 0);
  assert.deepStrictEqual(m.summary, {
    total: 123,
    updated: 3,
    skipped: 0,
    failed: 0,
    up_to_date: 120,
    outdated: 3,
  });
});

test("reads a failed force run (exit 1, failed > 0)", () => {
  const m = parseUpdateResultMarker(FAILED_MARKER);
  assert.strictEqual(m.mode, "force");
  assert.strictEqual(m.exit_code, 1);
  assert.strictEqual(m.summary.failed, 4);
  assert.strictEqual(m.summary.updated, 170);
});

test("tolerates CRLF line endings (Windows .ps1 writer)", () => {
  const m = parseUpdateResultMarker(
    FULL_MARKER.replace(/\n/g, "\r\n") + "\r\n",
  );
  assert.strictEqual(m.mode, "update");
  assert.strictEqual(m.exit_code, 0);
  assert.strictEqual(m.summary.total, 123);
});

test("omits `outdated` when the line is absent, summary still parsed", () => {
  const m = parseUpdateResultMarker(
    FULL_MARKER.split("\n")
      .filter((l) => !l.startsWith("Outdated:"))
      .join("\n"),
  );
  assert.strictEqual(m.summary.total, 123);
  assert.strictEqual("outdated" in m.summary, false);
});

test("returns nulls, not a throw, for empty / garbage / undefined input", () => {
  for (const body of ["", "not a marker\n", undefined, null]) {
    const m = parseUpdateResultMarker(body);
    assert.strictEqual(m.summary, null, `summary for ${JSON.stringify(body)}`);
    assert.strictEqual(m.exit_code, null);
    assert.strictEqual(m.mode, null);
    assert.strictEqual(m.finished_at, null);
  }
});

test("a Result line alone still yields a summary (exit/mode null)", () => {
  const m = parseUpdateResultMarker(
    "Result: updated 0 / skipped 0 / failed 0 / up-to-date 149 (total 174)",
  );
  assert.strictEqual(m.summary.up_to_date, 149);
  assert.strictEqual(m.exit_code, null);
});

console.log("=== isUpdateResultFresh ===");

const NOW = 1_800_000_000_000;

test("just written → fresh", () => {
  assert.strictEqual(isUpdateResultFresh(NOW, NOW), true);
});

test("exactly at the window edge → fresh", () => {
  assert.strictEqual(
    isUpdateResultFresh(NOW - UPDATE_RESULT_MAX_AGE_MS, NOW),
    true,
  );
});

test("one millisecond past the window → stale", () => {
  assert.strictEqual(
    isUpdateResultFresh(NOW - UPDATE_RESULT_MAX_AGE_MS - 1, NOW),
    false,
  );
});

test("a week old → stale", () => {
  assert.strictEqual(
    isUpdateResultFresh(NOW - 7 * 24 * 60 * 60 * 1000, NOW),
    false,
  );
});

test("slightly in the future (clock skew) → fresh", () => {
  assert.strictEqual(isUpdateResultFresh(NOW + 5_000, NOW), true);
});

test("NaN / undefined mtime → never fresh", () => {
  assert.strictEqual(isUpdateResultFresh(NaN, NOW), false);
  assert.strictEqual(isUpdateResultFresh(undefined, NOW), false);
});

test("custom maxAge is honoured", () => {
  assert.strictEqual(isUpdateResultFresh(NOW - 10, NOW, 5), false);
  assert.strictEqual(isUpdateResultFresh(NOW - 10, NOW, 10), true);
});

test("window is 30 minutes", () => {
  assert.strictEqual(UPDATE_RESULT_MAX_AGE_MS, 30 * 60 * 1000);
});

console.log("=== updateResultSatisfies ===");

test("plain request ← plain update", () => {
  assert.strictEqual(updateResultSatisfies("update", {}), true);
  assert.strictEqual(updateResultSatisfies("update"), true);
});

test("plain request ← forced update (everything was reinstalled)", () => {
  assert.strictEqual(updateResultSatisfies("force", {}), true);
});

test("plain request ✗ dry-run (nothing was changed)", () => {
  assert.strictEqual(updateResultSatisfies("dry-run", {}), false);
});

test("--force ← force only; a plain run must not short-circuit --force", () => {
  assert.strictEqual(updateResultSatisfies("force", { force: true }), true);
  assert.strictEqual(updateResultSatisfies("update", { force: true }), false);
  assert.strictEqual(updateResultSatisfies("dry-run", { force: true }), false);
});

test("--dry-run ← dry-run only", () => {
  assert.strictEqual(updateResultSatisfies("dry-run", { dryRun: true }), true);
  assert.strictEqual(updateResultSatisfies("update", { dryRun: true }), false);
  assert.strictEqual(updateResultSatisfies("force", { dryRun: true }), false);
});

test("--force --dry-run behaves as dry-run (the scripts record Mode: dry-run)", () => {
  assert.strictEqual(
    updateResultSatisfies("dry-run", { force: true, dryRun: true }),
    true,
  );
  assert.strictEqual(
    updateResultSatisfies("force", { force: true, dryRun: true }),
    false,
  );
});

test("unknown / missing mode never satisfies", () => {
  for (const mode of [null, undefined, "", "weird"]) {
    assert.strictEqual(updateResultSatisfies(mode, {}), false);
    assert.strictEqual(updateResultSatisfies(mode, { force: true }), false);
    assert.strictEqual(updateResultSatisfies(mode, { dryRun: true }), false);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
