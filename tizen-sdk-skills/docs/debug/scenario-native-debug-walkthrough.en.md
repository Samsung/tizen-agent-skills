# Scenario Guide: Native App Debugging (GDB) End to End

English | [한국어](scenario-native-debug-walkthrough.md)

This document walks you through the **full Tizen native app (.tpk, C/C++) remote-debugging flow** with the `tizen-sdk-skills` plugin: "SDK install → emulator → native app creation → Debug build → install → gdbserver setup → host GDB connection".

Each step runs automatically when you **tell Claude in natural language** — no commands to memorize.

> Native apps run on the device as a **native binary**, so debugging pairs the device's `gdbserver` with a host **GDB** over `sdb forward`. The responsible skill is `tizen-gdb-debug`.
>
> ⚠️ Web apps (.wgt) have no native binary, so GDB cannot attach → [scenario-webapp-debug-walkthrough.en.md](scenario-webapp-debug-walkthrough.en.md)
> ⚠️ .NET (C#) apps run on CoreCLR, so they use netcoredbg instead of GDB → [scenario-dotnet-debug-walkthrough.en.md](scenario-dotnet-debug-walkthrough.en.md)

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Cline plugin install" in [README.en.md](../README.en.md))
- **OS**: Windows / Ubuntu (Linux) / macOS are all supported. Claude detects the current OS and runs the matching script.
- **Host GDB**: nothing to install. The script checks the device architecture (`uname -m`) and auto-selects the **arch-matched GDB bundled with the SDK** (e.g. `tools/x86_64-linux-gnu-gdb-*/bin/x86_64-linux-gnu-gdb`), falling back to `gdb` on PATH.
- **Debug build required**: breakpoints will not bind against a Release binary with no debug symbols. Build with the **Debug** configuration in step 4.
- **Example goal**:
  - App type: **Native**
  - Template: **ServiceApp**
  - App name: **MyApp** (any name works)

> 💡 Copy the "Say this" examples in each step as-is.

---

## The Whole Flow at a Glance

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Create & launch an emulator | `tizen-create-emulator` → `tizen-launch-emulator` |
| 3 | Create a native app from a template | `tizen-create-project` |
| 4 | Build with the Debug configuration (`.tpk` packaging) | `tizen-build-project` |
| 5 | Install the app | `tizen-install-app` |
| 6 | GDB debug setup (gdbserver + port forward + init file) | `tizen-gdb-debug` |
| 7 | Run GDB in a host terminal | (you) |

---

## Step 1 — Install the Tizen SDK

Install the development environment first. Skip if already installed.

**Say this:**
```
Install the Tizen SDK
```

**Success check:** an "installation complete" message with the number of installed packages.

---

## Step 2 — Create & Launch an Emulator

If you have no physical device, create and boot an emulator. (Creating the VM and booting it are separate skills, but Claude chains them if you ask for both at once.)

**Say this:**
```
Create an emulator and launch it
```

**Success check:** the device shows up in `sdb devices` with state `device`.

> ⚠️ gdbserver needs to `ptrace` the app process, which requires **root**. The script attempts `sdb root on`, but production images may refuse it. Emulator/dev images are recommended.

---

## Step 3 — Create a Native App from a Template

Create a new app from the Native **ServiceApp** template with your chosen name.

**Say this:**
```
Create a native app named MyApp from the ServiceApp template
```

**Success check:** a project folder is created containing `tizen-manifest.xml`, sources, and build settings.
The `<manifest package="...">` value in `tizen-manifest.xml` is the **app ID** used later (e.g. `org.example.myapp`).

> 💡 The template list is discovered dynamically from the installed SDK. Ask `Show me the Tizen app templates` to see what is actually available.

---

## Step 4 — Build with the Debug Configuration

Build the project into a `.tpk` package using the **Debug** configuration — this is where the debug symbols come from.

**Say this:**
```
Build the app I just created with the Debug configuration
```

**Success check:** the **`.tpk` package** plus an executable with symbols are produced; the paths are printed.

Typical native build output locations:

| Item | Path |
|------|------|
| Package | `<project>/Debug/<appid>-1.0.0-<arch>.tpk` |
| **Host binary with symbols** | `<project>/Debug/tpk/bin/<exec>` |

> 💡 The **binary path** used in step 6 is exactly that `Debug/tpk/bin/<exec>`. You don't need it exact — the script auto-searches nearby directories for the same filename, preferring a `tpk/bin` path.

---

## Step 5 — Install the App

Install the built `.tpk` on the emulator (or device).

**Say this:**
```
Install the app I just built
```

**Success check:** an install-success message; the app appears in the emulator's app list.

---

## Step 6 — GDB Debug Setup

Start gdbserver on the device for the installed native app, and prepare the port forward and the GDB init file.

### Choosing a mode — attach vs launch

| Mode | Behavior | When to use | Example breakpoints |
|------|----------|-------------|---------------------|
| **attach** (default) | The app starts normally, then gdbserver **attaches** to its PID | catching callbacks invoked after startup | `service_app_control`, any user function |
| **launch** | gdbserver **runs the binary itself** and stops at the entry point | catching startup code | `main`, `service_app_create` |

> ⚠️ **`main` and `service_app_create` only bind in launch mode.** In attach mode that code has already run, so those breakpoints never hit. If you ask for them with attach mode, Claude will confirm before proceeding.

**Say this:**
```
Debug the native app I just installed in launch mode, with breakpoints at main and service_app_create
```

Claude confirms the app ID, binary path, mode, and breakpoints, then runs the setup. Internally this happens automatically:

1. Check the device with `sdb devices`
2. **wgt app guard** via `pkgcmd -l` — a web app is refused immediately and routed to `tizen-webapp-debug`
3. Validate the host binary (auto-search nearby if missing)
4. **Auto-select the SDK GDB** matching the device architecture, plus `sdb root on`
5. Locate `gdbserver` on the device (`which gdbserver`, default `/usr/bin/gdbserver`)
6. Resolve the debug target per mode
   - attach: run `app_launcher -s <app_id>` → get the PID with `pidof <exec>` → `gdbserver :5039 --attach <PID>`
   - launch: find the device binary under `/opt/usr/globalapps/<app_id>/bin` (or `/opt/usr/apps/...`) → `gdbserver :5039 <device-binary>`
7. `sdb forward tcp:5039 tcp:5039`
8. Write the GDB init file (`set sysroot remote:/`, `file <host-binary>`, `target remote localhost:5039`, `break ...`, plus `continue` in launch mode)
9. **Print the gdb command line and exit** — an agent cannot host an interactive GDB, so you run it yourself

**Success check:** a Standard JSON Envelope is returned with a `result` like:

```json
{
  "status": "success",
  "result": {
    "app_id": "org.example.myapp",
    "binary_path": "C:/ws/MyApp/Debug/tpk/bin/myapp",
    "mode": "launch",
    "port": 5039,
    "breakpoints": ["main", "service_app_create"],
    "app_pid": null,
    "gdbserver_status": "running",
    "port_forwarded": true,
    "gdb_init_file": "C:\\Users\\me\\AppData\\Local\\Temp\\tizen-gdb-3f2c....gdb",
    "gdb_command": {
      "powershell": "& \"C:\\tizen-sdk\\tools\\x86_64-linux-gnu-gdb-15.1\\bin\\x86_64-linux-gnu-gdb.exe\" -x \"C:\\Users\\me\\AppData\\Local\\Temp\\tizen-gdb-3f2c....gdb\"",
      "cmd": "\"C:\\tizen-sdk\\tools\\x86_64-linux-gnu-gdb-15.1\\bin\\x86_64-linux-gnu-gdb.exe\" -x \"C:\\Users\\me\\AppData\\Local\\Temp\\tizen-gdb-3f2c....gdb\""
    },
    "note": "Run ONE of the gdb_command lines in an interactive terminal..."
  }
}
```

| Field | Meaning |
|-------|---------|
| `mode` | `attach` \| `launch` |
| `app_pid` | the PID found in attach mode (`null` in launch mode) |
| `gdbserver_status` | `running` — gdbserver is waiting on the device |
| `port_forwarded` | `true` — `host tcp:5039 → device tcp:5039` is in place |
| `gdb_init_file` | the generated GDB script, passed via `-x` |
| `gdb_command` | `powershell` and `cmd` forms on Windows; a single `shell` form on Linux/macOS |

> 💡 The leading `&` in `gdb_command.powershell` is **PowerShell-only**. In cmd, use the `cmd` form.

---

## Step 7 — Run GDB in a Host Terminal

Paste the returned `gdb_command` into an **interactive terminal**. The init file already performs `file`/`target remote`/`break`, so there is nothing else to configure.

**Windows (PowerShell):**
```powershell
& "C:\tizen-sdk\tools\x86_64-linux-gnu-gdb-15.1\bin\x86_64-linux-gnu-gdb.exe" -x "C:\Users\me\AppData\Local\Temp\tizen-gdb-3f2c....gdb"
```

**Linux / macOS:**
```bash
"/home/me/tizen-sdk/tools/x86_64-linux-gnu-gdb-15.1/bin/x86_64-linux-gnu-gdb" -x "/tmp/tizen-gdb-3f2c....gdb"
```

**Success check:** output like the following, then a `(gdb)` prompt.

```
Remote debugging using localhost:5039
Breakpoint 1 at 0x...: file src/myapp.c, line 42.
...
Breakpoint 1, main (argc=1, argv=0x...) at src/myapp.c:42
```

Common GDB commands:

| Command | Description |
|---------|-------------|
| `bt` | print the call stack |
| `info locals` | locals in the current frame |
| `p <var>` | print a variable |
| `next` / `step` | step over / step into |
| `break <file>:<line>` | add a breakpoint |
| `continue` | resume execution |
| `quit` | end the session |

> 💡 Quitting GDB ends gdbserver's debug session too. To debug again, **re-run step 6**. (A `connection refused` on `target remote` means you hit this case.)

---

## E2E Verification Checklist

Verify these items during a manual E2E test.

### Happy path

| # | Check | Expected |
|---|-------|----------|
| 1 | Step 6 envelope | `status: "success"`, `gdb_command`/`gdb_init_file`/`gdbserver_status: "running"` present, exit code `0` |
| 2 | `sdb shell "ps -ef \| grep gdbserver"` | the gdbserver process is alive |
| 3 | `sdb forward --list` | a `tcp:5039 → tcp:5039` entry exists |
| 4 | attach-mode envelope | `app_pid` is a number, `mode: "attach"` |
| 5 | launch-mode envelope | `app_pid: null`, `breakpoints` includes `main` (defaulted when omitted) |
| 6 | Step 7 GDB run | `Remote debugging using localhost:5039`, then a `(gdb)` prompt |
| 7 | launch-mode breakpoint | stops at `main`/`service_app_create` |
| 8 | `bt` / `info locals` | symbolized stack and variables (confirms the Debug build) |
| 9 | GDB init file | still present after step 6, reusable |

### Failure paths (error mapping)

| # | Scenario | Expected |
|---|----------|----------|
| 10 | No device/emulator | `error_category: "device_not_found"` — routed to `tizen-create-emulator` → `tizen-launch-emulator` |
| 11 | Web app (.wgt) app ID | `error_category: "io_error"` — detail contains `is a Web app (wgt)`, routed to `tizen-webapp-debug` |
| 12 | attach mode can't find the PID (not installed / failed to launch) | `error_category: "io_error"` — "Could not find the app PID within 30s", with launch-mode guidance |
| 13 | Host binary missing (auto-search also fails) | `error_category: "io_error"` — detail contains `Host binary not found`, hints `<project>\Debug\tpk\bin\<exec>` |
| 14 | launch mode but the binary isn't on the device (not installed) | `error_category: "io_error"` — `Cannot find app binary on device at /opt/usr/apps/<app_id>/bin/` |
| 15 | No gdbserver on the device | `error_category: "io_error"` — `gdbserver not found at /usr/bin/gdbserver` |
| 16 | No GDB on the host (neither SDK nor PATH) | `error_category: "io_error"` — `No GDB found`, suggests `-Gdb <path>` |
| 17 | Invalid app ID / port / breakpoint format | `error_category: "invalid_parameters"` |
| 18 | attach mode + a `main` breakpoint | setup succeeds but the breakpoint never hits → retry in launch mode |
| 19 | Debugging a Release build | setup succeeds but `info locals`/line numbers don't resolve → rebuild Debug and reinstall |

### Running the CLI directly (verification without an agent)

**Linux / macOS / Ubuntu (Bash):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/gdb-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
node "$CLI" org.example.myapp "/home/me/ws/MyApp/Debug/tpk/bin/myapp" launch "main,service_app_create" 5039
```

**Windows (cmd.exe / PowerShell):**
```
dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js"
node "<found-path>" org.example.myapp "C:/ws/MyApp/Debug/tpk/bin/myapp" launch "main,service_app_create" 5039
```

Argument order: `<appId> <binaryPath> [attach|launch] [breakpoints|-] [port]`
Exit code: `0` = success envelope, `1` = failure/error envelope.

---

## All at Once (copy-paste prompts)

Enter these in order:

```
1) Install the Tizen SDK
2) Create an emulator and launch it
3) Create a native app named MyApp from the ServiceApp template
4) Build the app I just created with the Debug configuration
5) Install the app I just built
6) Debug the native app I just installed in launch mode, with breakpoints at main and service_app_create
```

Finally, paste the returned `gdb_command` into a terminal and debugging starts at the `(gdb)` prompt.

## Related Documents

- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (tizen-gdb-debug)
- Basic native app scenario (without debugging): [scenario-native-app-walkthrough.en.md](../project/scenario-native-app-walkthrough.en.md)

- .NET app debugging scenario: [scenario-dotnet-debug-walkthrough.en.md](scenario-dotnet-debug-walkthrough.en.md)
- Web app debugging scenario: [scenario-webapp-debug-walkthrough.en.md](scenario-webapp-debug-walkthrough.en.md)
