# 시나리오 가이드: .NET 앱 디버깅(netcoredbg) 처음부터 끝까지 체험하기

[English](scenario-dotnet-debug-walkthrough.en.md) | 한국어

이 문서는 `tizen-sdk-skills` 플러그인으로 **Tizen .NET 앱(C#/NUI) 원격 디버깅을 한 번에 전체 흐름으로 시험**해볼 수 있도록, "SDK 설치 → .NET 환경 구성 → 에뮬레이터 → 닷넷 앱 생성 → Debug 빌드 → 설치 → netcoredbg 셋업 → VS Code 연결"을 단계별로 안내합니다.

각 단계는 **Claude에게 자연어로 말하면** 해당 에이전트가 자동으로 동작합니다. 별도로 명령어를 외울 필요는 없습니다.

> .NET 앱은 디바이스의 **CoreCLR** 위에서 실행되므로 GDB로는 디버깅할 수 없습니다. 디바이스에서 **netcoredbg**를 실행해 DAP(Debug Adapter Protocol) 서버로 붙거나, CLI로 attach합니다. 담당 스킬은 `tizen-dotnet-debug`입니다.
>
> ⚠️ 웹앱(.wgt)에는 CoreCLR 프로세스가 없습니다 → [scenario-webapp-debug-walkthrough.md](scenario-webapp-debug-walkthrough.md)
> ⚠️ 네이티브(C/C++) 앱은 GDB를 씁니다 → [scenario-native-debug-walkthrough.md](scenario-native-debug-walkthrough.md)

---

## 0. 시작하기 전에

- **플러그인 설치 확인**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (미설치 시 [README.md](../README.md)의 "Cline 플러그인 설치" 참고)
- **OS**: Windows / Ubuntu(Linux) / macOS 모두 지원합니다. Claude가 현재 OS를 감지해 알맞은 스크립트를 실행합니다.
- **.NET SDK + Tizen 워크로드**: 2단계에서 `tizen-dotnet-setup`이 확인·설치합니다.
- **netcoredbg는 자동 설치**: 별도로 준비할 필요 없습니다. SDK의 on-demand 패키지(`<sdk>/platforms/tizen-*/common/on-demand/netcoredbg-<버전>-<arch>.tar.gz`)를 디바이스의 `/home/owner/share/tmp/sdk_tools/netcoredbg`로 한 번 배포합니다.
- **⚠️ Debug 빌드 필수 (가장 흔한 실패 원인)**: netcoredbg는 앱 디렉터리의 dll 옆에 있는 **portable PDB**를 읽습니다. Release 빌드에는 `.pdb`가 없어 **브레이크포인트가 절대 걸리지 않으며**, 스킬이 `build_failed`로 즉시 중단합니다.
- **launch 모드는 VS Code 필요**: DAP 클라이언트로 VS Code를 사용합니다. (attach 모드는 터미널 CLI만으로 가능하지만 제약이 큽니다 — 아래 7단계 참고)
- **체험 목표(예시)**:
  - 앱 타입: **DotNET**
  - 템플릿: **NUI 앱 템플릿** (설치된 SDK에서 조회)
  - 앱 이름: **MyDotnetApp** (원하는 이름으로 바꿔도 됩니다)

> 💡 각 단계에서 "이렇게 말하세요" 예시를 그대로 복사해 입력하면 됩니다.

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | .NET SDK + Tizen 워크로드 확인/설치 | `tizen-dotnet-setup` |
| 3 | 에뮬레이터 생성 및 실행 | `tizen-create-emulator` → `tizen-launch-emulator` |
| 4 | 닷넷 앱 템플릿 생성 (이름 지정) | `tizen-create-project` |
| 5 | **Debug 구성으로** 빌드 (`.tpk` 패키징) | `tizen-build-project` |
| 6 | 앱 설치 | `tizen-install-app` |
| 7 | .NET 디버깅 셋업 (netcoredbg DAP 서버 + 포트 포워딩) | `tizen-dotnet-debug` |
| 8 | VS Code에서 F5로 연결 | (사용자) |

---

## 1단계 — Tizen SDK 설치

가장 먼저 개발 환경(SDK)을 설치합니다. 이미 설치되어 있으면 건너뜁니다.

**이렇게 말하세요:**
```
타이젠 SDK 설치해줘
```

**성공 확인:** "설치 완료" 메시지와 함께 설치된 패키지 수가 표시됩니다.

---

## 2단계 — .NET 개발 환경 구성

.NET SDK가 있는지 확인하고 Tizen 워크로드를 설치합니다.

**이렇게 말하세요:**
```
타이젠 닷넷 개발 환경 설정해줘
```

**성공 확인:** `dotnet --version` 결과와 Tizen 워크로드 설치 완료 메시지가 표시됩니다.

---

## 3단계 — 에뮬레이터 생성 및 실행

물리 디바이스가 없다면 에뮬레이터를 만들어 실행합니다. (VM 생성과 부팅은 서로 다른 스킬이지만, 한 번에 말해도 Claude가 순서대로 처리합니다.)

**이렇게 말하세요:**
```
에뮬레이터 생성하고 실행해줘
```

**성공 확인:** `sdb devices` 목록에 디바이스가 `device` 상태로 나타납니다.

> ⚠️ launch 모드는 플랫폼의 **SDK 디버그 실행 계약(`__AUL_SDK__`)** 을 사용합니다. 에뮬레이터/개발용 이미지는 지원하지만 일부 상용(production) 이미지는 거부합니다.

---

## 4단계 — 닷넷 앱 템플릿 생성 (앱 이름 정하기)

DotNET 타입 템플릿으로 새 앱을 만들고, 앱 이름을 지정합니다.

**이렇게 말하세요:**
```
닷넷 NUI 템플릿으로 MyDotnetApp 이라는 앱 만들어줘
```

**성공 확인:** 프로젝트 폴더가 생성되고 `.csproj`, `tizen-manifest.xml`, `*.cs` 소스가 들어 있습니다.
`tizen-manifest.xml`의 `<manifest package="...">` 값이 이후 단계에서 쓸 **앱 ID**입니다 (예: `org.tizen.example.MyDotnetApp`).

> 💡 사용 가능한 템플릿 이름은 설치된 SDK에서 동적으로 조회됩니다. `타이젠 앱 템플릿 알려줘` 라고 물으면 실제 목록을 볼 수 있습니다.

---

## 5단계 — Debug 구성으로 빌드 (필수)

**반드시 Debug 구성으로** 빌드하세요. `.pdb`(portable PDB)가 이 단계에서 생성되며, 이것이 없으면 디버깅이 불가능합니다.

**이렇게 말하세요:**
```
방금 만든 앱 Debug 구성으로 빌드해줘
```

**성공 확인:** 빌드 산출물인 **`.tpk` 패키지**가 생성되고, `bin/Debug/net8.0-tizen*/` 아래에 `<AppName>.dll`과 **`<AppName>.pdb`** 가 함께 존재합니다.

> ⚠️ Release로 빌드했다면 7단계가 `build_failed`로 중단됩니다. 그때는 Debug로 재빌드 → 재설치 → 재시도해야 합니다.

---

## 6단계 — 앱 설치

빌드된 `.tpk`를 에뮬레이터(또는 디바이스)에 설치합니다.

**이렇게 말하세요:**
```
빌드한 앱 설치해줘
```

**성공 확인:** 설치 성공 메시지가 출력되고, 에뮬레이터 앱 목록에서 앱을 확인할 수 있습니다.

---

## 7단계 — .NET 디버깅 셋업 (netcoredbg)

설치한 .NET 앱을 netcoredbg 아래에서 다시 실행하고, DAP 포트를 호스트로 포워딩합니다.

### 모드 선택 — launch(권장) vs attach

| 모드 | 동작 | 장단점 |
|------|------|--------|
| **launch** (권장) | AUL 디버거 계약으로 앱을 **netcoredbg DAP 서버 아래에서 시작**하고, DAP 클라이언트가 붙을 때까지 `Main()` 전에 정지 | 시작 코드/`Main()`을 잡을 수 있음. VS Code 필요 |
| **attach** | 앱을 정상 실행한 뒤 PID를 찾아 **netcoredbg CLI로 attach** | `Main()`을 놓침. **Tizen에서 제약이 큼** — 정상 실행된 앱은 CoreCLR 디버그 전송로(`/tmp/clr-debug-pipe-<PID>-*`)를 만들지 않아 attach가 실패(`0x80131c08`)하는 경우가 많음 |

> 💡 **launch 모드가 기본값입니다** (`--mode` / 두 번째 인자를 생략하면 launch). attach는 사용자가 명시적으로 요청할 때만 사용합니다. 스킬은 브레이크포인트를 사용자에게 확인한 뒤 진행합니다.
>
> ⚠️ **launch 모드에서는 VS Code가 연결되기 전까지 앱 창이 뜨지 않습니다.** 앱은 netcoredbg 아래에서 `Main()` 직전에 정지된 상태이며, 성공 envelope 뒤에 화면에 아무것도 없는 것은 실패가 아니라 정상 동작입니다(이슈 #97). 러너는 패키지 ID를 `app_launcher -l`로 실제 앱 ID로 해석해 실행하며, 설치되지 않은 패키지는 `invalid_parameters`로 즉시 실패하고 `details`에 설치된 앱 목록을 담습니다.

**이렇게 말하세요:**
```
방금 설치한 닷넷 앱을 launch 모드로 디버깅해줘. 브레이크포인트는 Program.cs:25
```

내부적으로는 다음이 자동 수행됩니다:

1. `sdb devices`로 디바이스 확인 (`--serial` 미지정 시 첫 번째 디바이스)
2. `pkgcmd -l`로 **wgt 앱 가드** — 웹앱이면 즉시 거절하고 `tizen-webapp-debug`로 안내
3. `sdb root on` (best-effort)
4. **netcoredbg 설치 확인/배포** — 없으면 디바이스 아키텍처(`uname -m` → `x86_64`/`i686`/`aarch64`/`armv7l`/`riscv64`)에 맞는 최신 on-demand tar를 push·해제
5. **Debug 빌드 프리플라이트** — `/opt/usr/globalapps/<앱ID>/bin`(또는 `/opt/usr/apps/...`)에서 `*.pdb` 검색, 없으면 중단
6. 오래된 netcoredbg 프로세스 정리 (`pkill -f netcoredbg`)
7. 모드별 실행
   - launch: 기존 인스턴스 종료 → `launch_app <앱ID> __AUL_SDK__ NETCOREDBG __DLP_DEBUG_ARG__ --interpreter=vscode,--engineLogging,--server=4711,--` → netcoredbg 프로세스 확인 → `sdb forward tcp:4711 tcp:4711`
   - attach: `app_launcher -s <앱ID>` → PID 확보 → CoreCLR 디버그 전송로 확인 → netcoredbg CLI 명령 출력 (attach는 sdb shell로 직접 실행하므로 포트 포워딩 불필요)
8. **연결 정보를 출력하고 종료** — 대화형 디버거는 에이전트가 띄울 수 없습니다

**성공 확인 (launch 모드):** Standard JSON Envelope가 반환되고 `result`에 다음이 들어 있습니다:

```json
{
  "status": "success",
  "result": {
    "app_id": "org.tizen.example.MyDotnetApp",
    "mode": "launch",
    "port": 4711,
    "breakpoints": ["Program.cs:25"],
    "app_pid": null,
    "netcoredbg_status": "installed",
    "port_forwarded": true,
    "debug_command": null,
    "launch_config": {
      "type": "coreclr",
      "request": "launch",
      "debug_server_port": 4711,
      "workspace_placeholder": "<APP_FOLDER_NAME>",
      "note": "Create .vscode/launch.json in the workspace root with the netcoredbg DAP config..."
    },
    "note": "netcoredbg DAP server is listening on device port 4711; host tcp:4711 is forwarded. Create .vscode/launch.json, open the project in VS Code, set a breakpoint, and press F5."
  }
}
```

| 필드 | 의미 |
|------|------|
| `mode` | `launch` \| `attach` |
| `port` | DAP 서버 포트 (launch 모드만, 기본 `4711`. attach 모드는 `null`) |
| `netcoredbg_status` | `installed` — 디바이스에 디버거 배포 완료 |
| `port_forwarded` | launch 모드에서 `true` (attach 모드는 `false` — 포워딩 불필요) |
| `launch_config` | VS Code `launch.json` 작성에 필요한 값 (launch 모드) |
| `debug_command` | netcoredbg CLI 명령 (attach 모드, `powershell`·`cmd` 또는 `shell`) |

> 💡 앱은 **DAP 클라이언트가 붙을 때까지 `Main()` 전에 정지**해 있습니다. 앱/DAP 서버/포워딩은 셋업 후에도 유지되므로 연결을 끊었다 다시 붙일 수 있습니다.

---

## 8단계 — VS Code에서 연결 (launch 모드)

### STEP 1 — `.vscode/launch.json` 만들기

워크스페이스 루트에 `.vscode/launch.json`을 만들고 아래 내용을 붙여넣습니다. `<APP_FOLDER_NAME>`을 실제 앱 폴더 이름으로 바꾸세요.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Tizen .NET (netcoredbg)",
      "type": "coreclr",
      "request": "launch",
      "program": "${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0/<APP_FOLDER_NAME>.dll",
      "cwd": "${workspaceFolder}/<APP_FOLDER_NAME>/bin/Debug/net8.0-tizen10.0",
      "debugServer": 4711,
      "stopAtEntry": false
    }
  ]
}
```

> 💡 `net8.0-tizen10.0` 부분은 프로젝트의 실제 TargetFramework에 맞추세요(`.csproj`의 `<TargetFramework>` 값). `debugServer`는 7단계 envelope의 `port`와 같아야 합니다.
> 💡 `debugServer`가 있으면 VS Code는 앱을 새로 실행하지 않고 **이미 떠 있는 DAP 서버에 연결**만 합니다.

### STEP 2 — VS Code에서 프로젝트 폴더 열기

`File → Open Folder`로 프로젝트 워크스페이스 루트를 엽니다.

### STEP 3 — 브레이크포인트 설정 후 F5

1. 코드 편집기의 줄 번호 왼쪽 여백을 클릭해 빨간 브레이크포인트 점을 찍습니다.
2. **F5**를 눌러 디버깅을 시작합니다.
3. VS Code가 `localhost:4711`에 연결되고, 정지 중이던 앱이 실행되면서 브레이크포인트에 걸립니다.

**성공 확인:** VS Code 디버그 툴바가 나타나고, 브레이크포인트에서 멈추며 **Variables / Watch / Call Stack** 패널에 값이 표시됩니다. 앱 화면은 이때 처음 렌더링됩니다.

### (대안) attach 모드 — 터미널 CLI

attach 모드가 성공한 경우, envelope의 `debug_command`를 대화형 터미널에 붙여 실행합니다.

**Windows (PowerShell):**
```powershell
& "C:\tizen-sdk\tools\sdb.exe" -s emulator-26101 shell "/home/owner/share/tmp/sdk_tools/netcoredbg/netcoredbg --interpreter=cli --attach 1234"
```

`ncdb>` 프롬프트에서 쓰는 명령:

| 명령 | 설명 |
|------|------|
| `b Program.cs:25` | 브레이크포인트 설정 |
| `bt` | 콜스택 출력 |
| `continue` | 실행 재개 |
| `quit` | 세션 종료 |

> ⚠️ attach 모드는 `Main()`을 놓치며, 정상 실행된 Tizen .NET 앱에는 CoreCLR 디버그 전송로가 없어 실패할 수 있습니다. 실패 시 launch 모드로 전환하세요.

---

## E2E 검증 체크리스트

수동 E2E 테스트 시 아래 항목을 확인하세요.

### 정상 경로

| # | 확인 항목 | 기대 결과 |
|---|-----------|-----------|
| 1 | 7단계 envelope (launch) | `status: "success"`, `mode: "launch"`, `port: 4711`, `port_forwarded: true`, `launch_config` 존재, exit code `0` |
| 2 | `sdb shell "test -x /home/owner/share/tmp/sdk_tools/netcoredbg/netcoredbg && echo ok"` | `ok` — 디버거 배포 확인 |
| 3 | `sdb shell "pgrep -f netcoredbg"` | DAP 서버 프로세스 PID 출력 |
| 4 | `sdb forward --list` | `tcp:4711 → tcp:4711` 항목 존재 |
| 5 | `sdb shell "find /opt/usr/globalapps/<앱ID>/bin -name '*.pdb'"` | `.pdb` 파일 존재 (Debug 빌드 확인) |
| 6 | 셋업 직후 앱 화면 | **아무것도 렌더링되지 않음** — `Main()` 전에 정지된 정상 상태 |
| 7 | 8단계 F5 | VS Code가 연결되고 브레이크포인트에서 정지 |
| 8 | Variables / Call Stack | 지역변수와 C# 콜스택이 심볼과 함께 표시 |
| 9 | 연결 해제 후 재연결 | 앱·DAP 서버·포워딩이 유지되어 F5로 다시 붙을 수 있음 |

### 실패 경로 (에러 매핑)

| # | 시나리오 | 기대 결과 |
|---|-----------|-----------|
| 10 | 디바이스/에뮬레이터 없음 | `error_category: "device_not_found"` — `tizen-create-emulator` → `tizen-launch-emulator` 안내 |
| 11 | **Release 빌드 (`.pdb` 없음)** | `error_category: "build_failed"` — "No .pdb files found", Debug 재빌드(`tizen-build-project -b Debug`) → 재설치 → 재시도 안내 |
| 12 | 웹앱(.wgt) 앱 ID로 실행 | `error_category: "io_error"` — 상세에 `is a Web app (wgt)`, `tizen-webapp-debug`로 라우팅 |
| 13 | attach 모드인데 CoreCLR 디버그 전송로 없음 | `error_category: "io_error"` — "Attach mode not supported for this app (no CoreCLR debug transport)", launch 모드 사용 안내 |
| 14 | attach 모드에서 PID 못 찾음 | `error_category: "io_error"` — "Could not find the app PID within 30s", launch 모드 사용 안내 |
| 15 | SDK에 netcoredbg on-demand 패키지 없음 | `error_category: "io_error"` — "netcoredbg package not found in the SDK", `tizen-sdk-install` 안내 |
| 16 | `__AUL_SDK__` 미지원 이미지 (launch 실패) | `error_category: "io_error"` — 상세에 `netcoredbg DAP server did not start` |
| 17 | 지원하지 않는 디바이스 아키텍처 | `error_category: "io_error"` — 상세에 `Unsupported device architecture` |
| 18 | 잘못된 앱 ID / 포트 / 브레이크포인트 형식(`File.cs:line` 아님) | `error_category: "invalid_parameters"` |
| 19 | `launch.json`의 `debugServer` 포트 불일치 | VS Code가 연결 실패 → envelope의 `port` 값과 맞춤 |

### CLI 직접 실행 (에이전트 없이 검증할 때)

**Linux / macOS / Ubuntu (Bash):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
node "$CLI" org.tizen.example.MyDotnetApp launch "Program.cs:25" 4711
```

**Windows (cmd.exe / PowerShell):**
```
dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js"
node "<찾은-경로>" org.tizen.example.MyDotnetApp launch "Program.cs:25" 4711
```

인자 순서: `<appId> [attach|launch] [breakpoints|-] [port] [serial]`
Exit code: `0` = success envelope, `1` = failure/error envelope.

---

## 한 번에 따라 하기 (복사용 프롬프트 모음)

순서대로 입력하세요:

```
1) 타이젠 SDK 설치해줘
2) 타이젠 닷넷 개발 환경 설정해줘
3) 에뮬레이터 생성하고 실행해줘
4) 닷넷 NUI 템플릿으로 MyDotnetApp 이라는 앱 만들어줘
5) 방금 만든 앱 Debug 구성으로 빌드해줘
6) 빌드한 앱 설치해줘
7) 방금 설치한 닷넷 앱을 launch 모드로 디버깅해줘. 브레이크포인트는 Program.cs:25
```

마지막으로 `.vscode/launch.json`을 만들고 VS Code에서 브레이크포인트를 찍은 뒤 **F5**를 누르면 끝입니다.

## 관련 문서

- 에이전트 전체 설명: [README.md](../README.md)
- 스킬 상세 레퍼런스: [SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) (tizen-dotnet-debug)
- 네이티브 앱 디버깅 시나리오: [scenario-native-debug-walkthrough.md](scenario-native-debug-walkthrough.md)
- 웹앱 디버깅 시나리오: [scenario-webapp-debug-walkthrough.md](scenario-webapp-debug-walkthrough.md)
