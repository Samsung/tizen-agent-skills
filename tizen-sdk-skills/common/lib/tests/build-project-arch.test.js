// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * buildProject() --arch: the GBS target architecture of a Platform project.
 *
 *   - armv7l / aarch64 / i586 / x86_64 reach the build script as --arch="<arch>"
 *   - no --arch builds x86_64 (the emulator target)
 *   - a near miss ("arm", "arm64", "armv7") is rejected with
 *     invalid_parameters before the script runs, and the message names the
 *     accepted values
 *   - a non-default --arch on a non-Platform project is ignored with a
 *     warning; the x86_64 default (which tizen-cli always passes) is silent
 *
 * plugin-cache and the signing preflight are stubbed, so no SDK, GBS or
 * device is touched; the stub script "produces" one package per run.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

console.log("=== build-project --arch Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(`     got:      ${actual}\n     expected: ${expected}`);
}

process.env.TIZEN_RDS_ENABLED = "0";

const calls = [];
let outputDir = null;
const projectPath = require.resolve("../core/project");
const originalLoad = Module._load;
Module._load = function mockBuildDeps(request, parent, isMain) {
  if (parent?.filename === projectPath) {
    if (request === "./plugin-cache") {
      return {
        resolveScript: () => ({ scriptPath: "/stub/tizen-build-project.sh" }),
        execPluginScript: (_script, winArgs, unixArgs) => {
          calls.push({ winArgs, unixArgs });
          const pkg = path.join(outputDir, `app-${calls.length}.rpm`);
          fs.writeFileSync(pkg, "");
          // File times tick coarser than Date.now() on some filesystems (NTFS
          // ~15 ms), so a package written right after startTime can carry an
          // older mtime and be skipped as stale. Date it clearly after.
          const later = new Date(Date.now() + 60000);
          fs.utimesSync(pkg, later, later);
          return "Build completed\n";
        },
      };
    }
    if (request === "./certificate") {
      return { preflightSigningProfile: () => ({ valid: true }) };
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[projectPath];
const { buildProject } = require("../core/project");
Module._load = originalLoad;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-arch-"));
const platform = path.join(root, "MyPlatformApp");
fs.mkdirSync(path.join(platform, "packaging"), { recursive: true });
fs.writeFileSync(path.join(platform, "CMakeLists.txt"), "");
fs.writeFileSync(path.join(platform, "packaging", "app.spec"), "");
const native = path.join(root, "MyNativeApp01");
fs.mkdirSync(native);
fs.writeFileSync(path.join(native, "tizen_native_project.yaml"), "");

const archOf = (call) => (/--arch="([^"]*)"/.exec(call.unixArgs) || [])[1];

(async () => {
  try {
    outputDir = platform;
    for (const arch of ["armv7l", "aarch64", "i586", "x86_64"]) {
      calls.length = 0;
      const r = await buildProject(platform, "Debug", undefined, arch);
      check(`platform --arch ${arch}: success`, r.status, "success");
      check(
        `platform --arch ${arch}: script gets --arch="${arch}"`,
        calls[0] && archOf(calls[0]),
        arch,
      );
    }

    calls.length = 0;
    let r = await buildProject(platform, "Debug");
    check("platform, no --arch: success", r.status, "success");
    check(
      "platform, no --arch: script gets the x86_64 default",
      calls[0] && archOf(calls[0]),
      "x86_64",
    );
    check(
      "platform, no --arch: no arch warning",
      (r.warnings || []).some((w) => w.includes("--arch")),
      false,
    );

    for (const arch of ["arm", "arm64", "armv7", "ARMV7L", "x86_64;id"]) {
      calls.length = 0;
      r = await buildProject(platform, "Debug", undefined, arch);
      check(`--arch ${arch}: rejected`, r.status, "failure");
      const error = (r.errors && r.errors[0]) || {};
      check(
        `--arch ${arch}: invalid_parameters`,
        error.error_category,
        "invalid_parameters",
      );
      check(
        `--arch ${arch}: message lists the accepted values`,
        /armv7l, aarch64, i586, x86_64/.test(error.message || ""),
        true,
      );
      check(`--arch ${arch}: script not run`, calls.length, 0);
    }

    outputDir = native;
    calls.length = 0;
    r = await buildProject(native, "Debug", undefined, "armv7l");
    check("native --arch armv7l: success", r.status, "success");
    check(
      "native --arch armv7l: warns that --arch was ignored",
      (r.warnings || []).some((w) => /--arch armv7l was ignored/.test(w)),
      true,
    );
    calls.length = 0;
    r = await buildProject(native, "Debug");
    check(
      "native, no --arch: no arch warning",
      (r.warnings || []).some((w) => w.includes("--arch")),
      false,
    );
    // tizen-cli always passes its --arch default, so x86_64 must stay silent.
    calls.length = 0;
    r = await buildProject(native, "Debug", undefined, "x86_64");
    check(
      "native --arch x86_64 (tizen-cli default): success",
      r.status,
      "success",
    );
    check(
      "native --arch x86_64 (tizen-cli default): no arch warning",
      (r.warnings || []).some((w) => w.includes("--arch")),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(`\n${failures ? `${failures} FAILED` : "All tests passed"}`);
  process.exit(failures ? 1 : 0);
})();
