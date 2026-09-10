// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Plugin root path resolution and script execution utilities
 *
 * The same module serves every harness (Claude Code, Cline, Codex CLI,
 * Gemini CLI, tizen-cli); scripts/ is located by trying, in order:
 *
 *   1. TIZEN_SDK_SKILLS_ROOT env var        (tests / explicit override)
 *   2. <__dirname>/scripts                  (tizen-cli plugin: the esbuild
 *      bundle sits at ~/.tizen/plugins/tizen-sdk/ next to scripts/)
 *   3. <__dirname>/../../scripts            (running from lib/core in the repo
 *      checkout OR a host cache version dir: <VER>/lib/core → <VER>/scripts)
 *   4. Latest-version scan of the plugin caches (legacy fallback):
 *      ~/<HOST_DOT_DIR>/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/
 *      for each dot-dir in HOST_DOT_DIRS. This host's own cache root wins
 *      (see HOST_MARKERS: CLAUDECODE in Claude Code, GEMINI_CLI in Gemini CLI,
 *      CODEX_* in Codex CLI; Cline sets no marker, so it is the default);
 *      the other roots are only consulted when this host has no copy installed.
 *      <VERSION> must be numeric format (X.Y.Z) only — sibling directories
 *      like docs/, lib/ are not versions, so must be filtered with regex.
 *      Versions compare numerically (10.0.0 > 2.0.0), not lexicographically.
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { currentJobId, nextRunnerScriptLog } = require("./job-paths");

const cacheRootFor = (dotDir) =>
  path.join(
    os.homedir(),
    dotDir,
    "plugins",
    "cache",
    "tizen-platform",
    "tizen-sdk-skills",
  );

/**
 * User-config dot-dirs of every harness that mirrors this plugin into
 * ~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/.
 * Order here is the fallback order once this host's own root has been tried.
 * Keep in sync with the runner-lookup snippets in agents/ and skills/ (see
 * tests/plugin-cache.test.js, which greps them).
 */
const HOST_DOT_DIRS = [".claude", ".cline", ".codex", ".gemini"];

/**
 * Env vars each harness injects into the shells it spawns — any one of them
 * being set identifies the host. This is the single source of truth for the
 * runner-lookup snippets too (scripts/rewrite-runner-snippets.js renders the
 * bash/PowerShell host-pick lines from it).
 *
 *   Claude Code  CLAUDECODE=1
 *   Gemini CLI   GEMINI_CLI=1
 *   Codex CLI    CODEX_THREAD_ID / CODEX_SESSION_ID / CODEX_VERSION (newer
 *                builds inject these into every exec), CODEX_SANDBOX_NETWORK_
 *                DISABLED=1 (default workspace-write sandbox, incl. Windows),
 *                CODEX_SANDBOX=seatbelt (macOS). Codex env-clears the child and
 *                re-applies its policy, so these are the only reliable signals.
 *   Cline        none — it is the default when nothing else matches.
 */
const HOST_MARKERS = {
  ".claude": ["CLAUDECODE"],
  ".gemini": ["GEMINI_CLI"],
  ".codex": [
    "CODEX_THREAD_ID",
    "CODEX_SANDBOX_NETWORK_DISABLED",
    "CODEX_SANDBOX",
    "CODEX_VERSION",
  ],
  ".cline": [],
};

/** Host assumed when no marker is set (Cline sets none). */
const DEFAULT_HOST_DOT_DIR = ".cline";

/**
 * Detection precedence for nested harnesses, first match wins. Claude Code
 * passes its full env through to its Bash tool, so a Codex CLI launched from
 * inside Claude Code carries CODEX_* next to CLAUDECODE — the outer host still
 * owns the session. Codex env-clears its children, so the reverse cannot happen.
 */
const HOST_DETECT_ORDER = [".claude", ".gemini", ".codex"];

/**
 * Which harness is running us, by the env vars each one sets in spawned shells
 * (HOST_MARKERS). Falls back to DEFAULT_HOST_DOT_DIR (.cline) when none is set.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} dot-dir of the detected host
 */
function detectHostDotDir(env = process.env) {
  for (const dotDir of HOST_DETECT_ORDER) {
    if (HOST_MARKERS[dotDir].some((name) => env[name])) return dotDir;
  }
  return DEFAULT_HOST_DOT_DIR;
}

/**
 * Cache roots to scan, this host's own root first, then the rest of
 * HOST_DOT_DIRS in declaration order.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function orderedCacheRoots(env = process.env) {
  const own = detectHostDotDir(env);
  return [own, ...HOST_DOT_DIRS.filter((d) => d !== own)].map(cacheRootFor);
}

const CACHE_ROOTS = orderedCacheRoots();

/** Numeric X.Y.Z comparison — plain sort() puts 10.0.0 before 2.0.0. */
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
}

/** True if the candidate directory exists and contains a scripts/ subdir. */
function hasScriptsDir(root) {
  try {
    return !!root && fs.existsSync(path.join(root, "scripts"));
  } catch (_e) {
    return false;
  }
}

/**
 * Return the plugin root directory (the directory holding scripts/).
 *
 * Name kept from the original cache-only implementation ("latest version dir")
 * for call-site compatibility — debug.js calls this directly.
 *
 * @returns {string|null} plugin root, or null if no scripts/ can be found
 */
function findLatestVersionDir() {
  // 1) Explicit override
  if (hasScriptsDir(process.env.TIZEN_SDK_SKILLS_ROOT)) {
    return process.env.TIZEN_SDK_SKILLS_ROOT;
  }

  // 2) Bundle-relative (tizen-cli installed plugin: bundle + scripts side by side)
  if (hasScriptsDir(__dirname)) {
    return __dirname;
  }

  // 3) Relative to lib/core (repo checkout, or the running cache version itself)
  const rel = path.resolve(__dirname, "..", "..");
  if (hasScriptsDir(rel)) {
    return rel;
  }

  // 4) Legacy fallback: newest version dir in the plugin caches,
  //    preferring this host's own cache root
  for (const cacheRoot of CACHE_ROOTS) {
    let entries;
    try {
      entries = fs.readdirSync(cacheRoot);
    } catch (_e) {
      continue;
    }
    const versions = entries
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort(compareVersions);
    const latest = versions.pop();
    if (latest) {
      return path.join(cacheRoot, latest);
    }
  }
  return null;
}

/**
 * Resolve platform-specific script path from the plugin root
 *
 * @param {string} group - directory name under scripts/ and script base name
 *   (example: 'tizen-sdk-install' → scripts/tizen-sdk-install/tizen-sdk-install.ps1|.sh)
 * @returns {{scriptPath: string}|{error: string}}
 *   Returns error string instead of exception so caller can format error with its own command name.
 */
function resolveScript(group) {
  const versionDir = findLatestVersionDir();
  if (!versionDir) {
    return {
      error: `No plugin scripts directory found (checked TIZEN_SDK_SKILLS_ROOT, module-relative paths, and caches: ${CACHE_ROOTS.join(", ")})`,
    };
  }

  const ext = process.platform === "win32" ? ".ps1" : ".sh";
  const scriptPath = path.join(versionDir, "scripts", group, `${group}${ext}`);

  if (!fs.existsSync(scriptPath)) {
    return { error: `Script not found: ${scriptPath}` };
  }
  return { scriptPath };
}

/**
 * Synchronously execute plugin script in platform-specific way
 *
 * WARNING: do NOT use for tasks exceeding 10 minutes (SDK installation, etc.) —
 * agent executes such tasks via Bash run_in_background. Sync-only for checks/queries/builds.
 *
 * @param {string} scriptPath - path returned by resolveScript()
 * @param {string} winArgs - Windows PowerShell arguments (example: '-Check -SdkPath "..."')
 * @param {string} unixArgs - Linux/macOS bash arguments (example: '--check --sdk-path="..."')
 * @param {object} [opts]
 * @param {boolean} [opts.captureViaTempFile] - capture stdout/stderr via temp file instead of pipe.
 *   REQUIRED when script spawns long-lived child processes (emulator qemu, sdb server, etc.):
 *   if child inherits pipe write handle, pipe doesn't close when script exits and execSync blocks
 *   forever (observed: node hangs 8+ minutes after script exit). File redirection returns immediately
 *   when child exits.
 * Inside a detached job (--background; TIZEN_JOB_ID set by spawnDetached) the
 * script's output goes to <jobsDir>/<id>.script-<n>.log and is KEPT, so
 * `job-cli.js status/wait` can tail a running build or install live (issue
 * #48: under Codex a 3-minute build otherwise showed nothing but the runner's
 * header). The return value and error.stdout/error.stderr are unchanged in
 * both modes — only where the bytes live differs.
 *
 * @returns {string} script stdout (stdout+stderr merged in captureViaTempFile mode)
 * @throws propagates execSync error as-is (caller handles; error.stdout preserves output)
 */
function execPluginScript(scriptPath, winArgs, unixArgs, opts = {}) {
  // Default timeout: 30 minutes (1800s). Override via:
  //   1. opts.timeout (per-call)
  //   2. TIZEN_TOOL_TIMEOUT env var (global, in milliseconds)
  // This prevents MCP call timeout (default 60s) from killing long-running
  // operations like SDK install, emulator boot, or large builds.
  const defaultTimeout =
    parseInt(process.env.TIZEN_TOOL_TIMEOUT, 10) || 1800000;
  const timeout = opts.timeout || defaultTimeout;

  // -NoProfile -NonInteractive: the user's PowerShell profile (oh-my-posh, conda
  // init, module imports) can add seconds to EVERY script start, and a prompt
  // in it would hang a headless run. Codex CLI gives a runner call 30 s at most
  // (issue #48), so start-up overhead is part of the correctness budget.
  let command =
    process.platform === "win32"
      ? `chcp 65001 >nul && powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" ${winArgs}`.trim()
      : `bash "${scriptPath}" ${unixArgs}`.trim();

  // Detached job: one live, kept log per script call (see job-paths.js).
  const jobId = currentJobId();
  const jobLog = jobId ? nextRunnerScriptLog(jobId) : null;
  const readFile = (file) => {
    try {
      return fs.readFileSync(file, "utf-8");
    } catch (_e) {
      return "";
    }
  };

  if (!opts.captureViaTempFile) {
    if (!jobLog) {
      return execSync(command, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        // Provide headroom to avoid default 1MB buffer overflow on large-output scripts like builds
        maxBuffer: 64 * 1024 * 1024,
        timeout: timeout,
        // A detached (--background) runner has no console; without this every
        // cmd/powershell it starts would flash a new console window.
        windowsHide: true,
      });
    }
    // stdout → the job log (tailable while the script runs); stderr stays on
    // the pipe. The return value is still stdout only and error.stderr is
    // still the real stderr, so callers that split the two streams — build
    // diagnostics, sdk.js `error.stderr || error.message` — see exactly what
    // they see in the foreground.
    try {
      execSync(`${command} > "${jobLog}"`, {
        encoding: "utf-8",
        stdio: ["ignore", "ignore", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
        timeout: timeout,
        windowsHide: true,
      });
      return readFile(jobLog);
    } catch (error) {
      error.stdout = readFile(jobLog);
      throw error;
    }
  }

  const tmpFile =
    jobLog ||
    path.join(os.tmpdir(), `tizen-plugin-${process.pid}-${Date.now()}.out`);
  command += ` > "${tmpFile}" 2>&1`;
  try {
    execSync(command, {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: timeout,
      windowsHide: true,
    });
    return readFile(tmpFile);
  } catch (error) {
    error.stdout = readFile(tmpFile);
    throw error;
  } finally {
    // A job log is kept for status/wait and post-mortems (pruned with the job).
    // A plain temp file is removed; a long-lived child may still hold its
    // handle and make the deletion fail — ignore (temp dir, no impact).
    if (!jobLog) {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

module.exports = {
  HOST_DOT_DIRS,
  HOST_MARKERS,
  HOST_DETECT_ORDER,
  DEFAULT_HOST_DOT_DIR,
  CACHE_ROOTS,
  detectHostDotDir,
  orderedCacheRoots,
  findLatestVersionDir,
  resolveScript,
  execPluginScript,
};
