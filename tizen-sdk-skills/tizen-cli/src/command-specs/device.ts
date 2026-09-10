// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Device interaction commands — discovery/emulator, app install, sdb helper,
 * file transfer, screenshot capture, remote device management.
 */

import { CommandSpec, SERIAL_OPTION, sdkCommands } from "./types";

export const DEVICE_SPECS: CommandSpec[] = [
  {
    name: "create-emulator",
    description:
      "Create a custom Tizen emulator VM with configurable screen size, platform, and profile via em-cli. Also supports listing available platforms/templates/VMs and deleting VMs. Use --size to pick the resolution (default 1080) and --launch to start the VM immediately after creation.",
    options: [
      {
        flags: "--action <action>",
        description:
          "Action: create, list-platform, list-template, list-vm, or delete",
        choices: [
          "create",
          "list-platform",
          "list-template",
          "list-vm",
          "delete",
        ],
        default: "create",
      },
      {
        flags: "--vm-name <name>",
        description:
          "Emulator VM name (required for create and delete actions)",
      },
      {
        flags: "--platform <name>",
        description:
          "Platform image name (auto-detect if omitted for create action)",
      },
      {
        // No commander default on purpose: a default here would silently satisfy
        // the user_input_required gate in createEmulator() and the user would
        // never be asked which size they want.
        flags: "--size <size>",
        description:
          "Screen size to create at: 1080, 720, 3840, or a full resolution like 1920x1080. Required for create — omitting it fails with user_input_required, because the size is a user choice. Use --action list-template to see the sizes this SDK supports.",
      },
      {
        flags: "--assume-defaults",
        description:
          "Use the default size (1080) without asking. For non-interactive runs only — an interactive caller should ask the user instead.",
        default: false,
      },
      {
        flags: "--template <name>",
        description:
          "Exact template name (e.g. 'HD1080 Tizen'). Overrides --size; normally prefer --size.",
      },
      {
        flags: "--profile <profile>",
        description:
          "Emulator profile: tizen (standard) or tv (Samsung TV; requires TV SDK extension)",
        choices: ["tizen", "tv"],
        default: "tizen",
      },
      {
        flags: "--launch",
        description:
          "Launch the VM after creating (create action only). Omit entirely for create-only — do NOT pass --launch false.",
        default: false,
      },
      {
        flags: "--raw-image-path <path>",
        description:
          "Directory holding raw disk images (create only). Creates a VM from a raw disk image instead of a template — skips size/template selection. em-cli prompts for confirmation; the runner auto-answers 'y'.",
      },
    ],
    handler: (o) =>
      sdkCommands.createEmulator(
        {
          action: o.action,
          vmName: o.vmName,
          platform: o.platform,
          template: o.template,
          size: o.size,
          assumeDefaults: o.assumeDefaults,
          profile: o.profile,
          launch: o.launch,
          rawImagePath: o.rawImagePath,
        },
        "tizen-sdk create-emulator",
      ),
  },

  {
    name: "launch-emulator",
    description:
      "Launch an existing Tizen emulator VM via em-cli. If no VM name is given, launches the first VM from the list. Waits for the emulator to connect via sdb (cold boot can take minutes).",
    options: [
      {
        flags: "--vm-name <name>",
        description:
          "Emulator VM name to launch (default: first VM from em-cli list-vm)",
      },
      {
        flags: "--timeout <seconds>",
        description:
          "Max seconds to wait for the VM to appear in sdb devices (1-540). Returns as soon as it connects; does NOT stop the emulator when the time is up",
        default: "300",
      },
    ],
    handler: (o) =>
      sdkCommands.launchEmulator(
        {
          vmName: o.vmName,
          timeoutSec: o.timeout,
        },
        "tizen-sdk launch-emulator",
      ),
  },

  {
    // The full em-cli surface in one command. create-emulator and launch-emulator
    // above stay as-is: their names are public interface (MCP tool names, SKILL.md
    // examples) and must not be renamed casually — see command-specs/index.ts.
    name: "emulator-manager",
    description:
      "Manage Tizen emulator VMs across the full em-cli surface: create, delete, launch, list platforms/templates/VMs, inspect one VM or the emulator manager, modify an existing VM's template/RAM/skin/acceleration, reset a VM's disk, capture a VM as a platform image, and re-apply the WSL home screen fix to a running VM. Use --action detail or --action list-vm --detail to read an existing VM's screen size and RAM.",
    options: [
      {
        flags: "--action <action>",
        description: "Action to perform",
        choices: [
          "create",
          "delete",
          "launch",
          "list-vm",
          "list-platform",
          "list-template",
          "detail",
          "modify",
          "reset",
          "create-image",
          // Keep in sync with MANAGE_ACTIONS in common/lib/core/emulator.js —
          // commander rejects any --action outside this list before the handler
          // runs, so an action missing here is unreachable from the CLI.
          "fix-homescreen",
        ],
        default: "create",
      },
      {
        flags: "--vm-name <name>",
        description:
          "Emulator VM name. Required for create, delete, modify, reset, and create-image. Optional for detail (omit to report the emulator manager itself) and launch (omit to use the first VM).",
      },
      {
        // No commander default on purpose: a default here would silently satisfy
        // the user_input_required gate in createEmulator() and the user would
        // never be asked which size they want.
        flags: "--size <size>",
        description:
          "Screen size: 1080, 720, 3840, or a full resolution like 1920x1080. Required for create — omitting it fails with user_input_required, because the size is a user choice. Also accepted by modify. Use --action list-template --detail to see the sizes this SDK supports.",
      },
      {
        flags: "--assume-defaults",
        description:
          "Use the default size (1080) without asking (create). For non-interactive runs only — an interactive caller should ask the user instead.",
        default: false,
      },
      {
        flags: "--template <name>",
        description:
          "Exact template name, e.g. 'HD1080 Tizen' (create, modify). Overrides --size; normally prefer --size.",
      },
      {
        flags: "--platform <name>",
        description:
          "Platform image name (auto-detected for create; filters list-vm --detail and list-template)",
      },
      {
        flags: "--profile <profile>",
        description:
          "Emulator profile: tizen (standard) or tv (Samsung TV; requires TV SDK extension)",
        choices: ["tizen", "tv"],
        default: "tizen",
      },
      {
        flags: "--launch",
        description:
          "Launch the VM after creating (create only). Omit entirely for create-only — do NOT pass --launch false.",
        default: false,
      },
      {
        flags: "--skin <number>",
        description:
          "Skin style (create, modify): 1 general-purpose, 2 profile-specific",
        choices: ["1", "2"],
      },
      {
        flags: "--ram-size <mib>",
        description: "RAM size in MiB (create, modify)",
        choices: ["512", "768", "1024"],
      },
      {
        flags: "--file-sharing-path <path>",
        description: "Host directory shared with the VM (create, modify)",
      },
      {
        flags: "--hw-virtualization <yes|no>",
        description: "Enable CPU virtualization (create, modify)",
        choices: ["yes", "no"],
      },
      {
        flags: "--hw-gl-acceleration <yes|no>",
        description: "Enable hardware GL acceleration (create, modify)",
        choices: ["yes", "no"],
      },
      {
        flags: "--custom-path <path>",
        description: "Custom base disk image path (create only)",
      },
      {
        flags: "--raw-image-path <path>",
        description: "Directory holding raw disk images (create only)",
      },
      {
        flags: "--output-dir <path>",
        description:
          "Destination directory for create-image. em-cli will NOT create it — the directory must already exist.",
      },
      {
        flags: "--compress",
        description: "Compress the created image (create-image only)",
        default: false,
      },
      {
        flags: "--confirm",
        description:
          "Required for reset, which formats the VM's disk image and deletes every app installed on it. Without it, reset fails with user_input_required so the user gets asked first.",
        default: false,
      },
      {
        flags: "--detail",
        description:
          "Report full per-record detail for list-vm, list-platform, and list-template. This is where an existing VM's resolution and RAM come from.",
        default: false,
      },
      {
        flags: "--count",
        description:
          "Report only the number of VMs (list-vm only; takes precedence over --detail, matching em-cli)",
        default: false,
      },
      {
        flags: "--timeout <seconds>",
        description: "Emulator connection wait time in seconds (launch; 1-540)",
        default: "300",
      },
      {
        flags: "--emulator-path <path>",
        description: "Directory of the emulator program (launch only)",
      },
    ],
    handler: (o) =>
      sdkCommands.manageEmulator(
        {
          action: o.action,
          vmName: o.vmName,
          platform: o.platform,
          template: o.template,
          size: o.size,
          assumeDefaults: o.assumeDefaults,
          profile: o.profile,
          launch: o.launch,
          skin: o.skin,
          ramSize: o.ramSize,
          fileSharingPath: o.fileSharingPath,
          hwVirtualization: o.hwVirtualization,
          hwGlAcceleration: o.hwGlAcceleration,
          customPath: o.customPath,
          rawImagePath: o.rawImagePath,
          outputDir: o.outputDir,
          compress: o.compress,
          confirm: o.confirm,
          detail: o.detail,
          count: o.count,
          timeoutSec: o.timeout,
          emulatorPath: o.emulatorPath,
        },
        `tizen-sdk emulator-manager ${o.action}`,
      ),
  },

  {
    name: "device-manager",
    description:
      "Find a connected Tizen device via sdb. Does NOT create or launch emulators — use create-emulator and launch-emulator for that. Use --action stop to shut down all running emulator VMs. Use --profile tv to look for a Samsung TV emulator.",
    options: [
      {
        flags: "--action <action>",
        description:
          "Action: start (find connected device) or stop (shut down emulators)",
        choices: ["start", "stop"],
        default: "start",
      },
      {
        flags: "--timeout <seconds>",
        description: "Emulator connection wait time in seconds (1-540)",
        default: "300",
      },
      {
        flags: "--vm-name <name>",
        description: "Emulator VM name to look for",
        default: "tizen-vm-default",
      },
      {
        flags: "--profile <profile>",
        description:
          "Emulator profile: tizen (standard) or tv (Samsung TV; requires TV SDK extension)",
        choices: ["tizen", "tv"],
        default: "tizen",
      },
    ],
    handler: (o) =>
      sdkCommands.manageDevice(
        o.timeout,
        o.vmName,
        o.action,
        o.profile,
        "tizen-sdk device-manager",
      ),
  },

  {
    name: "install-app",
    description:
      "Install a .tpk/.wgt/.rpk/.rpm package on a connected device or emulator. RPK is installed directly with sdb and cannot be launched.",
    collectAllMissing: true,
    options: [
      {
        flags: "--package <path>",
        description: "Absolute path to the .tpk/.wgt/.rpk/.rpm package",
        required: true,
      },
      SERIAL_OPTION,
      {
        flags: "--run",
        description:
          "Launch the app after installation. Omit entirely for install-only — do NOT pass --run false.",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.installApp(
        o.package,
        o.serial,
        !!o.run,
        "tizen-sdk install-app",
      ),
  },
  {
    name: "sdb-helper",
    description:
      "Run the correct sdb command for a Tizen device based on a natural-language request (log capture, shell, port forward, reboot, etc.)",
    collectAllMissing: true,
    options: [
      {
        flags: "--request <text>",
        description:
          'Natural-language sdb request (e.g., "tail the logs", "open a shell", "forward port 9229")',
        required: true,
      },
      SERIAL_OPTION,
    ],
    handler: (o) =>
      sdkCommands.runSdbCommand(o.request, o.serial, "tizen-sdk sdb-helper"),
  },
  {
    name: "screenshot",
    description:
      "Capture a screenshot from a Tizen emulator or device with automatic fallback methods (host-side xwd for emulators, framebuffer for physical devices)",
    options: [
      SERIAL_OPTION,
      {
        flags: "--output <path>",
        description: "Output PNG path (default: ./emulator_screenshot.png)",
      },
    ],
    handler: (o) =>
      sdkCommands.captureScreenshot(
        o.serial || null,
        o.output || null,
        "tizen-sdk screenshot",
      ),
  },
  {
    name: "file-transfer",
    description:
      "Push (host→device) or pull (device→host) files/directories via sdb — result contains bytes_transferred and device_serial",
    collectAllMissing: true,
    options: [
      {
        flags: "--direction <dir>",
        description:
          "Transfer direction: push (host→device) or pull (device→host)",
        required: true,
      },
      {
        flags: "--remote <path>",
        description: "Remote (device) file/directory path",
        required: true,
      },
      {
        flags: "--local <path>",
        description:
          "Local (host) file/directory path (required for push; defaults to '.' for pull)",
      },
      SERIAL_OPTION,
      {
        flags: "--with-utf8",
        description: "Handle UTF-8 encoded paths",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.fileTransfer(
        o.direction,
        o.local,
        o.remote,
        o.serial,
        !!o.withUtf8,
        "tizen-sdk file-transfer",
      ),
  },
  {
    name: "remote-device",
    description:
      "Search the local network for Tizen devices (TCP sweep of SDB port 26101), connect/disconnect them via sdb over the network, and manage Device Manager's bookmarked remote device list (add/edit/remove)",
    options: [
      {
        flags: "--action <action>",
        description: "Action to perform",
        choices: [
          "scan",
          "connect",
          "disconnect",
          "list",
          "add",
          "remove",
          "edit",
          "list-saved",
        ],
        default: "scan",
      },
      {
        flags: "--ip <ip>",
        description:
          "Device IPv4 address (required for connect/disconnect/add/remove/edit; for edit this identifies the existing bookmark)",
      },
      {
        flags: "--subnet <prefix>",
        description:
          'Subnet /24 prefix to scan, e.g. "192.168.1" (scan only; omit to scan all local subnets)',
      },
      { flags: "--port <port>", description: "SDB port", default: "26101" },
      {
        flags: "--timeout <ms>",
        description:
          "Per-host TCP timeout in milliseconds (scan only, 100-30000)",
        default: "3000",
      },
      {
        flags: "--name <name>",
        description:
          "Display name to bookmark the device under (required for add; the new name for edit)",
      },
      {
        flags: "--new-ip <ip>",
        description: "Move the bookmark to this IPv4 address (edit only)",
      },
      {
        flags: "--new-port <port>",
        description: "Move the bookmark to this SDB port (edit only)",
      },
    ],
    handler: (o) => {
      switch (o.action) {
        case "connect":
          return sdkCommands.connectRemoteDevice(
            o.ip,
            o.port,
            "tizen-sdk remote-device connect",
          );
        case "disconnect":
          return sdkCommands.disconnectRemoteDevice(
            o.ip,
            o.port,
            "tizen-sdk remote-device disconnect",
          );
        case "list":
          return sdkCommands.listRemoteDevices("tizen-sdk remote-device list");
        case "add":
          return sdkCommands.addRemoteDeviceToList(
            o.name,
            o.ip,
            o.port,
            "tizen-sdk remote-device add",
          );
        case "remove":
          return sdkCommands.removeRemoteDeviceFromList(
            o.ip,
            o.port,
            "tizen-sdk remote-device remove",
          );
        case "edit":
          return sdkCommands.editRemoteDeviceInList(
            o.ip,
            o.port,
            o.name,
            o.newIp,
            o.newPort,
            "tizen-sdk remote-device edit",
          );
        case "list-saved":
          return sdkCommands.listSavedRemoteDevices(
            "tizen-sdk remote-device list-saved",
          );
        default:
          return sdkCommands.scanRemoteDevices(
            o.subnet,
            o.port,
            o.timeout,
            "tizen-sdk remote-device scan",
          );
      }
    },
  },
];
