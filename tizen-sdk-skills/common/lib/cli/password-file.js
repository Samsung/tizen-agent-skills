// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

const fs = require("fs");
const path = require("path");

/**
 * Read one password from a user-created environment file without putting the
 * secret in chat or command-line arguments. The format is deliberately strict:
 *   TIZEN_CERTIFICATE_PASSWORD=<password>
 */
function readPasswordFile(filePath, variableName) {
  if (!filePath) throw new Error("Password file path is required.");

  const resolvedPath = path.resolve(String(filePath));
  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (error) {
    throw new Error(
      `Cannot read password file "${resolvedPath}": ${error.message}`,
    );
  }
  if (!stat.isFile())
    throw new Error(`Password file "${resolvedPath}" must be a regular file.`);

  // POSIX permissions are meaningful here. Windows ACLs cannot be represented
  // reliably through stat.mode, so the documentation tells users to restrict ACLs.
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error(
      `Password file "${resolvedPath}" must not be readable by group or others. Run chmod 600 on it.`,
    );
  }

  let content;
  try {
    content = fs.readFileSync(resolvedPath, "utf8").replace(/^\uFEFF/, "");
  } catch (error) {
    throw new Error(
      `Cannot read password file "${resolvedPath}": ${error.message}`,
    );
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const prefix = `${variableName}=`;
  if (lines.length !== 1 || !lines[0].startsWith(prefix)) {
    throw new Error(
      `Password file "${resolvedPath}" must contain exactly one line: ${variableName}=<password>.`,
    );
  }

  const password = lines[0].slice(prefix.length);
  if (!password)
    throw new Error(
      `Password file "${resolvedPath}" contains an empty ${variableName} value.`,
    );
  return password;
}

module.exports = { readPasswordFile };
