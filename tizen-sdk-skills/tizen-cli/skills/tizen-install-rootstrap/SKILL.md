---
name: tizen-install-rootstrap
description: Install custom rootstrap, tizen install rootstrap, 타이젠 커스텀 루트스트랩 설치, rootstrap package install, cross-compilation toolchain, custom sysroot. Use this skill to install a custom rootstrap package from a ZIP file into the Tizen SDK for cross-compilation.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - Tizen rootstrap
    - custom rootstrap
    - rootstrap install
    - cross-compilation
    - sysroot
    - toolchain
    - 타이젠 루트스트랩
    - 커스텀 루트스트랩
---

# Tizen Install Rootstrap

## When to use

The user provides a custom rootstrap ZIP file path and asks to install it into the Tizen SDK. This enables cross-compilation for specific target platforms or architectures.

## Prerequisites

Run the pre-check first to validate the ZIP file and detect its structure:

```
tizen-cli tizen-sdk install-rootstrap --zip-path <path-to-rootstrap.zip>
```

## Command

```
tizen-cli tizen-sdk install-rootstrap --zip-path <path> [--force]
```

| Option          | Required | Default | Description                                      |
| --------------- | -------- | ------- | ------------------------------------------------ |
| `--zip-path`    | yes      | -       | Absolute path to the rootstrap ZIP file          |
| `--force`       | no       | off     | Force reinstall even if rootstrap already exists |

## Two-phase flow (IMPORTANT)

This command follows a **two-phase installation pattern**:

1. **Phase 1 — pre-check**: Run the command above.
   - `status: "success"` → Rootstrap already installed (see `result.rootstraps[]`); nothing more to do.
   - `status: "failure"` → Installation needed. `errors[0].suggested_fix.command` contains a **ready-to-run installer command** (a `powershell -ExecutionPolicy Bypass -File ...` / `bash ...` invocation).

2. **Phase 2 — install**: Run `errors[0].suggested_fix.command` verbatim.
   - The installer validates the ZIP structure, extracts metadata, and copies files to the SDK.
   - Installation is typically fast (seconds to a minute depending on ZIP size).
   - Execution method depends on the harness:
     - **Claude Code**: Use `run_in_background: true` if the ZIP is large.
     - **Cline**: Run the command directly in the terminal.

3. **Verify**: After installation completes, re-run `tizen-cli tizen-sdk install-rootstrap --zip-path <path>` — it must now return `status: "success"`.

## ZIP Structure Detection

The installer automatically detects the ZIP structure:

- **`data/` layout**: Rootstrap files are under `data/` directory (common for Tizen SDK packages)
- **`tizen-studio/` layout**: Rootstrap files are under `tizen-studio/` directory

The detected structure type is reported in `result.structure_type`.

## Security Validation

The installer performs security checks:

- **Path traversal detection**: Rejects ZIP entries containing `..` in paths
- **Symlink rejection**: Refuses to extract symbolic links
- **Absolute path rejection**: Rejects entries with absolute paths

Warnings are reported in `result.warnings[]` if any non-critical issues are found.

## Output

- **Success `result`**:
  - `rootstraps[]`: List of installed rootstraps with name, architecture, profile, version
  - `structure_type`: Detected ZIP structure (`data` or `tizen-studio`)
  - `warnings[]`: Any warnings encountered during extraction
  - `installation_status`: `"installed"` or `"already_installed"`

- **Failure**:
  - `error_code`: e.g., `file_not_found`, `invalid_zip`, `security_violation`, `execution_error`
  - `suggested_fix.command`: The installer command to run (Phase 2)

## Rootstrap Metadata

The installer parses the rootstrap XML metadata under
`tools/smart-build-interface/plugins/*.core*.xml` inside the ZIP. Two filename formats are accepted:

- `{profile}-{version}-{device}.core.xml` — the Tizen SDK repository format, e.g. `tizen-10.0-device.core.xml`
- `{profile}-{version}-{device}.core.{public|private}.{timestamp}.xml` — custom builds that tag type and build time, e.g. `tizen-9.0-arm.core.public.20260819_095020.xml`

Extracted fields: profile, version, device; type and timestamp when present (informational only — the
rootstrap identity is `{profile}-{version}-{device}`). This metadata is reported in `result.rootstraps[]`.

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

- After installation, use the rootstrap for:
  - Building native apps: `tizen-cli tizen-sdk build-project --rootstrap <name>`
  - Cross-compilation setup
- List installed rootstraps: Check SDK's `rootstrap` directory
- Remove rootstrap: Manually delete from SDK's `rootstrap` directory (future command TBD)

## Example Flow

```bash
# Step 1: Pre-check
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-rootstrap.zip"

# Step 2: Run suggested fix command (if not already installed)
# The response will contain:
# errors[0].suggested_fix.command = "powershell -ExecutionPolicy Bypass -File C:\...\tizen-install-rootstrap.ps1 --zip-path ..."

# Step 3: Verify
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-rootstrap.zip"
# Should return status: "success" with rootstrap details
```
