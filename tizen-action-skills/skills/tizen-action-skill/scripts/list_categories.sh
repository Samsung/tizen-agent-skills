#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.
# Lists the default action categories actually installed in this developer's
# toolchain, read live from $ACTIONC_DATA_DIR/actions (and the entity types
# in $ACTIONC_DATA_DIR/entities) — instead of a static, easily stale doc.
#
# Usage:
#   ./list_categories.sh                 # list every category + its methods
#   ./list_categories.sh Browser         # filter by substring (case-insensitive)
#   ./list_categories.sh --entities      # list installed .entity types instead

set -u

DATA_DIR="${ACTIONC_DATA_DIR:-}"
if [ -z "$DATA_DIR" ]; then
  if [ "${OS:-}" = "Windows_NT" ]; then
    DATA_DIR="$HOME\\.action-tools\\data"
  else
    DATA_DIR="$HOME/.action-tools/data"
  fi
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "error: data dir '$DATA_DIR' does not exist." >&2
  echo "Either \$ACTIONC_DATA_DIR is wrong, or the toolchain isn't installed —" >&2
  echo "run ./check_toolchain_env.sh (or .ps1) first." >&2
  exit 1
fi

if [ "${1:-}" = "--entities" ]; then
  ENTITIES_DIR="$DATA_DIR/entities"
  if [ ! -d "$ENTITIES_DIR" ]; then
    echo "error: no entities/ dir under '$DATA_DIR'" >&2
    exit 1
  fi
  echo "== Entity types in $ENTITIES_DIR =="
  for f in "$ENTITIES_DIR"/*.entity; do
    [ -e "$f" ] || continue
    basename "$f" .entity
  done | sort
  exit 0
fi

ACTIONS_DIR="$DATA_DIR/actions"
if [ ! -d "$ACTIONS_DIR" ]; then
  echo "error: no actions/ dir under '$DATA_DIR'" >&2
  exit 1
fi

FILTER="${1:-}"

echo "== Default categories in $ACTIONS_DIR =="
declare -A methods_by_category=()

for f in "$ACTIONS_DIR"/*.action; do
  [ -e "$f" ] || continue
  base="$(basename "$f" .action)"
  # filename convention: <Prefix>_<Category>_<Method>.action, e.g.
  # Tv_Tizen.Action.Browser_OpenPage.action -> category=Tizen.Action.Browser method=OpenPage
  category="${base#*_}"
  method="${category##*_}"
  category="${category%_*}"
  if [ -n "$FILTER" ]; then
    case "$category" in
      *"$FILTER"*) ;;
      *) case "${category,,}" in *"${FILTER,,}"*) ;; *) continue ;; esac ;;
    esac
  fi
  existing="${methods_by_category[$category]:-}"
  methods_by_category[$category]="${existing:+$existing, }$method"
done

if [ "${#methods_by_category[@]}" -eq 0 ]; then
  echo "(no categories matched${FILTER:+ '$FILTER'})"
  exit 0
fi

for category in $(printf '%s\n' "${!methods_by_category[@]}" | sort); do
  echo "  $category: ${methods_by_category[$category]}"
done
