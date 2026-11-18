---
name: tizen-screenshot
description: Tizen device screenshot, emulator screenshot, capture tizen device screen, tizen TV screenshot, 타이젠 스크린샷, 에뮬레이터 화면 캡처, device screen capture. Takes a screenshot of a connected Tizen device, emulator, or TV and saves it as a PNG file — supports multiple capture methods with automatic fallback for emulators and physical devices.
version: 1.0.0
when_to_use: User asks for a screenshot of a Tizen device or emulator ("screenshot the TV", "capture emulator screen", "capture device screen", "타이젠 화면 캡처", "에뮬레이터 스크린샷"). Automatically detects the target type and tries multiple capture methods, stopping at the first success.
inputs:
  - name: request
    description: The user's screenshot request, in natural language.
  - name: serial
    description: Optional sdb device serial. Defaults to the only attached device, or prompts when more than one is connected.
required_tools: [bash, read]
---

# Tizen Screenshot Skill

## Goal

Given a screenshot request, capture the screen of a connected Tizen device or emulator and save it as a PNG file. Automatically detect whether the target is an emulator or physical device, and try multiple capture methods in the correct order, stopping at the first success.

## Boundary

In scope: taking screenshots of connected Tizen devices and emulators.

Out of scope:

- Device discovery / emulator creation — use `tizen-device-manager` (handles emulator create/launch).
- General sdb commands (logs, shell, port forwarding, reboot, etc.) — use `tizen-sdb-helper`.
- File transfer (push/pull) — use `tizen-file-transfer` (dedicated agent for sdb push/pull with UTF-8 support).

## Inputs

- `request`: the user's screenshot ask.
- `serial`: optional sdb device serial.

## Required action — use the shipped CLI runner

**✅ ALWAYS call `captureScreenshot()` via the shipped CLI runner — NEVER hand-construct `sdb` commands, resolve the SDK/sdb path yourself, or write ad hoc inline PowerShell/Bash to do what the runner already does.** The runner internally handles sdb discovery, device-serial resolution, emulator-vs-device fallback ordering, and dispatches to the platform script (`.ps1` on Windows, `.sh` on Linux/macOS/Ubuntu) — reimplementing any of that by hand is how fragile one-liners and shell-quoting bugs creep in.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/screenshot-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" [serial] [output_path]
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\screenshot-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" [serial] [output_path]
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" [serial] [output_path]
```

**Arguments (both optional):**

1. `serial` — sdb device serial. Omit to auto-detect (errors if 0 or 2+ devices are connected; the envelope lists them).
2. `output_path` — where to save the PNG. Defaults to `./emulator_screenshot.png`.

Exit code: `0` = success envelope, non-zero = failure/error envelope (JSON on stdout either way).

**IMPORTANT:** On a failure/error envelope, relay it and STOP. Do not run manual diagnostics (`sdb devices`, hand-rolled PowerShell probing `.tizen.sdk.path.config`, etc.) — the runner already performed device discovery and sdb resolution and the envelope carries the facts (`errors[0].message`, suggested fixes). Common failure causes surfaced this way:

- 0 devices connected → direct the user to `tizen-create-emulator` (create a VM) and `tizen-launch-emulator` (launch it).
- 2+ devices connected → the envelope lists them; re-run with the `serial` argument.
- `offline` / `locked` device → the user must fix developer mode, accept the on-device RSA key prompt, or replace the cable.
- All capture methods exhausted → the envelope's `result.capture_method` attempts and error detail explain which fallback failed and why.

## Intent → command table (reference only — the CLI runner executes this internally)

**This section documents what `captureScreenshot()` does internally so you can interpret its envelope and explain a failure. Do NOT execute these commands yourself; the CLI runner above already runs this exact fallback chain.**

### Screenshot

> **Fallback chain:** Try each method in order. Stop at the first that works. `enlightenment_info` is tried FIRST: measured on a `tizen-vm-default` emulator it returned a clean **1920x1080** capture, against **960x581 with the emulator title bar and border baked in** from host-side `xwd`. It needs `sdb root on`; where root is refused it skips and the host-side/device-side methods below apply as before. Many emulator images ship neither `screencapture` nor `capture_screen` at all.
>
> **Emulator auto-detection:** The skill automatically detects emulator targets (serial starts with `emulator-`) and reorders the fallback chain to try host-side `xwd` first. On physical devices, device-side methods are tried first.
>
> **Standalone script:** `scripts/tizen-screenshot/tizen-screenshot.sh [serial] [output_path]` runs the full fallback chain automatically — emulator-aware ordering is built in.

#### Emulator targets (serial starts with `emulator-`)

Try in order; stop at the first success:

| Order | Intent                          | Command                                                                                                                                                   | Notes                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Screenshot (host xwd)           | Host-side: `xwininfo -root -tree` → find emulator window ID → `xwd -id <win_id> -out sshot.xwd` → Python PIL convert to PNG                               | **Most reliable for emulators.** The Tizen emulator renders its GUI on the host's X11 display, not on the device's framebuffer. Find the window by grepping `xwininfo` output for `"Tizen Emulator"` or `"emulator-x86_64"`. Convert XWD→PNG with Python PIL (parse XWD header for width/height/byte_order/bytes_per_line).                                    |
| 2     | Screenshot (screencapture)      | `sdb -s "$S" shell screencapture /tmp/sshot.png` → `pull` → `shell rm /tmp/sshot.png`                                                                     | Mobile/wearable profiles. Fails on many emulator images.                                                                                                                                                                                                                                                                                                       |
| 3     | Screenshot (capture_screen)     | `sdb -s "$S" shell capture_screen /tmp/sshot.png` → `pull` → `shell rm /tmp/sshot.png`                                                                    | When `screencapture` is missing. Some IoT images have neither — continue to fallback 4.                                                                                                                                                                                                                                                                        |
| 0     | Screenshot (enlightenment_info) | `sdb -s "$S" root on` → `shell enlightenment_info -dump_screen -p /tmp/ -n sshot.png` → `pull /tmp/sshot.png` → `shell rm -f /tmp/sshot.png` → `root off` | **Tried first.** Native resolution, no window chrome. Binary is `-r-xr-x--- root:root`, so root is required. It exits 0 even for an unknown option — verify the FILE, not `$?`. Older images instead take `-dump topvwins <DIR>` (note the space), which creates its own timestamped subdirectory of per-window PNGs: pull the directory and keep the largest. |
| 4     | Screenshot (framebuffer)        | `sdb -s "$S" shell dd if=/dev/fb0 of=/tmp/fb0.raw bs=<stride> count=<height>` → `pull` → host-side raw → png conversion                                   | Direct framebuffer read. Read resolution/bpp/stride from `/sys/class/graphics/fb0/`. Convert on host with Python PIL. **Warning:** On emulators this often only captures the kernel boot console, not the actual GUI.                                                                                                                                          |
| 5     | Screenshot (host VNC)           | See "Wayland/HWC targets" below                                                                                                                           | Last resort; skips when the host has no VNC client.                                                                                                                                                                                                                                                                                                            |

#### Physical device targets

Try in order; stop at the first success:

| Order | Intent                          | Command                                                                                                                                                   | Notes                                                                                                                                                             |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Screenshot (framebuffer)        | `sdb -s "$S" shell dd if=/dev/fb0 of=/tmp/fb0.raw bs=<stride> count=<height>` → `pull` → host-side raw → png conversion                                   | Direct framebuffer read. Read resolution/bpp/stride from `/sys/class/graphics/fb0/`. Convert on host with Python PIL.                                             |
| 2     | Screenshot (screencapture)      | `sdb -s "$S" shell screencapture /tmp/sshot.png` → `pull` → `shell rm /tmp/sshot.png`                                                                     | Mobile/wearable profiles.                                                                                                                                         |
| 3     | Screenshot (capture_screen)     | `sdb -s "$S" shell capture_screen /tmp/sshot.png` → `pull` → `shell rm /tmp/sshot.png`                                                                    | When `screencapture` is missing.                                                                                                                                  |
| 0     | Screenshot (enlightenment_info) | `sdb -s "$S" root on` → `shell enlightenment_info -dump_screen -p /tmp/ -n sshot.png` → `pull /tmp/sshot.png` → `shell rm -f /tmp/sshot.png` → `root off` | **Tried first.** Returns the composited UI at native resolution. Requires root; skips cleanly when `sdb root on` is refused, which is the norm on retail devices. |
| 4     | Screenshot (host VNC)           | See "Wayland/HWC targets" below                                                                                                                           | For DA appliances and other Wayland/HWC devices whose on-device dumps are black.                                                                                  |
| 5     | Screenshot (host xwd)           | Host-side: `xwininfo -root -tree` → find emulator window ID → `xwd -id <win_id> -out sshot.xwd` → Python PIL convert to PNG                               | Rarely applicable to physical devices (no X11 window on host).                                                                                                    |

#### Wayland/HWC targets (DA appliances)

With HWC (hardware composer) on, the UI sits on TDM overlay planes that the compositor never draws into its own buffer, so `-dump_screen`, `/dev/fb0` and the capture tools all return **solid black**. Any capture that is one flat color is set aside and the chain moves on. Two steps handle this case:

1. **`winfo` and HWC off** (part of the `enlightenment_info` step). Some images ship the e_info client as `winfo`. The script looks for it on the device after `sdb root on`. If the dump is one flat color, the script runs `<tool> -hwc 0` so that every plane is GL-composited, then runs `-dump_screen` again. It then turns HWC back on with `-hwc 1`: the e_info client cannot report the earlier state (`-hwc 2` only writes it to dlog). The HWC calls are bounded by a timeout, and a signal between `-hwc 0` and the restore still turns HWC back on. When turning HWC back on fails or times out, the envelope adds a `hwc_recovery_unverified` warning. `capture_method` is then `enlightenment_info -dump_screen (hwc off)` or `winfo -dump_screen (hwc off)`.
2. **Host-side VNC.** This step runs after every on-device method, and only when the host has a VNC client:
   - Client: Python `vncdotool` (`pip install vncdotool`; Windows, macOS, Linux), or `vncsnapshot` (`sudo apt install vncsnapshot` on Ubuntu). `vncsnapshot` is Linux-only here and does not support passwords.
   - Server: by default `sdb forward tcp:15900 tcp:5900` to the device's own VNC server, then `forward --remove` afterwards. Set `TIZEN_VNC_SERVER` (`host::port` or `host:display`) to use a different server.
   - Other settings, all environment variables: `TIZEN_VNC_PORT` (device port, default 5900), `TIZEN_VNC_LOCAL_PORT` (default 15900), `TIZEN_VNC_PASSWORD` (vncdotool only; read from the environment, never from the command line), `TIZEN_VNC_TIMEOUT` (default 15 s, capped at 30 s so a long VNC wait cannot push the chain past the 90 s Node timeout).
   - `capture_method` is `host-side VNC (vncdotool)` or `host-side VNC (vncsnapshot)`.

If every method still returns a flat color and the host has no VNC client, the `uniform_image` warning has a second line that says what to install. Relay that line to the user; do not install packages yourself.

When a VNC client is present but the server connection fails, the `uniform_image` warning is followed by a VNC failure line that classifies the cause (timeout, connection refused, connection failed, or authentication failed) and names the server that was tried. Relay it so the caller can fix the server side.

**Host-side xwd method (detailed steps):**

1. Find the emulator X11 window:
   ```bash
   DISPLAY=:0 xwininfo -root -tree 2>/dev/null | grep -iE '"Tizen Emulator"|"emulator-x86_64"' | head -1 | grep -oE '0x[0-9a-fA-F]+' | head -1
   ```
2. Capture the window with `xwd`:
   ```bash
   DISPLAY=:0 xwd -id <window_id> -out sshot.xwd
   ```
3. Convert XWD → PNG with Python PIL:
   ```python
   from PIL import Image
   import struct
   with open('sshot.xwd', 'rb') as f:
       data = f.read()
   header_size    = struct.unpack('>I', data[0:4])[0]
   width          = struct.unpack('>I', data[16:20])[0]
   height         = struct.unpack('>I', data[20:24])[0]
   byte_order     = struct.unpack('>I', data[28:32])[0]  # 0=LSBFirst
   bytes_per_line = struct.unpack('>I', data[48:52])[0]
   pixel_data = data[header_size:]
   raw_mode = 'BGRA' if byte_order == 0 else 'ARGB'
   img = Image.frombytes('RGBA', (width, height), pixel_data, 'raw', raw_mode, bytes_per_line, 1)
   img.save('sshot.png')
   ```

> **Why host-side xwd is preferred for emulators:** The Tizen emulator's GUI is rendered by the host's display compositor (X11/Wayland), not by the guest's framebuffer. Device-side methods (`screencapture`, `capture_screen`, `/dev/fb0`) often return "command not found" or only capture the kernel boot console. The host-side `xwd` method captures the actual emulator window as seen on screen.

## The envelope carries the image

The success envelope does not just point at a file — it carries the capture:

- `result.image.path` — absolute path
- `result.image.base64` — the image bytes, inlined when the file is at or under 512 KB
- `result.image.base64_is_thumbnail` — `true` when `base64` contains a downscaled JPEG
  thumbnail instead of the full image (happens when the original exceeds 512 KB)
- `result.image.thumbnail_mime_type` / `thumbnail_width` / `thumbnail_size_bytes` —
  present when `base64_is_thumbnail` is true
- `result.image.mime_type` / `width` / `height` / `size_bytes`
- `result.image.base64_omitted_reason` — present INSTEAD of `base64` when the file is
  too large to inline AND thumbnail generation failed. Its absence is a size decision,
  not a capture failure.
- `result.capture_method` — which fallback actually produced the image

**Always show the user the screenshot, not only its path.** If `base64` is present,
render it; otherwise read the file at `image.path`. Report `capture_method` too: a
capture from `/dev/fb0` may be only the kernel console rather than the app UI, and the
user needs to know that before trusting the image.

Showing the image does **not** replace showing the envelope — both are required. See
"Result reporting" below for the exact final-message format (and the one field you may elide).

### Recovering truncated base64

When the base64 string is transmitted through a channel that truncates it (e.g. JSON
envelope over a pipe, LLM context window limits), the image may arrive at only 40–60%
of its original length. The following recovery procedure can salvage the **top portion**
of the image:

1. **Truncate to a multiple of 4.** Base64 decodes in 4-byte groups. Truncate the
   received string to `len - (len % 4)` before decoding to avoid padding errors.

2. **Enable truncated image loading in PIL.** Set `ImageFile.LOAD_TRUNCATED_IMAGES = True`
   before opening. This tells PIL to fill the missing scanlines with zeros instead of
   raising an error.

3. **Decode and save.** The result is a valid image with the top N% intact and the
   bottom filled with black/garbage.

```python
import base64, io
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

# b64 is the (possibly truncated) base64 string from the envelope
b64 = b64[:len(b64) - (len(b64) % 4)]  # trim to multiple of 4
raw = base64.b64decode(b64)
img = Image.open(io.BytesIO(raw))
img.save("recovered.png")
print(f"Recovered: {img.size[0]}x{img.size[1]} (top portion)")
```

4. **Place verification targets at the top.** When using screenshots for automated
   verification (e.g. checking if an app launched, a dialog appeared), position the
   UI elements to verify in the **top half** of the screen. This ensures that even a
   40–60% truncated base64 image contains the region of interest.

> **Why thumbnails help:** When `base64_is_thumbnail` is true, the inlined JPEG is
> typically under 100 KB — small enough that truncation is unlikely. Use the thumbnail
> for quick verification, and fall back to the full file at `image.path` for detailed
> inspection.

### Codex CLI

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb needs a localhost TCP socket, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Result reporting — the envelope must always be shown to the user

The runner's stdout JSON Envelope is **inside the tool result, so the user cannot see it**
(the Claude Code UI folds Bash/Agent results away as "Ran 1 shell command"). What the user
sees is only the final answer text, so the final answer must follow the format below
**no matter which execution path was used (subagent delegation or direct CLI Runner run)**:

1. Put the Envelope JSON in a fenced `json` block (first item). **Only the `result.image.base64` value**
   is replaced with a placeholder per the rules below; every other field goes in verbatim, without
   modification or truncation.
2. Below it, render the screenshot image (the `base64` if present, otherwise Read `image.path`).
3. Below it, append a **1–2 line** summary of the result — `capture_method`, resolution, saved path.
   If `capture_method` is `framebuffer`, warn in one line that only the kernel console may have been
   captured; if `warnings` contains `uniform_image`, warn in one line that the screen is a uniform
   color (possibly off / a rendering failure).
   If `capture_method` has `(hwc off)` appended, mention that HWC was temporarily turned off for the
   capture and then turned back on. If `warnings` contains `hwc_recovery_unverified`, note that HWC may
   not have been turned back on and tell the user to verify HWC manually on the device. If there is a
   VNC connection failure warning (timeout / connection refused / connection failed / authentication
   failure), pass along the server address that was tried.
4. If needed, add one line suggesting next steps.

### Only the `base64` field is an exception — replace with a placeholder

This skill's success Envelope inlines the image bytes in `result.image.base64` (a source image
up to 512 KB, or a JPEG thumbnail). That string is tens to hundreds of thousands of characters
long; including it verbatim would fill the final answer with a base64 blob and push the harness's
output out to a file. Therefore **only this field's value** is replaced with the following format:

```
"base64": "<base64 omitted: 41512 chars, image/png 1920x1080 — rendered below>"
```

- Fill in the length (`chars`) and `mime_type`/`width`/`height` with the Envelope's actual values.
- If `base64_is_thumbnail` is true, use `thumbnail_mime_type`/`thumbnail_width` and append `(thumbnail)`.
- If `base64_omitted_reason` is present instead, there is nothing to replace — include it as-is.
- **Never touch any other field.** Keep `result.stdout` (the runner log) verbatim as well — it is
  the only record the user can consult for which fallback failed.

**Success example (final answer form):**

````markdown
```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "output_path": "/home/user/work/emulator_screenshot.png",
    "is_emulator": true,
    "image": {
      "path": "/home/user/work/emulator_screenshot.png",
      "size_bytes": 31132,
      "mime_type": "image/png",
      "width": 1920,
      "height": 1080,
      "base64": "<base64 omitted: 41512 chars, image/png 1920x1080 — rendered below>"
    },
    "capture_method": "host-side xwd",
    "stdout": "[INFO] Target is emulator ... SUCCESS: host-side xwd"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk screenshot",
  "user_command": "node screenshot-cli.js emulator-26101 /home/user/work/emulator_screenshot.png",
  "duration_ms": 1830
}
```

(image rendered)

Captured the emulator-26101 screen with host-side `xwd` (1920x1080, 31 KB) → `/home/user/work/emulator_screenshot.png`
````

- Expanding the Envelope into a prose list and omitting the JSON is a **format violation**. Showing
  the image does not excuse omitting the Envelope — both are mandatory. This rule takes precedence
  over the harness's general writing rules ("no code in prose", etc.) — the Envelope is not code but
  this skill's **result contract**.
- If the runner was run multiple times, include the Envelope from the **last run**, and mention earlier
  failures in at most one line in the summary.
- A failure Envelope has no `base64`, so include it **verbatim**. Do not retype `errors[0].message`/`details`;
  show what is inside the JSON as-is. Skip the image rendering step on failure.
- Show a `user_input_required` Envelope (e.g., two or more devices connected) as-is, then ask the user
  which serial to use.

## Anti-patterns

- Do not assume the host sdb version matches the device daemon; protocol mismatches surface as "device offline" with no other clue — recommend updating Tizen Studio.
- Do not parse `sdb devices` by column position. Match on the state column.
- Do not paraphrase sdb error codes; surface them verbatim so the user can search.
- Do not silently overwrite an existing screenshot file without asking the user.
- Do not redirect screenshots into the project tree without asking — files sneak into version control.
- On Windows, use PowerShell `System.Drawing.Graphics.CopyFromScreen` as a fallback when `xwd` is unavailable.
