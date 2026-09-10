#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# t-cli.sh — unified convenience CLI for the Tizen SDK agent scripts (Linux/macOS/WSL2).
#
# A thin dispatcher: it maps an action to the matching script under scripts/<name>/
# and forwards the remaining arguments verbatim.
# It does NOT reimplement any logic — the real work stays in the per-feature scripts.
#
# Usage:
#   t-cli <action> [options...]
#   t-cli build -w /path/to/project -b Debug
#   t-cli create --type native --template ServiceApp --name MyApp
#   t-cli --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
  cat <<'EOF'

t-cli — Tizen SDK helper CLI (wraps the per-feature scripts)

Usage: t-cli <action> [options]

Actions:
  install         Install the Tizen SDK + platform packages
  update-package  Update installed Tizen SDK packages
  dotnet-setup    Verify the .NET SDK and install the Tizen workload
  create          Create a Tizen project (native / dotnet / webapp)
  build           Build + package a project      (e.g. -w <dir> -b Debug)
  device          Find a device or launch an emulator
  app-install     Install a .tpk / .wgt package  (e.g. -p <absolute-path>)
  debug           Remote GDB debug a native app
  screenshot      Capture a screenshot from emulator/device


Run 't-cli <action> --help' for action-specific options (forwarded to the script).
EOF
}

action="${1:-}"
shift 2>/dev/null || true

run() {  # $1 = relative script path under SCRIPT_DIR
  local target="$SCRIPT_DIR/$1"
  shift  # drop the script path so only the action's options are forwarded
  if [ ! -f "$target" ]; then
    echo "t-cli: script not found: $target" >&2
    exit 1
  fi
  exec bash "$target" "$@"
}

case "$action" in
  ""|-h|--help|help)
    show_help; exit 0 ;;
  install)      run "tizen-sdk-install/tizen-sdk-install.sh" "$@" ;;
  update-package) run "tizen-update-package/tizen-update-package.sh" "$@" ;;
  dotnet-setup) run "tizen-dotnet-setup/tizen-dotnet-setup.sh" "$@" ;;
  create)       run "tizen-create-project/tizen-create-project.sh" "$@" ;;
  build)        run "tizen-build-project/tizen-build-project.sh" "$@" ;;
  device)       run "tizen-device-manager/tizen-device-manager.sh" "$@" ;;
  app-install)  run "tizen-install-app/tizen-install-app.sh" "$@" ;;
  debug)        run "tizen-gdb-debug/tizen-native-gdb-debug.sh" "$@" ;;
  screenshot)   run "tizen-screenshot/tizen-screenshot.sh" "$@" ;;
  *)
    echo "t-cli: unknown action '$action'" >&2
    show_help
    exit 1 ;;
esac
