# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-device-manager.ps1
#
# Finds a connected Tizen device via sdb.
# If no device is found, returns a device_not_found error directing the user
# to tizen-create-emulator (to create a VM) and tizen-launch-emulator (to launch one).
# This script does NOT create or launch emulators - that is handled by the
# dedicated skills to avoid ambiguity.
# With -Action stop, shuts down all running emulator VMs via em-cli kill.
#
# Usage:
#   .\tizen-device-manager.ps1 [-Timeout <seconds>] [-VmName <name>] [-Action <start|stop>] [-Profile <tizen|tv>]
#
# Options:
#   -Timeout   Seconds to wait for emulator connection (default: 300)
#   -VmName    Emulator VM name to look for (default: tizen-vm-default)
#   -Action    Action: start (default) or stop
#   -Profile   Emulator profile: tizen (default) or tv (Samsung TV)

param(
    [int]$Timeout = 300,
    [string]$VmName = "tizen-vm-default",
    [ValidateSet("start", "stop")]
    [string]$Action = "start",
    [ValidateSet("tizen", "tv")]
    [string]$Profile = "tizen"
)



$ErrorActionPreference = "Continue"

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# (Find-EmCli — em-cli.bat lookup via Get-SdkPath — comes from lib\common.ps1)

# ---------------------------------------------------------------------------
# Find sdb
# ---------------------------------------------------------------------------
Write-Info "Looking for sdb..."
$sdb = Find-TizenTool "sdb"
if (-not $sdb) {
    Write-Err "sdb not found. Install the Tizen SDK first (tizen-sdk-install agent)."
    exit 1
}
Write-Info "Found sdb: $sdb"

# ---------------------------------------------------------------------------
# Read a VM's platform from its vm_config.xml ('' if it cannot be determined).
# Needed because `em-cli list-vm` prints names only, and a tv-samsung-* VM
# rejects packages signed with the standard Tizen profile (certificate error).
# Defined early here so the device check below can use it.
# ---------------------------------------------------------------------------
function Get-VmPlatform {
    param([string]$Name)

    $dataRoot = Join-Path $env:USERPROFILE "tizen-sdk-data"
    # Try to read the data path from sdk.info if it exists
    $sdkInfoCandidates = @(
        (Join-Path $env:USERPROFILE "tizen-sdk\sdk.info"),
        "C:\tizen-sdk\sdk.info"
    )
    foreach ($infoPath in $sdkInfoCandidates) {
        if (Test-Path $infoPath) {
            $m = Select-String -Path $infoPath -Pattern '^TIZEN_SDK_DATA_PATH=(.+)$' | Select-Object -First 1
            if ($m) { $dataRoot = $m.Matches[0].Groups[1].Value.Trim(); break }
        }
    }

    $cfg = Join-Path $dataRoot (Join-Path "emulator" (Join-Path "vms" (Join-Path $Name "vm_config.xml")))
    if (Test-Path $cfg) {
        $m = Select-String -Path $cfg -Pattern '<platform>([^<]+)</platform>' | Select-Object -First 1
        if ($m) { return $m.Matches[0].Groups[1].Value }
    }
    return ''
}

# ---------------------------------------------------------------------------
# Find em-cli (needed for both stop and start actions)
# ---------------------------------------------------------------------------
Write-Info "Looking for em-cli..."
$emcli = Find-EmCli
if (-not $emcli) {
    Write-Err "em-cli not found. Ensure the Tizen SDK is installed with the emulator package."
    Write-Err "Re-run tizen-sdk-install, or launch an emulator manually via Tizen Studio Emulator Manager."
    exit 1
}
Write-Info "Found em-cli: $emcli"

# ---------------------------------------------------------------------------
# Ensure sdk.info exists (em-cli requires it to locate the SDK)
# ---------------------------------------------------------------------------
$emcliDir = Split-Path $emcli
$sdkRoot   = Split-Path (Split-Path (Split-Path $emcliDir))
$sdkInfoPath = Join-Path $sdkRoot "sdk.info"

if (-not (Test-Path $sdkInfoPath)) {
    Write-Warn "sdk.info not found at $sdkInfoPath. Creating it..."
    $sdkParent = Split-Path $sdkRoot
    $dataPath  = Join-Path $sdkParent "tizen-sdk-data"
    # No comment/blank lines and no BOM: Tizen CLI's tpklib PropertyParser crashes on any line
    # without "=", and a BOM (Set-Content -Encoding UTF8 on PowerShell 5.1) corrupts the first key.
    $sdkInfoContent = @"
TIZEN_SDK_INSTALLED_PATH=$sdkRoot
TIZEN_SDK_DATA_PATH=$dataPath
"@
    try {
        [System.IO.File]::WriteAllText($sdkInfoPath, $sdkInfoContent + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    } catch { }
    if (Test-Path $sdkInfoPath) {
        Write-Success "sdk.info created: $sdkInfoPath"
    } else {
        Write-Warn "Could not create sdk.info - em-cli may still fail. Run tizen-sdk-install to fix."
    }
} else {
    Write-Info "sdk.info found: $sdkInfoPath"
}

# ---------------------------------------------------------------------------
# Invoke-EmCli: calls Java directly with JNA in classpath (bypasses em-cli.bat)
# ---------------------------------------------------------------------------
function Invoke-EmCli {
    param([string[]]$ArgList, [string]$Stdin = "")

    # Find Java: prefer SDK-bundled JDK from tizen-sdk only
    $sdkPath = Get-SdkPath

    $javaExe = @(
        "$sdkPath\jdk\bin\java.exe",
        "$env:USERPROFILE\tizen-sdk\jdk\bin\java.exe",
        "C:\tizen-sdk\jdk\bin\java.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $javaExe) { $javaExe = "java" }

    # Build classpath: all jars in em-cli dir + JNA jar
    $jars = (Get-ChildItem -Path $emcliDir -Filter "*.jar" -ErrorAction SilentlyContinue).FullName
    $jnaJar = @(
        "$sdkRoot\tools\device-manager\bin\jna-4.1.0.jar",
        "$sdkRoot\platforms\tizen-10.0\common\emulator\bin\jna-4.1.0.jar"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($jnaJar) { $jars += $jnaJar }

    $cp = $jars -join ";"

    # Every em-cli call goes through Start-Process with FILE redirection:
    # - PowerShell's pipe operator ("y" | & java ...) does not reliably deliver
    #   stdin to Java processes - the em-cli confirmation prompt hangs. .NET
    #   Process with RedirectStandardInput also deadlocks because ReadToEnd()
    #   blocks while the Java process is writing the prompt to stdout. File
    #   redirection is the same mechanism cmd.exe uses with `< file` and does
    #   not deadlock; without -Stdin the file is empty, so a JVM that prompts
    #   reads EOF instead of blocking on an inherited console (issue #82: a
    #   list-vm under Codex CLI hung until the runner's 30-minute ceiling).
    # - A wall-clock cap (TIZEN_EMCLI_TIMEOUT_MS, default 120 s; read-only
    #   actions only - launch/create/delete may legitimately run long): a JVM
    #   that cannot write its state (Codex's write-restricted sandbox token, a
    #   read-only SDK) hangs forever. On timeout the process is killed and
    #   LASTEXITCODE is 124, so the caller reports a real failure.
    $argStr = ($ArgList | ForEach-Object {
        if ($_ -match '\s') { "`"$_`"" } else { $_ }
    }) -join ' '
    $readOnly = @("list-vm", "list-platform", "list-template", "detail") -contains "$($ArgList[0])"
    $timeoutMs = 0
    if ($readOnly) {
        $timeoutMs = 120000
        if ($env:TIZEN_EMCLI_TIMEOUT_MS -match '^\d+$') { $timeoutMs = [int]$env:TIZEN_EMCLI_TIMEOUT_MS }
    }

    $tempInput  = [System.IO.Path]::GetTempFileName()
    $tempOutput = [System.IO.Path]::GetTempFileName()
    $tempError  = [System.IO.Path]::GetTempFileName()
    # WriteAllText avoids Set-Content's encoding quirks (BOM, UTF-16 default on
    # some systems). Java's readLine() blocks until it sees \n, so the trailing
    # newline is mandatory when an answer is supplied.
    if ($Stdin) { [System.IO.File]::WriteAllText($tempInput, "$Stdin`n") }
    else        { [System.IO.File]::WriteAllText($tempInput, "") }

    $proc = Start-Process -FilePath $javaExe `
        -ArgumentList "-cp `"$cp`" org.tizen.emulator.manager.console.Main $argStr" `
        -RedirectStandardInput  $tempInput `
        -RedirectStandardOutput $tempOutput `
        -RedirectStandardError  $tempError `
        -NoNewWindow -PassThru
    # Open the process handle BEFORE waiting: without it a -PassThru Process
    # reports ExitCode = $null after WaitForExit, and `$null -ne 0` read every
    # healthy em-cli call as a failure (issue #82 follow-up). 1:1 with
    # tizen-emulator-manager.ps1.
    try { $null = $proc.Handle } catch { }

    $timedOut = $false
    if ($timeoutMs -gt 0) {
        if (-not $proc.WaitForExit($timeoutMs)) {
            $timedOut = $true
            try { $proc.Kill() } catch { }
            $proc.WaitForExit(5000) | Out-Null
        }
    } else {
        $proc.WaitForExit()
    }

    $stdout = Get-Content $tempOutput -Raw -ErrorAction SilentlyContinue
    $stderr = Get-Content $tempError  -Raw -ErrorAction SilentlyContinue
    Remove-Item $tempInput, $tempOutput, $tempError -Force -ErrorAction SilentlyContinue

    $rc = 0
    if ($timedOut) {
        $rc = 124
        [Console]::Error.WriteLine("[ERROR] em-cli '$($ArgList[0])' did not finish within $([int]($timeoutMs / 1000)) s (hung JVM - under Codex CLI re-run with escalated permissions; TIZEN_EMCLI_TIMEOUT_MS tunes the cap).")
    } else {
        $rc = $proc.ExitCode
        if ($null -eq $rc) {
            # Handle trick did not take (old .NET): infer from the JVM's stderr
            # instead of reading "unknown" as a failure.
            if ("$stderr" -match 'Exception|Error') { $rc = 1 } else { $rc = 0 }
            [Console]::Error.WriteLine("[WARN] em-cli '$($ArgList[0])': exit code not reported by the host, inferred $rc from its output.")
        }
    }
    $global:LASTEXITCODE = $rc

    # Output goes through the PIPELINE (one string per line) so the caller's
    # `$vmListRaw = Invoke-EmCli "list-vm"` actually receives it - the previous
    # [Console]::Out.Write left every caller with an empty result. stderr joins
    # the pipeline only on failure (it is the diagnostic then); on success it
    # goes to the error console so a JVM warning never parses as a VM name.
    $lines = @()
    if ($stdout) { $lines += @("$stdout" -split "\r?\n") }
    if ($stderr) {
        if ($rc -ne 0) { $lines += @("$stderr" -split "\r?\n") }
        else { [Console]::Error.Write($stderr) }
    }
    foreach ($line in $lines) {
        if ($line -ne '') { Write-Output $line }
    }
}

# ---------------------------------------------------------------------------
# Stop action: shut down all running emulator VMs
# NOTE: The stop action must be checked BEFORE the device detection block below.
# If a device (emulator) is connected, the device detection block exits with
# DEVICE_SERIAL=... and the stop logic is never reached.
# ---------------------------------------------------------------------------
if ($Action -eq "stop") {
    Write-Info "Stop action: shutting down running emulator VMs..."

    $stoppedCount = 0
    $totalAttempted = 0

    # Method 1: Try to stop emulators using stored PID files
    Write-Info "Method 1: Checking for stored emulator PID files..."
    $pidFiles = Get-ChildItem -Path $env:TEMP -Filter "tizen-emulator-*.pid" -ErrorAction SilentlyContinue
    if ($pidFiles) {
        foreach ($pidFile in $pidFiles) {
            try {
                $emuPid = Get-Content $pidFile.FullName -ErrorAction Stop
                $vmName = $pidFile.BaseName -replace '^tizen-emulator-', ''

                Write-Info "Found PID file for VM '$vmName': PID=$emuPid"

                # Validate the process is actually running and is an emulator
                $process = $null
                try {
                    $process = Get-Process -Id $emuPid -ErrorAction Stop
                } catch {
                    Write-Warn "Process $emuPid not found - emulator may have already exited"
                    # Clean up stale PID file
                    Remove-Item $pidFile.FullName -ErrorAction SilentlyContinue
                    continue
                }

                # Verify it's an emulator process (qemu or emulator in name)
                if ($process.ProcessName -like "*qemu*" -or $process.ProcessName -like "*emulator*") {
                    Write-Info "Stopping emulator process: $($process.ProcessName) (PID: $emuPid)..."
                    Stop-Process -Id $emuPid -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2

                    # Verify the process is stopped
                    try {
                        $stillRunning = Get-Process -Id $emuPid -ErrorAction SilentlyContinue
                        if ($stillRunning) {
                            Write-Warn "Process $emuPid still running after Stop-Process"
                        } else {
                            Write-Success "VM '$vmName' stopped via PID kill."
                            $stoppedCount++
                            $totalAttempted++
                            # Clean up PID file
                            Remove-Item $pidFile.FullName -ErrorAction SilentlyContinue
                        }
                    } catch {
                        Write-Success "VM '$vmName' stopped via PID kill."
                        $stoppedCount++
                        $totalAttempted++
                        # Clean up PID file
                        Remove-Item $pidFile.FullName -ErrorAction SilentlyContinue
                    }
                } else {
                    Write-Warn "PID $emuPid is not an emulator process (found: $($process.ProcessName)). Skipping."
                }
            } catch {
                Write-Warn "Error processing PID file $($pidFile.FullName): $_"
            }
        }
    } else {
        Write-Info "No PID files found in $($env:TEMP)"
    }

    # Method 2: Find and kill any running qemu/emulator processes not captured by PID files
    # Match on the command line (must mention tizen), not just the process name,
    # so unrelated emulators (e.g. Android qemu) are never killed.
    Write-Info "Method 2: Scanning for running emulator processes..."
    $emulatorProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -like "*qemu*" -or $_.Name -like "*emulator*") -and $_.CommandLine -match 'tizen'
    } | ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } | Where-Object { $_ })
    foreach ($proc in $emulatorProcesses) {
        # Check if we already tried to stop this process via PID file
        $alreadyStopped = $false
        $pidFiles = Get-ChildItem -Path $env:TEMP -Filter "tizen-emulator-*.pid" -ErrorAction SilentlyContinue
        foreach ($pidFile in $pidFiles) {
            try {
                $storedPid = Get-Content $pidFile.FullName -ErrorAction Stop
                if ($storedPid -eq $proc.Id) {
                    $alreadyStopped = $true
                    break
                }
            } catch {
                # Ignore errors reading PID files
            }
        }
        
        if (-not $alreadyStopped) {
            Write-Info "Found emulator process: $($proc.ProcessName) (PID: $($proc.Id))"
            Write-Info "Stopping emulator process..."
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            
            # Verify the process is stopped
            try {
                $stillRunning = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
                if ($stillRunning) {
                    Write-Warn "Process $($proc.Id) still running after Stop-Process"
                } else {
                    Write-Success "Emulator process stopped (PID: $($proc.Id))"
                    $stoppedCount++
                }
            } catch {
                Write-Success "Emulator process stopped (PID: $($proc.Id))"
                $stoppedCount++
            }
        }
    }

    # Method 3: Fallback - try em-cli commands (for SDKs that support them)
    Write-Info "Method 3: Trying em-cli stop commands as fallback..."
    $vmListRaw = Invoke-EmCli "list-vm" 2>$null
    $vmLines = $vmListRaw | Where-Object { $_ -is [string] -and $_.Trim() -ne '' -and $_ -notmatch 'VM list is empty' -and $_ -notmatch '^\[' }
    $vmNames = @($vmLines | ForEach-Object { ($_ -split '\s+')[0] })
    
    if ($vmNames.Count -gt 0) {
        # Check which VMs are still running via sdb
        $devRaw = & $sdb devices 2>&1
        $devLines = $devRaw | Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }
        $runningVms = @()
        foreach ($line in $devLines) {
            $parts = $line -split '\s+'
            if ($parts.Count -ge 3) {
                $runningVms += $parts[2]
            }
        }
        
        if ($runningVms.Count -gt 0) {
            Write-Info "VMs still running according to sdb: $($runningVms -join ', ')"
            
            # Detect which stop command em-cli supports
            $stopCmd = $null
            foreach ($cmd in @("kill", "shutdown", "stop", "close")) {
                Invoke-EmCli $cmd, "--help" 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    $stopCmd = $cmd
                    Write-Info "em-cli supports '$cmd' for stopping VMs."
                    break
                }
            }
            
            foreach ($vm in $runningVms) {
                if ($vmNames -notcontains $vm) { continue }
                
                $vmStopped = $false
                
                if ($stopCmd) {
                    Write-Info "Stopping VM '$vm' using em-cli $stopCmd..."
                    Invoke-EmCli $stopCmd, "-n", $vm 2>$null | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        $vmStopped = $true
                    }
                }
                
                if (-not $vmStopped) {
                    # Try each candidate command
                    foreach ($cmd in @("kill", "shutdown", "stop", "close")) {
                        Write-Info "Trying em-cli $cmd for VM '$vm'..."
                        Invoke-EmCli $cmd, "-n", $vm 2>$null | Out-Null
                        if ($LASTEXITCODE -eq 0) {
                            $vmStopped = $true
                            break
                        }
                    }
                }
                
                if ($vmStopped) {
                    Start-Sleep -Seconds 2
                    $remaining = & $sdb devices 2>&1 | Out-String
                    if ($remaining -notmatch [regex]::Escape($vm)) {
                        Write-Success "VM '$vm' stopped via em-cli."
                        $stoppedCount++
                    } else {
                        Write-Warn "em-cli reported success but VM '$vm' still in sdb devices."
                    }
                }
            }
        }
    }

    # Method 4: Final fallback - try sdb shell poweroff
    Write-Info "Method 4: Trying sdb shell poweroff as final fallback..."
    $devRaw = & $sdb devices 2>&1
    $devLines = $devRaw | Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }
    
    foreach ($line in $devLines) {
        $parts = $line -split '\s+'
        if ($parts.Count -ge 3) {
            $serial = $parts[0]
            $vm = $parts[2]
            
            Write-Info "Trying sdb shell poweroff for device $serial (VM: $vm)..."
            & $sdb -s $serial shell poweroff 2>&1 | Out-Null
            Start-Sleep -Seconds 2
            
            $remainingRaw = & $sdb devices 2>&1
            $remainingLines = $remainingRaw | Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }
            $stillThere = $false
            foreach ($rLine in $remainingLines) {
                if ($rLine -match $serial) { $stillThere = $true; break }
            }
            
            if (-not $stillThere) {
                Write-Success "Device $serial (VM: $vm) stopped via sdb shell poweroff."
                $stoppedCount++
            } else {
                Write-Warn "sdb shell poweroff failed for $serial."
            }
        }
    }

    # Report results
    Write-Host ""
    if ($stoppedCount -gt 0) {
        Write-Success "Stopped $stoppedCount emulator VM(s)."
        Write-Host "EMULATOR_STOPPED=$stoppedCount"
        exit 0
    } else {
        Write-Info "No running emulators found to stop."
        Write-Host "EMULATOR_STOPPED=0"
        exit 0
    }
}

# ---------------------------------------------------------------------------
# Check for connected devices (only for start action)
# ---------------------------------------------------------------------------
Write-Info "Checking for connected devices..."

$serial = Get-DeviceSerial $sdb

if ($serial) {
    # Check if the connected device matches the requested profile.
    # For USB devices (non-emulator), accept regardless of profile.
    # For emulators, check the VM's platform via vm_config.xml and only accept
    # if it matches the requested profile (tv-samsung-* for tv, non-tv for tizen).
    if ($serial -match '^emulator-') {
        # Extract the VM name from sdb devices output (3rd column)
        $devRaw = & $sdb devices 2>&1
        $devLine = $devRaw | Where-Object { $_ -match [regex]::Escape($serial) -and $_ -match '\sdevice(\s|$)' } | Select-Object -First 1
        $vmNameOfDevice = if ($devLine) { ($devLine -split '\s+')[2] } else { '' }
        $devicePlatform = ''
        if ($vmNameOfDevice) {
            $devicePlatform = Get-VmPlatform $vmNameOfDevice
        }

        # Check if the device platform matches the requested profile
        $profileMatches = $false
        if ($Profile -eq "tv") {
            if ($devicePlatform -match '^tv-') { $profileMatches = $true }
        } else {
            # For standard tizen profile, accept non-TV platforms or unknown platform
            if ($devicePlatform -notmatch '^tv-') { $profileMatches = $true }
        }

        if ($profileMatches) {
            $platformLabel = if ($devicePlatform) { $devicePlatform } else { 'unknown' }
            Write-Success "Connected device found: $serial (platform: $platformLabel, profile: $Profile)"
            Write-Host ""
            Write-Host "DEVICE_SERIAL=$serial"
            exit 0
        } else {
            $platformLabel = if ($devicePlatform) { $devicePlatform } else { 'unknown' }
            Write-Warn "Connected emulator '$serial' has platform '$platformLabel' but profile '$Profile' was requested."
            Write-Warn "Will proceed to create/launch a $Profile emulator instead."
        }
    } else {
        # USB device - accept regardless of profile
        Write-Success "Connected device found: $serial"
        Write-Host ""
        Write-Host "DEVICE_SERIAL=$serial"
        exit 0
    }
}

Write-Warn "No connected devices found."

# ---------------------------------------------------------------------------
# Device not found - direct user to dedicated emulator skills
# ---------------------------------------------------------------------------
# This script does NOT create or launch emulators. That is handled by the
# dedicated skills tizen-create-emulator and tizen-launch-emulator to avoid
# ambiguity between the three skills.
Write-Err "No connected Tizen device or emulator found."
Write-Err ""
Write-Err "To get a device, use the dedicated emulator skills:"
Write-Err "  1. tizen-create-emulator - to create an emulator VM (if one doesn't exist)"
if ($Profile -eq "tv") {
    Write-Err "     (use --profile tv for a Samsung TV emulator)"
}
Write-Err "  2. tizen-launch-emulator - to launch an existing emulator VM"
Write-Err ""
Write-Err "After the emulator is running, re-run tizen-device-manager to detect it."
exit 1


