# tizen-action-skills

[English](README.md) | 한국어

Tizen Action Framework의 **Action Provider** 구현을 돕는 Claude Code
플러그인입니다. Tizen Action Framework는 디바이스의 AI Agent가 앱의 기능을
사용할 수 있게 해 주는 구조입니다. "이 앱의 북마크 기능을 Tizen Action으로
노출해 줘", "Tizen.Action.Browser 카테고리를 C#으로 구현해 줘"처럼 요청하면
스킬이 provider 개발 전 과정을 안내합니다.

| 스킬 | 하는 일 |
|---|---|
| [`tizen-action-skill`](common/skills/tizen-action-skill/) | 기본 Action Category를 고르거나 custom `.action`/`.entity`(subscription action 포함)를 작성하고, `actionc`로 C#, C++, JavaScript, Flutter-Tizen/Dart provider stub을 생성한 뒤 구현·등록하고, `action-tool`로 디바이스에서 검증 |

## 빠른 시작

1. Claude Code에서 이 저장소의 marketplace를 추가하고 플러그인을 설치합니다.

   ```text
   /plugin marketplace add Samsung/tizen-agent-skills
   /plugin install tizen-action-skills@tizen-platform
   ```

   Agent Skills를 읽는 다른 호스트에서는 `common/skills/tizen-action-skill/`을
   호스트의 skills 디렉터리(예: `~/.claude/skills/`)에 복사해 사용합니다.
2. Tizen Action Toolchain(`actionc`, `action2tidl`, `tidlc`)을 설치하고,
   `ACTIONC_DATA_DIR`이 대상 플랫폼 릴리스의 `default-actions/`를 가리키게
   합니다. 스킬은 `scripts/check_toolchain_env.sh`로 설정을 확인할 뿐 직접
   설치하지 않습니다.
3. 노출하려는 기능을 자연어로 설명합니다.

번들 스크립트, 작업 흐름, 자주 놓치는 규칙은
[스킬 README](common/skills/tizen-action-skill/README.md)를 참고하세요.

## 요구 사항

- 디바이스의 TIDL protocol 3 Tizen Action Framework (tizen-action 1.4 이상,
  subscription action은 1.6 이상). 스킬은 1.8 기준으로 검증했습니다
- `platform/core/appfw/tidl` 저장소의 `tools/action-toolchain`에서 빌드한 Tizen
  Action Toolchain (배포 후에는 Tizen SDK 번들)
- scaffolding 스크립트용 Bash 4 이상, Windows 확인 스크립트용 PowerShell

## 구조

```
tizen-action-skills/
├── common/                         # AI 호스트가 읽는 플러그인 루트
│   ├── .claude-plugin/plugin.json
│   └── skills/tizen-action-skill/  # SKILL.md, references/, assets/, scripts/
├── package.json                    # 플러그인 버전
└── README.md · README.ko.md · CHANGELOG.md · CONTRIBUTING.md · LICENSE · NOTICE
```

## 테스트

scaffolding 테스트에는 protocol 3 toolchain과, 같은 릴리스의
[tizen-action](https://git.tizen.org/cgit/platform/core/appfw/tizen-action/)
`default-actions` 데이터가 필요합니다. `actionc`나 데이터가 없으면 `SKIP`을
출력하고 0으로 종료합니다.

```bash
export TIZEN_ACTION_SRC=/path/to/tizen-action
export ACTIONC_DATA_DIR="$TIZEN_ACTION_SRC/default-actions"
export ACTIONC_ACTION2TIDL=/path/to/action2tidl ACTIONC_TIDLC=/path/to/tidlc
cd common/skills/tizen-action-skill
bash scripts/check_toolchain_env.sh
bash scripts/test_scaffold_action.sh
bash scripts/test_scaffold_custom_action.sh
```

## 출처

`platform/core/appfw/tizen-action`의 `docs/skills/tizen-action-skill`
(review.tizen.org change 352673)을 옮겨 와 tizen-action 1.8과 3.1 toolchain에
맞게 갱신했습니다.

## 기여와 라이선스

[CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.
[Apache License, Version 2.0](LICENSE)으로 배포됩니다.
