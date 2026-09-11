# Scenario Guide: .NET App Debugging (netcoredbg) End to End

English | [한국어](scenario-dotnet-debug-walkthrough.md)

This document walks you through the **full Tizen .NET app (C#/NUI) remote-debugging flow** with the `tizen-sdk-skills` plugin: "SDK install → .NET environment setup → emulator → .NET app creation → Debug build → install → netcoredbg setup → VS Code connection".

Each step runs automatically when you **tell Claude in natural language** — no commands to memorize.

> .NET apps run on the device's **CoreCLR**, so GDB cannot debug them. Instead, **netcoredbg** runs on the device — either as a DAP (Debug Adapter Protocol) server you connect to, or as a CLI you attach with. The responsible skill is `tizen-dotnet-debug`.
>
> ⚠️ Web apps (.wgt) have no CoreCLR process → [scenario-webapp-debug-walkthrough.en.md](scenario-webapp-debug-walkthrough.en.md)
> ⚠️ Native (C/C++) apps use GDB → [scenario-native-debug-walkthrough.en.md](scenario-native-debug-walkthrough.en.md)

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Cline plugin install" in [README.en.md](../README.en.md))
- **OS**: Windows / Ubuntu (Linux) / macOS are all supported. Claude detects the current OS and runs the matching script.
- **.NET SDK + Tizen workload**: verified and installed by `tizen-dotnet-setup` in step 2.
- **netcoredbg installs itself**: nothing to prepare. The SDK's on-demand package (`<sdk>/platforms/tizen-*/common/on-demand/netcoredbg-<ver>-<arch>.tar.gz`) is deployed once to `/home/owner/share/tmp/sdk_tools/netcoredbg` on the device.
- **⚠️ Debug build required (the most common failure)**: netcoredbg reads the **portable PDBs** sitting next to the dlls in the app directory. A Release build ships no `.pdb`, so **breakpoints will never bind** — the skill stops with `build_failed`.
- **launch mode needs VS Code**: VS Code acts as the DAP client. (attach mode works from a terminal CLI alone, but it is heavily constrained — see step 7.)
- **Example goal**:
  - App type: **DotNET**
  - Template: **a NUI app template** (discovered from the installed SDK)
  - App name: **MyDotnetApp** (any name works)

> 💡 Copy the "Say this" examples in each step as-is.

---

## The Whole Flow at a Glance

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Verify/install .NET SDK + Tizen workload | `tizen-dotnet-setup` |
| 3 | Create & launch an emulator | `tizen-create-emulator` → `tizen-launch-emulator` |
| 4 | Create a .NET app from a template | `tizen-create-project` |
| 5 | Build **with the Debug configuration** (`.tpk` packaging) | `tizen-build-project` |
| 6 | Install the app | `tizen-install-app` |
| 7 | .NET debug setup (netcoredbg DAP server + port forward) | `tizen-dotnet-debug` |
| 8 | Connect from VS Code with F5 | (you) |

---

## Step 1 — Install the Tizen SDK

Install the development environment first. Skip if already installed.

**Say this:**
```
Install the Tizen SDK
```

**Success check:** an "installation complete" message with the number of installed packages.

---

## Step 2 — Set Up the .NET Environment

Verify the .NET SDK is present and install the Tizen workload.

**Say this:**
```
Set up the Tizen .NET development environment
```

**Success check:** the `dotnet --version` result and a Tizen workload install-complete message.

---

## Step 3 — Create & Launch an Emulator

If you have no physical device, create and boot an emulator. (Creating the VM and booting it are separate skills, but Claude chains them if you ask for both at once.)

**Say this:**
```
Create an emulator and launch it
```

**Success check:** the device shows up in `sdb devices` with state `device`.

> ⚠️ launch mode relies on the platform's **SDK debug-launch contract (`__AUL_SDK__`)**. Emulator/dev images support it; some production images refuse it.

---

## Step 4 — Create a .NET App from a Template

Create a new app from a DotNET template with your chosen name.

**Say this:**
```
Create a .NET app named MyDotnetApp from the NUI template
```

**Success check:** a project folder is created containing `.csproj`, `tizen-manifest.xml`, and `*.cs` sources.
The `<manifest package="...">` value in `tizen-manifest.xml` is the **app ID** used later (e.g. `org.tizen.example.MyDotnetApp`).

> 💡 Available template names are discovered dynamically from the installed SDK. Ask `Show me the Tizen app templates` to see the real list.

---

## Step 5 — Build with the Debug Configuration (required)

Build with the **Debug** configuration. This is what produces the `.pdb` (portable PDB) files — without them, debugging is impossible.

**Say this:**
```
Build the app I just created with the Debug configuration
```

**Success check:** the **`.tpk` package** is produced, and `bin/Debug/net8.0-tizen*/` contains both `<AppName>.dll` and **`<AppName>.pdb`**.

> ⚠️ If you built Release, step 7 stops with `build_failed`. You then have to rebuild Debug → reinstall → retry.

---

## Step 6 — Install the App

Install the built `.tpk` on the emulator (or device).

**Say this:**
```
Install the app I just built
```

**Success check:** an install-success message; the app appears in the emulator's app list.

---

## Step 7 — .NET Debug Setup (netcoredbg)

Relaunch the installed .NET app under netcoredbg and forward the DAP port to the host.

### Choosing a mode — launch (recommended) vs attach

| Mode | Behavior | Trade-offs |
|------|----------|------------|
| **launch** (recommended) | Uses the AUL debugger contract to **start the app under a netcoredbg DAP server**, suspended before `Main()` until a DAP client connects | Catches startup code and `Main()`. Requires VS Code |
| **attach** | Starts the app normally, finds its PID, and **attaches the netcoredbg CLI** | Misses `Main()`. **Heavily constrained on Tizen** — a normally-launched app creates no CoreCLR debug transport (`/tmp/clr-debug-pipe-<PID>-*`), so attach often fails with `0x80131c08` |

> 💡 **launch is the default mode** (omit `--mode` / the second positional argument and you get launch). attach is used only when you explicitly ask for it. The skill confirms the breakpoints with you before proceeding.
>
> ⚠️ **In launch mode the app shows no window until VS Code connects.** It is started under netcoredbg and suspended right before `Main()`; an empty screen after a success envelope is expected behavior, not a failed launch (issue #97). The runner resolves the package id to the real launchable app id via `app_launcher -l`; a package that is not installed fails immediately with `invalid_parameters`, and `details` lists the apps the device does have.

**Say this:**
```
Debug the .NET app I just installed in launch mode, with a breakpoint at Program.cs:25
```

Internally this happens automatically:

1. Check the device with `sdb devices` (first device when no `--serial` is given)
2. **wgt app guard** via `pkgcmd -l` — a web app is refused immediately and routed to `tizen-webapp-debug`
3. `sdb root on` (best-effort)
4. **Check/deploy netcoredbg** — if absent, push and extract the newest on-demand tar matching the device architecture (`uname -m` → `x86_64`/`i686`/`aarch64`/`armv7l`/`riscv64`)
5. **Debug-build preflight** — look for `*.pdb` under `/opt/usr/globalapps/<app_id>/bin` (or `/opt/usr/apps/...`) and stop if none exist
6. Clear stale debugger processes (`pkill -f netcoredbg`)
7. Run the mode-specific flow
   - launch: stop any existing instance → `launch_app <app_id> __AUL_SDK__ NETCOREDBG __DLP_DEBUG_ARG__ --interpreter=vscode,--engineLogging,--server=4711,--` → verify the netcoredbg process → `sdb forward tcp:4711 tcp:4711`
   - attach: `app_launcher -s <app_id>` → resolve the PID → verify the CoreCLR debug transport → print the netcoredbg CLI command (no port forward needed — the CLI runs over `sdb shell`)
8. **Print the connection details and exit** — an agent cannot host an interactive debugger

**Success check (launch mode):** a Standard JSON Envelope is returned with a `result` like:

```json
{
  "status": "success",
  "result": {
    "app_id": "org.tizen.example.MyDotnetApp",
    "mode": "launch",
    "port": 4711,
    "breakpoints": ["Program.cs:25"],
    "app_pid": null,
    "netcoredbg_status": "installed",
    "port_forwarded": true,
    "debug_command": null,
    "launch_config": {
      "type": "coreclr",
      "request": "launch",
      "debug_server_port": 4711,
      "workspace_placeholder": "<APP_FOLDER_NAME>",
      "note": "Create .vscode/launch.json in the workspace root with the netcoredbg DAP config..."
    },
    "note": "netcoredbg DAP server is listening on device port 4711; host tcp:4711 is forwarded. Create .vscode/launch.json, open the project in VS Code, set a breakpoint, and press F5."
  }
}
```

| Field | Meaning |
|-------|---------|
| `mode` | `launch` \| `attach` |
| `port` | DAP server port (launch mode only, default `4711`; `null` in attach mode) |
| `netcoredbg_status` | `installed` — the debugger is deployed on the device |
| `port_forwarded` | `true` in launch mode (`false` in attach mode — no forward needed) |
| `launch_config` | the values needed to write VS Code's `launch.json` (launch mode) |
| `debug_command` | the netcoredbg CLI command (attach mode; `powershell`/`cmd` or `shell`) |

> 💡 The app stays **suspended before `Main()` until a DAP client connects**. The app, the DAP server, and the port forward all persist after setup, so you can disconnect and reconnect.

---

## Step 8 — Connect from VS Code (launch mode)

### STEP 1 — Create `.vscode/launch.json`

Create `.vscode/launch.json` in the workspace root and paste the following, replacing `<APP_FOLDER_NAME>` with your actual app folder name.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Tizen .NET (netcoredbg)",
      "type": "coreclr",
      "request": "launch",
      "program": "${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0/<APP_FOLDER_NAME>.dll",
      "cwd": "${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0",
      "debugServer": 4711,
      "stopAtEntry": false
    }
  ]
}
```

> 💡 Match `net8.0-tizen10.0` to your project's actual TargetFramework (the `<TargetFramework>` value in `.csproj`). `debugServer` must equal the `port` from the step 7 envelope.
> 💡 With `debugServer` set, VS Code does not start the app — it only **connects to the DAP server already running**.

### STEP 2 — Open the project folder in VS Code

Use `File → Open Folder` and select the project's workspace root.

### STEP 3 — Set a breakpoint and press F5

1. Click the margin left of a line number in the editor to place a red breakpoint dot.
2. Press **F5** to start debugging.
3. VS Code connects to `localhost:4711`, the suspended app resumes, and execution stops at your breakpoint.

**Success check:** the VS Code debug toolbar appears, execution halts at the breakpoint, and the **Variables / Watch / Call Stack** panels show values. The app's UI renders for the first time at this point.

### (Alternative) attach mode — terminal CLI

If attach mode succeeded, paste the envelope's `debug_command` into an interactive terminal.

**Windows (PowerShell):**
```powershell
& "C:\tizen-sdk\tools\sdb.exe" -s emulator-26101 shell "/home/owner/share/tmp/sdk_tools/netcoredbg/netcoredbg --interpreter=cli --attach 1234"
```

Commands at the `ncdb>` prompt:

| Command | Description |
|---------|-------------|
| `b Program.cs:25` | set a breakpoint |
| `bt` | print the call stack |
| `continue` | resume execution |
| `quit` | end the session |

> ⚠️ attach mode misses `Main()`, and a normally-launched Tizen .NET app has no CoreCLR debug transport, so it may fail outright. Switch to launch mode if it does.

---

## E2E Verification Checklist

Verify these items during a manual E2E test.

### Happy path

| # | Check | Expected |
|---|-------|----------|
| 1 | Step 7 envelope (launch) | `status: "success"`, `mode: "launch"`, `port: 4711`, `port_forwarded: true`, `launch_config` present, exit code `0` |
| 2 | `sdb shell "test -x /home/owner/share/tmp/sdk_tools/netcoredbg/netcoredbg && echo ok"` | `ok` — the debugger is deployed |
| 3 | `sdb shell "pgrep -f netcoredbg"` | prints the DAP server process PID |
| 4 | `sdb forward --list` | a `tcp:4711 → tcp:4711` entry exists |
| 5 | `sdb shell "find /opt/usr/globalapps/<app_id>/bin -name '*.pdb'"` | `.pdb` files exist (confirms the Debug build) |
| 6 | The app screen right after setup | **nothing renders** — correct, it is suspended before `Main()` |
| 7 | Step 8 F5 | VS Code connects and stops at the breakpoint |
| 8 | Variables / Call Stack | locals and a symbolized C# call stack |
| 9 | Disconnect and reconnect | the app, DAP server, and forward persist — F5 reattaches |

### Failure paths (error mapping)

| # | Scenario | Expected |
|---|----------|----------|
| 10 | No device/emulator | `error_category: "device_not_found"` — routed to `tizen-create-emulator` → `tizen-launch-emulator` |
| 11 | **Release build (no `.pdb`)** | `error_category: "build_failed"` — "No .pdb files found", guidance to rebuild Debug (`tizen-build-project -b Debug`) → reinstall → retry |
| 12 | Web app (.wgt) app ID | `error_category: "io_error"` — detail contains `is a Web app (wgt)`, routed to `tizen-webapp-debug` |
| 13 | attach mode with no CoreCLR debug transport | `error_category: "io_error"` — "Attach mode not supported for this app (no CoreCLR debug transport)", with launch-mode guidance |
| 14 | attach mode can't find the PID | `error_category: "io_error"` — "Could not find the app PID within 30s", with launch-mode guidance |
| 15 | netcoredbg on-demand package missing from the SDK | `error_category: "io_error"` — "netcoredbg package not found in the SDK", routed to `tizen-sdk-install` |
| 16 | Image without `__AUL_SDK__` support (launch fails) | `error_category: "io_error"` — detail contains `netcoredbg DAP server did not start` |
| 17 | Unsupported device architecture | `error_category: "io_error"` — detail contains `Unsupported device architecture` |
| 18 | Invalid app ID / port / breakpoint format (not `File.cs:line`) | `error_category: "invalid_parameters"` |
| 19 | `debugServer` port in `launch.json` doesn't match | VS Code fails to connect → align it with the envelope's `port` |

### Running the CLI directly (verification without an agent)

**Linux / macOS / Ubuntu (Bash):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
node "$CLI" org.tizen.example.MyDotnetApp launch "Program.cs:25" 4711
```

**Windows (cmd.exe / PowerShell):**
```
dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js"
node "<found-path>" org.tizen.example.MyDotnetApp launch "Program.cs:25" 4711
```

Argument order: `<appId> [attach|launch] [breakpoints|-] [port] [serial]`
Exit code: `0` = success envelope, `1` = failure/error envelope.

---

## All at Once (copy-paste prompts)

Enter these in order:

```
1) Install the Tizen SDK
2) Set up the Tizen .NET development environment
3) Create an emulator and launch it
4) Create a .NET app named MyDotnetApp from the NUI template
5) Build the app I just created with the Debug configuration
6) Install the app I just built
7) Debug the .NET app I just installed in launch mode, with a breakpoint at Program.cs:25
```

Finally, create `.vscode/launch.json`, set a breakpoint in VS Code, and press **F5** — done.

## Related Documents

- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (tizen-dotnet-debug)
- Native app debugging scenario: [scenario-native-debug-walkthrough.en.md](scenario-native-debug-walkthrough.en.md)
- Web app debugging scenario: [scenario-webapp-debug-walkthrough.en.md](scenario-webapp-debug-walkthrough.en.md)
