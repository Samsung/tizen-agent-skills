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

# The Tizen tooling rules of check-tizen-commands.sh apply only when an SDK is
# configured (~/.tizen.sdk.path.config, issue #47). Point the hook at a test
# config so the rule tests do not depend on the machine running them; the
# "scope gate" section below swaps in a missing / other config on purpose.
cfg_tmp="$(mktemp -d)"
printf '/opt/tizen-sdk\n' > "$cfg_tmp/posix.config"
printf 'C:\\tizen-sdk\r\n' > "$cfg_tmp/windows.config"
printf '/opt/tizen studio/sdk\n' > "$cfg_tmp/spaces.config"
export TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/posix.config"
trap 'rm -rf "$cfg_tmp"' EXIT

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
check $H deny 'git log -1 && /opt/tizen-studio/tools/sdb devices'
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
check $H allow '/opt/tizen-sdk/tools/sdb -s emulator-26101 forward tcp:9090 tcp:8080'
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
echo "--- check-tizen-commands: tizen CLI and sdb lookups are not blocked (issue #47) ---"
# Rules 5 and 16 are gone: a read-only check for the tooling is a legitimate
# environment question, and the tizen CLI does exist for Tizen Studio users.
check $H allow 'which sdb'
check $H allow 'command -v sdb'
check $H allow 'type sdb'
check $H allow 'where.exe sdb.exe'
check $H allow 'Get-Command sdb'
check $H allow 'find / -name sdb 2>/dev/null'
check $H allow 'which sdb && sdb devices'
check $H allow 'tizen version'
check $H allow 'tizen version; tizen list templates'
check $H allow 'tizen build-native -- /w/app'
check $H allow 'tizen security-profiles list'
check $H allow 'export PATH=\"$HOME/tizen-studio/tools:$PATH\"'
check $H allow 'sdb devices'
check $H allow 'sdb version'
# …and the runners / unrelated commands that merely contain the token, as before.
check $H allow 'node sdb-helper-cli.js --request \"forward port 8080\"'
check $H allow 'node \"$CLI\" --request \"run shell command ls -la\"'
check $H allow 'ls ~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdb-helper-cli.js'
check $H allow 'which node'
check $H allow 'find . -name sdb-helper-cli.js'
check $H allow 'sdb -s emulator-26101 shell reboot'

echo
echo "--- check-tizen-commands: sdb outside the configured SDK (Rule 7, issue #47) ---"
# The configured SDK is /opt/tizen-sdk (test config). An sdb invoked from another
# directory is denied; the configured one, variables, cwd-relative and bare sdb pass.
check $H deny '/opt/tizen-studio/tools/sdb devices'
check $H deny '~/tizen-studio/tools/sdb devices'
check $H deny '\"/opt/tizen-studio/tools/sdb\" -s emulator-26101 shell ls'
check $H deny '/opt/tizen-sdk/tools/tizen-core/sdb devices'
check $H deny 'ls /opt/other-sdk/tools && /opt/other-sdk/tools/sdb devices'
check $H deny 'SDB=/opt/tizen-studio/tools/sdb; $SDB devices'
check $H deny '& \"C:\\tizen-studio\\tools\\sdb.exe\" devices'
check $H deny '/c/tizen-studio/tools/sdb.exe devices'
check $H allow '/opt/tizen-sdk/tools/sdb devices'
check $H allow '/opt/tizen-sdk/tools/sdb -s emulator-26101 shell ls'
check $H allow '\"/opt/tizen-sdk/tools/sdb\" devices'
check $H allow '/opt/tizen-sdk//tools/sdb devices'
check $H allow 'SDB=/opt/tizen-sdk/tools/sdb; $SDB devices'
check $H allow '\"$TIZEN_SDK_PATH/tools/sdb\" devices'
check $H allow '$SDK/tools/sdb devices'
check $H allow '%TIZEN_SDK%\\tools\\sdb.exe devices'
check $H allow 'cd /opt/tizen-sdk/tools && ./sdb devices'
check $H allow 'sdb devices'
check $H allow 'cat /opt/tizen-studio/tools/sdbd.conf'
check $H allow 'node /opt/tizen-studio/tools/sdb-helper-cli.js'
check $H allow 'git commit -m \"use /opt/tizen-studio/tools/sdb\"'
# A tilde resolves against $HOME.
HOME=/opt check $H allow '~/tizen-sdk/tools/sdb devices'
HOME=/home/user check $H deny '~/tizen-sdk/tools/sdb devices'
# Windows SDK path in the config: backslash / forward-slash / MSYS spellings all match.
# (An UNQUOTED C:\\… path in a Bash command is Rule 15's business and denied there.)
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/windows.config" check $H allow '& \"C:\\tizen-sdk\\tools\\sdb.exe\" devices'
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/windows.config" check $H allow '\"C:\\tizen-sdk\\tools\\sdb.exe\" devices'
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/windows.config" check $H allow 'c:/tizen-sdk/tools/sdb.exe devices'
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/windows.config" check $H allow '/c/tizen-sdk/tools/sdb.exe -s emulator-26101 forward tcp:9090 tcp:8080'
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/windows.config" check $H deny '& \"C:\\tizen-studio\\tools\\sdb.exe\" devices'
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/windows.config" check $H deny '/opt/tizen-sdk/tools/sdb devices'
# A configured path with a space in it: the quoted sdb path must not be split on it.
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/spaces.config" check $H allow '\"/opt/tizen studio/sdk/tools/sdb\" devices'
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/spaces.config" check $H deny '\"/opt/tizen studio/other/tools/sdb\" devices'

echo
echo "--- check-tizen-commands: scope gate — no SDK configured (issue #47) ---"
# Without ~/.tizen.sdk.path.config the Tizen tooling rules do not apply at all;
# the shell-syntax rules still do.
check_nocfg() { TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/missing.config" check "$@"; }
check_nocfg $H allow 'tz build -p /w/app'
check_nocfg $H allow 'tools/sdb/sdb devices'
check_nocfg $H allow '/opt/tizen-studio/tools/sdb devices'
check_nocfg $H allow 'which sdb && sdb devices'
check_nocfg $H allow 'tizen version'
check_nocfg $H allow 'export PATH=\"$HOME/tizen-studio/tools:$PATH\"'
check_nocfg $H allow 'em-cli list-vm'
check_nocfg $H allow 'sdb shell dmesg'
check_nocfg $H allow 'gdbserver :1234 ./app'
check_nocfg $H deny 'powershell -File /c/Users/me/setup.ps1'
check_nocfg $H deny 'ls C:\\Users\\me\\app'
check_nocfg $H deny 'ls 2>$null'
# An empty config file counts as "not configured".
: > "$cfg_tmp/empty.config"
TIZEN_SDK_SKILLS_SDK_CONFIG="$cfg_tmp/empty.config" check $H allow 'tz build -p /w/app'

echo
echo "--- check-tizen-commands: finding emulator VMs by hand (issue #268) ---"
# "Provide the list of emulators available" is tizen-create-emulator's list-vm; a raw
# em-cli call or a directory walk over <sdk>-data/emulator/vms is the manual detour.
check $H deny 'em-cli list-vm'
check $H deny '~/tizen-sdk/tools/emulator/bin/em-cli list-vm -d'
check $H deny '\"$HOME/tizen-sdk/tools/emulator/bin/em-cli\" list-vm'
check $H deny '/c/tizen-sdk/tools/emulator/bin/em-cli.bat list-vm'
check $H deny 'EMCLI=~/tizen-sdk/tools/emulator/bin/em-cli; \"$EMCLI\" list-vm'
check $H deny 'em-cli.exe list-vm'
check $H deny 'C:\\tizen-sdk\\tools\\emulator\\bin\\em-cli.bat list-vm -d'
check $H deny '& \"$env:USERPROFILE\\tizen-sdk\\tools\\emulator\\bin\\em-cli.bat\" list-vm'
check $H deny '${EMCLI} list-vm'
check $H deny 'EM_CLI=~/tizen-sdk/tools/emulator/bin/em-cli; $EM_CLI list-vm -d'
check $H deny 'cd ~/tizen-sdk/tools/emulator/bin && ./em-cli list-vm'
check $H deny 'cd ~/tizen-sdk/tools/emulator/bin && ./em-cli'
check $H deny 'em-cli --help'
check $H deny 'em-cli list-vm | tail -5'
check $H deny 'ls ~/tizen-sdk-data/emulator/vms'
check $H deny 'ls -la \"$HOME/tizen-sdk-data/emulator/vms/\"'
check $H deny 'find / -path \"*emulator/vms*\" -name vm_config.xml 2>/dev/null'
check $H deny 'Get-ChildItem \"$env:USERPROFILE\\tizen-sdk-data\\emulator\\vms\"'
check $H deny 'cat ~/tizen-sdk-data/emulator/vms/my-vm/vm_config.xml'
# The runner and the wrapper scripts stay allowed, and so do unrelated commands that
# merely contain "emulator" or "-cli".
check $H allow 'node \"$CLI\" list-vm --detail'
check $H allow 'node emulator-manager-cli.js list-vm'
check $H allow 'node \"$CLI\" launch --vm-name my-vm'
check $H allow 'node \"$CLI\" create --vm-name my-vm --size 1080 --file-sharing-path ~/tizen-sdk-data/emulator/vms/share'
check $H allow 'bash tizen-emulator-manager.sh -a list-vm -p tizen'
check $H allow 'ls ~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/emulator-manager-cli.js'
check $H allow 'ls ~/tizen-sdk/platforms/tizen-10.0/tv-samsung/emulator-resources/skins'
check $H allow 'ls ~/tizen-sdk-data/emulator/vmsnapshots'
# A MENTION of the word is not an invocation: contributors grep the docs and code for it.
check $H allow 'grep -rn em-cli common/skills/tizen-create-emulator/SKILL.md'
check $H allow 'cat common/lib/core/emulator.js | grep em-cli'
check $H allow 'echo $EMCLI'
check $H allow 'node system-cli.js info'
check $H allow 'git commit -m \"hook: deny raw em-cli list-vm\"'

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
echo "--- check-tizen-commands: hand-typed network diagnostics over sdb shell (Rule 18b) ---"
# openssl s_client / curl / wget on the device are the consent-gated
# network-egress probes (reachability, tls-handshake); typed by hand they are
# denied, in every spelling the runner itself would never produce.
check $H deny 'sdb shell openssl s_client -connect example.com:443'
check $H deny 'sdb shell \"openssl s_client -connect example.com:443 </dev/null\"'
check $H deny 'sdb -s emulator-26101 shell curl -I https://example.com'
check $H deny 'sdb shell \"curl -sS https://example.com\"'
check $H deny 'sdb shell wget -O- http://example.com'
check $H deny 'sdb shell \"su - -c curl https://example.com\"'
check $H deny 'sdb shell \"timeout 5 curl https://example.com\"'
check $H deny 'SDB shell curl https://example.com'
# Other openssl subcommands, look-alike names, host-side curl and the runners
# stay allowed.
check $H allow 'sdb shell openssl version'
check $H allow 'sdb shell curlx'
check $H allow 'sdb shell mycurl'
check $H allow 'curl https://example.com'
check $H allow 'sdb shell \"echo hi\" && curl https://example.com'
check $H allow 'node \"$CLI\" probe run tls-handshake --allow-network-probe'
check $H allow 'node \"$CLI\" investigate --symptoms \"dns timeout\" --allow-network-probe'
check $H allow 'node sdb-helper-cli.js --request \"shell curl https://example.com\"'

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
echo "--- check-update.js: new-release notice (no network) ---"
# GitHub is never contacted: a fresh cache answers without a fetch, and a due
# fetch goes through HTTPS_PROXY on a closed local port. Node 20 (CI) skips the
# fetch outright behind a proxy; Node 22.21+/24 re-runs with NODE_USE_ENV_PROXY
# and the closed port fails at once. Either way the fetch fails.
uc_tmp="$(mktemp -d)"
uc_cache="$uc_tmp/user/.tizen.agent.update.json"
uc_dead_proxy="http://127.0.0.1:1"
mkdir -p "$uc_tmp/user" "$uc_tmp/plugins/tizen-sdk-skills/1.4.2" \
  "$uc_tmp/plugins/tizen-sdk-skills/1.4.10"
uc_now="$(node -e 'console.log(Date.now())')"

# uc <host> [VAR=value...] -> stdout of check-update.js
uc() {
  local host="$1"; shift
  env -u HTTPS_PROXY -u https_proxy -u NODE_USE_ENV_PROXY -u NODE_OPTIONS \
    HOME="$uc_tmp/user" "$@" \
    node check-update.js --host "$host" --cache-root "$uc_tmp/plugins" </dev/null
}
# uc_cache_set <hours-ago> <failed> <latest-json>
uc_cache_set() {
  printf '{"checkedAt":%s,"failed":%s,"latest":%s}' \
    "$((uc_now - $1 * 3600000))" "$2" "$3" > "$uc_cache"
}
# uc_field <name> -> the cache field, JSON-encoded
uc_field() {
  node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(JSON.stringify(c[process.argv[2]]))' \
    "$uc_cache" "$1"
}
uc_expect() {
  if [ "$2" = "$3" ]; then
    echo "PASS $1"
  else
    failures=$((failures + 1))
    echo "FAIL $1 (want $3, got $2)"
  fi
}
uc_contains() {
  case "$2" in
    *"$3"*) echo "PASS $1" ;;
    *) failures=$((failures + 1)); echo "FAIL $1 (missing $3 in: $2)" ;;
  esac
}

uc_cache_set 1 false '{"tizen-sdk-skills":"1.5.0","tizen-action-skills":"9.0.0"}'
out="$(uc claude)"
uc_contains "claude: notice names the highest installed version (1.4.10 > 1.4.2)" \
  "$out" 'tizen-sdk-skills 1.5.0 (installed 1.4.10)'
uc_contains "claude: notice is a systemMessage" "$out" '"systemMessage"'
uc_contains "claude: notice is SessionStart additionalContext" "$out" '"hookEventName":"SessionStart"'
# The VS Code extension does not display systemMessage: the model must relay it.
uc_contains "claude: model context asks to relay the notice" "$out" 'Please begin your first reply with one short line passing it on'
uc_expect "a plugin that is not installed is not reported" \
  "$(printf '%s' "$out" | grep -c 'tizen-action-skills 9.0.0')" "0"

# The same notice is shown at most once a day, across hosts.
uc_expect "same notice again the same day: claude prints nothing" "$(uc claude)" ""
uc_expect "same notice again the same day: cline prints only cancel:false" \
  "$(uc cline)" '{"cancel":false}'
uc_expect "the shown notice is recorded" "$(uc_field notified)" \
  '"tizen-sdk-skills 1.5.0 (installed 1.4.10)"'
uc_expect "the shown notice time is recorded readably" \
  "$(uc_field notifiedAtText | grep -cE '^"[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [+-][0-9]{2}:[0-9]{2}"$')" "1"

uc_cache_set 1 false '{"tizen-sdk-skills":"1.5.0"}'
out="$(uc cline)"
uc_contains "cline: notice is contextModification" "$out" '"contextModification"'
uc_contains "cline: never cancels the task" "$out" '"cancel":false'
uc_contains "cline: context asks to relay the notice" "$out" 'Please begin your first reply with one short line passing it on'

# A newer release is a different notice: shown at once, not a day later.
node -e 'const fs=require("fs"),f=process.argv[1],c=JSON.parse(fs.readFileSync(f));c.latest={"tizen-sdk-skills":"1.6.0"};fs.writeFileSync(f,JSON.stringify(c))' "$uc_cache"
uc_contains "a newer release is shown the same day" "$(uc claude)" 'tizen-sdk-skills 1.6.0 (installed 1.4.10)'

# A day after it was shown, the same notice comes back.
node -e 'const fs=require("fs"),f=process.argv[1],c=JSON.parse(fs.readFileSync(f));c.notifiedAt-=25*3600e3;fs.writeFileSync(f,JSON.stringify(c))' "$uc_cache"
uc_contains "the same notice is shown again a day later" "$(uc claude)" 'tizen-sdk-skills 1.6.0'

# Re-fetching the catalog must not forget what was shown.
node -e 'const fs=require("fs"),f=process.argv[1],c=JSON.parse(fs.readFileSync(f));c.checkedAt-=25*3600e3;fs.writeFileSync(f,JSON.stringify(c))' "$uc_cache"
uc_expect "a catalog re-check keeps today's shown notice quiet" \
  "$(uc claude HTTPS_PROXY="$uc_dead_proxy")" ""

uc_cache_set 1 false '{"tizen-sdk-skills":"1.4.10"}'
uc_expect "claude: same version prints nothing" "$(uc claude)" ""
uc_expect "cline: same version prints only cancel:false" "$(uc cline)" '{"cancel":false}'

uc_expect "unknown host prints nothing" "$(uc foo)" ""
uc_expect "unknown host exits 0" "$(uc foo >/dev/null; echo $?)" "0"

uc_cache_set 1 true '{}'
before="$(uc_field checkedAt)"
uc claude HTTPS_PROXY="$uc_dead_proxy" >/dev/null
uc_expect "failed 1 h ago: no retry yet (4 h window)" "$(uc_field checkedAt)" "$before"

uc_cache_set 5 true '{"tizen-sdk-skills":"1.5.0"}'
before="$(uc_field checkedAt)"
out="$(uc claude HTTPS_PROXY="$uc_dead_proxy")"
uc_expect "failed 5 h ago: retried (checkedAt moved)" \
  "$([ "$(uc_field checkedAt)" != "$before" ] && echo moved || echo same)" "moved"
uc_expect "failed retry keeps failed:true" "$(uc_field failed)" "true"
uc_expect "checkedAtText is the same instant as checkedAt" \
  "$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1]));const t=c.checkedAtText.replace(" ","T").replace(" ","");console.log(Date.parse(t)===Math.floor(c.checkedAt/1000)*1000)' "$uc_cache")" "true"
uc_expect "failed retry keeps the last known versions" \
  "$(uc_field latest)" '{"tizen-sdk-skills":"1.5.0"}'
uc_contains "failed retry still reports from the last known versions" \
  "$out" 'tizen-sdk-skills 1.5.0 (installed 1.4.10)'

uc_cache_set 23 false '{"tizen-sdk-skills":"1.4.10"}'
before="$(uc_field checkedAt)"
uc claude HTTPS_PROXY="$uc_dead_proxy" >/dev/null
uc_expect "succeeded 23 h ago: no re-check yet (24 h window)" "$(uc_field checkedAt)" "$before"

printf 'not json' > "$uc_cache"
out="$(uc claude HTTPS_PROXY="$uc_dead_proxy")"
uc_expect "corrupt cache: nothing printed" "$out" ""
uc_expect "corrupt cache: replaced by a failed record" "$(uc_field failed)" "true"

# Behind a proxy a fresh cache must not re-spawn Node for proxy support.
printf 'require("fs").appendFileSync(%s, "x\\n")\n' "'$uc_tmp/spawns'" > "$uc_tmp/count.js"
uc_cache_set 1 false '{"tizen-sdk-skills":"1.4.10"}'
: > "$uc_tmp/spawns"
uc claude HTTPS_PROXY="$uc_dead_proxy" NODE_OPTIONS="--require $uc_tmp/count.js" >/dev/null
uc_expect "proxy + fresh cache: one Node process" "$(wc -l < "$uc_tmp/spawns" | tr -d ' ')" "1"
rm -rf "$uc_tmp"

echo
if [ "$failures" -eq 0 ]; then
  echo "=== ALL PASS ==="
  exit 0
fi
echo "=== $failures FAILURE(S) ==="
exit 1
