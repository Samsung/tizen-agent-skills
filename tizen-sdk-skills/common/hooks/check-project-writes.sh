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
# commit -m "..."` and `GIT_EDITOR=true git ...` are routine. The exemption
# must still cover ONLY git: split on unquoted && || ; | and newlines and
# exempt only when every simple command is git/gh, a cd, or a bare VAR=value
# (a `git … && echo x > config.xml` used to skip the rules entirely).
# (Kept in sync with the same helper in check-tizen-commands.sh.)
is_git_command() {
  printf '%s' "$1" | awk '
    function segment_ok(seg,    k) {
      gsub(/^[[:space:](]+/, "", seg)
      gsub(/[[:space:])]+$/, "", seg)
      if (seg == "") return 1
      for (k = 0; k < 4; k++) {
        if (!sub(/^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+/, "", seg)) break
      }
      if (seg ~ /^(git|gh)([[:space:]]|$)/) return 1
      if (seg ~ /^cd([[:space:]]|$)/) return 1
      if (seg ~ /^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*$/) return 1
      return 0
    }
    function flush() { if (!segment_ok(buf)) bad = 1; buf = "" }
    BEGIN { buf = ""; bad = 0; sq = 0; dq = 0 }
    {
      line = $0; n = length(line); i = 1
      while (i <= n) {
        c = substr(line, i, 1)
        if (c == "\\" && i < n) {
          d = substr(line, i + 1, 1)
          if (d == "\"" && !sq) { dq = !dq; buf = buf c d; i += 2; continue }
          if (d == "n" && !sq && !dq) { flush(); i += 2; continue }
          buf = buf c d; i += 2; continue
        }
        if (c == "\047" && !dq) { sq = !sq; buf = buf c; i++; continue }
        if (c == "\"" && !sq) { dq = !dq; buf = buf c; i++; continue }
        if (!sq && !dq && (c == ";" || c == "|" || c == "&")) {
          prev = (i > 1) ? substr(line, i - 1, 1) : ""
          nxt = (i < n) ? substr(line, i + 1, 1) : ""
          if (c == "&" && (prev == ">" || nxt == ">")) { buf = buf c; i++; continue }
          flush(); i++; continue
        }
        buf = buf c; i++
      }
      flush()
    }
    END { exit bad ? 1 : 0 }
  '
}

is_git_command "$cmd" && exit 0

# Only care about commands that mention a project file at all.
printf '%s' "$cmd" | grep -Eqi 'config\.xml|tizen-manifest\.xml' || exit 0

# Deny only when the command also WRITES: a redirect whose target is the
# project file (>, >> — heredocs use `cat > file <<EOF` so they match too),
# or a file-writing command/cmdlet whose argument list (up to the next
# separator) names the project file. Reading (cat/Get-Content/grep) stays
# allowed, and so does a writer aimed at some OTHER file in the same line —
# `cat config.xml && touch notes.txt` used to be denied because the writer
# word merely co-occurred with the file name. In the raw JSON-escaped
# command a quoted target appears as >\"config.xml\" — (\\+")? tolerates it.
if printf '%s' "$cmd" | grep -Eqi -e '>+[[:space:]]*(\\+")?[^[:space:]"]*(config\.xml|tizen-manifest\.xml)' \
                                  -e '(^|[^[:alnum:]-])(Set-Content|Out-File|Add-Content|New-Item|tee|touch)[^;&|]*(config\.xml|tizen-manifest\.xml)'; then
  deny "Do NOT create or write Tizen project files (config.xml / tizen-manifest.xml) with shell commands. A hand-written scaffold bypasses the real tz new templates and will not build/package correctly. Use the tizen-create-project skill instead: it lists real SDK templates via lib/cli/project-manager-cli.js, the USER picks one, then lib/cli/project-manager-cli.js creates the project and prints a JSON envelope. To modify an EXISTING project's config, use the Read and Edit tools, not shell redirection."
fi

exit 0
