---
name: tizen-tv-sdk-install-from-zip
description: Install TV SDK from ZIP, TV SDK ZIP install, TV SDK ZIP 설치, TV SDK ZIP으로 설치, 타이젠 TV SDK ZIP 설치, Samsung TV SDK offline install, TV extension install from ZIP, offline TV SDK, local ZIP TV SDK. Use this skill to install the Tizen TV SDK extension (TV-SAMSUNG-Public) from a local ZIP file (offline, no download). All packages must already be bundled in the ZIP. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-08"
  keywords:
    - TV SDK
    - TV SDK install from ZIP
    - TV-SAMSUNG-Public
    - 타이젠 TV SDK ZIP 설치
    - Samsung TV SDK
    - TV extension
    - offline install
    - local ZIP
---

# Tizen TV SDK Install from ZIP

## When to use
The user asks to install the TV SDK / Samsung TV extension from a local ZIP file (offline). The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
tizen-cli tizen-sdk tv-sdk-install-from-zip --zip-path <path-to-zip>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--zip-path <path>` | **yes** | — | Path to the TV SDK ZIP file containing all bundled packages |
| `--force` | no | off | Force reinstall even if already installed |

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → TV SDK already installed.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (installation can take several minutes; installer output is plain text, not JSON).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk tv-sdk-install-from-zip --zip-path <path>` and confirm `status: "success"`.

## Output
- Success `result`: TV SDK package/installation status.
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
- Create a TV web app: `tizen-cli tizen-sdk create-project --type webapp ...`
