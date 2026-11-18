---
name: tizen-webapp-debug
description: Tizen WebApp debug, tizen webapp debug, 타이젠 웹앱 디버깅, 웹앱 디버깅, RWI, Remote Web Inspector, CDP, Chrome DevTools 디버깅, wgt 디버깅, Playwright connectOverCDP, web inspector debugging. Use this skill for automated remote debugging of Tizen Web apps (.wgt) ONLY via RWI/CDP — device check, debug-mode app launch (app_launcher -w), RWI port forwarding, and CDP endpoint verification; returns the CDP endpoint plus Playwright/DevTools connect snippets. NEVER use for Native (.tpk C/C++) or DotNET apps — they have no web runtime; use tizen-gdb-debug or tizen-dotnet-debug instead.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-10"
  keywords:
    - Tizen webapp debug
    - Remote Web Inspector
    - RWI
    - CDP
    - Chrome DevTools
    - 타이젠 웹앱 디버깅
    - wgt 디버깅
    - Playwright connectOverCDP
---

## Do NOT use for Native or .NET apps (IMPORTANT)

**Never run this flow for a Native (.tpk C/C++) or DotNET project, even if the user asks to "debug the app".**
Only Web apps run inside the web runtime (Chromium-based engine) — a native binary or CoreCLR
process has no RWI server to expose, and the script auto-detects non-wgt packages on the device
and refuses them with an error. When the project is NOT a WebApp:

- Do not attempt `tizen-webapp-debug` at all.
- Native (C/C++) app → `tizen-gdb-debug`; DotNET app → `tizen-dotnet-debug`.
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native;
  `.csproj` → DotNET) before choosing a debug flow.

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-webapp-debug` agent via the Agent tool (personal deployment or `tizen-sdk-skills:tizen-webapp-debug`)
2. Pass the collected inputs (app ID, host port, serial) as the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary under it)

### CLI Runner (fallback when the Agent tool is unavailable)

**⚠️ Pick the snippet by the TOOL you run it in, NOT by the OS.** In Claude Code the Bash
tool runs **Git Bash even on Windows** — bash syntax works there and `$HOME` maps to
`%USERPROFILE%`. **NEVER put PowerShell/cmd syntax (`$env:`, `Get-ChildItem`, `cmd /c dir /s /b`,
`Write-Host`) into the Bash tool** — it fails with `command not found` regardless of
whether the CLI file exists.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/webapp-debug-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" --app-id <APP_ID> [--port 9222] [--serial <serial>] [--timeout 30]
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\webapp-debug-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" --app-id <APP_ID> [--port 9222] [--serial <serial>] [--timeout 30]
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*webapp-debug-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" --app-id <APP_ID> [--port 9222] [--serial <serial>] [--timeout 30]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

### Codex CLI — run the setup as a job (one exec call waits ≤ 30 s)

The setup relaunches the app in debug mode (up to 3 attempts) and waits for the CDP endpoint (up
to `--timeout`, default 30 s) — it can pass Codex's 30 s per tool call, after which only the
runner's header comes back while the setup keeps running (issue #48). Add **`--background`**: the
runner returns a job receipt (`result.job_id`) within a second, then poll
`node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per call; `progress_tail`/
`log_file` show the live script output) until `job.state` is `done` — that response **is** this
runner's envelope with the CDP endpoint.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb port forwarding and the RWI/CDP endpoint need localhost sockets, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

- `--app-id <id>` (required) — Tizen web app ID, e.g. `abcDEF1234.MyWebApp`
- `--port <port>` (optional, default `9222`) — host port forwarded to the device RWI port
- `--serial <serial>` (optional) — device serial (default: first connected device)
- `--timeout <sec>` (optional, default `30`) — CDP endpoint readiness timeout

Exit code: `0` = success envelope, `1` = failure/error envelope.

## Inputs — how to obtain them (no sdb)

**Never run `sdb devices`, `sdb shell pkgcmd -l`, `sdb shell app_launcher …`, `sdb forward` or
any other `sdb` command to gather inputs, and never search for the sdb binary — the runner does
device discovery, the debug-mode launch (`app_launcher -w`) and the RWI port forward itself
(issue #94).**

- **`--app-id`** — from the project: the `id` attribute of `<tizen:application id="…">` in the
  web app's `config.xml` (Read tool); otherwise ask the user. Do not list packages on the device.
- **`--serial`** — omit it; the runner uses the single connected device. With several devices,
  ask the user (or use `tizen-device-manager`'s `result.device_serial`). On `device_not_found`,
  hand off to `tizen-device-manager` — do not probe with sdb.
- **`--port`** — default unless the user asks for a specific host port.

## Result Handling

- **Success:** Highlight `result.connect.devtools` as THE link — it is the direct Chrome
  DevTools inspector URL (`http://127.0.0.1:<port>/devtools/inspector.html?ws=...`) the
  user opens in Chrome; do NOT list `/json/list`, `chrome://inspect`, or raw WebSocket
  URLs as extra options. Also relay `result.connect.playwright` (a ready-to-use
  `chromium.connectOverCDP(...)` snippet) and `result.note`: the RWI session and the port
  forward stay alive after setup, so the user can connect/reconnect anytime while the app
  runs.
- **Not a web app (failure, `invalid_parameters`):** Do NOT retry. Route Native apps to
  `tizen-gdb-debug`, .NET apps to `tizen-dotnet-debug`.
- **RWI/CDP unavailable (failure, `inspector_not_available`):** The image may not support the
  Remote Web Inspector (emulator/dev images do), or the endpoint did not answer in time —
  relay the message; retry once with a longer `--timeout` if it was a timeout.
- **No device (failure, `device_not_found`):** → `tizen-device-manager`

The runner is **setup-only** — it verifies the CDP endpoint and returns connect snippets for
the user. Do NOT install Playwright or start browser sessions yourself — to RUN automated
Playwright tests against the endpoint, hand off to `tizen-playwright-test`.

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

- Automated E2E/UI testing with Playwright → `tizen-playwright-test`
- Native (.tpk C/C++) app → `tizen-gdb-debug` (this skill is web-only)
- DotNET app → `tizen-dotnet-debug`
- SDK not installed → `tizen-sdk-install`
- App not built/installed → `tizen-build-project` then `tizen-install-app`
- No device/emulator → `tizen-device-manager`
