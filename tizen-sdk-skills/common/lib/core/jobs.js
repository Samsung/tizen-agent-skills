// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Detached runner jobs — `--background` for every *-cli.js runner (cli-runner.js
 * strips the flag at require time, whatever the runner's argv style), and
 * `job-cli.js run --script <group>` for the long installer scripts.
 *
 * Why this exists (issue #48): Codex CLI's exec tool waits at most 30 s per
 * call (MAX_YIELD_TIME_MS) and, on Windows, its follow-up `wait` was observed
 * returning "Script completed / Wall time 0.0 s" with only the runner's stderr
 * progress header while the runner was still running. Anything that boots an
 * emulator, builds, or installs packages therefore cannot be run as one
 * foreground tool call there. With `--background` the runner re-spawns itself
 * detached, returns a small job envelope within a second, and the caller polls
 * `job-cli.js wait --id <id>` (each poll ≤ 25 s) until the real envelope — the
 * child's stdout, verbatim — is available.
 *
 * Script jobs: the SDK / platform / package installers are 10-15 minute shell
 * scripts that the *-install-cli.js pre-checks hand back as suggested_fix. They
 * are not runners (no JSON envelope, and their logs are full of `{`), so they
 * never write into a job's stdout file. Instead `run --script <group>` detaches
 * `job-cli.js _exec`, a node wrapper that spawns the script with its output
 * redirected to <id>.log, waits for it, and then prints a synthesized envelope
 * (exit code + log tail) through the normal runCli() path — so status/wait work
 * exactly like they do for a runner job.
 *
 * Layout: <jobsDir>/<id>.json (meta), <id>.child (script jobs: the wrapper's
 * {child_pid, log_file}, merged into the meta by readJobMeta), <id>.stdout (the
 * envelope), <id>.stderr (progress lines), <id>.log (script jobs: the script's
 * own output), <id>.script-<n>.log (runner jobs: each execPluginScript() call's
 * output — see job-paths.js). jobsDir = $TIZEN_JOBS_DIR or
 * <os tmpdir>/tizen-sdk-skills-jobs.
 *
 * No dependency on cli-runner.js (it depends on this module).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Envelope } = require("../envelope/envelope");
const { formatError } = require("../envelope/response-formatter");
const { buildUserCommand } = require("../envelope/user-command");
const { resolveScript } = require("./plugin-cache");
const { detectSandbox, escalationFix, sandboxWarning } = require("./sandbox");
const {
  JOB_ID_ENV,
  JOB_ID_PATTERN,
  jobsDir,
  jobPaths,
  listRunnerScriptLogs,
} = require("./job-paths");

/**
 * Flag every runner accepts. cli-runner.js removes it from process.argv at
 * require time (before any runner parses its arguments), so option-style,
 * positional and hand-rolled parsers all get it for free.
 */
const BACKGROUND_FLAG = "--background";

/** `wait` never blocks longer than this: Codex's per-call window is 30 s. */
const MAX_WAIT_SECONDS = 25;
const DEFAULT_WAIT_SECONDS = 25;

/** Metas older than this are pruned by `list`. */
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** readTail() reads at most this much from the end of a file. */
const TAIL_BYTES = 64 * 1024;

/**
 * The installer/updater script groups `run --script` may launch — the scripts
 * whose pre-check runners hand them back as suggested_fix. A name, not a path:
 * the file is resolved through resolveScript() (same plugin root the pre-check
 * used), so guard rules 7/9 hold by construction — no arbitrary command ever
 * reaches this launcher.
 */
const SCRIPT_JOB_GROUPS = [
  "tizen-sdk-install",
  "tizen-sdk-install-custom-repo",
  "tizen-tv-sdk-install",
  "tizen-tv-sdk-install-from-zip",
  "tizen-update-package",
  "tizen-platform-install",
  "tizen-download-emulator-package",
  "tizen-download-mobile-platform",
  "tizen-install-rootstrap",
];

/**
 * Installer flags that must not be forwarded to a script job: the script's own
 * detach would double-detach, and the query flags return instantly, which would
 * make the job "succeed" without installing anything.
 */
const FORBIDDEN_SCRIPT_ARGS = /^-{1,2}(detach|status|wait|check|dry-?run)$/i;

/** True when the string carries a control character (newline, NUL, ESC, …). */
function hasControlChars(text) {
  for (const ch of String(text)) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function newJobId() {
  // 20260908T202631 + 6 hex: sortable by start time, unique enough per host.
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "");
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * The job's meta, with the script wrapper's <id>.child sidecar (child_pid,
 * log_file) merged in when present. The launcher writes <id>.json AFTER
 * spawning the wrapper, and the wrapper spawns the script within milliseconds
 * of starting — on a fast host the two used to race for the same file and the
 * child_pid was lost (overwritten by the launcher's `child_pid: null`, or
 * dropped because the meta did not exist yet). Each side now owns its own file.
 */
function readJobMeta(id) {
  const paths = jobPaths(id);
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(paths.meta, "utf8"));
  } catch (_e) {
    return null;
  }
  if (!meta || typeof meta !== "object") return null;
  try {
    const child = JSON.parse(fs.readFileSync(paths.child, "utf8"));
    if (child && typeof child === "object") {
      if (!meta.child_pid && Number.isInteger(child.child_pid)) {
        meta.child_pid = child.child_pid;
      }
      if (!meta.log_file && typeof child.log_file === "string") {
        meta.log_file = child.log_file;
      }
    }
  } catch (_e) {
    /* no sidecar (runner job, or the wrapper has not spawned yet) */
  }
  return meta;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: exists but not ours — still alive.
    return error.code === "EPERM";
  }
}

/**
 * A job is alive while its detached process OR (script jobs) the script it
 * spawned is alive — a killed wrapper must not turn a still-running installer
 * into "crashed".
 */
function isAnyAlive(meta) {
  return isPidAlive(meta.pid) || isPidAlive(meta.child_pid);
}

/**
 * True when THIS process cannot see the job's PIDs at all: a poller running
 * inside Codex's Linux sandbox (bubblewrap PID namespace) looking at a job that
 * was started outside it (escalated). process.kill(pid, 0) says ESRCH for every
 * host PID there, which must not be read as "the job died" — the meta file the
 * job writes on exit (markJobDone) is the only trustworthy signal.
 */
function livenessUnverifiable(meta, sb = detectSandbox()) {
  return !!sb.pid_namespace && meta.sandboxed !== true;
}

/**
 * Split argv into { argv (flag removed), background }. Only a `--background`
 * BEFORE the first bare `--` counts: after the separator the tokens belong to
 * a wrapped command (job-cli.js run --script … -- <installer args>), which
 * must receive them untouched.
 */
function stripBackgroundFlag(argv) {
  const sep = argv.indexOf("--");
  const head = sep === -1 ? argv : argv.slice(0, sep);
  const tail = sep === -1 ? [] : argv.slice(sep);
  const background = head.includes(BACKGROUND_FLAG);
  return {
    background,
    argv: background
      ? [...head.filter((a) => a !== BACKGROUND_FLAG), ...tail]
      : argv,
  };
}

/**
 * Re-run `scriptPath argv...` as a detached child, redirecting its stdout and
 * stderr to the job files, and return the job envelope for the launcher to
 * print. The child receives TIZEN_JOB_ID so runCli can mark the job done.
 *
 * @param {string} scriptPath - the runner file (process.argv[1])
 * @param {string[]} argv - the runner's arguments WITHOUT --background
 * @param {string} command - envelope command label
 * @param {string} userCommand - rendered command line, for the meta/list view
 * @param {object|Function} [extraMeta] - extra fields merged into the meta and
 *   the receipt result; a function receives the job paths and returns them
 * @param {string[]} [extraWarnings] - appended to the receipt's warnings
 */
function spawnDetached(
  scriptPath,
  argv,
  command,
  userCommand,
  extraMeta = {},
  extraWarnings = [],
) {
  const startTime = Date.now();
  const id = newJobId();
  const paths = jobPaths(id);
  try {
    fs.mkdirSync(paths.dir, { recursive: true });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Cannot create the jobs directory ${paths.dir}: ${error.message}. ` +
        `Set TIZEN_JOBS_DIR to a writable directory and retry.`,
      null,
      startTime,
    );
  }
  const extra = typeof extraMeta === "function" ? extraMeta(paths) : extraMeta;

  const outFd = fs.openSync(paths.stdout, "w");
  const errFd = fs.openSync(paths.stderr, "w");
  let child;
  try {
    child = spawn(process.execPath, [scriptPath, ...argv], {
      detached: true,
      stdio: ["ignore", outFd, errFd],
      windowsHide: true,
      env: { ...process.env, [JOB_ID_ENV]: id },
    });
    child.unref();
  } catch (error) {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
    return formatError(
      command,
      "execution_error",
      `Could not start the background job: ${error.message}`,
      null,
      startTime,
    );
  } finally {
    // The child holds its own handles; the launcher must not keep them open.
    try {
      fs.closeSync(outFd);
    } catch (_e) {
      /* already closed */
    }
    try {
      fs.closeSync(errFd);
    } catch (_e) {
      /* already closed */
    }
  }

  // Recorded for the post-mortem: a job started inside Codex's sandbox (only
  // possible with TIZEN_SANDBOX=off — cli-runner/spawnScriptJob refuse
  // otherwise) that vanishes is a sandbox_job_lost, not a mystery crash.
  const sb = detectSandbox();
  const inSandbox = sb.sandboxed || sb.marked;
  const meta = {
    job_id: id,
    state: "running",
    pid: child.pid,
    child_pid: null,
    command,
    user_command: userCommand,
    started_at: new Date(startTime).toISOString(),
    finished_at: null,
    exit_code: null,
    stdout_file: paths.stdout,
    stderr_file: paths.stderr,
    sandboxed: inSandbox,
    ...(inSandbox ? { sandbox_kind: sb.kind } : {}),
    ...extra,
  };
  writeJsonAtomic(paths.meta, meta);

  const envelope = new Envelope(command);
  envelope.startTime = startTime;
  return envelope.success(
    {
      job_id: id,
      state: "running",
      pid: child.pid,
      started_at: meta.started_at,
      background_command: userCommand,
      jobs_dir: paths.dir,
      ...(inSandbox
        ? { sandboxed: true, sandbox_kind: sb.kind }
        : { sandboxed: false }),
      ...extra,
      poll: `node job-cli.js wait --id ${id}`,
    },
    {
      warnings: [
        "This is a job receipt, not the result. Poll `node job-cli.js wait --id " +
          `${id}\` (blocks up to 25 s per call) until \`job.state\` is \`done\`; that ` +
          "response is the runner's own envelope, verbatim.",
        ...(inSandbox ? [sandboxWarning(sb)] : []),
        ...extraWarnings,
      ],
    },
  );
}

/**
 * Called by the detached child once its envelope is on stdout (or its usage
 * error is on stderr). Idempotent; ignores a missing meta.
 *
 * Owner-only by default: TIZEN_JOB_ID is inherited by everything the job
 * spawns (the script, and any runner a script might invoke), and a nested
 * runner finishing must not mark the PARENT job done while it is still
 * running. jobStatus passes `ownerOnly: false` when it classifies a job whose
 * processes are all gone.
 */
function markJobDone(id, exitCode, { ownerOnly = true } = {}) {
  if (!id || !JOB_ID_PATTERN.test(id)) return;
  const meta = readJobMeta(id);
  if (!meta) return;
  if (ownerOnly && meta.pid !== process.pid) return;
  meta.state = "done";
  meta.exit_code = exitCode;
  meta.finished_at = new Date().toISOString();
  try {
    writeJsonAtomic(jobPaths(id).meta, meta);
  } catch (_e) {
    /* the stdout file still carries the envelope */
  }
}

/**
 * Last non-empty lines of a file, reading only its final TAIL_BYTES — install
 * logs run to megabytes and wait() polls every second.
 */
function readTail(file, lines = 5) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    let text = buf.toString("utf8");
    // Drop the (possibly cut) first line when the file was longer than the window.
    if (length < size) text = text.slice(text.indexOf("\n") + 1);
    return text
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .slice(-lines);
  } catch (_e) {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

/**
 * The child's envelope: the first JSON object in its stdout, else in its
 * stderr (usage errors go there). null when neither parses.
 */
function readChildEnvelope(paths) {
  for (const file of [paths.stdout, paths.stderr]) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (_e) {
      continue;
    }
    const start = text.indexOf("{");
    if (start === -1) continue;
    try {
      const parsed = JSON.parse(text.slice(start));
      if (parsed && typeof parsed === "object" && parsed.status) return parsed;
    } catch (_e) {
      /* try the next file */
    }
  }
  return null;
}

function invalidJobId(id, command, startTime) {
  return formatError(
    command,
    "invalid_parameters",
    `Invalid job id '${id}'. Use the job_id from a --background receipt (letters, digits, dot, underscore, hyphen).`,
    "node job-cli.js list",
    startTime,
  );
}

/**
 * One job's state. A finished job returns the CHILD's envelope verbatim, plus
 * a `job` block — so the skill's envelope contract is unchanged.
 *
 * @param {string} id
 * @param {string} command - envelope command label
 * @returns {object} Standard JSON Envelope
 */
async function jobStatus(id, command = "tizen-sdk job status") {
  const startTime = Date.now();
  if (!id || !JOB_ID_PATTERN.test(String(id)))
    return invalidJobId(id, command, startTime);

  const meta = readJobMeta(id);
  const paths = jobPaths(id);
  if (!meta) {
    return formatError(
      command,
      "invalid_parameters",
      `No job '${id}' under ${paths.dir}. Jobs are per machine and per TIZEN_JOBS_DIR; ` +
        `list the known ones first.`,
      "node job-cli.js list",
      startTime,
    );
  }

  const startedMs = Date.parse(meta.started_at) || startTime;
  // Progress comes from the most script-like source available: a script job's
  // own log, else the newest <id>.script-<n>.log a runner job's
  // execPluginScript() calls are writing (tz build, em-cli …), else the
  // runner's stderr header lines.
  const runnerLogs = meta.log_file ? [] : listRunnerScriptLogs(id);
  const latestLog = meta.log_file || runnerLogs[runnerLogs.length - 1] || null;
  const progressTail = readTail(latestLog || paths.stderr, 5);

  if (meta.state === "running") {
    const sb = detectSandbox();
    const unverifiable = livenessUnverifiable(meta, sb);
    if (isAnyAlive(meta) || unverifiable) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success(
        {
          job_id: id,
          state: "running",
          pid: meta.pid,
          ...(meta.child_pid ? { child_pid: meta.child_pid } : {}),
          started_at: meta.started_at,
          elapsed_ms: Date.now() - startedMs,
          background_command: meta.user_command,
          ...(unverifiable ? { liveness: "unverifiable" } : {}),
          ...(latestLog ? { log_file: latestLog } : {}),
          ...(runnerLogs.length ? { log_files: runnerLogs } : {}),
          progress_tail: progressTail,
          poll: `node job-cli.js wait --id ${id}`,
        },
        unverifiable
          ? {
              warnings: [
                "Polling from inside Codex's Linux sandbox cannot see the escalated job's process " +
                  "(PID namespace); state comes from the job's meta file only, which the job updates " +
                  "when it exits. For a definitive answer run this wait with escalated permissions.",
              ],
            }
          : {},
      );
    }
    // Every process is gone but nothing marked the job done: killed, crashed,
    // or the host rebooted. Whatever it managed to write is the only evidence.
    const partial = readChildEnvelope(paths);
    if (partial) {
      markJobDone(id, partial.status === "success" ? 0 : 1, {
        ownerOnly: false,
      });
      return finishedEnvelope(id, readJobMeta(id) || meta, partial, startedMs);
    }
    markJobDone(id, 1, { ownerOnly: false });
    if (meta.sandboxed === true) {
      // Started inside the sandbox (TIZEN_SANDBOX=off) and gone without a
      // result: the sandbox ended it — Linux tears the PID namespace down
      // with the exec call; elsewhere sockets / SDK writes were blocked.
      return formatError(
        command,
        "sandbox_job_lost",
        `Job '${id}' (${meta.user_command}) was started inside Codex's ${meta.sandbox_kind || "workspace-write"} ` +
          "sandbox and exited without writing its result — the sandbox terminated it (Linux PID namespace) " +
          "or blocked it (TCP sockets, writes under <sdk>/<sdk>-data). Re-run the command with escalated " +
          "permissions. The last output lines are in details.",
        escalationFix(`${meta.user_command} --background`),
        startTime,
        progressTail.map((l) => `raw: ${l}`),
      );
    }
    const lost = formatError(
      command,
      "execution_error",
      `Job '${id}' (${meta.user_command}) exited without writing its result — it was killed ` +
        `or crashed. The last output lines are in details.`,
      null,
      startTime,
      progressTail.map((l) => `raw: ${l}`),
    );
    if (sb.sandboxed) lost.warnings = [sandboxWarning(sb)];
    return lost;
  }

  const child = readChildEnvelope(paths);
  if (!child) {
    return formatError(
      command,
      "execution_error",
      `Job '${id}' finished (exit ${meta.exit_code}) but left no JSON envelope in ${paths.stdout}.`,
      null,
      startTime,
      [...readTail(paths.stdout, 5), ...progressTail].map((l) => `raw: ${l}`),
    );
  }
  return finishedEnvelope(id, meta, child, startedMs);
}

function finishedEnvelope(id, meta, child, startedMs) {
  const finishedMs = Date.parse(meta.finished_at) || Date.now();
  const logs = listRunnerScriptLogs(id);
  return {
    ...child,
    job: {
      id,
      state: "done",
      exit_code: meta.exit_code,
      started_at: meta.started_at,
      finished_at: meta.finished_at,
      duration_ms: Math.max(0, finishedMs - startedMs),
      // Kept on disk for post-mortems (pruned with the job after 7 days).
      ...(logs.length ? { log_files: logs } : {}),
    },
  };
}

/**
 * Block up to `timeoutSec` (≤ 25) for the job to finish, then report like
 * jobStatus. A running job after the wait is a success envelope with
 * state "running" — call again.
 */
async function jobWait(
  id,
  timeoutSec = DEFAULT_WAIT_SECONDS,
  command = "tizen-sdk job wait",
) {
  const startTime = Date.now();
  if (!id || !JOB_ID_PATTERN.test(String(id)))
    return invalidJobId(id, command, startTime);
  const requested = Number(timeoutSec);
  if (!Number.isFinite(requested) || requested < 0) {
    return formatError(
      command,
      "invalid_parameters",
      `Invalid timeout: ${timeoutSec}. Use 0-${MAX_WAIT_SECONDS} seconds (Codex CLI gives a tool call 30 s).`,
      null,
      startTime,
    );
  }
  const budgetMs = Math.min(requested, MAX_WAIT_SECONDS) * 1000;
  const deadline = startTime + budgetMs;
  for (;;) {
    const meta = readJobMeta(id);
    if (!meta || meta.state !== "running") break;
    // A poller inside the Linux sandbox cannot see an escalated job's PID;
    // keep polling the meta file until the budget runs out instead of
    // declaring the job dead (livenessUnverifiable).
    if (!isAnyAlive(meta) && !livenessUnverifiable(meta)) break;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000, remaining)),
    );
  }
  const result = await jobStatus(id, command);
  if (result.status === "success" && result.result?.state === "running") {
    result.warnings = [
      `Still running after ${Math.round(budgetMs / 1000)} s — call the same wait again.`,
    ];
  }
  return result;
}

/**
 * Recent jobs, newest first; prunes metas older than PRUNE_AFTER_MS.
 */
async function jobList(limit = 20, command = "tizen-sdk job list") {
  const startTime = Date.now();
  const dir = jobsDir();
  let entries = [];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch (_e) {
    entries = [];
  }
  const jobs = [];
  const now = Date.now();
  for (const file of entries) {
    const id = file.slice(0, -".json".length);
    if (!JOB_ID_PATTERN.test(id)) continue;
    const meta = readJobMeta(id);
    if (!meta) continue;
    const startedMs = Date.parse(meta.started_at) || 0;
    if (now - startedMs > PRUNE_AFTER_MS) {
      // Everything the job left behind: meta, stdout/stderr, script log(s),
      // and a stray .json.<pid>.tmp from an interrupted writeJsonAtomic.
      let leftovers = [];
      try {
        leftovers = fs
          .readdirSync(dir)
          .filter((f) => f === `${id}.json` || f.startsWith(`${id}.`));
      } catch (_e) {
        leftovers = [];
      }
      for (const f of leftovers) {
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch (_e) {
          /* best effort */
        }
      }
      continue;
    }
    let state = meta.state;
    if (state === "running" && !isAnyAlive(meta)) state = "exited";
    jobs.push({
      job_id: id,
      state,
      pid: meta.pid,
      ...(meta.kind ? { kind: meta.kind } : {}),
      ...(meta.script ? { script: meta.script } : {}),
      background_command: meta.user_command,
      started_at: meta.started_at,
      finished_at: meta.finished_at,
      exit_code: meta.exit_code,
    });
  }
  jobs.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const envelope = new Envelope(command);
  envelope.startTime = startTime;
  return envelope.success({
    jobs: jobs.slice(0, Math.max(1, Number(limit) || 20)),
    count: jobs.length,
    jobs_dir: dir,
  });
}

// ---------------------------------------------------------------------------
// Script jobs — `job-cli.js run --script <group> [-- <args>]`
// ---------------------------------------------------------------------------

/** How the launch is rendered in receipts, metas, and the relayed envelope. */
function renderRunCommand(group, args) {
  return buildUserCommand(
    ["run", "--script", group, ...(args.length ? ["--", ...args] : [])],
    "node job-cli.js",
  );
}

/**
 * The exact argv the wrapper spawns for a script: PowerShell for .ps1, bash
 * for .sh, never through a shell (so quoting and injection are non-issues).
 * -NoProfile/-NonInteractive: no profile cost, and a prompt fails instead of
 * hanging a detached process nobody can answer.
 */
function scriptSpawnSpec(scriptPath, args) {
  if (/\.ps1$/i.test(scriptPath)) {
    return {
      file: "powershell",
      argv: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        ...args,
      ],
    };
  }
  return { file: "bash", argv: [scriptPath, ...args] };
}

/**
 * Reject anything `run`/`_exec` must not launch. Returns an error envelope or
 * null when the request is acceptable.
 */
function validateScriptJob(group, args, command, startTime) {
  if (!group || !SCRIPT_JOB_GROUPS.includes(String(group))) {
    return formatError(
      command,
      "invalid_parameters",
      `Unknown script '${group}'. run --script accepts only the installer/updater groups: ` +
        `${SCRIPT_JOB_GROUPS.join(", ")}. Runners (*-cli.js) take --background instead.`,
      null,
      startTime,
    );
  }
  for (const arg of args) {
    if (typeof arg !== "string" || hasControlChars(arg)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid script argument ${JSON.stringify(arg)}: control characters are not allowed.`,
        null,
        startTime,
      );
    }
    if (FORBIDDEN_SCRIPT_ARGS.test(arg)) {
      return formatError(
        command,
        "invalid_parameters",
        `Argument '${arg}' is not allowed in a script job: the job already runs the script detached ` +
          `and reports its exit code, so the script's own detach/status/wait/check/dry-run modes ` +
          `would return instantly and make the job succeed without installing anything.`,
        null,
        startTime,
      );
    }
  }
  return null;
}

/**
 * A running script job with the same group and arguments, if any — Codex is
 * prone to re-issuing an install after a partial result, and two installers
 * on the same SDK dir only get in each other's way.
 */
function findRunningScriptJob(group, args) {
  let entries = [];
  try {
    entries = fs.readdirSync(jobsDir()).filter((f) => f.endsWith(".json"));
  } catch (_e) {
    return null;
  }
  const wanted = JSON.stringify(args);
  for (const file of entries) {
    const id = file.slice(0, -".json".length);
    if (!JOB_ID_PATTERN.test(id)) continue;
    const meta = readJobMeta(id);
    if (
      meta &&
      meta.kind === "script" &&
      meta.script === group &&
      JSON.stringify(meta.script_args || []) === wanted &&
      meta.state === "running" &&
      isAnyAlive(meta)
    ) {
      return meta;
    }
  }
  return null;
}

/**
 * Launcher: detach `job-cli.js _exec --script <group> -- <args>` and return
 * the job receipt. Finishes within a second; the install runs on.
 *
 * @param {string} group - one of SCRIPT_JOB_GROUPS
 * @param {string[]} args - forwarded to the script verbatim
 * @param {string} command - envelope command label
 * @returns {object} Standard JSON Envelope (receipt)
 */
async function spawnScriptJob(group, args = [], command = "tizen-sdk job run") {
  const startTime = Date.now();
  const invalid = validateScriptJob(group, args, command, startTime);
  if (invalid) return invalid;

  const resolved = resolveScript(group);
  if (resolved.error) {
    return formatError(command, "io_error", resolved.error, null, startTime);
  }

  const userCommand = renderRunCommand(group, args);
  const duplicate = findRunningScriptJob(group, args);
  if (duplicate) {
    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        job_id: duplicate.job_id,
        state: "running",
        pid: duplicate.pid,
        ...(duplicate.child_pid ? { child_pid: duplicate.child_pid } : {}),
        started_at: duplicate.started_at,
        background_command: duplicate.user_command,
        jobs_dir: jobsDir(),
        kind: "script",
        script: group,
        script_args: args,
        log_file: duplicate.log_file,
        poll: `node job-cli.js wait --id ${duplicate.job_id}`,
      },
      {
        warnings: [
          `An identical script job (${duplicate.job_id}) is already running — not starting a second ` +
            `installer. Poll that job instead.`,
        ],
      },
    );
  }

  // Inside Codex's sandbox the installer job cannot work: it downloads (network
  // disabled), writes under <sdk> (outside the workspace) and, on Linux, dies
  // with the exec call (PID namespace). Refuse and hand back the same `run`
  // line to be re-run with escalated permissions. TIZEN_SANDBOX=off overrides.
  const sb = detectSandbox();
  if (sb.sandboxed) {
    return formatError(
      command,
      "sandbox_blocked",
      `job-cli.js run --script ${group} cannot start inside Codex's ${sb.kind} sandbox: the installer ` +
        `downloads packages (CODEX_SANDBOX_NETWORK_DISABLED), writes under the SDK directory and` +
        `${sb.pid_namespace ? " would be killed when this exec call ends (Linux PID namespace)" : " would inherit the sandbox"}. ` +
        "Nothing was started. Re-run this exact command with escalated permissions (outside the " +
        "sandbox); set TIZEN_SANDBOX=off to override.",
      escalationFix(userCommand),
      startTime,
    );
  }
  const warnings = [];

  return spawnDetached(
    path.join(__dirname, "..", "cli", "job-cli.js"),
    ["_exec", "--script", group, ...(args.length ? ["--", ...args] : [])],
    command,
    userCommand,
    (paths) => ({
      kind: "script",
      script: group,
      script_args: args,
      script_path: resolved.scriptPath,
      log_file: paths.log,
    }),
    warnings,
  );
}

/**
 * Wrapper (the detached child): run the script with its output in the job
 * log, wait for it, and return the synthesized envelope that runCli prints
 * into the job's stdout — exit code, signal, log file and tail.
 *
 * @param {string} group - one of SCRIPT_JOB_GROUPS
 * @param {string[]} args - forwarded to the script verbatim
 * @param {string} command - envelope command label
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function execScriptJobChild(
  group,
  args = [],
  command = "tizen-sdk job run",
) {
  const startTime = Date.now();
  const invalid = validateScriptJob(group, args, command, startTime);
  if (invalid) return invalid;

  const resolved = resolveScript(group);
  if (resolved.error) {
    return formatError(command, "io_error", resolved.error, null, startTime);
  }

  const id = process.env[JOB_ID_ENV];
  const hasJob = Boolean(id && JOB_ID_PATTERN.test(id));
  const logFile = hasJob
    ? jobPaths(id).log
    : path.join(jobsDir(), `adhoc-${process.pid}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const userCommand = renderRunCommand(group, args);
  const { file, argv } = scriptSpawnSpec(resolved.scriptPath, args);
  const rendered = [file, ...argv]
    .map((a) => (/\s/.test(a) ? `"${a}"` : a))
    .join(" ");

  const logFd = fs.openSync(logFile, "a");
  let outcome;
  try {
    console.error(`[tizen-job] running ${rendered}`);
    console.error(`[tizen-job] log: ${logFile}`);
    outcome = await new Promise((resolve) => {
      let child;
      try {
        child = spawn(file, argv, {
          stdio: ["ignore", logFd, logFd],
          windowsHide: true,
        });
      } catch (error) {
        resolve({ code: null, signal: null, error });
        return;
      }
      if (hasJob) {
        // Own sidecar, not the meta: the launcher may still be writing
        // <id>.json at this very moment (see readJobMeta), and a
        // read-modify-write of it here silently lost the child_pid on fast
        // hosts (CI). readJobMeta merges <id>.child into every meta read.
        try {
          writeJsonAtomic(jobPaths(id).child, {
            child_pid: child.pid,
            log_file: logFile,
          });
        } catch (_e) {
          /* status still works off pid */
        }
      }
      child.on("error", (error) =>
        resolve({ code: null, signal: null, error }),
      );
      // `exit`, not `close`: the child writes straight to the log fd, there
      // are no pipes to drain.
      child.on("exit", (code, signal) =>
        resolve({ code, signal, error: null }),
      );
    });
  } finally {
    try {
      fs.closeSync(logFd);
    } catch (_e) {
      /* ignore */
    }
  }

  const finishedAt = new Date().toISOString();
  const logTail = readTail(logFile, 20);
  const result = {
    script: group,
    script_args: args,
    script_path: resolved.scriptPath,
    exit_code: outcome.code,
    signal: outcome.signal || null,
    log_file: logFile,
    log_tail: logTail,
    started_at: new Date(startTime).toISOString(),
    finished_at: finishedAt,
  };

  if (outcome.error) {
    const failed = formatError(
      command,
      "execution_error",
      `Could not start ${file} for ${group}: ${outcome.error.message}.`,
      null,
      startTime,
      logTail.map((l) => `raw: ${l}`),
    );
    failed.user_command = userCommand;
    return failed;
  }

  if (outcome.code === 0) {
    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    const ok = envelope.success(result, {
      warnings: [
        `${group} finished with exit code 0. Re-run its pre-check runner to verify the install ` +
          `state (the runner is the source of truth, not this exit code).`,
      ],
    });
    ok.user_command = userCommand;
    return ok;
  }

  const how =
    outcome.code === null
      ? `was terminated by signal ${outcome.signal}`
      : `exited with code ${outcome.code}`;
  const failed = formatError(
    command,
    "execution_error",
    `${group} ${how}. The full log is ${logFile}; its last lines are in details.`,
    null,
    startTime,
    logTail.map((l) => `raw: ${l}`),
  );
  failed.user_command = userCommand;
  // Keep the observed facts alongside the error for callers that read result.
  failed.result = result;
  return failed;
}

module.exports = {
  BACKGROUND_FLAG,
  JOB_ID_ENV,
  JOB_ID_PATTERN,
  MAX_WAIT_SECONDS,
  SCRIPT_JOB_GROUPS,
  FORBIDDEN_SCRIPT_ARGS,
  jobsDir,
  jobPaths,
  stripBackgroundFlag,
  spawnDetached,
  markJobDone,
  readJobMeta,
  readTail,
  isPidAlive,
  isAnyAlive,
  livenessUnverifiable,
  jobStatus,
  jobWait,
  jobList,
  listRunnerScriptLogs,
  renderRunCommand,
  spawnScriptJob,
  execScriptJobChild,
};
