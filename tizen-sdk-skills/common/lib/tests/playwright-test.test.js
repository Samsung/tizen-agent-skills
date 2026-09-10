// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * playwright-test tests
 *
 * Covers the environment-independent surface of the tizen-playwright-test
 * stack — NO device, SDK, network, or real playwright install is needed:
 *   - parseTestSummary: pure marker parsing of the template output contract
 *   - template renderers: encode the Tizen attach-only rules (no goto/newPage,
 *     early console listener, real exit codes) and stay syntactically valid
 *   - runPlaywrightTest validation: every bad-param path returns an
 *     invalid_parameters envelope BEFORE any dependency/device access
 *   - dependency check → dependency_missing BEFORE any CDP access
 *   - run outcomes via a playwright stub + local /json/version HTTP server and
 *     --no-setup: success / test_failed / ECONNREFUSED refinement / timeout
 *   - scaffoldPlaywrightTest: file creation, overwrite guard, package.json
 *     preservation
 *   - playwright-test-cli.js spawned as a child process: usage errors →
 *     STDERR JSON, core errors → envelope on STDOUT, scaffold end-to-end
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {
  runPlaywrightTest,
  scaffoldPlaywrightTest,
  parseTestSummary,
  resolveNodeRuntime,
} = require("../core/playwright-test");
const {
  renderTestTemplate,
  renderPackageJson,
} = require("../core/playwright-test-template");

console.log("=== playwright-test Test ===\n");

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

// Test 1: parseTestSummary marker parsing
console.log("Test 1: parseTestSummary");
check(
  "  pass marker (legacy, no errors field)",
  parseTestSummary("PASS a\nTEST_RESULT: pass total=3 failed=0\n"),
  { result: "pass", total: 3, failed: 0, passed: 3, errors: 0 },
);
check(
  "  fail marker (legacy, no errors field)",
  parseTestSummary("FAIL b\nTEST_RESULT: fail total=2 failed=1\n"),
  { result: "fail", total: 2, failed: 1, passed: 1, errors: 0 },
);
check(
  "  errors field parsed",
  parseTestSummary("TEST_RESULT: fail total=2 failed=0 errors=1\n"),
  { result: "fail", total: 2, failed: 0, passed: 2, errors: 1 },
);
check(
  "  errors=0 on a passing marker",
  parseTestSummary("TEST_RESULT: pass total=2 failed=0 errors=0\n"),
  { result: "pass", total: 2, failed: 0, passed: 2, errors: 0 },
);
check(
  "  CRLF line endings",
  parseTestSummary("TEST_RESULT: pass total=1 failed=0 errors=0\r\n"),
  { result: "pass", total: 1, failed: 0, passed: 1, errors: 0 },
);
check(
  "  log noise around the marker",
  parseTestSummary(
    "[app console:log] clicked\nPASS x\nTEST_RESULT: fail total=5 failed=2\nSaved screenshot: test-failure.png\n",
  ),
  { result: "fail", total: 5, failed: 2, passed: 3, errors: 0 },
);
check(
  "  marker must be at line start",
  parseTestSummary("echo TEST_RESULT: pass total=1 failed=0 done\n"),
  null,
);
check("  missing marker → null", parseTestSummary("PASS a\nPASS b\n"), null);
check("  empty output → null", parseTestSummary(""), null);

// Test 2: template renderers encode the Tizen rules
console.log("\nTest 2: template renderers");
{
  const tpl = renderTestTemplate({ appId: "abcDEF1234.MyWebApp", port: 9223 });
  check("  connects over CDP", tpl.includes("connectOverCDP"), true);
  check(
    "  reads TIZEN_CDP_ENDPOINT env",
    tpl.includes("TIZEN_CDP_ENDPOINT"),
    true,
  );
  check(
    "  baked-in fallback port",
    tpl.includes("http://127.0.0.1:9223"),
    true,
  );
  check(
    "  baked-in fallback app id",
    tpl.includes("abcDEF1234.MyWebApp"),
    true,
  );
  check("  sets a real exit code", tpl.includes("process.exit"), true);
  check("  prints the TEST_RESULT marker", tpl.includes("TEST_RESULT:"), true);
  // The template's comments legitimately WARN about these calls — strip
  // comment lines so only actual code is probed for forbidden patterns.
  const tplCode = tpl
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  check(
    "  attach-only: no page.goto call",
    tplCode.includes("page.goto("),
    false,
  );
  check("  attach-only: no newPage call", tplCode.includes("newPage("), false);
  check(
    "  no console.assert call (never fails the process)",
    tplCode.includes("console.assert"),
    false,
  );
  check(
    "  pageerror counted separately from assertions",
    tplCode.includes("pageErrors++"),
    true,
  );
  check(
    "  pageerror handler does not touch the assertion counter",
    /page\.on\('pageerror'[\s\S]{0,120}failed\+\+/.test(tplCode),
    false,
  );
  check("  marker reports the page-error count", tpl.includes("errors="), true);
  check(
    "  console listener registered before the first assertion",
    tpl.indexOf("page.on('console'") < tpl.indexOf("await expect("),
    true,
  );
  // Must be valid JS — syntax-check without executing (no playwright needed).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pwtpl-"));
  const tplFile = path.join(tmp, "t.js");
  fs.writeFileSync(tplFile, tpl, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", tplFile], {
    encoding: "utf8",
  });
  check("  template is syntactically valid JS", syntax.status, 0);
  fs.rmSync(tmp, { recursive: true, force: true });

  const pkg = JSON.parse(renderPackageJson({ name: "pwtest" }));
  check("  package.json name", pkg.name, "pwtest");
  check(
    "  package.json declares playwright",
    Boolean(pkg.dependencies && pkg.dependencies.playwright),
    true,
  );
  check("  package.json is private", pkg.private, true);
}

// Test 3: runPlaywrightTest parameter validation (returns before dependency/device access)
console.log("\nTest 3: runPlaywrightTest validation");

async function validationCategory(name, args, expectedFragment) {
  const env = await runPlaywrightTest(...args);
  check(`  ${name}: status`, env.status, "failure");
  check(
    `  ${name}: error_category`,
    env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
  if (expectedFragment) {
    check(
      `  ${name}: message mentions offending value`,
      Boolean(env.errors && env.errors[0].message.includes(expectedFragment)),
      true,
    );
  }
}

(async () => {
  // A real dir with a real test file, so only the probed parameter is at fault.
  const validDir = fs.mkdtempSync(path.join(os.tmpdir(), "pwvalid-"));
  const validTest = path.join(validDir, "ok.test.js");
  fs.writeFileSync(validTest, "process.exit(0);\n", "utf8");
  const V = { testFile: validTest };

  await validationCategory("missing appId", [undefined]);
  await validationCategory("shell metachars in appId", ["bad;id", V], "bad;id");
  await validationCategory("space in appId", ["bad id", V], "bad id");
  await validationCategory(
    "quote in serial",
    ["good.App", { ...V, serial: 'emu"lator' }],
    'emu"lator',
  );
  await validationCategory("port 0", ["good.App", { ...V, port: 0 }], "0");
  await validationCategory(
    "port 70000",
    ["good.App", { ...V, port: 70000 }],
    "70000",
  );
  await validationCategory(
    "non-numeric port",
    ["good.App", { ...V, port: "abc" }],
    "abc",
  );
  await validationCategory(
    "setup-timeout 0",
    ["good.App", { ...V, setupTimeout: 0 }],
    "0",
  );
  await validationCategory(
    "setup-timeout 999",
    ["good.App", { ...V, setupTimeout: 999 }],
    "999",
  );
  await validationCategory(
    "timeout 0",
    ["good.App", { ...V, timeout: 0 }],
    "0",
  );
  await validationCategory(
    "timeout 9999",
    ["good.App", { ...V, timeout: 9999 }],
    "9999",
  );
  await validationCategory(
    "missing test file",
    ["good.App", { projectDir: validDir }],
    "--scaffold",
  );
  await validationCategory(
    "nonexistent --test-file",
    ["good.App", { testFile: path.join(validDir, "nope.test.js") }],
    "nope.test.js",
  );
  {
    const tsFile = path.join(validDir, "typed.test.ts");
    fs.writeFileSync(tsFile, "// ts\n", "utf8");
    await validationCategory(
      "non-JS extension",
      ["good.App", { testFile: tsFile }],
      "typed.test.ts",
    );
  }

  // Test 4: external Node runtime is used instead of the tizen-cli host executable
  console.log("\nTest 4: external Node runtime");
  {
    const runtime = resolveNodeRuntime();
    check(
      "  runtime resolved",
      Boolean(runtime.executable && runtime.version && !runtime.error),
      true,
    );
    check(
      "  runtime does not use process.execPath",
      runtime.executable === process.execPath,
      false,
    );
  }

  // Test 5: dependency check fires BEFORE any CDP/device access
  console.log("\nTest 5: dependency_missing");
  {
    // validDir has no node_modules/playwright; skipSetup would probe the
    // endpoint — the dependency check must reject first, proving order.
    const env = await runPlaywrightTest("good.App", {
      testFile: validTest,
      skipSetup: true,
    });
    check("  status", env.status, "failure");
    check(
      "  error_category",
      env.errors && env.errors[0].error_category,
      "dependency_missing",
    );
    check(
      "  suggested_fix says npm install",
      Boolean(
        env.errors &&
        env.errors[0].suggested_fix &&
        String(env.errors[0].suggested_fix.command).includes(
          "npm install playwright",
        ),
      ),
      true,
    );
  }

  // Test 5: run outcomes (playwright stub + local /json/version server + --no-setup)
  console.log("\nTest 6: run outcomes via stub project");
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "pwstub-"));
  const stubPkgDir = path.join(stubDir, "node_modules", "playwright");
  fs.mkdirSync(stubPkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(stubPkgDir, "package.json"),
    '{"name":"playwright","version":"0.0.0-stub","main":"index.js"}\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(stubPkgDir, "index.js"),
    "module.exports = {};\n",
    "utf8",
  );

  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end('{"Browser":"Stub/1.0"}');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  // 5a. Passing test → success envelope, env vars visible to the child
  {
    const testFile = path.join(stubDir, "pass.test.js");
    fs.writeFileSync(
      testFile,
      "console.log('endpoint=' + process.env.TIZEN_CDP_ENDPOINT);\n" +
        "console.log('app=' + process.env.TIZEN_APP_ID);\n" +
        "console.log('PASS smoke');\n" +
        "console.log('TEST_RESULT: pass total=2 failed=0');\n" +
        "process.exit(0);\n",
      "utf8",
    );
    const env = await runPlaywrightTest("good.App", {
      testFile,
      skipSetup: true,
      port,
    });
    check("  pass: status", env.status, "success");
    check("  pass: exit_code", env.result && env.result.exit_code, 0);
    check("  pass: passed", env.result && env.result.passed, true);
    check("  pass: summary parsed", env.result && env.result.summary, {
      result: "pass",
      total: 2,
      failed: 0,
      passed: 2,
      errors: 0,
    });
    check(
      "  pass: child saw TIZEN_CDP_ENDPOINT",
      Boolean(
        env.result &&
        env.result.output_tail &&
        env.result.output_tail.includes(`endpoint=http://127.0.0.1:${port}`),
      ),
      true,
    );
    check(
      "  pass: child saw TIZEN_APP_ID",
      Boolean(
        env.result &&
        env.result.output_tail &&
        env.result.output_tail.includes("app=good.App"),
      ),
      true,
    );
  }

  // 5b. Failing test → test_failed with summary detail
  {
    const testFile = path.join(stubDir, "fail.test.js");
    fs.writeFileSync(
      testFile,
      "console.error('FAIL broken thing — boom');\n" +
        "console.log('TEST_RESULT: fail total=2 failed=1');\n" +
        "process.exit(1);\n",
      "utf8",
    );
    const env = await runPlaywrightTest("good.App", {
      testFile,
      skipSetup: true,
      port,
    });
    check("  fail: status", env.status, "failure");
    check(
      "  fail: error_category",
      env.errors && env.errors[0].error_category,
      "test_failed",
    );
    check(
      "  fail: message counts assertions",
      Boolean(env.errors && env.errors[0].message.includes("1/2")),
      true,
    );
  }

  // 5b2. Page errors only (assertions all pass) → still fails, message names them
  {
    const testFile = path.join(stubDir, "pageerror.test.js");
    fs.writeFileSync(
      testFile,
      "console.error('[app pageerror] boom');\n" +
        "console.log('TEST_RESULT: fail total=2 failed=0 errors=1');\n" +
        "process.exit(1);\n",
      "utf8",
    );
    const env = await runPlaywrightTest("good.App", {
      testFile,
      skipSetup: true,
      port,
    });
    check("  pageerror: status", env.status, "failure");
    check(
      "  pageerror: error_category",
      env.errors && env.errors[0].error_category,
      "test_failed",
    );
    check(
      "  pageerror: message names the page errors",
      Boolean(env.errors && env.errors[0].message.includes("1 page error")),
      true,
    );
    check(
      "  pageerror: message keeps the assertion count",
      Boolean(env.errors && env.errors[0].message.includes("0/2")),
      true,
    );
  }

  // 5c. ECONNREFUSED in the child output → refined to inspector_not_available
  {
    const testFile = path.join(stubDir, "refused.test.js");
    fs.writeFileSync(
      testFile,
      "console.error('Error: connect ECONNREFUSED 127.0.0.1:' + process.env.TIZEN_CDP_PORT);\n" +
        "process.exit(1);\n",
      "utf8",
    );
    const env = await runPlaywrightTest("good.App", {
      testFile,
      skipSetup: true,
      port,
    });
    check("  refused: status", env.status, "failure");
    check(
      "  refused: error_category",
      env.errors && env.errors[0].error_category,
      "inspector_not_available",
    );
  }

  // 5d. Hanging test → killed at --timeout → test_timeout
  {
    const testFile = path.join(stubDir, "hang.test.js");
    fs.writeFileSync(testFile, "setTimeout(() => {}, 30000);\n", "utf8");
    const env = await runPlaywrightTest("good.App", {
      testFile,
      skipSetup: true,
      port,
      timeout: 1,
    });
    check("  hang: status", env.status, "failure");
    check(
      "  hang: error_category",
      env.errors && env.errors[0].error_category,
      "test_timeout",
    );
  }

  // 5f. Output flood past maxBuffer → ENOBUFS kill → io_error, NOT test_timeout
  // (the kill sets run.signal too, which the timeout branch must not swallow)
  {
    const testFile = path.join(stubDir, "flood.test.js");
    fs.writeFileSync(
      testFile,
      "const chunk = Buffer.alloc(1024 * 1024, 97);\n" +
        "for (let i = 0; i < 12; i++) process.stdout.write(chunk);\n",
      "utf8",
    );
    const env = await runPlaywrightTest("good.App", {
      testFile,
      skipSetup: true,
      port,
      timeout: 60,
    });
    check("  flood: status", env.status, "failure");
    check(
      "  flood: error_category",
      env.errors && env.errors[0].error_category,
      "io_error",
    );
    check(
      "  flood: message mentions the capture limit",
      Boolean(env.errors && env.errors[0].message.includes("10 MiB")),
      true,
    );
  }

  // 5e. Dead endpoint with --no-setup → inspector_not_available before spawning
  {
    const testFile = path.join(stubDir, "pass.test.js");
    server.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const env = await runPlaywrightTest("good.App", {
      testFile,
      skipSetup: true,
      port,
    });
    check("  dead endpoint: status", env.status, "failure");
    check(
      "  dead endpoint: error_category",
      env.errors && env.errors[0].error_category,
      "inspector_not_available",
    );
  }

  // Test 6: scaffoldPlaywrightTest
  console.log("\nTest 6: scaffoldPlaywrightTest");
  {
    const env = await scaffoldPlaywrightTest({});
    check("  missing projectDir: status", env.status, "failure");
    check(
      "  missing projectDir: error_category",
      env.errors && env.errors[0].error_category,
      "invalid_parameters",
    );
  }
  {
    const env = await scaffoldPlaywrightTest({
      projectDir: path.join(stubDir, "no-such-dir"),
    });
    check("  nonexistent projectDir: status", env.status, "failure");
  }
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pwscaf-"));
    const env = await scaffoldPlaywrightTest({
      projectDir: dir,
      appId: "abcDEF1234.MyWebApp",
    });
    check("  fresh dir: status", env.status, "success");
    check(
      "  fresh dir: test file created",
      fs.existsSync(path.join(dir, "tizen-playwright.test.js")),
      true,
    );
    check(
      "  fresh dir: package.json created",
      fs.existsSync(path.join(dir, "package.json")),
      true,
    );
    check(
      "  fresh dir: created[] has 2 entries",
      env.result && env.result.created.length,
      2,
    );
    check(
      "  fresh dir: next_steps mention npm install",
      Boolean(
        env.result &&
        env.result.next_steps.some((s) => s.includes("npm install playwright")),
      ),
      true,
    );

    // Refuses to overwrite without force
    const again = await scaffoldPlaywrightTest({ projectDir: dir });
    check("  overwrite refused: status", again.status, "failure");
    check(
      "  overwrite refused: message mentions --force",
      Boolean(again.errors && again.errors[0].message.includes("--force")),
      true,
    );

    // force overwrites the test file, leaves the existing package.json alone
    fs.writeFileSync(
      path.join(dir, "package.json"),
      '{"name":"mine"}\n',
      "utf8",
    );
    const forced = await scaffoldPlaywrightTest({
      projectDir: dir,
      force: true,
    });
    check("  force: status", forced.status, "success");
    check(
      "  force: existing package.json untouched",
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
      '{"name":"mine"}\n',
    );
    check(
      "  force: warning about existing package.json",
      Boolean(
        forced.warnings &&
        forced.warnings.some((w) => w.includes("package.json")),
      ),
      true,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pwscaf-"));
    const env = await scaffoldPlaywrightTest({
      projectDir: dir,
      appId: "bad;id",
    });
    check("  bad appId: status", env.status, "failure");
    check(
      "  bad appId: error_category",
      env.errors && env.errors[0].error_category,
      "invalid_parameters",
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Test 7: playwright-test-cli.js CLI contract (spawned; no device access needed)
  console.log("\nTest 7: playwright-test-cli.js contract");
  const CLI = path.join(__dirname, "..", "cli", "playwright-test-cli.js");

  function runCliProc(args) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      timeout: 30000,
    });
    return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
  }

  // 7a. Missing --app-id → core validation → Standard JSON Envelope on STDOUT
  {
    const r = runCliProc([]);
    check("  no args: exit code", r.status, 1);
    let env = null;
    try {
      env = JSON.parse(r.stdout);
    } catch (_e) {
      /* handled by checks below */
    }
    check("  no args: stdout is JSON", env !== null, true);
    check("  no args: status", env && env.status, "failure");
    check(
      "  no args: error_category",
      env && env.errors && env.errors[0].error_category,
      "invalid_parameters",
    );
    check(
      "  no args: suggested_fix present",
      Boolean(env && env.errors && env.errors[0].suggested_fix),
      true,
    );
  }

  // 7b. Unknown option → usage envelope on STDERR, empty STDOUT
  {
    const r = runCliProc(["--bogus", "x"]);
    check("  unknown option: exit code", r.status, 1);
    check("  unknown option: stdout empty", r.stdout.trim(), "");
    let env = null;
    try {
      env = JSON.parse(r.stderr);
    } catch (_e) {
      /* handled by checks below */
    }
    check("  unknown option: stderr is JSON", env !== null, true);
    check(
      "  unknown option: code",
      env && env.errors && env.errors[0].code,
      "invalid_parameters",
    );
  }

  // 7c. Positional calling convention → rejected with usage envelope
  {
    const r = runCliProc(["abcDEF1234.MyWebApp"]);
    check("  positional args: exit code", r.status, 1);
    let env = null;
    try {
      env = JSON.parse(r.stderr);
    } catch (_e) {
      /* handled by checks below */
    }
    check(
      "  positional args: message says unexpected",
      Boolean(env && env.errors[0].message.includes("Unexpected argument(s)")),
      true,
    );
  }

  // 7d. --scaffold end-to-end (no device needed — real CI-safe happy path)
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pwcli-"));
    const r = runCliProc([
      "--scaffold",
      "--project-dir",
      dir,
      "--app-id",
      "abcDEF1234.MyWebApp",
    ]);
    check("  scaffold: exit code", r.status, 0);
    let env = null;
    try {
      env = JSON.parse(r.stdout);
    } catch (_e) {
      /* handled by checks below */
    }
    check("  scaffold: stdout is JSON", env !== null, true);
    check("  scaffold: status", env && env.status, "success");
    check(
      "  scaffold: command",
      env && env.command,
      "tizen-sdk playwright-test scaffold",
    );
    check(
      "  scaffold: file exists",
      fs.existsSync(path.join(dir, "tizen-playwright.test.js")),
      true,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 7e. --scaffold without --project-dir → core envelope on STDOUT
  {
    const r = runCliProc(["--scaffold"]);
    check("  scaffold no dir: exit code", r.status, 1);
    let env = null;
    try {
      env = JSON.parse(r.stdout);
    } catch (_e) {
      /* handled by checks below */
    }
    check(
      "  scaffold no dir: error_category",
      env && env.errors && env.errors[0].error_category,
      "invalid_parameters",
    );
  }

  fs.rmSync(validDir, { recursive: true, force: true });
  fs.rmSync(stubDir, { recursive: true, force: true });

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
