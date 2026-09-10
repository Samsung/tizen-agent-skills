---
name: tizen-dlog-analyzer
description: Tizen dlog analyzer, dlog analysis, exception detection, crash log analysis, log monitoring, dlog-collect, exception-detect, start-monitoring, app-launch, app-terminate, error-analyze, dlog-collect --app-id. AI-powered dlog analysis for Tizen platform root cause detection. Continuously collects device logs, detects crashes/exceptions, and offers solutions. Requires a running emulator or connected device. This is the default entry point for ANY report of a Tizen crash, error, freeze, or unexpected behavior — even if the user never says the word "dlog" or "log".
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - tizen dlog analyzer
    - dlog analysis
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

## Command

```
tizen-cli tizen-sdk dlog-analyzer --action <start|stop|check|status|app-launch|app-terminate|dlog-collect|stop-collect|error-analyze> [--subcommand <start-monitoring|dlog-collect|exception-detect>] [--app-id <id>] [--format <summary|details>] [--serial <serial>] [--output-dir <path>]
```

| Option                    | Required | Default            | Description                                                                       |
| ------------------------- | -------- | ------------------ | --------------------------------------------------------------------------------- |
| `--action <action>`       | yes      | —                  | start (launch monitoring), stop (kill background process), check (read output), status (check if running), app-launch (launch an app), app-terminate (terminate an app), dlog-collect (start background app-specific log collection), stop-collect (stop app-specific log collection), error-analyze (analyze app logs for E/F errors) |
| `--subcommand <subcommand>` | no     | `start-monitoring` | For --action start only: dlog-collect, exception-detect, or start-monitoring (recommended) |
| `--app-id <id>`           | no       | —                  | Tizen app ID (e.g., org.example.myapp). Required for app-launch, app-terminate, dlog-collect, and error-analyze |
| `--format <format>`       | no       | both               | For --action error-analyze only: summary (summary lines only), details (detail entries only), or omit for both |
| `--serial <serial>`       | no       | auto               | Target device serial (omit to auto-select the single connected device)           |
| `--output-dir <path>`     | no       | OS temp dir        | Directory for dlog output                                                         |

## Output

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

1. **Always collect logs through `dlog-collect` — never via raw `sdb`.** `dlog-collect` (the native binary's own subcommand) is the single supported way to pull device logs, for both a specific app (`--action dlog-collect --app-id <id>`) and the whole system (`--action start --subcommand dlog-collect` / `start-monitoring`). Do not shell out to `sdb shell dlog` or similar to gather logs yourself.
2. **Always analyze through `error-analyze` (app-specific) or `check` (system-wide monitoring) — never by reading the log file directly.** These commands handle deduplication, classification, and formatting that raw log text does not.
3. **After starting any continuous command** (`--action start` with any subcommand, or `--action dlog-collect --app-id <id>`), **ask the user** whether to:
   - **Continue** — keep collecting/monitoring in the background while they keep using the app, or
   - **Stop and analyze now** — stop the relevant background process (`--action stop` or `--action stop-collect`) and run `check` / `error-analyze` immediately.

   Do not poll or loop waiting for a crash — present the choice and wait for the user's reply.
4. Prefer `start-monitoring` for general "something's wrong with my app" reports (it self-detects crashes). Use the app-specific `dlog-collect --app-id` + `error-analyze --app-id` pair when the user names a specific app and wants non-fatal runtime-error triage.
5. Start monitoring/collection **before** launching or reproducing the issue in the app, so startup and early failures are captured.
6. **Once the analysis task is fully complete** — the last planned `check`/`error-analyze` call has returned and no further collection/analysis step remains before handing control back to the user — read `REPORT_TEMPLATE.md` (next to this SKILL.md) and render the report in that exact structure **twice: the full English report first, then a `---` line, then the full Korean (한국어) translation of the same report — always both, regardless of the language the user wrote in.** Technical identifiers (app IDs, device serials, dlog tags, quoted log lines, file paths, function names, code) stay verbatim in both blocks. Do not paste raw tool output or improvise a format. A `check`/`error-analyze` result that is only an intermediate step in a larger in-progress sequence (e.g. still deciding whether to relaunch the app and collect again) does not by itself trigger the report. Re-render the full bilingual report (not a diff) on each subsequent analysis pass, e.g. after the user applies a fix and reproduces the issue again. If `REPORT_TEMPLATE.md` cannot be found, use this section order in both languages: Summary/요약 (Date/날짜, Emulator-Device/에뮬레이터·디바이스, App/앱, Issue/이슈), Root Cause/근본 원인, Additional Findings/추가 발견 사항, Solution Suggestions/해결 방안 제안, Workarounds/임시 해결 방법.
7. **Build the report only from the tool result already returned and prior conversation context.** Do not run additional commands (device info, sdb, system diagnostics, etc.) to gather more evidence before rendering — if something isn't already known, say so in the relevant field/section rather than fetching it. Never invent a value (e.g. a device name) that isn't already known.
8. **After presenting the report**, end with a short next-step prompt to the user (continue monitoring, apply a suggested fix and retest, or stop) **given in English and then in Korean**.

## Boundary

**In scope:** collecting logs (system-wide or app-specific), analyzing them for crashes/exceptions/runtime errors, applying fixes, rebuilding, reinstalling, relaunching, and re-analyzing to verify the fix. Also: launching/terminating apps as needed to reproduce an issue.

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

## Follow-ups

- Launch an emulator → `tizen-cli tizen-sdk launch-emulator`
- Debug a native crash interactively → `tizen-cli tizen-sdk gdb-debug`
- Debug a .NET crash interactively → `tizen-cli tizen-sdk dotnet-debug`
