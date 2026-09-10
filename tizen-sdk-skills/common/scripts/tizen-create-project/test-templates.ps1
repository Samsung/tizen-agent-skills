# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Test template discovery
$sdkRoot = if ($env:TIZEN_SDK_PATH) { $env:TIZEN_SDK_PATH } else { "$env:USERPROFILE\tizen-sdk" }
$templatesBase = "$sdkRoot\tools\tizen-core\templates"

Write-Host '=== Native Templates ===' -ForegroundColor Cyan
Get-ChildItem "$templatesBase\native" -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
if (-not $?) { Write-Host "(No native templates found)" -ForegroundColor Gray }

Write-Host "`n=== DotNET Templates ===" -ForegroundColor Cyan
Get-ChildItem "$templatesBase\dotnet" -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
if (-not $?) { Write-Host "(No dotnet templates found)" -ForegroundColor Gray }

Write-Host "`n=== WebApp Templates ===" -ForegroundColor Cyan
Get-ChildItem "$templatesBase\web" -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
if (-not $?) { Write-Host "(No web templates found)" -ForegroundColor Gray }
