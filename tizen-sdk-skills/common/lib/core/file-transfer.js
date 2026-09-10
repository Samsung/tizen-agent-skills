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
    if (UNSAFE_PATH.test(remotePath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Remote path contains unsupported characters: ${remotePath}`,
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
      `[tizen-file-transfer] ${direction}: ${effectiveLocalPath} <-> ${remotePath}${serial ? ` on ${serial}` : ""}`,
    );

    // Build script arguments
    const winFlags = [`-Direction "${direction}"`, `-Remote "${remotePath}"`];
    const unixFlags = [`-d ${direction}`, `-r "${remotePath}"`];

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
        remote_path: remoteMatch ? remoteMatch[1].trim() : remotePath,
        device_serial: serialMatch[1].trim(),
        bytes_transferred: bytesMatch
          ? parseInt(bytesMatch[1].trim(), 10)
          : null,
        status: "completed",
      },
      {
        warnings: summarizeFileTransferOutput(output),
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
  classifyTransferFailure,
  summarizeFileTransferOutput,
};
