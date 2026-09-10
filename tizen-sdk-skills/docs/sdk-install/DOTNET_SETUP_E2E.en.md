# Tizen .NET Development Environment Setup (End-to-End Guide)

This guide walks you through installing the .NET SDK and Tizen workload for developing .NET applications on the Tizen platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Windows Installation](#windows-installation)
4. [Linux Installation](#linux-installation)
5. [macOS Installation](#macos-installation)
6. [Verification and Troubleshooting](#verification-and-troubleshooting)
7. [Next Steps](#next-steps)

## Overview

Tizen .NET development requires two components:

1. **.NET SDK** (version 8.0 or later recommended)
   - C# and .NET development tools provided by Microsoft

2. **Tizen .NET Workload**
   - Samsung's Tizen platform extension package
   - `Must be installed into the same version (band) as the .NET SDK`

### Critical: SDK Version Mismatch (Issue #258)

The workload must be registered in the **same SDK feature band as where you installed it.**

For example:
- Install workload into .NET 10.0.302 (band: 10.0.300) → registers in 10.0.300 ✅
- But if DOTNET_ROOT environment variable points to a different install → may register elsewhere ❌

Samsung's `workload-install` script picks its own install target (`DOTNET_ROOT` if set, otherwise `%ProgramFiles%\dotnet`), while verification runs against the `dotnet` on PATH. When those disagree, the workload is registered into the wrong band.

The setup script handles this by:

- **Pinning install and verification to the same dotnet** (it passes `-d <dotnet-root>` to the installer).
- Overriding `DOTNET_ROOT` **for that run only** — your persisted value is never modified.
- Reporting **exit code 3** with `[DIAG]` facts naming the exact mismatch if the bands still diverge.

> With a **user-scope install** (`~/.dotnet` on Linux/macOS, `%LOCALAPPDATA%\Microsoft\dotnet` on Windows) it is **normal and correct** for `DOTNET_ROOT` to point at that directory — the setup script persists exactly that. A mismatch only arises when `DOTNET_ROOT` points at a *different* install than the `dotnet` on PATH.

## Prerequisites

### System Requirements

These are the .NET 8 SDK requirements (they follow Microsoft's supported-OS policy).

| Item | Requirement |
|------|-------------|
| Windows | 10 version 1607+ / Server 2012 R2+ (no admin rights needed for a user-scope install; system-wide install to `C:\Program Files` triggers one UAC prompt) |
| Linux | Ubuntu 20.04+, Debian 11+, RHEL 8+ |
| macOS | 12 (Monterey) or later |
| Disk Space | Minimum 2GB |
| Internet | Required (Proxy environments supported) |

> .NET 8 dropped support for Windows 7/8.1, Ubuntu 18.04 and older, and CentOS 7. On an older OS, check which .NET version was the last to support it.

### Pre-Installation Check

Verify if .NET SDK is already installed on your system:

```bash
# All platforms
dotnet --version

# If not installed, you'll see "command not found" error
```

---

## Windows Installation

### Step 1: Integrated .NET SDK and Tizen Workload Setup (Recommended)

#### Method A: Using Claude Code / Cline Agent (Easiest)

**Example requests:**

> "Setup .NET development environment for Tizen"
> or
> "tizen dotnet setup"
> or
> ".NET SDK 설정해줘"

This will launch the `tizen-dotnet-setup` agent.

**What the agent does:**
1. Auto-detects .NET SDK — and if none exists anywhere, **auto-installs one user-scope** into `%LOCALAPPDATA%\Microsoft\dotnet` (official dotnet-install.ps1, **no admin rights or UAC prompt needed**)
2. Downloads and runs Samsung's workload-install.ps1
3. Verifies workload installation
4. Returns results as JSON Envelope

**More request examples** (you speak to the agent in natural language, not in flags):

> "Force-reinstall the Tizen workload" → passes `--force` to the runner
> "Install Tizen workload version 10.0.123" → passes `--workload-version 10.0.123` to the runner
> "Set up, but never install the .NET SDK automatically" → passes `--no-install-sdk` to the runner

#### Method B: Using tizen-cli Command

```powershell
# Setup Tizen .NET environment
tizen-cli tizen-sdk dotnet-setup

# With options
tizen-cli tizen-sdk dotnet-setup --force
tizen-cli tizen-sdk dotnet-setup --workload-version 10.0.123
tizen-cli tizen-sdk dotnet-setup --no-install-sdk    # never auto-install a missing SDK
tizen-cli tizen-sdk dotnet-setup --sdk-channel 9.0   # auto-install channel (default 8.0)
```

#### Method C: Manual Setup (Step-by-step)

**Step 1-1: Install .NET SDK**

##### Method C1: User-scope install without admin rights (Recommended)

Installs to `%LOCALAPPDATA%\Microsoft\dotnet` — **no Administrator rights and no UAC prompt**. This is the same route the agent's auto-install uses. (Note: `C:\Program Files` is protected by Windows, so *no* installer can write there without elevation — if you need the system-wide location, use Method C2.)

```powershell
# Official install script (normal PowerShell, no elevation)
Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile dotnet-install.ps1
./dotnet-install.ps1 -Channel 8.0 -InstallDir "$env:LOCALAPPDATA\Microsoft\dotnet"

# Make it visible to new shells (User-level environment variables)
[Environment]::SetEnvironmentVariable('DOTNET_ROOT', "$env:LOCALAPPDATA\Microsoft\dotnet", 'User')
[Environment]::SetEnvironmentVariable('PATH', "$env:LOCALAPPDATA\Microsoft\dotnet;" + [Environment]::GetEnvironmentVariable('PATH', 'User'), 'User')
```

##### Method C2: Using winget (system-wide, `C:\Program Files\dotnet`)

No Administrator terminal needed — run from a **normal PowerShell**; a **one-time UAC prompt** appears during the install.

```powershell
# 1. Without proxy
winget install Microsoft.DotNet.SDK.8

# 2. With corporate proxy
# First enable proxy support (this step needs an Administrator PowerShell)
winget settings --enable ProxyCommandLineOptions

# Then install (ask your IT department for proxy address)
winget install Microsoft.DotNet.SDK.8 --proxy http://[proxy-host]:[port]
```

##### Method C3: Manual Installation

1. Visit [https://dotnet.microsoft.com/download](https://dotnet.microsoft.com/download)
2. Download ".NET 8 SDK" (or latest LTS version)
3. Run the installer (a UAC prompt appears for the system-wide install)
4. Open a new PowerShell window after installation

**Step 1-2: Install Tizen .NET Workload (Manual Script)**

Open a new **PowerShell** (Administrator only needed when the SDK lives in a protected directory such as `C:\Program Files\dotnet`; a user-scope SDK needs no elevation):

```powershell
# Direct script execution
powershell -ExecutionPolicy Bypass -File `
  "C:\Users\[username]\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\1.0.0\scripts\tizen-dotnet-setup\tizen-dotnet-setup.ps1"

# With options
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -Force
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -Version "10.0.123"
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -NoInstallSdk
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -SdkChannel "9.0"
```

**Script automatically:**
1. Detects .NET SDK — and if none exists anywhere, auto-installs one user-scope into `%LOCALAPPDATA%\Microsoft\dotnet` (no admin rights; skip with `-NoInstallSdk`)
2. Runs Samsung's workload-install.ps1
3. Verifies workload installation
4. Outputs `[DIAG]` information if there are issues

---

## Linux Installation

### Step 1: Integrated .NET SDK and Tizen Workload Setup (Recommended)

#### Method A: Using Claude Code / Cline Agent (Easiest)

**Example requests:**

> "Setup .NET development environment for Tizen"
> or
> "tizen dotnet setup"

**More request examples** (you speak to the agent in natural language, not in flags):

> "Force-reinstall the Tizen workload" → passes `--force` to the runner
> "Install Tizen workload version 10.0.123" → passes `--workload-version 10.0.123` to the runner

#### Method B: Using tizen-cli Command

```bash
# Setup Tizen .NET environment
tizen-cli tizen-sdk dotnet-setup

# With options
tizen-cli tizen-sdk dotnet-setup --force
tizen-cli tizen-sdk dotnet-setup --workload-version 10.0.123
tizen-cli tizen-sdk dotnet-setup --no-install-sdk    # never auto-install a missing SDK
tizen-cli tizen-sdk dotnet-setup --sdk-channel 9.0   # auto-install channel (default 8.0)
```

> If no .NET SDK exists anywhere, the runner **auto-installs one user-scope into `~/.dotnet`** (official dotnet-install.sh, **no sudo needed**) and continues with the workload. Because `~/.dotnet` is user-owned, the workload step needs no sudo either.

#### Method C: Manual Setup (Step-by-step)

**Step 1-1: Install .NET SDK**

##### Method C1: Official Installation Script (Recommended — no sudo, user-scope `~/.dotnet`)

Installs to `~/.dotnet`, entirely without sudo — and the later Tizen-workload step will not need sudo either (the SDK directory is user-owned). (Note: system paths like `/usr/bin` or `/usr/lib/dotnet` are root-only, so *no* installer can write there without sudo — if you need a system-wide install, use Method C2.)

```bash
# Install .NET 8 SDK (no sudo)
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0

# Update environment (effective in new terminal; add to ~/.bashrc to persist)
export DOTNET_ROOT=$HOME/.dotnet
export PATH=$DOTNET_ROOT:$PATH
```

> If an already-open shell fails with "No such file or directory" for `dotnet` (e.g. it remembers a since-removed `/usr/bin/dotnet`), its command-path cache is stale — run `hash -r` (bash) / `rehash` (zsh), or open a new terminal.

##### Method C2: Package Manager (system-wide — requires sudo)

Installs root-owned into `/usr/lib/dotnet` (with `/usr/bin/dotnet` on PATH). Because that directory is root-owned, **the Tizen-workload step will then also need sudo** (see Issue 2 / `TIZEN_SDK_DOTNET_E003`). Method C1 avoids both.

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y dotnet-sdk-8.0

# RHEL/CentOS
sudo dnf install -y dotnet-sdk-8.0
```

##### With Corporate Proxy

```bash
export http_proxy=http://[proxy-host]:[port]
export https_proxy=http://[proxy-host]:[port]
export ftp_proxy=http://[proxy-host]:[port]

# Then run the installation command above
```

**Step 1-2: Install Tizen .NET Workload (Manual Script)**

Open a new terminal:

```bash
# Direct script execution
bash "$HOME/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# Or with sudo — only needed when the SDK is root-owned (apt/dnf install); a ~/.dotnet SDK never needs it
sudo bash "$HOME/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# With options
bash "...tizen-dotnet-setup.sh" --force
bash "...tizen-dotnet-setup.sh" --version "10.0.123"
bash "...tizen-dotnet-setup.sh" --no-install-sdk
bash "...tizen-dotnet-setup.sh" --sdk-channel "9.0"
```

**Script automatically:**
1. Detects .NET SDK — and if none exists anywhere, auto-installs one user-scope into `~/.dotnet` (no sudo; skip with `--no-install-sdk`)
2. Runs Samsung's workload-install.sh
3. Verifies workload installation
4. Outputs `[DIAG]` information if there are issues

---

## macOS Installation

### Step 1: Integrated .NET SDK and Tizen Workload Setup (Recommended)

#### Method A: Using Claude Code / Cline Agent (Easiest)

**Example requests:**

> "Setup .NET development environment for Tizen"
> or
> "tizen dotnet setup"

**More request examples** (you speak to the agent in natural language, not in flags):

> "Force-reinstall the Tizen workload" → passes `--force` to the runner
> "Install Tizen workload version 10.0.123" → passes `--workload-version 10.0.123` to the runner

#### Method B: Using tizen-cli Command

```bash
# Setup Tizen .NET environment
tizen-cli tizen-sdk dotnet-setup

# With options
tizen-cli tizen-sdk dotnet-setup --force
tizen-cli tizen-sdk dotnet-setup --workload-version 10.0.123
```

#### Method C: Manual Setup (Step-by-step)

**Step 1-1: Install .NET SDK**

##### Method C1: Homebrew (Recommended)

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install .NET SDK
brew install --cask dotnet-sdk

# Or specific version
brew install --cask dotnet-sdk@8
```

##### With Corporate Proxy

```bash
export ALL_PROXY=http://[proxy-host]:[port]

# Then run brew install
brew install --cask dotnet-sdk
```

##### Method C2: Official Installer

1. Visit [https://dotnet.microsoft.com/download](https://dotnet.microsoft.com/download)
2. Download macOS version
3. Run the `.pkg` file

**Step 1-2: Install Tizen .NET Workload (Manual Script)**

Open a new terminal:

```bash
# Direct script execution
bash "$HOME/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# With options
bash "...tizen-dotnet-setup.sh" --force
bash "...tizen-dotnet-setup.sh" --version "10.0.123"
```

**Script automatically:**
1. Detects .NET SDK
2. Runs Samsung's workload-install.sh
3. Verifies workload installation
4. Outputs `[DIAG]` information if there are issues

---

## Verification and Troubleshooting

### Verify Installation

```bash
# Check .NET SDK version
dotnet --version

# List installed SDKs
dotnet --list-sdks

# Check Tizen workload
dotnet workload list
```

Success looks like:

```
Installed Workload Id      Manifest Version      Installation Source
--------------------------------------------------------------------
tizen                      10.0.123/10.0.300    SDK 10.0.302
```

### Common Issues

#### Issue 1: "Tizen workload not found after installation"

**Cause**: Workload was installed into a different .NET SDK version

**Diagnosis**: Look for `[DIAG]` lines in script output (exit code 3):

```
[DIAG] dotnet_version=10.0.302
[DIAG] sdk_band=10.0.300
[DIAG] installer_checked_bands=9.0.300
[DIAG] manifest_found_in_bands=9.0.300
[DIAG] permission_denied=false
```

The dotnet in use is on band `10.0.300`, but the installer only handled band `9.0.300` — and that is the only band holding a manifest.

**Solution**:

```powershell
# Windows: Clear DOTNET_ROOT environment variable
$env:DOTNET_ROOT = ""

# Linux/macOS: Unset DOTNET_ROOT
unset DOTNET_ROOT

# Then run again
```

> If `[DIAG] permission_denied=true`, this is a **permission problem**, not a band mismatch. The script returns exit code 1 (not 3) in that case — apply the fix from "Issue 2" below first.

#### Issue 2: "Access Denied" or "Permission Denied" (error code `TIZEN_SDK_DOTNET_E003`)

**Cause**: The .NET SDK directory is not writable

**Especially common on Ubuntu**: an `apt`-installed .NET SDK lives in root-owned `/usr/lib/dotnet`. Installing the workload writes into that directory, so it needs sudo. The Agent/tizen-cli runner is **non-interactive and cannot prompt for a sudo password**, so the script's internal sudo retry cannot run. In this case the envelope's `suggested_fix.command` carries the exact command to run.

**Solution**:

```powershell
# Windows: open an Administrator PowerShell (Start menu → right-click PowerShell → Run as Administrator)
# and run the envelope's suggested_fix.command as-is — e.g.:
powershell -ExecutionPolicy Bypass -File "C:\Users\[username]\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.0.0\scripts\tizen-dotnet-setup\tizen-dotnet-setup.ps1"

# Linux/macOS: run the envelope's suggested_fix.command as-is (the manual script under sudo)
sudo bash "$HOME/.tizen/plugins/tizen-sdk/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# Then re-run the original command to verify
tizen-cli tizen-sdk dotnet-setup
```

> **Sudo-free alternative**: install a user-scope SDK into `~/.dotnet` (`curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0`), then re-run the setup. `~/.dotnet` is user-owned, so neither the SDK nor the workload step ever needs sudo.

#### Issue 3: Proxy Errors

**Diagnosis**:

```bash
# Test proxy connectivity
curl -x http://[proxy-host]:[port] https://api.nuget.org/v3/index.json
```

**Solution**:

```powershell
# Windows
winget settings --enable ProxyCommandLineOptions
winget install Microsoft.DotNet.SDK.8 --proxy http://[proxy]:[port]

# Linux/macOS
export http_proxy=http://[proxy]:[port]
export https_proxy=http://[proxy]:[port]
```

#### Issue 4: ".NET SDK not found" (error code `TIZEN_SDK_DOTNET_E001`)

**Cause**: no .NET SDK exists anywhere, **and** the script's own user-scope auto-install was skipped (`--no-install-sdk`) or failed — a failed auto-install usually means the machine is offline or behind a proxy (set `http_proxy`/`https_proxy` and re-run).

**Solution** — this is a **two-step flow**:

```bash
# Step 1: install the SDK (the envelope's suggested_fix.command — no sudo, installs to ~/.dotnet)
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0

#   (system-wide alternative — requires sudo, and the workload step will then need sudo too)
sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0

# Step 2: re-run the same setup — the re-run is what installs the Tizen workload
tizen-cli tizen-sdk dotnet-setup
```

> **Installing the SDK alone does not finish the setup.** The Tizen workload is installed by the re-run. Also, an apt/dnf-installed SDK is root-owned, so the re-run may come back with the Issue 2 permission guidance (`sudo bash <script>`) — run that command as printed. The user-scope `~/.dotnet` route avoids that entirely.

### Script Diagnostic Information

If the installation script fails, it outputs detailed `[DIAG]` information:

```
[DIAG] dotnet_path=...                    # Real dotnet path, with symlinks resolved
[DIAG] dotnet_version=...                 # .NET SDK version
[DIAG] dotnet_root=...                    # .NET installation directory
[DIAG] sdk_band=...                       # SDK feature band (e.g., 10.0.300)
[DIAG] env_dotnet_root=...                # DOTNET_ROOT environment variable value
[DIAG] installer_pinned_dir=...           # Directory pinned with -d (may be "(not pinned)")
[DIAG] installer_update_all=...           # Whether -u (walk every band) was used
[DIAG] installer_checked_sdks=...         # EVERY SDK the Samsung installer handled
[DIAG] installer_checked_bands=...        # Feature bands of those SDKs
[DIAG] manifest_expected=...              # Where the workload manifest should be
[DIAG] manifest_found_in_bands=...        # Bands where the workload was actually found
[DIAG] workload_version_line=...          # Output from dotnet workload list
[DIAG] permission_denied=...              # Whether a permission issue occurred
```

This information helps diagnose the exact problem.

**Read it in this order:**

1. `permission_denied=true` → it is a permission problem. Everything else is a consequence, so fix the permissions first (exit code 1).
2. `sdk_band` missing from `installer_checked_bands` or `manifest_found_in_bands` → band mismatch (exit code 3). Clear `DOTNET_ROOT` and re-run.
3. `installer_pinned_dir=(not pinned)` → the resolved dotnet path had no `sdk` directory, so `-d` pinning was skipped. Check that `dotnet_path` really is the install you intend to use.

> `installer_checked_sdks` lists **every** SDK the installer handled. Under `-u` (`installer_update_all=true`) the installer walks all installed SDKs, so the last line alone must never be read as "the install target".

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / already installed |
| 1 | Install failed (includes permission problems) |
| 2 | No .NET SDK found anywhere, and the user-scope auto-install was skipped (`--no-install-sdk`) or failed — the user must install it |
| 3 | Workload registered for a **different SDK band** than the dotnet in use |

---

## Next Steps

After workload installation is complete:

### 1. Create a Tizen .NET Project

#### Using Claude Code / Cline Agent

```
"Create a new .NET Tizen project"
or
"Create DotNET Tizen project named MyApp"
or
"Create a NUI app for Tizen"
```

#### Using tizen-cli Command

`--template` must name a template installed in your SDK, so list them first:

```bash
# 1. List the available DotNET templates
tizen-cli tizen-sdk list-templates --type dotnet

# 2. Create using a template name from that list
tizen-cli tizen-sdk create-project \
  --type dotnet \
  --template <template name from step 1> \
  --parent-path ./projects \
  --name MyApp
```

`--type`, `--template`, `--parent-path` and `--name` are all **required**. The app folder is created inside `--parent-path`, named after `--name`.

> Always scaffold through this skill. Never hand-write project files such as `tizen-manifest.xml`.

### 2. Build the Project

#### Using Claude Code / Cline Agent

```
"Build the Tizen project"
or
"Build MyApp"
```

#### Using tizen-cli Command

```bash
tizen-cli tizen-sdk build-project \
  --project ./projects/MyApp \
  --build-type Debug
```

`--build-type` is one of `Debug` (default), `Release` or `Test`. If you plan to debug, build **`Debug`** — a Release binary has no portable PDB, so breakpoints will never bind.

#### Manual Command

```bash
cd ./projects/MyApp
dotnet build
```

### 3. Deploy to Emulator

#### Using Claude Code / Cline Agent

```
"Install the app to emulator"
or
"Launch the app"
```

Note: You can specify the package path (.tpk) or project path.

#### Using tizen-cli Command

```bash
# 1. Check emulator connection
sdb devices

# 2. Install and launch in one step (--run)
tizen-cli tizen-sdk install-app \
  --package ./projects/MyApp/Debug/MyApp-1.0.0.tpk \
  --run
```

The flag is `--package` and it must point at the **`.tpk` file**, not the project folder. Install and launch are one command, so there is no separate run command.

#### Manual Command

```bash
# Install
sdb install ./projects/MyApp/Debug/MyApp-1.0.0.tpk

# Launch (find the app ID in tizen-manifest.xml)
sdb shell app_launcher -s org.tizen.myapp
```

---

## References

- [Official Tizen .NET Guide](https://docs.tizen.org/application/dotnet/)
- [.NET SDK Downloads](https://dotnet.microsoft.com/download)
- [Tizen Emulator Installation](../emulator/)
- [SDK Verification](SDK_INSTALLATION_VERIFICATION.en.md)
- [Custom Repository Installation](CUSTOM_REPOSITORY_INSTALL.en.md)

---

## Bug Reports

If you encounter issues during installation:

1. Capture the `[DIAG]` lines
2. Record the exact error message
3. Note your platform and OS version
4. [File an issue](https://github.com/Samsung/tizen-agent-skills/issues)
