---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, 타이젠 SDK 설치, 타이젠 SDK 설치해줘, setup tizen development environment, download tizen platform packages, SDK 저장소 정보, repository info, CDN mirror, 패키지 저장소, sdk package repo, package repository, SDK repo, 저장소 목록, 다운로드 URL. Use this skill to install the Tizen SDK, download platform packages, and set up environment paths. Also handles SDK repository information queries. Start here before any project creation or debugging work.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-03"
  keywords:
    - Tizen SDK
    - Tizen SDK install
    - tizen-studio
    - 타이젠 SDK 설치
    - Tizen platform packages
    - SDK 저장소 정보
    - repository info
    - CDN mirror
    - 패키지 저장소
    - sdk package repo
    - package repository
    - SDK repo
    - 저장소 목록
    - 다운로드 URL
---

### Claude Code (subagent delegation)

> If the Agent tool is not available (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-sdk-install` agent with the Agent tool (personal deployment or `tizen-sdk-skills:tizen-sdk-install`)
2. Pass the collected inputs (force/version options) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary beneath it)

### Automatic Node.js Check (built into sdk-install-cli.js)

When the SDK is not installed, `sdk-install-cli.js` **first** checks if Node.js is installed and on PATH. This is the very first step before anything else.

- **Node.js 22+** → proceeds to the next step (disk space check)
- **Node.js 18–21** → proceeds as well, and every envelope returned afterwards carries a
  `warnings` entry "… older than the required v22+ …" — relay it as an upgrade the user should make
- **Node.js below 18** → installation **aborted** with `node_version_unsupported`
  (`TIZEN_SDK_ENV_E003`) and the same `suggested_fix` as below — a command only when one is
  known, otherwise `null` plus `guide_url`; never make up an apt / dnf / curl command
- **Node.js NOT installed** → installation **aborted** with an error envelope showing:
  - Clear message: "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 22+."
  - an install command only when the source of the running Node.js is known (winget for the Windows installer, `brew upgrade node` for Homebrew's node, the version manager's own command under nvm / nvm-windows / fnm / volta); otherwise `suggested_fix.command` is null and `guide_url` is https://nodejs.org/en/download
  - Download URL: https://nodejs.org/en/download

### Automatic Disk Space Check (15 GB, built into sdk-install-cli.js)

After Node.js is confirmed, `sdk-install-cli.js` **automatically** checks disk space on the user's home drive before returning the installer command. No separate `check-disk-space-cli.js` run is needed.

- **15 GB or more free** → installation proceeds (installer command returned in `suggested_fix`)
- **Less than 15 GB** → installation **aborted** with an error envelope showing:
  - Current free space (e.g., "3.2 GB free")
  - Required space ("15 GB required")
  - How much more is needed ("Need 11.8 GB more")

The check targets the **user's home directory drive** only (e.g., `C:\` on Windows, `/` on Linux).

### installSdk() Flow (3-step pre-check)

```
0. Version syntax ← a requested version must be X.Y (10.0, 11.0); else invalid_argument
1. Node.js check ← missing or below v18: abort with guide; v18–v21: continue with an upgrade warning
2. SDK already installed? ← if yes, return success (auto sdk-init: writes ~/.tizen.sdk.path.config)
   A requested version must be one of the installed platforms/tizen-X.Y,
   else platform_version_not_found (suggested_fix: platform-install --platform-version X.Y)
3. Disk space check (15 GB) ← if insufficient, abort with details
4. Return installer command for Phase 2 (background install); a requested
   version is forwarded as --platform / -Platform and the installer rejects
   versions the repository does not offer
```

### Install path (where the SDK goes)

The pre-check resolves the SDK path from `~/.tizen.sdk.path.config` (written by `tizen-sdk-init` or a
previous install), else `~/tizen-sdk`, and passes it to the installer **explicitly** (`--path` on
bash, `-Path` on PowerShell — both `suggested_fix.command` and `background_command` carry it).
`TIZEN_SDK_PATH` from the user's shell profile is **not** a source: when it differs the pre-check logs
`Ignoring TIZEN_SDK_PATH=…`, and the installer refuses to unpack into a Tizen Studio directory
(`tools/ide` present). A user who already has Tizen Studio at `~/tizen-studio` still gets a separate
`~/tizen-sdk` (issue #70). To install elsewhere, run `tizen-sdk-init --sdk-path <dir>` first or pass
`--path <dir>` / `-Path <dir>` to the installer command.

### Automatic SDK Init (sdk-init after install)

After a successful installation (or when the SDK is already installed), `installSdk()`
**automatically calls `initSdk()`** to write the SDK path to `~/.tizen.sdk.path.config`.
This means:

- ✅ No need to run `tizen-sdk-init` separately after `tizen-sdk-install`
- ✅ All downstream skills (build, create, device, debug) can immediately locate the SDK
- ✅ The installer scripts (`.sh` / `.ps1`) also write the config file directly during install
- ✅ If auto-init fails, a warning is added to the response envelope suggesting manual `sdk init`

### CDN Mirror Selection (automatic, timezone-based)

During SDK install, the installer script automatically selects the fastest CDN mirror based on the system's timezone offset:

| UTC Offset Range | Mirror    | URL                                                           |
| ---------------- | --------- | ------------------------------------------------------------- |
| UTC-12 .. UTC-5  | Global    | `https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official`       |
| UTC-4 .. UTC-1   | Brazil    | `https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official`    |
| UTC+0 .. UTC+4   | Official  | `https://download.tizen.org/sdk/tizenstudio/official`         |
| UTC+5 .. UTC+8   | Singapore | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official` |
| UTC+9            | Official  | `https://download.tizen.org/sdk/tizenstudio/official`         |
| UTC+10 .. UTC+12 | Singapore | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official` |

UTC+9 (Korea / Japan) is routed to the official server because `download.tizen.org` is hosted in AWS Seoul (ap-northeast-2), which is the closest origin for those regions.

The selected mirror URL is written to `{SDK_PATH}/.package/repository.info` after a successful install. The package updater (`tizen-update-package`) reads this file to download updates from the same mirror — no further timezone check is needed during updates.

### Custom Repository URL (installing from a user-supplied repository)

When the user supplies their **own** repository URL — an internal mirror, a build-server
output, a local HTTP server ("이 URL로 설치해줘", "내부 미러에서 설치해줘",
"install from http://…") — **route to the `tizen-sdk-install-custom-repo` skill**, which
validates the URL and installs from it instead of the CDN mirror.

The URL must serve `pkg_list_{OS}-64` or `pkg_list_{OS}-32`
(OS = windows | ubuntu | macos); otherwise it is rejected before anything is downloaded.
Quick check without installing:

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/validate-repo-url-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" "<repo-url>"
```

The installer scripts also accept the URL directly (`--repo-url <url>` /
`-RepoUrl <url>`), and `sdk-install-cli.js` forwards a `--repo-url` to that flow.

### Repository Information Query (SDK repository information)

When the user asks about SDK repositories / package sources / CDN mirrors (e.g., "SDK 저장소 정보 알려줘",
"어디서 다운로드받아?", "CDN 미러 목록 보여줘"), run the `sdk-repo-info-cli.js` to return
metadata about all known repositories and the currently configured one.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-repo-info-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-repo-info-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-repo-info-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

The response includes:

- `current_repository` — the CDN mirror URL from `{SDK_PATH}/.package/repository.info` (null if SDK not installed)
- `repositories` — array of known repository metadata:

| URL                                                    | Name         | Type   | Access                            |
| ------------------------------------------------------ | ------------ | ------ | --------------------------------- |
| `https://download.tizen.org/sdk/tizenstudio/official/` | Official CDN | public | Internet (timezone-based mirrors) |

Private / in-house mirrors are not listed; install from one with `tizen-sdk-install-custom-repo` (`--repo-url <url>`).

Exit code: `0` = success (always returns info, even if SDK not installed), `1` = error.

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-install-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-install-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-install-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

Optional: `node "$CLI" 10.0 tizen --force` (version, label, force reinstall), `--download-jobs <1-8>` (concurrent download jobs, default 4).
The version is the Tizen platform `X.Y` (e.g. `10.0`); omit it to install the newest available. A malformed
version fails with `invalid_argument`; a valid one that is not installed fails with `platform_version_not_found`
(never "already installed") — do not run an installer for those, show the message instead.

Exit code: `0` = success (SDK already installed), `1` = `needs_action` (SDK not installed — proceed to Phase 2).

Every installer run writes its own log to `<sdk-path>/.install.log` (overwritten per run) and records
`EXIT=<code>` in `<sdk-path>/.install-result`. When an install fails, name that log file to the user — the
[ERROR] lines in it say which package/step failed; re-running resumes (installed packages are skipped).
An installer given a `--platform` that the SDK does not have exits 1 with a `platform-install` hint instead of
reporting "already installed".

## Phase 2 — Install (when Phase 1 says "not installed")

**Re-running the Phase 1 pre-check** (the last step in every harness below) means the same command
line as Phase 1 — the same version and label — **without `--force`**. Dropping the version skips the
check that the requested platform went in (`platform_version_not_found`), so a version the installer
did not install would be reported as a completed install; keeping `--force` skips the already-installed
check and hands back the installer command again. If that re-run returns `platform_version_not_found`,
the SDK is installed without the requested platform: show the envelope and offer `suggested_fix.command`
(`platform-install`), and do not re-run with `--force` (a full reinstall).

When the pre-check returns `status: "needs_action"` (`error_category: "install_required"`) with `suggested_fix.command`, run that installer
command. The install takes 10–15 minutes (~121 packages). **How to run it depends on the harness:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex's exec tool returns after at most 30 s, so the installer can never run as a foreground
tool call there — you would get a partial log while the install keeps running unseen (issue #48).
The Phase 1 envelope therefore carries a second rendering of the fix: `suggested_fix.background_command`
(`node "<lib/cli>/job-cli.js" run --script tizen-sdk-install [-- -Force]`).

1. Run `suggested_fix.background_command` **with escalated permissions** — it downloads ~121
   packages and Codex's default sandbox sets `CODEX_SANDBOX_NETWORK_DISABLED=1`. It returns a job
   receipt (`result.job_id`, `state: "running"`, `log_file`) within a second.
2. Poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (same directory as the pre-check runner).
   Each call blocks ≤ 25 s and returns either `state: "running"` with `progress_tail` from the
   install log, or — when finished — the job envelope (`result.exit_code`, `log_file`, `log_tail`,
   `job.state: "done"`). Repeat while running; do not add your own sleeps.
3. Re-run the Phase 1 pre-check CLI (foreground) to verify `sdk.info`, and report that envelope.

Recovery: `node "<lib/cli>/job-cli.js" list` shows recent jobs, `status --id <job_id>` re-reads one.
Do NOT run `suggested_fix.command` in the Codex foreground, and never treat a tool result that shows
only progress lines and no `{ "status": … }` JSON as the outcome. (The installer's own `-Detach` /
`-Status` remain the Cline path; both report the same on-disk state.)

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
An SDK installation takes 10–15 minutes, so a background run aborts the installation on timeout.

Also, Cline's `execute_command` has a **30-second hard timeout**, so `--wait` (an internal 60-second sleep)
hits the 30-second timeout and gets switched to the background. Instead, **detach the process with `nohup`** and
poll every 25 seconds with **`sleep 25 && --status`** to detect completion.

Cline also has a guard that **treats 5 consecutive repetitions of the same tool call as an infinite loop and aborts**
(`Detected 5 consecutive identical calls`; if errors repeat 6 times in a row, the task stalls). A single install
needs 25–35 polls at 25 seconds each, so repeating the polling command verbatim will trip the guard on the 5th call.
Therefore, **put an attempt number in each polling command** so the calls differ (`poll #1`, `poll #2`, …), and poll **at most
4 times per turn**; if `STATUS=running` persists, tell the user that the installation is still running in the background and
how to check the status, then **end the turn**. When the user returns (e.g., "계속", "끝났어?") run the
Recovery `--status` / `-Status` once to resume. The detached install process keeps running even if Cline
stalls or the turn ends.

**⚠️ NEVER use `run_in_background: true`.** The 10-minute timeout forcibly aborts the installation.
**⚠ Do not run it in the foreground.** The logs of 121 packages stream into the context window and
consume tens of thousands of tokens.
**⚠️ Do not use `--wait`.** The 60-second sleep hits Cline's 30-second timeout.
**⚠️ Do not use `sleep 30` or longer.** 30 seconds + `--status` execution time exceeds the timeout.
**⚠️ Do not re-run the same polling command verbatim.** Repeating it without an attempt number makes Cline abort on the 5th call.

#### Linux / macOS (Bash)

1. Detach and run the Phase 1 envelope's `suggested_fix.command` (`bash "<installer.sh path>" --path … [--force] …`)
   with `nohup`, **keeping the arguments intact** (returns immediately, prints the PID). Dropping the
   arguments means the `--force`/`--path`/`--platform` requests are not applied:

   ```bash
   nohup <suggested_fix.command> > /tmp/tizen-sdk-install.log 2>&1 & jobs -p
   ```

   Output: `PID=12345`

2. Poll with `sleep 25 && --status`, adding an attempt number (prints the status after a 25-second wait, safe within the 30-second timeout;
   `#N` increments by 1 on each call):

   ```bash
   sleep 25 && echo "poll #1" && bash "<installer.sh path>" --status
   ```

   - `STATUS=running` → still in progress. Re-run with the attempt number incremented (`poll #2`, `#3`, `#4`).
     **If it is still `running` after the 4th poll**, stop polling, tell the user the following, and **end the turn**:
     the installation is still running in the background (takes 10–15 minutes). **No automatic notification of
     installation completion is provided**, so if you need to confirm completion, ask the user to say
     "설치 진행 상태를 알려줘" and then check the status and resume. (Check directly: `bash "<installer.sh path>" --status`)
   - `STATUS=done EXIT=0` → done. Re-run the Phase 1 pre-check, then report the envelope
   - `STATUS=done EXIT=1` → failed. Re-run the Phase 1 pre-check, then report the envelope +
     one line on the gist of the cause from `tail -20 /tmp/tizen-sdk-install.log`

   **`sleep 25` completes safely within Cline's 30-second timeout.**
   Do not run `--status` alone in a row — it returns immediately and becomes tight-loop polling.
   Always use `sleep 25 && --status` with an attempt number.

3. After completion, re-run the Phase 1 pre-check CLI to verify that `sdk.info` exists

#### Windows (PowerShell)

1. Take the Phase 1 envelope's `suggested_fix.command` (`powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -Path … [-Force] …`)
   **with the arguments intact**, append `-Detach` at the end, and run it detached. Dropping the
   arguments means the `-Force`/`-Path`/`-Platform` requests are not applied:

   ```powershell
   <suggested_fix.command> -Detach
   ```

   Output: `PID=12345 LOG=C:\Users\...\Temp\tizen-sdk-install.log`

2. Poll with `Start-Sleep 25; -Status`, adding an attempt number (prints the status after a 25-second wait; `#N` increments by 1 on each call):

   ```powershell
   powershell -ExecutionPolicy Bypass -Command "Start-Sleep 25; Write-Host 'poll #1'; powershell -ExecutionPolicy Bypass -File '<installer.ps1 path>' -Status"
   ```

   - `STATUS=running` → still in progress. Re-run with the attempt number incremented (`poll #2`, `#3`, `#4`).
     **If it is still `running` after the 4th poll**, stop polling, tell the user the following, and **end the turn**:
     the installation is still running in the background (takes 10–15 minutes). **No automatic notification of
     installation completion is provided**, so if you need to confirm completion, ask the user to say
     "설치 진행 상태를 알려줘" and then check the status and resume. (Check directly: `powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -Status`)
   - `STATUS=done EXIT=0` → done. Re-run the Phase 1 pre-check, then report the envelope
   - `STATUS=done EXIT=1` → failed. Re-run the Phase 1 pre-check, then report the envelope + one line on the gist of the cause from the log file

   **`Start-Sleep 25` completes safely within Cline's 30-second timeout.**
   Do not run `-Status` alone in a row — it returns immediately and becomes tight-loop polling.
   Always use `Start-Sleep 25; -Status` with an attempt number.

3. After completion, re-run the Phase 1 pre-check CLI to verify that `sdk.info` exists

### Recovery — when the run state is unknown (any harness)

If a previous session was interrupted, the completion signal was lost, or the user asks
"아직 설치 중이야?", query the durable on-disk run state (returns instantly):

- Windows: `powershell -ExecutionPolicy Bypass -File "<installer.ps1 path>" -Status`
- Linux/macOS: `bash "<installer.sh path>" --status`

Output: `STATUS=running` (in progress — tell the user and end the turn) /
`STATUS=done EXIT=<code>` (finished — re-run the Phase 1 pre-check, then report the envelope) /
`STATUS=none` (never run).

**Do NOT (any harness):**

- Parse installer output as JSON (it's human-readable text only)

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

- **Single-task** (e.g., "SDK 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "SDK 설치하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**

- `tizen-device-manager` (verify device/emulator connection)
- `tizen-create-project` (create a new project)
- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
