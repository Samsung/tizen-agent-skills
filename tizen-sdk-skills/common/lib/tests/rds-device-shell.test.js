// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure (no spawn, runs on every OS) tests for the RDS review follow-ups:
 *
 *   - rds/device-shell.js — allowlist + single-quoting for arguments that
 *     `sdb shell` re-parses through the device's /bin/sh
 *   - project.js isRdsTrackedPackage() — RDS only engages for a package inside
 *     the Debug output tree the scanners actually track
 *   - state-manager.js replaceNextChanges() — the CLI reconcile replaces the
 *     pending `next` group instead of composing onto a stale one
 *   - state-manager.js resetAllRdsState() — reports whether the directory is
 *     really gone
 */

const path = require("path");
const fs = require("fs");
const os = require("os");

const {
  isSafeDevicePath,
  isSafePackageId,
  assertDevicePathSafe,
  quoteDeviceArg,
} = require("../core/rds/device-shell");
const { isRdsTrackedPackage } = require("../core/project");
const sm = require("../core/rds/state-manager");

console.log("=== rds device-shell / install gate / next-group Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

console.log("Test 1: isSafeDevicePath");
for (const good of [
  "/opt/usr/apps/org.example.app",
  "/home/owner/apps_rw/abcdefghij/.rds_deploy_marker",
  "bin/myapp",
  "res/wgt/js/app-1.2.3.min.js",
  "lib/libfoo+bar@2=x,y.so",
]) {
  check(`accepts ${good}`, isSafeDevicePath(good), true);
}
for (const bad of [
  "res/my icon.png",
  "res/pages/[id].js",
  "bin/x|reboot",
  "bin/x>etc",
  "bin/evil;rm",
  "bin/$(reboot)",
  "bin/`reboot`",
  "bin/it's",
  'bin/say"hi"',
  "bin/a\\b",
  "bin/a\nb",
  "../../etc/passwd",
  "bin/../../../etc/passwd",
  "",
  null,
  42,
]) {
  check(`rejects ${JSON.stringify(bad)}`, isSafeDevicePath(bad), false);
}

console.log("\nTest 2: isSafePackageId");
check("dotted id", isSafePackageId("org.example.myapp"), true);
check("10-char id", isSafePackageId("abcdefghij"), true);
check("underscore/hyphen", isSafePackageId("my_app-2"), true);
check("semicolon", isSafePackageId("x;reboot"), false);
check("slash", isSafePackageId("a/b"), false);
check("space", isSafePackageId("a b"), false);
check("empty", isSafePackageId(""), false);

console.log("\nTest 3: assertDevicePathSafe");
let threw = null;
try {
  assertDevicePathSafe("res/my icon.png", "delete path");
} catch (err) {
  threw = err.message;
}
check(
  "throws with the noun and the offending value",
  threw,
  'delete path contains characters unsafe for the device shell: "res/my icon.png"',
);
threw = null;
try {
  assertDevicePathSafe("bin/myapp");
} catch (err) {
  threw = err.message;
}
check("does not throw for a safe path", threw, null);

console.log("\nTest 4: quoteDeviceArg");
check("plain", quoteDeviceArg("/opt/usr/apps/x"), "'/opt/usr/apps/x'");
check("space stays one word", quoteDeviceArg("a b"), "'a b'");
check("embedded single quote", quoteDeviceArg("it's"), `'it'\\''s'`);
check("glob is literal", quoteDeviceArg("[id].js"), "'[id].js'");
check("non-string coerced", quoteDeviceArg(7), "'7'");

console.log("\nTest 5: isRdsTrackedPackage");
const proj = path.resolve(os.tmpdir(), "RdsGateProj");
check(
  "native Debug package",
  isRdsTrackedPackage(proj, path.join(proj, "Debug", "App.tpk")),
  true,
);
check(
  "web Debug package",
  isRdsTrackedPackage(proj, path.join(proj, "Debug", "App.wgt")),
  true,
);
check(
  "dotnet bin/Debug/<tfm> package",
  isRdsTrackedPackage(
    proj,
    path.join(proj, "bin", "Debug", "net6.0-tizen", "App.tpk"),
  ),
  true,
);
check(
  "dotnet nested csproj dir",
  isRdsTrackedPackage(
    proj,
    path.join(proj, "MyApp", "bin", "Debug", "net6.0-tizen", "App.tpk"),
  ),
  true,
);
check(
  "Release package is not tracked",
  isRdsTrackedPackage(proj, path.join(proj, "Release", "App.tpk")),
  false,
);
check(
  "Test build is not tracked",
  isRdsTrackedPackage(proj, path.join(proj, "Test", "App.tpk")),
  false,
);
check(
  "package at project root is not tracked",
  isRdsTrackedPackage(proj, path.join(proj, "App.tpk")),
  false,
);
check(
  "file merely named Debug.tpk is not tracked",
  isRdsTrackedPackage(proj, path.join(proj, "out", "Debug.tpk")),
  false,
);
check(
  "package outside the project is not tracked",
  isRdsTrackedPackage(proj, path.join(os.tmpdir(), "Other", "Debug", "A.tpk")),
  false,
);
check(
  "package in a different Debug-named ancestor outside project",
  isRdsTrackedPackage(
    path.join(proj, "sub"),
    path.join(proj, "Debug", "A.tpk"),
  ),
  false,
);

console.log("\nTest 6: replaceNextChanges / resetAllRdsState");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rds-next-"));
try {
  sm.clearCaches();
  sm.replaceNextChanges(tmp, []);
  check(
    "empty replace on no changelist writes nothing",
    sm.loadChangelist(tmp),
    null,
  );

  sm.addChanges(tmp, [{ path: "res/stale.txt", type: "delete" }]);
  sm.replaceNextChanges(tmp, [{ path: "bin/app", type: "modify" }]);
  check(
    "replace discards the previous next group",
    sm.loadChangelist(tmp).deploys["next"],
    [{ path: "bin/app", type: "modify" }],
  );

  sm.replaceNextChanges(tmp, []);
  check(
    "empty replace removes next",
    sm.loadChangelist(tmp).deploys["next"],
    undefined,
  );

  sm.saveState(tmp, { projectDir: tmp, nextDeployId: 1, devices: {} });
  check("state exists before reset", sm.rdsStateExists(tmp), true);
  check(
    "reset returns true when the directory is gone",
    sm.resetAllRdsState(tmp),
    true,
  );
  check("state gone after reset", sm.rdsStateExists(tmp), false);
  check(
    "reset on an already-clean project is still true",
    sm.resetAllRdsState(tmp),
    true,
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
