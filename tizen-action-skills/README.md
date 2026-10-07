# tizen-action-skills

English | [한국어](README.ko.md)

Claude Code plugin for implementing **Action Providers** for the Tizen Action
Framework — the mechanism that lets an on-device AI Agent use an app's
capabilities. Ask your agent to "expose this app's bookmark feature as a Tizen
Action" or "implement the Tizen.Action.Browser category in C#", and the skill
walks it through the whole provider flow.

| Skill | What it does |
|---|---|
| [`tizen-action-skill`](common/skills/tizen-action-skill/) | Picks a default Action Category or authors a custom `.action`/`.entity` (including subscription actions), generates the provider stub with `actionc` for C#, C++, JavaScript or Flutter-Tizen/Dart, implements and registers it, and verifies it on a device with `action-tool` |

## Quick Start

1. Add this repository's marketplace and install the plugin in Claude Code:

   ```text
   /plugin marketplace add Samsung/tizen-agent-skills
   /plugin install tizen-action-skills@tizen-platform
   ```

   Other hosts that read Agent Skills can use the skill directly: copy
   `common/skills/tizen-action-skill/` into the host's skills directory
   (for example `~/.claude/skills/`).
2. Install the Tizen Action Toolchain (`actionc`, `action2tidl`, `tidlc`) and
   point `ACTIONC_DATA_DIR` at the `default-actions/` of the platform release
   you target. The skill checks the setup with
   `scripts/check_toolchain_env.sh` and never installs anything itself.
3. Describe the capability you want to expose in natural language.

See the [skill README](common/skills/tizen-action-skill/README.md) for the
bundled scripts, the workflow and the commonly missed rules.

## Requirements

- Tizen Action Framework with TIDL protocol 3 on the device (tizen-action 1.4
  or later; subscription actions need 1.6). The skill is verified against 1.8
- The Tizen Action Toolchain built from `tools/action-toolchain` of the
  `platform/core/appfw/tidl` repository (or the Tizen SDK bundle, once
  distributed)
- Bash 4+ for the scaffolding scripts; PowerShell for the Windows check scripts

## Layout

```
tizen-action-skills/
├── common/                         # Plugin root loaded by the AI hosts
│   ├── .claude-plugin/plugin.json
│   └── skills/tizen-action-skill/  # SKILL.md, references/, assets/, scripts/
├── package.json                    # Plugin version
└── README.md · README.ko.md · CHANGELOG.md · CONTRIBUTING.md · LICENSE · NOTICE
```

## Tests

The scaffolding tests need a protocol 3 toolchain and the `default-actions`
data from a
[tizen-action](https://git.tizen.org/cgit/platform/core/appfw/tizen-action/)
checkout of the matching release. They print `SKIP` and exit 0 when `actionc`
or the data is missing.

```bash
export TIZEN_ACTION_SRC=/path/to/tizen-action
export ACTIONC_DATA_DIR="$TIZEN_ACTION_SRC/default-actions"
export ACTIONC_ACTION2TIDL=/path/to/action2tidl ACTIONC_TIDLC=/path/to/tidlc
cd common/skills/tizen-action-skill
bash scripts/check_toolchain_env.sh
bash scripts/test_scaffold_action.sh
bash scripts/test_scaffold_custom_action.sh
```

## Origin

Ported from `docs/skills/tizen-action-skill` in
`platform/core/appfw/tizen-action` (review.tizen.org change 352673) and
updated for tizen-action 1.8 and the 3.1 toolchain.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the
[Apache License, Version 2.0](LICENSE).
