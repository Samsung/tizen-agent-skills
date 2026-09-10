---
name: tizen-sdk-init
description: Initialize Tizen SDK path, SDK init, sdk path config, 타이젠 SDK 경로 설정, SDK 초기화, sdk init, set sdk path, configure sdk path. Use this skill to configure the Tizen SDK installation path by writing it to ~/.tizen.sdk.path.config. Validates that the path exists and is readable/writable before saving. Use after a manual SDK install or when the SDK is at a non-default path.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-23"
  keywords:
    - SDK init
    - SDK path
    - sdk path config
    - 타이젠 SDK 경로 설정
    - SDK 초기화
    - configure sdk path
    - set sdk path
---

# Tizen SDK Init

## When to use
The user asks to configure the Tizen SDK installation path, or the SDK was installed manually (not via `sdk-install`) and needs to be registered. Run this when `~/.tizen.sdk.path.config` is missing or points to a wrong/old location, before any skill that depends on the SDK path.

> **Note:** The `sdk-install` skill now **automatically writes `~/.tizen.sdk.path.config`** after a successful install (both in the pre-check CLI and in the installer scripts). Running `sdk-init` separately is only needed when the SDK was installed manually or the config file needs to point to a different path.

## Prerequisites
The Tizen SDK must already be installed at the target path. If not, use `sdk-install` first.


## Command

```
tizen-cli tizen-sdk sdk-init
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--sdk-path <path>` | no | `~/tizen-sdk` | Tizen SDK installation path |

## Output
- Success `result`: `sdk_path`, `config_file` (path to `~/.tizen.sdk.path.config`).
- Failure: `error_code` / `error_category` — `sdk_path_invalid` (path empty or does not exist), `sdk_path_not_accessible` (no read/write permission), `io_error` (config write failed).

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
- Install the SDK if not yet installed → `tizen-cli tizen-sdk sdk-install`
- Create a new project → `tizen-cli tizen-sdk create-project`
- Build a project → `tizen-cli tizen-sdk build-project`
- Verify device/emulator connection → `tizen-cli tizen-sdk device-manager`
