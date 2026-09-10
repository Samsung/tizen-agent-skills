// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/cline.ts — port of cline/setup/setup.sh steps 2, 4, 5
//
// Installs the Cline on-disk layout:
//   1. Cache:  ~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/{scripts,lib,assets,docs}
//      (no skills/agents — Cline loads skills from ~/.cline/skills)
//   2. Cline skills: ~/.cline/skills/<skill-name>/  (per-skill mirror from assets)
//   3. Cline hooks:  ~/Documents/Cline/Hooks/PreToolUse + tizen-sdk-skills/check-*.sh
//   4. Cline rules:  ~/Documents/Cline/Rules/tizen-sdk-skills-guard.md
import * as fsp from "fs/promises";
import * as path from "path";
import { writeStatus, writeSection } from "../log";
import {
  mirrorDir,
  listSubdirs,
  normalizeExecDir,
  pathExists,
  pruneCacheVersions,
  removeLegacyDirs,
  removeNamedEntries,
  copyPlatformBinary,
} from "./fsutil";
import { LEGACY_PLUGIN_NAMES, PLUGIN_NAME } from "./claudeSettings";
import { readManifest, removeManifest, staleEntries } from "./manifest";

export interface ClineInstallResult {
  cacheBase: string;
  skillsDir: string;
  hooksDir: string;
  /** What we wrote into the shared skills namespace — recorded in the manifest. */
  owned: { skills: string[] };
}

/**
 * Install for Cline:
 *   - Cache sync (assets → cache, clean mirror — no skills/agents)
 *   - Cline skills sync (assets → ~/.cline/skills, per-skill mirror)
 *
 * Hooks are installed separately by hooks.ts.
 *
 * @param assetsDir The bundled assets directory inside the extension
 * @param home User home directory
 * @param version Plugin version (determines cache path)
 * @returns Install result with paths for validation and manifest recording
 */
export async function installCline(
  assetsDir: string,
  home: string,
  version: string,
): Promise<ClineInstallResult> {
  const clineHome = path.join(home, ".cline");
  const cacheBase = clineCacheBase(home, version);
  const skillsDir = path.join(clineHome, "skills");
  const hooksDir = clineHooksDir(home);

  writeSection("Cline Installation");

  // Step 1: Path validation
  writeStatus(`Cline user path: ${clineHome}`, "Info");

  // What the previous install claimed — read before anything is overwritten.
  const previous = readManifest(clineHome);

  // Ensure cache directory exists, and drop caches from other versions — and
  // from the previous plugin name, which the runner lookup no longer scans.
  await fsp.mkdir(cacheBase, { recursive: true });
  await pruneCacheVersions(clineCacheRoot(home), version, "Cline");
  await removeLegacyDirs(legacyClineCacheRoots(home), "Cline cache");

  // Step 2: Plugin cache sync (clean mirror — NO skills/agents for Cline)
  writeStatus("Plugin cache sync", "Info");
  for (const sub of ["scripts", "lib", "assets", "docs"] as const) {
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

  // Normalize shell scripts in cache
  await normalizeExecDir(path.join(cacheBase, "scripts"));

  // Step 3: Cline skills installation (~/.cline/skills, per-skill mirror)
  writeStatus("Cline skills installation (~/.cline/skills)", "Info");
  await fsp.mkdir(skillsDir, { recursive: true });

  const skillNames = await listSubdirs(path.join(assetsDir, "skills"));
  for (const skillName of skillNames) {
    await mirrorDir(
      path.join(assetsDir, "skills", skillName),
      path.join(skillsDir, skillName),
      `Cline skill: ${skillName}`,
    );
  }

  writeStatus(`Cline skills install complete: ${skillsDir}`, "Success");

  // Step 4: Prune what the previous version shipped and this one does not.
  const staleSkills = staleEntries(previous?.skills, skillNames);
  if (staleSkills.length > 0) {
    writeStatus(
      `Pruning ${staleSkills.length} skill(s) no longer shipped in v${version}`,
      "Info",
    );
    await removeNamedEntries(skillsDir, staleSkills, "stale skill");
  }

  writeStatus("Cline installation complete", "Success");

  return {
    cacheBase,
    skillsDir,
    hooksDir,
    owned: { skills: skillNames },
  };
}

/** The plugin cache root for Cline — holds one directory per version. */
export function clineCacheRoot(home: string): string {
  return clineCacheRootFor(home, PLUGIN_NAME);
}

/** Cache roots written by earlier releases under the previous plugin name. */
export function legacyClineCacheRoots(home: string): string[] {
  return LEGACY_PLUGIN_NAMES.map((name) => clineCacheRootFor(home, name));
}

function clineCacheRootFor(home: string, pluginName: string): string {
  return path.join(
    home,
    ".cline",
    "plugins",
    "cache",
    "tizen-platform",
    pluginName,
  );
}

/** The versioned plugin cache directory for Cline. */
export function clineCacheBase(home: string, version: string): string {
  return path.join(clineCacheRoot(home), version);
}

/** Where Cline loads its hooks from. */
export function clineHooksDir(home: string): string {
  return path.join(home, "Documents", "Cline", "Hooks");
}

/**
 * Remove Cline installed files (for uninstall).
 *
 * As with Claude Code: the namespaced cache always goes, ~/.cline/skills is
 * pruned from the install manifest only.
 */
export async function removeCline(home: string): Promise<void> {
  const clineHome = path.join(home, ".cline");

  // Namespaced — unambiguously ours, every version of it, under every name.
  const cacheRoot = clineCacheRoot(home);
  if (await pathExists(cacheRoot)) {
    await fsp.rm(cacheRoot, { recursive: true, force: true });
    writeStatus(`Removed all caches: ${cacheRoot}`, "Success");
  }
  await removeLegacyDirs(legacyClineCacheRoots(home), "Cline cache");

  // Shared namespace — manifest only.
  const manifest = readManifest(clineHome);
  if (!manifest) {
    writeStatus(
      `No install manifest in ${clineHome} — leaving skills/ untouched. ` +
        "Those files were not written by this extension (e.g. installed by " +
        "cline/setup/setup.sh); remove them with that script or by hand.",
      "Warning",
    );
    return;
  }

  await removeNamedEntries(
    path.join(clineHome, "skills"),
    manifest.skills,
    "skill",
  );

  removeManifest(clineHome);
}
