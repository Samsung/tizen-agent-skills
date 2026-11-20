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

### Claude Code (subagent delegation)

> If the Agent tool is not available (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-sdk-install-custom-repo` agent with the Agent tool
2. Pass the collected inputs (repository URL, platform version, force) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary beneath it)

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

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/validate-repo-url-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" "<repo-url>"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\validate-repo-url-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" "<repo-url>"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*validate-repo-url-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" "<repo-url>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Exit code: `0` = valid repository (`result.pkg_list_file` names the file that was found),
`1` = invalid (`repo_url_invalid` = malformed URL, `repo_url_unreachable` = no pkg_list served;
`errors[0].details` lists every probed URL).

## Phase 1 — Pre-check (CLI Runner)

This CLI is a **pre-check**, not the installer. It finishes in seconds (URL validation +
already-installed + disk space). Run in foreground — **NEVER with `run_in_background: true`**.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-custom-repo-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" "<repo-url>"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-install-custom-repo-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" "<repo-url>"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-custom-repo-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" "<repo-url>"
```

Optional: `node "$CLI" --repo-url "<url>" --platform-version 11.0 --force --download-jobs 4`
(`--platform-version` omitted = highest `TIZEN-X.Y` the repository offers;
`--download-jobs` = concurrent download jobs, 1-8, default 4).

Exit code: `0` = success (SDK already installed — **read the warnings**, see below),
`1` = not installed yet (`status: "needs_action"`) or URL rejected (`status: "failure"`). Inspect `errors[0].error_category`:

| `error_category`       | Meaning                                            | What to do                                        |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `repo_url_invalid`     | Malformed URL / wrong scheme / points at pkg_list  | Ask the user for the repository **directory** URL |
| `repo_url_unreachable` | Well-formed, but no `pkg_list_{OS}-{64,32}` served | Wrong URL, or internal mirror needs VPN/proxy     |
| `install_required`     | URL is valid, SDK not installed                    | Run `suggested_fix.command` (Phase 2)             |

### installSdkFromRepo() Flow

```
1. Node.js check ← missing or below v18: abort with OS-specific guide; v18–v21: continue with an upgrade warning
2. Repository URL validation (pkg_list_{OS}-{64,32}) ← if invalid, ABORT (nothing downloaded)
3. SDK already installed? ← if yes, success + warning that --force is needed to switch repos
4. Disk space check (15 GB, install drive) ← if insufficient, abort with details
5. Return installer command for Phase 2 (background install)
```

### ⚠️ Already-installed ≠ installed from this repository

If the SDK already exists, step 3 returns **success without downloading anything** — the
existing packages still come from whatever repository installed them. The envelope's
warnings say so explicitly and name the recorded repository. If the user wants the SDK
re-installed **from their URL**, re-run with `--force`.

## Phase 2 — Install (when Phase 1 says "not installed")

**Re-running the Phase 1 pre-check** (the last step in every harness below) means the same command
line as Phase 1 — the same repository URL and version — **without `--force`**. Dropping the version skips
the check that the requested platform went in (`platform_version_not_found`); keeping `--force` skips the
already-installed check and hands back the installer command again. If that re-run returns
`platform_version_not_found`, the SDK is installed without the requested platform: show the envelope and
offer `suggested_fix.command` (`platform-install`), and do not re-run with `--force` (a full reinstall).

Run `errors[0].suggested_fix.command` verbatim. It takes 10–15 minutes (~121 packages).
**How to run it depends on the harness:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-sdk-install-custom-repo -- …`,
which forwards the same `--repo-url`/`-RepoUrl` and platform flags) **with escalated permissions**
(it downloads; the default sandbox disables network). It returns a job receipt at once; then poll
`node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until `job.state` is `done`
(`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify and report that envelope. Never run
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

### Cline — detached execution + numbered `sleep 25 && --status` polling, up to 4 polls per turn (30-second timeout · 5-identical-calls guard)

Cline does not wake the agent again when a background task finishes (no
`<task-notification>`), and background processes are **forcibly terminated after 10 minutes**.
An SDK installation takes 10–15 minutes.

Cline also has a guard that **treats 5 consecutive repetitions of the same tool call as an infinite loop and aborts**
(`Detected 5 consecutive identical calls`; if errors repeat 6 times in a row, the task stalls). A single install
needs 25–35 polls at 25 seconds each, so repeating the polling command verbatim will trip the guard on the 5th call.
Therefore, **put an attempt number in each polling command** so the calls differ (`poll #1`, `poll #2`, …), and poll **at most
4 times per turn**; if `STATUS=running` persists, tell the user that the installation is still running in the background and
how to check the status, then **end the turn**. When the user returns (e.g., "계속", "끝났어?") run the
Recovery `--status` / `-Status` once to resume. The detached install process keeps running even if Cline
stalls or the turn ends.

**⚠️ NEVER use `run_in_background: true`.** The 10-minute timeout forcibly aborts the installation.
**⚠️ Do not run it in the foreground.** The logs of 121 packages consume the context window.
**⚠️ Do not use `--wait`.** The 60-second sleep hits Cline's 30-second timeout.
**⚠️ Do not re-run the same polling command verbatim.** Repeating it without an attempt number makes Cline abort on the 5th call.

#### Linux / macOS (Bash)

1. Detach and run the Phase 1 envelope's `suggested_fix.command`
   (`bash "<tizen-sdk-install-custom-repo.sh path>" --repo-url=… --path … [--force] …`) with `nohup`, **keeping the arguments intact**.
   Dropping the arguments means the `--repo-url` (installs from the default CDN), `--force` and `--path` requests are not applied:

   ```bash
   nohup <suggested_fix.command> > /tmp/tizen-sdk-install.log 2>&1 & \
   jobs -p
   ```

2. Poll with `sleep 25 && --status`, adding an attempt number (`#N` increments by 1 on each call):

   ```bash
   sleep 25 && echo "poll #1" && bash "<tizen-sdk-install-custom-repo.sh path>" --status
   ```

   - `STATUS=running` → in progress. Re-run with the attempt number incremented (`poll #2`, `#3`, `#4`).
     **If it is still `running` after the 4th poll**, stop polling, tell the user the following, and **end the turn**:
     the installation is still running in the background (takes 10–15 minutes). **No automatic notification of
     installation completion is provided**, so if you need to confirm completion, ask the user to say
     "설치 진행 상태를 알려줘" and then check the status and resume. (Check directly: `bash "<tizen-sdk-install-custom-repo.sh path>" --status`)
   - `STATUS=done EXIT=0` → done. Re-run the Phase 1 pre-check, then report the envelope
   - `STATUS=done EXIT=1` → failed. Re-run the Phase 1 pre-check, then report the envelope +
     one line on the gist of the cause from `tail -20 /tmp/tizen-sdk-install.log`

#### Windows (PowerShell)

1. Take the Phase 1 envelope's `suggested_fix.command`
   (`powershell -ExecutionPolicy Bypass -File "<tizen-sdk-install-custom-repo.ps1 path>" -RepoUrl "…" -Path … [-Force] …`)
   **with the arguments intact**, append `-Detach` at the end, and run it detached. Dropping the arguments means the `-RepoUrl` (installs from the
   default CDN), `-Force` and `-Path` requests are not applied:

   ```powershell
   <suggested_fix.command> -Detach
   ```

2. Poll with `Start-Sleep 25; -Status`, adding an attempt number (`#N` increments by 1 on each call):

   ```powershell
   powershell -ExecutionPolicy Bypass -Command "Start-Sleep 25; Write-Host 'poll #1'; powershell -ExecutionPolicy Bypass -File '<tizen-sdk-install-custom-repo.ps1 path>' -Status"
   ```

   - `STATUS=running` → in progress. Re-run with the attempt number incremented (`poll #2`, `#3`, `#4`).
     **If it is still `running` after the 4th poll**, stop polling, tell the user the following, and **end the turn**:
     the installation is still running in the background (takes 10–15 minutes). **No automatic notification of
     installation completion is provided**, so if you need to confirm completion, ask the user to say
     "설치 진행 상태를 알려줘" and then check the status and resume. (Check directly: `powershell -ExecutionPolicy Bypass -File "<tizen-sdk-install-custom-repo.ps1 path>" -Status`)
   - `STATUS=done EXIT=0` → done. Re-run the Phase 1 pre-check, then report the envelope
   - `STATUS=done EXIT=1` → failed. Re-run the Phase 1 pre-check, then report the envelope + one line on the gist of the cause from the log file

### Recovery — when the run state is unknown (any harness)

The run state is durable on disk, so a lost completion signal is always recoverable:

- Windows: `powershell -ExecutionPolicy Bypass -File "<...custom-repo.ps1>" -Status`
- Linux/macOS: `bash "<...custom-repo.sh>" --status`

Output: `STATUS=running` / `STATUS=done EXIT=<code>` (re-run the Phase 1 pre-check, then report the envelope) / `STATUS=none`.

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
- `result.packages` has one `Tizen SDK X.Y` entry per platform version the user installed:
  the versions recorded in `.platform-installed` (sdk-install, platform-install, and the two TV installers
  each append a block whenever they install) plus versions whose `platform-install` has not finished yet. Each entry
  has `status` (`installed`; `incomplete` if that installation has not finished; `not_installed` if the
  recorded folder was deleted — same as `platform-install --list`) and `profiles` (the profiles recorded on disk:
  `tizen`, and `tv-samsung` if the TV extension was installed for that version). The folders the TV extension
  also lays down for older versions (e.g., `tv` / `tv-samsung` of 2.4 … 9.0) are not entries, so do not mention them. In the 1–2 line
  summary, list the entries **on one line**, **each and every one** with its version's profiles (e.g.,
  `installed: 9.0 (tv-samsung), 10.0 (tizen, tv-samsung), 11.0 (tizen)`). Append any `incomplete` /
  `not_installed` entries after that. Do not summarize just the highest version as the version of the whole SDK.
- For **follow-up questions** like "설치된 SDK/플랫폼 버전이 뭐야?", do not re-interpret this envelope or
  re-measure directory listings/sizes; load the `tizen-platform-install` skill, run that skill's
  `--list` step (including finding the runner path), and answer with that envelope.

## Handoff

- **Single-task** (e.g., "이 URL로 SDK 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "이 저장소로 SDK 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**

- `tizen-device-manager` (verify device/emulator connection)
- `tizen-create-project` (create a new project)
- `tizen-update-package` (updates come from the same custom repository)
