# tizen-sdk-skills 거버넌스

[English](GOVERNANCE.md) | 한국어

`tizen-sdk-skills` 프로젝트가 어떻게 조직되고, 누가 무엇을 결정하며, 변경이
어떻게 리뷰되는지를 정의합니다. 최종 개정: 2026-09-09.

## 1. 프로젝트

### 1.1 개요

tizen-sdk-skills는 AI 코딩 어시스턴트(Claude Code, Cline, Codex CLI, Gemini
CLI)와 tizen-cli 플러그인 호스트를 위한 Tizen SDK 자동화 플러그인이며, 이를
설치·동기화하는 VS Code 확장을 함께 제공합니다. SDK 설치, 프로젝트 생성, 빌드,
에뮬레이터·디바이스 관리, 앱 설치, 원격 디버깅(GDB / netcoredbg / CDP), 인증서
관리, Playwright 테스트를 자동화하고 모든 결과를 Standard JSON Envelope로
반환합니다.

이 저장소는 GitHub(`Samsung/tizen-agent-skills`의 `tizen-sdk-skills/` 디렉터리)에서
공개 개발되며 Apache License 2.0으로 배포됩니다(2.1.4 참고). 아키텍처와 디렉터리 구조는 README의
[저장소 구조](README.ko.md#저장소-구조)와
[하네스 분리 원칙](README.ko.md#하네스-분리-원칙)에 정리되어 있으며, 이
문서에서는 반복하지 않습니다.

### 1.1.1 운영 주체(Steering body)

이 프로젝트에는 별도의 Steering Committee가 없습니다. 2.1.1의 Maintainer들이
집합적으로 운영 주체 역할을 합니다. 담당 범위는 다음과 같습니다.

- 프로젝트 로드맵과 릴리즈 주기
- Reviewer·Maintainer의 임명, 이동, 해임
- 라이선스, 정책, 외부 공개 관련 사안
- 모듈 경계를 넘는 갈등의 해결(2.1.3)
- 이 문서의 개정(3장)

운영 결정은 `governance` 라벨이 붙은 GitHub Issue에서 2.1.2의 규칙에 따라
공개적으로 이루어집니다.

### 1.1.2 모듈

모듈은 고유한 코드 오너를 가진 디렉터리 하위 트리입니다. PR은 그것이 건드리는
경로가 속한 모든 모듈에 속합니다. Maintainer는 모든 모듈의 코드 오너이며,
Reviewer 열에는 추가 오너를 표시합니다.

| 모듈                      | 경로                                                                                                                             | Maintainer                                | Reviewer                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| common (단일 진실 공급원) | `common/`, `scripts/`                                                                                                            | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| tizen-cli                 | `tizen-cli/`                                                                                                                     | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| vscode                    | `vscode/`                                                                                                                        | Maintainers (see 2.1.1 roster)            | @\<reviewer-3\>                             |
| 하네스 래퍼               | `claude/`, `cline/`, `codex/`, `gemini/`                                                                                         | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| 테스트 & 문서             | `tests/`, `docs/`, `usage/`, 루트 `*.md`                                                                                         | Maintainers (see 2.1.1 roster)            | Reviewers (see 2.1.1 roster)                |
| 저장소 인프라             | `_repo-root/`(저장소 루트 파일), 루트 `package.json` / lockfile / lint·format 설정, `.gitattributes`, `LICENSE`, `NOTICE`, `GOVERNANCE*.md`, `CONTRIBUTING*.md` | Maintainers (see 2.1.1 roster)            | —                                          |

참고:

- `common/`은 설치 시 모든 하네스에 미러링되므로, 여기서의 변경은 모든 호스트에
  영향을 줍니다. `common/`과 다른 모듈을 **함께** 건드리는 PR은 모듈 간
  변경입니다(2.1.3, 3단계).
- `.github/CODEOWNERS`는 이 표와 2.1.1 명단의 기계 판독용 사본입니다. 두 파일은
  항상 함께 변경합니다.
- 모듈별 Reviewer 배치는 초기 배정이며, Maintainer가 3장의 개정 절차를 통해
  조정할 수 있습니다.

### 1.1.3 빌드·사용·참여 방법

- **사용** — 호스트별 플러그인 설치는 [빠른 시작](README.ko.md#빠른-시작)과
  호스트별 가이드 [HARNESS_SETUP.md](docs/deployment/HARNESS_SETUP.md)를
  참고합니다.
- **빌드 및 테스트** — [개발](README.ko.md#개발)의 명령 블록을 실행합니다.
- **참여** — 브랜치 흐름, 커밋 규칙, 테스트 티어, 문서 쌍 규칙은
  [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md)를 읽은 뒤 Issue 또는 PR을 여십시오.
- **소통** — 이 저장소의 GitHub Issue와 PR 리뷰 스레드가 유일한 공식
  채널입니다. PR 리뷰 스레드와 PR에서 링크한 Issue가 리뷰 중 이루어진 결정의
  기록입니다. 팀 채팅에서 논의해도 되지만, 거기서 도달한 결정은 Issue나 PR에
  기록된 뒤에야 효력을 가집니다.

## 2. 거버넌스와 커뮤니티

### 2.1 거버넌스

이 프로젝트는 오픈 개발 모델을 따릅니다. 누구나 읽고, 제안하고, 리뷰하고,
기여할 수 있습니다. 거버넌스 규칙은
의사결정(2.1.3), 갈등의 상향 조정(2.1.3), 책임 있는 역할(2.1.1), 규칙 자체의
개정 방법(3장)을 정의합니다. 규칙의 개정은 Maintainer가 승인합니다.

### 2.1.1 프로젝트 역할

프로젝트는 세 가지 역할을 인정합니다. 비공식적으로 팀은 필요에 따라 스스로를
조직하며, 공식적인 권한은 다음과 같습니다.

**Contributor** — 저장소에 접근할 수 있는 모든 사람. Contributor는 다음을 할 수
있습니다.

- Issue와 PR 열기(코드, 문서, 테스트, 번역)
- 모든 PR에 코멘트 및 리뷰
- Issue에서 토론 시작 및 참여

Contributor는 일단 내려진 결정을 따르고(새로운 정보가 있으면 재논의 가능), 자신의
변경으로 생긴 결함에 책임을 지며, 커뮤니티 규칙(2.1.2)을 존중하고 건설적인 리뷰를
제공해야 합니다.

**Reviewer** — 하나 이상의 모듈에서 코드 오너인 Contributor. Contributor의 권한에
더해 Reviewer는 다음을 할 수 있습니다.

- 자신의 모듈에 대한 `dev` 브랜치 PR 승인 — 코드 오너 요건을 충족하는 승인
- 다른 Reviewer 또는 Maintainer가 리뷰한 뒤 자신의 기여를 승인
- Maintainer와 함께 모듈의 단·중기 목표 설정

Reviewer는 자신의 모듈에 대한 PR을 2.2.2의 기한 내에 리뷰하고, 모듈의 품질을
책임지며, 요청 시 릴리즈 검증에 참여할 책임이 있습니다. Reviewer는 `dev`를
`main`에 머지하거나, 릴리즈 태그를 만들거나, 역할을 변경할 수 없습니다.

**Maintainer** — 모든 모듈의 코드 오너이며 운영 주체(1.1.1)의 구성원인 Reviewer.
Maintainer는 추가로 다음을 합니다.

- `dev`를 `main`에 머지하고 `tizen-sdk-skills-v*` 릴리즈 태그 생성
- `.github/CODEOWNERS`, `GOVERNANCE*.md`, 저장소 설정 편집
- Reviewer·Maintainer 역할의 부여와 해임
- 모듈 간 결정과 운영 수준 결정의 최종 판단(2.1.3)

**명단** (진실 공급원. 저장소 루트의 `.github/CODEOWNERS`가 이를 미러링합니다)

<!-- TODO(open-source release): 플레이스홀더를 github.com 계정으로 교체하세요. -->

| 역할       | 구성원                                      |
| ---------- | ------------------------------------------- |
| Maintainer | @\<maintainer-1\>, @\<maintainer-2\>, @\<maintainer-3\> |
| Reviewer   | @\<reviewer-1\>, @\<reviewer-2\>, @\<reviewer-3\> |
| Emeritus   | —                                          |

**선출**

- _Contributor → Reviewer._ 후보는 해당 모듈에 머지된 non-trivial PR이 10건
  이상이어야 하며(포맷 전용, 오타 전용, 생성 파일 전용, 버전 범프 변경은 제외),
  2.2.3의 리뷰 태도를 보여야 합니다. Reviewer 또는 Maintainer가 추천하거나,
  Contributor가 근거를 갖춰 자기 추천할 수 있으며, `governance` 라벨 Issue를
  열어 진행합니다. 추천은 Maintainer의 Lazy Consensus(2.1.2)로 수락됩니다: 영업일
  5일 동안 근거 있는 반대가 없으면 확정.
- _Reviewer → Maintainer._ 두 개 이상 모듈에서의 지속적인 리뷰 활동과 기존
  Maintainer 전원의 동의가 필요하며, `governance` Issue에 기록합니다.

**해임**

- _비활동._ 6개월 동안 커밋이나 리뷰가 없는 Reviewer·Maintainer는 Emeritus로
  이동하고 `CODEOWNERS`에서 제외됩니다. Emeritus는 요청 시 Maintainer의 Lazy
  Consensus로 복귀합니다.
- _부적절한 행위._ 리뷰 권한의 고의적 남용이나 [행동 강령](../CODE_OF_CONDUCT.md) 위반은 일시 정지 또는
  해임으로 이어질 수 있습니다. 당사자를 제외한 모든 Maintainer가 결정하고
  `governance` Issue에 기록합니다. Maintainer 간 합의가 되지 않으면 합의될 때까지
  역할을 정지합니다.
- _자발적 사임._ 누구든 명단에 대한 PR을 열어 사임할 수 있습니다.

### 2.1.2 커뮤니티 규칙

모든 구성원은 상식, 예의, 선린의 규칙을 따릅니다. 솔직한 기술 토론은 권장하지만,
코드가 아닌 사람에 대한 논의는 환영하지 않으며 인신공격은 용인되지 않습니다.
구성원은 모든 기여를 존중하고 인정하며, 다른 의견을 경청하고, 모듈을 넘어 서로
돕고, 선의를 전제합니다.

**Lazy Consensus.** 커뮤니티가 동의할 것이라고 믿을 만한 이유가 있으면
Contributor는 바로 작업을 진행하고, 반대가 드러날 수 있도록 신속히(PR로)
공개합니다. 동의가 불확실하면 먼저 `proposal` 라벨 Issue에서 제안합니다. 제안은
**영업일 5일**(단일 모듈에 한정된 기술 결정은 영업일 3일) 안에 근거 있는 반대가
없으면 수락됩니다. 반대는 이유를 밝히고, 가능하면 대안을 제시해야 합니다.

**Silent Consent.** 토론 기간 중 근거 있는 대안을 제시하지 않은 사람은 암묵적으로
동의한 것으로 봅니다. 코드 리뷰에서는 다음을 뜻합니다: 자동 요청된 코드 오너가
2.2.2의 리뷰 기한 내에 응답하지 않으면, 작성자는 같은 모듈의 다른 오너나
Maintainer에게 리뷰를 요청할 수 있으며, 침묵한 오너의 승인은 더 이상 필요하지
않습니다.

**Meritocracy.** 책임은 2.1.1에 설명한 대로 모듈에 대한 입증된 기여와 헌신을
따르며, 연차나 조직도를 따르지 않습니다. 합의 형성에서는 코드를 가장 잘 아는
사람의 의견이 더 큰 비중을 갖습니다.

**저장소에, 글로.** 다른 곳(채팅, 회의)에서 이룬 합의는 관련 Issue나 PR에 기록될
때까지 미승인 제안입니다. Issue, PR, 커밋 메시지에는 영어와 한국어를 모두 쓸 수
있으며, 배포되는 문서는 두 언어로 제공합니다(CONTRIBUTING.ko.md 참고).

### 2.1.3 의사결정

결정은 적용 가능한 가장 낮은 수준에서 이루어지며, 항상 커뮤니티 규칙과 프로젝트
목표를 염두에 둡니다.

1. **PR 안에서** — 작성자와 배정된 리뷰어가 무엇을 어떻게 구현할지 결정합니다.
   대부분의 결정은 여기서 끝납니다.
2. **모듈 수준** — 합의가 되지 않으면 해당 모듈의 코드 오너들이 Lazy
   Consensus(영업일 3일)로 결정합니다.
3. **모듈 간** — 다음은 **모든 Maintainer**의 승인이 필요합니다.
   - 두 개 이상의 모듈, 또는 `common/`과 다른 모듈을 함께 건드리는 변경
   - `common/lib/core/plugin-cache.js`(`HOST_DOT_DIRS`)와 이것이 구동하는 러너
     탐색 스니펫
   - Envelope 계약(`common/lib/envelope/*`)
   - 플러그인 id, 캐시 경로, 환경 변수 이름, 명령 이름
4. **운영** — 로드맵, 릴리즈, 역할, 라이선스, 외부 공개, 이 문서의 개정은 운영
   주체인 Maintainer가 결정합니다.

**Maintainer 간 동률 해소.** 3·4단계에 도달했으나 합의되지 않은 기술
분쟁에는 1주일의 숙려 기간을 두고, 그 후 주로 영향을 받는 모듈에서 커밋이 가장
많은 Maintainer(`git shortlog -s -- <path>`)가 결정합니다. 거버넌스, 역할,
라이선스, 공개 관련 결정은 만장일치가 필요하며, 이루어지지 않으면 현상을
유지합니다.

**릴리즈.** `dev`가 `main`에 머지된 뒤 Maintainer 중 한 명이
`tizen-sdk-skills-vX.Y.Z` 태그를 만들 수 있습니다(릴리즈 워크플로는 프로젝트
접두어가 붙은 이 형식에만 반응합니다). 릴리즈는 버전 범프 PR을 링크한
`Release tizen-sdk-skills vX.Y.Z` 제목의 Issue로 공지합니다.

**호환성을 깨는 변경** — 플러그인 id, 캐시 경로, Envelope 필드, 명령 이름의
변경 — 은 3단계 결정이며, 같은 PR에서 README의 마이그레이션 표에 행을 추가해야
합니다.

### 2.1.4 오픈소스 라이선스

tizen-sdk-skills는 [Apache License, Version 2.0](LICENSE)의 조건으로 배포됩니다.
모든 기여는 같은 라이선스로 수락되며(inbound = outbound), 별도의 CLA나 DCO
서명은 요구하지 않습니다. 새 소스 파일에는 기존 파일과 같은 Apache-2.0 SPDX 헤더를
넣습니다(`node scripts/add-spdx-headers.js --check`로 확인). 프로젝트와 함께
재배포되는 서드파티 자료는 [NOTICE](NOTICE)에 정리되어 있습니다.

### 2.2 코드 리뷰

#### 2.2.1 리뷰 가이드라인

누구나 리뷰하고 코멘트할 수 있습니다. 변경은 저장소 템플릿을 사용한 PR로
제출하며, PR 하나에 주제 하나를 담습니다. 리뷰어 배정은
`.github/CODEOWNERS`에 의한 자동 코드 오너 요청입니다.

`dev`에 머지하기 전 필요한 승인:

- PR이 건드리는 모든 모듈에 대해 코드 오너 1인의 승인(Maintainer의 승인은 모든
  모듈에 유효), 그리고
- PR이 모듈 간 변경(2.1.3, 3단계)이거나, 저장소 인프라를 건드리거나, 버전을
  올리는 경우 Maintainer의 추가 승인.

리뷰어 체크리스트:

- 로직이 하네스별 사본이 아닌 `common/`에 있는가(하네스 디렉터리는 래퍼와
  어댑터만 담습니다).
- 러너 탐색 스니펫이나 `HOST_DOT_DIRS`가 바뀌었을 때
  `node scripts/rewrite-runner-snippets.js --check`가 통과하는가.
- Standard JSON Envelope 계약이 유지되는가.
- 건드린 모든 문서 쌍의 두 언어가 함께 갱신되었는가.
- 추가·변경된 TC가 `tests/README.md`의 개수를 올바르게 유지하고
  (`node scripts/verify-doc-stats.mjs`) 자격 증명을 포함하지 않는가 — `${NAME}`
  플레이스홀더를 사용합니다.
- PR의 "Testing" 섹션이 실제로 실행한 테스트 티어를 명시하는가.

#### 2.2.2 리뷰 기한

- PR에 대한 첫 응답: **영업일 2일** 이내.
- 리뷰 완료: **영업일 5일** 이내. 큰 변경은 더 걸릴 수 있으며, 리뷰어가 스레드에
  그렇게 알립니다.
- `hotfix` 라벨 PR: **영업일 1일** 이내.
- 리뷰어는 첫 승인 후 최소 영업일 1일 동안 PR을 열어 두어 다른 시간대의 구성원이
  의견을 낼 수 있게 합니다(`hotfix` 제외).
- 기한이 지나면 응답하지 않은 오너에게 Silent Consent(2.1.2)가 적용됩니다.
- 작성자의 활동이 30일간 없는 PR은 Maintainer가 닫을 수 있으며, 언제든 다시 열 수
  있습니다.

#### 2.2.3 리뷰·토론 원칙

- 코드를 논의하고, 작성자를 논의하지 않습니다.
- 기여, 제안, 코멘트를 존중하고 인정합니다.
- 다른 의견을 경청하고 열린 태도를 가지며, 서로 돕습니다.
- 모든 "Request changes"에는 이유를 밝히고, 차단하지 않는 지적은 `nit:` 접두어를
  붙입니다.
- 작성자는 재리뷰를 요청하기 전에 모든 리뷰 스레드에 답합니다.
- 열려 있는 "Request changes"를 무시하고 머지하지 않으며, 의견 불일치는 2.1.3에
  따라 상향 조정합니다.
- 이 저장소에서의 행동은 저장소 [행동 강령](../CODE_OF_CONDUCT.md)(Contributor
  Covenant 2.1)을 따르며, 이 문서는 그것을 반복하지 않습니다.

## 3. 이 문서의 개정

`GOVERNANCE.md` / `GOVERNANCE.ko.md`의 변경은 PR로 진행하고, `governance` 라벨
Issue로 공지하며, 영업일 5일의 Lazy Consensus로 수락되고, 모든 Maintainer가
승인합니다. 두 언어 파일은 같은 PR에서 함께 변경하며, 명단이나 모듈 표가 바뀔
때마다 `.github/CODEOWNERS`를 갱신합니다.
