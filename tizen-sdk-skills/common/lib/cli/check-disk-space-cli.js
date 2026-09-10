#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for checkDiskSpace() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/cli/check-disk-space-cli.js [path] [requiredGb]
 *
 * Examples:
 *   node ~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/lib/cli/check-disk-space-cli.js
 *   node .../check-disk-space-cli.js "C:/tizen-sdk" 5

 *
 * Exit code: success=0, failure/error=1
 */

const { checkDiskSpace } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("-"));
const targetPath = positional[0] || null;
const requiredGb = positional[1] ? parseFloat(positional[1]) : 15;

runCli("tizen-sdk check-disk-space", () =>
  checkDiskSpace(targetPath, requiredGb, "tizen-sdk check-disk-space"),
);
