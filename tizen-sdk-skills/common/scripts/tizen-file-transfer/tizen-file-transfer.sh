#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


# Tizen file transfer script for Linux/macOS/WSL2
# Pushes or pulls files/directories between host and Tizen device via sdb

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

DIRECTION=""
LOCAL_PATH=""
REMOTE_PATH=""
DEVICE_SERIAL=""
WITH_UTF8=false
HELP_TEXT=""

# ============================================================================
# Parsing Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        -d|--direction)
            DIRECTION="$2"
            shift 2
            ;;
        -l|--local)
            LOCAL_PATH="$2"
            shift 2
            ;;
        -r|--remote)
            REMOTE_PATH="$2"
            shift 2
            ;;
        -s|--serial)
            DEVICE_SERIAL="$2"
            shift 2
            ;;
        --with-utf8)
            WITH_UTF8=true
            shift
            ;;
        -h|--help)
            HELP_TEXT=true
            shift
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [[ "$HELP_TEXT" == "true" ]]; then
    cat << 'EOF'
Usage: tizen-file-transfer.sh [options]

Options:
  -d, --direction <push|pull>  Transfer direction (required)
  -l, --local <path>           Local (host) file/directory path
                              (required for push; optional for pull, defaults to .)
  -r, --remote <path>          Remote (device) file/directory path (required)
  -s, --serial <serial>        Device serial number (optional, auto-detect if not specified)
  --with-utf8                  Handle UTF-8 encoded paths
  -h, --help                   Show this help message

Examples:
  # Push a file to device
  ./tizen-file-transfer.sh -d push -l ./myfile.txt -r /opt/usr/apps/myfile.txt

  # Pull a file from device
  ./tizen-file-transfer.sh -d pull -r /opt/usr/apps/myfile.txt -l ./myfile.txt

  # Push a directory recursively
  ./tizen-file-transfer.sh -d push -l ./mydir -r /opt/usr/apps/mydir

  # Pull to current directory
  ./tizen-file-transfer.sh -d pull -r /opt/usr/apps/myfile.txt
EOF
    exit 0
fi

# ============================================================================
# Validation
# ============================================================================

if [[ -z "$DIRECTION" ]]; then
    log_error "Direction is required (-d/--direction push|pull)"
    exit 1
fi

if [[ "$DIRECTION" != "push" && "$DIRECTION" != "pull" ]]; then
    log_error "Invalid direction: $DIRECTION. Must be 'push' or 'pull'"
    exit 1
fi

if [[ -z "$REMOTE_PATH" ]]; then
    log_error "Remote path is required (-r/--remote)"
    exit 1
fi

# For push, local path is required and must exist
if [[ "$DIRECTION" == "push" ]]; then
    if [[ -z "$LOCAL_PATH" ]]; then
        log_error "Local path is required for push (-l/--local)"
        exit 1
    fi
    if [[ ! -e "$LOCAL_PATH" ]]; then
        log_error "Local path not found: $LOCAL_PATH"
        exit 1
    fi
fi

# For pull, local path defaults to current directory
if [[ "$DIRECTION" == "pull" && -z "$LOCAL_PATH" ]]; then
    LOCAL_PATH="."
fi

# ============================================================================
# Main Execution
# ============================================================================

echo "Tizen File Transfer (Linux/macOS/WSL2)" >&2
echo "=======================================" >&2

# Find sdb
log_section "Locating sdb"
SDB_TOOL=$(find_tizen_tool "sdb") || exit 1
log_ok "Found sdb: $SDB_TOOL"

# Check for connected devices
log_section "Checking for connected devices"
DEVICES=($(get_connected_devices "$SDB_TOOL" || true))

if [[ ${#DEVICES[@]} -eq 0 ]]; then
    log_error "No devices found. Run device-manager first to connect a device or emulator."
    exit 1
fi

# Select device
if [[ -z "$DEVICE_SERIAL" ]]; then
    if [[ ${#DEVICES[@]} -eq 1 ]]; then
        DEVICE_SERIAL="${DEVICES[0]}"
        log_ok "Using device: $DEVICE_SERIAL"
    else
        echo "Found multiple devices:" >&2
        for i in "${!DEVICES[@]}"; do
            echo "$((i + 1)). ${DEVICES[$i]}" >&2
        done
        log_error "Multiple devices found. Please specify device serial with -s parameter."
        exit 1
    fi
fi

# Resolve local path to absolute
if [[ "$DIRECTION" == "push" ]]; then
    LOCAL_PATH=$(to_absolute_path "$LOCAL_PATH")
fi

# pull: confirm the remote object exists BEFORE calling sdb pull. sdb's own
# message for a missing path ("cannot stat '...': No such file or directory")
# is easy to lose, and a wrong path must end the run with a clear reason
# rather than an opaque failure the caller retries (issue #95).
if [[ "$DIRECTION" == "pull" ]]; then
    log_section "Checking remote path"
    # REMOTE_PATH was validated by the runner to contain no quotes/backticks/$.
    PROBE_OUTPUT=$("$SDB_TOOL" -s "$DEVICE_SERIAL" shell "ls -d \"$REMOTE_PATH\" >/dev/null 2>&1 && echo __TZ_REMOTE_EXISTS__ || echo __TZ_REMOTE_MISSING__" 2>&1 || true)
    if echo "$PROBE_OUTPUT" | grep -q '__TZ_REMOTE_MISSING__'; then
        log_error "Remote path does not exist on device $DEVICE_SERIAL: $REMOTE_PATH"
        echo "DEVICE_SERIAL=$DEVICE_SERIAL"
        echo "REMOTE_NOT_FOUND=$REMOTE_PATH"
        exit 1
    elif echo "$PROBE_OUTPUT" | grep -q '__TZ_REMOTE_EXISTS__'; then
        log_ok "Remote path exists: $REMOTE_PATH"
    else
        # The probe itself did not run (sdb shell error, odd shell on device) —
        # do not block the transfer on it; sdb pull will report the real result.
        log_warn "Could not verify remote path (probe output: ${PROBE_OUTPUT:-<empty>}); continuing"
    fi
fi

# Execute transfer
log_section "Transferring ($DIRECTION)"

TRANSFER_OUTPUT=""
TRANSFER_STATUS=0
if [[ "$DIRECTION" == "push" ]]; then
    log_info "Pushing: $LOCAL_PATH -> $REMOTE_PATH"
    TRANSFER_OUTPUT=$("$SDB_TOOL" -s "$DEVICE_SERIAL" push "$LOCAL_PATH" "$REMOTE_PATH" 2>&1) || TRANSFER_STATUS=$?
else
    log_info "Pulling: $REMOTE_PATH -> $LOCAL_PATH"
    TRANSFER_OUTPUT=$("$SDB_TOOL" -s "$DEVICE_SERIAL" pull "$REMOTE_PATH" "$LOCAL_PATH" 2>&1) || TRANSFER_STATUS=$?
fi

echo "$TRANSFER_OUTPUT" >&2

# Exit code is the primary success signal. Keep a secondary check anchored to
# sdb's actual error formats for cases where sdb exits 0 but reports an error.
# "cannot stat ... No such file or directory" is sdb's exact wording for a
# missing remote object and is specific enough not to false-positive on paths
# (bare "cannot"/"no such" would).
if [[ "$TRANSFER_STATUS" -ne 0 ]] || echo "$TRANSFER_OUTPUT" | grep -qiE '(^|[[:space:]])error:|failed to copy|cannot stat|No such file or directory|does not exist'; then
    log_error "Transfer failed (sdb exit code: $TRANSFER_STATUS)"
    echo "DEVICE_SERIAL=$DEVICE_SERIAL"
    if [[ "$DIRECTION" == "pull" ]] && echo "$TRANSFER_OUTPUT" | grep -qiE 'cannot stat|No such file or directory|does not exist'; then
        echo "REMOTE_NOT_FOUND=$REMOTE_PATH"
    fi
    exit 1
fi

# Extract bytes transferred from sdb output (e.g., "1234 file(s) pushed, 5678 bytes")
BYTES_TRANSFERRED=""
BYTES_MATCH=$(echo "$TRANSFER_OUTPUT" | grep -oiE '[0-9]+ bytes' | head -1 || true)
if [[ -n "$BYTES_MATCH" ]]; then
    BYTES_TRANSFERRED=$(echo "$BYTES_MATCH" | grep -oE '[0-9]+')
fi

log_ok "Transfer completed successfully!"

# Machine-readable output (stdout)
echo "DEVICE_SERIAL=$DEVICE_SERIAL"
echo "TRANSFER_DIRECTION=$DIRECTION"
echo "LOCAL_PATH=$LOCAL_PATH"
echo "REMOTE_PATH=$REMOTE_PATH"
if [[ -n "$BYTES_TRANSFERRED" ]]; then
    echo "BYTES_TRANSFERRED=$BYTES_TRANSFERRED"
fi

exit 0
