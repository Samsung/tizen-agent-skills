#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for setupDotnetDebug() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/dotnet-debug-cli.js <appId> [mode] [breakpoints] [port] [serial]
 *
 * Examples:
 *   node .../dotnet-debug-cli.js org.tizen.example.MyApp launch "Program.cs:25,App.cs:10" 4711
 *   node .../dotnet-debug-cli.js org.tizen.example.MyApp - "Program.cs:25"        # launch (default)
 *   node .../dotnet-debug-cli.js org.tizen.example.MyApp attach "Program.cs:25"   # explicit attach
 *
 * Arguments:
 *   appId       - Tizen package ID (required), e.g. org.tizen.example.MyApp
 *   mode        - launch (default) | attach. "-" is also treated as launch.
 *                 Launch is the default because on Tizen a normally-launched .NET app has
 *                 no CoreCLR debug transport, so attach cannot work (0x80131c08) — issue #97.
 *   breakpoints - Comma-separated File.cs:line (e.g., "Program.cs:25,App.cs:10"). "-" = none
 *   port        - DAP server port (default 4711 in launch mode)
 *   serial      - Device serial (default: first connected device)
 *
 * Always runs in setup-only mode (outputs netcoredbg CLI command or launch.json config, then exits) —
 * interactive netcoredbg cannot be started by the agent, so the user will use result.debug_command
 * (attach) or result.launch_config (launch) from the success envelope in their terminal/VS Code.
 *
 * This file is in a version directory, so sdk-commands is loaded with relative paths.
 * Exit code: success=0, failure/error=1
 */

const { setupDotnetDebug } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

/**
 * Map the positional argv into setupDotnetDebug() arguments.
 * Exported so the default-mode contract is unit-testable without a device.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{appId: string|undefined, opts: object}}
 */
function parseDotnetDebugArgs(argv) {
  const [appId, modeArg, bpArg, portArg, serialArg] = argv;
  return {
    appId,
    opts: {
      // launch unless the caller explicitly asks for attach ("-" = default = launch)
      launch: modeArg !== "attach",
      breakpoints: bpArg && bpArg !== "-" ? bpArg : "",
      port: portArg || undefined,
      serial: serialArg || undefined,
    },
  };
}

function main() {
  const { appId, opts } = parseDotnetDebugArgs(process.argv.slice(2));

  if (!appId) {
    console.error(
      JSON.stringify(
        {
          command: "tizen-sdk dotnet-debug",
          status: "error",
          errors: [
            {
              code: "invalid_parameters",
              message:
                "Usage: node dotnet-debug-cli.js <appId> [launch|attach] [breakpoints|-] [port] [serial]",
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  runCli("tizen-sdk dotnet-debug", () =>
    setupDotnetDebug(appId, opts, "tizen-sdk dotnet-debug"),
  );
}

if (require.main === module) main();

module.exports = { parseDotnetDebugArgs };
