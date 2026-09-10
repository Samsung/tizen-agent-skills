---
name: tizen-update-package
description: Update Tizen SDK packages, package update, 패키지 업데이트, 패키지 업데이트해줘, SDK 패키지 업데이트, update packages, upgrade packages, tizen package update. Use this skill to check for and install available updates for installed Tizen SDK packages. Downloads the latest package list, compares versions with installed manifests, and updates outdated packages.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-23"
  keywords:
    - Tizen SDK package update
    - package update
    - 패키지 업데이트
    - SDK update
    - upgrade packages
    - pkg_list
---

# Tizen SDK Package Update

## When to use
The user asks to update Tizen SDK packages. The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
tizen-cli tizen-sdk update-package
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--force` | no | off | Force update all installed packages regardless of version |
| `--dry-run` | no | off | List outdated packages without updating |

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → a Phase 2 run finished within the last 30 minutes with `failed 0` (all packages up-to-date or updated).
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (update can take several minutes; updater output is plain text, not JSON).
   - `status: "failure"` starting "Package update finished with failures" → a fresh run recorded failed packages; this is the final result — report it, do not relaunch blindly.
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk update-package` right away and confirm `status: "success"`. The updater writes `<sdk-path>/.package-update-result` on exit; the re-run reads it (honoured for 30 minutes; `--force` / `--dry-run` only accept a run of the same kind) and returns that run's real envelope. If the launcher envelope comes back again, the updater died before writing the marker — read the background task's log tail.

## What the updater does

1. Downloads `{PKG_REPO_URL}/pkg_list_{OS}-{32,64}` from the Tizen package repository
2. Scans `{TIZEN_SDK_PATH}/.package/` for installed package manifests (`{pkg}.manifest`)
3. For each installed package, compares the installed version with the version in the downloaded package list
4. If a newer version is available, downloads and installs the update
5. Reports summary: updated / skipped / failed / up-to-date counts

## Output
- Success `result`: package update summary with counts.
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
- Build a project with updated packages: `tizen-cli tizen-sdk build-project ...`
- Create a new project: `tizen-cli tizen-sdk create-project ...`
