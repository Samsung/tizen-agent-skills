# tizen-agent-skills

Agent skills, sub-agents and CLI runners that let AI coding assistants — **Claude Code**,
**Cline**, **OpenAI Codex CLI**, **Google Gemini CLI** — and the **tizen-cli** host drive the
Tizen development workflow: SDK installation, project scaffolding, build, emulator and device
management, app installation, remote debugging and testing.

Each project in this repository is self-contained and documented in its own directory.

## Projects

| Directory | What it provides | Docs |
|---|---|---|
| [`tizen-sdk-skills/`](tizen-sdk-skills/) | 29 skills + 23 agents automating the Tizen SDK (install, create, build, device, debug, certificate, Playwright), a tizen-cli plugin and a VS Code installer extension | [README](tizen-sdk-skills/README.md) · [한국어](tizen-sdk-skills/README.ko.md) |

## Installing with Claude Code

This repository is a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`):

```
/plugin marketplace add https://github.com/Samsung/tizen-agent-skills.git
/plugin install tizen-sdk-skills@tizen-platform
```

Other hosts (Cline, Codex CLI, Gemini CLI, tizen-cli, VS Code) are installed from a local
checkout with the setup scripts described in each project's README.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository-wide rules and each project's own
`CONTRIBUTING.md` for its branch flow, commit style and test tiers. All participants are
expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Security issues: please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

Copyright 2026 Samsung Electronics Co., Ltd.

Licensed under the [Apache License, Version 2.0](LICENSE). Third-party components bundled by
individual projects are listed in each project's `NOTICE` file.
