#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-tv-sdk-install.ps1
# Tizen TV SDK extension installer for Windows
#
# - Downloads pkg_list from https://download.tizen.org/sdk/extensions/tv_extensions/
# - Installs TV-SAMSUNG-Public package and its dependencies
# - Merges data\ into the existing Tizen SDK root
# - Creates .tv-sdk-installed marker on success

param(
    [string]$SdkPath = "",
    [switch]$Force,
    [switch]$Check,
    [switch]$DryRun,
    [switch]$Wait,                 # sleep 60 seconds then check status (for Cline polling)
    [switch]$Help
)

# Shared helpers: logging (Write-Info/Success/Warn/Err) + Get-SdkPath.
. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# TV SDK extension repository
$PkgRepo = "https://download.tizen.org/sdk/extensions/tv_extensions"
$TargetPackage = "TV-SAMSUNG-Public"

# OS 자동 감지 (Windows / macOS / Linux)
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
Tizen TV SDK extension installer

Usage: .\tizen-tv-sdk-install.ps1 [OPTIONS]

Options:
  -SdkPath <path>    Tizen SDK installation path
                     (default: TIZEN_SDK_PATH / ~\.tizen.sdk.path.config / $env:USERPROFILE\tizen-sdk)
  -Force             Reinstall even if TV SDK is already installed
  -Check             Check TV SDK installation only
  -DryRun            Resolve and list packages only (no download/install)
  -Help              Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Downloads/parses $PkgRepo/pkg_list_$PkgOs
  3) Resolves TV-SAMSUNG-Public and its Install-dependency packages
  4) Downloads each from (repo + Path) and merges data\ into the SDK root
  5) Creates .tv-sdk-installed marker on success

Examples:
  .\tizen-tv-sdk-install.ps1
  .\tizen-tv-sdk-install.ps1 -SdkPath "C:\tizen-studio"
  .\tizen-tv-sdk-install.ps1 -Check
  .\tizen-tv-sdk-install.ps1 -DryRun
"@
    exit 0
}

# Set default SDK path if not provided
# (resolution: TIZEN_SDK_PATH -> ~\.tizen.sdk.path.config -> %USERPROFILE%\tizen-sdk, see Get-SdkPath)
if (-not $SdkPath) {
    $SdkPath = Get-SdkPath
}

# -Wait: sleep 60 seconds then check if TV SDK is installed.
# This enforces a 60-second polling interval for harnesses (e.g. Cline) that
# would otherwise poll in a tight loop. Used after a background launch.
if ($Wait) {
    Start-Sleep -Seconds 60
    $tvMarker = Join-Path $SdkPath ".tv-sdk-installed"
    if (Test-Path $tvMarker) {
        Write-Host "STATUS=done EXIT=0"
    } else {
        # Check if the installer process is still running.
        # Use Win32_Process for CommandLine (Get-Process lacks it on Windows
        # PowerShell 5.1) and exclude this poller process and its parent.
        $parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction SilentlyContinue).ParentProcessId
        $proc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ProcessId -ne $PID -and $_.ProcessId -ne $parentPid -and
                $_.CommandLine -like "*tizen-tv-sdk-install*"
            }
        if ($proc) {
            Write-Host "STATUS=running"
        } else {
            Write-Host "STATUS=done EXIT=1"
        }
    }
    exit 0
}

Write-Info "Tizen TV SDK extension installer started"
Write-Info "SDK path: $SdkPath"
Write-Info "Target package: $TargetPackage"
Write-Info "Detected OS: $PkgOs (pkg_list: pkg_list_$PkgOs)"


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
if ($Check) {
    $tvSdkMarker = Join-Path $SdkPath ".tv-sdk-installed"
    if (Test-Path $tvSdkMarker) {
        Write-Success "TV SDK is already installed: $SdkPath (.tv-sdk-installed found)"
        exit 0
    } else {
        Write-Info "TV SDK is NOT installed (.tv-sdk-installed not found)"
        exit 1
    }
}

# Skip if already installed
$tvSdkMarkerPath = Join-Path $SdkPath ".tv-sdk-installed"
if ((Test-Path $tvSdkMarkerPath) -and -not $Force) {
    Write-Success "TV SDK is already installed: $SdkPath"
    Write-Info ".tv-sdk-installed found. To reinstall, run again with -Force"
    exit 0
}

if ($Force) {
    Write-Warn "Force reinstall requested - removing .tv-sdk-installed marker"
    Remove-Item $tvSdkMarkerPath -Force -ErrorAction SilentlyContinue
}

# -----------------------------------------------------------------------------
# Package installation (pkg_list driven)
# -----------------------------------------------------------------------------

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $SdkPath)) {
    New-Item -ItemType Directory -Path $SdkPath -Force | Out-Null
}

$workdir = Join-Path ([System.IO.Path]::GetTempPath()) ("tizen-tv-pkg-" + [System.IO.Path]::GetRandomFileName())
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

# Verify target package exists
if (-not $db.ContainsKey($TargetPackage)) {
    Write-Err "Target package not found in pkg_list: $TargetPackage"
    Write-Err "Available packages containing 'TV':"
    foreach ($key in $db.Keys) {
        if ($key -like "*TV*") { Write-Err "  - $key" }
    }
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}

Write-Success "Target package found: $TargetPackage (version $($db[$TargetPackage].Version))"

# Recursively resolve dependencies
Write-Info "Resolving dependencies (transitive Install-dependency)..."
$resolved = New-Object System.Collections.Generic.List[string]
$seen = @{}
$queue = New-Object System.Collections.Generic.Queue[string]
$queue.Enqueue($TargetPackage) | Out-Null
while ($queue.Count -gt 0) {
    $curPkg = $queue.Dequeue()
    if ($seen.ContainsKey($curPkg)) { continue }
    $seen[$curPkg] = $true
    $resolved.Add($curPkg)
    if ($db.ContainsKey($curPkg)) {
        foreach ($d in $db[$curPkg].Deps) {
            if (-not $seen.ContainsKey($d)) { $queue.Enqueue($d) | Out-Null }
        }
    }
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
        "    {0,3}. {1,-48} {2}" -f $n, $pkg, $p | Write-Host
    }
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 0
}

# Download and merge each package
$pkgInfoDir = Join-Path $SdkPath ".package"
if (-not (Test-Path $pkgInfoDir)) { New-Item -ItemType Directory -Path $pkgInfoDir -Force | Out-Null }

$idx = 0; $ok = 0; $skip = 0; $fail = 0
foreach ($pkg in $resolved) {
    $idx++

    # Skip if already installed (manifest exists), unless -Force
    if (-not $Force -and (Test-Path (Join-Path $pkgInfoDir "$pkg.manifest"))) {
        Write-Info "[$idx/$total] $pkg already installed, skip"
        $skip++
        continue
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
        Write-Err "[$idx/$total] Extraction failed: $pkg - $_"
        $fail++
        Remove-Item -Force $zip -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
        continue
    }

    # Merge data\ contents into the SDK root
    $dataDir = Join-Path $stage "data"
    if (Test-Path $dataDir) {
        # Check if data\ has any contents (some packages have empty data\)
        $dataItems = Get-ChildItem -Path $dataDir -Force -ErrorAction SilentlyContinue
        if ($dataItems.Count -gt 0) {
            if ($PkgOs -eq "windows-64") {
                robocopy $dataDir $SdkPath /E /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
                if ($LASTEXITCODE -ge 8) {
                    Write-Err "[$idx/$total] Merge failed: $pkg (robocopy $LASTEXITCODE)"
                    $fail++
                    Remove-Item -Force $zip -ErrorAction SilentlyContinue
                    Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
                    continue
                }
            } else {
                # Linux/macOS: cp -r
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
}

Write-Success "TV SDK package result: OK $ok / skipped $skip / failed $fail (total $total)"

if ($fail -gt 0) {
    Write-Err "Some packages failed to install. Not creating .tv-sdk-installed marker."
    Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
    exit 1
}

# Create .tv-sdk-installed marker
Set-Content -Path $tvSdkMarkerPath -Value "TV SDK installed at $(Get-Date -Format 'o')" -Encoding UTF8
Write-Success ".tv-sdk-installed created: $tvSdkMarkerPath"

Remove-Item -Recurse -Force $workdir -ErrorAction SilentlyContinue
Write-Success "Tizen TV SDK extension installation completed!"
exit 0
