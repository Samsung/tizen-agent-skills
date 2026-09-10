#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for manageDevice() execution
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/device-manager-cli.js [start] [timeoutSec] [vmName] [profile]
 *   node <plugin>/lib/cli/device-manager-cli.js stop
 *
 * Examples:
 *   node .../device-manager-cli.js                  # Default values (300 seconds, tizen-vm-default, tizen)
 *   node .../device-manager-cli.js 300 my-tizen-vm
 *   node .../device-manager-cli.js 300 tizen-tv-vm tv   # TV emulator
 *   node .../device-manager-cli.js stop                 # Shut down all running emulator VMs
 *   node .../device-manager-cli.js --action stop        # Same, tizen-cli spelling
 *
 * Arguments (all optional):
 *   action     - 'start' (default; find connected device) or 'stop' (shut down
 *                running emulator VMs). Given as the first bare token or as
 *                `--action <start|stop>` / `--action=<start|stop>`, matching
 *                `tizen-cli tizen-sdk device-manager --action stop`.
 *   timeoutSec - Emulator connection wait time in seconds (1~540; default 300; start only)
 *   vmName     - Emulator VM name to look for (default tizen-vm-default; start only)
 *   profile    - Emulator profile: 'tizen' (default) or 'tv' (Samsung TV)
 *
 * This runner only finds connected devices via sdb. It does NOT create or launch
 * emulators. If no device is found, it returns a device_not_found envelope directing
 * the user to tizen-create-emulator and tizen-launch-emulator.
 *
 * This file is in a version directory, so sdk-commands is loaded with relative paths.
 * Exit code: success=0, failure/error=1
 */

const { manageDevice } = require("../core/sdk-commands");
const { runCli, getFlagValue } = require("./cli-runner");

const ACTIONS = ["start", "stop"];

/**
 * Split argv into { action, positional }.
 *
 * `--action` is honoured anywhere in argv (space or = form) and removed; a bare
 * leading `start`/`stop` is consumed as the action too. Everything left keeps the
 * historical positional order [timeoutSec, vmName, profile], so
 * `node device-manager-cli.js 300 my-vm tv` behaves exactly as before, while
 * `node device-manager-cli.js stop` no longer reads "stop" as the timeout.
 * An unknown action is passed through so manageDevice() reports it as
 * invalid_parameters like every other bad argument.
 */
function parseDeviceManagerArgs(argv) {
  const rest = [...argv];
  let action = "start";

  const flagIdx = rest.findIndex(
    (a) => a === "--action" || a.startsWith("--action="),
  );
  if (flagIdx !== -1) {
    action = getFlagValue(rest, "--action");
    rest.splice(flagIdx, rest[flagIdx] === "--action" && action ? 2 : 1);
  } else if (ACTIONS.includes(rest[0])) {
    action = rest.shift();
  }

  return { action, positional: rest };
}

const { action, positional } = parseDeviceManagerArgs(process.argv.slice(2));
const [timeoutSec, vmName, profile] = positional;

runCli("tizen-sdk device-manager", () =>
  manageDevice(
    timeoutSec === undefined ? undefined : timeoutSec,
    vmName === undefined ? undefined : vmName,
    action,
    profile === undefined ? undefined : profile,
    "tizen-sdk device-manager",
  ),
);
