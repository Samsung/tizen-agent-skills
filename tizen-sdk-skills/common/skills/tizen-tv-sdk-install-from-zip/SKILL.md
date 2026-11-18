---
name: tizen-tv-sdk-install-from-zip
description: Install TV SDK from ZIP, TV SDK ZIP install, TV SDK ZIP 설치, TV SDK ZIP으로 설치, 타이젠 TV SDK ZIP 설치, Samsung TV SDK offline install, TV extension install from ZIP, offline TV SDK, local ZIP TV SDK. Use this skill to install the Tizen TV SDK extension (TV-SAMSUNG-Public) from a local ZIP file (offline, no download). All packages must already be bundled in the ZIP. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-08"
  keywords:
    - TV SDK
    - TV SDK install from ZIP
    - TV-SAMSUNG-Public
    - 타이젠 TV SDK ZIP 설치
    - Samsung TV SDK
    - TV extension
    - offline install
    - local ZIP
---

### Claude Code (subagent delegation)

> If the Agent tool is not available (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-tv-sdk-install-from-zip` agent with the Agent tool
2. Pass the collected inputs (zip-path, tv-version, force options) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary beneath it)

### Prerequisite: Tizen SDK must be installed

The TV SDK is an **extension package** of the Tizen SDK, so the Tizen SDK must be installed first.

- **Tizen SDK installed** → proceed with the TV SDK ZIP installation
- **Tizen SDK not installed** → abort the installation and return an interactive message:
  - "The Tizen SDK must be installed first. Do you want to proceed with the Tizen SDK installation?"
  - **User approves** → invoke the `tizen-sdk-install` skill → retry the TV SDK ZIP installation after it completes
  - **User declines** → abort and exit

### installTvSdkFromZip() Flow

```
1. Validate the zipPath parameter (required)
2. Check whether the Tizen SDK is installed (sdk.info) ← if not installed, abort with an interactive guide
3. TV SDK already installed? (the TV version record in `.platform-installed`) ← if installed, return success
4. Return the TV SDK ZIP installer script command (suggested_fix) — the agent runs Phase 2 in the background
```

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/tv-sdk-install-from-zip-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" --zip-path "/path/to/tv-samsung-sdk.zip"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\tv-sdk-install-from-zip-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" --zip-path "C:\path\to\tv-samsung-sdk.zip"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-from-zip-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-from-zip-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-from-zip-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*tv-sdk-install-from-zip-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" --zip-path "C:\path\to\tv-samsung-sdk.zip"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Optional: `--tv-version <X.Y>` (the TV platform version the ZIP is for, e.g. `9.0` — pass it when the user names one), `--force` (force reinstall of that TV version)

Several TV versions install side by side from their ZIPs (TV 9.0, 10.0, 11.0): the installer skips only a TV version `.platform-installed` already records, so another version needs no `--force`. It reads the version from the inner ZIP names; when `--tv-version` disagrees with them, or neither gives one, it stops **before** extracting anything and says which `--tv-version` to pass. Each install appends a block (`Profile: tv-samsung`, `Source: <zip>`) to `.platform-installed`, so `sdk-install` / `platform-install --list` report that TV version afterwards.

Exit code: `0` = success (TV SDK already installed), `1` = `needs_action` (TV SDK not installed — proceed to Phase 2) or `failure` (Tizen SDK not installed, or zip-path missing).

## Phase 2 — Install (when Phase 1 says "not installed")

When the pre-check returns `status: "needs_action"` (`error_category: "install_required"`) with `suggested_fix.command`, run that installer
command. The install takes a few minutes. **How to run it depends on the harness:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-tv-sdk-install-from-zip -- …`,
which forwards the same ZIP path / SDK path flags). It returns a job receipt at once; then poll
`node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until `job.state` is `done`
(`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify and report that envelope. Never run
`suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) with the same `--zip-path` (and `--tv-version`) to verify the TV version is recorded in `.platform-installed`
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**

- Run the installer in foreground (may exceed the Bash tool's 10-min cap)
- Poll/sleep while waiting

### Cline — detached execution + numbered `sleep 25 && --status` polling, up to 4 polls per turn (30-second timeout · 5-identical-calls guard)

Cline does not wake the agent again when a background task finishes (no `<task-notification>`).
Also, Cline's `execute_command` has a **30-second hard timeout**, so `--wait` (an internal 60-second sleep)
hits the 30-second timeout and gets switched to the background. Instead, **detach the process with `nohup`** and
poll every 25 seconds with **`sleep 25 && --status`** to detect completion.

Cline also has a guard that **treats 5 consecutive repetitions of the same tool call as an infinite loop and aborts**
(`Detected 5 consecutive identical calls`; if errors repeat 6 times in a row, the task stalls). An installation
needs dozens of 25-second polls, so repeating the polling command verbatim will trip the guard on the 5th call.
Therefore, **put an attempt number in each polling command** so the calls differ (`poll #1`, `poll #2`, …), and poll **at most
4 times per turn**; if `STATUS=running` persists, tell the user that the installation is still running in the background and
how to check the status, then **end the turn**. When the user returns (e.g., "계속", "끝났어?")
run `--status` / `-Status` once to resume. The detached install process keeps running even if Cline stalls or the turn
ends.

**⚠️ Do not use `--wait`.** The 60-second sleep hits Cline's 30-second timeout.
**⚠️ Do not use `sleep 30` or longer.** 30 seconds + `--status` execution time exceeds the timeout.
**⚠️ Do not run it directly in the foreground.** The installation log streams into the context window.
**⚠️ Do not re-run the same polling command verbatim.** Repeating it without an attempt number makes Cline abort on the 5th call.

#### Linux / macOS (Bash)

1. Detach and run the Phase 1 envelope's `suggested_fix.command`
   (`bash "<installer-script>" --sdk-path=… --zip-path=… [--force]`) with `nohup`, **keeping the arguments intact**
   (returns immediately, prints the PID). Dropping the arguments means the `--zip-path`/`--force`/`--sdk-path` requests are not applied:

   ```bash
   nohup <suggested_fix.command> > /tmp/tizen-tv-sdk-install-from-zip.log 2>&1 & \
   jobs -p
   ```

2. Poll with `sleep 25 && --status`, adding an attempt number (prints the status after a 25-second wait, safe within the 30-second timeout;
   `#N` increments by 1 on each call):

   ```bash
   sleep 25 && echo "poll #1" && bash "<installer-script>" --sdk-path="<sdk-path>" --status
   ```

   - `STATUS=running` → re-run with the attempt number incremented (`poll #2`, `#3`, `#4`).
     **If it is still `running` after the 4th poll**, stop polling, tell the user the following, and **end the turn**:
     the installation is still running in the background. **No automatic notification of installation
     completion is provided**, so if you need to confirm completion, ask the user to say
     "설치 진행 상태를 알려줘" and then check the status and resume.
     (Check directly: `bash "<installer-script>" --sdk-path="<sdk-path>" --status`)
   - `STATUS=done EXIT=0` → done. Re-run the Phase 1 pre-check, then report the envelope
   - `STATUS=done EXIT=1` → failed. Re-run the Phase 1 pre-check, then report the envelope +
     one line on the gist of the cause from `tail -20 /tmp/tizen-tv-sdk-install-from-zip.log`

   **`sleep 25` completes safely within Cline's 30-second timeout.**
   Do not run `--status` alone in a row — it returns immediately and becomes tight-loop polling.
   Always use `sleep 25 && --status` with an attempt number.

3. After completion, re-run the Phase 1 pre-check CLI to verify the TV version was recorded in `.platform-installed`

#### Windows (PowerShell)

1. Take the Phase 1 envelope's `suggested_fix.command`
   (`powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -SdkPath … -ZipPath … [-Force]`)
   **with the arguments intact**, append `-Detach` at the end, and run it detached. Dropping the arguments means the `-ZipPath`/`-Force`/`-SdkPath`
   requests are not applied:

   ```powershell
   <suggested_fix.command> -Detach
   ```

2. Poll with `Start-Sleep 25; -Status`, adding an attempt number (prints the status after a 25-second wait; `#N` increments by 1 on each call):

   ```powershell
   powershell -ExecutionPolicy Bypass -Command "Start-Sleep 25; Write-Host 'poll #1'; powershell -ExecutionPolicy Bypass -File '<installer.ps1 path>' -Status"
   ```

   - `STATUS=running` → re-run with the attempt number incremented (`poll #2`, `#3`, `#4`).
     **If it is still `running` after the 4th poll**, stop polling, tell the user the following, and **end the turn**:
     the installation is still running in the background. **No automatic notification of installation
     completion is provided**, so if you need to confirm completion, ask the user to say
     "설치 진행 상태를 알려줘" and then check the status and resume.
     (Check directly: `powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -Status`)
   - `STATUS=done EXIT=0` → done. Re-run the Phase 1 pre-check, then report the envelope
   - `STATUS=done EXIT=1` → failed. Re-run the Phase 1 pre-check, then report the envelope + one line on the gist of the cause from the log file

   **`Start-Sleep 25` completes safely within Cline's 30-second timeout.**
   Do not run `-Status` alone in a row. Always use `Start-Sleep 25; -Status` with an attempt number.

3. After completion, re-run the Phase 1 pre-check CLI to verify the TV version was recorded in `.platform-installed`

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether this ZIP's TV version is recorded in `.platform-installed`. Report that envelope.

**Do NOT (any harness):**

- Parse installer output as JSON (it's human-readable text only)

## How to Verify the TV SDK Installation (Verification)

Use the following methods to check whether the TV SDK is installed:

### ✅ Correct methods

1. **`list-templates --type tv`** — check the list of TV templates. If an empty array (`[]`) is returned, the TV SDK is not installed. If TV templates exist, it is considered installed.

2. **Re-run `tv-sdk-install-from-zip` (idempotency)** — the `tv-sdk-install-from-zip` CLI checks the TV record for this ZIP (or `--tv-version`) in `.platform-installed` and returns success immediately if it is already installed. Re-running it to check installation status is safe.

### ❌ Wrong method

- **`list-platform --profile tv`** — this command **ignores** the `--profile` parameter. It returns the default platform list even when the TV profile is not installed, causing a **false positive** that the TV SDK is installed.

### Summary

| Method                               | Reliability        | Notes                                        |
| ------------------------------------ | ------------------ | -------------------------------------------- |
| `list-templates --type tv`           | ✅ Reliable        | empty array = not installed, entries present = installed |
| Re-run `tv-sdk-install-from-zip`     | ✅ Reliable        | idempotency guaranteed, judged by the TV record in `.platform-installed` |
| `list-platform --profile tv`         | ❌ Risk of misjudgment | `--profile` ignored, causes false positives |

## Result reporting — the envelope must always be shown to the user

The runner's stdout JSON Envelope is **inside the tool result, so the user cannot see it**
(the Claude Code UI folds Bash/Agent results away as "Ran 1 shell command"). Only the final
answer text is visible to the user, so the final answer must follow the format below on
**any execution path (subagent delegation / direct CLI Runner execution)**:

1. Include the envelope JSON **as-is, unmodified and unabridged**, in a fenced `json` block (first item).
2. Beneath it, add a result summary of **1–2 lines only** (the key value of `result` or the gist of `errors[0].message`).
3. If helpful, add a one-line suggestion of next steps.

- Expanding the envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general writing rules ("don't put code in prose", etc.) — the envelope
  is not code; it is this skill's **result contract**.
- If the runner was executed multiple times, include the envelope from the **last run**, and mention
  earlier failures only in a single line in the summary.
- Include a failure envelope's original text the same way. Do not retype `errors[0].message`/`details`;
  show what is in the JSON as-is.
- Show a `user_input_required` envelope as-is, then ask the user the question.

## Handoff

- **Single-task** (e.g., "TV SDK ZIP으로 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "TV SDK 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**

- `tizen-create-project` (create a new TV project)
- `tizen-build-project` (build the project)
- `tizen-install-app` (install on device/emulator)
