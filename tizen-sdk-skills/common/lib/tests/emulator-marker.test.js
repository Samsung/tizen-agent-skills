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
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseEmulatorMarkerPlatforms,
  isEmulatorMarkerSatisfied,
  listInstalledEmulatorImages,
  describeEmulatorImages,
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

console.log("\n=== listInstalledEmulatorImages — what is actually on disk ===");

// The marker only records installs made by tizen-download-emulator-package.
// The SDK / TV SDK / platform installers also ship emulator images but never
// write that marker, so a 10.0 image installed by tizen-sdk-install was
// invisible to the pre-check and the envelope read as "only 11.0 installed".
function withFixtureSdk(fn) {
  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), "emu-images-"));
  try {
    const mk = (...segs) =>
      fs.mkdirSync(path.join(sdk, ...segs), { recursive: true });
    mk(
      "platforms",
      "tizen-11.0",
      "tizen",
      "emulator-images",
      "tizen-11.0-x86_64",
    );
    mk(
      "platforms",
      "tizen-10.0",
      "tizen",
      "emulator-images",
      "tizen-10.0-x86_64",
    );
    mk(
      "platforms",
      "tizen-10.0",
      "tv-samsung",
      "emulator-images",
      "tv-samsung-10.0-x86_64",
    );
    // Platform present but no emulator image → contributes nothing.
    mk("platforms", "tizen-9.0", "tizen", "rootstraps");
    // Non-platform siblings that must be ignored.
    mk("platforms", "common", "tizen", "emulator-images", "not-a-platform");
    mk("platforms", "tv-samsung-9.0", "emulator-images", "wrong-layout");
    // Stray FILES where directories are expected must be skipped, not crash.
    fs.writeFileSync(path.join(sdk, "platforms", "tizen-12.0"), "");
    fs.writeFileSync(
      path.join(
        sdk,
        "platforms",
        "tizen-10.0",
        "tizen",
        "emulator-images",
        "README.txt",
      ),
      "",
    );
    fn(sdk);
  } finally {
    fs.rmSync(sdk, { recursive: true, force: true });
  }
}

test("lists every platform/profile/image dir, sorted by version then profile", () => {
  withFixtureSdk((sdk) => {
    assert.deepStrictEqual(listInstalledEmulatorImages(sdk), [
      { platform: "10.0", profile: "tizen", image: "tizen-10.0-x86_64" },
      {
        platform: "10.0",
        profile: "tv-samsung",
        image: "tv-samsung-10.0-x86_64",
      },
      { platform: "11.0", profile: "tizen", image: "tizen-11.0-x86_64" },
    ]);
  });
});

test("sorts numerically, not lexically (9.0 < 10.0)", () => {
  withFixtureSdk((sdk) => {
    fs.mkdirSync(
      path.join(
        sdk,
        "platforms",
        "tizen-9.0",
        "tizen",
        "emulator-images",
        "tizen-9.0-x86_64",
      ),
      { recursive: true },
    );
    assert.deepStrictEqual(
      listInstalledEmulatorImages(sdk).map((i) => i.platform),
      ["9.0", "10.0", "10.0", "11.0"],
    );
  });
});

test("missing SDK / platforms dir / empty path yields []", () => {
  assert.deepStrictEqual(listInstalledEmulatorImages(""), []);
  assert.deepStrictEqual(listInstalledEmulatorImages(undefined), []);
  assert.deepStrictEqual(
    listInstalledEmulatorImages(path.join(os.tmpdir(), "does-not-exist-emu")),
    [],
  );
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "emu-bare-"));
  try {
    assert.deepStrictEqual(listInstalledEmulatorImages(bare), []);
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

console.log("\n=== describeEmulatorImages — the warning text ===");

test("groups profiles under each platform", () => {
  assert.strictEqual(
    describeEmulatorImages([
      { platform: "10.0", profile: "tizen", image: "a" },
      { platform: "10.0", profile: "tv-samsung", image: "b" },
      { platform: "11.0", profile: "tizen", image: "c" },
    ]),
    "10.0 (tizen, tv-samsung), 11.0 (tizen)",
  );
});

test("dedupes a profile listed twice for the same platform", () => {
  assert.strictEqual(
    describeEmulatorImages([
      { platform: "10.0", profile: "tizen", image: "x86_64" },
      { platform: "10.0", profile: "tizen", image: "aarch64" },
    ]),
    "10.0 (tizen)",
  );
});

test("empty / missing list reads as 'none'", () => {
  assert.strictEqual(describeEmulatorImages([]), "none");
  assert.strictEqual(describeEmulatorImages(undefined), "none");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
