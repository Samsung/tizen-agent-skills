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
#
# Scope: the shell-syntax rules apply everywhere; the Tizen tooling rules apply
# only when ~/.tizen.sdk.path.config exists (an SDK configured through this
# plugin) — see the gate below (issue #47). The hook never forbids the `tizen`
# CLI or looking up where sdb is; it only keeps a hand-typed sdb on the
# configured SDK's tools/sdb.

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
# mentioning a tizen command tripped a rule.
#
# But the exemption must cover ONLY git: the earlier form stripped the `cd`
# prefix and then exempted the whole line if the next token was git/gh, so
# `git --version && <anything>` skipped every rule below. Now the command is
# split into simple commands on unquoted `&&`, `||`, `;`, `|` and newlines,
# and it is exempt only when every one of them is a git/gh invocation, a `cd`,
# or a bare VAR=value (the shapes that merely set one up). Quotes are honoured
# — the command arrives JSON-escaped, so a double quote is the pair \" — which
# keeps `git commit -m "a; b && tz build -p"` a single git segment. `2>&1` /
# `>&2` / `&>` are redirections, not separators. A non-exempt line is not
# denied here; it simply goes through the rules like any other command.
# (Kept in sync with the same helper in check-project-writes.sh.)
is_git_command() {
  printf '%s' "$1" | awk '
    function segment_ok(seg,    k) {
      gsub(/^[[:space:](]+/, "", seg)
      gsub(/[[:space:])]+$/, "", seg)
      if (seg == "") return 1
      # VAR=value prefixes, e.g. GIT_EDITOR=true git commit (bounded: real
      # commands stack very few)
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
          # \" is the JSON-escaped double quote; \n an escaped newline
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

# ---------------------------------------------------------------------------
# Shell-syntax rules. These catch host pitfalls (Git Bash vs PowerShell), not
# Tizen policy, so they apply to every command regardless of SDK setup.
# ---------------------------------------------------------------------------

# Rule 10 — powershell -File given an MSYS path (/c/...). PowerShell needs a Windows
# path; a Git Bash `find` result is an MSYS path. \\?\"? tolerates the JSON-escaped quote.
if has 'powershell' && has '-File[[:space:]]+\\?"?/'; then
  deny "PowerShell -File requires a Windows path, but a Git Bash find result is an MSYS path like /c/Users/... . Convert it first: WINPATH=\$(cygpath -w RESULT) then pass -File WINPATH. (Or use a path that starts with a drive letter, e.g. C: with backslashes.)"
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

# ---------------------------------------------------------------------------
# Scope of the Tizen tooling rules (issue #47). The hook is registered for EVERY
# shell command of the harness, in every project, so the rules below apply only
# once the user has configured an SDK through this plugin: ~/.tizen.sdk.path.config,
# written by tizen-sdk-init and by the installer's auto-init. On a machine without
# that file — someone who installed the plugin but is working on something else,
# or a Tizen Studio user who never ran sdk-init — a `which sdb`, a `tizen version`
# or a PATH export must not be second-guessed, and the hook stays out of the way.
# TIZEN_SDK_SKILLS_SDK_CONFIG overrides the config file location (used by the tests).
# ---------------------------------------------------------------------------
sdk_cfg="${TIZEN_SDK_SKILLS_SDK_CONFIG:-${HOME:-}/.tizen.sdk.path.config}"
sdk_path=""
if [ -n "${HOME:-}${TIZEN_SDK_SKILLS_SDK_CONFIG:-}" ] && [ -f "$sdk_cfg" ]; then
  sdk_path="$(tr -d '\r\n' < "$sdk_cfg" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
fi
[ -n "$sdk_path" ] || exit 0
# JSON-safe copy for deny messages (a Windows path carries backslashes).
sdk_json="$(printf '%s' "$sdk_path" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"

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

# (Rule 5, which denied every Tizen Studio `tizen` CLI invocation, was removed in
# 1.4.5 — issue #47. The CLI does exist for Tizen Studio users; the skills still
# steer the model to the runners, the hook no longer forbids the tool itself.)

# Rule 6 — wrong sdb path (sdb is in tools/, not tools/tizen-core/)
if has 'tools/tizen-core/sdb'; then
  deny "sdb is at <sdk>/tools/sdb (Windows: tools/sdb.exe), NOT under tools/tizen-core/. Only tz and the other tizen-core tools live in tools/tizen-core/."
fi

# Rule 7 — sdb run from a directory other than the configured SDK's tools/ (issue #47;
# replaces the old "tizen-studio is not tizen-sdk" rule, which denied any mention of a
# tizen-studio/tools path even when that WAS the user's configured SDK). Every runner
# resolves sdb from the SDK named in ~/.tizen.sdk.path.config; a hand-typed sdb that
# points somewhere else — a second SDK install, tools/tizen-core/, a stray copy — talks
# to a different sdb server and Device Manager state than the runners do. Only an sdb
# invoked WITH a directory prefix is checked: a bare `sdb devices` (PATH-resolved), a
# `$SDK`/`%VAR%` prefix (resolved at runtime) and a cwd-relative `./sdb` are left alone,
# since the hook cannot tell where they resolve. The comparison normalises quotes,
# backslashes (JSON-escaped `\\`), MSYS drive prefixes (/c/ -> c:/), a leading ~ and
# case. A quoted path with spaces compares as a suffix of the command text up to the
# `/sdb`, so "C:\Program Files\Tizen\tools\sdb.exe" does not false-positive on the space.
# `=` is a token boundary so that `SDB=~/sdk/tools/sdb` compares the path, not `SDB=~/…`.
case "$cmd" in *[sS][dD][bB]*) cmd_has_sdb_token=1 ;; *) cmd_has_sdb_token=0 ;; esac
sdb_outside_sdk() {
  # The paths go in through the environment, not -v: awk expands escape sequences
  # in -v values, so a Windows path like C:\tizen-sdk would arrive with a TAB in it.
  printf '%s' "$cmd" | GUARD_SDK_PATH="$sdk_path" GUARD_HOME="${HOME:-}" awk '
    function norm(s) {
      gsub(/\\"/, "", s); gsub("\047", "", s)
      gsub(/\\+/, "/", s); gsub(/\/\/+/, "/", s)
      return tolower(s)
    }
    # /c/foo (MSYS) -> c:/foo
    function drive(s) { if (s ~ /^\/[a-z]\//) s = substr(s, 2, 1) ":" substr(s, 3); return s }
    function strip_slash(s) { sub(/\/+$/, "", s); return s }
    BEGIN {
      want = drive(strip_slash(norm(ENVIRON["GUARD_SDK_PATH"]))) "/tools"
      h = drive(strip_slash(norm(ENVIRON["GUARD_HOME"])))
      bad = 0
    }
    {
      c = norm($0); off = 0; rest = c
      while (match(rest, /\/sdb(\.exe)?([[:space:];&|()]|$)/)) {
        pos = off + RSTART
        prefix = substr(c, 1, pos - 1)
        dir = prefix; sub(/.*[[:space:];&|()=]/, "", dir)
        off = pos; rest = substr(c, pos + 1)
        if (dir ~ /[$%]/) continue                      # variable, resolved at runtime
        if (dir == "" || dir == "." || dir ~ /^\.\.?\//) continue   # relative to cwd
        if (dir ~ /^~(\/|$)/) { if (drive(h substr(dir, 2)) == want) continue; bad = 1; break }
        if (drive(dir) == want) continue
        if (length(prefix) >= length(want) && substr(prefix, length(prefix) - length(want) + 1) == want) continue
        bad = 1; break
      }
    }
    END { exit bad ? 0 : 1 }
  '
}
if [ "$cmd_has_sdb_token" -eq 1 ] && sdb_outside_sdk; then
  deny "Use only the sdb of the configured Tizen SDK: $sdk_json/tools/sdb (Windows: tools/sdb.exe). That is the SDK named in ~/.tizen.sdk.path.config and the one every skill runner talks to; an sdb from another directory (another SDK install, tools/tizen-core/, a copy) runs a different sdb server and sees different Device Manager state. If that other SDK is the one you want, point the config at it first (tizen-sdk-init / node <plugin>/lib/cli/sdk-init-cli.js --sdk-path <dir>), then retry."
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

# (Rule 16, which denied looking the sdb binary up on the host — which / where /
# Get-Command / find -name sdb — was removed in 1.4.5, issue #47. A read-only lookup
# is a legitimate environment check; the runner skills still tell the model not to go
# hunting during a Tizen workflow, and Rule 7 above keeps a found sdb that is not the
# configured SDK's from being run.)

# Rule 20 — finding the emulator VMs by hand (issue #268). Asked to "provide the list
# of emulators available", the model skipped the tizen-create-emulator skill and went
# looking itself: a raw `em-cli list-vm`, or `ls` / `find` / `Get-ChildItem` over the
# SDK data directory that holds the VMs (<sdk>-data/emulator/vms). Both bypass the
# runner (which resolves em-cli from the configured SDK, tells a broken em-cli apart
# from "no VMs", and reports each VM's profile). Exempt: the runners / wrapper scripts,
# whose command line names them (`node "$CLI" …` included — a runner flag may carry a
# path under emulator/vms, e.g. --file-sharing-path). The em-cli token must look like an
# INVOCATION, not a mention: followed by an em-cli subcommand or flag (`em-cli list-vm`,
# `"$SDK/tools/emulator/bin/em-cli" -h`), or standing at the start of a simple command
# with an optional path prefix (`cd …/bin && ./em-cli`). A bare mention of the word —
# `grep -r em-cli SKILL.md`, a commit message — is not. The runner's own file name
# (emulator-manager-cli.js) contains "-cli" but not "em-cli". $EMCLI / $EM_CLI variable
# forms are the same detour spelled differently and take the same subcommand test.
emcli_sub='(list-(vm|vms|platform|platforms|template|templates)|create(-image)?|delete|launch|detail|modify|reset|-[-a-zA-Z])'
if ! has '(-cli\.js|\$CLI["\\]*[[:space:]]|tizen-emulator-manager|tizen-device-manager|tizen-launch-emulator)' \
   && { has '(^|[^[:alnum:]_-])em-cli(\.bat|\.exe)?["'"'"'\\]*[[:space:]]+'"$emcli_sub" \
        || has '(^|[;&|(][[:space:]]*)([^[:space:];&|"'"'"']*/)?em-cli(\.bat|\.exe)?["'"'"'\\]*[[:space:]]*($|;|&|\|)' \
        || has_i '\$\{?EM_?CLI\}?["'"'"'\\]*[[:space:]]+'"$emcli_sub" \
        || has_i 'emulator[/\\]+vms([^[:alnum:]_]|$)'; }; then
  deny "Do not look for emulator VMs yourself - no raw em-cli, and no ls/find/Get-ChildItem over <sdk>-data/emulator/vms. Listing, inspecting, creating and deleting emulator VMs is the tizen-create-emulator skill: node <plugin>/lib/cli/emulator-manager-cli.js list-vm --detail lists the existing VMs with platform, profile, resolution and RAM (list-platform / list-template --profile tizen|tv for the images and sizes, create / delete / detail / modify for the rest); launching one is tizen-launch-emulator (emulator-manager-cli.js launch --vm-name <name>). The runner locates em-cli from the configured SDK on its own and returns a JSON envelope - report that envelope, and take each VM's profile from it (tizen-* images are the unified tizen profile, not Mobile)."
fi

# Rule 11 — hand-rolled gdb session (gdb invoked with a -x init file) outside the
# wrapper. The wrapper command contains 'tizen-native-gdb-debug' so it is excluded.
if has 'gdb' && has '[[:space:]]-x[[:space:]]' && ! has 'tizen-native-gdb-debug'; then
  deny "Don't run gdb with a hand-written -x init file. Use the tizen-gdb-debug skill (tizen-native-gdb-debug script): it writes a BOM-free init file, converts paths for gdb, launches gdbserver, forwards the port, and sets breakpoints. Pass -l for launch mode (break at main)."
fi

# (Rules 10, 12–15 — the shell-syntax pitfalls — run before the SDK-config gate, above.)

# Rule 17 — kernel log by hand over sdb (issue #213). After `dlog-collect` the model
# went on to `sdb shell dmesg` / `cat /proc/kmsg` / `dlogutil -b kmsg` instead of the
# analyzer's own kernel commands. Kernel logs are collected by the dlog-analyzer
# runner: `kernel collect [serial]` starts the native collector in the background,
# `kernel stop` ends it, `kernel analyze` prints the deduplicated findings. The
# runner / wrapper (their command line names dlog-analyzer) are exempt.
# (The `case` pre-checks below are bash builtins — they keep the three sdb/sleep
# rules from spawning grep on the many commands that mention neither.)
case "$cmd" in *[sS][dD][bB]*) cmd_has_sdb=1 ;; *) cmd_has_sdb=0 ;; esac
if [ "$cmd_has_sdb" -eq 1 ] && ! has 'dlog-analyzer' \
   && has_i '(dmesg|/proc/kmsg|/dev/kmsg|journalctl|dlogutil[^;&|]*(kmsg|-b[[:space:]]+kernel))'; then
  deny "Do not collect the kernel log with sdb by hand (dmesg, /proc/kmsg, dlogutil kmsg). Kernel logs belong to the tizen-dlog-analyzer runner: node <plugin>/lib/cli/dlog-analyzer-cli.js kernel collect [serial] starts the native collector in the background (it writes <sdk-data>/dloganalyzer/app/kernel/kernel.hot.log); ask the user to reproduce the issue, then run kernel stop and kernel analyze for the deduplicated findings. Report the runner's JSON envelope."
fi

# Rule 18 — hand-typed diagnostic probes over sdb shell (issue #214): top / ps / free /
# vmstat / memps / uptime / /proc/meminfo, loadavg, stat, cpuinfo, /proc/<pid>/status.
# While investigating a symptom (high CPU, memory, freeze, video not playing) the model
# skipped the analyzer's evidence probes and typed these itself. They are what
# `investigate --symptoms "<the user's words>" [app-id]` runs (bundled per symptom
# profile), and `probe list` / `probe run <probe-id>` run one on demand. Exempt: every
# skill runner and debug wrapper whose own scripts may legitimately query the device
# (their command line names the runner), and `app_launcher` / `pkgcmd` style commands
# that merely happen to sit on the same line are not matched — the diagnostic token
# must stand as its own word inside the sdb shell segment.
case "$cmd" in *[sS][dD][bB]*shell*) cmd_has_sdb_shell=1 ;; *) cmd_has_sdb_shell=0 ;; esac
if [ "$cmd_has_sdb_shell" -eq 1 ] \
   && ! has '(dlog-analyzer|sdb-helper|gdb-debug|dotnet-debug|webapp-debug|playwright-test|screenshot|remote-device|file-transfer|project-manager|install-app)' \
   && has '[sS][dD][bB][^;&|]*shell[^;&|]*((^|[[:space:]"])(top|ps|free|vmstat|memps|uptime)([[:space:]"\\;&|]|$)|/proc/(meminfo|loadavg|stat|cpuinfo|[0-9]+/(status|stat|smaps|maps)))'; then
  deny "Do not run diagnostic probes (top, ps, free, vmstat, memps, uptime, /proc/meminfo, /proc/loadavg, /proc/<pid>/status) over sdb shell by hand while investigating a Tizen issue. The tizen-dlog-analyzer runner owns evidence collection: node <plugin>/lib/cli/dlog-analyzer-cli.js investigate --symptoms \"<the user's words>\" [app-id] runs the probe bundles matching the symptom (CPU, memory, freeze, media, ...) and correlates them with the collected dlog; node <plugin>/lib/cli/dlog-analyzer-cli.js probe list shows the catalog and probe run <probe-id> runs one probe (e.g. probe run cpu-top instead of sdb shell top). Report the runner's JSON envelope; do not type sdb yourself."
fi

# Rule 18b — hand-typed network diagnostics over sdb shell: openssl
# s_client, curl/wget to the device. These are what the network-egress probes
# (reachability, tls-handshake) do — gated by --allow-network-probe in the
# runner. Exempt: skill runners whose command line names them.
if [ "$cmd_has_sdb_shell" -eq 1 ] \
   && ! has '(dlog-analyzer|sdb-helper|gdb-debug|dotnet-debug|webapp-debug|playwright-test|screenshot|remote-device|file-transfer|project-manager|install-app)' \
   && has '[sS][dD][bB][^;&|]*shell[^;&|]*((^|[[:space:]"])(openssl[[:space:]]+s_client|curl|wget)([[:space:]";&|]|$))'; then
  deny "Do not run network diagnostics (openssl s_client, curl, wget) over sdb shell by hand. The tizen-dlog-analyzer runner owns network-egress probes: node <plugin>/lib/cli/dlog-analyzer-cli.js investigate --symptoms \"<the user's words>\" --allow-network-probe [app-id] runs the reachability and TLS-handshake probes (consent-gated); node <plugin>/lib/cli/dlog-analyzer-cli.js probe run <probe-id> --allow-network-probe runs one. Report the runner's JSON envelope; do not type sdb yourself."
fi

# Rule 19 — waiting on a timer instead of asking the user to reproduce (issue #212).
# After `dlog-collect <app-id>` / `start start-monitoring` / `kernel collect` the model
# ran `sleep 30 && node "$CLI" stop-collect` (or a bare `sleep 60`, then analyzed in the
# next call) instead of ending its turn with the two-option question ("done, the
# issue occurred" / "nothing happened") and waiting for the user. Denied when the
# command sleeps AND runs one of the runner's stop/analyze actions, when it sleeps
# 5 s or more and names the runner at all, or when it is a bare sleep of 5 s or more
# while one of the runner's collectors is alive (PID files under
# <tmp>/tizen-dlog-analyzer/; liveness via kill -0, or `ps -W` on Git Bash where
# kill cannot see Windows PIDs). A short sleep (< 5 s) that pads an app launch
# before dlog-collect is left alone.
sleep_secs=""
case "$cmd" in
  *sleep*|*Sleep*)
    sleep_secs="$(printf '%s' "$cmd" | sed -nE 's/.*(^|[;&|[:space:](])(sleep|Start-Sleep([[:space:]]+-[Ss][A-Za-z]*)?)[[:space:]]+([0-9]+).*/\4/p' | tail -1)" ;;
esac
if [ -n "$sleep_secs" ]; then
  dlog_collector_alive() {
    local d f pid
    for d in "${TMPDIR:-}" "${TEMP:-}" "${TMP:-}" /tmp; do
      [ -n "$d" ] && [ -d "$d/tizen-dlog-analyzer" ] || continue
      for f in analyzer.pid app-collect.pid kernel-collect.pid; do
        [ -f "$d/tizen-dlog-analyzer/$f" ] || continue
        pid="$(tr -d '[:space:]' < "$d/tizen-dlog-analyzer/$f")"
        [ -n "$pid" ] || continue
        if kill -0 "$pid" 2>/dev/null; then return 0; fi
        if command -v ps >/dev/null 2>&1 \
           && ps -W 2>/dev/null | awk -v p="$pid" '$1==p || $4==p {found=1} END {exit found?0:1}'; then
          return 0
        fi
      done
    done
    return 1
  }
  # The runner is almost always invoked as node "$CLI" <action>, so its file name
  # is not on the command line — recognise it by its actions as well.
  names_dlog_runner=0
  if has '(dlog-analyzer|stop-collect|error-analyze|dlog-collect|start-monitoring|exception-detect|kernel[[:space:]]+(collect|stop|analyze)|app-log|CLI["\\]*[[:space:]]+(check|stop|status|start|investigate|probe|snapshot|timeline|log-dump))'; then
    names_dlog_runner=1
  fi
  if { [ "$names_dlog_runner" -eq 1 ] && has '(stop-collect|error-analyze|app-log|kernel[[:space:]]+(stop|analyze)|[[:space:]"](stop|check)([[:space:]"]|$))'; } \
     || { [ "$sleep_secs" -ge 5 ] && { [ "$names_dlog_runner" -eq 1 ] || dlog_collector_alive; }; }; then
    deny "Do not wait on a timer while tizen-dlog-analyzer is collecting. Log collection is interactive: after dlog-collect / start start-monitoring / kernel collect, END YOUR TURN and ask the user to browse the app and reproduce the issue, offering two options - (1) done, the error/crash occurred, (2) nothing happened - then wait for the reply. Only after the user answers run stop-collect (or stop / kernel stop) and error-analyze / check / kernel analyze. No sleep, no Start-Sleep, no polling loop, and no stop/analyze in the same command as the start."
  fi
fi

# No rule matched — allow the command.
exit 0
