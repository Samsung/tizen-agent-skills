# Tizen SDK Skills — 사용 사례 & 시나리오 가이드

> `tizen-sdk-skills` 플러그인을 활용한 **엔드투엔드 시나리오 가이드**와 **실제 사용 사례**를 한곳에서 찾아볼 수 있는 통합 문서입니다.
> 각 문서는 자연어 프롬프트만으로 전체 워크플로우를 실행할 수 있도록 단계별로 안내합니다.

---

## 📂 카테고리별 문서 목록

> 아래 표의 **담당 스킬**에는 각 문서의 핵심 스킬만 표기합니다. 문서에서 사용하는 전체 스킬 목록은 아래 **문서별 상세 요약**을 참조하세요.

### 1. SDK 설치 및 환경 구성

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 1 | [커스텀 저장소로 SDK 설치](../docs/sdk-install/custom-repo-walkthrough.md) | 사내 미러, 빌드 서버 산출물, 팀 미러 등 커스텀 저장소 URL에서 Tizen SDK를 설치하는 전체 과정 | `tizen-sdk-install-custom-repo` |
| 2 | [커스텀 루트스트랩 설치](../docs/rootstrap/install-rootstrap-walkthrough.md) | ZIP 파일에서 커스텀 루트스트랩 패키지를 SDK에 설치 (비표준 디바이스/아키텍처 지원 추가) | `tizen-install-rootstrap` |
| 3 | [.NET 개발 환경 설정 E2E](../docs/sdk-install/DOTNET_SETUP_E2E.md) | Windows/Linux/macOS에서 .NET SDK와 Tizen 워크로드 설치 → 밴드 불일치·권한 문제를 `[DIAG]`로 진단 | `tizen-dotnet-setup` |

### 2. 에뮬레이터 관리

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 4 | [에뮬레이터 관리자 E2E](../docs/emulator/emulator-manager-walkthrough.ko.md) | 에뮬레이터 패키지 다운로드 → 템플릿 조회 → VM 생성 → 부팅 → 앱 테스트 전체 워크플로우 | `tizen-create-emulator`, `tizen-launch-emulator` |
| 5 | [WSL에서 에뮬레이터 실행](../docs/wsl/WSL_EMULATOR_GUIDE.md) | WSL2 환경에서 Tizen 에뮬레이터 실행을 위한 설정, 문제 해결, 권장 프로필 가이드 | `tizen-launch-emulator` |

### 3. 프로젝트 생성 및 빌드

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 6 | [네이티브 앱 처음부터 끝까지](../docs/project/scenario-native-app-walkthrough.md) | SDK 설치 → 에뮬레이터 → 네이티브 템플릿 앱 생성 → 빌드 → 설치 → 디버깅 전체 흐름 | `tizen-create-project`, `tizen-build-project` |
| 7 | [DALi 템플릿 빌드 E2E](../docs/figma2dali/dali-template-build-e2e.md) | DALi Platform 앱의 사전 준비 → 프로젝트 생성 → GBS 빌드 → RPM 설치/실행 → 스크린샷 캡처 | `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

### 4. 인증서 관리

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 8 | [인증서 관리 엔드투엔드](../docs/certificate/certificate-manager-walkthrough.md) | 로컬 Tizen 인증서 → Samsung 온라인 CA 인증서 → 서명 프로필 → 빌드에 사용까지 전체 워크플로우 | `tizen-certificate-manager` |

### 5. 디버깅

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 9 | [웹앱 디버깅 (RWI/CDP)](../docs/debug/scenario-webapp-debug-walkthrough.md) | 웹앱(.wgt) 원격 디버깅: RWI 포트 포워딩 → CDP 엔드포인트 → Chrome DevTools 연결 | `tizen-webapp-debug` |
| 10 | [네이티브 앱 디버깅 (GDB)](../docs/debug/scenario-native-debug-walkthrough.md) | 네이티브 앱(.tpk, C/C++) 원격 디버깅: gdbserver 셋업 → 포트 포워딩 → 호스트 GDB 연결 | `tizen-gdb-debug` |
| 11 | [.NET 앱 디버깅 (netcoredbg)](../docs/debug/scenario-dotnet-debug-walkthrough.md) | .NET 앱(C#/NUI) 원격 디버깅: netcoredbg DAP 서버 → 포트 포워딩 → VS Code F5 연결 | `tizen-dotnet-debug` |
| 12 | [DLog 분석기 E2E](../docs/debug/scenario-dlog-analyzer-walkthrough.md) | 백그라운드 dlog 모니터링 → 크래시/예외 분석 → 근본 원인 식별 → 수정 → 재빌드 → 검증 전체 흐름 | `tizen-dlog-analyzer` |

### 6. 테스트 자동화

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 13 | [웹앱 Playwright 테스트](../docs/test/scenario-playwright-test-walkthrough.md) | 웹앱(.wgt) Playwright 자동화 테스트: 테스트 스캐폴딩 → CDP 셋업 → 테스트 실행 | `tizen-playwright-test` |

### 7. 실제 사용 사례

| # | 문서 | 설명 | 관련 스킬 |
|---|------|------|-----------|
| 14 | [테트리스 앱 개발 대화 기록](./TetrisApp/CONVERSATION_HISTORY.md) | SDK 설치부터 WebApp 테트리스 게임 구현, 빌드, 에뮬레이터 설치, 실행까지의 실제 개발 대화 기록 | `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

---

## 🗺️ 전체 기능 맵

```
Tizen SDK Skills
├── SDK 설치 / 패키지 관리
│   ├── 표준 CDN 설치 ─────────── tizen-sdk-install
│   ├── 커스텀 저장소 설치 ─────── tizen-sdk-install-custom-repo  ← [1]
│   ├── SDK 경로 초기화 ────────── tizen-sdk-init
│   ├── 플랫폼 패키지 설치 ─────── tizen-platform-install
│   ├── 모바일 플랫폼 다운로드 ─── tizen-download-mobile-platform
│   ├── TV SDK 확장 설치 ───────── tizen-tv-sdk-install           ← [4]
│   └── 패키지 업데이트 ────────── tizen-update-package
│
├── 환경 구성
│   ├── .NET 개발 환경 ─────────── tizen-dotnet-setup              ← [3]
│   ├── 디스크 공간 확인 ────────── tizen-check-disk-space
│   ├── Node.js 확인 ───────────── tizen-check-node
│   └── 커스텀 루트스트랩 ──────── tizen-install-rootstrap        ← [2]
│
├── 에뮬레이터
│   ├── 패키지 다운로드 ────────── tizen-download-emulator-package
│   ├── VM 생성 ────────────────── tizen-create-emulator           ← [4]
│   ├── VM 부팅 ────────────────── tizen-launch-emulator           ← [4], [5]
│   ├── 디바이스 관리 ──────────── tizen-device-manager
│   ├── 원격 디바이스 ──────────── tizen-remote-device
│   └── WSL 가이드 ─────────────── (문서)                           ← [5]
│
├── 프로젝트
│   ├── 프로젝트 생성 ──────────── tizen-create-project            ← [6], [7], [14]
│   ├── 프로젝트 빌드 ──────────── tizen-build-project             ← [6], [7], [8], [14]
│   └── 앱 설치/실행 ───────────── tizen-install-app               ← [6], [7], [14]
│
├── 인증서
│   ├── 로컬 인증서 생성 ────────── tizen-certificate-manager       ← [8]
│   ├── Samsung 인증서 ─────────── tizen-certificate-manager       ← [8]
│   └── 서명 프로필 ─────────────── tizen-certificate-manager       ← [8]
│
├── 디버깅
│   ├── 웹앱 (RWI/CDP) ─────────── tizen-webapp-debug              ← [9]
│   ├── 네이티브 (GDB) ─────────── tizen-gdb-debug                 ← [10]
│   ├── .NET (netcoredbg) ──────── tizen-dotnet-debug              ← [11]
│   └── DLog 분석 ──────────────── tizen-dlog-analyzer             ← [12]
│
├── 테스트
│   └── Playwright 자동화 ──────── tizen-playwright-test           ← [13]
│
├── 유틸리티
│   ├── 스크린샷 ────────────────── tizen-screenshot                ← [7]
│   ├── 파일 전송 ──────────────── tizen-file-transfer
│   └── sdb 헬퍼 ───────────────── tizen-sdb-helper
│
└── 실제 사용 사례
    └── 테트리스 앱 개발 ────────── (대화 기록)                     ← [14]
```

> 화살표(←)의 `[N]`은 위 표의 문서 번호를 가리킵니다.

---

## 🚀 빠른 시작: 목적별 가이드 선택

| 하고 싶은 일 | 읽을 문서 |
|-------------|----------|
| 커스텀 저장소에서 SDK를 설치하고 싶다 | [커스텀 저장소 설치](../docs/sdk-install/custom-repo-walkthrough.md) |
| 커스텀 루트스트랩을 추가하고 싶다 | [루트스트랩 설치](../docs/rootstrap/install-rootstrap-walkthrough.md) |
| .NET 개발 환경을 설정하고 싶다 | [.NET 설정 E2E](../docs/sdk-install/DOTNET_SETUP_E2E.md) |
| 에뮬레이터를 만들고 부팅하고 싶다 | [에뮬레이터 관리자 E2E](../docs/emulator/emulator-manager-walkthrough.ko.md) |
| WSL에서 에뮬레이터를 돌리고 싶다 | [WSL 에뮬레이터 가이드](../docs/wsl/WSL_EMULATOR_GUIDE.md) |
| 네이티브 앱을 만들어보고 싶다 | [네이티브 앱 E2E](../docs/project/scenario-native-app-walkthrough.md) |
| DALi Platform 앱을 빌드하고 싶다 | [DALi 템플릿 빌드 E2E](../docs/figma2dali/dali-template-build-e2e.md) |
| 인증서를 만들고 서명하고 싶다 | [인증서 관리 E2E](../docs/certificate/certificate-manager-walkthrough.md) |
| 웹앱을 디버깅하고 싶다 | [웹앱 디버깅 (RWI/CDP)](../docs/debug/scenario-webapp-debug-walkthrough.md) |
| 네이티브 앱을 디버깅하고 싶다 | [네이티브 앱 디버깅 (GDB)](../docs/debug/scenario-native-debug-walkthrough.md) |
| .NET 앱을 디버깅하고 싶다 | [.NET 앱 디버깅 (netcoredbg)](../docs/debug/scenario-dotnet-debug-walkthrough.md) |
| dlog로 크래시를 분석하고 싶다 | [DLog 분석기 E2E](../docs/debug/scenario-dlog-analyzer-walkthrough.md) |
| 웹앱 자동화 테스트를 하고 싶다 | [Playwright 테스트 E2E](../docs/test/scenario-playwright-test-walkthrough.md) |
| 실제 개발 사례를 보고 싶다 | [테트리스 앱 개발 기록](./TetrisApp/CONVERSATION_HISTORY.md) |

---

## 📖 문서별 상세 요약

### 1. 커스텀 저장소로 SDK 설치

**문서:** [custom-repo-walkthrough.md](../docs/sdk-install/custom-repo-walkthrough.md) · **담당 스킬:** `tizen-sdk-install-custom-repo`

기본 public CDN 미러 대신 **커스텀 저장소 URL**(사내 미러, 빌드 서버 산출물, 팀 미러, 로컬 HTTP 서버)에서 Tizen SDK를 설치하는 방법을 안내합니다. 저장소 URL 검증 → 사전 확인 → SDK 설치 → 검증 → repository.info 확인의 5단계로 구성됩니다.

| 단계 | 작업 | 예상 시간 |
|------|------|-----------|
| 1 | 저장소 URL 유효성 검사 (읽기 전용) | 수 초 |
| 2 | 설치 사전 확인 (URL, 디스크 공간, 기설치 여부) | 수 초 |
| 3 | 커스텀 URL에서 SDK 설치 (~121개 패키지) | 10–15분 |
| 4 | 설치 검증 | 수 초 |
| 5 | repository.info에 기록된 저장소 URL 확인 | 수 초 |

**핵심 특징:**
- **`--force` 플래그**: 기존 SDK가 있을 때 저장소를 전환하려면 필수
- **자동 재개**: 설치 실패 시 동일 명령 재실행으로 이전 위치에서 재개
- **하류 효과**: 커스텀 저장소 URL이 `repository.info`에 기록되어 이후 패키지 업데이트/에뮬레이터 패키지 다운로드가 자동으로 같은 저장소 사용
- **유효한 저장소 조건**: `pkg_list_{OS}-{64,32}` 파일을 제공하는 디렉토리 URL이어야 함

---

### 2. 커스텀 루트스트랩 설치

**문서:** [install-rootstrap-walkthrough.md](../docs/rootstrap/install-rootstrap-walkthrough.md) · **담당 스킬:** `tizen-install-rootstrap`

ZIP 파일에서 커스텀 루트스트랩 패키지를 Tizen SDK에 설치하는 과정을 안내합니다. 표준 SDK 배포에 포함되지 않은 새로운 디바이스 프로필, 아키텍처, 플랫폼 버전에 대한 지원을 추가할 때 사용합니다.

| 단계 | 작업 | 예상 시간 |
|------|------|-----------|
| 1 | 설치 사전 확인 (ZIP 검증, 구조 감지, 중복 확인) | 수 초 |
| 2 | ZIP에서 루트스트랩 설치 (압축 해제 → 보안 검증 → SDK 복사) | 30–60초 |
| 3 | 설치 확인 | 수 초 |

**핵심 특징:**
- **ZIP 구조 자동 감지**: `data/` 또는 `tizen-studio/` 레이아웃 자동 인식
- **XML 메타데이터 파싱**: 파일명에서 프로필, 버전, 아키텍처, 타입(public/private), 타임스탬프 추출
- **보안 검증**: 경로 순회(`..`), 심볼릭 링크, 절대 경로 자동 거부
- **지원 아키텍처**: x86, x86_64, ARM(32비트), AArch64, RISC-V 64비트
- **`--force` 재설치**: 기존 루트스트랩 재설치 시 필수

---

### 3. .NET 개발 환경 설정 E2E

**문서:** [DOTNET_SETUP_E2E.md](../docs/sdk-install/DOTNET_SETUP_E2E.md) · **담당 스킬:** `tizen-dotnet-setup`

Tizen .NET 앱을 개발하기 위한 **.NET SDK + Tizen 워크로드** 설치를 Windows / Linux / macOS 각각에 대해 안내합니다. 플랫폼마다 동일한 세 가지 방법(Agent 자연어 요청, `tizen-cli` 명령, 수동 설정)을 같은 순서로 제시하며, 사내 프록시 설정과 관리자/sudo 권한 요건을 함께 다룹니다.

| 단계 | 작업 | 예상 시간 |
|------|------|-----------|
| 1 | .NET SDK 감지 (없으면 설치 안내 후 종료) | 수 초 |
| 2 | Samsung workload-install 스크립트 다운로드 및 실행 | 3–10분 |
| 3 | 설치한 것과 **동일한 dotnet**으로 워크로드 검증 | 수 초 |
| 4 | 실패 시 `[DIAG]` 진단 정보 출력 | 수 초 |

**핵심 특징:**
- **설치 대상 고정**: Samsung 설치기는 `DOTNET_ROOT` 또는 `%ProgramFiles%\dotnet`을 스스로 고르지만, 러너가 `-d`로 검증 대상과 동일한 dotnet에 고정 (issue #258)
- **비파괴적 환경 변수 처리**: `DOTNET_ROOT`는 해당 실행에서만 재정의, 사용자의 영구 설정값은 유지
- **종료 코드로 원인 구분**: `0` 성공 · `1` 설치 실패(권한 포함) · `2` SDK 없음 · `3` 다른 SDK 밴드에 등록됨
- **`[DIAG]` 진단**: dotnet 경로/버전/밴드, 설치기가 처리한 SDK 전체, 매니페스트 위치, 권한 문제 여부를 구조화해 출력
- **에이전트 오진 방지**: 실패 envelope을 받으면 에이전트는 추가 진단이나 `--force` 재시도 없이 그대로 보고

**복사용 프롬프트:**
```
.NET SDK 설정해줘
```

---

### 4. 에뮬레이터 관리자 E2E

**문서:** [emulator-manager-walkthrough.ko.md](../docs/emulator/emulator-manager-walkthrough.ko.md) · **담당 스킬:** `tizen-download-emulator-package`, `tizen-create-emulator`, `tizen-launch-emulator`

완전한 Tizen 에뮬레이터 VM 워크플로우를 안내합니다: 에뮬레이터 패키지 다운로드 → 템플릿/플랫폼 목록 → VM 생성 → 부팅 → sdb 연결 → 앱 테스트. 다양한 화면 크기(1080, 720, 3840), 하드웨어 커스터마이징, TV 프로필, 원본 디스크 이미지 생성을 지원합니다.

| 단계 | 작업 | 예상 시간 |
|------|------|-----------|
| 1 | 에뮬레이터 패키지 다운로드 | 2–5분 |
| 2 | 사용 가능한 화면 크기(템플릿) 목록 | 수 초 |
| 3 | 에뮬레이터 VM 생성 | 수 초 |
| 4 | 에뮬레이터 VM 부팅 (콜드 부팅) | 5–7분 |
| 5 | sdb 연결 확인 | 수 초 |
| 6 (선택) | VM 설정 수정 (화면 크기, RAM, GL 가속, 파일 공유) | 수 초 |
| 7 (선택) | 기존 VM 목록 및 관리 | 수 초 |
| 8 | 앱 설치 및 테스트 | 수 초–수십 초 |

**핵심 특징:**
- **화면 크기 옵션**: 1080(권장), 720(빠른 부팅), 3840(4K TV)
- **하드웨어 커스터마이징**: RAM(512/768/1024MB), GL 가속, CPU 가상화, 파일 공유, 스킨
- **TV 에뮬레이터**: TV SDK 확장 필요, HD3840 TV 템플릿(3840×1080 해상도)
- **원본 디스크 이미지**: 스냅샷 복원, 사전 구성 이미지 재사용 가능
- **문제 해결**: 부팅 실패 진단(LAUNCH_DIAG), Java/JNA 오류, KVM 누락, 디스플레이 문제

**E2E 경로:**
- **경로 1 (빠른 시작)**: 1080p 에뮬레이터 → 앱 테스트 (~10–15분)
- **경로 2 (TV)**: TV SDK 설치 → 3840 TV 에뮬레이터 (~15–20분)
- **경로 3 (커스텀 하드웨어)**: 720p, 1024MB RAM, GL 가속 없음 (~10–15분)
- **경로 4 (원스텝)**: 생성과 동시에 부팅 (~10–15분)

---

### 5. WSL에서 에뮬레이터 실행

**문서:** [WSL_EMULATOR_GUIDE.md](../docs/wsl/WSL_EMULATOR_GUIDE.md) · **담당 스킬:** `tizen-launch-emulator`

WSL2(Windows Subsystem for Linux) 환경에서 Tizen 에뮬레이터를 실행하기 위한 설정, 문제 해결, 권장 프로필을 다룹니다. 중첩된 가상화 제약으로 인해 표준 Tizen 프로필의 홈 화면(Flutter 앱)이 EGL config 선택 실패로 크래시하는 문제를 심층 분석하고, TV 프로필을 대안으로 제시합니다.

| 항목 | 내용 |
|------|------|
| **필수 요구사항** | Windows 11 21H2+, WSL2, `.wslconfig`에 `nestedVirtualization = true` |
| **표준 Tizen 프로필** | 홈 화면(Flutter)이 EGL config 선택 실패로 크래시 루프 → `/opt` 디스크 고갈 |
| **TV 프로필 (권장)** | Flutter 홈 화면 없음 → WSL에서 안정적 부팅, 더 가벼운 리소스 |
| **자동 수정 (플러그인 내장)** | WSL 감지 → 크래시 루프 정지 → 홈 화면 직접 실행 → `/opt` 회수 |
| **실제 원인** | Flutter 엔진의 `ChooseEGLConfiguration` 실패 (BUXTON 오류는 부산물) |

**권장사항:**
- **홈 화면 UI 필요** → TV 프로필 (WSL에서 실측 확인된 유일한 해결책)
- **앱 개발/테스트만** → 표준 `tizen` 프로필 유지, `app_launcher`로 직접 실행
- **CI/자동화** → TV 프로필 (수동 개입 없음)
- **플러그인 자동 수정** → WSL에서 기본 동작, 재시도 루프 정지 + 홈 화면 직접 실행

---

### 6. 네이티브 앱 처음부터 끝까지

**문서:** [scenario-native-app-walkthrough.md](../docs/project/scenario-native-app-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

처음 사용하는 분이 한 번에 전체 흐름을 시험해볼 수 있도록, SDK 설치 → 에뮬레이터 → 네이티브 템플릿 앱 생성 → 빌드 → 설치 → 디버깅을 단계별로 안내합니다.

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | 에뮬레이터 생성 및 실행 | `tizen-device-manager` |
| 3 | 네이티브 ServiceApp 템플릿 앱 생성 | `tizen-create-project` |
| 4 | 앱 빌드 (`.tpk` 패키징) | `tizen-build-project` |
| 5 | 앱 설치 | `tizen-install-app` |
| 6 | 앱 디버깅 (GDB) | `tizen-gdb-debug` |

**복사용 프롬프트:**
```
1) 타이젠 SDK 설치해줘
2) 에뮬레이터 생성하고 실행해줘
3) 네이티브 ServiceApp 템플릿으로 MyApp 이라는 앱 만들어줘
4) 방금 만든 앱 빌드해줘
5) 빌드한 앱 설치해줘
6) 방금 설치한 앱 디버깅해줘
```

---

### 7. DALi 템플릿 빌드 E2E

**문서:** [dali-template-build-e2e.md](../docs/figma2dali/dali-template-build-e2e.md) · **담당 스킬:** `tizen-create-project`, `tizen-build-project`, `tizen-device-manager`, `tizen-install-app`, `tizen-screenshot`

`dali_demo` 템플릿을 사용하여 DALi Platform 앱을 사전 준비 → 프로젝트 생성 → GBS 빌드 → RPM 설치/실행 → 스크린샷 캡처까지의 전체 과정을 하나의 가이드로 안내합니다. C++17 프리플라이트 사전 차단, 빌드 실패 진단 개선, enlightenment_info 스크린샷 폴백 등 figma2dali 개선 사항이 통합되었습니다.

| 단계 | 작업 | 담당 스킬 | 예상 시간 |
|------|------|-----------|-----------|
| 1 | 템플릿 목록 조회 | `tizen-create-project` | ~5초 |
| 2 | 프로젝트 생성 (dali_demo 템플릿) | `tizen-create-project` | ~11초 |
| 3 | GBS 빌드 (C++17 프리플라이트 포함) | `tizen-build-project` | ~23초 |
| 4 | 디바이스/에뮬레이터 준비 | `tizen-device-manager` | ~159초 |
| 5 | RPM 설치 및 실행 | `tizen-install-app` | ~13초 |
| 6 | 스크린샷 캡처 | `tizen-screenshot` | ~3초 |

**핵심 특징:**
- **GBS 빌드**: `tz build`가 아닌 GBS(Git Build System) 사용, 3단계 fallback (tizen-cli 플러그인 → 시스템 gbs → 에러)
- **C++17 프리플라이트**: `dali2-*` 의존성이 있는데 C++17 설정이 없으면 GBS 실행 전 exit 4로 즉시 중단
- **빌드 실패 진단**: 실패 시 응답 Envelope에 실제 컴파일 에러가 직접 포함됨
- **RPM 실행 환경**: `owner` 사용자(uid 5001)로 실행, Wayland/DBus 환경 변수 자동 설정
- **재실행 스크립트**: 설치 시 호스트에 `~/bin/run-<app>.sh` 자동 생성
- **스크린샷**: `enlightenment_info -dump_screen`으로 1920×1080 네이티브 해상도 캡처

---

### 8. 인증서 관리 엔드투엔드

**문서:** [certificate-manager-walkthrough.md](../docs/certificate/certificate-manager-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-certificate-manager`, `tizen-build-project`

Tizen 인증서 및 Samsung 온라인 CA 인증서의 전체 워크플로우를 안내합니다: SDK 설치 → 로컬 Tizen 인증서 → Samsung 인증서 → 서명 프로필 → 빌드에 사용. 두 가지 유형의 인증서(로컬 Tizen 자체 서명, Samsung 온라인 CA 발급)를 모두 다룹니다.

| 단계 | 작업 | 담당 에이전트 | 필수 여부 |
|------|------|---------------|-----------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` | 필수 |
| 2 | 로컬 Tizen 작성자 인증서 생성 | `tizen-certificate-manager` | 필수 |
| 2b (선택) | 번들 배포자 인증서 목록 조회 | `tizen-certificate-manager` | 선택 |
| 3 | 서명 프로필 생성 (로컬 Tizen) | `tizen-certificate-manager` | 필수 |
| 4 (선택) | 인증서 가져오기 또는 검사 | `tizen-certificate-manager` | 선택 |
| 5 (선택) | Samsung 작성자 인증서 생성 | `tizen-certificate-manager` | Samsung 배포 시 |
| 6 (선택) | 디바이스 DUID 수집 | `tizen-certificate-manager` | Samsung 배포 시 |
| 7 (선택) | Samsung 배포자 인증서 생성 | `tizen-certificate-manager` | Samsung 배포 시 |
| 8 (선택) | Samsung 서명 프로필 생성 | `tizen-certificate-manager` | Samsung 배포 시 |
| 9 | 서명 프로필로 빌드 | `tizen-build-project` | 필수 |

**E2E 경로:**
- **경로 1 (로컬만)**: SDK 설치 → 로컬 인증서 → 서명 프로필 → 빌드 (~5–10분)
- **경로 2 (Samsung)**: SDK 설치 → Samsung 작성자 인증서 → DUID → Samsung 배포자 인증서 → Samsung 프로필 → 빌드 (~15–20분)
- **경로 3 (하이브리드)**: 로컬 + Samsung 프로필 모두 유지

**핵심 특징:**
- **비밀번호 보안**: 대화형 마스킹 입력, 명령줄 인수/로그에 노출 안 됨
- **Samsung 로그인**: 최초 1회 브라우저 로그인, 이후 캐시된 토큰 자동 재사용
- **비밀번호 저장**: OS 수준 자격 증명 시스템(Windows DPAPI, macOS Keychain, Linux libsecret) 사용
- **인증서 재사용**: 단일 작성자 인증서를 여러 서명 프로필에 사용 가능

---

### 9. 웹앱 디버깅 (RWI/CDP)

**문서:** [scenario-webapp-debug-walkthrough.md](../docs/debug/scenario-webapp-debug-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-webapp-debug`

Tizen 웹앱(.wgt) 원격 디버깅을 한 번에 전체 흐름으로 시험해볼 수 있도록 안내합니다. 웹앱은 웹 런타임(Chromium 계열 엔진)에서 실행되므로 GDB/netcoredbg가 아닌 RWI(Remote Web Inspector) + CDP(Chrome DevTools Protocol)로 디버깅합니다.

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | 에뮬레이터 생성 및 실행 | `tizen-device-manager` |
| 3 | 웹앱 BasicUI 템플릿 생성 | `tizen-create-project` |
| 4 | 앱 빌드 (`.wgt` 패키징) | `tizen-build-project` |
| 5 | 앱 설치 | `tizen-install-app` |
| 6 | 웹앱 디버깅 셋업 (RWI/CDP) | `tizen-webapp-debug` |
| 7 | Chrome DevTools로 연결 | (사용자) |

**핵심 특징:**
- **자동 CDP 셋업**: `app_launcher -w` → RWI 포트 파싱 → `sdb forward` → CDP 검증이 자동 수행
- **포트 포워딩 유지**: 셋업 후 앱이 실행 중인 동안 언제든 재연결 가능
- **DevTools 연결**: Elements/Console/Sources/Network 패널로 실시간 디버깅
- **에러 매핑**: 디바이스 없음, Native/.NET 앱 ID 오용, 포트 점유, RWI 미지원 이미지 등

---

### 10. 네이티브 앱 디버깅 (GDB)

**문서:** [scenario-native-debug-walkthrough.md](../docs/debug/scenario-native-debug-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

Tizen 네이티브 앱(.tpk, C/C++) 원격 디버깅을 한 번에 전체 흐름으로 시험해볼 수 있도록 안내합니다. 디바이스의 `gdbserver`와 호스트의 GDB를 `sdb forward`로 연결해 디버깅합니다.

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | 에뮬레이터 생성 및 실행 | `tizen-create-emulator` → `tizen-launch-emulator` |
| 3 | 네이티브 ServiceApp 템플릿 생성 | `tizen-create-project` |
| 4 | **Debug 구성으로** 빌드 (`.tpk`) | `tizen-build-project` |
| 5 | 앱 설치 | `tizen-install-app` |
| 6 | GDB 디버깅 셋업 (gdbserver + 포트 포워딩 + init 파일) | `tizen-gdb-debug` |
| 7 | 호스트 터미널에서 GDB 실행 | (사용자) |

**디버깅 모드:**

| 모드 | 동작 | 언제 쓰나 |
|------|------|-----------|
| **attach** (기본) | 앱 실행 후 PID를 찾아 gdbserver가 붙음 | 앱이 뜬 뒤 호출되는 콜백을 잡을 때 |
| **launch** | gdbserver가 직접 바이너리 실행, 진입점에서 멈춤 | `main`, `service_app_create` 등 시작 코드를 잡을 때 |

**핵심 특징:**
- **Debug 빌드 필수**: Release 바이너리로는 브레이크포인트가 걸리지 않음
- **SDK GDB 자동 선택**: 디바이스 아키텍처(`uname -m`)에 맞는 SDK 포함 GDB 자동 찾기
- **GDB init 파일 자동 생성**: `file`/`target remote`/`break`를 자동 수행
- **대화형 GDB는 사용자가 실행**: 에이전트가 터미널을 멈추지 않도록 명령만 출력
- **`main` 브레이크포인트**: launch 모드에서만 히트 (attach 모드에서는 이미 지나간 상태)

---

### 11. .NET 앱 디버깅 (netcoredbg)

**문서:** [scenario-dotnet-debug-walkthrough.md](../docs/debug/scenario-dotnet-debug-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-dotnet-setup`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-dotnet-debug`

Tizen .NET 앱(C#/NUI) 원격 디버깅을 한 번에 전체 흐름으로 시험해볼 수 있도록 안내합니다. .NET 앱은 CoreCLR에서 실행되므로 GDB가 아닌 netcoredbg를 사용해 DAP(Debug Adapter Protocol) 서버로 디버깅합니다.

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | .NET SDK + Tizen 워크로드 확인/설치 | `tizen-dotnet-setup` |
| 3 | 에뮬레이터 생성 및 실행 | `tizen-create-emulator` → `tizen-launch-emulator` |
| 4 | 닷넷 NUI 템플릿 앱 생성 | `tizen-create-project` |
| 5 | **Debug 구성으로** 빌드 (`.tpk`) | `tizen-build-project` |
| 6 | 앱 설치 | `tizen-install-app` |
| 7 | .NET 디버깅 셋업 (netcoredbg DAP 서버 + 포트 포워딩) | `tizen-dotnet-debug` |
| 8 | VS Code에서 F5로 연결 | (사용자) |

**디버깅 모드:**

| 모드 | 동작 | 장단점 |
|------|------|--------|
| **launch** (권장) | netcoredbg DAP 서버 아래에서 앱 시작, `Main()` 전에 정지 | 시작 코드 잡을 수 있음. VS Code 필요 |
| **attach** | 앱 실행 후 PID로 netcoredbg CLI attach | `Main()` 놓침. Tizen에서 CoreCLR 디버그 전송로 없어 실패 잦음 |

**핵심 특징:**
- **netcoredbg 자동 설치**: SDK on-demand 패키지에서 디바이스 아키텍처에 맞게 자동 배포
- **Debug 빌드 필수 (가장 흔한 실패 원인)**: portable PDB가 없으면 브레이크포인트가 절대 걸리지 않음
- **VS Code 연결**: `.vscode/launch.json`에 `debugServer` 포트 설정 → F5로 DAP 서버에 연결
- **앱 정지 상태 유지**: DAP 클라이언트가 붙을 때까지 `Main()` 전에 정지, 연결 해제 후 재연결 가능

---

### 12. DLog 분석기 E2E

**문서:** [scenario-dlog-analyzer-walkthrough.md](../docs/debug/scenario-dlog-analyzer-walkthrough.md) · **담당 스킬:** `tizen-launch-emulator`, `tizen-dlog-analyzer`, `tizen-build-project`, `tizen-install-app`

Tizen 디바이스/에뮬레이터의 dlog 출력을 백그라운드에서 지속적으로 수집하고 분석하는 전체 흐름을 안내합니다: 에뮬레이터 실행 → 백그라운드 모니터링 시작 → 앱 빌드/설치/실행 → 크래시 분석 → 수정 적용 → 재빌드/재설치 → 검증 → 모니터링 중지. 사용자가 직접 원시 dlog를 파싱할 필요 없이 에이전트가 크래시/예외의 근본 원인을 식별하고 수정까지 수행합니다.

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | 에뮬레이터 실행 | `tizen-launch-emulator` |
| 2 | 백그라운드 dlog 모니터링 시작 | `tizen-dlog-analyzer` |
| 3 | 앱 빌드 (Debug) | `tizen-build-project` |
| 4 | 앱 설치 및 실행 | `tizen-install-app` |
| 5 | 사용자 확인: 정상 또는 이슈 | (에이전트 상호작용) |
| 6 | 분석된 로그 확인 (크래시/예외 데이터) | `tizen-dlog-analyzer` |
| 7 | 수정 적용 (소스 코드 편집) | (에이전트) |
| 8 | 앱 재빌드 | `tizen-build-project` |
| 9 | 앱 재설치 및 재실행 | `tizen-install-app` |
| 10 | 로그 재확인으로 수정 검증 | `tizen-dlog-analyzer` |
| 11 | 모니터링 중지 (정리) | `tizen-dlog-analyzer` |

**핵심 특징:**
- **백그라운드 분리 프로세스**: 모니터링은 분리된 백그라운드 프로세스로 실행되어 에이전트 세션이 종료되어도 유지됨
- **앱 실행 전 모니터링 시작**: 초기화 로그(초기화 실패, 초기 크래시) 캡처를 위해 앱 실행 전에 시작해야 함
- **자동 크래시 분석**: 크래시 덤프 시그니처, 예외 스택 트레이스, EGL/그래픽 실패, 권한 거부, 메모리 할당 실패 자동 식별
- **수정-재빌드-검증 루프**: 크래시가 해결될 때까지 수정 → 재빌드 → 재설치 → 재확인 주기 반복 가능
- **단일 인스턴스만 실행**: 이미 실행 중인 경우 `start`는 `already_running` 에러 반환, 먼저 `stop` 필요
- **플랫폼별 바이너리**: 셋업 스크립트가 해당 플랫폼(linux/macos/windows) 바이너리만 복사

---

### 13. 웹앱 Playwright 테스트

**문서:** [scenario-playwright-test-walkthrough.md](../docs/test/scenario-playwright-test-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-playwright-test`

Tizen 웹앱(.wgt)을 Playwright로 자동화 테스트하는 전체 흐름을 안내합니다. Playwright가 CDP(Chrome DevTools Protocol)로 디바이스의 웹 런타임에 attach하여 테스트를 실행합니다. CDP 셋업은 내부적으로 `tizen-webapp-debug` 흐름을 재사용합니다.

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | 에뮬레이터 생성 및 실행 | `tizen-device-manager` |
| 3 | 웹앱 BasicUI 템플릿 생성 | `tizen-create-project` |
| 4 | 앱 빌드 (`.wgt`) | `tizen-build-project` |
| 5 | 앱 설치 | `tizen-install-app` |
| 6 | 테스트 파일 스캐폴딩 | `tizen-playwright-test` (`--scaffold`) |
| 7 | 테스트 프로젝트에 Playwright 설치 | (사용자/에이전트) |
| 8 | 테스트 실행 (CDP 셋업 + node 스폰) | `tizen-playwright-test` |

**핵심 특징:**
- **attach-only 패턴**: `connectOverCDP` → `contexts()[0].pages()[0]`, 절대 `page.goto()`/`newPage()` 호출 안 함 (Tizen 웹 런타임이 단일 페이지를 소유)
- **진짜 exit code**: `console.assert` 대신 실패 카운트 → `process.exit(1)`로 러너가 pass/fail 판정
- **스캐폴딩된 템플릿**: `tizen-playwright.test.js` + `package.json` 자동 생성
- **`--no-setup` 재실행**: 앱이 계속 실행 중일 때 앱 재기동 없이 테스트만 재실행
- **실패 시 스크린샷**: assertion 실패 시 `test-failure.png` 자동 생성
- **고정 테스트 프로젝트 경로**: `~/tizen-playwright-test` (Windows: `%USERPROFILE%\tizen-playwright-test`)

---

### 14. 테트리스 앱 개발 대화 기록

**문서:** [CONVERSATION_HISTORY.md](./TetrisApp/CONVERSATION_HISTORY.md) · **관련 스킬:** `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-device-manager`

SDK 설치부터 WebApp 테트리스 게임 구현, 빌드, 에뮬레이터 설치, 실행까지의 **실제 개발 대화 기록**입니다. `tizen-sdk-skills` 플러그인을 사용한 실제 사용 사례로, 각 단계에서 사용자가 입력한 자연어 프롬프트와 그 결과를 상세하게 기록합니다.

| 단계 | 작업 | 결과 |
|------|------|------|
| 0 | Tizen SDK 설치 (123개 패키지) | ✅ 성공 |
| 1–3 | Native ServiceApp 프로젝트 생성 (MyServiceApp2) | ✅ 성공 |
| 4 | Native ServiceApp 빌드 | ✅ 성공 (`.tpk`) |
| 5–6 | UI가 있는 테트리스 앱으로 전환 결정 → WebApp 프로젝트 생성 (TetrisApp) | ✅ 성공 |
| 7 | 테트리스 게임 구현 (HTML/CSS/JavaScript, ~500줄) | ✅ 완성 |
| 8 | TetrisApp 빌드 | ✅ 성공 (`TetrisApp.wgt`) |
| 9 | 에뮬레이터 생성 및 실행 (tizen-vm-default) | ✅ 성공 (emulator-26101) |
| 10 | 앱 설치 | ✅ 성공 (App ID: YJgrMEIE3w.TetrisApp) |
| 11 | 앱 실행 | ✅ 성공 (PID 3560) |
| 12 | 프로젝트 보고서 생성 | ✅ 완성 |

**핵심 특징:**
- **실제 사용 사례**: 자연어 프롬프트만으로 SDK 설치부터 앱 실행까지 전체 워크플로우 완수
- **앱 타입 전환**: Native ServiceApp → WebApp (UI가 필요하여 전환)
- **테트리스 게임 구현**: 7가지 테트로미노, 충돌 감지, 회전, 점수 계산, 난이도 증가, Canvas 렌더링
- **다크 테마 UI**: 네온 파란색 강조, Flexbox 레이아웃, 호버 효과
- **전체 소스 코드 포함**: `index.html`, `css/style.css`, `js/main.js`

---

## 📊 전체 문서 비교표

| # | 문서 | 앱 타입 | 주요 스킬 | 예상 시간 |
|---|------|---------|-----------|-----------|
| 1 | 커스텀 저장소 SDK 설치 | — | `tizen-sdk-install-custom-repo` | 10–15분 |
| 2 | 커스텀 루트스트랩 설치 | — | `tizen-install-rootstrap` | 1분 |
| 3 | .NET 개발 환경 설정 E2E | DotNET | `tizen-dotnet-setup` | 5–15분 |
| 4 | 에뮬레이터 관리자 E2E | — | `tizen-create-emulator`, `tizen-launch-emulator` | 10–20분 |
| 5 | WSL 에뮬레이터 가이드 | — | `tizen-launch-emulator` | — |
| 6 | 네이티브 앱 E2E | Native (C/C++) | `tizen-create-project`, `tizen-build-project`, `tizen-gdb-debug` | — |
| 7 | DALi 템플릿 빌드 E2E | Platform (C++/DALi) | `tizen-create-project`, `tizen-build-project`, `tizen-screenshot` | ~4분 |
| 8 | 인증서 관리 E2E | — | `tizen-certificate-manager` | 5–20분 |
| 9 | 웹앱 디버깅 | WebApp (.wgt) | `tizen-webapp-debug` | — |
| 10 | 네이티브 앱 디버깅 | Native (.tpk) | `tizen-gdb-debug` | — |
| 11 | .NET 앱 디버깅 | DotNET (.tpk) | `tizen-dotnet-debug` | — |
| 12 | DLog 분석기 E2E | 모든 앱 타입 | `tizen-dlog-analyzer` | — |
| 13 | Playwright 테스트 | WebApp (.wgt) | `tizen-playwright-test` | — |
| 14 | 테트리스 앱 개발 | WebApp (.wgt) | `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project` | — |

---

## 📌 관련 문서

- [전체 에이전트 개요 (README)](../docs/README.md)
- [스킬 레퍼런스](../docs/SKILLS_REFERENCE.md)

---

*최종 업데이트: 2026-09-02*
