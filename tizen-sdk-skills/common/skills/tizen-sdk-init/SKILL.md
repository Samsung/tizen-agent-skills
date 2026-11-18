---
name: tizen-sdk-init
description: Initialize Tizen SDK path, SDK init, sdk path config, 타이젠 SDK 경로 설정, SDK 초기화, sdk init, set sdk path, configure sdk path. Use this skill to configure the Tizen SDK installation path by writing it to ~/.tizen.sdk.path.config. Validates that the path exists and is readable/writable before saving. Use after a manual SDK install or when the SDK is at a non-default path.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-22"
  keywords:
    - SDK init
    - SDK path
    - sdk path config
    - 타이젠 SDK 경로 설정
    - SDK 초기화
    - configure sdk path
    - set sdk path
---

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-sdk-init` agent via the Agent tool (personal deployment or `tizen-sdk-skills:tizen-sdk-init`)
2. Pass the collected inputs (SDK path) as the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary under it)

### CLI Runner (Cline / Claude Code, ALL platforms)

Use the shipped CLI runner. Find the runner path, then run `node` on it with the SDK path as an argument.

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-init-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" "/path/to/tizen-sdk"
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-init-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" "C:\Users\<username>\tizen-sdk"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" "C:\Users\<username>\tizen-sdk"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

If no path argument is provided, the default `~/tizen-sdk` is used.

Exit code: `0` = success (SDK path configured), `1` = failure (invalid path, permissions, or error).

## Parameters

- **sdkPath** — (optional) Tizen SDK installation path. Defaults to `~/tizen-sdk` (Windows: `%USERPROFILE%\tizen-sdk`).

## What initSdk() handles internally

1. **Path validation** — rejects empty or non-string paths
2. **Existence check** — verifies the SDK path exists on disk
3. **Permission check** — verifies read/write access to the SDK path
4. **Config file write** — writes the SDK path to `~/.tizen.sdk.path.config`
5. **POSIX permissions** — sets `0o600` on the config file (Linux/macOS only; Windows skips chmod)
6. **Standard JSON Envelope** — `sdk_path`, `config_file` on success

## Response

**Success (SDK path configured):**
```json
{
  "command": "tizen-sdk sdk-init",
  "status": "success",
  "result": {
    "sdk_path": "/home/user/tizen-sdk",
    "config_file": "/home/user/.tizen.sdk.path.config"
  }
}
```

**Failure (path does not exist):**
```json
{
  "command": "tizen-sdk sdk-init",
  "status": "failure",
  "errors": [{
    "error_code": "TIZEN_SDK_UNKNOWN_E001",
    "error_category": "sdk_path_invalid",
    "message": "SDK path does not exist: /wrong/path",
    "suggested_fix": {
      "command": "Verify that Tizen SDK is installed at /wrong/path",
      "auto_fixable": false
    }
  }]
}
```

**Failure (no read/write permission):**
```json
{
  "command": "tizen-sdk sdk-init",
  "status": "failure",
  "errors": [{
    "error_code": "TIZEN_SDK_UNKNOWN_E001",
    "error_category": "sdk_path_not_accessible",
    "message": "No read/write permission for SDK path: /restricted/path"
  }]
}
```

## When to use this skill

- After installing the Tizen SDK manually (not via `tizen-sdk-install` skill, which handles config automatically)
- When the SDK is installed at a non-default path and needs to be registered
- When `~/.tizen.sdk.path.config` is missing or points to a wrong/old location
- Before any skill that depends on the SDK path if the path was never configured

> **Note:** The `tizen-sdk-install` skill now **automatically calls `initSdk()`** after a
> successful install (both in the pre-check CLI and in the installer scripts), so running
> `sdk-init` separately is only needed when the SDK was installed manually or the config file
> needs to be updated to point to a different path.


## Result reporting — always show the envelope to the user

The JSON Envelope on the runner's stdout sits inside a tool result, so the user cannot see it
(the Claude Code UI collapses Bash/Agent results as "Ran 1 shell command"). The user only sees
the final answer text, so on **either execution path (subagent delegation or direct CLI Runner
execution)** the final answer must follow the format below:

1. Include the Envelope JSON **as-is, unmodified and unabridged** in a fenced `json` block (first item).
2. Under it, add a summary of the result in **1–2 lines** (the key values of `result`, or the gist of `errors[0].message`).
3. If needed, add a one-line suggestion of next steps.

- Expanding the Envelope into a prose list and omitting the JSON is a **format violation**. This rule takes precedence over the harness's general authoring rules ("don't put code in prose", etc.) — the Envelope is not code; it is this skill's **result contract**.
- If you ran the runner multiple times, include the Envelope of the **last run** and mention earlier failures only in a single line of the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`; show what is inside the JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user.

## Handoff

**Scope check:**
- **Single-task request** (e.g., "SDK 경로 설정해줘") → DONE. Report envelope.
- **Multi-step request** (e.g., "SDK 경로 설정하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-sdk-install` (install the Tizen SDK if not yet installed)
- `tizen-create-project` (create a new project)
- `tizen-build-project` (build a project)
- `tizen-device-manager` (verify device/emulator connection)
