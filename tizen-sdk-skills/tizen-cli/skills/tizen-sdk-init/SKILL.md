---
name: tizen-sdk-init
description: Initialize Tizen SDK path, SDK init, sdk path config, 타이젠 SDK 경로 설정, SDK 초기화, sdk init, set sdk path, configure sdk path. Use this skill to configure the Tizen SDK installation path by writing it to ~/.tizen.sdk.path.config. Validates that the path exists and is readable/writable before saving. Use after a manual SDK install or when the SDK is at a non-default path.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-23"
  keywords:
    - SDK init
    - SDK path
    - sdk path config
    - 타이젠 SDK 경로 설정
    - SDK 초기화
    - configure sdk path
    - set sdk path
---

# Tizen SDK Init

## When to use
The user asks to configure the Tizen SDK installation path, or the SDK was installed manually (not via `sdk-install`) and needs to be registered. Run this when `~/.tizen.sdk.path.config` is missing or points to a wrong/old location, before any skill that depends on the SDK path.

> **Note:** The `sdk-install` skill now **automatically writes `~/.tizen.sdk.path.config`** after a successful install (both in the pre-check CLI and in the installer scripts). Running `sdk-init` separately is only needed when the SDK was installed manually or the config file needs to point to a different path.

## Prerequisites
The Tizen SDK must already be installed at the target path. If not, use `sdk-install` first.


## Command

```
tizen-cli tizen-sdk sdk-init
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--sdk-path <path>` | no | `~/tizen-sdk` | Tizen SDK installation path |

## Output
- Success `result`: `sdk_path`, `config_file` (path to `~/.tizen.sdk.path.config`).
- Failure: `error_code` / `error_category` — `sdk_path_invalid` (path empty or does not exist), `sdk_path_not_accessible` (no read/write permission), `io_error` (config write failed).

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
- Install the SDK if not yet installed → `tizen-cli tizen-sdk sdk-install`
- Create a new project → `tizen-cli tizen-sdk create-project`
- Build a project → `tizen-cli tizen-sdk build-project`
- Verify device/emulator connection → `tizen-cli tizen-sdk device-manager`
