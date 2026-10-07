# tizen-action-skills

Claude Code plugin for implementing **Action Providers** for the Tizen Action
Framework — the mechanism that lets an on-device AI Agent use an app's
capabilities.

| Skill | What it does |
|---|---|
| [`tizen-action-skill`](skills/tizen-action-skill/) | Picks a default Action Category or authors a custom `.action`/`.entity`, generates the provider stub with `actionc` (C#, C++, JavaScript, Flutter-Tizen/Dart), and walks through implementing and registering it |

## Installing

```text
/plugin marketplace add Samsung/tizen-agent-skills
/plugin install tizen-action-skills@tizen-platform
```

See the [skill README](skills/tizen-action-skill/README.md) for usage, the
bundled scripts, and the toolchain prerequisites.

## Tests

The scaffolding tests need a protocol 3 toolchain (`actionc`, `action2tidl`,
`tidlc` built from the `platform/core/appfw/tidl` repository) and the
`default-actions` data from a
[tizen-action](https://git.tizen.org/cgit/platform/core/appfw/tizen-action/)
checkout of the matching release. They print `SKIP` and exit 0 when `actionc`
or the data is missing.

```bash
export TIZEN_ACTION_SRC=/path/to/tizen-action
export ACTIONC_DATA_DIR="$TIZEN_ACTION_SRC/default-actions"
export ACTIONC_ACTION2TIDL=/path/to/action2tidl ACTIONC_TIDLC=/path/to/tidlc
bash skills/tizen-action-skill/scripts/check_toolchain_env.sh
bash skills/tizen-action-skill/scripts/test_scaffold_action.sh
bash skills/tizen-action-skill/scripts/test_scaffold_custom_action.sh
```

## Origin

Ported from `docs/skills/tizen-action-skill` in `platform/core/appfw/tizen-action`
(review.tizen.org change 352673).
