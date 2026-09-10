# tizen-sdk-skills

A Tizen SDK automation plugin for **Claude Code**, **Cline**, **Codex CLI**,
**Gemini CLI**, and **tizen-cli** — automates SDK installation, project creation,
building, device management, app installation, remote debugging (GDB / netcoredbg /
CDP), certificate management, and Playwright testing.

This repository is the standalone home of the plugin previously published as
`tizen-sdk-agents` inside the `tizen-ai-plugins` monorepo. The plugin id, cache
path, tizen-cli command, and environment variable were all renamed — see
[Migrating from tizen-sdk-agents](#migrating-from-tizen-sdk-agents).

## Project at a Glance

Measured on 2026-09-10 against v1.2.0. Every row can be re-measured with the
command in the last column; update this table whenever a skill, agent, command
or test suite is added.

| Area | Count | How to re-measure |
|------|-------|-------------------|
| Harnesses | 6 — Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli, VS Code extension | `ls common/setup/hosts` (4 dot-dir hosts × sh/ps1) |
| Skills (`common/skills/`) | 29 (+2 tizen-cli-only → 31 in `tizen-cli/skills/`) | `ls -d common/skills/*/ \| wc -l` |
| Agents (`common/agents/`) | 24 | `ls common/agents/*.md \| wc -l` |
| tizen-cli commands | 34 across 8 command-spec domains | `node -e "console.log(require('./tizen-cli/plugin.json').commands.length)"` |
| Error codes | 59 in the envelope registry | `node -e "console.log(Object.keys(require('./common/lib/envelope/envelope.js').ERROR_CODES).length)"` |
| Guard hooks | 3 PreToolUse scripts, 12 guard rules | `common/hooks/` |
| Unit tests (`common/lib/tests/`) | 38 files, ≈1,450 assertions | `node common/lib/tests/run-all.js` |
| VS Code extension tests | 88 cases in 3 files | `cd vscode && npm test` |
| Hook tests | 32 cases | `bash common/hooks/hooks.test.sh` |
| Integration TCs (`tests/tc/`) | 281 TCs in 274 YAML files — safe 63 / mutating 79 / device 139; approved 110 | `cd tests && node scripts/verify-doc-stats.mjs` |
| Documentation | 204 Markdown files (`docs/` 91 in en/ko pairs), 60 SKILL.md | `git ls-files \| grep -c '\.md$'` |

## Repository Structure

```
tizen-sdk-skills/           # lives at tizen-agent-skills/tizen-sdk-skills/ in the public repository
├── _repo-root/             # Staging copy of the tizen-agent-skills repository-ROOT files
│                           #   (.claude-plugin/marketplace.json → ./tizen-sdk-skills/common, .github/, LICENSE, ...
│                           #   see _repo-root/UPLOAD.md)
├── common/                 # Shared by all harnesses (single source of truth)
│   ├── .claude-plugin/     #   Claude Code plugin metadata (plugin.json)
│   ├── agents/             #   24 agent .md files (runner lookup covers .claude/.cline/.codex/.gemini)
│   ├── skills/             #   29 SKILL.md directories (runner lookup covers .claude/.cline/.codex/.gemini)
│   ├── lib/                #   CommonJS domain logic — CLI runners, core, envelope, tests
│   │   ├── cli/            #     CLI entry points (one per command, run via `node <file>`)
│   │   ├── core/           #     sdk-commands.js, plugin-cache.js, certificate, device, emulator, debug, ...
│   │   ├── envelope/       #     Standard JSON Envelope (envelope.js, envelope-wrapper.js, response-formatter.js)
│   │   └── tests/          #     Unit tests
│   ├── scripts/            #   Platform .ps1/.sh feature scripts, templates, T-CLI.md
│   ├── hooks/              #   check-tizen-commands.sh, check-project-writes.sh, check-skill-routing.sh,
│   │                       #   hooks.json, tizen-sdk-skills-guard.md (host-neutral rules for AGENTS.md / GEMINI.md)
│   ├── setup/              #   ONE setup implementation for every harness:
│   │   ├── setup.sh/.ps1   #     --harness <claude|cline|codex|gemini>
│   │   ├── setup-lib.*     #     mirror copy, compare, version, guard-section helpers
│   │   └── hosts/          #     <harness>.sh/.ps1 — paths, agent format, hooks/instructions steps
│   ├── tools/              #   Prebuilt tizen-dlog-analyzer binaries (linux/macos/windows)
│   └── assets/             #   Shared assets
├── claude/setup/           # Claude Code — 2-line wrappers: setup.sh, setup.ps1, setup.bat
├── cline/                  # Cline
│   ├── hooks/              #   PreToolUse adapter, tizen-sdk-skills-guard.md (Korean, Cline-specific rules)
│   └── setup/              #   wrappers
├── codex/setup/            # OpenAI Codex CLI — wrappers (~/.codex, ~/.agents/skills)
├── gemini/                 # Google Gemini CLI
│   ├── hooks/              #   BeforeTool adapter (Gemini hook protocol -> shared guards)
│   └── setup/              #   wrappers
├── tizen-cli/              # tizen-cli plugin harness (canonical source)
│   ├── src/                #   TypeScript shell (34 flat commands, envelope adapter, --schema/--doctor)
│   │   └── command-specs/  #   Per-domain declarative specs (sdk, check, project, device, debug, test, certificate)
│   ├── skills/             #   31 SKILL.md files for agents driving tizen-cli (29 + umbrella router + tizen-list-templates)
│   ├── esbuild.config.js   #   Build config
│   ├── plugin.json         #   tizen-cli plugin manifest (commands auto-updated on build)
│   └── package.json        #   npm/pnpm package
├── vscode/                 # VS Code extension — installs/syncs the plugin for Claude Code and Cline
├── docs/                   # Documentation (architecture, walkthroughs, deployment, envelope, ...)
├── usage/                  # Usage scenarios and real-world examples
├── tests/                  # Self-contained test suite (TC YAMLs, runner, fixtures)
└── scripts/                # Repo maintenance scripts (rewrite-runner-snippets.js, add-spdx-headers.js)
```

## Harness Separation Principle

| Directory | Role |
|-----------|------|
| **common/** | All shared logic — agents, skills, lib (CLI runners + core + envelope), scripts, hooks, Claude Code plugin metadata. The single source of truth. |
| **claude/** | Claude Code: cache + `~/.claude/{skills,agents}`; PreToolUse hooks via a `settings.json` snippet. |
| **cline/** | Cline: cache (lib/scripts/assets) + `~/.cline/skills`; PreToolUse adapter in `Documents/Cline/Hooks`, always-on rule in `Documents/Cline/Rules`. |
| **codex/** | Codex CLI: cache under `~/.codex`; skills → `~/.agents/skills`; agents → `~/.codex/agents/*.toml`; guards → `~/.codex/hooks.json` (trust once with `/hooks`); rules → `~/.codex/AGENTS.md`. |
| **gemini/** | Gemini CLI: cache under `~/.gemini`; skills → `~/.gemini/skills`; agents → `~/.gemini/agents/*.md`; `BeforeTool` adapter + `settings.json` snippet; rules → `~/.gemini/GEMINI.md`. |
| **tizen-cli/** | tizen-cli plugin harness — bundles `common/lib` + `common/scripts` into an installable CLI plugin via esbuild. |
| **vscode/** | VS Code extension — bundles `common/` and installs it into `~/.claude` / `~/.cline` from the editor. |

> Every harness mirrors the same `common/` into
> `~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`;
> `common/lib/core/plugin-cache.js` (`HOST_DOT_DIRS`, `HOST_MARKERS`) and the runner-lookup
> snippets in every agent/skill know all four dot-dirs (`.claude .cline .codex .gemini`)
> and the env var each host sets (`CLAUDECODE`, `GEMINI_CLI`, `CODEX_*`); the snippets
> pick the running host's own cache first and version-sort within a host when falling back.
> The hosts differ only in where skills/agents/hooks are loaded from and in the
> agent file format (`common/lib/tools/agent-convert.js`), plus one intentional
> behavioural difference: long-running installs (Phase 2 of `tizen-sdk-install` /
> `tizen-tv-sdk-install` / `tizen-update-package`) use the Bash tool's
> `run_in_background` + `<task-notification>` in Claude Code, but run in the
> FOREGROUND in Cline, which has no background-completion notification.
> Adding a harness = one `common/setup/hosts/<name>.{sh,ps1}` + one entry in
> `HOST_DOT_DIRS` / `HOST_MARKERS` + running `scripts/rewrite-runner-snippets.js`. The tizen-cli
> harness wraps the same `common/` logic behind `tizen-cli tizen-sdk <command>`.
> Per-harness install guide: [docs/deployment/HARNESS_SETUP.en.md](docs/deployment/HARNESS_SETUP.en.md).

## Quick Start

### Claude Code

#### Method 1: Marketplace Registration

The `tizen-agent-skills` repository ships a Claude Code marketplace manifest at its root.

```
/plugin marketplace add https://github.com/Samsung/tizen-agent-skills.git
/plugin install tizen-sdk-skills@tizen-platform
```

#### Method 2: Setup Script (user-level install)

Use this when marketplace registration is unavailable in your environment (for example,
when an organization policy restricts `strictKnownMarketplaces`) or when you want to run
from a local checkout. The setup script installs the plugin as **user-level components**,
which do not go through the marketplace system.

```bash
# 1. Clone the repository
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# 2. Run the integrated setup script (Windows)
.\claude\setup\setup.ps1

# 3. Restart Claude Code session
```

**Linux/macOS:**
```bash
bash claude/setup/setup.sh
```

The setup script performs:
- Syncs skills, agents, lib, scripts, docs to `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`
- Creates personal copies in `~/.claude/skills/`, `~/.claude/agents/` (the loading path for user-level components)
- Outputs hooks JSON snippet to register in `settings.json`

> For details, see the [Deployment & Sync Guide](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.en.md).

### Cline

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# Windows
.\cline\setup\setup.ps1
# Linux/macOS
bash cline/setup/setup.sh
```

### Codex CLI / Gemini CLI

Use the wrappers in `codex/setup/` and `gemini/setup/` the same way. See
[HARNESS_SETUP.en.md](docs/deployment/HARNESS_SETUP.en.md) for what each host
installs and where.

### tizen-cli

```bash
cd tizen-cli
pnpm install && pnpm run build   # -> dist/tizen-sdk.js + plugin.json + scripts/ + skills/
tizen-cli plugin install dist/
tizen-cli tizen-sdk --doctor
```

See [tizen-cli/README.md](tizen-cli/README.md) and [docs/tizen-cli/build-and-install.en.md](docs/tizen-cli/build-and-install.en.md).

## Migrating from tizen-sdk-agents

Everything that carried the old name was renamed; nothing is backward compatible:

| Before (`tizen-ai-plugins` monorepo) | After (this repository) |
|---|---|
| Plugin id `tizen-sdk-agents` (`plugin.json`, marketplace) | `tizen-sdk-skills` |
| Cache `~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-agents/<ver>/` | `.../tizen-platform/tizen-sdk-skills/<ver>/` |
| Hook scripts `~/.claude/hooks/tizen-sdk-agents/`, guard rule `tizen-sdk-agents-guard.md` | `~/.claude/hooks/tizen-sdk-skills/`, `tizen-sdk-skills-guard.md` |
| `tizen-cli tizen-sdk-agents <command>`, bundle `dist/tizen-sdk-agents.js` | `tizen-cli tizen-sdk <command>`, `dist/tizen-sdk.js` |
| Installed tizen-cli plugin at `~/.tizen/plugins/tizen-sdk-agents/` | `~/.tizen/plugins/tizen-sdk/` |
| `TIZEN_SDK_AGENTS_ROOT` | `TIZEN_SDK_SKILLS_ROOT` |
| Repo layout `plugins/tizen-sdk-agents/<harness>/…`, `docs/tizen-sdk-agents/…` | `<harness>/…` at the repo root, `docs/…` |

Installing this version over an existing `tizen-sdk-agents` install cleans it
up for you: the setup scripts and the VS Code extension recognise the old
`_source` tags, hook-file markers, guard-section markers and install manifest,
replace them, and delete the old cache root, hook directories and Cline guard
rule. Two things stay manual, because they live in files the scripts only print
snippets for: the Claude Code `settings.json` entries written from
`claude/setup/setup.sh` (the VS Code extension merges these automatically),
and the Gemini `settings.json` BeforeTool entry named `tizen-sdk-agents-guard`.
The tizen-cli plugin is a separate install: run
`tizen-cli plugin uninstall tizen-sdk-agents` before `tizen-cli plugin install`.

## Commands (34)

| Command | Domain | Purpose |
|---------|--------|---------|
| `sdk-init` | SDK | Configure the Tizen SDK installation path |
| `sdk-install` | SDK | Install the Tizen SDK (two-phase: pre-check + background install) |
| `sdk-install-custom-repo` | SDK | Install from a custom package repository URL |
| `validate-repo-url` | SDK | Validate a repository URL (read-only) |
| `tv-sdk-install` | SDK | Install the TV SDK extension (TV-SAMSUNG-Public) |
| `tv-sdk-install-from-zip` | SDK | Install the TV SDK extension from a local ZIP (offline, no download) |
| `update-package` | SDK | Update installed Tizen SDK packages |
| `sdk-repo-info` | SDK | Show SDK package repository information |
| `download-emulator-package` | SDK | Download and install the Tizen emulator package |
| `platform-install` | SDK | Download and install a Tizen platform package |
| `download-mobile-platform` | SDK | Download and install a Tizen Mobile platform package |
| `install-rootstrap` | SDK | Install a custom rootstrap ZIP into the SDK |
| `dotnet-setup` | SDK | Verify .NET SDK + install Tizen .NET workload |
| `check-node` | Check | Verify Node.js is installed and on PATH |
| `check-disk-space` | Check | Verify free disk space before SDK install |
| `create-project` | Project | Scaffold a Native/DotNET/WebApp/TV/Platform project (Platform produces .rpm via GBS) |
| `project-delete` | Project | Delete a Tizen project directory |
| `list-templates` | Project | List available project templates |
| `build-project` | Project | Build + package a project (.tpk/.wgt/.rpm) |
| `create-emulator` | Device | Create a custom Tizen emulator VM |
| `launch-emulator` | Device | Launch an existing emulator VM |
| `emulator-manager` | Device | Full em-cli surface (create/delete/launch/list/modify/reset/capture) |
| `device-manager` | Device | Find a connected device or stop emulators |
| `install-app` | Device | Install (and optionally run) a .tpk/.wgt/.rpm |
| `sdb-helper` | Device | Run sdb commands from natural-language requests |
| `screenshot` | Device | Capture a screenshot from an emulator or device |
| `file-transfer` | Device | Push/pull files via sdb |
| `remote-device` | Device | Scan, connect, disconnect, manage remote devices |
| `gdb-debug` | Debug | Set up remote GDB debugging (Native apps) |
| `dotnet-debug` | Debug | Set up remote netcoredbg debugging (.NET apps) |
| `webapp-debug` | Debug | Set up remote Web app debugging via RWI/CDP |
| `dlog-analyzer` | Debug | Collect dlog, detect crashes/exceptions, suggest root causes |
| `playwright-test` | Test | Run/scaffold Playwright tests against a Tizen Web app |
| `certificate-manager` | Certificate | Manage Tizen certificates and signing profiles |

## Standard JSON Envelope

All commands return a single Standard JSON Envelope on stdout; diagnostics go
to stderr only. See the [Envelope Library README](common/lib/README.md) for
details.

## Releases

Tagging `tizen-sdk-skills-vX.Y.Z` on the `tizen-agent-skills` repository runs
[release.yml](../.github/workflows/release.yml), which builds and attaches
`tizen-sdk-vX.Y.Z.zip` (tizen-cli plugin `dist/`) and
`tizen-ai-extension-vX.Y.Z.vsix` (VS Code extension) to the GitHub Release.
Releases made before the rename are not published in this repository.

## Development

```bash
pnpm install --frozen-lockfile && pnpm run lint && pnpm run format:check   # repo-wide ESLint + Prettier
node common/lib/tests/run-all.js                                          # common/lib unit tests
bash common/hooks/hooks.test.sh                                           # hook guard tests
node scripts/rewrite-runner-snippets.js --check                           # runner-lookup snippets in sync
node scripts/add-spdx-headers.js --check                                  # SPDX license headers present
cd tizen-cli && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm run build   # tizen-cli harness
cd tests && npm ci && node runner.mjs --dry-run                           # TC schema lint
```

## Contributing & Governance

- [CONTRIBUTING.md](CONTRIBUTING.md) — branch flow, commit style, test tiers, documentation pair rule
- [GOVERNANCE.md](GOVERNANCE.md) — roles, modules, decision-making, code review rules

## Usage Scenarios & Walkthroughs

- [Usage Scenarios & Walkthrough Guide](usage/usage.en.md) — end-to-end scenario guides and real-world usage examples indexed and summarized

## Related Documentation

- [Contributing Guide](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)
- [Tizen SDK Skills Detailed Documentation](docs/README.en.md)
- [Skills Reference](docs/SKILLS_REFERENCE.en.md)
- [Skills ↔ Commands Mapping](docs/SKILLS_COMMANDS_MAPPING.en.md)
- [SDK Commands Architecture](docs/SDK_COMMANDS_ARCHITECTURE.en.md)
- [SDK Layers Overview](docs/SDK_LAYERS_OVERVIEW.en.md)
- [Harness Setup](docs/deployment/HARNESS_SETUP.en.md)
- [Deployment & Sync Guide](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.en.md)
- [Integrated Setup & Sync Script](docs/deployment/CLINE_SETUP_AND_SYNC.en.md)
- [Envelope Usage Guide](docs/envelope/ENVELOPE_USAGE_GUIDE.en.md)
- [SDK Installation Guide](docs/sdk-install/INSTALLATION_FLOW.en.md)
- [Custom Repository Install](docs/sdk-install/CUSTOM_REPOSITORY_INSTALL.en.md)
- [.NET Setup E2E](docs/sdk-install/DOTNET_SETUP_E2E.en.md)
- [Native App Scenario Walkthrough](docs/project/scenario-native-app-walkthrough.en.md)
- [WebApp Debugging E2E Scenario Walkthrough](docs/debug/scenario-webapp-debug-walkthrough.en.md)
- [Native App Debugging (GDB) E2E Scenario Walkthrough](docs/debug/scenario-native-debug-walkthrough.en.md)
- [.NET App Debugging (netcoredbg) E2E Scenario Walkthrough](docs/debug/scenario-dotnet-debug-walkthrough.en.md)
- [DLog Analyzer Walkthrough](docs/debug/scenario-dlog-analyzer-walkthrough.en.md)
- [Certificate Manager Guide](docs/certificate/certificate-manager-guide.en.md)
- [Emulator Manager Walkthrough](docs/emulator/emulator-manager-walkthrough.en.md)
- [Playwright Test Walkthrough](docs/test/scenario-playwright-test-walkthrough.en.md)
- [tizen-cli Build & Install](docs/tizen-cli/build-and-install.en.md)
- [WSL Emulator Guide](docs/wsl/WSL_EMULATOR_GUIDE.en.md)
- [Platform GBS Build](docs/platform-gbs-build.en.md)
- [TV SDK Setup](docs/tv-setup/TV_SDK_SETUP.en.md)
