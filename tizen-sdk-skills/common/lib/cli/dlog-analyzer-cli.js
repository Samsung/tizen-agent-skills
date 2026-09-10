#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for tizen-dlog-analyzer — manages background log monitoring
 * and app-specific log collection / error analysis.
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
 *
 * Exit code: success=0, failure/error=1
 */

const { formatError } = require("../envelope/response-formatter");
const { runCli } = require("./cli-runner");
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
} = require("../core/sdk-commands");

// --- Main entry point ---
const [, , action, param1, param2, param3] = process.argv;

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
];
const VALID_SUBCOMMANDS = [
  "dlog-collect",
  "exception-detect",
  "start-monitoring",
];

runCli("tizen-sdk dlog-analyzer", async () => {
  if (!action || !VALID_ACTIONS.includes(action)) {
    return formatError(
      "tizen-sdk dlog-analyzer",
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
          "tizen-sdk dlog-analyzer",
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
    default:
      return formatError(
        "tizen-sdk dlog-analyzer",
        "invalid_parameters",
        `Unknown action: ${action}`,
      );
  }
});
