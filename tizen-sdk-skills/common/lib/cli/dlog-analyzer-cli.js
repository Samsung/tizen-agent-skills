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
 *   rules            — List, show, validate, and test analysis rules
 *   snapshot         — Create, list, and compare system snapshots
 *   timeline         — Analyze and visualize probe history across snapshots
 *   kernel           — Kernel log collection (collect = background, stop, analyze) (kmsg/dmesg)
 *   log-dump        — One-shot dlog buffer dump (sdb dlog -d), tail in the envelope, full dump in a file
 *   log-clear       — Clear the device dlog buffer (sdb dlog -c); requires --confirm
 *   crash-report    — Find crash dumps (/opt/usr/share/crash/dump, /run/crash/dump, --dump-dir …)
 *                     for an app id or any process name, extract the report and its dlog
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
 *   node dlog-analyzer-cli.js probe list|run [probe-id] [serial] [--format <f>] [--app-id <id>] [--allow-network-probe]
 *   node dlog-analyzer-cli.js rules list|show|validate|test [rule-id|fixture.json|path] [--family <f>] [--rules-dir <path>] [--expect <rule_id>[,<rule_id>]|none] [--format <f>]
 *   node dlog-analyzer-cli.js snapshot create|list|diff [id1] [id2] [serial]
 *   node dlog-analyzer-cli.js timeline [--format <f>] [--max-lines <n>]
 *   node dlog-analyzer-cli.js kernel collect|stop|analyze [serial] [--format <f>]
 *   node dlog-analyzer-cli.js log-dump [serial] [--filter "<spec> ..."] [--lines <n>] [--output <file>]
 *   node dlog-analyzer-cli.js log-clear [serial] [--confirm]
 *   node dlog-analyzer-cli.js crash-report [serial] [--process <name>] [--dump-dir <dir>]... [--limit <n>] [--lines <n>] [--output <dir>]
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
 *   node .../dlog-analyzer-cli.js crash-report --process deviced
 *   node .../dlog-analyzer-cli.js crash-report --app-id org.example.myapp --limit 1
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
  manageRules,
  dumpDeviceLogs,
  clearDeviceLogs,
  collectCrashReports,
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
  "--rules-dir": "rulesDir",
  "--max-workers": "maxWorkers",
  "--similarity-threshold": "similarityThreshold",
  "--symptom-map": "symptomMap",
  "--family": "family",
  "--expect": "expect",
  // search only
  "--pattern": "pattern",
  "--category": "category",
  "--app-id": "appId", // file-mode declared app label (collection-mode alias of --category is handled in the search handler)
  "--context": "context",
  "--after-context": "afterContext",
  "--before-context": "beforeContext",
  "--max-matches": "maxMatches",
  // file-mode options
  "--file": "file",
  "--pid": "pid",
  "--noise-tag": "noiseTag",
  "--level": "level",
  // crash-report only
  "--process": "process",
  "--dump-dir": "dumpDir",
  "--limit": "limit",
};
const BOOLEAN_FLAGS = {
  "--confirm": "confirm",
  "--refresh": "refresh",
  "--with-context": "withContext",
  "--with-kernel": "withKernel",
  "--allow-network-probe": "allowNetworkProbe",
  "--parallel": "parallel",
  "--deduplicate": "deduplicate",
  "--allow-heavy": "allowHeavy",
  "--no-noise-filter": "noNoiseFilter",
  "--fuzzy-symptoms": "fuzzySymptoms",
  // search only
  "--regex": "regex",
  "--case-sensitive": "caseSensitive",
  "--invert": "invert",
  "--all": "all",
  "--count": "count",
  // kernel file-mode
  "--with-dlog": "withDlog",
};
// `--tag` is repeatable for app-log and search alike; `--category` and
// `--app-id` each have their own key now (in file mode `--app-id` is a declared
// app label, not a category alias); `--pid` and `--noise-tag` are file-mode only.
const REPEATABLE_FLAGS = [
  "--pattern",
  "--category",
  "--app-id",
  "--tag",
  "--pid",
  "--noise-tag",
  "--dump-dir",
];

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
  "rules",
  "snapshot",
  "timeline",
  "kernel",
  "log-dump",
  "log-clear",
  "crash-report",
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
      // error-analyze reads the locally collected log file — no serial needed.
      // In file mode, --file selects a saved dlog file; --app-id is a declared
      // label (not a verified identity), --pid selects historical capture PIDs.
      if (options.file) {
        return analyzeErrors(options.appId, options.format, {
          file: options.file,
          pids: options.pid,
          noiseTags: options.noiseTag,
          tags: options.tag,
          categories: options.category,
          withContext: options.withContext === true,
          maxLines: options.maxLines,
          maxChars: options.maxChars,
        });
      }
      return analyzeErrors(param1, param2);
    case "app-log":
      // app-log <app-id> [serial] — filter options from flags.
      // In file mode, --file selects a saved dlog file; --pid selects records.
      if (options.file) {
        return appLog(null, {
          file: options.file,
          pids: options.pid,
          noiseTags: options.noiseTag,
          categories: options.category,
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
      }
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
      // In file mode, --file selects a saved dlog file; --app-id is a declared
      // app label (not a category alias); --pid selects historical capture PIDs.
      if (options.file) {
        return searchLogs(
          [...positional.slice(1), ...(options.pattern || [])],
          {
            file: options.file,
            appLabels: options.appId,
            pids: options.pid,
            noiseTags: options.noiseTag,
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
          },
        );
      }
      return searchLogs([...positional.slice(1), ...(options.pattern || [])], {
        categories: [...(options.category || []), ...(options.appId || [])],
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
        rulesDir: options.rulesDir,
        parallel: options.parallel === true,
        maxWorkers: options.maxWorkers,
        deduplicate: options.deduplicate === true,
        similarityThreshold: options.similarityThreshold,
        allowHeavy: options.allowHeavy === true,
        noNoiseFilter: options.noNoiseFilter === true,
        fuzzySymptoms: options.fuzzySymptoms === true,
        symptomMap: options.symptomMap,
      });
    case "probe": {
      // probe list|run [probe-id] [serial] [--format <f>] [--app-id <id>] [--allow-network-probe]
      // `--app-id` binds to the shared `category` key (the binary's alias of
      // --category, repeatable) — the last one wins for one app-scoped probe.
      const appId = Array.isArray(options.category)
        ? options.category[options.category.length - 1]
        : options.category;
      return runProbe(param1, param2, param3, {
        format: options.format,
        appId,
        allowNetworkProbe: options.allowNetworkProbe === true,
      });
    }
    case "rules":
      // rules list|show|validate|test [rule-id|fixture.json|path] [--family <f>] [--rules-dir <path>] [--expect <rule_id>[,<rule_id>]|none] [--format <f>]
      return manageRules(param1, param2, {
        rulesDir: options.rulesDir,
        format: options.format,
        family: options.family,
        expect: options.expect,
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
      // In file mode, --file selects a saved kernel log file; --level sets the
      // minimum level; --with-dlog correlates with collected dlog.
      return manageKernel(param1, param2, {
        format: options.format,
        file: options.file,
        since: options.since,
        level: options.level,
        withDlog: options.withDlog === true,
        appId: options.appId,
        maxLines: options.maxLines,
        maxChars: options.maxChars,
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
    case "crash-report":
      // crash-report [serial] — --app-id is an alias of --process (an app id
      // is just the name crash-worker files an app's dump under).
      return collectCrashReports(param1, {
        process: [options.appId, options.process].flat(),
        dumpDir: options.dumpDir,
        limit: options.limit,
        lines: options.lines,
        output: options.output,
      });
    default:
      return formatError(
        COMMAND,
        "invalid_parameters",
        `Unknown action: ${action}`,
      );
  }
});
