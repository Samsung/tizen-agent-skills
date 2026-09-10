// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Pre-flight environment check commands — verify prerequisites before SDK
 * install or other workflows.
 *
 * Related: the `--doctor` meta-command (src/doctor.ts) runs a broader
 * environment probe (Node, shell, scripts dir, SDK, sdb) as a plugin-level
 * health check; the commands here are individual checks exposed as regular
 * commands with their own envelopes.
 */

import { CommandSpec, sdkCommands } from "./types";

export const CHECK_SPECS: CommandSpec[] = [
  {
    name: "check-node",
    description:
      "Verify Node.js is installed and on PATH (pre-check before SDK install)",
    requiresSdk: false,
    handler: () => sdkCommands.checkNode("tizen-sdk check-node"),
  },
  {
    name: "check-disk-space",
    description: "Verify available disk space before SDK installation",
    requiresSdk: false,
    options: [
      {
        flags: "--path <dir>",
        description: "Target directory/drive to check (default: home drive)",
      },
      {
        flags: "--required-gb <gb>",
        description: "Required free space in GB",
        default: "15",
      },
    ],
    handler: (o) =>
      sdkCommands.checkDiskSpace(
        o.path || null,
        parseFloat(o.requiredGb),
        "tizen-sdk check-disk-space",
      ),
  },
];
