@echo off
REM SPDX-License-Identifier: Apache-2.0
REM Copyright 2026 Samsung Electronics Co., Ltd.

REM tizen-sdk CLI install from a GitHub release zip (Batch wrapper) - forwards all arguments to setup-tizen-sdk.ps1.
powershell -ExecutionPolicy Bypass -File "%~dp0setup-tizen-sdk.ps1" %*
exit /b %ERRORLEVEL%