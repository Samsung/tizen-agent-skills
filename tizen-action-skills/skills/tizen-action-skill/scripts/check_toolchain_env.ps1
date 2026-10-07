# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Read-only detection of the Tizen Action toolchain (actionc/action2tidl/tidlc).
# This script NEVER installs anything or modifies environment variables —
# it only reports what it finds and, if something is missing, prints the
# exact command to run yourself.

$ok = $true

function Check-Bin($name) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "OK      $name found on PATH: $($cmd.Source)"
    } else {
        Write-Host "MISSING $name is not on PATH"
        $script:ok = $false
    }
}

function Check-Env($varName, $default) {
    $val = [Environment]::GetEnvironmentVariable($varName)
    if ([string]::IsNullOrEmpty($val) -and $default) {
        if (Test-Path $default) {
            Write-Host "OK      `$env:$varName is not set, but its default location exists: $default"
            return
        }
        Write-Host "MISSING `$env:$varName is not set, and its default location doesn't exist either: $default"
        $script:ok = $false
        return
    }
    if ([string]::IsNullOrEmpty($val)) {
        Write-Host "MISSING `$env:$varName is not set"
        $script:ok = $false
    } elseif (-not (Test-Path $val)) {
        Write-Host "MISSING `$env:$varName is set to '$val' but that path does not exist"
        $script:ok = $false
    } else {
        Write-Host "OK      `$env:$varName = $val"
    }
}

Write-Host "== Binaries on PATH =="
Check-Bin "actionc"
Check-Bin "action2tidl"
Check-Bin "tidlc"

Write-Host ""
Write-Host "== Environment variables (each falls back to a default under `$HOME\.action-tools if unset) =="
Check-Env "ACTIONC_DATA_DIR" (Join-Path $HOME ".action-tools\data")
Check-Env "ACTIONC_ACTION2TIDL" (Join-Path $HOME ".action-tools\action2tidl.exe")
Check-Env "ACTIONC_TIDLC" (Join-Path $HOME ".action-tools\tidlc.exe")

Write-Host ""
if ($ok) {
    Write-Host "Toolchain looks fully set up."
    Write-Host "Run ./list_categories.ps1 to see the default action categories actually"
    Write-Host "installed on this machine (read live from `$env:ACTIONC_DATA_DIR)."
    exit 0
} else {
    Write-Host "Toolchain is not fully set up."
    Write-Host ""
    Write-Host "This script will NOT install anything for you -- installing the toolchain"
    Write-Host "persistently modifies your shell profile (~/.bashrc, ~/.profile) or Windows"
    Write-Host "user environment variables, which only you should do."
    Write-Host ""
    Write-Host "To install (from the TizenActionToolchain repo):"
    Write-Host "  Linux:   ./install.sh   then   source ~/.bashrc"
    Write-Host "  Windows: run install.bat, then restart your shell"
    exit 1
}
