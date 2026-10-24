#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installPlatform() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/platform-install-cli.js --platform-version 10.0 [--force]
 *   node <plugin>/lib/platform-install-cli.js --list
 *
 * --list is read-only: it reports every installed TIZEN-X.Y (see listPlatforms).
 *
 * Exit code: success=0, failure/error=1
 */

const { installPlatform, listPlatforms } = require("../core/sdk-commands");
const { runCli, getFlagValue, getDownloadJobsOrExit } = require("./cli-runner");

const args = process.argv.slice(2);

if (args.includes("--list")) {
  runCli("tizen-sdk platform-list", () =>
    listPlatforms("tizen-sdk platform-list"),
  );
} else {
  runInstall();
}

function runInstall() {
  const platformVersion = getFlagValue(args, "--platform-version");

  if (!platformVersion) {
    const { formatError } = require("../envelope/response-formatter");
    const envelope = formatError(
      "tizen-sdk platform-install",
      "invalid_argument",
      "Missing required option: --platform-version <version>. " +
        "Specify the Tizen platform version to install (e.g., 10.0, 11.0). " +
        "Usage: node platform-install-cli.js --platform-version <version> [--force] | --list",
      null,
      Date.now(),
    );
    process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
    process.exit(1);
  }

  const force = args.includes("--force") || args.includes("-Force");
  const downloadJobs = getDownloadJobsOrExit(
    "tizen-sdk platform-install",
    args,
  );

  runCli("tizen-sdk platform-install", () =>
    installPlatform(
      platformVersion,
      force,
      "tizen-sdk platform-install",
      downloadJobs,
    ),
  );
}
