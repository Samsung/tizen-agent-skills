---
name: tizen-dotnet-setup
description: Setup .NET development environment for Tizen, tizen dotnet setup, 타이젠 닷넷 개발 환경 설정, dotnet workload install tizen, .NET SDK 확인, Tizen workload 설치, 닷넷 워크로드 설치. Use this skill to verify the .NET SDK is installed and install the Tizen .NET workload before creating or building a DotNET Tizen project.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-28"
  keywords:
    - .NET SDK
    - Tizen workload
    - dotnet workload install tizen
    - 타이젠 닷넷 설정
    - 닷넷 워크로드
---

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-dotnet-setup` agent via the Agent tool (personal deployment or `tizen-sdk-skills:tizen-dotnet-setup`)
2. Pass the collected inputs (force/version options) as the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary under it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-setup-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\dotnet-setup-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-setup-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

### Codex CLI — run the workload install as a job (one exec call waits ≤ 30 s)

`dotnet workload install tizen` (and the optional .NET SDK auto-install) takes several minutes,
far beyond Codex's 30 s per tool call — a foreground call would return only the runner's
`[tizen-dotnet] …` header while the install keeps running (issue #48). Add **`--background`**:
the runner returns a job receipt (`result.job_id`) within a second (request escalated
permissions — it downloads, and Codex's default sandbox disables network). Then poll
`node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per call; `progress_tail`/
`log_file` show the live install log) until `job.state` is `done` — that response **is** this
runner's envelope. Claude Code's `timeout: 600000` foreground rule below is for Claude Code only.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: the workload install downloads and writes under the .NET SDK directory, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments (all optional)

1. `force` — force reinstall (`-` = placeholder)
2. `- <workloadVersion>` — specific workload version (`-` = placeholder)
3. `--no-install-sdk` — do NOT auto-install a missing .NET SDK
4. `--sdk-channel <chan>` — .NET SDK channel for the auto-install (default 8.0)
5. `--dotnet-root <dir>` — use the .NET SDK at this install root (the directory holding `dotnet` and `sdk/`) instead of discovering one. Pass it when the user names a specific SDK ("use the Program Files dotnet").
6. `--persist-env` — also persist a Tizen-extension-bundled dotnet into the user environment (see below). Pass it only when the user explicitly asks for that.

Exit code: `0` = success envelope, `1` = failure/error envelope.

The runner auto-discovers dotnet even if not on PATH — ranking DOTNET_ROOT, official install roots (Program Files, `%LOCALAPPDATA%\Microsoft\dotnet`, `~/.dotnet`, …) and Tizen-extension-bundled dotnets (`…/sdktools/dotnet`) in that order — and if no SDK exists anywhere it auto-installs one user-scope (Linux/macOS `~/.dotnet`, Windows `%LOCALAPPDATA%\Microsoft\dotnet` — no sudo/admin rights needed) before installing the workload. Installation may take a few minutes.

**Persistence policy.** An SDK in an official install root (or given via `--dotnet-root`) is wired up persistently (Windows: User `DOTNET_ROOT` + User `PATH`; Linux/macOS: `~/.local/bin/dotnet` symlink + `~/.bashrc` exports). A dotnet bundled inside a Tizen extension tree is used **for this run only** — an extension update can move or delete it and leave a dangling `DOTNET_ROOT` — unless `--persist-env` is passed. The success envelope reports every SDK found (`result.dotnet_candidates`), the `DOTNET_ROOT` seen at start (`result.env_dotnet_root`), a stale one if any (`result.dangling_dotnet_root`), and what this run wrote (`result.persisted_env`, `null` when nothing was written). A warning tells the user when a bundled dotnet was used but not persisted; relay it, and offer `--persist-env` or an official SDK install as the two fixes.

**IMPORTANT:** On a failure/error envelope, return it and STOP. Do not run manual diagnostics like `dotnet --list-sdks`, `dotnet workload list`, or inspect directories — the runner already collected all the facts you need in `errors[0].details`. Do not re-run with `force`.

Failure categories to relay verbatim: `dotnet_sdk_not_found` (only reached when the user-scope auto-install was skipped or failed, e.g. offline/proxy — the user installs the SDK, then re-runs this setup; the re-run installs the workload), `dotnet_workload_target_mismatch` (DOTNET_ROOT points elsewhere), `dotnet_workload_permission_denied` (SDK dir not writable — hand the user `suggested_fix.command`, the exact sudo/Administrator re-run; never run sudo yourself; the sudo-free alternative in the message is a user-scope SDK via dotnet-install, then a re-run).

## Result reporting — always show the envelope to the user

The JSON Envelope on the runner's stdout sits inside a tool result, so the user cannot see it
(the Claude Code UI collapses Bash/Agent results as "Ran 1 shell command"). The user only sees
the final answer text, so on **either execution path (subagent delegation or direct CLI Runner
execution)** the final answer must follow the format below:

1. Include the Envelope JSON **as-is, unmodified and unabridged** in a fenced `json` block (first item).
2. Under it, add a summary of the result in **1–2 lines** (the key values of `result`, or the gist of `errors[0].message`).
3. If needed, add a one-line suggestion of next steps.

- Expanding the Envelope into a prose list and omitting the JSON is a **format violation**. This rule takes precedence over the harness's general authoring rules ("don't put code in prose", etc.) — the Envelope is not code; it is this skill's **result contract**.
- If you ran the runner multiple times, include the Envelope of the **last run** and mention earlier failures only in a single line of the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`; show what is inside the JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user.

## Handoff

- After setup → `tizen-create-project` (DotNET) → `tizen-build-project`
