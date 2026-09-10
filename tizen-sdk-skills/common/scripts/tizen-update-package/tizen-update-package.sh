#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-update-package.sh
# Tizen SDK package updater for Linux/macOS
#
# - Downloads pkg_list from the Tizen package repository
# - Scans installed package manifests in {SDK_PATH}/.package/
# - Compares installed versions with versions in the downloaded package list
# - Downloads and installs updates for outdated packages
# - Updates manifest files in .package/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Shared helpers (get_sdk_path). Logging stays on stdout via plain echo because
# the Node layer (sdk.js updatePackage) parses the "[OK] Update result: ..."
# summary line from captured stdout — do not switch to the stderr log_* helpers.
source "$SCRIPT_DIR/../lib/common.sh"

# Package repository (base URL for pkg_list and binary zip)
# During SDK install, a CDN mirror is selected by timezone and stored in
# .package/repository.info. The updater reads that file so updates are
# downloaded from the same mirror used during install.
# Falls back to the official repo if repository.info is missing.
PKG_REPO="https://download.tizen.org/sdk/tizenstudio/official"


# Detect OS
OS="$(uname -s)"
case "$OS" in
    Linux*) PKG_OS="ubuntu-64" ;;
    Darwin*) PKG_OS="macos-64" ;;
    MINGW*|MSYS*|CYGWIN*)
        PKG_OS="windows-64"
        echo "[WARN] Running in Windows Git Bash/MSYS2 — consider using the PowerShell script (.ps1) instead."
        ;;
    *) echo "[ERROR] Unsupported OS: $OS"; exit 1 ;;
esac

# Defaults (get_sdk_path: TIZEN_SDK_PATH -> ~/.tizen.sdk.path.config -> ~/tizen-sdk)
SDK_PATH="$(get_sdk_path)"
FORCE=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --sdk-path=*) SDK_PATH="${1#*=}"; shift ;;
        --sdk-path)   SDK_PATH="$2"; shift 2 ;;
        --force)      FORCE=true; shift ;;
        --dry-run)    DRY_RUN=true; shift ;;
        --help|-h)
            cat <<EOF
Tizen SDK package updater

Usage: $0 [OPTIONS]

Options:
  --sdk-path <path>   Tizen SDK installation path
                      (default: TIZEN_SDK_PATH / ~/.tizen.sdk.path.config / ~/tizen-sdk)
  --force             Force update all installed packages regardless of version
  --dry-run           List outdated packages only (no download/update)
  --help              Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Downloads/parses ${PKG_REPO}/pkg_list_${PKG_OS}
  3) Scans {SDK_PATH}/.package/ for installed package manifests ({pkg}.manifest)
  4) For each installed package, compares installed version with pkg_list version
  5) If a newer version is available, downloads and installs the update
  6) Reports summary: updated / skipped / failed / up-to-date counts
EOF
            exit 0 ;;
        *) echo "[ERROR] Unknown option: $1"; exit 1 ;;
    esac
done

echo "[INFO] Tizen SDK package updater started"
echo "[INFO] SDK path: $SDK_PATH"
echo "[INFO] Detected OS: $OS (pkg_list: pkg_list_$PKG_OS)"

# Verify Tizen SDK is installed
SDK_INFO_PATH="${SDK_PATH}/sdk.info"
if [[ ! -f "$SDK_INFO_PATH" ]]; then
    echo "[ERROR] Tizen SDK is NOT installed at $SDK_PATH (sdk.info not found)"
    echo "[ERROR] Package update requires Tizen SDK to be installed first."
    echo "[ERROR] Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
fi
echo "[OK] Tizen SDK found: $SDK_PATH (sdk.info exists)"

# Verify .package directory exists
PKG_INFO_DIR="${SDK_PATH}/.package"
if [[ ! -d "$PKG_INFO_DIR" ]]; then
    echo "[ERROR] No .package directory found at $SDK_PATH"
    echo "[ERROR] No installed packages to update."
    exit 1
fi
echo "[OK] Package directory found: $PKG_INFO_DIR"

# -----------------------------------------------------------------------------
# Read repository.info to use the same CDN mirror that was selected during install
# -----------------------------------------------------------------------------
REPO_INFO_FILE="${PKG_INFO_DIR}/repository.info"
if [[ -f "$REPO_INFO_FILE" ]]; then
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$key" ]] && continue
        key="$(echo "$key" | xargs)"
        value="$(echo "$value" | xargs)"
        if [[ "$key" == "Repository" && -n "$value" ]]; then
            PKG_REPO="$value"
            echo "[OK] Using repository from repository.info: $PKG_REPO"
            break
        fi
    done < "$REPO_INFO_FILE"
else
    echo "[WARN] repository.info not found — falling back to official repo: $PKG_REPO"
fi

# -----------------------------------------------------------------------------
# Helper: Compare versions

# Returns 0 (true) if available version is newer than installed version
# -----------------------------------------------------------------------------
compare_version() {
    local installed="$1"
    local available="$2"

    if [[ -z "$installed" || -z "$available" ]]; then
        return 1
    fi
    if [[ "$installed" == "$available" ]]; then
        return 1
    fi

    # Split by dots and compare numerically
    IFS='.' read -ra INST_PARTS <<< "$installed"
    IFS='.' read -ra AVAIL_PARTS <<< "$available"

    local max_len=${#INST_PARTS[@]}
    if [[ ${#AVAIL_PARTS[@]} -gt $max_len ]]; then
        max_len=${#AVAIL_PARTS[@]}
    fi

    for ((i=0; i<max_len; i++)); do
        local inst_val=0
        local avail_val=0
        if [[ $i -lt ${#INST_PARTS[@]} ]]; then
            inst_val="${INST_PARTS[$i]}"
            # Strip non-numeric suffix
            inst_val="${inst_val%%[^0-9]*}"
            [[ -z "$inst_val" ]] && inst_val=0
        fi
        if [[ $i -lt ${#AVAIL_PARTS[@]} ]]; then
            avail_val="${AVAIL_PARTS[$i]}"
            avail_val="${avail_val%%[^0-9]*}"
            [[ -z "$avail_val" ]] && avail_val=0
        fi
        if [[ $avail_val -gt $inst_val ]]; then
            return 0
        fi
        if [[ $avail_val -lt $inst_val ]]; then
            return 1
        fi
    done
    return 1
}

# -----------------------------------------------------------------------------
# Download pkg_list
# -----------------------------------------------------------------------------
WORKDIR="$(mktemp -d -t tizen-update-pkg-XXXXXX)"
PKGLIST="${WORKDIR}/pkg_list"
PKGLIST_URL="${PKG_REPO}/pkg_list_${PKG_OS}"

echo "[INFO] Downloading package list: $PKGLIST_URL"
if ! curl -fsSL -o "$PKGLIST" "$PKGLIST_URL"; then
    echo "[ERROR] Failed to download pkg_list from $PKGLIST_URL"
    rm -rf "$WORKDIR"
    exit 1
fi
echo "[OK] Package list downloaded successfully"

# -----------------------------------------------------------------------------
# Parse pkg_list into associative arrays
# -----------------------------------------------------------------------------
declare -A PKG_PATH PKG_VERSION PKG_SHA256

CUR=""
while IFS= read -r line; do
    if [[ "$line" =~ ^Package\ :\ (.+)$ ]]; then
        CUR="${BASH_REMATCH[1]//$'\r'/}"
        if [[ -z "${PKG_PATH[$CUR]+x}" ]]; then
            PKG_PATH[$CUR]=""
            PKG_VERSION[$CUR]=""
            PKG_SHA256[$CUR]=""
        fi
    elif [[ -n "$CUR" ]]; then
        if [[ "$line" =~ ^Version\ :\ (.+)$ ]] && [[ -z "${PKG_VERSION[$CUR]}" ]]; then
            PKG_VERSION[$CUR]="${BASH_REMATCH[1]//$'\r'/}"
            PKG_VERSION[$CUR]="${PKG_VERSION[$CUR]#"${PKG_VERSION[$CUR]%%[![:space:]]*}"}"
        elif [[ "$line" =~ ^Path\ :\ (.+)$ ]] && [[ -z "${PKG_PATH[$CUR]}" ]]; then
            PKG_PATH[$CUR]="${BASH_REMATCH[1]//$'\r'/}"
            PKG_PATH[$CUR]="${PKG_PATH[$CUR]#"${PKG_PATH[$CUR]%%[![:space:]]*}"}"
        elif [[ "$line" =~ ^SHA256\ :\ (.+)$ ]] && [[ -z "${PKG_SHA256[$CUR]}" ]]; then
            PKG_SHA256[$CUR]="${BASH_REMATCH[1]//$'\r'/}"
        fi
    fi
done < "$PKGLIST"

echo "[OK] Parsed ${#PKG_PATH[@]} packages from pkg_list"

# -----------------------------------------------------------------------------
# Scan installed manifests and compare versions
# -----------------------------------------------------------------------------
# nullglob: an unmatched glob must yield an empty array, not the literal
# pattern (which would report MANIFEST_COUNT=1 with no manifests installed).
shopt -s nullglob
MANIFEST_FILES=( "$PKG_INFO_DIR"/*.manifest )
shopt -u nullglob
MANIFEST_COUNT=${#MANIFEST_FILES[@]}
echo "[INFO] Found $MANIFEST_COUNT installed package manifests"

# Arrays to hold outdated package info.
# The `=()` initializers are load-bearing under `set -u`: a bare `declare -a foo`
# leaves the array with no value at all, so `${#foo[@]}` below (line ~279) fails
# with "unbound variable" whenever nothing is outdated — i.e. exactly when every
# package is already up to date, the most common case. Assigning an empty array
# gives it a value, so the count reads back as 0.
declare -a OUTDATED_NAMES=() OUTDATED_INSTALLED=() OUTDATED_AVAILABLE=() OUTDATED_PATHS=()
UP_TO_DATE=0
NOT_IN_LIST=0

# ${arr[@]+...} guards against "unbound variable" on empty arrays (bash 3.2 + set -u)
for mf in ${MANIFEST_FILES[@]+"${MANIFEST_FILES[@]}"}; do
    [[ ! -f "$mf" ]] && continue

    # Extract package name from filename (strip .manifest)
    PKG_NAME="$(basename "$mf" .manifest)"

    # Parse installed version from manifest
    INSTALLED_VERSION=""
    while IFS= read -r mline; do
        if [[ "$mline" =~ ^Version\ :\ (.+)$ ]]; then
            INSTALLED_VERSION="${BASH_REMATCH[1]//$'\r'/}"
            INSTALLED_VERSION="${INSTALLED_VERSION#"${INSTALLED_VERSION%%[![:space:]]*}"}"
            break
        fi
    done < "$mf"

    if [[ -z "$INSTALLED_VERSION" ]]; then
        echo "[WARN] $PKG_NAME : could not parse installed version from manifest, skip"
        continue
    fi

    # Check if package exists in the downloaded pkg_list
    if [[ -z "${PKG_VERSION[$PKG_NAME]+x}" ]]; then
        echo "[WARN] $PKG_NAME : not found in pkg_list (may be a local/custom package), skip"
        NOT_IN_LIST=$((NOT_IN_LIST+1))
        continue
    fi

    AVAILABLE_VERSION="${PKG_VERSION[$PKG_NAME]}"

    UPDATE_REASON=""
    if [[ "$FORCE" == "true" ]]; then
        UPDATE_REASON="force update"
    elif compare_version "$INSTALLED_VERSION" "$AVAILABLE_VERSION"; then
        UPDATE_REASON="update available"
    fi

    if [[ -n "$UPDATE_REASON" ]]; then
        echo "[INFO] $PKG_NAME : $UPDATE_REASON (installed: $INSTALLED_VERSION -> available: $AVAILABLE_VERSION)"
        OUTDATED_NAMES+=("$PKG_NAME")
        OUTDATED_INSTALLED+=("$INSTALLED_VERSION")
        OUTDATED_AVAILABLE+=("$AVAILABLE_VERSION")
        OUTDATED_PATHS+=("${PKG_PATH[$PKG_NAME]}")
    else
        UP_TO_DATE=$((UP_TO_DATE+1))
    fi
done

OUTDATED_COUNT=${#OUTDATED_NAMES[@]}
echo "[INFO] Update check result: $OUTDATED_COUNT outdated / $UP_TO_DATE up-to-date / $NOT_IN_LIST not in list"

# Read back by sdk.js updatePackage() when the agent re-runs the Phase 1 CLI after
# this script finishes — keep the "Result:" line in the exact
# "updated X / skipped Y / failed Z / up-to-date W (total N)" shape it parses.
RESULT_MARKER="${SDK_PATH}/.package-update-result"
write_result_marker() {
    local exit_code="$1" result_line="$2" mode="update"
    if [[ "$FORCE" == "true" ]]; then mode="force"; fi
    if [[ "$DRY_RUN" == "true" ]]; then mode="dry-run"; fi
    {
        echo "Package update finished at $(date -Iseconds)"
        echo "Mode: $mode"
        echo "Exit: $exit_code"
        echo "Outdated: $OUTDATED_COUNT"
        echo "Result: $result_line"
    } > "$RESULT_MARKER" 2>/dev/null || echo "[WARN] Could not write $RESULT_MARKER"
}

# Dry-run: list only
if [[ "$DRY_RUN" == "true" ]]; then
    if [[ $OUTDATED_COUNT -eq 0 ]]; then
        echo "[OK] All installed packages are up-to-date."
    else
        echo "[WARN] [DRY-RUN] The following packages have updates available (no download/update):"
        n=0
        for ((i=0; i<OUTDATED_COUNT; i++)); do
            n=$((n+1))
            printf "  %3d. %-48s %s -> %s\n" "$n" "${OUTDATED_NAMES[$i]}" "${OUTDATED_INSTALLED[$i]}" "${OUTDATED_AVAILABLE[$i]}"
        done
    fi
    RESULT_LINE="updated 0 / skipped 0 / failed 0 / up-to-date $UP_TO_DATE (total $MANIFEST_COUNT)"
    echo "[OK] Update result: $RESULT_LINE"
    write_result_marker 0 "$RESULT_LINE"
    rm -rf "$WORKDIR"
    exit 0
fi

# -----------------------------------------------------------------------------
# Download and install updates
# -----------------------------------------------------------------------------
IDX=0; OK=0; SKIP=0; FAIL=0
TOTAL=$OUTDATED_COUNT

# Remove the per-package zip and staging directory (after success or failure).
cleanup_pkg_stage() {
    rm -f "$1"
    rm -rf "$2"
}

for ((i=0; i<OUTDATED_COUNT; i++)); do
    IDX=$((IDX+1))
    PKG="${OUTDATED_NAMES[$i]}"
    INST_VER="${OUTDATED_INSTALLED[$i]}"
    AVAIL_VER="${OUTDATED_AVAILABLE[$i]}"
    REL_PATH="${OUTDATED_PATHS[$i]}"

    if [[ -z "$REL_PATH" ]]; then
        echo "[WARN] [$IDX/$TOTAL] $PKG: no binary path (meta/skip)"
        SKIP=$((SKIP+1))
        continue
    fi

    URL="${PKG_REPO}${REL_PATH}"
    ZIP="${WORKDIR}/$(basename "$REL_PATH")"
    echo "[INFO] [$IDX/$TOTAL] Downloading $PKG ($INST_VER -> $AVAIL_VER) ..."
    if ! curl -fsSL -o "$ZIP" "$URL"; then
        echo "[ERROR] [$IDX/$TOTAL] Download failed: $URL"
        FAIL=$((FAIL+1))
        continue
    fi

    STAGE="${WORKDIR}/stage_${IDX}"
    rm -rf "$STAGE"
    mkdir -p "$STAGE"

    if ! unzip -qo "$ZIP" -d "$STAGE" 2>/dev/null; then
        echo "[ERROR] [$IDX/$TOTAL] Extraction failed: $PKG"
        FAIL=$((FAIL+1))
        cleanup_pkg_stage "$ZIP" "$STAGE"
        continue
    fi

    # Merge data/ contents into the SDK root
    DATA_DIR="${STAGE}/data"
    if [[ -d "$DATA_DIR" ]]; then
        if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
            if ! cp -rf "$DATA_DIR"/* "$SDK_PATH"/ 2>/dev/null; then
                echo "[ERROR] [$IDX/$TOTAL] Merge failed: $PKG"
                FAIL=$((FAIL+1))
                cleanup_pkg_stage "$ZIP" "$STAGE"
                continue
            fi
        else
            echo "[INFO] [$IDX/$TOTAL] $PKG: data/ is empty, skip merge"
        fi
    fi

    # Update manifest record
    MANIFEST="${STAGE}/pkginfo.manifest"
    if [[ -f "$MANIFEST" ]]; then
        cp -f "$MANIFEST" "${PKG_INFO_DIR}/${PKG}.manifest"
    else
        # If no pkginfo.manifest in the zip, create one from the pkg_list entry
        printf "Package : %s\nVersion : %s\nOS : %s\n" "$PKG" "$AVAIL_VER" "$PKG_OS" > "${PKG_INFO_DIR}/${PKG}.manifest"
    fi

    cleanup_pkg_stage "$ZIP" "$STAGE"
    OK=$((OK+1))
    echo "[OK] [$IDX/$TOTAL] $PKG updated: $INST_VER -> $AVAIL_VER"
done

RESULT_LINE="updated $OK / skipped $SKIP / failed $FAIL / up-to-date $UP_TO_DATE (total $MANIFEST_COUNT)"
echo "[OK] Update result: $RESULT_LINE"

if [[ $FAIL -gt 0 ]]; then
    echo "[ERROR] Some packages failed to update."
    write_result_marker 1 "$RESULT_LINE"
    rm -rf "$WORKDIR"
    exit 1
fi

write_result_marker 0 "$RESULT_LINE"
rm -rf "$WORKDIR"
echo "[OK] Tizen SDK package update completed!"
exit 0
