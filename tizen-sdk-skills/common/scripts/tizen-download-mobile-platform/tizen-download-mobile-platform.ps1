#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-download-mobile-platform.ps1
# Tizen Mobile platform package downloader for Windows
#
# - Reads the CDN mirror URL from {SDK_PATH}\.package\repository.info
#   (falls back to the official repo if the file is missing)
# - Downloads pkg_list from the Tizen package repository
# - Auto-detects the latest MOBILE-X.Y platform (or uses -PlatformVersion)
# - Resolves MOBILE-{version} and its Install-dependency packages
# - Downloads each from (repo + Path) and merges data\ into the SDK root
# - Optionally downloads IOT-Headed extension:
#   1) Downloads extension_info.xml from the repository
#   2) Parses the XML to extract the IoT Headed repository URL
#   3) Downloads pkg_list from the IoT repository
#   4) Resolves and installs IOT-Headed-{version} package
# - Creates .mobile-platform-installed marker on success
#
# Exit codes:
#   0 = success
#   1 = failure

param(
    [string]$SdkPath = "",
    [string]$PlatformVersion = "",
    [switch]$IncludeIotHeaded,
    [string]$IotHeadedVersion = "",
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
    $PkgOsShort = "windows"
} elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::OSX)) {
    $PkgOs = "macos-64"
    $PkgOsShort = "macos"
} elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Linux)) {
    $PkgOs = "ubuntu-64"
    $PkgOsShort = "ubuntu"
} else {
    Write-Err "Unsupported OS. This script supports Windows, macOS, and Linux only."
    exit 1
}

# Show help
if ($Help) {
    Write-Host @"
Tizen Mobile platform package downloader

Usage: .\tizen-download-mobile-platform.ps1 [OPTIONS]

Options:
  -SdkPath <path>           Tizen SDK installation path
                             (default: TIZEN_SDK_PATH / ~\.tizen.sdk.path.config / ~\tizen-sdk)
  -PlatformVersion <ver>    Tizen Mobile platform version (e.g., "10.0", "11.0").
                             Auto-detects latest MOBILE-X.Y if not specified.
  -IncludeIotHeaded         Also download and install the IOT-Headed extension.
  -IotHeadedVersion <ver>   Specific IOT-Headed version to install (e.g., "10.0").
                             Auto-detects latest if not specified.
  -Force                    Force reinstall even if mobile platform package is already installed
  -DryRun                   Resolve and list packages only (no download/install)
  -Help                     Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Reads repository.info for the CDN mirror URL
  3) Downloads/parses `$PkgRepo/pkg_list_`$PkgOs
  4) Auto-detects latest MOBILE-X.Y platform (or uses -PlatformVersion)
  5) Resolves MOBILE-{version} and its Install-dependency packages
  6) Downloads each from (repo + Path) and merges data\ into the SDK root
  7) If -IncludeIotHeaded is specified:
     a) Downloads extension_info.xml from the repository
     b) Parses the XML to extract the IoT Headed repository URL
     c) Downloads pkg_list from the IoT repository
     d) Resolves and installs IOT-Headed-{version} package
  8) Creates .mobile-platform-installed marker on success

Examples:
  .\tizen-download-mobile-platform.ps1
  .\tizen-download-mobile-platform.ps1 -SdkPath "C:\tizen-studio"
  .\tizen-download-mobile-platform.ps1 -PlatformVersion "10.0"
  .\tizen-download-mobile-platform.ps1 -IncludeIotHeaded
  .\tizen-download-mobile-platform.ps1 -IncludeIotHeaded -IotHeadedVersion "10.0"
  .\tizen-download-mobile-platform.ps1 -DryRun
"@
    exit 0
}

# Set default SDK path if not provided
if (-not $SdkPath) {
    $SdkPath = Get-SdkPath
}

Write-Info "Tizen Mobile platform package downloader started"
Write-Info "SDK path: $SdkPath"
Write-Info "Detected OS: $PkgOs (pkg_list: pkg_list_$PkgOs)"

# Verify Tizen SDK is installed
$sdkInfoPath = Join-Path $SdkPath "sdk.info"
if (-not (Test-Path $sdkInfoPath)) {
    Write-Err "Tizen SDK is NOT installed at $SdkPath (sdk.info not found)"
    Write-Err "Mobile platform package download requires Tizen SDK to be installed first."
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

# Check mode / skip if already installed
$mobilePkgMarkerPath = Join-Path $SdkPath ".mobile-platform-installed"
if ((Test-Path $mobilePkgMarkerPath) -and -not $Force) {
    # Read the marker to check which platform version was installed
    $markerVersion = $null
    $markerIotHeaded = $false
    foreach ($mline in [System.IO.File]::ReadAllLines($mobilePkgMarkerPath)) {
        if ($mline -match '^Platform version:\s*(.+)$') {
            $markerVersion = $Matches[1].Trim()
        }
        if ($mline -match '^IOT-Headed:\s*(.+)$') {
            $markerIotHeaded = $true
        }
    }

    if ($markerVersion -and $PlatformVersion -and $markerVersion -eq $PlatformVersion) {
        Write-Success "Mobile platform package MOBILE-$PlatformVersion is already installed: $SdkPath"
        if ($IncludeIotHeaded -and -not $markerIotHeaded) {
            Write-Info "IOT-Headed extension was not installed previously. Will install IOT-Headed only (skipping MOBILE platform)."
            $SkipMobilePlatform = $true
        } else {
            Write-Info ".mobile-platform-installed found (version $markerVersion). To reinstall, run again with -Force"
            exit 0
        }
    } else {
        Write-Info ".mobile-platform-installed found but for version '$markerVersion', requested '$PlatformVersion'. Proceeding with installation."
    }
} else {
    # No marker file exists, so we need full installation
    $SkipMobilePlatform = $false
}

if ($Force) {
    Write-Warn "Force reinstall requested - removing .mobile-platform-installed marker"
    Remove-Item $mobilePkgMarkerPath -Force -ErrorAction SilentlyContinue
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

$workdir = Join-Path ([System.IO.Path]::GetTempPath()) ("tizen-mobile-pkg-" + [System.IO.Path]::GetRandomFileName())
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
# Determine Mobile platform version and target platform package
# -----------------------------------------------------------------------------
if ($PlatformVersion) {
    $TargetPackage = "MOBILE-$PlatformVersion"
    Write-Info "Using specified platform version: $PlatformVersion"
} else {
    # Auto-detect the latest MOBILE-X.Y platform
    $platforms = $db.Keys | Where-Object { $_ -match '^MOBILE-[0-9]+\.[0-9]+$' } |
        ForEach-Object { ($_ -replace '^MOBILE-', '') } |
        Sort-Object { [version]$_ }
    if (-not $platforms -or $platforms.Count -eq 0) {
        Write-Err "No MOBILE platforms (MOBILE-X.Y) found in pkg_list"
        Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Info "Available MOBILE platforms:"
    foreach ($v in $platforms) {
        Write-Info "    - MOBILE-$v"
    }

    $latest = $platforms | Select-Object -Last 1
    $PlatformVersion = $latest
    $TargetPackage = "MOBILE-$latest"
    Write-Success "Auto-detected latest MOBILE platform: MOBILE-$latest -> target: $TargetPackage"
}

# Verify target package exists
if (-not $db.ContainsKey($TargetPackage)) {
    Write-Err "Target package not found in pkg_list: $TargetPackage"
    Write-Err "Available MOBILE platform packages:"
    foreach ($key in $db.Keys) {
        if ($key -match '^MOBILE-[0-9]+\.[0-9]+$') { Write-Err "  - $key" }
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
# would turn "install the mobile platform" into a 30-package SDK refresh -
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

# MOBILE-X.Y's closure can include that platform's emulator resources (the
# mobile em-plugin jar) - but the shared emulator tools (emulator-manager,
# emulator-control-panel, sdb, ...) live under the SEPARATE "Emulator" meta
# package and are never in this closure. A new platform's plugin can therefore
# require a newer shared manager than the one installed with an older platform
# (observed as NoSuchFieldError: isVirgl on tizen-11.0).
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

# Download and merge each package (skip if only downloading IOT-Headed)
if (-not (Test-Path $SdkPath)) {
    New-Item -ItemType Directory -Path $SdkPath -Force | Out-Null
}

$idx = 0; $ok = 0; $skip = 0; $fail = 0

# Skip MOBILE platform download if only IOT-Headed is needed
if ($SkipMobilePlatform) {
    Write-Info "Skipping MOBILE platform download (already installed) - only downloading IOT-Headed extension"
    $ok = $resolved.Count
    $skip = $resolved.Count
} else {
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
}

Write-Success "Mobile platform package result: OK $ok / skipped $skip / failed $fail (total $total)"

if ($fail -gt 0) {
    Write-Err "Some packages failed to install. Not creating .mobile-platform-installed marker."
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}

# -----------------------------------------------------------------------------
# IOT-Headed Extension (optional)
# -----------------------------------------------------------------------------
$iotHeadedInstalled = $false

if ($IncludeIotHeaded) {
    Write-Info "IOT-Headed extension requested (-IncludeIotHeaded)"
    
    # Download extension_info.xml to get the IoT Headed repository URL
    $extensionInfoUrl = "$PkgRepo/extension_info.xml"
    $extensionInfoFile = Join-Path $workdir "extension_info.xml"
    
    Write-Info "Downloading extension info: $extensionInfoUrl"
    try {
        $progressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $extensionInfoUrl -OutFile $extensionInfoFile -UseBasicParsing
    } catch {
        Write-Err "Failed to download extension_info.xml: $_"
        Write-Warn "IOT-Headed extension will NOT be installed. Continuing with Mobile platform only."
    }
    
    if (Test-Path $extensionInfoFile) {
        # Parse the XML to extract IoT Headed repository URL
        try {
            $xml = [xml](Get-Content $extensionInfoFile -Raw)
            
            # Look for IoT Headed repository in the XML
            # Expected structure: <extensionSDK><extension><name>Tizen IoT Headed</name><repository>URL</repository>...</extension></extensionSDK>
            $iotRepo = $null
            foreach ($ext in $xml.extensionSDK.extension) {
                # Check the <name> child element (not attribute)
                if ($ext.name -match 'Tizen.*IoT.*Headed' -or $ext.name -match 'IoT.*Headed' -or $ext.name -match 'IOT.*Headed') {
                    if ($ext.repository) {
                        $iotRepo = $ext.repository.Trim()
                        Write-Success "Found IOT-Headed repository: $iotRepo"
                        break
                    }
                }
            }
            
            if (-not $iotRepo) {
                # Try alternative regex search - look for Tizen IoT Headed context
                $content = Get-Content $extensionInfoFile -Raw
                # Match <extension> block containing <name>Tizen IoT Headed</name> followed by <repository>
                if ($content -match '<extension[^>]*>.*?<name[^>]*>Tizen IoT Headed</name>.*?<repository[^>]*>([^<]+)</repository>') {
                    $iotRepo = $Matches[1].Trim()
                    Write-Success "Found IOT-Headed repository (regex parse): $iotRepo"
                }
            }
            
            if (-not $iotRepo) {
                Write-Err "Could not find IOT-Headed repository URL in extension_info.xml"
                Write-Warn "IOT-Headed extension will NOT be installed."
            } else {
                # Download pkg_list from IoT repository
                $iotPkgListUrl = "$iotRepo/pkg_list_$PkgOs"
                $iotPkgList = Join-Path $workdir "pkg_list_iot"
                
                Write-Info "Downloading IOT-Headed package list: $iotPkgListUrl"
                $iotPkgListDownloadFailed = $false
                try {
                    $progressPreference = 'SilentlyContinue'
                    Invoke-WebRequest -Uri $iotPkgListUrl -OutFile $iotPkgList -UseBasicParsing
                } catch {
                    # Try 32-bit if 64-bit fails
                    if ($PkgOs -eq "windows-64" -or $PkgOs -eq "ubuntu-64" -or $PkgOs -eq "macos-64") {
                        $PkgOs32 = "$PkgOsShort-32"
                        $iotPkgListUrl = "$iotRepo/pkg_list_$PkgOs32"
                        Write-Warn "64-bit pkg_list not found, trying 32-bit: $iotPkgListUrl"
                        try {
                            $progressPreference = 'SilentlyContinue'
                            Invoke-WebRequest -Uri $iotPkgListUrl -OutFile $iotPkgList -UseBasicParsing
                        } catch {
                            Write-Err "Failed to download IOT-Headed pkg_list (32-bit also failed): $_"
                            $iotPkgListDownloadFailed = $true
                        }
                    } else {
                        Write-Err "Failed to download IOT-Headed pkg_list: $_"
                        $iotPkgListDownloadFailed = $true
                    }
                }
                
                if ($iotPkgListDownloadFailed) {
                    Write-Warn "IOT-Headed extension will NOT be installed. Continuing with Mobile platform only."
                    $iotRepo = $null
                } else {
                    Write-Success "IOT-Headed package list downloaded successfully"
                    
                    # Parse IoT pkg_list
                    $iotDb = @{}
                    $cur = $null
                    foreach ($line in [System.IO.File]::ReadAllLines($iotPkgList)) {
                    if ($line -match '^Package : (.+)$') {
                        $cur = $Matches[1].Trim()
                        if (-not $iotDb.ContainsKey($cur)) {
                            $iotDb[$cur] = @{ Path = $null; Version = $null; Deps = @() }
                        }
                    } elseif ($cur) {
                        if ($line -match '^Version : (.+)$' -and -not $iotDb[$cur].Version) {
                            $iotDb[$cur].Version = $Matches[1].Trim()
                        } elseif ($line -match '^Path : (.+)$' -and -not $iotDb[$cur].Path) {
                            $iotDb[$cur].Path = $Matches[1].Trim()
                        } elseif ($line -match '^Install-dependency : (.+)$' -and $iotDb[$cur].Deps.Count -eq 0) {
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
                            $iotDb[$cur].Deps = @($deps)
                        }
                    }
                }
                    Write-Success "Parsed $($iotDb.Count) packages from IOT-Headed pkg_list"
                    
                    # Determine IOT-Headed version
                if ($IotHeadedVersion) {
                    $IotTargetPackage = "IOT-Headed-$IotHeadedVersion"
                    Write-Info "Using specified IOT-Headed version: $IotHeadedVersion"
                } else {
                    # Auto-detect the latest IOT-Headed-X.Y package
                    $iotPlatforms = $iotDb.Keys | Where-Object { $_ -match '^IOT-Headed-[0-9]+\.[0-9]+$' } |
                        ForEach-Object { ($_ -replace '^IOT-Headed-', '') } |
                        Sort-Object { [version]$_ }
                    if (-not $iotPlatforms -or $iotPlatforms.Count -eq 0) {
                        Write-Err "No IOT-Headed platforms (IOT-Headed-X.Y) found in pkg_list"
                        Write-Warn "IOT-Headed extension will NOT be installed."
                    } else {
                        Write-Info "Available IOT-Headed platforms:"
                        foreach ($v in $iotPlatforms) {
                            Write-Info "    - IOT-Headed-$v"
                        }
                        
                        $iotLatest = $iotPlatforms | Select-Object -Last 1
                        $IotHeadedVersion = $iotLatest
                        $IotTargetPackage = "IOT-Headed-$iotLatest"
                        Write-Success "Auto-detected latest IOT-Headed: IOT-Headed-$iotLatest -> target: $IotTargetPackage"
                    }
                }
                
                # Install IOT-Headed if target was determined
                if ($IotTargetPackage -and $iotDb.ContainsKey($IotTargetPackage)) {
                    Write-Success "IOT-Headed target package found: $IotTargetPackage (version $($iotDb[$IotTargetPackage].Version))"
                    
                    # Resolve IOT-Headed dependencies
                    Write-Info "Resolving IOT-Headed dependencies..."
                    $iotResolved = New-Object System.Collections.Generic.List[string]
                    $iotSeen = @{}
                    $iotQueue = New-Object System.Collections.Generic.Queue[string]
                    $iotQueue.Enqueue($IotTargetPackage) | Out-Null
                    while ($iotQueue.Count -gt 0) {
                        $iotCurPkg = $iotQueue.Dequeue()
                        if ($iotSeen.ContainsKey($iotCurPkg)) { continue }
                        $iotSeen[$iotCurPkg] = $true
                        $iotResolved.Add($iotCurPkg)
                        if ($iotDb.ContainsKey($iotCurPkg)) {
                            foreach ($iotD in $iotDb[$iotCurPkg].Deps) {
                                if (-not $iotSeen.ContainsKey($iotD)) { $iotQueue.Enqueue($iotD) | Out-Null }
                            }
                        }
                    }
                    
                    $iotTotal = $iotResolved.Count
                    Write-Success "Total IOT-Headed resolved packages: $iotTotal"
                    
                    # Download and install IOT-Headed packages
                    $iotIdx = 0; $iotOk = 0; $iotSkip = 0; $iotFail = 0
                    foreach ($pkg in $iotResolved) {
                        $iotIdx++
                        
                        # Skip if already installed
                        $iotManifestFile = Join-Path $pkgInfoDir "$pkg.manifest"
                        if ((Test-Path $iotManifestFile) -and -not $Force) {
                            $iotInstalledVersion = $null
                            foreach ($mline in [System.IO.File]::ReadAllLines($iotManifestFile)) {
                                if ($mline -match '^Version\s*:\s*(.+)$') {
                                    $iotInstalledVersion = $Matches[1].Trim()
                                    break
                                }
                            }
                            $iotRepoVersion = if ($iotDb.ContainsKey($pkg)) { $iotDb[$pkg].Version } else { $null }
                            if ($iotInstalledVersion -and $iotRepoVersion -and $iotInstalledVersion -eq $iotRepoVersion) {
                                Write-Info "[IOT $iotIdx/$iotTotal] $pkg already installed (version $iotInstalledVersion), skip"
                                $iotSkip++
                                continue
                            }
                        }
                        
                        $iotRelPath = if ($iotDb.ContainsKey($pkg)) { $iotDb[$pkg].Path } else { $null }
                        if (-not $iotRelPath) {
                            Write-Warn "[IOT $iotIdx/$iotTotal] ${pkg}: no binary path (meta/skip)"
                            $iotSkip++
                            continue
                        }
                        
                        $iotUrl = "$iotRepo$iotRelPath"
                        $iotZip = Join-Path $workdir ([System.IO.Path]::GetFileName($iotRelPath))
                        Write-Info "[IOT $iotIdx/$iotTotal] Downloading $pkg ..."
                        try {
                            $wc = New-Object System.Net.WebClient
                            $wc.DownloadFile($iotUrl, $iotZip)
                            $wc.Dispose()
                        } catch {
                            Write-Err "[IOT $iotIdx/$iotTotal] Download failed: $iotUrl - $_"
                            $iotFail++
                            continue
                        }
                        
                        $iotStage = Join-Path $workdir ("iot_stage_" + $iotIdx)
                        if (Test-Path $iotStage) { Remove-Item -Recurse -Force $iotStage -ErrorAction SilentlyContinue }
                        New-Item -ItemType Directory -Path $iotStage -Force | Out-Null
                        
                        try {
                            Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
                            $iotArchive = [System.IO.Compression.ZipFile]::OpenRead($iotZip)
                            try {
                                foreach ($entry in $iotArchive.Entries) {
                                    if ([string]::IsNullOrEmpty($entry.Name)) { continue }
                                    $destPath = Join-Path $iotStage $entry.FullName
                                    $destDir = Split-Path -Parent $destPath
                                    if ($destDir -and -not (Test-Path $destDir)) {
                                        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                                    }
                                    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
                                }
                            } finally {
                                $iotArchive.Dispose()
                            }
                        } catch {
                            Write-Err "[IOT $iotIdx/$iotTotal] Extraction failed: $pkg - $_"
                            $iotFail++
                            Remove-Item -Force $iotZip -ErrorAction SilentlyContinue
                            Remove-Item -Recurse -Force $iotStage -ErrorAction SilentlyContinue
                            continue
                        }
                        
                        # Merge data\ contents into the SDK root
                        $iotDataDir = Join-Path $iotStage "data"
                        if (Test-Path $iotDataDir) {
                            $iotDataItems = Get-ChildItem -Path $iotDataDir -Force -ErrorAction SilentlyContinue
                            if ($iotDataItems.Count -gt 0) {
                                if ($PkgOs -eq "windows-64") {
                                    robocopy $iotDataDir $SdkPath /E /NFL /NDL /NJH /NJS /NP /R:5 /W:2 /XO | Out-Null
                                    if ($LASTEXITCODE -ge 8) {
                                        Write-Err "[IOT $iotIdx/$iotTotal] Merge failed: $pkg (robocopy $LASTEXITCODE)"
                                        $iotFail++
                                        Remove-Item -Force $iotZip -ErrorAction SilentlyContinue
                                        Remove-Item -Recurse -Force $iotStage -ErrorAction SilentlyContinue
                                        continue
                                    }
                                } else {
                                    Copy-Item -Path "$iotDataDir/*" -Destination $SdkPath -Recurse -Force
                                }
                            }
                        }
                        
                        # Keep manifest record
                        $iotManifest = Join-Path $iotStage "pkginfo.manifest"
                        if (Test-Path $iotManifest) {
                            Copy-Item -Path $iotManifest -Destination (Join-Path $pkgInfoDir "$pkg.manifest") -Force
                        }
                        
                        Remove-Item -Force $iotZip -ErrorAction SilentlyContinue
                        Remove-Item -Recurse -Force $iotStage -ErrorAction SilentlyContinue
                        $iotOk++
                        Write-Success "[IOT $iotIdx/$iotTotal] $pkg installed"
                    }
                    
                    Write-Success "IOT-Headed extension result: OK $iotOk / skipped $iotSkip / failed $iotFail (total $iotTotal)"
                    
                    if ($iotFail -eq 0) {
                        $iotHeadedInstalled = $true
                        Write-Success "IOT-Headed extension installed successfully!"
                    } else {
                        Write-Warn "Some IOT-Headed packages failed to install."
                    }
                }
                }
            }
        } catch {
            Write-Err "Failed to parse extension_info.xml: $_"
            Write-Warn "IOT-Headed extension will NOT be installed."
        }
    }
}

# Create/update .mobile-platform-installed marker
if ($SkipMobilePlatform -and $iotHeadedInstalled) {
    # MOBILE platform already exists, just append IOT-Headed status
    $existingContent = Get-Content -Path $mobilePkgMarkerPath -Raw
    if (-not $existingContent.Contains("IOT-Headed:")) {
        $existingContent += "IOT-Headed: installed`nIOT-Headed version: $IotHeadedVersion`nUpdated at: $(Get-Date -Format 'o')`n"
        Set-Content -Path $mobilePkgMarkerPath -Value $existingContent -Encoding UTF8
        Write-Success ".mobile-platform-installed updated with IOT-Headed status"
    }
} else {
    $markerContent = "Mobile platform package installed at $(Get-Date -Format 'o')`nTarget: $TargetPackage`nPlatform version: $PlatformVersion`n"
    if ($iotHeadedInstalled) {
        $markerContent += "IOT-Headed: installed`nIOT-Headed version: $IotHeadedVersion`n"
    }
    Set-Content -Path $mobilePkgMarkerPath -Value $markerContent -Encoding UTF8
    Write-Success ".mobile-platform-installed created: $mobilePkgMarkerPath"
}

Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
Write-Success "Tizen Mobile platform package download completed!"
exit 0
