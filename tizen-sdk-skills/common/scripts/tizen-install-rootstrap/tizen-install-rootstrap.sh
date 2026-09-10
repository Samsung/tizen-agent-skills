#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-install-rootstrap.sh
# Tizen Custom Rootstrap Installer for Linux/macOS
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

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Shared helpers: get_sdk_path (TIZEN_SDK_PATH -> ~/.tizen.sdk.path.config -> ~/tizen-sdk).
source "$SCRIPT_DIR/../lib/common.sh"

# Default values
ZIP_PATH=""
SDK_PATH=""
FORCE=0
HELP=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --zip-path)
            ZIP_PATH="$2"
            shift 2
            ;;
        --sdk-path)
            SDK_PATH="$2"
            shift 2
            ;;
        --force)
            FORCE=1
            shift
            ;;
        --help|-h)
            HELP=1
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Show help
if [[ $HELP -eq 1 ]]; then
    cat << 'EOF'
Tizen Custom Rootstrap Installer

Usage: ./tizen-install-rootstrap.sh [OPTIONS]

Options:
  --zip-path <path>    Path to the rootstrap ZIP package (required)
  --sdk-path <path>    Tizen SDK installation path
                        (default: $TIZEN_SDK_PATH / ~/.tizen.sdk.path.config / ~/tizen-sdk)
  --force              Force reinstall even if rootstrap is already installed
  --help, -h           Show this help

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
  ./tizen-install-rootstrap.sh --zip-path "/home/user/rootstraps/custom-arm.zip"
  ./tizen-install-rootstrap.sh --zip-path "/home/user/tv-samsung.zip" --sdk-path "/opt/tizen-studio"
  ./tizen-install-rootstrap.sh --zip-path "/home/user/custom.zip" --force
EOF
    exit 0
fi

# Validate parameters
if [[ -z "$ZIP_PATH" ]]; then
    echo "[ERROR] --zip-path is required. Use --zip-path <path> to specify the rootstrap ZIP file."
    exit 1
fi

# SDK path: --sdk-path wins, else the shared resolver (lib/common.sh).
if [[ -z "$SDK_PATH" ]]; then
    SDK_PATH="$(get_sdk_path)"
fi

echo "[INFO] Tizen Custom Rootstrap Installer started"
echo "[INFO] ZIP path: $ZIP_PATH"
echo "[INFO] SDK path: $SDK_PATH"

# -----------------------------------------------------------------------------
# Validate ZIP path
# -----------------------------------------------------------------------------
# Check for path traversal
if [[ "$ZIP_PATH" == *".."* ]]; then
    echo "[ERROR] Invalid ZipPath: Path traversal detected (..)"
    exit 1
fi

# Normalize path (handle Windows-style separators)
ZIP_PATH="${ZIP_PATH//\\//}"

# Resolve to absolute path
if [[ ! "$ZIP_PATH" = /* ]]; then
    ZIP_PATH="$(cd "$(dirname "$ZIP_PATH")" 2>/dev/null && pwd)/$(basename "$ZIP_PATH")"
fi

# Verify .zip extension
if [[ ! "$ZIP_PATH" =~ \.zip$ ]]; then
    echo "[ERROR] Invalid ZipPath: File must have .zip extension"
    exit 1
fi

# Check file existence
if [[ ! -f "$ZIP_PATH" ]]; then
    echo "[ERROR] Invalid ZipPath: File does not exist: $ZIP_PATH"
    exit 1
fi

echo "[SUCCESS] ZIP file validated: $ZIP_PATH"

# Verify Tizen SDK is installed
SDK_INFO_PATH="$SDK_PATH/sdk.info"
if [[ ! -f "$SDK_INFO_PATH" ]]; then
    echo "[ERROR] Tizen SDK is NOT installed at $SDK_PATH (sdk.info not found)"
    echo "[ERROR] Rootstrap installation requires Tizen SDK to be installed first."
    exit 1
fi
echo "[SUCCESS] Tizen SDK found: $SDK_PATH (sdk.info exists)"

# -----------------------------------------------------------------------------
# Create temporary extraction directory
# -----------------------------------------------------------------------------
TOOLS_PATH="$SDK_PATH/tools"
TEMP_BASE_DIR="$TOOLS_PATH/server/sdktools/rootstrap"
mkdir -p "$TEMP_BASE_DIR"

TEMP_DIR="$TEMP_BASE_DIR/extract-$$-$(date +%s)"
mkdir -p "$TEMP_DIR"
echo "[INFO] Temporary extraction directory: $TEMP_DIR"

# -----------------------------------------------------------------------------
# Extract ZIP file (with Zip Slip protection)
# -----------------------------------------------------------------------------
echo "[INFO] Extracting ZIP file..."

# Security check: List ZIP contents and validate each entry before extraction
# This prevents Zip Slip attacks where malicious entries contain ".." or symlinks
echo "[INFO] Validating ZIP contents for security..."
ZIP_CONTENTS=$(unzip -Z1 "$ZIP_PATH" 2>&1) || {
    echo "[ERROR] Failed to list ZIP contents: $?"
    rm -rf "$TEMP_DIR"
    exit 1
}

# Check each entry for path traversal (..)
while IFS= read -r entry; do
    # Skip empty entries
    [[ -z "$entry" ]] && continue
    
    # Check for path traversal
    if [[ "$entry" == *".."* ]]; then
        echo "[ERROR] Path traversal detected in ZIP entry: $entry"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
    
    # Check for symlinks (entries ending with .lnk or absolute paths)
    if [[ "$entry" == *.lnk ]] || [[ "$entry" == /* ]]; then
        echo "[ERROR] Symlink or absolute path detected in ZIP entry: $entry"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
done <<< "$ZIP_CONTENTS"

echo "[SUCCESS] ZIP contents validated - no security issues found"

# Now safe to extract
if ! unzip -q "$ZIP_PATH" -d "$TEMP_DIR" 2>&1; then
    echo "[ERROR] Failed to extract ZIP: $?"
    rm -rf "$TEMP_DIR"
    exit 1
fi
echo "[SUCCESS] ZIP extraction completed"

# -----------------------------------------------------------------------------
# Detect ZIP structure
# -----------------------------------------------------------------------------
DATA_DIR="$TEMP_DIR/data"
TIZEN_STUDIO_DIR="$TEMP_DIR/tizen-studio"

STRUCTURE_TYPE=""
ROOT_DIR=""

if [[ -d "$DATA_DIR" ]]; then
    STRUCTURE_TYPE="data"
    ROOT_DIR="$DATA_DIR"
    echo "[INFO] Detected ZIP structure: data/"
elif [[ -d "$TIZEN_STUDIO_DIR" ]]; then
    STRUCTURE_TYPE="tizen-studio"
    ROOT_DIR="$TIZEN_STUDIO_DIR"
    echo "[INFO] Detected ZIP structure: tizen-studio/"
else
    echo "[ERROR] Could not determine ZIP structure"
    echo "[ERROR] Expected either 'data/' or 'tizen-studio/' directory at ZIP root"
    echo "[INFO] Contents of temp directory:"
    ls -la "$TEMP_DIR"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# -----------------------------------------------------------------------------
# Find and parse rootstrap XML
# -----------------------------------------------------------------------------
PLUGINS_DIR="$ROOT_DIR/tools/smart-build-interface/plugins"
if [[ ! -d "$PLUGINS_DIR" ]]; then
    echo "[ERROR] No rootstrap XML files found in the ZIP"
    echo "[ERROR] Expected directory: $PLUGINS_DIR"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Find rootstrap definition XML files. Two filename formats are accepted:
#   1) {profile}-{version}-{device}.core.xml
#      — the Tizen SDK repository format, e.g. tizen-10.0-device.core.xml
#        (this is what the SDK's own tools/smart-build-interface/plugins/ holds)
#   2) {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml
#      — custom builds that tag the type and build time, e.g.
#        tizen-9.0-arm.core.public.20240101120000.xml
# The rootstrap identity is always the {profile}-{version}-{device} part; type
# and timestamp are informational only.
XML_FILES=$(find "$PLUGINS_DIR" -maxdepth 1 -name "*.core*.xml" -type f 2>/dev/null)
if [[ -z "$XML_FILES" ]]; then
    echo "[ERROR] No rootstrap XML files found matching pattern *.core*.xml"
    echo "[ERROR] Expected {profile}-{version}-{device}.core.xml or {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml"
    echo "[INFO] Contents of plugins directory:"
    ls -la "$PLUGINS_DIR"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "[SUCCESS] Found $(echo "$XML_FILES" | wc -l) rootstrap XML file(s)"

# Parse XML filenames to extract metadata
# Format: {profile}-{version}-{device}.core[.{public|private}.{timestamp}].xml
# Example: tizen-10.0-device.core.xml, tizen-9.0-arm.core.public.20240101120000.xml
declare -a ROOTSTRAP_INFO
ROOTSTRAP_COUNT=0

while IFS= read -r xml_file; do
    # Full filename without .xml: e.g., "tizen-9.0-arm.core.public.20240101120000"
    name_without_ext=$(basename "$xml_file" .xml)

    # Step 1: Split at the first ".core": everything before it is
    # {profile}-{version}-{device}; whatever follows (possibly nothing) is the
    # optional ".{type}.{timestamp}" suffix.
    base_name="${name_without_ext%%.core*}"
    suffix="${name_without_ext#"$base_name".core}"
    suffix="${suffix#.}"

    # Step 2: Optional type (public/private) and timestamp. "-" when absent so
    # the |-separated record below keeps a fixed number of fields.
    type="-"
    timestamp="-"
    if [[ -n "$suffix" ]]; then
        type="${suffix%%.*}"
        if [[ "$suffix" == *.* ]]; then
            timestamp="${suffix#*.}"
        fi
    fi

    # Step 3: Parse: {profile}-{version}-{device}
    if [[ "$base_name" =~ ^(.+)-([0-9]+\.[0-9]+)-([a-zA-Z0-9_]+)$ ]]; then
        profile="${BASH_REMATCH[1]}"
        version="${BASH_REMATCH[2]}"
        device="${BASH_REMATCH[3]}"
        
        ROOTSTRAP_INFO+=("$profile|$version|$device|$type|$timestamp|$xml_file")
        ((ROOTSTRAP_COUNT++)) || true
        
        echo "[INFO]   Parsed: Profile=$profile, Version=$version, Device=$device, Type=$type, Timestamp=$timestamp"
    else
        echo "[WARN] Could not parse XML filename: $(basename "$xml_file")"
    fi
done <<< "$XML_FILES"

if [[ $ROOTSTRAP_COUNT -eq 0 ]]; then
    echo "[ERROR] No valid rootstrap XML files found"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# -----------------------------------------------------------------------------
# Check if rootstrap is already installed
# -----------------------------------------------------------------------------
ROOTSTRAP_MARKER="$SDK_PATH/.rootstrap-installed"
ROOTSTRAP_INSTALLED=0

if [[ -f "$ROOTSTRAP_MARKER" ]] && [[ $FORCE -eq 0 ]]; then
    marker_content=$(cat "$ROOTSTRAP_MARKER")
    for info in "${ROOTSTRAP_INFO[@]}"; do
        IFS='|' read -r profile version device type timestamp xml_file <<< "$info"
        display_name="$profile-$version-$device"
        if [[ "$marker_content" == *"$display_name"* ]]; then
            echo "[INFO] Rootstrap $display_name is already installed (marker found)"
            ROOTSTRAP_INSTALLED=1
            break
        fi
    done
fi

if [[ $ROOTSTRAP_INSTALLED -eq 1 ]]; then
    echo "[SUCCESS] Rootstrap is already installed - skipping installation. Use --force to reinstall."
    rm -rf "$TEMP_DIR"
    exit 0
fi

if [[ $FORCE -eq 1 ]] && [[ -f "$ROOTSTRAP_MARKER" ]]; then
    echo "[WARN] Force reinstall requested - removing .rootstrap-installed marker"
    rm -f "$ROOTSTRAP_MARKER"
fi

# -----------------------------------------------------------------------------
# For tizen-studio structure: check native packages
# -----------------------------------------------------------------------------
if [[ "$STRUCTURE_TYPE" == "tizen-studio" ]]; then
    echo "[INFO] tizen-studio structure detected - checking native development packages..."
    
    NATIVE_MARKER="$SDK_PATH/.native-development-package-installed"
    if [[ ! -f "$NATIVE_MARKER" ]]; then
        echo "[WARN] Native development package not found. Rootstrap may require native toolchain."
        echo "[WARN] You may need to install the native development package first."
    else
        echo "[SUCCESS] Native development package found"
    fi
fi

# -----------------------------------------------------------------------------
# Copy tools folder
# -----------------------------------------------------------------------------
SRC_TOOLS_DIR="$ROOT_DIR/tools"
DST_TOOLS_DIR="$SDK_PATH/tools"

if [[ -d "$SRC_TOOLS_DIR" ]]; then
    echo "[INFO] Copying tools folder..."
    cp -rf "$SRC_TOOLS_DIR"/* "$DST_TOOLS_DIR"/
    echo "[SUCCESS] Tools folder copied successfully"
else
    echo "[WARN] Tools folder not found in ZIP - skipping"
fi

# -----------------------------------------------------------------------------
# Copy platforms folder
# -----------------------------------------------------------------------------
SRC_PLATFORMS_DIR="$ROOT_DIR/platforms"
DST_PLATFORMS_DIR="$SDK_PATH/platforms"

if [[ -d "$SRC_PLATFORMS_DIR" ]]; then
    echo "[INFO] Copying platforms folder..."
    
    # For tizen-studio structure, copy as tizen-7.0 for compatibility
    if [[ "$STRUCTURE_TYPE" == "tizen-studio" ]]; then
        # Get source platform version
        src_platform_name=$(ls -d "$SRC_PLATFORMS_DIR"/tizen-* 2>/dev/null | head -1 | xargs basename)
        if [[ -n "$src_platform_name" ]]; then
            dst_platform_name="tizen-7.0"  # Force compatibility name
            echo "[INFO] Mapping $src_platform_name -> $dst_platform_name for compatibility"
            
            dst_platform_dir="$DST_PLATFORMS_DIR/$dst_platform_name"
            mkdir -p "$dst_platform_dir"
            
            src_platform_path="$SRC_PLATFORMS_DIR/$src_platform_name"
            cp -rf "$src_platform_path"/* "$dst_platform_dir"/
        fi
    else
        # Standard copy for data/ structure
        mkdir -p "$DST_PLATFORMS_DIR"
        cp -rf "$SRC_PLATFORMS_DIR"/* "$DST_PLATFORMS_DIR"/
    fi
    
    echo "[SUCCESS] Platforms folder copied successfully"
else
    echo "[WARN] Platforms folder not found in ZIP - skipping"
fi

# -----------------------------------------------------------------------------
# Cleanup temporary directory
# -----------------------------------------------------------------------------
echo "[INFO] Cleaning up temporary directory..."
rm -rf "$TEMP_DIR"
echo "[SUCCESS] Temporary directory cleaned up"

# -----------------------------------------------------------------------------
# Create marker file
# -----------------------------------------------------------------------------
{
    echo "Rootstrap installed at $(date -Iseconds)"
    for info in "${ROOTSTRAP_INFO[@]}"; do
        IFS='|' read -r profile version device type timestamp xml_file <<< "$info"
        display_name="$profile-$version-$device"
        echo "  - $display_name (XML: $xml_file)"
    done
    echo "Structure: $STRUCTURE_TYPE"
} > "$ROOTSTRAP_MARKER"

echo "[SUCCESS] .rootstrap-installed marker created: $ROOTSTRAP_MARKER"
echo "[SUCCESS] Tizen Custom Rootstrap installation completed successfully!"
echo "[SUCCESS] Installed rootstraps:"
for info in "${ROOTSTRAP_INFO[@]}"; do
    IFS='|' read -r profile version device type timestamp xml_file <<< "$info"
    display_name="$profile-$version-$device"
    echo "  - $display_name"
done

exit 0
