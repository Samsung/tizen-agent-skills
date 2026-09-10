#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for initSdk() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/sdk-init-cli.js [sdkPath]
 *
 * Examples:
 *   node ~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/lib/sdk-init-cli.js
 *   node .../sdk-init-cli.js /opt/tizen-studio
 *   node .../sdk-init-cli.js "C:\Users\me\tizen-sdk"
 *
 * If no sdkPath argument is provided, the default ~/tizen-sdk is used.
 *
 * Exit code: success=0, failure/error=1
 */

const { initSdk, DEFAULT_SDK_PATH } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const args = process.argv.slice(2);
const sdkPath = args[0] || DEFAULT_SDK_PATH;

runCli("tizen-sdk sdk-init", () => initSdk(sdkPath, "tizen-sdk sdk-init"));
