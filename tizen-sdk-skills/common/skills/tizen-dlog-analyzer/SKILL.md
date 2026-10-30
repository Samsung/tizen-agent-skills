---
name: tizen-dlog-analyzer
description: Investigate live Tizen app, emulator or device problems — crashes, errors, freezes, high CPU, memory growth, slow performance, video/audio not playing, root cause, 원인 분석, 앱이 죽어요, 멈춤, 느려요, 재생 안됨. Requires fresh log collection, app launch, and a user reproduction reply before the final diagnosis; investigate/probe alone stays preliminary even when confirmed. Also view, tail, save, clear or search dlog and kernel logs (dmesg), detect exceptions, and analyze saved logs — 로그 보기, 로그 저장, 로그 지우기, 로그 검색. Owns problem reports even when the emulator/device is mentioned; device-manager only lists devices or stops emulators. Use the shipped runner for investigate, probe, monitoring, app launch, collection and analysis; never hand-type sdb diagnostics.
version: 1.4.0
when_to_use: The user reports ANY problem, crash, freeze, error, high CPU or memory usage, slow or laggy emulator, video/audio not playing, or unexpected behavior of a Tizen app or device — "my app crashed", "the emulator CPU went to 300% and the video does not play", "something's wrong with my app", "why did it stop working", "investigate this issue", 원인 분석해줘 — or asks to monitor/investigate Tizen logs, wants root-cause analysis, wants app-specific log collection filtered by app ID, or runtime-error analysis for a specific app. Route here FIRST even when the sentence mentions the emulator or device (the analyzer's runner detects the device itself; tizen-device-manager is only for "which devices are connected?" / "stop the emulator"). Do not ask the user to run raw sdb/dlog commands themselves. ALSO route here when the user simply wants to see, tail, save/export, or clear the device or emulator logs with no problem reported ("show me the logs", "로그 보기", "save the dlog", "clear logs" / "dlog clear", "로그 지우기") — tizen-sdb-helper returns a handoff for these; run log-dump / log-clear here.
inputs:
  - name: action
    description: One of log-dump, log-clear, start, stop, check, status, app-launch, app-terminate, dlog-collect, stop-collect, error-analyze, app-log, search, device-profile, investigate, probe, rules, snapshot, timeline, kernel. 'log-dump' dumps the device dlog buffer once (sdb dlog -d) — the answer to "show/tail/save the logs"; 'log-clear' clears the device dlog buffer (sdb dlog -c) — destructive, requires confirm; 'start' launches monitoring in background, 'stop' kills it, 'check' retrieves analyzed output, 'status' checks if still running, 'app-launch' launches a Tizen app, 'app-terminate' terminates an app, 'dlog-collect' starts background app-specific log collection by PID, 'stop-collect' stops the background app log collection, 'error-analyze' analyzes collected logs for E/F priority errors, 'app-log' prints the full collected log for one app (all priorities, hot + cold files) — escalation only, after error-analyze, 'search' finds plain text or a regex in every collected dlog category at once (each app, _general, _unparsed; kernel excluded) and returns whole entries with their stack-trace lines — the answer to "find this string in the logs" / "which app logged this", 'device-profile' detects and prints the device profile, 'investigate' runs preliminary symptom-matched probes (pass the app id for app-scoped); it does not launch the app or complete the required collection and user reproduction workflow, 'probe' lists and runs evidence probes, 'rules' lists, shows, validates, and tests analysis rules, 'snapshot' creates/lists/compares/deletes system snapshots, 'timeline' shows probe history across snapshots (show/report/analyze/export), 'kernel' collects (background), stops and analyzes kernel logs.
  - name: subcommand
    description: For 'start' — one of dlog-collect, exception-detect, start-monitoring (recommended). For 'kernel' — collect, stop, analyze. For 'probe' — list, run. For 'rules' — list, show, validate, test.
  - name: app-id
    description: Tizen app ID (e.g. org.example.myapp). Required for app-launch, app-terminate, dlog-collect, error-analyze and app-log; optional for investigate (app-scoped).
  - name: symptoms
    description: For investigate only. The user's own symptom words, e.g. "300% cpu, video not playing". Selects the probe bundles to run.
  - name: pattern
    description: For search only (required there). One or more texts to look for, passed positionally after `search` (any one matches unless --all); add --regex for a Python regular expression. Case-insensitive unless --case-sensitive. Narrow with --category <app-id|_general|_unparsed> (comma-separate several), --priority <V|D|I|W|E|F>, --since/--until, --tag; widen the view with --context <n> (whole entries before and after each match); --count gives only per-category totals; --format json adds total_matches / returned / truncated; --max-matches (default 100) caps the matches returned.
  - name: format
    description: For error-analyze only. One of summary (summary lines only), details (detail entries only), or omit for both.
  - name: serial
    description: Optional sdb device serial, passed positionally in the `[serial]` slot of each command (not as a `--serial` flag). Defaults to the only attached device. Required when multiple devices are connected — the runner returns a `multiple_devices` error with a device listing if omitted.
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

## Required for a live symptom report

`investigate` is preliminary evidence, even when it returns `confidence: confirmed`.
For a current app/device problem, complete the investigation workflow below:
start fresh collection → launch the named app under observation → ask the user
to reproduce and **end the turn** → wait for their reply → stop and analyze the
capture. Do not finish with an `investigate`/`probe`-only root-cause report.

An app already running is not a reproduction. Preserve its current state only
when the user requests it; still collect fresh logs and ask for reproduction.
If launch or collection fails, report that failure and resolve it before
claiming collection is ready. If the user explicitly requests saved-log-only
analysis or declines live reproduction, analyze the available evidence and
state that the current issue was not reproduced; keep causal claims provisional.

## Resolving the CLI runner — do this first

The runner is **not inside this skill folder**. The skill folder (`~/<host-dot-dir>/skills/tizen-dlog-analyzer/` — `~/.cline/skills/…` in Cline, `~/.claude/skills/…` in Claude Code, `~/.agents/skills/…` for Codex) holds only `SKILL.md` and `REPORT_TEMPLATE.md`; the runner is `~/<host-dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/lib/cli/dlog-analyzer-cli.js`. Do not `find` or `ls` the skill folder and do not walk the dot-dir looking for it — run the lookup block for your shell below, verbatim.

All three blocks resolve the **same file**: `<host-dot-dir>` is the harness you run in (`.claude` when `CLAUDECODE` is set, `.gemini` for `GEMINI_CLI`, `.codex` for `CODEX_*`, otherwise `.cline`), falling back to the other hosts' caches only when yours has no copy, and `<VERSION>` is the highest **numeric** version directory (`1.10.0` > `1.3.1`). Bash and PowerShell make both choices for you and leave the path in `$CLI`; cmd.exe cannot version-sort, so it only lists every copy — you pick your own host's highest version and paste it into the `node "<found-path>"` step.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dlog-analyzer-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dlog-analyzer-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" investigate --symptoms "<the user's words>" <app-id>

# Report template (cat "$TEMPLATE" right before rendering the final report — see Rule 6):
TEMPLATE=$(ls "$HOME"/.{claude,cline,codex,gemini}/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md "$HOME"/.agents/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md 2>/dev/null | head -1)
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\dlog-analyzer-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" investigate --symptoms "<the user's words>" <app-id>
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*dlog-analyzer-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*dlog-analyzer-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*dlog-analyzer-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*dlog-analyzer-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" investigate --symptoms "<the user's words>" <app-id>
```

Every `node "$CLI" …` line below means that path. On Windows the report template is `%USERPROFILE%\.cline\skills\tizen-dlog-analyzer\REPORT_TEMPLATE.md`.

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/dlog-analyzer-cli.js`, and the template at `common/skills/tizen-dlog-analyzer/REPORT_TEMPLATE.md`.)

## Goal

Own every device/emulator log request on Tizen **and every problem report about a Tizen app, emulator, or device**. Three layers, one entry point:

- **One-shot** — `log-dump` (view / tail / save the current dlog buffer, optional tag/priority filter) and `log-clear` (clear the buffer, confirmation-gated). These are plain `sdb dlog` operations run by the runner, so the agent never types `sdb` itself.
- **Continuous** — collect logs with the `tizen-dlog-analyzer` binary (system-wide `start-monitoring`, app-scoped `dlog-collect <app-id>`, kernel `kernel collect`), detect crashes/exceptions/runtime errors, and offer solutions.
- **Evidence** — `investigate --symptoms "…"` runs the probe bundles that match the user's symptom (CPU, memory, freeze, media, graphics, network …) and correlates them with the collected dlog/kernel findings; returns ranked **conclusions** (confidence, role, evidence, fix), **ruled_out** hypotheses, **unexplained** anomalies, **consent_needed** for skipped network probes, and a **redaction_summary** (corporate cert details, paths, URLs, IPs, MACs are masked). `probe list` / `probe run <id>` run one probe on demand; `rules list` / `rules show <id>` / `rules validate` / `rules test <fixture.json>` manage the 24 analysis rules in 15 YAML files; `device-profile`, `snapshot`, `timeline` round it out.
- **Search** — `search "<text>"` (binary v0.2.6+) finds plain text or a regex (`--regex`) in **every** collected dlog category at once — each app, `_general`, `_unparsed` (kernel excluded) — without knowing which app wrote it, and returns whole entries including their stack-trace continuation lines. It is the answer to "find this string in the logs", "which process logged X", "did Y ever appear" — never `grep`/`Select-String` on the `.hot.log` files.

This is the default tool for **any** Tizen issue report, not only requests that explicitly mention dlog. `tizen-sdb-helper` hands every log intent (tail/show/save/clear logs, kernel log / dmesg) off to this skill; its handoff envelope carries a `result.note` naming the action to run.

## Routing — this skill, not `tizen-device-manager` or a hand-typed `sdb`

A symptom report is an investigation even when it mentions the emulator or the device:

> "While running a video in com.samsung.fh.youtube in the Tizen emulator the host CPU went to 300% and the video is not playing. Investigate."

That sentence names an app, a symptom (CPU, playback) and asks for an investigation — it belongs **here**. `tizen-device-manager` only answers "which devices are connected?" and "stop the emulator"; it cannot analyze anything, and this runner already detects the device itself (it returns `device_not_found` / `multiple_devices` when that is the problem). Likewise never fall back to `tizen-sdb-helper` shell commands (`top`, `ps`, `dmesg`, `dlog`) to "have a quick look" — every one of those has a runner action below (`investigate`, `probe run`, `kernel collect`, `log-dump`), and the hooks deny the raw forms.

## Boundary

In scope: viewing, tailing, saving, and clearing device/emulator logs on request; investigating a reported symptom with evidence probes; collecting logs (system-wide, app-specific, kernel), analyzing them for crashes/exceptions/runtime errors, applying fixes, rebuilding, reinstalling, relaunching, and re-analyzing to verify the fix. Also: launching/terminating apps as needed to reproduce an issue.

Out of scope:
- Launching an emulator — use `tizen-launch-emulator` first (only when the runner reports `device_not_found`).
- Interactive debugging — use `tizen-gdb-debug` (Native) or `tizen-dotnet-debug` (.NET).

## Prerequisites

1. **A running emulator or connected device.** Use `tizen-launch-emulator` before starting. The analyzer needs a live sdb connection.
2. **The tizen-dlog-analyzer binary** must be installed (copied by the setup script to the plugin cache next to the runner — see "Resolving the CLI runner" above).

## How it works

The `tizen-dlog-analyzer` binary has these long-running (non-terminating) subcommands:

| Subcommand         | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `dlog-collect`     | Continuously collect, classify, and store dlog from a device.  |
| `exception-detect` | Detect crashes from collected log files.                       |
| `start-monitoring` | Run dlog-collect + exception-detect in parallel (recommended). |
| `kernel collect`   | Continuously collect the kernel log (kmsg buffer / dmesg).     |

Since these are non-terminating, the CLI runner (`dlog-analyzer-cli.js`) manages them as **detached background processes**. All stdout/stderr is captured to a temp file. The agent uses these actions:

| Action   | Description                                                      |
| -------- | ---------------------------------------------------------------- |
| `start`  | Launch the binary in background, capture output to a temp file.  |
| `stop`   | Kill the running background process.                             |
| `check`  | Read the temp file and return the latest analyzed output.        |
| `status` | Check if the background process is still running.                |

`dlog-collect <app-id>` / `stop-collect` and `kernel collect` / `kernel stop` are the app-scoped and kernel counterparts. Everything else (`investigate`, `probe`, `error-analyze`, `app-log`, `search`, `kernel analyze`, `device-profile`, `snapshot`, `timeline`, `log-dump`, `log-clear`, `crash-report`) runs once and returns.

## Investigation workflow — a reported symptom

Use this for every "my app / the emulator does X" report (crash, freeze, high CPU, memory, video or audio not playing, slow, black screen …). Each step is one or more runner calls; the **STOP** step ends your turn.

1. **Pin down the subject.** App id if the user named one (e.g. `com.samsung.fh.youtube`), the symptom in the user's own words, and the serial only if several devices are connected (the runner's `multiple_devices` error lists them — see below).

2. **First pass — `investigate`.**
   ```bash
   node "$CLI" investigate --symptoms "300% cpu, video not playing" com.samsung.fh.youtube
   # system-wide: node "$CLI" investigate --symptoms "<the user's words>"
   ```
   It detects the device profile, maps the symptom words to probe bundles (CPU, memory, freeze, media, graphics …), runs them, correlates with any collected dlog/kernel findings and returns a budgeted report in `result.output`. Summarize its findings in two or three lines — this is not yet the final report.

   **Decision table** — when the investigate JSON contains `conclusions`, decide from the output, not from habit:

   | Tool output | Agent action |
   | --- | --- |
   | `conclusions` present, including primary `confirmed` covering every symptom | Treat as a preliminary hypothesis; continue to fresh collection, app launch and user reproduction (steps 3–5). |
   | Conclusion `suspected` + `verify_hint` present | Keep the hint for verification after reproduction; do not substitute probes for steps 3–5. |
   | `consent_needed` non-empty (network probe skipped) | Show the probe name and target to the user; on "yes" re-run with `--allow-network-probe` |
   | Only `unexplained` anomalies, no conclusions | Use the anomalies to guide fresh collection and reproduction; report what remains unexplained after step 5. |
   | `only_general_matched: true` (no symptom keyword matched) | Ask one clarifying question or proceed with `--profile general`; never guess a family |
   | Device `device_not_found` | Hand off to `tizen-launch-emulator` (unchanged) |

   `confidence: confirmed` describes a rule match against the evidence available
   to this call. It does not prove that the named app was launched, the current
   symptom occurred, or older logs belong to this attempt. No conclusion score,
   `explains` coverage, or successful follow-up probe bypasses steps 3–5.

3. **Start the collectors, BEFORE reproducing.** In this order:
   ```bash
   node "$CLI" start start-monitoring                 # system-wide dlog + live crash detection
   node "$CLI" kernel collect                         # kernel log — for CPU / freeze / memory / graphics / driver symptoms
   node "$CLI" app-launch com.samsung.fh.youtube      # (re)launch the app under observation
   ```
   Check each envelope before proceeding. Run `app-launch <app-id>` for the
   named app after monitoring starts, even if a previous probe found a PID;
   skip launch only when the user explicitly wants to preserve its running
   state. Do not terminate an app just to force a cold start. For a system-wide
   issue without a target app, omit app launch. Skip `kernel collect` only for
   purely app-level symptoms (a wrong string, a UI glitch).

   Record the target serial, app launch result and capture start time from the
   returned evidence. Keep the same serial for every device action. If launch
   fails, keep the startup capture as evidence of that failure and tell the user;
   do not claim the app opened or diagnose playback from old logs.

   The native binary runs **one dlog collector at a time**. With
   `start start-monitoring` active, use its system-wide capture and `check`;
   do not start a competing `dlog-collect`. For an app-only session without a
   system monitor, run `dlog-collect <app-id>` after launch, then use
   `stop-collect` / `error-analyze`. If a collector is already running, follow
   its envelope and establish which capture covers this reproduction; never
   delete a live collector lock.

4. **STOP — hand the device to the user. End your turn.** Say (in the user's language):
   > Collection is running in the background and the app launch succeeded (or its current state was preserved at your request). Please reproduce the issue now (play the video, trigger the action …). When you are done, tell me:
   > 1. **Done — the error/crash/symptom occurred**
   > 2. **Nothing happened**
   >
   > (Korean — use when the user wrote in Korean:)
   > 백그라운드에서 로그 수집 중이며 앱 실행이 성공했습니다 (또는 요청하신 대로 현재 실행 상태를 유지했습니다). 지금 이슈를 재현해 주세요 (동영상 재생, 문제 동작 실행 등). 끝나면 알려 주세요:
   > 1. **재현 완료 — 에러/크래시/증상이 발생했어요**
   > 2. **아무 일도 없었어요**

   Adapt the prompt to the actual launch/collection results (omit the app
   clause for a system-wide issue). Ask which action failed and roughly when,
   to correlate the symptom with this capture. Do **not** run `sleep`,
   `Start-Sleep`, a polling loop, more `investigate` / `probe` calls, or
   `stop-collect` / `stop` / `check` / `kernel stop` / `error-analyze` /
   `kernel analyze` in the same turn. Collection continues while you wait;
   the user decides when the window closes. Finish collector setup and app
   launch before this handoff; starting the first collector is not itself the
   handoff point.

5. **After the user answers — stop, then analyze in this order.**
   ```bash
   node "$CLI" stop                                                # system monitor (if started)
   node "$CLI" stop-collect                                        # app collector (only if started instead)
   node "$CLI" kernel stop                                         # kernel collector (if started)
   node "$CLI" error-analyze com.samsung.fh.youtube summary        # (a) only for an app-specific capture
   node "$CLI" check                                               # (b) crash/exception detection from start-monitoring — NEVER skip when it ran
   node "$CLI" kernel analyze                                      # (c) kernel findings (OOM, driver, watchdog …)
   ```
   `check` works whether the monitor is still running or already stopped — the captured analysis stays in `result.output_file` until the next `start`, and `stop` itself returns its last 200 lines in `result.output` (not a substitute for `check`, which returns all of it). Only when (a)–(c) do not explain the symptom, escalate:
   ```bash
   node "$CLI" error-analyze com.samsung.fh.youtube details        # full text of each error
   node "$CLI" search "<error text / tag / string the user quoted>" --context 1 --priority W   # every collected category at once, whole entries
   node "$CLI" app-log com.samsung.fh.youtube --priority W --since 10m --max-lines 300   # wider log, filtered
   node "$CLI" probe list                                          # then probe run <probe-id> for one more measurement
   ```
   **For a crash** (the user says it crashed / died / restarted, or (a)–(c) report a fatal signal), also read the crash dump crash-worker left on the device — it holds the signal, registers and call stack that dlog does not:
   ```bash
   node "$CLI" crash-report --app-id com.samsung.fh.youtube        # an app
   node "$CLI" crash-report --process deviced                      # a system daemon: its process name, no app id needed
   node "$CLI" crash-report                                        # newest dumps of every process
   ```
   See "Crash dumps — `crash-report`" below. `search` is the targeted step between the two: when a finding names a string (an error message, a tag, a URL, a PID) or the user quotes one, search for it across every collected category — it tells you which process logged it and what happened right before (`--context`) without paging through a whole log. `app-log` without filters is the last resort, never the first call — the full log is the largest output and buries the E/F lines `error-analyze` already isolated. If option 2 ("nothing happened") was chosen, still run (a)–(c) once — silent errors are common — then ask whether to keep collecting or stop.

   Correlate the evidence with the app, device and reproduction window. Older
   entries may remain in collected files; label them historical rather than
   counting them as this attempt. If option 2 was chosen, say **not reproduced**;
   silent errors alone do not confirm the cause of the reported symptom.

   **Second investigate**: after the user replies and the capture is analyzed,
   re-run `investigate --symptoms "<same symptoms>" [app-id]` with the same
   serial. It can correlate the new logs and verify hypotheses, but a snapshot
   taken after the failure may no longer show transient CPU/memory conditions.

6. **Report** per Rule 6, then the next-step prompt per Rule 8. Leave `start-monitoring` running only if the user chooses to continue; `stop` it when the investigation is done.

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

Starts collecting dlog filtered by the app's PID as a **background process**. **The app must be running** — it resolves the PID via `pgrep`/`ps` (with fallbacks). Logs are continuously written to `<sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log` (the envelope's `result.log_file`; see "Where logs are stored" below).

After starting collection, **end your turn and tell the user** to browse the app and reproduce the issue (step 4 above). Give them two options:
1. **Done with browsing and error/crash occurred** — the user reproduced the issue
2. **Nothing happened** — the user didn't see any problem

If the user selects option 1: run `stop-collect` to stop collection, then `error-analyze <app-id> summary` to analyze the logs (escalate per step 5).
If the user selects option 2: run `stop-collect`, run `error-analyze <app-id> summary` once anyway (silent errors), then clean up or offer to collect again.

Never replace the user's answer with a timer (`sleep 30 && … stop-collect`) — the reproduction window is theirs, not yours.

### stop-collect — Stop background app log collection

```bash
node "$CLI" stop-collect
```

Stops the background app-specific dlog collection process. The collected logs remain saved at `<sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log` for analysis.

### error-analyze — Analyze app logs for runtime errors (always first)

```bash
node "$CLI" error-analyze <app-id> [format]
# format: summary (summary lines only), details (detail entries only), or omit for both
```

Analyzes the collected app logs (`<app-id>.hot.log`) for Error (E) and Fatal (F) priority entries. Deduplicates errors by tag+message with occurrence count. Output is plain text (token-efficient, no Rich tables): the summary shows one line per finding (`N. Module=TAG | Repeated=X | Message: ...`), and the details section shows `[Error N]` blocks with `Full log:` lines. Start with `summary`; pass `details` only when the summary is not enough — it is the larger of the two outputs.

**Prerequisite:** Run `dlog-collect <app-id>` first to start collection, then `stop-collect` to stop it before analyzing.

### app-log — Full collected log (escalation only)

```bash
node "$CLI" app-log <app-id> [--since 10m] [--until <t>] [--priority W] [--tag <t>] [--keyword <k>] [--max-lines 300] [--output <file>]
```

Prints the complete collected log of one app (all priorities, hot + cold files). Use it **only after** `error-analyze` (and `check` / `kernel analyze` where they apply) failed to explain the symptom, and always with a filter (`--priority W`, `--since`, `--keyword`, `--max-lines`) — an unfiltered `app-log` as the first analysis step is the mistake tracked in issue #215.

### search — find text or a regex across every collected log

```bash
node "$CLI" search "connection refused"                                   # plain text, case-insensitive, every category (kernel excluded)
node "$CLI" search "Exception|SIGSEGV" --regex --context 2 --priority W   # Python regex, 2 entries of context, W and above
node "$CLI" search handshake --category com.samsung.fh.youtube --since 10m --count   # one app, last 10 minutes, totals only
node "$CLI" search "timeout|refused" --regex --format json --max-matches 20          # JSON with total_matches / returned / truncated
node "$CLI" search foo bar --all                                          # entries that contain BOTH (default: any)
node "$CLI" search --pattern "-1 returned"                                # a pattern that starts with "-"
```

The native binary's `search` subcommand (TizenDLogAnalyzer v0.2.6+, issue #254). A pattern is matched against each whole raw line — header (time, priority, tag, pid) and message — and against the entry's stack-trace continuation lines, so a match returns the **whole entry** and a trace is never cut. Every category under `<sdk-data>/dloganalyzer/app/` is searched (each app, `_general`, `_unparsed`; the kernel log is excluded — use `kernel analyze`) unless `--category <app-id|_general|_unparsed>` (comma-separate several; `--app-id` is an alias) narrows it. Text output is grep-like: `<category>:` marks a match line, `<category>-` a context line, `--` separates non-adjacent groups. Other switches: `--case-sensitive`, `--invert` (entries that do NOT match), `--all` (every pattern must match), `--after-context`/`--before-context`, `--until`, `--tag <t>`, `--output <file>` (complete result; `--max-lines`/`--max-chars` cap stdout only).

It reads the collected files only — no device needed, but something must have been collected (`dlog-collect <app-id>` / `start start-monitoring`, then `stop-collect` / `stop`); otherwise it returns `no_logs`. Use it when a finding names a string (an error message, a tag, a URL, a PID) or the user quotes one — "find X in the logs", "which app logged X", "did Y ever appear" — and to look around a known line with `--context`. It is **not** the first analysis call for a symptom (`error-analyze` → `check` → `kernel analyze` stay first, Rule 12) and not a replacement for `log-dump` ("show me the logs" without a string to look for). `result.total_matches` (`--format json` / `--count`) tells you when to narrow the pattern; `--max-matches` defaults to 100.

## Kernel logs — `kernel collect` / `kernel stop` / `kernel analyze`

```bash
node "$CLI" kernel collect [serial]     # background collector → <sdk-data>/dloganalyzer/app/kernel/kernel.hot.log
node "$CLI" kernel stop                 # stop it after the user reproduced the issue
node "$CLI" kernel analyze              # deduplicated kernel findings (OOM killer, driver errors, watchdog, GPU/display faults …)
```

Kernel evidence matters for high CPU, freezes, memory pressure, graphics/video failures and anything that smells like a driver or platform problem. Start `kernel collect` alongside `start-monitoring` (step 3), stop and analyze it with the rest (step 5). Only one kernel collector runs at a time (`already_running` otherwise). **Never** run `sdb shell dmesg`, `cat /proc/kmsg`, `dlogutil -b kmsg` or a tizen-sdb-helper shell request for the kernel log — those bypass classification and the hooks deny them.

## Crash dumps — `crash-report`

```bash
node "$CLI" crash-report [serial]                                   # newest 3 dumps of every process
node "$CLI" crash-report --process <name>                           # one app id or process name (system daemons: e.g. deviced)
node "$CLI" crash-report --app-id <app-id> --limit 1                # --app-id is an alias of --process — give one, not both
node "$CLI" crash-report --dump-dir /opt/usr/share/crash/temp       # search one more device directory (repeatable)
```

crash-worker writes one entry per crash, named `<process>_<pid>_<YYYYMMDDhhmmss>` (`.zip`, `.tar`, `.info` or a directory), where `<process>` is the app id for an app and the process name for a daemon. `crash-report` lists `/opt/usr/share/crash/dump` and `/run/crash/dump` (DA and other RAM-backed targets) plus every `--dump-dir`, takes the newest matching entries (`--limit`, default 3, `0` = all), and for each one returns `summary` (`signal`, `executable`, `pid`, `package_id`, `callstack`), the first `--lines` lines of the `.info` report (default 80) and the files it saved under `result.output_dir` (`report_file`, plus `dlog_file` when the dump carries a dlog). `next_step` is the `error-analyze --file <dlog_file> --app-id <process> --pid <pid>` call that analyzes that dlog — this is how a **system daemon** (no app id, nothing under `app/<app-id>/`) gets the same E/F analysis an app gets. In this runner harness, run it with `node "$CLI" error-analyze --file <dlog_file> --app-id <process> --pid <pid> --format summary` when `tizen-sdk` is not on PATH. `result.searched_dirs` shows each directory as `ok`, `missing` or `denied`. A report or dlog that could not be read or saved is that dump's `error` or `dlog_error`; the rest of the dump is still returned.

The crash-dump directories are root-only on most targets: a `denied` directory becomes a `warnings` entry, and when none is readable the call fails with `permission_denied` and a `suggested_fix` to switch sdb to root through `tizen-sdb-helper` (`root on`, confirmation-gated — ask the user first). A dump without a text report (a bare core dump) or a device without `unzip` gets a note to pull the entry with `tizen-file-transfer`. Never `ls` / `cat` / `unzip` the crash directories over `sdb shell` yourself. Deleting dumps is `tizen-sdb-helper`'s `clean-crash-dumps` recipe, not this action.

## Evidence probes — `investigate` / `probe`

```bash
node "$CLI" investigate --symptoms "300% cpu, video not playing" [app-id] [serial]   # symptom → probe bundles → correlated report
node "$CLI" investigate --profile crash,performance [app-id]                          # explicit bundle selection
node "$CLI" probe list                                                                # the probe catalog (ids + what each measures)
node "$CLI" probe run <probe-id> [serial]                                             # one probe, e.g. a CPU or memory snapshot
node "$CLI" device-profile [serial]                                                   # device type / version / arch / root / tools
node "$CLI" snapshot create|list|compare <id1> <id2>                                  # system snapshots before/after reproduction
```

`investigate` is the first call of every symptom investigation (step 2); `probe run` is for one targeted follow-up measurement after the log analysis. Both replace hand-typed `sdb shell top / ps / free / cat /proc/meminfo` — the hooks deny those raw forms, and a `tizen-sdb-helper` "shell top" request is the same detour by another name.

## One-shot log actions — plain "show / tail / save / clear the logs"

These requests arrive from the user directly or as a `handoff: "tizen-dlog-analyzer"` envelope from `tizen-sdb-helper` (its `result.note` names the action). They are **not** analysis tasks: show the result, do not render the report (Rule 6), do not start a background session unless the user asked to monitor.

| Request | Run | Then |
| --- | --- | --- |
| Show / tail / view the logs (`show logs`, `tail the logs`, `로그 보기`, emulator logs) | `node "$CLI" log-dump [serial]` — add `--filter "*:E"` for errors only, `--filter "TAG:W"` for one tag, `--lines 50` to shorten | Present `result.output` (the last `returned_lines` of `total_lines`) and mention `result.dump_file` when `truncated` is true. |
| Save / export the logs to a file | `node "$CLI" log-dump [serial] --output <host-file> --lines 0` | Report `result.dump_file`; the file holds the complete dump. Never redirect `sdb dlog` yourself. |
| Clear / flush the logs (`clear logs`, `dlog clear`, `로그 지우기`) | `node "$CLI" log-clear [serial]` — the first call **always** returns `user_input_required` | Show `errors[0].message`, get an explicit "yes", then run `node "$CLI" log-clear [serial] --confirm`. Never pass `--confirm` on the first call, never type `sdb dlog -c`. |
| Find / grep a string in the collected logs (`search the logs for X`, `which app logged X`, `로그에서 X 찾아줘`) | `node "$CLI" search "<X>" [--context 1] [--priority W] [--category <app-id>]` — add `--regex` for a pattern, `--count` for totals only | Present `result.output` (grep-like; `<category>:` lines are the matches). `no_logs` means nothing has been collected yet — start a collector first (the device buffer itself is `log-dump --filter`). |
| Watch the logs continuously / "monitor" | `node "$CLI" start start-monitoring [serial]` (or `start dlog-collect`) | Continue with the Workflow below (Rule 3 choice → `stop` → `check`). |
| Kernel log / dmesg (no problem reported) | `node "$CLI" kernel collect [serial]` → ask the user when to stop → `kernel stop` → `kernel analyze` | Present `result.output` of `kernel analyze`. |

`log-dump` uses `sdb dlog -d` (dump and exit) — without `-d` dlog streams forever. For live streaming use the continuous layer, not a shell loop.

### Multiple devices connected

When more than one device or emulator is online and no serial is given, every action that needs a device returns `status: "failure"` with `errors[0].category: "multiple_devices"`. The `errors[0].devices` array lists each online device as `{serial, state}`. Present that list to the user, ask which serial to target, then re-run the same command with the chosen serial in the `[serial]` position (e.g. `node "$CLI" log-dump emulator-26101`). This runner takes the serial positionally — it has no `--serial` flag, and passing one fails with `Unknown option`. When no online device is connected the category is `device_not_found` (no `devices` array) — tell the user to launch an emulator first. `invalid_parameters` means the serial contains characters sdb does not accept; `io_error` means `sdb devices` itself failed.

## Workflow — monitoring an app the user is about to test

The generic monitoring loop (no symptom reported yet, e.g. right after a build/install):

### 1. Start monitoring (background) — BEFORE launching the app

**Important:** Start monitoring **before** launching the app so that logs are captured from app startup, including initialization failures and early crashes.

```bash
node "$CLI" start start-monitoring
# Optional serial: node "$CLI" start start-monitoring emulator-26101
```

### 2. Launch the app and reproduce

Install with `tizen-install-app` if needed, then launch with `node "$CLI" app-launch <app-id>` and verify the envelope. The running system monitor already captures the app; use `dlog-collect <app-id>` only in an app-only session without that monitor.

### 3. Ask the user: continue, or stop and analyze now — and END YOUR TURN

Present the two options from Rule 3 and wait — do not poll, do not sleep.

### 4. Analyze and report

Run `error-analyze <app-id> summary` (app-specific) and/or `check` (system-wide) — plus `kernel analyze` if a kernel collector ran — before anything wider (see step 5 of the investigation workflow). When the analysis task is fully complete, render the report per Rule 6, then the next-step prompt per Rule 8. Always `stop` / `stop-collect` / `kernel stop` when the investigation is done.

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
| `node "$CLI" error-analyze <app-id> [format]` | **First analysis call for an app.** Analyzes the collected app log for Error/Fatal entries, deduplicated with occurrence counts. Output is plain text (token-efficient). `format` is `summary` (start here), `details`, or omitted for both. |
| `node "$CLI" app-log <app-id> [--since <s>] [--until <s>] [--priority <p>] [--tag <t>] [--keyword <k>] [--format <f>] [--output <file>] [--max-lines <n>] [--max-chars <n>]` | **Escalation only.** Prints the full collected log for one app (all priorities, hot + cold files), with optional time/priority/tag/keyword filters and output limits — after `error-analyze` did not explain the symptom, and always filtered. |
| `node "$CLI" search <pattern> [pattern …] [--pattern <p>] [--category <c>[,<c>]] [--regex] [--case-sensitive] [--invert] [--all] [--context <n>] [--after-context <n>] [--before-context <n>] [--since <s>] [--until <s>] [--priority <p>] [--tag <t>] [--count] [--format text\|json] [--output <file>] [--max-matches <n>] [--max-lines <n>] [--max-chars <n>]` | **Find a string without knowing which app wrote it.** Searches every collected dlog category (each app, `_general`, `_unparsed`; kernel excluded) for plain text or a regex and returns whole entries (stack traces intact), grep-like (`<category>:` match, `<category>-` context). Reads the collected files — no device needed, `no_logs` if nothing was collected. `--format json` / `--count` add `result.total_matches`. Binary v0.2.6+. |
| `node "$CLI" device-profile [serial] [--refresh] [--max-age <n>] [--format <f>]` | Detects and prints the connected device's profile (type, version, arch, root, tools). `--refresh` bypasses the cache. |
| `node "$CLI" investigate [app-id] [serial] [--symptoms <s>] [--profile <p>] [--format <f>] [--budget <n>] [--budget-tokens <n>] [--allow-network-probe] [--rules-dir <path>] [--parallel] [--max-workers <n>] [--deduplicate] [--similarity-threshold <f>] [--allow-heavy] [--no-noise-filter] [--fuzzy-symptoms] [--symptom-map <path>]` | **First call of a symptom investigation.** Detects the device profile, maps `--symptoms` (the user's words) to probe bundles, runs them, correlates with collected dlog/kernel findings and emits a budgeted report. Returns ranked **conclusions** (confidence, role, evidence, fix), **ruled_out**, **unexplained**, **consent_needed**, **redaction_summary**. `--allow-network-probe` consents to network-egress probes; `--rules-dir` loads extra user rules; `--parallel`/`--max-workers` run probes concurrently; `--deduplicate`/`--similarity-threshold` remove near-dup evidence; `--allow-heavy` includes >5 s probes; `--no-noise-filter` shows all findings; `--fuzzy-symptoms` enables typo-tolerant matching; `--symptom-map` replaces the built-in symptom map. |
| `node "$CLI" probe list\|run [probe-id] [serial] [--format <f>] [--app-id <id>] [--allow-network-probe]` | `probe list` shows the evidence-probe catalog; `probe run <probe-id>` executes one probe on the device (targeted follow-up measurement). `--app-id` scopes the probe to one app; `--allow-network-probe` consents to network-egress probes. |
| `node "$CLI" rules list [--family <f>] [--format <f>]` / `rules show <rule-id>` / `rules validate [path]` / `rules test <fixture.json> [--expect <rule_id>[,<rule_id>]\|none] [--format <f>]` — all accept `[--rules-dir <path>]` | `rules list` shows all analysis rules (built-in + `--rules-dir`; `--family <f>` filters by family); `rules show <rule-id>` prints one rule's YAML definition; `rules validate` checks every rule file (or just the given file/directory); `rules test <fixture.json>` runs **all** rules against a JSON fixture (`dlog_findings`, `kernel_findings`, `evidences`) and prints the diagnosis — `--expect` lists the rule ids that must be concluded exactly (`none` = no conclusion) and fails the envelope otherwise. `--format` applies to `list` and `test` only. |
| `node "$CLI" snapshot create\|list\|compare\|delete [id1] [id2] [serial]` | `snapshot create` captures a system snapshot; `snapshot list` shows all snapshots; `snapshot compare <id1> <id2>` compares two snapshots; `snapshot delete <id>` deletes a snapshot. |
| `node "$CLI" timeline show\|report\|analyze\|export [--probe-id <id>] [--format <f>] [--output <file>]` | Analyzes and visualizes probe history across snapshots. `show` displays timeline, `report` generates a report, `analyze` analyzes trends, `export` exports to JSON. |
| `node "$CLI" kernel collect\|stop\|analyze [serial] [--format <f>]` | `kernel collect` starts the kernel-log collector (kmsg/dmesg) **in the background**; `kernel stop` stops it; `kernel analyze` analyzes the collected kernel log and prints deduplicated findings. |
| `node "$CLI" error-analyze --file <path> [--app-id <id>] [--pid <n>] [--noise-tag <tag>] [--with-context] [--format <f>]` | **File mode.** Analyze one saved local dlog file for E/F errors — no device, no SDK path, no prior collection. `--app-id` is a declared label (used with `--pid`); `--with-context` adds context lines. |
| `node "$CLI" app-log --file <path> [--pid <n>] [--noise-tag <tag>] [--category <c>] [--since <s>] [--priority <p>] [--tag <t>] [--keyword <k>] [--format <f>] [--output <file>]` | **File mode.** Print the full log from a saved dlog file, with optional PID/category/time/priority/tag/keyword filters. |
| `node "$CLI" search --file <path> --pattern <p> [--app-id <id>] [--pid <n>] [--noise-tag <tag>] [--category <c>] [--regex] [--context <n>] [--priority <p>] [--format text\|json] [--output <file>]` | **File mode.** Search a saved dlog file for text or a regex. `--app-id` is a declared label (used with `--pid`), not a category alias. |
| `node "$CLI" kernel analyze --file <path> [--since <s>] [--level <l>] [--format <f>] [--with-dlog --app-id <id>]` | **File mode.** Analyze a saved kernel dmesg/kmsg file directly. `--level` sets the minimum level; `--with-dlog --app-id` correlates with collected dlog. |
| `node "$CLI" log-dump [serial] [--filter "<spec> …"] [--lines <n>] [--output <file>]` | One-shot dump of the device dlog buffer (`sdb dlog -d -v threadtime`). Returns the last `--lines` lines (default 200, `0` = all) in `result.output`; the complete dump is written to `result.dump_file` (`--output` or `$TMPDIR/tizen-dlog-analyzer/dlog-dump.log`). `--filter` takes dlog filterspecs `<tag>[:<V|D|I|W|E|F|S>]` such as `"*:E"` or `"E20:W CHROMIUM"`. No native binary involved. |
| `node "$CLI" log-clear [serial] [--confirm]` | Clears the device dlog buffer (`sdb dlog -c`). Without `--confirm` returns `user_input_required` with a `suggested_fix` and does nothing. Running collectors are not stopped (a `warnings` entry says so). |
| `node "$CLI" crash-report [serial] [--process <name> \| --app-id <id>] [--dump-dir <dir>]… [--limit <n>] [--lines <n>] [--output <dir>]` | Finds crash-worker dumps in `/opt/usr/share/crash/dump`, `/run/crash/dump` and every `--dump-dir`, for an app id or any process name (system daemons included), newest first. Returns each dump's crash summary (signal, executable, call stack) and report head, saves the `.info` report and the packed dlog to `result.output_dir`, and gives the `error-analyze --file` call for that dlog in `next_step`. Unreadable (root-only) directories → warning, or `permission_denied` when none is readable. No native binary involved. |

## Final report — the only accepted shape

For a live symptom, render the report only after the required reproduction
reply and capture analysis. In the Issue field, state whether it was reproduced
and the capture window if known. Say **not reproduced** when no symptom occurred.
For saved-log-only analysis or declined reproduction, state that limitation and
keep causal claims provisional. Separate historical entries from this attempt;
connect a cause to the reported symptom only when the captured evidence supports
that connection.

The report is `REPORT_TEMPLATE.md` (`cat "$TEMPLATE"` — one tool call; the severity guide and the English→Korean label mapping are there). Render **one block only** — the Korean block if the user wrote in Korean, the English block otherwise. Its skeleton, so the shape never has to be improvised even when the template is not in context (the `check` / `error-analyze` / `kernel analyze` envelopes restate it in `result.report_format`):

English block — when the user wrote in English or in any non-Korean language:

```markdown
## Analysis Report (English)

### 0. Summary
(fenced block, four `Label: value` lines) Date: … / Emulator/Device: <name> (<device_serial>) / App: <app_id, or "system-wide"> / Issue: <the user's own words>

### 1. Root Cause
- **[Severity: Critical|High|Medium|Low] —** one-sentence cause, most severe first
  - Confidence: confirmed | suspected
  - Role: primary | secondary | contributing
  - Evidence: <short quoted log tag/message>
  - Occurrences: <count, if reported>

### 2. Additional Findings
### 2a. Ruled Out
(one line each, only if non-empty — hypotheses rejected by confirmation probes)
### 2b. Unexplained Anomalies
(top 3 by severity, only if non-empty — signals no rule matched)
### 3. Solution Suggestions
- **Code available:** … / - **Code not available:** …
(Fix lines come from the conclusion's `fix` array — exact paths/keys. Masking note: placeholders like `<ISSUER_1>` are reproduced as-is; say "N items were redacted; run locally to see real values.")
### 4. Workarounds

Next step? (a) keep monitoring, (b) apply the suggested fix and retest, (c) stop and clean up.
```

Korean block — when the user wrote in Korean. Render this **instead of** the English block, never after it:

```markdown
## 분석 보고서 (한국어)

### 0. 요약 (날짜 / 에뮬레이터/디바이스 / 앱 / 이슈)
### 1. 근본 원인 (- **[심각도: 심각|높음|중간|낮음] —** … / 신뢰도: confirmed|suspected / 역할: primary|secondary|contributing / 근거 / 발생 횟수)
### 2. 추가 발견 사항
### 2a. 제외된 가설 (빈 경우 생략)
### 2b. 설명되지 않은 이상 징후 (최대 3개, 심각도순, 빈 경우 생략)
### 3. 해결 방안 제안 (코드가 있는 경우 / 코드가 없는 경우)
### 4. 임시 해결 방법

다음 단계를 선택해 주세요: (a) 모니터링 계속, (b) 제안된 수정 적용 후 재테스트, (c) 종료 및 정리.
```

The first line of the report is `## Analysis Report (English)` or `## 분석 보고서 (한국어)` depending on the user's language; the headings are exactly these; every finding is a bullet. **Not** this: a title of your own (`## 🔍 Investigation Report: …`), emoji or "Root Causes Identified" headings, a `| Finding | Source | Severity |` table, a trailing "Summary" section, a bilingual (English + Korean) report. Exactly one language block is rendered, never both.

## Rules

1. **Never run `sdb dlog` — or any other `sdb` diagnostic — yourself; every log and evidence operation goes through this runner.** Continuous collection is `dlog-collect` (the native binary's own subcommand) — for a specific app (`dlog-collect <app-id>`) or the whole system (`start dlog-collect` / `start start-monitoring`); the kernel log is `kernel collect`. A one-shot view/save is `log-dump`; clearing the buffer is `log-clear`. Do not shell out to `sdb shell dlog`, `sdb dlog -d`, `sdb dlog -c`, `sdb shell dmesg`, `sdb shell top/ps/free` to do any of these by hand — and do not route them through `tizen-sdb-helper` either.
2. **Always analyze through `error-analyze` (app-specific), `check` (system-wide monitoring) and `kernel analyze` (kernel) — never by reading the log file directly.** These commands handle deduplication, classification, and formatting that raw log text does not. Do not `Read` the `.hot.log` file or the raw output file as a substitute for running the command, and do not `grep` / `Select-String` / `rg` the collected files — looking for a specific string is `search "<text>"` (whole entries, every category, stack traces intact). (A plain "show me the logs" is not analysis — answer it with `log-dump`, whose `result.output` is meant to be shown.)
3. **After completing collector setup and app launch** (step 3), **end your turn and ask the user** to browse the app / reproduce the issue, then choose:
   - **Done — the error/crash/symptom occurred**, or
   - **Nothing happened**

   (or, for an open-ended monitoring session, **Continue** vs **Stop and analyze now**). Do not poll, loop, `sleep`, or `Start-Sleep` waiting for a crash, and do not run `stop-collect` / `stop` / `kernel stop` / `check` / `error-analyze` in the same turn as the start — present the choice and wait for the user's reply. The reproduction window belongs to the user; a timer is not a substitute for their answer.
4. Prefer `start-monitoring` for symptom reports (it captures app startup and self-detects crashes). Use the app-specific `dlog-collect <app-id>` + `error-analyze <app-id>` pair for an app-only session without a system monitor. One dlog collector at a time; add `kernel collect` for platform-level symptoms (investigation workflow, step 3).
5. Start monitoring/collection **before** launching or reproducing the issue in the app, so startup and early failures are captured.
6. **Once the analysis task is fully complete** — the last planned `check`/`error-analyze`/`kernel analyze` call has returned and no further collection/analysis step remains before handing control back to the user — read `REPORT_TEMPLATE.md` (next to this SKILL.md; `cat "$TEMPLATE"` from the runner snippet) and render the report in that exact structure — the skeleton under "Final report — the only accepted shape" above — **once, in the language the user wrote in: Korean (한국어) if the user wrote in Korean, English otherwise (including any third language).** Technical identifiers (app IDs, device serials, dlog tags, quoted log lines, file paths, function names, code) stay verbatim. Do not paste raw tool output or improvise a format (no own title, no emoji headings, no tables). A `check`/`error-analyze` result that is only an intermediate step in a larger in-progress sequence (e.g. still deciding whether to relaunch the app and collect again) does not by itself trigger the report. Re-render the full report (not a diff) on each subsequent analysis pass, e.g. after the user applies a fix and reproduces the issue again. If `REPORT_TEMPLATE.md` cannot be found, use this section order: Summary (Date, Emulator/Device, App, Issue), Root Cause, Additional Findings, Solution Suggestions, Workarounds — or in Korean: 요약 (날짜, 에뮬레이터/디바이스, 앱, 이슈), 근본 원인, 추가 발견 사항, 해결 방안 제안, 임시 해결 방법. A plain one-shot request (`log-dump` / `log-clear`, see "One-shot log actions") is not an analysis task and does not trigger the report.
7. **Build the report only from the tool result already returned and prior conversation context.** Do not run additional commands (device info, sdb, system diagnostics, etc.) to gather more evidence before rendering — if something isn't already known, say so in the relevant field/section rather than fetching it. Never invent a value (e.g. a device name) that isn't already known.
8. **After presenting the report**, end with a short next-step prompt to the user (continue monitoring, apply a suggested fix and retest, or stop) **in the same language as the report**.
9. **`log-clear` is confirmation-gated.** Without `--confirm` the runner refuses with `user_input_required` and does nothing. Ask the user, and only after an explicit "yes" re-run the same runner command with `--confirm` (same serial). Do not pre-emptively pass `--confirm`, and do not run the underlying sdb command yourself — this mirrors the gated-command rule in `tizen-sdb-helper`, except the re-run goes through this runner.
10. **Kernel logs go through `kernel collect` → `kernel stop` → `kernel analyze`.** For CPU, freeze, memory, graphics/video and other platform-level symptoms start the kernel collector together with `start-monitoring` (before reproduction) and analyze it with the rest. Never `sdb shell dmesg` / `cat /proc/kmsg` / `dlogutil -b kmsg`.
11. **Evidence comes from `investigate` and `probe`, not from hand-typed `sdb shell` diagnostics.** Every symptom investigation starts with `investigate --symptoms "<the user's words>" [app-id]`; one more measurement is `probe run <probe-id>` (`probe list` shows the catalog). `top`, `ps`, `free`, `/proc/meminfo`, `/proc/<pid>/status` typed over sdb — directly or via a `tizen-sdb-helper` shell request — are the detour this rule forbids.
12. **Analysis order: errors first, full log last.** For an app: `error-analyze <app-id> summary` → `check` → `kernel analyze` (if collected) → only if the symptom is still unexplained `error-analyze … details` → `search "<the string a finding or the user named>" --context 1` → filtered `app-log` → `probe run`. Never open with `app-log`, and never run it unfiltered as the first look. `search` is the targeted step: it needs a string to look for; with one in hand it beats paging through `app-log`.
13. **Routing.** A problem report that mentions the emulator or a device is still this skill's job — do not delegate it to `tizen-device-manager` (discovery / emulator stop only) and do not answer it with `tizen-sdb-helper`. Only when this runner returns `device_not_found` do you send the user to `tizen-launch-emulator`.
14. **Read conclusions, not raw findings.** When the `investigate` JSON contains a `conclusions` array, build the report from it — each conclusion has `confidence` (confirmed/suspected), `role` (primary/secondary/contributing), `evidence`, and `fix`. Render `ruled_out` as "Ruled out" and `unexplained` as "Unexplained anomalies" (top 3 by severity). If `conclusions` is absent (older binary), fall back to the findings-based report as before.
15. **Network probes require consent.** If `consent_needed` is non-empty, the investigation skipped network-egress probes. Ask the user whether to allow them; if yes, re-run `investigate` (or `probe run`) with `--allow-network-probe`. Do not add the flag without asking.
16. **Redaction is not a bug.** The binary sanitizes corporate cert details (`<ISSUER_1>`), paths, URLs, IPs and MACs. Reproduce placeholders as-is in the report; add a note: "N items were redacted; run locally to see real values" (from `redaction_summary.total`). Do not attempt to unmask them.
17. **If you disagree with a conclusion, say so and cite the evidence line.** Silent override is not allowed — the agent may add context but must not replace a conclusion's `fix` array with generic advice.
18. **Pass the user's full sentence as `--symptoms`; never shorten it to keywords.** The inflection-tolerant matcher handles plurals and word forms ("videos" → "video").
19. **Non-English input: translate before passing.** If the user writes symptoms in Korean (or any non-English language), translate the symptom sentence to English before passing it to `--symptoms`. The symptom mapper is English-only; Hangul or other scripts will not match any keyword.
20. **Ranking: when two conclusions explain one symptom, report both with their `rank`** (primary/secondary/contributing). The tool provides the rank — do not re-rank.

## Important notes

- **Only one system-wide `start` instance at a time.** If already running, `start` returns an `already_running` error. Stop first. To stop it run `stop` — not `start stop` (that is an invalid subcommand, and the error says so).
- **One dlog collector overall, enforced by the binary's lock** (`<log-dir>/_meta/collector.lock`, holding the owner's PID). `start` also returns `already_running` while `dlog-collect <app-id>` runs (`stop-collect` first) or when any other collector holds the lock; the envelope names the holder PID and the command that stops it. A holder this runner is not tracking is a collector from an earlier session that outlived its PID file — the runner confirms the PID still belongs to a `tizen-dlog-analyzer` process, then says to terminate it (and its child `sdb dlog --monitor`) and re-run. **Never delete the lock file while its holder runs**: it is live and streaming the same dlog buffer; two collectors on one directory corrupt each other. Only when the envelope says the PID now belongs to a different process (the OS reused the number — the lock is stale) may the lock file be removed, after checking that no `tizen-dlog-analyzer` process is running.
- **`stop` keeps the session's analysis.** Its envelope carries the last 200 captured lines (`result.output`, `total_lines`, `truncated`) and `check` returns the whole file afterwards — the output file is only truncated by the next `start`. Stopping the monitor never loses what it detected.
- **Only one app-specific `dlog-collect` instance at a time.** Same rule — `stop-collect` first. While `start start-monitoring` / `start dlog-collect` runs, `dlog-collect <app-id>` returns `already_running` naming the monitor as the lock holder; the envelope then tells you to analyze the system-wide capture with `check` rather than stop the monitor mid-reproduction.
- **Only one `kernel collect` instance at a time.** Same rule — `kernel stop` first.
- **The binary is platform-specific.** The setup script copies only the matching `linux/`, `macos/`, or `windows/` binary.
- **All three background processes are detached** and survive the agent session ending. Always `stop` / `stop-collect` / `kernel stop` when done.
- **Where logs are stored.** The native binary has no `--base-dir` option. Every command resolves one log base directory from the SDK configuration: `~/.tizen.sdk.path.config` names the SDK, `TIZEN_SDK_DATA_PATH` in `<sdk>/sdk.info` (or the `<sdk>-data` sibling) names the data directory, and logs go to `<sdk-data>/dloganalyzer/` — app-specific logs at `<sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log`, the kernel log at `<sdk-data>/dloganalyzer/app/kernel/kernel.hot.log`. The runner reads from the same place (`result.log_base_dir` / `result.log_file`). If the SDK path is not configured or points to a directory that no longer exists, `start`, `dlog-collect`, `kernel collect`, `error-analyze` and `app-log` return `sdk_path_not_set` — run `tizen-sdk-init` first.
- **A `warnings` entry about `UnicodeEncodeError` is not a failure.** On Windows the native binary writes through the system code page (e.g. cp949) and can crash on a character outside it after it has already printed its whole report; `investigate`, `probe`, `error-analyze` and the other one-shot commands then return `status: success` with the printed output and that warning. Use the output as is. Do **not** retry with `chcp 65001` or `PYTHONUTF8` / `PYTHONIOENCODING` — the binary ignores both.
- **Temp files** (PID files, captured stdout, the `log-dump` file) live under `$TMPDIR/tizen-dlog-analyzer/` (or `/tmp/tizen-dlog-analyzer/` on Linux). Collected logs are NOT there.
- **`dlog-collect <app-id>` requires the app to already be running** — the runner resolves the PID via `pgrep`/`ps` (with fallbacks). If the PID cannot be resolved, collection still starts and the native binary resolves it; if the app is truly not running, the collector exits and `process_crashed` is returned.
- **App IDs are validated** (`[A-Za-z0-9._-]` only) before any app command runs; anything else returns `invalid_parameters`.
- **`error-analyze` requires `dlog-collect <app-id>` (then `stop-collect`) to have run first.** If no logs exist, it returns `no_logs`.
- **`search` reads the collected files, not the device.** It needs no serial and no running collector, but something must have been collected under `<sdk-data>/dloganalyzer/app/` (`no_logs` otherwise, naming the missing directory). Matching is case-insensitive by default; the kernel log is never searched (`kernel analyze` covers it); `--max-matches` defaults to 100 and `result.truncated` / the stderr note say when it cut the result. Exit code 0 also when nothing matches — the envelope then says `No entry matches …` (`result.total_matches: 0` with `--count` / `--format json`, `result.matched: false` in text mode). Positional patterns may start with a single `-` (`search "-1 returned"`); a pattern that starts with `--` must go through `--pattern`. `--pattern`, `--category` / `--app-id` and `--tag` are repeatable (`--pattern a --pattern b` searches for both; `--category a,b` also works); when several named categories have no logs, `no_logs` lists every missing one in `errors[0].missing_categories`. Values are checked before anything runs: a pattern, tag, time or path with a control character, a tag with whitespace, a priority outside `V D I W E F`, or a non-integer `--context` / `--max-*` returns `invalid_parameters`. Requires the bundled binary v0.2.6 or newer (`Unknown command 'search'` otherwise — update the plugin).
- **`investigate` is one-shot** — it runs the probe bundles and exits (it does not need a collector running, but it correlates with whatever has been collected). This command does not launch an app, start fresh collection or request user reproduction; for a live symptom its conclusions remain preliminary until the required workflow above completes. `probe run` needs a device; `probe list` does not. The JSON output contains `conclusions`, `ruled_out`, `unexplained`, `consent_needed`, `redaction_summary`, `playbook_app_type`, `playbook_probes_added`, `fuzzy_matches`, `duplicates_removed`, `dedup_text_saved`. If `conclusions` is absent (older binary), the report is built from `findings` as before. Each conclusion object has: `id`, `title`, `family` (crash, network, performance, memory, audio, peripheral, power, security, hang, service, storage, launch, graphics, time, media), `confidence` (confirmed|suspected), `severity` (low|medium|high|critical), `score`, `rank` (primary|secondary|contributing), `explains` (symptom keywords this conclusion accounts for), `evidence` (quoted probe/log lines), `fix` (actionable fix lines with exact paths/keys), `verify_hint` (a `probe run` command to confirm a `suspected` conclusion; `null` when `confirmed`).
- **`rules` subcommands** — `rules list` shows all 24 built-in rules; `rules show <id>` prints one rule's YAML definition; `rules validate [path]` checks all rule files (or one file/directory); `rules test <fixture.json> [--expect <ids>|none]` runs the rules against a JSON fixture — the positional is a fixture path, not a rule id. `--rules-dir <path>` loads extra user rule YAML. `--format json` is accepted by `list` and `test` only. These are read-only / offline — no device needed.
- **`log-dump` / `log-clear` need no native binary** — only sdb and a connected device. `log-dump` always writes the complete dump to `result.dump_file`; `result.output` is only the tail. `log-clear` does not stop running collectors; lines they already collected stay in their files.
- **`--file` mode** lets `error-analyze`, `app-log`, `search`, and `kernel analyze` read one saved local log file directly — no SDK path, no device, no prior collection. Use `--pid` (repeatable) to select records by historical capture PID, `--noise-tag` (repeatable) to exclude tags while reconstructing categories, and `--category` to select a reconstructed routing category. For `error-analyze` and `search`, `--app-id` is a declared label (not a verified identity), used with `--pid`. For `kernel analyze --file`, `--level` sets the minimum level and `--with-dlog --app-id` correlates with collected dlog. `exception-detect --file` is not yet supported through this runner.


### Codex CLI

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb log collection needs a localhost TCP socket and the analyzer writes its reports outside the workspace, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.
