#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-device-manager.sh
#
# Finds a connected Tizen device via sdb.
# If no device is found, returns a device_not_found error directing the user
# to tizen-create-emulator (to create a VM) and tizen-launch-emulator (to launch one).
# This script does NOT create or launch emulators — that is handled by the
# dedicated skills to avoid ambiguity.
#
# With --action stop, shuts down all running emulator VMs via em-cli kill.
#
# Usage:
#   ./tizen-device-manager.sh [-t <timeout_seconds>] [-n <vm_name>] [-a <action>] [-p <profile>]
#
# Options:
#   -t  Seconds to wait for emulator connection (default: 300)
#   -n  Emulator VM name to look for (default: tizen-vm-default)
#   -a  Action: start (default) or stop
#   -p  Profile: tizen (default) or tv (Samsung TV emulator)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

WAIT_TIMEOUT=300
VM_NAME="tizen-vm-default"
ACTION="start"
PROFILE="tizen"

# ---------------------------------------------------------------------------
# Parse options
# ---------------------------------------------------------------------------
while getopts "t:n:a:p:h" opt; do
  case "$opt" in
    t) WAIT_TIMEOUT="$OPTARG" ;;
    n) VM_NAME="$OPTARG" ;;
    a) ACTION="$OPTARG" ;;
    p) PROFILE="$OPTARG" ;;
    h)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) log_error "Unknown option: $opt"; exit 1 ;;
  esac
done



# ---------------------------------------------------------------------------
# OS detection
# ---------------------------------------------------------------------------
OS=$(detect_os)
log_info "Detected OS: $OS"

# ---------------------------------------------------------------------------
# Find sdb
# ---------------------------------------------------------------------------
SDB=$(find_tizen_tool sdb) || { log_error "sdb not found. Install the Tizen SDK first (tizen-sdk-install agent)."; exit 1; }
log_info "Found sdb: $SDB"

# ---------------------------------------------------------------------------
# Read a VM's platform from its vm_config.xml ('' if it cannot be determined).
# Needed because `em-cli list-vm` prints names only, and a tv-samsung-* VM
# rejects packages signed with the standard Tizen profile (certificate error).
# Defined early here so the device check below can use it.
# ---------------------------------------------------------------------------
get_vm_platform() {
  local name="$1" cfg
  for cfg in "$HOME/tizen-sdk-data/emulator/vms/$name/vm_config.xml" \
             "/opt/tizen-sdk-data/emulator/vms/$name/vm_config.xml"; do
    if [ -f "$cfg" ]; then
      sed -n 's/.*<platform>\([^<]*\)<\/platform>.*/\1/p' "$cfg" | head -1
      return 0
    fi
  done
  echo ""
}

# ---------------------------------------------------------------------------
# Stop action: shut down all running emulator VMs
# NOTE: The stop action must be checked BEFORE the device detection block below.
# If a device (emulator) is connected, the device detection block exits with
# DEVICE_SERIAL=... and the stop logic is never reached.
# ---------------------------------------------------------------------------
if [ "$ACTION" = "stop" ]; then
  log_info "Stop action: shutting down running emulator VMs..."

  STOPPED_COUNT=0

  # Method 1: Try to stop emulators using stored PID files
  log_info "Method 1: Checking for stored emulator PID files..."
  PID_DIR="${TMPDIR:-/tmp}"
  for pid_file in "$PID_DIR"/tizen-emulator-*.pid; do
    [ -f "$pid_file" ] || continue
    
    pid=$(cat "$pid_file" 2>/dev/null) || continue
    vm_name=$(basename "$pid_file" | sed 's/^tizen-emulator-//' | sed 's/\.pid$//')
    
    log_info "Found PID file for VM '$vm_name': PID=$pid"
    
    # Validate the process is actually running and is an emulator
    if ! kill -0 "$pid" 2>/dev/null; then
      log_warn "Process $pid not found - emulator may have already exited"
      # Clean up stale PID file
      rm -f "$pid_file"
      continue
    fi
    
    # Verify it's an emulator process (qemu or emulator in name)
    proc_name=$(ps -p "$pid" -o comm= 2>/dev/null || true)
    if [[ "$proc_name" == *qemu* ]] || [[ "$proc_name" == *emulator* ]]; then
      log_info "Stopping emulator process: $proc_name (PID: $pid)..."
      kill -9 "$pid" 2>/dev/null || true
      sleep 2
      
      # Verify the process is stopped
      if ! kill -0 "$pid" 2>/dev/null; then
        log_ok "VM '$vm_name' stopped via PID kill."
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
        # Clean up PID file
        rm -f "$pid_file"
      else
        log_warn "Process $pid still running after kill -9"
      fi
    else
      log_warn "PID $pid is not an emulator process (found: $proc_name). Skipping."
    fi
  done

  # Method 2: Find and kill any running qemu/emulator processes not captured by PID files
  log_info "Method 2: Scanning for running emulator processes..."
  for pid in $(pgrep -f 'qemu.*tizen|emulator.*tizen|qemu-system-x86_64.*-tizen' 2>/dev/null || true); do
    # Check if we already tried to stop this process via PID file
    already_stopped=false
    for pid_file in "$PID_DIR"/tizen-emulator-*.pid; do
      [ -f "$pid_file" ] || continue
      stored_pid=$(cat "$pid_file" 2>/dev/null || true)
      if [ "$stored_pid" = "$pid" ]; then
        already_stopped=true
        break
      fi
    done
    
    if [ "$already_stopped" = false ]; then
      proc_name=$(ps -p "$pid" -o comm= 2>/dev/null || true)
      log_info "Found emulator process: $proc_name (PID: $pid)"
      log_info "Stopping emulator process..."
      kill -9 "$pid" 2>/dev/null || true
      sleep 2
      
      # Verify the process is stopped
      if ! kill -0 "$pid" 2>/dev/null; then
        log_ok "Emulator process stopped (PID: $pid)"
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
      else
        log_warn "Process $pid still running after kill -9"
      fi
    fi
  done

  # Find em-cli for fallback methods (find_emcli from lib/common.sh)
  EMCLI=""
  if ! EMCLI=$(find_emcli); then
    log_info "em-cli not found - skipping em-cli based stop methods"
  else
    log_info "Found em-cli: $EMCLI"
    export TERM="${TERM:-dumb}"

    # Method 3: Fallback - try em-cli commands (for SDKs that support them)
    log_info "Method 3: Trying em-cli stop commands as fallback..."
    VM_LIST=$("$EMCLI" list-vm 2>/dev/null | grep -v -i 'VM list is empty' | grep -v '^$' || true)
    
    if [ -n "$VM_LIST" ]; then
      # Check which VMs are still running via sdb
      RUNNING_VMS=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | awk '{print $3}' | sort -u || true)
      
      if [ -n "$RUNNING_VMS" ]; then
        log_info "VMs still running according to sdb: $(echo $RUNNING_VMS | tr '\n' ' ')"
        
        # Detect which stop command em-cli supports
        STOP_CMD=""
        for cmd in kill shutdown stop close; do
          if "$EMCLI" "$cmd" --help >/dev/null 2>&1; then
            STOP_CMD="$cmd"
            log_info "em-cli supports '$cmd' for stopping VMs."
            break
          fi
        done
        
        if [ -z "$STOP_CMD" ]; then
          log_warn "Could not detect em-cli stop command via --help. Will try each command."
        fi
        
        while IFS= read -r vm; do
          [ -z "$vm" ] && continue
          
          VM_STOPPED=false
          
          if [ -n "$STOP_CMD" ]; then
            log_info "Stopping VM '$vm' using em-cli $STOP_CMD..."
            if "$EMCLI" "$STOP_CMD" -n "$vm" </dev/null 2>/dev/null; then
              VM_STOPPED=true
            fi
          fi
          
          if [ "$VM_STOPPED" = false ]; then
            # Try each candidate command
            for cmd in kill shutdown stop close; do
              log_info "Trying em-cli $cmd for VM '$vm'..."
              if "$EMCLI" "$cmd" -n "$vm" </dev/null 2>/dev/null; then
                VM_STOPPED=true
                break
              fi
            done
          fi
          
          if [ "$VM_STOPPED" = true ]; then
            sleep 2
            REMAINING=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' || true)
            if ! echo "$REMAINING" | grep -q "$vm" 2>/dev/null; then
              log_ok "VM '$vm' stopped via em-cli."
              STOPPED_COUNT=$((STOPPED_COUNT + 1))
            else
              log_warn "em-cli reported success but VM '$vm' still in sdb devices."
            fi
          fi
        done <<< "$RUNNING_VMS"
      fi
    fi

    # Method 4: Final fallback - try sdb shell poweroff
    log_info "Method 4: Trying sdb shell poweroff as final fallback..."
    DEVICES=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' || true)
    
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      serial=$(echo "$line" | awk '{print $1}')
      vm=$(echo "$line" | awk '{print $3}')
      [ -z "$serial" ] && continue
      
      log_info "Trying sdb shell poweroff for device $serial (VM: $vm)..."
      if "$SDB" -s "$serial" shell poweroff </dev/null 2>/dev/null; then
        sleep 2
        REMAINING=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | awk '{print $1}' || true)
        if ! echo "$REMAINING" | grep -q "$serial" 2>/dev/null; then
          log_ok "Device $serial (VM: $vm) stopped via sdb shell poweroff."
          STOPPED_COUNT=$((STOPPED_COUNT + 1))
        else
          log_warn "sdb shell poweroff failed for $serial."
        fi
      fi
    done <<< "$DEVICES"
  fi

  # Report results
  echo ""
  if [ "$STOPPED_COUNT" -gt 0 ]; then
    log_ok "Stopped $STOPPED_COUNT emulator VM(s)."
    echo "EMULATOR_STOPPED=$STOPPED_COUNT"
    exit 0
  else
    log_info "No running emulators found to stop."
    echo "EMULATOR_STOPPED=0"
    exit 0
  fi

fi

# ---------------------------------------------------------------------------
# Check for connected devices (only for start action)
# ---------------------------------------------------------------------------
log_info "Checking for connected devices..."

# NOTE: get_device_serial pipes through grep, which exits non-zero when no
# device matches. Under `set -euo pipefail` that would silently kill the whole
# script right here (no warning printed) — so swallow the failure with `|| true`
# and treat an empty result as "no device", which is the expected normal case.
SERIAL=$(get_device_serial "$SDB" || true)

if [ -n "$SERIAL" ]; then
  # Check if the connected device matches the requested profile.
  # For USB devices (non-emulator), accept regardless of profile.
  # For emulators, check the VM's platform via vm_config.xml and only accept
  # if it matches the requested profile (tv-samsung-* for tv, non-tv for tizen).
  if [[ "$SERIAL" == emulator-* ]]; then
    # Extract the VM name from sdb devices output (3rd column)
    VM_NAME_OF_DEVICE=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | grep "$SERIAL" | awk '{print $3}' || true)
    DEVICE_PLATFORM=""
    if [ -n "$VM_NAME_OF_DEVICE" ]; then
      DEVICE_PLATFORM=$(get_vm_platform "$VM_NAME_OF_DEVICE")
    fi

    # Check if the device platform matches the requested profile
    PROFILE_MATCHES=false
    if [ "$PROFILE" = "tv" ]; then
      case "$DEVICE_PLATFORM" in
        tv-*) PROFILE_MATCHES=true ;;
      esac
    else
      # For standard tizen profile, accept non-TV platforms or unknown platform
      case "$DEVICE_PLATFORM" in
        tv-*) ;;  # TV platform doesn't match standard tizen request
        *) PROFILE_MATCHES=true ;;  # non-TV or unknown platform matches
      esac
    fi

    if [ "$PROFILE_MATCHES" = true ]; then
      log_ok "Connected device found: $SERIAL (platform: ${DEVICE_PLATFORM:-unknown}, profile: $PROFILE)"
      echo ""
      echo "DEVICE_SERIAL=$SERIAL"
      exit 0
    else
      log_warn "Connected emulator '$SERIAL' has platform '${DEVICE_PLATFORM:-unknown}' but profile '$PROFILE' was requested."
      log_warn "Will proceed to create/launch a $PROFILE emulator instead."
    fi
  else
    # USB device — accept regardless of profile
    log_ok "Connected device found: $SERIAL"
    echo ""
    echo "DEVICE_SERIAL=$SERIAL"
    exit 0
  fi
fi

log_warn "No connected devices found."

# ---------------------------------------------------------------------------
# Device not found — direct user to dedicated emulator skills
# ---------------------------------------------------------------------------
# This script does NOT create or launch emulators. That is handled by the
# dedicated skills tizen-create-emulator and tizen-launch-emulator to avoid
# ambiguity between the three skills.
log_error "No connected Tizen device or emulator found."
log_error ""
log_error "To get a device, use the dedicated emulator skills:"
log_error "  1. tizen-create-emulator — to create an emulator VM (if one doesn't exist)"
if [ "$PROFILE" = "tv" ]; then
  log_error "     (use --profile tv for a Samsung TV emulator)"
fi
log_error "  2. tizen-launch-emulator — to launch an existing emulator VM"
log_error ""
log_error "After the emulator is running, re-run tizen-device-manager to detect it."
exit 1
