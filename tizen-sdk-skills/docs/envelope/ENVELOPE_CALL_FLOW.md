# formatSdkInit 호출 흐름 및 시나리오

[English](ENVELOPE_CALL_FLOW.en.md) | 한국어

## 개요

`formatSdkInit` 함수는 **SDK 초기화 명령 실행 후** Standard JSON Envelope 형식으로 응답을 생성합니다.

---

## 호출 흐름 (Call Flow)

### 전체 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│ 사용자가 Cline에서 요청                                    │
│ (예: "Tizen SDK를 초기화해줘" 또는 직접 명령어 실행)            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Cline 메인 루프      │
        │ (또는 Skill 인터페이스)    │
        └────────────┬───────────────┘
                     │
                     ▼
    ┌──────────────────────────────────────────┐
    │ tizen-sdk-skills 플러그인 라우팅         │
    │ (plugin.json에서 tizen-sdk 네임스페이스) │
    └────────────┬─────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────┐
    │ 요청이 "sdk init"인지 확인               │
    │ args: ["sdk-init", "--sdk-path", ".."]│
    └────────────┬────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────┐
    │ lib/core/sdk-commands.js                         │
    │ initSdk(sdkPath) 함수 호출                  │
    └────────────┬────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    [경로 검증]      [config 파일 생성]
        │                 │
        └────────┬────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────┐
    │ lib/envelope/response-formatter.js                   │
    │ formatSdkInit(sdkPath, configFile) 호출    │
    └────────────┬────────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────┐
    │ lib/envelope/envelope.js                             │
    │ new Envelope('tizen-sdk sdk-init')          │
    │   .success({ sdk_path, config_file })      │
    └────────────┬────────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────┐
    │ Standard JSON Envelope 반환                 │
    │ {                                           │
    │   "command": "tizen-sdk sdk-init",         │
    │   "status": "success",                      │
    │   "duration_ms": 150,                       │
    │   "result": {                               │
    │     "sdk_path": "/opt/tizen-studio",       │
    │     "config_file": "~/.tizen.sdk.path.config"  │
    │   },                                        │
    │   "warnings": [],                           │
    │   "errors": []                              │
    │ }                                           │
    └────────────┬────────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────┐
    │ stdout으로 출력 (JSON 전용)                │
    │ console.log(JSON.stringify(result))         │
    └─────────────────────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────┐
    │ Cline가 JSON 파싱 및 처리            │
    │ (에이전트/스킬이 완료됨)                   │
    └─────────────────────────────────────────────┘
```

---

## 언제(When) - 호출 시점

### 시나리오 1: 사용자가 직접 요청

```
사용자: "Tizen SDK를 /opt/tizen-studio에 설치해줘"
  ↓
tizen-sdk-install 에이전트 실행
  ↓
(SDK 설치 완료)
  ↓
자동으로 initSdk() 호출
  ↓
formatSdkInit() 실행
  ↓
JSON 응답 반환
```

### 시나리오 2: 자동 초기화 플로우

```
tizen-create-project 에이전트 시작
  ↓
SDK 경로 미설정 확인
  ↓
initSdk()를 통해 자동 초기화
  ↓
formatSdkInit() 실행
  ↓
프로젝트 생성 계속 진행
```

### 시나리오 3: CLI 명령어 직접 실행

```
$ tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio
  ↓
Core에서 tizen-sdk plugin 로드
  ↓
plugin.run(["sdk-init", "--sdk-path", "/opt/tizen-studio"])
  ↓
sdk-commands.initSdk("/opt/tizen-studio")
  ↓
formatSdkInit() 실행
  ↓
JSON 응답 반환
```

---

## 왜(Why) - 호출 이유

| 호출 이유 | 상황 | 다음 액션 |
|----------|------|----------|
| **SDK 초기화** | 개발 환경 첫 구성 | 프로젝트 생성 가능 |
| **경로 변경** | SDK 재설치 또는 이동 | 이전 경로 업데이트 |
| **자동 검증** | 다른 명령 실행 전 | SDK 경로 확인 |
| **CI/CD 파이프라인** | 자동 환경 구성 | 빌드/배포 진행 |

---

## 어떻게(How) - 호출 방식

### 방식 1: Node.js 직접 호출 (테스트/스크립트)

```javascript
const { initSdk } = require('./lib/core/sdk-commands');

(async () => {
  const result = await initSdk('/opt/tizen-studio');
  console.log(JSON.stringify(result, null, 2));
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
  "duration_ms": 150
}
```

### 방식 2: 에이전트에서 호출

```markdown
---
name: my-custom-agent
description: Custom SDK initialization
---

const { initSdk } = require('../lib/core/sdk-commands');

사용자가 요청한 SDK 경로를 분석합니다.

const sdkPath = '/opt/tizen-studio';
const result = await initSdk(sdkPath);
console.log(JSON.stringify(result));
```

### 방식 3: tizen-cli 플러그인에서 호출

```javascript
// tizen-sdk-plugin/index.js
const { initSdk } = require('./lib/core/sdk-commands');

async function run(args) {
  if (args[0] === 'sdk' && args[1] === 'init') {
    const sdkPath = args[3]; // --sdk-path 뒤의 값
    const result = await initSdk(sdkPath);
    console.log(JSON.stringify(result));
    process.exit(result.status === 'success' ? 0 : 1);
  }
}

module.exports = { run };
```

---

## 함수별 세부 호출 관계

### formatSdkInit

```javascript
formatSdkInit(sdkPath, configFile)
  │
  ├─ new Envelope('tizen-sdk sdk-init')
  │   │
  │   └─ envelope.success({
  │       sdk_path: sdkPath,
  │       config_file: configFile
  │     })
  │       │
  │       └─ {
  │           command,
  │           status: 'success',
  │           duration_ms,
  │           result,
  │           warnings: [],
  │           errors: []
  │         }
  │
  └─ return Envelope 객체
```

### 호출 체인

```
initSdk(sdkPath)
  │
  ├─ fs.existsSync(sdkPath) // 경로 검증
  │
  ├─ fs.accessSync(sdkPath) // 권한 검증
  │
  ├─ fs.mkdirSync(configDir) // config 디렉토리 생성
  │
  ├─ fs.writeFileSync(CONFIG_FILE, sdkPath) // config 파일 작성
  │
  └─ formatSdkInit(sdkPath, CONFIG_FILE)
      │
      └─ Envelope 객체 반환
```

---

## 실패 경로 (Error Cases)

### 경우 1: SDK 경로 미설정

```
initSdk(null)
  │
  └─ formatError(
       'tizen-sdk sdk-init',
       'sdk_path_invalid',
       'SDK path must be a non-empty string'
     )
       │
       └─ {
            "command": "tizen-sdk sdk-init",
            "status": "failure",
            "errors": [{
              "error_code": "TIZEN_SDK_UNKNOWN_E001",
              "error_category": "sdk_path_invalid",
              "message": "SDK path must be a non-empty string"
            }]
          }
```

### 경우 2: 경로 존재하지 않음

```
initSdk('/nonexistent/path')
  │
  └─ formatError(
       'tizen-sdk sdk-init',
       'sdk_path_invalid',
       'SDK path does not exist: /nonexistent/path'
     )
```

### 경우 3: 권한 없음

```
initSdk('/root/sdk')  // 접근 불가
  │
  └─ formatError(
       'tizen-sdk sdk-init',
       'sdk_path_not_accessible',
       'No read/write permission for SDK path'
     )
```

---

## 타이밍 다이어그램

```
t=0ms   initSdk() 호출 시작
  │
  ├─ t=10ms   경로 검증 완료
  │
  ├─ t=20ms   config 디렉토리 생성
  │
  ├─ t=30ms   config 파일 작성
  │
  ├─ t=40ms   formatSdkInit() 호출
  │
  ├─ t=50ms   Envelope 객체 생성
  │
  ├─ t=60ms   JSON 직렬화
  │
  └─ t=150ms  stdout에 출력 (duration_ms: 150)
```

---

## 제어 흐름 요약

```
┌────────────────────────────────────────────┐
│ 누가(Who)     : formatSdkInit, sdk-commands │
│ 언제(When)    : SDK 초기화 필요 시           │
│ 왜(Why)       : config 파일 생성           │
│ 어떻게(How)   : Envelope으로 래핑          │
│ 어디서(Where) : lib/envelope/response-formatter.js  │
│ 결과(Result)  : Standard JSON Envelope     │
└────────────────────────────────────────────┘
```

---

## 참고: 관련 함수 호출 맵

```
User Request
    │
    ├─ sdk init ──→ initSdk() ──→ formatSdkInit()
    │
    ├─ sdk status ──→ getSdkStatus() ──→ formatSdkStatus()
    │
    ├─ project create ──→ (readSdkPath 내부 확인) ──→ formatProjectCreate()
    │
    └─ device list ──→ (readSdkPath 내부 확인) ──→ formatDeviceList()
```

각 명령은 필요에 따라 `readSdkPath()`로 현재 SDK 경로를 확인합니다.
