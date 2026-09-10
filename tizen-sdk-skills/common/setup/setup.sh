#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

#
# tizen-sdk-skills setup and sync — one script for every harness.
#
# Usage:
#   bash common/setup/setup.sh --harness <claude|cline|codex|gemini>
#                              [--repo /path/to/repo] [--skip-validation] [--no-restart]
#
# The per-harness entry points (claude/setup/setup.sh, cline/setup/setup.sh,
# codex/setup/setup.sh, gemini/setup/setup.sh) are two-line wrappers around this.
#
# Flow (host-specific parts come from common/setup/hosts/<harness>.sh):
#   1. Path validation
#   2. Plugin cache sync   repo/common/* -> ~/<dot>/plugins/cache/tizen-platform/tizen-sdk-skills/<VER>/
#   3. Personal copy sync  skills -> the host's skills dir; agents -> host format
#   4. Host extras         hooks / rules / instruction files
#   5. Validation
#   6. Summary
#
# The cache path convention is shared with common/lib/core/plugin-cache.js
# (HOST_DOT_DIRS) and the runner-lookup snippets in agents/ and skills/.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./setup-lib.sh
source "$SCRIPT_DIR/setup-lib.sh"

# ----------------------------------------------------------------------------
# Arguments
# ----------------------------------------------------------------------------
HARNESS=""
REPO_PATH="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKIP_VALIDATION=false
NO_RESTART=false

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --harness)          HARNESS="${2:?--harness requires a value}"; shift 2 ;;
    --repo)             REPO_PATH="${2:?--repo requires a path}"; shift 2 ;;
    --skip-validation)  SKIP_VALIDATION=true; shift ;;
    --no-restart)       NO_RESTART=true; shift ;;
    -h|--help)          usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

HOST_FILE="$SCRIPT_DIR/hosts/$HARNESS.sh"
if [[ -z "$HARNESS" || ! -f "$HOST_FILE" ]]; then
  echo "Error: --harness must be one of: $(ls "$SCRIPT_DIR/hosts" | sed 's/\.sh$//' | tr '\n' ' ')" >&2
  exit 1
fi

REPO_PATH="$(cd "$REPO_PATH" 2>/dev/null && pwd)" || {
  write_status "Repository path not found: $REPO_PATH" "Error"; exit 1
}

# Host module — must define: host_configure, host_install_extras,
# host_validate_extras, host_summary, host_notes.
# shellcheck source=/dev/null
source "$HOST_FILE"
host_configure

# ----------------------------------------------------------------------------
banner "tizen-sdk-skills $HOST_LABEL Setup and Sync"

step 1 "Path validation"
write_status "Repository: $REPO_PATH" "Info"
write_status "$HOST_LABEL user path: $HOST_HOME" "Info"
PLUGIN_VERSION="$(read_plugin_version "$REPO_PATH")" || exit 1
write_status "Plugin version: $PLUGIN_VERSION" "Info"
CACHE_BASE="$HOST_HOME/$CACHE_TAIL/$PLUGIN_VERSION"

step 2 "Plugin cache sync"
[[ -d "$CACHE_BASE" ]] || write_status "Cache directory not found. Creating: $CACHE_BASE" "Warning"
sync_cache "$REPO_PATH" "$CACHE_BASE" "${CACHE_SUBDIRS[@]}"
# The runner lookup only scans the current plugin name; a cache left by a
# pre-rename install is dead weight (and a stale copy of the scripts).
for legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do
  remove_legacy_path "$HOST_HOME/plugins/cache/tizen-platform/$legacy" "plugin cache"
done

step 3 "Personal copy sync (actual loading paths)"
if [[ -n "$SKILLS_DIR" ]]; then
  sync_personal_skills "$COMMON_DIR/skills" "$SKILLS_DIR" "Skill ($HOST_LABEL)"
else
  write_status "$HOST_LABEL loads skills from the cache — no personal copy" "Info"
fi
if [[ "$AGENTS_MODE" != "none" ]]; then
  sync_agents "$AGENTS_MODE" "$COMMON_DIR/agents" "$AGENTS_DIR"
else
  write_status "$HOST_LABEL has no file-based subagents — agents/ not installed" "Info"
fi

step 4 "$HOST_LABEL hooks / instructions"
host_install_extras

if [[ "$SKIP_VALIDATION" != "true" ]]; then
  step 5 "Validation"
  validate_cache "$REPO_PATH" "$CACHE_BASE" "${CACHE_SUBDIRS[@]}"
  [[ -z "$SKILLS_DIR" ]] || validate_personal_skills "$COMMON_DIR/skills" "$SKILLS_DIR" "Skill ($HOST_LABEL)"
  if [[ "$AGENTS_MODE" != "none" ]]; then
    local_count=$(find "$COMMON_DIR/agents" -maxdepth 1 -name "*.md" | wc -l)
    dest_count=$(find "$AGENTS_DIR" -maxdepth 1 \( -name "tizen-*.md" -o -name "tizen-*.toml" \) 2>/dev/null | wc -l)
    if [[ "$local_count" -eq "$dest_count" ]]; then
      write_status "Agents ($AGENTS_MODE): $dest_count/$local_count installed" "Success"
    else
      write_status "Agents ($AGENTS_MODE): $dest_count of $local_count installed in $AGENTS_DIR" "Warning"
    fi
  fi
  host_validate_extras
  echo ""
  echo -e "${GREEN}Validation complete${NC}"
fi

step 6 "Summary"
echo -e "${GREEN}=== Installation complete ===${NC}"
write_status "Plugin cache: $CACHE_BASE" "Info"
[[ -z "$SKILLS_DIR" ]] || write_status "Skills: $SKILLS_DIR" "Info"
[[ "$AGENTS_MODE" == "none" ]] || write_status "Agents ($AGENTS_MODE): $AGENTS_DIR" "Info"
host_summary

if [[ "$NO_RESTART" != "true" ]]; then
  echo ""
  echo -e "${YELLOW}NOTE:${NC}"
  host_notes
fi
echo ""
