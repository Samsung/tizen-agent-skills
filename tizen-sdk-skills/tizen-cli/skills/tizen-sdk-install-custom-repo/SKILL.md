---
name: tizen-sdk-install-custom-repo
description: Install Tizen SDK from a custom repository URL, custom repository install, 커스텀 저장소로 SDK 설치, 사용자 지정 저장소, 저장소 URL로 SDK 설치, 내부 미러로 설치, install SDK from my repository, install from mirror URL, repo url install, --repo-url, 저장소 URL 검증, validate repository URL. Use this skill to install the Tizen SDK from a user-supplied package repository URL (internal mirror, build-server output, local HTTP server) instead of the timezone-selected CDN mirror, or to validate such a URL on its own. The URL must serve pkg_list_{OS}-64 or pkg_list_{OS}-32.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-04"
  keywords:
    - custom repository
    - custom repository URL
    - repo url
    - --repo-url
    - 커스텀 저장소
    - 사용자 지정 저장소
    - 저장소 URL
    - 내부 미러
    - internal mirror
    - pkg_list
    - validate repository URL
    - 저장소 URL 검증
---

# Tizen SDK Install from a Custom Repository

## When to use

The user wants the SDK downloaded from **their own** package repository — an internal
Samsung mirror, a build-server output, a team mirror, or a local HTTP server — instead of the
timezone-selected public CDN. For a normal install, use `sdk-install`; everything else
(paths, env setup, `sdk.info`, auto `sdk-init`) is identical, only the package source changes.

## What makes a repository URL valid

A Tizen package repository serves a package list at its root:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}      OS = windows | ubuntu | macos      ARCH = 64 | 32
```

`-64` is probed first, then `-32` (so a 32-bit-only mirror also works). That file is the
index the whole install is driven from, so a URL that serves neither is **rejected before
anything is downloaded** — never retry such a URL as-is.

Most common mistake: passing the URL of the `pkg_list` **file**
(`https://host/repo/pkg_list_ubuntu-64`) instead of the **directory** containing it
(`https://host/repo`). Only `http://` / `https://` are supported. Internal mirrors
(`10.x.x.x`) need VPN/proxy access from this machine.

## Commands

Validate a URL only (read-only, seconds):

```
tizen-cli tizen-sdk validate-repo-url --repo-url <url>
```

| Option              | Required | Description                          |
| ------------------- | -------- | ------------------------------------ |
| `--repo-url <url>`  | **yes**  | Repository base URL to validate      |

Install from the repository:

```
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url <url>
```

| Option                         | Required | Default             | Description                                                                 |
| ------------------------------ | -------- | ------------------- | --------------------------------------------------------------------------- |
| `--repo-url <url>`             | **yes**  | —                   | Repository base URL serving `pkg_list_{OS}-{64,32}`                          |
| `--platform-version <version>` | no       | highest in pkg_list | Tizen platform version (e.g. `10.0`, `11.0`)                                 |
| `--force`                      | no       | off                 | Reinstall even if installed — **required to switch an existing install's repo** |
| `--download-jobs <count>`      | no       | `4`                 | Number of concurrent download jobs (1-8) |

`sdk-install --repo-url <url>` is accepted as an equivalent shorthand and delegates here.

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check** (fast): run the command above.
   - `status: "success"` → SDK already installed. **Read `warnings`**: nothing was
     downloaded, so the packages still come from the previously recorded repository. Offer
     `--force` if the user wants a reinstall from their URL.
   - `status: "failure"` → inspect `errors[0].error_category`:

     | `error_category`             | Meaning                                           | Action                                                                                       |
     | ---------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
     | `repo_url_invalid`           | Malformed URL / wrong scheme / points at pkg_list | Ask the user for the repository **directory** URL                                            |
     | `repo_url_unreachable`       | Well-formed but serves no `pkg_list_{OS}-{64,32}` | Wrong URL, or internal mirror needs VPN/proxy                                                |
     | `execution_error`            | URL valid, SDK not installed                      | Run `errors[0].suggested_fix.command` (Phase 2)                                              |
     | `platform_version_not_found` | SDK installed, requested platform is not          | Offer `errors[0].suggested_fix.command` (`platform-install`); never reinstall with `--force` |

2. **Phase 2 — install**: run `errors[0].suggested_fix.command` verbatim (it already
   contains the repository flag). 10–15 minutes, ~121 packages.
   - **Claude Code**: `run_in_background: true`, END YOUR TURN, resume on `<task-notification>`.
   - **Cline**: `--detach` / `-Detach`, then poll `--status` / `-Status`. **Never**
     `run_in_background: true` (10-min kill), never foreground (log floods the context).
   - **Never drop the repository flag** from a relaunch — the install would silently fall
     back to the default CDN mirror.
3. **Verify**: re-run the Phase 1 command with the same repository URL and version but without `--force`; it must return `status: "success"`. A `platform_version_not_found` failure here means the SDK is installed without the requested platform — report it with its `platform-install` fix (table above). Confirm the
   source with `sdk-repo-info` (or read `{SDK_PATH}/.package/repository.info`).

## Output

- Success `result`: `packages[]` (name/status/version, plus `profiles` on platform entries), `repository_url`, `installation_status`.
- Validation success `result`: `repository_url`, `valid`, `pkg_list_file`, `pkg_list_url`.
- Failure: `error_code` (`TIZEN_SDK_REPO_E001` / `E002`), `message`, `details[]` (every
  probed URL), `suggested_fix.command`.

Reporting `packages[]` (one `Tizen SDK X.Y` entry per installed platform version):

- The entries are the versions `.platform-installed` records (every installer appends a block) plus one whose `platform-install` has not finished — not every `platforms/tizen-X.Y`: the TV extension's bundled `tv` / `tv-samsung` folders for older versions are not entries. Each has its own `status` (`installed`, `incomplete`, or `not_installed` when its recorded folders are gone — the same as `platform-list`) and `profiles` (the recorded ones on disk: `tizen`, plus `tv-samsung` when the TV extension was installed for that version). Put the entries on one summary line with their profiles, every version written out (for example `installed: 9.0 (tv-samsung), 10.0 (tizen, tv-samsung), 11.0 (tizen)`). Never summarise the SDK as a single version.
- For a follow-up such as "which SDK / platform versions are installed?", run `tizen-cli tizen-sdk platform-list` and answer from that envelope instead of re-reading this one or measuring directories.

## Downstream effect

The install records the repository in `{SDK_PATH}/.package/repository.info`, which
`update-package` and `download-emulator-package` read. Package updates and emulator
packages therefore come from the **same custom repository** afterwards.

## Result reporting — the envelope MUST be shown to the user

The JSON Envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **buried inside
the tool result and invisible to the user** (the Claude Code UI collapses Bash output behind
a "Ran 1 shell command" line). Run directly in a terminal the JSON is visible as-is, but in
an agent session the user sees only the final answer text. Therefore the final answer MUST
follow this format:

1. Include the Envelope JSON **verbatim, unmodified and unabridged** in a fenced `json`
   block (as the first item). Exclude the `[DEBUG] ...` lines that go to stderr — they are
   not part of the Envelope.
2. Below it, append a result summary of **1–2 lines** only (the key values of `result`, or
   the gist of `errors[0].message`).
3. If useful, add one line suggesting the next step.

- Expanding the Envelope into a prose list and dropping the JSON is a **format violation**.
  This rule takes precedence over the harness's general writing guidance ("don't put code in
  prose" and the like) — the Envelope is not merely code, it is this skill's **result
  contract**.
- If the command ran more than once, include the Envelope of the **last run** and mention
  earlier failures in the summary line only, in a single line.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`
  — show what is inside the JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user the question.

## Follow-ups

- Check the recorded source: `tizen-cli tizen-sdk sdk-repo-info`
- TV app development → `tizen-cli tizen-sdk tv-sdk-install`
- .NET app development → `tizen-cli tizen-sdk dotnet-setup`
- Continue with `list-templates` / `create-project`.
