# Cline Setup & Plugin Sync Integration Guide

English | [한국어](CLINE_SETUP_AND_SYNC.md)

> **v0.1.0** — 2026-07-10
> Plugin cache sync + personal copy management + Cline skill installation in **one script**.
> The Cline skill/hook paths below (`~/.cline/skills/`, `~/Documents/Cline/Hooks/`) apply to
> Cline builds with skills/hooks support — check your build; upstream Cline may differ.

## Overview

The integrated setup & sync script (`setup.ps1` / `.sh` / `.bat`) handles 5 tasks at once:

| Task | Target | Sync Method |
|---|---|---|
| **① Plugin cache sync** | `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0/` | Repo → Cache, **mirror** (skills/agents/scripts/lib/docs) |
| **② Personal copy sync** | `~/.claude/skills/`, `~/.claude/agents/` | Cache → Personal, **per-skill-folder mirror** + agents `*.md` copy |
| **③ Cline skill install** | `~/.cline/skills/` | Per-skill-folder **mirror** from repo `skills/` (path loaded by Cline builds with skills support) |
| **④ Cline hook install** | `~/Documents/Cline/Hooks/`, `~/Documents/Cline/Rules/` | `PreToolUse` adapter + guard script copy — enforces same guards as Claude Code in Cline (Cline hook protocol on builds with hooks support, **Windows unsupported**, enable in settings UI). **Windows fallback**: same guards also installed as a persistent global Rule (`tizen-sdk-skills-guard.md`) |
| **⑤ Cline subagent guidance** | (no files to install) | Built into Cline builds that support subagents — Settings → Feature Settings → Agent → Subagents. Read-only research agents load skills via `use_skill`; runner execution is done by the main agent |

> ⚠️ **Mirror sync caution**: Mirror targets (cache's skills/agents/scripts/lib/docs,
> `~/.claude/skills` and `~/.cline/skills` `tizen-*` skill folders) are **deleted then re-copied**
> before each copy. Files removed from the repo will also disappear from targets.
> Non-tizen skills in these paths are not touched.

**This single script replaces** the manual procedures from
[HARNESS_SETUP.en.md](HARNESS_SETUP.en.md) (Cline installation) and
[PLUGIN_DEPLOYMENT_SYNC.md](PLUGIN_DEPLOYMENT_SYNC.md) (cache & personal copy sync),
including automated verification.

---

## Prerequisites

- **Windows**: PowerShell 5.1+ (built-in) — cmd users can use the `.bat` wrapper
- **macOS/Linux/Git Bash**: Bash 4.0+
- Plugin cache directory is **auto-created** by the script if missing
- `node` must be on PATH to actually run Cline skills (for runner execution)

---

## Quick Start

Script location: `cline/setup/`

```powershell
# Windows — PowerShell
powershell -ExecutionPolicy Bypass -File "C:\path\to\tizen-sdk-skills\cline\setup\setup.ps1"
```

```cmd
:: Windows — cmd.exe (batch wrapper, passes args through to ps1)
C:\path\to\tizen-sdk-skills\cline\setup\setup.bat
```

```bash
# macOS / Linux / Git Bash
bash ~/path/to/tizen-sdk-skills/cline/setup/setup.sh
```

After running, **restart the Claude Code session** to load new skill definitions
(Cline reads `~/.cline/skills` every session, so no restart needed for Cline).

---

## Options

### PowerShell (`setup.ps1`, `.bat` identical)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `-RepoPath` | string | Auto-calculated from script location (repo root) | tizen-sdk-skills repo path |
| `-SkipValidation` | switch | off | Skip post-install validation |
| `-NoRestart` | switch | off | Suppress restart reminder message |

```powershell
# Skip validation + no restart message (fast re-sync)
.\setup.ps1 -SkipValidation -NoRestart
```

### Bash (`setup.sh`)

| Option | Description |
|---|---|
| `--repo <path>` | Repo path (default: auto-calculated from script location) |
| `--skip-validation` | Skip post-install validation |
| `--no-restart` | Suppress restart reminder message |

```bash
bash setup.sh --repo /home/user/projects/tizen-sdk-skills
```

---

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│ Repository (source of truth)                                  │
│ <repo-root> (tizen-sdk-skills checkout)                      │
│   ├── common/{skills,agents,scripts,lib}/ │
│   ├── docs/                                                   │
│   └── common/hooks/  ← settings.json │
│       references repo absolute path directly (no copy,       │
│       edits take effect immediately)                           │
└────────────┬──────────────────────────┬───────────────────────┘
             │ ① mirror                  │ ③ per-skill-folder mirror
             ▼                          ▼
┌─────────────────────────┐   ┌──────────────────────────────┐
│ Plugin cache             │   │ ~/.cline/skills/ (Cline)   │
│ ~/.claude/plugins/cache/ │   │ ├── tizen-build-project/     │
│ .../0.1.0/               │   │ ├── tizen-create-project/    │
│ {skills,agents,scripts,  │   │ └── ... (per skill folder)    │
│  lib,docs}/              │   │ (Cline loads every session)   │
└────────────┬────────────┘   └──────────────────────────────┘
             │ ② per-skill-folder mirror + agents *.md copy
             ▼
┌─────────────────────────┐
│ Claude Code personal     │
│ ~/.claude/skills/tizen-* │  ← current actual loading path
│ ~/.claude/agents/*.md    │    (marketplace policy bypass)
└─────────────────────────┘
```

- **① Cache**: SKILL.md references CLI runners via cache path glob (`*/lib/cli/*.js`),
  so the cache must always be up-to-date with the repo. Cline skill runners also use the same cache.
- **② Personal path**: The actual skill loading path while the org policy blocks the marketplace.
  For removal procedure when policy is lifted, see [PLUGIN_DEPLOYMENT_SYNC.en.md](PLUGIN_DEPLOYMENT_SYNC.en.md).
- **③ Cline skills**: Installed per-skill-folder under `~/.cline/skills/`. Cline builds
  with skills support load skills from this path (similar to Claude Code's `~/.claude/skills`), applying to all
  workspaces. To reinstall only skills, use `install-cline-skills.ps1/.sh`.

---

## Sample Output

> Script messages are in English to avoid PowerShell 5.1 encoding issues (Korean garbling).

```
=== tizen-sdk-skills Integrated Setup and Sync ===

[Step 1] Path validation
[Info] Repository: C:\path\to\tizen-sdk-skills
[Info] Claude user path: C:\Users\<user>\.claude

[Step 2] Plugin cache sync
[Success] Skills copy complete: ... -> ...
[Success] Agents copy complete: ... -> ...
[Success] Lib copy complete: ... -> ...

[Step 3] Personal copy sync (actual loading paths)
[Success] Skill (personal): tizen-build-project copy complete: ...
[Success] Agents copy complete: ...

[Step 4] Cline skills installation (~/.cline/skills)
[Success] Cline skill: tizen-build-project copy complete: ...
[Success] ... (10 skills each)

[Step 5] Cline hooks installation (~/Documents/Cline/Hooks)
[Success] Cline PreToolUse hook installed: .../Cline/Hooks/PreToolUse
[Info] Enable the hook in the Cline settings UI (requires a Cline build with hooks support; hooks do not run on Windows)

[Step 6] Cline subagents (built-in - nothing to install)
[Info] Subagents are built into Cline builds that support them (check your build) - enable: Settings > Feature Settings > Agent > Subagents
[Info] Subagents are read-only researchers and can load the installed tizen skills via use_skill

[Step 7] Validation
[Success] Skills (repo <-> cache) : Validation passed
[Success] Lib (repo <-> cache) : Validation passed
[Success] Skill (personal): tizen-build-project : Validation passed
[Success] ... (10 skills each)
[Success] Cline skill: tizen-build-project : Validation passed
[Success] ... (10 skills each)
[Success] Cline hooks : Validation passed

=== Installation complete ===
NOTE: Claude Code restart required to load new skills.
```

---

## Validation

### Automatic Validation (Step 7 built-in)

- **Skills / Lib (repo ↔ cache)**: Recursive file count & existence comparison
- **Personal skills**: Per-skill-folder comparison between cache and personal path
  (no false positives even if other skills exist in personal path)
- **Cline skills**: Per-skill-folder comparison between `~/.cline/skills` and repo
  (no false positives even if other skills exist)
- **Cline hooks**: Verify `PreToolUse` adapter (including execute permission on bash)
  and 2 guard scripts exist

If any `[Warning]` appears, check the source/target paths for that item and re-run.

### Manual Verification (Post-Install)

```bash
# Skill recognition — should list 10 tizen skills (after session restart)
claude -p "Answer with ONLY a comma-separated list of skill names containing tizen, or NONE."

# Hook activation — should show denial + correction message
claude -p "Run exactly this bash command and report the outcome: tizen list templates"

# Plugin block status
claude plugin list
```

Manual directory consistency check (bash):

```bash
repo="$HOME/path/to/tizen-sdk-skills"
cache="$HOME/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0"
diff -rq "$repo/common/skills" "$cache/skills"   # no output = match
```

---

## Troubleshooting

### Skills Not Loading

1. Re-run the script, then **restart Claude Code session** (required)
2. Check personal path:
   ```powershell
   Get-ChildItem "$env:USERPROFILE\.claude\skills" -Directory | Where-Object Name -like "tizen*"
   ```

### `[Error] Repository path not found`

If the repo location differs from the default calculation, specify the repo root
via `-RepoPath` (PowerShell) / `--repo` (bash).

### `cannot be loaded because running scripts is disabled` (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File "...\setup.ps1"
```
Or use the `.bat` wrapper (handles Bypass internally).

### Terminal Korean Garbling

Script output is in English, so it's safe. If Windows system error messages are garbled,
run `chcp 65001`. For Cline terminal garbling, see [HARNESS_SETUP.en.md](HARNESS_SETUP.en.md) troubleshooting.

---

## Post-Install — Using in Cline

After installation, `~/.cline/skills/` structure:

```
~/.cline/skills/
├── tizen-sdk-install/       (SKILL.md — skill definition + routing)
├── tizen-create-project/
├── tizen-build-project/
├── tizen-device-manager/
├── tizen-install-app/
├── tizen-dotnet-setup/
├── tizen-dotnet-debug/
└── tizen-gdb-debug/
```

- Natural language: "make a tizen web app" → skill description routing triggers the appropriate skill
- Direct invocation: type the skill name (e.g., `/tizen-create-project`) in chat
- All 10 skills are installed under `~/.cline/skills` (including tizen-dotnet-debug)

---

## Reference: Deployment Overview

| Item | Location | Role | Sync |
|---|---|---|---|
| **Source** | `<repo>/` (tizen-sdk-skills checkout) | Original (Git tracked) | Starting point for all edits |
| **Cache** | `~/.claude/plugins/cache/.../0.1.0/` | Runner execution path (SKILL.md glob reference) | This script ① |
| **Personal** | `~/.claude/skills/`, `~/.claude/agents/` | Current actual skill loading path | This script ② |
| **Cline skills** | `~/.cline/skills/` | Cline skill loading path (builds with skills support) | This script ③ |
| **Cline hooks** | `~/Documents/Cline/Hooks/` | PreToolUse guards (builds with hooks support; macOS/Linux, enable in settings UI) | This script ④ |
| **Claude Code hooks** | Repo absolute path (`settings.json` reference) | Immediate effect | No sync needed |

**When policy is lifted**, personal copy removal procedure: see
[PLUGIN_DEPLOYMENT_SYNC.en.md](PLUGIN_DEPLOYMENT_SYNC.en.md)
"When Policy Is Lifted" section.

---

## Related Documents

- [HARNESS_SETUP.en.md](HARNESS_SETUP.en.md) — Cline porting structure, constraints, other workspace installation
- [PLUGIN_DEPLOYMENT_SYNC.md](PLUGIN_DEPLOYMENT_SYNC.md) — Deployment policy background, manual sync, restore
- [PLUGIN_DEPLOYMENT_SYNC.en.md](PLUGIN_DEPLOYMENT_SYNC.en.md) — English version of deployment sync guide
- [README.md](../README.md) — tizen-sdk-skills documentation overview
