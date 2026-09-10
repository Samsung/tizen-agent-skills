#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installTvSdkFromZip() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/tv-sdk-install-from-zip-cli.js --zip-path <path> [--force]
 *
 * Exit code: success=0, failure/error=1
 */

const { installTvSdkFromZip } = require("../core/sdk-commands");
const { runCli, parseArgsOrExit } = require("./cli-runner");

const usage = "node tv-sdk-install-from-zip-cli.js --zip-path <path> [--force]";
const { options } = parseArgsOrExit(
  "tizen-sdk tv-sdk-install-from-zip",
  usage,
  process.argv.slice(2),
  { "--zip-path": "zipPath" },
  { "--force": "force" },
);

runCli("tizen-sdk tv-sdk-install-from-zip", () =>
  installTvSdkFromZip(
    options.zipPath,
    !!options.force,
    "tizen-sdk tv-sdk-install-from-zip",
  ),
);
