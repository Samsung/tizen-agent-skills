// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/uninstall.ts — VS Code uninstall hook (vscode:uninstall)
//
// This runs when the user uninstalls the extension via
// `code --uninstall-extension`. It cleans up what the extension installed:
//   - Claude: cache, personal skills/agents (per manifest), hooks (settings.json + scripts)
//   - Cline:  cache, personal skills (per manifest), hooks (PreToolUse, guard scripts, guard rule)
//
// This script runs as a standalone Node process, so it must not touch the
// `vscode` API — it only imports the vscode-free helpers shared with the
// extension (claudeSettings.ts, manifest.ts).
//
// It also runs unattended, with no chance to prompt. Locations namespaced to us
// (the plugin cache, hooks/tizen-sdk-skills/, the guard rule) are removed
// outright; the shared ~/.claude/skills, ~/.claude/agents and ~/.cline/skills
// namespaces are pruned strictly from the install manifest, so a hand-written
// or setup.sh-installed `tizen-*` skill is never collateral damage.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ALL_PLUGIN_NAMES,
  detectIndent,
  hasOurMarker,
  stripOurHooks,
} from "./install/claudeSettings";
import { readManifest, removeManifest } from "./install/manifest";

const home = os.homedir();

function log(message: string): void {
  console.log(`[tizen-ai-extension uninstall] ${message}`);
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    log(`Removed: ${dir}`);
  }
}

function removeFile(file: string): void {
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true });
    log(`Removed: ${file}`);
  }
}

/** Prune the shared skills/agents namespaces using the install manifest only. */
function removeManifestedEntries(hostHome: string): void {
  const manifest = readManifest(hostHome);
  if (!manifest) {
    log(
      `No install manifest in ${hostHome} — leaving skills/ and agents/ untouched ` +
        "(not installed by this extension).",
    );
    return;
  }

  for (const skill of manifest.skills) {
    removeDir(path.join(hostHome, "skills", skill));
  }
  for (const agent of manifest.agents) {
    removeFile(path.join(hostHome, "agents", agent));
  }
  removeManifest(hostHome);
}

function removeClaudeAll(): void {
  const claudeHome = path.join(home, ".claude");

  // Namespaced — all caches, under the current and any previous plugin name
  for (const name of ALL_PLUGIN_NAMES) {
    removeDir(
      path.join(claudeHome, "plugins", "cache", "tizen-platform", name),
    );
  }

  // Shared namespaces — manifest only
  removeManifestedEntries(claudeHome);

  // Remove our hook entries from settings.json, leaving everyone else's alone
  const settingsFile = path.join(claudeHome, "settings.json");
  if (fs.existsSync(settingsFile)) {
    try {
      const raw = fs.readFileSync(settingsFile, "utf-8");
      const settings = JSON.parse(raw);
      const removed = stripOurHooks(settings);
      if (removed > 0) {
        const tmp = `${settingsFile}.tizen-tmp`;
        fs.writeFileSync(
          tmp,
          JSON.stringify(settings, null, detectIndent(raw)) + "\n",
          "utf-8",
        );
        fs.renameSync(tmp, settingsFile);
        log(`Cleaned ${removed} hook entr(ies) from: ${settingsFile}`);
      }
    } catch {
      log(`Could not parse ${settingsFile} — skipping hook removal`);
    }
  }

  // Remove hook scripts — current and previous plugin name
  for (const name of ALL_PLUGIN_NAMES) {
    removeDir(path.join(claudeHome, "hooks", name));
  }
}

function removeClineAll(): void {
  const clineHome = path.join(home, ".cline");

  // Namespaced — all caches, under the current and any previous plugin name
  for (const name of ALL_PLUGIN_NAMES) {
    removeDir(path.join(clineHome, "plugins", "cache", "tizen-platform", name));
  }

  // Shared namespace — manifest only
  removeManifestedEntries(clineHome);

  // Hooks
  const hooksDir = path.join(home, "Documents", "Cline", "Hooks");
  const adapterDst = path.join(hooksDir, "PreToolUse");

  // Only remove PreToolUse if it's ours (current or pre-rename marker)
  if (fs.existsSync(adapterDst)) {
    if (hasOurMarker(fs.readFileSync(adapterDst, "utf-8"))) {
      removeFile(adapterDst);
    } else {
      log(`Existing PreToolUse hook (not ours) kept: ${adapterDst}`);
    }
  }

  for (const name of ALL_PLUGIN_NAMES) {
    removeDir(path.join(hooksDir, name));
    // Remove guard rule
    removeFile(
      path.join(home, "Documents", "Cline", "Rules", `${name}-guard.md`),
    );
  }
}

// Main
log("Starting cleanup...");
try {
  removeClaudeAll();
  removeClineAll();
  log("Cleanup complete.");
} catch (e: unknown) {
  // Never fail the uninstall: VS Code has already removed the extension.
  log(
    `Cleanup encountered an error: ${e instanceof Error ? e.message : String(e)}`,
  );
}
