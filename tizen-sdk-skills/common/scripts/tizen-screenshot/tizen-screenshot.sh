#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

#
# tizen-screenshot.sh — Capture a screenshot from a Tizen emulator or device
#
# Fallback chain (stops at first success):
#
# For emulator targets (serial starts with "emulator-"):
#   1. Device-side: enlightenment_info / winfo dump (native resolution, no chrome; needs root;
#                   re-dumps with HWC off when the first dump is a flat color)
#   2. Host-side:   xwd on emulator X11 window  (downscaled, includes window chrome)
#   3. Device-side: screencapture               (mobile/wearable profiles)
#   4. Device-side: capture_screen               (some IoT images)
#   5. Device-side: /dev/fb0 framebuffer read   (may only capture kernel console)
#   6. Host-side:   VNC capture                 (Wayland/HWC targets; needs a VNC server)
#
# For physical device targets:
#   1. Device-side: enlightenment_info / winfo dump (native resolution; needs root;
#                   re-dumps with HWC off when the first dump is a flat color)
#   2. Device-side: /dev/fb0 framebuffer read  (most reliable on devices)
#   3. Device-side: screencapture               (mobile/wearable profiles)
#   4. Device-side: capture_screen               (some IoT images)
#   5. Host-side:   VNC capture                 (DA / Wayland+HWC targets whose dumps are black)
#   6. Host-side:   xwd on emulator X11 window  (rarely applicable)
#
# Usage:
#   tizen-screenshot.sh [serial] [output_path]
#
# Arguments:
#   serial      - Optional sdb device serial (auto-detect if omitted)
#   output_path - Output PNG path (default: ./emulator_screenshot.png)
#
# Requirements:
#   - sdb (from Tizen Studio)
#   - For framebuffer method: python3 with PIL/Pillow
#   - For host-side xwd method: xwd, xwininfo (X11 utilities), python3 with PIL/Pillow
#   - For host-side VNC method: python3 with PIL/Pillow and vncdotool, or vncsnapshot
#     (Ubuntu: apt install vncsnapshot); a VNC server on the device or $TIZEN_VNC_SERVER
#
# Environment (VNC method only):
#   TIZEN_VNC_SERVER      VNC server to use instead of the sdb-forwarded device port
#                         (vncdotool syntax: host::port or host:display)
#   TIZEN_VNC_PORT        device-side VNC port to forward (default 5900)
#   TIZEN_VNC_LOCAL_PORT  host-side forward port (default 15900)
#   TIZEN_VNC_PASSWORD    VNC password (vncdotool only)
#   TIZEN_VNC_TIMEOUT     seconds to wait for the VNC capture (default 15)
#
# Exit codes:
#   0 - Success
#   1 - No device found
#   2 - All screenshot methods failed
#   3 - Missing dependencies
#
# Machine-readable output lines (stdout):
#   SUCCESS: <method>              which fallback produced the capture
#   CAPTURE_WARNING=uniform_image  every method either failed or produced a
#                                  single flat color; the flat capture was kept
#                                  as a last resort (screen off / rendering
#                                  broken). Parsed by lib/core/screenshot.js.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Shared helpers (find_tizen_tool, get_connected_devices). The SUCCESS:/ERROR:
# result lines below stay on stdout as plain echo — callers parse them.
source "$SCRIPT_DIR/../lib/common.sh"

OUTPUT_PATH="${2:-./emulator_screenshot.png}"
SDB="${SDB:-sdb}"
TMPDIR_DEVICE="/tmp"

# --- Resolve sdb path: $SDB env / PATH, else the shared SDK-path resolver
#     (TIZEN_SDK_PATH -> ~/.tizen.sdk.path.config -> ~/tizen-sdk) ---
if ! command -v "$SDB" &>/dev/null; then
  if ! SDB="$(find_tizen_tool sdb)"; then
    echo "ERROR: sdb not found. Source the Tizen Studio profile or set SDB env var." >&2
    exit 3
  fi
fi

# --- Resolve serial ---
SERIAL="${1:-}"
if [ -z "$SERIAL" ]; then
  DEVICES="$(get_connected_devices "$SDB" || true)"
  DEVICE_COUNT=$(echo "$DEVICES" | grep -c . 2>/dev/null || true)
  DEVICE_COUNT=${DEVICE_COUNT:-0}
  if [ "$DEVICE_COUNT" -eq 0 ]; then
    echo "ERROR: No connected Tizen device or emulator found." >&2
    exit 1
  elif [ "$DEVICE_COUNT" -gt 1 ]; then
    echo "ERROR: Multiple devices connected. Specify serial as first argument." >&2
    "$SDB" devices >&2
    exit 1
  fi
  SERIAL="$DEVICES"
fi

echo "Target device: $SERIAL"
echo "Output: $OUTPUT_PATH"

# --- Helper: verify the output file is a valid non-empty image ---
# Each try_* function must write to a fresh temp file, then atomically move it
# to OUTPUT_PATH on success.  This prevents stale files from causing false
# positives when the actual capture command failed.
verify_output() {
  local file="$1"
  if [ -f "$file" ] && [ -s "$file" ]; then
    return 0
  fi
  return 1
}

# --- Helper: python3 with PIL/Pillow available? ---
has_pil() {
  python3 -c "from PIL import Image" 2>/dev/null
}

# --- Helper: is the capture one flat color? ---
# A solid-black PNG passes verify_output: enlightenment_info happily dumps a
# screen that is off or not composited, and the chain used to stop there even
# when a later method (host-side xwd) would have captured the real display.
# Downscale to 64x64 and check the per-channel extrema — a span under 3 on
# every channel means one flat color. Returns 0 ONLY for a confidently-uniform
# image; any doubt (no python3/PIL, unreadable file) returns 1 so behavior
# only changes for captures we are sure about.
is_uniform_image() {
  has_pil || return 1
  python3 - "$1" 2>/dev/null <<'PYEOF'
import sys
from PIL import Image
try:
    img = Image.open(sys.argv[1]).convert("RGB").resize((64, 64))
    extrema = img.getextrema()
except Exception:
    sys.exit(1)  # cannot determine -> treat as NOT uniform
sys.exit(0 if all(hi - lo < 3 for lo, hi in extrema) else 1)
PYEOF
}

# --- Helper: gate a verified capture on the uniform check ---
# $1 = candidate file (a temp path), $2 = method name for the SUCCESS line.
# Not uniform: move into place, print SUCCESS, return 0 — the chain stops.
# Uniform: stash the FIRST such capture as a last-resort fallback and return 1
# so the chain keeps going — a later method may see the real screen (observed:
# enlightenment_info dumped solid black while host-side xwd captured the UI).
UNIFORM_FALLBACK=""
UNIFORM_METHOD=""
accept_capture() {
  local file="$1" method="$2"
  if is_uniform_image "$file"; then
    echo "  WARNING: ${method} capture is a single solid color — keeping it aside and trying the next method"
    if [ -z "$UNIFORM_FALLBACK" ]; then
      UNIFORM_FALLBACK="${file}.uniform"
      UNIFORM_METHOD="$method"
      mv "$file" "$UNIFORM_FALLBACK"
    else
      rm -f "$file"
    fi
    return 1
  fi
  mv "$file" "$OUTPUT_PATH"
  # A real capture won — a previously stashed uniform fallback is dead weight.
  if [ -n "$UNIFORM_FALLBACK" ]; then
    rm -f "$UNIFORM_FALLBACK"
    UNIFORM_FALLBACK=""
    UNIFORM_METHOD=""
  fi
  echo "SUCCESS: ${method}"
  return 0
}

# --- Helper: sdb pull without MSYS path mangling ---
# On Git Bash (MSYS), a leading-slash argument to a native exe is rewritten to a
# Windows path before sdb sees it (/tmp/sshot.png → C:/Users/<u>/AppData/Local/
# Temp/sshot.png), which corrupts the DEVICE-side source path and makes the pull
# fail with "failed to get status of 'C:/...'".  MSYS_NO_PATHCONV=1 (Git for
# Windows) / MSYS2_ARG_CONV_EXCL='*' (MSYS2) turn that off for this one call;
# the HOST-side destination is then converted explicitly with cygpath so native
# sdb.exe still receives a Windows path it understands.  On Linux/macOS both
# env vars are ignored and cygpath is absent, so this is a plain pull.
sdb_pull() {
  local remote="$1" local_dest="$2"
  if command -v cygpath &>/dev/null; then
    local_dest="$(cygpath -w "$local_dest")"
  fi
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' "$SDB" -s "$SERIAL" pull "$remote" "$local_dest"
}

# ============================================================
# Method: Device-side /dev/fb0 framebuffer read
#   Reads the raw framebuffer and converts to PNG on the host using
#   Python PIL.  Most reliable on physical devices (tried first there);
#   on emulators the framebuffer often only shows the kernel console,
#   so it runs last in the emulator fallback chain (see Main below).
# ============================================================
try_framebuffer() {
  echo "Trying: device-side /dev/fb0 framebuffer..."

  if ! has_pil; then
    echo "  python3 PIL/Pillow not found — skipping"
    return 1
  fi

  # Read framebuffer info from sysfs
  local FB_SIZE FB_BPP FB_STRIDE
  FB_SIZE=$("$SDB" -s "$SERIAL" shell "cat /sys/class/graphics/fb0/virtual_size 2>/dev/null" 2>/dev/null | tr -d '\r\n' || echo "")
  FB_BPP=$("$SDB" -s "$SERIAL" shell "cat /sys/class/graphics/fb0/bits_per_pixel 2>/dev/null" 2>/dev/null | tr -d '\r\n' || echo "")
  FB_STRIDE=$("$SDB" -s "$SERIAL" shell "cat /sys/class/graphics/fb0/stride 2>/dev/null" 2>/dev/null | tr -d '\r\n' || echo "")

  if [ -z "$FB_SIZE" ] || [ -z "$FB_BPP" ]; then
    echo "  Cannot read framebuffer info — skipping"
    return 1
  fi

  local FB_WIDTH FB_HEIGHT
  FB_WIDTH=$(echo "$FB_SIZE" | cut -d',' -f1 | tr -d ' ')
  FB_HEIGHT=$(echo "$FB_SIZE" | cut -d',' -f2 | tr -d ' ')

  echo "  Framebuffer: ${FB_WIDTH}x${FB_HEIGHT}, ${FB_BPP}bpp, stride=${FB_STRIDE:-unknown}"

  local RAW_TMP OUT_TMP
  RAW_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.raw)
  OUT_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.png)

  # Read framebuffer with dd
  if [ -n "$FB_STRIDE" ] && [ "$FB_STRIDE" -gt 0 ]; then
    "$SDB" -s "$SERIAL" shell "dd if=/dev/fb0 of=${TMPDIR_DEVICE}/fb0.raw bs=${FB_STRIDE} count=${FB_HEIGHT}" 2>/dev/null
  else
    "$SDB" -s "$SERIAL" shell "dd if=/dev/fb0 of=${TMPDIR_DEVICE}/fb0.raw" 2>/dev/null
  fi

  sdb_pull "${TMPDIR_DEVICE}/fb0.raw" "$RAW_TMP" 2>/dev/null
  "$SDB" -s "$SERIAL" shell "rm ${TMPDIR_DEVICE}/fb0.raw" 2>/dev/null

  if [ ! -f "$RAW_TMP" ] || [ ! -s "$RAW_TMP" ]; then
    echo "  Failed to read framebuffer — skipping"
    rm -f "$RAW_TMP" "$OUT_TMP"
    return 1
  fi

  # Convert raw framebuffer → PNG (write to temp, not OUTPUT_PATH)
  python3 - "$RAW_TMP" "$OUT_TMP" "$FB_WIDTH" "$FB_HEIGHT" "$FB_BPP" "${FB_STRIDE:-0}" <<'PYEOF'
import sys, struct
from PIL import Image

raw_path, png_path, width, height, bpp, stride = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])

with open(raw_path, 'rb') as f:
    raw = f.read()

if stride == 0:
    stride = width * (bpp // 8)

# 32bpp BGRA is the most common format
if bpp == 32:
    img = Image.frombytes('RGBA', (width, height), raw, 'raw', 'BGRA', stride, 1)
elif bpp == 24:
    img = Image.frombytes('RGB', (width, height), raw, 'raw', 'BGR', stride, 1)
elif bpp == 16:
    img = Image.frombytes('RGB', (width, height), raw, 'raw', 'BGR;16', stride, 1)
else:
    print(f"  Unsupported bpp: {bpp}", file=sys.stderr)
    sys.exit(1)

img.save(png_path)
print(f"  Converted: {width}x{height} {bpp}bpp → {png_path}")
PYEOF

  local CONVERT_STATUS=$?
  rm -f "$RAW_TMP"

  if [ $CONVERT_STATUS -eq 0 ] && verify_output "$OUT_TMP" && accept_capture "$OUT_TMP" "framebuffer"; then
    return 0
  fi

  rm -f "$OUT_TMP"
  return 1
}

# ============================================================
# Method: Device-side capture tool (screencapture / capture_screen)
#   Both tools take an output path on the device; the flow is identical:
#   run the tool, pull the file, verify, move into place.
# ============================================================
try_device_capture() {
  local TOOL="$1"
  echo "Trying: device-side ${TOOL}..."

  # Write to a fresh temp file so a stale output can't cause a false positive
  local OUT_TMP
  OUT_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.png)

  if "$SDB" -s "$SERIAL" shell "${TOOL} ${TMPDIR_DEVICE}/sshot.png" 2>/dev/null; then
    sdb_pull "${TMPDIR_DEVICE}/sshot.png" "$OUT_TMP" 2>/dev/null
    "$SDB" -s "$SERIAL" shell "rm -f ${TMPDIR_DEVICE}/sshot.png" 2>/dev/null
    if verify_output "$OUT_TMP" && accept_capture "$OUT_TMP" "${TOOL}"; then
      return 0
    fi
  fi

  rm -f "$OUT_TMP"
  return 1
}

# ============================================================
# Method: Device-side enlightenment_info
#   Enlightenment is the Tizen window manager. Verified on a tizen-vm-default
#   emulator that ships NEITHER screencapture NOR capture_screen, where this is
#   the only device-side method that returns the real UI: `-dump_screen` gave a
#   clean full-screen 1920x1080 PNG.
#
#   Two things this has to work around, both observed on that image:
#
#   1. /usr/bin/enlightenment_info is mode -r-xr-x--- root:root. The default sdb
#      user is `owner` (uid 5001) and gets "Permission denied", so we elevate
#      with `sdb root on` and restore the previous mode afterwards.
#   2. The tool exits 0 even for an unknown option ("unknown option: -x" then
#      exit=0), so success MUST be judged by the produced file, never $?.
#      Option spelling also varies by image, hence the forms below.
#
#   DA (appliance) and other Wayland/HWC targets add two more:
#
#   3. The binary may ship as `winfo` instead of `enlightenment_info` (same
#      e_info client, same options). The name is resolved on the device after
#      elevation — as `owner` neither is executable, so `command -v` misses it.
#   4. With HWC (hardware composer) active, the UI sits on TDM overlay planes
#      that the compositor never draws into its own buffer, so -dump_screen
#      returns solid black. When forms 1-2 come back uniform, form 3 switches
#      HWC off (`-hwc 0`, everything is GL-composited), dumps again, and turns
#      HWC back on (`-hwc 1`) whatever the outcome.
# ============================================================
try_enlightenment_info() {
  echo "Trying: device-side enlightenment_info / winfo..."

  local OUT_TMP
  OUT_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.png)

  # --- elevate (and remember whether we need to restore) ---
  local WAS_ROOT=0
  if [ "$("$SDB" -s "$SERIAL" shell "id -u" 2>/dev/null | tr -d '\r\n')" = "0" ]; then
    WAS_ROOT=1
  else
    "$SDB" -s "$SERIAL" root on >/dev/null 2>&1
    if [ "$("$SDB" -s "$SERIAL" shell "id -u" 2>/dev/null | tr -d '\r\n')" != "0" ]; then
      echo "  enlightenment_info needs root and 'sdb root on' was refused — skipping"
      rm -f "$OUT_TMP"
      return 1
    fi
  fi

  _e_restore_root() {
    [ "$WAS_ROOT" -eq 1 ] || "$SDB" -s "$SERIAL" root off >/dev/null 2>&1
  }

  # --- which e_info client does this image ship? ---
  local E_TOOL
  E_TOOL=$("$SDB" -s "$SERIAL" shell "command -v enlightenment_info || command -v winfo" 2>/dev/null | tr -d '\r' | head -n1)
  E_TOOL="${E_TOOL##*/}"
  case "$E_TOOL" in
    enlightenment_info|winfo) ;;
    *) E_TOOL="enlightenment_info" ;;  # not found — keep the old behavior
  esac
  echo "  e_info client: ${E_TOOL}"

  # -dump_screen into $1 (a host path); the caller judges the file. $2, when
  # non-zero, bounds the device-side dump_screen render with `timeout` and
  # tolerates a missed pull (the HWC-off retry uses this so a hung dump cannot
  # abort the chain before HWC is restored). Forms 1-2 pass no timeout.
  local DEV_NAME="tizen_sshot_$$.png"
  _e_dump_screen() {
    local dest="$1" ttl="${2:-0}"
    local RUN=()
    if [ "$ttl" -gt 0 ] && command -v timeout &>/dev/null 2>&1; then
      RUN=(timeout "$ttl")
    fi
    "$SDB" -s "$SERIAL" shell "rm -f ${TMPDIR_DEVICE}/${DEV_NAME}" >/dev/null 2>&1
    if [ "$ttl" -gt 0 ]; then
      "${RUN[@]+"${RUN[@]}"}" "$SDB" -s "$SERIAL" shell "${E_TOOL} -dump_screen -p ${TMPDIR_DEVICE}/ -n ${DEV_NAME}" >/dev/null 2>&1 || true
      sdb_pull "${TMPDIR_DEVICE}/${DEV_NAME}" "$dest" >/dev/null 2>&1 || true
    else
      "${RUN[@]+"${RUN[@]}"}" "$SDB" -s "$SERIAL" shell "${E_TOOL} -dump_screen -p ${TMPDIR_DEVICE}/ -n ${DEV_NAME}" >/dev/null 2>&1
      sdb_pull "${TMPDIR_DEVICE}/${DEV_NAME}" "$dest" >/dev/null 2>&1
    fi
    "$SDB" -s "$SERIAL" shell "rm -f ${TMPDIR_DEVICE}/${DEV_NAME}" >/dev/null 2>&1
  }

  # Query the current HWC state. Prints "0" or "1" when the e_info client
  # reports a clean value, empty when `-hwc` without a value is not supported.
  # Best-effort: the option syntax is not verified on every DA image, so a
  # missing or unparseable reply is "unknown", not an error.
  _e_hwc_query() {
    local raw
    raw=$("$SDB" -s "$SERIAL" shell "${E_TOOL} -hwc" 2>/dev/null | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//') || true
    case "$raw" in
      0|1) echo "$raw" ;;
      *) echo "" ;;
    esac
  }

  # Restore HWC to $1 and verify when the state is queryable. Sets HWC_RECOVERY
  # to verified | failed | unverified so the caller can include it in the final
  # JSON warning. The restore call is bounded by HWC_RESTORE_TIMEOUT.
  _e_hwc_restore() {
    local target="$1" query_ok="$2"
    local RUN=()
    if command -v timeout &>/dev/null 2>&1; then RUN=(timeout "$HWC_RESTORE_TIMEOUT"); fi
    if "${RUN[@]+"${RUN[@]}"}" "$SDB" -s "$SERIAL" shell "${E_TOOL} -hwc ${target}" >/dev/null 2>&1; then :; fi
    if [ "$query_ok" -eq 1 ]; then
      local now
      now=$(_e_hwc_query)
      if [ "$now" = "$target" ]; then
        HWC_RECOVERY="verified"
      else
        HWC_RECOVERY="failed"
      fi
    else
      HWC_RECOVERY="unverified"
    fi
  }

  # --- form 1: -dump_screen — one file, full screen, exact path (preferred) ---
  _e_dump_screen "$OUT_TMP"

  if verify_output "$OUT_TMP"; then
    if accept_capture "$OUT_TMP" "${E_TOOL} -dump_screen"; then
      _e_restore_root
      return 0
    fi
    # Uniform capture stashed — fall through to form 2 with root still on.
  fi

  # --- form 2: -dump topvwins <DIR> — per-window buffers, keep the biggest ---
  # Note the space: it is `-dump topvwins`, not `-dump_topvwins`. The tool also
  # creates its OWN timestamped subdirectory inside <DIR>, so the search for the
  # resulting PNGs has to recurse.
  local DUMP_DIR="${TMPDIR_DEVICE}/tizen_e_dump_$$"
  local PULL_DIR
  PULL_DIR=$(mktemp -d /tmp/tizen_screenshot_e_XXXXXX)

  "$SDB" -s "$SERIAL" shell "rm -rf ${DUMP_DIR} && mkdir -p ${DUMP_DIR}" >/dev/null 2>&1
  "$SDB" -s "$SERIAL" shell "${E_TOOL} -dump topvwins ${DUMP_DIR}" >/dev/null 2>&1
  sdb_pull "${DUMP_DIR}" "$PULL_DIR" >/dev/null 2>&1
  "$SDB" -s "$SERIAL" shell "rm -rf ${DUMP_DIR}" >/dev/null 2>&1

  # Largest PNG = the full-screen window (the others are small UI surfaces)
  local BIGGEST
  BIGGEST=$(find "$PULL_DIR" -type f -name '*.png' -exec ls -S {} + 2>/dev/null | head -n1)

  if [ -n "$BIGGEST" ] && verify_output "$BIGGEST"; then
    cp "$BIGGEST" "$OUT_TMP"
    if accept_capture "$OUT_TMP" "${E_TOOL} -dump topvwins"; then
      rm -rf "$PULL_DIR"
      _e_restore_root
      return 0
    fi
  fi
  rm -rf "$PULL_DIR"

  # --- form 3: HWC off, dump again, restore HWC ---
  # Only when an earlier form produced a flat image: that is the HWC symptom,
  # and toggling composition on a device that captured fine is not our call.
  # The previous HWC state is queried first so we restore THAT (not a hard-
  # coded 1) on images that can report it; the dump and the restore are each
  # bounded, and a trap restores HWC if the script is signalled between
  # `-hwc 0` and the restore (a SIGTERM there used to leave HWC disabled).
  if [ -n "$UNIFORM_FALLBACK" ]; then
    echo "  Capture was a single solid color — retrying with HWC disabled (Wayland/HWC overlay planes are not in the composited dump)"
    rm -f "$OUT_TMP"

    local PREV_HWC QUERY_OK=0 HWC_RECOVERY="pending"
    PREV_HWC=$(_e_hwc_query)
    if [ "$PREV_HWC" = "0" ] || [ "$PREV_HWC" = "1" ]; then
      QUERY_OK=1
    else
      PREV_HWC=1   # unknown — restore the compositor default and flag unverified
    fi

    _e_hwc_cleanup() {
      # Runs only if the normal restore has not (HWC_RECOVERY still pending);
      # a duplicate restore is idempotent in any case.
      [ "$HWC_RECOVERY" = "verified" ] || _e_hwc_restore "$PREV_HWC" "$QUERY_OK"
    }
    trap '_e_hwc_cleanup' INT TERM

    "$SDB" -s "$SERIAL" shell "${E_TOOL} -hwc 0" >/dev/null 2>&1 || true
    sleep 1  # let the compositor redraw every plane through GL
    _e_dump_screen "$OUT_TMP" "$HWC_DUMP_TIMEOUT"
    _e_hwc_restore "$PREV_HWC" "$QUERY_OK"
    trap - INT TERM

    echo "  HWC restored: ${HWC_RECOVERY} (previous=${PREV_HWC})"
    case "$HWC_RECOVERY" in
      failed) echo "CAPTURE_WARNING=hwc_recovery_failed" ;;
      unverified) echo "CAPTURE_WARNING=hwc_recovery_unverified" ;;
    esac

    if verify_output "$OUT_TMP" && accept_capture "$OUT_TMP" "${E_TOOL} -dump_screen (hwc off)"; then
      _e_restore_root
      return 0
    fi
  fi

  _e_restore_root
  rm -f "$OUT_TMP"
  return 1
}

# ============================================================
# Method: Host-side VNC capture
#   Last resort for Wayland/HWC targets (DA appliances) where every on-device
#   dump is black: a VNC server on the device (or one the user names) is fed by
#   the display pipeline itself, overlay planes included.
#
#   Server: $TIZEN_VNC_SERVER (vncdotool syntax, host::port or host:display)
#   when set; otherwise the device's TCP ${TIZEN_VNC_PORT:-5900} is forwarded
#   to localhost:${TIZEN_VNC_LOCAL_PORT:-15900} over sdb and removed afterwards.
#   Password: $TIZEN_VNC_PASSWORD (read from the environment, never argv).
#
#   Client: python3 vncdotool (`pip install vncdotool`, any host) first, then
#   vncsnapshot (`apt install vncsnapshot` on Ubuntu; no password support,
#   JPEG output converted to PNG with PIL).
# ============================================================
VNC_TIMEOUT="${TIZEN_VNC_TIMEOUT:-15}"

# Bounds (seconds) for the HWC-off retry on Wayland/HWC targets. The dump and
# the HWC restore each get their own deadline so a hung sdb call cannot stall
# the chain past the 90 s script timeout; a SIGTERM between `-hwc 0` and the
# restore is still cleaned up by the trap in try_enlightenment_info form 3.
HWC_DUMP_TIMEOUT="${HWC_DUMP_TIMEOUT:-30}"
HWC_RESTORE_TIMEOUT="${HWC_RESTORE_TIMEOUT:-15}"

try_vnc() {
  echo "Trying: host-side VNC capture..."

  local CLIENT=""
  if has_pil && python3 -c "import vncdotool" 2>/dev/null; then
    CLIENT="vncdotool"
  elif command -v vncsnapshot &>/dev/null && has_pil; then
    CLIENT="vncsnapshot"
  else
    echo "  No VNC client on host (pip install vncdotool, or apt install vncsnapshot) — skipping"
    return 1
  fi

  local SERVER="${TIZEN_VNC_SERVER:-}" FWD_PORT="" VNC_CONFIG="sdb-forward"
  if [ -z "$SERVER" ]; then
    FWD_PORT="${TIZEN_VNC_LOCAL_PORT:-15900}"
    if ! "$SDB" -s "$SERIAL" forward "tcp:${FWD_PORT}" "tcp:${TIZEN_VNC_PORT:-5900}" >/dev/null 2>&1; then
      echo "  sdb forward tcp:${FWD_PORT} -> device tcp:${TIZEN_VNC_PORT:-5900} failed — skipping"
      return 1
    fi
    SERVER="127.0.0.1::${FWD_PORT}"
  else
    VNC_CONFIG="env:TIZEN_VNC_SERVER"
  fi
  echo "  VNC server: ${SERVER} (client: ${CLIENT})"
  # Machine line for lib/core/screenshot.js: the server that was tried and
  # how it was configured, so a connection failure can name both in the warning.
  echo "VNC_ATTEMPT=${SERVER}"$'\t'"${VNC_CONFIG}"

  local OUT_TMP STATUS=1
  OUT_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.png)

  if [ "$CLIENT" = "vncdotool" ]; then
    python3 - "$SERVER" "$OUT_TMP" "$VNC_TIMEOUT" <<'PYEOF' && STATUS=0
# --- VNC capture (vncdotool) ---
# This block is byte-identical in tizen-screenshot.sh and tizen-screenshot.ps1;
# common/lib/tests/screenshot-fallbacks.test.js fails when the two drift.
import os, sys, threading
from vncdotool import api

server, out_path, timeout = sys.argv[1], sys.argv[2], float(sys.argv[3])
password = os.environ.get("TIZEN_VNC_PASSWORD") or None
result = {}

def capture():
    try:
        client = api.connect(server, password=password)
        client.captureScreen(out_path)
        client.disconnect()
        result["ok"] = True
    except Exception as exc:
        result["error"] = str(exc) or type(exc).__name__

# vncdotool runs a Twisted reactor in a thread and a dead server can hang the
# connect forever, so bound it here and hard-exit past the reactor.
worker = threading.Thread(target=capture, daemon=True)
worker.start()
worker.join(timeout)
try:
    api.shutdown()
except Exception:
    pass
if not result.get("ok"):
    err = result.get("error", "timed out after %ds" % timeout)
    low = (err or "").lower()
    if "timed out" in low:
        cat = "timeout"
    elif "refused" in low or "reset" in low or "unreachable" in low or "no route" in low:
        cat = "connection_refused"
    elif "auth" in low or "password" in low or "credential" in low or "security" in low:
        cat = "auth_failed"
    else:
        cat = "connection_failed"
    # Machine line for the host script to surface in the envelope; the
    # human-readable line still goes to stderr.
    print("VNC_RESULT=failed\t%s\t%s" % (cat, " ".join(str(err).split())))
    print("  VNC capture failed: " + err, file=sys.stderr)
    os._exit(1)
print("  Captured via vncdotool -> " + out_path)
os._exit(0)
PYEOF
  else
    local JPG_TMP RC=0
    JPG_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.jpg)
    # Bound the connect like the vncdotool path ("${RUN[@]+...}": empty arrays
    # trip `set -u` on bash < 4.4, e.g. macOS /bin/bash).
    local RUN=()
    if command -v timeout &>/dev/null; then RUN=(timeout "$VNC_TIMEOUT"); fi
    ${RUN[@]+"${RUN[@]}"} vncsnapshot -quiet -allowblank "$SERVER" "$JPG_TMP" >/dev/null 2>&1 || RC=$?
    if [ "$RC" -eq 124 ]; then
      echo "VNC_RESULT=failed"$'\t'"timeout"$'\t'"vncsnapshot timed out after ${VNC_TIMEOUT}s"
    elif [ "$RC" -ne 0 ]; then
      echo "VNC_RESULT=failed"$'\t'"connection_failed"$'\t'"vncsnapshot exited ${RC}"
    fi
    if [ "$RC" -eq 0 ] && verify_output "$JPG_TMP"; then
      python3 -c 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "PNG")' "$JPG_TMP" "$OUT_TMP" && STATUS=0
    fi
    rm -f "$JPG_TMP"
  fi

  if [ -n "$FWD_PORT" ]; then
    "$SDB" -s "$SERIAL" forward --remove "tcp:${FWD_PORT}" >/dev/null 2>&1 || true
  fi

  if [ $STATUS -eq 0 ] && verify_output "$OUT_TMP" && accept_capture "$OUT_TMP" "host-side VNC (${CLIENT})"; then
    return 0
  fi

  echo "  VNC capture produced no usable image — skipping"
  rm -f "$OUT_TMP"
  return 1
}

# ============================================================
# Method 4: Host-side xwd on emulator X11 window
#   This is a fallback for Tizen emulators that lack device-side
#   screenshot tools AND where the framebuffer method fails.
#   The emulator renders its GUI on the host's X11 display, so we
#   capture the window directly from the host.
#
#   Steps:
#     a. Find the emulator window via xwininfo -root -tree
#     b. Capture with xwd -id <window_id>
#     c. Convert XWD → PNG using Python PIL
# ============================================================
try_host_xwd() {
  echo "Trying: host-side xwd on emulator X11 window..."

  # Check for required tools
  if ! command -v xwd &>/dev/null; then
    echo "  xwd not found on host — skipping"
    return 1
  fi
  if ! command -v xwininfo &>/dev/null; then
    echo "  xwininfo not found on host — skipping"
    return 1
  fi
  if ! has_pil; then
    echo "  python3 PIL/Pillow not found — skipping"
    return 1
  fi

  local DISPLAY_VAR="${DISPLAY:-:0}"

  # Find the emulator window — look for "Tizen Emulator" or "emulator-x86_64"
  local WIN_ID
  WIN_ID=$(DISPLAY="$DISPLAY_VAR" xwininfo -root -tree 2>/dev/null | \
    grep -iE '"Tizen Emulator"|"emulator-x86_64"' | \
    head -1 | \
    grep -oE '0x[0-9a-fA-F]+' | head -1)

  if [ -z "$WIN_ID" ]; then
    echo "  No emulator X11 window found — skipping"
    return 1
  fi

  echo "  Found emulator window: $WIN_ID"

  local XWD_TMP OUT_TMP
  XWD_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.xwd)
  OUT_TMP=$(mktemp /tmp/tizen_screenshot_XXXXXX.png)

  if ! DISPLAY="$DISPLAY_VAR" xwd -id "$WIN_ID" -out "$XWD_TMP" 2>/dev/null; then
    echo "  xwd capture failed — skipping"
    rm -f "$XWD_TMP" "$OUT_TMP"
    return 1
  fi

  # Convert XWD → PNG using Python PIL (write to temp, not OUTPUT_PATH)
  # For emulator windows, also detect and crop the control panel sidebar
  python3 - "$XWD_TMP" "$OUT_TMP" <<'PYEOF'
import struct, sys
from PIL import Image

xwd_path, png_path = sys.argv[1], sys.argv[2]

with open(xwd_path, 'rb') as f:
    data = f.read()

# Parse XWD file header (all big-endian uint32)
header_size = struct.unpack('>I', data[0:4])[0]
width       = struct.unpack('>I', data[16:20])[0]
height      = struct.unpack('>I', data[20:24])[0]
byte_order  = struct.unpack('>I', data[28:32])[0]  # 0=LSBFirst, 1=MSBFirst
bits_per_pixel = struct.unpack('>I', data[44:48])[0]
bytes_per_line  = struct.unpack('>I', data[48:52])[0]

pixel_data = data[header_size:]

# byte_order=0 (LSBFirst) → little-endian 32-bit pixels → BGRA
# byte_order=1 (MSBFirst) → big-endian 32-bit pixels → ARGB
if byte_order == 0:
    raw_mode = 'BGRA'
else:
    raw_mode = 'ARGB'

img = Image.frombytes('RGBA', (width, height), pixel_data, 'raw', raw_mode, bytes_per_line, 1)

# --- Detect and crop the emulator control panel ---
# The emulator window is [display][control panel] or, when the panel splits the
# display, [left display area][control panel][right display area]. The panel is a
# vertical strip of predominantly light grayscale pixels (R~G~B), so the first
# sustained run of such columns is taken as the panel and removed.
# This block is byte-identical in tizen-screenshot.sh and tizen-screenshot.ps1;
# common/lib/tests/screenshot-postprocess.test.js fails when the two drift.
if width > 100 and height > 100:
    sample_ys = [int(height * (i + 0.5) / 10) for i in range(10)]
    grayscale_threshold = 15
    min_brightness = 80  # Control panel is light gray, not black

    # A control panel is a sidebar, far narrower than the display beside it on every
    # skin the emulator ships, even at the smallest 1/4x scale (TV remote: 134 px next
    # to a 480 px display; general-skin key window next to a 320 px HD720 display). A
    # light or blank app screen passes the same grayscale test, so a matched run wider
    # than this fraction of the window is the app's own screen, not chrome - the frame
    # is kept as captured instead of discarding the display.
    max_panel_fraction = 0.5

    def is_grayscale_column(x):
        count = 0
        for y in sample_ys:
            r, g, b = img.getpixel((x, y))[:3]
            brightness = (r + g + b) / 3
            if brightness >= min_brightness and abs(r - g) < grayscale_threshold and abs(g - b) < grayscale_threshold and abs(r - b) < grayscale_threshold:
                count += 1
        return count / len(sample_ys) >= 0.8

    # Scan left-to-right for the first sustained grayscale region
    control_panel_start = None
    for x in range(width):
        if is_grayscale_column(x):
            sustained = True
            for x2 in range(x, min(x + 20, width)):
                if not is_grayscale_column(x2):
                    sustained = False
                    break
            if sustained:
                control_panel_start = x
                break

    if control_panel_start is not None and control_panel_start < width * 0.95:
        # Find where the control panel ends (first non-grayscale column after the run)
        control_panel_end = width
        for x in range(control_panel_start + 20, width):
            if not is_grayscale_column(x):
                control_panel_end = x
                break

        panel_width = control_panel_end - control_panel_start

        if panel_width > width * max_panel_fraction:
            print(f"  Skipped control panel removal: grayscale run cols {control_panel_start}-{control_panel_end} is {panel_width}px of {width}px (over {max_panel_fraction:.0%}) - too wide for a control panel, likely the app's own light screen")
        elif control_panel_end < width:
            # Display content continues after the panel: the panel splits the display,
            # so stitch right + left (swapped - the right portion is the left of the screen)
            left_part = img.crop((0, 0, control_panel_start, height))
            right_part = img.crop((control_panel_end, 0, width, height))
            new_width = left_part.width + right_part.width
            stitched = Image.new('RGBA', (new_width, height))
            stitched.paste(right_part, (0, 0))
            stitched.paste(left_part, (right_part.width, 0))
            img = stitched
            print(f"  Stitched display (swapped, removed control panel cols {control_panel_start}-{control_panel_end}): {width}x{height} -> {new_width}x{height}")
        else:
            # Control panel reaches the right edge - crop it off
            img = img.crop((0, 0, control_panel_start, height))
            print(f"  Cropped to display area: {width}x{height} -> {control_panel_start}x{height}")


img.save(png_path)
print(f"  Converted: {img.size[0]}x{img.size[1]} → {png_path}")

PYEOF


  local CONVERT_STATUS=$?
  rm -f "$XWD_TMP"

  if [ $CONVERT_STATUS -eq 0 ] && verify_output "$OUT_TMP" && accept_capture "$OUT_TMP" "host-side xwd"; then
    return 0
  fi

  rm -f "$OUT_TMP"
  return 1

}

# ============================================================
# Main: try each method in order
#
# The Tizen emulator renders its GUI on the host's X11 display, not
# on the guest's framebuffer.  Device-side methods (screencapture,
# capture_screen, /dev/fb0) often return "command not found" or only
# capture the kernel boot console on emulator images.
#
# When the target serial starts with "emulator-", we try the host-side
# xwd method first for the most reliable GUI capture.  On physical
# devices we keep the original order (framebuffer first).
# ============================================================
echo "=== Tizen Screenshot ==="

IS_EMULATOR=false
if [[ "$SERIAL" == emulator-* ]]; then
  IS_EMULATOR=true
  echo "Detected: emulator target — after enlightenment_info, host-side xwd is preferred over the device-side capture tools"
fi

# enlightenment_info runs FIRST on both paths. Measured against the same
# emulator frame, it returns the display exactly as the device composited it,
# while the alternatives degrade it:
#
#   enlightenment_info : 1920x1080, no window chrome
#   host-side xwd      :  960x581, emulator title bar and border strips baked
#                         in, control panel removed by a stitching heuristic
#   /dev/fb0           : frequently just the kernel console
#
# It needs root, and `sdb root on` is refused on production images — that case
# returns 1 immediately, so the previous ordering still applies wherever this
# method cannot run.
#
# VNC is the Wayland/HWC (DA appliance) escape hatch: it only runs once every
# on-device method has failed or come back a flat color, and skips at once when
# the host has no VNC client.
if [ "$IS_EMULATOR" = true ]; then
  try_enlightenment_info              && exit 0
  try_host_xwd                        && exit 0
  try_device_capture screencapture    && exit 0
  try_device_capture capture_screen   && exit 0
  try_framebuffer                     && exit 0
  try_vnc                             && exit 0
else
  try_enlightenment_info              && exit 0
  try_framebuffer                     && exit 0
  try_device_capture screencapture    && exit 0
  try_device_capture capture_screen   && exit 0
  try_vnc                             && exit 0
  try_host_xwd                        && exit 0
fi

# No method produced a non-uniform capture. A uniform one is better than
# nothing — it IS a real capture, the screen just looks off/black — so promote
# the stashed fallback and flag it (CAPTURE_WARNING is parsed by
# lib/core/screenshot.js into an envelope warning).
if [ -n "$UNIFORM_FALLBACK" ] && [ -f "$UNIFORM_FALLBACK" ]; then
  mv "$UNIFORM_FALLBACK" "$OUTPUT_PATH"
  echo "WARNING: the capture is a single solid color — the screen may be off or rendering may be broken."
  echo "CAPTURE_WARNING=uniform_image"
  echo "SUCCESS: $UNIFORM_METHOD"
  exit 0
fi

echo "ERROR: All screenshot methods failed." >&2
exit 2
