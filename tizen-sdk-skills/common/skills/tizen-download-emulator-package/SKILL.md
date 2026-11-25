---
name: tizen-download-emulator-package
description: Download Tizen emulator package, emulator package download, 에뮬레이터 패키지 다운로드, 에뮬레이터 패키지 다운로드해줘, TIZEN Emulator package, install emulator package, emulator package install, 에뮬레이터 패키지 설치. Use this skill to download and install the Tizen emulator package (TIZEN-{platform_version}-Emulator) from the Tizen package repository. Reads the repository URL from repository.info. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-11-24"
  keywords:
    - emulator package
    - emulator package download
    - TIZEN-Emulator
    - 에뮬레이터 패키지
    - 에뮬레이터 패키지 다운로드
    - repository.info
    - emulator install
---

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-download-emulator-package` agent with the Agent tool
2. Pass the collected inputs (platform_version, force option) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary below it)

### Prerequisite: Tizen SDK must be installed

The emulator package is an **extension package** of the Tizen SDK, so the Tizen SDK must be installed first.

- **Tizen SDK installed** → proceed with the emulator package download
- **Tizen SDK not installed** → abort the installation and return an error envelope:
  - "The Tizen SDK must be installed first. Install the SDK using the tizen-sdk-install skill."

### downloadEmulatorPackage() Flow

```
1. Check whether the Tizen SDK is installed (sdk.info) ← abort if not installed
2. Is the emulator package already installed? (check the platform version record in the .emulator-package-installed marker) ← return success only when the requested version is recorded
3. Return the emulator package download script command (suggested_fix) — the agent runs it as Phase 2
```

### What the download script does

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `{PKG_REPO_URL}/pkg_list_{OS}-{32,64}` from the Tizen package repository
3. Parses the package list (Package, Version, Path, SHA256, Install-dependency, etc.)
4. If `--platform-version` is specified, targets `TIZEN-{version}-Emulator`; otherwise auto-detects the latest TIZEN-X.Y platform and uses `TIZEN-{latest}-Emulator`
5. Recursively resolves all Install-dependency packages of the emulator package
6. Downloads each package zip from `{PKG_REPO_URL}{Path}` and extracts/merges `data/` into the SDK root
7. Resolves the shared `Emulator` tools too (emulator-manager, etc.) and refreshes outdated ones — keeps platform plugins and the shared manager in sync
8. Creates/updates the `.emulator-package-installed` marker on success (one `Platform version: X.Y` record per installed platform — a 10.0 record does not satisfy an 11.0 request)
9. Reports summary: OK / skipped / failed counts

### repository.info

During SDK install, a CDN mirror is automatically selected based on the system timezone and stored in `.package/repository.info`. The emulator package downloader reads this file to download from the same mirror — **no further timezone check is needed**. If `repository.info` is missing (e.g., SDK was installed before this feature), the downloader falls back to the official repository (`https://download.tizen.org/sdk/tizenstudio/official`).

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/download-emulator-package-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\download-emulator-package-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*download-emulator-package-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*download-emulator-package-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*download-emulator-package-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*download-emulator-package-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Optional: `node "$CLI" --platform-version 10.0` (specify platform version), `node "$CLI" --force` (force reinstall), `--download-jobs <1-8>` (concurrent download jobs, default 4)

Exit code: `0` = success (emulator package already installed), `1` = `needs_action` (emulator package not installed — proceed to Phase 2) or `failure` (Tizen SDK not installed).

## Phase 2 — Download & Install (when Phase 1 says "not installed")

When the pre-check returns `status: "needs_action"` (`error_category: "install_required"`) with `suggested_fix.command`, run that installer
command. The download may take a few minutes. **How to run it depends on the harness:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the download keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-download-emulator-package -- …`)
**with escalated permissions** (it downloads; the default sandbox disables network). It returns a job
receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1 pre-check to verify.
Never run `suggested_fix.command` in the Codex foreground. Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify `.emulator-package-installed` exists
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**
- Run the installer in foreground (may exceed the Bash tool's 10-min cap)
- Poll/sleep while waiting

### Cline — FOREGROUND execution (Cline has no background completion notification)

Cline does not wake the agent again even when a background job finishes (no `<task-notification>`).
Run it in the background and the completion report is lost forever. Always run it in the **foreground** —
Cline's `execute_command` has no 10-minute limit and waits, streaming the progress log, until the command exits.

1. Run the installer command from `suggested_fix` in the **FOREGROUND** — copy it verbatim.
   It blocks a few minutes; that is expected.
   Do NOT background it: no `Start-Process`, no `start /b`, no trailing `&`.
2. When the command exits, **in the SAME turn** re-run the Phase 1 pre-check CLI to verify `.emulator-package-installed` exists
3. **Proactively** report the final success/failure envelope — do not end your turn
   before reporting the installation success/failure. Waiting until the user asks "is it done?" is a bug.

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether `.emulator-package-installed` exists.

**Do NOT (any harness):**
- Parse installer output as JSON (it's human-readable text only)

## Post-install — ensure the default standard emulator VM (agent step, not the script)

The download script only puts packages on disk; it never creates a VM. After the install is
verified (both paths: a fresh install, and the idempotent "already installed" pre-check result),
the **agent** ensures a default standard emulator VM exists:

1. Locate the emulator-manager runner the same way as the Phase 1 pre-check (same lookup blocks),
   but with the runner file name `emulator-manager-cli.js`.
2. Run `node "$CLI" list-vm --detail` once, then check `result.vms` once per
   installed `tizen`-profile image. Platforms can ship more than one
   architecture image (e.g. tizen 9.0 has both `tizen-9.0-x86` and
   `tizen-9.0-x86_64`), so iterate over ALL entries in the Phase 1 envelope's
   `result.installed_images` whose `profile` is `tizen` (their `image` field;
   ignore `tv-samsung` entries, they belong to `tizen-tv-sdk-install`):
   - Expected default VM name: `T-` + the image minus its first segment —
     `tizen-9.0-x86_64` → `T-9.0-x86_64`, `tizen-9.0-x86` → `T-9.0-x86`.
   - **A VM with that name exists → done for this image.** Skip creation and
     say so in one line.
   - **Not present → always create it** with em-cli's own default-VM mode:
     `node "$CLI" create --default --platform <image>`
     em-cli rewrites `default-<image>` into the SDK's canonical default VM name
     (e.g. `default-tizen-9.0-x86_64` → `T-9.0-x86_64`) — the same dotted name
     the native Emulator Manager and the Tizen VS Code extension create (the
     `-d` mode bypasses em-cli's VM-name character check, so the dots are
     valid). No `--size`: the platform's default template (1080) applies. No
     `--vm-name`: it is derived from the platform.
     The decision is by name only — other `tizen`-profile VMs (user-created or
     leftover) do not suppress the default VM, and the create runner is
     idempotent-safe to run whenever the default-named VM is absent.
     Do NOT pass `--launch` — booting is `tizen-launch-emulator`'s job.
3. Best-effort: a VM-creation failure is reported as a **warning** in the summary and never
   changes the download result — the package install already succeeded.
4. Report the create/list envelope **after** the download envelope (two fenced `json` blocks).

This step is agent-orchestrated on purpose: it reuses `tizen-create-emulator`'s runner instead of
duplicating VM-creation logic in the installer scripts, and it stays out of standalone/headless
runs of the installer. (The mandatory size question of `tizen-create-emulator` does not apply
here — 1080 is fixed by this skill as the default-VM resolution.)

## Result reporting — the envelope must always be shown to the user

The runner's stdout JSON Envelope is **inside the tool result, so the user cannot see it**
(the Claude Code UI folds Bash/Agent results away as "Ran 1 shell command"). What the user
sees is only the final answer text, so the final answer must follow the format below
**no matter which execution path was used (subagent delegation or direct CLI Runner run)**:

1. Put the Envelope JSON **verbatim, without modification or truncation** in a fenced `json` block (first item).
2. Below it, append a **1–2 line** summary of the result (the key values of `result` or the gist of `errors[0].message`).
3. If needed, add one line suggesting next steps.

- Expanding the Envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general writing rules ("no code in prose", etc.) — the Envelope is not
  code but this skill's **result contract**.
- If the runner was run multiple times, include the Envelope from the **last run**, and mention earlier
  failures in at most one line in the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`;
  show what is inside the JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user.

## Handoff

- **Single-task** (e.g., "에뮬레이터 패키지 다운로드해줘") → DONE after the "Post-install — ensure
  the default standard emulator VM" step: report the download envelope (and the create/list
  envelope if a VM was created), then suggest next steps.
- **Multi-step** (e.g., "에뮬레이터 패키지 다운로드하고 에뮬레이터 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-launch-emulator` (launch the default VM that was just ensured)
- `tizen-create-emulator` (create a new emulator VM)
- `tizen-device-manager` (verify device/emulator connection)
