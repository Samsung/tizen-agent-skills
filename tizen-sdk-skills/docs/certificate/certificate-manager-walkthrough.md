# 시나리오 가이드: Tizen 및 Samsung 인증서 관리 엔드투엔드

이 문서는 `tizen-sdk-skills` 플러그인을 사용한 **Tizen 인증서 및 Samsung 온라인 CA 인증서의 전체 워크플로우**를 안내합니다: "SDK 설치 → 로컬 Tizen 인증서 → Samsung 인증서 → 서명 프로필 → 빌드에 사용".

각 단계는 **Claude에게 자연어로 말하면** 자동으로 실행됩니다. 별도로 명령어를 외울 필요는 없습니다.

> Tizen 앱은 **두 가지 유형의 인증서**로 서명됩니다: (1) **로컬 Tizen** — 무료, 자체 서명, SDK에 번들 포함, 개발/테스트용, 또는 (2) **Samsung 온라인 CA** — Samsung 계정으로 발급, Samsung 배포에 필수. 두 가지 모두 **서명 프로필**을 통해 사용되며, 서명 프로필은 작성자 인증서와 배포자 인증서를 결합합니다. 담당 스킬은 `tizen-certificate-manager`입니다.

---

## 0. 시작하기 전에

- **플러그인 설치**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (설치되어 있지 않으면 [README.en.md](../README.en.md)의 "Cline plugin install" 참조)
- **Tizen SDK 설치**: SDK가 설치되어 있고 `~/.tizen.sdk.path.config`가 이를 가리켜야 합니다. (설치되어 있지 않으면 아래 "Tizen SDK 설치" 참조)
- **OS**: Windows / Ubuntu (Linux) / macOS 모두 지원됩니다. Claude가 현재 OS를 감지하여 해당 스크립트를 실행합니다.
- **Samsung 계정** (선택): Samsung 배포 인증서를 사용할 경우에만 필요합니다. 유효한 Samsung 계정과 최소 하나의 디바이스 DUID가 필요합니다.
- **예제 목표**:
  - 시나리오 A (로컬만): 로컬 Tizen 인증서를 생성하고, 이를 사용하여 앱을 빌드 및 서명합니다.
  - 시나리오 B (Samsung 포함): Samsung 작성자 인증서를 생성하고, Samsung 배포자 인증서를 위한 DUID를 추가하고, 서명 프로필을 생성하여 배포 빌드에 사용합니다.

> 💡 각 단계의 "이렇게 말하세요" 예시를 그대로 복사해 입력하면 됩니다.

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 시점 | 담당 에이전트 |
|------|------|------|---------------|
| 1 | Tizen SDK 설치 | 최초 1회 | `tizen-sdk-install` |
| 2 | 로컬 Tizen 작성자 인증서 생성 | 서명 프로필 생성 전 | `tizen-certificate-manager` |
| 2b (선택) | 번들 배포자 인증서 목록 조회 | 어떤 유형/버전이 있는지 미리 확인 | `tizen-certificate-manager` |
| 3 | 서명 프로필 생성 (로컬 Tizen) | 서명된 프로필로 빌드하기 전 | `tizen-certificate-manager` |
| 4 (선택) | 인증서 가져오기 또는 검사 | 외부 `.p12`/`.cer` 파일을 사용할 경우 | `tizen-certificate-manager` |
| 5 (선택) | Samsung 작성자 인증서 생성 | Samsung 배포용 | `tizen-certificate-manager` |
| 6 (선택) | 디바이스 DUID 수집 | Samsung 배포자 인증서에 필요 | `tizen-certificate-manager` |
| 7 (선택) | Samsung 배포자 인증서 생성 | Samsung 배포용 | `tizen-certificate-manager` |
| 8 (선택) | Samsung 서명 프로필 생성 | Samsung 배포용 앱 서명 | `tizen-certificate-manager` |
| 9 | 서명 프로필로 빌드 | 서명된 Tizen 앱 빌드 | `tizen-build-project` |

---

## 1단계 — Tizen SDK 설치

먼저 개발 환경을 설정합니다. 이미 설치되어 있으면 건너뜁니다.

**이렇게 말하세요:**
```
Tizen SDK 설치해줘
```

**성공 확인:** 설치된 패키지 수와 함께 "설치 완료" 메시지가 나타납니다.

---

## 2단계 — 로컬 Tizen 작성자 인증서 생성

개발 또는 테스트를 위한 자체 서명 인증서를 생성합니다. 이는 **무료**이며 **즉시 사용 가능**합니다 — 계정이 필요 없습니다.

**이렇게 말하세요:**
```
"My Dev"라는 이름으로 Tizen 작성자 인증서 생성해줘
```

프롬프트가 나오면 비밀번호를 대화형으로 입력합니다 (8자 이상, 대문자, 소문자, 숫자 포함). 비밀번호는 마스킹되어 입력할 때 보이지 않습니다.

**성공 확인:** 다음과 같은 `result`를 포함한 Standard JSON Envelope가 반환됩니다:

```json
{
  "status": "success",
  "result": {
    "name": "My Dev",
    "file_name": "My-Dev",
    "cert_path": "C:\\Users\\<username>\\tizen-sdk-data\\keystore\\author\\My-Dev.p12",
    "pwd_path": "C:\\Users\\<username>\\tizen-sdk-data\\keystore\\author\\My-Dev.pwd",
    "pwd_file_exists": false
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk certificate-manager generate-author",
  "duration_ms": 1655
}
```

이제 인증서가 `cert_path`에 저장되었고, 숨겨진 비밀번호 파일이 `pwd_path`에 생성되었습니다. 이 인증서를 재사용하여 여러 서명 프로필을 생성할 수 있습니다.

**선택: 메타데이터 추가**

조직, 이메일, 위치 등을 인증서에 포함하려면:

```
"Jane Dev"라는 이름으로 Tizen 작성자 인증서를 생성해줘. 이메일 "jane@acme.com", 조직 "Acme", 도시 "Seoul", 주 "Seoul", 국가 "KR"
```

프롬프트가 나오면 인증서 비밀번호를 대화형으로 입력합니다.

---

## 2b단계 (선택) — 번들 배포자 인증서 목록 조회

서명 프로필을 생성하기 전에 SDK에 포함된 배포자 인증서를 확인합니다.

**이렇게 말하세요:**
```
번들된 모든 Tizen 배포자 인증서 목록 보여줘
```

**성공 확인:** 사용 가능한 유형(`public`, `partner`, `platform`)과 버전(`legacy`, `new`)을 보여주는 결과:

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "distributors": [
      {
        "type": "public",
        "version": "legacy",
        "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-ca.cer",
        "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-signer.p12"
      },
      {
        "type": "public",
        "version": "new",
        "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-ca-new.cer",
        "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-signer-new.p12"
      },
      ...
    ],
    "unavailable": [
      {
        "type": "platform",
        "version": "legacy"
      }
    ]
  },
  ...
}
```

`unavailable` 배열은 이 SDK 설치에 존재하지 않는 조합을 보여줍니다 (이 경우 `platform/legacy`). 사용 불가능한 유형/버전으로 프로필을 생성하려고 하면, 이 에러가 유효한 조합을 알려줍니다.

**선택: 유형 또는 버전으로 필터링**

```
public 유형의 번들된 모든 Tizen 배포자 인증서 목록 보여줘
```

---

## 3단계 — 서명 프로필 생성 (로컬 Tizen)

작성자 인증서와 번들 배포자 인증서를 결합하여 서명된 앱을 빌드하는 데 사용할 수 있는 **서명 프로필**을 생성합니다.

**이렇게 말하세요:**
```
"MyLocalProfile"라는 이름으로 서명 프로필을 생성해줘. 내 Tizen 작성자 인증서 "My-Dev.p12"를 사용하고, public/new 번들 배포자와 페어링해줘
```

프롬프트가 나오면 작성자 인증서 비밀번호를 대화형으로 입력합니다 (마스킹 입력).

**성공 확인:** 다음과 같은 `result`를 포함한 Standard JSON Envelope:

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyLocalProfile",
    "active": true,
    "profiles_xml": "C:\\Users\\<username>\\tizen-sdk-data\\profile\\profiles.xml",
    "author_cert_path": "C:\\Users\\<username>\\tizen-sdk-data\\keystore\\author\\My-Dev.p12",
    "distributor": {
      "type": "public",
      "version": "new",
      "ca_path": "...",
      "signer_path": "..."
    },
    "distributor2": null
  },
  ...
}
```

**빌드에 사용:**

이 단계 후 서명된 앱을 빌드할 수 있습니다. 다음과 같은 결과가 나타납니다:

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "C:\\Users\\<username>\\Desktop\\test_tizen_aiplugins\\tetris\\Debug\\tetris.wgt",
        "format": ".wgt",
        "size_bytes": 42949
      }
    ],
    "build_time_ms": 10400
  },
  ...
}
```

(자세한 내용은 9단계 참조.)

---

## 4단계 (선택) — 인증서 가져오기 또는 검사

### 옵션 A — 기존 인증서 가져오기

`.p12` 또는 `.cer` 파일이 있는 경우 (예: 이전 설치 또는 외부 CA에서), 기존 파일을 덮어쓰지 않고 키스토어로 가져옵니다.

**이렇게 말하세요:**
```
"/path/to/my-cert.p12" 경로의 인증서를 Tizen 작성자 인증서로 가져와줘. 대상 파일명은 "my-imported-cert"
```

프롬프트가 나오면 인증서 비밀번호를 대화형으로 입력합니다 (마스킹 입력).

**성공 확인:** 파일이 작성자 키스토어에 복사되고, 최종 경로를 보여주는 결과가 반환됩니다.

**덮어쓰기 모드:**

해당 이름의 파일이 이미 존재하면, 기본적으로 가져오기가 거부됩니다. 교체하려면:

```
"/path/to/my-cert.p12" 경로의 인증서를 Tizen 작성자 인증서로 가져와줘. 대상 파일명은 "my-imported-cert", 기존 파일이 있으면 덮어써줘
```

프롬프트가 나오면 인증서 비밀번호를 대화형으로 입력합니다.

### 옵션 B — 인증서 검사

비밀번호를 노출하지 않고 `.p12` 또는 `.cer`의 세부 정보 (제목, 발급자, 유효기간, 알고리즘, 핑거프린트)를 확인합니다.

**이렇게 말하세요:**
```
"/path/to/my-cert.p12" 경로의 인증서를 검사해줘
```

프롬프트가 나오면 인증서 비밀번호를 대화형으로 입력합니다 (마스킹 입력).

**성공 확인:** 인증서 메타데이터 (제목, 발급자, 유효기간, 알고리즘, 핑거프린트 등)를 보여주는 결과.

---

## 5단계 (선택) — Samsung 작성자 인증서 생성

Samsung Store 또는 Samsung 디바이스에 배포할 계획이라면, **Samsung 발급** 작성자 인증서를 생성합니다. 이는 **유효한 Samsung 계정**이 필요하며, 처음에는 브라우저가 열리고, 이후에는 캐시된 토큰을 재사용합니다.

**이렇게 말하세요:**
```
"MySamsungProfile" 프로필로 Samsung 작성자 인증서를 생성해줘. 신원 "Jane Dev", 조직 "Acme", 도시 "Seoul", 국가 "KR"
```

프롬프트가 나오면 비밀번호를 대화형으로 입력합니다 (8자 이상, 대문자, 소문자, 숫자 포함). 비밀번호는 마스킹되어 입력할 때 보이지 않습니다.

처음 한 번만 Samsung 계정 로그인을 위해 브라우저가 열립니다. 이후 Samsung 작업은 캐시된 토큰을 자동으로 재사용합니다.

**성공 확인:** 로그인 후, 인증서 경로와 프로필 디렉토리를 보여주는 `result`를 포함한 Standard JSON Envelope가 반환됩니다.

인증서는 독립형 파일이 아닌 **프로필 이름** 디렉토리(`MySamsungProfile`) 아래에 저장됩니다. 비밀번호는 OS 수준 자격 증명 시스템(Windows DPAPI, macOS Keychain, Linux libsecret)을 통해 안전하게 저장됩니다 — **평문으로 저장되지 않습니다**.

> ⚠️ **로그인은 한 번만 발생합니다.** 동일한 Samsung 계정으로 여러 Samsung 인증서를 생성하는 경우, 첫 번째 생성 시에만 로그인이 요구됩니다. 이후 생성은 캐시된 토큰을 자동으로 재사용합니다 (브라우저 없음).

---

## 6단계 (선택) — 디바이스 DUID 수집

**Samsung 배포자 인증서**를 생성하려면, 실제 Tizen 디바이스 또는 에뮬레이터에서 최소 하나의 **DUID**(Device Unique ID)가 필요합니다. DUID를 획득하는 방법은 세 가지가 있습니다:

### 옵션 A — 연결된 단일 디바이스에서 DUID 추출

Tizen 디바이스 또는 에뮬레이터가 USB/네트워크로 연결된 경우:

**이렇게 말하세요:**
```
연결된 Tizen 디바이스에서 DUID 가져와줘
```

**성공 확인:** 디바이스 시리얼과 DUID를 보여주는 결과:

```json
{
  "status": "success",
  "result": {
    "duids": [
      { "serial": "emulator-26101", "duid": "1.0#EMULATOR01" }
    ]
  }
}
```

### 옵션 B — 연결된 모든 디바이스에서 DUID 추출

여러 디바이스가 있는 경우:

**이렇게 말하세요:**
```
연결된 모든 Tizen 디바이스에서 DUID 가져와줘
```

**성공 확인:** 디바이스별로 DUID 항목을 보여주는 결과.

### 옵션 C — 수동 목록 또는 파일 제공

DUID를 이미 가지고 있는 경우 (예: Samsung 파트너 포털에서), 직접 제공합니다:

**이렇게 말하세요 (인라인 목록):**
```
이 DUID들을 파싱해줘: "1.0#DEVICE001,1.0#DEVICE002,1.0#DEVICE003"
```

**이렇게 말하세요 (파일에서):**
```
"/path/to/duids.txt" 파일에서 DUID를 파싱해줘
```

**성공 확인:** 검증되고 중복 제거된 대문자 DUID와 파싱 노트를 보여주는 결과.

---

## 7단계 (선택) — Samsung 배포자 인증서 생성

Samsung 작성자 인증서(5단계)와 최소 하나의 DUID(6단계)를 확보한 후, 프로필에 대한 **Samsung 배포자 인증서**를 생성합니다.

**이렇게 말하세요 (인라인 DUID 포함):**
```
"MySamsungProfile" 프로필로 Samsung 배포자 인증서를 생성해줘. DUID는 "1.0#DEVICE001,1.0#DEVICE002", 권한은 Public
```

**이렇게 말하세요 (파일 포함):**
```
"MySamsungProfile" 프로필로 Samsung 배포자 인증서를 생성해줘. DUID는 "/path/to/duids.txt"에서 가져오고, 권한은 Partner
```

프롬프트가 나오면 인증서 비밀번호를 대화형으로 입력합니다 (마스킹 입력).

**성공 확인:** 배포자 인증서 경로와 유효기간을 보여주는 `result`를 포함한 Standard JSON Envelope.

**어떤 권한 수준을 선택해야 할까요?**
- **Public** — 앱이 모든 Tizen 디바이스에서 실행될 수 있습니다.
- **Partner** — 앱이 파트너/벤더 디바이스로 제한됩니다 (더 선별적인 배포).

---

## 8단계 (선택) — Samsung 서명 프로필 생성

Samsung 작성자 인증서(5단계)와 Samsung 배포자 인증서(7단계)를 모두 확보한 후, 이를 결합하여 Samsung 배포 빌드용 **서명 프로필**을 생성합니다.

**이렇게 말하세요:**
```
"MySamsungProfile"라는 이름으로 Samsung 서명 프로필을 생성하고 활성화해줘
```

프롬프트가 나오면 (필요한 경우) 작성자 및/또는 배포자 인증서 비밀번호를 대화형으로 입력합니다 (마스킹 입력). 대부분의 경우 비밀번호는 OS 수준 보안 저장소에서 자동으로 복호화됩니다.

**성공 확인:** 프로필이 등록되어 사용 준비가 되었음을 보여주는 Standard JSON Envelope.

> ✅ 이것은 3단계와 다릅니다. 여기서는 번들 Tizen 배포자 인증서를 사용하는 것이 아니라, Samsung Store 배포에 필요한 **Samsung 발급** 인증서를 사용합니다.

**빌드에 사용:**

이 단계 후 Claude에게 다음과 같이 말하여 Samsung 서명 앱을 빌드할 수 있습니다:

```
"MySamsungProfile" 서명 프로필로 내 Tizen 앱 빌드해줘
```

---

## 9단계 — 서명 프로필로 빌드

이제 서명 프로필(3단계의 로컬 Tizen 또는 8단계의 Samsung)을 가지고 있으므로, 이를 사용하여 서명된 Tizen 앱을 빌드합니다.

**이렇게 말하세요:**
```
"MyLocalProfile" 서명 프로필로 내 Tizen 앱 빌드해줘
```

또는 (Samsung의 경우):

```
"MySamsungProfile" 서명 프로필로 내 Tizen 앱 빌드해줘
```

**성공 확인:** 빌드가 완료되고 서명된 `.tpk`(네이티브) 또는 `.wgt`(웹앱) 패키지가 생성됩니다. 아티팩트 경로가 출력됩니다.

---

## 전체 E2E 경로

### 경로 1: 로컬 Tizen 인증서만 (개발/테스트)

테스트 또는 내부 배포용으로 빌드하는 경우:

```
1) Tizen SDK 설치해줘
2) "My Dev"라는 이름으로 Tizen 작성자 인증서 생성해줘
   → 비밀번호 입력
3) "MyProfile"라는 이름으로 서명 프로필을 생성해줘. 내 Tizen 작성자 인증서 "My-Dev.p12"를 사용하고, public/new 번들 배포자와 페어링해줘
   → 작성자 비밀번호 입력
4) "MyProfile" 서명 프로필로 내 Tizen 앱 빌드해줘
```

**소요 시간:** ~5-10분 (1단계가 가장 김; 2-4단계는 빠름).

### 경로 2: Samsung 인증서 (전체 배포 워크플로우)

Samsung Store에 배포하는 경우:

```
1) Tizen SDK 설치해줘
2) "MySamsungProfile" 프로필로 Samsung 작성자 인증서를 생성해줘. 신원 "Jane Dev", 조직 "Acme", 도시 "Seoul", 국가 "KR"
   → 비밀번호 입력
   → (처음 실행 시 브라우저가 열림)
3) 연결된 Tizen 디바이스에서 DUID 가져와줘
4) "MySamsungProfile" 프로필로 Samsung 배포자 인증서를 생성해줘. DUID는 디바이스에서 가져오고, 권한은 Public
   → 비밀번호 입력
5) "MySamsungProfile"라는 이름으로 Samsung 서명 프로필을 생성하고 활성화해줘
6) "MySamsungProfile" 서명 프로필로 내 Tizen 앱 빌드해줘
```

**소요 시간:** ~15-20분 (2단계에서 처음인 경우 브라우저 로그인 포함; 이후 빌드는 캐시된 로그인 재사용).

### 경로 3: 하이브리드 (로컬 + Samsung)

개발 및 배포 프로필을 모두 유지하는 경우:

```
1) Tizen SDK 설치해줘
2) "My Dev"라는 이름으로 Tizen 작성자 인증서 생성해줘
   → 비밀번호 입력
3) "LocalProfile"라는 이름으로 로컬 서명 프로필을 생성해줘. 내 Tizen 작성자 인증서 "My-Dev.p12"를 사용하고, public/new 번들 배포자와 페어링해줘
   → 작성자 비밀번호 입력
4) "SamsungProfile" 프로필로 Samsung 작성자 인증서를 생성해줘. 신원 "Jane Dev", 조직 "Acme", 도시 "Seoul", 국가 "KR"
   → 비밀번호 입력
   → (처음 실행 시 브라우저가 열림)
5) 연결된 Tizen 디바이스에서 DUID 가져와줘
6) "SamsungProfile" 프로필로 Samsung 배포자 인증서를 생성해줘. DUID는 디바이스에서 가져오고, 권한은 Public
   → 비밀번호 입력
7) "SamsungProfile"라는 이름으로 Samsung 서명 프로필을 생성하고 활성화해줘
8) "LocalProfile" 서명 프로필로 내 Tizen 앱 빌드해줘 (테스트용)
9) "SamsungProfile" 서명 프로필로 내 Tizen 앱 빌드해줘 (Samsung 배포용)
```

---

## 관리 및 트러블슈팅

### 모든 서명 프로필 및 활성 프로필 보기

**이렇게 말하세요:**
```
내 Tizen 서명 프로필 모두 보여줘
```

**결과:** 모든 프로필, 활성 프로필, 연결된 작성자/배포자 인증서 경로를 표시합니다.

### 활성 프로필 변경

**이렇게 말하세요:**
```
활성 서명 프로필을 "MyProfile"로 설정해줘
```

### 프로필 제거 (복구 불가)

**이렇게 말하세요:**
```
"MyProfile"라는 서명 프로필 제거해줘
```

> ⚠️ 이 작업은 `profiles.xml`에서 프로필을 삭제합니다. 기존 작성자/배포자 인증서를 사용하여 새 프로필을 생성할 수 있습니다.

### 배포자 인증서 업데이트 또는 특수 케이스

#### 배포자 2 설정 (고급)

서명 프로필에 **두 번째 배포자 인증서**가 필요한 경우 (드물게, 특수 Samsung 구성에 사용):

**이렇게 말하세요:**
```
"MyProfile" 프로필의 배포자 2를 partner/new로 설정해줘
```

프롬프트가 나오면 작성자 비밀번호와 배포자 2 비밀번호를 대화형으로 입력합니다 (마스킹 입력).

#### SDK 데이터 경로 확인

인증서와 프로필이 시스템에 저장된 위치를 확인해야 하는 경우:

**이렇게 말하세요:**
```
Tizen SDK 데이터 경로와 인증서 위치 보여줘
```

**결과:** 시스템의 `sdk_root`, `sdk_data_path`, `profiles_xml`, `keystore_author`, `keystore_samsung` 경로를 보여주는 JSON envelope.

---

## E2E 검증 체크리스트

수동 E2E 테스트 중에 다음 항목을 확인합니다.

### 로컬 Tizen 경로

| # | 확인 항목 | 예상 결과 |
|---|-----------|-----------|
| 1 | 2단계 envelope | `status: "success"`, `cert_path`와 `pwd_path` 존재, exit code `0` |
| 2 | 인증서 파일 존재 | `cert_path`에 `.p12` 파일이 디스크에 보임 |
| 3 | 3단계 envelope | `status: "success"`, 프로필 이름 반환 |
| 4 | 프로필 활성 | `list-profiles`가 프로필을 `active: true`로 표시 |
| 5 | 프로필로 빌드 | `tizen-build-project`가 완료되고 서명된 `.tpk`/`.wgt` 생성 |

### Samsung 경로

| # | 확인 항목 | 예상 결과 |
|---|-----------|-----------|
| 6 | 5단계 envelope | `status: "success"`, `cert_path`가 `keystore/samsung/<profile-name>/` 아래 |
| 7 | 브라우저 로그인 성공 | Samsung 계정 로그인 완료; 5분 후 타임아웃 없음 |
| 8 | 토큰 캐시됨 | 이후 Samsung 작업에서 재로그인 요청 없음 |
| 9 | 7단계 envelope | `status: "success"`, 배포자 인증서 경로 반환 |
| 10 | 8단계 프로필 | 프로필 등록 및 활성 |
| 11 | Samsung 프로필로 빌드 | `tizen-build-project`가 Samsung 서명 `.tpk`/`.wgt`로 완료 |
| 12 | 비밀번호 표시 | `samsung-reveal-password`가 평문 비밀번호 반환 (OS 자격 증명 저장소 사용 가능한 경우) |

### 실패 경로 (에러 매핑)

| # | 시나리오 | 예상 결과 |
|---|----------|-----------|
| 13 | 약한 비밀번호 (예: "pass") | `error_category: "invalid_parameters"` — "password must be at least 8 characters..." |
| 14 | 인증서 이미 존재 | `error_category: "cert_already_exists"` — 고유한 `--file` 또는 `--profile-name` 선택 |
| 15 | Samsung 로그인 타임아웃 | `error_category: "samsung_auth_timeout"` — 재시도 후 5분 내 로그인 완료 |
| 16 | DUID 목록 비어 있음 | `error_category: "invalid_parameters"` — 배포자 인증서에 최소 하나의 DUID 필요 |
| 17 | 프로필 이름 없음 (distributor2, remove) | `error_category: "profile_not_found"` — `list-profiles`로 이름 확인 |
| 18 | SDK 미설치 | `error_category: "sdk_path_not_set"` — `tizen-sdk-install` 먼저 실행 |

---

## 키보드 단축키 및 팁

- **자연어:** 원하는 것을 평문 (한국어 또는 영어)으로 설명하면 됩니다. Claude는 "Samsung 작성자 인증서 만들어줘"와 "Create a profile called Testing with my dev cert"를 모두 이해합니다.
- **비밀번호 입력:** 비밀번호를 요구하면 **마스킹된 터미널 프롬프트**에서 대화형으로 입력됩니다 — 입력할 때 문자가 보이지 않습니다. 이는 안전하며 비밀번호가 채팅, 명령 기록, 프로세스 목록에 노출되지 않습니다.
- **프로필 이름 복사-붙여넣기:** 서명 프로필 이름은 대소문자를 구분합니다. `MyProfile`을 생성한 경우, 이후 명령에서 `myprofile`이 아닌 정확히 `MyProfile`을 사용하세요.
- **작성자 인증서 재사용:** 단일 작성자 인증서를 여러 서명 프로필에 사용할 수 있습니다. 재생성할 필요가 없습니다.
- **두 경로 모두 테스트:** 먼저 로컬 프로필을 생성(빠름)하여 빌드를 테스트한 후, 배포를 위해 Samsung 인증서를 추가하세요 (로그인 필요).
- **비밀번호 노출 없음:** 비밀번호는 명령줄 인수로 전달되거나 로그에 출력되지 않습니다. 항상 대화형 프롬프트를 사용합니다.

---

## 관련 문서

- 전체 에이전트 개요: [README.en.md](../README.en.md)
- 스킬 레퍼런스: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (tizen-certificate-manager)
- 웹앱 디버깅 시나리오: [scenario-webapp-debug-walkthrough.md](../debug/scenario-webapp-debug-walkthrough.md)

- 네이티브 앱 디버깅 시나리오: [scenario-native-app-walkthrough.en.md](../project/scenario-native-app-walkthrough.en.md)

- 기술 레퍼런스: [certificate-manager-guide.md](certificate-manager-guide.md)
