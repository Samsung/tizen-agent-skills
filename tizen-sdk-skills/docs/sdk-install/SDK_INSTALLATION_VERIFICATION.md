# SDK 설치 상태 확인 및 검증 가이드

## 📋 개요

`readSdkPath()` 함수를 확장하여 **SDK 설치 상태를 확인**하고, **이미 설치된 경우 재설치를 방지**하는 안전한 설치 절차를 구현했습니다.

---

## 🎯 핵심 요구사항

### 1️⃣ 체크 모드 먼저 실행

설치 전에 **체크 모드**로 현재 상태 확인:

```
Windows:     tizen-sdk-install.ps1 -Check
Linux/macOS: tizen-sdk-install.sh --check
```

### 2️⃣ sdk.info는 완료 마커

- **존재** → SDK 완전 설치됨 (성공)
- **없음** → SDK 미설치 또는 불완전 설치

### 3️⃣ 이미 설치되면 STOP

- 다시 설치하지 않기
- `force` 플래그 없으면 중단
- `force=true`이면 재설치 진행

### 4️⃣ 성공 판단: exit code + sdk.info

```
exit code = 0 + sdk.info 존재 → 성공 ✅
exit code ≠ 0 → 실패 ❌
수동 검증 (cat, ls, grep) → 하지 않기 ❌
```

### 5️⃣ 불필요한 수동 검증 제거

```
❌ cat sdk.info
❌ ls tools/
❌ grep sdb
❌ 반복 읽기
```

→ **스크립트 결과만 신뢰**

---

## 🔧 구현된 함수들

### 함수 1: `checkSdkInstallStatus()`

**목적**: 로컬 sdk.info 파일 확인 (빠른 확인)

```javascript
const status = checkSdkInstallStatus('/opt/tizen-studio');

// 반환값
{
  installed: true,                           // sdk.info 있음
  sdkPath: '/opt/tizen-studio',
  sdkInfoPath: '/opt/tizen-studio/sdk.info',
  message: 'SDK is already installed (sdk.info found)'
}
```

**언제 사용**: 빠른 사전 확인 필요할 때

---

### 함수 2: `checkSdkInstallationViaScript()`

**목적**: 스크립트의 체크 모드 실행

```javascript
const result = await checkSdkInstallationViaScript('/opt/tizen-studio');

// 반환값
{
  status: 'done',                      // running, done, error
  exitCode: 0,
  message: 'SDK is already installed',
  alreadyInstalled: true              // 중요!
}
```

**언제 사용**: 정확한 상태 확인 필요할 때 (권장)

**실행 방식**:
- Windows: `powershell ... -Check ...`
- Linux/macOS: `bash ... --check ...`

---

### 함수 3: `checkIfSdkAlreadyInstalled()` ⭐ 권장

**목적**: 종합 3단계 확인 절차

```javascript
const statusCheck = await checkIfSdkAlreadyInstalled(
  '/opt/tizen-studio',
  false  // force
);

// 반환값
{
  alreadyInstalled: false,              // 설치 여부
  shouldProceed: true,                  // 설치 진행 가능?
  reason: 'SDK is not installed. Ready to proceed.'
}
```

**3단계 절차**:

```
Step 1: readSdkPath()
  └─ config 파일에서 경로 읽기

Step 2: checkSdkInstallStatus()
  └─ 로컬 sdk.info 파일 확인

Step 3: checkSdkInstallationViaScript()
  └─ 스크립트 체크 모드 실행
      (정확한 상태 확인)
```

---

## 📊 통합: installSdk() 내 사용

```javascript
async function installSdk(version = '10.0', label = 'tizen', force = false) {
  try {
    const sdkPath = readSdkPath();

    if (!sdkPath) {
      return formatError(...);  // SDK 경로 미설정
    }

    // ✅ Step 1: SDK 설치 상태 확인 (3단계)
    console.error('[tizen-sdk] Checking if SDK is already installed...');
    const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);

    // ✅ Step 2: 이미 설치되었으면 STOP
    if (statusCheck.alreadyInstalled) {
      return formatError(
        'tizen-sdk sdk-install',
        'sdk_path_invalid',
        statusCheck.reason,
        'tizen-cli tizen-sdk sdk-install --force'
      );
    }

    // ✅ Step 3: 진행 불가능하면 중단
    if (!statusCheck.shouldProceed) {
      return formatError('tizen-sdk sdk-install', 'build_failed', statusCheck.reason);
    }

    // ✅ Step 4: 스크립트 실행 (실제 설치 - 3분)
    console.error(`[tizen-sdk] Installing SDK v${version}...`);
    const output = execSync(
      `powershell -ExecutionPolicy Bypass -File "tizen-sdk-install.ps1" ...`,
      { encoding: 'utf-8' }
    );

    // ✅ Step 5: 결과 파싱
    const result = JSON.parse(output);
    const packages = result.packages || [];
    const warnings = result.warnings || [];

    // ✅ Step 6: formatSdkInstall() 호출
    const envelope = formatSdkInstall(packages, warnings);

    console.error('[tizen-sdk] Installation completed successfully');
    return envelope;

  } catch (error) {
    return formatError('tizen-sdk sdk-install', 'io_error', `Failed: ${error.message}`);
  }
}
```

---

## 🎯 호출 흐름

```
installSdk('10.0', 'tizen', false)
  │
  ├─ 1. readSdkPath()
  │      └─ ~/.tizen.sdk.path.config 읽기
  │
  ├─ 2. checkIfSdkAlreadyInstalled()
  │      │
  │      ├─ 2-1. checkSdkInstallStatus()
  │      │        └─ sdk.info 파일 존재? (빠름)
  │      │
  │      └─ 2-2. checkSdkInstallationViaScript()
  │               └─ 스크립트 체크 모드 실행 (정확함)
  │
  ├─ 3. 이미 설치? → STOP (force 아니면)
  │
  ├─ 4. 진행 가능? → YES → 계속
  │
  ├─ 5. 스크립트 실행 (3분)
  │      └─ tizen-sdk-install.ps1 / .sh
  │
  ├─ 6. 결과 파싱
  │      └─ JSON 파싱
  │
  ├─ 7. formatSdkInstall()
  │      └─ Standard JSON Envelope 생성
  │
  └─ 8. return envelope
```

---

## ✅ 안전성 보장 메커니즘

### 1. 이미 설치된 경우 감지

```javascript
if (statusCheck.alreadyInstalled) {
  // STOP
  return formatError(...);
}
```

### 2. 체크 모드로 정확하게 확인

```javascript
const scriptCheckResult = await checkSdkInstallationViaScript(sdkPath);
// 스크립트가 정확한 상태 리포트
```

### 3. sdk.info를 신뢰

```
- sdk.info 있음 → 완전 설치 완료
- sdk.info 없음 → 미설치 또는 불완전
```

### 4. Force 플래그로 재설치 제어

```javascript
if (statusCheck.alreadyInstalled && !force) {
  // 중단
}

if (statusCheck.alreadyInstalled && force) {
  // 재설치 진행
}
```

### 5. 설치 중단 시에도 안전

```
설치 중단 → 재실행 시
  ├─ 체크 모드: "설치 중..."
  ├─ sdk.info 없음: "불완전 설치"
  └─ 재실행: 계속 진행 (manifest 있는 패키지 스킵)
```

---

## 📝 함수 시그니처

```javascript
// 로컬 상태 확인
function checkSdkInstallStatus(sdkPath: string): {
  installed: boolean
  sdkPath: string
  sdkInfoPath: string
  message: string
}

// 스크립트 체크 모드
async function checkSdkInstallationViaScript(sdkPath: string): {
  status: 'running' | 'done' | 'error'
  exitCode: number
  message: string
  alreadyInstalled: boolean
}

// 종합 확인 (권장)
async function checkIfSdkAlreadyInstalled(
  sdkPath: string,
  force: boolean = false
): {
  alreadyInstalled: boolean
  shouldProceed: boolean
  reason: string
}

// SDK 설치 메인
async function installSdk(
  version: string = '10.0',
  label: string = 'tizen',
  force: boolean = false
): Promise<Envelope>
```

---

## 🎁 추가 기능

### 재설치 강제하기

```javascript
const result = await installSdk('10.0', 'tizen', true);  // force=true

// 이미 설치되어도 재설치 진행
```

### 에러 처리

```javascript
const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath);

if (statusCheck.alreadyInstalled && !force) {
  return {
    status: 'error',
    message: 'SDK already installed. Use -Force to reinstall.'
  };
}
```

---

## 📚 관련 파일

- `lib/core/sdk-commands.js` - 구현
- `lib/sdk-check.test.js` - 테스트 및 설명
- `docs/SDK_INSTALLATION_VERIFICATION.md` - 이 문서

---

## ✨ 핵심 정리

```
readSdkPath() 확장으로:

1️⃣ checkSdkInstallStatus()
   → sdk.info 파일 확인 (빠름)

2️⃣ checkSdkInstallationViaScript()
   → 스크립트 체크 모드 (-Check / --check)

3️⃣ checkIfSdkAlreadyInstalled()
   → 3단계 종합 확인 (권장)

이를 통해:
✅ 이미 설치된 경우 즉시 감지
✅ 불필요한 재설치 방지
✅ sdk.info 완료 마커 신뢰
✅ 체크 모드로 정확히 확인
✅ 수동 검증 제거
✅ 설치 안전성 극대화
```

---

## 🎉 결론

**readSdkPath() 함수 확장**으로:

- ✅ SDK 설치 상태 자동 확인
- ✅ 이미 설치되면 STOP (force 아닌 경우)
- ✅ 체크 모드로 정확히 검증
- ✅ sdk.info 완료 마커 신뢰
- ✅ 설치 안전성 획기적 향상

**안전하고 멱등성 있는 SDK 설치가 완성되었습니다!** 🎉
