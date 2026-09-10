# 시나리오 가이드: 웹앱 Playwright 자동화 테스트 처음부터 끝까지 체험하기

이 문서는 `tizen-sdk-skills` 플러그인으로 **Tizen 웹앱(.wgt)을 Playwright로 자동화 테스트하는 전체 흐름을 한 번에 시험**해볼 수 있도록, "SDK 설치 → 에뮬레이터 → 웹앱 생성 → 빌드 → 설치 → 테스트 스캐폴딩 → Playwright 설치 → 테스트 실행"을 단계별로 안내합니다.

각 단계는 **Claude에게 자연어로 말하면** 해당 에이전트가 자동으로 동작합니다. 별도로 명령어를 외울 필요는 없습니다.

> 웹앱은 웹 런타임(Chromium 계열 엔진) 안에서 실행되므로 Playwright가 **CDP(Chrome DevTools Protocol)로 attach**해서 테스트합니다. 담당 스킬은 `tizen-playwright-test`이며, CDP 셋업은 내부적으로 `tizen-webapp-debug` 흐름을 재사용합니다. 인터랙티브 디버깅(DevTools)이 목적이라면 [scenario-webapp-debug-walkthrough.md](../debug/scenario-webapp-debug-walkthrough.md)를 보세요.

---

## 0. 시작하기 전에

- **플러그인 설치 확인**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (미설치 시 [README.md](../README.md)의 "Cline 플러그인 설치" 참고)
- **OS**: Windows / Ubuntu(Linux) / macOS 모두 지원합니다. Claude가 현재 OS를 감지해 알맞은 방식으로 실행합니다.
- **Node.js 20+ 필요**: Playwright 실행에 필요합니다 (테스트는 `node <테스트파일>`로 실행됨).
- **Playwright는 테스트 프로젝트에 설치됩니다**: 플러그인에는 절대 설치되지 않습니다 — 테스트 프로젝트 디렉터리에서 `npm install playwright` 한 번이면 됩니다 (7단계).
- **체험 목표(예시)**:
  - 앱 타입: **WebApp**
  - 템플릿: **BasicUI (Web)**
  - 앱 이름: **MyWebApp** (원하는 이름으로 바꿔도 됩니다)
  - 테스트 프로젝트: **`~/tizen-playwright-test`** 폴더 (사용자 홈 밑 **고정 경로** — Windows: `%USERPROFILE%\tizen-playwright-test`. 폴더가 없으면 스캐폴딩 전에 먼저 만들어야 합니다)

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
| 6 | 테스트 파일 스캐폴딩 | `tizen-playwright-test` (`--scaffold`) |
| 7 | 테스트 프로젝트에 Playwright 설치 | (사용자 또는 에이전트) |
| 8 | 테스트 실행 (CDP 셋업 + node 스폰) | `tizen-playwright-test` |

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

> ⚠️ RWI(Remote Web Inspector)는 에뮬레이터/개발용 이미지에서 지원됩니다. 일부 상용(production) 이미지는 웹 디버그 실행을 거부할 수 있습니다.

---

## 3단계 — 웹앱 템플릿 생성 (앱 이름 정하기)

WebApp 타입의 **BasicUI** 템플릿으로 새 앱을 만들고, 앱 이름을 지정합니다.

**이렇게 말하세요:**
```
웹앱 BasicUI 템플릿으로 MyWebApp 이라는 앱 만들어줘
```

**성공 확인:** 프로젝트 폴더가 생성되고 `config.xml`, `index.html` 등이 들어 있습니다.
`config.xml`의 `<tizen:application id="...">` 값이 이후 단계에서 쓸 **앱 ID**입니다 (예: `abcDEF1234.MyWebApp`).

> 💡 BasicUI 템플릿은 `#main`을 클릭하면 `#content-text`가 `Basic` ↔ `Tizen`으로 토글됩니다 — 9단계에서 이 동작을 테스트로 검증해봅니다.

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

## 6단계 — 테스트 파일 스캐폴딩

테스트 프로젝트 폴더에 시작용 테스트 파일을 생성합니다. 디바이스가 필요 없는 단계입니다.

**이렇게 말하세요:**
```
MyWebApp 을 위한 playwright 테스트를 홈 밑의 tizen-playwright-test 폴더에 스캐폴딩해줘
```

**성공 확인:** envelope의 `result.created`에 두 파일이 나열됩니다:

- `~/tizen-playwright-test/tizen-playwright.test.js` — 시작용 테스트 (attach-only 패턴, 실패 시 스크린샷, `TEST_RESULT:` 마커)
- `~/tizen-playwright-test/package.json` — `playwright` 의존성이 선언된 최소 구성 (기존 package.json이 있으면 건드리지 않음)

**스캐폴딩된 템플릿이 지키는 규칙 (직접 수정할 때도 유지하세요):**

- **attach-only**: `connectOverCDP` → `contexts()[0].pages()[0]` — 절대 `page.goto()`/`newPage()`를 호출하지 않습니다. Tizen 웹 런타임이 단일 페이지를 소유하므로 내비게이션은 앱 UI를 죽입니다.
- **리스너 선등록**: `page.on('console')`/`pageerror`를 상호작용 전에 등록해 로그를 놓치지 않습니다.
- **진짜 exit code**: `console.assert` 대신 실패 카운트 → `process.exit(1)` — 러너가 pass/fail을 판정하는 근거입니다.
- **엔드포인트는 env로**: `TIZEN_CDP_ENDPOINT` 환경변수(러너가 주입)를 읽고, 없을 때만 `http://127.0.0.1:9222`로 폴백합니다.

---

## 7단계 — 테스트 프로젝트에 Playwright 설치

**이렇게 말하세요:**
```
홈 밑의 tizen-playwright-test 폴더에 playwright 설치해줘
```

또는 직접:

```bash
cd ~/tizen-playwright-test && npm install playwright
```

**성공 확인:** `~/tizen-playwright-test/node_modules/playwright`가 생깁니다. 브라우저 다운로드는 필요 없습니다 — `connectOverCDP`는 디바이스의 웹 런타임에 접속하므로 Playwright 내장 Chromium을 쓰지 않습니다.

> 🔴 **플러그인 캐시(`~/.claude/plugins/...`)에는 절대 설치하지 마세요.** Playwright는 항상 테스트 프로젝트의 `node_modules`에서 해석됩니다.

---

## 8단계 — 테스트 실행

앱을 디버그 모드로 재실행하고 CDP를 셋업한 뒤, 테스트 파일을 실행합니다.
내부적으로 `app_launcher -w -s <앱ID>` → RWI 포트 파싱 → `sdb forward` → CDP 검증 → `node ~/tizen-playwright-test/tizen-playwright.test.js` 스폰(환경변수 `TIZEN_CDP_ENDPOINT`/`TIZEN_CDP_PORT`/`TIZEN_APP_ID` 전달)이 자동으로 수행됩니다.

**이렇게 말하세요:**
```
MyWebApp 을 홈 밑의 tizen-playwright-test 폴더의 playwright 테스트로 테스트해줘
```

**성공 확인:** Standard JSON Envelope가 반환되고 `result`에 다음이 들어 있습니다:

```json
{
  "status": "success",
  "result": {
    "app_id": "abcDEF1234.MyWebApp",
    "test_file": ".../tizen-playwright-test/tizen-playwright.test.js",
    "project_dir": ".../tizen-playwright-test",
    "cdp_endpoint": "http://127.0.0.1:9222",
    "app_pid": 1234,
    "exit_code": 0,
    "passed": true,
    "summary": { "result": "pass", "total": 2, "failed": 0, "passed": 2 },
    "output_tail": [
      "PASS app page has a body",
      "PASS app title is not empty",
      "TEST_RESULT: pass total=2 failed=0"
    ],
    "note": "The RWI session and the port forward stay alive — rerun with --no-setup to skip the app relaunch while the app keeps running."
  }
}
```

> 💡 RWI 세션과 포트 포워딩은 실행 후에도 유지됩니다 — 앱이 계속 실행 중이라면 `--no-setup`으로 재실행하면 앱 재기동 없이 테스트만 다시 돕니다. 앱을 **재시작**했다면 RWI 포트가 무효화되므로 `--no-setup` 없이 실행하세요.

---

## 9단계 — 앱에 맞는 테스트 작성 (선택)

`~/tizen-playwright-test/tizen-playwright.test.js`의 `── Your tests ──` 구간을 앱의 실제 셀렉터로 채웁니다. BasicUI 템플릿이라면:

```javascript
await page.locator('#main').click();
await expect('text toggled to Tizen', async () =>
  (await page.locator('#content-text').textContent()) === 'Tizen');
await page.locator('#main').click();
await expect('text toggled back to Basic', async () =>
  (await page.locator('#content-text').textContent()) === 'Basic');
```

다시 8단계 프롬프트로 실행하면 됩니다. assertion이 실패하면 envelope가 `test_failed`로 바뀌고 `output_tail`에 FAIL 줄이, 프로젝트 폴더에 `test-failure.png` 스크린샷이 남습니다.

---

## E2E 검증 체크리스트

수동 E2E 테스트 시 아래 항목을 확인하세요.

### 정상 경로

| # | 확인 항목 | 기대 결과 |
|---|-----------|-----------|
| 1 | 6단계 스캐폴딩 envelope | `status: "success"`, `created[]`에 테스트 파일 + package.json, exit code `0` |
| 2 | 스캐폴딩 재실행 (`--force` 없이) | `invalid_parameters` — "--force to overwrite" 안내 |
| 3 | 8단계 실행 envelope | `status: "success"`, `passed: true`, `summary.failed: 0`, exit code `0` |
| 4 | 테스트 자식이 env를 받는지 | `output_tail`에 앱 콘솔 로그(`[app console:...]`)가 섞여 나옴 (attach 성공 증거) |
| 5 | 앱 실행 유지 중 `--no-setup` 재실행 | 앱 재기동 없이 즉시 테스트 실행, 성공 |
| 6 | 일부러 틀린 assertion 추가 후 실행 | `error_category: "test_failed"`, `output_tail`에 FAIL 줄, `test-failure.png` 생성 |

### 실패 경로 (에러 매핑)

| # | 시나리오 | 기대 결과 |
|---|-----------|-----------|
| 7 | 테스트 프로젝트에 playwright 미설치 | `error_category: "dependency_missing"` — suggested_fix에 `npm install playwright` |
| 8 | 테스트 파일 없음 (스캐폴딩 전 실행) | `error_category: "invalid_parameters"` — `--scaffold` 안내 |
| 9 | 디바이스/에뮬레이터 없음 | `error_category: "device_not_found"` — `tizen-device-manager` 안내 (셋업 envelope 그대로 전파) |
| 10 | Native/.NET 앱 ID로 실행 (예: `.tpk` 앱) | `error_category: "invalid_parameters"` — "is not a Web app", `tizen-gdb-debug`/`tizen-dotnet-debug`로 라우팅 |
| 11 | 앱 재시작 후 `--no-setup`으로 실행 | `error_category: "inspector_not_available"` — 엔드포인트 무응답, `--no-setup` 제거 안내 |
| 12 | 테스트가 끝나지 않음 (`process.exit` 누락 등) | `--timeout` 초과 시 강제 종료 — `error_category: "test_timeout"` |
| 13 | RWI 미지원 이미지 | `error_category: "inspector_not_available"` — "No RWI port in app_launcher output" (셋업 단계에서) |

### CLI 직접 실행 (에이전트 없이 검증할 때)

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/playwright-test-cli.js 2>/dev/null | sort -V | tail -1) || true

# 0) 고정 테스트 프로젝트 폴더 생성 (최초 1회)
mkdir -p "$HOME/tizen-playwright-test"

# 1) 스캐폴딩 (디바이스 불필요)
node "$CLI" --scaffold --project-dir "$HOME/tizen-playwright-test" --app-id abcDEF1234.MyWebApp

# 2) 의존성 설치
cd "$HOME/tizen-playwright-test" && npm install playwright && cd -

# 3) 실행 (CDP 셋업 + 테스트)
node "$CLI" --app-id abcDEF1234.MyWebApp --project-dir "$HOME/tizen-playwright-test"

# 4) 앱이 계속 떠 있는 동안 빠른 재실행
node "$CLI" --app-id abcDEF1234.MyWebApp --project-dir "$HOME/tizen-playwright-test" --no-setup
```

tizen-cli 하네스에서는:

```
tizen-cli tizen-sdk playwright-test --app-id abcDEF1234.MyWebApp --project-dir ~/tizen-playwright-test
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
6) MyWebApp 을 위한 playwright 테스트를 홈 밑의 tizen-playwright-test 폴더에 스캐폴딩해줘
7) 홈 밑의 tizen-playwright-test 폴더에 playwright 설치해줘
8) MyWebApp 을 홈 밑의 tizen-playwright-test 폴더의 playwright 테스트로 테스트해줘
```

마지막 envelope의 `result.passed`가 `true`이고 `summary.failed`가 `0`이면 성공입니다.

## 관련 문서

- 에이전트 전체 설명: [README.md](../README.md)
- 스킬 상세 레퍼런스: [SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) (18. tizen-playwright-test)
- 웹앱 디버깅(인터랙티브) 시나리오: [scenario-webapp-debug-walkthrough.md](../debug/scenario-webapp-debug-walkthrough.md)
