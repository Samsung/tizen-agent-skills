# Tizen Action Skill

A development aid for implementing **Action Providers** for Tizen Action
Framework 2.0 — the mechanism that lets an on-device AI Agent use an app's
capabilities. It walks through selecting a default Action Category or defining
a custom Action, generating the stub for your target language (C#, C++,
JavaScript, Dart), implementing it, and registering it in the app manifest.

This skill does not explain the Tizen Action Framework or the Tizen Action
Toolchain themselves. For those, see:

- [Tizen Action provider guide](https://git.tizen.org/cgit/platform/core/appfw/tizen-action/tree/docs/guide)
  and the samples `samples/tidl-type` / `samples/tidl-custom-action` in the
  `platform/core/appfw/tizen-action` repository
- The Tizen Action Toolchain (`actionc`, `action2tidl`) in
  `tools/action-toolchain` of the `platform/core/appfw/tidl` repository, which
  also builds `tidlc` — to be distributed with the Tizen SDK later

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

From the skill root, check the toolchain and see which Categories are available.
The check also runs `actionc` on a throwaway action to confirm the toolchain
emits TIDL protocol 3, which the current framework requires:

```bash
bash scripts/check_toolchain_env.sh
bash scripts/list_categories.sh Browser
bash scripts/list_categories.sh --entities
```

Generate a stub for a default Category. `scaffold_action.sh` does the toolchain
check, the generation, and printing the handler list you need to implement, all
in one go:

```bash
bash scripts/scaffold_action.sh \
  --language 'C#' \
  --category Tizen.Action.Browser \
  --out-name ImplBrowser
```

Supported languages are `C#`, `C++`, `JS`, and `Dart`. To only generate:

```bash
bash scripts/run_actionc.sh --language JS -- -a Tizen.Action.Browser -o ImplBrowser
```

Define a custom Action only when no default Category covers the capability. A
default Category is always the cheaper path, because the framework already
ships and resolves its schemas:

```bash
bash scripts/scaffold_custom_action.sh \
  --language 'C#' \
  --prefix MyApp --category My.Action.Memo --method Save \
  --description 'save a memo' \
  --input-type My.Entity.Memo --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplMemo \
  --new-entity My.Entity.Memo
```

Run it again with another `--method` to add an Action to the same Category;
it regenerates the stub from every Action of the Category in method-id order.
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
  → build, package, and install
  → verify with action-tool get-action / execute on the device
```

## Commonly missed

- The provider metadata value is the `.action` **`name` verbatim**, not the
  Category. Getting this wrong still builds cleanly — the Action just never
  resolves.
- The framework only calls registered providers. A request without an appid
  goes to the schema's `details.appid` (the default app), so a custom Action's
  `details.appid` must be your app, and a third-party provider of a default
  Category is reached only through an explicit appid or `action-tool
  default-app set`.
- Method order is the RPC ABI. For a custom Category, pass every `.action` to
  `actionc` sorted by Action name, and give new Actions names that sort last.
- Generated stub signatures vary per Category, and optional outputs are handed
  back differently in each language. Read the generated file instead of
  guessing.
- A stub from a pre-protocol-3 toolchain still builds but cannot talk to the
  current framework; regenerate after updating the toolchain.
- The toolchain installer persistently modifies your shell profile or Windows
  user environment variables, so an agent should not run it for you. Run the
  command that `check_toolchain_env` prints yourself.

This skill covers TIDL-based Action Provider implementation. `appControl` and
`plugin` Actions are out of scope.
