#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

#
# setup-remote.sh — install tizen-sdk-skills without cloning the repository.
#
# Downloads the tizen-agent-skills source zip from GitHub, runs the regular
# setup scripts from the extracted copy, and deletes the download (zip and
# extracted tree) when the setup succeeds. Nothing is left on disk: the setup
# scripts copy everything they need into the host's own directories.
#
# Self-contained on purpose: it may be run straight from the download
# (bash <(curl -fsSL <raw-url>)) as well as from a checkout.
#
# Usage:
#   bash setup-remote.sh [--harness <claude|cline|codex|gemini>]
#                        [--ref <branch|tag>] [--keep]
#                        [--skip-validation] [--no-restart]
#
# Without --harness every host is installed (the setup-all path). --ref accepts
# a branch (main) or a release tag (tizen-agent-skills-vX.Y.Z). --keep retains
# the downloaded source, as does a failed setup (kept for debugging).
#
# The PowerShell twin (setup-remote.ps1, with setup-remote.bat) behaves the
# same on Windows.

set -uo pipefail

REPO_BASE="https://github.com/Samsung/tizen-agent-skills"
HARNESS=""
REF="main"
KEEP=false
PASS_ARGS=()

usage() {
  sed -n '16,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

info()  { echo -e "\033[36m[Info]\033[0m $1"; }
ok()    { echo -e "\033[32m[Success]\033[0m $1"; }
warn()  { echo -e "\033[33m[Warning]\033[0m $1"; }
fail()  { echo -e "\033[31m[Error]\033[0m $1" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --harness)
      [[ -n "${2-}" ]] || { fail "--harness requires a value"; exit 1; }
      HARNESS="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')"
      shift 2 ;;
    --ref)
      [[ -n "${2-}" ]] || { fail "--ref requires a value"; exit 1; }
      REF="$2"; shift 2 ;;
    --keep) KEEP=true; shift ;;
    --skip-validation|--no-restart) PASS_ARGS+=("$1"); shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option: $1"; echo; usage; exit 1 ;;
  esac
done

case "$HARNESS" in
  ""|claude|cline|codex|gemini) ;;
  *) fail "--harness must be one of: claude, cline, codex, gemini"; exit 1 ;;
esac

WORK="$(mktemp -d "${TMPDIR:-/tmp}/tizen-sdk-skills-setup.XXXXXX")" || {
  fail "cannot create a temporary directory"; exit 1;
}
ZIP_PATH="$WORK/tizen-agent-skills-$REF.zip"
SRC_DIR="$WORK/src"

# Deletes the download when the setup succeeded and --keep was not given.
STATUS=0
cleanup() {
  if [[ "$KEEP" == true ]]; then
    info "Download kept at: $WORK"
  elif [[ $STATUS -ne 0 ]]; then
    warn "setup failed; the download was kept at: $WORK (delete it yourself when done)"
  else
    rm -rf "$WORK" && ok "Removed the downloaded source: $WORK"
  fi
}
trap cleanup EXIT

download() { # <url> <dest>
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --max-time 1800 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    return 1
  fi
}

extract() { # <zip> <dest>
  if command -v unzip >/dev/null 2>&1; then
    unzip -qo "$1" -d "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  elif command -v powershell.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
    # Git Bash on Windows: no unzip, but Expand-Archive is always there.
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \
      "Expand-Archive -LiteralPath '$(cygpath -w "$1")' -DestinationPath '$(cygpath -w "$2")' -Force"
  else
    return 1
  fi
}

info "Downloading tizen-agent-skills ($REF) from GitHub..."
STATUS=1
for url in "$REPO_BASE/archive/refs/heads/$REF.zip" "$REPO_BASE/archive/refs/tags/$REF.zip"; do
  rm -f "$ZIP_PATH"
  if download "$url" "$ZIP_PATH"; then STATUS=0; break; fi
done
if [[ $STATUS -ne 0 ]]; then
  fail "cannot download $REPO_BASE (ref: $REF) — check the network and the --ref value"
  exit 1
fi
ok "Downloaded: $ZIP_PATH"

info "Extracting..."
if ! extract "$ZIP_PATH" "$SRC_DIR"; then
  fail "cannot extract the zip — install unzip or python3, or use setup-remote.ps1 on Windows"
  exit 1
fi

# The zip holds a single top-level directory (tizen-agent-skills-<ref>).
TOP_DIR="$(find "$SRC_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
PLUGIN_DIR="$TOP_DIR/tizen-sdk-skills"
if [[ -z "$TOP_DIR" || ! -f "$PLUGIN_DIR/common/.claude-plugin/plugin.json" ]]; then
  fail "unexpected zip layout: tizen-sdk-skills/common/.claude-plugin/plugin.json not found"
  exit 1
fi

echo ""
echo "=== tizen-sdk-skills setup (from the downloaded source) ==="
STATUS=0
if [[ -n "$HARNESS" ]]; then
  bash "$PLUGIN_DIR/common/setup/setup.sh" --harness "$HARNESS" \
    ${PASS_ARGS[@]+"${PASS_ARGS[@]}"} || STATUS=1
else
  bash "$PLUGIN_DIR/common/setup/setup-all.sh" \
    ${PASS_ARGS[@]+"${PASS_ARGS[@]}"} || STATUS=1
fi

exit $STATUS