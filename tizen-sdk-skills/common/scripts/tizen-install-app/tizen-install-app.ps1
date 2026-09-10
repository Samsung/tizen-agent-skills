# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Tizen app install script for Windows PowerShell
# Installs .tpk, .wgt, .rpk, or .rpm packages on connected Tizen device/emulator
# (.rpm = platform app from a GBS build: sdb push + rpm -ivh after `sdb root on`,
# launched as user 'owner' with the Wayland/DBus environment — mirrors the .sh)

param(
    # -p / -PackagePath : package to install. Aliases match the bash script's -p flag and the docs.
    [Parameter(Mandatory=$true)]
    [Alias('p','PackagePath')]
    [string]$AppPackagePath,

    # -s / -DeviceSerial : target device serial (bash script uses -s)
    [Parameter(Mandatory=$false)]
    [Alias('s')]
    [string]$DeviceSerial = $null,

    # -r / -RunAfterInstall
    [Parameter(Mandatory=$false)]
    [Alias('r')]
    [switch]$RunAfterInstall = $false
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# ============================================================================
# Utility Functions
# ============================================================================

function Verify-AppPackage {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "App package not found: $Path"
    }

    $extension = [System.IO.Path]::GetExtension($Path).ToLower()
    if ($extension -notin @(".tpk", ".wgt", ".rpk", ".rpm")) {
        throw "Invalid app package. Must be .tpk, .wgt, .rpk, or .rpm, got: $extension"
    }

    $absolutePath = (Resolve-Path $Path).Path
    return $absolutePath
}

function Push-AppToDevice {
    param(
        [string]$SdbPath,
        [string]$DeviceSerial,
        [string]$AppPackagePath
    )

    Write-Section "Pushing app package to device"

    $fileName = [System.IO.Path]::GetFileName($AppPackagePath)
    $devicePath = "/opt/usr/apps/$fileName"

    try {
        # Out-Host keeps sdb's stdout on the console; without it the lines leak
        # into the function's output stream and the returned $true/$false becomes
        # a truthy array, so the caller's failure check never fires.
        & $SdbPath -s $DeviceSerial push $AppPackagePath $devicePath | Out-Host
        if ($LASTEXITCODE -eq 0) {
            Write-Success "App package pushed to $devicePath"
            return $true
        }
        else {
            Write-Err "Failed to push app package"
            return $false
        }
    }
    catch {
        Write-Err "Error pushing app package: $_"
        return $false
    }
}

function Install-App {
    param(
        [string]$TzPath,
        [string]$DeviceSerial,
        [string]$AppPackagePath
    )

    Write-Section "Installing app package"

    try {
        # Out-Host: same output-stream pollution guard as Push-AppToDevice.
        & $TzPath install -e $DeviceSerial -p $AppPackagePath | Out-Host
        if ($LASTEXITCODE -eq 0) {
            Write-Success "App installed successfully on device: $DeviceSerial"
            return $true
        }
        else {
            Write-Err "Installation failed"
            return $false
        }
    }
    catch {
        Write-Err "Error during installation: $_"
        return $false
    }
}

function Find-RpkProjectRoot {
    param([string]$PackagePath)
    $current = Split-Path -Parent $PackagePath
    while ($current) {
        if (Test-Path (Join-Path $current 'tizen_resource_project.yaml')) {
            return $current
        }
        $parent = Split-Path -Parent $current
        if ($parent -eq $current) { break }
        $current = $parent
    }
    return $null
}

function Install-RpkProject {
    param([string]$SdbPath, [string]$DeviceSerial, [string]$AppPackagePath)
    Write-Section "Installing RPK package"
    # RPK is installed directly by sdb (4.2.16+); tz install accepts only tpk/wgt.
    # `sdb install` can return exit code 0 even when the device package manager
    # rejects the package. Capture and inspect its protocol result instead of
    # treating the transport exit status as proof of installation.
    $installOutput = @(& $SdbPath -s $DeviceSerial install $AppPackagePath 2>&1)
    $sdbExitCode = $LASTEXITCODE
    $installText = ($installOutput | Out-String)
    if ($installText) { Write-Host $installText.TrimEnd() }

    $deviceRejectedPackage = $installText -match '(?im)key\[end\]\s+val\[fail\]|processing result\s*:\s*.*\bfailed\b|Invalid certificate chain'
    if ($sdbExitCode -eq 0 -and -not $deviceRejectedPackage) {
        Write-Success "RPK installed successfully on device: $DeviceSerial"
        return $true
    }
    Write-Err "RPK installation failed (sdb exit code: $sdbExitCode; device package-manager rejection: $deviceRejectedPackage)"
    return $false
}

function Invoke-SdbShellText {
    # Runs `sdb -s <serial> shell <cmd>` and returns stdout+stderr as one string.
    # Never throws: sdb shell does not propagate the remote exit code anyway, so
    # callers inspect the text. Under $ErrorActionPreference = Stop a native
    # stderr line can otherwise surface as a terminating NativeCommandError.
    param([string]$SdbPath, [string]$DeviceSerial, [string]$RemoteCommand)
    try {
        $out = @(& $SdbPath -s $DeviceSerial shell $RemoteCommand 2>&1)
        return (($out | ForEach-Object { "$_" }) -join "`n") -replace "`r", ""
    } catch {
        return "$_"
    }
}

function Install-RpmApp {
    # RPM packages (platform apps) need root and are installed with the rpm tool
    # on the device. Same flow as install_rpm_app in tizen-install-app.sh.
    param([string]$SdbPath, [string]$DeviceSerial, [string]$AppPackagePath)

    Write-Section "Pushing RPM package to device"
    $fileName = [System.IO.Path]::GetFileName($AppPackagePath)
    $devicePath = "/tmp/$fileName"

    try {
        & $SdbPath -s $DeviceSerial push $AppPackagePath $devicePath | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to push RPM package"
            return $false
        }
    } catch {
        Write-Err "Failed to push RPM package: $_"
        return $false
    }
    Write-Success "RPM package pushed to $devicePath"

    Write-Section "Installing RPM package"
    # Try to gain root access (emulator only); ignore failures on real devices.
    try { & $SdbPath -s $DeviceSerial root on 2>&1 | Out-Null } catch { }

    $installText = Invoke-SdbShellText $SdbPath $DeviceSerial "rpm -ivh --force '$devicePath'"
    if ($installText) { Write-Host $installText.TrimEnd() }

    $failed = $installText -match '(?i)error|failed'
    if ($failed -and ($installText -match '(?i)already installed')) {
        Write-Success "RPM package already installed, updating..."
        $installText = Invoke-SdbShellText $SdbPath $DeviceSerial "rpm -Uvh --force '$devicePath'"
        if ($installText) { Write-Host $installText.TrimEnd() }
        $failed = ($installText -match '(?i)error|failed') -and -not ($installText -match '(?i)already installed')
        if ($failed) {
            Invoke-SdbShellText $SdbPath $DeviceSerial "rm -f '$devicePath'" | Out-Null
            Write-Err "RPM update failed"
            return $false
        }
    } elseif ($failed) {
        Invoke-SdbShellText $SdbPath $DeviceSerial "rm -f '$devicePath'" | Out-Null
        Write-Err "RPM installation failed"
        return $false
    }

    # Clean up the pushed file (kept until now so the update retry could reuse it)
    Invoke-SdbShellText $SdbPath $DeviceSerial "rm -f '$devicePath'" | Out-Null
    Write-Success "RPM package installed successfully on device: $DeviceSerial"
    return $true
}

function Run-RpmApp {
    # Platform apps live in /usr/bin and are NOT registered with app_launcher, so
    # they are launched by binary name. After `sdb root on` the shell is root, but
    # the Wayland socket / session bus under /run/user/5001 belong to user 'owner'
    # (uid 5001) — a root-launched GUI process is rejected by the display policy,
    # so launch as owner via su. Same flow as run_rpm_app in tizen-install-app.sh.
    param([string]$SdbPath, [string]$DeviceSerial, [string]$AppBinaryName)

    Write-Section "Running platform app"

    $check = Invoke-SdbShellText $SdbPath $DeviceSerial "ls /usr/bin/$AppBinaryName"
    if ($check -match '(?i)No such file') {
        Write-Err "Binary not found on device: /usr/bin/$AppBinaryName"
        return $false
    }

    # /run/wayland-0 is root:display; 'owner' is not in 'display' by default.
    # Idempotent, safe to run every time.
    Invoke-SdbShellText $SdbPath $DeviceSerial "usermod -aG display owner" | Out-Null

    # Write a launcher script into /home/owner (/tmp may be noexec). sdb shell
    # kills its process group on exit, so nohup + setsid + a HUP trap keep the
    # app alive. printf with \n is used because heredocs do not survive sdb
    # shell quoting; `trap : HUP` avoids embedding double quotes, which
    # PowerShell cannot pass reliably to a native command line.
    $launcherScript = "/home/owner/.run-$AppBinaryName.sh"
    $printfBody = "#!/bin/sh\nexport WAYLAND_DISPLAY=wayland-0\nexport XDG_RUNTIME_DIR=/run/user/5001\nexport ELM_ENGINE=wayland_egl\nexport DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/5001/bus\ntrap : HUP\nnohup setsid /usr/bin/$AppBinaryName < /dev/null > /tmp/$AppBinaryName.log 2>&1 &\necho PID=`$!\n"
    $writeLauncher = "printf '$printfBody' > '$launcherScript' && chmod 755 '$launcherScript' && chown owner:users '$launcherScript'"
    Invoke-SdbShellText $SdbPath $DeviceSerial $writeLauncher | Out-Null

    $hasSu = (Invoke-SdbShellText $SdbPath $DeviceSerial "command -v su").Trim()
    if ($hasSu -and ($hasSu -notmatch '(?i)not found')) {
        Write-Success "Launching as user 'owner' (uid 5001)"
        $launchOutput = Invoke-SdbShellText $SdbPath $DeviceSerial "su - owner -s /bin/sh '$launcherScript'"
    } else {
        Write-Warn "'su' not found on device - launching in current shell user context"
        $launchOutput = Invoke-SdbShellText $SdbPath $DeviceSerial $launcherScript
    }
    if ($launchOutput) { Write-Host $launchOutput.TrimEnd() }

    # Poll for the process — a slow emulator can take a few seconds to start
    # ($PID is a read-only automatic variable in PowerShell — use another name.)
    $appPid = ""
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        Start-Sleep -Seconds 1
        $appPid = (Invoke-SdbShellText $SdbPath $DeviceSerial "pgrep -f $AppBinaryName").Trim()
        if ($appPid) { break }
    }
    # Same APP_RUNNING contract as the tpk/wgt path: the pgrep poll IS the
    # running check for platform apps (not in app_launcher's list), so the
    # envelope must not report null ("not verifiable") here.
    if ($appPid) {
        Write-Success "App launched successfully (PID: $appPid)"
        Write-Host "APP_RUNNING=yes"
        Write-Host "To re-launch later without re-installing: sdb -s $DeviceSerial shell su - owner -s /bin/sh '$launcherScript'"
        return $true
    }

    Write-Host "APP_RUNNING=no"
    Write-Err "App process not found after launch - check /tmp/$AppBinaryName.log on device"
    # Surface the app log tail so the actual failure reason lands in the envelope
    # warnings (lines must contain error/fail/... to pass summarizeInstallOutput).
    $appLog = (Invoke-SdbShellText $SdbPath $DeviceSerial "tail -n 20 /tmp/$AppBinaryName.log 2>/dev/null").Trim()
    if ($appLog) {
        foreach ($line in ($appLog -split "`n")) {
            if ($line.Trim()) { Write-Host "[ERROR] app-log: $line" }
        }
        if ($appLog -match '(?i)wayland|failed to connect') {
            Write-Host "[ERROR] hint: display server connection failed - verify the app runs as user 'owner' (uid 5001) and WAYLAND_DISPLAY/XDG_RUNTIME_DIR are correct"
        } elseif ($appLog -match '(?i)error while loading shared libraries') {
            Write-Host "[ERROR] hint: missing runtime libraries on device - install the matching dali/dali-toolkit RPMs first"
        }
    } else {
        Write-Host "[ERROR] app-log: /tmp/$AppBinaryName.log is empty or missing - the process may have been killed before writing output"
    }
    return $false
}

function Cleanup-PushedFile {
    param(
        [string]$SdbPath,
        [string]$DeviceSerial,
        [string]$AppPackagePath
    )

    $fileName = [System.IO.Path]::GetFileName($AppPackagePath)
    $devicePath = "/opt/usr/apps/$fileName"

    # Remove the pushed package file from device to avoid permission issues
    try {
        & $SdbPath -s $DeviceSerial shell "rm -f '$devicePath'" 2>$null | Out-Null
    } catch {
        # Ignore cleanup errors
    }
}

function Find-AppId {
    param(
        [string]$SdbPath,
        [string]$DeviceSerial,
        [string]$AppPackageName
    )

    try {
        $listOutput = (& $SdbPath -s $DeviceSerial shell app_launcher -l 2>&1) -join "`n"
        $esc = [regex]::Escape($AppPackageName)
        $tokens = [regex]::Matches($listOutput, "'([^']*$esc[^']*)'") |
            ForEach-Object { $_.Groups[1].Value }
        $appId = $tokens | Where-Object { $_ -match '\.' } | Select-Object -First 1
        if (-not $appId) { $appId = $tokens | Select-Object -First 1 }

        if ($appId) {
            Write-Host "Found app ID: $appId" -ForegroundColor Yellow
            return $appId
        }
        return $null
    } catch {
        return $null
    }
}

function Verify-Installation {
    param(
        [string]$SdbPath,
        [string]$DeviceSerial
    )

    Write-Section "Verifying installation"

    try {
        $output = & $SdbPath -s $DeviceSerial shell app_launcher -l 2>&1
        Write-Host "Installed packages on device:" -ForegroundColor Yellow
        Write-Host $output
        return $true
    }
    catch {
        Write-Err "Could not verify installation: $_"
        return $false
    }
}

function Run-App {
    param(
        [string]$SdbPath,
        [string]$DeviceSerial,
        [string]$AppPackageName
    )

    Write-Section "Running app"

    try {
        # app_launcher -l prints entries as 'Name'  'AppID'. Collect every quoted
        # token containing the package name, then PREFER one with a dot: the real
        # app id is dotted (web: <pkgid>.<name> e.g. xA4DHr9cFv.MyTizenWebApp,
        # native: org.example.<name>) while the bare display-name token is not.
        # Matching only "starts with the name" grabbed the NAME for web apps and
        # launched a nonexistent id.
        $listOutput = (& $SdbPath -s $DeviceSerial shell app_launcher -l 2>&1) -join "`n"
        $esc = [regex]::Escape($AppPackageName)
        $tokens = [regex]::Matches($listOutput, "'([^']*$esc[^']*)'") |
            ForEach-Object { $_.Groups[1].Value }
        $appId = $tokens | Where-Object { $_ -match '\.' } | Select-Object -First 1
        if (-not $appId) { $appId = $tokens | Select-Object -First 1 }

        if ($appId) {
            Write-Host "Found app ID: $appId" -ForegroundColor Yellow

            # sdb shell does NOT propagate the remote exit code (it is always 0),
            # so success must be read from app_launcher's own output.
            $launchOutput = (& $SdbPath -s $DeviceSerial shell app_launcher -s $appId 2>&1) -join "`n"
            Write-Host $launchOutput
            if ($launchOutput -match 'successfully launched') {
                Write-Success "App launched successfully"

                # 'successfully launched pid = N' only proves launchpad forked
                # the process; an app that crashes on startup (classic cause:
                # the /opt partition full of crash dumps) still prints it.
                # Verify with the running list, best-effort: -S output varies
                # per profile, so only a CLEAR yes/no is trusted.
                $running = "unknown"
                for ($attempt = 1; $attempt -le 3; $attempt++) {
                    Start-Sleep -Seconds 1
                    $statusOut = (& $SdbPath -s $DeviceSerial shell app_launcher -S 2>$null) -join "`n"
                    if (-not $statusOut -or $statusOut -match 'unknown option|not supported|usage:') {
                        $running = "unknown"
                        break
                    }
                    if ($statusOut -match [regex]::Escape($appId)) {
                        $running = "yes"
                        break
                    }
                    $running = "no"
                }
                Write-Host "APP_RUNNING=$running"
                if ($running -eq "no") {
                    Write-Warn "App '$appId' launched but is no longer running - it likely exited right after start."
                    Write-Warn "Common cause: the /opt partition is full (crash dumps). Check: sdb -s $DeviceSerial shell df -h /opt"
                    Write-Warn "Crash dumps live at /opt/usr/share/crash/dump - cleanup needs 'sdb root on' first (see the tizen-sdb-helper skill's clean-crash-dumps recipe)."
                }
                elseif ($running -eq "yes") {
                    Write-Success "App is running (verified via app_launcher -S)"
                }
                return $true
            }
            Write-Err "App launch failed for id '$appId'"
            return $false
        }
        else {
            # Installation succeeded - only the app_launcher lookup failed.
            # This is NOT an installation error; the app IS installed.
            Write-Warn "Could not find app in app_launcher list (installation succeeded, but app ID lookup failed for launch)"
            return $false

        }
    }
    catch {
        Write-Err "Error running app: $_"
        return $false
    }
}

# ============================================================================
# Main Execution
# ============================================================================

try {
    Write-Host "Tizen App Installer (Windows)" -ForegroundColor Magenta
    Write-Host "==============================" -ForegroundColor Magenta

    # Verify app package
    Write-Section "Verifying app package"
    $appPackage = Verify-AppPackage $AppPackagePath
    Write-Success "App package verified: $appPackage"

    # Find tools
    Write-Section "Locating Tizen SDK tools"
    $tzPath = Find-TizenTool "tz"
    if (-not $tzPath) { throw "Cannot find tz. Please install Tizen SDK first." }
    $sdbPath = Find-TizenTool "sdb"
    if (-not $sdbPath) { throw "Cannot find sdb. Please install Tizen SDK first." }
    Write-Success "Tizen SDK tools found"

    # Check for connected devices
    Write-Section "Checking for connected devices"
    # @() forces an array: a single returned serial would otherwise unwrap to a
    # string, and $devices[0] would then return its first CHARACTER (e.g. "e").
    $devices = @(Get-ConnectedDevices $sdbPath)

    if ($devices.Count -eq 0) {
        Write-Host "No devices found. Device manager will be invoked to create/launch an emulator." -ForegroundColor Yellow
        exit 1  # Signal caller to invoke device manager
    }

    # Select device
    $selectedDevice = $DeviceSerial
    if (-not $selectedDevice) {
        if ($devices.Count -eq 1) {
            $selectedDevice = $devices[0]
            Write-Success "Using device: $selectedDevice"
        }
        else {
            Write-Host "Found multiple devices:" -ForegroundColor Yellow
            for ($i = 0; $i -lt $devices.Count; $i++) {
                Write-Host "$($i + 1). $($devices[$i])"
            }
            throw "Multiple devices found. Please specify device serial with -DeviceSerial parameter."
        }
    }

    $packageExt = [System.IO.Path]::GetExtension($appPackage).ToLower()
    $isRpk = $packageExt -eq '.rpk'
    $isRpm = $packageExt -eq '.rpm'
    # Every RPK artifact is installed directly with sdb. It may originate from
    # a standalone resource project or a .NET project using pack_as_rpk.
    # RPM (platform app) goes through sdb push + rpm; everything else via tz install.
    $installSuccess = if ($isRpk) { Install-RpkProject $sdbPath $selectedDevice $appPackage }
                      elseif ($isRpm) { Install-RpmApp $sdbPath $selectedDevice $appPackage }
                      else { Install-App $tzPath $selectedDevice $appPackage }
    if (-not $installSuccess) {
        throw "Failed to install app"
    }

    if ($isRpk) {
        Write-Host "`n" -ForegroundColor Magenta
        Write-Success "Installation completed successfully!"
        Write-Host "Device Serial: $selectedDevice" -ForegroundColor Green
        Write-Host "App Package: $appPackage" -ForegroundColor Green
        exit 0
    }

    if ($isRpm) {
        # rpm filename is <name>-<version>-<release>.<arch>.rpm (e.g. dali-demo-1.0.0-1.x86_64.rpm)
        # → strip everything from the first version number onward → dali-demo
        $appName = [System.IO.Path]::GetFileNameWithoutExtension($appPackage) -replace '-[0-9].*$',''

        Write-Section "Verifying installation"
        $rpmQuery = Invoke-SdbShellText $sdbPath $selectedDevice "rpm -q '$appName'"
        if ($rpmQuery) { Write-Host "RPM query result: $($rpmQuery.Trim())" -ForegroundColor Yellow }

        # Platform apps are not registered with app_launcher — skip Find-AppId.
        if ($RunAfterInstall) {
            $null = Run-RpmApp $sdbPath $selectedDevice $appName
        }
    }
    else {
        # Verify installation ($null = : keep the returned boolean off stdout)
        $null = Verify-Installation $sdbPath $selectedDevice

        # Extract app name from package filename for app ID lookup
        # tpk filename is <package-id>-<version>-<arch>.tpk (e.g. org.example.app-1.0.0-x86_64.tpk)
        # Remove arch suffix, then version suffix
        $appName = [System.IO.Path]::GetFileNameWithoutExtension($appPackage) -replace '-(x86_64|armv7l|aarch64|i386)$','' -replace '-[0-9][0-9.]*$',''

        # Always try to find the app ID (not just when -RunAfterInstall is used)
        $null = Find-AppId $sdbPath $selectedDevice $appName

        # Run app if requested
        if ($RunAfterInstall) {
            $null = Run-App $sdbPath $selectedDevice $appName
        }
    }

    Write-Host "`n" -ForegroundColor Magenta
    Write-Success "Installation completed successfully!"
    Write-Host "Device Serial: $selectedDevice" -ForegroundColor Green
    Write-Host "App Package: $appPackage" -ForegroundColor Green

    exit 0
}
catch {
    Write-Err "Installation failed: $_"
    exit 1
}
