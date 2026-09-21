// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * --download-jobs contract tests
 *
 *   - getDownloadJobs(): default, accepted range, rejected forms (UsageError)
 *   - sdk.js downloadJobsFlags(): one validated `-DownloadJobs n` /
 *     `--download-jobs n` pair for every installer command line
 *   - every sdk CLI runner spawned with an invalid --download-jobs: the error
 *     must reach the caller as an invalid_parameters envelope on STDERR with
 *     exit 1 (not a raw Node stack trace). These paths terminate before any
 *     SDK/network access, so they are environment-independent.
 */

const { spawnSync } = require("child_process");
const path = require("path");
const { getDownloadJobs, UsageError } = require("../cli/cli-runner");
const { downloadJobsFlags } = require("../core/sdk");

console.log("=== download-jobs CLI contract Test ===\n");

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

function checkThrowsUsage(name, fn) {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  const ok = thrown instanceof UsageError;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok ? "" : ` — got ${thrown ? thrown.constructor.name : "no throw"}`),
  );
}

// Test 1: getDownloadJobs parsing
console.log("Test 1: getDownloadJobs");
check("  absent -> default 4", getDownloadJobs(["--force"]), 4);
check("  space form", getDownloadJobs(["--download-jobs", "6"]), 6);
check("  equals form", getDownloadJobs(["--download-jobs=1"]), 1);
check("  upper bound 8", getDownloadJobs(["--download-jobs", "8"]), 8);
checkThrowsUsage("  0 rejected", () =>
  getDownloadJobs(["--download-jobs", "0"]),
);
checkThrowsUsage("  9 rejected", () =>
  getDownloadJobs(["--download-jobs", "9"]),
);
checkThrowsUsage("  non-numeric rejected", () =>
  getDownloadJobs(["--download-jobs", "abc"]),
);
checkThrowsUsage("  decimal rejected", () =>
  getDownloadJobs(["--download-jobs=2.5"]),
);

// Test 2: downloadJobsFlags (sdk.js) — single source for both OS flag strings
console.log("\nTest 2: downloadJobsFlags");
check("  default", downloadJobsFlags(), {
  win: "-DownloadJobs 4",
  unix: "--download-jobs 4",
});
check("  string input normalised", downloadJobsFlags("6"), {
  win: "-DownloadJobs 6",
  unix: "--download-jobs 6",
});
{
  let threw = false;
  try {
    downloadJobsFlags(9);
  } catch (_e) {
    threw = true;
  }
  check("  out of range throws", threw, true);
}

// Test 3: every sdk CLI turns a bad --download-jobs into a usage envelope
console.log("\nTest 3: CLI runners emit an invalid_parameters envelope");
const CLIS = [
  ["sdk-install-cli.js", []],
  ["sdk-install-custom-repo-cli.js", ["--repo-url", "http://example.invalid"]],
  ["tv-sdk-install-cli.js", []],
  ["update-package-cli.js", []],
  ["platform-install-cli.js", ["--platform-version", "10.0"]],
  ["download-emulator-package-cli.js", []],
  ["download-mobile-platform-cli.js", []],
];

for (const [file, extra] of CLIS) {
  const cli = path.join(__dirname, "..", "cli", file);
  const r = spawnSync(
    process.execPath,
    [cli, ...extra, "--download-jobs", "9"],
    { encoding: "utf8", timeout: 30000 },
  );
  let env = null;
  try {
    env = JSON.parse(r.stderr || "");
  } catch (_e) {
    /* handled by checks below */
  }
  check(`  ${file}: exit code`, r.status, 1);
  check(`  ${file}: stdout empty`, (r.stdout || "").trim(), "");
  check(`  ${file}: stderr is a JSON envelope`, env !== null, true);
  check(
    `  ${file}: code invalid_parameters`,
    env && env.errors && env.errors[0].code,
    "invalid_parameters",
  );
  check(
    `  ${file}: message names the flag`,
    Boolean(
      env && env.errors && env.errors[0].message.includes("--download-jobs"),
    ),
    true,
  );
  check(
    `  ${file}: no stack trace`,
    (r.stderr || "").includes("UsageError:") ||
      (r.stderr || "").includes("    at "),
    false,
  );
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
