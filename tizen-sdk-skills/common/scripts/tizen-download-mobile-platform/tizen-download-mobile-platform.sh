#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-download-mobile-platform.sh
# Tizen Mobile platform package downloader for Linux/macOS
#
# - Reads the CDN mirror URL from {SDK_PATH}/.package/repository.info
#   (falls back to the official repo if the file is missing)
# - Downloads pkg_list from the Tizen package repository
# - Auto-detects the latest MOBILE-X.Y platform (or uses --platform-version)
# - Resolves MOBILE-{version} and its Install-dependency packages
# - Downloads each from (repo + Path) and merges data/ into the SDK root
# - Optionally downloads IOT-Headed extension:
#   1) Downloads extension_info.xml from the repository
#   2) Parses the XML to extract the IoT Headed repository URL
#   3) Downloads pkg_list from the IoT repository
#   4) Resolves and installs IOT-Headed-{version} package
# - Creates .mobile-platform-installed marker on success
#
# Exit codes:
#   0 = success
#   1 = failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Shared helpers: log_* (to stderr), get_sdk_path, pkg_os_base.
source "$SCRIPT_DIR/../lib/common.sh"

# Default values
SDK_PATH=""
PLATFORM_VERSION=""
INCLUDE_IOT_HEADED=false
IOT_HEADED_VERSION=""
IOT_TARGET_PACKAGE=""
FORCE=false
DRY_RUN=false
HELP=false

# Package repository (base URL for pkg_list and binary zip)
PKG_REPO="https://download.tizen.org/sdk/tizenstudio/official"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --sdk-path=*)
            SDK_PATH="${1#*=}"
            shift
            ;;
        --sdk-path)
            SDK_PATH="$2"
            shift 2
            ;;
        --platform-version=*)
            PLATFORM_VERSION="${1#*=}"
            shift
            ;;
        --platform-version)
            PLATFORM_VERSION="$2"
            shift 2
            ;;
        --include-iot-headed)
            INCLUDE_IOT_HEADED=true
            shift
            ;;
        --iot-headed-version=*)
            IOT_HEADED_VERSION="${1#*=}"
            shift
            ;;
        --iot-headed-version)
            IOT_HEADED_VERSION="$2"
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            HELP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Show help
if [[ "$HELP" == true ]]; then
    cat << 'EOF'
Tizen Mobile platform package downloader

Usage: ./tizen-download-mobile-platform.sh [OPTIONS]

Options:
  --sdk-path <path>           Tizen SDK installation path
                               (default: TIZEN_SDK_PATH / ~/.tizen.sdk.path.config / ~/tizen-sdk)
  --platform-version <ver>    Tizen Mobile platform version (e.g., "10.0", "11.0").
                               Auto-detects latest MOBILE-X.Y if not specified.
  --include-iot-headed        Also download and install the IOT-Headed extension.
  --iot-headed-version <ver>  Specific IOT-Headed version to install (e.g., "10.0").
                               Auto-detects latest if not specified.
  --force                     Force reinstall even if mobile platform package is already installed
  --dry-run                   Resolve and list packages only (no download/install)
  --help                      Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Reads repository.info for the CDN mirror URL
  3) Downloads/parses $PKG_REPO/pkg_list_$PKG_OS
  4) Auto-detects latest MOBILE-X.Y platform (or uses --platform-version)
  5) Resolves MOBILE-{version} and its Install-dependency packages
  6) Downloads each from (repo + Path) and merges data/ into the SDK root
  7) If --include-iot-headed is specified:
     a) Downloads extension_info.xml from the repository
     b) Parses the XML to extract the IoT Headed repository URL
     c) Downloads pkg_list from the IoT repository
     d) Resolves and installs IOT-Headed-{version} package
  8) Creates .mobile-platform-installed marker on success

Examples:
  ./tizen-download-mobile-platform.sh
  ./tizen-download-mobile-platform.sh --sdk-path /opt/tizen-studio
  ./tizen-download-mobile-platform.sh --platform-version 10.0
  ./tizen-download-mobile-platform.sh --include-iot-headed
  ./tizen-download-mobile-platform.sh --include-iot-headed --iot-headed-version 10.0
  ./tizen-download-mobile-platform.sh --dry-run
EOF
    exit 0
fi

# OS auto-detect: pkg_list OS token from lib/common.sh (windows | ubuntu | macos);
# any other Linux distro downloads the ubuntu packages.
PKG_OS_SHORT="$(pkg_os_base)"
[[ -n "$PKG_OS_SHORT" ]] || PKG_OS_SHORT="ubuntu"
PKG_OS="${PKG_OS_SHORT}-64"

log_info "Tizen Mobile platform package downloader started"

# Set default SDK path if not provided
# (TIZEN_SDK_PATH -> ~/.tizen.sdk.path.config -> ~/tizen-sdk, see get_sdk_path)
if [[ -z "$SDK_PATH" ]]; then
    SDK_PATH="$(get_sdk_path)"
fi

log_info "SDK path: $SDK_PATH"
log_info "Detected OS: $PKG_OS (pkg_list: pkg_list_$PKG_OS)"

# Verify Tizen SDK is installed
SDK_INFO_PATH="$SDK_PATH/sdk.info"
if [[ ! -f "$SDK_INFO_PATH" ]]; then
    log_error "Tizen SDK is NOT installed at $SDK_PATH (sdk.info not found)"
    log_error "Mobile platform package download requires Tizen SDK to be installed first."
    log_error "Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
fi
log_success "Tizen SDK found: $SDK_PATH (sdk.info exists)"

# Verify .package directory exists
PKG_INFO_DIR="$SDK_PATH/.package"
if [[ ! -d "$PKG_INFO_DIR" ]]; then
    log_error "No .package directory found at $SDK_PATH"
    log_error "The SDK may not have been installed properly."
    exit 1
fi
log_success "Package directory found: $PKG_INFO_DIR"

# Flag to track if we should skip MOBILE platform download (only download IOT-Headed)
SKIP_MOBILE_PLATFORM=false

# Check mode / skip if already installed
MOBILE_PKG_MARKER="$SDK_PATH/.mobile-platform-installed"
if [[ -f "$MOBILE_PKG_MARKER" && "$FORCE" == false ]]; then
    # Read the marker to check which platform version was installed
    MARKER_VERSION=$(grep "^Platform version:" "$MOBILE_PKG_MARKER" 2>/dev/null | sed 's/^Platform version:\s*//' || echo "")
    MARKER_IOT_HEADED=$(grep -c "^IOT-Headed:" "$MOBILE_PKG_MARKER" 2>/dev/null || true)
    MARKER_IOT_HEADED=${MARKER_IOT_HEADED:-0}
    
    if [[ -n "$MARKER_VERSION" && -n "$PLATFORM_VERSION" && "$MARKER_VERSION" == "$PLATFORM_VERSION" ]]; then
        log_success "Mobile platform package MOBILE-$PLATFORM_VERSION is already installed: $SDK_PATH"
        if [[ "$INCLUDE_IOT_HEADED" == true && "$MARKER_IOT_HEADED" == "0" ]]; then
            log_info "IOT-Headed extension was not installed previously. Will install IOT-Headed only (skipping MOBILE platform)."
            SKIP_MOBILE_PLATFORM=true
        else
            log_info ".mobile-platform-installed found (version $MARKER_VERSION). To reinstall, run again with --force"
            exit 0
        fi
    else
        log_info ".mobile-platform-installed found but for version '$MARKER_VERSION', requested '$PLATFORM_VERSION'. Proceeding with installation."
    fi
fi

if [[ "$FORCE" == true ]]; then
    log_warn "Force reinstall requested - removing .mobile-platform-installed marker"
    rm -f "$MOBILE_PKG_MARKER"
fi

# Read repository.info to use the same CDN mirror
REPO_INFO_FILE="$PKG_INFO_DIR/repository.info"
if [[ -f "$REPO_INFO_FILE" ]]; then
    REPO_URL=$(grep "^Repository=" "$REPO_INFO_FILE" | sed 's/^Repository=\s*//' | tr -d '\n')
    if [[ -n "$REPO_URL" ]]; then
        PKG_REPO="$REPO_URL"
        log_success "Using repository from repository.info: $PKG_REPO"
    fi
else
    log_warn "repository.info not found - falling back to official repo: $PKG_REPO"
fi

# Create working directory
WORKDIR=$(mktemp -d -t "tizen-mobile-pkg-XXXXXX")
trap 'rm -rf "$WORKDIR"' EXIT

PKGLIST="$WORKDIR/pkg_list"
PKGLIST_URL="$PKG_REPO/pkg_list_$PKG_OS"

log_info "Downloading package list: $PKGLIST_URL"
if ! curl -fsSL -o "$PKGLIST" "$PKGLIST_URL"; then
    log_error "Failed to download pkg_list"
    exit 1
fi
log_success "Package list downloaded successfully"

# Parse pkg_list
declare -A DB_PATH
declare -A DB_VERSION
declare -A DB_DEPS

CURRENT_PKG=""
while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^Package\ :\ (.+)$ ]]; then
        CURRENT_PKG="${BASH_REMATCH[1]}"
        CURRENT_PKG=$(echo "$CURRENT_PKG" | xargs)  # trim
        if [[ -z "${DB_PATH[$CURRENT_PKG]+x}" ]]; then
            DB_PATH[$CURRENT_PKG]=""
            DB_VERSION[$CURRENT_PKG]=""
            DB_DEPS[$CURRENT_PKG]=""
        fi
    elif [[ -n "$CURRENT_PKG" ]]; then
        if [[ "$line" =~ ^Version\ :\ (.+)$ ]]; then
            ver="${BASH_REMATCH[1]}"
            ver=$(echo "$ver" | xargs)
            if [[ -z "${DB_VERSION[$CURRENT_PKG]}" ]]; then
                DB_VERSION[$CURRENT_PKG]="$ver"
            fi
        elif [[ "$line" =~ ^Path\ :\ (.+)$ ]]; then
            path="${BASH_REMATCH[1]}"
            path=$(echo "$path" | xargs)
            if [[ -z "${DB_PATH[$CURRENT_PKG]}" ]]; then
                DB_PATH[$CURRENT_PKG]="$path"
            fi
        elif [[ "$line" =~ ^Install-dependency\ :\ (.+)$ && -z "${DB_DEPS[$CURRENT_PKG]}" ]]; then
            deps="${BASH_REMATCH[1]}"
            # Parse dependencies (simplified - no condition handling for bash)
            DB_DEPS[$CURRENT_PKG]="$deps"
        fi
    fi
done < "$PKGLIST"

log_success "Parsed ${#DB_PATH[@]} packages from pkg_list"

# Determine Mobile platform version
if [[ -n "$PLATFORM_VERSION" ]]; then
    TARGET_PACKAGE="MOBILE-$PLATFORM_VERSION"
    log_info "Using specified platform version: $PLATFORM_VERSION"
else
    # Auto-detect the latest MOBILE-X.Y platform
    PLATFORMS=()
    for key in "${!DB_PATH[@]}"; do
        if [[ "$key" =~ ^MOBILE-([0-9]+\.[0-9]+)$ ]]; then
            PLATFORMS+=("${BASH_REMATCH[1]}")
        fi
    done
    
    if [[ ${#PLATFORMS[@]} -eq 0 ]]; then
        log_error "No MOBILE platforms (MOBILE-X.Y) found in pkg_list"
        exit 1
    fi
    
    log_info "Available MOBILE platforms:"
    for v in "${PLATFORMS[@]}"; do
        log_info "    - MOBILE-$v"
    done
    
    # Sort versions and get latest
    IFS=$'\n' SORTED=($(sort -V <<<"${PLATFORMS[*]}")); unset IFS
    LATEST="${SORTED[-1]}"
    PLATFORM_VERSION="$LATEST"
    TARGET_PACKAGE="MOBILE-$LATEST"
    log_success "Auto-detected latest MOBILE platform: MOBILE-$LATEST -> target: $TARGET_PACKAGE"
fi

# Verify target package exists
if [[ -z "${DB_PATH[$TARGET_PACKAGE]+x}" ]]; then
    log_error "Target package not found in pkg_list: $TARGET_PACKAGE"
    log_error "Available MOBILE platform packages:"
    for key in "${!DB_PATH[@]}"; do
        if [[ "$key" =~ ^MOBILE-[0-9]+\.[0-9]+$ ]]; then
            log_error "  - $key"
        fi
    done
    exit 1
fi

log_success "Target package found: $TARGET_PACKAGE (version ${DB_VERSION[$TARGET_PACKAGE]})"

# Recursively resolve dependencies
log_info "Resolving dependencies (transitive Install-dependency)..."
RESOLVED=()
declare -A SEEN

# Metas whose closure is the SDK-WIDE baseline (VS tools add-ons, tizen-core,
# the C# CLI, certificate tools, ...). They are legitimate when the platform
# itself depends on them, but pulling them in through the shared-tool seed
# would turn "install the mobile platform" into a 30-package SDK refresh —
# keeping those current is tizen-update-package's job, not this script's.
declare -A SHARED_SEED_EXCLUDE=( [BASELINE-COMMON]=1 )

# resolve_from <seed> [exclude]   ("exclude" honours SHARED_SEED_EXCLUDE)
resolve_from() {
    local seed="$1" mode="${2:-}"
    QUEUE=("$seed")
    while [[ ${#QUEUE[@]} -gt 0 ]]; do
        CUR_PKG="${QUEUE[0]}"
        QUEUE=("${QUEUE[@]:1}")

        if [[ -n "${SEEN[$CUR_PKG]+x}" ]]; then
            continue
        fi
        if [[ "$mode" == "exclude" && -n "${SHARED_SEED_EXCLUDE[$CUR_PKG]+x}" ]]; then
            continue
        fi
        SEEN[$CUR_PKG]=1
        RESOLVED+=("$CUR_PKG")

        # Parse and add dependencies
        if [[ -n "${DB_DEPS[$CUR_PKG]:-}" ]]; then
            IFS=',' read -ra DEPS <<< "${DB_DEPS[$CUR_PKG]}"
            for dep in "${DEPS[@]}"; do
                dep=$(echo "$dep" | xargs)  # trim
                # Remove condition brackets if present
                dep=$(echo "$dep" | sed 's/\[.*\]//')
                dep=$(echo "$dep" | xargs)
                if [[ -n "$dep" && -z "${SEEN[$dep]+x}" ]]; then
                    QUEUE+=("$dep")
                fi
            done
        fi
    done
}

resolve_from "$TARGET_PACKAGE"

# MOBILE-X.Y's closure can include that platform's emulator resources (the
# mobile em-plugin jar) — but the shared emulator tools (emulator-manager,
# emulator-control-panel, sdb, ...) live under the SEPARATE "Emulator" meta
# package and are never in this closure. A new platform's plugin can therefore
# require a newer shared manager than the one installed with an older platform
# (observed as NoSuchFieldError: isVirgl on tizen-11.0).
#
# Widen the closure with the Emulator tools, but as SYNC-ONLY: packages reached
# only through this seed refresh an EXISTING install to the repo version and are
# never installed fresh — sync keeps things consistent, it does not grow the SDK.
# The SDK-wide baseline metas are excluded (see SHARED_SEED_EXCLUDE), so this
# adds the emulator tools themselves, not a whole-SDK refresh.
declare -A SHARED_SYNC_ONLY
if [[ -n "${DB_PATH[Emulator]+x}" ]]; then
    BEFORE=${#RESOLVED[@]}
    resolve_from "Emulator" exclude
    for pkg in "${RESOLVED[@]:$BEFORE}"; do
        SHARED_SYNC_ONLY[$pkg]=1
    done
    log_info "Shared 'Emulator' tools added to the resolve set (sync-only, ${#SHARED_SYNC_ONLY[@]} pkgs): ${!SHARED_SYNC_ONLY[*]}"
else
    log_warn "'Emulator' meta package not found in pkg_list — shared tools will not be checked for staleness."
fi

TOTAL=${#RESOLVED[@]}
log_success "Total resolved packages: $TOTAL"

# Dry-run: list only
if [[ "$DRY_RUN" == true ]]; then
    log_warn "[DRY-RUN] The following packages would be installed (no download/install):"
    n=0
    for pkg in "${RESOLVED[@]}"; do
        n=$((n + 1))
        p="${DB_PATH[$pkg]:-<no-binary>}"
        tag=""
        [[ -n "${SHARED_SYNC_ONLY[$pkg]+x}" ]] && tag=" [shared sync-only]"
        printf "    %3d. %-48s %s%s\n" "$n" "$pkg" "$p" "$tag"
    done
    exit 0
fi

# Download and merge each package
if [[ ! -d "$SDK_PATH" ]]; then
    mkdir -p "$SDK_PATH"
fi

IDX=0
OK=0
SKIP=0
FAIL=0

# Skip MOBILE platform download if only IOT-Headed is needed
if [[ "$SKIP_MOBILE_PLATFORM" == true ]]; then
    log_info "Skipping MOBILE platform download (already installed) - only downloading IOT-Headed extension"
    OK=$TOTAL
    SKIP=$TOTAL
else
for pkg in "${RESOLVED[@]}"; do
    IDX=$((IDX + 1))
    
    MANIFEST_FILE="$PKG_INFO_DIR/$pkg.manifest"

    # Shared-tool sync never installs something new — it only refreshes what
    # this SDK already has. A package reached solely through the "Emulator"
    # seed and not present locally is simply not part of this installation.
    if [[ -n "${SHARED_SYNC_ONLY[$pkg]+x}" && ! -f "$MANIFEST_FILE" ]]; then
        log_info "[$IDX/$TOTAL] $pkg: shared tool not previously installed — skip (sync refreshes existing installs only)"
        SKIP=$((SKIP + 1))
        continue
    fi

    # Skip if already installed
    if [[ -f "$MANIFEST_FILE" && "$FORCE" == false ]]; then
        INSTALLED_VERSION=$(grep "^Version :" "$MANIFEST_FILE" | sed 's/^Version :\s*//' | tr -d '\n' || echo "")
        REPO_VERSION="${DB_VERSION[$pkg]}"
        if [[ -n "$INSTALLED_VERSION" && -n "$REPO_VERSION" && "$INSTALLED_VERSION" == "$REPO_VERSION" ]]; then
            log_info "[$IDX/$TOTAL] $pkg already installed (version $INSTALLED_VERSION), skip"
            SKIP=$((SKIP + 1))
            continue
        else
            log_info "[$IDX/$TOTAL] $pkg: installed=$INSTALLED_VERSION repo=$REPO_VERSION, updating"
        fi
    fi
    
    REL_PATH="${DB_PATH[$pkg]}"
    if [[ -z "$REL_PATH" ]]; then
        log_warn "[$IDX/$TOTAL] $pkg: no binary path (meta/skip)"
        SKIP=$((SKIP + 1))
        continue
    fi
    
    URL="$PKG_REPO$REL_PATH"
    ZIP_FILE="$WORKDIR/$(basename "$REL_PATH")"
    log_info "[$IDX/$TOTAL] Downloading $pkg ..."
    if ! curl -fsSL -o "$ZIP_FILE" "$URL"; then
        log_error "[$IDX/$TOTAL] Download failed: $URL"
        FAIL=$((FAIL + 1))
        continue
    fi
    
    STAGE="$WORKDIR/stage_$IDX"
    mkdir -p "$STAGE"
    
    if ! unzip -q -o "$ZIP_FILE" -d "$STAGE" 2>/dev/null; then
        log_error "[$IDX/$TOTAL] Extraction failed: $pkg"
        FAIL=$((FAIL + 1))
        rm -f "$ZIP_FILE"
        rm -rf "$STAGE"
        continue
    fi
    
    # Merge data/ contents into the SDK root
    DATA_DIR="$STAGE/data"
    if [[ -d "$DATA_DIR" ]]; then
        if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
            if ! cp -rf "$DATA_DIR/"* "$SDK_PATH/" 2>/dev/null; then
                log_error "[$IDX/$TOTAL] Merge failed: $pkg"
                FAIL=$((FAIL + 1))
                rm -f "$ZIP_FILE"
                rm -rf "$STAGE"
                continue
            fi
        else
            log_info "[$IDX/$TOTAL] $pkg: data/ is empty, skip merge"
        fi
    fi
    
    # Keep manifest record
    MANIFEST="$STAGE/pkginfo.manifest"
    if [[ -f "$MANIFEST" ]]; then
        cp "$MANIFEST" "$PKG_INFO_DIR/$pkg.manifest"
    fi
    
    rm -f "$ZIP_FILE"
    rm -rf "$STAGE"
    OK=$((OK + 1))
    log_success "[$IDX/$TOTAL] $pkg installed"
done
fi

log_success "Mobile platform package result: OK $OK / skipped $SKIP / failed $FAIL (total $TOTAL)"

if [[ $FAIL -gt 0 ]]; then
    log_error "Some packages failed to install. Not creating .mobile-platform-installed marker."
    exit 1
fi

# -----------------------------------------------------------------------------
# IOT-Headed Extension (optional)
# -----------------------------------------------------------------------------
IOT_HEADED_INSTALLED=false

if [[ "$INCLUDE_IOT_HEADED" == true ]]; then
    log_info "IOT-Headed extension requested (--include-iot-headed)"
    
    # Initialize download failure flag at entry point to avoid unbound variable error under set -u
    IOT_PKGLIST_DOWNLOAD_FAILED=false
    
    # Download extension_info.xml to get the IoT Headed repository URL
    EXTENSION_INFO_URL="$PKG_REPO/extension_info.xml"
    EXTENSION_INFO_FILE="$WORKDIR/extension_info.xml"
    
    log_info "Downloading extension info: $EXTENSION_INFO_URL"
    if curl -fsSL -o "$EXTENSION_INFO_FILE" "$EXTENSION_INFO_URL" 2>/dev/null; then
        # Parse the XML to extract IoT Headed repository URL
        # Look for <extension> block containing <name>Tizen IoT Headed</name> followed by <repository>
        IOT_REPO=""
        
        # Use perl for multi-line regex matching to find Tizen IoT Headed extension's repository
        IOT_REPO=$(perl -0777 -ne 'if (/<extension[^>]*>.*?<name[^>]*>Tizen IoT Headed<\/name>.*?<repository[^>]*>([^<]+)<\/repository>/s) { print $1; }' "$EXTENSION_INFO_FILE" 2>/dev/null | xargs || echo "")
        
        # Fallback: try grep with context if perl fails
        if [[ -z "$IOT_REPO" ]]; then
            # Look for line containing "Tizen IoT Headed" and get the repository from nearby lines
            if grep -q "Tizen IoT Headed" "$EXTENSION_INFO_FILE"; then
                IOT_REPO=$(grep -A2 "Tizen IoT Headed" "$EXTENSION_INFO_FILE" | grep -oP '<repository[^>]*>\K[^<]+' | head -1 | xargs || echo "")
            fi
        fi
        
        # Trim any remaining whitespace/newlines from IOT_REPO
        IOT_REPO=$(echo "$IOT_REPO" | tr -d '\n\r\t' | xargs)
        
        if [[ -n "$IOT_REPO" ]]; then
            log_success "Found IOT-Headed repository: $IOT_REPO"
            
            # Download pkg_list from IoT repository
            IOT_PKGLIST_URL="$IOT_REPO/pkg_list_$PKG_OS"
            IOT_PKGLIST="$WORKDIR/pkg_list_iot"
            
            log_info "Downloading IOT-Headed package list: $IOT_PKGLIST_URL"
            if ! curl -fsSL -o "$IOT_PKGLIST" "$IOT_PKGLIST_URL" 2>/dev/null; then
                # Try 32-bit if 64-bit fails
                if [[ "$PKG_OS" == "macos-64" || "$PKG_OS" == "ubuntu-64" ]]; then
                    IOT_PKGLIST_URL="$IOT_REPO/pkg_list_$PKG_OS_SHORT-32"
                    log_warn "64-bit pkg_list not found, trying 32-bit: $IOT_PKGLIST_URL"
                    if ! curl -fsSL -o "$IOT_PKGLIST" "$IOT_PKGLIST_URL" 2>/dev/null; then
                        log_error "Failed to download IOT-Headed pkg_list"
                        IOT_REPO=""
                        IOT_PKGLIST_DOWNLOAD_FAILED=true
                    fi
                else
                    log_error "Failed to download IOT-Headed pkg_list"
                    IOT_REPO=""
                    IOT_PKGLIST_DOWNLOAD_FAILED=true
                fi
            fi
        else
            log_error "Could not find IOT-Headed repository URL in extension_info.xml"
            log_warn "IOT-Headed extension will NOT be installed."
        fi
    else
        log_error "Failed to download extension_info.xml"
        log_warn "IOT-Headed extension will NOT be installed."
    fi
    
    if [[ "$IOT_PKGLIST_DOWNLOAD_FAILED" == true ]]; then
        log_warn "IOT-Headed extension will NOT be installed. Continuing with Mobile platform only."
        IOT_REPO=""
    elif [[ -n "$IOT_REPO" && -f "$IOT_PKGLIST" ]]; then
        log_success "IOT-Headed package list downloaded successfully"
        
        # Parse IoT pkg_list
        declare -A IOT_DB_PATH
        declare -A IOT_DB_VERSION
        declare -A IOT_DB_DEPS
        
        IOT_CURRENT_PKG=""
        while IFS= read -r line || [[ -n "$line" ]]; do
            if [[ "$line" =~ ^Package\ :\ (.+)$ ]]; then
                IOT_CURRENT_PKG="${BASH_REMATCH[1]}"
                IOT_CURRENT_PKG=$(echo "$IOT_CURRENT_PKG" | xargs)
                if [[ -z "${IOT_DB_PATH[$IOT_CURRENT_PKG]+x}" ]]; then
                    IOT_DB_PATH[$IOT_CURRENT_PKG]=""
                    IOT_DB_VERSION[$IOT_CURRENT_PKG]=""
                    IOT_DB_DEPS[$IOT_CURRENT_PKG]=""
                fi
            elif [[ -n "$IOT_CURRENT_PKG" ]]; then
                if [[ "$line" =~ ^Version\ :\ (.+)$ ]]; then
                    ver="${BASH_REMATCH[1]}"
                    ver=$(echo "$ver" | xargs)
                    if [[ -z "${IOT_DB_VERSION[$IOT_CURRENT_PKG]}" ]]; then
                        IOT_DB_VERSION[$IOT_CURRENT_PKG]="$ver"
                    fi
                elif [[ "$line" =~ ^Path\ :\ (.+)$ ]]; then
                    path="${BASH_REMATCH[1]}"
                    path=$(echo "$path" | xargs)
                    if [[ -z "${IOT_DB_PATH[$IOT_CURRENT_PKG]}" ]]; then
                        IOT_DB_PATH[$IOT_CURRENT_PKG]="$path"
                    fi
                elif [[ "$line" =~ ^Install-dependency\ :\ (.+)$ && -z "${IOT_DB_DEPS[$IOT_CURRENT_PKG]}" ]]; then
                    IOT_DB_DEPS[$IOT_CURRENT_PKG]="${BASH_REMATCH[1]}"
                fi
            fi
        done < "$IOT_PKGLIST"
        
        log_success "Parsed ${#IOT_DB_PATH[@]} packages from IOT-Headed pkg_list"
        
        # Determine IOT-Headed version
        if [[ -n "$IOT_HEADED_VERSION" ]]; then
            IOT_TARGET_PACKAGE="IOT-Headed-$IOT_HEADED_VERSION"
            log_info "Using specified IOT-Headed version: $IOT_HEADED_VERSION"
        else
            # Auto-detect the latest IOT-Headed-X.Y package
            IOT_PLATFORMS=()
            for key in "${!IOT_DB_PATH[@]}"; do
                if [[ "$key" =~ ^IOT-Headed-([0-9]+\.[0-9]+)$ ]]; then
                    IOT_PLATFORMS+=("${BASH_REMATCH[1]}")
                fi
            done
            
            if [[ ${#IOT_PLATFORMS[@]} -eq 0 ]]; then
                log_error "No IOT-Headed platforms (IOT-Headed-X.Y) found in pkg_list"
                log_warn "IOT-Headed extension will NOT be installed."
            else
                log_info "Available IOT-Headed platforms:"
                for v in "${IOT_PLATFORMS[@]}"; do
                    log_info "    - IOT-Headed-$v"
                done
                
                IFS=$'\n' IOT_SORTED=($(sort -V <<<"${IOT_PLATFORMS[*]}")); unset IFS
                IOT_LATEST="${IOT_SORTED[-1]}"
                IOT_HEADED_VERSION="$IOT_LATEST"
                IOT_TARGET_PACKAGE="IOT-Headed-$IOT_LATEST"
                log_success "Auto-detected latest IOT-Headed: IOT-Headed-$IOT_LATEST -> target: $IOT_TARGET_PACKAGE"
            fi
        fi
        
        # Install IOT-Headed if target was determined
        if [[ -n "$IOT_TARGET_PACKAGE" && -n "${IOT_DB_PATH[$IOT_TARGET_PACKAGE]+x}" ]]; then
            log_success "IOT-Headed target package found: $IOT_TARGET_PACKAGE (version ${IOT_DB_VERSION[$IOT_TARGET_PACKAGE]})"
            
            # Resolve IOT-Headed dependencies
            log_info "Resolving IOT-Headed dependencies..."
            IOT_RESOLVED=()
            declare -A IOT_SEEN
            IOT_QUEUE=("$IOT_TARGET_PACKAGE")
            
            while [[ ${#IOT_QUEUE[@]} -gt 0 ]]; do
                IOT_CUR_PKG="${IOT_QUEUE[0]}"
                IOT_QUEUE=("${IOT_QUEUE[@]:1}")
                
                if [[ -n "${IOT_SEEN[$IOT_CUR_PKG]+x}" ]]; then
                    continue
                fi
                IOT_SEEN[$IOT_CUR_PKG]=1
                IOT_RESOLVED+=("$IOT_CUR_PKG")
                
                if [[ -n "${IOT_DB_DEPS[$IOT_CUR_PKG]}" ]]; then
                    IFS=',' read -ra IOT_DEPS <<< "${IOT_DB_DEPS[$IOT_CUR_PKG]}"
                    for dep in "${IOT_DEPS[@]}"; do
                        dep=$(echo "$dep" | xargs)
                        dep=$(echo "$dep" | sed 's/\[.*\]//')
                        dep=$(echo "$dep" | xargs)
                        if [[ -n "$dep" && -z "${IOT_SEEN[$dep]+x}" ]]; then
                            IOT_QUEUE+=("$dep")
                        fi
                    done
                fi
            done
            
            IOT_TOTAL=${#IOT_RESOLVED[@]}
            log_success "Total IOT-Headed resolved packages: $IOT_TOTAL"
            
            # Download and install IOT-Headed packages
            IOT_IDX=0
            IOT_OK=0
            IOT_SKIP=0
            IOT_FAIL=0
            
            for pkg in "${IOT_RESOLVED[@]}"; do
                IOT_IDX=$((IOT_IDX + 1))
                
                # Skip if already installed
                IOT_MANIFEST_FILE="$PKG_INFO_DIR/$pkg.manifest"
                if [[ -f "$IOT_MANIFEST_FILE" && "$FORCE" == false ]]; then
                    IOT_INSTALLED_VERSION=$(grep "^Version :" "$IOT_MANIFEST_FILE" | sed 's/^Version :\s*//' | tr -d '\n' || echo "")
                    IOT_REPO_VERSION="${IOT_DB_VERSION[$pkg]}"
                    if [[ -n "$IOT_INSTALLED_VERSION" && -n "$IOT_REPO_VERSION" && "$IOT_INSTALLED_VERSION" == "$IOT_REPO_VERSION" ]]; then
                        log_info "[IOT $IOT_IDX/$IOT_TOTAL] $pkg already installed (version $IOT_INSTALLED_VERSION), skip"
                        IOT_SKIP=$((IOT_SKIP + 1))
                        continue
                    fi
                fi
                
                IOT_REL_PATH="${IOT_DB_PATH[$pkg]}"
                if [[ -z "$IOT_REL_PATH" ]]; then
                    log_warn "[IOT $IOT_IDX/$IOT_TOTAL] $pkg: no binary path (meta/skip)"
                    IOT_SKIP=$((IOT_SKIP + 1))
                    continue
                fi
                
                IOT_URL="$IOT_REPO$IOT_REL_PATH"
                IOT_ZIP_FILE="$WORKDIR/$(basename "$IOT_REL_PATH")"
                log_info "[IOT $IOT_IDX/$IOT_TOTAL] Downloading $pkg ..."
                if ! curl -fsSL -o "$IOT_ZIP_FILE" "$IOT_URL"; then
                    log_error "[IOT $IOT_IDX/$IOT_TOTAL] Download failed: $IOT_URL"
                    IOT_FAIL=$((IOT_FAIL + 1))
                    continue
                fi
                
                IOT_STAGE="$WORKDIR/iot_stage_$IOT_IDX"
                mkdir -p "$IOT_STAGE"
                
                if ! unzip -q -o "$IOT_ZIP_FILE" -d "$IOT_STAGE" 2>/dev/null; then
                    log_error "[IOT $IOT_IDX/$IOT_TOTAL] Extraction failed: $pkg"
                    IOT_FAIL=$((IOT_FAIL + 1))
                    rm -f "$IOT_ZIP_FILE"
                    rm -rf "$IOT_STAGE"
                    continue
                fi
                
                # Merge data/ contents into the SDK root
                IOT_DATA_DIR="$IOT_STAGE/data"
                if [[ -d "$IOT_DATA_DIR" ]]; then
                    if [[ -n "$(ls -A "$IOT_DATA_DIR" 2>/dev/null)" ]]; then
                        if ! cp -rf "$IOT_DATA_DIR/"* "$SDK_PATH/" 2>/dev/null; then
                            log_error "[IOT $IOT_IDX/$IOT_TOTAL] Merge failed: $pkg"
                            IOT_FAIL=$((IOT_FAIL + 1))
                            rm -f "$IOT_ZIP_FILE"
                            rm -rf "$IOT_STAGE"
                            continue
                        fi
                    fi
                fi
                
                # Keep manifest record
                IOT_MANIFEST="$IOT_STAGE/pkginfo.manifest"
                if [[ -f "$IOT_MANIFEST" ]]; then
                    cp "$IOT_MANIFEST" "$PKG_INFO_DIR/$pkg.manifest"
                fi
                
                rm -f "$IOT_ZIP_FILE"
                rm -rf "$IOT_STAGE"
                IOT_OK=$((IOT_OK + 1))
                log_success "[IOT $IOT_IDX/$IOT_TOTAL] $pkg installed"
            done
            
            log_success "IOT-Headed extension result: OK $IOT_OK / skipped $IOT_SKIP / failed $IOT_FAIL (total $IOT_TOTAL)"
            
            if [[ $IOT_FAIL -eq 0 ]]; then
                IOT_HEADED_INSTALLED=true
                log_success "IOT-Headed extension installed successfully!"
            else
                log_warn "Some IOT-Headed packages failed to install."
            fi
        fi
    fi
fi

# Create/update .mobile-platform-installed marker
if [[ "$SKIP_MOBILE_PLATFORM" == true && "$IOT_HEADED_INSTALLED" == true ]]; then
    # MOBILE platform already exists, just append IOT-Headed status
    if ! grep -q "^IOT-Headed:" "$MOBILE_PKG_MARKER" 2>/dev/null; then
        {
            echo "IOT-Headed: installed"
            echo "IOT-Headed version: $IOT_HEADED_VERSION"
            echo "Updated at: $(date -Iseconds)"
        } >> "$MOBILE_PKG_MARKER"
        log_success ".mobile-platform-installed updated with IOT-Headed status"
    fi
else
    {
        echo "Mobile platform package installed at $(date -Iseconds)"
        echo "Target: $TARGET_PACKAGE"
        echo "Platform version: $PLATFORM_VERSION"
        if [[ "$IOT_HEADED_INSTALLED" == true ]]; then
            echo "IOT-Headed: installed"
            echo "IOT-Headed version: $IOT_HEADED_VERSION"
        fi
    } > "$MOBILE_PKG_MARKER"
    log_success ".mobile-platform-installed created: $MOBILE_PKG_MARKER"
fi
log_success "Tizen Mobile platform package download completed!"
exit 0
