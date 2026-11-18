---
name: tizen-platform-install
description: Install Tizen platform, platform install, 플랫폼 설치, 플랫폼 설치해줘, 타이젠 플랫폼 설치, Tizen platform package, TIZEN-Version platform, platform package download, 플랫폼 패키지 설치, 설치된 플랫폼, 설치된 버전 목록, installed platforms, list platforms. Use this skill to download and install the Tizen platform package (TIZEN-{version}) from the Tizen package repository — several versions live side by side — and to list the installed versions (platform-list). Reads the repository URL from repository.info. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-10-24"
  keywords:
    - platform install
    - Tizen platform
    - TIZEN-Version
    - 플랫폼 설치
    - 플랫폼 패키지
    - repository.info
    - platform package
    - platform-list
    - 설치된 플랫폼
---

# Tizen Platform Package Install

## When to use
The user asks to download / install the Tizen platform package (TIZEN-{version}), or which platform versions are installed. The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## List installed platforms (read-only)

```
tizen-cli tizen-sdk platform-list
```

No options. `result.platforms` has one entry per platform version the user installed, oldest first — the versions `.platform-installed` records (every installer appends a block), plus one whose `platform-install` has not finished. The `tv` / `tv-samsung` folders the TV extension bundles for older versions are not entries.

- `status`: `installed`; `incomplete` (an unfinished `platform-install` — re-run it to resume); or `not_installed` (recorded, but its folders are gone)
- `profiles`: the recorded profiles on disk — `tizen`, plus `tv-samsung` when the TV extension was installed for that version
- `emulator_images`

`result.newest` is the newest installed entry. Report every entry with its profiles on one line (e.g. `installed: 9.0 (tv-samsung), 10.0 (tizen, tv-samsung), 11.0 (tizen)`).

## Command

```
tizen-cli tizen-sdk platform-install
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--platform-version <version>` | **yes** | — | Tizen platform version, `X.Y` (e.g., `10.0`, `11.0`). The target package is `TIZEN-{version}`. Any other shape (e.g. `99.99.99`) fails with `invalid_argument` before anything runs. |
| `--force` | no | off | Force reinstall even if already installed |
| `--download-jobs <count>` | no | `4` | Number of concurrent download jobs (1-8) |

## Two-phase flow (same pattern as sdk-install / tv-sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → that version is already installed. Other installed versions do not matter: 9.0 can be added next to 10.0.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (download can take several minutes; installer output is plain text, not JSON).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk platform-install` and confirm `status: "success"`.

## How it works

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `pkg_list_{OS}` from the Tizen package repository
3. Auto-detects the latest TIZEN-X.Y platform (or uses the specified `--platform-version`)
4. Resolves `TIZEN-{version}` and all its Install-dependency packages
5. Downloads and merges each package into the SDK root
6. Marks the run with `.platform-installing-X.Y`; on success removes it and appends a block for the version and its profiles to `.platform-installed`. It skips a version that is already installed: `platforms/tizen-X.Y` holds a profile besides `common` and the TV extension's `tv` / `tv-samsung*` with content besides the synced `samples` (rootstraps, emulator images, …), and no `.platform-installing-X.Y` is left.

## Output
- Success `result`: platform package/installation status.
- Failure: `error_code`, `message`, optional `suggested_fix.command`.

## Result reporting — the envelope MUST be shown to the user

The JSON envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **buried inside the
tool result and invisible to the user** (the Claude Code UI collapses Bash output into a
"Ran 1 shell command" line). Run directly in a terminal, the JSON is plainly visible, but in an
agent session the user sees only the final answer text. The final answer therefore follows this format:

1. Include the envelope JSON **verbatim, without edits or truncation** in a fenced `json` block (first item).
   Exclude `[DEBUG] ...` lines from stderr — they are not part of the envelope.
2. Below it, add a **1–2 line** summary of the result (the key `result` values, or the gist of `errors[0].message`).
3. If useful, add one line suggesting next steps.

- Expanding the envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general writing guidance ("don't put code in prose", etc.) —
  the envelope is not code; it is this skill's **result contract**.
- If the command was run several times, include the envelope from the **last run** and mention
  earlier failures in a single line of the summary.
- Include a failure envelope verbatim as well. Do not retype `errors[0].message`/`details`; show what is
  inside the JSON as-is.
- Show a `user_input_required` envelope as-is, then ask the user the question.

## Follow-ups
- Create a project: `tizen-cli tizen-sdk create-project ...`
- Build a project: `tizen-cli tizen-sdk build-project ...`
- Install on device: `tizen-cli tizen-sdk install-app ...`
