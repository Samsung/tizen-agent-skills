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

# Formats a TimeSpan as "1h 2m 3s" / "2m 3s" / "3.4s", picking the coarsest
# units that apply so a phase timing line stays short at any duration.
function Format-Duration {
    param([Parameter(Mandatory=$true)][TimeSpan]$Elapsed)
    # [math]::Floor, not an [int] cast: PowerShell's [int] rounds to nearest,
    # so 2m40s would print as "3m 40s".
    if ($Elapsed.TotalHours -ge 1) {
        return "{0}h {1}m {2}s" -f [math]::Floor($Elapsed.TotalHours), $Elapsed.Minutes, $Elapsed.Seconds
    } elseif ($Elapsed.TotalMinutes -ge 1) {
        return "{0}m {1}s" -f [math]::Floor($Elapsed.TotalMinutes), $Elapsed.Seconds
    }
    return "{0:N1}s" -f $Elapsed.TotalSeconds
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

# Prefetch phase: download every item (Id/Url/Destination) with up to $Jobs
# concurrent Start-Job workers. Returns a hashtable Id -> @{ Id; Status; Error }.
# A failed/timed-out item is simply absent from disk afterwards; the install
# worker (Get-PackageInstallWorker) re-downloads such items itself, with retry
# and ZIP validation, so callers may ignore the return value.
function Invoke-ParallelDownloads {
    param(
        [Parameter(Mandatory=$true)][AllowEmptyCollection()][object[]]$Items,
        [ValidateRange(1,8)][int]$Jobs = 4,
        [int]$TimeoutSec = 1800  # per-download cap, mirrors curl --max-time in common.sh's download_queue_parallel
    )
    $results = @{}
    $total = $Items.Count
    # Nothing to fetch (e.g. update-package with every package already current,
    # or a resolved set made only of meta packages): return before touching jobs.
    if ($total -eq 0) { return $results }
    $pending = [System.Collections.Queue]::new()
    foreach ($item in $Items) { $pending.Enqueue($item) }
    # Keyed by Job.Id -> @{ Job; Item; Start } so a stalled download can be
    # matched back to its package name and destination file when it times out.
    $running = @{}
    $completed = 0

    while ($pending.Count -gt 0 -or $running.Count -gt 0) {
        while ($pending.Count -gt 0 -and $running.Count -lt $Jobs) {
            $item = $pending.Dequeue()
            $job = Start-Job -ScriptBlock {
                param($Id, $Url, $Destination)
                # A Start-Job worker is a fresh powershell.exe: it does not inherit
                # the TLS 1.2 forcing the parent script applied to ServicePointManager.
                try {
                    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
                } catch { }
                # Download to a .tmp sibling and rename on success so a killed
                # (timed-out) job never leaves a truncated file at Destination.
                $tmp = "$Destination.tmp"
                try {
                    $wc = New-Object System.Net.WebClient
                    $wc.DownloadFile($Url, $tmp)
                    $wc.Dispose()
                    Move-Item -Force $tmp $Destination
                    [pscustomobject]@{ Id=$Id; Status="OK" }
                } catch {
                    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
                    # WebClient wraps the real cause (timeout/proxy/TLS/DNS) one level
                    # down in InnerException; its own Message is a generic
                    # "An exception occurred during a WebClient request." otherwise.
                    $msg = $_.Exception.Message
                    if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
                    [pscustomobject]@{ Id=$Id; Status="FAIL"; Error=$msg }
                }
            } -ArgumentList $item.Id, $item.Url, $item.Destination
            $running[$job.Id] = [pscustomobject]@{ Job = $job; Item = $item; Start = Get-Date }
        }

        if ($running.Count -eq 0) { break }

        # Short poll so we can check per-job elapsed time even when nothing
        # has finished yet (a stalled WebClient.DownloadFile never throws on
        # its own - there's no built-in timeout - so this loop is what notices).
        $done = Wait-Job -Job @($running.Values.Job) -Any -Timeout 5
        if ($done) {
            $entry = $running[$done.Id]
            $result = Receive-Job $done -ErrorAction SilentlyContinue
            if (-not $result) { $result = [pscustomobject]@{ Id = $entry.Item.Id; Status = "FAIL"; Error = "No result returned" } }
            $results["$($result.Id)"] = $result
            Remove-Job $done -Force -ErrorAction SilentlyContinue
            $running.Remove($done.Id)
            $completed++
            if ($result.Status -eq "OK") {
                Write-Info ("[{0}/{1}] {2} downloaded" -f $completed, $total, $result.Id)
            } else {
                Write-Warn ("[{0}/{1}] {2} failed: {3}" -f $completed, $total, $result.Id, $result.Error)
            }
        }

        $now = Get-Date
        foreach ($jobId in @($running.Keys)) {
            $entry = $running[$jobId]
            if (($now - $entry.Start).TotalSeconds -le $TimeoutSec) { continue }
            Stop-Job -Job $entry.Job -ErrorAction SilentlyContinue
            Remove-Job -Job $entry.Job -Force -ErrorAction SilentlyContinue
            Remove-Item -Force "$($entry.Item.Destination).tmp" -ErrorAction SilentlyContinue
            $running.Remove($jobId)
            $completed++
            $results[$entry.Item.Id] = [pscustomobject]@{ Id = $entry.Item.Id; Status = "FAIL"; Error = "Timed out after ${TimeoutSec}s" }
            Write-Warn ("[{0}/{1}] {2} timed out after {3}s, dropped" -f $completed, $total, $entry.Item.Id, $TimeoutSec)
        }
    }
    return $results
}

# ----------------------------------------------------------------------------
# Parallel package install: download-if-missing + extract + merge + manifest
#
# Shared by tizen-sdk-install, tizen-platform-install, tizen-tv-sdk-install,
# tizen-download-emulator-package, tizen-download-mobile-platform (MOBILE and
# IOT-Headed flows) and tizen-update-package. Each caller builds "work items"
# after its own skip logic (resume / same-version / meta package), turns them
# into download items for Invoke-ParallelDownloads, then hands the same items
# to Invoke-ParallelPackageInstall.
#
# Work item (pscustomobject) fields:
#   Pkg      package name (manifest is written as <Pkg>.manifest)
#   Idx      1-based position in the caller's resolved list (progress label)
#   Url      download URL
#   Zip      local zip path under the caller's workdir
#   Stage    per-package extraction dir under the caller's workdir
#   Version  optional; when set and the zip carries no pkginfo.manifest, a
#            minimal manifest with this version is written (update-package)
#   Label    optional; replaces the default "installed" in the OK log line
# ----------------------------------------------------------------------------

function ConvertTo-DownloadItems {
    param([Parameter(Mandatory=$true)][AllowEmptyCollection()][object[]]$WorkItems)
    return @($WorkItems | ForEach-Object {
        [pscustomobject]@{ Id = $_.Pkg; Url = $_.Url; Destination = $_.Zip }
    })
}

# The Start-Job worker for ONE package. It runs in a separate powershell.exe
# with none of this file's functions or the parent's variables, so everything
# it needs (zip extractor, 404 fallback) is defined inline and every input is a
# flat scalar/array argument (nested objects would be flattened by the job
# argument serializer).
#
# Returns one [pscustomobject]@{ Pkg; Idx; Status = OK|SKIP|FAIL; Reason }.
function Get-PackageInstallWorker {
    return {
        param($Pkg, $Idx, $Url, $Zip, $Stage, $Version, $PkgInfoDir, $DestPath, $PkgOs, $MergeMutexName, $PkgRepo, $BinListCache, $OptionalPattern)

        # Fresh process: neither System.IO.Compression.ZipFile nor the parent's
        # TLS 1.2 ServicePointManager setting is present by default.
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        } catch { }

        function New-Result {
            param([string]$Status, [string]$Reason)
            return [pscustomobject]@{ Pkg = $Pkg; Idx = $Idx; Status = $Status; Reason = $Reason }
        }

        # Entry-by-entry with overwrite: Tizen rootstrap (RS) ZIPs contain
        # case-only-distinct paths (ipt_ttl.h AND ipt_TTL.h) that make the
        # whole-archive extractor abort on case-insensitive NTFS; letting the last
        # of a colliding pair win keeps the package installable. Wrapped in a
        # function so its local $destPath cannot clobber the $DestPath parameter
        # (PowerShell variable names are case-insensitive).
        function Expand-ZipEntryByEntryLocal {
            param([string]$ZipPath, [string]$Destination)
            $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
            try {
                foreach ($entry in $archive.Entries) {
                    if ([string]::IsNullOrEmpty($entry.Name)) { continue }
                    $destPath = Join-Path $Destination $entry.FullName
                    $destDir  = Split-Path -Parent $destPath
                    if ($destDir -and -not (Test-Path $destDir)) {
                        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                    }
                    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
                }
            } finally {
                $archive.Dispose()
            }
        }

        # Newest published <pkg>_<ver>_<os>.zip from the repo's binary/ listing,
        # for the pkg_list-ahead-of-binary (404) fallback. Only used when the
        # caller passed $PkgRepo (tizen-sdk-install).
        function Get-PublishedBinaryLocal {
            param([string]$PkgName, [string]$Os, [string[]]$Cache)
            if (-not $Cache) { return $null }
            $esc = [regex]::Escape($PkgName)
            $osc = [regex]::Escape($Os)
            $pattern = "^${esc}_[^_/]+_${osc}\.zip$"
            $cands = @($Cache | Where-Object { $_ -match $pattern })
            if ($cands.Count -eq 0) { return $null }
            return ($cands | Sort-Object {
                $v = ($_ -replace "^${esc}_", '') -replace "_${osc}\.zip$", ''
                try { [version]$v } catch { [version]'0.0.0' }
            } | Select-Object -Last 1)
        }

        $isOptional = ($OptionalPattern -and $Pkg -imatch $OptionalPattern)

        # --- Download if the prefetch phase did not leave a zip behind -----------
        # .tmp+rename keeps a killed download from leaving a truncated $Zip that a
        # later run would trust; the ZIP validation catches CDN/proxy responses
        # that are 200 but not an archive. Every failure path inside the loop
        # either retries or returns, so the loop only exits via the final break.
        if (-not (Test-Path $Zip)) {
            $maxRetries = 3
            $tmpZip = "$Zip.tmp"
            for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
                $downloadUrl = $Url
                try {
                    $wc = New-Object System.Net.WebClient
                    $wc.DownloadFile($downloadUrl, $tmpZip)
                    $wc.Dispose()
                } catch {
                    Remove-Item -Force $tmpZip -ErrorAction SilentlyContinue
                    $alt = $null
                    $listingOk = $false
                    if ($PkgRepo) {
                        $listingOk = ($null -ne $BinListCache -and @($BinListCache).Count -gt 0)
                        $alt = Get-PublishedBinaryLocal -PkgName $Pkg -Os $PkgOs -Cache $BinListCache
                    }
                    if ($alt -and $alt -ne [System.IO.Path]::GetFileName($Zip)) {
                        # pkg_list version ran ahead of the published binaries:
                        # fall back to the newest build that actually exists.
                        $downloadUrl = "$PkgRepo/binary/$alt"
                        try {
                            $wc = New-Object System.Net.WebClient
                            $wc.DownloadFile($downloadUrl, $tmpZip)
                            $wc.Dispose()
                        } catch {
                            Remove-Item -Force $tmpZip -ErrorAction SilentlyContinue
                            if ($attempt -lt $maxRetries) { Start-Sleep -Seconds (2 * $attempt); continue }
                            return New-Result "FAIL" "Download failed (after $maxRetries attempts): $downloadUrl - $_"
                        }
                    } elseif ($listingOk -and -not $alt) {
                        # No build of this package is published at all - retrying
                        # cannot help (upstream gap). Skip instead of failing the run.
                        return New-Result "SKIP" "not published in the repo (upstream gap), skipped"
                    } else {
                        if ($attempt -lt $maxRetries) { Start-Sleep -Seconds (2 * $attempt); continue }
                        return New-Result "FAIL" "Download failed (after $maxRetries attempts): $Url - $_"
                    }
                }
                try {
                    $validateArchive = [System.IO.Compression.ZipFile]::OpenRead($tmpZip)
                    $validateArchive.Dispose()
                } catch {
                    Remove-Item -Force $tmpZip -ErrorAction SilentlyContinue
                    if ($attempt -lt $maxRetries) { Start-Sleep -Seconds (2 * $attempt); continue }
                    return New-Result "FAIL" "Downloaded file is not a valid ZIP (after $maxRetries attempts): $downloadUrl - $_"
                }
                Move-Item -Force $tmpZip $Zip
                break
            }
        }

        # --- Extract ------------------------------------------------------------
        if (Test-Path $Stage) {
            Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
        }
        New-Item -ItemType Directory -Path $Stage -Force | Out-Null

        try {
            Expand-ZipEntryByEntryLocal -ZipPath $Zip -Destination $Stage
        } catch {
            Remove-Item -Force $Zip -ErrorAction SilentlyContinue
            Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
            if ($isOptional) {
                return New-Result "SKIP" "optional rootstrap (RS), extraction failed: $_"
            }
            return New-Result "FAIL" "Extraction failed: $_"
        }

        # --- Merge data\ into the SDK root ----------------------------------------
        # Serialized across workers via a named mutex: several robocopy processes
        # writing into the SAME destination tree at once transiently fail on
        # shared parent directories (exit 8/11/16). Download and extraction stay
        # parallel; only this copy is one-at-a-time.
        $reason = $null
        $dataDir = Join-Path $Stage "data"
        if (Test-Path $dataDir) {
            $dataItems = Get-ChildItem -Path $dataDir -Force -ErrorAction SilentlyContinue
            if (@($dataItems).Count -gt 0) {
                # windows-64 AND windows-32 (a custom -RepoUrl may only serve the
                # 32-bit pkg_list): robocopy is the long-path-safe fast path on
                # Windows; PowerShell Core on Linux/macOS falls back to Copy-Item.
                if ($PkgOs -like "windows-*") {
                    $mergeMutex = New-Object System.Threading.Mutex($false, $MergeMutexName)
                    $robocopyExit = 0
                    $mergeLogFile = Join-Path $Stage "robocopy_merge.log"
                    try {
                        try {
                            $mergeMutex.WaitOne() | Out-Null
                        } catch [System.Threading.AbandonedMutexException] {
                            # A previous holder was killed (per-package timeout in the
                            # driver) while merging. The mutex IS acquired by us at this
                            # point; the destination tree is still consistent enough for
                            # robocopy's idempotent /XO merge, so carry on.
                        }
                        # /R:5 /W:2 retries transient file locks (antivirus, I/O
                        # contention); the outer loop retries whole-run failures.
                        # /XO skips older files (idempotent re-merge), /FFT uses 2s
                        # FAT timestamp granularity to avoid spurious mismatches.
                        for ($mergeAttempt = 1; $mergeAttempt -le 3; $mergeAttempt++) {
                            robocopy $dataDir $DestPath /E /NFL /NDL /NJH /NJS /NP /R:5 /W:2 /XO /FFT /LOG:$mergeLogFile | Out-Null
                            $robocopyExit = $LASTEXITCODE
                            if ($robocopyExit -lt 8) { break }
                            if ($mergeAttempt -lt 3) { Start-Sleep -Seconds (3 * $mergeAttempt) }
                        }
                    } finally {
                        try { $mergeMutex.ReleaseMutex() } catch { }
                        $mergeMutex.Dispose()
                    }
                    if ($robocopyExit -ge 8) {
                        $mergeDetail = ""
                        if (Test-Path $mergeLogFile) {
                            $mergeDetail = (@(Get-Content $mergeLogFile -ErrorAction SilentlyContinue | Select-Object -Last 5) -join " | ")
                        }
                        Remove-Item -Force $Zip -ErrorAction SilentlyContinue
                        Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
                        return New-Result "FAIL" "Merge failed (robocopy $robocopyExit after 3 attempts): $mergeDetail"
                    }
                } else {
                    Copy-Item -Path "$dataDir/*" -Destination $DestPath -Recurse -Force
                }
            } else {
                $reason = "data\ is empty, skip merge"
            }
        }

        # --- Manifest record ------------------------------------------------------
        $manifest = Join-Path $Stage "pkginfo.manifest"
        $manifestDest = Join-Path $PkgInfoDir "$Pkg.manifest"
        if (Test-Path $manifest) {
            Copy-Item -Path $manifest -Destination $manifestDest -Force
        } elseif ($Version) {
            # No pkginfo.manifest in the zip: record the pkg_list version so the
            # next update-package run can compare against it.
            Set-Content -Path $manifestDest -Value "Package : $Pkg`nVersion : $Version`nOS : $PkgOs`n" -Encoding UTF8
        }

        Remove-Item -Force $Zip -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
        return New-Result "OK" $reason
    }
}

# Runs Get-PackageInstallWorker for every work item with a bounded number of
# concurrent Start-Job workers, logs each outcome as it arrives and returns
#   [pscustomobject]@{ Ok; Skip; Fail; Skipped = @("<pkg> - <reason>", ...) }
#
# Extraction is disk-I/O bound while downloads are latency bound, so -Jobs
# defaults to 3 independently of -DownloadJobs (the value every installer used
# before this driver was shared; it is not exposed through the CLIs).
function Invoke-ParallelPackageInstall {
    param(
        [Parameter(Mandatory=$true)][AllowEmptyCollection()][object[]]$Items,
        [ValidateRange(1,8)][int]$Jobs = 3,
        [Parameter(Mandatory=$true)][string]$PkgInfoDir,
        [Parameter(Mandatory=$true)][string]$DestPath,
        [Parameter(Mandatory=$true)][string]$PkgOs,
        [int]$Total = 0,                 # denominator for "[i/N]" labels; defaults to Items.Count
        [string]$LabelPrefix = "",       # e.g. "IOT " -> "[IOT 3/12]"
        [string]$PkgRepo = "",           # enables the binary/ 404 fallback (tizen-sdk-install)
        [string[]]$BinListCache = @(),   # pre-fetched binary/ listing for that fallback
        [string]$OptionalPattern = "",   # packages matching this are SKIP (not FAIL) on extraction error
        [int]$TimeoutSec = 1800          # per-package cap on download+extract+merge combined
    )
    $summary = [pscustomobject]@{ Ok = 0; Skip = 0; Fail = 0; Skipped = @() }
    if ($Items.Count -eq 0) { return $summary }
    if ($Total -le 0) { $Total = $Items.Count }

    $jobs = $Jobs
    Write-Info "Extracting $($Items.Count) packages ($jobs parallel)..."

    $worker = Get-PackageInstallWorker
    # One mutex name per call, shared by every worker job to serialize the
    # robocopy merge (see the worker).
    $mergeMutexName = "TizenSdkMerge_" + [guid]::NewGuid().ToString("N")

    $pending = [System.Collections.Queue]::new()
    foreach ($item in $Items) { $pending.Enqueue($item) }
    $running = @{}

    while ($pending.Count -gt 0 -or $running.Count -gt 0) {
        while ($pending.Count -gt 0 -and $running.Count -lt $jobs) {
            $item = $pending.Dequeue()
            $version = if ($item.PSObject.Properties['Version']) { $item.Version } else { $null }
            $job = Start-Job -ScriptBlock $worker -ArgumentList `
                $item.Pkg, $item.Idx, $item.Url, $item.Zip, $item.Stage, $version, $PkgInfoDir, $DestPath, $PkgOs, $mergeMutexName, $PkgRepo, $BinListCache, $OptionalPattern
            $running[$job.Id] = [pscustomobject]@{ Job = $job; Item = $item; Start = Get-Date }
        }

        if ($running.Count -eq 0) { break }

        # Short poll so per-job elapsed time is checked even while nothing finishes.
        $done = Wait-Job -Job @($running.Values.Job) -Any -Timeout 5
        if ($done) {
            $entry = $running[$done.Id]
            $item = $entry.Item
            $result = Receive-Job $done -ErrorAction SilentlyContinue
            if (-not $result) { $result = [pscustomobject]@{ Pkg = $item.Pkg; Idx = $item.Idx; Status = "FAIL"; Reason = "Extraction worker produced no result" } }
            Remove-Job $done -Force -ErrorAction SilentlyContinue
            $running.Remove($done.Id)

            $tag = "[{0}{1}/{2}]" -f $LabelPrefix, $result.Idx, $Total
            switch ($result.Status) {
                "OK" {
                    $summary.Ok++
                    if ($result.Reason) { Write-Info "$tag $($result.Pkg): $($result.Reason)" }
                    $label = if ($item.PSObject.Properties['Label'] -and $item.Label) { $item.Label } else { "installed" }
                    Write-Success "$tag $($result.Pkg) $label"
                }
                "SKIP" {
                    $summary.Skip++
                    $summary.Skipped += "$($result.Pkg) - $($result.Reason)"
                    Write-Warn "$tag $($result.Pkg): $($result.Reason)"
                }
                default {
                    $summary.Fail++
                    Write-Err "$tag $($result.Pkg): $($result.Reason)"
                }
            }
        }

        $now = Get-Date
        foreach ($jobId in @($running.Keys)) {
            $entry = $running[$jobId]
            if (($now - $entry.Start).TotalSeconds -le $TimeoutSec) { continue }
            Stop-Job -Job $entry.Job -ErrorAction SilentlyContinue
            Remove-Job -Job $entry.Job -Force -ErrorAction SilentlyContinue
            Remove-Item -Force $entry.Item.Zip -ErrorAction SilentlyContinue
            Remove-Item -Recurse -Force $entry.Item.Stage -ErrorAction SilentlyContinue
            $running.Remove($jobId)
            $summary.Fail++
            Write-Warn ("[{0}{1}/{2}] {3} timed out during extraction/merge after {4}s, dropped" -f $LabelPrefix, $entry.Item.Idx, $Total, $entry.Item.Pkg, $TimeoutSec)
        }
    }
    return $summary
}
