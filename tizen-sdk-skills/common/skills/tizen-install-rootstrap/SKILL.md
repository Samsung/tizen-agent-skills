---
name: tizen-install-rootstrap
description: Install custom rootstrap, rootstrap install, 루트스트랩 설치, custom rootstrap installation. Use this skill to install a custom rootstrap package from a ZIP file into the Tizen SDK.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-21"
  keywords:
    - rootstrap install
    - custom rootstrap
    - 루트스트랩 설치
    - rootstrap package
    - cross-compilation
    - toolchain
---

### Claude Code (subagent delegation)

> If you have no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-install-rootstrap` agent with the Agent tool
2. Pass the collected inputs (zipPath, force option) as the prompt
3. Pass the subagent's JSON envelope to the user as-is — follow the "Result reporting" rules below
   (include the verbatim text in a fenced `json` block, with only a 1–2 line summary below it)

### Prerequisite: Tizen SDK must be installed

Custom rootstrap packages are **SDK extension packages**, so Tizen SDK must be installed first.

- **Tizen SDK installed** → Proceed with rootstrap installation
- **Tizen SDK NOT installed** → Abort with error: "The Tizen SDK must be installed first. Use the tizen-sdk-install skill to install the SDK."

### installRootstrap() Flow

```
1. Validate ZIP file path (security checks) ← path traversal, symlinks rejected
2. Verify Tizen SDK is installed (sdk.info) ← abort if not found
3. Check .rootstrap-installed marker ← present and no --force: success envelope from the marker, stop here
4. Extract ZIP to temporary directory
5. Detect ZIP structure (data/ or tizen-studio/)
6. Parse rootstrap XML metadata from plugins directory
7. Copy tools/ folder to SDK
8. Copy platforms/ folder to SDK
9. For tizen-studio structure: check native packages, copy as tizen-7.0
10. Create .rootstrap-installed marker on success
```

### What the installer does

1. **Validates ZIP path** for security:
   - Decodes URL-encoded sequences (prevent bypass attempts)
   - Rejects path traversal (`..`)
   - Normalizes Windows separators
   - Verifies `.zip` extension
   - Checks file existence

2. **Extracts ZIP** to temporary directory:
   - Location: `{SDK_TOOLS_PATH}/server/sdktools/rootstrap/extract-*`
   - Validates each ZIP entry for path traversal
   - Rejects encrypted entries and symlinks

3. **Detects ZIP structure**:
   - `data/` layout: Standard rootstrap package
   - `tizen-studio/` layout: Requires native development packages

4. **Parses rootstrap XML metadata** (`tools/smart-build-interface/plugins/*.core*.xml`). Two filename formats are accepted:
   - `{profile}-{version}-{device}.core.xml` — the Tizen SDK repository format, e.g. `tizen-10.0-device.core.xml` (packages such as `tizen-10.0-rs-device.core_<build>_ubuntu-64.zip`)
   - `{profile}-{version}-{device}.core.{public|private}.{timestamp}.xml` — custom builds that tag type and build time, e.g. `tizen-9.0-arm.core.public.20260819_095020.xml`
   - Extracts: profile, version, device; type and timestamp when present (informational only — the rootstrap identity is `{profile}-{version}-{device}`)

5. **Copies folders**:
   - `tools/` → `{SDK_PATH}/tools/`
   - `platforms/` → `{SDK_PATH}/platforms/`

6. **Special handling for tizen-studio structure**:
   - Checks for native development package
   - Copies platform as `tizen-7.0` for compatibility

7. **Creates marker file**: `.rootstrap-installed` with installation details

### Supported ZIP Structures

#### Structure 1: `data/` Layout

```
rootstrap.zip
└── data/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}].xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}]/
```

#### Structure 2: `tizen-studio/` Layout

```
rootstrap.zip
└── tizen-studio/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}].xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core[.{public|private}.{timestamp}]/
```

### CLI Runner (Cline / Claude Code — Phase 1: Pre-check)

This CLI is a **pre-check**, not the installer. It finishes in seconds. Run in foreground — **NEVER with `run_in_background: true`**.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/install-rootstrap-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" --zip-path "/path/to/rootstrap.zip"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\install-rootstrap-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" --zip-path "C:\path\to\rootstrap.zip"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*install-rootstrap-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" --zip-path "C:\path\to\rootstrap.zip"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Optional: 
- `node "$CLI" --zip-path "/path/to/rootstrap.zip" --force` (force reinstall)

Exit code: `0` = success (rootstrap already installed), `1` = `needs_action` (rootstrap not installed — proceed to Phase 2) or `failure` (Tizen SDK not installed).

## Phase 2 — Install (when Phase 1 says "not installed")

When the pre-check returns `status: "needs_action"` (`error_category: "install_required"`) with `suggested_fix.command`, run that installer command. The install may take a minute or two. **How to run it depends on the harness:**

### Codex CLI — `job-cli.js run` + `wait` (one exec call waits ≤ 30 s)

Codex cannot run the installer as a foreground tool call (30 s limit; a partial log would come back
while the install keeps running — issue #48). Use the Phase 1 envelope's
`suggested_fix.background_command` (`node "<lib/cli>/job-cli.js" run --script tizen-install-rootstrap -- …`)
**with escalated permissions** if it needs to fetch anything (the default sandbox disables network).
It returns a job receipt at once; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s
per call) until `job.state` is `done` (`result.exit_code`, `log_tail`), and re-run the Phase 1
pre-check to verify. Never run `suggested_fix.command` in the Codex foreground.
Recovery: `job-cli.js list` / `status --id`.

### Claude Code — Background + `<task-notification>`

1. Run the installer command from `suggested_fix` with the Bash tool, `run_in_background: true`
2. **END YOUR TURN** — wait for `<task-notification>` (do NOT poll/sleep)
3. After notification, re-run the Phase 1 pre-check CLI (foreground) to verify `.rootstrap-installed` exists
4. Report the final success/failure envelope to the user

**Do NOT (Claude Code):**
- Run the installer in foreground
- Poll/sleep while waiting

### Cline — run in FOREGROUND (Cline has no background completion notification)

Cline does not wake the agent again when a background job finishes (no `<task-notification>`).
If you run it in the background, the completion report is lost forever. Always run it in the
**foreground** — Cline's `execute_command` has no 10-minute limit and streams progress logs while
waiting for the command to finish.

1. Run the installer command from `suggested_fix` in the **FOREGROUND** — copy it verbatim.
   It blocks a minute or two; that is expected.
   Do NOT background it: no `Start-Process`, no `start /b`, no trailing `&`.
2. When the command exits, **in the SAME turn** re-run the Phase 1 pre-check CLI to verify `.rootstrap-installed` exists
3. **Proactively** report the final success/failure envelope — do not end your turn before
   reporting installation success/failure. Waiting until the user asks "끝났어?" ("is it done?") is a bug.

If the run state is unknown (interrupted session), just re-run the Phase 1 pre-check CLI —
it is idempotent and reports whether `.rootstrap-installed` exists.

**Do NOT (any harness):**
- Parse installer output as JSON (it's human-readable text only)

## Error Handling

The installer performs comprehensive security validation and will reject:

| Error | Cause | Solution |
|-------|-------|----------|
| `Path traversal detected` | ZIP entry contains `..` | Re-package ZIP without path traversal |
| `Symlink detected` | ZIP contains symbolic links | Re-package with actual files |
| `No rootstrap XML files found` | Missing `tools/smart-build-interface/plugins/*.xml` | Verify ZIP structure |
| `Could not determine ZIP structure` | No `data/` or `tizen-studio/` directory | Re-package with correct structure |
| `Tizen SDK is NOT installed` | SDK not found | Install Tizen SDK first |

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

- **Single-task** (e.g., "custom rootstrap 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "rootstrap 설치하고 프로젝트 빌드해줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-create-project` (create a new project using the rootstrap)
- `tizen-build-project` (build project with the new rootstrap)
- `tizen-device-manager` (verify device/emulator connection for deployment)
