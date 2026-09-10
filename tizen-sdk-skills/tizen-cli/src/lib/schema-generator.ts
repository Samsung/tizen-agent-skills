// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Schema Generator — Auto-generates plugin schema by introspecting a Commander program.
 *
 * This eliminates the need to manually maintain a static schema (schema.js).
 * When you add a new command or modify options, the schema updates automatically
 * at runtime when Core calls `plugin --schema`.
 *
 * Usage:
 *   import { generateSchemaFromProgram, getCommandNames } from './lib/schema-generator';
 *
 *   // In --schema handler:
 *   const schema = generateSchemaFromProgram(buildProgram(), 'my-plugin', '1.0.0');
 *   outputSuccess(schema);
 *
 *   // In --get-commands handler (used by esbuild to auto-update plugin.json):
 *   const names = getCommandNames(buildProgram());
 *   outputSuccess({ commands: names });
 */

import type { Command } from "commander";

interface OptionSchema {
  type: string;
  description: string;
  required?: boolean;
  default?: any;
  enum?: string[];
  sensitive?: boolean;
}

interface CommandSchema {
  description: string;
  args: Record<string, OptionSchema>;
  error_categories?: string[];
}

interface PluginSchema {
  plugin: string;
  version: string;
  commands: Record<string, CommandSchema>;
}

/**
 * True if an option name is sensitive and should be masked in logs/transcripts.
 * Matches the same patterns as user-command.js and mask-secrets.js.
 */
function isSensitiveOption(longFlags: string): boolean {
  if (!longFlags) return false;
  const flag = longFlags.split(",")[0].trim(); // e.g., "-p, --password" → "--password"
  if (!flag.startsWith("--")) return false;
  if (flag.startsWith("--prompt-") || flag.endsWith("-file")) return false;

  const SENSITIVE = new Set([
    "--password",
    "--passwd",
    "--pass",
    "--key-password",
    "--author-password",
    "--distributor-password",
    "--distributor2-password",
    "--token",
    "--secret",
    "--api-key",
  ]);

  const SUFFIX = /(^|-)(password|passwd|pass|token|secret|api-key)$/;
  return SENSITIVE.has(flag) || SUFFIX.test(flag.slice(2));
}

/**
 * Convert a commander Option to our schema format.
 */
function optionToSchema(option: any): OptionSchema {
  const schema: OptionSchema = {
    type: "string",
    description: option.description || "",
  };

  // Mark sensitive parameters so harness can mask them in MCP invocations
  if (isSensitiveOption(option.flags)) {
    schema.sensitive = true;
  }

  // In Commander.js, `option.required` is true for ALL options.
  // The property that distinguishes truly required options (created with
  // `.requiredOption()`) is `mandatory` (Commander v9+).
  // For collectAllMissing commands, required options are NOT marked mandatory
  // (so the action handler can report all missing at once), so we also check
  // the custom `_tizenRequired` flag set by commands.ts.
  if (option.mandatory || option._tizenRequired) {
    schema.required = true;
  }

  if (option.defaultValue !== undefined) {
    schema.default = option.defaultValue;
  }

  // Commander stores choices via .choices() → option.argChoices
  if (option.argChoices && Array.isArray(option.argChoices)) {
    schema.enum = [...option.argChoices];
  }

  // Boolean flags (e.g., --verbose with no argument)
  if (option.isBoolean && option.isBoolean()) {
    schema.type = "boolean";
  }

  return schema;
}

/**
 * Recursively collect command schema entries from a Commander command and its
 * subcommands.
 *
 * Each leaf command (a command with no further subcommands) becomes a separate
 * entry in the `commands` record. The key is the full command path (e.g.,
 * `"project create"`, `"project build"`). This means each subcommand maps to
 * its own MCP tool (e.g., `tizen_tizen_sdk_project_create`) rather than being
 * hidden behind a `subcommand` argument.
 *
 * @param cmd - The commander Command to introspect
 * @param fullCommandPath - The dot-separated full path (e.g., "project", "project create")
 * @param commands - The accumulator record to populate
 */
function collectCommandSchema(
  cmd: Command,
  fullCommandPath: string,
  commands: Record<string, CommandSchema>,
): void {
  if (cmd.commands.length > 0) {
    // Has subcommands — recurse into each, building the full path
    for (const subcmd of cmd.commands) {
      collectCommandSchema(
        subcmd,
        `${fullCommandPath} ${subcmd.name()}`,
        commands,
      );
    }
    return;
  }

  // Leaf command — create a schema entry with only this command's options
  const cmdSchema: CommandSchema = {
    description: cmd.description() || "",
    args: {},
  };

  for (const option of cmd.options) {
    let flagKey = option.long;
    if (!flagKey && option.short) {
      flagKey = option.short;
    }
    if (!flagKey) continue;

    cmdSchema.args[flagKey] = optionToSchema(option);
  }

  commands[fullCommandPath] = cmdSchema;
}

/**
 * Generate the full plugin schema by introspecting a Commander program.
 *
 * Each leaf command (including nested subcommands) becomes a separate entry
 * in the `commands` record. For example, `project create` and `project build`
 * are separate entries, not a single `project` entry with a `subcommand` arg.
 *
 * @param program - The commander Command program (with all subcommands registered)
 * @param pluginName - The plugin name
 * @param version - The plugin version
 * @returns PluginSchema object suitable for outputSuccess()
 */
export function generateSchemaFromProgram(
  program: Command,
  pluginName: string,
  version: string,
): PluginSchema {
  const commands: Record<string, CommandSchema> = {};

  for (const cmd of program.commands) {
    collectCommandSchema(cmd, cmd.name(), commands);
  }

  return {
    plugin: pluginName,
    version,
    commands,
  };
}

/**
 * Extract just the top-level command names from a Commander program.
 * Used by the build step (--get-commands) to auto-update plugin.json.
 *
 * @param program - The commander Command program
 * @returns Array of command name strings
 */
export function getCommandNames(program: Command): string[] {
  return program.commands.map((cmd: Command) => cmd.name());
}
