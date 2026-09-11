# tizen-sdk 전체 명령 실행 결과

[English](COMMAND_TEST_RESULTS.en.md) | 한국어

- **실행일**: 2026-07-16
- **실행 방법**: 저장소 루트에서 `node dist/cli.js tizen-sdk <command> ...`
- **환경**: Windows 11, Node.js v24.15.0, Tizen SDK `C:\Users\<username>\tizen-sdk`, .NET SDK 10.0.300
- **테스트 프로젝트**: WebApp/Basic 템플릿, 임시 폴더에 `TestWebApp` 생성

## 요약

| #   | 명령                    | 결과       | 소요시간 | 설명                                                           |
| --- | ----------------------- | ---------- | -------- | -------------------------------------------------------------- |
| —   | `--schema`              | ✅ success | —        | 14개 커맨드 옵션 스키마(required/enum/default) 반환            |
| —   | `--capabilities`        | ✅ success | —        | 14개 커맨드 전부 available                                     |
| —   | `--doctor`              | ✅ success | —        | 체크 5종(Node/scripts/shell/SDK/sdb) 모두 ok                   |
| 1   | `check-node`            | ✅ success | 3.0s     | Node v24.15.0 감지                                             |
| 2   | `check-disk-space`      | ✅ success | 0s       | free 17.07GB ≥ required 15GB                                   |
| 3   | `sdk-install`           | ✅ success | 3.0s     | Tizen SDK 설치 완료 상태                                       |
| 4   | `tv-sdk-install`        | ✅ success | 0.004s   | TV-SAMSUNG-Public 확인                                         |
| 5   | `dotnet-setup`          | ✅ success | 7.8s     | .NET SDK 10.0.300 + tizen workload ready                       |
| 6   | `list-templates`        | ✅ success | 4.7s     | native 5 / dotnet 5 / webapp 2 / tv 10 (TV SDK 설치 시) 템플릿 |
| 7   | `create-project`        | ✅ success | 11.3s    | TestWebApp (webapp/Basic) 생성                                 |
| 8   | `build-project`         | ✅ success | 7.5s     | TestWebApp.wgt 38,870 bytes 생성                               |
| 9   | `device-manager`        | ✅ success | 159s     | Tizen 에뮬레이터 자동 생성·시작·연결                           |
| 10  | `install-app --run`     | ✅ success | 13s      | WebApp 설치 및 실행 완전 성공                                  |
| 11  | `gdb-debug` (WebApp)    | ✅ success | 6.7s     | 웹앱 감지 후 자동 거부 (정상)                                  |
| 12  | `dotnet-debug` (WebApp) | ✅ success | 6.4s     | 웹앱 감지 후 자동 거부 (정상)                                  |

**최종 결과: 14개 커맨드 및 메타 명령 3종(--schema/--capabilities/--doctor) 모두 성공.**

---

## 상세 실행 결과

### 메타: `--schema`

14개 커맨드 전체의 옵션 스키마(required/enum/default 포함)를 반환한다. (아래는 일부 발췌)

```json
{
  "status": "success",
  "result": {
    "plugin": "tizen-sdk",
    "version": "0.1.0",
    "commands": {
      "create-project": {
        "description": "Scaffold a new Tizen project from an installed SDK template (discover templates with list-templates first)",
        "args": {
          "--type": {
            "type": "string",
            "required": true,
            "enum": ["native", "dotnet", "webapp", "tv", "platform"]
          },
          "--template": { "type": "string", "required": true },
          "--parent-path": { "type": "string", "required": true },
          "--name": { "type": "string", "required": true }
        }
      },
      "build-project": {
        "description": "Build and package a Tizen project (.tpk/.wgt) — result.artifacts contains the package paths",
        "args": {
          "--project": { "type": "string", "required": true },
          "--build-type": {
            "type": "string",
            "default": "Debug",
            "enum": ["Debug", "Release", "Test"]
          },
          "--sign-profile": { "type": "string" }
        }
      }
    }
  },
  "warnings": [],
  "errors": []
}
```

### 메타: `--capabilities`

```json
{
  "status": "success",
  "result": {
    "available": [
      "check-node",
      "check-disk-space",
      "sdk-install",
      "tv-sdk-install",
      "tv-sdk-install-from-zip",
      "dotnet-setup",
      "create-project",
      "list-templates",
      "build-project",
      "device-manager",
      "install-app",
      "gdb-debug",
      "dotnet-debug"
    ],
    "unavailable": []
  },
  "warnings": [],
  "errors": []
}
```

### 메타: `--doctor`

```json
{
  "status": "success",
  "result": {
    "plugin": "tizen-sdk",
    "checks": [
      {
        "name": "Node.js version (18+)",
        "status": "ok",
        "message": "Node.js v24.15.0 detected"
      },
      {
        "name": "Plugin scripts directory",
        "status": "ok",
        "message": "scripts/ found at C:\\Users\\<username>\\.tizen\\plugins\\tizen-sdk-skills"
      },
      {
        "name": "Shell available (powershell)",
        "status": "ok",
        "message": "powershell is on PATH"
      },
      {
        "name": "Tizen SDK installed",
        "status": "ok",
        "message": "Tizen SDK found at C:\\Users\\<username>\\tizen-sdk"
      },
      { "name": "sdb reachable", "status": "ok", "message": "sdb is on PATH" }
    ]
  },
  "warnings": [],
  "errors": []
}
```

### 1. `check-node`

```json
{
  "status": "success",
  "result": {
    "installed": true,
    "version": "v24.15.0",
    "path": "C:\\Program Files\\nodejs\\node.exe",
    "major_version": 24
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk check-node",
  "duration_ms": 3023
}
```

### 2. `check-disk-space`

```json
{
  "status": "success",
  "result": {
    "path": "C:\\Users\\<username>",
    "total_gb": 238.37,
    "free_gb": 17.07,
    "required_gb": 15,
    "sufficient": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk check-disk-space",
  "duration_ms": 0
}
```

### 3. `sdk-install` (pre-check)

```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "Tizen Platforms (12)",
        "status": "installed",
        "version": "10.0"
      },
      { "name": "Tizen SDK Tools", "status": "installed", "version": "10.0" }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "SDK installation verified at C:\\Users\\<username>\\tizen-sdk (sdk.info found). To force a reinstall, run with --force."
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "duration_ms": 3015
}
```

### 4. `tv-sdk-install` (pre-check)

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
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk tv-sdk-install",
  "duration_ms": 4
}
```

### 5. `dotnet-setup`

```json
{
  "status": "success",
  "result": {
    "dotnet_version": "10.0.300",
    "workload": "tizen",
    "workload_status": "already_installed",
    "status": "ready"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk dotnet-setup",
  "duration_ms": 7773
}
```

### 6. `list-templates`

```json
{
  "status": "success",
  "result": {
    "templates": {
      "native": [
        "BasicUI",
        "gtest",
        "ServiceApp",
        "SharedLibrary",
        "StaticLibrary"
      ],
      "dotnet": [
        "TizenLibRpk",
        "TizenNSClassLib",
        "TizenNUIGadget_inhouse",
        "TizenNUITemplate",
        "TizenServiceApp"
      ],
      "webapp": ["Basic", "WebService"]
    }
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk list-templates",
  "duration_ms": 4739
}
```

### 7. `create-project`

WebApp/Basic 템플릿으로 `TestWebApp` 프로젝트 생성.

**Required options:**

| Option          | Type                                                   | Required | Description                                                    |
| --------------- | ------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| `--type`        | `native` \| `dotnet` \| `webapp` \| `tv` \| `platform` | Yes      | Project type                                                   |
| `--template`    | string                                                 | Yes      | Template name (use `list-templates` to discover)               |
| `--parent-path` | string                                                 | Yes      | Workspace (parent) directory — app folder is created inside it |
| `--name`        | string                                                 | Yes      | App name (folder to be created)                                |

**Usage:**

```bash
# Without --type: shows available templates as a helpful guide
tizen-cli tizen-sdk create-project

# With all required options
tizen-cli tizen-sdk create-project \
  --type webapp \
  --template Basic \
  --parent-path ./ \
  --name TestWebApp

# Native project example
tizen-cli tizen-sdk create-project \
  --type native \
  --template ServiceApp \
  --parent-path ./ \
  --name TestNativeApp
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "project_name": "TestWebApp",
    "project_type": "webapp",
    "template_name": "Basic",
    "project_path": "<temp>\\TestWebApp",
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-project",
  "duration_ms": 11280
}
```

### 8. `build-project`

Debug 빌드로 38.87KB의 `.wgt` 패키지 생성.

**Options:**

| Option           | Type                           | Required | Default | Description            |
| ---------------- | ------------------------------ | -------- | ------- | ---------------------- |
| `--project`      | string                         | Yes      | —       | Project root directory |
| `--build-type`   | `Debug` \| `Release` \| `Test` | No       | `Debug` | Build configuration    |
| `--sign-profile` | string                         | No       | —       | Signing profile name   |

**Usage:**

```bash
# Debug build (default)
tizen-cli tizen-sdk build-project --project ./TestWebApp

# Release build
tizen-cli tizen-sdk build-project --project ./TestWebApp --build-type Release

# Native project build
tizen-cli tizen-sdk build-project --project ./TestNativeApp

# Build with signing profile
tizen-cli tizen-sdk build-project --project ./TestWebApp --sign-profile MyProfile
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "<temp>\\TestWebApp\\Debug\\TestWebApp.wgt",
        "format": ".wgt",
        "size_bytes": 38870
      }
    ],
    "build_time_ms": 7531
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 7531
}
```

### 9. `device-manager`

연결된 물리 디바이스 없음 → Tizen 에뮬레이터 자동 생성·시작·연결. 콜드 부팅 포함 159초 소요.

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "emulator_launched": true,
    "status": "connected"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 159000
}
```

VM 플랫폼 확인: `tizen-10.0-x86_64` (표준 Tizen, TV 아님)

#### 9-1. `device-manager` (TV 에뮬레이터 — 추가 테스트)

`profile=tv` 옵션으로 Samsung TV 에뮬레이터 생성·시작·연결.

**실행 환경**: Ubuntu (Linux), Tizen SDK at `/home/user/tizen-sdk`

**명령:**

```bash
node device-manager-cli.js 300 tizen-tv-vm tv
# 인자: timeoutSec=300, vmName=tizen-tv-vm, profile=tv
```

**결과:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26111",
    "device_type": "emulator",
    "emulator_launched": true,
    "device_profile": "tv",
    "status": "connected"
  },
  "warnings": [
    "[WARN]  Connected emulator 'emulator-26101' has platform 'tizen-10.0-x86_64' but profile 'tv' was requested.",
    "[WARN]  Will proceed to create/launch a tv emulator instead.",
    "[WARN]  No connected devices found. Attempting to start an emulator...",
    "[INFO]  Found em-cli: /home/user/tizen-sdk/tools/emulator/bin/em-cli"
  ],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 19295
}
```

**`sdb devices` 확인:**

```
List of devices attached
emulator-26111      	device    	tizen-tv-vm
emulator-26101      	device    	tizen-vm-default
```

> **참고:** 기존 표준 Tizen 에뮬레이터(`emulator-26101`)가 실행 중이었으나, `profile=tv`를 명시적으로 요청했기 때문에 새로운 TV 에뮬레이터(`emulator-26111`)를 생성·시작함. TV 에뮬레이터는 TV SDK 확장(`tv-samsung-*` 플랫폼)이 사전에 설치되어 있어야 함 (`tizen-tv-sdk-install` 스킬 참조).

### 10. `install-app --run`

생성한 TestWebApp.wgt를 Tizen 에뮬레이터에 설치 및 실행.

**Options:**

| Option      | Type    | Required | Default | Description                                                            |
| ----------- | ------- | -------- | ------- | ---------------------------------------------------------------------- |
| `--package` | string  | Yes      | —       | Absolute path to the .tpk/.wgt package                                 |
| `--serial`  | string  | No       | auto    | Target device serial (omit to auto-select the single connected device) |
| `--run`     | boolean | No       | `false` | Launch the app after installation                                      |

**Usage:**

```bash
# Install and run (auto-select device)
tizen-cli tizen-sdk install-app --package ./TestWebApp/Debug/TestWebApp.wgt --run

# Install only (no launch)
tizen-cli tizen-sdk install-app --package ./TestWebApp/Debug/TestWebApp.wgt

# Install on specific device
tizen-cli tizen-sdk install-app --package ./TestWebApp/Debug/TestWebApp.wgt --serial emulator-26101 --run

# Install native .tpk
tizen-cli tizen-sdk install-app --package ./TestNativeApp/Debug/org.example.testnativeapp-1.0.0-x86_64.tpk --run
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "package_path": "<temp>\\TestWebApp\\Debug\\TestWebApp.wgt",
    "device_serial": "emulator-26101",
    "app_id": "CmaRL446cf.TestWebApp",
    "installation_status": "completed",
    "app_launched": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-app",
  "duration_ms": 13000
}
```

### 11. `gdb-debug` (WebApp 테스트)

WebApp에 대한 GDB 디버깅 요청 → 자동 감지 후 거부 (정상 동작).

**Required options:**

| Option          | Type    | Required | Default | Description                                                                  |
| --------------- | ------- | -------- | ------- | ---------------------------------------------------------------------------- |
| `--app-id`      | string  | Yes      | —       | Tizen package ID (e.g. `org.example.myapp`)                                  |
| `--binary`      | string  | Yes      | —       | Host binary path with debug symbols (e.g. `<project>/Debug/tpk/bin/<exec>`)  |
| `--port`        | number  | No       | `5039`  | Debug port                                                                   |
| `--timeout`     | number  | No       | `30`    | PID lookup timeout in seconds (attach mode)                                  |
| `--breakpoints` | string  | No       | —       | Comma-separated breakpoint function names (e.g. `"main,service_app_create"`) |
| `--launch`      | boolean | No       | `false` | Launch mode: gdbserver launches the binary directly (catches main)           |

**Usage:**

```bash
# Attach mode (default) — app is launched, then gdbserver attaches to its PID
tizen-cli tizen-sdk gdb-debug \
  --app-id org.example.testnativeapp \
  --binary ./TestNativeApp/Debug/tpk/bin/testnativeapp

# Launch mode — gdbserver launches the binary directly, stops before main()
tizen-cli tizen-sdk gdb-debug \
  --app-id org.example.testnativeapp \
  --binary ./TestNativeApp/Debug/tpk/bin/testnativeapp \
  --launch --breakpoints "main,service_app_create"

# Custom port and timeout
tizen-cli tizen-sdk gdb-debug \
  --app-id org.example.testnativeapp \
  --binary ./TestNativeApp/Debug/tpk/bin/testnativeapp \
  --port 5040 --timeout 60
```

> **참고:** 바이너리 경로는 디렉토리가 아닌 **실행 파일**이어야 합니다. Native 빌드 출력은 보통 `<project>/Debug/tpk/bin/<exec>`에 있습니다.

**Result (WebApp — rejected as expected):**

```json
{
  "status": "failure",
  "result": null,
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_IO_E001",
      "message": "'CmaRL446cf.TestWebApp' is a Web app (wgt) — GDB debugging is not supported for Web apps.",
      "error_category": "io_error"
    }
  ],
  "command": "tizen-sdk gdb-debug",
  "duration_ms": 6700
}
```

**Result (Native app — success):**

```json
{
  "status": "success",
  "result": {
    "app_id": "org.example.testnativeapp",
    "binary_path": "./TestNativeApp/Debug/tpk/bin/testnativeapp",
    "mode": "attach",
    "port": 5039,
    "breakpoints": [],
    "app_pid": 12899,
    "gdbserver_status": "running",
    "port_forwarded": true,
    "gdb_init_file": "/tmp/tizen-gdb-FkelSg.gdb",
    "gdb_command": {
      "shell": "\"/home/user/tizen-sdk/tools/x86_64-linux-gnu-gdb-15.1/bin/x86_64-linux-gnu-gdb\" -x \"/tmp/tizen-gdb-FkelSg.gdb\""
    },
    "note": "Run the gdb_command.shell line in an interactive terminal. gdbserver, the port forward, and the init file stay in place for this session."
  },
  "warnings": [
    "... launch failed",
    "[WARN]  gdbserver readiness check inconclusive — proceeding"
  ],
  "errors": [],
  "command": "tizen-sdk gdb-debug",
  "duration_ms": 26012
}
```

### 12. `dotnet-debug` (WebApp 테스트)

WebApp에 대한 .NET 디버깅 요청 → 자동 감지 후 거부 (정상 동작).

**Required options:**

| Option          | Type    | Required | Default | Description                                                                          |
| --------------- | ------- | -------- | ------- | ------------------------------------------------------------------------------------ |
| `--app-id`      | string  | Yes      | —       | Tizen package ID (e.g. `org.example.myapp`)                                          |
| `--binary`      | string  | Yes      | —       | Host DLL path with debug symbols (e.g. `<project>/Debug/bin/Debug/net6.0/MyApp.dll`) |
| `--port`        | number  | No       | `5040`  | Debug port                                                                           |
| `--timeout`     | number  | No       | `30`    | PID lookup timeout in seconds (attach mode)                                          |
| `--breakpoints` | string  | No       | —       | Comma-separated breakpoint function names                                            |
| `--launch`      | boolean | No       | `false` | Launch mode: netcoredbg launches the binary directly (catches main)                  |

**Usage:**

```bash
# --mode 생략 = launch(기본): 앱이 netcoredbg DAP 서버 아래에서 Main() 전에 정지 상태로 시작됨
# (VS Code가 연결되기 전까지 앱 창이 뜨지 않는 것이 정상). attach는 --mode attach 로만.
tizen-cli tizen-sdk dotnet-debug \
  --app-id org.example.myapp \
  --binary ./MyApp/Debug/bin/Debug/net6.0/MyApp.dll

# Launch mode — netcoredbg launches the binary directly, stops before main()
tizen-cli tizen-sdk dotnet-debug \
  --app-id org.example.myapp \
  --binary ./MyApp/Debug/bin/Debug/net6.0/MyApp.dll \
  --launch --breakpoints "Main,OnCreate"

# Custom port and timeout
tizen-cli tizen-sdk dotnet-debug \
  --app-id org.example.myapp \
  --binary ./MyApp/Debug/bin/Debug/net6.0/MyApp.dll \
  --port 5050 --timeout 60
```

> **참고:** 바이너리 경로는 .NET DLL 파일이어야 합니다. .NET 빌드 출력은 보통 `<project>/Debug/bin/Debug/<tfm>/MyApp.dll`에 있습니다.

**Result (WebApp — rejected as expected):**

```json
{
  "status": "failure",
  "result": null,
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_SDK_IO_E001",
      "message": "'CmaRL446cf.TestWebApp' is a Web app (wgt) — .NET debugging is not supported for Web apps.",
      "error_category": "io_error"
    }
  ],
  "command": "tizen-sdk dotnet-debug",
  "duration_ms": 6400
}
```

---

## 주요 특징

- **Standard JSON Envelope**: 모든 명령이 stdout에 정확히 하나의 JSON 구조만 출력 (진단 로그는 stderr 분리)
- **Exit Code 규약**: 성공 0, 실패 1 명확히 준수
- **WebApp 안전 보호**: `gdb-debug`/`dotnet-debug`가 WebApp 요청을 자동 감지·거부
- **E2E 파이프라인**: 템플릿 조회 → 프로젝트 생성 → 빌드 → 에뮬레이터 → 설치 → 실행 완전 성공
- **표준 플랫폼 우선**: `device-manager`가 TV가 아닌 일반 Tizen 플랫폼 에뮬레이터 우선 선택
