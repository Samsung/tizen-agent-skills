---
name: tizen-ecp
description: Tizen ECP, Emulator Control Panel, ecp-cli, emulator control, battery, 에뮬레이터 제어, 배터리, emulator battery, set battery level, list devices for a platform version, what devices are available, 지원 기기 목록, emulator commands. Runs ONE Emulator Control Panel request against a RUNNING emulator through the shipped CLI runner (ecp-cli.js) — `ecp-cli --version <V> --profile <P> help` lists the devices a platform version supports; `ecp-cli [--target <vm|serial>] battery [cmds]` and the other device commands control the running emulator. At least one emulator MUST be running — with none up the runner fails and points at tizen-launch-emulator. Create/list/delete VMs → tizen-create-emulator; launch/boot a VM → tizen-launch-emulator; stop VMs → tizen-device-manager; sdb commands → tizen-sdb-helper; device logs → tizen-dlog-analyzer.
metadata:
  author: Samsung Electronics
  last-updated: "2026-11-23"
  keywords:
    - ECP
    - Emulator Control Panel
    - ecp-cli
    - emulator battery
    - 에뮬레이터 제어
    - 배터리
    - list devices
    - 지원 기기
    - emulator commands
---

# Tizen ECP (Emulator Control Panel)

## The one rule

**✅ ALWAYS run the shipped CLI runner `ecp-cli.js` with the user's request — NEVER
hand-construct `ecp-cli` commands, run `<TIZEN_SDK_PATH>/tools/emulator/bin/ecp-cli`
yourself, read `<TIZEN_SDK_PATH>/tools` yourself, or parse `sdb devices` output.**
The runner locates ecp-cli inside the configured SDK, verifies that an emulator is
running, picks the target, matches the intent, runs the command, and prints a
Standard JSON Envelope. The raw ecp-cli binary is a native executable — never
prefix it with `node`.

## Scope

In scope: ONE Emulator Control Panel request per call —

- **List the devices a platform version supports** — "what devices are available
  for version 9.0, profile tv" → `ecp-cli --version <VERSION> --profile <PROFILE> help`.
  Both a version and a profile are required; the runner asks for the missing one.
- **List the commands** — "help", "what commands are available" → `ecp-cli help`
  (with `--target <t>`: the commands THAT device supports).
- **Device commands** — `battery` and every other command ecp-cli's own `help`
  lists (e.g. "battery status", "set the battery level to 50"). Unknown command
  words are passed through verbatim after `--target`; ecp-cli rejects what it
  does not know and the failure envelope carries its output.

Out of scope (relay and use that skill):

| Request | Skill |
| --- | --- |
| Create / list / delete an emulator VM ("create an emulator", "list emulators") | `tizen-create-emulator` |
| Launch / boot an existing VM ("start the emulator") | `tizen-launch-emulator` |
| Stop / shut down running VMs, find a connected device | `tizen-device-manager` |
| Any sdb command (shell, port forward, reboot, root) | `tizen-sdb-helper` |
| Device logs, crash/symptom analysis | `tizen-dlog-analyzer` |
| Push / pull files | `tizen-file-transfer` |

**ECP commands control a RUNNING emulator.** With no emulator up, the runner
returns a `device_not_found` failure envelope whose `suggested_fix` points at
`tizen-launch-emulator` — launch one first, then retry.

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-ecp` agent via the Agent tool (personal deployment or `tizen-sdk-skills:tizen-ecp`)
2. Pass the user's request **as-is** as the prompt (the runner does the intent matching)
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary under it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/ecp-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o

# One request = one ECP action. Pass the user's ask through as-is:
node "$CLI" --request "what devices are available for version 9.0, profile tv"
node "$CLI" --request "help"
node "$CLI" --request "battery status"
node "$CLI" --request "battery level 50" --target emulator-26101
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\ecp-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" --request "battery status"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*ecp-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*ecp-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*ecp-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*ecp-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" --request "<the user's ask, verbatim>" [--target <vm|serial>] [--version <VERSION>] [--profile <PROFILE>]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/ecp-cli.js`.)

- `--request <text>` (required) — the user's ask in natural language; the runner matches the intent and extracts the values (version, profile, battery arguments, command word).
- `--target <t>` (optional) — VM name or `emulator-<port>` serial; omit to use the running emulator.
- `--version <VERSION>` / `--profile <PROFILE>` (optional) — explicit values for the device-list intent; the runner also extracts them from `--request`.

Exit code: `0` = success envelope, `1` = failure/error envelope.

## What the runner does for you

1. **Intent matching** — maps the request to one intent (see the table below).
2. **ecp-cli resolution** — finds `{TIZEN_SDK_PATH}/tools/emulator/bin/ecp-cli`
   (`.bat` / `.cmd` / `.exe` on Windows) from the configured SDK path.
3. **Running-emulator check** — `sdb devices` must show at least one online
   `emulator-*` serial; otherwise a failure envelope points at
   `tizen-launch-emulator`.
4. **Target resolution** — `--target` > a serial/VM name in the request text >
   the running emulator. A target that is not a running emulator fails with the
   list of running serials.
5. **Standard JSON Envelope** — `intent`, `command_line`, `target`, `output`.

## Intent reference (what the runner runs — NOT commands for you to type)

| Request example | Intent | ecp-cli invocation |
| --- | --- | --- |
| "what devices are available for version 9.0, profile tv" | `list-devices` | `ecp-cli --version 9.0 --profile tv help` |
| "help" / "what commands are available" | `help` | `ecp-cli help` (add `--target` → that device's commands) |
| "battery status" / "set the battery level to 50" | `battery` | `ecp-cli [--target <t>] battery [args]` |
| any other device command ecp-cli's help lists | `command` | `ecp-cli [--target <t>] <args>` — passed through verbatim |

A device-list request missing the version or the profile fails with
`TIZEN_SDK_ECP_E008` asking for both — ask the user, then re-run.

## Envelope shapes

Success (`exit 0`):

```json
{
  "command": "tizen-sdk ecp",
  "status": "success",
  "result": {
    "intent": "battery",
    "ecp_cli": "/opt/tizen-studio/tools/emulator/bin/ecp-cli",
    "command_line": "ecp-cli --target emulator-26101 battery status",
    "target": "emulator-26101",
    "version": null,
    "profile": null,
    "output": "Battery level: 50\nCharger: disconnected"
  }
}
```

Failure — no running emulator (`exit 1`):

```json
{
  "command": "tizen-sdk ecp",
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_ECP_E004",
      "error_category": "device_not_found",
      "message": "No running emulator found. ECP commands control a RUNNING emulator — launch one first with the tizen-launch-emulator skill.",
      "suggested_fix": {
        "command": "node <plugin>/lib/cli/emulator-manager-cli.js list-vm --detail",
        "auto_fixable": false
      }
    }
  ]
}
```

Other failure codes: `E001` SDK path not configured (→ `tizen-sdk-init`), `E002`
ecp-cli not found (→ `tizen-download-emulator-package`), `E007` unknown target,
`E008` missing version/profile, `E009` ecp-cli itself failed (`details` carries
its output).

## Result reporting — always show the envelope to the user

The runner's stdout JSON Envelope is **inside the tool result, so the user cannot
see it** (the Claude Code UI folds Bash/Agent results away as "Ran 1 shell
command"). What the user sees is only the final answer text, so the final answer
must follow the format below **no matter which execution path was used
(subagent delegation or direct CLI Runner run)**:

1. Put the Envelope JSON **verbatim, without modification or truncation** in a fenced `json` block (first item).
2. Below it, append a **1–2 line** summary of the result (the key values of `result.output`, or the gist of `errors[0].message`).
3. If needed, add one line suggesting next steps (e.g. `tizen-launch-emulator` when no emulator was running).

- If the runner was run multiple times, include the Envelope from the **last run**, and mention earlier failures in at most one line in the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`; show what is inside the JSON as-is.

## Anti-patterns

- Do NOT run `<SDK>/tools/emulator/bin/ecp-cli` (or `ecp-cli.bat`) yourself, and do NOT prefix a native binary with `node` — only `ecp-cli.js` runs with `node`.
- Do NOT call the runner when no emulator is running "to see what happens" — the envelope will only tell you what this page already says; launch one with `tizen-launch-emulator` first (VM creation is `tizen-create-emulator`).
- Do NOT hand-assemble `--version`/`--profile` invocations for the device list — pass the user's words as `--request` and let the runner extract them; supply `--version`/`--profile` only when the user named them explicitly.
- Do NOT parse `sdb devices` to find the target — the runner does it.
- Do NOT retry a failed command in a loop; surface the error envelope verbatim.
- Do NOT use ECP to stop/reboot the emulator — that is `tizen-device-manager` (+ `tizen-launch-emulator` to cold start; a guest `reboot` crashes WHPX VMs).

## Handoff

- **Single-task** (e.g. "배터리 50으로 설정해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g. "에뮬레이터 켜고 배터리 확인해줘") → continue to the next step.
- No running emulator → `tizen-launch-emulator` (create one first with `tizen-create-emulator`)
- SDK not installed → `tizen-sdk-install`; SDK path unknown → `tizen-sdk-init`
- sdb-level device control → `tizen-sdb-helper`; logs → `tizen-dlog-analyzer`

**Suggested next steps (only when user asks):**

- `tizen-install-app` (install an app on the emulator)
- `tizen-screenshot` (capture the emulator screen)
- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`