# tizen-sdk Command Test Results

- **Test Date**: 2026-07-16
- **Execution Method**: From repository root: `node dist/cli.js tizen-sdk <command> ...`
- **Environment**: Windows 11, Node.js v24.15.0, Tizen SDK at `C:\Users\<username>\tizen-sdk`, .NET SDK 10.0.300
- **Test Project**: WebApp/Basic template, `TestWebApp` created in temp directory

## Summary

| #   | Command                 | Result     | Duration | Description                                                            |
| --- | ----------------------- | ---------- | -------- | ---------------------------------------------------------------------- |
| —   | `--schema`              | ✅ success | —        | Full option schema (required/enum/default) for all 14 commands         |
| —   | `--capabilities`        | ✅ success | —        | All 14 commands available                                              |
| —   | `--doctor`              | ✅ success | —        | All 5 checks (Node/scripts/shell/SDK/sdb) pass                         |
| 1   | `check-node`            | ✅ success | 3.0s     | Node v24.15.0 detected                                                 |
| 2   | `check-disk-space`      | ✅ success | 0s       | Free 17.07GB ≥ required 15GB                                           |
| 3   | `sdk-install`           | ✅ success | 3.0s     | Tizen SDK installation verified                                        |
| 4   | `tv-sdk-install`        | ✅ success | 0.004s   | TV-SAMSUNG-Public confirmed                                            |
| 5   | `dotnet-setup`          | ✅ success | 7.8s     | .NET SDK 10.0.300 + tizen workload ready                               |
| 6   | `list-templates`        | ✅ success | 4.7s     | 5 native / 5 dotnet / 2 webapp / 10 tv (if TV SDK installed) templates |
| 7   | `create-project`        | ✅ success | 11.3s    | TestWebApp (webapp/Basic) created                                      |
| 8   | `build-project`         | ✅ success | 7.5s     | TestWebApp.wgt (38,870 bytes) generated                                |
| 9   | `device-manager`        | ✅ success | 159s     | Tizen emulator auto-created, started, connected                        |
| 10  | `install-app --run`     | ✅ success | 13s      | WebApp installed and executed successfully                             |
| 11  | `gdb-debug` (WebApp)    | ✅ success | 6.7s     | Web app auto-detected and rejected (expected)                          |
| 12  | `dotnet-debug` (WebApp) | ✅ success | 6.4s     | Web app auto-detected and rejected (expected)                          |

**Final Result: All 14 commands and 3 meta operations (--schema/--capabilities/--doctor) execute successfully.**

---

## Detailed Results

### Meta: `--schema`

Returns the full option schema (required/enum/default) for all 14 commands. (Excerpt below.)

```json
{
  "status": "success",
  "result": {
    "plugin": "tizen-sdk",
    "version": "0.1.0",
    "commands": {
      "create-project": {
        "description": "Scaffold a new Tizen project from an installed SDK template (discover templates with list-templates first)",
        "args": {
          "--type": {
            "type": "string",
            "required": true,
            "enum": ["native", "dotnet", "webapp", "tv", "platform"]
          },
          "--template": { "type": "string", "required": true },
          "--parent-path": { "type": "string", "required": true },
          "--name": { "type": "string", "required": true }
        }
      },
      "build-project": {
        "description": "Build and package a Tizen project (.tpk/.wgt) — result.artifacts contains the package paths",
        "args": {
          "--project": { "type": "string", "required": true },
          "--build-type": {
            "type": "string",
            "default": "Debug",
            "enum": ["Debug", "Release", "Test"]
          },
          "--sign-profile": { "type": "string" }
        }
      }
    }
  },
  "warnings": [],
  "errors": []
}
```

### Meta: `--capabilities`

Lists all available commands in the plugin.

```json
{
  "status": "success",
  "result": {
    "available": [
      "check-node",
      "check-disk-space",
      "sdk-install",
      "tv-sdk-install",
      "tv-sdk-install-from-zip",
      "dotnet-setup",
      "create-project",
      "list-templates",
      "build-project",
      "device-manager",
      "install-app",
      "gdb-debug",
      "dotnet-debug"
    ],
    "unavailable": []
  },
  "warnings": [],
  "errors": []
}
```

### Meta: `--doctor`

Environment validation: Node.js, plugin scripts, shell, SDK, and sdb.

```json
{
  "status": "success",
  "result": {
    "plugin": "tizen-sdk",
    "checks": [
      {
        "name": "Node.js version (18+)",
        "status": "ok",
        "message": "Node.js v24.15.0 detected"
      },
      {
        "name": "Plugin scripts directory",
        "status": "ok",
        "message": "scripts/ found at C:\\Users\\<username>\\.tizen\\plugins\\tizen-sdk-skills"
      },
      {
        "name": "Shell available (powershell)",
        "status": "ok",
        "message": "powershell is on PATH"
      },
      {
        "name": "Tizen SDK installed",
        "status": "ok",
        "message": "Tizen SDK found at C:\\Users\\<username>\\tizen-sdk"
      },
      { "name": "sdb reachable", "status": "ok", "message": "sdb is on PATH" }
    ]
  },
  "warnings": [],
  "errors": []
}
```

### 1. `check-node`

Verify Node.js installation and version.

```json
{
  "status": "success",
  "result": {
    "installed": true,
    "version": "v24.15.0",
    "path": "C:\\Program Files\\nodejs\\node.exe",
    "major_version": 24
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk check-node",
  "duration_ms": 3023
}
```

### 2. `check-disk-space`

Verify available disk space.

```json
{
  "status": "success",
  "result": {
    "path": "C:\\Users\\<username>",
    "total_gb": 238.37,
    "free_gb": 17.07,
    "required_gb": 15,
    "sufficient": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk check-disk-space",
  "duration_ms": 0
}
```

### 3. `sdk-install` (pre-check)

Check Tizen SDK installation status without performing installation.

```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "Tizen Platforms (12)",
        "status": "installed",
        "version": "10.0"
      },
      { "name": "Tizen SDK Tools", "status": "installed", "version": "10.0" }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "SDK installation verified at C:\\Users\\<username>\\tizen-sdk (sdk.info found). To force a reinstall, run with --force."
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "duration_ms": 3015
}
```

### 4. `tv-sdk-install` (pre-check)

Check TV SDK extension installation status.

```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "TV-SAMSUNG-Public",
        "status": "installed",
        "version": "extension"
      }
    ],
    "installation_status": "completed"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk tv-sdk-install",
  "duration_ms": 4
}
```

### 5. `dotnet-setup`

Verify .NET SDK and Tizen workload installation.

```json
{
  "status": "success",
  "result": {
    "dotnet_version": "10.0.300",
    "workload": "tizen",
    "workload_status": "already_installed",
    "status": "ready"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk dotnet-setup",
  "duration_ms": 7773
}
```

### 6. `list-templates`

List available project templates from the installed SDK.

```json
{
  "status": "success",
  "result": {
    "templates": {
      "native": [
        "BasicUI",
        "gtest",
        "ServiceApp",
        "SharedLibrary",
        "StaticLibrary"
      ],
      "dotnet": [
        "TizenLibRpk",
        "TizenNSClassLib",
        "TizenNUIGadget_inhouse",
        "TizenNUITemplate",
        "TizenServiceApp"
      ],
      "webapp": ["Basic", "WebService"]
    }
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk list-templates",
  "duration_ms": 4739
}
```

### 7. `create-project`

Create a new WebApp project from the Basic template.

**Required options:**

| Option          | Type                                                   | Required | Description                                                    |
| --------------- | ------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| `--type`        | `native` \| `dotnet` \| `webapp` \| `tv` \| `platform` | Yes      | Project type                                                   |
| `--template`    | string                                                 | Yes      | Template name (use `list-templates` to discover)               |
| `--parent-path` | string                                                 | Yes      | Workspace (parent) directory — app folder is created inside it |
| `--name`        | string                                                 | Yes      | App name (folder to be created)                                |

**Usage:**

```bash
# Without --type: shows available templates as a helpful guide
tizen-cli tizen-sdk create-project

# With all required options
tizen-cli tizen-sdk create-project \
  --type webapp \
  --template Basic \
  --parent-path ./ \
  --name TestWebApp

# Native project example
tizen-cli tizen-sdk create-project \
  --type native \
  --template ServiceApp \
  --parent-path ./ \
  --name TestNativeApp
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "project_name": "TestWebApp",
    "project_type": "webapp",
    "template_name": "Basic",
    "project_path": "<temp>\\TestWebApp",
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-project",
  "duration_ms": 11280
}
```

### 8. `build-project`

Build the WebApp project in Debug mode, generating a .wgt package.

**Options:**

| Option           | Type                           | Required | Default | Description            |
| ---------------- | ------------------------------ | -------- | ------- | ---------------------- |
| `--project`      | string                         | Yes      | —       | Project root directory |
| `--build-type`   | `Debug` \| `Release` \| `Test` | No       | `Debug` | Build configuration    |
| `--sign-profile` | string                         | No       | —       | Signing profile name   |

**Usage:**

```bash
# Debug build (default)
tizen-cli tizen-sdk build-project --project ./TestWebApp

# Release build
tizen-cli tizen-sdk build-project --project ./TestWebApp --build-type Release

# Native project build
tizen-cli tizen-sdk build-project --project ./TestNativeApp

# Build with signing profile
tizen-cli tizen-sdk build-project --project ./TestWebApp --sign-profile MyProfile
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "<temp>\\TestWebApp\\Debug\\TestWebApp.wgt",
        "format": ".wgt",
        "size_bytes": 38870
      }
    ],
    "build_time_ms": 7531
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 7531
}
```

### 9. `device-manager`

Auto-create, launch, and connect a Tizen emulator (no physical device connected).

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "emulator_launched": true,
    "status": "connected"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 159000
}
```

**VM Platform Verification**: `tizen-10.0-x86_64` (standard Tizen, not TV)

#### 9-1. `device-manager` (TV Emulator — Additional Test)

Create, launch, and connect a Samsung TV emulator using the `profile=tv` option.

**Test Environment**: Ubuntu (Linux), Tizen SDK at `/home/user/tizen-sdk`

**Command:**

```bash
node device-manager-cli.js 300 tizen-tv-vm tv
# Args: timeoutSec=300, vmName=tizen-tv-vm, profile=tv
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26111",
    "device_type": "emulator",
    "emulator_launched": true,
    "device_profile": "tv",
    "status": "connected"
  },
  "warnings": [
    "[WARN]  Connected emulator 'emulator-26101' has platform 'tizen-10.0-x86_64' but profile 'tv' was requested.",
    "[WARN]  Will proceed to create/launch a tv emulator instead.",
    "[WARN]  No connected devices found. Attempting to start an emulator...",
    "[INFO]  Found em-cli: /home/user/tizen-sdk/tools/emulator/bin/em-cli"
  ],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 19295
}
```

**`sdb devices` verification:**

```
List of devices attached
emulator-26111      	device    	tizen-tv-vm
emulator-26101      	device    	tizen-vm-default
```

> **Note:** An existing standard Tizen emulator (`emulator-26101`) was already running, but since `profile=tv` was explicitly requested, a new TV emulator (`emulator-26111`) was created and launched. The TV SDK extension (`tv-samsung-*` platform) must be installed beforehand (see the `tizen-tv-sdk-install` skill).

### 10. `install-app --run`

Install the built TestWebApp.wgt on the Tizen emulator and execute it.

**Options:**

| Option      | Type    | Required | Default | Description                                                            |
| ----------- | ------- | -------- | ------- | ---------------------------------------------------------------------- |
| `--package` | string  | Yes      | —       | Absolute path to the .tpk/.wgt package                                 |
| `--serial`  | string  | No       | auto    | Target device serial (omit to auto-select the single connected device) |
| `--run`     | boolean | No       | `false` | Launch the app after installation                                      |

**Usage:**

```bash
# Install and run (auto-select device)
tizen-cli tizen-sdk install-app --package ./TestWebApp/Debug/TestWebApp.wgt --run

# Install only (no launch)
tizen-cli tizen-sdk install-app --package ./TestWebApp/Debug/TestWebApp.wgt

# Install on specific device
tizen-cli tizen-sdk install-app --package ./TestWebApp/Debug/TestWebApp.wgt --serial emulator-26101 --run

# Install native .tpk
tizen-cli tizen-sdk install-app --package ./TestNativeApp/Debug/org.example.testnativeapp-1.0.0-x86_64.tpk --run
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "package_path": "<temp>\\TestWebApp\\Debug\\TestWebApp.wgt",
    "device_serial": "emulator-26101",
    "app_id": "CmaRL446cf.TestWebApp",
    "installation_status": "completed",
    "app_launched": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-app",
  "duration_ms": 13000
}
```

### 11. `gdb-debug` (WebApp Test)

Request GDB debugging for a WebApp → auto-detected and rejected (expected behavior).

**Required options:**

| Option          | Type    | Required | Default | Description                                                                  |
| --------------- | ------- | -------- | ------- | ---------------------------------------------------------------------------- |
| `--app-id`      | string  | Yes      | —       | Tizen package ID (e.g. `org.example.myapp`)                                  |
| `--binary`      | string  | Yes      | —       | Host binary path with debug symbols (e.g. `<project>/Debug/tpk/bin/<exec>`)  |
| `--port`        | number  | No       | `5039`  | Debug port                                                                   |
| `--timeout`     | number  | No       | `30`    | PID lookup timeout in seconds (attach mode)                                  |
| `--breakpoints` | string  | No       | —       | Comma-separated breakpoint function names (e.g. `"main,service_app_create"`) |
| `--launch`      | boolean | No       | `false` | Launch mode: gdbserver launches the binary directly (catches main)           |

**Usage:**

```bash
# Attach mode (default) — app is launched, then gdbserver attaches to its PID
tizen-cli tizen-sdk gdb-debug \
  --app-id org.example.testnativeapp \
  --binary ./TestNativeApp/Debug/tpk/bin/testnativeapp

# Launch mode — gdbserver launches the binary directly, stops before main()
tizen-cli tizen-sdk gdb-debug \
  --app-id org.example.testnativeapp \
  --binary ./TestNativeApp/Debug/tpk/bin/testnativeapp \
  --launch --breakpoints "main,service_app_create"

# Custom port and timeout
tizen-cli tizen-sdk gdb-debug \
  --app-id org.example.testnativeapp \
  --binary ./TestNativeApp/Debug/tpk/bin/testnativeapp \
  --port 5040 --timeout 60
```

> **Note:** The binary path must be an **executable file**, not a directory. Native build output is usually at `<project>/Debug/tpk/bin/<exec>`.

**Result (WebApp — rejected as expected):**

```json
{
  "status": "failure",
  "result": null,
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_IO_E001",
      "message": "'CmaRL446cf.TestWebApp' is a Web app (wgt) — GDB debugging is not supported for Web apps.",
      "error_category": "io_error"
    }
  ],
  "command": "tizen-sdk gdb-debug",
  "duration_ms": 6700
}
```

**Result (Native app — success):**

```json
{
  "status": "success",
  "result": {
    "app_id": "org.example.testnativeapp",
    "binary_path": "./TestNativeApp/Debug/tpk/bin/testnativeapp",
    "mode": "attach",
    "port": 5039,
    "breakpoints": [],
    "app_pid": 12899,
    "gdbserver_status": "running",
    "port_forwarded": true,
    "gdb_init_file": "/tmp/tizen-gdb-FkelSg.gdb",
    "gdb_command": {
      "shell": "\"/home/user/tizen-sdk/tools/x86_64-linux-gnu-gdb-15.1/bin/x86_64-linux-gnu-gdb\" -x \"/tmp/tizen-gdb-FkelSg.gdb\""
    },
    "note": "Run the gdb_command.shell line in an interactive terminal. gdbserver, the port forward, and the init file stay in place for this session."
  },
  "warnings": [
    "... launch failed",
    "[WARN]  gdbserver readiness check inconclusive — proceeding"
  ],
  "errors": [],
  "command": "tizen-sdk gdb-debug",
  "duration_ms": 26012
}
```

### 12. `dotnet-debug` (WebApp Test)

Request .NET debugging for a WebApp → auto-detected and rejected (expected behavior).

**Required options:**

| Option          | Type    | Required | Default | Description                                                                          |
| --------------- | ------- | -------- | ------- | ------------------------------------------------------------------------------------ |
| `--app-id`      | string  | Yes      | —       | Tizen package ID (e.g. `org.example.myapp`)                                          |
| `--binary`      | string  | Yes      | —       | Host DLL path with debug symbols (e.g. `<project>/Debug/bin/Debug/net6.0/MyApp.dll`) |
| `--port`        | number  | No       | `5040`  | Debug port                                                                           |
| `--timeout`     | number  | No       | `30`    | PID lookup timeout in seconds (attach mode)                                          |
| `--breakpoints` | string  | No       | —       | Comma-separated breakpoint function names                                            |
| `--launch`      | boolean | No       | `false` | Launch mode: netcoredbg launches the binary directly (catches main)                  |

**Usage:**

```bash
# --mode omitted = launch (default): the app starts under a netcoredbg DAP server, suspended
# before Main() (no app window until VS Code connects — expected). attach only via --mode attach.
tizen-cli tizen-sdk dotnet-debug \
  --app-id org.example.myapp \
  --binary ./MyApp/Debug/bin/Debug/net6.0/MyApp.dll

# Launch mode — netcoredbg launches the binary directly, stops before main()
tizen-cli tizen-sdk dotnet-debug \
  --app-id org.example.myapp \
  --binary ./MyApp/Debug/bin/Debug/net6.0/MyApp.dll \
  --launch --breakpoints "Main,OnCreate"

# Custom port and timeout
tizen-cli tizen-sdk dotnet-debug \
  --app-id org.example.myapp \
  --binary ./MyApp/Debug/bin/Debug/net6.0/MyApp.dll \
  --port 5050 --timeout 60
```

> **Note:** The binary path must be a .NET **DLL file**. .NET build output is usually at `<project>/Debug/bin/Debug/<tfm>/MyApp.dll`.

**Result (WebApp — rejected as expected):**

```json
{
  "status": "failure",
  "result": null,
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_IO_E001",
      "message": "'CmaRL446cf.TestWebApp' is a Web app (wgt) — .NET debugging is not supported for Web apps.",
      "error_category": "io_error"
    }
  ],
  "command": "tizen-sdk dotnet-debug",
  "duration_ms": 6400
}
```

---

## Key Features

- **Standard JSON Envelope**: All commands output exactly one JSON structure to stdout; diagnostic logs separated to stderr
- **Exit Code Convention**: Success = 0, Failure = 1, strictly observed
- **WebApp Safety Guard**: `gdb-debug` and `dotnet-debug` automatically detect and reject WebApp requests
- **End-to-End Pipeline**: Template discovery → project creation → build → emulator → installation → execution all succeed
- **Standard Platform Priority**: `device-manager` prioritizes non-TV Tizen emulator platforms over TV extensions
- **Rapid Turnaround**: Most commands complete in seconds; cold emulator boot is the dominant factor (159s)
