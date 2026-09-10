# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts/claude.sh — Claude Code specifics for common/setup/setup.sh (sourced).
#
# Layout: ~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<VER>/ holds the
# full plugin (skills/ + agents/ included — Claude Code delegates via the Agent
# tool). Personal copies in ~/.claude/skills and ~/.claude/agents are the actual
# loading paths when marketplace policy blocks the plugin (strictKnownMarketplaces
# workaround). Hooks: the guard scripts are copied to the version-independent
# ~/.claude/hooks/tizen-sdk-skills/ and registered as PreToolUse entries in
# ~/.claude/settings.json by common/lib/tools/merge-hooks-json.js (all three
# hooks from common/hooks/hooks.json). The merge never touches entries that are
# not ours; if settings.json cannot be parsed (or has a wrong-shaped hooks
# section) it is left untouched and the snippet is printed for a manual merge.

host_configure() {
  HOST_LABEL="Claude Code"
  HOST_HOME="$HOME/.claude"
  CACHE_SUBDIRS=(skills agents scripts lib assets)
  SKILLS_DIR="$HOST_HOME/skills"
  AGENTS_MODE="md"
  AGENTS_DIR="$HOST_HOME/agents"
  SETTINGS_FILE="$HOST_HOME/settings.json"
  HOOKS_DIR="$HOST_HOME/hooks/$PLUGIN_NAME"
}

# The three PreToolUse entries from common/hooks/hooks.json, pointing at the
# version-independent hook dir. Paths are POSIX: the command runs via bash.
_claude_hook_entries() {
  local dir; dir="$(printf '%s' "$HOOKS_DIR" | sed 's|\\|/|g')"
  cat <<EOF
[
  {
    "matcher": "Bash|PowerShell",
    "hooks": [{ "type": "command",
      "command": "bash \"$dir/check-tizen-commands.sh\"" }]
  },
  {
    "matcher": "Write|Bash|PowerShell",
    "hooks": [{ "type": "command",
      "command": "bash \"$dir/check-project-writes.sh\"" }]
  },
  {
    "matcher": "Skill",
    "hooks": [{ "type": "command",
      "command": "bash \"$dir/check-skill-routing.sh\"" }]
  }
]
EOF
}

host_install_extras() {
  local h
  for h in check-tizen-commands.sh check-project-writes.sh check-skill-routing.sh; do
    install_shell_script "$COMMON_DIR/hooks/$h" "$HOOKS_DIR/$h"
  done
  write_status "Hook scripts installed (version-independent path): $HOOKS_DIR" "Success"

  # Register the entries in settings.json. The merge tool replaces our previous
  # entries (recognised by command path or the legacy _source tag) instead of
  # duplicating them, keeps everyone else's, and saves a one-time pristine
  # backup. It refuses to touch a file it cannot parse or whose hooks section
  # has the wrong shape — then the snippet below is the manual fallback.
  local merged=false
  if command -v node >/dev/null 2>&1; then
    if _claude_hook_entries | node "$COMMON_DIR/lib/tools/merge-hooks-json.js" \
        --file "$SETTINGS_FILE" --event PreToolUse --entries-file -; then
      write_status "All 3 hooks registered in $SETTINGS_FILE (hooks.PreToolUse)" "Success"
      merged=true
    else
      write_status "Could not merge hooks into $SETTINGS_FILE - merge the snippet below by hand" "Warning"
      _claude_print_snippet
    fi
  else
    write_status "node not found - cannot merge hooks into $SETTINGS_FILE automatically" "Warning"
    _claude_print_snippet
  fi

  # Only once the settings entries point at HOOKS_DIR is a pre-rename hook dir
  # dead. If the merge fell back to the snippet, settings.json may still
  # reference the old dir — deleting it would break the hooks that work today.
  local legacy
  for legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do
    if [[ "$merged" == "true" ]]; then
      remove_legacy_path "$HOST_HOME/hooks/$legacy" "Claude Code hook dir"
    elif [[ -e "$HOST_HOME/hooks/$legacy" ]]; then
      write_status "Kept legacy hook dir $HOST_HOME/hooks/$legacy - remove it after repointing $SETTINGS_FILE to $HOOKS_DIR" "Warning"
    fi
  done
}

_claude_print_snippet() {
  echo ""
  echo -e "${YELLOW}  Merge this into $SETTINGS_FILE -> hooks.PreToolUse:${NC}"
  _claude_hook_entries | sed -n '2,$p' | sed '$d'   # strip the JSON array brackets
}

host_validate_extras() {
  local ok=true h
  for h in check-tizen-commands.sh check-project-writes.sh check-skill-routing.sh; do
    [[ -f "$HOOKS_DIR/$h" ]] || { write_status "Claude hooks : File missing - $HOOKS_DIR/$h" "Warning"; ok=false; }
  done
  if [[ -f "$SETTINGS_FILE" ]]; then
    for h in check-tizen-commands.sh check-project-writes.sh check-skill-routing.sh; do
      grep -qF "$h" "$SETTINGS_FILE" || {
        write_status "Claude hooks : $SETTINGS_FILE does not reference $h" "Warning"; ok=false; }
    done
  else
    write_status "Claude hooks : $SETTINGS_FILE not found" "Warning"; ok=false
  fi
  [[ "$ok" == "true" ]] && write_status "Claude hooks : Validation passed" "Success"
}

host_summary() {
  write_status "Hooks: $HOOKS_DIR + entries in $SETTINGS_FILE (hooks.PreToolUse)" "Info"
}

host_notes() {
  echo -e "${YELLOW} - Restart the Claude Code session to load the new skill/agent definitions and hooks.${NC}"
  echo -e "${YELLOW} - If marketplace policy blocks the plugin, the personal copies (Step 3) are used.${NC}"
}
