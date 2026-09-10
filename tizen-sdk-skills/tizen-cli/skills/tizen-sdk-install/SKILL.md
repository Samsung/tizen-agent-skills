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
| `--tizen-version <version>` | no       | `10.0`  | Tizen platform version                    |
| `--label <label>`           | no       | `tizen` | Installation label                        |
| `--force`                   | no       | off     | Force reinstall even if already installed |
| `--repo-url <url>`          | no       | CDN mirror | Install from a custom package repository URL instead of the timezone-selected CDN mirror |

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
   - `status: "failure"` → SDK is not installed. `errors[0].suggested_fix.command` contains a **ready-to-run installer command line** (a `powershell -ExecutionPolicy Bypass -File ...` / `bash ...` invocation).
2. **Phase 2 — install**: run `errors[0].suggested_fix.command` verbatim. The install takes 10–15 minutes (~121 packages). The execution method depends on the harness:
   - **Claude Code**: use `run_in_background: true`, END YOUR TURN, wait for `<task-notification>`.
   - **Cline**: use `--detach` (Linux/macOS) / `-Detach` (Windows) to launch a detached process, then poll `--status` / `-Status` every 60 seconds until `STATUS=done`. **Do NOT use `run_in_background: true`** (10-min timeout kills the process). **Do NOT run in foreground** (121-package log floods the context window).
3. **Verify**: after the install completes, re-run `tizen-cli tizen-sdk sdk-install` — it must now return `status: "success"` (the `sdk.info` completion marker exists).

## Output

- Success `result`: `packages[]` (name/status/version), `installation_status`.
- Failure: `error_code` (e.g. `execution_error`), `suggested_fix.command` (the installer line).

## Automatic SDK Init

After a successful installation (or when the SDK is already installed), `sdk-install`
**automatically writes the SDK path** to `~/.tizen.sdk.path.config` (the same operation
as `sdk-init`). This means:

- ✅ No need to run `sdk-init` separately after `sdk-install`
- ✅ All downstream skills (build, create, device, debug) can immediately locate the SDK
- ✅ The installer scripts (`.sh` / `.ps1`) also write the config file directly during install
- ✅ If auto-init fails, a warning is added to the response envelope suggesting manual `sdk-init`

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

`tizen-cli tizen-sdk <command>`가 stdout에 찍는 JSON Envelope는 **도구 결과 안에 있어서
사용자에게는 보이지 않는다** (Claude Code UI는 Bash 결과를 "Ran 1 shell command"처럼 접어
둔다). 터미널에서 직접 실행하면 JSON이 그대로 보이지만, 에이전트 세션에서 사용자에게 보이는
것은 최종 답변 텍스트만이다. 따라서 최종 답변은 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
   stderr로 나오는 `[DEBUG] ...` 줄은 Envelope가 아니므로 제외한다.
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 명령을 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Follow-ups

- Check the recorded package source: `tizen-cli tizen-sdk sdk-repo-info`
- TV app development → `tizen-cli tizen-sdk tv-sdk-install`
- .NET app development → `tizen-cli tizen-sdk dotnet-setup`
- Continue with `list-templates` / `create-project`.
