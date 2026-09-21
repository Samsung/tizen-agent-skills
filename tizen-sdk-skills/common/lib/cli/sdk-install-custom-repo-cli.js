#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for installSdkFromRepo() execution
 *
 * Installs the Tizen SDK from a CUSTOM package repository URL instead of the
 * timezone-selected CDN mirror. The URL is validated first: it must serve
 * pkg_list_{OS}-64 or pkg_list_{OS}-32 (OS = windows | ubuntu | macos), else the
 * install is refused before anything is downloaded.
 *
 * Like sdk-install-cli.js this is a fast PRE-CHECK, not the installer: when the
 * SDK is not yet installed it returns a failure envelope whose
 * errors[0].suggested_fix.command is the installer line to run in background
 * (Phase 2).
 *
 * Usage:
 *   node <plugin>/lib/cli/sdk-install-custom-repo-cli.js <repo-url> [platform-version] [--force]
 *   node <plugin>/lib/cli/sdk-install-custom-repo-cli.js --repo-url <url> [--platform-version 11.0] [--force]
 *
 * Examples:
 *   # Private / in-house mirrors
 *   node .../sdk-install-custom-repo-cli.js http://mirror.example.com/packages/tizen_sdk_11.0
 *   node .../sdk-install-custom-repo-cli.js http://mirror.example.com/packages/tizen_studio_6.5
 *   # Custom repositories
 *   node .../sdk-install-custom-repo-cli.js --repo-url https://my-mirror/tizenstudio --platform-version 11.0 --force
 *
 * Exit code: success=0, failure/error=1
 */

const { installSdkFromRepo } = require("../core/sdk-commands");
const { runCli, getFlagValue, getDownloadJobsOrExit } = require("./cli-runner");

const COMMAND = "tizen-sdk sdk-install-custom-repo";
const args = process.argv.slice(2);

const force = args.includes("--force") || args.includes("-Force");
// Same validator as every other sdk CLI: a bad value becomes an
// invalid_parameters envelope on stderr, not a stack trace.
const downloadJobs = getDownloadJobsOrExit(COMMAND, args);
// Drop flag VALUES from the positionals, otherwise they would be read as the
// repo URL / platform version.
const rawJobs = getFlagValue(args, "--download-jobs");
const positional = args.filter((a) => !a.startsWith("-") && a !== rawJobs);

// --repo-url / --platform-version take precedence; positionals are the short form.
let repoUrl = getFlagValue(args, "--repo-url");
let platformVersion =
  getFlagValue(args, "--platform-version") || getFlagValue(args, "--platform");

const consumed = [repoUrl, platformVersion].filter(Boolean);
const free = positional.filter((p) => !consumed.includes(p));
if (!repoUrl) repoUrl = free[0] || "";
if (!platformVersion)
  platformVersion = (repoUrl === free[0] ? free[1] : free[0]) || "";

runCli(COMMAND, () =>
  installSdkFromRepo(repoUrl, platformVersion, force, downloadJobs),
);
