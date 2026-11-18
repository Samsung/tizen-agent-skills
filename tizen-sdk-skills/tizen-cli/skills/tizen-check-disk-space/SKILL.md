---
name: tizen-check-disk-space
description: Check disk space, disk space check, 디스크 공간 확인, 용량 확인, storage check, 설치 전 공간 확인, disk space, free space. Use this skill to verify available disk space before installing the Tizen SDK. Returns a Standard JSON Envelope with disk info. Recommended before tizen-sdk-install.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - disk space
    - free space
    - storage check
    - 디스크 공간
    - 용량 확인
    - Tizen SDK install prerequisite
---

# Check Disk Space

## When to use
Pre-check before `tizen-cli tizen-sdk sdk-install` (the SDK needs ~15 GB), or any free-space question.

## Command

```
tizen-cli tizen-sdk check-disk-space
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--path <dir>` | no | home drive | Target directory/drive to check |
| `--required-gb <gb>` | no | `15` | Required free space in GB |

## Output
- Success `result`: `path`, `total_gb`, `free_gb`, `required_gb`, `sufficient` (boolean).
- `sufficient: false` still returns as a failure envelope with `error_category: insufficient_disk_space` — ask the user to free space or choose another drive before installing.

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
- `tizen-cli tizen-sdk sdk-install` once space is sufficient.
