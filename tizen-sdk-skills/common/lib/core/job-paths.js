// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Job directory conventions shared by jobs.js (the job runner) and
 * plugin-cache.js (execPluginScript). Kept dependency-free on purpose:
 * jobs.js requires plugin-cache.js for resolveScript(), so plugin-cache.js
 * cannot require jobs.js back — both import these helpers instead.
 *
 * Layout under jobsDir() = $TIZEN_JOBS_DIR or <os tmpdir>/tizen-sdk-skills-jobs:
 *   <id>.json            job meta (state, pids, times) — written by the launcher
 *   <id>.child           script jobs: {child_pid, log_file} — written by the
 *                        _exec wrapper once it has spawned the script. A
 *                        separate file so launcher and wrapper never
 *                        read-modify-write the same JSON; readJobMeta() merges it
 *   <id>.stdout          the detached runner's stdout — its JSON envelope
 *   <id>.stderr          the detached runner's stderr — its progress lines
 *   <id>.log             script jobs: the installer script's own output
 *   <id>.script-<n>.log  runner jobs: the output of the n-th execPluginScript()
 *                        call the runner made (tz build, em-cli, sdb …) so
 *                        job-cli.js status/wait can tail a build live
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

/** Env var the detached child sees; runCli uses it to mark the job done. */
const JOB_ID_ENV = "TIZEN_JOB_ID";

/** Job ids are filenames: no separators, no traversal. */
const JOB_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

const SCRIPT_LOG_RE = /^\.script-(\d+)\.log$/;

function jobsDir() {
  return (
    process.env.TIZEN_JOBS_DIR ||
    path.join(os.tmpdir(), "tizen-sdk-skills-jobs")
  );
}

function jobPaths(id) {
  const dir = jobsDir();
  return {
    dir,
    meta: path.join(dir, `${id}.json`),
    child: path.join(dir, `${id}.child`),
    stdout: path.join(dir, `${id}.stdout`),
    stderr: path.join(dir, `${id}.stderr`),
    log: path.join(dir, `${id}.log`),
  };
}

/**
 * The job this process belongs to (set by spawnDetached on the child), or
 * null when running in the foreground or the value is not a valid id.
 */
function currentJobId() {
  const id = process.env[JOB_ID_ENV];
  return id && JOB_ID_PATTERN.test(id) ? id : null;
}

/**
 * All <id>.script-<n>.log files of a job, ascending by n (numeric).
 * @returns {string[]} absolute paths
 */
function listRunnerScriptLogs(id) {
  if (!id || !JOB_ID_PATTERN.test(id)) return [];
  const dir = jobsDir();
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_e) {
    return [];
  }
  const prefix = `${id}`;
  return entries
    .filter(
      (f) => f.startsWith(prefix) && SCRIPT_LOG_RE.test(f.slice(prefix.length)),
    )
    .map((f) => ({
      f,
      n: Number(SCRIPT_LOG_RE.exec(f.slice(prefix.length))[1]),
    }))
    .sort((a, b) => a.n - b.n)
    .map(({ f }) => path.join(dir, f));
}

/**
 * Path for the next execPluginScript() call of a job: <id>.script-<n>.log with
 * n one past the highest existing. Creates the jobs directory. Collision-safe
 * against a nested process writing at the same time (bumps until unused).
 */
function nextRunnerScriptLog(id) {
  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  const existing = listRunnerScriptLogs(id);
  let n = existing.length
    ? Number(
        SCRIPT_LOG_RE.exec(
          path.basename(existing[existing.length - 1]).slice(id.length),
        )[1],
      ) + 1
    : 1;
  let file = path.join(dir, `${id}.script-${n}.log`);
  while (fs.existsSync(file)) {
    n += 1;
    file = path.join(dir, `${id}.script-${n}.log`);
  }
  return file;
}

module.exports = {
  JOB_ID_ENV,
  JOB_ID_PATTERN,
  jobsDir,
  jobPaths,
  currentJobId,
  listRunnerScriptLogs,
  nextRunnerScriptLog,
};
