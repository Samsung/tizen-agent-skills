---
name: tizen-gdb-debug
description: Tizen GDB debug, tizen gdb debug, 타이젠 GDB 디버깅, 원격 디버깅, 앱 디버그, Tizen 네이티브 디버깅. Use this skill for automated remote GDB debugging of Tizen NATIVE apps ONLY — device check, app start, PID lookup, gdbserver launch, port forwarding, and host GDB attach command generation. NEVER use for WebApp (.wgt) projects — web apps have no native binary and this command will refuse them.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - Tizen GDB
    - tizen native debug
    - gdbserver
    - remote debug
    - 타이젠 디버깅
    - tizen gdb debug
    - sdb port forwarding
---

# Tizen Native GDB Debug (setup-only)

## When to use
The user wants to debug a Tizen **Native** app remotely with GDB. The app must already be installed on a connected device/emulator (`install-app`).

## Do NOT use for Web apps (IMPORTANT)
**Never run this command for a WebApp (.wgt) project, even if the user asks to "debug the app".** Web apps run inside the web runtime and have no native binary — GDB cannot attach to them, and the script refuses wgt packages with an error. When the project is a WebApp:
- Do not attempt `gdb-debug` or `dotnet-debug` at all.
- Use the **`webapp-debug`** command instead — it sets up RWI/CDP (Chrome DevTools Protocol) debugging and returns a ready CDP endpoint.
- Determine the project type first (e.g. `config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET) before choosing a debug command.

## Command

```
tizen-cli tizen-sdk gdb-debug --app-id <id> --binary <path>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | **yes** | — | Tizen package ID (e.g. `org.example.myapp`) |
| `--binary <path>` | **yes** | — | Host binary path with debug symbols (approximate paths are validated/auto-searched by the script) |
| `--mode <mode>` | no | `attach` | `attach` \| `launch` (launch pauses before main) |
| `--breakpoints <list>` | no | none | Comma-separated function names, e.g. `"main,service_app_create"` |
| `--port <port>` | no | `5039` | Debug port |
| `--timeout <seconds>` | no | `30` | PID search wait (1–300, attach mode) |

## Setup-only semantics (IMPORTANT)
This command only PREPARES the session (starts the app, launches gdbserver, forwards the port, writes a gdb init file) and then exits. Interactive gdb cannot be run by an agent — **give the user `result.gdb_command` to paste into their own terminal**. gdbserver, the port forward, and the init file stay alive for their session.

## Output
- Success `result`: `gdb_command` (one or more shell-form lines) + instructions.
- Failure: `device_not_found` → run `device-manager` first; `invalid_parameters` → fix app-id/binary/breakpoint format.

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
- No device → `tizen-cli tizen-sdk device-manager`
- App not installed → `tizen-cli tizen-sdk install-app --package <tpk>`
