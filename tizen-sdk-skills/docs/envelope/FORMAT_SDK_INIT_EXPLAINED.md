# formatSdkInit 완벽 가이드 - 누가, 언제, 왜, 어떻게

이 문서는 `formatSdkInit(sdkPath, configFile)` 함수의 **전체 호출 시나리오**를 설명합니다.

---

## 한눈에 보기

| 항목 | 설명 |
|------|------|
| **누가** | `sdk-commands.js`의 `initSdk()` 함수 |
| **언제** | 사용자가 SDK 초기화를 요청할 때 (또는 자동 초기화 플로우) |
| **왜** | Tizen SDK 경로를 설정하고, 향후 명령어들이 사용할 수 있도록 저장 |
| **어떻게** | 경로 검증 → config 파일 작성 → `formatSdkInit()` 호출 → Envelope 반환 |
| **결과** | Standard JSON Envelope (성공/실패 상태 포함) |

---

## 상세 설명

### 1. 누가(Who) - 호출자

```
initSdk() 함수 (lib/core/sdk-commands.js에 정의)
    │
    └─ 내부에서 formatSdkInit()를 호출
```

**코드**:
```javascript
// lib/core/sdk-commands.js
async function initSdk(sdkPath) {
  // ... 경로 검증 ...
  
  // ← 여기서 formatSdkInit() 호출
  return formatSdkInit(sdkPath, CONFIG_FILE);
}
```

**호출 방식**:
```javascript
// 누군가가 initSdk()를 부를 때
const result = await initSdk('/opt/tizen-studio');
// ↓ 내부에서 자동으로 formatSdkInit()이 호출됨
```

---

### 2. 언제(When) - 호출 시점

#### 시나리오 A: 사용자 요청

```
사용자: "Tizen SDK를 /opt/tizen-studio에서 찾아줘"
  │
  ├─ 방법 1: 에이전트 자동 실행
  │   tizen-sdk-install 에이전트 → initSdk() → formatSdkInit()
  │
  ├─ 방법 2: CLI 명령어
  │   $ tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio
  │   → plugin.run(["sdk-init", ...]) → initSdk() → formatSdkInit()
  │
  └─ 방법 3: 스크립트 직접 실행
      node script.js /opt/tizen-studio
      → initSdk() → formatSdkInit()
```

#### 시나리오 B: 자동 초기화

```
프로젝트 생성 요청
  │
  ├─ 현재 SDK 경로 확인
  │
  ├─ SDK 미설정 감지
  │
  ├─ 자동으로 initSdk() 호출
  │
  └─ formatSdkInit() 실행
```

#### 타이밍

```
t=0ms   사용자 요청 또는 자동 플로우 시작
  │
  ├─ t=10ms  initSdk() 호출
  │
  ├─ t=50ms  경로 검증 완료
  │
  ├─ t=100ms 파일 작성 완료
  │
  ├─ t=110ms formatSdkInit() 호출
  │
  └─ t=150ms JSON 응답 stdout으로 전송
```

---

### 3. 왜(Why) - 호출 이유

#### 목적: SDK 경로 관리

```
┌─────────────────────────────────────┐
│ formatSdkInit()의 역할              │
├─────────────────────────────────────┤
│ 1. 경로 검증 완료 확인              │
│ 2. config 파일 저장 경로 기록       │
│ 3. 향후 명령어들의 참조 지점 제공   │
│ 4. 에러 발생 시 자가 복구 가이드    │
└─────────────────────────────────────┘
```

#### 필요한 이유

| 상황 | 이유 |
|------|------|
| **첫 개발 환경 구성** | SDK를 어디에 설치했는지 저장 |
| **다중 프로젝트 작업** | 각 프로젝트가 같은 SDK를 사용하도록 보장 |
| **자동화 파이프라인** | CI/CD에서 SDK 경로를 자동 감지 |
| **환경 재구성** | SDK 이동/업그레이드 시 경로 변경 |

---

### 4. 어떻게(How) - 호출 방식

#### 흐름도

```
┌─────────────────────┐
│ 사용자/시스템 요청  │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────────────────────────┐
    │ initSdk(sdkPath)                 │
    │ (lib/core/sdk-commands.js)            │
    └──────────┬───────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
    [경로      [권한
     검증]     검증]
        │             │
        └──────┬──────┘
               │
               ▼
        ┌────────────────────┐
        │ config 파일 생성   │
        │ ~/.tizen.path...   │
        └──────┬─────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │ formatSdkInit(sdkPath, configFile)│
    │ (lib/envelope/response-formatter.js)      │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │ new Envelope('tizen-sdk sdk-init')│
    │   .success({...})                │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │ JSON Envelope 생성               │
    │ {                                │
    │   "command": "...",              │
    │   "status": "success",           │
    │   "duration_ms": 150,            │
    │   "result": {...},               │
    │   "errors": []                   │
    │ }                                │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │ stdout에 JSON 출력               │
    │ (콘솔/파이프/네트워크 전송)     │
    └──────────────────────────────────┘
```

#### 코드 레벨 호출

```javascript
// 단계 1: initSdk() 호출
const result = await initSdk('/opt/tizen-studio');

// 단계 2: initSdk() 내부 흐름
//   2-1. 경로 검증
//   2-2. config 파일 생성
//   2-3. formatSdkInit() 호출 ← 여기!
//        return formatSdkInit(sdkPath, CONFIG_FILE);

// 단계 3: formatSdkInit() 실행
//   3-1. Envelope 생성
//   3-2. success() 호출
//   3-3. { command, status, duration_ms, result, ... } 반환

// 단계 4: 결과 반환
console.log(JSON.stringify(result));  // stdout 출력
```

---

### 5. 함수별 역할 분담

```
┌─────────────────────────────────────────┐
│ initSdk(sdkPath)                        │
│ ├─ 경로 검증 (fs.existsSync)           │
│ ├─ 권한 검증 (fs.accessSync)           │
│ ├─ config 디렉토리 생성                 │
│ ├─ config 파일 작성                     │
│ └─ formatSdkInit() 호출 ← 여기!        │
│    (검증된 데이터 전달)                │
└──────────────┬──────────────────────────┘
               │ (성공 또는 에러)
               ▼
┌─────────────────────────────────────────┐
│ formatSdkInit(sdkPath, configFile)      │
│ ├─ Envelope 인스턴스 생성               │
│ └─ success({ sdk_path, config_file })  │
│    (JSON 포맷 생성)                     │
└──────────────┬──────────────────────────┘
               │ (Envelope 객체)
               ▼
┌─────────────────────────────────────────┐
│ Envelope.success(data)                  │
│ ├─ { command, status, duration_ms }    │
│ ├─ { result: data }                     │
│ └─ { warnings: [], errors: [] }         │
│    (최종 JSON 객체 생성)                │
└──────────────┬──────────────────────────┘
               │ (완성된 Envelope)
               ▼
      stdout에 출력 (JSON 문자열)
```

---

## 실제 사용 예시

### 예시 1: 간단한 호출

```javascript
const { initSdk } = require('./lib/core/sdk-commands');

(async () => {
  const result = await initSdk('/opt/tizen-studio');
  console.log(JSON.stringify(result));
})();
```

**출력**:
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
  "duration_ms": 120
}
```

### 예시 2: 에이전트에서 호출

```markdown
---
name: my-setup-agent
description: Setup Tizen environment
---

const { initSdk } = require('../lib/core/sdk-commands');

사용자가 제공한 SDK 경로로 초기화합니다.

const sdkPath = '/opt/tizen-studio';
const result = await initSdk(sdkPath);

// formatSdkInit()이 호출되어 Envelope 생성됨
console.log(JSON.stringify(result));
```

### 예시 3: 자동 초기화 플로우

```javascript
const { initSdk, readSdkPath } = require('./lib/core/sdk-commands');

async function ensureSdkInitialized() {
  // 현재 SDK 경로 확인
  const sdkPath = readSdkPath();
  
  if (!sdkPath) {
    // SDK 미설정 → 자동 초기화
    const result = await initSdk('/opt/tizen-studio');
    // ↓ 내부에서 formatSdkInit() 호출됨
    
    if (result.status !== 'success') {
      throw new Error(result.errors[0].message);
    }
  }
}
```

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
  "duration_ms": 150
}
```

**각 필드**:
- `command`: "tizen-sdk sdk-init" (고정)
- `status`: "success" (formatSdkInit에서 설정)
- `duration_ms`: 실행 시간 (Envelope에서 자동 계산)
- `result.sdk_path`: 저장된 SDK 경로
- `result.config_file`: config 파일 경로

### 실패 응답

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_CONFIG_E002",
      "error_category": "sdk_path_invalid",
      "message": "SDK path does not exist: /nonexistent/path",
      "suggested_fix": {
        "command": "Verify that Tizen SDK is installed at /nonexistent/path",
        "auto_fixable": false,
        "guide_url": null
      }
    }
  ],
  "command": "tizen-sdk sdk-init",
  "duration_ms": 50
}
```

---

## 호출 체인 요약

```
최상위 호출:
  initSdk('/opt/tizen-studio')
    │
    ├─ fs.existsSync(path)              // 경로 확인
    ├─ fs.accessSync(path)              // 권한 확인
    ├─ fs.mkdirSync(configDir)          // 디렉토리 생성
    ├─ fs.writeFileSync(configFile)     // 파일 작성
    │
    └─ formatSdkInit(sdkPath, configFile)  // ← 여기서 호출!
         │
         └─ new Envelope('tizen-sdk sdk-init')
              │
              └─ .success({ sdk_path, config_file })
                   │
                   └─ { command, status, duration_ms, result, warnings, errors }
                        │
                        └─ return (Envelope 객체)
```

---

## 요점 정리

| 구분 | 내용 |
|------|------|
| **정의** | 경로 설정 후 Standard JSON Envelope 생성 |
| **호출자** | `initSdk()` 함수 (내부 호출) |
| **호출 시점** | SDK 초기화 요청 시 |
| **입력** | sdkPath, configFile |
| **출력** | Standard JSON Envelope (성공/실패) |
| **역할** | 응답 포맷팅 (json 구조화) |
| **위치** | `lib/envelope/response-formatter.js` |
| **의존성** | `Envelope` 클래스 (`lib/envelope/envelope.js`) |

---

## 다음 단계

이제 다음 함수들도 같은 패턴으로 호출됩니다:

- `formatSdkStatus()` ← `getSdkStatus()` 내에서 호출
- `formatProjectCreate()` ← project create 명령에서 호출
- `formatProjectBuild()` ← project build 명령에서 호출
- `formatDeviceList()` ← device list 명령에서 호출
- ... 등등

모두 같은 원리입니다:
1. 작업 수행
2. 결과 수집
3. `formatXxx()` 호출
4. Envelope 반환
5. JSON으로 stdout 출력

---

## 참고 문서

- [Envelope 사용 가이드](ENVELOPE_USAGE_GUIDE.md)
- [호출 흐름 다이어그램](ENVELOPE_CALL_FLOW.md)
- [라이브러리 README](../../common/lib/README.md)
