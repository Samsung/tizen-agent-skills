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
const { runCli } = require("./cli-runner");

const args = process.argv.slice(2);

/** Read `--flag value` or `--flag=value`; returns '' when absent. */
function readOption(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("-")) {
    return args[idx + 1];
  }
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(`--${name}=`.length) : "";
}

const force = args.includes("--force") || args.includes("-Force");
const positional = args.filter((a) => !a.startsWith("-"));

// --repo-url / --platform-version take precedence; positionals are the short form.
let repoUrl = readOption("repo-url");
let platformVersion = readOption("platform-version") || readOption("platform");

const consumed = [repoUrl, platformVersion].filter(Boolean);
const free = positional.filter((p) => !consumed.includes(p));
if (!repoUrl) repoUrl = free[0] || "";
if (!platformVersion)
  platformVersion = (repoUrl === free[0] ? free[1] : free[0]) || "";

runCli("tizen-sdk sdk-install-custom-repo", () =>
  installSdkFromRepo(repoUrl, platformVersion, force),
);
