---
name: tizen-action-skill
description: Build, register, and troubleshoot Tizen Action Framework providers in C#, C++, JavaScript, or Flutter-Tizen/Dart. Use this whenever the work involves exposing an app capability to a Tizen Agent — creating an action provider, generating actionc/TIDL stubs, implementing a generated ServiceBase, registering action/provider manifest metadata, defining custom .action or .entity schemas (including subscription actions with eventSchema), or debugging why an action provider is never invoked, times out, or fails to compile after regeneration. Also use it for mentions of actionc, action2tidl, tidlc, action.seq, action-tool, Tizen.Action categories, rpc-port stubs, or Tizen.Entity types, even when the user does not say "Tizen Action Framework" outright.
---

# Tizen Action Framework provider

Applies to `"type": "tidl"` actions only. `appControl` and `plugin` actions
never go through the `actionc → action2tidl → tidlc` stub-generation flow, so
if the request turns out to be about those, say so and point at the framework
guide instead of forcing it through this pipeline — `references/common.md`
explains what each type does instead.

All paths below are relative to this skill's directory. Run the bundled
scripts through their interpreter (`bash scripts/<name>.sh`), because some
plugin installs drop the executable bit.

## Route the request

1. Read `references/common.md` for every task. It carries the `actionc` CLI
   reference, the toolchain setup, the generated-code conventions shared by
   every language, and the on-device verification loop.
2. Establish whether a default category already covers the capability. Run
   `bash scripts/list_categories.sh` (or `.ps1`), then read the matching
   `.action` files under `$ACTIONC_DATA_DIR/actions/` for exact action names
   and entity types. A default category is always cheaper than a custom one,
   because the framework already ships and resolves its schemas.
3. Read exactly one language reference — `references/cs.md`, `cpp.md`,
   `js.md`, or `dart.md`. They diverge on registration, manifest syntax,
   output parameters, and packaging, so reading two costs context without
   adding accuracy.
4. Only when nothing covers the capability, read `references/custom-action.md`
   first, then the language reference.

## Workflow

Copy this checklist into the conversation and tick it off:

```text
- [ ] 1. bash scripts/check_toolchain_env.sh passes (protocol 3 toolchain)
- [ ] 2. Category chosen (default, or custom schema written)
- [ ] 3. Stub generated with actionc; generated file read in full
- [ ] 4. Every generated method implemented; build succeeds
- [ ] 5. One provider metadata entry per exposed action name
- [ ] 6. On device: action-tool get-action / execute succeed
```

Step 6 is the feedback loop: when `execute` fails or times out, fix the
cause from the troubleshooting section of the language reference and repeat
step 6. Do not report the provider as working before it passes.

## Non-negotiable model

These rules cause most provider failures when broken, and none of them are
discoverable from the generated code alone:

- Actions sharing a `category` generate **one** TIDL interface and one stub,
  with each action a distinct method. There is no single `RunAction()` entry
  point to implement.
- Register provider metadata once per exposed action, using the `.action`
  `name` verbatim (e.g. `Tv_Tizen.Action.Browser_OpenPage`). Registering the
  category instead leaves the action undiscoverable, with no build error.
- The framework only calls registered providers. A request without
  `params.appid` targets the schema's `details.appid` (or the default app),
  and fails when that app is not a registered provider. So a custom action's
  `details.appid` must be the providing app, and a third-party provider of a
  default category is reached only when the caller passes its appid or it is
  set as the default app.
- Method order inside a category is the RPC ABI. `actionc -a` follows the
  platform `action.seq`; for custom actions, pass every `-i` file sorted by
  full action name, because the device sorts them the same way.
- Read the generated stub before implementing. Signatures vary per category —
  parameter counts, optional and list out-parameters, and event delegates
  are all category-specific, and guessing them produces code that compiles
  against the wrong shape or does not compile at all.
- Generate with a protocol 3 toolchain. A stub from an older toolchain
  builds, but cannot talk to a current framework.

Keep generated code under version control, but regenerate it with `actionc`
rather than hand-editing it. Do not package default-category `.action`/
`.entity` files with the app; the framework supplies them.

## Bundled materials

| Path | Use it to |
|---|---|
| `scripts/check_toolchain_env.sh` / `.ps1` | Detect whether `actionc`/`action2tidl`/`tidlc` are set up and speak TIDL protocol 3. Read-only. |
| `scripts/list_categories.sh` / `.ps1` | List installed categories and their methods live from `$ACTIONC_DATA_DIR`; `--entities` / `-Entities` lists entity types. |
| `scripts/run_actionc.sh` | Thin `actionc` wrapper: `--language <C#\|C++\|JS\|Dart> -- <actionc args>`. |
| `scripts/scaffold_action.sh` | Generate a default-category stub, list its handler signatures, and print next steps. |
| `scripts/scaffold_custom_action.sh` | Write a custom `.action` (plus optional `.entity`) from the templates and regenerate the category stub from every action in the schema directory. |
| `assets/{cs,cpp,js,dart}_action_pattern.*` | Lifecycle and registration reference patterns; adapt them only after reading the generated stub. |
| `assets/custom_{action,entity}.template*.json` | Fill-in-the-blanks schema templates used by `scaffold_custom_action.sh`. |

The `.sh` scripts are the full set; on Windows, `check_toolchain_env.ps1` and
`list_categories.ps1` cover the read-only checks, and `actionc` is invoked
directly for generation.

Never run a toolchain installer on the developer's behalf. It persistently
edits their shell profile or Windows user environment variables, which is
their call to make — `check_toolchain_env` prints the exact command instead.
