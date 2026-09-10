#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-platform-install.ps1
# Tizen platform package installer for Windows
#
# - Reads the CDN mirror URL from {SDK_PATH}\.package\repository.info
#   (falls back to the official repo if the file is missing)
# - Downloads pkg_list from the Tizen package repository
# - Auto-detects the latest TIZEN-X.Y platform (or uses -PlatformVersion)
# - Resolves TIZEN-{version} and its Install-dependency packages
# - Downloads each from (repo + Path) and merges data\ into the SDK root
# - Creates .platform-installed marker on success

param(
    [string]$SdkPath = "",
    [string]$PlatformVersion = "",
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Help
)

# Shared helpers: logging (Write-Info/Success/Warn/Err) + Get-SdkPath.
. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# Package repository (base URL for pkg_list and binary zip)
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
Tizen platform package installer

Usage: .\tizen-platform-install.ps1 [OPTIONS]

Options:
  -SdkPath <path>           Tizen SDK installation path
                             (default: TIZEN_SDK_PATH / ~\.tizen.sdk.path.config / ~\tizen-sdk)
  -PlatformVersion <ver>    Tizen platform version (e.g., "10.0", "11.0").
                             Auto-detects latest if not specified.
  -Force                     Force reinstall even if platform package is already installed
  -DryRun                    Resolve and list packages only (no download/install)
  -Help                      Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Reads repository.info for the CDN mirror URL
  3) Downloads/parses `$PkgRepo/pkg_list_`$PkgOs
  4) Auto-detects latest TIZEN-X.Y platform (or uses -PlatformVersion)
  5) Resolves TIZEN-{version} and its Install-dependency packages
  6) Downloads each from (repo + Path) and merges data\ into the SDK root
  7) Creates .platform-installed marker on success

Examples:
  .\tizen-platform-install.ps1
  .\tizen-platform-install.ps1 -SdkPath "C:\tizen-studio"
  .\tizen-platform-install.ps1 -PlatformVersion "10.0"
  .\tizen-platform-install.ps1 -DryRun
"@
    exit 0
}

# Set default SDK path if not provided
if (-not $SdkPath) {
    $SdkPath = Get-SdkPath
}

Write-Info "Tizen platform package installer started"
Write-Info "SDK path: $SdkPath"
Write-Info "Detected OS: $PkgOs (pkg_list: pkg_list_$PkgOs)"

# Verify Tizen SDK is installed
$sdkInfoPath = Join-Path $SdkPath "sdk.info"
if (-not (Test-Path $sdkInfoPath)) {
    Write-Err "Tizen SDK is NOT installed at $SdkPath (sdk.info not found)"
    Write-Err "Platform package installation requires Tizen SDK to be installed first."
    Write-Err "Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
}
Write-Success "Tizen SDK found: $SdkPath (sdk.info exists)"

# Verify .package directory exists
$pkgInfoDir = Join-Path $SdkPath ".package"
if (-not (Test-Path $pkgInfoDir)) {
    Write-Err "No .package directory found at $SdkPath"
    Write-Err "The SDK may not have been installed properly."
    exit 1
}
Write-Success "Package directory found: $pkgInfoDir"

# Check mode / skip if already installed (only if marker version matches requested version)
$platformPkgMarkerPath = Join-Path $SdkPath ".platform-installed"
if ((Test-Path $platformPkgMarkerPath) -and -not $Force) {
    # Read the marker to check which platform version was installed
    $markerVersion = $null
    foreach ($mline in [System.IO.File]::ReadAllLines($platformPkgMarkerPath)) {
        if ($mline -match '^Platform version:\s*(.+)$') {
            $markerVersion = $Matches[1].Trim()
            break
        }
    }

    if ($markerVersion -and $PlatformVersion -and $markerVersion -eq $PlatformVersion) {
        Write-Success "Platform package TIZEN-$PlatformVersion is already installed: $SdkPath"
        Write-Info ".platform-installed found (version $markerVersion). To reinstall, run again with -Force"
        exit 0
    } else {
        Write-Info ".platform-installed found but for version '$markerVersion', requested '$PlatformVersion'. Proceeding with installation."
    }
}

if ($Force) {
    Write-Warn "Force reinstall requested - removing .platform-installed marker"
    Remove-Item $platformPkgMarkerPath -Force -ErrorAction SilentlyContinue
}

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

$workdir = Join-Path ([System.IO.Path]::GetTempPath()) ("tizen-platform-pkg-" + [System.IO.Path]::GetRandomFileName())
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

# Parse pkg_list
$db = @{}
$cur = $null
foreach ($line in [System.IO.File]::ReadAllLines($pkglist)) {
    if ($line -match '^Package : (.+)$') {
        $cur = $Matches[1].Trim()
        if (-not $db.ContainsKey($cur)) {
            $db[$cur] = @{ Path = $null; Version = $null; Deps = @() }
        }
    } elseif ($cur) {
        if ($line -match '^Version : (.+)$' -and -not $db[$cur].Version) {
            $db[$cur].Version = $Matches[1].Trim()
        } elseif ($line -match '^Path : (.+)$' -and -not $db[$cur].Path) {
            $db[$cur].Path = $Matches[1].Trim()
        } elseif ($line -match '^Install-dependency : (.+)$' -and $db[$cur].Deps.Count -eq 0) {
            $deps = @()
            foreach ($entry in ($Matches[1] -split ',')) {
                $e = $entry.Trim()
                if (-not $e) { continue }
                $cond = $null
                $m = [regex]::Match($e, '\[([^\]]*)\]')
                if ($m.Success) {
                    $cond = $m.Groups[1].Value
                    $e = $e.Substring(0, $m.Index).Trim()
                }
                if (-not $e) { continue }
                if ($cond) {
                    $oses = $cond -split '[ ,]+'
                    if ($oses -notcontains $PkgOs) { continue }
                }
                $deps += $e
            }
            $db[$cur].Deps = @($deps)
        }
    }
}
Write-Success "Parsed $($db.Count) packages from pkg_list"

# -----------------------------------------------------------------------------
# Determine platform version and target platform package
# -----------------------------------------------------------------------------
if ($PlatformVersion) {
    $TargetPackage = "TIZEN-$PlatformVersion"
    Write-Info "Using specified platform version: $PlatformVersion"
} else {
    # Auto-detect the latest TIZEN-X.Y platform
    $platforms = $db.Keys | Where-Object { $_ -match '^TIZEN-[0-9]+\.[0-9]+$' } |
        ForEach-Object { ($_ -replace '^TIZEN-', '') } |
        Sort-Object { [version]$_ }
    if (-not $platforms -or $platforms.Count -eq 0) {
        Write-Err "No TIZEN platforms (TIZEN-X.Y) found in pkg_list"
        Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Info "Available Tizen platforms:"
    foreach ($v in $platforms) {
        Write-Info "    - TIZEN-$v"
    }

    $latest = $platforms | Select-Object -Last 1
    $PlatformVersion = $latest
    $TargetPackage = "TIZEN-$latest"
    Write-Success "Auto-detected latest platform: TIZEN-$latest -> target: $TargetPackage"
}

# Verify target package exists
if (-not $db.ContainsKey($TargetPackage)) {
    Write-Err "Target package not found in pkg_list: $TargetPackage"
    Write-Err "Available TIZEN platform packages:"
    foreach ($key in $db.Keys) {
        if ($key -match '^TIZEN-[0-9]+\.[0-9]+$') { Write-Err "  - $key" }
    }
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}

Write-Success "Target package found: $TargetPackage (version $($db[$TargetPackage].Version))"

# Recursively resolve dependencies
Write-Info "Resolving dependencies (transitive Install-dependency)..."
$resolved = New-Object System.Collections.Generic.List[string]
$seen = @{}

# Metas whose closure is the SDK-WIDE baseline (VS tools add-ons, tizen-core,
# the C# CLI, certificate tools, ...). They are legitimate when the platform
# itself depends on them, but pulling them in through the shared-tool seed
# would turn "install the platform" into a 30-package SDK refresh -
# keeping those current is tizen-update-package's job, not this script's.
$sharedSeedExclude = @{ "BASELINE-COMMON" = $true }

function Resolve-From {
    param([string]$Seed, [switch]$ApplyExclude)
    $queue = New-Object System.Collections.Generic.Queue[string]
    $queue.Enqueue($Seed) | Out-Null
    while ($queue.Count -gt 0) {
        $curPkg = $queue.Dequeue()
        if ($seen.ContainsKey($curPkg)) { continue }
        if ($ApplyExclude -and $sharedSeedExclude.ContainsKey($curPkg)) { continue }
        $seen[$curPkg] = $true
        $resolved.Add($curPkg)
        if ($db.ContainsKey($curPkg)) {
            foreach ($d in $db[$curPkg].Deps) {
                if (-not $seen.ContainsKey($d)) { $queue.Enqueue($d) | Out-Null }
            }
        }
    }
}

Resolve-From $TargetPackage

# TIZEN-X.Y's closure includes TIZEN-X.Y-Emulator, so a platform install also
# delivers that platform's em-plugin-tizen.jar - but the shared emulator tools
# (emulator-manager, emulator-control-panel, sdb, ...) live under the SEPARATE
# "Emulator" meta package and are never in this closure. A new platform's
# plugin can therefore require a newer shared manager than the one installed
# with an older platform (observed as NoSuchFieldError: isVirgl on tizen-11.0).
#
# Widen the closure with the Emulator tools, but as SYNC-ONLY: packages reached
# only through this seed refresh an EXISTING install to the repo version and are
# never installed fresh - sync keeps things consistent, it does not grow the SDK.
# The SDK-wide baseline metas are excluded (see $sharedSeedExclude), so this
# adds the emulator tools themselves, not a whole-SDK refresh.
$sharedSyncOnly = @{}
if ($db.ContainsKey("Emulator")) {
    $before = $resolved.Count
    Resolve-From "Emulator" -ApplyExclude
    for ($i = $before; $i -lt $resolved.Count; $i++) {
        $sharedSyncOnly[$resolved[$i]] = $true
    }
    Write-Info "Shared 'Emulator' tools added to the resolve set (sync-only, $($sharedSyncOnly.Count) pkgs): $($sharedSyncOnly.Keys -join ', ')"
} else {
    Write-Warn "'Emulator' meta package not found in pkg_list - shared tools will not be checked for staleness."
}

$total = $resolved.Count
Write-Success "Total resolved packages: $total"

# Dry-run: list only
if ($DryRun) {
    Write-Warn "[DRY-RUN] The following packages would be installed (no download/install):"
    $n = 0
    foreach ($pkg in $resolved) {
        $n++
        $p = if ($db.ContainsKey($pkg)) { $db[$pkg].Path } else { $null }
        if (-not $p) { $p = "<no-binary>" }
        $tag = if ($sharedSyncOnly.ContainsKey($pkg)) { " [shared sync-only]" } else { "" }
        "    {0,3}. {1,-48} {2}{3}" -f $n, $pkg, $p, $tag | Write-Host
    }
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 0
}

# Download and merge each package
if (-not (Test-Path $SdkPath)) {
    New-Item -ItemType Directory -Path $SdkPath -Force | Out-Null
}

$idx = 0; $ok = 0; $skip = 0; $fail = 0
foreach ($pkg in $resolved) {
    $idx++

    $manifestFile = Join-Path $pkgInfoDir "$pkg.manifest"

    # Shared-tool sync never installs something new - it only refreshes what
    # this SDK already has. A package reached solely through the "Emulator"
    # seed and not present locally is simply not part of this installation.
    if ($sharedSyncOnly.ContainsKey($pkg) -and -not (Test-Path $manifestFile)) {
        Write-Info "[$idx/$total] ${pkg}: shared tool not previously installed - skip (sync refreshes existing installs only)"
        $skip++
        continue
    }

    # Skip if already installed (manifest exists with same version) and not force
    if ((Test-Path $manifestFile) -and -not $Force) {
        # Read version from existing manifest
        $installedVersion = $null
        foreach ($mline in [System.IO.File]::ReadAllLines($manifestFile)) {
            if ($mline -match '^Version\s*:\s*(.+)$') {
                $installedVersion = $Matches[1].Trim()
                break
            }
        }

        # Compare with version from pkg_list
        $repoVersion = if ($db.ContainsKey($pkg)) { $db[$pkg].Version } else { $null }
        if ($installedVersion -and $repoVersion -and $installedVersion -eq $repoVersion) {
            Write-Info "[$idx/$total] $pkg already installed (version $installedVersion), skip"
            $skip++
            continue
        } else {
            Write-Info "[$idx/$total] ${pkg}: installed=$installedVersion repo=$repoVersion, updating"
        }
    }

    $relPath = if ($db.ContainsKey($pkg)) { $db[$pkg].Path } else { $null }
    if (-not $relPath) {
        Write-Warn "[$idx/$total] ${pkg}: no binary path (meta/skip)"
        $skip++
        continue
    }

    $url = "$PkgRepo$relPath"
    $zip = Join-Path $workdir ([System.IO.Path]::GetFileName($relPath))
    Write-Info "[$idx/$total] Downloading $pkg ..."
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
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
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
        Write-Err "[$idx/$total] Extraction failed: $pkg - $_"
        $fail++
        Remove-Item -Force $zip -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
        continue
    }

    # Merge data\ contents into the SDK root
    $dataDir = Join-Path $stage "data"
    if (Test-Path $dataDir) {
        $dataItems = Get-ChildItem -Path $dataDir -Force -ErrorAction SilentlyContinue
        if ($dataItems.Count -gt 0) {
            if ($PkgOs -eq "windows-64") {
                robocopy $dataDir $SdkPath /E /NFL /NDL /NJH /NJS /NP /R:5 /W:2 /XO | Out-Null
                if ($LASTEXITCODE -ge 8) {
                    Write-Err "[$idx/$total] Merge failed: $pkg (robocopy $LASTEXITCODE)"
                    $fail++
                    Remove-Item -Force $zip -ErrorAction SilentlyContinue
                    Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
                    continue
                }
            } else {
                Copy-Item -Path "$dataDir/*" -Destination $SdkPath -Recurse -Force
            }
        } else {
            Write-Info "[$idx/$total] ${pkg}: data\ is empty, skip merge"
        }
    }

    # Keep manifest record
    $manifest = Join-Path $stage "pkginfo.manifest"
    if (Test-Path $manifest) {
        Copy-Item -Path $manifest -Destination (Join-Path $pkgInfoDir "$pkg.manifest") -Force
    }

    Remove-Item -Force $zip -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
    $ok++
    Write-Success "[$idx/$total] $pkg installed"
}

Write-Success "Platform package result: OK $ok / skipped $skip / failed $fail (total $total)"

if ($fail -gt 0) {
    Write-Err "Some packages failed to install. Not creating .platform-installed marker."
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}

# Create .platform-installed marker
$markerContent = "Platform package installed at $(Get-Date -Format 'o')`nTarget: $TargetPackage`nPlatform version: $PlatformVersion`n"
Set-Content -Path $platformPkgMarkerPath -Value $markerContent -Encoding UTF8
Write-Success ".platform-installed created: $platformPkgMarkerPath"

Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
Write-Success "Tizen platform package installation completed!"
exit 0
