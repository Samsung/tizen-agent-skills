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
DESCRIPTION=$'save A&B | "safely" \\ path\nnext line'

bash "$SCRIPT_DIR/scaffold_custom_action.sh" \
  --language 'C#' \
  --prefix 'A&B|C\D' --category My.Action.Memo --method Save \
  --description "$DESCRIPTION" \
  --input-type My.Entity.Memo --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplMemo \
  --new-entity My.Entity.Memo \
  --schema-dir "$WORK_DIR/schema" --gen-dir "$WORK_DIR/gen"

python3 - \
  "$WORK_DIR/schema/A&B|C\D_My.Action.Memo_Save.action" \
  "$WORK_DIR/schema/My.Entity.Memo.entity" \
  "$DESCRIPTION" <<'PY'
import json
import pathlib
import sys

action_path = pathlib.Path(sys.argv[1])
action_text = action_path.read_text()
assert "{{" not in action_text, f"unresolved template placeholder in {action_path}"
action = json.loads(action_text)
assert action["name"] == r"A&B|C\D_My.Action.Memo_Save"
assert action["description"] == sys.argv[3]

entity_path = pathlib.Path(sys.argv[2])
entity_text = entity_path.read_text()
assert "{{" not in entity_text, f"unresolved template placeholder in {entity_path}"
entity = json.loads(entity_text)
assert entity["typeName"] == "My.Entity.Memo"
assert entity["dataSchema"]["properties"], "scaffolded entity needs a field"
PY

test -s "$WORK_DIR/gen/ImplMemo.cs"

TRAVERSAL_DIR="$WORK_DIR/traversal"
if bash "$SCRIPT_DIR/scaffold_custom_action.sh" \
  --language 'C#' \
  --prefix MyApp --category My.Action.Traversal --method Save \
  --description 'reject a path-bearing entity name' \
  --input-type Tizen.Entity.Status --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplTraversal \
  --new-entity ../escaped \
  --schema-dir "$TRAVERSAL_DIR/schema" --gen-dir "$TRAVERSAL_DIR/gen"; then
  echo 'path-bearing entity name was unexpectedly accepted' >&2
  exit 1
else
  status=$?
  test "$status" -eq 2
fi

test ! -e "$TRAVERSAL_DIR/escaped.entity"

PREFIX_TRAVERSAL_DIR="$WORK_DIR/prefix-traversal"
if bash "$SCRIPT_DIR/scaffold_custom_action.sh" \
  --language 'C#' \
  --prefix ../escaped --category My.Action.Memo --method Save \
  --description 'reject a path-bearing schema filename component' \
  --input-type Tizen.Entity.Status --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplPrefixTraversal \
  --schema-dir "$PREFIX_TRAVERSAL_DIR/schema" \
  --gen-dir "$PREFIX_TRAVERSAL_DIR/gen"; then
  echo 'path-bearing schema filename component was unexpectedly accepted' >&2
  exit 1
else
  status=$?
  test "$status" -eq 2
fi

test ! -e "$PREFIX_TRAVERSAL_DIR/escaped_My.Action.Memo_Save.action"

RETRY_DIR="$WORK_DIR/retry"
ACTION_FILE="$RETRY_DIR/schema/MyApp_My.Action.Retry_Save.action"
if bash "$SCRIPT_DIR/scaffold_custom_action.sh" \
  --language 'C#' \
  --prefix MyApp --category My.Action.Retry --method Save \
  --description 'save retry data' \
  --input-type My.Entity.Retry --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplRetry \
  --schema-dir "$RETRY_DIR/schema" --gen-dir "$RETRY_DIR/gen"; then
  echo 'generation unexpectedly resolved the missing custom entity' >&2
  exit 1
fi

test ! -e "$ACTION_FILE"
bash "$SCRIPT_DIR/scaffold_custom_action.sh" \
  --language 'C#' \
  --prefix MyApp --category My.Action.Retry --method Save \
  --description 'save retry data' \
  --input-type My.Entity.Retry --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplRetry \
  --new-entity My.Entity.Retry \
  --schema-dir "$RETRY_DIR/schema" --gen-dir "$RETRY_DIR/gen"
test -s "$RETRY_DIR/gen/ImplRetry.cs"

# Growing a category regenerates the stub from every action of the category,
# in sorted order, and warns when the new action does not sort last.
GROW_DIR="$WORK_DIR/grow"
grow() {
  bash "$SCRIPT_DIR/scaffold_custom_action.sh" \
    --language 'C++' \
    --prefix MyApp --category My.Action.Note --method "$1" \
    --description "$1 a note" \
    --input-type Tizen.Entity.Status --output-type Tizen.Entity.Status \
    --appid org.example.myapp --out-name ImplNote \
    --schema-dir "$GROW_DIR/schema" --gen-dir "$GROW_DIR/gen"
}
grow Save > "$GROW_DIR.save.txt"
grep -q 'virtual TizenEntityStatus Save(' "$GROW_DIR/gen/ImplNote.h"
if grep -q 'does not sort last' "$GROW_DIR.save.txt"; then
  echo 'a single-action category was reported as renumbered' >&2
  exit 1
fi
grow Delete > "$GROW_DIR.delete.txt"
grep -q 'virtual TizenEntityStatus Save(' "$GROW_DIR/gen/ImplNote.h"
grep -q 'virtual TizenEntityStatus Delete(' "$GROW_DIR/gen/ImplNote.h"
grep -q 'does not sort last' "$GROW_DIR.delete.txt"
DELETE_ID="$(sed -n 's/^ *Delete = \([0-9]*\),$/\1/p' "$GROW_DIR/gen/ImplNote.h")"
SAVE_ID="$(sed -n 's/^ *Save = \([0-9]*\),$/\1/p' "$GROW_DIR/gen/ImplNote.h")"
if [[ -z "$DELETE_ID" || -z "$SAVE_ID" || "$DELETE_ID" -ge "$SAVE_ID" ]]; then
  echo "expected Delete before Save in method ids, got $DELETE_ID/$SAVE_ID" >&2
  exit 1
fi
echo 'PASS: custom action scaffolding'
