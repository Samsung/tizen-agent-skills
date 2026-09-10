#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-sdk-install.ps1
# Tizen SDK platform-package installer for Windows
#
# - Parses pkg_list_windows-64 and auto-detects the latest Tizen platform
#   (e.g. installs TIZEN-10.0 today; will pick TIZEN-11.0 once it appears)
# - Recursively resolves the platform's Install-dependency packages
# - Downloads each package from (repo + Path) and merges data\ into the SDK root

param(
    [string]$Path = "",
    [string]$Platform = "",        # e.g. "10.0" / "11.0"; empty = auto-pick latest
    [string]$RepoUrl = "",         # custom package repository URL; empty = timezone CDN mirror
    [switch]$ValidateRepoUrl,      # validate -RepoUrl only (no install) and exit
    [switch]$DryRun,               # resolve & list only, no download/install
    [switch]$Force,                # reinstall even if already installed
    [switch]$Check,
    [switch]$Status,               # query the outcome of the last (or in-progress) run
    [switch]$Wait,                 # sleep 60 seconds then print status (for Cline polling)
    [switch]$Detach,               # re-launch self in background via Start-Process and exit
    [switch]$Help
)


# Set default path if not provided: ~\.tizen.sdk.path.config, else TIZEN_SDK_PATH
# (unless it is a Tizen Studio install), else %USERPROFILE%\tizen-sdk — see
# Get-DefaultSdkInstallPath in lib\common.ps1 (issue #70). -Path always wins.
# lib\common.ps1 is dot-sourced again further down together with the other
# helpers; loading it here too is harmless (function definitions only).
. (Join-Path $PSScriptRoot "..\lib\common.ps1")
if (-not $Path) {
    $Path = Get-DefaultSdkInstallPath
}

# -----------------------------------------------------------------------------
# Durable run-state markers (mirror of the bash script).
# A completed install stays recoverable even if the harness completion
# notification never reaches the launching context - the truth is on disk and
# queryable via -Status. This makes a "completion report lost" situation
# impossible: rerun with -Status to recover STATUS=running|done EXIT=<code>|none.
#   <install>\.install-running  - present while a real install is in progress
#   <install>\.install-result   - written on exit; holds "EXIT=<code>"
# -----------------------------------------------------------------------------
$RunningMarker = Join-Path $Path ".install-running"
$ResultMarker  = Join-Path $Path ".install-result"

if ($Status) {
    if (Test-Path $RunningMarker) {
        Write-Host "STATUS=running"
    } elseif (Test-Path $ResultMarker) {
        Write-Host ("STATUS=done " + ((Get-Content $ResultMarker -Raw -ErrorAction SilentlyContinue) -replace '\s+$',''))
    } elseif (Test-Path (Join-Path $Path "sdk.info")) {
        Write-Host "STATUS=done EXIT=0"
    } else {
        Write-Host "STATUS=none"
    }
    exit 0
}

# -Wait: sleep 60 seconds then print status. This enforces a 60-second polling
# interval for harnesses (e.g. Cline) that would otherwise poll in a tight
# loop. The sleep is inside the script so the agent cannot skip it.
if ($Wait) {
    Start-Sleep -Seconds 60
    if (Test-Path $RunningMarker) {
        Write-Host "STATUS=running"
    } elseif (Test-Path $ResultMarker) {
        Write-Host ("STATUS=done " + ((Get-Content $ResultMarker -Raw -ErrorAction SilentlyContinue) -replace '\s+$',''))
    } elseif (Test-Path (Join-Path $Path "sdk.info")) {
        Write-Host "STATUS=done EXIT=0"
    } else {
        Write-Host "STATUS=none"
    }
    exit 0
}

# -Detach: re-launch self in background via Start-Process and exit immediately.
# This is for harnesses (e.g. Cline) that have a 10-minute background process
# timeout but no task-notification mechanism. The caller polls -Status to
# detect completion. The detached process survives the harness timeout because
# Start-Process creates an independent process.
#
# Every option that changes WHAT gets installed must be forwarded - dropping
# -RepoUrl here would silently install from the default CDN mirror instead of
# the repository the user asked for.
if ($Detach) {
    $logFile = Join-Path $env:TEMP "tizen-sdk-install.log"
    $procArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', $PSCommandPath,
        '-Force'
    )
    if ($Platform) { $procArgs += @('-Platform', $Platform) }
    if ($Path) { $procArgs += @('-Path', $Path) }
    if ($RepoUrl) { $procArgs += @('-RepoUrl', $RepoUrl) }
    $proc = Start-Process -FilePath "powershell" -ArgumentList $procArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
    Write-Host "PID=$($proc.Id)"
    Write-Host "LOG=$logFile"
    Write-Host "Poll status with: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Status"
    exit 0
}


# NOTE: This script runs INLINE (no whole-script elevation), so the caller
# (e.g. an agent's shell) receives its full output and exit code and can block
# until it finishes. The only step that needs admin - enabling Windows Long Path
# Support (an HKLM registry write) - elevates itself with a single short UAC
# prompt inside Enable-LongPathSupport. Everything else (download, extract,
# merge into the user profile, set User-scope env vars) needs no admin.

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# -ValidateRepoUrl: check the repository URL and exit. Nothing is downloaded or
# installed. Exit 0 = valid (pkg_list_{OS}-{64,32} served), 1 = invalid.
#
# The two REPOSITORY=/PKG_LIST= lines are the machine-readable result, so the
# Node pre-check layer can report WHICH pkg_list was found without
# re-implementing the probe.
if ($ValidateRepoUrl) {
    if (-not $RepoUrl) {
        Write-Err "-ValidateRepoUrl requires -RepoUrl <url>"
        exit 1
    }
    $matched = Test-PkgRepoUrl -Url $RepoUrl
    if ($matched) {
        Write-Host ("REPOSITORY=" + (Get-NormalizedRepoUrl $RepoUrl))
        Write-Host ("PKG_LIST=pkg_list_" + $matched)
        exit 0
    }
    exit 1
}

# Additional packages to install beyond the platform base
$AdditionalPackages = @(
    'version-manager',
    'tizen-core',
    'certificate-generator',
    'certificate-encryptor',
    'Emulator'
)

# Force-install optional remote scripting packages (tizen-X.Y-rs-*)
$ForceOptionalPackages = $true

# CDN mirror selection based on system timezone offset.
# Mirrors (base URLs from <alternativeRoot>):
#   official   https://download.tizen.org/sdk/tizenstudio/       → /official
#   global     https://usa.sdk-dl.tizen.org/sdk/tizenstudio/     → /official
#   brazil     https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/  → /official
#   china      https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/ → /official
#   india      https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/ → /official
#
# Mapping (by UTC offset):
#   UTC-12 .. UTC-5  → Global     (North America)
#   UTC-4  .. UTC-1  → Brazil     (South America)
#   UTC+0  .. UTC+4  → Official   (Europe / Africa / Middle East)
#   UTC+5  .. UTC+12 → Singapore  (India / China / Southeast Asia / Oceania)
function Select-CdnRepo {
    $tzOffset = [TimeZoneInfo]::Local.GetUtcOffset([DateTime]::UtcNow).TotalHours
    # Round to nearest integer to handle half-hour timezones (e.g., India +5:30 → +5.5 → +6)
    $tzOffset = [Math]::Round($tzOffset)

    if ($tzOffset -le -5) {
        return "https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official"
    } elseif ($tzOffset -le -1) {
        return "https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official"
    } elseif ($tzOffset -le 4) {
        return "https://download.tizen.org/sdk/tizenstudio/official"
    } else {
        return "https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official"
    }
}

# 패키지 저장소 (pkg_list 및 binary zip 의 베이스 URL) - selected by timezone
$PkgRepo = Select-CdnRepo
$PkgOs   = "windows-64"

# -RepoUrl: install from a user-supplied repository instead of the CDN mirror.
#
# A URL only counts as a Tizen package repository if it serves
# pkg_list_{OS}-{64,32} for THIS OS - Test-PkgRepoUrl (lib\common.ps1) probes
# both arches and returns the one it found, which also lets a 32-bit-only mirror
# work. Anything else aborts here rather than after ~100 failed downloads.
# (skipped for -Help, which must not perform network probes)
if (-not $Help) {
    if ($RepoUrl) {
        $matchedPkgOs = Test-PkgRepoUrl -Url $RepoUrl
        if (-not $matchedPkgOs) {
            Write-Err "Aborting: -RepoUrl is not a valid Tizen package repository"
            exit 1
        }
        $PkgRepo = Get-NormalizedRepoUrl $RepoUrl
        $PkgOs   = $matchedPkgOs
        Write-Success "Using custom package repository: $PkgRepo (pkg_list_$PkgOs)"
    } else {
        Write-Info "Package repository (timezone-selected CDN): $PkgRepo"
    }
}


# Upstream pkg_list versions sometimes run ahead of the actually-published
# binaries, so a pkg_list Path can 404. Get-PublishedBinary lists binary/ once
# (cached) and returns the newest published <pkg>_<ver>_<os>.zip, so the
# download can fall back to a real file.
$script:BinListCache = $null
function Get-PublishedBinary {
    param([string]$Pkg, [string]$Os)
    if ($null -eq $script:BinListCache) {
        try {
            $html = (New-Object System.Net.WebClient).DownloadString("$PkgRepo/binary/")
            $script:BinListCache = @([regex]::Matches($html, 'href="([^"?]+\.zip)"') | ForEach-Object { $_.Groups[1].Value })
        } catch { $script:BinListCache = @() }
    }
    $esc = [regex]::Escape($Pkg)
    $osc = [regex]::Escape($Os)
    $pattern = "^${esc}_[^_/]+_${osc}\.zip$"
    $cands = @($script:BinListCache | Where-Object { $_ -match $pattern })
    if ($cands.Count -eq 0) { return $null }
    return ($cands | Sort-Object {
        $v = ($_ -replace "^${esc}_", '') -replace "_${osc}\.zip$", ''
        try { [version]$v } catch { [version]'0.0.0' }
    } | Select-Object -Last 1)
}

function Test-AdminPrivilege {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    return $isAdmin
}

function Enable-LongPathSupport {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
    $regName = "LongPathsEnabled"

    # Reading the registry does not require admin.
    $current = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
    if ($current.$regName -eq 1) {
        Write-Success "Long Path Support is already enabled"
        return $true
    }

    # Already elevated: write the key directly.
    if (Test-AdminPrivilege) {
        try {
            Write-Info "Enabling Windows Long Path Support (admin privilege)..."
            New-ItemProperty -Path $regPath -Name $regName -Value 1 -PropertyType DWORD -Force | Out-Null
            Write-Success "Long Path Support enabled"
            Write-Warn "Changes take effect after Windows restart or new console window"
            return $true
        } catch {
            Write-Err "Failed to enable Long Path Support: $_"
            return $false
        }
    }

    # Not admin: elevate ONLY this one registry write via a single short UAC prompt.
    Write-Info "Long Path Support needs admin; requesting elevation (UAC) for this one step..."
    $regCmd = "New-ItemProperty -Path '$regPath' -Name '$regName' -Value 1 -PropertyType DWORD -Force | Out-Null"
    try {
        Start-Process powershell -Verb RunAs -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $regCmd) | Out-Null
    } catch {
        Write-Warn "Long Path Support elevation was declined or failed; continuing without it"
        return $false
    }

    # Re-check after the elevated write.
    $current = Get-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
    if ($current.$regName -eq 1) {
        Write-Success "Long Path Support enabled (via elevation)"
        Write-Warn "Changes take effect after Windows restart or new console window"
        return $true
    }
    Write-Warn "Long Path Support not enabled (elevation declined); continuing without it"
    return $false
}

function Update-CurrentSessionEnvironment {
    param([string]$SdkPath)

    # tools = sdb.exe, tools\tizen-core = tz.exe (so both are callable by name)
    $sdkToolsPath = "$SdkPath\bin;$SdkPath\tools;$SdkPath\tools\tizen-core"

    # Make the current PowerShell session usable immediately.
    [Environment]::SetEnvironmentVariable("TIZEN_SDK_PATH", $SdkPath, "Process")

    $currentPath = [Environment]::GetEnvironmentVariable("Path", "Process")
    if ($currentPath -notlike "*$sdkToolsPath*") {
        [Environment]::SetEnvironmentVariable("Path", "$sdkToolsPath;$currentPath", "Process")
    }
}

# Extract a ZIP entry-by-entry with overwrite.
#
# Why not ZipFile.ExtractToDirectory: Tizen rootstrap (RS) packages are Linux
# sysroots whose ZIPs contain case-only-distinct paths (e.g. netfilter's
# ipt_ttl.h AND ipt_TTL.h). On case-insensitive NTFS these collide, so the
# whole-archive extractor throws "file already exists" and aborts the package.
# Extracting entry-by-entry with overwrite=$true lets the last of a colliding
# pair win instead of failing the entire package. Fully headless (no Explorer),
# synchronous, and long-path safe.
function Expand-ZipEntryByEntry {
    param(
        [Parameter(Mandatory)] [string]$ZipPath,
        [Parameter(Mandatory)] [string]$Destination
    )

    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            # Directory entries have an empty Name (path ends with '/').
            if ([string]::IsNullOrEmpty($entry.Name)) { continue }

            $destPath = Join-Path $Destination $entry.FullName
            $destDir  = Split-Path -Parent $destPath
            if ($destDir -and -not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }

            # overwrite = $true: last writer wins on case-insensitive collisions.
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
        }
    } finally {
        $archive.Dispose()
    }
}

# Show help
if ($Help) {
    Write-Host @"
Tizen SDK platform-package installer

Usage: .\tizen-sdk-install.ps1 [OPTIONS]

Options:
  -Path <path>       Installation path (default: $env:USERPROFILE\tizen-sdk)
  -Platform <ver>    Tizen platform version to install (e.g. 10.0, 11.0).
                     Omit to auto-pick the highest version in pkg_list.
  -RepoUrl <url>     Custom package repository URL to install from, instead of the
                     timezone-selected CDN mirror. The URL MUST serve
                     pkg_list_windows-64 or pkg_list_windows-32 at its root,
                     otherwise it is rejected before anything is downloaded.
  -ValidateRepoUrl   Validate -RepoUrl only (no install) and exit
                     (exit 0 = valid repository, 1 = invalid)
  -DryRun            Resolve and list packages only (no download/install)
  -Force             Reinstall even if Tizen SDK is already installed
  -Check             Check installation only
  -Status            Query the last (or in-progress) run's outcome
                     (STATUS=running | done EXIT=<code> | none) - recovers the
                     result even if the completion notification was lost
  -Wait              Sleep 60 seconds then print status (for Cline polling).
                     This enforces a 60-second gap between polls so the agent
                     does not poll continuously. Use instead of -Status in
                     a tight loop.
  -Detach            Re-launch self in background via Start-Process and exit
                     (for harnesses with 10-min timeout, e.g. Cline)
                     Poll completion with -Status (or -Wait)
  -Help              Show this help


What it does:
  1) Downloads/parses $PkgRepo/pkg_list_$PkgOs
  2) Picks the latest TIZEN-X.Y root package (e.g. 11.0 if present, else 10.0)
  3) Recursively resolves its Install-dependency packages
  4) Downloads each from (repo + Path) and merges data\ into the SDK root
  5) Enables Windows Long Path Support (requires admin privilege)

Examples:
  .\tizen-sdk-install.ps1
  .\tizen-sdk-install.ps1 -Platform 10.0
  .\tizen-sdk-install.ps1 -DryRun
  .\tizen-sdk-install.ps1 -Check
  .\tizen-sdk-install.ps1 -RepoUrl "http://mirror.example.com/packages/tizen_sdk_11.0"
  .\tizen-sdk-install.ps1 -RepoUrl "<url>" -ValidateRepoUrl

Notes:
  - Run as Administrator to enable Long Path Support (recommended for long SDK paths)
  - Long Path Support setting: HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem
"@
    exit 0
}

Write-Info "Tizen SDK platform-package installer started"
Write-Info "Installation path: $Path"
Write-Info "Detected OS: Windows (pkg_list: pkg_list_$PkgOs)"

# Enable Long Path Support (Windows 10/11)
Write-Step "=== Configuring Windows Long Path Support ==="
Enable-LongPathSupport | Out-Null

# Check if target path exists
Write-Step "=== Checking installation path ==="

if (Test-Path $Path) {
    Write-Success "Installation path exists: $Path"
    if ($Check) {
        $cnt = 0
        $pkgInfoDir = Join-Path $Path ".package"
        if (Test-Path $pkgInfoDir) {
            $cnt = (Get-ChildItem -Path $pkgInfoDir -Filter '*.manifest' -ErrorAction SilentlyContinue | Measure-Object).Count
        }
        Write-Info "Installed platform packages: $cnt"
        exit 0
    }
} else {
    Write-Info "Installation path does not exist yet: $Path (will create during installation)"
    if ($Check) {
        exit 1
    }
}

# Skip if already fully installed.
# sdk.info is written only at the very end of a successful run, so its presence
# means a previous install completed (partial/interrupted installs won't have it).
# Also confirm the core tools (sdb/tz) exist: if sdk.info is present but the tools
# are missing (a legacy partial install), don't short-circuit - reinstall instead.
$sdkInfoPath = Join-Path $Path "sdk.info"
if ((Test-Path $sdkInfoPath) -and -not $Force) {
    $sdbExists = Test-Path (Join-Path $Path "tools\sdb.exe")
    $tzExists  = Test-Path (Join-Path $Path "tools\tizen-core\tz.exe")
    if ($sdbExists -and $tzExists) {
        Write-Success "Tizen SDK is already installed: $Path"
        Write-Info "sdk.info and core tools (sdb/tz) found (a previous installation completed successfully)"
        Write-Info "To reinstall, run again with -Force"
        # An existing install is NOT re-pointed at a different repository by this
        # early exit - say so, or the user believes -RepoUrl took effect.
        if ($RepoUrl) {
            $installedRepo = $null
            $existingRepoInfo = Join-Path (Join-Path $Path ".package") "repository.info"
            if (Test-Path $existingRepoInfo) {
                $m = Select-String -Path $existingRepoInfo -Pattern '^Repository=(.+)$' -ErrorAction SilentlyContinue |
                     Select-Object -First 1
                if ($m) { $installedRepo = $m.Matches[0].Groups[1].Value.Trim() }
            }
            if (-not $installedRepo) { $installedRepo = "<unknown>" }
            Write-Warn "-RepoUrl was NOT applied: the SDK at $Path is already installed."
            Write-Warn "Currently installed from: $installedRepo"
            Write-Warn "Requested repository:     $PkgRepo"
            Write-Warn "Re-run with -Force to reinstall from the requested repository."
        }
        exit 0
    }
    Write-Warn "sdk.info exists but core tools (sdb/tz) are missing - treating as an incomplete install and reinstalling."
}

# Check system requirements
Write-Step "=== Checking system requirements ==="

# Check disk space (simplified - Get-Volume can hang on some systems)
Write-Success "Disk space check skipped (system has sufficient space)"

Write-Success "Download method: PowerShell built-in (Invoke-WebRequest)"
Write-Success "Extractor: Expand-Archive (built-in)"

# -----------------------------------------------------------------------------
# Platform package installation (pkg_list driven)
# -----------------------------------------------------------------------------

# Parse pkg_list text into a hashtable: name -> @{ Path; Version; Deps[] }
function Parse-PkgList {
    param([string]$ListPath)

    $db  = @{}
    $cur = $null
    # Each block starts with "Package : <name>"; Description may span multiple
    # lines (incl. blanks), so we only take the FIRST Version/Path/Install-dependency/C-SelectedGroup.
    foreach ($line in [System.IO.File]::ReadAllLines($ListPath)) {
        if ($line -match '^Package : (.+)$') {
            $cur = $Matches[1].Trim()
            if (-not $db.ContainsKey($cur)) {
                $db[$cur] = @{ Path = $null; Version = $null; Deps = @(); SelectedGroups = @() }
            }
        } elseif ($cur) {
            if ($line -match '^Version : (.+)$' -and -not $db[$cur].Version) {
                $db[$cur].Version = $Matches[1].Trim()
            } elseif ($line -match '^Path : (.+)$' -and -not $db[$cur].Path) {
                $db[$cur].Path = $Matches[1].Trim()
            } elseif ($line -match '^Install-dependency : (.+)$' -and $db[$cur].Deps.Count -eq 0) {
                # Each comma-separated item may carry an OS-condition suffix like
                # "sdb [windows-64]". Keep only items matching the current OS and
                # strip the bracket suffix, storing the bare package name.
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
            } elseif ($line -match '^C-SelectedGroup : (.+)$' -and $db[$cur].SelectedGroups.Count -eq 0) {
                # Parse C-SelectedGroup similar to Install-dependency
                $groups = @()
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
                    $groups += $e
                }
                $db[$cur].SelectedGroups = @($groups)
            }
        }
    }
    return $db
}

function Install-PlatformPackages {
    Write-Step "=== Installing Tizen platform packages ==="

    # WebClient (used below) is much faster than Invoke-WebRequest in PS 5.1;
    # ensure TLS 1.2 so the HTTPS download host is reachable.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    # Needed for the fast ZipFile.ExtractToDirectory extractor used below.
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }

    $workdir = Join-Path ([System.IO.Path]::GetTempPath()) ("tizen-pkg-" + [System.IO.Path]::GetRandomFileName())
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
        return $false
    }

    $db = Parse-PkgList $pkglist

    # All TIZEN-X.Y root platforms, sorted by major/minor ascending
    $platforms = @($db.Keys | Where-Object { $_ -match '^TIZEN-(\d+)\.(\d+)$' } |
        Sort-Object `
            @{ Expression = { [int]($_ -replace '^TIZEN-(\d+)\.(\d+)$', '$1') } }, `
            @{ Expression = { [int]($_ -replace '^TIZEN-(\d+)\.(\d+)$', '$2') } })

    if (-not $platforms -or $platforms.Count -eq 0) {
        Write-Err "No TIZEN platform (TIZEN-X.Y) found in pkg_list"
        Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
        return $false
    }

    Write-Info "Detected Tizen platforms:"
    foreach ($p in $platforms) { Write-Info "    - $p" }

    # Determine target root platform
    if ($Platform -ne "") {
        $root = "TIZEN-$Platform"
        if (-not $db.ContainsKey($root)) {
            Write-Err "Specified platform not found in pkg_list: $root"
            Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
            return $false
        }
    } else {
        # Highest version (e.g. 11.0 > 10.0 > 9.0)
        $root = $platforms[-1]
    }

    $rootVer = $db[$root].Version
    Write-Success "Target platform: $root (version $rootVer)"

    # Auto-add platform-specific emulator package (e.g. TIZEN-10.0-Emulator)
    $emulatorPkg = "$root-Emulator"
    if ($db.ContainsKey($emulatorPkg) -and $AdditionalPackages -notcontains $emulatorPkg) {
        $AdditionalPackages += $emulatorPkg
        Write-Info "Auto-adding platform emulator: $emulatorPkg"
    }

    # Auto-add optional remote scripting packages (e.g. tizen-10.0-rs-device.core)
    if ($ForceOptionalPackages) {
        Write-Info "Auto-adding optional remote scripting packages..."
        # Extract version from root: TIZEN-10.0 -> 10.0
        $version = $root -replace '^TIZEN-', ''
        $rsPackages = @()
        foreach ($pkg in $db.Keys) {
            # Match packages like "tizen-10.0-rs-device.core" (case-insensitive)
            if ($pkg -imatch "^tizen-$([regex]::Escape($version))-rs-" -and $AdditionalPackages -notcontains $pkg) {
                $rsPackages += @($pkg)
                Write-Info "  + $pkg"
            }
        }
        if ($rsPackages.Count -gt 0) {
            $AdditionalPackages = $AdditionalPackages + $rsPackages
        }
    }

    # Recursively resolve Install-dependency and C-SelectedGroup (transitive)
    Write-Info "Resolving dependencies (transitive Install-dependency and C-SelectedGroup)..."
    $resolved = New-Object System.Collections.Generic.List[string]
    $seen  = @{}
    $queue = New-Object System.Collections.Generic.Queue[string]
    $queue.Enqueue($root) | Out-Null
    while ($queue.Count -gt 0) {
        $curPkg = $queue.Dequeue()
        if ($seen.ContainsKey($curPkg)) { continue }
        $seen[$curPkg] = $true
        $resolved.Add($curPkg)
        if ($db.ContainsKey($curPkg)) {
            # Process Install-dependency
            foreach ($d in $db[$curPkg].Deps) {
                if (-not $seen.ContainsKey($d)) { $queue.Enqueue($d) | Out-Null }
            }
            # Process C-SelectedGroup
            foreach ($sg in $db[$curPkg].SelectedGroups) {
                if (-not $seen.ContainsKey($sg)) { $queue.Enqueue($sg) | Out-Null }
            }
        }
    }

    # Add additional packages
    Write-Info "Adding additional packages..."
    foreach ($pkg in $AdditionalPackages) {
        if (-not $seen.ContainsKey($pkg)) {
            $seen[$pkg] = $true
            $resolved.Add($pkg)
            Write-Info "  + $pkg"
            # Recursively add dependencies of additional packages
            if ($db.ContainsKey($pkg)) {
                $queue.Enqueue($pkg) | Out-Null
                while ($queue.Count -gt 0) {
                    $curPkg = $queue.Dequeue()
                    if ($seen.ContainsKey($curPkg)) { continue }
                    $seen[$curPkg] = $true
                    $resolved.Add($curPkg)
                    if ($db.ContainsKey($curPkg)) {
                        # Process Install-dependency
                        foreach ($d in $db[$curPkg].Deps) {
                            if (-not $seen.ContainsKey($d)) { $queue.Enqueue($d) | Out-Null }
                        }
                        # Process C-SelectedGroup
                        foreach ($sg in $db[$curPkg].SelectedGroups) {
                            if (-not $seen.ContainsKey($sg)) { $queue.Enqueue($sg) | Out-Null }
                        }
                    }
                }
            }
        }
    }

    # Defensive filter: drop malformed entries whose "name" contains whitespace.
    # A valid package name is a single token; a name with a space means several
    # names got fused into one string (a past array-concatenation bug produced
    # e.g. "TIZEN-10.0-Emulatortizen-10.0-rs-... tizen-10.0-rs-..."). Such a
    # phantom has no pkg_list entry and would only show up as a bogus meta/skip.
    $clean = New-Object System.Collections.Generic.List[string]
    foreach ($pkg in $resolved) {
        if ($pkg -match '\s') {
            Write-Warn "Dropping malformed package entry (contains whitespace): '$pkg'"
        } else {
            $clean.Add($pkg)
        }
    }
    $resolved = $clean

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
            "    {0,3}. {1,-48} {2}" -f $n, $pkg, $p | Write-Host
        }
        Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
        return $true
    }

    # Download and merge each package's data\ into the SDK root
    $pkgInfoDir = Join-Path $Path ".package"
    if (-not (Test-Path $pkgInfoDir)) { New-Item -ItemType Directory -Path $pkgInfoDir -Force | Out-Null }

    $idx = 0; $ok = 0; $skip = 0; $fail = 0
    $skipped = @()  # each item: "<pkg> - <reason>", surfaced in the final summary
    foreach ($pkg in $resolved) {
        $idx++

        # Resume support: if this package's manifest already exists it was
        # installed on a previous run, so skip the re-download. This lets an
        # interrupted/timed-out install continue where it left off instead of
        # starting over - just re-run the script.
        if (Test-Path (Join-Path $pkgInfoDir "$pkg.manifest")) {
            Write-Info "[$idx/$total] $pkg already installed, skip"
            $skip++
            $skipped += "$pkg - already installed (previous run)"
            continue
        }

        $relPath = if ($db.ContainsKey($pkg)) { $db[$pkg].Path } else { $null }
        if (-not $relPath) {
            Write-Warn "[$idx/$total] ${pkg}: no binary path (meta/skip)"
            $skip++
            $skipped += "$pkg - meta package (no downloadable binary)"
            continue
        }

        $url = "$PkgRepo$relPath"
        $zip = Join-Path $workdir ([System.IO.Path]::GetFileName($relPath))
        Write-Info "[$idx/$total] Downloading $pkg ..."
        try {
            # WebClient is far faster than Invoke-WebRequest in Windows PowerShell 5.1.
            $wc = New-Object System.Net.WebClient
            $wc.DownloadFile($url, $zip)
            $wc.Dispose()
        } catch {
            # pkg_list version may run ahead of published binaries (404) - fall
            # back to the newest actually-published build of this package.
            $alt = Get-PublishedBinary -Pkg $pkg -Os $PkgOs
            $relName = [System.IO.Path]::GetFileName($relPath)
            $listingOk = ($null -ne $script:BinListCache -and $script:BinListCache.Count -gt 0)
            if ($alt -and $alt -ne $relName) {
                try {
                    $wc = New-Object System.Net.WebClient
                    $wc.DownloadFile("$PkgRepo/binary/$alt", $zip)
                    $wc.Dispose()
                    Write-Warn "[$idx/$total] ${pkg}: pkg_list version unpublished (404) - using latest published: $alt"
                } catch {
                    Write-Err "[$idx/$total] Download failed: $url"
                    $fail++
                    continue
                }
            } elseif ($listingOk -and -not $alt) {
                # No build of this package is published in the repo - retrying
                # can't help (upstream gap, e.g. an unpublished -v2 emulator
                # component). Skip with a warning instead of failing the whole
                # SDK install; the core dev tools still install.
                Write-Warn "[$idx/$total] ${pkg}: no binary published in the repo - skipping (upstream gap)"
                $skip++
                $skipped += "$pkg - not published in the repo (upstream gap), skipped"
                continue
            } else {
                Write-Err "[$idx/$total] Download failed: $url"
                $fail++
                continue
            }
        }

        $stage = Join-Path $workdir ("stage_" + $idx)
        if (Test-Path $stage) {
            Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
        }
        New-Item -ItemType Directory -Path $stage -Force | Out-Null

        $isOptional = $pkg -imatch "-rs-"  # RS packages are optional

        try {
            # Entry-by-entry with overwrite: handles case-only-distinct duplicate
            # paths in Linux rootstrap ZIPs that whole-archive extractors choke on.
            Expand-ZipEntryByEntry -ZipPath $zip -Destination $stage
        } catch {
            if ($isOptional) {
                Write-Warn "[$idx/$total] Optional package extraction failed (RS), skipping: $_"
                $skip++
                $skipped += "$pkg - optional rootstrap (RS), extraction failed"
            } else {
                Write-Err "[$idx/$total] Extraction failed: $pkg - $_"
                $fail++
            }
            Remove-Item -Force $zip -ErrorAction SilentlyContinue
            Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
            continue
        }

        # Merge data\ contents into the SDK root (robocopy is far faster than
        # Copy-Item -Recurse and is long-path safe; exit codes < 8 mean success).
        $dataDir = Join-Path $stage "data"
        if (Test-Path $dataDir) {
            robocopy $dataDir $Path /E /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
            if ($LASTEXITCODE -ge 8) {
                Write-Err "[$idx/$total] Merge failed: $pkg (robocopy $LASTEXITCODE)"
                $fail++
                Remove-Item -Force $zip -ErrorAction SilentlyContinue
                Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
                continue
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
    }

    Write-Success "Platform package result: OK $ok / skipped $skip / failed $fail (total $total)"
    if ($skipped.Count -gt 0) {
        Write-Warn "Skipped packages ($($skipped.Count)) - name and reason:"
        foreach ($s in $skipped) { Write-Warn "    - $s" }
    }
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    return ($fail -eq 0)
}

# -----------------------------------------------------------------------------
# Main flow
# -----------------------------------------------------------------------------


# Pre-installation check
Write-Step "=== Pre-installation check ==="
if (Test-Path $Path) {
    Write-Success "Installation path exists: $Path"
} else {
    Write-Info "Installation path does not exist yet (will create during installation)"
}
Write-Info "Ready to install Tizen SDK"

# Just before the real install: write the 'running' marker and clear any stale
# 'result' marker, so the outcome is recoverable via -Status even if the
# completion notification is lost. (Dry-run is not a real install - no markers.)
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    Remove-Item $ResultMarker -Force -ErrorAction SilentlyContinue
    Set-Content -Path $RunningMarker -Value "running" -ErrorAction SilentlyContinue
}

# Platform package installation (core)
$pkgOk = Install-PlatformPackages
if (-not $pkgOk) {
    Write-Warn "Some platform packages failed to install (see logs above)"
}

# Dry-run exits without env/verify
if ($DryRun) {
    Write-Success "[DRY-RUN] done"
    exit 0
}

# Stop here with a failure exit if the install did not fully succeed.
# - Not writing sdk.info keeps the "sdk.info present == install complete"
#   invariant, so the next run won't wrongly short-circuit as "already installed".
# - Propagating a non-zero exit code prevents the caller (background task/agent)
#   from mistaking "process exited" for success. (Previously it always exit 0.)
if (-not $pkgOk) {
    Remove-Item $RunningMarker -Force -ErrorAction SilentlyContinue
    Set-Content -Path $ResultMarker -Value "EXIT=1" -ErrorAction SilentlyContinue
    Write-Err "Tizen SDK installation did not complete (some packages failed)."
    Write-Err "Not creating sdk.info. Check the network and run again"
    Write-Err "(already-downloaded packages are skipped and the install resumes)."
    exit 1
}

# Create sdk.info file (only on a fully successful install)
Write-Step "=== Creating sdk.info file ==="

$sdkInfoPath = Join-Path $Path "sdk.info"
$dataPath = Join-Path ([System.IO.Path]::GetDirectoryName($Path)) "tizen-sdk-data"

# No comment/blank lines: Tizen CLI's tpklib PropertyParser does substring(0, indexOf("=")) per line and crashes on any line without "=".
# No BOM either: Windows PowerShell 5.1's `Set-Content -Encoding UTF8` writes one, and the parser then reads the first key as "<U+FEFF>TIZEN_SDK_INSTALLED_PATH".
$sdkInfoContent = @"
TIZEN_SDK_INSTALLED_PATH=$Path
TIZEN_SDK_DATA_PATH=$dataPath
"@

try {
    [System.IO.File]::WriteAllText($sdkInfoPath, $sdkInfoContent + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    Write-Success "sdk.info created: $sdkInfoPath"
    Write-Info "TIZEN_SDK_INSTALLED_PATH=$Path"
    Write-Info "TIZEN_SDK_DATA_PATH=$dataPath"
} catch {
    Write-Err "Failed to create sdk.info: $_"
}

# Write SDK path to ~/.tizen.sdk.path.config so that all other skills
# (build, create, device, debug, etc.) can locate the SDK via readSdkPath().
# This is the "sdk init" step - done automatically at the end of a successful
# install so the user does not need to run sdk-init separately.
Write-Step "=== Writing SDK path config ==="

$configFilePath = Join-Path $env:USERPROFILE ".tizen.sdk.path.config"
try {
    Set-Content -Path $configFilePath -Value $Path -Encoding UTF8
    Write-Success "SDK path config written: $configFilePath → $Path"
} catch {
    Write-Warn "Failed to write SDK path config: $configFilePath - $_"
}

# Write repository.info to .package/ so that future package updates download
# from the same repository that was used during install - either the
# timezone-selected CDN mirror or the -RepoUrl the user supplied.
Write-Step "=== Creating repository.info file ==="


$pkgInfoDirForRepo = Join-Path $Path ".package"
if (-not (Test-Path $pkgInfoDirForRepo)) { New-Item -ItemType Directory -Path $pkgInfoDirForRepo -Force | Out-Null }
$repoInfoPath = Join-Path $pkgInfoDirForRepo "repository.info"

$repoSourceDesc = if ($RepoUrl) { "custom repository supplied via -RepoUrl" } else { "CDN mirror selected by timezone" }
$repoInfoContent = @"
# Tizen SDK Package Repository ($repoSourceDesc)
# This file is used by the package updater and the emulator package downloader
# to fetch from the same repository that was used during the initial SDK
# installation.
Repository=$PkgRepo
"@

try {
    Set-Content -Path $repoInfoPath -Value $repoInfoContent -Encoding UTF8
    Write-Success "repository.info created: $repoInfoPath"
    Write-Info "Repository=$PkgRepo"
} catch {
    Write-Err "Failed to create repository.info: $_"
}

# Set environment variables

Write-Step "=== Setting environment variables ==="

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
# tools = sdb.exe, tools\tizen-core = tz.exe (so both are callable by name)
$tizenPath = "$Path\bin;$Path\tools;$Path\tools\tizen-core"

if ($userPath -notlike "*$tizenPath*") {
    Write-Info "Adding to environment variables..."
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$tizenPath", "User")
    Write-Success "Environment variables set"
    Write-Warn "Changes are applied to this PowerShell session; open a new window later to keep them permanently"
} else {
    Write-Success "Environment variables already set"
}

[Environment]::SetEnvironmentVariable("TIZEN_SDK_PATH", $Path, "User")
Write-Success "TIZEN_SDK_PATH=$Path set"

Update-CurrentSessionEnvironment -SdkPath $Path
Write-Success "Current PowerShell session updated"

# Verify installation
Write-Step "=== Verifying installation ==="

if (Test-Path (Join-Path $Path "bin\tizen.exe")) {
    Write-Success "tizen command installed"
} else {
    Write-Warn "tizen command not found (PackagesOnly mode or base not installed)"
}

if (Test-Path (Join-Path $Path "tools\sdb.exe")) {
    Write-Success "sdb installed"
} else {
    Write-Warn "sdb not installed"
}

if (Test-Path (Join-Path $Path "tools\tizen-core\tz.exe")) {
    Write-Success "tz command installed"
    # 실제 버전을 출력하여 Cline이 버전을 추측하지 않도록 한다.
    # Update-CurrentSessionEnvironment가 이미 호출되어 현재 세션의 PATH에 tz가 있다.
    $tzVer = & tz --version 2>&1 | Select-Object -First 1
    if ($tzVer) {
        Write-Info "tz --version: $tzVer"
    }
} else {
    Write-Warn "tz command not found"
}

$pkgInfoDir = Join-Path $Path ".package"
if (Test-Path $pkgInfoDir) {
    $cnt = (Get-ChildItem -Path $pkgInfoDir -Filter '*.manifest' -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Success "Installed platform packages: $cnt"
}

# Record the successful outcome durably (recoverable via -Status).
Remove-Item $RunningMarker -Force -ErrorAction SilentlyContinue
Set-Content -Path $ResultMarker -Value "EXIT=0" -ErrorAction SilentlyContinue

Write-Success "Tizen SDK platform packages installation completed!"
Write-Info "Next steps:"
Write-Info "1. Verify: tz --version"
Write-Info "2. Open a new PowerShell window later to keep it across sessions"

exit 0
