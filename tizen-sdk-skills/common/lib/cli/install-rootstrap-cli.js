#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installRootstrap() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/cli/install-rootstrap-cli.js --zip-path /path/to/rootstrap.zip [--force]
 *
 * Exit code: success=0, failure=1
 */

const { installRootstrap } = require("../core/sdk-commands");
const { runCli, getFlagValue } = require("./cli-runner");

const args = process.argv.slice(2);

const zipPath = getFlagValue(args, "--zip-path");

const force = args.includes("--force") || args.includes("-Force");

runCli("tizen-sdk install-rootstrap", () =>
  installRootstrap(zipPath, force, "tizen-sdk install-rootstrap"),
);
