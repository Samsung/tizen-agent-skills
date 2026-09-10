---
name: tizen-device-manager
description: Tizen device manager, 타이젠 디바이스 관리, 디바이스 연결, 에뮬레이터 종료, sdb devices, emulator stop, 디바이스 찾기, 에뮬레이터 중지, TV 에뮬레이터, 타이젠 TV 에뮬레이터, Samsung TV emulator, TV emulator, TV 에뮬. Use this skill to find connected Tizen devices via sdb or stop/shut down running emulator VMs. For creating an emulator VM, use tizen-create-emulator. For launching an existing emulator VM, use tizen-launch-emulator. Supports both standard Tizen and Samsung TV emulator profiles.


metadata:
  author: Samsung Electronics
  last-updated: "2026-08-03"
  keywords:
    - Tizen device manager
    - sdb devices
    - tizen emulator
    - em-cli
    - 타이젠 디바이스
    - emulator launch
    - 디바이스 연결
    - TV 에뮬레이터
    - Samsung TV emulator
    - TV emulator
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-device-manager` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-device-manager`)
2. 사용자의 요청을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\device-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
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
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/device-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/device-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

### Codex CLI — long waits as a job (one exec call waits ≤ 30 s)

Detecting an already-connected device takes seconds, but a `timeoutSec` wait for a device that is
still booting (default 300) or a stop sequence (several `sleep 2` retries) can pass Codex's 30 s
per tool call, after which only the runner's header comes back (issue #48). For those add
**`--background`** and poll `node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s
per call) until `job.state` is `done` — that response **is** this runner's envelope.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb needs a localhost TCP socket (port 26099) and em-cli writes under `<sdk>-data`, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

```
node "$CLI" [start] [timeoutSec] [vmName] [profile]
node "$CLI" stop
node "$CLI" --action start|stop [timeoutSec] [vmName] [profile]
```

0. **action** (`start` | `stop`, default `start`) — `start` finds a connected device; `stop` shuts down all running emulator VMs. Give it as the first bare word (`stop`) or as `--action stop` (same spelling as `tizen-cli tizen-sdk device-manager --action stop`).
1. **timeoutSec** (1–540, default 300) — emulator connection wait time in seconds (start action only)
2. **vmName** (default `tizen-vm-default`) — emulator VM name to look for (start action only)
3. **profile** (`tizen` | `tv`, default `tizen`) — emulator profile: `tizen` (standard) or `tv` (Samsung TV; requires TV SDK extension)

Example (start, default Tizen): `node "$CLI" 300 my-tizen-vm`
Example (start, TV emulator): `node "$CLI" 300 tizen-tv-vm tv`
Example (stop): `node "$CLI" stop` (or `node "$CLI" --action stop`)

Exit code: `0` = success envelope (with `result.device_serial` for start, `result.emulators_stopped` for stop), `1` = failure/error envelope.

> **Important:** The `start` action **only finds connected devices** via sdb. It does **not** create or launch emulators. If no device is found, the envelope returns `device_not_found` and directs the user to `tizen-create-emulator` (to create a VM) and `tizen-launch-emulator` (to launch a VM). This removes the ambiguity between device-manager, create-emulator, and launch-emulator.

## Scope: device-manager vs launch-emulator vs create-emulator

| Task | Use this skill (`tizen-device-manager`) | Use `tizen-launch-emulator` | Use `tizen-create-emulator` |
|------|:---:|:---:|:---:|
| Find connected device via sdb | ✅ | | |
| Launch an **existing** emulator VM by name | | ✅ | |
| Launch the **first available** VM (no name) | | ✅ | |
| Create an emulator VM (default or custom) | | | ✅ |
| Create a **custom** emulator VM with specific platform | | | ✅ |
| Create a VM with a specific template | | | ✅ |
| Stop/shut down running emulator VMs | ✅ | | |
| List available platforms/templates | | | ✅ |
| List existing VMs | | | ✅ |
| Delete a VM | | | ✅ |

> **Rule of thumb:**
> - If the user wants to **create** an emulator VM → use `tizen-create-emulator`.
> - If the user wants to **launch/start/boot** an emulator VM → use `tizen-launch-emulator`.
> - If the user wants to **create AND launch** an emulator → use `tizen-create-emulator` with `--launch` (or `launch=true`), or run `tizen-create-emulator` then `tizen-launch-emulator`.
> - If the user just needs **any connected device** (e.g. for build, install, debug) → use `tizen-device-manager` (it finds connected devices via sdb; if none, it suggests creating+launching an emulator via the dedicated skills).
> - If the user wants to **stop/shut down** emulators → use `tizen-device-manager` with the `stop` action (`node "$CLI" stop`, or `--action stop` via tizen-cli).


### TV Emulator

When `profile=tv` is specified, the device-manager looks for a connected TV emulator via sdb. If no TV emulator is connected, it returns a `device_not_found` envelope directing the user to:

1. **`tizen-create-emulator`** with `--profile tv` — to create a TV emulator VM
2. **`tizen-launch-emulator`** — to launch the TV emulator VM

**Prerequisite:** TV SDK extension must be installed. Use `tizen-tv-sdk-install` skill first.

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

- **Single-task** (e.g., "디바이스 찾아줘", "에뮬레이터 종료해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "에뮬 켜고 앱 설치해줘") → Continue to next step.
- SDK not installed → `tizen-sdk-install`

**Routing when no device is connected:**

When `tizen-device-manager` finds no connected device via sdb, it does **not** create or launch an emulator itself. Instead, it returns a `device_not_found` envelope and directs the user to:

1. **`tizen-create-emulator`** — to create an emulator VM (if one doesn't exist yet).
2. **`tizen-launch-emulator`** — to launch an existing emulator VM.

This ensures there is no ambiguity: device-manager handles **device discovery** and **emulator stop** only; creation and launching are handled by their dedicated skills.

**Suggested next steps (only when user asks):**

- `tizen-create-emulator` (create an emulator VM)
- `tizen-launch-emulator` (launch an existing emulator VM)
- `tizen-build-project` (build project)
- `tizen-create-project` (create new project)
- `tizen-install-app` (install app)
- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
