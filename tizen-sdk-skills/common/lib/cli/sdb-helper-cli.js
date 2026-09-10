#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for runSdbCommand() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/sdb-helper-cli.js --request "<request>" [--serial <serial>]
 *
 * Examples (directly executed):
 *   node .../sdb-helper-cli.js --request "tail the logs"
 *   node .../sdb-helper-cli.js --request "open a shell" --serial emulator-26101
 *   node .../sdb-helper-cli.js --request="reboot the device" --serial=emulator-26101
 *
 * Note: Some requests (list-devices, connect/disconnect, install/uninstall,
 * screenshot) are handled by dedicated skills and will return a handoff
 * directive instead of executing locally.
 *
 * Options:
 *   --request <text>   Natural-language sdb request (required)
 *   --serial <serial>  Optional sdb device serial (auto-detect if omitted)
 *
 * Exit code: success=0, failure/error=1
 */

const { runSdbCommand } = require("../core/sdk-commands");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk sdb-helper";

const USAGE =
  "Usage: node sdb-helper-cli.js --request <text> [--serial <serial>]. " +
  'Examples: --request "tail the logs" or --request="open a shell" --serial=emulator-26101';

const OPTION_FLAGS = {
  "--request": "request",
  "--serial": "serial",
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

// A missing --request is left for runSdbCommand to reject: the core guard
// returns the Standard JSON Envelope on stdout (with suggested_fix), which
// callers parse — a CLI-level usageError would bypass that contract.
runCli(COMMAND, () => runSdbCommand(options.request, options.serial, COMMAND));
