// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * installApp() points to tizen-dlog-analyzer when a launched app does not
 * keep running:
 *
 *   - --run and APP_RUNNING=no (exited right after start) → hint warning
 *   - --run and no "App launched successfully" (launch failed) → hint warning
 *   - --run and APP_RUNNING=yes, or install only → no hint
 *   - an .rpk is never launched, so --run without a launch line → no hint
 *   - the hint names the app id, or <app-id> when the script did not print one
 *
 * Runs against a stubbed plugin-cache with RDS disabled and an explicit
 * device serial, so no SDK, sdb or device is touched.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

console.log("=== install-app log hint Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(`     got:      ${actual}\n     expected: ${expected}`);
}

process.env.TIZEN_RDS_ENABLED = "0";

let scriptOutput = "";
const projectPath = require.resolve("../core/project");
const originalLoad = Module._load;
Module._load = function mockPluginCache(request, parent, isMain) {
  if (request === "./plugin-cache" && parent?.filename === projectPath) {
    return {
      resolveScript: () => ({ scriptPath: "/stub/tizen-install-app.sh" }),
      execPluginScript: () => scriptOutput,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[projectPath];
const { installApp } = require("../core/project");
Module._load = originalLoad;

const INSTALLED =
  "Installation completed successfully\nDevice Serial: emulator-26101\n";
const APP_ID = "org.example.myapp";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "install-app-log-hint-"));
const tpk = path.join(dir, "MyApp-1.0.0.tpk");
const rpk = path.join(dir, "MyRes-1.0.0.rpk");
fs.writeFileSync(tpk, "");
fs.writeFileSync(rpk, "");

const hintOf = (r) =>
  (r.warnings || []).find((w) => w.includes("tizen-dlog-analyzer")) || null;

(async () => {
  try {
    scriptOutput = `${INSTALLED}Found app ID: ${APP_ID}\nApp launched successfully\nAPP_RUNNING=no\n`;
    let r = await installApp(tpk, "emulator-26101", true);
    check("exited right after start: success", r.status, "success");
    const hint = hintOf(r);
    check("exited right after start: hint present", Boolean(hint), true);
    check(
      "hint names the startup flow and the app id",
      Boolean(
        hint && hint.includes(`start start-monitoring → app-launch ${APP_ID}`),
      ),
      true,
    );
    check(
      "the /opt warning still comes first",
      (r.warnings[0] || "").startsWith("App launched but exited immediately"),
      true,
    );

    scriptOutput = `${INSTALLED}Found app ID: ${APP_ID}\n[ERROR] App launch failed for id '${APP_ID}'\n`;
    r = await installApp(tpk, "emulator-26101", true);
    check("launch failed: hint present", Boolean(hintOf(r)), true);

    scriptOutput = `${INSTALLED}[ERROR] App launch failed\n`;
    r = await installApp(tpk, "emulator-26101", true);
    check(
      "no app id: hint uses <app-id>",
      Boolean(hintOf(r) && hintOf(r).includes("app-launch <app-id>")),
      true,
    );

    scriptOutput = `${INSTALLED}Found app ID: ${APP_ID}\nApp launched successfully\nAPP_RUNNING=yes\n`;
    r = await installApp(tpk, "emulator-26101", true);
    check("app running: no hint", hintOf(r), null);

    scriptOutput = `${INSTALLED}Found app ID: ${APP_ID}\n`;
    r = await installApp(tpk, "emulator-26101", false);
    check("install only: no hint", hintOf(r), null);

    scriptOutput = INSTALLED;
    r = await installApp(rpk, "emulator-26101", true);
    check(".rpk with --run: no hint", hintOf(r), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${failures ? `${failures} FAILED` : "All tests passed"}`);
  process.exit(failures ? 1 : 0);
})();
