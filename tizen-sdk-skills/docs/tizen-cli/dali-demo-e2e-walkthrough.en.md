# DALi Demo End-to-End Guide

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-07-27  
**License:** Apache License 2.0 ([LICENSE](../../LICENSE))

---

## Overview

This document walks through the complete process of creating, building, installing/running, and capturing a screenshot of a DALi demo app using the `dali_demo` template.

> For detailed information on GBS builds themselves, see [Platform App GBS Build Guide](../platform-gbs-build.en.md).

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
  "warnings": [],
  "errors": [],
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
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-project",
  "duration_ms": 11280
}
```

> **Automatic template name substitution:** The `dali_demo` template's default name `dali-demo` is hardcoded in CMakeLists.txt, the `.spec` file, and other project files. If you specify a project name other than `dali-demo`, the creation script automatically substitutes the template name with your chosen project name in the following files:
>
> - **CMakeLists.txt** — CMake target name, binary name
> - **packaging/`<template>.spec`** — RPM package name, file name (e.g., `dali-demo.spec` → `<project-name>.spec`, renamed)
> - **Other text files** (`.txt`, `.cmake`, `.yaml`, `.json`, `.md`, `.spec`)
>
> Example: creating with `--name my-dali-app` produces a build artifact named `my-dali-app-1.0.0-1.x86_64.rpm`.

---

## Step 3: GBS Build

Build the created project with GBS.

**tizen-cli command:**

```bash
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/dali-demo
```

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

**Response example:**

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
  "warnings": [],
  "errors": [],
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
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-app",
  "duration_ms": 13000
}
```

> `app_id` being `null` is expected — Platform (RPM) apps are not registered with `app_launcher`, so they have no app_id. Instead, they are launched directly via the `/usr/bin/dali-demo` binary.

> **Automatic rerun script generation:** Platform apps have no `app_launcher` icon, so after the app is killed (e.g., Back key) there is no way to restart it from the device home screen. To solve this, the `install-app` command automatically generates a host-side rerun script at `~/bin/run-<app-name>.sh` after installing an RPM package. This script re-launches the already-installed binary without re-installing the RPM:
>
> ```bash
> # Re-launch the app (no RPM re-install needed)
> ~/bin/run-dali-demo.sh
> ```

The script handles device detection, root access, Wayland environment setup, launching as the `owner` user (uid 5001), and process verification automatically.

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

**Response example:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "screenshot_path": "/home/user/tizen-apps/emulator_screenshot.png",
    "capture_method": "host-side xwd",
    "file_size_bytes": 1234567,
    "dimensions": "1920x1080"
  },
  "warnings": [],
  "errors": [],
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

---

## Related Documents

- [Platform App GBS Build Guide](../platform-gbs-build.en.md)
- [Skills Reference](../SKILLS_REFERENCE.en.md)
- [SDK Commands Architecture](../SDK_COMMANDS_ARCHITECTURE.en.md)
- [dali_demo Template README](../../common/scripts/tizen-create-project/templates/platform/dali-demo/)
