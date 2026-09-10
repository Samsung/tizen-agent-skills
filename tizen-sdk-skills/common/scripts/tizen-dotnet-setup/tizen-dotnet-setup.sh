#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-dotnet-setup.sh
#
# Sets up the .NET development environment for Tizen DotNET projects on Linux/macOS.
#
# - Checks whether the .NET SDK (dotnet) is installed.
#   * If NOT installed: auto-installs it user-scope with the official
#     dotnet-install.sh into ~/.dotnet — no sudo needed, and the later workload
#     step will not need sudo either (the SDK dir is user-owned).
#     --no-install-sdk skips the auto-install; if skipped or the auto-install
#     fails (offline / proxy), prints OS-specific guidance and exits 2.
#   * If installed: installs the Tizen .NET workload into THAT SAME dotnet, using
#     Samsung's official workload-install.sh first and falling back to
#     `dotnet workload install tizen`.
#     If a non-sudo install fails on a root-owned SDK dir, it retries under sudo.
#
# Usage:
#   ./tizen-dotnet-setup.sh [-f|--force] [-v|--version <ver>] [--no-install-sdk]
#                           [--sdk-channel <chan>] [-h|--help]
#
# Options:
#   -f, --force            Reinstall the Tizen workload even if it is already present
#   -v, --version <ver>    Tizen workload version to pass to the Samsung installer
#   --no-install-sdk       Do not auto-install a missing .NET SDK (guidance + exit 2)
#   --sdk-channel <chan>   .NET SDK channel for the auto-install (default: 8.0)
#   -h, --help             Show this help
#
# Exit codes:
#   0  success / workload already installed
#   1  install failed
#   2  no .NET SDK found anywhere, and the user-scope auto-install was skipped
#      (--no-install-sdk) or failed (guidance shown)
#   3  workload installed into a DIFFERENT SDK band / install dir than the one
#      we verify against (see the [DIAG] lines)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

WORKLOAD_URL="https://raw.githubusercontent.com/Samsung/Tizen.NET/main/workload/scripts/workload-install.sh"
DOTNET_INSTALL_URL="https://dot.net/v1/dotnet-install.sh"
DOTNET_DOWNLOAD_URL="https://dotnet.microsoft.com/download"

FORCE=false
VERSION=""
INSTALL_SDK=true
SDK_CHANNEL="8.0"

# ---------------------------------------------------------------------------
# Parse options
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    -f|--force)   FORCE=true; shift ;;
    -v|--version) VERSION="$2"; shift 2 ;;
    --no-install-sdk) INSTALL_SDK=false; shift ;;
    --sdk-channel)    SDK_CHANNEL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) log_error "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
resolve_path() {
  local p="$1"
  if readlink -f "$p" >/dev/null 2>&1; then
    readlink -f "$p"
  else
    echo "$p"
  fi
}

# Exact set membership over a comma-separated band list.
#
# Deliberately NOT `case ",$list," in *",$needle,"*)`: that is a substring test,
# so a needle spanning several entries ("10.0.300,9.0.300" against that very
# list) would match, while the PowerShell side compares whole array elements and
# would not. Bands cannot contain commas today, so the two agreed in practice —
# but agreeing by luck is weaker than agreeing by construction.
band_in_list() {
  local needle="$1" list="$2" b
  [ -n "$needle" ] || return 1
  local IFS=','
  for b in $list; do
    [ "$b" = "$needle" ] && return 0
  done
  return 1
}

# SDK feature band, computed exactly the way Samsung's installer does
# (major.minor.<first digit of patch>00): 10.0.302 -> 10.0.300.
sdk_band() {
  local v="$1"
  [ -n "$v" ] || return 0
  local major minor patch
  IFS='.' read -r major minor patch _ <<<"$v"
  [ -n "$major" ] && [ -n "$minor" ] && [ -n "$patch" ] || return 0
  echo "${major}.${minor}.${patch:0:1}00"
}

# Make a discovered dotnet usable now and for future shells:
#   1) symlink it into ~/.local/bin (typically already on PATH), and
#   2) append DOTNET_ROOT/PATH exports to ~/.bashrc (idempotent),
# then export both into the current process so the workload step below works.
persist_dotnet() {
  local dotnet_bin="$1" droot
  droot="$(cd "$(dirname "$dotnet_bin")" && pwd)"

  # 1) symlink into ~/.local/bin
  local localbin="$HOME/.local/bin"
  mkdir -p "$localbin"
  if ln -sf "$dotnet_bin" "$localbin/dotnet"; then
    log_success "Linked dotnet -> $localbin/dotnet"
    case ":$PATH:" in
      *":$localbin:"*) ;;
      *) log_warning "$localbin is not on PATH — add it, or rely on the ~/.bashrc export below." ;;
    esac
  fi

  # 2) append exports to ~/.bashrc (idempotent, fenced by a marker)
  local rc="$HOME/.bashrc"
  local marker="# >>> tizen-dotnet-setup (dotnet on PATH) >>>"
  if [ -f "$rc" ] && grep -qF "$marker" "$rc"; then
    log_info "~/.bashrc already exports dotnet — leaving it as is."
  else
    {
      echo ""
      echo "$marker"
      echo "export DOTNET_ROOT=\"$droot\""
      echo "export PATH=\"\$DOTNET_ROOT:\$PATH\""
      echo "# <<< tizen-dotnet-setup (dotnet on PATH) <<<"
    } >> "$rc"
    log_success "Added dotnet exports to $rc (effective in new shells)."
  fi

  # Effective for the rest of THIS run.
  export DOTNET_ROOT="$droot"
  export PATH="$droot:$PATH"

  # A child process cannot clear the PARENT shell's command hash, so an
  # already-open shell that once resolved dotnet elsewhere (e.g. a removed
  # /usr/bin/dotnet) keeps failing until the user resets it themselves.
  log_info "New terminals will pick dotnet up automatically. If an ALREADY-OPEN shell says"
  log_info "'No such file or directory' for dotnet, run: hash -r  (bash) / rehash (zsh)."
}

# Auto-install the .NET SDK user-scope (no sudo) with the official installer.
# Installs to ~/.dotnet — the same location discover_dotnet already probes — so
# a later run still finds it even if this one is interrupted after this step.
# No EXIT trap here: the workload section's `trap cleanup EXIT` below would
# replace it anyway, and an interrupt can only leak one file in the temp dir.
auto_install_sdk() {
  local tmp rc=0
  log_step "=== Installing the .NET SDK (user-scope, no sudo) ==="
  log_info "Channel: $SDK_CHANNEL — installing to $HOME/.dotnet"
  tmp="$(mktemp "${TMPDIR:-/tmp}/dotnet-install-XXXXXX.sh")" || return 1
  # --proto(-redir) '=https': the installer runs with the user's privileges, so
  # a redirect must not be able to downgrade the transport to plain http.
  if ! curl -fsSL --proto '=https' --proto-redir '=https' --max-time 60 "$DOTNET_INSTALL_URL" -o "$tmp"; then
    log_warning "Could not download $DOTNET_INSTALL_URL (offline, or a proxy is required?)."
    rm -f "$tmp"
    return 1
  fi
  # --install-dir pins the user-scope target: without it dotnet-install.sh
  # honors a stray DOTNET_INSTALL_DIR from the environment and installs
  # somewhere this script neither verifies nor persists. Mirrors the .ps1
  # side, which passes -InstallDir explicitly.
  bash "$tmp" --channel "$SDK_CHANNEL" --install-dir "$HOME/.dotnet" || rc=$?
  rm -f "$tmp"
  if [ "$rc" -ne 0 ] || [ ! -x "$HOME/.dotnet/dotnet" ]; then
    log_warning "dotnet-install.sh did not produce a usable SDK at $HOME/.dotnet (exit $rc)."
    return 1
  fi
  log_success ".NET SDK installed to $HOME/.dotnet"
  return 0
}

# Is the Tizen workload installed in the dotnet we pinned?
tizen_workload_installed() {
  "$DOTNET_BIN" workload list 2>/dev/null | grep -qiE '^[[:space:]]*tizen'
}

log_step "=== Tizen .NET environment setup ==="

OS="$(detect_os)"
log_info "Detected OS: $OS"

# ---------------------------------------------------------------------------
# 1) Detect the .NET SDK
# ---------------------------------------------------------------------------
log_step "=== Checking for the .NET SDK ==="
DOTNET_BIN=""
if command -v dotnet >/dev/null 2>&1; then
  DOTNET_BIN="$(command -v dotnet)"
else
  # Not on PATH — it may still be installed (e.g. bundled in a Tizen SDK tree).
  log_warning "dotnet is not on PATH — searching for an existing .NET SDK install..."
  DOTNET_BIN="$(discover_dotnet)"
  if [ -n "$DOTNET_BIN" ]; then
    log_success "Found an installed .NET SDK not on PATH: $DOTNET_BIN"
    persist_dotnet "$DOTNET_BIN"
    # Prefer the now-on-PATH entry (e.g. the ~/.local/bin symlink).
    DOTNET_BIN="$(command -v dotnet || echo "$DOTNET_BIN")"
  fi
fi

# No SDK anywhere — install it ourselves, user-scope, unless opted out.
if [ -z "$DOTNET_BIN" ] && [ "$INSTALL_SDK" = true ]; then
  if auto_install_sdk; then
    persist_dotnet "$HOME/.dotnet/dotnet"
    # Prefer the now-on-PATH entry (e.g. the ~/.local/bin symlink).
    DOTNET_BIN="$(command -v dotnet || echo "$HOME/.dotnet/dotnet")"
  fi
fi

if [ -z "$DOTNET_BIN" ]; then
  log_error ".NET SDK (dotnet) is not installed or not on PATH."
  echo "" >&2
  if [ "$INSTALL_SDK" = true ]; then
    log_info "The automatic user-scope install failed (see above) — install the .NET SDK manually, then re-run this setup."
  else
    log_info "Automatic install skipped (--no-install-sdk) — install the .NET SDK, then re-run this setup."
  fi
  log_info "Download (all platforms): $DOTNET_DOWNLOAD_URL"
  log_info "Recommended: .NET 8 SDK (for current Tizen targets)"
  echo "" >&2
  case "$OS" in
    linux)
      log_info "Ubuntu/Linux quick install options:"
      log_info "  Official script (no sudo — installs to ~/.dotnet, and the workload step won't need sudo either):"
      log_info "    curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0"
      log_info "  Or distro package (system-wide, requires sudo — the workload step will then need sudo too):"
      log_info "    sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0"
      log_info "  If behind a corporate proxy, set http_proxy / https_proxy / ftp_proxy env vars first:"
      log_info "    export http_proxy=http://[proxy-host]:[port]"
      log_info "    export https_proxy=http://[proxy-host]:[port]"
      ;;
    mac)
      log_info "macOS quick install options:"
      log_info "  brew install --cask dotnet-sdk"
      log_info "  If behind a corporate proxy, configure brew first (ask IT for proxy URL):"
      log_info "    export ALL_PROXY=http://[proxy-host]:[port]"
      log_info "  or download the installer from $DOTNET_DOWNLOAD_URL"
      ;;
    windows)
      log_info "Windows quick install options:"
      log_info "  winget install Microsoft.DotNet.SDK.8"
      log_info "  (On Windows, prefer the PowerShell script tizen-dotnet-setup.ps1)"
      ;;
  esac
  echo "" >&2
  log_warning "After installing the .NET SDK, open a new terminal and run this setup again."
  exit 2
fi

# ---------------------------------------------------------------------------
# 1b) Pin ONE install target and keep install + verify on it.
#
# Samsung's workload-install.sh picks its own target when -d is omitted, so a
# stale DOTNET_ROOT can send the workload into a different SDK band than the one
# we verify against. Resolve the root
# once, pass it with -d, and mirror it into the child's environment — without
# touching the user's persisted value.
# ---------------------------------------------------------------------------
DOTNET_REAL="$(resolve_path "$DOTNET_BIN")"
ENV_DOTNET_ROOT_RAW="${DOTNET_ROOT:-}"
DOTNET_ROOT="$(cd "$(dirname "$DOTNET_REAL")" && pwd)"
export DOTNET_ROOT

# Only pin the installer with -d when the resolved root really is a .NET install
# root. If it is not (shim we failed to resolve, unusual layout), letting the
# installer resolve its own target is strictly safer than sending it somewhere
# with no sdk/ directory.
DOTNET_ROOT_USABLE=true
if [ ! -d "$DOTNET_ROOT/sdk" ]; then
  DOTNET_ROOT_USABLE=false
  log_warning "$DOTNET_ROOT does not look like a .NET install root (no 'sdk' directory)."
  log_warning "Not pinning the Samsung installer with -d; it will resolve its own target."
fi

DOTNET_VERSION="$("$DOTNET_BIN" --version 2>/dev/null)"
log_success ".NET SDK found: dotnet $DOTNET_VERSION"

INSTALLED_SDKS="$("$DOTNET_BIN" --list-sdks 2>/dev/null)"
log_info "Installed SDKs:"
while IFS= read -r line; do [ -n "$line" ] && log_info "    $line"; done <<<"$INSTALLED_SDKS"

SDK_BAND="$(sdk_band "$DOTNET_VERSION")"
# The manifest DIRECTORY, not a fixed file path: SDK 8.0.1xx and earlier put
# WorkloadManifest.json directly here, while 8.0.2xx+ nest it one level deeper
# under a manifest-version directory. Probing only the flat path would report
# exists=false for a perfectly good install.
MANIFEST_DIR=""
[ -n "$SDK_BAND" ] && MANIFEST_DIR="$DOTNET_ROOT/sdk-manifests/$SDK_BAND/samsung.net.sdk.tizen"

# Distinct feature bands across every installed SDK.
INSTALLED_BANDS=""
while IFS= read -r line; do
  [ -n "$line" ] || continue
  b="$(sdk_band "${line%% *}")"
  [ -n "$b" ] || continue
  case " $INSTALLED_BANDS " in *" $b "*) ;; *) INSTALLED_BANDS="${INSTALLED_BANDS:+$INSTALLED_BANDS }$b" ;; esac
done <<<"$INSTALLED_SDKS"
BAND_COUNT="$(echo $INSTALLED_BANDS | wc -w | tr -d ' ')"

if [ -n "$ENV_DOTNET_ROOT_RAW" ] && [ "${ENV_DOTNET_ROOT_RAW%/}" != "${DOTNET_ROOT%/}" ]; then
  log_warning "DOTNET_ROOT ($ENV_DOTNET_ROOT_RAW) does not match the dotnet being used ($DOTNET_ROOT)."
  log_warning "The dotnet on PATH wins. Overriding DOTNET_ROOT for this run only (your saved value is left alone)."
  log_warning "If builds keep failing to see the Tizen workload, unset DOTNET_ROOT or point it at $DOTNET_ROOT."
fi

log_info "Install target: $DOTNET_ROOT (SDK $DOTNET_VERSION, band $SDK_BAND)"
log_info "dotnet resolved to: $DOTNET_REAL"

# ---------------------------------------------------------------------------
# 2) Idempotency check
# ---------------------------------------------------------------------------
if tizen_workload_installed && [ "$FORCE" != true ]; then
  log_success "Tizen workload is already installed."
  log_info "Run again with --force to reinstall."
  exit 0
fi

# ---------------------------------------------------------------------------
# 3) Install the Tizen workload
#    install_once <sudo-prefix>: try Samsung script, then dotnet workload fallback
# ---------------------------------------------------------------------------
TMP_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/workload-install-XXXXXX.sh")"
TMP_LOG="$(mktemp "${TMPDIR:-/tmp}/workload-install-XXXXXX.log")"
cleanup() { rm -f "$TMP_SCRIPT" "$TMP_LOG"; }
trap cleanup EXIT

INSTALLER_OUTPUT=""
UPDATE_ALL_WORKLOADS=false

install_once() {
  local prefix="$1"   # "" or "sudo"

  # Method 1: Samsung workload-install.sh
  log_info "Method 1: Samsung workload-install.sh ${prefix:+(with $prefix)}"
  if curl -fsSL --max-time 60 "$WORKLOAD_URL" -o "$TMP_SCRIPT"; then
    local args=()
    [ "$DOTNET_ROOT_USABLE" = true ] && args+=(-d "$DOTNET_ROOT")
    if [ -n "$VERSION" ]; then
      args+=(-v "$VERSION")
    elif [ "${BAND_COUNT:-1}" -gt 1 ]; then
      # Without -u the installer only handles `dotnet --version`, leaving other
      # bands without a manifest. -u overrides an explicit -v, so they are
      # mutually exclusive.
      log_info "Multiple SDK bands installed ($INSTALLED_BANDS) — installing for all of them (-u)."
      args+=(-u)
      UPDATE_ALL_WORKLOADS=true
    fi

    # Capture the output: the Samsung script swallows per-SDK failures and can
    # still exit 0, so the exit code alone is not a success signal.
    local rc=0
    $prefix bash "$TMP_SCRIPT" "${args[@]}" >"$TMP_LOG" 2>&1 || rc=$?
    cat "$TMP_LOG"
    # Keep the newline: $(...) strips trailing ones, which would glue the sudo
    # retry's first line onto the previous run's last line.
    INSTALLER_OUTPUT="$INSTALLER_OUTPUT$(cat "$TMP_LOG")"$'\n'

    if [ "$rc" -eq 0 ] && ! grep -q 'Failed to install Tizen Workload for sdk' "$TMP_LOG"; then
      return 0
    fi
    log_warning "Samsung installer failed${prefix:+ (with $prefix)}."
  else
    log_warning "Could not download Samsung installer."
  fi

  # Method 2: dotnet workload install tizen (fallback).
  # Capture it too — a permission failure that only shows up here still has to
  # reach the permission_denied diagnosis below.
  log_info "Method 2 (fallback): dotnet workload install tizen ${prefix:+(with $prefix)}"
  local rc2=0
  $prefix "$DOTNET_BIN" workload install tizen >"$TMP_LOG" 2>&1 || rc2=$?
  cat "$TMP_LOG"
  INSTALLER_OUTPUT="$INSTALLER_OUTPUT$(cat "$TMP_LOG")"$'\n'
  if [ "$rc2" -eq 0 ]; then
    # Same wording as the .ps1 side — the envelope layer keys its "this run
    # recovered via the fallback" clarifier off this line.
    log_success "Fallback workload install completed."
    return 0
  fi
  return 1
}

log_step "=== Installing the Tizen .NET workload ==="

install_once ""
status=$?

# Retry under sudo if it failed (likely a root-owned SDK dir) and we can elevate.
if [ "$status" -ne 0 ] || ! tizen_workload_installed; then
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    # Do NOT blame permissions here: this retry runs after ANY failed install, and
    # the [DIAG] block below is what decides whether permissions were the cause.
    # Saying "needs elevated permissions" unconditionally is how the misleading
    # elevation advice in #258 got manufactured in the first place.
    if [ -t 0 ]; then
      log_warning "Install did not complete — retrying under sudo in case the .NET SDK dir is root-owned."
      log_warning "(You may be prompted for your password.)"
      install_once "sudo"
    elif sudo -n true 2>/dev/null; then
      # Non-interactive (the plugin runner redirects stdio, so sudo cannot
      # prompt), but the credentials are cached — the retry can still work.
      log_warning "Install did not complete — retrying under sudo (cached credentials, no prompt needed)."
      install_once "sudo -n"
    else
      # Non-interactive AND no cached credentials: a plain `sudo` would just die
      # with "a terminal is required". Skip the doomed retry and say exactly
      # what to run instead — this line is captured into the failure envelope.
      log_warning "Install did not complete, and this non-interactive run cannot prompt for a sudo password."
      log_warning "If this is a permission problem, re-run manually: sudo bash \"$0\""
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 4) Verify — against the SAME dotnet we installed into
# ---------------------------------------------------------------------------
log_step "=== Verifying the Tizen workload ==="
if tizen_workload_installed; then
  log_success "Tizen workload installed successfully."
  log_info "Next: create a DotNET project with the tizen-create-project agent."
  exit 0
fi

# ---------------------------------------------------------------------------
# 4b) Verification failed — report WHERE things actually are instead of guessing.
# These [DIAG] lines are parsed by lib/core/dotnet.js into the failure envelope,
# so the calling agent never has to probe the machine by hand.
# ---------------------------------------------------------------------------
log_error "Tizen workload not found after installation."

# Which SDKs did the installer look at? Collect them ALL, not just the last one:
# with -u the installer walks every installed SDK, so "the last line" is simply
# the last iteration, not a target. What matters is whether our band is in the set.
INSTALLER_CHECKED_SDKS=""
INSTALLER_CHECKED_BANDS=""
while IFS= read -r s; do
  [ -n "$s" ] || continue
  band_in_list "$s" "$INSTALLER_CHECKED_SDKS" || INSTALLER_CHECKED_SDKS="${INSTALLER_CHECKED_SDKS:+$INSTALLER_CHECKED_SDKS,}$s"
  b="$(sdk_band "$s")"
  [ -n "$b" ] || continue
  band_in_list "$b" "$INSTALLER_CHECKED_BANDS" || INSTALLER_CHECKED_BANDS="${INSTALLER_CHECKED_BANDS:+$INSTALLER_CHECKED_BANDS,}$b"
# The trailing sed strips sentence punctuation the installer glues onto the
# version ("... for sdk 8.0.130." -> "8.0.130"), which \S+ would keep.
done <<<"$(echo "$INSTALLER_OUTPUT" | sed -n 's/.*Check Tizen Workload for sdk[[:space:]]\{1,\}\([^[:space:]]\{1,\}\).*/\1/p' | sed 's/[.,;]*$//')"

# Both the Samsung installer's own wording and what the dotnet CLI prints when it
# cannot write to the SDK directory.
PERMISSION_DENIED=false
echo "$INSTALLER_OUTPUT" | grep -qEi 'No permission to install|Access to the path .* is denied|Permission denied|UnauthorizedAccess' && PERMISSION_DENIED=true

MANIFEST_BANDS=""
if [ -d "$DOTNET_ROOT/sdk-manifests" ]; then
  for d in "$DOTNET_ROOT"/sdk-manifests/*/samsung.net.sdk.tizen; do
    [ -d "$d" ] || continue
    b="$(basename "$(dirname "$d")")"
    MANIFEST_BANDS="${MANIFEST_BANDS:+$MANIFEST_BANDS,}$b"
  done
fi

# Flat layout (<= 8.0.1xx) or nested under a manifest-version dir (8.0.2xx+).
MANIFEST_EXISTS=false
if [ -n "$MANIFEST_DIR" ] && [ -d "$MANIFEST_DIR" ]; then
  if [ -f "$MANIFEST_DIR/WorkloadManifest.json" ]; then
    MANIFEST_EXISTS=true
  else
    for f in "$MANIFEST_DIR"/*/WorkloadManifest.json; do
      [ -f "$f" ] && { MANIFEST_EXISTS=true; break; }
    done
  fi
fi

WORKLOAD_VERSION_LINE="$("$DOTNET_BIN" workload list 2>/dev/null | grep -m1 'Workload version:' | sed 's/^[[:space:]]*//')"

echo "[DIAG] dotnet_path=$DOTNET_REAL"
echo "[DIAG] dotnet_version=$DOTNET_VERSION"
echo "[DIAG] dotnet_root=$DOTNET_ROOT"
echo "[DIAG] sdk_band=$SDK_BAND"
echo "[DIAG] env_dotnet_root=${ENV_DOTNET_ROOT_RAW:-(unset)}"
echo "[DIAG] installer_pinned_dir=$(if [ "$DOTNET_ROOT_USABLE" = true ]; then echo "$DOTNET_ROOT"; else echo '(not pinned)'; fi)"
echo "[DIAG] installer_update_all=$UPDATE_ALL_WORKLOADS"
echo "[DIAG] installer_checked_sdks=${INSTALLER_CHECKED_SDKS:-(none)}"
echo "[DIAG] installer_checked_bands=${INSTALLER_CHECKED_BANDS:-(none)}"
echo "[DIAG] manifest_expected=${MANIFEST_DIR:-(unknown)}/[<manifest-version>/]WorkloadManifest.json exists=$MANIFEST_EXISTS"
echo "[DIAG] manifest_found_in_bands=${MANIFEST_BANDS:-(none)}"
echo "[DIAG] workload_version_line=${WORKLOAD_VERSION_LINE:-(none)}"
echo "[DIAG] permission_denied=$PERMISSION_DENIED"

# A permission failure explains everything downstream: nothing could be written,
# so any band evidence below is a SYMPTOM, not the cause. Report it first, or the
# caller gets told "this is not a permissions problem" about a permissions problem.
if [ "$PERMISSION_DENIED" = true ]; then
  log_error "The installer could not write to the SDK directory (permission denied)."
  log_error "Re-run this setup with sudo, or make $DOTNET_ROOT writable by your user."
  exit 1
fi

# Wrong-target case: the workload went somewhere other than the band this dotnet
# uses. Decide by SET MEMBERSHIP, never by "the last SDK the installer mentioned"
# — under -u that last line is just the final iteration, not a target.
WRONG_BAND=false
if [ -n "$MANIFEST_BANDS" ] && [ -n "$SDK_BAND" ]; then
  band_in_list "$SDK_BAND" "$MANIFEST_BANDS" || WRONG_BAND=true
fi
if [ -n "$INSTALLER_CHECKED_BANDS" ] && [ -n "$SDK_BAND" ]; then
  band_in_list "$SDK_BAND" "$INSTALLER_CHECKED_BANDS" || WRONG_BAND=true
fi

if [ "$WRONG_BAND" = true ]; then
  log_error "The Tizen workload was registered for a DIFFERENT .NET SDK than the one in use."
  log_error "In use: $DOTNET_VERSION (band $SDK_BAND) at $DOTNET_ROOT"
  [ -n "$INSTALLER_CHECKED_BANDS" ] && log_error "Installer only handled band(s): $INSTALLER_CHECKED_BANDS"
  [ -n "$MANIFEST_BANDS" ] && log_error "Manifest present for band(s): $MANIFEST_BANDS"
  log_error "Fix: unset DOTNET_ROOT (or point it at $DOTNET_ROOT) and re-run this setup."
  exit 3
fi

exit 1
