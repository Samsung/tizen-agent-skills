// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Script jobs — `job-cli.js run --script <group> [-- <args>]` (lib/core/jobs.js).
 *
 * The long installers (SDK, platform, packages) are shell scripts handed back by
 * the *-install-cli.js pre-checks as suggested_fix. Under Codex CLI (30 s per
 * exec call, issue #48) they must run detached; `run` wraps them in a node
 * child whose synthesized envelope (exit code + log tail) is then returned by
 * `wait`/`status` like any other job.
 *
 * Runs against a throwaway plugin root (TIZEN_SDK_SKILLS_ROOT) holding a dummy
 * scripts/tizen-sdk-install/tizen-sdk-install.{ps1,sh}, and a private
 * TIZEN_JOBS_DIR — no SDK and no real installer are involved. Also covers the
 * suggested_fix plumbing: formatError's object form, the envelope normaliser
 * keeping background_command, and sdk.js wiring every installer through it.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== job script Test ===\n");

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

const IS_WIN = process.platform === "win32";
const JOB_CLI = path.join(__dirname, "../cli/job-cli.js");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-job-script-"));
const jobsDir = path.join(workDir, "jobs");
const pluginRoot = path.join(workDir, "plugin");
const scriptDir = path.join(pluginRoot, "scripts", "tizen-sdk-install");
fs.mkdirSync(scriptDir, { recursive: true });

// The dummy "installer": a few progress lines (one with a `{`, like real
// installer logs), an optional sleep, and an exit code of the caller's choice.
fs.writeFileSync(
  path.join(scriptDir, "tizen-sdk-install.ps1"),
  `param([int]$Sleep = 0, [int]$Exit = 0, [string]$Tag = "")
Write-Host "[dummy] starting tag=$Tag"
Write-Host "[dummy] progress {looks: 'like json', but: 'is not'}"
Start-Sleep -Seconds $Sleep
Write-Host "[dummy] finished"
exit $Exit
`,
);
fs.writeFileSync(
  path.join(scriptDir, "tizen-sdk-install.sh"),
  `#!/usr/bin/env bash
SLEEP=0; EXIT=0; TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sleep) SLEEP="$2"; shift 2 ;;
    --exit) EXIT="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    *) shift ;;
  esac
done
echo "[dummy] starting tag=$TAG"
echo "[dummy] progress {looks: 'like json', but: 'is not'}"
sleep "$SLEEP"
echo "[dummy] finished"
exit "$EXIT"
`,
  { mode: 0o755 },
);

/** Platform-appropriate installer args for the dummy. */
function dummyArgs({ sleep = 0, exit = 0, tag = "" } = {}) {
  return IS_WIN
    ? ["-Sleep", String(sleep), "-Exit", String(exit), "-Tag", tag]
    : ["--sleep", String(sleep), "--exit", String(exit), "--tag", tag];
}

const baseEnv = {
  ...process.env,
  TIZEN_JOBS_DIR: jobsDir,
  TIZEN_SDK_SKILLS_ROOT: pluginRoot,
};
delete baseEnv.CODEX_SANDBOX_NETWORK_DISABLED;

function run(args, extraEnv = {}) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [JOB_CLI, ...args], {
    encoding: "utf8",
    env: { ...baseEnv, ...extraEnv },
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

function metaCount() {
  try {
    return fs.readdirSync(jobsDir).filter((f) => f.endsWith(".json")).length;
  } catch (_e) {
    return 0;
  }
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — the test itself has no async structure */
  }
}

// -- 1: the receipt ---------------------------------------------------------
console.log("--- run returns a receipt at once ---");
const firstArgs = dummyArgs({ sleep: 6, tag: "first" });
const receipt = run([
  "run",
  "--script",
  "tizen-sdk-install",
  "--",
  ...firstArgs,
]);
check(
  "run exits 0 with a success receipt",
  receipt.code === 0 && receipt.json && receipt.json.status === "success",
  `exit ${receipt.code} :: ${receipt.out.slice(0, 300)} ${receipt.err.slice(0, 300)}`,
);
const jobId = receipt.json && receipt.json.result && receipt.json.result.job_id;
check(
  "receipt carries a job_id",
  typeof jobId === "string" && jobId.length > 0,
);
check(
  "receipt is a running script job with a log file under the jobs dir",
  receipt.json &&
    receipt.json.result.state === "running" &&
    receipt.json.result.kind === "script" &&
    receipt.json.result.script === "tizen-sdk-install" &&
    typeof receipt.json.result.log_file === "string" &&
    receipt.json.result.log_file.startsWith(jobsDir),
  JSON.stringify(receipt.json && receipt.json.result),
);
check(
  "receipt returned well inside Codex's 30 s window",
  receipt.ms < 10000,
  `${receipt.ms} ms`,
);
check(
  "background_command renders the run form, not the hidden _exec",
  receipt.json &&
    /^node job-cli\.js run --script tizen-sdk-install -- /.test(
      receipt.json.result.background_command,
    ) &&
    !/_exec/.test(receipt.json.result.background_command),
  receipt.json && receipt.json.result.background_command,
);
check(
  "receipt warns that it is not the result",
  receipt.json && receipt.json.warnings.some((w) => /not the result/.test(w)),
);

// -- 2: status while running: progress comes from the script's log ----------
console.log("\n--- status while the script runs ---");
let running = null;
for (let attempt = 0; attempt < 8; attempt++) {
  running = run(["status", "--id", jobId]);
  const result = (running.json && running.json.result) || {};
  const tail = result.progress_tail || [];
  // Both must be visible: the script's first log line AND the wrapper's
  // child_pid (written to <id>.child right after spawn). The two files are
  // written by different processes, so either may land first.
  if (
    tail.some((l) => /\[dummy\] starting/.test(l)) &&
    Number.isInteger(result.child_pid)
  )
    break;
  sleepSync(500);
}
check(
  "status reports running with the installer's own log lines as progress",
  running.code === 0 &&
    running.json &&
    running.json.result.state === "running" &&
    running.json.result.progress_tail.some((l) => /\[dummy\] starting/.test(l)),
  `${running.out.slice(0, 500)} ${running.err.slice(0, 200)}`,
);
check(
  "running status exposes the child pid and log file",
  running.json &&
    Number.isInteger(running.json.result.child_pid) &&
    running.json.result.log_file === receipt.json.result.log_file,
  JSON.stringify(running.json && running.json.result),
);

// -- 3: wait returns the synthesized envelope -------------------------------
console.log("\n--- wait until done ---");
const done = run(["wait", "--id", jobId, "--timeout", "25"]);
check(
  "wait exits 0 once the script exited 0",
  done.code === 0,
  `exit ${done.code} :: ${done.out.slice(0, 500)} ${done.err.slice(0, 300)}`,
);
check(
  "the response carries exit_code 0, the script name and the log tail",
  done.json &&
    done.json.status === "success" &&
    done.json.result.exit_code === 0 &&
    done.json.result.script === "tizen-sdk-install" &&
    done.json.result.log_tail.some((l) => /\[dummy\] finished/.test(l)) &&
    done.json.command === "tizen-sdk job run",
  JSON.stringify(done.json).slice(0, 400),
);
check(
  "a `{` in the installer log did not break envelope parsing",
  done.json &&
    done.json.result.log_tail.some((l) => /looks: 'like json'/.test(l)),
);
check(
  "job block says done / exit 0",
  done.json &&
    done.json.job &&
    done.json.job.id === jobId &&
    done.json.job.state === "done" &&
    done.json.job.exit_code === 0,
  JSON.stringify(done.json && done.json.job),
);
check(
  "user_command is the run form",
  done.json &&
    /^node job-cli\.js run --script tizen-sdk-install/.test(
      done.json.user_command,
    ),
  done.json && done.json.user_command,
);
check(
  "success carries a reminder to re-run the pre-check",
  done.json && done.json.warnings.some((w) => /pre-check/.test(w)),
);

// -- 4: a non-zero exit is a failure envelope with the log tail --------------
console.log("\n--- non-zero exit ---");
const failReceipt = run([
  "run",
  "--script",
  "tizen-sdk-install",
  "--",
  ...dummyArgs({ exit: 3, tag: "boom" }),
]);
const failId = failReceipt.json && failReceipt.json.result.job_id;
const failed = run(["wait", "--id", failId, "--timeout", "25"]);
check(
  "exit 3 → wait exits 1 with an execution_error naming the code and carrying raw: log lines",
  failed.code === 1 &&
    failed.json &&
    failed.json.status === "failure" &&
    failed.json.errors[0].error_category === "execution_error" &&
    /exited with code 3/.test(failed.json.errors[0].message) &&
    (failed.json.errors[0].details || []).some((d) =>
      /^raw: \[dummy\] finished/.test(d),
    ) &&
    failed.json.result &&
    failed.json.result.exit_code === 3 &&
    failed.json.job.exit_code === 1,
  `exit ${failed.code} :: ${failed.out.slice(0, 600)}`,
);

// -- 5: rejections — nothing is spawned -------------------------------------
console.log("\n--- rejections ---");
const before = metaCount();
const notAllowed = run(["run", "--script", "tizen-install-app"]);
check(
  "a group outside the allowlist is invalid_parameters",
  notAllowed.code === 1 &&
    notAllowed.json &&
    notAllowed.json.errors[0].error_category === "invalid_parameters" &&
    /tizen-sdk-install/.test(notAllowed.json.errors[0].message),
  notAllowed.out.slice(0, 300),
);
const traversal = run(["run", "--script", "../x"]);
check(
  "a path-like group is invalid_parameters",
  traversal.code === 1 &&
    traversal.json &&
    traversal.json.errors[0].error_category === "invalid_parameters",
);
for (const bad of ["-Detach", "--status", "--wait", "-DryRun", "--dry-run"]) {
  const r = run(["run", "--script", "tizen-sdk-install", "--", bad]);
  check(
    `forwarding ${bad} is refused (would double-detach or return instantly)`,
    r.code === 1 &&
      r.json &&
      r.json.errors[0].error_category === "invalid_parameters" &&
      /not allowed in a script job/.test(r.json.errors[0].message),
    r.out.slice(0, 300),
  );
}
const noScript = run(["run"]);
check(
  "run without --script is a usage error",
  noScript.code === 1 && noScript.json && noScript.json.status === "error",
);
check("no job meta was written by any rejected run", metaCount() === before);

// -- 6: duplicate launches are folded into the running job -------------------
console.log("\n--- duplicate launch ---");
const dupArgs = dummyArgs({ sleep: 8, tag: "dup" });
const dup1 = run(["run", "--script", "tizen-sdk-install", "--", ...dupArgs]);
const dup2 = run(["run", "--script", "tizen-sdk-install", "--", ...dupArgs]);
check(
  "an identical run while the first is alive returns the first job_id with a warning",
  dup1.json &&
    dup2.json &&
    dup2.code === 0 &&
    dup2.json.result.job_id === dup1.json.result.job_id &&
    dup2.json.warnings.some((w) => /already running/.test(w)),
  `${dup1.out.slice(0, 200)} || ${dup2.out.slice(0, 400)}`,
);

// -- 7: Codex sandbox → refused up front (issue #81) --------------------------
console.log("\n--- sandbox refusal ---");
const sandboxed = run(
  ["run", "--script", "tizen-sdk-install", "--", ...dummyArgs({ tag: "sb" })],
  { CODEX_SANDBOX_NETWORK_DISABLED: "1" },
);
check(
  "CODEX_SANDBOX_NETWORK_DISABLED → sandbox_blocked failure, nothing started",
  sandboxed.code === 1 &&
    sandboxed.json &&
    sandboxed.json.status === "failure" &&
    sandboxed.json.errors[0].error_category === "sandbox_blocked" &&
    sandboxed.json.errors[0].error_code === "TIZEN_SDK_SANDBOX_E001" &&
    /escalated permissions/.test(sandboxed.json.errors[0].message),
  sandboxed.out.slice(0, 500),
);
check(
  "the fix re-runs the same `run --script` line with escalate: true",
  sandboxed.json &&
    sandboxed.json.errors[0].suggested_fix.escalate === true &&
    /^node job-cli\.js run --script tizen-sdk-install -- /.test(
      sandboxed.json.errors[0].suggested_fix.command,
    ),
  JSON.stringify(sandboxed.json && sandboxed.json.errors[0].suggested_fix),
);
check(
  "no job was created for the refused run",
  !fs
    .readdirSync(jobsDir)
    .some(
      (f) =>
        f.endsWith(".json") &&
        fs.readFileSync(path.join(jobsDir, f), "utf8").includes('"sb"'),
    ),
);
const sandboxOff = run(
  [
    "run",
    "--script",
    "tizen-sdk-install",
    "--",
    ...dummyArgs({ tag: "sboff" }),
  ],
  { CODEX_SANDBOX_NETWORK_DISABLED: "1", TIZEN_SANDBOX: "off" },
);
check(
  "TIZEN_SANDBOX=off → receipt again, marked sandboxed with the sandbox warning",
  sandboxOff.code === 0 &&
    sandboxOff.json &&
    sandboxOff.json.result.sandboxed === true &&
    sandboxOff.json.warnings.some((w) =>
      /Running inside Codex's sandbox/.test(w),
    ),
  sandboxOff.out.slice(0, 500),
);
if (sandboxOff.json && sandboxOff.json.result.job_id) {
  // Let the (instant) dummy script job finish so list/prune below see a done job.
  for (let i = 0; i < 4; i++) {
    const w = run([
      "wait",
      "--id",
      sandboxOff.json.result.job_id,
      "--timeout",
      "25",
    ]);
    if (!(
      w.json &&
      w.json.status === "success" &&
      w.json.result &&
      w.json.result.state === "running"
    ))
      break;
  }
}

// -- 8: list + pruning (including the .log) ----------------------------------
console.log("\n--- list and prune ---");
const oldId = "20000101T000000-abcdef";
fs.writeFileSync(
  path.join(jobsDir, `${oldId}.json`),
  JSON.stringify({
    job_id: oldId,
    state: "done",
    pid: 1,
    started_at: "2000-01-01T00:00:00.000Z",
    finished_at: "2000-01-01T00:10:00.000Z",
    exit_code: 0,
  }),
);
fs.writeFileSync(path.join(jobsDir, `${oldId}.log`), "old log\n");
fs.writeFileSync(path.join(jobsDir, `${oldId}.stdout`), "{}\n");
const listed = run(["list"]);
check(
  "list shows the finished script job with kind/script/exit_code",
  listed.code === 0 &&
    listed.json &&
    listed.json.result.jobs.some(
      (j) =>
        j.job_id === jobId &&
        j.kind === "script" &&
        j.script === "tizen-sdk-install" &&
        j.state === "done" &&
        j.exit_code === 0,
    ),
  listed.out.slice(0, 600),
);
check(
  "a week-old job is pruned together with its .log and .stdout",
  !fs.existsSync(path.join(jobsDir, `${oldId}.json`)) &&
    !fs.existsSync(path.join(jobsDir, `${oldId}.log`)) &&
    !fs.existsSync(path.join(jobsDir, `${oldId}.stdout`)),
);

// -- 9: orphan — wrapper killed, installer still running --------------------
console.log("\n--- orphaned installer ---");
const orphanReceipt = run([
  "run",
  "--script",
  "tizen-sdk-install",
  "--",
  ...dummyArgs({ sleep: 6, tag: "orphan" }),
]);
const orphanId = orphanReceipt.json && orphanReceipt.json.result.job_id;
let orphanMeta = null;
for (
  let attempt = 0;
  attempt < 10 && !(orphanMeta && orphanMeta.child_pid);
  attempt++
) {
  sleepSync(300);
  // Same merge readJobMeta() does: launcher meta (<id>.json) + wrapper
  // sidecar (<id>.child, carries child_pid/log_file).
  try {
    orphanMeta = JSON.parse(
      fs.readFileSync(path.join(jobsDir, `${orphanId}.json`), "utf8"),
    );
    try {
      Object.assign(
        orphanMeta,
        JSON.parse(
          fs.readFileSync(path.join(jobsDir, `${orphanId}.child`), "utf8"),
        ),
      );
    } catch (_e) {
      /* wrapper has not spawned the script yet */
    }
  } catch (_e) {
    orphanMeta = null;
  }
}
check(
  "the wrapper recorded the installer's child_pid in the <id>.child sidecar",
  orphanMeta && Number.isInteger(orphanMeta.child_pid),
  JSON.stringify(orphanMeta),
);
if (orphanMeta && orphanMeta.pid) {
  try {
    process.kill(orphanMeta.pid);
  } catch (_e) {
    /* already gone */
  }
}
sleepSync(500);
// Windows: libuv puts a non-detached child in a kill-on-close job object, so
// the installer dies with its wrapper and the job is a crash right away.
// POSIX: the installer survives as an orphan; child_pid keeps the job "running"
// until it exits, and only then is it a crash. Either way it must never read as
// a successful, finished job.
const orphanRunning = run(["status", "--id", orphanId]);
const orphanRunningOk =
  orphanRunning.json &&
  ((orphanRunning.json.status === "success" &&
    orphanRunning.json.result.state === "running") ||
    (orphanRunning.json.status === "failure" &&
      /exited without writing its result/.test(
        orphanRunning.json.errors[0].message,
      )));
check(
  IS_WIN
    ? "wrapper killed → installer died with it (job object) → reported as crashed, not success"
    : "wrapper killed but installer alive → status still says running",
  orphanRunningOk && (IS_WIN || orphanRunning.json.result.state === "running"),
  orphanRunning.out.slice(0, 400),
);
const orphanDone = run(["wait", "--id", orphanId, "--timeout", "25"]);
check(
  "a job whose processes are gone without an envelope is a failure, never a success",
  orphanDone.code === 1 &&
    orphanDone.json &&
    orphanDone.json.status === "failure" &&
    /exited without writing its result|left no JSON envelope/.test(
      orphanDone.json.errors[0].message,
    ),
  orphanDone.out.slice(0, 400),
);

// -- 10: suggested_fix plumbing (pure) ----------------------------------------
console.log("\n--- suggested_fix plumbing ---");
const { formatError } = require("../envelope/response-formatter");
const objectFix = formatError("tizen-sdk sdk-install", "execution_error", "m", {
  command: "powershell -File x.ps1",
  background_command: 'node "job-cli.js" run --script tizen-sdk-install',
});
check(
  "formatError object form keeps command + background_command, auto_fixable false",
  objectFix.errors[0].suggested_fix.command === "powershell -File x.ps1" &&
    objectFix.errors[0].suggested_fix.background_command ===
      'node "job-cli.js" run --script tizen-sdk-install' &&
    objectFix.errors[0].suggested_fix.auto_fixable === false,
  JSON.stringify(objectFix.errors[0].suggested_fix),
);
const stringFix = formatError("c", "execution_error", "m", "bash x.sh");
check(
  "formatError string form is unchanged (no background_command key)",
  stringFix.errors[0].suggested_fix.command === "bash x.sh" &&
    !("background_command" in stringFix.errors[0].suggested_fix),
  JSON.stringify(stringFix.errors[0].suggested_fix),
);

const sdk = require("../core/sdk");
const jobCmd = sdk.buildJobCommand("tizen-sdk-install", "-Force", "--force");
check(
  "buildJobCommand renders node job-cli.js run --script <group> -- <platform args>",
  /^node ".*job-cli\.js" run --script tizen-sdk-install -- (-Force|--force)$/.test(
    jobCmd,
  ),
  jobCmd,
);
check(
  "buildJobCommand without args has no trailing --",
  /run --script tizen-update-package$/.test(
    sdk.buildJobCommand("tizen-update-package", "", ""),
  ),
);
const fixPair = sdk.installerFix(
  "tizen-sdk-install",
  "/x/tizen-sdk-install.sh",
);
check(
  "installerFix pairs the foreground command with its job twin",
  /^(powershell|bash) /.test(fixPair.command) &&
    /job-cli\.js" run --script tizen-sdk-install$/.test(
      fixPair.background_command,
    ),
  JSON.stringify(fixPair),
);
check(
  "installerFix with no script path degrades to a command-only message",
  sdk.installerFix("tizen-tv-sdk-install", null, "", "", "nope").command ===
    "nope" &&
    !(
      "background_command" in
      sdk.installerFix("tizen-tv-sdk-install", null, "", "", "nope")
    ),
);
check(
  "harnessGuidance names Codex and background_command in both Cline modes",
  /Codex CLI/.test(sdk.harnessGuidance("detach")) &&
    /background_command/.test(sdk.harnessGuidance("detach")) &&
    /Codex CLI/.test(sdk.harnessGuidance("foreground")) &&
    /run in FOREGROUND/.test(sdk.harnessGuidance("foreground")) &&
    /--detach/.test(sdk.harnessGuidance("detach")),
);

const sdkSource = fs.readFileSync(
  path.join(__dirname, "../core/sdk.js"),
  "utf8",
);
const installerFixCalls = (sdkSource.match(/installerFix\(/g) || []).length - 1; // minus the definition
const guidanceCalls = (
  sdkSource.match(/harnessGuidance\("(detach|foreground)"\)/g) || []
).length;
// One installerFix()/harnessGuidance() pair per Phase-1 pre-check; the
// allowlist in jobs.js must name the same groups so `run --script` can launch
// every one of them.
const { SCRIPT_JOB_GROUPS } = require("../core/jobs");
check(
  `every Phase-1 pre-check in sdk.js hands back installerFix() (${SCRIPT_JOB_GROUPS.length} installers)`,
  installerFixCalls === SCRIPT_JOB_GROUPS.length,
  `installerFix call sites: ${installerFixCalls}, SCRIPT_JOB_GROUPS: ${SCRIPT_JOB_GROUPS.length}`,
);
check(
  "every installerFix() names a group in SCRIPT_JOB_GROUPS",
  [...sdkSource.matchAll(/installerFix\(\s*\n?\s*"([a-z0-9-]+)"/g)]
    .map((m) => m[1])
    .every((g) => SCRIPT_JOB_GROUPS.includes(g)),
  JSON.stringify(
    [...sdkSource.matchAll(/installerFix\(\s*\n?\s*"([a-z0-9-]+)"/g)].map(
      (m) => m[1],
    ),
  ),
);
check(
  `every Phase-1 pre-check message uses harnessGuidance() (${SCRIPT_JOB_GROUPS.length} installers)`,
  guidanceCalls === SCRIPT_JOB_GROUPS.length,
  `harnessGuidance call sites: ${guidanceCalls}`,
);
check(
  "no Phase-1 pre-check still hands back a bare buildScriptCommand()",
  (sdkSource.match(/buildScriptCommand\(/g) || []).length === 2, // definition + installerFix
);

fs.rmSync(workDir, { recursive: true, force: true });

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
