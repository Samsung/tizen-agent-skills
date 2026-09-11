# Tizen SDK Skills — All-in-One Document

English | [한국어](TIZEN_SDK_SKILLS_ALL_IN_ONE.md)

> This document merges the three documents below into a single file. (Generated: 2026-09-10)
>
> 1. `docs/SKILLS_REFERENCE.en.md` — Skills Reference
> 2. `docs/SDK_COMMANDS_ARCHITECTURE.en.md` — Command Layer Architecture
> 3. `usage/usage.en.md` — Usage Scenarios & Walkthrough Guide
>
> If any source document changes, this file must be regenerated.

## Combined Table of Contents

| Part | Contents | Jump to |
|------|----------|---------|
| Part 1 | Reference for all 29 skills (parameters, CLI runners, response formats) | [Skills Reference](#tizen-sdk-skills--skills-reference) |
| Part 2 | Command layer architecture and call flow | [Command Architecture](#tizen-sdk-command-layer--architecture--call-flow) |
| Part 3 | End-to-end usage scenarios & walkthrough guide | [Usage Scenarios](#tizen-sdk-skills--usage-scenarios--walkthrough-guide) |

---

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

**Description:** Continuously collect and analyze Tizen device dlog to automatically detect crashes/exceptions. AI-powered root cause analysis and solution suggestions.

**Use Case:** Monitor a running app for crashes/exceptions, analyze dlog for root cause detection. Requires a running emulator or connected device.

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

**Workflow:**

1. **Start monitoring** (`start start-monitoring`) — launch background dlog collection/analysis before launching the app
2. **Launch the app** — with monitoring running, launch the app to capture startup logs
3. **Wait for user feedback** — if app works fine, `stop`; if there's an issue, `check` for analyzed output
4. **Check analyzed output** (`check`) — read crash/exception analysis and offer a solution
5. **Apply fix** → **rebuild** → **reinstall/relaunch** → **re-check** (`check`) — repeat until resolved
6. **Stop monitoring** (`stop`) — clean up the background process

**Action descriptions:**

| Action          | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `start`         | Launch the binary in background, capture output to a temp file     |
| `stop`          | Kill the running background process                                |
| `check`         | Read the temp file and return the latest analyzed output           |
| `status`        | Check if the background process is still running                   |
| `app-launch`    | Launch a Tizen app on the device via `sdb shell app_launcher -s`   |
| `app-terminate` | Terminate a running Tizen app via `sdb shell app_launcher -k`      |
| `dlog-collect`  | Start background dlog collection filtered by app PID (app must be running) |
| `stop-collect`  | Stop the background app dlog collection process                    |
| `error-analyze` | Analyze collected app logs for E/F priority errors with deduplication |

**Notes:** Only one instance at a time. If already running, `start` returns an `already_running` error. The background process survives even if the agent session ends — always `stop` (and `stop-collect`) when done. When the analysis is complete, the report is always rendered in both languages (English first, then Korean).

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

---

# Tizen SDK Command Layer — Architecture & Call Flow

> **Scope**: `common/lib/` — CLI runners (`*-cli.js`) → `sdk-commands.js` (entry point) → domain modules → `plugin-cache.js` → PowerShell/Bash scripts
> **Entry-point file**: `lib/core/sdk-commands.js` — the **single entry point (aggregator)** that re-exports the domain modules' public functions. The actual logic lives in the `lib/core/` domain modules.

---

## Overview

`sdk-commands.js` is the central entry point that most Tizen SDK agent skills pass through when executing SDK operations. It is never called directly by the user or agent — it is always invoked indirectly through CLI runners (`*-cli.js`).

The file itself is now a **domain-module re-export aggregator**. Business logic is split into per-domain modules, and existing call sites (CLI runners, tests, docs) keep getting the same functions via `require('../core/sdk-commands')`:

| Domain module | Responsibility |
|---|---|
| `core/sdk.js` | SDK init/status/install, TV SDK, platform/mobile-platform/rootstrap install, repository URL validation, package update |
| `core/project.js` | Project create/delete/build/template listing/app install |
| `core/device.js` | Device detection (start) / emulator VM shutdown (stop) |
| `core/emulator.js` | em-cli emulator VM create/boot/manage |
| `core/dotnet.js` | .NET development environment setup |
| `core/debug.js` | Native (GDB) / DotNET (netcoredbg) remote debugging setup |
| `core/webapp-debug.js` | Web app (wgt) RWI/CDP debugging setup |
| `core/playwright-test.js` | Web app Playwright test run/scaffold (CDP) |
| `core/preflight.js` | Node.js / disk space pre-flight checks |
| `core/screenshot.js`, `core/file-transfer.js`, `core/sdb-helper.js`, `core/remote-device.js` | Screenshot, sdb push/pull, sdb intent matching, remote devices |
| `core/certificate.js`, `core/samsung-cert.js` | Local certificates/signing profiles, Samsung online-CA certificates |
| `core/dlog-analyzer.js` | Background dlog monitoring (detached process spawn / PID & output-file management) |

---

## Call Flow (End-to-End Architecture)

```
User natural language request ("build the app")
    ↓
Cline skill routing (loads tizen-build-project skill)
    ↓
Agent executes CLI runner: node project-manager-cli.js build --project <path> --build-type Debug
    ↓
CLI runner (cli-runner.js + project-manager-cli.js)
    ↓
sdk-commands.js (re-export) → buildProject() in core/project.js   ← called here
    ↓
plugin-cache.js → execPluginScript() → PowerShell script execution
    ↓
scripts/tizen-build-project/tizen-build-project.ps1 (actual tz build/pack execution)
    ↓
Standard JSON Envelope returned → agent relays result to user
```

---

## CLI Runner → sdk-commands.js Function Mapping

Each CLI runner `require`s a specific function from `sdk-commands.js`:

| CLI Runner              | sdk-commands.js Function | Trigger Skill          |
| ----------------------- | ------------------------ | ---------------------- |
| `sdk-init-cli.js`       | `initSdk()`              | `tizen-sdk-init`       |
| `sdk-install-cli.js`    | `installSdk()`           | `tizen-sdk-install`    |
| `sdk-repo-info-cli.js`  | `getRepoInfo()`         | `tizen-sdk-install` (repo-info) |
| `sdk-install-custom-repo-cli.js` | `installSdkFromRepo()` | `tizen-sdk-install-custom-repo` |
| `validate-repo-url-cli.js` | `validateRepoUrl()`  | `tizen-sdk-install-custom-repo` |
| `tv-sdk-install-cli.js` | `installTvSdk()`         | `tizen-tv-sdk-install` |
| `tv-sdk-install-from-zip-cli.js` | `installTvSdkFromZip()` | `tizen-tv-sdk-install-from-zip` |
| `download-emulator-package-cli.js` | `downloadEmulatorPackage()` | `tizen-download-emulator-package` |
| `check-node-cli.js`     | `checkNode()`            | `tizen-check-node`     |
| `check-disk-space-cli.js` | `checkDiskSpace()`     | `tizen-check-disk-space` |
| `project-manager-cli.js` | `createProject()`        | `tizen-create-project` |
| `project-manager-cli.js` | `deleteProject()`        | `tizen-create-project` (delete action) |
| `project-manager-cli.js` | `listTemplates()`        | `tizen-create-project` |
| `project-manager-cli.js`  | `buildProject()`         | `tizen-build-project`  |
| `device-manager-cli.js` | `manageDevice()`         | `tizen-device-manager` |
| `emulator-manager-cli.js` | `manageEmulator()` / `createEmulator()` / `launchEmulator()` | `tizen-create-emulator`, `tizen-launch-emulator` |
| `project-manager-cli.js`    | `installApp()`           | `tizen-install-app`    |
| `dotnet-setup-cli.js`   | `setupDotnet()`          | `tizen-dotnet-setup`   |
| `gdb-debug-cli.js`      | `setupGdbDebug()`        | `tizen-gdb-debug`      |
| `dotnet-debug-cli.js`   | `setupDotnetDebug()`     | `tizen-dotnet-debug`   |
| `webapp-debug-cli.js`   | `setupWebappDebug()`     | `tizen-webapp-debug`   |
| `playwright-test-cli.js` | `runPlaywrightTest()` / `scaffoldPlaywrightTest()` | `tizen-playwright-test` |
| `sdb-helper-cli.js`     | `runSdbCommand()`        | `tizen-sdb-helper`     |
| `screenshot-cli.js`     | `captureScreenshot()`    | `tizen-screenshot`     |
| `file-transfer-cli.js`  | `fileTransfer()`         | `tizen-file-transfer`  |
| `remote-device-cli.js`  | `scanRemoteDevices()` + 7 more (connect/disconnect/list/add/remove/edit/list-saved) | `tizen-remote-device` |
| `cert-manager-cli.js`   | `generateAuthorCertificate()` + more (profiles/distributors/Samsung online CA) | `tizen-certificate-manager` |
| `update-package-cli.js` | `updatePackage()`        | `tizen-update-package` |
| `platform-install-cli.js` | `installPlatform()`    | `tizen-platform-install` |
| `download-mobile-platform-cli.js` | `downloadMobilePlatform()` | `tizen-download-mobile-platform` |
| `install-rootstrap-cli.js` | `installRootstrap()`  | `tizen-install-rootstrap` |
| `dlog-analyzer-cli.js`  | `startDlogAnalyzer()` / `stopDlogAnalyzer()` / `checkDlogAnalyzer()` / `statusDlogAnalyzer()` / `launchApp()` / `terminateApp()` / `collectAppLogs()` / `analyzeErrors()` | `tizen-dlog-analyzer` |

### Example: project-manager-cli.js

```js
const { buildProject } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

runCli("tizen-sdk-skills project build", () =>
  buildProject(projectPath, buildType || "Debug", signProfile, arch, clean),
);
```

---

## Core Responsibilities

> These responsibilities are implemented not by `sdk-commands.js` itself but by the **`lib/core/` domain modules** it re-exports (see the table in the Overview). In this section, "each function" refers to a function defined in a domain module — e.g., `buildProject()` in `core/project.js` — and each subsection names its owner.

### 1. Parameter Validation

**Owner:** each domain module (`core/project.js`, `core/device.js`, `core/debug.js`, etc. — the module the function lives in)

Each function validates inputs before executing any script:

- Path existence and readability checks
- Project type validation (`native`, `dotnet`, `webapp`, `tv`, `platform`)
- Build type validation (`Debug`, `Release`, `Test`)
- Shell-safe character filtering for device serials, VM names, app IDs
- Port range validation (1–65535)
- Timeout range validation (1–540 seconds)

Invalid parameters return a `formatError()` envelope immediately — no script is executed.

### 2. Script Path Resolution

**Owner:** `resolveScript()` / `findLatestVersionDir()` in `core/plugin-cache.js` — called by each domain module

Uses `resolveScript()` from `plugin-cache.js` to locate the appropriate `.ps1` (Windows) or `.sh` (Linux/macOS) script in the plugin cache:

```js
const resolved = resolveScript("tizen-build-project");
// resolved.scriptPath → ~/.cline/plugins/cache/.../scripts/tizen-build-project/tizen-build-project.ps1
```

For GDB and DotNET debug, the script base name differs from the group name, so `findLatestVersionDir()` is used directly to construct the path.

### 3. Script Execution

**Owner:** `execPluginScript()` in `core/plugin-cache.js` — invoked with options by each domain module

Uses `execPluginScript()` from `plugin-cache.js` to execute scripts synchronously:

- **Windows**: `powershell -ExecutionPolicy Bypass -File "<script>" <args>`
- **Linux/macOS**: `bash "<script>" <args>`

Key options:

- `captureViaTempFile: true` — Used when the script leaves long-lived child processes (emulator qemu, sdb server, gdbserver). Without this, `execSync` blocks forever because the child inherits the pipe write handle.

### 4. Output Parsing

**Owner:** each domain module (the module each function in the table below lives in)

Each function parses script stdout for success markers:

| Function             | Success Markers                                                    |
| -------------------- | ------------------------------------------------------------------ |
| `manageDevice()`     | `DEVICE_SERIAL=<serial>`                                           |
| `installApp()`       | `Device Serial:`, `Found app ID:`, `App launched successfully`     |
| `setupGdbDebug()`    | `GDB init file:`, `PowerShell:`, `Command Prompt:`, `App PID:`     |
| `setupDotnetDebug()` | `App PID:`, `PowerShell:`, `Command Prompt:`                       |
| `createProject()`    | Project folder existence check (more reliable than output parsing) |
| `buildProject()`     | `.tpk`/`.wgt` artifact file scan (newer than build start time)     |

### 5. Envelope Generation

**Owner:** `lib/envelope/response-formatter.js` + `lib/envelope/envelope.js` — each domain module hands over its result for wrapping

Results are wrapped in a **Standard JSON Envelope** using `response-formatter.js` and `envelope.js`:

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "C:\\...\\MyApp.wgt",
        "format": ".wgt",
        "size_bytes": 39305
      }
    ]
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 3948
}
```

### 6. Error Handling

**Owner:** each domain module + `core/output-summary.js` (`summarize*Output()` line extraction)

On failure, each function:

1. Captures combined stdout + stderr
2. Saves full output to a temp log file (for builds)
3. Extracts key warning/error lines (max 10) via `summarize*Output()` functions
4. Returns a `formatError()` envelope with:
   - Error code (`build_failed`, `device_not_found`, `io_error`, etc.)
   - Human-readable message
   - `suggested_fix` with a ready-to-run command (e.g., installer command for SDK install)
   - `duration_ms` from the recorded start time

---

## Exported Functions

```js
module.exports = {
  // SDK (core/sdk.js)
  initSdk, // SDK path configuration
  getSdkStatus, // SDK status query
  installSdk, // SDK install pre-check (Phase 1)
  installSdkFromRepo, // Install SDK from a custom repository URL
  validateRepoUrl, // Repository URL validation (pkg_list check)
  normalizeRepoUrl, // Repository URL normalization
  readInstalledRepository, // Read the repository URL recorded in repository.info
  installTvSdk, // TV SDK extension install (TV-SAMSUNG-Public)
  installTvSdkFromZip, // TV SDK extension install (local ZIP, offline)
  updatePackage, // Update installed SDK packages
  downloadEmulatorPackage, // Download the emulator package
  installPlatform, // Install the Tizen platform package (TIZEN-{version})
  downloadMobilePlatform, // Install the mobile platform (MOBILE-{version}) + IOT-Headed
  installRootstrap, // Install a custom rootstrap ZIP
  getRepoInfo, // Repository info query
  readSdkPath, // SDK path reader (config or default)
  checkSdkInstallStatus, // Local sdk.info check
  checkSdkInstallationViaScript, // Script check mode
  checkIfSdkAlreadyInstalled, // 3-stage install status check
  CONFIG_FILE, // ~/.tizen.sdk.path.config path
  DEFAULT_SDK_PATH, // ~/tizen-sdk (default SDK path)

  // Project (core/project.js)
  createProject, // Project creation (native/dotnet/webapp/tv/platform, supports force replace)
  deleteProject, // Delete a project directory on the SDK host (Tizen project marker check)
  buildProject, // Project build (tz build + tz pack, supports clean full rebuild)
  listTemplates, // Available template listing
  installApp, // App package installation (.tpk/.wgt/.rpk/.rpm)

  // Device / Emulator (core/device.js, core/emulator.js)
  manageDevice, // Device detection (start) / emulator VM shutdown (stop)
  manageEmulator, createEmulator, launchEmulator, // full em-cli surface

  // Debug / Test (core/debug.js, core/webapp-debug.js, core/playwright-test.js)
  setupGdbDebug, // GDB remote debug setup (setup-only)
  setupDotnetDebug, // DotNET remote debug setup (setup-only)
  setupWebappDebug, // WebApp RWI/CDP debug setup
  runPlaywrightTest, scaffoldPlaywrightTest, // Playwright over CDP

  // Preflight / Utilities (core/preflight.js and friends)
  setupDotnet, // .NET workload setup
  checkNode, checkDiskSpace, // pre-flight checks
  runSdbCommand, // sdb command selection/execution
  captureScreenshot, // device/emulator screenshot
  fileTransfer, // sdb push/pull file transfer

  // Remote devices (core/remote-device.js — network scan/connect/bookmarks)
  scanRemoteDevices, connectRemoteDevice, disconnectRemoteDevice,
  listRemoteDevices, addRemoteDeviceToList, removeRemoteDeviceFromList,
  editRemoteDeviceInList, listSavedRemoteDevices,

  // Certificates (core/certificate.js — local self-signed)
  generateAuthorCertificate, listDistributorCertificates,
  createSigningProfile, listSigningProfiles, setActiveSigningProfile,
  removeSigningProfile, setSigningProfileDistributor2, importCertificate,
  inspectCertificate, getCertificateSdkDataPath,

  // Certificates (core/samsung-cert.js — Samsung online CA)
  generateSamsungAuthorCertificate, generateSamsungDistributorCertificate,
  importSamsungCertificate, createSamsungProfile,
  cancelSamsungCertificateGeneration, getSamsungAccessToken,
  parseDuidList, importDuidsFromFile,
  acquireDuidFromDevice, acquireDuidsFromAllDevices,

  // dlog analyzer (core/dlog-analyzer.js — background dlog monitoring)
  startDlogAnalyzer, stopDlogAnalyzer, checkDlogAnalyzer, statusDlogAnalyzer,
};
```

---

## Key Design Decisions

### Setup-Only Mode for Debuggers

`setupGdbDebug()` and `setupDotnetDebug()` always run in **setup-only** mode (`-SetupOnly` / `-N`). Interactive debuggers (`(gdb)`, `ncdb>`) block the terminal, so the agent cannot launch them directly. Instead, the setup script:

1. Starts gdbserver / netcoredbg on the device
2. Sets up port forwarding
3. Generates a gdb init file or launch.json config
4. Prints a ready-to-paste command for the user's terminal
5. Exits — the debug server stays running for the user's session

### `captureViaTempFile` for Long-Lived Processes

Functions that invoke scripts leaving (or potentially leaving) background processes (`manageDevice`, `installApp`, `setupGdbDebug`, `setupDotnetDebug`, `setupDotnet`, `setupWebappDebug`, `fileTransfer`, plus the em-cli invocations in `core/emulator.js`) use `captureViaTempFile: true`. This redirects stdout to a temp file instead of a pipe, preventing `execSync` from blocking forever when a child process inherits the pipe handle.

### Build Artifact Detection

`buildProject()` does not parse build script output for success. Instead, it scans the project directory for `.tpk`/`.wgt` files newer than the build start time (`findBuildArtifacts()`). This is more reliable than parsing potentially thousands of lines of toolchain output.

### SDK Install: Two-Phase Design

`installSdk()` is a **pre-check only** (Phase 1). It does not install the SDK (a 10–15 minute job). Instead, it:

1. Checks if SDK is already installed (`sdk.info` marker)
2. If not installed, returns an error envelope with a `suggested_fix` containing the exact installer command
3. The agent runs this command with `run_in_background: true` (Phase 2)
4. After completion, the agent re-runs the pre-check to verify `sdk.info` exists

---

## Related Files

| File                                 | Role                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `lib/cli/cli-runner.js`              | Common runner framework: async execution → envelope output → exit code                   |
| `lib/cli/*-cli.js`                   | Per-skill CLI runners that parse argv and call sdk-commands.js                           |
| `lib/core/*.js` (domain modules)     | The actual business logic (sdk/project/device/emulator/debug/… — see the Overview table) |
| `lib/core/plugin-cache.js`           | Plugin cache path resolution and script execution (`execPluginScript`)                   |
| `lib/envelope/envelope.js`           | Standard JSON Envelope class                                                             |
| `lib/envelope/response-formatter.js` | Envelope formatting helpers (`formatSdkInit`, `formatProjectBuild`, `formatError`, etc.) |
| `scripts/tizen-*/`                   | Actual PowerShell/Bash scripts that invoke `tz`, `sdb`, `dotnet`, etc.                   |

---

## Related Documents

- [Intermediate Layer Introductions](SDK_LAYERS_OVERVIEW.en.md) — Why each layer is needed and why .ps1 is not called directly

---

# Tizen SDK Skills — Usage Scenarios & Walkthrough Guide

> A unified document for **end-to-end scenario walkthroughs** and **real-world usage examples** using the `tizen-sdk-skills` plugin.
> Each guide walks you through an entire workflow step by step, executable with natural language prompts alone.

---

## 📂 Document Index by Category

> The **Skill(s)** column lists only each document's core skills. For the full list of skills a document uses, see the **Detailed Summaries** below.

### 1. SDK Installation & Environment Setup

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 1 | [Custom Repository SDK Install](sdk-install/custom-repo-walkthrough.md) | Install the Tizen SDK from a custom repository URL (internal mirror, build-server output, team mirror) | `tizen-sdk-install-custom-repo` |
| 2 | [Custom Rootstrap Install](rootstrap/install-rootstrap-walkthrough.md) | Install a custom rootstrap package from a ZIP file into the SDK (add non-standard device/architecture support) | `tizen-install-rootstrap` |
| 3 | [.NET Environment Setup E2E](sdk-install/DOTNET_SETUP_E2E.en.md) | Install the .NET SDK and Tizen workload on Windows/Linux/macOS, and diagnose band mismatches and permission failures from `[DIAG]` | `tizen-dotnet-setup` |

### 2. Emulator Management

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 4 | [Emulator Manager E2E](emulator/emulator-manager-walkthrough.en.md) | Emulator package download → template listing → VM creation → boot → app testing full workflow | `tizen-create-emulator`, `tizen-launch-emulator` |
| 5 | [Running Emulator on WSL](wsl/WSL_EMULATOR_GUIDE.md) | Setup, troubleshooting, and recommended profiles for running the Tizen emulator on WSL2 | `tizen-launch-emulator` |

### 3. Project Creation & Build

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 6 | [Native App End-to-End](project/scenario-native-app-walkthrough.md) | SDK install → emulator → native template app creation → build → install → debugging full flow | `tizen-create-project`, `tizen-build-project` |
| 7 | [DALi Template Build E2E](figma2dali/dali-template-build-e2e.md) | DALi Platform app: prerequisites → project creation → GBS build → RPM install/run → screenshot capture | `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

### 4. Certificate Management

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 8 | [Certificate Manager End-to-End](certificate/certificate-manager-walkthrough.md) | Local Tizen certificate → Samsung online CA certificate → signing profile → use in build full workflow | `tizen-certificate-manager` |

### 5. Debugging

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 9 | [Web App Debugging (RWI/CDP)](debug/scenario-webapp-debug-walkthrough.md) | Web app (.wgt) remote debugging: RWI port forwarding → CDP endpoint → Chrome DevTools connection | `tizen-webapp-debug` |
| 10 | [Native App Debugging (GDB)](debug/scenario-native-debug-walkthrough.md) | Native app (.tpk, C/C++) remote debugging: gdbserver setup → port forwarding → host GDB connection | `tizen-gdb-debug` |
| 11 | [.NET App Debugging (netcoredbg)](debug/scenario-dotnet-debug-walkthrough.md) | .NET app (C#/NUI) remote debugging: netcoredbg DAP server → port forwarding → VS Code F5 connection | `tizen-dotnet-debug` |
| 12 | [DLog Analyzer E2E](debug/scenario-dlog-analyzer-walkthrough.en.md) | Background dlog monitoring → crash/exception analysis → root cause identification → fix → rebuild → verify full flow | `tizen-dlog-analyzer` |

### 6. Test Automation

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 13 | [Web App Playwright Test](test/scenario-playwright-test-walkthrough.md) | Web app (.wgt) Playwright automated testing: test scaffolding → CDP setup → test execution | `tizen-playwright-test` |

### 7. Real-World Usage

| # | Document | Description | Related Skills |
|---|----------|-------------|----------------|
| 14 | [Tetris App Development Conversation](../usage/TetrisApp/CONVERSATION_HISTORY.md) | Real development conversation from SDK install to WebApp Tetris game implementation, build, emulator install, and run | `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

---

## 🗺️ Full Feature Map

```
Tizen SDK Skills
├── SDK Installation / Package Management
│   ├── Standard CDN install ──────── tizen-sdk-install
│   ├── Custom repository install ──── tizen-sdk-install-custom-repo  ← [1]
│   ├── SDK path init ──────────────── tizen-sdk-init
│   ├── Platform package install ──── tizen-platform-install
│   ├── Mobile platform download ──── tizen-download-mobile-platform
│   ├── TV SDK extension install ──── tizen-tv-sdk-install           ← [4]
│   ├── TV SDK extension install (ZIP) ──── tizen-tv-sdk-install-from-zip
│   └── Package update ─────────────── tizen-update-package
│
├── Environment Setup
│   ├── .NET dev environment ──────── tizen-dotnet-setup            ← [3]
│   ├── Disk space check ──────────── tizen-check-disk-space
│   ├── Node.js check ─────────────── tizen-check-node
│   └── Custom rootstrap ──────────── tizen-install-rootstrap        ← [2]
│
├── Emulator
│   ├── Package download ──────────── tizen-download-emulator-package
│   ├── VM creation ────────────────── tizen-create-emulator           ← [4]
│   ├── VM boot ───────────────────── tizen-launch-emulator           ← [4], [5]
│   ├── Device management ─────────── tizen-device-manager
│   ├── Remote device ─────────────── tizen-remote-device
│   └── WSL guide ─────────────────── (doc)                           ← [5]
│
├── Project
│   ├── Project creation ──────────── tizen-create-project            ← [6], [7], [14]
│   ├── Project build ─────────────── tizen-build-project             ← [6], [7], [8], [14]
│   └── App install/run ───────────── tizen-install-app               ← [6], [7], [14]
│
├── Certificate
│   ├── Local cert generation ─────── tizen-certificate-manager       ← [8]
│   ├── Samsung certificate ───────── tizen-certificate-manager       ← [8]
│   └── Signing profile ───────────── tizen-certificate-manager       ← [8]
│
├── Debugging
│   ├── Web app (RWI/CDP) ─────────── tizen-webapp-debug              ← [9]
│   ├── Native (GDB) ──────────────── tizen-gdb-debug                 ← [10]
│   ├── .NET (netcoredbg) ─────────── tizen-dotnet-debug              ← [11]
│   └── DLog analysis ─────────────── tizen-dlog-analyzer             ← [12]
│
├── Testing
│   └── Playwright automation ─────── tizen-playwright-test           ← [13]
│
├── Utilities
│   ├── Screenshot ────────────────── tizen-screenshot                ← [7]
│   ├── File transfer ─────────────── tizen-file-transfer
│   └── sdb helper ─────────────────── tizen-sdb-helper
│
└── Real-World Usage
    └── Tetris app development ─────── (conversation)                 ← [14]
```

> The `[N]` in arrows (←) refers to the document number in the table above.

---

## 🚀 Quick Start: Choose Guide by Goal

| What you want to do | Read this document |
|---------------------|--------------------|
| Install the SDK from a custom repository | [Custom Repository Install](sdk-install/custom-repo-walkthrough.md) |
| Add a custom rootstrap | [Rootstrap Install](rootstrap/install-rootstrap-walkthrough.md) |
| Set up the .NET development environment | [.NET Setup E2E](sdk-install/DOTNET_SETUP_E2E.en.md) |
| Create and boot an emulator | [Emulator Manager E2E](emulator/emulator-manager-walkthrough.en.md) |
| Run the emulator on WSL | [WSL Emulator Guide](wsl/WSL_EMULATOR_GUIDE.md) |
| Build a native app from scratch | [Native App E2E](project/scenario-native-app-walkthrough.md) |
| Build a DALi Platform app | [DALi Template Build E2E](figma2dali/dali-template-build-e2e.md) |
| Create certificates and sign | [Certificate Manager E2E](certificate/certificate-manager-walkthrough.md) |
| Debug a web app | [Web App Debugging (RWI/CDP)](debug/scenario-webapp-debug-walkthrough.md) |
| Debug a native app | [Native App Debugging (GDB)](debug/scenario-native-debug-walkthrough.md) |
| Debug a .NET app | [.NET App Debugging (netcoredbg)](debug/scenario-dotnet-debug-walkthrough.md) |
| Analyze crashes via dlog | [DLog Analyzer E2E](debug/scenario-dlog-analyzer-walkthrough.en.md) |
| Run web app automated tests | [Playwright Test E2E](test/scenario-playwright-test-walkthrough.md) |
| See a real development example | [Tetris App Development](../usage/TetrisApp/CONVERSATION_HISTORY.md) |

---

## 📖 Detailed Summaries

### 1. Custom Repository SDK Install

**Document:** [custom-repo-walkthrough.md](sdk-install/custom-repo-walkthrough.md) · **Skill:** `tizen-sdk-install-custom-repo`

Guides you through installing the Tizen SDK from a **custom repository URL** (internal mirror, build-server output, team mirror, local HTTP server) instead of the default public CDN mirror. Consists of 5 steps: URL validation → pre-check → SDK install → verification → repository.info confirmation.

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Repository URL validation (read-only) | seconds |
| 2 | Install pre-check (URL, disk space, existing install) | seconds |
| 3 | Install SDK from custom URL (~121 packages) | 10–15 min |
| 4 | Installation verification | seconds |
| 5 | Confirm repository URL in repository.info | seconds |

**Key features:**
- **`--force` flag**: Required to switch repositories when an SDK is already installed
- **Auto-resume**: Re-running the same command resumes from where it left off after a failure
- **Downstream effect**: The custom repository URL is recorded in `repository.info`, so subsequent package updates and emulator package downloads use the same repository
- **Valid repository condition**: Must be a directory URL serving `pkg_list_{OS}-{64,32}` files

---

### 2. Custom Rootstrap Install

**Document:** [install-rootstrap-walkthrough.md](rootstrap/install-rootstrap-walkthrough.md) · **Skill:** `tizen-install-rootstrap`

Guides you through installing a custom rootstrap package from a ZIP file into the Tizen SDK. Used to add support for new device profiles, architectures, or platform versions not included in the standard SDK distribution.

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Install pre-check (ZIP validation, structure detection, duplicate check) | seconds |
| 2 | Install rootstrap from ZIP (extract → security check → copy to SDK) | 30–60 sec |
| 3 | Installation verification | seconds |

**Key features:**
- **Auto ZIP structure detection**: Recognizes `data/` or `tizen-studio/` layout automatically
- **XML metadata parsing**: Extracts profile, version, architecture, type (public/private), timestamp from filename
- **Security check**: Rejects path traversal (`..`), symlinks, absolute paths
- **Supported architectures**: x86, x86_64, ARM (32-bit), AArch64, RISC-V 64-bit
- **`--force` reinstall**: Required to reinstall an existing rootstrap

---

### 3. .NET Environment Setup E2E

**Document:** [DOTNET_SETUP_E2E.en.md](sdk-install/DOTNET_SETUP_E2E.en.md) · **Skill:** `tizen-dotnet-setup`

Covers installing the **.NET SDK plus the Tizen workload** on Windows, Linux and macOS. Every platform presents the same three methods in the same order — a natural-language agent request, a `tizen-cli` command, and manual setup — along with corporate-proxy configuration and Administrator/sudo requirements.

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Detect the .NET SDK (print guidance and stop if missing) | seconds |
| 2 | Download and run Samsung's workload-install script | 3–10 min |
| 3 | Verify the workload with the **same dotnet** it installed into | seconds |
| 4 | On failure, print `[DIAG]` diagnostics | seconds |

**Key features:**
- **Pinned install target**: Samsung's installer picks `DOTNET_ROOT` or `%ProgramFiles%\dotnet` on its own, so the runner pins it to the dotnet being verified with `-d` (issue #258)
- **Non-destructive env handling**: `DOTNET_ROOT` is overridden for that run only; your persisted value is untouched
- **Exit codes separate the causes**: `0` success · `1` install failed (incl. permissions) · `2` no SDK found · `3` registered into a different SDK band
- **`[DIAG]` diagnostics**: dotnet path/version/band, every SDK the installer handled, where the manifest landed, and whether permissions were the problem
- **No agent mis-diagnosis**: on a failure envelope the agent reports it as-is, with no extra probing and no `--force` retry

**Copy-paste prompt:**
```
Setup .NET development environment for Tizen
```

---

### 4. Emulator Manager E2E

**Document:** [emulator-manager-walkthrough.en.md](emulator/emulator-manager-walkthrough.en.md) · **Skills:** `tizen-download-emulator-package`, `tizen-create-emulator`, `tizen-launch-emulator`

Guides you through the complete Tizen emulator VM workflow: emulator package download → template/platform listing → VM creation → boot → sdb connection → app testing. Supports various screen sizes (1080, 720, 3840), hardware customization, TV profiles, and raw disk image creation.

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Download emulator package | 2–5 min |
| 2 | List available screen sizes (templates) | seconds |
| 3 | Create emulator VM | seconds |
| 4 | Boot emulator VM (cold boot) | 5–7 min |
| 5 | Verify sdb connection | seconds |
| 6 (optional) | Modify VM settings (screen size, RAM, GL accel, file sharing) | seconds |
| 7 (optional) | List and manage existing VMs | seconds |
| 8 | Install and test app | seconds–tens of seconds |

**Key features:**
- **Screen size options**: 1080 (recommended), 720 (fast boot), 3840 (4K TV)
- **Hardware customization**: RAM (512/768/1024MB), GL acceleration, CPU virtualization, file sharing, skin
- **TV emulator**: Requires TV SDK extension, HD3840 TV template (3840×1080 resolution)
- **Raw disk image**: Snapshot restore, pre-configured image reuse
- **Troubleshooting**: Boot failure diagnostics (LAUNCH_DIAG), Java/JNA errors, KVM missing, display issues

**E2E paths:**
- **Path 1 (Quick start)**: 1080p emulator → app test (~10–15 min)
- **Path 2 (TV)**: TV SDK install → 3840 TV emulator (~15–20 min)
- **Path 3 (Custom hardware)**: 720p, 1024MB RAM, no GL accel (~10–15 min)
- **Path 4 (One-step)**: Create and boot simultaneously (~10–15 min)

---

### 5. Running Emulator on WSL

**Document:** [WSL_EMULATOR_GUIDE.md](wsl/WSL_EMULATOR_GUIDE.md) · **Skill:** `tizen-launch-emulator`

Covers setup, troubleshooting, and recommended profiles for running the Tizen emulator on WSL2 (Windows Subsystem for Linux). Deeply analyzes the issue where the standard Tizen profile's home screen (Flutter app) crashes due to EGL config selection failure under nested virtualization constraints, and presents the TV profile as an alternative.

| Item | Details |
|------|---------|
| **Requirements** | Windows 11 21H2+, WSL2, `nestedVirtualization = true` in `.wslconfig` |
| **Standard Tizen profile** | Home screen (Flutter) crashes in EGL config selection loop → `/opt` disk exhaustion |
| **TV profile (recommended)** | No Flutter home screen → stable boot on WSL, lighter resources |
| **Auto-fix (built-in)** | WSL detection → crash loop stop → direct home screen launch → `/opt` recovery |
| **Root cause** | Flutter engine's `ChooseEGLConfiguration` failure (BUXTON error is a byproduct) |

**Recommendations:**
- **Need home screen UI** → TV profile (only verified solution on WSL)
- **App dev/testing only** → Keep standard `tizen` profile, run directly via `app_launcher`
- **CI/automation** → TV profile (no manual intervention)
- **Plugin auto-fix** → Default behavior on WSL, stops retry loop + direct home screen launch

---

### 6. Native App End-to-End

**Document:** [scenario-native-app-walkthrough.md](project/scenario-native-app-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

Guides first-time users through the entire flow step by step: SDK install → emulator → native template app creation → build → install → debugging.

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Create and launch emulator | `tizen-device-manager` |
| 3 | Create native ServiceApp template app | `tizen-create-project` |
| 4 | Build app (`.tpk` packaging) | `tizen-build-project` |
| 5 | Install app | `tizen-install-app` |
| 6 | Debug app (GDB) | `tizen-gdb-debug` |

**Copy-paste prompts:**
```
1) Install the Tizen SDK
2) Create and launch an emulator
3) Create a native ServiceApp template app called MyApp
4) Build the app I just created
5) Install the built app
6) Debug the app I just installed
```

---

### 7. DALi Template Build E2E

**Document:** [dali-template-build-e2e.md](figma2dali/dali-template-build-e2e.md) · **Skills:** `tizen-create-project`, `tizen-build-project`, `tizen-device-manager`, `tizen-install-app`, `tizen-screenshot`

Guides you through the entire process of building a DALi Platform app using the `dali_demo` template: prerequisites → project creation → GBS build → RPM install/run → screenshot capture. Integrates figma2dali improvements including C++17 preflight early abort, build failure diagnostics, and enlightenment_info screenshot fallback.

| Step | Task | Skill | Est. Time |
|------|------|-------|-----------|
| 1 | List templates | `tizen-create-project` | ~5s |
| 2 | Create project (dali_demo template) | `tizen-create-project` | ~11s |
| 3 | GBS build (with C++17 preflight) | `tizen-build-project` | ~23s |
| 4 | Prepare device/emulator | `tizen-device-manager` | ~159s |
| 5 | RPM install and run | `tizen-install-app` | ~13s |
| 6 | Screenshot capture | `tizen-screenshot` | ~3s |

**Key features:**
- **GBS build**: Uses GBS (Git Build System) instead of `tz build`, 3-stage fallback (tizen-cli plugin → system gbs → error)
- **C++17 preflight**: If `dali2-*` dependencies exist without C++17 setting, aborts with exit 4 before GBS runs
- **Build failure diagnostics**: Actual compile errors are included directly in the response envelope on failure
- **RPM runtime**: Runs as `owner` user (uid 5001), Wayland/DBus environment variables auto-set
- **Re-run script**: `~/bin/run-<app>.sh` auto-generated on host at install time
- **Screenshot**: Captures 1920×1080 native resolution via `enlightenment_info -dump_screen`

---

### 8. Certificate Manager End-to-End

**Document:** [certificate-manager-walkthrough.md](certificate/certificate-manager-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-certificate-manager`, `tizen-build-project`

Guides you through the full workflow for Tizen certificates and Samsung online CA certificates: SDK install → local Tizen certificate → Samsung certificate → signing profile → use in build. Covers both certificate types (local Tizen self-signed and Samsung online CA-issued).

| Step | Task | Agent | Required |
|------|------|-------|----------|
| 1 | Install Tizen SDK | `tizen-sdk-install` | Yes |
| 2 | Generate local Tizen author certificate | `tizen-certificate-manager` | Yes |
| 2b (optional) | List bundled distributor certificates | `tizen-certificate-manager` | No |
| 3 | Create signing profile (local Tizen) | `tizen-certificate-manager` | Yes |
| 4 (optional) | Import or inspect certificate | `tizen-certificate-manager` | No |
| 5 (optional) | Generate Samsung author certificate | `tizen-certificate-manager` | For Samsung distribution |
| 6 (optional) | Collect device DUID | `tizen-certificate-manager` | For Samsung distribution |
| 7 (optional) | Generate Samsung distributor certificate | `tizen-certificate-manager` | For Samsung distribution |
| 8 (optional) | Create Samsung signing profile | `tizen-certificate-manager` | For Samsung distribution |
| 9 | Build with signing profile | `tizen-build-project` | Yes |

**E2E paths:**
- **Path 1 (Local only)**: SDK install → local cert → signing profile → build (~5–10 min)
- **Path 2 (Samsung)**: SDK install → Samsung author cert → DUID → Samsung distributor cert → Samsung profile → build (~15–20 min)
- **Path 3 (Hybrid)**: Maintain both local and Samsung profiles

**Key features:**
- **Password security**: Interactive masked input, never exposed in CLI args/logs
- **Samsung login**: One-time browser login, cached token auto-reused afterwards
- **Password storage**: Uses OS-level credential systems (Windows DPAPI, macOS Keychain, Linux libsecret)
- **Certificate reuse**: A single author certificate can be used across multiple signing profiles

---

### 9. Web App Debugging (RWI/CDP)

**Document:** [scenario-webapp-debug-walkthrough.md](debug/scenario-webapp-debug-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-webapp-debug`

Guides you through Tizen web app (.wgt) remote debugging in a single end-to-end flow. Web apps run in a web runtime (Chromium-based engine), so debugging uses RWI (Remote Web Inspector) + CDP (Chrome DevTools Protocol) instead of GDB/netcoredbg.

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Create and launch emulator | `tizen-device-manager` |
| 3 | Create web app BasicUI template | `tizen-create-project` |
| 4 | Build app (`.wgt` packaging) | `tizen-build-project` |
| 5 | Install app | `tizen-install-app` |
| 6 | Web app debugging setup (RWI/CDP) | `tizen-webapp-debug` |
| 7 | Connect with Chrome DevTools | (user) |

**Key features:**
- **Auto CDP setup**: `app_launcher -w` → RWI port parsing → `sdb forward` → CDP verification all automated
- **Port forwarding persistence**: Can reconnect anytime while the app is running
- **DevTools connection**: Real-time debugging via Elements/Console/Sources/Network panels
- **Error mapping**: No device, Native/.NET app ID misuse, port occupied, RWI unsupported image, etc.

---

### 10. Native App Debugging (GDB)

**Document:** [scenario-native-debug-walkthrough.md](debug/scenario-native-debug-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

Guides you through Tizen native app (.tpk, C/C++) remote debugging in a single end-to-end flow. Connects the device's `gdbserver` with the host's GDB via `sdb forward`.

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Create and launch emulator | `tizen-create-emulator` → `tizen-launch-emulator` |
| 3 | Create native ServiceApp template | `tizen-create-project` |
| 4 | Build with **Debug configuration** (`.tpk`) | `tizen-build-project` |
| 5 | Install app | `tizen-install-app` |
| 6 | GDB debugging setup (gdbserver + port forwarding + init file) | `tizen-gdb-debug` |
| 7 | Run GDB in host terminal | (user) |

**Debug modes:**

| Mode | Behavior | When to use |
|------|----------|-------------|
| **attach** (default) | App starts, then gdbserver attaches by PID | Catching callbacks called after app launch |
| **launch** | gdbserver directly runs the binary, stops at entry point | Catching `main`, `service_app_create` startup code |

**Key features:**
- **Debug build required**: Release binaries won't hit breakpoints
- **Auto SDK GDB selection**: Auto-finds the SDK-bundled GDB matching the device architecture (`uname -m`)
- **Auto GDB init file generation**: `file`/`target remote`/`break` performed automatically
- **Interactive GDB run by user**: Agent outputs commands only to avoid terminal lockup
- **`main` breakpoint**: Only hit in launch mode (already passed in attach mode)

---

### 11. .NET App Debugging (netcoredbg)

**Document:** [scenario-dotnet-debug-walkthrough.md](debug/scenario-dotnet-debug-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-dotnet-setup`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-dotnet-debug`

Guides you through Tizen .NET app (C#/NUI) remote debugging in a single end-to-end flow. .NET apps run on CoreCLR, so debugging uses netcoredbg as a DAP (Debug Adapter Protocol) server instead of GDB.

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Verify/install .NET SDK + Tizen workload | `tizen-dotnet-setup` |
| 3 | Create and launch emulator | `tizen-create-emulator` → `tizen-launch-emulator` |
| 4 | Create .NET NUI template app | `tizen-create-project` |
| 5 | Build with **Debug configuration** (`.tpk`) | `tizen-build-project` |
| 6 | Install app | `tizen-install-app` |
| 7 | .NET debugging setup (netcoredbg DAP server + port forwarding) | `tizen-dotnet-debug` |
| 8 | Connect via VS Code F5 | (user) |

**Debug modes:**

| Mode | Behavior | Pros/Cons |
|------|----------|-----------|
| **launch** (recommended) | App starts under netcoredbg DAP server, stops before `Main()` | Can catch startup code. Requires VS Code |
| **attach** | App starts, then netcoredbg CLI attaches by PID | Misses `Main()`. Frequent failures due to no CoreCLR debug transport on Tizen |

**Key features:**
- **Auto netcoredbg install**: Auto-deployed from SDK on-demand packages matching device architecture
- **Debug build required (most common failure)**: Without portable PDBs, breakpoints will never hit
- **VS Code connection**: Set `debugServer` port in `.vscode/launch.json` → F5 to connect to DAP server
- **App paused state**: Stays before `Main()` until DAP client attaches, can reconnect after disconnect

---

### 12. DLog Analyzer E2E

**Document:** [scenario-dlog-analyzer-walkthrough.en.md](debug/scenario-dlog-analyzer-walkthrough.en.md) · **Skills:** `tizen-launch-emulator`, `tizen-dlog-analyzer`, `tizen-build-project`, `tizen-install-app`

Guides you through the full flow of continuously collecting and analyzing dlog output from a Tizen device/emulator in the background: emulator launch → start background monitoring → app build/install/run → crash analysis → apply fix → rebuild/reinstall → verify → stop monitoring. The agent identifies the root cause of crashes/exceptions and applies fixes without you needing to manually parse raw dlog.

| Step | Task | Agent |
|------|------|-------|
| 1 | Launch emulator | `tizen-launch-emulator` |
| 2 | Start background dlog monitoring | `tizen-dlog-analyzer` |
| 3 | Build app (Debug) | `tizen-build-project` |
| 4 | Install and launch app | `tizen-install-app` |
| 5 | Ask user: fine or issue? | (agent interaction) |
| 6 | Check analyzed logs (crash/exception data) | `tizen-dlog-analyzer` |
| 7 | Apply fix (source code edit) | (agent) |
| 8 | Rebuild app | `tizen-build-project` |
| 9 | Reinstall and relaunch app | `tizen-install-app` |
| 10 | Re-check logs to verify fix | `tizen-dlog-analyzer` |
| 11 | Stop monitoring (cleanup) | `tizen-dlog-analyzer` |

**Key features:**
- **Detached background process**: Monitoring runs as a detached background process that survives even if the agent session ends
- **Start monitoring before app launch**: Must start before launching the app to capture startup logs (initialization failures, early crashes)
- **Automatic crash analysis**: Identifies crash dump signatures, exception stack traces, EGL/graphics failures, permission denied errors, memory allocation failures
- **Fix-rebuild-verify loop**: The fix → rebuild → reinstall → re-check cycle can repeat until the crash is resolved
- **Single instance only**: If already running, `start` returns an `already_running` error — stop first
- **Platform-specific binary**: The setup script copies only the matching platform (linux/macos/windows) binary

---

### 13. Web App Playwright Test

**Document:** [scenario-playwright-test-walkthrough.md](test/scenario-playwright-test-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-playwright-test`

Guides you through automated testing of Tizen web apps (.wgt) with Playwright. Playwright attaches to the device's web runtime via CDP (Chrome DevTools Protocol) to run tests. CDP setup internally reuses the `tizen-webapp-debug` flow.

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Create and launch emulator | `tizen-device-manager` |
| 3 | Create web app BasicUI template | `tizen-create-project` |
| 4 | Build app (`.wgt`) | `tizen-build-project` |
| 5 | Install app | `tizen-install-app` |
| 6 | Scaffold test file | `tizen-playwright-test` (`--scaffold`) |
| 7 | Install Playwright in test project | (user/agent) |
| 8 | Run test (CDP setup + node spawn) | `tizen-playwright-test` |

**Key features:**
- **attach-only pattern**: `connectOverCDP` → `contexts()[0].pages()[0]`, never calls `page.goto()`/`newPage()` (Tizen web runtime owns a single page)
- **Real exit code**: Failure count → `process.exit(1)` instead of `console.assert`, so the runner judges pass/fail
- **Scaffolded template**: `tizen-playwright.test.js` + `package.json` auto-generated
- **`--no-setup` re-run**: Re-run tests only without relaunching the app when it's still running
- **Failure screenshot**: `test-failure.png` auto-generated on assertion failure
- **Fixed test project path**: `~/tizen-playwright-test` (Windows: `%USERPROFILE%\tizen-playwright-test`)

---

### 14. Tetris App Development Conversation

**Document:** [CONVERSATION_HISTORY.md](../usage/TetrisApp/CONVERSATION_HISTORY.md) · **Related skills:** `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-device-manager`

A **real development conversation record** from SDK installation to WebApp Tetris game implementation, build, emulator install, and run. A real-world usage example of the `tizen-sdk-skills` plugin, documenting the natural language prompts entered by the user and their results at each step.

| Step | Task | Result |
|------|------|--------|
| 0 | Tizen SDK install (123 packages) | ✅ Success |
| 1–3 | Native ServiceApp project creation (MyServiceApp2) | ✅ Success |
| 4 | Native ServiceApp build | ✅ Success (`.tpk`) |
| 5–6 | Decision to switch to Tetris app with UI → WebApp project creation (TetrisApp) | ✅ Success |
| 7 | Tetris game implementation (HTML/CSS/JavaScript, ~500 lines) | ✅ Complete |
| 8 | TetrisApp build | ✅ Success (`TetrisApp.wgt`) |
| 9 | Emulator creation and launch (tizen-vm-default) | ✅ Success (emulator-26101) |
| 10 | App install | ✅ Success (App ID: YJgrMEIE3w.TetrisApp) |
| 11 | App launch | ✅ Success (PID 3560) |
| 12 | Project report generation | ✅ Complete |

**Key features:**
- **Real-world usage**: Complete workflow from SDK install to app run using only natural language prompts
- **App type switch**: Native ServiceApp → WebApp (switched because UI was needed)
- **Tetris game implementation**: 7 tetrominoes, collision detection, rotation, scoring, difficulty increase, Canvas rendering
- **Dark theme UI**: Neon blue accents, Flexbox layout, hover effects
- **Full source code included**: `index.html`, `css/style.css`, `js/main.js`

---

## 📊 Document Comparison Table

| # | Document | App Type | Key Skills | Est. Time |
|---|----------|----------|------------|-----------|
| 1 | Custom repo SDK install | — | `tizen-sdk-install-custom-repo` | 10–15 min |
| 2 | Custom rootstrap install | — | `tizen-install-rootstrap` | 1 min |
| 3 | .NET Environment Setup E2E | DotNET | `tizen-dotnet-setup` | 5–15 min |
| 4 | Emulator manager E2E | — | `tizen-create-emulator`, `tizen-launch-emulator` | 10–20 min |
| 5 | WSL emulator guide | — | `tizen-launch-emulator` | — |
| 6 | Native app E2E | Native (C/C++) | `tizen-create-project`, `tizen-build-project`, `tizen-gdb-debug` | — |
| 7 | DALi template build E2E | Platform (C++/DALi) | `tizen-create-project`, `tizen-build-project`, `tizen-screenshot` | ~4 min |
| 8 | Certificate manager E2E | — | `tizen-certificate-manager` | 5–20 min |
| 9 | Web app debugging | WebApp (.wgt) | `tizen-webapp-debug` | — |
| 10 | Native app debugging | Native (.tpk) | `tizen-gdb-debug` | — |
| 11 | .NET app debugging | DotNET (.tpk) | `tizen-dotnet-debug` | — |
| 12 | DLog analyzer E2E | All app types | `tizen-dlog-analyzer` | — |
| 13 | Playwright test | WebApp (.wgt) | `tizen-playwright-test` | — |
| 14 | Tetris app development | WebApp (.wgt) | `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project` | — |

---

## 📌 Related Documents

- [Agent Overview (README)](README.en.md)
- [Skills Reference](#tizen-sdk-skills--skills-reference)

---

*Last updated: 2026-09-02*
