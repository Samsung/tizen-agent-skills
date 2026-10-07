#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Generate a default-category stub and print language-specific implementation next steps.
# Usage: scaffold_action.sh --language <C#|C++|JS|Dart> --category Tizen.Action.Browser --out-name ImplBrowser [--gen-dir DIR]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LANGUAGE=''
CATEGORY=''
OUT_NAME=''
GEN_DIR=''

while [[ $# -gt 0 ]]; do
  case "$1" in
    --language) LANGUAGE="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --out-name) OUT_NAME="$2"; shift 2 ;;
    --gen-dir) GEN_DIR="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$LANGUAGE" in
  'C#'|'C++'|JS|Dart) ;;
  *) echo 'error: --language must be C#, C++, JS, or Dart.' >&2; exit 2 ;;
esac
if [[ -z "$CATEGORY" || -z "$OUT_NAME" ]]; then
  echo 'error: --category and --out-name are required.' >&2
  exit 2
fi

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
mkdir -p "$GEN_DIR"
echo "== Using built-in category: $CATEGORY ($LANGUAGE) =="
(
  cd "$GEN_DIR"
  bash "$SCRIPT_DIR/run_actionc.sh" --language "$LANGUAGE" -- -a "$CATEGORY" -o "$OUT_NAME"
)

case "$LANGUAGE" in
  'C#')
    GEN_FILE="$GEN_DIR/$OUT_NAME.cs"
    PATTERN="$SKILL_DIR/assets/cs_action_pattern.cs"
    METHOD_PATTERN='public abstract .*\('
    REGISTER='stub.Listen(typeof(YourServiceClass));'
    REFERENCE_DOC='references/cs.md'
    ;;
  'C++')
    GEN_FILE="$GEN_DIR/$OUT_NAME.h"
    PATTERN="$SKILL_DIR/assets/cpp_action_pattern.cc"
    METHOD_PATTERN='virtual .*\) = 0;'
    REGISTER='g_stub->Listen(std::make_shared<YourFactory>());'
    REFERENCE_DOC='references/cpp.md'
    ;;
  JS)
    GEN_FILE="$GEN_DIR/$OUT_NAME.js"
    PATTERN="$SKILL_DIR/assets/js_action_pattern.js"
    METHOD_PATTERN='on[A-Za-z]+\([^)]*\) \{\}'
    REGISTER='stub.listen();'
    REFERENCE_DOC='references/js.md'
    ;;
  Dart)
    GEN_FILE="$GEN_DIR/$OUT_NAME.dart"
    PATTERN="$SKILL_DIR/assets/dart_action_pattern.dart"
    METHOD_PATTERN='Future<TizenEntityStatus> on[A-Z]'
    REGISTER='await stub.listen();'
    REFERENCE_DOC='references/dart.md'
    ;;
esac

if [[ ! -f "$GEN_FILE" ]]; then
  echo "error: expected generated file '$GEN_FILE' not found." >&2
  echo 'If no default category covers this capability, define a custom action' >&2
  echo 'with scripts/scaffold_custom_action.sh instead.' >&2
  exit 1
fi

echo
echo "== Generated action methods in $GEN_FILE =="
grep -nE "$METHOD_PATTERN" "$GEN_FILE" | \
  grep -vE 'OnCreate|OnTerminate|CreateService|OnLocal' | \
  grep -vE 'onCreate|onTerminate' || \
  echo '(none found — inspect the generated file manually)'
echo
echo '== Next steps =='
echo "1. Read $GEN_FILE in full and copy the exact method signatures."
echo "2. Adapt $PATTERN; implement every generated handler."
echo "3. Register the stub with: $REGISTER"
echo '4. Register one action/provider metadata entry per exposed .action name.'
echo "5. Follow $SKILL_DIR/$REFERENCE_DOC for lifecycle, manifest, and build details."
echo '6. Verify on the device with action-tool, passing your appid in the request'
echo '   (see "Verify on a device" in references/common.md).'
