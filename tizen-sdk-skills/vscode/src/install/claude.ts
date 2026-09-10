// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/claude.ts — port of claude/setup/setup.sh steps 2-3
//
// Installs the Claude Code on-disk layout:
//   1. Cache:  ~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/{skills,agents,scripts,lib,assets,docs}
//   2. Personal skills: ~/.claude/skills/<skill-name>/  (per-skill mirror)
//   3. Personal agents: ~/.claude/agents/*.md  (per-file copy)
import * as fsp from "fs/promises";
import * as path from "path";
import { writeStatus, writeSection } from "../log";
import {
  mirrorDir,
  copyFiles,
  listSubdirs,
  normalizeExecDir,
  pathExists,
  pruneCacheVersions,
  removeLegacyDirs,
  removeNamedEntries,
  copyPlatformBinary,
} from "./fsutil";
import {
  HOOK_SOURCE_TAG,
  LEGACY_PLUGIN_NAMES,
  PLUGIN_NAME,
} from "./claudeSettings";
import { readManifest, removeManifest, staleEntries } from "./manifest";

export interface ClaudeInstallResult {
  cacheBase: string;
  skillsDir: string;
  agentsDir: string;
  /** What we wrote into the shared skills/agents namespaces — recorded in the manifest. */
  owned: { skills: string[]; agents: string[] };
}

/**
 * Install for Claude Code:
 *   - Cache sync (assets → cache, clean mirror)
 *   - Personal skills sync (cache → ~/.claude/skills, per-skill mirror)
 *   - Personal agents sync (cache → ~/.claude/agents, per-file copy)
 *
 * @param assetsDir The bundled assets directory inside the extension
 * @param home User home directory
 * @param version Plugin version (determines cache path)
 * @returns Install result with paths for validation and manifest recording
 */
export async function installClaude(
  assetsDir: string,
  home: string,
  version: string,
): Promise<ClaudeInstallResult> {
  const claudeHome = path.join(home, ".claude");
  const cacheBase = claudeCacheBase(home, version);
  const skillsDir = path.join(claudeHome, "skills");
  const agentsDir = path.join(claudeHome, "agents");

  writeSection("Claude Code Installation");

  // Step 1: Path validation
  writeStatus(`Claude Code user path: ${claudeHome}`, "Info");

  // What the previous install claimed — read before anything is overwritten.
  const previous = readManifest(claudeHome);

  // Ensure cache directory exists, and drop caches from other versions — and
  // from the previous plugin name, which the runner lookup no longer scans.
  await fsp.mkdir(cacheBase, { recursive: true });
  await pruneCacheVersions(claudeCacheRoot(home), version, "Claude Code");
  await removeLegacyDirs(legacyClaudeCacheRoots(home), "Claude Code cache");

  // Step 2: Plugin cache sync (clean mirror)
  writeStatus("Plugin cache sync", "Info");
  for (const sub of [
    "skills",
    "agents",
    "scripts",
    "lib",
    "assets",
    "docs",
  ] as const) {
    const label = sub.charAt(0).toUpperCase() + sub.slice(1);
    await mirrorDir(
      path.join(assetsDir, sub),
      path.join(cacheBase, sub),
      label,
    );
  }
  // Tools: copy only the platform-specific binary
  await copyPlatformBinary(
    path.join(assetsDir, "tools"),
    path.join(cacheBase, "tools"),
    "Tools",
  );

  // Normalize shell scripts in cache. Hooks are NOT mirrored into the cache —
  // settings.json references them at ~/.claude/hooks/tizen-sdk-skills/ instead
  // (see claude/setup/setup.sh: "Hooks: referenced by absolute path").
  await normalizeExecDir(path.join(cacheBase, "scripts"));

  // Step 3: Personal copy sync (cache → personal paths)
  writeStatus("Personal copy sync (actual loading paths)", "Info");

  // Per-skill clean copy: the personal skills dir also holds non-tizen skills,
  // so only the skill folders present in the cache are mirrored.
  await fsp.mkdir(skillsDir, { recursive: true });
  const skillNames = await listSubdirs(path.join(cacheBase, "skills"));
  for (const skillName of skillNames) {
    await mirrorDir(
      path.join(cacheBase, "skills", skillName),
      path.join(skillsDir, skillName),
      `Skill (personal): ${skillName}`,
    );
  }

  // Agents: individual file copy
  await fsp.mkdir(agentsDir, { recursive: true });
  const agentNames = await copyFiles(
    path.join(cacheBase, "agents"),
    agentsDir,
    "Agents (personal)",
    "\\.md$",
  );

  // Step 4: Prune what the previous version shipped and this one does not.
  const staleSkills = staleEntries(previous?.skills, skillNames);
  const staleAgents = staleEntries(previous?.agents, agentNames);
  if (staleSkills.length > 0 || staleAgents.length > 0) {
    writeStatus(
      `Pruning ${staleSkills.length} skill(s) and ${staleAgents.length} agent(s) ` +
        `no longer shipped in v${version}`,
      "Info",
    );
    await removeNamedEntries(skillsDir, staleSkills, "stale skill");
    await removeNamedEntries(agentsDir, staleAgents, "stale agent");
  }

  writeStatus("Claude Code installation complete", "Success");

  return {
    cacheBase,
    skillsDir,
    agentsDir,
    owned: { skills: skillNames, agents: agentNames },
  };
}

/** The plugin cache root for Claude Code — holds one directory per version. */
export function claudeCacheRoot(home: string): string {
  return claudeCacheRootFor(home, PLUGIN_NAME);
}

/** Cache roots written by earlier releases under the previous plugin name. */
export function legacyClaudeCacheRoots(home: string): string[] {
  return LEGACY_PLUGIN_NAMES.map((name) => claudeCacheRootFor(home, name));
}

function claudeCacheRootFor(home: string, pluginName: string): string {
  return path.join(
    home,
    ".claude",
    "plugins",
    "cache",
    "tizen-platform",
    pluginName,
  );
}

/** The versioned plugin cache directory for Claude Code. */
export function claudeCacheBase(home: string, version: string): string {
  return path.join(claudeCacheRoot(home), version);
}

/**
 * Remove Claude Code installed files (for uninstall).
 *
 * The plugin cache lives under a path that is namespaced to us, so it is always
 * removed. ~/.claude/skills and ~/.claude/agents are shared with the user, so
 * only the entries recorded in the install manifest are removed there.
 */
export async function removeClaude(home: string): Promise<void> {
  const claudeHome = path.join(home, ".claude");

  // Namespaced — unambiguously ours, every version of it, under every name.
  const cacheRoot = claudeCacheRoot(home);
  if (await pathExists(cacheRoot)) {
    await fsp.rm(cacheRoot, { recursive: true, force: true });
    writeStatus(`Removed all caches: ${cacheRoot}`, "Success");
  }
  await removeLegacyDirs(legacyClaudeCacheRoots(home), "Claude Code cache");

  // Shared namespaces — manifest only.
  const manifest = readManifest(claudeHome);
  if (!manifest) {
    writeStatus(
      `No install manifest in ${claudeHome} — leaving skills/ and agents/ untouched. ` +
        "Those files were not written by this extension (e.g. installed by " +
        "claude/setup/setup.sh); remove them with that script or by hand.",
      "Warning",
    );
    return;
  }

  await removeNamedEntries(
    path.join(claudeHome, "skills"),
    manifest.skills,
    "skill",
  );
  await removeNamedEntries(
    path.join(claudeHome, "agents"),
    manifest.agents,
    "agent",
  );

  removeManifest(claudeHome);
  writeStatus(`Removed install manifest for ${HOOK_SOURCE_TAG}`, "Success");
}
