#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# common.sh — shared helpers for tizen-sdk-skills bash scripts.
#
# Source this near the top of each script:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/../lib/common.sh"
#
# All logging goes to stderr so that stdout stays clean for machine-readable
# values (tool paths, device serials, etc.) captured via $(...).

# ----------------------------------------------------------------------------
# Colors
# ----------------------------------------------------------------------------
# Enable ANSI colors ONLY when a real terminal is attached (stdout or stderr is a TTY) and
# NO_COLOR is unset. When the output is captured/piped — Cline, the Node CLI
# runners (execSync pipes), or a redirect — emit plain text so raw escape codes
# like "[0;34m" don't leak into the log and make it look garbled.
if { [ -t 1 ] || [ -t 2 ]; } && [ -z "${NO_COLOR:-}" ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

# ----------------------------------------------------------------------------
# Logging (stderr)
# ----------------------------------------------------------------------------
log_info()    { echo -e "${BLUE}[INFO]${NC}  $*" >&2; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $*" >&2; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $*" >&2; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_step()    { echo -e "${GREEN}[*]${NC} $*" >&2; }
log_section() { echo "" >&2; echo -e "${BLUE}=== $* ===${NC}" >&2; }

# Backwards-compatible aliases used by some call sites.
log_success() { log_ok "$@"; }
log_warning() { log_warn "$@"; }

# ----------------------------------------------------------------------------
# OS detection -> linux | mac | windows | unknown
# (includes WSL subtype detection for WSL2: set DETECTED_WSL=1 if running in WSL)
# ----------------------------------------------------------------------------
detect_os() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Linux*)               echo "linux" ;;
    Darwin*)              echo "mac" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)                    echo "unknown" ;;
  esac
}

# Detect if running in WSL (Windows Subsystem for Linux)
# Sets DETECTED_WSL=1 if in WSL, unset otherwise.
# WSL detection methods:
#   1. /proc/version contains "microsoft" (WSL1) or "Microsoft" (WSL2)
#   2. /proc/sys/kernel/osrelease contains "WSL"
#   3. WSLENV environment variable is set (Windows env vars passed to WSL)
detect_wsl() {
  DETECTED_WSL=0
  if [ -f /proc/version ] && grep -q -i 'microsoft\|WSL' /proc/version 2>/dev/null; then
    DETECTED_WSL=1
    return 0
  fi
  if [ -f /proc/sys/kernel/osrelease ] && grep -q -i 'WSL' /proc/sys/kernel/osrelease 2>/dev/null; then
    DETECTED_WSL=1
    return 0
  fi
  if [ -n "${WSLENV:-}" ]; then
    DETECTED_WSL=1
    return 0
  fi
  return 1
}

# ----------------------------------------------------------------------------
# SDK path resolution
#   ~/.tizen.sdk.path.config -> TIZEN_SDK_PATH -> $HOME/tizen-sdk -> /opt/tizen-sdk
# The config file is the path saved by sdk-init (the only source the Node lib's
# readSdkPath() uses), so it comes FIRST and scripts and the JS layer agree on
# the SDK location. TIZEN_SDK_PATH is a secondary hint: issue #70 had a .zshrc
# `export TIZEN_SDK_PATH=~/tizen-studio` shadow the configured tizen-sdk.
# Returns the first candidate that actually CONTAINS the tizen-sdk tools, so a
# stale/wrong TIZEN_SDK_PATH (e.g. pointing at Tizen Studio) is skipped in
# favor of a real tizen-sdk install. Falls back to $HOME/tizen-sdk if none validate.
# ----------------------------------------------------------------------------
_is_tizen_studio() {
  # Tizen Studio (the IDE distribution) ships tools/ide and no tools/tizen-core.
  [[ -d "$1/tools/ide" && ! -d "$1/tools/tizen-core" ]]
}

_is_tizen_sdk() {
  # A real tizen-sdk has the tizen-core tools (tz) under tools/; a bare sdb is
  # accepted too (older layouts) unless the directory is a Tizen Studio install,
  # which also ships tools/sdb.
  [[ -d "$1/tools/tizen-core" ]] && return 0
  [[ -e "$1/tools/sdb" || -e "$1/tools/sdb.exe" ]] || return 1
  ! _is_tizen_studio "$1"
}

_read_configured_sdk_path() {
  # Trim only leading/trailing whitespace — the path may contain interior spaces.
  [[ -f "$HOME/.tizen.sdk.path.config" ]] || return 0
  head -n1 "$HOME/.tizen.sdk.path.config" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

get_sdk_path() {
  local c configured
  configured="$(_read_configured_sdk_path)"
  for c in "$configured" "${TIZEN_SDK_PATH:-}" "$HOME/tizen-sdk" "/opt/tizen-sdk"; do
    [[ -n "$c" ]] || continue
    if _is_tizen_sdk "$c"; then
      echo "$c"
      return 0
    fi
  done
  # Nothing validated (SDK probably not installed) — default to the standard path.
  echo "$HOME/tizen-sdk"
}

# Where a NEW SDK install goes when the caller gave no --path: the configured
# path (sdk-init / a previous install), else TIZEN_SDK_PATH unless it points at
# a Tizen Studio install, else $HOME/tizen-sdk. The JS pre-check passes --path
# explicitly; this default only guards a hand-run installer (issue #70).
default_sdk_install_path() {
  local configured
  configured="$(_read_configured_sdk_path)"
  if [[ -n "$configured" ]]; then
    echo "$configured"
    return 0
  fi
  if [[ -n "${TIZEN_SDK_PATH:-}" ]]; then
    if _is_tizen_studio "$TIZEN_SDK_PATH"; then
      echo "[WARN]  Ignoring TIZEN_SDK_PATH=$TIZEN_SDK_PATH: that is a Tizen Studio install, not a tizen-sdk directory. Installing to $HOME/tizen-sdk (pass --path to override)." >&2
    else
      echo "$TIZEN_SDK_PATH"
      return 0
    fi
  fi
  echo "$HOME/tizen-sdk"
}

# ----------------------------------------------------------------------------
# Tizen package repository (pkg_list) helpers
#
# A usable Tizen package repository serves a package list file named
# pkg_list_{OS}-{ARCH} at its root, where OS is windows | ubuntu | macos and
# ARCH is 64 or 32 (e.g. pkg_list_windows-64, pkg_list_ubuntu-32). A URL that
# does not serve such a file for the CURRENT OS cannot drive an install, so a
# custom repository URL is rejected up front instead of failing 100 downloads
# later. Both tizen-sdk-install and tizen-sdk-install-custom-repo use these.
# ----------------------------------------------------------------------------

# Echo the pkg_list OS token for this machine: windows | ubuntu | macos
# (empty string on an unsupported OS).
pkg_os_base() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Linux*)               echo "ubuntu" ;;
    Darwin*)              echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)                    echo "" ;;
  esac
}

# Trim whitespace and trailing slashes so "$url/pkg_list_x" never doubles a
# slash (some servers 404 on "//pkg_list_...").
normalize_repo_url() {
  local url="$1"
  url="${url#"${url%%[![:space:]]*}"}"   # ltrim
  url="${url%"${url##*[![:space:]]}"}"   # rtrim
  while [[ "$url" == */ ]]; do url="${url%/}"; done
  echo "$url"
}

# Return 0 when the URL serves content: HEAD first, then a 1-byte ranged GET
# for servers that reject HEAD (405/501) — a repo can be perfectly usable and
# still refuse HEAD, so a HEAD-only probe would produce false rejections.
url_exists() {
  local url="$1"
  curl -fsSLI --max-time 30 -o /dev/null "$url" 2>/dev/null && return 0
  curl -fsSL --max-time 30 -r 0-0 -o /dev/null "$url" 2>/dev/null && return 0
  return 1
}

# Validate a custom package repository URL.
#
# Echoes the matched pkg_list OS-ARCH token (e.g. "ubuntu-64") on stdout and
# returns 0. Logs the reason and returns 1 when the URL is malformed or serves
# no pkg_list_{OS}-{64,32} for the current OS.
#
# Usage: PKG_OS="$(validate_pkg_repo_url "$REPO_URL")" || exit 1
validate_pkg_repo_url() {
  local url base arch candidate
  url="$(normalize_repo_url "${1:-}")"

  if [[ -z "$url" ]]; then
    log_error "Repository URL is empty"
    return 1
  fi
  if [[ "$url" != http://* && "$url" != https://* ]]; then
    log_error "Repository URL must start with http:// or https:// — got: $url"
    return 1
  fi

  base="$(pkg_os_base)"
  if [[ -z "$base" ]]; then
    log_error "Unsupported OS — cannot determine the pkg_list name to look for"
    return 1
  fi

  log_step "=== Validating package repository URL ==="
  log_info "Repository: $url"

  for arch in 64 32; do
    candidate="$url/pkg_list_${base}-${arch}"
    log_info "Probing $candidate"
    if url_exists "$candidate"; then
      log_ok "Valid repository — found pkg_list_${base}-${arch}"
      echo "${base}-${arch}"
      return 0
    fi
  done

  log_error "Not a valid Tizen package repository: $url"
  log_error "Neither pkg_list_${base}-64 nor pkg_list_${base}-32 is reachable there."
  log_error "A repository root must serve pkg_list_{OS}-{64,32} (OS = windows | ubuntu | macos)."
  log_error "Expected e.g. $url/pkg_list_${base}-64"
  return 1
}

# ----------------------------------------------------------------------------
# Locate a Tizen SDK tool.
#   sdb lives at <sdk>/tools/sdb
#   everything else (tz, ...) lives at <sdk>/tools/tizen-core/<name>
# Echoes the absolute path on stdout; logs and returns 1 if not found.
# ----------------------------------------------------------------------------
find_tizen_tool() {
  local tool_name="$1"
  local sdk_path tool_path
  sdk_path="$(get_sdk_path)"

  if [[ "$tool_name" == "sdb" ]]; then
    tool_path="$sdk_path/tools/sdb"
  else
    tool_path="$sdk_path/tools/tizen-core/$tool_name"
  fi

  if [[ ! -x "$tool_path" ]]; then
    log_error "Cannot find $tool_name at $tool_path"
    return 1
  fi

  echo "$tool_path"
}

# ----------------------------------------------------------------------------
# Locate an installed .NET SDK `dotnet` executable, even when it is NOT on PATH.
# Searches PATH, well-known install locations, and Tizen SDK-bundled dotnets.
# Prints the path to a usable SDK (preferring one that has the Tizen workload)
# on stdout, or nothing if none is found. Does NOT modify the environment.
# ----------------------------------------------------------------------------
discover_dotnet() {
  local candidates=() c first_sdk=""

  command -v dotnet >/dev/null 2>&1 && candidates+=("$(command -v dotnet)")
  [[ -n "${DOTNET_ROOT:-}" ]] && candidates+=("$DOTNET_ROOT/dotnet")
  candidates+=(
    "$HOME/.dotnet/dotnet"
    "/usr/local/share/dotnet/dotnet"
    "/usr/share/dotnet/dotnet"
    "/usr/lib/dotnet/dotnet"
    "/opt/dotnet/dotnet"
  )

  # Tizen SDK-bundled dotnets (…/server/sdktools/dotnet/dotnet and ~/tizen-sdk).
  while IFS= read -r c; do [[ -n "$c" ]] && candidates+=("$c"); done < <(
    { find "$HOME" -maxdepth 6 -type f -name dotnet -path '*/sdktools/dotnet/dotnet' 2>/dev/null
      [[ -d "$HOME/tizen-sdk" ]] && find "$HOME/tizen-sdk" -maxdepth 6 -type f -name dotnet 2>/dev/null
    } | sort -u
  )

  for c in "${candidates[@]}"; do
    [[ -x "$c" ]] || continue
    # Must be a real SDK (lists at least one SDK), not a runtime-only host.
    [[ -n "$("$c" --list-sdks 2>/dev/null)" ]] || continue
    [[ -z "$first_sdk" ]] && first_sdk="$c"
    # Prefer one that already has the Tizen workload installed.
    if "$c" workload list 2>/dev/null | grep -qiE '^[[:space:]]*tizen'; then
      echo "$c"
      return 0
    fi
  done

  [[ -n "$first_sdk" ]] && echo "$first_sdk"
}

# ----------------------------------------------------------------------------
# Device discovery via `sdb devices`.
#   get_connected_devices <sdb>  -> all serials in 'device' state, one per line
#   get_device_serial <sdb>      -> first connected serial (empty if none)
# ----------------------------------------------------------------------------
get_connected_devices() {
  local sdb_path="$1"
  "$sdb_path" devices 2>/dev/null \
    | grep -v '^List' \
    | grep -E '[[:space:]]device([[:space:]]|$)' \
    | awk '{print $1}'
}

get_device_serial() {
  local sdb_path="$1"
  get_connected_devices "$sdb_path" | head -n1
}

# ----------------------------------------------------------------------------
# Run a one-line `sdb shell` command and echo the first non-empty CR-stripped
# line (empty if none).
# Reads the caller's SDB (sdb path) and SERIAL (target device; when empty the
# command goes to sdb's default target) — the convention the debug scripts
# already follow, so they can share this instead of each carrying a copy.
# ----------------------------------------------------------------------------
sdb_line() {
  "$SDB" ${SERIAL:+-s "$SERIAL"} shell "$1" 2>/dev/null | tr -d '\r' | awk 'NF {print; exit}'
}

# ----------------------------------------------------------------------------
# Resolve the LAUNCHABLE app id for a package/app id, as the device lists it.
#   resolve_app_id <sdb> <serial> <needle>
# `app_launcher -l` prints entries as 'Name'  'AppID'. Prefer an exact match,
# then a dotted token containing the needle (a real app id is dotted —
# web: <pkgid>.<name>, native/.NET: org.example.<name> — while the bare
# display-name token is not), then any containing token.
# Echoes the id on stdout; returns 1 (nothing echoed) when the app is not
# listed, i.e. not installed. `launch_app`/`app_launcher -s` with an unknown
# id silently do nothing, so callers must treat an empty result as an error
# instead of launching blind (issue #97).
# ----------------------------------------------------------------------------
resolve_app_id() {
  local sdb_path="$1" serial="$2" needle="$3" list candidates dotted
  list=$("$sdb_path" ${serial:+-s "$serial"} shell "app_launcher -l" 2>/dev/null | tr -d '\r' || true)
  candidates=$(printf '%s\n' "$list" | grep -o "'[^']*${needle}[^']*'" | tr -d "'" || true)
  [[ -z "$candidates" ]] && return 1
  # An exact hit counts only when it is dotted: the display NAME can equal the
  # needle too ('MyWebApp' next to 'xA4DHr9cFv.MyWebApp') and is not launchable.
  if [[ "$needle" == *.* ]] && printf '%s\n' "$candidates" | grep -qxF -- "$needle"; then
    echo "$needle"; return 0
  fi
  dotted=$(printf '%s\n' "$candidates" | grep '\.' | head -n1 || true)
  if [[ -n "$dotted" ]]; then
    echo "$dotted"; return 0
  fi
  printf '%s\n' "$candidates" | head -n1
}

# ----------------------------------------------------------------------------
# Locate em-cli (Emulator Manager CLI).
#   get_sdk_path() honours TIZEN_SDK_PATH and ~/.tizen.sdk.path.config (the
#   path tizen-sdk-init saves), so a non-default SDK location works without
#   every script hardcoding its own guesses. The literal paths stay as a last
#   resort for an SDK that is installed but has no config written yet.
# Echoes the absolute path on stdout; returns 1 (silently) if not found — the
# caller decides whether that is fatal (emulator-manager) or a soft skip
# (device-manager's stop fallback).
# ----------------------------------------------------------------------------
find_emcli() {
  local sdk_path c
  sdk_path="$(get_sdk_path)"
  local candidates=(
    "$sdk_path/tools/emulator/bin/em-cli"
    "$HOME/tizen-sdk/tools/emulator/bin/em-cli"
    "/opt/tizen-sdk/tools/emulator/bin/em-cli"
  )
  for c in "${candidates[@]}"; do
    if [ -f "$c" ]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

# ----------------------------------------------------------------------------
# Resolve a path to absolute form (file or directory).
# ----------------------------------------------------------------------------
to_absolute_path() {
  local path="$1"
  if [[ "$path" == /* ]]; then
    echo "$path"
  elif [[ -d "$path" ]]; then
    echo "$(cd "$path" && pwd)"
  else
    echo "$(cd "$(dirname "$path")" && pwd)/$(basename "$path")"
  fi
}
