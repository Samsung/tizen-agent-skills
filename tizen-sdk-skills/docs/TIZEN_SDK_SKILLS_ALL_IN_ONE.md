# Tizen SDK Skills — 통합 문서

> 이 문서는 아래 3개 문서를 하나로 병합한 통합본입니다. (생성일: 2026-09-10)
>
> 1. `docs/SKILLS_REFERENCE.md` — 스킬 레퍼런스
> 2. `docs/SDK_COMMANDS_ARCHITECTURE.md` — 커맨드 계층 아키텍처
> 3. `usage/usage.md` — 사용 사례 & 시나리오 가이드
>
> 원본 문서를 수정한 경우 이 파일을 다시 생성해야 합니다.

## 통합 목차

| 파트 | 내용 | 바로가기 |
|------|------|----------|
| Part 1 | 29개 스킬 레퍼런스 (파라미터, CLI 러너, 응답 형식) | [스킬 레퍼런스](#tizen-sdk-skills--스킬-레퍼런스) |
| Part 2 | 커맨드 계층 아키텍처 및 호출 흐름 | [커맨드 아키텍처](#tizen-sdk-커맨드-계층--아키텍처-및-호출-흐름) |
| Part 3 | 엔드투엔드 사용 사례 & 시나리오 가이드 | [사용 사례 & 시나리오](#tizen-sdk-skills--사용-사례--시나리오-가이드) |

---

# Tizen SDK Skills — 스킬 레퍼런스

**버전:** 1.0.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-08-26  
**라이선스:** Apache License 2.0 ([LICENSE](../LICENSE))

---

## 개요

`tizen-sdk-skills`는 **Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli**에서 동작하는 통합 스킬 컬렉션으로, Tizen 개발 환경 설정, 프로젝트 생성, 빌드, 배포, 디버깅, 스크린샷 캡처, 로그 분석을 자동화합니다. 자연어로 트리거할 수 있는 **29개 자동화 스킬**을 제공합니다.

모든 스킬은 **Standard JSON Envelope** 형식으로 응답하여 일관된 에러 처리와 기계 판독 가능한 출력을 보장합니다.

---

## 주요 기능

- ✅ **원커맨드 SDK 설정** — Node.js 체크 → 디스크 공간 체크 → SDK 설치, 완전 자동화
- ✅ **29개 스킬**로 Tizen 개발 전체 라이프사이클 커버 (빌드, 배포, 디버깅, 스크린샷 캡처, 로그 분석, 플랫폼/루트스트랩 설치)

- ✅ **크로스 플랫폼** — Windows (PowerShell/cmd), Linux, macOS
- ✅ **멀티 하네스 지원** — Claude Code, Cline, Codex CLI, Gemini CLI, tizen-cli (하나의 `common/`을 공유, 하네스별 setup은 `common/setup/setup.{sh,ps1} --harness <이름>`)
- ✅ **Standard JSON Envelope** — 모든 응답이 status, result, warnings, errors를 포함한 구조화된 JSON
- ✅ **CLI 러너** — 각 스킬마다 독립적인 Node.js CLI 러너 제공 (임시 스크립트 불필요)
- ✅ **가드 규칙** — 프로젝트 파일 수작성, `tizen` CLI 직접 호출, 네이티브 바이너리의 `node` 실행을 모두 차단

---

## 시작하기

### 설치

사용하는 하네스의 setup 스크립트를 실행합니다 (`<harness>` = `claude` | `cline` | `codex` | `gemini`):

**Windows (PowerShell):**

```powershell
.\<harness>\setup\setup.ps1
```

**Linux/macOS:**

```bash
bash <harness>/setup/setup.sh
```

네 스크립트 모두 `common/setup/setup.{sh,ps1} --harness <harness>`의 얇은 wrapper이며, 하네스별로
스킬·에이전트·훅·지침 파일을 실제 로딩 위치에 설치합니다. 설치 후 **해당 하네스 세션을 재시작**하여
새 스킬 정의를 로드하세요 (Claude Code / Gemini CLI는 출력된 `settings.json` 훅 스니펫 병합,
Codex CLI는 `/hooks`로 훅 신뢰가 추가로 필요). 하네스별 상세는
[deployment/HARNESS_SETUP.md](deployment/HARNESS_SETUP.md) 참조.

**tizen-cli:** 별도 setup 없이 `tizen-cli tizen-sdk <command>`로 같은 `common/` 로직을 호출합니다
([tizen-cli README](../tizen-cli/README.ko.md)).

### 빠른 시작

사용 중인 AI 하네스(Claude Code / Cline / Codex CLI / Gemini CLI)에게 자연어로 말만 하면 됩니다:

```
1단계: "Tizen SDK 설치해줘"
2단계: "디바이스나 에뮬레이터 찾아줘"
3단계: "새 Tizen 프로젝트 만들어줘"
4단계: "프로젝트 빌드해줘"
5단계: "앱 설치해줘"
6단계: "앱 디버깅 시작해줘"
```

---

## 스킬

### 1. tizen-sdk-init

**설명:** Tizen SDK 설치 경로를 `~/.tizen.sdk.path.config`에 설정.

**사용 시점:** 수동 설치한 SDK 또는 비기본 경로의 SDK 등록.

**파라미터:**

| 파라미터  | 타입   | 기본값        | 설명                |
| --------- | ------ | ------------- | ------------------- |
| `sdkPath` | string | `~/tizen-sdk` | Tizen SDK 설치 경로 |

**CLI 러너:**

```
node <plugin>/lib/cli/sdk-init-cli.js [sdkPath]
```

**자동화 단계:**

1. 경로 검증 — 빈 값 또는 문자열이 아닌 경로 거부
2. 존재 확인 — SDK 경로가 디스크에 존재하는지 검증
3. 권한 확인 — SDK 경로에 읽기/쓰기 권한 검증
4. 설정 파일 쓰기 — SDK 경로를 `~/.tizen.sdk.path.config`에 저장
5. POSIX 권한 — 설정 파일에 `0o600` 권한 설정 (Linux/macOS만; Windows는 chmod 생략)

**응답 (성공):**

```json
{
  "status": "success",
  "result": {
    "sdk_path": "/home/user/tizen-sdk",
    "config_file": "/home/user/.tizen.sdk.path.config"
  },
  "command": "tizen-sdk sdk-init"
}
```

**의존성:** 없음 (수동 SDK 설치 후 또는 비기본 경로 SDK 등록 시 사용)

---

### 2. tizen-sdk-install

**설명:** Node.js + 디스크 공간 사전 체크가 내장된 Tizen SDK 자동 설치.

**사용 시점:** 초기 개발 환경 설정.

**파라미터:**

| 파라미터  | 타입    | 기본값    | 설명                             |
| --------- | ------- | --------- | -------------------------------- |
| `version` | string  | `'10.0'`  | Tizen SDK 버전                   |
| `label`   | string  | `'tizen'` | SDK 레이블                       |
| `force`   | boolean | `false`   | 이미 설치되어 있어도 강제 재설치 |

**CLI 러너:**

```
node <plugin>/lib/cli/sdk-install-cli.js [version] [label] [--force]
```

**사전 체크 흐름:**

```
1. Node.js 체크 (18+ 필요) → 미설치 시 OS별 설치 가이드와 함께 중단
2. SDK 이미 설치됨? → 설치된 경우 success 반환
3. 디스크 공간 체크 (15 GB, 홈 드라이브) → 부족 시 상세 정보와 함께 중단
4. Phase 2(백그라운드 설치)용 설치 명령 반환
```

**사용자 지정 저장소 URL:** 기본적으로 패키지는 타임존 기반으로 선택된 CDN 미러에서 내려받습니다. 사용자 지정 저장소(사내 미러 등)에서 설치하려면 [23. tizen-sdk-install-custom-repo](#23-tizen-sdk-install-custom-repo)를 사용하세요(`--repo-url <url>`을 넘겨도 동일한 흐름으로 위임됩니다). 해당 URL은 `pkg_list_{OS}-{64,32}`를 제공해야 합니다.

**응답 (성공):**

```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "Tizen SDK 10.0",
        "version": "10.0",
        "status": "installed"
      }
    ],
    "installation_status": "completed"
  },
  "command": "tizen-sdk sdk-install"
}
```

**응답 (Node.js 미설치):**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_CONFIG_E005",
      "error_category": "node_not_found",
      "message": "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 18+.",
      "suggested_fix": {
        "command": "winget install OpenJS.NodeJS.LTS",
        "auto_fixable": false,
        "guide_url": "https://nodejs.org/"
      }
    }
  ],
  "command": "tizen-sdk check-node"
}
```

**의존성:** 없음 (가장 먼저 실행되는 스킬)

---

### 3. tizen-check-node

**설명:** SDK 설치 전 Node.js 설치 여부 및 PATH 등록 확인.

**사용 시점:** 설치 전 Node.js 사전 확인 (18+ 필요).

**파라미터:** 없음

**CLI 러너:**

```
node <plugin>/lib/cli/check-node-cli.js
```

**응답 (성공):**

```json
{
  "status": "success",
  "result": {
    "installed": true,
    "version": "v20.11.0",
    "path": "C:\\Program Files\\nodejs\\node.exe",
    "major_version": 20
  },
  "command": "tizen-sdk check-node"
}
```

**설치 가이드 (Node.js 미설치 시):**

| OS                    | 명령어                                              |
| --------------------- | --------------------------------------------------- |
| Windows               | `winget install OpenJS.NodeJS.LTS`                  |
| macOS                 | `brew install node`                                 |
| Linux (Ubuntu/Debian) | `sudo apt update && sudo apt install -y nodejs npm` |
| 모든 OS (수동)        | https://nodejs.org/ 에서 LTS 다운로드               |

**의존성:** 없음

---

### 4. tizen-check-disk-space

**설명:** SDK 설치 전 사용자 홈 드라이브의 사용 가능한 디스크 공간 확인.

**사용 시점:** 설치 전 디스크 공간 사전 확인 (15 GB 임계값, 홈 드라이브만).

**파라미터:**

| 파라미터     | 타입   | 기본값         | 설명                        |
| ------------ | ------ | -------------- | --------------------------- |
| `path`       | string | `os.homedir()` | 확인할 경로 (홈 드라이브만) |
| `requiredGb` | number | `15`           | 최소 필요 공간 (GB)         |

**CLI 러너:**

```
node <plugin>/lib/cli/check-disk-space-cli.js [path] [requiredGb]
```

**응답 (성공):**

```json
{
  "status": "success",
  "result": {
    "path": "C:/Users/<username>",
    "total_gb": 500,
    "free_gb": 200,
    "required_gb": 15,
    "sufficient": true
  },
  "command": "tizen-sdk check-disk-space"
}
```

**응답 (공간 부족):**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_ENV_E002",
      "error_category": "insufficient_disk_space",
      "message": "Insufficient disk space: 3.2 GB free, but 15 GB required. Need 11.8 GB more."
    }
  ],
  "command": "tizen-sdk check-disk-space"
}
```

**의존성:** 없음

---

### 5. tizen-dotnet-setup

**설명:** Tizen DotNET 프로젝트 개발을 위한 .NET 개발 환경 설정.

**사용 시점:** .NET SDK 확인 및 Tizen 워크로드 설치.

**파라미터:**

| 파라미터  | 타입    | 기본값  | 설명                       |
| --------- | ------- | ------- | -------------------------- |
| `force`   | boolean | `false` | Tizen 워크로드 강제 재설치 |
| `version` | string  | `null`  | Tizen 워크로드 버전        |

**CLI 러너:**

```
node <plugin>/lib/cli/dotnet-setup-cli.js [--force] [version]
```

**자동화 단계:**

1. .NET SDK (`dotnet`) 설치 여부 확인
2. 미설치 → OS별 설치 가이드 + 다운로드 링크 제공 후 종료
3. 설치됨 → Tizen 워크로드 설치 (Samsung 스크립트 → `dotnet workload install tizen` 폴백)
4. 설치 결과 검증 (`dotnet workload list`)

**의존성:** `tizen-sdk-install` (SDK가 먼저 설치되어야 함)

---

### 6. tizen-create-project

**설명:** 템플릿에서 Tizen 프로젝트 생성 (Native, DotNET, WebApp, TV, Platform) 및 프로젝트 디렉터리 삭제.

**사용 시점:** 대화형 UI로 새 Tizen 프로젝트 생성. 프로젝트 삭제 요청("프로젝트
삭제해줘", "앱 지워줘")도 이 스킬의 `delete` 액션이 담당합니다.

**파라미터:**

| 파라미터     | 타입   | 기본값   | 설명                                                |
| ------------ | ------ | -------- | --------------------------------------------------- |
| `type`       | string | _(필수)_ | `native`, `dotnet`, `webapp`, `tv`, 또는 `platform` |
| `template`   | string | _(필수)_ | `listTemplates()`에서 선택한 템플릿 이름            |
| `parentPath` | string | _(필수)_ | 부모(워크스페이스) 디렉토리                         |
| `appName`    | string | _(필수)_ | 앱 이름 = 폴더 이름                                 |
| `force`      | boolean | `false` | 대상 폴더가 이미 있으면 대체 (빈 폴더 또는 Tizen 프로젝트만 — 임의 디렉터리는 거부) |

**CLI 러너:**

```
node <plugin>/lib/cli/project-manager-cli.js create --type <type> --template <template> --parent-path <parentPath> --name <appName> [--force]
node <plugin>/lib/cli/project-manager-cli.js list-templates [--type <type>]
node <plugin>/lib/cli/project-manager-cli.js delete --project <projectPath>
```

**프로젝트 삭제 (`delete` 액션 / `project-delete` 커맨드):** SDK 호스트에서
프로젝트 디렉터리를 삭제합니다. Tizen 프로젝트 마커(`tizen_*_project.yaml`,
`config.xml`, `tizen-manifest.xml`, `.tproject`, `*.csproj` 등)가 없는 경로는
거부합니다. 원격 MCP 클라이언트의 `rm -rf`는 클라이언트 로컬 경로를 지우는
무동작이 되므로 직접 삭제하지 말고 반드시 이 커맨드를 사용하세요.

**지원 프로젝트 타입:**

1. **Native (C/C++)** — 네이티브 성능이 필요한 경우
2. **DotNET (C#)** — C# 및 NUI 프레임워크 사용
3. **WebApp** — HTML/CSS/JavaScript 기반 앱
4. **TV** — Samsung TV 앱 (TV SDK 확장 템플릿)
5. **Platform** — GBS로 빌드하는 플랫폼(RPM) 프로젝트 (예: DALi)

**의존성:** `tizen-sdk-install` (SDK가 설치되어야 함)

---

### 7. tizen-build-project

**설명:** 자동 감지 기능이 있는 Tizen 프로젝트 자동 빌드.

**사용 시점:** Native/DotNET/WebApp 프로젝트 빌드.

**파라미터:**

| 파라미터      | 타입   | 기본값    | 설명                            |
| ------------- | ------ | --------- | ------------------------------- |
| `projectPath` | string | _(필수)_  | 프로젝트 루트 디렉토리          |
| `buildType`   | string | `'Debug'` | `Debug`, `Release`, 또는 `Test` |
| `signProfile` | string | `null`    | 서명 프로파일 (선택)            |
| `arch`        | string | `'x86_64'` | GBS/Platform 빌드 대상 아키텍처 (`armv7l`, `aarch64`, `i586`, `x86_64`) |
| `clean`       | boolean | `false`  | 빌드 전 SDK 호스트의 이전 빌드 출력 삭제 — 전체 재빌드 강제 (증분 빌드에서는 미변경 파일의 컴파일러 경고가 재출현하지 않음) |

**CLI 러너:**

```
node <plugin>/lib/cli/project-manager-cli.js build --project <projectPath> [--build-type <buildType>] [--sign-profile <signProfile>] [--arch <arch>] [--clean]
```

**자동화 단계:**

1. 프로젝트 타입 자동 감지 (Native/DotNET/WebApp/Platform)
2. 빌드 설정 선택 (Debug/Release)
3. 프로젝트 경로 스캔
4. 빌드 명령 실행 (`tz build -b Debug -w <project>` 또는 Platform 프로젝트의 경우 `gbs build -A <arch> --include-all`)
5. 빌드 결과 검증 (.tpk/.wgt/.rpm 산출물)

**응답 (성공):**

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "/path/MyApp.tpk",
        "format": ".tpk",
        "size_bytes": 1048576
      }
    ],
    "build_type": "Debug"
  },
  "command": "tizen-sdk build-project"
}
```

**의존성:** `tizen-create-project` (프로젝트가 존재해야 함)

---

### 8. tizen-certificate-manager

**설명:** Tizen 인증서(로컬 자체 서명 + Samsung online-CA)와 서명 프로파일 관리 — author 인증서 생성, 배포자 인증서 선택, 프로파일 생성/활성화/삭제, 인증서 임포트/검사, Samsung Account 로그인 및 Samsung 인증서 발급.

**사용 시점:** 앱 서명용 인증서/서명 프로파일 준비 (빌드 서명 전), Samsung 인증서 발급/가져오기.

**파라미터 (주요):**

| 파라미터      | 타입   | 기본값                   | 설명                                                                 |
| ------------- | ------ | ------------------------ | -------------------------------------------------------------------- |
| `action`      | string | `'generate-author'`      | `generate-author`, `list-distributors`, `create-profile`, `list-profiles`, `set-active-profile`, `remove-profile`, `set-distributor2`, `import-certificate`, `inspect-certificate`, `get-sdk-data-path` + Samsung 액션 (`generate-samsung-author`, `generate-samsung-distributor`, `import-samsung-certificate`, `create-samsung-profile`, `cancel-samsung-cert`, `samsung-login`, `samsung-reveal-password`, `parse-duids`, `import-duids`, `acquire-duid`, `acquire-duids-all`) |
| `name`        | string | _(generate-author 필수)_ | author 이름                                                          |
| `password`    | string | _(필수)_                 | 인증서 비밀번호 (8자 이상, 대문자+소문자+숫자)                        |
| `profileName` | string | _(Samsung 액션 필수)_    | 프로파일 식별자                                                       |
| `type`        | string | `null` (전체)            | list-distributors: `public`, `partner`, `platform`                    |
| `duidList`    | string | _(generate-samsung-distributor 필수)_ | 쉼표/개행으로 구분한 DUID 목록                           |
| `privilege`   | string | `'Public'`               | generate-samsung-distributor: `Public` 또는 `Partner`                 |

**CLI 러너:**

```
node <plugin>/lib/cli/cert-manager-cli.js <action> [options]
node <plugin>/lib/cli/cert-manager-cli.js generate-author --name "Jane Dev" --password "<password>"
node <plugin>/lib/cli/cert-manager-cli.js list-distributors [--type public|partner|platform] [--version legacy|new]
node <plugin>/lib/cli/cert-manager-cli.js generate-samsung-author --profile-name MyProfile --identity "Jane Dev" --password "<password>"
node <plugin>/lib/cli/cert-manager-cli.js create-samsung-profile --profile-name MyProfile --active
```

**의존성:** `tizen-sdk-install` (SDK 인증서 도구 필요)

---

### 9. tizen-device-manager

**설명:** SDB로 연결된 Tizen 디바이스 탐지(`start`) 또는 실행 중인 에뮬레이터 VM 전체 종료(`stop`, em-cli kill 사용). **에뮬레이터를 직접 생성/부팅하지 않습니다** — 생성은 `tizen-create-emulator`, 부팅은 `tizen-launch-emulator`가 담당합니다.

**사용 시점:** 연결된 디바이스/에뮬레이터 확인, 실행 중인 에뮬레이터 종료.

**파라미터:**

| 파라미터     | 타입   | 기본값               | 설명                                            |
| ------------ | ------ | -------------------- | ----------------------------------------------- |
| `action`     | string | `'start'`            | `start` (연결된 디바이스 탐지) 또는 `stop` (실행 중인 에뮬레이터 VM 종료) |
| `timeoutSec` | number | `300`                | 에뮬레이터 연결 대기 시간 (1–540초)             |
| `vmName`     | string | `'tizen-vm-default'` | 찾을 에뮬레이터 VM 이름                         |
| `profile`    | string | `'tizen'`            | 에뮬레이터 프로필: `tizen` 또는 `tv` (Samsung TV) |

**CLI 러너:**

```
node <plugin>/lib/cli/device-manager-cli.js [start] [timeoutSec] [vmName] [profile]
node <plugin>/lib/cli/device-manager-cli.js stop                                # 실행 중인 에뮬레이터 VM 모두 종료 (--action stop 도 가능)
tizen-cli tizen-sdk device-manager [--action start|stop] [--timeout 300] [--vm-name <name>] [--profile tizen|tv]
```

**자동화 단계 (start):**

1. SDB로 연결된 디바이스 검색 (`sdb devices`)
2. 디바이스 정보 조회 (모델, SDK 버전)
3. 디바이스가 없으면 `device_not_found` envelope 반환 — `suggested_fix`로 `tizen-create-emulator`(VM 생성) / `tizen-launch-emulator`(VM 부팅) 안내 (에뮬레이터를 직접 생성/부팅하지 않음)

**자동화 단계 (stop):**

1. em-cli로 실행 중인 에뮬레이터 VM 조회
2. 실행 중인 VM 전체를 em-cli kill로 종료 (`EMULATOR_STOPPED=` 마커 파싱)

**의존성:** `tizen-sdk-install` (SDK가 설치되어야 함)

---

### 10. tizen-create-emulator

**설명:** em-cli로 사용자가 선택한 화면 크기의 Tizen 에뮬레이터 VM 생성. 플랫폼/템플릿/VM 목록 조회와 VM 삭제도 지원하며, `emulator-manager-cli.js`는 em-cli 전체 액션(detail, modify, reset, create-image)을 커버.

**사용 시점:** 특정 해상도(1080/720/3840 등)의 에뮬레이터 VM 생성, 에뮬레이터 템플릿/플랫폼/VM 목록 확인, VM 삭제. 기존 VM 부팅은 `tizen-launch-emulator` 사용.

**파라미터:**

| 파라미터         | 타입    | 기본값                 | 설명                                                                       |
| ---------------- | ------- | ---------------------- | --------------------------------------------------------------------------- |
| `action`         | string  | `'create'`             | `create`, `delete`, `launch`, `list-vm`, `list-platform`, `list-template`, `detail`, `modify`, `reset`, `create-image` |
| `vmName`         | string  | _(create/delete 필수)_ | 에뮬레이터 VM 이름                                                          |
| `size`           | string  | _(create 필수)_        | `1080`, `720`, `3840` 또는 `1920x1080` — 생략 시 `user_input_required` 실패 (크기는 사용자 선택) |
| `assumeDefaults` | boolean | `false`                | 질문 없이 기본 크기(1080) 사용 — 비대화형 실행 전용                          |
| `template`       | string  | `null`                 | 정확한 템플릿 이름 (`--size`보다 우선)                                       |
| `platform`       | string  | _(자동 감지)_          | 플랫폼 이미지 이름                                                           |
| `profile`        | string  | `'tizen'`              | `tizen` 또는 `tv` (TV SDK 확장 필요)                                         |
| `launch`         | boolean | `false`                | 생성 후 즉시 VM 실행 (create 전용)                                           |

**CLI 러너:**

```
node <plugin>/lib/cli/emulator-manager-cli.js create --vm-name <name> --size <1080|720|3840|1920x1080> [--profile tizen|tv] [--launch]
node <plugin>/lib/cli/emulator-manager-cli.js <list-vm|list-platform|list-template> [--detail]
node <plugin>/lib/cli/emulator-manager-cli.js delete --vm-name <name>
```

**의존성:** `tizen-sdk-install` (SDK), `tizen-download-emulator-package` (em-cli가 포함된 에뮬레이터 패키지)

---

### 11. tizen-launch-emulator

**설명:** em-cli로 기존 Tizen 에뮬레이터 VM 실행. VM 이름을 생략하면 목록의 첫 VM을 실행하고, sdb 연결까지 대기.

**사용 시점:** 이미 생성된 에뮬레이터 VM 부팅 (콜드 부팅은 수 분 소요 가능).

**파라미터:**

| 파라미터       | 타입   | 기본값           | 설명                                |
| -------------- | ------ | ---------------- | ------------------------------------ |
| `vmName`       | string | _(목록의 첫 VM)_ | 실행할 에뮬레이터 VM 이름            |
| `timeout`      | number | `300`            | sdb 연결 대기 시간 (초, 1–540)       |
| `emulatorPath` | string | `null`           | 에뮬레이터 프로그램 디렉터리 (선택)  |

**CLI 러너:**

```
node <plugin>/lib/cli/emulator-manager-cli.js launch [--vm-name <name>] [--timeout <seconds>] [--emulator-path <path>]
```

**의존성:** `tizen-create-emulator` (VM이 존재해야 함)

---

### 12. tizen-download-emulator-package

**설명:** Tizen 패키지 저장소에서 에뮬레이터 패키지(`TIZEN-{platform_version}-Emulator`)를 다운로드/설치. 저장소 URL은 `repository.info`에서 읽음.

**사용 시점:** 에뮬레이터 VM 생성/실행에 필요한 에뮬레이터 패키지 설치.

**파라미터:**

| 파라미터          | 타입    | 기본값             | 설명                                    |
| ----------------- | ------- | ------------------ | ---------------------------------------- |
| `platformVersion` | string  | _(최신 자동 감지)_ | Tizen 플랫폼 버전 (예: `10.0`, `11.0`)   |
| `force`           | boolean | `false`            | 이미 설치되어 있어도 강제 재설치         |

**CLI 러너:**

```
node <plugin>/lib/cli/download-emulator-package-cli.js [--platform-version 10.0] [--force]
```

**사전 체크 흐름:**

```
1. Tizen SDK 설치 여부 확인 (sdk.info) → 미설치 시 중단
2. 에뮬레이터 패키지 이미 설치? (.emulator-package-installed 마커) → 설치 시 success 반환
3. 에뮬레이터 패키지 다운로드 스크립트 명령 반환 (suggested_fix) — Phase 2 background 실행
```

**설치 스크립트 동작:** `.package/repository.info`의 미러 URL(없으면 공식 저장소)에서 `pkg_list_{OS}`를 받아, 최신 `TIZEN-X.Y` 플랫폼(또는 지정한 `--platform-version`)의 `TIZEN-{version}-Emulator`와 `Install-dependency` 패키지를 모두 내려받아 SDK 루트에 `data/`를 병합하고, 성공 시 `.emulator-package-installed` 마커를 생성.

**의존성:** `tizen-sdk-install` (Tizen SDK가 먼저 설치되어야 함)

---

### 13. tizen-install-app

**설명:** Tizen 앱 패키지(.tpk/.wgt/.rpk/.rpm)를 디바이스 또는 에뮬레이터에 설치. RPK는 리소스 전용 패키지라 설치만 가능하고 실행할 수 없으며, RPM은 GBS(Platform) 빌드 산출물입니다.

**사용 시점:** 디바이스에 앱 패키지 배포.

**파라미터:**

| 파라미터          | 타입    | 기본값   | 설명                                     |
| ----------------- | ------- | -------- | ---------------------------------------- |
| `packagePath`     | string  | _(필수)_ | .tpk/.wgt/.rpk/.rpm 파일 절대 경로       |
| `deviceSerial`    | string  | `null`   | 대상 디바이스 시리얼 (생략 시 자동 선택) |
| `runAfterInstall` | boolean | `false`  | 설치 후 앱 실행 여부                     |

**CLI 러너:**

```
node <plugin>/lib/cli/project-manager-cli.js install --package <packagePath> [--device-serial <deviceSerial>] [--run]
```

**자동화 단계:**

1. 디바이스/에뮬레이터 자동 감지
2. 앱 패키지 파일 검증
3. 패키지 설치 실행 (`tz install -e <serial> -p <package>`)
4. 설치 결과 검증
5. 옵션으로 앱 실행

**의존성:** `tizen-build-project` (빌드 산출물 필요), `tizen-device-manager` (디바이스 필요)

---

### 14. tizen-gdb-debug

**설명:** Tizen Native 앱 원격 GDB 디버깅 자동화 (setup-only 모드).

**사용 시점:** Native (C/C++) 앱 디버깅.

**파라미터:**

| 파라미터      | 타입    | 기본값   | 설명                                      |
| ------------- | ------- | -------- | ----------------------------------------- |
| `appId`       | string  | _(필수)_ | Tizen 패키지 ID                           |
| `binaryPath`  | string  | _(필수)_ | 디버그 심볼이 있는 호스트 바이너리 경로   |
| `launch`      | boolean | `false`  | launch 모드 (main 전 정지) vs attach 모드 |
| `breakpoints` | string  | `''`     | 쉼표로 구분한 중단점 함수명               |
| `port`        | number  | `5039`   | 디버그 포트                               |
| `timeout`     | number  | `30`     | PID 탐색 대기 (초, attach 모드)           |

**CLI 러너:**

```
node <plugin>/lib/cli/gdb-debug-cli.js <appId> <binaryPath> [options]
```

**자동화 단계:**

1. 디바이스 SDB 연결 상태 확인
2. 디바이스의 gdbserver 자동 감지
3. 앱 시작 및 PID 확보 (attach 모드)
4. 디바이스에 gdbserver 바인딩
5. SDB로 TCP 포트 포워딩
6. gdb init 파일 + 대화형 gdb 명령 생성

**의존성:** `tizen-install-app` (앱이 설치되어 실행 중이어야 함)

---

### 15. tizen-dotnet-debug

**설명:** netcoredbg를 사용한 Tizen .NET 앱 원격 디버깅 자동화 (setup-only 모드).

**사용 시점:** C# (.NET) 앱 디버깅.

**파라미터:**

| 파라미터       | 타입    | 기본값   | 설명                                  |
| -------------- | ------- | -------- | ------------------------------------- |
| `appId`        | string  | _(필수)_ | Tizen 패키지 ID                       |
| `launch`       | boolean | `false`  | launch 모드 (DAP 서버) vs attach 모드 |
| `breakpoints`  | string  | `''`     | 쉼표로 구분한 중단점 (File.cs:line)   |
| `port`         | number  | `4711`   | DAP 서버 포트 (launch 모드)           |
| `serial`       | string  | `''`     | 디바이스 시리얼 (생략 시 자동 선택)   |
| `timeout`      | number  | `30`     | PID 탐색 대기 (초, attach 모드)       |
| `forceInstall` | boolean | `false`  | netcoredbg 강제 재설치                |

**CLI 러너:**

```
node <plugin>/lib/cli/dotnet-debug-cli.js <appId> [options]
```

**자동화 단계:**

1. 디바이스 연결 확인
2. 온디맨드 netcoredbg 설치
3. 앱 시작 및 PID 확보 (attach 모드)
4. 대화형 netcoredbg 명령 (attach) 또는 VS Code DAP 설정 (launch) 생성

**의존성:** `tizen-install-app` (앱이 설치되어야 함), `tizen-dotnet-setup` (.NET 워크로드 필요)

---

### 16. tizen-webapp-debug

**설명:** RWI(Remote Web Inspector)/CDP를 사용한 Tizen 웹앱(.wgt) 원격 디버깅 자동화 (setup-only 모드).

**사용 시점:** Web (HTML/JS/CSS) 앱 디버깅. Native/.NET 앱에는 사용 금지 (`tizen-gdb-debug`/`tizen-dotnet-debug` 사용).

**파라미터:**

| 파라미터  | 타입   | 기본값   | 설명                                          |
| --------- | ------ | -------- | --------------------------------------------- |
| `appId`   | string | _(필수)_ | Tizen 웹앱 ID (예: `abcDEF1234.MyWebApp`)     |
| `port`    | number | `9222`   | 디바이스 RWI 포트로 포워딩할 호스트 포트      |
| `serial`  | string | `''`     | 디바이스 시리얼 (생략 시 자동 선택)           |
| `timeout` | number | `30`     | CDP 엔드포인트 준비 대기 (초)                 |

**CLI 러너:**

```
node <plugin>/lib/cli/webapp-debug-cli.js --app-id <appId> [--port 9222] [--serial <serial>] [--timeout 30]
```

**자동화 단계:**

1. 디바이스 연결 확인 + 웹앱(wgt) 여부 검증 (아니면 gdb/dotnet 디버깅으로 라우팅)
2. 앱을 웹 디버그 모드로 재실행 (`app_launcher -w -s`) 후 RWI 포트 파싱
3. SDB로 호스트 포트 → 디바이스 RWI 포트 포워딩
4. CDP 엔드포인트 검증 (`/json/version`, `/json/list`)
5. CDP 엔드포인트 + Chrome DevTools 직접 링크(`connect.devtools`, `http://127.0.0.1:<port>/devtools/inspector.html?ws=...`) + Playwright(`connectOverCDP`) 스니펫 반환

**의존성:** `tizen-install-app` (앱이 설치되어야 함)

---

### 17. tizen-screenshot

**설명:** Tizen 디바이스 또는 에뮬레이터의 화면을 PNG 파일로 캡처.

**사용 시점:** 디바이스/에뮬레이터 화면 스크린샷 (에뮬레이터 자동 감지 포함).

**파라미터:**

| 파라미터 | 타입   | 기본값             | 설명                                     |
| -------- | ------ | ------------------ | ---------------------------------------- |
| `serial` | string | `null`             | 대상 디바이스 시리얼 (생략 시 자동 선택) |
| `output` | string | `./screenshot.png` | 출력 PNG 파일 경로                       |

**CLI 러너:**

```
node <plugin>/lib/cli/screenshot-cli.js [serial] [output]
```

**캡처 방식 (자동 감지):**

**에뮬레이터** (serial이 `emulator-`로 시작):

1. Host-side `xwd` — **가장 안정적** (에뮬레이터의 X11 윈도우 캡처)
2. Device-side `screencapture`
3. Device-side `capture_screen`
4. Device-side `/dev/fb0` (framebuffer)

**물리 기기:**

1. Device-side `/dev/fb0` (framebuffer)
2. Device-side `screencapture`
3. Device-side `capture_screen`
4. Host-side `xwd` (rarely applicable)

**응답 (성공):**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "screenshot_path": "/path/to/screenshot.png",
    "capture_method": "host-side xwd",
    "file_size_bytes": 1234567,
    "dimensions": "1920x1080"
  },
  "command": "tizen-sdk screenshot"
}
```

**의존성:** `tizen-device-manager` (디바이스 필요)

---

### 18. tizen-tv-sdk-install

**설명:** Tizen TV SDK 확장 패키지(TV-SAMSUNG-Public) 설치. Tizen SDK가 먼저 설치되어 있어야 함.

**사용 시점:** TV 앱 개발을 위한 TV SDK 확장 설치.

**파라미터:**

| 파라미터 | 타입    | 기본값  | 설명                             |
| -------- | ------- | ------- | -------------------------------- |
| `force`  | boolean | `false` | 이미 설치되어 있어도 강제 재설치 |

**CLI 러너:**

```
node <plugin>/lib/cli/tv-sdk-install-cli.js [--force]
```

**설치 조건 흐름:**

```
1. Tizen SDK 설치 여부 확인 (sdk.info)
   ├─ 설치됨 → TV SDK 설치 진행
   └─ 미설치 → 대화형 메시지: "Tizen SDK가 먼저 설치되어야 합니다. 설치하시겠습니까?"
       ├─ 승인 → tizen-sdk-install 스킬 호출 → 완료 후 TV SDK 설치 재시도
       └─ 거부 → 중단 종료
2. TV SDK 이미 설치? (.tv-sdk-installed 마커) → 설치 시 success 반환
3. TV SDK 설치 스크립트 명령 반환 (suggested_fix) — Phase 2 background 실행
```

**패키지 저장소:**

- URL: `https://download.tizen.org/sdk/extensions/tv_extensions/`
- 타겟 패키지: `TV-SAMSUNG-Public`
- 설치 위치: 기존 Tizen SDK 경로 (동일한 `~/tizen-sdk` 폴더)

**의존성:** `tizen-sdk-install` (Tizen SDK가 먼저 설치되어야 함)

---

### 19. tizen-update-package

**설명:** 설치된 Tizen SDK 패키지의 새 버전을 확인하고 업데이트. pkg_list 파일을 다운로드하여 `.package/*.manifest` 파일과 버전을 비교 후 업데이트.

**사용 시점:** 설치된 SDK 패키지 업데이트.

**파라미터:**

| 파라미터 | 타입    | 기본값  | 설명                               |
| -------- | ------- | ------- | ---------------------------------- |
| `force`  | boolean | `false` | 이미 최신 버전이어도 강제 업데이트 |
| `dryRun` | boolean | `false` | 업데이트 없이 변경 사항만 확인     |

**CLI 러너:**

```
node <plugin>/lib/cli/update-package-cli.js [--force] [--dry-run]
```

**자동화 단계:**

1. Tizen SDK 설치 여부 확인
2. OS에 맞는 pkg_list 파일 다운로드 (windows-64 / ubuntu-64 / macos-64)
3. `.package/*.manifest` 파일 스캔하여 설치된 패키지 및 버전 파악
4. pkg_list와 설치된 버전을 비교하여 업데이트 가능한 패키지 식별
5. (dry-run이 아닌 경우) 새 버전 다운로드 및 설치, manifest 업데이트

**의존성:** `tizen-sdk-install` (Tizen SDK가 먼저 설치되어야 함)

---

### 20. tizen-sdb-helper

**설명:** Tizen 디바이스에 대한 자연어 요청을 올바른 sdb 명령으로 매칭 — 로그 캡처, 셸, 포트 포워드, root 토글, 리부트, 화면 상태 등 — 파괴적 작업은 확인 게이트(confirmed gate) 적용.

**사용 시점:** 연결된 디바이스에 임시 sdb 명령 실행 (로그, 셸, 포트 포워딩, 디바이스 전원 제어). 일부 intent(screenshot, install/uninstall, list devices, connect/disconnect)는 sdb-helper가 매칭하되 더 풍부한 파이프라인을 제공하는 전용 스킬로 핸드오프합니다. 파일 전송은 `tizen-file-transfer` 스킬을 직접 사용하세요.

**파라미터:**

| 파라미터  | 타입   | 기본값   | 설명                                              |
| --------- | ------ | -------- | ------------------------------------------------- |
| `request` | string | _(필수)_ | 자연어 sdb 요청 (예: "list devices", "tail logs") |
| `serial`  | string | `null`   | 타겟 디바이스 시리얼 (생략 시 자동 선택)          |

**CLI 러너:**

```
node <plugin>/lib/cli/sdb-helper-cli.js --request <text> [--serial <serial>]
```

**CLI 예제:**

```bash
node .../sdb-helper-cli.js --request "tail the logs"
node .../sdb-helper-cli.js --request "open a shell" --serial emulator-26101
node .../sdb-helper-cli.js --request="reboot the device" --serial=emulator-26101
```

**자동화 단계:**

1. 설정된 SDK 경로에서 sdb 바이너리 해석
2. 자연어 요청을 sdb intent로 매칭 (25+ intent 패턴)
3. 연결된 디바이스 자동 감지 (또는 제공된 시리얼 사용)
4. 읽기 전용 intent: sdb 명령 실행 후 출력 반환
5. 게이트된 intent (reboot, factoryreset, root on 등): 확인용으로 명령 반환, 실행하지 않음
6. 핸드오프 intent: 실행 대신 `suggested_skill`이 포함된 success envelope 반환:
   - `list-devices` → `tizen-device-manager` (에뮬레이터 폴백)
   - `connect`/`disconnect` → `tizen-remote-device` (북마크 관리)
   - `install`/`uninstall` → `tizen-install-app` (패키지 설치 파이프라인)
   - `screenshot` → `tizen-screenshot` (컨트롤 패널 제거 + 스티칭)
7. 명령, 출력, 디바이스 정보가 포함된 Standard JSON Envelope 반환

**응답 (성공, 읽기 전용 intent):**

```json
{
  "status": "success",
  "result": {
    "intent": "log-stream",
    "command": "sdb -s \"emulator-26101\" dlog -v threadtime",
    "device_serial": "emulator-26101",
    "output": "...",
    "gated": false
  },
  "command": "tizen-sdk sdb-helper"
}
```

**응답 (성공, 게이트된 intent — 미실행):**

```json
{
  "status": "success",
  "result": {
    "intent": "reboot",
    "gated": true,
    "command": "sdb -s \"emulator-26101\" shell reboot",
    "device_serial": "emulator-26101",
    "message": "This is a gated action. Confirm before running."
  },
  "command": "tizen-sdk sdb-helper"
}
```

**의존성:** `tizen-sdk-init` (SDK 경로가 설정되어 있어야 함)

---

### 21. tizen-file-transfer

**설명:** sdb push/pull로 호스트 컴퓨터와 연결된 Tizen 디바이스/에뮬레이터 간 파일/디렉토리 전송.

**사용 시점:** 디바이스로 파일 복사(push, 호스트→디바이스) 또는 디바이스에서 파일 가져오기(pull, 디바이스→호스트).

**파라미터:**

| 파라미터     | 타입    | 기본값                    | 설명                                                   |
| ------------ | ------- | ------------------------- | ------------------------------------------------------ |
| `direction`  | string  | _(필수)_                  | `push` (호스트→디바이스) 또는 `pull` (디바이스→호스트) |
| `localPath`  | string  | _(push 필수; pull은 `-`)_ | 로컬(호스트) 경로 (pull에서 `-`면 기본값 `.` 사용)     |
| `remotePath` | string  | _(필수)_                  | 원격(디바이스) 경로                                    |
| `serial`     | string  | `null`                    | 디바이스 시리얼 (생략 시 자동 선택)                    |
| `withUtf8`   | boolean | `false`                   | UTF-8 인코딩 경로 처리                                 |

**CLI 러너:**

```
node <plugin>/lib/cli/file-transfer-cli.js <push|pull> <localPath|-> <remotePath> [serial] [--with-utf8]
node <plugin>/lib/cli/file-transfer-cli.js push "/path/to/local" "/path/on/device"
node <plugin>/lib/cli/file-transfer-cli.js pull - "/path/on/device"
```

**의존성:** `tizen-sdk-init` (sdb 필요), `tizen-device-manager` (연결된 디바이스 필요)

---

### 22. tizen-remote-device

**설명:** 로컬 네트워크에서 Tizen 디바이스 검색(SDB 포트 26101 TCP 스윕), sdb 네트워크 연결/해제, Tizen Studio Device Manager의 원격 디바이스 북마크 목록(add/edit/remove/list-saved) 관리.

**사용 시점:** USB 대신 네트워크로 TV/디바이스 연결, 네트워크에서 Tizen 디바이스 탐색, 원격 디바이스 북마크 저장/이름 변경.

**파라미터:**

| 파라미터  | 타입   | 기본값                                      | 설명                                                                            |
| --------- | ------ | ------------------------------------------- | -------------------------------------------------------------------------------- |
| `action`  | string | `'scan'`                                    | `scan`, `connect`, `disconnect`, `list`, `add`, `remove`, `edit`, `list-saved`   |
| `subnet`  | string | _(전체 로컬 서브넷)_                        | 스캔할 /24 프리픽스 (scan 전용, 예: `192.168.1`)                                 |
| `ip`      | string | _(connect/disconnect/add/remove/edit 필수)_ | 디바이스 IPv4 주소 (edit에서는 기존 북마크 식별용)                               |
| `port`    | number | `26101`                                     | SDB 포트                                                                         |
| `timeout` | number | `3000`                                      | 호스트당 TCP 타임아웃 (ms, scan 전용, 100–30000)                                 |
| `name`    | string | _(add 필수)_                                | 북마크 표시 이름 (edit에서는 새 이름)                                            |
| `newIp`   | string | `null`                                      | edit 전용: 북마크를 옮길 IPv4 주소                                               |
| `newPort` | number | `null`                                      | edit 전용: 북마크를 옮길 SDB 포트                                                |

**CLI 러너:**

```
node <plugin>/lib/cli/remote-device-cli.js <scan|connect|disconnect|list|add|remove|edit|list-saved> [subnet|ip] [--port N] [--timeout MS] [--name NAME] [--new-ip IP] [--new-port N]
```

**참고:** `scan`은 SDK 없이 동작하는 순수 TCP 스윕이며, `connect`/`disconnect`/`list`는 sdb(설치된 SDK + `tizen-sdk-init`)가 필요합니다. `add`/`remove`/`edit`/`list-saved`는 Device Manager의 `remote_device_scan.list`를 직접 읽고 쓰므로 sdb가 필요 없습니다.

**의존성:** `tizen-sdk-init` (connect/disconnect/list에만 필요; scan과 북마크 관리는 의존성 없음)

---

### 23. tizen-sdk-install-custom-repo

**설명:** 타임존으로 자동 선택되는 CDN 미러 대신 **사용자가 지정한 패키지 저장소 URL**(사내 미러, 빌드 서버 산출물, 로컬 HTTP 서버)에서 Tizen SDK를 설치합니다. URL은 먼저 검증되며, `pkg_list_{OS}-64` 또는 `pkg_list_{OS}-32`를 제공하지 않으면 **아무것도 다운로드하기 전에** 설치가 거부됩니다. 저장소 URL 검증만 단독으로도 수행할 수 있습니다.

**사용 시점:** 사내/팀 미러 또는 특정 SDK 빌드에서 설치할 때, 또는 어떤 URL이 사용 가능한 Tizen 패키지 저장소인지 확인할 때.

**파라미터:**

| 파라미터          | 타입    | 기본값                  | 설명                                                                    |
| ----------------- | ------- | ----------------------- | ----------------------------------------------------------------------- |
| `repoUrl`         | string  | _(필수)_                | `pkg_list_{OS}-{64,32}`를 제공하는 패키지 저장소 base URL                |
| `platformVersion` | string  | _(pkg_list 최신 버전)_  | Tizen 플랫폼 버전 (예: `10.0`, `11.0`)                                  |
| `force`           | boolean | `false`                 | 강제 재설치 — 이미 설치된 SDK의 저장소를 바꾸려면 **반드시 필요**        |

**CLI 러너:**

```
node <plugin>/lib/cli/sdk-install-custom-repo-cli.js <repo-url> [platform-version] [--force]
node <plugin>/lib/cli/validate-repo-url-cli.js <repo-url>          # 검증만
```

tizen-cli 명령:

```
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url <url> [--platform-version 11.0] [--force]
tizen-cli tizen-sdk validate-repo-url --repo-url <url>
tizen-cli tizen-sdk sdk-install --repo-url <url>            # 동일한 흐름의 단축 형태
```

**저장소 URL 규칙:**

Tizen 패키지 저장소는 루트에 패키지 목록 파일을 제공합니다:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}      OS = windows | ubuntu | macos      ARCH = 64 | 32
```

`-64`를 먼저, 그다음 `-32`를 확인합니다(32비트만 제공하는 미러도 동작). 확인은 HEAD 요청으로 하고, HEAD를 거부하는 서버에는 1바이트 range GET으로 대체합니다. 현재 OS용 pkg_list를 제공하지 않는 URL은 **선제적으로 거부**됩니다 — 그대로 진행하면 약 100개 패키지 다운로드가 실패하고 SDK가 반쯤 설치된 상태로 남기 때문입니다. `http://`와 `https://`만 지원하며, URL은 pkg_list 파일이 아니라 그 파일이 **들어 있는 디렉터리**여야 합니다.

**사전 체크 흐름:**

```
1. Node.js 체크 (18+ 필요) → 미설치 시 OS별 설치 가이드와 함께 중단
2. 저장소 URL 검증 (pkg_list_{OS}-{64,32}) → 유효하지 않으면 중단 (다운로드 없음)
3. SDK 이미 설치됨? → success + "저장소를 바꾸려면 --force 필요" 경고
4. 디스크 공간 체크 (15 GB, 홈 드라이브) → 부족 시 상세 정보와 함께 중단
5. Phase 2(백그라운드 설치)용 설치 명령 반환
```

**스크립트:**

| 파일                                                                        | 플랫폼                |
| --------------------------------------------------------------------------- | --------------------- |
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh`    | Linux / macOS / WSL2  |
| `scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.ps1`   | Windows PowerShell    |

두 스크립트는 검증 전용 프런트엔드입니다. URL 검증을 통과하면 `--repo-url` / `-RepoUrl`을 붙여 `tizen-sdk-install`에 위임하고, 실제 설치는 기존 설치 스크립트가 수행합니다. 기존 설치 스크립트도 이 플래그를 직접 받으며, 검증만 수행하는 `--validate-repo-url` / `-ValidateRepoUrl` 모드가 있습니다.

**응답 (검증 성공 - 예시 사설 미러):**

```json
{
  "status": "success",
  "result": {
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "valid": true,
    "pkg_list_file": "pkg_list_ubuntu-64",
    "pkg_list_url": "http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_ubuntu-64",
    "probed_urls": ["http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_ubuntu-64"]
  },
  "command": "tizen-sdk validate-repo-url"
}
```

**응답 (설치 성공):**

```json
{
  "status": "success",
  "result": {
    "packages": [{ "name": "Tizen Platforms (10)", "status": "installed", "version": "11.0" }],
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "installation_status": "completed"
  },
  "command": "tizen-sdk sdk-install-custom-repo"
}
```

**참고:** repository_url은 루트에서 `pkg_list_{OS}-{64,32}`를 제공하는 어떤 서버든 될 수 있습니다. 예:
- `http://mirror.example.com/packages/tizen_sdk_11.0/` (SDK 11.0 미러)
- `http://mirror.example.com/packages/tizen_studio_6.5/` (SDK 10.0 MR / Tizen Studio 6.5 미러)
- `http://localhost:8000/` (저장소 덤프를 서빙하는 로컬 HTTP 서버)

**응답 (유효하지 않은 저장소 URL):**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_REPO_E002",
      "error_category": "repo_url_unreachable",
      "message": "Not a valid Tizen package repository: https://example.com/repo. Neither pkg_list_{OS}-64 nor pkg_list_{OS}-32 could be fetched from it.",
      "details": [
        "[INFO]  Probing https://example.com/repo/pkg_list_ubuntu-64",
        "[INFO]  Probing https://example.com/repo/pkg_list_ubuntu-32"
      ]
    }
  ],
  "command": "tizen-sdk sdk-install-custom-repo"
}
```

**에러 분류:**

| `error_category`       | 의미                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `repo_url_invalid`     | URL 누락/형식 오류, http(s) 아닌 스킴, 또는 pkg_list 파일 자체를 가리킴             |
| `repo_url_unreachable` | 형식은 맞지만 `pkg_list_{OS}-{64,32}`를 제공하지 않음 (잘못된 URL 또는 VPN/프록시 필요) |

**후속 영향:** 설치 시 사용자 지정 URL이 `{SDK_PATH}/.package/repository.info`에 기록되고, `tizen-update-package`와 `tizen-download-emulator-package`가 이 파일을 읽습니다. 따라서 이후 패키지 업데이트와 에뮬레이터 패키지도 **같은 사용자 지정 저장소**에서 내려받습니다.

**의존성:** 없음 (`tizen-sdk-install`의 대체 진입점)

**상세 문서:** [sdk-install/CUSTOM_REPOSITORY_INSTALL.md](sdk-install/CUSTOM_REPOSITORY_INSTALL.md)

---

### 24. tizen-playwright-test

**설명:** Tizen 웹앱(.wgt)에 대한 Playwright 자동화 테스트 실행/스캐폴딩 (RWI/CDP 기반).

**사용 시점:** Web (HTML/JS/CSS) 앱의 자동화 테스트(assertion, E2E, UI 자동화). Native/.NET 앱에는 사용 금지 (웹 런타임이 없어 Playwright가 attach할 수 없음). 인터랙티브 디버깅은 `tizen-webapp-debug` 사용.

**파라미터:**

| 파라미터       | 타입    | 기본값                                  | 설명                                                     |
| -------------- | ------- | --------------------------------------- | -------------------------------------------------------- |
| `appId`        | string  | _(실행 시 필수)_                        | Tizen 웹앱 ID (예: `abcDEF1234.MyWebApp`)                |
| `testFile`     | string  | `<projectDir>/tizen-playwright.test.js` | node로 실행할 테스트 스크립트 (.js/.mjs/.cjs)            |
| `projectDir`   | string  | cwd / testFile의 디렉터리               | 테스트 프로젝트 (실행 cwd; node_modules에 playwright 필요) |
| `port`         | number  | `9222`                                  | 디바이스 RWI 포트로 포워딩할 호스트 포트                 |
| `serial`       | string  | `''`                                    | 디바이스 시리얼 (생략 시 자동 선택)                      |
| `setupTimeout` | number  | `30`                                    | CDP 셋업 준비 대기 (초, 1-300)                           |
| `timeout`      | number  | `120`                                   | 테스트 실행 타임아웃 (초, 1-600)                         |
| `skipSetup`    | boolean | `false`                                 | 이미 살아있는 CDP 엔드포인트 재사용 (디버그 재실행 생략) |
| `scaffold`     | boolean | `false`                                 | 테스트 파일(+package.json) 생성만 하고 종료              |
| `force`        | boolean | `false`                                 | 기존 스캐폴딩 테스트 파일 덮어쓰기 (scaffold와 함께)     |

**CLI 러너:**

```
node <plugin>/lib/cli/playwright-test-cli.js --app-id <appId> --project-dir <dir> [--test-file <path>] [--port 9222] [--serial <serial>] [--timeout 120] [--no-setup]
node <plugin>/lib/cli/playwright-test-cli.js --scaffold --project-dir <dir> [--app-id <appId>] [--force]
```

**자동화 단계:**

1. 테스트 파일 해석 (없으면 `--scaffold` 안내) + 테스트 프로젝트에서 playwright 의존성 확인 (없으면 `dependency_missing`)
2. CDP 셋업 — `tizen-webapp-debug` 흐름 재사용 (디바이스 확인, wgt 검증, 디버그 모드 재실행, 포트 포워딩, 엔드포인트 검증); `--no-setup`이면 엔드포인트 프로브만
3. `node <testFile>`을 테스트 프로젝트 cwd에서 스폰 (`TIZEN_CDP_ENDPOINT`/`TIZEN_CDP_PORT`/`TIZEN_APP_ID` 환경변수 전달)
4. exit code + `TEST_RESULT:` 마커 → 성공 / `test_failed` / `test_timeout` / `inspector_not_available`(ECONNREFUSED = 앱 재시작) 매핑

**중요:** Playwright는 **테스트 프로젝트의 node_modules**에서 해석됩니다 — 플러그인에는 절대 설치하지 마세요. 스캐폴딩된 템플릿은 실행 중인 앱 페이지에 attach만 하며(`connectOverCDP` → `contexts()[0].pages()[0]`), 절대 `page.goto()`/`newPage()`를 호출하지 않습니다.

**의존성:** `tizen-install-app` (앱이 설치되어야 함), 테스트 프로젝트에 `npm install playwright`

---

### 25. tizen-platform-install

**설명:** Tizen 패키지 저장소에서 Tizen 플랫폼 패키지(`TIZEN-{Version}`)를 다운로드/설치. 저장소 URL은 `repository.info`에서 읽음. Tizen SDK가 먼저 설치되어 있어야 함.

**사용 시점:** Tizen 플랫폼 패키지 설치 (Native 프로젝트 빌드에 필요).

**파라미터:**

| 파라미터          | 타입    | 기본값             | 설명                                    |
| ----------------- | ------- | ------------------ | ---------------------------------------- |
| `platformVersion` | string  | _(최신 자동 감지)_ | Tizen 플랫폼 버전 (예: `10.0`, `11.0`)   |
| `force`           | boolean | `false`            | 이미 설치되어 있어도 강제 재설치         |

**CLI 러너:**

```
node <plugin>/lib/cli/platform-install-cli.js [--platform-version <version>] [--force]
```

**사전 체크 흐름:**

```
1. Tizen SDK 설치 여부 확인 (sdk.info) → 미설치 시 중단
2. 플랫폼 패키지 이미 설치? (.platform-installed 마커) → 설치 시 success 반환
3. 플랫폼 패키지 설치 스크립트 명령 반환 (suggested_fix) — Phase 2 background 실행
```

**설치 스크립트 동작:** `.package/repository.info`의 미러 URL(없으면 공식 저장소)에서 `pkg_list_{OS}`를 받아, 지정한 `--platform-version`(또는 최신)의 `TIZEN-{version}` 플랫폼 패키지와 모든 `Install-dependency` 패키지를 다운로드하여 SDK 루트에 `data/`를 병합하고, 성공 시 `.platform-installed` 마커를 생성.

**의존성:** `tizen-sdk-install` (Tizen SDK가 먼저 설치되어야 함)

---

### 26. tizen-download-mobile-platform

**설명:** Tizen 패키지 저장소에서 Tizen 모바일 플랫폼 패키지(`MOBILE-{version}`)를 다운로드/설치. IOT-Headed 확장 패키지도 옵션으로 지원.

**사용 시점:** Tizen 모바일 플랫폼 패키지 설치 (모바일 디바이스 대상 개발), IOT-Headed 확장 설치.

**파라미터:**

| 파라미터            | 타입    | 기본값             | 설명                                              |
| ------------------- | ------- | ------------------ | ------------------------------------------------- |
| `platformVersion`   | string  | _(최신 자동 감지)_ | Tizen 모바일 플랫폼 버전 (예: `10.0`, `11.0`)     |
| `includeIotHeaded`  | boolean | `false`            | IOT-Headed 확장 패키지도 함께 설치                |
| `iotHeadedVersion`  | string  | _(최신 자동 감지)_ | IOT-Headed 확장 버전                              |
| `force`             | boolean | `false`            | 이미 설치되어 있어도 강제 재설치                  |

**CLI 러너:**

```
node <plugin>/lib/cli/download-mobile-platform-cli.js [--platform-version <version>] [--include-iot-headed] [--iot-headed-version <version>] [--force]
```

**사전 체크 흐름:**

```
1. Tizen SDK 설치 여부 확인 (sdk.info) → 미설치 시 중단
2. 모바일 플랫폼 패키지 이미 설치? (.mobile-platform-installed 마커) → 설치 시 success 반환
3. 모바일 플랫폼 패키지 다운로드 스크립트 명령 반환 (suggested_fix) — Phase 2 background 실행
```

**IOT-Headed 확장 (선택):** `--include-iot-headed`를 지정하면 `extension_info.xml`에서 IoT Headed 저장소 URL을 파싱하여 IOT-Headed 패키지와 의존성을 함께 다운로드/설치합니다.

**의존성:** `tizen-sdk-install` (Tizen SDK가 먼저 설치되어야 함)

---

### 27. tizen-install-rootstrap

**설명:** ZIP 파일에서 커스텀 루트스트랩 패키지를 Tizen SDK에 설치. 보안 검증(경로 순회, 심볼릭 링크 거부)을 포함.

**사용 시점:** 크로스 컴파일용 커스텀 루트스트랩 설치 (Native 프로젝트 빌드에 필요).

**파라미터:**

| 파라미터  | 타입    | 기본값    | 설명                           |
| --------- | ------- | --------- | ------------------------------ |
| `zipPath` | string  | _(필수)_  | 루트스트랩 ZIP 파일 경로       |
| `force`   | boolean | `false`   | 이미 설치되어 있어도 강제 재설치 |

**CLI 러너:**

```
node <plugin>/lib/cli/install-rootstrap-cli.js --zip-path <zipPath> [--force]
```

**자동화 단계:**

1. ZIP 파일 경로 검증 (경로 순회, 심볼릭 링크 거부)
2. Tizen SDK 설치 여부 확인 → 미설치 시 중단
3. 임시 디렉터리에 ZIP 압축 해제
4. ZIP 구조 감지 (`data/` 또는 `tizen-studio/`)
5. 루트스트랩 XML 메타데이터 파싱 (profile, version, device, type)
6. `tools/` 폴더를 SDK에 복사
7. `platforms/` 폴더를 SDK에 복사
8. `tizen-studio` 구조인 경우: 네이티브 패키지 확인 후 `tizen-7.0`으로 복사
9. 성공 시 `.rootstrap-installed` 마커 생성

**지원 ZIP 구조:**

- `data/` 레이아웃 — 표준 루트스트랩 패키지
- `tizen-studio/` 레이아웃 — 네이티브 개발 패키지 필요

**의존성:** `tizen-sdk-install` (Tizen SDK가 먼저 설치되어야 함)

---

### 28. tizen-dlog-analyzer

**설명:** Tizen 디바이스의 dlog를 지속적으로 수집·분석하여 크래시/예외를 자동 감지. AI 기반 루트 코즈 분석 및 해결책 제안.

**사용 시점:** 실행 중인 앱의 크래시/예외 모니터링, dlog 기반 근본 원인 분석. 에뮬레이터 또는 디바이스가 필요.

**파라미터:**

| 파라미터      | 타입   | 기본값   | 설명                                                                     |
| ------------- | ------ | -------- | ------------------------------------------------------------------------ |
| `action`      | string | _(필수)_ | `start`, `stop`, `check`, `status`, `app-launch`, `app-terminate`, `dlog-collect`, `stop-collect`, `error-analyze` 중 하나 |
| `subcommand`  | string | _(start 전용)_ | `dlog-collect`, `exception-detect`, `start-monitoring` (권장)     |
| `app-id`      | string | _(앱 액션)_ | Tizen 앱 ID (예: org.example.myapp). app-launch, app-terminate, dlog-collect, error-analyze에 필수 |
| `format`      | string | `null`   | error-analyze 전용: `summary` (요약 라인만), `details` (상세 항목만), 생략 시 둘 다  |
| `serial`      | string | `null`   | sdb 디바이스 시리얼 (생략 시 자동 선택)                                  |

**CLI 러너:**

```
node <plugin>/lib/cli/dlog-analyzer-cli.js <action> [subcommand] [serial]
node <plugin>/lib/cli/dlog-analyzer-cli.js start start-monitoring
node <plugin>/lib/cli/dlog-analyzer-cli.js check
node <plugin>/lib/cli/dlog-analyzer-cli.js stop
node <plugin>/lib/cli/dlog-analyzer-cli.js app-launch <app-id>
node <plugin>/lib/cli/dlog-analyzer-cli.js app-terminate <app-id>
node <plugin>/lib/cli/dlog-analyzer-cli.js dlog-collect <app-id>
node <plugin>/lib/cli/dlog-analyzer-cli.js stop-collect
node <plugin>/lib/cli/dlog-analyzer-cli.js error-analyze <app-id> [format]
```

**워크플로우:**

1. **모니터링 시작** (`start start-monitoring`) — 앱 실행 전에 백그라운드에서 dlog 수집/분석 시작
2. **앱 실행** — 모니터링이 켜진 상태에서 앱을 실행하여 시작 로그부터 캡처
3. **사용자 피드백 대기** — 앱 정상 동작 시 `stop`, 문제 발생 시 `check`로 분석 결과 확인
4. **분석 결과 확인** (`check`) — 크래시/예외 분석 결과를 읽고 해결책 제안
5. **수정 적용** → **재빌드** → **재설치/재실행** → **재확인** (`check`) — 문제 해결까지 반복
6. **모니터링 종료** (`stop`) — 백그라운드 프로세스 정리

**액션 설명:**

| 액션            | 설명                                                          |
| --------------- | ------------------------------------------------------------- |
| `start`         | 백그라운드에서 바이너리를 실행하고 출력을 임시 파일에 캡처   |
| `stop`          | 실행 중인 백그라운드 프로세스 종료                            |
| `check`         | 임시 파일에서 최신 분석 결과 읽기                             |
| `status`        | 백그라운드 프로세스 실행 여부 확인                            |
| `app-launch`    | `sdb shell app_launcher -s`로 디바이스에서 Tizen 앱 실행      |
| `app-terminate` | `sdb shell app_launcher -k`로 실행 중인 Tizen 앱 종료        |
| `dlog-collect`  | 앱 PID로 필터링된 dlog를 백그라운드로 수집 시작 (앱이 실행 중이어야 함) |
| `stop-collect`  | 백그라운드 앱 dlog 수집 프로세스 종료                         |
| `error-analyze` | 수집된 앱 로그에서 E/F 우선순위 에러 분석 (중복 제거 포함)   |

**참고:** 한 번에 하나의 인스턴스만 실행 가능. 이미 실행 중이면 `start`는 `already_running` 에러 반환. 백그라운드 프로세스는 세션이 종료되어도 유지되므로 반드시 `stop`(및 `stop-collect`)으로 종료해야 함. 분석 완료 시 보고서는 영문 → 한글 순서로 항상 두 언어로 렌더링됨.

**의존성:** `tizen-launch-emulator` 또는 `tizen-device-manager` (실행 중인 디바이스/에뮬레이터 필요)

**상세 문서:** [debug/scenario-dlog-analyzer-walkthrough.md](debug/scenario-dlog-analyzer-walkthrough.md)

---

## 스킬 의존성 흐름


```
┌─────────────────────────────────────────────────────────────────────┐
│                        SDK 설치 단계                                 │
│                                                                     │
│  tizen-check-node ──→ tizen-check-disk-space ──→ tizen-sdk-install  │
│  (Node.js 18+?)        (15 GB 여유?)            (10-15분 설치)       │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    플랫폼/확장 패키지 단계                            │
│                                                                     │
│  tizen-platform-install ──→ tizen-download-mobile-platform          │
│  (TIZEN-{version})          (MOBILE-{version}, IOT-Headed)          │
│  tizen-download-emulator-package ──→ tizen-install-rootstrap         │
│  (에뮬레이터 패키지)                 (커스텀 루트스트랩)              │
│  tizen-tv-sdk-install (TV SDK 확장)                                 │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      프로젝트 설정 단계                              │
│                                                                     │
│  tizen-dotnet-setup ──→ tizen-create-project ──→ tizen-build-project │
│  (.NET 워크로드)        (Native/DotNET/WebApp/Platform)    (Debug/Release)   │
│  tizen-certificate-manager ──→ (서명 인증서/프로파일 → 빌드 서명)     │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     배포, 디버그, 스크린샷 단계                       │
│                                                                     │
│  tizen-create-emulator ─→ tizen-launch-emulator                    │
│  (VM 생성, em-cli)        (VM 부팅)                                 │
│  tizen-remote-device (네트워크 검색/sdb 연결) ──┐                    │
│                                                 ▼                    │
│  tizen-device-manager ──→ tizen-install-app ──→ tizen-gdb-debug     │
│  (디바이스/에뮬레이터)    (.tpk/.wgt)          (Native)             │
│                            │                  ├→ tizen-dotnet-debug │
│                            │                  │  (.NET)              │
│                            │                  └→ tizen-webapp-debug │
│                            │                     (WebApp, RWI/CDP)   │
│                            │                      └→ tizen-playwright-test │
│                            │                          (WebApp 자동화 테스트)  │
│                            ├→ tizen-dlog-analyzer                   │
│                            │    (dlog 크래시/예외 분석)              │
│                            ▼                                        │
│                      tizen-screenshot                               │
│                      (에뮬/TV 스크린샷)                              │
│  tizen-file-transfer (sdb push/pull) · tizen-sdb-helper (임시 sdb)   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API 레퍼런스

| #   | 스킬                     | 함수                  | CLI 러너                  | 설명                                                  |
| --- | ------------------------ | --------------------- | ------------------------- | ----------------------------------------------------- |
| 1   | `tizen-sdk-init`         | `initSdk()`           | `sdk-init-cli.js`         | SDK 경로 설정 (`~/.tizen.sdk.path.config`)            |
| 2   | `tizen-sdk-install`      | `installSdk()`        | `sdk-install-cli.js`      | Tizen SDK 설치 (Node.js + 디스크 공간 사전 체크 포함) |
| 2a  | `tizen-sdk-install` (repo-info) | `getRepoInfo()` | `sdk-repo-info-cli.js`    | SDK 패키지 저장소 정보 조회 (공식 CDN·지역 미러, 현재 설정 URL; 사설 미러는 `--repo-url`로 지정) |
| 3   | `tizen-check-node`       | `checkNode()`         | `check-node-cli.js`       | Node.js 설치 확인 (18+ 필요)                          |
| 4   | `tizen-check-disk-space` | `checkDiskSpace()`    | `check-disk-space-cli.js` | 디스크 공간 확인 (15 GB, 홈 드라이브)                 |
| 5   | `tizen-dotnet-setup`     | `setupDotnet()`       | `dotnet-setup-cli.js`     | .NET Tizen 워크로드 설치                              |
| 6   | `tizen-create-project`   | `createProject()`     | `project-manager-cli.js`  | 템플릿에서 프로젝트 생성                              |
| 6a  |                          | `listTemplates()`     | `project-manager-cli.js`  | 사용 가능한 템플릿 목록                               |
| 6b  |                          | `deleteProject()`     | `project-manager-cli.js`  | 프로젝트 삭제 (`delete` 액션 — Tizen 프로젝트 마커 없는 경로 거부) |
| 7   | `tizen-build-project`    | `buildProject()`      | `project-manager-cli.js`  | 프로젝트 빌드 (Debug/Release, `--clean`, GBS `--arch`) |
| 8   | `tizen-certificate-manager` | `generateAuthorCertificate()` 외 | `cert-manager-cli.js` | 인증서/서명 프로파일 관리 (로컬 + Samsung online-CA) |
| 9   | `tizen-device-manager`   | `manageDevice()`      | `device-manager-cli.js`   | 연결된 디바이스 탐지 (start) / 에뮬레이터 VM 종료 (stop) |
| 10  | `tizen-create-emulator`  | `createEmulator()`    | `emulator-manager-cli.js` | 커스텀 에뮬레이터 VM 생성 (크기/플랫폼/프로파일)      |
| 10a |                          | `manageEmulator()`    | `emulator-manager-cli.js` | em-cli 전체 액션 (list/detail/modify/reset/create-image) |
| 11  | `tizen-launch-emulator`  | `launchEmulator()`    | `emulator-manager-cli.js` | 기존 에뮬레이터 VM 실행 (sdb 연결 대기)               |
| 12  | `tizen-download-emulator-package` | `downloadEmulatorPackage()` | `download-emulator-package-cli.js` | 에뮬레이터 패키지 다운로드/설치 |
| 13  | `tizen-install-app`      | `installApp()`        | `project-manager-cli.js`  | 디바이스에 .tpk/.wgt/.rpk/.rpm 설치                   |
| 14  | `tizen-gdb-debug`        | `setupGdbDebug()`     | `gdb-debug-cli.js`        | GDB 원격 디버깅 설정 (Native)                         |
| 15  | `tizen-dotnet-debug`     | `setupDotnetDebug()`  | `dotnet-debug-cli.js`     | netcoredbg 디버깅 설정 (.NET)                         |
| 16  | `tizen-webapp-debug`     | `setupWebappDebug()`  | `webapp-debug-cli.js`     | RWI/CDP 디버깅 설정 (WebApp)                          |
| 17  | `tizen-screenshot`       | `captureScreenshot()` | `screenshot-cli.js`       | 디바이스/에뮬레이터 스크린샷 (자동 fallback)          |
| 18  | `tizen-tv-sdk-install`   | `installTvSdk()`      | `tv-sdk-install-cli.js`   | TV SDK 확장 패키지 설치 (TV-SAMSUNG-Public)           |
| 18a | `tizen-tv-sdk-install-from-zip` | `installTvSdkFromZip()` | `tv-sdk-install-from-zip-cli.js` | TV SDK 확장 설치 (로컬 ZIP, 오프라인)          |
| 19  | `tizen-update-package`   | `updatePackage()`     | `update-package-cli.js`   | 설치된 SDK 패키지 업데이트                            |
| 20  | `tizen-sdb-helper`       | `runSdbCommand()`     | `sdb-helper-cli.js`       | 디바이스 작업을 위한 올바른 sdb 명령 선택 및 실행     |
| 21  | `tizen-file-transfer`    | `fileTransfer()`      | `file-transfer-cli.js`    | sdb push/pull 파일 전송 (호스트↔디바이스)             |
| 22  | `tizen-remote-device`    | `scanRemoteDevices()` 외 | `remote-device-cli.js` | 네트워크 검색/연결/해제 + 원격 디바이스 북마크 관리   |
| 23  | `tizen-sdk-install-custom-repo` | `installSdkFromRepo()` | `sdk-install-custom-repo-cli.js` | 사용자 지정 패키지 저장소 URL에서 SDK 설치   |
| 23a |                          | `validateRepoUrl()`   | `validate-repo-url-cli.js` | 저장소 URL 검증 (`pkg_list_{OS}-{64,32}` 제공 여부)  |
| 24  | `tizen-playwright-test`  | `runPlaywrightTest()` | `playwright-test-cli.js`  | Playwright 자동화 테스트 실행 (WebApp, CDP attach)    |
| 24a |                          | `scaffoldPlaywrightTest()` | `playwright-test-cli.js` | 테스트 파일 + package.json 스캐폴딩              |
| 25  | `tizen-platform-install` | `installPlatform()`  | `platform-install-cli.js` | Tizen 플랫폼 패키지(`TIZEN-{version}`) 설치       |
| 26  | `tizen-download-mobile-platform` | `downloadMobilePlatform()` | `download-mobile-platform-cli.js` | Tizen 모바일 플랫폼 패키지(`MOBILE-{version}`) + IOT-Headed 설치 |
| 27  | `tizen-install-rootstrap` | `installRootstrap()` | `install-rootstrap-cli.js` | 커스텀 루트스트랩 ZIP 패키지 설치 (보안 검증 포함) |
| 28  | `tizen-dlog-analyzer`   | `startDlogAnalyzer()` 외 | `dlog-analyzer-cli.js`  | dlog 크래시/예외 지속 수집·분석 (백그라운드)       |

---

## Standard JSON Envelope

모든 스킬은 Standard JSON Envelope 형식으로 응답합니다:

```json
{
  "command": "tizen-sdk <command>",
  "status": "success | failure",
  "duration_ms": 1234,
  "result": { ... },
  "warnings": ["선택적 경고"],
  "errors": [{
    "error_code": "TIZEN_SDK_XXX_E001",
    "error_category": "error_category",
    "message": "사용자 친화적 메시지",
    "suggested_fix": {
      "command": "제안 명령 또는 null",
      "auto_fixable": false
    }
  }]
}
```

자세한 내용은 다음 문서를 참조하세요:

- [Envelope 사용 가이드](envelope/ENVELOPE_USAGE_GUIDE.md)
- [Envelope 호출 흐름](envelope/ENVELOPE_CALL_FLOW.md)
- [구현 요약](envelope/ENVELOPE_IMPLEMENTATION_SUMMARY.md)

---

## 추가 정보

### 버전 히스토리

| 버전  | 날짜       | 변경 사항                                  |
| ----- | ---------- | ------------------------------------------ |
| 0.1.0 | 2026-07-15 | 11개 스킬로 초기 릴리스                    |
| 0.1.0 | 2026-07-15 | tizen-tv-sdk-install 스킬 추가             |
| 0.1.0 | 2026-07-22 | tizen-sdk-init 스킬 추가                   |
| 0.1.0 | 2026-07-23 | tizen-update-package 스킬 추가             |
| 0.1.0 | 2026-07-23 | tizen-sdb-helper 스킬 추가                 |
| 0.1.0 | 2026-07-24 | tizen-file-transfer 스킬 추가              |
| 0.1.0 | 2026-07-28 | tizen-remote-device 스킬 추가              |
| 1.0.0 | 2026-07-30 | tizen-screenshot 스킬 분리 (sdb-helper에서) |
| 1.0.0 | 2026-07-31 | tizen-certificate-manager 스킬 추가        |
| 1.0.0 | 2026-07-31 | tizen-create-emulator, tizen-launch-emulator 스킬 추가 |
| 1.0.0 | 2026-08-03 | tizen-download-emulator-package 스킬 추가  |
| 1.0.0 | 2026-08-04 | tizen-sdk-install-custom-repo 스킬 추가 — 사용자 지정 저장소 URL 설치 |
| 1.0.0 | 2026-08-10 | tizen-webapp-debug 스킬 추가               |
| 1.0.0 | 2026-08-11 | tizen-playwright-test 스킬 추가 — Playwright 웹앱 자동화 테스트 |
| 1.0.0 | 2026-08-13 | tizen-platform-install, tizen-download-mobile-platform 스킬 추가 |
| 1.0.0 | 2026-08-21 | tizen-install-rootstrap 스킬 추가          |
| 1.0.0 | 2026-08-26 | tizen-dlog-analyzer 스킬 추가 — AI 기반 dlog 크래시/예외 분석 (총 28개 스킬) |
| 1.1.0 | 2026-09-08 | tizen-tv-sdk-install-from-zip 스킬 추가 — 로컬 ZIP에서 TV SDK 오프라인 설치 (총 29개 스킬) |

### 관련 리소스

| 리소스             | 링크                                                       |
| ------------------ | ---------------------------------------------------------- |
| Tizen 공식 문서    | https://docs.tizen.org/                                    |
| Tizen SDK 다운로드 | https://developer.tizen.org/development/tizen-sdk/download |
| Node.js 다운로드   | https://nodejs.org/                                        |
| GDB 문서           | https://sourceware.org/gdb/documentation/                  |

### 관련 문서

| 문서                                                                                             | 내용                             |
| ------------------------------------------------------------------------------------------------ | -------------------------------- |
| [README.md](README.md)                                                                           | 전체 개요 및 사용자 매뉴얼       |
| [project/scenario-native-app-walkthrough.md](project/scenario-native-app-walkthrough.md)                         | 처음 사용자를 위한 단계별 가이드 |
| [debug/scenario-webapp-debug-walkthrough.md](debug/scenario-webapp-debug-walkthrough.md)         | 웹앱 디버깅(RWI/CDP) E2E 시나리오 |
| [debug/scenario-native-debug-walkthrough.md](debug/scenario-native-debug-walkthrough.md)         | 네이티브 앱 디버깅(GDB) E2E 시나리오 |
| [debug/scenario-dotnet-debug-walkthrough.md](debug/scenario-dotnet-debug-walkthrough.md)         | .NET 앱 디버깅(netcoredbg) E2E 시나리오 |
| [sdk-install/INSTALLATION_FLOW.md](sdk-install/INSTALLATION_FLOW.md)                             | SDK 설치 흐름                    |
| [sdk-install/AGENT_TO_INSTALLSDK_INTEGRATION.md](sdk-install/AGENT_TO_INSTALLSDK_INTEGRATION.md) | Agent-installSdk 통합            |
| [envelope/](envelope/)                                                                           | Standard JSON Envelope 문서      |

---

# Tizen SDK 커맨드 계층 — 아키텍처 및 호출 흐름

> **범위**: `common/lib/` — CLI 러너(`*-cli.js`) → `sdk-commands.js`(진입점) → 도메인 모듈 → `plugin-cache.js` → PowerShell/Bash 스크립트
> **진입점 파일**: `lib/core/sdk-commands.js` — 도메인 모듈의 공개 함수를 재수출(re-export)하는 **단일 진입점(aggregator)**. 실제 로직은 `lib/core/`의 도메인 모듈에 있습니다.

---

## 개요

`sdk-commands.js`는 대부분의 Tizen SDK 에이전트 스킬이 SDK 작업을 수행할 때 거치는 중앙 진입점입니다. 사용자나 에이전트가 직접 호출하지 않으며, 항상 CLI 러너(`*-cli.js`)를 통해 간접적으로 호출됩니다.

현재 이 파일 자체는 **도메인 모듈 재수출 aggregator**입니다. 비즈니스 로직은 도메인별 모듈로 분리되어 있고, 기존 호출부(CLI 러너, 테스트, 문서)는 계속 `require('../core/sdk-commands')`로 동일한 함수를 얻습니다:

| 도메인 모듈 | 담당 |
|---|---|
| `core/sdk.js` | SDK init/status/설치, TV SDK, 플랫폼/모바일 플랫폼/루트스트랩 설치, 저장소 URL 검증, 패키지 업데이트 |
| `core/project.js` | 프로젝트 생성/삭제/빌드/템플릿 목록/앱 설치 |
| `core/device.js` | 디바이스 탐지(start) / 에뮬레이터 VM 종료(stop) |
| `core/emulator.js` | em-cli 에뮬레이터 VM 생성/부팅/관리 |
| `core/dotnet.js` | .NET 개발 환경 설정 |
| `core/debug.js` | Native(GDB) / DotNET(netcoredbg) 원격 디버깅 셋업 |
| `core/webapp-debug.js` | 웹앱(wgt) RWI/CDP 디버깅 셋업 |
| `core/playwright-test.js` | 웹앱 Playwright 테스트 실행/스캐폴딩 (CDP) |
| `core/preflight.js` | Node.js / 디스크 공간 사전 확인 |
| `core/screenshot.js`, `core/file-transfer.js`, `core/sdb-helper.js`, `core/remote-device.js` | 스크린샷, sdb push/pull, sdb intent 매칭, 원격 디바이스 |
| `core/certificate.js`, `core/samsung-cert.js` | 로컬 인증서/서명 프로파일, Samsung 온라인 CA 인증서 |
| `core/dlog-analyzer.js` | 백그라운드 dlog 모니터링 (분리 프로세스 spawn / PID·출력 파일 관리) |

---

## 호출 흐름 (전체 아키텍처)

```
사용자 자연어 요청 ("빌드해줘")
    ↓
Cline 스킬 라우팅 (tizen-build-project 스킬 로드)
    ↓
에이전트가 CLI 러너 실행: node project-manager-cli.js build --project <path> --build-type Debug
    ↓
CLI 러너 (cli-runner.js + project-manager-cli.js)
    ↓
sdk-commands.js (재수출) → core/project.js의 buildProject()   ← 여기서 호출됨
    ↓
plugin-cache.js → execPluginScript() → PowerShell 스크립트 실행
    ↓
scripts/tizen-build-project/tizen-build-project.ps1 (실제 tz build/pack 실행)
    ↓
Standard JSON Envelope 반환 → 에이전트가 사용자에게 결과 전달
```

---

## CLI 러너 → sdk-commands.js 함수 매핑

각 CLI 러너는 `sdk-commands.js`에서 특정 함수를 `require`합니다:

| CLI 러너                | sdk-commands.js 함수 | 트리거 스킬            |
| ----------------------- | -------------------- | ---------------------- |
| `sdk-init-cli.js`       | `initSdk()`          | `tizen-sdk-init`       |
| `sdk-install-cli.js`    | `installSdk()`       | `tizen-sdk-install`    |
| `sdk-repo-info-cli.js`  | `getRepoInfo()`      | `tizen-sdk-install` (repo-info) |
| `sdk-install-custom-repo-cli.js` | `installSdkFromRepo()` | `tizen-sdk-install-custom-repo` |
| `validate-repo-url-cli.js` | `validateRepoUrl()` | `tizen-sdk-install-custom-repo` |
| `tv-sdk-install-cli.js` | `installTvSdk()`     | `tizen-tv-sdk-install` |
| `tv-sdk-install-from-zip-cli.js` | `installTvSdkFromZip()` | `tizen-tv-sdk-install-from-zip` |
| `download-emulator-package-cli.js` | `downloadEmulatorPackage()` | `tizen-download-emulator-package` |
| `check-node-cli.js`     | `checkNode()`        | `tizen-check-node`     |
| `check-disk-space-cli.js` | `checkDiskSpace()` | `tizen-check-disk-space` |
| `project-manager-cli.js` | `createProject()`    | `tizen-create-project` |
| `project-manager-cli.js` | `deleteProject()`    | `tizen-create-project` (delete 액션) |
| `project-manager-cli.js` | `listTemplates()`    | `tizen-create-project` |
| `project-manager-cli.js`  | `buildProject()`     | `tizen-build-project`  |
| `device-manager-cli.js` | `manageDevice()`     | `tizen-device-manager` |
| `emulator-manager-cli.js` | `manageEmulator()` / `createEmulator()` / `launchEmulator()` | `tizen-create-emulator`, `tizen-launch-emulator` |
| `project-manager-cli.js`    | `installApp()`       | `tizen-install-app`    |
| `dotnet-setup-cli.js`   | `setupDotnet()`      | `tizen-dotnet-setup`   |
| `gdb-debug-cli.js`      | `setupGdbDebug()`    | `tizen-gdb-debug`      |
| `dotnet-debug-cli.js`   | `setupDotnetDebug()` | `tizen-dotnet-debug`   |
| `webapp-debug-cli.js`   | `setupWebappDebug()` | `tizen-webapp-debug`   |
| `playwright-test-cli.js` | `runPlaywrightTest()` / `scaffoldPlaywrightTest()` | `tizen-playwright-test` |
| `sdb-helper-cli.js`     | `runSdbCommand()`    | `tizen-sdb-helper`     |
| `screenshot-cli.js`     | `captureScreenshot()` | `tizen-screenshot`    |
| `file-transfer-cli.js`  | `fileTransfer()`     | `tizen-file-transfer`  |
| `remote-device-cli.js`  | `scanRemoteDevices()` 외 7종 (connect/disconnect/list/add/remove/edit/list-saved) | `tizen-remote-device` |
| `cert-manager-cli.js`   | `generateAuthorCertificate()` 외 (프로파일/배포자/Samsung 온라인 CA) | `tizen-certificate-manager` |
| `update-package-cli.js` | `updatePackage()`    | `tizen-update-package` |
| `platform-install-cli.js` | `installPlatform()` | `tizen-platform-install` |
| `download-mobile-platform-cli.js` | `downloadMobilePlatform()` | `tizen-download-mobile-platform` |
| `install-rootstrap-cli.js` | `installRootstrap()` | `tizen-install-rootstrap` |
| `dlog-analyzer-cli.js`  | `startDlogAnalyzer()` / `stopDlogAnalyzer()` / `checkDlogAnalyzer()` / `statusDlogAnalyzer()` / `launchApp()` / `terminateApp()` / `collectAppLogs()` / `analyzeErrors()` | `tizen-dlog-analyzer` |

### 예시: project-manager-cli.js

```js
const { buildProject } = require("../core/sdk-commands");
const { runCli } = require("./cli-runner");

runCli("tizen-sdk-skills project build", () =>
  buildProject(projectPath, buildType || "Debug", signProfile, arch, clean),
);
```

---

## 핵심 책임

> 아래 책임의 실제 구현 주체는 `sdk-commands.js` 자체가 아니라, 이 파일이 재수출하는 **`lib/core/` 도메인 모듈**입니다(개요의 표 참조). 이 절에서 "각 함수"는 `core/project.js`의 `buildProject()`처럼 도메인 모듈에 정의된 함수를 가리키며, 소제목마다 담당 모듈을 표기했습니다.

### 1. 파라미터 검증

**담당:** 각 도메인 모듈 (`core/project.js`, `core/device.js`, `core/debug.js` 등 — 함수가 속한 모듈)

각 함수는 스크립트를 실행하기 전에 입력값을 검증합니다:

- 경로 존재 및 읽기 권한 확인
- 프로젝트 타입 검증 (`native`, `dotnet`, `webapp`, `tv`, `platform`)
- 빌드 타입 검증 (`Debug`, `Release`, `Test`)
- 디바이스 시리얼, VM 이름, 앱 ID의 셸 안전 문자 필터링
- 포트 범위 검증 (1–65535)
- 타임아웃 범위 검증 (1–540초)

잘못된 파라미터는 즉시 `formatError()` envelope을 반환하며, 스크립트는 실행되지 않습니다.

### 2. 스크립트 경로 해석

**담당:** `core/plugin-cache.js`의 `resolveScript()` / `findLatestVersionDir()` — 각 도메인 모듈이 호출

`plugin-cache.js`의 `resolveScript()`를 사용하여 플러그인 캐시에서 적절한 `.ps1`(Windows) 또는 `.sh`(Linux/macOS) 스크립트를 찾습니다:

```js
const resolved = resolveScript("tizen-build-project");
// resolved.scriptPath → ~/.cline/plugins/cache/.../scripts/tizen-build-project/tizen-build-project.ps1
```

GDB 및 DotNET 디버그의 경우 스크립트 베이스 이름이 그룹 이름과 다르므로, `findLatestVersionDir()`을 직접 사용하여 경로를 조립합니다.

### 3. 스크립트 실행

**담당:** `core/plugin-cache.js`의 `execPluginScript()` — 각 도메인 모듈이 옵션과 함께 호출

`plugin-cache.js`의 `execPluginScript()`를 사용하여 스크립트를 동기 실행합니다:

- **Windows**: `powershell -ExecutionPolicy Bypass -File "<script>" <args>`
- **Linux/macOS**: `bash "<script>" <args>`

주요 옵션:

- `captureViaTempFile: true` — 스크립트가 장수 자식 프로세스(에뮬레이터 qemu, sdb 서버, gdbserver)를 남기는 경우 사용. 이 옵션 없이 파이프를 사용하면 자식이 파이프 쓰기 핸들을 상속받아 `execSync`가 영원히 블록됩니다.

### 4. 출력 파싱

**담당:** 각 도메인 모듈 (아래 표의 함수가 속한 모듈)

각 함수는 스크립트 stdout에서 성공 마커를 파싱합니다:

| 함수                 | 성공 마커                                                        |
| -------------------- | ---------------------------------------------------------------- |
| `manageDevice()`     | `DEVICE_SERIAL=<serial>`                                         |
| `installApp()`       | `Device Serial:`, `Found app ID:`, `App launched successfully`   |
| `setupGdbDebug()`    | `GDB init file:`, `PowerShell:`, `Command Prompt:`, `App PID:`   |
| `setupDotnetDebug()` | `App PID:`, `PowerShell:`, `Command Prompt:`                     |
| `createProject()`    | 프로젝트 폴더 존재 확인 (출력 파싱보다 신뢰 가능)                |
| `buildProject()`     | `.tpk`/`.wgt` 산출물 파일 스캔 (빌드 시작 시각 이후 수정된 파일) |

### 5. Envelope 생성

**담당:** `lib/envelope/response-formatter.js` + `lib/envelope/envelope.js` — 각 도메인 모듈이 결과를 넘겨 포장

결과는 `response-formatter.js`와 `envelope.js`를 사용하여 **Standard JSON Envelope**로 포장됩니다:

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "C:\\...\\MyApp.wgt",
        "format": ".wgt",
        "size_bytes": 39305
      }
    ]
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 3948
}
```

### 6. 에러 핸들링

**담당:** 각 도메인 모듈 + `core/output-summary.js` (`summarize*Output()` 라인 추출)

실패 시 각 함수는 다음을 수행합니다:

1. stdout + stderr를 결합하여 캡처
2. 전체 출력을 임시 로그 파일로 저장 (빌드의 경우)
3. `summarize*Output()` 함수로 핵심 경고/오류 라인 추출 (최대 10줄)
4. 다음을 포함한 `formatError()` envelope 반환:
   - 에러 코드 (`build_failed`, `device_not_found`, `io_error` 등)
   - 사용자 친화적 메시지
   - `suggested_fix` (실행 가능한 명령어, 예: SDK 설치 명령)
   - 기록된 시작 시각으로부터의 `duration_ms`

---

## 내보낸 함수

```js
module.exports = {
  // SDK (core/sdk.js)
  initSdk, // SDK 경로 설정
  getSdkStatus, // SDK 상태 조회
  installSdk, // SDK 설치 사전 확인 (Phase 1)
  installSdkFromRepo, // 사용자 지정 저장소 URL에서 SDK 설치
  validateRepoUrl, // 저장소 URL 검증 (pkg_list 확인)
  normalizeRepoUrl, // 저장소 URL 정규화
  readInstalledRepository, // repository.info에 기록된 저장소 URL 읽기
  installTvSdk, // TV SDK 확장 설치 (TV-SAMSUNG-Public)
  installTvSdkFromZip, // TV SDK 확장 설치 (로컬 ZIP, 오프라인)
  updatePackage, // 설치된 SDK 패키지 업데이트
  downloadEmulatorPackage, // 에뮬레이터 패키지 다운로드
  installPlatform, // Tizen 플랫폼 패키지(TIZEN-{version}) 설치
  downloadMobilePlatform, // 모바일 플랫폼(MOBILE-{version}) + IOT-Headed 설치
  installRootstrap, // 커스텀 루트스트랩 ZIP 설치
  getRepoInfo, // 저장소 정보 조회
  readSdkPath, // SDK 경로 읽기 (config 또는 기본값)
  checkSdkInstallStatus, // 로컬 sdk.info 확인
  checkSdkInstallationViaScript, // 스크립트 체크 모드
  checkIfSdkAlreadyInstalled, // 3단계 설치 상태 확인
  CONFIG_FILE, // ~/.tizen.sdk.path.config 경로
  DEFAULT_SDK_PATH, // ~/tizen-sdk (기본 SDK 경로)

  // 프로젝트 (core/project.js)
  createProject, // 프로젝트 생성 (native/dotnet/webapp/tv/platform, force 대체 지원)
  deleteProject, // SDK 호스트의 프로젝트 디렉터리 삭제 (Tizen 프로젝트 마커 검증)
  buildProject, // 프로젝트 빌드 (tz build + tz pack, clean 전체 재빌드 지원)
  listTemplates, // 사용 가능한 템플릿 목록 조회
  installApp, // 앱 패키지 설치 (.tpk/.wgt/.rpk/.rpm)

  // 디바이스 / 에뮬레이터 (core/device.js, core/emulator.js)
  manageDevice, // 디바이스 탐지 (start) / 에뮬레이터 VM 종료 (stop)
  manageEmulator, createEmulator, launchEmulator, // em-cli 전체 표면

  // 디버그 / 테스트 (core/debug.js, core/webapp-debug.js, core/playwright-test.js)
  setupGdbDebug, // GDB 원격 디버그 설정 (setup-only)
  setupDotnetDebug, // DotNET 원격 디버그 설정 (setup-only)
  setupWebappDebug, // WebApp RWI/CDP 디버그 설정
  runPlaywrightTest, scaffoldPlaywrightTest, // Playwright over CDP

  // 사전 확인 / 유틸리티 (core/preflight.js 외)
  setupDotnet, // .NET 워크로드 설정
  checkNode, checkDiskSpace, // 사전 확인
  runSdbCommand, // sdb 명령 선택/실행
  captureScreenshot, // 디바이스/에뮬레이터 스크린샷
  fileTransfer, // sdb push/pull 파일 전송

  // 원격 디바이스 (core/remote-device.js — 네트워크 스캔/연결/북마크)
  scanRemoteDevices, connectRemoteDevice, disconnectRemoteDevice,
  listRemoteDevices, addRemoteDeviceToList, removeRemoteDeviceFromList,
  editRemoteDeviceInList, listSavedRemoteDevices,

  // 인증서 (core/certificate.js — 로컬 자체 서명)
  generateAuthorCertificate, listDistributorCertificates,
  createSigningProfile, listSigningProfiles, setActiveSigningProfile,
  removeSigningProfile, setSigningProfileDistributor2, importCertificate,
  inspectCertificate, getCertificateSdkDataPath,

  // 인증서 (core/samsung-cert.js — Samsung 온라인 CA)
  generateSamsungAuthorCertificate, generateSamsungDistributorCertificate,
  importSamsungCertificate, createSamsungProfile,
  cancelSamsungCertificateGeneration, getSamsungAccessToken,
  parseDuidList, importDuidsFromFile,
  acquireDuidFromDevice, acquireDuidsFromAllDevices,

  // dlog 분석기 (core/dlog-analyzer.js — 백그라운드 dlog 모니터링)
  startDlogAnalyzer, stopDlogAnalyzer, checkDlogAnalyzer, statusDlogAnalyzer,
};
```

---

## 주요 설계 결정

### 디버거의 Setup-Only 모드

`setupGdbDebug()`와 `setupDotnetDebug()`는 항상 **setup-only** 모드(`-SetupOnly` / `-N`)로 실행됩니다. 대화형 디버거(`(gdb)`, `ncdb>`)는 터미널을 블록하므로 에이전트가 직접 띄울 수 없습니다. 대신 셋업 스크립트는:

1. 디바이스에서 gdbserver / netcoredbg 시작
2. 포트 포워딩 설정
3. gdb init 파일 또는 launch.json 구성 생성
4. 사용자 터미널에 붙여넣을 수 있는 명령 출력
5. 종료 — 디버그 서버는 사용자 세션 동안 유지됨

### `captureViaTempFile` (장수 프로세스 처리)

백그라운드 프로세스를 남기거나 남길 수 있는 스크립트를 호출하는 함수(`manageDevice`, `installApp`, `setupGdbDebug`, `setupDotnetDebug`, `setupDotnet`, `setupWebappDebug`, `fileTransfer`, 그리고 `core/emulator.js`의 em-cli 실행)는 `captureViaTempFile: true`를 사용합니다. 이는 stdout을 파이프 대신 임시 파일로 리다이렉트하여, 자식 프로세스가 파이프 핸들을 상속받아 `execSync`가 영원히 블록되는 것을 방지합니다.

### 빌드 산출물 탐지

`buildProject()`는 빌드 스크립트 출력을 파싱하여 성공 여부를 판단하지 않습니다. 대신 프로젝트 디렉토리에서 빌드 시작 시각 이후에 수정된 `.tpk`/`.wgt` 파일을 스캔합니다(`findBuildArtifacts()`). 이는 수천 줄의 툴체인 출력을 파싱하는 것보다 신뢰할 수 있습니다.

### SDK 설치: 2단계 설계

`installSdk()`는 **사전 확인 전용**(Phase 1)입니다. SDK를 직접 설치하지 않습니다 (10–15분 소요 작업). 대신:

1. SDK가 이미 설치되어 있는지 확인 (`sdk.info` 마커)
2. 미설치 시 `suggested_fix`에 정확한 설치 명령을 포함한 에러 envelope 반환
3. 에이전트가 이 명령을 `run_in_background: true`로 실행 (Phase 2)
4. 완료 후 에이전트가 사전 확인을 재실행하여 `sdk.info` 존재 확인

---

## 관련 파일

| 파일                                 | 역할                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `lib/cli/cli-runner.js`              | 공용 러너 프레임워크: 비동기 실행 → envelope 출력 → 종료 코드                  |
| `lib/cli/*-cli.js`                   | 스킬별 CLI 러너: argv 파싱 후 sdk-commands.js 호출                             |
| `lib/core/*.js` (도메인 모듈)        | 실제 비즈니스 로직 (sdk/project/device/emulator/debug/… — 개요의 표 참조)      |
| `lib/core/plugin-cache.js`           | 플러그인 캐시 경로 해석 및 스크립트 실행 (`execPluginScript`)                  |
| `lib/envelope/envelope.js`           | Standard JSON Envelope 클래스                                                  |
| `lib/envelope/response-formatter.js` | Envelope 포맷팅 헬퍼 (`formatSdkInit`, `formatProjectBuild`, `formatError` 등) |
| `scripts/tizen-*/`                   | `tz`, `sdb`, `dotnet` 등을 실제로 호출하는 PowerShell/Bash 스크립트            |

---

## 관련 문서

- [중간 계층 소개](SDK_LAYERS_OVERVIEW.md) — 각 계층이 왜 필요한지, 왜 .ps1을 직접 호출하지 않는지 설명

---

# Tizen SDK Skills — 사용 사례 & 시나리오 가이드

> `tizen-sdk-skills` 플러그인을 활용한 **엔드투엔드 시나리오 가이드**와 **실제 사용 사례**를 한곳에서 찾아볼 수 있는 통합 문서입니다.
> 각 문서는 자연어 프롬프트만으로 전체 워크플로우를 실행할 수 있도록 단계별로 안내합니다.

---

## 📂 카테고리별 문서 목록

> 아래 표의 **담당 스킬**에는 각 문서의 핵심 스킬만 표기합니다. 문서에서 사용하는 전체 스킬 목록은 아래 **문서별 상세 요약**을 참조하세요.

### 1. SDK 설치 및 환경 구성

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 1 | [커스텀 저장소로 SDK 설치](sdk-install/custom-repo-walkthrough.md) | 사내 미러, 빌드 서버 산출물, 팀 미러 등 커스텀 저장소 URL에서 Tizen SDK를 설치하는 전체 과정 | `tizen-sdk-install-custom-repo` |
| 2 | [커스텀 루트스트랩 설치](rootstrap/install-rootstrap-walkthrough.md) | ZIP 파일에서 커스텀 루트스트랩 패키지를 SDK에 설치 (비표준 디바이스/아키텍처 지원 추가) | `tizen-install-rootstrap` |
| 3 | [.NET 개발 환경 설정 E2E](sdk-install/DOTNET_SETUP_E2E.md) | Windows/Linux/macOS에서 .NET SDK와 Tizen 워크로드 설치 → 밴드 불일치·권한 문제를 `[DIAG]`로 진단 | `tizen-dotnet-setup` |

### 2. 에뮬레이터 관리

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 4 | [에뮬레이터 관리자 E2E](emulator/emulator-manager-walkthrough.ko.md) | 에뮬레이터 패키지 다운로드 → 템플릿 조회 → VM 생성 → 부팅 → 앱 테스트 전체 워크플로우 | `tizen-create-emulator`, `tizen-launch-emulator` |
| 5 | [WSL에서 에뮬레이터 실행](wsl/WSL_EMULATOR_GUIDE.md) | WSL2 환경에서 Tizen 에뮬레이터 실행을 위한 설정, 문제 해결, 권장 프로필 가이드 | `tizen-launch-emulator` |

### 3. 프로젝트 생성 및 빌드

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 6 | [네이티브 앱 처음부터 끝까지](project/scenario-native-app-walkthrough.md) | SDK 설치 → 에뮬레이터 → 네이티브 템플릿 앱 생성 → 빌드 → 설치 → 디버깅 전체 흐름 | `tizen-create-project`, `tizen-build-project` |
| 7 | [DALi 템플릿 빌드 E2E](figma2dali/dali-template-build-e2e.md) | DALi Platform 앱의 사전 준비 → 프로젝트 생성 → GBS 빌드 → RPM 설치/실행 → 스크린샷 캡처 | `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

### 4. 인증서 관리

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 8 | [인증서 관리 엔드투엔드](certificate/certificate-manager-walkthrough.md) | 로컬 Tizen 인증서 → Samsung 온라인 CA 인증서 → 서명 프로필 → 빌드에 사용까지 전체 워크플로우 | `tizen-certificate-manager` |

### 5. 디버깅

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 9 | [웹앱 디버깅 (RWI/CDP)](debug/scenario-webapp-debug-walkthrough.md) | 웹앱(.wgt) 원격 디버깅: RWI 포트 포워딩 → CDP 엔드포인트 → Chrome DevTools 연결 | `tizen-webapp-debug` |
| 10 | [네이티브 앱 디버깅 (GDB)](debug/scenario-native-debug-walkthrough.md) | 네이티브 앱(.tpk, C/C++) 원격 디버깅: gdbserver 셋업 → 포트 포워딩 → 호스트 GDB 연결 | `tizen-gdb-debug` |
| 11 | [.NET 앱 디버깅 (netcoredbg)](debug/scenario-dotnet-debug-walkthrough.md) | .NET 앱(C#/NUI) 원격 디버깅: netcoredbg DAP 서버 → 포트 포워딩 → VS Code F5 연결 | `tizen-dotnet-debug` |
| 12 | [DLog 분석기 E2E](debug/scenario-dlog-analyzer-walkthrough.md) | 백그라운드 dlog 모니터링 → 크래시/예외 분석 → 근본 원인 식별 → 수정 → 재빌드 → 검증 전체 흐름 | `tizen-dlog-analyzer` |

### 6. 테스트 자동화

| # | 문서 | 설명 | 담당 스킬 |
|---|------|------|-----------|
| 13 | [웹앱 Playwright 테스트](test/scenario-playwright-test-walkthrough.md) | 웹앱(.wgt) Playwright 자동화 테스트: 테스트 스캐폴딩 → CDP 셋업 → 테스트 실행 | `tizen-playwright-test` |

### 7. 실제 사용 사례

| # | 문서 | 설명 | 관련 스킬 |
|---|------|------|-----------|
| 14 | [테트리스 앱 개발 대화 기록](../usage/TetrisApp/CONVERSATION_HISTORY.md) | SDK 설치부터 WebApp 테트리스 게임 구현, 빌드, 에뮬레이터 설치, 실행까지의 실제 개발 대화 기록 | `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app` |

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
│   ├── TV SDK 확장 설치 (ZIP) ─── tizen-tv-sdk-install-from-zip
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
| 커스텀 저장소에서 SDK를 설치하고 싶다 | [커스텀 저장소 설치](sdk-install/custom-repo-walkthrough.md) |
| 커스텀 루트스트랩을 추가하고 싶다 | [루트스트랩 설치](rootstrap/install-rootstrap-walkthrough.md) |
| .NET 개발 환경을 설정하고 싶다 | [.NET 설정 E2E](sdk-install/DOTNET_SETUP_E2E.md) |
| 에뮬레이터를 만들고 부팅하고 싶다 | [에뮬레이터 관리자 E2E](emulator/emulator-manager-walkthrough.ko.md) |
| WSL에서 에뮬레이터를 돌리고 싶다 | [WSL 에뮬레이터 가이드](wsl/WSL_EMULATOR_GUIDE.md) |
| 네이티브 앱을 만들어보고 싶다 | [네이티브 앱 E2E](project/scenario-native-app-walkthrough.md) |
| DALi Platform 앱을 빌드하고 싶다 | [DALi 템플릿 빌드 E2E](figma2dali/dali-template-build-e2e.md) |
| 인증서를 만들고 서명하고 싶다 | [인증서 관리 E2E](certificate/certificate-manager-walkthrough.md) |
| 웹앱을 디버깅하고 싶다 | [웹앱 디버깅 (RWI/CDP)](debug/scenario-webapp-debug-walkthrough.md) |
| 네이티브 앱을 디버깅하고 싶다 | [네이티브 앱 디버깅 (GDB)](debug/scenario-native-debug-walkthrough.md) |
| .NET 앱을 디버깅하고 싶다 | [.NET 앱 디버깅 (netcoredbg)](debug/scenario-dotnet-debug-walkthrough.md) |
| dlog로 크래시를 분석하고 싶다 | [DLog 분석기 E2E](debug/scenario-dlog-analyzer-walkthrough.md) |
| 웹앱 자동화 테스트를 하고 싶다 | [Playwright 테스트 E2E](test/scenario-playwright-test-walkthrough.md) |
| 실제 개발 사례를 보고 싶다 | [테트리스 앱 개발 기록](../usage/TetrisApp/CONVERSATION_HISTORY.md) |

---

## 📖 문서별 상세 요약

### 1. 커스텀 저장소로 SDK 설치

**문서:** [custom-repo-walkthrough.md](sdk-install/custom-repo-walkthrough.md) · **담당 스킬:** `tizen-sdk-install-custom-repo`

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

**문서:** [install-rootstrap-walkthrough.md](rootstrap/install-rootstrap-walkthrough.md) · **담당 스킬:** `tizen-install-rootstrap`

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

**문서:** [DOTNET_SETUP_E2E.md](sdk-install/DOTNET_SETUP_E2E.md) · **담당 스킬:** `tizen-dotnet-setup`

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

**문서:** [emulator-manager-walkthrough.ko.md](emulator/emulator-manager-walkthrough.ko.md) · **담당 스킬:** `tizen-download-emulator-package`, `tizen-create-emulator`, `tizen-launch-emulator`

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

**문서:** [WSL_EMULATOR_GUIDE.md](wsl/WSL_EMULATOR_GUIDE.md) · **담당 스킬:** `tizen-launch-emulator`

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

**문서:** [scenario-native-app-walkthrough.md](project/scenario-native-app-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

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

**문서:** [dali-template-build-e2e.md](figma2dali/dali-template-build-e2e.md) · **담당 스킬:** `tizen-create-project`, `tizen-build-project`, `tizen-device-manager`, `tizen-install-app`, `tizen-screenshot`

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

**문서:** [certificate-manager-walkthrough.md](certificate/certificate-manager-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-certificate-manager`, `tizen-build-project`

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

**문서:** [scenario-webapp-debug-walkthrough.md](debug/scenario-webapp-debug-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-webapp-debug`

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

**문서:** [scenario-native-debug-walkthrough.md](debug/scenario-native-debug-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-gdb-debug`

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

**문서:** [scenario-dotnet-debug-walkthrough.md](debug/scenario-dotnet-debug-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-dotnet-setup`, `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-dotnet-debug`

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

**문서:** [scenario-dlog-analyzer-walkthrough.md](debug/scenario-dlog-analyzer-walkthrough.md) · **담당 스킬:** `tizen-launch-emulator`, `tizen-dlog-analyzer`, `tizen-build-project`, `tizen-install-app`

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

**문서:** [scenario-playwright-test-walkthrough.md](test/scenario-playwright-test-walkthrough.md) · **담당 스킬:** `tizen-sdk-install`, `tizen-device-manager`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-playwright-test`

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

**문서:** [CONVERSATION_HISTORY.md](../usage/TetrisApp/CONVERSATION_HISTORY.md) · **관련 스킬:** `tizen-sdk-install`, `tizen-create-project`, `tizen-build-project`, `tizen-install-app`, `tizen-device-manager`

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

- [전체 에이전트 개요 (README)](README.md)
- [스킬 레퍼런스](#tizen-sdk-skills--스킬-레퍼런스)

---

*최종 업데이트: 2026-09-02*
