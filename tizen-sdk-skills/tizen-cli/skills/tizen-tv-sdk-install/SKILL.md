---
name: tizen-tv-sdk-install
description: Install TV SDK, TV SDK install, TV SDK 설치, TV SDK 설치해줘, 타이젠 TV SDK 설치, Samsung TV SDK, TV extension install. Use this skill to install the Tizen TV SDK extension (TV-SAMSUNG-Public package) on top of an existing Tizen SDK installation. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-11-24"
  keywords:
    - TV SDK
    - TV SDK install
    - TV-SAMSUNG-Public
    - 타이젠 TV SDK 설치
    - Samsung TV SDK
    - TV extension
---

# Tizen TV SDK Install

## When to use
The user asks to install the TV SDK / Samsung TV extension. The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
tizen-cli tizen-sdk tv-sdk-install
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--force` | no | off | Force reinstall even if already installed |
| `--download-jobs <count>` | no | `4` | Number of concurrent download jobs (1-8) |

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → TV SDK already installed.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (installation can take several minutes; installer output is plain text, not JSON).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk tv-sdk-install` and confirm `status: "success"`.

## Output
- Success `result`: `packages[]` — `{ name: "TV-SAMSUNG-Public", status, version: "<TV version>", profiles: ["tv-samsung"] }`. The repository carries one TV version (its `X.Y-MANDATORY` dependency); it is recorded in `.platform-installed`, which `sdk-install` and `platform-list` report. For another TV version, use `tv-sdk-install-from-zip` with that version's ZIP.
- Failure: `error_code`, `message`, optional `suggested_fix.command`.

## Post-install — ensure the default TV emulator VM (agent step)

The TV SDK install command only puts packages on disk; it never creates a VM. After the TV
install is verified (both paths: a fresh install, and the idempotent "already installed"
pre-check result), ensure a default TV emulator VM exists:

1. Check for the default VM by name:
   `tizen-cli tizen-sdk emulator-manager --action list-vm --detail`
   - **A VM named `T-samsung-<version>-x86_64` exists → done.** Skip creation and say so in one line.
   - **Not present → always create it** with em-cli's own default-VM mode:
     `tizen-cli tizen-sdk create-emulator --default --profile tv --platform tv-samsung-<version>-x86_64`
     where `<version>` is the TV platform version from the envelope's `result.packages[].version`
     (e.g. version `10.0` → platform `tv-samsung-10.0-x86_64`).
     em-cli rewrites `default-tv-samsung-<version>-x86_64` into the SDK's canonical default VM
     name `T-samsung-<version>-x86_64` — the same dotted name the native Emulator Manager and the
     Tizen VS Code extension create (the `-d` mode bypasses em-cli's VM-name character check, so
     the dots are valid). No `--size`: the platform's default template (1080) applies. No
     `--vm-name`: it is derived from the platform.
     The TV repository currently ships one image per version (x86_64). Should a
     future TV SDK ship several architecture images, ensure one default VM per
     installed `tv-samsung` image — the derivation is identical
     (`tv-samsung-<version>-<arch>` → `T-samsung-<version>-<arch>`).
     The decision is by name only — other `tv`-profile VMs (user-created or leftover) do not
     suppress the default VM. Do NOT pass `--launch` — booting is `tizen-cli tizen-sdk launch-emulator`'s job.
2. Best-effort: a VM-creation failure is reported as a **warning** in the summary and never
   changes the TV SDK install result — the extension install already succeeded.
3. Report the create/list envelope **after** the install envelope (two fenced `json` blocks).

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
