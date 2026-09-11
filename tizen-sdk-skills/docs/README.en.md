# Tizen SDK Skills

English | [한국어](README.md)

An **integrated Cline skill collection** that automates Tizen development environment setup, project creation, building, deployment, and debugging.

## 📚 Documentation Guide

This document (README) is the **overall overview and user manual** for the plugin. For detailed topics, see the subfolder documents.

| Document | Content |
|---|---|
| [project/scenario-native-app-walkthrough.en.md](project/scenario-native-app-walkthrough.en.md) | **First-time user walkthrough** — SDK install → emulator → app creation → build → install → debugging via natural language |

| [debug/scenario-webapp-debug-walkthrough.en.md](debug/scenario-webapp-debug-walkthrough.en.md) | **Web app debugging E2E scenario** — web app creation → build → install → RWI/CDP debugging → DevTools/Playwright connection + verification checklist |
| [debug/scenario-native-debug-walkthrough.en.md](debug/scenario-native-debug-walkthrough.en.md) | **Native app debugging E2E scenario** — native app creation → Debug build → install → gdbserver/port-forward setup → host GDB connection + verification checklist |
| [debug/scenario-dotnet-debug-walkthrough.en.md](debug/scenario-dotnet-debug-walkthrough.en.md) | **.NET app debugging E2E scenario** — .NET app creation → Debug build → install → netcoredbg DAP server setup → VS Code (F5) connection + verification checklist |
| [wsl/WSL_EMULATOR_GUIDE.en.md](wsl/WSL_EMULATOR_GUIDE.en.md) | **WSL emulator guide** — configuration for running the Tizen emulator on WSL2, profile selection (standard vs TV), Buxton permission troubleshooting, performance tuning |
| [envelope/](envelope/) | **Standard JSON Envelope** — response standardization layer: [Usage Guide](envelope/ENVELOPE_USAGE_GUIDE.md), [Call Flow](envelope/ENVELOPE_CALL_FLOW.md), [formatSdkInit Explained](envelope/FORMAT_SDK_INIT_EXPLAINED.md), [Implementation Summary](envelope/ENVELOPE_IMPLEMENTATION_SUMMARY.md) |
| [sdk-install/](sdk-install/) | **SDK Installation Flow** — [Full Flow](sdk-install/INSTALLATION_FLOW.md), [Agent-installSdk Integration](sdk-install/AGENT_TO_INSTALLSDK_INTEGRATION.md), [Installation Verification](sdk-install/SDK_INSTALLATION_VERIFICATION.md), [Custom Repository Install](sdk-install/CUSTOM_REPOSITORY_INSTALL.en.md), [.NET Environment Setup E2E](sdk-install/DOTNET_SETUP_E2E.en.md) |
| [SKILLS_COMMANDS_MAPPING.en.md](SKILLS_COMMANDS_MAPPING.en.md) | **Skill ↔ Command Mapping** — how the 29 skills map onto the 34 tizen-cli commands, and why the counts differ |

Implementation code is in [common/lib/](../common/lib/README.md).

---

## Overview

`tizen-sdk-skills` provides 29 automation skills for Tizen application development.

### 29 Core Skills

| Skill | Description | Use Case |
|-------|-------------|----------|
| **tizen-sdk-init** | Configure Tizen SDK installation path | Register manually installed SDK or non-default path |
| **tizen-sdk-install** | Auto-install Tizen SDK (with automatic Node.js + 15 GB disk space check) | Initial development environment setup |
| **tizen-sdk-install-custom-repo** | Install the SDK from a custom package repository URL (validated against `pkg_list_{OS}-{64,32}`) | Installing from an internal/team mirror or a specific SDK build |
| **tizen-check-node** | Verify Node.js is installed and on PATH | Pre-install Node.js verification (18+ required) |
| **tizen-check-disk-space** | Verify disk space before SDK installation | Pre-install disk space verification (15 GB threshold, home drive only) |
| **tizen-dotnet-setup** | .NET development environment setup | Verify .NET SDK and install Tizen workload |
| **tizen-create-project** | Interactive project creation tool | Create Native/DotNET/WebApp/Platform projects |
| **tizen-build-project** | Automated project build | Build Native/DotNET/WebApp/Platform (GBS) projects |
| **tizen-create-emulator** | Create a custom emulator VM via em-cli (user-selected screen size, default 1080) | Create/list/delete emulator VMs, TV profile support |
| **tizen-launch-emulator** | Launch an existing emulator VM (em-cli launch) | Boot an emulator and wait for sdb connection |
| **tizen-download-emulator-package** | Download and install the emulator package (TIZEN-{version}-Emulator) | Set up the emulator runtime after SDK installation |
| **tizen-platform-install** | Download and install a Tizen platform package (TIZEN-{version}) | Set up build/emulator support for a specific platform version |
| **tizen-download-mobile-platform** | Download and install the Tizen Mobile platform package (MOBILE-{version}) | Mobile-profile development, optional IOT-Headed extension |
| **tizen-install-rootstrap** | Install a custom rootstrap from a ZIP file into the SDK | Add rootstraps for non-standard devices/architectures |
| **tizen-device-manager** | Device/emulator management | Find connected devices (sdb), stop running emulators |
| **tizen-install-app** | Automated app package installation | Install .tpk/.wgt/.rpm on devices (optional launch after install) |
| **tizen-file-transfer** | File transfer via sdb push/pull | Copy files/directories between host and device |
| **tizen-remote-device** | Network remote device search/connect (scan of SDB port 26101) | Connect devices over Wi-Fi, manage remote device bookmarks |
| **tizen-screenshot** | Device/emulator screen capture (automatic fallback) | Save device, emulator, or TV screenshots as PNG |
| **tizen-sdb-helper** | Pick and run the right sdb command for a request | Single sdb actions: log capture, shell, port forward, reboot, etc. |
| **tizen-certificate-manager** | Manage Tizen certificates and signing profiles | Local self-signed + Samsung online-CA certificate generation/profile management |
| **tizen-gdb-debug** | Automated GDB remote debugging | Debug Native apps |
| **tizen-dotnet-debug** | .NET remote debugging | Debug C# apps (netcoredbg) |
| **tizen-webapp-debug** | Web app remote debugging (RWI/CDP) | Connect Chrome DevTools/Playwright to .wgt apps |
| **tizen-dlog-analyzer** | Collect device dlog and analyse crashes/exceptions automatically | Root-cause detection for app crashes, background log monitoring |
| **tizen-playwright-test** | Automated Playwright testing for web apps (CDP) | Run and scaffold E2E/UI tests for .wgt apps |
| **tizen-tv-sdk-install** | Install TV SDK extension (TV-SAMSUNG-Public) | TV app development |
| **tizen-tv-sdk-install-from-zip** | Install TV SDK extension from local ZIP (offline) | Offline TV app development |
| **tizen-update-package** | Update Tizen SDK packages | Check for and install newer versions of installed packages |


---

## Installation

### Integrated Setup Script

**Windows (PowerShell):**
```powershell
.\cline\setup\setup.ps1
```

**Linux/macOS:**
```bash
bash cline/setup/setup.sh
```

This script performs:
1. Plugin cache sync (repo → `~/.cline/plugins/cache/`)
2. Personal copy sync (cache → `~/.cline/skills/`, `~/.cline/agents/`)
3. Cline skill installation (repo skills → `~/.cline/skills/`)
4. Cline hook installation (PreToolUse adapter → `~/Documents/Cline/Hooks/`)
5. Cline guard rule installation (Windows fallback → `~/Documents/Cline/Rules/`)

After installation, **restart the Cline session** to load new skill definitions.

---

## Quick Start Scenarios

> 📘 Step-by-step walkthrough for first-time users: [project/scenario-native-app-walkthrough.en.md](project/scenario-native-app-walkthrough.en.md)

> (SDK install → emulator → native template app creation → build → install → debugging via natural language prompts)

### Scenario 1: Full New Setup (End to End)

Just speak natural language to Cline:

```
Step 1: "Install the Tizen SDK"
Step 2: "Find a device or emulator"
Step 3: (For DotNET projects) "Set up the .NET development environment"
Step 4: "Create a new Tizen project"
Step 5: "Build the project"
Step 6: "Install the app"
Step 7: "Start debugging the app"
```

### Scenario 2: App Development & Debugging on Existing SDK Environment

```
"Create a new Tizen project"
"Build in Release mode"
"Install the app and start debugging"
```

### Scenario 3: Quick Debugging Only

```
"Start debugging com.example.app. The binary is at ./build/app"
```

---

## Skill Usage

In Cline, skills are automatically loaded when you make natural language requests. You can also explicitly invoke them using the `use_skill` tool.

### Natural Language Trigger Examples

| User Input | Loaded Skill |
|---|---|
| "Set the SDK path" / "Initialize SDK" | `tizen-sdk-init` |
| "Install the Tizen SDK" | `tizen-sdk-install` |
| "Install the SDK from this URL" / "Install from our internal mirror" | `tizen-sdk-install-custom-repo` |
| "Check if Node.js is installed" | `tizen-check-node` |
| "Check disk space" | `tizen-check-disk-space` |
| "Set up the .NET environment" | `tizen-dotnet-setup` |
| "Create a new Tizen project" | `tizen-create-project` |
| "Build the project" | `tizen-build-project` |
| "Create an emulator" / "Create a 1080 emulator" | `tizen-create-emulator` |
| "Start the emulator" / "Launch the emulator" | `tizen-launch-emulator` |
| "Download the emulator package" | `tizen-download-emulator-package` |
| "Find a device" / "Stop the emulator" | `tizen-device-manager` |
| "Install the app" / "Run the app" | `tizen-install-app` |
| "Copy this file to the device" / "Pull a file from the device" | `tizen-file-transfer` |
| "Find the TV on the network" / "Connect the remote device" | `tizen-remote-device` |
| "Take an emulator screenshot" / "Capture the Tizen screen" | `tizen-screenshot` |
| "Tail the logs" / "Open a device shell" / "Forward a port" | `tizen-sdb-helper` |
| "Create a certificate" / "Create a signing profile" | `tizen-certificate-manager` |
| "Start GDB debugging" | `tizen-gdb-debug` |
| "Debug the .NET app" | `tizen-dotnet-debug` |
| "Debug the web app" / "Connect via RWI" | `tizen-webapp-debug` |
| "Run the web app Playwright tests" | `tizen-playwright-test` |
| "Install the TV SDK" | `tizen-tv-sdk-install` |
| "Install TV SDK from ZIP" | `tizen-tv-sdk-install-from-zip` |
| "Update packages" | `tizen-update-package` |

---

## Skill Details

### 1. SDK Init (`tizen-sdk-init`)

Configures the Tizen SDK installation path by writing it to `~/.tizen.sdk.path.config`. Validates that the path exists and is readable/writable before saving.

#### Key Features

- Path validation (rejects empty or non-string paths)
- Existence check (verifies the SDK path exists on disk)
- Permission check (verifies read/write access)
- Config file write (`~/.tizen.sdk.path.config`)
- POSIX permissions (`0o600` on Linux/macOS; Windows skips chmod)

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/sdk-init-cli.js` | All OS (Node.js) |

---

### 2. Tizen SDK Install (`tizen-sdk-install`)

**Fully automatically** downloads and installs the Tizen SDK.

#### Key Features

- Auto-selects the latest Tizen platform version
- Recursively installs all dependencies
- Supports Linux/macOS/Windows (WSL2/PowerShell)
- Automatic PATH configuration
- **Automatic Node.js check** (18+ required) as the very first step — aborts with OS-specific install guide if not installed
- **Automatic 15 GB disk space check** on the user's home drive before installation — aborts with a clear error if insufficient


#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/sdk-install-cli.js` | All OS (Node.js) |

#### Scripts

| File | Platform |
|---|---|
| `scripts/tizen-sdk-install/tizen-sdk-install.sh` | Linux / macOS / WSL2 |
| `scripts/tizen-sdk-install/tizen-sdk-install.ps1` | Windows PowerShell |

Both scripts also accept `--repo-url <url>` / `-RepoUrl <url>` to install from a custom
package repository instead of the timezone-selected CDN mirror — see below.

---

### 2b. SDK Install from a Custom Repository (`tizen-sdk-install-custom-repo`)

Installs the SDK from a **user-supplied package repository URL** (internal mirror, build-server
output, local HTTP server) instead of the timezone-selected CDN mirror.

#### Key Features

- **URL validation before anything is downloaded** — the URL must serve
  `pkg_list_{OS}-64` or `pkg_list_{OS}-32` (OS = windows | ubuntu | macos); `-64` is probed
  first, so a 32-bit-only mirror works too
- Probes with HEAD, falling back to a 1-byte ranged GET for servers that reject HEAD
- Validation-only mode (no install) for "is this URL a valid repository?" questions
- Records the custom URL in `{SDK_PATH}/.package/repository.info`, so package updates and
  emulator package downloads use the same repository afterwards
- Warns explicitly when an SDK is already installed: nothing is re-downloaded, so `--force`
  is required to actually switch repositories

#### CLI Runners

| File | Platform |
|---|---|
| `lib/cli/sdk-install-custom-repo-cli.js` | All OS (Node.js) |
| `lib/cli/validate-repo-url-cli.js` | All OS (Node.js) — validation only |

#### Scripts

| File | Platform |
|---|---|
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh` | Linux / macOS / WSL2 |
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.ps1` | Windows PowerShell |

📘 Full details: [sdk-install/CUSTOM_REPOSITORY_INSTALL.en.md](sdk-install/CUSTOM_REPOSITORY_INSTALL.en.md)

---

### 3. Check Node.js (`tizen-check-node`)

Verifies that Node.js is installed and on PATH before SDK installation. Reports the Node.js interpreter that is running the runner itself (`process.version` / `process.execPath`) — the runner being alive is the proof Node is installed — and, best-effort, whether `node` resolves on the PATH of spawned shells (`where node` / `which node`; a miss is only a warning, issue #71).

#### Key Features

- Checks if Node.js is installed and accessible on PATH
- Requires Node.js 18+ (warns if older, but does not abort)
- Returns Standard JSON Envelope with version, path, and major version
- If not installed: returns error with OS-specific install guide (Windows: `winget install OpenJS.NodeJS.LTS`, macOS: `brew install node`, Linux: `sudo apt install -y nodejs npm`)
- Download URL: https://nodejs.org/

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/check-node-cli.js` | All OS (Node.js) |

---

### 4. Check Disk Space (`tizen-check-disk-space`)


Verifies available disk space on the user's home drive before SDK installation. Uses `fs.statfsSync()` (Node.js 18+) with `child_process` fallback chain (Windows: PowerShell `Get-PSDrive` → `fsutil volume diskfree` → legacy `wmic`; Linux/macOS: `df -Pk`). If no probe can measure the drive the check reports `source: "unknown"` with a warning instead of blocking the install (issue #69).

#### Key Features

- Checks the drive containing the user's home directory only
- Default threshold: 15 GB (Tizen SDK minimum)
- Returns Standard JSON Envelope with total/free/used space details
- If insufficient: reports current free space, required space, and deficit

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/check-disk-space-cli.js` | All OS (Node.js) |

---

### 5. .NET Setup (`tizen-dotnet-setup`)


Sets up the **.NET development environment** required for Tizen DotNET project development. Checks if .NET SDK is installed, and if so, installs the Tizen .NET workload.

#### Automated Steps

1. Check if .NET SDK (`dotnet`) is installed
2. **If not installed** → Provide OS-specific installation guide + download link, then exit
3. **If installed** → Install Tizen workload
   - Prioritize Samsung official script (`workload-install`), fall back to `dotnet workload install tizen` on failure
   - Linux/macOS retries with `sudo` if permissions are needed
4. Verify installation result (`dotnet workload list`)

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/dotnet-setup-cli.js` | All OS (Node.js) |

---

### 6. Create Project (`tizen-create-project`)

Creates Tizen projects from templates for 5 project types via an **interactive UI**.

#### Supported Project Types

1. **Native (C/C++)** — When native performance is needed
2. **DotNET (C#)** — When using C# and NUI framework
3. **WebApp** — HTML/CSS/JavaScript based apps
4. **TV** — Samsung TV web apps
5. **Platform** — GBS-buildable platform sample apps (e.g., `dali_demo`)

#### Key Options

- `--force` — Replace the target folder if it already exists. Only replaces an
  empty folder or one identified as a Tizen project — never an arbitrary directory.
- `delete` action (`project-delete` command) — Deletes a project directory on the
  SDK host. Refuses any path without a Tizen project marker. On a remote MCP
  client, `rm -rf` deletes a client-local path (a silent no-op), so always use
  this command instead.

#### CLI Runners

| File | Platform |
|---|---|
| `lib/cli/project-manager-cli.js` | All OS (Node.js) |
| `lib/cli/project-manager-cli.js` | All OS (Node.js) — list templates |

---

### 7. Build Project (`tizen-build-project`)

**Automatically** builds Tizen projects. Auto-detects Native, DotNET, WebApp, or Platform (GBS) project types and runs the appropriate build command.

#### Automated Steps

1. Auto-detect project type (Native/DotNET/WebApp/Platform)
2. Select build configuration (Debug/Release)
3. Scan project path
4. Auto-execute build command (`tz build -b Debug -w <project>`)
5. Verify build results

#### Key Options

- `--clean` — Remove the previous build output on the SDK host (`Debug/`,
  `Release/`, `Test/`, plus `bin/`, `obj/` for DotNET) before building, forcing a
  full non-incremental rebuild. Incremental builds do not re-emit compiler
  warnings for unchanged files, so pipelines that need the complete warning list
  must pass this flag. Platform (GBS) builds map it to `gbs build --clean`.

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/project-manager-cli.js` | All OS (Node.js) |

---

### 8. Create Emulator (`tizen-create-emulator`)

Creates a **custom Tizen emulator VM** with a user-selected screen size via em-cli. Also supports listing platforms/templates/VMs and deleting VMs.

#### Key Features

- `create` — Create a VM. `--size` (1080, 720, 3840, or a full resolution like `1920x1080`) is required — omitting it fails with `user_input_required` so the user is asked which size they want
- `list-platform` / `list-template` / `list-vm` — List platforms, emulator templates (resolutions), and VMs
- `delete` — Delete a VM
- `--profile tizen|tv` (default `tizen`; `tv` requires the TV SDK extension), `--launch` (start the VM right after creation)

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/emulator-manager-cli.js` | All OS (Node.js) |

---

### 9. Launch Emulator (`tizen-launch-emulator`)

Launches an existing Tizen emulator VM via em-cli. If no VM name is given, launches the first VM from the list.

#### Automated Steps

1. Query the VM list (first VM is selected when `--vm-name` is omitted)
2. Launch the VM via em-cli
3. Wait for the sdb connection (`--timeout`, default 300 seconds, 1–540)

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/emulator-manager-cli.js` | All OS (Node.js) |

---

### 10. Download Emulator Package (`tizen-download-emulator-package`)

Downloads and installs the **emulator package** (`TIZEN-{platform_version}-Emulator`) from the Tizen package repository. Requires the Tizen SDK to be installed first.

#### Automated Steps

1. Verify the Tizen SDK is installed — abort if not
2. Check for an existing installation (`.emulator-package-installed` marker)
3. Download the package list from the mirror in `{SDK_PATH}/.package/repository.info` (falls back to the official repository if the file is missing)
4. Recursively download the emulator package and all its dependencies and merge them into the SDK root

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/download-emulator-package-cli.js` | All OS (Node.js) — pre-check (Phase 1) |

---

### 11. Device Manager (`tizen-device-manager`)

Finds connected Tizen devices via sdb, or stops running emulator VMs. Use `tizen-create-emulator` to **create** an emulator and `tizen-launch-emulator` to **launch** one.

#### Automated Steps

1. Search for connected devices via SDB (`sdb devices`)
2. Query device info (model, SDK version)
3. `--action stop` — Shut down running emulator VMs
4. `--profile tv` — Samsung TV emulator profile support

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/device-manager-cli.js` | All OS (Node.js) |

---

### 12. Install App (`tizen-install-app`)

**Automatically** installs Tizen app packages (.tpk, .wgt, .rpm) on a device or emulator. RPM packages produced by GBS (Platform) builds are also supported.

#### Automated Steps

1. Auto-detect device/emulator
2. Validate app package file
3. Execute package installation (`tz install -e <serial> -p <package>`)
4. Verify installation result, and launch the app when `--run` is given

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/project-manager-cli.js` | All OS (Node.js) |

---

### 13. File Transfer (`tizen-file-transfer`)

Transfers files and directories between the host and a device/emulator via sdb.

#### Key Features

- `push` (host→device) / `pull` (device→host)
- Auto-selects the single connected device when no serial is given
- `--with-utf8` — Handle UTF-8 encoded paths
- The result envelope includes `bytes_transferred` and `device_serial`

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/file-transfer-cli.js` | All OS (Node.js) |

---

### 14. Remote Device (`tizen-remote-device`)

Searches the local network for Tizen devices (TCP sweep of SDB port 26101), connects/disconnects them via sdb over the network instead of USB, and manages Tizen Studio Device Manager's bookmarked remote device list.

#### Key Features

- `scan` — Parallel TCP sweep of local /24 subnets (~3 seconds, works without the SDK)
- `connect` / `disconnect` — `sdb connect <ip>:<port>` connect/disconnect (with retry + `sdb devices` verification)
- `add` / `remove` / `edit` / `list-saved` — Manage Device Manager bookmarks

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/remote-device-cli.js` | All OS (Node.js) |

---

### 15. Screenshot (`tizen-screenshot`)

Captures the screen of a connected Tizen device/emulator/TV and saves it as a PNG. Tries multiple capture methods with automatic fallback, stopping at the first success.

#### Key Features

- Auto-detects emulators (serial starts with `emulator-`) and reorders the fallback chain per target
- Default output path: `./emulator_screenshot.png` (change with `--output`)

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/screenshot-cli.js` | All OS (Node.js) |

---

### 16. sdb Helper (`tizen-sdb-helper`)

Picks and runs the **exact sdb command** matching a single natural-language request — log capture, shell, port forwarding, root toggle, reboot, screen state, and more.

#### Key Features

- Intent-table matching + profile-specific variants (mobile/wearable/TV/IoT)
- Multi-device disambiguation (never auto-picks), command-line preview before running
- Confirmation gates on destructive actions (reboot, etc.)
- Named multi-step recipes like `install-and-launch` when explicitly requested

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/sdb-helper-cli.js` | All OS (Node.js) |

---

### 17. Certificate Manager (`tizen-certificate-manager`)

Manages Tizen certificates (local self-signed and Samsung online-CA) and signing profiles — generation, Samsung Account login, distributor selection, profile lifecycle, import, and inspection.

#### Key Features

- `generate-author` — Generate a local author certificate (`--name`, `--password` required)
- `generate-samsung-author` / `generate-samsung-distributor` — Issue Samsung online-CA certificates (Samsung Account login)
- `list-distributors`, `create-profile`, `list-profiles`, `set-active-profile`, `remove-profile` — Signing profile management
- `import-certificate`, `inspect-certificate` — Import/inspect certificates

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/cert-manager-cli.js` | All OS (Node.js) |

---

### 18. GDB Debug (`tizen-gdb-debug`)

**Automatically** performs remote GDB debugging of Tizen Native apps.

#### Automated Steps

1. Verify device SDB connection status
2. Auto-detect gdbserver on device
3. Auto-start the app with the specified App ID
4. Auto-lookup PID of the running app
5. Auto-bind gdbserver on device
6. Auto-forward TCP port via SDB
7. Auto-start host GDB and connect

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/gdb-debug-cli.js` | All OS (Node.js) — setup-only mode |

---

### 19. .NET Debug (`tizen-dotnet-debug`)

**Automatically** performs remote debugging of Tizen .NET apps (using netcoredbg).

#### Automated Steps

1. Verify device connection
2. On-demand netcoredbg installation
3. Start app and lookup PID
4. Generate VS Code DAP server or CLI attach command

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/dotnet-debug-cli.js` | All OS (Node.js) — setup-only mode |

---

### 20. WebApp Debug (`tizen-webapp-debug`)

**Automatically** performs remote debugging of Tizen Web apps (.wgt) via RWI (Remote Web Inspector)/CDP. Never use for Native/DotNET apps (use `tizen-gdb-debug` / `tizen-dotnet-debug` instead).

#### Automated Steps

1. Verify device connection
2. Launch the app in debug mode (`app_launcher -w`)
3. Forward the RWI port (default host port 9222)
4. Verify the CDP endpoint → return the CDP endpoint plus Playwright/DevTools connect snippets

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/webapp-debug-cli.js` | All OS (Node.js) — setup-only mode |

---

### 21. Playwright Test (`tizen-playwright-test`)

**Runs (or scaffolds)** Playwright tests against a Tizen Web app (.wgt) over CDP. Sets up debug mode + port forwarding via the webapp-debug flow, then executes `node <test-file>` in the test project and returns pass/fail in the envelope.

#### Key Features

- `--scaffold` — Generate `tizen-playwright.test.js` (+`package.json`) and exit (no device needed; overwrite with `--force`)
- `--no-setup` — Reuse an already-live CDP endpoint (skip the debug-mode relaunch + port forward)
- Playwright resolves from the **test project's** `node_modules` — never installed into the plugin

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/playwright-test-cli.js` | All OS (Node.js) |

---

### 22. TV SDK Install (`tizen-tv-sdk-install`)

Installs the **TV SDK extension** (TV-SAMSUNG-Public package) on top of an existing Tizen SDK installation. Requires the Tizen SDK to be installed first.

#### Automated Steps

1. Verify the Tizen SDK is installed — abort with an interactive prompt if not
2. Check for an existing installation (`.tv-sdk-installed` marker) — return success if already installed
3. Return the TV SDK install script command, then run it (Phase 2)

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/tv-sdk-install-cli.js` | All OS (Node.js) — pre-check (Phase 1) |

---

### 23. Update Package (`tizen-update-package`)

Checks for and installs available updates for installed Tizen SDK packages.

#### Automated Steps

1. Verify the Tizen SDK is installed — abort if not
2. Download the latest package list (`pkg_list_{OS}-{32,64}`) from the mirror in `repository.info`
3. Compare versions with the installed manifests in `{SDK_PATH}/.package/`
4. Download newer versions and merge them into the SDK root, updating manifests (updated/skipped/failed/up-to-date summary)

#### CLI Runner

| File | Platform |
|---|---|
| `lib/cli/update-package-cli.js` | All OS (Node.js) — pre-check (Phase 1) |

---

## Directory Structure

```
tizen-sdk-skills/
│
├── common/                             # Shared implementation (agents/skills/libraries/scripts)
│   ├── agents/                         # Agent definitions (.md)
│   │   ├── tizen-sdk-install.md
│   │   ├── tizen-create-project.md
│   │   ├── tizen-build-project.md
│   │   └── ...                         # Per-skill agent definitions
│   │
│   ├── skills/                         # Skill definitions (29 folders, each with SKILL.md)
│   │   ├── tizen-sdk-init/
│   │   ├── tizen-sdk-install/
│   │   ├── tizen-sdk-install-custom-repo/
│   │   ├── tizen-check-node/
│   │   ├── tizen-check-disk-space/
│   │   ├── tizen-dotnet-setup/
│   │   ├── tizen-create-project/
│   │   ├── tizen-build-project/
│   │   ├── tizen-create-emulator/
│   │   ├── tizen-launch-emulator/
│   │   ├── tizen-download-emulator-package/
│   │   ├── tizen-device-manager/
│   │   ├── tizen-install-app/
│   │   ├── tizen-file-transfer/
│   │   ├── tizen-remote-device/
│   │   ├── tizen-screenshot/
│   │   ├── tizen-sdb-helper/
│   │   ├── tizen-certificate-manager/
│   │   ├── tizen-gdb-debug/
│   │   ├── tizen-dotnet-debug/
│   │   ├── tizen-webapp-debug/
│   │   ├── tizen-playwright-test/
│   │   ├── tizen-tv-sdk-install/
│   │   ├── tizen-tv-sdk-install-from-zip/
│   │   └── tizen-update-package/
│   │
│   ├── lib/                            # CLI runners and shared libraries
│   │   ├── README.md                   # lib structure description
│   │   ├── cli/                        # Node.js CLI runners (called by skills)
│   │   │   ├── cli-runner.js           # Common runner framework
│   │   │   ├── sdk-init-cli.js
│   │   │   ├── sdk-install-cli.js
│   │   │   ├── sdk-install-custom-repo-cli.js
│   │   │   ├── validate-repo-url-cli.js
│   │   │   ├── sdk-repo-info-cli.js
│   │   │   ├── check-node-cli.js
│   │   │   ├── check-disk-space-cli.js
│   │   │   ├── dotnet-setup-cli.js
│   │   │   ├── project-manager-cli.js  # project create/templates/build/install/delete
│   │   │   ├── emulator-manager-cli.js # emulator VM create/launch/manage
│   │   │   ├── download-emulator-package-cli.js
│   │   │   ├── device-manager-cli.js
│   │   │   ├── file-transfer-cli.js
│   │   │   ├── remote-device-cli.js
│   │   │   ├── screenshot-cli.js
│   │   │   ├── sdb-helper-cli.js
│   │   │   ├── cert-manager-cli.js
│   │   │   ├── gdb-debug-cli.js
│   │   │   ├── dotnet-debug-cli.js
│   │   │   ├── webapp-debug-cli.js
│   │   │   ├── playwright-test-cli.js
│   │   │   ├── tv-sdk-install-cli.js
│   │   │   ├── tv-sdk-install-from-zip-cli.js
│   │   │   └── update-package-cli.js
│   │   ├── core/                       # Common core (sdk-commands.js, sdb.js, emulator.js, project.js, etc.)
│   │   ├── envelope/                   # Standard JSON Envelope
│   │   │   ├── envelope.js
│   │   │   ├── envelope-wrapper.js
│   │   │   └── response-formatter.js
│   │   └── tests/                      # Unit tests
│   │
│   ├── scripts/                        # Feature-specific execution scripts (PowerShell/Bash)
│   │   ├── T-CLI.md                    # T-CLI integrated tool description
│   │   ├── t-cli.ps1                   # Windows integrated CLI launcher
│   │   ├── t-cli.sh                    # Linux/macOS integrated CLI launcher
│   │   ├── lib/                        # Common libraries (common.sh, common.ps1)
│   │   ├── tizen-sdk-install/
│   │   ├── tizen-sdk-install-custom-repo/
│   │   ├── tizen-dotnet-setup/
│   │   ├── tizen-create-project/
│   │   │   └── templates/              # Native / DotNET / WebApp / Platform templates
│   │   ├── tizen-build-project/
│   │   ├── tizen-emulator-manager/
│   │   ├── tizen-download-emulator-package/
│   │   ├── tizen-device-manager/
│   │   ├── tizen-install-app/
│   │   ├── tizen-file-transfer/
│   │   ├── tizen-screenshot/
│   │   ├── tizen-gdb-debug/
│   │   ├── tizen-dotnet-debug/
│   │   ├── tizen-webapp-debug/
│   │   ├── tizen-tv-sdk-install/
│   │   ├── tizen-tv-sdk-install-from-zip/
│   │   └── tizen-update-package/
│   │
│   ├── hooks/                          # Hooks (Bash)
│   │   ├── hooks.json
│   │   ├── check-tizen-commands.sh     # Tizen command validation
│   │   ├── check-project-writes.sh     # Project file write validation
│   │   ├── check-skill-routing.sh      # Skill routing validation
│   │   └── hooks.test.sh
│   │
│   └── assets/
│       └── samsung-tv-ca/              # Samsung TV CA certificates
│
├── tizen-cli/                          # tizen-cli package (34 commands; CLI/MCP entry point)
│   ├── src/
│   │   ├── index.ts / commands.ts / doctor.ts / envelope-adapter.ts
│   │   ├── command-specs/              # Command specs (sdk, check, project, device, debug, test, certificate)
│   │   └── lib/
│   ├── skills/                         # Skill copies for tizen-cli
│   ├── plugin.json
│   └── package.json
│
├── common/setup/                       # ONE setup implementation for every harness
│   ├── setup.sh / setup.ps1            #   --harness <claude|cline|codex|gemini>
│   ├── setup-lib.sh / setup-lib.ps1    #   mirror copy, compare, version, guard-section helpers
│   └── hosts/<harness>.sh|.ps1         #   per-host paths, agent format, hooks/instructions
│
├── cline/                              # Cline integration
│   ├── setup/                          #   thin wrappers: setup.ps1, setup.sh, setup.bat
│   └── hooks/
│       ├── PreToolUse                  # Cline PreToolUse adapter
│       └── tizen-sdk-skills-guard.md   # Windows fallback guard rule (Korean)
│
├── claude/setup/                       # Claude Code — thin wrappers: setup.ps1, setup.sh, setup.bat
├── codex/setup/                        # OpenAI Codex CLI — thin wrappers
└── gemini/                             # Google Gemini CLI
    ├── setup/                          #   thin wrappers
    └── hooks/BeforeTool                #   Gemini BeforeTool adapter -> shared guards
```

Per-harness install details: [deployment/HARNESS_SETUP.en.md](deployment/HARNESS_SETUP.en.md).

---

## Troubleshooting

**"tz tool not found" error**

```
"Reinstall the Tizen SDK"
```
After installation, check environment variables:
```bash
echo $TIZEN_SDK_PATH    # Linux/macOS
echo %TIZEN_SDK_PATH%   # Windows
```

**When device is not connected**

```
"Check the device list"
```

**"No matching symbol" error during GDB debugging**

- Verify the binary was compiled with debug symbols (`-g` flag)
- Verify the binary and app version on the device match

---

## Usage Scenarios & Walkthroughs

> 📘 Unified guide with index, feature map, detailed summaries, and comparison table for 12 documents: [Usage Scenarios & Walkthrough Guide](../usage/usage.en.md)

## Related Resources

| Resource | Link |
|---|---|
| Tizen Official Documentation | https://docs.tizen.org/ |
| Tizen SDK Download | https://developer.tizen.org/development/tizen-sdk/download |
| GDB Official Documentation | https://sourceware.org/gdb/documentation/ |

---

## Version Information

**Plugin version**: `0.1.0`

All 29 skills are released at the same version. The version is specified in each skill folder's `SKILL.md`.



