#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Needs actionc on PATH and the tizen-action default-actions data. Point
# TIZEN_ACTION_SRC at a tizen-action checkout, or set ACTIONC_DATA_DIR.
if [[ -n "${TIZEN_ACTION_SRC:-}" ]]; then
  export ACTIONC_DATA_DIR="$TIZEN_ACTION_SRC/default-actions"
fi
if [[ ! -d "${ACTIONC_DATA_DIR:-}/actions" ]] ||
    ! command -v actionc >/dev/null 2>&1; then
  echo 'SKIP: needs actionc on PATH and TIZEN_ACTION_SRC or ACTIONC_DATA_DIR' >&2
  exit 0
fi
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# The Browser category changes between catalogue releases, so the expected
# handler count comes from the data dir rather than a constant.
EXPECTED="$(find "$ACTIONC_DATA_DIR/actions" -maxdepth 1 \
  -name '*_Tizen.Action.Browser_*.action' | wc -l)"
if [[ "$EXPECTED" -eq 0 ]]; then
  echo "no Tizen.Action.Browser actions in $ACTIONC_DATA_DIR" >&2
  exit 1
fi

# Counts the handler lines scaffold_action.sh listed for one language.
count_handlers() {
  awk -v pattern="$2" '
    /== Generated action methods/ { in_methods = 1; next }
    /== Next steps ==/ { in_methods = 0 }
    in_methods && $0 ~ pattern { count++ }
    END { print count + 0 }
  ' "$1"
}

check_language() {
  local language="$1" pattern="$2" output="$WORK_DIR/$3.txt"
  bash "$SCRIPT_DIR/scaffold_action.sh" \
    --language "$language" --category Tizen.Action.Browser \
    --out-name ImplBrowser --gen-dir "$WORK_DIR/$3" > "$output"
  local count
  count="$(count_handlers "$output" "$pattern")"
  if [[ "$count" -ne "$EXPECTED" ]]; then
    echo "$language: expected $EXPECTED Browser action handlers, got $count" >&2
    exit 1
  fi
  if grep -qE 'OnLocal(Connected|Disconnected|Received)|ServiceBase \{|class ServiceBase' \
      "$output"; then
    echo "$language: a non-action member was reported as an action handler" >&2
    exit 1
  fi
}

check_language 'C++' 'virtual' cpp
check_language 'C#' 'public abstract' cs
check_language JS 'on[A-Z]' js
check_language Dart 'Future<TizenEntityStatus> on' dart
grep -q 'OpenPage' "$WORK_DIR/cpp.txt"
echo "PASS: $EXPECTED Browser handlers listed for C++, C#, JS and Dart"
