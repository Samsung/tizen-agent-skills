#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

#
# tizen-dlog-analyzer.sh — Wrapper for the tizen-dlog-analyzer native binary
#
# Resolves the platform-specific binary from the plugin cache (or repo) and
# executes the requested subcommand. The binary supports these commands:
#
#   dlog-collect      — Continuously collect/classify dlog from a device
#   exception-detect  — Detect crashes from collected log files
#   start-monitoring  — Run dlog-collect + exception-detect in parallel
#   error-analyze     — Detect non-fatal runtime errors (E/F priority)
#   app-log           — Print the full collected log for one app
#   app-launch        — Launch a Tizen application
#   app-terminate     — Terminate a running Tizen application
#   device-profile    — Detect and print the device profile
#   investigate       — One-shot first-pass investigation report
#   probe             — List/run evidence probes (subcommands: list, run)
#   snapshot          — Create/list/compare/delete system snapshots
#   timeline          — Probe history across snapshots (show/report/analyze/export)
#   kernel            — Kernel log collection and analysis (collect/analyze)
#
# dlog-collect, start-monitoring and kernel collect are long-running (non-terminating);
# exception-detect runs once in batch mode and exits unless invoked with
# --follow. The CLI runner (dlog-analyzer-cli.js) manages the long-running
# ones as background processes.
#
# Where the logs go: the binary has no --base-dir option (removed in
# TizenDLogAnalyzer PR #155). It resolves ONE log base directory from the SDK
# configuration — ~/.tizen.sdk.path.config -> TIZEN_SDK_DATA_PATH in
# <sdk>/sdk.info (or the <sdk>-data sibling) -> <sdk-data>/dloganalyzer/ — and
# every command reads and writes there. This wrapper only echoes that path.
#
# Usage:
#   tizen-dlog-analyzer.sh <subcommand> [serial]
#
# Arguments:
#   subcommand  - dlog-collect | exception-detect | start-monitoring | error-analyze | app-log | app-launch | app-terminate | device-profile | investigate | probe | snapshot | timeline | kernel
#   serial      - Optional sdb device serial (auto-detect if omitted)
#
# Exit codes:
#   0 - Success (binary started)
#   1 - No device found / device error
#   2 - Binary not found
#   3 - Missing dependencies / usage error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

SUBCOMMAND="${1:-}"
SERIAL="${2:-}"

if [ -z "$SUBCOMMAND" ]; then
  log_error "Usage: tizen-dlog-analyzer.sh <dlog-collect|exception-detect|start-monitoring> [serial]"
  exit 3
fi

# The third positional used to be an output directory. The binary cannot be
# pointed anywhere else any more, so refuse it instead of silently ignoring it.
if [ -n "${3:-}" ]; then
  log_error "A custom output directory ($3) is no longer supported: logs are stored under <sdk-data>/dloganalyzer/ (resolved from ~/.tizen.sdk.path.config)."
  log_error "Usage: tizen-dlog-analyzer.sh <subcommand> [serial]"
  exit 3
fi

# --- Resolve the SDK-based log directory (informational only) ---
# Same order as the binary's sdk_paths.py and the JS runner's
# resolveLogBaseDir(): config file -> sdk.info TIZEN_SDK_DATA_PATH -> sibling.
resolve_log_base_dir() {
  local sdk_root sdk_data
  sdk_root="$(_read_configured_sdk_path)"
  [[ -n "$sdk_root" && -d "$sdk_root" ]] || return 1
  sdk_data=""
  if [[ -f "$sdk_root/sdk.info" ]]; then
    # First TIZEN_SDK_DATA_PATH= line with a NON-EMPTY value (a line with an
    # empty value does not end the scan) — the binary's loop does the same.
    sdk_data="$(awk -F= '
      { sub(/^[[:space:]]+/, "", $0) }
      /^TIZEN_SDK_DATA_PATH=/ {
        v = substr($0, length("TIZEN_SDK_DATA_PATH=") + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v != "") { print v; exit }
      }' "$sdk_root/sdk.info" 2>/dev/null || true)"
  fi
  [[ -n "$sdk_data" ]] || sdk_data="${sdk_root}-data"
  echo "$sdk_data/dloganalyzer"
}

# --- Resolve the tizen-dlog-analyzer binary (platform-specific) ---
OS_NAME="$(uname -s)"
case "$OS_NAME" in
  Linux*)  BIN_OS="linux" ;;
  Darwin*) BIN_OS="macos" ;;
  MINGW*|MSYS*|CYGWIN*) BIN_OS="windows" ;;
  *)       BIN_OS="linux" ;;
esac

# Try plugin cache first, then the repo source
ANALYZER_BIN=""
for search_base in \
  "$HOME/.claude/plugins/cache/tizen-platform/tizen-sdk-skills"/*/tools \
  "$HOME/.cline/plugins/cache/tizen-platform/tizen-sdk-skills"/*/tools \
  "$SCRIPT_DIR/../../tools"; do
  # `|| true`: ls exits non-zero when the path doesn't exist, which would kill
  # the script under `set -euo pipefail` before the remaining bases are tried.
  candidate="$(ls -d "${search_base}/tizen-dlog-analyzer/${BIN_OS}/tizen-dlog-analyzer" 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    ANALYZER_BIN="$candidate"
    break
  fi
  # Windows .exe variant
  candidate_exe="$(ls -d "${search_base}/tizen-dlog-analyzer/${BIN_OS}/tizen-dlog-analyzer.exe" 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$candidate_exe" ] && [ -x "$candidate_exe" ]; then
    ANALYZER_BIN="$candidate_exe"
    break
  fi
done

if [ -z "$ANALYZER_BIN" ]; then
  log_error "tizen-dlog-analyzer binary not found for platform: $BIN_OS"
  log_error "Searched in plugin cache and repo tools directory."
  exit 2
fi

log_ok "Found binary: $ANALYZER_BIN"

# --- Resolve sdb and serial ---
SDB="${SDB:-sdb}"
if ! command -v "$SDB" &>/dev/null; then
  if ! SDB="$(find_tizen_tool sdb 2>/dev/null)"; then
    log_error "sdb not found. Source the Tizen Studio profile or set SDB env var."
    exit 3
  fi
fi

if [ -z "$SERIAL" ]; then
  DEVICES="$(get_connected_devices "$SDB" 2>/dev/null || true)"
  # `|| true` (not `|| echo 0`): grep -c already prints "0" when nothing matches
  # but ALSO exits 1, so `|| echo 0` produced "0\n0" and broke the -eq tests.
  DEVICE_COUNT=$(printf '%s' "$DEVICES" | grep -c . || true)
  DEVICE_COUNT="${DEVICE_COUNT:-0}"
  if [ "$DEVICE_COUNT" -eq 0 ]; then
    log_error "No connected Tizen device or emulator found."
    log_error "Launch an emulator first using tizen-launch-emulator."
    exit 1
  elif [ "$DEVICE_COUNT" -gt 1 ]; then
    log_error "Multiple devices connected. Specify serial as second argument."
    "$SDB" devices >&2
    exit 1
  fi
  SERIAL="$DEVICES"
fi

log_info "Device serial: $SERIAL"

# --- Run the subcommand ---
# The binary writes to stdout; the CLI runner captures this to a temp file.
# We pass the serial via sdb so the binary can attach to the right device.
# No --base-dir: the binary resolves <sdk-data>/dloganalyzer/ on its own and
# exits 1 with a one-line message when the SDK path is not configured.
log_info "Starting: $ANALYZER_BIN $SUBCOMMAND"
if LOG_BASE_DIR="$(resolve_log_base_dir)"; then
  log_info "Log directory (SDK data path): $LOG_BASE_DIR"
else
  log_warn "Tizen SDK path is not configured (~/.tizen.sdk.path.config); the analyzer will refuse to start. Run tizen-sdk-init first."
fi
log_info "Press Ctrl+C to stop."

# Export SDB_SERIAL so the analyzer can use it if needed
export SDB_SERIAL="$SERIAL"
export SDB_PATH="$SDB"

exec "$ANALYZER_BIN" "$SUBCOMMAND" --serial "$SERIAL" 2>&1
