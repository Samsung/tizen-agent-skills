# tizen-sdk-skills 아키텍처 다이어그램

[English](ARCHITECTURE_DIAGRAMS.en.md) | 한국어

`tizen-sdk-skills` 저장소 전체를 한눈에 보여주는 다이어그램 모음입니다. AI 코딩 어시스턴트(Claude Code, Cline, Codex CLI, Gemini CLI, VS Code 확장)와 독립 실행형 `tizen-sdk` CLI가 **하나의 `common/`** 을 어떻게 공유하고, 자연어 요청이 어떤 계층을 거쳐 실제 Tizen SDK 도구(`tizen`/`tz`, `sdb`, `em-cli`, `dotnet`, `gbs`)까지 도달하는지, 그 결과가 어떻게 Standard JSON Envelope로 돌아오는지를 그림으로 설명합니다.

> 다이어그램의 개수(스킬 29, 에이전트 24, 커맨드 35, 에러 코드 61, TC 290)는 공개 배포 트리 기준이며 [README.md](../README.md)의 "Project at a Glance"(v1.4.0) 표와 같습니다. 다시 측정하려면 그 표의 마지막 열에 있는 명령을 쓰세요.

---

## 1. 전체 그림 (Big Picture)

사용자는 자연어로 요청하고, 호스트는 스킬을 골라 CLI 러너를 실행하며, 러너는 SDK 도구를 호출한 뒤 JSON Envelope 하나를 돌려줍니다.

```mermaid
graph TB
    USER["개발자<br/>자연어 요청 (한/영)<br/>'웹앱 만들어서 에뮬레이터에 설치해줘'"]

    subgraph HOSTS["AI 호스트 (6개 하네스)"]
        CLAUDE["Claude Code<br/>skills + agents + PreToolUse hooks"]
        CLINE["Cline<br/>skills + rules + PreToolUse adapter"]
        CODEX["Codex CLI<br/>skills + agents(.toml) + hooks.json"]
        GEMINI["Gemini CLI<br/>skills + agents + BeforeTool adapter"]
        VSCODE["VS Code 확장<br/>Claude/Cline/Codex에 플러그인 설치·동기화"]
        CLI["tizen-sdk 독립 CLI<br/>AI 호스트 없이 35개 커맨드 직접 실행"]
    end

    subgraph COMMON["common/ — 단일 진실 공급원"]
        SKILLS["skills/<br/>29개 SKILL.md<br/>(트리거 문구 + 러너 호출법)"]
        AGENTS["agents/<br/>24개 agent .md<br/>(서브에이전트 위임용)"]
        HOOKS["hooks/<br/>3개 가드 스크립트 + 13개 규칙"]
        LIB["lib/<br/>cli/ → core/ → envelope/"]
        SCRIPTS["scripts/<br/>tizen-*/ .ps1 + .sh 기능 스크립트"]
    end

    subgraph SDK["Tizen SDK 도구"]
        TZ["tizen / tz<br/>create·build·package"]
        SDB["sdb<br/>install·shell·forward·dlog"]
        EMCLI["em-cli<br/>emulator VM 관리"]
        DOTNET["dotnet<br/>workload·restore"]
        GBS["gbs<br/>Platform .rpm 빌드"]
    end

    subgraph TARGET["대상"]
        EMU["에뮬레이터 VM"]
        DEV["실기기 / TV<br/>(USB 또는 네트워크 sdb)"]
    end

    USER --> HOSTS
    CLAUDE & CLINE & CODEX & GEMINI --> SKILLS
    CLAUDE --> AGENTS
    CLAUDE & CLINE & CODEX & GEMINI --> HOOKS
    VSCODE -->|"설치·동기화"| COMMON
    SKILLS --> LIB
    AGENTS --> LIB
    CLI -->|"esbuild 번들"| LIB
    LIB --> SCRIPTS
    SCRIPTS --> TZ & SDB & EMCLI & DOTNET & GBS
    SDB --> EMU & DEV
    EMCLI --> EMU
    LIB -.->|"Standard JSON Envelope<br/>(stdout 한 줄)"| HOSTS

    style USER fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style COMMON fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style LIB fill:#a5d6a7,stroke:#546e7a,color:#1a1a1a
    style SDK fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style TARGET fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style CLI fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
```

---

## 2. 저장소 구조 (Repository Layout)

`common/`이 모든 로직을 가지고, 나머지 디렉터리는 **하네스별 얇은 어댑터**이거나 도구(CLI, 확장, 테스트, 문서)입니다.

```mermaid
graph LR
    ROOT["tizen-sdk-skills/"]

    ROOT --> COMMON["common/<br/>공유 로직 (단일 진실 공급원)"]
    ROOT --> CLAUDE["claude/setup/<br/>2줄 래퍼 (setup.sh/.ps1/.bat)"]
    ROOT --> CLINE["cline/<br/>hooks/ PreToolUse 어댑터 + guard.md<br/>setup/ 래퍼"]
    ROOT --> CODEX["codex/setup/<br/>래퍼 (~/.codex, ~/.agents/skills)"]
    ROOT --> GEMINI["gemini/<br/>hooks/ BeforeTool 어댑터<br/>setup/ 래퍼"]
    ROOT --> TCLI["tizen-cli/<br/>독립 tizen-sdk CLI (TypeScript + esbuild)"]
    ROOT --> VSC["vscode/<br/>Tizen AI Extension (.vsix)"]
    ROOT --> TESTS["tests/<br/>290 TC YAML + runner.mjs + fixtures"]
    ROOT --> DOCS["docs/ · usage/<br/>문서 (ko/en 쌍) · 시나리오"]
    ROOT --> SCR["scripts/<br/>저장소 유지보수 (SPDX, 러너 스니펫 동기화, 공개 게시)"]
    ROOT --> REPOROOT["_repo-root/<br/>공개 저장소 루트 파일 스테이징"]

    COMMON --> C_PLUGIN[".claude-plugin/plugin.json"]
    COMMON --> C_SKILLS["skills/&lt;tizen-*&gt;/SKILL.md"]
    COMMON --> C_AGENTS["agents/tizen-*.md"]
    COMMON --> C_LIB["lib/"]
    COMMON --> C_SCRIPTS["scripts/tizen-*/ (.ps1 + .sh)<br/>scripts/lib/ 공용 셸 라이브러리"]
    COMMON --> C_HOOKS["hooks/<br/>check-tizen-commands.sh<br/>check-project-writes.sh<br/>check-skill-routing.sh<br/>hooks.json · guard.md"]
    COMMON --> C_SETUP["setup/<br/>setup.sh/.ps1 --harness X<br/>setup-lib.* · hosts/X.sh/.ps1"]
    COMMON --> C_TOOLS["tools/<br/>dlog-analyzer 바이너리 (win/linux/mac)"]

    C_LIB --> L_CLI["cli/ *-cli.js<br/>커맨드별 진입점 (node로 실행)"]
    C_LIB --> L_CORE["core/<br/>sdk-commands · plugin-cache · sdk · sdb<br/>emulator · device · project · debug · certificate ..."]
    C_LIB --> L_ENV["envelope/<br/>envelope · envelope-wrapper<br/>response-formatter · mask-secrets"]
    C_LIB --> L_TESTS["tests/ 단위 테스트 (run-all.js)"]

    TCLI --> T_SRC["src/ index · commands · doctor<br/>envelope-adapter · command-specs/"]
    TCLI --> T_SKILLS["skills/ 31 SKILL.md (CLI 구동용)"]
    TCLI --> T_DIST["dist/tizen-sdk.js (빌드 산출물)<br/>bin/tizen-sdk.js (런처)"]

    style ROOT fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style COMMON fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style C_LIB fill:#a5d6a7,stroke:#546e7a,color:#1a1a1a
    style TCLI fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style TESTS fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
```

---

## 3. 요청 처리 계층 (Call Flow)

한 번의 요청이 거치는 계층입니다. 각 중간 계층이 존재하는 이유는 [SDK_LAYERS_OVERVIEW.md](SDK_LAYERS_OVERVIEW.md)에, 함수 단위 매핑은 [SDK_COMMANDS_ARCHITECTURE.md](SDK_COMMANDS_ARCHITECTURE.md)에 있습니다.

```mermaid
sequenceDiagram
    participant U as 개발자
    participant H as AI 호스트<br/>(Claude Code / Cline / ...)
    participant S as SKILL.md<br/>(라우팅 + 입력 수집)
    participant A as Agent .md<br/>(Claude Code만, 선택)
    participant R as CLI 러너<br/>lib/cli/*-cli.js
    participant C as core/sdk-commands.js
    participant P as core/plugin-cache.js
    participant X as scripts/tizen-*/<br/>.ps1 또는 .sh
    participant T as tizen · sdb · em-cli

    U->>H: "이 프로젝트 빌드해줘"
    H->>S: 트리거 문구 매칭 → tizen-build-project
    S->>H: 필요한 입력 확인 (경로, 빌드 타입, 프로필)
    alt Claude Code (Agent tool 있음)
        H->>A: 서브에이전트에 위임
        A->>R: Bash: node project-manager-cli.js build ...
    else Cline / Codex / Gemini
        H->>R: 러너 조회 스니펫 → node <cache>/lib/cli/project-manager-cli.js build ...
    end
    R->>C: buildProject({ project, buildType, ... })
    C->>C: 인자 검증 (경로 존재, 포트 범위, 셸 안전 문자)
    C->>P: execPluginScript(scriptName, args, { captureViaTempFile })
    P->>P: 스크립트 경로 해석 (__dirname → 캐시 최신 버전)
    P->>X: 플랫폼별 스크립트 실행 (win32 → .ps1, 그 외 → .sh)
    X->>T: tz build && tz pack (또는 gbs build)
    T-->>X: 툴체인 출력 (수천 줄)
    X-->>P: exit code + stdout (임시 파일)
    P-->>C: 원문 출력
    C->>C: 요약 (경고/에러 ≤10줄) + 에러 코드 매핑 + suggested_fix
    C-->>R: Envelope (success / failure)
    R-->>H: stdout에 JSON Envelope 한 개, 진단은 stderr
    H-->>U: 결과 보고 (json 블록 + 1~2줄 요약)
```

**핵심 원칙:** 에이전트는 `.ps1`/`.sh`나 `sdb`를 직접 호출하지 않습니다. 항상 러너를 통해 실행하고, 러너가 돌려준 Envelope만 사용자에게 전달합니다. 이 규칙은 아래 5절의 가드 훅이 강제합니다.

---

## 4. Standard JSON Envelope

모든 커맨드는 stdout에 **Envelope 하나**만 출력합니다. 에이전트는 `status`와 `errors[].suggested_fix`만 보고 다음 행동을 결정할 수 있습니다.

```mermaid
graph LR
    subgraph ENV["Standard JSON Envelope"]
        ST["status<br/>success | failure | error"]
        CMD["command<br/>내부 라벨 (예: tizen-sdk build-project)"]
        UC["user_command<br/>사용자가 입력한 원문 (tizen-cli)"]
        DUR["duration_ms"]
        RES["result<br/>커맨드별 구조화 데이터<br/>(artifacts, sdk_path, devices, ...)"]
        WARN["warnings[]"]
        ERRS["errors[]"]
    end

    ERRS --> E1["error_code<br/>TIZEN_SDK_*_E###<br/>(레지스트리 61개)"]
    ERRS --> E2["error_category<br/>device_not_found · build_failed<br/>sdk_path_not_set · invalid_argument ..."]
    ERRS --> E3["message"]
    ERRS --> E4["suggested_fix<br/>{ command, auto_fixable, description }"]
    ERRS --> E5["details[]<br/>컴파일 에러 등 진단 라인"]

    subgraph LAYER["envelope/ 계층"]
        L1["envelope.js<br/>Envelope 클래스 + ERROR_CODES"]
        L2["envelope-wrapper.js<br/>wrapEnvelope · CommonErrors"]
        L3["response-formatter.js<br/>커맨드별 result 포맷터"]
        L4["mask-secrets.js<br/>비밀번호·토큰 마스킹"]
    end

    L1 --> ENV
    L2 --> L1
    L3 --> L1
    L4 --> L1

    style ENV fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style ST fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style ERRS fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
    style LAYER fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
```

의존 방향은 항상 `cli/ → core/ → envelope/`이며 역방향 의존은 없습니다. 자세한 내용은 [envelope/ENVELOPE_USAGE_GUIDE.md](envelope/ENVELOPE_USAGE_GUIDE.md)를 참고하세요.

---

## 5. 가드 훅 (Guard Hooks)

에이전트가 러너를 우회해 SDK 도구를 직접 실행하거나 프로젝트 파일을 손으로 쓰는 것을 막는 PreToolUse 훅입니다. 훅 스크립트는 `common/hooks/`에 하나만 있고, 호스트별 어댑터가 각 호스트의 훅 프로토콜을 이 스크립트에 연결합니다.

```mermaid
graph TB
    subgraph TOOLS["에이전트 도구 호출"]
        BASH["Bash / PowerShell<br/>(sdb ..., tizen ..., em-cli ...)"]
        WRITE["Write / Bash<br/>(config.xml, tizen-manifest.xml 쓰기)"]
        SKILL["Skill<br/>(잘못된 스킬로 라우팅)"]
    end

    subgraph GUARDS["common/hooks/ — 3개 가드, 13개 규칙"]
        G1["check-tizen-commands.sh<br/>sdb·tizen·em-cli 직접 호출 차단<br/>→ 해당 스킬로 안내"]
        G2["check-project-writes.sh<br/>Tizen 프로젝트 파일 수동 작성 차단<br/>→ tizen-create-project 안내"]
        G3["check-skill-routing.sh<br/>스킬 라우팅 규칙 검증<br/>(예: 로그 → dlog-analyzer)"]
        RULES["tizen-sdk-skills-guard.md<br/>호스트 중립 규칙 (AGENTS.md / GEMINI.md용)"]
    end

    subgraph ADAPTERS["호스트별 연결"]
        HC["Claude Code<br/>hooks.json → settings.json 스니펫<br/>matcher: Bash|PowerShell · Write|Bash · Skill"]
        HL["Cline<br/>cline/hooks/PreToolUse 어댑터<br/>Documents/Cline/Hooks + Rules"]
        HX["Codex CLI<br/>~/.codex/hooks.json + ~/.codex/AGENTS.md"]
        HG["Gemini CLI<br/>gemini/hooks BeforeTool 어댑터<br/>settings.json + ~/.gemini/GEMINI.md"]
    end

    BASH --> G1
    WRITE --> G2
    SKILL --> G3
    HC & HL & HX & HG --> GUARDS
    RULES -.-> HX & HG

    G1 & G2 & G3 -->|"allow / deny + 안내 메시지"| RESULT["도구 실행 허용 또는 차단"]

    style GUARDS fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
    style ADAPTERS fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style RESULT fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
```

훅 테스트는 `bash common/hooks/hooks.test.sh`로 실행합니다(122 케이스).

---

## 6. 하네스 배포와 동기화 (Setup & Sync)

모든 하네스는 **같은 `common/`을 같은 캐시 경로 구조**로 미러링합니다. 차이는 스킬·에이전트·훅을 어디서 읽는지와 에이전트 파일 형식뿐입니다.

```mermaid
graph TB
    SRC["로컬 체크아웃<br/>tizen-sdk-skills/common/"]

    subgraph WRAP["하네스별 2줄 래퍼"]
        W1["claude/setup/setup.sh/.ps1"]
        W2["cline/setup/setup.sh/.ps1"]
        W3["codex/setup/setup.sh/.ps1"]
        W4["gemini/setup/setup.sh/.ps1"]
    end

    CORE["common/setup/setup.sh/.ps1 --harness X<br/>setup-lib.*: 미러 복사 · 비교 · 버전 · 가드 섹션"]

    subgraph HOSTDEF["common/setup/hosts/"]
        HD1["claude.sh/.ps1"]
        HD2["cline.sh/.ps1"]
        HD3["codex.sh/.ps1"]
        HD4["gemini.sh/.ps1"]
    end

    CACHE["~/&lt;dot-dir&gt;/plugins/cache/tizen-platform/tizen-sdk-skills/&lt;version&gt;/<br/>skills · agents · lib · scripts · hooks · docs (클린 미러)"]

    subgraph LOAD["호스트가 실제로 읽는 위치"]
        LC["Claude Code<br/>~/.claude/skills · ~/.claude/agents<br/>settings.json hooks 스니펫"]
        LL["Cline<br/>~/.cline/skills<br/>Documents/Cline/Hooks · Rules"]
        LX["Codex CLI<br/>~/.agents/skills · ~/.codex/agents/*.toml<br/>~/.codex/hooks.json · AGENTS.md"]
        LG["Gemini CLI<br/>~/.gemini/skills · ~/.gemini/agents/*.md<br/>settings.json · GEMINI.md"]
    end

    VSC["VS Code 확장 (Tizen AI Extension)<br/>번들된 common/을 에디터 안에서 설치·동기화<br/>Claude Code hooks를 settings.json에 자동 병합"]

    SRC --> WRAP --> CORE
    CORE --> HOSTDEF
    HOSTDEF --> CACHE
    HD1 --> LC
    HD2 --> LL
    HD3 --> LX
    HD4 --> LG
    VSC --> CACHE
    VSC --> LC & LL & LX

    LOOKUP["러너 조회 스니펫 (모든 SKILL.md / agent.md 공통)<br/>1. 실행 중 호스트의 dot-dir 우선 (CLAUDECODE · GEMINI_CLI · CODEX_* 환경변수)<br/>2. .claude → .cline → .codex → .gemini 순 폴백<br/>3. 가장 높은 버전 디렉터리 선택"]
    LC & LL & LX & LG -.-> LOOKUP --> CACHE

    style SRC fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style CORE fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style CACHE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style VSC fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style LOOKUP fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
```

러너 조회 스니펫은 `node scripts/rewrite-runner-snippets.js --check`로 모든 스킬·에이전트에서 동일하게 유지됩니다. 호스트별 세부 경로는 [deployment/HARNESS_SETUP.md](deployment/HARNESS_SETUP.md)를 참고하세요.

---

## 7. 독립 실행형 tizen-sdk CLI (tizen-cli/)

AI 호스트 없이도 같은 커맨드를 실행할 수 있는 CLI입니다. `common/lib`을 esbuild로 **하나의 JS 파일**에 인라인하고, `common/scripts`를 옆에 복사합니다.

```mermaid
graph LR
    subgraph BUILD["빌드 (pnpm run build)"]
        SRC_TS["tizen-cli/src/*.ts<br/>index · commands · doctor<br/>envelope-adapter · command-specs/"]
        C_LIB["../common/lib/**<br/>(CommonJS core)"]
        C_SCR["../common/scripts/<br/>(t-cli 래퍼 제외)"]
        C_SK["tizen-cli/skills/"]
        ESB["esbuild.config.js<br/>package.json version 단일 소스"]
    end

    subgraph DIST["dist/"]
        BUNDLE["tizen-sdk.js<br/>(순수 JS 번들)"]
        D_SCR["scripts/"]
        D_SK["skills/"]
        PJ["plugin.json<br/>commands 자동 갱신"]
    end

    LAUNCHER["bin/tizen-sdk.js 런처<br/>dist 없으면 PLUGIN_NOT_BUILT Envelope"]

    subgraph IFACE["run(args) — 4개 인터페이스"]
        I1["--schema<br/>커맨드 카탈로그 (commander에서 생성)"]
        I2["--doctor<br/>SDK 경로 · 캐시 · 러너 상태 점검"]
        I3["--capabilities<br/>지금 사용 가능한 커맨드"]
        I4["&lt;command&gt; [options]<br/>35개 플랫 커맨드 실행"]
    end

    ADAPT["envelope-adapter.ts<br/>내부 Envelope → tizen-cli Envelope<br/>user_command 기록 · process.exit 금지"]

    SRC_TS & C_LIB --> ESB --> BUNDLE
    C_SCR --> ESB --> D_SCR
    C_SK --> ESB --> D_SK
    ESB --> PJ
    LAUNCHER --> BUNDLE
    BUNDLE --> IFACE
    I4 --> ADAPT --> OUT["stdout: Standard JSON Envelope"]

    style BUILD fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style DIST fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style IFACE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style OUT fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
```

`command-specs/`는 도메인별 선언적 스펙(sdk, check, project, device, debug, dlog-analyzer, test, certificate)이며, `tests/runner.mjs`가 실행하는 대상도 이 번들입니다.

---

## 8. 커맨드 도메인 (35개)

스킬 이름은 `tizen-<command>`, CLI에서는 `tizen-sdk <command>`입니다. 정확한 대응은 [SKILLS_COMMANDS_MAPPING.md](SKILLS_COMMANDS_MAPPING.md)를 참고하세요.

```mermaid
graph LR
    ROOT["tizen-sdk<br/>35 commands"]

    ROOT --> SDK["SDK (13)"]
    ROOT --> CHECK["Check (2)"]
    ROOT --> PROJECT["Project (5)"]
    ROOT --> DEVICE["Device (9)"]
    ROOT --> DEBUG["Debug (4)"]
    ROOT --> TEST["Test (1)"]
    ROOT --> CERT["Certificate (1)"]

    SDK --> SDK_CMDS["sdk-init<br/>sdk-install<br/>sdk-install-custom-repo<br/>validate-repo-url<br/>sdk-repo-info<br/>tv-sdk-install<br/>tv-sdk-install-from-zip<br/>update-package<br/>platform-install<br/>download-emulator-package<br/>download-mobile-platform<br/>install-rootstrap<br/>dotnet-setup"]
    CHECK --> CHECK_CMDS["check-node<br/>check-disk-space"]
    PROJECT --> PROJECT_CMDS["create-project<br/>list-templates<br/>import-wgt<br/>build-project<br/>project-delete"]
    DEVICE --> DEVICE_CMDS["create-emulator<br/>launch-emulator<br/>emulator-manager<br/>device-manager<br/>install-app<br/>sdb-helper<br/>screenshot<br/>file-transfer<br/>remote-device"]
    DEBUG --> DEBUG_CMDS["gdb-debug<br/>dotnet-debug<br/>webapp-debug<br/>dlog-analyzer"]
    TEST --> TEST_CMDS["playwright-test"]
    CERT --> CERT_CMDS["certificate-manager"]

    style ROOT fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style SDK fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style CHECK fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style PROJECT fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style DEVICE fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style DEBUG fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style TEST fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style CERT fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
```

---

## 9. 대표 사용 흐름 (End-to-End)

처음 사용자가 SDK 설치부터 디버깅까지 자연어로 진행할 때 스킬이 이어지는 순서입니다. 각 단계는 독립 실행도 가능합니다.

```mermaid
flowchart LR
    subgraph ENVSET["1. 환경 준비"]
        N["check-node"] --> D["check-disk-space"] --> SI["sdk-install<br/>(2단계: 사전 점검 + 백그라운드 설치)"]
        SI --> EP["download-emulator-package /<br/>platform-install"]
        SI -.-> TV["tv-sdk-install<br/>(TV 개발 시)"]
        SI -.-> DN["dotnet-setup<br/>(.NET 개발 시)"]
    end

    subgraph DEVICE["2. 대상 준비"]
        CE["create-emulator"] --> LE["launch-emulator"] --> DM["device-manager<br/>(sdb devices)"]
        RD["remote-device<br/>(네트워크 TV 연결)"] --> DM
    end

    subgraph PROJ["3. 프로젝트"]
        CP["create-project<br/>Native · DotNET · Web · TV · Platform"] --> BP["build-project<br/>.tpk / .wgt / .rpk / .rpm"]
        CM["certificate-manager<br/>서명 프로필"] -.-> BP
    end

    subgraph RUN["4. 배포·실행"]
        IA["install-app --run"] --> SS["screenshot"]
        IA --> FT["file-transfer"]
        IA --> SH["sdb-helper"]
    end

    subgraph DBG["5. 디버깅·테스트"]
        GD["gdb-debug<br/>(Native)"]
        DD["dotnet-debug<br/>(.NET netcoredbg)"]
        WD["webapp-debug<br/>(RWI/CDP)"] --> PT["playwright-test"]
        DL["dlog-analyzer<br/>크래시·예외 분석"]
    end

    ENVSET --> DEVICE --> PROJ --> RUN --> DBG

    style ENVSET fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style DEVICE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style PROJ fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style RUN fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style DBG fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
```

시나리오별 상세 절차는 [usage/usage.md](../usage/usage.md)와 `docs/` 아래 워크스루 문서를 참고하세요.

---

## 10. 테스트와 CI (Quality Gates)

단위 테스트(함수), 훅 테스트(가드), 통합 TC(커맨드 전체)의 세 층으로 검증하며, CI는 부작용 없는 `safe` 계층만 자동 실행합니다.

```mermaid
graph TB
    subgraph UNIT["단위 · 훅 테스트"]
        UT["common/lib/tests/run-all.js<br/>80 파일 · ≈2,890 assertions"]
        HT["common/hooks/hooks.test.sh<br/>122 케이스"]
        SLT["common/scripts/lib/common.test.sh<br/>셸 라이브러리"]
        VT["vscode: npm test<br/>118 케이스"]
    end

    subgraph SUITE["tests/ 통합 TC 스위트 (290 TC)"]
        TC["tc/*.yaml<br/>cli lane + prompt lane"]
        RUNNER["runner.mjs<br/>→ tizen-cli/dist/tizen-sdk.js 실행<br/>→ Envelope 검증 (status · jsonpath · errors)"]
        TIERS["policy/tiers.yaml"]
        SAFE["safe 66<br/>부작용 없음 · CI 게이트"]
        MUT["mutating 79<br/>scripts/run-mutating-tier.mjs"]
        DEV["device 141<br/>scripts/run-device-tier.mjs"]
        TC --> RUNNER
        TIERS --> SAFE & MUT & DEV
    end

    subgraph CI[".github/workflows/ci.yml (PR마다)"]
        J1["Lint & Type Check<br/>ESLint · Prettier · SPDX 헤더<br/>러너 스니펫 동기화 · internal-only 펜스 · tsc"]
        J2["Build<br/>tizen-cli (public variant 검증) · vscode 확장"]
        J3["Test<br/>단위 · 훅 · 셸 · TC 스키마 lint<br/>runner.mjs --tier=safe --status=approved --skip-requires=sdk,net"]
    end

    subgraph REL[".github/workflows/release.yml (태그 tizen-sdk-skills-vX.Y.Z)"]
        R1["tizen-sdk-vX.Y.Z.zip<br/>(dist/)"]
        R2["tizen-ai-extension-vX.Y.Z.vsix"]
        R3["GitHub Release 생성"]
        R1 & R2 --> R3
    end

    UNIT --> J3
    SAFE --> J3
    J1 & J2 & J3 -->|"모두 통과"| MERGE["main 병합"] --> REL

    style UNIT fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style SUITE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style SAFE fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style MUT fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style DEV fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
    style CI fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style REL fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
```

TC 스위트의 실행 방법과 계층별 주의사항은 [tests/README.md](../tests/README.md)를 참고하세요.

---

## 관련 문서

- [README.md](../README.md) — 프로젝트 개요, 빠른 시작, 35개 커맨드 표, "Project at a Glance"
- [SDK_LAYERS_OVERVIEW.md](SDK_LAYERS_OVERVIEW.md) — 중간 계층(CLI 러너 → sdk-commands → plugin-cache → 스크립트)이 존재하는 이유
- [SDK_COMMANDS_ARCHITECTURE.md](SDK_COMMANDS_ARCHITECTURE.md) — 전체 호출 흐름과 러너-함수 매핑
- [SKILLS_REFERENCE.md](SKILLS_REFERENCE.md) — 스킬별 트리거 문구·파라미터·응답 형식
- [SKILLS_COMMANDS_MAPPING.md](SKILLS_COMMANDS_MAPPING.md) — 스킬 ↔ 커맨드 대응
- [envelope/ENVELOPE_USAGE_GUIDE.md](envelope/ENVELOPE_USAGE_GUIDE.md) — Standard JSON Envelope 사용 가이드
- [deployment/HARNESS_SETUP.md](deployment/HARNESS_SETUP.md) — 하네스별 설치 경로와 새 하네스 추가 절차
- [tizen-cli/build-and-install.md](tizen-cli/build-and-install.md) — 독립 CLI 빌드·설치
- [tests/README.md](../tests/README.md) — 테스트 스위트 아키텍처
