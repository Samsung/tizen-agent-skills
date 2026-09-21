#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for tizen-dlog-analyzer — manages background log monitoring,
 * app-specific log collection / error analysis, and the one-shot device-log
 * actions (dump / clear) that every "show me the logs" request ends up in.
 *
 * The tizen-dlog-analyzer binary's dlog-collect and start-monitoring
 * subcommands are long-running (non-terminating); exception-detect runs
 * once in batch mode and exits unless invoked with --follow.
 *
 * This runner parses argv and delegates to the domain module via
 * sdk-commands (core/dlog-analyzer.js), which manages the binary as a
 * detached background process:
 *   start   — Launch the binary in background, capture stdout to a temp file
 *   stop    — Kill the running background process
 *   check   — Read the temp file and return analyzed output
 *   status  — Check if the background process is still running
 *   app-launch      — Launch a Tizen app on the device
 *   app-terminate   — Terminate a running Tizen app
 *   dlog-collect    — Start background log collection for a specific app (filtered by PID)
 *   stop-collect    — Stop the background app log collection process
 *   error-analyze   — Analyze collected app logs for E/F priority errors
 *   log-dump        — One-shot dlog buffer dump (sdb dlog -d), tail in the envelope, full dump in a file
 *   log-clear       — Clear the device dlog buffer (sdb dlog -c); requires --confirm
 *
 * Usage:
 *   node dlog-analyzer-cli.js start   <subcommand> [serial] [output_dir]
 *   node dlog-analyzer-cli.js stop
 *   node dlog-analyzer-cli.js check
 *   node dlog-analyzer-cli.js status
 *   node dlog-analyzer-cli.js app-launch <app-id> [serial]
 *   node dlog-analyzer-cli.js app-terminate <app-id> [serial]
 *   node dlog-analyzer-cli.js dlog-collect <app-id> [serial]
 *   node dlog-analyzer-cli.js stop-collect
 *   node dlog-analyzer-cli.js error-analyze <app-id> [format]
 *   node dlog-analyzer-cli.js log-dump [serial] [--filter "<spec> ..."] [--lines <n>] [--output <file>]
 *   node dlog-analyzer-cli.js log-clear [serial] [--confirm]
 *
 * Examples:
 *   node .../dlog-analyzer-cli.js start start-monitoring emulator-26101
 *   node .../dlog-analyzer-cli.js check
 *   node .../dlog-analyzer-cli.js stop
 *   node .../dlog-analyzer-cli.js app-launch org.example.myapp
 *   node .../dlog-analyzer-cli.js app-terminate org.example.myapp
 *   node .../dlog-analyzer-cli.js dlog-collect org.example.myapp
 *   node .../dlog-analyzer-cli.js stop-collect
 *   node .../dlog-analyzer-cli.js error-analyze org.example.myapp summary
 *   node .../dlog-analyzer-cli.js log-dump
 *   node .../dlog-analyzer-cli.js log-dump emulator-26101 --filter "*:E" --lines 100
 *   node .../dlog-analyzer-cli.js log-dump --output ./device.log --lines 0
 *   node .../dlog-analyzer-cli.js log-clear                     # refused: user_input_required
 *   node .../dlog-analyzer-cli.js log-clear emulator-26101 --confirm
 *
 * Exit code: success=0, failure/error=1
 */

const { formatError } = require("../envelope/response-formatter");
const { runCli, parseArgsOrExit } = require("./cli-runner");
const {
  startDlogAnalyzer,
  stopDlogAnalyzer,
  checkDlogAnalyzer,
  statusDlogAnalyzer,
  launchApp,
  terminateApp,
  collectAppLogs,
  stopCollectAppLogs,
  analyzeErrors,
  dumpDeviceLogs,
  clearDeviceLogs,
} = require("../core/sdk-commands");

const COMMAND = "tizen-sdk dlog-analyzer";

const USAGE =
  "Usage: node dlog-analyzer-cli.js <action> [params...] " +
  '[--filter "<spec> ..."] [--lines <n>] [--output <file>] [--confirm]';

// Flags are only meaningful for log-dump / log-clear; every other action is
// positional. `--background` was already removed from argv by cli-runner.
const OPTION_FLAGS = {
  "--filter": "filter",
  "--lines": "lines",
  "--output": "output",
};
const BOOLEAN_FLAGS = {
  "--confirm": "confirm",
};

// --- Main entry point ---
const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  process.argv.slice(2),
  OPTION_FLAGS,
  BOOLEAN_FLAGS,
);
const [action, param1, param2, param3] = positional;

const VALID_ACTIONS = [
  "start",
  "stop",
  "check",
  "status",
  "app-launch",
  "app-terminate",
  "dlog-collect",
  "stop-collect",
  "error-analyze",
  "log-dump",
  "log-clear",
];
const VALID_SUBCOMMANDS = [
  "dlog-collect",
  "exception-detect",
  "start-monitoring",
];

runCli(COMMAND, async () => {
  if (!action || !VALID_ACTIONS.includes(action)) {
    return formatError(
      COMMAND,
      "invalid_parameters",
      `Invalid action: '${action}'. Must be one of: ${VALID_ACTIONS.join(", ")}`,
      "node dlog-analyzer-cli.js start start-monitoring [serial] [output_dir]",
    );
  }

  switch (action) {
    case "start": {
      const subcommand = param1;
      const serial = param2;
      const outputDir = param3;
      if (!subcommand || !VALID_SUBCOMMANDS.includes(subcommand)) {
        return formatError(
          COMMAND,
          "invalid_parameters",
          `Invalid subcommand: '${subcommand}'. Must be one of: ${VALID_SUBCOMMANDS.join(", ")}`,
          "node dlog-analyzer-cli.js start start-monitoring [serial] [output_dir]",
        );
      }
      return startDlogAnalyzer(subcommand, serial, outputDir);
    }
    case "stop":
      return stopDlogAnalyzer();
    case "check":
      return checkDlogAnalyzer();
    case "status":
      return statusDlogAnalyzer();
    case "app-launch":
      return launchApp(param1, param2);
    case "app-terminate":
      return terminateApp(param1, param2);
    case "dlog-collect":
      return collectAppLogs(param1, param2);
    case "stop-collect":
      return stopCollectAppLogs();
    case "error-analyze":
      // error-analyze reads the locally collected log file — no serial needed
      return analyzeErrors(param1, param2);
    case "log-dump":
      // log-dump [serial] — filter / lines / output come from the flags
      return dumpDeviceLogs(param1, {
        filter: options.filter,
        lines: options.lines,
        output: options.output,
      });
    case "log-clear":
      // log-clear [serial] [--confirm] — refused without --confirm
      return clearDeviceLogs(param1, options.confirm === true);
    default:
      return formatError(
        COMMAND,
        "invalid_parameters",
        `Unknown action: ${action}`,
      );
  }
});
