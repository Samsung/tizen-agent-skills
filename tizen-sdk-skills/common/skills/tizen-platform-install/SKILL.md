---
name: tizen-platform-install
description: Install Tizen platform, platform install, 플랫폼 설치, 플랫폼 설치해줘, 타이젠 플랫폼 설치, Tizen platform package, TIZEN-Version platform, platform package download, 플랫폼 패키지 설치, 설치된 플랫폼, 설치된 버전 목록, 설치된 타이젠 버전, installed platforms, list platforms, which Tizen versions are installed. Use this skill to download and install the Tizen platform package (TIZEN-{Version}) from the Tizen package repository — several versions (e.g. 10.0 and 9.0) live side by side — and to list the platform versions already installed (--list). Reads the repository URL from repository.info. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-10-24"
  keywords:
    - platform install
    - Tizen platform
    - TIZEN-Version
    - 플랫폼 설치
    - 플랫폼 패키지
    - repository.info
    - platform package
    - installed platforms
    - list platforms
    - 설치된 플랫폼
    - 설치된 버전 목록
---

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-platform-install` agent with the Agent tool
2. Pass the collected inputs (platform_version, force option) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary beneath it)

### Prerequisite: Tizen SDK must be installed

The platform package is an **extension package** of the Tizen SDK, so the Tizen SDK must be installed first.

- **Tizen SDK installed** → proceed with the platform package installation
- **Tizen SDK not installed** → abort the installation and return an error envelope:
  - "The Tizen SDK must be installed first. Use the tizen-sdk-install skill to install the SDK."

### installPlatform() Flow

```
1. Check whether the Tizen SDK is installed (sdk.info) ← abort if not installed
2. Is the requested version already installed? (platforms/tizen-X.Y has a profile folder other than "common", and that folder contains something other than "samples" (rootstraps etc.), and .platform-installing-X.Y is absent) ← if installed, return success
   - Other installed versions do not matter: several TIZEN-X.Y versions are installed side by side
   - A version with only platforms/tizen-X.Y/common is NOT installed (shared data the base SDK bundles alongside for older API versions). A version with only <profile>/samples created by project-template copying is also not installed
3. Return the platform package installer command (suggested_fix) — the agent runs it as Phase 2
```

### What the install script does

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `{PKG_REPO_URL}/pkg_list_{OS}-{32,64}` from the Tizen package repository
3. Parses the package list (Package, Version, Path, SHA256, Install-dependency, etc.)
4. Targets `TIZEN-{version}` from the required `--platform-version` argument (there is no auto-detection of the latest platform)
5. Recursively resolves all Install-dependency packages of the platform package
6. Downloads each package zip from `{PKG_REPO_URL}{Path}` and extracts/merges `data/` into the SDK root
7. Marks the run with `.platform-installing-X.Y` while it runs; on success removes it and appends a block for the version and its profiles to `.platform-installed` — the record of what the user installed, which `sdk-install` and both TV installers append to as well (a failed run keeps the marker, and a re-run resumes)
8. Reports summary: OK / skipped / failed counts

### repository.info

During SDK install, a CDN mirror is automatically selected based on the system timezone and stored in `.package/repository.info`. The platform package installer reads this file to download from the same mirror — **no further timezone check is needed**. If `repository.info` is missing (e.g., SDK was installed before this feature), the installer falls back to the official repository (`https://download.tizen.org/sdk/tizenstudio/official`).

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/platform-install-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\platform-install-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*platform-install-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

**List installed platforms (read-only):** `node "$CLI" --list` — no `--platform-version`. `result.platforms` has one entry per platform version the user installed — the versions `.platform-installed` records, plus one whose install has not finished — not every `platforms/tizen-X.Y`: the `tv` / `tv-samsung` folders the TV extension bundles for older versions (2.4 … 9.0) are not entries. `status` is `installed`, `incomplete` (an unfinished install — re-run it to resume) or `not_installed` (recorded, but its folders are gone), plus `profiles` (the recorded profiles on disk: `tizen`, plus `tv-samsung` when the TV extension was installed for that version) and `emulator_images`. `result.newest` is the newest installed entry. Report it per the "Result reporting" rules below, every version with its profiles on one line (e.g. `installed: 9.0 (tv-samsung), 10.0 (tizen, tv-samsung), 11.0 (tizen)`).

**Required:** `node "$CLI" --platform-version 10.0` (specify platform version — **mandatory**, `X.Y` form; anything else such as `99.99.99` fails with `invalid_argument` before anything runs), `node "$CLI" --force` (force reinstall), `--download-jobs <1-8>` (concurrent download jobs, default 4)

Exit code: `0` = success (platform package already installed), `1` = `needs_action` (platform package not installed — proceed to Phase 2) or `failure` (Tizen SDK not installed).

## Phase 2 — Download & Install (when Phase 1 says "not installed")

When the pre-check returns `status: "needs_action"` (`error_category: "install_required"`) with `suggested_fix.command`, run that installer
command. The download may take a few minutes. **How to run it differs by harness:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-platform-install -- …`)
**with escalated permissions** (it downloads; the default sandbox disables network). It returns a job
receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify.
Never run `suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify the version is reported installed
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**
- Run the installer in foreground (may exceed the Bash tool's 10-min cap)
- Poll/sleep while waiting

### Cline — run in the FOREGROUND (Cline has no background completion notification)

Cline does not wake the agent again when a background task finishes (there is no `<task-notification>`).
If you run it in the background, the completion report is lost forever. Always run it in the **foreground** —
Cline's `execute_command` has no 10-minute limit and waits, streaming the progress log, until the command exits.

1. Run the installer command from `suggested_fix` in the **FOREGROUND** — copy it verbatim.
   It blocks a few minutes; that is expected.
   Do NOT background it: no `Start-Process`, no `start /b`, no trailing `&`.
2. When the command exits, **in the SAME turn** re-run the Phase 1 pre-check CLI to verify the version is reported installed
3. **Proactively** report the final success/failure envelope — do not end the turn before
   reporting the installation's success/failure. Waiting until the user asks "끝났어?" is a bug.

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether the version is installed (`platforms/tizen-X.Y` with a profile, no `.platform-installing-X.Y`).

**Do NOT (any harness):**
- Parse installer output as JSON (it's human-readable text only)

## Result reporting — Always show the envelope to the user

The runner's stdout JSON Envelope **lives inside the tool result, so the user never sees it**
(the Claude Code UI collapses Bash/Agent results into something like "Ran 1 shell command"). What the user
sees is only the final answer text, so the final answer must follow the format below on **any execution path
(subagent delegation or direct CLI Runner run)**:

1. Include the Envelope JSON **verbatim, without edits or truncation**, in a fenced `json` block (first item).
2. Beneath it, add a **1–2 line** summary of the result (the key values of `result`, or the gist of `errors[0].message`).
3. Add one line suggesting next steps if useful.

- Unrolling the envelope into a prose list and omitting the JSON is a **format violation**. This rule takes
  precedence over the harness's general writing rules ("don't put code in prose", etc.) — the Envelope is not
  code, it is this skill's **result contract**.
- If you ran the runner more than once, include the Envelope from the **last run**, and mention earlier
  failures only in a single line of the summary.
- Include failure Envelopes verbatim too. Do not retype `errors[0].message`/`details` — show what is in the
  JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user the question.

## Handoff

- **Single-task** (e.g., "플랫폼 패키지 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "플랫폼 패키지 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-create-project` (to create a new project targeting this platform)
- `tizen-build-project` (to build the project)
- `tizen-install-app` (to install on device/emulator)
