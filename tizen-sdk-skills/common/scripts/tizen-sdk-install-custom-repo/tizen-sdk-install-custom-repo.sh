#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-sdk-install-custom-repo.sh
#
# Install the Tizen SDK from a CUSTOM package repository URL (Linux/macOS/WSL2).
#
# Instead of the timezone-selected CDN mirror, the SDK is downloaded from a
# repository URL the user supplies (an internal mirror, a build-server output, a
# local HTTP server, ...).
#
# A URL only counts as a Tizen package repository if it serves
#   {URL}/pkg_list_{OS}-64   or   {URL}/pkg_list_{OS}-32
# for the current OS (OS = windows | ubuntu | macos). That file is the package
# index the whole install is driven from, so a URL without it is rejected BEFORE
# anything is downloaded — the alternative is ~100 failed downloads and a
# half-installed SDK.
#
# This script is a thin, validating front-end: after the URL passes validation
# it delegates to ../tizen-sdk-install/tizen-sdk-install.sh --repo-url <url>,
# which performs the real install (pkg_list parse, dependency resolution,
# download/merge, sdk.info, repository.info, env setup).
#
# Usage:
#   ./tizen-sdk-install-custom-repo.sh --repo-url <url> [OPTIONS]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

INSTALLER="$SCRIPT_DIR/../tizen-sdk-install/tizen-sdk-install.sh"

REPO_URL=""
INSTALL_PATH=""            # empty = installer default ($HOME/tizen-sdk)
PLATFORM_VERSION=""        # empty = auto-select highest version in pkg_list
FORCE=false
DRY_RUN=false
VALIDATE_ONLY=false        # validate the URL and exit (no install)
DETACH=false
STATUS=false
WAIT=false

show_help() {
  cat <<EOF
Install the Tizen SDK from a custom package repository URL

Usage: $0 --repo-url <url> [OPTIONS]

Required:
      --repo-url <url>     Package repository base URL to install from.
                           MUST serve pkg_list_{OS}-64 or pkg_list_{OS}-32 at
                           its root (OS = windows | ubuntu | macos), otherwise
                           the URL is rejected and nothing is downloaded.
                           Example: http://mirror.example.com/packages/tizen_sdk_11.0

Options:
  -p, --path <path>        Installation path (default: \$HOME/tizen-sdk)
      --platform <ver>     Tizen platform version to install (e.g. 10.0, 11.0).
                           Omit to auto-select the highest version the
                           repository's pkg_list offers.
      --validate-only      Validate --repo-url only and exit
                           (exit 0 = valid repository, 1 = invalid)
      --dry-run            Resolve and print the package list without installing
  -f, --force              Reinstall even if the SDK is already installed.
                           REQUIRED to re-point an existing install at a
                           different repository.
  -s, --status             Query the result of the last (or ongoing) install run
                           (STATUS=running | done EXIT=<code> | none)
      --wait               Sleep 60 seconds then print status (for polling)
      --detach             Launch the install in a detached background process
                           and exit immediately; poll with --status
  -h, --help               Show this help

What it does:
  1) Validates {--repo-url}/pkg_list_{OS}-{64,32} is reachable (HEAD, then a
     1-byte ranged GET for servers that reject HEAD)
  2) Delegates to tizen-sdk-install.sh --repo-url <url> for the real install
  3) The install records the repository in {SDK_PATH}/.package/repository.info,
     so later package updates and emulator package downloads use the SAME
     custom repository

Examples:
  # Private / in-house mirrors
  $0 --repo-url http://mirror.example.com/packages/tizen_sdk_11.0
  $0 --repo-url http://mirror.example.com/packages/tizen_studio_6.5
  # Custom repositories
  $0 --repo-url https://my-mirror.example.com/tizenstudio --platform 11.0
  $0 --repo-url https://my-mirror.example.com/tizenstudio --validate-only
  $0 --repo-url https://my-mirror.example.com/tizenstudio --force
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo-url)       REPO_URL="$2"; shift 2 ;;
    --repo-url=*)     REPO_URL="${1#*=}"; shift ;;
    -p|--path)        INSTALL_PATH="$2"; shift 2 ;;
    --path=*)         INSTALL_PATH="${1#*=}"; shift ;;
    --platform)       PLATFORM_VERSION="$2"; shift 2 ;;
    --platform=*)     PLATFORM_VERSION="${1#*=}"; shift ;;
    --validate-only|--validate-repo-url)
                      VALIDATE_ONLY=true; shift ;;
    --dry-run)        DRY_RUN=true; shift ;;
    -f|--force)       FORCE=true; shift ;;
    -s|--status)      STATUS=true; shift ;;
    --wait)           WAIT=true; shift ;;
    --detach)         DETACH=true; shift ;;
    -h|--help)        show_help; exit 0 ;;
    *)
      log_error "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

if [ ! -f "$INSTALLER" ]; then
  log_error "Installer script not found: $INSTALLER"
  exit 1
fi

# --status / --wait need no repository URL: they only read the on-disk run
# markers written by a previous install. Forward them straight through so a
# caller that started the install here can also poll it here.
if [ "$STATUS" = true ] || [ "$WAIT" = true ]; then
  status_args=()
  [ -n "$INSTALL_PATH" ] && status_args+=(--path "$INSTALL_PATH")
  if [ "$STATUS" = true ]; then
    status_args+=(--status)
  else
    status_args+=(--wait)
  fi
  exec bash "$INSTALLER" "${status_args[@]}"
fi

if [ -z "$REPO_URL" ]; then
  log_error "--repo-url <url> is required"
  log_error "A custom-repository install needs the repository base URL that serves pkg_list_{OS}-{64,32}."
  show_help
  exit 1
fi

log_info "Tizen SDK install from custom repository"
log_info "Requested repository: $REPO_URL"
echo ""

# Validate first — an invalid repository must never reach the installer.
if ! MATCHED_PKG_OS="$(validate_pkg_repo_url "$REPO_URL")"; then
  log_error "Aborting: not a valid Tizen package repository."
  log_error "Fix the URL (it must be the directory that CONTAINS pkg_list_{OS}-{64,32}) and retry."
  exit 1
fi
NORMALIZED_URL="$(normalize_repo_url "$REPO_URL")"
log_ok "Repository validated: $NORMALIZED_URL (package list: pkg_list_$MATCHED_PKG_OS)"
echo ""

if [ "$VALIDATE_ONLY" = true ]; then
  log_ok "--validate-only: repository is valid. No install performed."
  exit 0
fi

# Delegate the real install. --repo-url makes the installer download pkg_list
# and every package zip from this repository and record it in repository.info.
install_args=(--repo-url "$NORMALIZED_URL")
[ -n "$INSTALL_PATH" ] && install_args+=(--path "$INSTALL_PATH")
[ -n "$PLATFORM_VERSION" ] && install_args+=(--platform "$PLATFORM_VERSION")
[ "$FORCE" = true ] && install_args+=(--force)
[ "$DRY_RUN" = true ] && install_args+=(--dry-run)
[ "$DETACH" = true ] && install_args+=(--detach)

log_step "=== Delegating to tizen-sdk-install.sh ==="
log_info "bash \"$INSTALLER\" ${install_args[*]}"
echo ""

exec bash "$INSTALLER" "${install_args[@]}"
