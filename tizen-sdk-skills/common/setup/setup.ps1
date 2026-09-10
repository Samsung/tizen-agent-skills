#requires -Version 5.1
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

<#
.SYNOPSIS
    tizen-sdk-skills setup and sync - one script for every harness.

.DESCRIPTION
    The per-harness entry points (claude\setup\setup.ps1, cline\setup\setup.ps1,
    codex\setup\setup.ps1, gemini\setup\setup.ps1) are thin wrappers around this.

    Flow (host-specific parts come from common\setup\hosts\<harness>.ps1):
      1. Path validation
      2. Plugin cache sync   repo\common\* -> ~\<dot>\plugins\cache\tizen-platform\tizen-sdk-skills\<VER>\
      3. Personal copy sync  skills -> the host's skills dir; agents -> host format
      4. Host extras         hooks / rules / instruction files
      5. Validation
      6. Summary

.PARAMETER Harness
    claude | cline | codex | gemini

.PARAMETER RepoPath
    Path to the tizen-sdk-skills repo (default: resolved from this script's location)

.PARAMETER SkipValidation
    Skip the validation step

.PARAMETER NoRestart
    Hide the post-install notes

.EXAMPLE
    .\setup.ps1 -Harness gemini
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("claude", "cline", "codex", "gemini")]
    [string]$Harness,
    [string]$RepoPath = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [switch]$SkipValidation,
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "setup-lib.ps1")

try {
    if (-not (Test-Path $RepoPath)) { throw "Repository path not found: $RepoPath" }
    # Absolute path: Compare-Directories and the printed snippets rely on it.
    $RepoPath = (Resolve-Path $RepoPath).Path

    # Host module - defines Initialize-HostConfig, Install-HostExtras,
    # Test-HostExtras, Write-HostSummary, Write-HostNotes.
    . (Join-Path $PSScriptRoot "hosts\$Harness.ps1")
    Initialize-HostConfig

    Write-Banner "tizen-sdk-skills $script:HostLabel Setup and Sync"

    Write-Step 1 "Path validation"
    Write-Status "Repository: $RepoPath" "Info"
    Write-Status "$script:HostLabel user path: $script:HostHome" "Info"
    $pluginVersion = Read-PluginVersion $RepoPath
    Write-Status "Plugin version: $pluginVersion" "Info"
    $cacheBase = Join-Path $script:HostHome "$script:CacheTail\$pluginVersion"

    Write-Step 2 "Plugin cache sync"
    if (-not (Test-Path $cacheBase)) { Write-Status "Cache directory not found. Creating: $cacheBase" "Warning" }
    Sync-Cache $RepoPath $cacheBase $script:CacheSubDirs
    # The runner lookup only scans the current plugin name; a cache left by a
    # pre-rename install is dead weight (and a stale copy of the scripts).
    foreach ($legacy in $script:LegacyPluginNames) {
        Remove-LegacyPath (Join-Path $script:HostHome "plugins\cache\tizen-platform\$legacy") "plugin cache"
    }

    Write-Step 3 "Personal copy sync (actual loading paths)"
    if ($script:SkillsDir) {
        Sync-PersonalSkills (Join-Path $script:CommonDir "skills") $script:SkillsDir "Skill ($script:HostLabel)"
    } else {
        Write-Status "$script:HostLabel loads skills from the cache - no personal copy" "Info"
    }
    if ($script:AgentsMode -ne "none") {
        Sync-Agents $script:AgentsMode (Join-Path $script:CommonDir "agents") $script:AgentsDir
    } else {
        Write-Status "$script:HostLabel has no file-based subagents - agents\ not installed" "Info"
    }

    Write-Step 4 "$script:HostLabel hooks / instructions"
    Install-HostExtras

    if (-not $SkipValidation) {
        Write-Step 5 "Validation"
        Test-CacheSync $RepoPath $cacheBase $script:CacheSubDirs
        if ($script:SkillsDir) { Test-PersonalSkills (Join-Path $script:CommonDir "skills") $script:SkillsDir "Skill ($script:HostLabel)" }
        if ($script:AgentsMode -ne "none") {
            $srcCount = @(Get-ChildItem (Join-Path $script:CommonDir "agents") -Filter "*.md" -File).Count
            $dstCount = @(Get-ChildItem $script:AgentsDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "tizen-*.md" -or $_.Name -like "tizen-*.toml" }).Count
            if ($srcCount -eq $dstCount) { Write-Status "Agents ($script:AgentsMode): $dstCount/$srcCount installed" "Success" }
            else { Write-Status "Agents ($script:AgentsMode): $dstCount of $srcCount installed in $script:AgentsDir" "Warning" }
        }
        Test-HostExtras
        Write-Host "`nValidation complete" -ForegroundColor Green
    }

    Write-Step 6 "Summary"
    Write-Host "=== Installation complete ===" -ForegroundColor Green
    Write-Status "Plugin cache: $cacheBase" "Info"
    if ($script:SkillsDir) { Write-Status "Skills: $script:SkillsDir" "Info" }
    if ($script:AgentsMode -ne "none") { Write-Status "Agents ($script:AgentsMode): $script:AgentsDir" "Info" }
    Write-HostSummary

    if (-not $NoRestart) {
        Write-Host "`nNOTE:" -ForegroundColor Yellow
        Write-HostNotes
    }
    Write-Host ""
}
catch {
    Write-Status "Error: $_" "Error"
    exit 1
}
