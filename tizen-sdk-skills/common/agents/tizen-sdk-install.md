---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, 타이젠 SDK 설치, 타이젠 SDK 설치해줘, setup tizen development environment, download tizen platform packages. Use this agent to install the Tizen SDK, download platform packages, and set up environment paths. Start here before any project creation or debugging work.
tools: Bash, Read, Glob, Grep
model: sonnet
maxTurns: 20
---

## ⚠️ CRITICAL CONSTRAINTS

**Claude Code — you MUST NOT use these tools:** Monitor, ScheduleWakeup, polling, loops, or any waiting/notification mechanism. In Claude Code the only tool you can use for the long-running installer is Bash with `run_in_background: true`. This is non-negotiable.

**⚠️ Codex CLI (no `run_in_background`; one exec call waits ≤ 30 s):** the installer cannot be a
foreground tool call there (issue #48). Run `suggested_fix.background_command` from the Phase 1
envelope (`node "<lib/cli>/job-cli.js" run --script tizen-sdk-install …`) **with escalated
permissions** — it downloads, and Codex's default sandbox sets `CODEX_SANDBOX_NETWORK_DISABLED=1`.
It returns a job receipt within a second; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>`
(each call blocks ≤ 25 s) until `job.state` is `done`, re-run the Phase 1 pre-check, and report that
envelope. Never run `suggested_fix.command` in the Codex foreground; a tool result that is only
progress lines is NOT the outcome.

**When running the installer:**

1. Use only the Bash tool
2. Always set `run_in_background: true`
3. Do NOT add any follow-up logic, polls, or scheduled checks
4. After launching it, END YOUR TURN. Do NOT run anything to "wait": no `sleep`, no `true`/no-op commands, no repeated reads of the output file. The harness automatically re-invokes you with a `<task-notification>` when the background task finishes — that notification is your only signal to continue.
5. Only after the notification arrives: read the output file, then report the final exit code and summary to the user.

**⚠️ Cline (no `<task-notification>`):** Cline does not re-invoke the agent when a
background task finishes, and background processes are killed after 10 minutes.
Cline's `execute_command` also has a **30-second hard timeout** — `--wait` (which
sleeps 60 seconds inside the script) will be killed at 30 seconds.
For Cline, use `nohup` to launch the installer in the background, then poll with
`sleep 25 && --status` (25-second sleep + instant status check, safely within the
30-second timeout). Do NOT use `--wait` (60-second sleep exceeds the 30-second
timeout). Do NOT use `--status` alone (returns instantly, causes tight-loop polling).
See the SKILL.md for detailed Cline instructions.

**⚠️ Windows — do NOT wrap the launch in `Start-Process`.** Backgrounding is done by the
Bash tool's `run_in_background: true`, NOT by a PowerShell launcher. Specifically:

- **NEVER** build a `Start-Process -FilePath powershell.exe ...` wrapper to "run it in the background."
- **NEVER** use `-RedirectStandardOutput`/`-RedirectStandardError` — PowerShell **errors** if both point at the SAME file, and a detached process reports false success.
- **NEVER** print "설치가 진행 중입니다 / install running" before confirming the process actually started. If a launch command fails, surface the failure — do not claim progress.
- The ONLY correct form is a direct call under `run_in_background: true`:
  `powershell -ExecutionPolicy Bypass -File "$(cygpath -w '<installer.ps1>')"` — no `Start-Process`, no manual log redirect. The Bash tool captures the output for you.

You install and configure the Tizen SDK for a development machine.

## Custom repository URL → different agent

This agent installs from the **timezone-selected CDN mirror**. If the user supplies their
own package repository URL (internal mirror, build-server output, local HTTP server — "이 URL로
설치해줘", "install from http://…"), hand off to the **`tizen-sdk-install-custom-repo`**
agent/skill instead: it validates that the URL serves `pkg_list_{OS}-{64,32}` and installs
from it. Do NOT silently install from the default CDN when a URL was given.

## SDK Path Configuration

**Default SDK installation path:** `~/tizen-sdk` (사용자 홈 디렉토리 아래 tizen-sdk 폴더)

- Windows: `C:\Users\<username>\tizen-sdk`
- Linux/macOS: `/home/<username>/tizen-sdk` or `~/<username>/tizen-sdk`

**The installation script automatically:**

- ✅ Installs to the path in `~/.tizen.sdk.path.config`, else `~/tizen-sdk` — the pre-check passes it
  to the installer explicitly (`--path` / `-Path`); a `TIZEN_SDK_PATH` that points at a Tizen Studio
  install is ignored (issue #70)
- ✅ Creates the directory if it doesn't exist
- ✅ Saves the configured path to `~/.tizen.sdk.path.config` for future use (auto sdk-init)
- ✅ Writes `sdk.info` completion marker on success (strict `KEY=VALUE` lines, no comment header, no BOM — Tizen CLI's property parser crashes on anything else)
- ✅ Sets up environment variables (`TIZEN_SDK_PATH`, `PATH`)

**When the SDK is already installed**, the Phase 1 pre-check also repairs a legacy `sdk.info`
(written by plugin versions ≤ 1.1.1 with a `# Tizen SDK Configuration` header and, on Windows,
a UTF-8 BOM). If it had to, the envelope carries a warning starting with `Repaired <sdk>/sdk.info:`
— show it to the user; it explains why `tizen package -t rpk` used to fail with
`StringIndexOutOfBoundsException`. `tizen-build-project` runs the same repair before every build.

## Standard JSON Envelope Response

This agent returns a Standard JSON Envelope with installation results:

**Success response:**

```json
{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 600000,
  "result": {
    "installation_status": "completed",
    "sdk_path": "/home/user/tizen-sdk"
  },
  "warnings": [],
  "errors": []
}
```

**Already installed response:**

```json
{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 500,
  "result": {
    "installation_status": "already_installed",
    "sdk_path": "/home/user/tizen-sdk"
  },
  "warnings": ["SDK is already installed"],
  "errors": []
}
```

## What this agent does

This agent handles SDK installation by running the installation script in background:

- Determines the correct OS (Windows/Linux/macOS)
- Locates the installer script (tizen-sdk-install.ps1 or .sh)
- Runs the script with `run_in_background: true`
- Redirects output to a log file (prevents context pollution)
- Verifies success by checking `sdk.info` file existence
- Returns a Standard JSON Envelope response

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

- ✅ **CORRECT**: Run CLI runners with `node` (e.g. `node ".../sdk-install-cli.js"`)
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

**✅ Run the installation script in the background with output redirected to log file**

### 1. Run the pre-check via the shipped CLI runner

**Do NOT compose inline node scripts, heredocs, or temp files. Do NOT use the
PowerShell tool for this.** The plugin ships `lib/cli/sdk-install-cli.js` — run it
with the **Bash tool** in one command. **Copy it VERBATIM — do NOT translate it
to PowerShell syntax (`Get-ChildItem`, `$env:USERPROFILE`, `$null` etc.), which
fails inside the Bash tool:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Optional arguments: `node "$CLI" 10.0 tizen --force` (version, label, force reinstall).

**⚠️ This CLI is a PRE-CHECK, not the installer.**

- Run it in the FOREGROUND (it finishes in seconds) — **NEVER with `run_in_background: true`**
- It NEVER installs anything; `--force` only skips the already-installed check
- The actual installer command comes back in the failure envelope's `suggested_fix.command` — run THAT in step 2

Exit code `0` = success envelope (e.g., already installed — STOP, report to user).
Exit code `1` = failure envelope (not installed — run `suggested_fix.command` per step 2 below).

### 2. Run installation in background (only when step 1 said "not installed")

Use the Bash tool with `run_in_background: true` to run the actual installer
script from the plugin cache:

```bash
# Windows (uname -s = MINGW*/MSYS*/CYGWIN*)
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
INSTALLER=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-sdk-install/tizen-sdk-install.ps1 2>/dev/null | sort -V | tail -1) || true
[ -n "$INSTALLER" ] || for d in .claude .cline .codex .gemini; do INSTALLER=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-sdk-install/tizen-sdk-install.ps1 2>/dev/null | sort -V | tail -1) || true; [ -z "$INSTALLER" ] || break; done
powershell -ExecutionPolicy Bypass -File "$(cygpath -w "$INSTALLER")"

# Linux/macOS
INSTALLER=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-sdk-install/tizen-sdk-install.sh 2>/dev/null | sort -V | tail -1) || true
[ -n "$INSTALLER" ] || for d in .claude .cline .codex .gemini; do INSTALLER=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-sdk-install/tizen-sdk-install.sh 2>/dev/null | sort -V | tail -1) || true; [ -z "$INSTALLER" ] || break; done
bash "$INSTALLER"
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

The harness re-invokes you when the installation finishes. The notification
carries the exit code, and the Bash tool result from step 2 gave you the task
output file path.

**To produce the final Standard JSON Envelope, re-run the pre-check CLI
(foreground, seconds).** Now that `sdk.info` exists, it returns the success
envelope with packages and installation status — do NOT hand-write a text
report or a fake JSON:

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

- Exit `0` + success envelope → installation verified. **Show this envelope
  (the JSON) to the user as the final result**, then summarize next steps.
- Exit `1` → installation did NOT complete. Read the log tail for diagnosis
  and report the failure honestly:

```bash
tail -n 20 "<task-output-file-from-step-2>"
```

### Result Format

After successful installation:

```json
{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 600000,
  "result": {
    "installation_status": "completed",
    "sdk_path": "/home/user/tizen-sdk"
  },
  "warnings": [],
  "errors": []
}
```

If SDK already installed:

```json
{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 500,
  "result": {
    "installation_status": "already_installed",
    "sdk_path": "/home/user/tizen-sdk"
  },
  "warnings": ["SDK is already installed"],
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

- **Single-task request** (e.g., "SDK 설치해줘", "install the SDK") → Your task is DONE. Report the envelope and **suggest** next steps, but do NOT auto-proceed.
- **Multi-step request** (e.g., "SDK 설치하고 앱 만들어서 실행해줘") → Continue to the next step the user requested.

**Suggested next steps (only when the user asks):**

- `tizen-device-manager` (to verify device/emulator connection)
- `tizen-create-project` (to create a new project)
- For debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
