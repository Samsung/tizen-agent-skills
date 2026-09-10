---
name: tizen-screenshot
description: Tizen device screenshot, emulator screenshot, capture tizen device screen, tizen TV screenshot, 타이젠 스크린샷, 에뮬레이터 화면 캡처, device screen capture. Takes a screenshot of a connected Tizen device, emulator, or TV and saves it as a PNG file — supports multiple capture methods with automatic fallback for emulators and physical devices.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - tizen screenshot
    - tizen device screenshot
    - emulator screenshot
    - capture tizen screen
    - capture device screen
    - capture tizen device
    - capture tizen emulator
    - TV screenshot
    - tizen TV screenshot
    - 타이젠 스크린샷
    - 타이젠 화면 캡처
    - 에뮬레이터 화면 캡처
    - 에뮬레이터 스크린샷
    - 디바이스 화면 캡처
    - 타이젠 TV 화면 캡처
---

# Tizen Screenshot

## When to use

User wants to capture the screen of a connected Tizen device or emulator and save it as a PNG file. The skill automatically detects the target type (emulator or physical device) and tries multiple capture methods, stopping at the first success.

## Command

```
tizen-cli tizen-sdk screenshot [--serial <serial>] [--output <path>]
```

| Option              | Required | Default           | Description                                                                    |
| ------------------- | -------- | ----------------- | ------------------------------------------------------------------------------ |
| `--serial <serial>` | no       | auto              | Target device serial (omit to auto-select the single connected device)         |
| `--output <path>`   | no       | `./emulator_screenshot.png` | File path where the screenshot should be saved (creates parent directories if needed) |

## Output

**Success:**

```json
{
  "command": "tizen-sdk screenshot",
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "is_emulator": true,
    "output_path": "/abs/path/to/emulator_screenshot.png",
    "capture_method": "host-side xwd",
    "image": {
      "path": "/abs/path/to/emulator_screenshot.png",
      "size_bytes": 1234567,
      "mime_type": "image/png",
      "width": 1920,
      "height": 1080,
      "base64": "<inline PNG, or a JPEG thumbnail when base64_is_thumbnail is true>"
    },
    "stdout": "..."
  }
}
```

**Failure (no device):**

```json
{
  "command": "tizen-sdk screenshot",
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_DEVICE_E001",
      "error_category": "device_not_found",
      "message": "No connected Tizen device or emulator found. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it.",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk create-emulator",
        "auto_fixable": false
      }
    }
  ]
}
```

**Failure (all capture methods exhausted):**

```json
{
  "command": "tizen-sdk screenshot",
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_SCREENSHOT_E002",
      "error_category": "capture_failed",
      "message": "All screenshot capture methods failed. Tried: host-side xwd, device-side screencapture, device-side capture_screen, device-side /dev/fb0",
      "device_serial": "emulator-26101",
      "attempts": [
        {
          "method": "host-side xwd",
          "error": "X11 window not found"
        },
        {
          "method": "device-side screencapture",
          "error": "Binary not available on device"
        },
        {
          "method": "device-side capture_screen",
          "error": "Binary not available on device"
        },
        {
          "method": "device-side /dev/fb0",
          "error": "Failed to read framebuffer: Permission denied"
        }
      ]
    }
  ]
}
```

## Screenshot fallback chain

The screenshot intent tries multiple methods, stopping at the first success. The order depends on whether the target is an emulator or a physical device:

### Emulator targets (serial starts with `emulator-`)

1. **Host-side `xwd`** — **most reliable for emulators.** The Tizen emulator renders its GUI on the host's X11 display, not on the device's framebuffer. Finds the emulator X11 window via `xwininfo`, captures with `xwd`, converts XWD→PNG with Python PIL.
2. **Device-side `screencapture`** — mobile/wearable profiles. Fails on many emulator images.
3. **Device-side `capture_screen`** — fallback when `screencapture` is missing.
4. **Device-side `/dev/fb0`** — last resort. On emulators this often only captures the kernel boot console, not the actual GUI.

### Physical device targets

1. **Device-side `/dev/fb0`** — framebuffer read, converted to PNG on the host with Python PIL.
2. **Device-side `screencapture`** — mobile/wearable profiles.
3. **Device-side `capture_screen`** — fallback when `screencapture` is missing.
4. **Host-side `xwd`** — rarely applicable to physical devices (no X11 window on host).

### Standalone scripts

The full fallback chain is also available via standalone scripts (emulator auto-detection and reordering built in):

- **Linux/macOS:** `scripts/tizen-screenshot/tizen-screenshot.sh [serial] [output_path]`
- **Windows:** `scripts/tizen-screenshot/tizen-screenshot.ps1 [-Serial <serial>] [-OutputPath <path>]`

> **Windows note:** On Windows, the `.ps1` script uses Win32 API window capture (`CopyFromScreen`) instead of `xwd`, and removes the emulator control panel automatically. The `screenshot` CLI command (`tizen-cli tizen-sdk screenshot`) auto-detects the platform and calls the correct script.

## Boundary

**In scope:** taking screenshots of connected Tizen devices and emulators.

**Out of scope (use other skills):**

- Device discovery → `tizen-cli tizen-sdk device-manager`
- Create an emulator VM → `tizen-cli tizen-sdk create-emulator`
- Launch an emulator VM → `tizen-cli tizen-sdk launch-emulator`
- General sdb commands (logs, shell, port forwarding, reboot, etc.) → `tizen-cli tizen-sdk sdb-helper`
- File transfer (push/pull) → `tizen-cli tizen-sdk file-transfer`

## Follow-ups

- Device discovery → `tizen-cli tizen-sdk device-manager`
- Create an emulator VM → `tizen-cli tizen-sdk create-emulator`
- Launch an emulator VM → `tizen-cli tizen-sdk launch-emulator`
- Other sdb operations (logs, shell, port forward) → `tizen-cli tizen-sdk sdb-helper`
- File transfer → `tizen-cli tizen-sdk file-transfer`
