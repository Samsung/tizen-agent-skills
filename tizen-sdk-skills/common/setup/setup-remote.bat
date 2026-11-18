@echo off
REM SPDX-License-Identifier: Apache-2.0
REM Copyright 2026 Samsung Electronics Co., Ltd.

REM tizen-sdk-skills setup without cloning the repository (Batch wrapper) - forwards all arguments to setup-remote.ps1.
powershell -ExecutionPolicy Bypass -File "%~dp0setup-remote.ps1" %*
exit /b %ERRORLEVEL%