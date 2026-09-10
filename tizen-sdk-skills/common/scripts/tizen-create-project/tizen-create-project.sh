#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


# Tizen Project Creation Agent - Wrapper
# Routes to create-project-app.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_SCRIPT="$SCRIPT_DIR/create-project-app.sh"

if [ ! -f "$MAIN_SCRIPT" ]; then
    echo "Error: create-project-app.sh not found at $MAIN_SCRIPT" >&2
    exit 1
fi

echo ""
echo "════════════════════════════════════════"
echo "  Tizen Project Creation Agent"
echo "════════════════════════════════════════"
echo ""

bash "$MAIN_SCRIPT" "$@"
exit $?
