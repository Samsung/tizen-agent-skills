// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Pins the argument strings installApp() hands to tizen-install-app (.ps1 /
 * .sh), so a refactor of how they are assembled cannot change them silently.
 *
 * Runs against a stubbed plugin-cache with RDS disabled and an explicit
 * device serial, so no SDK, sdb or device is touched.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

console.log("=== install-app args Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(`     got:      ${actual}\n     expected: ${expected}`);
}

process.env.TIZEN_RDS_ENABLED = "0";

const calls = [];
let mockApplied = false;
const projectPath = require.resolve("../core/project");
const originalLoad = Module._load;
Module._load = function mockPluginCache(request, parent, isMain) {
  if (request === "./plugin-cache" && parent?.filename === projectPath) {
    mockApplied = true;
    return {
      resolveScript: () => ({ scriptPath: "/stub/tizen-install-app.sh" }),
      execPluginScript: (_script, winArgs, unixArgs) => {
        calls.push({ winArgs, unixArgs });
        return "Installation completed successfully\nDevice Serial: emulator-26101\n";
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[projectPath];
const { installApp } = require("../core/project");
Module._load = originalLoad;

if (!mockApplied) {
  console.log("FAIL plugin-cache mock applied to project.js");
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "install-app-args-"));
const pkg = path.join(dir, "MyApp-1.0.0.tpk");
fs.writeFileSync(pkg, "");
const winPkg = pkg.replace(/\\/g, "/");

(async () => {
  calls.length = 0;
  let r = await installApp(pkg, "emulator-26101", false);
  check("install succeeds", r.status, "success");
  check(
    "unix args: package and serial",
    calls[0] && calls[0].unixArgs,
    `-p "${pkg}" -s "emulator-26101"`,
  );
  check(
    "win args: package and serial",
    calls[0] && calls[0].winArgs,
    `-PackagePath "${winPkg}" -DeviceSerial "emulator-26101"`,
  );

  calls.length = 0;
  r = await installApp(pkg, "emulator-26101", true);
  check("install --run succeeds", r.status, "success");
  check(
    "unix args: --run adds -r last",
    calls[0] && calls[0].unixArgs,
    `-p "${pkg}" -s "emulator-26101" -r`,
  );
  check(
    "win args: --run adds -RunAfterInstall last",
    calls[0] && calls[0].winArgs,
    `-PackagePath "${winPkg}" -DeviceSerial "emulator-26101" -RunAfterInstall`,
  );

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${failures ? `${failures} FAILED` : "All tests passed"}`);
  process.exit(failures ? 1 : 0);
})();
