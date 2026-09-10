#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


# Tizen project build script for Linux/macOS/WSL2
# Builds a Tizen project (Native, DotNET, or WebApp) and packages it

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

PROJECT_PATH=""
BUILD_TYPE="Debug"
SIGN_PROFILE=""
ARCH="x86_64"
CLEAN="false"

HELP_TEXT=""

# ============================================================================
# Parsing Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        -w|--proj-dir|--project)
            PROJECT_PATH="$2"
            shift 2
            ;;
        -b|--build-type)
            BUILD_TYPE="$2"
            shift 2
            ;;
        -s|--sign-profile)
            SIGN_PROFILE="$2"
            shift 2
            ;;
        -A|--arch)
            ARCH="$2"
            shift 2
            ;;
        --arch=*)
            ARCH="${1#*=}"
            shift
            ;;
        -c|--clean)
            CLEAN="true"
            shift
            ;;
        -h|--help)
            HELP_TEXT=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done


if [[ "$HELP_TEXT" == "true" ]]; then
    cat << 'EOF'
Usage: tizen-build-project.sh [options]

Options:
  -w, --proj-dir <path>     Project directory (required)
  -b, --build-type <type>   Build type: Debug (default), Release, Test
  -s, --sign-profile <name> Signing profile name (optional)
  -c, --clean               Remove previous build output before building
                            (forces a full, non-incremental rebuild)
  -h, --help                Show this help message

Examples:
  # Build in Debug mode (default)
  ./tizen-build-project.sh -w /path/to/project

  # Build in Release mode
  ./tizen-build-project.sh -w /path/to/project -b Release

  # Build with custom signing profile
  ./tizen-build-project.sh -w /path/to/project -s my-profile

  # Force a full clean rebuild
  ./tizen-build-project.sh -w /path/to/project --clean
EOF
    exit 0
fi

if [[ -z "$PROJECT_PATH" ]]; then
    echo "Error: Project directory is required (-w/--proj-dir)" >&2
    exit 1
fi

# Validate build type
if [[ ! "$BUILD_TYPE" =~ ^(Debug|Release|Test)$ ]]; then
    echo "Error: Invalid build type '$BUILD_TYPE'. Must be Debug, Release, or Test" >&2
    exit 1
fi

# ============================================================================
# Utility Functions
# ============================================================================

has_project_config() {
    local path="$1"
    # Standard Tizen SDK project types
    [[ -f "$path/tizen_native_project.yaml" || -f "$path/tizen_dotnet_project.yaml" || -f "$path/tizen_resource_project.yaml" || -f "$path/config.xml" || ( -f "$path/tizen-manifest.xml" && -f "$path/CMakeLists.txt" ) ]] && return 0
    # GBS platform project: CMakeLists.txt + packaging/*.spec (no .project/.tproject)
    [[ -f "$path/CMakeLists.txt" && -d "$path/packaging" && -n "$(ls "$path/packaging/"*.spec 2>/dev/null)" ]] && return 0
    return 1
}


verify_project_path() {
    local path="$1"

    if [[ ! -d "$path" ]]; then
        log_error "Project directory not found: $path"
        return 1
    fi

    if ! has_project_config "$path"; then
        # .NET Tizen templates commonly scaffold Solution/ProjectName/ — the manifest lives
        # one level below the solution folder a user is likely to point at. Auto-descend
        # into it if exactly one immediate subdirectory has a config file.
        local candidates=()
        local d
        for d in "$path"/*/; do
            [[ -d "$d" ]] || continue
            has_project_config "$d" && candidates+=("${d%/}")
        done

        if [[ ${#candidates[@]} -eq 1 ]]; then
            log_info "No project config directly in '$path' — using nested project folder: ${candidates[0]}"
            path="${candidates[0]}"
        elif [[ ${#candidates[@]} -gt 1 ]]; then
            log_error "Project configuration not found in '$path', and multiple nested project folders were found (${candidates[*]}). Pass the exact project folder."
            return 1
        else
            log_error "Project configuration not found. Not a valid Tizen project."
            return 1
        fi
    fi

    to_absolute_path "$path"
}

detect_project_type() {
    local path="$1"

    if [[ -f "$path/tizen_resource_project.yaml" ]]; then
        echo "RPK"
    elif [[ -f "$path/tizen_dotnet_project.yaml" ]] || [[ -n "$(ls "$path"/*.csproj 2>/dev/null)" ]]; then
        echo "DotNET"
    elif [[ -f "$path/tizen_native_project.yaml" ]] || [[ -f "$path/project_def.prop" ]]; then
        echo "Native"
    elif [[ -f "$path/config.xml" ]] || [[ -f "$path/index.html" ]]; then
        echo "WebApp"
    elif [[ -f "$path/tizen-manifest.xml" ]] && [[ -f "$path/CMakeLists.txt" ]]; then
        echo "Platform"
    elif [[ -f "$path/CMakeLists.txt" ]] && [[ -d "$path/packaging" ]] && [[ -n "$(ls "$path/packaging/"*.spec 2>/dev/null)" ]]; then
        # GBS platform project: CMakeLists.txt + packaging/*.spec (no .project/.tproject)
        echo "Platform"
    else
        echo "Unknown"
    fi
}


# Remove previous build output so the next build is a full rebuild.
# Incremental state for tz builds lives in the per-build-type output dirs
# (Debug/, Release/, Test/); .NET builds also keep intermediates in bin/ and obj/.
# Only fixed, well-known directory names inside the verified project dir are
# removed — never anything derived from user input.
clean_build_outputs() {
    local project_path="$1"
    local project_type="$2"

    log_section "Cleaning previous build output (--clean)"

    local dirs=("Debug" "Release" "Test" ".buildResult")
    if [[ "$project_type" == "DotNET" ]]; then
        dirs+=("bin" "obj")
    fi

    local removed=0
    local failed=()
    local d
    for d in "${dirs[@]}"; do
        if [[ -d "$project_path/$d" || -L "$project_path/$d" ]]; then
            # rm -rf unlinks a symlink without traversing it; tolerate rm
            # errors here (|| true) and verify the result explicitly below.
            rm -rf "$project_path/$d" 2>/dev/null || true
            if [[ -e "$project_path/$d" ]]; then
                failed+=("$project_path/$d")
            else
                log_info "Removed: $project_path/$d"
                removed=$((removed + 1))
            fi
        fi
    done

    # A locked/undeletable file leaves the directory partially populated;
    # continuing would produce an incremental build the caller believes was
    # clean — the exact silent wrong answer --clean exists to prevent.
    if [[ ${#failed[@]} -gt 0 ]]; then
        log_error "Clean failed — could not fully remove: ${failed[*]}"
        log_error "A file inside is likely locked by a running process. Close it and re-run."
        log_error "Aborting the build: continuing after a partial clean would silently produce an incremental (non-clean) build."
        exit 5
    fi

    if [[ $removed -eq 0 ]]; then
        log_info "No previous build output found — nothing to clean"
    else
        log_ok "Cleaned $removed build output director$([[ $removed -eq 1 ]] && echo "y" || echo "ies")"
    fi
}

# Resolve the GBS executable using a 3-level fallback:
#   1. tizen-cli plugin providing GBS
#   2. system-installed gbs on PATH
#   3. neither — print install guidance and return 1
#
# Echoes the gbs command string on success; returns 1 on failure (with guidance
# already printed to stderr).
resolve_gbs() {
    # 1) Check tizen-cli plugin for GBS
    local tizen_cli_gbs=""
    if command -v tizen-cli >/dev/null 2>&1; then
        # Check if a gbs-related plugin is installed
        local plugin_list
        plugin_list=$(tizen-cli plugin list 2>/dev/null || true)
        if echo "$plugin_list" | grep -qi "gbs"; then
            tizen_cli_gbs="tizen-cli gbs"
            log_info "Using GBS from tizen-cli plugin"
            echo "$tizen_cli_gbs"
            return 0
        fi
    fi

    # 2) Check system-installed gbs
    if command -v gbs >/dev/null 2>&1; then
        local sys_gbs
        sys_gbs=$(command -v gbs)
        log_info "Using system-installed GBS: $sys_gbs"
        echo "gbs"
        return 0
    fi

    # 3) Neither found — print install guidance
    log_error "GBS is not available. GBS is required to build platform (GBS-buildable) projects."
    echo "" >&2
    echo "To install GBS:" >&2
    echo "  Ubuntu/Debian:" >&2
    echo "    sudo apt-get install gbs" >&2
    echo "" >&2
    echo "  Or install via Tizen SDK tools:" >&2
    echo "    See: https://docs.tizen.org/application/tizen-studio/setup/install-sdk/" >&2
    echo "" >&2
    echo "  Or check if a tizen-cli GBS plugin is available:" >&2
    echo "    tizen-cli plugin list" >&2
    return 1
}

# Tizen 9.0 dali2 headers use std::string_view / std::any, so a DALi project that
# does not select C++17 fails deep inside /usr/include/dali* — after a multi-minute
# GBS run, and with a diagnostic that names a system header rather than the missing
# CMakeLists line. Catch it before the build starts.
#
# rpm optflags cannot substitute for the CMake setting: the spec's %build calls plain
# `cmake` without exporting CXXFLAGS, so `gbs build --define "optflags -std=c++17"`
# never reaches the compiler.
#
# Returns 0 when the project is fine (or is not a DALi project), 1 when C++17 is missing.
check_dali_cxx_standard() {
    local project_path="$1"
    local cmakelists="$project_path/CMakeLists.txt"

    [[ -f "$cmakelists" ]] || return 0

    # Every file that could carry the standard: the top-level CMakeLists, any
    # included .cmake module, and the rpm spec (which may pass -DCMAKE_CXX_STANDARD).
    local build_files=("$cmakelists")
    local f
    while IFS= read -r f; do
        [[ -n "$f" ]] && build_files+=("$f")
    done < <(find "$project_path" -maxdepth 3 \( -name '*.cmake' -o -name '*.spec' \) -type f 2>/dev/null)

    # Only DALi projects are affected.
    grep -qiE 'dali2?-(core|adaptor|toolkit)' "${build_files[@]}" 2>/dev/null || return 0

    # Any of these selects C++17 or newer, whichever way the author spelled it.
    local cxx17_markers='CMAKE_CXX_STANDARD[^0-9]*(17|20|23|26)|cxx_std_(17|20|23|26)|-std=(gnu|c)\+\+(17|1z|20|2a|23|2b|26)'
    grep -qiE "$cxx17_markers" "${build_files[@]}" 2>/dev/null && return 0

    log_error "DALi project does not select C++17 — the GBS build would fail inside the dali2 headers."
    echo "" >&2
    echo "  Tizen 9.0 dali2 headers use std::string_view / std::any, so C++17 is mandatory." >&2
    echo "  No C++17 (or newer) setting was found in:" >&2
    for f in "${build_files[@]}"; do
        echo "    - $f" >&2
    done
    echo "" >&2
    echo "  Fix — add to CMakeLists.txt, before add_executable():" >&2
    echo "" >&2
    echo "    set(CMAKE_CXX_STANDARD 17)" >&2
    echo "    set(CMAKE_CXX_STANDARD_REQUIRED ON)" >&2
    echo "" >&2
    echo "  Do NOT try to inject the standard through rpm optflags:" >&2
    echo "" >&2
    echo "    gbs build --define \"optflags -std=c++17\"   # has no effect" >&2
    echo "" >&2
    echo "  The spec's %build runs plain 'cmake', which does not pick up rpm optflags," >&2
    echo "  and CMake composes its own -std flag from CMAKE_CXX_STANDARD regardless." >&2
    return 1
}

# Ensure the project directory is a git repository.
# GBS requires a git repo to build. If not a git repo, init + add + commit.
ensure_git_repo() {
    local project_path="$1"

    if [[ -d "$project_path/.git" ]]; then
        return 0
    fi

    log_info "Initializing git repository for GBS build..."
    local prev_dir
    prev_dir=$(pwd)
    cd "$project_path"

    git init >/dev/null 2>&1
    git add -A >/dev/null 2>&1
    git -c user.name="tizen-build" -c user.email="tizen@build.local" commit -m "initial" >/dev/null 2>&1

    cd "$prev_dir"
    log_ok "Git repository initialized"
}

# Build a platform (GBS-buildable) project.
# Uses GBS instead of tz build. The .tpk is produced in a GBS output directory.
build_platform_project() {
    local project_path="$1"
    local arch="$2"

    log_section "Building platform project with GBS"
    echo "Project: $project_path" >&2
    echo "Architecture: $arch" >&2

    # Preflight before anything expensive: a DALi project without C++17 is a
    # guaranteed failure several minutes into the GBS run.
    check_dali_cxx_standard "$project_path" || exit 4

    # Resolve GBS executable (3-level fallback)
    local gbs_cmd
    gbs_cmd=$(resolve_gbs) || exit 1

    # GBS requires a git repository
    ensure_git_repo "$project_path"

    # Run GBS build — must be executed from the project directory
    local gbs_extra_args=()
    if [[ "$CLEAN" == "true" ]]; then
        # gbs --clean rebuilds the build root from scratch (full rebuild)
        gbs_extra_args+=("--clean")
    fi

    echo "" >&2
    echo "Running: $gbs_cmd build -A $arch --include-all ${gbs_extra_args[*]} (in $project_path)" >&2
    echo "" >&2

    local prev_dir
    prev_dir=$(pwd)
    cd "$project_path"

    if $gbs_cmd build -A "$arch" --include-all ${gbs_extra_args[@]+"${gbs_extra_args[@]}"}; then
        cd "$prev_dir"
        log_ok "GBS build completed successfully"
        return 0
    else
        cd "$prev_dir"
        log_error "GBS build failed"
        return 1
    fi

}


# Find package produced by GBS build.
# GBS platform builds produce .rpm files (not .tpk).
# GBS typically outputs to ~/GBS-ROOT/local/repos/<arch>/RPMS/.
# Some platform projects may also produce .tpk — search for both.
# Uses a timestamp file created before the build to reliably detect
# newly generated artifacts (avoids issues with source files being
# newer than build output when templates are copied just before build).
find_gbs_package_file() {
    local project_path="$1"
    local timestamp_file="$2"
    local package=""

    # Search project directory for .tpk or .rpm
    package=$(find "$project_path" \( -name "*.tpk" -o -name "*.rpm" \) -newer "$timestamp_file" 2>/dev/null | head -n1)

    if [[ -z "$package" ]]; then
        local gbs_root="${HOME}/GBS-ROOT"
        if [[ -d "$gbs_root" ]]; then
            # Search for .rpm files (standard GBS output) or .tpk files
            package=$(find "$gbs_root" \( -name "*.rpm" -o -name "*.tpk" \) -newer "$timestamp_file" 2>/dev/null | head -n1)
        fi
    fi

    if [[ -n "$package" ]]; then
        echo "$package"
    fi
}

build_project() {

    local tz_path="$1"
    local project_path="$2"
    local build_type="$3"

    log_section "Building project"
    echo "Project: $project_path" >&2
    echo "Build type: $build_type" >&2

    local tz_build_args=("build" "-b" "$build_type" "-w" "$project_path")

    if [[ -n "$SIGN_PROFILE" ]]; then
        tz_build_args+=("-s" "$SIGN_PROFILE")
    fi

    if "$tz_path" "${tz_build_args[@]}"; then
        log_ok "Build completed successfully"
        return 0
    else
        log_error "Build failed"
        return 1
    fi
}

pack_project() {
    local tz_path="$1"
    local project_path="$2"

    log_section "Packaging project"

    local tz_pack_args=("pack" "-w" "$project_path")

    if [[ -n "$SIGN_PROFILE" ]]; then
        tz_pack_args+=("-s" "$SIGN_PROFILE")
    fi

    if "$tz_path" "${tz_pack_args[@]}"; then
        log_ok "Packaging completed successfully"
        return 0
    else
        log_error "Packaging failed"
        return 1
    fi
}

pack_rpk_project() {
    local project_path="$1"
    local sdk_path tizen_cli
    sdk_path=$(get_sdk_path)
    tizen_cli="$sdk_path/tools/ide/bin/tizen"
    [[ -f "$tizen_cli" ]] || tizen_cli="$sdk_path/tools/ide/bin/tizen.bat"
    if [[ ! -f "$tizen_cli" ]]; then
        log_error "Tizen CLI not found under $sdk_path/tools/ide/bin. Install the Tizen IDE tools required for RPK packaging."
        return 1
    fi

    log_section "Packaging standalone RPK project"
    if "$tizen_cli" package -t rpk -- "$project_path"; then
        log_ok "RPK package completed successfully"
        return 0
    fi
    log_error "RPK package failed"
    return 1
}

find_package_file() {
    local project_path="$1"
    local build_type="$2"
    local package=""

    # .tpk (Native/DotNET), .wgt (WebApp), and .rpk (Resource Package) are produced in the build-type
    # directory (e.g. Debug/ or Release/). WebApp's .wgt lands there too, not in root.
    package=$(find "$project_path/$build_type" \( -name "*.tpk" -o -name "*.wgt" -o -name "*.rpk" \) 2>/dev/null | head -n1)

    # Fallback: anywhere under the project (covers unusual layouts).
    if [[ -z "$package" ]]; then
        package=$(find "$project_path" \( -name "*.tpk" -o -name "*.wgt" -o -name "*.rpk" \) 2>/dev/null | head -n1)
    fi

    if [[ -n "$package" ]]; then
        echo "$package"
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

echo "Tizen Project Builder (Linux/macOS/WSL2)" >&2
echo "=========================================" >&2

# Verify project path
log_section "Verifying project directory"
PROJECT=$(verify_project_path "$PROJECT_PATH") || exit 1
log_ok "Project directory verified: $PROJECT"

# Detect project type
PROJECT_TYPE=$(detect_project_type "$PROJECT")
log_section "Detected project type: $PROJECT_TYPE"

if [[ "$PROJECT_TYPE" == "Unknown" ]]; then
    log_error "Could not detect project type"
    exit 1
fi

# DotNET builds shell out to `dotnet` (via tz). If it is not on PATH, stop early
# with an actionable pointer instead of tz's cryptic "executable file not found".
if [[ "$PROJECT_TYPE" == "DotNET" ]] && ! command -v dotnet >/dev/null 2>&1; then
    log_error "This is a DotNET project but 'dotnet' is not on PATH."
    found_dotnet="$(discover_dotnet)"
    if [[ -n "$found_dotnet" ]]; then
        log_warn "A .NET SDK is installed but not on PATH: $found_dotnet"
    fi
    log_error "Run the tizen-dotnet-setup skill first — it locates dotnet (or guides installing it) and the Tizen workload, then re-run this build."
    exit 3
fi

# Platform projects use GBS (not tz build + tz pack)
if [[ "$PROJECT_TYPE" == "Platform" ]]; then
    log_info "Platform project detected — using GBS build (not tz build)"

    # Create a timestamp file before build to reliably detect newly generated artifacts
    BUILD_TIMESTAMP_FILE=$(mktemp)

    # Build with GBS
    build_platform_project "$PROJECT" "$ARCH" || { rm -f "$BUILD_TIMESTAMP_FILE"; exit 1; }

    # Find and report package
    log_section "Locating generated package"
    PACKAGE_FILE=$(find_gbs_package_file "$PROJECT" "$BUILD_TIMESTAMP_FILE")
    rm -f "$BUILD_TIMESTAMP_FILE"

    if [[ -n "$PACKAGE_FILE" ]]; then
        log_ok "Package file generated: $PACKAGE_FILE"
        echo ""
        echo "📦 Build Summary:" >&2
        echo "  Project: $PROJECT" >&2
        echo "  Type: $PROJECT_TYPE (GBS)" >&2
        echo "  Architecture: $ARCH" >&2
        echo "  Package: $PACKAGE_FILE" >&2
        echo ""
        exit 0
    else
        log_error "Package file not found after GBS build"
        exit 1
    fi
fi

# Find tz tool (for Native/DotNET/WebApp)
log_section "Locating Tizen SDK tools"
TZ_TOOL=$(find_tizen_tool "tz") || exit 1
log_ok "Tizen SDK tools found: $TZ_TOOL"

# Clean previous build output first when a full rebuild was requested
if [[ "$CLEAN" == "true" ]]; then
    clean_build_outputs "$PROJECT" "$PROJECT_TYPE"
fi

if [[ "$PROJECT_TYPE" == "RPK" ]]; then
    pack_rpk_project "$PROJECT" || exit 1
else
    build_project "$TZ_TOOL" "$PROJECT" "$BUILD_TYPE" || exit 1
    pack_project "$TZ_TOOL" "$PROJECT" || exit 1
fi

# Find and report package
log_section "Locating generated package"
PACKAGE_FILE=$(find_package_file "$PROJECT" "$BUILD_TYPE")

if [[ -n "$PACKAGE_FILE" ]]; then
    log_ok "Package file generated: $PACKAGE_FILE"
    echo ""
    echo "📦 Build Summary:" >&2
    echo "  Project: $PROJECT" >&2
    echo "  Type: $PROJECT_TYPE" >&2
    echo "  Build Type: $BUILD_TYPE" >&2
    echo "  Package: $PACKAGE_FILE" >&2
    echo ""
    exit 0
else
    log_error "Package file not found after build"
    exit 1
fi
