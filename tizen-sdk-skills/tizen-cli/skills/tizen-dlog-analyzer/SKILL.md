---
name: tizen-dlog-analyzer
description: Tizen dlog analyzer, dlog analysis, show logs, tail the logs, device log, emulator logs, 로그 보기, 로그 저장, 로그 지우기, save logs, clear logs, dlog clear, crash log analysis, exception detection, investigate, root cause, 원인 분석, 조사해줘, high CPU usage, CPU 300%, memory leak, freeze, hang, slow, video not playing, app crashed, 앱이 죽어요, 멈춤, 느려요, 재생 안됨, kernel log, dmesg, probe, log-dump, log-clear, dlog-collect, error-analyze, search logs, find text in logs, 로그 검색, which app logged this. The single owner of Tizen device/emulator logs AND of EVERY problem report about a Tizen app, emulator, or device — crash, error, freeze, high CPU, memory, video/audio playback — even if the user never says "log" or mentions the emulator/device (NOT device-manager, which only lists devices / stops emulators). Runs investigate, kernel collect/analyze, dlog-collect + error-analyze, start-monitoring, search (text/regex in collected logs); one-shot log-dump / confirmation-gated log-clear. Never a hand-typed sdb dlog / dmesg / top / grep.
metadata:
  author: Samsung Electronics
  last-updated: "2026-10-07"
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
    - app-log
    - search
    - 로그 검색
    - device-profile
    - investigate
    - probe
    - snapshot
    - timeline
    - kernel
---

# Tizen DLog Analyzer

## When to use

The user reports ANY problem, crash, freeze, error, high CPU or memory usage, slow or laggy emulator, video/audio not playing, or unexpected behavior of a Tizen app or device, asks to monitor/investigate Tizen logs, wants root-cause analysis, wants app-specific log collection filtered by app ID, wants runtime error analysis for a specific app, wants a one-shot investigation report, wants to view the full app log (not just errors), wants to find a specific string or pattern in the collected logs without knowing which app wrote it ("search the logs for X", "which app logged X", 로그에서 X 찾아줘 — `--action search`), wants to detect the device profile, wants to run evidence probes, wants to create/compare system snapshots, wants to view probe timeline history, or wants to collect/analyze kernel logs. Route here first for "my app crashed", "the emulator CPU went to 300% and the video does not play", "something's wrong with my app", "why did it stop working", "investigate this issue", 원인 분석해줘, etc. — **even when the sentence mentions the emulator or device**. `device-manager` only answers "which devices are connected?" / "stop the emulator"; this command detects the device itself (`device_not_found` / `multiple_devices`). Do not fall back to raw sdb/dlog/dmesg/top commands, and do not detour through `sdb-helper` shell requests for them.

**Also** route here when the user simply wants to see, tail, save/export, or clear the device or emulator logs with no problem reported ("show me the logs", "로그 보기", "save the dlog", "clear logs" / "dlog clear", "로그 지우기"). `sdb-helper` returns a handoff envelope for these (its `result.note` names the action); answer them with `--action log-dump` / `--action log-clear`.

## Investigation workflow (a reported symptom)

1. **Subject** — app id if named, the symptom in the user's words, `--serial` only when several devices are online.
2. **First pass:** `tizen-cli tizen-sdk dlog-analyzer --action investigate --symptoms "<the user's words>" [--app-id <id>]` — symptom → probe bundles (CPU, memory, freeze, media, graphics …) → correlated report. Summarize `result.output` in two or three lines; it is not the final report.
3. **Start the collectors BEFORE reproducing:** `--action start --subcommand start-monitoring`, `--action kernel --subcommand collect` (CPU / freeze / memory / graphics / driver symptoms), `--action app-launch --app-id <id>` if the app is not running, `--action dlog-collect --app-id <id>`. The native binary runs one dlog collector at a time: if `dlog-collect` returns `already_running` naming the monitor as the lock holder, do **not** stop the monitor mid-reproduction — it already captures the app; analyze with `--action check` in step 5.
4. **STOP — end your turn.** Tell the user (English and Korean) that collection is running, ask them to browse the app and reproduce the issue, and to answer **(1) done — the error/crash/symptom occurred** or **(2) nothing happened**. No `sleep`, no polling, no `stop-collect` / `check` / `kernel stop` in the same turn.
5. **After the reply — stop, then analyze in order:** `--action stop-collect`, `--action kernel --subcommand stop`; `--action error-analyze --app-id <id> --format summary` → `--action check` → `--action kernel --subcommand analyze`. Never skip `check` when `start-monitoring` ran — it works after `--action stop` as well (the captured analysis stays in `result.output_file` until the next `start`; `stop` returns its last 200 lines, `check` all of it). Only if the symptom is still unexplained: `--action error-analyze --format details` → `--action search --pattern "<the string a finding or the user named>" --context 1 --priority W` (every collected category at once, whole entries) → `--action app-log --app-id <id> --priority W --since 10m --max-lines 300` (always filtered) → `--action probe --subcommand list` then `--subcommand run --app-id <probe-id>`. If the user chose (2), still run the three analyzers once (silent errors), then ask whether to keep collecting or stop.
6. **Report** (Rule 6), next-step prompt (Rule 8), `--action stop` when done.

## Command

```
tizen-cli tizen-sdk dlog-analyzer --action <log-dump|log-clear|start|stop|check|status|app-launch|app-terminate|dlog-collect|stop-collect|error-analyze|app-log|search|device-profile|investigate|probe|snapshot|timeline|kernel> [--subcommand <subcommand>] [--app-id <id>] [--format <format>] [--serial <serial>] [--output-dir <path>] [--filter "<spec> ..."] [--lines <n>] [--output <file>] [--confirm] [--since <time>] [--until <time>] [--priority <V|D|I|W|E|F>] [--tag <tag>] [--keyword <kw>] [--max-lines <n>] [--max-chars <n>] [--refresh] [--max-age <age>] [--symptoms <text>] [--profile <profiles>] [--budget <n>] [--budget-tokens <n>] [--allow-network-probe] [--probe-id <id>] [--pattern <text...>] [--category <name>] [--regex] [--case-sensitive] [--invert] [--all] [--context <n>] [--after-context <n>] [--before-context <n>] [--count] [--max-matches <n>]
```

| Option                    | Required | Default            | Description                                                                       |
| ------------------------- | -------- | ------------------ | --------------------------------------------------------------------------------- |
| `--action <action>`       | yes      | —                  | log-dump (one-shot dlog buffer dump — "show/tail/save the logs"), log-clear (clear the device dlog buffer — requires --confirm), start (launch monitoring), stop (kill background process), check (read output), status (check if running), app-launch (launch an app), app-terminate (terminate an app), dlog-collect (start background app-specific log collection), stop-collect (stop app-specific log collection), error-analyze (analyze app logs for E/F errors), app-log (print full collected log for one app), search (find text or a regex in every collected dlog category — `--pattern` required), device-profile (detect and print device profile), investigate (one-shot first-pass investigation report, use --app-id for app-scoped), probe (list/run evidence probes), snapshot (create/list/compare/delete system snapshots), timeline (show/report/analyze/export probe history across snapshots), kernel (kernel log collect/analyze) |
| `--subcommand <subcommand>` | no     | `start-monitoring` | For --action start: dlog-collect, exception-detect, or start-monitoring (recommended). For --action probe: list or run. For --action snapshot: create, list, compare, or delete. For --action kernel: collect (background collector), stop, or analyze. For --action timeline: show, report, analyze, or export. |
| `--app-id <id>`           | no       | —                  | Tizen app ID (e.g., org.example.myapp). Required for app-launch, app-terminate, dlog-collect, error-analyze, and app-log. Optional for investigate (app-scoped investigation). For search: same as `--category` (restrict the search to this app's logs). |
| `--format <format>`       | no       | both/text          | For --action error-analyze: summary (summary lines only), details (detail entries only), or omit for both. For app-log, search, device-profile, investigate, probe, snapshot, timeline, kernel: json or text (default: text). For error-analyze prefer `summary` (token-efficient); `details` is the larger output, use it only when the user wants full log entries. For search, `json` carries `total_matches` / `returned` / `truncated` plus structured entries. |
| `--pattern <text...>`     | search   | —                  | For --action search (**required** there): text to look for. Several values allowed (`--pattern foo bar`, or repeat the flag) — any one matches unless `--all`. Quote a multi-word pattern. Plain text unless `--regex`; case-insensitive unless `--case-sensitive`. |
| `--category <name>`       | no       | all                | For --action search: search only this category — an app id, `_general` or `_unparsed`; comma-separate several. Default: every category under `app/` (the kernel log is excluded — use `--action kernel --subcommand analyze`). |
| `--regex`                 | no       | false              | For --action search: treat `--pattern` values as Python regular expressions (`"Exception\|SIGSEGV"`). |
| `--case-sensitive`        | no       | false              | For --action search: match case exactly. |
| `--invert`                | no       | false              | For --action search: select the entries that do NOT match. |
| `--all`                   | no       | false              | For --action search: an entry must match every `--pattern` (default: any). |
| `--context <n>`           | no       | 0                  | For --action search: whole entries of context before and after each match (grep `-C`); `--after-context` / `--before-context` (grep `-A` / `-B`) override it. Context entries are not filtered by `--priority` / `--tag`. |
| `--count`                 | no       | false              | For --action search: print only the number of matching entries per category (ignores context and `--max-matches`). |
| `--max-matches <n>`       | no       | 100                | For --action search: return at most this many matches (0 = unlimited); the total is always counted (`result.total_matches` with `--format json`). |
| `--serial <serial>`       | no       | auto               | Target device serial (omit to auto-select the single connected device)           |
| `--output-dir <path>`     | no       | —                  | For `--action snapshot --subcommand compare` only: the second snapshot ID (`--app-id` carries the first). Not used by `--action start` — collected logs always go to `<sdk-data>/dloganalyzer/` (see "Where logs are stored") |
| `--filter <specs>`        | no       | everything         | For --action log-dump only: dlog filterspecs `<tag>[:<V\|D\|I\|W\|E\|F\|S>]`, space- or comma-separated — `"*:E"` (errors and fatals), `"E20:W CHROMIUM"` |
| `--lines <n>`             | no       | 200                | For --action log-dump only: trailing lines returned in the envelope (`0` = all). The complete dump always goes to the dump file |
| `--output <file>`         | no       | `<tmp>/tizen-dlog-analyzer/dlog-dump.log` | For --action log-dump: host file that receives the complete dump. For --action app-log / search: file that receives the complete output (`--max-lines` / `--max-chars` cap stdout only). For --action timeline export: output JSON file. |
| `--confirm`               | no       | false              | Required for log-clear; without it the action fails with `user_input_required` and does nothing |
| `--since <time>`         | no       | —                  | For --action app-log / search: keep entries at/after this time (dlog timestamp like '08-14 18:09' or relative age like '30s', '10m', '2h', '1d') |
| `--until <time>`         | no       | —                  | For --action app-log / search: keep entries at/before this time (same formats as --since) |
| `--priority <p>`         | no       | all                | For --action app-log / search: minimum priority to keep (V, D, I, W, E, F — keeps this level and above) |
| `--tag <tag>`             | no       | —                  | For --action app-log / search: keep only entries with this dlog tag |
| `--keyword <kw>`          | no       | —                  | For --action app-log: keep only entries containing these keywords (repeatable). For a search across every app use `--action search --pattern` instead. |
| `--max-lines <n>`         | no       | —                  | For --action app-log / search: max lines printed to stdout (JSON output and `--output` files are complete) |
| `--max-chars <n>`         | no       | —                  | For --action app-log / search: max characters printed to stdout |
| `--refresh`               | no       | false              | For --action device-profile: force re-detection (bypass cache) |
| `--max-age <age>`         | no       | —                  | For --action device-profile: max cache age before re-detecting |
| `--symptoms <text>`       | no       | —                  | For --action investigate: free-text symptom description (e.g., "300% cpu, video not playing") |
| `--profile <profiles>`    | no       | —                  | For --action investigate: comma-separated profile names (e.g., crash,performance). Overrides --symptoms. |
| `--budget <n>`            | no       | —                  | For --action investigate: max number of probe bundles to run |
| `--budget-tokens <n>`     | no       | —                  | For --action investigate: max tokens for the report |
| `--allow-network-probe`   | no       | false              | For --action investigate: allow network-related probes |
| `--probe-id <id>`         | no       | —                  | For --action timeline: filter to a specific probe ID |

## One-shot log actions (plain "show / save / clear the logs")

| Request | Command | Then |
| --- | --- | --- |
| Show / tail the logs | `tizen-cli tizen-sdk dlog-analyzer --action log-dump [--serial <s>] [--filter "*:E"] [--lines 50]` | Present `result.output`; mention `result.dump_file` when `result.truncated` is true. |
| Save / export the logs | `tizen-cli tizen-sdk dlog-analyzer --action log-dump --output <file> --lines 0` | Report `result.dump_file`. |
| Clear the logs | `tizen-cli tizen-sdk dlog-analyzer --action log-clear [--serial <s>]` → `user_input_required` | Ask the user; after an explicit yes run `errors[0].suggested_fix.command` (same line with `--confirm`). |
| Find / grep a string in the collected logs ("search the logs for X", "which app logged X", 로그에서 X 찾아줘) | `tizen-cli tizen-sdk dlog-analyzer --action search --pattern "<X>" [--context 1] [--priority W] [--category <app-id>] [--regex] [--count]` | Present `result.output` (grep-like: `<category>:` lines are the matches). `no_logs` means nothing has been collected yet — start a collector first; the device buffer itself is `log-dump --filter`. |

These are not analysis tasks: no report, no background session unless the user asked to monitor.

## v0.1.3+ commands (app-log, search, device-profile, investigate, probe, snapshot, timeline, kernel)

These commands leverage the binary's v0.1.3+ capabilities for deeper investigation workflows (`search` needs v0.2.6+).

| Request | Command |
| --- | --- |
| Print full app log (all priorities) | `tizen-cli tizen-sdk dlog-analyzer --action app-log --app-id <id> [--since <time>] [--until <time>] [--priority <p>] [--tag <t>] [--keyword <k>] [--format json]` |
| Search every collected log for text | `tizen-cli tizen-sdk dlog-analyzer --action search --pattern "connection refused" [--context 1] [--priority W] [--since 10m]` |
| Search with a regex, one app only | `tizen-cli tizen-sdk dlog-analyzer --action search --pattern "Exception\|SIGSEGV" --regex --category <app-id> --context 2` |
| Count matches per category | `tizen-cli tizen-sdk dlog-analyzer --action search --pattern handshake --count` |
| Search, machine-readable | `tizen-cli tizen-sdk dlog-analyzer --action search --pattern "timeout\|refused" --regex --format json --max-matches 20` |
| Detect device profile | `tizen-cli tizen-sdk dlog-analyzer --action device-profile [--refresh] [--max-age <age>]` |
| One-shot investigation | `tizen-cli tizen-sdk dlog-analyzer --action investigate [--app-id <id>] [--symptoms <text>] [--profile <profiles>] [--budget <n>]` |
| List evidence probes | `tizen-cli tizen-sdk dlog-analyzer --action probe --subcommand list` |
| Run a specific probe | `tizen-cli tizen-sdk dlog-analyzer --action probe --subcommand run --app-id <probe-id>` |
| Create a snapshot | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand create` |
| List snapshots | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand list` |
| Compare snapshots | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand compare --app-id <id1> --output-dir <id2>` |
| Delete a snapshot | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand delete --app-id <id>` |
| Show timeline | `tizen-cli tizen-sdk dlog-analyzer --action timeline --subcommand show [--probe-id <id>]` |
| Generate timeline report | `tizen-cli tizen-sdk dlog-analyzer --action timeline --subcommand report` |
| Analyze timeline trends | `tizen-cli tizen-sdk dlog-analyzer --action timeline --subcommand analyze` |
| Export timeline to JSON | `tizen-cli tizen-sdk dlog-analyzer --action timeline --subcommand export --output <file>` |
| Collect kernel logs (background) | `tizen-cli tizen-sdk dlog-analyzer --action kernel --subcommand collect` |
| Stop kernel log collection | `tizen-cli tizen-sdk dlog-analyzer --action kernel --subcommand stop` |
| Analyze kernel logs | `tizen-cli tizen-sdk dlog-analyzer --action kernel --subcommand analyze` |

**Key details:**

- **`app-log`** requires `--app-id` and reads from previously collected log files (run `dlog-collect --app-id` first). Unlike `error-analyze` (E/F only), it returns the complete log — hot file plus decompressed cold rotations, in chronological order. It is an **escalation step**: run `error-analyze` (and `check` / `kernel analyze`) first and reach for `app-log` only when they do not explain the symptom, always with a filter — `--since`/`--until` for time windows, `--priority` for minimum level, `--tag`/`--keyword` for filtering. `--max-lines`/`--max-chars` limit stdout output only; JSON output and `--output` files are always complete.
- **`search`** (binary v0.2.6+, issue #254) finds plain text or a regex (`--regex`) in **every** collected dlog category at once — each app, `_general`, `_unparsed`; the kernel log is excluded — without knowing which app wrote it. A pattern is matched against each whole raw line (time, priority, tag, pid, message) and against the entry's stack-trace continuation lines, so a match returns the **whole entry** and a trace is never cut. Text output is grep-like: `<category>:` marks a match line, `<category>-` a context line (`--context` / `--after-context` / `--before-context` count whole entries), `--` separates non-adjacent groups. `--pattern` is required (several values: any one matches unless `--all`); narrow with `--category` (or `--app-id`), `--priority`, `--since`/`--until`, `--tag`; `--invert` selects non-matching entries; `--count` prints per-category totals only; `--format json` carries `total_matches` / `returned` / `truncated` (the envelope copies them to `result.total_matches` etc.); `--max-matches` defaults to 100. It reads the collected files only — no device, no serial — but something must have been collected first (`no_logs` otherwise). Use it when a finding or the user names a string ("find X in the logs", "which app logged X", "did Y ever appear") and to look around a known line with `--context`; it is not the first analysis call for a symptom (Rule 12) and not a substitute for `log-dump` when there is no string to look for. Never `grep` / `Select-String` the `.hot.log` files instead.
- **`device-profile`** detects and prints the connected device's profile (type, version, arch, root, tools). Uses a cache; `--refresh` forces re-detection, `--max-age` sets max cache age.
- **`investigate`** is the **first call of every symptom investigation**: it detects the device profile, resolves `--symptoms` (the user's own words) to profiles, runs the union of probe bundles, correlates with collected dlog/kernel findings, and renders a structured report. Pass `--profile` to override symptom resolution, `--app-id` for app-scoped investigation. `--budget`/`--budget-tokens` limit scope. `--allow-network-probe` enables network-related probes. It replaces hand-typed `sdb shell top / ps / free / cat /proc/meminfo`.
- **`probe list`** shows the data-driven probe catalog; **`probe run <probe-id>`** executes one probe on the device — the targeted follow-up measurement after the log analysis.
- **`snapshot`** creates/lists/compares/deletes system snapshots. `compare` takes two snapshot IDs.
- **`timeline`** requires a subcommand: `show` (display timeline), `report` (human-readable report), `analyze` (trend analysis), `export` (JSON file via `--output`).
- **`kernel collect`** starts the kernel-log collector (kmsg/dmesg) **in the background** — like `dlog-collect`, one instance at a time (`already_running` otherwise), writing `<sdk-data>/dloganalyzer/app/kernel/kernel.hot.log`; **`kernel stop`** stops it after the user reproduced the issue; **`kernel analyze`** analyzes the collected kernel log and prints deduplicated findings (OOM killer, driver errors, watchdog …). Start it alongside `start-monitoring` for CPU, freeze, memory, graphics/video and other platform-level symptoms. Never `sdb shell dmesg` / `cat /proc/kmsg` / `dlogutil -b kmsg`.

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
    "log_base_dir": "/home/user/tizen-sdk-data/dloganalyzer",
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
    "log_file": "/home/user/tizen-sdk-data/dloganalyzer/app/org.example.myapp/org.example.myapp.hot.log",
    "log_base_dir": "/home/user/tizen-sdk-data/dloganalyzer",
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

**Success (search --pattern):**

```json
{
  "command": "tizen-sdk dlog-analyzer search",
  "status": "success",
  "result": {
    "output": "_general: 10-01 18:52:05.914+0900 E/CONNECTION (P 1234, T 1234): connection refused (-111)\n_general- 10-01 18:52:05.920+0900 W/CONNECTION (P 1234, T 1234): retrying in 2s",
    "patterns": ["connection refused"],
    "categories": "all (kernel excluded)",
    "regex": false,
    "log_base_dir": "/home/user/tizen-sdk-data/dloganalyzer",
    "matched": true,
    "message": "Matching entries for [\"connection refused\"] (match lines are \"<category>:\", context lines \"<category>-\")."
  }
}
```

With `--format json` the envelope adds `total_matches`, `returned` and `truncated` (and `result.output` is the binary's JSON document with structured entries); with `--count` it adds `total_matches` only. When nothing matches the status is still `success` and `message` starts with `No entry matches`. Without any collected logs: `status: failure`, `errors[0].category: "no_logs"`.

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

## Final report — the only accepted shape

The report is `REPORT_TEMPLATE.md` (next to this SKILL.md; severity guide and English→Korean label mapping are there). Render **one block only** — the Korean block if the user wrote in Korean, the English block otherwise. Its skeleton, so the shape is never improvised (the `check` / `error-analyze` / `kernel analyze` envelopes restate it in `result.report_format`):

English block — when the user wrote in English or in any non-Korean language:

```markdown
## Analysis Report (English)

### 0. Summary
(fenced block, four `Label: value` lines) Date: … / Emulator/Device: <name> (<device_serial>) / App: <app_id, or "system-wide"> / Issue: <the user's own words>

### 1. Root Cause
- **[Severity: Critical|High|Medium|Low] —** one-sentence cause, most severe first
  - Evidence: <short quoted log tag/message>
  - Occurrences: <count, if reported>

### 2. Additional Findings
### 3. Solution Suggestions
- **Code available:** … / - **Code not available:** …
### 4. Workarounds

Next step? (a) keep monitoring, (b) apply the suggested fix and retest, (c) stop and clean up.
```

Korean block — when the user wrote in Korean. Render this **instead of** the English block, never after it:

```markdown
## 분석 보고서 (한국어)

### 0. 요약 (날짜 / 에뮬레이터/디바이스 / 앱 / 이슈)
### 1. 근본 원인 (- **[심각도: 심각|높음|중간|낮음] —** … / 근거 / 발생 횟수)
### 2. 추가 발견 사항
### 3. 해결 방안 제안 (코드가 있는 경우 / 코드가 없는 경우)
### 4. 임시 해결 방법

다음 단계를 선택해 주세요: (a) 모니터링 계속, (b) 제안된 수정 적용 후 재테스트, (c) 종료 및 정리.
```

The first line of the report is `## Analysis Report (English)` or `## 분석 보고서 (한국어)` depending on the user's language; the headings are exactly these; every finding is a bullet. **Not** this: a title of your own (`## 🔍 Investigation Report: …`), emoji or "Root Causes Identified" headings, a `| Finding | Source | Severity |` table, a trailing "Summary" section, a bilingual (English + Korean) report. Exactly one language block is rendered, never both.

## Rules

1. **Never run `sdb dlog` — or any `sdb` diagnostic — yourself; every log and evidence operation goes through this command.** Continuous collection is `dlog-collect` (the native binary's own subcommand) — for a specific app (`--action dlog-collect --app-id <id>`) or the whole system (`--action start --subcommand dlog-collect` / `start-monitoring`); the kernel log is `--action kernel --subcommand collect`. A one-shot view/save is `--action log-dump`; clearing the buffer is `--action log-clear`. Do not shell out to `sdb shell dlog`, `sdb dlog -d`, `sdb dlog -c`, `sdb shell dmesg`, `sdb shell top/ps/free` by hand, and do not route them through `sdb-helper` shell requests either.
2. **Always analyze through `error-analyze` (app-specific), `check` (system-wide monitoring) and `kernel analyze` (kernel) — never by reading the log file directly.** These commands handle deduplication, classification, and formatting that raw log text does not. Do not `grep` / `Select-String` / `rg` the collected files either — looking for a specific string is `--action search --pattern "<text>"` (whole entries, every category, stack traces intact). (A plain "show me the logs" is not analysis — answer it with `log-dump`, whose `result.output` is meant to be shown.)
3. **After starting any continuous command** (`--action start` with any subcommand, `--action dlog-collect --app-id <id>`, `--action kernel --subcommand collect`), **end your turn and ask the user** to browse the app / reproduce the issue, then choose:
   - **Done — the error/crash/symptom occurred**, or
   - **Nothing happened**

   (for an open-ended monitoring session: **Continue** vs **Stop and analyze now**). Do not poll, loop or `sleep` waiting for a crash, and do not run `stop-collect` / `stop` / `kernel stop` / `check` / `error-analyze` in the same turn as the start — present the choice and wait for the user's reply. The reproduction window belongs to the user; a timer is not a substitute for their answer.
4. Prefer `start-monitoring` for general "something's wrong with my app" reports (it self-detects crashes). Use the app-specific `dlog-collect --app-id` + `error-analyze --app-id` pair when the user names a specific app and wants non-fatal runtime-error triage; for a named app with a symptom run **both** plus `kernel collect`.
5. Start monitoring/collection **before** launching or reproducing the issue in the app, so startup and early failures are captured.
6. **Once the analysis task is fully complete** — the last planned `check`/`error-analyze` call has returned and no further collection/analysis step remains before handing control back to the user — read `REPORT_TEMPLATE.md` (next to this SKILL.md) and render the report in that exact structure — the skeleton under "Final report — the only accepted shape" above — **once, in the language the user wrote in: Korean (한국어) if the user wrote in Korean, English otherwise (including any third language).** Technical identifiers (app IDs, device serials, dlog tags, quoted log lines, file paths, function names, code) stay verbatim. Do not paste raw tool output or improvise a format (no own title, no emoji headings, no tables). A `check`/`error-analyze` result that is only an intermediate step in a larger in-progress sequence (e.g. still deciding whether to relaunch the app and collect again) does not by itself trigger the report. Re-render the full report (not a diff) on each subsequent analysis pass, e.g. after the user applies a fix and reproduces the issue again. If `REPORT_TEMPLATE.md` cannot be found, use this section order: Summary (Date, Emulator/Device, App, Issue), Root Cause, Additional Findings, Solution Suggestions, Workarounds — or in Korean: 요약 (날짜, 에뮬레이터/디바이스, 앱, 이슈), 근본 원인, 추가 발견 사항, 해결 방안 제안, 임시 해결 방법.
7. **Build the report only from the tool result already returned and prior conversation context.** Do not run additional commands (device info, sdb, system diagnostics, etc.) to gather more evidence before rendering — if something isn't already known, say so in the relevant field/section rather than fetching it. Never invent a value (e.g. a device name) that isn't already known.
8. **After presenting the report**, end with a short next-step prompt to the user (continue monitoring, apply a suggested fix and retest, or stop) **in the same language as the report**. A plain one-shot request (`log-dump` / `log-clear`) is not an analysis task and does not trigger the report.
9. **`log-clear` is confirmation-gated.** Without `--confirm` the command refuses with `user_input_required` and does nothing. Ask the user, and only after an explicit "yes" re-run `errors[0].suggested_fix.command` (the same line with `--confirm`). Never pass `--confirm` pre-emptively, never run `sdb dlog -c` yourself.
10. **Kernel logs go through `--action kernel --subcommand collect` → `stop` → `analyze`.** Start the kernel collector together with `start-monitoring` for CPU, freeze, memory, graphics/video and other platform-level symptoms; analyze it with the rest. Never `sdb shell dmesg` / `cat /proc/kmsg` / `dlogutil -b kmsg`.
11. **Evidence comes from `investigate` and `probe`, not from hand-typed `sdb shell` diagnostics.** Every symptom investigation opens with `--action investigate --symptoms "<the user's words>" [--app-id <id>]`; one more measurement is `--action probe --subcommand run --app-id <probe-id>` (`--subcommand list` shows the catalog). `top`, `ps`, `free`, `/proc/meminfo`, `/proc/<pid>/status` over sdb — directly or via an `sdb-helper` shell request — are the detour this rule forbids.
12. **Analysis order: errors first, full log last.** `error-analyze --format summary` → `check` → `kernel analyze` → only if still unexplained `error-analyze --format details` → `search --pattern "<the string a finding or the user named>" --context 1` → filtered `app-log` → `probe run`. Never open with `app-log`, and never run it unfiltered as the first look. `search` is the targeted step: it needs a string to look for; with one in hand it beats paging through `app-log`.
13. **Routing.** A problem report that mentions the emulator or a device is still this command's job — not `device-manager` (discovery / emulator stop only) and not `sdb-helper`. Only when this command returns `device_not_found` do you send the user to `launch-emulator`.

## Boundary

**In scope:** viewing, tailing, saving, and clearing device/emulator logs on request (`log-dump`, `log-clear`); collecting logs (system-wide or app-specific), analyzing them for crashes/exceptions/runtime errors, applying fixes, rebuilding, reinstalling, relaunching, and re-analyzing to verify the fix. Also: launching/terminating apps as needed to reproduce an issue. Additionally: printing the full collected app log (`app-log`), searching every collected log for text or a regex (`search`), detecting the device profile (`device-profile`), running one-shot investigations (`investigate`), listing/running evidence probes (`probe`), creating/comparing/deleting system snapshots (`snapshot`), viewing probe timeline history (`timeline`), and collecting/analyzing kernel logs (`kernel`).

**Out of scope (use other skills):**
- Launching an emulator → `tizen-cli tizen-sdk launch-emulator`
- Interactive debugging → `tizen-cli tizen-sdk gdb-debug` (Native) or `tizen-cli tizen-sdk dotnet-debug` (.NET)

## Important notes

- **Only one system-wide `start` instance at a time.** If already running, `start` returns an `already_running` error. Stop first (`--action stop`).
- **A `warnings` entry about `UnicodeEncodeError` is not a failure.** On Windows the native binary writes through the system code page (e.g. cp949) and can crash on a character outside it after it has already printed its whole report; `investigate`, `probe`, `error-analyze` and the other one-shot actions then return `status: success` with the printed output and that warning. Use the output as is. Do **not** retry with `chcp 65001` or `PYTHONUTF8` / `PYTHONIOENCODING` — the binary ignores both.
- **One dlog collector overall, enforced by the binary's lock** (`<log-dir>/_meta/collector.lock`, holding the owner's PID). `start` also returns `already_running` while `dlog-collect` runs (`--action stop-collect` first) or when any other collector holds the lock; the envelope names the holder PID and the command that stops it. A holder this runner is not tracking is a collector from an earlier session that outlived its PID file — the runner confirms the PID still belongs to a `tizen-dlog-analyzer` process, then says to terminate it (and its child `sdb dlog --monitor`) and re-run. **Never delete the lock file while its holder runs**: it is live on the same dlog buffer. Only when the envelope says the PID now belongs to a different process (stale lock) may it be removed, after checking that no `tizen-dlog-analyzer` process is running.
- **`stop` keeps the session's analysis.** Its envelope carries the last 200 captured lines (`result.output`, `total_lines`, `truncated`) and `--action check` returns the whole file afterwards — the output file is only truncated by the next `start`. While `start` runs, `dlog-collect --app-id` returns `already_running` naming the monitor as the lock holder; the envelope then tells you to analyze the system-wide capture with `check` rather than stop the monitor mid-reproduction.
- **Only one app-specific `dlog-collect` instance at a time.** Same rule — `stop-collect` first.
- **Only one `kernel collect` instance at a time.** Same rule — `kernel stop` first.
- **The binary is platform-specific.** The setup script copies only the matching `linux/`, `macos/`, or `windows/` binary.
- **All three background processes are detached** and survive the agent session ending. Always stop them when done.
- **Where logs are stored.** The native binary has no `--base-dir` option. Every command resolves one log base directory from the SDK configuration: `~/.tizen.sdk.path.config` names the SDK, `TIZEN_SDK_DATA_PATH` in `<sdk>/sdk.info` (or the `<sdk>-data` sibling) names the data directory, and logs go to `<sdk-data>/dloganalyzer/` — app-specific logs at `<sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log`. The envelope reports the path as `result.log_base_dir` / `result.log_file`. If the SDK path is not configured or points to a directory that no longer exists, `start`, `dlog-collect`, `error-analyze`, `app-log` and `search` fail with `sdk_path_not_set` — run `tizen-cli tizen-sdk sdk-init --sdk-path <path>` first. Only the runner's PID files, captured stdout and the `log-dump` file stay in `$TMPDIR/tizen-dlog-analyzer/`.
- **`dlog-collect --app-id` requires the app to be running** — it looks up the PID via `pgrep`/`ps` (with fallbacks). If the PID cannot be resolved, collection still starts and the native binary resolves it; if the app is truly not running, the collector exits and a `process_crashed` error is returned.
- **App IDs are validated** (`[A-Za-z0-9._-]` only) before any app action runs; anything else returns `invalid_parameters`.
- **`error-analyze` requires `dlog-collect --app-id` (then `stop-collect`) to have been run first** — it reads from the collected log file. If no logs are found, it returns a `no_logs` error.
- **`error-analyze` output is plain text (not Rich tables)** — the summary is one line per finding (`N. Module=TAG | Repeated=X | Message: ...`), and the details section shows `[Error N]` blocks with `Full log:` lines. This format is optimized for AI-agent consumption (token-efficient, no wrapping).
- **`log-dump` / `log-clear` need no native binary** — only sdb and a connected device. `log-dump` always writes the complete dump to `result.dump_file`; `result.output` is only the tail. `log-clear` does not stop running collectors (a `warnings` entry says so); lines they already collected stay in their files.
- **`app-log` reads from previously collected log files** — run `dlog-collect --app-id <id>` (then `stop-collect`) first. If no logs are found, it returns a `no_logs` error. Unlike `error-analyze` (E/F only), `app-log` returns the complete log (all priorities, hot + cold files).
- **`search` reads the collected files, not the device.** No serial and no running collector are needed, but something must have been collected under `<sdk-data>/dloganalyzer/app/` (`no_logs` otherwise, naming the missing directory). Matching is case-insensitive by default; the kernel log is never searched (`kernel analyze` covers it); `--max-matches` defaults to 100 and `result.truncated` says when it cut the result. Exit code 0 also when nothing matches — the envelope then says `No entry matches …`. A missing SDK path fails it with `sdk_path_not_set` like the other log readers. Requires the bundled binary v0.2.6 or newer (`Unknown command 'search'` otherwise — update the plugin).
- **`investigate` is a one-shot command** — it detects the device profile, resolves symptoms to profiles, runs probes, correlates findings, and exits. It does not run in the background. Use `--symptoms` for free-text description or `--profile` to override symptom resolution.
- **`timeline` requires a subcommand** — `show`, `report`, `analyze`, or `export`. Without a subcommand, the action fails.
- **`kernel collect` is long-running and therefore runs in the background** (detached, PID file under `<tmp>/tizen-dlog-analyzer/`). Stop it with `kernel stop` after the user reproduced the issue, then `kernel analyze` the collected file. A missing SDK path fails it with `sdk_path_not_set` like the other collectors.

## Follow-ups

- Launch an emulator → `tizen-cli tizen-sdk launch-emulator`
- Debug a native crash interactively → `tizen-cli tizen-sdk gdb-debug`
- Debug a .NET crash interactively → `tizen-cli tizen-sdk dotnet-debug`
