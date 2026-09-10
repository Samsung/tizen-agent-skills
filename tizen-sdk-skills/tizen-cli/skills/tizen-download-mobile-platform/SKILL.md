---
name: tizen-download-mobile-platform
description: Download Tizen Mobile platform, 모바일 플랫폼 다운로드, MOBILE platform download, IOT-Headed extension download, download MOBILE-{version}, download IOT-Headed extension. Use this skill to download and install the Tizen Mobile platform package (MOBILE-{version}) from the Tizen package repository, with optional IOT-Headed extension support.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-13"
  keywords:
    - Tizen Mobile platform
    - MOBILE platform download
    - IOT-Headed extension
    - 타이젠 모바일 플랫폼
    - 모바일 플랫폼 다운로드
---

# Tizen Download Mobile Platform

## When to use

The user asks to download and install the Tizen Mobile platform package (MOBILE-{version}) or the IOT-Headed extension. This skill:

1. Downloads the MOBILE-{version} platform package and its dependencies from the Tizen package repository
2. Optionally downloads the IOT-Headed extension by:
   - First downloading `{pkg_repo}/extension_info.xml` to get the IoT Headed repository URL
   - Then downloading `pkg_list_{os}-{64,32}` from the IoT repository
   - Finally downloading and installing `IOT-Headed-{version}` package

**Prerequisites:** Tizen SDK must be installed first (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
# Download Mobile platform only (auto-detects latest MOBILE-X.Y):
tizen-cli tizen-sdk download-mobile-platform

# Download specific Mobile platform version:
tizen-cli tizen-sdk download-mobile-platform --platform-version 10.0

# Download Mobile platform with IOT-Headed extension:
tizen-cli tizen-sdk download-mobile-platform --include-iot-headed

# Download Mobile platform with specific IOT-Headed version:
tizen-cli tizen-sdk download-mobile-platform --include-iot-headed --iot-headed-version 10.0

# Force reinstall:
tizen-cli tizen-sdk download-mobile-platform --force
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--platform-version <version>` | no | Auto-detect latest | Tizen Mobile platform version (e.g., 10.0, 11.0). Auto-detects the latest MOBILE-X.Y if not specified. |
| `--include-iot-headed` | no | false | Also download and install the IOT-Headed extension. First downloads `extension_info.xml` to get the IoT Headed repository URL, then downloads `IOT-Headed-{version}`. |
| `--iot-headed-version <version>` | no | Auto-detect latest | Specific IOT-Headed version to install. Requires `--include-iot-headed`. Auto-detects latest if not specified. |
| `--force` | no | false | Force reinstall even if already installed |

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → Mobile platform already installed.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool. For long-running downloads (several minutes), use `run_in_background: true` (Claude Code) or run in foreground (Cline).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk download-mobile-platform` and confirm `status: "success"`.

## IOT-Headed Extension Download Flow

When `--include-iot-headed` is specified:

1. Download `extension_info.xml` from the main package repository
2. Parse the XML to extract the IoT Headed repository URL (looks for `<extension name="IoT-Headed"><repository>URL</repository></extension>`)
3. Download `pkg_list_{OS}-{64,32}` from the IoT repository
4. Auto-detect or use specified `IOT-Headed-{version}` package
5. Resolve and download IOT-Headed package and its dependencies
6. Merge into SDK root and create marker

## Output

- **Success `result`**: Mobile platform package/installation status, plus `iot_headed_installed: true/false` if IOT-Headed was requested
- **Failure**: `error_code`, `message`, optional `suggested_fix.command`

## Markers Created

- `.mobile-platform-installed` — Created in SDK root after successful Mobile platform installation
  - Contains: Target package name, platform version, and IOT-Headed status if applicable

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

`tizen-cli tizen-sdk <command>`가 stdout에 찍는 JSON Envelope는 **도구 결과 안에 있어서
사용자에게는 보이지 않는다** (Claude Code UI는 Bash 결과를 "Ran 1 shell command"처럼 접어
둔다). 터미널에서 직접 실행하면 JSON이 그대로 보이지만, 에이전트 세션에서 사용자에게 보이는
것은 최종 답변 텍스트만이다. 따라서 최종 답변은 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
   stderr로 나오는 `[DEBUG] ...` 줄은 Envelope가 아니므로 제외한다.
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 명령을 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Follow-ups

- Download emulator package: `tizen-cli tizen-sdk download-emulator-package ...`
- Create a Mobile project: `tizen-cli tizen-sdk create-project ...`
- Build a project: `tizen-cli tizen-sdk build-project ...`
- Install on device: `tizen-cli tizen-sdk install-app ...`

## Example Flow

```
# Step 1: Check if SDK is installed (prerequisite)
tizen-cli tizen-sdk sdk-install

# Step 2: Download Mobile platform with IOT-Headed extension
tizen-cli tizen-sdk download-mobile-platform --include-iot-headed

# If Phase 1 returns suggested_fix, execute it:
# (The agent runs the installer script in background/foreground)

# Step 3: Verify installation
tizen-cli tizen-sdk download-mobile-platform
# Should return status: "success" with iot_headed_installed: true
```

## Error Handling

| Error | Cause | Resolution |
|---|---|---|
| `sdk_path_invalid` | Tizen SDK not installed | Run `tizen-cli tizen-sdk sdk-install` first |
| `execution_error` (script not found) | CLI runner script missing | Reinstall the plugin or check plugin cache |
| `execution_error` (download failed) | Network/repository unreachable | Check network connection and repository URL |
| `execution_error` (extension_info.xml not found) | IOT-Headed extension not available in repository | The repository may not support IOT-Headed; try without `--include-iot-headed` |
