#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for downloadEmulatorPackage() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/download-emulator-package-cli.js [--platform-version 10.0] [--force]
 *
 * Exit code: success=0, failure/error=1
 */

const { downloadEmulatorPackage } = require("../core/sdk-commands");
const { runCli, getFlagValue } = require("./cli-runner");

const args = process.argv.slice(2);

const platformVersion = getFlagValue(args, "--platform-version");

const force = args.includes("--force") || args.includes("-Force");

runCli("tizen-sdk download-emulator-package", () =>
  downloadEmulatorPackage(
    platformVersion,
    force,
    "tizen-sdk download-emulator-package",
  ),
);
