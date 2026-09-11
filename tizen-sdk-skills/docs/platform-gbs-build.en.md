# Platform App GBS Build Guide

English | [한국어](platform-gbs-build.md)

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-07-22  
**License:** Apache License 2.0 ([LICENSE](../LICENSE))

---

## Overview

This document describes how to build **Platform projects** using **GBS (Git Build System)** with the `tizen-sdk-skills` plugin. Unlike Native/DotNET/WebApp projects, Platform projects are built using GBS instead of `tz build`, and produce **`.rpm` packages** instead of `.tpk`/`.wgt`.

---

## What is a Platform Project?

A Platform project is a C/C++ project that is built as a Tizen platform package. Unlike regular Native apps, it is built into an RPM package via GBS and installed directly on the Tizen platform.

### Project Structure

```
my-platform-app/
├── CMakeLists.txt              # CMake build configuration
├── tizen-manifest.xml          # Tizen package manifest
├── packaging/
│   └── my-app.spec             # RPM spec file (used by GBS)
├── src/
│   └── main.cpp                # Source code
└── include/                    # Header files (optional)
```

### Detection Criteria

The build script auto-detects a Platform project when:

- `tizen-manifest.xml` file exists, AND
- `CMakeLists.txt` file exists

---

## Prerequisites

### 1. GBS (Git Build System)

GBS is required to build Tizen platform packages. The build script resolves GBS via a 3-level fallback:

1. **tizen-cli GBS plugin** — if a GBS plugin is installed in tizen-cli, it is used
2. **System-installed `gbs`** — if `gbs` is on PATH, it is used directly
3. **Neither found** — error with installation guidance

**Installation:**

```bash
# Ubuntu/Debian
sudo apt-get install gbs

```

### 2. Git Repository

GBS requires a **Git repository** to build. The build script automatically initializes one:

- If `.git` directory exists: proceed without action
- If `.git` directory does not exist: `git init` → `git add -A` → `git commit` automatically

### 3. Tizen Platform Development Packages

The `BuildRequires` packages specified in the project's `.spec` file must be available in the GBS build environment. For example, for the DALi demo:

```
BuildRequires:  cmake
BuildRequires:  pkgconfig(dali2-core)
BuildRequires:  pkgconfig(dali2-adaptor)
BuildRequires:  pkgconfig(dali2-toolkit)
```

### 4. .gbs.conf

A `.gbs.conf` file in the home directory is required for GBS builds. This file defines the Tizen platform repository profile that GBS uses.

---

## Project Creation

### Method 1: tizen-cli Command (Recommended)

Use the `tizen-cli tizen-sdk` command to create a Platform project.

**1. List available Platform templates:**

```bash
tizen-cli tizen-sdk list-templates --type platform
```

**2. Create the project:**

```bash
tizen-cli tizen-sdk create-project \
  --type platform \
  --template dali_demo \
  --parent-path /home/user/tizen-apps \
  --name MyApp
```

| Option                | Required | Description                                                        |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `--type <type>`       | **yes**  | `platform`                                                         |
| `--template <name>`   | **yes**  | Template name from `list-templates` (e.g., `dali_demo`)            |
| `--parent-path <dir>` | **yes**  | Workspace (parent) directory — the app folder is created inside it |
| `--name <appName>`    | **yes**  | App name = folder name to create                                   |

**3. Verify creation result:**

```json
{
  "status": "success",
  "result": {
    "project_name": "MyApp",
    "project_type": "platform",
    "template_name": "dali_demo",
    "project_path": "/home/user/tizen-apps/MyApp",
    "status": "created"
  },
  "command": "tizen-sdk create-project"
}
```

### Method 2: Natural Language (Cline/Claude Code)

Ask Cline/Claude Code in natural language:

```
Create a platform dali_demo template app called MyApp
```

### Method 3: CLI Runner Direct Execution

```bash
node <plugin>/lib/cli/project-manager-cli.js create --type platform --template dali_demo --parent-path <parentPath> --name <appName>
```

---

## Running a Build

### Method 1: tizen-cli Command (Recommended)

Use the `tizen-cli tizen-sdk build-project` command to build a Platform project with GBS:

```bash
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/MyApp
```

| Option                | Required | Default  | Description                                 |
| --------------------- | -------- | -------- | ------------------------------------------- |
| `--project <path>`    | **yes**  | —        | Project root directory                      |
| `--build-type <type>` | no       | `Debug`  | `Debug` \| `Release` \| `Test`              |
| `--arch <arch>`       | no       | `x86_64` | `armv7l` \| `aarch64` \| `i586` \| `x86_64` |

**Build with specific architecture:**

```bash
# Build for armv7l target
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/MyApp --arch armv7l

# Release build
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/MyApp --build-type Release
```

### Method 2: Natural Language (Cline/Claude Code)

Ask Cline/Claude Code in natural language:

```
Build the project
```

### Method 3: CLI Runner Direct Execution

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" build --project "<project-path>" --build-type Debug
```

### Method 4: Direct GBS Execution

```bash
cd <project-path>
gbs build -A x86_64 --include-all
```

---

## Build Artifacts

When the GBS build succeeds, `.rpm` packages are generated at:

```
~/GBS-ROOT/local/repos/<arch>/RPMS/
├── <app-name>-<version>-<release>.<arch>.rpm          # Main package
├── <app-name>-debuginfo-<version>-<release>.<arch>.rpm  # Debug info
└── <app-name>-debugsource-<version>-<release>.<arch>.rpm # Debug source

~/GBS-ROOT/local/repos/<arch>/SRPMS/
└── <app-name>-<version>-<release>.src.rpm               # Source RPM
```

> **Note:** Platform (GBS) builds produce `.rpm` files, not `.tpk`/`.wgt`. The `tizen-install-app` skill supports both `.tpk`/`.wgt` and `.rpm` packages. Use the `--run` option with RPM installation to automatically launch the app after install. See [RPM Package Installation and Execution](#rpm-package-installation-and-execution) section for details.

### Success Response Example

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
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 22806
}
```

---

## Build Script Internal Flow

The Platform build flow in `tizen-build-project.sh`:

1. **Detect project type** — check for `tizen-manifest.xml` + `CMakeLists.txt` → Platform
2. **DALi C++17 preflight** — if a `dali2-*` dependency is present, verify C++17 is selected; exit 4 if not
3. **Resolve GBS executable** — 3-level fallback (tizen-cli plugin → system gbs → error)
4. **Verify Git repository** — auto-initialize if `.git` is missing
5. **Run GBS build** — `gbs build -A <arch> --include-all`
6. **Search for artifacts** — look for `.tpk`/`.wgt`/`.rpm` files in project dir and `~/GBS-ROOT`
7. **Return result** — Standard JSON Envelope with build results

---

## DALi Development Notes

When developing DALi (3D UI engine) based Platform apps, note the following:

### C++17 is Mandatory

Tizen 9.0 dali2 headers use `std::string_view` / `std::any`. Without an explicit C++17
setting the project compiles at the toolchain default (gnu++14) and fails **inside**
`/usr/include/dali*`. Because the error names a system header it reads as a broken SDK,
when the actual cause is one missing line in CMakeLists.txt.

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

Place it **before** `add_executable()`.

> **Injecting the standard through gbs optflags does not work.**
>
> ```bash
> gbs build --define "optflags -std=c++17"   # no effect
> ```
>
> The spec's `%build` calls `cmake` directly without exporting `CXXFLAGS`, so rpm
> optflags never reach the compiler, and CMake composes its own `-std` flag from
> `CMAKE_CXX_STANDARD` regardless.

The build script **preflights this before running GBS**. If a project declares a
`dali2-*` dependency but has no C++17 setting, it stops immediately with **exit 4** and
prints the fix above. It scans `CMakeLists.txt`, any `*.cmake` under the project, and
`*.spec`, and accepts any spelling: `CMAKE_CXX_STANDARD`, `cxx_std_17`, or
`-std=c++17`/`-std=gnu++17`.

### Stage Header Inclusion

The `dali.h` header only includes **public-api**. The `Stage` class is defined in `dali/devel-api/common/stage.h` and must be explicitly included:

```cpp
#include <dali/dali.h>
#include <dali/devel-api/common/stage.h>  // ← Required! Not included by dali.h
#include <dali-toolkit/dali-toolkit.h>
```

### Link Libraries

Link DALi libraries in CMakeLists.txt:

```cmake
TARGET_LINK_LIBRARIES(${PROJECT_NAME}
  dali2-core
  dali2-adaptor
  dali2-toolkit
)
```

### spec File BuildRequires

Specify DALi package dependencies in the `.spec` file:

```
BuildRequires:  pkgconfig(dali2-core)
BuildRequires:  pkgconfig(dali2-adaptor)
BuildRequires:  pkgconfig(dali2-toolkit)
```

---

## RPM Package Installation and Execution

RPM packages generated by GBS builds can be installed on a device/emulator using the `tizen-install-app` skill.

### Install and Run

```bash
tizen-cli tizen-sdk install-app \
  --package /home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm \
  --run
```

| Option             | Required | Description                   |
| ------------------ | -------- | ----------------------------- |
| `--package <path>` | **yes**  | RPM package file path         |
| `--run`            | no       | Launch app after installation |

### RPM App Launch Environment Variables

RPM platform apps are launched via `sdb shell` **as user `owner` (uid 5001)** when `su` is available on the device (falling back to the current shell user otherwise). The rpm install itself runs as root (`sdb root on`), but the Wayland socket and DBus session bus at `/run/user/5001` belong to `owner` — a root-launched GUI process is rejected by the display/session policy and exits immediately. The following environment variables are automatically set:

| Environment Variable       | Value                          | Description                 |
| -------------------------- | ------------------------------ | --------------------------- |
| `WAYLAND_DISPLAY`          | `wayland-0`                    | Wayland display socket name |
| `XDG_RUNTIME_DIR`          | `/run/user/5001`               | XDG runtime directory       |
| `ELM_ENGINE`               | `wayland_egl`                  | EFL rendering engine        |
| `DBUS_SESSION_BUS_ADDRESS` | `unix:path=/run/user/5001/bus` | DBus session bus address    |

Additionally, `setsid` is used to detach the app process into a new session, ensuring it survives after `sdb shell` exits. After launch, the script polls `pgrep` (1-second intervals, up to 5 attempts) to verify the process is running, and app output is redirected to `/tmp/<app-name>.log`.

If the process is not found after the polling window, the script automatically fetches the last 20 lines of `/tmp/<app-name>.log` and surfaces them in the envelope `warnings` (prefixed `app-log:`), along with a targeted hint for common failures (Wayland connection refused, missing shared libraries).

### Installation Response Example

```json
{
  "status": "success",
  "result": {
    "package_path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm",
    "device_serial": "emulator-26101",
    "app_id": null,
    "installation_status": "completed",
    "app_launched": true
  }
}
```

---

## Troubleshooting

### 'Stage' was not declared in this scope

**Cause:** `Stage` class is not included in `dali.h`  
**Fix:** Add `#include <dali/devel-api/common/stage.h>`

### Package file not found after GBS build

**Cause:** Build script only searched for `.tpk` and missed `.rpm` (older versions)  
**Fix:** Update to the latest version of `tizen-build-project.sh` and `project.js` (`.rpm` search support)

### GBS is not available

**Cause:** GBS is not installed  
**Fix:**

```bash
sudo apt-get install gbs
```

Or check for tizen-cli GBS plugin:

```bash
tizen-cli plugin list
```

### 'string_view' in namespace 'std' does not name a type

**Cause:** C++17 not selected. Tizen 9.0 dali2 headers use `std::string_view` / `std::any`.  
**Fix:** Add `set(CMAKE_CXX_STANDARD 17)` + `set(CMAKE_CXX_STANDARD_REQUIRED ON)` before `add_executable()` in `CMakeLists.txt`. `gbs --define optflags` cannot work around it — see [C++17 is Mandatory](#c17-is-mandatory).

### DALi project does not select C++17 (exit 4)

**Cause:** The preflight check found a `dali2-*` dependency with no C++17 setting, before GBS ran  
**Fix:** Same as above. The error message lists the files it scanned and the exact CMake lines to add.

### error: Bad exit status from /var/tmp/rpm-tmp.XXX (%build)

**Cause:** Compilation error or missing dependency packages  
**Fix:** Check the build log:

```bash
cat ~/GBS-ROOT/local/repos/tizen/<arch>/logs/fail/<app-name>-<version>-1/log.txt
```

### No local package repository for arch x86_64

**Cause:** GBS local repository does not have packages for the target architecture  
**Fix:** Verify `.gbs.conf` configuration and Tizen platform repository profile

### RPM app process exits immediately after launch

**Cause 1:** Child processes are killed when `sdb shell` exits  
**Fix:** Use `setsid` to detach the process into a new session (automatically applied in latest version)

**Cause 2:** App launched as root (after `sdb root on`) cannot connect to the `owner` (uid 5001) Wayland/DBus sockets at `/run/user/5001`  
**Fix:** Launch as user `owner` via `su - owner -c` (automatically applied in latest version). On failure, the envelope warnings now include the tail of `/tmp/<app-name>.log` (`app-log:` prefix) showing the actual crash reason.

### RPM app spams eldbus connection errors infinitely

**Cause:** `DBUS_SESSION_BUS_ADDRESS` environment variable is not set  
**Fix:** Set `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/5001/bus` (automatically applied in latest version)

### RPM app fails to connect to Wayland display

**Cause:** `WAYLAND_DISPLAY` and `XDG_RUNTIME_DIR` environment variables are not set  
**Fix:** Environment variables are auto-set (automatically applied in latest version)

> For the complete process from creating a DALi Demo app to capturing a screenshot, see the [DALi Demo End-to-End Guide](tizen-cli/dali-demo-e2e-walkthrough.en.md).

---

## Related Documents

- [Blocking DALi C++17 Build Failures](figma2dali/dali-cxx17-preflight.en.md)
- [DALi Demo End-to-End Guide](tizen-cli/dali-demo-e2e-walkthrough.en.md)
- [Skills Reference](SKILLS_REFERENCE.en.md)
- [Native App Walkthrough](project/scenario-native-app-walkthrough.en.md)

- [SDK Commands Architecture](SDK_COMMANDS_ARCHITECTURE.en.md)
- [dali_demo Template README](../common/scripts/tizen-create-project/templates/platform/dali-demo/)
