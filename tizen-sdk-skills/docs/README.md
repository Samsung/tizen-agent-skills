# Tizen SDK Skills

[English](README.en.md) | 한국어

Tizen 개발 환경 구성, 프로젝트 생성, 빌드, 배포, 디버깅을 자동화하는 **통합 Cline 스킬 모음**입니다.

## 📚 문서 안내

이 문서(README)가 플러그인의 **전체 개요이자 사용자 매뉴얼**입니다. 세부 주제는 하위 폴더의 문서를 참고하세요.

| 문서 | 내용 |
|---|---|
| [project/scenario-native-app-walkthrough.md](project/scenario-native-app-walkthrough.md) | **처음 사용자용 워크스루** — SDK 설치 → 에뮬레이터 → 앱 생성 → 빌드 → 설치 → 디버깅을 자연어로 체험 |

| [debug/scenario-webapp-debug-walkthrough.md](debug/scenario-webapp-debug-walkthrough.md) | **웹앱 디버깅 E2E 시나리오** — 웹앱 생성 → 빌드 → 설치 → RWI/CDP 디버깅 → DevTools/Playwright 연결 + 검증 체크리스트 |
| [debug/scenario-native-debug-walkthrough.md](debug/scenario-native-debug-walkthrough.md) | **네이티브 앱 디버깅 E2E 시나리오** — 네이티브 앱 생성 → Debug 빌드 → 설치 → gdbserver/포트 포워딩 셋업 → 호스트 GDB 연결 + 검증 체크리스트 |
| [debug/scenario-dotnet-debug-walkthrough.md](debug/scenario-dotnet-debug-walkthrough.md) | **.NET 앱 디버깅 E2E 시나리오** — 닷넷 앱 생성 → Debug 빌드 → 설치 → netcoredbg DAP 서버 셋업 → VS Code(F5) 연결 + 검증 체크리스트 |
| [wsl/WSL_EMULATOR_GUIDE.md](wsl/WSL_EMULATOR_GUIDE.md) | **WSL 환경 에뮬레이터 가이드** — WSL2에서 Tizen 에뮬레이터 실행 시 설정, 프로필 선택(표준 vs TV), Buxton 권한 문제 해결, 성능 최적화 |
| [envelope/](envelope/) | **Standard JSON Envelope** — 응답 표준화 계층: [사용 가이드](envelope/ENVELOPE_USAGE_GUIDE.md), [호출 흐름](envelope/ENVELOPE_CALL_FLOW.md), [formatSdkInit 해설](envelope/FORMAT_SDK_INIT_EXPLAINED.md), [구현 요약](envelope/ENVELOPE_IMPLEMENTATION_SUMMARY.md) |
| [sdk-install/](sdk-install/) | **SDK 설치 흐름** — [전체 흐름](sdk-install/INSTALLATION_FLOW.md), [에이전트-installSdk 통합](sdk-install/AGENT_TO_INSTALLSDK_INTEGRATION.md), [설치 검증](sdk-install/SDK_INSTALLATION_VERIFICATION.md), [사용자 지정 저장소 설치](sdk-install/CUSTOM_REPOSITORY_INSTALL.md), [.NET 개발 환경 설정 E2E](sdk-install/DOTNET_SETUP_E2E.md) |
| [SKILLS_COMMANDS_MAPPING.md](SKILLS_COMMANDS_MAPPING.md) | **스킬 ↔ 커맨드 맵핑** — 29개 스킬이 34개 tizen-cli 커맨드에 어떻게 대응하는지, 개수가 다른 이유 |

구현 코드는 [common/lib/](../common/lib/README.md)에 있습니다.

---

## 개요


`tizen-sdk-skills`는 Tizen 애플리케이션 개발을 위한 29가지 자동화 스킬을 제공합니다.

### 29가지 핵심 스킬

| 스킬 | 설명 | 용도 |
|------|------|------|
| **tizen-sdk-init** | Tizen SDK 설치 경로 설정 | 수동 설치 SDK 또는 비기본 경로 등록 |
| **tizen-sdk-install** | Tizen SDK 자동 설치 (Node.js + 15GB 디스크 공간 자동 확인) | 초기 개발 환경 구성 |
| **tizen-sdk-install-custom-repo** | 사용자 지정 패키지 저장소 URL에서 SDK 설치 (`pkg_list_{OS}-{64,32}` 검증) | 사내/팀 미러 또는 특정 SDK 빌드에서 설치 |
| **tizen-check-node** | Node.js 설치 및 PATH 확인 | SDK 설치 전 Node.js 확인 (18+ 필요) |
| **tizen-check-disk-space** | SDK 설치 전 디스크 공간 확인 | 설치 전 디스크 공간 검증 (15GB 임계값, 홈 드라이브만) |
| **tizen-dotnet-setup** | .NET 개발 환경 구성 | .NET SDK 확인 및 Tizen 워크로드 설치 |
| **tizen-create-project** | 대화형 프로젝트 생성 도구 | Native/DotNET/WebApp/Platform 프로젝트 생성 |
| **tizen-build-project** | 프로젝트 자동 빌드 | Native/DotNET/WebApp/Platform(GBS) 프로젝트 빌드 |
| **tizen-create-emulator** | em-cli로 커스텀 에뮬레이터 VM 생성 (화면 크기 선택, 기본 1080) | 에뮬레이터 VM 생성/목록/삭제, TV 프로필 지원 |
| **tizen-launch-emulator** | 기존 에뮬레이터 VM 실행 (em-cli launch) | 에뮬레이터 부팅 및 sdb 연결 대기 |
| **tizen-download-emulator-package** | 에뮬레이터 패키지(TIZEN-{버전}-Emulator) 다운로드 및 설치 | SDK 설치 후 에뮬레이터 실행 환경 구성 |
| **tizen-platform-install** | Tizen 플랫폼 패키지(TIZEN-{버전}) 다운로드 및 설치 | 특정 플랫폼 버전용 빌드/에뮬레이터 환경 구성 |
| **tizen-download-mobile-platform** | Tizen 모바일 플랫폼 패키지(MOBILE-{버전}) 다운로드 및 설치 | 모바일 프로필 개발, IOT-Headed 확장 선택 설치 |
| **tizen-install-rootstrap** | ZIP 파일의 커스텀 루트스트랩을 SDK에 설치 | 비표준 디바이스/아키텍처용 루트스트랩 추가 |
| **tizen-device-manager** | 디바이스/에뮬레이터 관리 | 연결된 디바이스 검색(sdb), 실행 중인 에뮬레이터 종료 |
| **tizen-install-app** | 앱 패키지 자동 설치 | 디바이스에 .tpk/.wgt/.rpm 설치 (설치 후 실행 옵션) |
| **tizen-file-transfer** | sdb push/pull 파일 전송 | 호스트 ↔ 디바이스 파일/디렉토리 복사 |
| **tizen-remote-device** | 네트워크 원격 디바이스 검색/연결 (SDB 포트 26101 스캔) | Wi-Fi로 디바이스 연결, 원격 디바이스 북마크 관리 |
| **tizen-screenshot** | 디바이스/에뮬레이터 화면 캡처 (자동 폴백) | 디바이스·에뮬레이터·TV 스크린샷을 PNG로 저장 |
| **tizen-sdb-helper** | 요청에 맞는 sdb 명령 선택 및 실행 | 로그 캡처, 셸, 포트 포워딩, 재부팅 등 단일 sdb 작업 |
| **tizen-certificate-manager** | Tizen 인증서 및 서명 프로필 관리 | 로컬 자체 서명 + Samsung online-CA 인증서 생성/프로필 관리 |
| **tizen-gdb-debug** | 자동화된 GDB 원격 디버깅 | Native 앱 디버깅 |
| **tizen-dotnet-debug** | .NET 원격 디버깅 | C# 앱 디버깅 (netcoredbg) |
| **tizen-webapp-debug** | 웹앱 원격 디버깅 (RWI/CDP) | .wgt 앱 Chrome DevTools/Playwright 연결 |
| **tizen-dlog-analyzer** | 디바이스 dlog 수집 및 크래시/예외 자동 분석 | 앱 크래시 근본 원인 탐지, 백그라운드 로그 모니터링 |
| **tizen-playwright-test** | 웹앱 Playwright 자동화 테스트 (CDP) | .wgt 앱 E2E/UI 테스트 실행 및 스캐폴드 |
| **tizen-tv-sdk-install** | TV SDK 확장 설치 (TV-SAMSUNG-Public) | TV 앱 개발 |
| **tizen-tv-sdk-install-from-zip** | TV SDK 확장 설치 (로컬 ZIP, 오프라인) | 오프라인 TV 앱 개발 |
| **tizen-update-package** | Tizen SDK 패키지 업데이트 | 설치된 패키지의 새 버전 확인 및 업데이트 |

---

## 설치

### 통합 설치 스크립트

**Windows (PowerShell):**
```powershell
.\cline\setup\setup.ps1
```

**Linux/macOS:**
```bash
bash cline/setup/setup.sh
```

이 스크립트는 다음을 수행합니다:
1. 플러그인 캐시 동기화 (repo → `~/.cline/plugins/cache/`)
2. 개인 복사본 동기화 (cache → `~/.cline/skills/`, `~/.cline/agents/`)
3. Cline 스킬 설치 (repo skills → `~/.cline/skills/`)
4. Cline 훅 설치 (PreToolUse 어댑터 → `~/Documents/Cline/Hooks/`)
5. Cline 가드 룰 설치 (Windows 폴백 → `~/Documents/Cline/Rules/`)

설치 후 **Cline 세션을 재시작**해야 새 스킬 정의가 로드됩니다.

---

## 빠른 시작 시나리오

> 📘 처음 사용하는 분을 위한 단계별 체험 가이드: [project/scenario-native-app-walkthrough.md](project/scenario-native-app-walkthrough.md)

> (SDK 설치 → 에뮬레이터 → 네이티브 템플릿 앱 생성 → 빌드 → 설치 → 디버깅을 자연어 프롬프트로 따라 하기)

### 시나리오 1: 완전 새 설정 (처음부터 끝까지)

Cline에게 자연어로 말하면 됩니다:

```
1단계: "Tizen SDK 설치해줘"
2단계: "디바이스나 에뮬레이터 찾아줘"
3단계: (DotNET 프로젝트일 경우) ".NET 개발 환경 설정해줘"
4단계: "새 Tizen 프로젝트 만들어줘"
5단계: "프로젝트 빌드해줘"
6단계: "앱 설치해줘"
7단계: "앱 디버깅 시작해줘"
```

### 시나리오 2: 기존 SDK 환경에서 앱 개발 및 디버깅

```
"새 Tizen 프로젝트 만들어줘"
"Release 모드로 빌드해줘"
"앱 설치하고 디버깅 시작해줘"
```

### 시나리오 3: 빠른 디버깅만

```
"com.example.app 디버깅 시작해줘. 바이너리는 ./build/app 야"
```

---

## 스킬 사용법

Cline에서는 자연어로 요청하면 스킬이 자동으로 로드됩니다. 또한 `use_skill` 도구로 명시적으로 호출할 수도 있습니다.

### 자연어 트리거 예시

| 사용자 입력 | 로드되는 스킬 |
|---|---|
| "SDK 경로 설정해줘" / "SDK 초기화해줘" | `tizen-sdk-init` |
| "Tizen SDK 설치해줘" | `tizen-sdk-install` |
| "이 URL로 SDK 설치해줘" / "사내 미러에서 설치해줘" | `tizen-sdk-install-custom-repo` |
| "Node.js 설치돼 있는지 확인해줘" | `tizen-check-node` |
| "디스크 공간 확인해줘" | `tizen-check-disk-space` |
| ".NET 환경 설정해줘" | `tizen-dotnet-setup` |
| "새 Tizen 프로젝트 만들어줘" | `tizen-create-project` |
| "프로젝트 빌드해줘" | `tizen-build-project` |
| "에뮬레이터 생성해줘" / "1080 에뮬레이터 만들어줘" | `tizen-create-emulator` |
| "에뮬레이터 켜줘" / "에뮬레이터 실행해줘" | `tizen-launch-emulator` |
| "에뮬레이터 패키지 다운로드해줘" | `tizen-download-emulator-package` |
| "디바이스 찾아줘" / "에뮬레이터 종료해줘" | `tizen-device-manager` |
| "앱 설치해줘" / "앱 실행해줘" | `tizen-install-app` |
| "이 파일 디바이스에 복사해줘" / "디바이스에서 파일 가져와줘" | `tizen-file-transfer` |
| "네트워크에서 TV 찾아줘" / "원격 디바이스 연결해줘" | `tizen-remote-device` |
| "에뮬레이터 스크린샷 찍어줘" / "타이젠 화면 캡처해줘" | `tizen-screenshot` |
| "로그 잡아줘" / "디바이스 셸 열어줘" / "포트 포워딩해줘" | `tizen-sdb-helper` |
| "인증서 만들어줘" / "서명 프로필 만들어줘" | `tizen-certificate-manager` |
| "GDB 디버깅 시작해줘" | `tizen-gdb-debug` |
| ".NET 앱 디버깅해줘" | `tizen-dotnet-debug` |
| "웹앱 디버깅해줘" / "RWI로 연결해줘" | `tizen-webapp-debug` |
| "웹앱 Playwright 테스트 실행해줘" | `tizen-playwright-test` |
| "TV SDK 설치해줘" | `tizen-tv-sdk-install` |
| "TV SDK ZIP으로 설치해줘" | `tizen-tv-sdk-install-from-zip` |
| "패키지 업데이트해줘" | `tizen-update-package` |

---

## 스킬 상세 설명

### 1. SDK Init (`tizen-sdk-init`)

Tizen SDK 설치 경로를 `~/.tizen.sdk.path.config`에 기록하여 설정합니다. 저장 전 경로가 존재하고 읽기/쓰기 가능한지 검증합니다.

#### 주요 기능

- 경로 검증 (빈 값 또는 비문자열 경로 거부)
- 존재 확인 (SDK 경로가 디스크에 존재하는지 검증)
- 권한 확인 (읽기/쓰기 접근 권한 검증)
- 설정 파일 기록 (`~/.tizen.sdk.path.config`)
- POSIX 권한 (Linux/macOS에서 `0o600`; Windows는 chmod 생략)

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/sdk-init-cli.js` | 모든 OS (Node.js) |

---

### 2. Tizen SDK Install (`tizen-sdk-install`)

Tizen SDK를 **완전 자동으로** 다운로드하고 설치합니다.

#### 주요 기능

- 최신 Tizen 플랫폼 버전 자동 선택
- 재귀적으로 모든 의존성 설치
- Linux/macOS/Windows(WSL2/PowerShell) 지원
- PATH 자동 설정
- **자동 Node.js 확인** (18+ 필요) — 첫 단계로 실행, 미설치 시 OS별 설치 가이드와 함께 중단
- **자동 15GB 디스크 공간 확인** — 설치 전 사용자 홈 드라이브 확인, 부족 시 명확한 에러와 함께 중단

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/sdk-install-cli.js` | 모든 OS (Node.js) |

#### 스크립트

| 파일 | 플랫폼 |
|---|---|
| `scripts/tizen-sdk-install/tizen-sdk-install.sh` | Linux / macOS / WSL2 |
| `scripts/tizen-sdk-install/tizen-sdk-install.ps1` | Windows PowerShell |

두 스크립트 모두 `--repo-url <url>` / `-RepoUrl <url>` 옵션을 지원하여, 타임존으로 선택된 CDN 미러 대신 사용자 지정 패키지 저장소에서 설치할 수 있습니다 — 아래 참조.

---

### 2b. 사용자 지정 저장소 SDK 설치 (`tizen-sdk-install-custom-repo`)

타임존으로 선택되는 CDN 미러 대신 **사용자가 지정한 패키지 저장소 URL**(사내 미러, 빌드 서버 산출물, 로컬 HTTP 서버)에서 SDK를 설치합니다.

#### 주요 기능

- **다운로드 전 URL 검증** — URL이 `pkg_list_{OS}-64` 또는 `pkg_list_{OS}-32`(OS = windows | ubuntu | macos)를 제공해야 하며, `-64`를 먼저 확인하므로 32비트만 제공하는 미러도 동작
- HEAD 요청으로 확인하고, HEAD를 거부하는 서버에는 1바이트 range GET으로 대체
- 설치 없이 검증만 수행하는 모드 제공 ("이 URL 유효해?" 질문 대응)
- 사용자 지정 URL을 `{SDK_PATH}/.package/repository.info`에 기록 → 이후 패키지 업데이트와 에뮬레이터 패키지 다운로드도 같은 저장소 사용
- SDK가 이미 설치되어 있으면 아무것도 재다운로드하지 않으므로, 저장소를 실제로 바꾸려면 `--force`가 필요하다는 경고를 명시적으로 반환

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/sdk-install-custom-repo-cli.js` | 모든 OS (Node.js) |
| `lib/cli/validate-repo-url-cli.js` | 모든 OS (Node.js) — 검증 전용 |

#### 스크립트

| 파일 | 플랫폼 |
|---|---|
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh` | Linux / macOS / WSL2 |
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.ps1` | Windows PowerShell |

📘 상세 문서: [sdk-install/CUSTOM_REPOSITORY_INSTALL.md](sdk-install/CUSTOM_REPOSITORY_INSTALL.md)

---

### 3. Check Node.js (`tizen-check-node`)

SDK 설치 전 Node.js가 설치되어 있고 PATH에 있는지 확인합니다. 러너를 실행 중인 Node.js 인터프리터 자체(`process.version` / `process.execPath`)를 보고합니다 — 러너가 실행되고 있다는 것이 Node 설치의 증거입니다. `where node` / `which node`는 하위 셸의 PATH에서 `node`가 해석되는지 확인하는 보조 정보이며, 실패해도 경고만 남깁니다(이슈 #71).

#### 주요 기능

- Node.js 설치 여부 및 PATH 접근성 확인
- Node.js 18+ 필요 (미만이면 경고, 중단하지는 않음)
- 버전, 경로, 메이저 버전을 포함한 Standard JSON Envelope 반환
- 미설치 시: OS별 설치 가이드와 함께 에러 반환 (Windows: `winget install OpenJS.NodeJS.LTS`, macOS: `brew install node`, Linux: `sudo apt install -y nodejs npm`)
- 다운로드 URL: https://nodejs.org/

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/check-node-cli.js` | 모든 OS (Node.js) |

---

### 4. Check Disk Space (`tizen-check-disk-space`)

SDK 설치 전 사용자 홈 드라이브의 사용 가능한 디스크 공간을 확인합니다. `fs.statfsSync()` (Node.js 18+)와 `child_process` 폴백 체인(Windows: PowerShell `Get-PSDrive` → `fsutil volume diskfree` → 레거시 `wmic`; Linux/macOS: `df -Pk`)을 사용합니다. 어떤 방법으로도 측정할 수 없으면 설치를 막지 않고 `source: "unknown"`과 경고를 반환합니다(이슈 #69).

#### 주요 기능

- 사용자 홈 디렉토리가 있는 드라이브만 확인
- 기본 임계값: 15GB (Tizen SDK 최소 요구량)
- 전체/사용 가능/사용 중 공간 정보를 포함한 Standard JSON Envelope 반환
- 부족 시: 현재 사용 가능 공간, 필요 공간, 부족분 보고

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/check-disk-space-cli.js` | 모든 OS (Node.js) |

---

### 5. .NET Setup (`tizen-dotnet-setup`)

Tizen DotNET 프로젝트 개발에 필요한 **.NET 개발 환경을 구성**합니다. `.NET SDK` 설치 여부를 확인하고, 설치되어 있으면 Tizen .NET 워크로드를 설치합니다.

#### 자동화되는 단계

1. .NET SDK(`dotnet`) 설치 여부 확인
2. **미설치 시** → OS별 설치 가이드 + 다운로드 링크 안내 후 종료
3. **설치되어 있으면** → Tizen 워크로드 설치
   - Samsung 공식 스크립트(`workload-install`) 우선, 실패 시 `dotnet workload install tizen` 폴백
   - Linux/macOS는 권한 필요 시 `sudo` 재시도
4. 설치 결과 검증 (`dotnet workload list`)

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/dotnet-setup-cli.js` | 모든 OS (Node.js) |

---

### 6. Create Project (`tizen-create-project`)

5가지 프로젝트 타입의 템플릿으로 **대화형 UI를 통해** Tizen 프로젝트를 생성합니다.

#### 지원 프로젝트 타입

1. **Native (C/C++)** — 네이티브 성능 필요 시
2. **DotNET (C#)** — C# 및 NUI 프레임워크 사용 시
3. **WebApp** — HTML/CSS/JavaScript 기반 앱
4. **TV** — Samsung TV 웹앱
5. **Platform** — GBS로 빌드 가능한 플랫폼 샘플 앱 (예: `dali_demo`)

#### 주요 옵션

- `--force` — 대상 폴더가 이미 존재하면 대체합니다. 빈 폴더이거나 Tizen 프로젝트로
  식별되는 폴더만 대체하며, 임의의 디렉터리는 절대 삭제하지 않습니다.
- `delete` 액션 (`project-delete` 커맨드) — SDK 호스트의 프로젝트 디렉터리를 삭제합니다.
  Tizen 프로젝트 마커가 없는 경로는 거부합니다. 원격 MCP 클라이언트에서 `rm -rf`는
  클라이언트 로컬 경로를 지우는 무동작(silent no-op)이 되므로 반드시 이 커맨드를 사용하세요.

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/project-manager-cli.js` | 모든 OS (Node.js) |
| `lib/cli/project-manager-cli.js` | 모든 OS (Node.js) — 템플릿 목록 조회 |

---

### 7. Build Project (`tizen-build-project`)

Tizen 프로젝트를 **자동으로** 빌드합니다. Native, DotNET, WebApp, Platform(GBS) 프로젝트 타입을 자동 감지하여 적절한 빌드 명령어를 실행합니다.

#### 자동화되는 단계

1. 프로젝트 타입 자동 감지 (Native/DotNET/WebApp/Platform)
2. 빌드 설정 (Debug/Release) 선택
3. 프로젝트 경로 스캔
4. 빌드 명령어 자동 실행 (`tz build -b Debug -w <project>`)
5. 빌드 결과 검증

#### 주요 옵션

- `--clean` — 빌드 전에 SDK 호스트의 이전 빌드 출력(`Debug/`, `Release/`, `Test/`,
  DotNET은 `bin/`, `obj/` 포함)을 삭제하여 전체 재빌드를 강제합니다. 증분 빌드에서는
  변경되지 않은 파일의 컴파일러 경고가 다시 나타나지 않으므로, 경고 전체 목록이 필요한
  파이프라인은 이 플래그를 사용해야 합니다. Platform(GBS) 빌드는 `gbs build --clean`으로
  매핑됩니다.

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/project-manager-cli.js` | 모든 OS (Node.js) |

---

### 8. Create Emulator (`tizen-create-emulator`)

em-cli로 사용자가 선택한 화면 크기의 **커스텀 Tizen 에뮬레이터 VM**을 생성합니다. 플랫폼/템플릿/VM 목록 조회와 VM 삭제도 지원합니다.

#### 주요 기능

- `create` — VM 생성. `--size`(1080, 720, 3840 또는 `1920x1080` 형태) 필수 — 미지정 시 `user_input_required`로 크기 선택을 요청
- `list-platform` / `list-template` / `list-vm` — 플랫폼, 에뮬레이터 템플릿(해상도), VM 목록 조회
- `delete` — VM 삭제
- `--profile tizen|tv` (기본 `tizen`; `tv`는 TV SDK 확장 필요), `--launch` (생성 직후 실행)

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/emulator-manager-cli.js` | 모든 OS (Node.js) |

---

### 9. Launch Emulator (`tizen-launch-emulator`)

기존 Tizen 에뮬레이터 VM을 em-cli로 실행합니다. VM 이름을 지정하지 않으면 목록의 첫 번째 VM을 실행합니다.

#### 자동화되는 단계

1. VM 목록 조회 (`--vm-name` 미지정 시 첫 번째 VM 선택)
2. em-cli로 VM 실행
3. sdb 연결 대기 (`--timeout`, 기본 300초, 1–540)

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/emulator-manager-cli.js` | 모든 OS (Node.js) |

---

### 10. Download Emulator Package (`tizen-download-emulator-package`)

Tizen 패키지 저장소에서 **에뮬레이터 패키지**(`TIZEN-{platform_version}-Emulator`)를 다운로드하고 설치합니다. Tizen SDK가 먼저 설치되어 있어야 합니다.

#### 자동화되는 단계

1. Tizen SDK 설치 여부 확인 — 미설치 시 중단
2. 기설치 확인 (`.emulator-package-installed` 마커)
3. `{SDK_PATH}/.package/repository.info`의 미러에서 패키지 목록 다운로드 (파일이 없으면 공식 저장소 폴백)
4. 에뮬레이터 패키지와 모든 의존성 패키지를 재귀적으로 다운로드하여 SDK 루트에 병합

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/download-emulator-package-cli.js` | 모든 OS (Node.js) — 사전 점검 (Phase 1) |

---

### 11. Device Manager (`tizen-device-manager`)

sdb로 연결된 Tizen 디바이스를 검색하거나, 실행 중인 에뮬레이터 VM을 종료합니다. 에뮬레이터 **생성**은 `tizen-create-emulator`, **실행**은 `tizen-launch-emulator`를 사용하세요.

#### 자동화되는 단계

1. SDB를 통한 연결된 디바이스 검색 (`sdb devices`)
2. 디바이스 정보 조회 (모델, SDK 버전)
3. `--action stop` — 실행 중인 에뮬레이터 VM 종료
4. `--profile tv` — Samsung TV 에뮬레이터 프로필 지원

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/device-manager-cli.js` | 모든 OS (Node.js) |

---

### 12. Install App (`tizen-install-app`)

Tizen 앱 패키지(.tpk, .wgt, .rpm)를 **자동으로** 디바이스 또는 에뮬레이터에 설치합니다. GBS(Platform) 빌드가 생성한 RPM 패키지도 지원합니다.

#### 자동화되는 단계

1. 디바이스/에뮬레이터 자동 검색
2. 앱 패키지 파일 검증
3. 패키지 설치 실행 (`tz install -e <serial> -p <package>`)
4. 설치 결과 확인 및 `--run` 지정 시 앱 실행

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/project-manager-cli.js` | 모든 OS (Node.js) |

---

### 13. File Transfer (`tizen-file-transfer`)

sdb를 통해 호스트와 디바이스/에뮬레이터 간 파일·디렉토리를 전송합니다.

#### 주요 기능

- `push` (호스트→디바이스) / `pull` (디바이스→호스트)
- 시리얼 미지정 시 단일 연결 디바이스 자동 선택
- `--with-utf8` — UTF-8 인코딩 경로 처리
- 결과 envelope에 `bytes_transferred`, `device_serial` 포함

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/file-transfer-cli.js` | 모든 OS (Node.js) |

---

### 14. Remote Device (`tizen-remote-device`)

로컬 네트워크에서 Tizen 디바이스를 검색하고(SDB 포트 26101 TCP 스윕), USB 대신 네트워크로 sdb 연결/해제하며, Tizen Studio Device Manager의 원격 디바이스 북마크 목록을 관리합니다.

#### 주요 기능

- `scan` — 로컬 /24 서브넷 병렬 TCP 스캔 (~3초, SDK 없이도 동작)
- `connect` / `disconnect` — `sdb connect <ip>:<port>` 연결/해제 (재시도 + `sdb devices` 검증)
- `add` / `remove` / `edit` / `list-saved` — Device Manager 북마크 관리

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/remote-device-cli.js` | 모든 OS (Node.js) |

---

### 15. Screenshot (`tizen-screenshot`)

연결된 Tizen 디바이스/에뮬레이터/TV 화면을 캡처하여 PNG로 저장합니다. 여러 캡처 방법을 자동 폴백으로 시도하며, 첫 성공에서 멈춥니다.

#### 주요 기능

- 에뮬레이터 자동 감지 (시리얼이 `emulator-`로 시작) 후 대상별로 폴백 체인 재정렬
- 기본 출력 경로: `./emulator_screenshot.png` (`--output`으로 변경)

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/screenshot-cli.js` | 모든 OS (Node.js) |

---

### 16. sdb Helper (`tizen-sdb-helper`)

자연어 요청 하나에 맞는 **정확한 sdb 명령**을 선택하여 실행합니다 — 로그 캡처, 셸, 포트 포워딩, root 전환, 재부팅, 화면 상태 등.

#### 주요 기능

- 인텐트 테이블 기반 매칭 + 디바이스 프로필(mobile/wearable/TV/IoT)별 변형 선택
- 다중 디바이스 구분 (자동 선택 금지), 실행 전 명령 미리보기
- 파괴적 동작(재부팅 등)은 확인 게이트 적용
- `install-and-launch` 등 명시적으로 요청된 다단계 레시피 지원

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/sdb-helper-cli.js` | 모든 OS (Node.js) |

---

### 17. Certificate Manager (`tizen-certificate-manager`)

Tizen 인증서(로컬 자체 서명 + Samsung online-CA)와 서명 프로필을 관리합니다 — 생성, Samsung Account 로그인, 배포자 선택, 프로필 생명주기, 가져오기, 검사.

#### 주요 기능

- `generate-author` — 로컬 author 인증서 생성 (`--name`, `--password` 필수)
- `generate-samsung-author` / `generate-samsung-distributor` — Samsung online-CA 인증서 발급 (Samsung Account 로그인)
- `list-distributors`, `create-profile`, `list-profiles`, `set-active-profile`, `remove-profile` — 서명 프로필 관리
- `import-certificate`, `inspect-certificate` — 인증서 가져오기/검사

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/cert-manager-cli.js` | 모든 OS (Node.js) |

---

### 18. GDB Debug (`tizen-gdb-debug`)

Tizen Native 앱을 **자동으로** 원격 GDB 디버깅합니다.

#### 자동화되는 단계

1. 디바이스 SDB 연결 상태 검증
2. 디바이스에서 gdbserver 자동 감지
3. 지정한 앱 ID로 자동 시작
4. 실행 중인 앱의 PID 자동 조회
5. 디바이스에서 gdbserver 자동 바인딩
6. SDB를 통한 TCP 포트 자동 포워딩
7. 호스트 GDB 자동 시작 및 연결

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/gdb-debug-cli.js` | 모든 OS (Node.js) — setup-only 모드 |

---

### 19. .NET Debug (`tizen-dotnet-debug`)

Tizen .NET 앱을 **자동으로** 원격 디버깅합니다 (netcoredbg 사용).

#### 자동화되는 단계

1. 디바이스 연결 확인
2. netcoredbg 온디맨드 설치
3. 앱 시작 및 PID 조회
4. VS Code DAP 서버 또는 CLI attach 명령 생성

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/dotnet-debug-cli.js` | 모든 OS (Node.js) — setup-only 모드 |

---

### 20. WebApp Debug (`tizen-webapp-debug`)

Tizen 웹앱(.wgt)을 RWI(Remote Web Inspector)/CDP로 **자동으로** 원격 디버깅합니다. Native/DotNET 앱에는 사용할 수 없습니다 (`tizen-gdb-debug` / `tizen-dotnet-debug` 사용).

#### 자동화되는 단계

1. 디바이스 연결 확인
2. 디버그 모드로 앱 실행 (`app_launcher -w`)
3. RWI 포트 포워딩 (기본 호스트 포트 9222)
4. CDP 엔드포인트 검증 → CDP 엔드포인트 + Playwright/DevTools 연결 스니펫 반환

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/webapp-debug-cli.js` | 모든 OS (Node.js) — setup-only 모드 |

---

### 21. Playwright Test (`tizen-playwright-test`)

Tizen 웹앱(.wgt)에 대해 CDP로 Playwright 테스트를 **실행하거나 스캐폴드**합니다. webapp-debug 흐름으로 디버그 모드 + 포트 포워딩을 셋업한 뒤, 테스트 프로젝트에서 `node <test-file>`을 실행하고 pass/fail을 envelope로 반환합니다.

#### 주요 기능

- `--scaffold` — `tizen-playwright.test.js`(+`package.json`) 생성 후 종료 (디바이스 불필요, `--force`로 덮어쓰기)
- `--no-setup` — 이미 살아있는 CDP 엔드포인트 재사용 (디버그 모드 재실행 + 포트 포워딩 생략)
- Playwright는 **테스트 프로젝트의** `node_modules`에서 해석 — 플러그인에 설치하지 않음

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/playwright-test-cli.js` | 모든 OS (Node.js) |

---

### 22. TV SDK Install (`tizen-tv-sdk-install`)

기존 Tizen SDK 설치 위에 **TV SDK 확장**(TV-SAMSUNG-Public 패키지)을 설치합니다. Tizen SDK가 먼저 설치되어 있어야 합니다.

#### 자동화되는 단계

1. Tizen SDK 설치 여부 확인 — 미설치 시 대화형 안내와 함께 중단
2. 기설치 확인 (`.tv-sdk-installed` 마커) — 설치되어 있으면 success 반환
3. TV SDK 설치 스크립트 명령 반환 후 실행 (Phase 2)

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/tv-sdk-install-cli.js` | 모든 OS (Node.js) — 사전 점검 (Phase 1) |

---

### 23. Update Package (`tizen-update-package`)

설치된 Tizen SDK 패키지의 업데이트를 확인하고 설치합니다.

#### 자동화되는 단계

1. Tizen SDK 설치 여부 확인 — 미설치 시 중단
2. `repository.info`의 미러에서 최신 패키지 목록(`pkg_list_{OS}-{32,64}`) 다운로드
3. `{SDK_PATH}/.package/`의 설치 매니페스트와 버전 비교
4. 새 버전 다운로드 후 SDK 루트에 병합, 매니페스트 갱신 (updated/skipped/failed/up-to-date 요약)

#### CLI 러너

| 파일 | 플랫폼 |
|---|---|
| `lib/cli/update-package-cli.js` | 모든 OS (Node.js) — 사전 점검 (Phase 1) |

---

## 디렉토리 구조

```
tizen-sdk-skills/
│
├── common/                             # 공통 구현 (에이전트/스킬/라이브러리/스크립트)
│   ├── agents/                         # 에이전트 정의 (.md)
│   │   ├── tizen-sdk-install.md
│   │   ├── tizen-create-project.md
│   │   ├── tizen-build-project.md
│   │   └── ...                         # 스킬별 에이전트 정의
│   │
│   ├── skills/                         # 스킬 정의 (29개, 각 폴더에 SKILL.md)
│   │   ├── tizen-sdk-init/
│   │   ├── tizen-sdk-install/
│   │   ├── tizen-sdk-install-custom-repo/
│   │   ├── tizen-check-node/
│   │   ├── tizen-check-disk-space/
│   │   ├── tizen-dotnet-setup/
│   │   ├── tizen-create-project/
│   │   ├── tizen-build-project/
│   │   ├── tizen-create-emulator/
│   │   ├── tizen-launch-emulator/
│   │   ├── tizen-download-emulator-package/
│   │   ├── tizen-device-manager/
│   │   ├── tizen-install-app/
│   │   ├── tizen-file-transfer/
│   │   ├── tizen-remote-device/
│   │   ├── tizen-screenshot/
│   │   ├── tizen-sdb-helper/
│   │   ├── tizen-certificate-manager/
│   │   ├── tizen-gdb-debug/
│   │   ├── tizen-dotnet-debug/
│   │   ├── tizen-webapp-debug/
│   │   ├── tizen-playwright-test/
│   │   ├── tizen-tv-sdk-install/
│   │   ├── tizen-tv-sdk-install-from-zip/
│   │   └── tizen-update-package/
│   │
│   ├── lib/                            # CLI 러너 및 공유 라이브러리
│   │   ├── README.md                   # lib 구조 설명
│   │   ├── cli/                        # Node.js CLI 러너 (스킬이 호출)
│   │   │   ├── cli-runner.js           # 공용 러너 프레임워크
│   │   │   ├── sdk-init-cli.js
│   │   │   ├── sdk-install-cli.js
│   │   │   ├── sdk-install-custom-repo-cli.js
│   │   │   ├── validate-repo-url-cli.js
│   │   │   ├── sdk-repo-info-cli.js
│   │   │   ├── check-node-cli.js
│   │   │   ├── check-disk-space-cli.js
│   │   │   ├── dotnet-setup-cli.js
│   │   │   ├── project-manager-cli.js  # 프로젝트 생성/템플릿/빌드/설치/삭제
│   │   │   ├── emulator-manager-cli.js # 에뮬레이터 VM 생성/실행/관리
│   │   │   ├── download-emulator-package-cli.js
│   │   │   ├── device-manager-cli.js
│   │   │   ├── file-transfer-cli.js
│   │   │   ├── remote-device-cli.js
│   │   │   ├── screenshot-cli.js
│   │   │   ├── sdb-helper-cli.js
│   │   │   ├── cert-manager-cli.js
│   │   │   ├── gdb-debug-cli.js
│   │   │   ├── dotnet-debug-cli.js
│   │   │   ├── webapp-debug-cli.js
│   │   │   ├── playwright-test-cli.js
│   │   │   ├── tv-sdk-install-cli.js
│   │   │   ├── tv-sdk-install-from-zip-cli.js
│   │   │   └── update-package-cli.js
│   │   ├── core/                       # 공용 코어 (sdk-commands.js, sdb.js, emulator.js, project.js 등)
│   │   ├── envelope/                   # Standard JSON Envelope
│   │   │   ├── envelope.js
│   │   │   ├── envelope-wrapper.js
│   │   │   └── response-formatter.js
│   │   └── tests/                      # 단위 테스트
│   │
│   ├── scripts/                        # 기능별 실행 스크립트 (PowerShell/Bash)
│   │   ├── T-CLI.md                    # T-CLI 통합 도구 설명
│   │   ├── t-cli.ps1                   # Windows 통합 CLI 런처
│   │   ├── t-cli.sh                    # Linux/macOS 통합 CLI 런처
│   │   ├── lib/                        # 공용 라이브러리 (common.sh, common.ps1)
│   │   ├── tizen-sdk-install/
│   │   ├── tizen-sdk-install-custom-repo/
│   │   ├── tizen-dotnet-setup/
│   │   ├── tizen-create-project/
│   │   │   └── templates/              # Native / DotNET / WebApp / Platform 템플릿
│   │   ├── tizen-build-project/
│   │   ├── tizen-emulator-manager/
│   │   ├── tizen-download-emulator-package/
│   │   ├── tizen-device-manager/
│   │   ├── tizen-install-app/
│   │   ├── tizen-file-transfer/
│   │   ├── tizen-screenshot/
│   │   ├── tizen-gdb-debug/
│   │   ├── tizen-dotnet-debug/
│   │   ├── tizen-webapp-debug/
│   │   ├── tizen-tv-sdk-install/
│   │   ├── tizen-tv-sdk-install-from-zip/
│   │   └── tizen-update-package/
│   │
│   ├── hooks/                          # 훅 (Bash)
│   │   ├── hooks.json
│   │   ├── check-tizen-commands.sh     # Tizen 명령어 검증
│   │   ├── check-project-writes.sh     # 프로젝트 파일 쓰기 검증
│   │   ├── check-skill-routing.sh      # 스킬 라우팅 검증
│   │   └── hooks.test.sh
│   │
│   └── assets/
│       └── samsung-tv-ca/              # Samsung TV CA 인증서
│
├── tizen-cli/                          # tizen-cli 패키지 (34개 커맨드; CLI/MCP 진입점)
│   ├── src/
│   │   ├── index.ts / commands.ts / doctor.ts / envelope-adapter.ts
│   │   ├── command-specs/              # 커맨드 스펙 (sdk, check, project, device, debug, test, certificate)
│   │   └── lib/
│   ├── skills/                         # tizen-cli용 스킬 사본
│   ├── plugin.json
│   └── package.json
│
├── common/setup/                       # 모든 하네스가 공유하는 단일 setup 구현
│   ├── setup.sh / setup.ps1            #   --harness <claude|cline|codex|gemini>
│   ├── setup-lib.sh / setup-lib.ps1    #   미러 복사, 비교, 버전, 가드 구획 헬퍼
│   └── hosts/<harness>.sh|.ps1         #   하네스별 경로, 에이전트 형식, 훅/지침
│
├── cline/                              # Cline 통합
│   ├── setup/                          #   얇은 wrapper: setup.ps1, setup.sh, setup.bat
│   └── hooks/
│       ├── PreToolUse                  # Cline PreToolUse 어댑터
│       └── tizen-sdk-skills-guard.md   # Windows 폴백 가드 룰 (한국어)
│
├── claude/setup/                       # Claude Code — 얇은 wrapper: setup.ps1, setup.sh, setup.bat
├── codex/setup/                        # OpenAI Codex CLI — 얇은 wrapper
└── gemini/                             # Google Gemini CLI
    ├── setup/                          #   얇은 wrapper
    └── hooks/BeforeTool                #   Gemini BeforeTool 어댑터 -> 공용 가드
```

하네스별 설치 상세: [deployment/HARNESS_SETUP.md](deployment/HARNESS_SETUP.md).

---

## 트러블슈팅

**"tz tool not found" 오류**

```
"Tizen SDK 재설치해줘"
```
설치 후 환경 변수를 확인:
```bash
echo $TIZEN_SDK_PATH    # Linux/macOS
echo %TIZEN_SDK_PATH%   # Windows
```

**디바이스가 연결되지 않을 때**

```
"디바이스 목록 확인해줘"
```

**GDB 디버깅 중 "No matching symbol" 오류**

- 바이너리가 디버그 심볼(`-g` 플래그)로 컴파일되었는지 확인
- 바이너리와 디바이스의 앱 버전이 일치하는지 확인

---

## 사용 사례 & 시나리오 가이드

> 📘 12개 문서의 인덱스, 기능 맵, 상세 요약, 비교표를 하나로 모은 통합 가이드: [사용 사례 & 시나리오 가이드](../usage/usage.md)

## 관련 자료

| 자료 | 링크 |
|---|---|
| Tizen 공식 문서 | https://docs.tizen.org/ |
| Tizen SDK 다운로드 | https://developer.tizen.org/development/tizen-sdk/download |
| GDB 공식 문서 | https://sourceware.org/gdb/documentation/ |

---

## 버전 정보

**플러그인 전체 버전**: `0.1.0`

모든 29개 스킬은 동일한 버전으로 배포됩니다. 버전은 각 스킬 폴더의 `SKILL.md`에 명시되어 있습니다.
