@echo off
REM SPDX-License-Identifier: Apache-2.0
REM Copyright 2026 Samsung Electronics Co., Ltd.

REM Codex CLI tizen-sdk-skills setup (Batch wrapper) - forwards all arguments to setup.ps1.
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
exit /b %ERRORLEVEL%
