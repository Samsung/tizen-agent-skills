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
          "Action: log-dump (one-shot dlog buffer dump — 'show/tail/save the logs'), log-clear (clear the device dlog buffer — requires --confirm), start (launch monitoring), stop (kill background process), check (read analyzed output), status (check if running), app-launch (launch an app), app-terminate (terminate an app), dlog-collect (start background app-specific log collection), stop-collect (stop app-specific log collection), error-analyze (analyze app logs for E/F errors), app-log (print full collected log for one app), search (search every collected dlog category for text or a regex — --pattern required), device-profile (detect and print device profile), investigate (one-shot first-pass investigation report, use --app-id for app-scoped), probe (list/run evidence probes), snapshot (create/list/compare/delete system snapshots), timeline (show/report/analyze/export probe history across snapshots), kernel (kernel log collect/stop/analyze — collect runs in the background like dlog-collect)",
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
          "app-log",
          "search",
          "device-profile",
          "investigate",
          "probe",
          "snapshot",
          "timeline",
          "kernel",
          "log-dump",
          "log-clear",
        ],
        required: true,
      },
      {
        flags: "--subcommand <subcommand>",
        description:
          "For --action start: dlog-collect, exception-detect, or start-monitoring (recommended). For --action probe: list or run. For --action snapshot: create, list, compare, or delete. For --action kernel: collect (background collector), stop, or analyze. For --action timeline: show, report, analyze, or export.",
        default: "start-monitoring",
      },
      {
        flags: "--app-id <id>",
        description:
          "Tizen app ID (e.g., org.example.myapp). Required for app-launch, app-terminate, dlog-collect, error-analyze and app-log. For --action search: same as --category (restrict the search to this app's logs).",
      },
      {
        flags: "--format <format>",
        description:
          "Output format. For --action error-analyze: summary (summary lines only), details (detail entries only), or omit for both. For --action app-log, search, device-profile, investigate, probe, snapshot, timeline, kernel: json or text (default: text). For search, json carries total_matches / returned / truncated.",
      },
      {
        flags: "--pattern <text...>",
        description:
          "For --action search (required there): text to search for; several values are allowed and any one matches unless --all. Quote a multi-word pattern. Plain text unless --regex.",
      },
      {
        flags: "--category <name>",
        description:
          "For --action search: search only this category — an app id, _general or _unparsed; comma-separate several. Default: every category under app/ (kernel is excluded).",
      },
      {
        flags: "--regex",
        description:
          "For --action search: treat --pattern values as Python regular expressions.",
        default: false,
      },
      {
        flags: "--case-sensitive",
        description:
          "For --action search: match case exactly (default: case-insensitive).",
        default: false,
      },
      {
        flags: "--invert",
        description:
          "For --action search: select the entries that do NOT match.",
        default: false,
      },
      {
        flags: "--all",
        description:
          "For --action search: an entry must match every --pattern (default: any pattern).",
        default: false,
      },
      {
        flags: "--context <n>",
        description:
          "For --action search: entries of context before and after each match (like grep -C).",
      },
      {
        flags: "--after-context <n>",
        description:
          "For --action search: entries of context after each match (like grep -A; overrides --context).",
      },
      {
        flags: "--before-context <n>",
        description:
          "For --action search: entries of context before each match (like grep -B; overrides --context).",
      },
      {
        flags: "--count",
        description:
          "For --action search: print only the number of matching entries per category.",
        default: false,
      },
      {
        flags: "--max-matches <n>",
        description:
          "For --action search: return at most this many matches (default 100, 0 = unlimited); the total is always counted.",
      },
      SERIAL_OPTION,
      {
        flags: "--output-dir <path>",
        description:
          "For --action snapshot --subcommand compare only: the second snapshot ID (--app-id carries the first). Not used by --action start — collected logs always go to <sdk-data>/dloganalyzer/, resolved from ~/.tizen.sdk.path.config.",
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
          "For --action log-dump: host file that receives the complete dump (default: <tmp>/tizen-dlog-analyzer/dlog-dump.log). For --action app-log / search: file that receives the complete output (--max-lines/--max-chars apply to stdout only). For --action timeline export: the JSON file.",
      },
      {
        flags: "--confirm",
        description:
          "Required for log-clear, which discards the device's entire dlog buffer. Without it, log-clear fails with user_input_required so the user gets asked first.",
        default: false,
      },
      {
        flags: "--since <timestamp>",
        description:
          "For --action app-log / search: entries at/after this time ('08-14 18:09' or a relative age like '10m', '2h').",
      },
      {
        flags: "--until <timestamp>",
        description:
          "For --action app-log / search: entries at/before this time (same formats as --since).",
      },
      {
        flags: "--priority <p>",
        description:
          "For --action app-log / search: minimum priority (V/D/I/W/E/F). For search, context entries are not filtered.",
      },
      {
        flags: "--tag <tag>",
        description:
          "For --action app-log / search: only entries with this dlog tag.",
      },
      {
        flags: "--keyword <kw>",
        description: "For --action app-log: filter by keyword (repeatable).",
      },
      {
        flags: "--max-lines <n>",
        description:
          "For --action app-log, search, investigate, timeline: cap the number of lines returned (stdout only).",
      },
      {
        flags: "--max-chars <n>",
        description:
          "For --action app-log, search, investigate: cap the number of characters returned (stdout only).",
      },
      {
        flags: "--refresh",
        description:
          "For --action device-profile: force a fresh profile detection (bypass cache).",
        default: false,
      },
      {
        flags: "--max-age <n>",
        description:
          "For --action device-profile: maximum age (seconds) of a cached profile before refresh.",
      },
      {
        flags: "--symptoms <text>",
        description:
          "For --action investigate: free-text symptom string (e.g. '300% cpu, video not playing').",
      },
      {
        flags: "--budget <n>",
        description:
          "For --action investigate: total line budget for the text report (default 200).",
      },
      {
        flags: "--budget-tokens <n>",
        description:
          "For --action investigate: token budget for the text report (0 = unlimited).",
      },
      {
        flags: "--allow-network-probe",
        description:
          "For --action investigate: allow network probes (may require connectivity).",
        default: false,
      },
      {
        flags: "--probe-id <id>",
        description: "For --action timeline: filter to a specific probe ID.",
      },
    ],
    handler: (o) => {
      const commandLabel = `tizen-sdk dlog-analyzer ${o.action}`;
      switch (o.action) {
        case "start":
          // No output directory: the binary stores logs under the
          // SDK-resolved <sdk-data>/dloganalyzer/ (no --base-dir since
          // TizenDLogAnalyzer PR #155).
          return sdkCommands.startDlogAnalyzer(
            o.subcommand || "start-monitoring",
            o.serial,
            undefined,
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
        case "app-log":
          return sdkCommands.appLog(
            o.appId,
            {
              since: o.since,
              until: o.until,
              priority: o.priority,
              tags: o.tag,
              keywords: o.keyword,
              format: o.format,
              output: o.output,
              maxLines: o.maxLines,
              maxChars: o.maxChars,
            },
            commandLabel,
          );
        case "search":
          // --pattern is variadic (array); --app-id is the binary's alias of
          // --category, so either names the category to search.
          return sdkCommands.searchLogs(
            o.pattern,
            {
              categories: o.category ?? o.appId,
              regex: o.regex,
              caseSensitive: o.caseSensitive,
              invert: o.invert,
              all: o.all,
              context: o.context,
              afterContext: o.afterContext,
              beforeContext: o.beforeContext,
              since: o.since,
              until: o.until,
              priority: o.priority,
              tags: o.tag,
              count: o.count,
              format: o.format,
              output: o.output,
              maxMatches: o.maxMatches,
              maxLines: o.maxLines,
              maxChars: o.maxChars,
            },
            commandLabel,
          );
        case "device-profile":
          return sdkCommands.deviceProfile(
            o.serial,
            { refresh: o.refresh, maxAge: o.maxAge, format: o.format },
            commandLabel,
          );
        case "investigate":
          return sdkCommands.investigate(
            o.appId,
            o.serial,
            {
              symptoms: o.symptoms,
              profile: o.profile,
              format: o.format,
              budget: o.budget,
              budgetTokens: o.budgetTokens,
              allowNetworkProbe: o.allowNetworkProbe,
            },
            commandLabel,
          );
        case "probe":
          return sdkCommands.runProbe(
            o.subcommand,
            o.appId,
            o.serial,
            { format: o.format },
            commandLabel,
          );
        case "snapshot":
          return sdkCommands.manageSnapshot(
            o.subcommand,
            o.appId ? [o.appId, o.outputDir] : [],
            o.serial,
            commandLabel,
          );
        case "timeline":
          return sdkCommands.runTimeline(
            o.subcommand,
            { probeId: o.probeId, format: o.format, output: o.output },
            commandLabel,
          );
        case "kernel":
          return sdkCommands.manageKernel(
            o.subcommand,
            o.serial,
            { format: o.format },
            commandLabel,
          );
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
                message: `Unknown action: ${o.action}. Must be one of: start, stop, check, status, app-launch, app-terminate, dlog-collect, stop-collect, error-analyze, app-log, search, device-profile, investigate, probe, snapshot, timeline, kernel, log-dump, log-clear`,
              },
            ],
          });
      }
    },
  },
];
