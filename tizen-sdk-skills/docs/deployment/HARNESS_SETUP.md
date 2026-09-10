# 하네스 설치 가이드 — Claude Code · Cline · Codex CLI · Gemini CLI

지원하는 모든 AI 하네스에 tizen-sdk-skills를 설치하는 구현은 하나입니다:

```
common/setup/setup.sh   --harness <claude|cline|codex|gemini> [--repo <path>] [--skip-validation] [--no-restart]
common/setup/setup.ps1  -Harness  <claude|cline|codex|gemini> [-RepoPath <path>] [-SkipValidation] [-NoRestart]
```

각 하네스 디렉토리에는 기존 진입점이 그대로 동작하도록 얇은 wrapper가 있습니다:

| 하네스 | Linux / macOS / Git Bash | Windows PowerShell | Windows cmd |
|---|---|---|---|
| Claude Code | `bash claude/setup/setup.sh` | `.\claude\setup\setup.ps1` | `claude\setup\setup.bat` |
| Cline | `bash cline/setup/setup.sh` | `.\cline\setup\setup.ps1` | `…\cline\setup\setup.bat` |
| Codex CLI | `bash codex/setup/setup.sh` | `.\codex\setup\setup.ps1` | `…\codex\setup\setup.bat` |
| Gemini CLI | `bash gemini/setup/setup.sh` | `.\gemini\setup\setup.ps1` | `…\gemini\setup\setup.bat` |

선행 조건: PATH에 `node`(CLI 러너가 필요로 하며, setup은 `plugin.json` 읽기와 에이전트
정의 변환에 사용). Windows에서는 모든 하네스의 훅이 `bash`(Git Bash)로 실행되므로 PATH에
있어야 합니다.

## 무엇이 어디에 설치되나

모든 하네스는 캐시 규약
`~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`을 공유합니다 —
`common/lib/core/plugin-cache.js`(`HOST_DOT_DIRS`)와 모든 agent/skill의 러너 탐색 스니펫이
찾는 위치입니다.

| | Claude Code | Cline | Codex CLI | Gemini CLI |
|---|---|---|---|---|
| Dot-dir | `~/.claude` | `~/.cline` | `~/.codex` (`$CODEX_HOME`) | `~/.gemini` |
| 캐시 내용 | skills agents scripts lib assets tools docs | scripts lib assets tools docs | skills agents scripts lib assets tools docs | skills agents scripts lib assets tools docs |
| 스킬 | `~/.claude/skills/<n>/` | `~/.cline/skills/<n>/` | `~/.agents/skills/<n>/` (Gemini와 공유) | `~/.gemini/skills/<n>/` |
| 에이전트 | `~/.claude/agents/*.md` (원본 그대로) | — (Cline 서브에이전트는 이를 지원하는 빌드에 내장) | `~/.codex/agents/*.toml` (`name`, `description`, `developer_instructions`) | `~/.gemini/agents/*.md` (tools를 Gemini 이름으로 매핑, `maxTurns` → `max_turns`, `model` 제거) |
| 가드(훅) | `~/.claude/hooks/tizen-sdk-skills/*.sh` + `settings.json` `hooks.PreToolUse` 항목 자동 병합(3개 훅 모두; 파일을 파싱할 수 없을 때만 스니펫 출력) | `Documents/Cline/Hooks/PreToolUse` 어댑터 + 가드 (훅을 지원하는 Cline 빌드; macOS/Linux만) | `~/.codex/hooks/tizen-sdk-skills/*.sh` + `~/.codex/hooks.json` 작성(외부 `hooks.json`이 있으면 병합 스니펫 출력) | `~/.gemini/hooks/tizen-sdk-skills/BeforeTool` 어댑터 + 가드; `settings.json` `hooks.BeforeTool` 항목 자동 병합(파일을 파싱할 수 없을 때만 스니펫 출력) |
| 상시 규칙 | — | `Documents/Cline/Rules/tizen-sdk-skills-guard.md` (한국어) | `~/.codex/AGENTS.md` — 마커 구획 | `~/.gemini/GEMINI.md` — 마커 구획 |
| 탐색 스니펫이 쓰는 호스트 마커 | `CLAUDECODE=1` | 없음(기본값) | Codex가 셸에 주입하는 `CODEX_*` 변수 중 하나: `CODEX_THREAD_ID`, `CODEX_SANDBOX_NETWORK_DISABLED`(기본 샌드박스), `CODEX_SANDBOX`(macOS), `CODEX_VERSION` | `GEMINI_CLI=1` |

가드 스크립트 자체(`common/hooks/check-tizen-commands.sh`, `check-project-writes.sh`)는 모든
하네스에 동일합니다. Codex CLI는 Claude Code와 같은 PreToolUse JSON을 사용하므로(셸 도구
이름이 그대로 `Bash`, deny는 `hookSpecificOutput.permissionDecision`) 가드가 무수정으로
동작하고, Cline과 Gemini는 도구 이름을 바꾸고 deny JSON을 변환하는 60줄 내외의 어댑터를
거칩니다.

`AGENTS.md` / `GEMINI.md`의 마커 구획은
`<!-- tizen-sdk-skills:begin --> … <!-- tizen-sdk-skills:end -->`이며, setup을 다시 실행하면
그 구획만 교체되고 파일의 나머지는 건드리지 않습니다.

## 설치 후 할 일

**Claude Code** — setup이 `hooks.PreToolUse` 항목을 `~/.claude/settings.json`에 이미 병합했습니다
(파일을 파싱할 수 없을 때만 스니펫이 출력되며, 그때는 수동으로 병합). 세션을 재시작합니다.


**Cline** — Cline 설정 UI에서 Hooks와 Subagents를 한 번 켭니다(훅·스킬을 지원하는 Cline 빌드
기준이며, 사용 중인 빌드를 확인하세요 — upstream Cline은 다를 수 있습니다. Windows에서는
훅이 동작하지 않으며, 그 경우 Rules 파일이 역할을 대신합니다).

**Codex CLI**
1. Codex를 재시작하고 `/hooks`를 실행합니다 — 스크립트가 작성한 훅은 **거기서 승인하기 전까지
   신뢰되지 않습니다**.
2. 그래도 동작하지 않으면 `~/.codex/config.toml`에 추가합니다:
   ```toml
   [features]
   hooks = true
   ```
3. `/skills`에 tizen 스킬(`~/.agents/skills`에서 읽음), `/agent`에 tizen 에이전트가 보여야 합니다.
4. Codex의 exec 도구는 호출당 **최대 30초**만 기다립니다. list / create / delete는 그 안에 끝나지만,
   `launch`, `create --launch`, 빌드, 앱 설치, dotnet-setup, 디버그 셋업, Playwright 실행, 대용량 파일 전송은
   스킬과 `AGENTS.md`(가드 규칙 11)가 안내하는 대로 `--background`를 붙여 실행(모든 러너가 지원)하고
   `node <lib/cli>/job-cli.js wait --id <job_id>`로 폴링해야 합니다 — `progress_tail`/`log_file`에
   `tz build` 로그 등 스크립트 출력이 실시간으로 보입니다.
   설치·업데이트(SDK, TV SDK, 플랫폼, 에뮬레이터/모바일 패키지, rootstrap, update-package)는 2단계로,
   사전점검 러너가 돌려주는 `suggested_fix.background_command`
   (`node <lib/cli>/job-cli.js run --script <group> …`)가 설치 스크립트를 job으로 분리 실행합니다 —
   **권한 상승으로 실행**(기본 샌드박스는 `CODEX_SANDBOX_NETWORK_DISABLED=1`이고 설치는 다운로드를
   함)하고 같은 방식으로 폴링하세요.
   Codex가 `[tizen-…]` 진행 헤더 한 줄만 보여주고 JSON 엔벨로프가 없다면 러너가 아직 실행 중인
   것이며 결과가 아닙니다(이슈 #48). 플러그인을 업데이트한 뒤에는 Codex 셋업을 다시 실행해
   `~/.codex/AGENTS.md`에 규칙 11이 들어가게 하세요(Windows에서는 진짜 UTF-8로 기록되도록 — 이전
   설치는 em dash를 모두 `??`로 바꿔 놓았습니다).
5. Codex의 기본 `workspace-write` **샌드박스**는 TCP 소켓(`CODEX_SANDBOX_NETWORK_DISABLED=1`),
   워크스페이스 밖 쓰기(`<sdk>`, `<sdk>-data`의 profiles.xml / keystore `.pwd`, `~/.tizen*`)를 막고,
   Linux(bubblewrap PID 네임스페이스)에서는 exec 호출이 끝나는 순간 분리 잡을 종료시킵니다 — 이슈 #81의
   빌드 잡이 수 ms 만에 "exited without writing its result"가 된 원인입니다. 러너는 이제 샌드박스를
   감지합니다(`lib/core/sandbox.js`): `--background`와 `job-cli.js run --script`는
   `error_category: sandbox_blocked`로 시작 전에 거부되며 `suggested_fix.command`는 입력한 명령
   그대로(`escalate: true`)입니다. 샌드박스 안의 다른 실패에는 "Running inside Codex's sandbox" 경고가,
   오류 문구가 권한/네트워크 차단 패턴이면 `sandbox_blocked` 오류가 추가됩니다. 가드 규칙 12가
   권한 상승으로 실행해야 하는 항목(sdb, em-cli, 인증서 작업, dotnet-setup, 모든 분리 잡)을 나열합니다.
   `TIZEN_SANDBOX=off`는 이전 동작으로 되돌리고, `TIZEN_SANDBOX=on`은 마커가 없을 때
   (`network_access = true`) 강제합니다. Codex 셋업을 다시 실행해 `AGENTS.md`에 규칙 12를 넣으세요.

**Gemini CLI**
1. setup이 `hooks.BeforeTool` 항목을 `~/.gemini/settings.json`에 이미 병합했습니다
   (파일을 파싱할 수 없을 때만 스니펫이 출력되며, 그때는 수동으로 병합).
2. 재시작 후 `/skills list`와 `/agents`에 tizen 항목이 보여야 합니다.
3. 에이전트 `tools`는 `Bash→run_shell_command`, `Read→read_file`, `Glob→glob`,
   `Grep→search_file_content`, `Write→write_file`, `Edit→replace`로 매핑했습니다.
   `/agents`가 정의를 거부하면 어떤 도구 이름을 문제 삼는지 알려주세요.

## 확인

```bash
# 1. setup 자체가 검증합니다: 모든 "(repo <-> cache)"와 "Skill (...)" 줄이
#    "Validation passed"여야 하고, hooks/context 줄도 같아야 합니다.

# 2. 스킬 스니펫 방식의 러너 탐색(어느 하네스든), 예: sdk-init
ls "$HOME"/.{claude,cline,codex,gemini}/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/sdk-init-cli.js

# 3. 훅 스모크 테스트 — Gemini 어댑터 (Codex/Claude는 같은 페이로드를 tool_name "Bash"로
#    ~/.codex/hooks/tizen-sdk-skills/check-tizen-commands.sh에 파이프)
printf '%s' '{"tool_name":"run_shell_command","tool_input":{"command":"tizen build-native"}}' \
  | bash ~/.gemini/hooks/tizen-sdk-skills/BeforeTool
# → {"decision":"deny","reason":"The tizen CLI ... is NOT available ..."}

# 4. 마크다운 스니펫과 plugin-cache.js의 호스트 목록 일치(단위 테스트로도 검사):
node scripts/rewrite-runner-snippets.js --check
```

## 재실행과 제거

setup은 멱등합니다: 캐시는 클린 미러, 개인 스킬 폴더는 스킬 단위로 교체, 에이전트 파일은
덮어쓰기, 지침 파일의 구획은 제자리 교체입니다.

하네스 설치를 수동으로 제거하려면:

```bash
rm -rf ~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills
rm -rf <skills-dir>/tizen-*                 # <skills-dir>는 위 표 참조
rm -f  <agents-dir>/tizen-*.md <agents-dir>/tizen-*.toml
rm -rf ~/<dot-dir>/hooks/tizen-sdk-skills   # codex / gemini
# 그 다음 AGENTS.md / GEMINI.md의 tizen-sdk-skills 구획과
# settings.json / hooks.json의 훅 항목을 삭제
```

## 하네스 추가하기

1. `common/lib/core/plugin-cache.js`: `HOST_DOT_DIRS`에 dot-dir 추가, `HOST_MARKERS`에 그
   호스트가 셸에 주입하는 env 변수 목록 추가(빈 목록 = 기본 호스트), 마커가 있으면
   `HOST_DETECT_ORDER`에도 추가.
2. `node scripts/rewrite-runner-snippets.js` — 모든 agent/skill/doc의 bash/PowerShell 탐색
   스니펫을 위 테이블에서 재생성(자기 호스트 우선, 그다음 모든 호스트를 호스트별 버전 정렬).
   이 작업 전까지 `common/lib/tests/plugin-cache.test.js`가 실패합니다.
3. `common/setup/hosts/<name>.sh`와 `<name>.ps1` — 경로, 캐시 서브디렉토리, 에이전트 형식
   (`md` | `gemini-md` | `toml` | `none`, 새 형식은 `agent-convert.js` 확장), 훅/지침 단계.
4. `<name>/setup/setup.{sh,ps1,bat}` wrapper(기존 쌍을 복사해 하네스 이름만 변경).

## 알려진 공백 (Phase 2)

- Gemini CLI 에이전트 `tools` 이름과 Gemini 확장의 `hooks/hooks.json` 스키마는 실제 Gemini
  CLI에서 아직 검증하지 않았습니다.
- Codex CLI의 쓰기 도구 `tool_name`은 미확인이며, `check-project-writes` matcher는 가능한
  이름을 포괄하도록 `Write|Bash|apply_patch`로 두었습니다.
- 네이티브 패키징 — Gemini 확장(`gemini-extension.json`)과 Codex 플러그인
  (`.codex-plugin/plugin.json` + marketplace) — 그리고 VS Code 확장의 호스트 테이블은 아직
  Codex/Gemini로 확장되지 않았습니다.
