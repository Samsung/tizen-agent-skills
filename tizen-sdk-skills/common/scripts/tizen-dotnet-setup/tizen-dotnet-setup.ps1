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
#                            [-SdkChannel <chan>] [-DotnetRoot <dir>] [-PersistEnv] [-Help]
#
# Options:
#   -Force              Reinstall the Tizen workload even if it is already present
#   -Version <ver>      Tizen workload version to pass to the Samsung installer
#   -NoInstallSdk       Do not auto-install a missing .NET SDK (guidance + exit 2)
#   -SdkChannel <chan>  .NET SDK channel for the auto-install (default: 8.0)
#   -DotnetRoot <dir>   Use the .NET SDK at this install root instead of discovering one
#   -PersistEnv         Also persist a Tizen-extension-bundled dotnet into the User
#                       DOTNET_ROOT/PATH (official install roots are always persisted;
#                       bundled ones are process-scope only unless this is given)
#   -Help               Show this help

param(
    [switch]$Force,
    [string]$Version = "",
    [switch]$NoInstallSdk,
    [string]$SdkChannel = "8.0",
    [string]$DotnetRoot = "",
    [switch]$PersistEnv,
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

Usage: .\tizen-dotnet-setup.ps1 [-Force] [-Version <ver>] [-NoInstallSdk] [-SdkChannel <chan>]
                                [-DotnetRoot <dir>] [-PersistEnv] [-Help]

Options:
  -Force              Reinstall the Tizen workload even if it is already present
  -Version <ver>      Tizen workload version to pass to the Samsung installer
  -NoInstallSdk       Do not auto-install a missing .NET SDK (guidance + exit 2)
  -SdkChannel <chan>  .NET SDK channel for the auto-install (default: 8.0)
  -DotnetRoot <dir>   Use the .NET SDK at this install root instead of discovering one
  -PersistEnv         Also persist a Tizen-extension-bundled dotnet into the User
                      DOTNET_ROOT/PATH (see below)
  -Help               Show this help

What it does:
  1) Checks whether the .NET SDK (dotnet) is on PATH (or uses -DotnetRoot)
  2) If not on PATH: ranks every installed SDK (DOTNET_ROOT, official install roots,
     Tizen-extension-bundled dotnets) and picks the best one. Official roots and an
     explicit -DotnetRoot are wired up persistently (User DOTNET_ROOT + User PATH);
     a dotnet bundled inside a Tizen extension tree is used for this run only unless
     -PersistEnv is given, because an extension update can move or delete it and
     leave a dangling DOTNET_ROOT behind. If no SDK exists anywhere, auto-installs
     one user-scope via the official dotnet-install.ps1 into
     %LOCALAPPDATA%\Microsoft\dotnet (no admin rights needed). Only if that is
     skipped (-NoInstallSdk) or fails does it print guidance + $DotnetDownloadUrl
     and exit 2
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
# Helpers: make a discovered dotnet usable.
#
# Use-DotnetForThisRun only touches the current process. Enable-Dotnet also
# persists the User-level DOTNET_ROOT and prepends the dir to the User PATH.
# Persistence policy (step 1 below): official install roots and an explicit
# -DotnetRoot are persisted; a dotnet bundled inside a Tizen extension tree is
# NOT unless -PersistEnv is given - an extension update can move or delete it,
# leaving a dangling DOTNET_ROOT that silently breaks every later build.
# ---------------------------------------------------------------------------
$script:PersistedRoot = $null
$script:PersistedPathEntry = $null

function Use-DotnetForThisRun {
    param([string]$DotnetExe)
    $droot = Split-Path -Parent $DotnetExe
    $env:DOTNET_ROOT = $droot
    $env:PATH = "$droot;$env:PATH"
}

function Enable-Dotnet {
    param([string]$DotnetExe, [string]$StaleRoot = "")

    $droot = Split-Path -Parent $DotnetExe

    [Environment]::SetEnvironmentVariable('DOTNET_ROOT', $droot, 'User')
    $script:PersistedRoot = $droot
    Write-Success "Set User DOTNET_ROOT = $droot"

    $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ([string]::IsNullOrWhiteSpace($userPath)) { $userPath = "" }
    $parts = @($userPath -split ';' | Where-Object { $_ -ne '' })
    $changed = $false

    # A stale DOTNET_ROOT this script once persisted also left its dir on the User PATH.
    if (-not [string]::IsNullOrWhiteSpace($StaleRoot)) {
        $stale = $StaleRoot.TrimEnd('\', '/')
        $kept = @($parts | Where-Object { $_.TrimEnd('\', '/') -ine $stale })
        if ($kept.Count -lt $parts.Count) {
            $parts = $kept
            $changed = $true
            Write-Info "Removed the stale dotnet dir from your User PATH: $StaleRoot"
        }
    }

    # The persisted root must be the FIRST dotnet dir on the User PATH, or a
    # bundled dotnet sitting ahead of it keeps winning `Get-Command dotnet`.
    $rootKey = $droot.TrimEnd('\', '/')
    $others = @($parts | Where-Object { $_.TrimEnd('\', '/') -ine $rootKey })
    if ($parts.Count -gt 0 -and $parts[0].TrimEnd('\', '/') -ieq $rootKey -and $others.Count -eq $parts.Count - 1) {
        Write-Info "dotnet dir already first on your User PATH - leaving it as is."
    } else {
        $verb = if ($others.Count -eq $parts.Count) { 'Added' } else { 'Moved' }
        $parts = @($droot) + $others
        $changed = $true
        Write-Success "$verb dotnet to the front of your User PATH (effective in new shells): $droot"
    }
    if ($changed) {
        [Environment]::SetEnvironmentVariable('PATH', ($parts -join ';'), 'User')
    }
    $script:PersistedPathEntry = $droot

    Use-DotnetForThisRun $DotnetExe
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

# Facts captured BEFORE anything is changed - both are reported in the envelope.
$envDotnetRootRaw = $env:DOTNET_ROOT
$userDotnetRoot = [Environment]::GetEnvironmentVariable('DOTNET_ROOT', 'User')

# A DOTNET_ROOT with no dotnet.exe under it is stale - typically a bundled dotnet
# that an extension update moved or removed. MSBuild and the Samsung installer
# both honour DOTNET_ROOT, so it silently breaks builds until it is cleared.
$danglingRoot = ""
foreach ($r in @($envDotnetRootRaw, $userDotnetRoot)) {
    if ([string]::IsNullOrWhiteSpace($r)) { continue }
    if (-not (Test-Path -LiteralPath (Join-Path $r 'dotnet.exe'))) { $danglingRoot = $r; break }
}
if ($danglingRoot) {
    Write-Warn "DOTNET_ROOT ($danglingRoot) points to a directory with no dotnet.exe - it is stale."
    Write-Warn "Clear it with: [Environment]::SetEnvironmentVariable('DOTNET_ROOT', `$null, 'User')  (then open a new terminal)."
}

$candidates = @(Get-DotnetCandidates)
$pathCandidate = $candidates | Where-Object { $_.Tier -eq 'path' } | Select-Object -First 1
$dotnetExe = $null
$selectedTier = $null

if ($DotnetRoot -ne "") {
    $explicitExe = Join-Path $DotnetRoot 'dotnet.exe'
    if (-not (Test-Path -LiteralPath $explicitExe)) {
        Write-Err "-DotnetRoot '$DotnetRoot' has no dotnet.exe - pass the .NET install root (the directory that contains dotnet.exe and sdk\)."
        exit 1
    }
    $dotnetExe = Resolve-RealPath $explicitExe
    $selectedTier = 'explicit'
    $explicitRoot = (Split-Path -Parent $dotnetExe).TrimEnd('\', '/')
    $known = $candidates | Where-Object { $_.Root.TrimEnd('\', '/') -ieq $explicitRoot } | Select-Object -First 1
    if ($known) {
        $known.Tier = 'explicit'
    } else {
        $c = Test-DotnetCandidate 'explicit' $dotnetExe @{}
        if ($c) { $candidates += $c }
    }
    Write-Info "Using the .NET SDK from -DotnetRoot: $dotnetExe"
} elseif ($pathCandidate) {
    $dotnetExe = $pathCandidate.Path
    $selectedTier = 'path'
} else {
    # Not on PATH - it may still be installed (e.g. bundled in a Tizen SDK tree).
    Write-Warn "dotnet is not on PATH - searching for an existing .NET SDK install..."
    $best = Select-DotnetCandidate $candidates
    if ($best) {
        $dotnetExe = $best.Path
        $selectedTier = $best.Tier
        Write-Success "Found an installed .NET SDK not on PATH: $dotnetExe"
    }
}

# Make the chosen dotnet reachable. Nothing to do when it is the one already on
# PATH. Otherwise official roots and an explicit -DotnetRoot are wired up
# persistently; a Tizen-bundled dotnet only for this process unless -PersistEnv.
if ($dotnetExe) {
    $chosenRoot = (Split-Path -Parent $dotnetExe).TrimEnd('\', '/')
    $alreadyOnPath = $pathCandidate -and ($pathCandidate.Root.TrimEnd('\', '/') -ieq $chosenRoot)
    if (-not $alreadyOnPath) {
        $kind = Get-DotnetRootKind $chosenRoot
        if ($kind -ne 'bundled' -or $PersistEnv) {
            Enable-Dotnet $dotnetExe -StaleRoot $danglingRoot
        } else {
            Use-DotnetForThisRun $dotnetExe
            Write-Warn "This dotnet is bundled inside a Tizen extension tree ($chosenRoot). It was NOT added to your User DOTNET_ROOT/PATH: an extension update can move or delete it."
            Write-Warn "Builds in other shells will not see it. Install an official .NET SDK, or re-run this setup with -PersistEnv to wire it up anyway."
        }
    }
}

# No SDK anywhere - install it ourselves, user-scope, unless opted out.
if (-not $dotnetExe -and -not $NoInstallSdk) {
    $installed = Install-DotnetSdk -Channel $SdkChannel
    if ($installed) {
        Enable-Dotnet $installed -StaleRoot $danglingRoot
        $dotnetExe = $installed
        $selectedTier = 'official'
        $c = Test-DotnetCandidate 'official' $installed @{}
        if ($c) { $candidates += $c }
    }
}

# ---------------------------------------------------------------------------
# 1a) Facts for the envelope - printed on EVERY path, success included (the
# [DIAG] block at the end is failure-only). lib/core/dotnet.js parses both:
#   [ENV] key=value
#   [CANDIDATE] <tier>|<tizen_workload>|<version>|<selected>|<path>
# The path comes last because it may contain spaces (C:\Program Files\dotnet).
# ---------------------------------------------------------------------------
$selectedRoot = if ($dotnetExe) { (Split-Path -Parent $dotnetExe).TrimEnd('\', '/') } else { '' }
Write-Host "[ENV] env_dotnet_root=$(if ([string]::IsNullOrWhiteSpace($envDotnetRootRaw)) { '(unset)' } else { $envDotnetRootRaw })"
Write-Host "[ENV] dangling_dotnet_root=$(if ($danglingRoot) { $danglingRoot } else { '(none)' })"
Write-Host "[ENV] persisted_dotnet_root=$(if ($script:PersistedRoot) { $script:PersistedRoot } else { '(none)' })"
Write-Host "[ENV] persisted_path_entry=$(if ($script:PersistedPathEntry) { $script:PersistedPathEntry } else { '(none)' })"
foreach ($c in $candidates) {
    $isSelected = ($c.Root.TrimEnd('\', '/') -ieq $selectedRoot)
    Write-Host "[CANDIDATE] $($c.Tier)|$($c.TizenWorkload.ToString().ToLower())|$($c.Version)|$($isSelected.ToString().ToLower())|$($c.Path)"
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

if (-not [string]::IsNullOrWhiteSpace($envDotnetRootRaw) -and
    ($envDotnetRootRaw.TrimEnd('\', '/') -ine $dotnetRoot.TrimEnd('\', '/'))) {
    Write-Warn "DOTNET_ROOT ($envDotnetRootRaw) does not match the dotnet being used ($dotnetRoot)."
    if ($script:PersistedRoot) {
        Write-Info "Your User DOTNET_ROOT now points at $dotnetRoot (effective in new shells)."
    } else {
        $winner = if ($selectedTier -eq 'explicit') { '-DotnetRoot' } else { 'The dotnet on PATH' }
        Write-Warn "$winner wins. Overriding DOTNET_ROOT for this run only (your saved value is left alone)."
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
