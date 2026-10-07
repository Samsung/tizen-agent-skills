# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Lists the default action categories actually installed in this developer's
# toolchain, read live from $env:ACTIONC_DATA_DIR\actions (and the entity
# types in \entities) -- instead of a static, easily stale doc.
#
# Usage:
#   ./list_categories.ps1                 # list every category + its methods
#   ./list_categories.ps1 Browser          # filter by substring (case-insensitive)
#   ./list_categories.ps1 -Entities        # list installed .entity types instead

param(
    [string]$Filter = "",
    [switch]$Entities
)

$dataDir = [Environment]::GetEnvironmentVariable("ACTIONC_DATA_DIR")
if ([string]::IsNullOrEmpty($dataDir)) {
    $dataDir = Join-Path $HOME ".action-tools\data"
}

if (-not (Test-Path $dataDir)) {
    Write-Error "data dir '$dataDir' does not exist. Either `$env:ACTIONC_DATA_DIR is wrong, or the toolchain isn't installed -- run ./check_toolchain_env.ps1 first."
    exit 1
}

if ($Entities) {
    $entitiesDir = Join-Path $dataDir "entities"
    if (-not (Test-Path $entitiesDir)) {
        Write-Error "no entities\ dir under '$dataDir'"
        exit 1
    }
    Write-Host "== Entity types in $entitiesDir =="
    Get-ChildItem -Path $entitiesDir -Filter "*.entity" |
        ForEach-Object { $_.BaseName } |
        Sort-Object
    exit 0
}

$actionsDir = Join-Path $dataDir "actions"
if (-not (Test-Path $actionsDir)) {
    Write-Error "no actions\ dir under '$dataDir'"
    exit 1
}

Write-Host "== Default categories in $actionsDir =="
$methodsByCategory = @{}

Get-ChildItem -Path $actionsDir -Filter "*.action" | ForEach-Object {
    $base = $_.BaseName
    # filename convention: <Prefix>_<Category>_<Method>.action, e.g.
    # Tv_Tizen.Action.Browser_OpenPage -> category=Tizen.Action.Browser method=OpenPage
    $parts = $base.Split('_')
    if ($parts.Length -lt 3) { return }
    $category = ($parts[1..($parts.Length - 2)] -join '_')
    $method = $parts[$parts.Length - 1]

    if ($Filter -and ($category -notlike "*$Filter*")) { return }

    if ($methodsByCategory.ContainsKey($category)) {
        $methodsByCategory[$category] += ", $method"
    } else {
        $methodsByCategory[$category] = $method
    }
}

if ($methodsByCategory.Count -eq 0) {
    Write-Host "(no categories matched$(if ($Filter) { " '$Filter'" }))"
    exit 0
}

$methodsByCategory.Keys | Sort-Object | ForEach-Object {
    Write-Host "  $_`: $($methodsByCategory[$_])"
}
