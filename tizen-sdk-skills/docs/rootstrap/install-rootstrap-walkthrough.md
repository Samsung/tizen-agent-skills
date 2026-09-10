# 시나리오 가이드: 커스텀 루트스트랩 패키지 설치

이 문서는 ZIP 파일에서 커스텀 루트스트랩 패키지를 Tizen SDK에 설치하는 과정을 안내합니다. 커스텀 루트스트랩을 통해 표준 SDK 배포에 포함되지 않은 새로운 디바이스 프로필, 아키텍처, 플랫폼 버전에 대한 지원을 추가할 수 있습니다.

각 단계는 **Claude에게 자연어로 말하면** 자동으로 실행됩니다. 별도로 명령어를 외울 필요는 없습니다.

> 💡 **커스텀 루트스트랩이 필요한 이유?**
> - **커스텀 디바이스 지원**: 비표준 또는 독자 디바이스에 대한 루트스트랩 추가
> - **확장 아키텍처 지원**: 기본 세트 이외의 추가 CPU 아키텍처 지원
> - **플랫폼 확장**: 미출시 또는 커스텀 Tizen 플랫폼 버전 지원 추가
> - **개발 및 테스트**: 공식 출시 전 루트스트랩 테스트
> - **엔터프라이즈 커스터마이징**: 엔터프라이즈 제품용 디바이스 특화 루트스트랩 생성

---

## 0. 시작하기 전에

- **Tizen SDK 설치**: 기본 Tizen SDK가 설치 및 구성되어 있어야 합니다
- **플러그인 설치**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다
- **유효한 ZIP 파일**: 올바른 구조의 루트스트랩 ZIP 파일이 필요합니다
- **디스크 공간**: 루트스트랩 패키지는 일반적으로 1-5 GB의 디스크 공간이 필요합니다

**유효한 루트스트랩 ZIP 구조란?**

유효한 루트스트랩 ZIP 파일은 두 가지 디렉토리 구조 중 하나를 포함해야 합니다:

### 구조 1: `data/` 레이아웃 (일반적)

```
rootstrap.zip
└── data/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core.{public|private}.{timestamp}/
```

### 구조 2: `tizen-studio/` 레이아웃

```
rootstrap.zip
└── tizen-studio/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core.{public|private}.{timestamp}/
```

**XML 메타데이터 파일 형식:**

XML 파일명에는 중요한 메타데이터가 포함되어 있습니다:
- **형식**: `{profile}-{version}-{device}.core.{public|private}.{timestamp}.xml`
- **예시**:
  - `tizen-9.0-arm.core.public.20260819_095020.xml` (공개 루트스트랩)
  - `tv-samsung-8.0-device.core.private.20260819_095020.xml` (비공개 루트스트랩)
- **파싱 정보**:
  - `profile`: 타겟 프로필 (예: `tizen`, `tv-samsung`, `wearable`)
  - `version`: 플랫폼 버전 (예: `9.0`, `8.0`, `7.0`)
  - `device`: 타겟 디바이스/아키텍처 (예: `arm`, `aarch64`, `x86`, `x86_64`, `device`)
  - `type`: 루트스트랩 타입 - `public` 또는 `private`
  - `timestamp`: 빌드 타임스탬프 (`YYYYMMDD_HHMMSS` 형식, 예: `20260819_095020`)

> 💡 각 단계의 "이렇게 말하세요" 예시를 그대로 복사해 입력하면 됩니다.

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 시점 | 담당 에이전트 |
|------|------|------|---------------|
| 1 | 루트스트랩 설치 사전 확인 | 설치 전 (자동) | `tizen-install-rootstrap` |
| 2 | ZIP에서 루트스트랩 설치 | 메인 설치 단계 | `tizen-install-rootstrap` |
| 3 | 설치 확인 | 설치 완료 후 | `tizen-install-rootstrap` |

---

## 1단계 — 설치 사전 확인

사전 확인은 ZIP 파일 경로를 검증하고, 구조를 감지하며, 루트스트랩이 이미 설치되어 있는지 확인합니다. 수 초 내에 완료됩니다.

**이렇게 말하세요:**
```
C:\Downloads\custom-arm-rootstrap.zip 에서 커스텀 루트스트랩 설치해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

**성공 확인 (루트스트랩이 아직 설치되지 않은 경우):** 사전 확인이 `suggested_fix` 명령을 반환합니다:

```json
{
  "status": "error",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "zip_exists": true,
    "rootstrap_installed": false
  },
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_ROOTSTRAP_EXEC_E001",
      "error_category": "execution_error",
      "message": "Rootstrap not installed yet. Run the suggested fix command to install.",
      "suggested_fix": {
        "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\<username>\\.cline\\plugins\\cache\\tizen-platform\\tizen-sdk-skills\\v1.2.3\\scripts\\tizen-install-rootstrap\\tizen-install-rootstrap.ps1\" --zip-path \"C:\\Downloads\\custom-arm-rootstrap.zip\"",
        "description": "Install custom rootstrap from ZIP file"
      }
    }
  ],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 1000
}
```

**성공 확인 (루트스트랩이 이미 설치된 경우):**

```json
{
  "status": "success",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "rootstraps": [
      {
        "name": "tizen-9.0-arm.core",
        "profile": "tizen",
        "version": "9.0",
        "architecture": "arm"
      }
    ],
    "structure_type": "data",
    "installation_status": "already_installed"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 800
}
```

> ⚠️ **이미 설치됨:** 루트스트랩이 이미 존재하면 사전 확인은 **success**를 반환하며 추가 작업이 필요 없습니다. 강제 재설치하려면 요청에 `--force`를 추가하세요.

---

## 2단계 — ZIP에서 루트스트랩 설치

실제 설치는 루트스트랩 파일을 SDK의 `rootstrap` 디렉토리로 복사합니다. ZIP 크기에 따라 수 초에서 1분 정도 소요됩니다.

**이렇게 말하세요:**
```
C:\Downloads\custom-arm-rootstrap.zip 에서 커스텀 루트스트랩 설치해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

에이전트가 1단계의 `suggested_fix.command`를 자동으로 실행합니다.

### 설치 프로세스

설치 프로그램은 다음을 수행합니다:
1. ZIP 파일 경로 및 존재 여부 검증
2. 임시 디렉토리에 ZIP 압축 해제
3. 보안 검증 수행:
   - **경로 순회 탐지**: 경로에 `..`가 포함된 항목 거부
   - **심볼릭 링크 거부**: 심볼릭 링크 추출 거부
   - **절대 경로 거부**: 절대 경로 항목 거부
4. ZIP 구조 감지 (`data/` 또는 `tizen-studio/`)
5. `tools/smart-build-interface/plugins/*.xml`에서 XML 메타데이터 파싱
6. `tools/` 및 `platforms/` 폴더를 SDK로 복사
7. 임시 압축 해제 디렉토리 정리

**성공 확인:** 설치 완료 후:

```json
{
  "status": "success",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "rootstraps": [
      {
        "name": "tizen-9.0-arm.core",
        "profile": "tizen",
        "version": "9.0",
        "architecture": "arm"
      }
    ],
    "structure_type": "data",
    "warnings": [],
    "installation_status": "installed",
    "installation_time_ms": 45000
  },
  "errors": [],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 45000
}
```

> ⚠️ **소요 시간:** ZIP 크기와 디스크 속도에 따라 일반적으로 30-60초가 소요됩니다.

---

## 3단계 — 설치 확인

설치 완료 후, 루트스트랩이 SDK에 올바르게 설치되었는지 확인합니다.

**이렇게 말하세요:**
```
커스텀 루트스트랩 설치 확인해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

**성공 확인:**

```json
{
  "status": "success",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "rootstraps": [
      {
        "name": "tizen-9.0-arm.core",
        "profile": "tizen",
        "version": "9.0",
        "architecture": "arm"
      }
    ],
    "structure_type": "data",
    "installation_status": "already_installed"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 800
}
```

---

## 전체 E2E 경로

### 경로 1: 표준 루트스트랩 설치

일반적인 루트스트랩 설치에 사용합니다:

```
1) C:\Downloads\custom-arm-rootstrap.zip 에서 커스텀 루트스트랩 설치해줘
2) 루트스트랩 설치 확인해줘
```

**tizen-cli 명령:**
```bash
# 1단계: 설치
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"

# 2단계: 확인
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

**소요 시간:** ~1분 (사전 확인은 즉시; 설치는 30-60초).

### 경로 2: 강제 재설치

기존 루트스트랩을 재설치해야 하는 경우:

```
1) C:\Downloads\custom-arm-rootstrap.zip 에서 커스텀 루트스트랩 강제 재설치해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip" --force
```

> ⚠️ **`--force` 필수:** 이 옵션 없이는 설치 프로그램이 기존 루트스트랩을 감지하고 아무것도 복사하지 않고 종료합니다.

---

## ZIP 구조 감지

설치 프로그램은 ZIP 파일이 어떤 구조를 사용하는지 자동으로 감지합니다:

| 구조 | 감지 조건 | 처리 방식 |
|------|-----------|-----------|
| `data/` | `data/tools/smart-build-interface/plugins/` 존재 | SDK로 표준 복사 |
| `tizen-studio/` | `tizen-studio/tools/smart-build-interface/plugins/` 존재 | 네이티브 패키지 필요할 수 있음 |

감지된 구조 타입은 `result.structure_type`에 보고됩니다.

---

## 보안 검증

설치 프로그램은 ZIP 파일에 대해 포괄적인 보안 검사를 수행합니다:

### 경로 순회 탐지

**확인 내용:** 경로에 `..`가 포함된 ZIP 항목.

**악의적 항목 예시:** `../../../etc/passwd`

**에러 응답:**
```json
{
  "status": "error",
  "errors": [
    {
      "error_code": "security_violation",
      "error_category": "path_traversal",
      "message": "Path traversal detected in ZIP entry: ../../../etc/passwd"
    }
  ]
}
```

### 심볼릭 링크 거부

**확인 내용:** 심볼릭 링크인 ZIP 항목.

**에러 응답:**
```json
{
  "status": "error",
  "errors": [
    {
      "error_code": "security_violation",
      "error_category": "symlink_detected",
      "message": "Symlink detected in ZIP archive: path/to/symlink"
    }
  ]
}
```

### 절대 경로 거부

**확인 내용:** 절대 경로를 가진 ZIP 항목 (예: `/etc/config`).

**에러 응답:**
```json
{
  "status": "error",
  "errors": [
    {
      "error_code": "security_violation",
      "error_category": "absolute_path",
      "message": "Absolute path detected in ZIP entry: /etc/config"
    }
  ]
}
```

---

## 아키텍처 지원

### 지원 아키텍처

| 아키텍처 | XML 값 | 설명 |
|----------|--------|------|
| x86 (32비트) | `i386`, `x86` | Intel/AMD 32비트 |
| x86_64 (64비트) | `x86_64`, `emulator64` | Intel/AMD 64비트 |
| ARM (32비트) | `arm`, `device` | ARM 32비트 (armhf) |
| AArch64 (64비트) | `aarch64`, `device64` | ARM 64비트 |
| RISC-V 64비트 | `riscv64` | RISC-V 64비트 |

설치 프로그램은 XML 아키텍처 값을 SDK가 사용하는 표준 형식으로 자동 매핑합니다.

---

## 트러블슈팅

### ZIP 파일을 찾을 수 없음

**증상:** `file_not_found` 에러.

**이렇게 말하세요:**
```
루트스트랩 ZIP 파일을 찾을 수 없어 — 문제 진단해줘
```

**일반적인 원인 및 해결 방법:**

| 원인 | 진단 | 해결 |
|------|------|------|
| 잘못된 경로 | `zip_exists: false` | 경로가 올바른지 확인 |
| 상대 경로 | 경로가 해석되지 않음 | 절대 경로 사용 |
| 파일 삭제 | 파일이 이동/삭제됨 | ZIP 파일 재다운로드 |

### 잘못된 ZIP 구조

**증상:** `invalid_zip_structure` 에러.

**이렇게 말하세요:**
```
ZIP 구조가 잘못됐어 — 문제 진단해줘
```

**일반적인 원인 및 해결 방법:**

| 원인 | 진단 | 해결 |
|------|------|------|
| tools/ 누락 | `smart-build-interface/plugins/` 없음 | 올바른 구조로 ZIP 재패키징 |
| platforms/ 누락 | `platforms/tizen-*/` 없음 | platforms 폴더가 존재하는지 확인 |
| 잘못된 루트 | 파일이 data/가 아닌 ZIP 루트에 있음 | `data/` 또는 `tizen-studio/` 루트로 재패키징 |

### XML 메타데이터를 찾을 수 없음

**증상:** `no_xml_found` 에러.

**이렇게 말하세요:**
```
루트스트랩 XML 메타데이터 파일을 찾을 수 없어 — 문제 진단해줘
```

**일반적인 원인 및 해결 방법:**

| 원인 | 진단 | 해결 |
|------|------|------|
| plugins/ 누락 | `tools/smart-build-interface/plugins/` 없음 | 올바른 경로로 재패키징 |
| 잘못된 파일명 | XML이 `{profile}-{version}-{arch}.core.{timestamp}.xml` 형식이 아님 | XML 파일명 변경 |
| 손상된 ZIP | ZIP 압축 해제 실패 | ZIP 파일 재다운로드 |

### 보안 검증 실패

**증상:** `security_violation` 에러.

**이렇게 말하세요:**
```
보안 검증 실패 — 문제 진단해줘
```

**일반적인 원인 및 해결 방법:**

| 원인 | 진단 | 해결 |
|------|------|------|
| 경로 순회 | 항목에 `..` 포함 | 경로 순회 없이 ZIP 재패키징 |
| 심볼릭 링크 | 항목이 심볼릭 링크 | 실제 파일로 재패키징 |
| 절대 경로 | 항목이 `/` 또는 `C:`로 시작 | 상대 경로로 재패키징 |

### 설치 중간에 실패

**증상:** 설치가 에러로 종료, 일부 파일만 복사됨.

**이렇게 말하세요:**
```
루트스트랩 설치 실패 — 재개하거나 재시도해줘
```

**복구:** 동일한 명령을 다시 실행하면 됩니다. 설치 프로그램이 기존 파일을 감지하고 설치를 완료합니다.

---

## 에러 참조

| `error_code` | `error_category` | 원인 | 해결 |
|--------------|------------------|------|------|
| `file_not_found` | `zip_path_invalid` | 지정된 경로에 ZIP 파일이 없음 | 경로가 올바르고 파일이 존재하는지 확인 |
| `invalid_zip` | `zip_invalid` | 파일이 유효한 ZIP 아카이브가 아님 | ZIP을 재다운로드하거나 재패키징 |
| `invalid_zip_structure` | `structure_unknown` | ZIP이 `data/` 또는 `tizen-studio/` 레이아웃이 아님 | 올바른 구조로 재패키징 |
| `no_xml_found` | `metadata_missing` | `plugins/` 디렉토리에 XML 파일이 없음 | XML 메타데이터 파일이 존재하는지 확인 |
| `security_violation` | `path_traversal` | ZIP 항목에 `..` 포함 | 경로 순회 없이 재패키징 |
| `security_violation` | `symlink_detected` | ZIP에 심볼릭 링크 포함 | 실제 파일로 재패키징 |
| `security_violation` | `absolute_path` | ZIP 항목이 절대 경로 | 상대 경로로 재패키징 |
| `execution_error` | `execution_error` | 설치 스크립트 실패 | 에러 상세 내용 확인 후 재시도 |

---

## 설치 후

루트스트랩 설치 성공 후:

1. **루트스트랩 디렉토리** — 파일이 `{SDK_PATH}/data/platforms/tizen-{version}/tizen/rootstraps/`에 복사됩니다
2. **도구 설치** — 빌드 플러그인이 `{SDK_PATH}/data/tools/smart-build-interface/plugins/`에 설치됩니다
3. **사용 준비 완료** — 루트스트랩을 프로젝트 생성 및 빌드에 사용할 수 있습니다

### 설치된 루트스트랩 사용

설치 후 루트스트랩을 다음 용도로 사용할 수 있습니다:

1. **새 네이티브 프로젝트 생성:**
   ```
   tizen-9.0-arm 루트스트랩으로 새 Tizen 네이티브 프로젝트 만들어줘
   ```

2. **루트스트랩으로 빌드:**
   ```
   커스텀 arm 루트스트랩으로 내 프로젝트 빌드해줘
   ```

3. **타겟 아키텍처 크로스 컴파일:**
   ```
   ARM 디바이스 크로스 컴파일 설정해줘
   ```

---

## 관련 문서

- 기술 레퍼런스: [tizen-install-rootstrap/SKILL.md](../../common/skills/tizen-install-rootstrap/SKILL.md)
- SDK 설치: [INSTALLATION_FLOW.md](../sdk-install/INSTALLATION_FLOW.md)
- 커스텀 저장소 설치: [custom-repo-walkthrough.md](../sdk-install/custom-repo-walkthrough.md)
- 전체 에이전트 개요: [README.md](../README.md)
- 스킬 레퍼런스: [SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) (`tizen-install-rootstrap`)

---

## 키보드 단축키 및 팁

- **자연어:** 원하는 것을 설명만 하면 됩니다 — "C:\... 에서 루트스트랩 설치해줘", "설치 확인해줘".
- **사전 확인 먼저:** 사전 확인은 수 초 내에 ZIP을 검증하고 구조를 감지합니다 — 항상 먼저 실행하세요.
- **`--force`로 재설치:** 루트스트랩이 이미 존재하고 재설치하려면 `--force`를 **반드시** 사용해야 합니다.
- **보안은 자동:** 경로 순회, 심볼릭 링크, 절대 경로는 자동으로 거부됩니다.
- **구조 감지는 자동:** 설치 프로그램이 `data/`와 `tizen-studio/` 레이아웃을 자동으로 감지합니다.
- **XML 메타데이터 파싱:** 설치 프로그램이 XML 파일명에서 프로필, 버전, 아키텍처를 추출합니다.
- **빠른 설치:** SDK 설치(10-15분)와 달리 루트스트랩 설치는 30-60초가 소요됩니다.

---

## 예제 시나리오

### 시나리오 1: IoT 디바이스용 커스텀 ARM 루트스트랩 (공개)

**ZIP:** `custom-arm-iot.zip`
**구조:** `data/` 레이아웃
**XML:** `tizen-9.0-arm.core.public.20260819_095020.xml`

```
C:\Downloads\custom-arm-iot.zip 에서 커스텀 ARM 루트스트랩 설치해줘
```

**결과:**
- 프로필: `tizen`
- 버전: `9.0`
- 디바이스: `arm`
- 타입: `public`
- 타임스탬프: `20260819_095020`
- 위치: `{SDK}/data/platforms/tizen-9.0/tizen/rootstraps/tizen-9.0-arm.core/`

### 시나리오 2: TV Samsung 루트스트랩 (비공개)

**ZIP:** `tv-samsung-rootstrap.zip`
**구조:** `tizen-studio/` 레이아웃
**XML:** `tv-samsung-8.0-device.core.private.20260819_095020.xml`

```
C:\Downloads\tv-samsung.zip 에서 TV Samsung 루트스트랩 설치해줘
```

**결과:**
- 프로필: `tv-samsung`
- 버전: `8.0`
- 디바이스: `device`
- 타입: `private`
- 타임스탬프: `20260819_095020`
- 위치: `{SDK}/data/platforms/tizen-8.0/tizen/rootstraps/tv-samsung-8.0-device.core/`

### 시나리오 3: 멀티 아키텍처 루트스트랩

**ZIP:** `multi-arch-rootstrap.zip`
**구조:** `data/` 레이아웃
**XML:** 여러 아키텍처의 XML 파일 (예: `tizen-9.0-arm.core.public.20260819_095020.xml`, `tizen-9.0-aarch64.core.public.20260819_095020.xml`)

```
C:\Downloads\multi-arch.zip 에서 멀티 아키텍처 루트스트랩 설치해줘
```

**결과:**
- 여러 아키텍처의 루트스트랩이 설치됨
- 모두 `result.rootstraps[]`에 보고됨

### 시나리오 4: 엔터프라이즈 커스텀 프로필 (공개)

**ZIP:** `enterprise-device.zip`
**구조:** `data/` 레이아웃
**XML:** `enterprise-device-10.0-aarch64.core.public.20260819_095020.xml`

```
C:\Downloads\enterprise.zip 에서 엔터프라이즈 커스텀 루트스트랩 설치해줘
```

**결과:**
- 프로필: `enterprise-device`
- 버전: `10.0`
- 디바이스: `aarch64`
- 타입: `public`
- 타임스탬프: `20260819_095020`
