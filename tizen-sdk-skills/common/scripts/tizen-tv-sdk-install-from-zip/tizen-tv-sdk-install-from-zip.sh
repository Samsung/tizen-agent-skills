#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-tv-sdk-install-from-zip.sh
# Tizen TV SDK extension installer from a local ZIP file (offline) for Linux/macOS
#
# - Accepts a local ZIP file path containing the TV SDK bundle
# - Extracts the main ZIP to a temp directory
# - Locates inner ZIPs (binary/ dir first, then root)
# - Detects TV milestone version from inner ZIP filenames (majority vote);
#   --tv-version states it, and the install stops when the two disagree or
#   neither is known
# - Skips a TV version .platform-installed already records (other TV versions
#   install side by side)
# - Extracts each inner ZIP directly into the SDK tools path
# - Copies pkg_list snapshot files
# - Records the TV version in .platform-installed and creates the
#   .tv-sdk-installed marker on success

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Shared helpers: get_sdk_path, log_info/log_ok/log_warn/log_error, to_absolute_path.
source "$SCRIPT_DIR/../lib/common.sh"

# Defaults (SDK path resolution: TIZEN_SDK_PATH -> ~/.tizen.sdk.path.config -> ~/tizen-sdk)
SDK_PATH="$(get_sdk_path)"
ZIP_PATH=""
TV_VERSION_ARG=""
FORCE=false
CHECK=false
WAIT=false
STATUS=false
DETACH=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --sdk-path=*)  SDK_PATH="${1#*=}"; shift ;;
        --sdk-path)    SDK_PATH="$2"; shift 2 ;;
        --zip-path=*)  ZIP_PATH="${1#*=}"; shift ;;
        --zip-path)    ZIP_PATH="$2"; shift 2 ;;
        --tv-version=*) TV_VERSION_ARG="${1#*=}"; shift ;;
        --tv-version)   TV_VERSION_ARG="${2:-}"; shift 2 ;;
        --force)       FORCE=true; shift ;;
        --check)       CHECK=true; shift ;;
        --wait)        WAIT=true; shift ;;
        --status)      STATUS=true; shift ;;
        --detach)      DETACH=true; shift ;;
        --help|-h)
            cat <<EOF
Tizen TV SDK extension installer (from local ZIP file)

Usage: $0 [OPTIONS]

Options:
  --sdk-path <path>   Tizen SDK installation path
                      (default: TIZEN_SDK_PATH / ~/.tizen.sdk.path.config / ~/tizen-sdk)
  --zip-path <path>   Path to the TV SDK ZIP file (required for install)
  --tv-version <X.Y>  TV platform version the ZIP is for (e.g. 9.0); required
                      when the inner ZIP names carry none
  --force             Reinstall even if TV SDK is already installed
  --check             Check TV SDK installation only
  --status            Check if a background install is still running
  --wait              Sleep 60 seconds then check status (for polling)
  --detach            Launch installer in background (detached)
  --help              Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Validates the ZIP file exists
  3) Extracts the main ZIP to a temp directory
  4) Locates inner ZIPs (binary/ dir first, then root)
  5) Detects TV milestone version from inner ZIP filenames (or --tv-version)
  6) Extracts each inner ZIP directly into the SDK tools path
  7) Copies pkg_list snapshot files
  8) Records the TV version in .platform-installed and creates the
     .tv-sdk-installed marker on success
EOF
            exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

# --tv-version reaches shell command lines and file names: X.Y only.
if [[ -n "$TV_VERSION_ARG" && ! "$TV_VERSION_ARG" =~ ^[0-9]+\.[0-9]+$ ]]; then
    log_error "Invalid --tv-version \"$TV_VERSION_ARG\". Expected MAJOR.MINOR such as 9.0 or 11.0."
    exit 2
fi

# --status: check if a background install is still running.
# --wait: the same, after a 60-second sleep.
if [[ "$WAIT" == "true" || "$STATUS" == "true" ]]; then
    [[ "$WAIT" == "true" ]] && sleep 60
    TV_SDK_MARKER="${SDK_PATH}/.tv-sdk-installed"
    if [[ -f "$TV_SDK_MARKER" ]]; then
        echo "STATUS=done EXIT=0"
    elif installer_running "tizen-tv-sdk-install-from-zip.sh"; then
        echo "STATUS=running"
    else
        echo "STATUS=done EXIT=1"
    fi
    exit 0
fi

# --detach: re-launch in background
if [[ "$DETACH" == "true" ]]; then
    # --force only when it was given. (The old ":+" parameter expansion fired for
    # FORCE=false too, since "false" is non-empty, so every detached run was forced.)
    detach_args=(--sdk-path="$SDK_PATH" --zip-path="$ZIP_PATH")
    [[ -n "$TV_VERSION_ARG" ]] && detach_args+=(--tv-version="$TV_VERSION_ARG")
    [[ "$FORCE" == "true" ]] && detach_args+=(--force)
    nohup bash "$0" "${detach_args[@]}" > /tmp/tizen-tv-sdk-install-from-zip.log 2>&1 &
    jobs -p
    exit 0
fi

log_info "Tizen TV SDK extension installer (from ZIP) started"
log_info "SDK path: $SDK_PATH"
log_info "ZIP path: $ZIP_PATH"

# Verify Tizen SDK is installed
SDK_INFO_PATH="${SDK_PATH}/sdk.info"
if [[ ! -f "$SDK_INFO_PATH" ]]; then
    log_error "Tizen SDK is NOT installed at $SDK_PATH (sdk.info not found)"
    log_error "TV SDK requires Tizen SDK to be installed first."
    log_error "Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
fi
log_ok "Tizen SDK found: $SDK_PATH (sdk.info exists)"

TV_SDK_MARKER="${SDK_PATH}/.tv-sdk-installed"

# Check mode: is any TV version recorded (or, with --tv-version, that one)?
if [[ "$CHECK" == "true" ]]; then
    if [[ -n "$TV_VERSION_ARG" ]]; then
        if tv_version_recorded "$SDK_PATH" "$TV_VERSION_ARG"; then
            log_ok "TV SDK $TV_VERSION_ARG is already installed: $SDK_PATH (recorded in .platform-installed)"
            exit 0
        fi
        log_info "TV SDK $TV_VERSION_ARG is NOT installed (not recorded in .platform-installed)"
        exit 1
    fi
    if platform_records "$SDK_PATH" | awk '$2 == "tv" || $2 ~ /^tv-samsung/ { f = 1 } END { exit !f }' || [[ -f "$TV_SDK_MARKER" ]]; then
        log_ok "TV SDK is already installed: $SDK_PATH"
        exit 0
    fi
    log_info "TV SDK is NOT installed (no TV version recorded in .platform-installed)"
    exit 1
fi

# An older install left only .tv-sdk-installed: record its TV version first
# (migrate_tv_sdk_marker, lib/common.sh), so it is still reported after this
# run replaces the marker.
migrate_tv_sdk_marker "$SDK_PATH" || true

# Skip a TV version that is already recorded; other TV versions install side
# by side. Without --tv-version the version is known only after the ZIP is
# opened, and is checked again there.
if [[ -n "$TV_VERSION_ARG" && "$FORCE" == "false" ]] && tv_version_recorded "$SDK_PATH" "$TV_VERSION_ARG"; then
    log_ok "TV SDK $TV_VERSION_ARG is already installed: $SDK_PATH (recorded in .platform-installed)"
    log_info "To reinstall, run again with --force"
    exit 0
fi

# Validate ZIP path
if [[ -z "$ZIP_PATH" ]]; then
    log_error "--zip-path is required. Specify the path to the TV SDK ZIP file."
    exit 1
fi

ZIP_PATH="$(to_absolute_path "$ZIP_PATH")"
if [[ ! -f "$ZIP_PATH" ]]; then
    log_error "ZIP file not found: $ZIP_PATH"
    exit 1
fi
log_ok "ZIP file found: $ZIP_PATH"

# -----------------------------------------------------------------------------
# Extract main ZIP to temp directory
# -----------------------------------------------------------------------------

WORKDIR="$(mktemp -d -t tizen-tv-sdk-zip-XXXXXX)"
log_info "Extracting main ZIP to temp directory: $WORKDIR"

if ! unzip -qo "$ZIP_PATH" -d "$WORKDIR" 2>/dev/null; then
    log_error "Failed to extract main ZIP: $ZIP_PATH"
    rm -rf "$WORKDIR"
    exit 1
fi
log_ok "Main ZIP extracted successfully"

# -----------------------------------------------------------------------------
# Locate inner ZIP files (binary/ dir first, then root)
# -----------------------------------------------------------------------------

INNER_DIR=""
if [[ -d "${WORKDIR}/binary" ]]; then
    INNER_DIR="${WORKDIR}/binary"
    log_info "Found binary/ directory with inner ZIPs"
elif [[ -d "${WORKDIR}/data/binary" ]]; then
    INNER_DIR="${WORKDIR}/data/binary"
    log_info "Found data/binary/ directory with inner ZIPs"
else
    INNER_DIR="$WORKDIR"
    log_info "No binary/ directory found — using root of extracted ZIP"
fi

# Collect inner ZIP files
INNER_ZIPS=()
while IFS= read -r f; do
    INNER_ZIPS+=("$f")
done < <(find "$INNER_DIR" -maxdepth 1 -name '*.zip' -type f | sort)

if [[ ${#INNER_ZIPS[@]} -eq 0 ]]; then
    log_error "No inner ZIP files found in $INNER_DIR"
    rm -rf "$WORKDIR"
    exit 1
fi
log_ok "Found ${#INNER_ZIPS[@]} inner ZIP file(s)"

# -----------------------------------------------------------------------------
# Detect TV milestone version from inner ZIP filenames (majority vote)
# Excluded from voting: tv-samsung-libav*, tv-samsung-emulator-kernel*,
#   tv-samsung-log-server*, tv-samsung-emulator-lib*, tv-samsung-emulator-qemu*
# -----------------------------------------------------------------------------

declare -A VERSION_COUNTS
declare -A EXCLUDE_PATTERNS
EXCLUDE_PATTERNS[tv-samsung-libav]=1
EXCLUDE_PATTERNS[tv-samsung-emulator-kernel]=1
EXCLUDE_PATTERNS[tv-samsung-log-server]=1
EXCLUDE_PATTERNS[tv-samsung-emulator-lib]=1
EXCLUDE_PATTERNS[tv-samsung-emulator-qemu]=1

for zip in "${INNER_ZIPS[@]}"; do
    basename="$(basename "$zip" .zip)"
    # Extract package name (before last _)
    pkg_name="${basename%%_*}"
    # Skip excluded patterns
    for excl in "${!EXCLUDE_PATTERNS[@]}"; do
        if [[ "$basename" == "$excl"* ]]; then
            pkg_name=""
            break
        fi
    done
    if [[ -z "$pkg_name" ]]; then
        continue
    fi
    # Extract version (after last _)
    version_part="${basename##*_}"
    # Extract major.minor (first two numeric parts)
    milestone="$(echo "$version_part" | grep -oE '^[0-9]+\.[0-9]+' || true)"
    if [[ -n "$milestone" ]]; then
        VERSION_COUNTS[$milestone]=$(( ${VERSION_COUNTS[$milestone]:-0} + 1 ))
    fi
done

TV_MILESTONE=""
MAX_COUNT=0
for ver in "${!VERSION_COUNTS[@]}"; do
    if [[ ${VERSION_COUNTS[$ver]} -gt $MAX_COUNT ]]; then
        MAX_COUNT=${VERSION_COUNTS[$ver]}
        TV_MILESTONE="$ver"
    fi
done

if [[ -n "$TV_MILESTONE" ]]; then
    log_ok "Detected TV milestone version: $TV_MILESTONE (majority vote: $MAX_COUNT)"
else
    log_warn "Could not detect TV milestone version from ZIP filenames"
fi

# The version to record: --tv-version, checked against the ZIP. Stop here,
# before anything is extracted into the SDK, when they disagree or neither is
# known — a TV install that cannot be recorded would not be reported.
if [[ -n "$TV_VERSION_ARG" && -n "$TV_MILESTONE" && "$TV_VERSION_ARG" != "$TV_MILESTONE" ]]; then
    log_error "--tv-version $TV_VERSION_ARG does not match the ZIP, whose packages are for TV $TV_MILESTONE."
    log_error "Re-run with --tv-version $TV_MILESTONE, or use the TV $TV_VERSION_ARG ZIP."
    rm -rf "$WORKDIR"
    exit 2
fi
TV_VERSION="${TV_VERSION_ARG:-$TV_MILESTONE}"
if [[ -z "$TV_VERSION" ]]; then
    log_error "Cannot tell which TV version this ZIP is for (no X.Y in its inner ZIP names)."
    log_error "Re-run with --tv-version <X.Y>, e.g. --tv-version 9.0."
    rm -rf "$WORKDIR"
    exit 2
fi
if [[ "$FORCE" == "false" ]] && tv_version_recorded "$SDK_PATH" "$TV_VERSION"; then
    log_ok "TV SDK $TV_VERSION is already installed: $SDK_PATH (recorded in .platform-installed)"
    log_info "To reinstall, run again with --force"
    rm -rf "$WORKDIR"
    exit 0
fi

# --status reports "done" once the marker exists, so drop the previous run's
# marker before this one changes the SDK (its version is recorded above).
rm -f "$TV_SDK_MARKER"


# -----------------------------------------------------------------------------
# Process each inner ZIP: extract directly to SDK tools path
# -----------------------------------------------------------------------------

PKG_INFO_DIR="${SDK_PATH}/.package"
mkdir -p "$PKG_INFO_DIR"

IDX=0; OK=0; SKIP=0; FAIL=0
TOTAL=${#INNER_ZIPS[@]}

for zip in "${INNER_ZIPS[@]}"; do
    IDX=$((IDX+1))
    basename="$(basename "$zip")"
    log_info "[$IDX/$TOTAL] Processing $basename ..."

    # Extract inner ZIP directly to SDK path
    STAGE="${WORKDIR}/stage_${IDX}"
    rm -rf "$STAGE"
    mkdir -p "$STAGE"

    if ! unzip -qo "$zip" -d "$STAGE" 2>/dev/null; then
        log_error "[$IDX/$TOTAL] Extraction failed: $basename"
        FAIL=$((FAIL+1))
        rm -rf "$STAGE"
        continue
    fi

    # Merge data/ contents into the SDK root (if data/ exists)
    DATA_DIR="${STAGE}/data"
    if [[ -d "$DATA_DIR" ]]; then
        if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
            if ! cp -rf "$DATA_DIR"/* "$SDK_PATH"/ 2>/dev/null; then
                log_error "[$IDX/$TOTAL] Merge failed: $basename"
                FAIL=$((FAIL+1))
                rm -rf "$STAGE"
                continue
            fi
        else
            log_info "[$IDX/$TOTAL] $basename: data/ is empty, skip merge"
        fi
    else
        # No data/ dir — extract directly to SDK root
        if ! cp -rf "$STAGE"/* "$SDK_PATH"/ 2>/dev/null; then
            log_warn "[$IDX/$TOTAL] $basename: no data/ dir, direct copy may have partial content"
        fi
    fi

    # Keep manifest record
    MANIFEST="${STAGE}/pkginfo.manifest"
    if [[ -f "$MANIFEST" ]]; then
        # Derive package name from filename (before last _)
        pkg_name="${basename%%_*.zip}"
        cp -f "$MANIFEST" "${PKG_INFO_DIR}/${pkg_name}.manifest"
    fi

    rm -rf "$STAGE"
    OK=$((OK+1))
    log_ok "[$IDX/$TOTAL] $basename installed"
done

log_ok "TV SDK ZIP install result: OK $OK / skipped $SKIP / failed $FAIL (total $TOTAL)"

if [[ $FAIL -gt 0 ]]; then
    log_error "Some packages failed to install. Not creating .tv-sdk-installed marker."
    rm -rf "$WORKDIR"
    exit 1
fi

# -----------------------------------------------------------------------------
# Copy snapshot files (pkg_list) to SDK snapshots/tv-samsung/ dir
# -----------------------------------------------------------------------------

SNAPSHOT_DIR="${SDK_PATH}/.package/snapshots/tv-samsung"
mkdir -p "$SNAPSHOT_DIR"

for snap in "$INNER_DIR"/pkg_list_*; do
    [[ -f "$snap" ]] || continue
    snap_name="$(basename "$snap")"
    dest="${SNAPSHOT_DIR}/${snap_name}"
    if [[ -f "$dest" ]]; then
        log_info "Snapshot already exists, skip: $snap_name"
    else
        cp -f "$snap" "$dest"
        log_ok "Copied snapshot: $snap_name"
    fi
done

# -----------------------------------------------------------------------------
# Create .tv-sdk-installed marker
# -----------------------------------------------------------------------------

# Record the TV version in .platform-installed (record_platform_install,
# lib/common.sh) — what sdk-install result.packages and platform-install
# --list read. The profiles are the tv-samsung* folders it now has.
# No tv-samsung folder for that version means the ZIP is for another one
# (a wrong --tv-version): record nothing rather than a TV version that is
# not there, and fail so the pre-check does not report it installed.
TV_PROFILES="$(tv_install_profiles "$SDK_PATH" "$TV_VERSION")"
if [[ -z "$TV_PROFILES" ]]; then
    log_error "The ZIP was extracted, but platforms/tizen-$TV_VERSION has no tv-samsung folder: it is not a TV $TV_VERSION ZIP."
    log_error "Nothing was recorded in .platform-installed. Re-run with the --tv-version the ZIP is for."
    rm -rf "$WORKDIR"
    exit 1
fi
record_platform_install "$SDK_PATH" "TV-SAMSUNG ZIP" "$TV_VERSION" "$TV_PROFILES" tv-sdk-install-from-zip "$ZIP_PATH"
log_ok "TV $TV_VERSION ($TV_PROFILES) recorded in $SDK_PATH/.platform-installed"

echo "TV SDK installed at $(date +%Y-%m-%dT%H:%M:%S%z)" > "$TV_SDK_MARKER"
echo "Source: $ZIP_PATH" >> "$TV_SDK_MARKER"
echo "TV milestone version: $TV_VERSION" >> "$TV_SDK_MARKER"
log_ok ".tv-sdk-installed created: $TV_SDK_MARKER"

rm -rf "$WORKDIR"
log_ok "Tizen TV SDK extension installation (from ZIP) completed!"
exit 0
