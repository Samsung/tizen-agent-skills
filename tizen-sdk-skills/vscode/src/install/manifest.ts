// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/manifest.ts — record of exactly what we wrote into the shared
// skill/agent namespaces, so removal deletes our files and nothing else.
//
// ~/.claude/skills and ~/.claude/agents also hold the user's own definitions.
// Removing everything matching `tizen-*` there destroys hand-written skills and
// anything installed by claude/setup/setup.sh, so the manifest is the authority.
//
// Namespaced locations (the plugin cache, ~/.claude/hooks/tizen-sdk-skills/,
// ~/Documents/Cline/Hooks/tizen-sdk-skills/) are unambiguously ours and are
// removed without consulting the manifest.
//
// No `vscode` import: the standalone uninstall process reads this too.
import * as fs from "fs";
import * as path from "path";
import { LEGACY_PLUGIN_NAMES, PLUGIN_NAME } from "./claudeSettings";

export const MANIFEST_NAME = `.${PLUGIN_NAME}-manifest.json`;

/**
 * Manifest file names earlier releases wrote. Read as a fallback so an update
 * across the rename still knows what the previous install owns; removed once
 * the current manifest has been written.
 */
export const LEGACY_MANIFEST_NAMES = LEGACY_PLUGIN_NAMES.map(
  (name) => `.${name}-manifest.json`,
);

export interface HostManifest {
  /** Extension version that produced this install. */
  version: string;
  /** ISO-8601 timestamp. */
  installedAt: string;
  /** Skill folder names written under <hostHome>/skills. */
  skills: string[];
  /** Agent file names written under <hostHome>/agents. */
  agents: string[];
}

export function manifestPath(hostHome: string): string {
  return path.join(hostHome, MANIFEST_NAME);
}

/** Every manifest path a previous install may have left: current first. */
function allManifestPaths(hostHome: string): string[] {
  return [MANIFEST_NAME, ...LEGACY_MANIFEST_NAMES].map((name) =>
    path.join(hostHome, name),
  );
}

/**
 * The install manifest, or undefined when there is none. The current file name
 * wins; a manifest written under a legacy name is used when that is all there
 * is, so the previous install's skills/agents can still be pruned or removed.
 */
export function readManifest(hostHome: string): HostManifest | undefined {
  for (const file of allManifestPaths(hostHome)) {
    const manifest = readManifestFile(file);
    if (manifest) return manifest;
  }
  return undefined;
}

function readManifestFile(file: string): HostManifest | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    if (!Array.isArray(parsed.skills) || !Array.isArray(parsed.agents))
      return undefined;
    return {
      version: typeof parsed.version === "string" ? parsed.version : "unknown",
      installedAt:
        typeof parsed.installedAt === "string" ? parsed.installedAt : "",
      skills: parsed.skills.filter(isSafeName),
      agents: parsed.agents.filter(isSafeName),
    };
  } catch {
    return undefined;
  }
}

/**
 * Write the manifest under the current name. Any legacy-named manifest is
 * removed at the same time: the new file now describes the install, and a
 * stale legacy copy would otherwise shadow nothing but confuse a later read.
 */
export function writeManifest(hostHome: string, manifest: HostManifest): void {
  fs.mkdirSync(hostHome, { recursive: true });
  fs.writeFileSync(
    manifestPath(hostHome),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
  for (const name of LEGACY_MANIFEST_NAMES) {
    fs.rmSync(path.join(hostHome, name), { force: true });
  }
}

/** Remove the manifest under every name it may have been written as. */
export function removeManifest(hostHome: string): void {
  for (const file of allManifestPaths(hostHome)) {
    fs.rmSync(file, { force: true });
  }
}

/**
 * Whether the on-startup sync must run.
 *
 * `recordedVersion` is the `installedVersion` kept in the extension's
 * `globalState`. It cannot be the only signal: VS Code persists `globalState` in
 * the shared `state.vscdb` and does NOT clear it on uninstall — it only removes
 * the extension's `globalStorage/<id>/` directory. So uninstall (which deletes
 * every installed file) followed by a re-install of the SAME version leaves
 * `recordedVersion` matching while nothing is on disk, and the sync would be
 * skipped silently. The per-host manifest is the on-disk witness: uninstall
 * removes it, so a missing or stale entry forces a re-sync.
 *
 * @param installedVersions manifest version per *targeted* host; `undefined`
 *                          for a host with no manifest on disk.
 */
export function needsSync(
  extVersion: string,
  recordedVersion: string | undefined,
  installedVersions: (string | undefined)[],
): boolean {
  if (recordedVersion !== extVersion) return true;
  return installedVersions.some((version) => version !== extVersion);
}

/**
 * Names the previous install wrote that this one no longer ships.
 *
 * Without pruning these, a skill or agent dropped (or renamed) between versions
 * lingers forever: the skill mirror is per-name and the agent copy only
 * overwrites, so nothing deletes it — and the manifest about to be written
 * would no longer claim it, so even uninstall would leave it behind while the
 * host keeps loading the stale definition.
 */
export function staleEntries(
  previous: string[] | undefined,
  current: string[],
): string[] {
  if (!previous) return [];
  const keep = new Set(current);
  return previous.filter((name) => !keep.has(name));
}

/**
 * A manifest entry must be a bare file/folder name. Anything with a separator
 * or a `..` segment is rejected so a tampered manifest cannot walk out of the
 * skills/agents directory during removal.
 */
export function isSafeName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    name === path.basename(name) &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}
