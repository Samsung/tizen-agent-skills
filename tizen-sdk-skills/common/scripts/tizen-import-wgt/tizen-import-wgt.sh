#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

wgt_path=""
profile=""
platform_version=""
working_dir=""
for arg in "$@"; do
  case "$arg" in
    --wgt-path=*) wgt_path="${arg#*=}" ;;
    --profile=*) profile="${arg#*=}" ;;
    --platform-version=*) platform_version="${arg#*=}" ;;
    --working-dir=*) working_dir="${arg#*=}" ;;
    *) log_error "Unknown argument: $arg"; exit 2 ;;
  esac
done

if [[ -z "$wgt_path" || -z "$profile" || -z "$platform_version" || -z "$working_dir" ]]; then
  log_error "--wgt-path, --profile, --platform-version, and --working-dir are required"
  exit 2
fi
if ! [[ "$platform_version" =~ ^[0-9]+\.[0-9]+$ ]]; then
  log_error "Invalid platform version: $platform_version. Use <major>.<minor>, for example 10.0"
  exit 2
fi
# Same ValidateSet as the PowerShell twin — tz accepts any "--profile=<x>-<v>"
# string with exit 0, so an unknown profile must be refused here.
case "$profile" in
  tizen|tv-samsung) ;;
  *) log_error "Invalid profile: $profile. Must be tizen or tv-samsung"; exit 2 ;;
esac
# tz import-wgt names the project after the archive file name and only accepts
# [a-zA-Z0-9] there ("tz: error: can only have [a-zA-Z0-9]").
wgt_file="$(basename "$wgt_path")"
project_name="${wgt_file%.*}"
if ! [[ "$project_name" =~ ^[A-Za-z0-9]+$ ]]; then
  log_error "Invalid WGT file name: $wgt_file. tz import-wgt names the project after the file and allows only letters and digits [A-Za-z0-9]; rename the archive and retry"
  exit 2
fi

sdk_path="$(get_sdk_path)"
tz_tool="$sdk_path/tools/tizen-core/tz"
[[ -f "$tz_tool" ]] || tz_tool="$sdk_path/tools/tizen-core/tz.exe"
[[ -f "$tz_tool" ]] || { log_error "tz tool not found at $tz_tool. Resolved SDK path: $sdk_path"; exit 1; }

export TIZEN_STUDIO_DIR="$sdk_path"
export TIZEN_STUDIO="$sdk_path"

# The profile must be INSTALLED: tz neither validates nor records it — with
# an uninstalled "tizen-99.9" it exits 0 and writes the api_version found in
# config.xml, so the caller would believe the version was applied.
tz_profile="$profile-$platform_version"
known_profiles="$("$tz_tool" list templates 2>/dev/null | awk '/^[^[:space:]].+:[[:space:]]*$/ { sub(/:[[:space:]]*$/,""); print }' | paste -sd, - || true)"
if ! printf '%s\n' "${known_profiles//,/$'\n'}" | grep -qxF "$tz_profile"; then
  log_error "Profile $tz_profile is not installed. Profiles known to tz: ${known_profiles:-(none)}. Install the platform package for $tz_profile (tizen-platform-install / tizen-tv-sdk-install) or pass an installed --platform-version"
  exit 1
fi

"$tz_tool" import-wgt "--wgt-path=$wgt_path" "--profile=$tz_profile" "--ws-dir=$working_dir"
