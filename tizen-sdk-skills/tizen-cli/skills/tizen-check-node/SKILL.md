---
name: tizen-check-node
description: Check Node.js, node check, node 설치 확인, Node.js installed, node version, 노드 확인. Use this skill to verify Node.js is installed and on PATH before installing the Tizen SDK. Returns a Standard JSON Envelope with version/path info. Required before tizen-sdk-install.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - node check
    - node.js
    - node installed
    - node version
    - 노드 확인
    - Tizen SDK install prerequisite
---

# Check Node.js

## When to use
Pre-check before `tizen-cli tizen-sdk sdk-install`, or whenever the user asks whether Node.js is installed.

## Command

```
tizen-cli tizen-sdk check-node
```

No options.

## Output
- Success `result`: `installed`, `version` (e.g. `v24.15.0`), `path`, `major_version`.
- Failure (`node_not_found`): Node.js is missing or not on PATH — the user must install Node.js (≥ 18) manually before SDK installation; do not attempt to install it automatically.

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
- `tizen-cli tizen-sdk check-disk-space` then `tizen-cli tizen-sdk sdk-install`.
