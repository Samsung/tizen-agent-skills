# Tizen Action Framework — Shared Reference

Read this first for any task in this skill. It carries the knowledge every
other reference depends on: the `actionc` toolchain CLI, the environment
variables that make it resolvable, and how to look up the categories actually
installed on this machine. Keeping it in one place is why the language
references can stay short and stay consistent with each other.

**How the references divide up:**
- `cs.md` / `cpp.md` / `js.md` / `dart.md` — **default action categories**: stub generation, implementation, and registration for one language each.
- `custom-action.md` — writing brand-new `.action`/`.entity` schemas. Go there only when `../scripts/list_categories.sh` turns up nothing covering the capability.

## Scope: `tidl`-type actions only

A `.action` file's `"type"` field is one of three values: `appControl`, `plugin`, or `tidl`. **This skill covers only `"type": "tidl"`** — the kind that goes through the `actionc` → `tidlc` code-generation pipeline and produces a `ServiceBase` class the app implements. The other two types need no code generation at all:

- `appControl` — handled directly in the app's `OnAppControlReceived` callback. Example: `{"name":"pickImage","type":"appControl"}`. See `tizen-action/docs/guide/docs/Part03_Eng.md` in the framework repo for that flow.
- `plugin` — a `.so` shared library with a `TIZEN_ACTION_EXECUTE` C entry point, loaded by an isolated Plugin Launcher process. Example `details`: `{"pluginPath": "libaction-launch-app.so"}`.

If a developer's request turns out to be about `appControl` or `plugin` actions, say so and point them at the framework docs — don't try to force it through the `actionc`/`ServiceBase` flow described here.

## What's here

The `actionc`/`action2tidl`/`tidlc` CLI reference — every flag, both
invocation modes, and the toolchain environment variables — is in the
[appendix below](#actionc-toolchain-cli-reference), further down this file.

Alongside it:

| Path | Read/run it when you need to... |
|---|---|
| `../scripts/check_toolchain_env.sh` / `.ps1` | Detect whether `actionc`/`action2tidl`/`tidlc` and their env vars are set up — read-only, never installs anything |
| `../scripts/list_categories.sh` / `.ps1` | List the default categories (and, with `--entities`/`-Entities`, entity types) actually installed on this machine, read live from `$ACTIONC_DATA_DIR/actions`/`entities` — no static index to go stale |

`.action`/`.entity` schema references and templates live in `custom-action.md`
and `../assets/`.

## How to use this when helping a developer

1. **Decide if a default category already covers what they want.** Run `../scripts/list_categories.sh` (or `.ps1`), optionally filtered by a keyword, and match its output against their plain-English description. Read the matching `.action` file(s) under `$ACTIONC_DATA_DIR/actions/` directly to see exact entity types.
2. **If a default category matches**, go to the matching language reference (`cs.md`/`cpp.md`/`js.md`/`dart.md`) — each one gives the right `-l` value, runs `actionc -a <Category>`, and covers what to do with the generated stub.
3. **If it's genuinely new** (no default category fits), read `custom-action.md` instead. It covers the `.action` and `.entity` schema formats and the templates in `../assets/`, then generates the stub. Once a stub exists, return to the matching language reference for implementation and registration.
4. **Before running `actionc`** (from either path above), run (or ask the developer to run) `../scripts/check_toolchain_env.sh` (or `.ps1` on Windows) to confirm the toolchain is actually installed and on PATH. If it's missing, the script will print the exact `install.sh`/`install.bat` command — never run the installer yourself, since it makes persistent changes to the developer's shell profile or Windows user environment variables.

## A note on why `actionc`/`tidlc` internals aren't detailed here

`actionc` is a thin orchestrator: it resolves your `.action`/`.entity` files, converts them to an intermediate `.tidl` file via `action2tidl`, and hands that to `tidlc`, which does the actual code generation. Developers only ever need to run `actionc` — `action2tidl` and `tidlc` are documented in the appendix for completeness, not because you should invoke them directly.

---

<a id="actionc-toolchain-cli-reference"></a>

# Appendix — `actionc` toolchain CLI reference

The toolchain (distributed via the sibling `TizenActionToolchain` repo) ships three binaries. **Developers only ever need to run `actionc` directly** — it orchestrates the other two internally. `action2tidl` and `tidlc` are documented below for completeness, not because you should invoke them yourself.

## `actionc` — the one you run

```
actionc - generate action service code from Tizen .action files

Drives the action tool chain: the .action files are converted to a TIDL
interface (action2tidl), then to service stub code (tidlc) that the
application implements.

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
  -e, --entity=PATH         Extra .entity file or directory, repeatable
  -d, --data-dir=DIR        Directory holding the framework's actions/ and
                            entities/ (default: $ACTIONC_DATA_DIR or the
                            default location)
      --keep-temp           Keep the intermediate .tidl files and print
                            their directory
  -v, --version              Show version information

Example
 # actionc -a Tizen.Action.Browser -l C++ -o ImplBrowser
 # actionc -i My_Custom.Action.Memo_Save.action -l C++ -o ImplCustom
```

### Two invocation modes

- **`-a <Category>`** — use a default category already known to the framework (check `../scripts/list_categories.sh`/`.ps1` first — it reads the live list from the data dir, not a static doc). Resolved from the data dir (`$ACTIONC_DATA_DIR` or `-d`).
- **`-i <file.action>`** (repeatable) **+ `-e <entity>`** (repeatable) — for a brand-new custom action the developer is defining themselves, not shipped in the framework's default data. The `.action` filename must follow `<prefix>_<category>_<method>.action`.

`-a` and `-i` are mutually exclusive — pick one.

### Language flag (`-l`)

`actionc`'s own help text only lists "C, C++, C#, JS, ..." but the value is passed straight through to `tidlc`, which supports C, C++, C#, Dart, Rust, and JavaScript. The four this skill covers:

| Pass to `actionc -l` | Language reference | Generated file |
|---|---|---|
| `C#` | `cs.md` | `Impl<Category>.cs` |
| `C++` | `cpp.md` | `Impl<Category>.h` + `.cc` |
| `JS` | `js.md` | `Impl<Category>.js` |
| `Dart` | `dart.md` | `Impl<Category>.dart` |

Note the JavaScript spelling: `tidlc` documents the language as `JavaScript`, but pass `JS` to `actionc`. `../scripts/run_actionc.sh --language <value>` accepts exactly these four values and rejects anything else, so it is the safer way to invoke generation.

## `action2tidl` — internal step (no `-v` flag)

```
action2tidl - convert Tizen .action / .entity (JSON) files to TIDL

All input actions must share one "category". The generated TIDL file contains
a single interface named after the category, with one method per action.
Actions whose schemas reference entity types (e.g. "Tizen.Entity.Query")
import the entity's "<typeName>.tidl" file; supply the entity schemas with
--entity so the references can be validated.

When the inputs are .entity files instead, each one is converted to its own
"<typeName>.tidl" (importing its base / referenced entities).

Usage:
  action2tidl <a.action> [<b.action> ...] [-e <entities>] [-o <output.tidl>]
  action2tidl <a.entity> [<b.entity> ...] [-o <out_dir>]
  action2tidl -                read one .action from stdin, write to stdout

Options:
  -i, --input <file>   Input .action file, repeatable (use '-' for stdin)
  -e, --entity <path>  An .entity file, or a directory of .entity files;
                       repeatable
  -o, --output <path>  Output .tidl file, or an existing directory when
                       converting several .entity files (default: stdout)
  -h, --help           Show this help
```

`actionc` calls this automatically as its first stage.

## `tidlc` — the real compiler

```
Additional Options:
  -l, --language=LANGUAGE     Select generating language (C, C++, C#, Dart, Rust, JavaScript).
  -i, --input=INPUT           A tidl interface file.
  -o, --output=OUTPUT         The generated interface file.
  -I, --import-dir=DIR        Add a directory to search for imported tidl files.
                              This option can be used multiple times.
  -n, --namespace             Add the prefix in the funtion name as output file name (C language only).
  -r, --rpclib                Generate C# library for rpc-port (C# language only).
  -b, --beta                  Use beta version (Support private file sharing).
  -t, --thread                Generate thread code (Stub only).
  -e, --extension             Use extension version (for inhouse developers).
  -u, --tcp                   Use tcp/ip protocol (Protocol 2 only)

Application Options:
  -p, --proxy                 Generate proxy code
  -s, --stub                  Generate stub code
  -g, --group                 Generate group code
  -v, --version               Show version information
```

`actionc` calls this as its second stage (`-s` for stub code, which is what an action-provider app needs).

### Toolchain compatibility

The `TizenActionToolchain` bundle ships `actionc`, `action2tidl`, and `tidlc` together, and each bundle release targets a minimum `tizen-action` version on the device. Rather than tracking those numbers here, where they would go stale, read them from the installation itself: the toolchain's `version.sh` reports the bundle release, and `actionc -v` / `tidlc -v` report the individual binaries.

Do that before regenerating stubs that are already checked in. Different `tidlc` versions can emit materially different code for the same `.action` file, so a stub regenerated with a different toolchain may no longer match the implementation written against the previous one. The mismatch usually surfaces as a confusing compile error rather than a version warning, which is what makes it worth checking up front. If the generated code changes shape unexpectedly, compare toolchain versions before assuming the schema is at fault.

## Environment variables

| Setting | Option | Environment variable | Default / Value |
|---|---|---|---|
| Action/entity schemas | `-d, --data-dir` | `ACTIONC_DATA_DIR` | `$HOME/.action-tools/data` (Windows: `$HOME\.action-tools\data`) |
| `action2tidl` binary | — | `ACTIONC_ACTION2TIDL` | `$HOME/.action-tools/action2tidl` (Windows: `$HOME\.action-tools\action2tidl.exe`) |
| `tidlc` binary | — | `ACTIONC_TIDLC` | `$HOME/.action-tools/tidlc` (Windows: `$HOME\.action-tools\tidlc.exe`) |

## Installing the toolchain

- **Linux**: `./install.sh` (from the `TizenActionToolchain` repo), then `source ~/.bashrc`.
- **Windows**: run `install.bat` (from the `TizenActionToolchain` repo), then restart the shell.

Both installers copy the binaries + data into `~/.action-tools` (or `%USERPROFILE%\.action-tools`) and **persistently** set the three environment variables above — this is a standing change to the developer's shell profile (`~/.bashrc`/`~/.profile`) or Windows user environment variables.

**Never run these installers on the developer's behalf.** Use `../scripts/check_toolchain_env.sh`/`.ps1` to detect whether the toolchain is already set up, and if not, print the exact command above for the developer to run themselves.
