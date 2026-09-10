# 시나리오 가이드: 웹앱 디버깅(RWI/CDP) 처음부터 끝까지 체험하기

이 문서는 `tizen-sdk-skills` 플러그인으로 **Tizen 웹앱(.wgt) 원격 디버깅을 한 번에 전체 흐름으로 시험**해볼 수 있도록, "SDK 설치 → 에뮬레이터 → 웹앱 생성 → 빌드 → 설치 → RWI/CDP 디버깅 → Chrome DevTools 연결"을 단계별로 안내합니다.

각 단계는 **Claude에게 자연어로 말하면** 해당 에이전트가 자동으로 동작합니다. 별도로 명령어를 외울 필요는 없습니다.

> 웹앱은 웹 런타임(Chromium 계열 엔진) 안에서 실행되므로 gdb/netcoredbg가 아니라 **RWI(Remote Web Inspector) + CDP(Chrome DevTools Protocol)** 로 디버깅합니다. 담당 스킬은 `tizen-webapp-debug`입니다.

---

## 0. 시작하기 전에

- **플러그인 설치 확인**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (미설치 시 [README.md](../README.md)의 "Cline 플러그인 설치" 참고)
- **OS**: Windows / Ubuntu(Linux) / macOS 모두 지원합니다. Claude가 현재 OS를 감지해 알맞은 스크립트를 실행합니다.
- **호스트에 curl 필요**: CDP 엔드포인트 검증에 사용합니다 (Windows 10+/macOS/대부분의 Linux에 기본 포함).
- **체험 목표(예시)**:
  - 앱 타입: **WebApp**
  - 템플릿: **BasicUI (Web)**
  - 앱 이름: **MyWebApp** (원하는 이름으로 바꿔도 됩니다)

> 💡 각 단계에서 "이렇게 말하세요" 예시를 그대로 복사해 입력하면 됩니다.

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 담당 에이전트 |
|------|------|---------------|
| 1 | Tizen SDK 설치 | `tizen-sdk-install` |
| 2 | 에뮬레이터 생성 및 실행 | `tizen-device-manager` |
| 3 | 웹앱 템플릿 생성 (이름 지정) | `tizen-create-project` |
| 4 | 앱 빌드 (`.wgt` 패키징) | `tizen-build-project` |
| 5 | 앱 설치 | `tizen-install-app` |
| 6 | 웹앱 디버깅 셋업 (RWI/CDP) | `tizen-webapp-debug` |
| 7 | Chrome DevTools로 연결 | (사용자) |

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

물리 디바이스가 없다면 에뮬레이터를 만들어 실행합니다.

**이렇게 말하세요:**
```
에뮬레이터 생성하고 실행해줘
```

**성공 확인:** `DEVICE_SERIAL=...` 형태로 연결된 디바이스가 출력됩니다.

> ⚠️ RWI는 에뮬레이터/개발용 이미지에서 지원됩니다. 일부 상용(production) 이미지는 웹 디버그 실행을 거부할 수 있습니다.

---

## 3단계 — 웹앱 템플릿 생성 (앱 이름 정하기)

WebApp 타입의 **BasicUI** 템플릿으로 새 앱을 만들고, 앱 이름을 지정합니다.

**이렇게 말하세요:**
```
웹앱 BasicUI 템플릿으로 MyWebApp 이라는 앱 만들어줘
```

**성공 확인:** 프로젝트 폴더가 생성되고 `config.xml`, `index.html` 등이 들어 있습니다.
`config.xml`의 `<tizen:application id="...">` 값이 이후 단계에서 쓸 **앱 ID**입니다 (예: `abcDEF1234.MyWebApp`).

---

## 4단계 — 앱 빌드

생성한 프로젝트를 빌드해 `.wgt` 패키지를 만듭니다.

**이렇게 말하세요:**
```
방금 만든 앱 빌드해줘
```

**성공 확인:** 빌드 산출물인 **`.wgt` 패키지**가 프로젝트의 빌드 디렉터리에 생성됩니다. 경로가 출력됩니다.

---

## 5단계 — 앱 설치

빌드된 `.wgt`를 에뮬레이터(또는 디바이스)에 설치합니다.

**이렇게 말하세요:**
```
빌드한 앱 설치해줘
```

**성공 확인:** 설치 성공 메시지가 출력되고, 에뮬레이터 앱 목록에서 앱을 확인할 수 있습니다.

---

## 6단계 — 웹앱 디버깅 셋업 (RWI/CDP)

설치한 웹앱을 디버그 모드로 재실행하고 CDP 엔드포인트를 준비합니다.
내부적으로 `app_launcher -w -s <앱ID>` 실행 → RWI 포트 파싱 → `sdb forward tcp:9222 tcp:<RWI포트>` → `/json/version`·`/json/list` 검증이 자동으로 수행됩니다.

**이렇게 말하세요:**
```
방금 설치한 웹앱 디버깅해줘
```

**성공 확인:** Standard JSON Envelope가 반환되고 `result`에 다음이 들어 있습니다:

```json
{
  "status": "success",
  "result": {
    "app_id": "abcDEF1234.MyWebApp",
    "app_pid": 1234,
    "device_port": 45678,
    "host_port": 9222,
    "port_forwarded": true,
    "cdp_endpoint": "http://127.0.0.1:9222",
    "browser": "Chrome/...",
    "pages": [
      {
        "id": "...",
        "type": "page",
        "title": "MyWebApp",
        "url": "file:///.../index.html",
        "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/...",
        "devtoolsFrontendUrl": "..."
      }
    ],
    "connect": {
      "devtools": "http://127.0.0.1:9222/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/..."
    }
  }
}
```

> 💡 RWI 세션과 포트 포워딩은 셋업 후에도 유지됩니다 — 앱이 실행 중인 동안 언제든 연결/재연결할 수 있습니다. 앱을 재시작했다면 이 단계를 다시 실행하세요.

---

## 7단계 — Chrome DevTools로 연결

1. 결과 envelope의 `connect.devtools` 링크를 Chrome에서 엽니다.
   (예: `http://127.0.0.1:9222/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/<페이지ID>`)
2. Elements/Console/Sources/Network 패널로 웹앱을 실시간 디버깅합니다.

**성공 확인:** Elements 패널에 웹앱 DOM이 표시되고, Console에서 자바스크립트를 실행할 수 있습니다.

---

## E2E 검증 체크리스트

수동 E2E 테스트 시 아래 항목을 확인하세요.

### 정상 경로

| # | 확인 항목 | 기대 결과 |
|---|-----------|-----------|
| 1 | 6단계 envelope | `status: "success"`, `cdp_endpoint`·`pages[]`·`connect.devtools` 존재, exit code `0` |
| 2 | `curl http://127.0.0.1:9222/json/version` | `Browser` 필드가 있는 JSON 응답 |
| 3 | `curl http://127.0.0.1:9222/json/list` | 앱 페이지가 포함된 JSON 배열 |
| 4 | 스크립트 종료 후 재접속 | 포워딩이 유지되어 2·3번이 계속 성공 |
| 5 | DevTools 연결 (7단계) | Elements 패널에 웹앱 DOM 표시 |
| 6 | DevTools Console | 자바스크립트 실행 결과 반환 |

### 실패 경로 (에러 매핑)

| # | 시나리오 | 기대 결과 |
|---|-----------|-----------|
| 7 | 디바이스/에뮬레이터 없음 | `error_category: "device_not_found"` — `tizen-device-manager` 안내 |
| 8 | Native/.NET 앱 ID로 실행 (예: `.tpk` 앱) | `error_category: "invalid_parameters"` — "is not a Web app", `tizen-gdb-debug`/`tizen-dotnet-debug`로 라우팅 |
| 9 | 호스트 포트 점유 (예: 9222를 다른 프로세스가 사용) | `error_category: "io_error"` — "Port forward failed", 다른 `--port` 재시도 안내 |
| 10 | RWI 미지원 이미지 / 앱이 디버그 실행 실패 | `error_category: "inspector_not_available"` — "No RWI port in app_launcher output" |
| 11 | 포워딩은 됐지만 CDP 무응답 (타임아웃) | `error_category: "inspector_not_available"` — "CDP endpoint not reachable" |
| 12 | 미설치 앱 ID | 8번과 동일 (`pkgcmd -l`에 없음 → wgt 가드에서 거절, 설치 안내 포함) |

### CLI 직접 실행 (에이전트 없이 검증할 때)

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/webapp-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
node "$CLI" --app-id abcDEF1234.MyWebApp --port 9222 --timeout 30
```

Exit code: `0` = success envelope, `1` = failure/error envelope.

---

## 한 번에 따라 하기 (복사용 프롬프트 모음)

순서대로 입력하세요:

```
1) 타이젠 SDK 설치해줘
2) 에뮬레이터 생성하고 실행해줘
3) 웹앱 BasicUI 템플릿으로 MyWebApp 이라는 앱 만들어줘
4) 방금 만든 앱 빌드해줘
5) 빌드한 앱 설치해줘
6) 방금 설치한 웹앱 디버깅해줘
```

마지막으로 반환된 `connect.devtools` 직접 링크를 Chrome에서 열면 끝입니다.

## 관련 문서

- 에이전트 전체 설명: [README.md](../README.md)
- 스킬 상세 레퍼런스: [SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) (12. tizen-webapp-debug)
- 네이티브 앱 시나리오: [scenario-native-app-walkthrough.md](../project/scenario-native-app-walkthrough.md)

- 네이티브 앱 디버깅(GDB) 시나리오: [scenario-native-debug-walkthrough.md](scenario-native-debug-walkthrough.md)
- .NET 앱 디버깅(netcoredbg) 시나리오: [scenario-dotnet-debug-walkthrough.md](scenario-dotnet-debug-walkthrough.md)
