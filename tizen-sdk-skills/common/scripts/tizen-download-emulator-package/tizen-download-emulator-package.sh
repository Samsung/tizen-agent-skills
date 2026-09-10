#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-download-emulator-package.sh
# Tizen emulator package downloader for Linux/macOS
#
# - Reads the CDN mirror URL from {SDK_PATH}/.package/repository.info
#   (falls back to the official repo if the file is missing)
# - Downloads pkg_list from the Tizen package repository
# - Auto-detects the latest TIZEN-X.Y platform (or uses --platform-version)
# - Resolves TIZEN-{version}-Emulator and its Install-dependency packages
# - Downloads each from (repo + Path) and merges data/ into the SDK root
# - Creates .emulator-package-installed marker on success

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

# Package repository (base URL for pkg_list and binary zip)
# Falls back to the official repo if repository.info is missing.
PKG_REPO="https://download.tizen.org/sdk/tizenstudio/official"

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Linux*) PKG_OS="ubuntu-64" ;;
    Darwin*) PKG_OS="macos-64" ;;
    MINGW*|MSYS*|CYGWIN*)
        PKG_OS="windows-64"
        log_warn "Running in Windows Git Bash/MSYS2 — consider using the PowerShell script (.ps1) instead."
        ;;
    *) log_error "Unsupported OS: $OS"; exit 1 ;;
esac

# Defaults (get_sdk_path: TIZEN_SDK_PATH -> ~/.tizen.sdk.path.config -> ~/tizen-sdk)
SDK_PATH="$(get_sdk_path)"
PLATFORM_VERSION=""
FORCE=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --sdk-path=*)          SDK_PATH="${1#*=}"; shift ;;
        --sdk-path)            SDK_PATH="$2"; shift 2 ;;
        --platform-version=*)  PLATFORM_VERSION="${1#*=}"; shift ;;
        --platform-version)    PLATFORM_VERSION="$2"; shift 2 ;;
        --force)               FORCE=true; shift ;;
        --dry-run)             DRY_RUN=true; shift ;;
        --help|-h)
            cat <<EOF
Tizen emulator package downloader

Usage: $0 [OPTIONS]

Options:
  --sdk-path <path>          Tizen SDK installation path
                              (default: TIZEN_SDK_PATH / ~/.tizen.sdk.path.config / ~/tizen-sdk)
  --platform-version <ver>   Tizen platform version (e.g., "10.0", "11.0").
                              Auto-detects latest if not specified.
  --force                     Force reinstall even if emulator package is already installed
  --dry-run                   Resolve and list packages only (no download/install)
  --help                      Show this help

What it does:
  1) Verifies Tizen SDK is installed (sdk.info exists)
  2) Reads repository.info for the CDN mirror URL
  3) Downloads/parses \${PKG_REPO}/pkg_list_\${PKG_OS}
  4) Auto-detects latest TIZEN-X.Y platform (or uses --platform-version)
  5) Resolves TIZEN-{version}-Emulator and its Install-dependency packages
  6) Downloads each from (repo + Path) and merges data/ into the SDK root
  7) Creates .emulator-package-installed marker on success
EOF
            exit 0 ;;
        *) log_error "Unknown option: $1"; exit 1 ;;
    esac
done

log_info "Tizen emulator package downloader started"
log_info "SDK path: $SDK_PATH"
log_info "Detected OS: $OS (pkg_list: pkg_list_$PKG_OS)"

# Verify Tizen SDK is installed
SDK_INFO_PATH="${SDK_PATH}/sdk.info"
if [[ ! -f "$SDK_INFO_PATH" ]]; then
    log_error "Tizen SDK is NOT installed at $SDK_PATH (sdk.info not found)"
    log_error "Emulator package download requires Tizen SDK to be installed first."
    log_error "Run the tizen-sdk-install skill to install Tizen SDK, then retry."
    exit 1
fi
log_ok "Tizen SDK found: $SDK_PATH (sdk.info exists)"

# Verify .package directory exists
PKG_INFO_DIR="${SDK_PATH}/.package"
if [[ ! -d "$PKG_INFO_DIR" ]]; then
    log_error "No .package directory found at $SDK_PATH"
    log_error "The SDK may not have been installed properly."
    exit 1
fi
log_ok "Package directory found: $PKG_INFO_DIR"

# Check mode / skip if already installed — PER PLATFORM VERSION.
#
# The marker records every installed platform as a "Platform version: X.Y"
# line. A bare exists-check made a 10.0-era marker swallow an 11.0 request
# entirely, so the 11.0 plugin resources never arrived. Markers written by
# older script versions carry a single (last-write-wins) version line, or
# none — both are treated as "requested version not recorded" and proceed;
# the per-package version comparison below keeps the re-run cheap.
EMUL_PKG_MARKER="${SDK_PATH}/.emulator-package-installed"

marker_has_platform() {
    # Fixed-string whole-line match (-xF): with plain grep the dots in "10.0"
    # are regex wildcards, so "10x0" would satisfy a "10.0" request. tr strips
    # \r in case the marker was written by the PowerShell script on Windows.
    [[ -f "$EMUL_PKG_MARKER" ]] || return 1
    tr -d '\r' < "$EMUL_PKG_MARKER" | grep -qxF "Platform version: $1"
}

if [[ "$FORCE" == "true" ]]; then
    # Do NOT delete the marker: it also records OTHER platforms' installs.
    log_warn "Force reinstall requested — ignoring the .emulator-package-installed marker"
elif [[ -f "$EMUL_PKG_MARKER" ]]; then
    if [[ -n "$PLATFORM_VERSION" ]]; then
        if marker_has_platform "$PLATFORM_VERSION"; then
            log_ok "Emulator package for TIZEN-$PLATFORM_VERSION is already installed: $SDK_PATH"
            log_info "To reinstall, run again with --force"
            exit 0
        fi
        log_info "Marker found, but TIZEN-$PLATFORM_VERSION is not recorded in it — proceeding."
    else
        log_info "Marker found; the target platform is auto-detected, so deciding after the package list is downloaded."
    fi
fi

# -----------------------------------------------------------------------------
# Read repository.info to use the same CDN mirror that was selected during install
# -----------------------------------------------------------------------------
REPO_INFO_FILE="${PKG_INFO_DIR}/repository.info"
if [[ -f "$REPO_INFO_FILE" ]]; then
    while IFS='=' read -r key value; do
        [[ "$key" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$key" ]] && continue
        key="$(echo "$key" | xargs)"
        value="$(echo "$value" | xargs)"
        if [[ "$key" == "Repository" && -n "$value" ]]; then
            PKG_REPO="$value"
            log_ok "Using repository from repository.info: $PKG_REPO"
            break
        fi
    done < "$REPO_INFO_FILE"
else
    log_warn "repository.info not found — falling back to official repo: $PKG_REPO"
fi

# -----------------------------------------------------------------------------
# Download pkg_list
# -----------------------------------------------------------------------------
WORKDIR="$(mktemp -d -t tizen-emul-pkg-XXXXXX)"
PKGLIST="${WORKDIR}/pkg_list"
PKGLIST_URL="${PKG_REPO}/pkg_list_${PKG_OS}"

log_info "Downloading package list: $PKGLIST_URL"
if ! curl -fsSL -o "$PKGLIST" "$PKGLIST_URL"; then
    log_error "Failed to download pkg_list from $PKGLIST_URL"
    rm -rf "$WORKDIR"
    exit 1
fi
log_ok "Package list downloaded successfully"

# -----------------------------------------------------------------------------
# Parse pkg_list into associative arrays
# -----------------------------------------------------------------------------
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

log_ok "Parsed ${#PKG_PATH[@]} packages from pkg_list"

# -----------------------------------------------------------------------------
# Determine platform version and target emulator package
# -----------------------------------------------------------------------------
if [[ -n "$PLATFORM_VERSION" ]]; then
    TARGET_PACKAGE="TIZEN-${PLATFORM_VERSION}-Emulator"
    log_info "Using specified platform version: $PLATFORM_VERSION"
else
    # Auto-detect the latest TIZEN-X.Y platform. pkg_list is RFC822-style
    # blocks ("Package : X" / "Version : Y" one per line), not a TSV table —
    # `cut -f1 "$PKGLIST"` on that format returns each whole "Package : X"
    # line unchanged (no tab to cut on), which never matches
    # `^TIZEN-[0-9]+\.[0-9]+$` and always reported "no platforms found",
    # even when they were present. PKG_PATH's keys are the actual package
    # names already parsed out above, so filter those instead.
    platforms="$(printf '%s\n' "${!PKG_PATH[@]}" | grep -E '^TIZEN-[0-9]+\.[0-9]+$' | sed -E 's/^TIZEN-//' \
                 | sort -t. -k1,1n -k2,2n || true)"
    if [[ -z "$platforms" ]]; then
        log_error "No TIZEN platforms (TIZEN-X.Y) found in pkg_list"
        rm -rf "$WORKDIR"
        exit 1
    fi

    log_info "Available Tizen platforms:"
    while IFS= read -r v; do
        log_info "    - TIZEN-$v"
    done <<< "$platforms"

    latest="$(echo "$platforms" | tail -1)"
    PLATFORM_VERSION="$latest"
    TARGET_PACKAGE="TIZEN-${latest}-Emulator"
    log_ok "Auto-detected latest platform: TIZEN-$latest → target: $TARGET_PACKAGE"
fi

# Verify target package exists
if [[ -z "${PKG_PATH[$TARGET_PACKAGE]+x}" ]]; then
    log_error "Target package not found in pkg_list: $TARGET_PACKAGE"
    log_error "Available packages containing 'Emulator':"
    for key in "${!PKG_PATH[@]}"; do
        if [[ "$key" == *Emulator* ]]; then
            log_error "  - $key"
        fi
    done
    rm -rf "$WORKDIR"
    exit 1
fi

log_ok "Target package found: $TARGET_PACKAGE (version ${PKG_VERSION[$TARGET_PACKAGE]})"

# Now that the platform version is final (auto-detect included), the per-version
# marker check can run for the auto-detect path too.
if [[ "$FORCE" == "false" ]] && marker_has_platform "$PLATFORM_VERSION"; then
    log_ok "Emulator package for TIZEN-$PLATFORM_VERSION is already installed (recorded in marker)."
    log_info "To reinstall, run again with --force. To refresh shared tools, use tizen-update-package."
    rm -rf "$WORKDIR"
    exit 0
fi

# -----------------------------------------------------------------------------
# Recursively resolve dependencies
# -----------------------------------------------------------------------------
declare -A SEEN
RESOLVED=()

# Metas whose closure is the SDK-WIDE baseline (VS tools add-ons, tizen-core,
# the C# CLI, certificate tools, ...). They are legitimate when the platform
# itself depends on them, but pulling them in through the shared-tool seed
# would turn "download the emulator package" into a 30-package SDK refresh —
# keeping those current is tizen-update-package's job, not this script's.
declare -A SHARED_SEED_EXCLUDE=( [BASELINE-COMMON]=1 )

# resolve_from <seed> [exclude]   ("exclude" honours SHARED_SEED_EXCLUDE)
resolve_from() {
    local seed="$1" mode="${2:-}"
    QUEUE=("$seed")
    while [[ ${#QUEUE[@]} -gt 0 ]]; do
        CUR_PKG="${QUEUE[0]}"
        QUEUE=("${QUEUE[@]:1}")
        if [[ -n "${SEEN[$CUR_PKG]+x}" ]]; then continue; fi
        if [[ "$mode" == "exclude" && -n "${SHARED_SEED_EXCLUDE[$CUR_PKG]+x}" ]]; then continue; fi
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
}

resolve_from "$TARGET_PACKAGE"

# The shared emulator tools (emulator-manager, emulator-control-panel, sdb, ...)
# live under the SEPARATE "Emulator" meta package — no TIZEN-X.Y-Emulator lists
# them, and repo metadata carries no version constraints. So a new platform's
# em-plugin-tizen.jar can require a newer shared manager than the one installed
# with an older platform (observed as NoSuchFieldError: isVirgl on tizen-11.0).
#
# Widen the closure with the Emulator tools, but as SYNC-ONLY: packages reached
# only through this seed refresh an EXISTING install to the repo version and are
# never installed fresh — sync keeps things consistent, it does not grow the SDK.
# The SDK-wide baseline metas are excluded (see SHARED_SEED_EXCLUDE), so this
# adds the emulator tools themselves, not a whole-SDK refresh.
declare -A SHARED_SYNC_ONLY
if [[ -n "${PKG_PATH[Emulator]+x}" ]]; then
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
log_ok "Total resolved packages: $TOTAL"

# Dry-run: list only
if [[ "$DRY_RUN" == "true" ]]; then
    log_warn "[DRY-RUN] The following packages would be installed (no download/install):"
    n=0
    for pkg in "${RESOLVED[@]}"; do
        n=$((n+1))
        p="${PKG_PATH[$pkg]:-<no-binary>}"
        tag=""
        [[ -n "${SHARED_SYNC_ONLY[$pkg]+x}" ]] && tag=" [shared sync-only]"
        printf "  %3d. %-48s %s%s\n" "$n" "$pkg" "$p" "$tag"
    done
    rm -rf "$WORKDIR"
    exit 0
fi

# -----------------------------------------------------------------------------
# Download and merge each package
# -----------------------------------------------------------------------------
IDX=0; OK=0; SKIP=0; FAIL=0
for pkg in "${RESOLVED[@]}"; do
    IDX=$((IDX+1))

    MANIFEST_FILE="${PKG_INFO_DIR}/${pkg}.manifest"

    # Shared-tool sync never installs something new — it only refreshes what
    # this SDK already has. A package reached solely through the "Emulator"
    # seed and not present locally is simply not part of this installation.
    if [[ -n "${SHARED_SYNC_ONLY[$pkg]+x}" && ! -f "$MANIFEST_FILE" ]]; then
        log_info "[$IDX/$TOTAL] $pkg: shared tool not previously installed — skip (sync refreshes existing installs only)"
        SKIP=$((SKIP+1))
        continue
    fi

    # Skip if already installed AT THE SAME VERSION and not force.
    # Same logic as tizen-platform-install.sh — a bare exists-check left shared
    # tools (emulator-manager) stale forever, because their manifest from an
    # earlier platform install always exists.
    if [[ -f "$MANIFEST_FILE" && "$FORCE" == "false" ]]; then
        INSTALLED_VERSION=""
        while IFS= read -r mline; do
            # Separator/spacing tolerant and trimmed at BOTH ends, matching the
            # PowerShell side's regex + .Trim(). Manifests are copied verbatim
            # out of the repo's package zips, so their exact spacing is not ours
            # to guarantee: with a leading-only trim, a "Version : 1.2.3  " line
            # yielded "1.2.3  ", which can never equal the repo value — that
            # package would have re-downloaded on every single run.
            if [[ "$mline" =~ ^Version[[:space:]]*:[[:space:]]*(.+)$ ]]; then
                INSTALLED_VERSION="${BASH_REMATCH[1]//$'\r'/}"
                INSTALLED_VERSION="${INSTALLED_VERSION#"${INSTALLED_VERSION%%[![:space:]]*}"}"
                INSTALLED_VERSION="${INSTALLED_VERSION%"${INSTALLED_VERSION##*[![:space:]]}"}"
                break
            fi
        done < "$MANIFEST_FILE"

        REPO_VERSION="${PKG_VERSION[$pkg]:-}"
        if [[ -n "$INSTALLED_VERSION" && -n "$REPO_VERSION" && "$INSTALLED_VERSION" == "$REPO_VERSION" ]]; then
            log_info "[$IDX/$TOTAL] $pkg already installed (version $INSTALLED_VERSION), skip"
            SKIP=$((SKIP+1))
            continue
        else
            log_info "[$IDX/$TOTAL] $pkg: installed=$INSTALLED_VERSION repo=$REPO_VERSION, updating"
        fi
    fi

    REL_PATH="${PKG_PATH[$pkg]:-}"
    if [[ -z "$REL_PATH" ]]; then
        log_warn "[$IDX/$TOTAL] $pkg: no binary path (meta/skip)"
        SKIP=$((SKIP+1))
        continue
    fi

    URL="${PKG_REPO}${REL_PATH}"
    ZIP="${WORKDIR}/$(basename "$REL_PATH")"
    log_info "[$IDX/$TOTAL] Downloading $pkg ..."
    if ! curl -fsSL -o "$ZIP" "$URL"; then
        log_error "[$IDX/$TOTAL] Download failed: $URL"
        FAIL=$((FAIL+1))
        continue
    fi

    STAGE="${WORKDIR}/stage_${IDX}"
    rm -rf "$STAGE"
    mkdir -p "$STAGE"

    if ! unzip -qo "$ZIP" -d "$STAGE" 2>/dev/null; then
        log_error "[$IDX/$TOTAL] Extraction failed: $pkg"
        FAIL=$((FAIL+1))
        rm -f "$ZIP"
        rm -rf "$STAGE"
        continue
    fi

    # Merge data/ contents into the SDK root
    DATA_DIR="${STAGE}/data"
    if [[ -d "$DATA_DIR" ]]; then
        if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
            if ! cp -rf "$DATA_DIR"/* "$SDK_PATH"/ 2>/dev/null; then
                log_error "[$IDX/$TOTAL] Merge failed: $pkg"
                FAIL=$((FAIL+1))
                rm -f "$ZIP"
                rm -rf "$STAGE"
                continue
            fi
        else
            log_info "[$IDX/$TOTAL] $pkg: data/ is empty, skip merge"
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
    log_ok "[$IDX/$TOTAL] $pkg installed"
done

log_ok "Emulator package result: OK $OK / skipped $SKIP / failed $FAIL (total $TOTAL)"

if [[ $FAIL -gt 0 ]]; then
    log_error "Some packages failed to install. Not creating .emulator-package-installed marker."
    rm -rf "$WORKDIR"
    exit 1
fi

# Create/update the .emulator-package-installed marker. It accumulates one
# "Platform version: X.Y" line per installed platform (deduplicated) — the
# old overwrite lost every previous platform's record, so a later install
# could not tell which platforms were actually present.
{
    echo "Emulator package installed at $(date -Iseconds)"
    echo "Target: $TARGET_PACKAGE"
    {
        # `|| true` is REQUIRED, not defensive noise: the script runs under
        # `set -e`, and grep exits 1 when a legacy marker carries no
        # "Platform version:" line at all. That failure killed this subshell
        # BEFORE the echo below, so the new platform was never recorded, the
        # enclosing group failed too (pipefail), `mv` never ran, and a fully
        # successful install exited 1 leaving a stray .tmp file behind.
        #
        # tr strips CR first: the .ps1 writer terminates its last line with
        # CRLF, and on a real Linux grep that CR survives into the record —
        # "Platform version: 10.0\r" and "Platform version: 10.0" are distinct
        # bytes, so sort -u would keep BOTH and the same platform would appear
        # twice. (MSYS grep hides this on Git Bash; Linux does not.)
        if [[ -f "$EMUL_PKG_MARKER" ]]; then
            tr -d '\r' < "$EMUL_PKG_MARKER" | grep "^Platform version: " || true
        fi
        echo "Platform version: $PLATFORM_VERSION"
    } | sort -u
} > "${EMUL_PKG_MARKER}.tmp"
mv -f "${EMUL_PKG_MARKER}.tmp" "$EMUL_PKG_MARKER"
log_ok ".emulator-package-installed created/updated: $EMUL_PKG_MARKER (platform $PLATFORM_VERSION)"

rm -rf "$WORKDIR"
log_ok "Tizen emulator package download completed!"
exit 0
