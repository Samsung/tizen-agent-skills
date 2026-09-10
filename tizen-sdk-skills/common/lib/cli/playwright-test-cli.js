#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for runPlaywrightTest() / scaffoldPlaywrightTest() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/playwright-test-cli.js --app-id <APP_ID> [--project-dir <dir>] [--test-file <path>]
 *
 * Examples (directly executed):
 *   node .../playwright-test-cli.js --app-id abcDEF1234.MyWebApp --project-dir ./pwtest
 *   node .../playwright-test-cli.js --app-id abcDEF1234.MyWebApp --test-file ./pwtest/my.test.js --no-setup
 *   node .../playwright-test-cli.js --scaffold --project-dir ./pwtest --app-id abcDEF1234.MyWebApp
 *
 * Runs a Playwright test file against a Tizen Web app (.wgt) over CDP: sets up
 * RWI/CDP debugging via the webapp-debug flow (relaunch in debug mode + port
 * forward), then spawns `node <test-file>` in the test project directory with
 * TIZEN_CDP_ENDPOINT/TIZEN_CDP_PORT/TIZEN_APP_ID in the environment. Playwright
 * resolves from the TEST PROJECT's node_modules — never from the plugin.
 * Web apps ONLY — Native/.NET apps have no web runtime (use gdb-debug-cli.js /
 * dotnet-debug-cli.js for debugging; there is no Playwright path for them).
 *
 * Options:
 *   --app-id <id>        Tizen web app ID (required for a run; optional for --scaffold)
 *   --test-file <path>   Test script (default: <project-dir>/tizen-playwright.test.js)
 *   --project-dir <dir>  Test project dir (cwd for the run; needs playwright in node_modules)
 *   --port <port>        Host port forwarded to the device RWI port (default: 9222)
 *   --serial <serial>    Optional sdb device serial (auto-detect if omitted)
 *   --setup-timeout <s>  CDP setup readiness timeout in seconds (default: 30)
 *   --timeout <s>        Test run timeout in seconds (default: 120)
 *   --no-setup           Reuse an already-live CDP endpoint (skip the debug setup)
 *   --scaffold           Generate tizen-playwright.test.js (+package.json) into --project-dir and exit
 *   --force              Overwrite an existing scaffolded test file (with --scaffold)
 *
 * Exit code: success=0, failure/error=1
 */

const {
  runPlaywrightTest,
  scaffoldPlaywrightTest,
} = require("../core/sdk-commands");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk playwright-test run";
const SCAFFOLD_COMMAND = "tizen-sdk playwright-test scaffold";

const USAGE =
  "Usage: node playwright-test-cli.js --app-id <APP_ID> [--project-dir <dir>] [--test-file <path>] " +
  "[--port <port>] [--serial <serial>] [--setup-timeout <sec>] [--timeout <sec>] [--no-setup] | " +
  "--scaffold --project-dir <dir> [--app-id <APP_ID>] [--force]. " +
  "Example: --app-id abcDEF1234.MyWebApp --project-dir ./pwtest";

const OPTION_FLAGS = {
  "--app-id": "appId",
  "--test-file": "testFile",
  "--project-dir": "projectDir",
  "--port": "port",
  "--serial": "serial",
  "--setup-timeout": "setupTimeout",
  "--timeout": "timeout",
};

const BOOLEAN_FLAGS = {
  "--no-setup": "noSetup",
  "--scaffold": "scaffold",
  "--force": "force",
};

const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  process.argv.slice(2),
  OPTION_FLAGS,
  BOOLEAN_FLAGS,
);

if (positional.length > 0) {
  exitWithUsageError(
    COMMAND,
    USAGE,
    `Unexpected argument(s): ${positional.join(" ")}`,
  );
}

// Missing required params (--app-id for a run, --project-dir for --scaffold)
// are left for the core to reject: the core guard returns the Standard JSON
// Envelope on stdout (with suggested_fix), which callers parse — a CLI-level
// usageError would bypass that contract.
runCli(options.scaffold ? SCAFFOLD_COMMAND : COMMAND, () =>
  options.scaffold
    ? scaffoldPlaywrightTest(
        {
          projectDir: options.projectDir,
          appId: options.appId,
          port: options.port,
          force: !!options.force,
        },
        SCAFFOLD_COMMAND,
      )
    : runPlaywrightTest(
        options.appId,
        {
          serial: options.serial,
          port: options.port,
          setupTimeout: options.setupTimeout,
          timeout: options.timeout,
          testFile: options.testFile,
          projectDir: options.projectDir,
          skipSetup: !!options.noSetup,
        },
        COMMAND,
      ),
);
