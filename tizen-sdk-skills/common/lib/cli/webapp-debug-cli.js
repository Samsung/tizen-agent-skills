#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for setupWebappDebug() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/webapp-debug-cli.js --app-id <APP_ID> [--port 9222] [--serial <serial>] [--timeout 30]
 *
 * Examples (directly executed):
 *   node .../webapp-debug-cli.js --app-id abcDEF1234.MyWebApp
 *   node .../webapp-debug-cli.js --app-id abcDEF1234.MyWebApp --port 9223 --serial emulator-26101
 *   node .../webapp-debug-cli.js --app-id=abcDEF1234.MyWebApp --timeout=60
 *
 * Sets up RWI/CDP debugging for a Tizen Web app (.wgt): relaunches the app in
 * web-debug mode, forwards the host port to the device RWI port, verifies the
 * CDP endpoint, and returns it (plus Playwright/DevTools connect snippets) in
 * the Standard JSON Envelope. Web apps ONLY — for Native apps use
 * gdb-debug-cli.js, for .NET apps use dotnet-debug-cli.js.
 *
 * Options:
 *   --app-id <id>      Tizen web app ID (required, e.g. abcDEF1234.MyWebApp)
 *   --port <port>      Host port forwarded to the device RWI port (default: 9222)
 *   --serial <serial>  Optional sdb device serial (auto-detect if omitted)
 *   --timeout <sec>    CDP endpoint readiness timeout in seconds (default: 30)
 *
 * Exit code: success=0, failure/error=1
 */

const { setupWebappDebug } = require("../core/sdk-commands");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk webapp-debug";

const USAGE =
  "Usage: node webapp-debug-cli.js --app-id <APP_ID> [--port <port>] [--serial <serial>] [--timeout <sec>]. " +
  "Example: --app-id abcDEF1234.MyWebApp --port 9222";

const OPTION_FLAGS = {
  "--app-id": "appId",
  "--port": "port",
  "--serial": "serial",
  "--timeout": "timeout",
};

const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  process.argv.slice(2),
  OPTION_FLAGS,
);

if (positional.length > 0) {
  exitWithUsageError(
    COMMAND,
    USAGE,
    `Unexpected argument(s): ${positional.join(" ")}`,
  );
}

// A missing --app-id is left for setupWebappDebug to reject: the core guard
// returns the Standard JSON Envelope on stdout (with suggested_fix), which
// callers parse — a CLI-level usageError would bypass that contract.
runCli(COMMAND, () =>
  setupWebappDebug(
    options.appId,
    {
      serial: options.serial,
      port: options.port,
      timeout: options.timeout,
    },
    COMMAND,
  ),
);
