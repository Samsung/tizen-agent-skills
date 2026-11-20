---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, 타이젠 SDK 설치, 타이젠 SDK 설치해줘, setup tizen development environment, download tizen platform packages, SDK 저장소 정보, repository info, CDN mirror, 패키지 저장소, sdk package repo, package repository, SDK repo, 저장소 목록, 다운로드 URL. Use this skill to install the Tizen SDK, download platform packages, and set up environment paths. Also handles SDK repository information queries. Start here before any project creation or debugging work.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - Tizen SDK
    - Tizen SDK install
    - tizen-studio
    - 타이젠 SDK 설치
    - Tizen platform packages
    - SDK 저장소 정보
    - repository info
    - CDN mirror
---

# Tizen SDK Install

## When to use

The user asks to install the Tizen SDK or set up a Tizen development environment. Run this before any project creation, build, device, or debug work.

## Prerequisites

Run the fast pre-checks first and surface failures to the user:

```
tizen-cli tizen-sdk check-node
tizen-cli tizen-sdk check-disk-space
```

## Command

```
tizen-cli tizen-sdk sdk-install
```

| Option                      | Required | Default | Description                               |
| --------------------------- | -------- | ------- | ----------------------------------------- |
| `--tizen-version <version>` | no       | newest available | Tizen platform version, `X.Y` (e.g. `10.0`, `11.0`). Malformed → `invalid_argument`; not among the installed platforms → `platform_version_not_found` |
| `--label <label>`           | no       | `tizen` | Installation label                        |
| `--force`                   | no       | off     | Force reinstall even if already installed |
| `--repo-url <url>`          | no       | CDN mirror | Install from a custom package repository URL instead of the timezone-selected CDN mirror |
| `--path <dir>`              | no       | `~/.tizen.sdk.path.config`, else `~/tizen-sdk` | SDK install directory (a leading `~` is expanded) |
| `--download-jobs <count>`   | no       | `4`     | Number of concurrent download jobs (1-8) |

## Custom repository URL

Without `--repo-url`, packages come from the CDN mirror chosen by timezone. When the user
supplies their **own** repository (internal mirror, build-server output, local HTTP server),
use the dedicated command — it validates that the URL serves `pkg_list_{OS}-{64,32}` before
downloading anything, and accepts a platform version:

```
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url <url>
tizen-cli tizen-sdk validate-repo-url --repo-url <url>     # check only
```

See the `tizen-sdk-install-custom-repo` skill. `sdk-install --repo-url <url>` is an
equivalent shorthand that delegates to the same flow.

## Repository information (SDK 저장소 정보 조회)

When the user asks where packages come from — "SDK 저장소 정보 알려줘", "어디서 다운로드받아?",
"CDN 미러 목록 보여줘", "repository info" — run the read-only query. It takes no options,
needs no SDK install, and never modifies anything:

```
tizen-cli tizen-sdk sdk-repo-info
```

`result` contains:

- `current_repository` — the mirror URL recorded in `{SDK_PATH}/.package/repository.info`
  (`null` when the SDK is not installed yet, or was installed before that file existed —
  a warning says so; the envelope is still `success`).
- `repositories[]` — known repository metadata (`url`, `name`, `type`, `description`,
  `access`, `mirrors[]`):

| URL                                                      | Name                                       | Type     | Access                              |
| -------------------------------------------------------- | ------------------------------------------ | -------- | ----------------------------------- |
| `https://download.tizen.org/sdk/tizenstudio/official/`   | Official CDN                               | public   | Internet (regional mirrors)         |

Private / in-house mirrors are not listed; install from one with `sdk-install-custom-repo` (`--repo-url <url>`).

Use it to confirm which source an install actually used — including after
`sdk-install-custom-repo`, where it reports whether the custom URL was recorded or the
flow fell back to the default CDN mirror.

## Two-phase flow (IMPORTANT)

This command is a **fast pre-check only** — it never performs the 10–15 minute installation itself.

1. **Phase 1 — pre-check**: run the command above.
   - `status: "success"` → SDK already installed (see `result.installation_status`); nothing more to do.
   - `status: "failure"` with `error_category: "execution_error"` → SDK is not installed. `errors[0].suggested_fix.command` contains a **ready-to-run installer command line** (a `powershell -ExecutionPolicy Bypass -File ...` / `bash ...` invocation).
   - `status: "failure"` with `invalid_argument` / `platform_version_not_found` → the requested `--tizen-version` is malformed, or the SDK is installed without that platform. Do **not** run an installer; show the message (it lists the installed platforms) and, for a real version, offer `platform-install --platform-version <X.Y>` from `suggested_fix`. The same `platform_version_not_found` is returned when the packaged CLI ran the installer itself and `sdk.info` appeared but `platforms/tizen-<X.Y>` did not (the repository does not offer that version) — never `success` for a version that is not there.
   - `status: "failure"` with `execution_error` **after** an installer run → the message carries the installer exit code, its last output lines and the path of a log file with the full captured output (`errors[0].details` has the same lines); the installer also keeps `<sdk-path>/.install.log` and records `EXIT=<code>` in `<sdk-path>/.install-result`. Relay those paths — do not just say "installation failed".
2. **Phase 2 — install**: run `errors[0].suggested_fix.command` verbatim. The install takes 10–15 minutes (~121 packages). The execution method depends on the harness:
   - **Claude Code**: use `run_in_background: true`, END YOUR TURN, wait for `<task-notification>`.
   - **Cline**: use `--detach` (Linux/macOS) / `-Detach` (Windows) to launch a detached process, then poll `--status` / `-Status` after a 25-second sleep (`execute_command` times out at 30 s) with an **increasing attempt number in every poll command** (`sleep 25 && echo "poll #N" && … --status` / `Start-Sleep 25; Write-Host 'poll #N'; … -Status`) — Cline aborts after 5 consecutive identical tool calls — and **at most 4 polls per turn**: still `STATUS=running` after that, tell the user that the install keeps running in the background, that **no automatic completion notice will come (Cline cannot notify them when the install finishes), so when they want to know whether it finished they have to ask** ("tell me the install progress"), at which point you check the status and continue; also give them the `--status` / `-Status` command for checking by hand; then end the turn and, when they ask, run `--status` and continue from there, until `STATUS=done`. **Do NOT use `run_in_background: true`** (10-min timeout kills the process). **Do NOT run in foreground** (121-package log floods the context window).
3. **Verify**: after the install completes, re-run `tizen-cli tizen-sdk sdk-install` with the same version (and label) but without `--force` (and with the same `--path`, if one was given) — it must now return `status: "success"` (the `sdk.info` completion marker exists).

## Output

- Success `result`: `packages[]` (name/status/version, plus `profiles` on platform entries), `installation_status`.
- Failure: `error_code` (e.g. `execution_error`), `suggested_fix.command` (the installer line).

Reporting `packages[]` (one `Tizen SDK X.Y` entry per installed platform version):

- The entries are the versions `.platform-installed` records (every installer appends a block) plus one whose `platform-install` has not finished — not every `platforms/tizen-X.Y`: the TV extension's bundled `tv` / `tv-samsung` folders for older versions are not entries. Each has its own `status` (`installed`, `incomplete`, or `not_installed` when its recorded folders are gone — the same as `platform-list`) and `profiles` (the recorded ones on disk: `tizen`, plus `tv-samsung` when the TV extension was installed for that version). Put the entries on one summary line with their profiles, every version written out (for example `installed: 9.0 (tv-samsung), 10.0 (tizen, tv-samsung), 11.0 (tizen)`). Never summarise the SDK as a single version.
- For a follow-up such as "which SDK / platform versions are installed?", run `tizen-cli tizen-sdk platform-list` and answer from that envelope instead of re-reading this one or measuring directories.

## Automatic SDK Init

After a successful installation (or when the SDK is already installed), `sdk-install`
**automatically writes the SDK path** to `~/.tizen.sdk.path.config` (the same operation
as `sdk-init`). This means:

- ✅ No need to run `sdk-init` separately after `sdk-install`
- ✅ All downstream skills (build, create, device, debug) can immediately locate the SDK
- ✅ The installer scripts (`.sh` / `.ps1`) also write the config file directly during install
- ✅ If auto-init fails, a warning is added to the response envelope suggesting manual `sdk-init`

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

- Check the recorded package source: `tizen-cli tizen-sdk sdk-repo-info`
- TV app development → `tizen-cli tizen-sdk tv-sdk-install`
- .NET app development → `tizen-cli tizen-sdk dotnet-setup`
- Continue with `list-templates` / `create-project`.
