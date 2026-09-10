---
name: tizen-dotnet-setup
description: Setup .NET development environment for Tizen, tizen dotnet setup, 타이젠 닷넷 개발 환경 설정, dotnet workload install tizen, .NET SDK 확인, Tizen workload 설치, 닷넷 워크로드 설치. Use this skill to verify the .NET SDK is installed and install the Tizen .NET workload before creating or building a DotNET Tizen project.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-28"
  keywords:
    - .NET SDK
    - Tizen workload
    - dotnet workload install tizen
    - 타이젠 닷넷 설정
    - 닷넷 워크로드
---

# Tizen .NET Setup

## When to use
Before creating or building a **DotNET** Tizen project, or when the user asks to set up the .NET/Tizen workload.

## Command

```
tizen-cli tizen-sdk dotnet-setup
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--force` | no | off | Reinstall the workload even if it exists |
| `--workload-version <version>` | no | latest | Specific Tizen workload version |
| `--no-install-sdk` | no | off | Do not auto-install a missing .NET SDK (by default one is installed user-scope — Linux/macOS `~/.dotnet`, Windows `%LOCALAPPDATA%\Microsoft\dotnet` — no sudo/admin needed) |
| `--sdk-channel <channel>` | no | 8.0 | .NET SDK channel for the auto-install |

Workload installation takes several minutes — set the Bash tool timeout to 600000 ms and run in the foreground (the command is idempotent; retrying after a timeout is safe).

## Output
- Success `result`: .NET SDK and Tizen workload status.
- Failure `dotnet_sdk_not_found`: the .NET SDK is missing AND the user-scope auto-install was skipped (`--no-install-sdk`) or failed (offline/proxy is the usual cause) — the user installs the SDK (the no-sudo dotnet-install route is recommended), then re-runs this command: the re-run is what installs the Tizen workload.
- Failure `dotnet_workload_target_mismatch`: the workload was installed into a different .NET SDK band/directory than the one in use. The error details carry the diagnostic facts; relay them and stop.
- Failure `dotnet_workload_permission_denied`: the SDK directory is not writable (typical for apt/dnf installs). Relay `suggested_fix.command` — the exact `sudo bash <script>` (Linux/macOS) or Administrator PowerShell re-run — and stop. Never run sudo yourself; the runner cannot prompt for a password. (The message also names the sudo-free alternative: a user-scope SDK via dotnet-install, then a re-run.)

## Important
On a failure/error envelope, return it and **STOP**. Do not run manual diagnostics (`dotnet --list-sdks`, `dotnet workload list`, directory inspection) — the runner already collected all facts in `errors[0].details`. Do not re-run with `--force`.

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
- `tizen-cli tizen-sdk create-project --type dotnet ...`
- `tizen-cli tizen-sdk build-project ...`
