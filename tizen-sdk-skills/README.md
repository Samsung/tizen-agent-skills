# tizen-sdk-skills

English | [한국어](README.ko.md)

A Tizen SDK automation plugin for **Claude Code**, **Cline**, **Codex CLI**,
**Gemini CLI**, **tizen-cli** and **VS Code** — automates SDK installation, project
creation, building, device management, app installation, remote debugging
(GDB / netcoredbg / CDP), certificate management, and Playwright testing.

## Quick Start

### Prerequisites

- **Node.js 20+** on `PATH` — the CLI runners behind every skill need it
  (`check-node` verifies this).
- **Git** to clone the repository.
- One of the supported hosts: Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli
  or VS Code.
- Windows, Linux or macOS. WSL is supported for the emulator — see the
  [WSL Emulator Guide](docs/wsl/WSL_EMULATOR_GUIDE.en.md).
- **pnpm** (tizen-cli harness only).

The Tizen SDK itself does **not** need to be pre-installed — the `tizen-sdk-install`
skill installs it for you.

### Claude Code

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# Windows
.\claude\setup\setup.ps1
# Linux/macOS
bash claude/setup/setup.sh
```

The setup script installs the plugin from the local checkout as **user-level components**:

- Syncs skills, agents, lib, scripts, docs to `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`
- Creates personal copies in `~/.claude/skills/`, `~/.claude/agents/` (the loading path for user-level components)
- Prints a hooks JSON snippet to register in `settings.json`

Restart your Claude Code session afterwards. For details, see the
[Deployment & Sync Guide](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.en.md).

### Cline

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# Windows
.\cline\setup\setup.ps1
# Linux/macOS
bash cline/setup/setup.sh
```

Restart Cline (or reload the VS Code window) afterwards.

### Codex CLI / Gemini CLI

Use the wrappers in `codex/setup/` and `gemini/setup/` the same way, then restart the
host. See [HARNESS_SETUP.en.md](docs/deployment/HARNESS_SETUP.en.md) for what each host
installs and where.

### VS Code extension

The **Tizen AI Extension** installs and syncs the plugin for Claude Code and Cline from
inside the editor, with no scripts to run. Download `tizen-ai-extension-vX.Y.Z.vsix` from
the [GitHub Releases](https://github.com/Samsung/tizen-agent-skills/releases) page and
install it:

```bash
code --install-extension tizen-ai-extension-vX.Y.Z.vsix
```

The extension auto-installs on activation and merges the Claude Code hooks into
`settings.json` for you. See [vscode/README.md](vscode/README.md) for settings,
commands and building from source.

### tizen-cli

```bash
cd tizen-cli
pnpm install && pnpm run build   # -> dist/tizen-sdk.js + plugin.json + scripts/ + skills/
tizen-cli plugin install dist/
tizen-cli tizen-sdk --doctor
```

See [tizen-cli/README.md](tizen-cli/README.md) and [docs/tizen-cli/build-and-install.en.md](docs/tizen-cli/build-and-install.en.md).

### Using natural language

Once installed, no commands need to be memorised — just describe what you want in
your AI coding assistant, in English or Korean, and the matching skill or agent
runs the right Tizen SDK tool for you:

```
Install the Tizen SDK
Create a Tizen web app called HelloTizen
Build this project and install it on the emulator
Launch the emulator and show me the connected devices
Debug this native app with GDB
The app crashed — analyse the dlog
타이젠 SDK 설치해줘
웹앱 만들어서 에뮬레이터에 설치해줘
```

Each request is routed to a skill (for example `tizen-sdk-install`, `tizen-create-project`,
`tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`, `tizen-dlog-analyzer`) that
locates the installed SDK, runs the underlying `tizen` / `sdb` / `em-cli` commands and
returns the result as a Standard JSON Envelope. See the
[Usage Scenarios & Walkthrough Guide](usage/usage.en.md) for end-to-end examples and the
[Skills Reference](docs/SKILLS_REFERENCE.en.md) for the full list of trigger phrases.

## Commands (34)

Every command below is exposed as a skill named `tizen-<command>` in the AI hosts
(for example `tizen-build-project`) and as `tizen-cli tizen-sdk <command>` in tizen-cli.
See [Skills ↔ Commands Mapping](docs/SKILLS_COMMANDS_MAPPING.en.md) for the exact
correspondence.

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

## Architecture

### Repository Structure

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

### Harness Separation Principle

| Directory | Role |
|-----------|------|
| **common/** | All shared logic — agents, skills, lib (CLI runners + core + envelope), scripts, hooks, Claude Code plugin metadata. The single source of truth. |
| **claude/** | Claude Code: cache + `~/.claude/{skills,agents}`; PreToolUse hooks via a `settings.json` snippet. |
| **cline/** | Cline: cache (lib/scripts/assets) + `~/.cline/skills`; PreToolUse adapter in `Documents/Cline/Hooks`, always-on rule in `Documents/Cline/Rules`. |
| **codex/** | Codex CLI: cache under `~/.codex`; skills → `~/.agents/skills`; agents → `~/.codex/agents/*.toml`; guards → `~/.codex/hooks.json` (trust once with `/hooks`); rules → `~/.codex/AGENTS.md`. |
| **gemini/** | Gemini CLI: cache under `~/.gemini`; skills → `~/.gemini/skills`; agents → `~/.gemini/agents/*.md`; `BeforeTool` adapter + `settings.json` snippet; rules → `~/.gemini/GEMINI.md`. |
| **tizen-cli/** | tizen-cli plugin harness — bundles `common/lib` + `common/scripts` into an installable CLI plugin via esbuild. |
| **vscode/** | VS Code extension — bundles `common/` and installs it into `~/.claude` / `~/.cline` from the editor. |

Every harness mirrors the same `common/` into
`~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`, and the runner
lookup in every agent/skill knows all four dot-dirs, preferring the running host's own
cache. Hosts differ only in where skills, agents and hooks are loaded from and in the
agent file format; the one intentional behavioural difference is that long-running
installs run in the background in Claude Code but in the foreground in Cline, which has
no background-completion notification. Host detection, the runner-lookup snippets and
the steps for adding a new harness are documented in
[HARNESS_SETUP.en.md](docs/deployment/HARNESS_SETUP.en.md).

### Standard JSON Envelope

All commands return a single Standard JSON Envelope on stdout; diagnostics go
to stderr only. See the [Envelope Library README](common/lib/README.md) and the
[Envelope Usage Guide](docs/envelope/ENVELOPE_USAGE_GUIDE.en.md) for details.

## Troubleshooting & Uninstall

- **A skill is not picked up** — make sure the host was restarted after setup, then
  re-run the setup script. The setup is idempotent: the cache is a clean mirror and
  personal skill/agent files are replaced in place.
- **`node` not found** — the runners need Node.js 20+ on `PATH`; ask the assistant to
  "check node" (`check-node`) or run `node --version`.
- **tizen-cli** — `tizen-cli tizen-sdk --doctor` reports the SDK path, cache and
  runner status.
- **Uninstall** — the VS Code extension removes everything it installed when
  uninstalled. For script installs, delete the cache root
  `~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills`, the `tizen-*` skill
  folders and agent files, and the hook/instruction entries; the exact paths per host
  are listed under *Re-running and removing* in
  [HARNESS_SETUP.en.md](docs/deployment/HARNESS_SETUP.en.md).

## Development

### Local checks

```bash
pnpm install --frozen-lockfile && pnpm run lint && pnpm run format:check   # repo-wide ESLint + Prettier
node common/lib/tests/run-all.js                                          # common/lib unit tests
bash common/hooks/hooks.test.sh                                           # hook guard tests
node scripts/rewrite-runner-snippets.js --check                           # runner-lookup snippets in sync
node scripts/add-spdx-headers.js --check                                  # SPDX license headers present
cd tizen-cli && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm run build   # tizen-cli harness
cd tests && npm ci && node runner.mjs --dry-run                           # TC schema lint
```

### Project at a Glance

Measured on 2026-09-10 against v1.2.0. Every row can be re-measured with the
command in the last column; update this table whenever a skill, agent, command
or test suite is added.

| Area | Count | How to re-measure |
|------|-------|-------------------|
| Harnesses | 6 — Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli, VS Code extension | `ls common/setup/hosts` (4 dot-dir hosts × sh/ps1) + `tizen-cli/` + `vscode/` |
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

### Releases

Tagging `tizen-sdk-skills-vX.Y.Z` on the `tizen-agent-skills` repository runs
[release.yml](../.github/workflows/release.yml), which builds and attaches
`tizen-sdk-vX.Y.Z.zip` (tizen-cli plugin `dist/`) and
`tizen-ai-extension-vX.Y.Z.vsix` (VS Code extension) to the GitHub Release.
Changes per version are recorded in [CHANGELOG.md](CHANGELOG.md). Releases made
before the plugin moved to this repository are not republished here.

## Documentation

**Getting started**

- [Usage Scenarios & Walkthrough Guide](usage/usage.en.md) — end-to-end scenario guides and real-world examples
- [SDK Installation Guide](docs/sdk-install/INSTALLATION_FLOW.en.md)
- [Custom Repository Install](docs/sdk-install/CUSTOM_REPOSITORY_INSTALL.en.md)
- [.NET Setup E2E](docs/sdk-install/DOTNET_SETUP_E2E.en.md)
- [TV SDK Setup](docs/tv-setup/TV_SDK_SETUP.en.md)
- [WSL Emulator Guide](docs/wsl/WSL_EMULATOR_GUIDE.en.md)

**Walkthroughs**

- [Native App Scenario](docs/project/scenario-native-app-walkthrough.en.md)
- [WebApp Debugging (RWI/CDP)](docs/debug/scenario-webapp-debug-walkthrough.en.md)
- [Native App Debugging (GDB)](docs/debug/scenario-native-debug-walkthrough.en.md)
- [.NET App Debugging (netcoredbg)](docs/debug/scenario-dotnet-debug-walkthrough.en.md)
- [DLog Analyzer](docs/debug/scenario-dlog-analyzer-walkthrough.en.md)
- [Certificate Manager Guide](docs/certificate/certificate-manager-guide.en.md)
- [Emulator Manager](docs/emulator/emulator-manager-walkthrough.en.md)
- [Playwright Test](docs/test/scenario-playwright-test-walkthrough.en.md)
- [Platform GBS Build](docs/platform-gbs-build.en.md)

**Architecture & reference**

- [Tizen SDK Skills Detailed Documentation](docs/README.en.md)
- [Skills Reference](docs/SKILLS_REFERENCE.en.md)
- [Skills ↔ Commands Mapping](docs/SKILLS_COMMANDS_MAPPING.en.md)
- [SDK Commands Architecture](docs/SDK_COMMANDS_ARCHITECTURE.en.md)
- [SDK Layers Overview](docs/SDK_LAYERS_OVERVIEW.en.md)
- [Envelope Usage Guide](docs/envelope/ENVELOPE_USAGE_GUIDE.en.md)

**Harness setup & deployment**

- [Harness Setup](docs/deployment/HARNESS_SETUP.en.md)
- [Deployment & Sync Guide](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.en.md)
- [Integrated Setup & Sync Script](docs/deployment/CLINE_SETUP_AND_SYNC.en.md)
- [tizen-cli Build & Install](docs/tizen-cli/build-and-install.en.md)
- [VS Code extension](vscode/README.md)

## Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md) — branch flow, commit style, test tiers, documentation pair rule
- [GOVERNANCE.md](GOVERNANCE.md) — roles, modules, decision-making, code review rules

## License

Copyright 2026 Samsung Electronics Co., Ltd.

Licensed under the [Apache License, Version 2.0](LICENSE). Third-party components
bundled in this project are listed in [NOTICE](NOTICE).
