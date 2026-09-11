# 플러그인 배포·동기화 가이드 (user-level 컴포넌트 배포)

[English](PLUGIN_DEPLOYMENT_SYNC.en.md) | 한국어

> 일부 환경에서는 조직 정책(`strictKnownMarketplaces: []`, `~/.claude/remote-settings.json`으로
> 서버에서 내려옴)이 `tizen-platform` 마켓플레이스를 차단해 플러그인이
> 어느 세션에서도 로드되지 않는다 (`claude plugin list` →
> `Marketplace 'tizen-platform' is not in the allowed marketplace list`).
> 이런 환경에서는 스킬·에이전트·훅을 **개인(user-level) 컴포넌트**로 배포한다.
> 개인 컴포넌트는 마켓플레이스 시스템을 거치지 않는 Claude Code 기본 기능이라
> 정책의 영향을 받지 않는다.

## 배포 위치 3곳 (항상 같은 상태를 유지할 것)

| 위치 | 경로 | 역할 |
|---|---|---|
| ① 리포 (원본) | `<repo-root>/` (tizen-sdk-skills 체크아웃) | 소스 오브 트루스. 모든 수정은 여기서 시작 |
| ② 플러그인 캐시 | `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0/` | SKILL.md가 CLI 러너를 이 경로 글롭(`*/lib/cli/*.js`)으로 참조 — **지우면 안 됨**. 정책 해제 시 플러그인 로딩 경로로 복귀 |
| ③ 개인 복사본 | `~/.claude/skills/<스킬이름>/`, `~/.claude/agents/*.md` | **현재 실제 로딩 경로** (정책 해제 전까지) |

훅은 복사본이 없다: `~/.claude/settings.json`의 `hooks.PreToolUse`가
①리포의 `common/hooks/*.sh`를 **절대 경로로 직접** 가리키므로
리포에서 훅 스크립트를 고치면 즉시 반영된다 (세션 재시작만 필요).

## 수정 후 동기화 절차

스킬/에이전트/lib/docs를 수정했다면 아래를 순서대로 실행한다 (Git Bash):

```bash
R="C:/path/to/tizen-sdk-skills"
C="$HOME/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0"

# 1) 리포 → 캐시
cp -r "$R/common/skills/."  "$C/skills/"
cp -r "$R/common/agents/."  "$C/agents/"
cp -r "$R/common/scripts/." "$C/scripts/"
cp -r "$R/common/lib/."     "$C/lib/"
cp -r "$R/docs/." "$C/docs/"

# 2) 캐시 → 개인 복사본 (현재 실제 로딩 경로)
cp -r "$C/skills/."     "$HOME/.claude/skills/"
cp    "$C/agents/"*.md  "$HOME/.claude/agents/"

# 3) 검증 — 아무것도 출력되지 않아야 정상
diff -rq "$R/common/skills" "$C/skills"
diff -rq "$R/common/lib" "$C/lib"
for s in $(ls "$C/skills"); do diff -rq "$C/skills/$s" "$HOME/.claude/skills/$s"; done
```

> **자동화 스크립트**: 위 절차는 `claude/setup/setup.ps1` (Windows) 또는
> `claude/setup/setup.sh` (Linux/macOS)를 실행하면 자동으로 수행된다 —
> 둘 다 `common/setup/setup.{ps1,sh} --harness claude`의 얇은 wrapper다.
> 같은 구현이 Cline, Codex CLI, Gemini CLI도 처리한다; 하네스별로 무엇이 어디에 설치되는지는
> [HARNESS_SETUP.md](HARNESS_SETUP.md) 참조.

동기화 후 **Claude Code 세션을 재시작**해야 새 스킬 정의·훅이 로드된다.

## 동작 확인 (headless 프로브)

```bash
# 스킬 인식 확인 — tizen 스킬 9개가 나와야 함
claude -p "Answer with ONLY a comma-separated list of skill names containing tizen, or NONE."

# 훅 발동 확인 — 거부 + 교정 메시지가 나와야 함
claude -p "Run exactly this bash command and report the outcome: tizen list templates"

# 플러그인 차단 상태 확인
claude plugin list
```

## 정책이 해제되면 (원상 복구)

플러그인이 다시 로드되기 시작하면 개인 복사본과 이중 로드되므로 **반드시 제거**한다:

```bash
# 개인 스킬/에이전트 복사본 제거 (tizen-* 만)
rm -rf "$HOME"/.claude/skills/tizen-*
rm -f  "$HOME"/.claude/agents/tizen-*.md
```

그리고 `~/.claude/settings.json`에서 `hooks.PreToolUse`의 tizen 훅 2개 항목을 삭제한다
(플러그인의 `hooks/hooks.json`이 동일한 훅을 다시 담당하게 된다).

근본 해결은 조직 Claude 관리자에게 `tizen-platform` 마켓플레이스
(`github.com/Samsung/tizen-agent-skills`)를
허용 목록에 추가해 달라고 요청하는 것이다.

## 참고: settings.json에 등록된 훅 (현재 상태)

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Bash|PowerShell",
      "hooks": [{ "type": "command",
        "command": "bash \"C:/path/to/tizen-sdk-skills/common/hooks/check-tizen-commands.sh\"" }]
    },
    {
      "matcher": "Write|Bash|PowerShell",
      "hooks": [{ "type": "command",
        "command": "bash \"C:/path/to/tizen-sdk-skills/common/hooks/check-project-writes.sh\"" }]
    }
  ]
}
```
