#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-tv-sdk-install-from-zip.ps1
# Tizen TV SDK extension installer from a local ZIP file (offline) for Windows
#
# - Accepts a local ZIP file path containing the TV SDK bundle
# - Extracts the main ZIP to a temp directory
# - Locates inner ZIPs (binary/ dir first, then root)
# - Detects TV milestone version from inner ZIP filenames (majority vote)
# - Extracts each inner ZIP directly into the SDK tools path
# - Copies pkg_list snapshot files
# - Creates .tv-sdk-installed marker on success

param(
    [string]$SdkPath = "",
    [string]$ZipPath = "",
    [switch]$Force,
    [switch]$Check,
    [switch]$Wait,
    [switch]$Status,
    [switch]$Detach,
    [switch]$Help
)

# Shared helpers: logging (Write-Info/Success/Warn/Err) + Get-SdkPath.
. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# Show help
if ($Help) {
    Write-Host @"
Tizen TV SDK extension installer (from local ZIP file)

Usage: .\tizen-tv-sdk-install-from-zip.ps1 [OPTIONS]

Options:
  -SdkPath <path>    Tizen SDK installation path
                     (default: TIZEN_SDK_PATH / ~\.tizen.sdk.path.config / $env:USERPROFILE\tizen-sdk)
  -ZipPath <path>     Path to the TV SDK ZIP file (required for install)
  -Force              Reinstall even if TV SDK is already installed
  -Check              Check TV SDK installation only
  -Status             Check if a background install is still running
  -Wait               Sleep 60 seconds then check status (for polling)
  -Detach             Launch installer in background (detached)
  -Help               Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Validates the ZIP file exists
  3) Extracts the main ZIP to a temp directory
  4) Locates inner ZIPs (binary/ dir first, then root)
  5) Detects TV milestone version from inner ZIP filenames
  6) Extracts each inner ZIP directly into the SDK tools path
  7) Copies pkg_list snapshot files
  8) Creates .tv-sdk-installed marker on success

Examples:
  .\tizen-tv-sdk-install-from-zip.ps1 -ZipPath "C:\downloads\tv-samsung-sdk.zip"
  .\tizen-tv-sdk-install-from-zip.ps1 -SdkPath "C:\tizen-studio" -ZipPath "C:\downloads\tv-samsung-sdk.zip"
  .\tizen-tv-sdk-install-from-zip.ps1 -Check
"@
    exit 0
}

# Set default SDK path if not provided
if (-not $SdkPath) {
    $SdkPath = Get-SdkPath
}

# -Status: check if a background install is still running
if ($Status) {
    $tvMarker = Join-Path $SdkPath ".tv-sdk-installed"
    if (Test-Path $tvMarker) {
        Write-Host "STATUS=done EXIT=0"
    } else {
        $parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction SilentlyContinue).ParentProcessId
        $proc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ProcessId -ne $PID -and $_.ProcessId -ne $parentPid -and
                $_.CommandLine -like "*tizen-tv-sdk-install-from-zip*"
            }
        if ($proc) {
            Write-Host "STATUS=running"
        } else {
            Write-Host "STATUS=done EXIT=1"
        }
    }
    exit 0
}

# -Wait: sleep 60 seconds then check if TV SDK is installed.
if ($Wait) {
    Start-Sleep -Seconds 60
    $tvMarker = Join-Path $SdkPath ".tv-sdk-installed"
    if (Test-Path $tvMarker) {
        Write-Host "STATUS=done EXIT=0"
    } else {
        $parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction SilentlyContinue).ParentProcessId
        $proc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ProcessId -ne $PID -and $_.ProcessId -ne $parentPid -and
                $_.CommandLine -like "*tizen-tv-sdk-install-from-zip*"
            }
        if ($proc) {
            Write-Host "STATUS=running"
        } else {
            Write-Host "STATUS=done EXIT=1"
        }
    }
    exit 0
}

# -Detach: re-launch in background
if ($Detach) {
    $argList = @("-SdkPath", "`"$SdkPath`"", "-ZipPath", "`"$ZipPath`"")
    if ($Force) { $argList += "-Force" }
    $proc = Start-Process -FilePath "powershell" `
        -ArgumentList @("-ExecutionPolicy", "Bypass", "-NoProfile", "-File", $PSCommandPath, $argList) `
        -WindowStyle Hidden -PassThru
    Write-Host "PID=$($proc.Id)"
    exit 0
}

Write-Info "Tizen TV SDK extension installer (from ZIP) started"
Write-Info "SDK path: $SdkPath"
Write-Info "ZIP path: $ZipPath"

# Verify Tizen SDK is installed
$sdkInfoPath = Join-Path $SdkPath "sdk.info"
if (-not (Test-Path $sdkInfoPath)) {
    Write-Err "Tizen SDK is NOT installed at $SdkPath (sdk.info not found)"
    Write-Err "TV SDK requires Tizen SDK to be installed first."
    Write-Err "Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
}
Write-Success "Tizen SDK found: $SdkPath (sdk.info exists)"

# Check mode
$tvSdkMarkerPath = Join-Path $SdkPath ".tv-sdk-installed"
if ($Check) {
    if (Test-Path $tvSdkMarkerPath) {
        Write-Success "TV SDK is already installed: $SdkPath (.tv-sdk-installed found)"
        exit 0
    } else {
        Write-Info "TV SDK is NOT installed (.tv-sdk-installed not found)"
        exit 1
    }
}

# Skip if already installed
if ((Test-Path $tvSdkMarkerPath) -and -not $Force) {
    Write-Success "TV SDK is already installed: $SdkPath"
    Write-Info ".tv-sdk-installed found. To reinstall, run again with -Force"
    exit 0
}

if ($Force) {
    Write-Warn "Force reinstall requested - removing .tv-sdk-installed marker"
    Remove-Item $tvSdkMarkerPath -Force -ErrorAction SilentlyContinue
}

# Validate ZIP path
if (-not $ZipPath) {
    Write-Err "-ZipPath is required. Specify the path to the TV SDK ZIP file."
    exit 1
}

if (-not (Test-Path $ZipPath)) {
    Write-Err "ZIP file not found: $ZipPath"
    exit 1
}
$ZipPath = (Resolve-Path $ZipPath).Path
Write-Success "ZIP file found: $ZipPath"

# -----------------------------------------------------------------------------
# Extract main ZIP to temp directory
# -----------------------------------------------------------------------------

Add-Type -AssemblyName System.IO.Compression.FileSystem

$workdir = Join-Path ([System.IO.Path]::GetTempPath()) ("tizen-tv-sdk-zip-" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $workdir -Force | Out-Null

Write-Info "Extracting main ZIP to temp directory: $workdir"

try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            if ([string]::IsNullOrEmpty($entry.Name)) { continue }
            $destPath = Join-Path $workdir $entry.FullName
            $destDir = Split-Path -Parent $destPath
            if ($destDir -and -not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
        }
    } finally {
        $archive.Dispose()
    }
} catch {
    Write-Err "Failed to extract main ZIP: $ZipPath - $_"
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}
Write-Success "Main ZIP extracted successfully"

# -----------------------------------------------------------------------------
# Locate inner ZIP files (binary/ dir first, then root)
# -----------------------------------------------------------------------------

$innerDir = $null
if (Test-Path (Join-Path $workdir "binary")) {
    $innerDir = Join-Path $workdir "binary"
    Write-Info "Found binary/ directory with inner ZIPs"
} elseif (Test-Path (Join-Path $workdir "data\binary")) {
    $innerDir = Join-Path $workdir "data\binary"
    Write-Info "Found data/binary/ directory with inner ZIPs"
} else {
    $innerDir = $workdir
    Write-Info "No binary/ directory found - using root of extracted ZIP"
}

$innerZips = Get-ChildItem -Path $innerDir -Filter "*.zip" -File -ErrorAction SilentlyContinue | Sort-Object Name
if (-not $innerZips -or $innerZips.Count -eq 0) {
    Write-Err "No inner ZIP files found in $innerDir"
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}
Write-Success "Found $($innerZips.Count) inner ZIP file(s)"

# -----------------------------------------------------------------------------
# Detect TV milestone version from inner ZIP filenames (majority vote)
# Excluded from voting: tv-samsung-libav*, tv-samsung-emulator-kernel*,
#   tv-samsung-log-server*, tv-samsung-emulator-lib*, tv-samsung-emulator-qemu*
# -----------------------------------------------------------------------------

$excludePatterns = @(
    "tv-samsung-libav"
    "tv-samsung-emulator-kernel"
    "tv-samsung-log-server"
    "tv-samsung-emulator-lib"
    "tv-samsung-emulator-qemu"
)

$versionCounts = @{}
foreach ($zipFile in $innerZips) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($zipFile.Name)
    $excluded = $false
    foreach ($excl in $excludePatterns) {
        if ($baseName -like "$excl*") { $excluded = $true; break }
    }
    if ($excluded) { continue }
    # Extract version (after last _)
    $versionPart = $baseName.Substring($baseName.LastIndexOf('_') + 1)
    if ($versionPart -match '^(\d+\.\d+)') {
        $milestone = $Matches[1]
        if ($versionCounts.ContainsKey($milestone)) {
            $versionCounts[$milestone]++
        } else {
            $versionCounts[$milestone] = 1
        }
    }
}

$tvMilestone = ""
$maxCount = 0
foreach ($kv in $versionCounts.GetEnumerator()) {
    if ($kv.Value -gt $maxCount) {
        $maxCount = $kv.Value
        $tvMilestone = $kv.Key
    }
}

if ($tvMilestone) {
    Write-Success "Detected TV milestone version: $tvMilestone (majority vote: $maxCount)"
} else {
    Write-Warn "Could not detect TV milestone version from ZIP filenames - continuing anyway"
}

# -----------------------------------------------------------------------------
# Process each inner ZIP: extract directly to SDK tools path
# -----------------------------------------------------------------------------

$pkgInfoDir = Join-Path $SdkPath ".package"
if (-not (Test-Path $pkgInfoDir)) { New-Item -ItemType Directory -Path $pkgInfoDir -Force | Out-Null }

$idx = 0; $ok = 0; $skip = 0; $fail = 0
$total = $innerZips.Count

foreach ($zipFile in $innerZips) {
    $idx++
    Write-Info "[$idx/$total] Processing $($zipFile.Name) ..."

    $stage = Join-Path $workdir ("stage_" + $idx)
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null

    try {
        $archive = [System.IO.Compression.ZipFile]::OpenRead($zipFile.FullName)
        try {
            foreach ($entry in $archive.Entries) {
                if ([string]::IsNullOrEmpty($entry.Name)) { continue }
                $destPath = Join-Path $stage $entry.FullName
                $destDir = Split-Path -Parent $destPath
                if ($destDir -and -not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
            }
        } finally {
            $archive.Dispose()
        }
    } catch {
        Write-Err "[$idx/$total] Extraction failed: $($zipFile.Name) - $_"
        $fail++
        Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
        continue
    }

    # Merge data\ contents into the SDK root (if data\ exists)
    $dataDir = Join-Path $stage "data"
    if (Test-Path $dataDir) {
        $dataItems = Get-ChildItem -Path $dataDir -Force -ErrorAction SilentlyContinue
        if ($dataItems.Count -gt 0) {
            robocopy $dataDir $SdkPath /E /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
            if ($LASTEXITCODE -ge 8) {
                Write-Err "[$idx/$total] Merge failed: $($zipFile.Name) (robocopy $LASTEXITCODE)"
                $fail++
                Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
                continue
            }
        } else {
            Write-Info "[$idx/$total] $($zipFile.Name): data\ is empty, skip merge"
        }
    } else {
        # No data\ dir - copy directly to SDK root
        $stageItems = Get-ChildItem -Path $stage -Force -ErrorAction SilentlyContinue
        if ($stageItems.Count -gt 0) {
            Copy-Item -Path "$stage\*" -Destination $SdkPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Keep manifest record
    $manifest = Join-Path $stage "pkginfo.manifest"
    if (Test-Path $manifest) {
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($zipFile.Name)
        $pkgName = $baseName.Substring(0, $baseName.LastIndexOf('_'))
        Copy-Item -Path $manifest -Destination (Join-Path $pkgInfoDir "$pkgName.manifest") -Force
    }

    Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
    $ok++
    Write-Success "[$idx/$total] $($zipFile.Name) installed"
}

Write-Success "TV SDK ZIP install result: OK $ok / skipped $skip / failed $fail (total $total)"

if ($fail -gt 0) {
    Write-Err "Some packages failed to install. Not creating .tv-sdk-installed marker."
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}

# -----------------------------------------------------------------------------
# Copy snapshot files (pkg_list) to SDK snapshots\tv-samsung\ dir
# -----------------------------------------------------------------------------

$snapshotDir = Join-Path $pkgInfoDir "snapshots\tv-samsung"
if (-not (Test-Path $snapshotDir)) { New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null }

$snapshots = Get-ChildItem -Path $innerDir -Filter "pkg_list_*" -File -ErrorAction SilentlyContinue
foreach ($snap in $snapshots) {
    $dest = Join-Path $snapshotDir $snap.Name
    if (Test-Path $dest) {
        Write-Info "Snapshot already exists, skip: $($snap.Name)"
    } else {
        Copy-Item -Path $snap.FullName -Destination $dest -Force
        Write-Success "Copied snapshot: $($snap.Name)"
    }
}

# -----------------------------------------------------------------------------
# Create .tv-sdk-installed marker
# -----------------------------------------------------------------------------

$markerContent = "TV SDK installed at $(Get-Date -Format 'o')`r`nSource: $ZipPath"
if ($tvMilestone) {
    $markerContent += "`r`nTV milestone version: $tvMilestone"
}
Set-Content -Path $tvSdkMarkerPath -Value $markerContent -Encoding UTF8
Write-Success ".tv-sdk-installed created: $tvSdkMarkerPath"

Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
Write-Success "Tizen TV SDK extension installation (from ZIP) completed!"
exit 0
