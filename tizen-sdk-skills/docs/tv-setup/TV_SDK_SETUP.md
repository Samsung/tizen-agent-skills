# Tizen TV SDK 설치 가이드

이 문서는 Samsung TV 앱 개발을 위한 Tizen SDK 및 Tizen TV SDK 확장 설치 과정을 단계별로 설명합니다.

## 개요

Samsung TV 앱을 개발하려면 다음 두 가지 구성 요소를 설치해야 합니다:

1. **Tizen SDK** (기본 SDK) — 핵심 도구, CLI, 에뮬레이터, 플랫폼 패키지 제공
2. **Tizen TV SDK** (TV-SAMSUNG-Public 확장) — TV 전용 프로필, 에뮬레이터 리소스, 도구 추가

TV SDK는 기본 Tizen SDK가 먼저 설치되어야 하는 **확장 패키지**입니다.

## 사전 요구 사항

- **Node.js 18+** 설치 및 PATH 등록 필요
- 홈 디렉토리 드라이브에 **15 GB** 이상의 여유 공간
- **Linux/macOS/Windows** 운영체제

## 설치 흐름

### 1단계: 사전 요구 사항 확인

`sdk-install-cli.js` 사전 확인이 자동으로 다음을 검증합니다:

- Node.js 설치 여부 및 PATH 등록 확인
- 디스크 여유 공간 확인 (최소 15 GB)

```
[tizen-sdk] Node.js OK (v22.16.0). Continuing.
[tizen-sdk] Disk space OK (109.46 GB free). Proceeding to install.
```

### 2단계: Tizen SDK (기본 SDK) 설치

기본 Tizen SDK는 **121개 패키지**로 구성되며, 다음을 포함합니다:

- Tizen Platform 10.0
- CLI 도구 (sdb, package-manager-cli 등)
- 에뮬레이터 (QEMU, emulator-manager)
- 네이티브 툴체인 (cross-arm-gcc, cross-aarch64-gcc, cross-x86-64-gcc 등)
- 모든 아키텍처용 GDB 디버거
- Web IDE 도구, 인증서 생성기 등

**설치 방법 (Linux에서 Cline 사용 시):**

```bash
# Phase 2: nohup로 백그라운드에서 설치 프로그램 실행
nohup bash "<installer.sh 경로>" > /tmp/tizen-sdk-install.log 2>&1 & \
jobs -p

# 25초마다 상태 폴링하여 STATUS=done 확인
sleep 25 && bash "<installer.sh 경로>" --status
```

**결과:**

```
STATUS=done EXIT=0
```

**검증:**

```
[tizen-sdk] SDK is already installed (sdk.info found)
[tizen-sdk] SDK path configured automatically: /home/user/tizen-sdk → ~/.tizen.sdk.path.config
```

- SDK 설치 경로: `/home/user/tizen-sdk`
- SDK 경로 설정 파일: `~/.tizen.sdk.path.config`
- 버전: 10.0

### 3단계: Tizen TV SDK (확장) 설치

기본 Tizen SDK가 설치되면 TV SDK 확장을 설치할 수 있습니다.

**사전 확인:**

```
[tizen-tv-sdk] Tizen SDK found at /home/user/tizen-sdk. Continuing.
→ TV SDK is NOT installed. Proceed to Phase 2.
```

**설치 방법 (Linux에서 Cline 사용 시):**

```bash
# Phase 2: 백그라운드에서 TV SDK 설치 프로그램 실행
nohup bash "<tv-sdk-install.sh 경로>" --sdk-path="/home/user/tizen-sdk" > /tmp/tizen-tv-sdk-install.log 2>&1 & \
jobs -p
```

**TV SDK 패키지 (총 22개):**

TV SDK 확장은 다음 패키지를 다운로드하고 병합합니다:

| #    | 패키지                                | 설명                        |
| ---- | ------------------------------------- | --------------------------- |
| 1–4  | TV-SAMSUNG-Public + 종속 패키지       | 핵심 TV 확장 패키지         |
| 5–19 | 에뮬레이터 리소스, IDE 플러그인       | TV 에뮬레이터 및 도구       |
| 20   | tv-samsung-emulator-manager-resources | TV 에뮬레이터 매니저 리소스 |
| 21   | TV-SAMSUNG-Emulator-Utils             | TV 에뮬레이터 유틸리티      |
| 22   | tv-samsung-emulator-resources         | TV 에뮬레이터 리소스        |

**결과:**

```
[OK] TV SDK package result: OK 18 / skipped 4 / failed 0 (total 22)
[OK] .tv-sdk-installed created: /home/user/tizen-sdk/.tv-sdk-installed
[OK] Tizen TV SDK extension installation completed!
```

**검증:**

```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "TV-SAMSUNG-Public",
        "status": "installed",
        "version": "extension"
      }
    ],
    "installation_status": "completed"
  }
}
```

## 설치 요약

| 구성 요소     | 상태      | 경로                                    | 버전      |
| ------------- | --------- | --------------------------------------- | --------- |
| Tizen SDK     | ✅ 설치됨 | `/home/user/tizen-sdk`                   | 10.0      |
| TV SDK 확장   | ✅ 설치됨 | `/home/user/tizen-sdk` (병합됨)          | extension |
| SDK 경로 설정 | ✅ 작성됨 | `~/.tizen.sdk.path.config`              | —         |
| TV SDK 마커   | ✅ 생성됨 | `/home/user/tizen-sdk/.tv-sdk-installed` | —         |

## CDN 미러 선택

설치 프로그램은 시스템의 시간대 오프셋에 따라 가장 빠른 CDN 미러를 자동으로 선택합니다:

| UTC 오프셋 범위 | 미러      | URL                                                           |
| --------------- | --------- | ------------------------------------------------------------- |
| UTC-12 .. UTC-5 | Global    | `https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official`       |
| UTC-4 .. UTC-1  | Brazil    | `https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official`    |
| UTC+0 .. UTC+4  | Official  | `https://download.tizen.org/sdk/tizenstudio/official`         |
| UTC+5 .. UTC+12 | Singapore | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official` |

## TV SDK 설치 확인 방법

TV SDK 설치 여부를 확인할 때 다음 방법을 사용하세요:

### ✅ 올바른 방법

1. **`list-templates --type tv`** — TV 템플릿 목록을 확인합니다. 빈 배열(`[]`)이 반환되면 TV SDK가 미설치된 것입니다. TV 템플릿이 존재하면 설치된 것으로 판정합니다.

2. **`tv-sdk-install` 재실행 (멱등성)** — `tv-sdk-install` CLI는 `.tv-sdk-installed` 마커를 확인하여 이미 설치되어 있으면 즉시 success를 반환합니다. 설치 여부 확인 용도로 재실행해도 안전합니다.

### ❌ 잘못된 방법

- **`list-platform --profile tv`** — 이 명령은 `--profile` 파라미터를 **무시**합니다. TV 프로필이 설치되지 않았어도 기본 플랫폼 목록을 반환하므로, TV SDK가 설치된 것으로 **오판(false positive)** 을 유발합니다.

### 요약

| 방법                         | 신뢰성       | 비고                                         |
| ---------------------------- | ------------ | -------------------------------------------- |
| `list-templates --type tv`   | ✅ 신뢰 가능 | 빈 배열 = 미설치, 항목 있음 = 설치됨         |
| `tv-sdk-install` 재실행      | ✅ 신뢰 가능 | 멱등성 보장, `.tv-sdk-installed` 마커로 판정 |
| `list-platform --profile tv` | ❌ 오판 위험 | `--profile` 무시됨, false positive 유발      |

## 다음 단계

Tizen TV SDK가 설치되었으므로 다음을 수행할 수 있습니다:

1. **TV 프로젝트 생성** — `tizen-create-project` 스킬을 사용하여 새 Samsung TV 앱을 생성합니다
2. **프로젝트 빌드** — `tizen-build-project` 스킬을 사용하여 `.wgt` 패키지를 빌드합니다
3. **디바이스/에뮬레이터에 설치** — `tizen-install-app` 스킬을 사용하여 배포 및 실행합니다
4. **TV 에뮬레이터 생성** — `tizen-create-emulator` 스킬을 사용하여 Samsung TV 에뮬레이터 VM을 생성합니다
5. **인증서 관리** — `tizen-certificate-manager` 스킬을 사용하여 서명 프로필을 생성합니다

## 문제 해결

### TV SDK 설치 시 "Tizen SDK is not installed" 오류

TV SDK는 확장 패키지이므로 기본 Tizen SDK가 필요합니다. 먼저 `tizen-sdk-install` 스킬을 사용하여 Tizen SDK를 설치한 후 TV SDK 설치를 다시 시도하세요.

### 설치가 멈춘 것 같은 경우

설치 로그를 확인하세요:

```bash
tail -20 /tmp/tizen-sdk-install.log        # 기본 SDK 로그
tail -20 /tmp/tizen-tv-sdk-install.log     # TV SDK 로그
```

### 강제 재설치

```bash
# 기본 SDK 강제 재설치
node "<sdk-install-cli.js>" --force

# TV SDK 강제 재설치
bash "<tv-sdk-install.sh>" --sdk-path="/home/user/tizen-sdk" --force
```
