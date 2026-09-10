#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for remote device search / connect / disconnect / list / bookmarks
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/remote-device-cli.js <scan|connect|disconnect|list|add|remove|edit|list-saved> [args]
 *
 * Examples:
 *   node .../remote-device-cli.js scan                          # sweep all local /24 subnets, port 26101
 *   node .../remote-device-cli.js scan 192.168.1                # sweep a specific subnet
 *   node .../remote-device-cli.js scan 192.168.1 --port 26101 --timeout 3000
 *   node .../remote-device-cli.js connect 192.168.1.100         # sdb connect 192.168.1.100:26101
 *   node .../remote-device-cli.js connect 192.168.1.100 --port 26102
 *   node .../remote-device-cli.js disconnect 192.168.1.100
 *   node .../remote-device-cli.js list                          # remote (<ip>:<port>) entries of sdb devices
 *   node .../remote-device-cli.js add 192.168.1.100 --name "Living Room TV"  # bookmark in Device Manager's list
 *   node .../remote-device-cli.js remove 192.168.1.100          # remove that bookmark
 *   node .../remote-device-cli.js edit 192.168.1.100 --name "Bedroom TV"     # rename the bookmark
 *   node .../remote-device-cli.js edit 192.168.1.100 --new-ip 192.168.1.55   # re-point it at another address
 *   node .../remote-device-cli.js list-saved                    # read back the bookmarked list
 *
 * Arguments:
 *   action     - scan | connect | disconnect | list | add | remove | edit | list-saved (required)
 *   subnet     - scan only (optional): /24 prefix like "192.168.1"; omit to scan all local subnets
 *   ip         - connect/disconnect/add/remove/edit (required): device IPv4 address
 *                (for edit this is the CURRENT address, used to find the bookmark)
 *   --port     - SDB port (optional, default 26101); for edit, the bookmark's current port
 *   --timeout  - scan only (optional): per-host TCP timeout in ms (default 3000)
 *   --name     - add (required) / edit (optional): display name to bookmark the device under
 *   --new-ip   - edit only (optional): move the bookmark to this IPv4 address
 *   --new-port - edit only (optional): move the bookmark to this SDB port
 *
 * `edit` needs at least one of --name / --new-ip / --new-port.
 *
 * Note: `scan` needs no SDK (pure TCP sweep); connect/disconnect/list need
 * sdb, i.e. an installed SDK with tizen-sdk-init done. `add`/`remove`/`edit`/
 * `list-saved` read/write Device Manager's remote_device_scan.list directly and
 * do not need sdb.
 *
 * Exit code: success=0, failure/error=1
 */

const {
  scanRemoteDevices,
  connectRemoteDevice,
  disconnectRemoteDevice,
  listRemoteDevices,
  addRemoteDeviceToList,
  removeRemoteDeviceFromList,
  editRemoteDeviceInList,
  listSavedRemoteDevices,
} = require("../core/sdk-commands");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk remote-device";

const USAGE =
  "Usage: node remote-device-cli.js <scan|connect|disconnect|list|add|remove|edit|list-saved> [subnet|ip] " +
  "[--port N] [--timeout MS] [--name NAME] [--new-ip IP] [--new-port N]";

const usageError = (message) => exitWithUsageError(COMMAND, USAGE, message);

const OPTION_FLAGS = {
  "--port": "port",
  "--timeout": "timeout",
  "--name": "name",
  "--new-ip": "newIp",
  "--new-port": "newPort",
};

const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  process.argv.slice(2),
  OPTION_FLAGS,
);
let { port } = options;
const { timeout, name, newIp, newPort } = options;

let [action, target] = positional;

// Convenience: accept "ip:port" as a single argument for connect/disconnect/add/remove/edit
if (
  ["connect", "disconnect", "add", "remove", "edit"].includes(action) &&
  target &&
  target.includes(":")
) {
  const [ip, inlinePort] = target.split(":");
  target = ip;
  if (port === undefined) port = inlinePort;
}

switch (action) {
  case "scan":
    runCli("tizen-sdk remote-device scan", () =>
      scanRemoteDevices(
        target,
        port === undefined ? undefined : port,
        timeout === undefined ? undefined : timeout,
        "tizen-sdk remote-device scan",
      ),
    );
    break;
  case "connect":
    if (!target) usageError("connect requires an IP address");
    runCli("tizen-sdk remote-device connect", () =>
      connectRemoteDevice(
        target,
        port === undefined ? undefined : port,
        "tizen-sdk remote-device connect",
      ),
    );
    break;
  case "disconnect":
    if (!target) usageError("disconnect requires an IP address");
    runCli("tizen-sdk remote-device disconnect", () =>
      disconnectRemoteDevice(
        target,
        port === undefined ? undefined : port,
        "tizen-sdk remote-device disconnect",
      ),
    );
    break;
  case "list":
    runCli("tizen-sdk remote-device list", () =>
      listRemoteDevices("tizen-sdk remote-device list"),
    );
    break;
  case "add":
    if (!target) usageError("add requires an IP address");
    if (!name) usageError("add requires --name");
    runCli("tizen-sdk remote-device add", () =>
      addRemoteDeviceToList(
        name,
        target,
        port === undefined ? undefined : port,
        "tizen-sdk remote-device add",
      ),
    );
    break;
  case "remove":
    if (!target) usageError("remove requires an IP address");
    runCli("tizen-sdk remote-device remove", () =>
      removeRemoteDeviceFromList(
        target,
        port === undefined ? undefined : port,
        "tizen-sdk remote-device remove",
      ),
    );
    break;
  case "edit":
    if (!target) usageError("edit requires an IP address");
    if (name === undefined && newIp === undefined && newPort === undefined) {
      usageError(
        "edit requires at least one of --name, --new-ip or --new-port",
      );
    }
    runCli("tizen-sdk remote-device edit", () =>
      editRemoteDeviceInList(
        target,
        port === undefined ? undefined : port,
        name,
        newIp,
        newPort,
        "tizen-sdk remote-device edit",
      ),
    );
    break;
  case "list-saved":
    runCli("tizen-sdk remote-device list-saved", () =>
      listSavedRemoteDevices("tizen-sdk remote-device list-saved"),
    );
    break;
  default:
    usageError(action ? `Unknown action: ${action}` : "Missing action");
}
