// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Remote debugging commands — GDB (Native), netcoredbg (.NET), and RWI/CDP (Web).
 */

import { CommandSpec, sdkCommands } from "./types";

export const DEBUG_SPECS: CommandSpec[] = [
  {
    name: "gdb-debug",
    description:
      "Set up remote GDB debugging for a Tizen Native app (setup-only: prepares gdbserver + port forward; paste result.gdb_command into your terminal)",
    collectAllMissing: true,
    options: [
      {
        flags: "--app-id <id>",
        description: "Tizen package ID (e.g., org.example.myapp)",
        required: true,
      },
      {
        flags: "--binary <path>",
        description:
          "Host binary path with debug symbols (approximate paths are auto-searched)",
        required: true,
      },
      {
        flags: "--mode <mode>",
        description: "Debug mode",
        choices: ["attach", "launch"],
        default: "attach",
      },
      {
        flags: "--breakpoints <list>",
        description:
          'Comma-separated breakpoint function names (e.g., "main,service_app_create")',
      },
      { flags: "--port <port>", description: "Debug port", default: "5039" },
      {
        flags: "--timeout <seconds>",
        description: "PID search wait time in seconds (1-300, attach mode)",
        default: "30",
      },
    ],
    handler: (o) =>
      sdkCommands.setupGdbDebug(
        o.appId,
        o.binary,
        {
          launch: o.mode === "launch",
          breakpoints: o.breakpoints || "",
          port: o.port,
          timeout: o.timeout,
        },
        "tizen-sdk gdb-debug",
      ),
  },
  {
    name: "dotnet-debug",
    description:
      "Set up remote .NET debugging with netcoredbg (setup-only: use result.debug_command or result.launch_config)",
    collectAllMissing: true,
    options: [
      {
        flags: "--app-id <id>",
        description: "Tizen package ID (e.g., org.tizen.example.MyApp)",
        required: true,
      },
      {
        flags: "--mode <mode>",
        description:
          "Debug mode. launch (default, recommended): app starts under a netcoredbg DAP server, suspended before Main() and showing no UI until VS Code connects. attach: usually fails on Tizen (no CoreCLR debug transport)",
        choices: ["attach", "launch"],
        default: "launch",
      },
      {
        flags: "--breakpoints <list>",
        description:
          'Comma-separated File.cs:line breakpoints (e.g., "Program.cs:25,App.cs:10")',
      },
      {
        flags: "--port <port>",
        description: "DAP server port (launch mode)",
        default: "4711",
      },
      {
        flags: "--serial <serial>",
        description: "Device serial (default: first connected device)",
      },
      {
        flags: "--force-install",
        description: "Reinstall netcoredbg on the device",
        default: false,
      },
      {
        flags: "--timeout <seconds>",
        description: "PID search wait time in seconds (1-300, attach mode)",
        default: "30",
      },
    ],
    handler: (o) =>
      sdkCommands.setupDotnetDebug(
        o.appId,
        {
          launch: o.mode === "launch",
          breakpoints: o.breakpoints || "",
          port: o.port,
          serial: o.serial,
          forceInstall: !!o.forceInstall,
          timeout: o.timeout,
        },
        "tizen-sdk dotnet-debug",
      ),
  },
  {
    name: "webapp-debug",
    description:
      "Set up remote Web app debugging via RWI/CDP (setup-only: verifies the CDP endpoint; use result.cdp_endpoint / result.connect snippets)",
    collectAllMissing: true,
    options: [
      {
        flags: "--app-id <id>",
        description: "Tizen web app ID (e.g., abcDEF1234.MyWebApp)",
        required: true,
      },
      {
        flags: "--port <port>",
        description: "Host port forwarded to the device RWI port",
        default: "9222",
      },
      {
        flags: "--serial <serial>",
        description: "Device serial (default: first connected device)",
      },
      {
        flags: "--timeout <seconds>",
        description: "CDP endpoint readiness timeout in seconds (1-300)",
        default: "30",
      },
    ],
    handler: (o) =>
      sdkCommands.setupWebappDebug(
        o.appId,
        {
          port: o.port,
          serial: o.serial,
          timeout: o.timeout,
        },
        "tizen-sdk webapp-debug",
      ),
  },
];
