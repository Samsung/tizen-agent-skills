#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-webapp-debug.ps1
#
# Remote debugging setup for Tizen Web apps (.wgt) via RWI (Remote Web Inspector)
# (Windows PowerShell). Web apps run inside the web runtime, which embeds a
# Chromium-based engine - so debugging means talking CDP (Chrome DevTools
# Protocol), not gdb/netcoredbg:
#   1. launch the app in web-debug mode (`app_launcher -w -s`) → the runtime opens
#      an RWI server on a device-side port and prints it
#   2. forward a host port to that device port (`sdb forward`)
#   3. verify the CDP endpoint answers /json/version and /json/list
# The caller (or the user) then connects any CDP client - Chrome DevTools,
# `chromium.connectOverCDP()` in Playwright, chrome://inspect, ...
#
# Inherently setup-only: the RWI session and the port forward stay alive after
# this script exits (forward rules live in the host sdb server daemon).
#
# Usage:
#   .\tizen-webapp-debug.ps1 -App <APP_ID> [-Port 9222] [-Serial <serial>] [-Timeout 30]

param(
    # Short aliases (-a/-p/-s/-t) match the bash script's flags and the docs.
    [Parameter(Mandatory=$false)][Alias('a')][string]$App,
    [Parameter(Mandatory=$false)][Alias('p')][int]$Port = 9222,
    [Parameter(Mandatory=$false)][Alias('s')][string]$Serial = "",
    [Parameter(Mandatory=$false)][Alias('t')][int]$Timeout = 30,
    [switch]$Help
)

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

function Show-Usage {
    Write-Host @"
Usage: .\tizen-webapp-debug.ps1 -App <APP_ID> [OPTIONS]

Required:
  -App <APP_ID>      App ID of the Web app to debug (e.g. abcDEF1234.MyWebApp)

Optional:
  -Port <PORT>       Host port to forward to the device RWI port (default: 9222)
  -Serial <SERIAL>   Device serial (default: first connected device)
  -Timeout <SEC>     CDP endpoint readiness timeout in seconds (default: 30)
  -Help              Show this help

Example:
  .\tizen-webapp-debug.ps1 -App abcDEF1234.MyWebApp -Port 9222
"@
}

# ---------------------------------------------------------------------------
# Helpers  (Invoke-SdbLine — one-line `sdb shell` on $Sdb/$Serial — comes from
# lib\common.ps1)
# ---------------------------------------------------------------------------

# Fetch a CDP endpoint path; returns the body string or $null.
# Prefer curl.exe (ships with Windows 10+); fall back to Invoke-WebRequest.
function Get-CdpBody {
    param([string]$UrlPath)
    $url = "http://127.0.0.1:$Port$UrlPath"
    $curlExe = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curlExe) {
        $body = & $curlExe.Source -s --max-time 2 $url 2>$null
        if ($LASTEXITCODE -eq 0 -and $body) { return ($body -join "`n") }
        return $null
    }
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $resp.Content
    } catch { return $null }
}

# ---------------------------------------------------------------------------
# Help & validation
# ---------------------------------------------------------------------------
if ($Help) { Show-Usage; exit 0 }
if (-not $App) { Write-Err "Application ID is required (-App)"; exit 1 }

# The app id is spliced into `sdb shell "..."` strings - reject anything beyond
# the characters a real app id uses.
if ($App -notmatch '^[A-Za-z0-9._-]+$') { Write-Err "Invalid app ID: $App"; exit 1 }

# ---------------------------------------------------------------------------
# Resolve sdb from the SDK (tools\sdb.exe), so it works when sdb is not on PATH.
# ---------------------------------------------------------------------------
$Sdb = Find-TizenTool "sdb"
if (-not $Sdb) { exit 1 }
Write-Info "Using sdb: $Sdb"

# ---------------------------------------------------------------------------
# Step 1: Check device connection
# ---------------------------------------------------------------------------
Write-Step "1/5 Checking device connection..."
if (-not $Serial) { $Serial = Get-DeviceSerial $Sdb }
if (-not $Serial) {
    Write-Host "No devices found. Device manager will be invoked to create/launch an emulator." -ForegroundColor Yellow
    exit 1  # Signal caller to invoke device manager
}
Write-Info "Target device: $Serial"
& $Sdb devices

# ---------------------------------------------------------------------------
# Refuse non-Web apps: only a .wgt runs inside the web runtime, so only a .wgt
# has an RWI server to expose. A wgt app id is "<pkgid>.<name>" - look the pkgid
# up in the device package list and bail out unless its type is wgt.
# (Inverse of the guard in tizen-gdb-debug / tizen-dotnet-debug.)
# ---------------------------------------------------------------------------
$pkgIdCandidate = $App.Split('.')[0]
$isWgt = $false
$pkgLines = & $Sdb -s $Serial shell "pkgcmd -l" 2>$null
foreach ($line in @($pkgLines)) {
    if ("$line" -match '\[wgt\]' -and "$line".Contains("[$pkgIdCandidate]")) { $isWgt = $true; break }
}
if (-not $isWgt) {
    Write-Err "'$App' is not a Web app (wgt) - RWI/CDP debugging only works for Web apps."
    Write-Info "For Native (.tpk C/C++) apps use the tizen-gdb-debug skill; for .NET apps use tizen-dotnet-debug."
    Write-Info "If the app is simply not installed yet, install it first with the tizen-install-app skill."
    exit 1
}

# ---------------------------------------------------------------------------
# Step 2: Launch the app in web-debug mode and parse the RWI port
# ---------------------------------------------------------------------------
Write-Step "2/5 Launching app with Remote Web Inspector..."
$rwiPort = $null
$appPid  = $null
for ($attempt = 1; $attempt -le 3; $attempt++) {
    # -w only takes effect at launch time - a running instance keeps its old
    # (non-debug) state, so terminate it first.
    Invoke-SdbLine "app_launcher -t $App 2>/dev/null || app_launcher -k $App 2>/dev/null" | Out-Null
    Start-Sleep -Seconds 2
    $launchOut = (& $Sdb -s $Serial shell "app_launcher -w -s $App" 2>$null) -join "`n"
    foreach ($line in ($launchOut -split "`n")) { Write-Host "    $line" }
    if ($launchOut -match 'port[: ]+(\d+)') { $rwiPort = $Matches[1] }
    if ($launchOut -match 'pid[ =:]+(\d+)') { $appPid  = $Matches[1] }
    if ($rwiPort) { break }
    Write-Warn "Attempt $attempt/3: no RWI port in launch output - retrying..."
}

if (-not $rwiPort) {
    Write-Err "No RWI port in app_launcher output after 3 attempts."
    Write-Info "The image may not support RWI (emulator/dev images do), or the app failed to enter debug launch."
    Write-Info "Check that the app is installed (pkgcmd -l) and launchable (app_launcher -s $App)."
    exit 1
}
Write-Info "RWI server is listening on device port $rwiPort"
if ($appPid) { Write-Output "App PID: $appPid" }
Write-Output "RWI device port: $rwiPort"

# ---------------------------------------------------------------------------
# Step 3: Forward the host port to the device RWI port
# ---------------------------------------------------------------------------
Write-Step "3/5 Forwarding host port $Port -> device port $rwiPort..."
# Drop a stale rule on the same host port first (ignore failure: none may exist).
& $Sdb -s $Serial forward --remove "tcp:$Port" 2>$null | Out-Null
& $Sdb -s $Serial forward "tcp:$Port" "tcp:$rwiPort"
if ($LASTEXITCODE -ne 0) {
    Write-Err "Port forward failed (tcp:$Port -> tcp:$rwiPort)."
    Write-Info "The host port may be in use - retry with a different -Port."
    exit 1
}
Write-Output "Forwarded: tcp:$Port -> tcp:$rwiPort"

# ---------------------------------------------------------------------------
# Step 4: Verify the CDP endpoint
# ---------------------------------------------------------------------------
Write-Step "4/5 Verifying CDP endpoint (timeout ${Timeout}s)..."
$versionJson = $null
for ($elapsed = 0; $elapsed -lt $Timeout; $elapsed++) {
    $versionJson = Get-CdpBody "/json/version"
    if ($versionJson) { break }
    Start-Sleep -Seconds 1
}
if (-not $versionJson) {
    Write-Err "CDP endpoint not reachable: http://127.0.0.1:$Port/json/version gave no answer within ${Timeout}s."
    Write-Info "The forward is in place but the RWI server did not respond - relaunch and retry, or try a longer -Timeout."
    exit 1
}
$pagesJson = Get-CdpBody "/json/list"
if (-not $pagesJson) {
    # Some runtimes only expose /json (an alias of /json/list).
    $pagesJson = Get-CdpBody "/json"
}

# ---------------------------------------------------------------------------
# Step 5: Done - emit the machine-readable markers. Everything stays running.
# ---------------------------------------------------------------------------
Write-Step "5/5 CDP endpoint is live"
Write-Output "CDP endpoint: http://127.0.0.1:$Port"
Write-Output "CDP_VERSION_JSON_BEGIN"
Write-Output $versionJson
Write-Output "CDP_VERSION_JSON_END"
if ($pagesJson) {
    Write-Output "CDP_PAGES_JSON_BEGIN"
    Write-Output $pagesJson
    Write-Output "CDP_PAGES_JSON_END"
} else {
    Write-Warn "Could not fetch the inspectable page list (/json/list) - the endpoint is up, connect a client directly."
}
Write-Host ""
Write-Success "Web app is running with RWI; CDP is reachable at http://127.0.0.1:$Port"
Write-Info "Connect with Playwright:  const browser = await chromium.connectOverCDP('http://127.0.0.1:$Port');"
Write-Info "Or open a page's devtoolsFrontendUrl from /json/list in Chrome, or use chrome://inspect with 127.0.0.1:$Port."
Write-Info "(The RWI session and the port forward stay alive after this script exits.)"
