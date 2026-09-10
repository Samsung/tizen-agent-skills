#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


# Tizen app install script for Linux/macOS/WSL2
# Installs .tpk, .wgt, .rpk, or .rpm packages on connected Tizen device/emulator

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

APP_PACKAGE_PATH=""
DEVICE_SERIAL=""
RUN_AFTER_INSTALL=false
HELP_TEXT=""

# ============================================================================
# Parsing Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--package)
            APP_PACKAGE_PATH="$2"
            shift 2
            ;;
        -s|--serial)
            DEVICE_SERIAL="$2"
            shift 2
            ;;
        -r|--run)
            RUN_AFTER_INSTALL=true
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
Usage: tizen-install-app.sh [options]

Options:
  -p, --package <path>   Path to .tpk, .wgt, .rpk, or .rpm app package (required)
  -s, --serial <serial>  Device serial number (optional, auto-detect if not specified)
  -r, --run              Run the app after installation
  -h, --help             Show this help message

Examples:
  # Install app on auto-detected device
  ./tizen-install-app.sh -p ./myapp.tpk

  # Install on specific device and run
  ./tizen-install-app.sh -p ./myapp.tpk -s emulator-26101 -r

  # Install web app
  ./tizen-install-app.sh -p ./myapp.wgt

  # Install platform RPM app
  ./tizen-install-app.sh -p ./myapp-1.0.0-1.x86_64.rpm
EOF
    exit 0
fi

if [[ -z "$APP_PACKAGE_PATH" ]]; then
    echo "Error: App package path is required (-p/--package)" >&2
    exit 1
fi

# ============================================================================
# Utility Functions
# ============================================================================

verify_app_package() {
    local path="$1"

    if [[ ! -f "$path" ]]; then
        log_error "App package not found: $path"
        exit 1
    fi

    local extension="${path##*.}"
    if [[ "$extension" != "tpk" && "$extension" != "wgt" && "$extension" != "rpk" && "$extension" != "rpm" ]]; then
        log_error "Invalid app package. Must be .tpk, .wgt, .rpk, or .rpm, got: $extension"
        exit 1
    fi

    to_absolute_path "$path"
}

push_app_to_device() {
    local sdb_path="$1"
    local device_serial="$2"
    local app_package_path="$3"

    log_section "Pushing app package to device"

    local file_name=$(basename "$app_package_path")
    local device_path="/opt/usr/apps/$file_name"

    if "$sdb_path" -s "$device_serial" push "$app_package_path" "$device_path"; then
        log_ok "App package pushed to $device_path"
        return 0
    else
        log_error "Failed to push app package"
        return 1
    fi
}

install_app() {
    local tz_path="$1"
    local device_serial="$2"
    local app_package_path="$3"

    log_section "Installing app package"

    if "$tz_path" install -e "$device_serial" -p "$app_package_path"; then
        log_ok "App installed successfully on device: $device_serial"
        return 0
    else
        log_error "Installation failed"
        return 1
    fi
}

find_rpk_project_root() {
    local current
    current=$(dirname "$1")
    while [[ -n "$current" && "$current" != "/" ]]; do
        [[ -f "$current/tizen_resource_project.yaml" ]] && { echo "$current"; return 0; }
        current=$(dirname "$current")
    done
    [[ -f "/tizen_resource_project.yaml" ]] && echo "/"
}

install_rpk_project() {
    local sdb_path="$1"
    local device_serial="$2"
    local app_package_path="$3"
    log_section "Installing RPK package"
    # RPK is installed directly by sdb (4.2.16+); tz install accepts only tpk/wgt.
    # sdb can return 0 even when the device package manager rejects an RPK.
    # Inspect its protocol result as well as the transport exit status.
    local install_output install_status
    install_output=$("$sdb_path" -s "$device_serial" install "$app_package_path" 2>&1)
    install_status=$?
    printf '%s\n' "$install_output"
    if [ "$install_status" -eq 0 ] && ! grep -Eqi 'key\[end\][[:space:]]+val\[fail\]|processing result[[:space:]]*:[[:space:]]*.*\bfailed\b|Invalid certificate chain' <<< "$install_output"; then
        log_ok "RPK installed successfully on device: $device_serial"
        return 0
    fi
    log_error "RPK installation failed (sdb exit code: $install_status; the device package manager rejected the package)"
    return 1
}

cleanup_pushed_file() {
    local sdb_path="$1"
    local device_serial="$2"
    local app_package_path="$3"

    local file_name=$(basename "$app_package_path")
    local device_path="/opt/usr/apps/$file_name"

    # Remove the pushed package file from device to avoid permission issues
    "$sdb_path" -s "$device_serial" shell "rm -f '$device_path'" 2>/dev/null || true
}

# Install RPM package on device via sdb push + rpm -ivh
# RPM packages (platform apps) require root access and are installed via rpm tool
install_rpm_app() {
    local sdb_path="$1"
    local device_serial="$2"
    local app_package_path="$3"

    log_section "Pushing RPM package to device"

    local file_name=$(basename "$app_package_path")
    local device_path="/tmp/$file_name"

    if ! "$sdb_path" -s "$device_serial" push "$app_package_path" "$device_path"; then
        log_error "Failed to push RPM package"
        return 1
    fi
    log_ok "RPM package pushed to $device_path"

    log_section "Installing RPM package"

    # Try to gain root access (emulator only)
    "$sdb_path" -s "$device_serial" root on 2>/dev/null || true

    local install_output
    install_output=$("$sdb_path" -s "$device_serial" shell "rpm -ivh --force '$device_path'" 2>&1)
    echo "$install_output" >&2

    if echo "$install_output" | grep -qi "error\|failed"; then
        # Check if it's just "already installed" warning
        if echo "$install_output" | grep -qi "already installed"; then
            log_ok "RPM package already installed, updating..."
            install_output=$("$sdb_path" -s "$device_serial" shell "rpm -Uvh --force '$device_path'" 2>&1)
            echo "$install_output" >&2
            "$sdb_path" -s "$device_serial" shell "rm -f '$device_path'" 2>/dev/null || true
            if echo "$install_output" | grep -qi "error\|failed" && ! echo "$install_output" | grep -qi "already installed"; then
                log_error "RPM update failed"
                return 1
            fi
        else
            # Clean up pushed file
            "$sdb_path" -s "$device_serial" shell "rm -f '$device_path'" 2>/dev/null || true
            log_error "RPM installation failed"
            return 1
        fi
    else
        # Clean up pushed file (kept until now so the update retry above can reuse it)
        "$sdb_path" -s "$device_serial" shell "rm -f '$device_path'" 2>/dev/null || true
    fi

    log_ok "RPM package installed successfully on device: $device_serial"
    return 0
}

# Run RPM-installed platform app directly via sdb shell
# Platform apps are installed to /usr/bin/ and are NOT registered with app_launcher,
# so they must be launched by their binary name directly.
run_rpm_app() {
    local sdb_path="$1"
    local device_serial="$2"
    local app_binary_name="$3"

    log_section "Running platform app"

    # Verify the binary exists on device
    local check_output
    check_output=$("$sdb_path" -s "$device_serial" shell "ls /usr/bin/$app_binary_name" 2>&1)
    if echo "$check_output" | grep -qi "No such file"; then
        log_error "Binary not found on device: /usr/bin/$app_binary_name"
        return 1
    fi

    # Launch the app in background with Wayland + DBus environment variables
    # Platform apps need WAYLAND_DISPLAY and XDG_RUNTIME_DIR to connect to the display server
    # The app user (uid 5001) has the wayland socket at /run/user/5001/wayland-0
    # DBUS_SESSION_BUS_ADDRESS is needed for eldbus connections (Tizen policy, etc.)
    # setsid detaches the process so it survives after sdb shell exits
    # After 'sdb root on' (used for rpm install) the shell runs as root, but the
    # wayland socket / session bus at /run/user/5001 belong to user 'owner'
    # (uid 5001). A root-launched GUI process is rejected by the display/session
    # policy and exits immediately — so launch as owner via su when available.
    #
    # The Wayland socket /run/wayland-0 is owned by root:display (srwxrwxr-x).
    # The 'owner' user (uid 5001) is NOT in the 'display' group by default, so
    # it cannot connect to the display server. Add 'owner' to the 'display'
    # group before launching — this is idempotent and safe to run every time.
    "$sdb_path" -s "$device_serial" shell "usermod -aG display owner" 2>/dev/null || true

    # Write a launcher script to the device home directory using printf.
    # sdb shell kills the process group when it exits (SIGHUP + process group kill).
    # Running the launch command from a script file with trap '' HUP + nohup + setsid
    # ensures the app survives sdb shell termination. /tmp may be noexec, so use
    # /home/owner/ which is executable.
    # printf with \n is used because heredoc syntax doesn't survive sdb shell quoting.
    local launcher_script="/home/owner/.run-${app_binary_name}.sh"
    "$sdb_path" -s "$device_serial" shell "printf '#!/bin/sh\nexport WAYLAND_DISPLAY=wayland-0\nexport XDG_RUNTIME_DIR=/run/user/5001\nexport ELM_ENGINE=wayland_egl\nexport DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/5001/bus\ntrap \"\" HUP\nnohup setsid /usr/bin/${app_binary_name} < /dev/null > /tmp/${app_binary_name}.log 2>&1 &\necho PID=\$!\n' > '$launcher_script' && chmod 755 '$launcher_script' && chown owner:users '$launcher_script'" 2>/dev/null || true

    local has_su
    has_su=$("$sdb_path" -s "$device_serial" shell "command -v su" 2>/dev/null | tr -d '\r' || true)
    local launch_output
    if [[ -n "$has_su" ]]; then
        log_ok "Launching as user 'owner' (uid 5001)"
        launch_output=$("$sdb_path" -s "$device_serial" shell "su - owner -s /bin/sh '$launcher_script'" 2>&1)
    else
        log_warn "'su' not found on device — launching in current shell user context"
        launch_output=$("$sdb_path" -s "$device_serial" shell "$launcher_script" 2>&1)
    fi
    echo "$launch_output" >&2

    # Poll for the app process — a slow emulator can take a few seconds to start
    local attempt pid=""
    for attempt in 1 2 3 4 5; do
        sleep 1
        pid=$("$sdb_path" -s "$device_serial" shell "pgrep -f $app_binary_name" 2>/dev/null | tr -d '\r' | grep -v '^[[:space:]]*$' || true)
        [[ -n "$pid" ]] && break
    done
    # Same APP_RUNNING contract as run_app(): the pgrep poll IS the running
    # check for platform apps (they are not in app_launcher's list), so the
    # envelope must not report null ("not verifiable") here.
    if [[ -n "$pid" ]]; then
        log_ok "App launched successfully (PID: $pid)"
        echo "APP_RUNNING=yes"
        return 0
    fi

    echo "APP_RUNNING=no"
    log_error "App process not found after launch — check /tmp/$app_binary_name.log on device"

    # Surface the app log tail so the actual failure reason lands in the
    # envelope warnings (lines must contain error/fail/... to pass the
    # summarizeInstallOutput keep filter in project.js)
    local app_log
    app_log=$("$sdb_path" -s "$device_serial" shell "tail -n 20 /tmp/$app_binary_name.log 2>/dev/null" 2>/dev/null | tr -d '\r' || true)
    if [[ -n "$app_log" ]]; then
        local line
        while IFS= read -r line; do
            [[ -n "$line" ]] && echo "[ERROR] app-log: $line" >&2
        done <<< "$app_log"
        if echo "$app_log" | grep -qiE "wayland|failed to connect"; then
            echo "[ERROR] hint: display server connection failed — verify the app runs as user 'owner' (uid 5001) and WAYLAND_DISPLAY/XDG_RUNTIME_DIR are correct" >&2
        elif echo "$app_log" | grep -qi "error while loading shared libraries"; then
            echo "[ERROR] hint: missing runtime libraries on device — install the matching dali/dali-toolkit RPMs first" >&2
        fi
    else
        echo "[ERROR] app-log: /tmp/$app_binary_name.log is empty or missing — the process may have been killed before writing output" >&2
    fi
    return 1
}

# Generate a host-side rerun script for RPM platform apps.
# Platform apps have no app_launcher icon, so after the app is killed (e.g. back key)
# the user would have to re-run the full install-app command. This function creates
# a standalone script on the host that re-launches the already-installed binary
# without re-installing the RPM.
#
# The script is written to ~/bin/run-<app_name>.sh and an alias suggestion is printed.
generate_rerun_script() {
    local app_binary_name="$1"

    local host_bin_dir="$HOME/bin"
    local rerun_script="$host_bin_dir/run-${app_binary_name}.sh"

    mkdir -p "$host_bin_dir"

    cat > "$rerun_script" << RERUN_EOF
#!/usr/bin/env bash
# run-${app_binary_name}.sh — Re-launch ${app_binary_name} platform app without re-installing RPM
#
# Usage:
#   run-${app_binary_name}.sh [device-serial]
#
# To register as an alias (~/.bashrc):
#   alias run-${app_binary_name}='~/bin/run-${app_binary_name}.sh'
#
# Then simply:
#   run-${app_binary_name}
#
set -euo pipefail

APP_NAME="${app_binary_name}"
SDB_TOOL="\${SDB:-sdb}"

# -- Device detection ------------------------------------------------
if [[ \$# -ge 1 ]]; then
    SERIAL="\$1"
else
    DEVICES=(\$(\$SDB_TOOL devices | awk 'NR>1 && \$2=="device"{print \$1}'))
    if [[ \${#DEVICES[@]} -eq 0 ]]; then
        echo "ERROR: No connected device found."
        echo "       Start an emulator first: tizen-cli tizen-sdk device-manager"
        exit 1
    fi
    SERIAL="\${DEVICES[0]}"
fi
echo "Device: \$SERIAL"


# -- 1. Gain root access ---------------------------------------------
\$SDB_TOOL -s "\$SERIAL" root on 2>/dev/null || true

# -- 2. Add owner user to display group (Wayland socket access) ------
\$SDB_TOOL -s "\$SERIAL" shell "usermod -aG display owner" 2>/dev/null || true

# -- 3. Write launcher script on device ------------------------------
LAUNCHER="/home/owner/.run-\${APP_NAME}.sh"
\$SDB_TOOL -s "\$SERIAL" shell "printf '#!/bin/sh\nexport WAYLAND_DISPLAY=wayland-0\nexport XDG_RUNTIME_DIR=/run/user/5001\nexport ELM_ENGINE=wayland_egl\nexport DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/5001/bus\ntrap \"\" HUP\nnohup setsid /usr/bin/\${APP_NAME} < /dev/null > /tmp/\${APP_NAME}.log 2>&1 &\necho PID=\\\$!\n' > '\$LAUNCHER' && chmod 755 '\$LAUNCHER' && chown owner:users '\$LAUNCHER'" 2>/dev/null || true

# -- 4. Launch as owner user (uid 5001) ------------------------------
HAS_SU=\$(\$SDB_TOOL -s "\$SERIAL" shell "command -v su" 2>/dev/null | tr -d '\r' || true)
if [[ -n "\$HAS_SU" ]]; then
    echo "Launching as user 'owner' (uid 5001)..."
    \$SDB_TOOL -s "\$SERIAL" shell "su - owner -s /bin/sh '\$LAUNCHER'" 2>&1
else
    echo "WARNING: 'su' not found — launching in current shell user context..."
    \$SDB_TOOL -s "\$SERIAL" shell "\$LAUNCHER" 2>&1
fi

# -- 5. Verify process is running ------------------------------------
sleep 2
PID=\$(\$SDB_TOOL -s "\$SERIAL" shell "pgrep -f \$APP_NAME" 2>/dev/null | tr -d '\r' | grep -v '^[[:space:]]*\$' || true)
if [[ -n "\$PID" ]]; then
    echo "OK: App launched successfully (PID: \$PID)"
else
    echo "ERROR: App launch failed. Device log:"
    \$SDB_TOOL -s "\$SERIAL" shell "tail -n 20 /tmp/\${APP_NAME}.log" 2>/dev/null || true
    exit 1
fi
RERUN_EOF

    chmod +x "$rerun_script"

    log_ok "Rerun script generated: $rerun_script"
    echo "" >&2
    echo "────────────────────────────────────────────────────────────" >&2
    echo "  To re-launch the app later (without re-installing RPM):" >&2
    echo "" >&2
    echo "     $rerun_script" >&2
    echo "" >&2
    echo "  Or register an alias:" >&2
    echo "     echo 'alias run-${app_binary_name}=\"\$HOME/bin/run-${app_binary_name}.sh\"' >> ~/.bashrc" >&2
    echo "     source ~/.bashrc" >&2
    echo "     run-${app_binary_name}" >&2
    echo "────────────────────────────────────────────────────────────" >&2
    echo "" >&2
}


find_app_id() {
    local sdb_path="$1"
    local device_serial="$2"
    local app_package_name="$3"

    # Try to find the app ID from the installed app list
    local list_output
    list_output=$("$sdb_path" -s "$device_serial" shell app_launcher -l 2>&1)
    local candidates
    candidates=$(printf '%s\n' "$list_output" | grep -o "'[^']*${app_package_name}[^']*'" | tr -d "'" || true)
    local app_id
    app_id=$(printf '%s\n' "$candidates" | grep '\.' | head -n1 || true)
    [[ -z "$app_id" ]] && app_id=$(printf '%s\n' "$candidates" | head -n1)

    if [[ -n "$app_id" ]]; then
        echo "Found app ID: $app_id" >&2
        echo "$app_id"
        return 0
    fi
    return 1
}


verify_installation() {
    local sdb_path="$1"
    local device_serial="$2"

    log_section "Verifying installation"

    if output=$("$sdb_path" -s "$device_serial" shell app_launcher -l 2>&1); then
        echo "Installed packages on device:" >&2
        echo "$output" >&2
        return 0
    else
        log_error "Could not verify installation"
        return 1
    fi
}

run_app() {
    local sdb_path="$1"
    local device_serial="$2"
    local app_package_name="$3"

    log_section "Running app"

    # app_launcher -l prints entries as 'Name'  'AppID'. Collect every quoted
    # token containing the package name, then PREFER one with a dot: the real
    # app id is dotted (web: <pkgid>.<name> e.g. xA4DHr9cFv.MyTizenWebApp,
    # native: org.example.<name>) while the bare display-name token is not.
    # awk '{print $1}' used to grab the display NAME and launch a nonexistent id.
    local list_output
    list_output=$("$sdb_path" -s "$device_serial" shell app_launcher -l 2>&1)
    local candidates
    candidates=$(printf '%s\n' "$list_output" | grep -o "'[^']*${app_package_name}[^']*'" | tr -d "'" || true)
    local app_id
    app_id=$(printf '%s\n' "$candidates" | grep '\.' | head -n1 || true)
    [[ -z "$app_id" ]] && app_id=$(printf '%s\n' "$candidates" | head -n1)

    if [[ -n "$app_id" ]]; then
        echo "Found app ID: $app_id" >&2

        # sdb shell does NOT propagate the remote exit code (it is always 0),
        # so success must be read from app_launcher's own output.
        local launch_output
        launch_output=$("$sdb_path" -s "$device_serial" shell app_launcher -s "$app_id" 2>&1)
        printf '%s\n' "$launch_output" >&2
        if printf '%s' "$launch_output" | grep -qi 'successfully launched'; then
            log_ok "App launched successfully"

            # 'successfully launched pid = N' only proves launchpad forked the
            # process; an app that crashes on startup (classic cause: the /opt
            # partition full of crash dumps) still prints it. Verify with the
            # running list, best-effort: -S output varies per profile, so only
            # a CLEAR yes/no is trusted — anything else keeps the old behavior.
            # (Same poll-don't-trust pattern as run_rpm_app's pgrep loop.)
            local attempt status_out running="unknown"
            for attempt in 1 2 3; do
                sleep 1
                status_out=$("$sdb_path" -s "$device_serial" shell app_launcher -S 2>/dev/null | tr -d '\r' || true)
                if [[ -z "$status_out" ]] || printf '%s' "$status_out" | grep -qiE 'unknown option|not supported|usage:'; then
                    running="unknown"
                    break
                fi
                if printf '%s' "$status_out" | grep -qF "$app_id"; then
                    running="yes"
                    break
                fi
                running="no"
            done
            echo "APP_RUNNING=$running"
            if [[ "$running" == "no" ]]; then
                log_warn "App '$app_id' launched but is no longer running — it likely exited right after start."
                log_warn "Common cause: the /opt partition is full (crash dumps). Check: sdb -s $device_serial shell df -h /opt"
                log_warn "Crash dumps live at /opt/usr/share/crash/dump — cleanup needs 'sdb root on' first (see the tizen-sdb-helper skill's clean-crash-dumps recipe)."
            elif [[ "$running" == "yes" ]]; then
                log_ok "App is running (verified via app_launcher -S)"
            fi
            return 0
        fi
        log_error "App launch failed for id '$app_id'"
        return 1
    else
        # Installation succeeded — only the app_launcher lookup failed.
        # This is NOT an installation error; the app IS installed.
        log_warn "Could not find app in app_launcher list (installation succeeded, but app ID lookup failed for launch)"
        return 1
    fi
}


# ============================================================================
# Main Execution
# ============================================================================

echo "Tizen App Installer (Linux/macOS/WSL2)" >&2
echo "======================================" >&2

# Verify app package
log_section "Verifying app package"
APP_PACKAGE=$(verify_app_package "$APP_PACKAGE_PATH")
log_ok "App package verified: $APP_PACKAGE"

# Find tools
log_section "Locating Tizen SDK tools"
TZ_TOOL=$(find_tizen_tool "tz") || exit 1
SDB_TOOL=$(find_tizen_tool "sdb") || exit 1
log_ok "Tizen SDK tools found"

# Check for connected devices
log_section "Checking for connected devices"
DEVICES=($(get_connected_devices "$SDB_TOOL" || true))

if [[ ${#DEVICES[@]} -eq 0 ]]; then
    echo "No devices found. Device manager will be invoked to create/launch an emulator." >&2
    exit 1  # Signal caller to invoke device manager
fi

# Select device
if [[ -z "$DEVICE_SERIAL" ]]; then
    if [[ ${#DEVICES[@]} -eq 1 ]]; then
        DEVICE_SERIAL="${DEVICES[0]}"
        log_ok "Using device: $DEVICE_SERIAL"
    else
        echo "Found multiple devices:" >&2
        for i in "${!DEVICES[@]}"; do
            echo "$((i + 1)). ${DEVICES[$i]}" >&2
        done
        log_error "Multiple devices found. Please specify device serial with -s parameter."
        exit 1
    fi
fi

# Determine package type and install accordingly
APP_EXTENSION="${APP_PACKAGE##*.}"

if [[ "$APP_EXTENSION" == "rpk" ]]; then
    # Every RPK artifact is installed directly with sdb, including .NET pack_as_rpk output.
    install_rpk_project "$SDB_TOOL" "$DEVICE_SERIAL" "$APP_PACKAGE" || exit 1
    echo "" >&2
    log_ok "Installation completed successfully!"
    echo "Device Serial: $DEVICE_SERIAL" >&2
    echo "App Package: $APP_PACKAGE" >&2
    exit 0
elif [[ "$APP_EXTENSION" == "rpm" ]]; then
    # RPM packages (platform apps) — install via sdb push + rpm -ivh
    install_rpm_app "$SDB_TOOL" "$DEVICE_SERIAL" "$APP_PACKAGE" || exit 1

    # Verify installation via rpm query
    log_section "Verifying installation"
    RPM_NAME=$(basename "$APP_PACKAGE" | sed 's/-[0-9].*$//')
    if output=$("$SDB_TOOL" -s "$DEVICE_SERIAL" shell "rpm -q '$RPM_NAME'" 2>&1); then
        echo "RPM query result: $output" >&2
    fi
else
    # TPK/WGT packages — install via tz install
    install_app "$TZ_TOOL" "$DEVICE_SERIAL" "$APP_PACKAGE" || exit 1

    # Verify installation
    verify_installation "$SDB_TOOL" "$DEVICE_SERIAL" || true
fi

# Extract app name from package filename for app ID lookup
# tpk filename is <package-id>-<version>-<arch>.tpk (e.g. org.example.app-1.0.0-x86_64.tpk)
# rpm filename is <name>-<version>-<release>.<arch>.rpm (e.g. dali-demo-1.0.0-1.x86_64.rpm)
if [[ "$APP_EXTENSION" == "rpm" ]]; then
    # For RPM, strip everything from the first version number onward
    # e.g. dali-demo-1.0.0-1.x86_64.rpm → dali-demo
    APP_NAME=$(basename "$APP_PACKAGE" .rpm | sed 's/-[0-9].*//')
else
    # For TPK/WGT, remove extension, then architecture suffix, then version suffix
    APP_NAME=$(basename "$APP_PACKAGE" | sed 's/\.[^.]*$//; s/-\(x86_64\|armv7l\|aarch64\|i386\)$//; s/-[0-9][0-9.]*$//')
fi

# For RPM packages, skip app_launcher lookup (platform apps are not registered)
if [[ "$APP_EXTENSION" != "rpm" ]]; then
    # Always try to find the app ID (not just when --run is used)
    FOUND_APP_ID=$(find_app_id "$SDB_TOOL" "$DEVICE_SERIAL" "$APP_NAME" || true)
fi

# For RPM platform apps, generate a host-side rerun script so the user can
# re-launch the app without re-running the full install-app command.
# Platform apps have no app_launcher icon, so after the app is killed (e.g.
# back key) there is no way to restart it from the device home screen.
if [[ "$APP_EXTENSION" == "rpm" ]]; then
    generate_rerun_script "$APP_NAME"
fi

# Run app if requested
if [[ "$RUN_AFTER_INSTALL" == "true" ]]; then
    if [[ "$APP_EXTENSION" == "rpm" ]]; then
        # RPM platform apps — run binary directly
        run_rpm_app "$SDB_TOOL" "$DEVICE_SERIAL" "$APP_NAME" || true
    else
        # TPK/WGT apps — run via app_launcher
        run_app "$SDB_TOOL" "$DEVICE_SERIAL" "$APP_NAME" || true
    fi
fi


echo "" >&2
log_ok "Installation completed successfully!"
echo "Device Serial: $DEVICE_SERIAL" >&2
echo "App Package: $APP_PACKAGE" >&2

exit 0
