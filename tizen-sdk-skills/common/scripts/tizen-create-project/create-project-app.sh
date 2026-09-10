#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


# Tizen Project Creation Agent
# Creates native, dotnet, webapp, or rpk resource-package projects using installed templates

set -euo pipefail

# Configuration
# SDK location comes from the shared resolver (lib/common.sh get_sdk_path):
# ~/.tizen.sdk.path.config (written by tizen-sdk-init) -> TIZEN_SDK_PATH ->
# ~/tizen-sdk -> /opt/tizen-sdk, each candidate validated. The previous
# hand-rolled lookup never read the config file, so an SDK anywhere but
# ~/tizen-sdk made list-templates fail with "tz tool not found" (issue #41).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"
TIZEN_STUDIO_PATH="$(get_sdk_path)"

# The tz binary is `tz` on Linux/macOS and `tz.exe` on Windows. Pick by OS,
# then fall back to whichever one actually exists so a wrong guess still works.
case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW*|MSYS*|CYGWIN*) TZ_BIN="tz.exe" ;;
    *)                    TZ_BIN="tz" ;;
esac
TZ_TOOL="${TIZEN_STUDIO_PATH}/tools/tizen-core/${TZ_BIN}"
if [ ! -f "$TZ_TOOL" ]; then
    for _candidate in "tz" "tz.exe"; do
        if [ -f "${TIZEN_STUDIO_PATH}/tools/tizen-core/${_candidate}" ]; then
            TZ_TOOL="${TIZEN_STUDIO_PATH}/tools/tizen-core/${_candidate}"
            break
        fi
    done
fi
TEMPLATES_PATH="${TIZEN_STUDIO_PATH}/tools/tizen-core/templates"
LOCAL_TEMPLATES_PATH="$SCRIPT_DIR/templates"

# Profile used to list and create projects. Templates and `tz new -p` are both
# scoped to it, so what we list is exactly what `tz new` can create. It is
# DETECTED from the installed SDK (issue #72: a hardcoded tizen-10.0 made an
# SDK that ships tizen-11.0 list zero templates, exit 0 — "webapp: []"):
#   TIZEN_TZ_PROFILE env override
#   -> highest tizen-X.Y section in `tz list templates`
#   -> highest platforms/tizen-* directory
#   -> tizen-10.0
# Resolved in main() once $TZ_TOOL is known (detect_tz_profile).
TZ_PROFILE="${TIZEN_TZ_PROFILE:-}"

_tz_profile_sections() {
    # Profile section headers of `tz list templates`, e.g. "tizen-10.0", one per line.
    "$TZ_TOOL" list templates 2>/dev/null | awk '/^[^[:space:]].+:[[:space:]]*$/ { sub(/:[[:space:]]*$/,""); print }' || true
}

detect_tz_profile() {
    if [ -n "$TZ_PROFILE" ]; then
        echo "$TZ_PROFILE"
        return 0
    fi
    local found=""
    if [ -f "$TZ_TOOL" ]; then
        found=$(_tz_profile_sections | grep -E '^tizen-[0-9]+(\.[0-9]+)*$' | sort -V | tail -1 || true)
    fi
    if [ -z "$found" ] && [ -d "$TIZEN_STUDIO_PATH/platforms" ]; then
        found=$(ls -1 "$TIZEN_STUDIO_PATH/platforms" 2>/dev/null | grep -E '^tizen-[0-9]+(\.[0-9]+)*$' | sort -V | tail -1 || true)
    fi
    echo "${found:-tizen-10.0}"
}

# Machine lines for the Node runner (list mode only): which profile was used and
# which profile sections tz knows about, so an empty type list can be explained.
print_profile_info() {
    echo "PROFILE=$TZ_PROFILE"
    echo "PROFILES=$(_tz_profile_sections | paste -sd, - 2>/dev/null || true)"
}

# Why the custom-template sync could not write into the SDK ('' when it could).
# Set by sync_custom_templates, read by report_empty_type: an empty type list
# from a shell that cannot write under the SDK is a permission problem, not a
# missing platform package (issue #72: Codex's sandbox — the templates were
# there all along and the same command succeeded with escalated permissions).
SYNC_FAILURE_REASON=""

# stderr diagnosis when a requested type has no templates under $TZ_PROFILE.
report_empty_type() {
    local t="$1"
    echo "[WARN] No $t templates under profile $TZ_PROFILE in $TIZEN_STUDIO_PATH." >&2
    echo "[WARN] Profiles in 'tz list templates': $(_tz_profile_sections | paste -sd, - 2>/dev/null || echo '(none)')" >&2
    if [ -n "$SYNC_FAILURE_REASON" ]; then
        # "not writable from this shell" is matched by lib/core/sandbox.js
        # (SANDBOX_SYMPTOM_PATTERN) — keep the phrase if you reword this.
        echo "[WARN] The SDK directory is not writable from this shell ($SYNC_FAILURE_REASON), so what 'tz' listed from here may be incomplete." >&2
        echo "[WARN] Under Codex CLI re-run this SAME command with escalated permissions (outside the sandbox) before installing anything." >&2
    else
        echo "[WARN] Set TIZEN_TZ_PROFILE=<profile> to force a profile, or install the platform package for $TZ_PROFILE." >&2
    fi
}

# Project types: templateDir maps our type key to the local templates/ subdir
declare -A PROJECT_TYPE_DIR=(
    [native]="native"
    [dotnet]="dotnet"
    [webapp]="web"
    [rpk]="rpk"
)

# type key -> SDK sample subdir and yaml type token
declare -A TYPE_SAMPLE_SUBDIR=(
    [native]="Native"
)
declare -A TYPE_YAML_TOKEN=(
    [native]="native_app"
)

# Detect the latest tv-samsung-* profile installed in the SDK.
# TV profiles are registered in templates.yaml, not as platform directories.
# We parse `tz list templates` output to find the highest tv-samsung-* version.
# Returns the profile name (e.g. "tv-samsung-9.0") or fails if not found.
detect_tv_profile() {
    local tz_output result
    tz_output="$("$TZ_TOOL" list templates 2>/dev/null)" || return 1
    result=$(echo "$tz_output" | awk '/^tv-samsung-/ { sub(/:[[:space:]]*$/,""); print }' | sort -V | tail -1)
    if [ -z "$result" ]; then
        return 1
    fi
    # Verify the TV SDK extension is actually installed by checking the platform
    # directory exists. `tz list templates` may list tv-samsung-* profiles from
    # templates.yaml metadata even when the TV SDK extension package is not
    # installed, causing phantom TV templates to appear.
    local tv_platform_dir="${TIZEN_STUDIO_PATH}/platforms/${TZ_PROFILE}/tv-samsung"
    if [ ! -d "$tv_platform_dir" ]; then
        return 1
    fi
    echo "$result"
}


# `tz` project-type token as it appears in `tz list templates` (e.g. [dotnet_app]).
type_token() {
    case "$1" in
        native) echo "native_app" ;;
        dotnet) echo "dotnet_app" ;;
        webapp) echo "web_app" ;;
        rpk)    echo "resource_app" ;;
        tv)     echo "web_app" ;;  # TV templates use web_app token
    esac
}


ask_question() {
    local question="$1"
    # Prompt goes to stderr: callers capture stdout, which must carry only the answer.
    echo -n "$question" >&2
    read -r answer
    echo "$answer"
}

# Project names are spliced into sed replacements and filesystem paths, so
# restrict them to a safe character set (letters, digits, '.', '_', '-').
validate_project_name() {
    if [[ ! "$1" =~ ^[A-Za-z0-9._-]+$ ]]; then
        echo "Error: invalid project name '$1' (allowed characters: letters, digits, '.', '_', '-')" >&2
        return 1
    fi
}

# Sync custom templates from the plugin's templates/ directory into the SDK
# so that `tz list templates` discovers them and `tz new` can create them.
#
# For each project type (native only for now), we look for template
# folders under $LOCAL_TEMPLATES_PATH/<templateDir>/ that contain a
# sample.xml (the marker file that identifies a Tizen template).
# For each one found:
#   1. Copy the folder into the SDK's sample template directory.
#   2. Register it in templates.yaml (if not already present).
sync_custom_templates() {
    if [ ! -d "$LOCAL_TEMPLATES_PATH" ]; then return; fi

    # SDK sample template directories (where tz new looks for the actual files)
    local sdk_sample_base="${TIZEN_STUDIO_PATH}/platforms/${TZ_PROFILE}/tizen/samples/Template"
    local sdk_template_yaml_dir="${TEMPLATES_PATH}/native"
    local sdk_template_yaml="${sdk_template_yaml_dir}/templates.yaml"

    # Only native type is supported for custom template sync (matching PowerShell version)
    local type_key="native"
    local template_dir="${PROJECT_TYPE_DIR[$type_key]}"
    local local_type_path="${LOCAL_TEMPLATES_PATH}/${template_dir}"
    if [ ! -d "$local_type_path" ]; then return; fi

    local sample_subdir="${TYPE_SAMPLE_SUBDIR[$type_key]}"
    local yaml_type="${TYPE_YAML_TOKEN[$type_key]}"
    local sdk_sample_type_path="${sdk_sample_base}/${sample_subdir}"

    # Find all template folders with a sample.xml
    for folder in "$local_type_path"/*/; do
        [ -d "$folder" ] || continue
        [ -f "${folder}sample.xml" ] || continue

        local template_name
        template_name="$(basename "$folder")"

        # 1. Copy template folder to SDK sample directory
        local dest_path="${sdk_sample_type_path}/${template_name}"
        if [ -d "$dest_path" ]; then
            : # Already exists — skip copy (don't overwrite SDK originals)
        else
            mkdir -p "$sdk_sample_type_path" 2>/dev/null || true
            # Keep cp's own reason ("Permission denied", "Read-only file system"):
            # it tells a read-only SDK / sandboxed shell apart from a broken
            # template, and lib/core/sandbox.js matches those tokens to offer the
            # escalated re-run (issue #72).
            local cp_err=""
            if cp_err=$(cp -r "$folder" "$dest_path" 2>&1); then
                echo "[INFO] Synced custom template '$template_name' to SDK: $dest_path" >&2
            else
                cp_err=$(printf '%s' "$cp_err" | head -n 1)
                SYNC_FAILURE_REASON="${cp_err:-cp exited non-zero}"
                echo "[WARN] Could not sync custom template '$template_name' into the SDK ($SYNC_FAILURE_REASON) — listing continues." >&2
                continue
            fi
        fi

        # 2. Register in templates.yaml (native only)
        if [ -f "$sdk_template_yaml" ]; then
            local entry_name="name: $template_name"
            if ! grep -qF "$entry_name" "$sdk_template_yaml" 2>/dev/null; then
                local new_entry="    - name: ${template_name}\n      type: ${yaml_type}\n      path: templates/native/${TZ_PROFILE}/${template_name}\n"
                if grep -q "${TZ_PROFILE}:" "$sdk_template_yaml" 2>/dev/null; then
                    # Insert after the profile header line
                    sed -i "/${TZ_PROFILE}:/a\\${new_entry}" "$sdk_template_yaml" 2>/dev/null && \
                        echo "[INFO] Registered '$template_name' in templates.yaml" >&2 || true
                fi
            fi
        fi
    done
}

# Scan the plugin's templates/platform/ directory for GBS-buildable sample apps.
# These are NOT tz new templates — they are complete source trees built with GBS.
discover_platform_samples() {
    local platform_path="${LOCAL_TEMPLATES_PATH}/platform"
    if [ ! -d "$platform_path" ]; then return; fi
    for d in "$platform_path"/*/; do
        [ -d "$d" ] || continue
        basename "$d"
    done | sort -u
}

discover_templates() {

    local native_count dotnet_count webapp_count rpk_count
    native_count=$(get_templates_for_type native | grep -c . || true)
    dotnet_count=$(get_templates_for_type dotnet | grep -c . || true)
    webapp_count=$(get_templates_for_type webapp | grep -c . || true)
    rpk_count=$(get_templates_for_type rpk | grep -c . || true)
    echo "native:$native_count:dotnet:$dotnet_count:webapp:$webapp_count:rpk:$rpk_count"
}


select_project_type() {
    # Menu/prompt text goes to stderr; stdout carries only the selected type,
    # because the caller captures it with $(...).
    {
        echo ""
        echo "Tizen Project Creation Agent"
        echo ""
        echo "Select a project type:"
        echo ""
        echo "  1. Native (C)"
        echo "  2. DotNET (C#)"
        echo "  3. WebApp"
        echo "  4. Resource Package (RPK)"
        echo ""
    } >&2

    while true; do
        selection=$(ask_question "Enter your choice (1-4): ")
        case "$selection" in
            1) echo "native"; return 0 ;;
            2) echo "dotnet"; return 0 ;;
            3) echo "webapp"; return 0 ;;
            4) echo "rpk"; return 0 ;;
            *) echo "Invalid selection. Please try again." >&2 ;;
        esac
    done
}

# Get templates for the TV profile (tv-samsung-*).
# Lists both web_app and dotnet_app templates from the latest tv-samsung-* profile.
get_tv_templates() {
    local tv_profile
    tv_profile=$(detect_tv_profile) || {
        echo "[INFO] No TV SDK (tv-samsung-*) profile found. Install TV SDK extension first." >&2
        return 0
    }

    # `|| rc=$?`, never a bare `rc=$?` after the assignment: under `set -e` a
    # failing command substitution aborts the script before the error branch.
    local tz_output tz_exit_code=0
    tz_output="$("$TZ_TOOL" list templates 2>&1)" || tz_exit_code=$?
    if [ "$tz_exit_code" -ne 0 ]; then
        echo "Error: 'tz list templates' failed (exit $tz_exit_code)." >&2
        echo "  tz output: $tz_output" >&2
        return 1
    fi

    # List all templates (both web_app and dotnet_app) under the tv-samsung-* profile
    echo "$tz_output" | awk -v profile="$tv_profile" '
        /^[^[:space:]].+:[[:space:]]*$/ { p=$0; sub(/:[[:space:]]*$/,"",p); cur=(p==profile); next }
        cur && /^[[:space:]]+[^[:space:]]/ {
            if (match($0, /\[[a-z_]+\]/)) {
                token = substr($0, RSTART+1, RLENGTH-2)
                if (token=="web_app" || token=="dotnet_app") print $1
            }
        }
    ' | sort -u
}

get_templates_for_type() {
    local token; token="$(type_token "$1")"

    # TV type uses a separate function that queries tv-samsung-* profiles
    if [ "$1" = "tv" ]; then
        get_tv_templates
        return
    fi

    # (Custom templates were synced once by main() — this function runs in a
    # $(...) subshell, where a sync failure could not be reported back.)

    # Ask tz for the real, creatable templates and keep only those under the
    # detected $TZ_PROFILE with a matching type token. Listing anything else would
    # let a user pick a template `tz new -p $TZ_PROFILE` cannot actually create.
    #
    # Capture both stdout and stderr so we can detect 'tz list templates' failures.
    # The previous version used 2>/dev/null which silently swallowed errors, causing
    # an empty template list that downstream code interpreted as "SDK not installed".
    # `|| rc=$?`, never a bare `rc=$?` after the assignment: under `set -e` a
    # failing command substitution aborts the script before the error branch,
    # which made everything below unreachable dead code.
    local tz_output tz_exit_code=0
    tz_output="$("$TZ_TOOL" list templates 2>&1)" || tz_exit_code=$?
    if [ "$tz_exit_code" -ne 0 ]; then
        echo "Error: 'tz list templates' failed (exit $tz_exit_code)." >&2
        echo "  tz output: $tz_output" >&2
        echo "  Possible causes:" >&2
        echo "    - Tizen SDK is not installed or tz tool is missing" >&2
        echo "    - SDK installation is incomplete or corrupted" >&2
        echo "    - TIZEN_STUDIO_PATH is incorrect: $TIZEN_STUDIO_PATH" >&2
        echo "  Run: tizen-cli tizen-sdk sdk-install" >&2
        exit 1
    fi

    echo "$tz_output" | awk -v profile="$TZ_PROFILE" -v t="$token" '
        /^[^[:space:]].+:[[:space:]]*$/ { p=$0; sub(/:[[:space:]]*$/,"",p); cur=(p==profile); next }
        cur && /^[[:space:]]+[^[:space:]]/ {
            if (match($0, /\[[a-z_]+\]/) && substr($0, RSTART+1, RLENGTH-2)==t) print $1
        }
    ' | sort -u
}


select_template() {
    local project_type="$1"
    local templates=()

    while IFS= read -r line; do
        templates+=("$line")
    done < <(get_templates_for_type "$project_type")

    if [ ${#templates[@]} -eq 0 ]; then
        echo "No templates found" >&2
        return 1
    fi

    # Menu text goes to stderr; stdout carries only the chosen template name,
    # because the caller captures it with $(...).
    {
        echo ""
        echo "Available templates:"
        echo ""

        for i in "${!templates[@]}"; do
            echo "  $((i + 1)). ${templates[$i]}"
        done

        echo ""
    } >&2

    while true; do
        selection=$(ask_question "Select a template (1-${#templates[@]}): ")
        if [ "$selection" -ge 1 ] && [ "$selection" -le ${#templates[@]} ] 2>/dev/null; then
            echo "${templates[$((selection - 1))]}"
            return 0
        fi
        echo "Invalid selection. Please try again." >&2
    done
}

get_default_apps_directory() {
    # Priority 1: WORKSPACE_FOLDER env var (set by VSCode / Cline extension)
    if [ -n "${WORKSPACE_FOLDER:-}" ] && [ -d "$WORKSPACE_FOLDER" ]; then
        echo "$WORKSPACE_FOLDER"
        return 0
    fi
    # Priority 2: Current working directory if it differs from HOME (open folder in IDE)
    local cwd
    cwd="$(pwd 2>/dev/null || echo "")"
    if [ -n "$cwd" ] && [ "$cwd" != "$HOME" ] && [ "$cwd" != "/" ] && [ -w "$cwd" ]; then
        echo "$cwd"
        return 0
    fi
    # Priority 3: ~/tizen-apps (fallback)
    local appsDir="${HOME}/tizen-apps"
    [ ! -d "$appsDir" ] && mkdir -p "$appsDir"
    echo "$appsDir"
}

get_project_name() {
    # Heading goes to stderr; stdout carries only the entered name,
    # because the caller captures it with $(...).
    {
        echo ""
        echo "Project Details"
        echo ""
    } >&2
    local name=$(ask_question "Project name: ")
    if [ -z "$name" ]; then
        echo "Project name cannot be empty" >&2
        return 1
    fi
    validate_project_name "$name" || return 1
    echo "$name"
}

# Create a platform sample project by copying the template directory.
# Platform samples are NOT tz new templates — they are complete source trees
# built with GBS. We simply copy the directory to the target path.
create_platform_project() {
    local template="$1"
    local project_name="$2"
    local project_path="$3"

    local src_path="${LOCAL_TEMPLATES_PATH}/platform/${template}"
    if [ ! -d "$src_path" ]; then
        echo "Error: platform sample '$template' not found at $src_path" >&2
        echo "Available: $(discover_platform_samples | paste -sd ',' -)" >&2
        exit 1
    fi

    local actual_project_path="${project_path}/${project_name}"

    echo ""
    echo "Creating platform sample project: $project_name"
    echo "  Template: $template"
    echo "  Path: $actual_project_path"
    echo ""

    [ ! -d "$project_path" ] && mkdir -p "$project_path"

    cp -r "$src_path" "$actual_project_path"

    if [ ! -d "$actual_project_path" ]; then
        echo ""
        echo "Failed to create project at $actual_project_path" >&2
        return 1
    fi

    # ── Substitute the template app name with the user-provided project name ──
    # The dali-demo template has "dali-demo" hardcoded in CMakeLists.txt and
    # the .spec file. Replace all occurrences so the generated project uses the
    # user's chosen name for the binary, RPM package, and CMake targets.
    local template_name="dali-demo"

    if [ "$project_name" != "$template_name" ]; then
        echo "Customizing project name: $template_name → $project_name"

        # 1. Replace in CMakeLists.txt
        local cmake_file="${actual_project_path}/CMakeLists.txt"
        if [ -f "$cmake_file" ]; then
            sed -i "s/${template_name}/${project_name}/g" "$cmake_file"
            echo "  Updated: CMakeLists.txt"
        fi

        # 2. Replace in the .spec file and rename it
        local spec_dir="${actual_project_path}/packaging"
        local old_spec="${spec_dir}/${template_name}.spec"
        local new_spec="${spec_dir}/${project_name}.spec"
        if [ -f "$old_spec" ]; then
            sed -i "s/${template_name}/${project_name}/g" "$old_spec"
            mv "$old_spec" "$new_spec"
            echo "  Updated: packaging/${project_name}.spec (renamed from ${template_name}.spec)"
        fi

        # 3. Replace in any other text files that reference the template name
        #    (skip binary files, only process .txt, .cmake, .yaml, .json, .md)
        while IFS= read -r -d '' f; do
            case "$f" in
                *.txt|*.cmake|*.yaml|*.json|*.md|*.spec)
                    # Skip files already processed above
                    [ "$f" = "$cmake_file" ] && continue
                    [ "$f" = "$new_spec" ] && continue
                    sed -i "s/${template_name}/${project_name}/g" "$f" 2>/dev/null || true
                    ;;
            esac
        done < <(find "$actual_project_path" -type f -print0 2>/dev/null)
    fi

    echo ""
    echo "Project created successfully!"
    echo "  Location: $actual_project_path"
    echo "  App name: $project_name"
    echo ""
    echo "Next steps:"
    echo "  - This is a platform sample — build with GBS (not tz build):"
    echo "    cd \"$actual_project_path\" && gbs build -A armv7l"
    echo "  - Install: use the tizen-install-app skill after GBS build produces an RPM"
    return 0

}

create_tizen_project() {
    local project_type="$1"

    local template="$2"
    local project_name="$3"
    local project_path="$4"

    local tz_type
    case "$project_type" in
        native) tz_type="native" ;;
        dotnet) tz_type="dotnet" ;;
        webapp) tz_type="web" ;;
        rpk)    tz_type="rpk" ;;
        tv)
            # TV templates can be either web_app or dotnet_app.
            # Determine the actual type by checking the template name against the tz list.
            local tv_tz_output tv_profile
            tv_profile=$(detect_tv_profile) || {
                echo "Error: No TV SDK (tv-samsung-*) profile found. Install TV SDK extension first." >&2
                exit 1
            }
            tv_tz_output="$("$TZ_TOOL" list templates 2>&1)"
            # Check if template appears as [dotnet_app] under the tv profile
            if echo "$tv_tz_output" | awk -v profile="$tv_profile" -v tmpl="$template" '
                /^[^[:space:]].+:[[:space:]]*$/ { p=$0; sub(/:[[:space:]]*$/,"",p); cur=(p==profile); next }
                cur && $1==tmpl && /\[dotnet_app\]/ { found=1 }
                END { exit !found }
            '; then
                tz_type="dotnet"
            else
                tz_type="web"
            fi
            ;;
    esac

    local tz_profile="$TZ_PROFILE"
    # For TV projects, use the tv-samsung-* profile
    if [ "$project_type" = "tv" ]; then
        tz_profile=$(detect_tv_profile) || {
            echo "Error: No TV SDK (tv-samsung-*) profile found." >&2
            exit 1
        }
    fi


    echo ""
    echo "Creating $project_type project: $project_name"
    echo "  Template: $template"
    echo "  Profile: $tz_profile"
    echo "  Path: $project_path"
    echo ""

    # When --path is passed, it's the PARENT folder where the app folder will be created.
    # tz new creates: <path>/<project_name>/
    # So if user opened /path/to/MyApp/, we need:
    #   --path /path/to  --name MyApp  (NOT --path /path/to/MyApp)
    local ws_dir="$project_path"
    [ ! -d "$ws_dir" ] && mkdir -p "$ws_dir"

    export TIZEN_STUDIO_DIR="$TIZEN_STUDIO_PATH"
    export TIZEN_STUDIO="$TIZEN_STUDIO_PATH"

    echo "Creating project..."
    echo ""

    # tz new creates the complete standalone RPK layout, including
    # tizen_resource_project.yaml and res/. The Tizen IDE `resource-project`
    # command creates an incompatible layout for this SDK installation.
    # tz new -w expects the PARENT workspace, creates <workspace>/<name>/ inside.
    "$TZ_TOOL" new -n "$project_name" -t "$template" -T "$tz_type" -p "$tz_profile" -w "$ws_dir"

    # Compute actual project location: <ParentPath>/<ProjectName>/
    local actual_project_path="${project_path}/${project_name}"

    if [ -d "$actual_project_path" ]; then
        echo ""
        echo "Project created successfully!"
        echo "  Location: $actual_project_path"
        echo ""

        # Create and open VS Code workspace file
        # This registers the project in the Explorer and sets primary working directory automatically
        local workspace_file="${actual_project_path}/${project_name}.code-workspace"
        cat > "$workspace_file" << EOF
{
  "folders": [
    {
      "path": "."
    }
  ],
  "settings": {}
}
EOF

        # Open the workspace only on explicit request (--open). Default is
        # create-only: launching `code` here switches the user's VS Code
        # window to a new workspace, which most callers don't want.
        if [ "$OPEN_CODE" = true ]; then
            echo "Opening project in VS Code..."
            echo ""

            # Open the workspace file (registers in current window, updates primary working directory automatically)
            local code_opened=false
            if command -v code &> /dev/null; then
                if code "$workspace_file" 2>/dev/null; then
                    code_opened=true
                    echo "Project registered in VS Code Explorer"
                    echo "  Workspace: $workspace_file"
                    echo "  Primary working directory: $actual_project_path"
                fi
            fi

            if [ "$code_opened" = false ]; then
                echo "Could not open workspace file with code command"
                echo ""
                echo "Manual steps to register project in VS Code:"
                echo "  1. In VS Code: File -> Open Workspace from File"
                echo "  2. Select: $workspace_file"
                echo "  3. Click 'Open'"
                echo "  4. Project will appear in Explorer, primary working directory updates automatically"
            fi
        else
            echo "Workspace file created (not opened): $workspace_file"
            echo "  To open it: code \"$workspace_file\"  (or pass --open at creation time)"
        fi

        echo ""
        echo "Next steps:"
        echo "  - Build:   use the tizen-build-project skill (runs tz build + tz pack with -w)"
        echo "             manual: tz build -b Debug -w \"$actual_project_path\"  then  tz pack -w \"$actual_project_path\""
        echo "  - Install: use the tizen-install-app skill (handles device + absolute path)"
        echo "             manual: tz install -e <device-serial> -p <absolute-package-path>"
        return 0
    else
        echo ""
        echo "Failed to create project at $actual_project_path" >&2
        return 1
    fi
}

# Main
main() {
    # Non-interactive options (for agents): --type/--template/--name/--path, --list-templates
    # OPEN_CODE is read by create_tizen_project via bash dynamic scoping.
    local OPT_TYPE="" OPT_TEMPLATE="" OPT_NAME="" OPT_PATH="" LIST_ONLY=false OPEN_CODE=false
    # Accept BOTH "--opt value" and "--opt=value". The Node CLI runner passes the
    # equals form (e.g. --type=webapp); handling only the space form left every
    # option empty, which dropped the run into the interactive menu and — with no
    # TTY — spin forever on EOF reads.
    while [ $# -gt 0 ]; do
        case "$1" in
            --type=*)         OPT_TYPE="${1#*=}"; shift ;;
            --type)           OPT_TYPE="${2:-}"; shift 2 ;;
            --template=*)     OPT_TEMPLATE="${1#*=}"; shift ;;
            --template)       OPT_TEMPLATE="${2:-}"; shift 2 ;;
            --name=*)         OPT_NAME="${1#*=}"; shift ;;
            --name)           OPT_NAME="${2:-}"; shift 2 ;;
            --path=*)         OPT_PATH="${1#*=}"; shift ;;
            --path)           OPT_PATH="${2:-}"; shift 2 ;;
            --list-templates) LIST_ONLY=true; shift ;;
            --open)           OPEN_CODE=true; shift ;;
            *)                shift ;;
        esac
    done

    if [ ! -f "$TZ_TOOL" ]; then
        echo "Error: tz tool not found at $TZ_TOOL" >&2
        echo "  Resolved SDK path: $TIZEN_STUDIO_PATH" >&2
        echo "  Checked, in order: ~/.tizen.sdk.path.config (tizen-sdk-init), TIZEN_SDK_PATH, ~/tizen-sdk, /opt/tizen-sdk" >&2
        echo "  Fix: run tizen-sdk-init with the SDK path, or tizen-sdk-install if the SDK is not installed." >&2
        exit 1
    fi

    TZ_PROFILE="$(detect_tz_profile)"
    echo "[INFO] Using profile: $TZ_PROFILE" >&2

    # Sync the plugin's custom templates into the SDK ONCE, here in the main
    # shell. get_templates_for_type is always called through $(...), and a
    # subshell cannot hand SYNC_FAILURE_REASON back to report_empty_type.
    sync_custom_templates

    # Validate --name early: the name is later spliced into sed replacements
    # and filesystem paths, so reject unsafe characters up front.
    if [ -n "$OPT_NAME" ]; then
        validate_project_name "$OPT_NAME" || exit 1
    fi

    # Non-interactive: list templates (for agents — avoids guessing tz subcommands).
    # Honour --type to list a single type, so callers get exactly the templates
    # they asked for instead of all three sections.
    if [ "$LIST_ONLY" = true ]; then
        print_profile_info
        if [ -n "$OPT_TYPE" ]; then
            case "$OPT_TYPE" in
                native|dotnet|webapp|rpk)
                    echo "${OPT_TYPE}:"
                    local typed_list
                    typed_list="$(get_templates_for_type "$OPT_TYPE")"
                    if [ -n "$typed_list" ]; then
                        echo "$typed_list" | sed 's/^/  /'
                    else
                        report_empty_type "$OPT_TYPE"
                    fi
                    ;;
                tv)
                    echo "tv:"
                    get_tv_templates | sed 's/^/  /'
                    ;;
                platform)
                    echo "platform:"
                    discover_platform_samples | sed 's/^/  /'
                    ;;
                *) echo "Error: invalid --type '$OPT_TYPE' (use: native, dotnet, webapp, rpk, tv, platform)" >&2; exit 1 ;;
            esac
        else
            for t in native dotnet webapp rpk; do
                echo "${t}:"
                get_templates_for_type "$t" | sed 's/^/  /'
            done
            # Include TV templates if TV SDK extension is installed
            local tv_profile
            if tv_profile=$(detect_tv_profile); then
                echo "tv:"
                get_tv_templates | sed 's/^/  /'
            fi
            # Always include platform samples (GBS-buildable sample apps)
            echo "platform:"
            discover_platform_samples | sed 's/^/  /'
        fi
        exit 0
    fi




    # Non-interactive: create directly when --type/--template/--name are all provided.
    if [ -n "$OPT_TYPE" ] && [ -n "$OPT_TEMPLATE" ] && [ -n "$OPT_NAME" ]; then
        local proj_path
        if [ -n "$OPT_PATH" ]; then
            proj_path="$OPT_PATH"
        else
            proj_path="$(get_default_apps_directory)"
        fi

        case "$OPT_TYPE" in
            native|dotnet|webapp|rpk)
                if ! get_templates_for_type "$OPT_TYPE" | grep -qx "$OPT_TEMPLATE"; then
                    echo "Error: template '$OPT_TEMPLATE' not found for type '$OPT_TYPE'. Available: $(get_templates_for_type "$OPT_TYPE" | paste -sd ',' -)" >&2
                    exit 1
                fi
                create_tizen_project "$OPT_TYPE" "$OPT_TEMPLATE" "$OPT_NAME" "$proj_path"
                exit $?
                ;;
            tv)
                if ! get_tv_templates | grep -qx "$OPT_TEMPLATE"; then
                    echo "Error: template '$OPT_TEMPLATE' not found for TV. Available: $(get_tv_templates | paste -sd ',' -)" >&2
                    exit 1
                fi
                create_tizen_project "$OPT_TYPE" "$OPT_TEMPLATE" "$OPT_NAME" "$proj_path"
                exit $?
                ;;
            platform)
                if ! discover_platform_samples | grep -qx "$OPT_TEMPLATE"; then
                    echo "Error: platform sample '$OPT_TEMPLATE' not found. Available: $(discover_platform_samples | paste -sd ',' -)" >&2
                    exit 1
                fi
                create_platform_project "$OPT_TEMPLATE" "$OPT_NAME" "$proj_path"
                exit $?
                ;;
            *)
                echo "Error: invalid --type '$OPT_TYPE' (use: native, dotnet, webapp, rpk, tv, platform)" >&2; exit 1
                ;;
        esac

    fi


    # Reaching here means type/template/name were not all provided, so we need
    # interactive prompts. With no TTY (agent / Node CLI invocation) `read`
    # returns EOF instantly and the selection loops would spin forever — fail
    # fast with guidance instead of hanging.
    if [ ! -t 0 ]; then
        echo "Error: --type, --template and --name are required for non-interactive use, and no TTY is available for prompts." >&2
        echo "Run: create-project-app.sh --type <native|dotnet|webapp|rpk> --template <name> --name <appName> [--path <dir>] [--open]" >&2
        exit 1
    fi

    echo "Discovering templates..."
    local templates_info=$(discover_templates)
    IFS=':' read -r _ native_count _ dotnet_count _ webapp_count _ rpk_count <<< "$templates_info"

    echo "Found: Native=$native_count DotNET=$dotnet_count WebApp=$webapp_count RPK=$rpk_count"
    echo ""

    local project_type
    project_type=$(select_project_type)

    # `if ! var=$(...)` keeps set -e from aborting on a non-zero return, so the
    # cancel/no-templates handling below actually runs.
    local template
    if ! template=$(select_template "$project_type") || [ -z "$template" ]; then
        echo "Operation cancelled"
        exit 0
    fi

    local project_name
    if ! project_name=$(get_project_name) || [ -z "$project_name" ]; then
        exit 1
    fi

    local default_apps_dir
    default_apps_dir=$(get_default_apps_directory)
    local project_path="${default_apps_dir}/${project_name}"

    # Show which directory was selected and why
    local dir_reason
    if [ -n "${WORKSPACE_FOLDER:-}" ] && [ -d "$WORKSPACE_FOLDER" ] && [ "$default_apps_dir" = "$WORKSPACE_FOLDER" ]; then
        dir_reason="(open workspace folder)"
    elif [ "$default_apps_dir" != "${HOME}/tizen-apps" ]; then
        dir_reason="(current open folder)"
    else
        dir_reason="(default: no open folder detected)"
    fi

    echo ""
    echo "Confirm:"
    echo "  Type: $project_type"
    echo "  Template: $template"
    echo "  Name: $project_name"
    echo "  Path: $project_path  $dir_reason"
    echo ""

    local confirm=$(ask_question "Create project? (yes/no): ")
    if [[ ! "$confirm" =~ ^(yes|y)$ ]]; then
        echo "Cancelled"
        exit 0
    fi

    create_tizen_project "$project_type" "$template" "$project_name" "$project_path"
    exit $?
}

main "$@"
