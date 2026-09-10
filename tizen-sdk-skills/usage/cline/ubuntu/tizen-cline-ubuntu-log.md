# Tizen SDK 설치 및 WebApp 빌드/실행 대화 요약

## 개요

사용자의 요청에 따라 Tizen SDK 설치부터 WebApp 프로젝트 생성, 빌드, 에뮬레이터 실행, 앱 설치 및 실행까지의 전체 과정을 수행했습니다.

---

## 1. Tizen SDK 설치

### 요청

> 타이젠 sdk 설치해줘

### 사전 점검

- SDK 설치 사전 점검 CLI 실행 (`sdk-install-cli.js`)
- 결과: SDK가 설치되어 있지 않음 (`status: "failure"`)
- 설치 스크립트 경로 확인: `/home/user/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/1.1.0/scripts/tizen-sdk-install/tizen-sdk-install.sh`

### 설치 진행

- 백그라운드에서 설치 스크립트 실행
- 감지된 OS: Ubuntu (pkg_list: pkg_list_ubuntu-64)
- 설치 경로: `/home/user/tizen-sdk`
- 대상 플랫폼: TIZEN-10.0 (version 0.0.36)
- 총 124개 패키지 다운로드 및 설치
  - 성공: 121개
  - 스킵: 3개 (업스트림 미게시)
    - `10.0-emulator-qemu-x86-v2`
    - `10.0-emulator-kernel-x86-v2`
    - `tizen-10.0-rs-emulator.core`
  - 실패: 0개

### 설치 주요 패키지

| 패키지                          | 설명                    |
| ------------------------------- | ----------------------- |
| TIZEN-10.0                      | Tizen 10.0 플랫폼       |
| TIZEN-10.0-WebAppDevelopment    | 웹앱 개발 도구          |
| TIZEN-10.0-NativeAppDevelopment | 네이티브 앱 개발 도구   |
| TIZEN-10.0-Emulator             | 에뮬레이터              |
| NativeToolchain-Gcc-14.2        | 네이티브 툴체인         |
| cross-arm-gcc-14.2              | ARM 크로스 컴파일러     |
| cross-aarch64-gcc-14.2          | AArch64 크로스 컴파일러 |
| cross-riscv64-gcc-14.2          | RISC-V 크로스 컴파일러  |
| cross-x86-64-gcc-14.2           | x86-64 크로스 컴파일러  |
| Emulator                        | 에뮬레이터 엔진         |
| sdb                             | Tizen 디버그 브릿지     |
| Certificate-Manager             | 인증서 관리자           |

### 설치 검증

- `sdk.info` 파일 생성 확인: `/home/user/tizen-sdk/sdk.info`
- 환경 변수 PATH 설정: `/home/user/.bashrc`
- 버전 확인: `tz --version` → `Tizen cli v10.3.9`

### 최종 검증 결과

```json
{
  "command": "tizen-sdk sdk install",
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "Tizen Platforms (10)",
        "status": "installed",
        "version": "10.0"
      },
      { "name": "Tizen SDK Tools", "status": "installed", "version": "10.0" }
    ],
    "installation_status": "completed"
  }
}
```

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 2. Tizen WebApp 프로젝트 생성

### 요청

> 타이젠 앱 생성해줘

### 앱 타입 선택

- 사용자 선택: **WebApp (웹 앱)**

### 템플릿 선택

- 사용 가능한 템플릿: `Basic`, `WebService`
- 사용자 선택: **Basic (기본 웹앱 템플릿)**

### 앱 이름

- 사용자 입력: **MyTizenWebApp**

### 프로젝트 생성

- 프로젝트 경로: `/home/user/clinetest/MyTizenWebApp`
- 생성 명령: `create-project-cli.js webapp Basic /home/user/clinetest MyTizenWebApp`

### 생성 결과

```json
{
  "command": "tizen-sdk project create",
  "status": "success",
  "result": {
    "project_name": "MyTizenWebApp",
    "project_type": "webapp",
    "template_name": "Basic",
    "project_path": "/home/user/clinetest/MyTizenWebApp",
    "status": "created"
  }
}
```

### 프로젝트 구조

```
MyTizenWebApp/
├── .project
├── .tproject
├── config.xml
├── icon.png
├── index.html
├── MyTizenWebApp.code-workspace
├── tizen_web_project.yaml
├── css/
│   └── style.css
├── images/
│   └── tizen_32.png
└── js/
    └── main.js
```

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 3. 프로젝트 빌드

### 요청

> 앱 빌드 해줘

### 빌드 진행

- 빌드 타입: **Debug**
- 빌드 명령: `build-project-cli.js /home/user/clinetest/MyTizenWebApp Debug`

### 빌드 결과

```json
{
  "command": "tizen-sdk project build",
  "status": "success",
  "duration_ms": 146,
  "result": {
    "artifacts": [
      {
        "path": "/home/user/clinetest/MyTizenWebApp/Debug/MyTizenWebApp.wgt",
        "format": ".wgt",
        "size_bytes": 39293
      }
    ],
    "build_time_ms": 146
  }
}
```

- 빌드 산출물: `MyTizenWebApp.wgt` (39,293 bytes)

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 4. 에뮬레이터 실행

### 요청

> 에뮬레이터 실행해줘

### 에뮬레이터 실행

- 디바이스 매니저 CLI 실행 (`device-manager-cli.js`)
- 연결된 디바이스가 없어 자동으로 에뮬레이터 시작
- 에뮬레이터 VM: `tizen-vm-default`

### 실행 결과

```json
{
  "command": "tizen-sdk device connect",
  "status": "success",
  "duration_ms": 14850,
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "emulator_launched": true,
    "status": "connected"
  }
}
```

- 디바이스 시리얼: `emulator-26101`
- `sdb devices` 확인: `emulator-26101  device  tizen-vm-default`

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 5. 앱 설치 및 실행

### 요청

> 앱 실행해줘

### 앱 설치 및 실행

- 패키지 경로: `/home/user/clinetest/MyTizenWebApp/Debug/MyTizenWebApp.wgt`
- 대상 디바이스: `emulator-26101`
- 설치 후 실행: `run`
- 설치 명령: `install-app-cli.js <wgt경로> emulator-26101 run`

### 설치 및 실행 결과

```json
{
  "command": "tizen-sdk project install",
  "status": "success",
  "duration_ms": 1895,
  "result": {
    "package_path": "/home/user/clinetest/MyTizenWebApp/Debug/MyTizenWebApp.wgt",
    "device_serial": "emulator-26101",
    "app_id": "0rNq3P49Qz.MyTizenWebApp",
    "installation_status": "completed",
    "app_launched": true
  }
}
```

- 앱 ID: `0rNq3P49Qz.MyTizenWebApp`
- 설치 상태: `completed`
- 앱 실행: `true` (에뮬레이터에서 앱이 실행됨)

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 전체 진행 요약

| 단계                 | 상태    | 비고                             |
| -------------------- | ------- | -------------------------------- |
| Tizen SDK 10.0 설치  | ✅ 완료 | 121개 패키지, tz v10.3.9         |
| WebApp 프로젝트 생성 | ✅ 완료 | MyTizenWebApp, Basic 템플릿      |
| Debug 빌드           | ✅ 완료 | MyTizenWebApp.wgt (39KB)         |
| 에뮬레이터 실행      | ✅ 완료 | emulator-26101 연결              |
| 앱 설치 및 실행      | ✅ 완료 | app_id: 0rNq3P49Qz.MyTizenWebApp |

---

## 환경 정보

- **운영체제**: Linux 6.8 (Ubuntu)
- **Tizen SDK 경로**: `/home/user/tizen-sdk`
- **Tizen SDK 버전**: 10.0 (CLI v10.3.9)
- **프로젝트 경로**: `/home/user/clinetest/MyTizenWebApp`
- **빌드 산출물**: `/home/user/clinetest/MyTizenWebApp/Debug/MyTizenWebApp.wgt`
- **에뮬레이터 시리얼**: `emulator-26101`
- **앱 ID**: `0rNq3P49Qz.MyTizenWebApp`
- **작업 일시**: 2026년 7월 10일
