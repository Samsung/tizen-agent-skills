---
name: tizen-gdb-debug
description: Tizen GDB debug, tizen gdb debug, 타이젠 GDB 디버깅, 원격 디버깅, 앱 디버그, Tizen 네이티브 디버깅. Use this skill for automated remote GDB debugging of Tizen NATIVE apps ONLY — device check, app start, PID lookup, gdbserver launch, port forwarding, and host GDB attach. NEVER use for WebApp (.wgt) projects — web apps have no native binary and the script will refuse them.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - Tizen GDB
    - tizen native debug
    - gdbserver
    - remote debug
    - 타이젠 디버깅
    - tizen gdb debug
    - sdb port forwarding
---

## Do NOT use for Web apps (IMPORTANT)

**Never run this flow for a WebApp (.wgt) project, even if the user asks to "debug the app".**
Web apps run inside the web runtime and have no native binary — GDB cannot attach to them,
and the script auto-detects wgt packages on the device and refuses them with an error.
When the project is a WebApp:

- Do not attempt `tizen-gdb-debug` or `tizen-dotnet-debug` at all.
- Use the **`tizen-webapp-debug`** skill instead — it sets up RWI/CDP (Chrome DevTools
  Protocol) debugging and returns a ready CDP endpoint.
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native;
  `.csproj` → DotNET) before choosing a debug flow.

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-gdb-debug` agent via the Agent tool (personal deployment or `tizen-sdk-skills:tizen-gdb-debug`)
2. Pass the collected inputs (app ID, binary path, mode, breakpoints) as the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary under it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/gdb-debug-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" <appId> "<binaryPath>" <attach|launch> "fn1,fn2"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\gdb-debug-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" <appId> "<binaryPath>" <attach|launch> "fn1,fn2"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" <appId> "<binaryPath>" <attach|launch> "fn1,fn2"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

### Codex CLI — run the setup as a job (one exec call waits ≤ 30 s)

The setup starts the app, polls for its PID (up to `--timeout`, default 30 s), pushes and starts
gdbserver and forwards the port, with several fixed waits in between — it routinely passes
Codex's 30 s per tool call, after which only the runner's header comes back while the setup keeps
running (issue #48). Add **`--background`**: the runner returns a job receipt (`result.job_id`)
within a second, then poll `node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per
call; `progress_tail`/`log_file` show the live script output) until `job.state` is `done` — that
response **is** this runner's envelope with the gdb attach command.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb port forwarding and gdbserver need localhost sockets, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

1. **appId** (required) — Tizen package ID
2. **binaryPath** (required) — host binary path with debug symbols (e.g., `<project>/Debug/tpk/bin/<exec>`)
3. **mode** (optional, default `attach`) — `attach` (app already running, gdbserver attaches to PID) | `launch` (gdbserver starts binary, stops before `main`)
4. **breakpoints** (optional, comma-separated, `-` for none) — e.g. `service_app_control`, `main`, `service_app_create`
5. **port** (optional, default `5039`, `-` to keep the default) — gdbserver port forwarded from host to device
6. **serial** (optional) — device serial (`sdb devices`), e.g. `emulator-26101`; default: the first connected device. `--serial` in tizen-cli.

**Mode/breakpoint compatibility:** `main` and `service_app_create` require `launch` mode. If user selects `attach` with a launch-only breakpoint, inform and re-ask.

Exit code: `0` = success envelope. The runner is **setup-only** — it returns `result.gdb_command` for the user to run in an interactive terminal. Do NOT start interactive gdb yourself.

**gdbserver on the device:** the script uses the image's `gdbserver` when it has one; otherwise (emulator images since Tizen 8 ship none) it installs `<sdk>/tools/on-demand/gdbserver_<ver>_<arch>.tar` to `/home/owner/share/tmp/sdk_tools/` on first use — the same on-demand install `tizen-dotnet-debug` does for netcoredbg. Nothing to prepare by hand.

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

- WebApp (.wgt) → gdb/netcoredbg cannot debug web apps → `tizen-webapp-debug` (RWI/CDP)
- DotNET (C#) app → `tizen-dotnet-debug` (gdb cannot debug CoreCLR)
- SDK not installed → `tizen-sdk-install`
- No project → `tizen-create-project`
