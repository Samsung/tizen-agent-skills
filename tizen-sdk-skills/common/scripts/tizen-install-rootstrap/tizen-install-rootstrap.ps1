#!/usr/bin/env powershell
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-install-rootstrap.ps1
# Tizen Custom Rootstrap Installer for Windows
#
# - Validates ZIP file path and security (no path traversal, no symlinks)
# - Extracts ZIP to temporary location
# - Detects ZIP structure (data/ or tizen-studio/)
# - Parses rootstrap XML metadata from plugins directory
# - Copies tools and platforms folders to SDK
# - For tizen-studio structure: checks/installs native packages, copies as tizen-7.0
# - Creates .rootstrap-installed marker on success
#
# Exit codes:
#   0 = success
#   1 = failure
#

param(
    [string]$ZipPath = "",
    [string]$SdkPath = "",
    [switch]$Force,
    [switch]$Help
)

# Shared helpers: logging (Write-Info/Success/Warn/Err) + Get-SdkPath.
. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# Show help
if ($Help) {
    Write-Host @"
Tizen Custom Rootstrap Installer

Usage: .\tizen-install-rootstrap.ps1 [OPTIONS]

Options:
  -ZipPath <path>    Path to the rootstrap ZIP package (required)
  -SdkPath <path>    Tizen SDK installation path
                      (default: TIZEN_SDK_PATH / ~\.tizen.sdk.path.config / ~\tizen-sdk)
  -Force             Force reinstall even if rootstrap is already installed
  -Help              Show this help

What it does:
  1) Validates ZIP file path for security (no path traversal, no symlinks)
  2) Extracts ZIP to temporary directory
  3) Detects ZIP structure (data/ or tizen-studio/)
  4) Parses rootstrap XML metadata to extract profile/version/arch
  5) Copies tools/ folder to SDK
  6) Copies platforms/ folder to SDK
  7) For tizen-studio structure: installs native packages if needed
  8) Creates .rootstrap-installed marker on success

Supported ZIP Structures:
  Structure 1: data/
    rootstrap.zip
    └── data/
        ├── tools/smart-build-interface/plugins/*.xml
        └── platforms/tizen-{version}/tizen/rootstraps/

  Structure 2: tizen-studio/
    rootstrap.zip
    └── tizen-studio/
        ├── tools/smart-build-interface/plugins/*.xml
        └── platforms/tizen-{version}/tizen/rootstraps/

Examples:
  .\tizen-install-rootstrap.ps1 -ZipPath "C:\rootstraps\custom-arm.zip"
  .\tizen-install-rootstrap.ps1 -ZipPath "C:\rootstraps\tv-samsung.zip" -SdkPath "C:\tizen-studio"
  .\tizen-install-rootstrap.ps1 -ZipPath "C:\rootstraps\custom.zip" -Force
"@
    exit 0
}

# Validate parameters
if (-not $ZipPath) {
    Write-Err "ZipPath is required. Use -ZipPath <path> to specify the rootstrap ZIP file."
    exit 1
}

# Set default SDK path if not provided
if (-not $SdkPath) {
    $SdkPath = Get-SdkPath
}

# OS auto-detect
if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows)) {
    $PkgOs = "windows-64"
} elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::OSX)) {
    $PkgOs = "macos-64"
} elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Linux)) {
    $PkgOs = "ubuntu-64"
}


Write-Info "Tizen Custom Rootstrap Installer started"
Write-Info "ZIP path: $ZipPath"
Write-Info "SDK path: $SdkPath"

# -----------------------------------------------------------------------------
# Validate ZIP path
# -----------------------------------------------------------------------------
# Decode URL-encoded sequences (prevent bypass attempts)
try {
    $ZipPath = [System.Web.HttpUtility]::UrlDecode($ZipPath)
} catch {
    # If decoding fails, use original path
}

# Check for path traversal
if ($ZipPath -like "*..*") {
    Write-Err "Invalid ZipPath: Path traversal detected (..)"
    exit 1
}

# Normalize path
$ZipPath = $ZipPath -replace '/', '\'
$ZipPath = $ZipPath -replace '\\\\', '\'

# Resolve to absolute path
try {
    $ZipPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ZipPath)
} catch {
    Write-Err "Invalid ZipPath: Could not resolve path: $_"
    exit 1
}

# Verify .zip extension
if (-not $ZipPath.EndsWith(".zip", [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Err "Invalid ZipPath: File must have .zip extension"
    exit 1
}

# Check file existence
if (-not (Test-Path $ZipPath)) {
    Write-Err "Invalid ZipPath: File does not exist: $ZipPath"
    exit 1
}

# Verify it's a file (not directory)
$zipItem = Get-Item $ZipPath
if ($zipItem.PSIsContainer) {
    Write-Err "Invalid ZipPath: Path is a directory, not a file"
    exit 1
}

Write-Success "ZIP file validated: $ZipPath"

# Verify Tizen SDK is installed
$sdkInfoPath = Join-Path $SdkPath "sdk.info"
if (-not (Test-Path $sdkInfoPath)) {
    Write-Err "Tizen SDK is NOT installed at $SdkPath (sdk.info not found)"
    Write-Err "Rootstrap installation requires Tizen SDK to be installed first."
    exit 1
}
Write-Success "Tizen SDK found: $SdkPath (sdk.info exists)"

# -----------------------------------------------------------------------------
# Create temporary extraction directory
# -----------------------------------------------------------------------------
$toolsPath = Join-Path $SdkPath "tools"
$tempBaseDir = Join-Path $toolsPath "server\sdktools\rootstrap"
if (-not (Test-Path $tempBaseDir)) {
    New-Item -ItemType Directory -Path $tempBaseDir -Force | Out-Null
}

$tempDir = Join-Path $tempBaseDir ("extract-" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Info "Temporary extraction directory: $tempDir"

# -----------------------------------------------------------------------------
# Extract ZIP file
# -----------------------------------------------------------------------------
Write-Info "Extracting ZIP file..."
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
    
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $zip.Entries) {
            # Skip empty entries
            if ([string]::IsNullOrEmpty($entry.FullName)) { continue }
            
            # Security check: reject path traversal
            if ($entry.FullName -like "*..*") {
                Write-Err "Path traversal detected in ZIP entry: $($entry.FullName)"
                $zip.Dispose()
                Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
                exit 1
            }
            
            # Security check: reject symlinks
            if ($entry.FullName -like "*.lnk") {
                Write-Err "Symlink detected in ZIP archive: $($entry.FullName)"
                $zip.Dispose()
                Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
                exit 1
            }
            
            $destPath = Join-Path $tempDir $entry.FullName
            $destDir = Split-Path -Parent $destPath
            
            # Create directory if needed
            if ($destDir -and -not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            
            # Extract file
            if (-not [string]::IsNullOrEmpty($entry.Name)) {
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
            }
        }
    } finally {
        $zip.Dispose()
    }
} catch {
    Write-Err "Failed to extract ZIP: $_"
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}
Write-Success "ZIP extraction completed"

# -----------------------------------------------------------------------------
# Detect ZIP structure
# -----------------------------------------------------------------------------
$dataDir = Join-Path $tempDir "data"
$tizenStudioDir = Join-Path $tempDir "tizen-studio"

$structureType = $null
$rootDir = $null

if (Test-Path $dataDir) {
    $structureType = "data"
    $rootDir = $dataDir
    Write-Info "Detected ZIP structure: data/"
} elseif (Test-Path $tizenStudioDir) {
    $structureType = "tizen-studio"
    $rootDir = $tizenStudioDir
    Write-Info "Detected ZIP structure: tizen-studio/"
} else {
    Write-Err "Could not determine ZIP structure"
    Write-Err "Expected either 'data/' or 'tizen-studio/' directory at ZIP root"
    Write-Err "Contents of temp directory:"
    Get-ChildItem $tempDir | ForEach-Object { Write-Info "  - $($_.Name)" }
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}

# -----------------------------------------------------------------------------
# Find and parse rootstrap XML
# -----------------------------------------------------------------------------
$pluginsDir = Join-Path $rootDir "tools\smart-build-interface\plugins"
if (-not (Test-Path $pluginsDir)) {
    Write-Err "No rootstrap XML files found in the ZIP"
    Write-Err "Expected directory: $pluginsDir"
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}

# Find rootstrap definition XML files. Two filename formats are accepted:
#   1) {profile}-{version}-{device}.core.xml
#      - the Tizen SDK repository format, e.g. tizen-10.0-device.core.xml
#        (this is what the SDK's own tools/smart-build-interface/plugins/ holds)
#   2) {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml
#      - custom builds that tag the type and build time, e.g.
#        tizen-9.0-arm.core.public.20240101120000.xml
# The rootstrap identity is always the {profile}-{version}-{device} part; type
# and timestamp are informational only.
$xmlFiles = @(Get-ChildItem $pluginsDir -Filter "*.core*.xml" -File)
if (-not $xmlFiles -or $xmlFiles.Count -eq 0) {
    Write-Err "No rootstrap XML files found matching pattern *.core*.xml"
    Write-Err "Expected {profile}-{version}-{device}.core.xml or {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml"
    Write-Err "Contents of plugins directory:"
    Get-ChildItem $pluginsDir | ForEach-Object { Write-Info "  - $($_.Name)" }
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}

Write-Success "Found $($xmlFiles.Count) rootstrap XML file(s)"

# Parse XML filenames to extract metadata
# Format: {profile}-{version}-{device}.core[.{public|private}.{timestamp}].xml
# Example: tizen-10.0-device.core.xml, tizen-9.0-arm.core.public.20240101120000.xml
$rootstrapInfo = @()
foreach ($xmlFile in $xmlFiles) {
    # Full filename without .xml extension: e.g., "tizen-9.0-arm.core.public.20240101120000"
    $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($xmlFile.Name)

    # Step 1: Split at the first ".core": everything before it is
    # {profile}-{version}-{device}; whatever follows (possibly nothing) is the
    # optional ".{type}.{timestamp}" suffix.
    $coreIndex = $nameWithoutExt.IndexOf('.core')
    if ($coreIndex -gt 0) {
        $baseName = $nameWithoutExt.Substring(0, $coreIndex)  # "tizen-9.0-arm"
        $suffix = $nameWithoutExt.Substring($coreIndex + 5).TrimStart('.')  # "" or "public.20240101120000"

        # Step 2: Optional type (public/private) and timestamp; "-" when absent.
        $type = '-'
        $timestamp = '-'
        if ($suffix) {
            $parts = $suffix.Split('.', 2)
            $type = $parts[0]
            if ($parts.Count -gt 1) { $timestamp = $parts[1] }
        }

        # Step 3: Parse: {profile}-{version}-{device}
        if ($baseName -match '^(.+)-([0-9]+\.[0-9]+)-([a-zA-Z0-9_]+)$') {
            $profile = $Matches[1]
            $version = $Matches[2]
            $device = $Matches[3]

            $rootstrapInfo += @{
                Profile = $profile
                Version = $version
                Device = $device
                Type = $type  # public, private, or "-"
                Timestamp = $timestamp
                XmlFile = $xmlFile.FullName
                DisplayName = "$profile-$version-$device"
            }

            Write-Info "  Parsed: Profile=$profile, Version=$version, Device=$device, Type=$type, Timestamp=$timestamp"
        } else {
            Write-Warn "Could not parse XML filename: $($xmlFile.Name)"
        }
    } else {
        Write-Warn "Could not parse XML filename: $($xmlFile.Name)"
    }
}

if ($rootstrapInfo.Count -eq 0) {
    Write-Err "No valid rootstrap XML files found"
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 1
}

# -----------------------------------------------------------------------------
# Check if rootstrap is already installed
# -----------------------------------------------------------------------------
$rootstrapMarker = Join-Path $SdkPath ".rootstrap-installed"
$rootstrapInstalled = $false

if ((Test-Path $rootstrapMarker) -and -not $Force) {
    $markerContent = Get-Content $rootstrapMarker -Raw
    foreach ($info in $rootstrapInfo) {
        if ($markerContent -like "*$($info.DisplayName)*") {
            Write-Info "Rootstrap $($info.DisplayName) is already installed (marker found)"
            $rootstrapInstalled = $true
            break
        }
    }
}

if ($rootstrapInstalled) {
    Write-Success "Rootstrap is already installed - skipping installation. Use -Force to reinstall."
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    exit 0
}

if ($Force -and (Test-Path $rootstrapMarker)) {
    Write-Warn "Force reinstall requested - removing .rootstrap-installed marker"
    Remove-Item $rootstrapMarker -Force -ErrorAction SilentlyContinue
}

# -----------------------------------------------------------------------------
# For tizen-studio structure: check native packages
# -----------------------------------------------------------------------------
if ($structureType -eq "tizen-studio") {
    Write-Info "tizen-studio structure detected - checking native development packages..."
    
    # Check if native packages are installed
    $nativeMarker = Join-Path $SdkPath ".native-development-package-installed"
    if (-not (Test-Path $nativeMarker)) {
        Write-Warn "Native development package not found. Rootstrap may require native toolchain."
        Write-Warn "You may need to install the native development package first."
    } else {
        Write-Success "Native development package found"
    }
}

# -----------------------------------------------------------------------------
# Copy tools folder
# -----------------------------------------------------------------------------
$srcToolsDir = Join-Path $rootDir "tools"
$dstToolsDir = Join-Path $SdkPath "tools"

if (Test-Path $srcToolsDir) {
    Write-Info "Copying tools folder..."
    if ($PkgOs -eq "windows-64") {
        $robocopyLogFile = Join-Path $env:TEMP "robocopy-tools-$([System.IO.Path]::GetRandomFileName()).log"
        robocopy $srcToolsDir $dstToolsDir /E /NFL /NDL /NJH /NJS /NP /R:5 /W:2 /XO /LOG:$robocopyLogFile | Out-Null
        $robocopyExitCode = $LASTEXITCODE
        if ($robocopyExitCode -ge 8) {
            Write-Err "Failed to copy tools folder (robocopy exit code: $robocopyExitCode)"
            if (Test-Path $robocopyLogFile) {
                Write-Err "Robocopy diagnostic output:"
                Get-Content $robocopyLogFile -Raw | ForEach-Object { Write-Err $_ }
                Remove-Item $robocopyLogFile -Force -ErrorAction SilentlyContinue
            }
            Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
            exit 1
        }
        if (Test-Path $robocopyLogFile) {
            Remove-Item $robocopyLogFile -Force -ErrorAction SilentlyContinue
        }
    } else {
        Copy-Item -Path "$srcToolsDir\*" -Destination $dstToolsDir -Recurse -Force
    }
    Write-Success "Tools folder copied successfully"
} else {
    Write-Warn "Tools folder not found in ZIP - skipping"
}

# -----------------------------------------------------------------------------
# Copy platforms folder
# -----------------------------------------------------------------------------
$srcPlatformsDir = Join-Path $rootDir "platforms"
$dstPlatformsDir = Join-Path $SdkPath "platforms"

if (Test-Path $srcPlatformsDir) {
    Write-Info "Copying platforms folder..."
    
    # For tizen-studio structure, copy as tizen-7.0 for compatibility
    if ($structureType -eq "tizen-studio") {
        # Get source platform version
        $srcPlatformDirs = Get-ChildItem $srcPlatformsDir -Directory
        if ($srcPlatformDirs.Count -gt 0) {
            $srcPlatformName = $srcPlatformDirs[0].Name  # e.g., "tizen-8.0"
            $dstPlatformName = "tizen-7.0"  # Force compatibility name
            Write-Info "Mapping $srcPlatformName -> $dstPlatformName for compatibility"
            
            $dstPlatformDir = Join-Path $dstPlatformsDir $dstPlatformName
            if (-not (Test-Path $dstPlatformDir)) {
                New-Item -ItemType Directory -Path $dstPlatformDir -Force | Out-Null
            }
            
            $srcPlatformPath = Join-Path $srcPlatformsDir $srcPlatformDirs[0].Name
            if ($PkgOs -eq "windows-64") {
                $robocopyLogFile = Join-Path $env:TEMP "robocopy-platforms-$([System.IO.Path]::GetRandomFileName()).log"
                robocopy $srcPlatformPath "$dstPlatformDir" /E /NFL /NDL /NJH /NJS /NP /R:5 /W:2 /XO /LOG:$robocopyLogFile | Out-Null
                $robocopyExitCode = $LASTEXITCODE
                if ($robocopyExitCode -ge 8) {
                    Write-Err "Failed to copy platforms folder (robocopy exit code: $robocopyExitCode)"
                    if (Test-Path $robocopyLogFile) {
                        Write-Err "Robocopy diagnostic output:"
                        Get-Content $robocopyLogFile -Raw | ForEach-Object { Write-Err $_ }
                        Remove-Item $robocopyLogFile -Force -ErrorAction SilentlyContinue
                    }
                    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
                    exit 1
                }
                if (Test-Path $robocopyLogFile) {
                    Remove-Item $robocopyLogFile -Force -ErrorAction SilentlyContinue
                }
            } else {
                Copy-Item -Path "$srcPlatformPath\*" -Destination $dstPlatformDir -Recurse -Force
            }
        }
    } else {
        # Standard copy for data/ structure
        if ($PkgOs -eq "windows-64") {
            $robocopyLogFile = Join-Path $env:TEMP "robocopy-platforms-$([System.IO.Path]::GetRandomFileName()).log"
            robocopy $srcPlatformsDir $dstPlatformsDir /E /NFL /NDL /NJH /NJS /NP /R:5 /W:2 /XO /LOG:$robocopyLogFile | Out-Null
            $robocopyExitCode = $LASTEXITCODE
            if ($robocopyExitCode -ge 8) {
                Write-Err "Failed to copy platforms folder (robocopy exit code: $robocopyExitCode)"
                if (Test-Path $robocopyLogFile) {
                    Write-Err "Robocopy diagnostic output:"
                    Get-Content $robocopyLogFile -Raw | ForEach-Object { Write-Err $_ }
                    Remove-Item $robocopyLogFile -Force -ErrorAction SilentlyContinue
                }
                Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
                exit 1
            }
            if (Test-Path $robocopyLogFile) {
                Remove-Item $robocopyLogFile -Force -ErrorAction SilentlyContinue
            }
        } else {
            Copy-Item -Path "$srcPlatformsDir\*" -Destination $dstPlatformsDir -Recurse -Force
        }
    }
    
    Write-Success "Platforms folder copied successfully"
} else {
    Write-Warn "Platforms folder not found in ZIP - skipping"
}

# -----------------------------------------------------------------------------
# Cleanup temporary directory
# -----------------------------------------------------------------------------
Write-Info "Cleaning up temporary directory..."
try {
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    Write-Success "Temporary directory cleaned up"
} catch {
    Write-Warn "Failed to clean up temporary directory: $_"
}

# -----------------------------------------------------------------------------
# Create marker file
# -----------------------------------------------------------------------------
$markerContent = "Rootstrap installed at $(Get-Date -Format 'o')`n"
foreach ($info in $rootstrapInfo) {
    $markerContent += "  - $($info.DisplayName) (XML: $($info.XmlFile))`n"
}
$markerContent += "Structure: $structureType`n"
Set-Content -Path $rootstrapMarker -Value $markerContent -Encoding UTF8
Write-Success ".rootstrap-installed marker created: $rootstrapMarker"

Write-Success "Tizen Custom Rootstrap installation completed successfully!"
Write-Success "Installed rootstraps:"
foreach ($info in $rootstrapInfo) {
    Write-Success "  - $($info.DisplayName)"
}

exit 0
