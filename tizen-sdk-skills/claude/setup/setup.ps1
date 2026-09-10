#requires -Version 5.1
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Claude Code setup - thin wrapper. The logic lives in common\setup\setup.ps1 (-Harness claude).
param([string]$RepoPath, [switch]$SkipValidation, [switch]$NoRestart)
& (Join-Path $PSScriptRoot "..\..\common\setup\setup.ps1") -Harness claude @PSBoundParameters
exit $LASTEXITCODE
