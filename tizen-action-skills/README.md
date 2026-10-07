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

The scaffolding tests need `actionc` on `PATH` and the `default-actions` data
from a [tizen-action](https://git.tizen.org/cgit/platform/core/appfw/tizen-action/)
checkout. They print `SKIP` and exit 0 otherwise.

```bash
export TIZEN_ACTION_SRC=/path/to/tizen-action
skills/tizen-action-skill/scripts/test_scaffold_action.sh
skills/tizen-action-skill/scripts/test_scaffold_custom_action.sh
```

## Origin

Ported from `docs/skills/tizen-action-skill` in `platform/core/appfw/tizen-action`
(review.tizen.org change 352673).
