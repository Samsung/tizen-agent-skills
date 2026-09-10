#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-sdk-install-custom-repo.ps1
#
# Install the Tizen SDK from a CUSTOM package repository URL (Windows).
#
# Instead of the timezone-selected CDN mirror, the SDK is downloaded from a
# repository URL the user supplies (an internal mirror, a build-server output, a
# local HTTP server, ...).
#
# A URL only counts as a Tizen package repository if it serves
#   {URL}/pkg_list_windows-64   or   {URL}/pkg_list_windows-32
# That file is the package index the whole install is driven from, so a URL
# without it is rejected BEFORE anything is downloaded - the alternative is
# ~100 failed downloads and a half-installed SDK.
#
# This script is a thin, validating front-end: after the URL passes validation
# it delegates to ..\tizen-sdk-install\tizen-sdk-install.ps1 -RepoUrl <url>,
# which performs the real install (pkg_list parse, dependency resolution,
# download/merge, sdk.info, repository.info, env setup).

param(
    [string]$RepoUrl = "",
    [string]$Path = "",             # empty = installer default (%USERPROFILE%\tizen-sdk)
    [string]$Platform = "",         # empty = auto-pick the highest version in pkg_list
    [switch]$ValidateOnly,          # validate the URL and exit (no install)
    [switch]$DryRun,
    [switch]$Force,
    [switch]$Status,
    [switch]$Wait,
    [switch]$Detach,
    [switch]$Help
)

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

$Installer = Join-Path (Join-Path $PSScriptRoot "..\tizen-sdk-install") "tizen-sdk-install.ps1"

if ($Help) {
    Write-Host @"
Install the Tizen SDK from a custom package repository URL

Usage: .\tizen-sdk-install-custom-repo.ps1 -RepoUrl <url> [OPTIONS]

Required:
  -RepoUrl <url>     Package repository base URL to install from.
                     MUST serve pkg_list_windows-64 or pkg_list_windows-32 at
                     its root, otherwise the URL is rejected and nothing is
                     downloaded.
                     Example: http://mirror.example.com/packages/tizen_sdk_11.0

Options:
  -Path <path>       Installation path (default: %USERPROFILE%\tizen-sdk)
  -Platform <ver>    Tizen platform version to install (e.g. 10.0, 11.0).
                     Omit to auto-pick the highest version the repository's
                     pkg_list offers.
  -ValidateOnly      Validate -RepoUrl only and exit
                     (exit 0 = valid repository, 1 = invalid)
  -DryRun            Resolve and print the package list without installing
  -Force             Reinstall even if the SDK is already installed. REQUIRED to
                     re-point an existing install at a different repository.
  -Status            Query the last (or in-progress) run's outcome
                     (STATUS=running | done EXIT=<code> | none)
  -Wait              Sleep 60 seconds then print status (for polling)
  -Detach            Launch the install in a detached background process and
                     exit immediately; poll with -Status
  -Help              Show this help

What it does:
  1) Validates {-RepoUrl}\pkg_list_windows-{64,32} is reachable (HEAD, then a
     1-byte ranged GET for servers that reject HEAD)
  2) Delegates to tizen-sdk-install.ps1 -RepoUrl <url> for the real install
  3) The install records the repository in {SDK_PATH}\.package\repository.info,
     so later package updates and emulator package downloads use the SAME
     custom repository

Examples:
  # Private / in-house mirrors
  .\tizen-sdk-install-custom-repo.ps1 -RepoUrl "http://mirror.example.com/packages/tizen_sdk_11.0"
  .\tizen-sdk-install-custom-repo.ps1 -RepoUrl "http://mirror.example.com/packages/tizen_studio_6.5"
  # Custom repositories
  .\tizen-sdk-install-custom-repo.ps1 -RepoUrl "https://my-mirror.example.com/tizenstudio" -Platform 11.0
  .\tizen-sdk-install-custom-repo.ps1 -RepoUrl "https://my-mirror.example.com/tizenstudio" -ValidateOnly
  .\tizen-sdk-install-custom-repo.ps1 -RepoUrl "https://my-mirror.example.com/tizenstudio" -Force
"@
    exit 0
}

if (-not (Test-Path $Installer)) {
    Write-Err "Installer script not found: $Installer"
    exit 1
}

# -Status / -Wait need no repository URL: they only read the on-disk run markers
# written by a previous install. Forward them straight through so a caller that
# started the install here can also poll it here.
if ($Status -or $Wait) {
    $statusArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Installer)
    if ($Path) { $statusArgs += @('-Path', $Path) }
    if ($Status) { $statusArgs += '-Status' } else { $statusArgs += '-Wait' }
    & powershell $statusArgs
    exit $LASTEXITCODE
}

if (-not $RepoUrl) {
    Write-Err "-RepoUrl <url> is required"
    Write-Err "A custom-repository install needs the repository base URL that serves pkg_list_windows-{64,32}."
    Write-Err "Run with -Help for usage."
    exit 1
}

Write-Info "Tizen SDK install from custom repository"
Write-Info "Requested repository: $RepoUrl"

# Validate first - an invalid repository must never reach the installer.
$matchedPkgOs = Test-PkgRepoUrl -Url $RepoUrl
if (-not $matchedPkgOs) {
    Write-Err "Aborting: not a valid Tizen package repository."
    Write-Err "Fix the URL (it must be the directory that CONTAINS pkg_list_windows-{64,32}) and retry."
    exit 1
}
$normalizedUrl = Get-NormalizedRepoUrl $RepoUrl
Write-Success "Repository validated: $normalizedUrl (package list: pkg_list_$matchedPkgOs)"

if ($ValidateOnly) {
    Write-Success "-ValidateOnly: repository is valid. No install performed."
    exit 0
}

# Delegate the real install. -RepoUrl makes the installer download pkg_list and
# every package zip from this repository and record it in repository.info.
$installArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $Installer,
    '-RepoUrl', $normalizedUrl
)
if ($Path) { $installArgs += @('-Path', $Path) }
if ($Platform) { $installArgs += @('-Platform', $Platform) }
if ($Force) { $installArgs += '-Force' }
if ($DryRun) { $installArgs += '-DryRun' }
if ($Detach) { $installArgs += '-Detach' }

Write-Step "=== Delegating to tizen-sdk-install.ps1 ==="
Write-Info ("powershell " + ($installArgs -join ' '))

& powershell $installArgs
exit $LASTEXITCODE
