#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# PreToolUse hook for tizen-sdk-skills — Skill / Agent routing guard.
#
# Two observed mis-routings, one script:
#
# (1) Asked to RUN a Tizen app ("MyApp 실행해줘"), the model invokes the
#     harness's generic `run` skill (project-runner) instead of
#     tizen-install-app. The generic skill then probes the filesystem and tries
#     to launch the app on the HOST, which cannot work for a Tizen package — it
#     must be installed and launched on a device/emulator via app_launcher.
#     Policy: deny Skill("run") when the working directory looks like a Tizen
#     project (config.xml / tizen-manifest.xml / tizen_workspace.yaml / built
#     .wgt/.tpk at cwd or one level down), steering to tizen-install-app (or
#     tizen-build-project when nothing is built yet).
#
# (2) A PROBLEM REPORT that happens to mention the emulator or device ("the
#     emulator's CPU went to 300% and the video does not play in
#     com.samsung.fh.youtube — investigate") is delegated to
#     tizen-device-manager, which only answers "which devices are connected?"
#     and "stop the emulator" (issue #211). The symptom then never reaches
#     tizen-dlog-analyzer unless the user names that skill explicitly.
#     Policy: deny Agent/Task(subagent_type ~ tizen-device-manager) and
#     Skill("tizen-device-manager") when the prompt/args carry symptom or
#     investigation words (crash, freeze, hang, CPU, memory, leak, slow, video
#     not playing, exception, investigate, analyze, root cause, dlog, 크래시,
#     느려, 분석, 조사, 원인 …), steering to tizen-dlog-analyzer.
#
# stdin : {"tool_name":"Skill","tool_input":{"skill":"run","args":"..."},...}
#         {"tool_name":"Agent","tool_input":{"subagent_type":"…tizen-device-manager","prompt":"..."},...}
# stdout: deny JSON (same convention as check-tizen-commands.sh)
# exit  : always 0 (deny is signalled via JSON, not exit code)

input="$(cat)"

# Raw JSON-escaped string value for a key (keeps \\ and \" pairs intact).
json_val() {
  printf '%s' "$1" | sed -nE 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"((\\.|[^"\\])*)".*/\1/p'
}

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
  exit 0
}

tool="$(printf '%s' "$input" | sed -nE 's/.*"tool_name"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"
skill="$(json_val "$input" skill)"
subagent="$(json_val "$input" subagent_type)"

# ---------------------------------------------------------------------------
# (2) symptom report delegated to tizen-device-manager → tizen-dlog-analyzer
# ---------------------------------------------------------------------------
target=""
text=""
case "$tool" in
  Agent|Task)
    case "$subagent" in
      *tizen-device-manager) target="$subagent"; text="$(json_val "$input" prompt) $(json_val "$input" description)" ;;
    esac
    ;;
  Skill)
    case "$skill" in
      *tizen-device-manager) target="$skill"; text="$(json_val "$input" args)" ;;
    esac
    ;;
esac

if [ -n "$target" ] && [ -n "$text" ]; then
  # Symptom / investigation vocabulary. Deliberately NOT bare "error"/"log"/
  # "why": a legitimate device-manager prompt may say "return the error
  # envelope" or "log the serial", and those must stay routable.
  symptom_re='(crash|freez|hang(s|ing|ed)?\b|not[[:space:]]+(respond|play|work|load|start)|stuck|stutter|lag(gy|ging|s)?\b|slow|cpu|memory|leak|oom|black[[:space:]]+screen|no[[:space:]]+(audio|sound|video)|exception|segfault|sigsegv|abort|investigat|analy[sz]|root[[:space:]]+cause|diagnos|dlog|kernel[[:space:]]+log|dmesg|[0-9]+[[:space:]]*%|크래시|죽|튕|멈|느려|먹통|재생|안[[:space:]]*(돼|됨|되)|오류|에러|예외|분석|조사|원인|진단|로그)'
  if printf '%s' "$text" | grep -Eiq -e "$symptom_re"; then
    deny "This is a PROBLEM REPORT / investigation, not a device-discovery task - tizen-device-manager only finds connected devices and stops emulators; it cannot analyze a crash, freeze, high CPU, memory, or playback symptom even when the emulator is mentioned. Route it to the tizen-dlog-analyzer skill/agent instead: it runs node <plugin>/lib/cli/dlog-analyzer-cli.js investigate --symptoms \"<the user's words>\" [app-id] (probe bundles + collected dlog), start start-monitoring / dlog-collect <app-id> for crash and error collection, kernel collect for the kernel log, then asks the user to reproduce and analyzes with check / error-analyze / kernel analyze. If you only need to know whether a device is connected, tizen-dlog-analyzer's runner already returns device_not_found / multiple_devices on its own."
  fi
fi

# ---------------------------------------------------------------------------
# (1) generic `run` skill inside a Tizen project → tizen-install-app
# ---------------------------------------------------------------------------
[ "$skill" = "run" ] || exit 0

# Tizen markers at cwd or one directory level down (the session often sits in
# the workspace parent with the app folder inside it).
is_tizen=0
for f in config.xml tizen-manifest.xml tizen_workspace.yaml \
         */config.xml */tizen-manifest.xml */tizen_workspace.yaml; do
  [ -e "$f" ] && { is_tizen=1; break; }
done
if [ "$is_tizen" -eq 0 ]; then
  # a built package anywhere shallow also marks a Tizen project
  if ls ./*.wgt ./*.tpk ./*/*.wgt ./*/*.tpk ./*/*/*.wgt ./*/*/*.tpk 2>/dev/null | grep -q .; then
    is_tizen=1
  fi
fi
[ "$is_tizen" -eq 1 ] || exit 0

deny "This is a Tizen project - the generic run skill cannot launch it on the host. A Tizen app runs on a DEVICE/EMULATOR: use the tizen-install-app skill, which installs the built .wgt/.tpk via the shipped runner (lib/cli/project-manager-cli.js) and launches it with app_launcher, returning a JSON envelope. If no package is built yet, run tizen-build-project first (its Handoff routes back to install/run). Path note for Bash: never use unquoted backslash Windows paths - quote them or use forward slashes (C:/Users/... or /c/Users/...)."
