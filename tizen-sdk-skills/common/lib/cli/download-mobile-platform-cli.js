#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for downloadMobilePlatform() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/download-mobile-platform-cli.js [--platform-version 10.0] [--include-iot-headed] [--force]
 *
 * Exit code: success=0, failure/error=1
 */

const { downloadMobilePlatform } = require("../core/sdk-commands");
const { runCli, getFlagValue } = require("./cli-runner");

const args = process.argv.slice(2);

const platformVersion = getFlagValue(args, "--platform-version");

const includeIotHeaded = args.includes("--include-iot-headed");

const iotHeadedVersion = getFlagValue(args, "--iot-headed-version");

const force = args.includes("--force") || args.includes("-Force");

runCli("tizen-sdk download-mobile-platform", () =>
  downloadMobilePlatform(
    platformVersion,
    includeIotHeaded,
    iotHeadedVersion,
    force,
    "tizen-sdk download-mobile-platform",
  ),
);
