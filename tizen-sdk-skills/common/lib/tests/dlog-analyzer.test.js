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
 *
 * Plus two drift guards:
 *   - the bilingual REPORT_TEMPLATE.md must be byte-identical between the
 *     common/ skill (Claude/Cline/Codex/Gemini/VS Code) and the tizen-cli skill
 *   - the CLI runner must not pass a third positional to analyzeErrors (its
 *     third parameter is the envelope command label, not a serial)
 */

const fs = require("fs");
const path = require("path");
const {
  isValidAppId,
  parseFirstPid,
  extractPidFromPsOutput,
  parseErrorCount,
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

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
