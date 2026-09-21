// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/codexLayout.ts — where OpenAI Codex CLI reads our files from, and
// the two generated documents we write there. Mirrors host_configure() and the
// heredocs in common/setup/hosts/codex.sh, so the extension produces the same
// on-disk layout as the setup scripts:
//
//   config   ~/.codex/                      ($CODEX_HOME when set)
//   cache    ~/.codex/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/
//   skills   ~/.agents/skills/<name>/       (shared with Gemini CLI — NOT under ~/.codex)
//   agents   ~/.codex/agents/<name>.toml    (converted from the Claude .md agents)
//   hooks    ~/.codex/hooks/tizen-sdk-skills/check-*.sh + ~/.codex/hooks.json
//   context  ~/.codex/AGENTS.md             (marker-delimited guard section)
//
// Deliberately free of any `vscode` import: uninstall.ts and the plain-node
// tests use this too.
import * as path from "path";
import {
  ALL_PLUGIN_NAMES,
  HOOK_SOURCE_TAG,
  LEGACY_PLUGIN_NAMES,
  PLUGIN_NAME,
  hookCommandPath,
} from "./claudeSettings";

/** Guard scripts Codex's hooks.json dispatches to (Codex has no Skill tool). */
export const CODEX_GUARD_SCRIPTS = [
  "check-tizen-commands.sh",
  "check-project-writes.sh",
] as const;

/** VS Code extension id of OpenAI's Codex extension. */
export const CODEX_EXTENSION_IDS = ["openai.chatgpt"];

/**
 * Codex's config directory. Codex honours `CODEX_HOME`; so do the setup scripts
 * (`${CODEX_HOME:-$HOME/.codex}`), so a non-default location keeps the
 * extension and the scripts writing to the same place.
 */
export function codexHome(
  home: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.CODEX_HOME;
  return override && override.trim().length > 0
    ? override
    : path.join(home, ".codex");
}

/**
 * Codex loads skills from ~/.agents/skills, a namespace it shares with Gemini
 * CLI and with the user's own skills — hence manifest-driven removal only.
 */
export function codexSkillsDir(home: string): string {
  return path.join(home, ".agents", "skills");
}

export function codexAgentsDir(home: string): string {
  return path.join(codexHome(home), "agents");
}

function codexCacheRootFor(home: string, pluginName: string): string {
  return path.join(
    codexHome(home),
    "plugins",
    "cache",
    "tizen-platform",
    pluginName,
  );
}

/** The plugin cache root for Codex — one directory per version. */
export function codexCacheRoot(home: string): string {
  return codexCacheRootFor(home, PLUGIN_NAME);
}

/** Cache roots a pre-rename release would have written. */
export function legacyCodexCacheRoots(home: string): string[] {
  return LEGACY_PLUGIN_NAMES.map((name) => codexCacheRootFor(home, name));
}

/** The versioned plugin cache directory for Codex. */
export function codexCacheBase(home: string, version: string): string {
  return path.join(codexCacheRoot(home), version);
}

/** Version-independent guard-script directory: ~/.codex/hooks/tizen-sdk-skills/. */
export function codexHooksDir(home: string): string {
  return path.join(codexHome(home), "hooks", HOOK_SOURCE_TAG);
}

export function legacyCodexHooksDirs(home: string): string[] {
  return LEGACY_PLUGIN_NAMES.map((name) =>
    path.join(codexHome(home), "hooks", name),
  );
}

/** Codex's hook registry — same 3-level JSON shape as Claude Code's settings. */
export function codexHooksJsonPath(home: string): string {
  return path.join(codexHome(home), "hooks.json");
}

/** Codex's global instruction file (32 KiB cap). */
export function codexContextFile(home: string): string {
  return path.join(codexHome(home), "AGENTS.md");
}

/**
 * The hooks.json we write when the file is missing or already ours. Port of
 * _codex_hooks_json in hosts/codex.sh: the shell tool is literally "Bash", the
 * deny JSON is identical to Claude Code's, so the guards run unmodified.
 * `_source` is the marker a later install / uninstall recognises as ours.
 */
export function buildCodexHooksJson(hooksDir: string): string {
  const cmd = (script: string): string =>
    `bash "${hookCommandPath(hooksDir, script)}"`;
  const doc = {
    _source: PLUGIN_NAME,
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: cmd("check-tizen-commands.sh") }],
        },
        {
          matcher: "Write|Bash|apply_patch",
          hooks: [{ type: "command", command: cmd("check-project-writes.sh") }],
        },
      ],
    },
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

/**
 * Whether a hooks.json is one we wrote: its top-level `_source` is our plugin
 * id (current or pre-rename). This is the quoted-value test hosts/codex.sh
 * applies — a user file that merely *mentions* our hook path in a command
 * string is theirs, and overwriting it would drop their other hooks.
 */
export function isOurCodexHooksJson(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return false;
    const source = (parsed as { _source?: unknown })._source;
    return typeof source === "string" && ALL_PLUGIN_NAMES.includes(source);
  } catch {
    return false;
  }
}

/**
 * Host-specific lines appended inside the AGENTS.md guard section, after the
 * shared guard document. Port of _codex_guard_extra in hosts/codex.sh: the
 * shared rules name every host's cache, and only the installer knows which one
 * is THIS host's (CODEX_HOME may be non-default), so it is pinned here.
 */
export function codexGuardExtra(home: string): string {
  const cacheCli = `${codexCacheRoot(home)}${path.sep}<version>${path.sep}lib${path.sep}cli${path.sep}`;
  return [
    "**This host is Codex CLI.** Its tizen-sdk-skills runner cache is",
    `\`${cacheCli}\` — look there first (rule 8); use`,
    "another host's `~/.claude`, `~/.cline` or `~/.gemini` copy only if this one is",
    "missing. Codex spawns PowerShell on Windows: use the skill's PowerShell lookup",
    "snippet there, and the bash one elsewhere.",
    "",
    "**Codex exec waits at most 30 s per call.** Pass `yield_time_ms: 30000` on every runner",
    "call; run `launch`, `create --launch`, builds, app installs, dotnet-setup, debug setup,",
    "Playwright runs and large file transfers with `--background` (every runner accepts it;",
    "`status` shows the live script log); for installs and",
    "updates run the pre-check's `suggested_fix.background_command` (with escalated",
    "permissions — it downloads). Then poll `node <same lib/cli dir>/job-cli.js wait --id <job_id>`",
    "until `job.state` is `done` (guard rule 11). A result that is only a `[tizen-…]` progress",
    "line is not a result — the runner is still running.",
    "",
    "**Codex sandbox (guard rule 12).** The default workspace-write sandbox blocks TCP sockets,",
    "writes outside the workspace (`<sdk>`, `<sdk>-data`) and, on Linux, kills detached jobs",
    "when the call ends. Run sdb / em-cli / certificate actions, project `list-templates` and",
    "`create` (they read and sync templates under `<sdk>` — sandboxed, they list nothing),",
    "dotnet-setup and EVERY `--background` job or `job-cli.js run --script` **with escalated",
    "permissions**, keeping the command line unchanged. A `sandbox_blocked` / `sandbox_job_lost`",
    "envelope is not a tool failure — re-run its `suggested_fix.command` (your own command,",
    "`escalate: true`) escalated.",
  ].join("\n");
}
