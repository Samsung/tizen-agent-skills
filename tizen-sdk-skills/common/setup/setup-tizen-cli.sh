#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

#
# setup-tizen-cli.sh — install the tizen-sdk CLI from a GitHub release zip.
#
# Every tizen-agent-skills release publishes the built tizen-cli plugin as a
# release asset named tizen-sdk-v<plugin-version>.zip. This script resolves the
# asset (its version is the plugin's own, not the release's), downloads it,
# installs the dist/ bundle with a `tizen-sdk` shim, and deletes the download
# when the install succeeds. No clone and no build: the zip already holds the
# esbuild bundle, so only Node.js 22+ is needed to run it.
#
# Usage:
#   bash setup-tizen-cli.sh [--release <tag>] [--dir <path>] [--tizen-cli]
#                           [--keep]
#
#   --release <tag>  Release tag to install from (default: the latest release)
#   --dir <path>     Install directory (default: ~/.tizen-sdk-cli)
#   --tizen-cli      Also register the plugin with a `tizen-cli` host on PATH
#   --keep           Keep the downloaded zip after a successful install
#
# Self-contained on purpose: it may be run straight from the download
# (bash <(curl -fsSL <raw-url>)) as well as from a checkout. The PowerShell
# twin (setup-tizen-cli.ps1, with setup-tizen-cli.bat) behaves the same on
# Windows.

set -uo pipefail

REPO="Samsung/tizen-agent-skills"
RELEASE="latest"
INSTALL_DIR=""
WITH_TIZEN_CLI=false
KEEP=false

usage() {
  sed -n '15,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

info() { echo -e "\033[36m[Info]\033[0m $1"; }
ok()   { echo -e "\033[32m[Success]\033[0m $1"; }
warn() { echo -e "\033[33m[Warning]\033[0m $1"; }
fail() { echo -e "\033[31m[Error]\033[0m $1" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      [[ -n "${2-}" ]] || { fail "--release requires a value"; exit 1; }
      RELEASE="$2"; shift 2 ;;
    --dir)
      [[ -n "${2-}" ]] || { fail "--dir requires a value"; exit 1; }
      INSTALL_DIR="$2"; shift 2 ;;
    --tizen-cli) WITH_TIZEN_CLI=true; shift ;;
    --keep) KEEP=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option: $1"; echo; usage; exit 1 ;;
  esac
done

[[ -n "$INSTALL_DIR" ]] || INSTALL_DIR="$HOME/.tizen-sdk-cli"

command -v node >/dev/null 2>&1 || {
  fail "node is not on PATH — the tizen-sdk CLI needs Node.js 22+ (https://nodejs.org)"
  exit 1
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/tizen-sdk-cli-setup.XXXXXX")" || {
  fail "cannot create a temporary directory"; exit 1;
}
ZIP_PATH="$WORK/tizen-sdk.zip"
SRC_DIR="$WORK/src"

# Deletes the download when the install succeeded and --keep was not given.
# The installed copy lives in INSTALL_DIR and is not touched by this.
STATUS=0
cleanup() {
  if [[ "$KEEP" == true ]]; then
    info "Download kept at: $WORK"
  elif [[ $STATUS -ne 0 ]]; then
    warn "install failed; the download was kept at: $WORK (delete it yourself when done)"
  else
    rm -rf "$WORK" && ok "Removed the downloaded zip: $WORK"
  fi
}
trap cleanup EXIT

fetch() { # <url> -> body on stdout
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --max-time 60 "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$1"
  else
    return 1
  fi
}

download() { # <url> <dest>
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --max-time 1800 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    return 1
  fi
}

extract() { # <zip> <dest>
  if command -v unzip >/dev/null 2>&1; then
    unzip -qo "$1" -d "$2"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"
  elif command -v powershell.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
    # Git Bash on Windows: no unzip, but Expand-Archive is always there.
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \
      "Expand-Archive -LiteralPath '$(cygpath -w "$1")' -DestinationPath '$(cygpath -w "$2")' -Force"
  else
    return 1
  fi
}

# ---------------------------------------------------------------------------
# 1. Resolve the tizen-sdk-v<version>.zip asset of the release.
#    The plugin version differs from the release version, so the asset name is
#    discovered from the release pages instead of guessed from the tag. This
#    avoids the GitHub API and its anonymous rate limit entirely.
# ---------------------------------------------------------------------------
TAG="$RELEASE"
if [[ "$TAG" == "latest" ]]; then
  info "Resolving the latest release..."
  TAG="$(fetch "https://github.com/$REPO/releases.atom" |
    grep -oE 'releases/tag/tizen-agent-skills-v[0-9][0-9.]*' | head -n 1 | sed 's|.*/||')" || TAG=""
  [[ -n "$TAG" ]] || { fail "cannot resolve the latest release — check the network"; exit 1; }
fi

info "Looking up the tizen-sdk asset in $TAG..."
ASSETS_PAGE="$(fetch "https://github.com/$REPO/releases/expanded_assets/$TAG")" || {
  fail "cannot read the release page of $TAG — check the --release value"
  exit 1
}
ASSET_PATH="$(printf '%s' "$ASSETS_PAGE" |
  grep -oE 'releases/download/[^"]*tizen-sdk-v[^"]*\.zip' | head -n 1)"
[[ -n "$ASSET_PATH" ]] || { fail "release $TAG has no tizen-sdk-v*.zip asset"; exit 1; }
ASSET_NAME="${ASSET_PATH##*/}"

# ---------------------------------------------------------------------------
# 2. Download and extract.
# ---------------------------------------------------------------------------
info "Downloading $ASSET_NAME ..."
STATUS=1
if download "https://github.com/$REPO/$ASSET_PATH" "$ZIP_PATH"; then STATUS=0; fi
if [[ $STATUS -ne 0 ]]; then
  fail "cannot download the asset — check the network"
  exit 1
fi
ok "Downloaded: $ZIP_PATH"

info "Extracting..."
if ! extract "$ZIP_PATH" "$SRC_DIR"; then
  fail "cannot extract the zip — install unzip or python3, or use setup-tizen-cli.ps1 on Windows"
  exit 1
fi
if [[ ! -f "$SRC_DIR/dist/bin/tizen-sdk.js" || ! -f "$SRC_DIR/dist/tizen-sdk.js" ]]; then
  fail "unexpected zip layout: dist/bin/tizen-sdk.js not found"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Install: replace the previous dist/ and refresh the shim.
# ---------------------------------------------------------------------------
info "Installing into $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR/bin" || { fail "cannot create $INSTALL_DIR"; exit 1; }
rm -rf "$INSTALL_DIR/dist"
cp -R "$SRC_DIR/dist" "$INSTALL_DIR/dist" || { fail "cannot copy the bundle"; exit 1; }

cat > "$INSTALL_DIR/bin/tizen-sdk" <<'EOF'
#!/usr/bin/env sh
# tizen-sdk shim - generated by setup-tizen-cli.sh
exec node "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/../dist/bin/tizen-sdk.js" "$@"
EOF
chmod 755 "$INSTALL_DIR/bin/tizen-sdk"

if [[ "$WITH_TIZEN_CLI" == true ]]; then
  if command -v tizen-cli >/dev/null 2>&1; then
    tizen-cli plugin install "$INSTALL_DIR/dist" || STATUS=1
  else
    warn "tizen-cli is not on PATH — skipped the host plugin install"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Verify and report.
# ---------------------------------------------------------------------------
if [[ $STATUS -eq 0 ]]; then
  if node "$INSTALL_DIR/dist/bin/tizen-sdk.js" --capabilities >/dev/null 2>&1; then
    ok "Verification passed: the tizen-sdk CLI responds"
  else
    warn "the CLI did not answer --capabilities; run it manually to see the envelope"
    STATUS=1
  fi
fi

echo ""
echo "=== tizen-sdk CLI install summary ==="
echo "  Installed : $INSTALL_DIR/dist"
echo "  Run it    : node \"$INSTALL_DIR/dist/bin/tizen-sdk.js\" --doctor"
echo "  On PATH   : add $INSTALL_DIR/bin to PATH, then: tizen-sdk --doctor"
echo "  Node.js   : 22+ required (the --doctor command checks it)"

exit $STATUS