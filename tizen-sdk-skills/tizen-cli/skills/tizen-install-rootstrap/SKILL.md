---
name: tizen-install-rootstrap
description: Install custom rootstrap, tizen install rootstrap, 타이젠 커스텀 루트스트랩 설치, rootstrap package install, cross-compilation toolchain, custom sysroot. Use this skill to install a custom rootstrap package from a ZIP file into the Tizen SDK for cross-compilation.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - Tizen rootstrap
    - custom rootstrap
    - rootstrap install
    - cross-compilation
    - sysroot
    - toolchain
    - 타이젠 루트스트랩
    - 커스텀 루트스트랩
---

# Tizen Install Rootstrap

## When to use

The user provides a custom rootstrap ZIP file path and asks to install it into the Tizen SDK. This enables cross-compilation for specific target platforms or architectures.

## Prerequisites

Run the pre-check first to validate the ZIP file and detect its structure:

```
tizen-cli tizen-sdk install-rootstrap --zip-path <path-to-rootstrap.zip>
```

## Command

```
tizen-cli tizen-sdk install-rootstrap --zip-path <path> [--force]
```

| Option          | Required | Default | Description                                      |
| --------------- | -------- | ------- | ------------------------------------------------ |
| `--zip-path`    | yes      | -       | Absolute path to the rootstrap ZIP file          |
| `--force`       | no       | off     | Force reinstall even if rootstrap already exists |

## Two-phase flow (IMPORTANT)

This command follows a **two-phase installation pattern**:

1. **Phase 1 — pre-check**: Run the command above.
   - `status: "success"` → Rootstrap already installed (see `result.rootstraps[]`); nothing more to do.
   - `status: "failure"` → Installation needed. `errors[0].suggested_fix.command` contains a **ready-to-run installer command** (a `powershell -ExecutionPolicy Bypass -File ...` / `bash ...` invocation).

2. **Phase 2 — install**: Run `errors[0].suggested_fix.command` verbatim.
   - The installer validates the ZIP structure, extracts metadata, and copies files to the SDK.
   - Installation is typically fast (seconds to a minute depending on ZIP size).
   - Execution method depends on the harness:
     - **Claude Code**: Use `run_in_background: true` if the ZIP is large.
     - **Cline**: Run the command directly in the terminal.

3. **Verify**: After installation completes, re-run `tizen-cli tizen-sdk install-rootstrap --zip-path <path>` — it must now return `status: "success"`.

## ZIP Structure Detection

The installer automatically detects the ZIP structure:

- **`data/` layout**: Rootstrap files are under `data/` directory (common for Tizen SDK packages)
- **`tizen-studio/` layout**: Rootstrap files are under `tizen-studio/` directory

The detected structure type is reported in `result.structure_type`.

## Security Validation

The installer performs security checks:

- **Path traversal detection**: Rejects ZIP entries containing `..` in paths
- **Symlink rejection**: Refuses to extract symbolic links
- **Absolute path rejection**: Rejects entries with absolute paths

Warnings are reported in `result.warnings[]` if any non-critical issues are found.

## Output

- **Success `result`**:
  - `rootstraps[]`: List of installed rootstraps with name, architecture, profile, version
  - `structure_type`: Detected ZIP structure (`data` or `tizen-studio`)
  - `warnings[]`: Any warnings encountered during extraction
  - `installation_status`: `"installed"` or `"already_installed"`

- **Failure**:
  - `error_code`: e.g., `file_not_found`, `invalid_zip`, `security_violation`, `execution_error`
  - `suggested_fix.command`: The installer command to run (Phase 2)

## Rootstrap Metadata

The installer parses the rootstrap XML metadata under
`tools/smart-build-interface/plugins/*.core*.xml` inside the ZIP. Two filename formats are accepted:

- `{profile}-{version}-{device}.core.xml` — the Tizen SDK repository format, e.g. `tizen-10.0-device.core.xml`
- `{profile}-{version}-{device}.core.{public|private}.{timestamp}.xml` — custom builds that tag type and build time, e.g. `tizen-9.0-arm.core.public.20260819_095020.xml`

Extracted fields: profile, version, device; type and timestamp when present (informational only — the
rootstrap identity is `{profile}-{version}-{device}`). This metadata is reported in `result.rootstraps[]`.

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

- After installation, use the rootstrap for:
  - Building native apps: `tizen-cli tizen-sdk build-project --rootstrap <name>`
  - Cross-compilation setup
- List installed rootstraps: Check SDK's `rootstrap` directory
- Remove rootstrap: Manually delete from SDK's `rootstrap` directory (future command TBD)

## Example Flow

```bash
# Step 1: Pre-check
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-rootstrap.zip"

# Step 2: Run suggested fix command (if not already installed)
# The response will contain:
# errors[0].suggested_fix.command = "powershell -ExecutionPolicy Bypass -File C:\...\tizen-install-rootstrap.ps1 --zip-path ..."

# Step 3: Verify
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-rootstrap.zip"
# Should return status: "success" with rootstrap details
```
