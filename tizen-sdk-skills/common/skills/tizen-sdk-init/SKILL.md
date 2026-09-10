---
name: tizen-sdk-init
description: Initialize Tizen SDK path, SDK init, sdk path config, 타이젠 SDK 경로 설정, SDK 초기화, sdk init, set sdk path, configure sdk path. Use this skill to configure the Tizen SDK installation path by writing it to ~/.tizen.sdk.path.config. Validates that the path exists and is readable/writable before saving. Use after a manual SDK install or when the SDK is at a non-default path.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-22"
  keywords:
    - SDK init
    - SDK path
    - sdk path config
    - 타이젠 SDK 경로 설정
    - SDK 초기화
    - configure sdk path
    - set sdk path
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-sdk-init` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-sdk-init`)
2. 수집된 입력(SDK 경로)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code, ALL platforms)

Use the shipped CLI runner. Find the runner path, then run `node` on it with the SDK path as an argument.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*sdk-init-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\sdk-init-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" "C:\Users\<username>\tizen-sdk"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" "C:\Users\<username>\tizen-sdk"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-init-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-init-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" "/path/to/tizen-sdk"
```

If no path argument is provided, the default `~/tizen-sdk` is used.

Exit code: `0` = success (SDK path configured), `1` = failure (invalid path, permissions, or error).

## Parameters

- **sdkPath** — (optional) Tizen SDK installation path. Defaults to `~/tizen-sdk` (Windows: `%USERPROFILE%\tizen-sdk`).

## What initSdk() handles internally

1. **Path validation** — rejects empty or non-string paths
2. **Existence check** — verifies the SDK path exists on disk
3. **Permission check** — verifies read/write access to the SDK path
4. **Config file write** — writes the SDK path to `~/.tizen.sdk.path.config`
5. **POSIX permissions** — sets `0o600` on the config file (Linux/macOS only; Windows skips chmod)
6. **Standard JSON Envelope** — `sdk_path`, `config_file` on success

## Response

**Success (SDK path configured):**
```json
{
  "command": "tizen-sdk sdk-init",
  "status": "success",
  "result": {
    "sdk_path": "/home/user/tizen-sdk",
    "config_file": "/home/user/.tizen.sdk.path.config"
  }
}
```

**Failure (path does not exist):**
```json
{
  "command": "tizen-sdk sdk-init",
  "status": "failure",
  "errors": [{
    "error_code": "TIZEN_SDK_UNKNOWN_E001",
    "error_category": "sdk_path_invalid",
    "message": "SDK path does not exist: /wrong/path",
    "suggested_fix": {
      "command": "Verify that Tizen SDK is installed at /wrong/path",
      "auto_fixable": false
    }
  }]
}
```

**Failure (no read/write permission):**
```json
{
  "command": "tizen-sdk sdk-init",
  "status": "failure",
  "errors": [{
    "error_code": "TIZEN_SDK_UNKNOWN_E001",
    "error_category": "sdk_path_not_accessible",
    "message": "No read/write permission for SDK path: /restricted/path"
  }]
}
```

## When to use this skill

- After installing the Tizen SDK manually (not via `tizen-sdk-install` skill, which handles config automatically)
- When the SDK is installed at a non-default path and needs to be registered
- When `~/.tizen.sdk.path.config` is missing or points to a wrong/old location
- Before any skill that depends on the SDK path if the path was never configured

> **Note:** The `tizen-sdk-install` skill now **automatically calls `initSdk()`** after a
> successful install (both in the pre-check CLI and in the installer scripts), so running
> `sdk-init` separately is only needed when the SDK was installed manually or the config file
> needs to be updated to point to a different path.


## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Handoff

**Scope check:**
- **Single-task request** (e.g., "SDK 경로 설정해줘") → DONE. Report envelope.
- **Multi-step request** (e.g., "SDK 경로 설정하고 앱 만들어줘") → Continue to next step.

**Suggested next steps (only when user asks):**
- `tizen-sdk-install` (install the Tizen SDK if not yet installed)
- `tizen-create-project` (create a new project)
- `tizen-build-project` (build a project)
- `tizen-device-manager` (verify device/emulator connection)
