# Tizen SDK Skills — Skills Reference

**Version:** 1.0.0  
**Author:** Samsung Electronics  
**Published:** 2026-08-26  
**License:** Apache License 2.0 ([LICENSE](../LICENSE))


---

## Overview

`tizen-sdk-skills` is an integrated skill collection for **Claude Code, Cline, Codex CLI, Gemini CLI, and tizen-cli** that automates Tizen development environment setup, project creation, building, deployment, debugging, device screenshot capture, and log analysis. It provides **29 automation skills** that can be triggered via natural language.

All skills return responses in **Standard JSON Envelope** format, ensuring consistent error handling and machine-readable output.

---

## Features

- ✅ **One-command SDK setup** — Node.js check → disk space check → SDK install, fully automated
- ✅ **29 skills** covering the full Tizen development lifecycle (build, deploy, debug, screenshot capture, log analysis, platform/rootstrap install)

- ✅ **Cross-platform** — Windows (PowerShell/cmd), Linux, macOS
- ✅ **Multi-harness support** — Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli (one shared `common/`; per-harness setup is `common/setup/setup.{sh,ps1} --harness <name>`)
- ✅ **Standard JSON Envelope** — every response is structured JSON with status, result, warnings, errors
- ✅ **CLI runners** — each skill has a standalone Node.js CLI runner (no temp scripts needed)
- ✅ **Guard rules** — prevents hand-writing project files, using `tizen` CLI directly, or running native binaries with `node`

---

## Getting Started

### Installation

Run the setup script of the harness you use (`<harness>` = `claude` | `cline` | `codex` | `gemini`):

**Windows (PowerShell):**

```powershell
.\<harness>\setup\setup.ps1
```

**Linux/macOS:**

```bash
bash <harness>/setup/setup.sh
```

All four are thin wrappers around `common/setup/setup.{sh,ps1} --harness <harness>`, which installs
skills, agents, hooks and instruction files where that harness actually loads them. After installation,
**restart the harness session** to load the new skill definitions (Claude Code / Gemini CLI: merge the
printed `settings.json` hook snippet; Codex CLI: additionally trust the hooks once via `/hooks`).
Per-harness details: [deployment/HARNESS_SETUP.en.md](deployment/HARNESS_SETUP.en.md).

**tizen-cli:** no setup step — `tizen-cli tizen-sdk <command>` calls the same `common/` logic
([tizen-cli README](../tizen-cli/README.md)).

### Quick Start

Just speak natural language to your AI harness (Claude Code / Cline / Codex CLI / Gemini CLI):

```
Step 1: "Install the Tizen SDK"
Step 2: "Find a device or emulator"
Step 3: "Create a new Tizen project"
Step 4: "Build the project"
Step 5: "Install the app"
Step 6: "Start debugging the app"
```

---

## Skills

### 1. tizen-sdk-init

**Description:** Configure the Tizen SDK installation path by writing it to `~/.tizen.sdk.path.config`.

**Use Case:** Register a manually installed SDK or a non-default SDK path.

**Parameters:**

| Parameter | Type   | Default       | Description                 |
| --------- | ------ | ------------- | --------------------------- |
| `sdkPath` | string | `~/tizen-sdk` | Tizen SDK installation path |

**CLI Runner:**

```
node <plugin>/lib/cli/sdk-init-cli.js [sdkPath]
```

**Automated Steps:**

1. Path validation — rejects empty or non-string paths
2. Existence check — verifies the SDK path exists on disk
3. Permission check — verifies read/write access to the SDK path
4. Config file write — writes the SDK path to `~/.tizen.sdk.path.config`
5. POSIX permissions — sets `0o600` on the config file (Linux/macOS only; Windows skips chmod)

**Response (success):**

```json
{
  "status": "success",
  "result": {
    "sdk_path": "/home/user/tizen-sdk",
    "config_file": "/home/user/.tizen.sdk.path.config"
  },
  "command": "tizen-sdk sdk-init"
}
```

**Dependencies:** None (use after a manual SDK install or when the SDK is at a non-default path)

---

### 2. tizen-sdk-install

**Description:** Auto-install the Tizen SDK with built-in pre-checks (Node.js + disk space).

**Use Case:** Initial development environment setup.

**Parameters:**

| Parameter | Type    | Default   | Description                               |
| --------- | ------- | --------- | ----------------------------------------- |
| `version` | string  | `'10.0'`  | Tizen SDK version                         |
| `label`   | string  | `'tizen'` | SDK label                                 |
| `force`   | boolean | `false`   | Force reinstall even if already installed |

**CLI Runner:**

```
node <plugin>/lib/cli/sdk-install-cli.js [version] [label] [--force]
```

**Pre-check Flow:**

```
1. Node.js check (18+ required) → if not installed, abort with OS-specific guide
2. SDK already installed? → if yes, return success
3. Disk space check (15 GB, home drive) → if insufficient, abort with details
4. Return installer command for Phase 2 (background install)
```

**CDN Mirror Selection (automatic, timezone-based):**

During SDK install, the installer script automatically selects the fastest CDN mirror based on the system's UTC timezone offset:

| UTC Offset Range | Mirror     | URL                                                            |
|------------------|------------|----------------------------------------------------------------|
| UTC-12 .. UTC-5  | Global     | `https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official`        |
| UTC-4  .. UTC-1  | Brazil     | `https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official`      |
| UTC+0  .. UTC+4  | Official   | `https://download.tizen.org/sdk/tizenstudio/official`           |
| UTC+5  .. UTC+12 | Singapore  | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official`  |

The selected mirror URL is written to `{SDK_PATH}/.package/repository.info` after a successful install. The package updater reads this file to download updates from the same mirror.

**Custom repository URL:** to install from your own repository instead of a CDN mirror, use [23. tizen-sdk-install-custom-repo](#23-tizen-sdk-install-custom-repo) (or pass `--repo-url <url>`, which delegates to the same flow). The URL must serve `pkg_list_{OS}-{64,32}`.

**Response (success):**

```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "Tizen SDK 10.0",
        "version": "10.0",
        "status": "installed"
      }
    ],
    "installation_status": "completed"
  },
  "command": "tizen-sdk sdk-install"
}
```

**Response (Node.js not found):**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_CONFIG_E005",
      "error_category": "node_not_found",
      "message": "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 18+.",
      "suggested_fix": {
        "command": "winget install OpenJS.NodeJS.LTS",
        "auto_fixable": false,
        "guide_url": "https://nodejs.org/"
      }
    }
  ],
  "command": "tizen-sdk check-node"
}
```

**Dependencies:** None (first skill to run)

---

### 3. tizen-check-node

**Description:** Verify Node.js is installed and on PATH before SDK installation.

**Use Case:** Pre-install Node.js verification (18+ required).

**Parameters:** None

**CLI Runner:**

```
node <plugin>/lib/cli/check-node-cli.js
```

**Response (success):**

```json
{
  "status": "success",
  "result": {
    "installed": true,
    "version": "v20.11.0",
    "path": "C:\\Program Files\\nodejs\\node.exe",
    "major_version": 20
  },
  "command": "tizen-sdk check-node"
}
```

**Installation Guide (when Node.js is not installed):**

| OS                    | Command                                             |
| --------------------- | --------------------------------------------------- |
| Windows               | `winget install OpenJS.NodeJS.LTS`                  |
| macOS                 | `brew install node`                                 |
| Linux (Ubuntu/Debian) | `sudo apt update && sudo apt install -y nodejs npm` |
| All OS (manual)       | Download LTS from https://nodejs.org/               |

**Dependencies:** None

---

### 4. tizen-check-disk-space

**Description:** Verify available disk space on the user's home drive before SDK installation.

**Use Case:** Pre-install disk space verification (15 GB threshold, home drive only).

**Parameters:**

| Parameter    | Type   | Default        | Description                               |
| ------------ | ------ | -------------- | ----------------------------------------- |
| `path`       | string | `os.homedir()` | Directory path to check (home drive only) |
| `requiredGb` | number | `15`           | Minimum required space in GB              |

**CLI Runner:**

```
node <plugin>/lib/cli/check-disk-space-cli.js [path] [requiredGb]
```

**Response (success):**

```json
{
  "status": "success",
  "result": {
    "path": "C:/Users/<username>",
    "total_gb": 500,
    "free_gb": 200,
    "required_gb": 15,
    "sufficient": true
  },
  "command": "tizen-sdk check-disk-space"
}
```

**Response (insufficient space):**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_ENV_E002",
      "error_category": "insufficient_disk_space",
      "message": "Insufficient disk space: 3.2 GB free, but 15 GB required. Need 11.8 GB more."
    }
  ],
  "command": "tizen-sdk check-disk-space"
}
```

**Dependencies:** None

---

### 5. tizen-dotnet-setup

**Description:** Set up the .NET development environment for Tizen DotNET projects.

**Use Case:** Verify .NET SDK and install Tizen workload.

**Parameters:**

| Parameter | Type    | Default | Description                    |
| --------- | ------- | ------- | ------------------------------ |
| `force`   | boolean | `false` | Force reinstall Tizen workload |
| `version` | string  | `null`  | Tizen workload version         |

**CLI Runner:**

```
node <plugin>/lib/cli/dotnet-setup-cli.js [--force] [version]
```

**Automated Steps:**

1. Check if .NET SDK (`dotnet`) is installed
2. If not installed → provide OS-specific installation guide + download link, then exit
3. If installed → install Tizen workload (Samsung script → `dotnet workload install tizen` fallback)
4. Verify installation result (`dotnet workload list`)

**Dependencies:** `tizen-sdk-install` (SDK must be installed first)

---

### 6. tizen-create-project

**Description:** Create Tizen projects from templates (Native, DotNET, WebApp, TV, Platform), and delete project directories.

**Use Case:** Create new Tizen projects via interactive UI. Deletion requests
("delete that project", "remove MyApp") are also served by this skill's `delete` action.

**Parameters:**

| Parameter    | Type   | Default      | Description                                       |
| ------------ | ------ | ------------ | ------------------------------------------------- |
| `type`       | string | _(required)_ | `native`, `dotnet`, `webapp`, `tv`, or `platform` |
| `template`   | string | _(required)_ | Template name from `listTemplates()`              |
| `parentPath` | string | _(required)_ | Parent (workspace) directory                      |
| `appName`    | string | _(required)_ | App name = folder name                            |
| `force`      | boolean | `false`     | Replace the target folder if it already exists (only an empty folder or a Tizen project — arbitrary directories are refused) |

**CLI Runners:**

```
node <plugin>/lib/cli/project-manager-cli.js create --type <type> --template <template> --parent-path <parentPath> --name <appName> [--force]
node <plugin>/lib/cli/project-manager-cli.js list-templates [--type <type>]
node <plugin>/lib/cli/project-manager-cli.js delete --project <projectPath>
```

**Deleting a project (`delete` action / `project-delete` command):** removes a
project directory on the SDK host. Paths without a Tizen project marker
(`tizen_*_project.yaml`, `config.xml`, `tizen-manifest.xml`, `.tproject`,
`*.csproj`, ...) are refused. Never `rm -rf` a project yourself — on a remote
MCP client that deletes a client-local path (a silent no-op) instead.

**Supported Project Types:**

1. **Native (C/C++)** — When native performance is needed
2. **DotNET (C#)** — When using C# and NUI framework
3. **WebApp** — HTML/CSS/JavaScript based apps
4. **TV** — Samsung TV apps (TV SDK extension templates)
5. **Platform** — Platform (RPM) projects built with GBS (e.g., DALi)

**Dependencies:** `tizen-sdk-install` (SDK must be installed)

---

### 7. tizen-build-project

**Description:** Automatically build Tizen projects with auto-detection.

**Use Case:** Build Native/DotNET/WebApp projects.

**Parameters:**

| Parameter     | Type   | Default      | Description                   |
| ------------- | ------ | ------------ | ----------------------------- |
| `projectPath` | string | _(required)_ | Project root directory        |
| `buildType`   | string | `'Debug'`    | `Debug`, `Release`, or `Test` |
| `signProfile` | string | `null`       | Signing profile (optional)    |
| `arch`        | string | `'x86_64'`   | Target architecture for GBS/Platform builds (`armv7l`, `aarch64`, `i586`, `x86_64`) |
| `clean`       | boolean | `false`     | Remove previous build output on the SDK host before building — forces a full rebuild (incremental builds do not re-emit compiler warnings for unchanged files) |

**CLI Runner:**

```
node <plugin>/lib/cli/project-manager-cli.js build --project <projectPath> [--build-type <buildType>] [--sign-profile <signProfile>] [--arch <arch>] [--clean]
```

**Automated Steps:**

1. Auto-detect project type (Native/DotNET/WebApp/Platform)
2. Select build configuration (Debug/Release)
3. Scan project path
4. Execute build command (`tz build -b Debug -w <project>` or `gbs build -A <arch> --include-all` for Platform projects)
5. Verify build results (.tpk/.wgt/.rpm artifacts)

**Response (success):**

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "/path/MyApp.tpk",
        "format": ".tpk",
        "size_bytes": 1048576
      }
    ],
    "build_type": "Debug"
  },
  "command": "tizen-sdk build-project"
}
```

**Dependencies:** `tizen-create-project` (project must exist)

---

### 8. tizen-certificate-manager

**Description:** Manage Tizen certificates (local self-signed + Samsung online-CA) and signing profiles — author certificate generation, distributor certificate selection, profile create/activate/remove, certificate import/inspection, Samsung Account login, and Samsung certificate issuance.

**Use Case:** Prepare signing certificates/profiles for app signing (before build signing); issue or import Samsung certificates.

**Parameters (main):**

| Parameter     | Type   | Default                    | Description                                                          |
| ------------- | ------ | -------------------------- | --------------------------------------------------------------------- |
| `action`      | string | `'generate-author'`        | `generate-author`, `list-distributors`, `create-profile`, `list-profiles`, `set-active-profile`, `remove-profile`, `set-distributor2`, `import-certificate`, `inspect-certificate`, `get-sdk-data-path` + Samsung actions (`generate-samsung-author`, `generate-samsung-distributor`, `import-samsung-certificate`, `create-samsung-profile`, `cancel-samsung-cert`, `samsung-login`, `samsung-reveal-password`, `parse-duids`, `import-duids`, `acquire-duid`, `acquire-duids-all`) |
| `name`        | string | _(required, generate-author)_ | Author's name                                                       |
| `password`    | string | _(required)_               | Certificate password (>=8 chars, upper+lower+digit)                    |
| `profileName` | string | _(required, Samsung actions)_ | Profile identifier                                                  |
| `type`        | string | `null` (all)               | list-distributors: `public`, `partner`, `platform`                     |
| `duidList`    | string | _(required, generate-samsung-distributor)_ | Comma/newline separated DUID list                      |
| `privilege`   | string | `'Public'`                 | generate-samsung-distributor: `Public` or `Partner`                    |

**CLI Runner:**

```
node <plugin>/lib/cli/cert-manager-cli.js <action> [options]
node <plugin>/lib/cli/cert-manager-cli.js generate-author --name "Jane Dev" --password "<password>"
node <plugin>/lib/cli/cert-manager-cli.js list-distributors [--type public|partner|platform] [--version legacy|new]
node <plugin>/lib/cli/cert-manager-cli.js generate-samsung-author --profile-name MyProfile --identity "Jane Dev" --password "<password>"
node <plugin>/lib/cli/cert-manager-cli.js create-samsung-profile --profile-name MyProfile --active
```

**Dependencies:** `tizen-sdk-install` (SDK certificate tooling required)

---

### 9. tizen-device-manager

**Description:** Find connected Tizen devices via SDB (`start`) or shut down all running emulator VMs (`stop`, via em-cli kill). **This skill does not create or launch emulators** — creation is handled by `tizen-create-emulator` and booting by `tizen-launch-emulator`.

**Use Case:** Check connected devices/emulators, or shut down running emulators.

**Parameters:**

| Parameter    | Type   | Default              | Description                               |
| ------------ | ------ | -------------------- | ----------------------------------------- |
| `action`     | string | `'start'`            | `start` (find connected devices) or `stop` (shut down running emulator VMs) |
| `timeoutSec` | number | `300`                | Emulator connection wait time (1–540 sec) |
| `vmName`     | string | `'tizen-vm-default'` | Emulator VM name to look for              |
| `profile`    | string | `'tizen'`            | Emulator profile: `tizen` or `tv` (Samsung TV) |

**CLI Runner:**

```
node <plugin>/lib/cli/device-manager-cli.js [start] [timeoutSec] [vmName] [profile]
node <plugin>/lib/cli/device-manager-cli.js stop                                # shut down all running emulator VMs (--action stop also works)
tizen-cli tizen-sdk device-manager [--action start|stop] [--timeout 300] [--vm-name <name>] [--profile tizen|tv]
```

**Automated Steps (start):**

1. Search for connected devices via SDB (`sdb devices`)
2. Query device info (model, SDK version)
3. If no device is found, return a `device_not_found` envelope whose `suggested_fix` points to `tizen-create-emulator` (create a VM) / `tizen-launch-emulator` (boot a VM) — it never creates or launches an emulator itself

**Automated Steps (stop):**

1. Query running emulator VMs via em-cli
2. Shut down all running VMs via em-cli kill (parses the `EMULATOR_STOPPED=` marker)

**Dependencies:** `tizen-sdk-install` (SDK must be installed)

---

### 10. tizen-create-emulator

**Description:** Create a Tizen emulator VM with a user-selected screen size via em-cli. Also supports listing platforms/templates/VMs and deleting VMs; `emulator-manager-cli.js` covers the full em-cli surface (detail, modify, reset, create-image).

**Use Case:** Create an emulator VM at a specific resolution (1080/720/3840, ...), list emulator templates/platforms/VMs, delete a VM. To boot an existing VM, use `tizen-launch-emulator`.

**Parameters:**

| Parameter        | Type    | Default                       | Description                                                                 |
| ---------------- | ------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `action`         | string  | `'create'`                    | `create`, `delete`, `launch`, `list-vm`, `list-platform`, `list-template`, `detail`, `modify`, `reset`, `create-image` |
| `vmName`         | string  | _(required for create/delete)_ | Emulator VM name                                                            |
| `size`           | string  | _(required for create)_       | `1080`, `720`, `3840`, or `1920x1080` — omitting it fails with `user_input_required` (the size is a user choice) |
| `assumeDefaults` | boolean | `false`                       | Use the default size (1080) without asking — non-interactive runs only        |
| `template`       | string  | `null`                        | Exact template name (overrides `--size`)                                      |
| `platform`       | string  | _(auto-detected)_             | Platform image name                                                           |
| `profile`        | string  | `'tizen'`                     | `tizen` or `tv` (requires the TV SDK extension)                               |
| `launch`         | boolean | `false`                       | Launch the VM immediately after creation (create only)                        |

**CLI Runner:**

```
node <plugin>/lib/cli/emulator-manager-cli.js create --vm-name <name> --size <1080|720|3840|1920x1080> [--profile tizen|tv] [--launch]
node <plugin>/lib/cli/emulator-manager-cli.js <list-vm|list-platform|list-template> [--detail]
node <plugin>/lib/cli/emulator-manager-cli.js delete --vm-name <name>
```

**Dependencies:** `tizen-sdk-install` (SDK), `tizen-download-emulator-package` (the emulator package that contains em-cli)

---

### 11. tizen-launch-emulator

**Description:** Launch an existing Tizen emulator VM via em-cli. If no VM name is given, launches the first VM from the list and waits for the emulator to connect via sdb.

**Use Case:** Boot an already-created emulator VM (a cold boot can take minutes).

**Parameters:**

| Parameter      | Type   | Default                 | Description                              |
| -------------- | ------ | ----------------------- | ----------------------------------------- |
| `vmName`       | string | _(first VM in the list)_ | Emulator VM name to launch               |
| `timeout`      | number | `300`                   | sdb connection wait time (seconds, 1–540) |
| `emulatorPath` | string | `null`                  | Directory of the emulator program (optional) |

**CLI Runner:**

```
node <plugin>/lib/cli/emulator-manager-cli.js launch [--vm-name <name>] [--timeout <seconds>] [--emulator-path <path>]
```

**Dependencies:** `tizen-create-emulator` (the VM must exist)

---

### 12. tizen-download-emulator-package

**Description:** Download and install the Tizen emulator package (`TIZEN-{platform_version}-Emulator`) from the Tizen package repository. Reads the repository URL from `repository.info`.

**Use Case:** Install the emulator package required for creating and launching emulator VMs.

**Parameters:**

| Parameter         | Type    | Default                 | Description                             |
| ----------------- | ------- | ----------------------- | ---------------------------------------- |
| `platformVersion` | string  | _(auto-detects latest)_ | Tizen platform version (e.g. `10.0`, `11.0`) |
| `force`           | boolean | `false`                 | Force reinstall even if already installed |

**CLI Runner:**

```
node <plugin>/lib/cli/download-emulator-package-cli.js [--platform-version 10.0] [--force]
```

**Pre-check Flow:**

```
1. Check whether the Tizen SDK is installed (sdk.info) → abort if not installed
2. Emulator package already installed? (.emulator-package-installed marker) → return success if so
3. Return emulator package installer command (suggested_fix) — run in Phase 2 (background)
```

**What the installer does:** reads the mirror URL from `.package/repository.info` (falls back to the official repo), downloads `pkg_list_{OS}`, resolves the latest `TIZEN-X.Y` platform (or the given `--platform-version`), downloads `TIZEN-{version}-Emulator` and all its `Install-dependency` packages, merges each package's `data/` into the SDK root, and creates the `.emulator-package-installed` marker on success.

**Dependencies:** `tizen-sdk-install` (Tizen SDK must be installed first)

---

### 13. tizen-install-app

**Description:** Install Tizen app packages (.tpk/.wgt/.rpk/.rpm) on a device or emulator. RPK is a resource-only package that can be installed but not launched; RPM comes from GBS (Platform) builds.

**Use Case:** Deploy app packages to devices.

**Parameters:**

| Parameter         | Type    | Default      | Description                                   |
| ----------------- | ------- | ------------ | --------------------------------------------- |
| `packagePath`     | string  | _(required)_ | Absolute path to a .tpk/.wgt/.rpk/.rpm file   |
| `deviceSerial`    | string  | `null`       | Target device serial (auto-select if omitted) |
| `runAfterInstall` | boolean | `false`      | Launch app after installation                 |

**CLI Runner:**

```
node <plugin>/lib/cli/project-manager-cli.js install --package <packagePath> [--device-serial <deviceSerial>] [--run]
```

**Automated Steps:**

1. Auto-detect device/emulator
2. Validate app package file
3. Execute package installation (`tz install -e <serial> -p <package>`)
4. Verify installation result
5. Optionally launch the app

**Dependencies:** `tizen-build-project` (build artifacts required), `tizen-device-manager` (device required)

---

### 14. tizen-gdb-debug

**Description:** Automated remote GDB debugging for Tizen Native apps (setup-only mode).

**Use Case:** Debug Native (C/C++) apps.

**Parameters:**

| Parameter     | Type    | Default      | Description                                   |
| ------------- | ------- | ------------ | --------------------------------------------- |
| `appId`       | string  | _(required)_ | Tizen package ID                              |
| `binaryPath`  | string  | _(required)_ | Host binary path with debug symbols           |
| `launch`      | boolean | `false`      | Launch mode (stop before main) vs attach mode |
| `breakpoints` | string  | `''`         | Comma-separated breakpoint function names     |
| `port`        | number  | `5039`       | Debug port                                    |
| `timeout`     | number  | `30`         | PID lookup wait (seconds, attach mode)        |

**CLI Runner:**

```
node <plugin>/lib/cli/gdb-debug-cli.js <appId> <binaryPath> [options]
```

**Automated Steps:**

1. Verify device SDB connection
2. Auto-detect gdbserver on device
3. Start the app and lookup PID (attach mode)
4. Bind gdbserver on device
5. Forward TCP port via SDB
6. Generate gdb init file + interactive gdb command

**Dependencies:** `tizen-install-app` (app must be installed and running)

---

### 15. tizen-dotnet-debug

**Description:** Automated remote debugging for Tizen .NET apps using netcoredbg (setup-only mode).

**Use Case:** Debug C# (.NET) apps.

**Parameters:**

| Parameter      | Type    | Default      | Description                                |
| -------------- | ------- | ------------ | ------------------------------------------ |
| `appId`        | string  | _(required)_ | Tizen package ID                           |
| `launch`       | boolean | `false`      | Launch mode (DAP server) vs attach mode    |
| `breakpoints`  | string  | `''`         | Comma-separated breakpoints (File.cs:line) |
| `port`         | number  | `4711`       | DAP server port (launch mode)              |
| `serial`       | string  | `''`         | Device serial (auto-select if omitted)     |
| `timeout`      | number  | `30`         | PID lookup wait (seconds, attach mode)     |
| `forceInstall` | boolean | `false`      | Force reinstall netcoredbg                 |

**CLI Runner:**

```
node <plugin>/lib/cli/dotnet-debug-cli.js <appId> [options]
```

**Automated Steps:**

1. Verify device connection
2. On-demand netcoredbg installation
3. Start app and lookup PID (attach mode)
4. Generate interactive netcoredbg command (attach) or VS Code DAP config (launch)

**Dependencies:** `tizen-install-app` (app must be installed), `tizen-dotnet-setup` (.NET workload required)

---

### 16. tizen-webapp-debug

**Description:** Automated remote debugging for Tizen Web apps (.wgt) via RWI (Remote Web Inspector)/CDP (setup-only mode).

**Use Case:** Debug Web (HTML/JS/CSS) apps. Never use for Native/.NET apps (use `tizen-gdb-debug`/`tizen-dotnet-debug`).

**Parameters:**

| Parameter | Type   | Default      | Description                                     |
| --------- | ------ | ------------ | ----------------------------------------------- |
| `appId`   | string | _(required)_ | Tizen web app ID (e.g. `abcDEF1234.MyWebApp`)   |
| `port`    | number | `9222`       | Host port forwarded to the device RWI port      |
| `serial`  | string | `''`         | Device serial (auto-select if omitted)          |
| `timeout` | number | `30`         | CDP endpoint readiness timeout (seconds)        |

**CLI Runner:**

```
node <plugin>/lib/cli/webapp-debug-cli.js --app-id <appId> [--port 9222] [--serial <serial>] [--timeout 30]
```

**Automated Steps:**

1. Verify device connection + web app (wgt) guard (routes non-wgt apps to gdb/dotnet debug)
2. Relaunch the app in web-debug mode (`app_launcher -w -s`) and parse the RWI port
3. Forward the host port to the device RWI port via SDB
4. Verify the CDP endpoint (`/json/version`, `/json/list`)
5. Return the CDP endpoint plus the direct Chrome DevTools link (`connect.devtools`, `http://127.0.0.1:<port>/devtools/inspector.html?ws=...`) and a Playwright (`connectOverCDP`) snippet

**Dependencies:** `tizen-install-app` (app must be installed)

---

### 17. tizen-screenshot

**Description:** Capture a screenshot from a Tizen device or emulator with automatic fallback methods (host-side xwd for emulators, framebuffer for physical devices).

**Use Case:** Capture the emulator/device screen for debugging, documentation, or visual verification.

**Parameters:**

| Parameter | Type   | Default            | Description                                   |
| --------- | ------ | ------------------ | --------------------------------------------- |
| `serial`  | string | `null`             | Target device serial (auto-select if omitted) |
| `output`  | string | `./screenshot.png` | Output PNG path                               |

**CLI Runner:**

```
node <plugin>/lib/cli/screenshot-cli.js [serial] [output]
```

**Capture Methods (auto-detected):**

**Emulator targets (serial starts with `emulator-`):**

1. **Host-side `xwd`** — Most reliable (captures the emulator's X11 window)
2. **Device-side `screencapture`**
3. **Device-side `capture_screen`**
4. **Device-side `/dev/fb0`** (framebuffer)

**Physical devices:**

1. **Device-side `/dev/fb0`** (framebuffer)
2. **Device-side `screencapture`**
3. **Device-side `capture_screen`**
4. **Host-side `xwd`** (rarely applicable)

**Response (success):**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "screenshot_path": "/path/to/screenshot.png",
    "capture_method": "host-side xwd",
    "file_size_bytes": 1234567,
    "dimensions": "1920x1080"
  },
  "command": "tizen-sdk screenshot"
}
```

**Dependencies:** `tizen-device-manager` (device must be available)

---

### 18. tizen-tv-sdk-install

**Description:** Install the Tizen TV SDK extension package (TV-SAMSUNG-Public). Requires the Tizen SDK to be installed first.

**Use Case:** Install the TV SDK extension for TV app development.

**Parameters:**

| Parameter | Type    | Default | Description                               |
| --------- | ------- | ------- | ----------------------------------------- |
| `force`   | boolean | `false` | Force reinstall even if already installed |

**CLI Runner:**

```
node <plugin>/lib/cli/tv-sdk-install-cli.js [--force]
```

**Pre-check Flow:**

```
1. Check whether the Tizen SDK is installed (sdk.info)
   ├─ Installed → proceed with TV SDK install
   └─ Not installed → interactive prompt: "The Tizen SDK must be installed first. Install it now?"
       ├─ Approved → run the tizen-sdk-install skill → retry TV SDK install after completion
       └─ Declined → abort
2. TV SDK already installed? (.tv-sdk-installed marker) → return success if so
3. Return TV SDK installer command (suggested_fix) — run in Phase 2 (background)
```

**Package Repository:**

- URL: `https://download.tizen.org/sdk/extensions/tv_extensions/`
- Target package: `TV-SAMSUNG-Public`
- Install location: existing Tizen SDK path (same `~/tizen-sdk` folder)

**Dependencies:** `tizen-sdk-install` (Tizen SDK must be installed first)

---

### 18a. tizen-tv-sdk-install-from-zip

**Description:** Install the Tizen TV SDK extension (TV-SAMSUNG-Public) offline from a local ZIP file. All packages are already bundled in the ZIP — no download required. Requires the Tizen SDK to be installed first.

**Use Case:** Install the TV SDK extension in offline environments or from an internal mirror.

**Parameters:**

| Parameter | Type    | Default | Description                                    |
| --------- | ------- | ------- | --------------------------------------------- |
| `zipPath` | string  | (required) | Path to the ZIP file containing TV SDK packages |
| `force`   | boolean | `false` | Force reinstall even if already installed      |

**CLI Runner:**

```
node <plugin>/lib/cli/tv-sdk-install-from-zip-cli.js --zip-path <path> [--force]
```

**Pre-check Flow:**

```
1. Check whether the Tizen SDK is installed (sdk.info)
   ├─ Installed → proceed with TV SDK install
   └─ Not installed → interactive prompt: "The Tizen SDK must be installed first. Install it now?"
       ├─ Approved → run the tizen-sdk-install skill → retry TV SDK install after completion
       └─ Declined → abort
2. TV SDK already installed? (.tv-sdk-installed marker) → return success if so
3. Return TV SDK installer command (suggested_fix) — run in Phase 2 (background)
```

**Installation Method:**

- Extract packages from the ZIP file (no download required, offline install)
- Unzip inner ZIP files into the SDK tools directory
- Create `.tv-sdk-installed` marker file

**Dependencies:** `tizen-sdk-install` (Tizen SDK must be installed first)

---

### 19. tizen-update-package

**Description:** Check for and install newer versions of installed Tizen SDK packages. Downloads the pkg_list file, compares versions with `.package/*.manifest` files, and updates outdated packages.

**Use Case:** Update installed SDK packages.

**Parameters:**

| Parameter | Type    | Default | Description                                    |
| --------- | ------- | ------- | ---------------------------------------------- |
| `force`   | boolean | `false` | Force update even if already at latest version |
| `dryRun`  | boolean | `false` | Check for changes without performing updates   |

**CLI Runner:**

```
node <plugin>/lib/cli/update-package-cli.js [--force] [--dry-run]
```

**Automated Steps:**

1. Check if Tizen SDK is installed
2. Read the CDN mirror URL from `.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
3. Download the OS-appropriate pkg_list file (windows-64 / ubuntu-64 / macos-64) from the selected mirror
4. Scan `.package/*.manifest` files to identify installed packages and versions
5. Compare pkg_list versions with installed versions to identify outdated packages
6. (If not dry-run) Download and install new versions, update manifests

**CDN Mirror (repository.info):** During SDK install, a CDN mirror is automatically selected based on the system timezone and stored in `.package/repository.info`. The updater reads this file to download updates from the same mirror — no further timezone check is needed during updates. If `repository.info` is missing, the updater falls back to the official repository.

**Dependencies:** `tizen-sdk-install` (Tizen SDK must be installed first)

---

### 20. tizen-sdb-helper

**Description:** Pick the right sdb command for a specific user request on a Tizen device — log capture, shell, port forward, root toggle, reboot, screen state — with confirmation gates on destructive actions.

**Use Case:** Run ad-hoc sdb commands on a connected device (logs, shell, port forwarding, device power control). Some intents (screenshot, install/uninstall, list devices, connect/disconnect) are matched by sdb-helper but handed off to dedicated skills that provide richer pipelines. For file transfer, use `tizen-file-transfer` skill directly.

**Parameters:**

| Parameter | Type   | Default      | Description                                                      |
| --------- | ------ | ------------ | ---------------------------------------------------------------- |
| `request` | string | _(required)_ | Natural-language sdb request (e.g., "list devices", "tail logs") |
| `serial`  | string | `null`       | Target device serial (auto-select if omitted)                    |

**CLI Runner:**

```
node <plugin>/lib/cli/sdb-helper-cli.js --request <text> [--serial <serial>]
```

**CLI Examples:**

```bash
node .../sdb-helper-cli.js --request "tail the logs"
node .../sdb-helper-cli.js --request "open a shell" --serial emulator-26101
node .../sdb-helper-cli.js --request="reboot the device" --serial=emulator-26101
```

**Automated Steps:**

1. Resolve sdb binary from configured SDK path
2. Match natural-language request to an sdb intent (25+ intent patterns)
3. Auto-detect connected device (or use provided serial)
4. For read-only intents: execute the sdb command and return output
5. For gated intents (reboot, factoryreset, root on, etc.): return the command for user confirmation
6. For handoff intents: return success envelope with `suggested_skill` instead of executing:
   - `list-devices` → `tizen-device-manager` (emulator fallback)
   - `connect`/`disconnect` → `tizen-remote-device` (bookmark management)
   - `install`/`uninstall` → `tizen-install-app` (package install pipeline)
   - `screenshot` → `tizen-screenshot` (control panel removal + stitching)
7. Return Standard JSON Envelope with command, output, and device info

**Response (success, read-only intent):**

```json
{
  "status": "success",
  "result": {
    "intent": "log-stream",
    "command": "sdb -s \"emulator-26101\" dlog -v threadtime",
    "device_serial": "emulator-26101",
    "output": "...",
    "gated": false
  },
  "command": "tizen-sdk sdb-helper"
}
```

**Response (success, gated intent — not executed):**

```json
{
  "status": "success",
  "result": {
    "intent": "reboot",
    "gated": true,
    "command": "sdb -s \"emulator-26101\" shell reboot",
    "device_serial": "emulator-26101",
    "message": "This is a gated action. Confirm before running."
  },
  "command": "tizen-sdk sdb-helper"
}
```

**Dependencies:** `tizen-sdk-init` (SDK path must be configured)

---

### 21. tizen-file-transfer

**Description:** Push/pull files and directories between the host computer and a connected Tizen device/emulator via sdb.

**Use Case:** Copy files to a device (push, host→device) or fetch files from a device (pull, device→host).

**Parameters:**

| Parameter    | Type    | Default                          | Description                                      |
| ------------ | ------- | -------------------------------- | ------------------------------------------------ |
| `direction`  | string  | _(required)_                     | `push` (host→device) or `pull` (device→host)     |
| `localPath`  | string  | _(required for push; `-` for pull)_ | Local (host) path (`-` on pull uses the default `.`) |
| `remotePath` | string  | _(required)_                     | Remote (device) path                             |
| `serial`     | string  | `null`                           | Device serial (auto-select if omitted)           |
| `withUtf8`   | boolean | `false`                          | Handle UTF-8 encoded paths                       |

**CLI Runner:**

```
node <plugin>/lib/cli/file-transfer-cli.js <push|pull> <localPath|-> <remotePath> [serial] [--with-utf8]
node <plugin>/lib/cli/file-transfer-cli.js push "/path/to/local" "/path/on/device"
node <plugin>/lib/cli/file-transfer-cli.js pull - "/path/on/device"
```

**Dependencies:** `tizen-sdk-init` (sdb required), `tizen-device-manager` (a connected device is required)

---

### 22. tizen-remote-device

**Description:** Search the local network for Tizen devices (TCP sweep of SDB port 26101), connect/disconnect them via sdb over the network, and manage the bookmarked remote device list (add/edit/remove/list-saved) of Tizen Studio Device Manager.

**Use Case:** Connect a TV/device over the network instead of USB, discover Tizen devices on the network, save/rename remote device bookmarks.

**Parameters:**

| Parameter | Type   | Default                                        | Description                                                                    |
| --------- | ------ | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `action`  | string | `'scan'`                                       | `scan`, `connect`, `disconnect`, `list`, `add`, `remove`, `edit`, `list-saved` |
| `subnet`  | string | _(all local subnets)_                          | /24 prefix to scan (scan only, e.g. `192.168.1`)                               |
| `ip`      | string | _(required for connect/disconnect/add/remove/edit)_ | Device IPv4 address (for edit, identifies the existing bookmark)         |
| `port`    | number | `26101`                                        | SDB port                                                                       |
| `timeout` | number | `3000`                                         | Per-host TCP timeout (ms, scan only, 100–30000)                                |
| `name`    | string | _(required for add)_                           | Display name to bookmark the device under (new name for edit)                  |
| `newIp`   | string | `null`                                         | edit only: move the bookmark to this IPv4 address                              |
| `newPort` | number | `null`                                         | edit only: move the bookmark to this SDB port                                  |

**CLI Runner:**

```
node <plugin>/lib/cli/remote-device-cli.js <scan|connect|disconnect|list|add|remove|edit|list-saved> [subnet|ip] [--port N] [--timeout MS] [--name NAME] [--new-ip IP] [--new-port N]
```

**Note:** `scan` is a pure TCP sweep and needs no SDK; `connect`/`disconnect`/`list` need sdb (an installed SDK + `tizen-sdk-init`). `add`/`remove`/`edit`/`list-saved` read/write Device Manager's `remote_device_scan.list` directly and do not need sdb.

**Dependencies:** `tizen-sdk-init` (only for connect/disconnect/list; scan and bookmark management have no dependency)

---

### 23. tizen-sdk-install-custom-repo

**Description:** Install the Tizen SDK from a **user-supplied package repository URL** (internal mirror, build-server output, local HTTP server) instead of the timezone-selected CDN mirror. The URL is validated first: it must serve `pkg_list_{OS}-64` or `pkg_list_{OS}-32`, otherwise the install is refused before anything is downloaded. Also validates a repository URL on its own.

**Use Case:** Installing from an internal/team mirror, or from a specific SDK build; checking whether a URL is a usable Tizen package repository.

**Parameters:**

| Parameter         | Type    | Default                   | Description                                                                       |
| ----------------- | ------- | ------------------------- | --------------------------------------------------------------------------------- |
| `repoUrl`         | string  | _(required)_              | Package repository base URL serving `pkg_list_{OS}-{64,32}`                       |
| `platformVersion` | string  | _(highest in pkg_list)_   | Tizen platform version (e.g. `10.0`, `11.0`)                                      |
| `force`           | boolean | `false`                   | Force reinstall — **required** to re-point an existing install at another repository |

**CLI Runners:**

```
node <plugin>/lib/cli/sdk-install-custom-repo-cli.js <repo-url> [platform-version] [--force]
node <plugin>/lib/cli/validate-repo-url-cli.js <repo-url>          # validation only
```

tizen-cli equivalents:

```
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url <url> [--platform-version 11.0] [--force]
tizen-cli tizen-sdk validate-repo-url --repo-url <url>
tizen-cli tizen-sdk sdk-install --repo-url <url>            # equivalent shorthand
```

**The repository URL rule:**

A Tizen package repository serves the package index at its root:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}      OS = windows | ubuntu | macos      ARCH = 64 | 32
```

`-64` is probed first, then `-32` (so a 32-bit-only mirror also works). Probing uses HEAD, falling back to a 1-byte ranged GET for servers that reject HEAD. A URL that serves neither file for the current OS is **rejected up front** — the alternative would be ~100 failed downloads and a half-installed SDK. Only `http://` and `https://` are supported, and the URL must be the **directory** that contains the pkg_list, not the pkg_list file itself.

**Pre-check Flow:**

```
1. Node.js check (18+ required) → if not installed, abort with OS-specific guide
2. Repository URL validation (pkg_list_{OS}-{64,32}) → if invalid, ABORT (nothing downloaded)
3. SDK already installed? → success + warning that --force is needed to switch repositories
4. Disk space check (15 GB, home drive) → if insufficient, abort with details
5. Return installer command for Phase 2 (background install)
```

**Scripts:**

| File                                                                        | Platform             |
| --------------------------------------------------------------------------- | -------------------- |
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh`    | Linux / macOS / WSL2 |
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.ps1`   | Windows PowerShell   |

Both are validating front-ends: once the URL passes they delegate to `tizen-sdk-install` with `--repo-url` / `-RepoUrl`, which does the real install. The base installer also accepts these flags directly, plus `--validate-repo-url` / `-ValidateRepoUrl` for a validation-only run.

**Response (validation success - example private mirror):**

```json
{
  "status": "success",
  "result": {
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "valid": true,
    "pkg_list_file": "pkg_list_ubuntu-64",
    "pkg_list_url": "http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_ubuntu-64",
    "probed_urls": ["http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_ubuntu-64"]
  },
  "command": "tizen-sdk validate-repo-url"
}
```

**Response (install success):**

```json
{
  "status": "success",
  "result": {
    "packages": [{ "name": "Tizen Platforms (10)", "status": "installed", "version": "11.0" }],
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "installation_status": "completed"
  },
  "command": "tizen-sdk sdk-install-custom-repo"
}
```

**Note:** The repository_url can be any server that serves `pkg_list_{OS}-{64,32}` at its root, for example:
- `http://mirror.example.com/packages/tizen_sdk_11.0/` (SDK 11.0 mirror)
- `http://mirror.example.com/packages/tizen_studio_6.5/` (SDK 10.0 MR / Tizen Studio 6.5 mirror)
- `http://localhost:8000/` (local HTTP server serving a repository dump)

**Response (invalid repository URL):**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_REPO_E002",
      "error_category": "repo_url_unreachable",
      "message": "Not a valid Tizen package repository: https://example.com/repo. Neither pkg_list_{OS}-64 nor pkg_list_{OS}-32 could be fetched from it.",
      "details": [
        "[INFO]  Probing https://example.com/repo/pkg_list_ubuntu-64",
        "[INFO]  Probing https://example.com/repo/pkg_list_ubuntu-32"
      ]
    }
  ],
  "command": "tizen-sdk sdk-install-custom-repo"
}
```

**Error categories:**

| `error_category`       | Meaning                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `repo_url_invalid`     | Missing/malformed URL, non-http(s) scheme, or points at the pkg_list file |
| `repo_url_unreachable` | Well-formed URL, but no `pkg_list_{OS}-{64,32}` is served (wrong URL, or an internal mirror that needs VPN/proxy) |

**Downstream effect:** the install writes the custom URL to `{SDK_PATH}/.package/repository.info`, which `tizen-update-package` and `tizen-download-emulator-package` read — so updates and emulator packages come from the same custom repository afterwards.

**Dependencies:** None (alternative entry point to `tizen-sdk-install`)

**Details:** [sdk-install/CUSTOM_REPOSITORY_INSTALL.en.md](sdk-install/CUSTOM_REPOSITORY_INSTALL.en.md)

---

### 24. tizen-playwright-test

**Description:** Run (or scaffold) automated Playwright tests against a Tizen Web app (.wgt) over RWI/CDP.

**When to use:** Automated testing (assertions, E2E, UI automation) of Web (HTML/JS/CSS) apps. NEVER for Native/.NET apps — they have no web runtime, so Playwright cannot attach. For interactive debugging use `tizen-webapp-debug` instead.

**Parameters:**

| Parameter      | Type    | Default                                  | Description                                                    |
| -------------- | ------- | ---------------------------------------- | -------------------------------------------------------------- |
| `appId`        | string  | _(required for a run)_                   | Tizen web app ID (e.g. `abcDEF1234.MyWebApp`)                  |
| `testFile`     | string  | `<projectDir>/tizen-playwright.test.js`  | Test script executed with node (.js/.mjs/.cjs)                 |
| `projectDir`   | string  | cwd / test-file dir                      | Test project (run cwd; needs playwright in its node_modules)   |
| `port`         | number  | `9222`                                   | Host port forwarded to the device RWI port                     |
| `serial`       | string  | `''`                                     | Device serial (auto-detected when omitted)                     |
| `setupTimeout` | number  | `30`                                     | CDP setup readiness timeout (seconds, 1-300)                   |
| `timeout`      | number  | `120`                                    | Test run timeout (seconds, 1-600)                              |
| `skipSetup`    | boolean | `false`                                  | Reuse an already-live CDP endpoint (skip the debug relaunch)   |
| `scaffold`     | boolean | `false`                                  | Only generate the test file (+package.json) and exit           |
| `force`        | boolean | `false`                                  | Overwrite an existing scaffolded test file (with scaffold)     |

**CLI runner:**

```
node <plugin>/lib/cli/playwright-test-cli.js --app-id <appId> --project-dir <dir> [--test-file <path>] [--port 9222] [--serial <serial>] [--timeout 120] [--no-setup]
node <plugin>/lib/cli/playwright-test-cli.js --scaffold --project-dir <dir> [--app-id <appId>] [--force]
```

**Automation steps:**

1. Resolve the test file (suggest `--scaffold` when absent) + verify playwright resolves from the test project (else `dependency_missing`)
2. CDP setup — reuses the full `tizen-webapp-debug` flow (device check, wgt guard, debug-mode relaunch, port forward, endpoint verification); with `--no-setup` it just probes the endpoint
3. Spawn `node <testFile>` with the test project as cwd (`TIZEN_CDP_ENDPOINT`/`TIZEN_CDP_PORT`/`TIZEN_APP_ID` in the environment)
4. Map exit code + the `TEST_RESULT:` marker → success / `test_failed` / `test_timeout` / `inspector_not_available` (ECONNREFUSED = the app was restarted)

**Important:** Playwright resolves from the **test project's node_modules** — never install it into the plugin. The scaffolded template only ATTACHES to the running app page (`connectOverCDP` → `contexts()[0].pages()[0]`) and never calls `page.goto()`/`newPage()`.

**Dependencies:** `tizen-install-app` (the app must be installed), `npm install playwright` in the test project

---

### 25. tizen-platform-install

**Description:** Download and install the Tizen platform package (`TIZEN-{Version}`) from the Tizen package repository. Reads the repository URL from `repository.info`. Requires the Tizen SDK to be installed first.

**Use Case:** Install the Tizen platform package (required for Native project builds).

**Parameters:**

| Parameter         | Type    | Default                 | Description                             |
| ----------------- | ------- | ----------------------- | ---------------------------------------- |
| `platformVersion` | string  | _(auto-detects latest)_ | Tizen platform version (e.g. `10.0`, `11.0`) |
| `force`           | boolean | `false`                 | Force reinstall even if already installed |

**CLI Runner:**

```
node <plugin>/lib/cli/platform-install-cli.js [--platform-version <version>] [--force]
```

**Pre-check Flow:**

```
1. Check whether the Tizen SDK is installed (sdk.info) → abort if not installed
2. Platform package already installed? (.platform-installed marker) → return success if so
3. Return platform package installer command (suggested_fix) — run in Phase 2 (background)
```

**What the installer does:** reads the mirror URL from `.package/repository.info` (falls back to the official repo), downloads `pkg_list_{OS}`, resolves the latest `TIZEN-X.Y` platform (or the given `--platform-version`), downloads `TIZEN-{version}` and all its `Install-dependency` packages, merges each package's `data/` into the SDK root, and creates the `.platform-installed` marker on success.

**Dependencies:** `tizen-sdk-install` (Tizen SDK must be installed first)

---

### 26. tizen-download-mobile-platform

**Description:** Download and install the Tizen Mobile platform package (`MOBILE-{version}`) from the Tizen package repository. Optionally supports the IOT-Headed extension package.

**Use Case:** Install the Tizen Mobile platform package (for mobile device development), install the IOT-Headed extension.

**Parameters:**

| Parameter           | Type    | Default                 | Description                                              |
| ------------------- | ------- | ----------------------- | -------------------------------------------------------- |
| `platformVersion`   | string  | _(auto-detects latest)_ | Tizen Mobile platform version (e.g. `10.0`, `11.0`)     |
| `includeIotHeaded`  | boolean | `false`                 | Also install the IOT-Headed extension package            |
| `iotHeadedVersion`  | string  | _(auto-detects latest)_ | IOT-Headed extension version                              |
| `force`             | boolean | `false`                 | Force reinstall even if already installed                |

**CLI Runner:**

```
node <plugin>/lib/cli/download-mobile-platform-cli.js [--platform-version <version>] [--include-iot-headed] [--iot-headed-version <version>] [--force]
```

**Pre-check Flow:**

```
1. Check whether the Tizen SDK is installed (sdk.info) → abort if not installed
2. Mobile platform package already installed? (.mobile-platform-installed marker) → return success if so
3. Return mobile platform package download command (suggested_fix) — run in Phase 2 (background)
```

**IOT-Headed Extension (optional):** when `--include-iot-headed` is specified, the installer parses the IoT Headed repository URL from `extension_info.xml` and downloads/installs the IOT-Headed package and its dependencies alongside the Mobile platform.

**Dependencies:** `tizen-sdk-install` (Tizen SDK must be installed first)

---

### 27. tizen-install-rootstrap

**Description:** Install a custom rootstrap package from a ZIP file into the Tizen SDK. Includes security validation (path traversal, symlink rejection).

**Use Case:** Install a custom rootstrap for cross-compilation (required for Native project builds).

**Parameters:**

| Parameter | Type    | Default      | Description                           |
| --------- | ------- | ------------ | ------------------------------------- |
| `zipPath` | string  | _(required)_ | Path to the rootstrap ZIP file        |
| `force`   | boolean | `false`      | Force reinstall even if already installed |

**CLI Runner:**

```
node <plugin>/lib/cli/install-rootstrap-cli.js --zip-path <zipPath> [--force]
```

**Automated Steps:**

1. Validate ZIP file path (security checks — path traversal, symlinks rejected)
2. Verify Tizen SDK is installed → abort if not found
3. Extract ZIP to temporary directory
4. Detect ZIP structure (`data/` or `tizen-studio/`)
5. Parse rootstrap XML metadata (profile, version, device, type)
6. Copy `tools/` folder to SDK
7. Copy `platforms/` folder to SDK
8. For tizen-studio structure: check native packages, copy as `tizen-7.0`
9. Create `.rootstrap-installed` marker on success

**Supported ZIP Structures:**

- `data/` layout — Standard rootstrap package
- `tizen-studio/` layout — Requires native development packages

**Dependencies:** `tizen-sdk-install` (Tizen SDK must be installed first)

---

### 28. tizen-dlog-analyzer

**Description:** Continuously collect and analyze Tizen device dlog to automatically detect crashes/exceptions. AI-powered root cause analysis and solution suggestions. Also supports app-specific log collection and runtime error (E/F priority) analysis.

**Use Case:** Monitor a running app for crashes/exceptions, analyze dlog for root cause detection, collect app-specific logs filtered by PID, or perform runtime error analysis. Requires a running emulator or connected device.

**Parameters:**

| Parameter    | Type   | Default      | Description                                                              |
| ------------ | ------ | ------------ | ------------------------------------------------------------------------ |
| `action`     | string | _(required)_ | One of `start`, `stop`, `check`, `status`, `app-launch`, `app-terminate`, `dlog-collect`, `stop-collect`, `error-analyze` |
| `subcommand` | string | _(start only)_ | One of `dlog-collect`, `exception-detect`, `start-monitoring` (recommended) |
| `app-id`     | string | _(app actions)_ | Tizen app ID (e.g., org.example.myapp). Required for app-launch, app-terminate, dlog-collect, error-analyze |
| `format`     | string | `null`       | For error-analyze only: `summary` (summary lines only), `details` (detail entries only), or omit for both |
| `serial`     | string | `null`       | Optional sdb device serial (auto-select if omitted)                      |

**CLI Runner:**

```
node <plugin>/lib/cli/dlog-analyzer-cli.js <action> [subcommand] [serial]
node <plugin>/lib/cli/dlog-analyzer-cli.js start start-monitoring
node <plugin>/lib/cli/dlog-analyzer-cli.js check
node <plugin>/lib/cli/dlog-analyzer-cli.js stop
node <plugin>/lib/cli/dlog-analyzer-cli.js app-launch <app-id>
node <plugin>/lib/cli/dlog-analyzer-cli.js app-terminate <app-id>
node <plugin>/lib/cli/dlog-analyzer-cli.js dlog-collect <app-id>
node <plugin>/lib/cli/dlog-analyzer-cli.js stop-collect
node <plugin>/lib/cli/dlog-analyzer-cli.js error-analyze <app-id> [format]
```

**Workflow (background monitoring):**

1. **Start monitoring** (`start start-monitoring`) — launch background dlog collection/analysis before launching the app
2. **Launch the app** — with monitoring running, launch the app to capture startup logs
3. **Wait for user feedback** — if app works fine, `stop`; if there's an issue, `check` for analyzed output
4. **Check analyzed output** (`check`) — read crash/exception analysis and offer a solution
5. **Apply fix** → **rebuild** → **reinstall/relaunch** → **re-check** (`check`) — repeat until resolved
6. **Stop monitoring** (`stop`) — clean up the background process

**Workflow (app-specific log analysis — when user provides an app ID):**

1. **Launch the app** (`app-launch <app-id>`) — launch a specific app and get its PID (short delay expected)
2. **Start background collection** (`dlog-collect <app-id>`) — start background log collection filtered by app PID, saved to `<tmp>/tizen-dlog-analyzer/app/<app-id>/<app-id>.hot.log`
3. **Ask user to browse** — tell the user to browse the app and reproduce the issue; give two options: "error/crash occurred" or "nothing happened"
4. **Stop collection and analyze** — when user reports back: `stop-collect` to stop, then `error-analyze <app-id> [format]` to analyze E/F priority entries (deduplicated by tag+message with occurrence count). Always use `error-analyze` — do not read the log file directly.
5. **Terminate the app** (`app-terminate <app-id>`) — clean up

**Action descriptions:**

| Action          | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `start`         | Launch the binary in background, capture output to a temp file     |
| `stop`          | Kill the running background process                                |
| `check`         | Read the temp file and return the latest analyzed output           |
| `status`        | Check if the background process is still running                  |
| `app-launch`    | Launch a Tizen app on the device via `sdb shell app_launcher -s` |
| `app-terminate` | Terminate a running Tizen app via `sdb shell app_launcher -k`    |
| `dlog-collect`  | Start background dlog collection filtered by app PID (app must be running) |
| `stop-collect`  | Stop the background app dlog collection process                   |
| `error-analyze` | Analyze collected app logs for E/F priority errors with deduplication |

**Notes:** Only one background instance at a time. If already running, `start` returns an `already_running` error. The background process survives even if the agent session ends — always `stop` when done. App-specific logs are stored in `$TMPDIR/tizen-dlog-analyzer/app/<app-id>/<app-id>.hot.log`. `dlog-collect` requires the app to be running (uses `pgrep` to find PID). `error-analyze` requires `dlog-collect` → `stop-collect` to have been run first. Always use `error-analyze` to analyze logs — do not read the log file directly. When the analysis is complete, the report is always rendered in both languages (English first, then Korean) following `REPORT_TEMPLATE.md`.


**Dependencies:** `tizen-launch-emulator` or `tizen-device-manager` (a running device/emulator is required)

**Details:** [debug/scenario-dlog-analyzer-walkthrough.en.md](debug/scenario-dlog-analyzer-walkthrough.en.md)

---

## Skill Dependency Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SDK Installation Phase                        │
│                                                                     │
│  tizen-check-node ──→ tizen-check-disk-space ──→ tizen-sdk-install  │
│  (Node.js 18+?)        (15 GB free?)            (10-15 min install) │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Platform/Extension Package Phase                    │
│                                                                     │
│  tizen-platform-install ──→ tizen-download-mobile-platform          │
│  (TIZEN-{version})          (MOBILE-{version}, IOT-Headed)          │
│  tizen-download-emulator-package ──→ tizen-install-rootstrap         │
│  (emulator package)                (custom rootstrap)                │
│  tizen-tv-sdk-install (TV SDK extension)                             │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Project Setup Phase                             │
│                                                                     │
│  tizen-dotnet-setup ──→ tizen-create-project ──→ tizen-build-project │
│  (.NET workload)         (Native/DotNET/WebApp/Platform)    (Debug/Release)   │
│  tizen-certificate-manager ──→ (signing certs/profiles → build signing) │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Deploy, Debug & Screenshot Phase                       │
│                                                                     │
│  tizen-create-emulator ─→ tizen-launch-emulator                    │
│  (VM create, em-cli)      (VM boot)                                 │
│  tizen-remote-device (network scan/sdb connect) ──┐                 │
│                                                   ▼                 │
│  tizen-device-manager ──→ tizen-install-app ──→ tizen-gdb-debug     │
│  (device/emulator)        (.tpk/.wgt)          (Native)             │
│                              │                ├→ tizen-dotnet-debug  │
│                              │                │  (.NET)              │
│                              │                └→ tizen-webapp-debug  │
│                              │                   (WebApp, RWI/CDP)   │
│                              │                    └→ tizen-playwright-test │
│                              │                      (WebApp automated tests) │
│                              ├→ tizen-dlog-analyzer                   │
│                              │    (dlog crash/exception analysis)    │
│                              ▼                                        │
│                        tizen-screenshot                             │
│                        (emulator/device screenshot)                 │
│  tizen-file-transfer (sdb push/pull) · tizen-sdb-helper (ad-hoc sdb) │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Reference

| #   | Skill                    | Function              | CLI Runner                | Description                                               |
| --- | ------------------------ | --------------------- | ------------------------- | --------------------------------------------------------- |
| 1   | `tizen-sdk-init`         | `initSdk()`           | `sdk-init-cli.js`         | Configure SDK path (`~/.tizen.sdk.path.config`)           |
| 2   | `tizen-sdk-install`      | `installSdk()`        | `sdk-install-cli.js`      | Install Tizen SDK (with Node.js + disk space pre-checks)  |
| 2a  | `tizen-sdk-install` (repo-info) | `getRepoInfo()` | `sdk-repo-info-cli.js`    | Query SDK package repository info (official CDN + regional mirrors, configured URL; private mirrors via `--repo-url`) |
| 3   | `tizen-check-node`       | `checkNode()`         | `check-node-cli.js`       | Verify Node.js is installed (18+ required)                |
| 4   | `tizen-check-disk-space` | `checkDiskSpace()`    | `check-disk-space-cli.js` | Verify disk space (15 GB, home drive)                     |
| 5   | `tizen-dotnet-setup`     | `setupDotnet()`       | `dotnet-setup-cli.js`     | Install .NET Tizen workload                               |
| 6   | `tizen-create-project`   | `createProject()`     | `project-manager-cli.js`  | Create project from template                              |
| 6a  |                          | `listTemplates()`     | `project-manager-cli.js`  | List available templates                                  |
| 6b  |                          | `deleteProject()`     | `project-manager-cli.js`  | Delete a project (`delete` action — refuses paths without Tizen project markers) |
| 7   | `tizen-build-project`    | `buildProject()`      | `project-manager-cli.js`  | Build project (Debug/Release, `--clean`, GBS `--arch`)    |
| 8   | `tizen-certificate-manager` | `generateAuthorCertificate()` etc. | `cert-manager-cli.js` | Manage certificates/signing profiles (local + Samsung online-CA) |
| 9   | `tizen-device-manager`   | `manageDevice()`      | `device-manager-cli.js`   | Find/create/launch device or emulator                     |
| 10  | `tizen-create-emulator`  | `createEmulator()`    | `emulator-manager-cli.js` | Create a custom emulator VM (size/platform/profile)       |
| 10a |                          | `manageEmulator()`    | `emulator-manager-cli.js` | Full em-cli surface (list/detail/modify/reset/create-image) |
| 11  | `tizen-launch-emulator`  | `launchEmulator()`    | `emulator-manager-cli.js` | Launch an existing emulator VM (waits for sdb connect)    |
| 12  | `tizen-download-emulator-package` | `downloadEmulatorPackage()` | `download-emulator-package-cli.js` | Download/install the emulator package |
| 13  | `tizen-install-app`      | `installApp()`        | `project-manager-cli.js`  | Install .tpk/.wgt/.rpk/.rpm on device                     |
| 14  | `tizen-gdb-debug`        | `setupGdbDebug()`     | `gdb-debug-cli.js`        | Setup GDB remote debugging (Native)                       |
| 15  | `tizen-dotnet-debug`     | `setupDotnetDebug()`  | `dotnet-debug-cli.js`     | Setup netcoredbg debugging (.NET)                         |
| 16  | `tizen-webapp-debug`     | `setupWebappDebug()`  | `webapp-debug-cli.js`     | Setup RWI/CDP debugging (WebApp)                          |
| 17  | `tizen-screenshot`       | `captureScreenshot()` | `screenshot-cli.js`       | Capture device/emulator screenshot (automatic fallback)   |
| 18  | `tizen-tv-sdk-install`   | `installTvSdk()`      | `tv-sdk-install-cli.js`   | Install TV SDK extension package (TV-SAMSUNG-Public)      |
| 18a | `tizen-tv-sdk-install-from-zip` | `installTvSdkFromZip()` | `tv-sdk-install-from-zip-cli.js` | Install TV SDK extension (local ZIP, offline)          |
| 19  | `tizen-update-package`   | `updatePackage()`     | `update-package-cli.js`   | Update installed SDK packages                             |
| 20  | `tizen-sdb-helper`       | `runSdbCommand()`     | `sdb-helper-cli.js`       | Pick and run correct sdb command for device actions       |
| 21  | `tizen-file-transfer`    | `fileTransfer()`      | `file-transfer-cli.js`    | sdb push/pull file transfer (host↔device)                 |
| 22  | `tizen-remote-device`    | `scanRemoteDevices()` etc. | `remote-device-cli.js` | Network scan/connect/disconnect + remote device bookmarks |
| 23  | `tizen-sdk-install-custom-repo` | `installSdkFromRepo()` | `sdk-install-custom-repo-cli.js` | Install the SDK from a custom package repository URL      |
| 23a |                          | `validateRepoUrl()`   | `validate-repo-url-cli.js` | Validate a repository URL (`pkg_list_{OS}-{64,32}` must be served) |
| 24  | `tizen-playwright-test`  | `runPlaywrightTest()` | `playwright-test-cli.js`  | Run automated Playwright tests (WebApp, CDP attach)       |
| 24a |                          | `scaffoldPlaywrightTest()` | `playwright-test-cli.js` | Scaffold the test file + package.json                 |
| 25  | `tizen-platform-install` | `installPlatform()`  | `platform-install-cli.js` | Install Tizen platform package (`TIZEN-{version}`)     |
| 26  | `tizen-download-mobile-platform` | `downloadMobilePlatform()` | `download-mobile-platform-cli.js` | Install Tizen Mobile platform (`MOBILE-{version}`) + IOT-Headed |
| 27  | `tizen-install-rootstrap` | `installRootstrap()` | `install-rootstrap-cli.js` | Install custom rootstrap ZIP package (with security validation) |
| 28  | `tizen-dlog-analyzer`   | `startDlogAnalyzer()` etc. | `dlog-analyzer-cli.js` | Continuous dlog crash/exception collection & analysis (background) |

---

## Standard JSON Envelope

All skills return responses in Standard JSON Envelope format:

```json
{
  "command": "tizen-sdk <command>",
  "status": "success | failure",
  "duration_ms": 1234,
  "result": { ... },
  "warnings": ["optional warnings"],
  "errors": [{
    "error_code": "TIZEN_SDK_XXX_E001",
    "error_category": "error_category",
    "message": "Human-readable message",
    "suggested_fix": {
      "command": "suggested command or null",
      "auto_fixable": false
    }
  }]
}
```

For more details, see:

- [Envelope Usage Guide](envelope/ENVELOPE_USAGE_GUIDE.en.md)
- [Envelope Call Flow](envelope/ENVELOPE_CALL_FLOW.en.md)
- [Implementation Summary](envelope/ENVELOPE_IMPLEMENTATION_SUMMARY.en.md)

---

## Additional Information

### Version History

| Version | Date       | Changes                                                                                   |
| ------- | ---------- | ----------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-07-15 | Initial release with 11 skills                                                            |
| 0.1.0   | 2026-07-15 | Added tizen-tv-sdk-install skill                                                          |
| 0.1.0   | 2026-07-22 | Added tizen-sdk-init skill                                                                |
| 0.1.0   | 2026-07-23 | Added tizen-update-package skill                                                          |
| 0.1.0   | 2026-07-23 | Added tizen-sdb-helper skill                                                              |
| 0.1.0   | 2026-07-24 | Added tizen-file-transfer skill                                                           |
| 0.1.0   | 2026-07-28 | Added tizen-remote-device skill                                                           |
| 1.0.0   | 2026-07-30 | Separated tizen-screenshot from sdb-helper; improved fallback chain and emulator auto-detection |
| 1.0.0   | 2026-07-31 | Added tizen-certificate-manager skill                                                     |
| 1.0.0   | 2026-07-31 | Added tizen-create-emulator and tizen-launch-emulator skills                              |
| 1.0.0   | 2026-08-03 | Added tizen-download-emulator-package skill                                               |
| 1.0.0   | 2026-08-04 | Added tizen-sdk-install-custom-repo skill — install from a custom repository URL          |
| 1.0.0   | 2026-08-10 | Added tizen-webapp-debug skill                                                            |
| 1.0.0   | 2026-08-11 | Added tizen-playwright-test skill — automated Playwright testing of web apps             |
| 1.0.0   | 2026-08-13 | Added tizen-platform-install and tizen-download-mobile-platform skills                    |
| 1.0.0   | 2026-08-21 | Added tizen-install-rootstrap skill                                                       |
| 1.0.0   | 2026-08-26 | Added tizen-dlog-analyzer skill — AI-powered dlog crash/exception analysis (28 skills total) |
| 1.1.0   | 2026-09-08 | Added tizen-tv-sdk-install-from-zip skill — offline TV SDK install from local ZIP (29 skills total) |

### Related Resources

| Resource                     | Link                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| Tizen Official Documentation | https://docs.tizen.org/                                    |
| Tizen SDK Download           | https://developer.tizen.org/development/tizen-sdk/download |
| Node.js Download             | https://nodejs.org/                                        |
| GDB Documentation            | https://sourceware.org/gdb/documentation/                  |

### Related Documents

| Document                                                                                               | Content                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| [README.en.md](README.en.md)                                                                           | Overall overview and user manual     |
| [project/scenario-native-app-walkthrough.en.md](project/scenario-native-app-walkthrough.en.md)                         | First-time user walkthrough          |
| [debug/scenario-webapp-debug-walkthrough.en.md](debug/scenario-webapp-debug-walkthrough.en.md)         | Web app debugging (RWI/CDP) E2E scenario |
| [debug/scenario-native-debug-walkthrough.en.md](debug/scenario-native-debug-walkthrough.en.md)         | Native app debugging (GDB) E2E scenario |
| [debug/scenario-dotnet-debug-walkthrough.en.md](debug/scenario-dotnet-debug-walkthrough.en.md)         | .NET app debugging (netcoredbg) E2E scenario |
| [sdk-install/INSTALLATION_FLOW.en.md](sdk-install/INSTALLATION_FLOW.en.md)                             | SDK installation flow                |
| [sdk-install/AGENT_TO_INSTALLSDK_INTEGRATION.en.md](sdk-install/AGENT_TO_INSTALLSDK_INTEGRATION.en.md) | Agent-installSdk integration         |
| [envelope/](envelope/)                                                                                 | Standard JSON Envelope documentation |
