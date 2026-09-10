# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# common.ps1 - shared helpers for tizen-sdk-skills PowerShell scripts.
#
# Dot-source this near the top of each script:
#   . (Join-Path $PSScriptRoot "..\lib\common.ps1")

# ----------------------------------------------------------------------------
# Force UTF-8 output so Korean (and other non-ASCII) text is not mojibake when
# the output is captured by Cline / the Node CLI runners. Windows PowerShell 5.1
# defaults console output to the active code page (e.g. cp949), which a UTF-8
# consumer then decodes as garbage. Best-effort - wrapped so it never aborts.
# ----------------------------------------------------------------------------
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    # Also set the console code page to UTF-8 (65001) so child processes
    # (tz, dotnet, sdb, etc.) emit UTF-8 output that PowerShell can capture
    # correctly. Without this, tz/dotnet inherit the OEM code page (cp949)
    # and their Korean output is mojibake when captured via 2>&1.
    $null = chcp 65001
} catch { }

# ----------------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------------
function Write-Info    { param([string]$Message) Write-Host "[INFO]  $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[OK]    $Message" -ForegroundColor Green }
function Write-Warn    { param([string]$Message) Write-Host "[WARN]  $Message" -ForegroundColor Yellow }
function Write-Err     { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Step    { param([string]$Message) Write-Host "[*] $Message" -ForegroundColor Green }
function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

# ----------------------------------------------------------------------------
# SDK path resolution
#   ~\.tizen.sdk.path.config -> TIZEN_SDK_PATH -> %USERPROFILE%\tizen-sdk -> C:\tizen-sdk
# The config file is the path saved by sdk-init (the only source the Node lib's
# readSdkPath() uses), so it comes FIRST and scripts and the JS layer agree on
# the SDK location. TIZEN_SDK_PATH is a secondary hint (issue #70: a profile
# `TIZEN_SDK_PATH=~/tizen-studio` shadowed the configured tizen-sdk).
# Returns the first candidate that actually CONTAINS the tizen-sdk tools, so a
# stale/wrong TIZEN_SDK_PATH (e.g. pointing at Tizen Studio) is skipped in
# favor of a real tizen-sdk install. Falls back to %USERPROFILE%\tizen-sdk if none validate.
# ----------------------------------------------------------------------------
function Test-IsTizenStudio {
    param([string]$Dir)
    if ([string]::IsNullOrWhiteSpace($Dir)) { return $false }
    # Tizen Studio (the IDE distribution) ships tools\ide and no tools\tizen-core.
    try {
        return (Test-Path (Join-Path $Dir "tools\ide" -ErrorAction Stop)) -and
               -not (Test-Path (Join-Path $Dir "tools\tizen-core" -ErrorAction Stop))
    } catch {
        return $false
    }
}

function Test-IsTizenSdk {
    param([string]$Dir)
    if ([string]::IsNullOrWhiteSpace($Dir)) { return $false }
    # A real tizen-sdk has the tizen-core tools (tz) under tools\; a bare sdb is
    # accepted too (older layouts) unless the directory is a Tizen Studio
    # install, which also ships tools\sdb.
    # Join-Path throws on a non-existent drive (e.g. a stale TIZEN_SDK_PATH like
    # X:\sdk) and that noise would end up in the caller's error details, so any
    # candidate that cannot even be joined is simply "not an SDK".
    try {
        if (Test-Path (Join-Path $Dir "tools\tizen-core" -ErrorAction Stop)) { return $true }
        $hasSdb = (Test-Path (Join-Path $Dir "tools\sdb.exe" -ErrorAction Stop)) -or
                  (Test-Path (Join-Path $Dir "tools\sdb" -ErrorAction Stop))
        if (-not $hasSdb) { return $false }
        return -not (Test-IsTizenStudio $Dir)
    } catch {
        return $false
    }
}

function Get-ConfiguredSdkPath {
    $configFile = Join-Path $env:USERPROFILE ".tizen.sdk.path.config"
    if (-not (Test-Path $configFile)) { return "" }
    try {
        $configured = (Get-Content $configFile -TotalCount 1 -ErrorAction Stop)
        if ($configured) { return $configured.Trim() }
    } catch { }
    return ""
}

function Get-SdkPath {
    $candidates = @()
    $configured = Get-ConfiguredSdkPath
    if ($configured) { $candidates += $configured }
    if (-not [string]::IsNullOrWhiteSpace($env:TIZEN_SDK_PATH)) { $candidates += $env:TIZEN_SDK_PATH }
    $candidates += (Join-Path $env:USERPROFILE "tizen-sdk")
    $candidates += "C:\tizen-sdk"

    foreach ($c in $candidates) {
        if (Test-IsTizenSdk $c) { return $c }
    }
    # Nothing validated (SDK probably not installed) - default to the standard path.
    return (Join-Path $env:USERPROFILE "tizen-sdk")
}

# Where a NEW SDK install goes when the caller gave no -Path: the configured
# path (sdk-init / a previous install), else TIZEN_SDK_PATH unless it points at
# a Tizen Studio install, else %USERPROFILE%\tizen-sdk. The JS pre-check passes
# -Path explicitly; this default only guards a hand-run installer (issue #70).
function Get-DefaultSdkInstallPath {
    $configured = Get-ConfiguredSdkPath
    if ($configured) { return $configured }
    if (-not [string]::IsNullOrWhiteSpace($env:TIZEN_SDK_PATH)) {
        if (Test-IsTizenStudio $env:TIZEN_SDK_PATH) {
            [Console]::Error.WriteLine("[WARN]  Ignoring TIZEN_SDK_PATH=$($env:TIZEN_SDK_PATH): that is a Tizen Studio install, not a tizen-sdk directory. Installing to $(Join-Path $env:USERPROFILE 'tizen-sdk') (pass -Path to override).")
        } else {
            return $env:TIZEN_SDK_PATH
        }
    }
    return (Join-Path $env:USERPROFILE "tizen-sdk")
}

# ----------------------------------------------------------------------------
# Tizen package repository (pkg_list) helpers
#
# A usable Tizen package repository serves a package list file named
# pkg_list_{OS}-{ARCH} at its root, where OS is windows | ubuntu | macos and
# ARCH is 64 or 32 (e.g. pkg_list_windows-64). A URL that does not serve such a
# file for the CURRENT OS cannot drive an install, so a custom repository URL is
# rejected up front instead of failing 100 downloads later. Both
# tizen-sdk-install.ps1 and tizen-sdk-install-custom-repo.ps1 use these.
# ----------------------------------------------------------------------------

# The pkg_list OS token for this machine. Always "windows" here - these helpers
# only ever run under PowerShell on Windows.
function Get-PkgOsBase { return "windows" }

# Trim whitespace and trailing slashes so "$url/pkg_list_x" never doubles a
# slash (some servers 404 on "//pkg_list_...").
function Get-NormalizedRepoUrl {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return "" }
    return $Url.Trim().TrimEnd('/')
}

# Return $true when the URL serves content: HEAD first, then a 1-byte ranged GET
# for servers that reject HEAD (405/501) - a repo can be perfectly usable and
# still refuse HEAD, so a HEAD-only probe would produce false rejections.
function Test-UrlExists {
    param([string]$Url)

    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Method = "HEAD"
        $req.Timeout = 30000
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        if ($code -ge 200 -and $code -lt 400) { return $true }
    } catch { }

    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Method = "GET"
        $req.Timeout = 30000
        $req.AddRange(0, 0)
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        if ($code -ge 200 -and $code -lt 400) { return $true }
    } catch { }

    return $false
}

# Validate a custom package repository URL.
#
# Returns the matched pkg_list OS-ARCH token (e.g. "windows-64") on success, or
# $null after logging the reason when the URL is malformed or serves no
# pkg_list_{OS}-{64,32}.
function Test-PkgRepoUrl {
    param([string]$Url)

    $repo = Get-NormalizedRepoUrl $Url
    if ([string]::IsNullOrWhiteSpace($repo)) {
        Write-Err "Repository URL is empty"
        return $null
    }
    if ($repo -notmatch '^https?://') {
        # ASCII only inside string literals: this file has no UTF-8 BOM, so
        # Windows PowerShell 5.1 decodes it with the ANSI code page and a
        # multi-byte char (e.g. an em dash) can swallow the closing quote.
        Write-Err "Repository URL must start with http:// or https:// - got: $repo"
        return $null
    }

    $base = Get-PkgOsBase

    Write-Step "=== Validating package repository URL ==="
    Write-Info "Repository: $repo"

    foreach ($arch in @('64', '32')) {
        $candidate = "$repo/pkg_list_${base}-${arch}"
        Write-Info "Probing $candidate"
        if (Test-UrlExists $candidate) {
            Write-Success "Valid repository - found pkg_list_${base}-${arch}"
            return "${base}-${arch}"
        }
    }

    Write-Err "Not a valid Tizen package repository: $repo"
    Write-Err "Neither pkg_list_${base}-64 nor pkg_list_${base}-32 is reachable there."
    Write-Err "A repository root must serve pkg_list_{OS}-{64,32} (OS = windows | ubuntu | macos)."
    Write-Err "Expected e.g. $repo/pkg_list_${base}-64"
    return $null
}

# ----------------------------------------------------------------------------
# Locate a Tizen SDK tool.
#   sdb lives at <sdk>\tools\sdb.exe
#   everything else (tz, ...) lives at <sdk>\tools\tizen-core\<name>.exe
# Returns the absolute path, or $null (with an error logged) if not found.
# NOTE: nested Join-Path is used for Windows PowerShell 5.1 compatibility
#       (multi-argument Join-Path is only supported in PowerShell 6+).
# ----------------------------------------------------------------------------
function Find-TizenTool {
    param([string]$ToolName)

    $sdkPath = Get-SdkPath

    if ($ToolName -eq "sdb") {
        $toolPath = Join-Path (Join-Path $sdkPath "tools") "sdb.exe"
    } else {
        $toolPath = Join-Path (Join-Path (Join-Path $sdkPath "tools") "tizen-core") "$ToolName.exe"
    }

    if (-not (Test-Path $toolPath)) {
        Write-Err "Cannot find $ToolName at $toolPath"
        return $null
    }

    return $toolPath
}

# ----------------------------------------------------------------------------
# Locate an installed .NET SDK `dotnet` executable, even when it is NOT on PATH.
# Searches PATH, well-known install locations, and Tizen SDK-bundled dotnets.
# Returns the path to a usable SDK (preferring one that has the Tizen workload),
# or $null. Does NOT modify the environment.
# ----------------------------------------------------------------------------
function Find-DotnetSdk {
    $candidates = @()

    $onPath = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }

    if (-not [string]::IsNullOrWhiteSpace($env:DOTNET_ROOT)) {
        $candidates += (Join-Path $env:DOTNET_ROOT "dotnet.exe")
    }
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles "dotnet\dotnet.exe") }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} "dotnet\dotnet.exe") }
    $candidates += (Join-Path $env:USERPROFILE ".dotnet\dotnet.exe")
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA "Microsoft\dotnet\dotnet.exe") }

    # Tizen SDK-bundled dotnets (…\sdktools\dotnet\dotnet.exe and %USERPROFILE%\tizen-sdk).
    if ($env:USERPROFILE) {
        try {
            Get-ChildItem -Path $env:USERPROFILE -Filter "dotnet.exe" -Recurse -Depth 6 -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -like "*\sdktools\dotnet\dotnet.exe" } |
                ForEach-Object { $candidates += $_.FullName }
        } catch { }
    }

    $firstSdk = $null
    foreach ($c in ($candidates | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($c)) { continue }
        if (-not (Test-Path $c)) { continue }
        # Must be a real SDK (lists at least one SDK), not a runtime-only host.
        $sdks = (& $c --list-sdks) 2>$null
        if (-not $sdks) { continue }
        if (-not $firstSdk) { $firstSdk = $c }
        # Prefer one that already has the Tizen workload installed.
        $wl = (& $c workload list) 2>$null
        if ($wl | Select-String -Pattern '^\s*tizen' -Quiet) {
            return $c
        }
    }
    return $firstSdk
}

# ----------------------------------------------------------------------------
# Run a native executable (sdb, python, ...) and return its stdout lines.
#
# Windows PowerShell 5.1 wraps every stderr line of a native command in a
# NativeCommandError record whenever the stream is redirected (2>$null as much
# as 2>&1). Under $ErrorActionPreference = "Stop" that record is promoted to a
# terminating error, so a harmless "* daemon started *" or "error: device not
# found" from sdb would abort the calling script. Relaxing the preference to
# Continue for just this call keeps the redirect and $LASTEXITCODE intact and
# lets the caller judge the result by output / exit code instead.
#   Invoke-Native <exe> <args>               -> stdout lines, stderr dropped
#   Invoke-Native <exe> <args> -MergeStderr  -> stdout + stderr lines as strings
# ----------------------------------------------------------------------------
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$Arguments = @(),
        [switch]$MergeStderr
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($MergeStderr) {
            & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
        } else {
            & $Exe @Arguments 2>$null
        }
    } finally {
        $ErrorActionPreference = $prev
    }
}

# ----------------------------------------------------------------------------
# Device discovery via `sdb devices`.
#   Get-ConnectedDevices <sdb>  -> array of serials in 'device' state
#   Get-DeviceSerial <sdb>      -> first connected serial ($null if none)
# ----------------------------------------------------------------------------
function Get-ConnectedDevices {
    param([string]$SdbPath)

    $serials = @()
    $output = Invoke-Native -Exe $SdbPath -Arguments @('devices')
    foreach ($line in $output) {
        $line = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -like "List of devices*") { continue }
        if ($line -match '\sdevice(\s|$)') {
            $serials += ($line -split '\s+')[0]
        }
    }
    return $serials
}

function Get-DeviceSerial {
    param([string]$SdbPath)
    # @() forces an array: a single returned serial would otherwise unwrap to a
    # string, and $devices[0] would then return its first CHARACTER (e.g. "e").
    $devices = @(Get-ConnectedDevices $SdbPath)
    if ($devices.Count -gt 0) {
        return $devices[0]
    }
    return $null
}

# ----------------------------------------------------------------------------
# Run a one-line `sdb shell` command and return the first non-empty trimmed
# line ("" if none). Robust against sdb returning an array of lines, which
# would otherwise break a direct .Trim() call ([Object[]] has no Trim()).
# Reads the caller's $Sdb (sdb path) and $Serial (target device; when empty
# the command goes to sdb's default target) - the convention the debug scripts
# already follow, so they can share this instead of each carrying a copy.
# ----------------------------------------------------------------------------
function Invoke-SdbLine {
    param([string]$ShellCmd)
    $target = @()
    if ($Serial) { $target = @('-s', $Serial) }
    $out = Invoke-Native -Exe $Sdb -Arguments ($target + @('shell', $ShellCmd))
    foreach ($line in @($out)) {
        $t = ("$line" -replace "`r","").Trim()
        if ($t) { return $t }
    }
    return ""
}

# ----------------------------------------------------------------------------
# Resolve the LAUNCHABLE app id for a package/app id, as the device lists it.
#   Resolve-AppId <sdb> <serial> <needle>
# `app_launcher -l` prints entries as 'Name'  'AppID'. Prefer an exact match,
# then a dotted token containing the needle (a real app id is dotted; the bare
# display-name token is not), then any containing token.
# Returns the id, or $null when the app is not listed (not installed).
# `launch_app`/`app_launcher -s` with an unknown id silently do nothing, so
# callers must treat $null as an error instead of launching blind (issue #97).
# ----------------------------------------------------------------------------
function Resolve-AppId {
    param([string]$SdbPath, [string]$DeviceSerial, [string]$Needle)
    $target = @()
    if ($DeviceSerial) { $target = @('-s', $DeviceSerial) }
    $out = Invoke-Native -Exe $SdbPath -Arguments ($target + @('shell', 'app_launcher -l'))
    $candidates = @()
    foreach ($line in @($out)) {
        foreach ($m in [regex]::Matches("$line", "'([^']*)'")) {
            $tok = $m.Groups[1].Value
            if ($tok -and $tok.Contains($Needle)) { $candidates += $tok }
        }
    }
    if ($candidates.Count -eq 0) { return $null }
    # An exact hit counts only when it is dotted: the display NAME can equal the
    # needle too ('MyWebApp' next to 'xA4DHr9cFv.MyWebApp') and is not launchable.
    if ($Needle.Contains('.') -and ($candidates -contains $Needle)) { return $Needle }
    $dotted = @($candidates | Where-Object { $_.Contains('.') })
    if ($dotted.Count -gt 0) { return $dotted[0] }
    return $candidates[0]
}

# ----------------------------------------------------------------------------
# Locate em-cli.bat (Emulator Manager CLI).
#   Get-SdkPath honours TIZEN_SDK_PATH and ~\.tizen.sdk.path.config (the path
#   tizen-sdk-init saves); the literal paths stay as a last resort for an SDK
#   that is installed but has no config written yet.
# Returns the absolute path, or $null if not found.
# ----------------------------------------------------------------------------
function Find-EmCli {
    $sdkPath = Get-SdkPath
    $candidates = @(
        (Join-Path $sdkPath "tools\emulator\bin\em-cli.bat"),
        (Join-Path $env:USERPROFILE "tizen-sdk\tools\emulator\bin\em-cli.bat"),
        "C:\tizen-sdk\tools\emulator\bin\em-cli.bat"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}
