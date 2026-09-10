// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * tizen-sdk Plugin Entry Point (tizen-cli harness of tizen-sdk-skills)
 *
 * This file is bundled by esbuild into dist/tizen-sdk.js (pure JS).
 * Core require()s the bundled file and calls plugin.run(args).
 *
 * The run() function handles all four required plugin interfaces:
 *   1. --schema       — Return command catalog (auto-generated from commander)
 *   2. <command>      — Execute & return envelope
 *   3. --doctor       — Return env checks
 *   4. --capabilities — Return available commands
 *
 * The plugin runs IN-PROCESS inside tizen-cli — failure is signalled only
 * through run()'s return value (never process.exit()).
 */

import { outputEnvelope, debugLog } from "./lib/core-utils";
import {
  generateSchemaFromProgram,
  getCommandNames,
} from "./lib/schema-generator";
import { buildProgram } from "./commands";
import {
  resetFailure,
  didFail,
  setUserCommand,
  clearUserCommand,
  withUserCommand,
} from "./envelope-adapter";
import { handleDoctor, handleCapabilities } from "./doctor";
import pkg = require("../package.json");

const PLUGIN_NAME = "tizen-sdk";
const PLUGIN_VERSION = pkg.version;

// Derived from the Commander program so the list can never drift from the
// actually registered commands (see COMMAND_SPECS in commands.ts).
const COMMANDS = getCommandNames(buildProgram());

/**
 * Plugin entry point. Called by Core's dispatcher.
 *
 * @param args - Full args including the command name (e.g., ["build-project", "--project", "C:/ws/MyApp"])
 * @returns Promise<{ status: 'success' | 'failure' }>
 */
async function run(args: string[]): Promise<{ status: "success" | "failure" }> {
  const [cmd] = args;

  // Capture what the user typed before anything can fail, so every envelope
  // below (including parse errors) can report it as `user_command`. The
  // matching clear lives in the finally, making run() the single owner of
  // that state — see the note in envelope-adapter.ts.
  setUserCommand(args);

  try {
    switch (cmd) {
      case "--schema":
        outputEnvelope(
          withUserCommand({
            status: "success",
            result: generateSchemaFromProgram(
              buildProgram(),
              PLUGIN_NAME,
              PLUGIN_VERSION,
            ),
            warnings: [],
            errors: [],
          }),
        );
        return { status: "success" };

      case "--doctor":
        return handleDoctor();

      case "--capabilities":
        return handleCapabilities();

      case undefined:
        outputEnvelope(
          withUserCommand({
            status: "success",
            result: {
              message: `${PLUGIN_NAME} plugin — available commands`,
              plugin: PLUGIN_NAME,
              version: PLUGIN_VERSION,
              commands: COMMANDS,
              meta_commands: ["--schema", "--doctor", "--capabilities"],
              usage: `tizen-cli ${PLUGIN_NAME} <command> [--options...]`,
            },
            warnings: [],
            errors: [],
          }),
        );
        return { status: "success" };

      default:
        return await dispatchCommand(args);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog(`Plugin error: ${msg}`);
    // Built here rather than via outputError(), which nests its extras INSIDE
    // the error object — user_command belongs at the top level.
    outputEnvelope(
      withUserCommand({
        status: "failure",
        result: null,
        warnings: [],
        errors: [
          {
            error_code: "PLUGIN_ERROR",
            message: `Plugin error: ${msg}`,
            error_category: "plugin_error",
          },
        ],
      }),
    );
    return { status: "failure" };
  } finally {
    clearUserCommand();
  }
}

/**
 * Dispatch a command to the commander program.
 * Action handlers print the envelope themselves (via envelope-adapter) and
 * record failure in the didFail flag instead of calling process.exit().
 */
async function dispatchCommand(
  args: string[],
): Promise<{ status: "success" | "failure" }> {
  const program = buildProgram();
  resetFailure();

  try {
    // 'from: user' means the array is the raw user args (no program name prefix)
    await program.parseAsync(args, { from: "user" });
    return { status: didFail() ? "failure" : "success" };
  } catch (err: any) {
    // Commander throws CommanderError on parse failures (missing args, bad options, help, etc.)
    if (
      err?.code === "commander.help" ||
      err?.code === "commander.helpDisplayed" ||
      err?.code === "commander.version"
    ) {
      return { status: "success" };
    }
    const msg = err?.message || String(err);
    // A rejected option is exactly when the caller needs to see what was typed,
    // and outputError() nests its extras INSIDE the error object — so build the
    // envelope here to keep user_command at the top level.
    outputEnvelope(
      withUserCommand({
        status: "failure",
        result: null,
        warnings: [],
        errors: [
          {
            error_code: err?.code || "COMMAND_ERROR",
            message: msg,
            error_category: "invalid_argument",
          },
        ],
      }),
    );
    return { status: "failure" };
  }
}

export { run };
