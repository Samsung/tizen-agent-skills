#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-sdk-install.sh
#
# Automatic Tizen SDK platform package installation
# - Parse pkg_list to auto-detect the latest Tizen platform (TIZEN-X.Y)
#   (e.g., if TIZEN-10.0 is latest then 10.0, if TIZEN-11.0 appears then 11.0 is installed)
# - Recursively resolve and install all Install-dependency of the selected platform
# - Configure environment variables
#
# Usage:
#   ./scripts/tizen-sdk-install/tizen-sdk-install.sh [OPTIONS]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

# CDN mirror selection based on system timezone offset.
# Mirrors (base URLs from <alternativeRoot>):
#   official   https://download.tizen.org/sdk/tizenstudio/       → /official
#   global     https://usa.sdk-dl.tizen.org/sdk/tizenstudio/     → /official
#   brazil     https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/  → /official
#   china      https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/ → /official
#   india      https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/ → /official
#
# Mapping (by UTC offset):
#   UTC-12 .. UTC-5  → Global     (North America)
#   UTC-4  .. UTC-1  → Brazil     (South America)
#   UTC+0  .. UTC+4  → Official   (Europe / Africa / Middle East)
#   UTC+5  .. UTC+12 → Singapore  (India / China / Southeast Asia / Oceania)
select_cdn_repo() {
  local tz_str tz_sign tz_hours tz_offset

  tz_str=$(date +%z 2>/dev/null || echo "+0000")
  tz_sign="${tz_str:0:1}"
  tz_hours="${tz_str:1:2}"
  # Strip leading zero so octal interpretation doesn't happen (e.g. 08 → 8)
  tz_hours=$(( 10#$tz_hours ))
  tz_offset=$(( ${tz_sign}${tz_hours} ))

  if [ "$tz_offset" -le -5 ]; then
    echo "https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official"
  elif [ "$tz_offset" -le -1 ]; then
    echo "https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official"
  elif [ "$tz_offset" -le 4 ]; then
    echo "https://download.tizen.org/sdk/tizenstudio/official"
  else
    echo "https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official"
  fi
}

# Package repository (base URL for pkg_list and binary zip) — selected by timezone.
# Overridden by --repo-url when the user installs from a custom repository.
PKG_REPO="$(select_cdn_repo)"


# Configuration
OS_TYPE=""
PKG_OS=""                  # pkg_list suffix: windows-64 / ubuntu-64 / macos-64
# Default install path: ~/.tizen.sdk.path.config, else TIZEN_SDK_PATH (unless it
# is a Tizen Studio install), else $HOME/tizen-sdk — see default_sdk_install_path
# in lib/common.sh (issue #70). --path always wins.
INSTALL_PATH="$(default_sdk_install_path)"
PLATFORM_VERSION=""        # Empty to auto-select latest, e.g., "10.0", "11.0"
REPO_URL=""                # Custom package repository URL (--repo-url); empty = timezone CDN
VALIDATE_ONLY=false        # If true, only validate --repo-url and exit
DRY_RUN=false              # If true, only print resolved package list without download/install
FORCE=false                # If true, force reinstall even if already installed
DETACH=false               # If true, re-launch self via nohup in background and exit immediately
PROFILE_FILE=""            # Shell profile file to record environment variables
DETACH_LOG="/tmp/tizen-sdk-install.log"  # Log file path when --detach is used


# Additional packages to install beyond the platform base
ADDITIONAL_PACKAGES="version-manager tizen-core certificate-generator certificate-encryptor Emulator"

# Force-install optional remote scripting packages (tizen-X.Y-rs-*)
FORCE_OPTIONAL_PACKAGES=true

# Detect OS for the installer: sets OS_TYPE / PKG_OS / DOWNLOAD_URL and exits on
# an unsupported OS. Named distinctly from lib/common.sh's detect_os(), which is
# a plain "echo linux|mac|windows" query with no side effects — the two must not
# shadow each other.
detect_install_os() {
  case "$(uname -s)" in
    Linux*)
      if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_TYPE="$ID"
      else
        OS_TYPE="linux"
      fi
      PKG_OS="ubuntu-64"
      DOWNLOAD_URL="https://download.tizen.org/sdk/Tizen_Studio/tizen-sdk-latest-linux64.tar.gz"
      ;;
    Darwin*)
      OS_TYPE="macos"
      PKG_OS="macos-64"
      DOWNLOAD_URL="https://download.tizen.org/sdk/Tizen_Studio/tizen-sdk-latest-macos64.tar.gz"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      OS_TYPE="windows"
      PKG_OS="windows-64"
      DOWNLOAD_URL="https://download.tizen.org/sdk/Tizen_Studio/tizen-sdk-latest-windows.tar.gz"
      ;;
    *)
      OS_TYPE="unknown"
      log_error "Unsupported OS"
      exit 1
      ;;
  esac
}

# Switch the package source to a user-supplied repository (--repo-url).
#
# A URL only counts as a Tizen package repository if it serves
# pkg_list_{OS}-{64,32} for THIS OS — validate_pkg_repo_url (lib/common.sh)
# probes both arches and echoes the one it found, which also lets a 32-bit-only
# mirror work. Anything else aborts here rather than after ~100 failed
# downloads. Must run AFTER detect_install_os (it seeds the default PKG_OS).
apply_custom_repo() {
  local matched
  if ! matched="$(validate_pkg_repo_url "$REPO_URL")"; then
    log_error "Aborting: --repo-url is not a valid Tizen package repository"
    return 1
  fi
  PKG_REPO="$(normalize_repo_url "$REPO_URL")"
  PKG_OS="$matched"
  log_ok "Using custom package repository: $PKG_REPO (pkg_list_$PKG_OS)"
  return 0
}

# Check and warn about long path support
check_long_path_support() {
  case "$OS_TYPE" in
    windows)
      log_step "=== Checking Windows Long Path Support ==="
      # Windows Long Path is enabled via registry (handled in PowerShell script)
      log_info "Windows Long Path Support will be automatically enabled by PowerShell script"
      ;;
    linux|debian|ubuntu|fedora)
      log_step "=== Checking Linux Long Path ==="
      local max_path
      max_path=$(getconf PATH_MAX 2>/dev/null || echo "4096")
      if [ "$max_path" -lt 4096 ]; then
        log_warning "PATH_MAX is limited: $max_path"
        log_info "For long paths, consider kernel recompilation or symbolic links"
      else
        log_success "PATH_MAX is sufficient: $max_path"
      fi
      ;;
    macos)
      log_step "=== Checking macOS Long Path ==="
      log_success "macOS mostly supports long paths"
      ;;
  esac
}

# Check if installation path exists
check_install_path() {
  log_step "=== Checking installation path ==="

  if [ -d "$INSTALL_PATH" ]; then
    log_success "Installation path exists: $INSTALL_PATH"
    return 0
  fi

  log_info "Installation path does not exist yet: $INSTALL_PATH (will be created during install)"
  return 1
}

# Check system requirements
check_requirements() {
  log_step "=== Checking system requirements ==="

  # Check disk space (need at least 3GB)
  local available
  available=$(df -Pk "$HOME" | awk 'NR==2 {print $4}')
  local required=$((3 * 1024 * 1024))  # 3GB in KB

  if [ "$available" -lt "$required" ]; then
    log_warning "Insufficient disk space (required: 3GB or more, available: $(($available / 1024 / 1024))GB)"
    return 1
  fi
  log_success "Disk space available ($(($available / 1024 / 1024))GB)"

  # Check required tools (unzip is needed for extracting platform packages)
  local required_tools=("curl" "tar" "unzip" "awk")
  for tool in "${required_tools[@]}"; do
    if command -v "$tool" &> /dev/null; then
      log_success "$tool: installed"
    else
      log_error "$tool: not installed (required)"
      return 1
    fi
  done

  return 0
}


# -----------------------------------------------------------------------------
# Platform package installation (pkg_list based)
# -----------------------------------------------------------------------------

# Parse pkg_list to TSV format: name<TAB>path<TAB>version<TAB>"dep1 dep2 ..."<TAB>"group1 group2 ..."
# Arguments: $1 = pkg_list file path, $2 = output TSV path
parse_pkg_list() {
  local pkglist="$1"
  local pkgdb="$2"

  # Each package block starts with "Package : <name>".
  # Description can be multiple lines (including empty lines), so use Package line as record boundary.
  # Version/Path/Install-dependency/C-SelectedGroup use only first value before Description.
  #
  # Install-dependency and C-SelectedGroup items are comma-separated; each item may have
  # OS condition suffix in "package-name [os...]" form (e.g., "sdb [windows-64]"). If condition exists,
  # include only when matching current OS, and store package name without suffix separated by spaces.
  awk -v osmatch="$PKG_OS" '
    function clean_deps(s,    n, arr, i, item, cond, m, carr, j, ok, out) {
      n = split(s, arr, ",")
      out = ""
      for (i = 1; i <= n; i++) {
        item = arr[i]
        gsub(/^[ \t]+|[ \t]+$/, "", item)
        if (item == "") continue
        cond = ""
        if (match(item, /\[[^]]*\]/)) {
          cond = substr(item, RSTART + 1, RLENGTH - 2)
          item = substr(item, 1, RSTART - 1)
          gsub(/[ \t]+$/, "", item)
        }
        if (cond != "") {
          ok = 0
          m = split(cond, carr, /[ ,]+/)
          for (j = 1; j <= m; j++) if (carr[j] == osmatch) ok = 1
          if (!ok) continue
        }
        if (item != "") out = (out == "" ? item : out " " item)
      }
      return out
    }
    function flush() {
      if (name != "") print name "\t" path "\t" ver "\t" deps "\t" groups
      name=""; path=""; ver=""; deps=""; groups=""
    }
    /^Package : / { flush(); name=substr($0, 11) }
    /^Version : / { if (ver  == "") ver  = substr($0, 11) }
    /^Path : /    { if (path == "") path = substr($0, 8)  }
    /^Install-dependency : / {
      if (deps == "") deps = clean_deps(substr($0, 22))
    }
    /^C-SelectedGroup : / {
      if (groups == "") groups = clean_deps(substr($0, 18))
    }
    END { flush() }
  ' "$pkglist" > "$pkgdb"
}

# Look up specific package field in TSV. Arguments: $1 db, $2 name, $3 field-index(2=path,3=ver,4=deps)
lookup_field() {
  awk -F'\t' -v n="$2" -v f="$3" '$1==n {print $f; exit}' "$1"
}

# Fetch binary/ directory list once and cache to $1 file (filename only, one per line).
# Returns 0 on success. When pkg_list version is ahead of actual published binary causing 404,
# use this list to find actual published version for fallback download.
fetch_binlist() {
  local out="$1"
  [ -s "$out" ] && return 0
  curl -fsSL --max-time 300 "$PKG_REPO/binary/" 2>/dev/null \
    | grep -oE 'href="[^"?]+\.zip"' | sed 's/^href="//; s/"$//' | sort -u > "$out" 2>/dev/null || true
  [ -s "$out" ]
}

# Print the published latest binary filename for one package (empty string if not found).
# Filename format: <name>_<version>_<os>.zip — match by name/OS and sort by version to select latest.
# Arguments: $1 listing file, $2 package name, $3 OS tag (e.g., ubuntu-64)
resolve_published_binary() {
  local listing="$1" pkg="$2" os="$3" esc
  esc="$(printf '%s' "$pkg" | sed 's/[.[\*^$/]/\\&/g')"
  grep -E "^${esc}_[^_/]+_${os}\.zip$" "$listing" 2>/dev/null | sort -V | tail -1
}

install_platform_packages() {
  log_step "=== Installing Tizen platform packages ==="

  if [ ! -d "$INSTALL_PATH" ]; then
    mkdir -p "$INSTALL_PATH"
  fi

  local workdir
  workdir="$(mktemp -d)"
  local pkglist="$workdir/pkg_list"
  local pkgdb="$workdir/pkgdb.tsv"
  local binlist="$workdir/binlist.txt"   # lazily-filled cache of binary/ listing
  local pkglist_url="$PKG_REPO/pkg_list_$PKG_OS"

  log_info "Downloading package list: $pkglist_url"
  if ! curl -fsSL --max-time 300 -o "$pkglist" "$pkglist_url"; then
    log_error "Failed to download package list (pkg_list)"
    rm -rf "$workdir"
    return 1
  fi

  parse_pkg_list "$pkglist" "$pkgdb"

  # List of all available TIZEN-X.Y root platforms (version ascending order)
  local platforms
  platforms="$(cut -f1 "$pkgdb" | grep -E '^TIZEN-[0-9]+\.[0-9]+$' | sed -E 's/^TIZEN-//' \
               | sort -t. -k1,1n -k2,2n || true)"
  if [ -z "$platforms" ]; then
    log_error "No TIZEN platforms (TIZEN-X.Y) found in pkg_list"
    rm -rf "$workdir"
    return 1
  fi

  log_info "Detected Tizen platform list:"
  while IFS= read -r v; do
    log_info "    - TIZEN-$v"
  done <<< "$platforms"

  # Determine the root platform to install
  local root
  if [ -n "$PLATFORM_VERSION" ]; then
    root="TIZEN-$PLATFORM_VERSION"
    if [ -z "$(lookup_field "$pkgdb" "$root" 2)" ] \
       && ! awk -F'\t' -v n="$root" '$1==n{f=1} END{exit !f}' "$pkgdb"; then
      log_error "Specified platform not found in pkg_list: $root"
      rm -rf "$workdir"
      return 1
    fi
  else
    # Auto-select platform with highest version number (e.g., 11.0 > 10.0 > 9.0)
    local latest
    latest="$(echo "$platforms" | tail -1)"
    root="TIZEN-$latest"
  fi

  local root_ver
  root_ver="$(lookup_field "$pkgdb" "$root" 3)"
  log_success "Target platform for installation: $root (version ${root_ver:-?})"

  # Auto-add platform-specific emulator package (e.g., TIZEN-10.0-Emulator)
  local emulator_pkg="${root}-Emulator"
  if grep -q "^${emulator_pkg}	" "$pkgdb" 2>/dev/null; then
    if ! echo "$ADDITIONAL_PACKAGES" | grep -qw "$emulator_pkg"; then
      ADDITIONAL_PACKAGES="$ADDITIONAL_PACKAGES $emulator_pkg"
      log_info "Auto-adding platform emulator: $emulator_pkg"
    fi
  fi

  # Optional: Auto-add remote scripting packages (e.g. tizen-10.0-rs-device.core)
  if [ "$FORCE_OPTIONAL_PACKAGES" = true ]; then
    log_info "Auto-adding optional remote scripting packages..."
    # Extract version from root: TIZEN-10.0 -> 10.0
    local version
    version="$(echo "$root" | sed -E 's/^TIZEN-//')"
    local rs_packages=""
    while IFS= read -r pkg; do
      pkg="$(echo "$pkg" | cut -f1)"
      # Match packages like "tizen-10.0-rs-device.core" (case-insensitive)
      if echo "$pkg" | grep -qiE "^tizen-${version}-rs-"; then
        if ! echo "$ADDITIONAL_PACKAGES" | grep -qw "$pkg"; then
          rs_packages="$rs_packages $pkg"
          log_info "  + $pkg"
        fi
      fi
    done < "$pkgdb"
    if [ -n "$rs_packages" ]; then
      ADDITIONAL_PACKAGES="$ADDITIONAL_PACKAGES$rs_packages"
    fi
  fi

  # Recursively resolve Install-dependency and C-SelectedGroup (transitive)
  log_info "Resolving dependencies (Install-dependency and C-SelectedGroup recursive search)..."
  local resolved="" queue="$root"
  while [ -n "${queue// /}" ]; do
    set -- $queue
    local cur="$1"; shift; queue="$*"
    case " $resolved " in
      *" $cur "*) continue ;;
    esac
    resolved="$resolved $cur"
    local deps
    deps="$(lookup_field "$pkgdb" "$cur" 4)"
    if [ -n "$deps" ]; then
      queue="$queue $deps"
    fi
    local groups
    groups="$(lookup_field "$pkgdb" "$cur" 5)"
    if [ -n "$groups" ]; then
      queue="$queue $groups"
    fi
  done

  # Add additional packages
  log_info "Processing additional packages..."
  for pkg in $ADDITIONAL_PACKAGES; do
    case " $resolved " in
      *" $pkg "*) continue ;;
    esac
    resolved="$resolved $pkg"
    log_info "  + $pkg"
    # Recursively resolve dependencies for additional packages (Install-dependency and C-SelectedGroup)
    local deps groups
    deps="$(lookup_field "$pkgdb" "$pkg" 4)"
    groups="$(lookup_field "$pkgdb" "$pkg" 5)"
    if [ -n "$deps" ] || [ -n "$groups" ]; then
      queue="$deps $groups"
      while [ -n "${queue// /}" ]; do
        set -- $queue
        local cur="$1"; shift; queue="$*"
        case " $resolved " in
          *" $cur "*) continue ;;
        esac
        resolved="$resolved $cur"
        local d g
        d="$(lookup_field "$pkgdb" "$cur" 4)"
        if [ -n "$d" ]; then
          queue="$queue $d"
        fi
        g="$(lookup_field "$pkgdb" "$cur" 5)"
        if [ -n "$g" ]; then
          queue="$queue $g"
        fi
      done
    fi
  done

  # Defensive normalization: word-splitting already separates space-joined names,
  # so a token can't contain whitespace here (unlike PowerShell arrays, where a
  # past concatenation bug fused names into one string). Still, rebuild the list
  # keeping only non-empty tokens to guard against degenerate/empty entries.
  local resolved_clean=""
  for pkg in $resolved; do
    [ -z "$pkg" ] && continue
    resolved_clean="$resolved_clean $pkg"
  done
  resolved="$resolved_clean"

  set -- $resolved
  local total=$#
  log_success "Total resolved packages: $total"

  # Dry-run: print list without installing
  if [ "$DRY_RUN" = true ]; then
    log_warning "[DRY-RUN] The following packages are installation targets (download/install not performed):"
    local n=0
    for pkg in $resolved; do
      n=$((n+1))
      local p
      p="$(lookup_field "$pkgdb" "$pkg" 2)"
      printf '    %3d. %-48s %s\n' "$n" "$pkg" "${p:-<no-binary>}"
    done
    rm -rf "$workdir"
    return 0
  fi

  # Download each package and merge data/ to SDK root
  mkdir -p "$INSTALL_PATH/.package"
  local idx=0 ok=0 skip=0 fail=0
  local skipped=""  # each line: "<pkg> — <reason>", surfaced in the final summary
  for pkg in $resolved; do
    idx=$((idx+1))

    # Resume support: if manifest already exists for this package, it was installed in previous run,
    # so skip it without re-downloading (continue interrupted/timed-out install from where it left off).
    if [ -f "$INSTALL_PATH/.package/$pkg.manifest" ]; then
      log_info "[$idx/$total] $pkg already installed, skipping"
      skip=$((skip+1))
      skipped="$skipped
    - $pkg — already installed (previous run)"
      continue
    fi

    local path
    path="$(lookup_field "$pkgdb" "$pkg" 2)"
    if [ -z "$path" ]; then
      log_warning "[$idx/$total] $pkg: no binary path (meta/skip)"
      skip=$((skip+1))
      skipped="$skipped
    - $pkg — meta package (no downloadable binary)"
      continue
    fi

    local url="$PKG_REPO$path"
    local zip="$workdir/$(basename "$path")"
    log_info "[$idx/$total] Downloading $pkg..."
    if ! curl -fsSL --max-time 1800 -o "$zip" "$url"; then
      # When pkg_list version is ahead of actual published binary (upstream skew),
      # Path returns 404. In this case, fall back to published latest from binary/ list.
      local alt="" listing_ok=1
      if fetch_binlist "$binlist"; then
        alt="$(resolve_published_binary "$binlist" "$pkg" "$PKG_OS")"
      else
        listing_ok=0
      fi
      if [ -n "$alt" ] && [ "$alt" != "$(basename "$path")" ] \
         && curl -fsSL --max-time 1800 -o "$zip" "$PKG_REPO/binary/$alt"; then
        log_warning "[$idx/$total] $pkg: pkg_list version not published (404) — using published latest: $alt"
      elif [ "$listing_ok" -eq 1 ] && [ -z "$alt" ]; then
        # No version of this package is published in the repo — retries won't help
        # (upstream gap, e.g., -v2 emulator component not yet published). Instead of failing entire SDK,
        # skip and warn. Core dev tools are already installed.
        log_warning "[$idx/$total] $pkg: no binary published in repo — skipping (upstream gap)"
        skip=$((skip+1))
        skipped="$skipped
    - $pkg — not published in the repo (upstream gap), skipped"
        continue
      else
        log_error "[$idx/$total] Failed to download $pkg: $url"
        fail=$((fail+1))
        continue
      fi
    fi

    local stage="$workdir/stage_$idx"
    rm -rf "$stage" 2>/dev/null
    sleep 0.5
    mkdir -p "$stage"

    # Check if package is optional (RS packages)
    local is_optional=0
    if echo "$pkg" | grep -q -- "-rs-"; then
      is_optional=1
    fi

    # -o overwrites without prompting. Linux is case-sensitive so rootstrap ZIPs
    # with case-only-distinct paths (e.g. ipt_ttl.h AND ipt_TTL.h) extract as two
    # files; on case-insensitive macOS -o makes the last of a colliding pair win.
    # This is the POSIX counterpart of the Windows entry-by-entry overwrite path.
    if ! unzip -o -q "$zip" -d "$stage" 2>&1; then
      if [ $is_optional -eq 1 ]; then
        log_warning "[$idx/$total] $pkg optional (RS) extraction failed, skipping"
        skip=$((skip+1))
        skipped="$skipped
    - $pkg — optional rootstrap (RS), extraction failed"
      else
        log_error "[$idx/$total] Failed to extract $pkg"
        fail=$((fail+1))
      fi
      rm -f "$zip"
      rm -rf "$stage"
      continue
    fi

    # Merge data/ contents to SDK root
    if [ -d "$stage/data" ]; then
      cp -a "$stage/data/." "$INSTALL_PATH/" 2>/dev/null || cp -R "$stage/data/." "$INSTALL_PATH/"
    fi
    # Keep manifest for installation record
    if [ -f "$stage/pkginfo.manifest" ]; then
      cp -f "$stage/pkginfo.manifest" "$INSTALL_PATH/.package/$pkg.manifest"
    fi

    rm -f "$zip"
    rm -rf "$stage"
    ok=$((ok+1))
  done

  log_success "Platform package installation result: success $ok / skipped $skip / failed $fail (total $total)"
  if [ -n "$skipped" ]; then
    log_warning "Skipped packages ($skip) — names and reasons:$skipped"
  fi
  rm -rf "$workdir"

  [ "$fail" -eq 0 ]
}

# Create sdk.info file
create_sdk_info() {
  log_step "=== Creating sdk.info file ==="

  local sdk_info_path="$INSTALL_PATH/sdk.info"
  local parent_dir
  parent_dir="$(dirname "$INSTALL_PATH")"
  local data_path="$parent_dir/tizen-sdk-data"

  # No comment/blank lines: Tizen CLI's tpklib PropertyParser does substring(0, indexOf("=")) per line and crashes on any line without "=".
  cat > "$sdk_info_path" <<EOF
TIZEN_SDK_INSTALLED_PATH=$INSTALL_PATH
TIZEN_SDK_DATA_PATH=$data_path
EOF

  if [ $? -eq 0 ]; then
    log_success "Created sdk.info file: $sdk_info_path"
    log_info "TIZEN_SDK_INSTALLED_PATH=$INSTALL_PATH"
    log_info "TIZEN_SDK_DATA_PATH=$data_path"
  else
    log_error "Failed to create sdk.info file"
    return 1
  fi
}

# Write repository.info to .package/ so that future package updates
# download from the same repository that was used during install — either the
# timezone-selected CDN mirror or the --repo-url the user supplied.
create_repository_info() {
  log_step "=== Creating repository.info file ==="

  local pkg_dir="$INSTALL_PATH/.package"
  mkdir -p "$pkg_dir"
  local repo_info_path="$pkg_dir/repository.info"
  local source_desc="CDN mirror selected by timezone"
  [ -n "$REPO_URL" ] && source_desc="custom repository supplied via --repo-url"

  cat > "$repo_info_path" <<EOF
# Tizen SDK Package Repository ($source_desc)
# This file is used by the package updater and the emulator package downloader
# to fetch from the same repository that was used during the initial SDK
# installation.
Repository=$PKG_REPO
EOF

  if [ $? -eq 0 ]; then
    log_success "Created repository.info file: $repo_info_path"
    log_info "Repository=$PKG_REPO"
  else
    log_error "Failed to create repository.info file"
    return 1
  fi
}


# Setup environment variables
setup_environment() {
  log_step "=== Setting up environment variables ==="

  local profile_file=""

  # Detect shell profile from the user's login shell first.
  case "$(basename "${SHELL:-}")" in
    zsh)
      profile_file="$HOME/.zshrc"
      ;;
    bash)
      profile_file="$HOME/.bashrc"
      ;;
    *)
      if [ -n "${ZSH_VERSION:-}" ]; then
        profile_file="$HOME/.zshrc"
      else
        profile_file="$HOME/.bashrc"
      fi
      ;;
  esac

  PROFILE_FILE="$profile_file"

  # Already added? Only an ACTIVE (non-commented) export counts — a commented
  # placeholder like "#export TIZEN_SDK_PATH=..." must NOT block the real write.
  if grep -qE '^[[:space:]]*export[[:space:]]+TIZEN_SDK_PATH' "$profile_file" 2>/dev/null; then
    log_warning "Environment variables already set: $profile_file"
    return 0
  fi

  log_info "Adding environment variables to: $profile_file"

  # Build the export block in a temp file.
  local blockfile; blockfile="$(mktemp)"
  cat > "$blockfile" <<EOF
# Tizen SDK
export TIZEN_SDK_PATH="$INSTALL_PATH"
# tools = sdb, tools/tizen-core = tz (so both are callable by name)
export PATH="\$TIZEN_SDK_PATH/bin:\$TIZEN_SDK_PATH/tools:\$TIZEN_SDK_PATH/tools/tizen-core:\$PATH"

EOF

  # ~/.bashrc usually returns early for non-interactive shells
  # (case \$- in *i*) ;; *) return;; esac). Agents/Cline may source it
  # non-interactively, so insert the exports BEFORE that guard when present;
  # otherwise append at the end.
  if grep -qE '^[[:space:]]*case[[:space:]]+\$-[[:space:]]+in' "$profile_file" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    awk 'FNR==NR { blk[++n]=$0; next }
         /^[[:space:]]*case[[:space:]]+\$-[[:space:]]+in/ && !ins { for (i=1;i<=n;i++) print blk[i]; ins=1 }
         { print }' "$blockfile" "$profile_file" > "$tmp" && mv "$tmp" "$profile_file"
  else
    printf '\n' >> "$profile_file"
    cat "$blockfile" >> "$profile_file"
  fi
  rm -f "$blockfile"

  log_success "Environment variables setup complete"
  log_warning "Open a new terminal or run source with the following command:"
  log_warning "  source $profile_file"
  log_warning "  or open a new terminal"

  SETUP_ENV=true
}

# Verify installation
verify_installation() {
  log_step "=== Verifying installation ==="

  local failed=0

  # Count installed platform packages
  if [ -d "$INSTALL_PATH/.package" ]; then
    local cnt
    cnt="$(find "$INSTALL_PATH/.package" -name '*.manifest' 2>/dev/null | wc -l | tr -d ' ')"
    log_success "Installed platform packages: ${cnt}"
  fi

  # Child process (this script) cannot change parent shell's environment variables (Unix fundamental constraint),
  # so apply PATH to this process and verify. This serves as "script runs tz --version in its own process right after install".
  # Parent shell (Cline terminal) gets it via source ~/.bashrc && ...
  export TIZEN_SDK_PATH="$INSTALL_PATH"
  export PATH="$TIZEN_SDK_PATH/bin:$TIZEN_SDK_PATH/tools:$TIZEN_SDK_PATH/tools/tizen-core:$PATH"

  # This environment uses `tz` (tools/tizen-core) and `sdb`
  # (tools/) — NOT a `tizen` CLI — so verify those; otherwise an agent chases a
  # non-existent `tizen` command and wanders into PATH debugging.
  if command -v tz &> /dev/null && command -v sdb &> /dev/null; then
    log_success "tz / sdb commands available (PATH configured)"
    # Print actual version so Cline doesn't guess the version
    local tz_ver
    tz_ver="$(tz --version 2>&1 | head -1)" || true
    if [ -n "$tz_ver" ]; then
      log_info "tz --version: $tz_ver"
    fi
  else
    log_warning "tz / sdb not yet in PATH (open new terminal or run source)"
  fi

  return $failed
}

# Show help
show_help() {
  cat <<EOF
Tizen SDK platform package installation tool

Usage: $0 [OPTIONS]

Options:
  -p, --path <path>        Installation path (default: \$HOME/tizen-sdk)
      --platform <ver>     Specify Tizen platform version to install (e.g., 10.0, 11.0)
                           Omit to auto-select highest version from pkg_list
      --repo-url <url>     Custom package repository URL to install from, instead of
                           the timezone-selected CDN mirror. The URL MUST serve
                           pkg_list_{OS}-64 or pkg_list_{OS}-32 at its root
                           (OS = windows | ubuntu | macos; here: ${PKG_OS:-<os>}),
                           otherwise it is rejected before anything is downloaded.
      --validate-repo-url  Validate --repo-url only (no install) and exit
                           (exit 0 = valid repository, 1 = invalid)
      --dry-run            Print resolved package list without installing
  -f, --force              Force reinstall even if already installed
  -c, --check              Only check installation
    -s, --status             Query result of last (or ongoing) install run
                           (STATUS=running | done EXIT=<code> | none)
                           Recover result even if completion notification is lost
       --wait               Sleep 60 seconds then print status (for Cline polling)
                           This enforces a 60-second gap between polls so the
                           agent does not poll continuously. Use instead of
                           calling --status in a tight loop.
       --detach             Re-launch self in background via nohup and exit immediately
                           (for harnesses with 10-min timeout, e.g. Cline)
                           Poll completion with --status (or --wait)
    -h, --help               Show help


Environment variables:
  TIZEN_SDK_PATH           Installation path when no --path is given and no
                           ~/.tizen.sdk.path.config exists (default: \$HOME/tizen-sdk).
                           Ignored when it points at a Tizen Studio install.

Operations:
  1) Download/parse pkg_list_${PKG_OS:-<os>} from $PKG_REPO
  2) Select latest version among TIZEN-X.Y root packages (e.g., if 11.0 exists, use 11.0)
  3) Recursively resolve all Install-dependency and C-SelectedGroup of selected platform
  4) Download each package from ($PKG_REPO + Path) and merge data/ to SDK root
  5) Check and guide long path (Long Path) support

Examples:
  $0                       # Auto-install latest platform
  $0 --platform 10.0       # Install Tizen 10.0 specifically
  $0 --dry-run             # Check only what will be installed
  $0 --check               # Check installation status only
  $0 --repo-url http://mirror.example.com/packages/tizen_sdk_11.0
                           # Install from a custom repository
  $0 --repo-url <url> --validate-repo-url
                           # Only check whether <url> is a valid repository

Notes:
  - Windows: Run as administrator to auto-enable Long Path Support
  - Linux/macOS: For long paths, recommend using symbolic links or short paths
EOF
}

# -----------------------------------------------------------------------------
# Durable run-state markers.
# A completed install MUST stay recoverable even if the harness completion
# notification never reaches the context that launched the (background) run —
# this is what makes a "completion report lost" situation impossible: the truth
# is on disk, queryable at any later turn via `--status`.
#   <install>/.install-running  — present while a real install is in progress
#   <install>/.install-result   — written on every exit; holds "EXIT=<code>"
# -----------------------------------------------------------------------------
_on_exit_marker() {
  local code=$?
  [ -d "$INSTALL_PATH" ] || return 0
  rm -f "$INSTALL_PATH/.install-running" 2>/dev/null || true
  printf 'EXIT=%s\n' "$code" > "$INSTALL_PATH/.install-result" 2>/dev/null || true
}

print_status() {
  if [ -f "$INSTALL_PATH/.install-running" ]; then
    echo "STATUS=running"
  elif [ -f "$INSTALL_PATH/.install-result" ]; then
    echo "STATUS=done $(cat "$INSTALL_PATH/.install-result" 2>/dev/null)"
  elif [ -f "$INSTALL_PATH/sdk.info" ]; then
    echo "STATUS=done EXIT=0"
  else
    echo "STATUS=none"
  fi
}

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    -p|--path)
      INSTALL_PATH="$2"
      shift 2
      ;;
    --path=*)
      INSTALL_PATH="${1#*=}"
      shift
      ;;
    --platform)
      PLATFORM_VERSION="$2"
      shift 2
      ;;
    --platform=*)
      PLATFORM_VERSION="${1#*=}"
      shift
      ;;
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --repo-url=*)
      REPO_URL="${1#*=}"
      shift
      ;;
    --validate-repo-url)
      VALIDATE_ONLY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -f|--force)
      FORCE=true
      shift
      ;;
    -s|--status)
      # Recover the outcome of a (possibly background) run from disk, regardless
      # of whether its completion notification was delivered. Runs before the
      # EXIT trap is installed, so it never overwrites the markers.
      print_status
      exit 0
      ;;
    --wait)
      # Sleep 60 seconds then print status. This enforces a 60-second polling
      # interval for harnesses (e.g. Cline) that would otherwise poll in a tight
      # loop. The sleep is inside the script so the agent cannot skip it.
      sleep 60
      print_status
      exit 0
      ;;
    --detach)
      DETACH=true
      shift
      ;;
    -c|--check)
      detect_install_os
      if check_install_path; then exit 0; else exit 1; fi
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

# --validate-repo-url: check the repository URL and exit. Nothing is downloaded
# or installed. Exit 0 = valid (pkg_list_{OS}-{64,32} served), 1 = invalid.
#
# The two stdout lines are the machine-readable result (all human-readable
# logging goes to stderr), so the Node pre-check layer can report WHICH pkg_list
# was found without re-implementing the probe.
if [ "$VALIDATE_ONLY" = true ]; then
  if [ -z "$REPO_URL" ]; then
    log_error "--validate-repo-url requires --repo-url <url>"
    exit 1
  fi
  if matched_pkg_os="$(validate_pkg_repo_url "$REPO_URL")"; then
    echo "REPOSITORY=$(normalize_repo_url "$REPO_URL")"
    echo "PKG_LIST=pkg_list_$matched_pkg_os"
    exit 0
  fi
  exit 1
fi

# --detach: re-launch self in background via nohup and exit immediately.
# This is for harnesses (e.g. Cline) that have a 10-minute background process
# timeout but no task-notification mechanism. The caller polls --status to
# detect completion. The detached process survives the harness timeout because
# nohup detaches it from the controlling terminal and process group.
#
# Every option that changes WHAT gets installed must be forwarded — dropping
# --repo-url here would silently install from the default CDN instead of the
# repository the user asked for, and dropping --path would install elsewhere
# than the path whose --status the caller then polls.
if [ "$DETACH" = true ]; then
  detach_args=(--force --path "$INSTALL_PATH")
  [ -n "$PLATFORM_VERSION" ] && detach_args+=(--platform "$PLATFORM_VERSION")
  [ -n "$REPO_URL" ] && detach_args+=(--repo-url "$REPO_URL")
  nohup bash "$0" "${detach_args[@]}" > "$DETACH_LOG" 2>&1 & jobs -p
  echo "LOG=$DETACH_LOG"
  # --status exits as soon as it is parsed, so --path must come BEFORE it.
  echo "Poll status with: bash \"$0\" --path \"$INSTALL_PATH\" --status"
  exit 0
fi

# Main installation flow

log_info "Starting Tizen SDK installation tool"
log_info "Installation path: $INSTALL_PATH"
echo ""

# Detect OS
detect_install_os
log_info "Detected OS: $OS_TYPE (pkg_list: pkg_list_$PKG_OS)"
echo ""

# Custom repository (--repo-url): validate and switch the package source before
# any download happens. An invalid URL aborts here with a non-zero exit code.
if [ -n "$REPO_URL" ]; then
  if ! apply_custom_repo; then
    exit 1
  fi
  echo ""
else
  log_info "Package repository (timezone-selected CDN): $PKG_REPO"
  echo ""
fi

# Check long path support
check_long_path_support
echo ""

# Check requirements (curl/unzip/awk needed even in dry-run/packages-only)
if ! check_requirements; then
  log_error "System requirements not met"
  exit 1
fi
echo ""

# Check install path (informational only — returns 1 when not yet installed,
# which must not abort the install under set -e)
check_install_path || true
echo ""

# Skip if already installed.
# sdk.info is created only when install succeeds to completion, so its existence means
# previous install completed (partial interrupted install has no file).
# Also check for core tools (sdb/tz) — if only sdk.info exists but tools are missing,
# it's a past incomplete install state, so don't exit early, proceed with reinstall.
if [ -f "$INSTALL_PATH/sdk.info" ] && [ "$FORCE" != true ]; then
  if [ -x "$INSTALL_PATH/tools/sdb" ] && [ -x "$INSTALL_PATH/tools/tizen-core/tz" ]; then
    log_success "Tizen SDK already installed: $INSTALL_PATH"
    log_info "Confirmed sdk.info and core tools (sdb/tz) (previous install completed successfully)"
    log_info "To reinstall, run again with --force option"
    # An existing install is NOT re-pointed at a different repository by this
    # early exit — say so, or the user believes --repo-url took effect.
    if [ -n "$REPO_URL" ]; then
      installed_repo="$(sed -n 's/^Repository=//p' "$INSTALL_PATH/.package/repository.info" 2>/dev/null | head -1)"
      log_warning "--repo-url was NOT applied: the SDK at $INSTALL_PATH is already installed."
      log_warning "Currently installed from: ${installed_repo:-<unknown>}"
      log_warning "Requested repository:     $(normalize_repo_url "$REPO_URL")"
      log_warning "Re-run with --force to reinstall from the requested repository."
    fi
    exit 0
  fi
  log_warning "sdk.info exists but core tools (sdb/tz) missing — treating as incomplete install, proceeding with reinstall."
fi

# Before actual install starts: record 'running' marker + record 'result' marker on exit.
# This allows recovery of result (EXIT=<code>) via `--status` later even if completion notification is lost.
# (dry-run is not actual install, so no markers are left)
if [ "$DRY_RUN" != true ]; then
  mkdir -p "$INSTALL_PATH"
  rm -f "$INSTALL_PATH/.install-result" 2>/dev/null || true
  : > "$INSTALL_PATH/.install-running"
  trap _on_exit_marker EXIT
fi

# Install platform packages (core operation)
INSTALL_FAILED=false
if ! install_platform_packages; then
  INSTALL_FAILED=true
  log_warning "Some platform packages failed to install (see log above)"
fi
echo ""

# Dry-run exits without verification/summary
if [ "$DRY_RUN" = true ]; then
  log_success "[DRY-RUN] Completed"
  exit 0
fi

# If install failed, exit as failure here.
# - Must not create sdk.info so "sdk.info exists == install complete" invariant is maintained,
#   and next run won't wrongly exit early with "already installed".
# - Must propagate exit code as failure (1) so caller (background task/agent) doesn't mistake "done"
#   as success. (Previously exited 0 even on failure)
if [ "$INSTALL_FAILED" = true ]; then
  log_error "Tizen SDK installation not completed (some packages failed)."
  log_error "Not creating sdk.info. Check network and run again"
  log_error "(Already downloaded packages will be skipped and install continues)."
  exit 1
fi

# Create sdk.info file (only when install succeeds to completion)
create_sdk_info
echo ""

# Write SDK path to ~/.tizen.sdk.path.config so that all other skills
# (build, create, device, debug, etc.) can locate the SDK via readSdkPath().
# This is the "sdk init" step — done automatically at the end of a successful
# install so the user does not need to run sdk-init separately.
write_sdk_path_config() {
  log_step "=== Writing SDK path config ==="

  local config_file="$HOME/.tizen.sdk.path.config"
  if printf '%s\n' "$INSTALL_PATH" > "$config_file" 2>/dev/null; then
    chmod 600 "$config_file" 2>/dev/null || true
    log_success "SDK path config written: $config_file → $INSTALL_PATH"
  else
    log_warning "Failed to write SDK path config: $config_file"
  fi
}
write_sdk_path_config
echo ""

# Write repository.info so the package updater uses the same CDN mirror
create_repository_info
echo ""


# Setup environment variables
setup_environment

echo ""

# Verify
verify_installation
echo ""

log_success "Tizen SDK platform package installation complete!"
log_info "Next steps:"
log_info "1. Open new terminal or apply environment variables and verify with:"
log_info "   source ${PROFILE_FILE:-~/.bashrc} && tz --version"
log_info "2. Use installed platform packages with Tizen SDK"

exit 0
