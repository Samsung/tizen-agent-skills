#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


##############################################################################
# Test Template Discovery Script - Linux/Mac/WSL
# Discovers and displays available templates in Tizen SDK
##############################################################################

set -e

# Color definitions — enable colors only when terminal (stdout/stderr is TTY) and NO_COLOR is unset.
# In capture/pipe (Cline, Node runner, redirect), output plain text so escape codes like "[0;34m"
# don't break logs.
if { [ -t 1 ] || [ -t 2 ]; } && [ -z "${NO_COLOR:-}" ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  CYAN=''
  NC=''
fi

# Tizen Studio path auto-detection
TIZEN_SDK_PATH="${TIZEN_SDK_PATH:-$HOME/tizen-sdk}"

# WSL path conversion function
convert_to_wsl_path() {
    local windows_path="$1"
    # Convert Windows path to WSL path
    echo "$windows_path" | sed 's|\\|/|g' | sed 's|^C:|/mnt/c|'
}

# Tizen Studio path check
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    # Git Bash (Windows)
    TIZEN_SDK_PATH="C:\\Users\\$USERNAME\\tizen-sdk"
    TEMPLATES_PATH="$TIZEN_SDK_PATH\\tools\\tizen-core\\templates"
elif [[ "$OSTYPE" == "linux-gnu" ]] || [[ "$OSTYPE" == "darwin"* ]]; then
    # Linux or macOS
    TIZEN_SDK_PATH="${TIZEN_SDK_PATH:-$HOME/tizen-sdk}"
    TEMPLATES_PATH="$TIZEN_SDK_PATH/tools/tizen-core/templates"
fi

echo -e "${CYAN}=== Tizen Template Discovery ===${NC}"
echo ""
echo -e "${BLUE}Tizen SDK Path:${NC} $TIZEN_SDK_PATH"
echo ""

# Check if template path exists
if [ ! -d "$TEMPLATES_PATH" ]; then
    echo -e "${RED}✗ Template path not found:${NC} $TEMPLATES_PATH"
    exit 1
fi

echo -e "${GREEN}✓ Template path found${NC}"
echo ""

# Find Native templates
echo -e "${CYAN}=== Native Templates ===${NC}"
native_count=0
if [ -d "$TEMPLATES_PATH/native" ]; then
    while IFS= read -r -d '' dir; do
        basename "$dir"
        native_count=$((native_count+1))
    done < <(find "$TEMPLATES_PATH/native" -maxdepth 1 -type d -not -name "native" -print0)
fi

if [ $native_count -eq 0 ]; then
    echo "(No native templates found)" | sed "s/.*/$(echo -e ${YELLOW})&$(echo -e ${NC})/"
else
    echo -e "${YELLOW}Found: $native_count template(s)${NC}"
fi
echo ""

# Find DotNET templates
echo -e "${CYAN}=== DotNET Templates ===${NC}"
dotnet_count=0
if [ -d "$TEMPLATES_PATH/dotnet" ]; then
    while IFS= read -r -d '' dir; do
        basename "$dir"
        dotnet_count=$((dotnet_count+1))
    done < <(find "$TEMPLATES_PATH/dotnet" -maxdepth 1 -type d -not -name "dotnet" -print0)
fi

if [ $dotnet_count -eq 0 ]; then
    echo "(No dotnet templates found)" | sed "s/.*/$(echo -e ${YELLOW})&$(echo -e ${NC})/"
else
    echo -e "${YELLOW}Found: $dotnet_count template(s)${NC}"
fi
echo ""

# Find WebApp templates
echo -e "${CYAN}=== WebApp Templates ===${NC}"
webapp_count=0
if [ -d "$TEMPLATES_PATH/web" ]; then
    while IFS= read -r -d '' dir; do
        basename "$dir"
        webapp_count=$((webapp_count+1))
    done < <(find "$TEMPLATES_PATH/web" -maxdepth 1 -type d -not -name "web" -print0)
fi

if [ $webapp_count -eq 0 ]; then
    echo "(No web templates found)" | sed "s/.*/$(echo -e ${YELLOW})&$(echo -e ${NC})/"
else
    echo -e "${YELLOW}Found: $webapp_count template(s)${NC}"
fi
echo ""

# Summary
total=$((native_count + dotnet_count + webapp_count))
echo -e "${GREEN}✓ Template Discovery Complete${NC}"
echo ""
echo "Summary:"
echo "  Native:  $native_count"
echo "  DotNET:  $dotnet_count"
echo "  WebApp:  $webapp_count"
echo "  Total:   $total"
echo ""

if [ $total -eq 0 ]; then
    echo -e "${YELLOW}! No templates found. Please install Tizen SDK.${NC}"
    exit 1
fi

exit 0
