#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# setup-lib.sh — shared helpers for the per-harness setup scripts.
#
# Sourced by common/setup/setup.sh (not meant to be executed). Reuses the
# colour variables and detect_os() from common/scripts/lib/common.sh so the
# OS mapping and TTY/NO_COLOR handling live in one place.
#
# Output convention: write_status prints to STDOUT (the setup scripts are
# interactive and users `| tee` them); common.sh's log_* helpers go to stderr
# and are left for the feature scripts.

SETUP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../scripts/lib/common.sh
source "$SETUP_LIB_DIR/../scripts/lib/common.sh"
CYAN="${BLUE}" # common.sh has no CYAN; BLUE is already '' when not a TTY

# Where the shared plugin sources live (…/common).
COMMON_DIR="$(cd "$SETUP_LIB_DIR/.." && pwd)"
PLUGIN_NAME="tizen-sdk-skills"
CACHE_TAIL="plugins/cache/tizen-platform/$PLUGIN_NAME"
# Ids earlier releases used for the same directories and markers (the plugin
# shipped as tizen-sdk-agents from the tizen-ai-plugins monorepo). Recognised
# so an update replaces the previous install instead of leaving it beside the
# new one; never written again.
LEGACY_PLUGIN_NAMES=(tizen-sdk-agents)
# Extended regex matching any id that marks a file as ours (grep -E).
MARKER_RE="$PLUGIN_NAME"
for _legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do MARKER_RE="$MARKER_RE|$_legacy"; done
unset _legacy

# Remove a directory or file a previous release wrote under a name we no
# longer use. Namespaced to the plugin, so nothing of the user's lives inside.
remove_legacy_path() { # <path> <label>
  local target="$1" label="$2"
  [[ -e "$target" ]] || return 0
  rm -rf "$target"
  write_status "Removed legacy $label: $target" "Success"
}

# ----------------------------------------------------------------------------
# Output
# ----------------------------------------------------------------------------
write_status() { # <message> [Info|Success|Warning|Error]
  local message="$1" type="${2:-Info}" color="$NC"
  case "$type" in
    Success) color="$GREEN" ;;
    Warning) color="$YELLOW" ;;
    Error)   color="$RED" ;;
    Info)    color="$CYAN" ;;
  esac
  echo -e "${color}[$type]${NC} $message"
}

step() { # <n> <title>
  echo ""
  echo -e "${CYAN}[Step $1] $2${NC}"
}

banner() { echo ""; echo -e "${CYAN}=== $* ===${NC}"; }

# ----------------------------------------------------------------------------
# Version / OS
# ----------------------------------------------------------------------------
# Plugin version from common/.claude-plugin/plugin.json (single source of truth
# is package.json, synced into plugin.json at build time). Prefer node — it is a
# hard prerequisite for the runners anyway — and fall back to a grep for
# minimal environments.
read_plugin_version() { # <repo-root>
  local json="$1/common/.claude-plugin/plugin.json"
  [[ -f "$json" ]] || { write_status "plugin.json not found: $json" "Error"; return 1; }
  local v
  v="$(node -p "require(process.argv[1]).version" "$json" 2>/dev/null || true)"
  if [[ -z "$v" ]]; then
    v="$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"//;s/"//')"
  fi
  [[ -n "$v" ]] || { write_status "No version field in $json" "Error"; return 1; }
  printf '%s' "$v"
}

# common.sh says linux|mac|windows|unknown; the tools/ tree says linux|macos|windows.
tools_os() {
  case "$(detect_os)" in
    mac)     echo "macos" ;;
    windows) echo "windows" ;;
    *)       echo "linux" ;;
  esac
}

# ----------------------------------------------------------------------------
# Copy / compare
# ----------------------------------------------------------------------------
# Mirror-style copy: pass "clean" as 4th arg to remove stale files first.
copy_files_recursive() { # <source> <dest> <label> [clean]
  local source="$1" dest="$2" label="$3" clean="${4:-}"
  if [[ ! -d "$source" ]]; then
    write_status "Source not found: $source" "Warning"
    return 0
  fi
  if [[ "$clean" == "clean" && -d "$dest" ]]; then
    rm -rf "$dest"
  fi
  mkdir -p "$dest"
  cp -r "$source/." "$dest/"
  write_status "$label copy complete: $source -> $dest" "Success"
}

# Content comparison (diff -rq) — a renamed file no longer passes as "same
# count". Falls back to the file-count check where diff is unavailable.
compare_directories() { # <source> <target> <label>
  local source="$1" target="$2" label="$3"
  if [[ ! -d "$source" ]]; then
    write_status "$label : source missing - $source" "Warning"; return 0
  fi
  if [[ ! -d "$target" ]]; then
    write_status "$label : target missing - $target" "Warning"; return 0
  fi
  if command -v diff >/dev/null 2>&1; then
    local out
    if out="$(diff -rq "$source" "$target" 2>&1)"; then
      write_status "$label : Validation passed" "Success"
    else
      write_status "$label : Differences found" "Warning"
      printf '%s\n' "$out" | head -5 | sed 's/^/    /'
    fi
    return 0
  fi
  local src_count target_count
  src_count=$(find "$source" -type f | wc -l)
  target_count=$(find "$target" -type f | wc -l)
  if [[ $src_count -ne $target_count ]]; then
    write_status "$label : File count mismatch (source: $src_count, target: $target_count)" "Warning"
    return 0
  fi
  write_status "$label : Validation passed" "Success"
}

# Copy a shell script and make it runnable: strip CR (CRLF checkouts on Windows
# break `#!/usr/bin/env bash`) and set the executable bit. tr + mv instead of
# `sed -i`, which is a silent no-op on BSD sed without a suffix.
install_shell_script() { # <source> <dest>
  local source="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  tr -d '\r' < "$source" > "$dest"
  chmod +x "$dest"
}

# ----------------------------------------------------------------------------
# Cache / personal sync
# ----------------------------------------------------------------------------
# Mirror the requested common/<subdir>s, the OS-specific tools/ binary and
# repo docs/ into <cache-base>. Usage: sync_cache <repo> <cache-base> <subdir>...
sync_cache() {
  local repo="$1" cache_base="$2"; shift 2
  mkdir -p "$cache_base"
  local sub
  for sub in "$@"; do
    copy_files_recursive "$COMMON_DIR/$sub" "$cache_base/$sub" "$(tr '[:lower:]' '[:upper:]' <<< "${sub:0:1}")${sub:1}" clean
  done

  local os; os="$(tools_os)"
  local tools_src="$COMMON_DIR/tools/tizen-dlog-analyzer/$os"
  mkdir -p "$cache_base/tools/tizen-dlog-analyzer"
  if [[ -d "$tools_src" ]]; then
    rm -rf "$cache_base/tools/tizen-dlog-analyzer/$os"
    cp -r "$tools_src" "$cache_base/tools/tizen-dlog-analyzer/"
    write_status "Tools ($os) copy complete: $tools_src -> $cache_base/tools/tizen-dlog-analyzer/$os" "Success"
  else
    write_status "Tools ($os): no binary found at $tools_src" "Warning"
  fi

  copy_files_recursive "$repo/docs" "$cache_base/docs" "Docs" clean
}

validate_cache() { # <repo> <cache-base> <subdir>...
  local repo="$1" cache_base="$2"; shift 2
  local sub
  for sub in "$@"; do
    compare_directories "$COMMON_DIR/$sub" "$cache_base/$sub" "$sub (repo <-> cache)"
  done
  local os; os="$(tools_os)"
  compare_directories "$COMMON_DIR/tools/tizen-dlog-analyzer/$os" "$cache_base/tools/tizen-dlog-analyzer/$os" "tools/$os (repo <-> cache)"
  compare_directories "$repo/docs" "$cache_base/docs" "docs (repo <-> cache)"
}

# Per-skill clean mirror: the personal skills dir also holds non-tizen skills,
# so only the skill folders present in the source are touched.
sync_personal_skills() { # <source-skills-dir> <dest-skills-dir> <label>
  local src="$1" dest="$2" label="$3" skill_dir skill_name
  mkdir -p "$dest"
  for skill_dir in "$src"/*/; do
    [[ -d "$skill_dir" ]] || continue
    skill_name="$(basename "$skill_dir")"
    copy_files_recursive "$skill_dir" "$dest/$skill_name" "$label: $skill_name" clean
  done
}

validate_personal_skills() { # <source-skills-dir> <dest-skills-dir> <label>
  local src="$1" dest="$2" label="$3" skill_dir skill_name
  for skill_dir in "$src"/*/; do
    [[ -d "$skill_dir" ]] || continue
    skill_name="$(basename "$skill_dir")"
    compare_directories "$skill_dir" "$dest/$skill_name" "$label: $skill_name"
  done
}

# Agent definitions. MODE:
#   md         copy agents/*.md verbatim           (Claude Code)
#   gemini-md  rewrite frontmatter for Gemini CLI  (tools names, max_turns)
#   toml       convert to Codex CLI agent TOML
#   none       harness has no file-based subagents (Cline)
sync_agents() { # <mode> <source-agents-dir> <dest-dir>
  local mode="$1" src="$2" dest="$3"
  case "$mode" in
    none) return 0 ;;
    md)
      mkdir -p "$dest"
      find "$src" -maxdepth 1 -name "*.md" -type f -exec cp {} "$dest/" \;
      write_status "Agents copy complete: $src -> $dest" "Success"
      ;;
    gemini-md|toml)
      local to="codex-toml"; [[ "$mode" == "gemini-md" ]] && to="gemini-md"
      if ! command -v node >/dev/null 2>&1; then
        write_status "node not found — cannot convert agents to $to (skipped)" "Warning"; return 0
      fi
      mkdir -p "$dest"
      node "$COMMON_DIR/lib/tools/agent-convert.js" --to "$to" "$src" "$dest" \
        && write_status "Agents converted ($to): $src -> $dest" "Success" \
        || write_status "Agent conversion ($to) failed" "Warning"
      ;;
    *) write_status "Unknown agents mode: $mode" "Error"; return 1 ;;
  esac
}

# ----------------------------------------------------------------------------
# Instruction-file section (AGENTS.md / GEMINI.md / Rules)
# ----------------------------------------------------------------------------
# Insert or replace a marker-delimited section in a file the USER owns. Never
# clobbers their other content; idempotent.
install_guard_section() { # <target-file> <source-md> <label> [extra-text]
  # <extra-text>: optional host-specific lines appended after the shared body,
  # still inside the markers (e.g. this host's runner cache root).
  local target="$1" source="$2" label="$3" extra="${4:-}"
  local begin="<!-- $PLUGIN_NAME:begin -->" end="<!-- $PLUGIN_NAME:end -->"
  mkdir -p "$(dirname "$target")"
  # A section left by a pre-rename release carries the old marker pair; drop it
  # first so the file does not end up with two contradictory guard sections.
  local legacy lb le
  for legacy in "${LEGACY_PLUGIN_NAMES[@]}"; do
    lb="<!-- $legacy:begin -->" le="<!-- $legacy:end -->"
    if [[ -f "$target" ]] && grep -qF "$lb" "$target"; then
      awk -v begin="$lb" -v end="$le" '
        $0 == begin { skipping = 1; next }
        $0 == end   { skipping = 0; next }
        !skipping   { print }
      ' "$target" > "$target.tmp" && mv "$target.tmp" "$target"
      write_status "$label: removed legacy $legacy section from $target" "Info"
    fi
  done
  local section body
  body="$(tr -d '\r' < "$source")"
  [[ -z "$extra" ]] || body="$(printf '%s\n\n%s' "$body" "$extra")"
  section="$(printf '%s\n%s\n%s\n' "$begin" "$body" "$end")"
  if [[ -f "$target" ]] && grep -qF "$begin" "$target"; then
    # Replace everything between the markers (inclusive). The section goes in
    # via ENVIRON, not -v: awk -v processes escape sequences, which turned the
    # guard's `"…\sdb.exe"` into `"…sdb.exe"` on every refresh.
    section="$section" awk -v begin="$begin" -v end="$end" '
      $0 == begin { print ENVIRON["section"]; skipping = 1; next }
      $0 == end   { skipping = 0; next }
      !skipping   { print }
    ' "$target" > "$target.tmp" && mv "$target.tmp" "$target"
    write_status "$label: section refreshed in $target" "Success"
  else
    { [[ -f "$target" && -s "$target" ]] && printf '\n'; printf '%s\n' "$section"; } >> "$target"
    write_status "$label: section appended to $target" "Success"
  fi
}
