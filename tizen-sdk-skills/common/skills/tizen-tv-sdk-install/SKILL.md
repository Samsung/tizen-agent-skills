---
name: tizen-tv-sdk-install
description: Install TV SDK, TV SDK install, TV SDK 설치, TV SDK 설치해줘, 타이젠 TV SDK 설치, Samsung TV SDK, TV extension install. Use this skill to install the Tizen TV SDK extension (TV-SAMSUNG-Public package) on top of an existing Tizen SDK installation. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-15"
  keywords:
    - TV SDK
    - TV SDK install
    - TV-SAMSUNG-Public
    - 타이젠 TV SDK 설치
    - Samsung TV SDK
    - TV extension
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-tv-sdk-install` 에이전트 호출
2. 수집된 입력(force 옵션)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### Prerequisite: Tizen SDK must be installed

TV SDK는 Tizen SDK의 **확장 패키지**이므로, Tizen SDK가 먼저 설치되어 있어야 합니다.

- **Tizen SDK 설치됨** → TV SDK 설치 진행
- **Tizen SDK 미설치** → 설치 중단, 대화형 메시지 반환:
  - "Tizen SDK가 먼저 설치되어야 합니다. Tizen SDK 설치를 진행하시겠습니까?"
  - **사용자 승인** → `tizen-sdk-install` 스킬 호출 → 완료 후 TV SDK 설치 재시도
  - **사용자 거부** → 중단 종료

### installTvSdk() Flow

```
1. Tizen SDK 설치 여부 확인 (sdk.info) ← 미설치 시 대화형 안내와 함께 중단
2. TV SDK 이미 설치? (.tv-sdk-installed 마커) ← 설치 시 success 반환
3. TV SDK 설치 스크립트 명령 반환 (suggested_fix) — 에이전트가 Phase 2 background로 실행
```

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\tv-sdk-install-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
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
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/tv-sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/tv-sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

Optional: `node "$CLI" --force` (force reinstall)

Exit code: `0` = success (TV SDK already installed), `1` = failure (TV SDK not installed — proceed to Phase 2, or Tizen SDK not installed).

## Phase 2 — Install (when Phase 1 says "not installed")

When the pre-check returns failure with `suggested_fix.command`, run that installer
command. The install takes a few minutes. **실행 방법은 하네스에 따라 다릅니다:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-tv-sdk-install -- …`)
**with escalated permissions** (it downloads; the default sandbox disables network). It returns a job
receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify.
Never run `suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify `.tv-sdk-installed` exists
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**

- Run the installer in foreground (may exceed the Bash tool's 10-min cap)
- Poll/sleep while waiting

### Cline — `nohup` + `sleep 25 && --status` 폴링 (Cline에는 30초 타임아웃이 있습니다)

Cline은 background 작업이 끝나도 에이전트를 다시 깨우지 않습니다 (`<task-notification>` 없음).
또한 Cline의 `execute_command`에는 **30초 하드 타임아웃**이 있으므로, `--wait` (내부 60초 sleep)는
30초 타임아웃에 걸려 백그라운드로 전환됩니다. 대신 **`nohup`으로 프로세스를 분리**하고,
**`sleep 25 && --status`** 로 25초 간격 폴링하여 완료를 감지합니다.

**⚠️ `--wait`를 사용하지 마세요.** 60초 sleep이 Cline의 30초 타임아웃에 걸립니다.
**⚠️ `sleep 30` 이상을 사용하지 마세요.** 30초 + `--status` 실행 시간이 타임아웃을 초과합니다.
**⚠️ 포그라운드로 직접 실행하지 마세요.** 설치 로그가 컨텍스트 윈도우로 스트리밍됩니다.

#### Linux / macOS (Bash)

1. `nohup` 으로 설치 프로세스를 분리 (즉시 반환, PID 출력):

   ```bash
   nohup bash "<installer-script>" --sdk-path="<sdk-path>" > /tmp/tizen-tv-sdk-install.log 2>&1 & \
   jobs -p
   ```

2. `sleep 25 && --status` 로 폴링 (25초 대기 후 상태 출력, 30초 타임아웃 내 안전):

   ```bash
   sleep 25 && bash "<installer-script>" --sdk-path="<sdk-path>" --status
   ```

   - `STATUS=running` → 다시 `sleep 25 && --status` 실행 (25초 대기 후 자동 상태 재확인)
   - `STATUS=done EXIT=0` → 완료
   - `STATUS=done EXIT=1` → 실패. `tail -20 /tmp/tizen-tv-sdk-install.log` 로 원인 확인

   **`sleep 25`는 Cline의 30초 타임아웃 내에서 안전하게 완료됩니다.**
   `--status`만 단독으로 연속 실행하지 마세요. 즉시 반환되어 tight-loop 폴링이 됩니다.
   항상 `sleep 25 && --status`를 사용하세요.

3. 완료 후 Phase 1 pre-check CLI 재실행하여 `.tv-sdk-installed` 존재 확인

#### Windows (PowerShell)

1. `-Detach` 로 설치 프로세스를 분리:

   ```powershell
   powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -Detach
   ```

2. `Start-Sleep 25; -Status` 로 폴링 (25초 대기 후 상태 출력):

   ```powershell
   powershell -ExecutionPolicy Bypass -Command "Start-Sleep 25; powershell -ExecutionPolicy Bypass -File '<installer.ps1 path>' -Status"
   ```

   - `STATUS=running` → 다시 동일 명령 실행
   - `STATUS=done EXIT=0` → 완료
   - `STATUS=done EXIT=1` → 실패. 로그 파일 확인

   **`Start-Sleep 25`는 Cline의 30초 타임아웃 내에서 안전하게 완료됩니다.**
   `-Status`만 단독으로 연속 실행하지 마세요. 항상 `Start-Sleep 25; -Status`를 사용하세요.

3. 완료 후 Phase 1 pre-check CLI 재실행하여 `.tv-sdk-installed` 존재 확인

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether `.tv-sdk-installed` exists.

**Do NOT (any harness):**

- Parse installer output as JSON (it's human-readable text only)

## TV SDK 설치 확인 방법 (Verification)

TV SDK 설치 여부를 확인할 때 다음 방법을 사용하세요:

### ✅ 올바른 방법

1. **`list-templates --type tv`** — TV 템플릿 목록을 확인합니다. 빈 배열(`[]`)이 반환되면 TV SDK가 미설치된 것입니다. TV 템플릿이 존재하면 설치된 것으로 판정합니다.

2. **`tv-sdk-install` 재실행 (멱등성)** — `tv-sdk-install` CLI는 `.tv-sdk-installed` 마커를 확인하여 이미 설치되어 있으면 즉시 success를 반환합니다. 설치 여부 확인 용도로 재실행해도 안전합니다.

### ❌ 잘못된 방법

- **`list-platform --profile tv`** — 이 명령은 `--profile` 파라미터를 **무시**합니다. TV 프로필이 설치되지 않았어도 기본 플랫폼 목록을 반환하므로, TV SDK가 설치된 것으로 **오판(false positive)** 을 유발합니다.

### 요약

| 방법                         | 신뢰성       | 비고                                         |
| ---------------------------- | ------------ | -------------------------------------------- |
| `list-templates --type tv`   | ✅ 신뢰 가능 | 빈 배열 = 미설치, 항목 있음 = 설치됨         |
| `tv-sdk-install` 재실행      | ✅ 신뢰 가능 | 멱등성 보장, `.tv-sdk-installed` 마커로 판정 |
| `list-platform --profile tv` | ❌ 오판 위험 | `--profile` 무시됨, false positive 유발      |

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

- **Single-task** (e.g., "TV SDK 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "TV SDK 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**

- `tizen-create-project` (create a new TV project)
- `tizen-build-project` (build the project)
- `tizen-install-app` (install on device/emulator)
