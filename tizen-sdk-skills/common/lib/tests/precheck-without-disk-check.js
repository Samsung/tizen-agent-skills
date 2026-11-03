// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Run an SDK install pre-check on a not-installed SDK with the 15 GB disk check
 * stubbed out, and return its envelope.
 *
 * The "not installed" branch of installSdk / installSdkFromRepo is only reached
 * after checkDiskSpace, so on a host (or CI runner) with less than 15 GB free
 * the message under test is never built. sdk.js destructures checkDiskSpace
 * from ./preflight when it is first required, so the stub has to be in place
 * before that — which is why this runs in a fresh child process with its own
 * empty HOME (the default SDK path there does not exist, so the SDK is not
 * installed). Not a *.test.js file, so run-all.js does not run it on its own.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CORE = path.join(__dirname, "..", "core");

/**
 * @param {"sdk"|"repo"} kind - installSdk("10.0") or installSdkFromRepo(repoUrl, "10.0")
 * @param {string} [repoUrl] - required for "repo"
 * @returns {object} the Standard JSON Envelope the pre-check returned
 */
function precheckWithoutDiskCheck(kind, repoUrl = "") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-precheck-home-"));
  const code = `
    const preflight = require(${JSON.stringify(path.join(CORE, "preflight"))});
    preflight.checkDiskSpace = async () => ({
      status: "success",
      result: { free_gb: 999 },
      warnings: [],
    });
    const sdk = require(${JSON.stringify(path.join(CORE, "sdk"))});
    const [kind, repoUrl] = process.argv.slice(1);
    (kind === "repo"
      ? sdk.installSdkFromRepo(repoUrl, "10.0")
      : sdk.installSdk("10.0")
    ).then((env) => process.stdout.write(JSON.stringify(env)));
  `;
  try {
    const run = spawnSync(process.execPath, ["-e", code, kind, repoUrl], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: "utf8",
      timeout: 120000,
    });
    if (run.status !== 0 || !run.stdout) {
      throw new Error(
        `pre-check child failed (exit ${run.status}): ${run.stderr || run.error}`,
      );
    }
    return JSON.parse(run.stdout);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

module.exports = { precheckWithoutDiskCheck };
