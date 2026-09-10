#Requires -Version 5.0
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# t-cli.ps1 - unified convenience CLI for the Tizen SDK agent scripts (Windows).
#
# A thin dispatcher: it maps an action to the matching script under scripts\<name>\
# and forwards the remaining arguments verbatim.
# It does NOT reimplement any logic - the real work stays in the per-feature scripts.
#
# Usage:
#   t-cli <action> [options...]
#   t-cli build -w C:\path\to\project -b Debug
#   t-cli create -Type native -Template ServiceApp -Name MyApp
#   t-cli --help

param(
    [Parameter(Position = 0)]
    [string]$Action,
    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"

$dir = $PSScriptRoot
if (-not $dir) { $dir = Split-Path -Parent $MyInvocation.MyCommand.Path }

function Show-Help {
    Write-Host ""
    Write-Host "t-cli - Tizen SDK helper CLI (wraps the per-feature scripts)"
    Write-Host ""
    Write-Host "Usage: t-cli <action> [options]"
    Write-Host ""
    Write-Host "Actions:"
    Write-Host "  install         Install the Tizen SDK + platform packages"
    Write-Host "  update-package  Update installed Tizen SDK packages"
    Write-Host "  dotnet-setup    Verify the .NET SDK and install the Tizen workload"
    Write-Host "  create          Create a Tizen project (native / dotnet / webapp)"
    Write-Host "  build           Build + package a project      (e.g. -w <dir> -b Debug)"
    Write-Host "  device          Find a device or launch an emulator"
    Write-Host "  app-install     Install a .tpk / .wgt package  (e.g. -PackagePath <path>)"
    Write-Host "  debug           Remote GDB debug a native app"
    Write-Host "  screenshot      Capture a screenshot from emulator/device"

    Write-Host ""
    Write-Host "Run 't-cli <action> -Help' for action-specific options (forwarded to the script)."
    Write-Host ""
}

if (-not $Action -or @('-h', '--help', 'help', '-Help') -contains $Action) {
    Show-Help
    exit 0
}

# action -> relative script path under $dir
$map = @{
    'install'        = 'tizen-sdk-install\tizen-sdk-install.ps1'
    'update-package' = 'tizen-update-package\tizen-update-package.ps1'
    'dotnet-setup'   = 'tizen-dotnet-setup\tizen-dotnet-setup.ps1'
    'create'       = 'tizen-create-project\tizen-create-project.ps1'
    'build'        = 'tizen-build-project\tizen-build-project.ps1'
    'device'       = 'tizen-device-manager\tizen-device-manager.ps1'
    'app-install'  = 'tizen-install-app\tizen-install-app.ps1'
    'debug'        = 'tizen-gdb-debug\tizen-native-gdb-debug.ps1'
    'screenshot'   = 'tizen-screenshot\tizen-screenshot.ps1'
}


if ($map.ContainsKey($Action)) {
    $target = Join-Path $dir $map[$Action]
    if (-not (Test-Path $target)) {
        Write-Host "t-cli: script not found: $target"
        exit 1
    }
    & powershell -ExecutionPolicy Bypass -File $target @Rest
    exit $LASTEXITCODE
}
else {
    Write-Host "t-cli: unknown action '$Action'"
    Show-Help
    exit 1
}
