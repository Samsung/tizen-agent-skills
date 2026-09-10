// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Detached job mode — `--background` on ANY runner (cli-runner.js strips the
 * flag at require time, so positional and hand-rolled parsers get it too) plus
 * job-cli.js (lib/core/jobs.js). Issue #48: Codex CLI gives a tool call 30 s,
 * so long runners must return a receipt at once and be polled for the real
 * envelope; while they run, execPluginScript() writes each script's output to
 * <id>.script-<n>.log so status/wait can tail a build live.
 *
 * Runs a throwaway runner built on cli-runner.js against a private
 * TIZEN_JOBS_DIR, so no SDK, em-cli, or real runner is involved.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== job runner Test ===\n");

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

const CLI_RUNNER = path
  .join(__dirname, "../cli/cli-runner.js")
  .replace(/\\/g, "/");
const JOB_CLI = path.join(__dirname, "../cli/job-cli.js");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-job-test-"));
const jobsDir = path.join(workDir, "jobs");
const DUMMY = path.join(workDir, "dummy-cli.js");

// A runner like any other: parseArgsOrExit + runCli, with knobs for the
// scenarios below. Its progress line goes to stderr like the real ones.
fs.writeFileSync(
  DUMMY,
  `
const { runCli, parseArgsOrExit } = require("${CLI_RUNNER}");
const { options } = parseArgsOrExit(
  "tizen-sdk dummy", "usage", process.argv.slice(2),
  { "--sleep": "sleep", "--name": "name" },
  { "--fail": "fail", "--crash": "crash", "--eacces": "eacces" },
);
runCli("tizen-sdk dummy", async () => {
  console.error("[dummy] working on " + (options.name || "nothing"));
  await new Promise((r) => setTimeout(r, Number(options.sleep || 0) * 1000));
  if (options.crash) process.exit(2);
  if (options.eacces) {
    return { status: "failure", errors: [{ error_code: "TIZEN_SDK_IO_E001",
      error_category: "io_error", message: "EACCES: permission denied, open 'profiles.xml'" }],
      command: "tizen-sdk dummy", duration_ms: 1 };
  }
  if (options.fail) {
    return { status: "failure", errors: [{ error_code: "TIZEN_SDK_TEST_E001",
      error_category: "execution_error", message: "boom" }], command: "tizen-sdk dummy", duration_ms: 1 };
  }
  return { status: "success", result: { answer: 42, name: options.name || null },
    warnings: [], errors: [], command: "tizen-sdk dummy", duration_ms: 1 };
});
`,
);

const env = { ...process.env, TIZEN_JOBS_DIR: jobsDir };
delete env.CODEX_SANDBOX_NETWORK_DISABLED;

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — the test itself has no async structure */
  }
}

/**
 * `wait` the way a Codex agent does: repeat the ≤ 25 s call while the job is
 * still running. Cold PowerShell starts under a loaded CI box can push a
 * two-script job past a single window.
 */
function waitDone(id, extraEnv = {}, rounds = 4) {
  let last = null;
  for (let i = 0; i < rounds; i++) {
    last = run(JOB_CLI, ["wait", "--id", id, "--timeout", "25"], extraEnv);
    const r = last.json && last.json.result;
    if (!(
      last.json &&
      last.json.status === "success" &&
      r &&
      r.state === "running"
    )) {
      break;
    }
  }
  return last;
}

function run(script, args, extraEnv = {}) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...env, ...extraEnv },
    timeout: 60000,
  });
  const out = r.stdout || "";
  const err = r.stderr || "";
  let json = null;
  for (const text of [out, err]) {
    const i = text.indexOf("{");
    if (i === -1) continue;
    try {
      json = JSON.parse(text.slice(i));
      break;
    } catch (_e) {
      /* try stderr */
    }
  }
  return { code: r.status, out, err, json, ms: Date.now() - started };
}

// -- 1: the receipt ---------------------------------------------------------
console.log("--- --background returns a receipt at once ---");
const receipt = run(DUMMY, ["--name", "first", "--sleep", "4", "--background"]);
check(
  "launcher exits 0 with a success envelope",
  receipt.code === 0 && receipt.json && receipt.json.status === "success",
  `exit ${receipt.code} :: ${receipt.out.slice(0, 300)} ${receipt.err.slice(0, 300)}`,
);
const jobId = receipt.json && receipt.json.result && receipt.json.result.job_id;
check(
  "receipt carries a job_id",
  typeof jobId === "string" && jobId.length > 0,
);
check(
  "receipt state is running",
  receipt.json && receipt.json.result.state === "running",
);
check(
  "receipt returned well inside Codex's 30 s window",
  receipt.ms < 10000,
  `${receipt.ms} ms`,
);
check(
  "receipt's background_command has --background stripped",
  receipt.json &&
    /node dummy-cli\.js --name first --sleep 4$/.test(
      receipt.json.result.background_command,
    ),
  receipt.json && receipt.json.result.background_command,
);
check(
  "receipt warns that it is not the result",
  receipt.json && receipt.json.warnings.some((w) => /not the result/.test(w)),
);
check(
  "meta file written under TIZEN_JOBS_DIR",
  jobId && fs.existsSync(path.join(jobsDir, `${jobId}.json`)),
);

// -- 2: status while running -------------------------------------------------
console.log("\n--- status while the job runs ---");
// The detached child needs a moment to boot node and print its first progress
// line; on a loaded box that can exceed the ~100 ms between the receipt and
// this status call, leaving progress_tail empty (flaky FAIL). The job sleeps
// 4 s, so re-poll for up to 2.5 s — well before it can have finished.
let running = null;
for (const deadline = Date.now() + 2500; ;) {
  running = run(JOB_CLI, ["status", "--id", jobId]);
  const r = running.json && running.json.result;
  const tailed =
    r && Array.isArray(r.progress_tail) && r.progress_tail.length > 0;
  if (tailed || !r || r.state !== "running" || Date.now() > deadline) break;
  sleepSync(100);
}
check(
  "status reports running with progress tail",
  running.code === 0 &&
    running.json &&
    running.json.status === "success" &&
    running.json.result.state === "running" &&
    running.json.result.progress_tail.some((l) => /\[dummy\] working/.test(l)),
  `${running.out.slice(0, 400)} ${running.err.slice(0, 200)}`,
);

// -- 3: wait returns the child's envelope verbatim ---------------------------
console.log("\n--- wait until done ---");
const done = run(JOB_CLI, ["wait", "--id", jobId, "--timeout", "20"]);
check(
  "wait exits 0 once the child succeeded",
  done.code === 0,
  `exit ${done.code} :: ${done.out.slice(0, 400)} ${done.err.slice(0, 300)}`,
);
check(
  "the response is the runner's own envelope (result.answer, command)",
  done.json &&
    done.json.status === "success" &&
    done.json.result &&
    done.json.result.answer === 42 &&
    done.json.result.name === "first" &&
    done.json.command === "tizen-sdk dummy",
  JSON.stringify(done.json).slice(0, 300),
);
check(
  "a job block is appended with state done and exit_code 0",
  done.json &&
    done.json.job &&
    done.json.job.id === jobId &&
    done.json.job.state === "done" &&
    done.json.job.exit_code === 0,
  JSON.stringify(done.json && done.json.job),
);
check(
  "user_command on the returned envelope is the CHILD's (no --background)",
  done.json &&
    done.json.user_command === "node dummy-cli.js --name first --sleep 4",
  done.json && done.json.user_command,
);

// -- 4: a failing runner propagates its failure envelope and exit code -------
console.log("\n--- failure envelopes propagate ---");
const failReceipt = run(DUMMY, ["--fail", "--background"]);
const failId = failReceipt.json && failReceipt.json.result.job_id;
const failed = run(JOB_CLI, ["wait", "--id", failId, "--timeout", "20"]);
check(
  "wait exits 1 and returns the child's failure envelope",
  failed.code === 1 &&
    failed.json &&
    failed.json.status === "failure" &&
    failed.json.errors[0].message === "boom" &&
    failed.json.job.exit_code === 1,
  `exit ${failed.code} :: ${failed.out.slice(0, 300)}`,
);

// -- 5: a crashed child (no envelope) is reported, not hidden -----------------
console.log("\n--- crashed child ---");
const crashReceipt = run(DUMMY, ["--crash", "--background"]);
const crashId = crashReceipt.json && crashReceipt.json.result.job_id;
const crashed = run(JOB_CLI, ["wait", "--id", crashId, "--timeout", "20"]);
check(
  "a child that exited without an envelope is an execution_error with stderr tail",
  crashed.code === 1 &&
    crashed.json &&
    crashed.json.status === "failure" &&
    crashed.json.errors[0].error_category === "execution_error" &&
    /exited without writing its result/.test(crashed.json.errors[0].message) &&
    (crashed.json.errors[0].details || []).some((d) =>
      /\[dummy\] working/.test(d),
    ),
  `exit ${crashed.code} :: ${crashed.out.slice(0, 400)}`,
);

// -- 6: a usage error in the child is surfaced from its stderr ---------------
console.log("\n--- usage error in the child ---");
const usageReceipt = run(DUMMY, ["--no-such-flag", "--background"]);
check(
  "the launcher itself rejects the bad flag before spawning (usage error, exit 1)",
  usageReceipt.code === 1 &&
    usageReceipt.json &&
    usageReceipt.json.status === "error",
  `exit ${usageReceipt.code} :: ${usageReceipt.err.slice(0, 200)}`,
);

// -- 7: input validation -----------------------------------------------------
console.log("\n--- validation ---");
const traversal = run(JOB_CLI, ["status", "--id", "../etc/passwd"]);
check(
  "a job id with path separators is rejected as invalid_parameters",
  traversal.code === 1 &&
    traversal.json &&
    traversal.json.errors[0].error_category === "invalid_parameters",
  traversal.out.slice(0, 300),
);
const unknown = run(JOB_CLI, ["status", "--id", "20000101T000000-000000"]);
check(
  "an unknown job id is invalid_parameters pointing at list",
  unknown.code === 1 &&
    unknown.json &&
    unknown.json.errors[0].error_category === "invalid_parameters" &&
    unknown.json.errors[0].suggested_fix.command === "node job-cli.js list",
  unknown.out.slice(0, 300),
);
const badTimeout = run(JOB_CLI, ["wait", "--id", jobId, "--timeout", "-3"]);
check(
  "a negative timeout is rejected",
  badTimeout.code === 1 &&
    badTimeout.json &&
    badTimeout.json.errors[0].error_category === "invalid_parameters",
);
const noAction = run(JOB_CLI, []);
check(
  "missing action is a usage error",
  noAction.code === 1 && noAction.json && noAction.json.status === "error",
);

// -- 8: list --------------------------------------------------------------------
console.log("\n--- list ---");
const listed = run(JOB_CLI, ["list"]);
check(
  "list shows every job with its final state",
  listed.code === 0 &&
    listed.json &&
    listed.json.result.jobs_dir === jobsDir &&
    listed.json.result.jobs.some(
      (j) => j.job_id === jobId && j.state === "done",
    ) &&
    // The crash was already classified by `wait` above (markJobDone with exit 1),
    // so list shows it as done/1 rather than a still-unresolved "exited".
    listed.json.result.jobs.some(
      (j) => j.job_id === crashId && j.state === "done" && j.exit_code === 1,
    ),
  `${listed.out.slice(0, 500)}`,
);

// -- 9: universal --background: a positional runner (no parseArgsOrExit) ------
console.log("\n--- positional runner gets --background too ---");
const POSITIONAL = path.join(workDir, "dummy-pos-cli.js");
fs.writeFileSync(
  POSITIONAL,
  `
const { runCli } = require("${CLI_RUNNER}");
// Positional destructuring like device-manager/gdb-debug/screenshot: a stray
// --background here would land in \`a\`.
const [, , a, b] = process.argv;
runCli("tizen-sdk dummy-pos", async () => ({
  status: "success", result: { a: a || null, b: b || null },
  warnings: [], errors: [], command: "tizen-sdk dummy-pos", duration_ms: 1,
}));
`,
);
// The flag FIRST, so the positional indexes would shift if it were left in argv.
const posReceipt = run(POSITIONAL, ["--background", "foo", "bar"]);
const posId =
  posReceipt.json && posReceipt.json.result && posReceipt.json.result.job_id;
check(
  "a positional runner returns a receipt (cli-runner strips the flag at require time)",
  posReceipt.code === 0 &&
    posReceipt.json &&
    posReceipt.json.result.state === "running" &&
    typeof posId === "string",
  `exit ${posReceipt.code} :: ${posReceipt.out.slice(0, 300)} ${posReceipt.err.slice(0, 200)}`,
);
check(
  "the receipt's user_command still shows what was typed (with --background)",
  posReceipt.json && /--background/.test(posReceipt.json.user_command),
  posReceipt.json && posReceipt.json.user_command,
);
const posDone = waitDone(posId);
check(
  "the child saw foo/bar in the right positions and no --background",
  posDone.code === 0 &&
    posDone.json &&
    posDone.json.result.a === "foo" &&
    posDone.json.result.b === "bar" &&
    posDone.json.user_command === "node dummy-pos-cli.js foo bar",
  JSON.stringify(posDone.json).slice(0, 300),
);

// -- 10: `--` protects a wrapped command's own --background -------------------
console.log("\n--- -- separator ---");
const beforeSep = metaCountRunner();
const sep = run(DUMMY, ["--", "--background"]);
check(
  "--background after `--` is left alone: foreground run, no job",
  sep.code === 0 &&
    sep.json &&
    sep.json.result &&
    sep.json.result.answer === 42 &&
    !("job_id" in sep.json.result) &&
    metaCountRunner() === beforeSep,
  sep.out.slice(0, 300),
);

// -- 11: job-cli.js itself refuses the flag ---------------------------------
console.log("\n--- job-cli.js refuses --background ---");
const beforeRefuse = metaCountRunner();
for (const args of [
  ["list", "--background"],
  ["run", "--script", "tizen-sdk-install", "--background"],
  ["wait", "--id", jobId, "--background"],
]) {
  const r = run(JOB_CLI, args);
  check(
    `job-cli.js ${args.join(" ")} → usage error, nothing spawned`,
    r.code === 1 &&
      r.json &&
      r.json.status === "error" &&
      /not accepted by job-cli\.js/.test(r.json.errors[0].message),
    `${r.out.slice(0, 200)} ${r.err.slice(0, 300)}`,
  );
}
check(
  "no meta written by the refused job-cli runs",
  metaCountRunner() === beforeRefuse,
);

// -- 12: live script logs for runner jobs -------------------------------------
console.log("\n--- runner job: execPluginScript output is tailable live ---");
const PLUGIN_CACHE = path
  .join(__dirname, "../core/plugin-cache.js")
  .replace(/\\/g, "/");
const pluginRoot = path.join(workDir, "plugin");
const stubDir = path.join(pluginRoot, "scripts", "tizen-dummy-work");
fs.mkdirSync(stubDir, { recursive: true });
fs.writeFileSync(
  path.join(stubDir, "tizen-dummy-work.ps1"),
  `Write-Host "[dummy-script] working"
[Console]::Error.WriteLine("[dummy-script] to-stderr")
Start-Sleep -Seconds 3
Write-Host "[dummy-script] done"
`,
);
fs.writeFileSync(
  path.join(stubDir, "tizen-dummy-work.sh"),
  `#!/usr/bin/env bash
echo "[dummy-script] working"
echo "[dummy-script] to-stderr" >&2
sleep 3
echo "[dummy-script] done"
`,
  { mode: 0o755 },
);
const SCRIPT_RUNNER = path.join(workDir, "dummy-script-cli.js");
fs.writeFileSync(
  SCRIPT_RUNNER,
  `
const { runCli } = require("${CLI_RUNNER}");
const { resolveScript, execPluginScript } = require("${PLUGIN_CACHE}");
const mode = process.argv[2] || "pipe";
runCli("tizen-sdk dummy-script", async () => {
  const r = resolveScript("tizen-dummy-work");
  if (r.error) throw new Error(r.error);
  const opts = { captureViaTempFile: mode === "file" };
  // Two calls, like emulator create (list-template + create): .script-1 and -2.
  const out1 = execPluginScript(r.scriptPath, "", "", opts);
  const out2 = execPluginScript(r.scriptPath, "", "", opts);
  return {
    status: "success",
    result: { mode, len1: out1.length, len2: out2.length,
      stderr_in_return: /to-stderr/.test(out1) },
    warnings: [], errors: [], command: "tizen-sdk dummy-script", duration_ms: 1,
  };
});
`,
);
const scriptEnv = { TIZEN_SDK_SKILLS_ROOT: pluginRoot };
const pipeReceipt = run(SCRIPT_RUNNER, ["pipe", "--background"], scriptEnv);
const pipeId =
  pipeReceipt.json && pipeReceipt.json.result && pipeReceipt.json.result.job_id;
check(
  "runner that calls execPluginScript returns a receipt",
  pipeReceipt.code === 0 && typeof pipeId === "string",
  `${pipeReceipt.out.slice(0, 300)} ${pipeReceipt.err.slice(0, 300)}`,
);
let liveStatus = null;
for (let attempt = 0; attempt < 10; attempt++) {
  liveStatus = run(JOB_CLI, ["status", "--id", pipeId], scriptEnv);
  const r = liveStatus.json && liveStatus.json.result;
  if (r && r.state !== "running") break;
  if (
    r &&
    (r.progress_tail || []).some((l) => /\[dummy-script\] working/.test(l))
  )
    break;
  sleepSync(400);
}
check(
  "while running, status tails the script's own output from <id>.script-1.log",
  liveStatus.json &&
    liveStatus.json.result.state === "running" &&
    /\.script-1\.log$/.test(liveStatus.json.result.log_file || "") &&
    liveStatus.json.result.progress_tail.some((l) =>
      /\[dummy-script\] working/.test(l),
    ),
  `${liveStatus.out.slice(0, 500)}`,
);
const pipeDone = waitDone(pipeId, scriptEnv);
check(
  "the finished envelope is the runner's own, plus job.log_files for both calls",
  pipeDone.code === 0 &&
    pipeDone.json &&
    pipeDone.json.command === "tizen-sdk dummy-script" &&
    pipeDone.json.result.mode === "pipe" &&
    pipeDone.json.result.len1 > 0 &&
    Array.isArray(pipeDone.json.job.log_files) &&
    pipeDone.json.job.log_files.length === 2 &&
    pipeDone.json.job.log_files.every((f) => fs.existsSync(f)),
  JSON.stringify(pipeDone.json).slice(0, 3000),
);
check(
  "pipe mode keeps the contract: stdout only in the return value and in the log (stderr stays on the pipe)",
  pipeDone.json &&
    pipeDone.json.result.stderr_in_return === false &&
    !/to-stderr/.test(
      fs.readFileSync(pipeDone.json.job.log_files[0], "utf8"),
    ) &&
    /\[dummy-script\] done/.test(
      fs.readFileSync(pipeDone.json.job.log_files[0], "utf8"),
    ),
  pipeDone.json &&
    fs.readFileSync(pipeDone.json.job.log_files[0], "utf8").slice(0, 200),
);
const fileReceipt = run(SCRIPT_RUNNER, ["file", "--background"], scriptEnv);
const fileId =
  fileReceipt.json && fileReceipt.json.result && fileReceipt.json.result.job_id;
const fileDone = waitDone(fileId, scriptEnv);
check(
  "captureViaTempFile mode still merges stderr into the (kept) log, as before",
  fileDone.code === 0 &&
    fileDone.json &&
    fileDone.json.result.stderr_in_return === true &&
    fileDone.json.job.log_files.length === 2 &&
    /to-stderr/.test(fs.readFileSync(fileDone.json.job.log_files[0], "utf8")),
  JSON.stringify(fileDone.json).slice(0, 400),
);
check(
  "foreground (no job) runs leave no .script-*.log behind",
  (() => {
    const fg = run(SCRIPT_RUNNER, ["pipe"], scriptEnv);
    return (
      fg.code === 0 &&
      fg.json &&
      fg.json.result.len1 > 0 &&
      !fs.readdirSync(jobsDir).some((f) => /^adhoc|undefined/.test(f))
    );
  })(),
);

// -- 13: prune removes every file of an old job, script logs included ---------
console.log("\n--- prune ---");
const oldId = "20000101T000000-0ff1ce";
fs.writeFileSync(
  path.join(jobsDir, `${oldId}.json`),
  JSON.stringify({
    job_id: oldId,
    state: "done",
    pid: 1,
    started_at: "2000-01-01T00:00:00.000Z",
    finished_at: "2000-01-01T00:01:00.000Z",
    exit_code: 0,
  }),
);
for (const f of [
  `${oldId}.stdout`,
  `${oldId}.stderr`,
  `${oldId}.script-1.log`,
  `${oldId}.script-2.log`,
  `${oldId}.json.123.tmp`,
]) {
  fs.writeFileSync(path.join(jobsDir, f), "x\n");
}
run(JOB_CLI, ["list"]);
check(
  "a week-old job's meta, stdout/stderr, script logs and stray tmp are all pruned",
  !fs.readdirSync(jobsDir).some((f) => f.startsWith(oldId)),
  fs
    .readdirSync(jobsDir)
    .filter((f) => f.startsWith(oldId))
    .join(", "),
);

// -- 14: source guards ----------------------------------------------------------
console.log("\n--- source guards ---");
const cliRunnerSource = fs.readFileSync(
  path.join(__dirname, "../cli/cli-runner.js"),
  "utf8",
);
check(
  "cli-runner.js strips --background from process.argv at module load",
  /process\.argv\.splice\(2, process\.argv\.length - 2, \.\.\.stripped\.argv\)/.test(
    cliRunnerSource,
  ),
);
check(
  "parseArgsOrExit no longer strips the flag itself (it would be a misleading no-op)",
  !/stripBackgroundFlag\(/.test(
    cliRunnerSource.slice(
      cliRunnerSource.indexOf("function parseArgsOrExit"),
      cliRunnerSource.indexOf("function runCli"),
    ),
  ),
);
const emulatorCli = fs.readFileSync(
  path.join(__dirname, "../cli/emulator-manager-cli.js"),
  "utf8",
);
check(
  "emulator-manager-cli.js requires cli-runner before reading argv (so the strip runs first)",
  emulatorCli.indexOf('require("./cli-runner")') <
    emulatorCli.indexOf("process.argv"),
);

function metaCountRunner() {
  try {
    return fs.readdirSync(jobsDir).filter((f) => f.endsWith(".json")).length;
  } catch (_e) {
    return 0;
  }
}

// -- 11: Codex sandbox (issue #81) ----------------------------------------------
// Inside Codex's workspace-write sandbox a detached job dies with the exec call
// (Linux PID namespace) or inherits the sandbox (no sockets / SDK writes), so
// `--background` is refused with the exact command line to re-run escalated.
console.log("\n--- Codex sandbox ---");
const SANDBOX = { CODEX_SANDBOX_NETWORK_DISABLED: "1" };
const metasBefore = metaCountRunner();
const refused = run(DUMMY, ["--name", "sb", "--background"], SANDBOX);
check(
  "--background inside the sandbox → exit 1, sandbox_blocked, nothing started",
  refused.code === 1 &&
    refused.json &&
    refused.json.status === "failure" &&
    refused.json.errors[0].error_category === "sandbox_blocked" &&
    refused.json.errors[0].error_code === "TIZEN_SDK_SANDBOX_E001" &&
    metaCountRunner() === metasBefore,
  `exit ${refused.code} :: ${refused.out.slice(0, 400)}`,
);
check(
  "the fix is the user's own command line (with --background) marked escalate",
  refused.json &&
    refused.json.errors[0].suggested_fix.command ===
      refused.json.user_command &&
    refused.json.user_command === "node dummy-cli.js --name sb --background" &&
    refused.json.errors[0].suggested_fix.escalate === true,
  JSON.stringify(refused.json && refused.json.errors[0].suggested_fix),
);

const offReceipt = run(DUMMY, ["--crash", "--background"], {
  ...SANDBOX,
  TIZEN_SANDBOX: "off",
});
check(
  "TIZEN_SANDBOX=off → a receipt again, marked sandboxed with the sandbox warning",
  offReceipt.code === 0 &&
    offReceipt.json &&
    offReceipt.json.result.sandboxed === true &&
    offReceipt.json.warnings.some((w) =>
      /Running inside Codex's sandbox/.test(w),
    ),
  offReceipt.out.slice(0, 500),
);
const offId = offReceipt.json && offReceipt.json.result.job_id;
const lost =
  offId && run(JOB_CLI, ["wait", "--id", offId, "--timeout", "20"], SANDBOX);
check(
  "a sandboxed job that vanished → sandbox_job_lost with an escalated re-run fix",
  lost &&
    lost.code === 1 &&
    lost.json &&
    lost.json.errors[0].error_category === "sandbox_job_lost" &&
    lost.json.errors[0].error_code === "TIZEN_SDK_SANDBOX_E002" &&
    lost.json.errors[0].suggested_fix.escalate === true &&
    lost.json.errors[0].suggested_fix.command ===
      "node dummy-cli.js --crash --background",
  lost && `exit ${lost.code} :: ${lost.out.slice(0, 500)}`,
);

const eacces = run(DUMMY, ["--eacces"], SANDBOX);
check(
  "a foreground failure that looks permission-blocked gains a sandbox_blocked error + warning",
  eacces.code === 1 &&
    eacces.json &&
    eacces.json.errors.length === 2 &&
    eacces.json.errors[0].message ===
      "EACCES: permission denied, open 'profiles.xml'" &&
    eacces.json.errors[1].error_category === "sandbox_blocked" &&
    eacces.json.errors[1].suggested_fix.command ===
      "node dummy-cli.js --eacces" &&
    eacces.json.warnings.some((w) => /Running inside Codex's sandbox/.test(w)),
  eacces.out.slice(0, 600),
);
const plainFail = run(DUMMY, ["--fail"], SANDBOX);
check(
  "an unrelated failure inside the sandbox only gains the warning",
  plainFail.json &&
    plainFail.json.errors.length === 1 &&
    plainFail.json.warnings.some((w) =>
      /Running inside Codex's sandbox/.test(w),
    ),
  plainFail.out.slice(0, 400),
);
const okInside = run(DUMMY, ["--name", "fine"], SANDBOX);
check(
  "a success inside the sandbox is untouched",
  okInside.code === 0 &&
    okInside.json &&
    okInside.json.status === "success" &&
    okInside.json.warnings.length === 0,
  okInside.out.slice(0, 300),
);
const relayed = run(JOB_CLI, ["status", "--id", failId], SANDBOX);
check(
  "a relayed job result (wait/status) is not re-decorated by job-cli's own runCli",
  relayed.json &&
    relayed.json.errors.length === 1 &&
    relayed.json.user_command === "node dummy-cli.js --fail" &&
    !(relayed.json.warnings || []).some((w) =>
      /Running inside Codex's sandbox/.test(w),
    ),
  relayed.out.slice(0, 400),
);
const outsideNoWarn = run(DUMMY, ["--fail"], { CODEX_THREAD_ID: "t1" });
check(
  "CODEX_THREAD_ID alone (escalated run) adds nothing",
  outsideNoWarn.json &&
    outsideNoWarn.json.errors.length === 1 &&
    (outsideNoWarn.json.warnings || []).length === 0,
  outsideNoWarn.out.slice(0, 300),
);

fs.rmSync(workDir, { recursive: true, force: true });

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
