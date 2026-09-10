# Scenario Guide: Install Tizen SDK from a Custom Repository URL

This document walks you through installing the Tizen SDK from a **custom repository URL** instead of the default public CDN mirror. Use this when you need to install from an internal Samsung mirror, a build-server output, a team mirror, or a local HTTP server.

Each step runs automatically when you **tell Claude in natural language** — no commands to memorize.

> 💡 **Why use a custom repository?**
> - Internal mirrors for faster downloads within a corporate network
> - Build-server output for bleeding-edge packages
> - Team mirrors for consistent package versions across your organization
> - Local HTTP servers for offline/air-gapped environments
> - Specific package versions not available on the public CDN

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Cline plugin install" in [README.en.md](../README.en.md))
- **Node.js installed**: Node.js 18+ must be installed on your system (required for the SDK installer)
- **Disk space**: at least 15 GB of free space on your home drive (the SDK is large)
- **Network access**: your machine must be able to reach the custom repository URL (VPN/proxy may be required for internal mirrors)
- **Repository URL**: you must have a valid repository URL that serves `pkg_list_{OS}-{64,32}` files

**What is a valid repository URL?**

A valid Tizen package repository serves a **package list** file at its root:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}

OS   = windows | ubuntu | macos
ARCH = 64 | 32
```

Examples:
- ✅ `http://mirror.example.com/packages/tizen_sdk_11.0` (internal mirror)
- ✅ `https://your-team-server.com/tizen-packages` (team mirror)
- ❌ `http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_windows-64` (points at the file, not the directory)
- ❌ `mirror.example.com/packages/tizen_sdk_11.0` (no scheme — must be `http://` or `https://`)

> 💡 **Copy the "Say this" examples in each step as-is.**

---

## The Whole Flow at a Glance

| Step | Task | When | Agent |
|------|------|------|-------|
| 1 | Validate repository URL | Before installing (optional but recommended) | `tizen-sdk-install-custom-repo` |
| 2 | Pre-check installation | Before installing (automatic) | `tizen-sdk-install-custom-repo` |
| 3 | Install SDK from custom URL | Main installation step | `tizen-sdk-install-custom-repo` |
| 4 | Verify installation | After installation completes | `tizen-sdk-install` |
| 5 | (Optional) Check repository.info | Verify recorded repository URL | `tizen-sdk-install` |

---

## Step 1 — Validate Repository URL (Optional but Recommended)

Before starting the installation, validate that your repository URL is valid and reachable. This is a **read-only check** that completes in seconds.

**Say this:**
```
Validate this repository URL: http://mirror.example.com/packages/tizen_sdk_11.0
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk validate-repo-url --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"
```

**Success check:** a Standard JSON Envelope is returned:

```json
{
  "status": "success",
  "result": {
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "pkg_list_file": "pkg_list_windows-64",
    "is_valid": true,
    "reachable": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk validate-repo-url",
  "duration_ms": 500
}
```

**Failure check:** if the URL is invalid:

```json
{
  "status": "error",
  "result": null,
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_REPO_E001",
      "error_category": "repo_url_invalid",
      "message": "The URL points at the pkg_list file itself. Please provide the parent directory URL.",
      "details": {
        "tested_urls": [
          "http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_windows-64",
          "http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_windows-32"
        ]
      }
    }
  ],
  "command": "tizen-sdk validate-repo-url",
  "duration_ms": 300
}
```

**Common URL mistakes:**

| Given URL | Problem | Correct URL |
|-----------|---------|-------------|
| `https://host/repo/pkg_list_ubuntu-64` | Points at the file, not the directory | `https://host/repo` |
| `https://host/repo/binary` | `binary/` holds the zips, not the list | `https://host/repo` |
| `mirror.example.com/packages/tizen_sdk_11.0` | No scheme | `http://mirror.example.com/packages/tizen_sdk_11.0` |
| `mirror.example.com/packages/tizen_studio_6.5` | No scheme | `http://mirror.example.com/packages/tizen_studio_6.5` |
| An internal mirror while off-VPN | Not reachable from this machine | Connect to VPN / configure a proxy |

> ⚠️ **Internal mirrors require VPN/proxy:** If you're using a mirror that is only reachable from a corporate network, make sure you're connected to the corporate VPN. A "not reachable" error on an internal URL usually means network access, not a bad URL.

---

## Step 2 — Pre-Check Installation

The pre-check validates the URL, checks if the SDK is already installed, and verifies disk space. This completes in seconds.

**Say this:**
```
Install the Tizen SDK from http://mirror.example.com/packages/tizen_sdk_11.0
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"
```

**Success check (SDK not installed yet):** the pre-check returns a `suggested_fix` command:

```json
{
  "status": "error",
  "result": {
    "sdk_root": null,
    "sdk_installed": false,
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "repository_valid": true,
    "pkg_list_file": "pkg_list_windows-64",
    "disk_space_ok": true,
    "available_space_gb": 150
  },
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_EXEC_E001",
      "error_category": "execution_error",
      "message": "SDK not installed yet. Run the suggested fix command to install.",
      "suggested_fix": {
        "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\<username>\\.cline\\plugins\\cache\\tizen-platform\\tizen-sdk-skills\\v1.2.3\\scripts\\tizen-sdk-install-custom-repo\\tizen-sdk-install-custom-repo.ps1\" -RepoUrl \"http://mirror.example.com/packages/tizen_sdk_11.0\"",
        "description": "Install Tizen SDK from custom repository"
      }
    }
  ],
  "command": "tizen-sdk sdk-install-custom-repo",
  "duration_ms": 2000
}
```

> ⚠️ **Already installed ≠ installed from this repository:** If the SDK already exists, the pre-check returns **success without downloading anything**. The existing packages still come from whatever repository installed them. To reinstall from your custom URL, add `--force` to the request.

**Success check (SDK already installed):**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "sdk_installed": true,
    "existing_repository": "https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official"
  },
  "warnings": [
    "SDK installation verified at C:\\Users\\<username>\\tizen-sdk (sdk.info found). To force a reinstall, run with --force.",
    "The requested repository was NOT applied: the existing SDK was installed from https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official. Re-run with --force to reinstall from http://mirror.example.com/packages/tizen_sdk_11.0."
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install-custom-repo",
  "duration_ms": 1500
}
```

---

## Step 3 — Install SDK from Custom URL

The actual installation takes **10–15 minutes** and downloads ~121 packages. The installer runs in the background to avoid timeout.

**Say this:**
```
Install the Tizen SDK from http://mirror.example.com/packages/tizen_sdk_11.0
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0" --force
```

The agent will automatically run the `suggested_fix.command` from Step 2.

### Installation Progress

The installer:
1. Re-validates the repository URL
2. Downloads and parses `pkg_list_windows-64`
3. Picks the target platform (highest `TIZEN-X.Y` unless you specify one)
4. Resolves all package dependencies (`Install-dependency` + `C-SelectedGroup`)
5. Downloads each package zip from `{REPO_URL}{Path}`
6. Merges `data/` contents into the SDK root
7. Writes `sdk.info`, `~/.tizen.sdk.path.config`, and `.package/repository.info`

**Success check:** after installation completes:

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "packages_installed": 121,
    "platform_version": "TIZEN-11.0",
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "installation_time_ms": 720000
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-install-custom-repo",
  "duration_ms": 720000
}
```

> ⚠️ **Time estimate:** This step takes 10–15 minutes depending on your network speed and the repository server's bandwidth.

---

## Step 4 — Verify Installation

After installation completes, verify that the SDK is properly installed and configured.

**Say this:**
```
Verify the Tizen SDK installation
```

**Success check:** a Standard JSON Envelope showing the SDK is ready:

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "sdk_version": "11.0",
    "sdk_info_exists": true,
    "environment_configured": true,
    "tizen_sdk_path_set": true,
    "path_updated": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "duration_ms": 1000
}
```

---

## Step 5 — Check Recorded Repository URL (Optional)

The installer records the custom repository URL in `.package/repository.info`. This ensures that **future package updates and emulator packages come from the same custom repository** — no extra configuration needed.

**Say this:**
```
Show the recorded repository URL for the Tizen SDK
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk sdk-repo-info
```

**Success check:**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "current_repository": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "repository_info_path": "C:\\Users\\<username>\\tizen-sdk\\.package\\repository.info"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-repo-info",
  "duration_ms": 500
}
```

> 💡 **Downstream effect:** `tizen-update-package` and `tizen-download-emulator-package` read `repository.info`, so all future package operations use the same custom repository.

---

## Full E2E Paths

### Path 1: Standard Custom Repository Install

Use this for a typical installation from an internal mirror:

```
1) Validate this repository URL: http://mirror.example.com/packages/tizen_sdk_11.0
2) Install the Tizen SDK from http://mirror.example.com/packages/tizen_sdk_11.0
3) Verify the Tizen SDK installation
4) Show the recorded repository URL
```

**tizen-cli commands:**
```bash
# Step 1: Validate
tizen-cli tizen-sdk validate-repo-url --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"

# Step 2: Install
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"

# Step 3: Verify
tizen-cli tizen-sdk sdk-install

# Step 4: Check repository info
tizen-cli tizen-sdk sdk-repo-info
```

**Time estimate:** ~15 minutes (validation is instant; installation is 10–15 minutes).

### Path 2: Quick Install (Skip Validation)

If you're confident the URL is valid, skip straight to installation:

```
1) Install the Tizen SDK from http://mirror.example.com/packages/tizen_sdk_11.0
2) Verify the Tizen SDK installation
```

**tizen-cli commands:**
```bash
# Step 1: Install
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"

# Step 2: Verify
tizen-cli tizen-sdk sdk-install
```

**Time estimate:** ~15 minutes.

### Path 3: Reinstall from Different Repository

If you have an existing SDK and want to switch repositories:

```
1) Install the Tizen SDK from http://mirror.example.com/packages/tizen_sdk_11.0 --force
2) Verify the Tizen SDK installation
3) Show the recorded repository URL
```

**tizen-cli commands:**
```bash
# Step 1: Reinstall with --force
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0" --force

# Step 2: Verify
tizen-cli tizen-sdk sdk-install

# Step 3: Check repository info
tizen-cli tizen-sdk sdk-repo-info
```

> ⚠️ **`--force` is required:** Without it, the installer detects the existing SDK and exits without downloading anything.

---

## Platform Version Selection

By default, the installer picks the **highest `TIZEN-X.Y`** version available in the repository. You can override this if you need a specific version.

**Say this:**
```
Install the Tizen SDK from http://mirror.example.com/packages/tizen_sdk_11.0 using platform version 10.0
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0" --platform-version "10.0"
```

**Result:** the installer uses `TIZEN-10.0` instead of the highest available version.

---

## Troubleshooting

### Repository URL Invalid

**Symptoms:** `repo_url_invalid` error.

**Say this:**
```
The repository URL http://example.com/repo is invalid — diagnose the issue
```

**Common causes and fixes:**

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| URL points at pkg_list file | `details.tested_urls` shows the pkg_list path | Remove `/pkg_list_...` from the URL |
| No http/https scheme | `error_category: "repo_url_invalid"` | Add `http://` or `https://` prefix |
| Malformed URL | `error_category: "repo_url_invalid"` | Check for typos, spaces, or invalid characters |

### Repository URL Unreachable

**Symptoms:** `repo_url_unreachable` error.

**Say this:**
```
The repository URL http://10.x.x.x/repo is unreachable — diagnose the issue
```

**Common causes and fixes:**

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Internal mirror, off-VPN | `details` shows connection timeout | Connect to corporate VPN |
| Wrong URL | `details` shows 404 for all pkg_list probes | Verify the URL with the repository owner |
| Proxy required | `details` shows connection refused | Configure HTTP proxy for internal network |

### Installation Fails Midway

**Symptoms:** installer exits with error, partial SDK installed.

**Say this:**
```
The SDK installation failed — resume or retry
```

**Recovery:** the installer uses durable markers (`.install-running` / `.install-result`), so re-running the same command **resumes where it left off** — already-downloaded packages are skipped.

### Disk Space Insufficient

**Symptoms:** `disk_space_insufficient` error.

**Say this:**
```
Free up disk space or change the SDK installation path
```

**Fix:** either:
1. Free up at least 15 GB on your home drive
2. Specify a different install path: `Install the Tizen SDK to D:\tizen-sdk from http://...`

---

## Error Reference

| `error_code` | `error_category` | Cause | Fix |
|--------------|------------------|-------|-----|
| `TIZEN_SDK_REPO_E001` | `repo_url_invalid` | Missing/empty URL, non-`http(s)` scheme, or URL points at pkg_list file | Pass the **directory** URL containing the pkg_list |
| `TIZEN_SDK_REPO_E002` | `repo_url_unreachable` | Well-formed URL, but no `pkg_list_{OS}-{64,32}` could be fetched | Wrong URL, or internal mirror unreachable without VPN/proxy |
| `TIZEN_SDK_SCRIPT_E001` | `script_not_found` | Installer script missing from plugin cache | Re-run the setup script to sync `scripts/` |
| `TIZEN_SDK_EXEC_E001` | `execution_error` | URL valid, SDK not installed (normal Phase-1 result) | Run `errors[0].suggested_fix.command` (Phase 2) |

---

## What Happens After Installation

After a successful custom repository install:

1. **`sdk.info`** — marks the SDK as installed
2. **`~/.tizen.sdk.path.config`** — auto-configured (auto `sdk-init`)
3. **`.package/repository.info`** — records the custom repository URL
4. **Environment variables** — `TIZEN_SDK_PATH` and `PATH` are set up

The recorded repository URL affects all future package operations:

| Operation | Reads `repository.info`? | Uses Custom Repository? |
|-----------|--------------------------|-------------------------|
| `tizen-update-package` | ✅ Yes | ✅ Yes |
| `tizen-download-emulator-package` | ✅ Yes | ✅ Yes |
| `tizen-sdk-install` (normal) | ❌ No | ❌ No (uses CDN) |

---

## Related Documents

- Technical reference: [CUSTOM_REPOSITORY_INSTALL.en.md](CUSTOM_REPOSITORY_INSTALL.en.md)
- Standard SDK installation: [INSTALLATION_FLOW.en.md](INSTALLATION_FLOW.en.md)
- SDK verification: [SDK_INSTALLATION_VERIFICATION.en.md](SDK_INSTALLATION_VERIFICATION.en.md)
- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (`tizen-sdk-install-custom-repo`)

---

## Keyboard Shortcuts & Tips

- **Natural language:** just describe what you want — "Install the SDK from https://...", "Validate this repo URL", "Show the recorded repository".
- **Validate first:** always validate the URL before starting a long installation — it takes seconds and prevents wasted time.
- **`--force` to switch repos:** if you have an existing SDK and want to switch repositories, you **must** use `--force`.
- **Resume on failure:** if installation fails, re-running resumes where it left off — already-downloaded packages are skipped.
- **Internal mirrors require VPN:** for a mirror reachable only from a corporate network, connect to the VPN first.
- **Repository is sticky:** after installing from a custom repository, all future package operations (updates, emulator packages) use the same repository automatically.
- **Check repository.info:** use `tizen-cli tizen-sdk sdk-repo-info` to see which repository your SDK came from.
