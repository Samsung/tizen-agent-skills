// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS device-path-resolver.js tests.
 *
 * Verifies host→device-relative path resolution for native, web, and .NET apps.
 * All resolvers are synchronous and mutate entries in place, matching the
 * reference's `resolveDevicePaths()` (rds-deploy-service.ts).
 */

const { join } = require("path");
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require("fs");
const { tmpdir } = require("os");

const dpr = require("../core/rds/device-path-resolver");

console.log("=== rds/device-path-resolver.js Test ===\n");

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

(() => {
  let tempDir;

  try {
    // ─── Test: stripNativePrefix ──────────────────────────────────

    console.log("\n=== stripNativePrefix ===");

    assertEquals(
      "strips Debug/tpk/ prefix",
      dpr.stripNativePrefix("Debug/tpk/bin/myapp"),
      "bin/myapp",
    );
    assertEquals(
      "strips Release/tpk/ prefix",
      dpr.stripNativePrefix("Release/tpk/lib/libmyapp.so"),
      "lib/libmyapp.so",
    );
    assertEquals(
      "leaves unrelated paths unchanged",
      dpr.stripNativePrefix("bin/myapp"),
      "bin/myapp",
    );
    assertEquals(
      "does not handle ./ prefix variants (matches reference exactly)",
      dpr.stripNativePrefix("./Debug/tpk/bin/app"),
      "./Debug/tpk/bin/app",
    );

    // ─── Test: resolveNativeDevicePaths (tpk_contents present) ────

    console.log("\n=== resolveNativeDevicePaths (with tpk_contents) ===");

    tempDir = mkdtempSync(join(tmpdir(), "rds-test-"));
    const nativeDir = join(tempDir, "NativeApp");
    const debugDir = join(nativeDir, "Debug");
    mkdirSync(debugDir, { recursive: true });

    // tpk_contents format: "sourceRelToDebug || .tpk/destPath"
    writeFileSync(
      join(debugDir, "tpk_contents"),
      JSON.stringify([
        "tpk/bin/myapp || .tpk/bin/myapp",
        "tpk/lib/libcore.so || .tpk/lib/libcore.so",
      ]),
    );

    const nativeEntries = [
      { path: "Debug/tpk/bin/myapp", type: "modify" },
      { path: "Debug/tpk/lib/libcore.so", type: "add" },
    ];

    dpr.resolveNativeDevicePaths(nativeEntries, nativeDir);

    assertEquals(
      "native: resolves via tpk_contents mapping",
      nativeEntries[0].devicePath,
      "bin/myapp",
    );
    assertEquals(
      "native: second entry resolves",
      nativeEntries[1].devicePath,
      "lib/libcore.so",
    );
    assertEquals("native: preserves type", nativeEntries[0].type, "modify");
    assertEquals(
      "native: preserves original path",
      nativeEntries[0].path,
      "Debug/tpk/bin/myapp",
    );

    // Entry not covered by tpk_contents → throws
    let threw = false;
    try {
      dpr.resolveNativeDevicePaths(
        [{ path: "Debug/tpk/res/unknown.xml", type: "modify" }],
        nativeDir,
      );
    } catch {
      threw = true;
    }
    check("native: throws when tpk_contents has no mapping for path", threw);

    // ─── Test: resolveNativeDevicePaths (tpk_contents missing → fallback) ───

    console.log(
      "\n=== resolveNativeDevicePaths (fallback, no tpk_contents) ===",
    );

    const nativeNoTpkDir = join(tempDir, "NativeAppNoTpk");
    mkdirSync(join(nativeNoTpkDir, "Debug"), { recursive: true });

    const fallbackEntries = [{ path: "Debug/tpk/bin/myapp", type: "modify" }];
    dpr.resolveNativeDevicePaths(fallbackEntries, nativeNoTpkDir);
    assertEquals(
      "native: falls back to stripNativePrefix when tpk_contents absent",
      fallbackEntries[0].devicePath,
      "bin/myapp",
    );

    // ─── Test: resolveWebDevicePaths ──────────────────────────────

    console.log("\n=== resolveWebDevicePaths ===");

    const webDir = join(tempDir, "WebApp");
    mkdirSync(webDir, { recursive: true });

    const webEntries = [
      { path: "Debug/projects/WebApp/index.html", type: "modify" },
      { path: "Debug/projects/WebApp/js/app.js", type: "add" },
    ];

    dpr.resolveWebDevicePaths(webEntries, webDir);

    assertEquals(
      "web: re-roots under res/wgt/",
      webEntries[0].devicePath,
      "res/wgt/index.html",
    );
    assertEquals(
      "web: preserves nested paths",
      webEntries[1].devicePath,
      "res/wgt/js/app.js",
    );
    assertEquals("web: preserves type", webEntries[1].type, "add");

    // projectName derived from basename(projectDir), not the entry path
    let webThrew = false;
    try {
      dpr.resolveWebDevicePaths(
        [{ path: "Debug/projects/SomeOtherName/index.html", type: "modify" }],
        webDir,
      );
    } catch {
      webThrew = true;
    }
    check(
      "web: throws when path prefix does not match project basename",
      webThrew,
    );

    // ─── Test: resolveDotnetDevicePaths ───────────────────────────

    console.log("\n=== resolveDotnetDevicePaths ===");

    const dotnetEntries = [
      { path: "bin/Debug/net8.0/tpkroot/bin/app.exe", type: "modify" },
      { path: "bin/Debug/net8.0/tpkroot/lib/mylib.dll", type: "add" },
    ];

    dpr.resolveDotnetDevicePaths(dotnetEntries);

    assertEquals(
      "dotnet: strips up to and including tpkroot/",
      dotnetEntries[0].devicePath,
      "bin/app.exe",
    );
    assertEquals(
      "dotnet: second entry resolves",
      dotnetEntries[1].devicePath,
      "lib/mylib.dll",
    );
    assertEquals("dotnet: preserves type", dotnetEntries[0].type, "modify");

    // indexOf-based search — matches even with an unusual prefix in front of tpkroot/
    const looseDotnetEntry = [
      { path: "some/custom/path/tpkroot/bin/app.exe", type: "modify" },
    ];
    dpr.resolveDotnetDevicePaths(looseDotnetEntry);
    assertEquals(
      "dotnet: permissive indexOf search matches reference",
      looseDotnetEntry[0].devicePath,
      "bin/app.exe",
    );

    let dotnetThrew = false;
    try {
      dpr.resolveDotnetDevicePaths([
        { path: "bin/Debug/net8.0/somewhereelse/bin/app.exe", type: "modify" },
      ]);
    } catch {
      dotnetThrew = true;
    }
    check("dotnet: throws when path does not contain tpkroot/", dotnetThrew);

    // ─── Test: resolveDevicePaths (dispatcher) ────────────────────

    console.log("\n=== resolveDevicePaths (dispatcher) ===");

    const dispatchNativeEntries = [
      { path: "Debug/tpk/bin/myapp", type: "modify" },
    ];
    dpr.resolveDevicePaths(dispatchNativeEntries, nativeDir, "native");
    assertEquals(
      "dispatches to native resolver",
      dispatchNativeEntries[0].devicePath,
      "bin/myapp",
    );

    const dispatchWebEntries = [
      { path: "Debug/projects/WebApp/index.html", type: "modify" },
    ];
    dpr.resolveDevicePaths(dispatchWebEntries, webDir, "web");
    assertEquals(
      "dispatches to web resolver",
      dispatchWebEntries[0].devicePath,
      "res/wgt/index.html",
    );

    const dispatchDotnetEntries = [
      { path: "bin/Debug/net8.0/tpkroot/bin/app.exe", type: "modify" },
    ];
    dpr.resolveDevicePaths(dispatchDotnetEntries, tempDir, "dotnet");
    assertEquals(
      "dispatches to dotnet resolver",
      dispatchDotnetEntries[0].devicePath,
      "bin/app.exe",
    );

    // Unknown app type → fallback devicePath = path
    const unknownEntries = [{ path: "some/random/path", type: "modify" }];
    dpr.resolveDevicePaths(unknownEntries, tempDir, "unknown");
    assertEquals(
      "unknown app type falls back to devicePath = path",
      unknownEntries[0].devicePath,
      "some/random/path",
    );

    // Function returns undefined (mutates in place, matches reference's `: void`)
    const voidCheckEntries = [{ path: "Debug/tpk/bin/myapp", type: "modify" }];
    const returnValue = dpr.resolveDevicePaths(
      voidCheckEntries,
      nativeDir,
      "native",
    );
    check(
      "resolveDevicePaths returns undefined (mutates in place)",
      returnValue === undefined,
    );
    check(
      "mutation is visible on the original array",
      voidCheckEntries[0].devicePath === "bin/myapp",
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
