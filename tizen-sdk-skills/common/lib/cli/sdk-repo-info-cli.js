#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for getRepoInfo() execution
 *
 * Lists the official Tizen CDN and its regional mirrors and the currently
 * configured repository URL; private mirrors are supplied with `--repo-url`.
 *
 * Run directly:
 *   node <plugin>/lib/cli/sdk-repo-info-cli.js
 *
 * Exit code: success=0, failure/error=1
 */

const { getRepoInfo } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

runCli("tizen-sdk sdk-repo-info", () => getRepoInfo("tizen-sdk sdk-repo-info"));
