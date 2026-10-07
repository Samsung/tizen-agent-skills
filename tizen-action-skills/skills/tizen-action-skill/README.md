# Tizen Action Skill

A development aid for implementing **Action Providers** for Tizen Action
Framework 2.0 — the mechanism that lets an on-device AI Agent use an app's
capabilities. It walks through selecting a default Action Category or defining
a custom Action, generating the stub for your target language (C#, C++,
JavaScript, Dart), implementing it, and registering it in the app manifest.

This skill does not explain the Tizen Action Framework or the Tizen Action
Toolchain themselves. For those, see:

- [Tizen Action guide](https://git.tizen.org/cgit/platform/core/appfw/tizen-action/tree/docs/guide) in the `platform/core/appfw/tizen-action` repository
- Tizen Action Toolchain (`actionc`, `action2tidl`, `tidlc`) — to be distributed with the Tizen SDK later

## What this skill does

1. Find an Action Category to implement, or write a custom `.action`/`.entity`.
2. Generate the provider stub with `actionc` for your app's language.
3. Implement **each per-Action method** on the generated `ServiceBase`.
4. Register provider metadata in the app manifest, **one entry per Action name**.
5. Finish the app following the language's lifecycle, build, packaging, and
   deployment rules.

One Category generates one TIDL interface, and each Action within that Category
becomes a separate method. So there is no single `RunAction()` to implement —
you implement every generated Action method.

## Installing

Install the `tizen-action-skills` plugin from this repository's marketplace:

```text
/plugin marketplace add Samsung/tizen-agent-skills
/plugin install tizen-action-skills@tizen-platform
```

Or copy this directory into your skills directory and Claude Code will pick it
up:

```bash
cp -r tizen-action-skill ~/.claude/skills/
```

## Getting started

From the skill root, check the toolchain and see which Categories are available:

```bash
scripts/check_toolchain_env.sh
scripts/list_categories.sh Browser
scripts/list_categories.sh --entities
```

Generate a stub for a default Category. `scaffold_action.sh` does the toolchain
check, the generation, and printing the handler list you need to implement, all
in one go:

```bash
scripts/scaffold_action.sh \
  --language 'C#' \
  --category Tizen.Action.Browser \
  --out-name ImplBrowser
```

Supported languages are `C#`, `C++`, `JS`, and `Dart`. To only generate:

```bash
scripts/run_actionc.sh --language JS -- -a Tizen.Action.Browser -o ImplBrowser
```

Define a custom Action only when no default Category covers the capability. A
default Category is always the cheaper path, because the framework already
ships and resolves its schemas:

```bash
scripts/scaffold_custom_action.sh \
  --language 'C#' \
  --prefix MyApp --category My.Action.Memo --method Save \
  --description 'save a memo' \
  --input-type My.Entity.Memo --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplMemo \
  --new-entity My.Entity.Memo
```

Read [references/custom-action.md](references/custom-action.md) for the
authoring rules first, then the reference for your target language.

On Windows, use the read-only check scripts `check_toolchain_env.ps1` and
`list_categories.ps1`, and invoke `actionc` directly for generation.

## Which reference to read

| Situation | Document |
| --- | --- |
| Shared flow, toolchain check, `actionc` CLI, Category selection | [references/common.md](references/common.md) |
| Writing a custom Action/Entity schema | [references/custom-action.md](references/custom-action.md) |
| C# provider | [references/cs.md](references/cs.md) |
| C++ provider | [references/cpp.md](references/cpp.md) |
| JavaScript provider | [references/js.md](references/js.md) |
| Flutter-Tizen/Dart provider | [references/dart.md](references/dart.md) |

Read **one** language reference. Registration, manifest syntax, and packaging
all differ per language, so reading several costs context without adding
accuracy.

## Implementation order

```text
Pick an Action Category
  → pick the target language
  → generate the language-specific stub with actionc
  → read the generated stub and implement each Action method
  → register provider metadata per Action name in the manifest
  → build, package, and test on a device
```

## Commonly missed

- The provider metadata value is the `.action` **`name` verbatim**, not the
  Category. Getting this wrong still builds cleanly — the Action just never
  resolves.
- Provider metadata records the declaring app independently of the `.action`
  `details.appid`; they need not match. The schema appid is the fallback target
  when no registered provider has been selected.
- Generated stub signatures vary per Category. Read the generated file instead
  of guessing.
- The toolchain installer persistently modifies your shell profile or Windows
  user environment variables, so an agent should not run it for you. Run the
  command that `check_toolchain_env` prints yourself.

This skill covers TIDL-based Action Provider implementation. `appControl` and
`plugin` Actions are out of scope.
