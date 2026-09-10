# Tizen SDK 설치 및 WebApp 개발 작업 기록

**작업 일자:** 2026년 7월 10일  
**작업자:** Cline  
**운영체제:** Windows 10  
**작업 디렉토리:** `C:\Users\<username>\clinetest`

---

## 작업 개요

사용자 요청에 따라 다음 작업을 순차적으로 수행했습니다:

1. Tizen SDK 10.0 설치
2. Tizen WebApp 프로젝트 생성 (MyTizenWebApp)
3. 프로젝트 빌드 (Debug 모드)
4. Tizen 에뮬레이터 실행
5. 빌드된 앱을 에뮬레이터에 설치 및 실행

---

## 1. Tizen SDK 10.0 설치

### 1.1 스킬 활성화

`tizen-sdk-install` 스킬을 활성화하여 SDK 설치를 진행했습니다.

### 1.2 사전 확인 (Pre-check)

SDK 설치 상태를 확인하기 위해 pre-check CLI를 실행했습니다.

**CLI 러너 경로:**
```
C:\Users\<username>\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.1.0\lib\cli\sdk-install-cli.js
```

**결과:** SDK가 설치되어 있지 않음 (상태: failure)

**설치 스크립트 경로:**
```
C:/Users/<username>/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/1.1.0/scripts/tizen-sdk-install/tizen-sdk-install.ps1
```

### 1.3 SDK 설치 진행

PowerShell 스크립트를 백그라운드에서 실행하여 SDK를 설치했습니다.

- **설치 경로:** `C:\Users\<username>\tizen-sdk`
- **대상 플랫폼:** TIZEN-10.0 (버전 0.0.36)
- **총 패키지 수:** 125개

### 1.4 설치 중단 및 재개

첫 번째 설치 시도에서 97/125 패키지(cross-aarch64-gcc-14.2 다운로드 중)에서 프로세스가 중단되었습니다. `.install-running` 파일을 삭제한 후 설치 스크립트를 재실행하여 중단된 지점부터 설치를 재개했습니다.

- 이미 설치된 96개 패키지는 자동으로 건너뛰고 (skip)
- 나머지 28개 패키지를 추가로 다운로드 및 설치
- 2개 패키지는 upstream gap으로 인해 스킵 (10.0-emulator-qemu-x86-v2, 10.0-emulator-kernel-x86-v2)

### 1.5 설치 완료

**설치 결과 JSON Envelope:**
```json
{
  "command": "tizen-sdk sdk install",
  "status": "success",
  "duration_ms": 3,
  "result": {
    "packages": [
      { "name": "Tizen Platforms (10)", "status": "installed", "version": "10.0" },
      { "name": "Tizen SDK Tools", "status": "installed", "version": "10.0" }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "SDK installation verified at C:\\Users\\<username>\\tizen-sdk (sdk.info found)."
  ],
  "errors": []
}
```

**설치 요약:**
- 설치된 패키지: 총 123개 (125개 중 2개 upstream gap 스킵)
- 주요 구성 요소: Tizen 10.0 플랫폼, Native/Web/DotNET 개발 도구, 에뮬레이터, 툴체인 (GCC 14.2, GDB 15.1), SDB 등
- 환경 변수: `TIZEN_SDK_PATH=C:\Users\<username>\tizen-sdk`
- CLI 버전: `tz` v10.3.9, `sdb` 설치 완료

**SDK 설치 완료 화면:**

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 2. Tizen WebApp 프로젝트 생성

### 2.1 스킬 활성화

`tizen-create-project` 스킬을 활성화했습니다.

### 2.2 앱 타입 및 템플릿 선택

- **앱 타입:** WebApp (HTML/JS/CSS)
- **사용 가능한 템플릿:** Basic, WebService
- **선택된 템플릿:** Basic (기본 웹앱 템플릿)
- **앱 이름:** MyTizenWebApp

### 2.3 프로젝트 생성

**CLI 러너 경로:**
```
C:\Users\<username>\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.1.0\lib\cli\create-project-cli.js
```

**실행 명령:**
```
node "...\create-project-cli.js" webapp Basic "C:/Users/<username>/clinetest" "MyTizenWebApp"
```

**결과 JSON Envelope:**
```json
{
  "command": "tizen-sdk project create",
  "status": "success",
  "duration_ms": 5450,
  "result": {
    "project_name": "MyTizenWebApp",
    "project_type": "webapp",
    "template_name": "Basic",
    "project_path": "C:\\Users\\<username>\\clinetest\\MyTizenWebApp",
    "status": "created"
  },
  "warnings": [
    "Workspace: C:\\Users\\<username>\\clinetest\\MyTizenWebApp\\MyTizenWebApp.code-workspace"
  ],
  "errors": []
}
```

- **프로젝트 경로:** `C:\Users\<username>\clinetest\MyTizenWebApp`
- VS Code 워크스페이스 파일도 함께 생성됨

**프로젝트 생성 완료 화면 (템플릿/앱 이름 선택 포함):**

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 3. 프로젝트 빌드 (Debug 모드)

### 3.1 스킬 활성화

`tizen-build-project` 스킬을 활성화했습니다.

### 3.2 빌드 실행

**CLI 러너 경로:**
```
C:\Users\<username>\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.1.0\lib\cli\build-project-cli.js
```

**실행 명령:**
```
node "...\build-project-cli.js" "C:/Users/<username>/clinetest/MyTizenWebApp" Debug
```

**결과 JSON Envelope:**
```json
{
  "command": "tizen-sdk project build",
  "status": "success",
  "duration_ms": 3948,
  "result": {
    "artifacts": [
      {
        "path": "C:\\Users\\<username>\\clinetest\\MyTizenWebApp\\Debug\\MyTizenWebApp.wgt",
        "format": ".wgt",
        "size_bytes": 39305
      }
    ],
    "build_time_ms": 3948
  },
  "warnings": [],
  "errors": []
}
```

- **빌드 산출물:** `MyTizenWebApp.wgt` (39,305 bytes)
- **빌드 모드:** Debug
- **빌드 시간:** 약 4초

**빌드 완료 화면 (스킬 활성화 → CLI 러너 검색 → 빌드 실행 → Task Completed):**

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 4. Tizen 에뮬레이터 실행

### 4.1 스킬 활성화

`tizen-device-manager` 스킬을 활성화했습니다.

### 4.2 에뮬레이터 실행

**CLI 러너 경로:**
```
C:\Users\<username>\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.1.0\lib\cli\device-manager-cli.js
```

**실행 명령:**
```
node "...\device-manager-cli.js"
```

연결된 디바이스가 없어 자동으로 에뮬레이터(default VM)를 생성하고 실행했습니다. 에뮬레이터 부팅에 약 173초(약 3분)가 소요되었습니다.

**결과 JSON Envelope:**
```json
{
  "command": "tizen-sdk device connect",
  "status": "success",
  "duration_ms": 172610,
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "emulator_launched": true,
    "status": "connected"
  },
  "warnings": [
    "[WARN]  No connected devices found. Attempting to start an emulator...",
    "[INFO]  Looking for em-cli...",
    "[INFO]  Found em-cli: C:\\Users\\<username>\\tizen-sdk\\tools\\emulator\\bin\\em-cli.bat"
  ],
  "errors": []
}
```

- **디바이스 시리얼:** `emulator-26101`
- **에뮬레이터 이름:** `tizen-vm-default`
- **em-cli 경로:** `C:\Users\<username>\tizen-sdk\tools\emulator\bin\em-cli.bat`

**SDB 디바이스 목록 확인:**
```
List of devices attached
emulator-26101      	device    	tizen-vm-default
```

**에뮬레이터 부팅 중 화면 (tizen-vm-default):**

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

**에뮬레이터 실행 완료 화면 (emulator-26101 연결):**

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 5. 앱 설치 및 실행

### 5.1 스킬 활성화

`tizen-install-app` 스킬을 활성화했습니다.

### 5.2 앱 설치 및 실행

**CLI 러너 경로:**
```
C:\Users\<username>\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.1.0\lib\cli\install-app-cli.js
```

**실행 명령:**
```
node "...\install-app-cli.js" "C:/Users/<username>/clinetest/MyTizenWebApp/Debug/MyTizenWebApp.wgt" emulator-26101 run
```

**결과 JSON Envelope:**
```json
{
  "command": "tizen-sdk project install",
  "status": "success",
  "duration_ms": 10814,
  "result": {
    "package_path": "C:\\Users\\<username>\\clinetest\\MyTizenWebApp\\Debug\\MyTizenWebApp.wgt",
    "device_serial": "emulator-26101",
    "app_id": "nEfIrv2aeP.MyTizenWebApp",
    "installation_status": "completed",
    "app_launched": true
  },
  "warnings": [
    "error: failed to close '/opt/usr/apps/MyTizenWebApp.wgt': Permission denied"
  ],
  "errors": []
}
```

- **앱 ID:** `nEfIrv2aeP.MyTizenWebApp`
- **설치 상태:** completed
- **앱 실행:** 성공 (`app_launched: true`)

**설치된 앱 확인:**
```
system apps	pkg_type [wgt]	pkgid [nEfIrv2aeP]	name [MyTizenWebApp]	version [1.0.0]	storage [internal]
```

**앱 설치 및 실행 화면 (에뮬레이터에서 Basic 앱 실행):**

*(스크린샷 생략 — 원본 세션 캡처는 개인 환경 정보가 포함되어 공개 저장소에서 제외됨)*

---

## 전체 작업 요약

| 단계 | 작업 내용 | 상태 | 소요 시간 |
|------|-----------|------|-----------|
| 1 | Tizen SDK 10.0 설치 (123개 패키지) | ✅ 완료 | 약 20분 (중단 후 재개 포함) |
| 2 | WebApp 프로젝트 생성 (MyTizenWebApp) | ✅ 완료 | 약 5.5초 |
| 3 | Debug 빌드 (MyTizenWebApp.wgt) | ✅ 완료 | 약 4초 |
| 4 | 에뮬레이터 실행 (emulator-26101) | ✅ 완료 | 약 173초 |
| 5 | 앱 설치 및 실행 | ✅ 완료 | 약 11초 |

### 주요 경로 정리

| 항목 | 경로 |
|------|------|
| Tizen SDK | `C:\Users\<username>\tizen-sdk` |
| 프로젝트 디렉토리 | `C:\Users\<username>\clinetest\MyTizenWebApp` |
| 빌드 산출물 (.wgt) | `C:\Users\<username>\clinetest\MyTizenWebApp\Debug\MyTizenWebApp.wgt` |
| 에뮬레이터 시리얼 | `emulator-26101` |
| 앱 ID | `nEfIrv2aeP.MyTizenWebApp` |

### 사용된 Tizen SDK 스킬

1. `tizen-sdk-install` - SDK 설치
2. `tizen-create-project` - 프로젝트 생성
3. `tizen-build-project` - 프로젝트 빌드
4. `tizen-device-manager` - 에뮬레이터 실행
5. `tizen-install-app` - 앱 설치 및 실행

### 참고사항

- `.clinerules` 가드 규칙에 따라 `tizen` CLI 대신 `tz`를 사용하고, 모든 작업은 CLI 러너를 통해 수행했습니다.
- Windows 환경(cmd.exe/PowerShell)에서 bash 문법을 사용하지 않고, CLI 러너 경로를 먼저 찾은 후 `node`로 실행하는 2단계 방식을 사용했습니다.
- 설치 중 97/125 패키지에서 중단되었으나, `.install-running` 파일 삭제 후 재실행하여 성공적으로 완료했습니다.
- 모든 결과는 Standard JSON Envelope 형식으로 반환되었습니다.

---

## 6. DotNET NUI 앱 디버깅 설정

### 6.1 스킬 활성화

`tizen-dotnet-debug` 스킬을 활성화했습니다.

### 6.2 디버그 모드 및 중단점 선택

- **디버그 모드:** launch (netcoredbg DAP 서버, 앱이 Main() 진입 전 일시 중단)
- **중단점:** `TizenDotNetApp.cs:126` (Main 메서드)
- **포트:** 4711

### 6.3 디버그 설정 실행

**CLI 러너 경로:**
```
C:\Users\<username>\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.1.0\lib\cli\dotnet-debug-cli.js
```

**실행 명령:**
```
node "...\dotnet-debug-cli.js" org.tizen.example.TizenDotNetApp launch "TizenDotNetApp.cs:126"
```

**결과 JSON Envelope:**
```json
{
  "command": "tizen-sdk debug dotnet-setup",
  "status": "success",
  "duration_ms": 19191,
  "result": {
    "app_id": "org.tizen.example.TizenDotNetApp",
    "mode": "launch",
    "port": 4711,
    "breakpoints": [
      "TizenDotNetApp.cs:126"
    ],
    "app_pid": null,
    "netcoredbg_status": "installed",
    "port_forwarded": true,
    "debug_command": null,
    "launch_config": {
      "type": "coreclr",
      "request": "launch",
      "debug_server_port": 4711,
      "workspace_placeholder": "<APP_FOLDER_NAME>",
      "note": "Create .vscode/launch.json in the workspace root with the netcoredbg DAP config. Replace <APP_FOLDER_NAME> with your app folder name. The app is suspended before Main() until VS Code connects."
    },
    "note": "netcoredbg DAP server is listening on device port 4711; host tcp:4711 is forwarded. Create .vscode/launch.json, open the project in VS Code, set a breakpoint, and press F5."
  },
  "warnings": [],
  "errors": []
}
```

### 6.4 디버그 설정 요약

- **앱 ID:** `org.tizen.example.TizenDotNetApp`
- **디버그 모드:** launch (DAP 서버)
- **중단점:** `TizenDotNetApp.cs:126` (Main 메서드)
- **netcoredbg 상태:** 설치됨 (`installed`)
- **포트 포워딩:** `tcp:4711` → 디바이스 포트 4711 (완료)
- **소요 시간:** 약 19.2초
- **launch.json:** `.vscode/launch.json` 생성 (coreclr 타입, debug_server_port 4711)

### 6.5 VS Code 디버깅 시작 방법

1. VS Code에서 `TizenDotNetApp` 폴더 열기
2. `TizenDotNetApp.cs` 파일의 126번 라인(Main 메서드)에 중단점 설정
3. **F5** 키를 누르거나 Run & Debug 패널에서 "TizenDotNetApp Debug (netcoredbg)" 선택 후 실행
4. 앱이 Main() 진입 전에 중단되며, 이후 단계별 실행(F10/F11), 변수 확인 등이 가능

> ⚠️ 앱은 VS Code가 연결될 때까지 일시 중단 상태로 대기합니다. 빠르게 F5를 눌러 연결해 주세요.

---

## 7. 인코딩 및 네이티브 실행 파일 버그 수정

### 7.1 빌드 결과 한글 깨짐 (모지바이크) 수정

Windows 콘솔 코드 페이지(CP949)와 UTF-8 간 불일치로 인해 빌드 후 `dir` 명령 등에서 한글이 깨지는 현상을 수정했습니다.

**수정 파일:**

| 파일 | 수정 내용 |
|------|-----------|
| `lib/core/plugin-cache.js` | `execPluginScript()`에 `chcp 65001 >nul &&` prefix 추가 |
| `scripts/lib/common.ps1` | `[Console]::InputEncoding = UTF8` 및 `chcp 65001` 추가 |
| `scripts/tizen-build-project/tizen-build-project.ps1` | `Build-Project`/`Pack-Project`에서 `tz` 호출 전 UTF-8 재설정 |

### 7.2 네이티브 실행 파일을 `node`로 실행하는 에러 수정

`sdb.exe`, `tz.exe`, `dotnet.exe` 등을 `node`로 감싸서 실행하면 `SyntaxError: Invalid or unexpected token` 에러가 발생하는 문제를 방지하기 위해 모든 에이전트 파일과 가드 규칙에 경고를 추가했습니다.

**수정 파일:**

| 파일 | 수정 내용 |
|------|-----------|
| 7개 에이전트 `.md` 파일 | "네이티브 실행 파일 `node` 실행 금지" 경고 섹션 추가 |
| `tizen-sdk-install.md` | 동일 경고 추가 |
| `tizen-sdk-skills-guard.md` (3개 사본) | 규칙 8(네이티브 실행 파일 node 금지), 규칙 9(Windows 한글 인코딩) 추가 |

**가드 규칙 파일 위치 (3개 사본 동일 내용):**
1. `cline/hooks/tizen-sdk-skills-guard.md`
2. `common/hooks/tizen-sdk-skills-guard.md`
3. `C:\Users\<username>\Documents\Cline\Rules\tizen-sdk-skills-guard.md`

### 7.3 수정 후 전체 작업 요약 (업데이트)

| 단계 | 작업 내용 | 상태 | 소요 시간 |
|------|-----------|------|-----------|
| 1 | Tizen SDK 10.0 설치 (123개 패키지) | ✅ 완료 | 약 20분 (중단 후 재개 포함) |
| 2 | WebApp 프로젝트 생성 (MyTizenWebApp) | ✅ 완료 | 약 5.5초 |
| 3 | Debug 빌드 (MyTizenWebApp.wgt) | ✅ 완료 | 약 4초 |
| 4 | 에뮬레이터 실행 (emulator-26101) | ✅ 완료 | 약 173초 |
| 5 | 앱 설치 및 실행 | ✅ 완료 | 약 11초 |
| 6 | DotNET NUI 앱 디버깅 설정 (netcoredbg) | ✅ 완료 | 약 19.2초 |
| 7 | 인코딩 및 네이티브 실행 파일 버그 수정 | ✅ 완료 | — |

### 사용된 Tizen SDK 스킬 (업데이트)

1. `tizen-sdk-install` - SDK 설치
2. `tizen-create-project` - 프로젝트 생성
3. `tizen-build-project` - 프로젝트 빌드
4. `tizen-device-manager` - 에뮬레이터 실행
5. `tizen-install-app` - 앱 설치 및 실행
6. `tizen-dotnet-debug` - .NET 앱 디버깅 설정 (netcoredbg DAP 서버)


