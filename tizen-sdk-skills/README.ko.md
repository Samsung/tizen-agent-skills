# tizen-sdk-skills

**Claude Code**, **Cline**, **Codex CLI**, **Gemini CLI**, **tizen-cli**를 위한 Tizen SDK
자동화 플러그인 — SDK 설치, 프로젝트 생성, 빌드, 디바이스 관리, 앱 설치, 원격 디버깅
(GDB / netcoredbg / CDP), 인증서 관리, Playwright 테스트를 자동화합니다.

이 저장소는 `tizen-ai-plugins` 모노레포 안에서 `tizen-sdk-agents`라는 이름으로 배포되던
플러그인을 독립시킨 것입니다. 플러그인 ID, 캐시 경로, tizen-cli 명령, 환경 변수가 모두
바뀌었습니다 — [tizen-sdk-agents에서 마이그레이션](#tizen-sdk-agents에서-마이그레이션)을 참고하세요.

## 프로젝트 수치

2026-09-10, v1.2.0 기준 실측값입니다. 각 행은 마지막 열의 명령으로 다시 측정할 수
있으며, 스킬·에이전트·커맨드·테스트 스위트가 추가될 때마다 이 표를 갱신합니다.

| 항목 | 수치 | 재측정 방법 |
|------|------|-------------|
| 하네스 | 6 — Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli, VS Code 확장 | `ls common/setup/hosts` (dot-dir 호스트 4 × sh/ps1) |
| 스킬 (`common/skills/`) | 29개 (+tizen-cli 전용 2개 → `tizen-cli/skills/`는 31개) | `ls -d common/skills/*/ \| wc -l` |
| 에이전트 (`common/agents/`) | 24개 | `ls common/agents/*.md \| wc -l` |
| tizen-cli 커맨드 | 34개, command-spec 도메인 8개 | `node -e "console.log(require('./tizen-cli/plugin.json').commands.length)"` |
| 에러 코드 | envelope 레지스트리 59개 | `node -e "console.log(Object.keys(require('./common/lib/envelope/envelope.js').ERROR_CODES).length)"` |
| 가드 훅 | PreToolUse 스크립트 3개, 가드 규칙 12개 | `common/hooks/` |
| 단위 테스트 (`common/lib/tests/`) | 38 파일, 어설션 약 1,450개 | `node common/lib/tests/run-all.js` |
| VS Code 확장 테스트 | 3 파일, 88 케이스 | `cd vscode && npm test` |
| 훅 테스트 | 32 케이스 | `bash common/hooks/hooks.test.sh` |
| 통합 TC (`tests/tc/`) | 281 TC / 274 YAML — safe 63 / mutating 79 / device 139; approved 110 | `cd tests && node scripts/verify-doc-stats.mjs` |
| 문서 | Markdown 204개 (`docs/` 91개, en/ko 쌍), SKILL.md 60개 | `git ls-files \| grep -c '\.md$'` |

## 저장소 구조

```
tizen-sdk-skills/
├── _repo-root/             # tizen-agent-skills 저장소 루트용 파일 스테이징 (.claude-plugin/marketplace.json → ./tizen-sdk-skills/common, .github/, LICENSE 등 — _repo-root/UPLOAD.md 참고)
├── common/                 # 모든 하네스가 공유 (단일 소스)
│   ├── .claude-plugin/     #   Claude Code 플러그인 메타데이터 (plugin.json)
│   ├── agents/             #   24개 agent .md (러너 탐색이 .claude/.cline/.codex/.gemini 포괄)
│   ├── skills/             #   29개 SKILL.md 디렉토리 (러너 탐색이 .claude/.cline/.codex/.gemini 포괄)
│   ├── lib/                #   CommonJS 도메인 로직 — CLI 러너, core, envelope, 테스트
│   │   ├── cli/            #     CLI 진입점 (명령어별 1개, `node <파일>`로 실행)
│   │   ├── core/           #     sdk-commands.js, plugin-cache.js, certificate, device, emulator, debug, ...
│   │   ├── envelope/       #     Standard JSON Envelope (envelope.js, envelope-wrapper.js, response-formatter.js)
│   │   └── tests/          #     단위 테스트
│   ├── scripts/            #   플랫폼 .ps1/.sh 기능 스크립트, 템플릿, T-CLI.md
│   ├── hooks/              #   check-tizen-commands.sh, check-project-writes.sh, check-skill-routing.sh,
│   │                       #   hooks.json, tizen-sdk-skills-guard.md (AGENTS.md / GEMINI.md용 호스트 중립 규칙)
│   ├── setup/              #   모든 하네스가 공유하는 단일 setup 구현:
│   │   ├── setup.sh/.ps1   #     --harness <claude|cline|codex|gemini>
│   │   ├── setup-lib.*     #     미러 복사, 비교, 버전, 가드 섹션 헬퍼
│   │   └── hosts/          #     <harness>.sh/.ps1 — 경로, 에이전트 형식, 훅/지침 단계
│   ├── tools/              #   미리 빌드된 tizen-dlog-analyzer 바이너리 (linux/macos/windows)
│   └── assets/             #   공유 에셋
├── claude/setup/           # Claude Code — 2줄 wrapper: setup.sh, setup.ps1, setup.bat
├── cline/                  # Cline
│   ├── hooks/              #   PreToolUse 어댑터, tizen-sdk-skills-guard.md (한국어, Cline 전용 규칙)
│   └── setup/              #   wrapper
├── codex/setup/            # OpenAI Codex CLI — wrapper (~/.codex, ~/.agents/skills)
├── gemini/                 # Google Gemini CLI
│   ├── hooks/              #   BeforeTool 어댑터 (Gemini 훅 프로토콜 -> 공용 가드)
│   └── setup/              #   wrapper
├── tizen-cli/              # tizen-cli 플러그인 하네스 (canonical 소스)
│   ├── src/                #   TypeScript 셸 (flat 34 커맨드, envelope 어댑터, --schema/--doctor)
│   │   └── command-specs/  #   도메인별 선언적 스펙 (sdk, check, project, device, debug, test, certificate)
│   ├── skills/             #   tizen-cli 구동 에이전트용 SKILL.md 31개 (29개 + 우산 라우터 + tizen-list-templates)
│   ├── esbuild.config.js   #   빌드 설정
│   ├── plugin.json         #   tizen-cli 플러그인 매니페스트 (빌드 시 commands 자동 업데이트)
│   └── package.json        #   npm/pnpm 패키지
├── vscode/                 # VS Code 확장 — 에디터에서 Claude Code / Cline용 플러그인 설치·동기화
├── docs/                   # 문서 (아키텍처, 워크스루, 배포, envelope, ...)
├── usage/                  # 사용 시나리오 및 실제 사용 사례
├── tests/                  # 독립 테스트 스위트 (TC YAML, 러너, 픽스처)
└── scripts/                # 저장소 유지보수 스크립트 (rewrite-runner-snippets.js, add-spdx-headers.js)
```

## 하네스 분리 원칙

| 디렉토리 | 역할 |
|----------|------|
| **common/** | 모든 공유 로직 — agents, skills, lib (CLI 러너 + core + envelope), scripts, hooks, Claude Code 플러그인 메타데이터. 단일 소스. |
| **claude/** | Claude Code: 캐시 + `~/.claude/{skills,agents}`; PreToolUse 훅은 `settings.json` 스니펫으로. |
| **cline/** | Cline: 캐시(lib/scripts/assets) + `~/.cline/skills`; PreToolUse 어댑터는 `Documents/Cline/Hooks`, 상시 규칙은 `Documents/Cline/Rules`. |
| **codex/** | Codex CLI: `~/.codex` 아래 캐시; 스킬 → `~/.agents/skills`; 에이전트 → `~/.codex/agents/*.toml`; 가드 → `~/.codex/hooks.json`(`/hooks`로 1회 신뢰); 규칙 → `~/.codex/AGENTS.md`. |
| **gemini/** | Gemini CLI: `~/.gemini` 아래 캐시; 스킬 → `~/.gemini/skills`; 에이전트 → `~/.gemini/agents/*.md`; `BeforeTool` 어댑터 + `settings.json` 스니펫; 규칙 → `~/.gemini/GEMINI.md`. |
| **tizen-cli/** | tizen-cli 플러그인 하네스 — `common/lib` + `common/scripts`를 esbuild로 번들링하여 설치형 CLI 플러그인으로 제공. |
| **vscode/** | VS Code 확장 — `common/`을 번들해 에디터에서 `~/.claude` / `~/.cline`에 설치. |

> 모든 하네스는 같은 `common/`을
> `~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`으로 미러링합니다.
> `common/lib/core/plugin-cache.js`(`HOST_DOT_DIRS`, `HOST_MARKERS`)와 모든 agent/skill의 러너 탐색 스니펫이
> 네 dot-dir(`.claude .cline .codex .gemini`)과 각 호스트가 설정하는 환경 변수(`CLAUDECODE`,
> `GEMINI_CLI`, `CODEX_*`)를 모두 알고 있어, 실행 중인 호스트의 캐시를 먼저 고르고 폴백 시에는
> 호스트별로 버전 정렬합니다. 하네스 간 차이는
> 스킬/에이전트/훅을 어디서 로드하는지와 에이전트 파일 형식(`common/lib/tools/agent-convert.js`),
> 그리고 의도된 동작 차이 하나뿐입니다: 장시간 설치(`tizen-sdk-install` / `tizen-tv-sdk-install` /
> `tizen-update-package`의 Phase 2)는 Claude Code에서는 Bash 도구의 `run_in_background` +
> `<task-notification>`을 쓰지만, 백그라운드 완료 알림이 없는 Cline에서는 포그라운드로 실행됩니다.
> 하네스 추가 = `common/setup/hosts/<name>.{sh,ps1}` 하나 + `HOST_DOT_DIRS` / `HOST_MARKERS` 항목 하나 +
> `scripts/rewrite-runner-snippets.js` 실행. tizen-cli 하네스는 같은 `common/` 로직을
> `tizen-cli tizen-sdk <command>`로 감쌉니다.
> 하네스별 설치 가이드: [docs/deployment/HARNESS_SETUP.md](docs/deployment/HARNESS_SETUP.md).

## 빠른 시작

### Claude Code

#### 방법 1: 마켓플레이스 등록

`tizen-agent-skills` 저장소 루트에 Claude Code 마켓플레이스 매니페스트가 포함되어 있습니다.

```
/plugin marketplace add https://github.com/Samsung/tizen-agent-skills.git
/plugin install tizen-sdk-skills@tizen-platform
```

#### 방법 2: setup 스크립트 (user-level 설치)

마켓플레이스 등록이 불가능한 환경(예: 조직 정책이 `strictKnownMarketplaces`를 제한하는 경우)이거나
로컬 체크아웃에서 바로 사용하려는 경우에 사용합니다. setup 스크립트는 플러그인을
**개인(user-level) 컴포넌트**로 설치하며, 마켓플레이스 시스템을 거치지 않습니다.

```bash
# 1. 저장소 클론
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# 2. 통합 설치 스크립트 실행 (Windows)
.\claude\setup\setup.ps1

# 3. Claude Code 세션 재시작
```

**Linux/macOS:**
```bash
bash claude/setup/setup.sh
```

setup 스크립트는 다음을 수행합니다:
- `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`에 skills, agents, lib, scripts, docs 동기화
- `~/.claude/skills/`, `~/.claude/agents/`에 개인 복사본 생성 (user-level 컴포넌트의 실제 로딩 경로)
- `settings.json`에 등록할 hooks JSON 스니펫 출력

> 자세한 내용은 [배포·동기화 가이드](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.md)를 참고하세요.

### Cline

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# Windows
.\cline\setup\setup.ps1
# Linux/macOS
bash cline/setup/setup.sh
```

### Codex CLI / Gemini CLI

`codex/setup/`, `gemini/setup/`의 wrapper를 같은 방식으로 실행합니다. 호스트별 설치 위치는
[HARNESS_SETUP.md](docs/deployment/HARNESS_SETUP.md)를 참고하세요.

### tizen-cli

```bash
cd tizen-cli
pnpm install && pnpm run build   # -> dist/tizen-sdk.js + plugin.json + scripts/ + skills/
tizen-cli plugin install dist/
tizen-cli tizen-sdk --doctor
```

[tizen-cli/README.ko.md](tizen-cli/README.ko.md), [docs/tizen-cli/build-and-install.md](docs/tizen-cli/build-and-install.md)를 참고하세요.

## tizen-sdk-agents에서 마이그레이션

기존 이름이 들어간 모든 항목이 바뀌었으며, 이전 설치와 호환되지 않습니다:

| 이전 (`tizen-ai-plugins` 모노레포) | 이후 (이 저장소) |
|---|---|
| 플러그인 ID `tizen-sdk-agents` (`plugin.json`, marketplace) | `tizen-sdk-skills` |
| 캐시 `~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-agents/<ver>/` | `.../tizen-platform/tizen-sdk-skills/<ver>/` |
| 훅 스크립트 `~/.claude/hooks/tizen-sdk-agents/`, 가드 규칙 `tizen-sdk-agents-guard.md` | `~/.claude/hooks/tizen-sdk-skills/`, `tizen-sdk-skills-guard.md` |
| `tizen-cli tizen-sdk-agents <command>`, 번들 `dist/tizen-sdk-agents.js` | `tizen-cli tizen-sdk <command>`, `dist/tizen-sdk.js` |
| tizen-cli 플러그인 설치 위치 `~/.tizen/plugins/tizen-sdk-agents/` | `~/.tizen/plugins/tizen-sdk/` |
| `TIZEN_SDK_AGENTS_ROOT` | `TIZEN_SDK_SKILLS_ROOT` |
| 저장소 구조 `plugins/tizen-sdk-agents/<harness>/…`, `docs/tizen-sdk-agents/…` | 저장소 루트의 `<harness>/…`, `docs/…` |

기존 `tizen-sdk-agents` 설치 위에 이 버전을 설치하면 자동으로 정리됩니다. setup 스크립트와
VS Code 확장이 구 `_source` 태그, 훅 파일 마커, 가드 섹션 마커, 설치 매니페스트를 인식해
교체하고, 구 캐시 루트·훅 디렉토리·Cline 가드 규칙을 삭제합니다. 스크립트가 스니펫만
출력하는 두 곳은 수동입니다: `claude/setup/setup.sh`로 넣은 Claude Code `settings.json`
항목(VS Code 확장은 자동 병합), 그리고 Gemini `settings.json`의 `tizen-sdk-agents-guard`
BeforeTool 항목. tizen-cli 플러그인은 별도 설치이므로 `tizen-cli plugin install` 전에
`tizen-cli plugin uninstall tizen-sdk-agents`를 먼저 실행하세요.

## 명령어 (34개)

| 명령어 | 도메인 | 용도 |
|--------|--------|------|
| `sdk-init` | SDK | Tizen SDK 설치 경로 구성 |
| `sdk-install` | SDK | Tizen SDK 설치 (2단계: 사전 체크 + 백그라운드 설치) |
| `sdk-install-custom-repo` | SDK | 사용자 지정 패키지 저장소 URL에서 설치 |
| `validate-repo-url` | SDK | 저장소 URL 검증 (읽기 전용) |
| `tv-sdk-install` | SDK | TV SDK 확장 설치 (TV-SAMSUNG-Public) |
| `tv-sdk-install-from-zip` | SDK | 로컬 ZIP 파일로 TV SDK 확장 설치 (오프라인, 다운로드 없음) |
| `update-package` | SDK | 설치된 Tizen SDK 패키지 업데이트 |
| `sdk-repo-info` | SDK | SDK 패키지 저장소 정보 조회 |
| `download-emulator-package` | SDK | Tizen 에뮬레이터 패키지 다운로드 및 설치 |
| `platform-install` | SDK | Tizen 플랫폼 패키지 다운로드 및 설치 |
| `download-mobile-platform` | SDK | Tizen 모바일 플랫폼 패키지 다운로드 및 설치 |
| `install-rootstrap` | SDK | 커스텀 루트스트랩 ZIP을 SDK에 설치 |
| `dotnet-setup` | SDK | .NET SDK 확인 + Tizen .NET workload 설치 |
| `check-node` | Check | Node.js 설치 여부 및 PATH 확인 |
| `check-disk-space` | Check | SDK 설치 전 디스크 여유 공간 확인 |
| `create-project` | Project | Native/DotNET/WebApp/TV/Platform 프로젝트 생성 (Platform은 GBS로 .rpm 생성) |
| `project-delete` | Project | Tizen 프로젝트 디렉터리 삭제 |
| `list-templates` | Project | 사용 가능한 프로젝트 템플릿 조회 |
| `build-project` | Project | 프로젝트 빌드 + 패키징 (.tpk/.wgt/.rpm) |
| `create-emulator` | Device | 커스텀 Tizen 에뮬레이터 VM 생성 |
| `launch-emulator` | Device | 기존 에뮬레이터 VM 실행 |
| `emulator-manager` | Device | em-cli 전체 기능 (생성/삭제/실행/조회/수정/리셋/캡처) |
| `device-manager` | Device | 디바이스 탐지 또는 에뮬레이터 중지 |
| `install-app` | Device | .tpk/.wgt/.rpm 설치 (및 선택적 실행) |
| `sdb-helper` | Device | 자연어 요청으로 sdb 명령 실행 |
| `screenshot` | Device | 에뮬레이터 또는 디바이스 스크린샷 캡처 |
| `file-transfer` | Device | sdb로 파일 푸시/풀 |
| `remote-device` | Device | 원격 디바이스 스캔, 연결, 해제, 관리 |
| `gdb-debug` | Debug | Native 앱 원격 GDB 디버깅 설정 |
| `dotnet-debug` | Debug | .NET 앱 원격 netcoredbg 디버깅 설정 |
| `webapp-debug` | Debug | 웹 앱 원격 디버깅 설정 (RWI/CDP) |
| `dlog-analyzer` | Debug | dlog 수집, 크래시/예외 감지, 근본 원인 제안 |
| `playwright-test` | Test | Tizen 웹 앱에 대한 Playwright 테스트 실행/스캐폴드 |
| `certificate-manager` | Certificate | Tizen 인증서 및 서명 프로필 관리 |

## Standard JSON Envelope

모든 명령어는 stdout에 단일 Standard JSON Envelope를 출력하며,
진단 메시지는 stderr로만 출력됩니다. 자세한 내용은
[Envelope 라이브러리 README](common/lib/README.md)를 참고하세요.

## 릴리즈

`tizen-agent-skills` 저장소에 `tizen-sdk-skills-vX.Y.Z` 태그를 푸시하면
[release.yml](../.github/workflows/release.yml)이 실행되어
`tizen-sdk-vX.Y.Z.zip`(tizen-cli 플러그인 `dist/`)과
`tizen-ai-extension-vX.Y.Z.vsix`(VS Code 확장)를 GitHub Release에 첨부합니다.
이름 변경 이전의 릴리즈는 이 저장소에 게시되지 않습니다.

## 개발

```bash
pnpm install --frozen-lockfile && pnpm run lint && pnpm run format:check   # 저장소 전체 ESLint + Prettier
node common/lib/tests/run-all.js                                          # common/lib 단위 테스트
bash common/hooks/hooks.test.sh                                           # 훅 가드 테스트
node scripts/rewrite-runner-snippets.js --check                           # 러너 탐색 스니펫 동기화 확인
node scripts/add-spdx-headers.js --check                                  # SPDX 라이선스 헤더 확인
cd tizen-cli && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm run build   # tizen-cli 하네스
cd tests && npm ci && node runner.mjs --dry-run                           # TC 스키마 검사
```

## 기여 및 거버넌스

- [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md) — 브랜치 흐름, 커밋 규칙, 테스트 티어, 문서 쌍 규칙
- [GOVERNANCE.ko.md](GOVERNANCE.ko.md) — 역할, 모듈, 의사결정, 코드 리뷰 규칙

## 사용 사례 & 시나리오 가이드

- [사용 사례 & 시나리오 가이드](usage/usage.md) — 엔드투엔드 시나리오 가이드와 실제 사용 사례를 인덱싱 및 요약

## 관련 문서

- [기여 가이드](CONTRIBUTING.ko.md)
- [거버넌스](GOVERNANCE.ko.md)
- [Tizen SDK Skills 상세 문서](docs/README.md)
- [스킬 레퍼런스](docs/SKILLS_REFERENCE.md)
- [스킬 ↔ 커맨드 맵핑](docs/SKILLS_COMMANDS_MAPPING.md)
- [SDK Commands 아키텍처](docs/SDK_COMMANDS_ARCHITECTURE.md)
- [SDK Layers 개요](docs/SDK_LAYERS_OVERVIEW.md)
- [하네스 설치 가이드](docs/deployment/HARNESS_SETUP.md)
- [배포·동기화 가이드](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.md)
- [통합 설치·동기화 스크립트](docs/deployment/CLINE_SETUP_AND_SYNC.md)
- [Envelope 사용 가이드](docs/envelope/ENVELOPE_USAGE_GUIDE.md)
- [SDK 설치 가이드](docs/sdk-install/INSTALLATION_FLOW.md)
- [사용자 지정 저장소 설치](docs/sdk-install/CUSTOM_REPOSITORY_INSTALL.md)
- [.NET 설정 E2E](docs/sdk-install/DOTNET_SETUP_E2E.md)
- [Native App 시나리오 walkthrough](docs/project/scenario-native-app-walkthrough.md)
- [WebApp 디버깅 E2E 시나리오 walkthrough](docs/debug/scenario-webapp-debug-walkthrough.md)
- [Native App 디버깅(GDB) E2E 시나리오 walkthrough](docs/debug/scenario-native-debug-walkthrough.md)
- [.NET App 디버깅(netcoredbg) E2E 시나리오 walkthrough](docs/debug/scenario-dotnet-debug-walkthrough.md)
- [DLog 분석기 walkthrough](docs/debug/scenario-dlog-analyzer-walkthrough.md)
- [인증서 매니저 가이드](docs/certificate/certificate-manager-guide.md)
- [에뮬레이터 매니저 walkthrough](docs/emulator/emulator-manager-walkthrough.ko.md)
- [Playwright 테스트 walkthrough](docs/test/scenario-playwright-test-walkthrough.md)
- [tizen-cli 빌드 & 설치](docs/tizen-cli/build-and-install.md)
- [WSL 에뮬레이터 가이드](docs/wsl/WSL_EMULATOR_GUIDE.md)
- [플랫폼 GBS 빌드](docs/platform-gbs-build.md)
- [TV SDK 설정](docs/tv-setup/TV_SDK_SETUP.md)
