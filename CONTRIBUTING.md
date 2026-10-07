# Contributing to tizen-agent-skills

Thank you for your interest in contributing. This file covers the rules that apply to the
whole repository; each project directory has its own `CONTRIBUTING.md` with the details
(branch flow, commit style, test tiers, review rules):

| Project | Contributor guide | Governance |
|---|---|---|
| `tizen-sdk-skills/` | [tizen-sdk-skills/CONTRIBUTING.md](tizen-sdk-skills/CONTRIBUTING.md) | [tizen-sdk-skills/GOVERNANCE.md](tizen-sdk-skills/GOVERNANCE.md) |

## Ground rules

- Be respectful. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Open an issue before starting large changes so the approach can be agreed first.
- Keep pull requests focused on one project directory; the CI workflows are scoped per
  project (`.github/workflows/*.yml` filter on `<project>/**`).
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit subjects,
  for example `fix(tizen-sdk-skills): ...`.
- **Never commit** internal hostnames, private IP addresses, personal home paths,
  credentials, certificates (other than the documented throwaway test fixture) or
  captured session logs that contain them. The pull request template has a checklist item
  for this.

## Adding a new plugin

This repository is an umbrella for several plugins. Each plugin is one top-level
directory; `tizen-sdk-skills/` is the reference layout. A new plugin
`<plugin-name>/` must provide:

| Path | Purpose |
|---|---|
| `README.md`, `README.ko.md` | Plugin overview and quick start (English primary, Korean mirror) |
| `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `NOTICE` | Per-plugin history, contributor rules, licence and third-party notices |
| `package.json` | Private; `version` is the plugin version, `repository.directory` is `<plugin-name>` |
| `common/.claude-plugin/plugin.json` | Plugin manifest. `name` must equal the directory name; include `description`, `version`, `keywords`, `homepage`, `repository`, `license` |
| `common/skills/<skill>/SKILL.md` | The skills. `common/agents/`, `common/hooks/`, `common/lib/` are optional |
| `claude/`, `cline/`, `codex/`, `gemini/` | Per-host setup wrappers, only for the hosts the plugin supports |

`common/` is the plugin root that AI hosts load; everything else in the directory is tooling,
docs and tests.

Register the plugin in the repository-root files:

1. `.claude-plugin/marketplace.json`: append an entry to `plugins[]` with
   `"source": "./<plugin-name>/common"`, the same `name`, `version`, `description` and
   `keywords` as its `plugin.json`, plus `homepage`, `repository` and `license`.
   `metadata.version` is the catalog version; bump it only when the catalog itself changes.
2. `README.md` and `README.ko.md`: add a row to the plugin table between the
   `<!-- plugins:start -->` / `<!-- plugins:end -->` markers.
3. `llms.txt`: add the plugin README and its main reference doc under `## Plugins`.
4. `CONTRIBUTING.md` (this file): add a row to the project table at the top.
5. `.github/CODEOWNERS`: add a `<plugin-name>` block.
6. `.github/workflows/release.yml`: add a step to package the new plugin's source
   zip (`git archive --format=zip --prefix=<plugin-name>/ HEAD <plugin-name>/`) and
   add it to the `gh release create`/`upload` asset list. No separate workflow file
   is needed — the repository releases as a whole under `tizen-agent-skills-v*`.

Each plugin keeps its own version number in its `package.json` and
`common/.claude-plugin/plugin.json` (advanced independently of the release
version). The repository releases as a whole under `tizen-agent-skills-v*`
(`git tag tizen-agent-skills-vX.Y.Z`); the release version is tracked in the
root `package.json` and `CHANGELOG.md`. Keep a pull request inside one
plugin directory (plus the root registration files above when adding the plugin).

## License of contributions

By contributing you agree that your contributions are licensed under the
[Apache License, Version 2.0](LICENSE) that covers this repository (inbound = outbound).
New source files must carry the SPDX header used by existing files:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.
```

## Reporting bugs and requesting features

Use the issue templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). For
security problems follow [SECURITY.md](SECURITY.md) instead.
