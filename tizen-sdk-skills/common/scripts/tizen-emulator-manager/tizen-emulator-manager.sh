#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-emulator-manager.sh
#
# Full em-cli surface for Tizen emulator VMs: create, delete, launch, inspect,
# modify, reset, and image capture.
# em-cli is located at {TIZEN_SDK_PATH}/tools/emulator/bin/em-cli
#
# Usage:
#   ./tizen-emulator-manager.sh -a <action> [options]
#
# Options:
#   -a  Action: create (default), delete, launch, list-vm, list-platform,
#       list-template, detail, modify, reset, create-image, fix-homescreen
#   -n  Emulator VM name
#   -P  Platform image name (auto-detect if omitted for create)
#   -T  Template name — this is what selects the screen resolution
#   -p  Profile: tizen (default) or tv (Samsung TV)
#   -l  Launch the VM after creating (create action only)
#   -s  Skin style number: 1 (general-purpose) or 2 (profile-specific)
#   -r  RAM size in MiB: 512, 768, or 1024
#   -f  Shared directory between the host and the VM
#   -w  CPU (hardware) virtualization: yes or no
#   -g  Hardware GL acceleration: yes or no
#   -c  Custom base disk image path (create only)
#   -R  Directory holding raw disk images (create only)
#   -o  Output directory for create-image
#   -z  Compress the created image (create-image only)
#   -d  Detail mode for the list-* actions
#   -C  Print only the VM count (list-vm only)
#   -t  Seconds to wait for the emulator to connect on launch (default 300)
#   -E  Directory of the emulator program (launch only)
#
# Environment tuning:
#   TIZEN_EMULATOR_DELETE_POLL_ATTEMPTS  Deletion-verify polls (default 20)
#   TIZEN_EMULATOR_DELETE_POLL_INTERVAL  Seconds between polls (default 0.5)
#     Together these cap the post-delete wait — 20 x 0.5s = 10s by default.
#     Raise the attempt count on a slow disk where cleanup takes longer.
#   TIZEN_KVM_DEVICE  KVM device path checked by launch diagnostics
#     (default /dev/kvm; tests point it at a plain file so they never depend
#     on the real host's virtualization state).
#   TIZEN_X11_DIR  X socket directory checked by the display probe of the
#     launch diagnostics (default /tmp/.X11-unix; tests point it elsewhere).
#   TIZEN_SDB_RESTART_RETRY  Seconds to re-poll for the emulator after bouncing
#     a wedged sdb server on a connect timeout (default 30; 0 skips the
#     restart rescue entirely — tests set 0 so timeout paths stay fast).
#   TIZEN_HOMESCREEN_CHECK  Post-launch home screen check: auto (default; WSL +
#     tizen emulator only), force (run anywhere — unverified), off (never).
#   TIZEN_HOMESCREEN_LAUNCH  1 (default) starts the home screen directly,
#     bypassing launchpad; 0 only stops the retry loop and leaves the display
#     empty. The direct launch runs as root and dies with a guest reboot.
#   TIZEN_HOMESCREEN_MASK_STARTER  1 (default) masks starter's user units so its
#     retry loop and "Unable to launch" popup stop; 0 leaves starter alone.
#   TIZEN_HOMESCREEN_CHECK_TIMEOUT  Seconds to poll for the crash signature
#     after the emulator connects (default 30 — the home screen boots after sdb).
#   TIZEN_HOMESCREEN_VERIFY_DELAY  Seconds to poll for the home screen after the
#     direct launch before calling it failed (default 20; tests set 0).
#   TIZEN_BUXTON_* (obsolete)  Replaced by TIZEN_HOMESCREEN_*. Setting any of them
#     warns; the two opt-out intents are still honoured (CHECK=off -> check off,
#     AUTOFIX=0 -> report only) so an existing opt-out is never silently upgraded
#     into the more invasive home screen fix.
#   TIZEN_EMCLI_GATE  on (default) fails a create fast when the create's first
#     em-cli call (the list-vm "already exists" check) shows a
#     NoSuchFieldError/NoSuchMethodError version mismatch (emits EMCLI_MISMATCH=1
#     and exits before any VM is created); off skips the gate and lets the
#     create proceed warn-only. There is no separate pre-action probe: it cost
#     every action an extra JVM start (issue #48).
#
# Machine-readable output lines (stdout; all logging goes to stderr):
#   VM_LIST=<csv>              VM_COUNT=<n>
#   PLATFORM_LIST=<csv>        TEMPLATE_LIST=<csv>
#   VM_CREATED=<name>          VM_DELETED=<name>
#   VM_MODIFIED=<name>         VM_RESET=<name>
#   VM_LAUNCHED=<serial>       DEVICE_SERIAL=<serial>
#   IMAGE_CREATED=<path>       TEMPLATE_FALLBACK=<template>
#   TEMPLATE_DETAIL=<name>|<profile>|<resolution>|<ram>
#   VM_DETAIL=<name>|<platform>|<template>|<resolution>|<ram>|<cpu_arch>|<cpu_count>|<type>|<skin_path>
#   PLATFORM_DETAIL=<name>|<profile>|<version>|<cpu_arch>|<skin_shape>|<image_path>
#   MANAGER_DETAIL=<key>|<value>
#   LAUNCH_DIAG=<key>|<value>  Launch-failure diagnosis (see launch_vm and
#                              diagnose_launch_failure; parsed by
#                              lib/core/emulator.js parseLaunchDiagnostics)
#   HOMESCREEN_STATUS=<ok|detected|fixed|popup_fixed|fix_failed>
#                              Post-launch home screen check result on WSL (see
#                              check_and_fix_homescreen; parsed by
#                              lib/core/emulator.js parseHomescreenStatus).
#                              Absent when the check does not apply.
#   HW_VIRT_AUTOFIX=<name>     Pre-launch auto-heal applied: the VM profile had
#                              hwVirtualization=false while host KVM was usable,
#                              so `em-cli modify -w yes` was run before launching
#                              (see maybe_enable_hw_virtualization; parsed by
#                              lib/core/emulator.js parseHwVirtAutofix).
#   EMCLI_MISMATCH=1           The create's first em-cli call crashed with a
#                              NoSuchFieldError/NoSuchMethodError — an
#                              emulator-manager core vs platform emulator plugin
#                              VERSION MISMATCH — so a create was refused before
#                              touching any VM (gate: TIZEN_EMCLI_GATE; parsed by
#                              lib/core/emulator.js createEmulator, which returns
#                              a package_version_mismatch envelope pointing at
#                              tizen-update-package).
#   SDB_SERVER_RESTARTED=1     The sdb wait timed out, the sdb server was bounced
#                              (kill-server/start-server), and the emulator
#                              appeared only then — the launch succeeded, but
#                              other sdb clients were reset by the restart (see
#                              retry_serial_after_sdb_restart; surfaced as a
#                              warning by lib/core/emulator.js launchEmulator).
#   LAUNCH_WARN=<key>          Non-fatal finding on an otherwise SUCCESSFUL
#                              launch (currently virgl_scanout_failing — see
#                              warn_if_virgl_scanout_failing). Deliberately a
#                              separate prefix from LAUNCH_DIAG: those are
#                              failure-path keys whose set is enforced by the
#                              key-sync test in emulator-launch-diagnostics.
#
# Resolution is a property of the device template — em-cli create has no
# width/height flag — so selecting a size means selecting a template. The caller
# (lib/core/emulator.js) resolves a requested size to a template name and passes
# it in with -T.
#
# em-cli quirk that shapes this script: `detail -n <missing-vm>` prints
# "Error: ... does not match any VM" on stdout and STILL EXITS 0. Exit status is
# therefore not trustworthy for the read-only actions — every one of them runs
# its output through emcli_failed() to look for a leading "Error:" line.
#
# TV Profile Fallback:
#   When creating a TV emulator with an explicit template fails (a recurring
#   Java/JNA error), this script retries without the template so the user still
#   gets a VM. The retry is guarded by a sync check: em-cli delete returns when
#   the database is updated, but file-level cleanup (QEMU termination, disk
#   removal) continues asynchronously. Without the sync check, the immediate
#   retry races against cleanup and fails with "VM already exists" (30-50%
#   failure rate on HDD, 5-10% on SSD). Polling list-vm for up to 10 seconds
#   ensures the VM is truly gone before creating again — see wait_for_vm_gone().

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

ACTION="create"
VM_NAME=""
PLATFORM=""
TEMPLATE=""
PROFILE="tizen"
LAUNCH=false
SKIN=""
RAM_SIZE=""
FILE_SHARING_PATH=""
HW_VIRTUALIZATION=""
HW_GL_ACCELERATION=""
CUSTOM_PATH=""
RAW_IMAGE_PATH=""
OUTPUT_DIR=""
COMPRESS=false
DETAIL=false
COUNT=false
WAIT_TIMEOUT=300
EMULATOR_PATH=""

# ---------------------------------------------------------------------------
# Parse options
# ---------------------------------------------------------------------------
while getopts "a:n:P:T:p:s:r:f:w:g:c:R:o:t:E:lzdCh" opt; do
  case "$opt" in
    a) ACTION="$OPTARG" ;;
    n) VM_NAME="$OPTARG" ;;
    P) PLATFORM="$OPTARG" ;;
    T) TEMPLATE="$OPTARG" ;;
    p) PROFILE="$OPTARG" ;;
    s) SKIN="$OPTARG" ;;
    r) RAM_SIZE="$OPTARG" ;;
    f) FILE_SHARING_PATH="$OPTARG" ;;
    w) HW_VIRTUALIZATION="$OPTARG" ;;
    g) HW_GL_ACCELERATION="$OPTARG" ;;
    c) CUSTOM_PATH="$OPTARG" ;;
    R) RAW_IMAGE_PATH="$OPTARG" ;;
    o) OUTPUT_DIR="$OPTARG" ;;
    t) WAIT_TIMEOUT="$OPTARG" ;;
    E) EMULATOR_PATH="$OPTARG" ;;
    l) LAUNCH=true ;;
    z) COMPRESS=true ;;
    d) DETAIL=true ;;
    C) COUNT=true ;;
    h)
      # Print the whole header comment — every line after the shebang up to the
      # first line of code. A fixed line range (the old `sed -n '2,45p'`) silently
      # truncates mid-sentence whenever the header grows.
      awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
      exit 0
      ;;
    *) log_error "Unknown option: $opt"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate enum-ish options up front so a typo never reaches em-cli
# ---------------------------------------------------------------------------
if [ -n "$SKIN" ] && [ "$SKIN" != "1" ] && [ "$SKIN" != "2" ]; then
  log_error "Invalid skin: $SKIN. Use 1 (general-purpose) or 2 (profile-specific)."
  exit 1
fi
if [ -n "$RAM_SIZE" ] && [ "$RAM_SIZE" != "512" ] && [ "$RAM_SIZE" != "768" ] && [ "$RAM_SIZE" != "1024" ]; then
  log_error "Invalid RAM size: $RAM_SIZE. em-cli accepts 512, 768, or 1024 (MiB)."
  exit 1
fi
if [ -n "$HW_VIRTUALIZATION" ] && [ "$HW_VIRTUALIZATION" != "yes" ] && [ "$HW_VIRTUALIZATION" != "no" ]; then
  log_error "Invalid hw-virtualization: $HW_VIRTUALIZATION. Use yes or no."
  exit 1
fi
if [ -n "$HW_GL_ACCELERATION" ] && [ "$HW_GL_ACCELERATION" != "yes" ] && [ "$HW_GL_ACCELERATION" != "no" ]; then
  log_error "Invalid hw-gl-acceleration: $HW_GL_ACCELERATION. Use yes or no."
  exit 1
fi
if [ "$PROFILE" != "tizen" ] && [ "$PROFILE" != "tv" ]; then
  log_error "Invalid profile: $PROFILE. Use tizen or tv."
  exit 1
fi
if [ -n "$VM_NAME" ] && ! [[ "$VM_NAME" =~ ^[A-Za-z0-9._-]+$ ]]; then
  log_error "Invalid VM name: $VM_NAME. Use only letters, digits, dot, underscore, hyphen."
  exit 1
fi

# ---------------------------------------------------------------------------
# OS detection
# ---------------------------------------------------------------------------
OS=$(detect_os)
log_info "Detected OS: $OS"

# WSL (Windows Subsystem for Linux) detection — used by diagnose_launch_failure()
# and maybe_check_homescreen(). detect_wsl returns 1 on non-WSL hosts, so the bare
# call would kill the whole script under `set -e` everywhere except WSL.
detect_wsl || true

# ---------------------------------------------------------------------------
# Find em-cli (find_emcli from lib/common.sh: SDK path via get_sdk_path, then
# the literal default locations)
# ---------------------------------------------------------------------------
EMCLI=""
if ! EMCLI=$(find_emcli); then
  log_error "em-cli not found. Ensure the Tizen SDK is installed with the emulator package."
  log_error "em-cli should be at {TIZEN_SDK_PATH}/tools/emulator/bin/em-cli"
  log_error "Re-run tizen-sdk-install, or launch an emulator manually via Tizen Studio Emulator Manager."
  exit 1
fi
log_info "Found em-cli: $EMCLI"

# em-cli shells out to `tput`, which warns when $TERM is unset
export TERM="${TERM:-dumb}"

# ---------------------------------------------------------------------------
# em-cli failure diagnosis (Java/JNA vs version mismatch)
# ---------------------------------------------------------------------------
# $1 = what was run (for the message), $2 = the captured output of the em-cli
# call that ACTUALLY failed. There is deliberately no separate pre-action probe
# (issue #48): every action already runs em-cli at least once, and the old
# unconditional `list-vm` probe cost each runner call a whole extra JVM start —
# on a slow host that alone pushed a plain list-vm past Codex CLI's 30 s
# per-call window, so the caller saw only the progress header and no envelope.
#
# When em-cli is broken, the Java stack trace in that output is the only real
# diagnostic, and it must land in the captured output — a remote MCP client only
# ever sees what reaches the error payload (issue #40).
report_emcli_failure() {
  local what="$1" output="$2" rc="${3:-}"
  # The warning must not itself say "JNA": lib/core/emulator.js matches
  # JAVA_JNA_PATTERN against the captured output, and the old wording turned
  # EVERY em-cli failure into "crashed with a Java/JNA dependency error" (issue
  # #82 — a sandboxed em-cli that printed nothing was reported as a JNA crash).
  # The raw em-cli output goes between EMCLI_OUTPUT_BEGIN/END markers so the JS
  # side classifies only what em-cli said, never these diagnostics.
  log_warn "em-cli failed on '$what'${rc:+ (exit $rc)}."
  [ -n "$rc" ] && echo "EMCLI_EXIT=$rc"
  if [ -z "$(printf '%s' "$output" | tr -d '[:space:]')" ]; then
    log_warn "em-cli produced no output at all — it was blocked before it could run (a sandbox or"
    log_warn "permission policy; under Codex CLI re-run with escalated permissions), or the JVM could not start."
  fi
  echo "EMCLI_OUTPUT_BEGIN" >&2
  printf '%s\n' "$output" | head -n 10 >&2
  echo "EMCLI_OUTPUT_END" >&2
  # Branch on the output instead of printing both guidance texts: the warnings
  # land in the captured output, and an unconditional mention of
  # NoSuchFieldError would trip JAVA_VERSION_MISMATCH_PATTERN in
  # lib/core/emulator.js on runs whose real failure is something else.
  # KEEP IN SYNC with JAVA_VERSION_MISMATCH_PATTERN in lib/core/emulator.js —
  # the test suite compares the two alternations token-for-token.
  if printf '%s' "$output" | grep -qE 'NoSuchFieldError|NoSuchMethodError'; then
    log_warn "'NoSuchFieldError'/'NoSuchMethodError' means the emulator-manager core and the"
    log_warn "platform's emulator plugin are at mismatched versions — update the SDK"
    log_warn "packages (tizen-update-package)."
    # A create against a mismatched em-cli crashes mid-way (real case:
    # java.lang.NoSuchFieldError: isVirgl on tizen-11.0) and then needs a noisy
    # partial-VM cleanup — fail fast before any VM is touched. Create only:
    # the other actions keep the warn-only behaviour and fail naturally with
    # the real trace in the captured output. The create action reaches here via
    # run_list_vm in the main shell (not a $(...) subshell), so this exit ends
    # the script and the machine line reaches stdout.
    if [ "$ACTION" = "create" ] && [ "${TIZEN_EMCLI_GATE:-on}" != "off" ]; then
      echo "EMCLI_MISMATCH=1"
      log_error "Refusing to create a VM: em-cli is already failing with a version mismatch,"
      log_error "so the create would crash mid-way and leave a partial VM behind."
      log_error "Fix on the SDK host: update the SDK packages (tizen-update-package), then retry"
      log_error "this create. Set TIZEN_EMCLI_GATE=off to bypass this gate."
      exit 1
    fi
  else
    # Wording deliberately avoids the JAVA_JNA_PATTERN tokens (jna,
    # NoClassDefFoundError, …): only em-cli's own lines may trigger that hint.
    log_warn "If the em-cli output above is a Java stack trace about a missing native bridge or class,"
    log_warn "the SDK's emulator Java runtime is broken — reinstall the emulator package"
    log_warn "(download-emulator-package) and verify the SDK's bundled JRE runs."
  fi
}

# Read-only em-cli calls (list-vm / list-platform / list-template / detail)
# under a wall-clock cap: a JVM that cannot write its state (Codex's sandbox,
# a read-only SDK) can hang forever, and execPluginScript's own ceiling is 30
# minutes. `launch`/`create`/`delete` are NOT wrapped — they legitimately run long.
# TIZEN_EMCLI_TIMEOUT (seconds, default 120) tunes it; a timeout exits 124.
emcli_ro() {
  local limit="${TIZEN_EMCLI_TIMEOUT:-120}"
  if command -v timeout >/dev/null 2>&1 && [ "$limit" != "0" ]; then
    timeout "$limit" "$EMCLI" "$@" </dev/null
    local rc=$?
    if [ "$rc" -eq 124 ]; then
      echo "em-cli '$1' did not finish within ${limit}s (hung JVM — under Codex CLI re-run with escalated permissions; TIZEN_EMCLI_TIMEOUT tunes the cap)" >&2
    fi
    return "$rc"
  fi
  "$EMCLI" "$@" </dev/null
}

# Run `em-cli list-vm` in the CURRENT shell and diagnose a failure. Sets
# LIST_VM_RAW (combined output) and LIST_VM_RC. This one JVM run doubles as the
# em-cli health check for every action that touches a VM.
LIST_VM_RC=0
LIST_VM_RAW=""
run_list_vm() {
  LIST_VM_RC=0
  LIST_VM_RAW=$(emcli_ro list-vm 2>&1) || LIST_VM_RC=$?
  if [ "$LIST_VM_RC" -ne 0 ]; then
    report_emcli_failure "list-vm" "$LIST_VM_RAW" "$LIST_VM_RC"
  fi
}

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

# em-cli reports "Error: <thing> does not match any VM" on stdout and exits 0,
# so the only reliable failure signal for read-only actions is the text itself.
emcli_failed() {
  echo "$1" | grep -q '^Error:'
}

# Turn raw `em-cli list-vm` output on stdin into one VM name per line.
_vm_names_from_list() {
  # em-cli reports "Error: …" on stdout with exit 0, and the diagnostics above
  # start with "[…]" — neither is a VM name (the .ps1 twin filters the same).
  grep -v -i 'VM list is empty' | grep -v '^$' | grep -v '^Error:' | grep -v '^\[' | awk '{print $1}'
}

# A broken em-cli reads as "no VMs listed" here (warn-only, diagnosed on stderr
# by run_list_vm), so the calling action still fails naturally with the real
# trace in the captured output.
get_vm_list() {
  run_list_vm
  [ "$LIST_VM_RC" -eq 0 ] || return 0
  printf '%s\n' "$LIST_VM_RAW" | _vm_names_from_list || true
}

# Wait for a just-deleted VM to actually disappear from em-cli's list.
#
# em-cli delete returns as soon as the database row is gone, but file-level
# cleanup (QEMU termination, disk image removal) continues asynchronously. An
# immediate re-create races that cleanup and fails with "VM already exists", so
# every caller that deletes-then-retries has to wait for the VM to truly vanish.
#
# $1 = VM name. Exit status:
#   0  the VM is gone (list-vm was readable and did not contain it)
#   1  still listed after every attempt
#   2  list-vm could not be read, so the deletion could not be confirmed
#
# Two details are load-bearing:
#   - The counter is an INTEGER. `[ 0.5 -lt 10 ]` is a fatal "integer expression
#     expected" in bash, so a fractional accumulator ends the loop after one pass
#     and turns the 10s wait into a single 0.5s poll.
#   - list-vm's status is captured with `|| rc=$?`, never a bare `rc=$?` after a
#     plain assignment. Under `set -e` a failing command substitution aborts the
#     whole script, which would skip the caller's diagnostics entirely — exactly
#     the Java/JNA failure this is supposed to report on.
DELETE_POLL_ATTEMPTS="${TIZEN_EMULATOR_DELETE_POLL_ATTEMPTS:-20}"
DELETE_POLL_INTERVAL="${TIZEN_EMULATOR_DELETE_POLL_INTERVAL:-0.5}"

wait_for_vm_gone() {
  local target="$1"
  local attempt=0 raw rc

  while :; do
    rc=0
    raw=$("$EMCLI" list-vm 2>&1) || rc=$?

    if [ "$rc" -eq 0 ]; then
      # Exact match on the name column: a substring match would see 'tv' inside
      # 'tv-emulator', and an unanchored pattern would treat the dot that VM
      # names may contain as a wildcard.
      if ! printf '%s\n' "$raw" | _vm_names_from_list | grep -Fqx "$target"; then
        return 0
      fi
    fi

    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$DELETE_POLL_ATTEMPTS" ]; then
      if [ "$rc" -eq 0 ]; then
        return 1
      fi
      return 2
    fi
    sleep "$DELETE_POLL_INTERVAL"
  done
}

# Post-mortem for a launch that failed or never connected to sdb.
#
# $1 = VM name, $2 = phase: launch_failed | connect_timeout
#
# Emits LAUNCH_DIAG=<key>|<value> lines on stdout (parsed by lib/core/emulator.js
# parseLaunchDiagnostics — pipes inside values are replaced with spaces) and human
# guidance via log_error on stderr. Never exits non-zero itself: every probe is
# guarded, because under `set -e` one failing grep would abort the script and
# swallow the diagnosis it exists to produce.
#
# The layers mirror the WSL2 boot-failure runbook: em-cli reports every cause as
# the same "Failed to start this VM." line, so the real signal has to be dug out
# of the VM profile, the host KVM state, the emulator binary's linkage, and the
# emulator log. Anterior layers mask posterior ones — report all of them at once
# so the caller does not pay one relaunch per layer.
KVM_DEVICE="${TIZEN_KVM_DEVICE:-/dev/kvm}"
X11_DIR="${TIZEN_X11_DIR:-/tmp/.X11-unix}"

# Map an unresolved shared-library soname (as ldd prints it) to the Ubuntu
# host package that provides it. Echoes nothing for unknown libraries — the
# caller lists those separately instead of guessing.
# $1 = library soname, $2 = 1 when Ubuntu >= 24.04's t64-suffixed names apply
lib_to_apt_pkg() {
  local lib="$1" t64="$2"
  case "$lib" in
    libasound*)             [ "$t64" = 1 ] && echo libasound2t64 || echo libasound2 ;;
    # SDL 1.2 was never part of the t64 rename: libsdl1.2debian exists on both
    # 22.04 (the real library) and 24.04 (wrapping SDL 2.0), so one name works
    # everywhere. Verified against noble: "libsdl1.2compat" does NOT exist.
    libSDL-1.2*)            echo libsdl1.2debian ;;
    libv4l*)                [ "$t64" = 1 ] && echo libv4l-0t64 || echo libv4l-0 ;;
    libxcb-icccm.so*)       echo libxcb-icccm4 ;;
    libxcb-image.so*)       echo libxcb-image0 ;;
    libxcb-keysyms.so*)     echo libxcb-keysyms1 ;;
    libxcb-randr.so*)       echo libxcb-randr0 ;;
    libxcb-render-util.so*) echo libxcb-render-util0 ;;
    libxcb-render.so*)      echo libxcb-render0 ;;
    libxcb-shape.so*)       echo libxcb-shape0 ;;
    libxcb-shm.so*)         echo libxcb-shm0 ;;
    libxcb-sync.so*)        echo libxcb-sync1 ;;
    libxcb-util.so*)        echo libxcb-util1 ;;
    libxcb-xfixes.so*)      echo libxcb-xfixes0 ;;
    libxcb-xinerama.so*)    echo libxcb-xinerama0 ;;
    libxcb-xkb.so*)         echo libxcb-xkb1 ;;
    libxcb-glx.so*)         echo libxcb-glx0 ;;
    libxkbcommon-x11.so*)   echo libxkbcommon-x11-0 ;;
    libxkbcommon.so*)       echo libxkbcommon0 ;;
    libX11-xcb.so*)         echo libx11-xcb1 ;;
    libSM.so*)              echo libsm6 ;;
    libICE.so*)             echo libice6 ;;
    libfontconfig.so*)      echo libfontconfig1 ;;
    libfreetype.so*)        echo libfreetype6 ;;
  esac
}

diagnose_launch_failure() {
  local vm="$1" phase="$2"
  # Findings the probes below fill in, consumed by the consolidated host-fix
  # guide at the end of this function.
  local kvm_present=0 kvm_ok=0 missing="" qt_missing=""
  local qt_xcb_failed=0 qt_display_failed=0 display_missing=0
  echo "LAUNCH_DIAG=phase|$phase"
  # The resolved VM name: on a no-name launch the script picks the first VM
  # itself, so the caller's own vmName may be empty — this line lets the JS
  # side fill the suggested_fix command with the real name instead of <vm>.
  echo "LAUNCH_DIAG=vm|$vm"

  # -- 1. VM profile: hwVirtualization from vm_config.xml ---------------------
  # (path candidates mirror tizen-device-manager.sh get_vm_platform)
  local cfg hwvirt=""
  for cfg in "$HOME/tizen-sdk-data/emulator/vms/$vm/vm_config.xml" \
             "/opt/tizen-sdk-data/emulator/vms/$vm/vm_config.xml"; do
    [ -f "$cfg" ] || continue
    hwvirt=$(sed -n 's/.*<hwVirtualization>\([^<]*\)<\/hwVirtualization>.*/\1/p' "$cfg" 2>/dev/null | head -1 || true)
    break
  done
  [ -n "$hwvirt" ] && echo "LAUNCH_DIAG=hw_virtualization|$hwvirt"

  if [ "$OS" = "linux" ]; then
    # -- 2. Host KVM state ----------------------------------------------------
    if [ -e "$KVM_DEVICE" ]; then
      kvm_present=1
      echo "LAUNCH_DIAG=kvm|present"
      if [ -w "$KVM_DEVICE" ]; then
        kvm_ok=1
        echo "LAUNCH_DIAG=kvm_writable|yes"
      else
        echo "LAUNCH_DIAG=kvm_writable|no"
        log_error "$KVM_DEVICE exists but is not writable — add your user to the kvm group: sudo usermod -aG kvm \$USER (then re-login)."
      fi
    else
      echo "LAUNCH_DIAG=kvm|missing"
      local vflags
      vflags=$(grep -c -E 'vmx|svm' /proc/cpuinfo 2>/dev/null || true)
      echo "LAUNCH_DIAG=cpu_virt_flags|${vflags:-0}"
      log_error "$KVM_DEVICE not found — kernel KVM is unavailable (WSL2: enable nestedVirtualization in .wslconfig)."
    fi

    # The runbook's #1 root cause: the VM profile disables virtualization even
    # though the host KVM is perfectly fine. The error message em-cli produces
    # ("Enable CPU-VT to run the emulator") misdirects people at the host.
    if [ "$hwvirt" = "false" ] && [ -e "$KVM_DEVICE" ]; then
      echo "LAUNCH_DIAG=suggest|enable_hw_virtualization"
      log_error "VM profile disables CPU virtualization (<hwVirtualization>false</hwVirtualization>) although $KVM_DEVICE is available."
      log_error "Fix: em-cli modify -n $vm -w yes (this script: -a modify -n $vm -w yes)"
    fi

    # -- 3. Missing system libraries of the emulator binary --------------------
    # LD_LIBRARY_PATH must point at the SDK's own emulator bin dir, or the
    # SDK-bundled libs (libx264.so.142, libicu*.so.48) false-positive as missing.
    local sdk_root="${EMCLI%/tools/emulator/bin/em-cli}"
    local emul_bin
    emul_bin=$(ls "$sdk_root"/platforms/tizen-*/common/emulator/bin/emulator-x86_64 2>/dev/null | head -1 || true)
    if [ -n "$emul_bin" ] && command -v ldd >/dev/null 2>&1; then
      missing=$(LD_LIBRARY_PATH="$(dirname "$emul_bin")" ldd "$emul_bin" 2>/dev/null \
        | grep 'not found' | awk '{print $1}' | sort -u | tr '\n' ',' | sed 's/,$//' || true)
      if [ -n "$missing" ]; then
        echo "LAUNCH_DIAG=missing_libs|$missing"
        log_error "Emulator binary has unresolved libraries: $missing"
        log_error "Install the host packages, e.g. Ubuntu: libasound2/libasound2t64 (libasound), libsdl1.2debian (libSDL-1.2), libv4l-0/libv4l-0t64 (libv4l2)."
      fi

      # The Qt xcb platform plugin is dlopen()ed at runtime, so its unresolved
      # dependencies never show up in the binary's own ldd — probe it directly.
      # This is what separates "a package really is missing" from "the packages
      # are installed and the failure is elsewhere (e.g. no X display)".
      local qxcb
      qxcb=$(find "$sdk_root"/platforms -name libqxcb.so 2>/dev/null | head -1 || true)
      if [ -n "$qxcb" ]; then
        qt_missing=$(LD_LIBRARY_PATH="$(dirname "$emul_bin")" ldd "$qxcb" 2>/dev/null \
          | grep 'not found' | awk '{print $1}' | sort -u | tr '\n' ',' | sed 's/,$//' || true)
        if [ -n "$qt_missing" ]; then
          echo "LAUNCH_DIAG=missing_qt_libs|$qt_missing"
          log_error "Qt xcb platform plugin ($qxcb) has unresolved libraries: $qt_missing"
        fi
      fi
    fi
  fi

  # -- 4. emulator.log tail + Qt xcb detection ---------------------------------
  local elog line
  for elog in "$HOME/tizen-sdk-data/emulator/vms/$vm/logs/emulator.log" \
              "/opt/tizen-sdk-data/emulator/vms/$vm/logs/emulator.log"; do
    [ -f "$elog" ] || continue
    echo "LAUNCH_DIAG=emulator_log|$elog"
    # Two distinct Qt failures print near-identical fatals: "could not connect
    # to display" is an X-server problem (nothing to install), while "could not
    # find or load the Qt platform plugin" is a plugin/dependency problem. Keep
    # them apart or the guide sends people installing packages they have.
    if tail -n 50 "$elog" 2>/dev/null | grep -qi 'could not connect to display'; then
      qt_display_failed=1
      echo "LAUNCH_DIAG=qt_display|failed"
      log_error "Qt could not connect to an X display — the GUI has nowhere to open (DISPLAY/WSLg problem, not a missing package)."
    elif tail -n 50 "$elog" 2>/dev/null | grep -q 'could not find or load the Qt platform plugin'; then
      qt_xcb_failed=1
      echo "LAUNCH_DIAG=qt_xcb|failed"
      log_error "Qt failed to LOAD the xcb platform plugin (the plugin file itself was found) — libqxcb.so has unmet dependencies."
      log_error "Install: libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libxcb-shape0 libxcb-xinerama0 libxkbcommon-x11-0."
    fi
    tail -n 15 "$elog" 2>/dev/null | while IFS= read -r line; do
      [ -n "$line" ] && echo "LAUNCH_DIAG=log|$(printf '%s' "$line" | tr '|' ' ')"
    done || true
    break
  done

  # -- 4b. X display availability ----------------------------------------------
  # The emulator opens a Qt GUI, so a usable X server is as load-bearing as any
  # library. DISPLAY is typically unset in SSH sessions into the SDK host, and
  # points at a dead socket when WSLg is off — both boot-blocking, and neither
  # fixable by installing packages.
  if [ "$OS" = "linux" ]; then
    if [ -z "${DISPLAY:-}" ]; then
      display_missing=1
      echo "LAUNCH_DIAG=display|missing"
      log_error "DISPLAY is not set — the emulator GUI has no X server to open on (common in SSH sessions; WSLg sets DISPLAY=:0)."
    else
      echo "LAUNCH_DIAG=display|$(printf '%s' "$DISPLAY" | tr '|' ' ')"
      case "$DISPLAY" in
        :*)
          local dnum="${DISPLAY#:}"
          dnum="${dnum%%.*}"
          if [ ! -S "$X11_DIR/X$dnum" ]; then
            display_missing=1
            echo "LAUNCH_DIAG=display_socket|missing"
            log_error "DISPLAY=$DISPLAY is set but $X11_DIR/X$dnum does not exist — no X server is listening (WSLg off, or X not running)."
          fi
          ;;
      esac
    fi
  fi

  # -- 5. WSL detection (Windows Subsystem for Linux) --------------------------
  # WSL2 is a common environment for developers. KVM nested virtualization must
  # be explicitly enabled in .wslconfig. This is a non-obvious setup requirement.
  detect_wsl && echo "LAUNCH_DIAG=wsl|yes" || echo "LAUNCH_DIAG=wsl|no"
  if [ "${DETECTED_WSL:-0}" -eq 1 ]; then
    log_error "Running in WSL. Ensure Windows .wslconfig has nestedVirtualization=true."
    if [ "$hwvirt" = "false" ]; then
      log_error "VM profile also has hwVirtualization disabled; run: em-cli modify -n $vm -w yes"
    fi
  fi

  # -- 6. Consolidated host-fix guide -------------------------------------------
  # The probes above report one [ERROR] per finding, which leaves the user to
  # assemble the actual runbook themselves. Close with ONE ordered, copy-
  # pasteable list of host commands, emitted as LAUNCH_DIAG=fix|<step> lines
  # (parsed into diag.fixes by lib/core/emulator.js and placed at the top of
  # the error envelope's details).
  local fixes=() f i
  if [ "$OS" = "linux" ]; then
    if [ "$kvm_present" = 1 ] && [ "$kvm_ok" = 0 ]; then
      fixes+=("sudo usermod -aG kvm \$USER")
    fi

    # One apt step for every unresolved library the probes found — the
    # emulator binary's and the Qt xcb plugin's. Ubuntu 24.04 renamed several
    # runtime packages with a t64 suffix — lib_to_apt_pkg picks by VERSION_ID.
    local pkgs="" unmapped="" lib pkg t64=0
    grep -qE '^VERSION_ID="?(2[4-9]|[3-9][0-9])' /etc/os-release 2>/dev/null && t64=1
    local all_missing="${missing:+$missing,}${qt_missing}"
    for lib in ${all_missing//,/ }; do
      pkg=$(lib_to_apt_pkg "$lib" "$t64")
      if [ -n "$pkg" ]; then
        case " $pkgs " in *" $pkg "*) ;; *) pkgs="$pkgs $pkg" ;; esac
      else
        case " $unmapped " in *" $lib "*) ;; *) unmapped="$unmapped $lib" ;; esac
      fi
    done

    # Qt reported a plugin-load failure: verify the canonical xcb runtime set
    # with dpkg and add ONLY what is actually absent. When everything is
    # installed, say so — re-suggesting installed packages hides the real
    # cause (usually the display). A dpkg-installed package can still land in
    # $pkgs via qt_missing (ldd found an unresolved soname the package does
    # not provide) — that is deliberate: the ldd evidence outranks dpkg.
    local xcb_installed=""
    if [ "$qt_xcb_failed" = 1 ]; then
      local xcb_pkg
      xcb_installed=1
      for xcb_pkg in libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 \
                     libxcb-render-util0 libxcb-shape0 libxcb-xinerama0 libxkbcommon-x11-0; do
        if command -v dpkg >/dev/null 2>&1 && dpkg -s "$xcb_pkg" >/dev/null 2>&1; then
          continue
        fi
        xcb_installed=0
        case " $pkgs " in *" $xcb_pkg "*) ;; *) pkgs="$pkgs $xcb_pkg" ;; esac
      done
      [ "$xcb_installed" = 1 ] && echo "LAUNCH_DIAG=xcb_packages|installed"
    fi

    [ -n "$pkgs" ] && fixes+=("sudo apt install$pkgs")
    [ -n "$unmapped" ] && fixes+=("install the packages providing:$unmapped (look them up with: apt-file search <name>)")

    # Advisory, not a command — it belongs AFTER the runnable steps, and it
    # forwards to the DISPLAY step added below. Only when nothing else explains
    # the load failure (no unresolved plugin lib found by ldd). No pipe
    # characters here: fix lines travel as LAUNCH_DIAG=fix|<text> and a pipe
    # in the text would be sanitized into a space.
    if [ "$xcb_installed" = "1" ] && [ -z "$qt_missing" ]; then
      fixes+=("xcb runtime packages are already installed — the plugin-load failure is likely the X display; see the DISPLAY finding, or check 'not found' lines from: LD_LIBRARY_PATH=<sdk>/platforms/tizen-*/common/emulator/bin ldd <sdk>/platforms/.../libqxcb.so")
    fi

    if [ "$kvm_present" = 0 ] && [ "${DETECTED_WSL:-0}" -eq 1 ]; then
      fixes+=("add 'nestedVirtualization=true' under [wsl2] in C:\\Users\\<you>\\.wslconfig (Windows side)")
    fi
    # Group membership and .wslconfig changes only take effect after a fresh
    # session, so the restart step belongs in the list itself.
    if { [ "$kvm_present" = 1 ] && [ "$kvm_ok" = 0 ]; } || { [ "$kvm_present" = 0 ] && [ "${DETECTED_WSL:-0}" -eq 1 ]; }; then
      if [ "${DETECTED_WSL:-0}" -eq 1 ]; then
        fixes+=("restart WSL: run 'wsl --shutdown' in Windows PowerShell, then reopen this terminal")
      else
        fixes+=("log out and back in (or run: newgrp kvm)")
      fi
    fi

    # No X server reachable — a boot blocker of its own, independent of KVM
    # and packages (qt_display_failed confirms it from the emulator's log).
    if [ "$display_missing" = 1 ] || [ "$qt_display_failed" = 1 ]; then
      if [ "${DETECTED_WSL:-0}" -eq 1 ]; then
        fixes+=("export DISPLAY=:0 (persist it in ~/.bashrc) — WSLg provides the X server; if $X11_DIR has no X0 socket, run 'wsl --update' in Windows, then 'wsl --shutdown' and reopen")
      else
        fixes+=("point DISPLAY at a running X server (e.g. export DISPLAY=:0), or start one")
      fi
    fi

    if [ ${#fixes[@]} -gt 0 ] && [ "$hwvirt" = "false" ]; then
      fixes+=("relaunch — hwVirtualization is re-enabled automatically once $KVM_DEVICE is usable (manual: em-cli modify -n $vm -w yes)")
    fi
  fi

  if [ ${#fixes[@]} -gt 0 ]; then
    log_error "---- Host fix required: run these in order, then relaunch ----"
    i=0
    for f in "${fixes[@]}"; do
      i=$((i + 1))
      echo "LAUNCH_DIAG=fix|$i. $(printf '%s' "$f" | tr '|' ' ')"
      log_error "  $i. $f"
    done
  fi

  return 0
}

# Pre-launch auto-heal for the runbook's #1 root cause: a VM created while KVM
# was inaccessible gets <hwVirtualization>false</hwVirtualization> baked into
# its profile, and em-cli then refuses to boot it forever — even after the host
# is fixed (kvm group joined, .wslconfig nestedVirtualization enabled). When the
# profile says false but the host KVM is usable NOW, flip it back on before
# launching instead of failing and telling the user to run `modify -w yes`
# themselves.
#
# $1 = VM name. Emits HW_VIRT_AUTOFIX=<name> on stdout when the fix was applied
# (parsed by lib/core/emulator.js parseHwVirtAutofix so the envelope reports
# what happened). Never fails the launch: when the modify does not take, the
# launch proceeds and diagnose_launch_failure reports the state as before.
maybe_enable_hw_virtualization() {
  local vm="$1" cfg hwvirt="" out rc=0
  [ "$OS" = "linux" ] || return 0
  { [ -e "$KVM_DEVICE" ] && [ -w "$KVM_DEVICE" ]; } || return 0
  for cfg in "$HOME/tizen-sdk-data/emulator/vms/$vm/vm_config.xml" \
             "/opt/tizen-sdk-data/emulator/vms/$vm/vm_config.xml"; do
    [ -f "$cfg" ] || continue
    hwvirt=$(sed -n 's/.*<hwVirtualization>\([^<]*\)<\/hwVirtualization>.*/\1/p' "$cfg" 2>/dev/null | head -1 || true)
    break
  done
  [ "$hwvirt" = "false" ] || return 0

  log_warn "VM '$vm' has CPU virtualization disabled in its profile although $KVM_DEVICE is usable — enabling it before launch..."
  # Same double check as launch_vm: em-cli lies in both directions — it prints
  # "Error:" with exit 0, and a Java/JNA crash exits non-zero WITHOUT an
  # "Error:" line. Either signal means the fix cannot be trusted to have taken,
  # so HW_VIRT_AUTOFIX must not be emitted.
  out=$("$EMCLI" modify -n "$vm" -w yes </dev/null 2>&1) || rc=$?
  if [ "$rc" -ne 0 ] || emcli_failed "$out"; then
    log_warn "Could not enable hwVirtualization automatically: $(echo "$out" | head -1 | tr '|' ' ')"
    log_warn "Launching anyway; if it fails, run: em-cli modify -n $vm -w yes"
    return 0
  fi
  log_ok "hwVirtualization enabled on VM '$vm' (em-cli modify -n $vm -w yes)."
  echo "HW_VIRT_AUTOFIX=$vm"
  return 0
}

# ---------------------------------------------------------------------------
# Post-launch home screen check + fix (WSL / Tizen emulator only)
# ---------------------------------------------------------------------------
# On WSL the standard Tizen profile's home screen never comes up and the display
# is left with starter's "Unable to launch org.tizen.homescreen." dialog. The
# traced chain (see docs/wsl/):
#
#   1. org.tizen.homescreen is a Flutter app. Launched THROUGH LAUNCHPAD it
#      fails to pick an EGL config:
#        tizen_renderer_egl.cc ChooseEGLConfiguration > No matching configuration found
#        app_create_cb() returns false -> flutter_app.cc Assertion `IsRunning()' -> SIGABRT
#   2. starter restarts it in a loop and crash-manager dumps a core every time —
#      measured: 3620 zips / 2.85 GB in 15 seconds, which fills the 3 GB /opt.
#   3. Only THEN do the BUXTON "Failed to set permissions" errors appear: /var is
#      a symlink to opt/var so buxton2's sqlite writes hit the full partition,
#      and crash-manager's dump_systemstate runs `buxton-wait dump` on every
#      crash, which is what actually logs them. BUXTON is a byproduct, never the
#      cause — the old chmod 777 probe that used to live here did nothing (the
#      directories were already 777 and the home screen still died).
#
# Two responses are field-verified, and this hook applies both:
#   * stop the retry loop  — mask starter's user units + reclaim the crash dumps.
#     Removes the popup (starter.mo carries exactly one user message,
#     "Unable to launch %s.") and stops /opt from filling up again.
#   * start the home screen — exec the app binary directly, bypassing launchpad:
#       XDG_RUNTIME_DIR=/run/user/<uid> WAYLAND_DISPLAY=wayland-0 \
#         nohup /usr/apps/org.tizen.homescreen/bin/runner &
#     Verified to render. Note it then runs as ROOT rather than the session user,
#     and it does not survive a guest reboot — so it is re-applied every launch.
#
# Emits HOMESCREEN_STATUS=ok|detected|fixed|popup_fixed|fix_failed on stdout
# (parsed by lib/core/emulator.js parseHomescreenStatus). Never fails the launch
# — the emulator is already up, so every probe is guarded.
#
# There is no equivalent in tizen-emulator-manager.ps1: the WSL path always runs
# this bash script, so the Windows script needs no parity.
HOMESCREEN_CHECK="${TIZEN_HOMESCREEN_CHECK:-auto}"
HOMESCREEN_LAUNCH="${TIZEN_HOMESCREEN_LAUNCH:-1}"
HOMESCREEN_MASK_STARTER="${TIZEN_HOMESCREEN_MASK_STARTER:-1}"
HOMESCREEN_CHECK_TIMEOUT="${TIZEN_HOMESCREEN_CHECK_TIMEOUT:-30}"
HOMESCREEN_VERIFY_DELAY="${TIZEN_HOMESCREEN_VERIFY_DELAY:-20}"
# Which setting turned the fixes off, for the report-only message.
HOMESCREEN_REPORT_ONLY_REASON="TIZEN_HOMESCREEN_MASK_STARTER=0, TIZEN_HOMESCREEN_LAUNCH=0"

# Compatibility with the retired TIZEN_BUXTON_* knobs. Silently ignoring them
# would be a regression trap: this hook is MORE invasive than the buxton probe it
# replaced (it masks starter and restarts the home screen), so an operator who
# deliberately opted out must stay opted out. The two opt-out intents are
# honoured, everything else only warns — and an explicit TIZEN_HOMESCREEN_* value
# always wins.
if [ -n "${TIZEN_BUXTON_CHECK:-}${TIZEN_BUXTON_AUTOFIX:-}${TIZEN_BUXTON_CHECK_TIMEOUT:-}${TIZEN_BUXTON_VERIFY_DELAY:-}" ]; then
  log_warn "TIZEN_BUXTON_* is obsolete: the buxton chmod probe was replaced by the home screen"
  log_warn "fix (see check_and_fix_homescreen). Use TIZEN_HOMESCREEN_CHECK / _LAUNCH /"
  log_warn "_MASK_STARTER / _CHECK_TIMEOUT / _VERIFY_DELAY instead."
  if [ "${TIZEN_BUXTON_CHECK:-}" = "off" ] && [ -z "${TIZEN_HOMESCREEN_CHECK:-}" ]; then
    log_warn "Honouring TIZEN_BUXTON_CHECK=off as TIZEN_HOMESCREEN_CHECK=off."
    HOMESCREEN_CHECK="off"
  fi
  if [ "${TIZEN_BUXTON_AUTOFIX:-}" = "0" ] && [ -z "${TIZEN_HOMESCREEN_LAUNCH:-}${TIZEN_HOMESCREEN_MASK_STARTER:-}" ]; then
    log_warn "Honouring TIZEN_BUXTON_AUTOFIX=0 as report-only (TIZEN_HOMESCREEN_LAUNCH=0,"
    log_warn "TIZEN_HOMESCREEN_MASK_STARTER=0) — the guest will not be modified."
    HOMESCREEN_LAUNCH="0"
    HOMESCREEN_MASK_STARTER="0"
    HOMESCREEN_REPORT_ONLY_REASON="honouring the obsolete TIZEN_BUXTON_AUTOFIX=0"
  fi
fi

HOMESCREEN_APPID="org.tizen.homescreen"
HOMESCREEN_RUNNER="/usr/apps/$HOMESCREEN_APPID/bin/runner"
CRASH_DUMP_DIR="/opt/usr/share/crash/dump"

# Two independent signals that the home screen is crash-looping. Either one is
# enough; both are cheap. Empty output = healthy (or the probe is unavailable,
# which is indistinguishable from healthy and treated as such).
homescreen_crash_signature() {
  local serial="$1" dumps="" egl=""

  # Already fixed and running: nothing to do. This has to come first — dlog is a
  # ring buffer and stale crash dumps outlive a fix, so without this check every
  # later launch would re-trigger and needlessly restart a working home screen.
  [ -n "$(homescreen_running "$serial")" ] && return 0

  dumps=$("$SDB" -s "$serial" shell "ls $CRASH_DUMP_DIR 2>/dev/null" 2>/dev/null \
    | grep -c "^${HOMESCREEN_APPID}_" || true)
  case "$dumps" in
    ''|0) ;;
    *) printf 'crash_dumps=%s\n' "$dumps"; return 0 ;;
  esac

  # A previous run of this fix leaves starter masked, which is exactly what stops
  # the crash loop — so on every LATER boot there are no crash dumps and no fresh
  # EGL errors, and without this signal the guest would boot to a blank display
  # with nothing left to launch the home screen. The mask is our own marker, so
  # "we disabled starter and no home screen is running" means: launch it.
  if [ "$("$SDB" -s "$serial" shell "readlink /etc/systemd/user/starter.service 2>/dev/null" 2>/dev/null | tr -d '\r')" = "/dev/null" ]; then
    printf 'starter_masked_no_homescreen=1\n'
    return 0
  fi

  egl=$("$SDB" -s "$serial" shell "dlogutil -d 2>/dev/null" 2>/dev/null \
    | grep -aiE 'No matching configuration found|Could not launch a Flutter application' \
    | head -1 | sed 's/\x1b\[[0-9;]*m//g' || true)
  [ -n "$egl" ] && printf 'dlog=%s\n' "$egl"
  return 0
}

# PID of a home screen started by this fix. Scoped to root on purpose:
# launchpad's own crashing instances run as the session user, so counting them
# would report a crash loop as healthy.
homescreen_running() {
  "$SDB" -s "$1" shell "pgrep -u root -f \"^$HOMESCREEN_RUNNER\" 2>/dev/null" 2>/dev/null \
    | tr -d '\r' | head -1
}

# The session runtime dir (holds the wayland socket) and the user that owns it.
# Both are needed: the home screen needs XDG_RUNTIME_DIR, and stopping starter
# needs to run AS that user on its user bus. Cached after the first lookup.
HOMESCREEN_RUNTIME_DIR=""
HOMESCREEN_SESSION_USER=""
resolve_session_paths() {
  local serial="$1"
  [ -n "$HOMESCREEN_RUNTIME_DIR" ] && return 0
  HOMESCREEN_RUNTIME_DIR=$("$SDB" -s "$serial" shell \
    "for d in /run/user/*; do [ -e \"\$d/wayland-0\" ] && { echo \$d; break; }; done" 2>/dev/null \
    | tr -d '\r' | head -1)
  [ -n "$HOMESCREEN_RUNTIME_DIR" ] || HOMESCREEN_RUNTIME_DIR="/run/user/5001"
  HOMESCREEN_SESSION_USER=$("$SDB" -s "$serial" shell "stat -c %U $HOMESCREEN_RUNTIME_DIR 2>/dev/null" 2>/dev/null \
    | tr -d '\r' | head -1)
  [ -n "$HOMESCREEN_SESSION_USER" ] || HOMESCREEN_SESSION_USER="owner"
  return 0
}

# Stop the crash loop that produces the popup. Two steps, both needed:
#   * mask starter's user units — lands in /etc/systemd/user, so it survives a
#     guest reboot and starter never comes back on later boots.
#   * stop the units in the RUNNING session — masking alone does not stop the
#     already-loaded units, and `pkill starter` alone is useless: systemd
#     restarts it within seconds and the crash loop resumes (measured: dumps
#     kept accumulating and a launchpad-spawned home screen reappeared).
#     `systemctl --user` cannot be reached as root ("Cannot access user instance
#     remotely", and the user bus rejects root with EPERM), so it has to run as
#     the session user via su with XDG_RUNTIME_DIR + DBUS_SESSION_BUS_ADDRESS.
#     starter.path must be stopped too, otherwise it reactivates the service.
# Finally reclaim the crash dumps that filled /opt.
stop_homescreen_retry_loop() {
  local serial="$1"
  if [ "$HOMESCREEN_MASK_STARTER" != "1" ]; then
    log_info "Leaving starter alone (TIZEN_HOMESCREEN_MASK_STARTER=0)."
    return 0
  fi
  resolve_session_paths "$serial"
  log_info "Stopping the home screen retry loop (masking starter, reclaiming crash dumps)..."
  "$SDB" -s "$serial" shell "systemctl --global mask starter.service starter.path 2>&1; true" >/dev/null 2>&1 || true
  "$SDB" -s "$serial" shell "su -s /bin/sh $HOMESCREEN_SESSION_USER -c \"XDG_RUNTIME_DIR=$HOMESCREEN_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS=unix:path=$HOMESCREEN_RUNTIME_DIR/bus systemctl --user stop starter.path starter.service 2>&1\"; true" >/dev/null 2>&1 || true
  "$SDB" -s "$serial" shell "pkill -9 starter 2>/dev/null; true" >/dev/null 2>&1 || true
  # Drop the crashing launchpad-spawned instances too, so the only home screen
  # left is the one started below.
  "$SDB" -s "$serial" shell "pkill -f $HOMESCREEN_RUNNER 2>/dev/null; true" >/dev/null 2>&1 || true
  "$SDB" -s "$serial" shell "rm -rf $CRASH_DUMP_DIR/* /opt/usr/share/crash/temp/* 2>/dev/null; true" >/dev/null 2>&1 || true
  return 0
}

# Launch the home screen the way that actually works: exec the app binary
# directly so launchpad never pre-initializes the graphics stack for it. Details
# that all turned out to matter:
#   * XDG_RUNTIME_DIR — the wayland socket lives in the session user's runtime
#     dir, which root does not inherit. Without it the app dies with "Server is
#     unavailable, wl.display could not be created".
#   * setsid + nohup + a short in-shell sleep — the child otherwise dies when
#     the sdb shell exits (observed: the process was gone a second later even
#     though nohup was used).
#   * the alive check must be scoped to root — launchpad's own crashing
#     instances run as the session user and would otherwise be counted as
#     "our home screen is up".
#   * poll rather than check once: on a loaded WSL guest the process can take
#     well over the old fixed 8s delay to show up.
start_homescreen_direct() {
  local serial="$1" waited=0 interval=2 alive=""
  if [ "$HOMESCREEN_LAUNCH" != "1" ]; then
    log_info "Not starting the home screen (TIZEN_HOMESCREEN_LAUNCH=0)."
    return 2
  fi
  if ! "$SDB" -s "$serial" shell "[ -x $HOMESCREEN_RUNNER ] && echo yes" 2>/dev/null | grep -q yes; then
    log_error "$HOMESCREEN_RUNNER not found on the device — cannot start the home screen directly."
    return 1
  fi
  resolve_session_paths "$serial"
  log_info "Starting $HOMESCREEN_APPID directly (XDG_RUNTIME_DIR=$HOMESCREEN_RUNTIME_DIR, bypassing launchpad)..."
  "$SDB" -s "$serial" shell "XDG_RUNTIME_DIR=$HOMESCREEN_RUNTIME_DIR WAYLAND_DISPLAY=wayland-0 setsid nohup $HOMESCREEN_RUNNER >/dev/null 2>&1 & sleep 3" >/dev/null 2>&1 || true
  while :; do
    alive=$(homescreen_running "$serial")
    [ -n "$alive" ] && return 0
    [ "$waited" -ge "$HOMESCREEN_VERIFY_DELAY" ] 2>/dev/null && break
    sleep "$interval"
    waited=$((waited + interval))
  done
  log_error "The home screen did not stay up after a direct launch (waited ${HOMESCREEN_VERIFY_DELAY}s)."
  return 1
}

check_and_fix_homescreen() {
  local serial="$1"
  local elapsed=0 interval=3 signature=""

  log_info "Checking whether the home screen is crash-looping (up to ${HOMESCREEN_CHECK_TIMEOUT}s)..."
  while :; do
    signature=$(homescreen_crash_signature "$serial")
    [ -n "$signature" ] && break
    [ "$elapsed" -ge "$HOMESCREEN_CHECK_TIMEOUT" ] && break
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  if [ -z "$signature" ]; then
    log_ok "Home screen looks healthy — no crash dumps and no EGL failures in dlog."
    echo "HOMESCREEN_STATUS=ok"
    return 0
  fi

  log_warn "Home screen crash signature found: $(printf '%s' "$signature" | tr '\r\n' '  ' | cut -c1-200)"

  if [ "$HOMESCREEN_MASK_STARTER" != "1" ] && [ "$HOMESCREEN_LAUNCH" != "1" ]; then
    # Name the setting that actually applied: this state is also reachable via
    # the retired TIZEN_BUXTON_AUTOFIX=0 opt-out, and blaming the new variables
    # then would point at something the caller never set.
    log_warn "Reporting only — the fixes are switched off ($HOMESCREEN_REPORT_ONLY_REASON)."
    echo "HOMESCREEN_STATUS=detected"
    return 0
  fi

  "$SDB" -s "$serial" root on >/dev/null 2>&1 || true
  stop_homescreen_retry_loop "$serial"

  local launch_rc=0
  start_homescreen_direct "$serial" || launch_rc=$?
  case "$launch_rc" in
    0)
      log_ok "Home screen started directly and stayed up; starter's retry loop and its"
      log_ok "\"Unable to launch\" popup are stopped. It runs as root and does not survive a"
      log_ok "guest reboot — this hook re-applies it on every launch."
      echo "HOMESCREEN_STATUS=fixed"
      ;;
    2)
      log_ok "Retry loop and popup stopped. The home screen was not started"
      log_ok "(TIZEN_HOMESCREEN_LAUNCH=0), so the display stays empty until an app is launched."
      echo "HOMESCREEN_STATUS=popup_fixed"
      ;;
    *)
      log_error "Could not bring the home screen up. The retry loop and popup are stopped, so app"
      log_error "development still works — installs/launches via sdb are unaffected."
      log_error "Verify with: sdb -s $serial shell app_launcher -l (then: app_launcher -s <app-id>)."
      log_error "For a home-screen UI that works unattended, use the TV profile instead."
      echo "HOMESCREEN_STATUS=fix_failed"
      ;;
  esac
  return 0
}

# Gate: this only applies to the Tizen emulator on WSL. Four layers, and any
# miss returns without emitting a status line at all, so the JS side can tell
# "checked and healthy" (ok) apart from "not applicable" (no line):
#   1. host     — WSL only, unless forced
#   2. target   — emulator serials only, never a USB device
#   3. platform — tizen* only (whitelist: TV and wearable images have a
#                 different launcher and must not be touched)
#   4. symptom  — handled inside check_and_fix_homescreen
maybe_check_homescreen() {
  local serial="$1" platform=""
  case "$HOMESCREEN_CHECK" in
    off) return 0 ;;
    force) ;;
    *)
      if [ "${DETECTED_WSL:-0}" -ne 1 ]; then
        log_info "Not WSL — skipping the home screen check (verified only on WSL; TIZEN_HOMESCREEN_CHECK=force to override)."
        return 0
      fi
      ;;
  esac
  case "$serial" in
    emulator-*) ;;
    *)
      log_info "Target '$serial' is not an emulator — skipping the home screen check."
      return 0
      ;;
  esac
  platform=$("$EMCLI" detail -n "$VM_NAME" 2>/dev/null \
    | sed -n 's/^[[:space:]]*Platform[[:space:]]*:[[:space:]]*//p' | head -1 || true)
  case "$platform" in
    tizen*) ;;
    *)
      log_info "Platform '${platform:-unknown}' is not a standard tizen image — skipping the home screen check."
      return 0
      ;;
  esac
  check_and_fix_homescreen "$serial"
}

# em-cli launch shares the detail/modify quirk documented in the header:
# "Error: Failed to start this VM." goes to stdout with exit 0, so trusting the
# exit status alone lets a dead launch fall through to the sdb wait and burn the
# full WAIT_TIMEOUT. Capture the output and trust the text.
#
# $1 = VM name; remaining args are passed to `em-cli launch` verbatim.
# Prints em-cli's own output to stderr (stdout is reserved for machine lines).
launch_vm() {
  local vm="$1"; shift
  local launch_out rc=0
  launch_out=$("$EMCLI" launch -n "$vm" "$@" </dev/null 2>&1) || rc=$?
  [ -n "$launch_out" ] && printf '%s\n' "$launch_out" >&2
  if [ "$rc" -ne 0 ] || emcli_failed "$launch_out"; then
    log_error "Failed to launch emulator VM '$vm'."
    log_error "Check if the VM is already running, or launch it manually via Tizen Studio."
    # em-cli dying inside Java (missing JNA bridge, broken JVM) is a host
    # problem, not a VM problem — flag it so the JS side stops pointing the
    # caller at the VM profile / KVM layers below (issue #40).
    # KEEP IN SYNC with JAVA_JNA_PATTERN in lib/core/emulator.js — the test
    # suite compares the two alternations token-for-token.
    if printf '%s' "$launch_out" | grep -qiE 'jna|NoClassDefFoundError|UnsatisfiedLinkError|ClassNotFoundException|NoSuchFieldError|NoSuchMethodError|ExceptionInInitializerError|java\.lang\.|Could not create the Java Virtual Machine|Error occurred during initialization of VM|java: command not found'; then
      echo "LAUNCH_DIAG=java_jna|failed"
      log_error "em-cli crashed inside Java before the VM could start — a host Java/JNA problem, not a VM problem."
      # NoSuchFieldError/NoSuchMethodError is not a missing dependency: the
      # emulator-manager core and the platform's emulator plugin are at
      # mismatched versions (real case: java.lang.NoSuchFieldError: isVirgl on
      # tizen-11.0, fixed by tizen-update-package taking emulator-manager
      # 2.6.60 → 2.6.67). Point at the update flow, not a reinstall.
      if printf '%s' "$launch_out" | grep -qE 'NoSuchFieldError|NoSuchMethodError'; then
        log_error "NoSuchFieldError/NoSuchMethodError points at an emulator-manager vs platform-plugin VERSION MISMATCH — update the SDK packages (tizen-update-package)."
      else
        log_error "Reinstall the emulator package (download-emulator-package) and verify the SDK's bundled JRE."
      fi
    fi
    diagnose_launch_failure "$vm" "launch_failed"
    return 1
  fi
  log_ok "Emulator launch command sent."
  return 0
}

# Post-launch virgl scanout check (Linux only). With a too-old host
# virglrenderer the guest boots and sdb connects — so no failure path ever
# runs — but every GL scanout command fails and the emulator window shows
# "Display output is not active" (or stays black) while the VM log floods with
# `virtio_gpu_virgl_process_cmd: ctrl 0x103, error 0x1203`. Detect that flood
# and emit LAUNCH_WARN so the caller learns why the display is dark even
# though the launch "worked". Log path candidates mirror
# diagnose_launch_failure's emulator.log resolution.
#
# $1 = VM name. Never fails: every probe is guarded, because under `set -e`
# a failing grep here would kill a launch that actually succeeded.
warn_if_virgl_scanout_failing() {
  local vm="$1" elog count
  [ "$OS" = "linux" ] || return 0
  for elog in "$HOME/tizen-sdk-data/emulator/vms/$vm/logs/emulator.log" \
              "/opt/tizen-sdk-data/emulator/vms/$vm/logs/emulator.log"; do
    [ -f "$elog" ] || continue
    count=$(tail -n 200 "$elog" 2>/dev/null | grep -c 'error 0x1203' || true)
    if [ "${count:-0}" -ge 20 ]; then
      echo "LAUNCH_WARN=virgl_scanout_failing"
      log_warn "The VM log floods with virgl scanout failures (error 0x1203: $count in the last 200 lines of $elog)."
      log_warn "The host virglrenderer is too old for this platform's emulator — boot and sdb are fine, but the display may stay black ('Display output is not active'). Host virglrenderer >= 1.0 is required."
    fi
    break
  done
  return 0
}

# Parse em-cli's `-d` block format into one pipe-delimited line per record.
#
#   <header>                        <- unindented, starts a record
#     Resolution        : 1920x1080 <- indented "Key : Value"
#     Skin Path         : /very/long/path/that/em-cli/wraps/at/eighty/col
#                       umns-like-this   <- continuation, no colon
#
# Reads stdin, writes "<prefix>=<header>|<field1>|<field2>|..." per record.
#
# $1 = output prefix, $2 = comma-separated em-cli field labels, in emit order
parse_detail_blocks() {
  awk -v prefix="$1" -v fields="$2" '
    BEGIN { fieldCount = split(fields, FIELD, ",") }

    function flush(   i, out, v) {
      if (header == "") return
      out = header
      for (i = 1; i <= fieldCount; i++) {
        v = VALUE[FIELD[i]]
        # em-cli brackets some paths; the brackets are noise to the caller
        if (v ~ /^\[.*\]$/) v = substr(v, 2, length(v) - 2)
        out = out "|" v
      }
      print prefix "=" out
    }

    /^[[:space:]]*$/ { next }

    # Unindented line: a new record header, or one of em-cli errors, which it
    # also prints unindented. An error must not become a bogus record.
    /^[^[:space:]]/ {
      flush()
      header = $0
      sub(/[[:space:]]+$/, "", header)
      if (header ~ /^Error:/) header = ""
      split("", VALUE)
      lastKey = ""
      next
    }

    {
      # A key line has whitespace immediately before its colon ("Skin Path  : x").
      # A wrapped continuation never does, so a Windows path value like
      # "C:\foo" is still correctly treated as continuation, not as a new key.
      if (match($0, /^[[:space:]]+[^:]+[[:space:]]:/)) {
        key = $0; sub(/^[[:space:]]+/, "", key); sub(/[[:space:]]*:.*$/, "", key)
        val = $0; sub(/^[^:]*:[[:space:]]*/, "", val); sub(/[[:space:]]+$/, "", val)
        gsub(/\|/, " ", val)
        VALUE[key] = val
        lastKey = key
      } else if (lastKey != "") {
        cont = $0; sub(/^[[:space:]]+/, "", cont); sub(/[[:space:]]+$/, "", cont)
        gsub(/\|/, " ", cont)
        VALUE[lastKey] = VALUE[lastKey] cont
      }
    }

    END { flush() }
  '
}

require_vm_name() {
  if [ -z "$VM_NAME" ]; then
    log_error "VM name is required for the $ACTION action. Use -n <name>."
    exit 1
  fi
}

assert_vm_exists() {
  # run_list_vm in THIS shell (not $(get_vm_list)), so LIST_VM_RC is visible here.
  run_list_vm
  if [ "$LIST_VM_RC" -ne 0 ]; then
    log_error "em-cli list-vm failed (exit $LIST_VM_RC) — cannot verify VM '$VM_NAME'; see the em-cli output above."
    exit 1
  fi
  local vms
  vms=$(printf '%s\n' "$LIST_VM_RAW" | _vm_names_from_list || true)
  if ! echo "$vms" | grep -Fqx "$VM_NAME"; then
    log_error "VM '$VM_NAME' not found."
    log_error "Available VMs: $(echo "$vms" | tr '\n' ' ')"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Action: list-platform
# ---------------------------------------------------------------------------
if [ "$ACTION" = "list-platform" ]; then
  log_info "Listing available emulator platforms (profile: $PROFILE)..."

  # 2>&1 + exit code, not 2>/dev/null: a broken em-cli must fail with its trace,
  # not read as "no platforms" (issue #41), and that trace is also the health
  # check that used to be a separate probe (issue #48).
  if [ "$DETAIL" = true ]; then
    rc=0; RAW=$(emcli_ro list-platform -d 2>&1) || rc=$?
    if [ "$rc" -ne 0 ]; then report_emcli_failure "list-platform -d" "$RAW" "$rc"; exit 1; fi
    DETAILS=$(echo "$RAW" | parse_detail_blocks "PLATFORM_DETAIL" "Profile,Version,CPU Arch,Skin shape,Image path")
    # Filter by profile using em-cli's own Profile field rather than a name prefix
    DETAILS=$(echo "$DETAILS" | awk -F'|' -v p="$PROFILE" 'NF>1 && $2==p' || true)
    PLATFORM_CSV=$(echo "$DETAILS" | sed 's/^PLATFORM_DETAIL=//; s/|.*$//' | grep -v '^$' | awk '!seen[$0]++' | tr '\n' ',' | sed 's/,$//')
  else
    rc=0; RAW=$(emcli_ro list-platform 2>&1) || rc=$?
    if [ "$rc" -ne 0 ]; then report_emcli_failure "list-platform" "$RAW" "$rc"; exit 1; fi
    if [ "$PROFILE" = "tv" ]; then
      PLATFORMS=$(printf '%s\n' "$RAW" | grep -v -i 'empty' | grep -v '^$' | grep '^tv' | awk '{print $1}' || true)
    else
      PLATFORMS=$(printf '%s\n' "$RAW" | grep -v -i 'empty' | grep -v '^$' | grep -v '^tv' | awk '{print $1}' || true)
    fi
    DETAILS=""
    PLATFORM_CSV=$(echo "$PLATFORMS" | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
  fi

  if [ -z "$PLATFORM_CSV" ]; then
    log_warn "No emulator platforms found for profile '$PROFILE'."
    echo "PLATFORM_LIST="
    echo "PROFILE=$PROFILE"
    exit 0
  fi

  log_ok "Found platforms ($PROFILE): $PLATFORM_CSV"
  echo "PLATFORM_LIST=$PLATFORM_CSV"
  echo "PROFILE=$PROFILE"
  [ -n "$DETAILS" ] && echo "$DETAILS"
  exit 0
fi

# ---------------------------------------------------------------------------
# Action: list-template
# ---------------------------------------------------------------------------
if [ "$ACTION" = "list-template" ]; then
  log_info "Listing available templates..."
  # Always use -d: each template's resolution comes back too, and resolution is
  # what lets the caller offer real screen sizes. Filter by platform when given,
  # otherwise by profile.
  rc=0
  if [ -n "$PLATFORM" ]; then
    TEMPLATE_RAW=$(emcli_ro list-template -p "$PLATFORM" -d 2>&1) || rc=$?
  else
    TEMPLATE_RAW=$(emcli_ro list-template -P "$PROFILE" -d 2>&1) || rc=$?
  fi
  if [ "$rc" -ne 0 ]; then report_emcli_failure "list-template" "$TEMPLATE_RAW" "$rc"; exit 1; fi

  # Duplicate names are emitted as-is (em-cli repeats some templates); the
  # caller dedupes. TEMPLATE_DETAIL's field order is a back-compat contract.
  TEMPLATE_DETAILS=$(echo "$TEMPLATE_RAW" | parse_detail_blocks "TEMPLATE_DETAIL" "Profile,Resolution,RAM Size")

  if [ -z "$TEMPLATE_DETAILS" ]; then
    log_warn "No templates found."
    echo "TEMPLATE_LIST="
    exit 0
  fi

  # TEMPLATE_LIST= stays for back-compat: CSV of names (may contain spaces).
  TEMPLATE_CSV=$(echo "$TEMPLATE_DETAILS" | sed 's/^TEMPLATE_DETAIL=//; s/|.*$//' | awk '!seen[$0]++' | tr '\n' ',' | sed 's/,$//')
  log_ok "Found templates: $TEMPLATE_CSV"
  echo "TEMPLATE_LIST=$TEMPLATE_CSV"
  echo "$TEMPLATE_DETAILS"
  exit 0
fi

# ---------------------------------------------------------------------------
# Action: list-vm
# ---------------------------------------------------------------------------
if [ "$ACTION" = "list-vm" ]; then
  log_info "Listing existing emulator VMs..."

  # A broken em-cli (JNA/JDK/wrong SDK root) must NOT read as "no VMs": check
  # the exit code and fail with the trace, so the envelope carries the cause
  # instead of a success with vms: [] (issue #41). `|| rc=$?` keeps `set -e`
  # from aborting before the diagnostics (see wait_for_vm_gone).
  # em-cli ignores -d when -c is given, so mirror that precedence here.
  if [ "$COUNT" = true ]; then
    count_rc=0; count_raw=$(emcli_ro list-vm -c 2>&1) || count_rc=$?
    if [ "$count_rc" -ne 0 ]; then
      log_error "em-cli list-vm -c failed (exit $count_rc) — cannot count VMs."
      printf '%s\n' "$count_raw" | tail -n 20 | sed 's/^/  /' >&2
      exit 1
    fi
    VM_COUNT=$(printf '%s\n' "$count_raw" | grep -E '^[0-9]+$' | head -1 || true)
    [ -z "$VM_COUNT" ] && VM_COUNT=0
    log_ok "VM count: $VM_COUNT"
    echo "VM_COUNT=$VM_COUNT"
    exit 0
  fi

  list_rc=0; list_raw=$(emcli_ro list-vm 2>&1) || list_rc=$?
  if [ "$list_rc" -ne 0 ]; then
    log_error "em-cli list-vm failed (exit $list_rc) — cannot tell whether any VMs exist."
    printf '%s\n' "$list_raw" | tail -n 20 | sed 's/^/  /' >&2
    report_emcli_failure "list-vm" "$list_raw" "$list_rc"
    exit 1
  fi
  VM_LIST=$(printf '%s\n' "$list_raw" | _vm_names_from_list || true)
  if [ -z "$VM_LIST" ]; then
    log_info "No emulator VMs found."
    echo "VM_LIST="
    echo "VM_COUNT=0"
    exit 0
  fi

  VM_CSV=$(echo "$VM_LIST" | tr '\n' ',' | sed 's/,$//')
  log_ok "Found VMs: $VM_CSV"
  echo "VM_LIST=$VM_CSV"
  echo "VM_COUNT=$(echo "$VM_LIST" | grep -c '^' || true)"

  if [ "$DETAIL" = true ]; then
    DETAIL_RAW=$("$EMCLI" list-vm -d 2>/dev/null || true)
    DETAILS=$(echo "$DETAIL_RAW" | parse_detail_blocks "VM_DETAIL" \
      "Platform,Template,Resolution,RAM Size,CPU Arch,CPU count,Type,Skin Path")
    # -p / -P narrow the list; em-cli has its own flags for this but they do not
    # combine with -d, so filter the parsed records instead.
    if [ -n "$PLATFORM" ]; then
      DETAILS=$(echo "$DETAILS" | awk -F'|' -v p="$PLATFORM" 'NF>1 && $2==p' || true)
    fi
    [ -n "$DETAILS" ] && echo "$DETAILS"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Action: detail
# ---------------------------------------------------------------------------
if [ "$ACTION" = "detail" ]; then
  if [ -z "$VM_NAME" ]; then
    log_info "Printing emulator manager information..."
    rc=0; RAW=$(emcli_ro detail 2>&1) || rc=$?
    if [ "$rc" -ne 0 ]; then report_emcli_failure "detail" "$RAW" "$rc"; exit 1; fi
    if emcli_failed "$RAW"; then
      log_error "em-cli detail failed: $(echo "$RAW" | head -3 | tr '\n' ' ')"
      exit 1
    fi
    # The manager block has a single "Emulator Manager" header, so emit plain
    # key/value pairs rather than one record line.
    echo "$RAW" | awk '
      /^[[:space:]]*$/ { next }
      /^[^[:space:]]/ { next }
      {
        if (match($0, /^[[:space:]]+[^:]+[[:space:]]:/)) {
          key = $0; sub(/^[[:space:]]+/, "", key); sub(/[[:space:]]*:.*$/, "", key)
          val = $0; sub(/^[^:]*:[[:space:]]*/, "", val); sub(/[[:space:]]+$/, "", val)
          gsub(/\|/, " ", val)
          print "MANAGER_DETAIL=" key "|" val
          lastKey = key
        } else if (lastKey != "") {
          # continuation of a wrapped value — re-emit the joined pair
          cont = $0; sub(/^[[:space:]]+/, "", cont); sub(/[[:space:]]+$/, "", cont)
          print "MANAGER_DETAIL_CONT=" lastKey "|" cont
        }
      }
    '
    log_ok "Emulator manager information printed."
    exit 0
  fi

  log_info "Printing details of VM: $VM_NAME"
  rc=0; RAW=$(emcli_ro detail -n "$VM_NAME" 2>&1) || rc=$?
  if [ "$rc" -ne 0 ]; then report_emcli_failure "detail -n $VM_NAME" "$RAW" "$rc"; exit 1; fi
  if emcli_failed "$RAW"; then
    log_error "VM '$VM_NAME' not found: $(echo "$RAW" | head -1)"
    log_error "Available VMs: $(get_vm_list | tr '\n' ' ')"
    exit 1
  fi
  DETAILS=$(echo "$RAW" | parse_detail_blocks "VM_DETAIL" \
    "Platform,Template,Resolution,RAM Size,CPU Arch,CPU count,Type,Skin Path")
  if [ -z "$DETAILS" ]; then
    log_error "em-cli returned no parsable detail block for VM '$VM_NAME'."
    exit 1
  fi
  log_ok "Details of VM '$VM_NAME' retrieved."
  echo "$DETAILS"
  exit 0
fi

# ---------------------------------------------------------------------------
# Action: delete
# ---------------------------------------------------------------------------
if [ "$ACTION" = "delete" ]; then
  require_vm_name
  log_info "Deleting emulator VM: $VM_NAME"
  if "$EMCLI" delete -n "$VM_NAME" </dev/null 2>&1; then
    log_ok "VM '$VM_NAME' deleted."
    echo "VM_DELETED=$VM_NAME"
    exit 0
  else
    log_error "Failed to delete VM '$VM_NAME'. It may not exist or may be running."
    log_error "Stop it first via Tizen Studio Emulator Manager, then retry."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Action: modify
# ---------------------------------------------------------------------------
if [ "$ACTION" = "modify" ]; then
  require_vm_name
  assert_vm_exists

  MODIFY_ARGS=(modify -n "$VM_NAME")
  [ -n "$TEMPLATE" ] && MODIFY_ARGS+=(-t "$TEMPLATE")
  [ -n "$SKIN" ] && MODIFY_ARGS+=(-s "$SKIN")
  [ -n "$RAM_SIZE" ] && MODIFY_ARGS+=(-r "$RAM_SIZE")
  [ -n "$FILE_SHARING_PATH" ] && MODIFY_ARGS+=(-f "$FILE_SHARING_PATH")
  [ -n "$HW_VIRTUALIZATION" ] && MODIFY_ARGS+=(-w "$HW_VIRTUALIZATION")
  [ -n "$HW_GL_ACCELERATION" ] && MODIFY_ARGS+=(-g "$HW_GL_ACCELERATION")

  if [ ${#MODIFY_ARGS[@]} -eq 3 ]; then
    log_error "modify needs at least one property to change."
    log_error "Pass one or more of: -T <template> -s <skin> -r <ram> -f <path> -w <yes|no> -g <yes|no>"
    exit 1
  fi

  log_info "Modifying VM '$VM_NAME'..."
  MODIFY_OUT=$("$EMCLI" "${MODIFY_ARGS[@]}" </dev/null 2>&1 || true)
  if emcli_failed "$MODIFY_OUT"; then
    log_error "Failed to modify VM '$VM_NAME': $(echo "$MODIFY_OUT" | head -3 | tr '\n' ' ')"
    log_error "The VM may be running — stop it via Tizen Studio Emulator Manager, then retry."
    exit 1
  fi
  echo "$MODIFY_OUT" >&2
  log_ok "VM '$VM_NAME' modified."
  echo "VM_MODIFIED=$VM_NAME"
  # Echo the post-change state so the caller can report what actually took.
  echo "$("$EMCLI" detail -n "$VM_NAME" 2>&1 || true)" | parse_detail_blocks "VM_DETAIL" \
    "Platform,Template,Resolution,RAM Size,CPU Arch,CPU count,Type,Skin Path"
  exit 0
fi

# ---------------------------------------------------------------------------
# Action: reset
# ---------------------------------------------------------------------------
if [ "$ACTION" = "reset" ]; then
  require_vm_name
  assert_vm_exists
  # Destructive: formats the VM's disk image and deletes every installed app.
  # The caller (lib/core/emulator.js) gates this behind an explicit confirm flag.
  log_warn "Resetting VM '$VM_NAME' — its disk image will be formatted and all installed apps deleted."
  RESET_OUT=$("$EMCLI" reset -n "$VM_NAME" </dev/null 2>&1 || true)
  if emcli_failed "$RESET_OUT"; then
    log_error "Failed to reset VM '$VM_NAME': $(echo "$RESET_OUT" | head -3 | tr '\n' ' ')"
    log_error "The VM may be running — stop it via Tizen Studio Emulator Manager, then retry."
    exit 1
  fi
  echo "$RESET_OUT" >&2
  log_ok "VM '$VM_NAME' reset."
  echo "VM_RESET=$VM_NAME"
  exit 0
fi

# ---------------------------------------------------------------------------
# Action: create-image
# ---------------------------------------------------------------------------
if [ "$ACTION" = "create-image" ]; then
  require_vm_name
  assert_vm_exists

  IMAGE_ARGS=(create-image -n "$VM_NAME")
  [ -n "$OUTPUT_DIR" ] && IMAGE_ARGS+=(-d "$OUTPUT_DIR")
  [ "$COMPRESS" = true ] && IMAGE_ARGS+=(-c)

  log_info "Creating a platform image from VM '$VM_NAME'..."
  IMAGE_OUT=$("$EMCLI" "${IMAGE_ARGS[@]}" </dev/null 2>&1 || true)
  if emcli_failed "$IMAGE_OUT"; then
    log_error "Failed to create an image from VM '$VM_NAME': $(echo "$IMAGE_OUT" | head -3 | tr '\n' ' ')"
    exit 1
  fi
  echo "$IMAGE_OUT" >&2

  # em-cli prints the destination; fall back to the requested directory.
  IMAGE_PATH=$(echo "$IMAGE_OUT" | grep -oE '(/[^[:space:]]+)+\.(qcow2|raw|x86_64|zip|tar\.gz)' | tail -1 || true)
  [ -z "$IMAGE_PATH" ] && IMAGE_PATH="${OUTPUT_DIR:-$HOME/tizen-sdk-data/emulator}"
  log_ok "Image created: $IMAGE_PATH"
  echo "IMAGE_CREATED=$IMAGE_PATH"
  exit 0
fi

# ---------------------------------------------------------------------------
# Action: launch
# ---------------------------------------------------------------------------
if [ "$ACTION" = "launch" ]; then
  if [ -z "$VM_NAME" ]; then
    log_info "No VM name specified. Listing available VMs..."
    # run_list_vm in THIS shell (not $(get_vm_list)), so LIST_VM_RC is visible here.
    run_list_vm
    if [ "$LIST_VM_RC" -ne 0 ]; then
      log_error "em-cli list-vm failed (exit $LIST_VM_RC) — cannot tell whether any VMs exist; see the em-cli output above."
      exit 1
    fi
    VM_LIST=$(printf '%s\n' "$LIST_VM_RAW" | _vm_names_from_list || true)
    if [ -z "$VM_LIST" ]; then
      log_error "No emulator VMs found. Create one first with the create action."
      log_error "Or open Tizen Studio → Emulator Manager to create one manually."
      exit 1
    fi
    VM_NAME=$(echo "$VM_LIST" | head -1)
    log_info "No VM name given — using first VM from list: $VM_NAME"
  fi
  assert_vm_exists

  SDB=$(find_tizen_tool sdb) || { log_error "sdb not found. Install the Tizen SDK first (tizen-sdk-install agent)."; exit 1; }
  log_info "Found sdb: $SDB"

  # Single success exit for every connect path below: run the post-launch home
  # screen check (WSL + tizen emulator only; see check_and_fix_homescreen)
  # before reporting the serial, so a HOMESCREEN_STATUS line always accompanies
  # DEVICE_SERIAL when the check applies. The virgl scanout check runs first —
  # it only reads the VM log, and its LAUNCH_WARN line must accompany
  # DEVICE_SERIAL whenever the display is going to be black despite the launch
  # succeeding (see warn_if_virgl_scanout_failing).
  report_launch_success() {
    warn_if_virgl_scanout_failing "$VM_NAME"
    maybe_check_homescreen "$1"
    echo "DEVICE_SERIAL=$1"
    exit 0
  }

  # Already running and connected? Report it rather than launching a second time.
  # Check EVERY connected device row (3rd column is the VM name), not just the
  # first one — the target VM may not be the first entry in `sdb devices`.
  while IFS= read -r device_row; do
    [ -n "$device_row" ] || continue
    EXISTING_SERIAL=$(echo "$device_row" | awk '{print $1}')
    VM_NAME_OF_DEVICE=$(echo "$device_row" | awk '{print $3}')
    if [ "$VM_NAME_OF_DEVICE" = "$VM_NAME" ]; then
      log_ok "VM '$VM_NAME' is already running and connected: $EXISTING_SERIAL"
      report_launch_success "$EXISTING_SERIAL"
    fi
  done < <("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' || true)

  # Record currently connected serials so we can detect the NEW emulator
  PREVIOUS_SERIALS=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | awk '{print $1}' | sort | tr '\n' ' ' || true)

  LAUNCH_EXTRA_ARGS=()
  [ -n "$EMULATOR_PATH" ] && LAUNCH_EXTRA_ARGS+=(-p "$EMULATOR_PATH")

  maybe_enable_hw_virtualization "$VM_NAME"

  # Capture pre-launch PIDs to identify the new emulator process
  # Use broad patterns: qemu process names vary by SDK version and may not include "tizen"
  PRE_PIDS=""
  if command -v pgrep &>/dev/null; then
    # Match any qemu-system or emulator process (broad pattern for compatibility)
    PRE_PIDS=$(pgrep -f 'qemu-system|qemu\.exe|emulator.*vm' 2>/dev/null | tr '\n' ' ' || true)
    log_info "Pre-launch QEMU PIDs: ${PRE_PIDS:-none}"
  fi

  log_info "Launching emulator VM: $VM_NAME"
  launch_vm "$VM_NAME" "${LAUNCH_EXTRA_ARGS[@]+"${LAUNCH_EXTRA_ARGS[@]}"}" || exit 1

  # Capture the new emulator PID and store it for later stop action
  # Wait for QEMU process to fully start (may take several seconds)
  sleep 5
  
  # Log all matching processes for debugging
  if command -v pgrep &>/dev/null; then
    log_info "All matching processes found:"
    pgrep -a -f 'qemu|emulator|tizen' 2>/dev/null | head -20 | while read -r line; do
      log_info "  $line"
    done || true
  fi
  
  EMULATOR_PID=""
  if command -v pgrep &>/dev/null && [ -n "$PRE_PIDS" ]; then
    # Find NEW qemu process that wasn't running before launch
    POST_PIDS=$(pgrep -f 'qemu-system|qemu\.exe|emulator.*vm' 2>/dev/null | tr '\n' ' ' || true)
    log_info "Post-launch QEMU PIDs: ${POST_PIDS:-none}"
    for pid in $POST_PIDS; do
      if ! echo " $PRE_PIDS " | grep -q " $pid "; then
        EMULATOR_PID=$pid
        log_info "Found NEW emulator PID by comparison: $EMULATOR_PID"
        break
      fi
    done
  elif command -v pgrep &>/dev/null; then
    # No pre-PIDs, get the first qemu-system process (most likely the emulator)
    EMULATOR_PID=$(pgrep -f 'qemu-system|qemu\.exe' 2>/dev/null | head -1 || true)
    if [ -n "$EMULATOR_PID" ]; then
      log_info "Found QEMU process (no pre-PIDs): $EMULATOR_PID"
    fi
  fi
  
  # Fallback 1: if still no PID, try matching by VM name in arguments
  if [ -z "$EMULATOR_PID" ] && command -v pgrep &>/dev/null; then
    EMULATOR_PID=$(pgrep -f "emulator.*-n.*$VM_NAME|qemu.*$VM_NAME" 2>/dev/null | head -1 || true)
    if [ -n "$EMULATOR_PID" ]; then
      log_info "Found QEMU process (fallback 1 - by VM name): $EMULATOR_PID"
    fi
  fi
  
  # Fallback 2: Look for processes with 'emulator' in path
  if [ -z "$EMULATOR_PID" ] && command -v pgrep &>/dev/null; then
    EMULATOR_PID=$(pgrep -f 'emulator.*bin.*qemu|qemu.*emulator' 2>/dev/null | head -1 || true)
    if [ -n "$EMULATOR_PID" ]; then
      log_info "Found QEMU process (fallback 2 - by path): $EMULATOR_PID"
    fi
  fi
  
  # Fallback 3: Get any Tizen qemu process as last resort (same patterns as the
  # device-manager stop action — never match non-Tizen qemu, e.g. Android)
  if [ -z "$EMULATOR_PID" ] && command -v pgrep &>/dev/null; then
    EMULATOR_PID=$(pgrep -f 'qemu.*tizen|emulator.*tizen|qemu-system-x86_64.*-tizen' 2>/dev/null | head -1 || true)
    if [ -n "$EMULATOR_PID" ]; then
      log_info "Found QEMU process (fallback 3 - any Tizen qemu): $EMULATOR_PID"
    fi
  fi

  # Store the PID in a file for later retrieval by device-manager stop action
  if [ -n "$EMULATOR_PID" ]; then
    PID_FILE="${TMPDIR:-/tmp}/tizen-emulator-${VM_NAME}.pid"
    echo "$EMULATOR_PID" > "$PID_FILE" 2>/dev/null || true
    log_info "Emulator PID ($EMULATOR_PID) stored in $PID_FILE"
    echo "EMULATOR_PID=$EMULATOR_PID"
  else
    log_warn "Could not determine emulator PID - stop action may need manual intervention"
  fi

  log_info "Waiting up to ${WAIT_TIMEOUT}s for emulator to connect to sdb..."

  get_new_serial() {
    local current_serials
    current_serials=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | awk '{print $1}' || true)
    if [ -z "$current_serials" ]; then
      echo ""
      return 1
    fi
    while IFS= read -r s; do
      [ -z "$s" ] && continue
      if ! echo " $PREVIOUS_SERIALS " | grep -q " $s "; then
        echo "$s"
        return 0
      fi
    done <<< "$current_serials"
    echo ""
    return 1
  }

  # Last-chance rescue for every connect-timeout path below: the sdb host
  # server can wedge (stale socket, half-dead daemon) so a fully booted
  # emulator never shows up in `sdb devices`. Bounce the server once and
  # re-poll briefly before declaring the launch dead — this recovered real
  # launches where qemu was up and only sdb refused to see it. On success it
  # sets NEW_SERIAL and prints SDB_SERVER_RESTARTED=1 (the JS side turns that
  # into a warning: the restart also reset any other sdb connections); on
  # failure it returns 1 so the caller falls through to the existing
  # diagnose_launch_failure + exit 1.
  SDB_RESTART_RETRY="${TIZEN_SDB_RESTART_RETRY:-30}"
  retry_serial_after_sdb_restart() {
    local elapsed=0 interval=3 serial=""
    [ "$SDB_RESTART_RETRY" -gt 0 ] 2>/dev/null || return 1
    log_warn "sdb never reported the emulator — the sdb server may be wedged. Restarting it and re-polling for up to ${SDB_RESTART_RETRY}s..."
    "$SDB" kill-server >/dev/null 2>&1 || true
    "$SDB" start-server >/dev/null 2>&1 || true
    sleep 3
    while [ "$elapsed" -lt "$SDB_RESTART_RETRY" ]; do
      serial=$(get_new_serial || true)
      if [ -n "$serial" ]; then
        log_ok "Emulator connected after sdb server restart: $serial"
        echo "SDB_SERVER_RESTARTED=1"
        NEW_SERIAL="$serial"
        return 0
      fi
      sleep "$interval"
      elapsed=$((elapsed + interval))
    done
    log_warn "sdb server restart did not surface the emulator either."
    return 1
  }

  if [ -n "$PREVIOUS_SERIALS" ]; then
    log_info "Existing devices detected ($PREVIOUS_SERIALS). Waiting for new emulator to appear..."
    ELAPSED=0
    INTERVAL=3
    while [ "$ELAPSED" -lt "$WAIT_TIMEOUT" ]; do
      NEW_SERIAL=$(get_new_serial || true)
      if [ -n "$NEW_SERIAL" ]; then
        log_ok "New emulator connected: $NEW_SERIAL"
        report_launch_success "$NEW_SERIAL"
      fi
      sleep "$INTERVAL"
      ELAPSED=$((ELAPSED + INTERVAL))
      log_info "Still waiting... (${ELAPSED}s / ${WAIT_TIMEOUT}s)"
    done
    if retry_serial_after_sdb_restart; then
      report_launch_success "$NEW_SERIAL"
    fi
    log_error "New emulator did not connect within ${WAIT_TIMEOUT}s."
    log_error "Check Tizen Emulator Manager or try increasing the timeout with -t <seconds>."
    diagnose_launch_failure "$VM_NAME" "connect_timeout"
    exit 1
  elif command -v timeout &>/dev/null; then
    if timeout "$WAIT_TIMEOUT" "$SDB" -e wait-for-device 2>/dev/null; then
      SERIAL=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | grep -i 'emulator\|26101\|26102\|26103\|26104' | head -1 | awk '{print $1}' || true)
      if [ -z "$SERIAL" ]; then
        SERIAL=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | head -1 | awk '{print $1}' || true)
      fi
      log_ok "Emulator connected: $SERIAL"
      report_launch_success "$SERIAL"
    else
      if retry_serial_after_sdb_restart; then
        report_launch_success "$NEW_SERIAL"
      fi
      log_error "Emulator did not connect within ${WAIT_TIMEOUT}s."
      log_error "Check Tizen Emulator Manager or try increasing the timeout with -t <seconds>."
      diagnose_launch_failure "$VM_NAME" "connect_timeout"
      exit 1
    fi
  else
    ELAPSED=0
    INTERVAL=3
    while [ "$ELAPSED" -lt "$WAIT_TIMEOUT" ]; do
      DEVICE_LIST=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' || true)
      if [ -n "$DEVICE_LIST" ]; then
        SERIAL=$(echo "$DEVICE_LIST" | head -1 | awk '{print $1}')
        log_ok "Emulator connected: $SERIAL"
        report_launch_success "$SERIAL"
      fi
      sleep "$INTERVAL"
      ELAPSED=$((ELAPSED + INTERVAL))
      log_info "Still waiting... (${ELAPSED}s / ${WAIT_TIMEOUT}s)"
    done
    if retry_serial_after_sdb_restart; then
      report_launch_success "$NEW_SERIAL"
    fi
    log_error "Emulator did not connect within ${WAIT_TIMEOUT}s."
    diagnose_launch_failure "$VM_NAME" "connect_timeout"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Action: create
# ---------------------------------------------------------------------------
if [ "$ACTION" = "create" ]; then
  require_vm_name

  # Check if VM already exists. run_list_vm (not $(get_vm_list)) so this first
  # em-cli call also serves as the version-mismatch gate: report_emcli_failure
  # must run in the main shell for its exit 1 / EMCLI_MISMATCH=1 to take effect.
  run_list_vm
  EXISTING_VMS=""
  if [ "$LIST_VM_RC" -eq 0 ]; then
    EXISTING_VMS=$(printf '%s\n' "$LIST_VM_RAW" | _vm_names_from_list || true)
  fi
  if echo "$EXISTING_VMS" | grep -Fqx "$VM_NAME"; then
    log_error "VM '$VM_NAME' already exists. Use a different name or delete it first:"
    log_error "  $EMCLI delete -n $VM_NAME"
    exit 1
  fi

  # Track whether a template was provided. The caller (emulator.js) resolves the
  # requested screen size to a template name, so anything arriving in -T is a
  # deliberate choice and is passed through to em-cli.
  TEMPLATE_EXPLICIT=false
  if [ -n "$TEMPLATE" ]; then
    TEMPLATE_EXPLICIT=true
  fi

  # Auto-detect platform if not provided
  if [ -z "$PLATFORM" ]; then
    log_info "Auto-detecting platform for profile: $PROFILE..."
    if [ "$PROFILE" = "tv" ]; then
      PLATFORM=$("$EMCLI" list-platform 2>/dev/null | grep -v -i 'empty' | grep -v '^$' | grep '^tv' | head -1 | awk '{print $1}' || true)
      if [ -z "$PLATFORM" ]; then
        log_error "No TV emulator platform image is installed — cannot create a TV VM."
        log_error "Install the TV SDK extension with tizen-tv-sdk-install, or via"
        log_error "Tizen Studio → Package Manager → TV Extensions, then re-run."
        exit 1
      fi
    else
      PLATFORM=$("$EMCLI" list-platform 2>/dev/null | grep -v -i 'empty' | grep -v '^$' | grep -v '^tv' | head -1 | awk '{print $1}' || true)
      if [ -z "$PLATFORM" ]; then
        PLATFORM=$("$EMCLI" list-platform 2>/dev/null | grep -v -i 'empty' | grep -v '^$' | head -1 | awk '{print $1}' || true)
      fi
      if [ -z "$PLATFORM" ]; then
        log_error "No emulator platform image is installed — cannot create a VM."
        log_error "Install one with tizen-sdk-install (e.g. the 'tizen-10.0-x86_64' emulator image),"
        log_error "or via Tizen Studio → Package Manager → (your version) → Emulator, then re-run."
        exit 1
      fi
    fi
  fi
  log_info "Using platform: $PLATFORM"

  # Assemble the optional hardware/skin arguments once — they apply to every
  # create attempt, including the TV fallback retry.
  EXTRA_ARGS=()
  [ -n "$SKIN" ] && EXTRA_ARGS+=(-s "$SKIN")
  [ -n "$RAM_SIZE" ] && EXTRA_ARGS+=(-r "$RAM_SIZE")
  [ -n "$FILE_SHARING_PATH" ] && EXTRA_ARGS+=(-f "$FILE_SHARING_PATH")
  [ -n "$HW_VIRTUALIZATION" ] && EXTRA_ARGS+=(-w "$HW_VIRTUALIZATION")
  [ -n "$HW_GL_ACCELERATION" ] && EXTRA_ARGS+=(-g "$HW_GL_ACCELERATION")
  [ -n "$CUSTOM_PATH" ] && EXTRA_ARGS+=(-c "$CUSTOM_PATH")
  [ -n "$RAW_IMAGE_PATH" ] && EXTRA_ARGS+=(-a "$RAW_IMAGE_PATH")

  # em-cli create with -a (raw image path) prompts for confirmation ("y").
  # Provide "y" on stdin so the command does not hang waiting for user input.
  # Otherwise /dev/null is used (the default for all em-cli calls) which would
  # cause the prompt to read EOF and hang.
  #
  # NOTE: Process substitution <(printf 'y\n') cannot be stored in a variable
  # and reused later — the subshell exits immediately, closing the /dev/fd/63
  # descriptor before we ever redirect from it. Use a temp file instead so the
  # content persists across multiple create attempts.
  CREATE_STDIN="/dev/null"
  _CREATE_STDIN_TMP=""
  if [ -n "$RAW_IMAGE_PATH" ]; then
    _CREATE_STDIN_TMP=$(mktemp)
    printf 'y\n' >"$_CREATE_STDIN_TMP"
    CREATE_STDIN="$_CREATE_STDIN_TMP"
    log_info "Using raw disk image path: $RAW_IMAGE_PATH (confirmation will be auto-answered)"
  fi
  # Ensure the temp file is removed on exit.
  _cleanup_create_stdin() {
    [ -n "$_CREATE_STDIN_TMP" ] && [ -f "$_CREATE_STDIN_TMP" ] && rm -f "$_CREATE_STDIN_TMP" || true
  }

  trap _cleanup_create_stdin EXIT



  # Delete the partial VM so a retry does not hit "VM already exists", verify the
  # deletion with a sync check, then exit 1 with context-specific guidance.
  cleanup_and_fail() {
    local error_phase="$1"
    local verify_rc=0
    log_error "Cleaning up partial VM..."
    "$EMCLI" delete -n "$VM_NAME" </dev/null 2>&1 || true

    wait_for_vm_gone "$VM_NAME" || verify_rc=$?
    case "$verify_rc" in
      0)
        log_ok "Partial VM deleted successfully."
        ;;
      2)
        # em-cli itself is broken (Java/JNA), so "not in the list" cannot be
        # trusted either way. Say so instead of claiming a clean cleanup.
        log_error "Could not confirm cleanup: em-cli list-vm did not respond."
        log_error "Check for a leftover VM once em-cli works: $EMCLI list-vm"
        ;;
      *)
        log_error "WARNING: Partial VM '$VM_NAME' still exists after cleanup attempt."
        log_error "Manual cleanup required: $EMCLI delete -n \"$VM_NAME\""
        ;;
    esac

    # Context-aware guidance based on which phase failed
    if [ "$error_phase" = "with_template" ]; then
      log_error "Creation failed with template '$TEMPLATE'. This may be a temporary issue."
      log_error "Options:"
      log_error "  1. Retry creation: $EMCLI create -n \"$VM_NAME\" -p \"$PLATFORM\" -t \"$TEMPLATE\""
      log_error "  2. Create without template: $EMCLI create -n \"$VM_NAME\" -p \"$PLATFORM\""
      log_error "  3. Use Tizen Studio → Emulator Manager to create manually."
    elif [ "$error_phase" = "without_template" ]; then
      log_error "Even creation without template failed. This suggests a deeper issue:"
      log_error "  - Is platform '$PLATFORM' installed? Check: $EMCLI list-platform"
      log_error "  - Is em-cli responsive? Try: $EMCLI list-vm"
      log_error "  - Use Tizen Studio → Emulator Manager to diagnose."
    fi

    exit 1
  }

  if [ "$TEMPLATE_EXPLICIT" = true ]; then
    log_info "Creating VM '$VM_NAME' on platform '$PLATFORM' with template '$TEMPLATE'..."
    if ! "$EMCLI" create -n "$VM_NAME" -p "$PLATFORM" -t "$TEMPLATE" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}" <"$CREATE_STDIN" 2>&1; then
      log_error "Failed to create emulator VM '$VM_NAME' on platform '$PLATFORM' with template '$TEMPLATE'."

      # TV fallback: em-cli has historically hit Java/JNA errors when -t is passed
      # for a TV profile. Rather than fail outright, drop the template and retry once
      # so the user still gets a VM — at em-cli's own default size, with a warning.
      if [ "$PROFILE" != "tv" ]; then
        cleanup_and_fail "with_template"
      fi
      log_warn "Retrying without -t (TV profile). The requested size may not be applied."

      # Delete the partial VM and wait for the async cleanup window to close
      # before recreating, otherwise the retry hits "VM already exists".
      "$EMCLI" delete -n "$VM_NAME" </dev/null 2>&1 || true
      FALLBACK_VERIFY_RC=0
      wait_for_vm_gone "$VM_NAME" || FALLBACK_VERIFY_RC=$?
      case "$FALLBACK_VERIFY_RC" in
        0)
          log_info "Deletion verified. Retrying create..."
          ;;
        2)
          log_warn "Could not confirm deletion (em-cli list-vm did not respond) — retrying create anyway."
          ;;
        *)
          log_warn "VM '$VM_NAME' is still listed after ${DELETE_POLL_ATTEMPTS} checks — retrying create anyway."
          log_warn "If the retry reports 'VM already exists', delete it manually: $EMCLI delete -n \"$VM_NAME\""
          ;;
      esac

      if ! "$EMCLI" create -n "$VM_NAME" -p "$PLATFORM" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}" <"$CREATE_STDIN" 2>&1; then
        cleanup_and_fail "without_template"
      fi
      log_warn "VM '$VM_NAME' created WITHOUT template '$TEMPLATE' — em-cli chose the size."
      log_warn "Apply it later with: $EMCLI modify -n \"$VM_NAME\" -t \"$TEMPLATE\""
      echo "TEMPLATE_FALLBACK=$TEMPLATE"
    fi
  else
    log_info "Creating VM '$VM_NAME' on platform '$PLATFORM'..."
    if ! "$EMCLI" create -n "$VM_NAME" -p "$PLATFORM" "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}" <"$CREATE_STDIN" 2>&1; then
      log_error "Failed to create emulator VM '$VM_NAME' on platform '$PLATFORM'."
      # No template was passed, so the guidance must not talk about one — with
      # $TEMPLATE empty, the "with_template" phase would suggest `-t ""`.
      cleanup_and_fail "without_template"
    fi
  fi
  log_ok "VM '$VM_NAME' created."
  echo "VM_CREATED=$VM_NAME"

  # Report what the VM actually ended up with, so the caller never has to guess
  # whether the requested size/RAM took effect.
  echo "$("$EMCLI" detail -n "$VM_NAME" 2>&1 || true)" | parse_detail_blocks "VM_DETAIL" \
    "Platform,Template,Resolution,RAM Size,CPU Arch,CPU count,Type,Skin Path"

  # Optionally launch
  if [ "$LAUNCH" = true ]; then
    # em-cli writes hwVirtualization=false into the fresh profile when it could
    # not use KVM at create time; heal it here too so create --launch benefits.
    maybe_enable_hw_virtualization "$VM_NAME"

    log_info "Launching emulator VM: $VM_NAME"
    launch_vm "$VM_NAME" || exit 1

    # Wait for sdb connection
    SDB=$(find_tizen_tool sdb) || { log_error "sdb not found."; exit 1; }
    log_info "Waiting for emulator to connect to sdb..."

    PREVIOUS_SERIALS=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | awk '{print $1}' | sort | tr '\n' ' ' || true)

    ELAPSED=0
    INTERVAL=3
    while [ "$ELAPSED" -lt "$WAIT_TIMEOUT" ]; do
      CURRENT_SERIALS=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' | grep -E '[[:space:]]device([[:space:]]|$)' | awk '{print $1}' || true)
      if [ -n "$CURRENT_SERIALS" ]; then
        while IFS= read -r s; do
          [ -z "$s" ] && continue
          if ! echo " $PREVIOUS_SERIALS " | grep -q " $s "; then
            log_ok "Emulator connected: $s"
            # create --launch reaches a booted emulator just like the launch
            # action does, so it needs the same post-launch home screen check —
            # a freshly created VM is in fact the most likely one to hit the
            # crash loop. Without this the popup comes back on exactly the path
            # most users take first (create-emulator --launch).
            maybe_check_homescreen "$s"
            echo "VM_LAUNCHED=$s"
            exit 0
          fi
        done <<< "$CURRENT_SERIALS"
      fi
      sleep "$INTERVAL"
      ELAPSED=$((ELAPSED + INTERVAL))
      log_info "Still waiting... (${ELAPSED}s / ${WAIT_TIMEOUT}s)"
    done
    log_warn "Emulator did not connect within ${WAIT_TIMEOUT}s, but VM was created successfully."
    log_warn "You can launch it manually later via Tizen Studio Emulator Manager."
    # Created-but-not-connected keeps exit 0; the diag lines flow into the
    # create envelope's warnings so the caller still sees why boot stalled.
    diagnose_launch_failure "$VM_NAME" "connect_timeout"
  fi

  exit 0
fi

# ---------------------------------------------------------------------------
# fix-homescreen: apply the WSL home screen fix to an ALREADY RUNNING emulator
# ---------------------------------------------------------------------------
# Same work the post-launch hook does, without needing a relaunch. The gate is
# identical (WSL + emulator serial + tizen platform) so this cannot be pointed
# at a TV image or a real device by accident; TIZEN_HOMESCREEN_CHECK=force
# overrides the host layer for investigation on other hosts.
if [ "$ACTION" = "fix-homescreen" ]; then
  SDB=$(find_tizen_tool sdb) || { log_error "sdb not found. Install the Tizen SDK first (tizen-sdk-install agent)."; exit 1; }

  # -n <vm> picks that VM's device row; otherwise take the first connected one.
  if [ -n "$VM_NAME" ]; then
    TARGET_SERIAL=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' \
      | grep -E '[[:space:]]device([[:space:]]|$)' | awk -v vm="$VM_NAME" '$3 == vm {print $1; exit}' || true)
    [ -n "$TARGET_SERIAL" ] || { log_error "VM '$VM_NAME' is not connected. Launch it first (-a launch -n $VM_NAME)."; exit 1; }
  else
    TARGET_SERIAL=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' \
      | grep -E '[[:space:]]device([[:space:]]|$)' | head -1 | awk '{print $1}' || true)
    [ -n "$TARGET_SERIAL" ] || { log_error "No connected device. Launch an emulator first (-a launch -n <vm>)."; exit 1; }
    VM_NAME=$("$SDB" devices 2>/dev/null | grep -v '^List' | grep -v '^$' \
      | grep -E '[[:space:]]device([[:space:]]|$)' | head -1 | awk '{print $3}' || true)
  fi
  log_info "Target: $TARGET_SERIAL (VM: ${VM_NAME:-unknown})"

  # An explicit request means "look now", not "poll for half a minute".
  HOMESCREEN_CHECK_TIMEOUT=0
  maybe_check_homescreen "$TARGET_SERIAL"
  echo "DEVICE_SERIAL=$TARGET_SERIAL"
  exit 0
fi

log_error "Unknown action: $ACTION"
log_error "Valid actions: create, delete, launch, list-vm, list-platform, list-template, detail, modify, reset, create-image, fix-homescreen"
exit 1
