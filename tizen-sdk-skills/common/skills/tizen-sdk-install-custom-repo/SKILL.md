---
name: tizen-sdk-install-custom-repo
description: Install Tizen SDK from a custom repository URL, custom repository install, 커스텀 저장소로 SDK 설치, 사용자 지정 저장소, 저장소 URL로 SDK 설치, 내부 미러로 설치, install SDK from my repository, install from mirror URL, repo url install, --repo-url, 저장소 URL 검증, validate repository URL, pkg_list 확인, is this repository valid. Use this skill to install the Tizen SDK from a user-supplied package repository URL (internal mirror, build-server output, local HTTP server) instead of the timezone-selected CDN mirror. The URL must serve pkg_list_{OS}-64 or pkg_list_{OS}-32, otherwise it is rejected before anything is downloaded. Also validates a repository URL on its own.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-04"
  keywords:
    - custom repository
    - custom repository URL
    - repo url
    - --repo-url
    - 커스텀 저장소
    - 사용자 지정 저장소
    - 저장소 URL
    - 내부 미러
    - internal mirror
    - pkg_list
    - pkg_list_windows-64
    - pkg_list_ubuntu-64
    - validate repository URL
    - 저장소 URL 검증
    - Tizen SDK install
---

# Tizen SDK Install from a Custom Repository

## When to use

The user wants the SDK downloaded from **their own** package repository rather than the
public CDN — an internal Samsung mirror, a build-server output, a team mirror, or a local
HTTP server. Typical phrasings: "이 URL로 SDK 설치해줘", "내부 미러에서 설치해줘",
"install the SDK from http://…", "이 저장소 주소 유효해?".

For a normal install from the automatically-selected CDN mirror, use `tizen-sdk-install`
instead. Everything else (paths, env setup, `sdk.info`, auto `sdk-init`) is identical —
only the package source changes.

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-sdk-install-custom-repo` 에이전트 호출
2. 수집된 입력(repository URL, platform version, force)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

## The repository URL rule (this is what makes a URL valid)

A Tizen package repository serves a **package list** file at its root:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}      OS = windows | ubuntu | macos      ARCH = 64 | 32
```

Examples: `pkg_list_windows-64`, `pkg_list_ubuntu-64`, `pkg_list_ubuntu-32`, `pkg_list_macos-64`.

That file is the index the entire install is driven from (package names, versions,
`Path` of each zip, `Install-dependency`, `C-SelectedGroup`). So:

- ✅ **Valid** — `{URL}/pkg_list_{OS}-64` **or** `{URL}/pkg_list_{OS}-32` is fetchable
  for the **current OS**. The `-64` file is probed first, then `-32`, so a 32-bit-only
  mirror also works.
- ❌ **Invalid** — neither exists → the URL is **rejected up front** and nothing is
  downloaded. Never "try anyway": the alternative is ~100 failed downloads and a
  half-installed SDK.

**Most common user mistake:** giving the URL of the `pkg_list` file itself
(`https://host/repo/pkg_list_ubuntu-64`) instead of the directory that contains it
(`https://host/repo`). That is rejected with an explicit message — ask the user for the
parent directory.

Only `http://` and `https://` URLs are supported. Internal mirrors (e.g. `10.x.x.x`)
require VPN/proxy access from this machine; a "not reachable" rejection on an internal
URL usually means the network, not a bad URL.

## Validate-only (no install)

When the user only asks whether a URL is a usable repository ("이 주소 맞아?",
"is this repo valid?"), run the validation CLI. It is read-only and finishes in seconds.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\validate-repo-url-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" "<repo-url>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" "<repo-url>"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/validate-repo-url-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/validate-repo-url-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" "<repo-url>"
```

Exit code: `0` = valid repository (`result.pkg_list_file` names the file that was found),
`1` = invalid (`repo_url_invalid` = malformed URL, `repo_url_unreachable` = no pkg_list served;
`errors[0].details` lists every probed URL).

## Phase 1 — Pre-check (CLI Runner)

This CLI is a **pre-check**, not the installer. It finishes in seconds (URL validation +
already-installed + disk space). Run in foreground — **NEVER with `run_in_background: true`**.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-install-custom-repo-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" "<repo-url>"
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" "<repo-url>"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-custom-repo-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-custom-repo-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" "<repo-url>"
```

Optional: `node "$CLI" --repo-url "<url>" --platform-version 11.0 --force`
(`--platform-version` omitted = highest `TIZEN-X.Y` the repository offers).

Exit code: `0` = success (SDK already installed — **read the warnings**, see below),
`1` = not installed yet or URL rejected. Inspect `errors[0].error_category`:

| `error_category`       | Meaning                                             | What to do                                                   |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| `repo_url_invalid`     | Malformed URL / wrong scheme / points at pkg_list   | Ask the user for the repository **directory** URL             |
| `repo_url_unreachable` | Well-formed, but no `pkg_list_{OS}-{64,32}` served  | Wrong URL, or internal mirror needs VPN/proxy                 |
| `execution_error`      | URL is valid, SDK not installed                     | Run `suggested_fix.command` (Phase 2)                         |

### installSdkFromRepo() Flow

```
1. Node.js check ← if not installed, abort with OS-specific guide
2. Repository URL validation (pkg_list_{OS}-{64,32}) ← if invalid, ABORT (nothing downloaded)
3. SDK already installed? ← if yes, success + warning that --force is needed to switch repos
4. Disk space check (15 GB, home drive) ← if insufficient, abort with details
5. Return installer command for Phase 2 (background install)
```

### ⚠️ Already-installed ≠ installed from this repository

If the SDK already exists, step 3 returns **success without downloading anything** — the
existing packages still come from whatever repository installed them. The envelope's
warnings say so explicitly and name the recorded repository. If the user wants the SDK
re-installed **from their URL**, re-run with `--force`.

## Phase 2 — Install (when Phase 1 says "not installed")

Run `errors[0].suggested_fix.command` verbatim. It takes 10–15 minutes (~121 packages).
**실행 방법은 하네스에 따라 다릅니다:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-sdk-install-custom-repo -- …`,
which forwards the same `--repo-url`/`-RepoUrl` and platform flags) **with escalated permissions**
(it downloads; the default sandbox disables network). It returns a job receipt at once; then poll
`node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until `job.state` is `done`
(`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify. Never run
`suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

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
백그라운드 프로세스는 **10분 후 강제 종료**됩니다. SDK 설치는 10–15분이 소요됩니다.

**⚠️ 절대 `run_in_background: true`를 사용하지 마세요.** 10분 타임아웃으로 설치가 강제 중단됩니다.
**⚠️ 포그라운드로 실행하지 마세요.** 121개 패키지 로그가 컨텍스트 윈도우를 소모합니다.
**⚠️ `--wait`를 사용하지 마세요.** 60초 sleep이 Cline의 30초 타임아웃에 걸립니다.

#### Linux / macOS (Bash)

1. `nohup` 으로 설치 프로세스를 분리 (`--repo-url`을 반드시 포함):

   ```bash
   nohup bash "<tizen-sdk-install-custom-repo.sh path>" --repo-url "<url>" > /tmp/tizen-sdk-install.log 2>&1 & \
   jobs -p
   ```

2. `sleep 25 && --status` 로 폴링:

   ```bash
   sleep 25 && bash "<tizen-sdk-install-custom-repo.sh path>" --status
   ```

   - `STATUS=running` → 진행 중. **다시 `sleep 25 && --status` 실행**
   - `STATUS=done EXIT=0` → 완료. Phase 1 pre-check 재실행 후 envelope 보고
   - `STATUS=done EXIT=1` → 실패. `tail -20 /tmp/tizen-sdk-install.log` 로 원인 확인

#### Windows (PowerShell)

1. `-Detach` 로 분리 (`-RepoUrl`을 반드시 포함 — 누락하면 기본 CDN에서 설치됩니다):

   ```powershell
   powershell -ExecutionPolicy Bypass -File "<tizen-sdk-install-custom-repo.ps1 path>" -RepoUrl "<url>" -Detach
   ```

2. `Start-Sleep 25; -Status` 로 폴링:

   ```powershell
   powershell -ExecutionPolicy Bypass -Command "Start-Sleep 25; powershell -ExecutionPolicy Bypass -File '<tizen-sdk-install-custom-repo.ps1 path>' -Status"
   ```

### Recovery — 진행 상태를 모를 때 (any harness)

The run state is durable on disk, so a lost completion signal is always recoverable:

- Windows: `powershell -ExecutionPolicy Bypass -File "<...custom-repo.ps1>" -Status`
- Linux/macOS: `bash "<...custom-repo.sh>" --status`

Output: `STATUS=running` / `STATUS=done EXIT=<code>` / `STATUS=none`.

**Do NOT (any harness):**

- Parse installer output as JSON (it's human-readable text only)
- Drop `--repo-url` / `-RepoUrl` from any relaunch — without it the install silently
  falls back to the default CDN mirror

## What the installer script does

1. Validates `{REPO_URL}/pkg_list_{OS}-{64,32}` (HEAD, then a 1-byte ranged GET for
   servers that reject HEAD), then delegates to `tizen-sdk-install` with `--repo-url`
2. Downloads and parses that `pkg_list`
3. Picks the target platform: `--platform` if given, else the highest `TIZEN-X.Y` present
4. Recursively resolves `Install-dependency` + `C-SelectedGroup`, plus the extra packages
   (`tizen-core`, `certificate-generator`, `Emulator`, `TIZEN-X.Y-Emulator`, `*-rs-*`)
5. Downloads each zip from `{REPO_URL}{Path}` and merges `data/` into the SDK root
6. Writes `sdk.info`, `~/.tizen.sdk.path.config` (auto `sdk-init`), and
   `.package/repository.info` **with the custom repository URL**
7. Sets up `TIZEN_SDK_PATH` / `PATH`

### Downstream effect of repository.info

`.package/repository.info` records the repository the SDK came from, and
`tizen-update-package` / `tizen-download-emulator-package` read it. So after a
custom-repository install, **updates and emulator packages also come from that custom
repository** — no extra configuration needed. Query it any time with the repository info
CLI (`sdk-repo-info-cli.js`, see `tizen-sdk-install`).

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

- **Single-task** (e.g., "이 URL로 SDK 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "이 저장소로 SDK 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**

- `tizen-device-manager` (verify device/emulator connection)
- `tizen-create-project` (create a new project)
- `tizen-update-package` (updates come from the same custom repository)
