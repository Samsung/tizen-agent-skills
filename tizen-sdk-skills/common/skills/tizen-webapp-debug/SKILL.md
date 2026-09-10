---
name: tizen-webapp-debug
description: Tizen WebApp debug, tizen webapp debug, 타이젠 웹앱 디버깅, 웹앱 디버깅, RWI, Remote Web Inspector, CDP, Chrome DevTools 디버깅, wgt 디버깅, Playwright connectOverCDP, web inspector debugging. Use this skill for automated remote debugging of Tizen Web apps (.wgt) ONLY via RWI/CDP — device check, debug-mode app launch (app_launcher -w), RWI port forwarding, and CDP endpoint verification; returns the CDP endpoint plus Playwright/DevTools connect snippets. NEVER use for Native (.tpk C/C++) or DotNET apps — they have no web runtime; use tizen-gdb-debug or tizen-dotnet-debug instead.
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

## Do NOT use for Native or .NET apps (IMPORTANT)

**Never run this flow for a Native (.tpk C/C++) or DotNET project, even if the user asks to "debug the app".**
Only Web apps run inside the web runtime (Chromium-based engine) — a native binary or CoreCLR
process has no RWI server to expose, and the script auto-detects non-wgt packages on the device
and refuses them with an error. When the project is NOT a WebApp:

- Do not attempt `tizen-webapp-debug` at all.
- Native (C/C++) app → `tizen-gdb-debug`; DotNET app → `tizen-dotnet-debug`.
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native;
  `.csproj` → DotNET) before choosing a debug flow.

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-webapp-debug` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-webapp-debug`)
2. 수집된 입력(App ID, 호스트 포트, 시리얼)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (fallback when the Agent tool is unavailable)

**⚠️ Pick the snippet by the TOOL you run it in, NOT by the OS.** In Claude Code the Bash
tool runs **Git Bash even on Windows** — bash syntax works there and `$HOME` maps to
`%USERPROFILE%`. **NEVER put PowerShell/cmd syntax (`$env:`, `Get-ChildItem`, `cmd /c dir /s /b`,
`Write-Host`) into the Bash tool** — it fails with `command not found` regardless of
whether the CLI file exists.

**Claude Code — Bash tool (ALL platforms, including Windows):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/webapp-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/webapp-debug-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" --app-id <APP_ID> [--port 9222] [--serial <serial>] [--timeout 30]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

**Cline on Windows ONLY (`execute_command` = cmd.exe / PowerShell, no Bash tool):**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\webapp-debug-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" --app-id <APP_ID> [--port 9222] [--serial <serial>] [--timeout 30]
```
Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" --app-id <APP_ID> [--port 9222] [--serial <serial>] [--timeout 30]
```

### Codex CLI — run the setup as a job (one exec call waits ≤ 30 s)

The setup relaunches the app in debug mode (up to 3 attempts) and waits for the CDP endpoint (up
to `--timeout`, default 30 s) — it can pass Codex's 30 s per tool call, after which only the
runner's header comes back while the setup keeps running (issue #48). Add **`--background`**: the
runner returns a job receipt (`result.job_id`) within a second, then poll
`node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per call; `progress_tail`/
`log_file` show the live script output) until `job.state` is `done` — that response **is** this
runner's envelope with the CDP endpoint.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb port forwarding and the RWI/CDP endpoint need localhost sockets, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

- `--app-id <id>` (required) — Tizen web app ID, e.g. `abcDEF1234.MyWebApp`
- `--port <port>` (optional, default `9222`) — host port forwarded to the device RWI port
- `--serial <serial>` (optional) — device serial (default: first connected device)
- `--timeout <sec>` (optional, default `30`) — CDP endpoint readiness timeout

Exit code: `0` = success envelope, `1` = failure/error envelope.

## Inputs — how to obtain them (no sdb)

**Never run `sdb devices`, `sdb shell pkgcmd -l`, `sdb shell app_launcher …`, `sdb forward` or
any other `sdb` command to gather inputs, and never search for the sdb binary — the runner does
device discovery, the debug-mode launch (`app_launcher -w`) and the RWI port forward itself
(issue #94).**

- **`--app-id`** — from the project: the `id` attribute of `<tizen:application id="…">` in the
  web app's `config.xml` (Read tool); otherwise ask the user. Do not list packages on the device.
- **`--serial`** — omit it; the runner uses the single connected device. With several devices,
  ask the user (or use `tizen-device-manager`'s `result.device_serial`). On `device_not_found`,
  hand off to `tizen-device-manager` — do not probe with sdb.
- **`--port`** — default unless the user asks for a specific host port.

## Result Handling

- **Success:** Highlight `result.connect.devtools` as THE link — it is the direct Chrome
  DevTools inspector URL (`http://127.0.0.1:<port>/devtools/inspector.html?ws=...`) the
  user opens in Chrome; do NOT list `/json/list`, `chrome://inspect`, or raw WebSocket
  URLs as extra options. Also relay `result.connect.playwright` (a ready-to-use
  `chromium.connectOverCDP(...)` snippet) and `result.note`: the RWI session and the port
  forward stay alive after setup, so the user can connect/reconnect anytime while the app
  runs.
- **Not a web app (failure, `invalid_parameters`):** Do NOT retry. Route Native apps to
  `tizen-gdb-debug`, .NET apps to `tizen-dotnet-debug`.
- **RWI/CDP unavailable (failure, `inspector_not_available`):** The image may not support the
  Remote Web Inspector (emulator/dev images do), or the endpoint did not answer in time —
  relay the message; retry once with a longer `--timeout` if it was a timeout.
- **No device (failure, `device_not_found`):** → `tizen-device-manager`

The runner is **setup-only** — it verifies the CDP endpoint and returns connect snippets for
the user. Do NOT install Playwright or start browser sessions yourself — to RUN automated
Playwright tests against the endpoint, hand off to `tizen-playwright-test`.

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Handoff

- Automated E2E/UI testing with Playwright → `tizen-playwright-test`
- Native (.tpk C/C++) app → `tizen-gdb-debug` (this skill is web-only)
- DotNET app → `tizen-dotnet-debug`
- SDK not installed → `tizen-sdk-install`
- App not built/installed → `tizen-build-project` then `tizen-install-app`
- No device/emulator → `tizen-device-manager`
