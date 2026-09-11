# Tizen 인증서 관리자 가이드

[English](certificate-manager-guide.en.md) | 한국어

이 문서는 `tizen-sdk-skills` 플러그인의 전체 인증서 관리 기능을 설명합니다.
**로컬 Tizen (자체 서명)** 인증서와 **Samsung 온라인 CA** 인증서를 모두 다룹니다.
CLI 러너 (스킬/에이전트 경로)와 `tizen-cli` 명령 인터페이스의 사용 예를 포함합니다.

---

## 목차

- [사전 조건](#사전-조건)
- [아키텍처 개요](#아키텍처-개요)
- [로컬 Tizen 인증서](#로컬-tizen-인증서)
  - [작성자 인증서 생성](#작성자-인증서-생성)
  - [번들 배포자 인증서 목록 조회](#번들-배포자-인증서-목록-조회)
  - [서명 프로필 생성](#서명-프로필-생성)
  - [프로필 조회 / 활성화 / 제거](#프로필-조회--활성화--제거)
  - [배포자 키 2 설정](#배포자-키-2-설정)
  - [인증서 가져오기](#인증서-가져오기)
  - [인증서 검사](#인증서-검사)
  - [SDK 데이터 경로 확인](#sdk-데이터-경로-확인)
- [Samsung 온라인 CA 인증서](#samsung-온라인-ca-인증서)
  - [Samsung 작성자 인증서 생성](#samsung-작성자-인증서-생성)
  - [Samsung 배포자 인증서 생성](#samsung-배포자-인증서-생성)
  - [기존 Samsung .p12 가져오기](#기존-samsung-p12-가져오기)
  - [Samsung 서명 프로필 생성](#samsung-서명-프로필-생성)
  - [Samsung 인증서 생성 취소](#samsung-인증서-생성-취소)
  - [Samsung 로그인 (독립 실행)](#samsung-로그인-독립-실행)
  - [저장된 Samsung 비밀번호 표시](#저장된-samsung-비밀번호-표시)
- [DUID 유틸리티](#duid-유틸리티)
  - [DUID 파싱](#duid-파싱)
  - [파일에서 DUID 가져오기](#파일에서-duid-가져오기)
  - [디바이스에서 DUID 획득](#디바이스에서-duid-획득)
  - [모든 디바이스에서 DUID 획득](#모든-디바이스에서-duid-획득)
- [전체 워크플로우](#전체-워크플로우)
  - [로컬 Tizen 프로필 (엔드투엔드)](#로컬-tizen-프로필-엔드투엔드)
  - [Samsung 프로필 (엔드투엔드)](#samsung-프로필-엔드투엔드)
- [에러 코드 참조](#에러-코드-참조)
- [파일 위치](#파일-위치)

---

## 사전 조건

- **Tizen SDK** 설치 및 초기화 (`tizen-sdk-install` → `tizen-sdk-init`)
- **Node.js 18+** (CLI 러너용)
- Samsung 인증서의 경우: **Samsung 계정** 및 연결된 Tizen 디바이스 (DUID용)
- 로컬 인증서의 경우: 네트워크 또는 Samsung 계정 불필요
- 프록시 환경에서 Samsung 인증서 사용 시: `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` 환경변수 설정 — Samsung API 클라이언트는 표준 프록시 규칙을 따릅니다

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                     사용자 요청                                │
│         "Create a Samsung certificate" / "인증서 만들어줘"    │
└──────────────┬──────────────────────────┬────────────────────┘
               │                          │
      ┌─────────▼──────────┐   ┌──────────▼──────────┐
      │  Skill / Agent     │   │  tizen-cli          │
      │  (SKILL.md)        │   │  (certificate.ts)   │
      └─────────┬──────────┘   └──────────┬──────────┘
                │                          │
                └──────────┬───────────────┘
                           │
               ┌───────────▼────────────┐
               │  cert-manager-cli.js   │
               │  (CLI Runner)          │
               └───────────┬────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
   ┌───────▼─────┐  ┌─────▼──────┐  ┌────▼──────────┐
   │ certificate  │  │ samsung-   │  │ samsung-      │
   │ .js (local)  │  │ cert.js    │  │ auth.js       │
   └─────────────┘  └─────┬──────┘  └───────────────┘
                          │
               ┌──────────┼──────────┐
               │          │          │
       ┌───────▼──┐  ┌───▼────┐  ┌─▼──────────────┐
       │ samsung- │  │ samsung│  │ samsung-       │
       │ api.js   │  │ duid.js│  │ pwd-store.js   │
       └──────────┘  └────────┘  └────────────────┘
```

| 모듈 | 책임 |
|------|------|
| `certificate.js` | 로컬 Tizen 작성자 인증서, 번들 배포자, 서명 프로필 |
| `samsung-cert.js` | Samsung 온라인 CA 작성자 및 배포자 인증서 생성, 가져오기, 프로필 생성 |
| `samsung-auth.js` | Samsung 계정 OAuth 흐름 (브라우저 로그인, 토큰 캐싱) |
| `samsung-api.js` | Samsung CA 엔드포인트와의 HTTPS 통신 (프록시 지원) |
| `samsung-duid.js` | DUID 파싱, 검증, 버전 감지, 디바이스 획득 |
| `samsung-pwd-store.js` | OS 수준 보안 비밀번호 저장 (wincrypt / security / secret-tool) |

---

## 로컬 Tizen 인증서

로컬 Tizen 인증서는 자체 서명, 무료, 네트워크 접속 불필요입니다. `Tizen Developers CA`가 발급하며 개발 및 테스트에 적합합니다.

### 작성자 인증서 생성

`<tizen-sdk-data>/keystore/author/` 아래에 로컬 `.p12` 작성자 인증서를 생성합니다.

**비밀번호 규칙:** 8자 이상, 대문자 1개 이상, 소문자 1개 이상, 숫자 1개 이상.

#### CLI 러너 (Skill / Agent) 경유

```bash
# CLI 러너 찾기
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/cert-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/cert-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done

# 기본
node "$CLI" generate-author --name "Jane Dev" --password "<password>"

# 커스텀 파일명 사용 (cert_already_exists 방지)
node "$CLI" generate-author --name "Jane Dev" --password "<password>" --file jane-dev-20260731

# 전체 메타데이터 포함
node "$CLI" generate-author --name "Jane Dev" --password "<password>" --file jane-dev \
  --email jane@example.com --organization Acme --department Mobile \
  --city Seoul --state Seoul --country KR
```

#### tizen-cli 경유

```bash
tizen-cli tizen-sdk certificate-manager \
  --action generate-author \
  --name "Jane Dev" \
  --password "<password>" \
  --file jane-dev
```

> **참고:** tizen-cli 명령 이름은 `certificate-manager`입니다 (`certificate-management`가 아님).

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "name": "Jane Dev",
    "file_name": "jane-dev",
    "cert_path": "<tizen-sdk-data>/keystore/author/jane-dev.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/author/jane-dev.pwd",
    "pwd_file_exists": true
  }
}
```

> **비밀번호 사이드카:** 일부 SDK 버전에서 `tz cert`가 `.pwd` 사이드카 파일을 생성하지 않습니다.
> 이제 러너가 직접 기록하고(평문, 모드 600) `pwd_file_created: true`와 경고를 반환합니다(이슈 #75).
> 그 기록마저 실패한 경우(예: Codex 샌드박스가 거부 — 권한 상승으로 재실행)에만 같은 비밀번호로
> 수동 복구하세요:
> ```bash
> echo -n '<password>' > "<tizen-sdk-data>/keystore/author/jane-dev.pwd"
> chmod 600 "<tizen-sdk-data>/keystore/author/jane-dev.pwd"
> ```

### 번들 배포자 인증서 목록 조회

SDK에 미리 빌드된 배포자 CA + 서명자 `.p12` 경로를 확인합니다. 아무것도 생성하지 않습니다 — 이들은 SDK에 포함되어 있습니다.

```bash
# 전체 조회
node "$CLI" list-distributors

# 유형별 필터
node "$CLI" list-distributors --type public

# 유형 및 버전별 필터
node "$CLI" list-distributors --type public --version new
```

**유형:** `public`, `partner`, `platform`
**버전:** `legacy`, `new`

> **tizen-cli 참고:** tizen-cli에서는 tizen-cli의 전역 `--version` 플래그와 충돌을 피하기 위해 `--version` 대신 `--distributor-version`을 사용하세요:
> ```bash
> tizen-cli tizen-sdk certificate-manager --action list-distributors --type public --distributor-version new
> ```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "<sdk-root>",
    "distributors": [
      { "type": "public", "version": "new", "ca_path": "...", "signer_path": "..." }
    ],
    "unavailable": [
      { "type": "platform", "version": "legacy" }
    ]
  }
}
```

### 서명 프로필 생성

기존 작성자 `.p12`와 번들 배포자 인증서를 결합하여 `tz security-profiles add`로 프로필을 등록합니다.

```bash
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<author-p12-path>" \
  --author-password "<author-password>" \
  --distributor-type public \
  --distributor-version new \
  --active
```

**선택 배포자 2:** 프로필 생성 시 두 번째 배포자 인증서(커스텀 `.p12` 또는 번들)를 추가:

```bash
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<author-p12-path>" \
  --author-password "<author-password>" \
  --distributor2-cert /path/to/dist2.p12 \
  --distributor2-password "<distributor2-password>" \
  --distributor2-ca /path/to/dist2-ca.cer \
  --active
```

**선택 커스텀 profiles.xml:** `--profiles-xml`로 커스텀 profiles.xml 경로 지정 (기본값: `<tizen-sdk-data>/profile/profiles.xml`):

```bash
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<author-p12-path>" \
  --author-password "<author-password>" \
  --profiles-xml /custom/path/to/profiles.xml
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyProfile",
    "active": true,
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "author_cert_path": "<author-p12-path>",
    "distributor": {
      "type": "public",
      "version": "new",
      "ca_path": "...",
      "signer_path": "..."
    },
    "distributor2": null
  }
}
```

### 프로필 조회 / 활성화 / 제거

```bash
node "$CLI" list-profiles
node "$CLI" set-active-profile --profile-name MyProfile
node "$CLI" remove-profile --profile-name MyProfile
```

세 명령 모두 `--profiles-xml <path>`로 커스텀 profiles.xml을 조작할 수 있습니다.

**list-profiles 결과:**

```json
{
  "status": "success",
  "result": {
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "active_profile": "MyProfile",
    "profiles": [
      {
        "name": "MyProfile",
        "active": true,
        "author": { "key_path": "...", "ca_path": "", "rootca_path": "" },
        "distributor": { "key_path": "...", "ca_path": "...", "rootca_path": "" },
        "distributor2": null
      }
    ]
  }
}
```

**set-active-profile 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyProfile",
    "previous_active_profile": "OldProfile",
    "active_profile": "MyProfile",
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml"
  }
}
```

**remove-profile 결과:**

```json
{
  "status": "success",
  "result": {
    "removed_profile": "MyProfile",
    "previous_active_profile": "MyProfile",
    "active_profile": null,
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "remaining_profiles": ["OtherProfile"]
  }
}
```

### 배포자 키 2 설정

기존 프로필의 두 번째 배포자 인증서를 추가하거나 교체합니다. 검증된 임시 profiles.xml 트랜잭션을 사용 — `tz` 성공 후에만 원본이 교체됩니다.

```bash
node "$CLI" set-distributor2 \
  --profile-name MyProfile \
  --author-password "<author-password>" \
  --distributor2-type partner \
  --distributor2-version new
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyProfile",
    "active": true,
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "distributor2": {
      "type": "partner",
      "version": "new",
      "ca_path": "...",
      "signer_path": "..."
    },
    "replaced": false
  }
}
```

### 인증서 가져오기

SDK `keytool`로 `.p12` 또는 `.cer`를 검증한 후 키스토어로 복사합니다.

```bash
node "$CLI" import-certificate \
  --source /path/to/existing.p12 \
  --password "<password>" \
  --certificate-type author \
  --target-file imported-author \
  --overwrite
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "certificate_type": "author",
    "source_path": "/path/to/existing.p12",
    "imported_path": "<tizen-sdk-data>/keystore/author/imported-author.p12",
    "format": "p12",
    "overwritten": false
  }
}
```

### 인증서 검사

제목, 발급자, 유효기간, 알고리즘, 일련번호, 핑거프린트를 반환합니다.

```bash
node "$CLI" inspect-certificate \
  --certificate /path/to/cert.p12 \
  --password "<password>"
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "certificate_path": "/path/to/cert.p12",
    "format": "p12",
    "metadata": {
      "alias": "author",
      "entry_type": "PrivateKeyEntry",
      "certificate_chain_length": 1,
      "subject": "CN=Jane Dev, O=Acme, C=KR",
      "issuer": "CN=Tizen Developers CA",
      "serial_number": "1",
      "valid_from": "Mon Jan 01 00:00:00 KST 2024",
      "valid_until": "Thu Dec 31 23:59:59 KST 2026",
      "signature_algorithm": "SHA256withRSA",
      "public_key_algorithm": "RSA",
      "version": "3",
      "fingerprints": {
        "md5": "AB:CD:...",
        "sha1": "AB:CD:...",
        "sha256": "AB:CD:..."
      }
    }
  }
}
```

### SDK 데이터 경로 확인

동적으로 해석된 모든 인증서 관리자 기본 경로를 반환합니다.

```bash
node "$CLI" get-sdk-data-path
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "<sdk-root>",
    "sdk_data_path": "<tizen-sdk-data>",
    "sdk_info_path": "<sdk-root>/sdk.info",
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "author_keystore": "<tizen-sdk-data>/keystore/author"
  }
}
```

---

## Samsung 온라인 CA 인증서

Samsung 온라인 CA 인증서는 Samsung의 인증 기관이 발급합니다. Samsung 계정 로그인(브라우저 기반 OAuth)이 필요하며, `<tizen-sdk-data>/keystore/samsung/<profileName>/` 아래에 저장됩니다.

> **`generate-author`를 Samsung 인증서로 대체하지 마세요.** 로컬 자체 서명 Tizen 인증서는 Samsung 배포용 앱을 서명할 수 없습니다.

### Samsung 작성자 인증서 생성

1. OpenSSL로 RSA 키 쌍 및 PKCS#10 CSR 생성
2. Samsung 계정 로그인을 위해 시스템 브라우저 열기 (5분 타임아웃)
3. CSR을 Samsung `/apis/v3/authors`에 제출
4. 서명된 인증서 + Samsung VD Author CA를 `author.p12`로 패키징
5. 비밀번호를 OS 수준 보안 저장소에 `author.pwd`로 저장

```bash
node "$CLI" generate-samsung-author \
  --profile-name MySamsungProfile \
  --identity "Your Name" \
  --password "<password>" \
  --organization "Company" \
  --department "Mobile" \
  --city "Seoul" \
  --state "Seoul" \
  --country "KR"
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "identity": "Your Name",
    "cert_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.pwd",
    "sdk_data_path": "<tizen-sdk-data>",
    "auth_source": "oauth-login",
    "user_id": "...",
    "user_email": "you@example.com"
  }
}
```

> **브라우저 로그인이 예상된 동작입니다.** 명령은 사용자가 Samsung 계정 로그인을 완료할 때까지 블로킹됩니다. 캐시된 유효한 토큰은 프롬프트 없이 재사용됩니다. 진행 중인 로그인을 중단하려면 `cancel-samsung-cert`를 사용하세요.

### Samsung 배포자 인증서 생성

1. RSA 키 쌍 및 DUID를 `subjectAltName` URN 항목으로 하는 배포자 CSR 생성
2. Samsung 계정 액세스 토큰 획득 (유효한 경우 캐시 재사용)
3. CSR을 Samsung `/apis/v1/distributors`에 제출 (주 배포자 인증서)
4. VD 모드(항상 활성화)에서 `/apis/v3/distributors`에 추가 제출하여 VD 인증서 획득
5. 결과 + 적절한 Samsung VD CA (public2 또는 partner2)를 `distributor.p12`로 패키징
6. 비밀번호를 OS 수준 보안 저장소에 `distributor.pwd`로 저장
7. 성공 후 캐시된 `samsung-auth-data.json` 삭제

```bash
# 인라인 DUID 목록 사용
node "$CLI" generate-samsung-distributor \
  --profile-name MySamsungProfile \
  --password "<password>" \
  --duid-list "1.0#DEV001,2.0#DEV002" \
  --privilege Public

# 파일에서 DUID 사용
node "$CLI" generate-samsung-distributor \
  --profile-name MySamsungProfile \
  --password "<password>" \
  --duid-file /path/to/duids.txt \
  --privilege Partner
```

**권한 수준:** `Public` (기본값) 또는 `Partner`.

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "privilege": "Public",
    "duid_count": 2,
    "cert_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/distributor.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/distributor.pwd",
    "sdk_data_path": "<tizen-sdk-data>",
    "auth_source": "oauth-login",
    "user_id": "...",
    "user_email": "you@example.com",
    "vd_mode": true,
    "device_version": 2
  }
}
```

> **VD 모드는 항상 활성화됩니다.** 배포자 흐름은 항상 v1(device-profile XML) 및 v3(PEM 인증서) 응답을 모두 가져옵니다. v3 인증서는 사용 가능한 경우 패키징에 사용됩니다.

### 기존 Samsung .p12 가져오기

기존 Samsung 발급 `.p12` 파일(Tizen Studio 또는 다른 머신에서)을 Samsung 프로필 디렉토리로 가져옵니다. 복사 전 `keytool`로 검증합니다.

```bash
# 작성자 인증서로 가져오기
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/author.p12 \
  --password "<password>" \
  --certificate-type author

# 배포자 인증서로 가져오기 (기존 덮어쓰기)
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/distributor.p12 \
  --password "<password>" \
  --certificate-type distributor \
  --overwrite
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "certificate_type": "author",
    "cert_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.pwd",
    "source_path": "/path/to/author.p12",
    "sdk_data_path": "<tizen-sdk-data>"
  }
}
```

### Samsung 서명 프로필 생성

Samsung 발급 `author.p12`와 `distributor.p12`를 사용(번들 SDK 배포자 인증서 대신)하여 `tz security-profiles add`로 서명 프로필을 생성합니다. 비밀번호는 명시적으로 제공되지 않는 한 OS 수준 보안 저장소(`.pwd` 파일)에서 복호화됩니다.

```bash
# .pwd 파일에서 비밀번호 복호화
node "$CLI" create-samsung-profile \
  --profile-name MySamsungProfile \
  --active

# 명시적 비밀번호 사용
node "$CLI" create-samsung-profile \
  --profile-name MySamsungProfile \
  --privilege Public \
  --author-password "<author-password>" \
  --distributor-password "<distributor-password>" \
  --active
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "privilege": "Public",
    "author_cert": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.p12",
    "distributor_cert": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/distributor.p12",
    "distributor_ca": "<plugin-assets>/samsung-tv-ca/vd_tizen_dev_public2.crt",
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "active": true,
    "message": "Samsung signing profile \"MySamsungProfile\" created successfully with Samsung-issued distributor certificate."
  }
}
```

> **Samsung 작성자 인증서와 번들 Tizen 배포자 인증서를 페어링하지 마세요.**
> Samsung 프로필에는 항상 `create-profile`이 아닌 `create-samsung-profile`을 사용하세요.

### Samsung 인증서 생성 취소

진행 중인 Samsung 계정 OAuth 인증 흐름을 중단합니다.

```bash
node "$CLI" cancel-samsung-cert
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "cancelled": true,
    "message": "Active Samsung authentication was cancelled."
  }
}
```

### Samsung 로그인 (독립 실행)

Samsung 계정 로그인만 수행하고 프로필에 토큰을 캐시합니다. 인증서 생성과 별도로 자격 증명을 확인할 때 유용합니다.

```bash
node "$CLI" samsung-login --profile-name MySamsungProfile
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "user_id": "...",
    "user_email": "you@example.com",
    "auth_source": "oauth-login",
    "validity_period_s": 86400
  }
}
```

### 저장된 Samsung 비밀번호 표시

Samsung 프로필의 저장된 비밀번호를 복호화하여 반환합니다.

```bash
node "$CLI" samsung-reveal-password --profile-name MySamsungProfile
```

**성공 결과:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.pwd",
    "password": "<decrypted-password>"
  }
}
```

---

## DUID 유틸리티

### DUID 파싱

원시 DUID 문자열을 파싱하고 정규화합니다: trim, 대문자 변환, 중복 제거, 검증, 최대 50개 항목 제한.

```bash
node "$CLI" parse-duids --duid-list "1.0#DEV001,2.0#DEV002,#DEV003"
```

**결과:**

```json
{
  "status": "success",
  "result": {
    "duids": ["1.0#DEV001", "2.0#DEV002", "#DEV003"],
    "skipped": [],
    "truncated": false
  }
}
```

### 파일에서 DUID 가져오기

파일을 읽고 내용을 DUID로 파싱합니다 (`parse-duids`와 동일한 정규화).

```bash
node "$CLI" import-duids --duid-file /path/to/duids.txt
```

### 디바이스에서 DUID 획득

`sdb capability`를 사용하여 연결된 Tizen 디바이스에서 DUID를 추출합니다.

```bash
# 첫 번째로 연결된 디바이스
node "$CLI" acquire-duid

# 시리얼로 특정 디바이스 지정
node "$CLI" acquire-duid --serial emulator-26101
```

**결과:**

```json
{
  "status": "success",
  "result": {
    "duid": "1.0#DEV001",
    "serial": "emulator-26101",
    "deviceName": "device"
  }
}
```

### 모든 디바이스에서 DUID 획득

연결된 모든 Tizen 디바이스를 순회하며 각각에서 DUID를 추출합니다.

```bash
node "$CLI" acquire-duids-all
```

**결과:**

```json
{
  "status": "success",
  "result": {
    "duids": [
      { "duid": "1.0#DEV001", "serial": "emulator-26101", "deviceName": "device" }
    ],
    "errors": []
  }
}
```

---

## 전체 워크플로우

### 로컬 Tizen 프로필 (엔드투엔드)

```bash
# 1. 작성자 인증서 생성
node "$CLI" generate-author --name "Jane Dev" --password "<password>" --file jane-dev

# 2. (선택) 사용 가능한 배포자 조회
node "$CLI" list-distributors

# 3. 서명 프로필 생성
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<cert_path from step 1>" \
  --author-password "<author-password>" \
  --distributor-type public \
  --distributor-version new \
  --active

# 4. 프로필로 빌드
# tz build -w /path/to/project -s MyProfile -b Debug
```

### Samsung 프로필 (엔드투엔드)

```bash
# 1. Samsung 작성자 인증서 생성 (브라우저 로그인 열림)
node "$CLI" generate-samsung-author \
  --profile-name MySamsungProfile \
  --identity "Your Name" \
  --password "<password>" \
  --organization "Company" \
  --country "KR"

# 2. 연결된 디바이스에서 DUID 획득
node "$CLI" acquire-duid
# 또는: node "$CLI" acquire-duids-all

# 3. DUID를 사용하여 Samsung 배포자 인증서 생성
node "$CLI" generate-samsung-distributor \
  --profile-name MySamsungProfile \
  --password "<password>" \
  --duid-list "1.0#DEV001" \
  --privilege Public

# 4. Samsung 서명 프로필 생성
node "$CLI" create-samsung-profile \
  --profile-name MySamsungProfile \
  --active

# 5. 프로필로 빌드
# tz build -w /path/to/project -s MySamsungProfile -b Debug
```

**대안 (기존 Samsung .p12 파일 가져오기):**

```bash
# 1. 기존 작성자 .p12 가져오기
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/author.p12 \
  --password "<password>" \
  --certificate-type author

# 2. 기존 배포자 .p12 가져오기
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/distributor.p12 \
  --password "<password>" \
  --certificate-type distributor

# 3. Samsung 서명 프로필 생성
node "$CLI" create-samsung-profile --profile-name MySamsungProfile --active
```

---

## 에러 코드 참조

### 로컬 Tizen 인증서 에러

| 코드 | 의미 | 조치 |
|------|------|------|
| `sdk_path_not_set` | SDK가 구성되지 않았거나 `tz`를 찾을 수 없음 | `tizen-sdk-install` / `tizen-sdk-init` 실행 |
| `cert_password_invalid` | 비밀번호가 너무 약함 | 8자 이상, 대문자 + 소문자 + 숫자 사용 |
| `cert_already_exists` | 대상 `.p12`가 이미 존재함 | 고유한 `--file` 또는 `--profile-name` 사용 |
| `cert_generation_failed` | `tz cert`가 파일을 생성하지 못함 | 포함된 `tz` stdout/stderr 표시 |
| `distributor_asset_not_found` | 유형+버전 조합이 존재하지 않음 | `list-distributors`로 사용 가능한 것 확인 |
| `profile_creation_failed` | `tz security-profiles add` 거부됨 | stdout/stderr 표시 |
| `profile_list_failed` | `tz security-profiles list` 실패 | stdout/stderr 표시 |
| `profile_update_failed` | `tz security-profiles set-active` 실패 | stdout/stderr 표시 |
| `profile_remove_failed` | `tz security-profiles remove` 실패 | stdout/stderr 표시 |
| `distributor2_update_failed` | 배포자 2 추가/교체 트랜잭션 실패 | stdout/stderr 표시; 원본 profiles.xml 보존됨 |
| `cert_import_failed` | `.p12`/`.cer` 가져오기 실패 | 비밀번호 및 파일 형식 확인 |
| `cert_inspection_failed` | `keytool`이 인증서를 검사할 수 없음 | 비밀번호 및 파일 형식 확인 |
| `invalid_parameters` | 필수 필드 누락 또는 무효 | 필수 인수 확인 |
| `io_error` | 파일 시스템 작업 실패 | 권한 및 디스크 공간 확인 |

### Samsung 온라인 CA 인증서 에러

| 코드 | 의미 | 조치 |
|------|------|------|
| `samsung_cert_generation_failed` | OpenSSL 키/CSR 또는 PKCS#12 패키징 실패 | 상세 에러 표시 |
| `samsung_ca_not_found` | 번들 Samsung VD CA 인증서 누락 | 플러그인 설치 문제 |
| `samsung_auth_failed` | Samsung 계정 인증 실패 | 메시지를 사용자에게 표시 |
| `samsung_auth_timeout` | 5분 내 브라우저 로그인 미완료 | 재시도 후 브라우저 로그인 완료 |
| `samsung_auth_port_unavailable` | 4794-4813 포트 범위에 빈 포트 없음 | 해당 포트를 점유한 프로그램 종료 |
| `samsung_auth_invalid_response` | 콜백 페이로드를 파싱할 수 없음 | 로그인 재시도 |
| `samsung_pwd_store_failed` | OS 자격 증명 저장소 실패 | wincrypt.exe (Windows) / Keychain (macOS) / secret-tool (Linux) 확인 |
| `samsung_api_failed` | Samsung CA가 요청을 거부함 | HTTP 401: `samsung-auth-data.json` 삭제 후 재시도. HTTP 403: 속도 제한, 대기. |
| `cert_import_failed` | `.p12` 가져오기 실패 | 비밀번호 및 파일 형식 확인 |
| `profile_not_found` | 필수 Samsung 인증서를 찾을 수 없음 | `generate-samsung-author` / `generate-samsung-distributor` 먼저 실행 |
| `profile_creation_failed` | `tz security-profiles add` 거부됨 | stdout/stderr 표시 |

---

## 파일 위치

모든 경로는 런타임에 동적으로 해석됩니다 — 하드코딩되지 않습니다.

| 산출물 | 위치 |
|--------|------|
| SDK 루트 | `~/.tizen.sdk.path.config`에서 |
| SDK 데이터 경로 | `<sdk-root>/sdk.info`의 `TIZEN_SDK_DATA_PATH`에서 |
| 로컬 작성자 인증서 | `<tizen-sdk-data>/keystore/author/<fileName>.p12` |
| 번들 배포자 | `<sdk-root>/tools/certificate-generator/certificates/distributor/sdk-<type>/` |
| 서명 프로필 | `<tizen-sdk-data>/profile/profiles.xml` |
| Samsung 작성자 인증서 | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.p12` |
| Samsung 작성자 비밀번호 | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.pwd` |
| Samsung 배포자 인증서 | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.p12` |
| Samsung 배포자 비밀번호 | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.pwd` |
| Samsung 인증 캐시 | `<tizen-sdk-data>/keystore/samsung/<profileName>/samsung-auth-data.json` |
| Samsung CSR (작성자) | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.csr` |
| Samsung CSR (배포자) | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.csr` |
| Samsung 서명 인증서 (작성자) | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.crt` |
| Samsung 서명 인증서 (배포자) | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.crt` |
| Samsung 디바이스 프로필 (v1) | `<tizen-sdk-data>/keystore/samsung/<profileName>/device-profile.xml` |
| Samsung VD CA 인증서 | 플러그인 자산: `assets/samsung-tv-ca/` |

> **인증 캐시 라이프사이클:** `samsung-auth-data.json` 파일은 `generate-samsung-author`(또는 `samsung-login`)에 의해 생성되며, `generate-samsung-distributor` 실행 성공 후 **자동으로 삭제됩니다**. 배포자 생성을 재실행해야 하는 경우, 캐시가 별도의 `samsung-login` 호출로 생성된 것이 아니라면 다시 로그인하라는 메시지가 표시됩니다.

### DUID 형식 참조

| 형식 | 버전 | 예시 |
|------|------|------|
| `#DEVICE001` | V0 (Gear2) | `#ABC123` |
| `1.0#DEVICE001` | V1 | `1.0#DEV001` |
| `2.0#DEVICE001` | V2 (기본값) | `2.0#DEV001` |
| `-DEVICE001` | VD 모드 | `-DEV001` |

### 플랫폼별 비밀번호 저장

| 플랫폼 | 백엔드 | `.pwd` 파일 내용 |
|--------|--------|-------------------|
| Windows | `wincrypt.exe` (DPAPI) | 암호화된 blob |
| macOS | Keychain (`security` 명령) | JSON 마커 `{ "backend": "macos-keychain" }` |
| Linux | libsecret (`secret-tool` 명령) | JSON 마커 `{ "backend": "linux-secret-tool" }` |
