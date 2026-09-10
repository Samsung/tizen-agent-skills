#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installPlatform() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/platform-install-cli.js --platform-version 10.0 [--force]
 *
 * Exit code: success=0, failure/error=1
 */

const { installPlatform } = require("../core/sdk-commands");
const { runCli, getFlagValue } = require("./cli-runner");

const args = process.argv.slice(2);

const platformVersion = getFlagValue(args, "--platform-version");

if (!platformVersion) {
  const { formatError } = require("../envelope/response-formatter");
  const envelope = formatError(
    "tizen-sdk platform-install",
    "invalid_argument",
    "Missing required option: --platform-version <version>. " +
      "Specify the Tizen platform version to install (e.g., 10.0, 11.0). " +
      "Usage: node platform-install-cli.js --platform-version <version> [--force]",
    null,
    Date.now(),
  );
  process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
  process.exit(1);
}

const force = args.includes("--force") || args.includes("-Force");

runCli("tizen-sdk platform-install", () =>
  installPlatform(platformVersion, force, "tizen-sdk platform-install"),
);
