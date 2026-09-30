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
 *   appLog             — Print the full collected log for one app (all priorities, hot + cold files)
 *   deviceProfile      — Detect and print the connected device's profile (type, version, arch, root, tools)
 *   investigate        — Run a one-shot first-pass investigation and emit a budgeted report
 *   runProbe            — List and run evidence probes from the data-driven catalog
 *   manageSnapshot      — Create, list, and compare system snapshots
 *   runTimeline         — Analyze and visualize probe history across snapshots
 *   manageKernel        — Kernel log collection (background, like dlog-collect) / stop / analysis (kmsg/dmesg)
 *   dumpDeviceLogs     — One-shot dlog buffer dump via sdb (`dlog -d`), optional tag/priority filter
 *   clearDeviceLogs    — Clear the device dlog buffer via sdb (`dlog -c`), confirmation-gated
 *
 * The last two are plain sdb actions (no native binary involved). They live
 * here — not in sdb-helper — so that every device-log request has ONE owner:
 * sdb-helper hands its log intents off to this skill, and this runner covers
 * both the quick one-shot operations and the continuous collect/analyze flow.
 *
 * Where the logs live: the native binary has no `--base-dir` option (removed
 * in TizenDLogAnalyzer PR #155). It stores everything it collects under
 * `<sdk-data>/dloganalyzer/`, resolved from `~/.tizen.sdk.path.config`;
 * resolveLogBaseDir() below applies the same rule so this module reads the
 * app logs from the directory the binary actually wrote to. Only the
 * runner's own PID files and captured stdout stay in the OS temp dir.
 */

const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  resolveSdbBinary,
  resolveSerial,
  runSdb,
  describeSerialFailure,
} = require("./sdb");
const { CONFIG_FILE: SDK_CONFIG_FILE } = require("./sdk");
const { orderedCacheRoots } = require("./plugin-cache");

// --- State files (PID + captured stdout) are kept in the OS temp dir ---
//
// Only the runner's own bookkeeping lives here. The collected logs, snapshots
// and device profiles are written by the native binary under the SDK data
// directory — see resolveLogBaseDir() below.
const STATE_DIR = path.join(os.tmpdir(), "tizen-dlog-analyzer");
const PID_FILE = path.join(STATE_DIR, "analyzer.pid");
const OUTPUT_FILE = path.join(STATE_DIR, "analyzer-output.log");

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

// Lines of captured analysis `stop` returns inline (the file keeps all of it).
const STOP_OUTPUT_LINES = 200;

/**
 * Environment for the detached collectors. The native binary is a PyInstaller
 * (Python) build; with stdout redirected to a file Python block-buffers it, so
 * the live crash/exception analysis reached analyzer-output.log only when the
 * buffer filled — `check` showed nothing during the session and the tail was
 * lost on termination (issue #226). PYTHONUNBUFFERED makes every line land as
 * it is written.
 */
function collectorEnv(device) {
  return {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    SDB_SERIAL: device.serial,
    SDB_PATH: device.sdbPath,
  };
}

/**
 * One descriptor for a detached collector's stdout *and* stderr — the `2>&1`
 * shape. Opening the capture file twice ("w" for stdout, "a" for stderr) gave
 * the two streams independent file offsets: stdout kept writing at its own
 * position and overwrote whatever stderr had appended in between, so lines of
 * the captured analysis went missing. Truncates the file: a new session always
 * starts from an empty capture (this is the only place it is truncated).
 */
function openCollectorOutput(file) {
  return fs.openSync(file, "w");
}

/**
 * SIGINT first so a Python collector gets KeyboardInterrupt and flushes /
 * closes its files, then SIGTERM, then SIGKILL as a last resort.
 *
 * On Windows every one of these is TerminateProcess (no KeyboardInterrupt),
 * so there the capture relies on PYTHONUNBUFFERED alone — see collectorEnv().
 */
async function terminateGracefully(pid) {
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
}

/**
 * Tail of the analysis captured from a `start` session, for the `stop`
 * envelope. Pure apart from the file read; null when no session ever ran.
 */
function capturedOutputSummary(file, limit) {
  if (!fs.existsSync(file)) return null;
  let text;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  const tail = tailLines(sanitizeDlogOutput(text), limit);
  return {
    output: tail.text,
    total_lines: tail.total_lines,
    returned_lines: tail.returned_lines,
    truncated: tail.truncated,
  };
}

/**
 * Attached to every analysis result the agent renders from (check,
 * error-analyze, kernel analyze), so the shape of the final report travels
 * with the data instead of depending on a separate `cat REPORT_TEMPLATE.md`
 * the agent may skip (issue #224).
 */
const REPORT_FORMAT_HINT =
  "Final report = REPORT_TEMPLATE.md rendered twice: '## Analysis Report (English)' " +
  "with '### 0. Summary' (Date / Emulator/Device / App / Issue), '### 1. Root Cause', " +
  "'### 2. Additional Findings', '### 3. Solution Suggestions', '### 4. Workarounds'; " +
  "then a '---' line; then '## 분석 보고서 (한국어)' with the same sections " +
  "(0. 요약 / 1. 근본 원인 / 2. 추가 발견 사항 / 3. 해결 방안 제안 / 4. 임시 해결 방법). " +
  "Bullets only — no tables, no emoji headings, no improvised title.";

// ---------------------------------------------------------------------------
// Log base directory — resolved from the Tizen SDK configuration
// ---------------------------------------------------------------------------

/**
 * Name of the directory the native binary creates under the SDK data path.
 * Must match `_DLOG_ANALYZER_DIR_NAME` in TizenDLogAnalyzer's `sdk_paths.py`.
 */
const LOG_BASE_DIR_NAME = "dloganalyzer";

// Python's str.strip() / str.splitlines(), which is what sdk_paths.py applies
// to the config file and to sdk.info. They differ from JS trim()/split in
// two ways that matter here: Python does NOT strip U+FEFF (a BOM-prefixed
// config path is "<BOM>C:/..." to the binary and therefore "does not exist"),
// and it also splits lines on \v \f \x1c-\x1e \x85 U+2028 U+2029.
const PY_WS =
  "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP_RE = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "g");
const PY_LINE_BREAKS = "\\n\\r\\v\\f\\x1c\\x1d\\x1e\\x85\\u2028\\u2029";
const PY_SPLITLINES_RE = new RegExp(`\\r\\n|[${PY_LINE_BREAKS}]`);
const BOM = "\ufeff";
const SDK_DATA_PATH_KEY = "TIZEN_SDK_DATA_PATH=";

function stripLikePython(s) {
  return s.replace(PY_STRIP_RE, "");
}

function splitLinesLikePython(s) {
  return s.split(PY_SPLITLINES_RE);
}

/**
 * Resolve the directory the native tizen-dlog-analyzer binary stores its logs
 * in. Since TizenDLogAnalyzer PR #155/#157 the CLI has no `--base-dir` option:
 * every command derives ONE log base directory from the SDK configuration and
 * the runner has to read collected logs from the very same place.
 *
 * The order mirrors `resolve_log_base_dir()` in the binary's `sdk_paths.py`
 * exactly, so both sides always agree:
 *   1. `~/.tizen.sdk.path.config` (written by tizen-sdk-init) names the SDK
 *      install directory. Missing/empty file -> error. A path that no longer
 *      exists -> error (a stale config must not make us look for logs next to
 *      a directory that is gone).
 *   2. `TIZEN_SDK_DATA_PATH` in `<sdk>/sdk.info` names the SDK data directory:
 *      the first line whose value is non-empty after strip() wins, a line
 *      with an empty value is skipped (the scan continues), and when no line
 *      qualifies — or sdk.info is missing/unreadable — the `<sdk>-data`
 *      sibling convention applies.
 *   3. The log base directory is `<sdk-data>/dloganalyzer/`.
 *
 * "Exactly" includes the string handling: the binary uses Python's strip()
 * and splitlines(), so this module uses stripLikePython()/splitLinesLikePython()
 * rather than trim()/split — JS trim() would swallow a UTF-8 BOM that the
 * binary keeps as the first character of the path (and then fails on), and
 * would miss the extra line separators Python honours.
 *
 * Deliberately NOT sdb.js's resolveSdkDataPath(): that one falls back to the
 * sdb on PATH when the configured directory is not an SDK, which the binary
 * never does — the two would disagree on exactly the machines where it hurts.
 *
 * The directory is not created here; the binary creates it on first use and
 * the read-only actions (error-analyze, app-log) only need to know the path.
 *
 * @param {{configFile?: string}} [opts] - test hook: alternate config file
 * @returns {{baseDir: string, sdkRoot: string, sdkDataPath: string, source: 'sdk.info'|'sibling'}|{error: string}}
 */
function resolveLogBaseDir(opts = {}) {
  const configFile = (opts && opts.configFile) || SDK_CONFIG_FILE;
  const initHint =
    "Run tizen-sdk-init (tizen-cli tizen-sdk sdk-init --sdk-path <path>) first.";

  // _read_sdk_install_path(): read_text().strip(); empty/unreadable -> None.
  let sdkRoot = "";
  try {
    if (fs.existsSync(configFile)) {
      sdkRoot = stripLikePython(fs.readFileSync(configFile, "utf-8"));
    }
  } catch (error) {
    return {
      error: `Could not read the Tizen SDK config ${configFile}: ${error.message}. ${initHint}`,
    };
  }
  if (!sdkRoot) {
    return {
      error: `Tizen SDK path is not configured (${configFile} is missing or empty). ${initHint}`,
    };
  }

  // Path(sdk_install_path).is_dir() — a BOM-prefixed path fails this check in
  // the binary exactly like a removed directory does; say why when it is
  // the BOM, because the path itself will look fine to the reader.
  let isDir = false;
  try {
    isDir = fs.statSync(sdkRoot).isDirectory();
  } catch (_error) {
    isDir = false;
  }
  if (!isDir) {
    const bomHint = sdkRoot.startsWith(BOM)
      ? ` The file starts with a UTF-8 byte-order mark, which the analyzer binary reads as part of the path. Rewrite it without the BOM (tizen-sdk sdk-init --sdk-path ${sdkRoot.slice(BOM.length)}).`
      : " Run tizen-sdk-init with the current SDK location.";
    return {
      error: `Tizen SDK path ${sdkRoot} (from ${configFile}) does not exist.${bomHint}`,
    };
  }

  // _read_sdk_data_path(): sdk.info is authoritative — the data path is not
  // required to be a sibling. The first TIZEN_SDK_DATA_PATH= line with a
  // non-empty value wins; a line with an empty value is skipped and the scan
  // goes on (no break), exactly as the binary's loop does.
  let sdkDataPath = null;
  let source = "sibling";
  try {
    const sdkInfoPath = path.join(sdkRoot, "sdk.info");
    if (fs.existsSync(sdkInfoPath)) {
      const info = fs.readFileSync(sdkInfoPath, "utf-8");
      for (const rawLine of splitLinesLikePython(info)) {
        const line = stripLikePython(rawLine);
        if (!line.startsWith(SDK_DATA_PATH_KEY)) continue;
        const value = stripLikePython(line.slice(SDK_DATA_PATH_KEY.length));
        if (value) {
          sdkDataPath = value;
          source = "sdk.info";
          break;
        }
      }
    }
  } catch (_error) {
    // unreadable sdk.info -> fall through to the sibling convention
  }
  if (!sdkDataPath) {
    sdkDataPath = path.join(
      path.dirname(sdkRoot),
      `${path.basename(sdkRoot)}-data`,
    );
  }

  return {
    baseDir: path.join(sdkDataPath, LOG_BASE_DIR_NAME),
    sdkRoot,
    sdkDataPath,
    source,
  };
}

/**
 * Failure envelope for an unresolvable log base directory. Same category the
 * other SDK-data consumers (certificate-manager, remote-device) report.
 */
function logBaseDirError(command, message) {
  return {
    command,
    status: "failure",
    errors: [{ category: "sdk_path_not_set", message }],
  };
}

function binaryNotFoundError(command) {
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

/**
 * Binary lookup for the actions whose binary command reads or writes the
 * SDK-resolved log directory (device-profile, investigate, probe, snapshot,
 * timeline, kernel — every one of them calls get_log_base_dir() in the
 * binary and exits 1 with SdkPathNotConfiguredError when the SDK is not
 * configured). Checking the SDK config here, before the binary is even
 * looked up, turns that into one sdk_path_not_set envelope regardless of
 * which binary build is installed.
 *
 * @returns {{binaryPath: string, logBase: object}|{error: object}}
 */
function resolveBinaryForLogs(command) {
  const logBase = resolveLogBaseDir();
  if (logBase.error) return { error: logBaseDirError(command, logBase.error) };
  const binaryPath = resolveBinary();
  if (!binaryPath) return { error: binaryNotFoundError(command) };
  return { binaryPath, logBase };
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
  if (target.errorCategory) {
    return {
      error: target.message,
      errorCategory: target.errorCategory,
      devices: target.devices,
    };
  }

  return { sdbPath: resolved.sdbPath, serial: target.serial };
}

/**
 * How dlog-analyzer takes an explicit serial, spelled for both harnesses (see
 * deviceErrorEnvelope()).
 */
const DLOG_SERIAL_OPTION =
  "the chosen serial (--serial <serial> in tizen-cli, the positional [serial] argument in the plugin runner)";

/**
 * Build a Standard JSON Envelope error block for a device-resolution failure.
 *
 * The binary (v0.2.0a0, PR #151) now lists connected devices and exits 1 when
 * multiple devices are connected and no --serial is given. This helper mirrors
 * that behaviour through the shared describeSerialFailure(): the category
 * resolveSerial() reported is kept (multiple_devices / device_not_found /
 * invalid_parameters / io_error), multiple_devices carries the ONLINE device
 * listing as `devices` plus a suggested_fix, and device_not_found never
 * carries a `devices` array, as the skill docs state. A missing sdb binary
 * (no category) maps to device_not_found.
 *
 * The serial option is spelled for both harnesses: tizen-cli takes
 * `--serial`, the plugin runner (dlog-analyzer-cli.js) takes the serial as a
 * positional argument and rejects `--serial` with "Unknown option".
 *
 * @param {string} command - Envelope command label
 * @param {{error: string, errorCategory?: string, devices?: Array}} device -
 *   The failed resolveDevice() result.
 * @returns {{command: string, status: string, errors: Array}}
 */
function deviceErrorEnvelope(command, device) {
  if (!device.errorCategory) {
    return {
      command,
      status: "failure",
      errors: [{ category: "device_not_found", message: device.error }],
    };
  }
  const failure = describeSerialFailure(
    {
      errorCategory: device.errorCategory,
      message: device.error,
      devices: device.devices,
    },
    { serialOption: DLOG_SERIAL_OPTION },
  );
  const error = { category: failure.category, message: failure.message };
  if (failure.devices.length > 0) error.devices = failure.devices;
  if (failure.suggestedFix) {
    error.suggested_fix = {
      command: failure.suggestedFix,
      auto_fixable: false,
    };
  }
  return {
    command,
    status: "failure",
    errors: [error],
  };
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
 *
 * The collected logs go to the SDK-resolved log base directory (see
 * resolveLogBaseDir()); the binary no longer accepts a custom output
 * directory, so a non-empty `outputDir` is rejected instead of being
 * silently ignored.
 *
 * @param {string} subcommand - dlog-collect | exception-detect | start-monitoring
 * @param {string} [serial] - Optional device serial
 * @param {string} [outputDir] - Legacy parameter; must be empty
 * @param {string} [commandLabel] - Envelope command label
 */
async function startDlogAnalyzer(subcommand, serial, outputDir, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer start";
  ensureStateDir();

  if (outputDir) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message:
            `A custom output directory (${outputDir}) is no longer supported: tizen-dlog-analyzer ` +
            "stores every log under <sdk-data>/dloganalyzer/, resolved from ~/.tizen.sdk.path.config. " +
            "Re-run without the output directory.",
        },
      ],
    };
  }

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

  // Resolve the log directory before touching the binary or a device: a
  // missing/stale SDK config is the cheapest and most actionable failure,
  // and reporting it here (one envelope error) beats a binary that exits 1
  // two seconds later with the message buried in the captured output.
  const logBase = resolveLogBaseDir();
  if (logBase.error) return logBaseDirError(command, logBase.error);

  // Resolve binary
  const binaryPath = resolveBinary();
  if (!binaryPath) return binaryNotFoundError(command);

  // Resolve device
  const device = resolveDevice(serial);
  if (device.error) return deviceErrorEnvelope(command, device);

  // Open the capture file (truncated; shared by stdout and stderr)
  const outFd = openCollectorOutput(OUTPUT_FILE);

  // Spawn the binary as a detached background process. No --base-dir: the
  // binary resolves <sdk-data>/dloganalyzer/ itself (same rule as logBase).
  const child = spawn(binaryPath, [subcommand, "--serial", device.serial], {
    detached: true,
    stdio: ["ignore", outFd, outFd],
    env: collectorEnv(device),
  });

  // Without an 'error' listener, a failed spawn (ENOENT/EACCES, e.g. missing
  // exec bit) raises an uncaught exception during the wait below
  let spawnError = null;
  child.on("error", (err) => {
    spawnError = err;
  });

  child.unref();
  // The child holds its own copy of the fd — close the parent's to avoid
  // leaking a descriptor per start for the life of the CLI process
  try {
    fs.closeSync(outFd);
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
    // A dead PID must not stay on disk: once the OS reuses the number,
    // getRunningPid() would report an unrelated process as the monitor and
    // `stop` would signal it (same cleanup as startKernelCollect).
    try {
      fs.unlinkSync(PID_FILE);
    } catch {}
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
      log_base_dir: logBase.baseDir,
      message: `tizen-dlog-analyzer (${subcommand}) started in background (PID ${child.pid}). Output is being written to ${OUTPUT_FILE}; collected logs go to ${logBase.baseDir}. Ask the user to interact with the app. When they report an issue, run 'check' to retrieve the analyzed output.`,
    },
  };
}

/**
 * Stop the background dlog monitoring process.
 *
 * The envelope carries the tail of the analysis the session captured: the
 * output file survives `stop` (only the next `start` truncates it), and
 * returning it here means the live findings are not lost when the agent stops
 * the monitor without running `check` first (issue #226).
 *
 * @param {string} [commandLabel] - Envelope command label
 */
async function stopDlogAnalyzer(commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer stop";
  const pid = getRunningPid();
  const captured = () => {
    const summary = capturedOutputSummary(OUTPUT_FILE, STOP_OUTPUT_LINES);
    if (!summary) return { output_file: null, output: null };
    return {
      output_file: OUTPUT_FILE,
      ...summary,
      next_step:
        "Run 'check' for the complete analyzed output of this session (it stays in output_file until the next 'start').",
    };
  };

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
        ...captured(),
        message: "No running tizen-dlog-analyzer process found.",
      },
    };
  }

  await terminateGracefully(pid);

  try {
    fs.unlinkSync(PID_FILE);
  } catch {}

  const summary = captured();
  return {
    command,
    status: "success",
    result: {
      was_running: true,
      pid: pid,
      ...summary,
      message:
        `tizen-dlog-analyzer (PID ${pid}) stopped.` +
        // An existing but empty capture (the collector printed nothing before
        // it was stopped) must not advertise "last 0 of 0 lines".
        (summary.output
          ? ` The analysis captured during the session is in result.output (last ${summary.returned_lines} of ${summary.total_lines} lines); run 'check' for all of it.`
          : ""),
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
      report_format: REPORT_FORMAT_HINT,
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
 * The native binary creates `app/<app-id>/` under the SDK-resolved log base
 * directory, so an app's hot log lives at:
 *   <sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log
 *
 * @param {string} appId
 * @param {string} baseDir - `baseDir` from resolveLogBaseDir()
 */
function appLogDir(appId, baseDir) {
  return path.join(baseDir, "app", appId);
}

function appLogFile(appId, baseDir) {
  return path.join(appLogDir(appId, baseDir), `${appId}.hot.log`);
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
  if (!binaryPath) return binaryNotFoundError(command);

  const device = resolveDevice(serial);
  if (device.error) return deviceErrorEnvelope(command, device);

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
  if (!binaryPath) return binaryNotFoundError(command);

  const device = resolveDevice(serial);
  if (device.error) return deviceErrorEnvelope(command, device);

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
 * The app must be running. Logs are saved to
 * <sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log — the binary
 * resolves that directory from the SDK configuration on its own (no
 * --base-dir), and resolveLogBaseDir() mirrors the rule so error-analyze /
 * app-log read from the same place.
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

  // Where the binary will write — resolved before the device/binary lookups
  // so a broken SDK config fails first and by itself, and so the envelope
  // can name the log file.
  const logBase = resolveLogBaseDir();
  if (logBase.error) return logBaseDirError(command, logBase.error);
  const logFile = appLogFile(appId, logBase.baseDir);

  const device = resolveDevice(serial);
  if (device.error) return deviceErrorEnvelope(command, device);

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
  if (!binaryPath) return binaryNotFoundError(command);

  // Open the capture file (truncated; shared by stdout and stderr)
  const outFd = openCollectorOutput(APP_COLLECT_OUTPUT_FILE);

  // Spawn the native binary as a detached background process:
  //   tizen-dlog-analyzer dlog-collect --app-id <appId> --serial <serial> --fresh
  //
  // The binary creates app/<app-id>/ under <sdk-data>/dloganalyzer/, so the
  // logs end up at logFile above.
  const child = spawn(
    binaryPath,
    ["dlog-collect", "--app-id", appId, "--serial", device.serial, "--fresh"],
    {
      detached: true,
      stdio: ["ignore", outFd, outFd],
      env: collectorEnv(device),
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
    // Dead PID off disk before the OS can reuse the number (see
    // startDlogAnalyzer / startKernelCollect).
    try {
      fs.unlinkSync(APP_COLLECT_PID_FILE);
    } catch {}
    // The native binary runs one dlog collector at a time; while a system-wide
    // `start` session holds it, the app-scoped collector cannot start. Its
    // lines are in the system-wide capture already, so the answer is `check`,
    // not stopping the monitor in the middle of the reproduction window.
    const monitorPid = getRunningPid();
    const monitorHint = monitorPid
      ? `\nA system-wide 'start' session is running (PID ${monitorPid}). If the output above says another collector holds the lock, do not stop the monitor mid-reproduction: it already captures this app's lines — analyze with 'check' (and 'kernel analyze') instead of 'error-analyze', or run 'stop' first and then 'dlog-collect ${appId}' again.`
      : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "process_crashed",
          message: `dlog-collect exited immediately. Output:\n${output}${monitorHint}`,
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
      log_file: logFile,
      log_base_dir: logBase.baseDir,
      output_file: APP_COLLECT_OUTPUT_FILE,
      message: `dlog-collect for app "${appId}"${pid ? ` (PID ${pid})` : " (app PID not resolved yet — the native binary resolves it)"} started in background (collect PID ${child.pid}). Logs are being written to ${logFile}. Ask the user to browse the app and reproduce the issue. When they report back, run stop-collect to stop collection, then error-analyze --app-id ${appId} to analyze the logs.`,
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

  await terminateGracefully(pid);

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
 * Delegates to: tizen-dlog-analyzer error-analyze --app-id <app-id> [--format <format>]
 *
 * The native binary reads <sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log
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

  const logBase = resolveLogBaseDir();
  if (logBase.error) return logBaseDirError(command, logBase.error);
  const logFile = appLogFile(appId, logBase.baseDir);
  if (!fs.existsSync(logFile)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "no_logs",
          message: `No collected logs found for app "${appId}" (expected ${logFile}). Run dlog-collect --app-id ${appId} first.`,
        },
      ],
    };
  }

  const binaryPath = resolveBinary();
  if (!binaryPath) return binaryNotFoundError(command);

  // Build the native binary command (it resolves the log directory itself)
  // The native binary's --format accepts: summary, details, both (default)
  const nativeFormat = format || "both";
  const args = ["error-analyze", "--app-id", appId, "--format", nativeFormat];

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
        log_file: logFile,
        error_count: errorCount,
        output: trimmedOutput,
        report_format: REPORT_FORMAT_HINT,
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
  if (device.error) return deviceErrorEnvelope(command, device);

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
  if (device.error) return deviceErrorEnvelope(command, device);

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

// ---------------------------------------------------------------------------
// New v0.1.3 commands: app-log, device-profile, investigate, probe,
// snapshot, timeline, kernel
// ---------------------------------------------------------------------------

/**
 * Helper: run the native binary and return a success/failure envelope.
 */
function runBinary(command, binaryPath, args, opts = {}) {
  const {
    timeout = 30000,
    result: extraResult = {},
    errorCategory = "binary_exec_failed",
    errorPrefix = "Command failed",
  } = opts;
  try {
    const output = execFileSync(binaryPath, args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });
    return {
      command,
      status: "success",
      result: { output: output.trim(), ...extraResult },
    };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : "";
    return {
      command,
      status: "failure",
      errors: [
        {
          category: errorCategory,
          message: `${errorPrefix}: ${stderr || error.message}`,
        },
      ],
    };
  }
}

/**
 * Print the full collected log for one app (all priorities, hot + cold files).
 * @param {string} appId - Tizen app ID
 * @param {object} [opts] - { since, until, priority, tags, keywords, format, output, maxLines, maxChars }
 * @param {string} [commandLabel]
 */
async function appLog(appId, opts = {}, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer app-log";
  if (!appId) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: "app_id is required. Usage: app-log --app-id <app-id>",
        },
      ],
    };
  }
  if (!isValidAppId(appId)) return invalidAppIdError(command, appId);

  const logBase = resolveLogBaseDir();
  if (logBase.error) return logBaseDirError(command, logBase.error);
  const logFile = appLogFile(appId, logBase.baseDir);
  if (!fs.existsSync(logFile)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "no_logs",
          message: `No collected logs found for app "${appId}" (expected ${logFile}). Run dlog-collect --app-id ${appId} first.`,
        },
      ],
    };
  }

  const binaryPath = resolveBinary();
  if (!binaryPath) return binaryNotFoundError(command);

  // No --base-dir: the binary reads from the SDK-resolved directory itself
  const args = ["app-log", "--app-id", appId];
  if (opts.since) args.push("--since", opts.since);
  if (opts.until) args.push("--until", opts.until);
  if (opts.priority) args.push("--priority", opts.priority);
  if (opts.tags) {
    (Array.isArray(opts.tags) ? opts.tags : [opts.tags]).forEach((t) =>
      args.push("--tag", t),
    );
  }
  if (opts.keywords) {
    (Array.isArray(opts.keywords) ? opts.keywords : [opts.keywords]).forEach(
      (k) => args.push("--keyword", k),
    );
  }
  if (opts.format) args.push("--format", opts.format);
  if (opts.output) args.push("--output", opts.output);
  if (opts.maxLines != null) args.push("--max-lines", String(opts.maxLines));
  if (opts.maxChars != null) args.push("--max-chars", String(opts.maxChars));

  return runBinary(command, binaryPath, args, {
    result: {
      app_id: appId,
      log_file: logFile,
      message: `Full log for app "${appId}" (all priorities, hot + cold files).`,
    },
    errorCategory: "app_log_failed",
    errorPrefix: `Failed to print log for app "${appId}"`,
  });
}

/**
 * Detect and print the connected device's profile (type, version, arch, root, tools).
 * @param {string} [serial]
 * @param {object} [opts] - { refresh, maxAge, format }
 * @param {string} [commandLabel]
 */
async function deviceProfile(serial, opts = {}, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer device-profile";
  const resolved = resolveBinaryForLogs(command);
  if (resolved.error) return resolved.error;
  const { binaryPath } = resolved;
  const device = resolveDevice(serial);
  if (device.error) return deviceErrorEnvelope(command, device);
  const args = ["device-profile", "--serial", device.serial];
  if (opts.refresh) args.push("--refresh");
  if (opts.maxAge != null) args.push("--max-age", String(opts.maxAge));
  if (opts.format) args.push("--format", opts.format);
  return runBinary(command, binaryPath, args, {
    result: {
      device_serial: device.serial,
      message: `Device profile for ${device.serial}.`,
    },
    errorCategory: "device_profile_failed",
    errorPrefix: "Failed to detect device profile",
  });
}

/**
 * Run a one-shot first-pass investigation and emit a budgeted report.
 * @param {string} [appId] - Optional app ID for app-scoped investigation
 * @param {string} [serial]
 * @param {object} [opts] - { symptoms, profile, format, budget, budgetTokens, allowNetworkProbe }
 * @param {string} [commandLabel]
 */
async function investigate(appId, serial, opts = {}, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer investigate";
  if (appId && !isValidAppId(appId)) return invalidAppIdError(command, appId);
  const resolved = resolveBinaryForLogs(command);
  if (resolved.error) return resolved.error;
  const { binaryPath } = resolved;
  const device = resolveDevice(serial);
  if (device.error) return deviceErrorEnvelope(command, device);
  const args = ["investigate", "--serial", device.serial];
  if (appId) args.push("--app-id", appId);
  if (opts.symptoms) args.push("--symptoms", opts.symptoms);
  if (opts.profile) args.push("--profile", opts.profile);
  if (opts.format) args.push("--format", opts.format);
  if (opts.budget != null) args.push("--budget", String(opts.budget));
  if (opts.budgetTokens != null)
    args.push("--budget-tokens", String(opts.budgetTokens));
  if (opts.allowNetworkProbe) args.push("--allow-network-probe");
  return runBinary(command, binaryPath, args, {
    timeout: 60000,
    result: {
      device_serial: device.serial,
      message: `Investigation report for device ${device.serial}.`,
    },
    errorCategory: "investigate_failed",
    errorPrefix: "Investigation failed",
  });
}

/**
 * List and run evidence probes from the data-driven catalog.
 * @param {string} subcommand - "list" or "run"
 * @param {string} [probeId] - Probe ID (required for "run")
 * @param {string} [serial]
 * @param {object} [opts] - { format }
 * @param {string} [commandLabel]
 */
async function runProbe(subcommand, probeId, serial, opts = {}, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer probe";
  const sub = subcommand || "list";
  const validSubs = ["list", "run"];
  if (!validSubs.includes(sub)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: `Invalid subcommand: '${sub}'. Must be one of: ${validSubs.join(", ")}`,
        },
      ],
    };
  }
  if (sub === "run" && !probeId) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message:
            "probe_id is required for 'probe run'. Usage: probe run <probe-id>",
        },
      ],
    };
  }
  const resolved = resolveBinaryForLogs(command);
  if (resolved.error) return resolved.error;
  const { binaryPath } = resolved;
  if (sub === "run") {
    const device = resolveDevice(serial);
    if (device.error) return deviceErrorEnvelope(command, device);
    const args = ["probe", "run", probeId, "--serial", device.serial];
    if (opts.format) args.push("--format", opts.format);
    return runBinary(command, binaryPath, args, {
      result: {
        probe_id: probeId,
        device_serial: device.serial,
        message: `Probe "${probeId}" executed on device ${device.serial}.`,
      },
      errorCategory: "probe_failed",
      errorPrefix: `Probe "${probeId}" failed`,
    });
  }
  const args = ["probe", "list"];
  if (opts.format) args.push("--format", opts.format);
  return runBinary(command, binaryPath, args, {
    timeout: 15000,
    result: { message: "Available evidence probes." },
    errorCategory: "probe_failed",
    errorPrefix: "Failed to list probes",
  });
}

/**
 * Create, list, compare, and delete system snapshots.
 * @param {string} subcommand - "create", "list", "compare", or "delete"
 * @param {string[]} [compareIds] - Two snapshot IDs for "compare"
 * @param {string} [snapshotId] - Snapshot ID for "delete"
 * @param {string} [serial]
 * @param {string} [commandLabel]
 */
async function manageSnapshot(subcommand, compareIds, serial, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer snapshot";
  const sub = subcommand || "list";
  const validSubs = ["create", "list", "compare", "delete"];
  if (!validSubs.includes(sub)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: `Invalid subcommand: '${sub}'. Must be one of: ${validSubs.join(", ")}`,
        },
      ],
    };
  }
  // Argument validation first — before the SDK-config / binary pre-check —
  // so a malformed request is invalid_parameters on every host.
  if (sub === "compare" && (!compareIds || compareIds.length < 2)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message:
            "Two snapshot IDs are required for 'snapshot compare'. Usage: snapshot compare <id1> <id2>",
        },
      ],
    };
  }
  if (sub === "delete" && (!compareIds || compareIds.length < 1)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message:
            "Snapshot ID is required for 'snapshot delete'. Usage: snapshot delete <id>",
        },
      ],
    };
  }
  const resolved = resolveBinaryForLogs(command);
  if (resolved.error) return resolved.error;
  const { binaryPath } = resolved;
  if (sub === "create") {
    const device = resolveDevice(serial);
    if (device.error) return deviceErrorEnvelope(command, device);
    return runBinary(
      command,
      binaryPath,
      ["snapshot", "create", "--serial", device.serial],
      {
        result: {
          device_serial: device.serial,
          message: `Snapshot created for device ${device.serial}.`,
        },
        errorCategory: "snapshot_failed",
        errorPrefix: "Failed to create snapshot",
      },
    );
  }
  if (sub === "compare") {
    return runBinary(
      command,
      binaryPath,
      ["snapshot", "compare", compareIds[0], compareIds[1]],
      {
        result: {
          snapshot_ids: [compareIds[0], compareIds[1]],
          message: `Comparison between snapshots ${compareIds[0]} and ${compareIds[1]}.`,
        },
        errorCategory: "snapshot_failed",
        errorPrefix: "Failed to compare snapshots",
      },
    );
  }
  if (sub === "delete") {
    return runBinary(
      command,
      binaryPath,
      ["snapshot", "delete", compareIds[0]],
      {
        result: {
          snapshot_id: compareIds[0],
          message: `Snapshot ${compareIds[0]} deleted.`,
        },
        errorCategory: "snapshot_failed",
        errorPrefix: "Failed to delete snapshot",
      },
    );
  }
  return runBinary(command, binaryPath, ["snapshot", "list"], {
    timeout: 15000,
    result: { message: "Available system snapshots." },
    errorCategory: "snapshot_failed",
    errorPrefix: "Failed to list snapshots",
  });
}

/**
 * Analyze and visualize probe history across snapshots.
 * @param {string} subcommand - "show", "report", "analyze", or "export"
 * @param {object} [opts] - { probeId, format, output }
 * @param {string} [commandLabel]
 */
async function runTimeline(subcommand, opts = {}, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer timeline";
  const sub = subcommand || "show";
  const validSubs = ["show", "report", "analyze", "export"];
  if (!validSubs.includes(sub)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: `Invalid subcommand: '${sub}'. Must be one of: ${validSubs.join(", ")}`,
        },
      ],
    };
  }
  const resolved = resolveBinaryForLogs(command);
  if (resolved.error) return resolved.error;
  const { binaryPath } = resolved;
  const args = ["timeline", sub];
  if (opts.probeId) args.push("--probe-id", opts.probeId);
  if (opts.format) args.push("--format", opts.format);
  if (opts.output) args.push("--output", opts.output);
  return runBinary(command, binaryPath, args, {
    result: { subcommand: sub, message: `Timeline ${sub} for probe history.` },
    errorCategory: "timeline_failed",
    errorPrefix: "Failed to generate timeline",
  });
}

// --- Kernel-log background collection state files ---
//
// `kernel collect` is a long-running subcommand of the native binary, exactly
// like `dlog-collect`: it streams the kmsg buffer (or polls dmesg) until it is
// stopped. Running it through runBinary()/execFileSync killed it at the 30 s
// timeout and reported `kernel_failed`, so the model learned to run
// `sdb shell dmesg` by hand instead (issue #213). It is therefore managed as a
// detached background process with its own PID file, mirroring
// collectAppLogs()/stopCollectAppLogs(); `kernel analyze` stays synchronous.
const KERNEL_COLLECT_PID_FILE = path.join(STATE_DIR, "kernel-collect.pid");
const KERNEL_COLLECT_OUTPUT_FILE = path.join(
  STATE_DIR,
  "kernel-collect-output.log",
);

/**
 * Read the current kernel-collect background process PID (if any).
 */
function getKernelCollectPid() {
  if (!fs.existsSync(KERNEL_COLLECT_PID_FILE)) return null;
  try {
    const pid = parseInt(
      fs.readFileSync(KERNEL_COLLECT_PID_FILE, "utf-8").trim(),
      10,
    );
    return isProcessRunning(pid) ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Start kernel-log collection as a detached background process.
 *
 * The binary writes to `<sdk-data>/dloganalyzer/app/kernel/kernel.hot.log`
 * (its own SDK-resolved base dir). The envelope names that file and tells the
 * agent to hand control back to the user for reproduction, then run
 * `kernel stop` + `kernel analyze`.
 */
async function startKernelCollect(command, serial) {
  ensureStateDir();

  const existingPid = getKernelCollectPid();
  if (existingPid) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "already_running",
          message: `Kernel log collection is already running (PID ${existingPid}). Stop it first with: kernel stop`,
        },
      ],
    };
  }

  const logBase = resolveLogBaseDir();
  if (logBase.error) return logBaseDirError(command, logBase.error);
  const logFile = path.join(logBase.baseDir, "app", "kernel", "kernel.hot.log");

  const binaryPath = resolveBinary();
  if (!binaryPath) return binaryNotFoundError(command);

  const device = resolveDevice(serial);
  if (device.error) return deviceErrorEnvelope(command, device);

  // Capture file (truncated; shared by stdout and stderr)
  const outFd = openCollectorOutput(KERNEL_COLLECT_OUTPUT_FILE);

  const child = spawn(
    binaryPath,
    ["kernel", "collect", "--serial", device.serial],
    {
      detached: true,
      stdio: ["ignore", outFd, outFd],
      env: collectorEnv(device),
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

  // Wait briefly to see if it crashes immediately (no kmsg access, no device …)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (spawnError || child.pid === undefined) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "process_crashed",
          message: `Failed to start kernel collect: ${spawnError ? spawnError.message : "no PID assigned"}`,
        },
      ],
    };
  }
  fs.writeFileSync(KERNEL_COLLECT_PID_FILE, String(child.pid));

  if (!isProcessRunning(child.pid)) {
    const output = fs.existsSync(KERNEL_COLLECT_OUTPUT_FILE)
      ? fs.readFileSync(KERNEL_COLLECT_OUTPUT_FILE, "utf-8")
      : "";
    try {
      fs.unlinkSync(KERNEL_COLLECT_PID_FILE);
    } catch {}
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "process_crashed",
          message: `kernel collect exited immediately. Output:\n${output}`,
        },
      ],
    };
  }

  return {
    command,
    status: "success",
    result: {
      pid: child.pid,
      device_serial: device.serial,
      log_file: logFile,
      log_base_dir: logBase.baseDir,
      output_file: KERNEL_COLLECT_OUTPUT_FILE,
      message: `Kernel log collection started in background (collect PID ${child.pid}) on device ${device.serial}. Lines are being written to ${logFile}. Ask the user to reproduce the issue, then run 'kernel stop' followed by 'kernel analyze'.`,
    },
  };
}

/**
 * Stop the background kernel-log collection process.
 */
async function stopKernelCollect(command) {
  const pid = getKernelCollectPid();
  if (!pid) {
    try {
      fs.unlinkSync(KERNEL_COLLECT_PID_FILE);
    } catch {}
    return {
      command,
      status: "success",
      result: {
        was_running: false,
        message: "No running kernel log collection process found.",
      },
    };
  }

  await terminateGracefully(pid);

  try {
    fs.unlinkSync(KERNEL_COLLECT_PID_FILE);
  } catch {}

  return {
    command,
    status: "success",
    result: {
      was_running: true,
      pid,
      message: `Kernel log collection (PID ${pid}) stopped. Run 'kernel analyze' to analyze the collected kernel log.`,
    },
  };
}

/**
 * Kernel log collection and analysis (kmsg/dmesg).
 *
 *   collect — start the long-running collector in the background (see
 *             startKernelCollect); one instance at a time
 *   stop    — stop that background collector
 *   analyze — analyze the collected kernel log files (synchronous)
 *
 * @param {string} subcommand - "collect", "stop" or "analyze"
 * @param {string} [serial]
 * @param {object} [opts] - { format }
 * @param {string} [commandLabel]
 */
async function manageKernel(subcommand, serial, opts = {}, commandLabel) {
  const command = commandLabel || "tizen-sdk dlog-analyzer kernel";
  const sub = subcommand || "collect";
  const validSubs = ["collect", "stop", "analyze"];
  if (!validSubs.includes(sub)) {
    return {
      command,
      status: "failure",
      errors: [
        {
          category: "invalid_parameters",
          message: `Invalid subcommand: '${sub}'. Must be one of: ${validSubs.join(", ")}`,
        },
      ],
    };
  }
  if (sub === "stop") return stopKernelCollect(command);
  if (sub === "collect") return startKernelCollect(command, serial);

  const resolved = resolveBinaryForLogs(command);
  if (resolved.error) return resolved.error;
  const { binaryPath } = resolved;
  const args = ["kernel", "analyze"];
  if (opts.format) args.push("--format", opts.format);
  return runBinary(command, binaryPath, args, {
    result: {
      message: "Kernel log analysis.",
      report_format: REPORT_FORMAT_HINT,
    },
    errorCategory: "kernel_failed",
    errorPrefix: "Failed to analyze kernel log",
  });
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
  // New v0.1.3 commands
  appLog,
  deviceProfile,
  investigate,
  runProbe,
  manageSnapshot,
  runTimeline,
  manageKernel,
  // One-shot device-log actions
  dumpDeviceLogs,
  clearDeviceLogs,
  // Pure helpers (unit-tested without a device)
  resolveLogBaseDir,
  appLogFile,
  isValidAppId,
  parseFirstPid,
  extractPidFromPsOutput,
  parseErrorCount,
  parseFilterSpecs,
  tailLines,
  sanitizeDlogOutput,
  buildLogClearGate,
  deviceErrorEnvelope,
  collectorEnv,
  capturedOutputSummary,
  REPORT_FORMAT_HINT,
  STOP_OUTPUT_LINES,
};
