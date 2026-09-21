---
name: tizen-dlog-analyzer
description: Tizen dlog analyzer, dlog analysis, show logs, show me the logs, tail the logs, view device logs, emulator logs, device log, 로그 보기, 로그 보여줘, 로그 확인, 로그 수집, save logs, export logs, 로그 저장, clear logs, dlog clear, flush logs, 로그 지우기, 로그 삭제, dlog, log monitoring, exception detection, crash log analysis, log-dump, log-clear, dlog-collect, exception-detect, start-monitoring, app-launch, app-terminate, error-analyze, dlog-collect --app-id. The single owner of Tizen device/emulator logs — one-shot dlog buffer dump (log-dump, optional tag/priority filter, full dump saved to a file), buffer clear (log-clear, confirmation-gated), and AI-powered dlog analysis for root cause detection that continuously collects device logs, detects crashes/exceptions, and offers solutions. Requires a running emulator or connected device. This is the default entry point for ANY report of a Tizen crash, error, freeze, or unexpected behavior — even if the user never says the word "dlog" or "log" — AND for EVERY plain log request (show/tail/save/clear the logs) with no problem attached. Logs never go through tizen-sdb-helper or a hand-typed sdb dlog.
version: 1.1.0
when_to_use: The user reports any problem, crash, freeze, error, or unexpected behavior with a Tizen app or device, asks to monitor/investigate Tizen logs, wants root-cause analysis, wants app-specific log collection filtered by app ID, or wants runtime error analysis for a specific app. Route here first for "my app crashed", "something's wrong with my app", "why did it stop working", etc. — do not ask the user to run raw sdb/dlog commands themselves. ALSO route here when the user simply wants to see, tail, save/export, or clear the device or emulator logs with no problem reported ("show me the logs", "로그 보기", "save the dlog", "clear logs" / "dlog clear", "로그 지우기") — tizen-sdb-helper returns a handoff for these; run log-dump / log-clear here.
inputs:
  - name: action
    description: One of log-dump, log-clear, start, stop, check, status, app-launch, app-terminate, dlog-collect, stop-collect, error-analyze. 'log-dump' dumps the device dlog buffer once (sdb dlog -d) — the answer to "show/tail/save the logs"; 'log-clear' clears the device dlog buffer (sdb dlog -c) — destructive, requires confirm; 'start' launches monitoring in background, 'stop' kills it, 'check' retrieves analyzed output, 'status' checks if still running, 'app-launch' launches a Tizen app, 'app-terminate' terminates an app, 'dlog-collect' starts background app-specific log collection by PID, 'stop-collect' stops the background app log collection, 'error-analyze' analyzes collected logs for E/F priority errors.
  - name: subcommand
    description: For 'start' action only. One of dlog-collect, exception-detect, start-monitoring (recommended).
  - name: app-id
    description: Tizen app ID (e.g. org.example.myapp). Required for app-launch, app-terminate, dlog-collect, and error-analyze actions.
  - name: format
    description: For error-analyze only. One of summary (summary lines only), details (detail entries only), or omit for both.
  - name: serial
    description: Optional sdb device serial. Defaults to the only attached device.
  - name: filter
    description: For log-dump only. dlog filterspecs <tag>[:<V|D|I|W|E|F|S>], space- or comma-separated, e.g. "*:E" (errors and fatals only) or "E20:W CHROMIUM". Omit for everything.
  - name: lines
    description: For log-dump only. Number of trailing lines returned in the envelope (default 200, 0 = all). The complete dump is always written to a file.
  - name: output
    description: For log-dump only. Host file that receives the complete dump (default $TMPDIR/tizen-dlog-analyzer/dlog-dump.log).
  - name: confirm
    description: For log-clear only. Pass --confirm to actually clear the buffer; without it the runner returns user_input_required and does nothing.
required_tools: [bash, read]
---

# Tizen DLog Analyzer Skill

## Goal

Own every device/emulator log request on Tizen. Two layers, one entry point:

- **One-shot** — `log-dump` (view / tail / save the current dlog buffer, optional tag/priority filter) and `log-clear` (clear the buffer, confirmation-gated). These are plain `sdb dlog` operations run by the runner, so the agent never types `sdb` itself.
- **Continuous** — collect logs with the `tizen-dlog-analyzer` binary, detect crashes/exceptions/runtime errors, and offer solutions. This is the default tool for **any** Tizen issue report, not only requests that explicitly mention dlog.

`tizen-sdb-helper` hands every log intent (tail/show/save/clear logs) off to this skill; its handoff envelope carries a `result.note` naming the action to run.

## Boundary

In scope: viewing, tailing, saving, and clearing device/emulator logs on request; collecting logs (system-wide or app-specific), analyzing them for crashes/exceptions/runtime errors, applying fixes, rebuilding, reinstalling, relaunching, and re-analyzing to verify the fix. Also: launching/terminating apps as needed to reproduce an issue.

Out of scope:
- Launching an emulator — use `tizen-launch-emulator` first.
- Interactive debugging — use `tizen-gdb-debug` (Native) or `tizen-dotnet-debug` (.NET).

## Prerequisites

1. **A running emulator or connected device.** Use `tizen-launch-emulator` before starting. The analyzer needs a live sdb connection.
2. **The tizen-dlog-analyzer binary** must be installed (copied by the setup script to the plugin cache).

## Resolving the CLI runner

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dlog-analyzer-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dlog-analyzer-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done

# Report template (cat "$TEMPLATE" right before rendering the final report — see Rule 6):
TEMPLATE=$(ls "$HOME"/.{claude,cline,codex,gemini}/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md "$HOME"/.agents/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md 2>/dev/null | head -1)
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/dlog-analyzer-cli.js`, and the template at `common/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md`.)

## How it works

The `tizen-dlog-analyzer` binary has three long-running (non-terminating) subcommands:

| Subcommand         | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `dlog-collect`     | Continuously collect, classify, and store dlog from a device.  |
| `exception-detect` | Detect crashes from collected log files.                       |
| `start-monitoring` | Run dlog-collect + exception-detect in parallel (recommended). |

Since these are non-terminating, the CLI runner (`dlog-analyzer-cli.js`) manages them as **detached background processes**. All stdout/stderr is captured to a temp file. The agent uses these actions:

| Action   | Description                                                      |
| -------- | ---------------------------------------------------------------- |
| `start`  | Launch the binary in background, capture output to a temp file.  |
| `stop`   | Kill the running background process.                             |
| `check`  | Read the temp file and return the latest analyzed output.        |
| `status` | Check if the background process is still running.                |

## App-specific commands

In addition to system-wide background monitoring, the runner supports app-specific log collection and runtime-error analysis:

### app-launch — Launch a Tizen app

```bash
node "$CLI" app-launch <app-id>
# Optional: node "$CLI" app-launch <app-id> emulator-26101
```

Launches the app on the connected device via `sdb shell app_launcher -s <app_id>`. Returns the app PID. Use this to launch an app before collecting its logs.

### app-terminate — Terminate a running Tizen app

```bash
node "$CLI" app-terminate <app-id>
```

Terminates the app via `sdb shell app_launcher -k <app_id>`.

### dlog-collect — Start background app-specific log collection

```bash
node "$CLI" dlog-collect <app-id>
```

Starts collecting dlog filtered by the app's PID as a **background process**. **The app must be running** — it resolves the PID via `pgrep`/`ps` (with fallbacks). Logs are continuously written to `$TMPDIR/tizen-dlog-analyzer/app/<app-id>/<app-id>.hot.log`.

After starting collection, **tell the user** to browse the app and reproduce any issues. Give them two options:
1. **Done with browsing and error/crash occurred** — the user reproduced the issue
2. **Nothing happened** — the user didn't see any problem

If the user selects option 1: run `stop-collect` to stop collection, then `error-analyze <app-id>` to analyze the logs.
If the user selects option 2: run `stop-collect` to stop collection and clean up.

### stop-collect — Stop background app log collection

```bash
node "$CLI" stop-collect
```

Stops the background app-specific dlog collection process. The collected logs remain saved at `$TMPDIR/tizen-dlog-analyzer/app/<app-id>/<app-id>.hot.log` for analysis.

### error-analyze — Analyze app logs for runtime errors

```bash
node "$CLI" error-analyze <app-id> [format]
# format: summary (summary lines only), details (detail entries only), or omit for both
```

Analyzes the collected app logs (`<app-id>.hot.log`) for Error (E) and Fatal (F) priority entries. Deduplicates errors by tag+message with occurrence count. Output is plain text (token-efficient, no Rich tables): the summary shows one line per finding (`N. Module=TAG | Repeated=X | Message: ...`), and the details section shows `[Error N]` blocks with `Full log:` lines.

**Prerequisite:** Run `dlog-collect <app-id>` first to start collection, then `stop-collect` to stop it before analyzing.

## One-shot log actions — plain "show / tail / save / clear the logs"

These requests arrive from the user directly or as a `handoff: "tizen-dlog-analyzer"` envelope from `tizen-sdb-helper` (its `result.note` names the action). They are **not** analysis tasks: show the result, do not render the bilingual report (Rule 6), do not start a background session unless the user asked to monitor.

| Request | Run | Then |
| --- | --- | --- |
| Show / tail / view the logs (`show logs`, `tail the logs`, `로그 보기`, emulator logs) | `node "$CLI" log-dump [serial]` — add `--filter "*:E"` for errors only, `--filter "TAG:W"` for one tag, `--lines 50` to shorten | Present `result.output` (the last `returned_lines` of `total_lines`) and mention `result.dump_file` when `truncated` is true. |
| Save / export the logs to a file | `node "$CLI" log-dump [serial] --output <host-file> --lines 0` | Report `result.dump_file`; the file holds the complete dump. Never redirect `sdb dlog` yourself. |
| Clear / flush the logs (`clear logs`, `dlog clear`, `로그 지우기`) | `node "$CLI" log-clear [serial]` — the first call **always** returns `user_input_required` | Show `errors[0].message`, get an explicit "yes", then run `node "$CLI" log-clear [serial] --confirm`. Never pass `--confirm` on the first call, never type `sdb dlog -c`. |
| Watch the logs continuously / "monitor" | `node "$CLI" start start-monitoring [serial]` (or `start dlog-collect`) | Continue with the Workflow below (Rule 3 choice → `stop` → `check`). |

`log-dump` uses `sdb dlog -d` (dump and exit) — without `-d` dlog streams forever. For live streaming use the continuous layer, not a shell loop.

## Workflow

### 1. Start monitoring (background) — BEFORE launching the app

**Important:** Start monitoring **before** launching the app so that logs are captured from app startup, including initialization failures and early crashes.

```bash
node "$CLI" start start-monitoring
# Optional serial: node "$CLI" start start-monitoring emulator-26101
```

### 2. Launch the app and reproduce

Install with `tizen-install-app` if needed, then launch with `node "$CLI" app-launch <app-id>` (or `tizen-sdb-helper`). For app-scoped triage, start `node "$CLI" dlog-collect <app-id>` once the app is running.

### 3. Ask the user: continue, or stop and analyze now

Present the two options from Rule 3 and wait — do not poll.

### 4. Analyze and report

Run `check` (system-wide) or `stop-collect` + `error-analyze <app-id>` (app-specific). When the analysis task is fully complete, render the bilingual report per Rule 6, then the next-step prompt per Rule 8. Always `stop` / `stop-collect` when the investigation is done.

## Commands

| Command | What it does |
| --- | --- |
| `node "$CLI" start start-monitoring [serial]` | **Recommended for general issue triage.** Collects system-wide dlog and continuously detects crashes/exceptions in the background. |
| `node "$CLI" start dlog-collect [serial]` | Collects system-wide dlog only (no live exception detection), in the background. |
| `node "$CLI" start exception-detect [serial]` | Runs crash detection only, against already-collected log files, in the background. |
| `node "$CLI" check` | Reads the latest **analyzed** output produced by a running/finished `start` session. |
| `node "$CLI" status` | Reports whether the background `start` process is still running. |
| `node "$CLI" stop` | Stops the background `start` process. |
| `node "$CLI" app-launch <app-id> [serial]` | Launches a Tizen app and returns its PID. |
| `node "$CLI" app-terminate <app-id> [serial]` | Terminates a running Tizen app. |
| `node "$CLI" dlog-collect <app-id> [serial]` | Collects dlog filtered to one app's PID, in the background. The app must already be running. |
| `node "$CLI" stop-collect` | Stops the app-specific background collection started above. |
| `node "$CLI" error-analyze <app-id> [format]` | Analyzes the collected app log for Error/Fatal entries, deduplicated with occurrence counts. Output is plain text (token-efficient). `format` is `summary` (summary lines only), `details` (detail entries only), or omitted for both. |
| `node "$CLI" log-dump [serial] [--filter "<spec> …"] [--lines <n>] [--output <file>]` | One-shot dump of the device dlog buffer (`sdb dlog -d -v threadtime`). Returns the last `--lines` lines (default 200, `0` = all) in `result.output`; the complete dump is written to `result.dump_file` (`--output` or `$TMPDIR/tizen-dlog-analyzer/dlog-dump.log`). `--filter` takes dlog filterspecs `<tag>[:<V|D|I|W|E|F|S>]` such as `"*:E"` or `"E20:W CHROMIUM"`. No native binary involved. |
| `node "$CLI" log-clear [serial] [--confirm]` | Clears the device dlog buffer (`sdb dlog -c`). Without `--confirm` returns `user_input_required` with a `suggested_fix` and does nothing. Running collectors are not stopped (a `warnings` entry says so). |

## Rules

1. **Never run `sdb dlog` yourself — every log operation goes through this runner.** Continuous collection is `dlog-collect` (the native binary's own subcommand) — for a specific app (`dlog-collect <app-id>`) or the whole system (`start dlog-collect` / `start start-monitoring`). A one-shot view/save is `log-dump`; clearing the buffer is `log-clear`. Do not shell out to `sdb shell dlog`, `sdb dlog -d`, or `sdb dlog -c` to do any of these by hand.
2. **Always analyze through `error-analyze` (app-specific) or `check` (system-wide monitoring) — never by reading the log file directly.** These commands handle deduplication, classification, and formatting that raw log text does not. Do not `Read` the `.hot.log` file or the raw output file as a substitute for running the command. (A plain "show me the logs" is not analysis — answer it with `log-dump`, whose `result.output` is meant to be shown.)
3. **After starting any continuous command** (`start start-monitoring`, `start dlog-collect`, `start exception-detect`, or `dlog-collect <app-id>`), **ask the user** whether to:
   - **Continue** — keep collecting/monitoring in the background while they keep using the app, or
   - **Stop and analyze now** — stop the relevant background process (`stop` or `stop-collect`) and run `check` / `error-analyze` immediately.

   Do not poll or loop waiting for a crash — present the choice and wait for the user's reply.
4. Prefer `start-monitoring` for general "something's wrong with my app" reports (it self-detects crashes). Use the app-specific `dlog-collect <app-id>` + `error-analyze <app-id>` pair when the user names a specific app and wants non-fatal runtime-error triage.
5. Start monitoring/collection **before** launching or reproducing the issue in the app, so startup and early failures are captured.
6. **Once the analysis task is fully complete** — the last planned `check`/`error-analyze` call has returned and no further collection/analysis step remains before handing control back to the user — read `REPORT_TEMPLATE.md` (next to this SKILL.md; `cat "$TEMPLATE"` from the runner snippet) and render the report in that exact structure **twice: the full English report first, then a `---` line, then the full Korean (한국어) translation of the same report — always both, regardless of the language the user wrote in.** Technical identifiers (app IDs, device serials, dlog tags, quoted log lines, file paths, function names, code) stay verbatim in both blocks. Do not paste raw tool output or improvise a format. A `check`/`error-analyze` result that is only an intermediate step in a larger in-progress sequence (e.g. still deciding whether to relaunch the app and collect again) does not by itself trigger the report. Re-render the full bilingual report (not a diff) on each subsequent analysis pass, e.g. after the user applies a fix and reproduces the issue again. If `REPORT_TEMPLATE.md` cannot be found, use this section order in both languages: Summary/요약 (Date/날짜, Emulator-Device/에뮬레이터·디바이스, App/앱, Issue/이슈), Root Cause/근본 원인, Additional Findings/추가 발견 사항, Solution Suggestions/해결 방안 제안, Workarounds/임시 해결 방법. A plain one-shot request (`log-dump` / `log-clear`, see "One-shot log actions") is not an analysis task and does not trigger the report.
7. **Build the report only from the tool result already returned and prior conversation context.** Do not run additional commands (device info, sdb, system diagnostics, etc.) to gather more evidence before rendering — if something isn't already known, say so in the relevant field/section rather than fetching it. Never invent a value (e.g. a device name) that isn't already known.
8. **After presenting the report**, end with a short next-step prompt to the user (continue monitoring, apply a suggested fix and retest, or stop) **given in English and then in Korean**.
9. **`log-clear` is confirmation-gated.** Without `--confirm` the runner refuses with `user_input_required` and does nothing. Ask the user, and only after an explicit "yes" re-run the same runner command with `--confirm` (same serial). Do not pre-emptively pass `--confirm`, and do not run the underlying sdb command yourself — this mirrors the gated-command rule in `tizen-sdb-helper`, except the re-run goes through this runner.

## Important notes

- **Only one system-wide `start` instance at a time.** If already running, `start` returns an `already_running` error. Stop first.
- **Only one app-specific `dlog-collect` instance at a time.** Same rule — `stop-collect` first.
- **The binary is platform-specific.** The setup script copies only the matching `linux/`, `macos/`, or `windows/` binary.
- **Both background processes are detached** and survive the agent session ending. Always `stop` / `stop-collect` when done.
- **Temp files** live under `$TMPDIR/tizen-dlog-analyzer/` (or `/tmp/tizen-dlog-analyzer/` on Linux); app-specific logs are at `.../app/<app-id>/<app-id>.hot.log`.
- **`dlog-collect <app-id>` requires the app to already be running** — the runner resolves the PID via `pgrep`/`ps` (with fallbacks). If the PID cannot be resolved, collection still starts and the native binary resolves it; if the app is truly not running, the collector exits and `process_crashed` is returned.
- **App IDs are validated** (`[A-Za-z0-9._-]` only) before any app command runs; anything else returns `invalid_parameters`.
- **`error-analyze` requires `dlog-collect <app-id>` (then `stop-collect`) to have run first.** If no logs exist, it returns `no_logs`.
- **`log-dump` / `log-clear` need no native binary** — only sdb and a connected device. `log-dump` always writes the complete dump to `result.dump_file`; `result.output` is only the tail. `log-clear` does not stop running collectors; lines they already collected stay in their files.


### Codex CLI

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb log collection needs a localhost TCP socket and the analyzer writes its reports outside the workspace, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.
