---
name: tizen-install-rootstrap
description: Install custom rootstrap, rootstrap install, 루트스트랩 설치, custom rootstrap installation. Use this skill to install a custom rootstrap package from a ZIP file into the Tizen SDK.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-21"
  keywords:
    - rootstrap install
    - custom rootstrap
    - 루트스트랩 설치
    - rootstrap package
    - cross-compilation
    - toolchain
---

### Claude Code (서브에이전트 위임)

> Agent tool 이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool 로 `tizen-install-rootstrap` 에이전트 호출
2. 수집된 입력 (zipPath, force 옵션) 을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### Prerequisite: Tizen SDK must be installed

Custom rootstrap packages are **SDK extension packages**, so Tizen SDK must be installed first.

- **Tizen SDK installed** → Proceed with rootstrap installation
- **Tizen SDK NOT installed** → Abort with error: "Tizen SDK 가 먼저 설치되어야 합니다. tizen-sdk-install 스킬을 사용하여 SDK 를 설치하세요."

### installRootstrap() Flow

```
1. Validate ZIP file path (security checks) ← path traversal, symlinks rejected
2. Verify Tizen SDK is installed (sdk.info) ← abort if not found
3. Extract ZIP to temporary directory
4. Detect ZIP structure (data/ or tizen-studio/)
5. Parse rootstrap XML metadata from plugins directory
6. Copy tools/ folder to SDK
7. Copy platforms/ folder to SDK
8. For tizen-studio structure: check native packages, copy as tizen-7.0
9. Create .rootstrap-installed marker on success
```

### What the installer does

1. **Validates ZIP path** for security:
   - Decodes URL-encoded sequences (prevent bypass attempts)
   - Rejects path traversal (`..`)
   - Normalizes Windows separators
   - Verifies `.zip` extension
   - Checks file existence

2. **Extracts ZIP** to temporary directory:
   - Location: `{SDK_TOOLS_PATH}/server/sdktools/rootstrap/extract-*`
   - Validates each ZIP entry for path traversal
   - Rejects encrypted entries and symlinks

3. **Detects ZIP structure**:
   - `data/` layout: Standard rootstrap package
   - `tizen-studio/` layout: Requires native development packages

4. **Parses rootstrap XML metadata** (`tools/smart-build-interface/plugins/*.core*.xml`). Two filename formats are accepted:
   - `{profile}-{version}-{device}.core.xml` — the Tizen SDK repository format, e.g. `tizen-10.0-device.core.xml` (packages such as `tizen-10.0-rs-device.core_<build>_ubuntu-64.zip`)
   - `{profile}-{version}-{device}.core.{public|private}.{timestamp}.xml` — custom builds that tag type and build time, e.g. `tizen-9.0-arm.core.public.20260819_095020.xml`
   - Extracts: profile, version, device; type and timestamp when present (informational only — the rootstrap identity is `{profile}-{version}-{device}`)

5. **Copies folders**:
   - `tools/` → `{SDK_PATH}/tools/`
   - `platforms/` → `{SDK_PATH}/platforms/`

6. **Special handling for tizen-studio structure**:
   - Checks for native development package
   - Copies platform as `tizen-7.0` for compatibility

7. **Creates marker file**: `.rootstrap-installed` with installation details

### Supported ZIP Structures

#### Structure 1: `data/` Layout

```
rootstrap.zip
└── data/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}].xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}]/
```

#### Structure 2: `tizen-studio/` Layout

```
rootstrap.zip
└── tizen-studio/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}].xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}]/
```

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\install-rootstrap-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" --zip-path "C:\path\to\rootstrap.zip"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" --zip-path "C:\path\to\rootstrap.zip"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/install-rootstrap-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/install-rootstrap-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" --zip-path "/path/to/rootstrap.zip"
```

Optional: 
- `node "$CLI" --zip-path "/path/to/rootstrap.zip" --force` (force reinstall)

Exit code: `0` = success (rootstrap already installed), `1` = failure (rootstrap not installed — proceed to Phase 2, or Tizen SDK not installed).

## Phase 2 — Install (when Phase 1 says "not installed")

When the pre-check returns failure with `suggested_fix.command`, run that installer command. The install may take a minute or two. **실행 방법은 하네스에 따라 다릅니다:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-install-rootstrap -- …`)
**with escalated permissions** if it needs to fetch anything (the default sandbox disables network).
It returns a job receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s
per call) until `job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1
pre-check to verify. Never run `suggested_fix.command` in the Codex foreground.
Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify `.rootstrap-installed` exists
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**
- Run the installer in foreground
- Poll/sleep while waiting

### Cline — FOREGROUND 실행 (Cline 에는 background 완료 알림이 없습니다)

Cline 은 background 작업이 끝나도 에이전트를 다시 깨우지 않습니다 (`<task-notification>` 없음).
백그라운드로 실행하면 완료 보고가 영원히 누락됩니다. 반드시 **포그라운드**로 실행하세요 —
Cline 의 `execute_command`에는 10 분 제한이 없고, 명령이 끝날 때까지 진행 로그를 스트리밍하며 대기합니다.

1. Run the installer command from `suggested_fix` in the **FOREGROUND** — copy it verbatim.
   It blocks a minute or two; that is expected.
   Do NOT background it: no `Start-Process`, no `start /b`, no trailing `&`.
2. When the command exits, **in the SAME turn** re-run the Phase 1 pre-check CLI to verify `.rootstrap-installed` exists
3. **Proactively** report the final success/failure envelope — 설치 완료/실패 보고 전에 턴을
   끝내지 마세요. 사용자가 "끝났어?"라고 물을 때까지 기다리는 것은 버그입니다.

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether `.rootstrap-installed` exists.

**Do NOT (any harness):**
- Parse installer output as JSON (it's human-readable text only)

## Error Handling

The installer performs comprehensive security validation and will reject:

| Error | Cause | Solution |
|-------|-------|----------|
| `Path traversal detected` | ZIP entry contains `..` | Re-package ZIP without path traversal |
| `Symlink detected` | ZIP contains symbolic links | Re-package with actual files |
| `No rootstrap XML files found` | Missing `tools/smart-build-interface/plugins/*.xml` | Verify ZIP structure |
| `Could not determine ZIP structure` | No `data/` or `tizen-studio/` directory | Re-package with correct structure |
| `Tizen SDK is NOT installed` | SDK not found | Install Tizen SDK first |

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

- **Single-task** (e.g., "custom rootstrap 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "rootstrap 설치하고 프로젝트 빌드해줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-create-project` (create a new project using the rootstrap)
- `tizen-build-project` (build project with the new rootstrap)
- `tizen-device-manager` (verify device/emulator connection for deployment)
