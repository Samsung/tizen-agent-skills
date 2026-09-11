# tizen-sdk-install 에이전트와 installSdk() 통합 가이드

[English](AGENT_TO_INSTALLSDK_INTEGRATION.en.md) | 한국어

## 📋 개요

`tizen-sdk-install` 에이전트가 **`lib/core/sdk-commands.js`의 `installSdk()` 함수를 호출**하여 Standard JSON Envelope 형식의 응답을 반환하는 방식을 설명합니다.

---

## ✅ 호출 흐름

### Step 1: 사용자 자연어 입력

```
사용자: "Tizen SDK를 설치해줄래?"
```

---

### Step 2: Cline가 에이전트 선택

Cline가 자동으로 `tizen-sdk-install` 에이전트를 선택하여 실행합니다.

```
agents/tizen-sdk-install.md → 실행
```

---

### Step 3: 에이전트가 installSdk() 호출

```javascript
// tizen-sdk-install 에이전트 내부

const { installSdk } = require('../../../lib/core/sdk-commands');

// 사용자 요청에서 파라미터 추출
const version = '10.0';   // 사용자 요청에서 파싱
const label = 'tizen';     // 기본값 또는 사용자 지정

// ✅ installSdk() 호출 (여기서 호출!)
const result = await installSdk(version, label);

// JSON으로 출력
console.log(JSON.stringify(result));
```

---

### Step 4: installSdk() 실행

```javascript
// lib/core/sdk-commands.js의 installSdk() 함수

async function installSdk(version = '10.0', label = 'tizen') {
  try {
    // 1. SDK 경로 확인
    const sdkPath = readSdkPath();
    
    // 2. 스크립트 실행 (실제 설치 - 3분)
    const output = execSync(
      `powershell -ExecutionPolicy Bypass -File "tizen-sdk-install.ps1" ...`,
      { encoding: 'utf-8' }
    );
    
    // 3. 결과 파싱
    const result = JSON.parse(output);
    const packages = result.packages || [];
    const warnings = result.warnings || [];
    
    // 4. ✅ formatSdkInstall() 호출 (여기서 호출!)
    const envelope = formatSdkInstall(packages, warnings);
    
    // 5. Standard JSON Envelope 반환
    return envelope;
  } catch (error) {
    return formatError(...);
  }
}
```

---

### Step 5: formatSdkInstall() 호출

```javascript
// lib/envelope/response-formatter.js의 formatSdkInstall() 함수

function formatSdkInstall(packages, warnings = []) {
  const envelope = new Envelope('tizen-sdk sdk-install');
  
  return envelope.success(
    {
      packages: packages || [],
      installation_status: 'completed',
    },
    { warnings }
  );
}
```

---

### Step 6: Standard JSON Envelope 생성

```javascript
// Envelope.success()에서 자동으로 생성

{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 185000,
  "result": {
    "packages": [
      {
        "name": "Tizen Studio Tools",
        "version": "6.5",
        "size_mb": 200,
        "status": "installed"
      },
      {
        "name": "Tizen SDK 10.0",
        "version": "10.0",
        "size_mb": 400,
        "status": "installed"
      },
      {
        "name": "Tizen SDK 8.0",
        "version": "8.0",
        "size_mb": 350,
        "status": "installed"
      }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "Emulator requires 4GB RAM minimum",
    "Some optional tools are missing"
  ],
  "errors": []
}
```

---

### Step 7: stdout으로 출력

```javascript
console.log(JSON.stringify(envelope));
// ↑ JSON을 stdout으로 출력
```

---

### Step 8: 사용자에게 결과 표시

Cline가 JSON을 파싱하여 사용자에게 표시합니다.

```
✅ SDK 설치 완료!

설치된 패키지 (3개):
  • Tizen Studio Tools (6.5)
  • Tizen SDK 10.0 (400MB)
  • Tizen SDK 8.0 (350MB)

소요 시간: 3분 5초

⚠️ 주의사항:
  • Emulator requires 4GB RAM minimum
  • Some optional tools are missing
```

---

## 📊 완전한 호출 체인

```
┌────────────────────────────────┐
│ 사용자                         │
│ "SDK를 설치해줄래?"           │
└──────────────┬─────────────────┘
               │
               ▼
    ┌──────────────────────────────┐
    │ tizen-sdk-install 에이전트  │
    │                              │
    │ const { installSdk } =      │
    │   require('./sdk-commands');│
    │                              │
    │ const result =              │
    │   await installSdk('10.0'); │  ← 호출자!
    └──────────────┬───────────────┘
                   │ (호출)
                   ▼
        ┌──────────────────────┐
        │ installSdk()         │
        │                      │
        │ 1. readSdkPath()     │
        │ 2. execSync()        │ (3분)
        │ 3. JSON.parse()      │
        │ 4. formatSdkInstall()│ ← 호출 (내부)
        │ 5. return envelope   │
        └──────────┬───────────┘
                   │
        ┌──────────▼────────────────┐
        │ formatSdkInstall()        │
        │                           │
        │ return envelope.success() │
        └──────────┬────────────────┘
                   │
        ┌──────────▼────────────────┐
        │ Standard JSON Envelope    │
        │ {                         │
        │   "command": "...",       │
        │   "status": "success",    │
        │   "duration_ms": 185000,  │
        │   "result": {...},        │
        │   "warnings": [...],      │
        │   "errors": []            │
        │ }                         │
        └──────────┬────────────────┘
                   │
        ┌──────────▼────────────────┐
        │ console.log(JSON.stringify│
        │   (envelope))             │
        └──────────┬────────────────┘
                   │
        ┌──────────▼────────────────┐
        │ 사용자에게 표시           │
        │ (JSON 파싱 후 UI 표시)   │
        └───────────────────────────┘
```

---

## 🎯 역할별 책임

| 구성 요소 | 책임 | 위치 |
|----------|------|------|
| **사용자** | 자연어 요청 | - |
| **tizen-sdk-install 에이전트** | 요청 파싱 + `installSdk()` 호출 | agents/ |
| **installSdk()** | 스크립트 실행 + `formatSdkInstall()` 호출 | lib/core/sdk-commands.js |
| **formatSdkInstall()** | JSON 포맷팅 | lib/envelope/response-formatter.js |
| **Envelope** | 메타데이터 추가 | lib/envelope/envelope.js |

---

## 📝 에이전트 구현 코드

### 기본 구조

```markdown
---
name: tizen-sdk-install
description: Install Tizen SDK
---

사용자의 SDK 설치 요청을 처리합니다.

const { installSdk } = require('../../../lib/core/sdk-commands');

## 구현 스텝

### 1. 사용자 요청 파싱

요청에서 SDK 버전과 레이블을 추출합니다.

```

### 2. installSdk() 호출

```javascript
const version = extractVersion(userRequest);  // "10.0" 등
const label = extractLabel(userRequest);      // "tizen" 등

// ✅ installSdk() 호출
const result = await installSdk(version, label);

// JSON으로 출력
console.log(JSON.stringify(result));
```

### 3. 결과는 자동으로 Standard JSON Envelope

installSdk()는 내부에서 formatSdkInstall()을 호출하므로, 
반환값이 이미 Standard JSON Envelope 형식입니다.

```javascript
{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 185000,
  "result": { "packages": [...] },
  "warnings": [...],
  "errors": []
}
```

---

## ✨ 의존성

```
tizen-sdk-install 에이전트
  ↓
lib/core/sdk-commands.js (installSdk)
  ├─ lib/envelope/response-formatter.js (formatSdkInstall)
  │   ↓
  │   lib/envelope/envelope.js (Envelope 클래스)
  │
  ├─ Node.js child_process (스크립트 실행)
  │
  └─ fs (파일 I/O)
```

---

## 🎁 최종 정리

| 질문 | 답변 |
|------|------|
| **누가 installSdk()를 호출하나?** | tizen-sdk-install 에이전트 |
| **어디서 호출하나?** | 에이전트의 메인 로직에서 |
| **어떻게 호출하나?** | `const result = await installSdk('10.0');` |
| **뭘 받나?** | Standard JSON Envelope 객체 |
| **JSON은 어디서 생성되나?** | installSdk() 내부에서 formatSdkInstall() 호출 |

---

## 📚 관련 파일

- [lib/core/sdk-commands.js](../../common/lib/core/sdk-commands.js) - installSdk() 함수
- [lib/envelope/response-formatter.js](../../common/lib/envelope/response-formatter.js) - formatSdkInstall() 함수
- [lib/envelope/envelope.js](../../common/lib/envelope/envelope.js) - Envelope 클래스
- [agents/tizen-sdk-install.md](../../common/agents/tizen-sdk-install.md) - 에이전트 정의
- [docs/INSTALLATION_FLOW.md](./INSTALLATION_FLOW.md) - 완전한 사용 시나리오

---

## 🎉 결론

```
tizen-sdk-install 에이전트
  ↓ (호출)
installSdk() ← lib/core/sdk-commands.js
  ├─ 스크립트 실행 (실제 설치)
  ├─ 결과 파싱
  └─ formatSdkInstall() ← lib/envelope/response-formatter.js
       ↓
       Standard JSON Envelope 반환
       ↓
       사용자에게 JSON 응답 표시 ✅
```

**이제 에이전트가 정확히 `installSdk()`를 호출하고, 
표준화된 JSON 응답을 받을 수 있습니다!**
