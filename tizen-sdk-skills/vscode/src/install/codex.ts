// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/codex.ts — port of common/setup/setup.sh with hosts/codex.sh
//
// Installs the Codex CLI on-disk layout (paths in codexLayout.ts):
//   1. Cache:  ~/.codex/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/{skills,agents,scripts,lib,assets,tools}
//   2. Skills: ~/.agents/skills/<skill-name>/   (per-skill mirror; cross-tool directory, not Codex-private)
//   3. Agents: ~/.codex/agents/<name>.toml      (Claude .md → Codex TOML via the bundled agent-convert.js)
//
// Hooks and the AGENTS.md guard section are installed separately by hooks.ts.
import * as fsp from "fs/promises";
import { createRequire } from "module";
import * as path from "path";
import { writeStatus, writeSection } from "../log";
import {
  codexAgentsDir,
  codexCacheBase,
  codexCacheRoot,
  codexHome,
  codexSkillsDir,
  legacyCodexCacheRoots,
} from "./codexLayout";
import {
  copyPlatformBinary,
  listSubdirs,
  mirrorDir,
  normalizeExecDir,
  pathExists,
  pruneCacheVersions,
  removeLegacyDirs,
  removeNamedEntries,
} from "./fsutil";
import { readManifest, removeManifest, staleEntries } from "./manifest";

export interface CodexInstallResult {
  cacheBase: string;
  skillsDir: string;
  agentsDir: string;
  /** What we wrote into the shared namespaces — recorded in the manifest. */
  owned: { skills: string[]; agents: string[] };
}

/** The part of the bundled agent-convert.js this module calls. */
interface AgentConvertTool {
  convertPath(_to: string, _src: string, _destDir: string): string[];
}

/**
 * Cache subdirectories Codex gets — the same set hosts/codex.sh mirrors
 * (CACHE_SUBDIRS). No docs: the runner never reads them.
 */
const CODEX_CACHE_SUBDIRS = [
  "skills",
  "agents",
  "scripts",
  "lib",
  "assets",
] as const;

/**
 * Load the converter shipped in the asset tree instead of re-implementing it,
 * so the TOML the extension writes is byte-identical to what setup.sh writes.
 * The path is only known at runtime, so this is a dynamic require that esbuild
 * leaves alone.
 */
function loadAgentConverter(assetsDir: string): AgentConvertTool {
  const tool = path.join(assetsDir, "lib", "tools", "agent-convert.js");
  const req = createRequire(__filename);
  const mod: unknown = req(tool);
  if (
    !mod ||
    typeof mod !== "object" ||
    typeof (mod as AgentConvertTool).convertPath !== "function"
  ) {
    throw new Error(`${tool} does not export convertPath()`);
  }
  return mod as AgentConvertTool;
}

/**
 * Install for Codex CLI:
 *   - Cache sync (assets → cache, clean mirror)
 *   - Skills sync (assets → ~/.agents/skills, per-skill mirror)
 *   - Agents (assets/agents/*.md → ~/.codex/agents/*.toml)
 *
 * @param assetsDir The bundled assets directory inside the extension
 * @param home User home directory
 * @param version Plugin version (determines cache path)
 */
export async function installCodex(
  assetsDir: string,
  home: string,
  version: string,
): Promise<CodexInstallResult> {
  const hostHome = codexHome(home);
  const cacheBase = codexCacheBase(home, version);
  const skillsDir = codexSkillsDir(home);
  const agentsDir = codexAgentsDir(home);

  writeSection("Codex CLI Installation");

  // Step 1: Path validation
  writeStatus(`Codex config path: ${hostHome}`, "Info");
  if (process.env.CODEX_HOME) {
    writeStatus(`(from CODEX_HOME=${process.env.CODEX_HOME})`, "Info");
  }

  // What the previous install claimed — read before anything is overwritten.
  const previous = readManifest(hostHome);

  // Ensure cache directory exists, and drop caches from other versions — and
  // from the previous plugin name, which the runner lookup no longer scans.
  await fsp.mkdir(cacheBase, { recursive: true });
  await pruneCacheVersions(codexCacheRoot(home), version, "Codex CLI");
  await removeLegacyDirs(legacyCodexCacheRoots(home), "Codex CLI cache");

  // Step 2: Plugin cache sync (clean mirror)
  writeStatus("Plugin cache sync", "Info");
  for (const sub of CODEX_CACHE_SUBDIRS) {
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

  // Step 3: Skills (~/.agents/skills, per-skill mirror). The directory also
  // holds Gemini's and the user's own skills, so only our skill folders are
  // mirrored — never the directory as a whole.
  writeStatus(`Codex skills installation (${skillsDir})`, "Info");
  await fsp.mkdir(skillsDir, { recursive: true });

  const skillNames = await listSubdirs(path.join(assetsDir, "skills"));
  for (const skillName of skillNames) {
    await mirrorDir(
      path.join(assetsDir, "skills", skillName),
      path.join(skillsDir, skillName),
      `Codex skill: ${skillName}`,
    );
  }
  writeStatus(`Codex skills install complete: ${skillsDir}`, "Success");

  // Step 4: Agents — Codex loads TOML (name / description /
  // developer_instructions), so the Claude .md agents are converted rather
  // than copied. tools / model / maxTurns have no Codex equivalent and drop.
  writeStatus(`Codex agents conversion (${agentsDir})`, "Info");
  await fsp.mkdir(agentsDir, { recursive: true });
  const converter = loadAgentConverter(assetsDir);
  const written = converter.convertPath(
    "codex-toml",
    path.join(assetsDir, "agents"),
    agentsDir,
  );
  // Code-point order, not the locale's: the manifest must list the same
  // sequence on every machine so a re-install diff is meaningful.
  const agentNames = written
    .map((file) => path.basename(file))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  writeStatus(
    `Agents converted (codex-toml): ${agentNames.length} file(s) → ${agentsDir}`,
    "Success",
  );

  // Step 5: Prune what the previous version shipped and this one does not.
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

  writeStatus("Codex CLI installation complete", "Success");

  return {
    cacheBase,
    skillsDir,
    agentsDir,
    owned: { skills: skillNames, agents: agentNames },
  };
}

/**
 * Remove Codex installed files (for uninstall).
 *
 * As with the other hosts: the namespaced cache always goes; ~/.agents/skills
 * and ~/.codex/agents are pruned from the install manifest only, because they
 * also hold Gemini's skills and the user's own definitions.
 */
export async function removeCodex(home: string): Promise<void> {
  const hostHome = codexHome(home);

  // Namespaced — unambiguously ours, every version of it, under every name.
  const cacheRoot = codexCacheRoot(home);
  if (await pathExists(cacheRoot)) {
    await fsp.rm(cacheRoot, { recursive: true, force: true });
    writeStatus(`Removed all caches: ${cacheRoot}`, "Success");
  }
  await removeLegacyDirs(legacyCodexCacheRoots(home), "Codex CLI cache");

  // Shared namespaces — manifest only.
  const manifest = readManifest(hostHome);
  if (!manifest) {
    writeStatus(
      `No install manifest in ${hostHome} — leaving ${codexSkillsDir(home)} and ` +
        `${codexAgentsDir(home)} untouched. Those files were not written by this ` +
        "extension (e.g. installed by common/setup/setup.sh); remove them with " +
        "that script or by hand.",
      "Warning",
    );
    return;
  }

  await removeNamedEntries(codexSkillsDir(home), manifest.skills, "skill");
  await removeNamedEntries(codexAgentsDir(home), manifest.agents, "agent");

  removeManifest(hostHome);
}
