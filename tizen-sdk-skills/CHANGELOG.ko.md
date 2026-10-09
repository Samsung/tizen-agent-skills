# 변경 이력

[English](CHANGELOG.md) | 한국어

**tizen-sdk-skills**의 주요 변경 사항을 이 문서에 기록합니다. 형식은
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 따르며, 프로젝트는
[Semantic Versioning](https://semver.org/)을 사용합니다.

릴리스는 [tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills) 저장소에
`tizen-sdk-skills-vX.Y.Z` 태그로 게시됩니다.

## [Unreleased]

- **PowerShell `Sort-Object` `$_` 전개 방어** — `powershell -Command "…"`로 감싸면 바깥 PowerShell이
  `$_`를 빈 문자열로 전개해 버전 정렬이 무효화되는 문제를 수정했습니다
  (`scripts/rewrite-runner-snippets.js`, Windows 조회 블록이 있는 모든 `common/skills/*/SKILL.md`,
  `common/agents/tizen-{dotnet-debug,webapp-debug,playwright-test}.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`, `common/hooks/tizen-sdk-skills-guard.md`).
  `Sort-Object { [version]$_.Directory.Parent.Parent.Name }`에 `, FullName` 보조 정렬 키를 추가하여,
  `$_`가 정상 작동할 때는 1차 버전 정렬로 정확한 최신 버전을 반환하고, `$_`가 전개되어 1차 키가
  무효화되면 2차 `FullName` 문자열 정렬이 같은 자릿수 버전(예: 1.4.x)에서 올바른 결과를 반환합니다.

## [1.4.2] — 2026-10-07

`tizen-dlog-analyzer`에 `search` 액션이 추가됐습니다 — 수집된 모든 dlog 카테고리(각 앱, `_general`,
`_unparsed`; 커널 제외)에서 일반 텍스트나 Python 정규식을 한 번에 검색합니다. "`connection refused`를
어느 앱이 남겼지?"가 필요한 에이전트가 더 이상 규칙이 금지하는 `.hot.log` 직접 `grep`에 의존하지 않아도
됩니다. 번들 바이너리는 이미 v0.2.7a0였으며, JS 러너, tizen-cli 스펙, 양쪽 SKILL.md 모두 바이너리의
`search` 서브커맨드를 완전한 매개변수 검증과 빠진 카테고리를 모두 나열하는 `no_logs` 게이트와 함께
노출합니다. 공통 argv 파서에 `repeatableFlags`가 추가돼 `--pattern`, `--category` / `--app-id`, `--tag`가
배열로 수집됩니다. CLI 러너 조회 블록에 대한 **(skills)** 수정 세 건이 추가로 들어갑니다:
`rewrite-runner-snippets.js`가 섹션 경계를 명시적으로 파싱하고, Bash와 PowerShell 블록을 먼저 cmd.exe
블록을 마지막에 두며, `tizen-screenshot`의 "do not wrap" 안내문이 셸 선택 줄에 흡수됐습니다.

### Added

- **`tizen-dlog-analyzer search` — 수집된 모든 dlog 카테고리에서 텍스트/정규식 검색** (이슈 #254;
  `common/lib/core/dlog-analyzer.js`, `common/lib/cli/dlog-analyzer-cli.js`, `common/lib/core/sdk-commands.js`,
  `tizen-cli/src/command-specs/dlog-analyzer.ts`, `common/skills/tizen-dlog-analyzer/SKILL.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`, `common/agents/tizen-dlog-analyzer.md`,
  `common/lib/tests/dlog-analyzer.test.js`, 가드 규칙 텍스트와 dlog-analyzer 문서). TizenDLogAnalyzer v0.2.6에
  추가된 `search` 서브커맨드는 수집된 모든 카테고리 — 각 앱, `_general`, `_unparsed` (커널 제외) — 에서
  일반 텍스트나 Python 정규식을 한 번에 찾습니다. 어느 앱이 남겼는지 몰라도 되고, 원본 라인 전체와 스택
  트레이스 연속 라인까지 매칭하므로 엔트리 전체가 돌아옵니다. 번들 바이너리는 이미 v0.2.7a0였지만 JS 러너,
  tizen-cli 스펙, 스킬 텍스트 어디에도 노출되지 않아, "`connection refused`를 어느 앱이 남겼지?"가 필요한
  에이전트에게는 `app-log`(앱 하나, 전체 로그)나 규칙이 금지하는 `.hot.log` 직접 `grep`밖에 없었습니다. 이제
  러너에 `search` 액션이 있습니다: 패턴은 위치 인자(`search "connection refused"`, 여러 개면 하나라도 일치,
  `--all`이면 모두 일치)이고 `--`로 시작하는 패턴은 `--pattern`(반복 가능)으로; `--category <app-id|_general|_unparsed>`
  (`--app-id` 별칭, 반복 또는 쉼표 구분)로 범위를 좁히고; `--regex`, `--case-sensitive`, `--invert`, `--context` / `--after-context` /
  `--before-context`(엔트리 단위), `--since` / `--until`, `--priority`, `--tag`, `--count`, `--format text|json`,
  `--output`, `--max-matches`(기본 100), `--max-lines` / `--max-chars`가 바이너리로 전달됩니다 — 모든 패턴은
  `--pattern`을 통해 넘기므로 `-1 returned` 같은 값이 옵션으로 해석되지 않고, 값은 실행 전에 검증합니다
  (패턴/태그/시각/경로의 제어 문자, 공백이 든 태그, `V D I W E F` 밖의 우선순위, 정수가 아닌 제한값 →
  `invalid_parameters`). 엔벨로프는 다른 로그 리더처럼 SDK 경로를 먼저 검사하고(`sdk_path_not_set`), 수집된
  로그가 없으면 바이너리의 exit 1 대신 **빠진 카테고리 전부**(`errors[0].missing_categories`) 또는 빠진
  `app/` 디렉터리를 명시한 `no_logs`를 돌려주며, JSON / `--count` 출력에서 `total_matches` / `returned` / `truncated`를
  꺼내 담아 에이전트가 엔벨로프만 보고도 패턴을 좁혀야 할지 알 수 있게 합니다. 일치 없음도 `success`이며
  `No entry matches …` 메시지가 붙습니다. tizen-cli에는 `--action search --pattern <text...>`(가변 인자)와 같은
  스위치가 추가되었습니다. 두 SKILL.md와 에이전트는 언제 쓰는지를 설명합니다 — 분석 순서(규칙 12)에서
  `error-analyze … details`와 필터를 건 `app-log` 사이의 표적 단계, "로그에서 X 찾아줘" / "어느 앱이 X를
  남겼지"의 답, 첫 분석 호출은 아니며, 수집 파일을 `grep`하지 않음(규칙 2) — 그리고 단위 테스트는 argv 빌더,
  파라미터 검증, 출력 요약, `sdk_path_not_set` 게이트, 실제 CLI를 통한 `no_logs` 목록, 두 하네스 간 드리프트
  가드를 다룹니다. 공용 argv 파서(`common/lib/cli/cli-runner.js`의 `parseArgs`)에 선택적 `repeatableFlags`
  목록이 추가되어 러너가 `--flag a --flag b`를 마지막 값만 남기는 대신 배열로 모을 수 있습니다 —
  dlog-analyzer는 `--pattern`, `--category` / `--app-id`, `--tag`에 사용합니다(`app-log`의 `--tag`는 반복
  가능하다고 문서화되어 있었지만 마지막 값만 남았습니다); 다른 러너는 변경 없습니다. common 스킬 버전은
  1.4.0으로 올렸습니다.
- **`tizen-install-app`가 설치 + 실행 성공 후 다음 단계로 `tizen-dlog-analyzer`를 제시**
  (`common/skills/tizen-install-app/SKILL.md`, `common/agents/tizen-install-app.md`,
  `tizen-cli/skills/tizen-install-app/SKILL.md`). "Suggested next steps" 목록에는 Playwright(웹앱), 재실행,
  디버거만 있어서, 네이티브 BasicUI 앱을 에뮬레이터에 설치·실행한 뒤 모델의 요약이 "이제 앱이 뭘 하는지
  지켜보자"로 이어질 곳이 없었습니다. 이제 목록은 모든 실행형 패키지에 대한 로그 수집·분석으로 시작합니다:
  앱이 이미 실행 중이면(`app_running: true`) `dlog-collect <result.app_id>`로 수집을 시작하고, 사용자가
  앱을 조작한 뒤 `stop-collect` → `error-analyze <app-id> summary`로 분석하거나, 시작 단계까지 잡으려면
  `start start-monitoring`을 먼저 띄우고 다시 실행한 뒤 `stop` → `check`로 분석합니다 — dlog-analyzer
  스킬에 이미 있던 "테스트 직전 앱 모니터링" 워크플로를 설치 쪽에서 진입하는 것입니다. 두 경로는 택일로
  제시하고(dlog 수집기는 한 번에 하나), 수집기를 시작한 뒤에는 턴을 끝내며(그 스킬의 Rule 3), 앱 ID는 설치
  Envelope의 `result.app_id`를 쓰되 `null`이면 사용자에게 확인하고, tizen-cli 사본은 자체
  `--action … --app-id … --format …` 문법을 쓰며, 한국어 예시 프롬프트를 포함했고, `sdb dlog`를 직접 치지
  않습니다.

### Fixed

- **`tizen-manifest.xml` + `CMakeLists.txt` 조합을 더 이상 Platform(GBS) 프로젝트로 판별하지 않음**
  (`common/scripts/tizen-build-project/tizen-build-project.{sh,ps1}`,
  `common/skills/tizen-build-project/SKILL.md`, `tizen-cli/skills/tizen-build-project/SKILL.md`,
  `docs/platform-gbs-build{,.en}.md`, `docs/figma2dali/dali-template-build-e2e{,.en}.md`). GBS 지원
  커밋(2026-07-22)은 Platform 프로젝트를 `tizen-manifest.xml` + `CMakeLists.txt`로 감지했고, 실제
  마커인 `CMakeLists.txt` + `packaging/*.spec`을 추가한 후속 커밋(2026-07-28)이 Bash 스크립트의
  `has_project_config()` / `detect_project_type()`, PowerShell의 `Test-HasProjectConfig`, tizen-cli
  SKILL.md의 판별 표에 옛 규칙을 남겨 두었습니다 — `lib/core/project.js`의 `isPlatformProject()`는
  처음부터 `packaging/*.spec`만 확인했는데도요. 모든 Native 앱에 `tizen-manifest.xml`이 있으므로 이 표는
  "네이티브 = GBS"로 읽혔고, Cline 세션에서 모델이 BasicUI 프로젝트의 50초짜리 `tz build`를 기다리며
  `gbs` 명령이 전혀 실행되지 않았는데도 "네이티브 빌드는 GBS를 사용하므로 시간이 걸린다"고 사용자에게
  설명했습니다. 이제 세 구현 모두 `CMakeLists.txt` + `packaging/*.spec`만 Platform으로 보며,
  `tizen-manifest.xml` + `CMakeLists.txt`만 있는 디렉터리는 GBS로 보내는 대신 "Project configuration not
  found"로 거부합니다. 맞추는 김에 두 스크립트의 설정 검사에 `project_def.prop`(Tizen Studio 네이티브
  마커 — `detect_project_type()` / `Detect-ProjectType`은 이미 Native로 분류했지만 설정 검사는 받지
  않던 파일)을 추가했고, PowerShell `Test-HasProjectConfig`는 `Get-ChildItem *.csproj` 결과(없음,
  `FileInfo` 하나, 또는 배열)를 함수 값으로 흘려보내는 대신 명시적인 `[bool]`을 반환합니다. 두
  SKILL.md에는 GBS는 Platform 프로젝트에서만 쓰이고 느린 네이티브 빌드는 GBS가 아니라 `tz build`
  컴파일이라는 타입별 빌드 방식 안내를 추가했습니다.

### Changed

- **`tizen-dlog-analyzer`가 최종 분석 보고서를 항상 영어 → 한국어 순으로 두 번 내던 것을 사용자 언어로 한 번만
  렌더링** (#253과 그 후속: `common/lib/core/dlog-analyzer.js`의 `REPORT_FORMAT_HINT`,
  `common/skills/tizen-dlog-analyzer/{SKILL.md,REPORT_TEMPLATE.md}`, `common/agents/tizen-dlog-analyzer.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/{SKILL.md,REPORT_TEMPLATE.md}`, `docs/SKILLS_REFERENCE{,.en}.md`,
  `common/lib/tests/dlog-analyzer.test.js`). 보고서, "수집 중 — 지금 재현해 주세요" 안내, 마지막 다음 단계
  안내가 사용자가 한국어로 썼으면 한국어로, 그 외(제3의 언어 포함)에는 영어로 나갑니다. 일회성
  `log-dump` / `log-clear`는 여전히 보고서를 내지 않습니다. `REPORT_TEMPLATE.md`는 에이전트가 하나를 고를 수
  있도록 두 언어 블록을 모두 유지합니다(Test 5는 두 블록이 있는지, Test 18은 힌트가 두 제목을 모두 언급하는지
  계속 확인 — 힌트는 이제 "once … OR" 형태). 후속 PR은 1차에서 남은 것을 정리합니다: 템플릿의 "block B의
  한국어 라벨" 문구와 "영어 블록의 내용을 그대로 옮긴다" 지시(한국어 블록만 렌더링할 때는 옮길 영어 블록이
  없으므로, 이제 같은 구조로 바로 작성), 세 레인의 ```` ```markdown ```` 펜스 *안*에 들어 있던 스켈레톤
  주석(`## Analysis Report (English)            ← render this block when …`과 `---  (Korean block below — …)`
  — 그대로 베끼면 보고서에 출력될 수 있어 산문으로 소개하는 펜스 두 개로 분리), 그리고 리뷰어 두 명이
  이중 언어 보고서의 조건절로 읽은 anti-pattern 문구 "a bilingual report when the user wrote in one
  language"를 "a bilingual (English + Korean) report. Exactly one language block is rendered, never both."로 교체.
  라벨 매핑은 한국어 블록의 고정된 섹션·필드 이름으로 소개해, "한국어 블록을 바로 작성한다"와 "이 한국어
  라벨을 쓴다"가 모순으로 읽히지 않게 했습니다.
- **runner 조회 섹션이 Bash와 PowerShell로 시작하고, cmd.exe는 셸 선택 안내 줄 뒤 맨 마지막에 옴**
  (`scripts/rewrite-runner-snippets.js`, Windows 조회 블록이 있는 모든 `common/skills/*/SKILL.md`,
  `common/agents/tizen-{dotnet-debug,webapp-debug,playwright-test}.md`, `common/hooks/tizen-sdk-skills-guard.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`, `common/lib/tests/plugin-cache.test.js`). Cline PowerShell 터미널에서
  모델이 섹션의 **첫 번째** 블록 — cmd.exe 전용 `dir … 2>nul & dir …` 체인(`AmpersandNotAllowed`) — 을
  실행한 뒤 PowerShell 블록을 `powershell -Command "…"`로 감쌌습니다(바깥 셸이 `$h` / `$CLI` / `$env:…`를
  먼저 전개해 안쪽 셸에는 ` = '.cline'; if ( -or -or ) …`가 전달됨). 1.4.1의 제목이 이미 각 블록의 셸을
  명시하고 있었는데도 그랬습니다. 이제 모든 섹션은 프롬프트(`$` / `PS C:\…>` / `C:\…>`)로 셸을 구분하고
  그 블록 하나만 그대로 실행하라는 한 줄로 시작하며, 블록은 지원하는 호스트가 많은 순서로 이어집니다:
  Bash(Linux, macOS, Windows에서 Claude Code의 Git Bash, Linux/macOS의 Codex), PowerShell(Windows의
  Codex, Cline PowerShell 터미널), 그다음 cmd.exe와 그에 딸린 `node "<found-path>"` 단계 및 "Runner not
  found?" 안내. cmd.exe 제목은 이제 *위의* 블록을 가리킵니다. 재배치는 생성기가 수행하고(제목, 펜스 3종,
  선택 줄, 안내문을 섹션 단위로 파싱 — 그 외 문단이 나오면 섹션 종료; 손으로 쓴 Bash / cmd.exe 제목은
  정규화; PowerShell 블록이나 `node "<found-path>"` 단계가 없는 섹션은 생성해 채움) 고정점을 유지합니다
  (`--check` 통과). 섹션 경계 규칙을 명시했습니다(#247 리뷰): 제목은 바로 뒤 펜스와 함께 움직이고, 선택
  줄 / node 단계 / 안내문은 자기 cmd.exe 펜스 뒤에만 오며, 셸 선택 줄은 섹션 시작에만 오고, 다른 runner를
  가리키는 Bash / PowerShell 펜스는 다른 섹션에 속합니다 — 붙어 있는 두 섹션이 블록을 주고받는 일이 없습니다.
  제목 아래 여러 줄로 이어진 문단은 제목으로 보지 않고 그대로 보존하고, `*.js`를 지정하지 않은 cmd.exe
  펜스에 PowerShell 블록이 없으면 `\lib\cli\undefined` 조회를 만들어 넣는 대신 그대로 두며, 목록 항목 안의
  섹션은 생성 줄에 펜스의 들여쓰기를 유지합니다. `tizen-screenshot`의 별도 "do not wrap" 안내문은 셸 선택
  줄에 흡수했습니다. drift-guard
  TC는 cmd.exe 조회 앞에 셸 선택 줄, Bash 블록, PowerShell 블록이 그 순서로 없거나, Bash 조회 펜스가 다른
  제목 아래 있으면 실패합니다. 에이전트의 Cline 2단계 목록은 PowerShell 줄을 cmd 줄 앞에 두고, guard
  규칙(한국어 규칙 7, 영어 규칙 8)은 위치상 첫 블록이 아니라 셸로 고르라고 명시합니다.

## [1.4.1] — 2026-10-01

Windows의 Cline(PowerShell 터미널)이 CLI runner를 찾지 못했습니다. cmd.exe 조회 블록의 제목이
두 셸 모두를 대상으로 하고 있었고(`&`는 PowerShell의 예약어입니다), `node "$CLI"` 줄만 따로 붙여넣으면
오해를 부르는 `MODULE_NOT_FOUND`로 실패했습니다(Windows PowerShell 5.1이 빈 `"$CLI"` 인수를 버리기
때문에 node가 `Cannot find module '<cwd>\list-templates'`로 종료됨). 이제 skill 제목에 각 블록이 어떤
셸용인지 명시하고, 생성되는 `node` 줄이 빈 `$CLI`를 차단하며, guard 규칙(한국어 규칙 7 / 9, 영어 규칙
8 / 10)이 두 실패 유형을 모두 설명하고 인코딩 래퍼를 `$`가 없는 명령으로 제한합니다.

`dlog-analyzer` 수정 두 건도 포함됩니다. 살아 있는 collector lock 때문에 거부된 `start`가 더 이상
성공으로 보고되거나 lock 파일을 삭제하지 않으며(보유자를 명시한 `already_running`을 반환), runner가
처음 발견한 디렉터리 대신 자신과 함께 배포된 바이너리(없으면 캐시의 최신 버전)를 선택합니다. 또한
Windows cp949 코드 페이지 크래시로 중단된 보고서를 traceback만 반환하는 대신 그대로 보존합니다.

### 변경

- **dlog-analyzer 번들 바이너리를 v0.2.3a0에서 v0.2.5a0으로 올림**
  (`common/tools/tizen-dlog-analyzer/linux/tizen-dlog-analyzer`,
  `common/tools/tizen-dlog-analyzer/windows/tizen-dlog-analyzer.exe`,
  `common/tools/tizen-dlog-analyzer/macos/tizen-dlog-analyzer`,
  `common/tools/tizen-dlog-analyzer/NOTICE.md`). Linux, Windows, macOS용 플랫폼별 PyInstaller
  단일 파일 번들을 업데이트하고, 새 빌드에 맞춰 NOTICE.md의 파일 크기와 SHA-256 해시를 갱신했습니다.

### 수정

- **살아 있는 collector lock 때문에 거부된 dlog-analyzer `start`가 성공으로 보고된 뒤 lock 파일을 삭제함**
  (`common/lib/core/dlog-analyzer.js`, `common/lib/tests/dlog-analyzer.test.js`, `common/agents/tizen-dlog-analyzer.md`,
  `common/skills/tizen-dlog-analyzer/SKILL.md`, `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`). 네이티브
  바이너리의 collector lock에 의해 거부된 `start`가 `success`로 돌아왔습니다. 고정된 2초 시점의 확인에서는
  바이너리가 아직 살아 있다가 잠시 후 종료되었기 때문에, 에이전트는 `stop` 시 죽은 PID를 보고
  `_meta/collector.lock`을 삭제하려 했습니다. 그런데 이 lock은 이전 세션의 살아 있는 collector(PID 파일보다
  오래 살아남은 것)가 같은 dlog 스트림에서 열어 두고 있던 것이었습니다. 이제 runner는 3초 구간 동안
  collector를 폴링하다가 종료되거나 거부 메시지를 출력하는 즉시 반환합니다. 거부된 경우 lock 파일에서 읽은
  보유자 PID와 이를 중지하는 명령(`stop`, `stop-collect`, 또는 추적되지 않는 PID 종료)과 함께
  `already_running`을 반환합니다. `dlog-collect` 실행 중에는 `start`를 시작 전에 미리 거부합니다. runner는 lock
  파일을 절대 건드리지 않습니다. 리뷰 후속 조치: 실제 보유자가 종료된 뒤 `collector.lock`에서 읽은 PID가
  무관한 프로세스에 재사용되었을 수 있으므로, runner는 이제 실행 파일 이름(`tasklist` / `ps`)을 읽어
  `tizen-dlog-analyzer`로 확인된 경우에만 "PID 종료"를 안내합니다. 재사용된 PID는 stale lock("종료하지
  말 것")으로, 이름을 읽을 수 없으면 "종료 전 확인"으로 보고합니다. `awaitCollectorStartup`은 PID에
  시그널을 보내는 대신(재사용된 번호가 이를 속일 수 있음) 자식 프로세스의 종료 상태로 새 collector를
  판단합니다. 거부 정규식은 바이너리가 직접 출력하는 두 줄에만 맞도록 고정해, 모니터 캡처에 복사된 디바이스
  로그 줄이 lock을 언급하더라도 매칭되지 않습니다.
- **dlog-analyzer가 잘못된 바이너리 버전을 실행하고 Windows cp949 크래시 시 보고서를 잃어버림**
  (`common/lib/core/dlog-analyzer.js`, `common/lib/core/plugin-cache.js`, `common/lib/tests/dlog-analyzer.test.js`,
  `common/agents/tizen-dlog-analyzer.md`, `common/skills/tizen-dlog-analyzer/SKILL.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`, `common/tools/tizen-dlog-analyzer/`). `resolveBinary()`가
  플러그인 캐시를 디렉터리 순서대로 탐색해 처음 찾은 바이너리를 반환했기 때문에, 1.1.1 … 1.4.0을 보유한
  캐시에서는 `investigate`가 없는 1.1.1의 바이너리가 실행되었습니다("No such command"). 이제 runner 자체의
  `tools/`를 가장 먼저 확인하고(설치된 플러그인은 항상 함께 배포된 바이너리를 실행), 캐시는 숫자로 비교한
  최신 버전부터 탐색합니다. 네이티브 바이너리는 frozen Python이라 Windows에서 runner로 파이프되면 시스템
  ANSI 코드 페이지(cp949)로 출력하며, investigate 보고서의 마무리 메모에 있는 em dash에서
  `UnicodeEncodeError`로 종료됩니다. 이는 보고서 전체가 이미 출력된 뒤의 일입니다. `chcp 65001`도
  `PYTHONUTF8` / `PYTHONIOENCODING`도 PyInstaller 바이너리에는 적용되지 않으므로(검증 완료), `runBinary()`와
  `error-analyze`는 traceback만 반환하는 대신 출력된 내용을 보존해, 코드 페이지를 명시하고 해당 재시도를
  배제하는 경고와 함께 성공으로 반환합니다. 리뷰 후속 조치: `resolveBinary()`는 자체 사본을 유지하는 대신
  `plugin-cache`에서 `VERSION_DIR_RE`(`findLatestVersionDir`가 적용하는 규칙)를 가져오며, `sort` + `reverse`
  대신 `compareVersions(b, a)`로 정렬합니다. `UnicodeEncodeError` 매처는 rich의 줄바꿈된 traceback(토큰이
  여러 줄로 나뉠 수 있음)과 Buffer stdout/stderr를 허용합니다. 복구된 결과에는 `output_truncated: true`가
  포함되어, 호출자가 경고 문구를 파싱하지 않고도 중단된 보고서와 완전한 보고서를 구분할 수 있습니다.
- **PowerShell `node "$CLI" …` 줄을 단독으로 실행하면 오해를 부르는 `MODULE_NOT_FOUND`로 실패함**
  (`scripts/rewrite-runner-snippets.js`, PowerShell 조회 블록이 있는 모든 `common/skills/*/SKILL.md`,
  `common/hooks/tizen-sdk-skills-guard.md`, `cline/hooks/tizen-sdk-skills-guard.md`,
  `common/lib/tests/plugin-cache.test.js`). `$CLI`가 설정되지 않은 상태에서(두 조회 줄 없이 세 번째 줄만
  붙여넣었거나 새 세션인 경우) Windows PowerShell 5.1이 빈 `"$CLI"` 인수를 버리므로,
  `node "$CLI" list-templates --type native`가 `node list-templates --type native`가 되어 node가 실제 원인과
  무관한 `Cannot find module '<cwd>\list-templates'`로 종료되었습니다. 이제 생성되는 줄은 `node`와
  같은 줄에서 `if (-not $CLI) { throw '… $CLI is empty. Run the two lookup lines above in THIS PowerShell
  session first …' }; `로 시작하므로 그 줄만 붙여넣어도 guard가 작동합니다. 블록 제목은 세 줄을 같은 세션에서
  순서대로 실행하라고 안내하고, 생성기는 기존 블록에 guard를 추가하고 기존 블록을 재생성하며(`--check`는
  계속 통과), drift-guard TC는 조회 뒤에 맨 `node "$CLI"`가 오면 실패하고, guard 규칙(한국어 규칙 7, 영어
  규칙 8)은 증상을 설명합니다. 리뷰 후속 조치: 세 개의 fenced cmd.exe 조회(`tizen-webapp-debug`,
  `tizen-playwright-test`: "Cline on Windows ONLY (… cmd.exe / PowerShell …)"; `tizen-create-project`
  2단계: "Windows:")가 생성기가 알지 못하는 제목 아래에 있어 `&` 체인 위에 여전히
  "cmd.exe / PowerShell"이라고 표시되었습니다. 이제 생성기는 이 두 형식도 다시 쓰며, drift-guard TC는 모든
  fenced cmd.exe 조회 / PowerShell 블록이 생성된 제목 아래에 있어야 통과합니다.
- **Windows의 Cline(PowerShell 터미널)이 CLI runner를 찾지 못함** (`scripts/rewrite-runner-snippets.js`,
  Windows 조회가 있는 모든 `common/skills/*/SKILL.md`, `common/agents/tizen-{dotnet-debug,webapp-debug,playwright-test}.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`, `common/hooks/tizen-sdk-skills-guard.md`, `docs/debug/` 아래의
  디버그 안내 문서). cmd.exe 조회 블록의 제목이 "Windows — Cline (cmd.exe / PowerShell)"이었기 때문에,
  PowerShell 터미널에서 모델이 `dir … 2>nul & dir …` 체인을 그대로 실행했고(`&`는 PowerShell의
  예약어 — `AmpersandNotAllowed`), 이어서 PowerShell 블록을 `powershell -Command "…"`로 감쌌습니다. 그 결과
  바깥 셸이 `$h`, `$CLI`, `$d`, `$env:USERPROFILE`, `$_`를 먼저 확장해 안쪽 셸에
  ` = ; foreach ( in @(…`를 넘겼습니다("foreach 뒤에 변수 이름이 없습니다"). 모델이 복사한 패턴은 guard
  규칙 9의 인코딩 래퍼였습니다. 이제 제목은 cmd 체인이 cmd.exe 전용이며 PowerShell 줄은 터미널에서 그대로
  실행하고 절대 `powershell -Command "…"` 안에서 실행하지 않는다고 명시합니다. 생성기는 기존 제목을 제자리에서
  다시 쓰며(`--check`는 계속 통과), guard 규칙(한국어 규칙 7 / 9, 영어 규칙 8 / 10)은 같은 두 실패 유형을
  설명하고, 모델이 runner 파일 이름을 추측하지 말고 skill이 제공하는 이름을 사용하도록 하며, 인코딩 래퍼를
  `$`가 없는 명령으로 제한합니다.

## [1.4.0] — 2026-09-30

`dotnet-setup`은 .NET SDK를 설치 위치 기준으로 선택하고 `--dotnet-root` / `--persist-env`를 지원합니다.
`dotnet-debug --project`는 동작하는 `.vscode/launch.json` + `tasks.json`을 작성합니다. `sdk-install`은
UTC+9 호스트를 `download.tizen.org`로 보냅니다. `dlog-analyzer`는 analyzer의 v0.1.3+ 하위 명령
(`investigate`, `probe`, `snapshot`, `timeline`, `kernel`, `app-log`, `device-profile`)과 Linux, Windows,
macOS용 0.2.1a0 바이너리를 갖추었으며, 증상 보고("CPU at 300 %, video does not play")가 이제 이 skill로
전달되어 증거 수집 흐름을 따릅니다(skill 본문, hook 규칙 17–19, prompt TC). 보안 수정 네 건(설치 프로그램
버전 검사, 인증서 비밀번호 마스킹, loopback 전용 OAuth 콜백, hook-adapter 경로 추출), 내부 전용 기능을 공개
트리에서 제외하는 게시 도구 체인, Cline에서 안전한 설치 폴링, 그리고 `sdb-helper`, `file-transfer`,
`install-rootstrap`, `download-mobile-platform`, `download-emulator-package`, `create-project` 및 Windows
설치 프로그램 경로 처리 전반의 수정이 포함됩니다. 테스트 스위트: 283개 파일에 290개 TC(승인 282개, 초안
8개). mutating tier의 설치 프로그램 단계는 일회용 홈 디렉터리에서 실행됩니다.

### 추가

- **`dotnet-setup --dotnet-root <dir>` 및 `--persist-env`** (`tizen-dotnet-setup.ps1` `-DotnetRoot` /
  `-PersistEnv`, `.sh`, `dotnet-setup-cli.js`, `tizen-cli tizen-sdk dotnet-setup`). `--dotnet-root`는 SDK를
  탐색하는 대신 사용할 .NET SDK(`dotnet`과 `sdk/`가 있는 디렉터리)를 고정합니다. runner는 dotnet 바이너리가
  없는 루트를 스크립트 실행 전에 `invalid_parameters`로 거부합니다. `--persist-env`는 Tizen 확장에 번들된
  dotnet을 변경 항목에 설명된 영구 설정에 포함하도록 선택합니다.
  성공 envelope에는 `result.dotnet_candidates`(발견된 모든 SDK: 계층, 버전, Tizen workload 기록 여부, 실제
  사용된 SDK), `result.env_dotnet_root`, `result.dangling_dotnet_root`, `result.persisted_env`(이번 실행에서
  기록한 내용, 없으면 `null`)가 추가됩니다.
- **`TIZEN_SDK_INLINE_INSTALLER=1`** (`runsInstallerInline()` in `common/lib/core/sdk.js`): 아홉 개의
  설치 프로그램 분기(`sdk-install`, `sdk-install-custom-repo`, `tv-sdk-install`, `tv-sdk-install-from-zip`,
  `update-package`, `platform-install`, `download-emulator-package`, `download-mobile-platform`,
  `install-rootstrap`)는 pkg로 컴파일된 tizen-cli 안에서만 인라인으로 실행되고, 그 외 환경에서는 설치
  프로그램을 `suggested_fix`로 돌려주었습니다. 이 환경 변수 토글을 사용하면 `node tizen-sdk.js`에서도
  인라인으로 실행됩니다. 기본 동작은 변경되지 않았습니다(`common/lib/tests/inline-installer.test.js`).
- **통합 스위트: 설치 프로그램 단계** `tests/policy/mutating-run-order.yaml`의 `s2-sdk-installers` /
  `s3-dotnet-workload`로, `scripts/run-mutating-tier.mjs --with-installers`로 실행합니다(기본적으로
  건너뜀). s2는 일회용 홈 디렉터리(`USERPROFILE`/`HOME` 리디렉션, `TIZEN_SDK_PATH` 제거)에 완전한 SDK를
  설치하고, `tizen-sdk-install.ps1`이 다시 쓰는 Windows User `Path` / `TIZEN_SDK_PATH`를 스냅샷으로 저장한
  뒤 복원합니다(runner보다 오래 살아남은 설치 프로그램 PowerShell을 중지한 다음의 첫 번째 teardown 단계이며,
  `$null`이면 변수가 삭제되므로 둘 중 하나라도 키가 빠진 스냅샷은 거부합니다. `--restore-user-env=<file>`은
  강제 종료된 실행 이후 복원을 다시 수행합니다). `LongPathsEnabled=1`(없으면 설치 프로그램이 UAC 프롬프트에서
  멈춤) 또는 15 GB의 여유 공간이 없으면 시작을 거부하고, Ctrl+C 시 runner의 전체 프로세스 트리를 종료하며,
  이후 스크래치 SDK를 삭제합니다(`--keep-scratch-sdk`). 단, 자신이 기록한 소유권 마커가 있는 정확히
  `<scratch>/home`인 경우에만 삭제합니다(`scratchHomeRemovable()`, `tests/scripts/runner-helpers.test.mjs`에서
  단위 테스트). `prepare-device-fixtures.mjs --only=rootstrap`은
  `install-rootstrap.happy`용 `${FIXTURE_ROOTSTRAP_ZIP}` fixture를 빌드합니다.
  `build-project.compiler-flags`는 이제 존재하지 않는 플래그 전달 기능을 있는 척하는 대신, 지원되지 않는
  `--cflags`가 `invalid_argument`로 거부되는지 검증합니다. 첫 승격 실행: 남은 초안 22개 중 15개 승인
  (286개 중 264 → 279). 미러가 더 이상 MOBILE-7.5를 제공하지 않아 `download-mobile-platform.*`을 7.5에서
  7.0으로 옮겼습니다. 남은 7개는 Samsung 계정, Linux GBS 호스트 또는 LAN 디바이스가 필요합니다.

- **내부 전용 콘텐츠를 공개 트리에서 제외할 수 있음** (`scripts/publication/`).
  Samsung 내부 서비스에 의존하는 기능은 이제 세 가지 메커니즘 뒤에 위치하므로, 게시 런북
  (`_repo-root/UPLOAD.md`)이 수작업 편집 없이 이를 제외할 수 있습니다. 첫째, 해당 파일은
  `internal-only-paths.txt`에 나열되고 로더는 파일이 없어도 동작합니다(`sdk-commands.js internalCommands()`,
  새 `error-codes.internal.js`를 병합하는 `envelope.js loadInternalErrorCodes()`, 그리고
  `command-specs/internal/`을 `require()`로 로드하는 `tizen-cli/src/command-specs/internal-specs.ts` —
  esbuild `internal-only` 플러그인은 없는 디렉터리를, `TIZEN_PUBLIC_BUILD=1`에서는 모든 디렉터리를
  external로 표시합니다). 둘째, 게시되는 파일에서 이 기능들을 설명하는 문장은 `internal-only:begin` /
  `internal-only:end` 마커 사이에 둡니다. 셋째, `internal-only.js --check`(CI)는 나열된 경로가 없거나,
  fence의 짝이 맞지 않거나, fence 밖에 내부 용어가 나타나면 실패합니다. `assemble-public-tree.js <dest>`는
  해당 경로를 제외하고 트리를 복사하며, `tizen-cli/plugin.json`에서 해당 명령 이름을 제거하고, fence를
  제거하며, 용어가 하나라도 남아 있으면 완료를 거부합니다. `internal-only-gating.test.js`는 내부 모듈을
  `require()`에서 숨겨 공개 트리를 시뮬레이션합니다.
- **`dotnet-debug --project <dir>`가 `.vscode/launch.json`과 `tasks.json`을 작성함**
  (`common/lib/core/debug.js`, `tizen-cli/src/command-specs/debug.ts`). 이전에는 launch 모드가
  `<APP_FOLDER_NAME>`이 들어간 템플릿을 돌려주고 `launch.json`을 사용자나 에이전트에게 맡겼는데, 이 과정에서
  잘못된 디버그 type과 하드코딩된 TargetFramework가 끼어들었습니다. `--project`를 지정하면 runner가
  `.csproj`에서 `TargetFramework` / `TargetFrameworks`(`;` 목록 중 Tizen TFM, `Condition` 같은 속성 허용)와
  `AssemblyName`을 읽고, 다른 항목은 건드리지 않은 채 `Tizen .NET (netcoredbg)` coreclr 구성을 작성하거나
  병합하며, `launch_config.launch_json_path` / `launch_json_action`을 보고합니다.
  VS Code가 terminate/disconnect를 보내면 netcoredbg가 앱과 자기 자신을 종료하는 반면 호스트의 sdb
  forward는 계속 연결을 받아들이기 때문에 두 번째 F5가 "시작"된 뒤 곧바로 종료되었습니다. 이를 위해
  runner는 `tizen: netcoredbg launch` 작업(이 runner, 동일한 앱/포트/시리얼,
  `--project ${workspaceFolder}`)도 작성해 구성의 `preLaunchTask`로 연결하므로, stop → F5 시 앱이 먼저 다시
  실행됩니다. 두 파일은 어느 쪽이든 쓰기 전에 함께 계획됩니다(엄격한 JSON이 아닌 `launch.json`이면
  `tasks.json`도 건너뛰고, 엄격한 JSON이 아닌 `tasks.json`이면 끊어진 참조를 남기는 대신 `preLaunchTask`를
  제외합니다). 항목은 구조적으로 비교되므로 사용자의 파일이 재포맷되지 않으며, 들여쓰기와 마지막 줄바꿈
  스타일도 유지됩니다. 설정 스크립트, 에이전트, skill, walkthrough는 이제 디버거 서버가 유지된다고 주장하는
  대신 실제 stop → 재실행 동작을 설명합니다.
- **`sdk-install`이 UTC+9 호스트(한국, 일본)를 `download.tizen.org`로 연결함**
  (`Select-CdnRepo` / `select_cdn_repo` in `tizen-sdk-install.ps1` / `.sh`). 이전에는 UTC+5 이상인 모든
  오프셋이 `singapore` CloudFront 미러로 갔지만, 공식 호스트는 AWS 서울의 단일 origin이며 한국에서 측정한
  속도가 더 빨랐습니다(16 MB 기준 0.20–0.23초 대 0.25–0.49초). 정확히 `+09:00`인 경우(원본 오프셋으로
  확인하므로 `+08:30` / `+09:30`은 여전히 singapore 범위로 반올림됨) 이제
  `https://download.tizen.org/sdk/tizenstudio/official`을 반환합니다. 두 설치 프로그램은 30분 단위
  시간대를 동일하게 반올림합니다(bash는 버림, PowerShell은 banker's rounding을 사용했으나 이제 둘 다 크기를
  0에서 먼 쪽으로 반올림). `tests/scripts/cdn-mirror-selection.test.mjs`(`tests/`의 `npm run lint`에
  포함)는 두 함수를 추출해 23개의 `date +%z` 오프셋을 주입하고, 각각을 문서화된 표와 대조하며 두 셸의
  결과가 일치하는지 검증합니다. 기존 설치는 `repository.info`에 기록된 미러를 그대로 유지합니다.
  `tizen-sdk-install` skill과 TV SDK / 설치 문서의 미러 표를 업데이트했습니다.
- **`dlog-analyzer`: analyzer의 v0.1.3+ 하위 명령 및 세 플랫폼용 0.2.1a0 바이너리**
  (`common/lib/core/dlog-analyzer.js`, `common/tools/tizen-dlog-analyzer/`). runner, skill, 에이전트가
  `app-log`(앱 범위 로그 조회), `device-profile`, `investigate --symptoms`(일회성 증상 probe),
  `probe list|run`, `snapshot create|compare|delete`, `timeline`, `kernel collect|stop|analyze`를 문서화하고
  검증합니다. `snapshot compare` / `delete`는 SDK 설정 사전 확인보다 먼저 id를 검증하므로, id가 없으면
  `sdk_path_not_set`이 아닌 `invalid_parameters`가 됩니다. 번들 바이너리는 Linux와 Windows용이
  v0.1.3.dev0에서 **v0.2.1a0**으로 올라가고 **macOS (x86_64)** 빌드가 추가되었습니다.
  `common/tools/tizen-dlog-analyzer/NOTICE.md`의 플랫폼별 크기와 SHA-256 해시를 갱신하고 macOS `shasum`
  검증 명령을 추가했습니다.
- **`sdb-helper`가 점 없는 패키지 id, 어순과 무관한 "list installed packages", `emulator-restart` 의도를
  지원함** (`common/lib/core/sdb-helper.js`). `package info dZEpxl2iAg`(`pkgcmd -l`이 TPK/WGT에 대해
  출력하는 점 없는 pkgid)는 점이 있는 app id만 매칭되었기 때문에 "Could not find a package ID"로
  거부되었습니다. 이제 `extractPackageId()`는 점이 있는 id를 우선하고, 없으면 의도 키워드 뒤의 토큰이
  pkgid처럼 보일 때(숫자, 대소문자 혼합 또는 `-`/`_` 포함; SDK pkgid는 대소문자가 섞인 영숫자 10자) 이를
  사용하며, 군더더기 단어, 소문자만으로 된 일반 단어, `emulator-<port>`, 12자 이상의 16진수 시리얼, 전달된
  시리얼은 거부합니다. 따라서 검증되지 않은 값이 `pkgcmd -u -n` / `pkginfo --pkg`에 전달되지 않습니다.
  `list installed packages` / `applications` / "which packages are installed"는 모두 `list-packages`에
  매칭됩니다. "Reboot/restart the emulator"는 새로운 `emulator-restart` 의도로, `tizen-device-manager`(VM
  중지) + `tizen-launch-emulator`(콜드 스타트)로 넘깁니다. Windows 에뮬레이터에서 게스트
  `sdb shell reboot`를 하면 WHPX vCPU가 리셋되면서 QEMU 프로세스가 종료되어(`WHPX: Unexpected VP exit
  code 4`) 창이 닫히고 sdb가 더 이상 디바이스를 인식하지 못하기 때문입니다. 확인 절차가 걸린 `reboot` /
  `shutdown`의 대상 시리얼이 `emulator-<port>`이면 `result.note`에 같은 경고가 포함되며, 하드웨어 시리얼에는
  경고가 붙지 않습니다. skill과 에이전트의 의도 표를 업데이트했습니다(`common/lib/tests/sdb-helper.test.js`
  Tests 7b, 7b-2, 7c).
- **`file-transfer`가 Git Bash의 MSYS 계층이 다시 쓴 원격 경로를 복원함**
  (`normalizeRemotePath()` in `common/lib/core/file-transfer.js`). Windows의 Claude Code에서 Bash 도구는
  Git Bash이며, MSYS는 `/`로 시작하는 인수를 node가 보기 전에 Git 설치 루트 아래 경로로 바꿉니다.
  `/opt/usr/apps/x`가 `C:/Program Files/Git/opt/usr/apps/x`로 전달되어 sdb가 사용자가 입력한 적 없는
  경로로 실패했습니다(에이전트의 우회 방법은 `//opt/...`였습니다). 원격 경로 자리에 Windows 드라이브 경로가
  들어 있으면 runner는 MSYS 루트를 제거합니다. 이 루트는 `EXEPATH`에서 도출하며(`bin` / `usr\bin` /
  `mingw64\bin` 접미사 제거; 드라이브만 있는 경우는 루트로 인정하지 않음), 잘 알려진 Git / msys64 / cygwin
  루트로 대체합니다. 그런 다음 디바이스 경로를 복원하고 `warnings`에 그 사실을 알립니다. `//opt/...`와
  `///opt/...`는 `/opt/...`로 정규화되며, 실제 Windows 경로는 `EXEPATH`를 명시한 `invalid_parameters`로
  거부됩니다. 로컬 경로는 건드리지 않으며(MSYS가 `/c/Users/me/out`을 변환하는 것이 바로 호스트 측
  `sdb pull`에 필요한 동작), `MSYS_NO_PATHCONV=1`은 `/c/.../file-transfer-cli.js` runner 경로의 변환까지
  막기 때문에 의도적으로 권장하지 않습니다. skill과 에이전트는 이제 디바이스 경로를 그대로 전달하라고
  안내합니다(`common/lib/tests/file-transfer.test.js`).
- **`install-rootstrap`이 Phase-1 사전 확인에서 `.rootstrap-installed`를 반영함**
  (`common/lib/core/sdk.js` `parseRootstrapMarker()`). 패키지된 CLI 밖에서는 runner가 설치 프로그램을
  실행할 수 없어 에이전트에게 설치 후 사전 확인을 다시 실행해 마커를 검증하라고 안내합니다. 그런데 pkg가
  아닌 분기는 마커를 전혀 확인하지 않아, 설치가 성공한 직후에도 항상 "Rootstrap is NOT installed"와 새
  `suggested_fix`를 반환했습니다. 이제 `<sdk>/.rootstrap-installed`를 SDK 확인 직후에 읽으며(PowerShell이
  BOM과 CRLF를 모두 쓰므로 둘 다 허용; 항목 줄은 설치 스크립트가 `DisplayName`을 만들 때 쓰는 것과 같은
  정규식으로 분리), `--force`가 없으면 이를 바탕으로 만든 성공 envelope(설치된 rootstrap + 구조 유형)를
  반환합니다. `--force`가 지정되고 마커가 있으면 "NOT installed" 대신 "already installed … but --force was
  given, so it will be reinstalled"라고 안내합니다(`common/lib/tests/install-rootstrap-precheck.test.js`).
- **`download-mobile-platform --include-iot-headed`가 `extension_info.xml`을 공식 저장소에서 대체로
  가져옴** (`tizen-download-mobile-platform.ps1` / `.sh`). 커스텀 저장소(`--repo-url`, 예: 내부 미러)에서
  설치한 SDK는 `repository.info`가 해당 미러를 가리키는데, 이 미러는 `pkg_list`와 바이너리는 제공하지만
  보통 확장 카탈로그는 제공하지 않습니다. 그래서 IOT-Headed 단계가 404에서 포기하고 확장이 설치되지
  않았습니다. 이제 두 스크립트는 설정된 저장소(끝의 슬래시를 제거하고 CR을 허용하여 비교)가 실패하고 그것이
  공식 저장소가 아닐 때 `https://download.tizen.org/sdk/tizenstudio/official`에서 카탈로그를 다시 시도합니다.
  그곳에서 가져오는 것은 카탈로그뿐이며, IoT 패키지는 여전히 카탈로그가 지정한 저장소에서 받습니다. 결과는
  두 셸 모두에서 하나의 3상태 플래그로 추적되고, 재시도 전에 부분 파일을 삭제하며, 메시지(URL을 명시한
  시도별 오류, "IOT-Headed extension will NOT be installed" 경고 1개)도 동일합니다. `repository.info`가
  내부 미러를 가리키는 호스트에서 end-to-end로 검증했습니다(IOT-Headed-7.0, 7개 패키지).

### 변경

- **`dotnet-setup`이 .NET SDK를 설치 위치 기준으로 선택하고, Tizen 확장에 번들된 dotnet을 기본적으로 더 이상
  영구 등록하지 않습니다** (`common/scripts/lib/common.ps1` `Get-DotnetCandidates`/`Select-DotnetCandidate`,
  `common.sh` `list_dotnet_candidates`/`select_dotnet_candidate`, `tizen-dotnet-setup.ps1/.sh`).
  기존 탐색은 "이미 Tizen 워크로드가 있음"을 1순위 규칙으로 사용했기 때문에, 워크로드를 포함한
  `~/.tizen-extension-platform/server/sdktools/dotnet` 번들 dotnet이 `C:\Program Files\dotnet`보다 항상
  우선했습니다. 그 결과 `Enable-Dotnet`/`persist_dotnet`이 그 경로를 사용자 `DOTNET_ROOT`/`PATH`(Windows)
  또는 `~/.bashrc`(Unix)에 기록했고, 확장이 업데이트되는 즉시 해당 경로가 무효화되었습니다. 이제 후보는
  PATH > `DOTNET_ROOT` > 공식 설치 루트(Program Files, `%LOCALAPPDATA%\Microsoft\dotnet`,
  `~/.dotnet`, `/usr/share/dotnet`, brew libexec, …) > 번들 순으로 순위를 매기며, 워크로드는 같은 등급 안에서만
  동점 처리 기준으로 사용합니다. 알려진 번들 위치는 직접 확인하고, 사용자 프로필 전체를 재귀 탐색하는 방식(큰
  프로필에서는 수십 초 소요)은 대체 경로로만 실행합니다. 워크로드 설치 여부는 후보마다 ~3초가 걸리는
  `dotnet workload list` 대신 dotnet 자체의 설치 기록(`metadata/workloads/<band>/InstalledWorkloads/tizen`)에서
  읽습니다. 공식 루트(및 `--dotnet-root`)는 여전히 영구적으로 설정하지만, 번들 dotnet은 현재 실행에만 사용하며
  두 가지 해결 방법(공식 SDK 설치 또는 `--persist-env`)을 안내하는 경고를 표시합니다. dotnet이 없는 디렉터리를
  가리키는 `DOTNET_ROOT`는 이를 지우는 명령과 함께 무효(stale)로 보고하고, 새 루트를 영구 등록할 때 사용자
  `PATH`에서 제거합니다. `persist_dotnet`은 이제 기존 `~/.bashrc` export 블록을 건너뛰지 않고 **교체**합니다 —
  건너뛰는 동작 때문에 무효한 `DOTNET_ROOT`가 재실행할 때마다 살아남았습니다. `tizen-build-project`의 "dotnet not on
  PATH" 힌트도 같은 순위를 사용합니다. 후속 수정 두 가지: 영구 등록된 루트는 항상 Windows 사용자 `PATH`의 **맨
  앞**으로 이동합니다(이전에는 없을 때만 앞에 추가했기 때문에 번들 dotnet 뒤에 있던 Program Files dotnet이 계속
  `dotnet` 탐색에서 밀렸습니다). 또한 `~/.bashrc` 재작성은 종료 마커가 몇 줄 안에 이어지는 블록만 제거합니다 —
  이전에는 마커를 잃은 블록이 파일의 나머지 부분까지 함께 지웠으며, 이제 그런 블록은 그대로 두고 보고한 뒤 새
  블록을 추가합니다. 후보 선택은 두 셸 모두에 구현되어 있으며, 테스트는 동일한 fixture로 bash
  `select_dotnet_candidate`와 PowerShell `Select-DotnetCandidate`를 실행해 두 결과가 일치함을
  고정합니다.
- **Cline: 분리 실행(detached) 설치 스킬은 한 턴에 최대 네 번까지만 폴링하며, 매 폴링은 서로 다른 명령입니다**
  (`tizen-sdk-install`, `tizen-sdk-install-custom-repo`, `tizen-tv-sdk-install`,
  `tizen-tv-sdk-install-from-zip` 스킬 및 에이전트, `common/lib/core/sdk.js`의 `harnessGuidance()`,
  tizen-cli 스킬 사본, TV 설정 문서). Cline은 동일한 호출이 5번 연속되면 도구를 중단하고, 오류가 6번 연속되면
  작업을 멈춥니다. 이전 방식 — `STATUS=running`인 동안 `sleep 25 && --status`, "같은 명령을 다시 실행" — 은
  다섯 번째 폴링(10–15분 걸리는 설치의 약 2분 시점)에서 이 보호 장치에 걸렸고, 분리 실행된 설치 프로그램은 계속
  실행되었습니다. 이제 각 폴링은 증가하는 시도 번호(`echo "poll #N"` / `Write-Host 'poll #N'`)를 포함하고, 네 번
  폴링한 뒤에는 에이전트가 메시지와 함께 턴을 종료합니다. 이 메시지는 설치가 백그라운드에서 계속된다는 점,
  **완료 알림이 자동으로 오지 않는다는 점**(Cline은 알림을 보낼 수 없음), 직접 확인할 `--status` / `-Status` 명령,
  그리고 물어볼 문장(설치 진행 상태를 알려줘 / "tell me the install progress")을 안내합니다. 사용자가 물으면
  에이전트는 `--status`를 실행하고 이어서 진행합니다. `common/lib/tests/harness-guidance.test.js`가 문구를 고정합니다.
- **모든 디바이스 명령에서 "디바이스 없음 / 여러 디바이스"를 하나의 매퍼로 처리합니다**
  (`common/lib/core/sdb.js` `describeSerialFailure()` + `onlineDevices()`). `resolveSerial()`의 실패를
  디바이스 모듈마다 — `sdb-helper`, `screenshot`, `project`(install-app 사전 점검), `dlog-analyzer` — 직접
  envelope 오류로 변환했고, 각 사본이 서로 달라져 있었습니다. `sdb-helper`만 `suggested_fix`를 붙였고,
  `dlog-analyzer`는 카테고리를 뭉뚱그렸습니다(이전 PR에서 수정). 이제 모두 공유 헬퍼를 호출합니다. 이 헬퍼는
  `resolveSerial()`의 카테고리를 유지하고, 온라인(`state === "device"`) 시리얼만 나열하며, 호출자 자신의 시리얼
  옵션(기본값 `--serial <serial>`; install-app과 dlog-analyzer는 두 하네스의 형식을 모두 표기)에 맞춰
  `multiple_devices` 메시지와 `suggested_fix`를 만들고, 온라인 시리얼을 `"<serial> (<state>)"` 줄로 `details`에
  전달합니다. 눈에 보이는 변경: `screenshot`, `install-app`, `dlog-analyzer`가 `multiple_devices`에서 연결된
  시리얼을 명시하는 `suggested_fix`를 갖게 되었고, 시리얼을 위치 인자로 받는 플러그인 dlog 러너에는
  `multiple_devices` 메시지가 더 이상 "Specify --serial"이라고 안내하지 않습니다. `sdb-serial-failure.test.js`가
  헬퍼를 검증하고 모든 `resolveSerial()` 호출자가 이 헬퍼를 거치는지 감시합니다.
- **`dlog-analyzer`가 네이티브 CLI의 SDK 기반 로그 디렉터리를 따릅니다** (`common/lib/core/dlog-analyzer.js`,
  `common/lib/cli/dlog-analyzer-cli.js`, `common/scripts/tizen-dlog-analyzer/tizen-dlog-analyzer.sh`,
  `tizen-cli/src/command-specs/dlog-analyzer.ts`). TizenDLogAnalyzer PR #155/#157에서 모든 바이너리 명령의
  `--base-dir`이 제거되었습니다. 해당 빌드에서는 `start`, `dlog-collect`, `error-analyze`, `app-log`가 모두
  `--base-dir <tmp>/tizen-dlog-analyzer`를 전달하고 `<tmp>/tizen-dlog-analyzer/app/<app-id>/`에서 앱 로그를
  읽었기 때문에 러너가 즉시 "No such option"으로 실패했습니다. 모든 사본에서 이 플래그를 제거했고, 새
  `resolveLogBaseDir()`가 바이너리 자체의 규칙
  (`~/.tizen.sdk.path.config` → `<sdk>/sdk.info`의 `TIZEN_SDK_DATA_PATH` 또는 형제 디렉터리 `<sdk>-data` →
  `<sdk-data>/dloganalyzer/`)을 적용하므로 `error-analyze` / `app-log`가 바이너리가 실제로 기록한 위치를 찾습니다.
  envelope는 `result.log_base_dir`(앱 액션은 `result.log_file`도)을 보고합니다. SDK 설정이 없거나 비어 있거나
  무효하면 `sdk_path_not_set`으로 즉시 실패합니다 — 바이너리 명령이 로그 디렉터리를 다루는 모든 액션(`start`,
  `dlog-collect`, `error-analyze`, `app-log`, `device-profile`, `investigate`, `probe`, `snapshot`, `timeline`,
  `kernel`; `app-launch` / `app-terminate`는 대상 아님)에서 바이너리와 디바이스 조회보다 먼저 검사하므로, 어떤
  바이너리 빌드가 설치되어 있든 디바이스가 없는 호스트에서는 이것이 처음이자 유일한 오류가 됩니다 — 캡처된 출력에
  묻힌 바이너리 종료 대신입니다. 리졸버는 순서뿐 아니라 바이너리의 문자열 처리도
  재현합니다: Python `strip()`/`splitlines()` 의미론(설정 파일의 UTF-8 BOM은 바이너리에게 경로의 일부이므로,
  러너도 동일한 "does not exist"를 보고하면서 원인이 BOM임을 알려 줍니다. 값이 비어 있는
  `TIZEN_SDK_DATA_PATH=` 줄은 건너뛰고 탐색을 계속합니다). `start`의 출력 디렉터리 위치 인자와 tizen-cli의 `start`용
  `--output-dir`은 더 이상 허용되지 않습니다(바이너리가 다른 위치를 가리키게 할 수 없음) — 이를 지정하면
  `start`가 `invalid_parameters`를 반환합니다. `--output-dir`은 `snapshot compare`의 두 번째 스냅샷 ID로만 남습니다.
  `$TMPDIR/tizen-dlog-analyzer/` 아래에는 러너의 PID 파일, 캡처된 stdout, `log-dump` 파일만 남습니다.
  **#155 이후의 `tizen-dlog-analyzer` 바이너리가 필요합니다**: 번들된 `common/tools/tizen-dlog-analyzer/*`
  빌드(`--base-dir`이 있는 v0.1.3.dev0)는 플래그가 없으면 `./logs`를 기본값으로 사용하므로 이번 변경과 함께
  갱신해야 합니다. `common/lib/tests/dlog-analyzer.test.js`의 새 드리프트 가드는 어떤 사본이든 다시
  `--base-dir`을 전달하면 실패합니다.

### 보안

- **`download-emulator-package` / `download-mobile-platform`이 `--platform-version`과
  `--iot-headed-version`을 검증합니다** (`common/lib/core/sdk.js`). 두 함수는 `sdk-install`과
  `platform-install`이 이미 적용하던 `validateTizenVersion()` 검사 없이 원시 값을 설치 프로그램 명령줄
  (`-PlatformVersion "<v>"`)에 그대로 삽입했습니다 — pkg 모드에서는 셸 문자열에, 그 외에는 `suggested_fix`
  명령에. 이제 `10.0"; rm -rf ~` 같은 값은 SDK 경로를 읽기도 전에 `invalid_argument`로
  거부됩니다(`common/lib/tests/sdk-install-version.test.js`).
- **인증서 비밀번호가 더 이상 envelope 메시지에 노출되지 않습니다** (`common/lib/core/certificate.js`
  `describeKeytoolFailure()`). keytool이 빈 stderr로 실패하면(잘못된 비밀번호는 stdout으로 보고함)
  `validateCertificateFile()`과 `inspect-certificate`는 `execFileSync`의 `error.message`로 대체했는데, 이는
  `-storepass <password>`를 포함한 전체 명령줄입니다. 이제 세 곳 모두에서 텍스트를 `redactSecrets()`로
  처리합니다(`common/lib/tests/certificate.test.js`).
- **Samsung Account OAuth 콜백 서버가 127.0.0.1에서만 수신하고 다른 경로에는 404로
  응답합니다** (`common/lib/core/samsung-auth.js`). 이전에는 모든 인터페이스에서 수신했기 때문에 LAN의 어느
  호스트든 `/signin/callback`에 조작된 `code`를 POST할 수 있었고, 다른 경로 요청(favicon 탐색)은 응답 없이
  멈춰 있었습니다.
- **Cline / Gemini 훅 어댑터가 본문이 경로보다 앞에 올 때 쓰기를 통과시키지 않습니다**
  (`cline/hooks/PreToolUse`, `gemini/hooks/BeforeTool`). 어댑터는 경로를 추출하기 전에 첫 번째
  `"content"` / `"diff"` / `"old_string"`에서 페이로드를 잘랐기 때문에, 파일 본문을 먼저 내보낸 도구 호출은
  경로를 잃고 허용되었습니다 — config.xml / tizen-manifest.xml 가드를 우회한 것입니다. 이제 첫 번째 구조적 키를
  사용하고(JSON 문자열 안에서는 모든 따옴표가 `\"`이므로 본문이 이를 위조할 수 없음), 경로를 확인할 수 없는
  쓰기는 거부합니다(`common/hooks/hooks.test.sh`).

### 수정

- **`tizen-11.0`에서 생성한 Native 프로젝트가 API 버전이 섞여 빌드에 실패하던 문제**
  (`create-project-app.sh` / `.ps1` `sync_custom_templates` → 새 `align_synced_manifest_api_version` /
  `Align-SyncedManifestApiVersion`, `common/lib/tests/list-templates.test.js`). 플러그인의 커스텀
  `BasicUI` 네이티브 템플릿은 러너가 선택하는 모든 `platforms/tizen-X.Y/…/Template/Native` 아래에 그대로 복사되는
  하나의 트리이며, 그 `tizen-manifest.xml`에는 고정된 `api-version="10.0"`이 들어 있었습니다. `tz new -p tizen-11.0`은
  프로필에 따라 `tizen_native_project.yaml`(`api_version: "11.0"`)과 `.tproject`(`tizen-11.0`)를 작성하지만
  매니페스트는 그대로 복사하므로, 프로젝트에 11.0과 10.0이 함께 남았고 `tz build`가 일관된 rootstrap을 결정하지
  못했습니다. 이제 동기화 단계가 복사된 매니페스트의 `api-version`을 선택한 프로필의 숫자 부분으로 다시 씁니다.
  플러그인 템플릿과 바이트 단위로 여전히 동일한 사본만 수정하므로(`cmp -s` / 바이트 배열 비교) SDK에 포함된
  매니페스트와 사용자가 편집한 매니페스트는 건드리지 않으며, 이전 플러그인 버전이 만든 사본도 다음
  `list-templates` / 생성 실행 시 복구됩니다. 재작성은 `<manifest …>` 루트 요소의 `api-version` 속성에 고정되고
  첫 번째 일치만 대상으로 하며, 두 쌍둥이 스크립트에서 같은 패턴을 사용합니다. `tizen-X.Y`가 아닌 프로필(TV,
  wearable)은 절대 재작성하지 않습니다. 스크립트 계층 TC 7개가 11.0에서의 새 사본(템플릿 대비 속성만 다름),
  변경되지 않은 10.0 사본, 오래된 사본 복구, 복구된 사본에 대한 멱등성, `tv-samsung-*` 프로필, 편집된
  매니페스트 미변경을 검증하고, 소스 검사 TC 3개가 `.ps1` 쌍둥이도 같은 고정 위치, 가드, 호출 지점을 유지하는지
  확인합니다.
- **네 가지 하네스 중 하나라도 없는 머신에서 cmd.exe 러너 탐색이 아무것도 출력하지 않던 문제**
  (#227 리뷰; `scripts/rewrite-runner-snippets.js`, 34개 `common/skills/*/SKILL.md` 및
  `common/agents/*.md`, 4개 `docs/debug/*` 워크스루, `common/lib/tests/plugin-cache.test.js`,
  `cline/hooks/tizen-sdk-skills-guard.md`). 생성된 cmd.exe 줄은 하나의 `dir /s /b`에 네 개의
  `%USERPROFILE%\.<host>\plugins\cache\…` 경로를 모두 넘겼습니다. `dir`은 경로 하나라도 존재하지 않는 점(dot)
  디렉터리 아래에 있으면 전체 목록 출력을 중단하는데(exit 1, 출력 없음), `.claude`, `.cline`, `.codex`,
  `.gemini`를 모두 설치한 사람은 없습니다. 이제 생성기는 호스트마다 `dir`을 하나씩 `&`로 연결해 내보내고, 각각에
  `2>nul`을 붙이며, 마지막 호스트가 없어도 exit code 1이 남지 않도록 끝에 `ver >nul`을 추가합니다. 드리프트 가드는
  하나의 dir에 여러 경로를 넘기는 형식을 거부합니다. Windows에서 검증: bash, PowerShell, 새 cmd.exe 형식이 모두
  같은 `…\1.3.1\lib\cli\dlog-analyzer-cli.js`를 찾습니다.
- **`tizen-dlog-analyzer` — 러너 탐색 섹션의 구조가 다른 모든 스킬과 동일해졌습니다**
  (#227 리뷰; `common/skills/tizen-dlog-analyzer/SKILL.md`, `common/hooks/tizen-sdk-skills-guard.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`). bash와 PowerShell 블록은 같은 `node "$CLI" …` 호출로 끝나고, cmd.exe
  블록 다음에는 다른 곳과 마찬가지로 `node "<found-path>" …` 단계가 이어집니다. 섹션은 세 형식 모두 같은
  `<host-dot-dir>/…/<VERSION>/lib/cli/` 파일을 찾는다는 점과 각각이 호스트와 버전을 고르는 방법을 명시하며, 두
  가드 규칙 모두 같은 플레이스홀더와 같은 "not in the skill folder — do not `find` there" 문구를 사용합니다.
- **`tizen-dlog-analyzer` — `start-monitoring`의 실시간 크래시/예외 분석이 캡처되고 `stop` 후에도
  남습니다** (issue #226; `common/lib/core/dlog-analyzer.js`, `common/lib/cli/dlog-analyzer-cli.js`,
  `common/skills/tizen-dlog-analyzer/SKILL.md`, `common/agents/tizen-dlog-analyzer.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`). 네이티브 바이너리는 PyInstaller(Python) 빌드이고 러너가
  stdout을 `analyzer-output.log`로 리디렉션하므로 Python이 이를 블록 버퍼링했습니다. 그래서 세션 중 `check`에는
  아무것도 표시되지 않았고, `stop`이 먼저 SIGTERM을 보내면 Python 프로세스가 버퍼를 비우지 않고 종료되어 탐지
  결과가 사라졌습니다. 이제 분리 실행되는 세 수집기는 `PYTHONUNBUFFERED=1`로 실행되고, 모든 중지 경로는
  SIGINT → SIGTERM → SIGKILL 순으로 신호를 보내며(`terminateGracefully`), `stop`은 마지막으로 캡처된 200줄
  (`result.output`, `total_lines`, `truncated`, `next_step`)을 반환합니다 — 파일은 다음 `start`에서만 비워지므로
  이후에도 `check`가 전체 내용을 반환합니다. 모니터가 실행 중일 때 `dlog-collect <app-id>`가 실패하면(바이너리는
  dlog 수집기를 하나만 허용) 재현 도중 모니터를 중지하는 대신 그 사실을 알리고 `check`를 안내합니다.
  `start stop`에는 "run `stop` on its own"으로 응답합니다. 스킬/에이전트 텍스트는 `start-monitoring`을 실행했다면
  `check`를 절대 건너뛰지 않는다고 명시합니다(`common/lib/tests/dlog-analyzer.test.js` Tests 16–17). 리뷰 후속
  수정: 세 수집기가 캡처 파일을 두 번 열었기 때문에(stdout은 `"w"`, stderr는 `"a"`) 두 스트림의 오프셋이 독립적이었고
  stderr가 추가한 줄을 stdout이 덮어썼습니다 — 이제 하나의 디스크립터를 공유합니다(`openCollectorOutput`, 파일을
  비우는 유일한 곳). `start`와 `dlog-collect`는 2초 유예 시간 안에 수집기가 종료되면 PID 파일을 삭제하므로(이전에는
  `kernel collect`만 그랬음) 재사용된 PID 때문에 `stop`이 무관한 프로세스에 신호를 보내는 일이 더 이상 없습니다.
  또한 `stop`은 빈 캡처에 대해 더 이상 "last 0 of 0 lines"라고 표시하지 않습니다.
- **`tizen-dlog-analyzer` — 최종 보고서가 `REPORT_TEMPLATE.md`를 따릅니다** (issue #224; 동일한 스킬/에이전트
  파일, `common/lib/core/dlog-analyzer.js`). 템플릿은 에이전트가 `cat`해야 하는 별도 파일에만 있었고, 그렇게 하지
  않으면 보고서가 이모지 제목과 결과 표가 있는 즉흥적인 영어 전용 "🔍 Investigation Report"로 나왔습니다. 이제
  모든 레인의 스킬 텍스트가 "Final report — the only accepted shape" 아래에 정확한 골격(두 블록, 모든 제목, 마무리
  안내 문구)을 담고 관찰된 잘못된 형태를 명시하며, `check` / `error-analyze` / `kernel analyze` envelope가
  `result.report_format`에 형식을 다시 기술해 데이터와 함께 전달합니다(Test 18).
- **`tizen-dlog-analyzer` — Cline에서 러너를 첫 시도에 찾습니다** (issue #223;
  `common/skills/tizen-dlog-analyzer/SKILL.md`, `cline/hooks/tizen-sdk-skills-guard.md`,
  `common/hooks/tizen-sdk-skills-guard.md`). Cline은 마크다운만 들어 있는 `~/.cline/skills/<skill>/`에서 스킬을
  불러오며, 러너는 플러그인 캐시에 있습니다. 스킬의 탐색 스니펫은 Goal / Routing / Boundary 설명 뒤(63행)에 묻혀
  있었고, cmd.exe / PowerShell 형식이 없었으며, 러너가 스킬 폴더에 없다는 말도 없었습니다 — 그래서 에이전트가
  실행하기 전에 스킬 디렉터리와 `~/.cline`에 대해 `find`를 두 번 호출했습니다. 이제 탐색 섹션이 스킬 본문의 맨
  앞에 오고, 러너가 있는 곳과 없는 곳을 명시하며, 다른 모든 스킬과 같은 bash / cmd.exe / PowerShell 3종 세트를
  담습니다. 항상 적용되는 Cline 규칙(rule 1)과 호스트 중립 가드(rule 8)도 같은 내용을 담아 스킬이 로드되기 전에도
  유효합니다.
- **`tizen-dlog-analyzer` — 증상 보고가 분석기로 전달되고 분석기의 증거 수집 흐름을 따릅니다**
  (issues #211–#215; `common/skills/tizen-dlog-analyzer/SKILL.md`, `common/agents/tizen-dlog-analyzer.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`, `tizen-device-manager` 및 `tizen-sdb-helper`
  스킬/에이전트 텍스트, `common/hooks/*`, `common/lib/core/dlog-analyzer.js`, `common/lib/core/sdb-helper.js`).
  "the emulator CPU went to 300% and the video does not play in com.samsung.fh.youtube — investigate" 같은
  프롬프트에서 다섯 가지 동작이 관찰되었습니다: (#211) 사용자가 분석기를 지명하지 않으면 요청이
  `tizen-device-manager`로 위임됨; (#212) `dlog-collect` 후 모델이 사용자에게 재현을 요청하는 대신 타이머로
  대기한 뒤 분석함; (#213) 커널 로그를 `sdb shell dmesg`로 가져옴; (#214) CPU/메모리 증거를 분석기의 프로브 대신
  `sdb shell top / ps`로 수집함; (#215) 필터링되지 않은 `app-log`가 첫 번째 분석 호출이었음.
  수정 사항: 분석기의 `description` / `when_to_use`가 이제 증상 어휘(high CPU, freeze, video not playing,
  원인 분석 …)를 명시하고 에뮬레이터를 언급하는 보고도 여전히 자신의 담당이라고 밝히며, `tizen-device-manager`는
  탐색/중지 전용임을 선언합니다. 새 **조사 워크플로**(`investigate --symptoms` → 재현 전 수집기 시작 → _턴을
  종료하고 질문_ → `error-analyze summary` → `check` → `kernel analyze` → `details` / 필터링된 `app-log` /
  `probe run`으로 확대)와 Rules 10–13(`kernel collect|stop|analyze`를 통한 커널 로그, `investigate`/`probe`를 통한
  증거 수집, 오류 우선 분석 순서, 라우팅)을 추가했습니다. 훅: `check-skill-routing.sh`가 이제 `Agent`/`Task`도
  감시하고 증상 프롬프트를 `tizen-device-manager`로 위임하는 것을 거부합니다
  (`hooks.json` / `claude.sh` / `claude.ps1` matcher `Skill|Agent|Task`). `check-tizen-commands.sh`에는 Rule 17
  (sdb를 통한 원시 `dmesg`/`kmsg`), Rule 18(`sdb shell`을 통한 직접 입력 `top`/`ps`/`free`/`/proc/*` 진단),
  Rule 19(러너의 stop/analyze 액션 전후의 `sleep`/`Start-Sleep`, 또는 수집기 중 하나가 살아 있는 동안의 5초 이상
  단독 sleep — PID 파일은 `<tmp>/tizen-dlog-analyzer/` 아래, 생존 확인은 `kill -0` 또는 Git Bash의 `ps -W`)를
  추가했습니다. `tizen-sdb-helper`에는 `kernel-log` 핸드오프 인텐트(`dmesg` / `kmsg` / "kernel log" → dlog-analyzer)를
  추가했습니다. 러너: **`kernel collect`가 이제 분리 실행되는 백그라운드 수집기이며** `kernel stop`으로 중지합니다 —
  바이너리의 해당 하위 명령은 끝나지 않기 때문에 이전의 동기식 `execFileSync` 호출은 항상 30초 제한 시간에 걸려
  `kernel_failed`를 반환했고, 이것이 모델을 `sdb shell dmesg`로 몰아간 원인이었습니다.
  `kernel analyze`는 변경되지 않았습니다. 테스트: `common/hooks/hooks.test.sh`(rules 17–19, Agent/Skill
  라우팅), `common/lib/tests/dlog-analyzer.test.js`(`kernel stop`), `sdb-helper.test.js`
  (`kernel-log` 인텐트); 새 프롬프트 레인 TC `tests/tc/dlog-analyzer/dlog-analyzer.prompt-symptom-routing.yaml`
  (TC-P-119, 에이전트 세션 실행 3회 전까지 `draft` — 단순 증상 보고는 `device-manager`가 아니라 `dlog-analyzer`로
  결정되어야 함; `tests/README*.md` / `CSV-YAML-MAPPING.md`의 TC 통계를 290개 TC로 갱신). 통과 기준은 기계적으로
  검사할 수 있습니다: `tests/schema/tc-schema.json`에 선택적 프롬프트 레인 `expect` 키 두 개 —
  `first_resolved_command`(첫 번째 `must_call_tool` 호출이 이 명령으로 결정되어야 함)와
  `must_not_resolve_commands`(실행 중 어느 시점에도 결정되지 않아야 함) — 를 추가했습니다. `must_resolve_command`만으로는
  먼저 `device-manager`를 거쳐 우회한 실행도 통과하기 때문입니다.
  `tests/skills/run-test-suite.md`는 두 키를 설명하고 프롬프트 레인 러너에게 시도마다 결정된 명령을 순서대로
  나열하도록 요청합니다. 문서: dlog-analyzer 워크스루(EN/KO) Key Rules 3–7 + "Symptom
  Investigation" 표, `SKILLS_REFERENCE*.md` §9/§28, 가드 rule 13(Cline rule 11).

- **`download-emulator-package`가 실제로 디스크에 있는 에뮬레이터 이미지를 보고합니다**
  (`common/lib/core/sdk.js`, `common/lib/envelope/response-formatter.js`). 사전 점검은 "무엇이 설치되어
  있는지"를 `.emulator-package-installed` 마커만으로 판단했지만, 이 마커는 이 스킬이 수행한 설치만
  기록합니다 — `tizen-sdk-install`, `tizen-tv-sdk-install`, `tizen-platform-install`도 에뮬레이터 이미지를
  설치하지만 마커를 건드리지 않습니다. 10.0 이미지가 SDK / TV SDK 설치 프로그램으로 설치된 호스트에서 이후 11.0을
  실행하면 `Platform version: 11.0` 한 줄짜리 마커가 생성되어 envelope가 "11.0만 설치됨"으로 읽혔습니다. 이제
  envelope는 `platforms/tizen-X.Y/<profile>/emulator-images/`를 스캔해 그 결과를 두 성공 경로 모두에서
  `result.installed_images`(`[{platform, profile, image}]`, 버전순 정렬)로, 미설치 경로에서는 이미지당 한 줄의
  `errors[0].details`로 전달합니다. 경고 텍스트는 "Recorded by this skill: …"과 "Emulator images on disk: 10.0
  (tizen, tv-samsung), 11.0 (tizen)"을 구분합니다. 마커 기반의 이미 설치됨 판단은 변경되지 않았습니다
  (`common/lib/tests/emulator-marker.test.js`).
- **`create-project --force`가 기존 프로젝트를 제거하기 전에 모든 것을 검증합니다**
  (`common/lib/core/project.js`). `fs.rmSync`가 app-name / template / parent-path 셸 검사와 스크립트 조회보다
  먼저 실행되었기 때문에, 이후 `invalid_parameters`로 거부된 요청이 교체하려던 프로젝트를 이미 삭제한 상태였습니다.
  이제 모든 검사를 통과한 뒤에만 제거하며, 스캐폴딩이 실패하면 `build_failed`가 아니라
  `project_creation_failed`로 표시합니다(`common/lib/tests/project-delete.test.js`).
- **`--schema`가 비밀번호 옵션을 다시 `sensitive: true`로 표시합니다** (`tizen-cli/src/lib/schema-generator.ts`,
  `tizen-cli/src/index.ts`). MCP 호스트가 비밀 값을 마스킹할 때 사용하는 이 표시가 두 가지 결함으로 가려져
  있었습니다: 검사가 Commander의 `option.flags`(`"--password <password>"`)를 받아 일치하지 않았고, 이어서
  envelope의 필드 이름 마스킹이 `"--password": {…}` 스키마 객체 전체를 `"***"`로 바꿔 `type`과 `description`까지
  사라졌습니다. 이제 생성기는 `option.long`을 사용하고, `--schema` 카탈로그(메타데이터만 있고 비밀 값 없음)는
  마스킹 없이 출력됩니다(`tests/tc/meta/meta.schema.yaml`).
- **`--help`, `--version`, `<command> --help`가 stdout으로 성공 envelope를 반환합니다**
  (`tizen-cli/src/index.ts`, `tizen-cli/src/commands.ts`). 이전에는 Commander 텍스트를 stderr로 출력하고
  stdout에는 아무것도 출력하지 않아 "정확히 하나의 JSON envelope" 계약을 위반했습니다. 이제 같은 텍스트를
  `result.help_text`에 담아 전달합니다(`tests/tc/meta/meta.help.yaml`).
- **`sdb-helper`가 `uninstall`을 직접 처리합니다** (`common/lib/core/sdb-helper.js`). 이 인텐트는 uninstall
  기능이 없는 `tizen-install-app`으로 넘겨졌기 때문에 "uninstall the app"이 아무 데도 도달하지 못했습니다. 이제
  패키지 ID와 앱 ID의 차이에 대한 안내와 함께 확인 절차를 거치는 `sdb shell pkgcmd -u -n "<pkgid>"`로 실행되며,
  `tizen-install-app`과 충돌하지 않도록 스킬에서 단독 `launch app` / `앱 실행` 트리거를 제거했습니다.
- **세션의 첫 sdb 호출이 더 이상 제한 시간까지 멈추지 않습니다** (`common/lib/core/sdb-helper.js`,
  `common/lib/core/remote-device.js`, `common/lib/core/samsung-duid.js`). 데몬을 시작해야 하는 콜드 sdb
  클라이언트는 데몬이 stdout 파이프를 붙잡은 상태로 남깁니다. 이제 모든 진입점이 먼저 `ensureSdbServer()`(또는
  `runSdb(..., {viaTempFile: true})`)를 호출합니다. `samsung-duid`도 상태와 무관하게 `sdb devices`의 첫 줄을 가져오는
  대신 공유 `parseDevices()` / `onlineDevices()`를 사용하며, 보간된 셸 문자열 대신 argv 배열로 sdb를 실행합니다.
- **`hidden-password` 프롬프트가 EOF에서 CPU 100 %로 계속 도는 문제를 수정했습니다.** Windows raw-mode
  실패 경로에서 프로세스 자신의 stdin을 닫던 문제도 함께 수정했습니다(`common/lib/cli/hidden-password.js`).
- **`download-mobile-platform --force`**는 단순히 `suggested_fix`만 반환할 때가 아니라 실제로 설치 프로그램을
  인라인으로 실행할 때에만 설치 마커를 제거합니다(`common/lib/core/sdk.js`).
- **스킬 설명이 호스트의 1024자 제한에 맞도록 줄였습니다** (`tizen-create-project`, `tizen-sdb-helper`,
  `tizen-dlog-analyzer` 스킬 및 에이전트, `tizen-cli/skills/tizen-create-emulator`). 더 긴 설명은 호스트에서
  잘렸으며, 이 때문에 `tizen-create-project`의 마지막 규칙인 "NEVER hand-write config.xml"이 소리 없이
  사라졌습니다. 이제 라우팅 규칙은 본문의 "Routing rules" 섹션에 두고,
  `tests/scripts/verify-skill-frontmatter.mjs`(`tests/`의 `npm run lint`에 포함)가 제한을 넘는 설명이 있으면
  실패합니다. `tizen-dlog-analyzer` 스킬은 node 러너가 받지 않는 `--app-id` 플래그를 더 이상 문서화하지
  않습니다(앱 ID는 위치 인자입니다).
- **테스트 스위트:** `tests/policy/tiers.yaml`이 `import-wgt`를 (mutating)으로 분류합니다. 이 명령은 1.3.1에서
  티어 없이 배포되어 TC가 기본값 `skip`으로 처리될 상황이었습니다. 또한 `verify-doc-stats.mjs`는 이제
  `tiers.yaml`과 `tizen-cli/plugin.json`이 일치하지 않으면 실패합니다(internal-only 명령 그룹은 제외).
  `import-wgt`에 첫 TC(`import-wgt.missing-required`, `import-wgt.missing-archive`, 둘 다 safe 티어 — SDK에
  접근하기 전에 입력 검증에서 실패함)를 추가했습니다. 러너는 프로필이 리디렉션된 경우
  `<USERPROFILE>\AppData\Local`을 생성하므로, PowerShell 5.1이 더 이상 `ModuleAnalysisCache`를
  `tests/Microsoft/`(gitignore에도 추가)에 남기지 않습니다. `vscode/package.json`에서 존재하지 않는 파일을
  가리키던 `icon` 스크립트를 제거했습니다.
- **`tizen-create-project`가 러너가 거부하는 앱 이름을 더 이상 제안하지 않습니다.** 에이전트와 스킬
  지침(`common/agents/tizen-create-project.md`, `common/skills/tizen-create-project/SKILL.md`,
  `tizen-cli/skills/tizen-create-project/SKILL.md`)은 `createProject()`가 앱 이름에 영문자/숫자를 최소
  10개 요구한다는 점(Tizen 패키지 ID는 정확히 영숫자 10자)을 언급하지 않았습니다. 그래서 앱 이름 질문에서
  `MyApp` 같은 이름을 제안했고, 생성은 `invalid_parameters`로 실패했으며, 사용자에게 이름을 다시 물어야
  했습니다. 이제 이름을 묻는 곳에 이 규칙을 명시하고, 모든 예시와 선택지가 규칙을 통과해야 합니다
  (`MyTizenWebApp`, `MyTizenNativeApp`, `MyTizenDotnetApp`, `MyTizenApp01`, `MyDaliDemoApp`). CLI 도움말
  (`--name` 설명), `project.js` 힌트, `T-CLI.md`, `docs/platform-gbs-build*.md`,
  `docs/sdk-install/DOTNET_SETUP_E2E*.md`에 남아 있던 `--name MyApp` 예시도 규칙을 통과하는 이름으로
  교체했습니다. 두 GBS 워크스루(`docs/tizen-cli/dali-demo-e2e-walkthrough*.md`,
  `docs/figma2dali/dali-template-build-e2e*.md`)는 프로젝트를 `dali-demo`(영문자/숫자 8개 — 역시 거부됨)로
  생성했는데, 이제 전체적으로 `MyDaliDemoApp`을 사용하며(프로젝트 경로, RPM 파일 이름, `/usr/bin` 바이너리,
  `/tmp/<name>.log`, `~/bin/run-<name>.sh`), 템플릿 치환 안내에서 템플릿 기본 이름을 그대로 쓸 수 없는
  이유를 설명합니다. 모든 문구는 _ASCII_ 영문자/숫자(`A-Za-z0-9`; `-`, `_`, 공백, 한글 같은 비 ASCII 문자는
  세지 않음)라고 표현하며, 이는 `validatePackageId()`가 검사하는 내용과 정확히 같습니다.
  `common/lib/tests/app-name-examples.test.js`가 나열된 모든 ✅/❌ 예시, `--name` 설명의 예시,
  `createProject()` 힌트를 `validatePackageId()`로 검사하므로 목록이 검증기와 어긋날 수 없습니다.
- **`dlog-analyzer`의 디바이스 확인 envelope이 실제 오류 범주를 유지하고 온라인 디바이스만 나열합니다**
  (`common/lib/core/dlog-analyzer.js`, PR #192 후속). `deviceErrorEnvelope()`가 `multiple_devices` 이외의
  모든 실패를 `device_not_found`로 뭉뚱그렸기 때문에, `invalid_parameters` serial, `sdb devices`의
  `io_error`, sdb 바이너리 누락 모두 에이전트에게 "에뮬레이터를 실행하라"고 안내했습니다. 이제
  `resolveSerial()`의 범주를 그대로 전달합니다(범주가 없는 바이너리 누락은 여전히 `device_not_found`로
  매핑됨). `errors[0].devices` 목록은 `state === "device"`로 필터링되므로, `multiple_devices`가 더 이상
  오프라인 serial을 제시하지 않고 `device_not_found`에는 스킬 문서에서 이미 설명한 대로 `devices` 배열이
  포함되지 않습니다. 이 헬퍼는 export되어 `dlog-analyzer.test.js`로 테스트합니다. 에이전트 프롬프트와 두
  SKILL.md 파일은 이제 선택한 serial을 위치 인자 `[serial]` 자리에 넣어 다시 실행하도록 안내합니다 —
  플러그인 러너에는 `--serial` 플래그가 없어서, PR #192가 문서화한 재시도는 `Unknown option`으로
  거부되었습니다. 또한 `error-analyze` 행은 더 이상 "토큰 효율을 위해" `details`를 권장하지 않습니다
  (`details`가 더 큰 출력이며, 간결한 쪽은 `summary`입니다).
- **`install-rootstrap`이 스크립트에 `-SdkPath` / `--sdk-path`를 전달합니다.** JS에서
  (`readSdkPath()`) SDK를 확인했지만 스크립트가 `Get-SdkPath`로 다시 확인하게 두었고, 그 후보에
  `$env:TIZEN_SDK_PATH`가 포함되어 있었습니다 — 두 결과가 다를 수 있어서, 사전 검사가 검증한 SDK와 다른
  SDK에 rootstrap이 설치될 수 있었습니다.
- **`sdb-helper`가 디바이스 지정 구문을 셸 명령 인자에서 제외합니다** (`common/lib/core/sdb-helper.js`의
  `extractShellCommand()`). "run shell command ls -la on emulator-26101"은 디바이스에서 `ls -la on
  emulator-26101`을 실행했고(`ls: cannot access 'on'`), 앞에 오는 구문("on emulator-26101 run shell command
  ls")은 키워드 제거를 무력화해 문장 전체를 전송했습니다. 이제 앞이나 뒤에 오는 "on (the|my|this)
  (device|emulator|target|tv|board) [serial]" 또는 "on <serial>"을 제거합니다. 이때 단독 `<serial>`은
  `emulator-<port>`, IPv4[:port], 또는 문자와 숫자가 섞인 하드웨어 serial이어야 하므로 `grep -i on
  file1.txt`, `echo on`, `tail -n 20 on log2024.txt`, `ls /opt/on/the/device`는 그대로 유지됩니다. 앞뒤의
  공손한 표현(please, kindly, for me, thanks)도 마찬가지로 제거합니다. 디바이스 지정 구문만 있는 요청은
  명령을 생성하지 않습니다(`sdb-helper.test.js` Test 5b).
- **Windows의 `sdk-install`이 User `Path`에 `C:/Users/me/tizen-sdk\bin`을 기록하던 문제를 수정했습니다**
  (`tizen-sdk-install.ps1`, `common/scripts/lib/common.ps1` `ConvertTo-CanonicalWindowsPath`). JS 계층은
  끝의 백슬래시가 닫는 따옴표를 이스케이프하지 않도록 `-Path`를 슬래시로 전달하는데, 설치 프로그램이 이
  값을 그대로 사용해서 `Path`, `TIZEN_SDK_PATH`, `sdk.info`, `~\.tizen.sdk.path.config`에 모두 슬래시 형태가
  저장되었고, "이미 Path에 있음" 검사가 백슬래시 항목과 일치하지 않아 실행할 때마다 세 항목이
  중복되었습니다. 이제 경로를 확인한 직후 한 번 정규화합니다(상대 경로는 PowerShell의 `$PWD` 기준, 드라이브
  루트는 구분자 유지, 공백 제거, `GetFullPath`가 거부하는 값은 중단하지 않고 슬래시 치환으로 대체).
  `tizen-sdk-install-custom-repo`도 같은 스크립트에 위임하므로 함께 적용됩니다
  (`common/lib/tests/sdk-install-windows-path.test.js`가 실제 헬퍼를 PowerShell에서 실행합니다).
- **`remote-device`와 `screenshot`이 sdb 바이너리를 실행하기 전에 존재 여부를 확인합니다**
  (`common/lib/core/remote-device.js`, `common/lib/core/screenshot.js`). 두 명령은 `<sdk>/tools/sdb`를
  결합하기만 하는 `resolveSdb()`를 사용했기 때문에, 바이너리가 없으면 그대로 셸로 넘어갔고, 한국어 Windows
  호스트에서는 CP949 "경로를 찾을 수 없음" 메시지가 UTF-8로 디코딩되어 대체 문자로 깨진 `io_error`가
  반환되었습니다. 이제 다른 sdb 호출부처럼 `resolveSdbBinary()`를 사용합니다(디스크에 있는 설정된 경로,
  없으면 `PATH`의 sdb, 그것도 없으면 `sdk-init`을 안내하는 깔끔한 `sdk_path_not_set`).
- **테스트 스위트:** mutating 티어에 문서화된 최소 준비(`--only=tmp,projects,rootstrap`)가 `myProfile` 서명
  프로필을 생성하지 않아서, 이 프로필이 없는 호스트에서는 `build-project.release --sign-profile myProfile`이
  `TIZEN_SDK_CERT_E021`로 실패했습니다. 이제 `projects`를 선택하면 프로필이 보장됩니다(생성 / 유지 /
  `--replace-profile` 규칙은 동일하며, `--skip-build`는 모든 부분에서 똑같이 이 단계를 건너뜁니다). 러너의
  launcher 없음 힌트는 디렉터리를 명시합니다(`cd tizen-cli && pnpm build`). 이번 릴리스 후 스위트 상태:
  **283개 파일에 290개 TC, approved 282 / draft 8** (safe 69 / mutating 79 / device 142) — 새
  `import-wgt.*` 및 `meta.help` TC는 approved이며, TC-P-119는 에이전트 세션 실행을 세 번 거칠 때까지 draft로
  유지됩니다.

### 제거

- `CI_TEST_FIX.md` 및 `SECURITY_FIXES_SUMMARY.md` — 개인 경로가 포함된 작업 메모로, 실수로 저장소 루트에
  커밋되었습니다.

### 문서

- **저장소 전체 아키텍처 다이어그램** (`docs/ARCHITECTURE_DIAGRAMS.md` 한국어,
  `docs/ARCHITECTURE_DIAGRAMS.en.md` 영어): 파일마다 Mermaid 다이어그램 10개 — `common/`을 공유하는 여섯
  하네스, 디렉터리 구조, SKILL → runner → sdk-commands → plugin-cache → script 호출 흐름, Standard JSON
  Envelope, guard hook, setup/sync, 독립 실행형 tizen-sdk CLI 빌드, 도메인별 명령, 일반적인 end-to-end 흐름,
  테스트/CI 게이트. flowchart와 sequence 다이어그램 유형만 사용합니다(mindmap 유형은 오래된 미리보기에서
  렌더링되지 않음). 두 README 모두 "Architecture & reference" 아래에 이 두 파일을 링크합니다. 여기와
  `tests/README.md`의 모든 Mermaid `style` 줄은 `color:#1a1a1a`와 stroke를 지정합니다 — 밝은 채우기 색이
  어두운 테마에서 흰색 텍스트로 렌더링되었기 때문입니다.
- **테스트 스위트 문서**: `tests/RUN-ORDER.md`는 safe → mutating → device 순서(드라이버, 사전 요구 사항,
  단계, 옵션, 흔한 실패)를 한곳에 모았으며, 한국어 `tests/README.ko.md` / `tests/RUN-ORDER.ko.md`는 영어
  문서에서 링크됩니다. `tests/README.md`는 모든 러너 워크플로 앞에 tizen-cli 빌드(`cd tizen-cli && pnpm
  install && pnpm build`)를 둡니다 — `dist/`가 gitignore되어 있어 새로 체크아웃하면 그렇지 않을 경우 모든
  cli-lane TC가 실패하기 때문입니다. 또한 단독 `node runner.mjs`가 mutating 및 device 티어를 실행한다고
  경고하고, 러너의 실행기 확인 순서(Windows: `TC_LAUNCHER_JS`, 그다음 `../tizen-cli/bin/tizen-sdk.js`; 그 외:
  `PATH`의 `tizen-cli` / `tizen-sdk`)와 번들이 오래되었는지 검사하는 드라이버를 설명합니다.
  `TEST-SUITE-PLAN.md`는 현재 스위트에 맞게 다시 작성했고 `README.md`를 기준 문서로 명시합니다.
  `verify-doc-stats.mjs`는 이제 README 다이어그램, lane 표, `tiers.yaml`, `README.ko.md`도 검사하며,
  `tiers.yaml` 키가 어긋나면 명확히 실패합니다. 이 스크립트가 검사하지 않던 오래된 TC / lane 수(당시 281 →
  286, cli 171 / prompt 118 → 167 / 119)도 수정했습니다.

## [1.3.1] — 2026-09-23

통합 스위트의 device 및 mutating 티어가 처음부터 끝까지 실행되고(순서가 정해진 단계, 호스트에서 빌드한
fixture 앱; approved TC 286개 중 199 → 264), safe 티어가 CI 게이트가 되며, `gdb-debug`에 `--serial`이
추가되었습니다. TC 보고서 후속 조치로 열 가지를 수정했습니다. 그중에는 gdbserver가 없는 에뮬레이터 이미지에서의
`gdb-debug`, 설치하지 않은 플랫폼에 대해 성공을 보고한 `sdk-install`, 영원히 멈출 수 있던
`device-manager stop`, 그리고 이름이 `t`인 VM을 부팅하려던 Windows `launch-emulator`가 있습니다.

### 추가

- **`gdb-debug --serial <serial>`** (`tizen-cli/src/command-specs/debug.ts`, `common/lib/core/debug.js`,
  `common/lib/cli/gdb-debug-cli.js` 6번째 위치 인자, `tizen-native-gdb-debug.ps1` `-Serial` / `.sh` `-s`).
  gdb 스크립트는 모든 호출에 sdb의 기본 대상을 사용했습니다. 이제 `tizen-dotnet-debug`가 이미 하는 것처럼
  모든 `sdb` 호출을 `--serial`이 주어지면 그 serial에(연결되지 않은 serial은 거부), 아니면 첫 번째 연결된
  디바이스에 고정하며, envelope은 `result.device_serial`을 보고합니다. `gdb-debug.serial`(TC 작성 이후
  draft였음)이 실행되어 approved되었습니다. `gdb-debug`와 `dotnet-debug`(이전에는 `--serial`을 검사 없이
  스크립트 인자에 끼워 넣었음) 모두 이제 공유 `SERIAL_PATTERN`으로 검사하며, 이 패턴은 앞의 `-`를 금지하고
  길이를 64로 제한하도록 강화했습니다(`common/lib/tests/debug-serial-validation.test.js`).
- **순서가 정해진 mutating 티어 테스트 실행** (`tests/scripts/run-mutating-tier.mjs`,
  `tests/policy/mutating-run-order.yaml`, `npm run test:mutating` / `prepare:mutating`). 단독
  `node runner.mjs --tier=mutating`은 결코 통과할 수 없었습니다. readdir 순서로는 프로젝트를 생성하는 TC보다
  먼저 빌드하고, 이후 빌드보다 먼저 삭제하며, `remove-profile`은 fixture를 소모하고,
  `generate-author` / `import-certificate`는 이전 실행의 인증서 덮어쓰기를 거부했기 때문입니다. 드라이버는
  cwd = `tests/`로 다섯 단계를 실행하고, 단계마다 `fixtures.generated.env`로 게이트를 걸며(공유
  `FIXTURE_NEEDS`), 다음 hook을 추가합니다. `cleanKeystore`(`<sdk-data>/keystore` 아래 fixture 이름의
  인증서만), `resetProfileFixtures`(`fixtures/profiles/*.xml` 백업/복원, `create-profile`용 임시
  `profiles.xml`), `resetProjectsDir`(`${FIXTURE_PROJECTS_DIR}`). `fixtures/profiles`에 커밋되지 않은 변경이
  있으면 시작을 거부합니다. SDK 패키지를 설치하거나 제거하지는 않습니다. 이미 설치된 경우의 단축 처리가
  멱등적인 SDK 설치 TC만 포함합니다. hook이 비우는 모든 디렉터리(두 드라이버 모두)는 `guardedScratchDir()`를
  통과해야 합니다. 실제 경로가 `tests/fixtures/apps` 내부에 엄격히 있어야 하고, symlink/junction이 아니며,
  다른 드라이브가 아니어야 합니다. teardown 중 두 번째 Ctrl+C는 무시되며, 실패한 teardown 단계(프로필
  fixture의 최종 `git status` 자체 검사 포함)는 실행을 실패로 만듭니다.
  Windows 첫 실행: 4분 만에 5/5 단계 통과, mutating cli-lane TC 27개를 draft → approved로 승격
  (`sdk-install` ×3, `sdk-install-custom-repo` ×2, `tv-sdk-install.happy`, `dotnet-setup` ×2,
  `certificate-manager` ×11, `create-project` ×4, `build-project` ×3, `project-delete.happy`).
- **`requires.capabilities`에 `samsung-account`와 `gbs`가 추가되었습니다** (`tests/schema/tc-schema.json`).
  `draft`로 남은 cli-lane TC 22개는 이제 그 이유를 선언하고(패키지된 CLI에서만 실행되거나 SDK를 재설치하는
  설치 프로그램은 `[sdk, net]`, online-CA 작업은 `[sdk, samsung-account]`, `remote-device.connect*`는
  `[net-device]`, GBS 빌드는 `[sdk, gbs]`), `NOTE`에도 이를 기재합니다.
- **순서가 정해진 device 티어 테스트 실행** (`tests/scripts/run-device-tier.mjs`,
  `tests/policy/device-run-order.yaml`, `tests/runner.mjs --order=<yaml> [--phase=<name>]`).
  단독 `node runner.mjs --tier=device`는 결코 통과할 수 없었습니다. readdir 순서로는 에뮬레이터가 존재하기
  전에 디버그 TC를 실행하고, `test-vm`을 세 번 생성하며, 이를 필요로 하는 TC보다 먼저 삭제(그리고 모든
  에뮬레이터를 중지)했기 때문입니다. 이제 러너는 명시적인 단계별 실행 순서를 받습니다(반복 허용; 철자가
  틀리거나 모호하거나 `approved`가 아닌 ID는 exit 2로 중단). 순서 파일은 approved device TC(당시 44개; 아래
  fixture 항목 이후 69개)가 동작하는 순서를 기술하며, 드라이버는 사전 점검(최신 `dist` 번들, `--doctor`,
  하이퍼바이저 검사, 온라인 에뮬레이터 없음), Device Manager 북마크 목록 백업/복원, `test-vm`/`tv-vm` 사전
  정리, `device-manager --profile tv`에 필요한 `tv-vm` 부팅, 그리고 단계가 실패한 뒤에도 실행되는
  teardown을 추가합니다. `npm run test:device`는 이제 그 계획을 출력하고, `--yes`로 실행합니다.
  `tests/README.md`("Device tier")와 `tests/skills/run-test-suite.md`에 문서화했습니다.
- **CI의 safe 티어 TC 회귀 게이트** (`.github/workflows/ci.yml`, `_repo-root/.github/workflows/ci.yml`).
  이제 test 작업이 새로 빌드한 `tizen-sdk` launcher를 대상으로
  `node runner.mjs --tier=safe --status=approved --skip-requires=sdk,net`을 실행하며, `HOME`을 일회용
  디렉터리로 리디렉션해 `sdk-init.explicit-path`가 러너의 실제 `~/.tizen.sdk.path.config`를 건드리지 못하게
  합니다. TC 스키마의 `requires.capabilities`에 `sdk`(설치된 Tizen SDK)와 `net`(`download.tizen.org`로의
  외부 접근)이 추가되었습니다. 이 중 하나가 필요한 safe TC 7개(`list-templates.*`, `sdk-init.happy`,
  `sdk-install.unavailable-version`, `certificate-manager.get-sdk-data-path.happy` /
  `list-profiles.happy`, `validate-repo-url.happy`)가 이를 선언하며, 실패 대신 skip으로 보고됩니다.
  `--skip-requires`는 검사가 아니라 선언이므로, CI 단계는 SDK에 실제로 접근할 수 있으면(`~/.tizen.sdk.path.config`,
  `~/tizen-sdk` 또는 PATH의 `sdb`) 먼저 실패하며, 러너의 요약 줄은 skip을 이유별로 나눠 보여 줍니다.
  `tests/runner.mjs`에 `--skip-requires=<cap,...>`와 `--help`가 추가되었고, 알 수 없는 옵션은 모든 mutating 및
  device TC를 조용히 실행하는 대신 거부합니다(exit 2). `tests/README.md`("CI gate")와
  `tests/skills/run-test-suite.md`에 문서화했습니다.
- **device 티어 fixture 및 fixture에 의존하는 draft TC 승격**
  (`tests/scripts/prepare-device-fixtures.mjs`, `tests/scripts/run-device-tier.mjs --include-drafts`,
  `tests/policy/device-run-order.yaml`, `tests/scripts/lib/driver-common.mjs`). cli-lane device draft 31개는
  Linux `/tmp/...` 파일과, 어떤 호스트에도 없고 플러그인이 지정한 ID로 생성할 수 없는 앱
  (`org.tizen.myapp`, `org.tizen.example.MyApp`, `abcDEF1234.MyWebApp`)을 가리켰습니다. 이제 argv는
  `${FIXTURE_*}` 플레이스홀더를 사용합니다. 새 prepare 스크립트는 `tests/fixtures/apps/` 아래에 native, .NET,
  web fixture 앱을 빌드하고 서명하며(서명 프로필 `myProfile`은 fixture 인증서로 생성되고, 이미 그 인증서를
  사용 중이면 유지되며, `--replace-profile`일 때만 교체됨), push/pull/screenshot/`create-image` TC가 사용하는
  `tmp/` 트리를 구성하고, 테스트 프로젝트에 Playwright를 설치하고, `fixtures.generated.env`를 작성합니다.
  드라이버는 이 파일을 러너 환경에 병합하고 단계마다 게이트를 겁니다(`FIXTURE_NEEDS`,
  `runner-helpers.test.mjs`가 TC 플레이스홀더와 대조 검사). 순서 파일에 `c2-fixture-apps`, `c3-web-debug`,
  `c4-dotnet-debug`, `c5a/b/c-gdb-*`, `c6-stop` 단계가 추가되었고(test-vm은 이제 `c-boot-1`부터 `c6`까지
  부팅 상태 유지), `emulator-manager.create-image`가 `b-vm-lifecycle`에 합류했으며, 드라이버의 인라인 hook은
  `PHASE_HOOKS` 표가 되었습니다. 여기에는 `resetImageDir`, `deviceFixtures`(앱 설치, `/tmp/log.txt` 작성),
  `debugCleanup`(`sdb forward --remove-all`, 모든 디버그 단계 전에 netcoredbg/gdbserver/fixture 앱 종료),
  `resetTestProject`가 있습니다. 전제 조건을 마련하지 못한 hook은 요약에 나열되고 실행을 실패로 만듭니다.
  첫 승격 실행은 14개 단계를 모두 통과했고(18분), fixture에 의존하는 draft 25개 — file-transfer ×5,
  `screenshot.output-path`, `create-image`, webapp-debug ×4, playwright-test ×6, dotnet-debug ×5,
  gdb-debug ×3 — 를 `draft`에서 `approved`로 승격했습니다(스위트: draft 79 → 54, approved 199 → 224;
  approved device TC 44 → 69). draft 6개는 `NOTE`에 이유를 남기고 draft로 유지됩니다.
  `install-app.happy/.run/.serial`은 존재하지 않는 envelope 필드(`device_id`, `process_id`)를 검사하고,
  `gdb-debug.serial`은 `gdb-debug`에 없는 옵션을 전달하며, `remote-device.connect*`는 네트워크로 접근 가능한
  디바이스가 필요합니다. `tests/README.md`("Device tier"), `tests/fixtures/README.md`,
  `tests/skills/run-test-suite.md`에 문서화했습니다.

### 변경

- **두 번째 승격 이후 스위트 상태: 286개 중 draft 22 / candidate 0 / approved 264.**
  guard 규칙 TC 8개(`tc/meta/guard-rules.prompt.yaml`)는 한 번도 실행되지 않은 cli lane을 제거했습니다 —
  approved cli TC와 중복되고, `/tmp` fixture를 가리키며, `safe`로 잘못 분류되어 있었습니다 — 그리고 기록된
  41/41 prompt-lane 실행을 근거로 approved되었습니다. `install-app.happy/.run/.serial`은 envelope에 실제로
  있는 필드(`device_serial`, `app_launched`)를 검사하고 device 단계 `c2-fixture-apps`에서 실행됩니다
  (드라이버의 `deviceFixtures` hook은 이제 .NET 및 web 패키지만 설치합니다). `gdb-debug.serial`은 새 단계
  `c5d-gdb-serial`에서 실행되며, `file-transfer.prompt-pull-missing`은 에이전트 세션에서 실행했습니다.
  `build-project.compiler-flags`는 의도적으로 draft로 유지합니다. 플러그인에 컴파일러 플래그 전달 기능이
  없고 Commander 12가 뒤따르는 토큰을 조용히 버리기 때문입니다.

### 수정

- **`gdb-debug`가 모든 에뮬레이터 이미지에서 `gdbserver not found at /usr/bin/gdbserver`로 실패하던 문제를
  수정했습니다** (`common/scripts/tizen-gdb-debug/tizen-native-gdb-debug.ps1` / `.sh`). Tizen 8 이후의
  에뮬레이터 이미지에는 gdbserver가 없지만, SDK에는 `<sdk>/tools/on-demand/gdbserver_<ver>_<arch>.tar`로
  들어 있습니다. 이제 2단계에서 `which gdbserver`, `/usr/bin/gdbserver` 또는 이전 on-demand 복사본을 찾고,
  없으면 해당 tar를 `/home/owner/share/tmp/sdk_tools/`에 push하고 압축을 풉니다 — `tizen-dotnet-debug`가
  netcoredbg에 이미 사용하는 방식입니다. tar는 디바이스 아키텍처(`armv7l` → `armel`)와 최신 버전 기준으로
  고르며, sdb shell이 원격 종료 코드를 버리므로 `test -x … && echo ok` 검사로 확인합니다. 소스 가드는
  `common/lib/tests/gdb-ondemand-guards.test.js`에 있고, `SKILL.md`, 에이전트 파일, native 디버그
  워크스루에 on-demand 설치를 언급했습니다.
- **`sdk-install --tizen-version 99.99`가 설치되지 않은 플랫폼에 대해 `success` /
  `installation_status: completed`를 보고하던 문제를 수정했습니다** (`common/lib/core/sdk.js`,
  `tizen-sdk-install.ps1` / `.sh`). 이미 설치됨 사전 검사는 이전에 수정했지만, 패키지된 CLI가 설치 프로그램을
  직접 실행하는 분기는 이후 `sdk.info`가 존재하는지만 확인했고, 설치 프로그램 자체의 "이미 설치됨" 단축
  처리는 `-Platform`을 보기 전에 exit 0으로 종료했습니다. 이제 `installSdk()`와 `installSdkFromRepo()` 모두
  설치 프로그램 실행 후 `platforms/tizen-<X.Y>`를 확인하고, 요청한 플랫폼이 없으면
  `platform_version_not_found`(`platform-install` 제안 수정 포함)를 반환합니다. 두 설치 스크립트 모두 설치된
  SDK에 없는 `--platform`이 주어지면 같은 힌트와 함께 exit 1로 종료합니다. 보고서 후속 조치(§4.2).
- **실패한 `sdk-install`이 진단할 정보를 아무것도 남기지 않던 문제를 수정했습니다** — envelope은 763초 후
  `SDK installation failed: \n\n\n\n\n\n\n`이라고만 했고, 로그는 어디에도 없었으며, 같은 명령이 15초 뒤에는
  통과했습니다(§8.3). 메시지가 `stdout || stderr || message`였는데, 공백만 있는 stdout도 참으로 평가되어
  stderr와 종료 코드가 버려졌습니다. 새 `describeInstallerFailure()`(설치 러너 8개 모두에서 사용)는 종료
  코드 / 시그널을 보고합니다. 타임아웃은 타임아웃이라고 명시하고(Node는 이를 `killed`가 아니라 항상
  `code ETIMEDOUT`으로 보고함), 남아 있는 `.install-running` 마커도 설명합니다. 양쪽 스트림의 마지막 출력 줄을
  모두 보고하고(메시지에서는 각각 200자로 제한, `details`에는 전체), 아무것도 캡처되지 않았으면 그렇다고
  알리며, 캡처한 전체 출력을 `$TIZEN_LOGS_DIR`(기본값
  `<tmp>/tizen-sdk-skills-logs/<runner>-<timestamp>.log`)에 기록하고 그 경로를 명시하며, 설치 프로그램의
  `.install.log` / `.install-result`를 안내합니다. `errors[0].details`에도 같은 줄이 담깁니다. 설치
  스크립트는 이제 자체 로그를 남깁니다 — `tizen-sdk-install.ps1`은 `<install>\.install.log`에 transcript를
  기록하고 실패 판정을 stderr에 다시 출력하며, `tizen-sdk-install.sh`는 stderr를
  `<install>/.install.log`에 미러링합니다 — 그리고 성공과 실패 시 모두 경로를 출력합니다.
- **여러 디바이스가 연결된 상태의 `install-app`이 `io_error`(`TIZEN_SDK_IO_E001`)로 분류되고 셸 명령줄을
  노출하던 문제를 수정했습니다** (`common/lib/core/project.js`, §4.2). 형제 명령들은
  `multiple_devices`(`TIZEN_SDK_DEVICE_E002`)를 반환합니다. 이제 `installApp()`은 스크립트 실행 전에 JS에서
  대상 디바이스를 확인하고(명시적 serial, 없으면 정확히 하나의 온라인 디바이스), serial 목록과 함께
  `device_not_found` / `multiple_devices`를 직접 반환합니다. "Multiple devices found"로 인한 스크립트 종료도
  `multiple_devices`로 매핑되며, 일반 설치 실패는 Node의 `Command failed: <full command line>` 대신
  스크립트 종료 코드와 주요 출력 줄을 보고합니다. 새 `classifyInstallFailure()`가 출력→envelope 매핑을
  담당합니다. 문서(`common/agents/tizen-install-app.md`, `tizen-cli/skills/tizen-install-app/SKILL.md`)를
  업데이트했습니다.
- **"Is Node.js installed?"가 prompt 실행 3번 중 1번 일반 `doctor` 점검으로 라우팅되던 문제를
  수정했습니다** (`tizen-sdk.check-node.prompt-*`, §4.2). 두 `check-node` 설명 모두 doctor를 언급하지 않아서
  더 넓은 범위의 명령이 동률에서 이겼습니다. 이제 `tizen-check-node` 스킬 설명(common + tizen-cli),
  `check-node` 명령 설명(`check.ts`), `tizen-sdk` 라우팅 표에 정확한 프롬프트 문구를 담고, Node.js만 묻는
  질문은 `check-node`가 답한다고 명시하며, `--doctor` / core `doctor`는 전체 설정 점검이지 그 답이 아니라고
  분명히 밝힙니다.
- **`playwright-test`가 서로 다른 두 실패에 대해 "Node.js executable was not found on PATH"라고 하던 문제를
  수정했습니다** (`common/lib/core/playwright-test.js`, §4.2). `resolveNodeRuntime()`은 `node`가 없는
  경우(spawn ENOENT)와 `node`는 있지만 `--version`이 비정상 종료한 경우에 같은 문자열을 반환했습니다.
  괄호 안의 `exit N`만이 둘을 구분했기 때문에 잘못된 진단으로 이어졌습니다. 이제 종료 코드, 시그널,
  stderr 끝부분과 함께 `reason`(`not_found` / `spawn_failed` / `timeout` / `exited`)을 반환하고, 새
  `describeNodeRuntimeFailure()`가 구별되는 envelope을 생성합니다. 실행 파일이 없으면
  `node_not_found`("Node.js 설치 / PATH 수정"), 손상된 경우 종료 코드와 stderr를 인용하는
  `execution_error`("Node.js가 PATH에 있지만 실행되지 않음 — 복구/재설치하고, 두 번째 사본을 설치하지
  말 것"), 그리고 타임아웃 변형입니다. 스킬/에이전트 문서에 두 범주를 나열했습니다.
  다섯 가지 모두에 대한 회귀 테스트는 `common/lib/tests/tc-report-followups.test.js`에 있습니다.
- **`device-manager --action stop`이 영원히 멈출 수 있던 문제를 수정했습니다** (`tizen-device-manager.ps1` /
  `.sh`). 최후 수단인 `sdb shell poweroff`는 게스트의 sdbd가 연결은 받지만 응답하지 않으면 반환되지
  않습니다 — 게스트가 멈춘 TV 에뮬레이터, 그리고 에뮬레이터 프로세스가 사라진 뒤에도 sdb가 유지한 행에서
  관찰되었습니다 — 그래서 이 작업이 모든 호출자의 타임아웃(device 티어 TC, 실행 드라이버의 teardown)을
  넘어서까지 블록되었습니다. 이제 이 호출은 디바이스당 15초로 제한되며, 새 Method 5가 sdb 서버를 재시작해
  유령 행을 제거하고, 다시 나타나는 행은 기다리지 않고 그 이름을 보고합니다. Windows에서 최악의 경우는
  이제 약 50초이며, 여유를 두기 위해 `device-manager.stop` TC의 `timeout_sec`을 60 → 120으로 늘렸습니다.
- **`--vm-name` 없는 `launch-emulator`가 Windows에서 이름이 `t`인 VM을 실행하려던 문제를 수정했습니다**
  (`tizen-emulator-manager.ps1`). VM이 정확히 하나일 때 PowerShell이 목록 헬퍼가 반환한 요소 1개짜리 배열을
  단순 문자열로 펼쳤고, `$vms[0]`이 그 첫 글자를 반환했습니다(`No emulator VM named 't' exists`).
  `ConvertTo-VmNames` / `Get-VmList`는 이제 실제 배열을 반환하고 호출부는 이를 `@()`로 감쌉니다. `.ps1`과
  `.sh` 모두에 보강도 함께 추가했습니다. 부팅 직후 온라인 에뮬레이터 행의 이름이 아직 `<unknown>`으로
  표시되는 동안 이미 실행 중 검사가 대기하며(≤15초), em-cli가 실행을 거부했지만 sdb에서 VM이 온라인으로
  보이면 해당 serial을 성공으로 보고합니다. 두 수정의 소스 가드는
  `common/lib/tests/emulator-stop-launch-guards.test.js`에 있습니다.
- **최신 pnpm에서 `pnpm link --global`이 실패하던 문제를 수정했습니다** (`ERR_PNPM_LINK_BAD_PARAMS: You must
  provide a parameter`). pnpm 10은 `--global` 플래그를 제거했고 pnpm 11은 인자 없는 `pnpm link`도
  제거했습니다. 독립 실행형 `tizen-sdk` launcher를 PATH에 넣는 문서화된 방법은 이제 `tizen-cli/`에서
  `pnpm add -g .`입니다(되돌리려면 `pnpm remove -g tizen-cli-plugin-tizen-sdk`).
  `tizen-cli/README*.md`, `docs/tizen-cli/build-and-install*.md`(`ERR_PNPM_LINK_BAD_PARAMS`,
  `ERR_PNPM_NO_GLOBAL_BIN_DIR`, `command not found`에 대한 문제 해결 행), `tests/README.md`, launcher 헤더
  주석, CI 워크플로 주석을 업데이트했습니다.
- **RDS 벤치마크 스크립트 및 문서** (`common/lib/tests/manual/benchmark-rds.js`,
  `docs/rds/RDS_BENCHMARK*.md`, 타이밍 계측 후속 조치). Phase C는 이제 수정한 모든 소스 파일을 복원하고
  (Ctrl+C 시에도), 프로젝트에 마커 파일을 만들지 않으며, `.cs` / `.css` / `.html` / `.xaml`을 다루고, UTF-8
  BOM과 shebang / XML 선언 / doctype 줄을 맨 앞에 유지합니다. 기준 설치가 `--build false`에서 더 이상
  사라지지 않으며, 결과 표는 반복 번호로 행을 찾습니다. 실패한 `install --reset-rds`는 완료로 보고되는
  대신 실행을 중단합니다. 패키지 경로는 추측한 `Debug/<dir>-1.0.0.tpk` 대신 `--package` 또는 빌드
  envelope에서 가져옵니다. 단독 `--build`가 더 이상 다음 옵션을 삼키지 않으며(`--no-build` 추가),
  plugin-cache 대체 경로는 `plugin-cache.js`를 사용합니다. CI 테스트는 Windows에서도 실행되며 빈 단계에서
  계측 오버헤드를 측정합니다. 문서는 Phase C, 실제 환경 변수, 선택적 `--device-serial`, 따옴표를 붙인
  cmd.exe `set "TIZEN_BENCHMARK=1"` 형식, 그리고 전체 설치 시 `rds_timings`가 다루는 범위를 설명합니다.

## [1.3.0] — 2026-09-18

### 추가

- **`tizen-install-app` / `tizen-build-project`의 RDS 빠른 배포** (`common/lib/core/rds/`,
  VS Code Tizen 확장에서 이식했으며 플러그인 경로에는 npm 의존성이 없습니다 — XXH3-128 해셔와
  `picomatch`는 vendoring했고 `fs-walk.js`가 `glob`을 대체합니다). 디바이스에 프로젝트의 Debug
  출력물을 한 번 전체 설치한 뒤에는, `install`이 호스트 기준선(`.tizen-rds/*.json`, 해시는 확장의
  상태 파일과 바이트 단위로 동일)과 현재 빌드 출력물을 비교해 변경된 파일만 설치된 앱에
  push하고(스테이징한 묶음을 `sdb push`, 삭제는 `rm -f`를 묶어서 실행) 앱을 다시 실행합니다.
  변경 사항이 없으면 다시 실행만 합니다. envelope의 `deploy_type`은 `"full"`(일반 `tz install`),
  `"rds"` 또는 `"fast-deploy"`를 보고하며, `build`는 이전에 배포된 적이 있는 프로젝트라면 빌드
  성공 후 빌드 매니페스트를 기록합니다. 적용 조건: native / web / .NET 프로젝트만 해당하며
  (platform/GBS, `.rpm`, `.rpk` 제외), 패키지가 추적 대상 Debug 출력 트리(`Debug/`,
  `bin/Debug/<tfm>/`) 안에 있어야 하고, `tizen-manifest.xml` / `config.xml`이 하나라도 바뀌면 전체
  설치 경로를 탑니다. `TIZEN_RDS_ENABLED=0`으로 기능을 끌 수 있고, `install --reset-rds`는 호스트
  측 `.tizen-rds/` 디렉터리를 삭제하며(`result.rds_state: "reset"`, 삭제할 수 없으면 `io_error`)
  `--run`과 함께 쓸 수 없습니다. `tizen-install-app` SKILL.md 두 변형과 에이전트에 문서화했으며,
  계획과 Tizen 11 실기기 검증 기록은 `docs/rds/RDS_FAST_DEPLOY_PLAN{.en,}.md`에 있습니다.
- **모든 SDK 설치 스크립트에서 패키지 병렬 다운로드.** `tizen-sdk-install`,
  `tizen-sdk-install-custom-repo`, `tizen-platform-install`, `tizen-tv-sdk-install`,
  `tizen-download-emulator-package`, `tizen-download-mobile-platform`, `tizen-update-package`(CLI
  runner, `.sh`와 `.ps1`, `.sh --detach` 경로)에 `--download-jobs <1-8>`(기본값 4)을 추가했습니다.
  패키지를 하나씩 받는 대신 worker pool(`lib/common.sh`의 `download_queue_parallel`,
  `lib/common.ps1`의 `Invoke-ParallelDownloads` Start-Job worker)이 받아 오며, 압축 해제는 디스크
  병목이므로 동시 작업 3개를 유지합니다. 각 다운로드는 `.tmp` 파일로 받은 뒤 ZIP 검증을 통과해야
  이름을 바꾸고, 일시적인 실패는 최대 3회 재시도합니다(robocopy 병합도 종료 코드 8/11/16에서
  `/FFT`와 함께 재시도하며 실패 사유에 로그 끝부분을 포함). 멈춘 PowerShell 다운로드는
  타임아웃(`TimeoutSec`)되고, bash worker는 자체 프로세스 그룹에서 실행되어 INT/TERM/HUP 시 curl
  하위 트리 전체가 종료되며, mkdir 기반 잠금으로 진행 카운터의 경쟁 상태를 막습니다. 스크립트는
  패키지별 진행 상황을 타임스탬프와 함께 출력하고 전체 소요 시간(`format_duration` /
  `Format-Duration`)도 출력합니다.
- 모든 로그 요청의 담당을 하나로 두기 위해 `dlog-analyzer`에 일회성 디바이스 로그 액션을
  추가했습니다. `log-dump [serial] [--filter "<spec> …"] [--lines <n>] [--output <file>]`는 현재
  dlog 버퍼를 한 번 덤프하여(`sdb dlog -d -v threadtime`) envelope에 끝부분을 반환하고 전체 덤프는
  항상 파일로 기록합니다. `log-clear [serial] --confirm`은 버퍼를 지우며(`sdb dlog -c`),
  `--confirm`이 없으면 `user_input_required` + `suggested_fix`로 거부합니다. filterspec은 셸에
  전달되기 전에 검사합니다(`<tag>[:<V|D|I|W|E|F|S>]`). 플러그인 runner(`dlog-analyzer-cli.js`),
  tizen-cli 명령(`--action log-dump|log-clear`, `--filter`, `--lines`, `--output`, `--confirm`),
  SKILL.md 두 변형과 에이전트에 노출했으며, 단위 테스트와 확인 게이트용 `safe` 등급 TC를
  추가했습니다.
- 독립 실행 런처 `tizen-cli/bin/tizen-sdk.js`(`tizen-sdk <command>`)를 추가했습니다. tizen-cli
  호스트 없이 빌드된 플러그인 번들의 `run(args)`를 호출하고 결과를 종료 코드(성공 0, 실패 1)로
  매핑합니다. 패키지 `bin`으로 등록되고 빌드 시 `dist/bin/`에 복사되므로 릴리스 ZIP을
  `node dist/bin/tizen-sdk.js`로 실행할 수 있으며, `dist/`가 없으면 `PLUGIN_NOT_BUILT`를
  보고합니다. `tests/runner.mjs`는 이미 PATH의 `tizen-sdk` 바이너리로 대체 실행합니다. envelope의
  `user_command`(와 인자 없이 실행했을 때의 `usage` 줄)는 이제 사용자가 입력한 접두사를 사용합니다
  — 독립 실행 시 `tizen-sdk`, 호스트에서는 `tizen-cli tizen-sdk` — 이며
  `TIZEN_SDK_USER_COMMAND_PREFIX`로 재정의할 수 있습니다.
- **VS Code 확장: 설치 대상으로 Codex CLI 지원.** `tizenAiExtension.targets`에 `codex`와 `all`을
  추가했고(`both`는 여전히 Claude Code + Cline을 뜻함), `auto`는 `~/.codex`(또는 `CODEX_HOME`)와
  OpenAI의 Codex 확장을 감지합니다. 확장은 Codex에 대해 `common/setup/setup.sh`와 같은 레이아웃을
  기록합니다. 버전별 runner 캐시는
  `~/.codex/plugins/cache/tizen-platform/tizen-sdk-skills/`에, 스킬은 공유 디렉터리
  `~/.agents/skills/`에 설치합니다(사용자 자신의 스킬도 들어 있는 도구 공용 디렉터리이므로 설치
  매니페스트에 기록한 항목만 제거 시 삭제합니다). 에이전트는 번들된 `lib/tools/agent-convert.js`로
  `~/.codex/agents/*.toml`로 변환하고, 두 가드 스크립트와 `~/.codex/hooks.json`(없거나 우리
  `_source` 태그가 있을 때만 기록)을 설치하며, 공유 가드 문서 — 뒤이어 Codex 전용 캐시 루트, 30초
  `--background`, 샌드박스 권한 상승 안내 — 를 `~/.codex/AGENTS.md`의
  `<!-- tizen-sdk-skills:begin/end -->` 마커 사이에 삽입합니다. 마커 처리는 셸 쪽 구현보다
  엄격합니다. 섹션은 begin 줄과 짝이 맞는 end 줄 사이의 텍스트만 해당하므로, end가 없는 begin(손으로
  잘라 낸 파일), begin이 없는 end, 들여쓰기되었거나 문장 안에 인용된 마커는 사용자의 텍스트로
  남겨 둡니다. 깨진 마커 뒤의 내용은 삭제될 수 없고, 완전한 섹션은 그대로 설치되며, 짝이 없는 줄은
  로그에 표시됩니다. 파일 고유의 줄 끝(CRLF 또는 LF)을 유지하고, 중복된 섹션은 하나로 합칩니다.
  Show Install Status는 캐시, 스킬, 에이전트별 TOML 하나씩, hooks.json, AGENTS.md의 네 줄을
  검증하며, Remove와 `vscode:uninstall`은 기록한 내용만 정확히 제거합니다. vscode에 의존하지 않는
  새 모듈 `codexLayout.ts`와 `guardSection.ts`가 경로와 마커 로직을 담당하며, 대상 결정,
  hooks.json 태깅, 섹션 삽입/교체/제거(짝 없는 마커, CRLF, 중복), 임시 HOME에서의
  설치/업그레이드/제거 경로에 대한 단위 테스트를 추가했습니다.

### 변경

- **모든 디바이스/에뮬레이터 로그 요청이 이제 `tizen-dlog-analyzer`로 라우팅됩니다.**
  `sdb-helper`의 `log-stream` / `log-save` / `log-clear` 인텐트는 더 이상 `sdb dlog …`를 만들거나
  실행하지 않고, handoff envelope(`suggested_skill: tizen-dlog-analyzer`)을 반환하며 새로 추가된
  `result.note`에 실행할 dlog-analyzer 액션(`log-dump`, `log-clear --confirm`,
  `start start-monitoring`)을 명시합니다. 트리거 문구("tail the logs", "show logs", "로그 보기",
  "clear logs", "dlog clear", …)는 sdb-helper 스킬/에이전트 설명에서 dlog-analyzer 쪽으로
  옮겼으며, PreToolUse 가드 문구, tizen-cli `tizen-sdk` 라우터 표, 문서도 같은 내용으로
  맞췄습니다. dlog-analyzer 스킬은 두 계층 — 일회성 `log-dump` / `log-clear`와 지속적인
  collect/analyze — 을 문서화하며, "raw sdb 금지" 규칙이 이제 덤프와 지우기에도 적용됩니다.
- `sdb-helper` 로그 인텐트는 셸 블록 다음에 매칭하므로, `tail`이나 `.log` 경로를 언급하기만 하는
  명시적 셸 요청("run shell command tail -n 20 /var/log/messages")은 로그 요청으로 분류되지 않고
  `shell-command`로 유지됩니다.
- `list-templates` envelope은 TV SDK가 설치되어 있으면 — `--type webapp` 같은 타입 지정 호출에서도 —
  `result.tv = { profile, web: [...], dotnet: [...] }`를 포함합니다(스크립트의 새 `TV_PROFILE=` /
  `TV_WEB=` / `TV_DOTNET=` 기계용 출력 줄). `tizen-create-project` 스킬과 에이전트는 이제 웹 앱
  요청("웹앱 만들어줘")에 tizen webapp 템플릿과 함께 Samsung TV **web** 템플릿을 보여 주고, 일반적인
  "타이젠 앱 만들어줘"에는 타입별 목록 옆에 TV 템플릿 전체 목록을 보여 줍니다. `result.tv`가 TV
  SDK 설치 여부의 유일한 근거이며, TV 템플릿을 고르면 `--type tv`로 생성합니다. 일반 목록은
  `result.templates.platform`(`dali-demo` 같은 GBS 샘플)을 별도의 "Platform 앱" 그룹으로
  보여 줍니다. 에이전트의 타입 목록도 다시 여섯 가지 타입을 모두 명시합니다(프롬프트에서 `rpk`가
  빠져 있었습니다).
- PowerShell 패키지 설치 worker(없으면 다운로드 + 항목별 압축 해제 + mutex로 직렬화한 robocopy
  병합 + 매니페스트)와 그 Start-Job 구동 루프를 설치 스크립트마다 있던 거의 동일한 일곱 개의 사본
  대신 `lib/common.ps1`(`Get-PackageInstallWorker`, `Invoke-ParallelPackageInstall`,
  `ConvertTo-DownloadItems`) 한 곳에 두었습니다. tizen-sdk-install의 404 대체 처리와 선택적 RS
  처리는 공유 worker의 매개변수가 되었습니다. 모든 `.ps1`에서 `-ExtractJobs`를 제거했으며(CLI에서
  도달할 수 없었음), 압축 해제 동시성은 이전 기본값인 3을 유지합니다. `sdk.js`는
  `-DownloadJobs`/`--download-jobs` 쌍을 `downloadJobsFlags()` 헬퍼 하나로 만듭니다.
- 셸 명령줄에 삽입되는 값은 호출 지점마다 임시로 따옴표 처리하는 대신 공유 검사 모듈
  `common/lib/core/shell-safety.js` 하나를 거칩니다(`"`, `` ` ``, `$`, `;`, `|`, `&`, `<`, `>`,
  줄바꿈, 끝의 백슬래시는 거부하고 공백, 괄호, 아포스트로피, 비 ASCII 문자는 허용). 이 모듈과 그동안
  테스트가 없던 `envelope/mask-secrets.js`, `cli/password-file.js`에 단위 테스트를 추가했습니다.
- **Samsung 인증서는 TV 대상 전용임을 문서화했습니다.** `tizen-certificate-manager` 스킬(플러그인과
  tizen-cli 변형), 해당 에이전트, build-project 스킬/에이전트, install-app 스킬, 인증서
  가이드/워크스루(en/ko)에 Samsung online-CA 인증서와 `create-samsung-profile` 프로필은 TV
  에뮬레이터(`tizen-tv-sdk-install` 후 `tizen-create-emulator --profile tv`)와 배포자 인증서에
  DUID가 포함된 실제 Samsung TV에서만 유효하다고 명시했습니다. 에이전트는 `generate-samsung-*`
  액션 전에 반드시 대상을 확인해야 합니다. TV 에뮬레이터 / Samsung TV라면 Samsung 흐름, 표준 Tizen
  에뮬레이터라면 (그렇게 안내한 뒤) `generate-author` → `create-profile`, 대상 없이 Samsung 인증서를
  요청하면 대상을 묻습니다. DUID는 TV 대상에서 얻으며, Samsung 서명 패키지를 표준 에뮬레이터에 설치할
  때 발생하는 인증서 오류는 우회할 대상이 아니라 예상된 동작입니다.
- `tizen-dlog-analyzer` 바이너리(Linux, Windows)를 v0.1.2.dev0으로 업데이트했습니다.

### 보안

- **모델이 선택한 값을 통한 셸 인젝션.** 명시적 `--serial`(모든 sdb 명령줄), `create`, `build`,
  `install`의 프로젝트 / 상위 / 패키지 경로, `install-rootstrap`과 `tv-sdk-install-from-zip`의
  `--zip-path`(`suggested_fix.command`로도 반환됨), GDB `--binary` 경로가 큰따옴표 한 쌍만 씌운 채
  `execSync`에 전달되었습니다. 이제 `shell-safety.js`로 검사해 `invalid_parameters`로 거부하며,
  `resolveSerial()`이 모든 호출자를 위해 serial을 한 번 검사합니다.
- Windows에서 `sdb-helper` `shell-command`는 `"`나 `%`가 포함된 디바이스 명령을 거부합니다.
  cmd.exe는 따옴표마다 인용 상태를 전환하고 따옴표 안에서도 `%VAR%`를 확장하므로, 기존의 이스케이프
  없는 보간에서는 요청에 들어 있는 따옴표 하나로 나머지 줄이 호스트에서 실행될 수 있었습니다.
- **오류 메시지에 포함된 인증서 비밀번호.** `tz cert` / `tz security-profiles add` 실패 시 tz의
  stdout/stderr와 — `-p <password>`를 포함한 전체 argv인 — execFileSync의 `error.message`가
  envelope에 복사되었습니다. 이제 해당 메시지에서 비밀번호 값을 마스킹합니다(필드 이름 기반
  마스킹으로는 문자열 내부를 볼 수 없음).
- `mask-secrets.js`가 camelCase 비밀 접미사(`clientSecret`, `sessionToken`, `userPass`)도
  인식합니다. 이전에는 camelCase 필드를 정확한 이름 목록에 수동으로 추가한 경우에만 마스킹했습니다.
- 분리 실행(`--background`) 작업의 stdout/stderr 파일은 0600으로 생성되며, 출력이 평문 비밀번호인
  `samsung-reveal-password`는 `--background`를 거부합니다.
- **PreToolUse 가드 훅: git 접두사 우회.** `is_git_command`는 (`cd`/`VAR=` 접두사 이후) 첫 토큰이
  `git`/`gh`이면 명령줄 전체를 예외 처리했기 때문에, `git --version && <anything>`으로 모든 규칙을
  건너뛸 수 있었습니다. 이제 두 훅 모두 인용되지 않은 `&&`/`||`/`;`/`|`/줄바꿈으로 분리하며(따옴표는
  존중, 리다이렉션은 제외) 모든 단순 명령이 git/gh, `cd` 또는 단순 대입일 때만 예외 처리합니다.
  `hooks.test.sh`에 부정 사례를 추가했습니다.

### 수정

- **RDS 빠른 배포 보강.**
  - 디바이스 셸 인자: `sdb shell`은 argv를 디바이스의 `/bin/sh`로 다시 파싱하므로, RDS가 구성하는
    모든 디바이스 경로를 엄격한 허용 목록(`rds/device-shell.js`)으로 검증하고 `rm -f`나 `cat`에
    전달하기 전에 작은따옴표로 감쌉니다. 이전에는 `;`, `$`, 백틱만 거부했기 때문에, 삭제된
    `my icon.png`가 두 단어로 나뉘고(상태에는 삭제가 기록되었지만 `rm -f`는 조용히 실패),
    `pages/[id].js`가 glob으로 확장되었으며, `|` / `>`가 root로 실행되었습니다. 매니페스트 패키지
    ID는 설치 스크립트가 이제 앱 ID에 사용하는 것과 같은 `[A-Za-z0-9._-]` 문자 집합으로 검사합니다.
  - Wi-Fi 디바이스: 스테이징 디렉터리 이름을 serial로 지었는데 TCP serial(`192.168.0.10:26101`)에는
    Windows에서 허용되지 않는 `:`가 들어 있어 `mkdirSync`가 실패했고 RDS가 조용히 동작하지
    않았습니다. 이제 `mkdtempSync` 디렉터리를 사용합니다.
  - `[RDS] …` 진행 메시지가 JSON envelope 앞에 stdout으로 출력되어 모든 소비자의 `JSON.parse`를
    깨뜨렸습니다. 이제 stderr로 출력합니다.
  - 다중 디바이스 상태: 디바이스 B에 전체 설치하면 변경 내역을 기록하지 않고 공유 기준선을 다시
    생성했기 때문에, 디바이스 A의 다음 설치는 새 기준선을 자기 자신과 비교해 차이가 없다고 판단하고
    오래된 파일로 실행하면서 아무 작업 없는 `fast-deploy`를 보고했습니다. `updateRdsState()`는
    먼저 조정(reconcile)을 수행하고 그 차이를 다른 디바이스가 여전히 받을 수 있는 번호 붙은
    changelist 그룹으로 승격합니다. reconcile은 중단된 시도의 오래된 항목을 덧붙이는 대신 대기 중인
    `next` 그룹을 교체합니다. 그룹을 승격하기 전에 `deploy-state.json`을 커밋하므로 크래시가 나도
    `deployId`가 재사용되지 않으며, 상태 쓰기는 원자적(tmp + rename)이어서 잘린
    `deploy-state.json`이 더 이상 `null`로 읽혀 프로젝트를 다시 초기화하고 다른 모든 디바이스의
    그룹을 지우는 일이 없습니다.
  - 호스트 상태보다 _뒤처진_ 디바이스 마커(에뮬레이터 스냅샷 복원, 재플래시, 공유 serial)도 앞선
    마커처럼 거부합니다(`marker-behind`). 이전에는 디바이스가 받지 못한 그룹을 모두 건너뛰었습니다.
    `getAppInstallPath`의 3/4단계는 `sdb shell test -d`의 실패에 의존했지만, sdb는 원격 상태와
    관계없이 0으로 종료하므로 3단계가 항상 "성공"했습니다. 이제 프로브는
    `test -d X && echo <marker>`이고 stdout에서 마커를 확인합니다.
  - RDS는 패키지가 스캐너가 추적하는 Debug 출력 트리 안에 있을 때만 동작합니다. 이전에는
    Release/Test 패키지를 설치하면 실제로 설치하지 않은 채 `fast-deploy`로 단락되었습니다.
    `tizen-manifest.xml` / `config.xml`을 건드리는 변경분은 항상 `full`입니다(파일을 push해서는
    권한, app-control, 앱 ID를 다시 등록할 수 없음).
  - RDS 성공 envelope의 `app_id`는 매니페스트 _패키지_ ID였던 반면 전체 설치 경로는 실행 가능한
    앱 ID를 보고했습니다. 이제 둘 다 `<tizen:application id>` / `<ui-application appid>`를
    읽습니다(`parseWebAppId()` / `parseManifestAppId()`). 명시적 `--device-serial`을 쓰면 RDS
    기본 동작이 세션의 첫 sdb 호출이 되어, 파이프를 상속한 콜드 데몬에서 멈출 수 있었습니다.
    `installApp()`이 먼저 `sdb start-server`(`sdb.js ensureSdbServer`)를 실행합니다. Windows
    호스트에서 push한 파일은 디바이스에 `0777 root:root`로 도착하므로, `pushDeltaFiles()`가 root
    상태에서 `chmod go-w`를 실행해 설치 프로그램의 `-rw-r--r--`와 맞춥니다. 두 개의 깊이 우선
    탐색기를 BFS `findFiles` 하나(가장 얕은 일치 우선, `node_modules` / `bin` / `obj` 제외)로
    대체했으므로, `MyApp.Tests/*.csproj`가 더 이상 `MyApp/MyApp.csproj`보다 우선하지 않고 빌드된
    .NET 프로젝트의 `tpkroot/tizen-manifest.xml` 사본을 소스 매니페스트로 착각하지 않습니다.
  - `--reset-rds`는 `.tizen-rds/`를 삭제하지 못했을 때(잠긴 파일) 성공이라고 주장하는 대신
    `io_error`를 보고합니다. 새 `rds-device-shell.test.js`, deploy-service / sdb /
    app-install-path 사례, 5 MiB 스트리밍 해시 일치 테스트를 추가했습니다. POSIX fake-sdb fixture를
    실행하는 테스트는 win32에서 건너뜁니다(Windows 체크아웃을 WSL에서 실행할 수 있도록 LF로 고정).
- **병렬 다운로드/압축 해제 보강.**
  - `download_queue_parallel`(lib/common.sh)이 처음 실행할 때는 존재하지 않는 잠금 디렉터리에
    대해 단순 `rmdir`를 실행했습니다. 호출자의 `set -euo pipefail` 아래에서 이로 인해
    `tizen-platform-install.sh`, `tizen-tv-sdk-install.sh`, `tizen-download-emulator-package.sh`,
    `tizen-download-mobile-platform.sh`, `tizen-update-package.sh`가 worker 하나 시작하기 전에
    중단되었습니다(`if !` 안에서 함수를 호출하는 `tizen-sdk-install.sh`만 살아남았습니다). 또한 빈
    큐를 처리하고, 호출자의 INT/TERM/HUP trap을 지우는 대신 복원하며, `set -u` 아래에서 비어 있을 수
    있는 배열을 더 이상 확장하지 않습니다(bash < 4.4 / macOS).
  - `tizen-update-package.{sh,ps1}`에서 마커가 기록하는 결과 줄이 사라졌습니다. bash는 업데이트
    성공 후 `RESULT_LINE: unbound variable`로 종료했고(마커 미기록), PowerShell은 `sdk.js`가 파싱할
    수 없는 빈 `Result:`를 기록해 업데이트가 끝없이 다시 실행되었습니다.
  - 재개 실행 시 모든 패키지를 다시 다운로드한 뒤에야 건너뛰었습니다. 이제 모든 설치 스크립트(.ps1과
    .sh)에서 재개 / 동일 버전 / 메타 패키지 필터를 통과한 패키지로 다운로드 큐를 만듭니다.
  - `Invoke-ParallelDownloads`가 빈 항목 목록을 거부했고(모든 패키지가 최신인 `update-package`),
    `Format-Duration`은 버림 대신 반올림했으며(2m40s가 `3m 40s`로 출력),
    `tizen-download-mobile-platform.ps1`은 32비트 IOT pkg_list 대체 처리 주변에서 한 번도 할당되지
    않은 `$iotZip`을 검사했고, `tizen-sdk-install.sh --detach`는 `--download-jobs`를 전달하지
    않았습니다.
  - sdk CLI runner에 잘못된 `--download-jobs`를 넘기면 Node 스택 트레이스가 그대로 출력되었습니다.
    이제 stderr에 `invalid_parameters` 사용법 envelope을 출력하며(종료 코드 1), custom-repo runner도
    다른 runner와 같은 검증기를 사용합니다. 셸 스크립트는 패키지 목록을 다운로드하고 해석한 뒤가
    아니라 인자를 파싱할 때 값을 검증합니다.
  - Start-Job 다운로드/압축 해제 worker는 이제 TLS 1.2를 직접 활성화하며(자식 powershell.exe는
    부모의 `ServicePointManager` 설정을 상속하지 않음), 타임아웃된 worker가 남긴 abandoned 병합
    mutex 때문에 다음 패키지를 실패시키지 않고 이를 허용합니다.
- `create-project` / `list-templates`: TV 확장이 최신 플랫폼이 아닌 다른 `tizen-X.Y` 플랫폼 아래에
  있으면 — 예: tizen-11.0이 활성이고 TV 확장은 tizen-10.0에 있는 경우 — Samsung TV SDK가 "설치되지
  않음"으로 보고되었습니다(`--type tv`에 `template_not_found`, 타입 미지정 목록에 `tv:` 블록 없음).
  이제 두 스크립트 쌍 모두 활성 프로필의 폴더만 보는 대신 각 `tv-samsung-*` 프로필을
  `platforms/tizen-<ver>/tv-samsung` 또는 `platforms/tv-samsung-<ver>`(최신 우선)에 대해
  확인합니다. TV 템플릿 이름은 통째로 가져옵니다(공백이 있는 이름의 뒷부분이 더 이상 잘리지
  않습니다).
- `tizen-certificate-manager`(SKILL.md와 에이전트): "직접 명령 실행" 옵션이 Windows 사용자에게 Bash
  locate 블록이 반환하는 MSYS 경로(`/c/Users/...`)를 전달했습니다. 이를 cmd.exe나 PowerShell에
  붙여 넣으면 Node가 `C:\c\Users\...`로 해석해 `MODULE_NOT_FOUND`로 실패했습니다. 이제 문서는
  해석된 경로를 `cygpath -w`로 변환해 cmd.exe, PowerShell, Git Bash 모두에서 동작하는 큰따옴표로
  감싼 `C:\Users\...` 형식으로 전달하도록 요구하며, 기존 Linux 예시 옆에 Windows 예시를
  추가했습니다.
- `emulator-manager-cli.js` / `manageEmulator()`는 복수형 `list-vms`, `list-platforms`,
  `list-templates`를 단수형 em-cli 액션의 별칭으로 받아들입니다. 프로젝트 runner의 액션이 복수형
  `list-templates`이다 보니 호출자가 여기서도 `list-vms`를 추측해 `Unknown action: list-vms`를
  받았습니다. 이제 `normalizeAction()`이 복수형을 em-cli 표기로 매핑하며(envelope의 `command`는
  정식 액션을 보고), 지어낸 액션은 여전히 거부합니다. 단위 테스트로 별칭과 알 수 없는 값의
  통과 처리를 검증합니다.
- `https-proxy-agent`를 루트 패키지의 런타임 의존성으로 선언했습니다. `samsung-api.js`는 Samsung
  online-CA 호출을 `HTTPS_PROXY`로 터널링하기 위해 이를 선택적으로 로드하는데, 없으면 클라이언트가
  조용히 직접 연결로 대체되어 사내 프록시 환경에서 `samsung-login`과 `generate-samsung-*`가
  실패했습니다.
- `check-project-writes.sh`는 같은 줄에 `config.xml`이 함께 등장하기만 해도 `touch`/`New-Item`/
  `tee`/`Set-Content`를 거부했습니다(예: 매니페스트를 읽으면서 마커 파일을 touch하는 경우). 이제
  쓰기 명령이 프로젝트 파일 자체를 지정해야 거부합니다.
- Samsung TV 이미지(TV 에뮬레이터, 실제 TV)에서 `tizen-install-app --run`: 설치 스크립트는 non-root
  TV 셸에서 빈 결과를 내는 `app_launcher -l`에 의존하는 대신 패키지 매니페스트(`.wgt` `config.xml`
  `<tizen:application id>`, `.tpk` `tizen-manifest.xml` `appid`)에서 실행 가능한 앱 ID를 읽습니다
  — 이전에는 envelope의 `app_id`가 `null`이었고 실행을 시도조차 하지 않았습니다. 어떤 출처에서 온
  ID든 디바이스 셸 명령에 전달되기 전에 Tizen ID 문자 집합(`[A-Za-z0-9._-]`)으로 검사합니다.
  `app_launcher -s`가 `successfully launched`를 출력하지 않으면 TV 런처
  `0 was_execute <app-id>`로 다시 실행을 시도하며, 해당 앱 자신의
  `app_id[<id>] launched` / `resumed` 줄이 있을 때만 성공으로 인정합니다.
  이 경우 `app_running`은 `null`로 남습니다(`-S`도 아무것도 출력하지 않음). `tizen-sdb-helper`의
  `launch` 인텐트에도 같은 대체 처리(`runWithFallbacks`의 `fallbacks` + `accept` 조건자)를
  추가했습니다. SKILL.md에는 문서화되어 있었지만 runner에는 구현된 적이 없던 기능입니다. 두
  SKILL.md 변형(`common/skills`, `tizen-cli/skills`) 모두 대체 처리를 설명합니다.
- `tizen-screenshot`의 컨트롤 패널 제거가 Samsung TV 에뮬레이터에서 실제 화면을 잘라 냈습니다.
  호스트 측 캡처의 컨트롤 패널 휴리스틱(`tizen-screenshot.ps1`/`.sh`)은 회색조로 보이는 열이
  연속되는 구간을 찾아 버릴 영역을 감지하는데, 그런 구간은 모두 좁은 사이드바라고 가정합니다. TV
  스킨에서는 앱 자체의 밝은 배경이 창 너비 대부분에 걸쳐 이 조건을 만족해, 휴리스틱이 실제 16:9
  화면을 버리고 그 옆의 좁은 리모컨 그래픽만 남겼습니다. 이제 감지된 영역이 창 너비의 절반 미만일
  때만(`max_panel_fraction = 0.5`) 컨트롤 패널로 취급하며, 그보다 넓게 일치하면 잘라 내기를
  건너뛰고 실제 화면을 버리는 대신 전체 캡처를 유지합니다. 이 기준은 배포되는 스킨에서
  나왔습니다. 가장 작은 1/4x 배율에서 TV 리모컨은 480 px 화면 옆의 134 px이고, 일반 스킨의 키 창은
  320 px HD720 화면 옆에 있으므로, 실제 패널은 창 너비의 절반에 한참 못 미치는 반면 "패널"로
  일치한 밝은 앱 화면은 창의 대부분을 차지합니다. Python 후처리 블록은 이제
  `tizen-screenshot.sh`와 `.ps1`에서 바이트 단위로 동일하며,
  `common/lib/tests/screenshot-postprocess.test.js`가 이 동일성과 임계값을 고정하고 (Python +
  Pillow가 있으면) 합성한 TV, 분할 패널, 1/4x 오른쪽 가장자리 패널, 어두운 베젤 캡처에 대해 블록을
  실행합니다. 스킬의 CLI runner 헤더는 이제 다른 모든 스킬처럼 Windows Claude Code(Git Bash)를
  Bash 블록으로 안내합니다 — bash에서 PowerShell 블록을 `powershell -Command "..."`로 감싸면
  bash가 `$CLI`/`$env:USERPROFILE`을 먼저 확장해 PowerShell이 결과를 파싱하지 못했습니다.

## [1.2.0] — 2026-09-10

설치 시 훅 자동 병합, `launch` 기반 .NET 디버깅, PowerShell 설치 스크립트의 RPM 지원 동등화,
Windows em-cli 수정을 포함합니다.
[Samsung/tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills)에서 배포한 첫 릴리스입니다.

### 추가

- 설정 스크립트가 이제 PreToolUse 가드 훅을 호스트의 `settings.json`에 자동으로 병합합니다
  (`common/lib/tools/merge-hooks-json.js`). 이전에는 손으로 붙여 넣을 스니펫만 출력했습니다.
  다른 항목은 보존하고 이 플러그인의 오래된 항목은 교체하며, 파일의 들여쓰기와 줄바꿈 형식을
  유지하고, 수정 전 원본 `settings.json.tizen-backup`을 한 번만 기록합니다. Gemini CLI는 같은
  생성기로 수동 스니펫을 출력합니다.
- `remote_path_not_found` (`TIZEN_SDK_IO_E003`) — 디바이스에 없는 파일을 `sdb pull`하면 재시도하지
  말라는 수정 안내와 sdb 자체의 "No such file" 줄을 함께 보고합니다.
- 가드 규칙 16은 `which` / `where` / `find`로 `sdb` 바이너리를 찾는 것을 거부합니다. 러너가 직접
  찾습니다.
- 에뮬레이터 실행 결과 필드 `timeout_sec`, `waited_ms`, `emulator_keeps_running`을 추가했습니다.

### 변경

- **.NET 원격 디버깅의 기본값이 `attach`에서 `launch`로 바뀌었습니다.** Tizen에는 CoreCLR 디버그
  전송 계층이 없어 실행 중인 프로세스에 attach할 수 없습니다. 공용 `resolve_app_id` /
  `Resolve-AppId` 헬퍼는 app id를 알 수 없으면 설치된 앱 목록과 함께 실패하고, `launch_app` 출력을
  캡처하며, envelope은 "suspended before Main(), no window until F5"를 맨 앞에 표시합니다.
- `tizen-sdb-helper`를 러너 우선("ROUTE HERE FIRST")으로 재작성했습니다. `tizen-remote-device`는
  "connect to <ip>"만으로도 트리거되며, `tizen-playwright-test`와 `tizen-webapp-debug`에는
  "Inputs — how to obtain (no sdb)" 섹션을 추가했습니다.
- 에뮬레이터 `--timeout`은 수명이 아니라 대기 상한임을 문서화했습니다. 러너가 반환한 뒤에도
  에뮬레이터는 계속 실행됩니다.
- 인증서 비밀번호를 명령줄로 전달하면 이제 노출 경고를 표시합니다.
- Codex 샌드박스: 프로젝트 `list-templates` / `create`를 권한 상승 목록으로 옮겼습니다(샌드박스
  안에서 실행하면 웹 템플릿이 있는 SDK에서도 0개로 나열됨). 또한 `sandbox.js`가 러너 자체의 증상
  문구를 인식하므로, 샌드박스에 막힌 호출은 `escalate: true`와 함께 `sandbox_blocked`를 받습니다.

### 수정

- Windows: `Invoke-EmCli`가 `$null` 종료 코드를 반환하고 출력을 파이프라인 대신 콘솔에 써서
  **정상적인 em-cli 호출이 모두 실패로 보고**되었습니다("produced no output at all"). 1.1.2 em-cli
  강화 작업에서 생긴 회귀이며, 같은 수정을 `tizen-device-manager.ps1`에도 적용했습니다.
- PowerShell 설치 스크립트가 Bash 버전처럼 GBS(Platform) 빌드로 만든 `.rpm` 패키지를 지원합니다.
  push, `sdb root on`, `rpm -ivh --force`(실패 시 `-Uvh`로 재시도), Wayland / XDG / DBus 환경으로
  `owner` 권한에서 `/usr/bin/<name>` 실행, `rpm -q`로 검증하는 순서입니다. RPM 플랫폼 앱은 이제
  `APP_RUNNING=yes|no`를 보고하므로 envelope에 더 이상 `app_running: null`이 표시되지 않으며,
  문서에 `.rpm`이 실행 가능한 패키지임을 명시했습니다.
- 분리 실행(detached) 작업이 스크립트 `child_pid`를 래퍼 소유의 `<id>.child` 사이드카 파일에
  기록하고 `readJobMeta()`가 이를 병합합니다. 이로써 빠른 호스트에서 child pid와 로그 파일이
  유실되던 read-modify-write 경쟁 상태를 해소했습니다.
- 존재하지 않는 원격 파일을 `sdb pull`해도 더 이상 반복하지 않습니다. 원격 경로의 Windows
  백슬래시는 거부하지 않고 정규화하며(`screenshot`에도 적용), `push`는 로컬 경로를 먼저 확인합니다.
- 훅 자동 병합 후속 수정: 이름 변경 이전의 `hooks/tizen-sdk-agents` 디렉터리는 `settings.json`
  병합이 성공한 뒤에만 삭제합니다(스니펫 폴백 시 삭제하면 업그레이드 전에 동작하던 훅이 깨졌음).
  `claude validate`는 세 가드 스크립트를 모두 검사합니다. `common/hooks/check-` 마커는 정확한 가드
  이름에만 일치하므로 관련 없는 사용자 훅을 자기 것으로 간주해 제거하는 일이 없습니다. CRLF / LF
  줄바꿈도 보존합니다.

### 문서

- 쌍을 이루는 SKILL.md 파일 29개를 각 러너와 대조해 점검했습니다: `--arch` 기본값 `x86_64`, GDB
  `--port` 5039, `--platform-version` 필수, screenshot 기본 출력과 결과 필드, rootstrap 메타데이터
  출처, `sdb forward --remove` 게이트, device-manager `--vm-name`, 빌드 실패 진단 위치. tizen-cli
  스킬 네 개에 RPK 지원을 맞췄고, GBS가 `.tpk`를 만든다고 적은 tizen-cli 문서를 바로잡았습니다.
- 스킬 / 에이전트 / 명령 개수를 트리와 일치시켰습니다(스킬 29개, 에이전트 24개, 명령 34개,
  tizen-cli 스킬 31개). 두 README에 행마다 재측정 명령을 담은 "Project at a Glance" 표를
  추가했습니다.

## [1.1.2] — 2026-09-10

Codex CLI 호스트와 Windows 11 24H2 관련 수정입니다.

### 추가

- Codex 샌드박스 인식(`common/lib/core/sandbox.js`). Codex의 기본 `workspace-write` 샌드박스는
  TCP 소켓과 워크스페이스 밖 쓰기를 차단하고, Linux에서는 exec 호출이 끝나면 분리 실행 작업을
  종료합니다. 샌드박스 안에서 `--background`와 `job-cli.js run --script`는 `sandbox_blocked`
  (`TIZEN_SDK_SANDBOX_E001`)로 거부되며, 권한 상승으로 다시 실행하라는 `suggested_fix.command`가
  함께 제공됩니다. 샌드박스 안의 작업이 사라지면 `sandbox_job_lost`(`TIZEN_SDK_SANDBOX_E002`)이고,
  샌드박스 안의 그 밖의 모든 실패에는 경고가 붙습니다. 가드 규칙 12와 모든 디바이스 / 에뮬레이터 /
  인증서 / 디버그 스킬의 Codex 단락에 권한 상승으로 실행해야 하는 항목을 명시했습니다.
  `TIZEN_SANDBOX=on|off`로 감지를 재정의할 수 있습니다.
- OS나 샌드박스가 인증서 프로필 쓰기를 거부하면 `permission_denied`(`TIZEN_SDK_IO_E002`)를 보고하며,
  해당 파일과 권한 상승 재실행 방법을 알려 줍니다.
- `tizen-sdb-helper` 에이전트 정의(단일 sdb 동작: launch / kill, 로그 tail, shell, 포트 포워딩,
  reboot)를 추가해 에이전트가 24개가 되었습니다.

### 수정

- `wmic`이 없어진 Windows 11 24H2에서 `check-disk-space`와 SDK 설치 사전 검사가 더 이상 "0 GB
  free"를 보고하지 않습니다. 탐지 순서는 statfs → PowerShell `Get-PSDrive` →
  `fsutil volume diskfree` → `wmic`(POSIX에서는 `df`)이며, 어떤 방법으로도 드라이브를 측정할 수
  없으면 설치를 막지 않고 경고 후 진행합니다. `check-node`는 샌드박스된 셸 PATH로
  `node --version`을 실행하는 대신 러너를 실행 중인 인터프리터를 신뢰합니다.
- SDK 설치 스크립트가 확정된 설치 경로를 명시적으로 전달받습니다(`--path` / `-Path`). 경로 결정
  순서는 `~/.tizen.sdk.path.config` → `TIZEN_SDK_PATH` → `~/tizen-sdk` → OS 기본값이며, Tizen
  Studio 트리를 가리키는 `TIZEN_SDK_PATH`는 무시하므로 tizen-sdk가 더 이상 `~/tizen-studio`에
  풀리지 않습니다.
- `list-templates`가 tizen-10.0을 하드코딩하지 않고 설치된 `tizen-X.Y` 프로필을 감지합니다. 요청한
  유형의 목록이 비어 있으면 status success와 함께 `{"webapp": []}`를 반환하는 대신, 프로필과 수정
  방법을 알려 주는 `template_not_found` 실패로 처리합니다.
- `tz cert`가 `.pwd` 비밀번호 사이드카를 만들지 않으면 `generate-author`가 직접 기록합니다(mode
  0600, 덮어쓰지 않음). 빌드 사전 검사는 author 인증서에 사이드카도 저장된 비밀번호도 없는 프로필을
  거부합니다. Codex에서는 Samsung Account 브라우저 로그인을 권한 상승된 분리 실행 작업으로
  문서화했으며, 로그인 URL은 진행 상황으로 전달합니다.
- 에뮬레이터 매니저: em-cli 실패를 더 이상 모두 Java / JNA 크래시로 보고하지 않습니다. em-cli 원본
  출력을 구분해 그 텍스트만 분류하고, 출력 없는 종료는 종료 코드와 함께 차단되었거나 멈춘 JVM으로
  설명합니다. 읽기 전용 em-cli 호출은 120초로 제한하며(`TIZEN_EMCLI_TIMEOUT` /
  `TIZEN_EMCLI_TIMEOUT_MS`, exit 124), Windows에서는 모든 em-cli 호출을 상속된 콘솔 대신 파일로
  리디렉션한 stdio로 실행합니다. 상속된 콘솔 때문에 `list-vm`이 러너의 30분 상한까지 멈춰
  있었습니다. 실행 경로에서 `list-vm`이 실패하면 "VM 없음"이 아니라 실패로 처리합니다.
- 설치 스크립트가 더 이상 `sdk.info`에 `# Tizen SDK Configuration` 주석 헤더를 쓰지 않습니다. 이
  헤더가 Tizen CLI의 속성 파서를 망가뜨려 `tizen package -t rpk`가 실패했습니다. 헤더나 UTF-8 BOM이
  있는 기존 설치는 빌드 전과 `sdk-install` 재실행 시 `repairSdkInfo()`가 복구합니다.
- 가드 규칙 9는 디버거 포트 포워딩만 거부합니다. 일반 `sdb forward`, `--list`, `--remove`는 다시
  허용됩니다.
- `device-manager-cli.js stop`(`--action stop`)이 "Invalid timeout: stop"으로 실패하지 않고 정상
  동작합니다.
- `install-rootstrap`이 타임스탬프 형식뿐 아니라 SDK 저장소의 rootstrap 정의 이름(`*.core.xml`)도
  받아들입니다.
- `update-package`가 `.package-update-result` 마커를 기록하므로, Phase 1 재실행 시 항상 런처
  envelope을 반환하는 대신 실제 결과를 보고합니다.
- `resolveSdkDataPath()`가 설정된 디렉터리를 사용하기 전에 SDK인지 확인합니다. 이전에는 SDK가 없는
  머신에서 존재하지 않는 `~/tizen-sdk-data`로 결정되고 성공을 보고했습니다. 이제 오래된 설정은
  PATH의 `sdb`를 통해 복구합니다.

### 변경

- 인증서 모듈이 `sdb` 바이너리 위치 대신 `~/.tizen.sdk.path.config`에서 SDK 루트를 결정하므로,
  기본이 아닌 드라이브나 디렉터리에 설치된 SDK에서도 동작합니다.
- `tizen-screenshot`이 공통 "항상 envelope 표시" 규칙을 따르며, base64 이미지는 자리표시자로
  대체합니다.

## [1.1.1] — 2026-09-09

### 변경

- `Samsung/tizen-agent-skills`에서의 첫 공개 릴리스입니다. 내부 미러 URL, 호스트 이름, 개인 경로를
  코드, 문서, 픽스처에서 제거했으며, 비공개 SDK 미러는 이제 `--repo-url`로 명시적으로 전달합니다.
- CI / 릴리스 워크플로, 이슈 템플릿, Claude Code 마켓플레이스 매니페스트를 저장소 루트로
  옮겼습니다(여기서는 `_repo-root/` 아래에 준비). 릴리스 태그에는 `tizen-sdk-skills-` 접두사를
  붙입니다.

### 추가

- 번들된 `tizen-dlog-analyzer` 바이너리를 포함한 서드파티 저작자 표시를 담은 `NOTICE`를
  추가했습니다(`common/tools/tizen-dlog-analyzer/NOTICE.md` 참고).
- 소스 파일에 SPDX 라이선스 헤더를 추가했습니다.

## [1.1.0]

### 추가

- 동일한 `common/` 설정 구현을 공유하는 Codex CLI 및 Gemini CLI 하네스를 추가했습니다.
- `tizen-sdk-install-custom-repo` — 사용자가 지정한 패키지 저장소 URL에서 SDK를 설치합니다(다운로드
  전에 `pkg_list_{OS}-{64,32}`로 검증).
- 미리 빌드된 분석기 바이너리(Linux / Windows) 기반의 `tizen-dlog-analyzer` 스킬과 에이전트를
  추가했습니다.
- `tizen-playwright-test`, `tizen-remote-device`, `tizen-screenshot`, `tizen-sdb-helper` 스킬을
  추가했습니다.
- 모든 에이전트의 최종 메시지에 Standard JSON Envelope을 필수로 포함합니다.

### 변경

- `tizen-ai-plugins` 모노레포 안의 `tizen-sdk-agents`에서 `tizen-sdk-skills`로 이름을 바꿨습니다.
  플러그인 id, 캐시 경로, tizen-cli 명령, 환경 변수 이름이 모두 바뀌었습니다 — `README.md`의
  마이그레이션 표를 참고하세요.

## [1.0.0]

- VS Code 확장(`vscode/CHANGELOG.md`)과 Claude Code / Cline / tizen-cli 하네스의 첫 릴리스입니다.

[Unreleased]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.4.2...HEAD
[1.4.2]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.4.1...tizen-sdk-skills-v1.4.2
[1.4.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.4.0...tizen-sdk-skills-v1.4.1
[1.4.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.3.1...tizen-sdk-skills-v1.4.0
[1.3.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.3.0...tizen-sdk-skills-v1.3.1
[1.3.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.2.0...tizen-sdk-skills-v1.3.0
[1.2.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.2...tizen-sdk-skills-v1.2.0
[1.1.2]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.1...tizen-sdk-skills-v1.1.2
[1.1.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.0...tizen-sdk-skills-v1.1.1
[1.1.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.0.0...tizen-sdk-skills-v1.1.0
[1.0.0]: https://github.com/Samsung/tizen-agent-skills/releases/tag/tizen-sdk-skills-v1.0.0
