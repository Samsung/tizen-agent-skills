#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# PreToolUse hook for tizen-sdk-skills — Skill tool routing guard.
#
# Observed failure mode: asked to RUN a Tizen app ("MyApp 실행해줘"), the model
# invokes the harness's generic `run` skill (project-runner) instead of
# tizen-install-app. The generic skill then probes the filesystem and tries to
# launch the app on the HOST, which cannot work for a Tizen package — it must
# be installed and launched on a device/emulator via app_launcher.
#
# Policy: deny Skill("run") when the working directory looks like a Tizen
# project (config.xml / tizen-manifest.xml / tizen_workspace.yaml / built
# .wgt/.tpk at cwd or one level down), steering to tizen-install-app (or
# tizen-build-project when nothing is built yet).
#
# stdin : {"tool_name":"Skill","tool_input":{"skill":"run","args":"..."},...}
# stdout: deny JSON (same convention as check-tizen-commands.sh)
# exit  : always 0 (deny is signalled via JSON, not exit code)

input="$(cat)"

skill="$(printf '%s' "$input" | sed -nE 's/.*"skill"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p')"
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

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
  "This is a Tizen project - the generic run skill cannot launch it on the host. A Tizen app runs on a DEVICE/EMULATOR: use the tizen-install-app skill, which installs the built .wgt/.tpk via the shipped runner (lib/cli/project-manager-cli.js) and launches it with app_launcher, returning a JSON envelope. If no package is built yet, run tizen-build-project first (its Handoff routes back to install/run). Path note for Bash: never use unquoted backslash Windows paths - quote them or use forward slashes (C:/Users/... or /c/Users/...)."
exit 0
