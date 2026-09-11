# tizen-sdk-skills

[English](README.md) | 한국어

**Claude Code**, **Cline**, **Codex CLI**, **Gemini CLI**, **tizen-cli**, **VS Code**를 위한
Tizen SDK 자동화 플러그인 — SDK 설치, 프로젝트 생성, 빌드, 디바이스 관리, 앱 설치,
원격 디버깅(GDB / netcoredbg / CDP), 인증서 관리, Playwright 테스트를 자동화합니다.

## 빠른 시작

### 사전 요구사항

- **Node.js 20+** 가 `PATH`에 있어야 합니다 — 모든 스킬 뒤에서 동작하는 CLI 러너가
  사용합니다 (`check-node`로 확인 가능).
- **Git** — 저장소 클론용.
- 지원 호스트 중 하나: Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli, VS Code.
- Windows, Linux, macOS. 에뮬레이터는 WSL도 지원합니다 —
  [WSL 에뮬레이터 가이드](docs/wsl/WSL_EMULATOR_GUIDE.md) 참고.
- **pnpm** (tizen-cli 하네스만 해당).

Tizen SDK 자체는 미리 설치할 필요가 **없습니다** — `tizen-sdk-install` 스킬이 설치해 줍니다.

### Claude Code

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# Windows
.\claude\setup\setup.ps1
# Linux/macOS
bash claude/setup/setup.sh
```

setup 스크립트는 로컬 체크아웃에서 플러그인을 **개인(user-level) 컴포넌트**로 설치합니다:

- `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`에 skills, agents, lib, scripts, docs 동기화
- `~/.claude/skills/`, `~/.claude/agents/`에 개인 복사본 생성 (user-level 컴포넌트의 실제 로딩 경로)
- `settings.json`에 등록할 hooks JSON 스니펫 출력

설치 후 Claude Code 세션을 재시작하세요. 자세한 내용은
[배포·동기화 가이드](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.md)를 참고하세요.

### Cline

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills

# Windows
.\cline\setup\setup.ps1
# Linux/macOS
bash cline/setup/setup.sh
```

설치 후 Cline을 재시작(또는 VS Code 창 다시 로드)하세요.

### Codex CLI / Gemini CLI

`codex/setup/`, `gemini/setup/`의 wrapper를 같은 방식으로 실행한 뒤 호스트를 재시작합니다.
호스트별 설치 위치는 [HARNESS_SETUP.md](docs/deployment/HARNESS_SETUP.md)를 참고하세요.

### VS Code 확장

**Tizen AI Extension**은 스크립트를 실행하지 않고 에디터 안에서 Claude Code / Cline용
플러그인을 설치·동기화합니다.
[GitHub Releases](https://github.com/Samsung/tizen-agent-skills/releases)에서
`tizen-ai-extension-vX.Y.Z.vsix`를 내려받아 설치하세요:

```bash
code --install-extension tizen-ai-extension-vX.Y.Z.vsix
```

확장은 활성화 시 자동으로 설치를 수행하고 Claude Code 훅을 `settings.json`에 병합해 줍니다.
설정, 명령, 소스 빌드 방법은 [vscode/README.md](vscode/README.md)를 참고하세요.

### tizen-cli

```bash
cd tizen-cli
pnpm install && pnpm run build   # -> dist/tizen-sdk.js + plugin.json + scripts/ + skills/
tizen-cli plugin install dist/
tizen-cli tizen-sdk --doctor
```

[tizen-cli/README.ko.md](tizen-cli/README.ko.md), [docs/tizen-cli/build-and-install.md](docs/tizen-cli/build-and-install.md)를 참고하세요.

### 자연어로 사용하기

설치가 끝나면 명령어를 외울 필요 없이, AI 코딩 어시스턴트에 원하는 작업을 한국어나 영어로
그대로 말하면 됩니다. 요청에 맞는 스킬·에이전트가 알아서 Tizen SDK 도구를 실행합니다:

```
타이젠 SDK 설치해줘
HelloTizen이라는 이름으로 타이젠 웹앱 만들어줘
이 프로젝트 빌드해서 에뮬레이터에 설치해줘
에뮬레이터 켜고 연결된 디바이스 보여줘
이 네이티브 앱 GDB로 디버깅해줘
앱이 죽었어 — dlog 분석해줘
Install the Tizen SDK
Create a web app and install it on the emulator
```

각 요청은 스킬(예: `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`,
`tizen-install-app`, `tizen-gdb-debug`, `tizen-dlog-analyzer`)로 라우팅되며, 스킬이 설치된
SDK를 찾아 `tizen` / `sdb` / `em-cli` 명령을 실행하고 결과를 Standard JSON Envelope로
돌려줍니다. 엔드투엔드 예시는 [사용 사례 & 시나리오 가이드](usage/usage.md), 전체 트리거
문구 목록은 [스킬 레퍼런스](docs/SKILLS_REFERENCE.md)를 참고하세요.

## 명령어 (34개)

아래 각 명령어는 AI 호스트에서는 `tizen-<명령어>` 이름의 스킬(예: `tizen-build-project`)로,
tizen-cli에서는 `tizen-cli tizen-sdk <명령어>`로 노출됩니다. 정확한 대응 관계는
[스킬 ↔ 커맨드 맵핑](docs/SKILLS_COMMANDS_MAPPING.md)을 참고하세요.

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

## 아키텍처

### 저장소 구조

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

### 하네스 분리 원칙

| 디렉토리 | 역할 |
|----------|------|
| **common/** | 모든 공유 로직 — agents, skills, lib (CLI 러너 + core + envelope), scripts, hooks, Claude Code 플러그인 메타데이터. 단일 소스. |
| **claude/** | Claude Code: 캐시 + `~/.claude/{skills,agents}`; PreToolUse 훅은 `settings.json` 스니펫으로. |
| **cline/** | Cline: 캐시(lib/scripts/assets) + `~/.cline/skills`; PreToolUse 어댑터는 `Documents/Cline/Hooks`, 상시 규칙은 `Documents/Cline/Rules`. |
| **codex/** | Codex CLI: `~/.codex` 아래 캐시; 스킬 → `~/.agents/skills`; 에이전트 → `~/.codex/agents/*.toml`; 가드 → `~/.codex/hooks.json`(`/hooks`로 1회 신뢰); 규칙 → `~/.codex/AGENTS.md`. |
| **gemini/** | Gemini CLI: `~/.gemini` 아래 캐시; 스킬 → `~/.gemini/skills`; 에이전트 → `~/.gemini/agents/*.md`; `BeforeTool` 어댑터 + `settings.json` 스니펫; 규칙 → `~/.gemini/GEMINI.md`. |
| **tizen-cli/** | tizen-cli 플러그인 하네스 — `common/lib` + `common/scripts`를 esbuild로 번들링하여 설치형 CLI 플러그인으로 제공. |
| **vscode/** | VS Code 확장 — `common/`을 번들해 에디터에서 `~/.claude` / `~/.cline`에 설치. |

모든 하네스는 같은 `common/`을 `~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<version>/`으로
미러링하며, 모든 agent/skill의 러너 탐색은 네 dot-dir을 모두 알고 실행 중인 호스트의 캐시를
우선 사용합니다. 하네스 간 차이는 스킬·에이전트·훅을 어디서 로드하는지와 에이전트 파일 형식뿐이며,
의도된 동작 차이는 하나입니다 — 장시간 설치가 Claude Code에서는 백그라운드로, 백그라운드 완료
알림이 없는 Cline에서는 포그라운드로 실행됩니다. 호스트 감지, 러너 탐색 스니펫, 새 하네스 추가
절차는 [HARNESS_SETUP.md](docs/deployment/HARNESS_SETUP.md)에 정리되어 있습니다.

### Standard JSON Envelope

모든 명령어는 stdout에 단일 Standard JSON Envelope를 출력하며, 진단 메시지는 stderr로만
출력됩니다. 자세한 내용은 [Envelope 라이브러리 README](common/lib/README.md)와
[Envelope 사용 가이드](docs/envelope/ENVELOPE_USAGE_GUIDE.md)를 참고하세요.

## 문제 해결 & 제거

- **스킬이 인식되지 않음** — setup 후 호스트를 재시작했는지 확인하고 setup 스크립트를 다시
  실행하세요. setup은 멱등(idempotent)합니다: 캐시는 깨끗한 미러로 다시 만들어지고, 개인
  스킬·에이전트 파일은 그 자리에서 교체됩니다.
- **`node`를 찾을 수 없음** — 러너는 `PATH`의 Node.js 20+가 필요합니다. 어시스턴트에
  "node 확인해줘"(`check-node`)라고 요청하거나 `node --version`을 실행해 보세요.
- **tizen-cli** — `tizen-cli tizen-sdk --doctor`가 SDK 경로, 캐시, 러너 상태를 보고합니다.
- **제거** — VS Code 확장은 제거 시 자신이 설치한 파일을 모두 정리합니다. 스크립트로 설치한
  경우에는 캐시 루트 `~/<dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills`, `tizen-*`
  스킬 폴더와 에이전트 파일, 훅/지침 항목을 삭제하면 됩니다. 호스트별 정확한 경로는
  [HARNESS_SETUP.md](docs/deployment/HARNESS_SETUP.md)의 *Re-running and removing* 절을
  참고하세요.

## 개발

### 로컬 검사

```bash
pnpm install --frozen-lockfile && pnpm run lint && pnpm run format:check   # 저장소 전체 ESLint + Prettier
node common/lib/tests/run-all.js                                          # common/lib 단위 테스트
bash common/hooks/hooks.test.sh                                           # 훅 가드 테스트
node scripts/rewrite-runner-snippets.js --check                           # 러너 탐색 스니펫 동기화 확인
node scripts/add-spdx-headers.js --check                                  # SPDX 라이선스 헤더 확인
cd tizen-cli && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm run build   # tizen-cli 하네스
cd tests && npm ci && node runner.mjs --dry-run                           # TC 스키마 검사
```

### 프로젝트 현황

2026-09-10, v1.2.0 기준 실측값입니다. 각 행은 마지막 열의 명령으로 다시 측정할 수
있으며, 스킬·에이전트·커맨드·테스트 스위트가 추가될 때마다 이 표를 갱신합니다.

| 항목 | 수치 | 재측정 방법 |
|------|------|-------------|
| 하네스 | 6 — Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli, VS Code 확장 | `ls common/setup/hosts` (dot-dir 호스트 4 × sh/ps1) + `tizen-cli/` + `vscode/` |
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

### 릴리즈

`tizen-agent-skills` 저장소에 `tizen-sdk-skills-vX.Y.Z` 태그를 푸시하면
[release.yml](../.github/workflows/release.yml)이 실행되어
`tizen-sdk-vX.Y.Z.zip`(tizen-cli 플러그인 `dist/`)과
`tizen-ai-extension-vX.Y.Z.vsix`(VS Code 확장)를 GitHub Release에 첨부합니다.
버전별 변경 사항은 [CHANGELOG.md](CHANGELOG.md)에 기록됩니다. 플러그인이 이 저장소로
옮겨오기 전의 릴리즈는 여기에 다시 게시되지 않습니다.

## 문서

**시작하기**

- [사용 사례 & 시나리오 가이드](usage/usage.md) — 엔드투엔드 시나리오 가이드와 실제 사용 사례
- [SDK 설치 가이드](docs/sdk-install/INSTALLATION_FLOW.md)
- [사용자 지정 저장소 설치](docs/sdk-install/CUSTOM_REPOSITORY_INSTALL.md)
- [.NET 설정 E2E](docs/sdk-install/DOTNET_SETUP_E2E.md)
- [TV SDK 설정](docs/tv-setup/TV_SDK_SETUP.md)
- [WSL 에뮬레이터 가이드](docs/wsl/WSL_EMULATOR_GUIDE.md)

**워크스루**

- [Native App 시나리오](docs/project/scenario-native-app-walkthrough.md)
- [WebApp 디버깅 (RWI/CDP)](docs/debug/scenario-webapp-debug-walkthrough.md)
- [Native App 디버깅 (GDB)](docs/debug/scenario-native-debug-walkthrough.md)
- [.NET App 디버깅 (netcoredbg)](docs/debug/scenario-dotnet-debug-walkthrough.md)
- [DLog 분석기](docs/debug/scenario-dlog-analyzer-walkthrough.md)
- [인증서 매니저 가이드](docs/certificate/certificate-manager-guide.md)
- [에뮬레이터 매니저](docs/emulator/emulator-manager-walkthrough.ko.md)
- [Playwright 테스트](docs/test/scenario-playwright-test-walkthrough.md)
- [플랫폼 GBS 빌드](docs/platform-gbs-build.md)

**아키텍처 & 레퍼런스**

- [Tizen SDK Skills 상세 문서](docs/README.md)
- [스킬 레퍼런스](docs/SKILLS_REFERENCE.md)
- [스킬 ↔ 커맨드 맵핑](docs/SKILLS_COMMANDS_MAPPING.md)
- [SDK Commands 아키텍처](docs/SDK_COMMANDS_ARCHITECTURE.md)
- [SDK Layers 개요](docs/SDK_LAYERS_OVERVIEW.md)
- [Envelope 사용 가이드](docs/envelope/ENVELOPE_USAGE_GUIDE.md)

**하네스 설치 & 배포**

- [하네스 설치 가이드](docs/deployment/HARNESS_SETUP.md)
- [배포·동기화 가이드](docs/deployment/PLUGIN_DEPLOYMENT_SYNC.md)
- [통합 설치·동기화 스크립트](docs/deployment/CLINE_SETUP_AND_SYNC.md)
- [tizen-cli 빌드 & 설치](docs/tizen-cli/build-and-install.md)
- [VS Code 확장](vscode/README.md)

## 기여

- [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md) — 브랜치 흐름, 커밋 규칙, 테스트 티어, 문서 쌍 규칙
- [GOVERNANCE.ko.md](GOVERNANCE.ko.md) — 역할, 모듈, 의사결정, 코드 리뷰 규칙

## 라이선스

Copyright 2026 Samsung Electronics Co., Ltd.

[Apache License, Version 2.0](LICENSE)에 따라 배포됩니다. 이 프로젝트에 포함된 서드파티
구성 요소는 [NOTICE](NOTICE)에 정리되어 있습니다.
