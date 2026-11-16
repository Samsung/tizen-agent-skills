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
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HARNESSES=(claude cline codex gemini)

# Checked once here, so a typo is one error instead of four failed runs.
args=("$@")
repo_given=false
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --repo) i=$((i + 1))
            [[ "$repo_given" == false ]] || { echo "Error: the repo path is given twice" >&2; exit 1; }
            repo_given=true
            [[ -n "${args[i]-}" && -f "${args[i]}/common/.claude-plugin/plugin.json" ]] ||
              { echo "Error: --repo must be the tizen-sdk-skills folder (with common/.claude-plugin/plugin.json), got: '${args[i]-}'" >&2; exit 1; } ;;
    --skip-validation|--no-restart) ;;
    -h|--help) sed -n '6,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --harness|--harness=*) echo "Error: setup-all.sh installs every harness; use setup.sh --harness <name> for one." >&2; exit 1 ;;
    *) echo "Error: unknown option: ${args[i]}" >&2; exit 1 ;;
  esac
done

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

if [[ ${#failed[@]} -gt 0 ]]; then
  echo "  Fix the errors above, then re-run setup-all or each failed setup:"
  for harness in "${failed[@]}"; do
    echo "    bash \"$PLUGIN_DIR/$harness/setup/setup.sh\""
  done
fi

[[ ${#failed[@]} -eq 0 ]]
