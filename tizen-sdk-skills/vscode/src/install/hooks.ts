// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/hooks.ts — Claude Code settings.json merge + Cline hook/rule install
//
// This is where the extension improves on the shell scripts:
//  (a) Automatic settings.json merge (scripts only printed a snippet)
//  (b) Hook scripts go to a version-independent path (~/.claude/hooks/tizen-sdk-skills/)
//  (c) All three hooks installed (scripts omitted check-skill-routing.sh)
//  (d) CRLF→LF normalization + chmod +x for VSIX-extracted scripts
//  (e) Cline non-clobber check + guard rule install
import * as fsp from "fs/promises";
import * as path from "path";
import { writeStatus } from "../log";
import { normalizeExec, pathExists, removeLegacyDirs } from "./fsutil";
import {
  ClaudeSettings,
  DEFAULT_INDENT,
  HOOK_SOURCE_TAG,
  HOOK_SPECS,
  LEGACY_PLUGIN_NAMES,
  PLUGIN_NAME,
  buildHookEntry,
  describeHooksShapeError,
  detectIndent,
  hasOurMarker,
  hookCommandPath,
  stripOurHooks,
} from "./claudeSettings";

/** Guard scripts the Cline adapter dispatches to (Cline has no Skill tool). */
const CLINE_GUARD_SCRIPTS = [
  "check-tizen-commands.sh",
  "check-project-writes.sh",
];

/** File name of the always-on Cline rule, for a given plugin id. */
function clineGuardRuleName(pluginName: string): string {
  return `${pluginName}-guard.md`;
}

/** Version-independent hook script directory for Claude Code. */
export function claudeHooksDir(home: string): string {
  return path.join(home, ".claude", "hooks", HOOK_SOURCE_TAG);
}

/** Hook script directories earlier releases wrote under the previous name. */
export function legacyClaudeHooksDirs(home: string): string[] {
  return LEGACY_PLUGIN_NAMES.map((name) =>
    path.join(home, ".claude", "hooks", name),
  );
}

/** Cline guard-script directories earlier releases wrote. */
export function legacyClineGuardDirs(home: string): string[] {
  return LEGACY_PLUGIN_NAMES.map((name) =>
    path.join(home, "Documents", "Cline", "Hooks", name),
  );
}

/** Cline always-on rule files earlier releases wrote. */
export function legacyClineGuardRules(home: string): string[] {
  return LEGACY_PLUGIN_NAMES.map((name) =>
    path.join(home, "Documents", "Cline", "Rules", clineGuardRuleName(name)),
  );
}

/**
 * Install Claude Code hooks:
 *  1. Copy hook scripts to ~/.claude/hooks/tizen-sdk-skills/ (version-independent)
 *  2. Merge hook entries into ~/.claude/settings.json under hooks.PreToolUse
 *
 * The settings.json merge:
 *   - Reads existing settings.json (if parse fails, abort merge — safe fallback)
 *   - Keeps a one-time backup of the pristine file as settings.json.tizen-backup
 *   - Recognises our entries by their command path, so re-installs replace
 *     rather than accumulate (no marker keys are added to settings.json)
 *
 * @returns true if settings.json was merged
 */
export async function installClaudeHooks(
  assetsDir: string,
  home: string,
): Promise<boolean> {
  const claudeHome = path.join(home, ".claude");
  const hooksDir = claudeHooksDir(home);
  const settingsFile = path.join(claudeHome, "settings.json");
  const sourceHooksDir = path.join(assetsDir, "hooks");

  if (!(await pathExists(sourceHooksDir))) {
    writeStatus(
      `Hook source directory not found: ${sourceHooksDir}`,
      "Warning",
    );
    return false;
  }

  // 1. Copy hook scripts to version-independent path
  await fsp.mkdir(hooksDir, { recursive: true });
  for (const spec of HOOK_SPECS) {
    const src = path.join(sourceHooksDir, spec.scriptName);
    if (await pathExists(src)) {
      const dst = path.join(hooksDir, spec.scriptName);
      await fsp.copyFile(src, dst);
      await normalizeExec(dst);
    } else {
      writeStatus(
        `Hook script missing from assets: ${spec.scriptName}`,
        "Warning",
      );
    }
  }
  writeStatus(`Hook scripts installed to: ${hooksDir}`, "Success");

  // 2. Merge into settings.json
  let settings: ClaudeSettings = {};
  let indent: string = DEFAULT_INDENT;

  if (await pathExists(settingsFile)) {
    let raw: string;
    try {
      raw = await fsp.readFile(settingsFile, "utf-8");
      // Typed as ClaudeSettings only after describeHooksShapeError below has
      // confirmed the parts we touch (hooks, hooks.PreToolUse) have that shape.
      settings = JSON.parse(raw) as ClaudeSettings;
    } catch {
      // Parse failed — abort merge, print the snippet as a fallback
      writeStatus(
        `Could not parse ${settingsFile} — skipping automated merge. ` +
          "Merge the hook entries manually (see OutputChannel).",
        "Warning",
      );
      printHookSnippet(hooksDir);
      return false;
    }

    // A hooks section of the wrong *type* parses fine but cannot be merged
    // into. Coercing it would silently throw away what the user wrote, so
    // this is handled like a parse failure: the file is left untouched.
    const shapeError = describeHooksShapeError(settings);
    if (shapeError) {
      writeStatus(
        `${settingsFile}: ${shapeError} — skipping automated merge so the existing ` +
          'value is not discarded. Fix the shape and re-run "Tizen AI: Install / Re-sync", ' +
          "or merge the hook entries manually (see OutputChannel).",
        "Warning",
      );
      printHookSnippet(hooksDir);
      return false;
    }

    // Preserve the file's own indentation — see detectIndent.
    indent = detectIndent(raw);

    // Back up the *pristine* file once. Overwriting the backup on every
    // re-install would replace it with an already-merged copy and lose the
    // user's original settings.
    const backupFile = settingsFile + ".tizen-backup";
    if (await pathExists(backupFile)) {
      writeStatus(`Existing settings backup kept: ${backupFile}`, "Info");
    } else {
      await fsp.writeFile(backupFile, raw, "utf-8");
      writeStatus(`Settings backup saved: ${backupFile}`, "Info");
    }
  }

  // Ensure hooks.PreToolUse exists. describeHooksShapeError has already
  // rejected anything present with the wrong type, so these only fill in
  // absent (or explicitly null) sections.
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];

  // Drop our previous entries (idempotent re-install), keep everyone else's.
  // This includes entries a pre-rename release wrote (see isOurHookEntry).
  const removed = stripOurHooks(settings);
  if (removed > 0) {
    writeStatus(
      `Replaced ${removed} existing ${PLUGIN_NAME} hook entr(ies)`,
      "Info",
    );
  }

  for (const spec of HOOK_SPECS) {
    settings.hooks.PreToolUse.push(buildHookEntry(hooksDir, spec));
  }

  await writeJsonAtomic(settingsFile, settings, indent);
  writeStatus(`Hooks merged into: ${settingsFile}`, "Success");
  writeStatus(
    `All ${HOOK_SPECS.length} hooks installed: ${HOOK_SPECS.map((s) => s.scriptName).join(", ")}`,
    "Info",
  );

  // Only now that settings.json no longer references them: drop the hook
  // script directories of the previous plugin name. Removing them earlier
  // would break the old entries if the merge above had to bail out.
  await removeLegacyDirs(legacyClaudeHooksDirs(home), "Claude Code hook dir");
  return true;
}

/**
 * Print the settings.json snippet to the OutputChannel (fallback when
 * automated merge is not possible).
 */
function printHookSnippet(hooksDir: string): void {
  for (const spec of HOOK_SPECS) {
    writeStatus(`  ${JSON.stringify(buildHookEntry(hooksDir, spec))}`, "Info");
  }
}

/**
 * Install Cline hooks:
 *  - Copy PreToolUse adapter to ~/Documents/Cline/Hooks/PreToolUse
 *    (non-clobber: if an existing PreToolUse lacks our marker, warn and skip)
 *  - Copy check-*.sh guard scripts to ~/Documents/Cline/Hooks/tizen-sdk-skills/
 *  - Always install the guard rule at ~/Documents/Cline/Rules/tizen-sdk-skills-guard.md
 *  - Normalize CRLF→LF + chmod +x
 */
export async function installClineHooks(
  assetsDir: string,
  home: string,
): Promise<void> {
  const clineHooksSrc = path.join(assetsDir, "cline-hooks");
  const hooksDir = path.join(home, "Documents", "Cline", "Hooks");
  const rulesDir = path.join(home, "Documents", "Cline", "Rules");
  const adapterDst = path.join(hooksDir, "PreToolUse");
  const guardDir = path.join(hooksDir, HOOK_SOURCE_TAG);
  const sourceAdapter = path.join(clineHooksSrc, "PreToolUse");
  const sourceGuardRule = path.join(
    clineHooksSrc,
    clineGuardRuleName(PLUGIN_NAME),
  );
  const commonHooksDir = path.join(assetsDir, "hooks");

  await fsp.mkdir(hooksDir, { recursive: true });

  // Non-clobber check: if PreToolUse exists and doesn't have our marker, skip.
  // An adapter from a pre-rename release carries the old marker and is ours.
  let mayWriteAdapter = true;
  if (await pathExists(adapterDst)) {
    const content = await fsp.readFile(adapterDst, "utf-8");
    if (!hasOurMarker(content)) {
      mayWriteAdapter = false;
      writeStatus(
        `Existing PreToolUse hook (not ours) found - NOT overwriting: ${adapterDst}. ` +
          `Merge the tizen guard manually.`,
        "Warning",
      );
    }
  }

  if (mayWriteAdapter) {
    await copyClineHookAdapter(
      sourceAdapter,
      adapterDst,
      guardDir,
      commonHooksDir,
    );
    // The adapter now dispatches to guardDir; the previous name's copy is dead.
    await removeLegacyDirs(legacyClineGuardDirs(home), "Cline guard dir");
  }

  // Always install the guard rule (Windows fallback)
  await fsp.mkdir(rulesDir, { recursive: true });
  if (await pathExists(sourceGuardRule)) {
    const ruleDst = path.join(rulesDir, clineGuardRuleName(PLUGIN_NAME));
    await fsp.copyFile(sourceGuardRule, ruleDst);
    writeStatus(
      `Cline guard rule installed (always-on; Windows fallback): ${ruleDst}`,
      "Success",
    );
  }
  // Rules are always-on: a leftover rule under the old name would keep
  // instructing Cline to look for runners in the old cache path.
  await removeLegacyFiles(legacyClineGuardRules(home), "Cline guard rule");
}

/** Remove files earlier releases wrote under the previous plugin name. */
async function removeLegacyFiles(
  files: string[],
  label: string,
): Promise<void> {
  for (const file of files) {
    if (!(await pathExists(file))) continue;
    await fsp.rm(file, { force: true });
    writeStatus(`Removed legacy ${label}: ${file}`, "Success");
  }
}

async function copyClineHookAdapter(
  sourceAdapter: string,
  adapterDst: string,
  guardDir: string,
  commonHooksDir: string,
): Promise<void> {
  // Copy adapter
  if (await pathExists(sourceAdapter)) {
    await fsp.copyFile(sourceAdapter, adapterDst);
    await normalizeExec(adapterDst);
    writeStatus(`Cline PreToolUse hook installed: ${adapterDst}`, "Success");
  }

  // Copy guard scripts
  await fsp.mkdir(guardDir, { recursive: true });
  for (const g of CLINE_GUARD_SCRIPTS) {
    const src = path.join(commonHooksDir, g);
    if (await pathExists(src)) {
      const dst = path.join(guardDir, g);
      await fsp.copyFile(src, dst);
      await normalizeExec(dst);
    }
  }
  writeStatus(`Cline guard scripts installed to: ${guardDir}`, "Success");
}

/**
 * Remove Claude Code hooks from settings.json (used by uninstall).
 *
 * Both the hook script directory and the settings entries are namespaced to us,
 * so this needs no manifest.
 */
export async function removeClaudeHooks(home: string): Promise<void> {
  const settingsFile = path.join(home, ".claude", "settings.json");

  if (await pathExists(settingsFile)) {
    try {
      const raw = await fsp.readFile(settingsFile, "utf-8");
      const settings: unknown = JSON.parse(raw);
      // stripOurHooks no-ops on a malformed PreToolUse, so a shape error just
      // means there is nothing of ours to remove.
      const removed = stripOurHooks(settings);
      if (removed > 0) {
        await writeJsonAtomic(settingsFile, settings, detectIndent(raw));
        writeStatus(
          `Removed ${removed} tizen-sdk-skills hook entr(ies) from settings.json`,
          "Success",
        );
      }
    } catch {
      writeStatus(
        `Could not parse ${settingsFile} — skipping hook removal`,
        "Warning",
      );
    }
  }

  // Remove hook scripts — under the current and any previous plugin name
  const hooksDir = claudeHooksDir(home);
  if (await pathExists(hooksDir)) {
    await fsp.rm(hooksDir, { recursive: true, force: true });
    writeStatus(`Removed hook scripts: ${hooksDir}`, "Success");
  }
  await removeLegacyDirs(legacyClaudeHooksDirs(home), "Claude Code hook dir");
}

/**
 * Remove Cline hooks (used by uninstall).
 */
export async function removeClineHooks(home: string): Promise<void> {
  const hooksDir = path.join(home, "Documents", "Cline", "Hooks");
  const adapterDst = path.join(hooksDir, "PreToolUse");
  const guardDir = path.join(hooksDir, HOOK_SOURCE_TAG);
  const guardRule = path.join(
    home,
    "Documents",
    "Cline",
    "Rules",
    clineGuardRuleName(PLUGIN_NAME),
  );

  // Only remove PreToolUse if it's ours (current or pre-rename marker)
  if (await pathExists(adapterDst)) {
    const content = await fsp.readFile(adapterDst, "utf-8");
    if (hasOurMarker(content)) {
      await fsp.rm(adapterDst, { force: true });
      writeStatus(`Removed Cline PreToolUse: ${adapterDst}`, "Success");
    } else {
      writeStatus(
        `Existing PreToolUse hook (not ours) kept: ${adapterDst}`,
        "Info",
      );
    }
  }

  if (await pathExists(guardDir)) {
    await fsp.rm(guardDir, { recursive: true, force: true });
    writeStatus(`Removed Cline guard scripts: ${guardDir}`, "Success");
  }
  await removeLegacyDirs(legacyClineGuardDirs(home), "Cline guard dir");

  if (await pathExists(guardRule)) {
    await fsp.rm(guardRule, { force: true });
    writeStatus(`Removed Cline guard rule: ${guardRule}`, "Success");
  }
  await removeLegacyFiles(legacyClineGuardRules(home), "Cline guard rule");
}

/**
 * Write JSON via a temp file + rename so an interrupted write cannot leave the
 * user with a truncated settings.json.
 */
async function writeJsonAtomic(
  file: string,
  value: unknown,
  indent: string = DEFAULT_INDENT,
): Promise<void> {
  const tmp = `${file}.tizen-tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, indent) + "\n", "utf-8");
  await fsp.rename(tmp, file);
}

/** Exported for validation: the command string settings.json should contain. */
export function expectedHookCommand(home: string, scriptName: string): string {
  return `bash "${hookCommandPath(claudeHooksDir(home), scriptName)}"`;
}
