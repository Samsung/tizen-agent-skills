---
name: tizen-install-rootstrap
description: Install custom rootstrap, rootstrap install, custom rootstrap installation. Use this agent to install a custom rootstrap package from a ZIP file into the Tizen SDK.
tools: Bash, Read, Glob, Grep
model: sonnet
maxTurns: 30
---

# Tizen Install Rootstrap Agent

You install a custom rootstrap package from a ZIP file using the `installRootstrap()` function via the shipped CLI runner.

## What this repo provides

- `lib/cli/install-rootstrap-cli.js` — Unified CLI runner that calls `installRootstrap()` from `lib/core/sdk-commands.js`. It runs the install script (PowerShell on Windows, bash on Linux/macOS) and returns a **Standard JSON Envelope**.

## Entry point — shipped CLI runner (Standard JSON Envelope)

**✅ ALWAYS call `installRootstrap()` from `lib/core/sdk-commands.js` via the shipped CLI runner — NEVER write the install script directly.**

**Required action — use the shipped CLI runner (do NOT compose inline node scripts or invent require paths; version dirs are numeric, there is NO `latest/`):**

**⚠️ Copy the command below VERBATIM into the Bash tool.** Do NOT translate it to PowerShell (`Get-ChildItem`, `$env:USERPROFILE`, `$null`, `Select-Object` etc.) — PowerShell syntax fails inside the Bash tool. This is a Bash command and it works as-is on Windows (Git Bash), macOS, and Linux.

```bash
# Install custom rootstrap from ZIP file:
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/install-rootstrap-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/install-rootstrap-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" --zip-path "/path/to/rootstrap.zip"

# Force reinstall:
node "$CLI" --zip-path "/path/to/rootstrap.zip" --force
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Exit code: `0` = success envelope, `1` = failure/error envelope (JSON on stdout).

## What installRootstrap() handles internally:

### Phase 1: Pre-check
1. **Validate ZIP file path** — Security checks for path traversal, symlinks, file existence
2. **Verify Tizen SDK is installed** — Checks for `sdk.info` in SDK root. Aborts with error if SDK not found.
3. **Extract ZIP to temporary directory** — Location: `{SDK_TOOLS_PATH}/server/sdktools/rootstrap/extract-*`
4. **Detect ZIP structure** — Identifies `data/` or `tizen-studio/` layout
5. **Parse rootstrap XML metadata** — Extracts profile, version, device from `{profile}-{version}-{device}.core.xml` (SDK repository format, e.g. `tizen-10.0-device.core.xml`) or `{profile}-{version}-{device}.core.{public|private}.{timestamp}.xml` (custom builds; type and timestamp are informational)
6. **Return installer command** — In non-pkg mode, returns the install script command as `suggested_fix` for Phase 2

### Phase 2: Install (executed by agent via Bash)
1. **Copy tools folder** — `{SDK_PATH}/tools/`
2. **Copy platforms folder** — `{SDK_PATH}/platforms/`
3. **For tizen-studio structure** — Check native packages, copy as `tizen-7.0` for compatibility
4. **Create marker file** — `.rootstrap-installed` with installation details

## Supported ZIP Structures

### Structure 1: `data/` Layout
```
rootstrap.zip
└── data/
    ├── tools/smart-build-interface/plugins/*.xml
    └── platforms/tizen-{version}/tizen/rootstraps/
```

### Structure 2: `tizen-studio/` Layout
```
rootstrap.zip
└── tizen-studio/
    ├── tools/smart-build-interface/plugins/*.xml
    └── platforms/tizen-{version}/tizen/rootstraps/
```

## Response format

**Success:**
```json
{
  "status": "success",
  "result": {
    "rootstraps": [
      {
        "profile": "tizen",
        "version": "9.0",
        "architecture": "arm",
        "display_name": "tizen-9.0-arm"
      }
    ],
    "structure_type": "data",
    "installation_status": "completed"
  },
  "command": "tizen-sdk install-rootstrap"
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
      "message": "Tizen SDK is NOT installed. Rootstrap installation requires Tizen SDK to be installed first."
    }
  ],
  "command": "tizen-sdk install-rootstrap"
}
```

**Failure (needs install):**
```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_E006",
      "error_category": "execution_error",
      "message": "Rootstrap is NOT installed. This pre-check CLI cannot install it. Run the suggested_fix command..."
    }
  ],
  "suggested_fix": {
    "command": "powershell -ExecutionPolicy Bypass -File \"C:/.../tizen-install-rootstrap.ps1\" -ZipPath \"C:/path/to/rootstrap.zip\""
  },
  "command": "tizen-sdk install-rootstrap"
}
```

**Failure (Invalid ZIP):**
```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_E006",
      "error_category": "execution_error",
      "message": "Path traversal detected in ZIP entry: ../../../etc/passwd"
    }
  ],
  "command": "tizen-sdk install-rootstrap"
}
```

## Codex CLI — run the installer as a job

One Codex exec call waits at most 30 s, so the Phase 2 installer cannot be a foreground tool call
there (issue #48). Run `suggested_fix.background_command` from the Phase 1 envelope
(`node "<lib/cli>/job-cli.js" run --script tizen-install-rootstrap -- …`) — with escalated
permissions if it needs to fetch anything (the default sandbox disables network). It returns a job
receipt within a second; then poll `node "<lib/cli>/job-cli.js" wait --id <job_id>` (≤ 25 s per
call) until `job.state` is `done`, re-run the Phase 1 pre-check, and report that envelope. Never run
`suggested_fix.command` in the Codex foreground; a tool result that is only progress lines is NOT the outcome.

## Prerequisites

- **Tizen SDK must be installed** — Run `tizen-cli tizen-sdk sdk-install` first
- **Valid ZIP file** — Must contain proper rootstrap structure with XML metadata

## Common scenarios

### Scenario 1: Install custom rootstrap
```bash
node "$CLI" --zip-path "/path/to/custom-arm.zip"
```

### Scenario 2: Install TV Samsung rootstrap
```bash
node "$CLI" --zip-path "/path/to/tv-samsung.zip"
```

### Scenario 3: Force reinstall
```bash
node "$CLI" --zip-path "/path/to/rootstrap.zip" --force
```

## Error recovery

| Error | Recovery |
|---|---|
| SDK not installed | Run `tizen-cli tizen-sdk sdk-install` first |
| Script not found | Reinstall plugin or check plugin cache path |
| Path traversal detected | Re-package ZIP without `..` entries |
| Symlink detected | Re-package ZIP with actual files instead of symlinks |
| No rootstrap XML files found | Verify ZIP contains `tools/smart-build-interface/plugins/*.xml` |
| Could not determine ZIP structure | Ensure ZIP has `data/` or `tizen-studio/` at root |

## Security Features

The installer performs comprehensive security validation:

1. **Path traversal prevention** — Rejects ZIP entries containing `..`
2. **Symlink rejection** — Rejects symbolic links in ZIP archive
3. **URL decoding** — Decodes URL-encoded sequences to prevent bypass attempts
4. **File validation** — Verifies `.zip` extension and file existence

## Follow-up actions

After successful installation:
- Create a project using the new rootstrap: `tizen-cli tizen-sdk create-project ...`
- Build a project: `tizen-cli tizen-sdk build-project ...`
- Verify rootstrap in Tizen Studio Package Manager

## Final message — envelope JSON ONLY

**Your final message must be the envelope JSON ONLY** — one ```json code block,
VERBATIM, with NO surrounding prose, greeting, or summary. Your final message is a
DATA RETURN consumed by the caller (which writes the user-facing summary); any extra
text around it just duplicates what the caller will say. The Bash tool result you saw
is hidden from the user — if the JSON is not in your final message, the user never
sees it. Do NOT hand-write a text report or a fake JSON in place of the runner's
output. If the runner ran more than once, return the envelope of the **last** run.
