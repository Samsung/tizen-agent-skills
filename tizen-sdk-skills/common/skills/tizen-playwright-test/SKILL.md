---
name: tizen-playwright-test
description: Tizen Playwright test, tizen playwright test, 타이젠 플레이라이트 테스트, 웹앱 자동화 테스트, 웹앱 테스트, E2E 테스트, UI 자동화 테스트, wgt 테스트, playwright 테스트 실행, automated webapp testing, run playwright tests, web app UI test, connectOverCDP test, scaffold playwright test. Use this skill to RUN (or scaffold) Playwright tests against a Tizen Web app (.wgt) ONLY over RWI/CDP — it sets up debug mode + port forward via the webapp-debug flow, then executes `node <test-file>` in the user's test project and returns pass/fail in the envelope. NEVER use for Native (.tpk C/C++) or DotNET apps — they have no web runtime, so Playwright cannot attach; use tizen-gdb-debug or tizen-dotnet-debug for debugging those.
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

## Do NOT use for Native or .NET apps (IMPORTANT)

**Never run this flow for a Native (.tpk C/C++) or DotNET project, even if the user asks to
"test the app".** Only Web apps run inside the web runtime (Chromium-based engine) — Playwright
attaches over CDP, and a native binary or CoreCLR process has no CDP endpoint to attach to.
When the project is NOT a WebApp:

- Do not attempt `tizen-playwright-test` at all.
- Native (C/C++) app → `tizen-gdb-debug`; DotNET app → `tizen-dotnet-debug` (debugging, not Playwright).
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native;
  `.csproj` → DotNET) before choosing a flow.

## Playwright lives in the TEST PROJECT, never in the plugin (IMPORTANT)

The runner spawns `node <test-file>` inside the test project directory, so `require('playwright')`
resolves from **that project's `node_modules`**. Never `npm install` anything into the plugin
cache, and never `require('playwright')` from plugin code. When the envelope says
`dependency_missing`, run `npm install playwright` **in the test project directory** and retry.

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-playwright-test` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-playwright-test`)
2. 수집된 입력(App ID, 테스트 파일/프로젝트 디렉터리, 호스트 포트, 시리얼)을 프롬프트로 전달
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
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/playwright-test-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/playwright-test-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" --app-id <APP_ID> --project-dir <dir> [--test-file <path>] [--port 9222] [--serial <serial>] [--timeout 120] [--no-setup]
# Scaffold a test file first (no device needed):
node "$CLI" --scaffold --project-dir <dir> --app-id <APP_ID> [--force]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

**Cline on Windows ONLY (`execute_command` = cmd.exe / PowerShell, no Bash tool):**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*playwright-test-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*playwright-test-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*playwright-test-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*playwright-test-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\playwright-test-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" --app-id <APP_ID> --project-dir <dir> [--test-file <path>] [--port 9222]
```
Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" --app-id <APP_ID> --project-dir <dir> [--test-file <path>] [--port 9222]
```

### Codex CLI — run the tests as a job (one exec call waits ≤ 30 s)

A test run is the debug-mode setup (up to `--setup-timeout`, default 30 s) plus the test itself
(up to `--timeout`, default 120 s) — well beyond Codex's 30 s per tool call, after which only the
runner's header would come back while the tests keep running (issue #48). Add **`--background`**:
the runner returns a job receipt (`result.job_id`) within a second, then poll
`node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per call; `progress_tail`/
`log_file` show the live output) until `job.state` is `done` — that response **is** this runner's
test envelope (pass/fail). Only `--scaffold` is quick enough to run in the foreground.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: the CDP endpoint and sdb port forwarding need localhost sockets, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

- `--app-id <id>` (required for a run; optional for `--scaffold`) — Tizen web app ID, e.g. `abcDEF1234.MyWebApp`
- `--test-file <path>` (optional) — test script; default `<project-dir>/tizen-playwright.test.js`
- `--project-dir <dir>` (optional) — test project directory (cwd for the run; needs `playwright` in its `node_modules`)
- `--port <port>` (optional, default `9222`) — host port forwarded to the device RWI port
- `--serial <serial>` (optional) — device serial (default: first connected device)
- `--setup-timeout <sec>` (optional, default `30`) — CDP setup readiness timeout
- `--timeout <sec>` (optional, default `120`) — test run timeout (1–600)
- `--no-setup` (optional) — reuse an already-live CDP endpoint (skip the debug-mode relaunch)
- `--scaffold` (optional) — generate `tizen-playwright.test.js` (+ `package.json` if absent) into `--project-dir` and exit
- `--force` (optional, with `--scaffold`) — overwrite an existing scaffolded test file

Exit code: `0` = success envelope, `1` = failure/error envelope.

## Inputs — how to obtain them (no sdb)

**Never run `sdb devices`, `sdb shell pkgcmd -l`, `sdb shell app_launcher -l`, `sdb forward` or
any other `sdb` command to gather inputs for this skill, and never search for the sdb binary.
The runner performs device discovery, debug-mode launch and port forwarding internally
(issue #94).** Get the inputs like this:

- **`--app-id`** — read it from the project, not the device: the `id` attribute of
  `<tizen:application id="…">` in the web app's `config.xml` (Read tool). If the project is not
  at hand or has no `config.xml`, ask the user for the app id. Do not list packages on the
  device to find it.
- **`--project-dir`** — the directory the user's test lives in (or wants it scaffolded into).
- **`--serial`** — omit it; the runner uses the single connected device. Only if the user has
  several devices, ask which one (or run the `tizen-device-manager` runner and use its
  `result.device_serial`). A `device_not_found` failure means no device — hand off to
  `tizen-device-manager`; do not probe with sdb first.
- **`--port`** — leave the default unless the user asks for a specific host port.

## Typical flow

1. No test file yet → run with `--scaffold --project-dir <dir> --app-id <id>`, then
   `npm install playwright` **in that directory** (agent may run this in the user's project).
2. Edit the scaffolded test's `── Your tests ──` section for the app's actual selectors
   (attach-only — the template never navigates; it attaches to the running app page).
3. Run: `--app-id <id> --project-dir <dir>` — the app is relaunched in debug mode and the
   test executes against the live page.
4. Re-run quickly with `--no-setup` while the app keeps running (an app RESTART invalidates
   the RWI port — drop `--no-setup` then).

## Result Handling

- **Success:** Relay `result.summary` (assertion counts), `result.output_tail` highlights,
  and `result.note` (the RWI session and the port forward stay alive — rerun with
  `--no-setup` while the app runs).
- **Test failed (failure, `test_failed`):** Do NOT auto-retry — the app's behavior did not
  match the assertions. Relay `errors[0].message` and the `output_tail` FAIL lines; mention
  `test-failure.png` in the project dir if the output references it.
- **Playwright missing (failure, `dependency_missing`):** Run `npm install playwright` in the
  test project directory (NEVER in the plugin cache), then retry.
- **Endpoint dead (failure, `inspector_not_available`):** The app was restarted (RWI port
  invalidated) or the image does not support RWI — re-run WITHOUT `--no-setup`; if it
  persists, the image may not support the Remote Web Inspector (emulator/dev images do).
- **Hung test (failure, `test_timeout`):** Raise `--timeout` ONCE; if it still hangs, the test
  likely waits on a selector that never appears or lacks `process.exit`/`browser.close()`.
- **No test file (failure, `invalid_parameters` mentioning `--scaffold`):** Offer to scaffold.
- **Not a web app (failure, `invalid_parameters`):** Do NOT retry. Route Native apps to
  `tizen-gdb-debug`, .NET apps to `tizen-dotnet-debug`.
- **No device (failure, `device_not_found`):** → `tizen-device-manager`

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

- Interactive debugging (DevTools/inspector) instead of automated tests → `tizen-webapp-debug`
- Native (.tpk C/C++) app → `tizen-gdb-debug` (this skill is web-only)
- DotNET app → `tizen-dotnet-debug`
- SDK not installed → `tizen-sdk-install`
- App not built/installed → `tizen-build-project` then `tizen-install-app`
- No device/emulator → `tizen-device-manager`
