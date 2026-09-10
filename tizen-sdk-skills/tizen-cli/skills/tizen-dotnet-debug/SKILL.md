---
name: tizen-dotnet-debug
description: Tizen DotNET debug, tizen dotnet debug, 타이젠 닷넷 디버깅, netcoredbg, C# 디버깅, .NET 원격 디버깅, NUI 앱 디버그. Use this skill for automated remote debugging of Tizen .NET apps ONLY with netcoredbg — device check, on-demand debugger install, app start, PID lookup, and either an interactive CLI attach command or a VS Code DAP server. NEVER use for WebApp (.wgt) projects — web apps have no CoreCLR process and this command will refuse them.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - Tizen dotnet debug
    - netcoredbg
    - C# debug
    - .NET remote debug
    - 타이젠 닷넷 디버깅
    - NUI 디버그
    - coreclr debug
---

# Tizen .NET Debug with netcoredbg (setup-only)

## When to use
The user wants to debug a Tizen **.NET** (C#/NUI) app remotely. The app must already be installed on a connected device/emulator.

## Do NOT use for Web apps (IMPORTANT)
**Never run this command for a WebApp (.wgt) project, even if the user asks to "debug the app".** Web apps run inside the web runtime — there is no CoreCLR process for netcoredbg to attach to, and the script refuses wgt packages with an error. When the project is a WebApp:
- Do not attempt `dotnet-debug` or `gdb-debug` at all.
- Use the **`webapp-debug`** command instead — it sets up RWI/CDP (Chrome DevTools Protocol) debugging and returns a ready CDP endpoint.
- Determine the project type first (e.g. `config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET) before choosing a debug command.

## Command

```
tizen-cli tizen-sdk dotnet-debug --app-id <id>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | **yes** | — | Tizen package ID (e.g. `org.tizen.example.MyApp`). The launchable app id is resolved from the device (`app_launcher -l`); a package that is not installed fails with `invalid_parameters` and the installed ids in `details` |
| `--mode <mode>` | no | `launch` | `launch` (**default, recommended** — VS Code DAP server, catches `Main()`) \| `attach` (CLI netcoredbg; usually fails on Tizen: no CoreCLR debug transport, `0x80131c08`) |
| `--breakpoints <list>` | no | none | Comma-separated `File.cs:line`, e.g. `"Program.cs:25,App.cs:10"` |
| `--port <port>` | no | `4711` | DAP server port (launch mode) |
| `--serial <serial>` | no | first device | Device serial |
| `--force-install` | no | off | Reinstall netcoredbg on the device |
| `--timeout <seconds>` | no | `30` | PID search wait (1–300, attach mode) |

## Setup-only semantics (IMPORTANT)
The command installs netcoredbg on demand, starts the app, and exits. Interactive netcoredbg cannot be run by an agent:
- **launch mode (default)** → give the user `result.launch_config` (a launch.json snippet) for VS Code; the DAP server listens on the forwarded port. **The app is suspended before `Main()` and shows no window until VS Code connects (F5) — say so first; it is not a failed launch.**
- **attach mode** → give the user `result.debug_command` to paste into their terminal.

## Output
- Success `result`: `launch_config` + `note` (launch; `app_state` = `suspended_under_debugger`, `launch_app_id` = the id actually launched) or `debug_command` (attach) + instructions.
- Failure: `device_not_found` → run `device-manager`; missing `.pdb` symbols (`build_failed`) → rebuild with `--build-type Debug`; `invalid_parameters` "is not installed on the device" → the package id is not in `app_launcher -l`, `details` lists what is — do not guess ids, install first; `io_error` "did not start ... under netcoredbg" → `details` carries the raw `launch_app` output.

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
- Workload issues → `tizen-cli tizen-sdk dotnet-setup`
