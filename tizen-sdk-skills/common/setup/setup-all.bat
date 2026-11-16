@echo off
REM SPDX-License-Identifier: Apache-2.0
REM Copyright 2026 Samsung Electronics Co., Ltd.

REM tizen-sdk-skills setup for every harness (Batch wrapper) - forwards all arguments to setup-all.ps1.
powershell -ExecutionPolicy Bypass -File "%~dp0setup-all.ps1" %*
exit /b %ERRORLEVEL%
