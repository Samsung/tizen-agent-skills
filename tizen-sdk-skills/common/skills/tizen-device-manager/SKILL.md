---
name: tizen-device-manager
description: 'Tizen device manager, 타이젠 디바이스 관리, 디바이스 연결, 에뮬레이터 종료, sdb devices, emulator stop, 디바이스 찾기, 에뮬레이터 중지, TV 에뮬레이터, 타이젠 TV 에뮬레이터, Samsung TV emulator, TV emulator, TV 에뮬. Use this skill ONLY to find connected Tizen devices via sdb (one device, or ALL of them with `list` — "show all connected devices", "연결된 디바이스 전체 목록") or to stop/shut down running emulator VMs. NOT for problem reports — a crash, error, freeze, high CPU usage, memory growth, video/audio not playing, slow emulator, or any "investigate / analyze this issue" request belongs to tizen-dlog-analyzer even when the sentence mentions the emulator or device (its runner detects the device itself). For creating an emulator VM — and for LISTING the existing / available emulator VMs ("list emulators", "에뮬레이터 목록": `list-vm`) — use tizen-create-emulator. For launching an existing emulator VM, use tizen-launch-emulator. Supports both standard Tizen and Samsung TV emulator profiles.'


metadata:
  author: Samsung Electronics
  last-updated: "2026-09-30"
  keywords:
    - Tizen device manager
    - sdb devices
    - tizen emulator
    - em-cli
    - 타이젠 디바이스
    - emulator launch
    - 디바이스 연결
    - 연결된 디바이스 목록
    - list connected devices
    - TV 에뮬레이터
    - Samsung TV emulator
    - TV emulator
---

## Not this skill: problem reports go to `tizen-dlog-analyzer`

This skill answers exactly two questions — *"which Tizen devices are connected?"* and *"stop the running emulators"*. It has no way to analyze anything. A request such as

> "While running a video in com.samsung.fh.youtube in the Tizen emulator the host CPU went to 300% and the video is not playing. Investigate."

mentions the emulator but is a **symptom investigation**: route it to `tizen-dlog-analyzer` (it runs `investigate --symptoms "…"`, `start-monitoring`, `dlog-collect <app-id>`, `kernel collect`, then asks the user to reproduce and analyzes). The same goes for crashes, errors, freezes, memory growth, slow or laggy emulators, black screens, "something is wrong", "why does … not work", 원인 분석/조사해줘. The dlog-analyzer runner detects the device on its own and returns `device_not_found` / `multiple_devices` when that is the actual problem — do not run this skill "first, to find the device" before delegating. (A PreToolUse hook denies delegating such prompts to this skill/agent.)

### Claude Code (subagent delegation)

> If you have no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-device-manager` agent with the Agent tool (personal deployment or `tizen-sdk-skills:tizen-device-manager`)
2. Pass the user's request as the prompt
3. Pass the subagent's JSON envelope to the user as-is — follow the "Result reporting" rules below
   (include the verbatim text in a fenced `json` block, with only a 1–2 line summary below it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/device-manager-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\device-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*device-manager-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

### Codex CLI — long waits as a job (one exec call waits ≤ 30 s)

Detecting an already-connected device takes seconds, but a `timeoutSec` wait for a device that is
still booting (default 300) or a stop sequence (several `sleep 2` retries) can pass Codex's 30 s
per tool call, after which only the runner's header comes back (issue #48). For those add
**`--background`** and poll `node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s
per call) until `job.state` is `done` — that response **is** this runner's envelope.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb needs a localhost TCP socket (port 26099) and em-cli writes under `<sdk>-data`, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

```
node "$CLI" [start] [timeoutSec] [vmName] [profile]
node "$CLI" stop
node "$CLI" list
node "$CLI" --action start|stop|list [timeoutSec] [vmName] [profile]
```

0. **action** (`start` | `stop` | `list`, default `start`) — `start` finds a connected device and returns ONE serial; `list` returns EVERY device `sdb devices` reports (serial, state, type) without waiting; `stop` shuts down all running emulator VMs. Give it as the first bare word (`list`, `stop`) or as `--action list` (same spelling as `tizen-cli tizen-sdk device-manager --action list`).
1. **timeoutSec** (1–540, default 300) — emulator connection wait time in seconds (start action only)
2. **vmName** (default `tizen-vm-default`) — emulator VM name to look for (start action only)
3. **profile** (`tizen` | `tv`, default `tizen`) — emulator profile: `tizen` (standard) or `tv` (Samsung TV; requires TV SDK extension) (start action only)

Example (start, default Tizen): `node "$CLI" 300 my-tizen-vm`
Example (start, TV emulator): `node "$CLI" 300 tizen-tv-vm tv`
Example (stop): `node "$CLI" stop` (or `node "$CLI" --action stop`)
Example (list all): `node "$CLI" list` — "show all connected devices", "sdb devices 목록", "연결된 디바이스 전체 목록"

`list` result: `result.devices[]` = `{ serial, state, device_type }` (`state`: `device` / `offline` / `locked` / `unauthorized`, or another sdb state such as `no permissions` / `unknown` / `host`; a line it does not recognise becomes a warning; `device_type`: `emulator` / `usb` / `remote`), plus `device_count` and `online_count`. Zero devices is still a success envelope (with a warning pointing to `tizen-create-emulator` / `tizen-launch-emulator`).

Exit code: `0` = success envelope (with `result.device_serial` for start, `result.devices` for list, `result.emulators_stopped` for stop), `1` = failure/error envelope.

> **Important:** The `start` action **only finds connected devices** via sdb. It does **not** create or launch emulators. If no device is found, the envelope returns `device_not_found` and directs the user to `tizen-create-emulator` (to create a VM) and `tizen-launch-emulator` (to launch a VM). This removes the ambiguity between device-manager, create-emulator, and launch-emulator.

## Scope: device-manager vs launch-emulator vs create-emulator

| Task | Use this skill (`tizen-device-manager`) | Use `tizen-launch-emulator` | Use `tizen-create-emulator` |
|------|:---:|:---:|:---:|
| Find connected device via sdb | ✅ | | |
| Launch an **existing** emulator VM by name | | ✅ | |
| Launch the **first available** VM (no name) | | ✅ | |
| Create an emulator VM (default or custom) | | | ✅ |
| Create a **custom** emulator VM with specific platform | | | ✅ |
| Create a VM with a specific template | | | ✅ |
| Stop/shut down running emulator VMs | ✅ | | |
| **Restart / reboot** an emulator VM (`stop` here, then launch) | ✅ step 1 | ✅ step 2 | |
| List available platforms/templates | | | ✅ |
| List existing VMs | | | ✅ |
| Delete a VM | | | ✅ |

> **Rule of thumb:**
> - If the user wants to **create** an emulator VM → use `tizen-create-emulator`.
> - If the user wants to **launch/start/boot** an emulator VM → use `tizen-launch-emulator`.
> - If the user wants to **create AND launch** an emulator → use `tizen-create-emulator` with `--launch` (or `launch=true`), or run `tizen-create-emulator` then `tizen-launch-emulator`.
> - If the user just needs **any connected device** (e.g. for build, install, debug) → use `tizen-device-manager` (it finds connected devices via sdb; if none, it suggests creating+launching an emulator via the dedicated skills).
> - If the user wants to **stop/shut down** emulators → use `tizen-device-manager` with the `stop` action (`node "$CLI" stop`, or `--action stop` via tizen-cli).
> - If the user wants to **restart / reboot** an emulator (or `tizen-sdb-helper` handed off an `emulator-restart` intent) → run the `stop` action here, then `tizen-launch-emulator` for the same VM. **Never** answer this with a guest `sdb shell reboot`: on Windows the emulator runs under WHPX and the vCPU reset kills the QEMU process (`WHPX: Unexpected VP exit code 4 / Failed to emulate MMIO access`) — the VM window dies and sdb never sees the device again.
> - If the user reports a **problem** (crash, error, freeze, high CPU, video not playing, "investigate") — even one that mentions the emulator → use `tizen-dlog-analyzer`, never this skill.


### TV Emulator

When `profile=tv` is specified, the device-manager looks for a connected TV emulator via sdb. If no TV emulator is connected, it returns a `device_not_found` envelope directing the user to:

1. **`tizen-create-emulator`** with `--profile tv` — to create a TV emulator VM
2. **`tizen-launch-emulator`** — to launch the TV emulator VM

**Prerequisite:** TV SDK extension must be installed. Use `tizen-tv-sdk-install` skill first.

## Result reporting — the envelope MUST be shown to the user

The runner's stdout JSON envelope lives **inside the tool result, so the user never sees it**
(the Claude Code UI collapses Bash/Agent results into something like "Ran 1 shell command"). The
user only sees the final answer text, so the final answer must follow the format below on
**either execution path (subagent delegation / direct CLI Runner execution)**:

1. Include the envelope JSON **verbatim, unmodified and unabridged** in a fenced `json` block (as the first item).
2. Below it, add a result summary of **one or two lines** (the key value in `result`, or the gist of `errors[0].message`).
3. If useful, add one line suggesting next steps.

- Expanding the envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general authoring rules ("don't put code in prose", etc.) —
  the envelope is not code; it is this skill's **result contract**.
- If you ran the runner more than once, include the envelope from the **last run** and mention earlier
  failures only in one line of the summary.
- Include a failure envelope verbatim as well. Do not retype `errors[0].message`/`details` —
  show what is inside the JSON as-is.
- Show a `user_input_required` envelope as-is, then ask the user the question.

## Handoff

- **Single-task** (e.g., "디바이스 찾아줘", "에뮬레이터 종료해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "에뮬 켜고 앱 설치해줘") → Continue to next step.
- **Emulator restart** ("에뮬레이터 재시작해줘", `emulator-restart` handoff from `tizen-sdb-helper`) → `stop` here, then `tizen-launch-emulator` — not a guest reboot (WHPX crash, see the rule of thumb above).
- **Problem report / investigation** (crash, error, freeze, CPU, playback …) → `tizen-dlog-analyzer` — this skill is not a step of that flow.
- SDK not installed → `tizen-sdk-install`

**Routing when no device is connected:**

When `tizen-device-manager` finds no connected device via sdb, it does **not** create or launch an emulator itself. Instead, it returns a `device_not_found` envelope and directs the user to:

1. **`tizen-create-emulator`** — to create an emulator VM (if one doesn't exist yet).
2. **`tizen-launch-emulator`** — to launch an existing emulator VM.

This ensures there is no ambiguity: device-manager handles **device discovery** and **emulator stop** only; creation and launching are handled by their dedicated skills.

**Suggested next steps (only when user asks):**

- `tizen-create-emulator` (create an emulator VM)
- `tizen-launch-emulator` (launch an existing emulator VM)
- `tizen-build-project` (build project)
- `tizen-create-project` (create new project)
- `tizen-install-app` (install app)
- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
