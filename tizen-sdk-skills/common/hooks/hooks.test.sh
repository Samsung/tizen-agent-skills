#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Tests for the PreToolUse hooks.
#
# Focus is the git route — the early exit that stops a git/gh command from
# being pattern-matched against the Tizen rules. A commit message legitimately
# quotes the commands it is about ("fix tz build -p flag"), so without the
# route those commits get denied.
#
# Regression guarded here: the route anchored on the command STARTING with
# git/gh, so `cd <project> && git commit -m "..."` fell through to the rules.
# That shape is routine during GBS work, where the build requires a git repo
# inside the project directory.
#
# Usage: bash hooks.test.sh   (exit 0 = all pass)

cd "$(dirname "$0")" || exit 1

failures=0

# run <hook> <command-json-escaped> -> echoes "deny" or "allow"
run() {
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$2" \
    | bash "$1" \
    | grep -q '"permissionDecision":"deny"' && echo deny || echo allow
}

check() {
  local hook="$1" expected="$2" cmd="$3"
  local actual
  actual="$(run "$hook" "$cmd")"
  if [ "$actual" = "$expected" ]; then
    echo "PASS [$expected] $cmd"
  else
    failures=$((failures + 1))
    echo "FAIL [want $expected, got $actual] $cmd"
  fi
}

echo "=== hooks Test ==="
echo
echo "--- check-tizen-commands: git route ---"
H=check-tizen-commands.sh
check $H allow 'git commit -m \"fix tz build -p flag\"'
check $H allow 'cd /home/user/tizen-apps/dali-demo && git commit -m \"fix tz build -p flag\"'
check $H allow 'cd proj && git commit -m \"document sdb forward tcp:8080 helper\"'
check $H allow 'GIT_EDITOR=true git commit --amend -m \"tz build -p\"'
check $H allow 'cd \"/w/my app\" && git commit -m \"tz build -p\"'
check $H allow 'cd /w/dali-demo && git init && git add -A && git commit -m \"initial for gbs\"'
check $H allow 'cd repo; git commit -m \"tizen build notes\"'
check $H allow 'gh pr create --body \"uses tz build -p\"'
check $H allow 'cd repo && gh pr create --body \"tz build -p\"'
check $H allow 'git push origin sdk3'

echo
echo "--- check-tizen-commands: real mistakes still denied ---"
# The cd-prefix strip must not become a bypass: only a git/gh command may skip
# the rules, not anything that happens to follow a cd.
check $H deny 'tz build -p /w/app'
check $H deny 'cd /w/app && tz build -p /w/app'
check $H deny 'cd /w/app && gdbserver :1234 ./app'
check $H deny 'tools/sdb/sdb devices'
# "git-foo" is not git — the route must require a whole word
check $H deny 'git-foo tz build -p x'

echo
echo "--- check-tizen-commands: sdb port forwarding (issue #84) ---"
# Plain, non-debug forwarding is what tizen-sdb-helper instructs — must be allowed.
# Regression: Rule 9 denied EVERY `forward tcp:` and then pointed at that skill,
# leaving no permitted way to forward a port.
check $H allow 'sdb forward tcp:8080 tcp:8080'
check $H allow 'sdb -s emulator-26101 forward tcp:9222 tcp:9222'
check $H allow '/c/tizen-sdk/tools/sdb.exe -s emulator-26101 forward tcp:9090 tcp:8080'
check $H allow '\"$TIZEN_SDK_PATH/tools/sdb\" -s 0123456789ABCDEF forward tcp:8000 tcp:8000'
check $H allow 'sdb -s emulator-26101 forward --list'
check $H allow 'sdb -s emulator-26101 forward --remove tcp:8080'
# Hand-rolled DEBUGGER forwarding is still denied (debugger named in the same command).
check $H deny 'sdb forward tcp:5039 tcp:5039 && gdb -ex \"target remote :5039\"'
check $H deny 'sdb -s emulator-26101 forward tcp:4711 tcp:4711 && sdb shell launch_app org.example.app __AUL_SDK__ NETCOREDBG'
check $H deny 'sdb forward tcp:1234 tcp:1234; lldb'
# The wrapper scripts keep their exemption.
check $H allow 'bash tizen-native-gdb-debug.sh -a org.example.app # sdb forward tcp:5039 tcp:5039 + gdb'
check $H allow 'node tizen-dotnet-debug-cli.js --forward tcp:4711 tcp:4711 netcoredbg'

echo
echo "--- check-tizen-commands: hunting for the sdb binary (issue #96) ---"
# The first step of the raw-sdb detour: locating sdb on the host instead of running
# the skill runner (which resolves sdb itself).
check $H deny 'which sdb'
check $H deny 'command -v sdb'
check $H deny 'type sdb'
check $H deny 'where sdb'
check $H deny 'where.exe sdb.exe'
check $H deny 'Get-Command sdb'
check $H deny 'get-command sdb.exe'
check $H deny 'find / -name sdb 2>/dev/null'
check $H deny 'find \"$HOME/tizen-sdk\" -iname sdb.exe'
check $H deny 'which sdb || ls ~/tizen-sdk/tools'
# Legitimate commands that merely contain the token must stay allowed.
check $H allow 'node sdb-helper-cli.js --request \"forward port 8080\"'
check $H allow 'node \"$CLI\" --request \"run shell command ls -la\"'
check $H allow 'ls ~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdb-helper-cli.js'
check $H allow 'which node'
check $H allow 'find . -name sdb-helper-cli.js'
check $H allow 'sdb -s emulator-26101 shell reboot'
check $H allow 'git commit -m \"hook: deny which sdb\"'

echo
echo "--- check-project-writes: git route ---"
W=check-project-writes.sh
check $W allow 'git commit -m \"touch up config.xml handling\"'
check $W allow 'cd /w/app && git commit -m \"touch up config.xml handling\"'
check $W allow 'GIT_EDITOR=true git commit -m \"config.xml notes\"'

echo
echo "--- check-project-writes: real writes still denied ---"
check $W deny 'echo x > /w/app/config.xml'
check $W deny 'cd /w/app && touch config.xml'
check $W deny 'cat > tizen-manifest.xml <<EOF'

echo
echo "--- show-envelope is PostToolUse: never denies ---"
# Optional: show-envelope.sh is not part of the tracked hook set yet.
if [ ! -f show-envelope.sh ]; then
  echo "SKIP show-envelope.sh not present"
else
  for c in 'cd r && git commit -m \"tizen-cli x\"' 'tizen-cli tizen-sdk build-project'; do
    if [ "$(run show-envelope.sh "$c")" = "allow" ]; then
      echo "PASS [allow] $c"
    else
      failures=$((failures + 1))
      echo "FAIL [want allow] $c"
    fi
  done
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "=== ALL PASS ==="
  exit 0
fi
echo "=== $failures FAILURE(S) ==="
exit 1
