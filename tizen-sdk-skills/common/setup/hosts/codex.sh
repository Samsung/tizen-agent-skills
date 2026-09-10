# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts/codex.sh — OpenAI Codex CLI specifics for common/setup/setup.sh (sourced).
#
# Surfaces (learn.chatgpt.com/docs, verified 2026-09-03):
#   config   ~/.codex/  ($CODEX_HOME)            — NOT ~/.chatgpt
#   skills   ~/.agents/skills/<name>/SKILL.md    (shared with Gemini CLI)
#   agents   ~/.codex/agents/*.toml              (name/description/developer_instructions)
#   hooks    ~/.codex/hooks.json — SAME 3-level JSON as Claude Code, shell tool
#            is literally "Bash", deny JSON identical -> guards run unmodified.
#            User must trust hooks once via /hooks; features.hooks may be off.
#   context  ~/.codex/AGENTS.md (global instructions, 32 KiB cap)
#   marker   CODEX_THREAD_ID / CODEX_SESSION_ID / CODEX_VERSION (injected into
#            every exec by newer builds), CODEX_SANDBOX_NETWORK_DISABLED=1 (default
#            sandbox), CODEX_SANDBOX=seatbelt (macOS) — see HOST_MARKERS in
#            common/lib/core/plugin-cache.js. The AGENTS.md guard section also
#            names this host's cache root explicitly (host_install_extras).
# Cache: ~/.codex/plugins/cache/tizen-platform/tizen-sdk-skills/<VER> — the
# shared convention (it also matches Codex's own plugin-cache shape).

host_configure() {
  HOST_LABEL="Codex CLI"
  HOST_HOME="${CODEX_HOME:-$HOME/.codex}"
  CACHE_SUBDIRS=(skills agents scripts lib assets)
  SKILLS_DIR="$HOME/.agents/skills"
  AGENTS_MODE="toml"
  AGENTS_DIR="$HOST_HOME/agents"
  HOOKS_DIR="$HOST_HOME/hooks/$PLUGIN_NAME"
  HOOKS_JSON="$HOST_HOME/hooks.json"
  CONTEXT_FILE="$HOST_HOME/AGENTS.md"
}

_codex_hooks_json() {
  cat <<EOF
{
  "_source": "$PLUGIN_NAME",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command",
          "command": "bash \"$HOOKS_DIR/check-tizen-commands.sh\"" }]
      },
      {
        "matcher": "Write|Bash|apply_patch",
        "hooks": [{ "type": "command",
          "command": "bash \"$HOOKS_DIR/check-project-writes.sh\"" }]
      }
    ]
  }
}
EOF
}

host_install_extras() {
  install_shell_script "$COMMON_DIR/hooks/check-tizen-commands.sh" "$HOOKS_DIR/check-tizen-commands.sh"
  install_shell_script "$COMMON_DIR/hooks/check-project-writes.sh" "$HOOKS_DIR/check-project-writes.sh"
  write_status "Guard scripts installed: $HOOKS_DIR" "Success"

  # A hooks.json tagged with the pre-rename "_source" is ours too: rewrite it,
  # then drop the guard-script dir it pointed at.
  local legacy
  if [[ ! -f "$HOOKS_JSON" ]] || grep -qE "\"($MARKER_RE)\"" "$HOOKS_JSON"; then
    _codex_hooks_json > "$HOOKS_JSON"
    write_status "Codex hooks written: $HOOKS_JSON" "Success"
    for legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do
      remove_legacy_path "$HOST_HOME/hooks/$legacy" "Codex guard dir"
    done
  else
    write_status "Existing $HOOKS_JSON (not ours) found - NOT overwriting. Merge this into its hooks.PreToolUse:" "Warning"
    _codex_hooks_json | sed -n '/"PreToolUse"/,/^    \]/p'
  fi

  # The shared guard rules name every host's cache; only the installer knows
  # which one is THIS host's (CODEX_HOME may be non-default), so pin it here.
  install_guard_section "$CONTEXT_FILE" "$COMMON_DIR/hooks/$PLUGIN_NAME-guard.md" "AGENTS.md guard" \
    "$(_codex_guard_extra)"
}

_codex_guard_extra() {
  cat <<EOF
**This host is Codex CLI.** Its tizen-sdk-skills runner cache is
\`$HOST_HOME/$CACHE_TAIL/<version>/lib/cli/\` — look there first (rule 8); use
another host's \`~/.claude\`, \`~/.cline\` or \`~/.gemini\` copy only if this one is
missing. Codex spawns PowerShell on Windows: use the skill's PowerShell lookup
snippet there, and the bash one elsewhere.

**Codex exec waits at most 30 s per call.** Pass \`yield_time_ms: 30000\` on every runner
call; run \`launch\`, \`create --launch\`, builds, app installs, dotnet-setup, debug setup,
Playwright runs and large file transfers with \`--background\` (every runner accepts it;
\`status\` shows the live script log); for installs and
updates run the pre-check's \`suggested_fix.background_command\` (with escalated
permissions — it downloads). Then poll \`node <same lib/cli dir>/job-cli.js wait --id <job_id>\`
until \`job.state\` is \`done\` (guard rule 11). A result that is only a \`[tizen-…]\` progress
line is not a result — the runner is still running.

**Codex sandbox (guard rule 12).** The default workspace-write sandbox blocks TCP sockets,
writes outside the workspace (\`<sdk>\`, \`<sdk>-data\`) and, on Linux, kills detached jobs
when the call ends. Run sdb / em-cli / certificate actions, project \`list-templates\` and
\`create\` (they read and sync templates under \`<sdk>\` — sandboxed, they list nothing),
dotnet-setup and EVERY \`--background\` job or \`job-cli.js run --script\` **with escalated
permissions**, keeping the command line unchanged. A \`sandbox_blocked\` / \`sandbox_job_lost\`
envelope is not a tool failure — re-run its \`suggested_fix.command\` (your own command,
\`escalate: true\`) escalated.
EOF
}

host_validate_extras() {
  local ok=true g
  for g in check-tizen-commands.sh check-project-writes.sh; do
    [[ -f "$HOOKS_DIR/$g" ]] || { write_status "Codex hooks : File missing - $HOOKS_DIR/$g" "Warning"; ok=false; }
  done
  grep -q "check-tizen-commands.sh" "$HOOKS_JSON" 2>/dev/null || { write_status "Codex hooks : $HOOKS_JSON does not reference the guard" "Warning"; ok=false; }
  grep -qF "tizen-sdk-skills:begin" "$CONTEXT_FILE" 2>/dev/null || { write_status "AGENTS.md : guard section missing - $CONTEXT_FILE" "Warning"; ok=false; }
  grep -qF "This host is Codex CLI" "$CONTEXT_FILE" 2>/dev/null || { write_status "AGENTS.md : Codex cache-root line missing - $CONTEXT_FILE" "Warning"; ok=false; }
  grep -qF "sandbox_blocked" "$CONTEXT_FILE" 2>/dev/null || { write_status "AGENTS.md : Codex sandbox/escalation guidance (rule 12) missing - $CONTEXT_FILE" "Warning"; ok=false; }
  grep -qF "job-cli.js wait" "$CONTEXT_FILE" 2>/dev/null || { write_status "AGENTS.md : Codex 30 s / --background guidance missing - $CONTEXT_FILE" "Warning"; ok=false; }
  [[ "$ok" == "true" ]] && write_status "Codex hooks/context : Validation passed" "Success"
}

host_summary() {
  write_status "Codex hooks: $HOOKS_JSON -> $HOOKS_DIR" "Info"
  write_status "Codex context: $CONTEXT_FILE (tizen-sdk-skills section)" "Info"
}

host_notes() {
  echo -e "${YELLOW} - Restart Codex; run /hooks once to TRUST the new hooks (untrusted hooks are skipped).${NC}"
  echo -e "${YELLOW} - If hooks stay inert, add to ~/.codex/config.toml:  [features]  hooks = true${NC}"
  echo -e "${YELLOW} - Hooks run via bash — on Windows, Git Bash must be on PATH.${NC}"
  echo -e "${YELLOW} - Check with /skills and /agent; skills are read from ~/.agents/skills.${NC}"
}
