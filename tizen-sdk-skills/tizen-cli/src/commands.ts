// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Commander program for the tizen-sdk plugin.
 *
 * This file is the ENGINE only: it turns the declarative command specs from
 * ./command-specs (grouped by domain: sdk, project, device, debug) into real
 * Commander commands. Each spec maps 1:1 to a shared core function
 * (../common/lib/core/sdk-commands.js) and mirrors the argv contract of the
 * matching CLI runner (../common/lib/cli/*-cli.js).
 *
 * Real Option objects (choices/default/mandatory) are registered so the
 * runtime schema introspection (lib/schema-generator.ts) works unchanged.
 */

import { Command, Option } from "commander";
import { execute } from "./envelope-adapter";
import { COMMAND_SPECS, CommandSpec, OptionSpec } from "./command-specs";
import pkg = require("../package.json");

/** Extract the long flag ("--parent-path") from a flags string ("--parent-path <dir>"). */
function longFlag(flags: string): string {
  return flags.split(/[ ,|]/)[0];
}

/** Commander camelCases long flags: "--parent-path" → opts.parentPath. */
function optionKey(flags: string): string {
  return longFlag(flags)
    .replace(/^--/, "")
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Build the failure envelope listing ALL missing required options at once
 * (Commander's requiredOption stops at the first missing one).
 */
function missingOptionsEnvelope(
  commandName: string,
  missing: OptionSpec[],
): Promise<any> {
  const missingFlags = missing.map((m) => longFlag(m.flags)).join(", ");
  const detail = missing
    .map((m) => `  ${longFlag(m.flags)} — ${m.missingHint || m.description}`)
    .join("\n");
  const exampleFlags = missing.map((m) => m.flags).join(" ");
  return Promise.resolve({
    status: "failure",
    result: null,
    warnings: [],
    errors: [
      {
        error_code: "commander.missingMandatoryOptionValue",
        message: `error: required option(s) not specified: ${missingFlags}\n${detail}`,
        error_category: "invalid_argument",
        suggested_fix: {
          command: `tizen-sdk ${commandName} ${exampleFlags}`,
          auto_fixable: false,
          guide_url: null,
        },
      },
    ],
    duration_ms: 0,
  });
}

/** Register one CommandSpec as a Commander command. */
function registerCommand(program: Command, spec: CommandSpec): void {
  const cmd = program.command(spec.name).description(spec.description);

  for (const o of spec.options ?? []) {
    const option = new Option(o.flags, o.description);
    if (o.choices) option.choices(o.choices);
    if (o.default !== undefined) option.default(o.default);
    // With collectAllMissing, required options stay non-mandatory in Commander
    // so the action can report every missing option in a single envelope.
    if (o.required && !spec.collectAllMissing) option.makeOptionMandatory();
    // Store the spec-level required flag so the schema generator can report
    // it even when collectAllMissing prevents makeOptionMandatory().
    (option as any)._tizenRequired = !!o.required;
    cmd.addOption(option);
  }

  cmd.action((opts: Record<string, any>) => {
    if (spec.collectAllMissing) {
      const missing = (spec.options ?? []).filter(
        (o) => o.required && !opts[optionKey(o.flags)],
      );
      if (missing.length > 0) {
        return execute(spec.name, () =>
          missingOptionsEnvelope(spec.name, missing),
        );
      }
    }
    return execute(spec.name, () => spec.handler(opts));
  });
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("tizen-sdk")
    .description(
      "Script-driven Tizen SDK agent workflows — SDK install, project create/build, device, app install, remote debug",
    )
    .version(pkg.version)
    .exitOverride()
    .configureOutput({
      writeOut: (str: string) => process.stderr.write(str),
      writeErr: (str: string) => process.stderr.write(str),
      outputError: (str: string, write: (_s: string) => void) => write(str),
    });

  for (const spec of COMMAND_SPECS) {
    registerCommand(program, spec);
  }

  return program;
}
