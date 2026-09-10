---
name: tizen-check-node
description: Check Node.js, node check, node 설치 확인, Node.js installed, node version, 노드 확인. Use this skill to verify Node.js is installed and on PATH before installing the Tizen SDK. Runs a quick CLI runner that checks node --version and returns a Standard JSON Envelope with version/path info. Required before tizen-sdk-install.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-15"
  keywords:
    - node check
    - node.js
    - node installed
    - node version
    - 노드 확인
    - Tizen SDK install prerequisite
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-check-node` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-check-node`)
2. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code, ALL platforms)

Use the shipped CLI runner. Find the runner path, then run `node` on it.

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*check-node-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*check-node-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*check-node-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*check-node-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\check-node-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/check-node-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/check-node-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

Exit code: `0` = success (Node.js installed), `1` = failure (Node.js not found or error).

## What checkNode() handles internally

1. Use the Node.js interpreter that is running the runner itself (`process.version` / `process.execPath`) —
   the runner being alive is the proof that Node.js is installed. No `node --version` is spawned
   (issue #71: under a sandboxed host the child PATH may lack `node` while the runner runs fine)
2. Best-effort: run `where node` (Windows) or `which node` (Linux/macOS) to report `on_path`; a miss is
   only a warning, never a failure
3. Parse major version and warn if < 18 (recommended minimum)
4. Return Standard JSON Envelope with version, path, major_version, source (`process` | `pkg`), on_path

## Response

**Success (Node.js installed):**
```json
{
  "command": "tizen-sdk check-node",
  "status": "success",
  "result": {
    "installed": true,
    "version": "v20.11.0",
    "path": "C:\\Program Files\\nodejs\\node.exe",
    "major_version": 20
  }
}
```

**Failure (Node.js not installed):**
```json
{
  "command": "tizen-sdk check-node",
  "status": "failure",
  "errors": [{
    "error_code": "TIZEN_SDK_CONFIG_E005",
    "error_category": "node_not_found",
    "message": "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 18+. Please install Node.js LTS from https://nodejs.org/ and retry.",
    "suggested_fix": {
      "command": "winget install OpenJS.NodeJS.LTS (Windows) | brew install node (macOS) | sudo apt install -y nodejs npm (Linux)",
      "auto_fixable": false,
      "guide_url": "https://nodejs.org/"
    }
  }]
}
```

## Installation Guide (when Node.js is not installed)

| OS | Command |
|---|---|
| **Windows** | `winget install OpenJS.NodeJS.LTS` |
| **macOS** | `brew install node` |
| **Linux (Ubuntu/Debian)** | `sudo apt update && sudo apt install -y nodejs npm` |
| **All OS (manual)** | Download LTS from https://nodejs.org/ |

After installing Node.js, **restart the terminal** (to refresh PATH), then retry the Tizen SDK installation.

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
- **Single-task request** (e.g., "Node.js 설치 확인해줘") → DONE. Report envelope.
- **Multi-step request** (e.g., "SDK 설치해줘") → `sdk-install-cli.js` checks Node.js automatically. No separate run needed.

**Suggested next steps (only when user asks):**
- `tizen-sdk-install` (install the Tizen SDK — checks Node.js automatically)
- `tizen-check-disk-space` (verify disk space before SDK installation)
