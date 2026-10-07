#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Read-only detection of the Tizen Action toolchain (actionc/action2tidl/tidlc).
# This script NEVER installs anything or modifies environment variables —
# it only reports what it finds and, if something is missing, prints the
# exact command to run yourself.

set -u
ok=1

check_bin() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    echo "OK      $name found on PATH: $(command -v "$name")"
  else
    echo "MISSING $name is not on PATH"
    ok=0
  fi
}

check_env() {
  local var="$1"
  local default="${2:-}"
  local val="${!var:-}"
  if [ -z "$val" ] && [ -n "$default" ]; then
    if [ -e "$default" ]; then
      echo "OK      \$$var is not set, but its default location exists: $default"
      return
    fi
    echo "MISSING \$$var is not set, and its default location doesn't exist either: $default"
    ok=0
    return
  fi
  if [ -z "$val" ]; then
    echo "MISSING \$$var is not set"
    ok=0
  elif [ ! -e "$val" ]; then
    echo "MISSING \$$var is set to '$val' but that path does not exist"
    ok=0
  else
    echo "OK      \$$var = $val"
  fi
}

echo "== Binaries on PATH =="
check_bin actionc
check_bin action2tidl
check_bin tidlc

echo
echo "== Environment variables (each falls back to a default under \$HOME/.action-tools if unset) =="
check_env ACTIONC_DATA_DIR "$HOME/.action-tools/data"
check_env ACTIONC_ACTION2TIDL "$HOME/.action-tools/action2tidl"
check_env ACTIONC_TIDLC "$HOME/.action-tools/tidlc"

echo
if [ "$ok" -eq 1 ]; then
  echo "Toolchain looks fully set up."
  echo "Run ./list_categories.sh to see the default action categories actually"
  echo "installed on this machine (read live from \$ACTIONC_DATA_DIR)."
  exit 0
else
  echo "Toolchain is not fully set up."
  echo
  echo "This script will NOT install anything for you — installing the toolchain"
  echo "persistently modifies your shell profile (~/.bashrc, ~/.profile) or Windows"
  echo "user environment variables, which only you should do."
  echo
  echo "To install (from the TizenActionToolchain repo):"
  echo "  Linux:   ./install.sh   then   source ~/.bashrc"
  echo "  Windows: run install.bat, then restart your shell"
  exit 1
fi
