#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-dotnet-debug.ps1
#
# Remote .NET debugging for Tizen DotNET apps with netcoredbg (Windows PowerShell).
# Unlike native gdb debugging, netcoredbg runs ON THE DEVICE - there is no host
# debugger to resolve, no init file, and attach mode needs no port forward.
#   - Launch mode (-Launch, the runner's default): the app framework starts the app UNDER
#                            netcoredbg as a DAP server (suspended before Main until a
#                            client connects); the port is forwarded so VS Code can
#                            attach from the host. The app shows NO UI until VS Code
#                            connects - that is expected.
#   - Attach mode (no -Launch): start the app normally, find its PID, then hand the user
#                            a one-line `sdb shell netcoredbg --interpreter=cli --attach`
#                            command. Misses Main(), and a normally-launched Tizen .NET
#                            app has no CoreCLR debug transport, so this usually fails
#                            (0x80131c08). Only for users who explicitly ask for it.
#
# The debugger binary comes from the SDK's on-demand packages
# (<sdk>\platforms\tizen-*\common\on-demand\netcoredbg-<ver>-<arch>.tar.gz) and is
# installed once to /home/owner/share/tmp/sdk_tools/netcoredbg on the device.
#
# Usage:
#   .\tizen-dotnet-debug.ps1 -App <APP_ID> [-Port 4711] [-Serial <serial>] `
#       [-Breakpoints "Program.cs:25"] [-Timeout 30] [-Launch] [-ForceInstall] [-SetupOnly]

param(
    # Short aliases (-a/-p/-s/-x/-t/-l/-f/-N) match the bash script's flags and the docs.
    [Parameter(Mandatory=$false)][Alias('a')][string]$App,
    [Parameter(Mandatory=$false)][Alias('p')][int]$Port = 4711,
    [Parameter(Mandatory=$false)][Alias('s')][string]$Serial = "",
    [Parameter(Mandatory=$false)][Alias('x')][string]$Breakpoints = "",
    [Parameter(Mandatory=$false)][Alias('t')][int]$Timeout = 30,
    [Alias('l')][switch]$Launch,
    [Alias('f')][switch]$ForceInstall,
    [Alias('N')][switch]$SetupOnly,
    [switch]$Help
)

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# Where netcoredbg lives on the device (standard SDK on-demand tools location,
# owner-writable so no smack fights during extraction).
$NcdbgDeviceDir = "/home/owner/share/tmp/sdk_tools/netcoredbg"
$NcdbgBin       = "$NcdbgDeviceDir/netcoredbg"
$DeviceTmpTar   = "/home/owner/share/tmp/netcoredbg.tar.gz"

function Show-Usage {
    Write-Host @"
Usage: .\tizen-dotnet-debug.ps1 -App <APP_ID> [OPTIONS]

Required:
  -App <APP_ID>          Package ID of the .NET app to debug (e.g. org.tizen.example.MyApp)

Optional:
  -Port <PORT>           DAP server port, launch mode only (default: 4711)
  -Serial <SERIAL>       Device serial (default: first connected device)
  -Breakpoints "f:l,..." Suggested breakpoints, e.g. "Program.cs:25,App.cs:10".
                         Printed as ready-to-type CLI commands (netcoredbg has no init file).
  -Timeout <SEC>         PID lookup timeout in seconds (default: 30, attach mode only)
  -Launch                Launch mode (RECOMMENDED; the CLI runner's default): the app starts
                         UNDER netcoredbg as a DAP server and suspends before Main() until a
                         client (VS Code) connects - it shows no UI until then.
                         Without -Launch the script runs attach mode, which misses Main()
                         and usually fails on Tizen (no CoreCLR debug transport).
  -ForceInstall          Redeploy netcoredbg to the device even if already installed
  -SetupOnly             Attach mode: print the netcoredbg CLI command and EXIT instead
                         of running it interactively. Use when an agent runs the script.
                         (Launch mode is inherently setup-only.)
  -Help                  Show this help

Examples:
  # Launch mode (recommended) - DAP server catches Main(); connect VS Code to localhost:4711
  .\tizen-dotnet-debug.ps1 -App org.tizen.example.MyApp -Launch

  # Attach mode - interactive netcoredbg CLI on the running app (limited on Tizen)
  .\tizen-dotnet-debug.ps1 -App org.tizen.example.MyApp -Breakpoints "MyApp.cs:42"
"@
}

# ---------------------------------------------------------------------------
# Helpers  (Invoke-SdbLine — one-line `sdb shell` on $Sdb/$Serial — comes from
# lib\common.ps1)
# ---------------------------------------------------------------------------

# Detect the device CPU architecture and map it to the on-demand tar arch name.
# Returns $null for an unsupported arch (caller errors out with the raw value).
function Get-DeviceArch {
    $raw = Invoke-SdbLine "uname -m"
    $mapped = switch -Regex ($raw) {
        'x86_64'        { 'x86_64';  break }
        'i[3-6]86|^x86$'{ 'i686';    break }
        'aarch64'       { 'aarch64'; break }
        '^arm'          { 'armv7l';  break }
        'riscv64'       { 'riscv64'; break }
        default         { $null }
    }
    if (-not $mapped) { Write-Err "Unsupported device architecture: '$raw'" }
    else { Write-Info "Device architecture: $raw -> $mapped" }
    return $mapped
}

# Find the newest netcoredbg tar.gz for the arch across all installed platform
# versions. Do NOT hardcode a version - e.g. riscv64 only ships 3.1.0.1.
function Find-NetcoredbgTar {
    param([string]$Arch)
    $platformsDir = Join-Path (Get-SdkPath) "platforms"
    if (-not (Test-Path $platformsDir)) { return $null }
    $best = $null
    $bestVer = [version]"0.0"
    $platDirs = Get-ChildItem -Path $platformsDir -Directory -Filter "tizen-*" -ErrorAction SilentlyContinue
    foreach ($plat in $platDirs) {
        $onDemand = Join-Path (Join-Path $plat.FullName "common") "on-demand"
        if (-not (Test-Path $onDemand)) { continue }
        $tars = Get-ChildItem -Path $onDemand -File -Filter "netcoredbg-*-$Arch.tar.gz" -ErrorAction SilentlyContinue
        foreach ($tar in $tars) {
            if ($tar.Name -match 'netcoredbg-([0-9][0-9.]*)-') {
                try { $v = [version]$Matches[1] } catch { continue }
                if ($v -gt $bestVer) { $bestVer = $v; $best = $tar.FullName }
            }
        }
    }
    return $best
}

function Test-NetcoredbgInstalled {
    return ((Invoke-SdbLine "test -x $NcdbgBin && echo ok") -eq "ok")
}

# Push the tar.gz and extract it into the sdk_tools dir. Falls back to
# `gzip -dc | tar -xf -` for busybox tar builds without -z support.
function Install-Netcoredbg {
    param([string]$TarPath)
    Write-Info "Installing netcoredbg from: $TarPath"
    Invoke-SdbLine "mkdir -p /home/owner/share/tmp/sdk_tools" | Out-Null
    & $Sdb -s $Serial push "$TarPath" $DeviceTmpTar
    if ($LASTEXITCODE -ne 0) { Write-Err "Failed to push netcoredbg package to the device"; exit 1 }
    Invoke-SdbLine "cd /home/owner/share/tmp/sdk_tools && (tar -xzf $DeviceTmpTar 2>/dev/null || (gzip -dc $DeviceTmpTar | tar -xf -))" | Out-Null
    Invoke-SdbLine "chmod +x $NcdbgBin 2>/dev/null; rm -f $DeviceTmpTar" | Out-Null
    if (-not (Test-NetcoredbgInstalled)) {
        Write-Err "netcoredbg extraction failed on device (expected $NcdbgBin)"
        exit 1
    }
    Write-Success "netcoredbg installed at $NcdbgBin"
}

# Poll for the app PID until $Timeout. Returns the PID string, or $null.
# NOTE: NEVER pidof here - .NET apps run under dotnet-launcher, so only the process
# CMDLINE carries the app id. `grep -v netcoredbg` keeps a stale debugger process
# (whose cmdline also contains the app id) from being mistaken for the app.
function Wait-AppPid {
    param([string]$AppId)
    $elapsed = 0
    while ($elapsed -lt $Timeout) {
        $candidate = ((Invoke-SdbLine "pgrep -f $AppId 2>/dev/null | head -1") -split '\s+')[0]
        if (-not $candidate) {
            $candidate = Invoke-SdbLine "ps -ef | grep $AppId | grep -v grep | grep -v netcoredbg | awk '{print `$2}' | head -1"
        }
        if ($candidate -match '^\d+$') { return $candidate }
        Start-Sleep -Seconds 1
        $elapsed += 1
    }
    return $null
}

# Best-effort wait until the forwarded port accepts a TCP connection.
# Port readiness check removed: connecting to the DAP server port (TCP connect) causes
# netcoredbg to interpret it as a client session termination → it closes itself.
# Instead, we rely on /proc/net/tcp inspection (from sdb shell) to verify the port is LISTEN,
# without actually connecting. Verification done by caller if needed; here we just proceed.

# Check for .pdb files - netcoredbg reads portable PDBs next to the dlls inside the
# app dir, so a Release build can't bind breakpoints. Returns $true if pdbs found, $false otherwise.
function Test-DevicePdbs {
    param([string]$AppId)
    $bases = "/opt/usr/globalapps/$AppId/bin /opt/usr/apps/$AppId/bin"
    $pdb = Invoke-SdbLine "find $bases -name '*.pdb' 2>/dev/null | head -1"
    if ($pdb) {
        Write-Info "Debug symbols found: $pdb"
        return $true
    }
    return $false
}

# ---------------------------------------------------------------------------
# Help & validation
# ---------------------------------------------------------------------------
if ($Help) { Show-Usage; exit 0 }
if (-not $App) { Write-Err "Application ID is required (-App)"; exit 1 }

# The app id is spliced into `sdb shell "..."` strings executed as root on the
# device - reject anything beyond the characters a real app id uses.
if ($App -notmatch '^[A-Za-z0-9._-]+$') { Write-Err "Invalid app ID: $App"; exit 1 }

# ---------------------------------------------------------------------------
# Resolve sdb from the SDK (tools\sdb.exe), so it works when sdb is not on PATH.
# ---------------------------------------------------------------------------
$Sdb = Find-TizenTool "sdb"
if (-not $Sdb) { exit 1 }
Write-Info "Using sdb: $Sdb"

# ---------------------------------------------------------------------------
# Step 1: Check device connection
# ---------------------------------------------------------------------------
Write-Step "1/6 Checking device connection..."
if (-not $Serial) { $Serial = Get-DeviceSerial $Sdb }
if (-not $Serial) {
    Write-Host "No devices found. Device manager will be invoked to create/launch an emulator." -ForegroundColor Yellow
    exit 1  # Signal caller to invoke device manager
}
Write-Info "Target device: $Serial"
& $Sdb devices

# ---------------------------------------------------------------------------
# Refuse Web apps: a .wgt runs inside the web runtime (no CoreCLR process), so
# netcoredbg cannot debug it. A wgt app id is "<pkgid>.<name>" - look the pkgid
# up in the device package list and bail out if its type is wgt.
# ---------------------------------------------------------------------------
$pkgIdCandidate = $App.Split('.')[0]
$pkgLines = & $Sdb -s $Serial shell "pkgcmd -l" 2>$null
foreach ($line in @($pkgLines)) {
    if ("$line" -match '\[wgt\]' -and "$line".Contains("[$pkgIdCandidate]")) {
        Write-Err "'$App' is a Web app (wgt) - .NET debugging is not supported for Web apps."
        Write-Info "Web apps run inside the web runtime; there is no CoreCLR process to attach netcoredbg to."
        Write-Info "Use the tizen-webapp-debug skill instead - it sets up RWI/CDP (Chrome DevTools) debugging."
        exit 1
    }
}

# Root gives ptrace + access to the app's bin/. Best-effort: production devices
# may refuse, in which case attach may still work for owner-run apps.
& $Sdb -s $Serial root on 2>$null | Out-Null

# ---------------------------------------------------------------------------
# Step 2: Ensure netcoredbg is installed on the device
# ---------------------------------------------------------------------------
Write-Step "2/6 Checking netcoredbg on device..."
if ((Test-NetcoredbgInstalled) -and -not $ForceInstall) {
    Write-Info "netcoredbg already installed at $NcdbgBin (use -ForceInstall to redeploy)"
} else {
    $arch = Get-DeviceArch
    if (-not $arch) { exit 1 }
    $tar = Find-NetcoredbgTar $arch
    if (-not $tar) {
        Write-Err "netcoredbg package for '$arch' not found under $(Join-Path (Get-SdkPath) 'platforms')\tizen-*\common\on-demand\"
        Write-Info "Install the platform's on-demand tools with Package Manager (or the tizen-sdk-install skill), then retry."
        exit 1
    }
    Install-Netcoredbg $tar
}

# ---------------------------------------------------------------------------
# Step 3: Preflight - Debug-build check, clear stale debuggers
# ---------------------------------------------------------------------------
Write-Step "3/6 Preflight checks..."
$pdbCheck = Test-DevicePdbs $App
if (-not $pdbCheck) {
    Write-Host ""
    Write-Host "⚠️  CRITICAL: No .pdb files found - this app was built with Release configuration." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Breakpoints WILL NOT WORK. To debug, you MUST:" -ForegroundColor Yellow
    Write-Host "  1. Rebuild with Debug configuration:  tz build -b Debug" -ForegroundColor Yellow
    Write-Host "  2. Reinstall the app with tizen-install-app skill (use -RunAfterInstall flag)" -ForegroundColor Yellow
    Write-Host "  3. Then retry tizen-dotnet-debug" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
# A stale netcoredbg would both hold the old app process and poison pgrep -f.
Invoke-SdbLine "pkill -f netcoredbg 2>/dev/null" | Out-Null
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Steps 4-6 (with cleanup only for the interactive-attach path)
# ---------------------------------------------------------------------------
# Resolve the LAUNCHABLE app id before either mode touches the app. $App is
# documented as the PACKAGE id; the id the launcher knows can differ
# (<pkgid>.<name>), and launch_app / app_launcher -s with an unknown id silently
# do nothing - which surfaced as "debug launch never shows the app" (issue #97).
# The .pdb check above deliberately still uses $App: /opt/usr/*apps/<pkgid>.
$LaunchAppId = Resolve-AppId $Sdb $Serial $App
if (-not $LaunchAppId) {
    Write-Err "App '$App' is not installed on $Serial (not listed by app_launcher -l)."
    Write-Info "Install it first (tizen-install-app), then retry. Apps currently listed:"
    $listed = Invoke-Native -Exe $Sdb -Arguments @('-s', $Serial, 'shell', 'app_launcher -l')
    @($listed) | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    exit 1
}
if ($LaunchAppId -ne $App) {
    Write-Info "Resolved launchable app id: $LaunchAppId (package id: $App)"
}
Write-Output "APP_LAUNCH_ID=$LaunchAppId"

$AppPid = $null
try {
    if ($Launch) {
        # Step 4 (launch): start the app UNDER netcoredbg via AUL bundle keys.
        Write-Step "4/6 Launching app under netcoredbg DAP server (port $Port)..."
        # Kill any existing instance (single-instance apps must be stopped before re-launch).
        Invoke-SdbLine "app_launcher -t $LaunchAppId 2>/dev/null || app_launcher -k $LaunchAppId 2>/dev/null" | Out-Null
        Start-Sleep -Seconds 1
        # Use the official Tizen AUL debugger contract: launch_app with __AUL_SDK__ NETCOREDBG
        # and __DLP_DEBUG_ARG__ containing the netcoredbg args (--interpreter=vscode for VS Code,
        # --engineLogging for diagnostics, --server=<port>,-- for the DAP listening port). The AUL
        # system wraps the app's startup with netcoredbg, suspending it before Main() until the
        # DAP client connects.
        $dlpArgs = "__AUL_SDK__ NETCOREDBG __DLP_DEBUG_ARG__ --interpreter=vscode,--engineLogging,--server=$Port,--"
        Write-Info "Starting app under netcoredbg DAP server..."
        # Keep launch_app's output: sdb shell never propagates the remote exit code, so
        # this text is the only evidence when the platform refuses the debug launch.
        $launchOutput = @(Invoke-Native -Exe $Sdb -Arguments @('-s', $Serial, 'shell', "launch_app $LaunchAppId $dlpArgs") -MergeStderr) |
            ForEach-Object { ("$_" -replace "`r", "").Trim() } | Where-Object { $_ }
        foreach ($l in $launchOutput) { Write-Host "  launch_app: $l" -ForegroundColor Gray }
        # Verify the DAP server process actually appeared - the only reliable signal.
        $found = $false
        for ($i = 0; $i -lt 10; $i++) {
            if (Invoke-SdbLine "pgrep -f netcoredbg 2>/dev/null | head -1") { $found = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $found) {
            Write-Err "netcoredbg DAP server did not start for '$LaunchAppId'."
            if ($launchOutput.Count -gt 0) {
                Write-Err ("launch_app output: " + (($launchOutput | Select-Object -First 3) -join ' '))
            }
            Write-Info "The platform image must support SDK debug launch (__AUL_SDK__). Emulator/dev images do; some production images refuse."
            exit 1
        }
        Write-Output "APP_STATE=suspended_under_debugger"
        Write-Success "App '$LaunchAppId' is running under netcoredbg, SUSPENDED before Main()."
        Write-Info "It shows NO window until a debugger client (VS Code F5) connects - that is expected, not a failed launch."

        # Step 5 (launch): forward the DAP port to the host.
        Write-Step "5/6 Forwarding port $Port..."
        & $Sdb -s $Serial forward "tcp:$Port" "tcp:$Port"
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Port forward failed (tcp:$Port -> tcp:$Port)."
            Write-Info "The host port may be in use - retry with a different -Port."
            exit 1
        }
        Write-Info "Port $Port forwarded (host -> device)"
        Write-Info "DAP server port is ready (connectivity check skipped to avoid killing the server)"

        # Step 6 (launch): tell the user how to connect. Everything stays running.
        Write-Step "6/6 Ready for a DAP client"
        Write-Host ""
        Write-Success "netcoredbg is listening on device port $Port; host tcp:$Port is forwarded."
        Write-Info "Connect VS Code to the netcoredbg DAP server."
        Write-Host ""
        Write-Host "CRITICAL: Follow these steps IN ORDER:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "STEP 1: Create .vscode/launch.json in the workspace root" -ForegroundColor Yellow
        Write-Host "  Path: <WORKSPACE_ROOT>/.vscode/launch.json"
        Write-Host "  Copy-paste the following JSON structure:"
        Write-Host ""
        Write-Host "    {"
        Write-Host '      "version": "0.2.0",'
        Write-Host '      "configurations": ['
        Write-Host '        {'
        Write-Host '          "name": "Tizen .NET (netcoredbg)",'
        Write-Host '          "type": "coreclr",'
        Write-Host '          "request": "launch",'
        Write-Host '          "program": "${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0/<APP_FOLDER_NAME>.dll",'
        Write-Host '          "cwd": "${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0",'
        Write-Host "          `"debugServer`": $Port,"
        Write-Host '          "stopAtEntry": false'
        Write-Host '        }'
        Write-Host '      ]'
        Write-Host '    }'
        Write-Host ""
        Write-Host "  Replace <APP_FOLDER_NAME> with your app's folder name (e.g., MyTizenNuiApp2 or MyTizenNUI5)"
        Write-Host ""
        Write-Host "STEP 2: Open your project folder in VS Code" -ForegroundColor Yellow
        Write-Host "  In VS Code: File → Open Folder"
        Write-Host "  Select your project's workspace root folder (e.g., C:\Users\<username>\MyTizenNUI5)"
        Write-Host "  Click 'Select Folder'"
        Write-Host ""
        Write-Host "STEP 3: Set a breakpoint and press F5" -ForegroundColor Yellow
        Write-Host "  1. In VS Code code editor, click the margin next to a line number to set a red breakpoint dot"
        Write-Host "  2. Press F5 to start debugging"
        Write-Host "  3. VS Code will connect to port $Port and break at your breakpoint"
        Write-Host ""
        Write-Info "Note: The app is SUSPENDED before Main() and shows no window until F5 starts the VS Code debug session - this is expected, not a failed launch. Startup breakpoints will hit."
        Write-Info "(The app, netcoredbg DAP server, and port forward stay in place - you can disconnect and reconnect.)"
    }
    else {
        # Step 4 (attach): start the app normally and resolve its PID.
        Write-Step "4/6 Launching app and resolving PID (attach mode)..."
        $launchOutput = @(Invoke-Native -Exe $Sdb -Arguments @('-s', $Serial, 'shell', "app_launcher -s $LaunchAppId") -MergeStderr) |
            ForEach-Object { ("$_" -replace "`r", "").Trim() } | Where-Object { $_ }
        foreach ($l in $launchOutput) { Write-Host "  app_launcher: $l" -ForegroundColor Gray }
        Start-Sleep -Seconds 2
        $AppPid = Wait-AppPid $LaunchAppId
        if (-not $AppPid) {
            Write-Err "Could not find PID for $LaunchAppId after ${Timeout}s"
            & $Sdb -s $Serial shell "ps -ef | grep $LaunchAppId" 2>$null
            exit 1
        }
        Write-Info "App PID: $AppPid"

        # CoreCLR only creates its debugger transport (/tmp/clr-debug-pipe-<pid>-*) when
        # the app was STARTED with debugging enabled. A normally-launched Tizen app has
        # none (verified: netcoredbg --attach then fails with 0x80131c08), and the AUL
        # debugger contract (/usr/share/aul/dotnet.debugger) only defines launch-under-
        # netcoredbg. Pre-check and fail fast with real guidance instead of handing the
        # user a command that cannot work.
        $pipe = Invoke-SdbLine "ls /tmp/clr-debug-pipe-$AppPid-* 2>/dev/null | head -1"
        if (-not $pipe) {
            Write-Err "This app has no CoreCLR debug transport (/tmp/clr-debug-pipe-$AppPid-*), so netcoredbg cannot attach (error 0x80131c08)."
            Write-Info "Tizen starts normally-launched .NET apps without the debugger transport. Use LAUNCH mode instead:"
            Write-Info "  re-run this script with -l  - the app restarts under a netcoredbg DAP server (catches Main) and VS Code connects to the forwarded port."
            exit 1
        }

        # Step 5 (attach): no forward needed - the CLI runs on the device over sdb shell.
        Write-Step "5/6 Port forwarding not needed (attach mode uses the sdb shell directly)"

        # Step 6 (attach): hand over (SetupOnly) or run the CLI interactively.
        Write-Step "6/6 Preparing netcoredbg CLI session..."
        $ncdbgCmd = "$NcdbgBin --interpreter=cli --attach $AppPid"
        Write-Host ""
        if ($SetupOnly) {
            Write-Success "Setup complete - app is running (PID $AppPid) and netcoredbg is installed."
            Write-Info "To debug, run the netcoredbg CLI in an interactive terminal:"
            Write-Host ""
            Write-Host "  PowerShell:       & `"$Sdb`" -s $Serial shell `"$ncdbgCmd`""
            Write-Host "  Command Prompt:   `"$Sdb`" -s $Serial shell `"$ncdbgCmd`""
            Write-Host ""
            Write-Info "(The leading & is required only in PowerShell; omit it in cmd.)"
            if ($Breakpoints) {
                Write-Info "At the ncdb> prompt, set your breakpoints, then continue:"
                foreach ($bp in ($Breakpoints -split ",")) {
                    $t = $bp.Trim()
                    if ($t) { Write-Host "    b $t" }
                }
                Write-Host "    continue"
            } else {
                Write-Info "At the ncdb> prompt: b <File.cs:line>   bt   continue   quit"
            }
            Write-Info "Note: attach mode misses Main() startup - use -Launch to break from Main()."
        } else {
            Write-Step "Starting netcoredbg CLI session"
            if ($Breakpoints) { Write-Info "Suggested breakpoints (type at ncdb>): $(($Breakpoints -split ',' | ForEach-Object { 'b ' + $_.Trim() }) -join '; ')" }
            & $Sdb -s $Serial shell "$ncdbgCmd"
        }
    }
}
finally {
    # Interactive attach: the CLI session has ended, so detach/kill the debugger.
    # SetupOnly and launch mode intentionally leave everything running.
    if (-not $SetupOnly -and -not $Launch) {
        Invoke-SdbLine "pkill -f netcoredbg 2>/dev/null" | Out-Null
    }
}
