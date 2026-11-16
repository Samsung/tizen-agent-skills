#requires -Version 5.1
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Install tizen-sdk-skills for Claude Code, Cline, Codex CLI and Gemini CLI in one go.
# Runs common\setup\setup.ps1 once per harness with the same options. A failed
# harness does not stop the others; the exit code is 1 if any of them failed.
# The setup.sh spelling (--repo P --skip-validation --no-restart) works too.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoPath,
    [switch]$SkipValidation,
    [switch]$NoRestart,
    [Alias("h")]
    [switch]$Help,
    # Accepted only to reject it with guidance instead of a binding error.
    [string]$Harness,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Remaining
)

# setup.sh spelling arrives as plain strings in $RepoPath / $Remaining. Translate it
# here, once, so a typo is one error instead of four failed runs.
$tokens = @()
if ($RepoPath -like "-*") { $tokens += $RepoPath; $RepoPath = "" }
if ($Remaining) { $tokens += $Remaining }
if ($Harness) { $tokens = @("--harness") + $tokens }
if ($Help) { $tokens = @("--help") + $tokens }
for ($i = 0; $i -lt $tokens.Count; $i++) {
    switch ($tokens[$i]) {
        "--repo" {
            if ($i + 1 -ge $tokens.Count -or -not $tokens[$i + 1]) { Write-Host "Error: --repo requires a path" -ForegroundColor Red; exit 1 }
            $RepoPath = $tokens[++$i]
        }
        "--skip-validation" { $SkipValidation = $true }
        "--no-restart" { $NoRestart = $true }
        "--help" {
            Write-Host "Usage: setup-all.ps1 [-RepoPath <path>] [-SkipValidation] [-NoRestart]"
            Write-Host "       (or --repo <path> --skip-validation --no-restart)"
            Write-Host "Runs setup.ps1 for claude, cline, codex and gemini with the same options."
            exit 0
        }
        { $_ -like "--harness*" } {
            Write-Host "Error: setup-all.ps1 installs every harness; use setup.ps1 -Harness <name> for one." -ForegroundColor Red
            exit 1
        }
        default {
            Write-Host "Error: unknown argument: $($tokens[$i])" -ForegroundColor Red
            exit 1
        }
    }
}

if ($RepoPath -and -not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
    Write-Host "Error: the repo path needs an existing directory, got: '$RepoPath'" -ForegroundColor Red
    exit 1
}

$harnesses = @("claude", "cline", "codex", "gemini")
$failed = @()
# Each run in its own process: setup.ps1 calls exit, which would end this script.
$shell = (Get-Process -Id $PID).Path
$argBase = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "setup.ps1"))
if ($RepoPath) { $argBase += @("-RepoPath", $RepoPath) }
if ($SkipValidation) { $argBase += "-SkipValidation" }
if ($NoRestart) { $argBase += "-NoRestart" }

foreach ($harness in $harnesses) {
    & $shell @argBase -Harness $harness
    if ($LASTEXITCODE -ne 0) { $failed += $harness }
}

Write-Host ""
Write-Host "=== setup-all summary ===" -ForegroundColor Cyan
foreach ($harness in $harnesses) {
    if ($failed -contains $harness) {
        Write-Host "  [FAIL] $harness" -ForegroundColor Red
    } else {
        Write-Host "  [ OK ] $harness" -ForegroundColor Green
    }
}
if ($failed -contains "codex" -or $failed -contains "gemini") {
    Write-Host "  Codex CLI and Gemini CLI share ~/.agents/skills: re-run the failed one's setup so its scripts match the skills there." -ForegroundColor Yellow
}
if ($failed.Count -gt 0) { exit 1 }
exit 0
