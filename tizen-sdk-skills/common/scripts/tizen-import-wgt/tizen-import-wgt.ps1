#Requires -Version 5.0
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

param(
    [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$WgtPath,
    [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][ValidateSet('tizen', 'tv-samsung')][string]$Profile,
    [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][ValidatePattern('^\d+\.\d+$')][string]$PlatformVersion,
    [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$WorkingDir
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\lib\common.ps1')

# One "[ERROR] ..." line on stderr, like log_error in the Bash twin. A `throw`
# would be wrapped at console width and decorated with a stack trace, and the
# Node runner (importWgt) surfaces the first [ERROR] line as the diagnosis.
function Fail-Import([string]$Message, [int]$Code = 1) {
    [Console]::Error.WriteLine("[ERROR] $Message")
    exit $Code
}

# tz import-wgt names the project after the archive file name and only accepts
# [a-zA-Z0-9] there ("tz: error: can only have [a-zA-Z0-9]").
$wgtFile = [IO.Path]::GetFileName($WgtPath)
$projectName = [IO.Path]::GetFileNameWithoutExtension($WgtPath)
if ($projectName -notmatch '^[A-Za-z0-9]+$') {
    Fail-Import "Invalid WGT file name: $wgtFile. tz import-wgt names the project after the file and allows only letters and digits [A-Za-z0-9]; rename the archive and retry" 2
}

$sdkPath = Get-SdkPath
$tzTool = Join-Path $sdkPath 'tools\tizen-core\tz.exe'
if (-not (Test-Path $tzTool)) { $tzTool = Join-Path $sdkPath 'tools\tizen-core\tz' }
if (-not (Test-Path $tzTool)) { Fail-Import "tz tool not found at $tzTool. Resolved SDK path: $sdkPath" }

$env:TIZEN_STUDIO_DIR = $sdkPath
$env:TIZEN_STUDIO = $sdkPath

# The profile must be INSTALLED: tz neither validates nor records it — with an
# uninstalled "tizen-99.9" it exits 0 and writes the api_version found in
# config.xml, so the caller would believe the version was applied.
$tzProfile = "$Profile-$PlatformVersion"
$knownProfiles = @()
$sections = & $tzTool list templates 2>$null
if ($LASTEXITCODE -eq 0) {
    foreach ($line in @($sections)) {
        if ("$line" -match '^(\S.*):\s*$') { $knownProfiles += $matches[1].Trim() }
    }
}
if ($knownProfiles -notcontains $tzProfile) {
    $known = if ($knownProfiles.Count -gt 0) { $knownProfiles -join ', ' } else { '(none)' }
    Fail-Import "Profile $tzProfile is not installed. Profiles known to tz: $known. Install the platform package for $tzProfile (tizen-platform-install / tizen-tv-sdk-install) or pass an installed -PlatformVersion"
}

& $tzTool import-wgt "--wgt-path=$WgtPath" "--profile=$tzProfile" "--ws-dir=$WorkingDir"
exit $LASTEXITCODE
