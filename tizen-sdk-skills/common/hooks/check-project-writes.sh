#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# PreToolUse hook for tizen-sdk-skills — project-file write guard.
#
# Blocks hand-creating Tizen project files (config.xml, tizen-manifest.xml).
# Observed failure mode (twice): the model skips the tizen-create-project
# skill and scaffolds a "Tizen app" by hand-writing config.xml — bypassing
# the real `tz new` templates, so the result cannot be built/packaged
# properly. Covers the Write tool AND shell-based creation (Bash heredoc /
# redirection, PowerShell Set-Content / Out-File / New-Item).
#
# Policy:
#   - Write tool, NEW config.xml / tizen-manifest.xml  -> DENY (use the skill)
#   - Write tool, EXISTING one                         -> allow (editing a real
#     project's config is legitimate)
#   - Bash/PowerShell command that WRITES one of these files -> DENY always
#     (legitimate edits go through the Read/Edit tools, not shell redirection;
#     a command string gives no reliable path to existence-check)
#
# stdin : {"tool_name":"Write","tool_input":{"file_path":"...","content":"..."},...}
#      or {"tool_name":"Bash"|"PowerShell","tool_input":{"command":"..."},...}
# stdout: deny JSON (same convention as check-tizen-commands.sh)
# exit  : always 0 (deny is signalled via JSON, not exit code)

input="$(cat)"

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# --- Write tool shape: check the file_path -------------------------------
# Extract the file_path JSON string value (consume escape pairs like \\ and \").
fp="$(printf '%s' "$input" | sed -nE 's/.*"file_path"[[:space:]]*:[[:space:]]*"((\\.|[^"\\])*)".*/\1/p')"

if [ -n "$fp" ]; then
  # Unescape JSON backslash pairs so `test -f` sees a real path (C:\\Users -> C:\Users).
  real_path="$(printf '%s' "$fp" | sed 's/\\\\/\\/g')"

  base="$(basename "$real_path" | tr '[:upper:]' '[:lower:]')"

  case "$base" in
    config.xml|tizen-manifest.xml)
      if [ ! -f "$real_path" ]; then
        deny "Do NOT hand-create Tizen project files ($base). A hand-written scaffold bypasses the real tz new templates and will not build/package correctly. Use the tizen-create-project skill instead: it asks the user for type (native/dotnet/webapp), lists real SDK templates via lib/cli/project-manager-cli.js, and creates the project via lib/cli/project-manager-cli.js. Editing an EXISTING project's $base is allowed."
      fi
      ;;
  esac
  exit 0
fi

# --- Bash / PowerShell tool shape: check the command ---------------------
cmd="$(printf '%s' "$input" | sed -nE 's/.*"command"[[:space:]]*:[[:space:]]*"((\\.|[^"\\])*)".*/\1/p')"
[ -n "$cmd" ] || exit 0   # unexpected shape — do not block

# git/gh commands never create project files, but a commit message or PR
# body heredoc MENTIONING config.xml plus a writer word false-positives the
# check below. Skip them.
#
# The git invocation is not always the first token — `cd <project> && git
# commit -m "..."` and `GIT_EDITOR=true git ...` are routine — so strip
# leading `cd <path> &&` and VAR=value prefixes before testing.
# (Kept in sync with the same helper in check-tizen-commands.sh.)
is_git_command() {
  route="$1"
  for _ in 1 2 3 4; do
    before="$route"
    route="$(printf '%s' "$route" | sed -E 's/^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+//')"
    route="$(printf '%s' "$route" | sed -E 's/^[[:space:]]*cd[[:space:]]+(\\+"[^"\\]*\\+"|[^[:space:]&;|]+)[[:space:]]*(&&|;)[[:space:]]*//')"
    [ "$route" = "$before" ] && break
  done
  printf '%s' "$route" | grep -Eq '^[[:space:]]*(git|gh)([[:space:]]|$)'
}

is_git_command "$cmd" && exit 0

# Only care about commands that mention a project file at all.
printf '%s' "$cmd" | grep -Eqi 'config\.xml|tizen-manifest\.xml' || exit 0

# Deny only when the command also WRITES: a redirect whose target is the
# project file (>, >> — heredocs use `cat > file <<EOF` so they match too),
# or a file-writing command/cmdlet anywhere alongside the file name.
# Reading (cat/Get-Content/grep) stays allowed. In the raw JSON-escaped
# command a quoted target appears as >\"config.xml\" — (\\+")? tolerates it.
if printf '%s' "$cmd" | grep -Eqi -e '>+[[:space:]]*(\\+")?[^[:space:]"]*(config\.xml|tizen-manifest\.xml)' \
                                  -e '(^|[^[:alnum:]-])(Set-Content|Out-File|Add-Content|New-Item|tee|touch)([^[:alnum:]-]|$)'; then
  deny "Do NOT create or write Tizen project files (config.xml / tizen-manifest.xml) with shell commands. A hand-written scaffold bypasses the real tz new templates and will not build/package correctly. Use the tizen-create-project skill instead: it lists real SDK templates via lib/cli/project-manager-cli.js, the USER picks one, then lib/cli/project-manager-cli.js creates the project and prints a JSON envelope. To modify an EXISTING project's config, use the Read and Edit tools, not shell redirection."
fi

exit 0
