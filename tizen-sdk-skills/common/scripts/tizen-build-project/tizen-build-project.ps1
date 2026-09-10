# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

param(
    # -w / -ProjectPath : project directory. Short alias matches the bash script's -w flag.
    [Parameter(Mandatory=$false)]
    [Alias('w')]
    [string]$ProjectPath,

    # -b / -BuildType
    [Parameter(Mandatory=$false)]
    [Alias('b')]
    [ValidateSet('Debug', 'Release', 'Test')]
    [string]$BuildType = 'Debug',

    # -s / -SignProfile
    [Parameter(Mandatory=$false)]
    [Alias('s')]
    [string]$SignProfile = '',

    # -c / -Clean : remove previous build output before building (full rebuild)
    [Parameter(Mandatory=$false)]
    [Alias('c')]
    [switch]$Clean,

    [Parameter(Mandatory=$false)]
    [switch]$Help
)

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# ============================================================================
# Help Text
# ============================================================================

if ($Help) {
    @"
Usage: tizen-build-project.ps1 [options]

Options:
  -ProjectPath <path>   Project directory (required)
  -BuildType <type>     Build type: Debug (default), Release, Test
  -SignProfile <name>   Signing profile name (optional)
  -Clean                Remove previous build output before building
                        (forces a full, non-incremental rebuild)
  -Help                 Show this help message

Examples:
  # Build in Debug mode (default)
  .\tizen-build-project.ps1 -ProjectPath "C:\path\to\project"

  # Build in Release mode
  .\tizen-build-project.ps1 -ProjectPath "C:\path\to\project" -BuildType Release

  # Build with custom signing profile
  .\tizen-build-project.ps1 -ProjectPath "C:\path\to\project" -SignProfile "my-profile"

  # Force a full clean rebuild
  .\tizen-build-project.ps1 -ProjectPath "C:\path\to\project" -Clean
"@
    exit 0
}

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    Write-Err "Error: Project directory is required (-ProjectPath)"
    exit 1
}

# ============================================================================
# Utility Functions
# ============================================================================

function Test-HasProjectConfig {
    param([string]$Path)
    (Test-Path (Join-Path $Path "tizen_native_project.yaml")) -or `
    (Test-Path (Join-Path $Path "tizen_dotnet_project.yaml")) -or `
    (Test-Path (Join-Path $Path "tizen_resource_project.yaml")) -or `
    (Test-Path (Join-Path $Path "config.xml"))
}

function Verify-ProjectPath {
    param([string]$Path)

    if (-not (Test-Path -Path $Path -PathType Container)) {
        Write-Err "Project directory not found: $Path"
        return $null
    }

    $targetPath = $Path

    if (-not (Test-HasProjectConfig $Path)) {
        # .NET Tizen templates commonly scaffold Solution/ProjectName/ - the manifest lives
        # one level below the solution folder a user is likely to point at. Auto-descend
        # into it if exactly one immediate subdirectory has a config file.
        $candidates = Get-ChildItem -Path $Path -Directory -ErrorAction SilentlyContinue |
            Where-Object { Test-HasProjectConfig $_.FullName }

        if ($candidates.Count -eq 1) {
            Write-Info "No project config directly in '$Path' - using nested project folder: $($candidates[0].FullName)"
            $targetPath = $candidates[0].FullName
        } elseif ($candidates.Count -gt 1) {
            Write-Err "Project configuration not found in '$Path', and multiple nested project folders were found ($(($candidates | ForEach-Object { $_.Name }) -join ', ')). Pass the exact project folder."
            return $null
        } else {
            Write-Err "Project configuration not found. Not a valid Tizen project."
            return $null
        }
    }

    # Resolve to absolute path
    $resolvedPath = Resolve-Path -Path $targetPath -ErrorAction SilentlyContinue
    if ($resolvedPath) {
        return $resolvedPath.Path
    } else {
        Write-Err "Could not resolve project path: $targetPath"
        return $null
    }
}

function Detect-ProjectType {
    param([string]$Path)

    if (Test-Path (Join-Path $Path "tizen_resource_project.yaml")) {
        return "RPK"
    } elseif ((Test-Path (Join-Path $Path "tizen_dotnet_project.yaml")) -or `
        (Get-ChildItem -Path $Path -Filter "*.csproj" -ErrorAction SilentlyContinue)) {
        return "DotNET"
    } elseif ((Test-Path (Join-Path $Path "tizen_native_project.yaml")) -or `
              (Test-Path (Join-Path $Path "project_def.prop"))) {
        return "Native"
    } elseif ((Test-Path (Join-Path $Path "config.xml")) -or `
              (Test-Path (Join-Path $Path "index.html"))) {
        return "WebApp"
    } else {
        return "Unknown"
    }
}

function Clear-BuildOutputs {
    param([string]$ProjectPath, [string]$ProjectType)

    Write-Section "Cleaning previous build output (-Clean)"

    # Incremental state for tz builds lives in the per-build-type output dirs
    # (Debug\, Release\, Test\); .NET builds also keep intermediates in bin\ and obj\.
    # Only fixed, well-known directory names inside the verified project dir are
    # removed - never anything derived from user input.
    $dirs = @("Debug", "Release", "Test", ".buildResult")
    if ($ProjectType -eq "DotNET") {
        $dirs += @("bin", "obj")
    }

    $removed = 0
    $failed = @()
    foreach ($d in $dirs) {
        $target = Join-Path $ProjectPath $d
        if (Test-Path -LiteralPath $target -PathType Container) {
            try {
                $item = Get-Item -LiteralPath $target -Force
                if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                    # A junction/symlink must be unlinked, never traversed -
                    # current PS 5.1 happens to do this for Remove-Item too,
                    # but the behavior changed across versions, so be explicit.
                    $item.Delete()
                } else {
                    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
                }
            } catch { }
            # Verify the removal actually happened. A locked file (editor,
            # emulator, sdb, antivirus) makes Remove-Item leave the directory
            # partially populated; continuing would produce an incremental
            # build that the caller believes was clean - the exact silent
            # wrong answer --clean exists to prevent.
            if (Test-Path -LiteralPath $target) {
                $failed += $target
            } else {
                Write-Info "Removed: $target"
                $removed++
            }
        }
    }

    if ($failed.Count -gt 0) {
        Write-Err "Clean failed - could not fully remove: $($failed -join ', ')"
        Write-Err "A file inside is likely locked by a running process (editor, emulator, sdb). Close it and re-run."
        Write-Err "Aborting the build: continuing after a partial clean would silently produce an incremental (non-clean) build."
        exit 5
    }

    if ($removed -eq 0) {
        Write-Info "No previous build output found - nothing to clean"
    } else {
        Write-Success "Cleaned $removed build output director$(if ($removed -eq 1) { 'y' } else { 'ies' })"
    }
}

function Build-Project {
    param([string]$TzPath, [string]$ProjectPath, [string]$BuildType)

    Write-Section "Building project"
    Write-Host "Project: $ProjectPath"
    Write-Host "Build type: $BuildType"

    $tzArgs = @("build", "-b", $BuildType, "-w", $ProjectPath)

    if (-not [string]::IsNullOrWhiteSpace($SignProfile)) {
        $tzArgs += @("-s", $SignProfile)
    }

    # Re-assert UTF-8 before invoking tz so its stdout/stderr is captured
    # correctly by PowerShell (tz inherits the console code page).
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $null = chcp 65001
    } catch { }

    $result = & $TzPath $tzArgs 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Success "Build completed successfully"
        Write-Host $result
        return $true
    } else {
        Write-Err "Build failed"
        Write-Host $result
        return $false
    }
}

function Pack-Project {
    param([string]$TzPath, [string]$ProjectPath)

    Write-Section "Packaging project"

    $tzArgs = @("pack", "-w", $ProjectPath)

    if (-not [string]::IsNullOrWhiteSpace($SignProfile)) {
        $tzArgs += @("-s", $SignProfile)
    }

    # Re-assert UTF-8 before invoking tz so its stdout/stderr is captured
    # correctly by PowerShell (tz inherits the console code page).
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $null = chcp 65001
    } catch { }

    $result = & $TzPath $tzArgs 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Success "Packaging completed successfully"
        Write-Host $result
        return $true
    } else {
        Write-Err "Packaging failed"
        Write-Host $result
        return $false
    }
}

function Pack-RpkProject {
    param([string]$TizenCliPath, [string]$ProjectPath)

    Write-Section "Packaging standalone RPK project"

    # The SDK's legacy RPK Java packager parses sdk.info as key=value only,
    # unlike the batch launcher, which accepts comment and blank lines. Keep
    # the user configuration byte-for-byte intact by sanitizing it only while
    # this one package command runs, then always restore it.
    $sdkInfoPath = Join-Path (Get-SdkPath) 'sdk.info'
    $originalSdkInfo = $null
    $sanitizedSdkInfo = $false

    try {
        if (Test-Path -LiteralPath $sdkInfoPath) {
            $sdkInfoText = [System.IO.File]::ReadAllText($sdkInfoPath)
            $hasUnsupportedLines = $sdkInfoText -split "`r?`n" | Where-Object {
                $_ -match '^\s*(?:#.*)?$'
            }

            if ($hasUnsupportedLines) {
                $originalSdkInfo = [System.IO.File]::ReadAllBytes($sdkInfoPath)
                $validLines = $sdkInfoText -split "`r?`n" | Where-Object {
                    $_ -notmatch '^\s*(?:#.*)?$'
                }
                [System.IO.File]::WriteAllText(
                    $sdkInfoPath,
                    ($validLines -join [Environment]::NewLine),
                    [System.Text.UTF8Encoding]::new($false)
                )
                $sanitizedSdkInfo = $true
                Write-Host '[INFO] Temporarily removed comment/blank lines from sdk.info for the legacy RPK packager.'
            }
        }

        $result = & $TizenCliPath package -t rpk -- $ProjectPath 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        if ($sanitizedSdkInfo -and $null -ne $originalSdkInfo) {
            [System.IO.File]::WriteAllBytes($sdkInfoPath, $originalSdkInfo)
            Write-Host '[INFO] Restored the original sdk.info configuration.'
        }
    }

    if ($exitCode -eq 0) {
        Write-Success "RPK package completed successfully"
        Write-Host $result
        return $true
    }
    Write-Err "RPK package failed"
    Write-Host $result
    return $false
}

function Find-TizenIdeCli {
    $sdkPath = Get-SdkPath
    foreach ($name in @('tizen.bat', 'tizen')) {
        $candidate = Join-Path (Join-Path (Join-Path $sdkPath 'tools') 'ide\bin') $name
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

function Find-PackageFile {
    param([string]$ProjectPath, [string]$BuildType)

    # .tpk (Native/DotNET), .wgt (WebApp), and .rpk (Resource Package) are produced in the build-type
    # directory (e.g. Debug\ or Release\). WebApp's .wgt lands there too, not in root.
    $buildDir = Join-Path $ProjectPath $BuildType
    if (Test-Path $buildDir) {
        $package = Get-ChildItem -Path $buildDir -Include "*.tpk","*.wgt","*.rpk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($package) {
            return $package.FullName
        }
    }

    # Fallback: anywhere under the project (covers unusual layouts).
    $package = Get-ChildItem -Path $ProjectPath -Include "*.tpk","*.wgt","*.rpk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($package) {
        return $package.FullName
    }

    return $null
}

# ============================================================================
# Main Execution
# ============================================================================

Write-Host "Tizen Project Builder (Windows PowerShell)" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Yellow

# Verify project path
Write-Section "Verifying project directory"
$project = Verify-ProjectPath $ProjectPath
if (-not $project) {
    exit 1
}
Write-Success "Project directory verified: $project"

# Detect project type
$projectType = Detect-ProjectType $project
Write-Section "Detected project type: $projectType"

if ($projectType -eq "Unknown") {
    Write-Err "Could not detect project type"
    exit 1
}

# DotNET builds shell out to `dotnet` (via tz). If it is not on PATH, stop early
# with an actionable pointer instead of tz's cryptic "executable file not found".
if ($projectType -eq "DotNET" -and -not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Err "This is a DotNET project but 'dotnet' is not on PATH."
    $foundDotnet = Find-DotnetSdk
    if ($foundDotnet) {
        Write-Warn "A .NET SDK is installed but not on PATH: $foundDotnet"
    }
    Write-Err "Run the tizen-dotnet-setup skill first - it locates dotnet (or guides installing it) and the Tizen workload, then re-run this build."
    exit 3
}

# Find the appropriate packaging tool
Write-Section "Locating Tizen SDK tools"
$tzTool = $null
$tizenIdeCli = $null
if ($projectType -eq 'RPK') {
    $tizenIdeCli = Find-TizenIdeCli
    if (-not $tizenIdeCli) {
        Write-Err "Tizen CLI not found under tools\\ide\\bin. Install the Tizen IDE tools required for RPK packaging."
        exit 1
    }
    Write-Success "Tizen CLI found: $tizenIdeCli"
} else {
    $tzTool = Find-TizenTool "tz"
    if (-not $tzTool) { exit 1 }
    Write-Success "Tizen SDK tools found: $tzTool"
}

# Clean previous build output first when a full rebuild was requested
if ($Clean) {
    Clear-BuildOutputs $project $projectType
}

if ($projectType -eq "RPK") {
    if (-not (Pack-RpkProject $tizenIdeCli $project)) { exit 1 }
} else {
    if (-not (Build-Project $tzTool $project $BuildType)) { exit 1 }
    if (-not (Pack-Project $tzTool $project)) { exit 1 }
}

# Find and report package
Write-Section "Locating generated package"
$packageFile = Find-PackageFile $project $BuildType

if ($packageFile) {
    Write-Success "Package file generated: $packageFile"
    Write-Host ""
    Write-Host "Build Summary:" -ForegroundColor Green
    Write-Host "  Project: $project"
    Write-Host "  Type: $projectType"
    Write-Host "  Build Type: $BuildType"
    Write-Host "  Package: $packageFile"
    Write-Host ""
    exit 0
} else {
    Write-Err "Package file not found after build"
    exit 1
}
