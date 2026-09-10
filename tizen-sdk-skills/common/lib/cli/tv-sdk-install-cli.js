#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installTvSdk() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/tv-sdk-install-cli.js [--force]
 *
 * Exit code: success=0, failure/error=1
 */

const { installTvSdk } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const args = process.argv.slice(2);
const force = args.includes("--force") || args.includes("-Force");

runCli("tizen-sdk tv-sdk-install", () =>
  installTvSdk(force, "tizen-sdk tv-sdk-install"),
);
