#requires -Version 5.1
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

<#
.SYNOPSIS
    Install the tizen-sdk CLI from a GitHub release zip.

.DESCRIPTION
    Every tizen-agent-skills release publishes the built tizen-cli plugin as a
    release asset named tizen-sdk-v<plugin-version>.zip. This script resolves
    the asset (its version is the plugin's own, not the release's), downloads
    it, installs the dist\ bundle with a tizen-sdk.cmd shim, and deletes the
    download when the install succeeds. No clone and no build: the zip already
    holds the esbuild bundle, so only Node.js 22+ is needed to run it.

    A failed install keeps the download for debugging, as does -Keep.

.PARAMETER Release
    Release tag to install from (default: the latest release).

.PARAMETER Dir
    Install directory (default: $HOME\.tizen-sdk-cli).

.PARAMETER TizenCli
    Also register the plugin with a tizen-cli host on PATH.

.PARAMETER Keep
    Keep the downloaded zip after a successful install.

.EXAMPLE
    .\setup-tizen-cli.ps1
    .\setup-tizen-cli.ps1 -Release tizen-agent-skills-v1.6.0 -TizenCli
#>

[CmdletBinding()]
param(
    [string]$Release = "latest",
    [string]$Dir = "",
    [switch]$TizenCli,
    [switch]$Keep
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # Invoke-WebRequest's progress bar is slow in 5.1

function Write-CliStatus([string]$Message, [string]$Type = "Info") {
    $color = @{ Info = "Cyan"; Success = "Green"; Warning = "Yellow"; Error = "Red" }[$Type]
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

$repo = "Samsung/tizen-agent-skills"
if (-not $Dir) { $Dir = Join-Path $HOME ".tizen-sdk-cli" }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-CliStatus "node is not on PATH - the tizen-sdk CLI needs Node.js 22+ (https://nodejs.org)" "Error"
    exit 1
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) `
    ("tizen-sdk-cli-setup-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
$status = 1
$tag = $Release

try {
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $zipPath = Join-Path $work "tizen-sdk.zip"
    $srcDir = Join-Path $work "src"

    # -----------------------------------------------------------------------
    # 1. Resolve the tizen-sdk-v<version>.zip asset of the release. The plugin
    #    version differs from the release version, so the asset name is
    #    discovered from the release pages instead of guessed from the tag.
    #    This avoids the GitHub API and its anonymous rate limit entirely.
    # -----------------------------------------------------------------------
    if ($tag -eq "latest") {
        Write-CliStatus "Resolving the latest release..."
        $atom = Invoke-WebRequest -Uri "https://github.com/$repo/releases.atom" -UseBasicParsing
        $match = [regex]::Match($atom.Content, "releases/tag/tizen-agent-skills-v[0-9][0-9.]*")
        if (-not $match.Success) { throw "cannot resolve the latest release - check the network" }
        $tag = $match.Value.Split("/")[-1]
    }

    Write-CliStatus "Looking up the tizen-sdk asset in $tag..."
    try {
        $assets = Invoke-WebRequest -Uri "https://github.com/$repo/releases/expanded_assets/$tag" -UseBasicParsing
    } catch {
        throw "cannot read the release page of $tag - check the -Release value"
    }
    $assetPath = [regex]::Match($assets.Content, 'releases/download/[^"]*tizen-sdk-v[^"]*\.zip').Value
    if (-not $assetPath) { throw "release $tag has no tizen-sdk-v*.zip asset" }
    $assetName = ($assetPath -split "/")[-1]

    # -----------------------------------------------------------------------
    # 2. Download and extract.
    # -----------------------------------------------------------------------
    Write-CliStatus "Downloading $assetName ..."
    try {
        Invoke-WebRequest -Uri "https://github.com/$repo/$assetPath" -OutFile $zipPath -UseBasicParsing
    } catch {
        throw "cannot download the asset - check the network"
    }
    Write-CliStatus "Downloaded: $zipPath" "Success"

    Write-CliStatus "Extracting..."
        Expand-Archive -LiteralPath $zipPath -DestinationPath $srcDir -Force
    if (-not (Test-Path (Join-Path $srcDir "dist\bin\tizen-sdk.js") -PathType Leaf) -or
        -not (Test-Path (Join-Path $srcDir "dist\tizen-sdk.js") -PathType Leaf)) {
        throw "unexpected zip layout: dist\bin\tizen-sdk.js not found"
    }
    $status = 0
} catch {
    Write-CliStatus $_.Exception.Message "Error"
    $status = 1
}

try {
    # -----------------------------------------------------------------------
    # 3. Install: replace the previous dist\ and refresh the shim. The try
    #    above is closed so a resolution failure skips this block entirely.
    # -----------------------------------------------------------------------
    if ($status -eq 0) {
        Write-CliStatus "Installing into $Dir ..."
        New-Item -ItemType Directory -Path (Join-Path $Dir "bin") -Force | Out-Null
        if (Test-Path (Join-Path $Dir "dist")) { Remove-Item (Join-Path $Dir "dist") -Recurse -Force }
        Copy-Item (Join-Path $srcDir "dist") (Join-Path $Dir "dist") -Recurse

        $shim = Join-Path $Dir "bin\tizen-sdk.cmd"
        @"
@echo off
REM tizen-sdk shim - generated by setup-tizen-cli.ps1
node "%~dp0..\dist\bin\tizen-sdk.js" %*
exit /b %ERRORLEVEL%
"@ | Set-Content -LiteralPath $shim -Encoding ASCII

        if ($TizenCli) {
            $tizenCli = Get-Command tizen-cli -ErrorAction SilentlyContinue
            if ($tizenCli) {
                & $tizenCli.Source plugin install (Join-Path $Dir "dist")
                if ($LASTEXITCODE -ne 0) { $status = 1 }
            } else {
                Write-CliStatus "tizen-cli is not on PATH - skipped the host plugin install" "Warning"
            }
        }

        # -------------------------------------------------------------------
        # 4. Verify.
        # -------------------------------------------------------------------
        & $node.Source (Join-Path $Dir "dist\bin\tizen-sdk.js") --capabilities *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-CliStatus "Verification passed: the tizen-sdk CLI responds" "Success"
        } else {
            Write-CliStatus "the CLI did not answer --capabilities; run it manually to see the envelope" "Warning"
            $status = 1
        }
    }
} catch {
    Write-CliStatus $_.Exception.Message "Error"
    $status = 1
}

Write-Host ""
Write-Host "=== tizen-sdk CLI install summary ==="
Write-Host "  Installed : $(Join-Path $Dir 'dist')"
Write-Host "  Run it    : node `"$(Join-Path $Dir 'dist\bin\tizen-sdk.js')`" --doctor"
Write-Host "  On PATH   : add $(Join-Path $Dir 'bin') to PATH, then: tizen-sdk --doctor"
Write-Host "  Node.js   : 22+ required (the --doctor command checks it)"

if ($Keep) {
    Write-CliStatus "Download kept at: $work"
} elseif ($status -eq 0) {
    try {
        Remove-Item -LiteralPath $work -Recurse -Force
        Write-CliStatus "Removed the downloaded zip: $work" "Success"
    } catch {
        Write-CliStatus "could not remove the download: $work ($($_.Exception.Message))" "Warning"
    }
} else {
    Write-CliStatus "install failed; the download was kept at: $work (delete it yourself when done)" "Warning"
}
exit $status