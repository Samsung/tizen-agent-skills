// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * File transfer domain: sdb push / sdb pull
 *
 * Executes scripts/tizen-file-transfer and parses stdout for DEVICE_SERIAL,
 * TRANSFER_DIRECTION, LOCAL_PATH, REMOTE_PATH, BYTES_TRANSFERRED lines
 * to return Standard JSON Envelope.
 */

const fs = require("fs");
const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { resolveScript, execPluginScript } = require("./plugin-cache");
const { summarizeOutput } = require("./output-summary");

/** Machine-readable marker lines the worker scripts print on stdout. */
const MACHINE_LINE =
  /^(DEVICE_SERIAL=|TRANSFER_DIRECTION=|LOCAL_PATH=|REMOTE_PATH=|BYTES_TRANSFERRED=|REMOTE_NOT_FOUND=)/;

/**
 * Extract only key lines from file transfer script stdout for envelope warnings
 *
 * The keep pattern deliberately includes sdb's own "missing path" wording
 * (`cannot stat '<path>': No such file or directory`, `does not exist`,
 * `Permission denied`) — those lines carry the actual reason a transfer
 * failed, and dropping them left the agent with only "Transfer failed" and
 * nothing to act on (issue #95).
 *
 * @param {string} output - script stdout
 * @returns {string[]} warnings array (key lines only)
 */
function summarizeFileTransferOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|push|pull|bytes|transfer|cannot|no such|not found|does not exist|permission denied/i,
    skip: MACHINE_LINE,
    max: 10,
  });
}

/**
 * Last few non-machine lines of a failed run, verbatim, for `errors[0].details`.
 * The summary above is a filter; this is the evidence.
 */
function rawOutputTail(output, { maxLines = 12, maxLineLength = 300 } = {}) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !MACHINE_LINE.test(line))
    .slice(-maxLines)
    .map((line) =>
      line.length <= maxLineLength
        ? line
        : `${line.slice(0, maxLineLength)} ...`,
    );
}

/**
 * Normalize a host-side path for the worker scripts.
 *
 * Windows users write `C:\logs\`; the scripts (PowerShell and Git Bash alike)
 * accept forward slashes for the same location, and the path is interpolated
 * into a shell command line where a backslash is an escape character. So the
 * backslash is converted rather than rejected — rejecting it made every
 * native Windows path fail with `invalid_parameters` and sent the agent into
 * a retry loop over path spellings (issue #95).
 *
 * @param {string|undefined} localPath
 * @returns {string|undefined}
 */
function normalizeLocalPath(localPath) {
  if (!localPath) return localPath;
  return String(localPath).replace(/\\/g, "/");
}

// Paths are interpolated into a shell command line — reject shell
// metacharacters (spaces are fine; they stay inside the quotes). The local
// path has already had backslashes normalized away; the remote path is a
// POSIX path on the device, where a backslash is never legitimate.
const UNSAFE_PATH = /["`$\\;|&<>\n\r]/;

/**
 * Well-known MSYS / Cygwin install roots, for when EXEPATH is not exported.
 * Matched against a forward-slash Windows path; the match ends right before
 * the `/opt/...` part MSYS appended.
 */
const KNOWN_MSYS_ROOT_RE =
  /^[A-Za-z]:\/(?:Program Files(?: \(x86\))?\/Git|Git|msys64|msys32|msys2|cygwin64|cygwin)(?=\/)/i;

/**
 * Install roots MSYS may have prefixed onto a POSIX path, forward-slashed,
 * no trailing slash. Git for Windows exports EXEPATH as `C:\Program Files\Git`
 * or `...\Git\bin` (or `...\usr\bin` / `...\mingw64\bin` under msys2), so the
 * `bin` tails are stripped to reach the root.
 *
 * A root must be a drive plus at least one directory. A bare drive
 * (`EXEPATH=C:\`) would otherwise match EVERY `C:/...` path and "restore"
 * genuine Windows paths (`C:/Users/me/x` → `/Users/me/x`) instead of
 * rejecting them; such a value is ignored and the well-known roots are used.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function msysRoots(env) {
  const roots = [];
  const exe = env && env.EXEPATH;
  if (exe) {
    const fwd = String(exe).replace(/\\/g, "/").replace(/\/+$/, "");
    const root = fwd.replace(/\/(?:(?:usr|mingw64|mingw32)\/)?bin$/i, "");
    if (/^[A-Za-z]:\/[^/]/.test(root)) roots.push(root);
  }
  return roots;
}

/**
 * Undo Git Bash (MSYS) argument conversion on the REMOTE path.
 *
 * In Claude Code on Windows the Bash tool is Git Bash, and MSYS rewrites any
 * argument that starts with `/` into a Windows path under the Git install
 * root before node ever sees it: `/opt/usr/apps/x` arrives as
 * `C:/Program Files/Git/opt/usr/apps/x`. That is meaningless on a Tizen
 * device — sdb would fail with "No such file" against a path the user never
 * typed. The agent's manual workaround was `//opt/...` (a leading double
 * slash is left alone by MSYS). Both forms are normalized here:
 *
 *   "C:/Program Files/Git/opt/usr/apps/x" → "/opt/usr/apps/x"   (+ warning)
 *   "//opt/usr/apps/x"                     → "/opt/usr/apps/x"   (+ warning)
 *   "/opt/usr/apps/x"                      → unchanged
 *   "C:/Users/me/x"                        → error (a Windows path is never
 *                                             a device path)
 *
 * The install root comes from EXEPATH (exported by Git Bash) and falls back
 * to the well-known install locations. Root matching is case-insensitive
 * (Windows paths are) and segment-exact: `.../Git/` is a root, `.../Github/`
 * is not. Anything under a recognised root is restored — including paths
 * that also exist on the host, such as `<root>/usr/bin/bash.exe` →
 * `/usr/bin/bash.exe`. That is deliberate: a Windows path is never a valid
 * device path, so the only sensible reading of `<root>/X` is "MSYS
 * converted `/X`", and `/X` is exactly what the user typed. The warning
 * names both spellings so a wrong guess is visible in the envelope.
 * `MSYS_NO_PATHCONV=1` is deliberately NOT the recommended fix: it would
 * also stop `/c/Users/.../file-transfer-cli.js` from being converted, and
 * Windows node cannot open that spelling.
 *
 * @param {string} remotePath
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {{path: string, warning?: string, error?: string}}
 */
function normalizeRemotePath(remotePath, env = process.env) {
  if (!remotePath) return { path: remotePath };
  const original = String(remotePath);

  if (/^\/\//.test(original)) {
    const collapsed = original.replace(/^\/+/, "/");
    return {
      path: collapsed,
      warning: `Remote path "${original}" had a doubled leading slash (the manual MSYS workaround); using "${collapsed}". The runner restores MSYS-converted paths itself — a plain "/opt/..." is fine.`,
    };
  }

  if (!/^[A-Za-z]:[\\/]/.test(original)) return { path: original };

  const fwd = original.replace(/\\/g, "/");
  for (const root of msysRoots(env)) {
    if (root && fwd.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      const restored = fwd.slice(root.length);
      return {
        path: restored,
        warning: `Remote path "${original}" was a Git Bash (MSYS) conversion of "${restored}" — restored to the device path. Pass device paths as plain "/opt/..."; no "//" prefix or MSYS_NO_PATHCONV needed.`,
      };
    }
  }
  const known = fwd.match(KNOWN_MSYS_ROOT_RE);
  if (known) {
    const restored = fwd.slice(known[0].length);
    return {
      path: restored,
      warning: `Remote path "${original}" was a Git Bash (MSYS) conversion of "${restored}" — restored to the device path. Pass device paths as plain "/opt/..."; no "//" prefix or MSYS_NO_PATHCONV needed.`,
    };
  }

  return {
    path: original,
    error: `Remote path must be a POSIX path on the device (e.g. /opt/usr/apps/x), got a Windows path: ${original}. If you typed "/opt/..." in Git Bash, MSYS converted it under an install root the runner does not recognise (EXEPATH=${(env && env.EXEPATH) || "unset"}); re-run with the device path spelled "//opt/..." or from PowerShell.`,
  };
}

/** sdb's wording when the remote object does not exist (pull) */
const REMOTE_MISSING_RE =
  /^REMOTE_NOT_FOUND=|cannot stat\b|No such file or directory|does not exist|remote object .* does not exist/im;

/**
 * Classify the combined stdout+stderr of a failed worker-script run.
 *
 * @param {string} combined - stdout + stderr of the failed run
 * @param {string} direction - "push" | "pull"
 * @returns {{category: string, message: string, suggestedFix: string|null}}
 */
function classifyTransferFailure(combined, direction) {
  const text = String(combined || "");
  if (/No devices found/i.test(text)) {
    return {
      category: "device_not_found",
      message:
        "No connected device or emulator. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it, then retry.",
      suggestedFix: null,
    };
  }
  if (/Multiple devices found/i.test(text)) {
    return {
      category: "multiple_devices",
      message:
        "Multiple devices are connected. Pass the target device serial and run once more.",
      suggestedFix: null,
    };
  }
  if (direction === "pull" && REMOTE_MISSING_RE.test(text)) {
    const marker = text.match(/^REMOTE_NOT_FOUND=(.+)$/m);
    const where = marker ? marker[1].trim() : "the requested remote path";
    return {
      category: "remote_path_not_found",
      message: `Remote path does not exist on the device: ${where}. Nothing was transferred.`,
      suggestedFix:
        "Ask the user to confirm the exact device path (paths are case-sensitive; app data usually lives under /opt/usr/ or /home/owner/). Re-run ONLY with a corrected path — do not retry the same path.",
    };
  }
  return { category: "io_error", message: null, suggestedFix: null };
}

/**
 * Transfer a file or directory between host and Tizen device via sdb push/pull
 *
 * Executes scripts/tizen-file-transfer and parses stdout for machine-readable
 * output lines to return Standard JSON Envelope.
 *
 * @param {string} direction - Transfer direction: 'push' (host→device) or 'pull' (device→host)
 * @param {string} localPath - Local (host) file/directory path (required for push; optional for pull, defaults to '.')
 * @param {string} remotePath - Remote (device) file/directory path (required)
 * @param {string} [serial] - Device serial (omit to auto-select the single connected device)
 * @param {boolean} [withUtf8=false] - Handle UTF-8 encoded paths
 * @returns {object} Standard JSON Envelope
 */
async function fileTransfer(
  direction,
  localPath,
  remotePath,
  serial,
  withUtf8 = false,
  command = "tizen-sdk file-transfer",
) {
  const startTime = Date.now();
  try {
    // Validate direction
    if (!direction || (direction !== "push" && direction !== "pull")) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid direction: ${direction}. Must be 'push' or 'pull'.`,
        'fileTransfer("push", "/path/to/local", "/path/to/remote")',
      );
    }

    // Remote path is always required
    if (!remotePath) {
      return formatError(
        command,
        "invalid_parameters",
        "Remote path is required.",
        'fileTransfer("push", "/path/to/local", "/path/to/remote")',
      );
    }

    // Git Bash on Windows rewrites a leading-slash argument into a path under
    // the Git install root before node sees it — restore the device path
    // (see normalizeRemotePath). A genuine Windows path is never valid here.
    const remote = normalizeRemotePath(remotePath);
    if (remote.error) {
      return formatError(
        command,
        "invalid_parameters",
        remote.error,
        'Pass the device path as it is on the device, e.g. fileTransfer("pull", undefined, "/opt/usr/apps/x")',
        startTime,
      );
    }
    const effectiveRemotePath = remote.path;
    const pathWarnings = remote.warning ? [remote.warning] : [];
    if (remote.warning)
      console.error(`[tizen-file-transfer] ${remote.warning}`);

    // For push, local path is required
    if (direction === "push" && !localPath) {
      return formatError(
        command,
        "invalid_parameters",
        "Local path is required for push direction.",
        'fileTransfer("push", "/path/to/local", "/path/to/remote")',
      );
    }

    // For pull, local path defaults to current directory. Windows-style
    // backslashes are normalized to forward slashes (see normalizeLocalPath).
    const effectiveLocalPath = normalizeLocalPath(
      direction === "pull" && !localPath ? "." : localPath,
    );

    // Validate serial if provided
    if (serial && !/^[A-Za-z0-9._:-]+$/.test(serial)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid device serial: ${serial}`,
      );
    }

    if (effectiveLocalPath && UNSAFE_PATH.test(effectiveLocalPath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Local path contains unsupported characters: ${effectiveLocalPath}`,
      );
    }
    if (UNSAFE_PATH.test(effectiveRemotePath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Remote path contains unsupported characters: ${effectiveRemotePath}`,
      );
    }

    // push: the source must exist on the host. Fail here, before any sdb
    // call, with a message that names the path — a wrong path is the user's
    // to fix, not something a retry can cure.
    if (direction === "push" && !fs.existsSync(effectiveLocalPath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Local path not found: ${effectiveLocalPath}. Nothing was transferred.`,
        "Ask the user to confirm the host path, then re-run ONLY with a corrected path — do not retry the same path.",
        startTime,
      );
    }

    const resolved = resolveScript("tizen-file-transfer");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    console.error(
      `[tizen-file-transfer] ${direction}: ${effectiveLocalPath} <-> ${effectiveRemotePath}${serial ? ` on ${serial}` : ""}`,
    );

    // Build script arguments
    const winFlags = [
      `-Direction "${direction}"`,
      `-Remote "${effectiveRemotePath}"`,
    ];
    const unixFlags = [`-d ${direction}`, `-r "${effectiveRemotePath}"`];

    if (effectiveLocalPath) {
      winFlags.push(`-Local "${effectiveLocalPath}"`);
      unixFlags.push(`-l "${effectiveLocalPath}"`);
    }
    if (serial) {
      winFlags.push(`-DeviceSerial "${serial}"`);
      unixFlags.push(`-s "${serial}"`);
    }
    if (withUtf8) {
      winFlags.push("-WithUtf8");
      unixFlags.push("--with-utf8");
    }

    let output;
    try {
      // captureViaTempFile: sdb server can be a long-lived process
      output = execPluginScript(
        resolved.scriptPath,
        winFlags.join(" "),
        unixFlags.join(" "),
        { captureViaTempFile: true },
      );
    } catch (error) {
      const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
      const verdict = classifyTransferFailure(combined, direction);
      const details = rawOutputTail(combined);
      if (verdict.message) {
        return formatError(
          command,
          verdict.category,
          verdict.message,
          verdict.suggestedFix,
          startTime,
          details.length ? details : null,
        );
      }
      const keyLines = summarizeFileTransferOutput(combined);
      return formatError(
        command,
        "io_error",
        `File transfer failed: ${error.message}${keyLines.length ? ` — ${keyLines.join(" | ")}` : ""}`,
        null,
        startTime,
        details.length ? details : null,
      );
    }

    // Parse machine-readable output lines
    const serialMatch = output.match(/^DEVICE_SERIAL=(.+)$/m);
    const directionMatch = output.match(/^TRANSFER_DIRECTION=(.+)$/m);
    const localMatch = output.match(/^LOCAL_PATH=(.+)$/m);
    const remoteMatch = output.match(/^REMOTE_PATH=(.+)$/m);
    const bytesMatch = output.match(/^BYTES_TRANSFERRED=(.+)$/m);

    if (!serialMatch) {
      return formatError(
        command,
        "io_error",
        "Script exited successfully but printed no DEVICE_SERIAL=... line.",
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        direction: directionMatch ? directionMatch[1].trim() : direction,
        local_path: localMatch ? localMatch[1].trim() : effectiveLocalPath,
        remote_path: remoteMatch ? remoteMatch[1].trim() : effectiveRemotePath,
        device_serial: serialMatch[1].trim(),
        bytes_transferred: bytesMatch
          ? parseInt(bytesMatch[1].trim(), 10)
          : null,
        status: "completed",
      },
      {
        warnings: [...pathWarnings, ...summarizeFileTransferOutput(output)],
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to transfer file: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  fileTransfer,
  // exported for unit tests
  normalizeLocalPath,
  normalizeRemotePath,
  classifyTransferFailure,
  summarizeFileTransferOutput,
};
