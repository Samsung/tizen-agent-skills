// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/targets.ts — host identification rules and target resolution.
//
// Deliberately free of any `vscode` import so this logic is unit-testable in a
// plain Node process (see src/test/pure.test.ts).
import { CODEX_EXTENSION_IDS } from "./codexLayout";

export interface DetectedHosts {
  claude: boolean;
  cline: boolean;
  codex: boolean;
}

export const NO_HOSTS: DetectedHosts = {
  claude: false,
  cline: false,
  codex: false,
};

/** Exact VS Code extension ids for Claude Code. */
export const CLAUDE_EXTENSION_IDS = ["anthropic.claude-code"];

/** Exact VS Code extension ids for Cline (upstream + nightly). */
export const CLINE_EXTENSION_IDS = [
  "saoudrizwan.claude-dev",
  "saoudrizwan.claude-dev-nightly",
];

export { CODEX_EXTENSION_IDS };

/**
 * Extension *names* (the part after the publisher) that identify a Cline build.
 * Forks republish under a different publisher but keep
 * the extension name, so the name half is the reliable half.
 */
const CLINE_NAME_PREFIXES = ["cline", "claude-dev"];

/** Extension *names* that identify a Claude Code build. */
const CLAUDE_NAME_PREFIXES = ["claude-code"];

/** Extension *names* that identify a Codex build. */
const CODEX_NAME_PREFIXES = ["codex"];

function extensionName(id: string): string {
  const dot = id.indexOf(".");
  return dot === -1 ? id : id.slice(dot + 1);
}

function matchesPrefix(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => name === p || name.startsWith(p + "-"));
}

function only(host: keyof DetectedHosts): DetectedHosts {
  return { ...NO_HOSTS, [host]: true };
}

/**
 * Map a VS Code extension id to the host it represents.
 *
 * Never matches on a substring of the whole id: Cline's own id is
 * `saoudrizwan.claude-dev`, which contains "claude" and does *not* contain
 * "cline" — a substring test identifies it as Claude Code and misses Cline
 * entirely. Matching is exact-id first, then on the extension name only.
 */
export function matchHostByExtensionId(id: string): DetectedHosts {
  const lower = id.toLowerCase();

  if (CLINE_EXTENSION_IDS.includes(lower)) return only("cline");
  if (CLAUDE_EXTENSION_IDS.includes(lower)) return only("claude");
  if (CODEX_EXTENSION_IDS.includes(lower)) return only("codex");

  const name = extensionName(lower);
  if (matchesPrefix(name, CLINE_NAME_PREFIXES)) return only("cline");
  if (matchesPrefix(name, CLAUDE_NAME_PREFIXES)) return only("claude");
  if (matchesPrefix(name, CODEX_NAME_PREFIXES)) return only("codex");

  return { ...NO_HOSTS };
}

/**
 * Resolve the effective install targets from the `targets` setting and what was
 * detected on disk / in the extension host.
 *
 * `both` keeps its pre-Codex meaning (Claude Code + Cline) so existing
 * settings behave as before; `all` is every supported host.
 */
export function resolveTargets(
  configTargets: string,
  detected: DetectedHosts,
): DetectedHosts {
  switch (configTargets) {
    case "claude":
      return only("claude");
    case "cline":
      return only("cline");
    case "codex":
      return only("codex");
    case "both":
      return { claude: true, cline: true, codex: false };
    case "all":
      return { claude: true, cline: true, codex: true };
    case "auto":
    default:
      return detected;
  }
}

/** True when no host is targeted at all. */
export function noTargets(t: DetectedHosts): boolean {
  return !t.claude && !t.cline && !t.codex;
}

/** Human-readable list of the targeted hosts, for log and notification text. */
export function targetLabels(t: DetectedHosts): string {
  const names: string[] = [];
  if (t.claude) names.push("Claude Code");
  if (t.cline) names.push("Cline");
  if (t.codex) names.push("Codex CLI");
  return names.join(" / ");
}
