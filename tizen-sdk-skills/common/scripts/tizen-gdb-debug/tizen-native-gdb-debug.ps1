#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-native-gdb-debug.ps1
#
# Remote GDB debugging for Tizen Native apps (Windows PowerShell).
#   - Attach mode (default): launch the app, then attach gdbserver to its PID.
#                            Good for callbacks invoked after attach (e.g. service_app_control).
#   - Launch mode (-Launch): gdbserver launches the binary directly and stops at the entry
#                            point before main(), so breakpoints in main/service_app_create hit.
#
# Usage:
#   .\tizen-native-gdb-debug.ps1 -App <APP_ID> -Binary <HOST_BINARY_WITH_SYMBOLS> `
#       [-Port 5039] [-Gdb gdb] [-Breakpoints "main,service_app_create"] [-Timeout 30] [-Launch]

param(
    # Short aliases (-a/-b/-p/-g/-x/-t/-l) match the bash script's flags and the docs.
    [Parameter(Mandatory=$false)][Alias('a')][string]$App,
    [Parameter(Mandatory=$false)][Alias('b')][string]$Binary,
    [Parameter(Mandatory=$false)][Alias('p')][int]$Port = 5039,
    [Parameter(Mandatory=$false)][Alias('g')][string]$Gdb = "gdb",
    [Parameter(Mandatory=$false)][Alias('x')][string]$Breakpoints = "",
    [Parameter(Mandatory=$false)][Alias('t')][int]$Timeout = 30,
    [Alias('l')][switch]$Launch,
    [Alias('N')][switch]$SetupOnly,
    [switch]$Help
)

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

function Show-Usage {
    Write-Host @"
Usage: .\tizen-native-gdb-debug.ps1 -App <APP_ID> -Binary <HOST_BIN> [OPTIONS]

Required:
  -App <APP_ID>          Package ID of the app to debug
  -Binary <PATH>         Path to the host binary with debug symbols

Optional:
  -Port <PORT>           Debug port (default: 5039)
  -Gdb <PATH>            GDB executable (default: auto-detect SDK gdb for the device arch, else PATH gdb)
  -Breakpoints "f1,f2"   Comma-separated breakpoints (e.g. "main,service_app_create")
  -Timeout <SEC>         PID lookup timeout in seconds (default: 30, attach mode only)
  -Launch                Launch mode: gdbserver launches the binary directly (catches main).
                         Default is attach mode, which misses main.
  -SetupOnly             Start gdbserver + forward the port + write the gdb init file,
                         print the gdb command, and EXIT (do not launch interactive gdb).
                         Use when an agent runs the script - then run the printed command
                         yourself in an interactive terminal.
  -Help                  Show this help

Examples:
  # Attach mode (default) - breaks at service_app_control
  .\tizen-native-gdb-debug.ps1 -App com.example.app -Binary .\Debug\app -Breakpoints "service_app_control"

  # Launch mode - breaks at main before any code runs
  .\tizen-native-gdb-debug.ps1 -App com.example.app -Binary .\Debug\app -Launch -Breakpoints "main,service_app_create"
"@
}

# ---------------------------------------------------------------------------
# Helpers  (Invoke-SdbLine — one-line `sdb shell` on $Sdb — comes from
# lib\common.ps1; this script selects no $Serial, so sdb's default target is used)
# ---------------------------------------------------------------------------

# Poll for the app PID until $Timeout. Returns the PID string, or $null.
# NOTE: pidof matches the EXECUTABLE name (e.g. mynativeapp), not the app id.
function Wait-AppPid {
    param([string]$ProcName)
    $elapsed = 0
    while ($elapsed -lt $Timeout) {
        $candidate = ((Invoke-SdbLine "pidof $ProcName") -split '\s+')[0]
        if ($candidate) { return $candidate }
        Start-Sleep -Seconds 1
        $elapsed += 1
    }
    return $null
}

# Best-effort wait until the forwarded port accepts a TCP connection.
function Wait-Port {
    for ($i = 0; $i -lt 5; $i++) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $client.Connect("localhost", $Port)
            $client.Close()
            return $true
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

# Resolve which GDB to use. An explicit -Gdb wins. Otherwise prefer the SDK-bundled
# gdb matching the device architecture (a generic `gdb` rarely exists / is wrong arch).
# Falls back to `gdb` on PATH. Returns the resolved gdb path/name.
function Resolve-Gdb {
    if ($Gdb -ne "gdb") { return $Gdb }

    $arch = Invoke-SdbLine "uname -m"
    $prefix = switch -Regex ($arch) {
        'x86_64'        { 'x86_64'; break }
        'i[36]86|^x86'  { 'i686';   break }
        'aarch64'       { 'aarch64'; break }
        '^arm'          { 'arm';    break }
        default         { '' }
    }

    # Search known SDK roots (env var may point at the wrong SDK, so also try defaults)
    $roots = @((Get-SdkPath), (Join-Path $env:USERPROFILE "tizen-sdk"), "C:\tizen-sdk") | Select-Object -Unique
    foreach ($root in $roots) {
        $toolsDir = Join-Path $root "tools"
        if (-not (Test-Path $toolsDir)) { continue }
        # Candidate gdb executables under tools/*/bin/ (e.g. x86_64-linux-gnu-gdb-15.1\bin\x86_64-linux-gnu-gdb.exe)
        $all = Get-ChildItem -Path $toolsDir -Recurse -Depth 2 -File -ErrorAction SilentlyContinue |
               Where-Object { $_.DirectoryName -match '[\\/]bin$' -and $_.Name -match 'gdb(\.exe)?$' }
        if ($prefix) {
            $m = $all | Where-Object { $_.Name -match $prefix } | Select-Object -First 1
            if ($m) { return $m.FullName }
        }
        $any = $all | Select-Object -First 1
        if ($any) { return $any.FullName }
    }
    return "gdb"
}

# ---------------------------------------------------------------------------
# Help & validation
# ---------------------------------------------------------------------------
if ($Help) { Show-Usage; exit 0 }

if (-not $App)    { Write-Err "Application ID is required (-App)"; exit 1 }
if (-not $Binary) { Write-Err "Binary path is required (-Binary)"; exit 1 }

# Both values are spliced into `sdb shell "..."` strings executed as root on the
# device - reject anything beyond the characters a real app id / binary name uses.
if ($App -notmatch '^[A-Za-z0-9._-]+$') { Write-Err "Invalid app ID: $App"; exit 1 }
$binNameCheck = [System.IO.Path]::GetFileName($Binary)
if ($binNameCheck -notmatch '^[A-Za-z0-9._+-]+$') { Write-Err "Invalid binary name: $binNameCheck"; exit 1 }

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
$deviceLines = & $Sdb devices 2>$null | Where-Object { $_ -match '\sdevice(\s|$)' }
if (-not $deviceLines) { Write-Err "No connected device found"; exit 1 }
& $Sdb devices

# ---------------------------------------------------------------------------
# Refuse Web apps BEFORE binary validation: a .wgt runs inside the web runtime
# (no native binary of its own), so GDB/gdbserver cannot debug it - and a web
# app request never has a valid -Binary, which would otherwise trigger a long
# filesystem auto-search below. A wgt app id is "<pkgid>.<name>" - look the
# pkgid up in the device package list and bail out if its type is wgt.
# ---------------------------------------------------------------------------
$pkgIdCandidate = $App.Split('.')[0]
$pkgLines = & $Sdb shell "pkgcmd -l" 2>$null
foreach ($line in @($pkgLines)) {
    if ("$line" -match '\[wgt\]' -and "$line".Contains("[$pkgIdCandidate]")) {
        Write-Err "'$App' is a Web app (wgt) - GDB debugging is not supported for Web apps."
        Write-Info "Web apps run inside the web runtime and have no native binary to attach to."
        Write-Info "Use the tizen-webapp-debug skill instead - it sets up RWI/CDP (Chrome DevTools) debugging."
        exit 1
    }
}

if (-not (Test-Path $Binary)) {
    # Auto-resolve: native build output is usually <project>\<BuildType>\tpk\bin\<exec>.
    # The given -Binary is often slightly off (e.g. Debug\bin vs Debug\tpk\bin), so
    # search nearby for the same filename, preferring a tpk\bin path.
    $binName = [System.IO.Path]::GetFileName($Binary)
    $resolved = $null
    $roots = @(
        (Split-Path -Parent (Split-Path -Parent $Binary)),
        (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Binary)))
    )
    foreach ($root in $roots) {
        if (-not $root -or -not (Test-Path $root)) { continue }
        # Never recurse from a drive root (e.g. "C:\") - that scans the whole disk.
        if ($root -match '^[A-Za-z]:\\?$') { continue }
        $cands = Get-ChildItem -Path $root -Recurse -File -Filter $binName -ErrorAction SilentlyContinue
        $resolved = $cands | Where-Object { $_.FullName -match 'tpk[\\/]bin' } | Select-Object -First 1
        if (-not $resolved) { $resolved = $cands | Where-Object { $_.FullName -match '[\\/]bin[\\/]' } | Select-Object -First 1 }
        if ($resolved) { break }
    }
    if ($resolved) {
        Write-Warn "Host binary not at $Binary"
        Write-Info "Using discovered host binary: $($resolved.FullName)"
        $Binary = $resolved.FullName
    } else {
        Write-Err "Host binary not found: $Binary"
        Write-Info "Native build output is usually at <project>\Debug\tpk\bin\<exec> (or Release\). Pass that with -Binary."
        exit 1
    }
}
$BinaryAbs = (Resolve-Path $Binary).Path

# Resolve host GDB (SDK bundle preferred, arch-matched) unless -Gdb was given
$Gdb = Resolve-Gdb
if ($Gdb -eq "gdb" -and -not (Get-Command gdb -ErrorAction SilentlyContinue)) {
    Write-Err "No GDB found (not in SDK tools, not on PATH)."
    Write-Info "Pass -Gdb <path-to-gdb> to specify the GDB path."
    exit 1
}
Write-Info "Using GDB: $Gdb"

# Enable root so gdbserver can ptrace/launch and read the app's bin/ (emulator/dev
# images). Best-effort: production devices may refuse, in which case we continue.
& $Sdb root on 2>$null | Out-Null

# ---------------------------------------------------------------------------
# Step 2: Locate gdbserver on device
# ---------------------------------------------------------------------------
Write-Step "2/6 Locating gdbserver on device..."
$GdbserverPath = Invoke-SdbLine "which gdbserver 2>/dev/null || echo /usr/bin/gdbserver"
$check = & $Sdb shell "test -f '$GdbserverPath' && echo ok" 2>$null
if ($check -notmatch "ok") { Write-Err "gdbserver not found at $GdbserverPath"; exit 1 }
Write-Info "gdbserver: $GdbserverPath"

# ---------------------------------------------------------------------------
# Step 3: Resolve the debug target (mode-specific) -> builds $GdbserverArgs
# ---------------------------------------------------------------------------
$BpList = $Breakpoints
$GdbserverArgs = ""
if ($Launch) {
    Write-Step "3/6 Resolving app binary on device (launch mode)..."
    $AppBinName = [System.IO.Path]::GetFileName($BinaryAbs)
    # Tizen installs to globalapps (newer images) or apps (older). bin/ is root-only.
    $bases = "/opt/usr/globalapps/$App/bin /opt/usr/apps/$App/bin"
    $DeviceBin = Invoke-SdbLine "find $bases -name '$AppBinName' -type f 2>/dev/null | head -1"
    if (-not $DeviceBin) {
        $DeviceBin = Invoke-SdbLine "find $bases -type f 2>/dev/null | head -1"
    }
    if (-not $DeviceBin) {
        Write-Err "Cannot find app binary on device at /opt/usr/apps/$App/bin/"
        Write-Info "Hint: make sure the app is installed (host binary: $AppBinName)"
        exit 1
    }
    Write-Info "Device binary: $DeviceBin"
    $GdbserverArgs = ":$Port $DeviceBin"
    if (-not $BpList) {
        $BpList = "main"
        Write-Info "No -Breakpoints given - defaulting to breakpoint at main"
    }
} else {
    Write-Step "3/6 Launching app and resolving PID (attach mode)..."
    & $Sdb shell "app_launcher -s $App" 2>$null | Out-Null
    Start-Sleep -Seconds 2
    $AppPid = Wait-AppPid ([System.IO.Path]::GetFileName($BinaryAbs))
    if (-not $AppPid) {
        Write-Err "Could not find PID for $App after ${Timeout}s"
        & $Sdb shell "ps -ef | grep $App" 2>$null
        exit 1
    }
    Write-Info "App PID: $AppPid"
    $GdbserverArgs = ":$Port --attach $AppPid"
}

# ---------------------------------------------------------------------------
# Steps 4-6: start gdbserver, forward, launch GDB (with guaranteed cleanup)
# ---------------------------------------------------------------------------
$GdbInit = $null
$GdbserverStarted = $false
try {
    # Step 4: Start gdbserver
    Write-Step "4/6 Starting gdbserver on port $Port..."
    & $Sdb shell "pkill gdbserver 2>/dev/null" | Out-Null
    Start-Sleep -Seconds 1
    if ($SetupOnly) {
        # setup-only: the script exits before the user attaches gdb, so gdbserver must
        # outlive it. A device-side nohup is NOT enough (sdb kills the session's
        # processes when the client disconnects). Instead launch a DETACHED host sdb
        # client (separate process) that holds the device shell (and gdbserver) open.
        Start-Process -FilePath $Sdb -ArgumentList @("shell", "$GdbserverPath $GdbserverArgs") -WindowStyle Hidden | Out-Null
    } else {
        # interactive: this script stays alive running gdb, so its sdb client persists.
        # $Sdb must be passed in - the job runs in a separate runspace that can't see it.
        Start-Job -ScriptBlock { param($sdbExe, $cmd) & $sdbExe shell $cmd } -ArgumentList $Sdb, "$GdbserverPath $GdbserverArgs" | Out-Null
    }
    $GdbserverStarted = $true
    $modeName = if ($Launch) { "launch" } else { "attach" }
    Write-Info "gdbserver started ($modeName mode)"
    Start-Sleep -Seconds 2

    # Step 5: Forward port
    Write-Step "5/6 Forwarding port $Port..."
    & $Sdb forward "tcp:$Port" "tcp:$Port"
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Port forward failed (tcp:$Port -> tcp:$Port)."
        Write-Info "The host port may be in use - retry with a different -Port."
        exit 1
    }
    Write-Info "Port $Port forwarded (host -> device)"
    if (-not (Wait-Port)) { Write-Warn "gdbserver readiness check inconclusive - proceeding" }

    # Step 6: Prepare GDB session and launch
    Write-Step "6/6 Preparing GDB session..."
    $GdbInit = Join-Path ([System.IO.Path]::GetTempPath()) ("tizen-gdb-" + [System.Guid]::NewGuid().ToString("N") + ".gdb")
    # GDB treats backslashes in command paths as escapes, so use forward slashes
    # (gdb accepts C:/Users/... fine; C:\Users\... gets mangled to C:Users...).
    $BinaryGdb = $BinaryAbs -replace '\\','/'
    $lines = @(
        "# Tizen Native GDB Debug Session"
        "set pagination off"
        "set confirm off"
        "set print pretty on"
        "set print object on"
        "set print static-members on"
        "set sysroot remote:/"
        ""
        "file `"$BinaryGdb`""
        "target remote localhost:$Port"
    )
    if ($BpList) {
        Write-Info "Breakpoints: $BpList"
        foreach ($bp in ($BpList -split ",")) {
            $t = $bp.Trim()
            if ($t) { $lines += "break $t" }
        }
    }
    # Launch mode: run to the first breakpoint (e.g. main). Attach mode: stop at the
    # (gdb) prompt with the app paused so the user controls it - do NOT auto-continue
    # (auto-continue would resume the app and leave no prompt if no breakpoint hits).
    if ($Launch) {
        $lines += ""
        $lines += "continue"
    }
    # ASCII (no BOM) so gdb parses the first line cleanly
    $lines | Out-File -FilePath $GdbInit -Encoding ascii

    Write-Info "GDB init file: $GdbInit"
    Write-Host ""
    if ($SetupOnly) {
        Write-Success "Setup complete - gdbserver is running and port $Port is forwarded."
        Write-Info "To debug, run the gdb command in an interactive terminal:"
        Write-Host ""
        Write-Host "  PowerShell:       & `"$Gdb`" -x `"$GdbInit`""
        Write-Host "  Command Prompt:   `"$Gdb`" -x `"$GdbInit`""
        Write-Host ""
        Write-Info "(The leading & is required only in PowerShell; omit it in cmd. gdbserver, the port forward, and the init file stay in place.)"
    } else {
        Write-Step "Starting GDB session"
        & $Gdb -x $GdbInit
    }
}
finally {
    # In setup-only mode, leave gdbserver running, the port forwarded, and the
    # init file in place so the user can attach gdb themselves.
    if (-not $SetupOnly) {
        if ($GdbInit -and (Test-Path $GdbInit)) {
            Remove-Item $GdbInit -Force -ErrorAction SilentlyContinue
        }
        if ($GdbserverStarted) {
            Write-Warn "Terminating gdbserver on device..."
            & $Sdb shell "pkill -9 gdbserver 2>/dev/null" | Out-Null
        }
    }
}
