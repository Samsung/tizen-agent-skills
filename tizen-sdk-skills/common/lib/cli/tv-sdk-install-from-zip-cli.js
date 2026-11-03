#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installTvSdkFromZip() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/tv-sdk-install-from-zip-cli.js --zip-path <path> [--tv-version <X.Y>] [--force]
 *
 * --tv-version names the TV platform version the ZIP is for (e.g. 9.0). The
 * installer also reads it from the inner ZIP names and stops when they differ.
 *
 * Exit code: success=0, failure/error=1
 */

const { installTvSdkFromZip } = require("../core/sdk-commands");
const { runCli, parseArgsOrExit } = require("./cli-runner");

const usage =
  "node tv-sdk-install-from-zip-cli.js --zip-path <path> [--tv-version <X.Y>] [--force]";
const { options } = parseArgsOrExit(
  "tizen-sdk tv-sdk-install-from-zip",
  usage,
  process.argv.slice(2),
  { "--zip-path": "zipPath", "--tv-version": "tvVersion" },
  { "--force": "force" },
);

runCli("tizen-sdk tv-sdk-install-from-zip", () =>
  installTvSdkFromZip(
    options.zipPath,
    !!options.force,
    "tizen-sdk tv-sdk-install-from-zip",
    options.tvVersion || "",
  ),
);
