// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * DLog Analyzer commands — the single owner of device/emulator logs: one-shot
 * dlog buffer dump / clear (plain sdb), background dlog monitoring for
 * crash/exception detection, plus app-specific log collection and runtime
 * error analysis.
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
      "The single owner of Tizen device/emulator logs. One-shot: log-dump (sdb dlog -d buffer dump, optional tag/priority filter, full dump saved to a file) and log-clear (sdb dlog -c, requires --confirm). Continuous: background monitoring with crash/exception detection (start/stop/check/status), app lifecycle (app-launch/app-terminate), app-specific log collection (dlog-collect --app-id), and runtime error analysis (error-analyze --app-id). sdb-helper hands every log request off to this command.",
    collectAllMissing: true,
    options: [
      {
        flags: "--action <action>",
        description:
          "Action: log-dump (one-shot dlog buffer dump — 'show/tail/save the logs'), log-clear (clear the device dlog buffer — requires --confirm), start (launch monitoring), stop (kill background process), check (read analyzed output), status (check if running), app-launch (launch an app), app-terminate (terminate an app), dlog-collect (start background app-specific log collection), stop-collect (stop app-specific log collection), error-analyze (analyze app logs for E/F errors)",
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
          "log-dump",
          "log-clear",
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
      {
        flags: "--filter <specs>",
        description:
          'For --action log-dump only: dlog filterspecs <tag>[:<V|D|I|W|E|F|S>], space- or comma-separated — e.g. "*:E" (errors and fatals only), "E20:W CHROMIUM". Default: everything.',
      },
      {
        flags: "--lines <n>",
        description:
          "For --action log-dump only: how many trailing lines to return in the envelope (default 200; 0 = all). The complete dump is always written to --output / the default dump file.",
      },
      {
        flags: "--output <file>",
        description:
          "For --action log-dump only: host file that receives the complete dump (default: <tmp>/tizen-dlog-analyzer/dlog-dump.log).",
      },
      {
        flags: "--confirm",
        description:
          "Required for log-clear, which discards the device's entire dlog buffer. Without it, log-clear fails with user_input_required so the user gets asked first.",
        default: false,
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
        case "log-dump":
          return sdkCommands.dumpDeviceLogs(
            o.serial,
            { filter: o.filter, lines: o.lines, output: o.output },
            commandLabel,
          );
        case "log-clear":
          return sdkCommands.clearDeviceLogs(o.serial, o.confirm, commandLabel);

        default:
          return Promise.resolve({
            command: commandLabel,
            status: "failure",
            errors: [
              {
                category: "invalid_parameters",
                message: `Unknown action: ${o.action}. Must be one of: start, stop, check, status, app-launch, app-terminate, dlog-collect, stop-collect, error-analyze, log-dump, log-clear`,
              },
            ],
          });
      }
    },
  },
];
