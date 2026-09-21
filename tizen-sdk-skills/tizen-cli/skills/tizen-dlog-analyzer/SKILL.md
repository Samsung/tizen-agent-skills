---
name: tizen-dlog-analyzer
description: Tizen dlog analyzer, dlog analysis, show logs, show me the logs, tail the logs, view device logs, emulator logs, device log, 로그 보기, 로그 보여줘, 로그 확인, 로그 수집, save logs, export logs, 로그 저장, clear logs, dlog clear, flush logs, 로그 지우기, 로그 삭제, dlog, log monitoring, exception detection, crash log analysis, log-dump, log-clear, dlog-collect, exception-detect, start-monitoring, app-launch, app-terminate, error-analyze, dlog-collect --app-id. The single owner of Tizen device/emulator logs — one-shot dlog buffer dump (log-dump, optional tag/priority filter, full dump saved to a file), buffer clear (log-clear, confirmation-gated), and AI-powered dlog analysis for root cause detection that continuously collects device logs, detects crashes/exceptions, and offers solutions. Requires a running emulator or connected device. This is the default entry point for ANY report of a Tizen crash, error, freeze, or unexpected behavior — even if the user never says the word "dlog" or "log" — AND for EVERY plain log request (show/tail/save/clear the logs) with no problem attached. Logs never go through sdb-helper or a hand-typed sdb dlog.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-17"
  keywords:
    - tizen dlog analyzer
    - dlog analysis
    - show logs
    - tail the logs
    - device log
    - 로그 보기
    - save logs
    - clear logs
    - dlog clear
    - 로그 지우기
    - log-dump
    - log-clear
    - exception detection
    - crash log analysis
    - log monitoring
    - dlog-collect
    - exception-detect
    - start-monitoring
    - app-launch
    - app-terminate
    - error-analyze
---

# Tizen DLog Analyzer

## When to use

The user reports any problem, crash, freeze, error, or unexpected behavior with a Tizen app or device, asks to monitor/investigate Tizen logs, wants root-cause analysis, wants app-specific log collection filtered by app ID, or wants runtime error analysis for a specific app. Route here first for "my app crashed", "something's wrong with my app", "why did it stop working", etc. — do not fall back to raw sdb/dlog commands.

**Also** route here when the user simply wants to see, tail, save/export, or clear the device or emulator logs with no problem reported ("show me the logs", "로그 보기", "save the dlog", "clear logs" / "dlog clear", "로그 지우기"). `sdb-helper` returns a handoff envelope for these (its `result.note` names the action); answer them with `--action log-dump` / `--action log-clear`.

## Command

```
tizen-cli tizen-sdk dlog-analyzer --action <log-dump|log-clear|start|stop|check|status|app-launch|app-terminate|dlog-collect|stop-collect|error-analyze> [--subcommand <start-monitoring|dlog-collect|exception-detect>] [--app-id <id>] [--format <summary|details>] [--serial <serial>] [--output-dir <path>] [--filter "<spec> ..."] [--lines <n>] [--output <file>] [--confirm]
```

| Option                    | Required | Default            | Description                                                                       |
| ------------------------- | -------- | ------------------ | --------------------------------------------------------------------------------- |
| `--action <action>`       | yes      | —                  | log-dump (one-shot dlog buffer dump — "show/tail/save the logs"), log-clear (clear the device dlog buffer — requires --confirm), start (launch monitoring), stop (kill background process), check (read output), status (check if running), app-launch (launch an app), app-terminate (terminate an app), dlog-collect (start background app-specific log collection), stop-collect (stop app-specific log collection), error-analyze (analyze app logs for E/F errors) |
| `--subcommand <subcommand>` | no     | `start-monitoring` | For --action start only: dlog-collect, exception-detect, or start-monitoring (recommended) |
| `--app-id <id>`           | no       | —                  | Tizen app ID (e.g., org.example.myapp). Required for app-launch, app-terminate, dlog-collect, and error-analyze |
| `--format <format>`       | no       | both               | For --action error-analyze only: summary (summary lines only), details (detail entries only), or omit for both |
| `--serial <serial>`       | no       | auto               | Target device serial (omit to auto-select the single connected device)           |
| `--output-dir <path>`     | no       | OS temp dir        | Directory for dlog output (continuous collection)                                 |
| `--filter <specs>`        | no       | everything         | For --action log-dump only: dlog filterspecs `<tag>[:<V\|D\|I\|W\|E\|F\|S>]`, space- or comma-separated — `"*:E"` (errors and fatals), `"E20:W CHROMIUM"` |
| `--lines <n>`             | no       | 200                | For --action log-dump only: trailing lines returned in the envelope (`0` = all). The complete dump always goes to the dump file |
| `--output <file>`         | no       | `<tmp>/tizen-dlog-analyzer/dlog-dump.log` | For --action log-dump only: host file that receives the complete dump |
| `--confirm`               | no       | false              | Required for log-clear; without it the action fails with `user_input_required` and does nothing |

## One-shot log actions (plain "show / save / clear the logs")

| Request | Command | Then |
| --- | --- | --- |
| Show / tail the logs | `tizen-cli tizen-sdk dlog-analyzer --action log-dump [--serial <s>] [--filter "*:E"] [--lines 50]` | Present `result.output`; mention `result.dump_file` when `result.truncated` is true. |
| Save / export the logs | `tizen-cli tizen-sdk dlog-analyzer --action log-dump --output <file> --lines 0` | Report `result.dump_file`. |
| Clear the logs | `tizen-cli tizen-sdk dlog-analyzer --action log-clear [--serial <s>]` → `user_input_required` | Ask the user; after an explicit yes run `errors[0].suggested_fix.command` (same line with `--confirm`). |

These are not analysis tasks: no bilingual report, no background session unless the user asked to monitor.

## Output

**Success (log-dump):**

```json
{
  "command": "tizen-sdk dlog-analyzer log-dump",
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "sdb_command": "sdb -s \"emulator-26101\" dlog -d -v threadtime \"*:E\"",
    "filter": ["*:E"],
    "dump_file": "/tmp/tizen-dlog-analyzer/dlog-dump.log",
    "total_lines": 1342,
    "returned_lines": 200,
    "truncated": true,
    "output": "09-17 10:21:03.114  1234  1234 E CHROMIUM: ...",
    "message": "Dumped 1342 dlog lines from device emulator-26101; showing the last 200. Full dump: /tmp/tizen-dlog-analyzer/dlog-dump.log"
  }
}
```

**Failure (log-clear without --confirm):**

```json
{
  "command": "tizen-sdk dlog-analyzer log-clear",
  "status": "failure",
  "errors": [
    {
      "category": "user_input_required",
      "message": "Clearing the dlog buffer on device emulator-26101 discards every log line currently held on the device (sdb dlog -c). This cannot be undone. Ask the user to confirm, then re-run with --confirm.",
      "suggested_fix": {
        "command": "tizen-sdk dlog-analyzer --action log-clear --serial emulator-26101 --confirm",
        "auto_fixable": false
      }
    }
  ]
}
```

**Success (log-clear --confirm):**

```json
{
  "command": "tizen-sdk dlog-analyzer log-clear",
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "sdb_command": "sdb -s \"emulator-26101\" dlog -c",
    "output": "",
    "message": "dlog buffer cleared on device emulator-26101."
  }
}
```

**Success (start):**

```json
{
  "command": "tizen-sdk dlog-analyzer start",
  "status": "success",
  "result": {
    "pid": 12345,
    "subcommand": "start-monitoring",
    "device_serial": "emulator-26101",
    "output_file": "/tmp/tizen-dlog-analyzer/analyzer-output.log",
    "output_dir": "/tmp/tizen-dlog-analyzer/dlog-output",
    "message": "tizen-dlog-analyzer (start-monitoring) started in background (PID 12345)..."
  }
}
```

**Success (check):**

```json
{
  "command": "tizen-sdk dlog-analyzer check",
  "status": "success",
  "result": {
    "is_running": true,
    "pid": 12345,
    "output_file": "/tmp/tizen-dlog-analyzer/analyzer-output.log",
    "output": "[analyzed crash/exception data...]"
  }
}
```

**Success (app-launch):**

```json
{
  "command": "tizen-sdk dlog-analyzer app-launch",
  "status": "success",
  "result": {
    "app_id": "org.example.myapp",
    "device_serial": "emulator-26101",
    "pid": 12345,
    "launch_output": "...",
    "message": "App \"org.example.myapp\" launched on device emulator-26101 (PID 12345)..."
  }
}
```

**Success (dlog-collect --app-id):**

```json
{
  "command": "tizen-sdk dlog-analyzer dlog-collect",
  "status": "success",
  "result": {
    "pid": 67890,
    "app_id": "org.example.myapp",
    "app_pid": 12345,
    "device_serial": "emulator-26101",
    "log_file": "/tmp/tizen-dlog-analyzer/app/org.example.myapp/org.example.myapp.hot.log",
    "output_file": "/tmp/tizen-dlog-analyzer/app-collect-output.log",
    "message": "dlog-collect for app \"org.example.myapp\" (PID 12345) started in background (collect PID 67890)..."
  }
}
```

`pid` is the background collector process; `app_pid` is the app's PID on the device (may be `null` if it could not be resolved yet — the native binary resolves it itself).

**Success (error-analyze --app-id):**

```json
{
  "command": "tizen-sdk dlog-analyzer error-analyze",
  "status": "success",
  "result": {
    "app_id": "org.example.myapp",
    "format": "both",
    "error_count": 3,
    "output": "─── summary lines and/or detail entries, per --format (plain text, token-efficient) ───",
    "message": "Found 3 unique runtime errors in logs for app \"org.example.myapp\"."
  }
}
```

**Failure (invalid app id — any app action):**

```json
{
  "command": "tizen-sdk dlog-analyzer app-launch",
  "status": "failure",
  "errors": [
    {
      "category": "invalid_parameters",
      "message": "Invalid app id: org.x;echo. Allowed characters: letters, digits, '.', '_', '-'."
    }
  ]
}
```

**Failure (no device):**

```json
{
  "command": "tizen-sdk dlog-analyzer start",
  "status": "failure",
  "errors": [
    {
      "category": "device_not_found",
      "message": "No connected Tizen device or emulator. Launch an emulator first using tizen-launch-emulator."
    }
  ]
}
```

## Rules

1. **Never run `sdb dlog` yourself — every log operation goes through this command.** Continuous collection is `dlog-collect` (the native binary's own subcommand) — for a specific app (`--action dlog-collect --app-id <id>`) or the whole system (`--action start --subcommand dlog-collect` / `start-monitoring`). A one-shot view/save is `--action log-dump`; clearing the buffer is `--action log-clear`. Do not shell out to `sdb shell dlog`, `sdb dlog -d`, or `sdb dlog -c` by hand.
2. **Always analyze through `error-analyze` (app-specific) or `check` (system-wide monitoring) — never by reading the log file directly.** These commands handle deduplication, classification, and formatting that raw log text does not. (A plain "show me the logs" is not analysis — answer it with `log-dump`, whose `result.output` is meant to be shown.)
3. **After starting any continuous command** (`--action start` with any subcommand, or `--action dlog-collect --app-id <id>`), **ask the user** whether to:
   - **Continue** — keep collecting/monitoring in the background while they keep using the app, or
   - **Stop and analyze now** — stop the relevant background process (`--action stop` or `--action stop-collect`) and run `check` / `error-analyze` immediately.

   Do not poll or loop waiting for a crash — present the choice and wait for the user's reply.
4. Prefer `start-monitoring` for general "something's wrong with my app" reports (it self-detects crashes). Use the app-specific `dlog-collect --app-id` + `error-analyze --app-id` pair when the user names a specific app and wants non-fatal runtime-error triage.
5. Start monitoring/collection **before** launching or reproducing the issue in the app, so startup and early failures are captured.
6. **Once the analysis task is fully complete** — the last planned `check`/`error-analyze` call has returned and no further collection/analysis step remains before handing control back to the user — read `REPORT_TEMPLATE.md` (next to this SKILL.md) and render the report in that exact structure **twice: the full English report first, then a `---` line, then the full Korean (한국어) translation of the same report — always both, regardless of the language the user wrote in.** Technical identifiers (app IDs, device serials, dlog tags, quoted log lines, file paths, function names, code) stay verbatim in both blocks. Do not paste raw tool output or improvise a format. A `check`/`error-analyze` result that is only an intermediate step in a larger in-progress sequence (e.g. still deciding whether to relaunch the app and collect again) does not by itself trigger the report. Re-render the full bilingual report (not a diff) on each subsequent analysis pass, e.g. after the user applies a fix and reproduces the issue again. If `REPORT_TEMPLATE.md` cannot be found, use this section order in both languages: Summary/요약 (Date/날짜, Emulator-Device/에뮬레이터·디바이스, App/앱, Issue/이슈), Root Cause/근본 원인, Additional Findings/추가 발견 사항, Solution Suggestions/해결 방안 제안, Workarounds/임시 해결 방법.
7. **Build the report only from the tool result already returned and prior conversation context.** Do not run additional commands (device info, sdb, system diagnostics, etc.) to gather more evidence before rendering — if something isn't already known, say so in the relevant field/section rather than fetching it. Never invent a value (e.g. a device name) that isn't already known.
8. **After presenting the report**, end with a short next-step prompt to the user (continue monitoring, apply a suggested fix and retest, or stop) **given in English and then in Korean**. A plain one-shot request (`log-dump` / `log-clear`) is not an analysis task and does not trigger the report.
9. **`log-clear` is confirmation-gated.** Without `--confirm` the command refuses with `user_input_required` and does nothing. Ask the user, and only after an explicit "yes" re-run `errors[0].suggested_fix.command` (the same line with `--confirm`). Never pass `--confirm` pre-emptively, never run `sdb dlog -c` yourself.

## Boundary

**In scope:** viewing, tailing, saving, and clearing device/emulator logs on request (`log-dump`, `log-clear`); collecting logs (system-wide or app-specific), analyzing them for crashes/exceptions/runtime errors, applying fixes, rebuilding, reinstalling, relaunching, and re-analyzing to verify the fix. Also: launching/terminating apps as needed to reproduce an issue.

**Out of scope (use other skills):**
- Launching an emulator → `tizen-cli tizen-sdk launch-emulator`
- Interactive debugging → `tizen-cli tizen-sdk gdb-debug` (Native) or `tizen-cli tizen-sdk dotnet-debug` (.NET)

## Important notes

- **Only one system-wide `start` instance at a time.** If already running, `start` returns an `already_running` error. Stop first.
- **Only one app-specific `dlog-collect` instance at a time.** Same rule — `stop-collect` first.
- **The binary is platform-specific.** The setup script copies only the matching `linux/`, `macos/`, or `windows/` binary.
- **Both background processes are detached** and survive the agent session ending. Always stop them when done.
- **App-specific logs** are stored in `$TMPDIR/tizen-dlog-analyzer/app/<app-id>/<app-id>.hot.log`.
- **`dlog-collect --app-id` requires the app to be running** — it looks up the PID via `pgrep`/`ps` (with fallbacks). If the PID cannot be resolved, collection still starts and the native binary resolves it; if the app is truly not running, the collector exits and a `process_crashed` error is returned.
- **App IDs are validated** (`[A-Za-z0-9._-]` only) before any app action runs; anything else returns `invalid_parameters`.
- **`error-analyze` requires `dlog-collect --app-id` (then `stop-collect`) to have been run first** — it reads from the collected log file. If no logs are found, it returns a `no_logs` error.
- **`error-analyze` output is plain text (not Rich tables)** — the summary is one line per finding (`N. Module=TAG | Repeated=X | Message: ...`), and the details section shows `[Error N]` blocks with `Full log:` lines. This format is optimized for AI-agent consumption (token-efficient, no wrapping).
- **`log-dump` / `log-clear` need no native binary** — only sdb and a connected device. `log-dump` always writes the complete dump to `result.dump_file`; `result.output` is only the tail. `log-clear` does not stop running collectors (a `warnings` entry says so); lines they already collected stay in their files.

## Follow-ups

- Launch an emulator → `tizen-cli tizen-sdk launch-emulator`
- Debug a native crash interactively → `tizen-cli tizen-sdk gdb-debug`
- Debug a .NET crash interactively → `tizen-cli tizen-sdk dotnet-debug`
