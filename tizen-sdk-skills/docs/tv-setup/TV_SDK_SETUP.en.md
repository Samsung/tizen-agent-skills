# Tizen TV SDK Setup Guide

English | [한국어](TV_SDK_SETUP.md)

This document describes the step-by-step process of installing the Tizen SDK and Tizen TV SDK extension for Samsung TV app development.

## Overview

To develop Samsung TV apps, two components must be installed:

1. **Tizen SDK** (base SDK) — provides core tools, CLI, emulators, and platform packages
2. **Tizen TV SDK** (TV-SAMSUNG-Public extension) — adds TV-specific profiles, emulator resources, and tools

The TV SDK is an **extension** that requires the base Tizen SDK to be installed first.

## Prerequisites

- **Node.js 18+** must be installed and on PATH
- **15 GB** of free disk space (on the home directory drive)
- **Linux/macOS/Windows** operating system

## Installation Flow

### Step 1: Verify Prerequisites

The `sdk-install-cli.js` pre-check automatically verifies:

- Node.js is installed and on PATH
- Sufficient disk space (15 GB minimum)

```
[tizen-sdk] Node.js OK (v22.16.0). Continuing.
[tizen-sdk] Disk space OK (109.46 GB free). Proceeding to install.
```

### Step 2: Install Tizen SDK (Base SDK)

The base Tizen SDK consists of **121 packages** including:

- Tizen Platform 10.0
- CLI tools (sdb, package-manager-cli, etc.)
- Emulator (QEMU, emulator-manager)
- Native toolchains (cross-arm-gcc, cross-aarch64-gcc, cross-x86-64-gcc, etc.)
- GDB debuggers for all architectures
- Web IDE tools, certificate generator, and more

**Installation method (Cline on Linux):**

```bash
# Phase 2: Launch installer in background with nohup
nohup bash "<installer.sh path>" > /tmp/tizen-sdk-install.log 2>&1 & \
jobs -p

# Poll every 25 seconds until STATUS=done
sleep 25 && bash "<installer.sh path>" --status
```

**Result:**

```
STATUS=done EXIT=0
```

**Verification:**

```
[tizen-sdk] SDK is already installed (sdk.info found)
[tizen-sdk] SDK path configured automatically: /home/user/tizen-sdk → ~/.tizen.sdk.path.config
```

- SDK installed at: `/home/user/tizen-sdk`
- SDK path config written to: `~/.tizen.sdk.path.config`
- Version: 10.0

### Step 3: Install Tizen TV SDK (Extension)

Once the base Tizen SDK is installed, the TV SDK extension can be installed.

**Pre-check:**

```
[tizen-tv-sdk] Tizen SDK found at /home/user/tizen-sdk. Continuing.
→ TV SDK is NOT installed. Proceed to Phase 2.
```

**Installation method (Cline on Linux):**

```bash
# Phase 2: Launch TV SDK installer in background
nohup bash "<tv-sdk-install.sh path>" --sdk-path="/home/user/tizen-sdk" > /tmp/tizen-tv-sdk-install.log 2>&1 & \
jobs -p
```

**TV SDK packages (22 total):**

The TV SDK extension downloads and merges the following packages:

| #    | Package                               | Description                   |
| ---- | ------------------------------------- | ----------------------------- |
| 1–4  | TV-SAMSUNG-Public + dependencies      | Core TV extension package     |
| 5–19 | Emulator resources, IDE plugins       | TV emulator and tooling       |
| 20   | tv-samsung-emulator-manager-resources | TV emulator manager resources |
| 21   | TV-SAMSUNG-Emulator-Utils             | TV emulator utilities         |
| 22   | tv-samsung-emulator-resources         | TV emulator resources         |

**Result:**

```
[OK] TV SDK package result: OK 18 / skipped 4 / failed 0 (total 22)
[OK] .tv-sdk-installed created: /home/user/tizen-sdk/.tv-sdk-installed
[OK] Tizen TV SDK extension installation completed!
```

**Verification:**

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
  }
}
```

## Installation Summary

| Component        | Status       | Path                                    | Version   |
| ---------------- | ------------ | --------------------------------------- | --------- |
| Tizen SDK        | ✅ Installed | `/home/user/tizen-sdk`                   | 10.0      |
| TV SDK Extension | ✅ Installed | `/home/user/tizen-sdk` (merged)          | extension |
| SDK Path Config  | ✅ Written   | `~/.tizen.sdk.path.config`              | —         |
| TV SDK Marker    | ✅ Created   | `/home/user/tizen-sdk/.tv-sdk-installed` | —         |

## CDN Mirror Selection

The installer automatically selects the fastest CDN mirror based on the system's timezone offset:

| UTC Offset Range | Mirror    | URL                                                           |
| ---------------- | --------- | ------------------------------------------------------------- |
| UTC-12 .. UTC-5  | Global    | `https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official`       |
| UTC-4 .. UTC-1   | Brazil    | `https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official`    |
| UTC+0 .. UTC+4   | Official  | `https://download.tizen.org/sdk/tizenstudio/official`         |
| UTC+5 .. UTC+12  | Singapore | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official` |

## TV SDK Verification Methods

To verify whether the TV SDK is installed, use the following methods:

### ✅ Correct Methods

1. **`list-templates --type tv`** — Lists TV templates. If an empty array (`[]`) is returned, the TV SDK is not installed. If TV templates exist, the TV SDK is installed.

2. **`tv-sdk-install` re-run (idempotent)** — The `tv-sdk-install` CLI checks the `.tv-sdk-installed` marker and returns success immediately if already installed. It is safe to re-run for verification purposes.

### ❌ Incorrect Method

- **`list-platform --profile tv`** — This command **ignores** the `--profile` parameter. It returns the default platform list even when the TV profile is not installed, causing a **false positive**.

### Summary

| Method                       | Reliability   | Note                                                   |
| ---------------------------- | ------------- | ------------------------------------------------------ |
| `list-templates --type tv`   | ✅ Reliable   | Empty array = not installed, items present = installed |
| `tv-sdk-install` re-run      | ✅ Reliable   | Idempotent, uses `.tv-sdk-installed` marker            |
| `list-platform --profile tv` | ❌ Unreliable | `--profile` ignored, false positive                    |

## Next Steps

Now that the Tizen TV SDK is installed, you can:

1. **Create a TV project** — use the `tizen-create-project` skill to scaffold a new Samsung TV app
2. **Build the project** — use the `tizen-build-project` skill to build the `.wgt` package
3. **Install on device/emulator** — use the `tizen-install-app` skill to deploy and launch
4. **Create a TV emulator** — use the `tizen-create-emulator` skill to create a Samsung TV emulator VM
5. **Manage certificates** — use the `tizen-certificate-manager` skill to create signing profiles

## Troubleshooting

### "Tizen SDK is not installed" when installing TV SDK

The TV SDK is an extension and requires the base Tizen SDK. Install the Tizen SDK first using the `tizen-sdk-install` skill, then retry the TV SDK installation.

### Installation seems stuck

Check the installation log:

```bash
tail -20 /tmp/tizen-sdk-install.log        # Base SDK log
tail -20 /tmp/tizen-tv-sdk-install.log     # TV SDK log
```

### Force reinstall

```bash
# Force reinstall base SDK
node "<sdk-install-cli.js>" --force

# Force reinstall TV SDK
bash "<tv-sdk-install.sh>" --sdk-path="/home/user/tizen-sdk" --force
```
