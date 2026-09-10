# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Tizen file transfer script for Windows
# Pushes or pulls files/directories between host and Tizen device via sdb

param(
    [Parameter()]
    [string]$Direction,
    [Parameter()]
    [string]$Local,
    [Parameter()]
    [string]$Remote,
    [Parameter()]
    [string]$DeviceSerial,
    [Parameter()]
    [switch]$WithUtf8,
    [Parameter()]
    [switch]$Help
)

# Load shared helpers
. (Join-Path $PSScriptRoot "..\lib\common.ps1")

if ($Help) {
    Write-Host @"
Usage: tizen-file-transfer.ps1 [options]

Options:
  -Direction <push|pull>   Transfer direction (required)
  -Local <path>            Local (host) file/directory path
                           (required for push; optional for pull, defaults to .)
  -Remote <path>           Remote (device) file/directory path (required)
  -DeviceSerial <serial>   Device serial number (optional, auto-detect if not specified)
  -WithUtf8                Handle UTF-8 encoded paths
  -Help                    Show this help message

Examples:
  # Push a file to device
  .\tizen-file-transfer.ps1 -Direction push -Local .\myfile.txt -Remote /opt/usr/apps/myfile.txt

  # Pull a file from device
  .\tizen-file-transfer.ps1 -Direction pull -Remote /opt/usr/apps/myfile.txt -Local .\myfile.txt

  # Push a directory recursively
  .\tizen-file-transfer.ps1 -Direction push -Local .\mydir -Remote /opt/usr/apps/mydir

  # Pull to current directory
  .\tizen-file-transfer.ps1 -Direction pull -Remote /opt/usr/apps/myfile.txt
"@
    exit 0
}

# ============================================================================
# Validation
# ============================================================================

if (-not $Direction) {
    Write-Err "Direction is required (-Direction push|pull)"
    exit 1
}

if ($Direction -ne "push" -and $Direction -ne "pull") {
    Write-Err "Invalid direction: $Direction. Must be 'push' or 'pull'"
    exit 1
}

if (-not $Remote) {
    Write-Err "Remote path is required (-Remote)"
    exit 1
}

# For push, local path is required and must exist
if ($Direction -eq "push") {
    if (-not $Local) {
        Write-Err "Local path is required for push (-Local)"
        exit 1
    }
    if (-not (Test-Path $Local)) {
        Write-Err "Local path not found: $Local"
        exit 1
    }
}

# For pull, local path defaults to current directory
if ($Direction -eq "pull" -and -not $Local) {
    $Local = "."
}

# ============================================================================
# Main Execution
# ============================================================================

Write-Host "Tizen File Transfer (Windows)" -ForegroundColor White
Write-Host "===============================" -ForegroundColor White

# Find sdb
Write-Section "Locating sdb"
$sdb = Find-TizenTool "sdb"
if (-not $sdb) {
    Write-Err "sdb not found. Install the Tizen SDK first (tizen-sdk-install agent)."
    exit 1
}
Write-Info "Found sdb: $sdb"

# Check for connected devices
Write-Section "Checking for connected devices"
$devices = @(Get-ConnectedDevices $sdb)

if ($devices.Count -eq 0) {
    Write-Err "No devices found. Run device-manager first to connect a device or emulator."
    exit 1
}

# Select device
if (-not $DeviceSerial) {
    if ($devices.Count -eq 1) {
        $DeviceSerial = $devices[0]
        Write-Success "Using device: $DeviceSerial"
    } else {
        Write-Host "Found multiple devices:" -ForegroundColor Yellow
        for ($i = 0; $i -lt $devices.Count; $i++) {
            Write-Host "$($i + 1). $($devices[$i])" -ForegroundColor Yellow
        }
        Write-Err "Multiple devices found. Please specify device serial with -DeviceSerial parameter."
        exit 1
    }
}

# Resolve local path to absolute
if ($Direction -eq "push") {
    $Local = (Resolve-Path $Local).Path
}

# pull: confirm the remote object exists BEFORE calling sdb pull. sdb's own
# message for a missing path ("cannot stat '...': No such file or directory")
# is easy to lose, and a wrong path must end the run with a clear reason
# rather than an opaque failure the caller retries (issue #95).
if ($Direction -eq "pull") {
    Write-Section "Checking remote path"
    # $Remote was validated by the runner to contain no quotes/backticks/$.
    $probeCmd = "ls -d `"$Remote`" >/dev/null 2>&1 && echo __TZ_REMOTE_EXISTS__ || echo __TZ_REMOTE_MISSING__"
    $probeOutput = ""
    try {
        $probeOutput = (& $sdb -s $DeviceSerial shell $probeCmd 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
    } catch {
        $probeOutput = "$_"
    }
    if ($probeOutput -match '__TZ_REMOTE_MISSING__') {
        Write-Err "Remote path does not exist on device ${DeviceSerial}: $Remote"
        Write-Output "DEVICE_SERIAL=$DeviceSerial"
        Write-Output "REMOTE_NOT_FOUND=$Remote"
        exit 1
    } elseif ($probeOutput -match '__TZ_REMOTE_EXISTS__') {
        Write-Success "Remote path exists: $Remote"
    } else {
        # The probe itself did not run (sdb shell error, odd shell on device) —
        # do not block the transfer on it; sdb pull will report the real result.
        Write-Warn "Could not verify remote path (probe output: $probeOutput); continuing"
    }
}

# Execute transfer
Write-Section "Transferring ($Direction)"

$transferOutput = ""
if ($Direction -eq "push") {
    Write-Info "Pushing: $Local -> $Remote"
    $transferOutput = & $sdb -s $DeviceSerial push $Local $Remote 2>&1 | ForEach-Object { $_.ToString() }
} else {
    Write-Info "Pulling: $Remote -> $Local"
    $transferOutput = & $sdb -s $DeviceSerial pull $Remote $Local 2>&1 | ForEach-Object { $_.ToString() }
}
$transferExitCode = $LASTEXITCODE

$transferOutput | ForEach-Object { Write-Host $_ -ForegroundColor Gray }

# Exit code is the primary success signal. Keep a secondary check anchored to
# sdb's actual error formats for cases where sdb exits 0 but reports an error.
# "cannot stat ... No such file or directory" is sdb's exact wording for a
# missing remote object and is specific enough not to false-positive on paths
# (bare 'cannot'/'no such' would).
$missingPattern = 'cannot stat|No such file or directory|does not exist'
$hasError = $false
$remoteMissing = $false
if ($transferExitCode -ne 0) {
    $hasError = $true
}
foreach ($line in $transferOutput) {
    if ($line -match "(^|\s)error:|failed to copy|$missingPattern") {
        $hasError = $true
    }
    if ($line -match $missingPattern) {
        $remoteMissing = $true
    }
}

if ($hasError) {
    Write-Err "Transfer failed (sdb exit code: $transferExitCode)"
    Write-Output "DEVICE_SERIAL=$DeviceSerial"
    if ($Direction -eq "pull" -and $remoteMissing) {
        Write-Output "REMOTE_NOT_FOUND=$Remote"
    }
    exit 1
}

# Extract bytes transferred from sdb output
$bytesTransferred = ""
foreach ($line in $transferOutput) {
    if ($line -match '(\d+)\s*bytes') {
        $bytesTransferred = $Matches[1]
        break
    }
}

Write-Success "Transfer completed successfully!"

# Machine-readable output (stdout)
Write-Output "DEVICE_SERIAL=$DeviceSerial"
Write-Output "TRANSFER_DIRECTION=$Direction"
Write-Output "LOCAL_PATH=$Local"
Write-Output "REMOTE_PATH=$Remote"
if ($bytesTransferred) {
    Write-Output "BYTES_TRANSFERRED=$bytesTransferred"
}

exit 0
