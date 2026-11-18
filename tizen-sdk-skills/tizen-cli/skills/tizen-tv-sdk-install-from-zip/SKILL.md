---
name: tizen-tv-sdk-install-from-zip
description: Install TV SDK from ZIP, TV SDK ZIP install, TV SDK ZIP 설치, TV SDK ZIP으로 설치, 타이젠 TV SDK ZIP 설치, Samsung TV SDK offline install, TV extension install from ZIP, offline TV SDK, local ZIP TV SDK. Use this skill to install the Tizen TV SDK extension (TV-SAMSUNG-Public) from a local ZIP file (offline, no download). All packages must already be bundled in the ZIP. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-08"
  keywords:
    - TV SDK
    - TV SDK install from ZIP
    - TV-SAMSUNG-Public
    - 타이젠 TV SDK ZIP 설치
    - Samsung TV SDK
    - TV extension
    - offline install
    - local ZIP
---

# Tizen TV SDK Install from ZIP

## When to use
The user asks to install the TV SDK / Samsung TV extension from a local ZIP file (offline). The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
tizen-cli tizen-sdk tv-sdk-install-from-zip --zip-path <path-to-zip>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--zip-path <path>` | **yes** | — | Path to the TV SDK ZIP file containing all bundled packages |
| `--tv-version <X.Y>` | no | from the ZIP | TV platform version the ZIP is for (e.g. `9.0`). The installer also reads it from the inner ZIP names and stops before extracting when they differ; it is required when they name none |
| `--force` | no | off | Force reinstall of that TV version even if already installed |

Several TV versions (9.0, 10.0, 11.0) install side by side from their ZIPs: only a TV version `.platform-installed` already records is skipped. Each install appends a `Profile: tv-samsung` block for its version, which `sdk-install` and `platform-list` report.

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → TV SDK already installed.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (installation can take several minutes; installer output is plain text, not JSON).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk tv-sdk-install-from-zip --zip-path <path>` (with the same `--tv-version`, if given) and confirm `status: "success"`.

## Output
- Success `result`: `packages[]` — `{ name: "TV-SAMSUNG (ZIP)", status, version: "<TV version>", profiles: ["tv-samsung"] }` for the TV version this ZIP installed.
- Failure: `error_code`, `message`, optional `suggested_fix.command`.

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
- Create a TV web app: `tizen-cli tizen-sdk create-project --type webapp ...`
