---
name: tizen-sdb-helper
description: Tizen sdb helper, sdb command, sdb shell, run shell command on the device, 쉘 명령 실행, whoami, forward port, port forwarding, 포트 포워딩, reboot device, 디바이스 재부팅, shutdown device, 디바이스 종료, factory reset, root on, sendkey, kill app, 앱 종료, launch installed app by app id, uninstall app, 앱 제거, 패키지 제거, list running apps, list installed packages, package info, device capability, disk space df /opt. Runs ONE sdb action on a connected Tizen device through the shipped CLI runner (sdb-helper-cli.js) with device auto-selection, command preview and confirmation gates on destructive actions (uninstall, kill, reboot, root, factory reset). For ANY request answered by an sdb command, ROUTE HERE FIRST — never locate sdb, parse `sdb devices`, or type `sdb ...` yourself. Install/run a package → tizen-install-app; connect to an IP → tizen-remote-device; push/pull → tizen-file-transfer; screenshot → tizen-screenshot; list devices → tizen-device-manager; logs of ANY kind (dlog, 로그 보기/지우기) → tizen-dlog-analyzer.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-18"
  keywords:
    - sdb
    - sdb command
    - sdb shell
    - shell command
    - port forward
    - reboot device
    - sdb root
    - 쉘 명령
    - 포트 포워딩
    - 재부팅
---

# Tizen sdb Helper

## The one rule

**✅ ALWAYS run the shipped CLI runner `sdb-helper-cli.js` with the user's request — NEVER
hand-construct `sdb` commands, search for the sdb binary (`which sdb`, `where sdb`,
`Get-Command sdb`, `find … -name sdb`, `command -v sdb`), read `<TIZEN_SDK_PATH>/tools` yourself,
or parse `sdb devices` output.** The runner locates sdb inside the SDK, starts the daemon if
needed, picks the device, matches the intent, applies the confirmation gate, runs the command,
and prints a Standard JSON Envelope. Reimplementing any of that by hand is how the fragile
one-liners and shell-quoting bugs in issue #96 crept in.

The **only** `sdb` line you may type directly is a **gated command the user has explicitly
confirmed**, copied verbatim from `result.command` (see "Gated commands" below).

## Scope

In scope: one sdb action per request — run a shell command, whoami,
forward/list/remove a port, launch/kill an app, list running apps or installed packages,
package info, device capability, root on, reboot/shutdown/factory reset, sendkey, disk triage
(`df -h /opt`).

Out of scope (the runner returns a **handoff** envelope; relay it and use that skill):

| Request | Skill |
| --- | --- |
| Connect / disconnect a device over the network (`connect to 192.168.1.100`) | `tizen-remote-device` |
| List / find connected devices, create or launch an emulator | `tizen-device-manager`, `tizen-create-emulator`, `tizen-launch-emulator` |
| **Restart / reboot the emulator** (`reboot the emulator`, `restart the emulator`) — never a guest `reboot`: on Windows (WHPX) the vCPU reset crashes the QEMU VM (`WHPX: Unexpected VP exit code 4`) | `tizen-device-manager` (stop the VM) → `tizen-launch-emulator` (cold start) |
| Install a package (uninstall is handled here — `uninstall <pkgid>`, gated) | `tizen-install-app` |
| Push / pull files | `tizen-file-transfer` |
| Screenshot | `tizen-screenshot` |
| Debugger port forwarding (gdb / netcoredbg) | `tizen-gdb-debug`, `tizen-dotnet-debug` |
| **Device logs — tail / show / save / clear (`dlog`, 로그)**, **kernel log (`dmesg`, `kmsg`)** — and crash / error / symptom analysis (high CPU, freeze, video not playing …) | `tizen-dlog-analyzer` (`log-dump`, `log-clear`, `start start-monitoring`, `kernel collect`, `investigate`, `probe run`, …) |

The handoff envelope for a log intent carries a `result.note` naming the dlog-analyzer action to
run (`log-dump` for a one-shot view/save, `log-clear --confirm` for clearing, `start …` for
continuous monitoring, `kernel collect` → `kernel stop` → `kernel analyze` for the kernel log). Relay
it; never fall back to `sdb dlog` or `sdb shell dmesg`. Likewise, a "shell top / ps / free /
cat /proc/meminfo" request that is really part of investigating a symptom is not this skill's job —
those measurements are `tizen-dlog-analyzer`'s `investigate --symptoms "…"` / `probe run <id>`.

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-sdb-helper` agent via the Agent tool (personal deployment or `tizen-sdk-skills:tizen-sdb-helper`)
2. Pass the user's request **as-is** as the prompt (the runner does the intent matching)
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary under it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdb-helper-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o

# One request = one sdb action. Pass the user's ask through as-is:
node "$CLI" --request "run shell command ls -la"
node "$CLI" --request "forward port 8080"
node "$CLI" --request "reboot the device"
node "$CLI" --request "list running apps"
node "$CLI" --request "launch app org.example.myapp" --serial emulator-26101
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdb-helper-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" --request "run shell command ls -la"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" --request "<the user's ask, verbatim>" [--serial <serial>]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/sdb-helper-cli.js`.)

- `--request <text>` (required) — the user's ask in natural language; the runner matches the intent and extracts values (shell command, port, app id, key name).
- `--serial <serial>` (optional) — device serial; omit to auto-select the single connected device.

Exit code: `0` = success envelope (executed, gated, or handoff), `1` = failure/error envelope.

### Codex CLI

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: every sdb command needs a localhost TCP socket (port 26099), and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## What the runner does for you

1. **Intent matching** — maps the request to one intent (see the table below).
2. **sdb resolution** — finds `<sdk>/tools/sdb` (`sdb.exe` on Windows) from the configured SDK path; starts the daemon once if needed.
3. **Device selection** — auto-selects the single connected device; `device_not_found` / `multiple_devices` otherwise.
4. **Value extraction** — shell command text, app id, port, key name from the request.
5. **Confirmation gates** — destructive intents are **not executed**; the envelope carries `result.gated: true` and the exact `result.command` for the user to confirm.
6. **Handoff routing** — out-of-scope intents return `result.handoff` + `result.suggested_skill`.
7. **Standard JSON Envelope** — `intent`, `command`, `device_serial`, `output` (or `gated` / `handoff`).

## Intent reference (what the runner runs — NOT commands for you to type)

| User asks for | Intent | Runner emits | Gated |
| --- | --- | --- | --- |
| Run a shell command (`run shell command ls -la`, `shell df -h /opt`; a leading/trailing device clause such as `on emulator-26101` / `on the device` and a `please` are stripped, never passed as arguments) | `shell-command` | `sdb -s <S> shell "<cmd>"` | no — destructive text (`rm `, `dd `, `mkfs`, `reboot`, …) is previewed; confirm before re-running |
| Shell user / whoami / "open a shell" | `whoami` / `shell-interactive` | `sdb -s <S> shell whoami` (agents have no TTY — a bare `sdb shell` would hang) | no |
| Forward port (`forward port 8080`) | `forward-add` | `sdb -s <S> forward tcp:<host> tcp:<device>` | no |
| List forwards | `forward-list` | `sdb -s <S> forward --list` | no |
| Remove forward | `forward-remove` | `sdb -s <S> forward --remove tcp:<host>` | **yes** |
| Launch app | `launch` | `sdb -s <S> shell app_launcher -s <appid>`; when that prints no `successfully launched` (Samsung TV images are silent for a non-root shell) the runner retries with the TV launcher `sdb -s <S> shell 0 was_execute <appid>` and accepts `app_id[<appid>] launched` / `resumed` | no |
| Kill / stop app | `kill` | `sdb -s <S> shell app_launcher -k <appid>` | **yes** |
| List running apps | `list-running` | `sdb -s <S> shell app_launcher -S` | no |
| List installed packages (`list installed packages`, `list packages installed`) | `list-packages` | `sdb -s <S> shell pkgcmd -l` | no |
| Package info (`package info org.tizen.x`, or the bare pkgid of a TPK/WGT: `package info dZEpxl2iAg`) | `package-info` | `sdb -s <S> shell pkginfo --pkg <pkgid>` | no — a bare id must look like one (a digit, mixed case, or `-`/`_`); a plain lowercase word or a device serial is refused with `invalid_parameters`, never spliced into the command |
| Device capability / detailed info | `device-info` | `sdb -s <S> capability` | no |
| Root on | `root-on` | `sdb -s <S> root on` | **yes** |
| Restart / reboot the **emulator** (`reboot the emulator`) | `emulator-restart` → handoff | — | use `tizen-device-manager` (stop) then `tizen-launch-emulator` (cold start); `result.note` explains why a guest reboot crashes the VM under WHPX |
| Reboot | `reboot` | `sdb -s <S> shell reboot` | **yes** — when the resolved serial is an emulator (`emulator-<port>`), `result.note` warns that a guest reboot crashes the VM on Windows (WHPX) and names the stop → launch path; show the note with the confirmation |
| Shutdown / power off | `shutdown` | `sdb -s <S> shell shutdown -P now` | **yes** — same emulator note as `reboot` |
| Factory reset | `factory-reset` | `sdb -s <S> shell factoryreset` | **yes** — refuse without explicit, named confirmation |
| Send key event | `sendkey` | `sdb -s <S> shell sendkey <KEY>` | no (`KEY_POWER` gated) |
| Connect / disconnect over network | → handoff | — | use `tizen-remote-device` |
| Install | → handoff | — | use `tizen-install-app` |
| Uninstall a package (`uninstall org.example.app`) | `uninstall` | `sdb -s <S> shell pkgcmd -u -n "<pkgid>"` | **yes** — `result.note` reminds that pkgcmd takes the PACKAGE id, not the app id |
| List devices | → handoff | — | use `tizen-device-manager` |
| Screenshot | → handoff | — | use `tizen-screenshot` |
| Logs — tail / show / save / clear (`dlog`) | `log-stream` / `log-save` / `log-clear` → handoff | — | use `tizen-dlog-analyzer` (`result.note` names the action: `log-dump`, `log-clear --confirm`, `start …`) |
| Kernel log (`dmesg`, `kmsg`, "kernel log") | `kernel-log` → handoff | — | use `tizen-dlog-analyzer` (`kernel collect` → `kernel stop` → `kernel analyze`) |

**Debug port forwarding** (a debugger is involved — gdb, netcoredbg) is NOT this skill: `tizen-gdb-debug` / `tizen-dotnet-debug` forward their own ports.

## Envelope shapes

Executed (read-only intent):
```json
{ "command": "tizen-sdk sdb-helper", "status": "success",
  "result": { "intent": "shell-command", "command": "sdb -s \"emulator-26101\" shell \"ls -la; echo __SDB_EXIT:$?\"",
              "device_serial": "emulator-26101", "output": "total 12\ndrwxr-xr-x ...", "gated": false } }
```

Gated (NOT executed — needs the user's confirmation):
```json
{ "command": "tizen-sdk sdb-helper", "status": "success",
  "result": { "intent": "reboot", "gated": true, "command": "sdb -s \"emulator-26101\" shell reboot",
              "device_serial": "emulator-26101",
              "message": "This is a gated action. Confirm before running: sdb -s \"emulator-26101\" shell reboot" } }
```

Handoff:
```json
{ "command": "tizen-sdk sdb-helper", "status": "success",
  "result": { "intent": "connect", "handoff": "tizen-remote-device",
              "message": "Intent \"connect\" is handled by the tizen-remote-device skill. Use that skill instead.",
              "suggested_skill": "tizen-remote-device" } }
```

## Gated commands — the only sdb line you may run yourself

1. Show the user `result.command` and `result.message`; ask for confirmation.
2. Only after an explicit "yes", run **that exact string** (same serial, same arguments) in the Bash tool — directly, not with `node`, not rewritten.
3. Never run a gated command pre-emptively, and never assemble a different one.

## Failure handling

| `error_category` | Meaning | Action |
| --- | --- | --- |
| `invalid_parameters` "Could not match request to any sdb intent" | Not an sdb intent | Ask the user to rephrase; list the intents above. Do not improvise an sdb command. |
| `result.handoff: tizen-dlog-analyzer` on a request that was not about logs (the log catch-all also matches the words `log`/`tail` in e.g. "forward port 8080 for the log server") | Mis-classified | Re-run with an explicit intent word first ("forward port 8080"), do not follow the handoff. |
| `invalid_parameters` "Could not find …" (app id / port / key / command) | Missing value | Ask the user for it, re-run the runner with it in `--request`. |
| `device_not_found` | No device | `tizen-device-manager` (or `tizen-create-emulator` + `tizen-launch-emulator`), then retry once. |
| `multiple_devices` | 2+ devices | Ask which serial, re-run with `--serial`. |
| `sdk_path_not_set` | SDK path missing | `tizen-sdk-init`. |
| `io_error` mentioning sdb not found | SDK not installed | `tizen-sdk-install`. |
| `io_error` on `launch` whose message names `tizen-dlog-analyzer` | The app did not launch | Report the failure and offer the log analysis without waiting to be asked; on agreement run `tizen-dlog-analyzer`'s startup flow from the message (`start start-monitoring` → `app-launch <app-id>` → user reproduces → `stop` → `check`). |
| `io_error` "Remote shell command exited with code N" | Device command failed | Relay `errors[0].message` verbatim (keep sdb error codes such as `WGT_CRT_ERR` intact). |

## Result reporting — always show the envelope to the user

The JSON Envelope on the runner's stdout sits inside a tool result, so the user cannot see it
(the Claude Code UI collapses Bash/Agent results as "Ran 1 shell command"). The user only sees
the final answer text, so on **either execution path (subagent delegation or direct CLI Runner
execution)** the final answer must follow the format below:

1. Include the Envelope JSON **as-is, unmodified and unabridged** in a fenced `json` block (first item).
2. Under it, add a summary of the result in **1–2 lines** (the key values of `result.output`, or the gist of `errors[0].message`).
3. If `result.gated` is `true`, state that you did not run it, show `result.command`, and ask for confirmation.
4. If there is a `result.handoff`, add one line saying you are passing it to that skill.

- Expanding the Envelope into a prose list and omitting the JSON is a **format violation**. This rule takes precedence over the harness's general authoring rules ("don't put code in prose", etc.) — the Envelope is not code; it is this skill's **result contract**.
- If you ran the runner multiple times, include the Envelope of the **last run** and mention earlier failures only in a single line of the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`; show what is inside the JSON as-is.

## Anti-patterns

- Do NOT search for sdb (`which`/`where`/`Get-Command`/`find -name sdb`/`command -v sdb`) or read `<TIZEN_SDK_PATH>/tools` — the runner resolves it. A PreToolUse hook denies these.
- Do NOT run `sdb devices` and parse it — the runner selects the device; for a device list use `tizen-device-manager`.
- Do NOT type `sdb -s <serial> shell …`, `sdb forward …`, `sdb shell reboot` from memory. Run the runner; only a **confirmed gated** `result.command` may be executed verbatim.
- Do NOT run `sdb connect <ip>` — hand off to `tizen-remote-device`.
- Do NOT run `sdb dlog …` (dump, save, or `-c`) — every device-log request belongs to `tizen-dlog-analyzer`; relay the handoff envelope and its `result.note`.
- Do NOT chain intents the user did not ask for ("usually go together"). One request, one intent; a named recipe (`install-and-launch`, `reinstall-and-launch`, `kill-and-relaunch`, `clean-crash-dumps`) is run one intent at a time through the runner, confirming each gated step.
- Do NOT restart an emulator with a guest `sdb shell reboot`. On Windows the emulator runs under WHPX and the vCPU reset kills the QEMU process (`WHPX: Unexpected VP exit code 4 / Failed to emulate MMIO access`) — the VM window dies and the device never reconnects. Stop the VM with `tizen-device-manager`, then cold-start it with `tizen-launch-emulator`. The runner hands "reboot the emulator" off for this reason and attaches a `result.note` to a gated `reboot`/`shutdown` whose serial is `emulator-<port>`; relay that note before asking for confirmation.
- Do NOT run bare `sdb shell` (no command) — no TTY, hangs forever.
- Do NOT run `sdb kill-server` to "reset" the connection.
- Do NOT retry a failed command in a loop; surface the error verbatim.
- Do NOT prefix native binaries with `node` — `node sdb.exe` is a `SyntaxError`. Only `sdb-helper-cli.js` runs with `node`.

## Handoff

- **Single-task** (e.g. "reboot the device") → DONE after the envelope. Suggest next steps; do not auto-proceed.
- **Multi-step** (e.g. "reinstall and launch the app") → continue one intent at a time, confirming each gated step.
- Connect over network → `tizen-remote-device` · Install → `tizen-install-app` (uninstall is handled here) · Push/pull → `tizen-file-transfer` · Screenshot → `tizen-screenshot` · Device list / emulator → `tizen-device-manager` · Debugger forwarding → `tizen-gdb-debug` / `tizen-dotnet-debug` · Logs (view/save/clear) & crash analysis → `tizen-dlog-analyzer` · SDK not installed → `tizen-sdk-install` · SDK path → `tizen-sdk-init`
