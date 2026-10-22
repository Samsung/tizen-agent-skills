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
          "Action: log-dump (one-shot dlog buffer dump — 'show/tail/save the logs'), log-clear (clear the device dlog buffer — requires --confirm), start (launch monitoring), stop (kill background process), check (read analyzed output), status (check if running), app-launch (launch an app), app-terminate (terminate an app), dlog-collect (start background app-specific log collection), stop-collect (stop app-specific log collection), error-analyze (analyze app logs for E/F errors), app-log (print full collected log for one app), search (search every collected dlog category for text or a regex — --pattern required), device-profile (detect and print device profile), investigate (one-shot first-pass investigation report, use --app-id for app-scoped), probe (list/run evidence probes), rules (list/show/validate/test analysis rules), snapshot (create/list/compare/delete system snapshots), timeline (show/report/analyze/export probe history across snapshots), kernel (kernel log collect/stop/analyze — collect runs in the background like dlog-collect), crash-report (find crash dumps in /opt/usr/share/crash/dump, /run/crash/dump and --dump-dir for an app id or any process name — system daemons included — and extract the crash report and its packed dlog)",
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
          "rules",
          "snapshot",
          "timeline",
          "kernel",
          "log-dump",
          "log-clear",
          "crash-report",
        ],
        required: true,
      },
      {
        flags: "--subcommand <subcommand>",
        description:
          "For --action start: dlog-collect, exception-detect, or start-monitoring (recommended). For --action probe: list or run. For --action rules: list, show, validate, or test. For --action snapshot: create, list, compare, or delete. For --action kernel: collect (background collector), stop, or analyze. For --action timeline: show, report, analyze, or export.",
        default: "start-monitoring",
      },
      {
        flags: "--app-id <id>",
        description:
          "Tizen app ID (e.g., org.example.myapp). Required for app-launch, app-terminate, dlog-collect, error-analyze and app-log. For --action search (collection mode): same as --category (restrict the search to this app's logs). For --action error-analyze / search --file: declared app label (not a verified identity), used with --pid. For --action kernel analyze --file --with-dlog: app ID for dlog correlation. For --action probe --subcommand run: the app whose PID/app id the probe substitutes (app-process, io, ...) when --probe-id names the probe; without --probe-id it is read as the probe id itself (legacy form). For --action rules: the rule id (show), fixture path (test) or rule file/dir (validate). For --action crash-report: same as --process (give one of the two; different values are rejected).",
      },
      {
        flags: "--process <name>",
        description:
          "For --action crash-report: only dumps of this app id or process name (e.g. deviced — a system daemon needs no app id). Default: every process.",
      },
      {
        flags: "--dump-dir <path>",
        description:
          "For --action crash-report: one more device directory to search, in addition to /opt/usr/share/crash/dump and /run/crash/dump (repeatable).",
        repeatable: true,
      },
      {
        flags: "--limit <n>",
        description:
          "For --action crash-report: how many of the newest matching dumps to open (default 3; 0 = all — each opened dump costs two sdb shell calls, so 0 can take minutes on a full directory).",
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
          "For --action log-dump: how many trailing lines to return in the envelope (default 200; 0 = all). The complete dump is always written to --output / the default dump file. For --action crash-report: report lines returned inline per dump (default 80; 0 = all); the full report is saved to a file.",
      },
      {
        flags: "--output <file>",
        description:
          "For --action log-dump: host file that receives the complete dump (default: <tmp>/tizen-dlog-analyzer/dlog-dump.log). For --action app-log / search: file that receives the complete output (--max-lines/--max-chars apply to stdout only). For --action timeline export: the JSON file. For --action crash-report: a host DIRECTORY (not a file) for the extracted reports (default: <tmp>/tizen-dlog-analyzer/crash-reports/<serial>/).",
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
          "For --action app-log / search: only entries with this dlog tag (repeatable).",
        repeatable: true,
      },
      {
        flags: "--keyword <kw>",
        description: "For --action app-log: filter by keyword (repeatable).",
        repeatable: true,
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
          "For --action investigate and --action probe --subcommand run: consent to network-egress probes (reachability, tls-handshake).",
        default: false,
      },
      {
        flags: "--rules-dir <path>",
        description:
          "For --action investigate/rules: load extra user rule YAML from this directory.",
      },
      {
        flags: "--parallel",
        description: "For --action investigate: run probes concurrently.",
        default: false,
      },
      {
        flags: "--max-workers <n>",
        description:
          "For --action investigate: concurrency limit with --parallel (default 4).",
      },
      {
        flags: "--deduplicate",
        description:
          "For --action investigate: remove near-duplicate evidence.",
        default: false,
      },
      {
        flags: "--similarity-threshold <float>",
        description:
          "For --action investigate: threshold for near-dup detection (0.0-1.0, default 1.0).",
      },
      {
        flags: "--allow-heavy",
        description:
          "For --action investigate: include probes that take >5 s or generate load.",
        default: false,
      },
      {
        flags: "--no-noise-filter",
        description:
          "For --action investigate: show all dlog findings including known-benign.",
        default: false,
      },
      {
        flags: "--fuzzy-symptoms",
        description:
          "For --action investigate: Levenshtein <=2 typo-tolerant symptom matching.",
        default: false,
      },
      {
        flags: "--symptom-map <path>",
        description:
          "For --action investigate: replace the built-in symptom map entirely.",
      },
      {
        flags: "--probe-id <id>",
        description:
          "For --action timeline: filter to a specific probe ID. For --action probe --subcommand run: the probe to run (then --app-id is the app the probe is scoped to).",
      },
      {
        flags: "--family <f>",
        description:
          "For --action rules --subcommand list: filter rules by family (crash, network, performance, memory, audio, peripheral, power, security, hang, service, storage, launch, graphics, time, media).",
      },
      {
        flags: "--expect <rule_id>",
        description:
          "For --action rules --subcommand test: comma-separated rule ids that must be concluded exactly for the fixture ('none' = no conclusion); the envelope fails otherwise.",
      },
      {
        flags: "--file <path>",
        description:
          "Analyze one saved local dlog or kernel log text file instead of collected logs. Supported by error-analyze, app-log, search, and kernel analyze. In file mode, no SDK directory resolution or device access occurs.",
      },
      {
        flags: "--pid <n>",
        description:
          "Historical capture PID to select from --file (repeatable). Required with --app-id in file mode for error-analyze and search.",
        repeatable: true,
      },
      {
        flags: "--noise-tag <tag>",
        description:
          "Tag excluded while reconstructing --file categories (repeatable).",
        repeatable: true,
      },
      {
        flags: "--level <level>",
        description:
          "For --action kernel analyze --file: minimum level for lines that match no signature (emerg, alert, crit, err, warning, notice, info, debug, or 0-7). Default: warning.",
      },
      {
        flags: "--with-dlog",
        description:
          "For --action kernel analyze --file: also analyze dlog and correlate with kernel findings (requires --app-id).",
        default: false,
      },
      {
        flags: "--with-context",
        description:
          "For --action error-analyze --file: include surrounding context lines for each error entry (default: false).",
        default: false,
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
          return sdkCommands.analyzeErrors(
            o.appId,
            o.format,
            {
              file: o.file,
              pids: o.pid,
              noiseTags: o.noiseTag,
              tags: o.tag,
              categories: o.category,
              withContext: o.withContext,
              maxLines: o.maxLines,
              maxChars: o.maxChars,
            },
            commandLabel,
          );
        case "app-log":
          return sdkCommands.appLog(
            o.appId,
            {
              file: o.file,
              pids: o.pid,
              noiseTags: o.noiseTag,
              categories: o.category,
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
          // --pattern is variadic (array). appLabels reach the core: in file
          // mode they are declared app labels pushed as --app-id; in
          // collection mode searchLogs merges them into categories so they
          // get the same validation and no_logs handling as --category.
          return sdkCommands.searchLogs(
            o.pattern,
            {
              file: o.file,
              appLabels: o.appId,
              pids: o.pid,
              noiseTags: o.noiseTag,
              categories: o.category,
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
              rulesDir: o.rulesDir,
              parallel: o.parallel,
              maxWorkers: o.maxWorkers,
              deduplicate: o.deduplicate,
              similarityThreshold: o.similarityThreshold,
              allowHeavy: o.allowHeavy,
              noNoiseFilter: o.noNoiseFilter,
              fuzzySymptoms: o.fuzzySymptoms,
              symptomMap: o.symptomMap,
            },
            commandLabel,
          );
        case "probe": {
          // `probe run` has two ids: the probe to run and, optionally, the app
          // it is scoped to. Historically --app-id carried the probe id; keep
          // that working, but when --probe-id names the probe, --app-id is the
          // app (otherwise the probe id would be sent to the binary as the app
          // id too and `{pid}` probes would resolve a non-existent app).
          const probeId = o.probeId ?? o.appId;
          const scopedAppId = o.probeId ? o.appId : undefined;
          return sdkCommands.runProbe(
            o.subcommand,
            probeId,
            o.serial,
            {
              format: o.format,
              appId: scopedAppId,
              allowNetworkProbe: o.allowNetworkProbe,
            },
            commandLabel,
          );
        }
        case "rules":
          return sdkCommands.manageRules(
            o.subcommand,
            o.appId,
            {
              rulesDir: o.rulesDir,
              format: o.format,
              family: o.family,
              expect: o.expect,
            },
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
            {
              format: o.format,
              file: o.file,
              since: o.since,
              level: o.level,
              withDlog: o.withDlog,
              appId: o.appId,
              maxLines: o.maxLines,
              maxChars: o.maxChars,
            },
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
        case "crash-report":
          return sdkCommands.collectCrashReports(
            o.serial,
            {
              process: o.process,
              appId: o.appId,
              dumpDir: o.dumpDir,
              limit: o.limit,
              lines: o.lines,
              output: o.output,
            },
            commandLabel,
          );

        default:
          return Promise.resolve({
            command: commandLabel,
            status: "failure",
            errors: [
              {
                category: "invalid_parameters",
                message: `Unknown action: ${o.action}. Must be one of: start, stop, check, status, app-launch, app-terminate, dlog-collect, stop-collect, error-analyze, app-log, search, device-profile, investigate, probe, rules, snapshot, timeline, kernel, log-dump, log-clear, crash-report`,
              },
            ],
          });
      }
    },
  },
];
