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
| `core/dlog-analyzer.js` | Background dlog monitoring (detached process spawn / PID & output-file management), app-specific log collection and error analysis |

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

  // dlog analyzer (core/dlog-analyzer.js — background dlog monitoring, app-specific log collection/error analysis)
  startDlogAnalyzer, stopDlogAnalyzer, checkDlogAnalyzer, statusDlogAnalyzer,
  launchApp, terminateApp, collectAppLogs, analyzeErrors,
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
- [Skill ↔ Command Mapping](SKILLS_COMMANDS_MAPPING.en.md) — How the 29 skills map onto the 34 commands (and why the counts differ)
