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
# Every action of a category shares one generated interface, so the stub is
# regenerated from ALL <prefix>_<category>_*.action files in --schema-dir,
# sorted by action name (the order the device assigns method ids in), plus
# every .entity file there. Run it once per method to grow a category.
#
# Usage:
#   ./scaffold_custom_action.sh \
#     --language 'C#' \
#     --prefix MyApp --category My.Action.Memo --method Save \
#     --description 'save a memo' \
#     --input-type My.Entity.Memo --output-type Tizen.Entity.Status \
#     --appid org.example.myapp --out-name ImplMemo \
#     [--new-entity My.Entity.Memo] [--schema-dir .] [--gen-dir ./gen]
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

bash "$SCRIPT_DIR/check_toolchain_env.sh" || {
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
done

# The whole category, sorted by action name with byte ordering, which is how
# the device numbers the methods of an app-defined category.
ACTION_ARGS=()
ACTION_NAMES=()
while IFS= read -r action_path; do
  ACTION_ARGS+=(-i "$action_path")
  ACTION_NAMES+=("$(basename "$action_path" .action)")
done < <(find "$SCHEMA_DIR" -maxdepth 1 -type f \
  -name "*_${CATEGORY}_*.action" | LC_ALL=C sort)

ENTITY_ARGS=()
while IFS= read -r entity_path; do
  ENTITY_ARGS+=(-e "$entity_path")
done < <(find "$SCHEMA_DIR" -maxdepth 1 -type f -name '*.entity' |
  LC_ALL=C sort)

echo
echo "Review the generated schema file(s) before continuing:"
echo "  $ACTION_FILE"
for entity_type in ${NEW_ENTITIES[@]+"${NEW_ENTITIES[@]}"}; do
  echo "  $SCHEMA_DIR/${entity_type}.entity  (customize the generated value field)"
done
if [[ ${#NEW_ENTITIES[@]} -eq 0 ]]; then
  echo
  echo "No --new-entity given, so actionc must resolve $INPUT_TYPE and"
  echo "$OUTPUT_TYPE from the framework data dir or the .entity files in"
  echo "$SCHEMA_DIR. If either is new, rerun with --new-entity."
fi
echo
echo "Category $CATEGORY now has ${#ACTION_NAMES[@]} action(s), in method order:"
printf '  %s\n' "${ACTION_NAMES[@]}"
if [[ "${ACTION_NAMES[${#ACTION_NAMES[@]}-1]}" != "${PREFIX}_${CATEGORY}_${METHOD}" ]]; then
  echo "WARNING: ${PREFIX}_${CATEGORY}_${METHOD} does not sort last, so it renumbers"
  echo "         the methods after it. That breaks callers of an already-installed"
  echo "         version of this category; rename it or use a new category if the"
  echo "         category has shipped."
fi
echo

mkdir -p "$GEN_DIR"
echo "== Running actionc -l $LANGUAGE for $CATEGORY =="
if ! (
  cd "$GEN_DIR"
  bash "$SCRIPT_DIR/run_actionc.sh" --language "$LANGUAGE" -- \
    "${ACTION_ARGS[@]}" ${ENTITY_ARGS[@]+"${ENTITY_ARGS[@]}"} -o "$OUT_NAME"
); then
  rm -f "$ACTION_FILE"
  exit 1
fi

echo
echo '== Next steps =='
echo "1. The generated stub is now in $GEN_DIR/ — from here on it works like a"
echo '   default category, so treat it as one.'
echo "2. Read $SKILL_DIR/$REFERENCE_DOC for implementing the generated"
echo '   ServiceBase and registering it.'
echo '3. Register one action/provider metadata entry per action name above.'
echo '4. Register action metadata for each .action file and action/entity metadata'
echo '   for each custom .entity file, and install both into the package res/.'
echo "5. details.appid is $APPID; it must be the appid of the app that declares"
echo '   the provider metadata, or requests without an explicit appid fail.'
