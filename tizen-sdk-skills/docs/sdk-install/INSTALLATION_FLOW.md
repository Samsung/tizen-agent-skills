# 자연어로 SDK 설치하고 JSON 응답 받기

[English](INSTALLATION_FLOW.en.md) | 한국어

## 📋 전체 시나리오

사용자가 자연어로 SDK 설치를 요청하고, 최종적으로 **Standard JSON Envelope 형식**의 응답을 받는 **완전한 흐름**입니다.

---

## 🎯 사용자 입력부터 JSON 응답까지

### Step 1️⃣: 사용자 자연어 입력

```
사용자: "Tizen SDK 10.0 설치해줄 수 있어?"
```

요청에 10.0이 들어 있으므로 에이전트는 이 버전을 러너에 넘깁니다(`node sdk-install-cli.js 10.0`). 버전이 없으면 러너는 `""`를 받고, 설치 스크립트는 저장소가 제공하는 최신 플랫폼을 설치하며 `Tizen SDK Tools`에도 그 버전이 붙습니다.


---

### Step 2️⃣: 에이전트 자동 선택

Claude Code, Codex, Gemini CLI는 `tizen-sdk-install` 에이전트를 선택하여 실행합니다. Cline에는 에이전트 기능이 없어서 메인 에이전트가 `tizen-sdk-install` 스킬을 직접 불러오며, 이후 단계는 어느 쪽이든 같습니다.

```markdown
---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, ...
---

사용자 요청을 분석합니다...
```

---

### Step 3️⃣: 에이전트가 러너를 실행하고, 러너가 installSdk() 호출

```javascript
// 에이전트가 `node sdk-install-cli.js 10.0`으로 실행하는 러너 sdk-install-cli.js 내부
const { installSdk } = require('../core/sdk-commands');

const result = await installSdk('10.0', 'tizen');  // '10.0' = 첫 번째 위치 인자
// cli-runner.js가 result를 JSON으로 출력 (Step 7)
```

**이 시점이 중요합니다:**
- 에이전트는 `sdk-install-cli.js` 러너를 실행하고, 러너가 `installSdk()`를 호출합니다
- `installSdk()`는 **사전 점검**을 하고 결과 Envelope를 만듭니다. 설치 자체는 별도의 백그라운드 명령(Phase 2)이며, 설치가 끝나면 에이전트가 `installSdk()`를 다시 호출합니다(Phase 3)

---

### Step 4️⃣: installSdk() 함수 실행

```javascript
// lib/core/sdk-commands.js의 installSdk() 함수 (lib/core/sdk.js에서 다시 내보냄)

async function installSdk(version = '', label = 'tizen', force = false, repoUrl = '', command = 'tizen-sdk sdk-install') {  // '' = 최신 플랫폼

  // 4-0️⃣ 버전 형식 확인이 먼저 (X.Y, 아니면 invalid_argument). 사용자 지정 저장소면 위임
  const versionCheck = validateTizenVersion(version);
  if (versionCheck.error) return formatError(command, 'invalid_argument', versionCheck.error);
  if (repoUrl) return installSdkFromRepo(repoUrl, version, force);

  try {
    // 4-1️⃣ Node.js 확인
    const nodeCheck = await checkNode();
    if (nodeCheck.status !== 'success') {
      return nodeCheck;  // node_not_found / node_version_unsupported — 설치 안내와 함께 중단
    }

    // 4-2️⃣ SDK가 이미 설치되어 있는지 확인
    const sdkPath = readSdkPath();
    const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);
    if (statusCheck.alreadyInstalled) {
      const missing = requestedPlatformMissing(sdkPath, version, command, startTime);
      if (missing) return missing;  // 요청한 버전이 설치되지 않음: platform_version_not_found
      const packages = installedPackageSummary(sdkPath, version);
      return formatSdkInstall(packages, warnings, startTime, command);  // 성공
    }

    // 4-3️⃣ 디스크 공간 확인 (15 GB, 사용자 홈 드라이브)
    const diskCheck = await checkDiskSpace(os.homedir(), 15);
    if (diskCheck.status !== 'success') {
      return diskCheck;  // insufficient_disk_space — 설치 중단
    }

    // 4-4️⃣ Phase 2(백그라운드 설치)용 설치 명령 반환
    return formatError(
      command,
      'execution_error',
      'SDK is NOT installed. This pre-check CLI cannot install it (10-15 min job). ' +
        harnessGuidance('detach') +   // 'Run the suggested_fix command per your harness: …'
        sdkPrecheckRerunHint('…'),    // 같은 버전으로, --force 없이 재실행하라는 안내
      installerCommand,   // suggested_fix: { command, background_command }
      startTime
    );
  } catch (error) {
    return formatError(command, 'io_error', `Failed to install SDK: ${error.message}`);
  }
}
```

**Node.js 확인:**
- 러너를 실행 중인 인터프리터(`process.version` / `process.execPath`)를 Node.js 설치의 증거로 사용합니다. `where node` / `which node`는 PATH 경고만 추가합니다(issue #71: 샌드박스의 자식 PATH 때문에 node_not_found가 나와서는 안 됨).
- Node.js 22 이상이 필요합니다(v18–v21은 경고만, v18 미만은 `node_version_unsupported`로 실패).

**디스크 공간 확인:**
- 사용자 홈 디렉터리가 있는 드라이브만 확인하며, 최소 15 GB가 필요합니다.
- 부족하면 현재 여유 공간, 필요한 공간, 부족한 양을 담은 에러를 반환하고, 충분하면 Phase 2용 설치 명령을 반환합니다.

**사용자 지정 저장소 URL:** 저장소 URL이 주어지면(`installSdkFromRepo()` / `--repo-url` / `-RepoUrl`) 타임존 기반 CDN 미러 선택을 건너뛰고, `pkg_list`부터 모든 패키지를 해당 URL에서 내려받습니다. URL은 사전 체크 초반에 검증되며 `pkg_list_{OS}-64` 또는 `pkg_list_{OS}-32`를 제공하지 않으면 아무것도 다운로드하지 않고 설치를 거부합니다. 이 URL이 `{SDK_PATH}/.package/repository.info`에 기록되므로 이후 패키지 업데이트와 에뮬레이터 패키지도 같은 저장소를 사용합니다. 자세한 내용은 [CUSTOM_REPOSITORY_INSTALL.md](CUSTOM_REPOSITORY_INSTALL.md)를 참조하세요.

---

### Step 5️⃣: formatSdkInstall() 호출

```javascript
// lib/envelope/response-formatter.js의 formatSdkInstall()

function formatSdkInstall(packages, warnings = [], startTime, command = 'tizen-sdk sdk-install') {
  const envelope = new Envelope(command);
  if (typeof startTime === 'number') envelope.startTime = startTime;  // duration_ms from the CLI start
  
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

Phase 2가 백그라운드에서 SDK를 설치하고 나면, 에이전트는 같은 `installSdk('10.0', 'tizen')` 사전 점검을 같은 버전으로, `--force` 없이 다시 실행합니다. 이번에는 이미 설치된 경우의 분기(Step 4)를 타고 성공 Envelope를 돌려줍니다. SDK는 기본 경로 `~/tizen-sdk`에 설치되었고, `Tizen SDK Tools`에는 요청한 버전 `10.0`이 붙습니다:

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

### Step 7️⃣: stdout으로 출력

```javascript
// cli-runner.js (sdk-install-cli.js 등 CLI 러너가 공유)
process.stdout.write(JSON.stringify(withUserCommand(envelope), null, 2) + "\n");
// ↑ command 바로 뒤에 user_command를 넣어 stdout으로 출력
```

---

### Step 8️⃣: 사용자에게 결과 표시

응답은 [`tizen-sdk-install/SKILL.md`](../../common/skills/tizen-sdk-install/SKILL.md)의 "결과 보고"
규칙을 따릅니다. 위 Envelope JSON을 수정 없이 fenced `json` 블록에 먼저 싣고, 그 아래 1~2줄 요약에서
플랫폼을 상태별로 묶어 모든 버전을 한 줄에 적습니다.

```
<Step 6의 Envelope JSON을 그대로 ```json 블록에>

SDK 설치 완료 (installation_status: completed).
플랫폼 — installed: 10.0 · not_installed: 9.0
```

---

## 🔄 완전한 흐름도

```
사용자: "Tizen SDK 10.0 설치해줄 수 있어?"
  │
  ▼
tizen-sdk-install 에이전트 (Claude Code / Codex / Gemini CLI) 또는 스킬 (Cline, 메인 에이전트에서)
  │
  ├─ Phase 1 — 사전 점검
  │    node sdk-install-cli.js 10.0  →  installSdk('10.0', 'tizen')
  │      버전 형식 → Node.js 확인 → 이미 설치됨? (아니오) → 디스크 공간 (15 GB)
  │    ← 실패 Envelope (execution_error), suggested_fix.command에 설치 명령
  │
  ├─ Phase 2 — 백그라운드 설치 (10–15분, 약 121개 패키지)
  │    하네스가 suggested_fix 실행 — tizen-sdk-install.sh --path "<sdk>" --platform "10.0" --download-jobs 4
  │    (PowerShell: tizen-sdk-install.ps1 -Path "<sdk>" -Platform "10.0" -DownloadJobs 4):
  │      Claude Code: command를 run_in_background로, 작업 완료 알림에서 재개
  │      Cline 등 완료 알림이 없는 호스트: command에 --detach / -Detach, --status / -Status로 확인
  │      Codex: background_command (job-cli.js 작업), job-cli.js wait로 확인
  │    설치 스크립트가 sdk.info와 ~/.tizen.sdk.path.config 기록
  │
  └─ Phase 3 — 같은 사전 점검을 다시 실행
       node sdk-install-cli.js 10.0  →  installSdk('10.0', 'tizen')
         이미 설치됨 → installedPackageSummary() → formatSdkInstall()
       ← 성공 Envelope (Step 6)
  │
  ▼
사용자에게 응답: Envelope JSON, 그 아래 1~2줄 요약 (Step 8)
```

---

## 📊 시간 흐름

```
t=0s          사용자 입력, 에이전트 시작
t≈1s          Phase 1: installSdk() 사전 점검
t≈2s            ← 설치 명령이 담긴 execution_error Envelope
t≈2s          Phase 2: 설치 스크립트가 백그라운드에서 실행
t≈10–15분       ← 설치 스크립트 종료 코드 0 (sdk.info 기록)
              Phase 3: installSdk() 사전 점검 재실행
  + ≈2s         ← 성공 Envelope (installation_status: completed)
              사용자에게 응답
```

---

## 🎯 핵심 포인트

### formatSdkInstall() 호출 위치

```javascript
// lib/core/sdk-commands.js의 installSdk() 함수 내부 (이미 설치된 경우의 분기)

const packages = installedPackageSummary(sdkPath, version);  // 버전별 항목

// ✅ 여기서 formatSdkInstall() 호출!
return formatSdkInstall(packages, warnings, startTime);  // Standard JSON Envelope 반환
```

### 왜 installSdk()를 만들었나?

```
formatSdkInstall()
  ↑
  │ (호출)
  │
installSdk()
  ↑
  │ (sdk-install-cli.js 러너가 호출, 에이전트는 러너를 실행)
  │
tizen-sdk-install 에이전트
  ↑
  │ (사용자 요청)
  │
사용자
```

**연결고리가 필요했기 때문입니다!**

- `formatSdkInstall()` 혼자로는 아무것도 할 수 없음 (포맷팅만 가능)
- `installSdk()`는 **사전 점검을 담당**: SDK가 없으면 설치 명령을 반환하고, 설치되어 있으면 `installedPackageSummary()`로 `result.packages`를 만든 뒤 `formatSdkInstall()`을 호출
- 에이전트가 `sdk-install-cli.js` 러너를 실행하고, 러너가 `installSdk()`를 호출하여 전체 흐름 연결

---

## 📝 코드 요약

```javascript
// ===== 호출자 =====
// sdk-install-cli.js (에이전트가 `node sdk-install-cli.js 10.0`으로 실행)
const { installSdk } = require('../core/sdk-commands');
const result = await installSdk('10.0');
// cli-runner.js가 withUserCommand(result)를 JSON으로 출력

// ===== installSdk() (lib/core/sdk-commands.js) =====
async function installSdk(version) {
  // 0. 버전 형식 확인, --repo-url이면 installSdkFromRepo()로 위임
  // 1. Node.js 확인
  // 2. 이미 설치됨? → 버전별 패키지 목록, 그리고 formatSdkInstall() 호출 ← 여기!
  if (alreadyInstalled) {
    return formatSdkInstall(installedPackageSummary(sdkPath, version), warnings);
  }
  // 3. 디스크 공간 확인
  // 4. 미설치: 설치 명령 반환 (Phase 2에서 백그라운드로 실행)
  return formatError('tizen-sdk sdk-install', 'execution_error', 'SDK is NOT installed…', installerCommand);
}

// ===== formatSdkInstall() (lib/envelope/response-formatter.js) =====
function formatSdkInstall(packages, warnings = [], startTime, command = 'tizen-sdk sdk-install') {
  const envelope = new Envelope(command);
  if (typeof startTime === 'number') envelope.startTime = startTime;
  return envelope.success({
    packages,
    installation_status: 'completed',
  }, { warnings });
}

// ===== Envelope.success() (lib/envelope/envelope.js) =====
success(result, options) {
  return {
    status: 'success',
    result,
    warnings: options.warnings || [],
    errors: [],
    command: this.command,
    duration_ms: Date.now() - this.startTime,
  };
}
```

---

## 🎁 답변 요약

| 단계 | 항목 | 설명 |
|------|------|------|
| 1 | 사용자 입력 | "Tizen SDK 10.0 설치해줄 수 있어?" (자연어) |
| 2 | 에이전트 선택 | tizen-sdk-install |
| 3 | **installSdk() 호출** (Phase 1) | 사전 점검, 설치 명령 반환 |
| 4 | 설치 (Phase 2) | 백그라운드 설치 스크립트 (10–15분) |
| 5 | installSdk() 재호출 (Phase 3) | 이미 설치된 경우의 분기 |
| 6 | **formatSdkInstall() 호출** | ← installSdk() 내부에서 `installedPackageSummary()`와 함께 호출 |
| 7 | Standard JSON Envelope | 자동으로 생성됨 |
| 8 | 사용자에게 표시 | Envelope JSON + 1~2줄 요약 |

---

## ✅ 결론

```
formatSdkInstall()은 어디서 호출되나?
  → lib/core/sdk-commands.js의 installSdk() 함수 내부에서 호출됨

어떤 데이터를 받나?
  → installedPackageSummary()의 result.packages와, 이미 설치된 경우 분기의
    warnings (백그라운드 설치 후 Phase 3)

뭘 반환하나?
  → Standard JSON Envelope (status, result, duration_ms 포함)

사용자는 뭘 받나?
  → 표준화된 JSON 응답
```

**이제 자연어 입력부터 JSON 응답까지 완전한 흐름이 구성되었습니다!** 🎉
