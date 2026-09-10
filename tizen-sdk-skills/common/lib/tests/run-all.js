// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Unit-test runner for common/lib.
 *
 * Runs every `*.test.js` file in this directory as a separate Node process and
 * reports a PASS/FAIL summary. This is the single entry point used by both
 * `npm test` (tizen-cli/package.json) and CI (.github/workflows/ci.yml), so the
 * list of executed tests can never drift between the two — adding a new
 * `*.test.js` file here is enough to get it run everywhere.
 *
 * Unlike a `node a.test.js && node b.test.js` chain, this keeps going after a
 * failure so a single run shows every failing file.
 *
 * Usage:
 *   node run-all.js                    # run all tests
 *   node run-all.js --filter emulator  # run only files whose name contains "emulator"
 *
 * Exit code: 0 if every test file exited 0, otherwise 1.
 */

const fs = require("fs");
const { spawnSync } = require("child_process");

function parseFilter(argv) {
  const idx = argv.indexOf("--filter");
  if (idx === -1) return null;
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    console.error("Error: --filter requires a value, e.g. --filter emulator");
    process.exit(2);
  }
  return value;
}

function collectTestFiles(dir, filter) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".test.js"))
    .filter((name) => (filter ? name.includes(filter) : true))
    .sort();
}

function runOne(dir, file) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [file], {
    cwd: dir,
    stdio: "inherit",
  });
  const durationMs = Date.now() - started;

  // spawnSync sets `error` when the process could not be started at all, and
  // `signal` when it was killed; treat both as failures with a non-zero code.
  let code = result.status;
  if (result.error) code = -1;
  else if (code === null && result.signal) code = -1;

  return {
    file,
    code,
    durationMs,
    signal: result.signal || null,
    error: result.error || null,
  };
}

function main() {
  const dir = __dirname;
  const filter = parseFilter(process.argv.slice(2));
  const files = collectTestFiles(dir, filter);

  if (files.length === 0) {
    console.error(
      filter
        ? `No test files matching "--filter ${filter}" in ${dir}`
        : `No *.test.js files found in ${dir}`,
    );
    process.exit(2);
  }

  console.log(
    `Running ${files.length} test file(s) in ${dir}${filter ? ` (filter: ${filter})` : ""}\n`,
  );

  const results = [];
  for (const file of files) {
    console.log("=".repeat(72));
    console.log(`▶ ${file}`);
    console.log("=".repeat(72));
    const r = runOne(dir, file);
    results.push(r);
    console.log("");
  }

  const failed = results.filter((r) => r.code !== 0);
  const width = Math.max(...results.map((r) => r.file.length));

  console.log("=".repeat(72));
  console.log("Summary");
  console.log("=".repeat(72));
  for (const r of results) {
    const status = r.code === 0 ? "PASS" : "FAIL";
    let detail = `${String(r.durationMs).padStart(6)} ms`;
    if (r.error) detail += `  (${r.error.message})`;
    else if (r.signal) detail += `  (signal ${r.signal})`;
    else if (r.code !== 0) detail += `  (exit ${r.code})`;
    console.log(`${status}  ${r.file.padEnd(width)}  ${detail}`);
  }
  console.log("-".repeat(72));
  console.log(
    `${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`,
  );

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
