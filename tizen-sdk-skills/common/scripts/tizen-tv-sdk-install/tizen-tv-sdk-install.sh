#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-tv-sdk-install.sh
# Tizen TV SDK extension installer for Linux/macOS
#
# - Downloads pkg_list from https://download.tizen.org/sdk/extensions/tv_extensions/
# - Installs TV-SAMSUNG-Public package and its dependencies
# - Merges data/ into the existing Tizen SDK root
# - Creates .tv-sdk-installed marker on success

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Shared helpers: get_sdk_path, pkg_os_base (lib/common.sh).
source "$SCRIPT_DIR/../lib/common.sh"

# TV SDK extension repository
PKG_REPO="https://download.tizen.org/sdk/extensions/tv_extensions"
TARGET_PACKAGE="TV-SAMSUNG-Public"

# Detect OS -> pkg_list token (windows | ubuntu | macos)
OS="$(uname -s)"
PKG_OS_BASE="$(pkg_os_base)"
case "$PKG_OS_BASE" in
    windows) echo "[WARN] Running in Windows Git Bash/MSYS2 — consider using the PowerShell script (.ps1) instead." ;;
    "")      echo "[ERROR] Unsupported OS: $OS"; exit 1 ;;
esac
PKG_OS="${PKG_OS_BASE}-64"


# Defaults (SDK path resolution: TIZEN_SDK_PATH -> ~/.tizen.sdk.path.config -> ~/tizen-sdk)
SDK_PATH="$(get_sdk_path)"
FORCE=false
CHECK=false
DRY_RUN=false
WAIT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --sdk-path=*) SDK_PATH="${1#*=}"; shift ;;
        --sdk-path)   SDK_PATH="$2"; shift 2 ;;
        --force)      FORCE=true; shift ;;
        --check)      CHECK=true; shift ;;
        --dry-run)    DRY_RUN=true; shift ;;
        --wait)       WAIT=true; shift ;;
        --help|-h)
            cat <<EOF
Tizen TV SDK extension installer

Usage: $0 [OPTIONS]

Options:
  --sdk-path <path>   Tizen SDK installation path
                      (default: TIZEN_SDK_PATH / ~/.tizen.sdk.path.config / ~/tizen-sdk)
  --force             Reinstall even if TV SDK is already installed
  --check             Check TV SDK installation only
  --dry-run           Resolve and list packages only (no download/install)
  --help              Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Downloads/parses ${PKG_REPO}/pkg_list_${PKG_OS}
  3) Resolves ${TARGET_PACKAGE} and its Install-dependency packages
  4) Downloads each from (repo + Path) and merges data/ into the SDK root
  5) Creates .tv-sdk-installed marker on success
EOF
            exit 0 ;;
        *) echo "[ERROR] Unknown option: $1"; exit 1 ;;
    esac
done

# --wait: sleep 60 seconds then check if TV SDK is installed.
# This enforces a 60-second polling interval for harnesses (e.g. Cline) that
# would otherwise poll in a tight loop. Used after a nohup background launch.
if [[ "$WAIT" == "true" ]]; then
    sleep 60
    TV_SDK_MARKER="${SDK_PATH}/.tv-sdk-installed"
    if [[ -f "$TV_SDK_MARKER" ]]; then
        echo "STATUS=done EXIT=0"
    else
        # Check if the installer is still running, excluding this poller
        # process (and its parent), which pgrep -f would otherwise match.
        RUNNING=false
        for pid in $(pgrep -f "tizen-tv-sdk-install.sh" 2>/dev/null || true); do
            if [[ "$pid" != "$$" && "$pid" != "$PPID" ]]; then
                RUNNING=true
                break
            fi
        done
        if [[ "$RUNNING" == "true" ]]; then
            echo "STATUS=running"
        else
            echo "STATUS=done EXIT=1"
        fi
    fi
    exit 0
fi

echo "[INFO] Tizen TV SDK extension installer started"
echo "[INFO] SDK path: $SDK_PATH"
echo "[INFO] Target package: $TARGET_PACKAGE"
echo "[INFO] Detected OS: $OS (pkg_list: pkg_list_$PKG_OS)"

# Verify Tizen SDK is installed
SDK_INFO_PATH="${SDK_PATH}/sdk.info"
if [[ ! -f "$SDK_INFO_PATH" ]]; then
    echo "[ERROR] Tizen SDK is NOT installed at $SDK_PATH (sdk.info not found)"
    echo "[ERROR] TV SDK requires Tizen SDK to be installed first."
    echo "[ERROR] Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
fi
echo "[OK] Tizen SDK found: $SDK_PATH (sdk.info exists)"

# Check mode
TV_SDK_MARKER="${SDK_PATH}/.tv-sdk-installed"
if [[ "$CHECK" == "true" ]]; then
    if [[ -f "$TV_SDK_MARKER" ]]; then
        echo "[OK] TV SDK is already installed: $SDK_PATH (.tv-sdk-installed found)"
        exit 0
    else
        echo "[INFO] TV SDK is NOT installed (.tv-sdk-installed not found)"
        exit 1
    fi
fi

# Skip if already installed
if [[ -f "$TV_SDK_MARKER" && "$FORCE" == "false" ]]; then
    echo "[OK] TV SDK is already installed: $SDK_PATH"
    echo "[INFO] .tv-sdk-installed found. To reinstall, run again with --force"
    exit 0
fi

if [[ "$FORCE" == "true" ]]; then
    echo "[WARN] Force reinstall requested — removing .tv-sdk-installed marker"
    rm -f "$TV_SDK_MARKER"
fi

# -----------------------------------------------------------------------------
# Package installation (pkg_list driven)
# -----------------------------------------------------------------------------

WORKDIR="$(mktemp -d -t tizen-tv-pkg-XXXXXX)"
PKGLIST="${WORKDIR}/pkg_list"
PKGLIST_URL="${PKG_REPO}/pkg_list_${PKG_OS}"

echo "[INFO] Downloading package list: $PKGLIST_URL"
if ! curl -fsSL -o "$PKGLIST" "$PKGLIST_URL"; then
    echo "[ERROR] Failed to download pkg_list from $PKGLIST_URL"
    rm -rf "$WORKDIR"
    exit 1
fi

# Parse pkg_list into associative arrays
declare -A PKG_PATH PKG_VERSION PKG_DEPS

CUR=""
while IFS= read -r line; do
    if [[ "$line" =~ ^Package\ :\ (.+)$ ]]; then
        CUR="${BASH_REMATCH[1]//$'\r'/}"
        if [[ -z "${PKG_PATH[$CUR]+x}" ]]; then
            PKG_PATH[$CUR]=""
            PKG_VERSION[$CUR]=""
            PKG_DEPS[$CUR]=""
        fi
    elif [[ -n "$CUR" ]]; then
        if [[ "$line" =~ ^Version\ :\ (.+)$ ]] && [[ -z "${PKG_VERSION[$CUR]}" ]]; then
            PKG_VERSION[$CUR]="${BASH_REMATCH[1]//$'\r'/}"
            PKG_VERSION[$CUR]="${PKG_VERSION[$CUR]#"${PKG_VERSION[$CUR]%%[![:space:]]*}"}"
        elif [[ "$line" =~ ^Path\ :\ (.+)$ ]] && [[ -z "${PKG_PATH[$CUR]}" ]]; then
            PKG_PATH[$CUR]="${BASH_REMATCH[1]//$'\r'/}"
            PKG_PATH[$CUR]="${PKG_PATH[$CUR]#"${PKG_PATH[$CUR]%%[![:space:]]*}"}"
        elif [[ "$line" =~ ^Install-dependency\ :\ (.+)$ ]] && [[ -z "${PKG_DEPS[$CUR]}" ]]; then
            DEPS_STR="${BASH_REMATCH[1]//$'\r'/}"
            DEPS=""
            IFS=',' read -ra DEP_ENTRIES <<< "$DEPS_STR"
            for entry in "${DEP_ENTRIES[@]}"; do
                e="$(echo "$entry" | sed 's/\[.*\]//' | xargs)"
                if [[ -n "$e" ]]; then
                    if [[ -z "$DEPS" ]]; then
                        DEPS="$e"
                    else
                        DEPS="$DEPS $e"
                    fi
                fi
            done
            PKG_DEPS[$CUR]="$DEPS"
        fi
    fi
done < "$PKGLIST"

# Verify target package exists
if [[ -z "${PKG_PATH[$TARGET_PACKAGE]+x}" ]]; then
    echo "[ERROR] Target package not found in pkg_list: $TARGET_PACKAGE"
    rm -rf "$WORKDIR"
    exit 1
fi

echo "[OK] Target package found: $TARGET_PACKAGE (version ${PKG_VERSION[$TARGET_PACKAGE]})"

# Recursively resolve dependencies
declare -A SEEN
RESOLVED=()
QUEUE=("$TARGET_PACKAGE")
while [[ ${#QUEUE[@]} -gt 0 ]]; do
    CUR_PKG="${QUEUE[0]}"
    QUEUE=("${QUEUE[@]:1}")
    if [[ -n "${SEEN[$CUR_PKG]+x}" ]]; then continue; fi
    SEEN[$CUR_PKG]=1
    RESOLVED+=("$CUR_PKG")
    if [[ -n "${PKG_DEPS[$CUR_PKG]+x}" ]]; then
        for dep in ${PKG_DEPS[$CUR_PKG]}; do
            if [[ -z "${SEEN[$dep]+x}" ]]; then
                QUEUE+=("$dep")
            fi
        done
    fi
done

TOTAL=${#RESOLVED[@]}
echo "[OK] Total resolved packages: $TOTAL"

# Dry-run: list only
if [[ "$DRY_RUN" == "true" ]]; then
    echo "[WARN] [DRY-RUN] The following packages would be installed (no download/install):"
    n=0
    for pkg in "${RESOLVED[@]}"; do
        n=$((n+1))
        p="${PKG_PATH[$pkg]:-<no-binary>}"
        printf "  %3d. %-48s %s\n" "$n" "$pkg" "$p"
    done
    rm -rf "$WORKDIR"
    exit 0
fi

# Download and merge each package
PKG_INFO_DIR="${SDK_PATH}/.package"
mkdir -p "$PKG_INFO_DIR"

IDX=0; OK=0; SKIP=0; FAIL=0
for pkg in "${RESOLVED[@]}"; do
    IDX=$((IDX+1))

    # Skip if already installed (manifest exists), unless --force
    if [[ "$FORCE" == "false" && -f "${PKG_INFO_DIR}/${pkg}.manifest" ]]; then
        echo "[INFO] [$IDX/$TOTAL] $pkg already installed, skip"
        SKIP=$((SKIP+1))
        continue
    fi

    REL_PATH="${PKG_PATH[$pkg]:-}"
    if [[ -z "$REL_PATH" ]]; then
        echo "[WARN] [$IDX/$TOTAL] $pkg: no binary path (meta/skip)"
        SKIP=$((SKIP+1))
        continue
    fi

    URL="${PKG_REPO}${REL_PATH}"
    ZIP="${WORKDIR}/$(basename "$REL_PATH")"
    echo "[INFO] [$IDX/$TOTAL] Downloading $pkg ..."
    if ! curl -fsSL -o "$ZIP" "$URL"; then
        echo "[ERROR] [$IDX/$TOTAL] Download failed: $URL"
        FAIL=$((FAIL+1))
        continue
    fi

    STAGE="${WORKDIR}/stage_${IDX}"
    rm -rf "$STAGE"
    mkdir -p "$STAGE"

    if ! unzip -qo "$ZIP" -d "$STAGE" 2>/dev/null; then
        echo "[ERROR] [$IDX/$TOTAL] Extraction failed: $pkg"
        FAIL=$((FAIL+1))
        rm -f "$ZIP"
        rm -rf "$STAGE"
        continue
    fi

    # Merge data/ contents into the SDK root
    DATA_DIR="${STAGE}/data"
    if [[ -d "$DATA_DIR" ]]; then
        # Check if data/ has any contents (some packages have empty data/)
        if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
            if ! cp -rf "$DATA_DIR"/* "$SDK_PATH"/ 2>/dev/null; then
                echo "[ERROR] [$IDX/$TOTAL] Merge failed: $pkg"
                FAIL=$((FAIL+1))
                rm -f "$ZIP"
                rm -rf "$STAGE"
                continue
            fi
        else
            echo "[INFO] [$IDX/$TOTAL] $pkg: data/ is empty, skip merge"
        fi
    fi

    # Keep manifest record
    MANIFEST="${STAGE}/pkginfo.manifest"
    if [[ -f "$MANIFEST" ]]; then
        cp -f "$MANIFEST" "${PKG_INFO_DIR}/${pkg}.manifest"
    fi

    rm -f "$ZIP"
    rm -rf "$STAGE"
    OK=$((OK+1))
done

echo "[OK] TV SDK package result: OK $OK / skipped $SKIP / failed $FAIL (total $TOTAL)"

if [[ $FAIL -gt 0 ]]; then
    echo "[ERROR] Some packages failed to install. Not creating .tv-sdk-installed marker."
    rm -rf "$WORKDIR"
    exit 1
fi

# Create .tv-sdk-installed marker
echo "TV SDK installed at $(date -Iseconds)" > "$TV_SDK_MARKER"
echo "[OK] .tv-sdk-installed created: $TV_SDK_MARKER"

rm -rf "$WORKDIR"
echo "[OK] Tizen TV SDK extension installation completed!"
exit 0
