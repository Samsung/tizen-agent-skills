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

**Windows (Cline — cmd.exe):**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*screenshot-cli.js"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\screenshot-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" [serial] [output_path]
```
Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" [serial] [output_path]
```

**Linux / macOS / Ubuntu (Bash):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/screenshot-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/screenshot-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" [serial] [output_path]
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

#### Physical device targets

Try in order; stop at the first success:

| Order | Intent                          | Command                                                                                                                                                   | Notes                                                                                                                                                             |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Screenshot (framebuffer)        | `sdb -s "$S" shell dd if=/dev/fb0 of=/tmp/fb0.raw bs=<stride> count=<height>` → `pull` → host-side raw → png conversion                                   | Direct framebuffer read. Read resolution/bpp/stride from `/sys/class/graphics/fb0/`. Convert on host with Python PIL.                                             |
| 2     | Screenshot (screencapture)      | `sdb -s "$S" shell screencapture /tmp/sshot.png` → `pull` → `shell rm /tmp/sshot.png`                                                                     | Mobile/wearable profiles.                                                                                                                                         |
| 3     | Screenshot (capture_screen)     | `sdb -s "$S" shell capture_screen /tmp/sshot.png` → `pull` → `shell rm /tmp/sshot.png`                                                                    | When `screencapture` is missing.                                                                                                                                  |
| 0     | Screenshot (enlightenment_info) | `sdb -s "$S" root on` → `shell enlightenment_info -dump_screen -p /tmp/ -n sshot.png` → `pull /tmp/sshot.png` → `shell rm -f /tmp/sshot.png` → `root off` | **Tried first.** Returns the composited UI at native resolution. Requires root; skips cleanly when `sdb root on` is refused, which is the norm on retail devices. |
| 4     | Screenshot (host xwd)           | Host-side: `xwininfo -root -tree` → find emulator window ID → `xwd -id <win_id> -out sshot.xwd` → Python PIL convert to PNG                               | Rarely applicable to physical devices (no X11 window on host).                                                                                                    |

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
"결과 보고" below for the exact final-message format (and the one field you may elide).

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

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 fenced `json` 블록에 싣는다 (첫 항목). **`result.image.base64` 값 하나만**
   아래 규칙대로 플레이스홀더로 치환하고, 나머지 필드는 수정·축약 없이 그대로 싣는다.
2. 그 아래에 스크린샷 이미지를 렌더링한다 (`base64`가 있으면 그것을, 없으면 `image.path`를 Read).
3. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 — `capture_method`, 해상도, 저장 경로.
   `capture_method`가 `framebuffer`면 커널 콘솔만 찍혔을 수 있다고, `warnings`에
   `uniform_image`가 있으면 단색 화면(꺼짐/렌더링 실패 가능)이라고 한 줄 경고한다.
4. 필요하면 다음 단계 제안을 1줄 추가한다.

### `base64` 필드만 예외 — 플레이스홀더로 치환

이 스킬의 성공 Envelope는 이미지 바이트를 `result.image.base64`에 인라인한다 (512 KB 이하 원본,
또는 JPEG 썸네일). 이 문자열은 수만~수십만 자라서 그대로 싣면 최종 답변이 base64 덩어리로
채워지고 하네스가 출력을 파일로 밀어내 버린다. 따라서 **이 필드의 값만** 다음 형식으로 바꾼다:

```
"base64": "<base64 omitted: 41512 chars, image/png 1920x1080 — rendered below>"
```

- 길이(`chars`)와 `mime_type`/`width`/`height`는 Envelope의 실제 값을 넣는다.
- `base64_is_thumbnail`이 true면 `thumbnail_mime_type`/`thumbnail_width`를 쓰고 `(thumbnail)`을 덧붙인다.
- `base64_omitted_reason`이 대신 있는 경우는 치환할 것이 없으므로 그대로 싣는다.
- **다른 필드는 절대 건드리지 않는다.** `result.stdout`(러너 로그)도 원문 유지 — 어느 fallback이
  실패했는지 사용자가 볼 수 있는 유일한 기록이다.

**Success 예시 (최종 답변 형태):**

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

(이미지 렌더링)

emulator-26101 화면을 host-side `xwd`로 캡처했습니다 (1920x1080, 31 KB) → `/home/user/work/emulator_screenshot.png`
````

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 이미지를 보여줬다고
  해서 Envelope를 생략할 수 있는 것이 아니다 — 둘 다 필수다. 하네스의 일반 작성 규칙("산문에
  코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가 아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope에는 `base64`가 없으므로 **원문 그대로** 싣는다. `errors[0].message`/`details`를
  다시 타이핑하지 말고 JSON 안의 것을 그대로 보이게 한다. 실패 시 이미지 렌더링 단계는 생략한다.
- `user_input_required` Envelope(예: 디바이스 2대 이상 연결)는 그대로 보여준 뒤 어느 serial을
  쓸지 사용자에게 질문한다.

## Anti-patterns

- Do not assume the host sdb version matches the device daemon; protocol mismatches surface as "device offline" with no other clue — recommend updating Tizen Studio.
- Do not parse `sdb devices` by column position. Match on the state column.
- Do not paraphrase sdb error codes; surface them verbatim so the user can search.
- Do not silently overwrite an existing screenshot file without asking the user.
- Do not redirect screenshots into the project tree without asking — files sneak into version control.
- On Windows, use PowerShell `System.Drawing.Graphics.CopyFromScreen` as a fallback when `xwd` is unavailable.
