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
 *
 * Plus drift guards:
 *   - the bilingual REPORT_TEMPLATE.md must be byte-identical between the
 *     common/ skill (Claude/Cline/Codex/Gemini/VS Code) and the tizen-cli skill
 *   - the CLI runner must not pass a third positional to analyzeErrors (its
 *     third parameter is the envelope command label, not a serial)
 *   - the CLI runner and the tizen-cli command spec both expose log-dump /
 *     log-clear (with --confirm), so the two harnesses cannot drift apart
 */

const fs = require("fs");
const path = require("path");
const {
  isValidAppId,
  parseFirstPid,
  extractPidFromPsOutput,
  parseErrorCount,
  parseFilterSpecs,
  tailLines,
  sanitizeDlogOutput,
  buildLogClearGate,
} = require("../core/dlog-analyzer");

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
// bilingual contract (English block, separator, Korean block) is present
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

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
