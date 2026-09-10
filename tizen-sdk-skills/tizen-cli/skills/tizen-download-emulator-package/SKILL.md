---
name: tizen-download-emulator-package
description: Download Tizen emulator package, emulator package download, 에뮬레이터 패키지 다운로드, 에뮬레이터 패키지 다운로드해줘, TIZEN Emulator package, install emulator package, emulator package install, 에뮬레이터 패키지 설치. Use this skill to download and install the Tizen emulator package (TIZEN-{platform_version}-Emulator) from the Tizen package repository. Reads the repository URL from repository.info. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-03"
  keywords:
    - emulator package
    - emulator package download
    - TIZEN-Emulator
    - 에뮬레이터 패키지
    - 에뮬레이터 패키지 다운로드
    - repository.info
    - emulator install
---

# Tizen Emulator Package Download

## When to use
The user asks to download / install the Tizen emulator package (TIZEN-{platform_version}-Emulator). The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
tizen-cli tizen-sdk download-emulator-package
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--platform-version <version>` | no | auto-detect latest | Tizen platform version (e.g., `10.0`, `11.0`) |
| `--force` | no | off | Force reinstall even if already installed |

## Two-phase flow (same pattern as sdk-install / tv-sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → emulator package already installed.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (download can take several minutes; installer output is plain text, not JSON).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk download-emulator-package` and confirm `status: "success"`.

## How it works

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `pkg_list_{OS}` from the Tizen package repository
3. Auto-detects the latest TIZEN-X.Y platform (or uses the specified `--platform-version`)
4. Resolves `TIZEN-{version}-Emulator` and all its Install-dependency packages
5. Downloads and merges each package into the SDK root
6. Resolves the shared `Emulator` tools too and refreshes outdated ones (keeps emulator-manager in sync with platform plugins)
7. Creates/updates the `.emulator-package-installed` marker (one `Platform version: X.Y` record per installed platform)

## Output
- Success `result`: emulator package/installation status.
- Failure: `error_code`, `message`, optional `suggested_fix.command`.

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
- Create an emulator VM: `tizen-cli tizen-sdk create-emulator ...`
- Launch an emulator: `tizen-cli tizen-sdk launch-emulator ...`
