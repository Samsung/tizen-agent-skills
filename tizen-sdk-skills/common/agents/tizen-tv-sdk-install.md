---
name: tizen-tv-sdk-install
description: Install TV SDK, TV SDK install, TV SDK 설치, TV SDK 설치해줘, 타이젠 TV SDK 설치, Samsung TV SDK, TV extension install. Use this agent to install the Tizen TV SDK extension (TV-SAMSUNG-Public package) on top of an existing Tizen SDK installation. Requires Tizen SDK to be installed first.
tools: Bash, Read, Glob, Grep
model: sonnet
maxTurns: 20
---

## ⚠️ CRITICAL CONSTRAINTS

**Claude Code — you MUST NOT use these tools:** Monitor, ScheduleWakeup, polling, loops, or any waiting/notification mechanism. In Claude Code the only tool you can use for the long-running installer is Bash with `run_in_background: true`. This is non-negotiable.

**⚠️ Codex CLI (no `run_in_background`; one exec call waits ≤ 30 s):** the installer cannot be a
foreground tool call there (issue #48). Run `suggested_fix.background_command` from the Phase 1
envelope (`node "<lib/cli>/job-cli.js" run --script tizen-tv-sdk-install …`) **with
escalated permissions** (it downloads; the default sandbox disables network). It returns a job
receipt within a second; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per
call) until `job.state` is `done`, re-run the Phase 1 pre-check, and report that envelope. Never run
`suggested_fix.command` in the Codex foreground; a tool result that is only progress lines is NOT the outcome.

**When running the installer:**

1. Use only the Bash tool
2. Always set `run_in_background: true`
3. Do NOT add any follow-up logic, polls, or scheduled checks
4. After launching it, END YOUR TURN. Do NOT run anything to "wait": no `sleep`, no `true`/no-op commands, no repeated reads of the output file. The harness automatically re-invokes you with a `<task-notification>` when the background task finishes — that notification is your only signal to continue.
5. Only after the notification arrives: read the output file, then report the final exit code and summary to the user.

**⚠️ Windows — do NOT wrap the launch in `Start-Process`.** Backgrounding is done by the
Bash tool's `run_in_background: true`, NOT by a PowerShell launcher. Specifically:

- **NEVER** build a `Start-Process -FilePath powershell.exe ...` wrapper to "run it in the background."
- **NEVER** use `-RedirectStandardOutput`/`-RedirectStandardError` — PowerShell **errors** if both point at the SAME file, and a detached process reports false success.
- **NEVER** print "설치가 진행 중입니다 / install running" before confirming the process actually started. If a launch command fails, surface the failure — do not claim progress.
- The ONLY correct form is a direct call under `run_in_background: true`:
  `powershell -ExecutionPolicy Bypass -File "$(cygpath -w '<installer.ps1>')"` — no `Start-Process`, no manual log redirect. The Bash tool captures the output for you.

You install the Tizen TV SDK extension (TV-SAMSUNG-Public package) on top of an existing Tizen SDK installation.

## Prerequisite: Tizen SDK must be installed

TV SDK extension installation requires the Tizen SDK to be installed first. If the SDK is not installed, the pre-check CLI will return a failure envelope with an appropriate message — relay this to the user and suggest running the `tizen-sdk-install` skill first.

## Standard JSON Envelope Response

This agent returns a Standard JSON Envelope with TV SDK install results. The final result must follow the "Final message" rules at the end of this file.

## What this agent does

This agent handles TV SDK extension installation by running the installer script in background:

- Verifies Tizen SDK is installed (sdk.info exists)
- Runs the TV SDK installer (tizen-tv-sdk-install.ps1 / tizen-tv-sdk-install.sh), which downloads the `TV-SAMSUNG-Public` extension package and its Install-dependency packages from the TV extensions repository
- Downloads and merges each package into the SDK root (the `tv-samsung` platform payload for each installed tizen-X.Y platform)
- Records the TV version in `.platform-installed` (profile `tv-samsung`, InstalledBy `tv-sdk-install`)
- Creates the `.tv-sdk-installed` marker on success

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

- ✅ **CORRECT**: Run CLI runners with `node` (e.g. `node ".../tv-sdk-install-cli.js"`)
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

**✅ Run the installer script in the background with output redirected to log file**

### 1. Run the pre-check via the shipped CLI runner

**Do NOT compose inline node scripts, heredocs, or temp files. Do NOT use the
PowerShell tool for this.** The plugin ships `lib/cli/tv-sdk-install-cli.js` — run it
with the **Bash tool** in one command. **Copy it VERBATIM — do NOT translate it
to PowerShell syntax (`Get-ChildItem`, `$env:USERPROFILE`, `$null` etc.), which
fails inside the Bash tool:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/tv-sdk-install-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

### 2. Run installer in background (only when step 1 said "not installed")

Use the Bash tool with `run_in_background: true` to run the actual installer
script from the plugin cache:

```bash
# Windows (uname -s = MINGW*/MSYS*/CYGWIN*)
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; INSTALLER=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-tv-sdk-install/tizen-tv-sdk-install.ps1; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$INSTALLER" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then INSTALLER=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$INSTALLER" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
powershell -ExecutionPolicy Bypass -File "$(cygpath -w "$INSTALLER")" -SdkPath "$(cygpath -w "$HOME/tizen-sdk")"

# Linux/macOS
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; INSTALLER=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/scripts/tizen-tv-sdk-install/tizen-tv-sdk-install.sh; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$INSTALLER" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then INSTALLER=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$INSTALLER" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
bash "$INSTALLER" --sdk-path="$HOME/tizen-sdk"
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

The harness re-invokes you when the installer finishes. The notification
carries the exit code, and the Bash tool result from step 2 gave you the task
output file path.

**To produce the final Standard JSON Envelope, re-run the pre-check CLI
(foreground, seconds).** Now that the TV SDK extension is installed, it returns the success
envelope — do NOT hand-write a text report or a fake JSON: run the step 1 command
again unchanged.

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
  "command": "tizen-sdk tv-sdk-install",
  "status": "success",
  "duration_ms": 120000,
  "result": {
    "packages": [
      {
        "name": "TV-SAMSUNG-Public",
        "status": "installed",
        "version": "10.0",
        "profiles": [
          "tv-samsung"
        ]
      }
    ],
    "installation_status": "completed"
  },
  "warnings": ["TV SDK installation verified at /home/user/tizen-sdk (TV 10.0 recorded in .platform-installed). To force a reinstall, run with --force."],
  "errors": []
}
```

If already installed:

```json
{
  "command": "tizen-sdk tv-sdk-install",
  "status": "success",
  "duration_ms": 5000,
  "result": {
    "packages": [
      {
        "name": "TV-SAMSUNG-Public",
        "status": "installed",
        "version": "10.0",
        "profiles": [
          "tv-samsung"
        ]
      }
    ],
    "installation_status": "completed"
  },
  "warnings": ["TV SDK installation verified at /home/user/tizen-sdk (TV 10.0 recorded in .platform-installed). To force a reinstall, run with --force."],
  "errors": []
}
```

## Post-install — ensure the default TV emulator VM (agent step, not the script)

The TV SDK installer only puts packages on disk; it never creates a VM. After the TV install is
verified (both paths: a fresh install, and the idempotent "already installed" pre-check result),
you MUST ensure a default TV emulator VM exists:

1. Locate the emulator-manager runner the same way as the Phase 1 pre-check (same lookup blocks),
   but with the runner file name `emulator-manager-cli.js`.
2. Run `node "$CLI" list-vm --detail` and check `result.vms`:
   - **A VM named `T-samsung-<version>-x86_64` exists → done.** Skip creation and say so in one line.
   - **Not present → always create it** with em-cli's own default-VM mode:
     `node "$CLI" create --default --profile tv --platform tv-samsung-<version>-x86_64`
     where `<version>` is the TV platform version from the Phase 1 envelope's
     `result.packages[].version` (e.g. version `10.0` → platform
     `tv-samsung-10.0-x86_64`).
     em-cli rewrites `default-tv-samsung-<version>-x86_64` into the SDK's
     canonical default VM name `T-samsung-<version>-x86_64` — the same dotted
     name the native Emulator Manager and the Tizen VS Code extension create
     (the `-d` mode bypasses em-cli's VM-name character check, so the dots are
     valid). No `--size`: the platform's default template (1080) applies. No
     `--vm-name`: it is derived from the platform.
     The TV repository currently ships one image per version (x86_64). Should a
     future TV SDK ship several architecture images, ensure one default VM per
     installed `tv-samsung` image — the derivation is identical
     (`tv-samsung-<version>-<arch>` → `T-samsung-<version>-<arch>`).
     The decision is by name only — other `tv`-profile VMs (user-created or leftover) do not
     suppress the default VM. Do NOT pass `--launch` — booting is `tizen-launch-emulator`'s job.
3. Best-effort: a VM-creation failure is reported as a **warning** in the summary and never
   changes the TV SDK install result — the extension install already succeeded.
4. Include the create/list envelope **after** the install envelope in your final message.

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

- **Single-task request** (e.g., "TV SDK 설치해줘", "install TV SDK") → Your task is DONE after the "Post-install — ensure the default TV emulator VM" step: report the install envelope (and the create/list envelope if a VM was created), then **suggest** next steps, but do NOT auto-proceed.
- **Multi-step request** (e.g., "TV SDK 설치하고 앱 만들어줘") → Continue to the next step the user requested.

**Suggested next steps (only when the user asks):**

- `tizen-launch-emulator` (to launch the default TV VM that was just ensured)
- `tizen-create-emulator` (to create a new TV emulator VM)
- `tizen-create-project` (to create a new TV project)
- `tizen-device-manager` (to verify device/emulator connection)