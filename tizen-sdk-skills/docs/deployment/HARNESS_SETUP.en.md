# Harness Setup Guide — Claude Code · Cline · Codex CLI · Gemini CLI

One implementation installs tizen-sdk-skills into every supported AI harness:

```
common/setup/setup.sh   --harness <claude|cline|codex|gemini> [--repo <path>] [--skip-validation] [--no-restart]
common/setup/setup.ps1  -Harness  <claude|cline|codex|gemini> [-RepoPath <path>] [-SkipValidation] [-NoRestart]
```

Each harness directory ships thin wrappers so the familiar entry points still work:

| Harness | Linux / macOS / Git Bash | Windows PowerShell | Windows cmd |
|---|---|---|---|
| Claude Code | `bash claude/setup/setup.sh` | `.\claude\setup\setup.ps1` | `claude\setup\setup.bat` |
| Cline | `bash cline/setup/setup.sh` | `.\cline\setup\setup.ps1` | `…\cline\setup\setup.bat` |
| Codex CLI | `bash codex/setup/setup.sh` | `.\codex\setup\setup.ps1` | `…\codex\setup\setup.bat` |
| Gemini CLI | `bash gemini/setup/setup.sh` | `.\gemini\setup\setup.ps1` | `…\gemini\setup\setup.bat` |

Prerequisites: `node` on PATH (the CLI runners need it; the setup uses it to read
`plugin.json` and to convert agent definitions). On Windows, `bash` (Git Bash) on
PATH is required for the hooks of every harness.

## What gets installed where

All harnesses share the cache convention
`~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/` — this is
what `common/lib/core/plugin-cache.js` (`HOST_DOT_DIRS`) and the runner-lookup
snippet in every agent/skill search.

| | Claude Code | Cline | Codex CLI | Gemini CLI |
|---|---|---|---|---|
| Dot-dir | `~/.claude` | `~/.cline` | `~/.codex` (`$CODEX_HOME`) | `~/.gemini` |
| Cache contents | skills agents scripts lib assets tools docs | scripts lib assets tools docs | skills agents scripts lib assets tools docs | skills agents scripts lib assets tools docs |
| Skills | `~/.claude/skills/<n>/` | `~/.cline/skills/<n>/` | `~/.agents/skills/<n>/` (shared with Gemini) | `~/.gemini/skills/<n>/` |
| Agents | `~/.claude/agents/*.md` (verbatim) | — (Cline subagents are built in, on builds that support them) | `~/.codex/agents/*.toml` (`name`, `description`, `developer_instructions`) | `~/.gemini/agents/*.md` (tools mapped to Gemini names, `maxTurns` → `max_turns`, `model` dropped) |
| Guards (hooks) | `~/.claude/hooks/tizen-sdk-skills/*.sh` + entries merged into `settings.json` `hooks.PreToolUse` (all 3 hooks; snippet printed only when the file cannot be parsed) | `Documents/Cline/Hooks/PreToolUse` adapter + guards (Cline builds with hooks support; macOS/Linux only) | `~/.codex/hooks/tizen-sdk-skills/*.sh` + `~/.codex/hooks.json` written (or a merge snippet if a foreign `hooks.json` exists) | `~/.gemini/hooks/tizen-sdk-skills/BeforeTool` adapter + guards; `settings.json` `hooks.BeforeTool` entry merged (snippet printed only when the file cannot be parsed) |
| Always-on rules | — | `Documents/Cline/Rules/tizen-sdk-skills-guard.md` (Korean) | `~/.codex/AGENTS.md` — marker-delimited section | `~/.gemini/GEMINI.md` — marker-delimited section |
| Host marker used by lookup snippets | `CLAUDECODE=1` | none (default) | any `CODEX_*` var Codex injects into its shells: `CODEX_THREAD_ID`, `CODEX_SANDBOX_NETWORK_DISABLED` (default sandbox), `CODEX_SANDBOX` (macOS), `CODEX_VERSION` | `GEMINI_CLI=1` |

The guard scripts themselves (`common/hooks/check-tizen-commands.sh`,
`check-project-writes.sh`) are identical for every harness. Codex CLI speaks the
same PreToolUse JSON as Claude Code (shell tool is literally `Bash`, deny is
`hookSpecificOutput.permissionDecision`), so they run unmodified there; Cline and
Gemini get a ~60-line adapter that renames the tool and converts the deny JSON.

The marker-delimited section in `AGENTS.md` / `GEMINI.md` is
`<!-- tizen-sdk-skills:begin --> … <!-- tizen-sdk-skills:end -->`; re-running the
setup replaces the section in place and never touches the rest of the file.

## After installing

**Claude Code** — the setup already merged the `hooks.PreToolUse` entries into
`~/.claude/settings.json` (a snippet is printed only when the file could not be
parsed — merge it by hand then). Restart the session.


**Cline** — enable Hooks and Subagents once in the Cline settings UI (this applies to
Cline builds with hooks/skills support — check your build; upstream Cline may differ.
Hooks are inert on Windows; the Rules file covers that case).

**Codex CLI**
1. Restart Codex and run `/hooks` — hooks written by a script are **untrusted
   until you approve them there**.
2. If they still do not fire, add to `~/.codex/config.toml`:
   ```toml
   [features]
   hooks = true
   ```
3. `/skills` should list the tizen skills (read from `~/.agents/skills`), `/agent`
   the tizen agents.
4. Codex's exec tool waits **at most 30 s per call**. The runners return inside that for
   list / create / delete; for `launch`, `create --launch`, builds, app installs,
   dotnet-setup, debug setup, Playwright runs and large file transfers the skills and
   `AGENTS.md` (guard rule 11) tell Codex to add `--background` (every runner accepts it)
   and poll `node <lib/cli>/job-cli.js wait --id <job_id>`, whose `progress_tail`/`log_file`
   show the live script output (e.g. the `tz build` log). Installs and updates (SDK, TV SDK,
   platform, emulator/mobile packages, rootstrap, update-package) are two-phase: the
   pre-check runner returns a `suggested_fix` whose `background_command`
   (`node <lib/cli>/job-cli.js run --script <group> …`) detaches the installer script as a
   job — run it **with escalated permissions** (the default sandbox sets
   `CODEX_SANDBOX_NETWORK_DISABLED=1` and installers download) and poll the same way. If Codex ever shows only a
   `[tizen-…]` progress line and no JSON envelope, the runner was still running — that
   is not a result (issue #48). After updating the plugin, re-run the Codex setup so
   `~/.codex/AGENTS.md` gains rule 11 (and, on Windows, is written as real UTF-8 —
   older installs turned every em dash into `??`).
5. Codex's default `workspace-write` **sandbox** blocks TCP sockets
   (`CODEX_SANDBOX_NETWORK_DISABLED=1`), writes outside the workspace (`<sdk>`, `<sdk>-data`
   profiles.xml / keystore `.pwd`, `~/.tizen*`) and, on Linux (bubblewrap PID namespace),
   kills detached jobs the moment the exec call ends — issue #81's build job "exited without
   writing its result" within milliseconds. The runners now detect the sandbox
   (`lib/core/sandbox.js`): `--background` and `job-cli.js run --script` are refused up front
   with `error_category: sandbox_blocked` and a `suggested_fix.command` equal to the typed
   command (`escalate: true`); other failures inside the sandbox gain a "Running inside
   Codex's sandbox" warning and, when the error text is a permission/network block, an extra
   `sandbox_blocked` error. Guard rule 12 lists what must run with escalated permissions
   (sdb, em-cli, certificate actions, dotnet-setup, every detached job). `TIZEN_SANDBOX=off`
   restores the old behaviour; `TIZEN_SANDBOX=on` forces it when the marker is absent
   (`network_access = true`). Re-run the Codex setup so `AGENTS.md` gains rule 12.

**Gemini CLI**
1. The setup already merged the `hooks.BeforeTool` entry into
   `~/.gemini/settings.json` (a snippet is printed only when the file could not
   be parsed — merge it by hand then).
2. Restart; `/skills list` and `/agents` should show the tizen entries.

3. Agent `tools` were mapped `Bash→run_shell_command`, `Read→read_file`,
   `Glob→glob`, `Grep→search_file_content`, `Write→write_file`, `Edit→replace`.
   If `/agents` rejects a definition, report the tool name it complains about.

## Verifying

```bash
# 1. Setup itself validates: every "(repo <-> cache)" and "Skill (...)" line must say
#    "Validation passed"; the hooks/context line must too.

# 2. Runner lookup from a skill snippet (any harness), e.g. sdk-init:
ls "$HOME"/.{claude,cline,codex,gemini}/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-init-cli.js

# 3. Hook smoke test — Gemini adapter (Codex/Claude: pipe the same payload into
#    ~/.codex/hooks/tizen-sdk-skills/check-tizen-commands.sh with tool_name "Bash")
printf '%s' '{"tool_name":"run_shell_command","tool_input":{"command":"tizen build-native"}}' \
  | bash ~/.gemini/hooks/tizen-sdk-skills/BeforeTool
# → {"decision":"deny","reason":"The tizen CLI ... is NOT available ..."}

# 4. Markdown snippets and plugin-cache.js agree on the host list (also a unit test):
node scripts/rewrite-runner-snippets.js --check
```

## Re-running and removing

The setup is idempotent: the cache is a clean mirror, personal skill folders are
replaced per skill, agent files are overwritten, and the instruction-file section
is replaced in place.

To remove a harness install by hand:

```bash
rm -rf ~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills
rm -rf <skills-dir>/tizen-*                 # see the table for <skills-dir>
rm -f  <agents-dir>/tizen-*.md <agents-dir>/tizen-*.toml
rm -rf ~/<dot-dir>/hooks/tizen-sdk-skills   # codex / gemini
# then delete the tizen-sdk-skills section from AGENTS.md / GEMINI.md and the
# hooks entries from settings.json / hooks.json
```

## Adding another harness

1. `common/lib/core/plugin-cache.js`: add the dot-dir to `HOST_DOT_DIRS`, its
   env markers to `HOST_MARKERS` (an empty list means "default host"), and its
   place in `HOST_DETECT_ORDER` if it has markers.
2. `node scripts/rewrite-runner-snippets.js` — regenerates the bash and
   PowerShell lookup snippets in every agent/skill/doc from those tables
   (own host first, then every host, version-sorted per host);
   `common/lib/tests/plugin-cache.test.js` fails until this is done.
3. `common/setup/hosts/<name>.sh` and `<name>.ps1` — paths, cache subdirs, agent
   format (`md` | `gemini-md` | `toml` | `none`, extend `agent-convert.js` for a
   new format), hooks/instructions steps.
4. `<name>/setup/setup.{sh,ps1,bat}` wrappers (copy any existing pair and change
   the harness name).

## Known gaps (Phase 2)

- Gemini CLI agent `tools` names and the Gemini extension `hooks/hooks.json`
  schema have not been exercised against a live Gemini CLI yet.
- Codex CLI's write-tool `tool_name` is unconfirmed; the `check-project-writes`
  matcher is `Write|Bash|apply_patch` to cover the likely names.
- Native packaging — a Gemini extension (`gemini-extension.json`) and a Codex
  plugin (`.codex-plugin/plugin.json` + marketplace) — and the VS Code extension's
  host table are not yet extended to Codex/Gemini.
