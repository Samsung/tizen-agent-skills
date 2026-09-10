#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-native-gdb-debug.sh
#
# Remote GDB debugging for Tizen Native apps.
#   - Attach mode (default): launch the app, then attach gdbserver to its PID.
#                            Good for callbacks invoked after attach (e.g. service_app_control).
#   - Launch mode (-l):      gdbserver launches the binary directly and stops at the entry
#                            point before main(), so breakpoints in main/service_app_create hit.
#
# Usage:
#   ./tizen-native-gdb-debug.sh -a <APP_ID> -b <HOST_BINARY_WITH_SYMBOLS> \
#       [-p 5039] [-g gdb] [-x "main,service_app_create"] [-t 30] [-l]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

# Configuration
APP_ID=""
HOST_BIN=""
PORT="5039"
GDB="gdb"
BREAKPOINTS=""
TIMEOUT="30"
LAUNCH_MODE=false
SETUP_ONLY=false

# Runtime state
GDBSERVER_PATH=""
GDB_INIT=""
GDBSERVER_STARTED=false
# sdb resolved from the SDK (tools/sdb), NOT assumed to be on PATH. Set in Step 1.
SDB="sdb"

# ---------------------------------------------------------------------------
# Cleanup (EXIT trap)
# In setup-only mode we intentionally LEAVE gdbserver running, the port
# forwarded, and the init file in place so the user can attach gdb themselves.
# ---------------------------------------------------------------------------
cleanup() {
  local exit_code=$?
  if [ "$SETUP_ONLY" != true ]; then
    [ -n "$GDB_INIT" ] && [ -f "$GDB_INIT" ] && rm -f "$GDB_INIT"
    if [ "$GDBSERVER_STARTED" = true ]; then
      log_warn "Terminating gdbserver on device..."
      "$SDB" shell "pkill -9 gdbserver 2>/dev/null" || true
    fi
  fi
  [ "$exit_code" -ne 0 ] && log_error "Script exited with code $exit_code"
  return "$exit_code"
}
trap cleanup EXIT

usage() {
  cat <<EOF
Usage: $0 -a <APP_ID> -b <HOST_BINARY_WITH_SYMBOLS> [OPTIONS]

Required:
  -a APP_ID        Package ID of the app to debug
  -b HOST_BIN      Path to the host binary with debug symbols

Optional:
  -p PORT          Debug port (default: 5039)
  -g GDB           GDB executable (default: auto-detect SDK gdb for the device arch, else PATH gdb)
  -x BREAKPOINTS   Comma-separated breakpoints (e.g. "main,service_app_create")
  -t TIMEOUT       PID lookup timeout in seconds (default: 30, attach mode only)
  -l               Launch mode: gdbserver launches the binary directly (catches main).
                   Default is attach mode, which misses main.
  -N               Setup only: start gdbserver + forward the port + write the gdb
                   init file, print the gdb command, and EXIT (do not launch the
                   interactive gdb). Use this when an agent runs the script — then
                   run the printed command yourself in an interactive terminal.
  -h               Show this help

Examples:
  # Attach mode (default) — breaks at service_app_control
  $0 -a com.example.app -b ./Debug/app -x "service_app_control"

  # Launch mode — breaks at main before any code runs
  $0 -a com.example.app -b ./Debug/app -l -x "main,service_app_create"
EOF
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while getopts "a:b:p:g:x:t:lNh" opt; do
  case "$opt" in
    a) APP_ID="$OPTARG" ;;
    b) HOST_BIN="$OPTARG" ;;
    p) PORT="$OPTARG" ;;
    g) GDB="$OPTARG" ;;
    x) BREAKPOINTS="$OPTARG" ;;
    t) TIMEOUT="$OPTARG" ;;
    l) LAUNCH_MODE=true ;;
    N) SETUP_ONLY=true ;;
    h) usage; exit 0 ;;
    *) log_error "Invalid option: -$OPTARG"; usage; exit 1 ;;
  esac
done

if [ -z "$APP_ID" ] || [ -z "$HOST_BIN" ]; then
  log_error "Missing required arguments: -a APP_ID and -b HOST_BIN"
  usage
  exit 1
fi

# Both values are spliced into `sdb shell "..."` strings executed as root on the
# device — reject anything beyond the characters a real app id / binary name uses.
if ! [[ "$APP_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  log_error "Invalid app ID: $APP_ID"
  exit 1
fi
if ! [[ "$(basename "$HOST_BIN")" =~ ^[A-Za-z0-9._+-]+$ ]]; then
  log_error "Invalid binary name: $(basename "$HOST_BIN")"
  exit 1
fi
# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Find the installed app binary on the device. Echoes the device path (empty if none).
# Tizen installs to globalapps (newer images) or apps (older); the bin/ dir is
# root-only, so callers should enable `sdb root on` first.
find_device_binary() {
  local bin_name app_bin
  bin_name="$(basename "$HOST_BIN")"
  local bases="/opt/usr/globalapps/$APP_ID/bin /opt/usr/apps/$APP_ID/bin"
  app_bin="$("$SDB" shell "find $bases -name '$bin_name' -type f 2>/dev/null | head -1" | tr -d '\r')"
  if [ -z "$app_bin" ]; then
    # Fallback: first executable in the app's bin directory
    app_bin="$("$SDB" shell "find $bases -type f 2>/dev/null | head -1" | tr -d '\r')"
  fi
  echo "$app_bin"
}

# Poll for the app PID until TIMEOUT. Echoes the PID on stdout; returns 1 if not found.
# NOTE: pidof matches the EXECUTABLE name (e.g. mynativeapp), not the app id.
# Integer-second polling — no bc dependency.
wait_for_pid() {
  local elapsed=0 pid="" proc_name
  proc_name="$(basename "$HOST_BIN")"
  while [ "$elapsed" -lt "$TIMEOUT" ]; do
    pid="$("$SDB" shell "pidof $proc_name" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
    [ -n "$pid" ] && { echo "$pid"; return 0; }
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

# Best-effort wait until the forwarded port accepts a connection.
wait_for_port() {
  local i
  for i in 1 2 3 4 5; do
    if timeout 2 bash -c "echo '' | nc localhost $PORT" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Resolve which GDB to use. An explicit -g wins. Otherwise prefer the SDK-bundled
# gdb that matches the device architecture (the generic `gdb` rarely exists / is wrong
# arch). Falls back to `gdb` on PATH. Echoes the resolved gdb path/name.
resolve_gdb() {
  if [ "$GDB" != "gdb" ]; then echo "$GDB"; return 0; fi

  local arch prefix found root
  arch="$("$SDB" shell 'uname -m' 2>/dev/null | tr -d '\r' | tr -d '[:space:]')"
  case "$arch" in
    x86_64)         prefix="x86_64" ;;
    i686|i386|x86)  prefix="i686" ;;
    aarch64)        prefix="aarch64" ;;
    arm*)           prefix="arm" ;;
    *)              prefix="" ;;
  esac

  # Search known SDK roots (env var may point at the wrong SDK, so also try defaults)
  for root in "$(get_sdk_path)" "$HOME/tizen-sdk" "/opt/tizen-sdk"; do
    [ -d "$root/tools" ] || continue
    # arch-matched gdb first (e.g. tools/x86_64-linux-gnu-gdb-15.1/bin/x86_64-linux-gnu-gdb[.exe])
    if [ -n "$prefix" ]; then
      found="$(find "$root/tools" -maxdepth 3 -type f 2>/dev/null | grep -E "/bin/[^/]*${prefix}[^/]*gdb(\.exe)?$" | head -1)"
      [ -n "$found" ] && { echo "$found"; return 0; }
    fi
    # any bundled gdb in this root
    found="$(find "$root/tools" -maxdepth 3 -type f 2>/dev/null | grep -E "/bin/[^/]*gdb(\.exe)?$" | head -1)"
    [ -n "$found" ] && { echo "$found"; return 0; }
  done
  # PATH gdb
  echo "gdb"
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
if [ "$("$SDB" devices | grep -cE '[[:space:]]device([[:space:]]|$)' || true)" -eq 0 ]; then
  log_error "No connected device found"
  exit 1
fi
"$SDB" devices

# ---------------------------------------------------------------------------
# Refuse Web apps: a .wgt runs inside the web runtime (no native binary of its
# own), so GDB/gdbserver cannot debug it. A wgt app id is "<pkgid>.<name>" —
# look the pkgid up in the device package list and bail out if its type is wgt.
# ---------------------------------------------------------------------------
PKG_ID_CANDIDATE="${APP_ID%%.*}"
if "$SDB" shell "pkgcmd -l" 2>/dev/null | grep '\[wgt\]' | grep -qF "[$PKG_ID_CANDIDATE]"; then
  log_error "'$APP_ID' is a Web app (wgt) — GDB debugging is not supported for Web apps."
  log_info "Web apps run inside the web runtime and have no native binary to attach to."
  log_info "Use the tizen-webapp-debug skill instead — it sets up RWI/CDP (Chrome DevTools) debugging."
  exit 1
fi

# Validate host binary AFTER web app guard (web app -b is never valid)
if [ ! -f "$HOST_BIN" ]; then
  bin_name="$(basename "$HOST_BIN")"
  resolved=""
  for root in \
      "$(dirname "$(dirname "$HOST_BIN")")" \
      "$(dirname "$(dirname "$(dirname "$HOST_BIN")")")"; do
    [ -d "$root" ] || continue
    [ "$root" = "/" ] && continue
    # `|| true`: grep exits 1 on no match (and head can SIGPIPE find), which
    # would kill the script under `set -euo pipefail` before the fallbacks run.
    resolved="$(find "$root" -type f -name "$bin_name" 2>/dev/null | grep -E '/tpk/bin/' | head -1 || true)"
    [ -z "$resolved" ] && resolved="$(find "$root" -type f -name "$bin_name" -path '*bin*' 2>/dev/null | head -1 || true)"
    [ -n "$resolved" ] && break
  done
  if [ -n "$resolved" ]; then
    log_warn "Host binary not at $HOST_BIN"
    log_info "Using discovered host binary: $resolved"
    HOST_BIN="$resolved"
  else
    log_error "Host binary not found: $HOST_BIN"
    log_info "Native build output is usually at <project>/Debug/tpk/bin/<exec> (or Release/). Pass that with -b."
    exit 1
  fi
fi

# Resolve host GDB (SDK bundle preferred, arch-matched) unless -g was given
GDB="$(resolve_gdb)"
if [ "$GDB" = "gdb" ] && ! command -v gdb >/dev/null 2>&1; then
  log_error "No GDB found (not in SDK tools, not on PATH)."
  log_info  "Pass -g <path-to-gdb> to specify the GDB path."
  exit 1
fi
log_info "Using GDB: $GDB"

# Enable root so gdbserver can ptrace/launch and read the app's bin/ (emulator/dev
# images). Best-effort: production devices may refuse, in which case we continue.
"$SDB" root on >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Step 2: Locate gdbserver on device
# ---------------------------------------------------------------------------
log_step "2/6 Locating gdbserver on device..."
GDBSERVER_PATH="$("$SDB" shell 'which gdbserver 2>/dev/null || echo /usr/bin/gdbserver' | tr -d '\r')"
if ! "$SDB" shell "test -f '$GDBSERVER_PATH'" 2>/dev/null; then
  log_error "gdbserver not found at $GDBSERVER_PATH"
  exit 1
fi
log_info "gdbserver: $GDBSERVER_PATH"

# ---------------------------------------------------------------------------
# Step 3: Resolve the debug target (mode-specific) → builds GDBSERVER_ARGS
# ---------------------------------------------------------------------------
GDBSERVER_ARGS=""
if [ "$LAUNCH_MODE" = true ]; then
  log_step "3/6 Resolving app binary on device (launch mode)..."
  DEVICE_BIN="$(find_device_binary)"
  if [ -z "$DEVICE_BIN" ]; then
    log_error "Cannot find app binary on device at /opt/usr/apps/$APP_ID/bin/"
    log_info "Hint: make sure the app is installed (host binary: $(basename "$HOST_BIN"))"
    exit 1
  fi
  log_info "Device binary: $DEVICE_BIN"
  GDBSERVER_ARGS=":$PORT $DEVICE_BIN"
  if [ -z "$BREAKPOINTS" ]; then
    BREAKPOINTS="main"
    log_info "No -x given — defaulting to breakpoint at main"
  fi
else
  log_step "3/6 Launching app and resolving PID (attach mode)..."
  "$SDB" shell "app_launcher -s $APP_ID" 2>/dev/null || log_info "app_launcher may have failed (app might still be starting)"
  sleep 2
  APP_PID="$(wait_for_pid || true)"
  if [ -z "$APP_PID" ]; then
    log_error "Could not find PID for $APP_ID after ${TIMEOUT}s"
    "$SDB" shell "ps -ef | grep $APP_ID" >&2 || true
    exit 1
  fi
  log_info "App PID: $APP_PID"
  GDBSERVER_ARGS=":$PORT --attach $APP_PID"
fi

# ---------------------------------------------------------------------------
# Step 4: Start gdbserver
# ---------------------------------------------------------------------------
log_step "4/6 Starting gdbserver on port $PORT..."
"$SDB" shell "pkill gdbserver 2>/dev/null" || true
sleep 1
if [ "$SETUP_ONLY" = true ]; then
  # setup-only: the script exits before the user attaches gdb, so gdbserver must
  # outlive it. A device-side nohup is NOT enough (sdb kills the session's processes
  # when the client disconnects). Instead keep the HOST-side sdb client alive in a
  # detached process — it holds the device shell (and gdbserver) open.
  nohup "$SDB" shell "$GDBSERVER_PATH $GDBSERVER_ARGS" >"${TMPDIR:-/tmp}/tizen-gdbserver-$PORT.log" 2>&1 &
  disown 2>/dev/null || true
else
  # interactive: this script stays alive running gdb, so its sdb client persists.
  "$SDB" shell "$GDBSERVER_PATH $GDBSERVER_ARGS" &
fi
GDBSERVER_STARTED=true
log_info "gdbserver started ($([ "$LAUNCH_MODE" = true ] && echo "launch" || echo "attach") mode)"
sleep 2

# ---------------------------------------------------------------------------
# Step 5: Forward port
# ---------------------------------------------------------------------------
log_step "5/6 Forwarding port $PORT..."
"$SDB" forward "tcp:$PORT" "tcp:$PORT"
log_info "Port $PORT forwarded (host → device)"
wait_for_port || log_warn "gdbserver readiness check inconclusive — proceeding"

# ---------------------------------------------------------------------------
# Step 6: Prepare GDB session and launch
# ---------------------------------------------------------------------------
log_step "6/6 Preparing GDB session..."
GDB_INIT="$(mktemp "${TMPDIR:-/tmp}/tizen-gdb-XXXXXX.gdb")"
{
  echo "# Tizen Native GDB Debug Session"
  echo "set pagination off"
  echo "set confirm off"
  echo "set print pretty on"
  echo "set print object on"
  echo "set print static-members on"
  echo "set sysroot remote:/"
  echo ""
  echo "file \"$HOST_BIN\""
  echo "target remote localhost:$PORT"
} > "$GDB_INIT"

if [ -n "$BREAKPOINTS" ]; then
  log_info "Breakpoints: $BREAKPOINTS"
  IFS=',' read -ra BPS <<< "$BREAKPOINTS"
  for bp in "${BPS[@]}"; do
    bp_trimmed="$(echo "$bp" | xargs)"
    [ -n "$bp_trimmed" ] && echo "break $bp_trimmed" >> "$GDB_INIT"
  done
fi
# Launch mode: run to the first breakpoint (e.g. main). Attach mode: stop at the
# (gdb) prompt with the app paused so the user controls it — do NOT auto-continue
# (auto-continue would resume the app and leave no prompt if no breakpoint hits).
if [ "$LAUNCH_MODE" = true ]; then
  {
    echo ""
    echo "continue"
  } >> "$GDB_INIT"
fi

log_info "GDB init file: $GDB_INIT"
echo "" >&2

if [ "$SETUP_ONLY" = true ]; then
  log_ok "Setup complete — gdbserver is running and port $PORT is forwarded."
  log_info "To debug, run THIS in your own interactive terminal:"
  echo "  \"$GDB\" -x \"$GDB_INIT\"" >&2
  log_info "(gdbserver and the port forward stay up; the GDB init file is kept.)"
  exit 0
fi

log_step "Starting GDB session"
"$GDB" -x "$GDB_INIT"
