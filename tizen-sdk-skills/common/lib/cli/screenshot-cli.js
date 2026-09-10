#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for captureScreenshot() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/screenshot-cli.js [serial] [output]
 *
 * Examples:
 *   node .../screenshot-cli.js
 *   node .../screenshot-cli.js emulator-26101
 *   node .../screenshot-cli.js emulator-26101 ./my-screenshot.png
 *
 * Arguments:
 *   serial - Optional sdb device serial (auto-detect if omitted)
 *   output - Optional output PNG path (default: ./emulator_screenshot.png)
 *
 * Exit code: success=0, failure/error=1
 */

const { captureScreenshot } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const [, , serial, output] = process.argv;

runCli("tizen-sdk screenshot", () =>
  captureScreenshot(serial || null, output || null),
);
