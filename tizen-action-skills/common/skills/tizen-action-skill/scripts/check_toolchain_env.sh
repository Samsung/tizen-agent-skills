#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Read-only detection of the Tizen Action toolchain (actionc/action2tidl/tidlc).
# This script NEVER installs anything or modifies environment variables —
# it only reports what it finds and, if something is missing, prints the
# exact command to run yourself.
#
# Besides finding the binaries, it asks action2tidl which TIDL protocol it
# emits: a pre-protocol-3 toolchain still generates a stub that builds, but the
# current framework cannot talk to it.

set -u
ok=1

# Resolves a tool the way actionc does: the ACTIONC_* variable wins, else the
# SDK bundle location, else PATH.
resolve_tool() {
  local var="$1" name="$2"
  local val="${!var:-}"
  if [ -n "$val" ]; then
    printf '%s\n' "$val"
  elif [ -x "$HOME/.action-tools/$name" ]; then
    printf '%s\n' "$HOME/.action-tools/$name"
  else
    command -v "$name" 2>/dev/null || true
  fi
}

report_tool() {
  local var="$1" name="$2" path
  path="$(resolve_tool "$var" "$name")"
  if [ -n "${!var:-}" ] && [ ! -x "${!var}" ]; then
    echo "MISSING \$$var is set to '${!var}' but that is not an executable file"
    ok=0
  elif [ -z "$path" ]; then
    echo "MISSING $name: not on PATH and \$$var is not set"
    ok=0
  else
    echo "OK      $name: $path"
  fi
}

echo "== Toolchain binaries =="
if command -v actionc >/dev/null 2>&1; then
  echo "OK      actionc: $(command -v actionc) ($(actionc -v 2>/dev/null | head -n 1))"
else
  echo "MISSING actionc is not on PATH"
  ok=0
fi
report_tool ACTIONC_ACTION2TIDL action2tidl
report_tool ACTIONC_TIDLC tidlc
if [ -z "${ACTIONC_ACTION2TIDL:-}" ] && [ ! -x "$HOME/.action-tools/action2tidl" ]; then
  echo "NOTE    \$ACTIONC_ACTION2TIDL is unset: actionc uses the action2tidl path"
  echo "        built into it. Set it if generation fails to find action2tidl."
fi

echo
echo "== Action/entity data =="
DATA_DIR="${ACTIONC_DATA_DIR:-$HOME/.action-tools/data}"
if [ -d "$DATA_DIR/actions" ] && [ -d "$DATA_DIR/entities" ]; then
  echo "OK      data dir: $DATA_DIR"
  if [ ! -f "$DATA_DIR/action.seq" ]; then
    echo "WARN    no action.seq in the data dir: method ids of default"
    echo "        categories may not match the device"
  fi
else
  echo "MISSING data dir '$DATA_DIR' has no actions/ and entities/"
  echo "        (set \$ACTIONC_DATA_DIR, e.g. to a tizen-action default-actions/)"
  ok=0
fi

echo
echo "== Generation probe (actionc -> action2tidl -> tidlc) =="
# Runs the real pipeline on a throwaway action, so it checks the exact
# action2tidl/tidlc pair actionc resolves, not just what PATH shows.
if command -v actionc >/dev/null 2>&1; then
  probe_dir="$(mktemp -d)"
  mkdir -p "$probe_dir/data/actions" "$probe_dir/data/entities"
  probe_file="$probe_dir/Probe_Probe.Action.Probe_Run.action"
  printf '%s' '{"version":"v2","name":"Probe_Probe.Action.Probe_Run",
    "type":"tidl","category":"Probe.Action.Probe","description":"probe",
    "inputSchema":{"type":"object","properties":{}},
    "outputSchema":{"type":"object","properties":{
      "ok":{"type":"boolean","description":"ok"}}},
    "details":{"appid":"probe"}}' > "$probe_file"
  probe_log="$probe_dir/actionc.log"
  ( cd "$probe_dir" && actionc -d "$probe_dir/data" -i "$probe_file" \
      -l C++ -o "$probe_dir/out" --keep-temp ) > "$probe_log" 2>&1
  probe_status=$?
  kept="$(sed -n 's/^\[actionc\] intermediate files kept in //p' "$probe_log" |
    tail -n 1)"
  protocol=''
  if [ -n "$kept" ] && [ -f "$kept/Probe.Action.Probe.tidl" ]; then
    protocol="$(head -n 1 "$kept/Probe.Action.Probe.tidl")"
  fi
  case "$protocol" in
    "protocol "[3-9]*) ;;
    "protocol "*)
      echo "OUTDATED action2tidl emits '$protocol'; the framework needs"
      echo "        protocol 3. Update the toolchain before generating stubs."
      ok=0 ;;
  esac
  if [ "$probe_status" -eq 0 ] && [ "$ok" -eq 1 ]; then
    echo "OK      actionc generated a stub (${protocol:-protocol unknown})"
  elif [ "$probe_status" -ne 0 ]; then
    echo "FAILED  actionc could not generate a probe stub:"
    grep -v '^Wrote ' "$probe_log" | tail -n 4 | sed 's/^/        /'
    echo "        A mix of toolchain releases is the usual cause (e.g. an older"
    echo "        tidlc first on PATH); point ACTIONC_ACTION2TIDL/ACTIONC_TIDLC"
    echo "        at the binaries shipped with this actionc."
    ok=0
  fi
  [ -n "$kept" ] && rm -rf "$kept"
  rm -rf "$probe_dir"
else
  echo "SKIP    actionc not found"
fi

echo
if [ "$ok" -eq 1 ]; then
  echo "Toolchain looks fully set up."
  echo "Run scripts/list_categories.sh to see the default action categories"
  echo "installed in the data dir."
  exit 0
fi

echo "Toolchain is not fully set up."
echo
echo "This script will NOT install anything for you — installing the toolchain"
echo "persistently modifies your shell profile (~/.bashrc, ~/.profile) or Windows"
echo "user environment variables, which only you should do."
echo
echo "To set it up, either:"
echo "  - run the Tizen Action toolchain bundle's installer yourself:"
echo "      Linux:   ./install.sh   then   source ~/.bashrc"
echo "      Windows: run install.bat, then restart your shell"
echo "  - or build it from the platform/core/appfw/tidl repository"
echo "    (tools/action-toolchain), put actionc/action2tidl/tidlc on PATH, and"
echo "    export ACTIONC_DATA_DIR=<tizen-action>/default-actions"
exit 1
