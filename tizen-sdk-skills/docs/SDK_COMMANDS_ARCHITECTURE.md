# Tizen SDK 커맨드 계층 — 아키텍처 및 호출 흐름

[English](SDK_COMMANDS_ARCHITECTURE.en.md) | 한국어

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
| `core/dlog-analyzer.js` | 백그라운드 dlog 모니터링 (분리 프로세스 spawn / PID·출력 파일 관리), 앱별 로그 수집 및 에러 분석 |

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

  // dlog 분석기 (core/dlog-analyzer.js — 백그라운드 dlog 모니터링, 앱별 로그 수집/에러 분석)
  startDlogAnalyzer, stopDlogAnalyzer, checkDlogAnalyzer, statusDlogAnalyzer,
  launchApp, terminateApp, collectAppLogs, analyzeErrors,
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
- [스킬 ↔ 커맨드 맵핑](SKILLS_COMMANDS_MAPPING.md) — 29개 스킬이 34개 커맨드에 어떻게 대응하는지 (개수가 다른 이유 포함)
