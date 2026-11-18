---
name: tizen-download-mobile-platform
description: Download Tizen Mobile platform, 모바일 플랫폼 다운로드, MOBILE platform download, IOT-Headed extension download, download MOBILE-{version}, download IOT-Headed extension. Use this skill to download and install the Tizen Mobile platform package (MOBILE-{version}) from the Tizen package repository, with optional IOT-Headed extension support.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-13"
  keywords:
    - Tizen Mobile platform
    - MOBILE platform download
    - IOT-Headed extension
    - 타이젠 모바일 플랫폼
    - 모바일 플랫폼 다운로드
    - extension_info.xml
    - IoT Headed repository
---

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-download-mobile-platform` agent with the Agent tool
2. Pass the collected inputs (platform_version, include_iot_headed, iot_headed_version, force option) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary below it)

### Prerequisite: Tizen SDK must be installed

The Mobile platform package is an **extension package** of the Tizen SDK, so the Tizen SDK must be installed first.

- **Tizen SDK installed** → proceed with the Mobile platform package download
- **Tizen SDK not installed** → abort the installation and return an error envelope:
  - "The Tizen SDK must be installed first. Install the SDK using the tizen-sdk-install skill."

### downloadMobilePlatform() Flow

```
1. Check whether the Tizen SDK is installed (sdk.info) ← abort if not installed
2. Is the Mobile platform package already installed? (.mobile-platform-installed marker) ← return success if installed
3. Return the Mobile platform package download script command (suggested_fix) — the agent runs it as Phase 2
```

### What the download script does

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `{PKG_REPO_URL}/pkg_list_{OS}-{32,64}` from the Tizen package repository
3. Parses the package list (Package, Version, Path, Install-dependency, etc.)
4. If `--platform-version` is specified, targets `MOBILE-{version}`; otherwise auto-detects the latest MOBILE-X.Y platform
5. Recursively resolves all Install-dependency packages of the Mobile platform package
6. Downloads each package zip from `{PKG_REPO_URL}{Path}` and extracts/merges `data/` into the SDK root
7. Creates `.mobile-platform-installed` marker on success

### IOT-Headed Extension Download Flow (when --include-iot-headed)

1. Downloads `{PKG_REPO_URL}/extension_info.xml`. If `PKG_REPO_URL` is a custom
   repository (from `repository.info`) that does not serve this file, falls back to
   `https://download.tizen.org/sdk/tizenstudio/official/extension_info.xml`
2. Parses the XML to extract the IoT Headed repository URL:
   - Looks for `<extension name="IoT-Headed"><repository>URL</repository></extension>`
3. Downloads `{IOT_REPO_URL}/pkg_list_{OS}-{32,64}` from the IoT repository
4. Auto-detects or uses specified `IOT-Headed-{version}` package
5. Recursively resolves all Install-dependency packages
6. Downloads and merges IOT-Headed packages into SDK root
7. Updates `.mobile-platform-installed` marker with IOT-Headed status

### repository.info

During SDK install, a CDN mirror is automatically selected based on the system timezone and stored in `.package/repository.info`. The Mobile platform package downloader reads this file to download from the same mirror — **no further timezone check is needed**. If `repository.info` is missing (e.g., SDK was installed before this feature), the downloader falls back to the official repository (`https://download.tizen.org/sdk/tizenstudio/official`).

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/download-mobile-platform-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\download-mobile-platform-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*download-mobile-platform-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*download-mobile-platform-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*download-mobile-platform-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*download-mobile-platform-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Optional: 
- `node "$CLI" --platform-version 10.0` (specify platform version)
- `node "$CLI" --include-iot-headed` (also download IOT-Headed extension)
- `node "$CLI" --iot-headed-version 10.0` (specify IOT-Headed version)
- `node "$CLI" --force` (force reinstall)
- `node "$CLI" --download-jobs 4` (concurrent download jobs, 1-8, default 4)

Exit code: `0` = success (Mobile platform already installed), `1` = `needs_action` (Mobile platform not installed — proceed to Phase 2) or `failure` (Tizen SDK not installed).

## Phase 2 — Download & Install (when Phase 1 says "not installed")

When the pre-check returns `status: "needs_action"` (`error_category: "install_required"`) with `suggested_fix.command`, run that installer command. The download may take a few minutes. **How to run it depends on the harness:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the download keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-download-mobile-platform -- …`)
**with escalated permissions** (it downloads; the default sandbox disables network). It returns a job
receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify.
Never run `suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify `.mobile-platform-installed` exists
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**
- Run the installer in foreground (may exceed the Bash tool's 10-min cap)
- Poll/sleep while waiting

### Cline — FOREGROUND execution (Cline has no background completion notification)

Cline does not wake the agent again even when a background job finishes (no `<task-notification>`).
Run it in the background and the completion report is lost forever. Always run it in the **foreground** —
Cline's `execute_command` has no 10-minute limit and waits, streaming the progress log, until the command exits.

1. Run the installer command from `suggested_fix` in the **FOREGROUND** — copy it verbatim.
   It blocks a few minutes; that is expected.
   Do NOT background it: no `Start-Process`, no `start /b`, no trailing `&`.
2. When the command exits, **in the SAME turn** re-run the Phase 1 pre-check CLI to verify `.mobile-platform-installed` exists
3. **Proactively** report the final success/failure envelope — do not end your turn
   before reporting the installation success/failure. Waiting until the user asks "is it done?" is a bug.

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether `.mobile-platform-installed` exists.

**Do NOT (any harness):**
- Parse installer output as JSON (it's human-readable text only)

## Result reporting — the envelope must always be shown to the user

The runner's stdout JSON Envelope is **inside the tool result, so the user cannot see it**
(the Claude Code UI folds Bash/Agent results away as "Ran 1 shell command"). What the user
sees is only the final answer text, so the final answer must follow the format below
**no matter which execution path was used (subagent delegation or direct CLI Runner run)**:

1. Put the Envelope JSON **verbatim, without modification or truncation** in a fenced `json` block (first item).
2. Below it, append a **1–2 line** summary of the result (the key values of `result` or the gist of `errors[0].message`).
3. If needed, add one line suggesting next steps.

- Expanding the Envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general writing rules ("no code in prose", etc.) — the Envelope is not
  code but this skill's **result contract**.
- If the runner was run multiple times, include the Envelope from the **last run**, and mention earlier
  failures in at most one line in the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`;
  show what is inside the JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user.

## Handoff

- **Single-task** (e.g., "모바일 플랫폼 다운로드해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "모바일 플랫폼 다운로드하고 에뮬레이터 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-download-emulator-package` (download emulator package)
- `tizen-create-emulator` (create a new emulator VM)
- `tizen-launch-emulator` (launch an existing emulator VM)
- `tizen-device-manager` (verify device/emulator connection)
