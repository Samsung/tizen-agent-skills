# 사용자 지정 저장소 URL로 SDK 설치

[English](CUSTOM_REPOSITORY_INSTALL.en.md) | 한국어

타임존으로 자동 선택되는 공개 CDN 미러 대신 **사용자가 지정한 패키지 저장소 URL**에서 Tizen
SDK를 설치합니다 — 사내 미러, 빌드 서버 산출물, 팀 미러, 로컬 HTTP 서버 등.

설치의 나머지 동작은 모두 동일합니다: 같은 경로, 같은 `sdk.info` 완료 마커, 같은 자동
`sdk-init`, 같은 환경 변수 설정. **패키지 출처**만 달라집니다.

- 스킬: `tizen-sdk-install-custom-repo`
- 에이전트: `tizen-sdk-install-custom-repo`
- 레퍼런스: [../SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) § 17
- 영문 문서: [CUSTOM_REPOSITORY_INSTALL.en.md](CUSTOM_REPOSITORY_INSTALL.en.md)

---

## 1. 유효한 저장소 URL의 조건

Tizen 패키지 저장소는 루트에 **패키지 목록** 파일을 제공합니다:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}

OS   = windows | ubuntu | macos      (설치를 실행하는 머신에서 결정)
ARCH = 64 | 32
```

예: `pkg_list_windows-64`, `pkg_list_ubuntu-64`, `pkg_list_ubuntu-32`, `pkg_list_macos-64`.

이 파일은 설치 **전체**를 구동하는 인덱스입니다 — 패키지 이름, 버전, 각 zip의 `Path`,
`Install-dependency`, `C-SelectedGroup`. 이 파일이 없으면 설치할 대상 자체가 없습니다.

| 조건                                                          | 결과                                        |
| ------------------------------------------------------------- | ------------------------------------------- |
| `{URL}/pkg_list_{OS}-64` 접근 가능                            | ✅ 유효 — 64비트 목록으로 설치 진행          |
| `-64`는 없지만 `{URL}/pkg_list_{OS}-32` 접근 가능             | ✅ 유효 — 32비트 목록으로 설치 진행          |
| 둘 다 접근 불가                                                | ❌ **거부 — 아무것도 다운로드하지 않음**     |
| URL이 비어 있음 / `http(s)` 아님 / 형식 오류                  | ❌ 거부 (네트워크 요청 없음)                 |
| URL이 디렉터리가 아니라 `pkg_list` 파일 자체를 가리킴          | ❌ 거부 (명시적 메시지 제공)                 |

`-64`를 먼저 확인하고 그다음 `-32`를 확인하므로, 32비트만 제공하는 미러도 추가 플래그 없이
동작합니다.

**왜 선제적으로 거부하는가:** 전체 설치는 약 121개 패키지 zip을 해석하고 다운로드합니다.
패키지 목록이 없는 URL로 시작하면 121번 연속 실패하고 SDK 디렉터리가 반쯤 채워진 상태로
남습니다. 사전 검증은 이를 단 하나의 명확한 에러로 바꿉니다.

### 검증 방식

1. `HEAD {URL}/pkg_list_{OS}-64`
2. HEAD가 실패하면 같은 URL에 `Range: bytes=0-0`(1바이트) `GET` — 일부 서버는 HEAD를
   거부(405/501)하면서 GET은 정상 제공하므로, HEAD만으로 판단하면 정상 저장소를 잘못
   거부하게 됩니다
3. `-32`에 대해 동일하게 반복
4. 리다이렉트를 따라가며, 두 후보 중 하나라도 2xx면 유효

검증 로직은 공용 스크립트 헬퍼(`scripts/lib/common.sh` → `validate_pkg_repo_url`,
`scripts/lib/common.ps1` → `Test-PkgRepoUrl`)에 **한 번만** 구현되어 있고, Node 계층은
이를 재구현하지 않고 설치 스크립트의 검증 모드를 호출합니다. 덕분에 셸 계층과 JS 계층의
판정이 어긋날 수 없고, 사내 미러가 대부분 필요로 하는 머신의 프록시/인증서 설정도 그대로
적용됩니다.

---

## 2. 사용법

### 검증만 (읽기 전용, 수 초)

```bash
# CLI 러너
node <plugin>/lib/cli/validate-repo-url-cli.js "<repo-url>"

# tizen-cli
tizen-cli tizen-sdk validate-repo-url --repo-url "<repo-url>"

# 스크립트 (Node.js 불필요)
bash   scripts/tizen-sdk-install/tizen-sdk-install.sh  --repo-url "<url>" --validate-repo-url
powershell -File scripts\tizen-sdk-install\tizen-sdk-install.ps1 -RepoUrl "<url>" -ValidateRepoUrl
bash   scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh --repo-url "<url>" --validate-only
```

종료 코드 `0` = 유효, `1` = 유효하지 않음.

### 설치

```bash
# CLI 러너 (사전 체크 → 설치 명령 반환)
node <plugin>/lib/cli/sdk-install-custom-repo-cli.js "<repo-url>" [platform-version] [--force]

# tizen-cli
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "<url>" [--platform-version 11.0] [--force]
tizen-cli tizen-sdk sdk-install --repo-url "<url>"     # 동일한 흐름의 단축 형태

# 스크립트 (실제 10-15분 설치 수행)
bash scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh --repo-url "<url>"
powershell -File scripts\tizen-sdk-install-custom-repo\tizen-sdk-install-custom-repo.ps1 -RepoUrl "<url>"
```

### 옵션

| 옵션 (bash / PowerShell / tizen-cli)                            | 설명                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `--repo-url <url>` / `-RepoUrl <url>` / `--repo-url <url>`      | **필수.** `pkg_list_{OS}-{64,32}`를 제공하는 저장소 base URL                |
| `--platform <ver>` / `-Platform <ver>` / `--platform-version`   | Tizen 플랫폼 버전. 기본값 = 저장소가 제공하는 가장 높은 `TIZEN-X.Y`         |
| `--path <path>` / `-Path <path>`                                | 설치 경로. 기본값 `~/tizen-sdk`                                            |
| `--force` / `-Force` / `--force`                                | 이미 설치되어 있어도 재설치 — **기존 설치의 저장소를 바꾸려면 필수**        |
| `--validate-only` / `-ValidateOnly`                             | URL만 검증하고 종료                                                        |
| `--dry-run` / `-DryRun`                                         | 다운로드 없이 대상 패키지 목록만 출력                                      |
| `--detach` / `-Detach`                                          | 분리 실행. `--status` / `-Status`로 폴링                                    |
| `--status` / `-Status`, `--wait` / `-Wait`                       | 디스크에 기록된 실행 상태 조회 / 폴링                                      |

---

## 3. 흐름

```
installSdkFromRepo(repoUrl, platformVersion, force)
  │
  ├─ 1. Node.js 체크 (18+)                      ── 실패 → OS별 가이드와 함께 중단
  │
  ├─ 2. 저장소 URL 검증                          ── 실패 → 중단, 다운로드 없음
  │       ├─ 형식 (JS: 비어 있지 않음, http(s), pkg_list 파일 자체가 아님)
  │       └─ 접근성 (설치 스크립트의 검증 모드에 위임)
  │             {URL}/pkg_list_{OS}-64 → 그다음 -32 확인
  │
  ├─ 3. SDK 이미 설치됨? (sdk.info)
  │       └─ 예 → SUCCESS + 경고: 아무것도 다운로드되지 않았고, 기존 패키지는
  │                repository.info에 기록된 저장소에서 온 것임.
  │                요청한 URL로 재설치하려면 --force 사용
  │
  ├─ 4. 디스크 공간 체크 (15 GB, 홈 드라이브)     ── 실패 → 부족량과 함께 중단
  │
  └─ 5. suggested_fix로 설치 명령 반환  (Phase 2 — 백그라운드, 10-15분)
           │
           └─ tizen-sdk-install-custom-repo.{sh,ps1} --repo-url <url>
                 ├─ URL 재검증
                 └─ tizen-sdk-install.{sh,ps1} --repo-url <url> 에 위임
                       ├─ {URL}/pkg_list_{OS}-{64,32} 다운로드 및 파싱
                       ├─ 대상 플랫폼 결정 (--platform, 없으면 최고 TIZEN-X.Y)
                       ├─ Install-dependency + C-SelectedGroup + 추가 패키지 해석
                       ├─ {URL}{Path}에서 각 zip 다운로드, data/를 SDK 루트에 병합
                       ├─ sdk.info 및 ~/.tizen.sdk.path.config 작성 (자동 sdk-init)
                       ├─ .package/repository.info 작성  ← 사용자 지정 URL
                       └─ TIZEN_SDK_PATH / PATH 설정
```

2단계(Phase) 계약, 디스크에 남는 실행 마커(`.install-running` / `.install-result`),
재실행 시 이어받기(`.package/*.manifest`로 이미 받은 패키지 건너뛰기)는 일반 설치와
완전히 동일합니다 — [INSTALLATION_FLOW.md](INSTALLATION_FLOW.md) 참조.

---

## 4. "이미 설치됨" ≠ "이 저장소에서 설치됨"

3단계에서 기존 SDK가 발견되면 **아무것도 다운로드하지 않고** 조기 종료하므로, 그 패키지들은
여전히 이전에 설치한 저장소에서 온 것입니다. envelope가 이를 명시합니다:

```json
"warnings": [
  "SDK installation verified at /home/user/tizen-sdk (sdk.info found). To force a reinstall, run with --force (script flag: -Force).",
  "The requested repository was NOT applied: the existing SDK was installed from https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official. Re-run with --force to reinstall from http://mirror.example.com/packages/tizen_sdk_11.0."
]
```

설치 스크립트도 저장소 URL이 주어진 상태에서 "이미 설치됨" 조기 종료가 발생하면 같은 경고를
출력합니다. 실제로 저장소를 바꾸려면 `--force`를 사용하세요.

---

## 5. 후속 영향: repository.info

설치가 성공하면 다음 파일이 기록됩니다:

```
{SDK_PATH}/.package/repository.info
    # Tizen SDK Package Repository (custom repository supplied via --repo-url)
    Repository=http://mirror.example.com/packages/tizen_sdk_11.0
```

`tizen-update-package`와 `tizen-download-emulator-package`가 이 파일을 읽으므로,
**패키지 업데이트와 에뮬레이터 패키지도 같은 사용자 지정 저장소**에서 내려받습니다 — 추가
설정이 필요 없습니다. 기록된 값은 언제든 확인할 수 있습니다:

```bash
node <plugin>/lib/cli/sdk-repo-info-cli.js          # result.current_repository
tizen-cli tizen-sdk sdk-repo-info
```

---

## 6. 에러 레퍼런스

| `error_code`            | `error_category`       | 원인                                                                              | 조치                                                     |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `TIZEN_SDK_REPO_E001`   | `repo_url_invalid`     | URL 누락/빈 값, `http(s)` 아닌 스킴, 형식 오류, 또는 `pkg_list` 파일을 가리킴      | pkg_list가 들어 있는 **디렉터리** URL을 전달              |
| `TIZEN_SDK_REPO_E002`   | `repo_url_unreachable` | 형식은 맞지만 `pkg_list_{OS}-{64,32}`를 가져올 수 없음                            | 잘못된 URL이거나, VPN/프록시 없이는 접근 불가한 사내 미러 |
| `TIZEN_SDK_SCRIPT_E001` | `script_not_found`     | 플러그인 캐시에 설치 스크립트가 없음                                              | setup 스크립트를 다시 실행해 `scripts/` 동기화            |
| `TIZEN_SDK_EXEC_E001`   | `execution_error`      | URL은 유효하고 SDK가 미설치 (Phase 1의 정상 결과)                                 | `errors[0].suggested_fix.command` 실행 (Phase 2)          |

`errors[0].details`에는 검증 시 시도한 모든 URL을 포함한 로그 마지막 줄들이 담깁니다.
사용자에게 거부 사유를 보고할 때 이 내용을 인용하세요.

### 자주 발생하는 실수

| 입력한 URL                                       | 문제                                    | 올바른 URL                          |
| ------------------------------------------------ | --------------------------------------- | ----------------------------------- |
| `https://host/repo/pkg_list_ubuntu-64`           | 디렉터리가 아니라 파일을 가리킴          | `https://host/repo`                 |
| `https://host/repo/binary`                       | `binary/`에는 zip만 있고 목록이 없음     | `https://host/repo`                 |
| `mirror.example.com/packages/tizen_sdk_11.0`    | 스킴 누락                                | `http://mirror.example.com/packages/tizen_sdk_11.0` |
| VPN 미연결 상태의 사내 미러                       | 이 머신에서 접근 불가                    | VPN 연결 / 프록시 설정              |

---

## 7. 파일 목록

| 파일                                                                          | 역할                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `common/lib/core/sdk.js`                                                      | `validateRepoUrl()`, `installSdkFromRepo()`, `normalizeRepoUrl()`, `checkRepoUrlSyntax()`, `readInstalledRepository()` |
| `common/lib/cli/sdk-install-custom-repo-cli.js`                               | 설치 사전 체크 CLI 러너                                               |
| `common/lib/cli/validate-repo-url-cli.js`                                     | 검증 전용 CLI 러너                                                    |
| `common/lib/envelope/response-formatter.js`                                    | `formatRepoUrlValidation()`, `formatCustomRepoInstall()`               |
| `common/lib/envelope/envelope.js`                                             | `REPO_URL_INVALID`, `REPO_URL_UNREACHABLE` 에러 코드                   |
| `common/scripts/lib/common.sh` / `common.ps1`                                 | `validate_pkg_repo_url` / `Test-PkgRepoUrl` (단일 검증 구현)            |
| `common/scripts/tizen-sdk-install-custom-repo/*.{sh,ps1}`                      | 검증 후 기본 설치 스크립트에 위임하는 프런트엔드                       |
| `common/scripts/tizen-sdk-install/*.{sh,ps1}`                                  | `--repo-url` / `-RepoUrl`, `--validate-repo-url` / `-ValidateRepoUrl`   |
| `common/skills/tizen-sdk-install-custom-repo/SKILL.md`                         | 스킬 (Claude Code / Cline)                                            |
| `common/agents/tizen-sdk-install-custom-repo.md`                               | 에이전트 (Claude Code)                                                |
| `tizen-cli/skills/tizen-sdk-install-custom-repo/SKILL.md`                      | 스킬 (tizen-cli 하네스)                                               |
| `tizen-cli/src/command-specs/sdk.ts`                                           | `sdk-install-custom-repo`, `validate-repo-url` 명령                    |
| `common/lib/tests/sdk-repo-url.test.js`                                        | URL 정규화 / 형식 거부 테스트                                         |
