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

OUTPUT="$WORK_DIR/output.txt"
"$SCRIPT_DIR/scaffold_action.sh" \
  --language 'C++' --category Tizen.Action.Browser \
  --out-name ImplBrowser --gen-dir "$WORK_DIR/gen" > "$OUTPUT"

grep -q 'Open' "$OUTPUT"
HANDLER_COUNT="$(awk '
  /== Generated action methods/ { in_methods = 1; next }
  /== Next steps ==/ { in_methods = 0 }
  in_methods && /virtual/ { count++ }
  END { print count + 0 }
' "$OUTPUT")"
if [[ "$HANDLER_COUNT" -ne 18 ]]; then
  echo "expected 18 Browser action handlers, got $HANDLER_COUNT" >&2
  exit 1
fi
if grep -qE 'OnLocal(Connected|Disconnected|Received)' "$OUTPUT"; then
  echo 'internal transport callback reported as an action handler' >&2
  exit 1
fi

CSHARP_OUTPUT="$WORK_DIR/csharp-output.txt"
"$SCRIPT_DIR/scaffold_action.sh" \
  --language 'C#' --category Tizen.Action.Browser \
  --out-name ImplBrowser --gen-dir "$WORK_DIR/csharp-gen" > "$CSHARP_OUTPUT"

CSHARP_HANDLER_COUNT="$(awk '
  /== Generated action methods/ { in_methods = 1; next }
  /== Next steps ==/ { in_methods = 0 }
  in_methods && /public abstract/ { count++ }
  END { print count + 0 }
' "$CSHARP_OUTPUT")"
if [[ "$CSHARP_HANDLER_COUNT" -ne 18 ]]; then
  echo "expected 18 C# Browser action handlers, got $CSHARP_HANDLER_COUNT" >&2
  exit 1
fi
if grep -q 'public abstract class ServiceBase' "$CSHARP_OUTPUT"; then
  echo 'C# ServiceBase declaration reported as an action handler' >&2
  exit 1
fi