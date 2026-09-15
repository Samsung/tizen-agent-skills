// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Shell-safety screens for values that are interpolated into a command line.
 *
 * execPluginScript (plugin-cache.js) builds ONE string — `bash "<script>"
 * <args>` on POSIX, `powershell ... -File "<script>" <args>` through cmd.exe
 * on Windows — and hands it to execSync, i.e. to a shell. Every value spliced
 * into that string inside double quotes is therefore shell input, and the
 * quotes are the only thing standing between a path the model chose and a
 * command the host runs.
 *
 * Several domains already screen their own values at the boundary
 * (file-transfer.js UNSAFE_PATH, emulator.js validatePassThroughOptions,
 * screenshot.js, webapp-debug.js). This module is the shared form of that
 * screen for the call sites that had none: project paths, ZIP paths, debugger
 * binary paths, and the device serial that every sdb command line carries.
 *
 * What is rejected, and why:
 *   "        ends the double-quoted argument (bash and cmd.exe alike)
 *   ` $      command / variable substitution inside "..." in bash
 *   ; | & < > command separators and redirections — literal inside quotes,
 *            but the first thing a value that escaped its quotes would use
 *   CR LF    split the command line
 *   trailing backslash — escapes the closing quote in bash ("C:\" swallows
 *            the rest of the line)
 * Everything else (spaces, parentheses, non-ASCII, a single quote) is left
 * alone so real paths — "Program Files (x86)", "John's Project" — still work.
 */

"use strict";

const { formatError } = require("../envelope/response-formatter");

const UNSAFE_SHELL_CHARS = /["`$;|&<>\r\n]/;
const UNSAFE_SHELL_CHAR_LIST = '" ` $ ; | & < > (or a line break)';

/** Device serials are plain identifiers: emulator-26101, 0123456789ABCDEF, 192.168.0.10:26101. */
const SERIAL_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * Why a value cannot be interpolated into a double-quoted shell argument, or
 * null when it can.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function shellUnsafeReason(value) {
  const text = String(value);
  if (UNSAFE_SHELL_CHARS.test(text)) {
    return `must not contain any of ${UNSAFE_SHELL_CHAR_LIST}`;
  }
  if (text.endsWith("\\")) {
    return "must not end with a backslash (it would escape the closing quote)";
  }
  return null;
}

/**
 * Screen one value; return an `invalid_parameters` envelope when it is
 * unsafe, null when it is fine or empty (emptiness is the caller's concern).
 *
 * @param {unknown} value
 * @param {string} label - what the value is, for the message ("project path")
 * @param {string} command - envelope command label
 * @param {number} [startTime]
 * @returns {object|null}
 */
function checkShellSafe(value, label, command, startTime) {
  if (value === undefined || value === null || value === "") return null;
  const reason = shellUnsafeReason(value);
  if (!reason) return null;
  return formatError(
    command,
    "invalid_parameters",
    `Invalid ${label} "${String(value)}": ${reason}.`,
    null,
    startTime,
  );
}

/**
 * @param {unknown} serial
 * @returns {boolean}
 */
function isValidSerial(serial) {
  return SERIAL_PATTERN.test(String(serial));
}

module.exports = {
  UNSAFE_SHELL_CHARS,
  UNSAFE_SHELL_CHAR_LIST,
  SERIAL_PATTERN,
  shellUnsafeReason,
  checkShellSafe,
  isValidSerial,
};
