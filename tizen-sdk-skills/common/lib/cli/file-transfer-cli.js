#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for fileTransfer() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/file-transfer-cli.js <direction> <arg2> <arg3> [arg4] [arg5] [--with-utf8]
 *
 * Examples:
 *   node .../file-transfer-cli.js push "/path/to/local" "/path/on/device"
 *   node .../file-transfer-cli.js push "/path/to/local" "/path/on/device" emulator-26101
 *   node .../file-transfer-cli.js pull - "/path/on/device"
 *   node .../file-transfer-cli.js pull - "/path/on/device" "/local/output/path"
 *   node .../file-transfer-cli.js pull - "/path/on/device" emulator-26101
 *   node .../file-transfer-cli.js pull - "/path/on/device" "/local/output/path" emulator-26101
 *   node .../file-transfer-cli.js push "/path/to/local" "/path/on/device" emulator-26101 --with-utf8
 *
 * Arguments:
 *   PUSH: push <localPath> <remotePath> [serial]
 *     Transfers a file from host to device.
 *     - localPath:  Local file/directory path (required)
 *     - remotePath: Remote device path (required)
 *     - serial:     Device serial (optional; omit to auto-select)
 *
 *   PULL: pull - <remotePath> [localOutputPath|serial] [serial]
 *     Transfers a file from device to host.
 *     - First "-": Use default output location (required)
 *     - remotePath: Remote device path (required)
 *     - [localOutputPath|serial]: Output file path (if it contains "/" or "\") or device serial (optional)
 *     - [serial]: Device serial, only if localOutputPath is specified (optional)
 *
 *   --with-utf8: Handle UTF-8 encoded paths (optional flag, any position)
 *
 * Exit code: success=0, failure/error=1
 */

const { fileTransfer } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const args = process.argv.slice(2);
const withUtf8 = args.includes("--with-utf8");
const positional = args.filter((a) => a !== "--with-utf8");

const [direction, localPathOrDash, arg3, serialOrPath, arg5] = positional;

if (!direction) {
  console.error(
    JSON.stringify(
      {
        command: "tizen-sdk file-transfer",
        status: "error",
        errors: [
          {
            code: "invalid_parameters",
            message:
              "Usage: node file-transfer-cli.js <push|pull> <localPath|-> <remotePath> [serial] [--with-utf8]",
          },
        ],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (!localPathOrDash || !arg3) {
  console.error(
    JSON.stringify(
      {
        command: "tizen-sdk file-transfer",
        status: "error",
        errors: [
          {
            code: "invalid_parameters",
            message:
              "Usage: node file-transfer-cli.js <push|pull> <localPath|-> <remotePath> [serial] [--with-utf8]",
          },
        ],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

function looksLikeSerial(str) {
  if (!str) return false;
  return (
    /^[a-zA-Z0-9._:-]+$/.test(str) &&
    (str.startsWith("emulator-") ||
      str.startsWith("device-") ||
      /^\d{1,3}\.\d{1,3}/.test(str))
  );
}

function looksLikeLocalPath(str) {
  if (!str) return false;
  return str.includes("/") || str.includes("\\") || str.startsWith("%");
}

let localPath, remotePath, serial;

if (direction === "push") {
  // push <localPath> <remotePath> [serial]
  localPath = localPathOrDash;
  remotePath = arg3;
  serial = serialOrPath;
} else if (direction === "pull") {
  // pull - <remotePath> [localOutputPath|serial] [serial]
  if (localPathOrDash !== "-") {
    console.error(
      JSON.stringify(
        {
          command: "tizen-sdk file-transfer",
          status: "error",
          errors: [
            {
              code: "invalid_parameters",
              message:
                'For pull, second argument must be "-" (use default output location). For custom output, pass it as the 4th argument.',
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  remotePath = arg3;

  if (serialOrPath) {
    if (looksLikeLocalPath(serialOrPath)) {
      localPath = serialOrPath;
      serial = arg5;
    } else if (looksLikeSerial(serialOrPath)) {
      serial = serialOrPath;
      localPath = undefined;
    } else {
      localPath = undefined;
      serial = serialOrPath;
    }
  } else {
    localPath = undefined;
    serial = undefined;
  }
} else {
  console.error(
    JSON.stringify(
      {
        command: "tizen-sdk file-transfer",
        status: "error",
        errors: [
          {
            code: "invalid_parameters",
            message: 'Direction must be "push" or "pull"',
          },
        ],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

runCli("tizen-sdk file-transfer", () =>
  fileTransfer(
    direction,
    localPath,
    remotePath,
    serial,
    withUtf8,
    "tizen-sdk file-transfer",
  ),
);
