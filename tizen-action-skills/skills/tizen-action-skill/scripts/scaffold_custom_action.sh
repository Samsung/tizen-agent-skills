#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Define a brand-new custom Tizen Action: fill in the .action template (and
# optionally an .entity template), run actionc -i/-e for the requested
# language, and print the implementation next steps.
#
# Only run this after ./list_categories.sh has shown that no default category
# already covers the capability — a default category is always the cheaper
# path, since the framework already ships its schemas.
#
# This script only writes files it owns: the .action/.entity files in
# --schema-dir (default: the current directory) and actionc's own output under
# --gen-dir. It never touches files already in your app project.
#
# Usage:
#   ./scaffold_custom_action.sh \
#     --language 'C#' \
#     --prefix MyApp --category My.Action.Memo --method Save \
#     --description 'save a memo' \
#     --input-type Tizen.Entity.Memo --output-type Tizen.Entity.Status \
#     --appid org.example.myapp --out-name ImplMemo \
#     [--new-entity Tizen.Entity.Memo] [--schema-dir .] [--gen-dir ./gen]
#
# --new-entity is repeatable. Use it for every entity type in --input-type /
# --output-type that ./list_categories.sh --entities does NOT already list;
# the script writes a template for each and passes it to actionc via -e.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$SKILL_DIR/assets"

LANGUAGE=''
CATEGORY=''
METHOD=''
PREFIX='Custom'
DESCRIPTION=''
INPUT_TYPE=''
OUTPUT_TYPE=''
APPID=''
OUT_NAME=''
SCHEMA_DIR='.'
GEN_DIR=''
NEW_ENTITIES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --language) LANGUAGE="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --method) METHOD="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --input-type) INPUT_TYPE="$2"; shift 2 ;;
    --output-type) OUTPUT_TYPE="$2"; shift 2 ;;
    --appid) APPID="$2"; shift 2 ;;
    --out-name) OUT_NAME="$2"; shift 2 ;;
    --new-entity) NEW_ENTITIES+=("$2"); shift 2 ;;
    --schema-dir) SCHEMA_DIR="$2"; shift 2 ;;
    --gen-dir) GEN_DIR="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$LANGUAGE" in
  'C#') REFERENCE_DOC='references/cs.md' ;;
  'C++') REFERENCE_DOC='references/cpp.md' ;;
  JS) REFERENCE_DOC='references/js.md' ;;
  Dart) REFERENCE_DOC='references/dart.md' ;;
  *) echo 'error: --language must be C#, C++, JS, or Dart.' >&2; exit 2 ;;
esac

for required in CATEGORY METHOD DESCRIPTION INPUT_TYPE OUTPUT_TYPE APPID OUT_NAME; do
  if [[ -z "${!required}" ]]; then
    echo 'error: --language, --category, --method, --description, --input-type,' >&2
    echo '       --output-type, --appid, and --out-name are all required.' >&2
    exit 2
  fi
done

if [[ "$PREFIX" == */* || "$CATEGORY" == */* || "$METHOD" == */* ]]; then
  echo 'error: --prefix, --category, and --method must be schema identifiers,' >&2
  echo '       not paths.' >&2
  exit 2
fi

for entity_type in ${NEW_ENTITIES[@]+"${NEW_ENTITIES[@]}"}; do
  if [[ "$entity_type" == */* ]]; then
    echo 'error: --new-entity must be a schema identifier, not a path:' >&2
    echo "       $entity_type" >&2
    exit 2
  fi
done

if [[ -z "$GEN_DIR" ]]; then
  case "$LANGUAGE" in
    'C#'|'C++') GEN_DIR='./gen' ;;
    JS) GEN_DIR='./js' ;;
    Dart) GEN_DIR='./lib' ;;
  esac
fi

"$SCRIPT_DIR/check_toolchain_env.sh" || {
  echo 'error: fix the toolchain setup above before continuing.' >&2
  exit 1
}

mkdir -p "$SCHEMA_DIR"
SCHEMA_DIR="$(cd "$SCHEMA_DIR" && pwd)"

# actionc -i parses the category and method back out of the filename, so this
# <Prefix>_<Category>_<Method>.action convention is load-bearing, not cosmetic.
ACTION_FILE="$SCHEMA_DIR/${PREFIX}_${CATEGORY}_${METHOD}.action"
if [[ -e "$ACTION_FILE" ]]; then
  echo "error: $ACTION_FILE already exists; refusing to overwrite it." >&2
  exit 1
fi

echo "== Writing $ACTION_FILE from template =="
PREFIX_REPLACEMENT="$(python3 - "$PREFIX" <<'PY'
import json
import sys

value = json.dumps(sys.argv[1])[1:-1]
print(value.replace("\\", "\\\\").replace("&", "\\&").replace("|", "\\|"),
      end="")
PY
)"
DESCRIPTION_REPLACEMENT="$(python3 - "$DESCRIPTION" <<'PY'
import json
import sys

value = json.dumps(sys.argv[1])[1:-1]
print(value.replace("\\", "\\\\").replace("&", "\\&").replace("|", "\\|"),
      end="")
PY
)"
sed \
  -e "s|{{PREFIX}}|$PREFIX_REPLACEMENT|g" \
  -e "s|{{CATEGORY}}|$CATEGORY|g" \
  -e "s|{{METHOD}}|$METHOD|g" \
  -e "s|{{DESCRIPTION}}|$DESCRIPTION_REPLACEMENT|g" \
  -e "s|{{INPUT_ENTITY_TYPE}}|$INPUT_TYPE|g" \
  -e "s|{{OUTPUT_ENTITY_TYPE}}|$OUTPUT_TYPE|g" \
  -e "s|{{PROVIDER_APPID}}|$APPID|g" \
  "$ASSETS_DIR/custom_action.template.bare-ref.json" > "$ACTION_FILE"

ENTITY_ARGS=()
for entity_type in ${NEW_ENTITIES[@]+"${NEW_ENTITIES[@]}"}; do
  entity_file="$SCHEMA_DIR/${entity_type}.entity"
  if [[ -e "$entity_file" ]]; then
    echo "== Reusing existing $entity_file =="
  else
    echo "== Writing $entity_file from template =="
    sed \
      -e "s|{{ENTITY_TYPE_NAME}}|$entity_type|g" \
      -e "s|{{DESCRIPTION}}|$entity_type|g" \
      "$ASSETS_DIR/custom_entity.template.json" > "$entity_file"
  fi
  ENTITY_ARGS+=(-e "$entity_file")
done

echo
echo "Review the generated schema file(s) before continuing:"
echo "  $ACTION_FILE"
for entity_type in ${NEW_ENTITIES[@]+"${NEW_ENTITIES[@]}"}; do
  echo "  $SCHEMA_DIR/${entity_type}.entity  (customize the generated value field)"
done
if [[ ${#NEW_ENTITIES[@]} -eq 0 ]]; then
  echo
  echo "No --new-entity given, so actionc must resolve $INPUT_TYPE and"
  echo "$OUTPUT_TYPE from the framework data dir. If either is new, rerun with"
  echo "--new-entity, or write the .entity file yourself and pass it via -e."
fi
echo

mkdir -p "$GEN_DIR"
echo "== Running actionc -l $LANGUAGE against $(basename "$ACTION_FILE") =="
if ! (
  cd "$GEN_DIR"
  "$SCRIPT_DIR/run_actionc.sh" --language "$LANGUAGE" -- \
    -i "$ACTION_FILE" ${ENTITY_ARGS[@]+"${ENTITY_ARGS[@]}"} -o "$OUT_NAME"
); then
  rm -f "$ACTION_FILE"
  exit 1
fi

echo
echo '== Next steps =='
echo "1. The generated stub is now in $GEN_DIR/ — from here on it is"
echo '   indistinguishable from a default category, so treat it as one.'
echo "2. Read $SKILL_DIR/$REFERENCE_DOC for implementing the generated"
echo '   ServiceBase and registering it.'
echo "3. Register one action/provider metadata entry for the exact action name:"
echo "   ${PREFIX}_${CATEGORY}_${METHOD}"
echo "4. Register action metadata for $(basename "$ACTION_FILE") and action/entity"
echo '   metadata for every custom .entity resource, in addition to the provider.'
echo "5. The schema details.appid default is $APPID; provider metadata records the"
echo '   declaring application independently, so those appids need not be equal.'
