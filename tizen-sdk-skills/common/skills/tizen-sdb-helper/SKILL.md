---
name: tizen-sdb-helper
description: Tizen sdb helper, sdb command, sdb helper, sdb shell, run shell command on the device, run a command on the device, 쉘 명령 실행, 디바이스에서 명령 실행, tail the logs, show logs, dlog, 로그 보기, open a shell, shell command, whoami, forward port, port forward, port forwarding, 포트 포워딩, forward port 8080, reboot device, reboot the device, 디바이스 재부팅, 재부팅, shutdown device, 디바이스 종료, factory reset, root on, sendkey, kill app, 앱 종료, launch app, 앱 실행, list running apps, list installed packages, package info, device capability, clear logs, dlog clear, disk space check, df /opt, clean-crash-dumps, crash dump cleanup, install-and-launch, reinstall-and-launch, kill-and-relaunch. Runs ONE sdb action on a connected Tizen device through the shipped CLI runner (sdb-helper-cli.js) — shell command, port forward, reboot/shutdown, logs, launch/kill, root toggle, sendkey, disk triage — with device auto-selection, command preview, and confirmation gates on destructive actions. For ANY request that would be answered with an sdb command, ROUTE HERE FIRST and run the runner — do NOT locate the sdb binary, parse `sdb devices`, or type `sdb ...` yourself; the runner does all of that and returns a JSON Envelope. Connect to an IP → tizen-remote-device; install/uninstall → tizen-install-app; push/pull → tizen-file-transfer; screenshot → tizen-screenshot; list devices → tizen-device-manager.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - sdb
    - sdb command
    - sdb shell
    - shell command
    - port forward
    - reboot device
    - tail logs
    - dlog
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

In scope: one sdb action per request — run a shell command, tail/save/clear logs, whoami,
forward/list/remove a port, launch/kill an app, list running apps or installed packages,
package info, device capability, root on, reboot/shutdown/factory reset, sendkey, disk triage
(`df -h /opt`).

Out of scope (the runner returns a **handoff** envelope; relay it and use that skill):

| Request | Skill |
| --- | --- |
| Connect / disconnect a device over the network (`connect to 192.168.1.100`) | `tizen-remote-device` |
| List / find connected devices, create or launch an emulator | `tizen-device-manager`, `tizen-create-emulator`, `tizen-launch-emulator` |
| Install / uninstall a package | `tizen-install-app` |
| Push / pull files | `tizen-file-transfer` |
| Screenshot | `tizen-screenshot` |
| Debugger port forwarding (gdb / netcoredbg) | `tizen-gdb-debug`, `tizen-dotnet-debug` |
| Crash / error analysis | `tizen-dlog-analyzer` |

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-sdb-helper` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-sdb-helper`)
2. 사용자의 요청을 **그대로** 프롬프트로 전달 (의도 매칭은 러너가 한다)
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdb-helper-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdb-helper-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" --request "run shell command ls -la"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/sdb-helper-cli.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" --request "<the user's ask, verbatim>" [--serial <serial>]
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdb-helper-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdb-helper-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done

# One request = one sdb action. Pass the user's ask through as-is:
node "$CLI" --request "run shell command ls -la"
node "$CLI" --request "forward port 8080"
node "$CLI" --request "reboot the device"
node "$CLI" --request "tail the logs"
node "$CLI" --request "launch app org.example.myapp" --serial emulator-26101
```

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
| Run a shell command (`run shell command ls -la`, `shell df -h /opt`) | `shell-command` | `sdb -s <S> shell "<cmd>"` | no — destructive text (`rm `, `dd `, `mkfs`, `reboot`, …) is previewed; confirm before re-running |
| Shell user / whoami / "open a shell" | `whoami` / `shell-interactive` | `sdb -s <S> shell whoami` (agents have no TTY — a bare `sdb shell` would hang) | no |
| Tail / show logs | `log-stream` | `sdb -s <S> dlog -d -v threadtime` (buffer dump) | no |
| Save / export logs | `log-save` | dlog dump redirected to a host file | no |
| Clear / flush logs | `log-clear` | `sdb -s <S> dlog -c` | **yes** |
| Forward port (`forward port 8080`) | `forward-add` | `sdb -s <S> forward tcp:<host> tcp:<device>` | no |
| List forwards | `forward-list` | `sdb -s <S> forward --list` | no |
| Remove forward | `forward-remove` | `sdb -s <S> forward --remove tcp:<host>` | **yes** |
| Launch app | `launch` | `sdb -s <S> shell app_launcher -s <appid>` (legacy TV fallback `0 was_execute`) | no |
| Kill / stop app | `kill` | `sdb -s <S> shell app_launcher -k <appid>` | **yes** |
| List running apps | `list-running` | `sdb -s <S> shell app_launcher -S` | no |
| List installed packages | `list-packages` | `sdb -s <S> shell pkgcmd -l` | no |
| Package info | `package-info` | `sdb -s <S> shell pkginfo --pkg <pkgid>` | no |
| Device capability / detailed info | `device-info` | `sdb -s <S> capability` | no |
| Root on | `root-on` | `sdb -s <S> root on` | **yes** |
| Reboot | `reboot` | `sdb -s <S> shell reboot` | **yes** |
| Shutdown / power off | `shutdown` | `sdb -s <S> shell shutdown -P now` | **yes** |
| Factory reset | `factory-reset` | `sdb -s <S> shell factoryreset` | **yes** — refuse without explicit, named confirmation |
| Send key event | `sendkey` | `sdb -s <S> shell sendkey <KEY>` | no (`KEY_POWER` gated) |
| Connect / disconnect over network | → handoff | — | use `tizen-remote-device` |
| Install / uninstall | → handoff | — | use `tizen-install-app` |
| List devices | → handoff | — | use `tizen-device-manager` |
| Screenshot | → handoff | — | use `tizen-screenshot` |

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
| `invalid_parameters` "Could not find …" (app id / port / key / command) | Missing value | Ask the user for it, re-run the runner with it in `--request`. |
| `device_not_found` | No device | `tizen-device-manager` (or `tizen-create-emulator` + `tizen-launch-emulator`), then retry once. |
| `multiple_devices` | 2+ devices | Ask which serial, re-run with `--serial`. |
| `sdk_path_not_set` | SDK path missing | `tizen-sdk-init`. |
| `io_error` mentioning sdb not found | SDK not installed | `tizen-sdk-install`. |
| `io_error` "Remote shell command exited with code N" | Device command failed | Relay `errors[0].message` verbatim (keep sdb error codes such as `WGT_CRT_ERR` intact). |

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result.output`의 핵심 값 또는 `errors[0].message` 요지).
3. `result.gated: true`이면 실행하지 않았음을 밝히고 `result.command`를 보여준 뒤 확인을 요청한다.
4. `result.handoff`가 있으면 해당 스킬로 넘긴다고 한 줄 적는다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.

## Anti-patterns

- Do NOT search for sdb (`which`/`where`/`Get-Command`/`find -name sdb`/`command -v sdb`) or read `<TIZEN_SDK_PATH>/tools` — the runner resolves it. A PreToolUse hook denies these.
- Do NOT run `sdb devices` and parse it — the runner selects the device; for a device list use `tizen-device-manager`.
- Do NOT type `sdb -s <serial> shell …`, `sdb forward …`, `sdb shell reboot` from memory. Run the runner; only a **confirmed gated** `result.command` may be executed verbatim.
- Do NOT run `sdb connect <ip>` — hand off to `tizen-remote-device`.
- Do NOT chain intents the user did not ask for ("usually go together"). One request, one intent; a named recipe (`install-and-launch`, `reinstall-and-launch`, `kill-and-relaunch`, `clean-crash-dumps`) is run one intent at a time through the runner, confirming each gated step.
- Do NOT run bare `sdb shell` (no command) — no TTY, hangs forever.
- Do NOT run `sdb kill-server` to "reset" the connection.
- Do NOT retry a failed command in a loop; surface the error verbatim.
- Do NOT prefix native binaries with `node` — `node sdb.exe` is a `SyntaxError`. Only `sdb-helper-cli.js` runs with `node`.

## Handoff

- **Single-task** (e.g. "reboot the device") → DONE after the envelope. Suggest next steps; do not auto-proceed.
- **Multi-step** (e.g. "reinstall and launch the app") → continue one intent at a time, confirming each gated step.
- Connect over network → `tizen-remote-device` · Install/uninstall → `tizen-install-app` · Push/pull → `tizen-file-transfer` · Screenshot → `tizen-screenshot` · Device list / emulator → `tizen-device-manager` · Debugger forwarding → `tizen-gdb-debug` / `tizen-dotnet-debug` · Crash analysis → `tizen-dlog-analyzer` · SDK not installed → `tizen-sdk-install` · SDK path → `tizen-sdk-init`
