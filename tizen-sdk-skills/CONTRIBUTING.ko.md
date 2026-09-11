# tizen-sdk-skills 기여 가이드

[English](CONTRIBUTING.md) | 한국어

플러그인 개선에 참여해 주셔서 감사합니다. 이 문서는 기여의 실무 절차를 다루며,
역할·승인 규칙·의사결정은 [GOVERNANCE.ko.md](GOVERNANCE.ko.md)에 있습니다.

## 1. 시작하기 전에

- [GOVERNANCE.ko.md](GOVERNANCE.ko.md)를 읽어 주세요 — 특히 2.2(코드 리뷰).
- 사전 요구사항: Node.js 20 이상, 저장소 루트에서는 `pnpm`, `tizen-cli/`와
  `tests/`에서는 `npm`. cli 레인 테스트 케이스를 실행하려면 빌드된 플러그인이
  설치된 tizen-cli가 추가로 필요합니다.
- 개발이 아니라 사용이 목적이라면 [빠른 시작](README.ko.md#빠른-시작)을
  따르세요.

## 2. 변경은 어디에 (하네스 분리)

`common/`이 단일 진실 공급원입니다 — agents, skills, `lib/`, `scripts/`,
`hooks/`, `setup/`. 모든 하네스는 설치 시 이를 미러링합니다.

- 로직은 `common/`에 넣습니다. `claude/`, `cline/`, `codex/`, `gemini/`
  디렉터리는 얇은 래퍼와 훅 어댑터만 담으며, 로직을 복제하지 않습니다.
- `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` 아래의 미러 사본은 직접
  편집하지 않고 설치 스크립트를 다시 실행합니다.
- 러너 탐색 스니펫이나 `common/lib/core/plugin-cache.js`의 `HOST_DOT_DIRS`를
  바꾼 뒤에는 `node scripts/rewrite-runner-snippets.js`를 실행하고 `--check`로
  확인합니다.
- `tizen-cli/`와 `vscode/`는 빌드 시 `common/`을 번들링합니다 — 사본을 넣지
  않습니다.
- 하네스 추가 = `common/setup/hosts/<name>.{sh,ps1}` 하나, `HOST_DOT_DIRS` 항목
  하나, 그리고 rewrite 스크립트 실행.
  [하네스 분리 원칙](README.ko.md#하네스-분리-원칙)을 참고하세요.

## 3. 브랜치 흐름

- `dev`에서 분기하고 `<type>/<topic>` 형태로 이름을 붙입니다(예:
  `fix/sdb-stderr`, `docs/governance`).
- PR은 **`dev`**를 대상으로 엽니다.
- Maintainer가 주기적으로 `dev` → `main` PR을 엽니다. `main`은 릴리즈 전용이며,
  `main`의 `tizen-sdk-skills-v*` 태그가 저장소 루트의 `release.yml`을 트리거합니다.
- **CI(저장소 루트의 `ci.yml`)는 `tizen-sdk-skills/**`를 건드리는 `main` 대상 PR에서만
  실행됩니다.** 따라서 `dev` 대상 PR을 열기 전에 6장의 로컬 검사를 실행하세요.

## 4. 커밋 메시지

이 저장소 전반에서 쓰는 Conventional Commits 형식입니다.

```
<type>(<scope>)?: <명령형, 소문자 제목, 72자 이하>

<본문: 무엇이 아니라 왜 — 무엇은 diff가 보여 줍니다>

Refs #NNN
```

- 타입: `feat` `fix` `docs` `test` `refactor` `chore` `ci` `style` `build`
  `perf` `revert`.
- 스코프는 모듈 또는 하위 영역: `lib` `setup` `scripts` `docs` `vscode`
  `tizen-cli` `tests` `agents` `skills` `hooks`. 저장소 전체 변경이면 생략합니다.
- 히스토리의 실제 예:
  - `fix(build): empty dist/ before each tizen-cli build`
  - `fix(docs): replace example passwords with placeholders`
  - `chore: bump version to 1.1.0`

## 5. 풀 리퀘스트

- 템플릿의 모든 섹션(Summary / Changes / Commits / Testing)을 채웁니다.
  템플릿은 저장소 루트의 `.github/PULL_REQUEST_TEMPLATE.md`에서 자동으로 로드됩니다.
- 논의는 PR 리뷰 스레드에서 합니다. PR 범위를 넘어서는 주제만 별도 Issue로 열고,
  PR 설명에서 링크하세요.
- 리뷰어는 저장소 루트의 `.github/CODEOWNERS`에서 자동 요청됩니다. 승인 규칙은
  GOVERNANCE.ko.md 2.2.1에 있습니다.
- PR 하나에 주제 하나. 브랜치 갱신은 머지 커밋 대신 `dev` 위로 리베이스합니다.

## 6. 로컬 검사

PR을 열기 전에 항상 [README → 개발](README.ko.md#개발)의 명령 블록을 실행합니다.
테스트 스위트에 대해서는 추가로:

```bash
cd tests && npm ci
npm run lint        # TC 스키마 dry-run + doc-stats + 러너 헬퍼 테스트 (CI와 동일)
npm run test:safe   # safe 티어 TC, SDK나 디바이스 불필요
```

## 7. 테스트 티어

티어 정의는
[tests/README.md → Tier Classification](tests/README.md#tier-classification)에
있습니다.

| 티어     | 필요 조건                          | 실행해야 하는 변경 범위                                                                                                 |
| -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| safe     | 없음                               | 모든 변경 — 항상 `npm run test:safe` 실행                                                                               |
| mutating | 호스트에 실제 Tizen SDK            | SDK 설치/업데이트, 인증서, 프로젝트 생성/삭제/빌드, 루트스트랩, dotnet-setup                                            |
| device   | 실행 중인 에뮬레이터 또는 디바이스 | device-manager, 에뮬레이터, install-app, screenshot, file-transfer, remote-device, gdb/dotnet/webapp 디버그, playwright |

실행한 티어를 PR의 "Testing" 섹션에 기록합니다.

TC 추가: [tests/README.md → Adding a New TC](tests/README.md#adding-a-new-tc)를
따릅니다 — 파일 이름 규칙, YAML 스키마, `tests/README.md`와
`CSV-YAML-MAPPING.md`의 개수 갱신, 실제 자격 증명 대신 `${NAME}` 플레이스홀더.
새 TC는 `status: draft`로 시작합니다.

## 8. 문서

- 문서는 쌍으로 제공되며 두 파일을 같은 PR에서 변경합니다.
  - 저장소 루트: `X.md`(영어) + `X.ko.md`(한국어)
  - `docs/`: `X.md`(한국어) + `X.en.md`(영어)
  - `tizen-cli/README.md` + `tizen-cli/README.ko.md`
- 쌍을 이루는 모든 파일은 H1 바로 아래에 상대 문서로 가는 언어 전환 줄을 둡니다 —
  영문 파일은 `English | [한국어](X.ko.md)`, 한국어 파일은
  `[English](X.en.md) | 한국어`.
- 명령·스킬 개수("34 commands", "29 skills")를 `README*.md`,
  `docs/SKILLS_REFERENCE*.md`, `tests/README.md`, 그리고 `README*.md`의
  "프로젝트 현황" 표 전체에서 일치시킵니다.
- 새 Markdown은 저장소 Prettier 설정(80열, LF 줄바꿈. `.gitattributes`가
  `*.md`에 LF를 강제)을 따릅니다. CI는 Markdown을 검사하지 않으므로
  `npx prettier --check <file>`을 직접 실행하세요.

## 9. 버전 관리와 릴리즈 (Maintainer)

1. `chore: bump version to X.Y.Z` 커밋 하나로 버전을 올립니다. 버전은 일곱 개
   파일에 있습니다: `package.json`, `tests/package.json`,
   `tizen-cli/package.json`, `tizen-cli/plugin.json`, `vscode/package.json`,
   `common/.claude-plugin/plugin.json`, `_repo-root/.claude-plugin/marketplace.json`
   (그리고 `tizen-agent-skills` 저장소 루트의 사본).
2. `dev`를 `main`에 머지합니다.
3. `tizen-agent-skills` 저장소의 `main`에 `tizen-sdk-skills-vX.Y.Z` 태그를 만듭니다.
   저장소 루트의 `release.yml`이 `tizen-sdk-vX.Y.Z.zip`과
   `tizen-ai-extension-vX.Y.Z.vsix`를 빌드해 GitHub Release에 첨부합니다 —
   [릴리즈](README.ko.md#릴리즈)를 참고하세요.
4. `CHANGELOG.md`에 릴리즈를 기록하고, 버전 범프 PR을 링크한
   `Release tizen-sdk-skills vX.Y.Z` 제목의 Issue로 공지합니다.

## 10. Reviewer 또는 Maintainer가 되려면

역할은 기여를 따릅니다. 한 모듈에 머지된 non-trivial PR이 대략 10건이 되면 본인
또는 Reviewer/Maintainer 누구든 `governance` Issue를 열어 그 모듈의 Reviewer로
추천할 수 있으며, Maintainer가 Lazy Consensus로 수락합니다. Maintainer 경로와
해임을 포함한 세부 내용은 GOVERNANCE.ko.md 2.1.1에 있습니다.

## 11. 버그 및 보안 이슈 신고

- 버그와 기능 요청: 이 저장소에 GitHub Issue를 열고 재현 절차,
  호스트(Claude Code / Cline / Codex / Gemini / tizen-cli), OS, JSON envelope
  또는 로그 출력을 포함합니다.
- 유출된 자격 증명, 인증서 자료, 그 밖의 보안 민감 사안: 공개 Issue를 **열지
  마세요**. 저장소 루트의 [SECURITY.md](../SECURITY.md)에 있는 비공개 신고 절차를 따르세요.
