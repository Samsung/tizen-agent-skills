# 시나리오 가이드: 네이티브 앱 디버깅(GDB) 처음부터 끝까지 체험하기

[English](scenario-native-debug-walkthrough.en.md) | 한국어

이 문서는 `tizen-sdk-skills` 플러그인으로 **Tizen 네이티브 앱(.tpk, C/C++) 원격 디버깅을 한 번에 전체 흐름으로 시험**해볼 수 있도록, "SDK 설치 → 에뮬레이터 → 네이티브 앱 생성 → Debug 빌드 → 설치 → gdbserver 셋업 → 호스트 GDB 연결"을 단계별로 안내합니다.

각 단계는 **Claude에게 자연어로 말하면** 해당 에이전트가 자동으로 동작합니다. 별도로 명령어를 외울 필요는 없습니다.

> 네이티브 앱은 디바이스에서 **네이티브 바이너리**로 실행되므로, 디바이스의 `gdbserver`와 호스트의 **GDB**를 `sdb forward`로 연결해 디버깅합니다. 담당 스킬은 `tizen-gdb-debug`입니다.
>
> ⚠️ 웹앱(.wgt)에는 네이티브 바이너리가 없어 GDB로 붙을 수 없습니다 → [scenario-webapp-debug-walkthrough.md](scenario-webapp-debug-walkthrough.md)
> ⚠️ .NET(C#) 앱은 CoreCLR에서 실행되므로 GDB가 아니라 netcoredbg를 씁니다 → [scenario-dotnet-debug-walkthrough.md](scenario-dotnet-debug-walkthrough.md)

---

## 0. 시작하기 전에

- **플러그인 설치 확인**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (미설치 시 [README.md](../README.md)의 "Cline 플러그인 설치" 참고)
- **OS**: Windows / Ubuntu(Linux) / macOS 모두 지원합니다. Claude가 현재 OS를 감지해 알맞은 스크립트를 실행합니다.
- **호스트 GDB**: 별도로 설치하지 않아도 됩니다. 스크립트가 디바이스 아키텍처(`uname -m`)를 확인해 **SDK에 포함된 아키텍처별 GDB**(예: `tools/x86_64-linux-gnu-gdb-*/bin/x86_64-linux-gnu-gdb`)를 자동으로 찾고, 없으면 PATH의 `gdb`를 사용합니다.
- **Debug 빌드 필수**: 디버그 심볼이 없는 Release 바이너리로는 브레이크포인트가 걸리지 않습니다. 4단계에서 **Debug** 구성으로 빌드하세요.
- **체험 목표(예시)**:
  - 앱 타입: **Native**
  - 템플릿: **ServiceApp**
  - 앱 이름: **MyApp** (원하는 이름으로 바꿔도 됩니다)

> 💡 각 단계에서 "이렇게 말하세요" 예시를 그대로 복사해 입력하면 됩니다.

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | 에뮬레이터 생성 및 실행 | `tizen-create-emulator` → `tizen-launch-emulator` |
| 3 | 네이티브 앱 템플릿 생성 (이름 지정) | `tizen-create-project` |
| 4 | Debug 구성으로 빌드 (`.tpk` 패키징) | `tizen-build-project` |
| 5 | 앱 설치 | `tizen-install-app` |
| 6 | GDB 디버깅 셋업 (gdbserver + 포트 포워딩 + init 파일) | `tizen-gdb-debug` |
| 7 | 호스트 터미널에서 GDB 실행 | (사용자) |

---

## 1단계 — Tizen SDK 설치

가장 먼저 개발 환경(SDK)을 설치합니다. 이미 설치되어 있으면 건너뜁니다.

**이렇게 말하세요:**
```
타이젠 SDK 설치해줘
```

**성공 확인:** "설치 완료" 메시지와 함께 설치된 패키지 수가 표시됩니다.

---

## 2단계 — 에뮬레이터 생성 및 실행

물리 디바이스가 없다면 에뮬레이터를 만들어 실행합니다. (VM 생성과 부팅은 서로 다른 스킬이지만, 한 번에 말해도 Claude가 순서대로 처리합니다.)

**이렇게 말하세요:**
```
에뮬레이터 생성하고 실행해줘
```

**성공 확인:** `sdb devices` 목록에 디바이스가 `device` 상태로 나타납니다.

> ⚠️ gdbserver는 앱 프로세스에 `ptrace`를 걸어야 하므로 **root 권한**이 필요합니다. 스크립트가 `sdb root on`을 시도하지만, 상용(production) 이미지는 이를 거부할 수 있습니다. 에뮬레이터/개발용 이미지 사용을 권장합니다.

---

## 3단계 — 네이티브 앱 템플릿 생성 (앱 이름 정하기)

Native 타입의 **ServiceApp** 템플릿으로 새 앱을 만들고, 앱 이름을 지정합니다.

**이렇게 말하세요:**
```
네이티브 ServiceApp 템플릿으로 MyApp 이라는 앱 만들어줘
```

**성공 확인:** 프로젝트 폴더가 생성되고 `tizen-manifest.xml`, 소스 파일, 빌드 설정이 들어 있습니다.
`tizen-manifest.xml`의 `<manifest package="...">` 값이 이후 단계에서 쓸 **앱 ID**입니다 (예: `org.example.myapp`).

> 💡 템플릿 목록은 설치된 SDK에서 동적으로 조회됩니다. `타이젠 앱 템플릿 알려줘` 라고 물으면 실제 사용 가능한 목록을 볼 수 있습니다.

---

## 4단계 — Debug 구성으로 빌드

생성한 프로젝트를 **Debug** 구성으로 빌드해 `.tpk` 패키지를 만듭니다. 디버그 심볼이 이 단계에서 만들어집니다.

**이렇게 말하세요:**
```
방금 만든 앱 Debug 구성으로 빌드해줘
```

**성공 확인:** 빌드 산출물인 **`.tpk` 패키지**와 심볼이 있는 실행 바이너리가 생성됩니다. 경로가 출력됩니다.

네이티브 빌드 산출물의 일반적인 위치:

| 항목 | 경로 |
|------|------|
| 패키지 | `<project>/Debug/<appid>-1.0.0-<arch>.tpk` |
| **심볼 포함 호스트 바이너리** | `<project>/Debug/tpk/bin/<exec>` |

> 💡 6단계에서 쓰는 **바이너리 경로**가 바로 위의 `Debug/tpk/bin/<exec>`입니다. 경로를 정확히 몰라도 됩니다 — 스크립트가 근처 디렉터리에서 같은 파일명을 자동 검색하며, `tpk/bin` 경로를 우선합니다.

---

## 5단계 — 앱 설치

빌드된 `.tpk`를 에뮬레이터(또는 디바이스)에 설치합니다.

**이렇게 말하세요:**
```
빌드한 앱 설치해줘
```

**성공 확인:** 설치 성공 메시지가 출력되고, 에뮬레이터 앱 목록에서 앱을 확인할 수 있습니다.

---

## 6단계 — GDB 디버깅 셋업

설치한 네이티브 앱에 대해 디바이스의 gdbserver를 띄우고, 포트 포워딩과 GDB init 파일까지 준비합니다.

### 모드 선택 — attach vs launch

| 모드 | 동작 | 언제 쓰나 | 브레이크포인트 예 |
|------|------|-----------|-------------------|
| **attach** (기본) | 앱을 정상 실행한 뒤 PID를 찾아 gdbserver가 **붙습니다** | 앱이 뜬 뒤 호출되는 콜백을 잡을 때 | `service_app_control`, 임의의 사용자 함수 |
| **launch** | gdbserver가 **직접 바이너리를 실행**하고 진입점에서 멈춥니다 | 앱 시작 코드를 잡을 때 | `main`, `service_app_create` |

> ⚠️ **`main`과 `service_app_create`는 launch 모드에서만 걸립니다.** attach 모드에서는 이미 그 코드가 지나간 상태라 절대 히트하지 않습니다. attach 모드로 이런 브레이크포인트를 요청하면 Claude가 다시 확인합니다.

**이렇게 말하세요:**
```
방금 설치한 네이티브 앱을 launch 모드로 디버깅해줘. 브레이크포인트는 main, service_app_create
```

Claude가 앱 ID, 바이너리 경로, 모드, 브레이크포인트를 확인한 뒤 셋업을 실행합니다. 내부적으로는 다음이 자동 수행됩니다:

1. `sdb devices`로 디바이스 확인
2. `pkgcmd -l`로 **wgt 앱 가드** — 웹앱이면 즉시 거절하고 `tizen-webapp-debug`로 안내
3. 호스트 바이너리 검증 (없으면 근처에서 자동 검색)
4. 디바이스 아키텍처에 맞는 **SDK GDB 자동 선택** + `sdb root on`
5. 디바이스에서 `gdbserver` 위치 확인 (`which gdbserver`, 기본 `/usr/bin/gdbserver`)
6. 모드별 타깃 결정
   - attach: `app_launcher -s <앱ID>` 실행 → `pidof <exec>`로 PID 확보 → `gdbserver :5039 --attach <PID>`
   - launch: `/opt/usr/globalapps/<앱ID>/bin`(또는 `/opt/usr/apps/...`)에서 디바이스 바이너리 검색 → `gdbserver :5039 <디바이스바이너리>`
7. `sdb forward tcp:5039 tcp:5039`
8. GDB init 파일 생성 (`set sysroot remote:/`, `file <호스트바이너리>`, `target remote localhost:5039`, `break ...`, launch 모드는 `continue`까지)
9. 실행할 **gdb 명령줄을 출력하고 종료** — 대화형 GDB는 에이전트가 띄울 수 없으므로 사용자가 직접 실행합니다

**성공 확인:** Standard JSON Envelope가 반환되고 `result`에 다음이 들어 있습니다:

```json
{
  "status": "success",
  "result": {
    "app_id": "org.example.myapp",
    "binary_path": "C:/ws/MyApp/Debug/tpk/bin/myapp",
    "mode": "launch",
    "port": 5039,
    "breakpoints": ["main", "service_app_create"],
    "app_pid": null,
    "gdbserver_status": "running",
    "port_forwarded": true,
    "gdb_init_file": "C:\\Users\\me\\AppData\\Local\\Temp\\tizen-gdb-3f2c....gdb",
    "gdb_command": {
      "powershell": "& \"C:\\tizen-sdk\\tools\\x86_64-linux-gnu-gdb-15.1\\bin\\x86_64-linux-gnu-gdb.exe\" -x \"C:\\Users\\me\\AppData\\Local\\Temp\\tizen-gdb-3f2c....gdb\"",
      "cmd": "\"C:\\tizen-sdk\\tools\\x86_64-linux-gnu-gdb-15.1\\bin\\x86_64-linux-gnu-gdb.exe\" -x \"C:\\Users\\me\\AppData\\Local\\Temp\\tizen-gdb-3f2c....gdb\""
    },
    "note": "Run ONE of the gdb_command lines in an interactive terminal..."
  }
}
```

| 필드 | 의미 |
|------|------|
| `mode` | `attach` \| `launch` |
| `app_pid` | attach 모드에서 찾은 PID (launch 모드는 `null`) |
| `gdbserver_status` | `running` — 디바이스에서 gdbserver가 대기 중 |
| `port_forwarded` | `true` — `호스트 tcp:5039 → 디바이스 tcp:5039` 포워딩 완료 |
| `gdb_init_file` | 자동 생성된 GDB 스크립트 경로 (`-x`로 넘겨짐) |
| `gdb_command` | Windows는 `powershell`·`cmd` 두 가지, Linux/macOS는 `shell` 한 가지 |

> 💡 `gdb_command.powershell`의 맨 앞 `&`는 **PowerShell 전용**입니다. cmd에서는 `cmd` 형태를 쓰세요.

---

## 7단계 — 호스트 터미널에서 GDB 실행

반환된 `gdb_command`를 **대화형 터미널**에 그대로 붙여 실행합니다. init 파일이 이미 `file`/`target remote`/`break`를 다 수행하므로 별도 설정이 필요 없습니다.

**Windows (PowerShell):**
```powershell
& "C:\tizen-sdk\tools\x86_64-linux-gnu-gdb-15.1\bin\x86_64-linux-gnu-gdb.exe" -x "C:\Users\me\AppData\Local\Temp\tizen-gdb-3f2c....gdb"
```

**Linux / macOS:**
```bash
"/home/me/tizen-sdk/tools/x86_64-linux-gnu-gdb-15.1/bin/x86_64-linux-gnu-gdb" -x "/tmp/tizen-gdb-3f2c....gdb"
```

**성공 확인:** 다음과 같은 출력 뒤 `(gdb)` 프롬프트가 뜹니다.

```
Remote debugging using localhost:5039
Breakpoint 1 at 0x...: file src/myapp.c, line 42.
...
Breakpoint 1, main (argc=1, argv=0x...) at src/myapp.c:42
```

자주 쓰는 GDB 명령:

| 명령 | 설명 |
|------|------|
| `bt` | 콜스택 출력 |
| `info locals` | 현재 프레임의 지역변수 |
| `p <변수>` | 변수 값 출력 |
| `next` / `step` | 한 줄 실행 / 함수 안으로 진입 |
| `break <파일>:<줄>` | 브레이크포인트 추가 |
| `continue` | 실행 재개 |
| `quit` | 세션 종료 |

> 💡 `quit`으로 GDB를 끝내면 gdbserver의 디버그 세션도 함께 끝납니다. 다시 디버깅하려면 **6단계를 한 번 더 실행**하세요. (`target remote`에서 connection refused가 나면 이 경우입니다.)

---

## E2E 검증 체크리스트

수동 E2E 테스트 시 아래 항목을 확인하세요.

### 정상 경로

| # | 확인 항목 | 기대 결과 |
|---|-----------|-----------|
| 1 | 6단계 envelope | `status: "success"`, `gdb_command`·`gdb_init_file`·`gdbserver_status: "running"` 존재, exit code `0` |
| 2 | `sdb shell "ps -ef \| grep gdbserver"` | gdbserver 프로세스가 살아 있음 |
| 3 | `sdb forward --list` | `tcp:5039 → tcp:5039` 항목 존재 |
| 4 | attach 모드 envelope | `app_pid`가 숫자, `mode: "attach"` |
| 5 | launch 모드 envelope | `app_pid: null`, `breakpoints`에 `main` 포함 (미지정 시 자동으로 `main`) |
| 6 | 7단계 GDB 실행 | `Remote debugging using localhost:5039` 출력 후 `(gdb)` 프롬프트 |
| 7 | launch 모드 브레이크포인트 | `main`/`service_app_create`에서 정지 |
| 8 | `bt` / `info locals` | 심볼이 해석된 콜스택·변수 표시 (Debug 빌드 확인) |
| 9 | GDB init 파일 | 6단계 후에도 파일이 남아 있어 재사용 가능 |

### 실패 경로 (에러 매핑)

| # | 시나리오 | 기대 결과 |
|---|-----------|-----------|
| 10 | 디바이스/에뮬레이터 없음 | `error_category: "device_not_found"` — `tizen-create-emulator` → `tizen-launch-emulator` 안내 |
| 11 | 웹앱(.wgt) 앱 ID로 실행 | `error_category: "io_error"` — 상세에 `is a Web app (wgt)`, `tizen-webapp-debug`로 라우팅 |
| 12 | attach 모드에서 PID 못 찾음 (미설치/실행 실패) | `error_category: "io_error"` — "Could not find the app PID within 30s", launch 모드 사용 안내 |
| 13 | 호스트 바이너리 없음 (자동 검색도 실패) | `error_category: "io_error"` — 상세에 `Host binary not found`, `<project>\Debug\tpk\bin\<exec>` 힌트 |
| 14 | launch 모드인데 디바이스에 바이너리 없음 (미설치) | `error_category: "io_error"` — `Cannot find app binary on device at /opt/usr/apps/<앱ID>/bin/` |
| 15 | 디바이스에 gdbserver 없음 | `error_category: "io_error"` — `gdbserver not found at /usr/bin/gdbserver` |
| 16 | 호스트에 GDB 없음 (SDK·PATH 모두) | `error_category: "io_error"` — `No GDB found`, `-Gdb <경로>` 지정 안내 |
| 17 | 잘못된 앱 ID / 포트 / 브레이크포인트 형식 | `error_category: "invalid_parameters"` |
| 18 | attach 모드 + `main` 브레이크포인트 | 셋업은 성공하지만 브레이크포인트가 히트하지 않음 → launch 모드로 재시도 |
| 19 | Release 빌드로 디버깅 | 셋업은 성공하나 `info locals`/줄 번호가 해석되지 않음 → Debug로 재빌드·재설치 |

### CLI 직접 실행 (에이전트 없이 검증할 때)

**Linux / macOS / Ubuntu (Bash):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/gdb-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
node "$CLI" org.example.myapp "/home/me/ws/MyApp/Debug/tpk/bin/myapp" launch "main,service_app_create" 5039
```

**Windows (cmd.exe / PowerShell):**
```
dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*gdb-debug-cli.js"
node "<찾은-경로>" org.example.myapp "C:/ws/MyApp/Debug/tpk/bin/myapp" launch "main,service_app_create" 5039
```

인자 순서: `<appId> <binaryPath> [attach|launch] [breakpoints|-] [port]`
Exit code: `0` = success envelope, `1` = failure/error envelope.

---

## 한 번에 따라 하기 (복사용 프롬프트 모음)

순서대로 입력하세요:

```
1) 타이젠 SDK 설치해줘
2) 에뮬레이터 생성하고 실행해줘
3) 네이티브 ServiceApp 템플릿으로 MyApp 이라는 앱 만들어줘
4) 방금 만든 앱 Debug 구성으로 빌드해줘
5) 빌드한 앱 설치해줘
6) 방금 설치한 네이티브 앱을 launch 모드로 디버깅해줘. 브레이크포인트는 main, service_app_create
```

마지막으로 반환된 `gdb_command`를 터미널에 붙여 실행하면 `(gdb)` 프롬프트에서 디버깅이 시작됩니다.

## 관련 문서

- 에이전트 전체 설명: [README.md](../README.md)
- 스킬 상세 레퍼런스: [SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) (tizen-gdb-debug)
- 네이티브 앱 기본 시나리오(디버깅 제외): [scenario-native-app-walkthrough.md](../project/scenario-native-app-walkthrough.md)

- .NET 앱 디버깅 시나리오: [scenario-dotnet-debug-walkthrough.md](scenario-dotnet-debug-walkthrough.md)
- 웹앱 디버깅 시나리오: [scenario-webapp-debug-walkthrough.md](scenario-webapp-debug-walkthrough.md)
