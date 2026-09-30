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
# A git prefix must not exempt what FOLLOWS it. Regression: the route exempted
# the whole line once the first token was git/gh, so `git … && <anything>`
# skipped every rule (review finding D1).
check $H deny 'git --version && tools/sdb/sdb devices'
check $H deny 'git log -1 && which sdb'
check $H deny 'git status; tz build -p /w/app'
check $H deny 'git rev-parse HEAD | xargs echo && gdbserver :1234 ./app'
check $H deny 'cd /w/app && git init && tz build -p /w/app'
# …while separators INSIDE a quoted argument stay part of the git segment,
# and redirections are not separators.
check $H allow 'git commit -m \"deny which sdb; also tz build -p && more\"'
check $H allow 'git commit -m '"'"'tz build -p; which sdb'"'"''
check $H allow 'git push origin main 2>&1'
check $H allow 'git fetch --all >&2 && git status'
check $H allow 'git diff --quiet || git commit -am \"tz build -p notes\"'
check $H allow '(cd /w/app && git commit -m \"tz build -p\")'

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
echo "--- check-tizen-commands: kernel log by hand (issue #213) ---"
# Kernel logs are collected by the dlog-analyzer runner (kernel collect/stop/analyze);
# the raw dmesg / kmsg detour right after dlog-collect is denied.
check $H deny 'sdb shell dmesg'
check $H deny 'sdb -s emulator-26101 shell dmesg | tail -50'
check $H deny 'sdb shell cat /proc/kmsg'
check $H deny 'sdb shell dlogutil -b kmsg -d'
check $H deny '\"$SDB\" -s emulator-26101 shell \"dmesg | grep -i oom\"'
check $H allow 'node \"$CLI\" kernel collect'
check $H allow 'node \"$CLI\" kernel collect emulator-26101'
check $H allow 'node dlog-analyzer-cli.js kernel analyze'

echo
echo "--- check-tizen-commands: hand-typed diagnostic probes (issue #214) ---"
# top / ps / free / meminfo over sdb shell are what `investigate` and `probe run`
# do through the analyzer; typed by hand they are denied.
check $H deny 'sdb shell top -n 1'
check $H deny 'sdb -s emulator-26101 shell \"ps -ef | grep youtube\"'
check $H deny 'sdb shell cat /proc/meminfo'
check $H deny 'sdb shell free -m'
check $H deny 'sdb shell cat /proc/1234/status'
check $H deny 'sdb -s emulator-26101 shell uptime'
# Non-diagnostic shell commands, and the runners / wrappers, stay allowed.
check $H allow 'sdb -s emulator-26101 shell app_launcher -S'
check $H allow 'sdb shell pkgcmd -l'
check $H allow 'sdb shell ls /opt/usr/apps'
check $H allow 'node sdb-helper-cli.js --request \"shell top -n 1\"'
check $H allow 'node \"$CLI\" probe run cpu_top'
check $H allow 'node \"$CLI\" investigate --symptoms \"300% cpu, video not playing\"'
check $H allow 'bash tizen-native-gdb-debug.sh -a org.example.app # sdb shell ps'

echo
echo "--- check-tizen-commands: timer waits during dlog collection (issue #212) ---"
# Collection is interactive: the model must end its turn and ask the user to
# reproduce, not sleep and then stop/analyze.
check $H deny 'sleep 30 && node \"$CLI\" stop-collect'
check $H deny 'node \"$CLI\" dlog-collect org.example.app && sleep 60 && node \"$CLI\" stop-collect && node \"$CLI\" error-analyze org.example.app'
check $H deny 'sleep 2; node \"$CLI\" check'
check $H deny 'Start-Sleep -Seconds 30; node \"$CLI\" stop-collect'
check $H deny 'node \"$CLI\" kernel collect && sleep 20 && node \"$CLI\" kernel stop'
# A short pad between app-launch and dlog-collect is fine.
check $H allow 'node \"$CLI\" app-launch org.example.app && sleep 2 && node \"$CLI\" dlog-collect org.example.app'
check $H allow 'node \"$CLI\" dlog-collect org.example.app'
# A bare sleep is denied only while one of the runner's collectors is alive
# (PID file under <tmp>/tizen-dlog-analyzer/). Alive = this test shell; dead =
# a shell that has already exited. (A real collector left running under /tmp
# on the test machine would make the allow case fail — stop it first.)
sleep_tmp="$(mktemp -d)"
mkdir -p "$sleep_tmp/tizen-dlog-analyzer"
printf '%s' "$$" > "$sleep_tmp/tizen-dlog-analyzer/app-collect.pid"
TMPDIR="$sleep_tmp" TEMP="$sleep_tmp" TMP="$sleep_tmp" check $H deny 'sleep 30'
TMPDIR="$sleep_tmp" TEMP="$sleep_tmp" TMP="$sleep_tmp" check $H deny 'Start-Sleep -s 45'
TMPDIR="$sleep_tmp" TEMP="$sleep_tmp" TMP="$sleep_tmp" check $H allow 'sleep 2'
dead_pid="$(bash -c 'echo $$')"
printf '%s' "$dead_pid" > "$sleep_tmp/tizen-dlog-analyzer/app-collect.pid"
TMPDIR="$sleep_tmp" TEMP="$sleep_tmp" TMP="$sleep_tmp" check $H allow 'sleep 30'
rm -rf "$sleep_tmp"

echo
echo "--- check-skill-routing: symptom report delegated to device-manager (issue #211) ---"
R=check-skill-routing.sh
# route_check <expected deny|allow> <label> <payload>
route_check() {
  local expected="$1" label="$2" payload="$3" actual
  printf '%s' "$payload" | bash "$R" | grep -q '"permissionDecision":"deny"' && actual=deny || actual=allow
  if [ "$actual" = "$expected" ]; then
    echo "PASS [$expected] $label"
  else
    failures=$((failures + 1))
    echo "FAIL [want $expected, got $actual] $label"
  fi
}
route_check deny 'Agent device-manager: CPU 300% / video not playing' \
  '{"tool_name":"Agent","tool_input":{"subagent_type":"tizen-device-manager","description":"Find emulator","prompt":"While running a video in com.samsung.fh.youtube on the emulator the host CPU usage raised to 300% and the video is not playing. Investigate the issue."}}'
route_check deny 'Agent plugin-qualified device-manager: Korean crash report' \
  '{"tool_name":"Agent","tool_input":{"subagent_type":"tizen-sdk-skills:tizen-device-manager","prompt":"에뮬레이터에서 앱이 자꾸 죽어요. 원인 분석해줘"}}'
route_check deny 'Task device-manager: app freezes' \
  '{"tool_name":"Task","tool_input":{"subagent_type":"tizen-device-manager","prompt":"The app freezes after a few seconds on the emulator, check what is wrong"}}'
route_check deny 'Skill device-manager with crash args' \
  '{"tool_name":"Skill","tool_input":{"skill":"tizen-device-manager","args":"my app crashed on the emulator"}}'
route_check allow 'Agent device-manager: plain discovery' \
  '{"tool_name":"Agent","tool_input":{"subagent_type":"tizen-device-manager","prompt":"Find the connected Tizen device and return the envelope JSON only."}}'
route_check allow 'Agent device-manager: stop emulators' \
  '{"tool_name":"Agent","tool_input":{"subagent_type":"tizen-device-manager","prompt":"Stop all running emulator VMs"}}'
route_check allow 'Agent device-manager: TV emulator check (Korean)' \
  '{"tool_name":"Agent","tool_input":{"subagent_type":"tizen-device-manager","prompt":"TV 에뮬레이터 연결 확인해줘"}}'
route_check allow 'Agent device-manager: error-envelope instruction is not a symptom' \
  '{"tool_name":"Agent","tool_input":{"subagent_type":"tizen-device-manager","prompt":"List connected devices; on failure return the error envelope verbatim and log the serial."}}'
route_check allow 'Agent dlog-analyzer with symptoms is the right target' \
  '{"tool_name":"Agent","tool_input":{"subagent_type":"tizen-dlog-analyzer","prompt":"CPU 300%, video not playing - investigate"}}'
route_check allow 'Skill device-manager without args' \
  '{"tool_name":"Skill","tool_input":{"skill":"tizen-device-manager"}}'
route_check allow 'Skill run outside a Tizen project' \
  '{"tool_name":"Skill","tool_input":{"skill":"run","args":""}}'

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
# A git prefix must not exempt a write that follows it (review finding D1).
check $W deny 'git log -1 && echo x > /w/app/config.xml'
check $W deny 'git status; Set-Content -Path config.xml -Value \"<widget/>\"'
check $W deny 'echo \"<widget/>\" | tee /w/app/config.xml'

echo
echo "--- check-project-writes: writers aimed at OTHER files stay allowed ---"
# Regression (review finding D4): the writer word merely co-occurring with the
# file name was denied, so reading a manifest and touching a marker file in
# the same line was blocked.
check $W allow 'cat /w/app/config.xml && touch /w/app/notes.txt'
check $W allow 'grep foo /w/app/config.xml && New-Item -ItemType Directory /w/other'
check $W allow 'cat tizen-manifest.xml; touch .built'

echo
echo "--- Cline / Gemini adapters: write path extraction ---"
# Regression: both adapters cut the payload at the first "content"/"diff"/
# "old_string" BEFORE extracting the path. A tool call that put the body first
# lost its path, and the adapter answered allow — bypassing the config.xml /
# tizen-manifest.xml guard. They now take the first structural key and refuse
# a write whose path cannot be determined.
adapter_tmp="$(mktemp -d)"
mkdir -p "$adapter_tmp/cline/tizen-sdk-skills" "$adapter_tmp/gemini"
cp ../../cline/hooks/PreToolUse "$adapter_tmp/cline/PreToolUse"
cp check-tizen-commands.sh check-project-writes.sh "$adapter_tmp/cline/tizen-sdk-skills/"
cp ../../gemini/hooks/BeforeTool "$adapter_tmp/gemini/BeforeTool"
cp check-tizen-commands.sh check-project-writes.sh "$adapter_tmp/gemini/"
existing_cfg="$adapter_tmp/existing/config.xml"
mkdir -p "$(dirname "$existing_cfg")" && printf '<widget/>' > "$existing_cfg"
missing_cfg="$adapter_tmp/newapp/config.xml"

# adapter_check <cline|gemini> <expected deny|allow> <label> <payload>
adapter_check() {
  local host="$1" expected="$2" label="$3" payload="$4" out actual
  if [ "$host" = cline ]; then
    out="$(printf '%s' "$payload" | bash "$adapter_tmp/cline/PreToolUse")"
    printf '%s' "$out" | grep -q '"cancel": true' && actual=deny || actual=allow
  else
    out="$(printf '%s' "$payload" | bash "$adapter_tmp/gemini/BeforeTool")"
    printf '%s' "$out" | grep -q '"decision":"deny"' && actual=deny || actual=allow
  fi
  if [ "$actual" = "$expected" ]; then
    echo "PASS [$host $expected] $label"
  else
    failures=$((failures + 1))
    echo "FAIL [$host want $expected, got $actual] $label"
  fi
}

# (a) body BEFORE path, new config.xml → deny
adapter_check cline deny 'content before path (new config.xml)' \
  '{"hookName":"PreToolUse","preToolUse":{"toolName":"write_to_file","parameters":{"content":"<widget/>","path":"'"$missing_cfg"'"}}}'
adapter_check gemini deny 'content before file_path (new config.xml)' \
  '{"hook_event_name":"BeforeTool","tool_name":"write_file","tool_input":{"content":"<widget/>","file_path":"'"$missing_cfg"'"}}'
# (b) body carries an escaped decoy \"path\" — the structural key must win
adapter_check cline deny 'escaped decoy path inside content' \
  '{"hookName":"PreToolUse","preToolUse":{"toolName":"write_to_file","parameters":{"content":"x \\"path\\":\\"/tmp/decoy.txt\\" y","path":"'"$missing_cfg"'"}}}'
adapter_check gemini deny 'escaped decoy file_path inside content' \
  '{"hook_event_name":"BeforeTool","tool_name":"write_file","tool_input":{"content":"x \\"file_path\\":\\"/tmp/decoy.txt\\" y","file_path":"'"$missing_cfg"'"}}'
# (b2) a structural decoy key OUTSIDE the tool parameters (host metadata that
#      precedes them) must not be taken for the write target
adapter_check cline deny 'structural decoy path before parameters' \
  '{"hookName":"PreToolUse","context":{"path":"'"$existing_cfg"'"},"preToolUse":{"toolName":"write_to_file","parameters":{"content":"<widget/>","path":"'"$missing_cfg"'"}}}'
adapter_check gemini deny 'structural decoy file_path before tool_input' \
  '{"hook_event_name":"BeforeTool","session":{"file_path":"'"$existing_cfg"'"},"tool_name":"write_file","tool_input":{"content":"<widget/>","file_path":"'"$missing_cfg"'"}}'
# (c) write with no path at all → refuse rather than guess (also when a decoy
#     "path" exists outside the parameters — it must not be borrowed)
adapter_check cline deny 'write_to_file without path' \
  '{"hookName":"PreToolUse","preToolUse":{"toolName":"write_to_file","parameters":{"content":"<widget/>"}}}'
adapter_check cline deny 'write_to_file without path, decoy path outside parameters' \
  '{"hookName":"PreToolUse","context":{"path":"'"$existing_cfg"'"},"preToolUse":{"toolName":"write_to_file","parameters":{"content":"<widget/>"}}}'
adapter_check gemini deny 'write_file without file_path' \
  '{"hook_event_name":"BeforeTool","tool_name":"write_file","tool_input":{"content":"<widget/>"}}'
# (d) editing an EXISTING config.xml stays allowed, path first or last
adapter_check cline allow 'existing config.xml, content first' \
  '{"hookName":"PreToolUse","preToolUse":{"toolName":"replace_in_file","parameters":{"diff":"x","path":"'"$existing_cfg"'"}}}'
adapter_check gemini allow 'existing config.xml, path first' \
  '{"hook_event_name":"BeforeTool","tool_name":"replace","tool_input":{"file_path":"'"$existing_cfg"'","old_string":"a","new_string":"b"}}'
# (e) other files are never blocked, and unrelated tools pass through
adapter_check cline allow 'plain file write' \
  '{"hookName":"PreToolUse","preToolUse":{"toolName":"write_to_file","parameters":{"content":"hi","path":"'"$adapter_tmp"'/notes.txt"}}}'
adapter_check gemini allow 'unrelated tool' \
  '{"hook_event_name":"BeforeTool","tool_name":"read_file","tool_input":{"file_path":"'"$missing_cfg"'"}}'
rm -rf "$adapter_tmp"

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
