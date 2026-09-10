---
name: tizen-file-transfer
description: Tizen file transfer, sdb push, sdb pull, 파일 전송, 파일 푸시, 파일 풀, push file to device, pull file from device, copy file to device, copy file from device, 디바이스에 파일 복사, 디바이스에서 파일 복사. Use this skill to push (host→device) or pull (device→host) files and directories between the host computer and a connected Tizen device/emulator via sdb.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-24"
  keywords:
    - sdb push
    - sdb pull
    - file transfer
    - 파일 전송
    - push file
    - pull file
    - copy to device
    - copy from device
    - 디바이스 파일 복사
---

# Push / Pull Files Between Host and Tizen Device

## When to use
Any request to copy files or directories between the host computer and a Tizen device/emulator using `sdb push` or `sdb pull`.

## Prerequisites
A connected device or emulator — run `tizen-cli tizen-sdk device-manager` first if none is connected.

## Command

```
tizen-cli tizen-sdk file-transfer --direction <push|pull> --remote <path> [--local <path>] [--serial <serial>] [--with-utf8]
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--direction` | **yes** | — | `push` (host→device) or `pull` (device→host) |
| `--remote` | **yes** | — | Remote (device) file/directory path |
| `--local` | push: **yes**, pull: no | (auto) | **PUSH:** Local file/directory path. **PULL:** Optional output path; omit for default location |
| `--serial` | no | auto | Target device serial (omit to auto-select the single connected device) |
| `--with-utf8` | no | off | Handle UTF-8 encoded paths |

## Output
- Success `result`: `direction`, `local_path`, `remote_path`, `device_serial`, `bytes_transferred`, `status`.
- Failure `remote_path_not_found` (`TIZEN_SDK_IO_E003`, pull): the device path does not exist; nothing was transferred. **Stop** — show the envelope, ask the user for the correct path. Do not retry the same path or try spelling variants.
- Failure `invalid_parameters` "Local path not found" (push): the host path does not exist. **Stop** and ask; do not guess.
- Failure `device_not_found` (`TIZEN_SDK_DEVICE_E001`): no connected device — run `tizen-cli tizen-sdk device-manager` first, then retry **once** with its `result.device_serial`.
- Failure `io_error`: `errors[0].details` carries the raw sdb output. Re-run at most once; then report and stop.
- Windows host paths such as `C:\logs\` are accepted as typed (backslashes are normalized).

## Examples

**PUSH — host to device**
```bash
# Push a file to device
tizen-cli tizen-sdk file-transfer --direction push --local ./myfile.txt --remote /opt/usr/apps/myfile.txt

# Push a directory recursively
tizen-cli tizen-sdk file-transfer --direction push --local ./mydir --remote /opt/usr/apps/mydir

# Push to specific device
tizen-cli tizen-sdk file-transfer --direction push --local ./myfile.txt --remote /opt/usr/apps/myfile.txt --serial emulator-26101
```

**PULL — device to host**
```bash
# Pull a file from device to default location
tizen-cli tizen-sdk file-transfer --direction pull --remote /opt/usr/apps/myfile.txt

# Pull a file from device to specific local path
tizen-cli tizen-sdk file-transfer --direction pull --remote /opt/usr/apps/myfile.txt --local ./myfile.txt

# Pull from specific device
tizen-cli tizen-sdk file-transfer --direction pull --remote /opt/usr/apps/myfile.txt --local ./myfile.txt --serial emulator-26101
```

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
- Install an app package → `tizen-cli tizen-sdk install-app`
- Build a project → `tizen-cli tizen-sdk build-project`
- Connect a device → `tizen-cli tizen-sdk device-manager`
