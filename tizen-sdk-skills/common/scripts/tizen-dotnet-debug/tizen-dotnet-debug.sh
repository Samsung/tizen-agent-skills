#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-dotnet-debug.sh
#
# Remote .NET debugging for Tizen DotNET apps with netcoredbg.
# Unlike native gdb debugging, netcoredbg runs ON THE DEVICE — there is no host
# debugger to resolve, no init file, and attach mode needs no port forward.
#   - Launch mode (-l, the runner's default): the app framework starts the app UNDER
#                            netcoredbg as a DAP server (suspended before Main until a
#                            client connects); the port is forwarded so VS Code can
#                            attach from the host. The app shows NO UI until VS Code
#                            connects — that is expected.
#   - Attach mode (no -l):   start the app normally, find its PID, then hand the user
#                            a one-line `sdb shell netcoredbg --interpreter=cli --attach`
#                            command. Misses Main(), and a normally-launched Tizen .NET
#                            app has no CoreCLR debug transport, so this usually fails
#                            (0x80131c08). Only for users who explicitly ask for it.
#
# The debugger binary comes from the SDK's on-demand packages
# (<sdk>/platforms/tizen-*/common/on-demand/netcoredbg-<ver>-<arch>.tar.gz) and is
# installed once to /home/owner/share/tmp/sdk_tools/netcoredbg on the device.
#
# Usage:
#   ./tizen-dotnet-debug.sh -a <APP_ID> [-p 4711] [-s <serial>] \
#       [-x "Program.cs:25"] [-t 30] [-l] [-f] [-N]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

# Configuration
APP_ID=""
PORT="4711"
SERIAL=""
BREAKPOINTS=""
TIMEOUT="30"
LAUNCH_MODE=false
FORCE_INSTALL=false
SETUP_ONLY=false

# Where netcoredbg lives on the device (standard SDK on-demand tools location).
NCDBG_DEVICE_DIR="/home/owner/share/tmp/sdk_tools/netcoredbg"
NCDBG_BIN="$NCDBG_DEVICE_DIR/netcoredbg"
DEVICE_TMP_TAR="/home/owner/share/tmp/netcoredbg.tar.gz"

# Runtime state
SDB="sdb"
APP_PID=""

# ---------------------------------------------------------------------------
# Cleanup (EXIT trap)
# Interactive attach: the CLI session has ended, so kill the debugger.
# Setup-only and launch mode intentionally LEAVE everything running.
# ---------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  if [ "$SETUP_ONLY" != true ] && [ "$LAUNCH_MODE" != true ] && [ -n "$APP_PID" ]; then
    "$SDB" -s "$SERIAL" shell "pkill -f netcoredbg 2>/dev/null" >/dev/null 2>&1 || true
  fi
  [ "$exit_code" -ne 0 ] && log_error "Script exited with code $exit_code"
  return "$exit_code"
}
trap cleanup EXIT

usage() {
  cat <<EOF
Usage: $0 -a <APP_ID> [OPTIONS]

Required:
  -a APP_ID        Package ID of the .NET app to debug (e.g. org.tizen.example.MyApp)

Optional:
  -p PORT          DAP server port, launch mode only (default: 4711)
  -s SERIAL        Device serial (default: first connected device)
  -x BREAKPOINTS   Suggested breakpoints, e.g. "Program.cs:25,App.cs:10".
                   Printed as ready-to-type CLI commands (netcoredbg has no init file).
  -t TIMEOUT       PID lookup timeout in seconds (default: 30, attach mode only)
  -l               Launch mode (RECOMMENDED; the CLI runner's default): the app starts
                   UNDER netcoredbg as a DAP server and suspends before Main() until a
                   client (VS Code) connects — it shows no UI until then.
                   Without -l the script runs attach mode, which misses Main() and
                   usually fails on Tizen (no CoreCLR debug transport).
  -f               Redeploy netcoredbg to the device even if already installed
  -N               Attach mode: print the netcoredbg CLI command and EXIT instead of
                   running it interactively. Use when an agent runs the script.
                   (Launch mode is inherently setup-only.)
  -h               Show this help

Examples:
  # Launch mode (recommended) — DAP server catches Main(); connect VS Code to localhost:4711
  $0 -a org.tizen.example.MyApp -l

  # Attach mode — interactive netcoredbg CLI on the running app (limited on Tizen)
  $0 -a org.tizen.example.MyApp -x "MyApp.cs:42"
EOF
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while getopts "a:p:s:x:t:lfNh" opt; do
  case "$opt" in
    a) APP_ID="$OPTARG" ;;
    p) PORT="$OPTARG" ;;
    s) SERIAL="$OPTARG" ;;
    x) BREAKPOINTS="$OPTARG" ;;
    t) TIMEOUT="$OPTARG" ;;
    l) LAUNCH_MODE=true ;;
    f) FORCE_INSTALL=true ;;
    N) SETUP_ONLY=true ;;
    h) usage; exit 0 ;;
    *) log_error "Invalid option: -$OPTARG"; usage; exit 1 ;;
  esac
done

if [ -z "$APP_ID" ]; then
  log_error "Missing required argument: -a APP_ID"
  usage
  exit 1
fi

# The app id is spliced into `sdb shell "..."` strings executed as root on the
# device — reject anything beyond the characters a real app id uses.
if ! [[ "$APP_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  log_error "Invalid app ID: $APP_ID"
  exit 1
fi

# ---------------------------------------------------------------------------
# Helpers  (sdb_line — one-line `sdb shell` on $SDB/$SERIAL — comes from
# lib/common.sh)
# ---------------------------------------------------------------------------

# Detect the device CPU architecture and map it to the on-demand tar arch name.
get_device_arch() {
  local raw
  raw="$(sdb_line 'uname -m' | tr -d '[:space:]')"
  case "$raw" in
    x86_64)          echo "x86_64" ;;
    i[3-6]86|x86)    echo "i686" ;;
    aarch64)         echo "aarch64" ;;
    arm*)            echo "armv7l" ;;
    riscv64)         echo "riscv64" ;;
    *)               log_error "Unsupported device architecture: '$raw'"; return 1 ;;
  esac
}

# Find the newest netcoredbg tar.gz for the arch across all installed platform
# versions. Do NOT hardcode a version — e.g. riscv64 only ships 3.1.0.1.
find_netcoredbg_tar() {
  local arch="$1" sdk
  sdk="$(get_sdk_path)"
  # sort -V handles both the platform dir and the package version ordering.
  # `|| true`: ls exits non-zero when nothing matches, which would kill the
  # script under `set -euo pipefail` before the caller's [ -z ] guidance runs.
  ls "$sdk"/platforms/tizen-*/common/on-demand/netcoredbg-*-"$arch".tar.gz 2>/dev/null | sort -V | tail -1 || true
}

test_netcoredbg_installed() {
  [ "$(sdb_line "test -x $NCDBG_BIN && echo ok")" = "ok" ]
}

# Push the tar.gz and extract it into the sdk_tools dir. Falls back to
# `gzip -dc | tar -xf -` for busybox tar builds without -z support.
install_netcoredbg() {
  local tar_path="$1"
  log_info "Installing netcoredbg from: $tar_path"
  sdb_line "mkdir -p /home/owner/share/tmp/sdk_tools" >/dev/null || true
  if ! "$SDB" -s "$SERIAL" push "$tar_path" "$DEVICE_TMP_TAR"; then
    log_error "Failed to push netcoredbg package to the device"
    exit 1
  fi
  sdb_line "cd /home/owner/share/tmp/sdk_tools && (tar -xzf $DEVICE_TMP_TAR 2>/dev/null || (gzip -dc $DEVICE_TMP_TAR | tar -xf -))" >/dev/null || true
  sdb_line "chmod +x $NCDBG_BIN 2>/dev/null; rm -f $DEVICE_TMP_TAR" >/dev/null || true
  if ! test_netcoredbg_installed; then
    log_error "netcoredbg extraction failed on device (expected $NCDBG_BIN)"
    exit 1
  fi
  log_ok "netcoredbg installed at $NCDBG_BIN"
}

# Poll for the app PID until TIMEOUT. Echoes the PID; returns 1 if not found.
# NOTE: NEVER pidof here — .NET apps run under dotnet-launcher, so only the process
# CMDLINE carries the app id. `grep -v netcoredbg` keeps a stale debugger process
# (whose cmdline also contains the app id) from being mistaken for the app.
wait_for_pid() {
  local target="${1:-$APP_ID}" elapsed=0 pid=""
  while [ "$elapsed" -lt "$TIMEOUT" ]; do
    pid="$(sdb_line "pgrep -f $target 2>/dev/null | head -1" | awk '{print $1}')"
    if [ -z "$pid" ]; then
      pid="$(sdb_line "ps -ef | grep $target | grep -v grep | grep -v netcoredbg | awk '{print \$2}' | head -1")"
    fi
    case "$pid" in
      ''|*[!0-9]*) ;;  # not a PID — keep polling
      *) echo "$pid"; return 0 ;;
    esac
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

# Port readiness check removed: connecting to the DAP server port (TCP connect) causes
# netcoredbg to interpret it as a client session termination → it closes itself.
# Instead, we rely on /proc/net/tcp inspection (from sdb shell) to verify the port is LISTEN,
# without actually connecting. Verification done by caller if needed; here we just proceed.

# Check for .pdb files — netcoredbg reads portable PDBs next to the dlls inside the
# app dir, so a Release build can't bind breakpoints. Returns 0 if pdbs found, 1 otherwise.
check_device_pdbs() {
  local bases="/opt/usr/globalapps/$APP_ID/bin /opt/usr/apps/$APP_ID/bin"
  local pdb="$(sdb_line "find $bases -name '*.pdb' 2>/dev/null | head -1")"
  if [ -n "$pdb" ]; then
    log_info "Debug symbols found: $pdb"
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Resolve sdb from the SDK (tools/sdb), so it works when sdb is not on PATH.
# ---------------------------------------------------------------------------
SDB="$(find_tizen_tool sdb)" || exit 1
log_info "Using sdb: $SDB"

# ---------------------------------------------------------------------------
# Step 1: Check device connection
# ---------------------------------------------------------------------------
log_step "1/6 Checking device connection..."
if [ -z "$SERIAL" ]; then
  SERIAL="$(get_device_serial "$SDB")"
fi
if [ -z "$SERIAL" ]; then
  echo "No devices found. Device manager will be invoked to create/launch an emulator." >&2
  exit 1  # Signal caller to invoke device manager
fi
log_info "Target device: $SERIAL"
"$SDB" devices >&2

# ---------------------------------------------------------------------------
# Refuse Web apps: a .wgt runs inside the web runtime (no CoreCLR process), so
# netcoredbg cannot debug it. A wgt app id is "<pkgid>.<name>" — look the pkgid
# up in the device package list and bail out if its type is wgt.
# ---------------------------------------------------------------------------
PKG_ID_CANDIDATE="${APP_ID%%.*}"
if "$SDB" -s "$SERIAL" shell "pkgcmd -l" 2>/dev/null | grep '\[wgt\]' | grep -qF "[$PKG_ID_CANDIDATE]"; then
  log_error "'$APP_ID' is a Web app (wgt) — .NET debugging is not supported for Web apps."
  log_info "Web apps run inside the web runtime; there is no CoreCLR process to attach netcoredbg to."
  log_info "Use the tizen-webapp-debug skill instead — it sets up RWI/CDP (Chrome DevTools) debugging."
  exit 1
fi

# Root gives ptrace + access to the app's bin/. Best-effort: production devices
# may refuse, in which case attach may still work for owner-run apps.
"$SDB" -s "$SERIAL" root on >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Step 2: Ensure netcoredbg is installed on the device
# ---------------------------------------------------------------------------
log_step "2/6 Checking netcoredbg on device..."
if test_netcoredbg_installed && [ "$FORCE_INSTALL" != true ]; then
  log_info "netcoredbg already installed at $NCDBG_BIN (use -f to redeploy)"
else
  ARCH="$(get_device_arch)" || exit 1
  log_info "Device architecture: $ARCH"
  TAR_PATH="$(find_netcoredbg_tar "$ARCH")"
  if [ -z "$TAR_PATH" ]; then
    log_error "netcoredbg package for '$ARCH' not found under $(get_sdk_path)/platforms/tizen-*/common/on-demand/"
    log_info "Install the platform's on-demand tools with Package Manager (or the tizen-sdk-install skill), then retry."
    exit 1
  fi
  install_netcoredbg "$TAR_PATH"
fi

# ---------------------------------------------------------------------------
# Step 3: Preflight — Debug-build check, clear stale debuggers
# ---------------------------------------------------------------------------
log_step "3/6 Preflight checks..."
if ! check_device_pdbs; then
  echo "" >&2
  log_warn "⚠️  CRITICAL: No .pdb files found — this app was built with Release configuration." >&2
  echo "" >&2
  log_warn "Breakpoints WILL NOT WORK. To debug, you MUST:" >&2
  log_warn "  1. Rebuild with Debug configuration:  tz build -b Debug" >&2
  log_warn "  2. Reinstall the app with tizen-install-app skill (use -f flag)" >&2
  log_warn "  3. Then retry tizen-dotnet-debug" >&2
  echo "" >&2
  exit 1
fi
# A stale netcoredbg would both hold the old app process and poison pgrep -f.
sdb_line "pkill -f netcoredbg 2>/dev/null" >/dev/null || true
sleep 1

# ---------------------------------------------------------------------------
# Steps 4-6
# ---------------------------------------------------------------------------
# Resolve the LAUNCHABLE app id before either mode touches the app. $APP_ID is
# documented as the PACKAGE id; the id the launcher knows can differ
# (<pkgid>.<name>), and launch_app / app_launcher -s with an unknown id silently
# do nothing — which surfaced as "debug launch never shows the app" (issue #97).
# The .pdb check above deliberately still uses $APP_ID: /opt/usr/*apps/<pkgid>.
LAUNCH_APP_ID="$(resolve_app_id "$SDB" "$SERIAL" "$APP_ID" || true)"
if [ -z "$LAUNCH_APP_ID" ]; then
  log_error "App '$APP_ID' is not installed on $SERIAL (not listed by app_launcher -l)."
  log_info "Install it first (tizen-install-app), then retry. Apps currently listed:"
  "$SDB" -s "$SERIAL" shell "app_launcher -l" 2>/dev/null | tr -d '\r' | head -20 >&2 || true
  exit 1
fi
if [ "$LAUNCH_APP_ID" != "$APP_ID" ]; then
  log_info "Resolved launchable app id: $LAUNCH_APP_ID (package id: $APP_ID)"
fi
echo "APP_LAUNCH_ID=$LAUNCH_APP_ID"

if [ "$LAUNCH_MODE" = true ]; then
  # Step 4 (launch): start the app UNDER netcoredbg via AUL bundle keys.
  log_step "4/6 Launching app under netcoredbg DAP server (port $PORT)..."
  # Kill any existing instance (single-instance apps must be stopped before re-launch).
  sdb_line "app_launcher -t $LAUNCH_APP_ID 2>/dev/null || app_launcher -k $LAUNCH_APP_ID 2>/dev/null" >/dev/null || true
  sleep 1
  # Use the official Tizen AUL debugger contract: launch_app with __AUL_SDK__ NETCOREDBG
  # and __DLP_DEBUG_ARG__ containing the netcoredbg args (--interpreter=vscode for VS Code,
  # --engineLogging for diagnostics, --server=<port>,-- for the DAP listening port). The AUL
  # system wraps the app's startup with netcoredbg, suspending it before Main() until the
  # DAP client connects.
  DLP_ARGS="__AUL_SDK__ NETCOREDBG __DLP_DEBUG_ARG__ --interpreter=vscode,--engineLogging,--server=$PORT,--"
  log_info "Starting app under netcoredbg DAP server..."
  # Keep launch_app's output: sdb shell never propagates the remote exit code, so
  # this text is the only evidence when the platform refuses the debug launch.
  LAUNCH_OUTPUT="$("$SDB" -s "$SERIAL" shell "launch_app $LAUNCH_APP_ID $DLP_ARGS" 2>&1 | tr -d '\r' || true)"
  if [ -n "$LAUNCH_OUTPUT" ]; then
    printf '%s\n' "$LAUNCH_OUTPUT" | sed 's/^/  launch_app: /' >&2
  fi
  # Verify the DAP server process actually appeared — the only reliable signal.
  FOUND=false
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if [ -n "$(sdb_line 'pgrep -f netcoredbg 2>/dev/null | head -1')" ]; then FOUND=true; break; fi
    sleep 1
  done
  if [ "$FOUND" != true ]; then
    log_error "netcoredbg DAP server did not start for '$LAUNCH_APP_ID'."
    if [ -n "$LAUNCH_OUTPUT" ]; then
      log_error "launch_app output: $(printf '%s' "$LAUNCH_OUTPUT" | head -3 | tr '\n' ' ')"
    fi
    log_info "The platform image must support SDK debug launch (__AUL_SDK__). Emulator/dev images do; some production images refuse."
    exit 1
  fi
  echo "APP_STATE=suspended_under_debugger"
  log_ok "App '$LAUNCH_APP_ID' is running under netcoredbg, SUSPENDED before Main()."
  log_info "It shows NO window until a debugger client (VS Code F5) connects — that is expected, not a failed launch."

  # Step 5 (launch): forward the DAP port to the host.
  log_step "5/6 Forwarding port $PORT..."
  "$SDB" -s "$SERIAL" forward "tcp:$PORT" "tcp:$PORT"
  log_info "Port $PORT forwarded (host -> device)"
  log_info "DAP server port is ready (connectivity check skipped to avoid killing the server)"

  # Step 6 (launch): tell the user how to connect. Everything stays running.
  log_step "6/6 Ready for a DAP client"
  echo "" >&2
  log_ok "netcoredbg is listening on device port $PORT; host tcp:$PORT is forwarded."
  log_info "Connect VS Code to the netcoredbg DAP server."
  cat >&2 <<EOF

CRITICAL: Follow these steps IN ORDER:

STEP 1: Create .vscode/launch.json in the workspace root
  Path: <WORKSPACE_ROOT>/.vscode/launch.json
  Copy-paste the following JSON structure:

    {
      "version": "0.2.0",
      "configurations": [
        {
          "name": "Tizen .NET (netcoredbg)",
          "type": "coreclr",
          "request": "launch",
          "program": "\${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0/<APP_FOLDER_NAME>.dll",
          "cwd": "\${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0",
          "debugServer": $PORT,
          "stopAtEntry": false
        }
      ]
    }

  Replace <APP_FOLDER_NAME> with your app's folder name (e.g., MyTizenNuiApp2 or MyTizenNUI5)

STEP 2: Open your project folder in VS Code
  In VS Code: File → Open Folder
  Select your project's workspace root folder
  Click 'Select Folder'

STEP 3: Set a breakpoint and press F5
  1. In VS Code code editor, click the margin next to a line number to set a red breakpoint dot
  2. Press F5 to start debugging
  3. VS Code will connect to port $PORT and break at your breakpoint

Note: The app is SUSPENDED before Main() and shows no window until F5 starts the VS Code debug
session — this is expected, not a failed launch. Startup breakpoints will hit.
(The app, netcoredbg DAP server, and port forward stay in place — you can disconnect and reconnect.)

EOF
  exit 0
fi

# Step 4 (attach): start the app normally and resolve its PID.
log_step "4/6 Launching app and resolving PID (attach mode)..."
LAUNCH_OUTPUT="$("$SDB" -s "$SERIAL" shell "app_launcher -s $LAUNCH_APP_ID" 2>&1 | tr -d '\r' || true)"
if [ -n "$LAUNCH_OUTPUT" ]; then
  printf '%s\n' "$LAUNCH_OUTPUT" | sed 's/^/  app_launcher: /' >&2
fi
sleep 2
APP_PID="$(wait_for_pid "$LAUNCH_APP_ID" || true)"
if [ -z "$APP_PID" ]; then
  log_error "Could not find PID for $LAUNCH_APP_ID after ${TIMEOUT}s"
  "$SDB" -s "$SERIAL" shell "ps -ef | grep $LAUNCH_APP_ID" >&2 || true
  exit 1
fi
log_info "App PID: $APP_PID"

# CoreCLR only creates its debugger transport (/tmp/clr-debug-pipe-<pid>-*) when the
# app was STARTED with debugging enabled. A normally-launched Tizen app has none
# (verified: netcoredbg --attach then fails with 0x80131c08), and the AUL debugger
# contract (/usr/share/aul/dotnet.debugger) only defines launch-under-netcoredbg.
# Pre-check and fail fast with real guidance instead of handing the user a command
# that cannot work.
if [ -z "$(sdb_line "ls /tmp/clr-debug-pipe-$APP_PID-* 2>/dev/null | head -1")" ]; then
  log_error "This app has no CoreCLR debug transport (/tmp/clr-debug-pipe-$APP_PID-*), so netcoredbg cannot attach (error 0x80131c08)."
  log_info "Tizen starts normally-launched .NET apps without the debugger transport. Use LAUNCH mode instead:"
  log_info "  re-run this script with -l  — the app restarts under a netcoredbg DAP server (catches Main) and VS Code connects to the forwarded port."
  exit 1
fi

# Step 5 (attach): no forward needed — the CLI runs on the device over sdb shell.
log_step "5/6 Port forwarding not needed (attach mode uses the sdb shell directly)"

# Step 6 (attach): hand over (setup-only) or run the CLI interactively.
log_step "6/6 Preparing netcoredbg CLI session..."
NCDBG_CMD="$NCDBG_BIN --interpreter=cli --attach $APP_PID"
echo "" >&2

if [ "$SETUP_ONLY" = true ]; then
  log_ok "Setup complete — app is running (PID $APP_PID) and netcoredbg is installed."
  log_info "To debug, run THIS in your own interactive terminal:"
  echo "  \"$SDB\" -s $SERIAL shell \"$NCDBG_CMD\"" >&2
  echo "" >&2
  if [ -n "$BREAKPOINTS" ]; then
    log_info "At the ncdb> prompt, set your breakpoints, then continue:"
    IFS=',' read -ra BPS <<< "$BREAKPOINTS"
    for bp in "${BPS[@]}"; do
      bp_trimmed="$(echo "$bp" | xargs)"
      [ -n "$bp_trimmed" ] && echo "    b $bp_trimmed" >&2
    done
    echo "    continue" >&2
  else
    log_info "At the ncdb> prompt: b <File.cs:line>   bt   continue   quit"
  fi
  log_info "Note: attach mode misses Main() startup — use -l to break from Main()."
  exit 0
fi

log_step "Starting netcoredbg CLI session"
if [ -n "$BREAKPOINTS" ]; then
  log_info "Suggested breakpoints (type at ncdb>): $BREAKPOINTS"
fi
"$SDB" -s "$SERIAL" shell "$NCDBG_CMD"
