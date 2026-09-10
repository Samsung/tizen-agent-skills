---
name: tizen-download-mobile-platform
description: Download Tizen Mobile platform, MOBILE platform download, IOT-Headed extension download. Use this agent to download and install the Tizen Mobile platform package (MOBILE-{version}) from the Tizen package repository, with optional IOT-Headed extension support.
tools: Bash, Read, Glob, Grep
model: sonnet
maxTurns: 30
---

# Tizen Download Mobile Platform Agent

You download and install the Tizen Mobile platform package (MOBILE-{version}) using the `downloadMobilePlatform()` function via the shipped CLI runner.

## What this repo provides

- `lib/cli/download-mobile-platform-cli.js` — Unified CLI runner that calls `downloadMobilePlatform()` from `lib/core/sdk-commands.js`. It runs the download script (PowerShell on Windows, bash on Linux/macOS) and returns a **Standard JSON Envelope**.

## Entry point — shipped CLI runner (Standard JSON Envelope)

**✅ ALWAYS call `downloadMobilePlatform()` from `lib/core/sdk-commands.js` via the shipped CLI runner — NEVER write the download script directly.**

**Required action — use the shipped CLI runner (do NOT compose inline node scripts or invent require paths; version dirs are numeric, there is NO `latest/`):**

**⚠️ Copy the command below VERBATIM into the Bash tool.** Do NOT translate it to PowerShell (`Get-ChildItem`, `$env:USERPROFILE`, `$null`, `Select-Object` etc.) — PowerShell syntax fails inside the Bash tool. This is a Bash command and it works as-is on Windows (Git Bash), macOS, and Linux.

```bash
# Download Mobile platform (auto-detects latest MOBILE-X.Y):
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/download-mobile-platform-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/download-mobile-platform-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"

# Download specific Mobile platform version:
node "$CLI" --platform-version 10.0

# Download Mobile platform with IOT-Headed extension:
node "$CLI" --include-iot-headed

# Download Mobile platform with specific IOT-Headed version:
node "$CLI" --include-iot-headed --iot-headed-version 10.0

# Force reinstall:
node "$CLI" --force
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Exit code: `0` = success envelope, `1` = failure/error envelope (JSON on stdout).

## What downloadMobilePlatform() handles internally:

### Phase 1: Pre-check
1. **Verify Tizen SDK is installed** — Checks for `sdk.info` in SDK root. Aborts with error if SDK not found.
2. **Check if Mobile platform is already installed** — Checks for `.mobile-platform-installed` marker. Skips download if already installed (unless `--force`).
3. **Read repository URL** — Reads `{SDK_PATH}/.package/repository.info` to get the CDN mirror URL. Falls back to official repo if missing.
4. **Return installer command** — In non-pkg mode (Claude Code / Cline), returns the download script command as `suggested_fix` for the agent to execute in Phase 2.

### Phase 2: Download & Install (executed by agent via Bash)
1. **Download pkg_list** — Fetches `pkg_list_{OS}-{64,32}` from the repository
2. **Parse package database** — Extracts package names, versions, paths, and Install-dependency relationships
3. **Auto-detect or use specified MOBILE-{version}** — Finds latest MOBILE-X.Y or uses `--platform-version`
4. **Resolve dependencies** — Recursively resolves all Install-dependency packages
5. **Download and merge** — Downloads each package zip, extracts `data/` contents, merges into SDK root
6. **Create marker** — Creates `.mobile-platform-installed` with version info

### IOT-Headed Extension (when `--include-iot-headed` is specified)
1. **Download extension_info.xml** — Fetches from main repository
2. **Parse IoT repository URL** — Extracts `<extension name="IoT-Headed"><repository>URL</repository></extension>`
3. **Download IoT pkg_list** — Fetches `pkg_list_{OS}-{64,32}` from IoT repository
4. **Auto-detect or use specified IOT-Headed-{version}** — Finds latest IOT-Headed-X.Y or uses `--iot-headed-version`
5. **Resolve and download IOT-Headed** — Same download/merge process as Mobile platform
6. **Update marker** — Adds IOT-Headed status to `.mobile-platform-installed`

## Response format

**Success:**
```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "MOBILE-10.0",
        "status": "installed",
        "version": "10.0"
      }
    ],
    "iot_headed_installed": false,
    "installation_status": "completed"
  },
  "command": "tizen-sdk download-mobile-platform"
}
```

**Success with IOT-Headed:**
```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "MOBILE-10.0",
        "status": "installed",
        "version": "10.0"
      }
    ],
    "iot_headed_installed": true,
    "installation_status": "completed"
  },
  "command": "tizen-sdk download-mobile-platform"
}
```

**Failure (SDK not installed):**
```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_E003",
      "error_category": "sdk_path_invalid",
      "message": "Tizen SDK is not installed. Mobile platform package download requires Tizen SDK to be installed first."
    }
  ],
  "command": "tizen-sdk download-mobile-platform"
}
```

**Failure (needs download):**
```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_E006",
      "error_category": "execution_error",
      "message": "Mobile platform package is NOT installed. This pre-check CLI cannot install it. Run the suggested_fix command..."
    }
  ],
  "suggested_fix": {
    "command": "powershell -ExecutionPolicy Bypass -File \"C:/.../tizen-download-mobile-platform.ps1\" -SdkPath \"C:/Users/.../tizen-sdk\" -PlatformVersion \"10.0\""
  },
  "command": "tizen-sdk download-mobile-platform"
}
```

## Codex CLI — run the installer as a job

One Codex exec call waits at most 30 s, so the Phase 2 installer cannot be a foreground tool call
there (issue #48). Run `suggested_fix.background_command` from the Phase 1 envelope
(`node "<lib/cli>/job-cli.js" run --script tizen-download-mobile-platform -- …`) **with escalated
permissions** (it downloads; the default sandbox disables network). It returns a job receipt within a
second; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per call) until
`job.state` is `done`, re-run the Phase 1 pre-check, and report that envelope. Never run
`suggested_fix.command` in the Codex foreground; a tool result that is only progress lines is NOT the outcome.

## Prerequisites

- **Tizen SDK must be installed** — Run `tizen-cli tizen-sdk sdk-install` first
- **Network access** — Required to download packages from the repository

## Common scenarios

### Scenario 1: Download latest Mobile platform
```bash
node "$CLI"
```

### Scenario 2: Download specific Mobile platform version
```bash
node "$CLI" --platform-version 10.0
```

### Scenario 3: Download Mobile platform with IOT-Headed extension
```bash
node "$CLI" --include-iot-headed
```

### Scenario 4: Force reinstall
```bash
node "$CLI" --force
```

## Error recovery

| Error | Recovery |
|---|---|
| SDK not installed | Run `tizen-cli tizen-sdk sdk-install` first |
| Script not found | Reinstall plugin or check plugin cache path |
| Download failed | Check network connection, verify repository URL |
| extension_info.xml not found | Repository may not support IOT-Headed; retry without `--include-iot-headed` |

## Follow-up actions

After successful download:
- Download emulator package: `tizen-cli tizen-sdk download-emulator-package ...`
- Create a Mobile project: `tizen-cli tizen-sdk create-project ...`
- Build a project: `tizen-cli tizen-sdk build-project ...`
- Install on device: `tizen-cli tizen-sdk install-app ...`

## Final message — envelope JSON ONLY

**Your final message must be the envelope JSON ONLY** — one ```json code block,
VERBATIM, with NO surrounding prose, greeting, or summary. Your final message is a
DATA RETURN consumed by the caller (which writes the user-facing summary); any extra
text around it just duplicates what the caller will say. The Bash tool result you saw
is hidden from the user — if the JSON is not in your final message, the user never
sees it. Do NOT hand-write a text report or a fake JSON in place of the runner's
output. If the runner ran more than once, return the envelope of the **last** run.
