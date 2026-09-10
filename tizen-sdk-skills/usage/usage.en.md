# Tizen SDK Skills — Usage Scenarios & Walkthrough Guide

> A unified document for **end-to-end scenario walkthroughs** and **real-world usage examples** using the `tizen-sdk-skills` plugin.
> Each guide walks you through an entire workflow step by step, executable with natural language prompts alone.

---

## 📂 Document Index by Category

> The **Skill(s)** column lists only each document's core skills. For the full list of skills a document uses, see the **Detailed Summaries** below.

### 1. SDK Installation & Environment Setup

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 1 | [Custom Repository SDK Install](../docs/sdk-install/custom-repo-walkthrough.md) | Install the Tizen SDK from a custom repository URL (internal mirror, build-server output, team mirror) | `tizen-sdk-install-custom-repo` |
| 2 | [Custom Rootstrap Install](../docs/rootstrap/install-rootstrap-walkthrough.md) | Install a custom rootstrap package from a ZIP file into the SDK (add non-standard device/architecture support) | `tizen-install-rootstrap` |
| 3 | [.NET Environment Setup E2E](../docs/sdk-install/DOTNET_SETUP_E2E.en.md) | Install the .NET SDK and Tizen workload on Windows/Linux/macOS, and diagnose band mismatches and permission failures from `[DIAG]` | `tizen-dotnet-setup` |

### 2. Emulator Management

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 4 | [Emulator Manager E2E](../docs/emulator/emulator-manager-walkthrough.en.md) | Emulator package download → template listing → VM creation → boot → app testing full workflow | `tizen-create-emulator`, `tizen-launch-emulator` |
| 5 | [Running Emulator on WSL](../docs/wsl/WSL_EMULATOR_GUIDE.md) | Setup, troubleshooting, and recommended profiles for running the Tizen emulator on WSL2 | `tizen-launch-emulator` |

### 3. Project Creation & Build

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 6 | [Native App End-to-End](../docs/project/scenario-native-app-walkthrough.md) | SDK install → emulator → native template app creation → build → install → debugging full flow | `tizen-create-project`, `tizen-build-project` |
| 7 | [DALi Template Build E2E](../docs/figma2dali/dali-template-build-e2e.md) | DALi Platform app: prerequisites → project creation → GBS build → RPM install/run → screenshot capture | `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

### 4. Certificate Management

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 8 | [Certificate Manager End-to-End](../docs/certificate/certificate-manager-walkthrough.md) | Local Tizen certificate → Samsung online CA certificate → signing profile → use in build full workflow | `tizen-certificate-manager` |

### 5. Debugging

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 9 | [Web App Debugging (RWI/CDP)](../docs/debug/scenario-webapp-debug-walkthrough.md) | Web app (.wgt) remote debugging: RWI port forwarding → CDP endpoint → Chrome DevTools connection | `tizen-webapp-debug` |
| 10 | [Native App Debugging (GDB)](../docs/debug/scenario-native-debug-walkthrough.md) | Native app (.tpk, C/C++) remote debugging: gdbserver setup → port forwarding → host GDB connection | `tizen-gdb-debug` |
| 11 | [.NET App Debugging (netcoredbg)](../docs/debug/scenario-dotnet-debug-walkthrough.md) | .NET app (C#/NUI) remote debugging: netcoredbg DAP server → port forwarding → VS Code F5 connection | `tizen-dotnet-debug` |
| 12 | [DLog Analyzer E2E](../docs/debug/scenario-dlog-analyzer-walkthrough.en.md) | Background dlog monitoring → crash/exception analysis → root cause identification → fix → rebuild → verify full flow | `tizen-dlog-analyzer` |

### 6. Test Automation

| # | Document | Description | Skill(s) |
|---|----------|-------------|----------|
| 13 | [Web App Playwright Test](../docs/test/scenario-playwright-test-walkthrough.md) | Web app (.wgt) Playwright automated testing: test scaffolding → CDP setup → test execution | `tizen-playwright-test` |

### 7. Real-World Usage

| # | Document | Description | Related Skills |
|---|----------|-------------|----------------|
| 14 | [Tetris App Development Conversation](./TetrisApp/CONVERSATION_HISTORY.md) | Real development conversation from SDK install to WebApp Tetris game implementation, build, emulator install, and run | `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

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
| Install the SDK from a custom repository | [Custom Repository Install](../docs/sdk-install/custom-repo-walkthrough.md) |
| Add a custom rootstrap | [Rootstrap Install](../docs/rootstrap/install-rootstrap-walkthrough.md) |
| Set up the .NET development environment | [.NET Setup E2E](../docs/sdk-install/DOTNET_SETUP_E2E.en.md) |
| Create and boot an emulator | [Emulator Manager E2E](../docs/emulator/emulator-manager-walkthrough.en.md) |
| Run the emulator on WSL | [WSL Emulator Guide](../docs/wsl/WSL_EMULATOR_GUIDE.md) |
| Build a native app from scratch | [Native App E2E](../docs/project/scenario-native-app-walkthrough.md) |
| Build a DALi Platform app | [DALi Template Build E2E](../docs/figma2dali/dali-template-build-e2e.md) |
| Create certificates and sign | [Certificate Manager E2E](../docs/certificate/certificate-manager-walkthrough.md) |
| Debug a web app | [Web App Debugging (RWI/CDP)](../docs/debug/scenario-webapp-debug-walkthrough.md) |
| Debug a native app | [Native App Debugging (GDB)](../docs/debug/scenario-native-debug-walkthrough.md) |
| Debug a .NET app | [.NET App Debugging (netcoredbg)](../docs/debug/scenario-dotnet-debug-walkthrough.md) |
| Analyze crashes via dlog | [DLog Analyzer E2E](../docs/debug/scenario-dlog-analyzer-walkthrough.en.md) |
| Run web app automated tests | [Playwright Test E2E](../docs/test/scenario-playwright-test-walkthrough.md) |
| See a real development example | [Tetris App Development](./TetrisApp/CONVERSATION_HISTORY.md) |

---

## 📖 Detailed Summaries

### 1. Custom Repository SDK Install

**Document:** [custom-repo-walkthrough.md](../docs/sdk-install/custom-repo-walkthrough.md) · **Skill:** `tizen-sdk-install-custom-repo`

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

**Document:** [install-rootstrap-walkthrough.md](../docs/rootstrap/install-rootstrap-walkthrough.md) · **Skill:** `tizen-install-rootstrap`

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

**Document:** [DOTNET_SETUP_E2E.en.md](../docs/sdk-install/DOTNET_SETUP_E2E.en.md) · **Skill:** `tizen-dotnet-setup`

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

**Document:** [emulator-manager-walkthrough.en.md](../docs/emulator/emulator-manager-walkthrough.en.md) · **Skills:** `tizen-download-emulator-package`, `tizen-create-emulator`, `tizen-launch-emulator`

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

**Document:** [WSL_EMULATOR_GUIDE.md](../docs/wsl/WSL_EMULATOR_GUIDE.md) · **Skill:** `tizen-launch-emulator`

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

**Document:** [scenario-native-app-walkthrough.md](../docs/project/scenario-native-app-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

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

**Document:** [dali-template-build-e2e.md](../docs/figma2dali/dali-template-build-e2e.md) · **Skills:** `tizen-create-project`, `tizen-build-project`, `tizen-device-manager`, `tizen-install-app`, `tizen-screenshot`

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

**Document:** [certificate-manager-walkthrough.md](../docs/certificate/certificate-manager-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-certificate-manager`, `tizen-build-project`

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

**Document:** [scenario-webapp-debug-walkthrough.md](../docs/debug/scenario-webapp-debug-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-webapp-debug`

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

**Document:** [scenario-native-debug-walkthrough.md](../docs/debug/scenario-native-debug-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

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

**Document:** [scenario-dotnet-debug-walkthrough.md](../docs/debug/scenario-dotnet-debug-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-dotnet-setup`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-dotnet-debug`

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

**Document:** [scenario-dlog-analyzer-walkthrough.en.md](../docs/debug/scenario-dlog-analyzer-walkthrough.en.md) · **Skills:** `tizen-launch-emulator`, `tizen-dlog-analyzer`, `tizen-build-project`, `tizen-install-app`

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

**Document:** [scenario-playwright-test-walkthrough.md](../docs/test/scenario-playwright-test-walkthrough.md) · **Skills:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-playwright-test`

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

**Document:** [CONVERSATION_HISTORY.md](./TetrisApp/CONVERSATION_HISTORY.md) · **Related skills:** `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-device-manager`

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

- [Agent Overview (README)](../docs/README.en.md)
- [Skills Reference](../docs/SKILLS_REFERENCE.en.md)

---

*Last updated: 2026-09-02*
