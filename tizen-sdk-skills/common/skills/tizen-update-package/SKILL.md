---
name: tizen-update-package
description: Update Tizen SDK packages, package update, 패키지 업데이트, 패키지 업데이트해줘, SDK 패키지 업데이트, update packages, upgrade packages, tizen package update. Use this skill to check for and install available updates for installed Tizen SDK packages. Downloads the latest package list, compares versions with installed manifests, and updates outdated packages.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-23"
  keywords:
    - Tizen SDK package update
    - package update
    - 패키지 업데이트
    - SDK update
    - upgrade packages
    - pkg_list
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-update-package` 에이전트 호출
2. 수집된 입력(force/dry-run 옵션)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### Prerequisite: Tizen SDK must be installed

패키지 업데이트는 설치된 Tizen SDK 패키지를 대상으로 하므로, Tizen SDK가 먼저 설치되어 있어야 합니다.

- **Tizen SDK 설치됨** → 패키지 업데이트 진행
- **Tizen SDK 미설치** → 설치 중단, 에러 envelope 반환:
  - "Tizen SDK가 먼저 설치되어야 합니다. tizen-sdk-install 스킬을 사용하여 SDK를 설치하세요."

### updatePackage() Flow

```
1. Tizen SDK 설치 여부 확인 (sdk.info) ← 미설치 시 중단
2. 업데이트 스크립트 경로 해결
3. `{SDK_PATH}/.package-update-result` 마커 확인 — Phase 2 스크립트가 종료 시 남기는 파일.
   30분 이내에 쓰였고 아래 표의 모드 조건을 만족하면 그 내용으로 success/failure envelope 반환 ← 여기서 종료
4. 마커가 없거나 오래됐거나 모드가 다르면 업데이트 스크립트 명령 반환 (suggested_fix)
   — 에이전트가 Phase 2 background로 실행
```

**`.package-update-result` 마커** (스크립트가 exit 직전에 씀; 초반 실패 — SDK 없음, pkg_list 다운로드 실패 — 에는 남지 않음):

```
Package update finished at 2026-09-09T05:10:00-04:00
Mode: update | force | dry-run
Exit: 0 | 1
Outdated: 3
Result: updated 3 / skipped 0 / failed 0 / up-to-date 120 (total 123)
```

| Phase 1 요청 | 인정되는 마커 `Mode` | 이유 |
|---|---|---|
| `node "$CLI"` | `update`, `force` | 둘 다 실제로 업데이트를 수행함 |
| `node "$CLI" --force` | `force` 만 | 방금 일반 업데이트가 끝났어도 `--force`는 Phase 2를 다시 띄워야 함 |
| `node "$CLI" --dry-run` | `dry-run` 만 | |

마커가 `Exit: 1` 이거나 `failed > 0` 이면 Phase 1 은 **failure envelope** (`errors[0].message` 가 "Package update finished with failures: …" 로 시작) 을 반환한다 — 이것도 진실한 최종 결과이므로 그대로 보고한다.

### What the update script does

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `{PKG_REPO_URL}/pkg_list_{OS}-{32,64}` from the Tizen package repository
3. Parses the package list (Package, Version, Path, SHA256, etc.)
4. Scans `{TIZEN_SDK_PATH}/.package/` for installed package manifests (`{pkg}.manifest`)
5. For each installed package, compares the installed version with the version in the downloaded package list
6. If a newer version is available, downloads and installs the update:
   - Downloads the package zip from `{PKG_REPO_URL}{Path}`
   - Extracts and merges `data/` contents into the SDK root
   - Updates the manifest file in `.package/`
7. Reports summary: updated / skipped / failed / up-to-date counts

### CDN Mirror (repository.info)

During SDK install, a CDN mirror is automatically selected based on the system timezone and stored in `.package/repository.info`. The updater reads this file to download updates from the same mirror — **no further timezone check is needed during updates**. If `repository.info` is missing (e.g., SDK was installed before this feature), the updater falls back to the official repository (`https://download.tizen.org/sdk/tizenstudio/official`).


### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the updater. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*update-package-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*update-package-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*update-package-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*update-package-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\update-package-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
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
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/update-package-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/update-package-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

Optional: `node "$CLI" --dry-run` (list outdated packages without updating), `node "$CLI" --force` (force update all installed packages regardless of version)

Exit code: `0` = success envelope — a Phase 2 run finished within the last 30 minutes and `.package-update-result` records `failed 0` (all packages up-to-date or updated). `1` = failure envelope — either SDK not installed, or no fresh matching marker (launcher envelope with `suggested_fix` → proceed to Phase 2), or a fresh marker that records failures (report it; do not relaunch blindly).

## Phase 2 — Update (when Phase 1 says "updates available")

When the pre-check returns failure with `suggested_fix.command`, run that update command.
The update may take a few minutes depending on how many packages need updating.
**실행 방법은 하네스에 따라 다릅니다:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the updater as a foreground tool call (30 s limit; a partial log would come back
while the update keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-update-package -- …`)
**with escalated permissions** (it downloads; the default sandbox disables network). It returns a job
receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify.
Never run `suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the update command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) right away — the updater left
   `.package-update-result` behind and the CLI turns it into the real success/failure envelope
   (the marker is honoured for 30 minutes)
4. Report that envelope to the user. If the CLI still returns the launcher envelope, the script died
   before writing the marker — read the task output file's tail and report the failure from there

**Do NOT (Claude Code):**
- Run the updater in foreground (may exceed the Bash tool's 10-min cap if many packages need updating)
- Poll/sleep while waiting

### Cline — FOREGROUND 실행 (Cline에는 background 완료 알림이 없습니다)

Cline은 background 작업이 끝나도 에이전트를 다시 깨우지 않습니다 (`<task-notification>` 없음).
백그라운드로 실행하면 완료 보고가 영원히 누락됩니다. 반드시 **포그라운드**로 실행하세요 —
Cline의 `execute_command`에는 10분 제한이 없고, 명령이 끝날 때까지 진행 로그를 스트리밍하며 대기합니다.

1. Run the update command from `suggested_fix` in the **FOREGROUND** — copy it verbatim.
   It blocks until the update finishes; that is expected.
   Do NOT background it: no `Start-Process`, no `start /b`, no trailing `&`.
2. When the command exits, **in the SAME turn** re-run the Phase 1 pre-check CLI — it reads the
   `.package-update-result` marker the updater just wrote and returns the real success/failure envelope
3. **Proactively** report the final success/failure envelope — 업데이트 완료/실패 보고 전에 턴을
   끝내지 마세요. 사용자가 "끝났어?"라고 물을 때까지 기다리는 것은 버그입니다.

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent: with a marker written in the last 30 minutes it reports that run's result,
otherwise it hands back the launcher envelope so you can start Phase 2 again.

**Do NOT (any harness):**
- Parse updater output as JSON (it's human-readable text only)

### Dry-run mode

Use `--dry-run` / `-DryRun` to list outdated packages without actually updating them. This is useful for showing the user what would be updated before proceeding.

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

- **Single-task** (e.g., "패키지 업데이트해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "패키지 업데이트하고 앱 빌드해줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-build-project` (build a project with updated packages)
- `tizen-create-project` (create a new project)
- `tizen-device-manager` (verify device/emulator connection)
