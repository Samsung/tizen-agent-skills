---
name: tizen-playwright-test
description: Tizen Playwright test, tizen playwright test, 타이젠 플레이라이트 테스트, 웹앱 자동화 테스트, 웹앱 테스트, E2E 테스트, UI 자동화 테스트, wgt 테스트, playwright 테스트 실행, automated webapp testing, run playwright tests, web app UI test, connectOverCDP test, scaffold playwright test. Use this skill to RUN (or scaffold) Playwright tests against a Tizen Web app (.wgt) ONLY over RWI/CDP — it sets up debug mode + port forward via the webapp-debug flow, then executes `node <test-file>` in the user's test project and returns pass/fail in the envelope. NEVER use for Native (.tpk C/C++) or DotNET apps — they have no web runtime, so Playwright cannot attach; use gdb-debug or dotnet-debug for debugging those.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-11"
  keywords:
    - Tizen playwright test
    - 타이젠 플레이라이트 테스트
    - 웹앱 자동화 테스트
    - E2E 테스트
    - wgt 테스트
    - Playwright connectOverCDP
    - UI automation
    - automated webapp testing
---

# Tizen Web App Playwright Test over RWI/CDP

## When to use
The user wants to run **automated Playwright tests** against a Tizen **Web** (.wgt HTML/JS/CSS) app — assertions, UI automation, E2E checks. The app must already be installed on a connected device/emulator. (For interactive DevTools debugging use `webapp-debug` instead.)

## Do NOT use for Native or .NET apps (IMPORTANT)
**Never run this command for a Native (.tpk C/C++) or DotNET project, even if the user asks to "test the app".** Only Web apps run inside the web runtime — Playwright attaches over CDP, and a native binary or CoreCLR process has no CDP endpoint. When the project is NOT a WebApp:
- Do not attempt `playwright-test` at all.
- Native (C/C++) app → `gdb-debug`; DotNET app → `dotnet-debug` (debugging, not Playwright).
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET).

## Command

```
tizen-cli tizen-sdk playwright-test --app-id <id> --project-dir <dir>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | for a run | — | Tizen web app ID (e.g. `abcDEF1234.MyWebApp`) |
| `--test-file <path>` | no | `<project-dir>/tizen-playwright.test.js` | Test script to execute with node |
| `--project-dir <path>` | no (yes for `--scaffold`) | cwd / test-file dir | Test project dir (cwd for the run; needs `playwright` in `node_modules`) |
| `--port <port>` | no | `9222` | Host port forwarded to the device RWI port |
| `--serial <serial>` | no | first device | Device serial |
| `--setup-timeout <seconds>` | no | `30` | CDP setup readiness timeout (1–300) |
| `--timeout <seconds>` | no | `120` | Test run timeout (1–600) |
| `--no-setup` | no | off | Reuse an already-live CDP endpoint (skip debug relaunch + forward) |
| `--scaffold` | no | off | Generate `tizen-playwright.test.js` (+ `package.json` if absent) into `--project-dir` and exit |
| `--force` | no | off | Overwrite an existing scaffolded test file (with `--scaffold`) |

## Playwright dependency (IMPORTANT)
Playwright resolves from the **test project's** `node_modules` — never from this plugin. On `dependency_missing`, run `npm install playwright` in the test project directory and retry. The scaffolded template attaches to the ALREADY-RUNNING app page (`connectOverCDP` → `contexts()[0].pages()[0]`) — it never navigates or opens pages.

## Output
- Success `result`: `passed`, `exit_code`, `summary` (assertion counts from the `TEST_RESULT:` marker), `output_tail`, `cdp_endpoint` + `note` (the RWI session/forward stay alive — rerun with `--no-setup` while the app runs).
- Failure: `test_failed` → assertions failed, relay `output_tail` + `test-failure.png`, do NOT auto-retry; `dependency_missing` → `npm install playwright` in the project dir; `inspector_not_available` → app restarted or image lacks RWI, re-run without `--no-setup`; `test_timeout` → raise `--timeout` once; `invalid_parameters` mentioning `--scaffold` → no test file yet, scaffold one; `device_not_found` → run `device-manager`.

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
- Interactive DevTools debugging instead → `tizen-cli tizen-sdk webapp-debug`
- No device → `tizen-cli tizen-sdk device-manager`
- App not installed → `tizen-cli tizen-sdk install-app`
- Native app → `tizen-cli tizen-sdk gdb-debug`; .NET app → `tizen-cli tizen-sdk dotnet-debug`
