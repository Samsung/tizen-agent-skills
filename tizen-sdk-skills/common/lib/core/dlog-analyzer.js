// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * tizen-dlog-analyzer — background dlog monitoring for crash/exception detection.
 *
 * Domain module: owns the business logic for managing the native
 * tizen-dlog-analyzer binary as a detached background process.
 * Exposed via sdk-commands.js and invoked by the thin dlog-analyzer-cli.js
 * runner (and by the tizen-cli plugin through sdk-commands).
 *
 * Actions:
 *   startDlogAnalyzer  — Launch the binary in background, capture stdout to a temp file
 *   stopDlogAnalyzer   — Kill the running background process
 *   checkDlogAnalyzer  — Read the temp file and return analyzed output
 *   statusDlogAnalyzer — Check if the background process is still running
 *   launchApp          — Launch a Tizen app on the connected device via sdb
 *   terminateApp       — Terminate a running Tizen app via sdb
 *   collectAppLogs     — Collect dlog filtered by app PID (app-specific logs)
 *   analyzeErrors      — Analyze collected app logs for non-fatal runtime errors (E/F priority)
 *   dumpDeviceLogs     — One-shot dlog buffer dump via sdb (`dlog -d`), optional tag/priority filter
 *   clearDeviceLogs    — Clear the device dlog buffer via sdb (`dlog -c`), confirmation-gated
 *
 * The last two are plain sdb actions (no native binary involved). They live
 * here — not in sdb-helper — so that every device-log request has ONE owner:
 * sdb-helper hands its log intents off to this skill, and this runner covers
 * both the quick one-shot operations and the continuous collect/analyze flow.
 */

const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveSdbBinary, resolveSerial, runSdb } = require("./sdb");
const { orderedCacheRoots } = require("./plugin-cache");

// --- State files (PID + output) are kept in the OS temp dir ---
const STATE_DIR = path.join(os.tmpdir(), "tizen-dlog-analyzer");
const PID_FILE = path.join(STATE_DIR, "analyzer.pid");
const OUTPUT_FILE = path.join(STATE_DIR, "analyzer-output.log");

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Tizen app IDs are dotted identifiers such as `org.example.myapp` or
 * `abcDEF1234.MyApp`. The app ID is interpolated into `sdb shell` command
 * strings, so anything outside this character set is rejected up front —
 * the same rule debug.js / webapp-debug.js apply.
 */
const APP_ID_RE = /^[A-Za-z0-9._-]+$/;

function isValidAppId(appId) {
  return typeof appId === "string" && APP_ID_RE.test(appId);
}

/**
 * A dlog filterspec is `<tag>[:<priority>]` — e.g. `*:E`, `E20:W`, `CHROMIUM`.
 * Priorities: V D I W E F S (S = silent). The specs are spliced into the
 * `sdb dlog` command line (quoted), so anything outside this shape is
 * rejected before it can reach the shell.
 */
const DLOG_FILTERSPEC_RE = /^[A-Za-z0-9_.*-]+(:[VDIWEFS])?$/;

/**
 * Normalize the `--filter` value of log-dump into a list of filterspecs.
 * Accepts a string (space- or comma-separated) or an array of strings.
 * @returns {{specs: string[]}|{error: string}}
 */
function parseFilterSpecs(filter) {
  if (filter === undefined || filter === null || filter === "") {
    return { specs: [] };
  }
  const tokens = (
    Array.isArray(filter) ? filter : String(filter).split(/[\s,]+/)
  )
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0);
  for (const token of tokens) {
    if (!DLOG_FILTERSPEC_RE.test(token)) {
      return {
        error:
          `Invalid dlog filterspec: ${JSON.stringify(token)}. ` +
          'Use <tag>[:<V|D|I|W|E|F|S>] such as "*:E", "E20:W" or "CHROMIUM".',
      };
    }
  }
  return { specs: tokens };
}

/**
 * Keep only the last `limit` lines of a dump (0 = unlimited).
 * @returns {{text: string, total_lines: number, returned_lines: number, truncated: boolean}}
 */
function tailLines(text, limit) {
  const body = typeof text === "string" ? text.replace(/\r\n/g, "\n") : "";
  const lines = body.length === 0 ? [] : body.replace(/\n$/, "").split("\n");
  const total = lines.length;
  if (!limit || limit <= 0 || total <= limit) {
    return {
      text: lines.join("\n"),
      total_lines: total,
      returned_lines: total,
      truncated: false,
    };
  }
  const kept = lines.slice(total - limit);
  return {
    text: kept.join("\n"),
    total_lines: total,
    returned_lines: kept.length,
    truncated: true,
  };
}

/**
 * Make a raw `sdb dlog` dump readable and greppable: dlog colours E/F lines
 * with ANSI SGR escapes, and on Windows sdb emits CRLF on top of the device's
 * own CR, so a line ends in `\r\r\n`. Strip the escapes and normalise every
 * line break to `\n` before the text is tailed or written to the dump file.
 */
// eslint-disable-next-line no-control-regex
const ANSI_SGR_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function sanitizeDlogOutput(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(ANSI_SGR_RE, "")
    .replace(/\r+\n/g, "\n") // CRLF and CRCRLF → LF
    .replace(/\r/g, "\n"); // a lone CR is still a line break
}

/**
 * Confirmation gate for log-clear. Returns the failure envelope when
 * `confirm` is not an explicit true, or null when the caller may proceed.
 * Pure (no sdb) so the gate is unit-tested without a device — same contract
 * as the emulator-manager `reset` gate (user_input_required + suggested_fix).
 */
function buildLogClearGate(command, serial, confirm) {
  if (confirm === true || confirm === "true") return null;
  const target = serial ? `device ${serial}` : "the connected device";
  const serialFlag = serial ? ` --serial ${serial}` : "";
  return {
    command,
    status: "failure",
    errors: [
      {
        category: "user_input_required",
        message:
          `Clearing the dlog buffer on ${target} discards every log line currently held on the device (sdb dlog -c). ` +
          "This cannot be undone. Ask the user to confirm, then re-run with --confirm.",
        suggested_fix: {
          command: `tizen-sdk dlog-analyzer --action log-clear${serialFlag} --confirm`,
          auto_fixable: false,
        },
      },
    ],
  };
}

function invalidAppIdError(command, appId) {
  return {
    command,
    status: "failure",
    errors: [
      {
        category: "invalid_parameters",
        message: `Invalid app id: ${appId}. Allowed characters: letters, digits, '.', '_', '-'.`,
      },
    ],
  };
}

/**
 * First whitespace-separated token that is a positive integer, or null.
 * Used for `pgrep` (one PID per line) and `pidof` (PIDs on one line) output.
 */
function parseFirstPid(output) {
  if (typeof output !== "string") return null;
  const token = output.trim().split(/\s+/)[0];
  if (!token || !/^\d+$/.test(token)) return null;
  const pid = parseInt(token, 10);
  return pid > 0 ? pid : null;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the PID of `appId` in raw `ps` output.
 *
 * Tizen `ps` output varies by profile:
 *   Busybox:   PID  USER   STAT  VSZ  %CPU  %MEM  COMMAND
 *   Standard:  UID  PID    PPID  C    STIME TTY   TIME  CMD
 * In both layouts the PID is the first integer on the line. The app ID must
 * appear as a whole token (bounded by characters outside the app-id charset)
 * so `org.example.myapp` does not match `org.example.myapp2`.
 */
function extractPidFromPsOutput(output, appId) {
  if (typeof output !== "string" || !appId) return null;
  const idRe = new RegExp(
    `(^|[^A-Za-z0-9._-])${escapeRegex(appId)}(?![A-Za-z0-9._-])`,
  );
  for (const line of output.split("\n")) {
    if (!idRe.test(line)) continue;
    // Skip a grep/pgrep process that happens to carry the app id as an argument
    if (/\bp?grep\b/.test(line)) continue;
    const match = line.match(/\b(\d+)\b/);
    if (!match) continue;
    const pid = parseInt(match[1], 10);
    if (pid > 0) return pid;
  }
  return null;
}

/**
 * Unique-error count reported by the native `error-analyze` output, or 0.
 *
 * Supports two output formats:
 * - Current (token-efficient plain text): summary lines `N. Module=TAG | ...`
 *   and/or `[Error N]` detail blocks
 * - Legacy: a "Found N unique error(s)" line
 *
 * The current-format matchers are anchored to line starts and run first. The
 * legacy matcher is a free-text search, so it is only consulted when no
 * current-format line is present — otherwise app log text echoed in a
 * `Message:` / `Full log:` line (e.g. "7 unique errors skipped") would win
 * over the real finding count.
 */
function parseErrorCount(output) {
  if (typeof output !== "string") return 0;
  // Current format: count summary lines "N. Module=TAG | ..."
  const summaryMatches = output.match(/^\d+\.\s+Module=/gm);
  if (summaryMatches) return summaryMatches.length;
  // Current format (details only): count [Error N] blocks
  const detailMatches = output.match(/^\[Error \d+\]/gm);
  if (detailMatches) return detailMatches.length;
  // Legacy format: "Found N unique errors"
  const legacyMatch = /(\d+)\s+unique\s+error/i.exec(output);
  if (legacyMatch) return parseInt(legacyMatch[1], 10);
  return 0;
}

/**
 * Resolve the platform-specific binary path.
 *
 * Search order:
 *   1. Every host plugin cache (~/.claude, ~/.cline, ~/.codex, ~/.gemini —
 *      own host first), versioned subdirs: <root>/<ver>/tools/tizen-dlog-analyzer/<os>/
 *   2. tools/ next to this module's directory — the tizen-cli bundle lives in
 *      dist/ and esbuild copies common/tools to dist/tools/
 *   3. The repo source tree: lib/core -> common/tools
 */
function resolveBinary() {
  const platform = process.platform;
  let binOs;
  if (platform === "linux") binOs = "linux";
  else if (platform === "darwin") binOs = "macos";
  else if (platform === "win32") binOs = "windows";
  else binOs = "linux";

  const searchBases = [
    ...orderedCacheRoots(),
    path.join(__dirname, "tools"),
    path.resolve(__dirname, "..", "..", "tools"),
  ];

  const binName =
    platform === "win32" ? "tizen-dlog-analyzer.exe" : "tizen-dlog-analyzer";

  for (const base of searchBases) {
    if (!fs.existsSync(base)) continue;
    // Check versioned subdirectories in cache
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(
        base,
        entry.name,
        "tools",
        "tizen-dlog-analyzer",
        binOs,
        binName,
      );
      if (fs.existsSync(candidate)) return candidate;
    }
    // Also check without version subdir (repo tools)
    const directCandidate = path.join(
      base,
      "tizen-dlog-analyzer",
      binOs,
      binName,
    );
    if (fs.existsSync(directCandidate)) return directCandidate;
  }

  return null;
}

/**
 * Resolve sdb path and connected device serial via the shared sdb helpers.
 */
function resolveDevice(serial) {
  const resolved = resolveSdbBinary();
  if (resolved.error) return { error: resolved.error };

  const target = resolveSerial(resolved.sdbPath, serial);
  if (target.errorCategory) return { error: target.message };

  return { sdbPath: resolved.sdbPath, serial: target.serial };
}

/**
 * Check if a process with the given PID is still running.
 */
function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the current background process PID (if any).
 */
function getRunningPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isProcessRunning(pid) ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Start background dlog monitoring.
 * @param {string} subcommand - dlog-collect | exception-detect | start-monitoring
 * @param {string} [serial] - Optional device serial
 * @param {string} [outputDir] - Optional output directory
 * @param {string} [commandLabel] - Envelope command label
 */
async function startDlogAnalyzer(subcommand, serial, outputDir, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer start";
  ensureStateDir();

  // Check if already running
  const existingPid = getRunningPid();
  if (existingPid) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "already_running",
          message: `tizen-dlog-analyzer is already running (PID ${existingPid}). Stop it first with: node dlog-analyzer-cli.js stop`,
        },
      ],
    };
  }

  // Resolve binary
  const binaryPath = resolveBinary();
  if (!binaryPath) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "binary_not_found",
          message:
            "tizen-dlog-analyzer binary not found for this platform. Ensure the setup script has been run.",
        },
      ],
    };
  }

  // Resolve device
  const device = resolveDevice(serial);
  if (device.error) {
    return {
      command,
      status: "failure",
      errors: [{ category: "device_not_found", message: device.error }],
    };
  }

  const outDir = outputDir || path.join(STATE_DIR, "dlog-output");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Open output file for writing (truncate)
  const outFd = fs.openSync(OUTPUT_FILE, "w");
  const errFd = fs.openSync(OUTPUT_FILE, "a");

  // Spawn the binary as a detached background process
  const child = spawn(
    binaryPath,
    [subcommand, "--serial", device.serial, "--base-dir", outDir],
    {
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: {
        ...process.env,
        SDB_SERIAL: device.serial,
        SDB_PATH: device.sdbPath,
      },
    },
  );

  // Without an 'error' listener, a failed spawn (ENOENT/EACCES, e.g. missing
  // exec bit) raises an uncaught exception during the wait below
  let spawnError = null;
  child.on("error", (err) => {
    spawnError = err;
  });

  child.unref();
  // The child holds its own copies of the fds — close the parent's to avoid
  // leaking two descriptors per start for the life of the CLI process
  try {
    fs.closeSync(outFd);
  } catch (_) {}
  try {
    fs.closeSync(errFd);
  } catch (_) {}

  // Wait briefly to see if it crashes immediately
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (spawnError || child.pid === undefined) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "process_crashed",
          message: `Failed to start tizen-dlog-analyzer: ${spawnError ? spawnError.message : "no PID assigned"}`,
        },
      ],
    };
  }
  fs.writeFileSync(PID_FILE, String(child.pid));

  if (!isProcessRunning(child.pid)) {
    const output = fs.existsSync(OUTPUT_FILE)
      ? fs.readFileSync(OUTPUT_FILE, "utf-8")
      : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "process_crashed",
          message: `tizen-dlog-analyzer exited immediately. Output:\n${output}`,
        },
      ],
    };
  }

  return {
    command,
    status: "success",
    result: {
      pid: child.pid,
      subcommand: subcommand,
      device_serial: device.serial,
      output_file: OUTPUT_FILE,
      output_dir: outDir,
      message: `tizen-dlog-analyzer (${subcommand}) started in background (PID ${child.pid}). Output is being written to ${OUTPUT_FILE}. Ask the user to interact with the app. When they report an issue, run 'check' to retrieve the analyzed output.`,
    },
  };
}

/**
 * Stop the background dlog monitoring process.
 * @param {string} [commandLabel] - Envelope command label
 */
async function stopDlogAnalyzer(commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer stop";
  const pid = getRunningPid();
  if (!pid) {
    // Clean up stale PID file
    try {
      fs.unlinkSync(PID_FILE);
    } catch {}

    return {
      command,
      status: "success",
      result: {
        was_running: false,
        message: "No running tizen-dlog-analyzer process found.",
      },
    };
  }

  try {
    process.kill(pid, "SIGTERM");
    // Wait briefly for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (isProcessRunning(pid)) {
      process.kill(pid, "SIGKILL");
    }
  } catch (_e) {
    // Process may have already exited
  }

  try {
    fs.unlinkSync(PID_FILE);
  } catch {}

  return {
    command,
    status: "success",
    result: {
      was_running: true,
      pid: pid,
      message: `tizen-dlog-analyzer (PID ${pid}) stopped.`,
    },
  };
}

/**
 * Check (read) the latest analyzed output from the temp file.
 * @param {string} [commandLabel] - Envelope command label
 */
async function checkDlogAnalyzer(commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer check";
  if (!fs.existsSync(OUTPUT_FILE)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "no_output",
          message:
            "No output file found. Start monitoring first with: node dlog-analyzer-cli.js start <subcommand>",
        },
      ],
    };
  }

  const output = fs.readFileSync(OUTPUT_FILE, "utf-8");
  const pid = getRunningPid();
  const isRunning = pid !== null;

  return {
    command,
    status: "success",
    result: {
      is_running: isRunning,
      pid: pid,
      output_file: OUTPUT_FILE,
      output: output,
      message: isRunning
        ? "tizen-dlog-analyzer is still running. The output below is the latest analyzed data."
        : "tizen-dlog-analyzer is not running. The output below is from the last session.",
    },
  };
}

/**
 * Check if the background process is still running.
 * @param {string} [commandLabel] - Envelope command label
 */
async function statusDlogAnalyzer(commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer status";
  const pid = getRunningPid();

  return {
    command,
    status: "success",
    result: {
      is_running: pid !== null,
      pid: pid,
      output_file: fs.existsSync(OUTPUT_FILE) ? OUTPUT_FILE : null,
    },
  };
}

// ---------------------------------------------------------------------------
// App-specific commands: app-launch, app-terminate, dlog-collect --app-id,
// error-analyze
//
// All four delegate to the native tizen-dlog-analyzer binary, which has
// built-in support for these subcommands. The JS layer handles parameter
// validation, device resolution, and envelope formatting.
// ---------------------------------------------------------------------------

/**
 * The native binary creates `app/<app-id>/` under the --base-dir we pass.
 * So we pass STATE_DIR as --base-dir, and the log ends up at:
 *   <STATE_DIR>/app/<app-id>/<app-id>.hot.log
 */
function appLogDir(appId) {
  return path.join(STATE_DIR, "app", appId);
}

function appLogFile(appId) {
  return path.join(appLogDir(appId), `${appId}.hot.log`);
}

/**
 * Get the PID of a running app on the device by app_id.
 *
 * Tizen apps do not always run as a process named after the app_id:
 *   - Web apps run inside WRT / WebProcess / chromium
 *   - Native apps run as their binary name
 * The app_id appears in the process command-line arguments, so we try
 * multiple strategies in order of reliability:
 *
 *   1. pgrep -f <app_id>          (fast, but pgrep may not exist on all profiles)
 *   2. ps (no flags) + JS filter  (portable — runs `ps` on device, filters in JS)
 *   3. pidof <app_id>             (last resort — only works if process name == app_id)
 *
 * Key insight: sdb shell does NOT reliably support piped commands with quotes
 * (e.g. `sdb shell "ps -ef | grep ... | grep -v grep"` fails silently on many
 * Tizen profiles). So Strategy 2 runs a bare `ps` and filters the output in
 * JavaScript on the host side, avoiding all sdb shell quoting/pipe issues.
 *
 * @param {string} sdbPath - Path to sdb binary
 * @param {string} serial - Device serial
 * @param {string} appId - Tizen app ID (e.g. org.example.myapp)
 * @returns {number|null} PID or null if not found
 */
function getAppPid(sdbPath, serial, appId) {
  // appId is interpolated into sdb shell command strings below. Every caller
  // validates it with isValidAppId() first, so it cannot carry shell syntax.

  // Strategy 1: pgrep -f (searches full command line)
  try {
    const output = runSdb(sdbPath, `-s ${serial} shell pgrep -f ${appId}`, {
      timeout: 10000,
    });
    const pid = parseFirstPid(output);
    if (pid) return pid;
  } catch {
    // pgrep not available or no match — fall through to next strategy
  }

  // Strategy 2: ps + JS-side filter (portable — no sdb shell pipes needed)
  //
  // Run a bare `ps` on the device (no flags, no pipes) and filter the output
  // on the host side, avoiding sdb shell quoting/pipe issues. See
  // extractPidFromPsOutput for the layout handling and whole-token matching.
  for (const psCmd of ["ps -e", "ps"]) {
    try {
      const output = runSdb(sdbPath, `-s ${serial} shell ${psCmd}`, {
        timeout: 10000,
      });
      const pid = extractPidFromPsOutput(output, appId);
      if (pid) return pid;
    } catch {
      // ps variant not available — try next variant
    }
  }

  // Strategy 3: pidof (only works if process name == app_id, rare for web apps)
  try {
    const output = runSdb(sdbPath, `-s ${serial} shell pidof ${appId}`, {
      timeout: 10000,
    });
    const pid = parseFirstPid(output);
    if (pid) return pid;
  } catch {
    // All strategies exhausted
  }

  return null;
}

/**
 * Launch a Tizen app on the connected device.
 * Delegates to: tizen-dlog-analyzer app-launch <app-id> --serial <serial>
 *
 * @param {string} appId - Tizen app ID (e.g. org.example.myapp)
 * @param {string} [serial] - Optional device serial
 * @param {string} [commandLabel] - Envelope command label
 */
async function launchApp(appId, serial, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer app-launch";

  if (!appId) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: "app_id is required. Usage: app-launch <app-id>",
        },
      ],
    };
  }
  if (!isValidAppId(appId)) return invalidAppIdError(command, appId);

  const binaryPath = resolveBinary();
  if (!binaryPath) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "binary_not_found",
          message:
            "tizen-dlog-analyzer binary not found for this platform. Ensure the setup script has been run.",
        },
      ],
    };
  }

  const device = resolveDevice(serial);
  if (device.error) {
    return {
      command,
      status: "failure",
      errors: [{ category: "device_not_found", message: device.error }],
    };
  }

  try {
    const output = execFileSync(
      binaryPath,
      ["app-launch", appId, "--serial", device.serial],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
        env: {
          ...process.env,
          SDB_SERIAL: device.serial,
          SDB_PATH: device.sdbPath,
        },
      },
    );

    // Wait for the app to fully start — there may be a short delay before the
    // process is up and its PID is resolvable via pgrep.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    let pid = getAppPid(device.sdbPath, device.serial, appId);

    // Retry once after a short additional delay if PID not found yet
    if (!pid) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      pid = getAppPid(device.sdbPath, device.serial, appId);
    }

    return {
      command,
      status: "success",
      result: {
        app_id: appId,
        device_serial: device.serial,
        pid: pid,
        launch_output: output.trim(),
        message: pid
          ? `App "${appId}" launched on device ${device.serial} (PID ${pid}). You can now collect app-specific logs with dlog-collect --app-id ${appId}.`
          : `App "${appId}" launched on device ${device.serial}. Could not determine PID — the app may still be starting. Use dlog-collect --app-id ${appId} after the app is fully running.`,
      },
    };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "app_launch_failed",
          message: `Failed to launch app "${appId}": ${stderr || error.message}`,
        },
      ],
    };
  }
}

/**
 * Terminate a running Tizen app on the connected device.
 * Delegates to: tizen-dlog-analyzer app-terminate <app-id> --serial <serial>
 *
 * @param {string} appId - Tizen app ID (e.g. org.example.myapp)
 * @param {string} [serial] - Optional device serial
 * @param {string} [commandLabel] - Envelope command label
 */
async function terminateApp(appId, serial, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer app-terminate";

  if (!appId) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: "app_id is required. Usage: app-terminate <app-id>",
        },
      ],
    };
  }
  if (!isValidAppId(appId)) return invalidAppIdError(command, appId);

  const binaryPath = resolveBinary();
  if (!binaryPath) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "binary_not_found",
          message:
            "tizen-dlog-analyzer binary not found for this platform. Ensure the setup script has been run.",
        },
      ],
    };
  }

  const device = resolveDevice(serial);
  if (device.error) {
    return {
      command,
      status: "failure",
      errors: [{ category: "device_not_found", message: device.error }],
    };
  }

  try {
    const output = execFileSync(
      binaryPath,
      ["app-terminate", appId, "--serial", device.serial],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000,
        env: {
          ...process.env,
          SDB_SERIAL: device.serial,
          SDB_PATH: device.sdbPath,
        },
      },
    );

    return {
      command,
      status: "success",
      result: {
        app_id: appId,
        device_serial: device.serial,
        kill_output: output.trim(),
        message: `App "${appId}" terminated on device ${device.serial}.`,
      },
    };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "app_terminate_failed",
          message: `Failed to terminate app "${appId}": ${stderr || error.message}`,
        },
      ],
    };
  }
}

// --- App-specific background collection state files ---
const APP_COLLECT_PID_FILE = path.join(STATE_DIR, "app-collect.pid");
const APP_COLLECT_OUTPUT_FILE = path.join(STATE_DIR, "app-collect-output.log");

/**
 * Read the current app-collect background process PID (if any).
 */
function getCollectPid() {
  if (!fs.existsSync(APP_COLLECT_PID_FILE)) return null;
  try {
    const pid = parseInt(
      fs.readFileSync(APP_COLLECT_PID_FILE, "utf-8").trim(),
      10,
    );
    return isProcessRunning(pid) ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Start app-specific dlog collection as a background process.
 *
 * The native binary runs continuously until stopped. This function spawns it
 * as a detached background process and returns immediately. The agent should
 * then ask the user to browse the app / reproduce the issue, and when the
 * user reports back, call stopCollectAppLogs to stop collection and then
 * analyzeErrors to analyze the collected logs.
 *
 * The app must be running. Logs are saved to <STATE_DIR>/app/<app-id>/<app-id>.hot.log
 *
 * Key: we pass --base-dir STATE_DIR (not appLogDir) because the native binary
 * creates `app/<app-id>/` under whatever --base-dir is given.
 *
 * @param {string} appId - Tizen app ID (e.g. org.example.myapp)
 * @param {string} [serial] - Optional device serial
 * @param {string} [commandLabel] - Envelope command label
 */
async function collectAppLogs(appId, serial, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer dlog-collect";
  ensureStateDir();

  if (!appId) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: "app_id is required. Usage: dlog-collect --app-id <app-id>",
        },
      ],
    };
  }
  if (!isValidAppId(appId)) return invalidAppIdError(command, appId);

  // Check if app-collect is already running
  const existingPid = getCollectPid();
  if (existingPid) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "already_running",
          message: `App dlog collection is already running (PID ${existingPid}). Stop it first with: stop-collect`,
        },
      ],
    };
  }

  const device = resolveDevice(serial);
  if (device.error) {
    return {
      command,
      status: "failure",
      errors: [{ category: "device_not_found", message: device.error }],
    };
  }

  // Best-effort PID lookup for informational purposes.
  //
  // The native tizen-dlog-analyzer binary has its own PID resolution logic
  // (it reads /proc, dlog buffers, etc.) and is more reliable than any sdb
  // shell command. So we do NOT block on the JS-side PID check — if we can't
  // find the PID here, we still proceed and let the native binary handle it.
  // If the app truly isn't running, the native binary will fail and we'll
  // catch that via the process_crashed check below.
  let pid = getAppPid(device.sdbPath, device.serial, appId);
  if (!pid) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    pid = getAppPid(device.sdbPath, device.serial, appId);
  }
  // pid may be null — that's OK, the native binary will resolve it

  // Resolve the native binary
  const binaryPath = resolveBinary();
  if (!binaryPath) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "binary_not_found",
          message:
            "tizen-dlog-analyzer binary not found for this platform. Ensure the setup script has been run.",
        },
      ],
    };
  }

  // Open output file for writing (truncate)
  const outFd = fs.openSync(APP_COLLECT_OUTPUT_FILE, "w");
  const errFd = fs.openSync(APP_COLLECT_OUTPUT_FILE, "a");

  // Spawn the native binary as a detached background process:
  //   tizen-dlog-analyzer dlog-collect --app-id <appId> --serial <serial> --base-dir <STATE_DIR> --fresh
  //
  // The native binary creates app/<app-id>/ under --base-dir, so passing
  // STATE_DIR results in logs at: <STATE_DIR>/app/<app-id>/<app-id>.hot.log
  const child = spawn(
    binaryPath,
    [
      "dlog-collect",
      "--app-id",
      appId,
      "--serial",
      device.serial,
      "--base-dir",
      STATE_DIR,
      "--fresh",
    ],
    {
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: {
        ...process.env,
        SDB_SERIAL: device.serial,
        SDB_PATH: device.sdbPath,
      },
    },
  );

  let spawnError = null;
  child.on("error", (err) => {
    spawnError = err;
  });

  child.unref();
  try {
    fs.closeSync(outFd);
  } catch (_) {}
  try {
    fs.closeSync(errFd);
  } catch (_) {}

  // Wait briefly to see if it crashes immediately
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (spawnError || child.pid === undefined) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "process_crashed",
          message: `Failed to start dlog-collect: ${spawnError ? spawnError.message : "no PID assigned"}`,
        },
      ],
    };
  }
  fs.writeFileSync(APP_COLLECT_PID_FILE, String(child.pid));

  if (!isProcessRunning(child.pid)) {
    const output = fs.existsSync(APP_COLLECT_OUTPUT_FILE)
      ? fs.readFileSync(APP_COLLECT_OUTPUT_FILE, "utf-8")
      : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "process_crashed",
          message: `dlog-collect exited immediately. Output:\n${output}`,
        },
      ],
    };
  }

  return {
    command,
    status: "success",
    result: {
      pid: child.pid,
      app_id: appId,
      app_pid: pid,
      device_serial: device.serial,
      log_file: appLogFile(appId),
      output_file: APP_COLLECT_OUTPUT_FILE,
      message: `dlog-collect for app "${appId}"${pid ? ` (PID ${pid})` : " (app PID not resolved yet — the native binary resolves it)"} started in background (collect PID ${child.pid}). Logs are being written to ${appLogFile(appId)}. Ask the user to browse the app and reproduce the issue. When they report back, run stop-collect to stop collection, then error-analyze --app-id ${appId} to analyze the logs.`,
    },
  };
}

/**
 * Stop the background app-specific dlog collection process.
 * @param {string} [commandLabel] - Envelope command label
 */
async function stopCollectAppLogs(commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer stop-collect";
  const pid = getCollectPid();
  if (!pid) {
    try {
      fs.unlinkSync(APP_COLLECT_PID_FILE);
    } catch {}
    return {
      command,
      status: "success",
      result: {
        was_running: false,
        message: "No running app dlog collection process found.",
      },
    };
  }

  try {
    process.kill(pid, "SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (isProcessRunning(pid)) {
      process.kill(pid, "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (isProcessRunning(pid)) {
      process.kill(pid, "SIGKILL");
    }
  } catch (_e) {
    // Process may have already exited
  }

  try {
    fs.unlinkSync(APP_COLLECT_PID_FILE);
  } catch {}

  return {
    command,
    status: "success",
    result: {
      was_running: true,
      pid: pid,
      message: `App dlog collection (PID ${pid}) stopped. Logs have been saved. Run error-analyze --app-id <app-id> to analyze the collected logs.`,
    },
  };
}

/**
 * Analyze collected app logs for non-fatal runtime errors (E/F priority).
 * Delegates to: tizen-dlog-analyzer error-analyze --app-id <app-id> --base-dir <STATE_DIR> [--format <format>]
 *
 * The native binary reads from <STATE_DIR>/app/<app-id>/<app-id>.hot.log
 * and handles deduplication, summary lines, and detail entries output.
 *
 * @param {string} appId - Tizen app ID (e.g. org.example.myapp)
 * @param {string} [format] - Output format: "summary", "details", or null (both)
 * @param {string} [commandLabel] - Envelope command label
 */
async function analyzeErrors(appId, format, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer error-analyze";

  if (!appId) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message:
            "app_id is required. Usage: error-analyze --app-id <app-id> [--format summary|details]",
        },
      ],
    };
  }
  if (!isValidAppId(appId)) return invalidAppIdError(command, appId);

  const validFormats = ["summary", "details", null, undefined, ""];
  if (!validFormats.includes(format)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: `Invalid format: '${format}'. Must be 'summary', 'details', or omit for both.`,
        },
      ],
    };
  }

  const logFile = appLogFile(appId);
  if (!fs.existsSync(logFile)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "no_logs",
          message: `No collected logs found for app "${appId}". Run dlog-collect --app-id ${appId} first.`,
        },
      ],
    };
  }

  const binaryPath = resolveBinary();
  if (!binaryPath) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "binary_not_found",
          message:
            "tizen-dlog-analyzer binary not found for this platform. Ensure the setup script has been run.",
        },
      ],
    };
  }

  // Build the native binary command
  // The native binary's --format accepts: summary, details, both (default)
  const nativeFormat = format || "both";
  const args = [
    "error-analyze",
    "--app-id",
    appId,
    "--base-dir",
    STATE_DIR,
    "--format",
    nativeFormat,
  ];

  try {
    const output = execFileSync(binaryPath, args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });

    // The native binary writes the analysis (summary lines and/or detail entries,
    // per --format) to stdout. Only the unique-error count is parsed out.
    const trimmedOutput = output.trim();
    const errorCount = parseErrorCount(trimmedOutput);

    return {
      command,
      status: "success",
      result: {
        app_id: appId,
        format: nativeFormat,
        error_count: errorCount,
        output: trimmedOutput,
        message:
          errorCount > 0
            ? `Found ${errorCount} unique runtime errors in logs for app "${appId}".`
            : `No runtime errors (E/F priority) found in logs for app "${appId}".`,
      },
    };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "error_analyze_failed",
          message: `Failed to analyze logs for app "${appId}": ${stderr || error.message}`,
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// One-shot device-log actions (plain sdb, no native binary)
// ---------------------------------------------------------------------------

const DUMP_FILE = path.join(STATE_DIR, "dlog-dump.log");
const DEFAULT_DUMP_LINES = 200;

/**
 * Dump the device's current dlog buffer once (`sdb dlog -d -v threadtime`)
 * and return its tail. The complete dump is always written to a file so a
 * "save/export the logs" request is served by the same call.
 *
 * `-d` matters: without it dlog streams forever and runSdb's timeout would
 * kill it, so the action could never succeed (same reasoning as the former
 * sdb-helper log-stream intent this replaces).
 *
 * @param {string} [serial] - Optional device serial
 * @param {object} [opts]
 * @param {string|string[]} [opts.filter] - dlog filterspecs, e.g. "*:E" or "E20:W CHROMIUM"
 * @param {number|string} [opts.lines] - Tail length returned in the envelope (default 200, 0 = all)
 * @param {string} [opts.output] - Host file for the full dump (default $TMPDIR/tizen-dlog-analyzer/dlog-dump.log)
 * @param {string} [commandLabel] - Envelope command label
 */
async function dumpDeviceLogs(serial, opts = {}, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer log-dump";
  const options = opts || {};

  let limit = DEFAULT_DUMP_LINES;
  if (options.lines !== undefined && options.lines !== null) {
    limit = Number.parseInt(String(options.lines), 10);
    if (!Number.isInteger(limit) || limit < 0) {
      return {
        command,
        status: "failure",
        errors: [
          {
            category: "invalid_parameters",
            message: `--lines must be a non-negative integer (0 = unlimited), got ${JSON.stringify(options.lines)}.`,
          },
        ],
      };
    }
  }

  const parsed = parseFilterSpecs(options.filter);
  if (parsed.error) {
    return {
      command,
      status: "failure",
      errors: [{ category: "invalid_parameters", message: parsed.error }],
    };
  }

  const device = resolveDevice(serial);
  if (device.error) {
    return {
      command,
      status: "failure",
      errors: [{ category: "device_not_found", message: device.error }],
    };
  }

  // Each filterspec is quoted so a shell never globs `*:E`.
  const specArgs = parsed.specs.map((s) => `"${s}"`).join(" ");
  const sdbArgs =
    `-s "${device.serial}" dlog -d -v threadtime` +
    (specArgs ? ` ${specArgs}` : "");

  let output;
  try {
    output = sanitizeDlogOutput(
      runSdb(device.sdbPath, sdbArgs, { timeout: 60000 }),
    );
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "log_dump_failed",
          message: `Failed to dump the dlog buffer on device ${device.serial}: ${stderr || error.message}`,
        },
      ],
    };
  }

  const dumpFile = options.output
    ? path.resolve(String(options.output))
    : DUMP_FILE;
  try {
    fs.mkdirSync(path.dirname(dumpFile), { recursive: true });
    fs.writeFileSync(dumpFile, output);
  } catch (error) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "io_error",
          message: `Dumped the dlog buffer but could not write it to ${dumpFile}: ${error.message}`,
        },
      ],
    };
  }

  const tail = tailLines(output, limit);
  return {
    command,
    status: "success",
    result: {
      device_serial: device.serial,
      sdb_command: `sdb ${sdbArgs}`,
      filter: parsed.specs,
      dump_file: dumpFile,
      total_lines: tail.total_lines,
      returned_lines: tail.returned_lines,
      truncated: tail.truncated,
      output: tail.text,
      message: tail.truncated
        ? `Dumped ${tail.total_lines} dlog lines from device ${device.serial}; showing the last ${tail.returned_lines}. Full dump: ${dumpFile}`
        : `Dumped ${tail.total_lines} dlog lines from device ${device.serial}. Full dump: ${dumpFile}`,
    },
  };
}

/**
 * Clear the device's dlog buffer (`sdb dlog -c`).
 * Destructive: refuses without an explicit confirm (user_input_required),
 * and the gate runs before device resolution so it is testable offline.
 *
 * @param {string} [serial] - Optional device serial
 * @param {boolean|string} confirm - Must be true / "true" to execute
 * @param {string} [commandLabel] - Envelope command label
 */
async function clearDeviceLogs(serial, confirm, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer log-clear";

  const gate = buildLogClearGate(command, serial, confirm);
  if (gate) return gate;

  const device = resolveDevice(serial);
  if (device.error) {
    return {
      command,
      status: "failure",
      errors: [{ category: "device_not_found", message: device.error }],
    };
  }

  const sdbArgs = `-s "${device.serial}" dlog -c`;
  try {
    const output = runSdb(device.sdbPath, sdbArgs, { timeout: 15000 });
    const warnings = [];
    if (getRunningPid()) {
      warnings.push(
        "A system-wide dlog-analyzer session is running; lines it already collected are unaffected.",
      );
    }
    if (getCollectPid()) {
      warnings.push(
        "An app-specific dlog-collect session is running; lines it already collected are unaffected.",
      );
    }
    return {
      command,
      status: "success",
      result: {
        device_serial: device.serial,
        sdb_command: `sdb ${sdbArgs}`,
        output: output.trim(),
        message: `dlog buffer cleared on device ${device.serial}.`,
      },
      ...(warnings.length ? { warnings } : {}),
    };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "log_clear_failed",
          message: `Failed to clear the dlog buffer on device ${device.serial}: ${stderr || error.message}`,
        },
      ],
    };
  }
}

module.exports = {
  startDlogAnalyzer,
  stopDlogAnalyzer,
  checkDlogAnalyzer,
  statusDlogAnalyzer,
  launchApp,
  terminateApp,
  collectAppLogs,
  stopCollectAppLogs,
  analyzeErrors,
  dumpDeviceLogs,
  clearDeviceLogs,
  // Pure helpers (unit-tested without a device)
  isValidAppId,
  parseFirstPid,
  extractPidFromPsOutput,
  parseErrorCount,
  parseFilterSpecs,
  tailLines,
  sanitizeDlogOutput,
  buildLogClearGate,
};
