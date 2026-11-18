---
name: tizen-update-package
description: Update Tizen SDK packages, package update, 패키지 업데이트, 패키지 업데이트해줘, SDK 패키지 업데이트, update packages, upgrade packages, tizen package update. Use this skill to check for and install available updates for installed Tizen SDK packages. Downloads the latest package list, compares versions with installed manifests, and updates outdated packages.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-23"
  keywords:
    - Tizen SDK package update
    - package update
    - 패키지 업데이트
    - SDK update
    - upgrade packages
    - pkg_list
---

# Tizen SDK Package Update

## When to use
The user asks to update Tizen SDK packages. The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
tizen-cli tizen-sdk update-package
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--force` | no | off | Force update all installed packages regardless of version |
| `--dry-run` | no | off | List outdated packages without updating |
| `--download-jobs <count>` | no | `4` | Number of concurrent download jobs (1-8) |

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → a Phase 2 run finished within the last 30 minutes with `failed 0` (all packages up-to-date or updated).
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (update can take several minutes; updater output is plain text, not JSON).
   - `status: "failure"` starting "Package update finished with failures" → a fresh run recorded failed packages; this is the final result — report it, do not relaunch blindly.
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk update-package` right away and confirm `status: "success"`. The updater writes `<sdk-path>/.package-update-result` on exit; the re-run reads it (honoured for 30 minutes; `--force` / `--dry-run` only accept a run of the same kind) and returns that run's real envelope. If the launcher envelope comes back again, the updater died before writing the marker — read the background task's log tail.

## What the updater does

1. Downloads `{PKG_REPO_URL}/pkg_list_{OS}-{32,64}` from the Tizen package repository
2. Scans `{TIZEN_SDK_PATH}/.package/` for installed package manifests (`{pkg}.manifest`)
3. For each installed package, compares the installed version with the version in the downloaded package list
4. If a newer version is available, downloads and installs the update
5. Reports summary: updated / skipped / failed / up-to-date counts

## Output
- Success `result`: package update summary with counts.
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
- Build a project with updated packages: `tizen-cli tizen-sdk build-project ...`
- Create a new project: `tizen-cli tizen-sdk create-project ...`
