// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Shared types and constants for the declarative command specs.
 *
 * Each domain module (sdk.ts, project.ts, device.ts, debug.ts) exports a
 * CommandSpec[]; index.ts concatenates them into COMMAND_SPECS, which
 * commands.ts turns into real Commander commands via registerCommand().
 *
 * NOTE: the schema generator introspects OPTIONS only (not positional
 * arguments), so every parameter is exposed as a named option.
 */

// Shared CommonJS core (common/lib) — inlined into the bundle by esbuild.

export const sdkCommands = require("../../../common/lib/core/sdk-commands");

export interface OptionSpec {
  /** Commander flags string, e.g. "--sdk-path <path>" or "--force" */
  flags: string;
  description: string;
  /**
   * Marks the option as required. With `collectAllMissing` on the command,
   * the option stays non-mandatory in Commander and the action reports ALL
   * missing options at once; otherwise it becomes a Commander mandatory
   * option (fails on the first missing one).
   */
  required?: boolean;
  default?: string | boolean;
  choices?: string[];
  /** Per-option hint used in the collectAllMissing error message (defaults to description). */
  missingHint?: string;
}

export interface CommandSpec {
  /** Command name. New commands: use domain-action naming (see index.ts). */
  name: string;
  description: string;
  options?: OptionSpec[];
  /**
   * Collect ALL missing required options and fail with a single envelope
   * (Commander's requiredOption stops at the first missing one).
   */
  collectAllMissing?: boolean;
  /**
   * If false, the command is always available (no Tizen SDK required).
   * If true or omitted, the command requires the Tizen SDK to be installed
   * (used by --capabilities to partition commands into available/unavailable).
   */
  requiresSdk?: boolean;
  /** Maps parsed options to the core function call. Returns the inner envelope. */
  handler: (_opts: Record<string, any>) => Promise<any>;
}

export const PROJECT_TYPES = [
  "native",
  "dotnet",
  "webapp",
  "rpk",
  "tv",
  "platform",
];

export const SERIAL_OPTION: OptionSpec = {
  flags: "--serial <serial>",
  description:
    "Target device serial (omit to auto-select the single connected device)",
};
