---
name: tizen-action-skill
description: Build, register, and troubleshoot Tizen Action Framework providers in C#, C++, JavaScript, or Flutter-Tizen/Dart. Use this whenever the work involves exposing an app capability to a Tizen Agent — creating an action provider, generating actionc/TIDL stubs, implementing a generated ServiceBase, registering action/provider manifest metadata, defining custom .action or .entity schemas, or debugging why an action provider is never invoked. Also use it for mentions of actionc, action2tidl, tidlc, Tizen.Action categories, rpc-port stubs, or Tizen.Entity types, even when the user does not say "Tizen Action Framework" outright.
---

# Tizen Action Framework provider

Applies to `"type": "tidl"` actions only. `appControl` and `plugin` actions
never go through the `actionc → action2tidl → tidlc` stub-generation flow, so
if the request turns out to be about those, say so and point at the framework
docs instead of forcing it through this pipeline — `references/common.md`
explains what each type does instead.

## Route the request

1. Read `references/common.md` for every task. It carries the `actionc` CLI
   reference, the toolchain environment variables, and the type-scope rules.
2. Establish whether a default category already covers the capability. Run
   `scripts/list_categories.sh` (or `.ps1`), then read the matching `.action`
   files under `$ACTIONC_DATA_DIR/actions/` for exact action names and entity
   types. A default category is always cheaper than a custom one, because the
   framework already ships and resolves its schemas.
3. Read exactly one language reference — `references/cs.md`, `cpp.md`,
   `js.md`, or `dart.md`. They diverge on registration, manifest syntax, and
   packaging, so reading two costs context without adding accuracy.
4. Only when nothing covers the capability, read `references/custom-action.md`
   first, then the language reference.

## Non-negotiable model

These four rules cause most provider failures when broken, and none of them
are discoverable from the generated code alone:

- Actions sharing a `category` generate **one** TIDL interface and one stub,
  with each action a distinct method. There is no single `RunAction()` entry
  point to implement.
- Register provider metadata once per exposed action, using the `.action`
  `name` verbatim (e.g. `Tv_Tizen.Action.Browser_OpenPage`). Registering the
  category instead leaves the action undiscoverable, with no build error.
- Provider metadata records the declaring app independently of the `.action`
  `details.appid`; they need not match. The schema appid is the fallback target
  when no registered provider has been selected.
- Read the generated stub before implementing. Signatures vary per category —
  parameter counts, `out`/mutable result parameters, and async wrappers are
  all category-specific, and guessing them produces code that compiles against
  the wrong shape or does not compile at all.

Keep generated code under version control, but regenerate it with `actionc`
rather than hand-editing it. Do not package default-category `.action`/
`.entity` files with the app; the framework supplies them.

## Bundled materials

| Path | Use it to |
|---|---|
| `scripts/check_toolchain_env.sh` / `.ps1` | Detect whether `actionc`/`action2tidl`/`tidlc` and their env vars are set up. Read-only. |
| `scripts/list_categories.sh` / `.ps1` | List installed categories and their methods live from `$ACTIONC_DATA_DIR`; `--entities` / `-Entities` lists entity types. |
| `scripts/run_actionc.sh` | Thin `actionc` wrapper: `--language <C#\|C++\|JS\|Dart> -- <actionc args>`. |
| `scripts/scaffold_action.sh` | Generate a default-category stub, list its handler signatures, and print next steps. |
| `scripts/scaffold_custom_action.sh` | Write a custom `.action` (plus optional `.entity`) from the templates and run `actionc` on it. |
| `assets/{cs,cpp,js,dart}_action_pattern.*` | Lifecycle and registration reference patterns; adapt them only after reading the generated stub. |
| `assets/custom_{action,entity}.template*.json` | Fill-in-the-blanks schema templates used by `scaffold_custom_action.sh`. |

The `.sh` scripts are the full set; on Windows, `check_toolchain_env.ps1` and
`list_categories.ps1` cover the read-only checks, and `actionc` is invoked
directly for generation.

Never run the toolchain installer on the developer's behalf. It persistently
edits their shell profile or Windows user environment variables, which is
their call to make — `check_toolchain_env` prints the exact command instead.
