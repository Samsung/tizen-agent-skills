---
name: tizen-dotnet-debug
description: Tizen DotNET debug, tizen dotnet debug, 타이젠 닷넷 디버깅, netcoredbg, C# 디버깅, .NET 원격 디버깅, NUI 앱 디버그. Use this skill for automated remote debugging of Tizen .NET apps ONLY with netcoredbg — device check, on-demand debugger install, app start, PID lookup, and either an interactive CLI attach command or a VS Code DAP server. NEVER use for WebApp (.wgt) projects — web apps have no CoreCLR process and the script will refuse them.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - Tizen dotnet debug
    - netcoredbg
    - C# debug
    - .NET remote debug
    - 타이젠 닷넷 디버깅
    - NUI 디버그
    - coreclr debug
---

## Do NOT use for Web apps (IMPORTANT)

**Never run this flow for a WebApp (.wgt) project, even if the user asks to "debug the app".**
Web apps run inside the web runtime — there is no CoreCLR process for netcoredbg to attach to,
and the script auto-detects wgt packages on the device and refuses them with an error.
When the project is a WebApp:

- Do not attempt `tizen-dotnet-debug` or `tizen-gdb-debug` at all.
- Use the **`tizen-webapp-debug`** skill instead — it sets up RWI/CDP (Chrome DevTools
  Protocol) debugging and returns a ready CDP endpoint.
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native;
  `.csproj` → DotNET) before choosing a debug flow.

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-dotnet-debug` agent via the Agent tool (personal deployment or `tizen-sdk-skills:tizen-dotnet-debug`)
2. Pass the collected inputs (app ID, mode, breakpoints) as the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary under it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-debug-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" <appId> [launch|attach|-] "File.cs:line" <port> <serial>
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\dotnet-debug-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" <appId> [launch|attach|-] "File.cs:line" <port> <serial>
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" <appId> <attach|launch> "File.cs:line" <port> <serial>
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

### Codex CLI — run the setup as a job (one exec call waits ≤ 30 s)

The setup starts the app, polls for its PID (up to `--timeout`, default 30 s), installs
netcoredbg on the device on first use (tens of MB over sdb) and waits for it to appear — it
routinely passes Codex's 30 s per tool call, after which only the runner's header comes back
while the setup keeps running (issue #48). Add **`--background`**: the runner returns a job
receipt (`result.job_id`) within a second, then poll `node "<same lib/cli dir>/job-cli.js" wait
--id <job_id>` (≤ 25 s per call; `progress_tail`/`log_file` show the live script output) until
`job.state` is `done` — that response **is** this runner's envelope with the attach command.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb port forwarding and netcoredbg need localhost sockets, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

1. **appId** (required) — Tizen package ID, e.g. `org.tizen.example.MyApp`. The runner resolves the launchable app id from the device (`app_launcher -l`) itself; if the package is not installed it fails with `invalid_parameters` and lists what is installed — do not guess ids.
2. **mode** (optional, **default `launch`**; `-` = default) — `launch` or `attach`. **Launch is the default and the recommended mode** for .NET: the app starts under a netcoredbg DAP server and catches `Main()`. `attach` only when the user explicitly asks — on Tizen a normally-launched .NET app has no CoreCLR debug transport, so attach fails (`0x80131c08`).
3. **breakpoints** (optional, `-` for none) — C# breakpoints as `File.cs:line`, comma-separated. Ask user which file/line.
4. **port** (optional, default `4711`, launch mode only) — DAP server port
5. **serial** (optional) — device serial (default: first connected device)
6. **`--project <dir>`** (optional, launch mode; may appear anywhere, also `--project=<dir>`) — host project (workspace) directory. The runner then writes `<dir>/.vscode/launch.json` itself: `program`/`cwd` are resolved from the `.csproj` (`TargetFramework`, `AssemblyName`), the entry is named `Tizen .NET (netcoredbg)`, other configurations in an existing file are preserved, and a file that is not strict JSON (comments, trailing commas) is left alone with a `launch.json not written:` warning. It also writes `<dir>/.vscode/tasks.json` with a `tizen: netcoredbg launch` task (this runner, same app/port/serial, `--project ${workspaceFolder}`) and sets it as the configuration's `preLaunchTask` — required because stopping a VS Code session ends the app **and** netcoredbg while the sdb forward keeps accepting connections, so a second F5 without a relaunch terminates immediately. **Pass it whenever the project path is known** — never hand-write launch.json in that case.

**Ask the user for the breakpoint(s)**; confirm the mode only if they mention attach. Fall back to launch mode with no breakpoints if the user has no preference.

> **Launch mode does not show the app on screen — that is expected.** The app is started under netcoredbg and *suspended before `Main()`* until VS Code connects (F5). A blank/absent app window after a successful envelope is **not** a failed launch (issue #97). Say this to the user in your first sentence.

Exit code: `0` = success envelope, `1` = failure/error envelope.

## Result Handling

- **Launch mode (success):** First sentence to the user: *"The app is running under netcoredbg but suspended before `Main()` — it shows no window until you press F5 in VS Code; this is expected."* (`result.note` starts with exactly this; `result.app_state` is `suspended_under_debugger`.) Then relay `result.launch_config`: if it carries `launch_json_path`, the file is already written (`launch_json_action`) — open the project in VS Code, pick "Tizen .NET (netcoredbg)", set a breakpoint, press F5; do not edit launch.json yourself. Without `--project` (or when `warnings[]` has `launch.json not written: …`) relay the `<APP_FOLDER_NAME>` template and the warning instead. The `coreclr` type requires the VS Code C# extension (`ms-dotnettools.csharp`). Never tell the user the launch failed because no window appeared.
- **Attach mode (success):** Relay `result.debug_command` verbatim — BOTH `powershell` and `cmd` forms. The leading `&` is PowerShell-only.
- **App not installed (failure, `invalid_parameters` "is not installed on the device"):** Do NOT retry with guessed ids. `errors[0].details` lists the ids the device knows — show them, then route to `tizen-install-app` if the app is missing.
- **Debug launch refused (failure, `io_error` "did not start ... under netcoredbg"):** `errors[0].details` carries the raw `launch_app` output — show it verbatim. The image may not support `__AUL_SDK__` debug launch; do not fall back to raw `sdb shell` commands.
- **Release build detected (failure, `build_failed`):** Do NOT proceed. Guide user to rebuild with Debug (`tizen-build-project`), reinstall (`tizen-install-app`), then retry.
- **No device (failure, `device_not_found`):** → `tizen-device-manager`

The runner is **setup-only** — it returns debug commands/configs for the user. Do NOT start interactive sessions yourself.

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

- WebApp (.wgt) → netcoredbg/gdb cannot debug web apps → `tizen-webapp-debug` (RWI/CDP)
- SDK not installed → `tizen-sdk-install`
- .NET workload missing → `tizen-dotnet-setup`
- App not built/installed → `tizen-build-project` (Debug) then `tizen-install-app`
- No device/emulator → `tizen-device-manager`
- Native (C/C++) app → `tizen-gdb-debug`
