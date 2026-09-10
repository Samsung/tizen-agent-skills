# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# tizen-screenshot.ps1
# Capture a screenshot from a Tizen emulator or device (Windows PowerShell)
#
# Fallback chain (stops at first success):
#
# For emulator targets (serial starts with "emulator-"):
#   1. Device-side: enlightenment_info dump (native resolution; needs root)
#   2. Host-side:   Win32 API window capture (CopyFromScreen)
#   3. Device-side: screencapture
#   4. Device-side: capture_screen
#   5. Device-side: /dev/fb0 framebuffer read
#
# For physical device targets:
#   1. Device-side: enlightenment_info dump (native resolution; needs root)
#   2. Device-side: /dev/fb0 framebuffer read
#   3. Device-side: screencapture
#   4. Device-side: capture_screen
#   5. Host-side:   Win32 API window capture (rarely applicable)
#
# Usage:
#   .\tizen-screenshot.ps1 [-Serial <serial>] [-OutputPath <path>]
#
# Examples:
#   .\tizen-screenshot.ps1
#   .\tizen-screenshot.ps1 -Serial emulator-26101
#   .\tizen-screenshot.ps1 -OutputPath .\screenshot.png
#   .\tizen-screenshot.ps1 -Serial emulator-26101 -OutputPath .\sshot.png
#
# Machine-readable output lines (stdout):
#   SUCCESS: <method>              which fallback produced the capture; parsed
#                                  by lib/core/screenshot.js into capture_method
#   CAPTURE_WARNING=uniform_image  every method either failed or produced a
#                                  single flat color; the flat capture was kept
#                                  as a last resort (screen off / rendering
#                                  broken). Parsed by lib/core/screenshot.js.

#Requires -Version 5.0

param(
    [Parameter(Mandatory=$false)]
    [Alias('s')]
    [string]$Serial = $null,

    [Parameter(Mandatory=$false)]
    [Alias('o')]
    [string]$OutputPath = ".\emulator_screenshot.png"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "..\lib\common.ps1")

# ============================================================================
# Native command wrappers
# ============================================================================
# This script runs with $ErrorActionPreference = "Stop" so that a failed file
# operation (Copy-Item, Move-Item, ...) cannot be mistaken for a capture. Under
# that preference Windows PowerShell 5.1 turns a redirected stderr line of a
# NATIVE command into a terminating error - see Invoke-Native in
# lib\common.ps1 - so every sdb / python invocation goes through Invoke-Native
# (stderr dropped, or merged as plain strings) rather than a bare `& $exe 2>..`.
# Success is judged by the produced file or $LASTEXITCODE, never by whether sdb
# stayed silent on stderr.

# Run sdb against one device: Invoke-Sdb <sdb> <serial> <sdb args...>
function Invoke-Sdb {
    param(
        [string]$SdbPath,
        [string]$DeviceSerial,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$SdbArgs
    )
    Invoke-Native -Exe $SdbPath -Arguments (@('-s', $DeviceSerial) + $SdbArgs)
}

# ============================================================================
# Resolve sdb path
# ============================================================================

function Resolve-SdbPath {
    # Find-TizenTool resolves via Get-SdkPath
    # (TIZEN_SDK_PATH -> ~\.tizen.sdk.path.config -> ~\tizen-sdk)
    $sdbExe = Find-TizenTool -ToolName "sdb"
    if ($sdbExe) {
        return $sdbExe
    }

    # Fallback: check if sdb is on PATH
    $sdbOnPath = Get-Command sdb -ErrorAction SilentlyContinue
    if ($sdbOnPath) {
        return $sdbOnPath.Source
    }

    # Last resort: Tizen Studio install locations (not covered by Get-SdkPath)
    $commonPaths = @(
        "C:\tizen-studio\tools\sdb.exe",
        "C:\TizenStudio\tools\sdb.exe",
        "D:\tizen-studio\tools\sdb.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) { return $p }
    }

    Write-Err "sdb not found. Set TIZEN_SDK_PATH or add sdb to PATH."
    exit 3
}

# ============================================================================
# Resolve device serial
# ============================================================================

function Resolve-DeviceSerial {
    param([string]$SdbPath, [string]$Hint)

    if ($Hint) { return $Hint }

    # Shared `sdb devices` parser (lib\common.ps1). @() forces an array so a
    # single serial does not unwrap to a string (see Get-DeviceSerial).
    $serials = @(Get-ConnectedDevices $SdbPath)

    if ($serials.Count -eq 0) {
        Write-Err "No connected Tizen device or emulator found."
        exit 1
    }
    elseif ($serials.Count -gt 1) {
        Write-Err "Multiple devices connected. Specify -Serial parameter."
        & $SdbPath devices | Out-Host
        exit 1
    }

    return $serials[0]
}

# ============================================================================
# Verify output file
# ============================================================================

function Test-ValidOutput {
    param([string]$Path)
    return (Test-Path $Path) -and ((Get-Item $Path).Length -gt 0)
}

# ============================================================================
# Shared helpers
# ============================================================================

# Fresh temp file path with the given extension (e.g. ".png", ".py").
function New-TempPath {
    param([string]$Extension)
    return [System.IO.Path]::GetTempFileName() -replace '\.tmp$', $Extension
}

# First python command (python3 / python) that has PIL/Pillow, or $null.
function Find-PythonWithPil {
    foreach ($cmd in @("python3", "python")) {
        # A missing interpreter throws CommandNotFoundException before any
        # native process runs; that is the one case the try/catch is for.
        try {
            $null = Invoke-Native -Exe $cmd -Arguments @('--version') -MergeStderr
            if ($LASTEXITCODE -ne 0) { continue }
        } catch { continue }
        # Pillow is optional: a missing-Pillow traceback (stderr, non-zero
        # exit) just means "try the next Python command", not a capture failure.
        $pilCheck = Invoke-Native -Exe $cmd -Arguments @('-c', "from PIL import Image; print('ok')") -MergeStderr
        if ($LASTEXITCODE -eq 0 -and ($pilCheck -match 'ok')) { return $cmd }
    }
    return $null
}

# Is the capture one flat color? A solid-black PNG passes Test-ValidOutput:
# enlightenment_info happily dumps a screen that is off or not composited, and
# the chain used to stop there even when a later method would have captured
# the real display. Downscale to 64x64 and check the per-channel extrema - a
# span under 3 on every channel means one flat color. Returns $true ONLY for a
# confidently-uniform image; any doubt (no python/PIL, unreadable file)
# returns $false so behavior only changes for captures we are sure about.
# Mirrors is_uniform_image in tizen-screenshot.sh.
function Test-UniformImage {
    param([string]$Path)

    $pythonExe = Find-PythonWithPil
    if (-not $pythonExe) { return $false }

    $pyScript = @"
import sys
from PIL import Image
try:
    img = Image.open(sys.argv[1]).convert("RGB").resize((64, 64))
    extrema = img.getextrema()
except Exception:
    sys.exit(1)  # cannot determine -> treat as NOT uniform
sys.exit(0 if all(hi - lo < 3 for lo, hi in extrema) else 1)
"@
    $pyFile = New-TempPath ".py"
    $pyScript | Out-File -FilePath $pyFile -Encoding utf8
    try {
        Invoke-Native -Exe $pythonExe -Arguments @($pyFile, $Path) | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        Remove-Item $pyFile -Force -ErrorAction SilentlyContinue
    }
}

# Gate a verified capture on the uniform check.
# Not uniform: copy into place, report success, return $true - the chain stops.
# The "SUCCESS: <method>" line is a machine line: lib/core/screenshot.js
# extractCaptureMethod parses it into the envelope's capture_method field, so
# it must match the bash script's format exactly (Write-Success's "[OK]"
# prefix would not be recognized).
# Uniform: stash the FIRST such capture as a last-resort fallback and return
# $false so the chain keeps going - a later method may see the real screen.
# The stash lives in %TEMP% - never next to the user's output file - and is
# discarded as soon as a real (non-uniform) capture wins.
# Mirrors accept_capture in tizen-screenshot.sh.
$script:UniformFallback = $null
$script:UniformMethod = $null

function Clear-UniformFallback {
    if ($script:UniformFallback) {
        Remove-Item $script:UniformFallback -Force -ErrorAction SilentlyContinue
        $script:UniformFallback = $null
        $script:UniformMethod = $null
    }
}

function Accept-Capture {
    param([string]$TempPath, [string]$OutPath, [string]$Method)

    if (Test-UniformImage $TempPath) {
        Write-Warn "$Method capture is a single solid color - keeping it aside and trying the next method"
        if (-not $script:UniformFallback) {
            $script:UniformFallback = New-TempPath ".png"
            $script:UniformMethod = $Method
            Copy-Item $TempPath $script:UniformFallback -Force
        }
        return $false
    }
    Copy-Item $TempPath $OutPath -Force
    Clear-UniformFallback
    Write-Host "SUCCESS: $Method" -ForegroundColor Green
    return $true
}

# ============================================================================
# Method 1: Host-side Win32 API window capture (emulator only)
# ============================================================================

function Try-HostWindowCapture {
    param([string]$SdbPath, [string]$DeviceSerial, [string]$OutPath)

    Write-Info "Trying: host-side Win32 window capture..."

    # Load required .NET assemblies
    try {
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName System.Windows.Forms
    } catch {
        Write-Warn "Cannot load System.Drawing / System.Windows.Forms - skipping"
        return $false
    }

    # Win32 API + capture logic all in C# (PowerShell cannot convert PSMethod to C# delegate)
    $win32Code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;

public class Win32Capture {
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private static IntPtr FoundWindow = IntPtr.Zero;

    private static bool EnumCallback(IntPtr hWnd, IntPtr lParam) {
        if (!IsWindowVisible(hWnd)) return true;

        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        string title = sb.ToString();

        if (title.Contains("Tizen Emulator") || title.Contains("emulator-x86") ||
            title.Contains("Tizen VM") || title.Contains("Tizen Mobile") ||
            title.Contains("Tizen Wearable") || title.Contains("Tizen TV")) {
            FoundWindow = hWnd;
            return false;
        }
        return true;
    }

    public static string CaptureEmulator(string outFile) {
        // Make this process DPI-aware so GetWindowRect returns physical pixels
        // (without this, on high-DPI displays, the rect is in logical pixels but
        // CopyFromScreen uses physical pixels, causing the screenshot to be cropped)
        try { SetProcessDPIAware(); } catch { }

        FoundWindow = IntPtr.Zero;
        EnumWindows(new EnumWindowsProc(EnumCallback), IntPtr.Zero);

        if (FoundWindow == IntPtr.Zero) return null;

        SetForegroundWindow(FoundWindow);
        System.Threading.Thread.Sleep(500);

        RECT rect;
        GetWindowRect(FoundWindow, out rect);

        int w = rect.Right - rect.Left;
        int h = rect.Bottom - rect.Top;
        if (w <= 0 || h <= 0) return null;

        Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        Graphics g = Graphics.FromImage(bmp);
        g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
        bmp.Save(outFile, ImageFormat.Png);
        g.Dispose();
        bmp.Dispose();

        return w + "x" + h;
    }
}
"@

    try {
        Add-Type -TypeDefinition $win32Code -ErrorAction Stop -ReferencedAssemblies System.Drawing
    } catch {
        if (-not ("Win32Capture" -as [type])) {
            Write-Warn "Cannot load Win32 API definitions - skipping"
            return $false
        }
    }

    # Capture the emulator window
    $tempPng = New-TempPath ".png"
    $result = [Win32Capture]::CaptureEmulator($tempPng)

    if (-not $result) {
        Write-Warn "No emulator window found or capture failed - skipping"
        Remove-Item $tempPng -Force -ErrorAction SilentlyContinue
        return $false
    }

    Write-Info "Captured: $result → $tempPng"

    # Post-process: detect and remove control panel, swap left/right display
    $processed = PostProcess-Image -InputPath $tempPng -OutputPath $OutPath
    Remove-Item $tempPng -Force -ErrorAction SilentlyContinue

    if ($processed -and (Test-ValidOutput $OutPath)) {
        # This method writes to $OutPath directly, so the uniform gate moves
        # the file aside instead of stashing a temp copy.
        if (Test-UniformImage $OutPath) {
            Write-Warn "host-side Win32 window capture is a single solid color - keeping it aside and trying the next method"
            if (-not $script:UniformFallback) {
                $script:UniformFallback = New-TempPath ".png"
                $script:UniformMethod = "host-side Win32 window capture"
                Move-Item $OutPath $script:UniformFallback -Force
            } else {
                Remove-Item $OutPath -Force -ErrorAction SilentlyContinue
            }
            return $false
        }
        Clear-UniformFallback
        Write-Host "SUCCESS: host-side Win32 window capture" -ForegroundColor Green
        return $true
    }

    return $false
}

# ============================================================================
# Post-process: detect control panel, swap and stitch display areas
# ============================================================================

function PostProcess-Image {
    param([string]$InputPath, [string]$OutputPath)

    $pythonExe = Find-PythonWithPil
    if (-not $pythonExe) {
        Write-Warn "Python with PIL/Pillow not found - saving without control panel removal"
        Copy-Item $InputPath $OutputPath -Force
        return $true
    }

    # Run the same Python post-processing as the bash script
    $pyScript = @"
import sys
from PIL import Image

img = Image.open(sys.argv[1])
width, height = img.size

if width > 100 and height > 100:
    sample_ys = [int(height * (i + 0.5) / 10) for i in range(10)]
    grayscale_threshold = 15
    min_brightness = 80  # Control panel is light gray, not black

    def is_grayscale_column(x):
        count = 0
        for y in sample_ys:
            r, g, b = img.getpixel((x, y))[:3]
            brightness = (r + g + b) / 3
            if brightness >= min_brightness and abs(r - g) < grayscale_threshold and abs(g - b) < grayscale_threshold and abs(r - b) < grayscale_threshold:
                count += 1
        return count / len(sample_ys) >= 0.8


    control_panel_start = None
    for x in range(width):
        if is_grayscale_column(x):
            sustained = True
            for x2 in range(x, min(x + 20, width)):
                if not is_grayscale_column(x2):
                    sustained = False
                    break
            if sustained:
                control_panel_start = x
                break

    if control_panel_start is not None and control_panel_start < width * 0.95:
        control_panel_end = width
        for x in range(control_panel_start + 20, width):
            if not is_grayscale_column(x):
                control_panel_end = x
                break

        has_content_after = control_panel_end < width

        if has_content_after:
            left_part = img.crop((0, 0, control_panel_start, height))
            right_part = img.crop((control_panel_end, 0, width, height))
            new_width = left_part.width + right_part.width
            stitched = Image.new('RGBA', (new_width, height))
            stitched.paste(right_part, (0, 0))
            stitched.paste(left_part, (right_part.width, 0))
            img = stitched
            print(f"  Stitched display (swapped, removed control panel cols {control_panel_start}-{control_panel_end}): {width}x{height} -> {new_width}x{height}")
        else:
            img = img.crop((0, 0, control_panel_start, height))
            print(f"  Cropped to display area: {width}x{height} -> {control_panel_start}x{height}")

img.save(sys.argv[2])
print(f"  Converted: {img.size[0]}x{img.size[1]} -> {sys.argv[2]}")
"@

    $pyFile = New-TempPath ".py"
    $pyScript | Out-File -FilePath $pyFile -Encoding utf8

    try {
        Invoke-Native -Exe $pythonExe -Arguments @($pyFile, $InputPath, $OutputPath) -MergeStderr | Out-Host
        $success = $LASTEXITCODE -eq 0
    } catch {
        $success = $false
    }

    Remove-Item $pyFile -Force -ErrorAction SilentlyContinue
    return $success
}

# ============================================================================
# Method: Device-side capture tool (screencapture / capture_screen)
#   Both tools take an output path on the device; the flow is identical:
#   run the tool, pull the file, verify, copy into place.
# ============================================================================

function Try-DeviceCapture {
    param([string]$SdbPath, [string]$DeviceSerial, [string]$OutPath, [string]$Tool)

    Write-Info "Trying: device-side $Tool..."

    $tempPng = New-TempPath ".png"

    try {
        Invoke-Sdb $SdbPath $DeviceSerial shell "$Tool /tmp/sshot.png" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "$Tool command failed - skipping"
            return $false
        }

        Invoke-Sdb $SdbPath $DeviceSerial pull /tmp/sshot.png $tempPng | Out-Null
        Invoke-Sdb $SdbPath $DeviceSerial shell "rm -f /tmp/sshot.png" | Out-Null

        if (Test-ValidOutput $tempPng) {
            return (Accept-Capture -TempPath $tempPng -OutPath $OutPath -Method $Tool)
        }
    } catch {
        Write-Warn "$Tool failed - skipping"
    } finally {
        Remove-Item $tempPng -Force -ErrorAction SilentlyContinue
    }

    return $false
}

# ============================================================================
# Method: Device-side enlightenment_info
#   Enlightenment is the Tizen window manager. Verified on a tizen-vm-default
#   emulator that ships NEITHER screencapture NOR capture_screen, where this is
#   the only device-side method returning the real UI: -dump_screen gave a clean
#   full-screen 1920x1080 PNG, against 960x581 with window chrome from the
#   host-side capture.
#
#   Two constraints observed on that image:
#     1. /usr/bin/enlightenment_info is -r-xr-x--- root:root, so 'sdb root on'
#        is required and the previous mode is restored afterwards.
#     2. The tool exits 0 even for an unknown option, so success must be judged
#        by the produced file, never by the exit code.
# ============================================================================

function Try-EnlightenmentInfo {
    param([string]$SdbPath, [string]$DeviceSerial, [string]$OutPath)

    Write-Info "Trying: device-side enlightenment_info..."

    $tempPng = New-TempPath ".png"
    $wasRoot = $false

    # /usr/bin/enlightenment_info is -r-xr-x--- root:root; the default sdb user
    # (owner, uid 5001) gets "Permission denied".
    $uid = (Invoke-Sdb $SdbPath $DeviceSerial shell "id -u" | Out-String).Trim()
    if ($uid -eq "0") {
        $wasRoot = $true
    } else {
        Invoke-Sdb $SdbPath $DeviceSerial root on | Out-Null
        $uid = (Invoke-Sdb $SdbPath $DeviceSerial shell "id -u" | Out-String).Trim()
        if ($uid -ne "0") {
            Write-Warn "enlightenment_info needs root and 'sdb root on' was refused - skipping"
            Remove-Item $tempPng -Force -ErrorAction SilentlyContinue
            return $false
        }
    }

    $dumpDir = "/tmp/tizen_e_dump_$PID"
    $devName = "tizen_sshot_$PID.png"
    $pullDir = Join-Path ([System.IO.Path]::GetTempPath()) "tizen_screenshot_e_$PID"

    try {
        # --- form 1: -dump_screen - one file, full screen, exact path ---
        # The tool exits 0 even for an unknown option, so judge by the file.
        Invoke-Sdb $SdbPath $DeviceSerial shell "rm -f /tmp/$devName" | Out-Null
        Invoke-Sdb $SdbPath $DeviceSerial shell "enlightenment_info -dump_screen -p /tmp/ -n $devName" | Out-Null
        Invoke-Sdb $SdbPath $DeviceSerial pull "/tmp/$devName" $tempPng | Out-Null
        Invoke-Sdb $SdbPath $DeviceSerial shell "rm -f /tmp/$devName" | Out-Null

        if (Test-ValidOutput $tempPng) {
            if (Accept-Capture -TempPath $tempPng -OutPath $OutPath -Method "enlightenment_info -dump_screen") {
                return $true
            }
            # Uniform capture stashed - fall through to form 2 with root still on.
        }

        # --- form 2: -dump topvwins <DIR> - per-window buffers, keep the biggest ---
        # Note the space: `-dump topvwins`, not `-dump_topvwins`. The tool creates
        # its own timestamped subdirectory inside <DIR>, so the search recurses.
        Invoke-Sdb $SdbPath $DeviceSerial shell "rm -rf $dumpDir && mkdir -p $dumpDir" | Out-Null
        Invoke-Sdb $SdbPath $DeviceSerial shell "enlightenment_info -dump topvwins $dumpDir" | Out-Null

        New-Item -ItemType Directory -Path $pullDir -Force | Out-Null
        Invoke-Sdb $SdbPath $DeviceSerial pull $dumpDir $pullDir | Out-Null

        $biggest = Get-ChildItem -Path $pullDir -Filter *.png -Recurse -ErrorAction SilentlyContinue |
                   Sort-Object Length -Descending | Select-Object -First 1

        if ($biggest -and (Test-ValidOutput $biggest.FullName)) {
            if (Accept-Capture -TempPath $biggest.FullName -OutPath $OutPath -Method "enlightenment_info -dump topvwins") {
                return $true
            }
        }
    } catch {
        Write-Warn "enlightenment_info failed - skipping"
    } finally {
        Invoke-Sdb $SdbPath $DeviceSerial shell "rm -rf $dumpDir" | Out-Null
        Remove-Item $pullDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $tempPng -Force -ErrorAction SilentlyContinue
        if (-not $wasRoot) { Invoke-Sdb $SdbPath $DeviceSerial root off | Out-Null }
    }

    return $false
}

# ============================================================================
# Method: Device-side /dev/fb0 framebuffer read
# ============================================================================

function Try-Framebuffer {
    param([string]$SdbPath, [string]$DeviceSerial, [string]$OutPath)

    Write-Info "Trying: device-side /dev/fb0 framebuffer..."

    $pythonExe = Find-PythonWithPil
    if (-not $pythonExe) {
        Write-Warn "Python with PIL/Pillow not found - skipping"
        return $false
    }

    # Read framebuffer info from sysfs
    $fbSize = (Invoke-Sdb $SdbPath $DeviceSerial shell "cat /sys/class/graphics/fb0/virtual_size 2>/dev/null" | Out-String).Trim()
    $fbBpp = (Invoke-Sdb $SdbPath $DeviceSerial shell "cat /sys/class/graphics/fb0/bits_per_pixel 2>/dev/null" | Out-String).Trim()
    $fbStride = (Invoke-Sdb $SdbPath $DeviceSerial shell "cat /sys/class/graphics/fb0/stride 2>/dev/null" | Out-String).Trim()

    if (-not $fbSize -or -not $fbBpp) {
        Write-Warn "Cannot read framebuffer info - skipping"
        return $false
    }

    $parts = $fbSize -split ','
    $fbWidth = [int]$parts[0].Trim()
    $fbHeight = [int]$parts[1].Trim()
    $fbBppInt = [int]$fbBpp.Trim()
    $fbStrideInt = if ($fbStride) { [int]$fbStride.Trim() } else { 0 }

    Write-Info "Framebuffer: ${fbWidth}x${fbHeight}, ${fbBppInt}bpp, stride=$fbStrideInt"

    # Read framebuffer with dd
    if ($fbStrideInt -gt 0) {
        Invoke-Sdb $SdbPath $DeviceSerial shell "dd if=/dev/fb0 of=/tmp/fb0.raw bs=$fbStrideInt count=$fbHeight 2>/dev/null" | Out-Null
    } else {
        Invoke-Sdb $SdbPath $DeviceSerial shell "dd if=/dev/fb0 of=/tmp/fb0.raw 2>/dev/null" | Out-Null
    }

    $rawTmp = [System.IO.Path]::GetTempFileName()
    Invoke-Sdb $SdbPath $DeviceSerial pull /tmp/fb0.raw $rawTmp | Out-Null
    Invoke-Sdb $SdbPath $DeviceSerial shell "rm -f /tmp/fb0.raw" | Out-Null

    if (-not (Test-ValidOutput $rawTmp)) {
        Write-Warn "Failed to read framebuffer - skipping"
        Remove-Item $rawTmp -Force -ErrorAction SilentlyContinue
        return $false
    }

    # Convert raw framebuffer → PNG
    $pyScript = @"
import sys
from PIL import Image

raw_path, png_path, width, height, bpp, stride = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])

with open(raw_path, 'rb') as f:
    raw = f.read()

if stride == 0:
    stride = width * (bpp // 8)

if bpp == 32:
    img = Image.frombytes('RGBA', (width, height), raw, 'raw', 'BGRA', stride, 1)
elif bpp == 24:
    img = Image.frombytes('RGB', (width, height), raw, 'raw', 'BGR', stride, 1)
elif bpp == 16:
    img = Image.frombytes('RGB', (width, height), raw, 'raw', 'BGR;16', stride, 1)
else:
    print(f"Unsupported bpp: {bpp}", file=sys.stderr)
    sys.exit(1)

img.save(png_path)
print(f"  Converted: {width}x{height} {bpp}bpp -> {png_path}")
"@

    $pyFile = New-TempPath ".py"
    $pyScript | Out-File -FilePath $pyFile -Encoding utf8

    $tempPng = New-TempPath ".png"

    try {
        Invoke-Native -Exe $pythonExe -Arguments @($pyFile, $rawTmp, $tempPng, "$fbWidth", "$fbHeight", "$fbBppInt", "$fbStrideInt") -MergeStderr | Out-Host
        $success = $LASTEXITCODE -eq 0
    } catch {
        $success = $false
    }

    Remove-Item $rawTmp -Force -ErrorAction SilentlyContinue
    Remove-Item $pyFile -Force -ErrorAction SilentlyContinue

    if ($success -and (Test-ValidOutput $tempPng)) {
        $result = Accept-Capture -TempPath $tempPng -OutPath $OutPath -Method "framebuffer"
    } else {
        $result = $false
    }

    Remove-Item $tempPng -Force -ErrorAction SilentlyContinue
    return $result
}

# ============================================================================
# Main
# ============================================================================

Write-Host "=== Tizen Screenshot ===" -ForegroundColor Yellow

$SdbPath = Resolve-SdbPath
$DeviceSerial = Resolve-DeviceSerial -SdbPath $SdbPath -Hint $Serial

Write-Info "Target device: $DeviceSerial"
Write-Info "Output: $OutputPath"

# Determine if target is emulator
$isEmulator = $DeviceSerial -like "emulator-*"

if ($isEmulator) {
    Write-Info "Detected: emulator target - after enlightenment_info, host-side window capture is preferred over the device-side capture tools"

    if (Try-EnlightenmentInfo -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath) { exit 0 }
    if (Try-HostWindowCapture -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath) { exit 0 }
    if (Try-DeviceCapture -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath -Tool "screencapture") { exit 0 }
    if (Try-DeviceCapture -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath -Tool "capture_screen") { exit 0 }
    if (Try-Framebuffer -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath) { exit 0 }
} else {
    if (Try-EnlightenmentInfo -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath) { exit 0 }
    if (Try-Framebuffer -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath) { exit 0 }
    if (Try-DeviceCapture -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath -Tool "screencapture") { exit 0 }
    if (Try-DeviceCapture -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath -Tool "capture_screen") { exit 0 }
    if (Try-HostWindowCapture -SdbPath $SdbPath -DeviceSerial $DeviceSerial -OutPath $OutputPath) { exit 0 }
}

# No method produced a non-uniform capture. A uniform one is better than
# nothing - it IS a real capture, the screen just looks off/black - so promote
# the stashed fallback and flag it (CAPTURE_WARNING is parsed by
# lib/core/screenshot.js into an envelope warning).
if ($script:UniformFallback -and (Test-Path $script:UniformFallback)) {
    Move-Item $script:UniformFallback $OutputPath -Force
    Write-Warn "the capture is a single solid color - the screen may be off or rendering may be broken."
    Write-Host "CAPTURE_WARNING=uniform_image"
    Write-Host "SUCCESS: $($script:UniformMethod)"
    exit 0
}

Write-Err "All screenshot methods failed."
exit 2
