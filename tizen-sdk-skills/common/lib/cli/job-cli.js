#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for detached runner jobs — the other half of `--background`.
 *
 * Any runner (*-cli.js — build, install, launch, dotnet-setup, debug setup,
 * …) accepts `--background`: it re-spawns itself detached and prints a job
 * receipt within a second. While it runs, `status`/`wait` report
 * `progress_tail` from the newest script log the runner is writing
 * (`log_file` — e.g. the live `tz build` output). This runner turns the
 * receipt back into the real result:
 *
 *   node job-cli.js wait --id <job_id> [--timeout 25]   # block ≤ 25 s, then report
 *   node job-cli.js status --id <job_id>                # report immediately
 *   node job-cli.js list [--limit 20]                   # recent jobs on this machine
 *
 * A finished job's response IS the runner's own envelope, verbatim, plus a
 * `job` block ({id, state: "done", exit_code, …}); the exit code follows the
 * runner's status. While the job is still running, `status`/`wait` return a
 * success envelope with `result.state: "running"` — call `wait` again.
 *
 * Why (issue #48): Codex CLI gives one tool call at most 30 s, so anything that
 * boots an emulator, builds, or installs must run detached and be polled.
 *
 * Exit code: success=0, failure/error=1
 */

const {
  jobStatus,
  jobWait,
  jobList,
  spawnScriptJob,
  execScriptJobChild,
  MAX_WAIT_SECONDS,
  SCRIPT_JOB_GROUPS,
} = require("../core/jobs");
const {
  runCli,
  parseArgsOrExit,
  exitWithUsageError,
  backgroundRequested,
} = require("./cli-runner");

const COMMAND = "tizen-sdk job";

const USAGE =
  "Usage: node job-cli.js <action> [options]. Actions: " +
  "status --id <job_id> | " +
  `wait --id <job_id> [--timeout <0-${MAX_WAIT_SECONDS}>] | ` +
  "list [--limit <n>] | " +
  "run --script <group> [-- <installer args>]. " +
  "Get a job_id by adding --background to any runner command, or with run --script " +
  `(groups: ${SCRIPT_JOB_GROUPS.join(", ")}).`;

const usageError = (message) => exitWithUsageError(COMMAND, USAGE, message);

const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  process.argv.slice(2),
  {
    "--id": "id",
    "--timeout": "timeoutSec",
    "--limit": "limit",
    "--script": "script",
  },
  {},
);

// This runner IS the launcher/poller: backgrounding it would nest a receipt
// inside a receipt (wait on the outer id would return the inner receipt as
// the "result"). The flag belongs on the runner command being polled.
if (backgroundRequested()) {
  usageError(
    "--background is not accepted by job-cli.js — it is the poller/launcher itself. " +
      "Add --background to the runner command (e.g. project-manager-cli.js build …) instead.",
  );
}

// For run/_exec everything after `--` (already positional per parseArgs) is
// forwarded to the installer script; the other actions take no extras.
const [action = "", ...extraPositionals] = positional;
const scriptArgs = extraPositionals;
const rejectExtras = () => {
  if (extraPositionals.length > 0) {
    usageError(`Unexpected argument(s): ${extraPositionals.join(" ")}`);
  }
};

switch (action) {
  case "status":
    rejectExtras();
    if (!options.id) usageError("status requires --id <job_id>");
    runCli(COMMAND, () => jobStatus(options.id, `${COMMAND} status`));
    break;
  case "wait":
    rejectExtras();
    if (!options.id) usageError("wait requires --id <job_id>");
    runCli(COMMAND, () =>
      jobWait(
        options.id,
        options.timeoutSec === undefined
          ? MAX_WAIT_SECONDS
          : options.timeoutSec,
        `${COMMAND} wait`,
      ),
    );
    break;
  case "list":
    rejectExtras();
    runCli(COMMAND, () => jobList(options.limit, `${COMMAND} list`));
    break;
  case "run":
    // Launcher: prints the job receipt itself (a fast runner) — it must not
    // be combined with --background.
    if (!options.script) usageError("run requires --script <group>");
    runCli(COMMAND, () =>
      spawnScriptJob(options.script, scriptArgs, `${COMMAND} run`),
    );
    break;
  case "_exec":
    // The detached wrapper spawned by `run`; not for direct use.
    if (!options.script) usageError("_exec requires --script <group>");
    runCli(`${COMMAND} run`, () =>
      execScriptJobChild(options.script, scriptArgs, `${COMMAND} run`),
    );
    break;
  default:
    usageError(action ? `Unknown action: ${action}` : "Missing action");
}
