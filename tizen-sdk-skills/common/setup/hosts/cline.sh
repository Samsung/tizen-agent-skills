# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts/cline.sh — Cline specifics for common/setup/setup.sh (sourced).
#
# Layout: the cache under ~/.cline/… holds only lib/, scripts/, assets/ (CLI
# runners + core logic) — Cline builds with skills support load skills from
# ~/.cline/skills; Cline has no Agent tool, so agents/ is not installed.
# Hooks: a PreToolUse adapter in ~/Documents/Cline/Hooks bridges Cline's hook
# protocol to the shared guard scripts (Cline builds with hooks support,
# macOS/Linux only — check your build; upstream Cline may differ); on Windows
# the same rules are installed as an always-on global Rule instead.

host_configure() {
  HOST_LABEL="Cline"
  HOST_HOME="$HOME/.cline"
  CACHE_SUBDIRS=(scripts lib assets)
  SKILLS_DIR="$HOST_HOME/skills"
  AGENTS_MODE="none"
  AGENTS_DIR=""
  CLINE_HOOKS="$HOME/Documents/Cline/Hooks"
  CLINE_RULES="$HOME/Documents/Cline/Rules"
  CLINE_SRC="$COMMON_DIR/../cline/hooks"
  ADAPTER_DST="$CLINE_HOOKS/PreToolUse"
  GUARD_DIR="$CLINE_HOOKS/$PLUGIN_NAME"
  GUARD_RULE_DST="$CLINE_RULES/$PLUGIN_NAME-guard.md"
}

host_install_extras() {
  local legacy
  mkdir -p "$CLINE_HOOKS"
  # An adapter from a pre-rename install carries the old marker and is ours.
  if [[ -f "$ADAPTER_DST" ]] && ! grep -qE "$MARKER_RE" "$ADAPTER_DST"; then
    # A PreToolUse hook we did not install is already there — do not clobber it.
    write_status "Existing PreToolUse hook (not ours) found - NOT overwriting: $ADAPTER_DST. Merge the tizen guard manually from $CLINE_SRC/PreToolUse" "Warning"
  else
    install_shell_script "$CLINE_SRC/PreToolUse" "$ADAPTER_DST"
    install_shell_script "$COMMON_DIR/hooks/check-tizen-commands.sh" "$GUARD_DIR/check-tizen-commands.sh"
    install_shell_script "$COMMON_DIR/hooks/check-project-writes.sh" "$GUARD_DIR/check-project-writes.sh"
    write_status "Cline PreToolUse hook installed: $ADAPTER_DST" "Success"
    write_status "Enable the hook in the Cline settings UI (requires a Cline build with hooks support; hooks do not run on Windows)" "Info"
    # The adapter now dispatches to GUARD_DIR; the previous name's copy is dead.
    for legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do
      remove_legacy_path "$CLINE_HOOKS/$legacy" "Cline guard dir"
    done
  fi

  # Windows fallback / macOS-Linux complement: the Korean, Cline-specific rule.
  mkdir -p "$CLINE_RULES"
  cp "$CLINE_SRC/$PLUGIN_NAME-guard.md" "$GUARD_RULE_DST"
  write_status "Cline guard rule installed (always-on; Windows fallback for the hook): $GUARD_RULE_DST" "Success"
  # Rules are always-on: a leftover rule under the old name would keep telling
  # Cline to look for runners in the old cache path.
  for legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do
    remove_legacy_path "$CLINE_RULES/$legacy-guard.md" "Cline guard rule"
  done

  write_status "Subagents are built into Cline builds that support them (check your build) - enable: Settings > Feature Settings > Agent > Subagents" "Info"
  write_status "Subagents are read-only researchers and can load the installed tizen skills via use_skill" "Info"
  write_status "State-changing runners (build/install/debug) run in the MAIN agent, not in subagents" "Info"
}

host_validate_extras() {
  local ok=true g
  if [[ ! -x "$ADAPTER_DST" ]]; then
    write_status "Cline hooks : PreToolUse missing or not executable - $ADAPTER_DST" "Warning"; ok=false
  fi
  for g in check-tizen-commands.sh check-project-writes.sh; do
    [[ -f "$GUARD_DIR/$g" ]] || { write_status "Cline hooks : File missing - $GUARD_DIR/$g" "Warning"; ok=false; }
  done
  [[ -f "$GUARD_RULE_DST" ]] || { write_status "Cline hooks : Guard rule missing - $GUARD_RULE_DST" "Warning"; ok=false; }
  [[ "$ok" == "true" ]] && write_status "Cline hooks : Validation passed" "Success"
}

host_summary() {
  write_status "Cline hooks: $CLINE_HOOKS - macOS/Linux ONLY (inert on Windows); enable in Cline settings" "Info"
  write_status "Cline guard rule (Windows fallback - always-on instructions): $GUARD_RULE_DST" "Info"
}

host_notes() {
  echo -e "${YELLOW} - Cline: no restart needed (skills/rules are scanned per session);${NC}"
  echo -e "${YELLOW}   enable Hooks and Subagents once in the Cline settings UI.${NC}"
}
