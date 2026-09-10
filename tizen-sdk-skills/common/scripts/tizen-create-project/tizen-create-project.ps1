#Requires -Version 5.0
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


# Tizen Project Creation Agent - Wrapper
# Routes to create-project-app.ps1

$ErrorActionPreference = "Stop"

$agentDir = $PSScriptRoot
if (-not $agentDir) {
    $agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$mainScript = Join-Path $agentDir "create-project-app.ps1"

if (-not (Test-Path $mainScript)) {
    Write-Host "Error: create-project-app.ps1 not found at $mainScript"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Tizen Project Creation Agent"
Write-Host "========================================"
Write-Host ""

try {
    & powershell -ExecutionPolicy Bypass -File $mainScript @args
    # 자식 프로세스 종료 코드를 그대로 전파 (bash 래퍼의 `exit $?`와 동일).
    # 이게 없으면 create-project-app.ps1이 실패(exit 1)해도 래퍼가 0을 반환한다.
    exit $LASTEXITCODE
} catch {
    Write-Host "Error: $_"
    exit 1
}
