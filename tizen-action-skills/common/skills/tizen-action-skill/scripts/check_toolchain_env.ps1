# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Read-only detection of the Tizen Action toolchain (actionc/action2tidl/tidlc).
# This script NEVER installs anything or modifies environment variables -
# it only reports what it finds and, if something is missing, prints the
# exact command to run yourself.
#
# Besides finding the binaries, it runs actionc on a throwaway action and
# checks the TIDL protocol it produced: a pre-protocol-3 toolchain still
# generates a stub that builds, but the current framework cannot talk to it.

$ok = $true
$bundle = Join-Path $HOME ".action-tools"

function Resolve-Tool($varName, $exeName) {
    $val = [Environment]::GetEnvironmentVariable($varName)
    if (-not [string]::IsNullOrEmpty($val)) { return $val }
    $candidate = Join-Path $bundle $exeName
    if (Test-Path $candidate) { return $candidate }
    $cmd = Get-Command $exeName -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Report-Tool($varName, $exeName) {
    $val = [Environment]::GetEnvironmentVariable($varName)
    if (-not [string]::IsNullOrEmpty($val) -and -not (Test-Path $val)) {
        Write-Host "MISSING `$env:$varName is set to '$val' but that path does not exist"
        $script:ok = $false
        return
    }
    $path = Resolve-Tool $varName $exeName
    if ($path) {
        Write-Host "OK      ${exeName}: $path"
    } else {
        Write-Host "MISSING ${exeName}: not on PATH and `$env:$varName is not set"
        $script:ok = $false
    }
}

Write-Host "== Toolchain binaries =="
$actionc = Get-Command "actionc" -ErrorAction SilentlyContinue
if ($actionc) {
    $version = (& $actionc.Source -v 2>$null | Select-Object -First 1)
    Write-Host "OK      actionc: $($actionc.Source) ($version)"
} else {
    Write-Host "MISSING actionc is not on PATH"
    $ok = $false
}
Report-Tool "ACTIONC_ACTION2TIDL" "action2tidl.exe"
Report-Tool "ACTIONC_TIDLC" "tidlc.exe"

Write-Host ""
Write-Host "== Action/entity data =="
$dataDir = [Environment]::GetEnvironmentVariable("ACTIONC_DATA_DIR")
if ([string]::IsNullOrEmpty($dataDir)) { $dataDir = Join-Path $bundle "data" }
if ((Test-Path (Join-Path $dataDir "actions")) -and (Test-Path (Join-Path $dataDir "entities"))) {
    Write-Host "OK      data dir: $dataDir"
    if (-not (Test-Path (Join-Path $dataDir "action.seq"))) {
        Write-Host "WARN    no action.seq in the data dir: method ids of default"
        Write-Host "        categories may not match the device"
    }
} else {
    Write-Host "MISSING data dir '$dataDir' has no actions\ and entities\"
    Write-Host "        (set `$env:ACTIONC_DATA_DIR, e.g. to a tizen-action default-actions\)"
    $ok = $false
}

Write-Host ""
Write-Host "== Generation probe (actionc -> action2tidl -> tidlc) =="
if ($actionc) {
    $probeDir = Join-Path ([IO.Path]::GetTempPath()) ("action-probe-" + [Guid]::NewGuid())
    New-Item -ItemType Directory -Force -Path (Join-Path $probeDir "data\actions") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $probeDir "data\entities") | Out-Null
    $probeFile = Join-Path $probeDir "Probe_Probe.Action.Probe_Run.action"
    Set-Content -Path $probeFile -Encoding ASCII -Value ('{"version":"v2","name":"Probe_Probe.Action.Probe_Run",' +
        '"type":"tidl","category":"Probe.Action.Probe","description":"probe",' +
        '"inputSchema":{"type":"object","properties":{}},' +
        '"outputSchema":{"type":"object","properties":{"ok":{"type":"boolean","description":"ok"}}},' +
        '"details":{"appid":"probe"}}')
    Push-Location $probeDir
    $log = & $actionc.Source -d (Join-Path $probeDir "data") -i $probeFile -l "C++" -o (Join-Path $probeDir "out") --keep-temp 2>&1 | ForEach-Object { "$_" }
    $status = $LASTEXITCODE
    Pop-Location
    $kept = ($log | Select-String -Pattern '^\[actionc\] intermediate files kept in (.*)$' |
        Select-Object -Last 1 | ForEach-Object { $_.Matches[0].Groups[1].Value })
    $protocol = ""
    if ($kept -and (Test-Path (Join-Path $kept "Probe.Action.Probe.tidl"))) {
        $protocol = Get-Content (Join-Path $kept "Probe.Action.Probe.tidl") -TotalCount 1
    }
    if ($protocol -match '^protocol [0-2]\b') {
        Write-Host "OUTDATED action2tidl emits '$protocol'; the framework needs"
        Write-Host "        protocol 3. Update the toolchain before generating stubs."
        $ok = $false
    }
    if ($status -eq 0 -and $ok) {
        Write-Host "OK      actionc generated a stub ($protocol)"
    } elseif ($status -ne 0) {
        Write-Host "FAILED  actionc could not generate a probe stub:"
        $log | Where-Object { $_ -notmatch '^Wrote ' } | Select-Object -Last 4 |
            ForEach-Object { Write-Host "        $_" }
        Write-Host "        A mix of toolchain releases is the usual cause; point"
        Write-Host "        ACTIONC_ACTION2TIDL/ACTIONC_TIDLC at the binaries shipped"
        Write-Host "        with this actionc."
        $ok = $false
    }
    if ($kept) { Remove-Item -Recurse -Force $kept -ErrorAction SilentlyContinue }
    Remove-Item -Recurse -Force $probeDir -ErrorAction SilentlyContinue
} else {
    Write-Host "SKIP    actionc not found"
}

Write-Host ""
if ($ok) {
    Write-Host "Toolchain looks fully set up."
    Write-Host "Run scripts\list_categories.ps1 to see the default action categories"
    Write-Host "installed in the data dir."
    exit 0
}

Write-Host "Toolchain is not fully set up."
Write-Host ""
Write-Host "This script will NOT install anything for you -- installing the toolchain"
Write-Host "persistently modifies your Windows user environment variables, which only"
Write-Host "you should do."
Write-Host ""
Write-Host "To set it up, either:"
Write-Host "  - run the Tizen Action toolchain bundle's install.bat yourself, then"
Write-Host "    restart your shell"
Write-Host "  - or build it from the platform/core/appfw/tidl repository"
Write-Host "    (tools/action-toolchain), put actionc/action2tidl/tidlc on PATH, and"
Write-Host "    set ACTIONC_DATA_DIR to <tizen-action>\default-actions"
exit 1
