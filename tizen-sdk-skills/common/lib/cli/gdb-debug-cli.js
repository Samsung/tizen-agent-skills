#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for setupGdbDebug() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/gdb-debug-cli.js <appId> <binaryPath> [mode] [breakpoints] [port]
 *
 * Examples:
 *   node .../gdb-debug-cli.js org.example.myapp "C:/ws/MyApp/Debug/tpk/bin/myapp" attach "service_app_control"
 *   node .../gdb-debug-cli.js org.example.myapp "C:/ws/MyApp/Debug/tpk/bin/myapp" launch "main,service_app_create"
 *
 * Arguments:
 *   appId       - Tizen package ID (required)
 *   binaryPath  - Host binary path with debug symbols (required; the script validates and
 *                 auto-searches nearby, so approximate guessed paths are acceptable)
 *   mode        - attach (default) | launch. "-" is also treated as attach
 *   breakpoints - Comma-separated function names (e.g., "main,service_app_create"). "-" = none
 *   port        - Debug port (default 5039)
 *
 * Always runs in setup-only mode (prepares gdbserver + port forwarding + init file, then exits) —
 * interactive gdb cannot be started by the agent, so the user pastes result.gdb_command
 * from the success envelope into their terminal.
 *
 * This file is in a version directory, so sdk-commands is loaded with relative paths.
 * Exit code: success=0, failure/error=1
 */

const { setupGdbDebug } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const [, , appId, binaryPath, modeArg, bpArg, portArg] = process.argv;

if (!appId || !binaryPath) {
  console.error(
    JSON.stringify(
      {
        command: "tizen-sdk gdb-debug",
        status: "error",
        errors: [
          {
            code: "invalid_parameters",
            message:
              "Usage: node gdb-debug-cli.js <appId> <binaryPath> [attach|launch] [breakpoints|-] [port]",
          },
        ],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

runCli("tizen-sdk gdb-debug", () =>
  setupGdbDebug(
    appId,
    binaryPath,
    {
      launch: modeArg === "launch",
      breakpoints: bpArg && bpArg !== "-" ? bpArg : "",
      port: portArg || undefined,
      timeout: undefined,
    },
    "tizen-sdk gdb-debug",
  ),
);
