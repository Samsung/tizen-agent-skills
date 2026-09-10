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
const { runCli, getFlagValue } = require("./cli-runner");

const args = process.argv.slice(2);
const force = args.includes("--force") || args.includes("-Force");

// --repo-url <url> or --repo-url=<url>
const repoUrl = getFlagValue(args, "--repo-url");

// Drop the --repo-url VALUE from the positionals, otherwise it would be read as
// the version argument.
const positional = args.filter((a) => !a.startsWith("-") && a !== repoUrl);
const version = positional[0] || "10.0";
const label = positional[1] || "tizen";

runCli("tizen-sdk sdk-install", () =>
  installSdk(version, label, force, repoUrl, "tizen-sdk sdk-install"),
);
