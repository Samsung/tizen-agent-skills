# t-cli — Tizen SDK helper CLI

`t-cli` is a thin, human-facing wrapper around the per-feature scripts in this
`scripts/` directory. It gives you a single entry point (`t-cli <action> [options]`)
instead of remembering each individual script path. It does **not** reimplement any
logic — it just routes the action to the matching script and forwards your arguments
verbatim.

> Note: `t-cli` is for **people** running things by hand. The Claude Code / Cline agents/skills
> keep calling the per-feature scripts directly; they do not depend on `t-cli`.

---

## Location

```
scripts/
  t-cli.sh     # Linux / macOS / WSL2
  t-cli.ps1    # Windows (PowerShell)
```

When the plugin is installed, the scripts live under the plugin cache, e.g.:

```
~/.{claude,cline,codex,gemini}/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/scripts/
```

---

## Quick start

**Linux / macOS / WSL2**
```bash
bash /path/to/scripts/t-cli.sh --help
bash /path/to/scripts/t-cli.sh build -w ~/tizen-apps/MyApp -b Debug
```

**Windows (PowerShell)**
```powershell
powershell -ExecutionPolicy Bypass -File C:\path\to\scripts\t-cli.ps1 --help
powershell -ExecutionPolicy Bypass -File C:\path\to\scripts\t-cli.ps1 build -w C:\tizen-apps\MyApp -b Debug
```

---

## Optional: make it callable as just `t-cli`

**Bash** — add to `~/.bashrc` (adjust the path to your install):
```bash
alias t-cli='bash "$HOME/.{claude,cline,codex,gemini}/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/scripts/t-cli.sh"'
```
Then: `t-cli build -w ~/tizen-apps/MyApp -b Debug`

**PowerShell** — add to your profile (`notepad $PROFILE`):
```powershell
function t-cli { powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.{claude,cline}\plugins\cache\tizen-platform\tizen-sdk-skills\<VERSION>\scripts\t-cli.ps1" @args }
```
Then: `t-cli build -w C:\tizen-apps\MyApp -b Debug`

---

## Actions

| Action | What it does | Routes to |
|---|---|---|
| `install` | Install the Tizen SDK + platform packages | `tizen-sdk-install` |
| `dotnet-setup` | Verify the .NET SDK and install the Tizen workload | `tizen-dotnet-setup` |
| `update-package` | Update installed Tizen SDK packages | `tizen-update-package` |
| `create` | Create a Tizen project (native / dotnet / webapp / tv / platform) | `tizen-create-project` |
| `build` | Build **and** package a project (`tz build` + `tz pack`) | `tizen-build-project` |
| `device` | Find a connected device, or create/launch an emulator | `tizen-device-manager` |
| `app-install` | Install a `.tpk` / `.wgt` / `.rpm` on a device/emulator | `tizen-install-app` |
| `debug` | Remote GDB debug a native app | `tizen-gdb-debug` |
| `screenshot` | Capture a screenshot from emulator/device | `tizen-screenshot` |
| `--help` / *(no action)* | Print the action list | — |

Any options after the action are passed straight through to the underlying script, so
`t-cli <action> --help` (or `-Help` on Windows) shows that action's own options.

---

## Per-action examples

Examples show the bash form first, then the PowerShell form.

### install
```bash
t-cli install                 # install (idempotent; skips if already installed)
t-cli install --check         # report whether the SDK is already installed
```
```powershell
t-cli install
t-cli install -Check
t-cli install -Status         # query the last/in-progress run: running | done EXIT=<n> | none
```

### dotnet-setup
```bash
t-cli dotnet-setup            # verify .NET SDK + install the Tizen workload
t-cli dotnet-setup --force    # reinstall the workload even if present
```

### create
```bash
t-cli create --list-templates
t-cli create --type native --template ServiceApp --name MyApp
```
```powershell
t-cli create -ListTemplates
t-cli create -Type native -Template ServiceApp -Name MyApp
```
`--type` / `-Type` is one of `native`, `dotnet`, `webapp`, `tv`, `platform`.
Platform projects are built with GBS and produce `.rpm` packages (see
[Platform GBS Build Guide](../../docs/platform-gbs-build.en.md)).
Omit the path to create under the current workspace (or `~/tizen-apps`).

### build
```bash
t-cli build -w ~/tizen-apps/MyApp -b Debug          # -b: Debug (default) | Release | Test
t-cli build -w ~/tizen-apps/MyApp -b Release -s myprofile
```
Produces a `.tpk` (Native/DotNET), `.wgt` (WebApp), or `.rpm` (Platform via GBS) under the build-type directory.

### device
```bash
t-cli device                  # print a connected serial, or launch a default emulator
```

### app-install
```bash
t-cli app-install -p /abs/path/MyApp.tpk           # Linux/macOS: -p, ABSOLUTE path
```
```powershell
t-cli app-install -PackagePath C:\abs\path\MyApp.wgt
```

### debug
```bash
# Always runs setup-only (-N): starts gdbserver + port forward, prints the gdb command to paste
t-cli debug -a <app-id> -b <host-binary> -N
t-cli debug -a <app-id> -b <host-binary> -l -x "main,service_app_create" -N
```

---

## Typical end-to-end workflow

```bash
t-cli install                                             # 1. SDK
t-cli dotnet-setup                                        # 1b. (DotNET projects only)
t-cli create --type native --template ServiceApp --name MyApp   # 2. project
t-cli build -w ~/tizen-apps/MyApp -b Debug               # 3. build + package
t-cli device                                             # 4. device/emulator
t-cli app-install -p ~/tizen-apps/MyApp/Debug/*.tpk      # 5. install
t-cli debug -a <app-id> -b <host-binary> -N             # 6. debug (optional)
```

---

## Notes

- **Exit codes pass through.** `t-cli` returns the underlying script's exit code, so it
  works in `if`/`&&` chains and CI.
- **Windows paths.** When calling `t-cli.ps1` from Git Bash, convert the script path with
  `cygpath -w`. Paths you pass as *options* should be normal Windows paths.
- **`tz`, not `tizen`.** The underlying scripts use `tz` (the Tizen core CLI). The legacy
  `tizen` / `tizen.bat` / `tizen.sh` launchers are not used here.
- **Requirements.** `install` needs the base download tools. Each action surfaces its own
  prerequisite errors.
- **Relationship to skills/agents.** `t-cli` is a convenience layer. Inside Claude Code / Cline you
  can still just ask ("타이젠 빌드해줘") and the corresponding skill/subagent runs the same
  underlying script.
