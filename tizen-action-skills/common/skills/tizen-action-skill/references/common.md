# Tizen Action Framework — Shared Reference

Read this first for any task in this skill. It carries the knowledge every
other reference depends on: the `actionc` toolchain, the generated-code
conventions every language shares, how a request reaches a provider, and how
to verify one on a device. Keeping it in one place is why the language
references can stay short and consistent with each other.

Paths such as `scripts/…` and `assets/…` are relative to the skill directory.

## Contents

- [Scope: `tidl`-type actions only](#scope-tidl-type-actions-only)
- [How to use this when helping a developer](#how-to-use-this-when-helping-a-developer)
- [Generated code: what every language shares](#generated-code-what-every-language-shares)
- [How a request reaches a provider](#how-a-request-reaches-a-provider)
- [Verify on a device](#verify-on-a-device)
- [Appendix — `actionc` toolchain CLI reference](#actionc-toolchain-cli-reference)

**How the references divide up:**
- `cs.md` / `cpp.md` / `js.md` / `dart.md` — stub generation, implementation, and registration for one language each.
- `custom-action.md` — writing brand-new `.action`/`.entity` schemas. Go there only when `scripts/list_categories.sh` turns up nothing covering the capability.

## Scope: `tidl`-type actions only

A `.action` file's `"type"` field is one of `appControl`, `plugin`, or `tidl`. **This skill covers only `"type": "tidl"`** — the kind that goes through the `actionc` → `tidlc` code-generation pipeline and produces a `ServiceBase` class the app implements. The other two types need no code generation at all:

- `appControl` — handled directly in the app's `OnAppControlReceived` callback; see Part 03 of the framework guide.
- `plugin` — a `.so` shared library with a `TIZEN_ACTION_EXECUTE` C entry point, loaded by an isolated Plugin Launcher process; see Part 04.

Both register only the `http://tizen.org/metadata/action` key, with no provider metadata. If a request is about them, say so and point at the [framework guide](https://git.tizen.org/cgit/platform/core/appfw/tizen-action/tree/docs/guide) — don't force it through the `actionc`/`ServiceBase` flow.

The `Tizen.Action.View` category (prefix `Common_`) is a `tidl` category, but
providing it means annotating on-screen views per UI toolkit (DALi, Flutter,
JS). That integration lives in Part 06 (View Annotation) of the guide; use
this skill for the stub and registration, and Part 06 for the view wiring.

## How to use this when helping a developer

1. **Check the toolchain first.** Run `bash scripts/check_toolchain_env.sh` (or `.ps1` on Windows). It confirms the binaries resolve and that `action2tidl` emits TIDL protocol 3. If anything is missing it prints the setup command — never run an installer yourself, since it makes persistent changes to the developer's shell profile or Windows user environment variables.
2. **Decide if a default category already covers what they want.** Run `bash scripts/list_categories.sh` (or `.ps1`), optionally filtered by a keyword, and match its output against their plain-English description. Read the matching `.action` file(s) under `$ACTIONC_DATA_DIR/actions/` directly to see exact entity types.
3. **If a default category matches**, go to the matching language reference (`cs.md`/`cpp.md`/`js.md`/`dart.md`).
4. **If it's genuinely new**, read `custom-action.md` first, then the language reference for implementation and registration.
5. **Finish with [Verify on a device](#verify-on-a-device).** A provider that builds is not yet a provider that works.

## Generated code: what every language shares

- **One category, one interface.** The interface is the category with the dots removed (`Tizen.Action.Browser` → `TizenActionBrowser`), and each action is a method named after the part of its `name` after the last `_` (`Tv_Tizen.Action.Browser_OpenPage` → `OpenPage`).
- **Entities become classes** named the same way (`Tizen.Entity.WebPageInfo` → `TizenEntityWebPageInfo`), inheriting their `base` chain down to `TizenEntity` (`Id`, `Extra`).
- **Outputs.** An `outputSchema` property named `return` (or a bare `Tizen.Entity.Status` output) becomes the method's return value; every other output property becomes an out-parameter, in declaration order.
- **Optional fields and outputs (TIDL protocol 3).** A property missing from a schema's `required` list is generated as an optional type, and so is a single-entity output that is not required. How you hand back each output kind differs per language:

  | Output kind | C++ | C# | JS | Dart |
  |---|---|---|---|---|
  | optional single entity | `std::optional<T>& r` — assign `r = T(...)` | `out T r` — assign a new `T` or `null` | `r = { value: null }` — set `r.value = new T()` | `Out<T?> r` — set `r.value = T()..F = …` |
  | required single entity | `T& r` — assign or mutate | `out T r` — assign a new `T` | pre-built `T` — mutate its fields | pre-built `T` — mutate its fields |
  | list | `std::vector<T>& r` — `push_back` | `out List<T> r` — assign a new list | pre-built array — `push` | `List<T> r` — `add` |

  An optional output left unset reaches the caller as `null`, which the framework accepts.
- **`oneOf` / `base` properties** become `variant<…>` / `box<…>` types (a `box` carries a derived entity with its runtime `TypeName`). Read the generated accessors rather than guessing them.
- **Subscription actions** (`eventSchema`) add a `<Method>Event` delegate that the method receives as its **last** parameter. Keep it and call its `Invoke`/`invoke` each time an event occurs; the method's return value is only the acknowledgement. Drop the handles in `OnTerminate`, and expect `Invoke` to throw once the client is gone.
- **Embedded `ActionServiceProxy`.** Stubs generated by the current toolchain embed an `ActionServiceProxy` with `SetProviderEnabled()` / `IsProviderEnabled()`, so a provider can switch one of its own registrations off while a feature is unavailable. The C API equivalent is `action_client_set_provider_enabled()`.
- **Lifecycle.** `OnCreate`/`OnTerminate` run once per connecting client; each client gets its own `ServiceBase` instance, so state shared across clients needs its own synchronization. Never block a generated method indefinitely — return a failed `TizenEntityStatus` instead.

## How a request reaches a provider

- Installing a package parses three manifest metadata keys. Values may also be a `;`-separated list in one entry:

  | Key | Value | Who needs it |
  |---|---|---|
  | `http://tizen.org/metadata/action/provider` | exact `.action` `name` | every provider, per exposed action |
  | `http://tizen.org/metadata/action` | `.action` filename under the package `res/` | custom actions only |
  | `http://tizen.org/metadata/action/entity` | `.entity` filename under the package `res/` | custom entities only |

- A request names the action and optionally `params.appid`. Without an appid the target is the default app — the schema's `details.appid` unless changed with `action-tool default-app set`.
- The framework refuses to call an app that has not registered (or has disabled) provider metadata for that action. A third-party provider of a default category is therefore reached only when the caller passes its appid, or after it is made the default app.
- An action whose schema sets `providerPrivilegeLevel` (`partner`/`platform`) can only be provided by a package signed at that level; the install is rejected otherwise.

## Verify on a device

Run on the target (`sdb shell`), as root or the owner user:

```sh
action-tool find-appids <ActionName>          # is this app a registered provider?
action-tool get-action <ActionName> --json    # installed schema
action-tool get-entity <EntityType> --json    # referenced entity
action-tool execute --dry-run -f request.json # validate the model only
action-tool execute -f request.json           # real call; exit 0 only on success
```

```json
{"id":1,"params":{"name":"<ActionName>","appid":"<your.appid>","arguments":{}}}
```

Keep `appid` in the model unless your app is the default app. For a
subscription action add `--count <n>` or `--timeout <sec>` to `execute`.
`action-tool run <scenario.json>` chains several actions. When the call fails
or times out, read `dlogutil -v time <YOUR_LOG_TAG>` alongside the language
reference's troubleshooting section, fix, and execute again.

---

<a id="actionc-toolchain-cli-reference"></a>

# Appendix — `actionc` toolchain CLI reference

The toolchain ships three binaries. **Developers only ever need to run `actionc` directly** — it orchestrates the other two. `action2tidl` and `tidlc` are documented for completeness.

## `actionc` — the one you run

```
Usage:
  actionc [OPTION...]

Additional Options:
  -l, --language=LANGUAGE   Select generating language (C, C++, C#, JS, ...);
                            passed through to tidlc (default: C++)
  -i, --input=INPUT         Custom .action file, repeatable; the name must
                            follow '<prefix>_<category>_<method>.action'
  -a, --action=CATEGORY     Framework action category name
                            (e.g. Tizen.Action.Browser)
  -o, --output=OUTPUT       The generated interface file
  -p, --proxy               Generate proxy (client) code instead of the
                            service stub
  -e, --entity=PATH         Extra .entity file or directory, repeatable
  -d, --data-dir=DIR        Directory holding the framework's actions/ and
                            entities/ (default: $ACTIONC_DATA_DIR or the
                            built-in location)
      --log-stdout          Generate C/C++ code that logs to stdout/stderr
                            instead of dlog; passed through to tidlc
      --keep-temp           Keep the intermediate .tidl files and print
                            their directory
  -v, --version             Show version information
```

Exit code `0` on success, `1` when a stage fails, `2` on bad arguments.

### Two invocation modes

- **`-a <Category>`** — a default category shipped in the data dir (`$ACTIONC_DATA_DIR` or `-d`). Methods are ordered by the data dir's `action.seq`; `actionc` fails if a listed action has no file or a file is not listed, which means the data dir is out of sync with the platform.
- **`-i <file.action>`** (repeatable) **+ `-e <entity>`** (repeatable) — a custom category the app defines. Methods keep the **command-line order**, while the device orders an app category by sorted action name, so pass every `-i` of the category sorted by full action name. The `.action` filename must follow `<prefix>_<category>_<method>.action`.

`-a` and `-i` are mutually exclusive. `-p` is for client-side code and is not needed by a provider. `--keep-temp` shows the intermediate `.tidl`, which is the quickest way to see why a signature came out the way it did.

### Language flag (`-l`)

The value is passed through to `tidlc`, which supports C, C++, C#, Dart, Rust, and JavaScript. The four this skill covers:

| Pass to `actionc -l` | Language reference | Generated file |
|---|---|---|
| `C#` | `cs.md` | `Impl<Category>.cs` |
| `C++` | `cpp.md` | `Impl<Category>.h` + `.cc` |
| `JS` | `js.md` | `Impl<Category>.js` |
| `Dart` | `dart.md` | `Impl<Category>.dart` |

Pass `JS`, not `JavaScript`. `bash scripts/run_actionc.sh --language <value>` accepts exactly these four values and rejects anything else.

## `action2tidl` and `tidlc` — internal stages

`actionc` first runs `action2tidl`, which converts the entity files to one `.tidl` each and the category's actions to one `<category>.tidl` interface. The first line of its output names the TIDL protocol (`protocol 3`), and an `eventSchema` becomes a `<Method>Event` delegate. `actionc` then runs `tidlc -s --action` (stub plus embedded `ActionServiceProxy`) with the temporary directory on the import path.

## Environment variables

| Setting | Option | Environment variable | Default |
|---|---|---|---|
| Action/entity schemas and `action.seq` | `-d, --data-dir` | `ACTIONC_DATA_DIR` | built in at toolchain build time; the SDK bundle uses `~/.action-tools/data` |
| `action.seq` override | — | `ACTIONC_ACTION_SEQ` | `<data-dir>/action.seq` |
| `action2tidl` binary | — | `ACTIONC_ACTION2TIDL` | built in at toolchain build time; the SDK bundle uses `~/.action-tools/action2tidl` |
| `tidlc` binary | — | `ACTIONC_TIDLC` | `tidlc` from `PATH` (SDK bundle: `~/.action-tools/tidlc`) |

`ACTIONC_DATA_DIR` must match the platform version the provider targets. A
data dir from another catalogue release can generate a stub whose method ids
or entity fields differ from what the device ships.

## Getting the toolchain

- **SDK bundle** — run its `install.sh` (Linux, then `source ~/.bashrc`) or `install.bat` (Windows, then restart the shell). Both copy the binaries and data into `~/.action-tools` and **persistently** set the environment variables above.
- **From source** — the toolchain lives in the `platform/core/appfw/tidl` repository (`tools/action-toolchain/`, built together with `tidlc` by the top-level CMake). Point `ACTIONC_DATA_DIR` at the matching `tizen-action` `default-actions/` directory.

**Never run an installer on the developer's behalf.** `scripts/check_toolchain_env.sh`/`.ps1` detects the setup and prints these steps for the developer to run.

### Toolchain compatibility

Generated code depends on the toolchain release, so read the versions (`actionc -v`; the first line of `action2tidl` output names the TIDL protocol) before regenerating stubs that are already checked in. A stub regenerated with a different toolchain may no longer match the implementation written against the previous one; the mismatch usually surfaces as a compile error, not a version warning. The current framework expects protocol 3 stubs — an older stub can still compile and install, but its calls fail.
