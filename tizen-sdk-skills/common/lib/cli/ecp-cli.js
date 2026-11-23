#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for runEcpCommand() execution — Emulator Control Panel (ecp-cli)
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/ecp-cli.js --request "<request>" [--target <vm|serial>]
 *        [--version <VERSION>] [--profile <PROFILE>]
 *
 * Examples (directly executed):
 *   node .../ecp-cli.js --request "what devices are available for version 9.0, profile tv"
 *   node .../ecp-cli.js --request "help"
 *   node .../ecp-cli.js --request "battery status"
 *   node .../ecp-cli.js --request "battery set 50" --target emulator-26101
 *
 * ECP commands control a RUNNING emulator: with no emulator running the runner
 * returns a failure envelope that points at tizen-launch-emulator.
 *
 * Options:
 *   --request <text>    Natural-language ECP request (required)
 *   --target <t>        VM name or emulator-<port> serial (auto-select if omitted)
 *   --version <VERSION> Platform version for the device-list intent (optional)
 *   --profile <PROFILE> Profile for the device-list intent: tv / tizen / mobile / wearable (optional)
 *
 * Exit code: success=0, failure/error=1
 */

const { runEcpCommand } = require("../core/sdk-commands");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk ecp";

const USAGE =
  "Usage: node ecp-cli.js --request <text> [--target <vm|serial>] [--version <VERSION>] [--profile <PROFILE>]. " +
  'Examples: --request "battery status" or --request "what devices are available for version 9.0, profile tv"';

const OPTION_FLAGS = {
  "--request": "request",
  "--target": "target",
  "--version": "version",
  "--profile": "profile",
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

// A missing --request is left for runEcpCommand to reject: the core guard
// returns the Standard JSON Envelope on stdout (with the usage guidance), which
// callers parse — a CLI-level error would bypass that contract.
runCli(COMMAND, () =>
  runEcpCommand(
    options.request,
    options.target,
    options.version,
    options.profile,
    COMMAND,
  ),
);
