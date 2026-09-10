#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-webapp-debug.sh
#
# Remote debugging setup for Tizen Web apps (.wgt) via RWI (Remote Web Inspector).
# Web apps run inside the web runtime, which embeds a Chromium-based engine — so
# debugging means talking CDP (Chrome DevTools Protocol), not gdb/netcoredbg:
#   1. launch the app in web-debug mode (`app_launcher -w -s`) → the runtime opens
#      an RWI server on a device-side port and prints it
#   2. forward a host port to that device port (`sdb forward`)
#   3. verify the CDP endpoint answers /json/version and /json/list
# The caller (or the user) then connects any CDP client — Chrome DevTools,
# `chromium.connectOverCDP()` in Playwright, chrome://inspect, ...
#
# Inherently setup-only: the RWI session and the port forward stay alive after
# this script exits (forward rules live in the host sdb server daemon).
#
# Usage:
#   ./tizen-webapp-debug.sh -a <APP_ID> [-p 9222] [-s <serial>] [-t 30]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

# Configuration
APP_ID=""
HOST_PORT="9222"
SERIAL=""
TIMEOUT="30"

# Runtime state
SDB="sdb"

usage() {
  cat <<EOF
Usage: $0 -a <APP_ID> [OPTIONS]

Required:
  -a APP_ID        App ID of the Web app to debug (e.g. abcDEF1234.MyWebApp)

Optional:
  -p HOST_PORT     Host port to forward to the device RWI port (default: 9222)
  -s SERIAL        Device serial (default: first connected device)
  -t TIMEOUT       CDP endpoint readiness timeout in seconds (default: 30)
  -h               Show this help

Example:
  $0 -a abcDEF1234.MyWebApp -p 9222
EOF
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while getopts "a:p:s:t:h" opt; do
  case "$opt" in
    a) APP_ID="$OPTARG" ;;
    p) HOST_PORT="$OPTARG" ;;
    s) SERIAL="$OPTARG" ;;
    t) TIMEOUT="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) log_error "Invalid option: -$OPTARG"; usage; exit 1 ;;
  esac
done

if [ -z "$APP_ID" ]; then
  log_error "Missing required argument: -a APP_ID"
  usage
  exit 1
fi

# The app id is spliced into `sdb shell "..."` strings — reject anything beyond
# the characters a real app id uses.
if ! [[ "$APP_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  log_error "Invalid app ID: $APP_ID"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  log_error "curl not found on the host — required to verify the CDP endpoint."
  exit 1
fi

# ---------------------------------------------------------------------------
# Helpers  (sdb_line — one-line `sdb shell` on $SDB/$SERIAL — comes from
# lib/common.sh)
# ---------------------------------------------------------------------------

# Fetch a CDP endpoint path; echoes the body, returns curl's exit code.
cdp_get() {
  curl -s --max-time 2 "http://127.0.0.1:$HOST_PORT$1"
}

# ---------------------------------------------------------------------------
# Resolve sdb from the SDK (tools/sdb), so it works when sdb is not on PATH.
# ---------------------------------------------------------------------------
SDB="$(find_tizen_tool sdb)" || exit 1
log_info "Using sdb: $SDB"

# ---------------------------------------------------------------------------
# Step 1: Check device connection
# ---------------------------------------------------------------------------
log_step "1/5 Checking device connection..."
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
# Refuse non-Web apps: only a .wgt runs inside the web runtime, so only a .wgt
# has an RWI server to expose. A wgt app id is "<pkgid>.<name>" — look the pkgid
# up in the device package list and bail out unless its type is wgt.
# (Inverse of the guard in tizen-gdb-debug / tizen-dotnet-debug.)
# ---------------------------------------------------------------------------
PKG_ID_CANDIDATE="${APP_ID%%.*}"
if ! "$SDB" -s "$SERIAL" shell "pkgcmd -l" 2>/dev/null | grep -i '\[wgt\]' | grep -qF "[$PKG_ID_CANDIDATE]"; then
  log_error "'$APP_ID' is not a Web app (wgt) — RWI/CDP debugging only works for Web apps."
  log_info "For Native (.tpk C/C++) apps use the tizen-gdb-debug skill; for .NET apps use tizen-dotnet-debug."
  log_info "If the app is simply not installed yet, install it first with the tizen-install-app skill."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Launch the app in web-debug mode and parse the RWI port
# ---------------------------------------------------------------------------
log_step "2/5 Launching app with Remote Web Inspector..."
RWI_PORT=""
APP_PID=""
for attempt in 1 2 3; do
  # -w only takes effect at launch time — a running instance keeps its old
  # (non-debug) state, so terminate it first.
  sdb_line "app_launcher -t $APP_ID 2>/dev/null || app_launcher -k $APP_ID 2>/dev/null" >/dev/null || true
  sleep 2
  LAUNCH_OUT="$("$SDB" -s "$SERIAL" shell "app_launcher -w -s $APP_ID" 2>&1 | tr -d '\r')" || true
  echo "$LAUNCH_OUT" | sed 's/^/    /' >&2
  # `|| true`: grep exits 1 on no match, which would kill the script under `set -eo pipefail`.
  # -i matches the PowerShell script, whose -match operator is case-insensitive.
  RWI_PORT="$(echo "$LAUNCH_OUT" | grep -ioE 'port[: ]+[0-9]+' | grep -oE '[0-9]+' | head -1 || true)"
  APP_PID="$(echo "$LAUNCH_OUT" | grep -ioE 'pid[ =:]+[0-9]+' | grep -oE '[0-9]+' | head -1 || true)"
  if [ -n "$RWI_PORT" ]; then
    break
  fi
  log_warn "Attempt $attempt/3: no RWI port in launch output — retrying..."
done

if [ -z "$RWI_PORT" ]; then
  log_error "No RWI port in app_launcher output after 3 attempts."
  log_info "The image may not support RWI (emulator/dev images do), or the app failed to enter debug launch."
  log_info "Check that the app is installed (pkgcmd -l) and launchable (app_launcher -s $APP_ID)."
  exit 1
fi
log_info "RWI server is listening on device port $RWI_PORT"
if [ -n "$APP_PID" ]; then
  echo "App PID: $APP_PID"
fi
echo "RWI device port: $RWI_PORT"

# ---------------------------------------------------------------------------
# Step 3: Forward the host port to the device RWI port
# ---------------------------------------------------------------------------
log_step "3/5 Forwarding host port $HOST_PORT -> device port $RWI_PORT..."
# Drop a stale rule on the same host port first (ignore failure: none may exist).
"$SDB" -s "$SERIAL" forward --remove "tcp:$HOST_PORT" >/dev/null 2>&1 || true
if ! "$SDB" -s "$SERIAL" forward "tcp:$HOST_PORT" "tcp:$RWI_PORT"; then
  log_error "Port forward failed (tcp:$HOST_PORT -> tcp:$RWI_PORT)."
  log_info "The host port may be in use — retry with a different -p HOST_PORT."
  exit 1
fi
echo "Forwarded: tcp:$HOST_PORT -> tcp:$RWI_PORT"

# ---------------------------------------------------------------------------
# Step 4: Verify the CDP endpoint
# ---------------------------------------------------------------------------
log_step "4/5 Verifying CDP endpoint (timeout ${TIMEOUT}s)..."
VERSION_JSON=""
elapsed=0
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  VERSION_JSON="$(cdp_get /json/version || true)"
  [ -n "$VERSION_JSON" ] && break
  sleep 1
  elapsed=$((elapsed + 1))
done
if [ -z "$VERSION_JSON" ]; then
  log_error "CDP endpoint not reachable: http://127.0.0.1:$HOST_PORT/json/version gave no answer within ${TIMEOUT}s."
  log_info "The forward is in place but the RWI server did not respond — relaunch and retry, or try a longer -t TIMEOUT."
  exit 1
fi
PAGES_JSON="$(cdp_get /json/list || true)"
if [ -z "$PAGES_JSON" ]; then
  # Some runtimes only expose /json (an alias of /json/list).
  PAGES_JSON="$(cdp_get /json || true)"
fi

# ---------------------------------------------------------------------------
# Step 5: Done — emit the machine-readable markers. Everything stays running.
# ---------------------------------------------------------------------------
log_step "5/5 CDP endpoint is live"
echo "CDP endpoint: http://127.0.0.1:$HOST_PORT"
echo "CDP_VERSION_JSON_BEGIN"
echo "$VERSION_JSON"
echo "CDP_VERSION_JSON_END"
if [ -n "$PAGES_JSON" ]; then
  echo "CDP_PAGES_JSON_BEGIN"
  echo "$PAGES_JSON"
  echo "CDP_PAGES_JSON_END"
else
  log_warn "Could not fetch the inspectable page list (/json/list) — the endpoint is up, connect a client directly."
fi
echo "" >&2
log_ok "Web app is running with RWI; CDP is reachable at http://127.0.0.1:$HOST_PORT"
log_info "Connect with Playwright:  const browser = await chromium.connectOverCDP('http://127.0.0.1:$HOST_PORT');"
log_info "Or open a page's devtoolsFrontendUrl from /json/list in Chrome, or use chrome://inspect with 127.0.0.1:$HOST_PORT."
log_info "(The RWI session and the port forward stay alive after this script exits.)"
