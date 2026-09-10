---
name: tizen-check-disk-space
description: Check disk space, disk space check, 디스크 공간 확인, 용량 확인, storage check, 설치 전 공간 확인, disk space, free space. Use this skill to verify available disk space before installing the Tizen SDK. Runs a quick CLI runner that checks free space on the target drive and returns a Standard JSON Envelope with disk info. Recommended before tizen-sdk-install.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-14"
  keywords:
    - disk space
    - free space
    - storage check
    - 디스크 공간
    - 용량 확인
    - Tizen SDK install prerequisite
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-check-disk-space` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-check-disk-space`)
2. 수집된 입력(경로, 요구 공간)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code, ALL platforms)

Use the shipped CLI runner. Find the runner path, then run `node` on it.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*check-disk-space-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*check-disk-space-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*check-disk-space-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*check-disk-space-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\check-disk-space-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" [path] [requiredGb]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" [path] [requiredGb]
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/check-disk-space-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/check-disk-space-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" [path] [requiredGb]
```

Exit code: `0` = success (sufficient space), `1` = failure (insufficient space or error).

## Parameters

- **path** — (optional) directory path to check. Defaults to the user's home directory (`~`). Only the drive containing the home directory is checked.
- **requiredGb** — (optional) minimum required space in GB. Defaults to `15` (Tizen SDK minimum).


## What checkDiskSpace() handles internally

1. Path resolution: argument → config SDK path → home directory
2. Disk space query via `fs.statfsSync()` (Node.js 18+) or `child_process` fallback chain (Windows: PowerShell `Get-PSDrive` → `fsutil volume diskfree` → legacy `wmic`; Linux/macOS: `df -Pk`). If no probe can measure the drive the check reports `source: "unknown"` with a warning instead of blocking the install (issue #69)
3. Comparison: free bytes vs required bytes
4. Standard JSON Envelope response with disk info

## Response

**Success (sufficient space):**
```json
{
  "command": "tizen-sdk check-disk-space",
  "status": "success",
  "result": {
    "path": "C:/Users/<username>/tizen-sdk",
    "total_bytes": 536870912000,
    "free_bytes": 214748364800,
    "used_bytes": 322122547200,
    "total_gb": 500.0,
    "free_gb": 200.0,
    "required_gb": 5.0,
    "sufficient": true
  }
}
```

**Failure (insufficient space):**
```json
{
  "command": "tizen-sdk check-disk-space",
  "status": "failure",
  "errors": [{
    "error_code": "TIZEN_SDK_ENV_E002",
    "error_category": "insufficient_disk_space",
    "message": "Insufficient disk space: 2.3 GB free, but 5.0 GB required...",
    "suggested_fix": {
      "command": "Free up at least 2.7 GB on the drive...",
      "auto_fixable": false
    }
  }]
}
```

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
- **Single-task request** (e.g., "디스크 공간 확인해줘") → DONE. Report envelope.
- **Multi-step request** (e.g., "SDK 설치해줘") → Run this check FIRST, then proceed to `tizen-sdk-install` if space is sufficient.

**Suggested next steps (only when user asks):**
- `tizen-sdk-install` (install the Tizen SDK)
- `tizen-create-project` (create a new project)
