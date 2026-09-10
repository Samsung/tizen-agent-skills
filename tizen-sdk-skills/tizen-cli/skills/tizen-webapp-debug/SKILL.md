---
name: tizen-webapp-debug
description: Tizen WebApp debug, tizen webapp debug, 타이젠 웹앱 디버깅, 웹앱 디버깅, RWI, Remote Web Inspector, CDP, Chrome DevTools 디버깅, wgt 디버깅, Playwright connectOverCDP, web inspector debugging. Use this skill for automated remote debugging of Tizen Web apps (.wgt) ONLY via RWI/CDP — device check, debug-mode app launch (app_launcher -w), RWI port forwarding, and CDP endpoint verification; returns the CDP endpoint plus Playwright/DevTools connect snippets. NEVER use for Native (.tpk C/C++) or DotNET apps — they have no web runtime; use gdb-debug or dotnet-debug instead.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-10"
  keywords:
    - Tizen webapp debug
    - Remote Web Inspector
    - RWI
    - CDP
    - Chrome DevTools
    - 타이젠 웹앱 디버깅
    - wgt 디버깅
    - Playwright connectOverCDP
---

# Tizen Web App Debug via RWI/CDP (setup-only)

## When to use
The user wants to debug a Tizen **Web** (.wgt HTML/JS/CSS) app remotely. The app must already be installed on a connected device/emulator.

## Do NOT use for Native or .NET apps (IMPORTANT)
**Never run this command for a Native (.tpk C/C++) or DotNET project, even if the user asks to "debug the app".** Only Web apps run inside the web runtime — a native binary or CoreCLR process has no RWI server to expose, and the script refuses non-wgt packages with an error. When the project is NOT a WebApp:
- Do not attempt `webapp-debug` at all.
- Native (C/C++) app → `gdb-debug`; DotNET app → `dotnet-debug`.
- Determine the project type first (e.g. `config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET) before choosing a debug command.

## Command

```
tizen-cli tizen-sdk webapp-debug --app-id <id>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | **yes** | — | Tizen web app ID (e.g. `abcDEF1234.MyWebApp`) |
| `--port <port>` | no | `9222` | Host port forwarded to the device RWI port |
| `--serial <serial>` | no | first device | Device serial |
| `--timeout <seconds>` | no | `30` | CDP endpoint readiness timeout (1–300) |

## Setup-only semantics (IMPORTANT)
The command relaunches the app in web-debug mode (`app_launcher -w -s`), forwards the host port to the device RWI port, verifies the CDP endpoint (`/json/version`, `/json/list`), and exits. The RWI session and the port forward stay alive:
- highlight `result.connect.devtools` as THE link — the direct Chrome DevTools inspector URL (`http://127.0.0.1:<port>/devtools/inspector.html?ws=...`) the user opens in Chrome; do NOT list `/json/list`, `chrome://inspect`, or raw WebSocket URLs as extra options;
- also give the user `result.connect.playwright` — a ready-to-use `chromium.connectOverCDP(...)` snippet.

## Output
- Success `result`: `cdp_endpoint`, `host_port`, `device_port`, `pages`, `connect` snippets + `note`.
- Failure: `device_not_found` → run `device-manager`; `invalid_parameters` ("not a Web app") → use `gdb-debug`/`dotnet-debug`; `inspector_not_available` → the image may not support RWI, or retry with a longer `--timeout`.

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
- Run automated Playwright tests against the endpoint → `tizen-cli tizen-sdk playwright-test`
- No device → `tizen-cli tizen-sdk device-manager`
- App not installed → `tizen-cli tizen-sdk install-app`
- Native app → `tizen-cli tizen-sdk gdb-debug`; .NET app → `tizen-cli tizen-sdk dotnet-debug`
