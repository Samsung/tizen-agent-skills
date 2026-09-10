#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-update-package.ps1
# Tizen SDK package updater for Windows
#
# - Downloads pkg_list from the Tizen package repository
# - Scans installed package manifests in {SDK_PATH}/.package/
# - Compares installed versions with versions in the downloaded package list
# - Downloads and installs updates for outdated packages
# - Updates manifest files in .package/

param(
    [string]$SdkPath = "",
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Help
)

# Shared helpers: logging (Write-Info/Success/Warn/Err) + Get-SdkPath.
# NOTE: the Node layer (sdk.js updatePackage) parses the
# "Update result: updated X / skipped Y / ..." summary line from captured
# output - keep that line's format unchanged.
. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# -----------------------------------------------------------------------------
# Helper: Write the .package-update-result marker
# Read back by sdk.js updatePackage() when the agent re-runs the Phase 1 CLI
# after this script finishes - keep the "Result:" line in the exact
# "updated X / skipped Y / failed Z / up-to-date W (total N)" shape it parses.
# -----------------------------------------------------------------------------
function Write-ResultMarker {
    param([int]$ExitCode, [string]$ResultLine, [int]$OutdatedCount)
    $mode = "update"
    if ($Force) { $mode = "force" }
    if ($DryRun) { $mode = "dry-run" }
    $marker = Join-Path $SdkPath ".package-update-result"
    $content = "Package update finished at $(Get-Date -Format 'o')`nMode: $mode`nExit: $ExitCode`nOutdated: $OutdatedCount`nResult: $ResultLine`n"
    try {
        Set-Content -Path $marker -Value $content -Encoding UTF8
    } catch {
        Write-Warn "Could not write $marker : $_"
    }
}

# -----------------------------------------------------------------------------
# Helper: Compare versions
# Returns $true if available version is newer than installed version
# -----------------------------------------------------------------------------
function Compare-Version {
    param([string]$InstalledVersion, [string]$AvailableVersion)

    if (-not $InstalledVersion -or -not $AvailableVersion) {
        return $false
    }
    if ($InstalledVersion -eq $AvailableVersion) {
        return $false
    }

    # Try semantic version comparison (split by dots)
    try {
        $instParts = $InstalledVersion.Split('.') | ForEach-Object { [int]$_ }
        $availParts = $AvailableVersion.Split('.') | ForEach-Object { [int]$_ }
        $maxLen = [Math]::Max($instParts.Length, $availParts.Length)
        for ($i = 0; $i -lt $maxLen; $i++) {
            $instVal = if ($i -lt $instParts.Length) { $instParts[$i] } else { 0 }
            $availVal = if ($i -lt $availParts.Length) { $availParts[$i] } else { 0 }
            if ($availVal -gt $instVal) { return $true }
            if ($availVal -lt $instVal) { return $false }
        }
        return $false
    } catch {
        # Fallback: string comparison
        return ($AvailableVersion -gt $InstalledVersion)
    }
}

# Package repository (base URL for pkg_list and binary zip)
# During SDK install, a CDN mirror is selected by timezone and stored in
# .package/repository.info. The updater reads that file so updates are
# downloaded from the same mirror used during install.
# Falls back to the official repo if repository.info is missing.
$PkgRepo = "https://download.tizen.org/sdk/tizenstudio/official"


# OS auto-detect
if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows)) {
    $PkgOs = "windows-64"
} elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::OSX)) {
    $PkgOs = "macos-64"
} elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Linux)) {
    $PkgOs = "ubuntu-64"
} else {
    Write-Err "Unsupported OS. This script supports Windows, macOS, and Linux only."
    exit 1
}

# Show help
if ($Help) {
    Write-Host @"
Tizen SDK package updater

Usage: .\tizen-update-package.ps1 [OPTIONS]

Options:
  -SdkPath <path>    Tizen SDK installation path
                     (default: TIZEN_SDK_PATH / ~\.tizen.sdk.path.config / ~\tizen-sdk)
  -Force             Force update all installed packages regardless of version
  -DryRun            List outdated packages only (no download/update)
  -Help              Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Downloads/parses $PkgRepo/pkg_list_$PkgOs
  3) Scans {SDK_PATH}/.package/ for installed package manifests ({pkg}.manifest)
  4) For each installed package, compares installed version with pkg_list version
  5) If a newer version is available, downloads and installs the update
  6) Reports summary: updated / skipped / failed / up-to-date counts

Examples:
  .\tizen-update-package.ps1
  .\tizen-update-package.ps1 -SdkPath "C:\tizen-studio"
  .\tizen-update-package.ps1 -DryRun
  .\tizen-update-package.ps1 -Force
"@
    exit 0
}

# Set default SDK path if not provided
# (Get-SdkPath: TIZEN_SDK_PATH -> ~\.tizen.sdk.path.config -> ~\tizen-sdk)
if (-not $SdkPath) {
    $SdkPath = Get-SdkPath
}

Write-Info "Tizen SDK package updater started"
Write-Info "SDK path: $SdkPath"
Write-Info "Detected OS: $PkgOs (pkg_list: pkg_list_$PkgOs)"

# Verify Tizen SDK is installed
$sdkInfoPath = Join-Path $SdkPath "sdk.info"
if (-not (Test-Path $sdkInfoPath)) {
    Write-Err "Tizen SDK is NOT installed at $SdkPath (sdk.info not found)"
    Write-Err "Package update requires Tizen SDK to be installed first."
    Write-Err "Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
}
Write-Success "Tizen SDK found: $SdkPath (sdk.info exists)"

# Verify .package directory exists
$pkgInfoDir = Join-Path $SdkPath ".package"
if (-not (Test-Path $pkgInfoDir)) {
    Write-Err "No .package directory found at $SdkPath"
    Write-Err "No installed packages to update."
    exit 1
}
Write-Success "Package directory found: $pkgInfoDir"

# -----------------------------------------------------------------------------
# Read repository.info to use the same CDN mirror that was selected during install
# -----------------------------------------------------------------------------
$repoInfoFile = Join-Path $pkgInfoDir "repository.info"
if (Test-Path $repoInfoFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($repoInfoFile)) {
        if ($line -match '^Repository\s*=\s*(.+)$') {
            $repoUrl = $Matches[1].Trim()
            if ($repoUrl) {
                $PkgRepo = $repoUrl
                Write-Success "Using repository from repository.info: $PkgRepo"
                break
            }
        }
    }
} else {
    Write-Warn "repository.info not found - falling back to official repo: $PkgRepo"
}

# -----------------------------------------------------------------------------
# Download pkg_list
# -----------------------------------------------------------------------------

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$workdir = Join-Path ([System.IO.Path]::GetTempPath()) ("tizen-update-pkg-" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $workdir -Force | Out-Null
$pkglist = Join-Path $workdir "pkg_list"
$pkglistUrl = "$PkgRepo/pkg_list_$PkgOs"

Write-Info "Downloading package list: $pkglistUrl"
try {
    $progressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $pkglistUrl -OutFile $pkglist -UseBasicParsing
} catch {
    Write-Err "Failed to download pkg_list: $_"
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}
Write-Success "Package list downloaded successfully"

# -----------------------------------------------------------------------------
# Parse pkg_list
# -----------------------------------------------------------------------------
$db = @{}
$cur = $null
foreach ($line in [System.IO.File]::ReadAllLines($pkglist)) {
    if ($line -match '^Package : (.+)$') {
        $cur = $Matches[1].Trim()
        if (-not $db.ContainsKey($cur)) {
            $db[$cur] = @{ Path = $null; Version = $null; SHA256 = $null }
        }
    } elseif ($cur) {
        if ($line -match '^Version : (.+)$' -and -not $db[$cur].Version) {
            $db[$cur].Version = $Matches[1].Trim()
        } elseif ($line -match '^Path : (.+)$' -and -not $db[$cur].Path) {
            $db[$cur].Path = $Matches[1].Trim()
        } elseif ($line -match '^SHA256 : (.+)$' -and -not $db[$cur].SHA256) {
            $db[$cur].SHA256 = $Matches[1].Trim()
        }
    }
}
Write-Success "Parsed $($db.Count) packages from pkg_list"

# -----------------------------------------------------------------------------
# Scan installed manifests and compare versions
# -----------------------------------------------------------------------------
$manifestFiles = Get-ChildItem $pkgInfoDir -Filter "*.manifest"
Write-Info "Found $($manifestFiles.Count) installed package manifests"

$outdated = @()
$upToDate = 0
$notInList = @()

foreach ($mf in $manifestFiles) {
    $pkgName = $mf.BaseName  # e.g. "10.0-efl-renderer" from "10.0-efl-renderer.manifest"

    # Parse installed version from manifest
    $installedVersion = $null
    foreach ($line in [System.IO.File]::ReadAllLines($mf.FullName)) {
        if ($line -match '^Version : (.+)$') {
            $installedVersion = $Matches[1].Trim()
            break
        }
    }

    if (-not $installedVersion) {
        Write-Warn "$pkgName : could not parse installed version from manifest, skip"
        continue
    }

    # Check if package exists in the downloaded pkg_list
    if (-not $db.ContainsKey($pkgName)) {
        Write-Warn "$pkgName : not found in pkg_list (may be a local/custom package), skip"
        $notInList += $pkgName
        continue
    }

    $availableVersion = $db[$pkgName].Version

    $updateReason = $null
    if ($Force) {
        $updateReason = "force update"
    } elseif (Compare-Version -InstalledVersion $installedVersion -AvailableVersion $availableVersion) {
        $updateReason = "update available"
    }

    if ($updateReason) {
        Write-Info "$pkgName : $updateReason (installed: $installedVersion -> available: $availableVersion)"
        $outdated += [PSCustomObject]@{
            Name = $pkgName
            InstalledVersion = $installedVersion
            AvailableVersion = $availableVersion
            Path = $db[$pkgName].Path
        }
    } else {
        $upToDate++
    }
}

Write-Info "Update check result: $($outdated.Count) outdated / $upToDate up-to-date / $($notInList.Count) not in list"

# Dry-run: list only
if ($DryRun) {
    Write-Warn "[DRY-RUN] The following packages have updates available (no download/update):"
    $n = 0
    foreach ($pkg in $outdated) {
        $n++
        "    {0,3}. {1,-48} {2} -> {3}" -f $n, $pkg.Name, $pkg.InstalledVersion, $pkg.AvailableVersion | Write-Host
    }
    if ($outdated.Count -eq 0) {
        Write-Success "All installed packages are up-to-date."
    }
    $resultLine = "updated 0 / skipped 0 / failed 0 / up-to-date $upToDate (total $($manifestFiles.Count))"
    Write-Success "Update result: $resultLine"
    Write-ResultMarker -ExitCode 0 -ResultLine $resultLine -OutdatedCount $outdated.Count
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 0
}

# -----------------------------------------------------------------------------
# Download and install updates
# -----------------------------------------------------------------------------
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Remove the per-package zip and staging directory (after success or failure).
function Remove-PkgStage {
    param([string]$Zip, [string]$Stage)
    Remove-Item -Force $Zip -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
}

$idx = 0; $ok = 0; $skip = 0; $fail = 0
$total = $outdated.Count

foreach ($pkg in $outdated) {
    $idx++

    $relPath = $pkg.Path
    if (-not $relPath) {
        Write-Warn "[$idx/$total] $($pkg.Name): no binary path (meta/skip)"
        $skip++
        continue
    }

    $url = "$PkgRepo$relPath"
    $zip = Join-Path $workdir ([System.IO.Path]::GetFileName($relPath))
    Write-Info "[$idx/$total] Downloading $($pkg.Name) ($($pkg.InstalledVersion) -> $($pkg.AvailableVersion)) ..."
    try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($url, $zip)
        $wc.Dispose()
    } catch {
        Write-Err "[$idx/$total] Download failed: $url - $_"
        $fail++
        continue
    }

    $stage = Join-Path $workdir ("stage_" + $idx)
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null

    try {
        # Entry-by-entry extraction with overwrite
        $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
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
        Write-Err "[$idx/$total] Extraction failed: $($pkg.Name) - $_"
        $fail++
        Remove-PkgStage -Zip $zip -Stage $stage
        continue
    }

    # Merge data\ contents into the SDK root
    $dataDir = Join-Path $stage "data"
    if (Test-Path $dataDir) {
        $dataItems = Get-ChildItem -Path $dataDir -Force -ErrorAction SilentlyContinue
        if ($dataItems.Count -gt 0) {
            if ($PkgOs -eq "windows-64") {
                robocopy $dataDir $SdkPath /E /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
                if ($LASTEXITCODE -ge 8) {
                    Write-Err "[$idx/$total] Merge failed: $($pkg.Name) (robocopy $LASTEXITCODE)"
                    $fail++
                    Remove-PkgStage -Zip $zip -Stage $stage
                    continue
                }
            } else {
                Copy-Item -Path "$dataDir/*" -Destination $SdkPath -Recurse -Force
            }
        } else {
            Write-Info "[$idx/$total] $($pkg.Name): data\ is empty, skip merge"
        }
    }

    # Update manifest record
    $manifest = Join-Path $stage "pkginfo.manifest"
    if (Test-Path $manifest) {
        Copy-Item -Path $manifest -Destination (Join-Path $pkgInfoDir "$($pkg.Name).manifest") -Force
    } else {
        # If no pkginfo.manifest in the zip, create one from the pkg_list entry
        $manifestContent = "Package : $($pkg.Name)`nVersion : $($pkg.AvailableVersion)`nOS : $PkgOs`n"
        Set-Content -Path (Join-Path $pkgInfoDir "$($pkg.Name).manifest") -Value $manifestContent -Encoding UTF8
    }

    Remove-PkgStage -Zip $zip -Stage $stage
    $ok++
    Write-Success "[$idx/$total] $($pkg.Name) updated: $($pkg.InstalledVersion) -> $($pkg.AvailableVersion)"
}

$resultLine = "updated $ok / skipped $skip / failed $fail / up-to-date $upToDate (total $($manifestFiles.Count))"
Write-Success "Update result: $resultLine"

if ($fail -gt 0) {
    Write-Err "Some packages failed to update."
    Write-ResultMarker -ExitCode 1 -ResultLine $resultLine -OutdatedCount $outdated.Count
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}

Write-ResultMarker -ExitCode 0 -ResultLine $resultLine -OutdatedCount $outdated.Count
Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
Write-Success "Tizen SDK package update completed!"
exit 0


