// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * dlog-analyzer tests
 *
 * Covers the pure (no-device, no-binary) parts of the dlog-analyzer domain:
 *   - isValidAppId: the app id is interpolated into `sdb shell` command
 *     strings, so anything outside [A-Za-z0-9._-] must be rejected
 *   - parseFirstPid: pgrep / pidof output parsing
 *   - extractPidFromPsOutput: `ps` output filtering — whole-token match so
 *     org.example.myapp does not pick up org.example.myapp2
 *   - parseErrorCount: unique-error count from native error-analyze output
 *   - parseFilterSpecs: `--filter` of log-dump — dlog filterspecs are spliced
 *     into the sdb command line, so anything outside <tag>[:<prio>] is rejected
 *   - tailLines: the tail returned by log-dump (total / returned / truncated)
 *   - sanitizeDlogOutput: ANSI colour escapes and CR/CRLF/CRCRLF line breaks
 *     in a raw `sdb dlog` dump are normalised before tailing / writing
 *   - buildLogClearGate: log-clear refuses without --confirm
 *     (user_input_required + suggested_fix), same contract as emulator reset
 *   - deviceErrorEnvelope: a resolveSerial() failure keeps its category
 *     (multiple_devices / device_not_found / invalid_parameters / io_error),
 *     multiple_devices lists only online devices, and device_not_found never
 *     carries a devices array (PR #192 follow-up)
 *   - resolveLogBaseDir: the SDK-resolved log directory must follow the
 *     native binary's sdk_paths.py rule exactly (config file -> sdk.info
 *     TIZEN_SDK_DATA_PATH or <sdk>-data sibling -> dloganalyzer/), or
 *     error-analyze / app-log would look for logs the binary never wrote
 *
 * Plus drift guards:
 *   - no copy of the runner (dlog-analyzer.js, tizen-dlog-analyzer.sh, the
 *     tizen-cli spec) may pass `--base-dir` or an output directory again — the
 *     CLI removed the option in TizenDLogAnalyzer PR #155 ("No such option")
 *   - the REPORT_TEMPLATE.md must be byte-identical between the
 *     common/ skill (Claude/Cline/Codex/Gemini/VS Code) and the tizen-cli skill
 *   - the CLI runner must not pass a third positional to analyzeErrors (its
 *     third parameter is the envelope command label, not a serial)
 *   - the CLI runner and the tizen-cli command spec both expose log-dump /
 *     log-clear (with --confirm), so the two harnesses cannot drift apart
 *   - the detached collectors run with PYTHONUNBUFFERED, are interrupted
 *     before being killed, and `stop` returns the captured analysis tail
 *     (issue #226); `start stop` is answered with "run 'stop'"
 *   - the final-report skeleton is present in every lane's skill text and
 *     travels with check / error-analyze / kernel analyze
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  resolveLogBaseDir,
  appLogFile,
  startDlogAnalyzer,
  isValidAppId,
  parseFirstPid,
  extractPidFromPsOutput,
  parseErrorCount,
  parseFilterSpecs,
  tailLines,
  sanitizeDlogOutput,
  buildLogClearGate,
  deviceErrorEnvelope,
  appLog,
  deviceProfile,
  investigate,
  runProbe,
  manageSnapshot,
  runTimeline,
  manageKernel,
  collectorEnv,
  capturedOutputSummary,
  resolveBinary,
  runBinary,
  recoverEncodingCrash,
  BINARY_SUBPATH,
  awaitCollectorStartup,
  describeLockHolder,
  lockedCollectorError,
  processImageName,
  LOCK_REFUSAL_RE,
  REPORT_FORMAT_HINT,
  STOP_OUTPUT_LINES,
} = require("../core/dlog-analyzer");
const { VERSION_DIR_RE } = require("../core/plugin-cache");

console.log("=== dlog-analyzer Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

// Test 1: isValidAppId — accept Tizen ids, reject shell syntax
console.log("Test 1: isValidAppId");
check("dotted id", isValidAppId("org.example.myapp"), true);
check("10-char package prefix", isValidAppId("abcdEFGH12.MyApp"), true);
check("hyphen and underscore", isValidAppId("my-app_1"), true);
check("semicolon injection", isValidAppId("org.example; rm -rf /"), false);
check("space", isValidAppId("a b"), false);
check("subshell", isValidAppId("$(id)"), false);
check("backtick", isValidAppId("`id`"), false);
check("empty", isValidAppId(""), false);
check("undefined", isValidAppId(undefined), false);
check("null", isValidAppId(null), false);
check("number", isValidAppId(123), false);

// Test 2: parseFirstPid — pgrep (one per line) and pidof (one line) output
console.log("\nTest 2: parseFirstPid");
check("pgrep multi-line", parseFirstPid("1234\n5678\n"), 1234);
check("pidof single line", parseFirstPid("  4321 999"), 4321);
check("empty", parseFirstPid(""), null);
check("non-numeric", parseFirstPid("no match"), null);
check("zero", parseFirstPid("0"), null);
check("negative", parseFirstPid("-5"), null);
check("non-string", parseFirstPid(undefined), null);

// Test 3: extractPidFromPsOutput — layouts and whole-token matching
console.log("\nTest 3: extractPidFromPsOutput");
const busybox = [
  "  PID USER       STAT   VSZ %CPU %MEM COMMAND",
  " 2001 app        S     1234  0.0  1.0 /opt/usr/globalapps/org.example.myapp2/bin/myapp2",
  " 2002 app        S     1234  0.0  1.0 /opt/usr/globalapps/org.example.myapp/bin/myapp",
].join("\n");
check(
  "busybox: skips org.example.myapp2, picks org.example.myapp",
  extractPidFromPsOutput(busybox, "org.example.myapp"),
  2002,
);
check(
  "busybox: the longer id still resolves",
  extractPidFromPsOutput(busybox, "org.example.myapp2"),
  2001,
);
const standard = [
  "UID        PID  PPID  C STIME TTY          TIME CMD",
  "app       3010     1  0 10:00 ?        00:00:00 /usr/bin/wrt-loader org.example.myapp",
].join("\n");
check(
  "standard layout: first integer on the line is the PID",
  extractPidFromPsOutput(standard, "org.example.myapp"),
  3010,
);
const grepOnly = [
  "  PID USER       STAT   VSZ %CPU %MEM COMMAND",
  " 4004 root       S      500  0.0  0.1 grep org.example.myapp",
].join("\n");
check(
  "grep process carrying the id is skipped",
  extractPidFromPsOutput(grepOnly, "org.example.myapp"),
  null,
);
check(
  "header only",
  extractPidFromPsOutput("  PID USER STAT COMMAND\n", "org.example.myapp"),
  null,
);
check(
  "dot is literal, not regex any-char",
  extractPidFromPsOutput(
    " 5005 app S 1 0.0 0.1 /bin/orgXexampleXmyapp",
    "org.example.myapp",
  ),
  null,
);
check("empty output", extractPidFromPsOutput("", "org.example.myapp"), null);
check("missing app id", extractPidFromPsOutput(busybox, ""), null);

// Test 4: parseErrorCount
console.log("\nTest 4: parseErrorCount");
// Legacy format: "Found N unique errors"
check("found N unique errors", parseErrorCount("Found 3 unique errors"), 3);
check("case-insensitive", parseErrorCount("12 Unique Error(s) listed"), 12);
// Current format: summary lines "N. Module=TAG | Repeated=X | Message: ..."
check(
  "current: summary lines count",
  parseErrorCount(
    "\nError summaries in org.example.myapp\n\n" +
      "1. Module=CHROMIUM | Repeated=5 | Message: handshake failed\n" +
      "2. Module=EFL | Repeated=2 | Message: elm_bg color set failed\n" +
      "3. Module=CAPI_SYSTEM_RESOURCE | Repeated=1 | Message: timeout\n",
  ),
  3,
);
// Current format: details only "[Error N]" blocks
check(
  "current: detail blocks count",
  parseErrorCount(
    "\nError details of org.example.myapp\n\n" +
      "[Error 1]\n  Module: CHROMIUM\n  Occurrences: 5\n  Full log: handshake failed\n" +
      "[Error 2]\n  Module: EFL\n  Occurrences: 2\n  Full log: elm_bg color set failed\n",
  ),
  2,
);
// Current format: both summary + details (summary takes precedence)
check(
  "current: both summary + details",
  parseErrorCount(
    "\nError summaries in org.example.myapp\n\n" +
      "1. Module=CHROMIUM | Repeated=5 | Message: handshake failed\n" +
      "\nError details of org.example.myapp\n\n" +
      "[Error 1]\n  Module: CHROMIUM\n  Occurrences: 5\n  Full log: handshake failed\n",
  ),
  1,
);
// Current format wins over legacy free-text match: app log text echoed in a
// Message/Full log line must not override the real finding count
check(
  "current: legacy phrase inside a message does not override summary count",
  parseErrorCount(
    "\nError summaries in org.example.myapp\n\n" +
      "1. Module=CACHE | Repeated=1 | Message: found 7 unique errors skipped\n" +
      "2. Module=EFL | Repeated=2 | Message: elm_bg color set failed\n",
  ),
  2,
);
check(
  "current: legacy phrase inside a Full log line does not override detail count",
  parseErrorCount(
    "\nError details of org.example.myapp\n\n" +
      "[Error 1]\n  Module: CACHE\n  Occurrences: 1\n  Full log: 7 unique errors skipped\n",
  ),
  1,
);
check("no count", parseErrorCount("no errors"), 0);
check("empty", parseErrorCount(""), 0);
check("non-string", parseErrorCount(undefined), 0);

// Test 5: REPORT_TEMPLATE.md drift guard — same bytes on every lane, and the
// template carries both language blocks (English and Korean) so the agent can
// render the one matching the user's language
console.log("\nTest 5: REPORT_TEMPLATE.md drift guard");
const commonTemplate = path.resolve(
  __dirname,
  "..",
  "..",
  "skills",
  "tizen-dlog-analyzer",
  "REPORT_TEMPLATE.md",
);
const cliTemplate = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "tizen-cli",
  "skills",
  "tizen-dlog-analyzer",
  "REPORT_TEMPLATE.md",
);
check("common template exists", fs.existsSync(commonTemplate), true);
check("tizen-cli template exists", fs.existsSync(cliTemplate), true);
if (fs.existsSync(commonTemplate) && fs.existsSync(cliTemplate)) {
  const commonText = fs.readFileSync(commonTemplate, "utf-8");
  const cliText = fs.readFileSync(cliTemplate, "utf-8");
  check("templates are byte-identical", commonText === cliText, true);
  for (const marker of [
    "## Analysis Report (English)",
    "## 분석 보고서 (한국어)",
    "근본 원인",
    "임시 해결 방법",
    "\n---\n",
  ]) {
    check(
      `template contains ${JSON.stringify(marker)}`,
      commonText.includes(marker),
      true,
    );
  }
}

// Test 6: CLI arity guard — error-analyze takes <app-id> [format] only
console.log("\nTest 6: dlog-analyzer-cli.js error-analyze arity");
const cliSource = fs.readFileSync(
  path.resolve(__dirname, "..", "cli", "dlog-analyzer-cli.js"),
  "utf-8",
);
check(
  "no third positional passed to analyzeErrors",
  /analyzeErrors\(\s*param1\s*,\s*param2\s*,\s*param3\s*\)/.test(cliSource),
  false,
);
check(
  "usage does not advertise [serial] for error-analyze",
  cliSource.includes("error-analyze <app-id> [format] [serial]"),
  false,
);

// Test 7: parseFilterSpecs — only <tag>[:<prio>] reaches the sdb command line
console.log("\nTest 7: parseFilterSpecs");
check("empty → no specs", parseFilterSpecs(undefined), { specs: [] });
check("blank string → no specs", parseFilterSpecs("  "), { specs: [] });
check("errors only", parseFilterSpecs("*:E"), { specs: ["*:E"] });
check("space separated", parseFilterSpecs("E20:W CHROMIUM"), {
  specs: ["E20:W", "CHROMIUM"],
});
check("comma separated", parseFilterSpecs("E20:W,CHROMIUM:V"), {
  specs: ["E20:W", "CHROMIUM:V"],
});
check("array input", parseFilterSpecs(["*:I", "E_COMP"]), {
  specs: ["*:I", "E_COMP"],
});
check("silent priority", parseFilterSpecs("*:S"), { specs: ["*:S"] });
check("unknown priority letter", "error" in parseFilterSpecs("*:X"), true);
check("lowercase priority", "error" in parseFilterSpecs("*:e"), true);
check("shell metachar ;", "error" in parseFilterSpecs("x;rm -rf /"), true);
check("quote", "error" in parseFilterSpecs('a"b'), true);
check("subshell", "error" in parseFilterSpecs("$(id)"), true);
check("pipe", "error" in parseFilterSpecs("a|b"), true);

// Test 8: tailLines — the tail log-dump returns in the envelope
console.log("\nTest 8: tailLines");
const five = "l1\nl2\nl3\nl4\nl5\n";
check("limit below total keeps the last N", tailLines(five, 2), {
  text: "l4\nl5",
  total_lines: 5,
  returned_lines: 2,
  truncated: true,
});
check("limit above total keeps everything", tailLines(five, 10), {
  text: "l1\nl2\nl3\nl4\nl5",
  total_lines: 5,
  returned_lines: 5,
  truncated: false,
});
check("0 = unlimited", tailLines(five, 0).truncated, false);
check("CRLF normalized", tailLines("a\r\nb\r\n", 1), {
  text: "b",
  total_lines: 2,
  returned_lines: 1,
  truncated: true,
});
check("empty dump", tailLines("", 200), {
  text: "",
  total_lines: 0,
  returned_lines: 0,
  truncated: false,
});
check("non-string", tailLines(undefined, 200).total_lines, 0);

// Test 8b: sanitizeDlogOutput — dlog colours E/F lines, Windows sdb doubles CR
console.log("\nTest 8b: sanitizeDlogOutput");
check(
  "ANSI SGR escapes stripped",
  sanitizeDlogOutput("[31;1m09-17 E/TAG: [0mmsg"),
  "09-17 E/TAG: msg",
);
check("CRCRLF → LF", sanitizeDlogOutput("a\r\r\nb\r\n"), "a\nb\n");
check("lone CR → LF", sanitizeDlogOutput("a\rb"), "a\nb");
check("plain text untouched", sanitizeDlogOutput("a\nb"), "a\nb");
check("non-string", sanitizeDlogOutput(undefined), "");
check(
  "sanitized dump tails cleanly",
  tailLines(sanitizeDlogOutput("l1\r\r\nl2\r\r\n[31;1ml3[0m\r\r\n"), 2),
  { text: "l2\nl3", total_lines: 3, returned_lines: 2, truncated: true },
);

// Test 9: buildLogClearGate — log-clear refuses without --confirm
console.log("\nTest 9: log-clear confirmation gate");
const gate = buildLogClearGate("t", "emulator-26101", undefined);
check("no confirm → failure", gate && gate.status, "failure");
check("category", gate.errors[0].category, "user_input_required");
check(
  "suggested_fix re-runs with --confirm and the same serial",
  gate.errors[0].suggested_fix.command,
  "tizen-sdk dlog-analyzer --action log-clear --serial emulator-26101 --confirm",
);
check(
  "no serial → no --serial flag",
  buildLogClearGate("t", undefined, false).errors[0].suggested_fix.command,
  "tizen-sdk dlog-analyzer --action log-clear --confirm",
);
check("confirm=true passes", buildLogClearGate("t", "S", true), null);
check("confirm='true' passes", buildLogClearGate("t", "S", "true"), null);
check(
  "confirm='false' is refused",
  buildLogClearGate("t", "S", "false") !== null,
  true,
);
check(
  "confirm=1 is refused (explicit only)",
  buildLogClearGate("t", "S", 1) !== null,
  true,
);

// Test 9b: deviceErrorEnvelope — resolveSerial failure → envelope contract
console.log("\nTest 9b: deviceErrorEnvelope");
const twoOnlineOneOffline = [
  { serial: "emulator-26101", state: "device", name: "T-1080" },
  { serial: "emulator-26111", state: "device", name: "T-720" },
  { serial: "0000d1d2", state: "offline", name: "tv" },
];
const multi = deviceErrorEnvelope("t", {
  error: "Multiple devices connected (emulator-26101, emulator-26111).",
  errorCategory: "multiple_devices",
  devices: twoOnlineOneOffline,
});
check("multiple_devices: status", multi.status, "failure");
check("multiple_devices: command label", multi.command, "t");
check(
  "multiple_devices: category preserved",
  multi.errors[0].category,
  "multiple_devices",
);
check(
  "multiple_devices: message names both harnesses' serial option",
  multi.errors[0].message,
  "Multiple devices connected (emulator-26101, emulator-26111). Pick one and re-run with the chosen serial (--serial <serial> in tizen-cli, the positional [serial] argument in the plugin runner).",
);
check(
  "multiple_devices: suggested_fix lists the online serials",
  multi.errors[0].suggested_fix,
  {
    command:
      "Re-run with the chosen serial (--serial <one-of: emulator-26101, emulator-26111> in tizen-cli, the positional [serial] argument in the plugin runner)",
    auto_fixable: false,
  },
);
check(
  "multiple_devices: only online devices, only {serial, state}",
  multi.errors[0].devices,
  [
    { serial: "emulator-26101", state: "device" },
    { serial: "emulator-26111", state: "device" },
  ],
);

const noneOnline = deviceErrorEnvelope("t", {
  error: "No connected Tizen device or emulator found.",
  errorCategory: "device_not_found",
  devices: [{ serial: "0000d1d2", state: "offline" }],
});
check(
  "device_not_found: category preserved",
  noneOnline.errors[0].category,
  "device_not_found",
);
check(
  "device_not_found: offline-only listing yields no devices array",
  Object.prototype.hasOwnProperty.call(noneOnline.errors[0], "devices"),
  false,
);

check(
  "device_not_found: undefined devices tolerated",
  deviceErrorEnvelope("t", {
    error: "none",
    errorCategory: "device_not_found",
  }).errors[0],
  { category: "device_not_found", message: "none" },
);

check(
  "invalid_parameters is not collapsed into device_not_found",
  deviceErrorEnvelope("t", {
    error: 'Invalid device serial "emu;rm"',
    errorCategory: "invalid_parameters",
  }).errors[0],
  { category: "invalid_parameters", message: 'Invalid device serial "emu;rm"' },
);

check(
  "io_error is not collapsed into device_not_found",
  deviceErrorEnvelope("t", {
    error: "sdb devices failed: spawn ENOENT",
    errorCategory: "io_error",
  }).errors[0].category,
  "io_error",
);

check(
  "missing sdb binary (no category) defaults to device_not_found",
  deviceErrorEnvelope("t", { error: "sdb not found" }).errors[0],
  { category: "device_not_found", message: "sdb not found" },
);

// Test 10: both harnesses expose the one-shot log actions
console.log("\nTest 10: log-dump / log-clear surface drift guard");
check("CLI runner accepts log-dump", cliSource.includes('"log-dump"'), true);
check("CLI runner accepts log-clear", cliSource.includes('"log-clear"'), true);
check("CLI runner parses --confirm", cliSource.includes('"--confirm"'), true);
check("CLI runner parses --filter", cliSource.includes('"--filter"'), true);
const tsSpec = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "tizen-cli",
  "src",
  "command-specs",
  "dlog-analyzer.ts",
);
check("tizen-cli spec exists", fs.existsSync(tsSpec), true);
if (fs.existsSync(tsSpec)) {
  const tsSource = fs.readFileSync(tsSpec, "utf-8");
  check(
    "tizen-cli spec offers log-dump",
    tsSource.includes('"log-dump"'),
    true,
  );
  check(
    "tizen-cli spec offers log-clear",
    tsSource.includes('"log-clear"'),
    true,
  );
  check(
    "tizen-cli spec offers --confirm",
    tsSource.includes('"--confirm"'),
    true,
  );
  check(
    "tizen-cli spec offers --filter",
    tsSource.includes('"--filter <specs>"'),
    true,
  );
}

// Test 11: New v0.1.3 commands — param validation (no device/binary needed)
console.log("\nTest 11: new v0.1.3 command param validation");

// appLog — requires appId
(async () => {
  const r = await appLog(undefined);
  check("appLog no appId → failure", r.status, "failure");
  check(
    "appLog no appId → invalid_parameters",
    r.errors[0].category,
    "invalid_parameters",
  );
  check(
    "appLog invalid appId → failure",
    (await appLog("$(id)")).status,
    "failure",
  );
  check(
    "appLog invalid appId → invalid_parameters",
    (await appLog("$(id)")).errors[0].category,
    "invalid_parameters",
  );
})();

// deviceProfile — no params to validate; its failure mode on this host
// depends on the SDK config, the bundled binary and a connected device, so
// the deterministic check lives in Test 13b (child process, empty home).
(async () => {
  const r = await deviceProfile();
  check("deviceProfile returns envelope", r.command !== undefined, true);
})();

// investigate — validates appId
(async () => {
  const r = await investigate("a b");
  check("investigate bad appId → failure", r.status, "failure");
  check(
    "investigate bad appId → invalid_parameters",
    r.errors[0].category,
    "invalid_parameters",
  );
})();

// runProbe — validates subcommand
(async () => {
  const r = await runProbe("invalid");
  check("probe bad sub → failure", r.status, "failure");
  check(
    "probe bad sub → invalid_parameters",
    r.errors[0].category,
    "invalid_parameters",
  );
  // probe run without probeId
  const r2 = await runProbe("run");
  check("probe run no id → failure", r2.status, "failure");
  check(
    "probe run no id → invalid_parameters",
    r2.errors[0].category,
    "invalid_parameters",
  );
})();

// manageSnapshot — validates subcommand
(async () => {
  const r = await manageSnapshot("invalid");
  check("snapshot bad sub → failure", r.status, "failure");
  check(
    "snapshot bad sub → invalid_parameters",
    r.errors[0].category,
    "invalid_parameters",
  );
  // snapshot compare without IDs
  const r2 = await manageSnapshot("compare");
  check("snapshot compare no ids → failure", r2.status, "failure");
  check(
    "snapshot compare no ids → invalid_parameters",
    r2.errors[0].category,
    "invalid_parameters",
  );
  // snapshot compare with only one ID
  const r3 = await manageSnapshot("compare", ["only-one"]);
  check("snapshot compare one id → failure", r3.status, "failure");
  check(
    "snapshot compare one id → invalid_parameters",
    r3.errors[0].category,
    "invalid_parameters",
  );
  // snapshot delete without ID
  const r4 = await manageSnapshot("delete");
  check("snapshot delete no id → failure", r4.status, "failure");
  check(
    "snapshot delete no id → invalid_parameters",
    r4.errors[0].category,
    "invalid_parameters",
  );
})();

// manageKernel — validates subcommand; `stop` is idempotent (issue #213:
// `kernel collect` is a background collector like dlog-collect, so there must
// be a stop that succeeds even when nothing is running)
(async () => {
  const r = await manageKernel("invalid");
  check("kernel bad sub → failure", r.status, "failure");
  check(
    "kernel bad sub → invalid_parameters",
    r.errors[0].category,
    "invalid_parameters",
  );
  check(
    "kernel bad sub message lists collect, stop, analyze",
    r.errors[0].message.includes("collect, stop, analyze"),
    true,
  );
  const s = await manageKernel("stop");
  check("kernel stop with no collector → success", s.status, "success");
  check(
    "kernel stop with no collector → was_running false",
    s.result.was_running,
    false,
  );
})();

// runTimeline — validates subcommand
(async () => {
  const r = await runTimeline("invalid");
  check("timeline bad sub → failure", r.status, "failure");
  check(
    "timeline bad sub → invalid_parameters",
    r.errors[0].category,
    "invalid_parameters",
  );
  // timeline with no subcommand defaults to "show" and goes to the binary:
  // on a host with the bundled pre-#155 binary and no SDK config that used
  // to "succeed" against ./logs, so its outcome is asserted in Test 13b
  // (child process, empty home → sdk_path_not_set), not here.
})();

// Test 12: CLI runner exposes new actions
console.log("\nTest 12: CLI runner new actions drift guard");
check("CLI runner accepts app-log", cliSource.includes('"app-log"'), true);
check(
  "CLI runner accepts device-profile",
  cliSource.includes('"device-profile"'),
  true,
);
check(
  "CLI runner accepts investigate",
  cliSource.includes('"investigate"'),
  true,
);
check("CLI runner accepts probe", cliSource.includes('"probe"'), true);
check("CLI runner accepts snapshot", cliSource.includes('"snapshot"'), true);
check("CLI runner accepts timeline", cliSource.includes('"timeline"'), true);
check("CLI runner accepts kernel", cliSource.includes('"kernel"'), true);
check("CLI runner parses --format", cliSource.includes('"--format"'), true);
check(
  "CLI runner parses --max-lines",
  cliSource.includes('"--max-lines"'),
  true,
);
check(
  "CLI runner parses --max-chars",
  cliSource.includes('"--max-chars"'),
  true,
);
check("CLI runner parses --tag", cliSource.includes('"--tag"'), true);
check("CLI runner parses --refresh", cliSource.includes('"--refresh"'), true);

// Test 13: resolveLogBaseDir — mirrors the binary's sdk_paths.py exactly
console.log("\nTest 13: resolveLogBaseDir (SDK-resolved log directory)");
{
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dlog-basedir-"));
  const sdkRoot = path.join(scratch, "tizen-sdk");
  fs.mkdirSync(sdkRoot, { recursive: true });
  const configFile = path.join(scratch, ".tizen.sdk.path.config");

  // a) sdk.info names the data path — authoritative, need not be a sibling
  fs.writeFileSync(configFile, `${sdkRoot}\n`);
  const customData = path.join(scratch, "elsewhere", "sdk-data");
  fs.writeFileSync(
    path.join(sdkRoot, "sdk.info"),
    `TIZEN_SDK_INSTALLED_PATH=${sdkRoot}\nTIZEN_SDK_DATA_PATH=${customData}\n`,
  );
  const viaInfo = resolveLogBaseDir({ configFile });
  check(
    "sdk.info TIZEN_SDK_DATA_PATH → <data>/dloganalyzer",
    viaInfo.baseDir,
    path.join(customData, "dloganalyzer"),
  );
  check("source = sdk.info", viaInfo.source, "sdk.info");
  check("sdkRoot reported", viaInfo.sdkRoot, sdkRoot);
  check(
    "directory is NOT created by the resolver (the binary owns it)",
    fs.existsSync(viaInfo.baseDir),
    false,
  );

  // b) sdk.info without the key → <sdk>-data sibling
  fs.writeFileSync(
    path.join(sdkRoot, "sdk.info"),
    `TIZEN_SDK_INSTALLED_PATH=${sdkRoot}\n`,
  );
  const viaSibling = resolveLogBaseDir({ configFile });
  check(
    "no key → <sdk>-data sibling",
    viaSibling.baseDir,
    path.join(scratch, "tizen-sdk-data", "dloganalyzer"),
  );
  check("source = sibling", viaSibling.source, "sibling");

  // c) no sdk.info at all → sibling as well
  fs.unlinkSync(path.join(sdkRoot, "sdk.info"));
  check(
    "no sdk.info → <sdk>-data sibling",
    resolveLogBaseDir({ configFile }).baseDir,
    path.join(scratch, "tizen-sdk-data", "dloganalyzer"),
  );

  // d) config whitespace is trimmed (tizen-sdk-init writes a trailing newline)
  fs.writeFileSync(configFile, `  ${sdkRoot}  \r\n`);
  check(
    "config path is trimmed",
    resolveLogBaseDir({ configFile }).sdkRoot,
    sdkRoot,
  );

  // e) appLogFile is rooted at the resolved base dir
  check(
    "appLogFile under <base>/app/<id>/<id>.hot.log",
    appLogFile("org.example.myapp", viaSibling.baseDir),
    path.join(
      viaSibling.baseDir,
      "app",
      "org.example.myapp",
      "org.example.myapp.hot.log",
    ),
  );

  // f) stale config: the SDK directory is gone → error, no sibling guess
  fs.writeFileSync(configFile, path.join(scratch, "removed-sdk"));
  const stale = resolveLogBaseDir({ configFile });
  check("stale SDK path → error", "error" in stale, true);
  check(
    "stale SDK path error names the path",
    stale.error.includes("does not exist"),
    true,
  );

  // g) config points at a file, not a directory → error
  fs.writeFileSync(configFile, configFile);
  check(
    "config naming a file → error",
    "error" in resolveLogBaseDir({ configFile }),
    true,
  );

  // h) empty config → not configured
  fs.writeFileSync(configFile, "   \n");
  const empty = resolveLogBaseDir({ configFile });
  check("empty config → error", "error" in empty, true);
  check(
    "empty config error mentions tizen-sdk-init",
    empty.error.includes("tizen-sdk-init"),
    true,
  );

  // i) missing config → not configured
  fs.unlinkSync(configFile);
  check(
    "missing config → error",
    "error" in resolveLogBaseDir({ configFile }),
    true,
  );

  // The cases below pin the binary's Python string handling (sdk_paths.py
  // uses str.strip() / str.splitlines()), where JS trim()/split differ.

  // j) a TIZEN_SDK_DATA_PATH= line with an EMPTY value does not stop the
  //    scan — the binary's loop `continue`s to the next line
  fs.writeFileSync(configFile, `${sdkRoot}\n`);
  fs.writeFileSync(
    path.join(sdkRoot, "sdk.info"),
    `TIZEN_SDK_DATA_PATH=\nTIZEN_SDK_INSTALLED_PATH=${sdkRoot}\nTIZEN_SDK_DATA_PATH=  ${customData}  \n`,
  );
  const afterEmpty = resolveLogBaseDir({ configFile });
  check(
    "empty-value line is skipped, later value wins",
    afterEmpty.baseDir,
    path.join(customData, "dloganalyzer"),
  );
  check("empty-value line: source = sdk.info", afterEmpty.source, "sdk.info");

  // k) CR-only and U+2028 line separators split like Python splitlines()
  fs.writeFileSync(
    path.join(sdkRoot, "sdk.info"),
    `A=1\rTIZEN_SDK_DATA_PATH=${customData}\u2028B=2`,
  );
  check(
    "\\r / U+2028 line separators are honoured",
    resolveLogBaseDir({ configFile }).baseDir,
    path.join(customData, "dloganalyzer"),
  );

  // l) a BOM on the sdk.info line is NOT stripped by the binary, so the key
  //    does not match → sibling (JS trim() would have matched it)
  fs.writeFileSync(
    path.join(sdkRoot, "sdk.info"),
    `\ufeffTIZEN_SDK_DATA_PATH=${customData}\n`,
  );
  check(
    "BOM-prefixed sdk.info line is not a match → sibling",
    resolveLogBaseDir({ configFile }).source,
    "sibling",
  );

  // m) a BOM-prefixed config file: the binary keeps U+FEFF as the first
  //    character of the path and fails is_dir() — mirror that, and say why
  fs.writeFileSync(configFile, `\ufeff${sdkRoot}\r\n`);
  const bom = resolveLogBaseDir({ configFile });
  check("BOM-prefixed config → error", "error" in bom, true);
  check(
    "BOM error explains the byte-order mark",
    bom.error.includes("byte-order mark"),
    true,
  );
  check(
    "BOM error names the path without the BOM in the fix",
    bom.error.includes(`--sdk-path ${sdkRoot}`),
    true,
  );

  fs.rmSync(scratch, { recursive: true, force: true });
}

// Test 13b: the SDK-path pre-check comes first in every action whose binary
// command reads or writes the log directory — before the binary and device
// lookups — so on a host with an empty home the envelope carries
// sdk_path_not_set and nothing else, whichever binary build is bundled
// (the pre-#155 build would otherwise "succeed" against ./logs). Runs the
// real CLI in a child process with USERPROFILE/HOME pointed at an empty
// directory (that is where sdk.js's CONFIG_FILE is read from). app-launch is
// the control: it does not touch the log directory and must NOT be gated.
console.log(
  "\nTest 13b: sdk_path_not_set is the first error of every log action",
);
{
  const { spawnSync } = require("child_process");
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), "dlog-nohome-"));
  const cli = path.join(__dirname, "..", "cli", "dlog-analyzer-cli.js");
  const env = { ...process.env, USERPROFILE: emptyHome, HOME: emptyHome };
  delete env.TIZEN_SDK_PATH;
  const run = (argv) => {
    const r = spawnSync(process.execPath, [cli, ...argv], {
      env,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      return JSON.parse(r.stdout);
    } catch (_e) {
      return null;
    }
  };
  for (const argv of [
    ["start", "start-monitoring"],
    ["dlog-collect", "org.example.app"],
    ["error-analyze", "org.example.app"],
    ["app-log", "org.example.app"],
    ["device-profile"],
    ["investigate", "org.example.app"],
    ["probe", "list"],
    ["snapshot", "list"],
    ["timeline"], // defaults to "show"
    ["timeline", "show"],
    ["kernel", "analyze"],
  ]) {
    const envelope = run(argv);
    const label = argv.join(" ");
    check(
      `${label}: envelope status failure`,
      envelope && envelope.status,
      "failure",
    );
    check(
      `${label}: first (and only) error is sdk_path_not_set`,
      envelope && envelope.errors.map((e) => e.category || e.error_category),
      ["sdk_path_not_set"],
    );
    check(
      `${label}: message points at tizen-sdk-init`,
      Boolean(envelope && /tizen-sdk-init/.test(envelope.errors[0].message)),
      true,
    );
  }
  const control = run(["app-launch", "org.example.app"]);
  check(
    "app-launch (control) is not gated on the SDK config",
    Boolean(
      control &&
      control.status === "failure" &&
      control.errors[0].category !== "sdk_path_not_set",
    ),
    true,
  );
  fs.rmSync(emptyHome, { recursive: true, force: true });
}

// Test 14: no runner copy may pass --base-dir / an output dir to the binary
console.log("\nTest 14: --base-dir removal drift guard");
const domainSource = fs.readFileSync(
  path.resolve(__dirname, "..", "core", "dlog-analyzer.js"),
  "utf-8",
);
check(
  "dlog-analyzer.js never passes the --base-dir flag",
  /["']--base-dir["']/.test(domainSource),
  false,
);
const shSource = fs.readFileSync(
  path.resolve(
    __dirname,
    "..",
    "..",
    "scripts",
    "tizen-dlog-analyzer",
    "tizen-dlog-analyzer.sh",
  ),
  "utf-8",
);
check(
  "tizen-dlog-analyzer.sh never passes --base-dir",
  /^[^#]*--base-dir/m.test(shSource),
  false,
);
check(
  "tizen-dlog-analyzer.sh no longer documents an output_dir argument",
  shSource.includes("[output_dir]"),
  false,
);
check(
  "CLI runner usage no longer advertises [output_dir]",
  cliSource.includes("[output_dir]"),
  false,
);
if (fs.existsSync(tsSpec)) {
  const tsSource = fs.readFileSync(tsSpec, "utf-8");
  const startCall = /startDlogAnalyzer\(([\s\S]*?)\)/.exec(tsSource);
  check("tizen-cli spec calls startDlogAnalyzer", startCall !== null, true);
  check(
    "tizen-cli spec does not pass o.outputDir to startDlogAnalyzer",
    startCall ? startCall[1].includes("o.outputDir") : true,
    false,
  );
}

// Test 15: startDlogAnalyzer refuses a legacy output directory up front
console.log("\nTest 15: startDlogAnalyzer rejects a custom output directory");
(async () => {
  const r = await startDlogAnalyzer("start-monitoring", undefined, "./logs");
  check("custom output dir → failure", r.status, "failure");
  check(
    "custom output dir → invalid_parameters",
    r.errors[0].category,
    "invalid_parameters",
  );
  check(
    "message explains the SDK-resolved location",
    r.errors[0].message.includes("dloganalyzer"),
    true,
  );
})();

// Test 16: the live analysis must reach the output file and survive `stop`
// (issue #226): the collectors are a PyInstaller build, so their stdout must
// be unbuffered, they must be interrupted (SIGINT) before being killed, and
// `stop` must hand back what the session captured.
console.log(
  "\nTest 16: collector output is unbuffered, flushed and returned by stop",
);
const fakeDevice = { serial: "emulator-26101", sdbPath: "/sdk/tools/sdb" };
const env = collectorEnv(fakeDevice);
check("PYTHONUNBUFFERED=1 is set", env.PYTHONUNBUFFERED, "1");
check("SDB_SERIAL is passed through", env.SDB_SERIAL, "emulator-26101");
check("SDB_PATH is passed through", env.SDB_PATH, "/sdk/tools/sdb");
check(
  "every detached collector spawn uses collectorEnv",
  (domainSource.match(/detached: true/g) || []).length,
  (domainSource.match(/env: collectorEnv\(device\)/g) || []).length,
);
check(
  "three detached collectors exist",
  (domainSource.match(/detached: true/g) || []).length,
  3,
);
check(
  "SIGTERM is only sent by terminateGracefully (after SIGINT)",
  (domainSource.match(/"SIGTERM"/g) || []).length,
  1,
);
check(
  "no stop path kills without the graceful sequence",
  /process\.kill\(pid, "SIGKILL"\)/.test(
    domainSource.replace(/async function terminateGracefully[\s\S]*?\n}\n/, ""),
  ),
  false,
);
const capDir = fs.mkdtempSync(path.join(os.tmpdir(), "dlog-cap-"));
const capFile = path.join(capDir, "analyzer-output.log");
check("missing output file → null", capturedOutputSummary(capFile, 200), null);
const capLines = [];
for (let i = 1; i <= 300; i++) capLines.push(`\x1b[31mline ${i}\x1b[0m`);
fs.writeFileSync(capFile, capLines.join("\r\n") + "\r\n");
const cap = capturedOutputSummary(capFile, STOP_OUTPUT_LINES);
check("stop tail keeps the last 200 lines", cap.returned_lines, 200);
check("stop tail reports the full length", cap.total_lines, 300);
check("stop tail is flagged truncated", cap.truncated, true);
check(
  "stop tail ends with the last line",
  cap.output.endsWith("line 300"),
  true,
);
check("stop tail starts at line 101", cap.output.startsWith("line 101"), true);
check(
  "ANSI escapes and CRLF are normalised",
  cap.output.includes("\x1b["),
  false,
);
fs.rmSync(capDir, { recursive: true, force: true });
check(
  "stop message tells the agent to run check",
  /run 'check' for all of it/.test(domainSource),
  true,
);
check(
  "dlog-collect crash while the monitor runs points at check, not stop",
  /do not stop the monitor mid-reproduction/.test(domainSource),
  true,
);
// stdout and stderr must share ONE descriptor (`2>&1`): a second open of the
// capture file has its own offset, and stdout then overwrites what stderr
// appended — lines of the captured analysis silently disappear.
check(
  "every collector shares one fd for stdout and stderr",
  (domainSource.match(/stdio: \["ignore", outFd, outFd\]/g) || []).length,
  3,
);
check(
  "the capture file is never opened a second time for stderr",
  /errFd|openSync\([A-Z_]*OUTPUT_FILE, "a"\)/.test(domainSource),
  false,
);
check(
  "the capture file is only truncated through openCollectorOutput",
  (domainSource.match(/openCollectorOutput\([A-Z_]*OUTPUT_FILE\)/g) || [])
    .length,
  3,
);
// A collector that exits during the 2 s grace window must not leave its PID
// on disk: once the OS reuses the number, getRunningPid() reports a stranger
// as the monitor and `stop` signals it. Each "exited immediately" envelope is
// preceded by the unlink of its own PID file.
{
  const crashBlocks = domainSource
    .split(/exited immediately\. Output:/)
    .slice(0, -1);
  check("three immediate-exit paths exist", crashBlocks.length, 3);
  check(
    "every immediate-exit path removes its PID file first",
    crashBlocks.every((block) =>
      /fs\.unlinkSync\((PID_FILE|APP_COLLECT_PID_FILE|KERNEL_COLLECT_PID_FILE)\)[\s\S]{0,1200}$/.test(
        block,
      ),
    ),
    true,
  );
}
// An existing but empty capture (nothing printed before `stop`) is reported
// as "" with zero counts — the stop message must not advertise 0 of 0 lines.
{
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "dlog-cap-empty-"));
  const emptyFile = path.join(emptyDir, "analyzer-output.log");
  fs.writeFileSync(emptyFile, "");
  const empty = capturedOutputSummary(emptyFile, STOP_OUTPUT_LINES);
  check("empty capture → empty output, zero lines", empty, {
    output: "",
    total_lines: 0,
    returned_lines: 0,
    truncated: false,
  });
  fs.rmSync(emptyDir, { recursive: true, force: true });
  check(
    "stop message is gated on a non-empty capture",
    /summary\.output\s*\?\s*` The analysis captured/.test(domainSource),
    true,
  );
}

// Test 17: `start stop` is a misuse of the CLI, not a subcommand — the error
// must say "run 'stop'" so the agent does not lose the session guessing
console.log("\nTest 17: CLI 'start stop' misuse message");
{
  const { spawnSync } = require("child_process");
  const cliPath = path.resolve(__dirname, "..", "cli", "dlog-analyzer-cli.js");
  const r = spawnSync(process.execPath, [cliPath, "start", "stop"], {
    encoding: "utf-8",
  });
  check("start stop exits 1", r.status, 1);
  let env2 = null;
  try {
    env2 = JSON.parse(r.stdout);
  } catch {}
  check("start stop returns an envelope", env2 !== null, true);
  if (env2) {
    check(
      "start stop → invalid_parameters",
      env2.errors[0].error_category,
      "invalid_parameters",
    );
    check(
      "start stop → tells the agent to run 'stop' on its own",
      env2.errors[0].message.includes("run 'stop' on its own"),
      true,
    );
  }
}

// Test 18: the final-report shape travels with the data and sits in every
// lane's skill text
console.log("\nTest 18: report shape hint and skeleton");
for (const marker of [
  "## Analysis Report (English)",
  "## 분석 보고서 (한국어)",
  "no tables",
]) {
  check(
    `REPORT_FORMAT_HINT mentions ${JSON.stringify(marker)}`,
    REPORT_FORMAT_HINT.includes(marker),
    true,
  );
}
check(
  "check / error-analyze / kernel analyze attach report_format",
  (domainSource.match(/report_format: REPORT_FORMAT_HINT/g) || []).length,
  3,
);
const skeletonHeading = "## Final report — the only accepted shape";
for (const rel of [
  ["..", "..", "skills", "tizen-dlog-analyzer", "SKILL.md"],
  ["..", "..", "agents", "tizen-dlog-analyzer.md"],
  ["..", "..", "..", "tizen-cli", "skills", "tizen-dlog-analyzer", "SKILL.md"],
]) {
  const file = path.resolve(__dirname, ...rel);
  const text = fs.readFileSync(file, "utf-8");
  const label = rel.slice(-2).join("/");
  check(
    `${label} carries the report skeleton`,
    text.includes(skeletonHeading),
    true,
  );
  check(
    `${label} skeleton names the Korean block`,
    text.includes("## 분석 보고서 (한국어)"),
    true,
  );
  check(
    `${label} skeleton lists the Korean sections`,
    text.includes("### 4. 임시 해결 방법"),
    true,
  );
}

// Test 19: the native binary's collector lock. A refused collector used to
// come back as "success" (alive at the 2 s mark, dead a moment later) and the
// agent then "fixed" it by deleting the lock — which the live holder had open.
// The runner must recognise the refusal, name the holder and who stops it,
// and never touch the lock file itself.
console.log("\nTest 19: collector lock refusal");
const LOCK_REFUSAL_OUTPUT =
  "Existing hot logs will be cleared on start (--fresh)\r\n" +
  "Starting collection and monitoring -> ./logs\r\n" +
  "Monitoring category: _general\r\n" +
  "Could not start collection: base_dir already locked\r\n" +
  "collection already running for base_dir logs (lock held: logs\\_meta\\collector.lock)\r\n";
// The same refusal naming a specific lock file — the printed path is relative
// to the binary's cwd, and the envelope tests must not read whatever lock the
// test runner's cwd happens to hold.
const refusalFor = (lockFile) =>
  LOCK_REFUSAL_OUTPUT.replace("logs\\_meta\\collector.lock", lockFile);
check(
  "the binary's refusal is recognised",
  LOCK_REFUSAL_RE.test(LOCK_REFUSAL_OUTPUT),
  true,
);
check(
  "a healthy start is not",
  LOCK_REFUSAL_RE.test(
    "Starting collection and monitoring -> ./logs\nMonitoring category: _general\n",
  ),
  false,
);
// The monitor copies device log lines into the same capture: a stray "lock
// held" inside one of them is not the binary's refusal.
check(
  "a device log line mentioning a lock is not",
  LOCK_REFUSAL_RE.test(
    "Starting collection and monitoring -> ./logs\n" +
      "E/KERNEL ( 1234): lockdep: lock held: &mm->mmap_lock, base_dir already locked by someone\n",
  ),
  false,
);

const asCollector = () => "tizen-dlog-analyzer.exe";
const lockTmp = fs.mkdtempSync(path.join(os.tmpdir(), "dlog-lock-"));
fs.mkdirSync(path.join(lockTmp, "_meta"));
const lockPath = path.join(lockTmp, "_meta", "collector.lock");
fs.writeFileSync(lockPath, `${process.pid}\n`);
{
  const h = describeLockHolder("", lockTmp, asCollector);
  check(
    "holder read from <log-dir>/_meta/collector.lock",
    [h.lockFile, h.pid, h.running, h.image, h.isCollector],
    [lockPath, process.pid, true, "tizen-dlog-analyzer.exe", true],
  );
}
check(
  "the lock path the binary printed wins over the resolved directory",
  describeLockHolder(
    refusalFor(lockPath),
    path.join(lockTmp, "no"),
    asCollector,
  ).lockFile,
  lockPath,
);
check(
  "a live holder whose PID was reused is not a collector",
  describeLockHolder("", lockTmp, () => "node.exe").isCollector,
  false,
);
check(
  "an unreadable executable name leaves isCollector open",
  describeLockHolder("", lockTmp, () => null).isCollector,
  null,
);
{
  fs.writeFileSync(lockPath, "2147483646");
  const h = describeLockHolder("", lockTmp, asCollector);
  check(
    "a holder that no longer runs is reported as such, without an image lookup",
    [h.pid, h.running, h.image, h.isCollector],
    [2147483646, false, null, null],
  );
  fs.writeFileSync(lockPath, `${process.pid}`);
}
check(
  "processImageName reads this process's executable on this platform",
  /node/i.test(processImageName(process.pid) || ""),
  true,
);
check(
  "processImageName → null for a PID that does not exist",
  processImageName(2147483646),
  null,
);
check(
  "no lock file → no holder",
  describeLockHolder("", path.join(lockTmp, "none")).pid,
  null,
);
{
  const e = lockedCollectorError(
    "tizen-sdk dlog-analyzer start",
    "'start start-monitoring'",
    refusalFor(lockPath),
    lockTmp,
    { collectPid: process.pid, imageOf: asCollector },
  );
  check("locked start → failure", e.status, "failure");
  check(
    "locked start → already_running",
    e.errors[0].category,
    "already_running",
  );
  check(
    "holder is the dlog-collect session → stop-collect",
    /'dlog-collect' session[\s\S]*stop-collect/.test(e.errors[0].message),
    true,
  );
}
{
  const e = lockedCollectorError(
    "tizen-sdk dlog-analyzer dlog-collect",
    "'dlog-collect org.example.app'",
    refusalFor(lockPath),
    lockTmp,
    { monitorPid: process.pid, appId: "org.example.app", imageOf: asCollector },
  );
  check(
    "holder is the monitor → keep it running, analyze with check",
    /do not stop the monitor mid-reproduction[\s\S]*'check'/.test(
      e.errors[0].message,
    ),
    true,
  );
}
{
  const e = lockedCollectorError(
    "tizen-sdk dlog-analyzer start",
    "'start start-monitoring'",
    refusalFor(lockPath),
    lockTmp,
    { imageOf: asCollector },
  );
  const msg = e.errors[0].message;
  check(
    "untracked live collector → terminate it by PID",
    new RegExp(
      `not tracking[\\s\\S]*Terminate PID ${process.pid} and its child`,
    ).test(msg),
    true,
  );
  check("the envelope names the lock file", msg.includes(lockPath), true);
  check(
    "a live holder's lock is never offered for deletion",
    /delete|remove|unlink/i.test(msg),
    false,
  );
  check(
    "the binary output travels in the envelope",
    msg.includes("base_dir already locked"),
    true,
  );
}
{
  // The OS reused the holder's PID for an unrelated process: the one case
  // that must NOT end in "terminate PID".
  const e = lockedCollectorError(
    "tizen-sdk dlog-analyzer start",
    "'start start-monitoring'",
    refusalFor(lockPath),
    lockTmp,
    { imageOf: () => "node.exe" },
  );
  const msg = e.errors[0].message;
  check(
    "reused PID → named as a different process, lock called stale",
    /now belongs to 'node\.exe'[\s\S]*stale/.test(msg),
    true,
  );
  check(
    "reused PID → explicitly not terminated",
    new RegExp(`Do not terminate PID ${process.pid}`).test(msg) &&
      !/Terminate PID/.test(msg),
    true,
  );
}
{
  const e = lockedCollectorError(
    "tizen-sdk dlog-analyzer start",
    "'start start-monitoring'",
    refusalFor(lockPath),
    lockTmp,
    { imageOf: () => null },
  );
  check(
    "unknown executable → confirm before terminating",
    /confirm PID \d+ is a tizen-dlog-analyzer process before terminating/.test(
      e.errors[0].message,
    ),
    true,
  );
}
fs.rmSync(lockTmp, { recursive: true, force: true });

{
  const startBody = domainSource.slice(
    domainSource.indexOf("async function startDlogAnalyzer("),
    domainSource.indexOf("async function stopDlogAnalyzer("),
  );
  const collectCheck = startBody.indexOf("getCollectPid()");
  check(
    "start refuses while dlog-collect runs, before spawning",
    collectCheck > -1 && collectCheck < startBody.indexOf("spawn("),
    true,
  );
}
check(
  "both dlog collectors wait through awaitCollectorStartup",
  (domainSource.match(/await awaitCollectorStartup\(/g) || []).length,
  2,
);
check(
  "a locked collector is terminated before its envelope",
  (
    domainSource.match(
      /if \(startup\.alive\) await terminateGracefully\(child\.pid\);/g,
    ) || []
  ).length,
  2,
);
check(
  "the runner never deletes the collector lock",
  /(unlinkSync|rmSync)\([^)]*collector\.lock/.test(domainSource),
  false,
);

// Real timers and real children: an exited collector is noticed in the first
// poll, a refusal is noticed while the process is still alive, and a healthy
// collector is left alone until the window ends.
const lockTests = (async () => {
  const { spawn } = require("child_process");
  const startupDir = fs.mkdtempSync(path.join(os.tmpdir(), "dlog-startup-"));
  const capFile = path.join(startupDir, "out.log");
  fs.writeFileSync(capFile, "");
  const dead = spawn(process.execPath, ["-e", "process.exit(0)"]);
  await new Promise((resolve) => dead.on("exit", resolve));
  let t0 = Date.now();
  const r1 = await awaitCollectorStartup(dead, capFile, 3000);
  check(
    "an exited collector → alive false, not locked",
    [r1.alive, r1.locked],
    [false, false],
  );
  check("… noticed before the window ends", Date.now() - t0 < 1500, true);

  const live = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"]);
  t0 = Date.now();
  const r3 = await awaitCollectorStartup(live, capFile, 600);
  check(
    "a healthy collector → alive, not locked",
    [r3.alive, r3.locked],
    [true, false],
  );
  check("… only after the whole window", Date.now() - t0 >= 600, true);

  fs.writeFileSync(capFile, LOCK_REFUSAL_OUTPUT);
  t0 = Date.now();
  const r2 = await awaitCollectorStartup(live, capFile, 3000);
  check(
    "a live collector that printed the refusal → locked",
    [r2.alive, r2.locked],
    [true, true],
  );
  check("… noticed in the first poll", Date.now() - t0 < 1500, true);
  check("… with the capture returned", r2.output, LOCK_REFUSAL_OUTPUT);
  live.kill();
  await new Promise((resolve) => live.on("exit", resolve));
  fs.rmSync(startupDir, { recursive: true, force: true });
})();

// Test 20: the binary is picked from this runner's own tools/ first, and from
// a plugin cache newest-version-first. Directory order used to win, so a cache
// holding 1.1.1 … 1.4.0 ran 1.1.1's binary — which has no `investigate`.
console.log("\nTest 20: binary resolution order");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dlog-bin-"));
  const cache = path.join(root, "cache");
  const own = path.join(root, "own-tools");
  const place = (base) => {
    const file = path.join(base, ...BINARY_SUBPATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "");
    return file;
  };
  const cached = {};
  for (const v of ["1.1.1", "1.4.0", "1.10.0", "1.2.0"]) {
    cached[v] = place(path.join(cache, v, "tools"));
  }
  fs.mkdirSync(path.join(cache, "not-a-version", "tools"), {
    recursive: true,
  });
  check(
    "a cache root yields its newest version, compared numerically",
    resolveBinary([cache]),
    cached["1.10.0"],
  );
  const ownBinary = place(own);
  check(
    "the runner's own tools/ wins over every cache",
    resolveBinary([own, cache]),
    ownBinary,
  );
  check(
    "missing bases are skipped",
    resolveBinary([path.join(root, "nope"), cache]),
    cached["1.10.0"],
  );
  check("nothing found → null", resolveBinary([path.join(root, "nope")]), null);
  fs.rmSync(root, { recursive: true, force: true });
  check(
    "own tools/ precede the caches in the default search",
    /path\.join\(__dirname, "tools"\),\s*path\.resolve\(__dirname, "\.\.", "\.\.", "tools"\),\s*\.\.\.orderedCacheRoots\(\)/.test(
      domainSource,
    ),
    true,
  );
}

// Test 21: a frozen-Python collector killed by the Windows code page
// (UnicodeEncodeError on an em dash) had already printed its whole report;
// the runner keeps it and explains the missing tail instead of returning only
// the traceback. chcp / PYTHONUTF8 do not reach the binary, so the warning
// must not send the agent down that road.
console.log("\nTest 21: UnicodeEncodeError recovery");
{
  const CRASH =
    "+--- Traceback (most recent call last) ---+\n| in write_text:402 |\n" +
    "UnicodeEncodeError: 'cp949' codec can't encode character '\\u2014' in position 26: illegal multibyte sequence\n" +
    "[PYI-19088:ERROR] Failed to execute script 'main' due to unhandled exception!";
  const crashing = (stdoutText) => [
    "-e",
    `process.stdout.write(${JSON.stringify(stdoutText)}); process.stderr.write(${JSON.stringify(CRASH)}); process.exit(1);`,
  ];
  const r = runBinary(
    "tizen-sdk dlog-analyzer investigate",
    process.execPath,
    crashing("=== Investigate Report ===\n  Notes:\n"),
    { result: { device_serial: "emulator-26101" }, errorCategory: "x" },
  );
  check("crash after output → success", r.status, "success");
  check(
    "… with the printed report",
    r.result.output,
    "=== Investigate Report ===\n  Notes:",
  );
  check("… flagged as truncated", r.result.output_truncated, true);
  check(
    "… and the extra result fields",
    r.result.device_serial,
    "emulator-26101",
  );
  check(
    "… and a warning naming the code page",
    r.warnings.length === 1 && /'cp949' code page/.test(r.warnings[0]),
    true,
  );
  check(
    "… that rules out chcp / PYTHONUTF8 retries",
    /Do not re-run with chcp 65001 or PYTHONUTF8/.test(r.warnings[0]),
    true,
  );
  const empty = runBinary("c", process.execPath, crashing(""), {
    errorCategory: "investigate_failed",
    errorPrefix: "Investigation failed",
  });
  check(
    "crash with nothing printed → still a failure",
    [empty.status, empty.errors[0].category],
    ["failure", "investigate_failed"],
  );
  const other = runBinary(
    "c",
    process.execPath,
    [
      "-e",
      "process.stdout.write('partial'); process.stderr.write('boom'); process.exit(2);",
    ],
    {
      errorCategory: "investigate_failed",
      errorPrefix: "Investigation failed",
    },
  );
  check(
    "any other crash → failure carrying stderr",
    [other.status, other.errors[0].message],
    ["failure", "Investigation failed: boom"],
  );
  check(
    "recoverEncodingCrash ignores errors without stdout/stderr",
    recoverEncodingCrash(new Error("spawn ENOENT")),
    null,
  );
  // rich wraps the traceback to the console width: the exception line can
  // break between any two tokens, and stdout/stderr arrive as Buffers when
  // the caller did not set an encoding.
  check(
    "a line-wrapped traceback is still recognised, codec captured",
    recoverEncodingCrash({
      stdout: Buffer.from("report\n"),
      stderr: Buffer.from(
        "UnicodeEncodeError: 'cp1252'\ncodec can't\nencode character '\\u2014' in position\n26",
      ),
    }).warning.includes("'cp1252' code page"),
    true,
  );
  check(
    "a different Python exception is not recovered",
    recoverEncodingCrash({
      stdout: "report",
      stderr: "UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff",
    }),
    null,
  );
  check(
    "both binary call sites recover and flag the output",
    [
      (domainSource.match(/= recoverEncodingCrash\(error\)/g) || []).length,
      (domainSource.match(/output_truncated: true/g) || []).length,
    ],
    [2, 2],
  );
}
// The version-directory rule is the one findLatestVersionDir() applies, not a
// second copy that could drift.
check(
  "resolveBinary shares VERSION_DIR_RE with plugin-cache",
  /\{[^}]*VERSION_DIR_RE[^}]*\}\s*=\s*require\("\.\/plugin-cache"\)/.test(
    domainSource,
  ) && !/^const VERSION_DIR_RE/m.test(domainSource),
  true,
);
check(
  "VERSION_DIR_RE accepts X.Y.Z only",
  ["1.4.0", "1.10.0", "1.4.0-beta", "1.4", "v1.4.0", "1.4.0.1"].map((v) =>
    VERSION_DIR_RE.test(v),
  ),
  [true, true, false, false, false, false],
);

// The other async checks (Tests 11 and 15) settle within the current
// macrotask queue; Test 19 polls real timers, so the summary waits for it.
lockTests.then(() =>
  setImmediate(() => {
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
    process.exit(failures === 0 ? 0 : 1);
  }),
);
