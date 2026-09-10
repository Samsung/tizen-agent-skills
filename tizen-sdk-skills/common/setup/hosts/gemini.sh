# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts/gemini.sh — Gemini CLI specifics for common/setup/setup.sh (sourced).
#
# Surfaces (geminicli.com/docs, verified 2026-09-03):
#   skills   ~/.gemini/skills/<name>/SKILL.md   (Agent Skills standard)
#   agents   ~/.gemini/agents/*.md              (YAML name/description/tools/max_turns)
#   hooks    ~/.gemini/settings.json -> hooks.BeforeTool[...]; stdin carries
#            tool_name + tool_input, deny = stdout {"decision":"deny","reason":…}
#   context  ~/.gemini/GEMINI.md (global instructions)
#   marker   GEMINI_CLI=1 in spawned shells (used by the runner-lookup snippets)
# The cache keeps the shared ~/<dot>/plugins/cache/tizen-platform/tizen-sdk-skills/<VER>
# convention so plugin-cache.js and the SKILL.md snippets find the runners.

host_configure() {
  HOST_LABEL="Gemini CLI"
  HOST_HOME="$HOME/.gemini"
  CACHE_SUBDIRS=(skills agents scripts lib assets)
  SKILLS_DIR="$HOST_HOME/skills"
  AGENTS_MODE="gemini-md"
  AGENTS_DIR="$HOST_HOME/agents"
  SETTINGS_FILE="$HOST_HOME/settings.json"
  HOOKS_DIR="$HOST_HOME/hooks/$PLUGIN_NAME"
  ADAPTER_SRC="$COMMON_DIR/../gemini/hooks/BeforeTool"
  ADAPTER_DST="$HOOKS_DIR/BeforeTool"
  CONTEXT_FILE="$HOST_HOME/GEMINI.md"
}

# The BeforeTool entry for settings.json, pointing at the adapter. Paths are
# POSIX: the command runs via bash.
_gemini_hook_entries() {
  local dir; dir="$(printf '%s' "$ADAPTER_DST" | sed 's|\\|/|g')"
  cat <<EOF
[
  {
    "matcher": "run_shell_command|write_file|replace",
    "hooks": [{ "name": "$PLUGIN_NAME-guard", "type": "command",
      "command": "bash \"$dir\"", "timeout": 5000 }]
  }
]
EOF
}


host_install_extras() {
  # Hook adapter + the two guards it dispatches to. The adapter maps Gemini's
  # tool names (run_shell_command / write_file / replace) onto the Bash / Write
  # payload the shared guards expect and converts their deny JSON to Gemini's.
  install_shell_script "$ADAPTER_SRC" "$ADAPTER_DST"
  install_shell_script "$COMMON_DIR/hooks/check-tizen-commands.sh" "$HOOKS_DIR/check-tizen-commands.sh"
  install_shell_script "$COMMON_DIR/hooks/check-project-writes.sh" "$HOOKS_DIR/check-project-writes.sh"
  write_status "Gemini BeforeTool hook installed: $ADAPTER_DST" "Success"

  # Register the BeforeTool entry in settings.json. The merge tool replaces our
  # previous entries (recognised by command path or the legacy _source tag)
  # instead of duplicating them, keeps everyone else's, and saves a one-time
  # pristine backup. It refuses to touch a file it cannot parse or whose hooks
  # section has the wrong shape — then the snippet below is the manual fallback.
  local merged=false
  if command -v node >/dev/null 2>&1; then
    if _gemini_hook_entries | node "$COMMON_DIR/lib/tools/merge-hooks-json.js" \
        --file "$SETTINGS_FILE" --event BeforeTool --entries-file -; then
      write_status "BeforeTool hook registered in $SETTINGS_FILE (hooks.BeforeTool)" "Success"
      merged=true
    else
      write_status "Could not merge the hook into $SETTINGS_FILE - merge the snippet below by hand" "Warning"
      _gemini_print_snippet
    fi
  else
    write_status "node not found - cannot merge the hook into $SETTINGS_FILE automatically" "Warning"
    _gemini_print_snippet
  fi

  # Only once the settings entry points at HOOKS_DIR is a pre-rename adapter dir
  # dead. If the merge fell back to the snippet, settings.json may still
  # reference the old dir — deleting it would break the hook that works today.
  local legacy
  for legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do
    if [[ "$merged" == "true" ]]; then
      remove_legacy_path "$HOST_HOME/hooks/$legacy" "Gemini hook dir"
    elif [[ -e "$HOST_HOME/hooks/$legacy" ]]; then
      write_status "Kept legacy hook dir $HOST_HOME/hooks/$legacy - remove it after repointing the \"$legacy-guard\" entry in $SETTINGS_FILE" "Warning"
    fi
  done

  # Always-on instructions (complement the hook; the only guard if the settings
  # merge above had to fall back to the manual snippet).
  install_guard_section "$CONTEXT_FILE" "$COMMON_DIR/hooks/$PLUGIN_NAME-guard.md" "GEMINI.md guard"
}

# Same entry the merge tool receives, so the printed snippet can never drift
# from what the automatic path writes.
_gemini_print_snippet() {
  echo ""
  echo -e "${YELLOW}  Merge this into $SETTINGS_FILE -> \"hooks\":${NC}"
  echo '  "BeforeTool": '
  _gemini_hook_entries
  echo ""
}


host_validate_extras() {
  local ok=true g
  [[ -x "$ADAPTER_DST" ]] || { write_status "Gemini hooks : BeforeTool missing or not executable - $ADAPTER_DST" "Warning"; ok=false; }
  for g in check-tizen-commands.sh check-project-writes.sh; do
    [[ -f "$HOOKS_DIR/$g" ]] || { write_status "Gemini hooks : File missing - $HOOKS_DIR/$g" "Warning"; ok=false; }
  done
  grep -q "BeforeTool" "$SETTINGS_FILE" 2>/dev/null && grep -q "$ADAPTER_DST" "$SETTINGS_FILE" 2>/dev/null || {
    write_status "Gemini hooks : $SETTINGS_FILE does not reference the BeforeTool adapter" "Warning"; ok=false; }
  grep -qF "tizen-sdk-skills:begin" "$CONTEXT_FILE" 2>/dev/null || { write_status "GEMINI.md : guard section missing - $CONTEXT_FILE" "Warning"; ok=false; }
  [[ "$ok" == "true" ]] && write_status "Gemini hooks/context : Validation passed" "Success"
}

host_summary() {
  write_status "Gemini hooks: $HOOKS_DIR + entry in $SETTINGS_FILE (hooks.BeforeTool)" "Info"
  write_status "Gemini context: $CONTEXT_FILE (tizen-sdk-skills section)" "Info"
}


host_notes() {
  echo -e "${YELLOW} - Restart Gemini CLI; check with /skills list and /agents.${NC}"
  echo -e "${YELLOW} - Hooks run via bash — on Windows, Git Bash must be on PATH.${NC}"
  echo -e "${YELLOW} - Agent 'tools' names were mapped Claude->Gemini by agent-convert.js; if /agents rejects one, report the name.${NC}"
}
