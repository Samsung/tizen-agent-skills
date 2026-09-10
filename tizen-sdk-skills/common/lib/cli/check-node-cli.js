#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for checkNode() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/cli/check-node-cli.js
 *
 * Exit code: success=0, failure/error=1
 */

const { checkNode } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

runCli("tizen-sdk check-node", () => checkNode("tizen-sdk check-node"));
