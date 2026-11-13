#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-tv-sdk-install-from-zip.ps1
# Tizen TV SDK extension installer from a local ZIP file (offline) for Windows
#
# - Accepts a local ZIP file path containing the TV SDK bundle
# - Extracts the main ZIP to a temp directory
# - Locates inner ZIPs (binary/ dir first, then root)
# - Detects TV milestone version from inner ZIP filenames (majority vote);
#   -TvVersion states it, and the install stops when the two disagree or
#   neither is known
# - Skips a TV version .platform-installed already records (other TV versions
#   install side by side)
# - Extracts each inner ZIP directly into the SDK tools path
# - Copies pkg_list snapshot files
# - Records the TV version in .platform-installed and creates the
#   .tv-sdk-installed marker on success

param(
    [string]$SdkPath = "",
    [string]$ZipPath = "",
    [string]$TvVersion = "",       # TV platform version the ZIP is for (X.Y)
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
  -TvVersion <X.Y>    TV platform version the ZIP is for (e.g. 9.0); required
                      when the inner ZIP names carry none
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
  5) Detects TV milestone version from inner ZIP filenames (or -TvVersion)
  6) Extracts each inner ZIP directly into the SDK tools path
  7) Copies pkg_list snapshot files
  8) Records the TV version in .platform-installed and creates the
     .tv-sdk-installed marker on success

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

# -TvVersion reaches command lines and file names: X.Y only.
if ($TvVersion -and $TvVersion -notmatch '^[0-9]+\.[0-9]+$') {
    Write-Err "Invalid -TvVersion `"$TvVersion`". Expected MAJOR.MINOR such as 9.0 or 11.0."
    exit 2
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
    # Paths go through ConvertTo-QuotedArgument (lib\common.ps1): Start-Process
    # quotes nothing, and a trailing backslash would escape a plain closing quote.
    $argList = @("-SdkPath", (ConvertTo-QuotedArgument $SdkPath), "-ZipPath", (ConvertTo-QuotedArgument $ZipPath))
    if ($TvVersion) { $argList += @("-TvVersion", $TvVersion) }
    if ($Force) { $argList += "-Force" }
    $proc = Start-Process -FilePath "powershell" `
        -ArgumentList (@("-ExecutionPolicy", "Bypass", "-NoProfile", "-File", (ConvertTo-QuotedArgument $PSCommandPath)) + $argList) `
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

$tvSdkMarkerPath = Join-Path $SdkPath ".tv-sdk-installed"

# Check mode: is any TV version recorded (or, with -TvVersion, that one)?
if ($Check) {
    if ($TvVersion) {
        if (Test-TvVersionRecorded -SdkPath $SdkPath -Version $TvVersion) {
            Write-Success "TV SDK $TvVersion is already installed: $SdkPath (recorded in .platform-installed)"
            exit 0
        }
        Write-Info "TV SDK $TvVersion is NOT installed (not recorded in .platform-installed)"
        exit 1
    }
    $anyTv = @(Get-PlatformRecords -SdkPath $SdkPath | Where-Object { Test-TvProfileName $_.Profile }).Count -gt 0
    if ($anyTv -or (Test-Path $tvSdkMarkerPath)) {
        Write-Success "TV SDK is already installed: $SdkPath"
        exit 0
    }
    Write-Info "TV SDK is NOT installed (no TV version recorded in .platform-installed)"
    exit 1
}

# An older install left only .tv-sdk-installed: record its TV version first
# (Convert-TvSdkMarkerToRecord, lib\common.ps1), so it is still reported
# after this run replaces the marker.
Convert-TvSdkMarkerToRecord -SdkPath $SdkPath

# Skip a TV version that is already recorded; other TV versions install side
# by side. Without -TvVersion the version is known only after the ZIP is
# opened, and is checked again there.
if ($TvVersion -and -not $Force -and (Test-TvVersionRecorded -SdkPath $SdkPath -Version $TvVersion)) {
    Write-Success "TV SDK $TvVersion is already installed: $SdkPath (recorded in .platform-installed)"
    Write-Info "To reinstall, run again with -Force"
    exit 0
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
    # Extract version: the field after the package name. Names are
    # <name>_<version>_<os>-<bits> (TV-SAMSUNG-Public_10.0.0_windows-64), so the
    # field after the LAST "_" is the OS tag, not the version; older bundles
    # drop the OS tag (<name>_<version>), which this reads the same way.
    $fields = $baseName.Split('_')
    $versionPart = if ($fields.Count -ge 2) { $fields[1] } else { "" }
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
    Write-Warn "Could not detect TV milestone version from ZIP filenames"
}

# The version to record: -TvVersion, checked against the ZIP. Stop here,
# before anything is extracted into the SDK, when they disagree or neither is
# known - a TV install that cannot be recorded would not be reported.
if ($TvVersion -and $tvMilestone -and $TvVersion -ne $tvMilestone) {
    Write-Err "-TvVersion $TvVersion does not match the ZIP, whose packages are for TV $tvMilestone."
    Write-Err "Re-run with -TvVersion $tvMilestone, or use the TV $TvVersion ZIP."
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 2
}
$tvVersionToRecord = if ($TvVersion) { $TvVersion } else { $tvMilestone }
if (-not $tvVersionToRecord) {
    Write-Err "Cannot tell which TV version this ZIP is for (no X.Y in its inner ZIP names)."
    Write-Err "Re-run with -TvVersion <X.Y>, e.g. -TvVersion 9.0."
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 2
}
if (-not $Force -and (Test-TvVersionRecorded -SdkPath $SdkPath -Version $tvVersionToRecord)) {
    Write-Success "TV SDK $tvVersionToRecord is already installed: $SdkPath (recorded in .platform-installed)"
    Write-Info "To reinstall, run again with -Force"
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 0
}

# -Status reports "done" once the marker exists, so drop the previous run's
# marker before this one changes the SDK (its version is recorded above).
Remove-Item $tvSdkMarkerPath -Force -ErrorAction SilentlyContinue

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

# Record the TV version in .platform-installed (Add-PlatformRecord,
# lib\common.ps1) - what sdk-install result.packages and platform-install
# --list read. No tv-samsung folder for that version means the ZIP is for
# another one (a wrong -TvVersion): record nothing rather than a TV version
# that is not there, and fail so the pre-check does not report it installed.
$tvProfiles = Get-TvInstallProfiles -SdkPath $SdkPath -Version $tvVersionToRecord
if (-not $tvProfiles) {
    Write-Err "The ZIP was extracted, but platforms\tizen-$tvVersionToRecord has no tv-samsung folder: it is not a TV $tvVersionToRecord ZIP."
    Write-Err "Nothing was recorded in .platform-installed. Re-run with the -TvVersion the ZIP is for."
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}
Add-PlatformRecord -SdkPath $SdkPath -Target "TV-SAMSUNG ZIP" -Version $tvVersionToRecord -Profiles $tvProfiles `
    -InstalledBy "tv-sdk-install-from-zip" -Source $ZipPath
Write-Success "TV $tvVersionToRecord ($tvProfiles) recorded in $(Join-Path $SdkPath '.platform-installed')"

$markerContent = "TV SDK installed at $(Get-Date -Format 'o')`r`nSource: $ZipPath`r`nTV milestone version: $tvVersionToRecord`r`n"
[System.IO.File]::WriteAllText($tvSdkMarkerPath, $markerContent, [System.Text.UTF8Encoding]::new($false))
Write-Success ".tv-sdk-installed created: $tvSdkMarkerPath"

Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
Write-Success "Tizen TV SDK extension installation (from ZIP) completed!"
exit 0
