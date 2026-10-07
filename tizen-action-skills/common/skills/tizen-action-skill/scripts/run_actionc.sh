#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Run actionc for one Tizen Action category.
# Usage: run_actionc.sh --language <C#|C++|JS|Dart> -- -a Tizen.Action.Browser -o ImplBrowser
set -euo pipefail

if [[ "${1:-}" != "--language" || -z "${2:-}" ]]; then
  echo 'usage: run_actionc.sh --language <C#|C++|JS|Dart> -- <actionc arguments>' >&2
  exit 2
fi
LANGUAGE="$2"
shift 2
[[ "${1:-}" == "--" ]] && shift

case "$LANGUAGE" in
  'C#'|'C++'|JS|Dart) ;;
  *) echo "error: unsupported language '$LANGUAGE' (use C#, C++, JS, or Dart)." >&2; exit 2 ;;
esac

if ! command -v actionc >/dev/null 2>&1; then
  echo 'error: actionc is not on PATH.' >&2
  echo 'Run scripts/check_toolchain_env.sh first for setup instructions.' >&2
  exit 1
fi

exec actionc -l "$LANGUAGE" "$@"