# tizen-agent-skills

English | [한국어](README.ko.md)

**Tizen development skills and plugins for AI coding agents.**

`tizen-agent-skills` is Samsung's open-source collection of agent skills and plugins that bring
the **Tizen** platform development environment to AI coding assistants. Each plugin in this
repository covers one area of Tizen development and can be installed on its own. The first
plugin, `tizen-sdk-skills`, lets your agent install the Tizen SDK, create and build Tizen Web
(.wgt), Native (.tpk), .NET, RPK and RPM packages, run Tizen and Samsung TV emulators, manage
devices over `sdb`, sign packages, debug remotely and analyse `dlog` output from a plain English
or Korean request.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Samsung/tizen-agent-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/Samsung/tizen-agent-skills/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/Samsung/tizen-agent-skills?style=social)](https://github.com/Samsung/tizen-agent-skills/stargazers)

## Plugins in this repository

Each top-level directory is one independently versioned plugin with its own README, changelog
and release tags (`<plugin>-vX.Y.Z`). More plugins for the Tizen platform will be added over time.

<!-- plugins:start -->
| Plugin | What it does | Hosts | Version | Install & docs |
|---|---|---|---|---|
| [`tizen-sdk-skills/`](tizen-sdk-skills/) | Automates the Tizen SDK end to end: SDK install, project creation, build, emulator and device management, app install, remote debugging (GDB / netcoredbg / CDP), certificates, dlog analysis, Playwright testing. 29 skills, 24 agents, a standalone `tizen-sdk` CLI and the Tizen AI Extension for VS Code. | Claude Code, Cline, Codex CLI, VS Code, standalone CLI | 1.4.1 | [Quick Start](tizen-sdk-skills/README.md#quick-start) · [README](tizen-sdk-skills/README.md) · [한국어](tizen-sdk-skills/README.ko.md) · [Skills reference](tizen-sdk-skills/docs/SKILLS_REFERENCE.en.md) |
| [`tizen-action-skills/`](tizen-action-skills/) | Builds Tizen Action Framework providers: picks a default Action category or authors custom `.action`/`.entity` schemas, generates `actionc`/TIDL stubs for C#, C++, JavaScript or Flutter-Tizen/Dart, registers provider metadata and verifies with `action-tool`. 1 skill. | Claude Code | 1.0.0 | [README](tizen-action-skills/README.md) · [한국어](tizen-action-skills/README.ko.md) |
<!-- plugins:end -->

## Quick Start

Prerequisites: **Node.js 20+** and **Git**.

1. Clone the repository.

   ```bash
   git clone https://github.com/Samsung/tizen-agent-skills.git
   ```

2. Open the directory of the plugin you want and follow its Quick Start. Every plugin ships a
   setup script per host (`claude/`, `cline/`, `codex/`, ...) that installs its skills, agents
   and hooks for that host.
3. Restart your AI coding assistant and describe what you want in natural language.

For `tizen-sdk-skills` start with the
[tizen-sdk-skills Quick Start](tizen-sdk-skills/README.md#quick-start); the first request to
make is "Install the Tizen SDK".

## Featured plugin: tizen-sdk-skills

| Area | Skills |
|---|---|
| SDK setup (10) | `tizen-sdk-install`, `tizen-sdk-install-custom-repo`, `tizen-sdk-init`, `tizen-update-package`, `tizen-platform-install`, `tizen-download-emulator-package`, `tizen-download-mobile-platform`, `tizen-tv-sdk-install`, `tizen-tv-sdk-install-from-zip`, `tizen-install-rootstrap` |
| Environment checks (3) | `tizen-check-node`, `tizen-check-disk-space`, `tizen-dotnet-setup` |
| Project & build (2) | `tizen-create-project` (Web, Native, .NET, TV, RPK, Platform/GBS), `tizen-build-project` |
| Emulator & device (7) | `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-device-manager`, `tizen-remote-device`, `tizen-sdb-helper`, `tizen-file-transfer`, `tizen-screenshot` |
| Install, debug & test (6) | `tizen-install-app`, `tizen-gdb-debug` (Native), `tizen-dotnet-debug` (.NET / netcoredbg), `tizen-webapp-debug` (Web / RWI / CDP), `tizen-playwright-test`, `tizen-dlog-analyzer` |
| Certificates (1) | `tizen-certificate-manager` (local and Samsung online-CA profiles) |

Details, trigger phrases and the 35 `tizen-sdk` CLI commands are in the plugin's
[README](tizen-sdk-skills/README.md) and [Skills Reference](tizen-sdk-skills/docs/SKILLS_REFERENCE.en.md).

## Repository structure

```
tizen-agent-skills/
├── .claude-plugin/marketplace.json   # Catalog of every plugin in this repository
├── <plugin-name>/                    # One directory per plugin
│   ├── common/                       #   Plugin root loaded by the AI hosts (skills/, agents/, hooks/, lib/)
│   ├── claude/ cline/ codex/ ...     #   Per-host setup wrappers
│   ├── docs/                         #   Plugin documentation
│   └── README.md · README.ko.md · CHANGELOG.md
├── tizen-sdk-skills/                 # Plugin 1: Tizen SDK automation (+ tizen-cli/, vscode/)
├── llms.txt                          # Machine-readable summary for LLM-based tools
└── CONTRIBUTING.md                   # Repository-wide rules, including "Adding a new plugin"
```

See [Adding a new plugin](CONTRIBUTING.md#adding-a-new-plugin) for the directory and
registration convention a new plugin must follow.

## Related links

- [Tizen](https://www.tizen.org/) · [Tizen developer documentation](https://docs.tizen.org/)
- [Samsung Developers: Smart TV](https://developer.samsung.com/smarttv)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository-wide rules and each plugin's own
`CONTRIBUTING.md` for its branch flow, commit style and test tiers. All participants are
expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Security issues: please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

Copyright 2026 Samsung Electronics Co., Ltd.

Licensed under the [Apache License, Version 2.0](LICENSE). Third-party components bundled by
individual plugins are listed in each plugin's `NOTICE` file.
