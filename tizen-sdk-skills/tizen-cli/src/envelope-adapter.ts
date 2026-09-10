// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Envelope adapter — maps the vendored core's inner envelope to the
 * tizen-cli Standard JSON Envelope, and provides the shared command
 * execution wrapper.
 *
 * Inner envelope (vendor/envelope/envelope.js):
 *   { command, status: 'success'|'failure'|'error', duration_ms,
 *     result?, warnings?, errors?: [{ error_code, error_category, message, suggested_fix? }] }
 *
 * tizen-cli envelope:
 *   success: { status: 'success', result, warnings: [], errors: [] }
 *   failure: { status: 'failure', result: null, warnings: [], errors: [{ error_code, message, ... }] }
 *
 * IMPORTANT: the plugin runs IN-PROCESS inside tizen-cli (Core require()s the
 * bundle and awaits run()). Never call process.exit() here — failure is
 * signalled through run()'s return value, which this module tracks via a
 * per-dispatch flag.
 */

import { outputEnvelope } from "./lib/core-utils";

// Shared CommonJS core (common/lib) — inlined into the bundle by esbuild, the
// same way command-specs/types.ts pulls in sdk-commands.

const { buildUserCommand } = require("../../common/lib/envelope/user-command");

const PLUGIN_NAME = "tizen-sdk";

/**
 * The command line the user issued, captured once per dispatch by run().
 *
 * The inner envelope's `command` is the core's internal label ("tizen-sdk
 * emulator create"), which is not what the user typed — so it cannot answer
 * "what do I re-run?". Module-level state mirrors the existing `lastFailed`
 * pattern below: Core calls run() once per dispatch, in-process.
 *
 * run() owns this value end to end: it calls setUserCommand() on entry and
 * clearUserCommand() in a finally on exit, so no dispatch can observe the
 * previous one's command line. Nothing else may clear it — an intermediate
 * reset would blank the field for the error envelope built further up the
 * stack (a parse failure raised after a handler has already run).
 */
let userCommand = "";

/**
 * Record the raw user tokens for this dispatch (e.g. ["create-emulator",
 * "--vm-name", "myEmul"]). Secrets are redacted by buildUserCommand.
 *
 * Call this once per dispatch, at the entry point (in run()), before any
 * code paths that might read or output userCommand.
 */
export function setUserCommand(args: string[]): void {
  userCommand = buildUserCommand(args, `tizen-cli ${PLUGIN_NAME}`);
}

/**
 * Release the captured command line. Called only by run()'s finally.
 *
 * There is deliberately no getter: reading the raw string is what led callers
 * to hand-assemble `...(userCommand ? { user_command } : {})` per branch, and
 * the branches that forgot are the reason withUserCommand() exists.
 */
export function clearUserCommand(): void {
  userCommand = "";
}

/**
 * Attach `user_command` to an envelope, right after `command` when that key
 * exists and at the end otherwise.
 *
 * Every stdout write in the plugin goes through here, which is what keeps the
 * field from depending on which branch produced the envelope — the same role
 * withUserCommand() plays for the standalone runners in lib/cli/cli-runner.js.
 * Attached unconditionally: run() always records a command line before
 * dispatching, so an absent field would mean a missed path, not "no input".
 */
export function withUserCommand(envelope: any): any {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return envelope;
  }
  const out: any = {};
  for (const [key, value] of Object.entries(envelope)) {
    out[key] = value;
    if (key === "command") out.user_command = userCommand;
  }
  if (!("user_command" in out)) out.user_command = userCommand;
  return out;
}

/**
 * Map the vendored core's inner envelope to the tizen-cli envelope shape.
 * `user_command` is added by withUserCommand() at the point of output, not
 * here, so this stays a pure shape mapping.
 */
export function toOuterEnvelope(commandName: string, inner: any): any {
  const ok = inner && inner.status === "success";
  return {
    status: ok ? "success" : "failure",
    result: ok ? (inner.result !== undefined ? inner.result : null) : null,
    warnings: (inner && inner.warnings) || [],
    errors: ((inner && inner.errors) || []).map((e: any) => ({
      error_code: e.error_code || e.code || "EXECUTION_ERROR",
      message: e.message,
      ...(e.error_category ? { error_category: e.error_category } : {}),
      ...(e.suggested_fix ? { suggested_fix: e.suggested_fix } : {}),
      ...(e.details ? { details: e.details } : {}),
    })),
    // Extra informational fields — Core determines success from run()'s
    // return value, not from stdout, so a superset envelope is safe.
    // Prefer the inner envelope's command (set by the core function from the
    // command parameter passed by CLI runners / command-specs) over the
    // synthesized `${PLUGIN_NAME} ${commandName}`.
    command: (inner && inner.command) || `${PLUGIN_NAME} ${commandName}`,
    ...(inner && inner.duration_ms !== undefined
      ? { duration_ms: inner.duration_ms }
      : {}),
  };
}

let lastFailed = false;

export function resetFailure(): void {
  lastFailed = false;
}

export function didFail(): boolean {
  return lastFailed;
}

/**
 * Run one command handler: await the vendored core function, adapt its inner
 * envelope, print it (the only stdout write), and record success/failure for
 * run()'s return value.
 */
export async function execute(
  commandName: string,
  fn: () => Promise<any>,
): Promise<void> {
  try {
    const outer = toOuterEnvelope(commandName, await fn());
    outputEnvelope(withUserCommand(outer));
    lastFailed = outer.status !== "success";
  } catch (err: any) {
    outputEnvelope(
      withUserCommand({
        status: "failure",
        result: null,
        warnings: [],
        errors: [
          {
            error_code: "EXECUTION_ERROR",
            message: err && err.message ? err.message : String(err),
          },
        ],
        command: `${PLUGIN_NAME} ${commandName}`,
      }),
    );
    lastFailed = true;
  }
}
