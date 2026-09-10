// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * .emulator-package-installed marker satisfaction tests
 *
 * The marker records one "Platform version: X.Y" line per installed platform.
 * downloadEmulatorPackage()'s pre-check must:
 *   - satisfy an EXPLICIT version request only when that exact version is
 *     recorded (a 10.0-era marker answering an 11.0 request is how the
 *     tizen-11.0 emulator resources ended up never being fetched), and
 *   - treat a NO-version (auto-detect) request as satisfied by any completed
 *     install — the pre-check runs without network, so it cannot know what
 *     "latest" resolves to.
 *
 * Run: node lib/tests/emulator-marker.test.js
 */

const assert = require("assert");
const {
  parseEmulatorMarkerPlatforms,
  isEmulatorMarkerSatisfied,
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

const MODERN_MARKER = [
  "Emulator package installed at 2026-08-28T15:00:00+09:00",
  "Target: TIZEN-11.0-Emulator",
  "Platform version: 10.0",
  "Platform version: 11.0",
].join("\n");

// Written by script versions before per-version records: header + single
// last-write-wins version line.
const OLD_SINGLE_LINE_MARKER = [
  "Emulator package installed at 2025-12-01T10:00:00+09:00",
  "Target: TIZEN-10.0-Emulator",
  "Platform version: 10.0",
].join("\n");

// Oldest form: no version lines at all.
const LEGACY_MARKER =
  "Emulator package installed at 2025-01-01T09:00:00+09:00\n";

console.log("=== parseEmulatorMarkerPlatforms ===");

test("parses every recorded platform, in order", () => {
  assert.deepStrictEqual(parseEmulatorMarkerPlatforms(MODERN_MARKER), [
    "10.0",
    "11.0",
  ]);
});

test("legacy marker without version lines yields []", () => {
  assert.deepStrictEqual(parseEmulatorMarkerPlatforms(LEGACY_MARKER), []);
  assert.deepStrictEqual(parseEmulatorMarkerPlatforms(""), []);
  assert.deepStrictEqual(parseEmulatorMarkerPlatforms(undefined), []);
});

test("tolerates CRLF line endings (the .ps1-written marker)", () => {
  const crlf = MODERN_MARKER.split("\n").join("\r\n");
  assert.deepStrictEqual(parseEmulatorMarkerPlatforms(crlf), ["10.0", "11.0"]);
});

test("tolerates a UTF-8 BOM and spacing variants around the value", () => {
  const bom =
    "﻿" +
    "Platform version: 12.0\nPlatform version:13.0\nPlatform version: 14.0  \n";
  // BOM glues onto the FIRST line; that line is the header in real markers,
  // but even when a version line comes first the rest must still parse.
  assert.deepStrictEqual(parseEmulatorMarkerPlatforms(bom), ["13.0", "14.0"]);
});

test("the value must sit on the SAME line as the key", () => {
  // A `\s*` before the capture would let the match run across the newline and
  // claim the next line's text as the version.
  assert.deepStrictEqual(
    parseEmulatorMarkerPlatforms("Platform version:\n10.0\n"),
    [],
  );
});

test("does not match the key mid-line or with a prefix", () => {
  assert.deepStrictEqual(
    parseEmulatorMarkerPlatforms(
      "XPlatform version: 10.0\nnote: Platform version: 11.0\n",
    ),
    [],
  );
});

console.log("\n=== isEmulatorMarkerSatisfied — explicit version requests ===");

test("recorded version satisfies its own request", () => {
  assert.strictEqual(
    isEmulatorMarkerSatisfied(MODERN_MARKER, "10.0").satisfied,
    true,
  );
  assert.strictEqual(
    isEmulatorMarkerSatisfied(MODERN_MARKER, "11.0").satisfied,
    true,
  );
});

test("a 10.0-only record does NOT satisfy an 11.0 request (the field bug)", () => {
  const r = isEmulatorMarkerSatisfied(OLD_SINGLE_LINE_MARKER, "11.0");
  assert.strictEqual(r.satisfied, false);
  assert.deepStrictEqual(r.recorded, ["10.0"]);
});

test("a legacy marker (no records) does NOT satisfy an explicit request", () => {
  assert.strictEqual(
    isEmulatorMarkerSatisfied(LEGACY_MARKER, "10.0").satisfied,
    false,
  );
});

test("version matching is exact — no substring or wildcard effects", () => {
  // "1.0" must not match inside "11.0"; "11.0" must not match "11.0-beta".
  const marker = "Platform version: 11.0\nPlatform version: 12.0-beta\n";
  assert.strictEqual(isEmulatorMarkerSatisfied(marker, "1.0").satisfied, false);
  assert.strictEqual(
    isEmulatorMarkerSatisfied(marker, "12.0").satisfied,
    false,
  );
  assert.strictEqual(
    isEmulatorMarkerSatisfied(marker, "12.0-beta").satisfied,
    true,
  );
});

console.log(
  "\n=== isEmulatorMarkerSatisfied — auto-detect (no version) requests ===",
);

test("any completed install satisfies an auto-detect request", () => {
  // The pre-check has no network, so it cannot resolve "latest"; the envelope
  // message lists the recorded platforms and how to request a specific one.
  assert.strictEqual(
    isEmulatorMarkerSatisfied(MODERN_MARKER, "").satisfied,
    true,
  );
  assert.strictEqual(
    isEmulatorMarkerSatisfied(LEGACY_MARKER, "").satisfied,
    true,
  );
});

test("auto-detect result still carries the recorded list for the message", () => {
  const r = isEmulatorMarkerSatisfied(MODERN_MARKER, "");
  assert.deepStrictEqual(r.recorded, ["10.0", "11.0"]);
  assert.deepStrictEqual(
    isEmulatorMarkerSatisfied(LEGACY_MARKER, "").recorded,
    [],
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
