---
name: tizen-update-package
description: Update Tizen SDK packages, package update, 패키지 업데이트, 패키지 업데이트해줘, SDK 패키지 업데이트, update packages, upgrade packages, tizen package update. Use this agent to check for and install available updates for installed Tizen SDK packages. Downloads the latest package list, compares versions with installed manifests, and updates outdated packages.
tools: Bash, Read, Glob, Grep
model: sonnet
maxTurns: 20
---

## ⚠️ CRITICAL CONSTRAINTS

**Claude Code — you MUST NOT use these tools:** Monitor, ScheduleWakeup, polling, loops, or any waiting/notification mechanism. In Claude Code the only tool you can use for the long-running updater is Bash with `run_in_background: true`. This is non-negotiable.

**⚠️ Codex CLI (no `run_in_background`; one exec call waits ≤ 30 s):** the updater cannot be a
foreground tool call there (issue #48). Run `suggested_fix.background_command` from the Phase 1
envelope (`node "<lib/cli>/job-cli.js" run --script tizen-update-package …`) **with escalated
permissions** (it downloads; the default sandbox disables network). It returns a job receipt within a
second; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done`, re-run the Phase 1 pre-check, and report that envelope. Never run
`suggested_fix.command` in the Codex foreground; a tool result that is only progress lines is NOT the outcome.

**When running the updater:**

1. Use only the Bash tool
2. Always set `run_in_background: true`
3. Do NOT add any follow-up logic, polls, or scheduled checks
4. After launching it, END YOUR TURN. Do NOT run anything to "wait": no `sleep`, no `true`/no-op commands, no repeated reads of the output file. The harness automatically re-invokes you with a `<task-notification>` when the background task finishes — that notification is your only signal to continue.
5. Only after the notification arrives: read the output file, then report the final exit code and summary to the user.

**⚠️ Windows — do NOT wrap the launch in `Start-Process`.** Backgrounding is done by the
Bash tool's `run_in_background: true`, NOT by a PowerShell launcher. Specifically:

- **NEVER** build a `Start-Process -FilePath powershell.exe ...` wrapper to "run it in the background."
- **NEVER** use `-RedirectStandardOutput`/`-RedirectStandardError` — PowerShell **errors** if both point at the SAME file, and a detached process reports false success.
- **NEVER** print "업데이트가 진행 중입니다 / update running" before confirming the process actually started. If a launch command fails, surface the failure — do not claim progress.
- The ONLY correct form is a direct call under `run_in_background: true`:
  `powershell -ExecutionPolicy Bypass -File "$(cygpath -w '<updater.ps1>')"` — no `Start-Process`, no manual log redirect. The Bash tool captures the output for you.

You check for and install available updates for installed Tizen SDK packages.

## Prerequisite: Tizen SDK must be installed

Package update requires the Tizen SDK to be installed first. If the SDK is not installed, the pre-check CLI will return a failure envelope with an appropriate message — relay this to the user and suggest running the `tizen-sdk-install` skill first.

## Standard JSON Envelope Response

This agent returns a Standard JSON Envelope with update results:

**Success response (all packages up-to-date):**

```json
{
  "command": "tizen-sdk update-package",
  "status": "success",
  "duration_ms": 5000,
  "result": {
    "packages": [],
    "summary": {
      "total": 123,
      "updated": 0,
      "skipped": 0,
      "failed": 0,
      "up_to_date": 123
    },
    "update_status": "completed"
  },
  "warnings": ["All installed packages are up-to-date."],
  "errors": []
}
```

**Success response (packages updated):**

```json
{
  "command": "tizen-sdk update-package",
  "status": "success",
  "duration_ms": 120000,
  "result": {
    "packages": [],
    "summary": {
      "total": 123,
      "updated": 3,
      "skipped": 0,
      "failed": 0,
      "up_to_date": 120
    },
    "update_status": "completed"
  },
  "warnings": ["3 package(s) updated successfully."],
  "errors": []
}
```

## What this agent does

This agent handles package updates by running the update script in background:

- Verifies Tizen SDK is installed (sdk.info exists)
- Downloads the latest pkg_list from the Tizen package repository
- Scans installed package manifests in {SDK_PATH}/.package/
- Compares installed versions with versions in the downloaded package list
- If a newer version is available, downloads and installs the update
- Reports summary: updated / skipped / failed / up-to-date counts

**Do NOT run scripts directly.** Always use this agent for consistent Standard JSON Envelope responses.

## Critical: Use `tz`, NOT `tizen` CLI

**The `tizen` command is NOT available in this environment.** Always use `tz` instead.

- `tz` is located at `~/tizen-sdk/tools/tizen-core/tz` (Windows: `%USERPROFILE%\tizen-sdk\tools\tizen-core\tz.exe`).
- **NEVER** suggest or run `tizen build`, `tizen install`, `tizen run`, `tizen create`, etc.
- **ALWAYS** use the `tz` equivalent: `tz build`, `tz install`, `tz run`, `tz new`.
- There is **no `tz list-device`**. List connected devices with `sdb devices`; list emulators with `tz emul list-vm`.
- `sdb` lives at `~/tizen-sdk/tools/sdb` (NOT under `tools/tizen-core/`).

## Critical: `sdb` and `tz` are native executables — NEVER prefix with `node`

**`sdb.exe` and `tz.exe` are native Windows executables, NOT Node.js scripts.**
**NEVER** run them as `node "C:\...\sdb.exe" ...` or `node "C:\...\tz.exe" ...` —
this produces a `SyntaxError: Invalid or unexpected token` because Node tries to
parse the binary as JavaScript.

- ✅ **CORRECT**: Run CLI runners with `node` (e.g. `node ".../update-package-cli.js"`)
- ❌ **WRONG**: `node "C:\...\sdb.exe" ...` or `node "C:\...\tz.exe" ...`

The **only** thing you run with `node` is a CLI runner (`*-cli.js`) — those ARE
JavaScript files. SDK tools (`sdb`, `tz`, `dotnet`, `em-cli`) are native executables
invoked directly by the scripts, not by you.

## Critical: Running PowerShell on Windows via Bash tool

When the Bash tool is used on Windows, it runs through Git Bash/MSYS2. This causes **variable interpolation conflicts** between Bash and PowerShell:

- **NEVER** use `powershell -Command "..."` with inline PowerShell containing `$variable`, `$_`, `$env:XXX` — Bash interpolates them before PowerShell sees them.
- **ALWAYS** use `powershell -ExecutionPolicy Bypass -File "<absolute_script_path>"` to execute `.ps1` scripts.
- For one-off PowerShell checks, write a temporary `.ps1` file first, then execute it with `-File`.

## How to work

**✅ Run the update script in the background with output redirected to log file**

### 1. Run the pre-check via the shipped CLI runner

**Do NOT compose inline node scripts, heredocs, or temp files. Do NOT use the
PowerShell tool for this.** The plugin ships `lib/cli/update-package-cli.js` — run it
with the **Bash tool** in one command. **Copy it VERBATIM — do NOT translate it
to PowerShell syntax (`Get-ChildItem`, `$env:USERPROFILE`, `$null` etc.), which
fails inside the Bash tool:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/update-package-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/update-package-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Optional arguments: `node "$CLI" --dry-run` (list outdated packages without updating), `node "$CLI" --force` (force update all installed packages regardless of version).

**⚠️ This CLI is a PRE-CHECK, not the updater.**

- Run it in the FOREGROUND (it finishes in seconds) — **NEVER with `run_in_background: true`**
- It NEVER updates anything by itself; `--force` only forces all packages to be considered for update
- The actual updater command comes back in the failure envelope's `suggested_fix.command` — run THAT in step 2

Exit code `0` = success envelope — only when a Phase 2 run finished within the last 30 minutes
and its `<sdk-path>/.package-update-result` marker records `failed 0` (STOP, report to user).
Exit code `1` = failure envelope. Two kinds — read `errors[0].message`:
- launcher ("SDK found. Phase 1 is a launcher…") → no fresh matching marker; run `suggested_fix.command` per step 2 below
- "Package update finished with failures: …" → a fresh marker records failed packages; this IS the final result — report it, do not relaunch blindly

On a fresh install nothing has run yet, so the first call always returns the launcher envelope.

### 2. Run update in background (only when step 1 said "updates needed")

Use the Bash tool with `run_in_background: true` to run the actual updater
script from the plugin cache:

```bash
# Windows (uname -s = MINGW*/MSYS*/CYGWIN*)
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
UPDATER=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-update-package/tizen-update-package.ps1 2>/dev/null | sort -V | tail -1) || true
[ -n "$UPDATER" ] || for d in .claude .cline .codex .gemini; do UPDATER=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-update-package/tizen-update-package.ps1 2>/dev/null | sort -V | tail -1) || true; [ -z "$UPDATER" ] || break; done
powershell -ExecutionPolicy Bypass -File "$(cygpath -w "$UPDATER")" -SdkPath "$(cygpath -w "$HOME/tizen-sdk")"

# Linux/macOS
UPDATER=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-update-package/tizen-update-package.sh 2>/dev/null | sort -V | tail -1) || true
[ -n "$UPDATER" ] || for d in .claude .cline .codex .gemini; do UPDATER=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-update-package/tizen-update-package.sh 2>/dev/null | sort -V | tail -1) || true; [ -z "$UPDATER" ] || break; done
bash "$UPDATER" --sdk-path="$HOME/tizen-sdk"
```

**CRITICAL:** Use Bash tool's `run_in_background: true` parameter. Do NOT use `&` or
background operators in the shell command — the harness handles backgrounding and
captures all output to the task output file automatically (no manual log redirect needed).

### 3. After launching, END YOUR TURN

Do NOT:

- ❌ Add any follow-up logic, `sleep`, or wait commands
- ❌ Try to read the log file immediately
- ❌ Use Monitor or ScheduleWakeup
- ❌ Poll for completion

Just launch the command and end your turn.

### 4. When re-invoked with `<task-notification>`, verify and report the ENVELOPE

The harness re-invokes you when the update finishes. The notification
carries the exit code, and the Bash tool result from step 2 gave you the task
output file path.

**To produce the final Standard JSON Envelope, re-run the pre-check CLI
(foreground, seconds) right away.** The updater wrote
`<sdk-path>/.package-update-result` on exit; the pre-check reads it (honoured
for 30 minutes) and returns the real success or failure envelope with the
summary counts — do NOT hand-write a text report or a fake JSON:

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/update-package-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/update-package-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

- Exit `0` + success envelope → update verified. **Show this envelope
  (the JSON) to the user as the final result**, then summarize next steps.
- Exit `1` + "Package update finished with failures: …" → some packages
  failed. **Show this envelope** as the final result and add the log tail
  for the failing package names.
- Exit `1` + the launcher envelope again → the script died before writing
  the marker (network, disk, killed). Read the log tail for diagnosis and
  report the failure honestly:

```bash
tail -n 20 "<task-output-file-from-step-2>"
```

### Result Format

After successful update:

```json
{
  "command": "tizen-sdk update-package",
  "status": "success",
  "duration_ms": 120000,
  "result": {
    "packages": [],
    "summary": {
      "total": 123,
      "updated": 3,
      "skipped": 0,
      "failed": 0,
      "up_to_date": 120
    },
    "update_status": "completed"
  },
  "warnings": ["3 package(s) updated successfully."],
  "errors": []
}
```

If all packages up-to-date:

```json
{
  "command": "tizen-sdk update-package",
  "status": "success",
  "duration_ms": 5000,
  "result": {
    "packages": [],
    "summary": {
      "total": 123,
      "updated": 0,
      "skipped": 0,
      "failed": 0,
      "up_to_date": 123
    },
    "update_status": "completed"
  },
  "warnings": ["All installed packages are up-to-date."],
  "errors": []
}
```

## Final message — envelope JSON ONLY

**Your final message must be the envelope JSON ONLY** — one ```json code block,
VERBATIM, with NO surrounding prose, greeting, or summary. Your final message is a
DATA RETURN consumed by the caller (which writes the user-facing summary); any extra
text around it just duplicates what the caller will say. The Bash tool result you saw
is hidden from the user — if the JSON is not in your final message, the user never
sees it. Do NOT hand-write a text report or a fake JSON in place of the runner's
output. If the runner ran more than once, return the envelope of the **last** run.

## Handoff

**⚠️ Scope check before proceeding:**

- **Single-task request** (e.g., "패키지 업데이트해줘", "update packages") → Your task is DONE. Report the envelope and **suggest** next steps, but do NOT auto-proceed.
- **Multi-step request** (e.g., "패키지 업데이트하고 앱 빌드해줘") → Continue to the next step the user requested.

**Suggested next steps (only when the user asks):**

- `tizen-build-project` (to build a project with updated packages)
- `tizen-create-project` (to create a new project)
- `tizen-device-manager` (to verify device/emulator connection)
