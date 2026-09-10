// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Read a password from an interactive terminal without echoing it.
 * Prompts use stderr so JSON-envelope consumers retain a clean stdout stream.
 *
 * In environments where raw mode or synchronous reading is not available,
 * this function throws a helpful error directing users to alternative methods.
 */
function promptHiddenPassword(label) {
  // Environment variable first — this is what the error messages below
  // advertise for non-interactive environments
  const envVar = getEnvVarForLabel(label);
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  // Check if we have a TTY and can set raw mode
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error(
      `${label}: Interactive password prompt is not available in this environment.\n` +
        `Use one of the following alternatives:\n` +
        `  1. Pass the password directly: --password "your_password"\n` +
        `  2. Use a password file: --password-file /path/to/file\n` +
        `  3. Set an environment variable: ${getEnvVarForLabel(label)}\n` +
        `Note: In MCP tool calls or non-interactive shells, use --password or --password-file.`,
    );
  }

  const fs = require("fs");
  const buffer = Buffer.alloc(1);

  process.stderr.write(`${label}: `);

  // Open terminal device for reading password input.
  // On POSIX systems, open /dev/tty directly in blocking mode to avoid EAGAIN
  // errors caused by libuv switching stdin to non-blocking mode.
  // On Windows, use process.stdin.fd since /dev/tty does not exist.
  const isWindows = process.platform === "win32";
  const ttyFd = isWindows ? process.stdin.fd : fs.openSync("/dev/tty", "rs");
  const previousRawMode = process.stdin.isRaw;

  try {
    process.stdin.setRawMode(true);
  } catch (rawModeError) {
    fs.closeSync(ttyFd);
    throw new Error(
      `${label}: Cannot enable raw mode: ${rawModeError.message}\n` +
        `Use one of the following alternatives:\n` +
        `  1. Pass the password directly: --password "your_password"\n` +
        `  2. Use a password file: --password-file /path/to/file\n` +
        `  3. Set an environment variable: ${getEnvVarForLabel(label)}`,
    );
  }

  try {
    // Accumulate raw bytes and decode once at the end - decoding each byte
    // individually turns multi-byte (non-ASCII) characters into U+FFFD.
    const bytes = [];
    while (true) {
      const bytesRead = fs.readSync(ttyFd, buffer, 0, 1, null);
      if (bytesRead === 0) continue;
      const byte = buffer[0];
      if (byte === 0x0d || byte === 0x0a) {
        process.stderr.write("\n");
        return Buffer.from(bytes).toString("utf8");
      }
      if (byte === 0x03) throw new Error("Hidden password prompt cancelled.");
      if (byte === 0x08 || byte === 0x7f) {
        // Remove one full UTF-8 character: continuation bytes (0b10xxxxxx)
        // plus their lead byte
        while (bytes.length > 0 && (bytes[bytes.length - 1] & 0xc0) === 0x80) {
          bytes.pop();
        }
        bytes.pop();
        continue;
      }
      bytes.push(byte);
    }
  } finally {
    try {
      process.stdin.setRawMode(Boolean(previousRawMode));
    } catch (_e) {
      // Ignore errors when restoring raw mode
    }
    // On Windows, ttyFd is process.stdin.fd which should not be closed.
    // On POSIX, ttyFd was opened with fs.openSync() and must be closed.
    if (!isWindows) {
      try {
        fs.closeSync(ttyFd);
      } catch (_e) {
        // Ignore errors when closing tty fd
      }
    }
  }
}

/**
 * Get the environment variable name for a given password label.
 */
function getEnvVarForLabel(label) {
  if (label.includes("Author")) return "TIZEN_AUTHOR_CERTIFICATE_PASSWORD";
  if (label.includes("Distributor key 2"))
    return "TIZEN_DISTRIBUTOR2_CERTIFICATE_PASSWORD";
  if (label.includes("Distributor"))
    return "TIZEN_DISTRIBUTOR_CERTIFICATE_PASSWORD";
  return "TIZEN_CERTIFICATE_PASSWORD";
}

module.exports = { promptHiddenPassword };
