# figma2dali — 문서 인덱스

**경로:** `docs/figma2dali/`

DALi / Tizen 플랫폼 빌드 및 디바이스 도구 작업 중 발견된 버그 수정과 개선 사항을
기록한 기술 문서 모음입니다. 각 문서는 한국어(`.md`)와 영문(`.en.md`) 버전으로 제공됩니다.

---

## 문서 목록

### 1. 빌드 실패 진단 정보 개선

| 항목 | 내용 |
|------|------|
| **파일** | [build-failure-diagnostics.md](build-failure-diagnostics.md) · [build-failure-diagnostics.en.md](build-failure-diagnostics.en.md) |
| **게시일** | 2026-08-02 |
| **버전** | 0.1.0 |

빌드 실패 시 반환되는 Standard JSON Envelope에 실제 컴파일 에러가 포함되지 않던
문제를 수정했습니다. 기존에는 셋업 단계의 무의미한 warning과 로그 파일 경로만
남아, 원인 파악을 위해 호스트 로그 파일을 직접 열어야 했습니다.

**주요 변경:**
- `extractBuildDiagnostics()` 신규 — 진단 가치 순으로 우선순위화 (컴파일러 진단 > 빌드시스템 실패 > 일반 error)
- GBS 타임스탬프 제거, 중복 제거, warning 제외
- Envelope `details` 필드 통과 및 실패 메시지에 진단 인라인 포함
- 스킬 문서에 실패 처리 지침 추가 (재빌드 반복 금지)

---

### 2. DALi C++17 빌드 실패 사전 차단

| 항목 | 내용 |
|------|------|
| **파일** | [dali-cxx17-preflight.md](dali-cxx17-preflight.md) · [dali-cxx17-preflight.en.md](dali-cxx17-preflight.en.md) |
| **게시일** | 2026-08-03 |
| **버전** | 0.1.0 |

Tizen 9.0 dali2 헤더가 `std::string_view` / `std::any`를 사용하면서 C++17을
지정하지 않은 DALi 프로젝트가 빌드에 실패하는 문제를 두 지점에서 차단합니다.

**주요 변경:**
- **빌드 전** — GBS 실행 전 프리플라이트 `check_dali_cxx_standard()`로 C++17 미지정 시 exit 4 즉시 중단
- **빌드 후** — `buildFailureHints()`가 실패 로그에 해결 방법 HINT 3줄 첨부
- optflags 우회(`gbs build --define "optflags ..."`)가 통하지 않는 이유 명시
- 7개 픽스처 + 단위 테스트 9개로 검증

---

### 3. 훅 git-route 거부 문제 수정

| 항목 | 내용 |
|------|------|
| **파일** | [hook-git-route-fix.md](hook-git-route-fix.md) · [hook-git-route-fix.en.md](hook-git-route-fix.en.md) |
| **게시일** | 2026-08-02 |
| **버전** | 0.1.0 |

PreToolUse 훅의 git-route 우회 분기가 명령이 `git`으로 시작할 때만 동작해서,
`cd <project> && git commit ...` 같은 일상적인 형태가 거부되던 문제를 수정했습니다.

**주요 변경:**
- `is_git_command()` 헬퍼 추가 — `cd <path> &&`, `VAR=value` 등 선행 접두사를 벗겨낸 후 git/gh 여부 판정
- 세 훅(`check-tizen-commands.sh`, `check-project-writes.sh`, `show-envelope.sh`)에 동일 수정 적용
- 우회가 과도해지지 않도록 단어 경계 + 토큰 확인으로 제한
- 23개 테스트 케이스 추가 (허용 케이스 + 실제 실수 거부 유지 검증)

---

### 4. 스크린샷 enlightenment_info 폴백 추가 및 응답 이미지 포함

| 항목 | 내용 |
|------|------|
| **파일** | [screenshot-enlightenment-capture.md](screenshot-enlightenment-capture.md) · [screenshot-enlightenment-capture.en.md](screenshot-enlightenment-capture.en.md) |
| **게시일** | 2026-08-02 |
| **버전** | 0.1.0 |
| **검증** | `emulator-26101` 실기 검증 완료 |

에뮬레이터 등 기존 device-side 캡처 도구가 없는 환경에서 `enlightenment_info`를
통한 스크린샷 캡처를 추가하고, 응답 Envelope에 이미지 메타데이터를 포함하도록
개선했습니다.

**주요 변경:**
- `try_enlightenment_info()` 추가 — `-dump_screen`(우선) / `-dump topvwins`(구버전 폴백)
- 실기 검증에서 드러난 오류 3건 수정 (존재하지 않는 옵션, 종료 코드 신뢰 불가, root 권한 필요)
- 폴백 체인 1순위로 배치 (에뮬레이터/실기기 모두)
- 응답에 `image` 블록(path, size, mime_type, width, height) 및 `capture_method` 추가
- 512KB 초과 시 base64 생략 및 사유 명시

---

### 5. sdb-helper 플레이스홀더 치환 버그 수정

| 항목 | 내용 |
|------|------|
| **파일** | [sdb-helper-placeholder-substitution.md](sdb-helper-placeholder-substitution.md) · [sdb-helper-placeholder-substitution.en.md](sdb-helper-placeholder-substitution.en.md) |
| **게시일** | 2026-08-02 |
| **버전** | 0.1.0 |

`sdb-helper`가 자연어 요청에서 값을 뽑아 sdb 명령을 조립하는 과정의 두 가지
결함(명령어 절단, 플레이스홀더 미치환)을 수정했습니다.

**주요 변경:**
- **버그 1** — `extractShellCommand()`의 키워드 제거 정규식에 단어 경계 추가 (`shellcheck` 등이 잘리지 않도록)
- **버그 2** — `buildCommand()`의 7개 intent에 값 추출 함수 연결 (`extractAppId`, `extractKeyName`, `extractPorts`, `extractHostPort`)
- 값 누락 시 실행하지 않고 안내 note 반환
- `disconnect` 예외 처리 (대상 없으면 전체 연결 해제)
- 회귀 테스트 32개 추가 (총 61개)

---

## 6. DALi 템플릿 빌드 엔드투엔드 가이드

| 항목 | 내용 |
|------|------|
| **파일** | [dali-template-build-e2e.md](dali-template-build-e2e.md) · [dali-template-build-e2e.en.md](dali-template-build-e2e.en.md) |
| **게시일** | 2026-08-25 |
| **버전** | 0.1.0 |

`dali_demo` 템플릿을 사용하여 DALi Platform 앱을 **사전 준비 → 프로젝트 생성 → GBS 빌드 →
RPM 설치/실행 → 스크린샷 캡처**까지의 전체 과정을 하나의 가이드로 정리한 문서입니다.
figma2dali 작업에서 얻은 개선 사항(C++17 프리플라이트, 빌드 실패 진단, enlightenment_info
스크린샷 폴백)을 통합한 최신 워크플로우를 반영합니다.

**주요 내용:**
- 6단계 전체 워크플로우 (템플릿 조회 → 생성 → 빌드 → 디바이스 준비 → 설치/실행 → 스크린샷)
- tizen-cli 명령 / 자연어 / CLI 러너 직접 실행 세 가지 호출 방법
- 각 단계별 응답 예시 및 예상 소요 시간
- C++17, 빌드 실패, RPM 실행 실패, 스크린샷 관련 트러블슈팅
- 단계별 검증 체크리스트

---

## 파일 전체 목록

| 파일명 | 설명 |
|--------|------|
| `build-failure-diagnostics.md` | 빌드 실패 진단 정보 개선 (한국어) |
| `build-failure-diagnostics.en.md` | Build failure diagnostics improvement (English) |
| `dali-cxx17-preflight.md` | DALi C++17 빌드 실패 사전 차단 (한국어) |
| `dali-cxx17-preflight.en.md` | DALi C++17 preflight (English) |
| `dali-template-build-e2e.md` | DALi 템플릿 빌드 엔드투엔드 가이드 (한국어) |
| `dali-template-build-e2e.en.md` | DALi template build end-to-end guide (English) |
| `hook-git-route-fix.md` | 훅 git-route 거부 문제 수정 (한국어) |
| `hook-git-route-fix.en.md` | Hook git-route fix (English) |
| `screenshot-enlightenment-capture.md` | 스크린샷 enlightenment_info 폴백 추가 (한국어) |
| `screenshot-enlightenment-capture.en.md` | Screenshot enlightenment_info fallback (English) |
| `sdb-helper-placeholder-substitution.md` | sdb-helper 플레이스홀더 치환 버그 수정 (한국어) |
| `sdb-helper-placeholder-substitution.en.md` | sdb-helper placeholder substitution fix (English) |

---

## 관련 문서

- [Platform 앱 GBS 빌드 가이드](../platform-gbs-build.md)
