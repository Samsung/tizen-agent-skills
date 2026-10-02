---
name: tizen-file-transfer
description: Tizen file transfer, sdb push, sdb pull, 파일 전송, 파일 푸시, 파일 풀, push file to device, pull file from device, copy file to device, copy file from device, 디바이스에 파일 복사, 디바이스에서 파일 복사. Use this skill to push (host→device) or pull (device→host) files and directories between the host computer and a connected Tizen device/emulator via sdb.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-24"
  keywords:
    - sdb push
    - sdb pull
    - file transfer
    - 파일 전송
    - push file
    - pull file
    - copy to device
    - copy from device
    - 디바이스 파일 복사
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-file-transfer` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-file-transfer`)
2. 사용자의 요청을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/file-transfer-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/file-transfer-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" push "<localPath>" "<remotePath>" [serial] [--with-utf8]
node "$CLI" pull - "<remotePath>" [localOutputPath|serial] [serial] [--with-utf8]
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\file-transfer-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*file-transfer-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*file-transfer-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*file-transfer-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*file-transfer-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" push "<localPath>" "<remotePath>" [serial] [--with-utf8]
node "<found-path>" pull - "<remotePath>" [localOutputPath|serial] [serial] [--with-utf8]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

**Windows Git Bash — the remote path gets MSYS-converted (handled by the runner).** Git Bash
rewrites any argument that starts with `/` into a path under the Git install root before `node`
sees it: `"/opt/usr/apps/x"` arrives as `C:/Program Files/Git/opt/usr/apps/x`. The runner
detects that prefix (from `EXEPATH`, falling back to the well-known Git / msys64 install roots),
restores `/opt/usr/apps/x`, and says so in `warnings`. So:

- Pass the device path exactly as it is on the device (`"/opt/usr/apps/x"`). Do **not** prefix a
  second slash (`//opt/...`) and do **not** set `MSYS_NO_PATHCONV=1` — the latter also stops
  `$CLI` (`/c/Users/...`) from being converted, and Windows `node` cannot open that spelling.
  A `//opt/...` that arrives anyway is collapsed to `/opt/...` with a warning.
- A **genuine** Windows path in the remote slot (`C:/Users/me/x`) is refused with
  `invalid_parameters` — a device path is always POSIX. Only when the install root is unusual
  (the error names `EXEPATH`) fall back to `//opt/...` or to the PowerShell form.
- The **local** path is unaffected: MSYS turning `/c/Users/me/out` into `C:\Users\me\out` is
  exactly what the host-side `sdb pull` needs.

### Codex CLI — large transfers as a job (one exec call waits ≤ 30 s)

`sdb push`/`pull` of a large file or a directory tree can take minutes; under Codex a tool call
returns after 30 s with only the runner's header while the transfer keeps running (issue #48).
For anything beyond a few MB add **`--background`**: the runner returns a job receipt
(`result.job_id`) within a second, then poll `node "<same lib/cli dir>/job-cli.js" wait --id
<job_id>` (≤ 25 s per call; `progress_tail`/`log_file` show the live sdb output) until
`job.state` is `done` — that response **is** this runner's envelope.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb needs a localhost TCP socket, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

| Arg | Position | Required | Description |
|-----|----------|----------|-------------|
| direction | 1 | **yes** | `push` (host→device) or `pull` (device→host) |
| localPath / `-` | 2 | **yes** | **PUSH:** Local file/directory path. **PULL:** Always use `-` (reserved for future use) |
| remotePath | 3 | **yes** | Remote (device) file/directory path — always POSIX (`/opt/usr/apps/x`). In Windows Git Bash the runner undoes MSYS's `C:/Program Files/Git/opt/...` conversion itself; a real Windows path here is `invalid_parameters` |
| localOutputPath\|serial | 4 | no | **PULL only:** If contains `/` or `\`, treated as output file path; otherwise, device serial. **PUSH:** Device serial. Omit to auto-select. |
| serial | 5 | no | **PULL only:** Device serial, only if position 4 is a local output path. Omit to auto-select. |
| --with-utf8 | flag | no | Handle UTF-8 encoded paths (any position) |

Exit code: `0` = success envelope (with `result.device_serial`, `result.bytes_transferred`), `1` = failure/error envelope.

## Examples

**PUSH — host to device**
```bash
# Push a file to device (auto-select connected device)
node "$CLI" push "./myfile.txt" "/opt/usr/apps/myfile.txt"

# Push a directory recursively
node "$CLI" push "./mydir" "/opt/usr/apps/mydir"

# Push to specific device
node "$CLI" push "./myfile.txt" "/opt/usr/apps/myfile.txt" emulator-26101

# Push with UTF-8 path
node "$CLI" push "./파일.txt" "/opt/usr/apps/파일.txt" emulator-26101 --with-utf8
```

**PULL — device to host**
```bash
# Pull a file from device to default location (auto-select device)
node "$CLI" pull - "/opt/usr/apps/myfile.txt"

# Pull a file from device to specific local output path
node "$CLI" pull - "/opt/usr/apps/myfile.txt" "./myfile.txt"

# Pull from specific device to default location
node "$CLI" pull - "/opt/usr/apps/myfile.txt" emulator-26101

# Pull from specific device to specific local output path
node "$CLI" pull - "/opt/usr/apps/myfile.txt" "./myfile.txt" emulator-26101

# Pull with UTF-8 path
node "$CLI" pull - "/opt/usr/apps/파일.txt" "./파일.txt" emulator-26101 --with-utf8
```

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

## Failure handling — when to stop

| `error_category` | Meaning | What to do |
|---|---|---|
| `remote_path_not_found` (pull) | The device path does not exist (sdb: `cannot stat ... No such file or directory`). Nothing was transferred. | **Stop.** Show the envelope, name the path that was checked, ask the user for the correct path. Do **not** re-run with the same path or try spelling variants yourself. |
| `invalid_parameters` "Local path not found" (push) | The host path does not exist. | **Stop.** Same rule — ask, do not guess. |
| `device_not_found` | No device/emulator. | `tizen-device-manager` first, then retry **once** with its `result.device_serial`. |
| `multiple_devices` | More than one device. | Ask which serial, retry **once** with it. |
| `io_error` | sdb failed for another reason; `errors[0].details` holds the raw sdb output. | Re-run the same command at most **once**. If it fails again, report and stop. |

Windows host paths such as `C:\logs\` are accepted as typed — the runner normalizes backslashes. Do not rewrite them to other spellings.

## Handoff

- **Single-task** (e.g., "파일 푸시해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "파일 푸시하고 앱 설치해줘") → Continue to next step.
- No device connected → `tizen-device-manager` first, then retry once with its `result.device_serial`.
- SDK not installed → `tizen-sdk-install`

**Suggested next steps (only when user asks):**
- `tizen-install-app` (install app package)
- `tizen-build-project` (build project)
- `tizen-device-manager` (connect a device)
