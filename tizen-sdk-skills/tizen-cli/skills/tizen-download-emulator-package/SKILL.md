---
name: tizen-download-emulator-package
description: Download Tizen emulator package, emulator package download, 에뮬레이터 패키지 다운로드, 에뮬레이터 패키지 다운로드해줘, TIZEN Emulator package, install emulator package, emulator package install, 에뮬레이터 패키지 설치. Use this skill to download and install the Tizen emulator package (TIZEN-{platform_version}-Emulator) from the Tizen package repository. Reads the repository URL from repository.info. Requires Tizen SDK to be installed first.
metadata:
  author: Samsung Electronics
  last-updated: "2026-11-24"
  keywords:
    - emulator package
    - emulator package download
    - TIZEN-Emulator
    - 에뮬레이터 패키지
    - 에뮬레이터 패키지 다운로드
    - repository.info
    - emulator install
---

# Tizen Emulator Package Download

## When to use
The user asks to download / install the Tizen emulator package (TIZEN-{platform_version}-Emulator). The base Tizen SDK must already be installed (`tizen-cli tizen-sdk sdk-install` returns success).

## Command

```
tizen-cli tizen-sdk download-emulator-package
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--platform-version <version>` | no | auto-detect latest | Tizen platform version (e.g., `10.0`, `11.0`) |
| `--force` | no | off | Force reinstall even if already installed |
| `--download-jobs <count>` | no | `4` | Number of concurrent download jobs (1-8) |

## Two-phase flow (same pattern as sdk-install / tv-sdk-install)

1. **Phase 1 — pre-check**: run the command.
   - `status: "success"` → emulator package already installed.
   - `status: "failure"` with `suggested_fix` → run `errors[0].suggested_fix.command` with the Bash tool using `run_in_background: true` (download can take several minutes; installer output is plain text, not JSON).
   - `status: "failure"` mentioning the base SDK → run `tizen-cli tizen-sdk sdk-install` first.
2. **Verify**: re-run `tizen-cli tizen-sdk download-emulator-package` and confirm `status: "success"`.

## How it works

1. Reads the CDN mirror URL from `{TIZEN_SDK_PATH}/.package/repository.info` (written during SDK install). Falls back to the official repo if the file is missing.
2. Downloads `pkg_list_{OS}` from the Tizen package repository
3. Auto-detects the latest TIZEN-X.Y platform (or uses the specified `--platform-version`)
4. Resolves `TIZEN-{version}-Emulator` and all its Install-dependency packages
5. Downloads and merges each package into the SDK root
6. Resolves the shared `Emulator` tools too and refreshes outdated ones (keeps emulator-manager in sync with platform plugins)
7. Creates/updates the `.emulator-package-installed` marker (one `Platform version: X.Y` record per installed platform)

## Output
- Success `result`: emulator package/installation status.
- Failure: `error_code`, `message`, optional `suggested_fix.command`.

## Post-install — ensure the default standard emulator VM (agent step)

The download command only puts packages on disk; it never creates a VM. After the install is
verified (both paths: a fresh install, and the idempotent "already installed" pre-check result),
ensure a default standard emulator VM exists:

1. Check for the default VMs by name:
   `tizen-cli tizen-sdk emulator-manager --action list-vm --detail`
   Check only the `tizen`-profile images of the **target version** — the
   `--platform-version` this run passed, or, without it, the highest `platform`
   among the `tizen` entries (the installer installs the latest platform).
   `result.installed_images` lists every image on disk, older platforms
   included, so never ensure VMs for the other versions. Platforms can ship
   more than one architecture image (e.g. tizen 9.0 has both `tizen-9.0-x86`
   and `tizen-9.0-x86_64`), so check once per such image — iterate over ALL
   entries in the envelope's `result.installed_images` whose `profile` is
   `tizen` and whose `platform` is the target version (their `image` field;
   ignore `tv-samsung` entries, they belong to `tizen-tv-sdk-install`):
   - Expected default VM name: `T-` + the image minus its first segment —
     `tizen-9.0-x86_64` → `T-9.0-x86_64`, `tizen-9.0-x86` → `T-9.0-x86`.
   - **A VM with that name exists → done for this image.** Skip creation and
     say so in one line.
   - **Not present → always create it** with em-cli's own default-VM mode:
     `tizen-cli tizen-sdk create-emulator --default --platform <image>`
     em-cli rewrites `default-<image>` into the SDK's canonical default VM name
     (e.g. `default-tizen-9.0-x86_64` → `T-9.0-x86_64`) — the same dotted name
     the native Emulator Manager and the Tizen VS Code extension create (the
     `-d` mode bypasses em-cli's VM-name character check, so the dots are
     valid). No `--size`: the platform's default template (1080) applies. No
     `--vm-name`: it is derived from the platform.
     The decision is by name only — other `tizen`-profile VMs (user-created or
     leftover) do not suppress the default VM. Do NOT pass `--launch` — booting
     is `tizen-cli tizen-sdk launch-emulator`'s job.
2. Best-effort: a VM-creation failure is reported as a **warning** in the summary and never
   changes the download result — the package install already succeeded.
3. Report the create/list envelope **after** the download envelope (two fenced `json` blocks).

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
- Create an emulator VM: `tizen-cli tizen-sdk create-emulator ...`
- Launch an emulator: `tizen-cli tizen-sdk launch-emulator ...`
