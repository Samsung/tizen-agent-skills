# tizen-cli harness (tizen-sdk plugin)

English | [한국어](README.ko.md)

The third harness of **tizen-sdk-skills** (alongside `claude/` and `cline/`):
a tizen-cli plugin
exposing the shared workflows as standard CLI commands.

```
tizen-cli tizen-sdk <command> [--options...]
```

## Commands (flat, 34)

| Command            | Purpose                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `sdk-init`         | Configure the Tizen SDK installation path (writes `~/.tizen.sdk.path.config`)  |
| `sdk-install`      | Install the Tizen SDK (fast pre-check + `suggested_fix` installer command)     |
| `sdk-install-custom-repo` | Install the Tizen SDK from a custom package repository URL (validated against `pkg_list_{OS}-{64,32}`) |
| `validate-repo-url` | Check whether a URL is a usable Tizen package repository (read-only)          |
| `tv-sdk-install`   | Install the TV SDK extension (TV-SAMSUNG-Public)                               |
| `tv-sdk-install-from-zip` | Install the TV SDK extension from a local ZIP file (offline; all packages bundled in the ZIP) |
| `update-package`   | Update installed Tizen SDK packages                                            |
| `sdk-repo-info`    | Show Tizen SDK package repository information (CDN mirrors, internal mirrors, current URL) |
| `download-emulator-package` | Download and install the Tizen emulator package from the package repository |
| `platform-install` | Download and install the Tizen platform package (TIZEN-{version})             |
| `download-mobile-platform` | Download and install the Tizen Mobile platform package (MOBILE-{version}), optionally with IOT-Headed |
| `install-rootstrap` | Install a custom rootstrap ZIP into the Tizen SDK                              |
| `dotnet-setup`     | Verify .NET SDK + install the Tizen .NET workload                              |
| `check-node`       | Verify Node.js is installed and on PATH                                        |
| `check-disk-space` | Verify free disk space before SDK install                                      |
| `create-project`   | Scaffold a Native/DotNET/WebApp/TV/Platform project from SDK templates (Platform produces .rpm via GBS) |
| `project-delete`   | Delete a Tizen project directory on the SDK host                               |
| `list-templates`   | List available project templates                                               |
| `build-project`    | Build + package a project (.tpk/.wgt/.rpm)                                     |
| `create-emulator`  | Create a custom Tizen emulator VM (also list/delete platforms, templates, VMs) |
| `launch-emulator`  | Launch an existing Tizen emulator VM via em-cli                                |
| `emulator-manager` | Full em-cli surface: create, delete, launch, list, modify, reset, capture VMs |
| `device-manager`   | Find a connected device via sdb, or stop a running emulator                    |
| `install-app`      | Install (and optionally run) a .tpk/.wgt/.rpm on a device                     |
| `sdb-helper`       | Run the correct sdb command from a natural-language request                    |
| `screenshot`       | Capture a screenshot from a Tizen emulator or device                           |
| `file-transfer`    | Push (host→device) or pull (device→host) files/directories via sdb            |
| `remote-device`    | Scan, connect, disconnect, and manage bookmarked remote Tizen devices          |
| `gdb-debug`        | Set up remote GDB debugging for Native apps (setup-only; refuses WebApps)      |
| `dotnet-debug`     | Set up remote netcoredbg debugging for .NET apps (setup-only; refuses WebApps) |
| `webapp-debug`     | Set up remote Web app debugging via RWI/CDP (setup-only)                        |
| `dlog-analyzer`    | Collect dlog, detect crashes/exceptions and analyse root causes (start/stop/status, app-launch, error-analyze) |
| `playwright-test`  | Run (or scaffold) a Playwright test against a Tizen Web app over CDP           |
| `certificate-manager` | Manage Tizen certificates and signing profiles (generate, import, inspect, create/remove profiles, Samsung online-CA) |

All commands print a single Standard JSON Envelope to stdout; diagnostics go
to stderr only.

## Command Schema Reference

Each command's options, required flags, and defaults are auto-generated from
the Commander program at build time (`--schema`). Below is the full reference.

| Command            | Required options                                                                 | Optional options                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk-init`         | —                                                                                | `--sdk-path` (default: `~/tizen-sdk`)                                                                                                                                              |
| `sdk-install`      | —                                                                                | `--tizen-version` (default: `10.0`), `--label` (default: `tizen`), `--force`, `--repo-url`                                                                                          |
| `sdk-install-custom-repo` | `--repo-url`                                                              | `--platform-version`, `--force`                                                                                                                                                    |
| `validate-repo-url` | `--repo-url`                                                                    | —                                                                                                                                                                                  |
| `tv-sdk-install`   | —                                                                                | `--force`                                                                                                                                                                          |
| `tv-sdk-install-from-zip` | `--zip-path`                                                              | `--force`                                                                                                                                                                          |
| `update-package`   | —                                                                                | `--force`, `--dry-run`                                                                                                                                                             |
| `sdk-repo-info`    | —                                                                                | —                                                                                                                                                                                  |
| `download-emulator-package` | —                                                                        | `--platform-version`, `--force`                                                                                                                                                    |
| `platform-install` | `--platform-version`                                                             | `--force`                                                                                                                                                                          |
| `download-mobile-platform` | —                                                                        | `--platform-version`, `--include-iot-headed`, `--iot-headed-version`, `--force`                                                                                                    |
| `install-rootstrap` | `--zip-path`                                                                   | `--force`                                                                                     |
| `dotnet-setup`     | —                                                                                | `--force`, `--workload-version`                                                                                                                                                    |
| `check-node`       | —                                                                                | —                                                                                                                                                                                  |
| `check-disk-space` | —                                                                                | `--path`, `--required-gb` (default: `15`)                                                                                                                                          |
| `create-project`   | `--type` (`native`\|`dotnet`\|`webapp`\|`tv`\|`platform`), `--template`, `--parent-path`, `--name` | `--force` (replace existing target folder)                                                                                                                                         |
| `project-delete`   | `--project`                                                                      | — (server-side delete; refuses non-Tizen-project paths)                                                                                                                            |
| `list-templates`   | —                                                                                | `--type` (`native`\|`dotnet`\|`webapp`\|`tv`\|`platform`)                                                                                                                          |
| `build-project`    | `--project`                                                                      | `--build-type` (default: `Debug`, enum: `Debug`\|`Release`\|`Test`), `--sign-profile`, `--arch` (default: `x86_64`, enum: `armv7l`\|`aarch64`\|`i586`\|`x86_64`), `--clean` (full rebuild) |
| `create-emulator`  | —                                                                                | `--action` (default: `create`, enum: `create`\|`list-platform`\|`list-template`\|`list-vm`\|`delete`), `--vm-name`, `--platform`, `--size`, `--assume-defaults`, `--template`, `--profile` (default: `tizen`), `--launch`, `--raw-image-path` |
| `launch-emulator`  | —                                                                                | `--vm-name` (default: first VM), `--timeout` (default: `300`)                                                                                                                       |
| `emulator-manager` | —                                                                                | `--action` (default: `create`, enum: `create`\|`delete`\|`launch`\|`list-vm`\|`list-platform`\|`list-template`\|`detail`\|`modify`\|`reset`\|`create-image`), `--vm-name`, `--size`, `--assume-defaults`, `--template`, `--platform`, `--profile` (default: `tizen`), `--launch`, `--skin`, `--ram-size`, `--file-sharing-path`, `--hw-virtualization`, `--hw-gl-acceleration`, `--custom-path`, `--raw-image-path`, `--output-dir`, `--compress`, `--confirm`, `--detail`, `--count`, `--timeout` (default: `300`), `--emulator-path` |
| `device-manager`   | —                                                                                | `--action` (default: `start`, enum: `start`\|`stop`), `--timeout` (default: `300`), `--vm-name` (default: `tizen-vm-default`), `--profile` (default: `tizen`, enum: `tizen`\|`tv`) |
| `install-app`      | `--package`                                                                     | `--serial`, `--run`                                                                                                                                                                |
| `sdb-helper`       | `--request`                                                                      | `--serial`                                                                                                                                                                         |
| `screenshot`       | —                                                                                | `--serial`, `--output` (default: `./emulator_screenshot.png`)                                                                                                                      |
| `file-transfer`    | `--direction` (`push`\|`pull`), `--remote`                                      | `--local` (required for push; defaults to `.` for pull), `--serial`, `--with-utf8`                                                                                                 |
| `remote-device`    | —                                                                                | `--action` (default: `scan`, enum: `scan`\|`connect`\|`disconnect`\|`list`\|`add`\|`remove`\|`edit`\|`list-saved`), `--ip`, `--subnet`, `--port` (default: `26101`), `--timeout` (default: `3000`), `--name`, `--new-ip`, `--new-port` |
| `gdb-debug`        | `--app-id`, `--binary`                                                          | `--mode` (default: `attach`, enum: `attach`\|`launch`), `--breakpoints`, `--port` (default: `5039`), `--timeout` (default: `30`) |
| `dotnet-debug`     | `--app-id`                                                                       | `--mode` (default: `launch`, enum: `attach`\|`launch`), `--breakpoints`, `--port` (default: `4711`), `--serial`, `--force-install`, `--timeout` (default: `30`) |
| `webapp-debug`     | `--app-id`                                                                       | `--port` (default: `9222`), `--serial`, `--timeout` (default: `30`)                                                                                                                |
| `dlog-analyzer`    | `--action`                                                                       | `--subcommand` (default: `start-monitoring`), `--app-id`, `--format`, `--output-dir`          |
| `playwright-test`  | —                                                                                | `--app-id`, `--test-file`, `--project-dir`, `--port` (default: `9222`), `--serial`, `--setup-timeout` (default: `30`), `--timeout` (default: `120`), `--no-setup`, `--scaffold`, `--force` |
| `certificate-manager` | —                                                                             | `--action` (default: `generate-author`, 21 choices), `--name`, `--password`, `--prompt-password`, `--password-file`, `--file`, `--email`, `--department`, `--organization`, `--city`, `--state`, `--country`, `--identity`, `--type`, `--version`, `--profile-name`, `--author-cert`, `--author-password`, `--prompt-author-password`, `--author-password-file`, `--distributor-type`, `--distributor-version`, `--distributor-password`, `--prompt-distributor-password`, `--distributor-password-file`, `--distributor2-cert`, `--distributor2-password`, `--prompt-distributor2-password`, `--distributor2-password-file`, `--distributor2-ca`, `--distributor2-type`, `--distributor2-version`, `--profiles-xml`, `--active`, `--source`, `--certificate-type`, `--target-file`, `--overwrite`, `--certificate`, `--duid-list`, `--duid-file`, `--privilege`, `--serial` |

> **Note:** The schema is introspected at runtime from the Commander program
> built by `src/commands.ts` from the declarative specs in
> `src/command-specs/` (per-domain modules: sdk, check, project, device, debug,
> test, certificate). Run `tizen-cli tizen-sdk --schema` to get the
> machine-readable JSON version. The `plugin.json` `"commands"` array is
> auto-updated during `pnpm build` (or `npm run build`).

## Long-running operations & timeout

The default MCP/mcporter call timeout is **60 seconds**, which is too short
for some operations. The plugin's `execPluginScript` uses a **30-minute
(1,800,000 ms) default timeout** that can be overridden.

| Operation                        | Typical duration | Mitigation                                                                         |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `sdk-install`                    | 10–30 min        | Two-phase pattern: fast pre-check → `suggested_fix.command` for background install |
| `sdk-install-custom-repo`        | 10–30 min        | Same two-phase pattern; the URL is validated first, so an invalid repository fails in seconds |
| `device-manager` (device lookup) | < 10 s           | `sdb devices` — no emulator boot; returns `device_not_found` if no device connected |
| `build-project` (large project)  | 1–10 min         | 10-min default timeout; extend via env var                                         |
| `gdb-debug` / `dotnet-debug`     | < 30 s           | Setup-only pattern — no timeout issue                                              |

### Extending the timeout

```bash
# Option 1: Plugin-level timeout (applies to all script executions)
# Value is in milliseconds. Default: 600000 (10 min)
export TIZEN_TOOL_TIMEOUT=1800000   # 30 minutes

# Option 2: MCP/mcporter call timeout
export MCPORTER_CALL_TIMEOUT=1800000

# Option 3: Per-call timeout (programmatic, in opts.timeout)
# Used internally by specific commands that need custom limits
```

> **Note:** For SDK installation, the two-phase pattern is preferred over
> extending the timeout — the pre-check returns quickly (< 60s) with a
> `suggested_fix.command` that the agent runs in the background.

## Architecture — no vendor copy

This harness has **no `vendor/`
snapshot**: esbuild bundles the shared sources directly.

```
src/               TypeScript plugin shell (command engine + declarative specs in
                   command-specs/ per-domain modules: sdk, check, project, device,
                   debug, test, certificate — envelope adapter,
                   --schema/--doctor/--capabilities) — requires ../common/lib/core
../common/lib/     Shared CommonJS domain logic (single source of truth)
../common/scripts/ Platform .ps1/.sh feature scripts → copied to dist/scripts
skills/            31 SKILL.md files for agents driving tizen-cli (29 + umbrella router + tizen-list-templates) → dist/skills
```

- `common/lib/core/plugin-cache.js` resolves `scripts/` for every harness
  (env override → next to the bundle → repo/cache-relative → legacy scan of
  the `.claude/.cline/.codex/.gemini` caches), so no harness-specific patch is needed.
- The plugin runs **in-process** inside tizen-cli — no `process.exit()`
  anywhere; failures propagate through `run()`'s return value.
- Long-running SDK installs use the two-phase pattern: fast pre-check; on
  failure `errors[0].suggested_fix.command` carries the installer command to
  run in the background.

## Build

```
cd tizen-cli
pnpm install         # or npm install
pnpm build            # bundles src → dist/tizen-sdk.js, copies
                      # plugin.json + ../common/scripts + skills/, auto-updates
                      # plugin.json "commands" via --schema
```

`pnpm build` empties `dist/` first, so files from an earlier build (a renamed
bundle, a deleted script or skill) never leak into `tizen-cli plugin install dist/`.

> **Note:** pnpm is the preferred package manager (used by ahub CI).
> A `pnpm-workspace.yaml` is included to allow esbuild's postinstall
> script. npm also works as a fallback.

## Install / reinstall

> The plugin is registered as `tizen-sdk` and replaces the older `tizen-sdk`
> plugin (nested `sdk init` / `emulator create` commands). If that one is
> installed, or a previous `tizen-sdk-skills` build is, remove it first:
> `tizen-cli plugin uninstall tizen-sdk` / `tizen-cli plugin uninstall tizen-sdk-skills`.

```
tizen-cli plugin install <repo>/tizen-cli/dist
# after edits:
pnpm build
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install <repo>/tizen-cli/dist
```

## Not included (future work)

- The Claude/Cline-specific layers (`../common/agents`, `hooks`, setup scripts)
  are not part of this plugin.
