// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * downloadEmulatorPackage() pre-check — on-disk emulator images in the envelope
 *
 * The .emulator-package-installed marker only records installs made by this
 * skill; the SDK / TV SDK / platform installers also ship emulator images and
 * never write it. The pre-check therefore scans
 * platforms/tizen-X.Y/<profile>/emulator-images/ once and must report that
 * scan consistently on every branch it can reach without running an installer:
 *
 *   - marker satisfied           → success, result.installed_images + warning
 *   - marker missing             → failure (suggested_fix), one
 *                                  errors[0].details line per image
 *   - marker not recording the
 *     requested version          → same failure shape, details still present
 *
 * The inline-install branch (pkg / TIZEN_SDK_INLINE_INSTALLER=1) runs the real
 * installer and is covered by the s2-sdk-installers integration phase instead.
 *
 * downloadEmulatorPackage() reads ~/.tizen.sdk.path.config (resolved once at
 * require time via os.homedir()), so HOME / USERPROFILE are pointed at a temp
 * sandbox BEFORE the module is required. The real user config is never touched.
 *
 * Run: node lib/tests/emulator-package-precheck.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const sandboxHome = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-emu-precheck-home-"),
);
const savedHome = process.env.HOME;
const savedUserprofile = process.env.USERPROFILE;
const savedInline = process.env.TIZEN_SDK_INLINE_INSTALLER;
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;
// Keep the not-installed branch on the suggested_fix path — never run an installer here.
delete process.env.TIZEN_SDK_INLINE_INSTALLER;

// Must come AFTER the env redirect: CONFIG_FILE is computed at require time.
const {
  CONFIG_FILE,
  downloadEmulatorPackage,
  listInstalledEmulatorImages,
  comparePlatformVersions,
} = require("../core/sdk");

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message}`);
  }
}

// Keep the pre-check's own progress lines out of the test output.
const realConsoleError = console.error;
console.error = () => {};

const sdkPath = path.join(sandboxHome, "tizen-sdk");
const marker = path.join(sdkPath, ".emulator-package-installed");
const mk = (...segs) =>
  fs.mkdirSync(path.join(sdkPath, ...segs), { recursive: true });

const EXPECTED_IMAGES = [
  { platform: "10.0", profile: "tizen", image: "tizen-10.0-x86_64" },
  { platform: "10.0", profile: "tv-samsung", image: "tv-samsung-10.0-x86_64" },
  { platform: "11.0", profile: "tizen", image: "tizen-11.0-x86_64" },
];
// errors[].details is a list of diagnostic lines — Envelope drops any other
// shape — so the failure path carries the scan as one line per image.
const EXPECTED_DETAILS = [
  "tizen-10.0-x86_64 (platform 10.0, profile tizen)",
  "tv-samsung-10.0-x86_64 (platform 10.0, profile tv-samsung)",
  "tizen-11.0-x86_64 (platform 11.0, profile tizen)",
];
const ON_DISK_NOTE =
  "Emulator images on disk: 10.0 (tizen, tv-samsung), 11.0 (tizen).";

(async () => {
  try {
    console.log("=== sandbox guard ===");
    const expectedConfig = path.join(sandboxHome, ".tizen.sdk.path.config");
    assert.strictEqual(CONFIG_FILE, expectedConfig);
    if (CONFIG_FILE !== expectedConfig) {
      throw new Error(
        `refusing to run: CONFIG_FILE=${CONFIG_FILE} is outside the sandbox`,
      );
    }
    console.log("  ok   CONFIG_FILE resolved inside the sandbox");

    // Fixture SDK: sdk.info + the same layout the field host had — 10.0
    // images from the SDK / TV SDK installers, 11.0 from this skill.
    fs.mkdirSync(sdkPath, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, `${sdkPath}\n`);
    fs.writeFileSync(
      path.join(sdkPath, "sdk.info"),
      `TIZEN_SDK_INSTALLED_PATH=${sdkPath}\nTIZEN_SDK_DATA_PATH=${sdkPath}-data\n`,
    );
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
    mk("platforms", "tizen-9.0", "tizen", "rootstraps");

    console.log("\n=== comparePlatformVersions ===");

    await test("orders numerically: 5.5 < 9.0 < 10.0 < 10.5 < 11.0", () => {
      const shuffled = ["10.5", "11.0", "9.0", "10.0", "5.5"];
      assert.deepStrictEqual(shuffled.sort(comparePlatformVersions), [
        "5.5",
        "9.0",
        "10.0",
        "10.5",
        "11.0",
      ]);
    });

    await test("equal versions compare as 0 (stable secondary keys apply)", () => {
      assert.strictEqual(comparePlatformVersions("10.0", "10.0"), 0);
    });

    console.log("\n=== marker missing → failure carries the on-disk scan ===");

    await test("status failure with suggested_fix, not success", async () => {
      const env = await downloadEmulatorPackage("");
      assert.strictEqual(env.status, "failure");
      assert.strictEqual(env.errors[0].error_category, "execution_error");
      assert.ok(env.errors[0].suggested_fix?.command, "suggested_fix.command");
    });

    await test("errors[0].details carries one line per image from the disk scan", async () => {
      const env = await downloadEmulatorPackage("");
      assert.deepStrictEqual(env.errors[0].details, EXPECTED_DETAILS);
      assert.strictEqual(
        env.errors[0].details.length,
        listInstalledEmulatorImages(sdkPath).length,
      );
    });

    await test("message names the on-disk images, joined with a single space", async () => {
      const env = await downloadEmulatorPackage("");
      const msg = env.errors[0].message;
      assert.ok(
        msg.includes(
          `Emulator package is NOT installed. This pre-check CLI cannot install it. ${ON_DISK_NOTE} `,
        ),
        msg,
      );
      assert.ok(!msg.includes("..") && !msg.includes("  "), msg);
    });

    console.log(
      "\n=== marker records 11.0 only → auto-detect request is satisfied ===",
    );
    fs.writeFileSync(
      marker,
      [
        "Emulator package installed at 2026-09-29T23:34:40+09:00",
        "Target: TIZEN-11.0-Emulator",
        "Platform version: 11.0",
        "",
      ].join("\n"),
    );

    await test("success; result.installed_images lists 10.0 too, not just 11.0", async () => {
      const env = await downloadEmulatorPackage("");
      assert.strictEqual(env.status, "success");
      assert.deepStrictEqual(env.result.installed_images, EXPECTED_IMAGES);
      assert.deepStrictEqual(env.result.packages, [
        { name: "TIZEN-Emulator", status: "installed", version: "emulator" },
      ]);
    });

    await test("warning separates 'Recorded by this skill' from 'on disk'", async () => {
      const env = await downloadEmulatorPackage("");
      const w = env.warnings[0];
      assert.ok(w.includes("Recorded by this skill: 11.0. " + ON_DISK_NOTE), w);
      assert.ok(!w.includes("Recorded platform(s)"), w);
    });

    await test("explicit 11.0 is satisfied and still carries the full scan", async () => {
      const env = await downloadEmulatorPackage("11.0");
      assert.strictEqual(env.status, "success");
      assert.strictEqual(env.result.packages[0].name, "TIZEN-11.0-Emulator");
      assert.deepStrictEqual(env.result.installed_images, EXPECTED_IMAGES);
    });

    console.log(
      "\n=== marker records 11.0 only → explicit 10.0 falls through, scan intact ===",
    );

    await test("10.0 not recorded → failure, but details show the 10.0 images on disk", async () => {
      const env = await downloadEmulatorPackage("10.0");
      assert.strictEqual(env.status, "failure");
      assert.ok(env.errors[0].suggested_fix?.command.includes("10.0"));
      assert.deepStrictEqual(env.errors[0].details, EXPECTED_DETAILS);
      assert.ok(env.errors[0].message.includes(ON_DISK_NOTE));
    });

    console.log("\n=== --force ignores the marker but keeps the scan ===");

    await test("force → not-installed path with the same details", async () => {
      const env = await downloadEmulatorPackage("", true);
      assert.strictEqual(env.status, "failure");
      assert.deepStrictEqual(env.errors[0].details, EXPECTED_DETAILS);
    });

    console.log("\n=== no images on disk → 'none' on both branches ===");
    fs.rmSync(path.join(sdkPath, "platforms"), {
      recursive: true,
      force: true,
    });

    await test("marker present, no images → success with [] and 'none'", async () => {
      const env = await downloadEmulatorPackage("");
      assert.strictEqual(env.status, "success");
      assert.deepStrictEqual(env.result.installed_images, []);
      assert.ok(env.warnings[0].includes("Emulator images on disk: none."));
    });

    await test("marker absent, no images → failure, no details, 'none' in message", async () => {
      fs.rmSync(marker, { force: true });
      const env = await downloadEmulatorPackage("");
      assert.strictEqual(env.status, "failure");
      // An empty diagnostic list is dropped by Envelope — the message says it.
      assert.strictEqual(env.errors[0].details, undefined);
      assert.ok(
        env.errors[0].message.includes("Emulator images on disk: none."),
      );
    });
  } finally {
    console.error = realConsoleError;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserprofile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserprofile;
    if (savedInline === undefined)
      delete process.env.TIZEN_SDK_INLINE_INSTALLER;
    else process.env.TIZEN_SDK_INLINE_INSTALLER = savedInline;
    fs.rmSync(sandboxHome, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
