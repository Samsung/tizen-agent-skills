# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# setup-lib.ps1 - shared helpers for the per-harness setup scripts.
#
# Dot-sourced by common\setup\setup.ps1 (not meant to be run directly).
# Mirrors setup-lib.sh; keep the two in step.

# UTF-8 console + chcp 65001 so Korean output survives capture.
. (Join-Path $PSScriptRoot "..\scripts\lib\common.ps1")

$script:CommonDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:PluginName = "tizen-sdk-skills"
$script:CacheTail = "plugins\cache\tizen-platform\$script:PluginName"
# Ids earlier releases used for the same directories and markers (the plugin
# shipped as tizen-sdk-agents from the tizen-ai-plugins monorepo). Recognised so
# an update replaces the previous install instead of leaving it beside the new
# one; never written again. See setup-lib.sh; keep the two in step.
$script:LegacyPluginNames = @("tizen-sdk-agents")
# Regex matching any id that marks a file as ours.
$script:MarkerRegex = (@($script:PluginName) + $script:LegacyPluginNames | ForEach-Object { [regex]::Escape($_) }) -join "|"

# Remove a directory or file a previous release wrote under a name we no longer
# use. Namespaced to the plugin, so nothing of the user's lives inside.
function Remove-LegacyPath {
    param([string]$Target, [string]$Label)
    if (-not (Test-Path $Target)) { return }
    Remove-Item $Target -Recurse -Force
    Write-Status "Removed legacy $Label`: $Target" "Success"
}

# $HOME is defined on every PowerShell platform; $env:USERPROFILE is Windows-only
# (empty under pwsh on macOS/Linux) - prefer $HOME.
$script:UserHome = if ($HOME) { $HOME } elseif ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }

# ----------------------------------------------------------------------------
# Output
# ----------------------------------------------------------------------------
function Write-Status {
    param([string]$Message, [ValidateSet("Info", "Success", "Warning", "Error")][string]$Type = "Info")
    $colors = @{ Info = "Cyan"; Success = "Green"; Warning = "Yellow"; Error = "Red" }
    Write-Host "[$Type] " -NoNewline -ForegroundColor $colors[$Type]
    Write-Host $Message
}
function Write-Step { param([int]$N, [string]$Title) Write-Host "`n[Step $N] $Title" -ForegroundColor Cyan }
function Write-Banner { param([string]$Title) Write-Host "`n=== $Title ===" -ForegroundColor Cyan }

# ----------------------------------------------------------------------------
# Version / OS
# ----------------------------------------------------------------------------
function Read-PluginVersion {
    param([string]$RepoPath)
    $json = Join-Path $RepoPath "common\.claude-plugin\plugin.json"
    if (-not (Test-Path $json)) { throw "plugin.json not found: $json" }
    $v = (Get-Content $json -Raw | ConvertFrom-Json).version
    if (-not $v) { throw "No version field in $json" }
    return $v
}

# tools/ tree naming: windows | macos | linux
function Get-ToolsOs {
    if ($env:OS -eq "Windows_NT" -or [Environment]::OSVersion.Platform -eq "Win32NT") { return "windows" }
    if ($IsMacOS) { return "macos" }
    return "linux"
}

# ----------------------------------------------------------------------------
# Copy / compare
# ----------------------------------------------------------------------------
# Mirror-style copy: with -Clean, stale files in the destination are removed first.
function Copy-FilesRecursive {
    param([string]$Source, [string]$Destination, [string]$Label, [switch]$Clean)
    if (-not (Test-Path $Source)) { Write-Status "Source not found: $Source" "Warning"; return }
    if ($Clean -and (Test-Path $Destination)) { Remove-Item -Path $Destination -Recurse -Force }
    New-Item -ItemType Directory -Force $Destination | Out-Null
    Copy-Item -Path "$Source\*" -Destination $Destination -Recurse -Force
    Write-Status "$Label copy complete: $Source -> $Destination" "Success"
}

# Relative-path + size comparison (a renamed file no longer passes as "same count").
#
# Relative paths come from [IO.Directory]::GetFiles, which returns each path
# prefixed with the EXACT root string it was given. Get-ChildItem's FullName
# does not: it normalises 8.3 short names (C:\Users\JOHNDO~1 -> ...\john.doe),
# so a Substring($root.Length) against a short-form root is off by a few
# characters and every file shows up as both "only in source" and "only in target".
function Get-RelativeFileSizes {
    param([string]$Root)
    $root = $Root.TrimEnd('\')
    $map = @{}
    foreach ($p in [IO.Directory]::GetFiles($root, '*', [IO.SearchOption]::AllDirectories)) {
        $map[$p.Substring($root.Length + 1)] = (New-Object IO.FileInfo $p).Length
    }
    return $map
}

function Compare-Directories {
    param([string]$Source, [string]$Target, [string]$Label)
    if (-not (Test-Path $Source)) { Write-Status "$Label : source missing - $Source" "Warning"; return }
    if (-not (Test-Path $Target)) { Write-Status "$Label : target missing - $Target" "Warning"; return }
    $index = Get-RelativeFileSizes (Resolve-Path $Source).Path
    $targetFiles = Get-RelativeFileSizes (Resolve-Path $Target).Path
    $diffs = New-Object System.Collections.Generic.List[string]
    foreach ($rel in $targetFiles.Keys) {
        if (-not $index.ContainsKey($rel)) { $diffs.Add("only in target: $rel"); continue }
        if ($index[$rel] -ne $targetFiles[$rel]) { $diffs.Add("size differs: $rel") }
        $index.Remove($rel)
    }
    foreach ($rel in $index.Keys) { $diffs.Add("only in source: $rel") }
    if ($diffs.Count -eq 0) { Write-Status "$Label : Validation passed" "Success"; return }
    Write-Status "$Label : Differences found ($($diffs.Count))" "Warning"
    $diffs | Select-Object -First 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
}

# Copy a bash script for a hook host: strip CR (CRLF checkouts break the shebang)
# and write UTF-8 WITHOUT BOM (PowerShell 5.1's -Encoding utf8 adds one, which
# bash then chokes on).
function Install-ShellScript {
    param([string]$Source, [string]$Destination)
    New-Item -ItemType Directory -Force (Split-Path $Destination -Parent) | Out-Null
    $text = (Get-Content $Source -Raw) -replace "`r", ""
    [IO.File]::WriteAllText($Destination, $text, (New-Object System.Text.UTF8Encoding $false))
}

# ----------------------------------------------------------------------------
# Cache / personal sync
# ----------------------------------------------------------------------------
function Sync-Cache {
    param([string]$RepoPath, [string]$CacheBase, [string[]]$SubDirs)
    New-Item -ItemType Directory -Force $CacheBase | Out-Null
    foreach ($sub in $SubDirs) {
        $label = $sub.Substring(0, 1).ToUpper() + $sub.Substring(1)
        Copy-FilesRecursive (Join-Path $script:CommonDir $sub) (Join-Path $CacheBase $sub) $label -Clean
    }
    $os = Get-ToolsOs
    $toolsSrc = Join-Path $script:CommonDir "tools\tizen-dlog-analyzer\$os"
    $toolsDst = Join-Path $CacheBase "tools\tizen-dlog-analyzer"
    New-Item -ItemType Directory -Force $toolsDst | Out-Null
    if (Test-Path $toolsSrc) {
        if (Test-Path (Join-Path $toolsDst $os)) { Remove-Item (Join-Path $toolsDst $os) -Recurse -Force }
        Copy-Item -Path $toolsSrc -Destination $toolsDst -Recurse -Force
        Write-Status "Tools ($os) copy complete: $toolsSrc -> $toolsDst\$os" "Success"
    } else {
        Write-Status "Tools ($os): no binary found at $toolsSrc" "Warning"
    }
    Copy-FilesRecursive (Join-Path $RepoPath "docs") (Join-Path $CacheBase "docs") "Docs" -Clean
}

function Test-CacheSync {
    param([string]$RepoPath, [string]$CacheBase, [string[]]$SubDirs)
    foreach ($sub in $SubDirs) {
        Compare-Directories (Join-Path $script:CommonDir $sub) (Join-Path $CacheBase $sub) "$sub (repo <-> cache)"
    }
    $os = Get-ToolsOs
    Compare-Directories (Join-Path $script:CommonDir "tools\tizen-dlog-analyzer\$os") (Join-Path $CacheBase "tools\tizen-dlog-analyzer\$os") "tools/$os (repo <-> cache)"
    Compare-Directories (Join-Path $RepoPath "docs") (Join-Path $CacheBase "docs") "docs (repo <-> cache)"
}

# Per-skill clean mirror: the personal skills dir also holds non-tizen skills,
# so only the skill folders present in the source are touched.
function Sync-PersonalSkills {
    param([string]$Source, [string]$Destination, [string]$Label)
    New-Item -ItemType Directory -Force $Destination | Out-Null
    Get-ChildItem -Path $Source -Directory | ForEach-Object {
        Copy-FilesRecursive $_.FullName (Join-Path $Destination $_.Name) "$Label`: $($_.Name)" -Clean
    }
}
function Test-PersonalSkills {
    param([string]$Source, [string]$Destination, [string]$Label)
    Get-ChildItem -Path $Source -Directory | ForEach-Object {
        Compare-Directories $_.FullName (Join-Path $Destination $_.Name) "$Label`: $($_.Name)"
    }
}

# Agent definitions. Mode: md | gemini-md | toml | none (see setup-lib.sh).
function Sync-Agents {
    param([string]$Mode, [string]$Source, [string]$Destination)
    switch ($Mode) {
        "none" { return }
        "md" {
            New-Item -ItemType Directory -Force $Destination | Out-Null
            Get-ChildItem -Path $Source -Filter "*.md" -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $Destination $_.Name) -Force }
            Write-Status "Agents copy complete: $Source -> $Destination" "Success"
        }
        { $_ -in "gemini-md", "toml" } {
            $to = if ($Mode -eq "toml") { "codex-toml" } else { "gemini-md" }
            if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
                Write-Status "node not found - cannot convert agents to $to (skipped)" "Warning"; return
            }
            New-Item -ItemType Directory -Force $Destination | Out-Null
            & node (Join-Path $script:CommonDir "lib\tools\agent-convert.js") --to $to $Source $Destination
            if ($LASTEXITCODE -eq 0) { Write-Status "Agents converted ($to): $Source -> $Destination" "Success" }
            else { Write-Status "Agent conversion ($to) failed" "Warning" }
        }
        default { throw "Unknown agents mode: $Mode" }
    }
}

# ----------------------------------------------------------------------------
# Instruction-file section (AGENTS.md / GEMINI.md)
# ----------------------------------------------------------------------------
# Insert or replace a marker-delimited section in a file the USER owns. Idempotent.
function Install-GuardSection {
    # $Extra: optional host-specific lines appended after the shared body, still
    # inside the markers (e.g. this host's runner cache root).
    param([string]$Target, [string]$Source, [string]$Label, [string]$Extra = "")
    # ${...} keeps PowerShell from reading "Name:begin" as a scope-qualified variable.
    $begin = "<!-- ${script:PluginName}:begin -->"
    $end = "<!-- ${script:PluginName}:end -->"
    New-Item -ItemType Directory -Force (Split-Path $Target -Parent) | Out-Null
    # -Encoding UTF8 everywhere in here: Windows PowerShell 5.1 reads a BOM-less
    # file as ANSI, which turned every em dash in the guard text into "??" in the
    # installed AGENTS.md / GEMINI.md (seen on Codex CLI, issue #48).
    $body = ((Get-Content $Source -Raw -Encoding UTF8) -replace "`r", "").TrimEnd("`n")
    if ($Extra) { $body = "$body`n`n$Extra" }
    $section = "$begin`n$body`n$end"
    $utf8 = New-Object System.Text.UTF8Encoding $false
    # A section left by a pre-rename release carries the old marker pair; drop it
    # first so the file does not end up with two contradictory guard sections.
    foreach ($legacy in $script:LegacyPluginNames) {
        $lb = "<!-- ${legacy}:begin -->"; $le = "<!-- ${legacy}:end -->"
        if ((Test-Path $Target) -and ((Get-Content $Target -Raw -Encoding UTF8) -match [regex]::Escape($lb))) {
            $existing = (Get-Content $Target -Raw -Encoding UTF8) -replace "`r", ""
            $legacyPattern = "\n?" + [regex]::Escape($lb) + "[\s\S]*?" + [regex]::Escape($le) + "\n?"
            [IO.File]::WriteAllText($Target, [regex]::Replace($existing, $legacyPattern, "`n", 1), $utf8)
            Write-Status "$Label`: removed legacy $legacy section from $Target" "Info"
        }
    }
    if ((Test-Path $Target) -and ((Get-Content $Target -Raw -Encoding UTF8) -match [regex]::Escape($begin))) {
        $existing = (Get-Content $Target -Raw -Encoding UTF8) -replace "`r", ""
        $pattern = [regex]::Escape($begin) + "[\s\S]*?" + [regex]::Escape($end)
        $updated = [regex]::Replace($existing, $pattern, { param($m) $section }, 1)
        [IO.File]::WriteAllText($Target, $updated, $utf8)
        Write-Status "$Label`: section refreshed in $Target" "Success"
    } else {
        $prefix = if ((Test-Path $Target) -and (Get-Item $Target).Length -gt 0) { "`n" } else { "" }
        [IO.File]::AppendAllText($Target, "$prefix$section`n", $utf8)
        Write-Status "$Label`: section appended to $Target" "Success"
    }
}
