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

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-dotnet-setup` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-dotnet-setup`)
2. 수집된 입력(force/version 옵션)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\dotnet-setup-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-setup-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-setup-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

### Codex CLI — run the workload install as a job (one exec call waits ≤ 30 s)

`dotnet workload install tizen` (and the optional .NET SDK auto-install) takes several minutes,
far beyond Codex's 30 s per tool call — a foreground call would return only the runner's
`[tizen-dotnet] …` header while the install keeps running (issue #48). Add **`--background`**:
the runner returns a job receipt (`result.job_id`) within a second (request escalated
permissions — it downloads, and Codex's default sandbox disables network). Then poll
`node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per call; `progress_tail`/
`log_file` show the live install log) until `job.state` is `done` — that response **is** this
runner's envelope. Claude Code's `timeout: 600000` foreground rule below is for Claude Code only.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: the workload install downloads and writes under the .NET SDK directory, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments (all optional)

1. `force` — force reinstall (`-` = placeholder)
2. `- <workloadVersion>` — specific workload version (`-` = placeholder)
3. `--no-install-sdk` — do NOT auto-install a missing .NET SDK
4. `--sdk-channel <chan>` — .NET SDK channel for the auto-install (default 8.0)

Exit code: `0` = success envelope, `1` = failure/error envelope.

The runner auto-discovers dotnet even if not on PATH, and if no SDK exists anywhere it auto-installs one user-scope (Linux/macOS `~/.dotnet`, Windows `%LOCALAPPDATA%\Microsoft\dotnet` — no sudo/admin rights needed) before installing the workload. Installation may take a few minutes.

**IMPORTANT:** On a failure/error envelope, return it and STOP. Do not run manual diagnostics like `dotnet --list-sdks`, `dotnet workload list`, or inspect directories — the runner already collected all the facts you need in `errors[0].details`. Do not re-run with `force`.

Failure categories to relay verbatim: `dotnet_sdk_not_found` (only reached when the user-scope auto-install was skipped or failed, e.g. offline/proxy — the user installs the SDK, then re-runs this setup; the re-run installs the workload), `dotnet_workload_target_mismatch` (DOTNET_ROOT points elsewhere), `dotnet_workload_permission_denied` (SDK dir not writable — hand the user `suggested_fix.command`, the exact sudo/Administrator re-run; never run sudo yourself; the sudo-free alternative in the message is a user-scope SDK via dotnet-install, then a re-run).

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

- After setup → `tizen-create-project` (DotNET) → `tizen-build-project`
