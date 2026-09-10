// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Automated testing commands — Playwright over CDP (Web apps only).
 *
 * The runner reuses the webapp-debug setup for the device half, then spawns
 * `node <test-file>` in the test project directory. Playwright resolves from
 * the TEST PROJECT's node_modules — never from this plugin (it cannot be
 * bundled), so the project needs its own `npm install playwright`.
 */

import { CommandSpec, sdkCommands } from "./types";

export const TEST_SPECS: CommandSpec[] = [
  {
    name: "playwright-test",
    description:
      "Run (or scaffold with --scaffold) a Playwright test against a Tizen Web app over CDP — sets up RWI/CDP via the webapp-debug flow, then runs `node <test-file>` in the test project (playwright must be npm-installed there)",
    options: [
      {
        flags: "--app-id <id>",
        description:
          "Tizen web app ID (required for a run; optional for --scaffold)",
      },
      {
        flags: "--test-file <path>",
        description:
          "Test script (default: <project-dir>/tizen-playwright.test.js)",
      },
      {
        flags: "--project-dir <path>",
        description:
          "Test project dir (cwd for the run; needs playwright in node_modules)",
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
        flags: "--setup-timeout <seconds>",
        description: "CDP setup readiness timeout in seconds (1-300)",
        default: "30",
      },
      {
        flags: "--timeout <seconds>",
        description: "Test run timeout in seconds (1-600)",
        default: "120",
      },
      {
        // Commander negated flag: parses into opts.setup (implied default
        // true), NOT opts.noSetup — never give it an explicit default, which
        // would override the negation semantics and make the flag a no-op.
        flags: "--no-setup",
        description:
          "Reuse an already-live CDP endpoint (skip the debug-mode relaunch + port forward)",
      },
      {
        flags: "--scaffold",
        description:
          "Generate tizen-playwright.test.js (+package.json) into --project-dir and exit (no run)",
        default: false,
      },
      {
        flags: "--force",
        description:
          "Overwrite an existing scaffolded test file (with --scaffold)",
        default: false,
      },
    ],
    handler: (o) =>
      o.scaffold
        ? sdkCommands.scaffoldPlaywrightTest(
            {
              projectDir: o.projectDir,
              appId: o.appId,
              port: o.port,
              force: !!o.force,
            },
            "tizen-sdk playwright-test scaffold",
          )
        : sdkCommands.runPlaywrightTest(
            o.appId,
            {
              serial: o.serial,
              port: o.port,
              setupTimeout: o.setupTimeout,
              timeout: o.timeout,
              testFile: o.testFile,
              projectDir: o.projectDir,
              skipSetup: o.setup === false,
            },
            "tizen-sdk playwright-test run",
          ),
  },
];
