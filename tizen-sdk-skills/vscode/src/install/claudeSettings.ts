// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/claudeSettings.ts — the shape of the hook entries we write into
// ~/.claude/settings.json, and how we recognise our own entries again.
//
// Deliberately free of any `vscode` import: both the extension (hooks.ts) and
// the standalone uninstall process (uninstall.ts) use this, and it is
// unit-tested in a plain Node process (src/test/pure.test.ts).

/** Plugin id — the namespace of every directory and marker we write. */
export const PLUGIN_NAME = "tizen-sdk-skills";

/**
 * Ids earlier releases used for the same directories and markers: the plugin
 * shipped as `tizen-sdk-agents` from the tizen-ai-plugins monorepo. They are
 * recognised for cleanup so an update replaces the previous install instead of
 * leaving it beside the new one — and are never written again.
 */
export const LEGACY_PLUGIN_NAMES = ["tizen-sdk-agents"];

/** Every id that identifies our files: current first, then legacy. */
export const ALL_PLUGIN_NAMES = [PLUGIN_NAME, ...LEGACY_PLUGIN_NAMES];

export const HOOK_SOURCE_TAG = PLUGIN_NAME;

/** Directory segment every hook command we write points into. */
export const HOOK_DIR_MARKER = `hooks/${HOOK_SOURCE_TAG}/`;

/** Directory segments earlier releases pointed their hook commands into. */
export const LEGACY_HOOK_DIR_MARKERS = LEGACY_PLUGIN_NAMES.map(
  (name) => `hooks/${name}/`,
);

/** Whether a `_source` tag value is one of ours (current or legacy). */
export function isOurSourceTag(value: unknown): boolean {
  return typeof value === "string" && ALL_PLUGIN_NAMES.includes(value);
}

/** Whether a hook command runs a script out of one of our hook directories. */
export function isOurHookCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  const posix = toPosix(command);
  return [HOOK_DIR_MARKER, ...LEGACY_HOOK_DIR_MARKERS].some((marker) =>
    posix.includes(marker),
  );
}

/**
 * Whether free text carries one of our ids — used for files we own outright
 * but cannot tag structurally, such as the Cline PreToolUse adapter, whose
 * header comment names the plugin.
 */
export function hasOurMarker(text: string): boolean {
  return ALL_PLUGIN_NAMES.some((name) => text.includes(name));
}

export interface HookSpec {
  matcher: string;
  scriptName: string;
}

/**
 * One command inside a `hooks.PreToolUse[]` entry, as Claude Code's
 * settings schema defines it. `_source` is the marker earlier builds of this
 * extension wrote (with the value `tizen-sdk-agents` before the rename); it is
 * read for cleanup but never written any more.
 */
export interface HookCommand {
  type: string;
  command: string;
  _source?: string;
}

/** One `hooks.PreToolUse[]` entry. */
export interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
  _source?: string;
}

/**
 * The slice of `~/.claude/settings.json` this extension reads and writes.
 *
 * Only the `hooks.PreToolUse` list is modelled; every other key (permissions,
 * env, other hook events, ...) is carried through untouched as `unknown`.
 * Entries are trusted as parsed — the ones we inspect go through
 * `isOurHookEntry`, which re-validates the shape from `unknown`.
 */
export interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookEntry[];
    [event: string]: unknown;
  };
  [key: string]: unknown;
}

/** Narrow a parsed JSON value to a plain object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The `hooks` section of a parsed settings value, or undefined when the
 * settings are not an object or have no object-typed `hooks`.
 */
function hooksSection(settings: unknown): Record<string, unknown> | undefined {
  if (!isRecord(settings)) return undefined;
  const hooks = settings.hooks;
  return isRecord(hooks) ? hooks : undefined;
}

/**
 * The `hooks.PreToolUse` list of a parsed settings value, or undefined when
 * it is absent or not an array. Elements are left as `unknown`: the file may
 * hold anything the user wrote, and only `isOurHookEntry` decides what ours are.
 */
export function preToolUseEntries(settings: unknown): unknown[] | undefined {
  const list = hooksSection(settings)?.PreToolUse;
  return Array.isArray(list) ? (list as unknown[]) : undefined;
}

/** The string `command`s inside a PreToolUse entry (empty if malformed). */
export function hookCommandsOf(entry: unknown): string[] {
  if (!isRecord(entry) || !Array.isArray(entry.hooks)) return [];
  const commands: string[] = [];
  for (const h of entry.hooks as unknown[]) {
    if (isRecord(h) && typeof h.command === "string") commands.push(h.command);
  }
  return commands;
}

/** The three PreToolUse hooks from common/hooks/hooks.json. */
export const HOOK_SPECS: HookSpec[] = [
  { matcher: "Bash|PowerShell", scriptName: "check-tizen-commands.sh" },
  { matcher: "Write|Bash|PowerShell", scriptName: "check-project-writes.sh" },
  { matcher: "Skill", scriptName: "check-skill-routing.sh" },
];

/**
 * settings.json is a JSON file, not JSONC, and Claude Code validates it against
 * a schema — so we do not stash marker keys in it. Instead an entry is ours iff
 * every command in it runs a script out of ~/.claude/hooks/tizen-sdk-skills/.
 *
 * Entries from earlier releases — a `_source` tag, or commands under the
 * legacy ~/.claude/hooks/tizen-sdk-agents/ directory — are recognised too, so
 * that they are replaced on update rather than duplicated.
 */
export function isOurHookEntry(entry: unknown): boolean {
  if (!isRecord(entry)) return false;

  if (isOurSourceTag(entry._source)) return true;
  const hooks = entry.hooks;
  if (!Array.isArray(hooks) || hooks.length === 0) return false;

  return (hooks as unknown[]).every((h) => {
    if (!isRecord(h)) return false;
    if (isOurSourceTag(h._source)) return true;
    return isOurHookCommand(h.command);
  });
}

/**
 * Drop our PreToolUse entries from a parsed settings object, in place.
 * Returns how many entries were removed. Foreign entries are never touched.
 *
 * Takes `unknown` on purpose: this also runs on uninstall against whatever is
 * in the file, before any shape check, and must no-op on anything malformed.
 */
export function stripOurHooks(settings: unknown): number {
  const hooks = hooksSection(settings);
  const list = preToolUseEntries(settings);
  if (!hooks || !list) return 0;
  const kept = list.filter((entry) => !isOurHookEntry(entry));
  hooks.PreToolUse = kept;
  return list.length - kept.length;
}

/** Build the PreToolUse entry for one hook spec. */
export function buildHookEntry(hooksDir: string, spec: HookSpec): HookEntry {
  return {
    matcher: spec.matcher,
    hooks: [
      {
        type: "command",
        command: `bash "${hookCommandPath(hooksDir, spec.scriptName)}"`,
      },
    ],
  };
}

/**
 * Hook commands are run through `bash`, so the path is emitted with forward
 * slashes. A Windows path such as `C:\Users\me\.claude\hooks\...` would
 * otherwise reach bash as a string full of backslash escapes.
 */
export function hookCommandPath(hooksDir: string, scriptName: string): string {
  let dir = hooksDir;
  while (dir.endsWith("\\") || dir.endsWith("/")) {
    dir = dir.slice(0, -1);
  }
  return toPosix(dir) + "/" + scriptName;
}

/** Default indentation for a settings.json we create ourselves. */
export const DEFAULT_INDENT = "  ";

/**
 * Reuse the indentation the user's file already has.
 *
 * The merge re-serialises the whole document, so writing a fixed two-space
 * indent would reflow a `settings.json` the user may well keep in version
 * control — a diff full of whitespace noise for a two-line change.
 *
 * Falls back to the default for minified files and for anything that is not a
 * plausible, homogeneous indent unit.
 *
 * This narrows the diff but does not eliminate it: `JSON.stringify` always
 * expands inline arrays and objects, so `"allow": ["Bash"]` still becomes
 * multi-line. Fully preserving the original layout would mean editing the
 * document with something like `jsonc-parser` instead of re-serialising it,
 * which is a dependency this extension does not currently carry.
 */
export function detectIndent(
  raw: string,
  fallback: string = DEFAULT_INDENT,
): string {
  for (const line of raw.split("\n")) {
    const match = /^([ \t]+)\S/.exec(line);
    if (!match) continue;
    const indent = match[1];
    if (indent.length > 8) return fallback;
    if (!/^ +$/.test(indent) && !/^\t+$/.test(indent)) return fallback;
    return indent;
  }
  return fallback;
}

/**
 * Describe why a *parsed* settings object cannot be merged into, or undefined
 * if it can.
 *
 * A `hooks` section of the wrong type is a shape error, not a syntax error, so
 * `JSON.parse` accepted it happily. Coercing it to the expected type would
 * silently discard whatever the user meant to write — and on a re-install the
 * backup no longer holds it either. So this is reported and treated exactly
 * like a parse failure: leave the file alone and print the manual snippet.
 */
export function describeHooksShapeError(settings: unknown): string | undefined {
  if (!isRecord(settings)) {
    return `the top level is ${jsonKind(settings)}, expected an object`;
  }

  const hooks = settings.hooks;
  if (hooks === undefined || hooks === null) return undefined;
  if (!isRecord(hooks)) {
    return `"hooks" is ${jsonKind(hooks)}, expected an object`;
  }

  const preToolUse = hooks.PreToolUse;
  if (preToolUse === undefined || preToolUse === null) return undefined;
  if (!Array.isArray(preToolUse)) {
    return `"hooks.PreToolUse" is ${jsonKind(preToolUse)}, expected an array`;
  }

  return undefined;
}

function jsonKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}
