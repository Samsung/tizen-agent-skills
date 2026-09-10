# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-emulator-manager.ps1
#
# Full em-cli surface for Tizen emulator VMs: create, delete, launch, inspect,
# modify, reset, and image capture.
# em-cli is located at {TIZEN_SDK_PATH}\tools\emulator\bin\em-cli
#
# Usage:
#   .\tizen-emulator-manager.ps1 -Action <action> [options]
#
# Options:
#   -Action              create (default), delete, launch, list-vm, list-platform,
#                        list-template, detail, modify, reset, create-image
#   -VmName              Emulator VM name
#   -Platform            Platform image name (auto-detect if omitted for create)
#   -Template            Template name - this is what selects the screen resolution
#   -Profile             Profile: tizen (default) or tv (Samsung TV)
#   -Launch              Launch the VM after creating (create action only)
#   -Skin                Skin style number: 1 (general-purpose) or 2 (profile-specific)
#   -RamSize             RAM size in MiB: 512, 768, or 1024
#   -FileSharingPath     Shared directory between the host and the VM
#   -HwVirtualization    CPU (hardware) virtualization: yes or no
#   -HwGlAcceleration    Hardware GL acceleration: yes or no
#   -CustomPath          Custom base disk image path (create only)
#   -RawImagePath        Directory holding raw disk images (create only)
#   -OutputDir           Output directory for create-image
#   -Compress            Compress the created image (create-image only)
#   -Detail              Detail mode for the list-* actions
#   -Count               Print only the VM count (list-vm only)
#   -Timeout             Seconds to wait for the emulator to connect on launch (default 300)
#   -EmulatorPath        Directory of the emulator program (launch only)
#
# Environment tuning:
#   TIZEN_EMULATOR_DELETE_POLL_ATTEMPTS     Deletion-verify polls (default 20)
#   TIZEN_EMULATOR_DELETE_POLL_INTERVAL_MS  Milliseconds between polls (default 500)
#     Together these cap the post-delete wait - 20 x 500ms = 10s by default.
#     Raise the attempt count on a slow disk where cleanup takes longer.
#   TIZEN_EMCLI_GATE  on (default) fails a create fast when the create's first
#     em-cli call (the list-vm "already exists" check) shows a
#     NoSuchFieldError/NoSuchMethodError version mismatch (emits EMCLI_MISMATCH=1
#     and exits before any VM is created); off skips the gate and lets the
#     create proceed warn-only. There is no separate pre-action probe: it cost
#     every action an extra JVM start (issue #48).
#
# Machine-readable output lines (stdout; all logging goes through Write-Info/Err):
#   VM_LIST=<csv>              VM_COUNT=<n>
#   PLATFORM_LIST=<csv>        TEMPLATE_LIST=<csv>
#   VM_CREATED=<name>          VM_DELETED=<name>
#   VM_MODIFIED=<name>         VM_RESET=<name>
#   VM_LAUNCHED=<serial>       DEVICE_SERIAL=<serial>
#   IMAGE_CREATED=<path>       TEMPLATE_FALLBACK=<template>
#   TEMPLATE_DETAIL=<name>|<profile>|<resolution>|<ram>
#   VM_DETAIL=<name>|<platform>|<template>|<resolution>|<ram>|<cpu_arch>|<cpu_count>|<type>|<skin_path>
#   PLATFORM_DETAIL=<name>|<profile>|<version>|<cpu_arch>|<skin_shape>|<image_path>
#   MANAGER_DETAIL=<key>|<value>
#   EMCLI_MISMATCH=1           The create's first em-cli call crashed with a
#                              NoSuchFieldError/NoSuchMethodError - an
#                              emulator-manager core vs platform emulator plugin
#                              VERSION MISMATCH - so a create was refused before
#                              touching any VM (gate: TIZEN_EMCLI_GATE; parsed by
#                              lib/core/emulator.js createEmulator, which returns
#                              a package_version_mismatch envelope pointing at
#                              tizen-update-package).
#   SDB_SERVER_RESTARTED=1     The sdb wait timed out, the sdb server was
#                              bounced (kill-server/start-server), and the
#                              emulator appeared only then (see
#                              Retry-SerialAfterSdbRestart; surfaced as a
#                              warning by lib/core/emulator.js launchEmulator).
#
# Resolution is a property of the device template - em-cli create has no
# width/height flag - so selecting a size means selecting a template. The caller
# (lib/core/emulator.js) resolves a requested size to a template name and passes
# it in with -Template.
#
# em-cli quirk that shapes this script: `detail -n <missing-vm>` prints
# "Error: ... does not match any VM" on stdout and STILL EXITS 0. Exit status is
# therefore not trustworthy for the read-only actions - every one of them runs
# its output through Test-EmCliFailed to look for a leading "Error:" line.
#
# This file must stay behaviourally 1:1 with tizen-emulator-manager.sh - same
# actions, same flags, same machine-readable output lines.

param(
    [ValidateSet("create", "delete", "launch", "list-vm", "list-platform",
                 "list-template", "detail", "modify", "reset", "create-image",
                 "fix-homescreen")]
    [string]$Action = "create",
    [string]$VmName = "",
    [string]$Platform = "",
    [string]$Template = "",
    [ValidateSet("tizen", "tv")]
    [string]$Profile = "tizen",
    [switch]$Launch,
    [ValidateSet("", "1", "2")]
    [string]$Skin = "",
    [ValidateSet("", "512", "768", "1024")]
    [string]$RamSize = "",
    [string]$FileSharingPath = "",
    [ValidateSet("", "yes", "no")]
    [string]$HwVirtualization = "",
    [ValidateSet("", "yes", "no")]
    [string]$HwGlAcceleration = "",
    [string]$CustomPath = "",
    [string]$RawImagePath = "",
    [string]$OutputDir = "",
    [switch]$Compress,
    [switch]$Detail,
    [switch]$Count,
    [int]$Timeout = 300,
    [string]$EmulatorPath = ""
)

$ErrorActionPreference = "Continue"

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

if ($VmName -and $VmName -notmatch '^[A-Za-z0-9._-]+$') {
    Write-Err "Invalid VM name: $VmName. Use only letters, digits, dot, underscore, hyphen."
    exit 1
}

# (Find-EmCli — em-cli.bat lookup via Get-SdkPath — comes from lib\common.ps1)

# ---------------------------------------------------------------------------
# Find sdb
# ---------------------------------------------------------------------------
$sdb = Find-TizenTool "sdb"

# ---------------------------------------------------------------------------
# Find em-cli
# ---------------------------------------------------------------------------
Write-Info "Looking for em-cli..."
$emcli = Find-EmCli
if (-not $emcli) {
    Write-Err "em-cli not found. Ensure the Tizen SDK is installed with the emulator package."
    Write-Err "em-cli should be at {TIZEN_SDK_PATH}\tools\emulator\bin\em-cli"
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

    $javaExe = @(
        "$sdkRoot\jdk\bin\java.exe",
        "$env:USERPROFILE\tizen-sdk\jdk\bin\java.exe",
        "C:\tizen-sdk\jdk\bin\java.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $javaExe) { $javaExe = "java" }

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
    # Open the process handle BEFORE waiting. A Process object from -PassThru
    # (without -Wait) only reports ExitCode when its handle was opened while the
    # process was still alive; otherwise ExitCode is $null after WaitForExit, and
    # `$null -ne 0` sent every HEALTHY list-template/list-vm down the failure
    # branch on Windows (issue #82 follow-up).
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
            # The handle trick did not take (old .NET). Never read "unknown" as a
            # failure: infer from what the JVM wrote - a crash always leaves a
            # stack trace on stderr, a clean run leaves it empty.
            if ("$stderr" -match 'Exception|Error') { $rc = 1 } else { $rc = 0 }
            [Console]::Error.WriteLine("[WARN] em-cli '$($ArgList[0])': exit code not reported by the host, inferred $rc from its output.")
        }
    }
    $global:LASTEXITCODE = $rc

    # Return em-cli's output through the PIPELINE, one string per line, so the
    # callers' `$raw = Invoke-EmCli ... 2>&1` captures it. [Console]::Out.Write
    # bypassed the pipeline: every caller saw an empty result - list-vm read as
    # "no VMs", list-template as "em-cli produced no output at all" - even though
    # the text was visible in the runner's log (issue #82 follow-up). stdout is
    # always returned; stderr only on failure (the Java stack trace IS the
    # diagnostic Report-EmCliFailure fences), otherwise it goes to the error
    # console so a JVM warning never parses as a VM or template name.
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
# em-cli failure diagnosis (Java/JNA vs version mismatch) - 1:1 with the .sh
# ---------------------------------------------------------------------------
# Called with the captured output of the em-cli call that ACTUALLY failed. There
# is deliberately no separate pre-action probe (issue #48): every action already
# runs em-cli at least once, and the old unconditional `list-vm` probe cost each
# runner call a whole extra JVM start - on a slow Windows host that alone pushed
# a plain list-vm past Codex CLI's 30 s per-call window, so the caller saw only
# the progress header and no envelope.
#
# When em-cli is broken, the Java stack trace in that output is the only real
# diagnostic, and it must land in the captured output - a remote MCP client only
# ever sees what reaches the error payload (issue #40).
function Report-EmCliFailure {
    param([string]$What, [string]$Output, [string]$Rc = "")

    # The warning must not itself say "JNA": lib/core/emulator.js matches
    # JAVA_JNA_PATTERN against the captured output, and the old wording turned
    # EVERY em-cli failure into "crashed with a Java/JNA dependency error" (issue
    # #82). The raw em-cli output goes between EMCLI_OUTPUT_BEGIN/END markers so
    # the JS side classifies only what em-cli said, never these diagnostics.
    if (-not $Rc -and $null -ne $LASTEXITCODE) { $Rc = "$LASTEXITCODE" }
    $suffix = if ($Rc) { " (exit $Rc)" } else { "" }
    Write-Warn "em-cli failed on '$What'$suffix."
    if ($Rc) { Write-Host "EMCLI_EXIT=$Rc" }
    if (-not ($Output -replace '\s', '')) {
        Write-Warn "em-cli produced no output at all - it was blocked before it could run (a sandbox or"
        Write-Warn "permission policy; under Codex CLI re-run with escalated permissions), or the JVM could not start."
    }
    [Console]::Error.WriteLine("EMCLI_OUTPUT_BEGIN")
    @($Output -split "`r?`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 10) | ForEach-Object {
        [Console]::Error.WriteLine($_)
    }
    [Console]::Error.WriteLine("EMCLI_OUTPUT_END")
    # Branch on the output instead of printing both guidance texts: the
    # warnings land in the captured output, and an unconditional mention of
    # NoSuchFieldError would trip JAVA_VERSION_MISMATCH_PATTERN in
    # lib/core/emulator.js on runs whose real failure is something else.
    if ($Output -match 'NoSuchFieldError|NoSuchMethodError') {
        Write-Warn "'NoSuchFieldError'/'NoSuchMethodError' means the emulator-manager core and the"
        Write-Warn "platform's emulator plugin are at mismatched versions - update the SDK"
        Write-Warn "packages (tizen-update-package)."
        # A create against a mismatched em-cli crashes mid-way (real case:
        # java.lang.NoSuchFieldError: isVirgl on tizen-11.0) and then needs a
        # noisy partial-VM cleanup - fail fast before any VM is touched. Create
        # only: the other actions keep the warn-only behaviour and fail
        # naturally with the real trace in the captured output. Write-Host, not
        # Write-Output: this runs inside Get-VmList's pipeline, and the machine
        # line must reach stdout, not the caller's variable.
        if ($Action -eq "create" -and $env:TIZEN_EMCLI_GATE -ne "off") {
            Write-Host "EMCLI_MISMATCH=1"
            Write-Err "Refusing to create a VM: em-cli is already failing with a version mismatch,"
            Write-Err "so the create would crash mid-way and leave a partial VM behind."
            Write-Err "Fix on the SDK host: update the SDK packages (tizen-update-package), then retry"
            Write-Err "this create. Set TIZEN_EMCLI_GATE=off to bypass this gate."
            exit 1
        }
    } else {
        # Wording deliberately avoids the JAVA_JNA_PATTERN tokens: only em-cli's
        # own lines may trigger that hint.
        Write-Warn "If the em-cli output above is a Java stack trace about a missing native bridge or class,"
        Write-Warn "the SDK's emulator Java runtime is broken - reinstall the emulator package"
        Write-Warn "(download-emulator-package) and verify the SDK's bundled JRE runs."
    }
}

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

# em-cli reports "Error: <thing> does not match any VM" on stdout and exits 0,
# so the only reliable failure signal for read-only actions is the text itself.
function Test-EmCliFailed {
    param([object]$Output)
    return [bool](@($Output | Where-Object { $_ -is [string] -and $_ -match '^Error:' }).Count)
}

function ConvertTo-VmNames {
    param($Raw)
    $lines = $Raw | Where-Object {
        $_ -is [string] -and $_.Trim() -ne '' -and $_ -notmatch 'VM list is empty' -and $_ -notmatch '^\[' -and $_ -notmatch '^Error:'
    }
    return @($lines | ForEach-Object { ($_ -split '\s+')[0] })
}

# The list-vm every VM-touching action already makes doubles as the em-cli
# health check (issue #48 - no separate probe): a non-zero exit is diagnosed by
# Report-EmCliFailure (warn-only, except the create-time version-mismatch gate)
# and reads as "no VMs listed", so the action itself still fails naturally with
# the real trace in the captured output.
function Get-VmList {
    $raw = Invoke-EmCli "list-vm" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Report-EmCliFailure "list-vm" ($raw | Out-String)
        return @()
    }
    return ConvertTo-VmNames $raw
}

# Deletion-verify polling budget: 20 x 500ms = 10s by default. Raise the attempt
# count on a slow disk where em-cli's async file cleanup takes longer.
$DeletePollAttempts = if ($env:TIZEN_EMULATOR_DELETE_POLL_ATTEMPTS) {
    [int]$env:TIZEN_EMULATOR_DELETE_POLL_ATTEMPTS
} else { 20 }
$DeletePollIntervalMs = if ($env:TIZEN_EMULATOR_DELETE_POLL_INTERVAL_MS) {
    [int]$env:TIZEN_EMULATOR_DELETE_POLL_INTERVAL_MS
} else { 500 }

# Wait for a just-deleted VM to actually disappear from em-cli's list.
#
# em-cli delete returns as soon as the database row is gone, but file-level
# cleanup (QEMU termination, disk image removal) continues asynchronously. An
# immediate re-create races that cleanup and fails with "VM already exists", so
# every caller that deletes-then-retries has to wait for the VM to truly vanish.
#
# Returns 0 when the VM is gone, 1 when it is still listed after every attempt,
# and 2 when list-vm could not be read (Java/JNA) so the deletion could not be
# confirmed either way. 1:1 with wait_for_vm_gone() in the .sh.
function Wait-VmGone {
    param([string]$Target)

    $attempt = 0
    while ($true) {
        $raw = Invoke-EmCli "list-vm" 2>$null
        $listOk = ($LASTEXITCODE -eq 0)
        if ($listOk -and ((ConvertTo-VmNames $raw) -notcontains $Target)) {
            return 0
        }
        $attempt++
        if ($attempt -ge $DeletePollAttempts) {
            if ($listOk) { return 1 }
            return 2
        }
        Start-Sleep -Milliseconds $DeletePollIntervalMs
    }
}

# Parse em-cli's -d block format into one pipe-delimited line per record.
#
#   <header>                        <- unindented, starts a record
#     Resolution        : 1920x1080 <- indented "Key : Value"
#     Skin Path         : /very/long/path/that/em-cli/wraps/at/eighty/col
#                       umns-like-this   <- continuation, no colon
#
# Emits "<Prefix>=<header>|<field1>|<field2>|..." per record.
function Parse-DetailBlocks {
    param(
        [object]$Raw,
        [string]$Prefix,
        [string[]]$Fields
    )

    $out = New-Object System.Collections.Generic.List[string]
    $header = ""
    $values = @{}
    $lastKey = ""

    function Add-Record {
        if ($header -eq "") { return }
        $parts = @($header)
        foreach ($f in $Fields) {
            $v = $values[$f]
            if ($null -eq $v) { $v = "" }
            # em-cli brackets some paths; the brackets are noise to the caller
            if ($v -match '^\[.*\]$') { $v = $v.Substring(1, $v.Length - 2) }
            $parts += $v
        }
        $out.Add("$Prefix=" + ($parts -join "|"))
    }

    foreach ($line in @($Raw | Where-Object { $_ -is [string] })) {
        if ($line.Trim() -eq '') { continue }

        if ($line -notmatch '^\s') {
            Add-Record
            $header = $line.TrimEnd()
            # em-cli prints its errors unindented too - an error must not become
            # a bogus record.
            if ($header -match '^Error:') { $header = "" }
            $values = @{}
            $lastKey = ""
            continue
        }

        # A key line has whitespace immediately before its colon ("Skin Path  : x").
        # A wrapped continuation never does, so a Windows path value like
        # "C:\foo" is still correctly treated as continuation, not as a new key.
        if ($line -match '^\s+([^:]+?)\s+:\s?(.*)$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim() -replace '\|', ' '
            $values[$key] = $val
            $lastKey = $key
        } elseif ($lastKey -ne "") {
            $cont = $line.Trim() -replace '\|', ' '
            $values[$lastKey] = "$($values[$lastKey])$cont"
        }
    }
    Add-Record

    return $out
}

$VM_DETAIL_FIELDS = @("Platform", "Template", "Resolution", "RAM Size", "CPU Arch", "CPU count", "Type", "Skin Path")

function Assert-VmName {
    if (-not $VmName) {
        Write-Err "VM name is required for the $Action action. Use -VmName <name>."
        exit 1
    }
}

function Assert-VmExists {
    $vms = Get-VmList
    if ($vms -notcontains $VmName) {
        Write-Err "VM '$VmName' not found."
        Write-Err "Available VMs: $($vms -join ' ')"
        exit 1
    }
}

# Last-chance rescue for a connect timeout: the sdb host server can wedge
# (stale socket, half-dead daemon) so a fully booted emulator never shows up
# in `sdb devices`. Bounce the server once and re-poll briefly before failing.
# Returns the new serial (and prints SDB_SERVER_RESTARTED=1 for the JS side,
# which turns it into a warning: the restart also reset any other sdb
# connections), or $null so the caller falls through to its existing failure
# handling. Mirrors retry_serial_after_sdb_restart in tizen-emulator-manager.sh.
function Retry-SerialAfterSdbRestart {
    param([string[]]$PreviousSerials)
    Write-Warn "sdb never reported the emulator - the sdb server may be wedged. Restarting it and re-polling for up to 30s..."
    & $sdb kill-server 2>$null | Out-Null
    & $sdb start-server 2>$null | Out-Null
    Start-Sleep -Seconds 3
    $elapsed = 0
    while ($elapsed -lt 30) {
        $devRaw = & $sdb devices 2>&1
        $devLines = $devRaw | Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }
        foreach ($line in $devLines) {
            $s = ($line -split '\s+')[0]
            if ($s -and ($PreviousSerials -notcontains $s)) {
                Write-Success "Emulator connected after sdb server restart: $s"
                Write-Host "SDB_SERVER_RESTARTED=1"
                return $s
            }
        }
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    Write-Warn "sdb server restart did not surface the emulator either."
    return $null
}

# ---------------------------------------------------------------------------
# Action: list-platform
# ---------------------------------------------------------------------------
if ($Action -eq "list-platform") {
    Write-Info "Listing available emulator platforms (profile: $Profile)..."

    # 2>&1 + exit code, not 2>$null: a broken em-cli must fail with its trace, not
    # read as "no platforms" (issue #41), and that trace is also the health check
    # that used to be a separate probe (issue #48).
    if ($Detail) {
        $raw = Invoke-EmCli "list-platform", "-d" 2>&1
        if ($LASTEXITCODE -ne 0) { Report-EmCliFailure "list-platform -d" ($raw | Out-String); exit 1 }
        $details = Parse-DetailBlocks -Raw $raw -Prefix "PLATFORM_DETAIL" `
            -Fields @("Profile", "Version", "CPU Arch", "Skin shape", "Image path")
        # Filter by em-cli's own Profile field rather than by a name prefix
        $details = @($details | Where-Object { ($_ -split '\|')[1] -eq $Profile })
        $platforms = @($details | ForEach-Object { ($_ -replace '^PLATFORM_DETAIL=', '') -replace '\|.*$', '' } | Select-Object -Unique)
    } else {
        $platformRaw = Invoke-EmCli "list-platform" 2>&1
        if ($LASTEXITCODE -ne 0) { Report-EmCliFailure "list-platform" ($platformRaw | Out-String); exit 1 }
        $allPlatforms = @($platformRaw | Where-Object { $_ -is [string] -and $_.Trim() -ne '' -and $_ -notmatch '^Error:' } | ForEach-Object { ($_ -split '\s+')[0] })
        if ($Profile -eq "tv") {
            $platforms = @($allPlatforms | Where-Object { $_ -match '^tv' })
        } else {
            $platforms = @($allPlatforms | Where-Object { $_ -notmatch '^tv' })
        }
        $details = @()
    }

    if ($platforms.Count -eq 0) {
        Write-Warn "No emulator platforms found for profile '$Profile'."
        Write-Host "PLATFORM_LIST="
        Write-Host "PROFILE=$Profile"
        exit 0
    }
    $platformCsv = $platforms -join ","
    Write-Success "Found platforms ($Profile): $platformCsv"
    Write-Host "PLATFORM_LIST=$platformCsv"
    Write-Host "PROFILE=$Profile"
    $details | ForEach-Object { Write-Host $_ }
    exit 0
}

# ---------------------------------------------------------------------------
# Action: list-template
# ---------------------------------------------------------------------------
if ($Action -eq "list-template") {
    Write-Info "Listing available templates..."
    # Always use -d: each template's resolution comes back too, and resolution is
    # what lets the caller offer real screen sizes. Filter by platform when given,
    # otherwise by profile.
    if ($Platform) {
        $templateRaw = Invoke-EmCli "list-template", "-p", $Platform, "-d" 2>&1
    } else {
        $templateRaw = Invoke-EmCli "list-template", "-P", $Profile, "-d" 2>&1
    }
    if ($LASTEXITCODE -ne 0) { Report-EmCliFailure "list-template" ($templateRaw | Out-String); exit 1 }

    # Duplicate names are emitted as-is (em-cli repeats some templates); the
    # caller dedupes. TEMPLATE_DETAIL's field order is a back-compat contract.
    $details = Parse-DetailBlocks -Raw $templateRaw -Prefix "TEMPLATE_DETAIL" `
        -Fields @("Profile", "Resolution", "RAM Size")

    if ($details.Count -eq 0) {
        Write-Warn "No templates found."
        Write-Host "TEMPLATE_LIST="
        exit 0
    }

    # TEMPLATE_LIST= stays for back-compat: CSV of names (may contain spaces).
    $names = @($details | ForEach-Object { ($_ -replace '^TEMPLATE_DETAIL=', '') -replace '\|.*$', '' } | Select-Object -Unique)
    $templateCsv = $names -join ","
    Write-Success "Found templates: $templateCsv"
    Write-Host "TEMPLATE_LIST=$templateCsv"
    $details | ForEach-Object { Write-Host $_ }
    exit 0
}

# ---------------------------------------------------------------------------
# Action: list-vm
# ---------------------------------------------------------------------------
if ($Action -eq "list-vm") {
    Write-Info "Listing existing emulator VMs..."

    # em-cli ignores -d when -c is given, so mirror that precedence here.
    # A broken em-cli (JNA/JDK/wrong SDK root) must NOT read as "no VMs": check
    # the exit code and fail with the trace, so the envelope carries the cause
    # instead of a success with vms: [] (issue #41).
    if ($Count) {
        $countRaw = Invoke-EmCli "list-vm", "-c" 2>&1
        $countRc = $LASTEXITCODE
        if ($countRc -ne 0) {
            Write-Err "em-cli list-vm -c failed (exit $countRc) - cannot count VMs."
            @($countRaw | ForEach-Object { "$_" } | Select-Object -Last 20) | ForEach-Object { [Console]::Error.WriteLine("  $_") }
            exit 1
        }
        $vmCount = @($countRaw | Where-Object { $_ -is [string] -and $_.Trim() -match '^\d+$' } | Select-Object -First 1)
        if (-not $vmCount) { $vmCount = 0 } else { $vmCount = $vmCount[0].Trim() }
        Write-Success "VM count: $vmCount"
        Write-Host "VM_COUNT=$vmCount"
        exit 0
    }

    $listRaw = Invoke-EmCli "list-vm" 2>&1
    $listRc = $LASTEXITCODE
    if ($listRc -ne 0) {
        Write-Err "em-cli list-vm failed (exit $listRc) - cannot tell whether any VMs exist."
        @($listRaw | ForEach-Object { "$_" } | Select-Object -Last 20) | ForEach-Object { [Console]::Error.WriteLine("  $_") }
        Report-EmCliFailure "list-vm" ($listRaw | Out-String)
        exit 1
    }
    $vmNames = ConvertTo-VmNames $listRaw
    if ($vmNames.Count -eq 0) {
        Write-Info "No emulator VMs found."
        Write-Host "VM_LIST="
        Write-Host "VM_COUNT=0"
        exit 0
    }
    $vmCsv = $vmNames -join ","
    Write-Success "Found VMs: $vmCsv"
    Write-Host "VM_LIST=$vmCsv"
    Write-Host "VM_COUNT=$($vmNames.Count)"

    if ($Detail) {
        $detailRaw = Invoke-EmCli "list-vm", "-d" 2>$null
        $details = Parse-DetailBlocks -Raw $detailRaw -Prefix "VM_DETAIL" -Fields $VM_DETAIL_FIELDS
        # -Platform narrows the list; em-cli's own flag does not combine with -d,
        # so filter the parsed records instead.
        if ($Platform) {
            $details = @($details | Where-Object { ($_ -split '\|')[1] -eq $Platform })
        }
        $details | ForEach-Object { Write-Host $_ }
    }
    exit 0
}

# ---------------------------------------------------------------------------
# Action: detail
# ---------------------------------------------------------------------------
if ($Action -eq "detail") {
    if (-not $VmName) {
        Write-Info "Printing emulator manager information..."
        $raw = Invoke-EmCli "detail" 2>&1
        if ($LASTEXITCODE -ne 0) { Report-EmCliFailure "detail" ($raw | Out-String); exit 1 }
        if (Test-EmCliFailed $raw) {
            Write-Err "em-cli detail failed: $(@($raw | Select-Object -First 3) -join ' ')"
            exit 1
        }
        # The manager block has a single "Emulator Manager" header, so emit plain
        # key/value pairs rather than one record line.
        $lastKey = ""
        foreach ($line in @($raw | Where-Object { $_ -is [string] })) {
            if ($line.Trim() -eq '' -or $line -notmatch '^\s') { continue }
            if ($line -match '^\s+([^:]+?)\s+:\s?(.*)$') {
                $key = $Matches[1].Trim()
                $val = $Matches[2].Trim() -replace '\|', ' '
                Write-Host "MANAGER_DETAIL=$key|$val"
                $lastKey = $key
            } elseif ($lastKey -ne "") {
                $cont = $line.Trim() -replace '\|', ' '
                Write-Host "MANAGER_DETAIL_CONT=$lastKey|$cont"
            }
        }
        Write-Success "Emulator manager information printed."
        exit 0
    }

    Write-Info "Printing details of VM: $VmName"
    $raw = Invoke-EmCli "detail", "-n", $VmName 2>&1
    if ($LASTEXITCODE -ne 0) { Report-EmCliFailure "detail -n $VmName" ($raw | Out-String); exit 1 }
    if (Test-EmCliFailed $raw) {
        Write-Err "VM '$VmName' not found: $(@($raw | Where-Object { $_ -match '^Error:' } | Select-Object -First 1))"
        Write-Err "Available VMs: $((Get-VmList) -join ' ')"
        exit 1
    }
    $details = Parse-DetailBlocks -Raw $raw -Prefix "VM_DETAIL" -Fields $VM_DETAIL_FIELDS
    if ($details.Count -eq 0) {
        Write-Err "em-cli returned no parsable detail block for VM '$VmName'."
        exit 1
    }
    Write-Success "Details of VM '$VmName' retrieved."
    $details | ForEach-Object { Write-Host $_ }
    exit 0
}

# ---------------------------------------------------------------------------
# Action: delete
# ---------------------------------------------------------------------------
if ($Action -eq "delete") {
    Assert-VmName
    Write-Info "Deleting emulator VM: $VmName"
    Invoke-EmCli "delete", "-n", $VmName 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "VM '$VmName' deleted."
        Write-Host "VM_DELETED=$VmName"
        exit 0
    } else {
        Write-Err "Failed to delete VM '$VmName'. It may not exist or may be running."
        Write-Err "Stop it first via Tizen Studio Emulator Manager, then retry."
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Action: modify
# ---------------------------------------------------------------------------
if ($Action -eq "modify") {
    Assert-VmName
    Assert-VmExists

    $modifyArgs = @("modify", "-n", $VmName)
    if ($Template)         { $modifyArgs += @("-t", $Template) }
    if ($Skin)             { $modifyArgs += @("-s", $Skin) }
    if ($RamSize)          { $modifyArgs += @("-r", $RamSize) }
    if ($FileSharingPath)  { $modifyArgs += @("-f", $FileSharingPath) }
    if ($HwVirtualization) { $modifyArgs += @("-w", $HwVirtualization) }
    if ($HwGlAcceleration) { $modifyArgs += @("-g", $HwGlAcceleration) }

    if ($modifyArgs.Count -eq 3) {
        Write-Err "modify needs at least one property to change."
        Write-Err "Pass one or more of: -Template <name> -Skin <1|2> -RamSize <mib> -FileSharingPath <path> -HwVirtualization <yes|no> -HwGlAcceleration <yes|no>"
        exit 1
    }

    Write-Info "Modifying VM '$VmName'..."
    $modifyOut = Invoke-EmCli $modifyArgs 2>&1
    if (Test-EmCliFailed $modifyOut) {
        Write-Err "Failed to modify VM '$VmName': $(@($modifyOut | Where-Object { $_ -match '^Error:' } | Select-Object -First 1))"
        Write-Err "The VM may be running - stop it via Tizen Studio Emulator Manager, then retry."
        exit 1
    }
    Write-Success "VM '$VmName' modified."
    Write-Host "VM_MODIFIED=$VmName"
    # Echo the post-change state so the caller can report what actually took.
    $after = Invoke-EmCli "detail", "-n", $VmName 2>&1
    Parse-DetailBlocks -Raw $after -Prefix "VM_DETAIL" -Fields $VM_DETAIL_FIELDS | ForEach-Object { Write-Host $_ }
    exit 0
}

# ---------------------------------------------------------------------------
# Action: reset
# ---------------------------------------------------------------------------
if ($Action -eq "reset") {
    Assert-VmName
    Assert-VmExists
    # Destructive: formats the VM's disk image and deletes every installed app.
    # The caller (lib/core/emulator.js) gates this behind an explicit confirm flag.
    Write-Warn "Resetting VM '$VmName' - its disk image will be formatted and all installed apps deleted."
    $resetOut = Invoke-EmCli "reset", "-n", $VmName 2>&1
    if (Test-EmCliFailed $resetOut) {
        Write-Err "Failed to reset VM '$VmName': $(@($resetOut | Where-Object { $_ -match '^Error:' } | Select-Object -First 1))"
        Write-Err "The VM may be running - stop it via Tizen Studio Emulator Manager, then retry."
        exit 1
    }
    Write-Success "VM '$VmName' reset."
    Write-Host "VM_RESET=$VmName"
    exit 0
}

# ---------------------------------------------------------------------------
# Action: create-image
# ---------------------------------------------------------------------------
if ($Action -eq "create-image") {
    Assert-VmName
    Assert-VmExists

    $imageArgs = @("create-image", "-n", $VmName)
    if ($OutputDir) { $imageArgs += @("-d", $OutputDir) }
    if ($Compress)  { $imageArgs += "-c" }

    Write-Info "Creating a platform image from VM '$VmName'..."
    $imageOut = Invoke-EmCli $imageArgs 2>&1
    if (Test-EmCliFailed $imageOut) {
        Write-Err "Failed to create an image from VM '$VmName': $(@($imageOut | Where-Object { $_ -match '^Error:' } | Select-Object -First 1))"
        Write-Err "em-cli requires the output directory to already exist - create it first."
        exit 1
    }

    # em-cli prints the destination; fall back to the requested directory.
    $imagePath = @($imageOut |
        Where-Object { $_ -is [string] -and $_ -match '[A-Za-z]:\\[^\s]+|(/[^\s]+)+' } |
        Select-Object -Last 1)
    if ($imagePath) { $imagePath = $imagePath[0].Trim() }
    if (-not $imagePath) {
        if ($OutputDir) { $imagePath = $OutputDir } else { $imagePath = "$env:USERPROFILE\tizen-sdk-data\emulator" }
    }
    Write-Success "Image created: $imagePath"
    Write-Host "IMAGE_CREATED=$imagePath"
    exit 0
}

# ---------------------------------------------------------------------------
# Action: launch
# ---------------------------------------------------------------------------
if ($Action -eq "launch") {
    if (-not $VmName) {
        Write-Info "No VM name specified. Listing available VMs..."
        $vms = Get-VmList
        if ($vms.Count -eq 0) {
            Write-Err "No emulator VMs found. Create one first with the create action."
            Write-Err "Or open Tizen Studio -> Emulator Manager to create one manually."
            exit 1
        }
        $VmName = $vms[0]
        Write-Info "No VM name given - using first VM from list: $VmName"
    }
    Assert-VmExists

    if (-not $sdb) {
        Write-Err "sdb not found. Install the Tizen SDK first (tizen-sdk-install agent)."
        exit 1
    }
    Write-Info "Found sdb: $sdb"

    # Record previous serials so we can detect the NEW emulator
    $previousSerials = @()
    $devRawPre = & $sdb devices 2>&1
    $preLines = $devRawPre | Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }
    foreach ($line in $preLines) {
        $s = ($line -split '\s+')[0]
        if ($s) { $previousSerials += $s }
    }

    # Already running and connected? Report it rather than launching a second time.
    foreach ($line in $preLines) {
        $parts = $line -split '\s+'
        if ($parts.Count -ge 3 -and $parts[2] -eq $VmName) {
            Write-Success "VM '$VmName' is already running and connected: $($parts[0])"
            Write-Host "DEVICE_SERIAL=$($parts[0])"
            exit 0
        }
    }

    $launchArgs = @("launch", "-n", $VmName)
    if ($EmulatorPath) { $launchArgs += @("-p", $EmulatorPath) }

    # Capture the list of running qemu/emulator processes before launch to identify the new one
    # Use broad patterns: qemu process names vary by SDK version and may not include "tizen"
    $prePids = @()
    try {
        # Match any qemu-system, qemu, or emulator process (broad pattern for compatibility)
        $prePids = @(Get-Process | Where-Object { 
            $_.ProcessName -like "*qemu*" -or 
            $_.ProcessName -like "*emulator*" -or
            $_.ProcessName -eq "qemu-system-x86_64"
        } | Select-Object -ExpandProperty Id)
        Write-Info "Pre-launch QEMU PIDs: $($prePids -join ', ')"
    } catch {
        Write-Info "Could not capture pre-launch PIDs (this is OK)"
    }

    Write-Info "Launching emulator VM: $VmName"
    # em-cli launch shares the detail/modify quirk: "Error: Failed to start
    # this VM." goes to stdout with exit 0, so the text is the only reliable
    # failure signal - trusting the exit code alone burns the full wait below.
    $launchOut = Invoke-EmCli $launchArgs 2>&1
    if ($launchOut) { $launchOut | ForEach-Object { Write-Host $_ } }
    if ($LASTEXITCODE -ne 0 -or (Test-EmCliFailed $launchOut)) {
        Write-Err "Failed to launch emulator VM '$VmName'."
        Write-Err "Check if the VM is already running, or launch it manually via Tizen Studio."
        exit 1
    }
    Write-Success "Emulator launch command sent."

    # Capture the new emulator PID by comparing with pre-launch PIDs
    # Wait for QEMU process to fully start (may take several seconds)
    Start-Sleep -Seconds 5
    
    # Log all processes for debugging
    try {
        $allProcs = Get-Process | Where-Object { 
            $_.ProcessName -like "*qemu*" -or 
            $_.ProcessName -like "*emulator*" -or
            $_.ProcessName -like "*tizen*" -or
            $_.ProcessName -eq "qemu-system-x86_64"
        } | Select-Object Id, ProcessName, Path
        Write-Info "All matching processes found: $($allProcs.Count)"
        foreach ($p in $allProcs) {
            Write-Info "  PID $($p.Id): $($p.ProcessName) - $($p.Path)"
        }
    } catch {
        Write-Info "Could not enumerate processes"
    }
    
    $emulatorPid = $null
    try {
        # Find NEW qemu process that wasn't running before launch
        $postPids = @(Get-Process | Where-Object { 
            $_.ProcessName -like "*qemu*" -or 
            $_.ProcessName -like "*emulator*" -or
            $_.ProcessName -eq "qemu-system-x86_64"
        } | Select-Object -ExpandProperty Id)
        Write-Info "Post-launch QEMU PIDs: $($postPids -join ', ')"
        foreach ($newPid in $postPids) {
            if ($prePids -notcontains $newPid) {
                $emulatorPid = $newPid
                Write-Info "Found NEW emulator PID by comparison: $emulatorPid"
                break
            }
        }
    } catch {
        Write-Info "Could not capture emulator PID (this is OK)"
    }
    
    # Fallback 1: if still no PID, try to get any qemu process
    if (-not $emulatorPid) {
        try {
            $emulatorPid = @(Get-Process | Where-Object { 
                $_.ProcessName -like "*qemu*" -or 
                $_.ProcessName -eq "qemu-system-x86_64"
            } | Select-Object -ExpandProperty Id)[0]
            if ($emulatorPid) {
                Write-Info "Found QEMU process (fallback 1 - any qemu): $emulatorPid"
            }
        } catch {
            Write-Info "Fallback 1 (any qemu) failed"
        }
    }
    
    # Fallback 2: try matching by VM name in command line arguments
    if (-not $emulatorPid) {
        try {
            $emulatorPid = @(Get-CimInstance Win32_Process | 
                Where-Object { $_.CommandLine -like "*$VmName*" -and $_.CommandLine -like "*emulator*" } |
                Select-Object -ExpandProperty ProcessId)[0]
            if ($emulatorPid) {
                Write-Info "Found QEMU process (fallback 2 - by VM name): $emulatorPid"
            }
        } catch {
            Write-Info "Fallback 2 (VM name match) failed"
        }
    }
    
    # Fallback 3: Look for processes with 'emulator' in path
    if (-not $emulatorPid) {
        try {
            $emulatorPid = @(Get-Process | Where-Object { 
                $_.Path -like "*emulator*" -and $_.ProcessName -notlike "*emulator-manager*"
            } | Select-Object -ExpandProperty Id)[0]
            if ($emulatorPid) {
                Write-Info "Found QEMU process (fallback 3 - by path): $emulatorPid"
            }
        } catch {
            Write-Info "Fallback 3 (path match) failed"
        }
    }

    # No further fallbacks: better to report no PID than an arbitrary wrong one.
    # The else branch below logs that the PID could not be determined.

    # Store the PID in a file for later retrieval by device-manager stop action
    if ($emulatorPid) {
        $pidFile = Join-Path $env:TEMP "tizen-emulator-$VmName.pid"
        try {
            "$emulatorPid" | Out-File -FilePath $pidFile -Encoding ASCII -Force
            Write-Info "Emulator PID ($emulatorPid) stored in $pidFile"
            Write-Host "EMULATOR_PID=$emulatorPid"
        } catch {
            Write-Warn "Could not write PID file: $_"
        }
    } else {
        Write-Warn "Could not determine emulator PID - stop action may need manual intervention"
    }

    Write-Info "Waiting up to ${Timeout}s for emulator to connect to sdb..."
    $elapsed = 0
    $interval = 3
    while ($elapsed -lt $Timeout) {
        $devRaw = & $sdb devices 2>&1
        $devLines = $devRaw | Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }
        if ($devLines) {
            foreach ($line in $devLines) {
                $s = ($line -split '\s+')[0]
                if ($s -and ($previousSerials -notcontains $s)) {
                    Write-Success "Emulator connected: $s"
                    Write-Host "DEVICE_SERIAL=$s"
                    exit 0
                }
            }
            if ($previousSerials.Count -eq 0) {
                $serial = ($devLines | Select-Object -First 1) -split '\s+' | Select-Object -First 1
                Write-Success "Emulator connected: $serial"
                Write-Host "DEVICE_SERIAL=$serial"
                exit 0
            }
        }
        Start-Sleep -Seconds $interval
        $elapsed += $interval
        Write-Info "Still waiting... (${elapsed}s / ${Timeout}s)"
    }
    # Timed out - bounce a possibly wedged sdb server and re-poll once before failing.
    $rescued = Retry-SerialAfterSdbRestart -PreviousSerials $previousSerials
    if ($rescued) {
        Write-Host "DEVICE_SERIAL=$rescued"
        exit 0
    }
    Write-Err "Emulator did not connect within ${Timeout}s."
    Write-Err "Check Tizen Emulator Manager or try increasing the timeout with -Timeout <seconds>."
    exit 1
}

# ---------------------------------------------------------------------------
# Action: create
# ---------------------------------------------------------------------------
if ($Action -eq "create") {
    Assert-VmName

    # Check if VM already exists
    $existingVms = Get-VmList
    if ($existingVms -contains $VmName) {
        Write-Err "VM '$VmName' already exists. Use a different name or delete it first:"
        Write-Err "  em-cli delete -n $VmName"
        exit 1
    }

    # Track whether a template was provided. The caller (emulator.js) resolves the
    # requested screen size to a template name, so anything arriving in -Template is
    # a deliberate choice and is passed through to em-cli.
    $TemplateExplicit = [bool]$Template

    # Auto-detect platform if not provided
    if (-not $Platform) {
        Write-Info "Auto-detecting platform for profile: $Profile..."
        $platformRaw = Invoke-EmCli "list-platform" 2>$null
        $platforms = @($platformRaw | Where-Object { $_ -is [string] -and $_.Trim() -ne '' -and $_ -notmatch '^Error:' })

        if ($Profile -eq "tv") {
            $Platform = $platforms | Where-Object { $_ -match '^tv' } | Select-Object -First 1
            if (-not $Platform) {
                Write-Err "No TV emulator platform image is installed - cannot create a TV VM."
                Write-Err "Install the TV SDK extension with tizen-tv-sdk-install, or via"
                Write-Err "Tizen Studio -> Package Manager -> TV Extensions, then re-run."
                exit 1
            }
        } else {
            $Platform = $platforms | Where-Object { $_ -notmatch '^tv' } | Select-Object -First 1
            if (-not $Platform) { $Platform = $platforms | Select-Object -First 1 }
            if (-not $Platform) { $Platform = "tizen-10.0-x86_64" }
        }
    }
    Write-Info "Using platform: $Platform"

    # Pre-check: qemu-img is required for VM creation
    $qemuImg = Join-Path $emcliDir "qemu-img.exe"
    if (-not (Test-Path $qemuImg)) {
        Write-Err "qemu-img.exe not found at $qemuImg"
        Write-Err "The Emulator QEMU package is not installed."
        Write-Err ""
        Write-Err "Fix options:"
        Write-Err "  1. Open Tizen Studio -> Package Manager -> install 'Emulator' package"
        Write-Err "  2. Re-run tizen-sdk-install to install missing packages"
        Write-Err "  3. After installing, re-run this script"
        exit 1
    }

    # Assemble the optional hardware/skin arguments once - they apply to every
    # create attempt, including the TV fallback retry.
    $extraArgs = @()
    if ($Skin)             { $extraArgs += @("-s", $Skin) }
    if ($RamSize)          { $extraArgs += @("-r", $RamSize) }
    if ($FileSharingPath)  { $extraArgs += @("-f", $FileSharingPath) }
    if ($HwVirtualization) { $extraArgs += @("-w", $HwVirtualization) }
    if ($HwGlAcceleration) { $extraArgs += @("-g", $HwGlAcceleration) }
    if ($CustomPath)       { $extraArgs += @("-c", $CustomPath) }
    if ($RawImagePath)     { $extraArgs += @("-a", $RawImagePath) }

    # em-cli create with -a (raw image path) prompts for confirmation ("y").
    # Pipe "y" to stdin so the command does not hang waiting for user input.
    $createStdin = ""
    if ($RawImagePath) {
        $createStdin = "y"
        Write-Info "Using raw disk image path: $RawImagePath (confirmation will be auto-answered)"
    }


    # Delete the partial VM so a retry does not hit "VM already exists", verify the
    # deletion with a sync check, then exit 1 with phase-specific guidance.
    # 1:1 with cleanup_and_fail() in the .sh - same phases, same messages.
    function Invoke-CleanupAndFail {
        param([string]$ErrorPhase)

        Write-Err "Cleaning up partial VM..."
        Invoke-EmCli "delete", "-n", $VmName 2>$null

        $verifyRc = Wait-VmGone $VmName
        switch ($verifyRc) {
            0 { Write-Success "Partial VM deleted successfully." }
            2 {
                # em-cli itself is broken (Java/JNA), so "not in the list" cannot be
                # trusted either way. Say so instead of claiming a clean cleanup.
                Write-Err "Could not confirm cleanup: em-cli list-vm did not respond."
                Write-Err "Check for a leftover VM once em-cli works: em-cli list-vm"
            }
            default {
                Write-Err "WARNING: Partial VM '$VmName' still exists after cleanup attempt."
                Write-Err "Manual cleanup required: em-cli delete -n `"$VmName`""
            }
        }

        # Context-aware guidance based on which phase failed
        if ($ErrorPhase -eq "with_template") {
            Write-Err "Creation failed with template '$Template'. This may be a temporary issue."
            Write-Err "Options:"
            Write-Err "  1. Retry creation: em-cli create -n `"$VmName`" -p `"$Platform`" -t `"$Template`""
            Write-Err "  2. Create without template: em-cli create -n `"$VmName`" -p `"$Platform`""
            Write-Err "  3. Use Tizen Studio -> Emulator Manager to create manually."
        } elseif ($ErrorPhase -eq "without_template") {
            Write-Err "Even creation without template failed. This suggests a deeper issue:"
            Write-Err "  - Is platform '$Platform' installed? Check: em-cli list-platform"
            Write-Err "  - Is em-cli responsive? Try: em-cli list-vm"
            Write-Err "  - Use Tizen Studio -> Emulator Manager to diagnose."
        }

        exit 1
    }

    # Create VM
    # Only pass -t (template) to em-cli when a template was provided. The template is
    # what selects the screen resolution - em-cli create has no width/height flag - so
    # it is passed for every profile, TV included.
    if ($TemplateExplicit) {
        Write-Info "Creating VM '$VmName' on platform '$Platform' with template '$Template'..."
        Invoke-EmCli (@("create", "-n", $VmName, "-p", $Platform, "-t", $Template) + $extraArgs) -Stdin $createStdin 2>$null

        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to create emulator VM '$VmName' on platform '$Platform' with template '$Template'."

            # TV fallback: em-cli has historically hit Java/JNA errors when -t is passed
            # for a TV profile. Rather than fail outright, drop the template and retry once
            # so the user still gets a VM - at em-cli's own default size, with a warning.
            if ($Profile -ne "tv") {
                Invoke-CleanupAndFail "with_template"
            }
            Write-Warn "Retrying without -t (TV profile). The requested size may not be applied."

            # Delete the partial VM and wait for the async cleanup window to close
            # before recreating, otherwise the retry hits "VM already exists".
            Invoke-EmCli "delete", "-n", $VmName 2>$null
            $fallbackVerifyRc = Wait-VmGone $VmName
            switch ($fallbackVerifyRc) {
                0 { Write-Info "Deletion verified. Retrying create..." }
                2 { Write-Warn "Could not confirm deletion (em-cli list-vm did not respond) - retrying create anyway." }
                default {
                    Write-Warn "VM '$VmName' is still listed after $DeletePollAttempts checks - retrying create anyway."
                    Write-Warn "If the retry reports 'VM already exists', delete it manually: em-cli delete -n `"$VmName`""
                }
            }

            Invoke-EmCli (@("create", "-n", $VmName, "-p", $Platform) + $extraArgs) -Stdin $createStdin 2>$null
            if ($LASTEXITCODE -ne 0) {
                Invoke-CleanupAndFail "without_template"
            }
            Write-Warn "VM '$VmName' created WITHOUT template '$Template' - em-cli chose the size."
            Write-Warn "Apply it later with: em-cli modify -n `"$VmName`" -t `"$Template`""
            Write-Host "TEMPLATE_FALLBACK=$Template"
        }
    } else {
        Write-Info "Creating VM '$VmName' on platform '$Platform'..."
        Invoke-EmCli (@("create", "-n", $VmName, "-p", $Platform) + $extraArgs) -Stdin $createStdin 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to create emulator VM '$VmName' on platform '$Platform'."
            # No template was passed, so the guidance must not talk about one - with
            # $Template empty, the "with_template" phase would suggest -t "".
            Invoke-CleanupAndFail "without_template"
        }
    }
    Write-Success "VM '$VmName' created."
    Write-Host "VM_CREATED=$VmName"

    # Report what the VM actually ended up with, so the caller never has to guess
    # whether the requested size/RAM took effect.
    $after = Invoke-EmCli "detail", "-n", $VmName 2>&1
    Parse-DetailBlocks -Raw $after -Prefix "VM_DETAIL" -Fields $VM_DETAIL_FIELDS | ForEach-Object { Write-Host $_ }

    # Optionally launch
    if ($Launch) {
        if (-not $sdb) {
            Write-Warn "sdb not found - VM created but cannot wait for connection."
            exit 0
        }

        Write-Info "Launching emulator VM: $VmName"
        # Same stdout-Error-with-exit-0 quirk as the launch action above.
        $launchOut = Invoke-EmCli @("launch", "-n", $VmName) 2>&1
        if ($launchOut) { $launchOut | ForEach-Object { Write-Host $_ } }
        if ($LASTEXITCODE -ne 0 -or (Test-EmCliFailed $launchOut)) {
            Write-Err "Failed to launch emulator VM '$VmName'."
            Write-Err "Check if the VM is already running, or launch it manually via Tizen Studio."
            exit 1
        }
        Write-Success "Emulator launch command sent."

        # Record previous serials
        $previousSerials = @()
        $devRawPre = & $sdb devices 2>&1
        $preLines = $devRawPre |
            Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }
        foreach ($line in $preLines) {
            $s = ($line -split '\s+')[0]
            if ($s) { $previousSerials += $s }
        }

        # Wait for emulator to connect
        Write-Info "Waiting up to ${Timeout}s for emulator to connect to sdb..."
        $elapsed = 0
        $interval = 3
        $connected = $false

        while ($elapsed -lt $Timeout) {
            $devRaw = & $sdb devices 2>&1
            $devLines = $devRaw |
                Where-Object { $_ -notmatch '^List' -and $_.Trim() -ne '' -and $_ -match '\sdevice(\s|$)' }

            if ($devLines) {
                foreach ($line in $devLines) {
                    $s = ($line -split '\s+')[0]
                    if ($s -and ($previousSerials -notcontains $s)) {
                        Write-Success "Emulator connected: $s"
                        Write-Host "VM_LAUNCHED=$s"
                        $connected = $true
                        break
                    }
                }
                if ($connected) { break }

                if ($previousSerials.Count -eq 0) {
                    $serial = ($devLines | Select-Object -First 1) -split '\s+' | Select-Object -First 1
                    Write-Success "Emulator connected: $serial"
                    Write-Host "VM_LAUNCHED=$serial"
                    $connected = $true
                    break
                }
            }

            Start-Sleep -Seconds $interval
            $elapsed += $interval
            Write-Info "Still waiting... (${elapsed}s / ${Timeout}s)"
        }

        if (-not $connected) {
            # Timed out - bounce a possibly wedged sdb server and re-poll once.
            $rescued = Retry-SerialAfterSdbRestart -PreviousSerials $previousSerials
            if ($rescued) {
                Write-Host "VM_LAUNCHED=$rescued"
                $connected = $true
            }
        }
        if (-not $connected) {
            Write-Warn "Emulator did not connect within ${Timeout}s, but VM was created successfully."
            Write-Warn "You can launch it manually later via Tizen Studio Emulator Manager."
        }
    }

    exit 0
}

# fix-homescreen exists here only so the action is not a Windows-only outage.
# The home screen crash loop it repairs is a WSL phenomenon and the fix is only
# verified there, so this path deliberately does nothing: it emits no
# HOMESCREEN_STATUS line, which the JS side reports as "did not apply".
# See check_and_fix_homescreen in tizen-emulator-manager.sh.
if ($Action -eq "fix-homescreen") {
    Write-Info "fix-homescreen applies to the Tizen emulator on WSL only - nothing to do on a Windows host."
    Write-Info "If your emulator runs inside WSL, run this action from inside WSL so the bash script handles it."
    exit 0
}

Write-Err "Unknown action: $Action"
Write-Err "Valid actions: create, delete, launch, list-vm, list-platform, list-template, detail, modify, reset, create-image, fix-homescreen"
exit 1
