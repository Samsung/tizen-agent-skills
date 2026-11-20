---
name: tizen-remote-device
description: Tizen remote device search, 원격 디바이스 검색, 네트워크 스캔, network scan, find Tizen TV on network, connect to <ip>, connect to 192.168.x.x, connect device by IP, connect 192.168.1.100, sdb connect, sdb connect over wifi, IP로 연결, 디바이스 연결 <ip>, 원격 디바이스 연결, remote device connect, disconnect remote device, disconnect 192.168.x.x, scan for Tizen devices, bookmark remote device, save remote device, 원격 디바이스 저장, remote device list add remove edit, rename remote device, 원격 디바이스 이름 변경. Use this skill to search the local network for Tizen devices (TCP sweep of SDB port 26101), connect/disconnect them via sdb over the network instead of USB, and to add/edit/remove/list bookmarked devices in Tizen Studio Device Manager's remote device list. Any "connect to <IP address>" request ROUTES HERE — run the runner's `connect` action; NEVER locate sdb or type `sdb connect` yourself.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-27"
  keywords:
    - Tizen remote device
    - network scan
    - device search
    - sdb connect
    - sdb over wifi
    - remote device bookmark
    - 원격 디바이스
    - 네트워크 스캔
    - 디바이스 검색
---

### Claude Code (subagent delegation)

> If you have no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-remote-device` agent with the Agent tool (personal deployment or `tizen-sdk-skills:tizen-remote-device`)
2. Pass the user's request as the prompt
3. Pass the subagent's JSON envelope to the user as-is — follow the "Result reporting" rules below
   (include the verbatim text in a fenced `json` block, with only a 1–2 line summary below it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/remote-device-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" scan
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\remote-device-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" scan
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" scan
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

### Codex CLI — slow scans as a job (one exec call waits ≤ 30 s)

A `scan` with the default 3 s probe timeout finishes in seconds, but `--timeout` up to 30000 ms
plus the sdb listing can pass Codex's 30 s per tool call (issue #48). For a large `--timeout`
add **`--background`** and poll `node "<same lib/cli dir>/job-cli.js" wait --id <job_id>`
(≤ 25 s per call) until `job.state` is `done` — that response **is** this runner's envelope.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: the network scan and `sdb connect` need TCP sockets, and the bookmark list lives under `<sdk>-data`, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Actions

**✅ ALWAYS use the runner below — NEVER search for the sdb binary or run `sdb connect` / `sdb disconnect` / `sdb devices` yourself.** The runner resolves sdb from the SDK, connects with retry, and verifies the device state (issue #96).

```
node "$CLI" scan [subnet] [--port N] [--timeout MS]       # search network for Tizen devices
node "$CLI" scan [--connected-only] [--saved-only]         # probe only this PC's sdb-connected / bookmarked devices
node "$CLI" connect <ip[:port]> [--port N]                # sdb connect over network
node "$CLI" disconnect <ip[:port]> [--port N]              # sdb disconnect
node "$CLI" list                                           # remote (<ip>:<port>) sdb connections
node "$CLI" add <ip[:port]> --name <name> [--port N]       # bookmark device in Device Manager's list
node "$CLI" remove <ip[:port]> [--port N]                  # remove that bookmark
node "$CLI" edit <ip[:port]> [--name N] [--new-ip IP] [--new-port N]   # change a bookmark's name/ip/port
node "$CLI" list-saved                                      # read back the bookmarked list
```

1. **scan** — sweeps every local /24 subnet (or the given `subnet` prefix like `192.168.1`) with parallel TCP probes against SDB port 26101 (default). Devices answering are Tizen devices in developer mode. Takes ~3 seconds. Works **without** the SDK installed. A sweep finds every such device on the subnet, not just the user's: when the user wants only their own devices ("내 것만", "연결된 것만", "my devices"), pass `--connected-only` (the remote devices `sdb devices` lists as `device`) and/or `--saved-only` (the bookmarked list; needs the SDK path). Then only those hosts are probed, each on its own port (a non-default `--port` is ignored with a warning), and no other address is touched; `--connected-only` alone fails with `sdk_path_not_set` when sdb is unavailable; `result` carries `only`, `hosts_probed`, `device_count` and `devices[]` (bookmarks add `name`).
2. **connect** — `sdb connect <ip>:<port>` with retry + verification via `sdb devices` (entry must be `device`, not `offline`). Requires SDK (`tizen-sdk-init`).
3. **disconnect** — `sdb disconnect <ip>:<port>`, verified.
4. **list** — remote entries of `sdb devices` (serials shaped `<ip>:<port>`).
5. **add** — bookmarks `<name>/<ip>/<port>` in Tizen Studio Device Manager's `remote_device_scan.list` (same file the Device Manager GUI's "Remote Device Manager" dialog reads/writes), so the device shows up there too. Rejects duplicates by `<ip>:<port>`. Does not *run* sdb, but needs to *find* it (see below).
6. **remove** — removes a bookmarked `<ip>:<port>` entry from that same list.
7. **edit** — updates an existing bookmark in place. The positional `<ip>` (plus `--port`) locates the **current** entry; `--name` sets a new display name, `--new-ip` / `--new-port` move it to a different address. At least one of the three is required, and the resulting `<ip>:<port>` must not already belong to another bookmark. The envelope returns both the new values and a `previous` object.
8. **list-saved** — reads back the bookmarked list as `[{ name, ip, port }]`.

### How the list file is located

`remote_device_scan.list` is **never** hardcoded — it is derived from the SDK
that is actually installed, so it works on any drive or install directory:

1. SDK root = the configured SDK path (`~/.tizen.sdk.path.config`, default `~/tizen-sdk`) if that directory holds `sdk.info` or `tools/sdb[.exe]`.
2. Otherwise (stale or missing config) SDK root = two levels up from the sdb on `PATH`. If neither yields an SDK, the command fails with `sdk_path_not_set` rather than inventing a data directory.
3. Data dir = `TIZEN_SDK_DATA_PATH` from `<sdk-root>/sdk.info` (authoritative — written by the SDK installer, read by Tizen Studio itself).
4. If there's no `sdk.info`, fall back to the sibling convention `<sdk-root>-data` (e.g. `D:\tools\tizen-studio` → `D:\tools\tizen-studio-data`).
5. List file = `<data-dir>/device-manager/config/remote_device_scan.list`.

Every add/remove/edit/list-saved envelope reports the resolved `list_path` and
`sdk_root` — **check these** if the entry doesn't show up in the Device Manager
GUI. If they point at a different SDK than the one your GUI runs from, the user
has more than one Tizen SDK installed; re-point the config with `tizen-sdk-init`.

Exit code: `0` = success envelope, `1` = failure/error envelope (JSON on stdout).

**Success result (scan):** `result.devices` = `[{ ip, port, status: connected|disconnected }]`, plus `subnets_scanned`, `device_count`.
**Success result (connect):** `result.device_serial` = `<ip>:<port>` — use this serial with other skills (install-app, file-transfer, sdb-helper).
**Success result (add/remove/edit):** `result.device_count` = entries remaining in the bookmark list, `result.list_path` = resolved path to `remote_device_scan.list`, `result.sdk_root` = the SDK the path was derived from. `edit` additionally returns the updated `name`/`ip`/`port` and `result.previous` = the values before the change.
**Success result (list):** `result.devices` = `[{ device_serial, ip, port, status }]` (`status`: `connected`, or the sdb state such as `offline`), `result.device_count` (all remote entries) and `result.online_count` (entries in the `device` state, the only ones a command can target).
**Success result (list-saved):** `result.devices` = `[{ name, ip, port }]`.

**Note:** The device must have developer mode enabled and be on the same network. If scan finds nothing, ask the user for the device's IP and run the runner's `connect <ip>` action with it (never a raw `sdb connect`). Bookmarking (add/remove/edit/list-saved) is independent of sdb connection state — it only edits Device Manager's saved list, it does not connect/disconnect anything. To rename an existing bookmark, prefer `edit` over remove+add — it keeps the entry's position in the list.

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

- **Single-task** (e.g., "네트워크에서 TV 찾아줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "TV 연결하고 앱 설치해줘") → scan → connect → continue with `result.device_serial`.
- SDK not installed (connect/disconnect/list fail) → `tizen-sdk-install`, then `tizen-sdk-init`
- USB device / emulator instead → `tizen-device-manager`

**Suggested next steps (only when user asks):**
- `tizen-install-app` (install app on the connected remote device)
- `tizen-file-transfer` (push/pull files)
- `tizen-sdb-helper` (logs, screenshot, shell on the device)
