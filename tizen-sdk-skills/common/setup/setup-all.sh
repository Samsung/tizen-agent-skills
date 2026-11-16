#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

#
# Install tizen-sdk-skills for Claude Code, Cline, Codex CLI and Gemini CLI in one go.
#
# Usage:
#   bash common/setup/setup-all.sh [--repo /path/to/repo] [--skip-validation] [--no-restart]
#
# Runs common/setup/setup.sh once per harness with the same options. A failed
# harness does not stop the others; the exit code is 1 if any of them failed.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESSES=(claude cline codex gemini)

for arg in "$@"; do
  case "$arg" in
    -h|--help) sed -n '6,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --harness) echo "Error: setup-all.sh installs every harness; use setup.sh --harness <name> for one." >&2; exit 1 ;;
  esac
done

# Every host gets this checkout's version, so the shared-skills version
# warning (warn_shared_skills_peer) would only be noise here.
export TIZEN_SETUP_ALL=1
failed=()
for harness in "${HARNESSES[@]}"; do
  bash "$SCRIPT_DIR/setup.sh" --harness "$harness" "$@" || failed+=("$harness")
done

echo ""
echo "=== setup-all summary ==="
for harness in "${HARNESSES[@]}"; do
  if [[ " ${failed[*]-} " == *" $harness "* ]]; then
    echo "  [FAIL] $harness"
  else
    echo "  [ OK ] $harness"
  fi
done

[[ ${#failed[@]} -eq 0 ]]
