// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Early validation errors must measure duration_ms from the call's own start
 * time (issue #68), the same as the later failures.
 *
 * Date.now() is stubbed so the first call — the function's `startTime` —
 * returns BASE and every later call returns BASE + STEP. An envelope that was
 * given the caller's startTime reports duration_ms === STEP; one that fell
 * back to its own construction time reports 0. This relies on each function
 * under test taking its startTime with the first Date.now() call; keep it
 * the first statement there.
 *
 * plugin-cache is stubbed so no SDK script, sdb or device is touched.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

console.log("=== early-error startTime Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(`     got:      ${actual}\n     expected: ${expected}`);
}

process.env.TIZEN_RDS_ENABLED = "0";

let scriptMissing = false;
let mockApplied = false;
const projectPath = require.resolve("../core/project");
const originalLoad = Module._load;
Module._load = function mockPluginCache(request, parent, isMain) {
  if (request === "./plugin-cache" && parent?.filename === projectPath) {
    mockApplied = true;
    return {
      resolveScript: (name) =>
        scriptMissing
          ? { error: `Script not found: ${name}` }
          : { scriptPath: `/stub/${name}.sh` },
      execPluginScript: () => {
        throw new Error("execPluginScript must not run in this test");
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[projectPath];
const {
  createProject,
  importWgt,
  deleteProject,
  buildProject,
  listTemplates,
  installApp,
} = require("../core/project");
Module._load = originalLoad;

const {
  runPlaywrightTest,
  scaffoldPlaywrightTest,
} = require("../core/playwright-test");

if (!mockApplied) {
  console.log("FAIL plugin-cache mock applied to project.js");
  process.exit(1);
}

const BASE = 1_000_000;
const STEP = 5000;

/** Run fn with the stubbed clock and check the failure's duration_ms. */
async function expectStartTime(name, fn, category) {
  const realNow = Date.now;
  let calls = 0;
  Date.now = () => (calls++ === 0 ? BASE : BASE + STEP);
  let env;
  try {
    env = await fn();
  } finally {
    Date.now = realNow;
  }
  check(`${name}: status`, env && env.status, "failure");
  check(
    `${name}: error_category`,
    env && env.errors && env.errors[0] && env.errors[0].error_category,
    category,
  );
  check(`${name}: duration_ms`, env && env.duration_ms, STEP);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "early-start-time-"));
const touch = (name) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, "");
  return file;
};

(async () => {
  try {
    console.log("installApp");
    await expectStartTime(
      "install: missing packagePath",
      () => installApp(undefined),
      "invalid_parameters",
    );
    await expectStartTime(
      "install: package not found",
      () => installApp(path.join(dir, "Missing-1.0.0.tpk"), "emulator-26101"),
      "io_error",
    );
    const txt = touch("notes.txt");
    await expectStartTime(
      "install: invalid extension",
      () => installApp(txt, "emulator-26101"),
      "invalid_parameters",
    );
    const rpk = touch("Res-1.0.0.rpk");
    await expectStartTime(
      "install: rpk with --run",
      () => installApp(rpk, "emulator-26101", true),
      "invalid_parameters",
    );
    const tpk = touch("MyApp-1.0.0.tpk");
    await expectStartTime(
      "install: invalid serial",
      () => installApp(tpk, "-bad serial"),
      "invalid_parameters",
    );
    const unsafe = touch("My$App-1.0.0.tpk");
    await expectStartTime(
      "install: unsafe package path",
      () => installApp(unsafe, "emulator-26101"),
      "invalid_parameters",
    );
    scriptMissing = true;
    await expectStartTime(
      "install: install script missing",
      () => installApp(tpk, "emulator-26101"),
      "io_error",
    );
    scriptMissing = false;

    console.log("\ncreateProject");
    await expectStartTime(
      "create: missing parameters",
      () => createProject(),
      "invalid_parameters",
    );
    await expectStartTime(
      "create: invalid type",
      () => createProject("bogus", "Basic", dir, "MyTizenApp01"),
      "invalid_parameters",
    );
    await expectStartTime(
      "create: short package id",
      () => createProject("webapp", "Basic", dir, "App"),
      "invalid_parameters",
    );
    await expectStartTime(
      "create: parent missing",
      () =>
        createProject(
          "webapp",
          "Basic",
          path.join(dir, "nope"),
          "MyTizenApp01",
        ),
      "io_error",
    );
    scriptMissing = true;
    await expectStartTime(
      "create: create script missing",
      () => createProject("webapp", "Basic", dir, "MyTizenApp01"),
      "io_error",
    );
    scriptMissing = false;

    console.log("\nimportWgt");
    await expectStartTime(
      "import-wgt: missing parameters",
      () => importWgt(),
      "invalid_parameters",
    );
    const wgt = touch("MyWidget.wgt");
    await expectStartTime(
      "import-wgt: invalid profile",
      () => importWgt(wgt, "mobile", "10.0", dir),
      "invalid_parameters",
    );
    const badName = touch("my-widget.wgt");
    await expectStartTime(
      "import-wgt: invalid file name",
      () => importWgt(badName, "tizen", "10.0", dir),
      "invalid_parameters",
    );
    scriptMissing = true;
    await expectStartTime(
      "import-wgt: import script missing",
      () => importWgt(wgt, "tizen", "10.0", dir),
      "io_error",
    );
    scriptMissing = false;

    console.log("\ndeleteProject / buildProject / listTemplates");
    await expectStartTime(
      "delete: missing projectPath",
      () => deleteProject(),
      "invalid_parameters",
    );
    await expectStartTime(
      "build: missing projectPath",
      () => buildProject(),
      "invalid_parameters",
    );
    await expectStartTime(
      "build: invalid build type",
      () => buildProject(dir, "Profile"),
      "invalid_parameters",
    );
    await expectStartTime(
      "list-templates: invalid type",
      () => listTemplates("bogus"),
      "invalid_parameters",
    );
    scriptMissing = true;
    await expectStartTime(
      "list-templates: script missing",
      () => listTemplates(),
      "io_error",
    );
    scriptMissing = false;

    console.log("\nrunPlaywrightTest / scaffoldPlaywrightTest");
    await expectStartTime(
      "playwright run: missing appId",
      () => runPlaywrightTest(""),
      "invalid_parameters",
    );
    await expectStartTime(
      "playwright run: invalid port",
      () => runPlaywrightTest("good.App", { port: "9222abc" }),
      "invalid_parameters",
    );
    await expectStartTime(
      "playwright scaffold: missing projectDir",
      () => scaffoldPlaywrightTest({}),
      "invalid_parameters",
    );
    await expectStartTime(
      "playwright scaffold: invalid port",
      () => scaffoldPlaywrightTest({ projectDir: dir, port: "1.9" }),
      "invalid_parameters",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${failures ? `${failures} FAILED` : "All tests passed"}`);
  process.exit(failures ? 1 : 0);
})();
