#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Codex CLI setup — thin wrapper. The logic lives in common/setup/setup.sh (--harness codex).
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../common/setup" && pwd)/setup.sh" --harness codex "$@"
