// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Playwright test domain: run (or scaffold) Playwright tests against a Tizen
 * Web app (.wgt) over CDP.
 *
 * The flow reuses setupWebappDebug() for the device half (debug-mode relaunch,
 * RWI port forward, CDP verification) and then spawns `node <testFile>` in the
 * test project directory. Playwright resolves from the TEST PROJECT's
 * node_modules — this module must NEVER require('playwright'): esbuild inlines
 * common/lib into the tizen-cli bundle and Playwright cannot live there.
 *
 * Step order is deliberate: everything that needs no device (validation, test
 * file resolution, dependency check) fails fast BEFORE the CDP setup, which
 * also lets CI unit-test those paths without a device or network.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");
const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { setupWebappDebug } = require("./webapp-debug");
const { summarizeOutput } = require("./output-summary");
const {
  renderTestTemplate,
  renderPackageJson,
} = require("./playwright-test-template");

const DEFAULT_TEST_FILE = "tizen-playwright.test.js";

/**
 * Parse the "TEST_RESULT: pass|fail total=N failed=M [errors=K]" marker the
 * scaffolded template prints as its last line. errors=K counts page runtime
 * errors (pageerror) separately from assertion failures; older scaffolds
 * without it parse with errors: 0. User-supplied test files may not print the
 * marker at all — the exit code stays the source of truth; this is extra
 * detail only.
 *
 * @param {string} output - test child stdout+stderr
 * @returns {{result: string, total: number, failed: number, passed: number, errors: number}|null}
 */
function parseTestSummary(output) {
  const text = String(output || "");
  const m = text.match(
    /^TEST_RESULT:\s*(pass|fail)\s+total=(\d+)\s+failed=(\d+)(?:\s+errors=(\d+))?\s*$/m,
  );
  if (!m) return null;
  const total = parseInt(m[2], 10);
  const failed = parseInt(m[3], 10);
  const errors = m[4] ? parseInt(m[4], 10) : 0;
  return { result: m[1], total, failed, passed: total - failed, errors };
}

/**
 * Keep only key lines from the test child output for envelope warnings.
 */
function summarizeTestOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|not found|missing|not reachable|ECONNREFUSED/i,
    skip: /^(PASS |TEST_RESULT:)/,
    max: 10,
  });
}

/**
 * Last non-empty lines of the child output — enough context to see what the
 * test printed without shipping the whole log in the envelope.
 */
function outputTail(output, maxLines = 30) {
  const lines = String(output || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.slice(-maxLines);
}

const NODE_PROBE_TIMEOUT_MS = 15000;

/**
 * Resolve the external Node.js runtime used for project-local Playwright work.
 *
 * The tizen-cli distribution may be a standalone executable, where
 * process.execPath is tizen-cli.exe rather than node.exe. Never use that host
 * executable to evaluate JavaScript or launch a project test file.
 *
 * A failure carries a `reason` that tells the two very different situations
 * apart — they used to share one "not found on PATH (exit N)" message, and the
 * parenthesised exit code was the only clue that the executable HAD been found:
 *   not_found     - no `node` executable on PATH (spawn ENOENT)
 *   spawn_failed  - the executable exists but could not be started (EACCES,
 *                   EPERM, sandbox refusal, …)
 *   timeout       - `node --version` did not answer within NODE_PROBE_TIMEOUT_MS
 *   exited        - `node --version` ran but exited non-zero / on a signal —
 *                   a broken installation (missing DLL, wrong architecture,
 *                   corrupted files), not a missing one
 *
 * @param {{executable?: string, spawn?: typeof spawnSync}} [deps] - test seams
 * @returns {{executable: string, version: string}|{error: string, reason: string, detail: string|null, exit_code: number|null, signal: string|null}}
 */
function resolveNodeRuntime(deps = {}) {
  const executable =
    deps.executable || (process.platform === "win32" ? "node.exe" : "node");
  const spawn = deps.spawn || spawnSync;
  const probe = spawn(executable, ["--version"], {
    encoding: "utf8",
    timeout: NODE_PROBE_TIMEOUT_MS,
    windowsHide: true,
  });

  if (probe.error) {
    const code = probe.error.code || "";
    const reason =
      code === "ENOENT"
        ? "not_found"
        : code === "ETIMEDOUT"
          ? "timeout"
          : "spawn_failed";
    return {
      error: probe.error.message || code || "spawn failed",
      reason,
      detail: null,
      exit_code: null,
      signal: null,
    };
  }
  if (probe.status !== 0) {
    // A killed child has status null and a signal; a timeout kill is SIGTERM.
    const timedOut = probe.status === null && probe.signal === "SIGTERM";
    const stderrTail = String(probe.stderr || "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-5)
      .join(" | ");
    return {
      error:
        probe.status !== null
          ? `exit ${probe.status}`
          : `signal ${probe.signal || "unknown"}`,
      reason: timedOut ? "timeout" : "exited",
      detail: stderrTail || null,
      exit_code: probe.status,
      signal: probe.signal || null,
    };
  }
  return { executable, version: String(probe.stdout || "").trim() };
}

/**
 * Envelope fields for a resolveNodeRuntime() failure — one message per reason,
 * so "install Node" is only ever the advice when Node is actually missing.
 *
 * @param {{error: string, reason: string, detail?: string|null, exit_code?: number|null, signal?: string|null}} rt
 * @param {string} [executable] - the probed executable name
 * @returns {{category: string, message: string, suggestedFix: string}}
 */
function describeNodeRuntimeFailure(rt, executable) {
  const exe =
    executable || (process.platform === "win32" ? "node.exe" : "node");
  const detail = rt.detail ? ` stderr: ${rt.detail}.` : "";
  switch (rt.reason) {
    case "not_found":
      return {
        category: "node_not_found",
        message:
          `Node.js executable "${exe}" was not found on PATH (${rt.error}). ` +
          "Playwright tests run in an external Node.js process, not in this CLI. " +
          "Install Node.js 20 or newer, or add its bin directory to PATH, then retry.",
        suggestedFix:
          "Install Node.js 20 or newer (https://nodejs.org/) and ensure node is on PATH.",
      };
    case "timeout":
      return {
        category: "execution_error",
        message:
          `Node.js executable "${exe}" is on PATH but "${exe} --version" did not answer within ${NODE_PROBE_TIMEOUT_MS / 1000} s (${rt.error}).${detail} ` +
          "The runtime is present but hangs on start — check for a stuck antivirus/EDR scan, a broken PATH shim, or a corrupted installation, then retry.",
        suggestedFix: `Run "${exe} --version" in a terminal; if it hangs there too, reinstall Node.js 20 or newer.`,
      };
    case "exited":
      return {
        category: "execution_error",
        message:
          `Node.js executable "${exe}" is on PATH but "${exe} --version" exited abnormally (${rt.error}).${detail} ` +
          "Node.js is installed but this installation does not run — typically a missing DLL/shared library, an architecture mismatch (x64 vs arm64), or corrupted files. " +
          "Repair or reinstall Node.js 20 or newer, then retry. Do not install a second copy first.",
        suggestedFix: `Run "${exe} --version" in a terminal to see the error, then repair/reinstall Node.js 20 or newer.`,
      };
    default:
      return {
        category: "execution_error",
        message:
          `Node.js executable "${exe}" is on PATH but could not be started (${rt.error}).${detail} ` +
          "The file exists but the OS refused to run it (permissions, a sandbox policy, or a corrupted binary). Fix that, then retry.",
        suggestedFix: `Check that "${exe}" is executable and allowed to run, then retry.`,
      };
  }
}

/**
 * Probe an already-live CDP endpoint (--no-setup mode).
 * @returns {Promise<boolean>} true when /json/version answers
 */
function probeCdpEndpoint(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/json/version", timeout: 3000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

/**
 * Parse a whole-number option with a default, accepted only within [1, max].
 * The whole value must be digits — parseInt() alone would turn "9222abc" into
 * 9222, "1.9" into 1 and "30s" into 30 and run with a value nobody typed.
 * @returns {number|null} the value, or null when it is not an in-range whole number
 */
function parseBoundedInt(raw, defaultValue, max) {
  const text = String(raw === undefined ? defaultValue : raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= max ? n : null;
}

/**
 * Step 1 of runPlaywrightTest: parameter validation (same style as
 * setupWebappDebug).
 *
 * @returns {{serial: string, port: number, setupTimeout: number, timeout: number}|{failure: object}}
 */
function validateRunOptions(appId, opts, command, startTime) {
  const invalid = (message, suggestedCommand = null) => ({
    failure: formatError(
      command,
      "invalid_parameters",
      message,
      suggestedCommand,
      startTime,
    ),
  });
  if (!appId) {
    return invalid(
      "Missing required parameter: appId",
      'runPlaywrightTest("abcDEF1234.MyWebApp", { projectDir: "./pwtest" })',
    );
  }
  // Allow only safe characters in shell args
  if (!/^[A-Za-z0-9._-]+$/.test(appId)) {
    return invalid(`Invalid app id: ${appId}`);
  }
  const serial = opts.serial || "";
  if (serial && !/^[A-Za-z0-9._:-]+$/.test(serial)) {
    return invalid(`Invalid serial: ${serial}`);
  }
  const port = parseBoundedInt(opts.port, 9222, 65535);
  if (port === null) return invalid(`Invalid port: ${opts.port}`);
  const setupTimeout = parseBoundedInt(opts.setupTimeout, 30, 300);
  if (setupTimeout === null) {
    return invalid(
      `Invalid setup-timeout: ${opts.setupTimeout}. Must be 1-300 seconds.`,
    );
  }
  const timeout = parseBoundedInt(opts.timeout, 120, 600);
  if (timeout === null) {
    return invalid(`Invalid timeout: ${opts.timeout}. Must be 1-600 seconds.`);
  }
  return { serial, port, setupTimeout, timeout };
}

/**
 * Step 2 of runPlaywrightTest: resolve the test file and project dir.
 *
 * @returns {{testFile: string, projectDir: string}|{failure: object}}
 */
function resolveTestTarget(opts, command, startTime) {
  const invalid = (message) => ({
    failure: formatError(
      command,
      "invalid_parameters",
      message,
      null,
      startTime,
    ),
  });
  let projectDir = opts.projectDir ? path.resolve(opts.projectDir) : null;
  let testFile = opts.testFile ? path.resolve(opts.testFile) : null;
  if (!testFile) {
    projectDir = projectDir || process.cwd();
    testFile = path.join(projectDir, DEFAULT_TEST_FILE);
    if (!fs.existsSync(testFile)) {
      return invalid(
        `No test file found (looked for ${testFile}). Pass --test-file <path>, or scaffold one with --scaffold --project-dir <dir>.`,
      );
    }
  } else {
    if (!fs.existsSync(testFile)) {
      return invalid(`Test file not found: ${testFile}`);
    }
    projectDir = projectDir || path.dirname(testFile);
  }
  if (!/\.(js|mjs|cjs)$/i.test(testFile)) {
    return invalid(
      `Test file must be .js/.mjs/.cjs (got: ${path.basename(testFile)}) — it is executed with node.`,
    );
  }
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return invalid(`Project directory not found: ${projectDir}`);
  }
  return { testFile, projectDir };
}

/**
 * Step 3 of runPlaywrightTest: resolve the Node.js runtime and check that
 * playwright resolves from the test project (no device needed; MUST precede
 * CDP setup).
 *
 * @returns {{nodeRuntime: object, warnings: string[]}|{failure: object}}
 */
function checkTestRuntime(projectDir, command, startTime) {
  const nodeRuntime = resolveNodeRuntime();
  if (nodeRuntime.error) {
    const failure = describeNodeRuntimeFailure(nodeRuntime);
    return {
      failure: formatError(
        command,
        failure.category,
        failure.message,
        failure.suggestedFix,
        startTime,
      ),
    };
  }

  const warnings = [];
  const nodeMajor = parseInt(nodeRuntime.version.replace(/^v/, ""), 10);
  if (Number.isFinite(nodeMajor) && nodeMajor < 20) {
    warnings.push(
      `Node.js ${nodeRuntime.version} detected — playwright requires Node >= 20; the test child may fail to start.`,
    );
  }

  const dep = spawnSync(
    nodeRuntime.executable,
    ["-e", "require.resolve('playwright')"],
    {
      cwd: projectDir,
      timeout: 15000,
      stdio: "ignore",
    },
  );
  if (dep.status !== 0) {
    return {
      failure: formatError(
        command,
        "dependency_missing",
        `Playwright is not installed in ${projectDir}. Run "npm install playwright" in that directory, then retry.`,
        "npm install playwright",
        startTime,
      ),
    };
  }
  return { nodeRuntime, warnings };
}

/**
 * Step 4 of runPlaywrightTest: CDP setup (or probe an existing endpoint with
 * --no-setup).
 *
 * A failed setup hands back setupWebappDebug()'s own envelope unchanged; a
 * missing result (undefined/null) becomes an io_error envelope so the caller
 * always returns a Standard JSON Envelope.
 *
 * @returns {Promise<{failed: true, envelope: object}|{failed: false, setupResult: object|null}>}
 */
async function prepareCdpEndpoint(appId, params, opts, command, startTime) {
  const { serial, port, setupTimeout, cdpEndpoint } = params;
  if (opts.skipSetup) {
    const alive = await probeCdpEndpoint(port);
    if (!alive) {
      return {
        failed: true,
        envelope: formatError(
          command,
          "inspector_not_available",
          `CDP endpoint ${cdpEndpoint} is not answering — run the tizen-webapp-debug setup first (an app restart invalidates the RWI port), or drop --no-setup.`,
          null,
          startTime,
        ),
      };
    }
    return { failed: false, setupResult: null };
  }
  const setup = await setupWebappDebug(
    appId,
    { serial, port, timeout: setupTimeout },
    command,
  );
  if (!setup) {
    return {
      failed: true,
      envelope: formatError(
        command,
        "io_error",
        "webapp debug setup returned no result",
        null,
        startTime,
      ),
    };
  }
  if (setup.status !== "success") {
    // The setup envelope already carries the right category mapping
    // (device_not_found / invalid_parameters / inspector_not_available / ...).
    return { failed: true, envelope: setup };
  }
  return { failed: false, setupResult: setup.result };
}

/**
 * Step 6 of runPlaywrightTest: map the test child's outcome to an envelope.
 *
 * @returns {object|null} failure envelope, or null when the run passed
 */
function classifyTestRun(run, ctx, command, startTime) {
  const { combined, summary, tail, timeout, port, cdpEndpoint, projectDir } =
    ctx;
  // ENOBUFS must be checked BEFORE the timeout branch: exceeding maxBuffer
  // also kills the child with killSignal, so run.signal is set and the
  // generic `|| run.signal` test below would misreport it as test_timeout
  // (and steer the user into raising --timeout, which cannot help).
  if (run.error && run.error.code === "ENOBUFS") {
    return formatError(
      command,
      "io_error",
      "Test output exceeded the 10 MiB capture limit and the child was killed — reduce console output in the test (e.g. remove per-frame or per-event logging).",
      null,
      startTime,
      { output_tail: tail },
    );
  }
  if ((run.error && run.error.code === "ETIMEDOUT") || run.signal) {
    return formatError(
      command,
      "test_timeout",
      `Test run exceeded ${timeout}s and was killed. Increase --timeout, or check for a hung await (a selector that never appears, or a missing process.exit/browser.close in the test).`,
      null,
      startTime,
      { output_tail: tail },
    );
  }
  if (run.error) {
    return formatError(
      command,
      "io_error",
      `Could not run the test child: ${run.error.message}`,
      null,
      startTime,
    );
  }
  if (run.status === 0) return null;

  const econnrefused = new RegExp(`ECONNREFUSED[^\\n]*:${port}`).test(combined);
  if (econnrefused) {
    return formatError(
      command,
      "inspector_not_available",
      `The test could not reach ${cdpEndpoint} — the RWI port died (app restarted?). Re-run without --no-setup so the debug setup runs again.`,
      null,
      startTime,
      { output_tail: tail },
    );
  }
  const screenshotNote = /test-failure\.png/.test(combined)
    ? ` A failure screenshot was saved to ${path.join(projectDir, "test-failure.png")}.`
    : "";
  const summaryNote = summary
    ? `: ${summary.failed}/${summary.total} assertions failed${summary.errors ? `, ${summary.errors} page error(s)` : ""}`
    : "";
  return formatError(
    command,
    "test_failed",
    `Test run failed (exit code ${run.status})${summaryNote}.${screenshotNote}`,
    null,
    startTime,
    { exit_code: run.status, summary, output_tail: tail },
  );
}

/**
 * Run a Playwright test file against a Tizen Web app over CDP.
 *
 * @param {string} appId - Tizen web app ID (required, e.g. "abcDEF1234.MyWebApp")
 * @param {object} [opts]
 * @param {string} [opts.serial=''] - device serial (default: first connected device)
 * @param {number|string} [opts.port=9222] - host port forwarded to the device RWI port
 * @param {number|string} [opts.setupTimeout=30] - CDP setup readiness timeout (seconds, 1-300)
 * @param {number|string} [opts.timeout=120] - test run timeout (seconds, 1-600)
 * @param {string} [opts.testFile] - test script path (default: <projectDir>/tizen-playwright.test.js)
 * @param {string} [opts.projectDir] - test project dir (cwd for the run; needs playwright in node_modules)
 * @param {boolean} [opts.skipSetup=false] - reuse an already-live CDP endpoint instead of running setup
 * @returns {object} Standard JSON Envelope
 */
async function runPlaywrightTest(
  appId,
  opts = {},
  command = "tizen-sdk playwright-test run",
) {
  const startTime = Date.now();
  try {
    // --- Step 1: parameter validation ---
    const params = validateRunOptions(appId, opts, command, startTime);
    if (params.failure) return params.failure;
    const { port, timeout } = params;

    // --- Step 2: resolve test file / project dir ---
    const target = resolveTestTarget(opts, command, startTime);
    if (target.failure) return target.failure;
    const { testFile, projectDir } = target;

    // --- Step 3: Node.js runtime + dependency check ---
    const runtime = checkTestRuntime(projectDir, command, startTime);
    if (runtime.failure) return runtime.failure;
    const { nodeRuntime, warnings } = runtime;

    // --- Step 4: CDP setup (or probe an existing endpoint with --no-setup) ---
    const cdpEndpoint = `http://127.0.0.1:${port}`;
    const cdp = await prepareCdpEndpoint(
      appId,
      { ...params, cdpEndpoint },
      opts,
      command,
      startTime,
    );
    if (cdp.failed) return cdp.envelope;
    const { setupResult } = cdp;

    // --- Step 5: spawn the test child ---
    // No shell string assembly (argv array + no shell): injection-proof and
    // Windows-safe without quoting. cwd = projectDir so require('playwright')
    // and artifacts like test-failure.png land in the project.
    console.error(
      `[tizen-playwright-test] Running ${testFile} against ${cdpEndpoint}`,
    );
    const run = spawnSync(nodeRuntime.executable, [testFile], {
      cwd: projectDir,
      env: {
        ...process.env,
        TIZEN_CDP_ENDPOINT: cdpEndpoint,
        TIZEN_CDP_PORT: String(port),
        TIZEN_APP_ID: appId,
      },
      encoding: "utf8",
      timeout: timeout * 1000,
      killSignal: "SIGTERM",
      maxBuffer: 10 * 1024 * 1024,
    });
    const combined = `${run.stdout || ""}\n${run.stderr || ""}`;
    const summary = parseTestSummary(combined);
    const tail = outputTail(combined);

    // --- Step 6: map the outcome to an envelope ---
    const failure = classifyTestRun(
      run,
      { combined, summary, tail, timeout, port, cdpEndpoint, projectDir },
      command,
      startTime,
    );
    if (failure) return failure;

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        app_id: appId,
        test_file: testFile,
        project_dir: projectDir,
        cdp_endpoint: cdpEndpoint,
        app_pid: setupResult ? setupResult.app_pid : null,
        exit_code: 0,
        passed: true,
        summary,
        output_tail: tail,
        note: "The RWI session and the port forward stay alive — rerun with --no-setup to skip the app relaunch while the app keeps running.",
      },
      { warnings: warnings.concat(summarizeTestOutput(combined)) },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to run playwright test: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Scaffold a Playwright test project: write tizen-playwright.test.js (and a
 * minimal package.json when none exists) into projectDir.
 *
 * Never runs npm install — the caller (agent/user) installs playwright in the
 * project; next_steps in the result spells that out.
 *
 * @param {object} [opts]
 * @param {string} opts.projectDir - target directory (required, must exist)
 * @param {string} [opts.appId] - baked into the template as the env-var fallback
 * @param {number|string} [opts.port=9222] - baked-in fallback CDP port
 * @param {boolean} [opts.force=false] - overwrite an existing scaffolded test file
 * @returns {object} Standard JSON Envelope
 */
async function scaffoldPlaywrightTest(
  opts = {},
  command = "tizen-sdk playwright-test scaffold",
) {
  const startTime = Date.now();
  try {
    if (!opts.projectDir) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: projectDir",
        'scaffoldPlaywrightTest({ projectDir: "./pwtest", appId: "abcDEF1234.MyWebApp" })',
        startTime,
      );
    }
    const projectDir = path.resolve(opts.projectDir);
    if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
      return formatError(
        command,
        "invalid_parameters",
        `Project directory not found: ${projectDir}. Create it first.`,
        null,
        startTime,
      );
    }
    if (opts.appId && !/^[A-Za-z0-9._-]+$/.test(opts.appId)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid app id: ${opts.appId}`,
        null,
        startTime,
      );
    }
    const port = parseBoundedInt(opts.port, 9222, 65535);
    if (port === null) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${opts.port}`,
        null,
        startTime,
      );
    }

    const testFile = path.join(projectDir, DEFAULT_TEST_FILE);
    if (fs.existsSync(testFile) && !opts.force) {
      return formatError(
        command,
        "invalid_parameters",
        `${testFile} already exists. Pass --force to overwrite, or run it as-is with --test-file.`,
        null,
        startTime,
      );
    }

    const warnings = [];
    const created = [];
    fs.writeFileSync(
      testFile,
      renderTestTemplate({ appId: opts.appId, port }),
      "utf8",
    );
    created.push(testFile);

    const packageJson = path.join(projectDir, "package.json");
    if (!fs.existsSync(packageJson)) {
      fs.writeFileSync(
        packageJson,
        renderPackageJson({ name: path.basename(projectDir) }),
        "utf8",
      );
      created.push(packageJson);
    } else {
      warnings.push(
        'Existing package.json left untouched — ensure "playwright" is in its dependencies.',
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        project_dir: projectDir,
        test_file: testFile,
        created,
        next_steps: [
          `cd "${projectDir}" && npm install playwright`,
          `node <plugin>/lib/cli/playwright-test-cli.js --app-id ${opts.appId || "<APP_ID>"} --project-dir "${projectDir}"`,
        ],
      },
      { warnings },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to scaffold playwright test: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  runPlaywrightTest,
  scaffoldPlaywrightTest,
  parseTestSummary,
  resolveNodeRuntime,
  describeNodeRuntimeFailure,
  NODE_PROBE_TIMEOUT_MS,
};
