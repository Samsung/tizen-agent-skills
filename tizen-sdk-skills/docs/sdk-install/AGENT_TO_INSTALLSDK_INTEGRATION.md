# tizen-sdk-install 에이전트와 installSdk() 통합 가이드

[English](AGENT_TO_INSTALLSDK_INTEGRATION.en.md) | 한국어

## 📋 개요

`tizen-sdk-install` 에이전트가 **`lib/core/sdk-commands.js`의 `installSdk()` 함수를 호출**하여 Standard JSON Envelope 형식의 응답을 반환하는 방식을 설명합니다.

---

## ✅ 호출 흐름

### Step 1: 사용자 자연어 입력

```
사용자: "Tizen SDK 10.0을 설치해줄래?"
```

요청에 10.0이 들어 있으므로 에이전트는 이 버전을 러너에 넘깁니다(`node sdk-install-cli.js 10.0`). 버전이 없으면 러너는 `""`를 받고, 설치 스크립트는 저장소가 제공하는 최신 플랫폼을 설치하며 `Tizen SDK Tools`에도 그 버전이 붙습니다.

---

### Step 2: 호스트가 에이전트 선택

Claude Code, Codex, Gemini CLI는 이 요청을 `tizen-sdk-install` 에이전트에 넘깁니다. Cline에는 에이전트 기능이 없어서 메인 에이전트가 `tizen-sdk-install` 스킬을 직접 실행하며, 이후 단계는 어느 쪽이든 같습니다.

```
agents/tizen-sdk-install.md → 실행
```

---

### Step 3: 에이전트가 러너를 실행하고, 러너가 installSdk() 호출

```javascript
// 에이전트가 `node sdk-install-cli.js 10.0`으로 실행하는 러너 sdk-install-cli.js 내부

const { installSdk } = require('../core/sdk-commands');

// 에이전트가 요청에서 만든 명령줄의 인자
const version = '10.0';   // 첫 번째 위치 인자
const label = 'tizen';     // 기본값 또는 두 번째 위치 인자

// ✅ installSdk() 호출 (여기서 호출!)
const result = await installSdk(version, label);

// cli-runner.js가 result를 JSON으로 출력 (Step 7)
```

---

### Step 4: installSdk() 실행

```javascript
// lib/core/sdk-commands.js의 installSdk() 함수

async function installSdk(version = '', label = 'tizen', force = false, repoUrl = '', command = 'tizen-sdk sdk-install') {  // '' = 최신 플랫폼

  // 4-0️⃣ 버전 형식 확인이 먼저 (X.Y, 아니면 invalid_argument). 사용자 지정 저장소면 위임
  const versionCheck = validateTizenVersion(version);
  if (versionCheck.error) return formatError(command, 'invalid_argument', versionCheck.error);
  if (repoUrl) return installSdkFromRepo(repoUrl, version, force);

  // 4-1️⃣ Node.js 확인
  const nodeCheck = await checkNode();
  if (nodeCheck.status !== 'success') {
    return nodeCheck;  // node_not_found 에러 — 설치 안내와 함께 중단
  }

  // 4-2️⃣ SDK가 이미 설치되어 있는지 확인
  const sdkPath = readSdkPath();
  const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);
  if (statusCheck.alreadyInstalled) {
    const missing = requestedPlatformMissing(sdkPath, version, command, startTime);
    if (missing) return missing;  // 요청한 버전이 설치되지 않음: platform_version_not_found
    const packages = installedPackageSummary(sdkPath, version);
    return formatSdkInstall(packages, warnings, startTime);  // 성공
  }

  // 4-3️⃣ 디스크 공간 확인 (15 GB, 사용자 홈 드라이브)
  const diskCheck = await checkDiskSpace(os.homedir(), 15);
  if (diskCheck.status !== 'success') {
    return diskCheck;  // insufficient_disk_space 에러 — 설치 중단
  }

  // 4-4️⃣ Phase 2(백그라운드 설치)용 설치 명령 반환
  return formatError(
    'tizen-sdk sdk-install',
    'execution_error',
    'SDK is NOT installed. This pre-check CLI cannot install it (10-15 min job). ' +
      harnessGuidance('detach') + '…',   // 'Run the suggested_fix command per your harness: …'
    installerCommand,   // suggested_fix: { command, background_command }
    startTime
  );
}
```

**Node.js 확인:**
- 러너를 실행 중인 인터프리터(`process.version` / `process.execPath`)를 Node.js 설치의 증거로 사용합니다. `where node` / `which node`는 PATH 경고만 추가합니다(issue #71: 샌드박스의 자식 PATH 때문에 node_not_found가 나와서는 안 됨).
- Node.js 22 이상이 필요합니다(v18–v21은 경고만, v18 미만은 `node_version_unsupported`로 실패).

**디스크 공간 확인:**
- 사용자 홈 디렉터리가 있는 드라이브만 확인하며, 최소 15 GB가 필요합니다.
- 부족하면 현재 여유 공간, 필요한 공간, 부족한 양을 담은 에러를 반환하고, 충분하면 Phase 2용 설치 명령을 반환합니다.

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

Phase 2가 백그라운드에서 SDK를 설치하고 나면, 에이전트는 같은 `installSdk('10.0', 'tizen')` 사전 점검을 다시 실행합니다. 이번에는 이미 설치된 경우의 분기(Step 4)를 타고 성공 Envelope를 돌려줍니다. SDK는 기본 경로 `~/tizen-sdk`에 설치되었고, `Tizen SDK Tools`에는 요청한 버전 `10.0`이 붙습니다:

```json
{
  "status": "success",
  "result": {
    "packages": [
      { "name": "Tizen Platform 9.0", "status": "not_installed", "version": "9.0", "profiles": [] },
      { "name": "Tizen Platform 10.0", "status": "installed", "version": "10.0", "profiles": ["tizen"] },
      { "name": "Tizen SDK Tools", "status": "installed", "version": "10.0" }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "SDK installation verified at /home/user/tizen-sdk (sdk.info found). To force a reinstall, run with --force (script flag: -Force)."
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "user_command": "node sdk-install-cli.js 10.0",
  "duration_ms": 12
}
```

`result.packages`에는 `platforms/tizen-X.Y`마다 `platform-install --list`와 같은 `status`와 실제 내용이 있는 `profiles`를 가진 `Tizen Platform X.Y` 항목이 있고, 마지막에 `Tizen SDK Tools`가 옵니다. 이 항목의 `version`은 라벨(요청한 플랫폼 버전, 없으면 설치된 최신 버전)이며 SDK 버전이 아닙니다.

`installSdk('10.0')`이면 설치 스크립트는 `TIZEN-10.0`과 그 에뮬레이터 패키지(프로필 `tizen`)를 설치합니다. 기본 SDK는 이전 API 버전의 공유 `common` 데이터도 함께 넣는데, 이 디렉터리에는 플랫폼 내용이 없으므로 `not_installed`로 나옵니다(여기서는 9.0만 표시).

---

### Step 7: stdout으로 출력

```javascript
// cli-runner.js (sdk-install-cli.js 등 CLI 러너가 공유)
process.stdout.write(JSON.stringify(withUserCommand(envelope), null, 2) + "\n");
// ↑ command 바로 뒤에 user_command를 넣어 stdout으로 출력
```

---

### Step 8: 사용자에게 결과 표시

응답은 [`tizen-sdk-install/SKILL.md`](../../common/skills/tizen-sdk-install/SKILL.md)의 "결과 보고"
규칙을 따릅니다. 위 Envelope JSON을 수정 없이 fenced `json` 블록에 먼저 싣고, 그 아래 1~2줄 요약에서
플랫폼을 상태별로 묶어 모든 버전을 한 줄에 적습니다.

```
<Step 6의 Envelope JSON을 그대로 ```json 블록에>

SDK 설치 완료 (installation_status: completed).
플랫폼 — installed: 10.0 · not_installed: 9.0
```

---

## 📊 완전한 호출 체인

```
사용자: "Tizen SDK 10.0을 설치해줄래?"
  │
  ▼
tizen-sdk-install 에이전트
  │
  ├─ Phase 1: node sdk-install-cli.js 10.0
  │    installSdk('10.0', 'tizen')      ← 호출자: CLI 러너
  │      버전 형식 → Node.js 확인 → 이미 설치됨? (아니오) → 디스크 공간
  │    ← execution_error Envelope, suggested_fix.command = 설치 명령
  │
  ├─ Phase 2: 백그라운드 설치 (10–15분) — Claude Code는 suggested_fix.command를
  │    run_in_background로 실행, Cline 등 완료 알림이 없는 호스트는 --detach / -Detach로
  │    실행하고 --status / -Status로 확인, Codex는 suggested_fix.background_command(job-cli.js) 실행
  │
  └─ Phase 3: node sdk-install-cli.js 10.0 재실행
       installSdk('10.0', 'tizen')
         이미 설치됨
         → installedPackageSummary(sdkPath, '10.0')
         → formatSdkInstall(packages, warnings)   ← 호출 (내부)
         → envelope.success()
       ← stdout에 Standard JSON Envelope
  │
  ▼
사용자에게 표시 (Envelope JSON + 1~2줄 요약)
```

---

## 🎯 역할별 책임

| 구성 요소 | 책임 | 위치 |
|----------|------|------|
| **사용자** | 자연어 요청 | - |
| **tizen-sdk-install 에이전트** | 요청 파싱, 사전 점검 실행, 백그라운드 설치, 사전 점검 재실행 | agents/ |
| **installSdk()** | 사전 점검: 설치 명령을 반환하거나, `result.packages`(`installedPackageSummary()`)를 만들어 `formatSdkInstall()` 호출 | lib/core/sdk-commands.js |
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

// 에이전트는 `node sdk-install-cli.js <버전>`을 실행하고, 아래 require는 그 러너 안에 있습니다
const { installSdk } = require('../core/sdk-commands');

## 구현 스텝

### 1. 사용자 요청 파싱

요청에서 SDK 버전과 레이블을 추출합니다.

```

### 2. installSdk() 호출

실제로는 에이전트가 `node sdk-install-cli.js <버전>`을 실행하고, 아래 호출은 그 러너 안에서 일어납니다.

```javascript
const version = extractVersion(userRequest);  // "10.0" 등
const label = extractLabel(userRequest);      // "tizen" 등

// ✅ installSdk() 호출
const result = await installSdk(version, label);

// JSON으로 출력
console.log(JSON.stringify(result));
```

### 3. 결과는 자동으로 Standard JSON Envelope

installSdk()는 어느 경우든 Standard JSON Envelope를 반환합니다. SDK가 없으면 설치 명령이 담긴
실패 Envelope를, 설치되어 있으면 formatSdkInstall()이 만든 성공 Envelope를 돌려줍니다.

```javascript
{
  "command": "tizen-sdk sdk-install",
  "status": "success",
  "duration_ms": 12,
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
  ├─ Node.js child_process (점검, 사용자 지정 저장소면 URL 확인. 설치 스크립트는
  │   직접 설치하는 pkg 컴파일 tizen-cli에서만 여기서 실행됩니다)
  │
  └─ fs (파일 I/O)
```

---

## 🎁 최종 정리

| 질문 | 답변 |
|------|------|
| **누가 installSdk()를 호출하나?** | 에이전트(Cline에서는 스킬)가 실행하는 `sdk-install-cli.js` 러너 |
| **어디서 호출하나?** | `common/lib/cli/sdk-install-cli.js`에서 |
| **어떻게 호출하나?** | 러너 `node sdk-install-cli.js 10.0`로, 백그라운드 설치 전후에 한 번씩 |
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
  ↓ (node sdk-install-cli.js 10.0 실행, 러너가 호출)
installSdk() ← lib/core/sdk-commands.js
  ├─ Phase 1: 사전 점검 → 설치 명령 (Phase 2에서 백그라운드로 실행)
  └─ Phase 3: 이미 설치됨 → installedPackageSummary()
       └─ formatSdkInstall() ← lib/envelope/response-formatter.js
       ↓
       Standard JSON Envelope 반환
       ↓
       사용자에게 JSON 응답 표시 ✅
```

**이제 에이전트가 정확히 `installSdk()`를 호출하고, 
표준화된 JSON 응답을 받을 수 있습니다!**
