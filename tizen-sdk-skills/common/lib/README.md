# Tizen SDK Standard JSON Envelope Library

Tizen SDK 명령어의 모든 응답을 **Standard JSON Envelope 형식**으로 표준화하는 라이브러리입니다.

## 파일 구조

```
lib/
├── cli/                          # CLI 진입점 — 에이전트가 `node <파일>`로 실행
│   ├── cli-runner.js             #   공통 실행기 (JSON 출력 + 종료 코드)
│   ├── project-manager-cli.js    #   통합 project 러너 (build|create|list-templates|install) — action+flag 방식
│   ├── sdk-install-cli.js        #   installSdk() 러너 (--repo-url 시 커스텀 저장소로 위임)
│   ├── sdk-install-custom-repo-cli.js  # installSdkFromRepo() 러너 (사용자 지정 저장소 URL)
│   ├── validate-repo-url-cli.js  #   validateRepoUrl() 러너 (pkg_list_{OS}-{64,32} 검증)
│   ├── device-manager-cli.js     #   manageDevice() 러너 (sdb 탐지 + 에뮬레이터 폴백)
│   ├── dotnet-setup-cli.js       #   setupDotnet() 러너 (.NET SDK 확인 + Tizen 워크로드)
│   ├── gdb-debug-cli.js          #   setupGdbDebug() 러너 (gdbserver + 포워딩, setup-only)
│   └── update-package-cli.js     #   updatePackage() 러너 (SDK 패키지 업데이트)
├── core/                         # 핵심 로직
│   ├── sdk-commands.js           #   installSdk, installSdkFromRepo, createProject, listTemplates 등
│   └── plugin-cache.js           #   플러그인 캐시 경로 해석 + 스크립트 실행
├── envelope/                     # Standard JSON Envelope 계층
│   ├── envelope.js               #   Envelope 클래스 및 에러 코드 정의
│   ├── envelope-wrapper.js       #   wrapEnvelope, CommonErrors 등
│   └── response-formatter.js     #   명령어별 응답 포맷팅 함수
├── tests/                        # 테스트 및 사용 예시
│   ├── envelope.test.js
│   ├── sdk-commands.test.js
│   ├── sdk-check.test.js
│   └── sdk-repo-url.test.js
└── README.md                     # 이 파일
```

**의존 방향:** `cli/ → core/ → envelope/` (역방향 의존 없음)

## 핵심 모듈

### 1. envelope.js

**Envelope 클래스**: 응답 생성 및 포맷팅

```javascript
const { Envelope, ERROR_CODES } = require("./envelope");

const envelope = new Envelope("tizen-sdk sdk-init");

// 성공 응답
const success = envelope.success({
  sdk_path: "/opt/tizen-studio",
  config_file: "/home/user/.tizen.sdk.path.config",
});

// 실패 응답
const failure = envelope.failure({
  error_code: "TIZEN_SDK_CONFIG_E001",
  error_category: "sdk_path_not_set",
  message: "SDK path not configured",
  suggested_fix: { command: "...", auto_fixable: false },
});
```

**ERROR_CODES**: 공통 에러 정의

```javascript
ERROR_CODES.SDK_PATH_NOT_SET; // { error_code, error_category, suggested_fix }
ERROR_CODES.DEVICE_NOT_FOUND;
ERROR_CODES.TEMPLATE_NOT_FOUND;
ERROR_CODES.BUILD_FAILED;
ERROR_CODES.EMULATOR_NOT_FOUND;
// ... 등등
```

### 2. envelope-wrapper.js

**wrapEnvelope**: 응답을 자동으로 Envelope로 래핑

```javascript
const { wrapEnvelope, CommonErrors } = require("./envelope-wrapper");

// 성공
wrapEnvelope("tizen-sdk sdk-init", { sdk_path: "..." });

// 실패 - 커스텀 에러
wrapEnvelope("tizen-sdk build-project", null, "build_failed", "Linking error");

// 실패 - 공통 에러
CommonErrors.sdkPathNotSet("tizen-sdk build-project");
CommonErrors.deviceNotFound("tizen-sdk install-app");
CommonErrors.templateNotFound("tizen-sdk create-project", "BasicWeb");
CommonErrors.buildFailed("tizen-sdk build-project", "Compilation error");
CommonErrors.emulatorNotFound("tizen-sdk launch-emulator", "myEmulator");
CommonErrors.emulatorAlreadyRunning("tizen-sdk launch-emulator", "myEmulator");
```

### 3. response-formatter.js

**명령어별 응답 생성 함수**

```javascript
const {
  formatSdkInit,           // sdk init
  formatSdkStatus,         // sdk status
  formatSdkInstall,        // sdk install/uninstall
  formatProjectCreate,     // project create
  formatProjectBuild,      // project build
  formatProjectInstall,    // project install
  formatProjectRun,        // project run
  formatProjectList,       // project list
  formatDeviceList,        // device list
  formatDeviceSelect,      // device select
  formatEmulatorList,      // emulator list
  formatEmulatorCreate,    // emulator create
  formatEmulatorAction,    // emulator start/stop/delete
  formatError,             // 일반 에러
} = require('./response-formatter');

// 사용 예
formatSdkInit('/opt/tizen-studio', '/home/user/.tizen.sdk.path.config');
formatProjectCreate('/path/to/project', 'web', 'tizen', '10.0', 'MyApp');
formatDeviceList([{ device_id: '...', ... }]);
formatProjectBuild([{ path: '...', format: '.tpk', size: 1024 }], 5000);
```

## 사용 패턴

### 패턴 1: 간단한 응답 (wrapEnvelope)

```javascript
const { wrapEnvelope } = require("./envelope-wrapper");

// 성공
const result = wrapEnvelope("tizen-sdk sdk-init", {
  sdk_path: "/opt/tizen-studio",
});
console.log(JSON.stringify(result));

// 실패
const error = wrapEnvelope(
  "tizen-sdk build-project",
  null,
  "build_failed",
  "Compilation error",
);
console.log(JSON.stringify(error));
```

### 패턴 2: 공통 에러 (CommonErrors)

```javascript
const { CommonErrors } = require("./envelope-wrapper");

if (!sdkPath) {
  console.log(
    JSON.stringify(CommonErrors.sdkPathNotSet("tizen-sdk build-project")),
  );
  process.exit(1);
}
```

### 패턴 3: 명령어별 포맷팅 (response-formatter)

```javascript
const { formatProjectCreate } = require('./response-formatter');

const projectPath = createProject(...);
console.log(JSON.stringify(
  formatProjectCreate(projectPath, 'native', 'tizen', '10.0', 'MyApp')
));
```

### 패턴 4: 저수준 Envelope (복잡한 케이스)

```javascript
const { Envelope, ERROR_CODES } = require("./envelope");

const envelope = new Envelope("tizen-sdk custom-command");
const response = envelope.success({
  custom_field: "value",
  nested: { data: "here" },
});
console.log(JSON.stringify(response));
```

## 응답 구조

### 성공 (status: 'success')

```json
{
  "command": "tizen-sdk sdk-init",
  "status": "success",
  "duration_ms": 150,
  "result": { ... },
  "warnings": [],
  "errors": []
}
```

### 실패 (status: 'failure')

```json
{
  "command": "tizen-sdk install-app",
  "status": "failure",
  "duration_ms": 50,
  "errors": [
    {
      "error_code": "TIZEN_SDK_DEVICE_E001",
      "error_category": "device_not_found",
      "message": "No connected device found",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk create-emulator ...",
        "auto_fixable": false,
        "guide_url": "https://docs.tizen.org/..."
      }
    }
  ]
}
```

## PRD 요구사항 매핑

| 요구사항                                | 파일                | 함수                     |
| --------------------------------------- | ------------------- | ------------------------ |
| REQ-SDK-OUT-001: Standard JSON Envelope | envelope.js         | Envelope.success/failure |
| REQ-SDK-OUT-002: 에러 정보 포함         | envelope.js         | ERROR_CODES              |
| REQ-SDK-OUT-003: 대용량 로그 경로 반환  | envelope.js         | Envelope.saveLargeLog    |
| REQ-SDK-OUT-004: ANSI escape 제거       | envelope-wrapper.js | (호출 시 미리 제거)      |

## 에러 코드 목록

| 카테고리                   | 에러 코드               |
| -------------------------- | ----------------------- |
| `sdk_path_not_set`         | TIZEN_SDK_CONFIG_E001   |
| `sdk_path_invalid`         | TIZEN_SDK_CONFIG_E002   |
| `sdk_path_not_accessible`  | TIZEN_SDK_CONFIG_E003   |
| `device_not_found`         | TIZEN_SDK_DEVICE_E001   |
| `template_not_found`       | TIZEN_SDK_TEMPLATE_E001 |
| `project_creation_failed`  | TIZEN_SDK_PROJECT_E001  |
| `build_failed`             | TIZEN_SDK_BUILD_E001    |
| `emulator_not_found`       | TIZEN_SDK_EMULATOR_E001 |
| `emulator_already_running` | TIZEN_SDK_EMULATOR_E002 |
| `io_error`                 | TIZEN_SDK_IO_E001       |
| `permission_denied`        | TIZEN_SDK_IO_E002       |
| `remote_path_not_found`    | TIZEN_SDK_IO_E003       |
| `repo_url_invalid` | TIZEN_SDK_REPO_E001 |
| `repo_url_unreachable` | TIZEN_SDK_REPO_E002 |

## 테스트

```bash
# 모든 테스트 실행
node envelope.test.js

# 특정 응답 형식 확인
node -e "
const { wrapEnvelope } = require('./envelope-wrapper');
console.log(JSON.stringify(
  wrapEnvelope('tizen-sdk sdk-init', { sdk_path: '/opt' }),
  null, 2
));
"
```

## 기존 에이전트 통합

기존 에이전트를 업그레이드하려면 응답 생성 부분을 래핑하면 됩니다:

**Before**:

```javascript
console.log("Project created at " + projectPath);
```

**After**:

```javascript
const { formatProjectCreate } = require("../lib/envelope/response-formatter");
console.log(
  JSON.stringify(
    formatProjectCreate(projectPath, appType, profile, version, name),
  ),
);
```

## 성능

- **응답 생성**: < 1ms
- **JSON 직렬화**: 응답 크기에 따라 < 10ms
- **파일 I/O** (대용량 로그 저장): < 100ms

## 디버그

stderr로 디버그 정보를 출력할 수 있습니다 (stdout Envelope 오염 없음):

```javascript
console.error('[tizen-sdk] [DEBUG] Creating project...');
const result = formatProjectCreate(...);
console.log(JSON.stringify(result));  // stdout만 사용
```

## 호환성

- Node.js 12+
- CommonJS (require/module.exports)

## 라이선스

Samsung Developer Experience
