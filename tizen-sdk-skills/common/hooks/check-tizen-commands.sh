#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# PreToolUse hook for tizen-sdk-skills.
#
# Intercepts Bash AND PowerShell tool calls and DENIES a few recurring Tizen
# command mistakes, feeding a corrective message back to Claude so it retries
# with the right form. (PowerShell matters on Windows: the model often reaches
# for the PowerShell tool first, which used to bypass these guards entirely.)
# Runs cross-platform: Claude Code / Cline execute hooks via Git Bash on Windows and
# /bin/sh-compatible bash on Unix. No jq/node/python required — we pattern-match
# the raw stdin JSON (the patterns are plain ASCII) and emit a static deny JSON.
#
# stdin : {"tool_name":"Bash","tool_input":{"command":"..."},...}
# stdout: {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
# exit  : always 0 (deny is signalled via JSON, not exit code)

input="$(cat)"

# Match rules against ONLY the "command" JSON string, not the whole payload —
# otherwise the tool call's free-text `description` field false-positives (a
# description like "Run tizen install app script" tripped the tizen-CLI rule even
# though the command itself was fine). The sed ERE consumes escape pairs (\\ \")
# so an escaped quote inside the command doesn't cut the extraction short. We keep
# the value in its raw JSON-escaped form — rules that rely on the escaped encoding
# (doubled backslashes) depend on that. Falls back to the whole payload if the
# extraction comes up empty (unexpected JSON shape), which only errs toward the
# old, stricter behavior.
cmd="$(printf '%s' "$input" | sed -nE 's/.*"command"[[:space:]]*:[[:space:]]*"((\\.|[^"\\])*)".*/\1/p')"
[ -n "$cmd" ] || cmd="$input"

# Which tool is this? A few rules are Bash-syntax-specific and are VALID
# PowerShell (e.g. 2>$null), so they must not fire on PowerShell tool calls.
tool="$(printf '%s' "$input" | sed -nE 's/.*"tool_name"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"

# git/gh commands never run Tizen tooling, but a commit message or PR body
# heredoc DESCRIBING a tizen command (e.g. changelog text) is part of the
# command string and false-positives every rule below. Skip them.
#
# The git invocation is not always the first token. Anchoring on it alone
# denied routine forms outright — most visibly during GBS work, where the
# build needs a git repo in the project directory, so `cd <project> && git
# init && git commit -m "..."` is the natural shape and any message
# mentioning a tizen command tripped a rule. Strip leading `cd <path> &&`
# and VAR=value prefixes first, then test.
is_git_command() {
  route="$1"
  # Bounded: each pass removes one prefix, and real commands stack very few.
  for _ in 1 2 3 4; do
    before="$route"
    # VAR=value prefix, e.g. GIT_EDITOR=true git commit
    route="$(printf '%s' "$route" | sed -E 's/^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+//')"
    # cd <path> && | ;  — the path may be JSON-escaped-quoted (\"...\")
    route="$(printf '%s' "$route" | sed -E 's/^[[:space:]]*cd[[:space:]]+(\\+"[^"\\]*\\+"|[^[:space:]&;|]+)[[:space:]]*(&&|;)[[:space:]]*//')"
    [ "$route" = "$before" ] && break
  done
  printf '%s' "$route" | grep -Eq '^[[:space:]]*(git|gh)([[:space:]]|$)'
}

if is_git_command "$cmd"; then
  exit 0
fi

# Emit a deny decision with a static reason, then stop (allow nothing further).
deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

# -e makes patterns that start with '-' (e.g. -File...) safe (otherwise grep treats
# the leading -F as the fixed-strings option and errors with "conflicting matchers").
has() { printf '%s' "$cmd" | grep -Eq -e "$1"; }
# Case-insensitive variant, for tokens that appear upper-cased in real commands.
has_i() { printf '%s' "$cmd" | grep -Eiq -e "$1"; }

# Rule 1 — `tz build` / `tz pack` with -p (tz build has no -p; project dir is -w)
if has 'tz[[:space:]]+(build|pack)\b' && has '[[:space:]]-p\b'; then
  deny "tz build/pack take the project directory via -w, NOT -p. Use: tz build -b Debug -w <project-dir> then tz pack -w <project-dir>. (-p is only for tz install, the package path.) Prefer invoking the tizen-build-project skill, which runs the wrapper script."
fi

# Rule 2 — `tz install` with a wrong flag: -s/-d (serial flag is -e) or -b/-w (tz build
# flags; observed: "$TZ" install -w <project> -b Debug conflating build and install).
# The tz token also matches variable-style invocations ($TZ, "$TZ", tz.exe) — the
# observed miss was the binary path stored in a TZ variable.
if has '(^|[^[:alnum:]])(tz|TZ)(\.exe)?["\\]*[[:space:]]+install\b'; then
  # Scope the flag test to the tz install invocation ITSELF: in a compound command
  # like `tz install -e emu -p /a.tpk && sdb -s emu shell ...` the -s belongs to
  # sdb, not tz install. Cut the segment at the first & / | / ; before testing.
  # (No \b in the sed pattern — BSD sed on macOS doesn't support it; the grep
  # guard above already enforced the word boundary.)
  tz_seg="$(printf '%s' "$cmd" | sed -nE 's/.*(^|[^[:alnum:]])((tz|TZ)(\.exe)?["\\]*[[:space:]]+install([[:space:]][^;|&]*)?).*/\2/p')"
  [ -n "$tz_seg" ] || tz_seg="$cmd"
  if printf '%s' "$tz_seg" | grep -Eq '[[:space:]]-[sdbw]\b'; then
    deny "tz install takes ONLY -e (or --serial) for the device serial and -p for the ABSOLUTE package path — not -s/-d (serial is -e) and not -b/-w (those are tz build flags; install takes a built .tpk/.wgt, not a project dir). Build first if needed (tz build -b Debug -w <project-dir>), then install via the install runner: node <plugin>/lib/cli/project-manager-cli.js install --package <package> [--device-serial serial] [--run] — it does push + tz install + verification and returns a JSON envelope."
  fi
fi

# Rule 3 — sdb treated as a directory (sdb/sdb), e.g. tools/sdb/sdb
if has 'sdb/sdb'; then
  deny "sdb is a FILE at <sdk>/tools/sdb (Windows: tools/sdb.exe), not a folder. Do not use tools/sdb/sdb. Run <sdk>/tools/sdb devices, or use the tizen-device-manager skill."
fi

# Rule 4 — manual gdbserver / raw remote-debug setup (exclude the wrapper script itself)
if has 'gdbserver' && ! has 'tizen-native-gdb-debug'; then
  deny "Do not launch gdbserver or wire up remote GDB by hand. Use the tizen-gdb-debug skill (tizen-native-gdb-debug script): it handles gdbserver, sdb port forwarding, the SDK-bundled gdb, and breakpoints. Pass -l (launch mode) to break at main before it runs."
fi

# Rule 5 — the `tizen` CLI (not available; use tz). Guard: the char before "tizen"
# must be start-of-string or a non-alnum, non-hyphen char, so that:
#   - words like citizen don't match (preceding char is alnum);
#   - a hyphenated OWNER name like `flutter-tizen build` doesn't match (preceding char
#     is "-", so it reads as a different tool, not the Tizen Studio CLI);
#   - a real path-invoked CLI still matches (e.g. /opt/.../bin/tizen — preceding "/").
# (\.bat|\.exe|\.sh)? covers the real launchers: tizen.bat / tizen.exe on Windows and,
# on Ubuntu, BOTH the extensionless `tizen` and `tizen.sh` (both ship in Tizen Studio's
# CLI bin). The optional suffix also matches the plain `tizen`. The leading boundary is
# [^[:alnum:]-] (non-alnum AND non-hyphen) so: words like citizen don't match; a
# hyphenated OWNER name like `flutter-tizen build` doesn't match (preceding "-", a
# separate tool, not the Tizen Studio CLI); a path-invoked CLI still matches (e.g.
# /opt/.../bin/tizen — preceding "/"). A hyphenated SUFFIX like tizen-create-project
# won't match either — after "tizen" comes "-", not a launcher suffix or whitespace.
# The verb list includes `version` and `list <something>` (observed in the wild:
# `tizen version; tizen list templates`) — ANY tizen CLI invocation must be redirected,
# not just the build/install ones.
if has '(^|[^[:alnum:]-])tizen(\.bat|\.exe|\.sh)?[[:space:]]+(build|install|run|create|new|package|version|list([[:space:]]|-)+[a-z-]+)'; then
  deny "The tizen CLI (including tizen.bat / tizen.exe / tizen.sh) is NOT available in this environment. Use tz instead: tz build / tz install / tz run / tz new. There is no 'tz list-device' — list connected devices with sdb devices, or emulators with tz emul list-vm. To create a project or LIST TEMPLATES, do NOT use any tizen CLI — use the tizen-create-project skill: run node <plugin>/lib/cli/project-manager-cli.js list-templates --type <type> to list templates, then node <plugin>/lib/cli/project-manager-cli.js create --type <type> --template <template> --parent-path <parentPath> --name <appName> to create."
fi

# Rule 6 — wrong sdb path (sdb is in tools/, not tools/tizen-core/)
if has 'tools/tizen-core/sdb'; then
  deny "sdb is at <sdk>/tools/sdb (Windows: tools/sdb.exe), NOT under tools/tizen-core/. Only tz and the other tizen-core tools live in tools/tizen-core/."
fi

# Rule 7 — tizen-studio toolchain (standardize on tizen-sdk). [/\\]+ tolerates the
# JSON-escaped backslash in Windows paths (tizen-studio\\tools).
if has 'tizen-studio[/\\]+tools'; then
  deny "Use the tizen-sdk install, not tizen-studio. Tools live under <sdk>/tools (tz at tools/tizen-core/tz, sdb at tools/sdb). Point TIZEN_SDK_PATH at your tizen-sdk directory."
fi

# Rule 8 — tz install with a RELATIVE -p package path (must be absolute).
# Extract the -p argument (stripping any wrapping quotes — raw ' or the
# JSON-escaped \") and ALLOW it when it starts with / or ~ (absolute), a Windows
# drive letter (X:), or $ — a $(realpath ...) command substitution or a $VAR
# reference resolves at runtime, and is exactly what the deny message suggests.
# Everything else (MyApp.tpk, ./MyApp.tpk) is a relative path and is denied.
if has 'tz[[:space:]]+install\b' && has '[[:space:]]-p[[:space:]]+[^[:space:]]'; then
  p_arg="$(printf '%s' "$cmd" | sed -nE "s/.*[[:space:]]-p[[:space:]]+[\\\"']*([^[:space:]]+).*/\1/p")"
  case "$p_arg" in
    /*|~*|[A-Za-z]:*|\$*) : ;;  # absolute path, home, drive letter, substitution/variable
    *) deny "tz install needs an ABSOLUTE package path with -p; relative paths cause resolution errors. Linux/macOS: -p \$(realpath <pkg>). Windows (PowerShell): -p (Resolve-Path <pkg>).Path. Or use the tizen-install-app skill." ;;
  esac
fi

# Rule 9 — manual sdb port forwarding for a DEBUGGER session (exclude the wrapper
# scripts and sdb-helper). This fires only when the SAME command also names a
# debugger (gdb/gdbserver, netcoredbg, lldb, vsdbg). A bare
# `sdb forward tcp:<host> tcp:<device>` is legitimate non-debug forwarding (web
# inspector, a custom TCP service): it is the command the tizen-sdb-helper RUNNER
# emits, and the runner's confirmed-gated-command path has the model run that exact
# string — the old rule denied every `forward tcp:` and then pointed at that skill,
# so there was NO allowed way to forward a port (issue #84).
# The debugger tokens are matched case-insensitively: the .NET launch line spells
# it NETCOREDBG (launch_app ... __AUL_SDK__ NETCOREDBG ...).
if has 'sdb' && has 'forward[[:space:]]+tcp:' && has_i '(gdb|netcoredbg|lldb|vsdbg)' \
   && ! has 'tizen-native-gdb-debug' && ! has 'tizen-dotnet-debug' && ! has 'tizen-sdb-helper' && ! has 'sdb-helper'; then
  deny "Do not set up sdb port forwarding for a debugger by hand. For Native (C/C++) apps use the tizen-gdb-debug skill (tizen-native-gdb-debug script); for .NET apps use the tizen-dotnet-debug skill (netcoredbg DAP server). Both handle the forwarding themselves. Plain non-debug port forwarding (web inspector, custom TCP services) goes through the tizen-sdb-helper runner: node <plugin>/lib/cli/sdb-helper-cli.js --request 'forward port <host_port>'."
fi

# Rule 16 — hunting for the sdb binary on the host (which/where/command -v/type/
# Get-Command sdb, find -name sdb). Every sdb action has a skill runner that resolves
# sdb from the SDK itself; the model searching for it is the first step of the
# raw-sdb detour reported in issue #96 ("manually started search for the sdb
# location"). Runner invocations (*-cli.js) and the skills' own lookup snippets never
# search for sdb, so nothing legitimate matches. `has_i` because PowerShell cmdlets
# are case-insensitive (get-command). The trailing boundary keeps sdb-helper,
# sdb-helper-cli.js and sdbd out of the match.
if has_i '(^|[^[:alnum:]_./-])(which|whereis|where(\.exe)?|type|command[[:space:]]+-v|Get-Command)[[:space:]]+(-[[:alnum:]]+[[:space:]]+)*["'"'"'\\]*sdb(\.exe)?["'"'"'\\]*([[:space:]]|$|;|&|\|)' \
   || has_i 'find[[:space:]].*-i?name[[:space:]]+["'"'"'\\]*sdb(\.exe)?["'"'"'\\]*([[:space:]]|$|;|&|\|)'; then
  deny "Do not search for the sdb binary yourself. Every sdb action goes through a skill runner that locates sdb (<sdk>/tools/sdb) on its own: device shell/forward/reboot/logs/launch/kill -> tizen-sdb-helper (node <plugin>/lib/cli/sdb-helper-cli.js --request '<the user ask>'); connect to an IP -> tizen-remote-device (remote-device-cli.js connect <ip>); list devices -> tizen-device-manager; push/pull -> tizen-file-transfer. Run the runner and report its JSON envelope."
fi

# Rule 10 — powershell -File given an MSYS path (/c/...). PowerShell needs a Windows
# path; a Git Bash `find` result is an MSYS path. \\?\"? tolerates the JSON-escaped quote.
if has 'powershell' && has '-File[[:space:]]+\\?"?/'; then
  deny "PowerShell -File requires a Windows path, but a Git Bash find result is an MSYS path like /c/Users/... . Convert it first: WINPATH=\$(cygpath -w RESULT) then pass -File WINPATH. (Or use a path that starts with a drive letter, e.g. C: with backslashes.)"
fi

# Rule 11 — hand-rolled gdb session (gdb invoked with a -x init file) outside the
# wrapper. The wrapper command contains 'tizen-native-gdb-debug' so it is excluded.
if has 'gdb' && has '[[:space:]]-x[[:space:]]' && ! has 'tizen-native-gdb-debug'; then
  deny "Don't run gdb with a hand-written -x init file. Use the tizen-gdb-debug skill (tizen-native-gdb-debug script): it writes a BOM-free init file, converts paths for gdb, launches gdbserver, forwards the port, and sets breakpoints. Pass -l for launch mode (break at main)."
fi

# Rule 12 — improvised Start-Process wrapper to background a script with stream
# redirection. PowerShell ERRORS when -RedirectStandardOutput and -RedirectStandardError
# point at the same file, and a detached Start-Process reports false success. Backgrounding
# must go through the Bash tool's run_in_background, not a PowerShell launcher. Matches a
# Bash command that both spawns Start-Process and redirects a standard stream.
if has 'Start-Process' && has 'RedirectStandard(Output|Error)'; then
  deny "Do NOT wrap a script in Start-Process with -RedirectStandardOutput/-RedirectStandardError. PowerShell rejects both pointing at the SAME file, and a detached process falsely reports success. Run the installer directly — e.g. powershell -ExecutionPolicy Bypass -File <quoted windows script path via cygpath -w>. Claude Code: call it with the Bash tool and run_in_background:true. Cline: run it directly in the FOREGROUND (no timeout cap) and report completion when it exits. No Start-Process, no manual log redirect: the tool captures the output."
fi

# Rule 13 — PowerShell-style null redirect ($null) leaking into a Bash command.
# Bash has no $null; an undefined $null expands to empty, giving e.g. "2>" with
# nothing after it, which errors as "ambiguous redirect". Bash tool only:
# 2>$null is perfectly valid inside the PowerShell tool.
if [ "$tool" != "PowerShell" ] && has '[0-9]?>\$null'; then
  deny "\$null is PowerShell syntax, not Bash — an undefined \$null expands to empty and causes 'ambiguous redirect'. In a Bash command use /dev/null instead: 2>/dev/null (stderr) or >/dev/null (stdout). \$null only works inside an actual PowerShell session (powershell -Command/-File)."
fi

# Rule 14 — a Windows path's trailing backslash escapes the closing double-quote in a
# Bash-quoted argument, breaking the command ("unexpected EOF while looking for
# matching \`\"'"). JSON-encodes as 3 backslashes immediately before a quote: the path's
# own trailing \ (2 chars) + the escaped closing \" (2 chars) share one backslash... in
# the raw JSON text this is exactly 3 backslash characters then a quote.
# Bash tool only: PowerShell does not treat backslash as an escape character,
# so "C:\path\" is fine there. Anchored to the END of the command: the same
# 3-backslash encoding also appears for a deliberate escaped quote (\") in
# nested quoting, which is valid mid-command — only a trailing one (nothing
# after the swallowed closing quote) is the observed breakage.
if [ "$tool" != "PowerShell" ] && has '[\][\][\]"[[:space:]]*$'; then
  deny "A quoted Windows path that ends with the path-separator character right before the closing quote escapes that quote in Bash/Git Bash and breaks the command (error: unexpected EOF while looking for matching quote). Fix: remove the trailing separator so the path does not end right before the closing quote, convert the path with cygpath -w first, or use forward slashes throughout instead of the native separator."
fi

# Rule 15 — UNQUOTED backslash Windows path in a Bash command. Bash strips the
# backslashes (cd C:\Users\x -> "C:Usersx": No such file or directory). Only the
# unquoted form breaks: a quoted "C:\..." is preceded by \" in the raw JSON, an
# unquoted one by whitespace (or start). Bash tool only — PowerShell is fine.
if [ "$tool" != "PowerShell" ] && has '(^|[[:space:]])[A-Za-z]:[\][\][[:alnum:]_.]'; then
  deny "Unquoted Windows path with backslashes in a Bash command — Bash strips the backslashes (cd C:(backslash)Users(backslash)x becomes C:Usersx: No such file or directory). Put the path in quotes, or use forward slashes: cd C:/Users/... or /c/Users/... (Git Bash). For PowerShell -File args, quote the path or convert with cygpath -w."
fi

# No rule matched — allow the command.
exit 0
