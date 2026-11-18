---
name: tizen-dotnet-setup
description: Setup .NET development environment for Tizen, tizen dotnet setup, 타이젠 닷넷 개발 환경 설정, dotnet workload install tizen, .NET SDK 확인, Tizen workload 설치, 닷넷 워크로드 설치. Use this skill to verify the .NET SDK is installed and install the Tizen .NET workload before creating or building a DotNET Tizen project.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-28"
  keywords:
    - .NET SDK
    - Tizen workload
    - dotnet workload install tizen
    - 타이젠 닷넷 설정
    - 닷넷 워크로드
---

# Tizen .NET Setup

## When to use
Before creating or building a **DotNET** Tizen project, or when the user asks to set up the .NET/Tizen workload.

## Command

```
tizen-cli tizen-sdk dotnet-setup
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--force` | no | off | Reinstall the workload even if it exists |
| `--workload-version <version>` | no | latest | Specific Tizen workload version |
| `--no-install-sdk` | no | off | Do not auto-install a missing .NET SDK (by default one is installed user-scope — Linux/macOS `~/.dotnet`, Windows `%LOCALAPPDATA%\Microsoft\dotnet` — no sudo/admin needed) |
| `--sdk-channel <channel>` | no | 8.0 | .NET SDK channel for the auto-install |
| `--dotnet-root <dir>` | no | discovered | Use the .NET SDK at this install root (the directory holding `dotnet` and `sdk/`) instead of discovering one |
| `--persist-env` | no | off | Also persist a Tizen-extension-bundled dotnet into the user environment. Official install roots are always persisted; a bundled dotnet (`…/sdktools/dotnet`) is used for this run only unless this flag is given, because an extension update can move or delete it |

Workload installation takes several minutes — set the Bash tool timeout to 600000 ms and run in the foreground (the command is idempotent; retrying after a timeout is safe).

## Output
- Success `result`: .NET SDK and Tizen workload status.
- Failure `dotnet_sdk_not_found`: the .NET SDK is missing AND the user-scope auto-install was skipped (`--no-install-sdk`) or failed (offline/proxy is the usual cause) — the user installs the SDK (the no-sudo dotnet-install route is recommended), then re-runs this command: the re-run is what installs the Tizen workload.
- Failure `dotnet_workload_target_mismatch`: the workload was installed into a different .NET SDK band/directory than the one in use. The error details carry the diagnostic facts; relay them and stop.
- Failure `dotnet_workload_permission_denied`: the SDK directory is not writable (typical for apt/dnf installs). Relay `suggested_fix.command` — the exact `sudo bash <script>` (Linux/macOS) or Administrator PowerShell re-run — and stop. Never run sudo yourself; the runner cannot prompt for a password. (The message also names the sudo-free alternative: a user-scope SDK via dotnet-install, then a re-run.)

## Important
On a failure/error envelope, return it and **STOP**. Do not run manual diagnostics (`dotnet --list-sdks`, `dotnet workload list`, directory inspection) — the runner already collected all facts in `errors[0].details`. Do not re-run with `--force`.

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
- `tizen-cli tizen-sdk create-project --type dotnet ...`
- `tizen-cli tizen-sdk build-project ...`
