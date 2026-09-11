# Standard JSON Envelope 사용 가이드

[English](ENVELOPE_USAGE_GUIDE.en.md) | 한국어

## 개요

Standard JSON Envelope는 모든 `tizen-sdk` 명령어의 응답을 **결정적이고 구조화된 JSON 형식**으로 표준화합니다.
이를 통해 AI 에이전트와 자동화 도구가 안정적으로 응답을 파싱할 수 있습니다.

**관련 PRD 요구사항**:
- REQ-SDK-OUT-001: 모든 명령은 Standard JSON Envelope로 출력
- REQ-SDK-OUT-002: 실패 시 error_code, error_category, message, suggested_fix 포함
- REQ-SDK-OUT-003: 대용량 로그는 경로 참조로 반환
- REQ-SDK-OUT-004: 텍스트 기반 도구의 ANSI escape/로그 차단

---

## 응답 구조

### 성공 응답

```json
{
  "status": "success",
  "result": {
    "sdk_path": "/opt/tizen-studio",
    "config_file": "/home/user/.tizen.sdk.path.config"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-init",
  "user_command": "tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio",
  "duration_ms": 150
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `command` | string | 내부 코어 명령 라벨 (예: `tizen-sdk sdk-init`) |
| `user_command` | string | 사용자가 실제로 입력한 명령 — 재현·재시도용 |
| `status` | string | `success` |
| `duration_ms` | number | 명령 실행 시간 (밀리초) |
| `result` | object | 명령어별 결과 데이터 |
| `warnings` | array | 경고 메시지 배열 (선택) |
| `errors` | array | 항상 빈 배열 |

### 실패 응답

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_DEVICE_E001",
      "error_category": "device_not_found",
      "message": "No connected device or emulator found.",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch",
        "auto_fixable": false,
        "guide_url": "https://docs.tizen.org/application/native/tutorials/getting-started/"
      }
    }
  ],
  "command": "tizen-sdk install-app",
  "user_command": "tizen-cli tizen-sdk run-project --project /home/user/MyApp",
  "duration_ms": 50
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `command` | string | 내부 코어 명령 라벨 (예: `tizen-sdk install-app`) |
| `user_command` | string | 사용자가 실제로 입력한 명령 — 재현·재시도용 |
| `status` | string | `failure` |
| `duration_ms` | number | 명령 실행 시간 |
| `errors` | array | 에러 객체 배열 |
| `.error_code` | string | 고유 에러 코드 (예: `TIZEN_SDK_DEVICE_E001`) |
| `.error_category` | string | 에러 분류 (예: `device_not_found`) |
| `.message` | string | 사람이 읽을 수 있는 메시지 |
| `.suggested_fix` | object | 복구 제안 (선택) |
| `.suggested_fix.command` | string | 권장 실행 명령 |
| `.suggested_fix.auto_fixable` | boolean | 자동 수정 가능 여부 |
| `.suggested_fix.guide_url` | string | 도움말 문서 URL |

### `command` vs `user_command`

두 필드는 **의도적으로 다릅니다**.

- `command` — 코어가 붙이는 내부 라벨(`tizen-sdk create-emulator`). 진입점이 달라도 같은 작업이면 같은 값이라, 로그 집계·분류에 씁니다.
- `user_command` — 사용자가 실제로 친 명령. envelope만 보고 재현·재시도할 수 있게 합니다.

진입점별로 형태가 다릅니다:

| 진입점 | `user_command` 예시 |
|---|---|
| tizen-cli 플러그인 | `tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch` |
| 표준 CLI 러너 (skill/agent가 `node "$CLI" …`로 호출) | `node emulator-manager-cli.js launch --vm-name my-vm` |

표준 러너의 경우 `$CLI`는 머신·버전마다 다른 절대경로(`~/.claude/plugins/cache/…/1.0.0/lib/cli/…`)이므로 **파일명만** 표시합니다.

**민감 값은 마스킹됩니다.** envelope은 로그·터미널·모델 컨텍스트에 그대로 남으므로, `--password` 계열 플래그의 값은 `***`로 대체됩니다:

```json
"user_command": "node cert-manager-cli.js generate-author --name \"Jane Dev\" --password ***"
```

경로일 뿐인 `--password-file`과 불리언인 `--prompt-password`는 마스킹하지 않습니다. 대상 플래그 목록은 `common/lib/envelope/user-command.js`의 `SENSITIVE_FLAGS`에 있습니다.

---

## 사용 방법

### 1. 기본 사용 (wrapEnvelope)

```javascript
const { wrapEnvelope } = require('../lib/envelope/envelope-wrapper');

// 성공 응답
const result = wrapEnvelope('tizen-sdk sdk-init', {
  sdk_path: '/opt/tizen-studio',
  config_file: '/home/user/.tizen.sdk.path.config',
});
console.log(JSON.stringify(result));

// 실패 응답
const error = wrapEnvelope(
  'tizen-sdk build-project',
  null,
  'build_failed',
  'Compilation error in main.c:42'
);
console.log(JSON.stringify(error));
```

### 2. 공통 에러 사용

```javascript
const { CommonErrors } = require('../lib/envelope/envelope-wrapper');

// SDK 경로 미설정
console.log(JSON.stringify(
  CommonErrors.sdkPathNotSet('tizen-sdk build-project')
));

// 기기 미검출
console.log(JSON.stringify(
  CommonErrors.deviceNotFound('tizen-sdk install-app')
));

// 템플릿 미검출
console.log(JSON.stringify(
  CommonErrors.templateNotFound('tizen-sdk create-project', 'BasicWeb')
));

// 빌드 실패
console.log(JSON.stringify(
  CommonErrors.buildFailed('tizen-sdk build-project', 'Linking error')
));

// 에뮬레이터 관련 에러
console.log(JSON.stringify(
  CommonErrors.emulatorNotFound('tizen-sdk launch-emulator', 'tizen-mobile-10.0')
));

console.log(JSON.stringify(
  CommonErrors.emulatorAlreadyRunning('tizen-sdk launch-emulator', 'tizen-mobile-10.0')
));
```

### 3. 응답 포맷팅 헬퍼 사용

```javascript
const {
  formatSdkInit,
  formatProjectCreate,
  formatDeviceList,
  formatEmulatorList,
} = require('../lib/envelope/response-formatter');

// SDK 초기화
console.log(JSON.stringify(
  formatSdkInit('/opt/tizen-studio', '/home/user/.tizen.sdk.path.config')
));

// 프로젝트 생성
console.log(JSON.stringify(
  formatProjectCreate(
    '/home/user/projects/MyApp',
    'native',
    'tizen',
    '10.0',
    'MyApp'
  )
));

// 기기 목록
console.log(JSON.stringify(
  formatDeviceList([
    {
      device_id: 'emulator-26101',
      device_name: 'Tizen 10.0 Mobile',
      status: 'online',
      platform: 'Tizen',
      version: '10.0',
      type: 'emulator',
    },
  ])
));
```

---

## 에러 카테고리 목록

| 카테고리 | 에러 코드 | 설명 |
|---------|----------|------|
| `sdk_path_not_set` | TIZEN_SDK_CONFIG_E001 | SDK 경로가 설정되지 않음 |
| `sdk_path_invalid` | TIZEN_SDK_CONFIG_E002 | SDK 경로가 유효하지 않음 |
| `sdk_path_not_accessible` | TIZEN_SDK_CONFIG_E003 | SDK 경로에 접근할 수 없음 |
| `device_not_found` | TIZEN_SDK_DEVICE_E001 | 연결된 기기 없음 |
| `template_not_found` | TIZEN_SDK_TEMPLATE_E001 | 템플릿을 찾을 수 없음 |
| `project_creation_failed` | TIZEN_SDK_PROJECT_E001 | 프로젝트 생성 실패 |
| `build_failed` | TIZEN_SDK_BUILD_E001 | 빌드 실패 |
| `emulator_not_found` | TIZEN_SDK_EMULATOR_E001 | 에뮬레이터를 찾을 수 없음 |
| `emulator_already_running` | TIZEN_SDK_EMULATOR_E002 | 에뮬레이터가 이미 실행 중 |
| `io_error` | TIZEN_SDK_IO_E001 | 파일 I/O 에러 |
| `permission_denied` | TIZEN_SDK_IO_E002 | 쓰기 거부 (EACCES / Access is denied) |
| `remote_path_not_found` | TIZEN_SDK_IO_E003 | 디바이스 쪽 경로가 존재하지 않음 (file-transfer pull) — 같은 경로로 재시도 금지 |

---

## 명령어별 응답 예시

### sdk init

**성공**:
```json
{
  "status": "success",
  "result": {
    "sdk_path": "/opt/tizen-studio",
    "config_file": "/home/user/.tizen.sdk.path.config"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-init",
  "duration_ms": 150
}
```

### project create

**성공**:
```json
{
  "status": "success",
  "result": {
    "project_path": "/home/user/projects/MyWebApp",
    "app_type": "web",
    "profile": "tizen",
    "platform_version": "10.0",
    "project_name": "MyWebApp"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-project",
  "duration_ms": 2500
}
```

### project build

**성공**:
```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "/home/user/projects/MyApp/Debug/MyApp.tpk",
        "format": ".tpk",
        "size_bytes": 1048576
      }
    ],
    "build_time_ms": 5000
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 5000
}
```

### device list

**성공**:
```json
{
  "status": "success",
  "result": {
    "devices": [
      {
        "device_id": "emulator-26101",
        "device_name": "Tizen 10.0 Mobile Emulator",
        "status": "online",
        "platform": "Tizen",
        "version": "10.0",
        "type": "emulator"
      },
      {
        "device_id": "RF123456789",
        "device_name": "Galaxy Watch 6",
        "status": "connected",
        "platform": "Tizen",
        "version": "8.0",
        "type": "usb"
      }
    ]
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 1200
}
```

**실패** (기기 미검출):
```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_DEVICE_E001",
      "error_category": "device_not_found",
      "message": "No connected device or emulator found.",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch",
        "auto_fixable": false,
        "guide_url": "https://docs.tizen.org/application/native/tutorials/getting-started/"
      }
    }
  ],
  "command": "tizen-sdk install-app",
  "duration_ms": 50
}
```

---

## 기존 에이전트에 적용하는 방법

### 예시: tizen-create-project 에이전트

기존:
```markdown
---
name: tizen-create-project
description: Create a new Tizen project
...
---

사용자가 요청한 프로젝트를 생성합니다.
...
프로젝트가 /path/to/project에 생성되었습니다.
```

변경 후:
```markdown
---
name: tizen-create-project
description: Create a new Tizen project
...
---

const { formatProjectCreate } = require('../lib/envelope/response-formatter');

... 프로젝트 생성 로직 ...

// 성공 시
const envelope = formatProjectCreate(
  projectPath,
  appType,
  profile,
  platformVersion,
  projectName
);
console.log(JSON.stringify(envelope));

// 실패 시
const { CommonErrors } = require('../lib/envelope/envelope-wrapper');
const error = CommonErrors.projectCreationFailed('tizen-sdk create-project', reason);
console.log(JSON.stringify(error));
```

---

## 테스트

테스트 파일에서 모든 응답 포맷을 확인할 수 있습니다:

```bash
# Navigate to project root directory
cd ~/path/to/tizen-sdk-skills

# Or on Windows (PowerShell)
cd C:\path\to\tizen-sdk-skills

# Run the test
node lib/tests/envelope.test.js
```

---

## 참고 사항

1. **stdout 전용**: 모든 JSON Envelope는 stdout으로 출력됩니다
2. **디버그 로그**: 디버그/진단 정보는 stderr로 전송됩니다 (Envelope에 오염 없음)
3. **대용량 로그**: 1MB 이상의 로그는 파일로 저장하고 경로만 반환합니다
4. **ANSI escape 제거**: 레거시 도구의 colored output은 제거되어야 합니다
5. **타임아웃**: 각 명령어에 적절한 타임아웃을 설정하세요 (빌드: 30분 등)

---

## 관련 파일

- `lib/envelope/envelope.js` - Envelope 핵심 클래스
- `lib/envelope/envelope-wrapper.js` - 래퍼 및 공통 에러
- `lib/envelope/response-formatter.js` - 명령어별 응답 포맷팅 헬퍼
- `lib/tests/envelope.test.js` - 테스트 및 예시
