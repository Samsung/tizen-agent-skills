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

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-remote-device` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-remote-device`)
2. 사용자의 요청을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*remote-device-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\remote-device-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" scan
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" scan
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/remote-device-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/remote-device-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" scan
```

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
node "$CLI" connect <ip[:port]> [--port N]                # sdb connect over network
node "$CLI" disconnect <ip[:port]> [--port N]              # sdb disconnect
node "$CLI" list                                           # remote (<ip>:<port>) sdb connections
node "$CLI" add <ip[:port]> --name <name> [--port N]       # bookmark device in Device Manager's list
node "$CLI" remove <ip[:port]> [--port N]                  # remove that bookmark
node "$CLI" edit <ip[:port]> [--name N] [--new-ip IP] [--new-port N]   # change a bookmark's name/ip/port
node "$CLI" list-saved                                      # read back the bookmarked list
```

1. **scan** — sweeps every local /24 subnet (or the given `subnet` prefix like `192.168.1`) with parallel TCP probes against SDB port 26101 (default). Devices answering are Tizen devices in developer mode. Takes ~3 seconds. Works **without** the SDK installed.
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
**Success result (list-saved):** `result.devices` = `[{ name, ip, port }]`.

**Note:** The device must have developer mode enabled and be on the same network. If scan finds nothing, ask the user for the device's IP and run the runner's `connect <ip>` action with it (never a raw `sdb connect`). Bookmarking (add/remove/edit/list-saved) is independent of sdb connection state — it only edits Device Manager's saved list, it does not connect/disconnect anything. To rename an existing bookmark, prefer `edit` over remove+add — it keeps the entry's position in the list.

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Handoff

- **Single-task** (e.g., "네트워크에서 TV 찾아줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "TV 연결하고 앱 설치해줘") → scan → connect → continue with `result.device_serial`.
- SDK not installed (connect/disconnect/list fail) → `tizen-sdk-install`, then `tizen-sdk-init`
- USB device / emulator instead → `tizen-device-manager`

**Suggested next steps (only when user asks):**
- `tizen-install-app` (install app on the connected remote device)
- `tizen-file-transfer` (push/pull files)
- `tizen-sdb-helper` (logs, screenshot, shell on the device)
