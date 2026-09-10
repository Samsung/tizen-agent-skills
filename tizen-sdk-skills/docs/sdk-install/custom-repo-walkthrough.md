# 시나리오 가이드: 커스텀 저장소 URL 로 Tizen SDK 설치하기

이 문서는 기본 public CDN 미러 대신 **커스텀 저장소 URL**에서 Tizen SDK 를 설치하는 방법을 안내합니다. 사내 미러, 빌드 서버 산출물, 팀 미러, 또는 로컬 HTTP 서버에서 설치할 때 사용합니다.

각 단계는 **자연어로 Claude 에게 말하기만 하면** 자동으로 실행됩니다 — 외울 명령어는 없습니다.

> 💡 **커스텀 저장소를 사용하는 이유:**
> - 사내 네트워크에서 더 빠른 다운로드를 위한 사내 미러
> - 최신 패키지를 위한 빌드 서버 산출물
> - 조직 전체의 일관된 패키지 버전을 위한 팀 미러
> - 오프라인/에어갭 환경을 위한 로컬 HTTP 서버
> - public CDN 에서 사용할 수 없는 특정 패키지 버전

---

## 0. 시작 전 준비사항

- **플러그인 설치됨**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (아직이라면 [README.md](../README.md) 의 "Cline 플러그인 설치" 참조)
- **Node.js 설치됨**: 시스템에 Node.js 18+ 가 설치되어 있어야 합니다 (SDK 설치기에 필요)
- **디스크 공간**: 홈 드라이브에 최소 15GB 의 여유 공간 필요 (SDK 가 큽니다)
- **네트워크 접근**: 커스텀 저장소 URL 에 접근할 수 있어야 합니다 (내부 미러는 VPN/프록시 필요)
- **저장소 URL**: `pkg_list_{OS}-{64,32}` 파일을 제공하는 유효한 저장소 URL 이 필요

**유효한 저장소 URL 이란?**

유효한 Tizen 패키지 저장소는 루트에 **패키지 목록** 파일을 제공합니다:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}

OS   = windows | ubuntu | macos
ARCH = 64 | 32
```

예시:
- ✅ `http://mirror.example.com/packages/tizen_sdk_11.0` (사내 미러)
- ✅ `https://your-team-server.com/tizen-packages` (팀 미러)
- ❌ `http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_windows-64` (디렉토리가 아닌 파일을 가리킴)
- ❌ `mirror.example.com/packages/tizen_sdk_11.0` (스킴 없음 — `http://` 또는 `https://` 필요)

> 💡 **각 단계의 "이렇게 말하세요" 예시를 그대로 복사해서 사용하세요.**

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 시기 | 에이전트 |
|------|------|------|----------|
| 1 | 저장소 URL 유효성 검사 | 설치 전 (선택이지만 권장) | `tizen-sdk-install-custom-repo` |
| 2 | 설치 사전 확인 | 설치 전 (자동) | `tizen-sdk-install-custom-repo` |
| 3 | 커스텀 URL 에서 SDK 설치 | 주요 설치 단계 | `tizen-sdk-install-custom-repo` |
| 4 | 설치 검증 | 설치 완료 후 | `tizen-sdk-install` |
| 5 | (선택) repository.info 확인 | 기록된 저장소 URL 확인 | `tizen-sdk-install` |

---

## 1 단계 — 저장소 URL 유효성 검사 (선택이지만 권장)

설치를 시작하기 전에 저장소 URL 이 유효하고 접근 가능한지 검증합니다. 이는 **초 단위**로 완료되는 **읽기 전용 검사**입니다.

**이렇게 말하세요:**
```
이 저장소 URL 을 검증해줘: http://mirror.example.com/packages/tizen_sdk_11.0
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk validate-repo-url --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"
```

**성공 확인:** 표준 JSON Envelope 이 반환됩니다:

```json
{
  "status": "success",
  "result": {
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "pkg_list_file": "pkg_list_windows-64",
    "is_valid": true,
    "reachable": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk validate-repo-url",
  "duration_ms": 500
}
```

**실패 확인:** URL 이 유효하지 않은 경우:

```json
{
  "status": "error",
  "result": null,
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_REPO_E001",
      "error_category": "repo_url_invalid",
      "message": "URL 이 pkg_list 파일 자체를 가리킵니다. 상위 디렉토리 URL 을 입력하세요.",
      "details": {
        "tested_urls": [
          "http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_windows-64",
          "http://mirror.example.com/packages/tizen_sdk_11.0/pkg_list_windows-32"
        ]
      }
    }
  ],
  "command": "tizen-sdk validate-repo-url",
  "duration_ms": 300
}
```

**자주 발생하는 URL 실수:**

| 주어진 URL | 문제점 | 올바른 URL |
|-----------|---------|-------------|
| `https://host/repo/pkg_list_ubuntu-64` | 디렉토리가 아닌 파일을 가리킴 | `https://host/repo` |
| `https://host/repo/binary` | `binary/` 에 zip 파일이 있음, 목록이 아님 | `https://host/repo` |
| `mirror.example.com/packages/tizen_sdk_11.0` | 스킴 없음 | `http://mirror.example.com/packages/tizen_sdk_11.0` |
| `mirror.example.com/packages/tizen_studio_6.5` | 스킴 없음 | `http://mirror.example.com/packages/tizen_studio_6.5` |
| 오프라인 상태의 내부 미러 | 이 머신에서 접근 불가 | VPN 연결 / 프록시 설정 |

> ⚠️ **내부 미러는 VPN/프록시 필요:** 사내 네트워크 전용 미러를 사용하는 경우, 사내 VPN 에 연결되어 있는지 확인하세요. 내부 URL 에서 "접근 불가" 오류는 대부분 URL 문제가 아니라 네트워크 접근 문제입니다.

---

## 2 단계 — 설치 사전 확인

사전 확인은 URL 유효성 검사, SDK 기설치 여부 확인, 디스크 공간 검증을 수행합니다. 이는 **초 단위**로 완료됩니다.

**이렇게 말하세요:**
```
http://mirror.example.com/packages/tizen_sdk_11.0 에서 Tizen SDK 를 설치해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"
```

**성공 확인 (SDK 미설치 상태):** 사전 확인이 `suggested_fix` 명령을 반환합니다:

```json
{
  "status": "error",
  "result": {
    "sdk_root": null,
    "sdk_installed": false,
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "repository_valid": true,
    "pkg_list_file": "pkg_list_windows-64",
    "disk_space_ok": true,
    "available_space_gb": 150
  },
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_EXEC_E001",
      "error_category": "execution_error",
      "message": "SDK 가 아직 설치되지 않았습니다. 설치를 위해 suggested fix 명령을 실행하세요.",
      "suggested_fix": {
        "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\<username>\\.cline\\plugins\\cache\\tizen-platform\\tizen-sdk-skills\\v1.2.3\\scripts\\tizen-sdk-install-custom-repo\\tizen-sdk-install-custom-repo.ps1\" -RepoUrl \"http://mirror.example.com/packages/tizen_sdk_11.0\"",
        "description": "커스텀 저장소에서 Tizen SDK 설치"
      }
    }
  ],
  "command": "tizen-sdk sdk-install-custom-repo",
  "duration_ms": 2000
}
```

> ⚠️ **기설치됨 ≠ 이 저장소에서 설치됨:** SDK 가 이미 존재하는 경우, 사전 확인은 **아무것도 다운로드하지 않고 성공**을 반환합니다. 기존 패키지는 여전히 이전 저장소에서 설치된 것입니다. 커스텀 URL 에서 재설치하려면 요청에 `--force` 를 추가하세요.

**성공 확인 (SDK 기설치 상태):**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "sdk_installed": true,
    "existing_repository": "https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official"
  },
  "warnings": [
    "C:\\Users\\<username>\\tizen-sdk 에서 SDK 설치가 확인되었습니다 (sdk.info 존재). 강제 재설치를 하려면 --force 를 사용하세요.",
    "요청된 저장소는 적용되지 않았습니다: 기존 SDK 는 https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official 에서 설치되었습니다. http://mirror.example.com/packages/tizen_sdk_11.0 에서 재설치하려면 --force 를 사용하여 다시 실행하세요."
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install-custom-repo",
  "duration_ms": 1500
}
```

---

## 3 단계 — 커스텀 URL 에서 SDK 설치

실제 설치는 **10-15 분**이 소요되며 약 121 개의 패키지를 다운로드합니다. 설치기는 타임아웃을 방지하기 위해 백그라운드에서 실행됩니다.

**이렇게 말하세요:**
```
http://mirror.example.com/packages/tizen_sdk_11.0 에서 Tizen SDK 를 설치해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0" --force
```

에이전트가 자동으로 2 단계의 `suggested_fix.command` 를 실행합니다.

### 설치 진행 과정

설치기는 다음을 수행합니다:
1. 저장소 URL 재검증
2. `pkg_list_windows-64` 다운로드 및 파싱
3. 타겟 플랫폼 선택 (지정하지 않으면 가장 높은 `TIZEN-X.Y`)
4. 모든 패키지 의존성 해결 (`Install-dependency` + `C-SelectedGroup`)
5. `{REPO_URL}{Path}` 에서 각 패키지 zip 다운로드
6. `data/` 내용을 SDK 루트에 병합
7. `sdk.info`, `~/.tizen.sdk.path.config`, `.package/repository.info` 기록

**성공 확인:** 설치 완료 후:

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "packages_installed": 121,
    "platform_version": "TIZEN-11.0",
    "repository_url": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "installation_time_ms": 720000
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-install-custom-repo",
  "duration_ms": 720000
}
```

> ⚠️ **시간 예상:** 이 단계는 네트워크 속도와 저장소 서버의 대역폭에 따라 10-15 분이 소요됩니다.

---

## 4 단계 — 설치 검증

설치 완료 후, SDK 가 제대로 설치되고 구성되었는지 검증합니다.

**이렇게 말하세요:**
```
Tizen SDK 설치를 검증해줘
```

**성공 확인:** SDK 가 준비되었음을 보여주는 표준 JSON Envelope:

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "sdk_version": "11.0",
    "sdk_info_exists": true,
    "environment_configured": true,
    "tizen_sdk_path_set": true,
    "path_updated": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "duration_ms": 1000
}
```

---

## 5 단계 — 기록된 저장소 URL 확인 (선택)

설치기는 커스텀 저장소 URL 을 `.package/repository.info` 에 기록합니다. 이는 **향후 패키지 업데이트와 에뮬레이터 패키지가 동일한 커스텀 저장소에서 제공됨**을 보장합니다 — 추가 설정 불필요.

**이렇게 말하세요:**
```
Tizen SDK 의 기록된 저장소 URL 을 보여줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk sdk-repo-info
```

**성공 확인:**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "current_repository": "http://mirror.example.com/packages/tizen_sdk_11.0",
    "repository_info_path": "C:\\Users\\<username>\\tizen-sdk\\.package\\repository.info"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-repo-info",
  "duration_ms": 500
}
```

> 💡 **하류 효과:** `tizen-update-package` 와 `tizen-download-emulator-package` 는 `repository.info` 를 읽으므로, 모든 향후 패키지 작업이 동일한 커스텀 저장소를 사용합니다.

---

## 전체 E2E 경로

### 경로 1: 표준 커스텀 저장소 설치

사내 미러에서 일반적인 설치를 위해 사용:

```
1) 이 저장소 URL 을 검증해줘: http://mirror.example.com/packages/tizen_sdk_11.0
2) http://mirror.example.com/packages/tizen_sdk_11.0 에서 Tizen SDK 를 설치해줘
3) Tizen SDK 설치를 검증해줘
4) 기록된 저장소 URL 을 보여줘
```

**tizen-cli 명령:**
```bash
# 1 단계: 검증
tizen-cli tizen-sdk validate-repo-url --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"

# 2 단계: 설치
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"

# 3 단계: 검증
tizen-cli tizen-sdk sdk-install

# 4 단계: 저장소 정보 확인
tizen-cli tizen-sdk sdk-repo-info
```

**시간 예상:** 약 15 분 (검증은 순식간; 설치는 10-15 분).

### 경로 2: 빠른 설치 (검증 생략)

URL 이 유효하다고 확신하는 경우, 바로 설치로 이동:

```
1) http://mirror.example.com/packages/tizen_sdk_11.0 에서 Tizen SDK 를 설치해줘
2) Tizen SDK 설치를 검증해줘
```

**tizen-cli 명령:**
```bash
# 1 단계: 설치
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0"

# 2 단계: 검증
tizen-cli tizen-sdk sdk-install
```

**시간 예상:** 약 15 분.

### 경로 3: 다른 저장소에서 재설치

기존 SDK 가 있고 저장소를 전환하려는 경우:

```
1) http://mirror.example.com/packages/tizen_sdk_11.0 에서 Tizen SDK 를 설치해줘 --force
2) Tizen SDK 설치를 검증해줘
3) 기록된 저장소 URL 을 보여줘
```

**tizen-cli 명령:**
```bash
# 1 단계: --force 로 재설치
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0" --force

# 2 단계: 검증
tizen-cli tizen-sdk sdk-install

# 3 단계: 저장소 정보 확인
tizen-cli tizen-sdk sdk-repo-info
```

> ⚠️ **`--force` 필요:** 이 플래그 없으면, 설치기가 기존 SDK 를 감지하고 아무것도 다운로드하지 않고 종료됩니다.

---

## 플랫폼 버전 선택

기본적으로 설치기는 저장소에서 사용 가능한 **가장 높은 `TIZEN-X.Y`** 버전을 선택합니다. 특정 버전이 필요하면 이를 재정의할 수 있습니다.

**이렇게 말하세요:**
```
http://mirror.example.com/packages/tizen_sdk_11.0 에서 Tizen SDK 를 설치해줘, 플랫폼 버전 10.0 사용
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "http://mirror.example.com/packages/tizen_sdk_11.0" --platform-version "10.0"
```

**결과:** 설치기가 가장 높은 버전 대신 `TIZEN-10.0` 을 사용합니다.

---

## 문제 해결

### 저장소 URL 유효하지 않음

**증상:** `repo_url_invalid` 오류.

**이렇게 말하세요:**
```
저장소 URL http://example.com/repo 이 유효하지 않습니다 — 문제 진단해줘
```

**자주 발생하는 원인과 해결:**

| 원인 | 진단 | 해결 |
|------|------|------|
| URL 이 pkg_list 파일을 가리킴 | `details.tested_urls` 에 pkg_list 경로 표시 | URL 에서 `/pkg_list_...` 제거 |
| http/https 스킴 없음 | `error_category: "repo_url_invalid"` | `http://` 또는 `https://` 접두사 추가 |
| 잘못된 URL | `error_category: "repo_url_invalid"` | 오타, 공백, 잘못된 문자 확인 |

### 저장소 URL 접근 불가

**증상:** `repo_url_unreachable` 오류.

**이렇게 말하세요:**
```
저장소 URL http://10.x.x.x/repo 에 접근할 수 없습니다 — 문제 진단해줘
```

**자주 발생하는 원인과 해결:**

| 원인 | 진단 | 해결 |
|------|------|------|
| 내부 미러, VPN 오프 | `details` 에 연결 타임아웃 표시 | 사내 VPN 연결 |
| 잘못된 URL | `details` 에 모든 pkg_list 프로브에 대한 404 표시 | 저장소 소유자와 URL 확인 |
| 프록시 필요 | `details` 에 연결 거부 표시 | 내부 네트워크용 HTTP 프록시 설정 |

### 설치 중간 실패

**증상:** 설치기가 오류로 종료되고 SDK 부분만 설치됨.

**이렇게 말하세요:**
```
SDK 설치가 실패했습니다 — 재개 또는 재시도해줘
```

**복구:** 설치기는 내구성 마커 (`.install-running` / `.install-result`) 를 사용하므로, 동일한 명령을 다시 실행하면 **이전 위치에서 재개**됩니다 — 이미 다운로드된 패키지는 건너뜁니다.

### 디스크 공간 부족

**증상:** `disk_space_insufficient` 오류.

**이렇게 말하세요:**
```
디스크 공간을 확보하거나 SDK 설치 경로를 변경해줘
```

**해결:** 다음 중 하나:
1. 홈 드라이브에 최소 15GB 여유 공간 확보
2. 다른 설치 경로 지정: `D:\tizen-sdk 에 http://... 에서 Tizen SDK 를 설치해줘`

---

## 오류 참조

| `error_code` | `error_category` | 원인 | 해결 |
|--------------|------------------|------|------|
| `TIZEN_SDK_REPO_E001` | `repo_url_invalid` | 누락/빈 URL, `http(s)` 아님, 또는 URL 이 pkg_list 파일을 가리킴 | pkg_list 를 포함하는 **디렉토리** URL 전달 |
| `TIZEN_SDK_REPO_E002` | `repo_url_unreachable` | 올바른 URL 이나 `pkg_list_{OS}-{64,32}` 를 가져올 수 없음 | 잘못된 URL, 또는 VPN/프록시 없이 접근 불가한 내부 미러 |
| `TIZEN_SDK_SCRIPT_E001` | `script_not_found` | 플러그인 캐시에서 설치기 스크립트 누락 | `scripts/` 동기화를 위해 설정 스크립트 재실행 |
| `TIZEN_SDK_EXEC_E001` | `execution_error` | URL 유효함, SDK 미설치 (일반적인 1 단계 결과) | `errors[0].suggested_fix.command` 실행 (2 단계) |

---

## 설치 후 발생하는 일

커스텀 저장소 설치 성공 후:

1. **`sdk.info`** — SDK 를 설치됨으로 표시
2. **`~/.tizen.sdk.path.config`** — 자동 구성됨 (자동 `sdk-init`)
3. **`.package/repository.info`** — 커스텀 저장소 URL 기록
4. **환경 변수** — `TIZEN_SDK_PATH` 및 `PATH` 설정됨

기록된 저장소 URL 은 모든 향후 패키지 작업에 영향을 미칩니다:

| 작업 | `repository.info` 읽음? | 커스텀 저장소 사용? |
|------|-------------------------|---------------------|
| `tizen-update-package` | ✅ 예 | ✅ 예 |
| `tizen-download-emulator-package` | ✅ 예 | ✅ 예 |
| `tizen-sdk-install` (일반) | ❌ 아님 | ❌ 아님 (CDN 사용) |

---

## 관련 문서

- 기술 참조: [CUSTOM_REPOSITORY_INSTALL.md](CUSTOM_REPOSITORY_INSTALL.md)
- 표준 SDK 설치: [INSTALLATION_FLOW.md](INSTALLATION_FLOW.md)
- SDK 검증: [SDK_INSTALLATION_VERIFICATION.md](SDK_INSTALLATION_VERIFICATION.md)
- 전체 에이전트 개요: [README.md](../README.md)
- 스킬 참조: [SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) (`tizen-sdk-install-custom-repo`)

---

## 단축키 및 팁

- **자연어:** 원하는 것을 그냥 설명하세요 — "https://... 에서 SDK 를 설치해줘", "이 repo URL 검증해줘", "기록된 저장소를 보여줘".
- **먼저 검증:** 긴 설치를 시작하기 전에 항상 URL 을 검증하세요 — 몇 초 걸리며 시간을 낭비하지 않게 해줍니다.
- **저장소 전환은 `--force`:** 기존 SDK 가 있고 저장소를 전환하려면 **반드시** `--force` 를 사용해야 합니다.
- **실패 시 재개:** 설치가 실패하면, 다시 실행하면 이전 위치에서 재개됩니다 — 이미 다운로드된 패키지는 건너뜁니다.
- **사내 미러는 VPN 필요:** 사내 네트워크에서만 접근 가능한 미러라면, 먼저 VPN 에 연결하세요.
- **저장소는 고정됨:** 커스텀 저장소에서 설치한 후, 모든 향후 패키지 작업 (업데이트, 에뮬레이터 패키지) 이 자동으로 동일한 저장소를 사용합니다.
- **repository.info 확인:** `tizen-cli tizen-sdk sdk-repo-info` 를 사용하여 SDK 가 어디서 왔는지 확인하세요.
