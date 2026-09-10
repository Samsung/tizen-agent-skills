---
name: tizen-platform-install
description: Install Tizen platform, platform install, 플랫폼 설치, 플랫폼 설치해줘, 타이젠 플랫폼 설치, Tizen platform package, TIZEN-Version platform, platform package download, 플랫폼 패키지 설치. Use this skill to download and install the Tizen platform package (TIZEN-{Version}) from the Tizen package repository. Reads the repository URL from repository.info. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - platform install
    - Tizen platform
    - TIZEN-Version
    - 플랫폼 설치
    - 플랫폼 패키지
    - repository.info
    - platform package
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-platform-install` 에이전트 호출
2. 수집된 입력(platform_version, force 옵션)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### Prerequisite: Tizen SDK must be installed

플랫폼 패키지는 Tizen SDK의 **확장 패키지**이므로, Tizen SDK가 먼저 설치되어 있어야 합니다.

- **Tizen SDK 설치됨** → 플랫폼 패키지 설치 진행
- **Tizen SDK 미설치** → 설치 중단, 에러 envelope 반환:
  - "Tizen SDK가 먼저 설치되어야 합니다. tizen-sdk-install 스킬을 사용하여 SDK를 설치하세요."

### installPlatform() Flow

```
1. Tizen SDK 설치 여부 확인 (sdk.info) ← 미설치 시 중단
2. 플랫폼 패키지 이미 설치? (.platform-installed 마커) ← 설치 시 success 반환
3. 플랫폼 패키지 설치 스크립트 명령 반환 (suggested_fix) — 에이전트가 Phase 2로 실행
```

### What the install script does

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `{PKG_REPO_URL}/pkg_list_{OS}-{32,64}` from the Tizen package repository
3. Parses the package list (Package, Version, Path, SHA256, Install-dependency, etc.)
4. Targets `TIZEN-{version}` from the required `--platform-version` argument (there is no auto-detection of the latest platform)
5. Recursively resolves all Install-dependency packages of the platform package
6. Downloads each package zip from `{PKG_REPO_URL}{Path}` and extracts/merges `data/` into the SDK root
7. Creates `.platform-installed` marker on success
8. Reports summary: OK / skipped / failed counts

### repository.info

During SDK install, a CDN mirror is automatically selected based on the system timezone and stored in `.package/repository.info`. The platform package installer reads this file to download from the same mirror — **no further timezone check is needed**. If `repository.info` is missing (e.g., SDK was installed before this feature), the installer falls back to the official repository (`https://download.tizen.org/sdk/tizenstudio/official`).

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\platform-install-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
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
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/platform-install-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/platform-install-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

**Required:** `node "$CLI" --platform-version 10.0` (specify platform version — **mandatory**), `node "$CLI" --force` (force reinstall)

Exit code: `0` = success (platform package already installed), `1` = failure (platform package not installed — proceed to Phase 2, or Tizen SDK not installed).

## Phase 2 — Download & Install (when Phase 1 says "not installed")

When the pre-check returns failure with `suggested_fix.command`, run that installer
command. The download may take a few minutes. **실행 방법은 하네스에 따라 다릅니다:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-platform-install -- …`)
**with escalated permissions** (it downloads; the default sandbox disables network). It returns a job
receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify.
Never run `suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify `.platform-installed` exists
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**
- Run the installer in foreground (may exceed the Bash tool's 10-min cap)
- Poll/sleep while waiting

### Cline — FOREGROUND 실행 (Cline에는 background 완료 알림이 없습니다)

Cline은 background 작업이 끝나도 에이전트를 다시 깨우지 않습니다 (`<task-notification>` 없음).
백그라운드로 실행하면 완료 보고가 영원히 누락됩니다. 반드시 **포그라운드**로 실행하세요 —
Cline의 `execute_command`에는 10분 제한이 없고, 명령이 끝날 때까지 진행 로그를 스트리밍하며 대기합니다.

1. Run the installer command from `suggested_fix` in the **FOREGROUND** — copy it verbatim.
   It blocks a few minutes; that is expected.
   Do NOT background it: no `Start-Process`, no `start /b`, no trailing `&`.
2. When the command exits, **in the SAME turn** re-run the Phase 1 pre-check CLI to verify `.platform-installed` exists
3. **Proactively** report the final success/failure envelope — 설치 완료/실패 보고 전에 턴을
   끝내지 마세요. 사용자가 "끝났어?"라고 물을 때까지 기다리는 것은 버그입니다.

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether `.platform-installed` exists.

**Do NOT (any harness):**
- Parse installer output as JSON (it's human-readable text only)

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

- **Single-task** (e.g., "플랫폼 패키지 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "플랫폼 패키지 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-create-project` (to create a new project targeting this platform)
- `tizen-build-project` (to build the project)
- `tizen-install-app` (to install on device/emulator)
