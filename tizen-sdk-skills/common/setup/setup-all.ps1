#requires -Version 5.1
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Install tizen-sdk-skills for Claude Code, Cline, Codex CLI and Gemini CLI in one go.
# Runs common\setup\setup.ps1 once per harness with the same options. A failed
# harness does not stop the others; the exit code is 1 if any of them failed.
param([string]$RepoPath, [switch]$SkipValidation, [switch]$NoRestart)

$harnesses = @("claude", "cline", "codex", "gemini")
$failed = @()
foreach ($harness in $harnesses) {
    # Each run in its own process: setup.ps1 calls exit, which would end this script.
    $argList = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "setup.ps1"), "-Harness", $harness)
    if ($RepoPath) { $argList += @("-RepoPath", $RepoPath) }
    if ($SkipValidation) { $argList += "-SkipValidation" }
    if ($NoRestart) { $argList += "-NoRestart" }
    $shell = (Get-Process -Id $PID).Path
    & $shell @argList
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
if ($failed.Count -gt 0) { exit 1 }
exit 0
