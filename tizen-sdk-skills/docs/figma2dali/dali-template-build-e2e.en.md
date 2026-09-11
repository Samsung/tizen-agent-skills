# DALi Template Build End-to-End Guide

English | [한국어](dali-template-build-e2e.md)

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-08-25  
**License:** Apache License 2.0 ([LICENSE](../../LICENSE))

---

## Overview

This document walks through the complete process of building a DALi Platform app using the `dali_demo` template — from **prerequisites → project creation → GBS build → RPM install/run → screenshot capture** — in a single guide.

> For detailed information on GBS builds themselves, see [Platform App GBS Build Guide](../platform-gbs-build.en.md).

This guide reflects the latest workflow incorporating improvements from the figma2dali work:

| Improvement | Related Document | Effect |
|------------|-------------------|--------|
| C++17 preflight blocking | [dali-cxx17-preflight.en.md](dali-cxx17-preflight.en.md) | Detects build failure before GBS runs (exit 4) |
| Build failure diagnostics | [build-failure-diagnostics.en.md](build-failure-diagnostics.en.md) | Actual compile errors included directly in the Envelope |
| enlightenment_info screenshot fallback | [screenshot-enlightenment-capture.en.md](screenshot-enlightenment-capture.en.md) | Native resolution capture on emulator |

---

## Prerequisites

### 1. GBS (Git Build System)

DALi Platform projects are built with **GBS**, not `tz build`. The build script resolves GBS via a 3-level fallback:

1. **tizen-cli GBS plugin** — if a GBS plugin is installed in tizen-cli, it is used
2. **System-installed `gbs`** — if `gbs` is on PATH, it is used directly
3. **Neither found** — error with installation guidance

```bash
# Ubuntu/Debian
sudo apt-get install gbs
```

### 2. Git Repository

GBS requires a **Git repository** to build. The build script automatically initializes one:

- If `.git` directory exists: proceed without action
- If `.git` directory does not exist: `git init` → `git add -A` → `git commit` automatically

### 3. .gbs.conf

A `.gbs.conf` file in the home directory is required for GBS builds. This file defines the Tizen platform repository profile that GBS uses.

### 4. Tizen Platform Development Packages

The `BuildRequires` packages specified in the project's `.spec` file must be available in the GBS build environment:

```
BuildRequires:  cmake
BuildRequires:  pkgconfig(dali2-core)
BuildRequires:  pkgconfig(dali2-adaptor)
BuildRequires:  pkgconfig(dali2-toolkit)
```

### 5. Device or Emulator

A Tizen device or emulator is required for RPM installation and execution. If no emulator is available, one is automatically created during the installation step.

---

## Full Workflow at a Glance

| Step | Task | Skill | Est. Duration |
|------|------|-------|---------------|
| 1 | List templates | `tizen-create-project` | ~5s |
| 2 | Create project | `tizen-create-project` | ~11s |
| 3 | GBS build | `tizen-build-project` | ~23s |
| 4 | Prepare device/emulator | `tizen-device-manager` | ~159s (including emulator boot) |
| 5 | Install and run RPM | `tizen-install-app` | ~13s |
| 6 | Capture screenshot | `tizen-screenshot` | ~3s |

---

## Step 1: List Templates

Check available Platform templates.

**tizen-cli command:**

```bash
tizen-cli tizen-sdk list-templates --type platform
```

**Natural language (Cline/Claude Code):**

```
Show me platform templates
```

**CLI runner direct execution:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" list-templates --type platform
```

**Response example:**

```json
{
  "status": "success",
  "result": {
    "templates": {
      "platform": ["dali_demo"]
    }
  },
  "command": "tizen-sdk list-templates",
  "duration_ms": 4739
}
```

---

## Step 2: Create Project

Create a new project using the `dali_demo` template.

**tizen-cli command:**

```bash
tizen-cli tizen-sdk create-project \
  --type platform \
  --template dali_demo \
  --parent-path /home/user/tizen-apps \
  --name dali-demo
```

| Option                | Required | Description                                                        |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `--type <type>`       | **yes**  | `platform`                                                         |
| `--template <name>`   | **yes**  | Template name from `list-templates` (e.g., `dali_demo`)            |
| `--parent-path <dir>` | **yes**  | Workspace (parent) directory — the app folder is created inside it |
| `--name <appName>`    | **yes**  | App name = folder name to create                                   |

**Natural language (Cline/Claude Code):**

```
Create a platform dali_demo template app called dali-demo
```

**CLI runner direct execution:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" create --type platform --template dali_demo --parent-path /home/user/tizen-apps --name dali-demo
```

**Response example:**

```json
{
  "status": "success",
  "result": {
    "project_name": "dali-demo",
    "project_type": "platform",
    "template_name": "dali_demo",
    "project_path": "/home/user/tizen-apps/dali-demo",
    "status": "created"
  },
  "command": "tizen-sdk create-project",
  "duration_ms": 11280
}
```

### Generated Project Structure

```
dali-demo/
├── CMakeLists.txt              # CMake build configuration (includes C++17)
├── tizen-manifest.xml          # Tizen package manifest
├── packaging/
│   └── dali-demo.spec          # RPM spec file (used by GBS)
├── src/
│   └── main.cpp                # DALi demo source code
└── shared/                     # Shared resources (optional)
```

> **Automatic template name substitution:** The `dali_demo` template's default name `dali-demo` is hardcoded in CMakeLists.txt, the `.spec` file, and other project files. If you specify a project name other than `dali-demo`, the creation script automatically substitutes the template name with your chosen project name. Example: `--name my-dali-app` → build artifact becomes `my-dali-app-1.0.0-1.x86_64.rpm`.

### C++17 Setting Verification

The `dali_demo` template includes C++17 by default, so it passes the preflight. The following two lines must be present in CMakeLists.txt before `add_executable()`:

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

> **Important:** You cannot work around C++17 with `gbs build --define "optflags -std=c++17"`. The spec's `%build` calls `cmake` directly without exporting `CXXFLAGS`, so rpm optflags never reach the compiler. You must set it in CMakeLists.txt. See [Blocking DALi C++17 Build Failures](dali-cxx17-preflight.en.md) for details.

---

## Step 3: GBS Build

Build the created project with GBS.

**tizen-cli command:**

```bash
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/dali-demo
```

| Option                | Required | Default  | Description                                 |
| --------------------- | -------- | -------- | ------------------------------------------- |
| `--project <path>`    | **yes**  | —        | Project root directory                      |
| `--build-type <type>` | no       | `Debug`  | `Debug` \| `Release` \| `Test`              |
| `--arch <arch>`       | no       | `x86_64` | `armv7l` \| `aarch64` \| `i586` \| `x86_64` |

**Natural language (Cline/Claude Code):**

```
Build the dali-demo project
```

**CLI runner direct execution:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" build --project "/home/user/tizen-apps/dali-demo" --build-type Debug
```

**Response example (success):**

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm",
        "format": ".rpm",
        "size_bytes": 11579
      },
      {
        "path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-debuginfo-1.0.0-1.x86_64.rpm",
        "format": ".rpm",
        "size_bytes": 94539
      }
    ],
    "build_time_ms": 22806
  },
  "command": "tizen-sdk build-project",
  "duration_ms": 22806
}
```

### Build Script Internal Flow

1. **Detect project type** — check for `tizen-manifest.xml` + `CMakeLists.txt` → Platform
2. **DALi C++17 preflight** — if a `dali2-*` dependency is present, verify C++17 is selected; **exit 4** if not
3. **Resolve GBS executable** — 3-level fallback (tizen-cli plugin → system gbs → error)
4. **Verify Git repository** — auto-initialize if `.git` is missing
5. **Run GBS build** — `gbs build -A <arch> --include-all`
6. **Search for artifacts** — look for `.rpm` files in project dir and `~/GBS-ROOT`
7. **Return result** — Standard JSON Envelope with build results

### Build Failure Diagnostics

When the build fails, the response Envelope includes **actual compiler errors directly**. You don't need to open a separate log file to identify the cause.

**Failure response example:**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_BUILD_E001",
      "error_category": "build_failed",
      "message": "Build failed (exit 1).\n\nBuild errors:\n  .../main.cpp:42:10: fatal error: dali/dali.h: No such file or directory\n  ...\n\nFull log: /tmp/tizen-build-1785717621350.log",
      "details": [
        ".../main.cpp:42:10: fatal error: dali/dali.h: No such file or directory",
        "make[2]: *** [CMakeFiles/dali-demo.dir/build.make:76: main.o] Error 1",
        "error: Bad exit status from /var/tmp/rpm-tmp.k3Jd91 (%build)",
        "gbs:error: Local build failed"
      ]
    }
  ]
}
```

> **Important:** Do **not** re-run the same build when it fails. If `errors[0].details` contains diagnostic information, use it to identify the root cause. Only check the `Full log:` file path when diagnostics are empty. See [Build Failure Diagnostics](build-failure-diagnostics.en.md) for details.

### Build Artifact Location

```
~/GBS-ROOT/local/repos/tizen/x86_64/RPMS/
├── dali-demo-1.0.0-1.x86_64.rpm              # Main package
├── dali-demo-debuginfo-1.0.0-1.x86_64.rpm     # Debug info
└── dali-demo-debugsource-1.0.0-1.x86_64.rpm   # Debug source

~/GBS-ROOT/local/repos/tizen/x86_64/SRPMS/
└── dali-demo-1.0.0-1.src.rpm                  # Source RPM
```

> The build artifact path is used in the next step: `~/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm`

---

## Step 4: Prepare Device/Emulator

Prepare a device or emulator to install the app on.

**tizen-cli command:**

```bash
tizen-cli tizen-sdk device-manager
```

**Natural language (Cline/Claude Code):**

```
Connect a device
```

**CLI runner direct execution:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/device-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/device-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

**Response example:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "emulator_launched": true,
    "status": "connected"
  },
  "command": "tizen-sdk device-manager",
  "duration_ms": 159000
}
```

> If no emulator is available, one is automatically created and launched.

---

## Step 5: Install and Run RPM

Install the built RPM package on the device and launch it.

**tizen-cli command:**

```bash
tizen-cli tizen-sdk install-app \
  --package /home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm \
  --run
```

| Option             | Required | Description                   |
| ------------------ | -------- | ----------------------------- |
| `--package <path>` | **yes**  | RPM package file path         |
| `--run`            | no       | Launch app after installation |

**Natural language (Cline/Claude Code):**

```
Install and run the dali-demo RPM on the emulator
```

**CLI runner direct execution:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" install --package "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm" --device-serial emulator-26101 --run
```

**Response example:**

```json
{
  "status": "success",
  "result": {
    "package_path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm",
    "device_serial": "emulator-26101",
    "app_id": null,
    "installation_status": "completed",
    "app_launched": true
  },
  "command": "tizen-sdk install-app",
  "duration_ms": 13000
}
```

> `app_id` being `null` is expected — Platform (RPM) apps are not registered with `app_launcher`, so they have no app_id. Instead, they are launched directly via the `/usr/bin/dali-demo` binary.

### RPM App Launch Environment

RPM platform apps are launched via `sdb shell` **as user `owner` (uid 5001)**. The following environment variables are automatically set:

| Environment Variable       | Value                          | Description                 |
| -------------------------- | ------------------------------ | --------------------------- |
| `WAYLAND_DISPLAY`          | `wayland-0`                    | Wayland display socket name |
| `XDG_RUNTIME_DIR`          | `/run/user/5001`               | XDG runtime directory       |
| `ELM_ENGINE`               | `wayland_egl`                  | EFL rendering engine        |
| `DBUS_SESSION_BUS_ADDRESS` | `unix:path=/run/user/5001/bus` | DBus session bus address    |

`setsid` is used to detach the app process into a new session, ensuring it survives after `sdb shell` exits. After launch, the script polls `pgrep` (1-second intervals, up to 5 attempts) to verify the process is running, and app output is redirected to `/tmp/dali-demo.log`.

### App Re-launch

Platform apps have no `app_launcher` icon, so after the app is killed there is no way to restart it from the device home screen. A host-side rerun script is automatically generated during installation:

```bash
# Re-launch the app (no RPM re-install needed)
~/bin/run-dali-demo.sh
```

---

## Step 6: Capture Screenshot

Capture a screenshot of the running app.

**tizen-cli command:**

```bash
tizen-cli tizen-sdk screenshot
```

You can also specify a target device and output path:

```bash
tizen-cli tizen-sdk screenshot --serial emulator-26101 --output ./dali-demo-screenshot.png
```

**Natural language (Cline/Claude Code):**

```
Take a screenshot of the emulator
```

**CLI runner direct execution:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/screenshot-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/screenshot-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"                              # Auto-select device, default output path
node "$CLI" emulator-26101               # Specify device
node "$CLI" emulator-26101 ./dali-demo-screenshot.png  # Specify output path
```

| Argument | Required | Default                     | Description          |
| -------- | -------- | --------------------------- | -------------------- |
| `serial` | no       | Auto-select (single device) | sdb device serial    |
| `output` | no       | `./emulator_screenshot.png` | Output PNG file path |

> There is no option to specify the capture method. The fallback chain auto-selects, and the result is visible in `capture_method`. On the emulator, `enlightenment_info -dump_screen` is selected first, capturing at 1920×1080 native resolution. See [Screenshot enlightenment_info Fallback](screenshot-enlightenment-capture.en.md) for details.

**Response example:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "screenshot_path": "/home/user/tizen-apps/emulator_screenshot.png",
    "capture_method": "enlightenment_info -dump_screen",
    "file_size_bytes": 1102917,
    "dimensions": "1920x1080",
    "image": {
      "path": "/home/user/tizen-apps/emulator_screenshot.png",
      "size_bytes": 1102917,
      "mime_type": "image/png",
      "width": 1920,
      "height": 1080,
      "base64_omitted_reason": "Image is 1077 KB, over the 512 KB inline limit."
    }
  },
  "command": "tizen-sdk screenshot",
  "duration_ms": 2500
}
```

---

## Full Workflow at a Glance

```bash
# 1. List templates
tizen-cli tizen-sdk list-templates --type platform

# 2. Create project
tizen-cli tizen-sdk create-project \
  --type platform --template dali_demo \
  --parent-path /home/user/tizen-apps --name dali-demo

# 3. GBS build
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/dali-demo

# 4. Prepare device/emulator
tizen-cli tizen-sdk device-manager

# 5. Install and run RPM
tizen-cli tizen-sdk install-app \
  --package ~/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm \
  --run

# 6. Capture screenshot
tizen-cli tizen-sdk screenshot
```

### Natural Language Quick Start

```
1) Show me platform templates
2) Create a platform dali_demo template app called dali-demo
3) Build the dali-demo project
4) Connect a device
5) Install and run the dali-demo RPM on the emulator
6) Take a screenshot of the emulator
```

---

## Troubleshooting

### C++17 Issues (exit 4)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Build aborted with `exit 4` before GBS | `dali2-*` dependency present but no C++17 setting | Add `set(CMAKE_CXX_STANDARD 17)` + `set(CMAKE_CXX_STANDARD_REQUIRED ON)` before `add_executable()` in CMakeLists.txt |
| `'string_view' in namespace 'std' does not name a type` | C++17 not selected. Tizen 9.0 dali2 headers use `std::string_view` / `std::any` | Same as above. `gbs --define optflags` cannot work around it |
| Preflight passed but same error | Standard is set but overridden on a sub-target | HINT is automatically appended to diagnostics — check CMakeLists.txt |

> See [Blocking DALi C++17 Build Failures](dali-cxx17-preflight.en.md) for details.

### Build Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `fatal error: dali/dali.h: No such file or directory` | `BuildRequires` packages not in GBS environment | Verify `pkgconfig(dali2-core)` etc. from `.spec` file are installed |
| `error: Bad exit status from /var/tmp/rpm-tmp.XXX (%build)` | Compilation error or missing dependencies | Check `details` array in the response. If empty: `cat ~/GBS-ROOT/local/repos/tizen/<arch>/logs/fail/<app-name>-<version>-1/log.txt` |
| `GBS is not available` | GBS not installed | `sudo apt-get install gbs` or check tizen-cli GBS plugin |
| `No local package repository for arch x86_64` | GBS local repo has no packages for the target arch | Verify `.gbs.conf` configuration and Tizen platform repository profile |

> Do **not** re-run the same build when it fails. Check the `details` array in the response Envelope first. See [Build Failure Diagnostics](build-failure-diagnostics.en.md) for details.

### RPM Launch Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| App process exits immediately | App launched as root cannot connect to `owner`'s Wayland/DBus sockets | Latest version auto-launches via `su - owner -c`. Check `app-log:` in `warnings` |
| Infinite eldbus connection errors | `DBUS_SESSION_BUS_ADDRESS` not set | Auto-set in latest version |
| Wayland display connection failure | `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR` not set | Auto-set in latest version |

> On launch failure, the envelope `warnings` include the last 20 lines of `/tmp/dali-demo.log` (prefixed `app-log:`).

### Screenshot Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `capture_method` shows `host-side xwd` | enlightenment_info could not get root access | Check if `sdb root on` is available. xwd results may have lower resolution |
| Screenshot shows only kernel console | Captured via `/dev/fb0` | Check `capture_method`. If `fb0`, it may not be the app screen |

---

## Verification Checklist

Verify that each step completed successfully:

- [ ] **Step 1:** Does `templates.platform` array include `dali_demo`?
- [ ] **Step 2:** Were `CMakeLists.txt`, `tizen-manifest.xml`, `packaging/*.spec` created in `project_path`?
- [ ] **Step 2:** Does CMakeLists.txt contain `CMAKE_CXX_STANDARD 17`?
- [ ] **Step 3:** Does `artifacts` array include `.rpm` files?
- [ ] **Step 3:** Is `build_time_ms` in a reasonable range? (~20-30s)
- [ ] **Step 4:** Is `device_serial` output and `status` set to `connected`?
- [ ] **Step 5:** Is `installation_status` set to `completed` and `app_launched` set to `true`?
- [ ] **Step 6:** Is `capture_method` set to `enlightenment_info -dump_screen` and resolution 1920×1080?

---

## Related Documents

- [Platform App GBS Build Guide](../platform-gbs-build.en.md)
- [Blocking DALi C++17 Build Failures](dali-cxx17-preflight.en.md)
- [Build Failure Diagnostics](build-failure-diagnostics.en.md)
- [Screenshot enlightenment_info Fallback](screenshot-enlightenment-capture.en.md)
- [DALi Demo End-to-End Guide (tizen-cli)](../tizen-cli/dali-demo-e2e-walkthrough.en.md)
- [Skills Reference](../SKILLS_REFERENCE.en.md)
