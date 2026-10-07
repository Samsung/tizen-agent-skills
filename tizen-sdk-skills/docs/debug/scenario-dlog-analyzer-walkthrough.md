# 시나리오 가이드: Tizen DLog Analyzer 엔드투엔드

[English](scenario-dlog-analyzer-walkthrough.en.md) | 한국어

이 문서는 `tizen-sdk-skills` 플러그인을 사용한 **전체 Tizen dlog 분석 흐름**을 안내합니다: "에뮬레이터 실행 → 백그라운드 로그 모니터링 시작 → 앱 설치 및 실행 → 사용자 이슈 보고 → 분석된 로그 확인 → 수정 적용 → 재빌드 → 재설치 → 검증 → 모니터링 중지".

각 단계에서 **자연어 명령**(에이전트에게 전달하는 내용)과 **tizen-cli** 명령(내부적으로 실행되는 명령)을 함께 보여줍니다.

> `tizen-dlog-analyzer` 바이너리는 백그라운드에서 실행되며, Tizen 디바이스/에뮬레이터의 dlog 출력을 지속적으로 수집하고 분석합니다. 크래시나 예외가 발생하면 에이전트가 분석된 출력을 가져와 수정을 적용하고, 재빌드 및 검증을 수행합니다 — 사용자가 직접 원시 dlog를 파싱할 필요가 없습니다.

---

## 핵심 규칙

이 워크플로우를 따를 때 다음 규칙을 항상 따르세요:

1. **항상 `dlog-collect`로 로그를 수집하세요** — 절대 `sdb shell dlog` 같은 원시 명령을 사용하면 안 됩니다. 시스템 전체(`start dlog-collect` / `start start-monitoring`)든 앱별(`dlog-collect <app-id>`)든 `dlog-collect`를 사용해야 합니다.
2. **항상 `error-analyze` (앱별) 또는 `check` (시스템 모니터링)으로 분석하세요** — 로그 파일을 직접 읽으면 안 됩니다. 이 명령들이 중복 제거, 분류, 포맷팅을 처리합니다.
3. **연속 명령 후에는 디바이스를 사용자에게 넘기고 턴을 끝내세요** — `start-monitoring`, `dlog-collect <app-id>`, `kernel collect` 등 연속 명령을 시작한 후, 사용자에게 앱을 사용하며 이슈를 재현해 달라고 요청하고 다음 중 하나를 선택하도록 하세요:
   - **재현 완료 — 에러/크래시/증상이 발생했어요** (열린 세션이면 **계속 수집**)
   - **아무 일도 없었어요** / **지금 중지하고 분석**: 수집을 중지(`stop`, `stop-collect`, `kernel stop`)하고 `check` / `error-analyze` / `kernel analyze`를 실행
   
   **폴링·루핑·`sleep` 금지** — 재현 시간은 사용자의 것입니다. 타이머는 사용자 답변의 대체물이 아니며, 가드 훅이 `sleep … && stop-collect`를 차단합니다 (이슈 #212).
4. **문제 보고는 에뮬레이터가 언급되어도 이 스킬의 일입니다** — "에뮬레이터에서 com.samsung.fh.youtube 동영상을 재생하니 CPU가 300%까지 올라가고 재생이 안 돼요, 조사해줘"는 `tizen-device-manager`(디바이스 목록·에뮬레이터 종료 전용)의 작업이 아니라 여기로 라우팅합니다 (이슈 #211).
5. **커널 로그는 `kernel collect` → `kernel stop` → `kernel analyze`로** — `sdb shell dmesg` / `cat /proc/kmsg` 금지 (이슈 #213).
6. **증거 프로브는 `investigate --symptoms "…"`와 `probe run <id>`로** — `sdb shell top / ps / free / cat /proc/meminfo`를 직접 치지 않습니다 (이슈 #214).
7. **에러부터 분석, 전체 로그는 마지막에** — `error-analyze <app-id> summary` → `check` → `kernel analyze`; 증상이 설명되지 않을 때만 `error-analyze … details` → `search "<발견된 문자열>" --context 1` (수집된 모든 카테고리, 엔트리 단위) → 필터를 건 `app-log` → `probe run` (이슈 #215, #254).

---

## 증상 조사 (CPU / 멈춤 / 동영상 재생 안 됨) — 짧은 경로

사용자가 크래시가 아닌 증상을 보고할 때 — 예: *"에뮬레이터에서 com.samsung.fh.youtube 동영상을 재생하니 호스트 CPU가 300%까지 올라가고 동영상이 재생되지 않아요. 조사해줘."* — 에이전트는 다음 순서로 진행합니다:

| 단계 | 에이전트 동작 | tizen-cli 명령 |
|------|---------------|----------------|
| 1 | 1차 조사: 증상 → 프로브 번들 → 상관 분석 보고서 | `tizen-cli tizen-sdk dlog-analyzer --action investigate --symptoms "300% cpu, video not playing" --app-id com.samsung.fh.youtube` |
| 2 | 재현 **전에** 수집기 시작 | `--action start --subcommand start-monitoring` · `--action kernel --subcommand collect` · `--action app-launch --app-id …` · `--action dlog-collect --app-id …` |
| 3 | **멈추고 질문** — "지금 이슈를 재현해 주세요. (1) 재현 완료, 발생했어요 / (2) 아무 일 없었어요" — 그리고 **턴 종료** | (에이전트 상호작용 — `sleep`·폴링 없음) |
| 4 | 답변 후: 수집기 중지 | `--action stop-collect` · `--action kernel --subcommand stop` |
| 5 | 에러부터 분석 | `--action error-analyze --app-id … --format summary` → `--action check` → `--action kernel --subcommand analyze` |
| 6 | 설명되지 않을 때만 확대 | `--action error-analyze --format details` → `--action search --pattern "<발견된 문자열>" --context 1 --priority W` → `--action app-log --app-id … --priority W --since 10m --max-lines 300` → `--action probe --subcommand list` / `--subcommand run --app-id <probe-id>` |
| 7 | 2개 언어 보고서, 다음 단계 안내, 정리 | `--action stop` |

---

## 0. 시작하기 전에

- **플러그인 설치**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (설치되어 있지 않다면 [README.md](../README.md)의 "Cline 플러그인 설치" 참조)
- **OS**: Windows / Ubuntu (Linux) / macOS를 모두 지원합니다.
- **Tizen SDK**: 설치되어 있어야 하며 SDK 경로가 구성되어 있어야 합니다.
- **셋업 스크립트**: 먼저 `setup.sh` (Linux/macOS) 또는 `setup.ps1` (Windows) 스크립트를 실행해야 합니다 — 이 스크립트가 플랫폼별 `tizen-dlog-analyzer` 바이너리를 플러그인 캐시에 복사합니다.
- **예시 목표**: Tizen 앱의 크래시를 모니터링하고, 근본 원인을 찾아 수정한 후 수정 사항을 검증합니다.

> 💡 각 단계의 "이렇게 말하세요" 예시를 그대로 복사해서 사용하면 됩니다.

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 에이전트 스킬 / tizen-cli 명령 |
|------|------|---------------------------------|
| 1 | 에뮬레이터 실행 | `tizen-launch-emulator` / `tizen-cli tizen-sdk launch-emulator` |
| 2 | 백그라운드 dlog 모니터링 시작 | `tizen-dlog-analyzer` / `tizen-cli tizen-sdk dlog-analyzer --action start` |
| 3 | 앱 빌드 (Debug) | `tizen-build-project` / `tizen-cli tizen-sdk build-project` |
| 4 | 앱 설치 및 실행 | `tizen-install-app` / `tizen-cli tizen-sdk install-app --run` |
| 5 | 사용자에게 질문: 정상인가 이슈가 있는가? | (에이전트 상호작용) |
| 6a | 정상인 경우 → 모니터링 중지 | `tizen-cli tizen-sdk dlog-analyzer --action stop` |
| 6b | 이슈가 있는 경우 → 분석된 로그 확인 | `tizen-cli tizen-sdk dlog-analyzer --action check` |
| 7 | 수정 적용 | (에이전트가 소스 코드 수정) |
| 8 | 앱 재빌드 | `tizen-cli tizen-sdk build-project` |
| 9 | 재설치 및 재실행 | `tizen-cli tizen-sdk install-app --run` |
| 10 | 로그 재확인으로 수정 검증 | `tizen-cli tizen-sdk dlog-analyzer --action check` |
| 11 | 모니터링 중지 | `tizen-cli tizen-sdk dlog-analyzer --action stop` |

---

## 1단계 — 에뮬레이터 실행

dlog 분석기가 모니터링할 수 있는 활성 디바이스를 확보하기 위해 에뮬레이터를 시작합니다.

**이렇게 말하세요:**
```
Tizen 에뮬레이터를 실행해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk launch-emulator
```

에뮬레이터가 부팅되고 sdb로 연결될 때까지 대기합니다 (`sdb devices`에 `emulator-26101` 등이 표시됨).

---

## 2단계 — 백그라운드 DLog 모니터링 시작

**중요:** 앱을 실행하기 **전에** 모니터링을 시작해야 초기화 로그(초기화 실패, 초기 크래시)가 캡처됩니다.

**이렇게 말하세요:**
```
디바이스에서 dlog 모니터링을 시작해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action start --subcommand start-monitoring
```

이 명령은 `tizen-dlog-analyzer start-monitoring` 바이너리를 **분리된 백그라운드 프로세스**로 실행합니다. envelope는 다음을 반환합니다:
- `pid` — 백그라운드 프로세스의 PID
- `output_file` — 모든 출력을 캡처하는 임시 파일 경로
- `device_serial` — 연결된 디바이스

에이전트는 다음과 같이 알려줍니다: *"백그라운드에서 모니터링이 시작되었습니다 (PID 12345). 이제 앱을 실행하겠습니다."*

---

## 3단계 — 앱 빌드 (Debug)

아직 빌드된 앱이 없다면 빌드합니다. 크래시 덤프에 디버그 심볼이 포함되도록 **Debug** 설정을 사용하세요.

**이렇게 말하세요:**
```
내 Tizen 앱을 Debug 모드로 빌드해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk build-project --project-dir /path/to/MyApp --config Debug
```

이 명령은 프로젝트의 `Debug/` 디렉토리에 `.tpk` (Native) 또는 `.wgt` (Web) 패키지를 생성합니다.

---

## 4단계 — 앱 설치 및 실행

빌드된 패키지를 에뮬레이터에 설치하고 즉시 실행합니다.

**이렇게 말하세요:**
```
에뮬레이터에 내 앱을 설치하고 실행해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk install-app --package /path/to/MyApp/Debug/MyApp-1.0.0.tpk --run
```

앱이 디바이스에서 실행됩니다. 모니터링이 이미 백그라운드에서 실행 중이므로 앱 시작 시점부터 모든 dlog 출력이 캡처됩니다 — 초기화 실패 및 초기 크래시도 포함됩니다.

---

## 5단계 — 사용자에게 질문: 정상인가 이슈가 있는가?

앱이 실행된 후, 에이전트가 선택하라고 요청합니다:

> "앱이 디바이스에서 실행 중입니다. 선택해 주세요:
> 1. 모든 것이 정상입니다
> 2. 이슈가 있습니다"

### 옵션 A: 모든 것이 정상인 경우

앱이 예상대로 작동 중이라면, 에이전트는 모니터링을 중지하고 세션을 종료합니다.

**이렇게 말하세요:**
```
모든 것이 정상입니다
```

**tizen-cli 명령 (에이전트가 실행):**
```bash
tizen-cli tizen-sdk dlog-analyzer --action stop
```

**→ 완료되었습니다!** 정리 내용은 [11단계](#11단계--모니터링-중지정리)를 참조하세요.

### 옵션 B: 이슈가 있는 경우

문제(크래시, 멈춤, 에러)를 발견했다면 에이전트에게 알려줍니다.

**이렇게 말하세요:**
```
이슈가 있습니다 — 앱이 크래시됐어요
```

**→ 6단계로 진행합니다.**

---

## 6단계 — 분석된 출력 확인

에이전트가 백그라운드 모니터링 프로세스에서 최신 분석된 크래시/예외 데이터를 가져옵니다.

**이렇게 말하세요:**
```
dlog 분석기 출력을 확인해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action check
```

`result.output` 필드에 분석된 크래시/예외 데이터가 포함됩니다. 에이전트는 이를 읽고 근본 원인을 식별하며, 다음을 찾습니다:
- 크래시 덤프 시그니처 (시그널 번호, 폴트 주소)
- 예외 스택 트레이스
- EGL/그래픽 초기화 실패
- 권한 거부 에러
- 메모리 할당 실패

---

## 7단계 — 수정 적용

6단계의 크래시/예외 분석을 바탕으로 에이전트가 소스 코드에 수정을 적용합니다.

**이렇게 말하세요:**
```
소스 코드에 수정을 적용해줘
```

이는 에이전트 주도 단계입니다 — 에이전트가 소스 파일을 직접 수정합니다 (널 포인터 검사, 리소스 정리, 매니페스트/설정 변경 등). 여기서는 tizen-cli 명령이 필요하지 않습니다.

---

## 8단계 — 앱 재빌드

수정이 적용된 후, 업데이트된 패키지를 생성하기 위해 앱을 재빌드합니다.

**이렇게 말하세요:**
```
Debug 모드로 앱을 다시 빌드해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk build-project --project-dir /path/to/MyApp --config Debug
```

---

## 9단계 — 앱 재설치 및 재실행

재빌드된 패키지를 재설치하고 다시 실행합니다. 모니터링이 백그라운드에서 계속 실행 중이므로 새 실행 로그가 자동으로 캡처됩니다 — 모니터링을 재시작할 필요가 없습니다.

**이렇게 말하세요:**
```
앱을 다시 설치하고 실행해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk install-app --package /path/to/MyApp/Debug/MyApp-1.0.0.tpk --run
```

---

## 10단계 — 로그 재확인으로 수정 검증

앱이 재실행된 후, 분석된 출력을 다시 확인하여 크래시/예외가 더 이상 나타나지 않는지 확인합니다.

**이렇게 말하세요:**
```
수정을 검증하기 위해 dlog 분석기 출력을 다시 확인해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action check
```

- 이슈가 **해결된 경우** → 11단계로 진행합니다 (모니터링 중지).
- 이슈가 **지속되는 경우** → 에이전트는 업데이트된 수정으로 7단계로 돌아갑니다. 모니터링 프로세스는 재빌드/재설치 주기 동안 로그 캡처를 계속합니다.

---

## 11단계 — 모니터링 중지 (정리)

작업이 끝나면 항상 백그라운드 모니터링 프로세스를 중지하여 정리해야 합니다.

**이렇게 말하세요:**
```
dlog 모니터링을 중지해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action stop
```

이 명령은 백그라운드 프로세스를 종료하고 PID 파일을 제거합니다. 임시 출력 파일은 참조용으로 `$TMPDIR/tizen-dlog-analyzer/` (또는 Linux의 경우 `/tmp/tizen-dlog-analyzer/`)에 남아 있습니다.

---

## 앱별 로그 분석 (선택 사항)

백그라운드 모니터링과 별도로 (또는 대신), 특정 앱의 로그를 수집하고 런타임 에러(E/F 우선순위)를 분석할 수 있습니다. 전체 디바이스를 모니터링하지 않고 하나의 앱 로그에 집중할 때 유용합니다.

### A단계 — 앱 실행

**이렇게 말하세요:**
```
내 앱 org.example.myapp을 디바이스에서 실행해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action app-launch --app-id org.example.myapp
```

`sdb shell app_launcher -s <app_id>`로 앱을 실행하고 앱의 PID를 반환합니다.

### B단계 — 백그라운드 로그 수집 시작

**이렇게 말하세요:**
```
내 앱 org.example.myapp의 로그 수집을 시작해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action dlog-collect --app-id org.example.myapp
```

앱의 PID로 필터링된 dlog를 **백그라운드 프로세스**로 수집을 시작합니다. 앱이 **실행 중이어야 합니다** — `pgrep`으로 PID를 조회합니다. 로그는 `<sdk-data>/dloganalyzer/app/<app-id>/<app-id>.hot.log`에 지속적으로 기록됩니다 (SDK 데이터 경로는 `~/.tizen.sdk.path.config` → `sdk.info`의 `TIZEN_SDK_DATA_PATH` 또는 `<sdk>-data`에서 결정되며, 응답의 `result.log_file`에 표시됨).

### C단계 — 사용자에게 계속 수집할지 분석할지 선택하도록 요청

에이전트가 사용자에게 다음과 같이 안내합니다: *"백그라운드에서 로그 수집이 시작되었습니다. 앱을 사용하면서 이슈를 재현해 보세요."* — 그리고 그 자리에서 **턴을 끝내며** 두 가지 옵션을 제시합니다:
1. **재현 완료 — 에러/크래시가 발생했어요** (계속 테스트하려면 **계속 수집**)
2. **아무 일도 없었어요** / **수집 중지 및 지금 분석** — 수집을 중지(`stop-collect`)하고 즉시 `error-analyze`를 실행하여 지금까지 수집된 로그 분석

**폴링·루핑·`sleep` 금지.** 사용자의 선택을 기다립니다 — 재현 시간은 사용자의 것입니다. `sleep 30 && … stop-collect`가 바로 이슈 #212에서 보고된 동작이며, 가드 훅이 이를 차단합니다.

### D단계 — 사용자의 선택에 따라 진행

**사용자가 "수집 중지 및 지금 분석"을 선택한 경우:**

**이렇게 말하세요:**
```
수집을 중지하고 내 앱 로그에서 에러를 분석해줘
```

**tizen-cli 명령:**
```bash
# 백그라운드 수집 중지
tizen-cli tizen-sdk dlog-analyzer --action stop-collect

# 수집된 로그에서 E/F 우선순위 에러 분석
tizen-cli tizen-sdk dlog-analyzer --action error-analyze --app-id org.example.myapp
# 또는: --format summary (요약 라인만)
# 또는: --format details (상세 항목만)
# 또는: --format 생략 (요약 + 상세 모두)
```

수집된 로그에서 Error(E) 및 Fatal(F) 우선순위 항목을 분석합니다. tag+message 기준으로 중복 제거하여 발생 횟수를 계산합니다. 출력은 일반 텍스트입니다(토큰 효율적, Rich 테이블 없음): 요약은 항목당 한 줄씩(`N. Module=TAG | Repeated=X | Message: ...`) 표시되며, 상세 섹션은 `[Error N]` 블록과 `Full log:` 라인을 보여줍니다.

에이전트는 `error-analyze` 출력을 읽고 근본 원인을 파악하여 수정을 적용합니다. E/F 요약(그리고 `check`, 수집했다면 `kernel analyze`)으로 증상이 설명되지 않을 때만 범위를 넓힙니다 — `--format details`, 그 다음 **필터를 건** 전체 로그:

```bash
tizen-cli tizen-sdk dlog-analyzer --action app-log --app-id org.example.myapp --priority W --since 10m --max-lines 300
```

`app-log`는 절대 첫 번째 분석 호출이 아닙니다 (이슈 #215).

분석 결과나 사용자가 특정 문자열(에러 메시지, 태그, URL, PID)을 지목했다면 전체 로그를 넘기기 전에 `search`로 수집된 모든 카테고리를 한 번에 찾습니다 — 어느 앱이 남겼는지 몰라도 되고, 스택 트레이스를 포함한 엔트리 전체가 돌아옵니다 (바이너리 v0.2.6+, 이슈 #254). `.hot.log` 파일을 `grep`하지 않습니다:

```bash
tizen-cli tizen-sdk dlog-analyzer --action search --pattern "connection refused" --context 1 --priority W
tizen-cli tizen-sdk dlog-analyzer --action search --pattern "Exception|SIGSEGV" --regex --category org.example.myapp --count
```

**사용자가 "계속 수집"을 선택한 경우:**

백그라운드 수집이 계속 진행됩니다. 사용자가 추가 테스트를 완료한 후 다시 "수집 중지 및 분석"을 요청할 때까지 대기합니다.

**사용자가 문제를 발견하지 못한 경우:**

```bash
# 백그라운드 수집 중지 및 정리
tizen-cli tizen-sdk dlog-analyzer --action stop-collect
```

### E단계 — 앱 종료

**이렇게 말하세요:**
```
내 앱 org.example.myapp을 종료해줘
```

**tizen-cli 명령:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action app-terminate --app-id org.example.myapp
```

---

## 빠른 참조: 모든 tizen-cli 명령

| 단계 | 명령 |
|------|------|
| 에뮬레이터 실행 | `tizen-cli tizen-sdk launch-emulator` |
| 모니터링 시작 | `tizen-cli tizen-sdk dlog-analyzer --action start --subcommand start-monitoring` |
| 앱 빌드 | `tizen-cli tizen-sdk build-project --project-dir <경로> --config Debug` |
| 앱 설치 및 실행 | `tizen-cli tizen-sdk install-app --package <경로> --run` |
| 로그 확인 | `tizen-cli tizen-sdk dlog-analyzer --action check` |
| 상태 확인 | `tizen-cli tizen-sdk dlog-analyzer --action status` |
| 모니터링 중지 | `tizen-cli tizen-sdk dlog-analyzer --action stop` |
| 앱 실행 | `tizen-cli tizen-sdk dlog-analyzer --action app-launch --app-id <id>` |
| 앱 로그 수집 | `tizen-cli tizen-sdk dlog-analyzer --action dlog-collect --app-id <id>` |
| 앱 로그 수집 중지 | `tizen-cli tizen-sdk dlog-analyzer --action stop-collect` |
| 앱 에러 분석 | `tizen-cli tizen-sdk dlog-analyzer --action error-analyze --app-id <id> [--format summary\|details]` |
| 전체 앱 로그 출력 | `tizen-cli tizen-sdk dlog-analyzer --action app-log --app-id <id> [--since <s>] [--until <s>] [--priority <p>] [--tag <t>] [--keyword <k>]` |
| 수집 로그 전체에서 문자열/정규식 검색 | `tizen-cli tizen-sdk dlog-analyzer --action search --pattern <text> [--regex] [--category <id>] [--context <n>] [--priority <p>] [--since <s>] [--count] [--format json]` |
| 디바이스 프로필 | `tizen-cli tizen-sdk dlog-analyzer --action device-profile [--refresh]` |
| 조사 | `tizen-cli tizen-sdk dlog-analyzer --action investigate [--app-id <id>] [--symptoms <text>]` |
| 프로브 목록 | `tizen-cli tizen-sdk dlog-analyzer --action probe --subcommand list` |
| 프로브 실행 | `tizen-cli tizen-sdk dlog-analyzer --action probe --subcommand run --app-id <probe-id>` |
| 스냅샷 생성 | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand create` |
| 스냅샷 목록 | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand list` |
| 스냅샷 비교 | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand compare --app-id <id1> --output-dir <id2>` |
| 스냅샷 삭제 | `tizen-cli tizen-sdk dlog-analyzer --action snapshot --subcommand delete --app-id <id>` |
| 타임라인 조회 | `tizen-cli tizen-sdk dlog-analyzer --action timeline --subcommand show` |
| 타임라인 보고서 | `tizen-cli tizen-sdk dlog-analyzer --action timeline --subcommand report` |
| 커널 로그 수집 (백그라운드) | `tizen-cli tizen-sdk dlog-analyzer --action kernel --subcommand collect` |
| 커널 로그 수집 중지 | `tizen-cli tizen-sdk dlog-analyzer --action kernel --subcommand stop` |
| 커널 로그 분석 | `tizen-cli tizen-sdk dlog-analyzer --action kernel --subcommand analyze` |
| 앱 종료 | `tizen-cli tizen-sdk dlog-analyzer --action app-terminate --app-id <id>` |


---

## 팁

- **앱 실행 전에 모니터링을 시작하세요** — 시작 로그가 캡처됩니다.
- **한 번에 하나의 인스턴스만 실행 가능** — 이미 실행 중인 경우 `start`는 `already_running` 에러를 반환합니다. 먼저 중지하세요.
- **백그라운드 프로세스는 분리되어 있습니다** — 에이전트 세션이 종료되어도 유지됩니다. 작업이 끝나면 반드시 `stop`하세요.
- **바이너리는 플랫폼별입니다** — 셋업 스크립트는 해당 플랫폼의 `linux/`, `macos/`, 또는 `windows/` 바이너리만 복사합니다.
- **필요한 만큼 반복하세요** — 수정 적용 → 재빌드 → 재설치 → 재확인 주기는 크래시가 해결될 때까지 반복할 수 있습니다.
