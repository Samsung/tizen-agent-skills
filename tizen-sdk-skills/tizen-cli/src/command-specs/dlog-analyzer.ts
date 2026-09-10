// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * DLog Analyzer commands — background dlog monitoring for crash/exception detection,
 * plus app-specific log collection and runtime error analysis.
 *
 * Delegates to the core/dlog-analyzer.js domain module (via sdk-commands),
 * which manages the native tizen-dlog-analyzer binary as a detached
 * background process and provides app-level sdb operations.
 */

import { CommandSpec, SERIAL_OPTION, sdkCommands } from "./types";

export const DLOG_ANALYZER_SPECS: CommandSpec[] = [
  {
    name: "dlog-analyzer",
    description:
      "Monitor Tizen device logs for crashes and exceptions using the tizen-dlog-analyzer binary. Supports background monitoring (start/stop/check/status), app lifecycle management (app-launch/app-terminate), app-specific log collection (dlog-collect --app-id), and runtime error analysis (error-analyze --app-id).",
    collectAllMissing: true,
    options: [
      {
        flags: "--action <action>",
        description:
          "Action: start (launch monitoring), stop (kill background process), check (read analyzed output), status (check if running), app-launch (launch an app), app-terminate (terminate an app), dlog-collect (start background app-specific log collection), stop-collect (stop app-specific log collection), error-analyze (analyze app logs for E/F errors)",
        choices: [
          "start",
          "stop",
          "check",
          "status",
          "app-launch",
          "app-terminate",
          "dlog-collect",
          "stop-collect",
          "error-analyze",
        ],
        required: true,
      },
      {
        flags: "--subcommand <subcommand>",
        description:
          "For --action start only: dlog-collect, exception-detect, or start-monitoring (recommended)",
        choices: ["dlog-collect", "exception-detect", "start-monitoring"],
        default: "start-monitoring",
      },
      {
        flags: "--app-id <id>",
        description:
          "Tizen app ID (e.g., org.example.myapp). Required for app-launch, app-terminate, dlog-collect, and error-analyze actions.",
      },
      {
        flags: "--format <format>",
        description:
          "For --action error-analyze only: output format — summary (summary lines only), details (detail entries only), or omit for both",
        choices: ["summary", "details"],
      },
      SERIAL_OPTION,
      {
        flags: "--output-dir <path>",
        description: "Directory for dlog output (default: OS temp dir)",
      },
    ],
    handler: (o) => {
      const commandLabel = `tizen-sdk dlog-analyzer ${o.action}`;
      switch (o.action) {
        case "start":
          return sdkCommands.startDlogAnalyzer(
            o.subcommand || "start-monitoring",
            o.serial,
            o.outputDir,
            commandLabel,
          );
        case "stop":
          return sdkCommands.stopDlogAnalyzer(commandLabel);
        case "check":
          return sdkCommands.checkDlogAnalyzer(commandLabel);
        case "status":
          return sdkCommands.statusDlogAnalyzer(commandLabel);
        case "app-launch":
          return sdkCommands.launchApp(o.appId, o.serial, commandLabel);
        case "app-terminate":
          return sdkCommands.terminateApp(o.appId, o.serial, commandLabel);
        case "dlog-collect":
          return sdkCommands.collectAppLogs(o.appId, o.serial, commandLabel);
        case "stop-collect":
          return sdkCommands.stopCollectAppLogs(commandLabel);
        case "error-analyze":
          return sdkCommands.analyzeErrors(o.appId, o.format, commandLabel);

        default:
          return Promise.resolve({
            command: commandLabel,
            status: "failure",
            errors: [
              {
                category: "invalid_parameters",
                message: `Unknown action: ${o.action}. Must be one of: start, stop, check, status, app-launch, app-terminate, dlog-collect, stop-collect, error-analyze`,
              },
            ],
          });
      }
    },
  },
];
