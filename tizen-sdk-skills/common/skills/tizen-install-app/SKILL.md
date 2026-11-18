---
name: tizen-install-app
description: Tizen install app, 타이젠 앱 설치, tpk 설치, wgt 설치, rpk 설치, rpm 설치, 앱 패키지 설치, tizen app install, run app, run the app, launch app, 앱 실행, 실행해줘, 앱 실행해줘, 타이젠 앱 실행, run MyApp. A Tizen executable app runs on a DEVICE/EMULATOR, never on the host — for any request to run/launch an executable Tizen app or project folder, use THIS skill. Installs *.tpk / *.wgt / *.rpk / *.rpm on a connected device or emulator. RPK is resource-only and must be installed without launching. RPM packages from GBS (Platform) builds ARE executable apps — pass --run to launch their /usr/bin binary on the device. Automatically manages device/emulator discovery and installation.

metadata:
  author: Samsung Electronics
  last-updated: "2026-10-06"
  keywords:
    - Tizen install app
    - tpk install
    - wgt install
    - app install
    - 타이젠 앱 설치
    - tpk 설치
    - wgt 설치
    - install tizen application
---

> **Handoff notes:** Claude Code and Codex CLI may share this project. Before you start, run
> `handoff-cli.js show` (see the `tizen-handoff` skill) to catch up on what the other agent did.
> This runner records its own result there automatically; nothing to set up.


### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-install-app` agent with the Agent tool (personal deployment or `tizen-sdk-skills:tizen-install-app`)
2. Pass the collected inputs (package path, whether to run after install) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary beneath it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
# Install only (do NOT launch the app):
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" install --package "<package-path>"

# Install and launch the app:
node "$CLI" install --package "<package-path>" --run
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\project-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" install --package "<package-path>"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" install --package "<package-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

### Codex CLI — run the install as a job (one exec call waits ≤ 30 s)

Under Codex CLI a tool call returns after at most 30 s; installing a large package on an emulator
(`sdb push` + `tz install` + launch verification with `--run`) often takes longer, and the call
would come back with only the runner's header while the install keeps running (issue #48). Add
**`--background`**: the runner returns a job receipt (`result.job_id`) within a second, then poll
`node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per call; `progress_tail`/
`log_file` show the live script output) until `job.state` is `done` — that response **is** this
runner's envelope. A result that shows only progress lines and no `{ "status": … }` JSON is not a result.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb needs a localhost TCP socket and the install writes the device state under `<sdk>-data`, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments (flags)

- **`--package`** (required) — absolute path to `.tpk`, `.wgt`, `.rpk`, or `.rpm`
- **`--device-serial`** (optional) — device serial; omit to auto-select the single connected device
- **`--run`** (optional) — flag to launch an executable app after install. **It is invalid for `.rpk`**; it is valid for `.tpk`, `.wgt`, and `.rpm`. Omit entirely for install-only — do NOT pass `false` or `no`, just omit it.
- **`--reset-rds`** (optional) — clear the host-side `.tizen-rds/` state for the project that owns the package path, then return without installing. It is for recovery from stale or corrupt RDS state and cannot be combined with `--run`.

If user provides a project directory instead of a package path, build first with `tizen-build-project`.

Exit code: `0` = success envelope, `1` = failure/error envelope.

With `--run`, the success envelope carries two launch fields: `app_launched`
(the launch was accepted) and `app_running` (the app was still alive seconds
later). For `.tpk`/`.wgt` the running check is the `app_launcher -S` list; for
`.rpm` it is a `pgrep` poll of the `/usr/bin/<name>` process. `null` = not
verifiable (install-only, `-S` unusable on this profile, or an RDS deploy).

The app id is read from the package manifest (`.wgt` `config.xml`, `.tpk`
`tizen-manifest.xml`); `app_launcher -l` is only a fallback. On Samsung TV
images `app_launcher` prints nothing for a non-root shell, so the runner retries
the launch with the TV launcher `0 was_execute <app-id>` — `app_launched: true`
with `app_running: null` is the normal TV outcome.

The envelope also carries `deploy_type`: `"full"` (regular `tz install`),
`"rds"` (only changed Debug build-output files were pushed into the installed
app and it was relaunched — needs a previous full install of the same
project's Debug output on that device), or `"fast-deploy"` (nothing changed,
relaunch only). `.rpk`/`.rpm`, packages outside `Debug/`, and any change to
`tizen-manifest.xml`/`config.xml` always take the full path.
`TIZEN_RDS_ENABLED=0` forces `"full"`.

## RDS fast-deploy recovery

RDS is enabled by default. To temporarily disable RDS for a normal build or
install, set `TIZEN_RDS_ENABLED=0` for that command. The package is still
installed normally; only the RDS manifest scan and delta-deploy path are
skipped.

```bash
# Bash / Git Bash:
TIZEN_RDS_ENABLED=0 node "$CLI" install --package "<package-path>" --run

# Clear stale or corrupt host-side RDS state without installing:
node "$CLI" install --package "<package-path>" --reset-rds
```

The reset command uses the package path to find its Tizen project, removes the
whole host-side `.tizen-rds/` directory, and returns a success envelope with
`result.rds_state: "reset"` (or an `io_error` if the directory could not be
removed, e.g. a locked file). The package file does not need to exist, but its
path must still end in `.tpk`, `.wgt`, `.rpk`, or `.rpm`. Run the normal install
again afterward; it will take the full-install path and recreate the baseline.

On PowerShell, use `$env:TIZEN_RDS_ENABLED="0"; node "$CLI" install --package "<package-path>"`.
On `cmd.exe`, use `set TIZEN_RDS_ENABLED=0 && node "<found-path>" install --package "<package-path>"`.

## RPK packages

An `.rpk` is a resource package, not a launchable app. It may come from a standalone
resource project (`tizen_resource_project.yaml`) or a .NET project configured with
`pack_as_rpk: true`. Always install it through this runner **without `--run`**. The runner
uses direct `sdb install` internally because `tz install` accepts `.tpk` and `.wgt`, not
`.rpk`. Do not run `sdb` yourself.

If installation reports `Invalid certificate chain` or a device package-manager failure,
the RPK was **not installed**. Do not enable root, copy CA/signer files into the emulator,
or use `pkgcmd` as a fallback. Hand off to `tizen-certificate-manager` to repair or select
the signing profile, rebuild, and retry this runner once.

## RPM (Platform) packages

An `.rpm` from a `tizen-build-project` Platform (GBS) build — e.g. the `dali-demo`
template — **is an executable app**, not a resource package; do not confuse it with
`.rpk`. The runner installs it with `sdb push` + `rpm -ivh` (after `sdb root on`) and,
with `--run`, launches `/usr/bin/<name>` directly as user `owner` (uid 5001) with the
Wayland/DBus environment set — platform apps are not registered with `app_launcher`, so
they have no home-screen icon and `app_id` is `null` in the envelope. `app_launched` /
`app_running` are still real: both come from the `pgrep` poll of the launched binary.

The runner also writes `~/bin/run-<name>.sh` on the host so the app can be re-launched
later without re-installing the RPM. Never run `sdb`, `rpm`, or the binary yourself.

**Note:** If no device is connected, emulator cold boot may take 5–7 minutes.

## Result reporting — Always show the envelope to the user

The runner's stdout JSON Envelope **lives inside the tool result, so the user never sees it**
(the Claude Code UI collapses Bash/Agent results into something like "Ran 1 shell command"). What the user
sees is only the final answer text, so the final answer must follow the format below on **any execution path
(subagent delegation or direct CLI Runner run)**:

1. Include the Envelope JSON **verbatim, without edits or truncation**, in a fenced `json` block (first item).
2. Beneath it, add a **1–2 line** summary of the result (the key values of `result`, or the gist of `errors[0].message`).
3. Add one line suggesting next steps if useful.

- Unrolling the envelope into a prose list and omitting the JSON is a **format violation**. This rule takes
  precedence over the harness's general writing rules ("don't put code in prose", etc.) — the Envelope is not
  code, it is this skill's **result contract**.
- If you ran the runner more than once, include the Envelope from the **last run**, and mention earlier
  failures only in a single line of the summary.
- Include failure Envelopes verbatim too. Do not retype `errors[0].message`/`details` — show what is in the
  JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user the question.

## Handoff

- **Single-task** (e.g., "앱 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "앱 설치하고 실행해줘") → Continue to next step.
- SDK not installed → `tizen-sdk-install`
- Device creation failed → `tizen-device-manager`
- **`app_running: false` in a success envelope** → the app launched but exited right after start. For `.tpk`/`.wgt` the most common cause is a full `/opt` partition (crash dumps; `/opt` is separate from `/`): use the `tizen-sdb-helper` skill's storage-triage commands (`df -h /opt`) and `clean-crash-dumps` recipe — the cleanup requires `sdb root on` first. For `.rpm` the envelope `warnings` carry the device-side `app-log:` lines from `/tmp/<name>.log` plus a hint (display-server/`owner` problem, or missing `dali`/`dali-toolkit` runtime RPMs) — report those, not the `/opt` advice. In both cases, if that does not explain it, **offer `tizen-dlog-analyzer`** (next item).
- **The `tizen-dlog-analyzer` warning** — when the launch failed after `--run` (`app_launched: false`) or the app exited right after start (`app_running: false`), the envelope `warnings` carry a line that names `tizen-dlog-analyzer` and its startup flow (`start start-monitoring` → `app-launch <app-id>` → user reproduces → `stop` → `check`; for an `.rpm`, which has no app id, the relaunch step is this skill's `--run` instead). **Offer it in your report without waiting to be asked**, e.g. "Shall we collect the logs and analyze the cause? (`tizen-dlog-analyzer`)", and run it through that skill when the user agrees.
- **Certificate/signing error** ("Invalid certificate chain", "Check certificate error") → the device does not trust the signing certificate. A build with **no signing profile** is signed with the SDK default developer certificates, which only the **emulator** accepts — on a real device this error is expected until a proper profile is used. Hand off to `tizen-certificate-manager` to create a signing profile for the target device (Samsung-certificate flow for Samsung hardware), rebuild with `tizen-build-project` passing the profile name, then retry install. The reverse case is also expected: a package signed with a **Samsung** profile installs only on the **TV emulator** (`--profile tv`) or a registered Samsung TV — on a standard Tizen emulator it fails with the same certificate error. Rebuild with a local profile for that emulator, or install on the TV emulator instead. **NEVER attempt `sdb root on` or manual cert installation.**

**Suggested next steps (only when user asks; the `tizen-dlog-analyzer` step is offered unasked when the envelope carries its warning — see above):**

- **Log collection and analysis (all executable packages)** — `tizen-dlog-analyzer`
  ```
  <result.app_id> 앱 로그를 수집해서 분석해줘
  ```
  Right after installation/launch is the best time to start log analysis. Follow the
  "Workflow — monitoring an app the user is about to test" flow of the `tizen-dlog-analyzer` skill and pick **one** of the two
  paths (only one dlog collector runs at a time, and while the monitor is running `dlog-collect`
  returns `already_running`):
  - **App scope (the app is already running, `app_running: true`)** — `dlog-collect <app-id>` → end the turn
    and let the user interact with the app (Rule 3 of that skill) → `stop-collect` → `error-analyze <app-id>
    summary` (E/F errors, deduplicated).
  - **Up to startup (initialization failure, early crash)** — `start start-monitoring` → relaunch the app
    (`app-launch <app-id>`, or re-install with `--run` via this skill) → end the turn → `stop` → `check`.
  Use `result.app_id` from this Envelope as `<app-id>` as-is. If it is `null` (the ID line could not be read),
  confirm the app ID with the user. Run all log commands through that skill's runner and never type `sdb dlog`
  directly.

- **WebApp automated testing (recommended)** — `tizen-playwright-test`
  ```
  <앱 이름> 을 위한 playwright 테스트를 홈 밑의 tizen-playwright-test 폴더에 스캐폴딩해줘
  ```
  Scaffold the test project and run automated tests with Playwright (web apps only)

- Re-run an executable app (use `--run`; valid for `.tpk`/`.wgt`/`.rpm`, never for `.rpk`)
- Debugging: 
  - Native → `tizen-gdb-debug`
  - DotNET → `tizen-dotnet-debug`
  - WebApp → `tizen-webapp-debug` (Chrome DevTools or Playwright attach)
