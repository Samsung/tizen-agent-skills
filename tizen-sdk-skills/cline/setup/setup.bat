@echo off
REM SPDX-License-Identifier: Apache-2.0
REM Copyright 2026 Samsung Electronics Co., Ltd.

REM Cline tizen-sdk-skills integrated setup and sync script (Batch wrapper)
REM Forwards all arguments to the PowerShell script, preserving quoting.

powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
exit /b %ERRORLEVEL%
