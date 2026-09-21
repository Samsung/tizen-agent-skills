#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installSdk() execution
 *
 * Run directly without the agent having to create temporary script files:
 *   node <plugin>/lib/sdk-install-cli.js [version] [label] [--force] [--repo-url <url>]
 *
 * Examples:
 *   node ~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/lib/sdk-install-cli.js
 *   node .../sdk-install-cli.js 10.0 tizen --force
 *   node .../sdk-install-cli.js --repo-url http://my-mirror/tizenstudio
 *
 * [version] is the Tizen platform version (X.Y, e.g. 10.0). Omit it to install
 * the newest version the repository offers. A malformed version fails with
 * invalid_argument; a valid one that is not installed / not offered fails
 * instead of being reported as "already installed".
 *
 * --repo-url installs from a custom package repository instead of the
 * timezone-selected CDN mirror; installSdk() then delegates to
 * installSdkFromRepo(), which validates that the URL serves
 * pkg_list_{OS}-{64,32}. sdk-install-custom-repo-cli.js is the dedicated
 * runner for that flow (it also accepts a platform version).
 *
 * This file is in a version directory, so sdk-commands is loaded with relative paths
 * (no dynamic version lookup needed — already running in the correct version).
 *
 * Exit code: success=0, failure/error=1
 */

const { installSdk } = require("../core/sdk-commands");
const { runCli, getFlagValue, getDownloadJobsOrExit } = require("./cli-runner");

const COMMAND = "tizen-sdk sdk-install";
const args = process.argv.slice(2);
const force = args.includes("--force") || args.includes("-Force");

// --repo-url <url> or --repo-url=<url>
const repoUrl = getFlagValue(args, "--repo-url");
// Validated here (envelope on error); the raw value is kept only to drop it
// from the positionals below.
const downloadJobs = getDownloadJobsOrExit(COMMAND, args);
const jobsValue = getFlagValue(args, "--download-jobs");

// Drop flag VALUES from the positionals, otherwise they would be read as the
// version argument.
const positional = args.filter(
  (a) => !a.startsWith("-") && a !== repoUrl && a !== jobsValue,
);
const version = positional[0] || "";
const label = positional[1] || "tizen";

runCli(COMMAND, () =>
  installSdk(version, label, force, repoUrl, COMMAND, downloadJobs),
);
