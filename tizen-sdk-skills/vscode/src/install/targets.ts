// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/targets.ts — host identification rules and target resolution.
//
// Deliberately free of any `vscode` import so this logic is unit-testable in a
// plain Node process (see src/test/pure.test.ts).

export interface DetectedHosts {
  claude: boolean;
  cline: boolean;
}

/** Exact VS Code extension ids for Claude Code. */
export const CLAUDE_EXTENSION_IDS = ["anthropic.claude-code"];

/** Exact VS Code extension ids for Cline (upstream + nightly). */
export const CLINE_EXTENSION_IDS = [
  "saoudrizwan.claude-dev",
  "saoudrizwan.claude-dev-nightly",
];

/**
 * Extension *names* (the part after the publisher) that identify a Cline build.
 * Forks republish under a different publisher but keep
 * the extension name, so the name half is the reliable half.
 */
const CLINE_NAME_PREFIXES = ["cline", "claude-dev"];

/** Extension *names* that identify a Claude Code build. */
const CLAUDE_NAME_PREFIXES = ["claude-code"];

function extensionName(id: string): string {
  const dot = id.indexOf(".");
  return dot === -1 ? id : id.slice(dot + 1);
}

function matchesPrefix(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => name === p || name.startsWith(p + "-"));
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

  if (CLINE_EXTENSION_IDS.includes(lower))
    return { claude: false, cline: true };
  if (CLAUDE_EXTENSION_IDS.includes(lower))
    return { claude: true, cline: false };

  const name = extensionName(lower);
  if (matchesPrefix(name, CLINE_NAME_PREFIXES))
    return { claude: false, cline: true };
  if (matchesPrefix(name, CLAUDE_NAME_PREFIXES))
    return { claude: true, cline: false };

  return { claude: false, cline: false };
}

/**
 * Resolve the effective install targets from the `targets` setting and what was
 * detected on disk / in the extension host.
 */
export function resolveTargets(
  configTargets: string,
  detected: DetectedHosts,
): DetectedHosts {
  switch (configTargets) {
    case "claude":
      return { claude: true, cline: false };
    case "cline":
      return { claude: false, cline: true };
    case "both":
      return { claude: true, cline: true };
    case "auto":
    default:
      return detected;
  }
}
