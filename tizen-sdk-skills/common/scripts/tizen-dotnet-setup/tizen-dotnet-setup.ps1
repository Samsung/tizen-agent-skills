#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-dotnet-setup.ps1
#
# Sets up the .NET development environment for Tizen DotNET projects on Windows.
#
# - Checks whether the .NET SDK (dotnet) is installed.
#   * If NOT installed: auto-installs it user-scope with the official
#     dotnet-install.ps1 into %LOCALAPPDATA%\Microsoft\dotnet — no Administrator
#     rights or UAC prompt needed. -NoInstallSdk skips the auto-install; if
#     skipped or the auto-install fails (offline / proxy), prints guidance and
#     exits 2. (For a system-wide C:\Program Files\dotnet install, run
#     `winget install Microsoft.DotNet.SDK.8` manually — one UAC prompt.)
#   * If installed: installs the Tizen .NET workload into THAT SAME dotnet, using
#     Samsung's official workload-install.ps1 first and falling back to
#     `dotnet workload install tizen`.
#
# Usage:
#   .\tizen-dotnet-setup.ps1 [-Force] [-Version <ver>] [-NoInstallSdk]
#                            [-SdkChannel <chan>] [-Help]
#
# Options:
#   -Force              Reinstall the Tizen workload even if it is already present
#   -Version <ver>      Tizen workload version to pass to the Samsung installer
#   -NoInstallSdk       Do not auto-install a missing .NET SDK (guidance + exit 2)
#   -SdkChannel <chan>  .NET SDK channel for the auto-install (default: 8.0)
#   -Help               Show this help

param(
    [switch]$Force,
    [string]$Version = "",
    [switch]$NoInstallSdk,
    [string]$SdkChannel = "8.0",
    [switch]$Help
)

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# Samsung Tizen.NET workload installer (Windows)
$WorkloadScriptUrl = "https://raw.githubusercontent.com/Samsung/Tizen.NET/main/workload/scripts/workload-install.ps1"
$DotnetInstallUrl = "https://dot.net/v1/dotnet-install.ps1"
$DotnetDownloadUrl = "https://dotnet.microsoft.com/download"

if ($Help) {
    Write-Host @"
Tizen .NET development environment setup (Windows)

Usage: .\tizen-dotnet-setup.ps1 [-Force] [-Version <ver>] [-NoInstallSdk] [-SdkChannel <chan>] [-Help]

Options:
  -Force              Reinstall the Tizen workload even if it is already present
  -Version <ver>      Tizen workload version to pass to the Samsung installer
  -NoInstallSdk       Do not auto-install a missing .NET SDK (guidance + exit 2)
  -SdkChannel <chan>  .NET SDK channel for the auto-install (default: 8.0)
  -Help               Show this help

What it does:
  1) Checks whether the .NET SDK (dotnet) is on PATH
  2) If not on PATH: searches known locations (incl. Tizen SDK-bundled dotnets);
     if found, wires it up persistently (User DOTNET_ROOT + User PATH). If no SDK
     exists anywhere, auto-installs one user-scope via the official
     dotnet-install.ps1 into %LOCALAPPDATA%\Microsoft\dotnet (no admin rights
     needed). Only if that is skipped (-NoInstallSdk) or fails does it print
     guidance + $DotnetDownloadUrl and exit 2
  3) Installs the Tizen workload via Samsung's workload-install.ps1 PINNED to the
     dotnet resolved in step 1/2 (-d), falling back to 'dotnet workload install tizen'
  4) Verifies with that same dotnet, and on failure prints [DIAG] lines naming the
     dotnet root, SDK band and where the manifest actually landed

Exit codes:
  0  success / workload already installed
  1  install failed
  2  no .NET SDK found anywhere, and the user-scope auto-install was skipped
     (-NoInstallSdk) or failed (guidance shown)
  3  workload was installed, but into a DIFFERENT .NET SDK band / install dir
     than the dotnet we verify against (see the [DIAG] lines)
"@
    exit 0
}

Write-Step "=== Tizen .NET environment setup (Windows) ==="

# ---------------------------------------------------------------------------
# Helper: make a discovered dotnet usable now and for future shells.
#   1) persist the User-level DOTNET_ROOT and prepend its dir to the User PATH
#      (idempotent - survives new shells), and
#   2) update the current session so the workload step below works.
# ---------------------------------------------------------------------------
function Enable-Dotnet {
    param([string]$DotnetExe)

    $droot = Split-Path -Parent $DotnetExe

    [Environment]::SetEnvironmentVariable('DOTNET_ROOT', $droot, 'User')
    Write-Success "Set User DOTNET_ROOT = $droot"

    $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ([string]::IsNullOrWhiteSpace($userPath)) { $userPath = "" }
    $parts = $userPath -split ';' | Where-Object { $_ -ne '' }
    if ($parts -notcontains $droot) {
        $newUserPath = if ($userPath -ne "") { "$droot;$userPath" } else { $droot }
        [Environment]::SetEnvironmentVariable('PATH', $newUserPath, 'User')
        Write-Success "Added dotnet to your User PATH (effective in new shells): $droot"
    } else {
        Write-Info "dotnet dir already on your User PATH - leaving it as is."
    }

    # Effective for the rest of THIS run.
    $env:DOTNET_ROOT = $droot
    $env:PATH = "$droot;$env:PATH"
}

# ---------------------------------------------------------------------------
# Helper: auto-install the .NET SDK user-scope (no admin rights, no UAC) with
# the official installer. Installs to %LOCALAPPDATA%\Microsoft\dotnet — the same
# location Find-DotnetSdk already probes — so a later run still finds it even if
# this one is interrupted after this step. Returns the dotnet.exe path or $null.
# ---------------------------------------------------------------------------
function Install-DotnetSdk {
    param([string]$Channel)

    Write-Step "=== Installing the .NET SDK (user-scope, no admin rights) ==="
    $installDir = Join-Path $env:LOCALAPPDATA "Microsoft\dotnet"
    Write-Info "Channel: $Channel - installing to $installDir"

    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "dotnet-install-$PID.ps1"
    try {
        # Windows PowerShell 5.1 may not offer TLS 1.2 by default, which dot.net
        # requires — enable it additively without dropping newer protocols.
        [Net.ServicePointManager]::SecurityProtocol = `
            [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $DotnetInstallUrl -OutFile $tmp -UseBasicParsing -TimeoutSec 60
    } catch {
        Write-Warn "Could not download $DotnetInstallUrl (offline, or a proxy is required?): $($_.Exception.Message)"
        # A failed/aborted download can leave a partial file behind.
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        return $null
    }

    try {
        & $tmp -Channel $Channel -InstallDir $installDir
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
            Write-Warn "dotnet-install.ps1 exited with code $LASTEXITCODE."
            return $null
        }
    } catch {
        Write-Warn "dotnet-install.ps1 failed: $($_.Exception.Message)"
        return $null
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }

    $exe = Join-Path $installDir "dotnet.exe"
    if (-not (Test-Path $exe)) {
        Write-Warn "dotnet-install.ps1 did not produce a usable SDK at $installDir."
        return $null
    }
    Write-Success ".NET SDK installed to $installDir"
    return $exe
}

# ---------------------------------------------------------------------------
# Helper: SDK feature band, computed exactly the way Samsung's installer does
#   (major.minor.<first digit of patch>00): 10.0.302 -> 10.0.300, 9.0.304 -> 9.0.300
# Returns $null when the version string is not parseable.
# ---------------------------------------------------------------------------
function Get-SdkBand {
    param([string]$SdkVersion)
    if ([string]::IsNullOrWhiteSpace($SdkVersion)) { return $null }
    $parts = $SdkVersion.Split('.')
    if ($parts.Count -lt 3 -or $parts[2].Length -lt 1) { return $null }
    return "$($parts[0]).$($parts[1]).$($parts[2][0])00"
}

# ---------------------------------------------------------------------------
# Helper: follow symlinks / reparse points to the real executable.
#
# `dotnet` on PATH is often NOT the real binary: Windows app-execution aliases
# under %LOCALAPPDATA%\Microsoft\WindowsApps, and plain symlinks, both resolve
# to an install root elsewhere. Taking Split-Path of the alias would pin -d at a
# directory with no sdk/ or sdk-manifests/ at all, which is worse than letting
# the Samsung installer pick its own target. The .sh side already does this via
# `readlink -f`; keep the two in step.
# ---------------------------------------------------------------------------
function Resolve-RealPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $Path }
    try {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop

        # PowerShell 7+ / .NET 6+: resolves a whole chain of links.
        if ($item.PSObject.Methods.Name -contains 'ResolveLinkTarget') {
            $final = $item.ResolveLinkTarget($true)
            if ($final -and $final.FullName) { return $final.FullName }
        }

        # Windows PowerShell 5.1: .Target holds the reparse point destination.
        $target = @($item.Target) | Where-Object { $_ } | Select-Object -First 1
        if ($target) {
            if (-not [System.IO.Path]::IsPathRooted($target)) {
                $target = Join-Path (Split-Path -Parent $item.FullName) $target
            }
            $resolved = Resolve-Path -LiteralPath $target -ErrorAction SilentlyContinue
            if ($resolved) { return $resolved.Path }
        }

        return $item.FullName
    } catch {
        return $Path
    }
}

# ---------------------------------------------------------------------------
# Helper: is the Tizen workload installed in a SPECIFIC dotnet?
# Always ask the dotnet we are going to verify against - never whatever `dotnet`
# happens to resolve to, which is how the install/verify targets drift apart.
# ---------------------------------------------------------------------------
function Test-TizenWorkload {
    param([string]$DotnetExe)
    $list = (& $DotnetExe workload list) 2>$null
    return ($list | Select-String -Pattern '^\s*tizen' -Quiet)
}

# ---------------------------------------------------------------------------
# 1) Detect the .NET SDK
# ---------------------------------------------------------------------------
Write-Step "=== Checking for the .NET SDK ==="
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
$dotnetExe = $null
if ($dotnet) {
    $dotnetExe = $dotnet.Source
} else {
    # Not on PATH - it may still be installed (e.g. bundled in a Tizen SDK tree).
    Write-Warn "dotnet is not on PATH - searching for an existing .NET SDK install..."
    $dotnetExe = Find-DotnetSdk
    if ($dotnetExe) {
        Write-Success "Found an installed .NET SDK not on PATH: $dotnetExe"
        Enable-Dotnet $dotnetExe
    }
}

# No SDK anywhere - install it ourselves, user-scope, unless opted out.
if (-not $dotnetExe -and -not $NoInstallSdk) {
    $installed = Install-DotnetSdk -Channel $SdkChannel
    if ($installed) {
        Enable-Dotnet $installed
        $dotnetExe = $installed
    }
}

if (-not $dotnetExe) {
    Write-Err ".NET SDK (dotnet) is not installed or not on PATH."
    Write-Host ""
    if ($NoInstallSdk) {
        Write-Info "Automatic install skipped (-NoInstallSdk) - install the .NET SDK, then re-run this setup."
    } else {
        Write-Info "The automatic user-scope install failed (see above) - install the .NET SDK manually, then re-run this setup."
    }
    Write-Info "Download (all platforms): $DotnetDownloadUrl"
    Write-Info "Recommended: .NET 8 SDK (for current Tizen targets)"
    Write-Host ""
    Write-Info "Windows quick install options:"
    Write-Info "  User-scope, no admin rights (installs to %LOCALAPPDATA%\Microsoft\dotnet):"
    Write-Info "    Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile dotnet-install.ps1; ./dotnet-install.ps1 -Channel 8.0"
    Write-Info "  System-wide to C:\Program Files\dotnet (works from a normal PowerShell - one UAC prompt appears):"
    Write-Info "    winget install Microsoft.DotNet.SDK.8"
    Write-Info ""
    Write-Info "  If behind a corporate proxy:"
    Write-Info "    1) Enable winget proxy support (Administrator PowerShell):"
    Write-Info "       winget settings --enable ProxyCommandLineOptions"
    Write-Info "    2) Install with your proxy (ask IT for proxy URL):"
    Write-Info "       winget install Microsoft.DotNet.SDK.8 --proxy http://[proxy-host]:[port]"
    Write-Info ""
    Write-Info "  Or download the installer from $DotnetDownloadUrl"
    Write-Host ""
    Write-Warn "After installing the .NET SDK, open a new terminal and run this setup again."
    exit 2
}

$dotnetVersion = (& $dotnetExe --version) 2>$null
if ($dotnetVersion) { $dotnetVersion = $dotnetVersion.Trim() }
Write-Success ".NET SDK found: dotnet $dotnetVersion"

$installedSdks = @((& $dotnetExe --list-sdks) 2>$null)
Write-Info "Installed SDKs:"
$installedSdks | ForEach-Object { Write-Info "    $_" }

# ---------------------------------------------------------------------------
# 1b) Pin ONE install target and keep install + verify on it.
#
# Samsung's workload-install.ps1 picks its own target: $env:DOTNET_ROOT when set,
# else %ProgramFiles%\dotnet. When that differs from the dotnet we verify with,
# the workload lands in another SDK band and verification "mysteriously" fails
# Resolve the root once, pass it
# explicitly with -d, and mirror it into the child's environment.
# ---------------------------------------------------------------------------
$dotnetExe = Resolve-RealPath $dotnetExe
$dotnetRoot = Split-Path -Parent $dotnetExe
$sdkBand = Get-SdkBand $dotnetVersion

# Only pin the installer with -d when the resolved root really is a .NET install
# root. If it is not (shim on PATH we failed to resolve, unusual layout), letting
# the installer fall back to its own resolution is strictly safer than sending it
# somewhere with no sdk/ directory.
$dotnetRootUsable = Test-Path (Join-Path $dotnetRoot 'sdk')
if (-not $dotnetRootUsable) {
    Write-Warn "$dotnetRoot does not look like a .NET install root (no 'sdk' directory)."
    Write-Warn "Not pinning the Samsung installer with -d; it will resolve its own target."
}

# The manifest directory, NOT a fixed file path: SDK 8.0.1xx and earlier put
# WorkloadManifest.json directly here, while 8.0.2xx+ nest it one level deeper
# under a manifest-version directory. Probing only the flat path would report
# exists=false for a perfectly good install.
$manifestDir = if ($sdkBand) {
    Join-Path $dotnetRoot "sdk-manifests\$sdkBand\samsung.net.sdk.tizen"
} else { $null }

# Distinct feature bands across every installed SDK, e.g. @("9.0.300", "10.0.300").
$installedBands = @(
    $installedSdks |
        ForEach-Object { Get-SdkBand (($_ -split '\s+')[0]) } |
        Where-Object { $_ } |
        Select-Object -Unique
)

$envDotnetRootRaw = $env:DOTNET_ROOT
$envDotnetRootMismatch = $false
if (-not [string]::IsNullOrWhiteSpace($envDotnetRootRaw)) {
    $envTrimmed = $envDotnetRootRaw.TrimEnd('\', '/')
    $rootTrimmed = $dotnetRoot.TrimEnd('\', '/')
    if ($envTrimmed -ne $rootTrimmed) {
        $envDotnetRootMismatch = $true
        Write-Warn "DOTNET_ROOT ($envDotnetRootRaw) does not match the dotnet being used ($dotnetRoot)."
        Write-Warn "The dotnet on PATH wins. Overriding DOTNET_ROOT for this run only (your saved value is left alone)."
        Write-Warn "If builds keep failing to see the Tizen workload, unset DOTNET_ROOT or point it at $dotnetRoot."
    }
}
# Process-scoped only - never [Environment]::SetEnvironmentVariable(..., 'User') here.
$env:DOTNET_ROOT = $dotnetRoot

Write-Info "Install target: $dotnetRoot (SDK $dotnetVersion, band $sdkBand)"
Write-Info "dotnet resolved to: $dotnetExe"

# ---------------------------------------------------------------------------
# 2) Idempotency check
# ---------------------------------------------------------------------------
if ((Test-TizenWorkload $dotnetExe) -and -not $Force) {
    Write-Success "Tizen workload is already installed."
    Write-Info "Run again with -Force to reinstall."
    exit 0
}

# ---------------------------------------------------------------------------
# 3) Install the Tizen workload
# ---------------------------------------------------------------------------
Write-Step "=== Installing the Tizen .NET workload ==="

# --- Method 1: Samsung workload-install.ps1 ---
$samsungOk = $false
$installerOutput = ""
$installerCheckedSdks = @()
$installerCheckedBands = @()
$updateAllWorkloads = $false
$permissionDenied = $false
Write-Info "Method 1: Samsung workload-install.ps1"
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("workload-install-" + [System.IO.Path]::GetRandomFileName() + ".ps1")
    Write-Info "Downloading $WorkloadScriptUrl"
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($WorkloadScriptUrl, $tmp)
    $wc.Dispose()

    # Start-Process joins -ArgumentList with spaces WITHOUT quoting, so a path
    # containing a space - the default C:\Program Files\dotnet - reaches the child
    # split in two: the installer sees -d C:\Program and dies with
    # "No installed dotnet 'C:\Program'". Quote the paths ourselves. The TrimEnd
    # matters too: a trailing backslash would escape the closing quote.
    $argList = @('-ExecutionPolicy', 'Bypass', '-File', "`"$tmp`"")
    if ($dotnetRootUsable) { $argList += @('-d', "`"$($dotnetRoot.TrimEnd('\', '/'))`"") }
    if ($Version -ne "") {
        $argList += @('-v', $Version)
    } elseif ($installedBands.Count -gt 1) {
        # Without -u the installer only handles `dotnet --version`, leaving other
        # bands without a manifest. -u makes it walk every installed SDK - but it
        # also overrides an explicit -v, so the two are mutually exclusive.
        Write-Info "Multiple SDK bands installed ($($installedBands -join ', ')) - installing for all of them (-u)."
        $argList += '-u'
        $updateAllWorkloads = $true
    }

    # Capture the child's output: the Samsung script swallows per-SDK failures and
    # still exits 0, so the exit code alone cannot tell us whether it worked.
    $outFile = Join-Path ([System.IO.Path]::GetTempPath()) ("workload-install-out-" + [System.IO.Path]::GetRandomFileName() + ".log")
    $errFile = Join-Path ([System.IO.Path]::GetTempPath()) ("workload-install-err-" + [System.IO.Path]::GetRandomFileName() + ".log")

    Write-Info "Running Samsung workload installer (target: $dotnetRoot)..."
    $p = Start-Process powershell -ArgumentList $argList -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile

    foreach ($f in @($outFile, $errFile)) {
        if (Test-Path $f) {
            $installerOutput += (Get-Content -Raw -ErrorAction SilentlyContinue $f)
        }
    }
    Remove-Item -Force $tmp, $outFile, $errFile -ErrorAction SilentlyContinue

    # Echo it so the full install log still reaches the caller.
    if ($installerOutput) { Write-Host $installerOutput }

    # Which SDKs did the installer look at? Collect them ALL, not just the last
    # one: with -u the installer walks every installed SDK, so "the last line" is
    # simply the last iteration, not a target. What actually matters is whether
    # our band appears in the set at all.
    $checks = [regex]::Matches($installerOutput, 'Check Tizen Workload for sdk\s+(\S+)')
    $installerCheckedSdks = @(
        # TrimEnd strips sentence punctuation the installer glues onto the
        # version ("... for sdk 8.0.130." -> "8.0.130"), which \S+ would keep.
        $checks | ForEach-Object { $_.Groups[1].Value.TrimEnd('.', ',', ';') } | Select-Object -Unique
    )
    $installerCheckedBands = @(
        $installerCheckedSdks | ForEach-Object { Get-SdkBand $_ } | Where-Object { $_ } | Select-Object -Unique
    )

    $installerFailed = $installerOutput -match 'Failed to install Tizen Workload for sdk'
    # The Samsung installer's own wording, plus what .NET prints when it cannot
    # write to the SDK directory.
    $permissionDenied = $installerOutput -match 'No permission to install|Access to the path .* is denied|UnauthorizedAccess'

    if ($p.ExitCode -eq 0 -and -not $installerFailed) {
        $samsungOk = $true
        Write-Success "Samsung workload installer completed."
    } else {
        if ($installerFailed) {
            Write-Warn "Samsung workload installer reported a per-SDK failure (it still exited $($p.ExitCode))."
        } else {
            Write-Warn "Samsung workload installer returned exit $($p.ExitCode)."
        }
        if ($permissionDenied) {
            Write-Warn "The installer reported a permission problem - the .NET SDK is likely under C:\Program Files\dotnet."
            Write-Warn "Re-run this setup from an elevated (Run as Administrator) PowerShell."
        }
    }
} catch {
    Write-Warn "Samsung workload installer failed: $_"
}

# --- Method 2: dotnet workload install tizen (fallback) ---
if (-not $samsungOk) {
    Write-Info "Method 2 (fallback): dotnet workload install tizen"
    # Capture it too - a permission failure that only shows up here still has to
    # reach the permission_denied diagnosis below.
    $fallbackOutput = (& $dotnetExe workload install tizen 2>&1 | Out-String)
    $fallbackExit = $LASTEXITCODE
    if ($fallbackOutput) { Write-Host $fallbackOutput }
    $installerOutput += $fallbackOutput
    if ($installerOutput -match 'No permission to install|Access to the path .* is denied|UnauthorizedAccess') {
        $permissionDenied = $true
    }

    if ($fallbackExit -ne 0) {
        Write-Err "Fallback 'dotnet workload install tizen' failed (exit $fallbackExit)."
        if ($permissionDenied) {
            Write-Err "If this is an access-denied error, re-run from an elevated (Administrator) PowerShell."
        }
    } else {
        Write-Success "Fallback workload install completed."
    }
}

# ---------------------------------------------------------------------------
# 4) Verify - against the SAME dotnet we installed into
# ---------------------------------------------------------------------------
Write-Step "=== Verifying the Tizen workload ==="
if (Test-TizenWorkload $dotnetExe) {
    Write-Success "Tizen workload installed successfully."
    Write-Info "Next: create a DotNET project with the tizen-create-project agent."
    exit 0
}

# ---------------------------------------------------------------------------
# 4b) Verification failed - report WHERE things actually are instead of guessing.
# These [DIAG] lines are parsed by lib/core/dotnet.js into the failure envelope,
# so the calling agent never has to probe the machine by hand.
# ---------------------------------------------------------------------------
Write-Err "Tizen workload not found after installation."

# Which bands DO have a Tizen manifest? A manifest under a band other than the
# one this dotnet resolves is the #258 signature.
$manifestBands = @()
$manifestRoot = Join-Path $dotnetRoot "sdk-manifests"
if (Test-Path $manifestRoot) {
    $manifestBands = @(
        Get-ChildItem -Path $manifestRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { Test-Path (Join-Path $_.FullName "samsung.net.sdk.tizen") } |
            ForEach-Object { $_.Name }
    )
}

$workloadVersionLine = ((& $dotnetExe workload list) 2>$null |
    Select-String -Pattern 'Workload version:' |
    Select-Object -First 1)
if ($workloadVersionLine) { $workloadVersionLine = $workloadVersionLine.ToString().Trim() }

# Flat layout (<= 8.0.1xx) or nested under a manifest-version dir (8.0.2xx+).
$manifestExists = $false
if ($manifestDir -and (Test-Path $manifestDir)) {
    $manifestExists = @(
        Get-ChildItem -Path $manifestDir -Filter 'WorkloadManifest.json' -Recurse -Depth 1 -File -ErrorAction SilentlyContinue
    ).Count -gt 0
}

Write-Host "[DIAG] dotnet_path=$dotnetExe"
Write-Host "[DIAG] dotnet_version=$dotnetVersion"
Write-Host "[DIAG] dotnet_root=$dotnetRoot"
Write-Host "[DIAG] sdk_band=$sdkBand"
Write-Host "[DIAG] env_dotnet_root=$(if ([string]::IsNullOrWhiteSpace($envDotnetRootRaw)) { '(unset)' } else { $envDotnetRootRaw })"
Write-Host "[DIAG] installer_pinned_dir=$(if ($dotnetRootUsable) { $dotnetRoot } else { '(not pinned)' })"
Write-Host "[DIAG] installer_update_all=$($updateAllWorkloads.ToString().ToLower())"
Write-Host "[DIAG] installer_checked_sdks=$(if ($installerCheckedSdks.Count -gt 0) { $installerCheckedSdks -join ',' } else { '(none)' })"
Write-Host "[DIAG] installer_checked_bands=$(if ($installerCheckedBands.Count -gt 0) { $installerCheckedBands -join ',' } else { '(none)' })"
Write-Host "[DIAG] manifest_expected=$(if ($manifestDir) { Join-Path $manifestDir '[<manifest-version>\]WorkloadManifest.json' } else { '(unknown)' }) exists=$($manifestExists.ToString().ToLower())"
Write-Host "[DIAG] manifest_found_in_bands=$(if ($manifestBands.Count -gt 0) { $manifestBands -join ',' } else { '(none)' })"
Write-Host "[DIAG] workload_version_line=$(if ($workloadVersionLine) { $workloadVersionLine } else { '(none)' })"
Write-Host "[DIAG] permission_denied=$($permissionDenied.ToString().ToLower())"

# A permission failure explains everything downstream: nothing could be written,
# so any band evidence below is a SYMPTOM, not the cause. Report it first, or the
# caller gets told "this is not a permissions problem" about a permissions problem.
if ($permissionDenied) {
    Write-Err "The installer could not write to the SDK directory (permission denied)."
    Write-Err "Re-run this setup from an elevated (Run as Administrator) PowerShell."
    exit 1
}

# Wrong-target case: the workload went somewhere other than the band this dotnet
# uses. Decide by SET MEMBERSHIP, never by "the last SDK the installer mentioned"
# - under -u that last line is just the final iteration, not a target.
#
# -cnotcontains, not -notcontains: the default is case-INsensitive, while the .sh
# side compares with `=`. Bands are numeric so it cannot bite today, but the two
# implementations should differ by language, not by semantics.
$wrongBand = ($manifestBands.Count -gt 0 -and $sdkBand -and ($manifestBands -cnotcontains $sdkBand)) -or
             ($installerCheckedBands.Count -gt 0 -and $sdkBand -and ($installerCheckedBands -cnotcontains $sdkBand))

if ($wrongBand) {
    Write-Err "The Tizen workload was registered for a DIFFERENT .NET SDK than the one in use."
    Write-Err "In use: $dotnetVersion (band $sdkBand) at $dotnetRoot"
    if ($installerCheckedBands.Count -gt 0) {
        Write-Err "Installer only handled band(s): $($installerCheckedBands -join ', ')"
    }
    if ($manifestBands.Count -gt 0) { Write-Err "Manifest present for band(s): $($manifestBands -join ', ')" }
    Write-Err "Fix: unset DOTNET_ROOT (or point it at $dotnetRoot) and re-run this setup."
    exit 3
}

exit 1
