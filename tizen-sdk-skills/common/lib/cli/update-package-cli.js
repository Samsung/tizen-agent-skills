#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for updatePackage() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/update-package-cli.js [--force] [--dry-run]
 *
 * Exit code: success=0, failure/error=1
 */

const { updatePackage } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const args = process.argv.slice(2);
const force = args.includes("--force") || args.includes("-Force");
const dryRun = args.includes("--dry-run") || args.includes("-DryRun");

runCli("tizen-sdk update-package", () =>
  updatePackage(force, dryRun, "tizen-sdk update-package"),
);
