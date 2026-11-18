#requires -Version 5.1
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

<#
.SYNOPSIS
    Install tizen-sdk-skills without cloning the repository.

.DESCRIPTION
    Downloads the tizen-agent-skills source zip from GitHub, runs the regular
    setup scripts from the extracted copy, and deletes the download (zip and
    extracted tree) when the setup succeeds. Nothing is left on disk: the setup
    scripts copy everything they need into the host's own directories.

    A failed setup keeps the download for debugging, as does -Keep.

.PARAMETER Harness
    claude | cline | codex | gemini. Omitted: every host is installed (the
    setup-all path).

.PARAMETER Ref
    Branch (main) or release tag (tizen-agent-skills-vX.Y.Z) to download.

.PARAMETER Keep
    Keep the downloaded source after a successful setup.

.PARAMETER SkipValidation
    Forwarded to the setup script.

.PARAMETER NoRestart
    Forwarded to the setup script.

.EXAMPLE
    .\setup-remote.ps1
    .\setup-remote.ps1 -Harness claude -Ref tizen-agent-skills-v1.6.0
#>

[CmdletBinding()]
param(
    [ValidateSet("", "claude", "cline", "codex", "gemini")]
    [string]$Harness = "",
    [string]$Ref = "main",
    [switch]$Keep,
    [switch]$SkipValidation,
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
# Invoke-WebRequest's progress bar is slow in Windows PowerShell 5.1.
$ProgressPreference = "SilentlyContinue"

function Write-RemoteStatus([string]$Message, [string]$Type = "Info") {
    $color = @{ Info = "Cyan"; Success = "Green"; Warning = "Yellow"; Error = "Red" }[$Type]
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

$repoBase = "https://github.com/Samsung/tizen-agent-skills"
$work = Join-Path ([System.IO.Path]::GetTempPath()) `
    ("tizen-sdk-skills-setup-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
$status = 1

try {
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $srcDir = Join-Path $work "src"
    $zipPath = Join-Path $work "tizen-agent-skills-$Ref.zip"

    Write-RemoteStatus "Downloading tizen-agent-skills ($Ref) from GitHub..."
    $urls = @(
        "$repoBase/archive/refs/heads/$Ref.zip",
        "$repoBase/archive/refs/tags/$Ref.zip"
    )
    $downloaded = $false
    foreach ($url in $urls) {
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        try {
            Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
            $downloaded = $true
            break
        } catch { }
    }
    if (-not $downloaded) {
        throw "cannot download $repoBase (ref: $Ref) - check the network and the -Ref value"
    }
    Write-RemoteStatus "Downloaded: $zipPath" "Success"

    Write-RemoteStatus "Extracting..."
    Expand-Archive -LiteralPath $zipPath -DestinationPath $srcDir -Force

    # The zip holds a single top-level directory (tizen-agent-skills-<ref>).
    $topDir = (Get-ChildItem -LiteralPath $srcDir -Directory | Select-Object -First 1).FullName
    $pluginDir = Join-Path $topDir "tizen-sdk-skills"
    if (-not $topDir -or -not (Test-Path -LiteralPath (Join-Path $pluginDir "common\.claude-plugin\plugin.json") -PathType Leaf)) {
        throw "unexpected zip layout: tizen-sdk-skills\common\.claude-plugin\plugin.json not found"
    }

    Write-Host ""
    Write-Host "=== tizen-sdk-skills setup (from the downloaded source) ==="
    # Each setup in its own process: setup.ps1 calls exit, which would end this
    # script. The engine of this session, from $PSHOME: the current host exe may
    # be an editor such as the ISE, and pwsh need not be on PATH.
    $exe = if ($PSVersionTable.PSEdition -eq "Core") { "pwsh" } else { "powershell" }
    if ($env:OS -eq "Windows_NT") { $exe += ".exe" }
    $shell = Join-Path $PSHOME $exe
    $setupArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File")
    if ($Harness) {
        $setupArgs += @((Join-Path $pluginDir "common\setup\setup.ps1"), "-Harness", $Harness)
    } else {
        $setupArgs += (Join-Path $pluginDir "common\setup\setup-all.ps1")
    }
    if ($SkipValidation) { $setupArgs += "-SkipValidation" }
    if ($NoRestart) { $setupArgs += "-NoRestart" }

    & $shell @setupArgs
    $status = $LASTEXITCODE
} catch {
    Write-RemoteStatus $_.Exception.Message "Error"
    $status = 1
}

if ($Keep) {
    Write-RemoteStatus "Download kept at: $work"
} elseif ($status -eq 0) {
    try {
        Remove-Item -LiteralPath $work -Recurse -Force
        Write-RemoteStatus "Removed the downloaded source: $work" "Success"
    } catch {
        Write-RemoteStatus "could not remove the download: $work ($($_.Exception.Message))" "Warning"
    }
} else {
    Write-RemoteStatus "setup failed; the download was kept at: $work (delete it yourself when done)" "Warning"
}
exit $status