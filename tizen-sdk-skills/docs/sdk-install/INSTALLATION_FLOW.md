# 자연어로 SDK 설치하고 JSON 응답 받기

## 📋 전체 시나리오

사용자가 자연어로 SDK 설치를 요청하고, 최종적으로 **Standard JSON Envelope 형식**의 응답을 받는 **완전한 흐름**입니다.

---

## 🎯 사용자 입력부터 JSON 응답까지

### Step 1️⃣: 사용자 자연어 입력

```
사용자: "Tizen SDK를 /opt/tizen-studio에 설치해줄 수 있어?"
```

Cline가 이 요청을 인식합니다.

---

### Step 2️⃣: 에이전트 자동 선택

Cline가 자동으로 `tizen-sdk-install` 에이전트를 선택하여 실행합니다.

```markdown
---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, ...
---

사용자 요청을 분석합니다...
```

---

### Step 3️⃣: 에이전트가 installSdk() 호출

```javascript
// tizen-sdk-install 에이전트 내부
const { installSdk } = require('../lib/core/sdk-commands');

const result = await installSdk('10.0', 'tizen');
console.log(JSON.stringify(result));  // JSON Envelope 출력
```

**이 시점이 중요합니다:**
- 에이전트는 `installSdk()` 함수를 호출
- `installSdk()` 함수가 **모든 작업을 담당**

---

### Step 4️⃣: installSdk() 함수 실행

```javascript
// lib/core/sdk-commands.js의 installSdk() 함수

async function installSdk(version = '10.0', label = 'tizen') {
  
  // 4-1️⃣ SDK 경로 확인
  const sdkPath = readSdkPath();
  if (!sdkPath) {
    return formatError(...)  // 에러 응답
  }
  
  // 4-2️⃣ 스크립트 실행 (실제 설치 - 3분)
  const output = execSync(
    `powershell -ExecutionPolicy Bypass -File "tizen-sdk-install.ps1" ...`,
    { encoding: 'utf-8' }
  );
  
  // 4-3️⃣ 결과 파싱 (< 1ms)
  const result = JSON.parse(output);
  const packages = result.packages || [];
  const warnings = result.warnings || [];
  
  // 4-4️⃣ formatSdkInstall() 호출 ⭐ (여기서 JSON 포맷팅!)
  const envelope = formatSdkInstall(packages, warnings);
  
  // 4-5️⃣ Standard JSON Envelope 반환
  return envelope;
}
```

**사용자 지정 저장소 URL:** 저장소 URL이 주어지면(`installSdkFromRepo()` / `--repo-url` / `-RepoUrl`) 타임존 기반 CDN 미러 선택을 건너뛰고, `pkg_list`부터 모든 패키지를 해당 URL에서 내려받습니다. URL은 사전 체크 초반에 검증되며 `pkg_list_{OS}-64` 또는 `pkg_list_{OS}-32`를 제공하지 않으면 아무것도 다운로드하지 않고 설치를 거부합니다. 이 URL이 `{SDK_PATH}/.package/repository.info`에 기록되므로 이후 패키지 업데이트와 에뮬레이터 패키지도 같은 저장소를 사용합니다. 자세한 내용은 [CUSTOM_REPOSITORY_INSTALL.md](CUSTOM_REPOSITORY_INSTALL.md)를 참조하세요.

---

### Step 5️⃣: formatSdkInstall() 호출

```javascript
// lib/envelope/response-formatter.js의 formatSdkInstall()

function formatSdkInstall(packages, warnings = []) {
  const envelope = new Envelope('tizen-sdk sdk-install');
  
  return envelope.success(
    {
      packages: packages || [],
      installation_status: 'completed',
    },
    { warnings }
  );
  // ↑ Standard JSON Envelope 반환
}
```

---

### Step 6️⃣: Standard JSON Envelope 생성

```javascript
// Envelope.success()에서 자동으로 생성
{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 185000,              // 3분 5초 (스크립트 + 포맷팅)
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

### Step 7️⃣: stdout으로 출력

```javascript
console.log(JSON.stringify(envelope));
// ↑ JSON을 stdout으로 출력
```

---

### Step 8️⃣: 사용자에게 결과 표시

Cline / Chat 인터페이스가 JSON을 파싱하여 사용자에게 표시합니다.

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

[JSON 응답 보기]
```

---

## 🔄 완전한 흐름도

```
┌─────────────────────────────────────────────┐
│ 사용자: "SDK를 설치해줄래?"                 │
│ (자연어 입력)                               │
└────────────────┬──────────────────────────┘
                 │
         ┌───────▼────────┐
         │ Cline   │
         │ 에이전트 선택  │
         └───────┬────────┘
                 │
         ┌───────▼──────────────────────┐
         │ tizen-sdk-install 에이전트   │
         │ (자연어 파싱)                │
         └───────┬──────────────────────┘
                 │
         ┌───────▼──────────────────────────────┐
         │ installSdk('10.0', 'tizen')          │  ⭐ 핵심!
         │ (lib/core/sdk-commands.js)                │
         │                                      │
         │ 1. readSdkPath() - 경로 확인        │
         │ 2. execSync() - 스크립트 실행       │ (3분)
         │ 3. JSON.parse() - 결과 파싱         │
         │ 4. formatSdkInstall() - JSON 포맷팅 │ ⭐ 여기서 호출!
         │ 5. return envelope                   │
         └───────┬──────────────────────────────┘
                 │
         ┌───────▼──────────────────────┐
         │ formatSdkInstall()           │
         │ (lib/envelope/response-formatter.js)  │
         │                              │
         │ return envelope.success()    │
         │ (Standard JSON Envelope 생성)│
         └───────┬──────────────────────┘
                 │
         ┌───────▼──────────────────────┐
         │ Standard JSON Envelope       │
         │ {                            │
         │   "command": "...",          │
         │   "status": "success",       │
         │   "duration_ms": 185000,     │
         │   "result": {...},           │
         │   "warnings": [...],         │
         │   "errors": []               │
         │ }                            │
         └───────┬──────────────────────┘
                 │
         ┌───────▼──────────────────────┐
         │ stdout에 JSON 출력           │
         │ console.log(JSON.stringify())│
         └───────┬──────────────────────┘
                 │
         ┌───────▼──────────────────────┐
         │ 사용자에게 결과 표시         │
         │ (JSON 파싱 후 UI 표시)       │
         └──────────────────────────────┘
```

---

## 📊 시간 흐름

```
t=0s      사용자 입력
  │
  ├─ t=1s     에이전트 시작
  │
  ├─ t=5s     installSdk() 호출
  │  │
  │  ├─ t=10s    스크립트 실행 시작
  │  │
  │  ├─ t=70s    다운로드 완료 (1분)
  │  │
  │  ├─ t=185s   설치 완료 (3분 5초)
  │  │
  │  ├─ t=186s   JSON 파싱 (< 1ms)
  │  │
  │  └─ t=187s   formatSdkInstall() 호출 (< 1ms)
  │
  ├─ t=188s   Standard JSON Envelope 생성
  │
  └─ t=189s   사용자에게 결과 표시
```

---

## 🎯 핵심 포인트

### formatSdkInstall() 호출 위치

```javascript
// lib/core/sdk-commands.js의 installSdk() 함수 내부

// ... 스크립트 실행, 결과 파싱 ...

// ✅ 여기서 formatSdkInstall() 호출!
const envelope = formatSdkInstall(packages, warnings);

return envelope;  // Standard JSON Envelope 반환
```

### 왜 installSdk()를 만들었나?

```
formatSdkInstall()
  ↑
  │ (호출)
  │
installSdk()
  ↑
  │ (에이전트 호출)
  │
tizen-sdk-install 에이전트
  ↑
  │ (사용자 요청)
  │
사용자
```

**연결고리가 필요했기 때문입니다!**

- `formatSdkInstall()` 혼자로는 아무것도 할 수 없음 (포맷팅만 가능)
- `installSdk()`가 **실제 작업을 담당**하고, 중간에 `formatSdkInstall()`을 호출
- 에이전트가 `installSdk()`를 호출하여 전체 흐름 연결

---

## 📝 코드 요약

```javascript
// ===== 호출자 =====
// tizen-sdk-install 에이전트
const { installSdk } = require('./lib/core/sdk-commands');
const result = await installSdk('10.0');
console.log(JSON.stringify(result));

// ===== installSdk() (lib/core/sdk-commands.js) =====
async function installSdk(version) {
  // 1. 검증
  // 2. 스크립트 실행 (실제 설치)
  // 3. 결과 파싱
  // 4. formatSdkInstall() 호출 ← 여기!
  return formatSdkInstall(packages, warnings);
}

// ===== formatSdkInstall() (lib/envelope/response-formatter.js) =====
function formatSdkInstall(packages, warnings) {
  const envelope = new Envelope('tizen-sdk sdk-install');
  return envelope.success({
    packages,
    installation_status: 'completed',
  }, { warnings });
}

// ===== Envelope.success() (lib/envelope/envelope.js) =====
success(result, options) {
  return {
    command: this.command,
    status: 'success',
    duration_ms: Date.now() - this.startTime,
    result,
    warnings: options.warnings || [],
    errors: [],
  };
}
```

---

## 🎁 답변 요약

| 단계 | 항목 | 설명 |
|------|------|------|
| 1 | 사용자 입력 | "SDK 설치해줄래?" (자연어) |
| 2 | 에이전트 선택 | tizen-sdk-install |
| 3 | **installSdk() 호출** | ← 여기서 호출! |
| 4 | 스크립트 실행 | 실제 설치 (3분) |
| 5 | 결과 파싱 | JSON 파싱 |
| 6 | **formatSdkInstall() 호출** | ← installSdk() 내부에서 호출! |
| 7 | Standard JSON Envelope | 자동으로 생성됨 |
| 8 | 사용자에게 표시 | JSON 형식 응답 |

---

## ✅ 결론

```
formatSdkInstall()은 어디서 호출되나?
  → lib/core/sdk-commands.js의 installSdk() 함수 내부에서 호출됨

어떤 데이터를 받나?
  → 스크립트 실행 결과 (packages, warnings)

뭘 반환하나?
  → Standard JSON Envelope (status, result, duration_ms 포함)

사용자는 뭘 받나?
  → 표준화된 JSON 응답
```

**이제 자연어 입력부터 JSON 응답까지 완전한 흐름이 구성되었습니다!** 🎉
