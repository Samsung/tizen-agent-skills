// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS app-install-path.js tests.
 *
 * Verifies manifest parsing and package ID extraction. `getRdsInfoPath()`
 * requires an actual device (it queries `sdb-helper.js`'s `getAppInstallPath()`
 * over SDB), so only its early-exit paths — which don't reach the device — are
 * covered here.
 */

const { join } = require("path");
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require("fs");
const { tmpdir } = require("os");

const aip = require("../core/rds/app-install-path");

console.log("=== rds/app-install-path.js Test ===\n");

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
    // ─── Test: parseManifestPackageId ──────────────────────────────

    console.log("\n=== parseManifestPackageId ===");

    tempDir = mkdtempSync(join(tmpdir(), "rds-test-"));
    projectDir = join(tempDir, "MyApp");
    mkdirSync(projectDir, { recursive: true });

    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://tizen.org/ns/packages" package="com.example.myapp" version="1.0.0">
  <label>My App</label>
</manifest>
`,
    );

    assertEquals(
      "extracts package ID from manifest",
      aip.parseManifestPackageId(projectDir),
      "com.example.myapp",
    );

    // Single quotes
    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      `<manifest xmlns='http://tizen.org/ns/packages' package='com.example.quoted'></manifest>`,
    );
    assertEquals(
      "handles single quotes",
      aip.parseManifestPackageId(projectDir),
      "com.example.quoted",
    );

    // Missing manifest entirely
    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    assertEquals(
      "returns null when manifest missing",
      aip.parseManifestPackageId(projectDir),
      null,
    );

    // Missing package attribute
    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      `<manifest xmlns="http://tizen.org/ns/packages"></manifest>`,
    );
    assertEquals(
      "returns null when package attribute missing",
      aip.parseManifestPackageId(projectDir),
      null,
    );

    // ─── Test: parseWebPackageId ──────────────────────────────────

    console.log("\n=== parseWebPackageId ===");

    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });

    // Reference reads the `package` attribute off <tizen:application>, not <widget id="...">
    writeFileSync(
      join(projectDir, "config.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="MyAppId">
  <tizen:application id="MyAppId.MyApp" package="com.example.webapp" required_version="2.3"/>
</widget>
`,
    );

    assertEquals(
      "extracts package ID from tizen:application",
      aip.parseWebPackageId(projectDir),
      "com.example.webapp",
    );

    // Fallback: tizen:addon
    writeFileSync(
      join(projectDir, "config.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets">
  <tizen:addon id="MyAddon.Addon" package="com.example.addon"/>
</widget>
`,
    );

    assertEquals(
      "falls back to tizen:addon",
      aip.parseWebPackageId(projectDir),
      "com.example.addon",
    );

    // A generic widget id= attribute is NOT the package ID — must not be matched
    writeFileSync(
      join(projectDir, "config.xml"),
      `<widget xmlns="http://www.w3.org/ns/widgets" id="com.example.notthepackage"></widget>`,
    );
    assertEquals(
      "does not mistake widget id= for package ID",
      aip.parseWebPackageId(projectDir),
      null,
    );

    // Missing config.xml
    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    assertEquals(
      "returns null when config.xml missing",
      aip.parseWebPackageId(projectDir),
      null,
    );

    // ─── Test: app IDs (launchable IDs, not package IDs) ──────────

    console.log("\n=== parseWebAppId / parseManifestAppId ===");

    writeFileSync(
      join(projectDir, "config.xml"),
      `<?xml version="1.0"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://example.org/MyApp">
  <tizen:application id="xA4DHr9cFv.MyTizenWebApp" package="xA4DHr9cFv" required_version="6.0"/>
</widget>`,
    );
    assertEquals(
      "web app id is the dotted <tizen:application id>, not the package",
      aip.parseWebAppId(projectDir),
      "xA4DHr9cFv.MyTizenWebApp",
    );
    assertEquals(
      "web package id is still the package attribute",
      aip.parseWebPackageId(projectDir),
      "xA4DHr9cFv",
    );

    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://tizen.org/ns/packages" api-version="6.0" package="org.example.myapp" version="1.0.0">
  <profile name="mobile"/>
  <ui-application appid="org.example.myapp.MyApp" exec="myapp" type="capp" multiple="false">
    <label>MyApp</label>
  </ui-application>
</manifest>`,
    );
    assertEquals(
      "native app id is <ui-application appid>",
      aip.parseManifestAppId(projectDir),
      "org.example.myapp.MyApp",
    );

    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      `<manifest package="org.example.svc">
  <service-application appid="org.example.svc.Service" exec="svc" type="capp"/>
</manifest>`,
    );
    assertEquals(
      "service-application appid is recognized",
      aip.parseManifestAppId(projectDir),
      "org.example.svc.Service",
    );

    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      '<manifest package="org.example.noapp"/>',
    );
    assertEquals(
      "manifest without an application element yields null",
      aip.parseManifestAppId(projectDir),
      null,
    );
    rmSync(join(projectDir, "tizen-manifest.xml"));
    rmSync(join(projectDir, "config.xml"));
    assertEquals(
      "web app id null when config.xml missing",
      aip.parseWebAppId(projectDir),
      null,
    );

    // ─── Test: findManifestPath ────────────────────────────────────

    console.log("\n=== findManifestPath ===");

    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });

    // Native: manifest at project root
    writeFileSync(join(projectDir, "tizen-manifest.xml"), "<manifest/>");
    assertEquals(
      "finds manifest at project root",
      aip.findManifestPath(projectDir),
      join(projectDir, "tizen-manifest.xml"),
    );

    // Dotnet: manifest in a subdirectory paired with a .csproj
    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    const csprojDir = join(projectDir, "MyDotnetApp");
    mkdirSync(csprojDir, { recursive: true });
    writeFileSync(join(csprojDir, "tizen-manifest.xml"), "<manifest/>");
    writeFileSync(join(csprojDir, "MyDotnetApp.csproj"), "<Project/>");

    assertEquals(
      "finds manifest alongside .csproj for dotnet",
      aip.findManifestPath(projectDir),
      join(csprojDir, "tizen-manifest.xml"),
    );

    // Manifest exists in a subdirectory but with no sibling .csproj → not a match
    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    const noCsprojDir = join(projectDir, "SomeDir");
    mkdirSync(noCsprojDir, { recursive: true });
    writeFileSync(join(noCsprojDir, "tizen-manifest.xml"), "<manifest/>");
    assertEquals(
      "ignores manifest without sibling .csproj",
      aip.findManifestPath(projectDir),
      null,
    );

    // No manifest anywhere
    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    assertEquals(
      "returns null when no manifest exists",
      aip.findManifestPath(projectDir),
      null,
    );

    // ─── Test: getRdsInfoPath (early-exit paths only — no device) ──

    console.log("\n=== getRdsInfoPath (early-exit paths) ===");

    // No app type detected (empty project) → null, without touching the device
    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    assertEquals(
      "returns null when app type cannot be detected",
      await aip.getRdsInfoPath(projectDir, "fake-serial"),
      null,
    );

    // App type detected but no manifest → package ID unresolvable → null
    writeFileSync(
      join(projectDir, "config.xml"),
      '<widget xmlns="http://www.w3.org/ns/widgets"></widget>',
    );
    assertEquals(
      "returns null when package ID cannot be parsed",
      await aip.getRdsInfoPath(projectDir, "fake-serial"),
      null,
    );

    // Package ID with device-shell metacharacters → null before any sdb call
    // (the ID is spliced into `cat`/`rm -f` command lines on the device).
    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      '<manifest package="x;reboot"/>',
    );
    assertEquals(
      "returns null for a package ID unsafe for the device shell",
      await aip.getRdsInfoPath(projectDir, "fake-serial", "native", {
        sdbPath: "/nonexistent/sdb-must-not-be-spawned",
      }),
      null,
    );

    // ─── Test: getRdsInfoPath (real device-query success path) ────

    console.log("\n=== getRdsInfoPath (device query, via fake sdb) ===");

    if (process.platform === "win32") {
      // The fake `sdb` fixture is a POSIX shell script spawned via execFile;
      // Windows cannot execute it. CI runs the device-query tests on Linux.
      console.log(
        "SKIP: device-query tests need the POSIX fake sdb fixture (fixtures/rds-sdb-bin/sdb)",
      );
      console.log("\n=== All tests complete ===");
      console.log(`Failures: ${failures}`);
      if (failures > 0) {
        process.exit(1);
      }
      return;
    }

    // Reuses the fake `sdb` binary fixture from rds-sdb.test.js (Part 5) — its
    // "tier1-ok" serial makes `0 getappinstallpath` succeed directly with
    // "/opt/usr/apps", exercising the real appInstallBase + packageId join.
    const FAKE_SDB = join(__dirname, "fixtures", "rds-sdb-bin", "sdb");

    rmSync(projectDir, { force: true, recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "tizen-manifest.xml"),
      '<manifest package="com.example.device"/>',
    );

    assertEquals(
      "joins device app-install base with package ID",
      await aip.getRdsInfoPath(projectDir, "tier1-ok", "native", {
        sdbPath: FAKE_SDB,
      }),
      "/opt/usr/apps/com.example.device",
    );

    // Device query fails entirely (all sdb tiers fail) → null, not a throw
    assertEquals(
      "returns null when device query fails on every tier",
      await aip.getRdsInfoPath(projectDir, "all-fail", "native", {
        sdbPath: FAKE_SDB,
      }),
      null,
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
