#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for validateRepoUrl() execution
 *
 * Checks whether a URL is a usable Tizen package repository — i.e. whether it
 * serves the package index file pkg_list_{OS}-64 or pkg_list_{OS}-32 for this OS
 * (OS = windows | ubuntu | macos). Read-only: nothing is downloaded or installed.
 *
 * Usage:
 *   node <plugin>/lib/cli/validate-repo-url-cli.js <repo-url>
 *   node <plugin>/lib/cli/validate-repo-url-cli.js --repo-url <repo-url>
 *
 * Exit code: 0 = valid repository, 1 = invalid (malformed URL or no pkg_list).
 */

const { validateRepoUrl } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

const args = process.argv.slice(2);

const idx = args.indexOf("--repo-url");
const inline = args.find((a) => a.startsWith("--repo-url="));
const repoUrl =
  (idx !== -1 ? args[idx + 1] : null) ||
  (inline ? inline.slice("--repo-url=".length) : null) ||
  args.find((a) => !a.startsWith("-")) ||
  "";

runCli("tizen-sdk validate-repo-url", () => validateRepoUrl(repoUrl));
