#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * merge-hooks-json.js — register this plugin's tool hooks in a harness settings
 * file (JSON), replacing any entries a previous install of this plugin wrote.
 *
 * The setup scripts used to only PRINT the snippet and expect the user to merge
 * it into ~/.claude/settings.json / ~/.gemini/settings.json by hand — so unless
 * the user did that step, the hooks were never actually registered. This tool
 * performs the merge; the printed snippet remains the fallback for files it
 * must not touch.
 *
 * Usage:
 *   node merge-hooks-json.js --file <settings.json> --event PreToolUse \
 *        (--entries '<json array>' | --entries-file <path|->)
 *
 * Behaviour:
 *   - missing file             -> created with just the entries
 *   - unparsable / wrong shape -> exit 1, file left untouched (the caller then
 *                                  prints the manual-merge snippet)
 *   - our previous entries      -> replaced (recognised by command path or the
 *                                  legacy _source tag), never duplicated
 *   - everyone else's entries  -> kept untouched
 *   - pristine backup          -> <file>.tizen-backup, written once
 *   - indentation / newlines   -> reused from the existing file (2 spaces + LF
 *                                  when the file is created)
 *
 * Exit 0 = merged; 1 = not merged. Human-readable lines on stdout/stderr.
 * Exported for tests (same convention as agent-convert.js).
 */

const fs = require("fs");

const PLUGIN_NAME = "tizen-sdk-skills";
// Ids earlier releases used for the same hook entries (see setup-lib.sh).
const LEGACY_PLUGIN_NAMES = ["tizen-sdk-agents"];
const ALL_PLUGIN_NAMES = [PLUGIN_NAME, ...LEGACY_PLUGIN_NAMES];

// The guard scripts common/hooks/ ships (see common/hooks/hooks.json).
const GUARD_SCRIPTS = [
  "check-tizen-commands.sh",
  "check-project-writes.sh",
  "check-skill-routing.sh",
];

// A command is ours when it runs a script out of one of our hook directories:
// the version-independent ~/.claude|~/.gemini/hooks/tizen-sdk-skills/ the
// current install writes, the pre-rename tizen-sdk-agents/ dir, or one of our
// guard scripts at the repo/cache common/hooks/ path the old setup scripts
// told the user to merge by hand. The last marker names the scripts exactly:
// a bare "common/hooks/" prefix would also claim (and silently delete) any
// user hook that happens to live under a directory of that name.
const COMMAND_MARKERS = [
  `hooks/${PLUGIN_NAME}/`,
  ...LEGACY_PLUGIN_NAMES.map((name) => `hooks/${name}/`),
  ...GUARD_SCRIPTS.map((script) => `common/hooks/${script}`),
];

const DEFAULT_INDENT = "  ";
const DEFAULT_EOL = "\n";

const toPosix = (p) => String(p).replace(/\\/g, "/");

const isRecord = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isOurCommand(command) {
  if (typeof command !== "string") return false;
  const posix = toPosix(command);
  return COMMAND_MARKERS.some((m) => posix.includes(m));
}

const isOurSourceTag = (value) =>
  typeof value === "string" && ALL_PLUGIN_NAMES.includes(value);

/**
 * An entry is ours iff every command in it runs one of our scripts (or it
 * carries our _source tag from an earlier release). A hand-edited entry that
 * mixes our guard with the user's own command is NOT ours and is left alone.
 */
function isOurEntry(entry) {
  if (!isRecord(entry)) return false;
  if (isOurSourceTag(entry._source)) return true;
  const hooks = entry.hooks;
  if (!Array.isArray(hooks) || hooks.length === 0) return false;
  return hooks.every((h) => {
    if (!isRecord(h)) return false;
    if (isOurSourceTag(h._source)) return true;
    return isOurCommand(h.command);
  });
}

function jsonKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  const kind = typeof value;
  return kind === "object" ? "an object" : `a ${kind}`;
}

/**
 * Why a *parsed* settings value cannot be merged into, or undefined if it can.
 * A section of the wrong type parses fine but coercing it would silently
 * discard what the user wrote — so it is reported and treated exactly like a
 * parse failure: the file is left alone.
 */
function describeShapeError(settings, event) {
  if (!isRecord(settings)) {
    return `the top level is ${jsonKind(settings)}, expected an object`;
  }
  const hooks = settings.hooks;
  if (hooks === undefined || hooks === null) return undefined;
  if (!isRecord(hooks)) {
    return `"hooks" is ${jsonKind(hooks)}, expected an object`;
  }
  const list = hooks[event];
  if (list === undefined || list === null) return undefined;
  if (!Array.isArray(list)) {
    return `"hooks.${event}" is ${jsonKind(list)}, expected an array`;
  }
  return undefined;
}

/**
 * Reuse the file's own indent unit so a two-line change does not reflow the
 * whole document (settings.json is a dotfile users keep in version control).
 * Falls back to the default for minified files and implausible indents.
 */
function detectIndent(raw, fallback = DEFAULT_INDENT) {
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
 * Reuse the file's own line ending for the same reason as detectIndent: a
 * CRLF settings.json (common on Windows) rewritten with LF is a whole-file
 * diff for a two-line change.
 */
function detectEol(raw, fallback = DEFAULT_EOL) {
  const idx = raw.indexOf("\n");
  if (idx === -1) return fallback;
  return idx > 0 && raw[idx - 1] === "\r" ? "\r\n" : "\n";
}

/** Validate the entries argument: an array of { matcher, hooks } records. */
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("entries must be a non-empty JSON array");
  }
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) {
      throw new Error(
        `every entry needs a "hooks" array — got ${JSON.stringify(entry)}`,
      );
    }
  }
  return entries;
}

/** Write via temp file + rename so an interrupted write cannot truncate the file. */
function atomicWrite(file, text) {
  const tmp = `${file}.tizen-tmp`;
  fs.writeFileSync(tmp, text, "utf-8");
  fs.renameSync(tmp, file);
}

/**
 * Merge entries into file[event]. Throws on anything that must leave the file
 * untouched (parse failure, shape error, bad entries); returns a summary.
 * @returns {{ replaced: number, total: number, created: boolean }}
 */
function mergeHooksFile(file, event, entries) {
  validateEntries(entries);
  let raw = null;
  if (fs.existsSync(file)) {
    raw = fs.readFileSync(file, "utf-8");
    if (raw.trim() === "") raw = null; // an empty file has nothing to lose
  }

  let settings = {};
  let indent = DEFAULT_INDENT;
  let eol = DEFAULT_EOL;
  if (raw !== null) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${file} is not valid JSON — file left untouched`);
    }
    const shapeError = describeShapeError(parsed, event);
    if (shapeError) {
      throw new Error(`${file}: ${shapeError} — file left untouched`);
    }
    settings = parsed;
    indent = detectIndent(raw);
    eol = detectEol(raw);
    // Back up the *pristine* file once. Overwriting the backup on every
    // re-install would replace it with an already-merged copy and lose the
    // user's original settings.
    const backup = `${file}.tizen-backup`;
    if (!fs.existsSync(backup)) {
      fs.writeFileSync(backup, raw, "utf-8");
      console.log(`merge-hooks-json: pristine backup saved: ${backup}`);
    }
  }

  if (!isRecord(settings.hooks)) settings.hooks = {};
  if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
  const list = settings.hooks[event];
  const kept = list.filter((e) => !isOurEntry(e));
  const replaced = list.length - kept.length;
  settings.hooks[event] = [...kept, ...entries];

  // JSON.stringify always emits LF; re-join with the file's own line ending.
  const text = JSON.stringify(settings, null, indent).split("\n").join(eol);
  atomicWrite(file, text + eol);
  return {
    replaced,
    total: settings.hooks[event].length,
    created: raw === null,
  };
}

function usage() {
  return [
    "usage: merge-hooks-json.js --file <settings.json> --event <PreToolUse|BeforeTool>",
    "                     (--entries '<json array>' | --entries-file <path|->)",
  ].join("\n");
}

function main(argv) {
  const opts = { file: null, event: null, entries: null, entriesFile: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const val = argv[i + 1];
    if (val === undefined || val.startsWith("--")) {
      process.stderr.write(`merge-hooks-json: ${usage()}\n`);
      process.exit(1);
    }
    if (key === "--file") opts.file = val;
    else if (key === "--event") opts.event = val;
    else if (key === "--entries") opts.entries = val;
    else if (key === "--entries-file") opts.entriesFile = val;
    else {
      process.stderr.write(
        `merge-hooks-json: unknown option ${key}\n${usage()}\n`,
      );
      process.exit(1);
    }
  }
  if (!opts.file || !opts.event || (!opts.entries && !opts.entriesFile)) {
    process.stderr.write(`merge-hooks-json: ${usage()}\n`);
    process.exit(1);
  }

  let entriesText;
  if (opts.entriesFile) {
    entriesText =
      opts.entriesFile === "-"
        ? fs.readFileSync(0, "utf-8")
        : fs.readFileSync(opts.entriesFile, "utf-8");
  } else {
    entriesText = opts.entries;
  }

  let entries;
  try {
    entries = JSON.parse(entriesText);
    const r = mergeHooksFile(opts.file, opts.event, entries);
    console.log(
      `merge-hooks-json: ${r.total} ${opts.event} entr(ies) in ${opts.file}` +
        ` (${r.replaced} replaced, ${r.created ? "file created" : "merged"})`,
    );
  } catch (e) {
    process.stderr.write(`merge-hooks-json: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  PLUGIN_NAME,
  LEGACY_PLUGIN_NAMES,
  GUARD_SCRIPTS,
  COMMAND_MARKERS,
  DEFAULT_INDENT,
  DEFAULT_EOL,
  isOurEntry,
  isOurCommand,
  describeShapeError,
  detectIndent,
  detectEol,
  mergeHooksFile,
  usage,
};
