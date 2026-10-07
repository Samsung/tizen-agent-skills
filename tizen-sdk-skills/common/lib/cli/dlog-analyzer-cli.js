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
 *   app-log         — Print the full collected log for one app (all priorities, hot + cold files)
 *   search          — Search every collected dlog category for text or a regex (binary v0.2.6+)
 *   device-profile   — Detect and print the connected device's profile
 *   investigate      — Run a one-shot first-pass investigation and emit a budgeted report
 *   probe            — List and run evidence probes from the data-driven catalog
 *   snapshot         — Create, list, and compare system snapshots
 *   timeline         — Analyze and visualize probe history across snapshots
 *   kernel           — Kernel log collection (collect = background, stop, analyze) (kmsg/dmesg)
 *   log-dump        — One-shot dlog buffer dump (sdb dlog -d), tail in the envelope, full dump in a file
 *   log-clear       — Clear the device dlog buffer (sdb dlog -c); requires --confirm
 *
 * Collected logs are stored by the native binary under <sdk-data>/dloganalyzer/
 * (resolved from ~/.tizen.sdk.path.config); there is no output-directory
 * argument — the binary has no --base-dir option any more.
 *
 * Usage:
 *   node dlog-analyzer-cli.js start   <subcommand> [serial]
 *   node dlog-analyzer-cli.js stop
 *   node dlog-analyzer-cli.js check
 *   node dlog-analyzer-cli.js status
 *   node dlog-analyzer-cli.js app-launch <app-id> [serial]
 *   node dlog-analyzer-cli.js app-terminate <app-id> [serial]
 *   node dlog-analyzer-cli.js dlog-collect <app-id> [serial]
 *   node dlog-analyzer-cli.js stop-collect
 *   node dlog-analyzer-cli.js error-analyze <app-id> [format]
 *   node dlog-analyzer-cli.js app-log <app-id> [--since <s>] [--until <s>] [--priority <p>] [--tag <t>] [--keyword <k>] [--format <f>] [--output <file>] [--max-lines <n>] [--max-chars <n>]
 *   node dlog-analyzer-cli.js search <pattern> [pattern ...] [--pattern <p>]... [--category <app-id|_general|_unparsed>]... [--regex] [--case-sensitive] [--invert] [--all] [--context <n>] [--after-context <n>] [--before-context <n>] [--since <s>] [--until <s>] [--priority <p>] [--tag <t>] [--count] [--format text|json] [--output <file>] [--max-matches <n>] [--max-lines <n>] [--max-chars <n>]
 *   node dlog-analyzer-cli.js device-profile [serial] [--refresh] [--max-age <n>] [--format <f>]
 *   node dlog-analyzer-cli.js investigate [general|app] [app-id] [serial] [--format <f>] [--max-lines <n>] [--max-chars <n>]
 *   node dlog-analyzer-cli.js probe list|run [probe-id] [serial] [--format <f>]
 *   node dlog-analyzer-cli.js snapshot create|list|diff [id1] [id2] [serial]
 *   node dlog-analyzer-cli.js timeline [--format <f>] [--max-lines <n>]
 *   node dlog-analyzer-cli.js kernel collect|stop|analyze [serial] [--format <f>]
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
 *   node .../dlog-analyzer-cli.js search "connection refused"
 *   node .../dlog-analyzer-cli.js search "Exception|SIGSEGV" --regex --context 2 --priority W
 *   node .../dlog-analyzer-cli.js search handshake --category org.example.myapp --since 10m --count
 *   node .../dlog-analyzer-cli.js search "timeout|refused" --regex --format json --max-matches 20
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
  appLog,
  searchLogs,
  deviceProfile,
  investigate,
  runProbe,
  manageSnapshot,
  runTimeline,
  manageKernel,
  dumpDeviceLogs,
  clearDeviceLogs,
} = require("../core/sdk-commands");

const COMMAND = "tizen-sdk dlog-analyzer";

const USAGE =
  "Usage: node dlog-analyzer-cli.js <action> [params...] " +
  '[--filter "<spec> ..."] [--lines <n>] [--output <file>] [--confirm]';

// Flags are only meaningful for log-dump / log-clear / app-log / search /
// device-profile / investigate / probe / timeline / kernel; every other action
// is positional. `--background` was already removed from argv by cli-runner.
// The flags in REPEATABLE_FLAGS collect every occurrence into an array
// (`--pattern a --pattern b`, `--tag A --tag B`); the others keep the last.
const OPTION_FLAGS = {
  "--filter": "filter",
  "--lines": "lines",
  "--output": "output",
  "--since": "since",
  "--until": "until",
  "--priority": "priority",
  "--tag": "tag",
  "--keyword": "keyword",
  "--format": "format",
  "--max-lines": "maxLines",
  "--max-chars": "maxChars",
  "--max-age": "maxAge",
  "--symptoms": "symptoms",
  "--profile": "profile",
  "--budget": "budget",
  "--budget-tokens": "budgetTokens",
  "--probe-id": "probeId",
  // search only
  "--pattern": "pattern",
  "--category": "category",
  "--app-id": "category", // the binary's alias of --category
  "--context": "context",
  "--after-context": "afterContext",
  "--before-context": "beforeContext",
  "--max-matches": "maxMatches",
};
const BOOLEAN_FLAGS = {
  "--confirm": "confirm",
  "--refresh": "refresh",
  "--with-context": "withContext",
  "--with-kernel": "withKernel",
  "--allow-network-probe": "allowNetworkProbe",
  // search only
  "--regex": "regex",
  "--case-sensitive": "caseSensitive",
  "--invert": "invert",
  "--all": "all",
  "--count": "count",
};
// `--tag` is repeatable for app-log and search alike; `--category` and its
// alias `--app-id` share one key, so mixing them yields a single array.
const REPEATABLE_FLAGS = ["--pattern", "--category", "--app-id", "--tag"];

// --- Main entry point ---
const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  process.argv.slice(2),
  OPTION_FLAGS,
  BOOLEAN_FLAGS,
  REPEATABLE_FLAGS,
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
      "node dlog-analyzer-cli.js start start-monitoring [serial]",
    );
  }

  switch (action) {
    case "start": {
      const subcommand = param1;
      const serial = param2;
      if (!subcommand || !VALID_SUBCOMMANDS.includes(subcommand)) {
        // `start stop` / `start check` are the runner's own actions typed
        // one word too late; say so instead of listing the subcommands.
        const ownAction = ["stop", "check", "status"].includes(subcommand)
          ? ` To ${subcommand === "stop" ? "stop the monitor" : `run '${subcommand}'`}, run '${subcommand}' on its own (not 'start ${subcommand}').`
          : "";
        return formatError(
          COMMAND,
          "invalid_parameters",
          `Invalid subcommand: '${subcommand}'. Must be one of: ${VALID_SUBCOMMANDS.join(", ")}.${ownAction}`,
          ownAction
            ? `node dlog-analyzer-cli.js ${subcommand}`
            : "node dlog-analyzer-cli.js start start-monitoring [serial]",
        );
      }
      // A third positional used to be the output directory; the domain
      // rejects it with an explanation now that the log directory is
      // SDK-resolved, so pass it through rather than dropping it silently.
      return startDlogAnalyzer(subcommand, serial, param3);
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
    case "app-log":
      // app-log <app-id> [serial] — filter options from flags
      return appLog(param1, {
        since: options.since,
        until: options.until,
        priority: options.priority,
        tags: options.tag,
        keywords: options.keyword,
        format: options.format,
        output: options.output,
        maxLines: options.maxLines,
        maxChars: options.maxChars,
      });
    case "search":
      // search <pattern> [pattern ...] — every positional after the action is
      // a pattern (any one matches unless --all); each --pattern (repeatable)
      // adds one more, e.g. for a pattern that starts with "--". Reads the
      // collected files: no serial.
      return searchLogs([...positional.slice(1), ...(options.pattern || [])], {
        categories: options.category,
        regex: options.regex === true,
        caseSensitive: options.caseSensitive === true,
        invert: options.invert === true,
        all: options.all === true,
        context: options.context,
        afterContext: options.afterContext,
        beforeContext: options.beforeContext,
        since: options.since,
        until: options.until,
        priority: options.priority,
        tags: options.tag,
        count: options.count === true,
        format: options.format,
        output: options.output,
        maxMatches: options.maxMatches,
        maxLines: options.maxLines,
        maxChars: options.maxChars,
      });
    case "device-profile":
      // device-profile [serial] [--refresh] [--max-age <n>] [--format <f>]
      return deviceProfile(param1, {
        refresh: options.refresh === true,
        maxAge: options.maxAge,
        format: options.format,
      });
    case "investigate":
      // investigate [app-id] [serial] [--symptoms <s>] [--profile <p>] [--format <f>] [--budget <n>]
      return investigate(param1, param2, {
        symptoms: options.symptoms,
        profile: options.profile,
        format: options.format,
        budget: options.budget,
        budgetTokens: options.budgetTokens,
        allowNetworkProbe: options.allowNetworkProbe === true,
      });
    case "probe":
      // probe list|run [probe-id] [serial] [--format <f>]
      return runProbe(param1, param2, param3, {
        format: options.format,
      });
    case "snapshot":
      // snapshot create|list|compare|delete [id1] [id2] [serial]
      return manageSnapshot(param1, [param2, param3], positional[4]);
    case "timeline":
      // timeline show|report|analyze|export [--probe-id <id>] [--format <f>] [--output <file>]
      return runTimeline(param1, {
        probeId: options.probeId,
        format: options.format,
        output: options.output,
      });
    case "kernel":
      // kernel collect|stop|analyze [serial] [--format <f>]
      return manageKernel(param1, param2, {
        format: options.format,
      });
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
