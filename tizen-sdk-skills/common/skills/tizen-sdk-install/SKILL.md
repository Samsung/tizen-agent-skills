---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, 타이젠 SDK 설치, 타이젠 SDK 설치해줘, setup tizen development environment, download tizen platform packages, SDK 저장소 정보, repository info, CDN mirror, 패키지 저장소, sdk package repo, package repository, SDK repo, 저장소 목록, 다운로드 URL. Use this skill to install the Tizen SDK, download platform packages, and set up environment paths. Also handles SDK repository information queries. Start here before any project creation or debugging work.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-03"
  keywords:
    - Tizen SDK
    - Tizen SDK install
    - tizen-studio
    - 타이젠 SDK 설치
    - Tizen platform packages
    - SDK 저장소 정보
    - repository info
    - CDN mirror
    - 패키지 저장소
    - sdk package repo
    - package repository
    - SDK repo
    - 저장소 목록
    - 다운로드 URL
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-sdk-install` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-sdk-install`)
2. 수집된 입력(force/version 옵션)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### Automatic Node.js Check (built into sdk-install-cli.js)

When the SDK is not installed, `sdk-install-cli.js` **first** checks if Node.js is installed and on PATH. This is the very first step before anything else.

- **Node.js installed** → proceeds to the next step (disk space check)
- **Node.js NOT installed** → installation **aborted** with an error envelope showing:
  - Clear message: "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 18+."
  - OS-specific install guide (Windows: `winget install OpenJS.NodeJS.LTS`, macOS: `brew install node`, Linux: `sudo apt install -y nodejs npm`)
  - Download URL: https://nodejs.org/

### Automatic Disk Space Check (15 GB, built into sdk-install-cli.js)

After Node.js is confirmed, `sdk-install-cli.js` **automatically** checks disk space on the user's home drive before returning the installer command. No separate `check-disk-space-cli.js` run is needed.

- **15 GB or more free** → installation proceeds (installer command returned in `suggested_fix`)
- **Less than 15 GB** → installation **aborted** with an error envelope showing:
  - Current free space (e.g., "3.2 GB free")
  - Required space ("15 GB required")
  - How much more is needed ("Need 11.8 GB more")

The check targets the **user's home directory drive** only (e.g., `C:\` on Windows, `/` on Linux).

### installSdk() Flow (3-step pre-check)

```
1. Node.js check (first) ← if not installed, abort with guide
2. SDK already installed? ← if yes, return success (auto sdk-init: writes ~/.tizen.sdk.path.config)
3. Disk space check (15 GB) ← if insufficient, abort with details
4. Return installer command for Phase 2 (background install)
```

### Install path (where the SDK goes)

The pre-check resolves the SDK path from `~/.tizen.sdk.path.config` (written by `tizen-sdk-init` or a
previous install), else `~/tizen-sdk`, and passes it to the installer **explicitly** (`--path` on
bash, `-Path` on PowerShell — both `suggested_fix.command` and `background_command` carry it).
`TIZEN_SDK_PATH` from the user's shell profile is **not** a source: when it differs the pre-check logs
`Ignoring TIZEN_SDK_PATH=…`, and the installer refuses to unpack into a Tizen Studio directory
(`tools/ide` present). A user who already has Tizen Studio at `~/tizen-studio` still gets a separate
`~/tizen-sdk` (issue #70). To install elsewhere, run `tizen-sdk-init --sdk-path <dir>` first or pass
`--path <dir>` / `-Path <dir>` to the installer command.

### Automatic SDK Init (sdk-init after install)

After a successful installation (or when the SDK is already installed), `installSdk()`
**automatically calls `initSdk()`** to write the SDK path to `~/.tizen.sdk.path.config`.
This means:

- ✅ No need to run `tizen-sdk-init` separately after `tizen-sdk-install`
- ✅ All downstream skills (build, create, device, debug) can immediately locate the SDK
- ✅ The installer scripts (`.sh` / `.ps1`) also write the config file directly during install
- ✅ If auto-init fails, a warning is added to the response envelope suggesting manual `sdk init`

### CDN Mirror Selection (automatic, timezone-based)

During SDK install, the installer script automatically selects the fastest CDN mirror based on the system's timezone offset:

| UTC Offset Range | Mirror    | URL                                                           |
| ---------------- | --------- | ------------------------------------------------------------- |
| UTC-12 .. UTC-5  | Global    | `https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official`       |
| UTC-4 .. UTC-1   | Brazil    | `https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official`    |
| UTC+0 .. UTC+4   | Official  | `https://download.tizen.org/sdk/tizenstudio/official`         |
| UTC+5 .. UTC+12  | Singapore | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official` |

The selected mirror URL is written to `{SDK_PATH}/.package/repository.info` after a successful install. The package updater (`tizen-update-package`) reads this file to download updates from the same mirror — no further timezone check is needed during updates.

### Custom Repository URL (사용자 지정 저장소로 설치)

When the user supplies their **own** repository URL — an internal mirror, a build-server
output, a local HTTP server ("이 URL로 설치해줘", "내부 미러에서 설치해줘",
"install from http://…") — **route to the `tizen-sdk-install-custom-repo` skill**, which
validates the URL and installs from it instead of the CDN mirror.

The URL must serve `pkg_list_{OS}-64` or `pkg_list_{OS}-32`
(OS = windows | ubuntu | macos); otherwise it is rejected before anything is downloaded.
Quick check without installing:

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/validate-repo-url-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/validate-repo-url-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" "<repo-url>"
```

The installer scripts also accept the URL directly (`--repo-url <url>` /
`-RepoUrl <url>`), and `sdk-install-cli.js` forwards a `--repo-url` to that flow.

### Repository Information Query (SDK 저장소 정보 조회)

When the user asks about SDK repositories / package sources / CDN mirrors (e.g., "SDK 저장소 정보 알려줘",
"어디서 다운로드받아?", "CDN 미러 목록 보여줘"), run the `sdk-repo-info-cli.js` to return
metadata about all known repositories and the currently configured one.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-repo-info-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
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
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-repo-info-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-repo-info-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

The response includes:

- `current_repository` — the CDN mirror URL from `{SDK_PATH}/.package/repository.info` (null if SDK not installed)
- `repositories` — array of known repository metadata:

| URL                                                      | Name                                       | Type     | Access                              |
| -------------------------------------------------------- | ------------------------------------------ | -------- | ----------------------------------- |
| `https://download.tizen.org/sdk/tizenstudio/official/`   | Official CDN                               | public   | Internet (timezone-based mirrors)   |

Private / in-house mirrors are not listed; install from one with `tizen-sdk-install-custom-repo` (`--repo-url <url>`).

Exit code: `0` = success (always returns info, even if SDK not installed), `1` = error.

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-install-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI"
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

Optional: `node "$CLI" 10.0 tizen --force` (version, label, force reinstall)

Exit code: `0` = success (SDK already installed), `1` = failure (SDK not installed — proceed to Phase 2).

## Phase 2 — Install (when Phase 1 says "not installed")

When the pre-check returns failure with `suggested_fix.command`, run that installer
command. The install takes 10–15 minutes (~121 packages). **실행 방법은 하네스에 따라 다릅니다:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex's exec tool returns after at most 30 s, so the installer can never run as a foreground
tool call there — you would get a partial log while the install keeps running unseen (issue #48).
The Phase 1 envelope therefore carries a second rendering of the fix: `suggested_fix.background_command`
(`node "<lib/cli>/job-cli.js" run --script tizen-sdk-install [-- -Force]`).

1. Run `suggested_fix.background_command` **with escalated permissions** — it downloads ~121
   packages and Codex's default sandbox sets `CODEX_SANDBOX_NETWORK_DISABLED=1`. It returns a job
   receipt (`result.job_id`, `state: "running"`, `log_file`) within a second.
2. Poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (same directory as the pre-check runner).
   Each call blocks ≤ 25 s and returns either `state: "running"` with `progress_tail` from the
   install log, or — when finished — the job envelope (`result.exit_code`, `log_file`, `log_tail`,
   `job.state: "done"`). Repeat while running; do not add your own sleeps.
3. Re-run the Phase 1 pre-check CLI (foreground) to verify `sdk.info`, and report that envelope.

Recovery: `node "<lib/cli>/job-cli.js" list` shows recent jobs, `status --id <job_id>` re-reads one.
Do NOT run `suggested_fix.command` in the Codex foreground, and never treat a tool result that shows
only progress lines and no `{ "status": … }` JSON as the outcome. (The installer's own `-Detach` /
`-Status` remain the Cline path; both report the same on-disk state.)

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify `sdk.info` exists
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**

- Run the installer in foreground (exceeds the Bash tool's 10-min cap)
- Poll/sleep while waiting
- Delegate to a subagent (notification only reaches main context)

### Cline — `nohup` + `sleep 25 && --status` 폴링 (Cline에는 30초 타임아웃이 있습니다)

Cline은 background 작업이 끝나도 에이전트를 다시 깨우지 않으며 (`<task-notification>` 없음),
백그라운드 프로세스는 **10분 후 강제 종료**됩니다. SDK 설치는 10–15분이 소요되므로
백그라운드 실행 시 타임아웃으로 설치가 중단됩니다.

또한 Cline의 `execute_command`에는 **30초 하드 타임아웃**이 있으므로, `--wait` (내부 60초 sleep)는
30초 타임아웃에 걸려 백그라운드로 전환됩니다. 대신 **`nohup`으로 프로세스를 분리**하고,
**`sleep 25 && --status`** 로 25초 간격 폴링하여 완료를 감지합니다.

**⚠️ 절대 `run_in_background: true`를 사용하지 마세요.** 10분 타임아웃으로 설치가 강제 중단됩니다.
**⚠ 포그라운드로 실행하지 마세요.** 121개 패키지 로그가 컨텍스트 윈도우로 스트리밍되어
수만 토큰을 소비합니다.
**⚠️ `--wait`를 사용하지 마세요.** 60초 sleep이 Cline의 30초 타임아웃에 걸립니다.
**⚠️ `sleep 30` 이상을 사용하지 마세요.** 30초 + `--status` 실행 시간이 타임아웃을 초과합니다.

#### Linux / macOS (Bash)

1. `nohup` 으로 설치 프로세스를 분리 (즉시 반환, PID와 로그 경로 출력):

   ```bash
   nohup bash "<installer.sh path>" > /tmp/tizen-sdk-install.log 2>&1 & jobs -p
   ```

   출력: `PID=12345`

2. `sleep 25 && --status` 로 폴링 (25초 대기 후 상태 출력, 30초 타임아웃 내 안전):

   ```bash
   sleep 25 && bash "<installer.sh path>" --status
   ```

   - `STATUS=running` → 아직 진행 중. **다시 `sleep 25 && --status` 실행**
   - `STATUS=done EXIT=0` → 완료. Phase 1 pre-check 재실행 후 envelope 보고
   - `STATUS=done EXIT=1` → 실패. `tail -20 /tmp/tizen-sdk-install.log` 로 원인 확인

   **`sleep 25`는 Cline의 30초 타임아웃 내에서 안전하게 완료됩니다.**
   `--status`만 단독으로 연속 실행하지 마세요. 즉시 반환되어 tight-loop 폴링이 됩니다.
   항상 `sleep 25 && --status`를 사용하세요.

3. 완료 후 Phase 1 pre-check CLI 재실행하여 `sdk.info` 존재 확인

#### Windows (PowerShell)

1. `nohup` 대신 `Start-Process` 없이 직접 분리:

   ```powershell
   powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -Detach
   ```

   출력: `PID=12345 LOG=C:\Users\...\Temp\tizen-sdk-install.log`

2. `Start-Sleep 25; -Status` 로 폴링 (25초 대기 후 상태 출력):

   ```powershell
   powershell -ExecutionPolicy Bypass -Command "Start-Sleep 25; powershell -ExecutionPolicy Bypass -File '<installer.ps1 path>' -Status"
   ```

   - `STATUS=running` → 아직 진행 중. **다시 동일 명령 실행**
   - `STATUS=done EXIT=0` → 완료. Phase 1 pre-check 재실행 후 envelope 보고
   - `STATUS=done EXIT=1` → 실패. 로그 파일 확인

   **`Start-Sleep 25`는 Cline의 30초 타임아웃 내에서 안전하게 완료됩니다.**
   `-Status`만 단독으로 연속 실행하지 마세요. 즉시 반환되어 tight-loop 폴링이 됩니다.
   항상 `Start-Sleep 25; -Status`를 사용하세요.

3. 완료 후 Phase 1 pre-check CLI 재실행하여 `sdk.info` 존재 확인

### Recovery — 진행 상태를 모를 때 (any harness)

If a previous session was interrupted, the completion signal was lost, or the user asks
"아직 설치 중이야?", query the durable on-disk run state (returns instantly):

- Windows: `powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -Status`
- Linux/macOS: `bash "<installer.sh path>" --status`

Output: `STATUS=running` (진행 중 — 사용자에게 알리고 턴 종료) /
`STATUS=done EXIT=<code>` (종료 — Phase 1 pre-check 재실행 후 envelope 보고) /
`STATUS=none` (실행된 적 없음).

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

- **Single-task** (e.g., "SDK 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "SDK 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**

- `tizen-device-manager` (verify device/emulator connection)
- `tizen-create-project` (create a new project)
- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
