// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * installRootstrap() Phase-1 pre-check — .rootstrap-installed handling.
 *
 * Regression: in Claude Code / Cline / Codex (non-pkg) the pre-check cannot run
 * the installer, so the skill tells the agent to re-run this CLI after Phase 2
 * "to verify .rootstrap-installed exists". The non-pkg branch never looked at
 * the marker, so a successful install (marker present, rootstrap copied) kept
 * being reported as "Rootstrap is NOT installed" with a fresh suggested_fix.
 *
 * The marker check must come before the installer hand-off, exactly like the
 * TV SDK ZIP pre-check: marker present → success envelope built from the
 * marker; --force → skip that check and hand back the installer command.
 *
 * HOME / USERPROFILE are pointed at a temp dir BEFORE sdk.js is required, so
 * CONFIG_FILE (~/.tizen.sdk.path.config) resolves inside the sandbox and the
 * developer's real SDK is never touched.
 *
 * Run: node lib/tests/install-rootstrap-precheck.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-rs-precheck-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
delete process.env.TIZEN_SDK_PATH;
delete process.env.TIZEN_SDK_INLINE_INSTALLER;
delete process.pkg;

const sdkPath = path.join(home, "sdk");
fs.mkdirSync(sdkPath, { recursive: true });
fs.writeFileSync(
  path.join(sdkPath, "sdk.info"),
  `TIZEN_SDK_INSTALLED_PATH=${sdkPath}\n`,
);
fs.writeFileSync(path.join(home, ".tizen.sdk.path.config"), sdkPath);

const zipPath = path.join(home, "tizen-11.0-rs-device.core.zip");
fs.writeFileSync(zipPath, "not a real zip - the pre-check never opens it");

const { installRootstrap, parseRootstrapMarker } = require("../core/sdk");

const MARKER = path.join(sdkPath, ".rootstrap-installed");
// Exactly what tizen-install-rootstrap.ps1 writes (Set-Content -Encoding UTF8
// on Windows PowerShell 5.1 → BOM; the .sh variant has no BOM and LF only).
const MARKER_TEXT =
  "\uFEFFRootstrap installed at 2026-09-29T10:12:33.1234567+09:00\r\n" +
  "  - tizen-11.0-device (XML: C:/Users/me/tizen-sdk/tools/smart-build-interface/plugins/tizen-11.0-device.core.xml)\r\n" +
  "Structure: data\r\n";

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
    console.log(`       ${e.stack || e.message}`);
  }
}

// Quiet the "[tizen-sdk] ..." progress lines the pre-check writes to stderr.
const realStderrWrite = process.stderr.write.bind(process.stderr);
function quiet(fn) {
  process.stderr.write = () => true;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      process.stderr.write = realStderrWrite;
    });
}

(async () => {
  console.log("=== installRootstrap pre-check (.rootstrap-installed) ===\n");

  console.log("--- parseRootstrapMarker ---");
  await test("parses the PowerShell marker (BOM + CRLF)", () => {
    const m = parseRootstrapMarker(MARKER_TEXT);
    assert.strictEqual(m.structureType, "data");
    assert.deepStrictEqual(m.rootstraps, [
      {
        profile: "tizen",
        version: "11.0",
        architecture: "device",
        display_name: "tizen-11.0-device",
      },
    ]);
  });

  await test("parses the bash marker (LF, hyphenated profile)", () => {
    const m = parseRootstrapMarker(
      "Rootstrap installed at 2026-09-29T01:00:00Z\n" +
        "  - tv-samsung-8.0-arm (XML: /opt/tizen-studio/tools/smart-build-interface/plugins/tv-samsung-8.0-arm.core.private.20240101120000.xml)\n" +
        "Structure: tizen-studio\n",
    );
    assert.strictEqual(m.structureType, "tizen-studio");
    assert.strictEqual(m.rootstraps.length, 1);
    assert.strictEqual(m.rootstraps[0].profile, "tv-samsung");
    assert.strictEqual(m.rootstraps[0].version, "8.0");
    assert.strictEqual(m.rootstraps[0].architecture, "arm");
  });

  await test("empty / malformed marker yields no rootstraps, unknown structure", () => {
    assert.deepStrictEqual(parseRootstrapMarker(""), {
      rootstraps: [],
      structureType: "unknown",
    });
    assert.deepStrictEqual(parseRootstrapMarker(undefined), {
      rootstraps: [],
      structureType: "unknown",
    });
  });

  await test("uses the installers' own {profile}-{version}-{device} regex", () => {
    // tizen-install-rootstrap.sh/.ps1 build DisplayName with exactly
    // ^(.+)-([0-9]+\.[0-9]+)-([a-zA-Z0-9_]+)$ so a hyphenated profile lands
    // in the greedy first group and the device never contains a hyphen.
    const m = parseRootstrapMarker(
      "Rootstrap installed at x\n" +
        "  - tv-samsung-8.0-device (XML: a.xml)\n" +
        "  - tizen-10.0-emulator64 (XML: b.xml)\n" +
        "  - tizen-9.0-arm_64 (XML: c.xml)\n" +
        "Structure: data\n",
    );
    assert.deepStrictEqual(
      m.rootstraps.map((r) => [r.profile, r.version, r.architecture]),
      [
        ["tv-samsung", "8.0", "device"],
        ["tizen", "10.0", "emulator64"],
        ["tizen", "9.0", "arm_64"],
      ],
    );
  });

  await test("a line the regex cannot split keeps the object shape (nulls)", () => {
    const m = parseRootstrapMarker(
      "Rootstrap installed at x\n  - hand-edited-name (XML: z.xml)\n  -   \nStructure: data\n",
    );
    assert.deepStrictEqual(m.rootstraps, [
      {
        profile: null,
        version: null,
        architecture: null,
        display_name: "hand-edited-name",
      },
    ]);
  });

  await test("blank lines and odd indentation do not merge or drop entries", () => {
    const m = parseRootstrapMarker(
      "Rootstrap installed at x\r\n\r\n\t- tizen-11.0-device (XML: C:\\a-b\\tizen-11.0-device.core.xml)\r\n\r\n" +
        "-tizen-7.0-emulator (XML: /opt/x.xml)\r\n\r\nStructure: tizen-studio\r\n",
    );
    assert.deepStrictEqual(
      m.rootstraps.map((r) => r.display_name),
      ["tizen-11.0-device", "tizen-7.0-emulator"],
    );
    assert.strictEqual(m.structureType, "tizen-studio");
    // The date line and the Structure line must never be taken for entries.
    assert.ok(
      m.rootstraps.every((r) => !/installed at|Structure/.test(r.display_name)),
    );
  });

  console.log("\n--- non-pkg pre-check ---");
  await test("no marker → failure envelope with the installer as suggested_fix", async () => {
    fs.rmSync(MARKER, { force: true });
    const env = await quiet(() => installRootstrap(zipPath, false));
    assert.strictEqual(env.status, "failure", JSON.stringify(env));
    assert.match(env.errors[0].message, /Rootstrap is NOT installed/);
    const fix = env.errors[0].suggested_fix;
    assert.ok(fix && fix.command, "errors[0].suggested_fix.command");
    assert.match(fix.command, /tizen-install-rootstrap\.(ps1|sh)/);
    assert.doesNotMatch(fix.command, /-Force|--force/);
  });

  await test("marker present → success envelope built from the marker (the reported bug)", async () => {
    fs.writeFileSync(MARKER, MARKER_TEXT);
    const env = await quiet(() => installRootstrap(zipPath, false));
    assert.strictEqual(env.status, "success", JSON.stringify(env));
    assert.strictEqual(env.result.installation_status, "completed");
    assert.strictEqual(env.result.structure_type, "data");
    assert.deepStrictEqual(
      env.result.rootstraps.map((r) => r.display_name),
      ["tizen-11.0-device"],
    );
    assert.ok(
      (env.warnings || []).some((w) => /\.rootstrap-installed found/.test(w)),
      `warnings should mention the marker: ${JSON.stringify(env.warnings)}`,
    );
    assert.deepStrictEqual(env.errors || [], []);
  });

  await test("marker present + --force → installer hand-off with the force flag", async () => {
    fs.writeFileSync(MARKER, MARKER_TEXT);
    const env = await quiet(() => installRootstrap(zipPath, true));
    assert.strictEqual(env.status, "failure", JSON.stringify(env));
    // The message must describe the real state: installed, reinstall requested.
    assert.match(
      env.errors[0].message,
      /already installed \(\.rootstrap-installed found\) but --force was given/,
    );
    assert.doesNotMatch(env.errors[0].message, /Rootstrap is NOT installed/);
    assert.match(env.errors[0].suggested_fix.command, /-Force|--force/);
    // --force must not delete the marker itself; that is the installer's job.
    assert.ok(fs.existsSync(MARKER), "marker still present after pre-check");
  });

  await test("no marker + --force → plain NOT installed hand-off with the force flag", async () => {
    fs.rmSync(MARKER, { force: true });
    const env = await quiet(() => installRootstrap(zipPath, true));
    assert.strictEqual(env.status, "failure", JSON.stringify(env));
    assert.match(env.errors[0].message, /^Rootstrap is NOT installed/);
    assert.match(env.errors[0].suggested_fix.command, /-Force|--force/);
  });

  await test("marker present but SDK missing → sdk_path_invalid wins", async () => {
    fs.writeFileSync(MARKER, MARKER_TEXT);
    fs.rmSync(path.join(sdkPath, "sdk.info"));
    try {
      const env = await quiet(() => installRootstrap(zipPath, false));
      assert.strictEqual(env.status, "failure");
      assert.strictEqual(env.errors[0].error_category, "sdk_path_invalid");
    } finally {
      fs.writeFileSync(
        path.join(sdkPath, "sdk.info"),
        `TIZEN_SDK_INSTALLED_PATH=${sdkPath}\n`,
      );
    }
  });

  fs.rmSync(home, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
