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

### Claude Code (subagent delegation)

> If you have no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-file-transfer` agent with the Agent tool (personal deployment or `tizen-sdk-skills:tizen-file-transfer`)
2. Pass the user's request as the prompt
3. Pass the subagent's JSON envelope to the user as-is — follow the "Result reporting" rules below
   (include the verbatim text in a fenced `json` block, with only a 1–2 line summary below it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/file-transfer-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" push "<localPath>" "<remotePath>" [serial] [--with-utf8]
node "$CLI" pull - "<remotePath>" [localOutputPath|serial] [serial] [--with-utf8]
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\file-transfer-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
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

## Result reporting — the envelope MUST be shown to the user

The runner's stdout JSON envelope lives **inside the tool result, so the user never sees it**
(the Claude Code UI collapses Bash/Agent results into something like "Ran 1 shell command"). The
user only sees the final answer text, so the final answer must follow the format below on
**either execution path (subagent delegation / direct CLI Runner execution)**:

1. Include the envelope JSON **verbatim, unmodified and unabridged** in a fenced `json` block (as the first item).
2. Below it, add a result summary of **one or two lines** (the key value in `result`, or the gist of `errors[0].message`).
3. If useful, add one line suggesting next steps.

- Expanding the envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general authoring rules ("don't put code in prose", etc.) —
  the envelope is not code; it is this skill's **result contract**.
- If you ran the runner more than once, include the envelope from the **last run** and mention earlier
  failures only in one line of the summary.
- Include a failure envelope verbatim as well. Do not retype `errors[0].message`/`details` —
  show what is inside the JSON as-is.
- Show a `user_input_required` envelope as-is, then ask the user the question.

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
