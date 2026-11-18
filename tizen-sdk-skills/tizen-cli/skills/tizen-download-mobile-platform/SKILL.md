---
name: tizen-download-mobile-platform
description: Download Tizen Mobile platform, 모바일 플랫폼 다운로드, MOBILE platform download, IOT-Headed extension download, download MOBILE-{version}, download IOT-Headed extension. Use this skill to download and install the Tizen Mobile platform package (MOBILE-{version}) from the Tizen package repository, with optional IOT-Headed extension support.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-13"
  keywords:
    - Tizen Mobile platform
    - MOBILE platform download
    - IOT-Headed extension
    - 타이젠 모바일 플랫폼
    - 모바일 플랫폼 다운로드
---

# Tizen Download Mobile Platform

## When to use

The user asks to download and install the Tizen Mobile platform package (MOBILE-{version}) or the IOT-Headed extension. This skill:

1. Downloads the MOBILE-{version} platform package and its dependencies from the Tizen package repository
2. Optionally downloads the IOT-Headed extension by:
   - First downloading `{pkg_repo}/extension_info.xml` to get the IoT Headed repository URL
   - Then downloading `pkg_list_{os}-{64,32}` from the IoT repository
   - Finally downloading and installing `IOT-Headed-{version}` package

**Prerequisites:** Tizen SDK must be installed first (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
# Download Mobile platform only (auto-detects latest MOBILE-X.Y):
tizen-cli tizen-sdk download-mobile-platform

# Download specific Mobile platform version:
tizen-cli tizen-sdk download-mobile-platform --platform-version 10.0

# Download Mobile platform with IOT-Headed extension:
tizen-cli tizen-sdk download-mobile-platform --include-iot-headed

# Download Mobile platform with specific IOT-Headed version:
tizen-cli tizen-sdk download-mobile-platform --include-iot-headed --iot-headed-version 10.0

# Force reinstall:
tizen-cli tizen-sdk download-mobile-platform --force
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--platform-version <version>` | no | Auto-detect latest | Tizen Mobile platform version (e.g., 10.0, 11.0). Auto-detects the latest MOBILE-X.Y if not specified. |
| `--include-iot-headed` | no | false | Also download and install the IOT-Headed extension. First downloads `extension_info.xml` to get the IoT Headed repository URL, then downloads `IOT-Headed-{version}`. |
| `--iot-headed-version <version>` | no | Auto-detect latest | Specific IOT-Headed version to install. Requires `--include-iot-headed`. Auto-detects latest if not specified. |
| `--force` | no | false | Force reinstall even if already installed |
| `--download-jobs <count>` | no | `4` | Number of concurrent download jobs (1-8) |

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → Mobile platform already installed.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool. For long-running downloads (several minutes), use `run_in_background: true` (Claude Code) or run in foreground (Cline).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk download-mobile-platform` and confirm `status: "success"`.

## IOT-Headed Extension Download Flow

When `--include-iot-headed` is specified:

1. Download `extension_info.xml` from the main package repository
2. Parse the XML to extract the IoT Headed repository URL (looks for `<extension name="IoT-Headed"><repository>URL</repository></extension>`)
3. Download `pkg_list_{OS}-{64,32}` from the IoT repository
4. Auto-detect or use specified `IOT-Headed-{version}` package
5. Resolve and download IOT-Headed package and its dependencies
6. Merge into SDK root and create marker

## Output

- **Success `result`**: Mobile platform package/installation status, plus `iot_headed_installed: true/false` if IOT-Headed was requested
- **Failure**: `error_code`, `message`, optional `suggested_fix.command`

## Markers Created

- `.mobile-platform-installed` — Created in SDK root after successful Mobile platform installation
  - Contains: Target package name, platform version, and IOT-Headed status if applicable

## Result reporting — the envelope MUST be shown to the user

The JSON Envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **inside the tool
result and therefore invisible to the user** (the Claude Code UI collapses Bash output into
something like "Ran 1 shell command"). Run directly in a terminal, the JSON is visible as is,
but in an agent session the user sees only the final answer text. The final answer must
therefore follow this format:

1. Include the Envelope JSON **verbatim, without modification or truncation**, in a fenced
   `json` block (first item). Exclude the `[DEBUG] ...` lines printed to stderr — they are
   not part of the Envelope.
2. Below it, append a **1–2 line** result summary (the key values of `result` or the gist of
   `errors[0].message`).
3. If needed, add one line suggesting next steps.

- Spelling the Envelope out as prose and omitting the JSON is a **format violation**. This
  rule takes precedence over the harness's general authoring rules ("don't put code in
  prose", etc.) — the Envelope is not code, it is this skill's **result contract**.
- If the command was run multiple times, include the Envelope from the **last run** and
  mention earlier failures only in a single line of the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details` —
  show what is in the JSON as is.
- Show a `user_input_required` Envelope as is, then ask the user the question.

## Follow-ups

- Download emulator package: `tizen-cli tizen-sdk download-emulator-package ...`
- Create a Mobile project: `tizen-cli tizen-sdk create-project ...`
- Build a project: `tizen-cli tizen-sdk build-project ...`
- Install on device: `tizen-cli tizen-sdk install-app ...`

## Example Flow

```
# Step 1: Check if SDK is installed (prerequisite)
tizen-cli tizen-sdk sdk-install

# Step 2: Download Mobile platform with IOT-Headed extension
tizen-cli tizen-sdk download-mobile-platform --include-iot-headed

# If Phase 1 returns suggested_fix, execute it:
# (The agent runs the installer script in background/foreground)

# Step 3: Verify installation
tizen-cli tizen-sdk download-mobile-platform
# Should return status: "success" with iot_headed_installed: true
```

## Error Handling

| Error | Cause | Resolution |
|---|---|---|
| `sdk_path_invalid` | Tizen SDK not installed | Run `tizen-cli tizen-sdk sdk-install` first |
| `execution_error` (script not found) | CLI runner script missing | Reinstall the plugin or check plugin cache |
| `execution_error` (download failed) | Network/repository unreachable | Check network connection and repository URL |
| `execution_error` (extension_info.xml not found) | IOT-Headed extension not available in repository | The repository may not support IOT-Headed; try without `--include-iot-headed` |
