# tizen-sdk Plugin Implementation Summary

English | [한국어](IMPLEMENTATION_SUMMARY.md)

> Written: 2026-07-16
> Target Repository: `tizen-cli` (direct modifications)
> Logic Source: `tizen-sdk-skills` repository root (reference only, no changes)

## 1. Overview

Ported this repository's plugin (Claude Code / Cline harness + `common/` shared logic) into **tizen-cli** as a formal third-party plugin. Paths below are inside the tizen-cli repository, where the plugin directory kept its original name `plugins/tizen-sdk-agents/`.

- Existing `plugins/tizen-sdk` plugin is **retained** — both coexist
- `.agents/skills` was **replaced** with 15 new SKILL.md files for the new plugin
- Invocation: `tizen-cli tizen-sdk <command> [--options...]`

## 2. Confirmed Design Decisions

| Item                   | Decision                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Plugin Name            | `tizen-sdk` (replaces the old tizen-sdk plugin; formerly tizen-sdk-skills)                                                             |
| Command Structure      | **Flat 14 commands** — 1:1 mapping to source repo CLI runners (`common/lib/cli/*-cli.js`) (now 17, see section 8) |
| SKILL.md               | **Bundled in plugin dist** (plugin install copies entire dist, so shipped together)                               |
| Claude/Cline Harness   | Unchanged from source repo                                                                                        |

## 3. Command List (14 at port time — now 25, see section 8)

| Command            | Function                                                | Mapped Core Function                                 |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| `sdk-init`         | Configure Tizen SDK installation path                   | `initSdk(sdkPath)`                                   |
| `sdk-install`      | Install Tizen SDK (fast pre-check + suggested_fix)      | `installSdk(version, label, force, repoUrl)`         |
| `sdk-install-custom-repo` | Install the SDK from a custom package repository URL (validated against `pkg_list_{OS}-{64,32}`) | `installSdkFromRepo(repoUrl, platformVersion, force)` |
| `validate-repo-url` | Check whether a URL is a usable Tizen package repository | `validateRepoUrl(repoUrl)`                          |
| `sdk-repo-info`    | Query SDK package repository info (official CDN + regional mirrors, configured URL; private mirrors via `--repo-url`) | `getRepoInfo()`                                    |
| `tv-sdk-install`   | Install TV SDK extension (TV-SAMSUNG-Public)            | `installTvSdk(force)`                                |
| `check-node`       | Verify Node.js installation and PATH                    | `checkNode()`                                        |
| `check-disk-space` | Verify disk space before install                        | `checkDiskSpace(path, requiredGb)`                   |
| `dotnet-setup`     | Verify .NET SDK and install Tizen workload              | `setupDotnet(force, version)`                        |
| `create-project`   | Create project from SDK template                        | `createProject(type, template, parentPath, appName)` |
| `list-templates`   | List available SDK templates                            | `listTemplates(type)`                                |
| `build-project`    | Build and package (.tpk/.wgt)                           | `buildProject(projectPath, buildType, signProfile)`  |
| `device-manager`   | Find device or create/launch emulator                   | `manageDevice(timeoutSec, vmName)`                   |
| `install-app`      | Install package (optional: run)                         | `installApp(packagePath, serial, run)`               |
| `gdb-debug`        | Setup remote GDB debugging for Native (setup-only)      | `setupGdbDebug(appId, binaryPath, opts)`             |
| `dotnet-debug`     | Setup remote netcoredbg debugging for .NET (setup-only) | `setupDotnetDebug(appId, opts)`                      |
| `update-package`   | Update installed SDK packages                           | `updatePackage(force, dryRun)`                       |

Required options are registered with `.requiredOption()`, choices with `.choices()`, so `tizen-cli --schema` automatically reflects `required` / `enum` / `default`.
(Schema generator introspects options only, so positional arguments are avoided)

## 4. Modified/Created Files

### 4.1 New: `plugins/tizen-sdk-agents/` (tizen-cli repo)

```
plugin.json                  Plugin manifest (commands auto-updated on build via --schema)
package.json                 deps: commander ^12.1.0 / dev: esbuild, typescript, @types/node
tsconfig.json                Follows scaffold template (noEmit, strict:false)
esbuild.config.js            src/index.ts → dist/tizen-sdk.js (cjs, node18, minify)
                             + copies plugin.json/scripts/skills to dist + auto-updates commands
README.md                    Usage, architecture, skills sync rules, excluded (future) items
src/
  index.ts                   run() entry point — --schema/--doctor/--capabilities/list/dispatch
  commands.ts                Command registration engine — registerCommand()/buildProgram()
                             (command definitions come from command-specs/, see section 8)
  command-specs/             Declarative command specs (per-domain modules)
    types.ts                 OptionSpec/CommandSpec types, SERIAL_OPTION, PROJECT_TYPES, sdkCommands
    sdk.ts                   sdk-init, sdk-install, sdk-install-custom-repo, validate-repo-url,
                             sdk-repo-info, tv-sdk-install, tv-sdk-install-from-zip, update-package,
                             download-emulator-package, dotnet-setup
    check.ts                 check-node, check-disk-space (pre-flight environment checks)
    project.ts               create-project, list-templates, build-project
    device.ts                device-manager, install-app, sdb-helper, screenshot, file-transfer, remote-device
    debug.ts                 gdb-debug, dotnet-debug
    index.ts                 Concatenates the domain arrays into COMMAND_SPECS
  envelope-adapter.ts        Internal envelope → tizen-cli envelope conversion + didFail flag
  doctor.ts                  --doctor (6 checks: Node/scripts/shell/SDK/sdb/em-cli) / --capabilities (SDK state based)
  lib/core-utils.ts          Copied from plugins/tizen-sdk as-is (inline Plugin SDK)
  lib/schema-generator.ts    Copied from plugins/tizen-sdk as-is
vendor/
  core/plugin-cache.js       ★ Only modified vendored file (see 5.1)
  core/{sdk,project,device,dotnet,debug,preflight,output-summary,sdk-commands}.js
                             Unmodified from source repo common/lib/core/
  envelope/{envelope,response-formatter}.js
                             Unmodified from source repo common/lib/envelope/
scripts/                     Unmodified from source repo common/scripts/ (except t-cli.ps1/sh/T-CLI.md)
                             — 9 function directories + lib/common.ps1|sh + create-project templates/
skills/                      15 SKILL.md files (canonical source, see 4.2)
```

Intentionally Excluded: `common/lib/cli/*` (uses process.exit → replaced by commander),
`lib/tests/`, `envelope-wrapper.js`, `agents/`, `hooks/`, `t-cli.*`

### 4.2 Replaced: `.agents/skills/`

- **Deleted (7)**: `tizen-cli`, `tizen-cli-build-project`, `tizen-cli-create-project`,
  `tizen-cli-device`, `tizen-cli-emulator`, `tizen-cli-install-sdk`, `tizen-cli-run-project`
- **Added (15)**: 14 per-command + umbrella skill `tizen-sdk`
  - Frontmatter Korean/English trigger phrases and keywords preserved from source repo skills
  - Body rewritten for `tizen-cli tizen-sdk <cmd> --opt` invocation style
    (Removed: Claude subagent delegation, Cline cache path search, `node <runner>.js` calls)
  - Unified body structure: When to use → Prerequisites → Command → Options table → Output → Follow-ups
  - Special flows preserved: sdk-install/tv-sdk-install two-phase pattern, device/install 600000ms timeout guidance, debug command setup-only semantics
- **Canonical is `skills/`** — resync to `.agents/skills/` after skill changes

### 4.3 Modified: Root `package.json`

- Added `"build:tizen-sdk-agents": "cd plugins/tizen-sdk-agents && node esbuild.config.js"`
- `build:all`: updates in order plugin-sdk → tizen-sdk (old) → tizen-sdk → core

## 5. Critical Porting Decisions

### 5.1 Script Path Resolution (`vendor/core/plugin-cache.js` — only modification)

Original scanned `~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/`.
In tizen-cli, `plugin install` copies entire dist to `~/.tizen/plugins/tizen-sdk/`, so
**scripts/ is resolved relative to `__dirname`** (overridable via `TIZEN_SDK_SKILLS_ROOT` env var).

Export names (`findLatestVersionDir`, `resolveScript`, `execPluginScript`) are preserved, so
the remaining core modules that directly call these (including `debug.js`) work **unmodified**.
`execPluginScript` (captureViaTempFile, chcp 65001, -ExecutionPolicy Bypass, 64MB maxBuffer)
is byte-for-byte identical — captureViaTempFile prevents execSync hangs from long-lived child
processes (emulator, gdbserver, etc.), so simplification is forbidden.

### 5.2 Envelope Adapter (`src/envelope-adapter.ts`)

| Internal Envelope (Source Repo)              | tizen-cli Envelope                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `status: 'success'`                          | `'success'`                                                                    |
| `status: 'failure'` / `'error'` / other      | `'failure'`                                                                    |
| `errors[].error_code` (+ `code` fallback)    | `errors[].error_code` (defaults to `EXECUTION_ERROR` if absent)                |
| `error_category`, `suggested_fix`, `details` | Pass-through                                                                   |
| `command`, `duration_ms`                     | Preserved as top-level metadata fields (Core judges didFail from run() return) |

### 5.3 In-Process Safety (No process.exit)

tizen-cli Core **in-process `require()`** the plugin bundle and `await plugin.run(args)`.
Source repo `cli-runner.js` calls `process.exit()`, so it's not used.
Instead, `execute()` helper writes envelope output + records `didFail` flag → `run()`
returns `{status: 'success'|'failure'}`, which Core maps to exit code (0/1).
Vendored core/envelope modules were grep-checked to confirm no process.exit.

### 5.4 Two-Phase Pattern for Long Installs (Design Inherited)

`sdk-install`/`tv-sdk-install` are **fast pre-check only**. If not installed, failure envelope's
`errors[0].suggested_fix.command` contains a ready-to-run installer command; the agent
runs it in background then rechecks. (Avoids JSON-only stdout blocking 10-15min installations)

**Harness-specific execution method:**

- **Claude Code**: `run_in_background: true` → wait for `<task-notification>` → verify
- **Cline**: `--detach` (Linux/macOS) / `-Detach` (Windows) to launch a detached process → poll `--status` / `-Status` every 60s → verify when `STATUS=done`
  - Cline has a 10-minute background timeout, so `run_in_background: true` must NOT be used
  - Foreground execution is not recommended (121-package log floods the context window)

## 6. Verification Results (All Pass, Windows)

| Verification Item                                        | Result                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm/npm install` + `npm run build`                     | 82.4KB bundle, plugin.json 12 commands auto-updated                                                                          |
| In-process smoke (`node -e "require(...).run([...])"`)   | check-node success / build-project missing required option → failure envelope, **run() returns normally** (no process.exit)  |
| `tizen-cli plugin install dist`                          | Bundle+plugin.json+scripts+skills installed to `~/.tizen/plugins/tizen-sdk/`                                          |
| `tizen-cli plugin list`                                  | tizen-sdk 0.1.0, 12 commands listed                                                                                   |
| `tizen-cli tizen-sdk check-node`                  | Success envelope, exit 0                                                                                                     |
| `... build-project` (missing option)                     | Failure envelope, exit 1                                                                                                     |
| `... sdk-install`                                        | Detects installed SDK (sdk.info) → success + guidance warnings                                                               |
| `... list-templates --type webapp`                       | **Actual .ps1 executes** → `{"webapp":["Basic","WebService"]}` — full stack from install path to script interpretation works |
| `tizen-cli --schema`                                     | 12 flat commands + required/enum/default reflected                                                                           |
| `tizen-cli doctor`                                       | Plugin checks (6: Node/scripts/shell/SDK/sdb/em-cli) integrated in output — the em-cli check probes `em-cli list-vm` to surface Java/JNA runtime breakage up front (issue #40) |
| `tizen-cli tizen-sdk --doctor` / `--capabilities` | Works correctly (all 12 commands available when SDK installed)                                                               |

Update workflow after changes:

```bash
cd plugins/tizen-sdk-agents
pnpm run build
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install <repo>/dist
```

## 7. Notes / Unresolved Issues

- **Has own SKILL.md: Yes (15 bundled)** — MCP tools/list not supported; for Tool search. Team table marking required.
- **Dual skills location**: Canonical `skills/` ↔ `.agents/skills/` manual sync.
  Future candidate: sync script.
- **Feature overlap with existing tizen-sdk plugin** (build/create/device): Umbrella skill explicitly routes to the current plugin (tizen-sdk, formerly tizen-sdk-skills) first to prevent confusion.
- **PATH tizen-cli caveat**: Globally installed `tizen-cli` on dev machine is a different tool
  (`@monorepo/tizen-sdk-cli`, SDK Server client) without `plugin` command.
  Verification uses repo build (`node <repo>/dist/cli.js`) — production use requires re-running install script or PATH cleanup.
- **Corporate Proxy TLS**: Dependency install needed `npm install --strict-ssl=false`
  (per-command only, global config unchanged).
- The `suggested_fix` commands in `envelope.js` / `envelope-wrapper.js` / `sdk.js` used the old
  plugin's nested syntax (`tizen-cli tizen-sdk emulator start` etc.); they were all migrated to the
  current plugin's flat commands (`launch-emulator`, `sdk-init`, ...) with the 2026-09 rename.

## 8. Command Definition Refactoring (2026-07-28)

> Sections 1–7 are the record of the initial port (2026-07-16). Since then the
> command count grew to 17 (sdk-init, sdb-helper, screenshot, file-transfer
> added), and the command definition structure was refactored as follows (PR #59).

### 8.1 Data-driven command registration

The 17 near-identical Commander builder chains in `src/commands.ts` were replaced
with a declarative `COMMAND_SPECS: CommandSpec[]` array plus a `registerCommand()`
registration loop.

- Each command is a single `{ name, description, options, handler }` spec —
  the handler is a one-line mapping to the shared core function
  (`common/lib/core/sdk-commands`)
- `registerCommand()` registers real Commander `Option` objects
  (`choices`/`default`/`makeOptionMandatory`), so the runtime schema
  introspection in `schema-generator.ts` (see section 3) works unchanged —
  verified that the per-command `--schema` output is identical for all 17
  commands before and after the refactor
- create-project's "report ALL missing required options at once" behavior is
  generalized via a `collectAllMissing` flag (same error_code/message format)
- The `COMMANDS` list in `src/index.ts` is derived via
  `getCommandNames(buildProgram())` instead of a hardcoded array — it can no
  longer drift from the actually registered commands

### 8.2 Per-domain spec modules

`commands.ts` is now engine-only (~100 lines); the specs live in
`src/command-specs/`, grouped by functional domain. Adding a command = one
spec in the matching domain file.

| Module       | Commands (25)                                                       |
| ------------ | ------------------------------------------------------------------- |
| `sdk.ts`     | sdk-init, sdk-install, sdk-install-custom-repo, validate-repo-url, sdk-repo-info, tv-sdk-install, tv-sdk-install-from-zip, update-package, download-emulator-package, dotnet-setup |
| `check.ts`   | check-node, check-disk-space                                        |
| `project.ts` | create-project, list-templates, build-project                       |
| `device.ts`  | device-manager, install-app, sdb-helper, screenshot, file-transfer, remote-device |
| `debug.ts`   | gdb-debug, dotnet-debug                                             |

The `check` domain is named after the `check-*` command names rather than
"doctor" to avoid confusion with the `--doctor` meta-command handler
(`src/doctor.ts`).

### 8.3 Command naming convention

- **Existing names stay** — action-domain names like create-project are part of
  the public interface (docs, SKILL.md files, user scripts, and MCP tool names
  derived by the schema generator) and are not renamed.
- **New commands use domain-action** — `<domain>-<action>` (e.g.
  `project-create`, `app-install`). Documented in the
  `command-specs/index.ts` header comment.

## 9. Platform Project Creation and RPM Install Improvements (2026-07-28)

### 9.1 Automatic Template Name Substitution (`create-project-app.sh`)

The `dali_demo` platform template hardcodes the default name `dali-demo` in CMakeLists.txt,
the `.spec` file, and other project files. When the user specifies a different project name via
`--name`, the creation script automatically performs the following substitutions:

1. **CMakeLists.txt** — global `dali-demo` → `<project-name>` replacement (CMake target name, binary name)
2. **packaging/`dali-demo.spec`** — content replacement, then renamed to `<project-name>.spec`
3. **Other text files** (`.txt`, `.cmake`, `.yaml`, `.json`, `.md`, `.spec`) — `dali-demo` → `<project-name>` replacement

This allows users to build and package RPMs with their chosen name regardless of the template name.
Example: `--name my-app` → `my-app-1.0.0-1.x86_64.rpm`

Additionally, the "Next steps" message was updated from `.tpk` to `RPM` to accurately reflect the
actual build artifact format for platform apps.

### 9.2 Automatic Rerun Script Generation for RPM Apps (`tizen-install-app.sh`)

Platform (RPM) apps are not registered with `app_launcher`, so after the app is killed (e.g., Back key)
there is no way to restart it from the device home screen. To solve this, the `install-app` command
automatically generates a host-side rerun script at `~/bin/run-<app-name>.sh` after installing an RPM package.

**Script features:**

- Automatic device detection (or specify via serial argument)
- Root access (`sdb root on`)
- Add owner user to display group (Wayland socket access)
- Write launcher script on device (Wayland environment variables, nohup setsid execution)
- Launch as owner user (uid 5001) via `su - owner`
- Process verification (`pgrep`)

**Usage example:**

```bash
# Re-launch the app (no RPM re-install needed)
~/bin/run-dali-demo.sh
```
