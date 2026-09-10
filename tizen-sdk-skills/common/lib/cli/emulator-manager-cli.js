#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for the Tizen emulator manager — the full em-cli surface.
 *
 * Supersedes create-emulator-cli.js and launch-emulator-cli.js: every action
 * they had is here, plus detail, modify, reset, create-image, and the hardware
 * options (skin, RAM, file sharing, CPU/GL acceleration) em-cli accepts.
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/emulator-manager-cli.js <action> [options]
 *
 * Examples:
 *   node .../emulator-manager-cli.js list-vm --detail            # existing VMs, with their sizes
 *   node .../emulator-manager-cli.js list-template --detail      # the sizes this SDK can create
 *   node .../emulator-manager-cli.js list-platform --detail
 *   node .../emulator-manager-cli.js detail                      # emulator manager version/workspace
 *   node .../emulator-manager-cli.js detail --vm-name my-vm      # one VM's resolution, RAM, skin
 *   node .../emulator-manager-cli.js create --vm-name my-vm --size 1080
 *   node .../emulator-manager-cli.js create --vm-name my-vm --size 720 --ram-size 1024 --hw-gl-acceleration no
 *   node .../emulator-manager-cli.js create --vm-name my-tv-vm --profile tv --size 3840
 *   node .../emulator-manager-cli.js create --vm-name my-vm --size 1080 --launch
 *   node .../emulator-manager-cli.js modify --vm-name my-vm --size 1080
 *   node .../emulator-manager-cli.js modify --vm-name my-vm --ram-size 512 --file-sharing-path /home/me/share
 *   node .../emulator-manager-cli.js launch --vm-name my-vm --timeout 300
 *   node .../emulator-manager-cli.js reset --vm-name my-vm --confirm
 *   node .../emulator-manager-cli.js create-image --vm-name my-vm --output-dir /tmp/images --compress
 *   node .../emulator-manager-cli.js delete --vm-name my-vm
 *
 * Actions:
 *   create (default) | delete | launch | list-vm | list-platform | list-template |
 *   detail | modify | reset | create-image
 *
 * Options:
 *   --vm-name <name>        Emulator VM name. Required for every action except
 *                           detail (where omitting it reports the emulator
 *                           manager itself) and the list-* actions.
 *   --size <size>           Screen size: 1080, 720, 3840, or 1920x1080. REQUIRED for
 *                           create. Resolved to the matching device template — em-cli
 *                           has no width/height flag. Also accepted by modify.
 *                           Omitting it on create fails with 'user_input_required':
 *                           the size is a user choice, so ask rather than defaulting.
 *   --assume-defaults       Use the default size (1080) without asking. Non-interactive
 *                           runs only — an interactive caller should ask the user.
 *   --template <name>       Exact template name; overrides --size
 *   --platform <name>       Platform image name; auto-detected for create
 *   --profile <profile>     tizen (default) or tv
 *   --launch                Launch the VM after creating (create only)
 *   --skin <1|2>            Skin style: 1 general-purpose, 2 profile-specific
 *   --ram-size <mib>        RAM: 512, 768, or 1024
 *   --file-sharing-path <p> Host directory shared with the VM
 *   --hw-virtualization <yes|no>
 *   --hw-gl-acceleration <yes|no>
 *   --custom-path <path>    Custom base disk image (create only)
 *   --raw-image-path <path> Directory holding raw disk images (create only)
 *   --output-dir <path>     Destination for create-image. em-cli will NOT create it.
 *   --compress              Compress the created image (create-image only)
 *   --confirm               REQUIRED for reset, which formats the VM's disk and
 *                           deletes every app installed on it
 *   --detail                Detail mode for the list-* actions
 *   --count                 Print only the VM count (list-vm only)
 *   --timeout <seconds>     Launch: max seconds to WAIT for the VM to appear in sdb devices
 *                           (1-540; default 300). Returns as soon as it connects; does NOT
 *                           stop the emulator when the time is up (issue #98)
 *   --emulator-path <path>  Directory of the emulator program (launch only)
 *
 * This file is in a version directory, so sdk-commands is loaded with relative paths.
 * Exit code: success=0, failure/error=1
 */

const { manageEmulator } = require("../core/sdk-commands");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk emulator";

const USAGE =
  "Usage: node emulator-manager-cli.js <action> [options]. Actions: create, delete, " +
  "launch, list-vm, list-platform, list-template, detail, modify, reset, create-image, " +
  "fix-homescreen. " +
  "create --vm-name <name> --size 1080|720|3840|1920x1080 [--assume-defaults] " +
  "[--platform <name>] [--template <name>] [--profile tizen|tv] [--launch] " +
  "[--skin 1|2] [--ram-size 512|768|1024] [--file-sharing-path <path>] " +
  "[--hw-virtualization yes|no] [--hw-gl-acceleration yes|no] " +
  "[--custom-path <path>] [--raw-image-path <path>] | " +
  "delete --vm-name <name> | " +
  "launch [--vm-name <name>] [--timeout <sec>] [--emulator-path <path>] | " +
  "list-vm [--detail] [--count] [--platform <name>] [--profile tizen|tv] | " +
  "list-platform|list-template [--detail] [--profile tizen|tv] [--platform <name>] | " +
  "detail [--vm-name <name>] | " +
  "modify --vm-name <name> (--size <size> | --template <name> | --skin 1|2 | " +
  "--ram-size <mib> | --file-sharing-path <path> | --hw-virtualization yes|no | " +
  "--hw-gl-acceleration yes|no) | " +
  "reset --vm-name <name> --confirm | " +
  "create-image --vm-name <name> [--output-dir <path>] [--compress]";

const usageError = (message) => exitWithUsageError(COMMAND, USAGE, message);

const args = process.argv.slice(2);

const OPTION_FLAGS = {
  "--vm-name": "vmName",
  "--platform": "platform",
  "--template": "template",
  "--size": "size",
  "--profile": "profile",
  "--skin": "skin",
  "--ram-size": "ramSize",
  "--file-sharing-path": "fileSharingPath",
  "--hw-virtualization": "hwVirtualization",
  "--hw-gl-acceleration": "hwGlAcceleration",
  "--custom-path": "customPath",
  "--raw-image-path": "rawImagePath",
  "--output-dir": "outputDir",
  "--timeout": "timeoutSec",
  "--emulator-path": "emulatorPath",
};
const BOOLEAN_FLAGS = {
  "--launch": "launch",
  "--assume-defaults": "assumeDefaults",
  "--compress": "compress",
  "--confirm": "confirm",
  "--detail": "detail",
  "--count": "count",
};

const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  args,
  OPTION_FLAGS,
  BOOLEAN_FLAGS,
);

const [action = "create", ...extraPositionals] = positional;
if (extraPositionals.length > 0) {
  usageError(`Unexpected argument(s): ${extraPositionals.join(" ")}`);
}

// Actions that cannot do anything without a VM to act on. detail is absent on
// purpose: with no --vm-name it reports the emulator manager itself. launch is
// absent too: it falls back to the first VM from list-vm.
const VM_NAME_REQUIRED = [
  "create",
  "delete",
  "modify",
  "reset",
  "create-image",
];

switch (action) {
  case "create":
  case "delete":
  case "launch":
  case "list-vm":
  case "list-platform":
  case "list-template":
  case "detail":
  case "modify":
  case "reset":
  case "create-image":
  case "fix-homescreen": // needs no --vm-name: defaults to the connected emulator
    if (VM_NAME_REQUIRED.includes(action) && !options.vmName) {
      usageError(`${action} requires --vm-name`);
    }
    runCli(COMMAND, () =>
      manageEmulator({ ...options, action }, `${COMMAND} ${action}`),
    );
    break;
  default:
    usageError(action ? `Unknown action: ${action}` : "Missing action");
}
