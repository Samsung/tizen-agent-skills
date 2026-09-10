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

`sdk-install --repo-url <url>` is accepted as an equivalent shorthand and delegates here.

## Two-phase flow (same pattern as sdk-install)

1. **Phase 1 — pre-check** (fast): run the command above.
   - `status: "success"` → SDK already installed. **Read `warnings`**: nothing was
     downloaded, so the packages still come from the previously recorded repository. Offer
     `--force` if the user wants a reinstall from their URL.
   - `status: "failure"` → inspect `errors[0].error_category`:

     | `error_category`       | Meaning                                            | Action                                            |
     | ---------------------- | -------------------------------------------------- | ------------------------------------------------- |
     | `repo_url_invalid`     | Malformed URL / wrong scheme / points at pkg_list  | Ask the user for the repository **directory** URL |
     | `repo_url_unreachable` | Well-formed but serves no `pkg_list_{OS}-{64,32}`  | Wrong URL, or internal mirror needs VPN/proxy     |
     | `execution_error`      | URL valid, SDK not installed                       | Run `errors[0].suggested_fix.command` (Phase 2)   |

2. **Phase 2 — install**: run `errors[0].suggested_fix.command` verbatim (it already
   contains the repository flag). 10–15 minutes, ~121 packages.
   - **Claude Code**: `run_in_background: true`, END YOUR TURN, resume on `<task-notification>`.
   - **Cline**: `--detach` / `-Detach`, then poll `--status` / `-Status`. **Never**
     `run_in_background: true` (10-min kill), never foreground (log floods the context).
   - **Never drop the repository flag** from a relaunch — the install would silently fall
     back to the default CDN mirror.
3. **Verify**: re-run the Phase 1 command; it must return `status: "success"`. Confirm the
   source with `sdk-repo-info` (or read `{SDK_PATH}/.package/repository.info`).

## Output

- Success `result`: `packages[]`, `repository_url`, `installation_status`.
- Validation success `result`: `repository_url`, `valid`, `pkg_list_file`, `pkg_list_url`.
- Failure: `error_code` (`TIZEN_SDK_REPO_E001` / `E002`), `message`, `details[]` (every
  probed URL), `suggested_fix.command`.

## Downstream effect

The install records the repository in `{SDK_PATH}/.package/repository.info`, which
`update-package` and `download-emulator-package` read. Package updates and emulator
packages therefore come from the **same custom repository** afterwards.

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

- Check the recorded source: `tizen-cli tizen-sdk sdk-repo-info`
- TV app development → `tizen-cli tizen-sdk tv-sdk-install`
- .NET app development → `tizen-cli tizen-sdk dotnet-setup`
- Continue with `list-templates` / `create-project`.
