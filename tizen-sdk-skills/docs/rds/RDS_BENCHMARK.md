# RDS 벤치마크 가이드

[English](RDS_BENCHMARK.en.md) | 한국어

## 개요

RDS(Rapid Development Support) 벤치마크 기능은 RDS 비활성화 시나리오와 활성화 시나리오 간의 성능 차이를 측정합니다. 타이밍 계측을 활성화하려면 `TIZEN_BENCHMARK=1` 을 사용하세요.

**비활성화 시 오버헤드 제로** — 벤치마크 모드는 `TIZEN_BENCHMARK=1` 이 설정된 경우에만 활성화됩니다. 설정되지 않거나 `0` 인 경우 `performance.now()` 호출이나 할당이 전혀 없습니다.

## 측정 항목

`TIZEN_BENCHMARK=1` 이 활성화되면 다음 RDS 단계가 타이밍 측정됩니다:

| 단계 | 설명 |
|-------|-------------|
| `getRdsInfoPath` | 앱 설치를 위한 디바이스 경로 확인 |
| `readDeviceMarker` | 디바이스에서 배포 마커 읽기 |
| `reconcile` | 현재 출력을 베이스라인 매니페스트와 비교 |
| `getDelta` | 변경된 파일 계산 |
| `resolveDevicePaths` | 호스트 경로를 디바이스 경로에 매핑 |
| `pushDelta` | 변경된 파일을 디바이스로 푸시 (RDS 만) |
| `launch` | `runNoChain()` 을 통해 앱 실행 |
| `syncState` | 호스트 측 상태 및 디바이스 마커/스냅샷 업데이트 |

총 시간 및 단계별 세부 정보는 JSON 엔벨로프의 `result.rds_timings` 에 포함되며 stderr 에 출력됩니다.

## 사용법

### 수동 벤치마크 스크립트

수동 벤치마크 스크립트 (`common/lib/tests/manual/benchmark-rds.js`) 는 RDS 비활성화와 활성화를 비교하는 작업을 자동화합니다:

```bash
node common/lib/tests/manual/benchmark-rds.js \
  --project /path/to/MyApp \
  --device-serial emulator-26101 \
  --iterations 5
```

**옵션:**
- `--project <dir>` — Tizen 프로젝트 디렉토리 경로 (필수)
- `--device-serial <serial>` — 대상 디바이스/에뮬레이터 시리얼 (선택, 생략하면 설치기가 자동 선택)
- `--iterations <N>` — 단계당 반복 횟수 (기본값: 5)
- `--build [true|false]` — 각 설치 전 재빌드 여부 (기본값: true). 값 없이 `--build` 만 쓰면 true 입니다.
- `--no-build` — 매 반복 같은 패키지를 설치합니다. 재빌드하지 않은 소스 변경은 패키지에 반영될 수 없으므로 단계 C 는 건너뜁니다.
- `--package <path>` — `--no-build` 와 함께 설치할 패키지. 생략하면 스크립트가 처음에 한 번 빌드해 빌드 엔벨로프의 `artifacts[0].path` 를 사용합니다. 패키지 이름을 디렉토리 이름으로 추측하지 않습니다.

**수행 작업** (모든 설치에 `TIZEN_BENCHMARK=1` 이 설정되어 전 단계에서 타이밍을 수집하며, 모드는 `TIZEN_RDS_ENABLED` 로 선택합니다):
1. **단계 A (RDS 비활성화):** `TIZEN_RDS_ENABLED=0` 으로 N 회 설치 — 모든 설치가 전체 `tz install`
2. **단계 B (RDS 활성화):** RDS 상태를 재설정한 뒤 (`install --reset-rds`, 재설정에 실패하면 실행을 중단) `TIZEN_RDS_ENABLED=1` 로 N 회 설치:
   - 1 번째 반복: 전체 설치 (베이스라인 생성)
   - 2–N 번째 반복: 빠른 배포 (패키지가 바뀌지 않았으므로)
3. **단계 C (RDS 활성화 + 소스 수정):** RDS 상태를 다시 재설정한 뒤:
   - 1 번째 반복: 전체 설치 (베이스라인)
   - 2–N 번째 반복: 무작위로 고른 최대 3 개 소스 파일 (`.c` `.cpp` `.h` `.hpp` `.cs` `.js` `.ts` `.css` `.html` `.xaml`, 빌드 출력과 `bin/`, `obj/`, `node_modules/`, `.git/`, `.tizen-rds/` 는 제외) 맨 위에 마커 주석을 추가 → 재빌드 → 설치 — RDS 델타 경로를 측정합니다
   - 수정된 파일은 단계가 끝나면 (Ctrl+C 로 중단해도) 모두 원래 내용으로 복원됩니다. 프로세스가 강제 종료된 경우에는 VCS 로 마커 주석을 되돌리세요.

**출력:**
- stderr 에 실시간 진행 상황 표시
- 각 단계에 대한 요약 통계 (최소, 최대, 평균, 중앙값)
- 속도 향상 계산
- 반복별 상세 테이블
- JSON 결과를 `benchmark-results.json` 에 저장

### 직접 CLI 사용

벤치마크 모드를 활성화하여 개별 설치를 실행할 수도 있습니다:

```bash
# Bash / Git Bash:
TIZEN_BENCHMARK=1 node "$CLI" install --package "/path/to/MyApp.tpk" --run

# PowerShell:
$env:TIZEN_BENCHMARK="1"; node "$CLI" install --package "C:\path\to\MyApp.tpk" --run

# cmd.exe (대입을 따옴표로 감싸세요. 따옴표가 없으면 cmd 가 뒤 공백이 붙은 "1 " 을 저장해 벤치마크 모드가 켜지지 않습니다):
set "TIZEN_BENCHMARK=1" && node "path\to\project-manager-cli.js" install --package "C:\path\to\MyApp.tpk" --run
```

성공 엔벨로프에는 다음이 포함됩니다:
```json
{
  "status": "success",
  "result": {
    "deploy_type": "rds",
    "rds_timings": {
      "total": 234.56,
      "phases": {
        "reconcile": 145.23,
        "getDelta": 12.45,
        "resolveDevicePaths": 8.12,
        "pushDelta": 45.67,
        "launch": 15.34,
        "syncState": 7.75
      }
    }
  }
}
```

### CI 안전 테스트

자동화 테스트 (`common/lib/tests/rds-benchmark.test.js`) 는 실제 디바이스 없이도 타이밍 계측을 검증합니다:

```bash
cd common/lib/tests
node rds-benchmark.test.js
```

이 테스트는 다음을 수행합니다:
- `isBenchmarkMode()` 가 환경 변수 (미설정 / `1` / `0`) 를 존중하는지 확인
- `RdsDeployTimings` 클래스 테스트: 단계 소요 시간, 총 시간, 반올림, `startPhase()` 없이 호출된 `endPhase()`
- 비어 있는 `startPhase()`/`endPhase()` 한 쌍의 비용이 1ms 미만인지 단정 (20 회 실행의 중앙값)

디바이스, `sdb`, fixture 가 전혀 필요하지 않으므로 `run-all.js` 가 실행되는 모든 플랫폼 (Windows 포함) 에서 실행됩니다.

## 결과 해석

### 예상 타이밍

| 시나리오 | 예상 시간 | 참고 |
|----------|---------------|-------|
| 전체 설치 (RDS 비활성화) | 5–30 초 | 앱 크기, 디바이스 속도에 따라 다름 |
| 첫 번째 RDS 설치 | 5–30 초 | 전체 설치와 동일 + 베이스라인 생성 |
| RDS 델타 배포 | 1–5 초 | 주로 변경된 파일 푸시 시간 |
| RDS 빠른 배포 | <2 초 | 파일 변경 없음, 실행만 |

### 주요 지표

1. **속도 향상 비율:** 각 단계의 전체 N 회 반복에 대한 `mean(RDS 비활성화) / mean(RDS 활성화)` (RDS 첫 번째 반복은 전체 설치이므로 이 비율은 정상 상태의 이득보다 낮게 나옵니다)
   - 일반적인 경우: 작은 변경 사항에 대해 5–10 배
   - 변경 사항이 최소한인 대형 앱의 경우 더 높음

2. **조정 (Reconcile) 시간:** 파일 스캔 및 비교에 소요되는 시간
   - 파일 수에 비례하여 선형적으로 증가
   - 100 개 파일의 경우 일반적으로 50–200ms
   - 대규모 게시 디렉토리가 있는 .NET 앱에서 주요 비용

3. **푸시 시간:** 변경된 파일 전송에 소요되는 시간
   - 델타 크기와 디바이스 연결 속도에 따라 다름
   - USB 가 네트워크 연결 디바이스보다 빠름

4. **실행 시간:** 앱 재실행에 소요되는 시간
   - 일반적으로 10–50ms
   - 복잡한 앱의 경우 더 길어질 수 있음

### 문제 해결

**엔벨로프에 `rds_timings` 이 없음:**
- `TIZEN_BENCHMARK=1` 이 설정되었는지 확인
- RDS 자격 요건 확인 (디버그 빌드, tpk/wgt, GBS/플랫폼 아님)
- 전체 설치 (`deploy_type: "full"`) 도 `rds_timings` 를 반환하지만, 설치 자체가 아니라 설치 후의 `reconcile` 과 `syncState` 단계 (베이스라인 생성) 만 포함합니다 — 이 `total` 을 RDS 나 빠른 배포의 total 과 비교하지 마세요

**RDS 가 사용되지 않음:**
- 엔벨로프의 `deploy_type` 확인 — `"rds"` 또는 `"fast-deploy"` 여야 함
- `"full"` 인 경우 경고에서 RDS 자격 미달 사유 확인
- 일반적인 원인: 릴리스 빌드, RPM/RPK, 플랫폼 프로젝트, 이전 베이스라인 없음

**높은 조정 시간:**
- 많은 파일 수 (.NET 게시 디렉토리) 에 대해 예상됨
- 출력 파일 수를 줄이거나 무시 패턴 사용 고려

## 구현 세부 정보

### 환경 변수

- `TIZEN_BENCHMARK=1` — 벤치마크 모드 활성화
- `TIZEN_BENCHMARK=0` 또는 설정 안 함 — 비활성화 (오버헤드 제로)

### 코드 위치

- `common/lib/core/rds/deploy-service.js` — `isBenchmarkMode()`, `RdsDeployTimings`, 계측된 `tryRdsDeploy()` 및 `updateRdsState()`
- `common/lib/core/project.js` — 엔벨로프에 `rds_timings` 전달
- `common/lib/tests/manual/benchmark-rds.js` — 수동 벤치마크 스크립트
- `common/lib/tests/rds-benchmark.test.js` — CI 안전 테스트

### 오버헤드

`TIZEN_BENCHMARK` 가 설정되지 않거나 `0` 인 경우:
- `performance.now()` 호출 없음
- `RdsDeployTimings` 할당 없음
- 배포당 단일 `process.env` 확인 (무시할 수준)

활성화된 경우:
- RDS 배포당 약 8 회 `performance.now()` 호출
- 작은 객체 할당 하나 (`RdsDeployTimings`)
- 엔벨로프용 JSON 직렬화 (최소)

## 관련 문서

- [RDS 빠른 배포 계획](RDS_FAST_DEPLOY_PLAN.md) — 원래 RDS 구현 계획
- [tizen-install-app 스킬](../../common/skills/tizen-install-app/SKILL.md) — 설치 명령 사용 가이드
