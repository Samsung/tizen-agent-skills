# Tizen AI Extension

A VS Code extension that installs and syncs **Tizen SDK Skills** (skills, agents, hooks) for **Claude Code**, **Cline** and **Codex CLI** — replacing the manual `setup.sh` / `setup.ps1` install flow with a one-click Marketplace-driven install.

## What it does

Installing this extension produces **exactly the same on-disk layout** as running the setup scripts:

| Target | Path | Semantics |
|---|---|---|
| Claude cache | `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/{skills,agents,scripts,lib,assets,docs}` | clean mirror |
| Claude personal skills | `~/.claude/skills/<skill-name>/` | mirror per skill folder (29 skills) |
| Claude personal agents | `~/.claude/agents/*.md` | per-file copy (24 agents) |
| Claude hooks | `~/.claude/settings.json` → 3 entries under `hooks.PreToolUse` | JSON merge |
| Cline cache | `~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/{scripts,lib,assets,docs}` | clean mirror (no skills/agents) |
| Cline skills | `~/.cline/skills/<skill-name>/` | mirror per skill folder |
| Cline hooks | `~/Documents/Cline/Hooks/PreToolUse` (+ `tizen-sdk-skills/check-*.sh`) | non-clobber |
| Cline rules | `~/Documents/Cline/Rules/tizen-sdk-skills-guard.md` | Windows fallback |
| Codex cache | `~/.codex/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/{skills,agents,scripts,lib,assets}` | clean mirror (`~/.codex` honours `CODEX_HOME`) |
| Codex skills | `~/.agents/skills/<skill-name>/` | mirror per skill folder — a cross-tool directory (Codex reads it; so may other agents such as Gemini CLI) that also holds your own skills, so removal deletes only the folders recorded in the install manifest |
| Codex agents | `~/.codex/agents/<name>.toml` | converted from the `.md` agents with the bundled `agent-convert.js` (`tools`/`model`/`maxTurns` drop) |
| Codex hooks | `~/.codex/hooks.json` + `~/.codex/hooks/tizen-sdk-skills/check-*.sh` | written only when missing or tagged `_source: tizen-sdk-skills`; otherwise the snippet is logged |
| Codex context | `~/.codex/AGENTS.md` → guard section between `<!-- tizen-sdk-skills:begin/end -->` | your own instructions are kept; a begin with no end, or an indented/quoted marker, is treated as your text and logged; CRLF files stay CRLF |

## Commands

| Command | Description |
|---|---|
| **Tizen AI: Install / Re-sync** | Manually re-run the installation (idempotent) |
| **Tizen AI: Show Install Status** | Validate installed files against bundled assets |
| **Tizen AI: Remove Installed Files** | Remove the files this extension installed (see *Clean uninstall* below) |
| **Tizen AI: Show Log** | Open the OutputChannel with install/validation logs |

## Settings

| Setting | Default | Description |
|---|---|---|
| `tizenAiExtension.targets` | `"auto"` | Which AI host(s) to install for: `"auto"`, `"claude"`, `"cline"`, `"codex"`, `"both"` (Claude Code + Cline) or `"all"` |
| `tizenAiExtension.installHooks` | `true` | Whether to install Claude Code hooks, Cline hooks/rules, and Codex `hooks.json` + the `AGENTS.md` guard section |
| `tizenAiExtension.autoSyncOnUpdate` | `true` | Automatically re-install when the extension is updated |

## How it works

1. **Auto-install on activation** — On first install, on update, and whenever the files are missing from disk, the extension automatically syncs everything to your home directory. You'll see a notification when it's done. The check consults the on-disk install manifest rather than trusting only the version recorded in `globalState`, because VS Code keeps `globalState` across an uninstall — so a uninstall/re-install of the same version still re-syncs correctly.
2. **Host detection** — In `auto` mode, the extension detects Claude Code (`~/.claude`), Cline (`~/.cline`) and Codex CLI (`~/.codex`, or `CODEX_HOME`), or the corresponding VS Code extension, and installs only for the hosts that are present. `~/.agents/skills` alone is not taken as a Codex signal, because Gemini CLI shares that directory.
3. **Hook installation** — The extension automatically merges hook entries into `~/.claude/settings.json` (the shell scripts only printed a snippet). All three hooks are installed, including `check-skill-routing.sh` which was missing from the scripts. Your original file is backed up once to `settings.json.tizen-backup`, and only entries pointing into our own hook directory are ever replaced — hooks you added yourself are left alone.
4. **Version-independent hooks** — Hook scripts are copied to `~/.claude/hooks/tizen-sdk-skills/` (a fixed path) so they survive extension updates without breaking `settings.json`.
5. **Clean uninstall** — Uninstalling the extension triggers `vscode:uninstall`. The plugin cache and the `tizen-sdk-skills/` hook directories are removed outright, our entries are stripped from `settings.json`, Codex's `hooks.json` goes only if its `_source` is ours, and our section is cut out of `~/.codex/AGENTS.md` (the file itself is removed only when nothing else was in it). `~/.claude/skills`, `~/.claude/agents`, `~/.cline/skills`, `~/.agents/skills` and `~/.codex/agents` are shared with your own definitions (and, for `~/.agents/skills`, with Gemini CLI), so only the entries recorded in `.tizen-sdk-skills-manifest.json` at install time are removed there — a skill you wrote yourself, or one installed by `setup.sh`, is never touched. If no manifest is present those directories are left alone and the log says so.

## Development

### Build and package

Once `node_modules/` is present, these need nothing on your PATH beyond `node` and `npm`:

```bash
cd vscode
npm run typecheck        # tsc --noEmit (esbuild does not typecheck)
npm test                 # build + unit tests for the vscode-free install logic
npm run build            # bundle + copy assets → dist/
npm run package          # produce .vsix
code --install-extension tizen-ai-extension-*.vsix
```

The build writes only to `dist/` — `git status` should stay clean after it.

`vsce` does **not** need a global install — it is a devDependency, and the package manager puts `node_modules/.bin` on PATH for the script. `pnpm build` / `pnpm package` are equivalent if you have pnpm on PATH; `npx vsce package` and `./node_modules/.bin/vsce package` also work.

### Installing dependencies

⚠️ **Use pnpm, not `npm install`.** This package is pnpm-managed (`pnpm-lock.yaml` + `pnpm-workspace.yaml`, no `package-lock.json`). `npm install` has no lockfile to follow, so it re-resolves the entire tree and tries to build the `keytar` / `@vscode/vsce-sign` native dependencies — extremely slow, and it may hang indefinitely behind a corporate proxy.

```bash
pnpm install
```

If `pnpm` is not on your PATH (a common case — the pnpm standalone installer does not always set it), pick one:

```powershell
# One-off, current shell only
$env:Path += ";$env:LOCALAPPDATA\pnpm\bin"

# Persistent, per-user (reopen the shell afterwards)
[Environment]::SetEnvironmentVariable('PNPM_HOME', "$env:LOCALAPPDATA\pnpm", 'User')
[Environment]::SetEnvironmentVariable('Path', "$([Environment]::GetEnvironmentVariable('Path','User'));$env:LOCALAPPDATA\pnpm\bin", 'User')

# Or let Node's bundled corepack provide the shim
corepack enable pnpm
```

> **Note:** `npm run <script>` is fine and fast — it only executes a script and installs nothing. The problem is specifically `npm install`. Relatedly, `vscode:prepublish` invokes `tsc` and `node` directly rather than delegating to another package manager: `vsce` always runs the prepublish hook through **npm**, so referencing pnpm there would break packaging in any shell where pnpm is not on PATH (Git Bash, CI). For the same reason `package` / `publish` are just `vsce package` / `vsce publish` — the prepublish hook performs the typecheck and build.

### Build verification

```bash
ls dist/assets/skills | wc -l        # 26
ls dist/assets/agents/*.md | wc -l   # 21
```

## Troubleshooting

- **No host detected**: If none of `~/.claude`, `~/.cline` or `~/.codex` exists, set `tizenAiExtension.targets` to `"claude"`, `"cline"`, `"codex"`, `"both"` or `"all"` to force installation.
- **bash not found on Windows**: Claude Code and Codex CLI hooks require bash on PATH. Install Git Bash or WSL and add it to your PATH. Installation proceeds without hook enforcement if bash is missing.
- **Codex hooks never fire**: Codex skips hooks it has not been told to trust — run `/hooks` once inside Codex after installing. If they stay inert, add `[features]` / `hooks = true` to `~/.codex/config.toml`. If `~/.codex/hooks.json` already existed and was not ours, the extension leaves it alone and logs the `PreToolUse` block to merge by hand; **Show Install Status** reports whether the file references the guard.
- **Cline hooks on Windows**: Cline hooks do not run on Windows. The guard rule (`tizen-sdk-skills-guard.md`) is installed as an always-on global rule as a fallback.
- **Settings.json merge fails**: If your `settings.json` has a syntax error — or a `hooks` section of the wrong type, such as `"PreToolUse": {}` instead of an array — the extension skips the automated merge, leaves the file untouched, and prints the reason plus the hook snippet to the OutputChannel for manual merging. Fix the file and re-run **Install / Re-sync**.
- **My settings.json got reformatted**: The merge re-serialises the document, reusing your indentation (2-space, 4-space or tabs) but expanding inline arrays such as `"allow": ["Bash"]` onto separate lines. The content is unchanged; `settings.json.tizen-backup` holds the original.
- **Hooks never fire**: Run **Show Install Status**. It reports both whether each hook script is on disk *and* whether `settings.json` actually references it — a script present but unregistered is the usual cause.
- **Remove left files behind**: Removal only deletes skills/agents listed in `.tizen-sdk-skills-manifest.json`. Files installed by `setup.sh` / `setup.ps1` predate that manifest, so remove them with those scripts or by hand; the log names the directories it skipped.
- **A skill disappeared after an update**: Updating prunes skills and agents the new version no longer ships, so a renamed or retired one is removed. Local edits to a `tizen-*` skill are also lost on every sync — the mirror is destructive by design. Keep customisations as your own separately-named skill.

## License

ISC
