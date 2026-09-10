#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for setupDotnet() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/dotnet-setup-cli.js [force|-] [workloadVersion] [flags]
 *
 * Examples:
 *   node .../dotnet-setup-cli.js                          # Default: check SDK + install workload (skip if exists)
 *   node .../dotnet-setup-cli.js force                    # Force reinstall workload
 *   node .../dotnet-setup-cli.js - 9.0.100                # Specific workload version
 *   node .../dotnet-setup-cli.js - - --no-install-sdk     # Never auto-install a missing .NET SDK
 *   node .../dotnet-setup-cli.js - - --sdk-channel 9.0    # Auto-install channel override
 *
 * Arguments (all optional):
 *   force            - Literal "force" to reinstall workload even if it exists. "-" is a placeholder
 *   workloadVersion  - Tizen workload version to pass to Samsung installer. "-" is a placeholder
 *   --no-install-sdk - Do not auto-install a missing .NET SDK (guidance envelope instead)
 *   --sdk-channel <chan> - .NET SDK channel for the auto-install (script default: 8.0)
 *
 * Workload installation takes several minutes — callers should set Bash tool timeout to 600000ms
 * and run in foreground (installation is idempotent, so retrying on timeout is safe).
 * Codex CLI (one exec call waits ≤ 30 s): add --background and poll job-cli.js wait --id <job_id>.
 *
 * If .NET SDK is not found anywhere, the setup script auto-installs one user-scope
 * (~/.dotnet or %LOCALAPPDATA%\Microsoft\dotnet — no sudo/admin needed) and continues.
 * Only when that is skipped (--no-install-sdk) or fails (offline/proxy) is a
 * dotnet_sdk_not_found failure envelope (exit 1) returned — the user must then
 * install the SDK manually and retry.
 *
 * This file is in a version directory, so sdk-commands is loaded with relative paths.
 * Exit code: success=0, failure/error=1
 */

const { setupDotnet } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

// Flags are honored in ANY argv position — scanning only the tail after the
// two positionals silently dropped `--no-install-sdk` given first, and worse,
// `--sdk-channel 9.0` as args 1-2 was read as force-placeholder + WORKLOAD
// version. Positionals keep their documented order among the non-flag args.
const argv = process.argv.slice(2);
let noInstallSdk = false;
let sdkChannel;
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--no-install-sdk") {
    noInstallSdk = true;
    continue;
  }
  if (argv[i] === "--sdk-channel") {
    // A trailing --sdk-channel with no value must FAIL, not silently fall back
    // to the default channel — '' is rejected by setupDotnet's validation,
    // while undefined (flag absent) skips it. (tizen-cli's commander layer
    // already errors on a missing <channel> value; keep the failure modes aligned.)
    sdkChannel = argv[i + 1] !== undefined ? argv[++i] : "";
    continue;
  }
  positionals.push(argv[i]);
}
const [forceArg, versionArg] = positionals;

const force = forceArg === "force";
const version = versionArg && versionArg !== "-" ? versionArg : undefined;

runCli("tizen-sdk dotnet-setup", () =>
  setupDotnet(force, version, "tizen-sdk dotnet-setup", {
    noInstallSdk,
    sdkChannel,
  }),
);
