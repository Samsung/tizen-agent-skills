# DALi C++17 빌드 실패 사전 차단

[English](dali-cxx17-preflight.en.md) | 한국어

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-08-03  
**라이선스:** Apache License 2.0 ([LICENSE](../../LICENSE))

---

## 개요

Tizen 9.0 dali2 헤더가 `std::string_view` / `std::any`를 사용하면서, **C++17을 지정하지 않은 DALi 프로젝트는 반드시 빌드에 실패합니다.**

문제는 실패한다는 사실이 아니라 **실패하는 방식**입니다. 에러가 사용자가 작성한 코드가 아니라 `/usr/include/dali*` 안쪽을 가리키기 때문에 "SDK나 GBS 루트가 깨졌다"로 오인하기 쉽고, 실제 원인(CMakeLists.txt 한 줄 누락)에 도달하기까지 GBS 빌드를 몇 분씩 반복하게 됩니다.

이 변경으로 두 지점에서 막습니다.

1. **빌드 전** — GBS를 실행하기 전에 프리플라이트로 잡고 exit 4로 즉시 중단
2. **빌드 후** — 그래도 이 시그니처로 실패하면 진단에 해결 방법을 HINT로 첨부

---

## 문제

### 증상

DALi Platform 프로젝트를 GBS로 빌드하면 다음과 같이 실패합니다.

```
[   42s] In file included from /usr/include/dali-toolkit/public-api/controls/control.h:22,
[   42s] /usr/include/dali/public-api/object/property-value.h:28:13: error: 'string_view' in
         namespace 'std' does not name a type
[   43s] make[2]: *** [CMakeFiles/dali-demo.dir/src/main.cpp.o] Error 1
[   44s] error: Bad exit status from /var/tmp/rpm-tmp.xxxx (%build)
```

컴파일러가 지목한 파일은 프로젝트 소스가 아니라 **플랫폼이 제공한 헤더**입니다. 그래서 첫 반응이 SDK 버전, `.gbs.conf` 프로파일, BuildRequires 쪽으로 향합니다. 실제 원인은 그 어느 쪽도 아닙니다.

### 근본 원인

Tizen 9.0 툴체인의 기본 표준은 `gnu++14`입니다. dali2 헤더는 C++17 타입을 쓰므로, 프로젝트가 표준을 명시하지 않으면 헤더 파싱 단계에서 무너집니다.

### optflags 우회가 통하지 않는 이유

rpm 레벨에서 표준을 주입하려는 시도는 실패합니다.

```bash
gbs build --define "optflags -std=c++17"   # 효과 없음
```

두 가지 이유가 겹칩니다.

1. spec의 `%build`가 `CXXFLAGS` export 없이 `cmake`를 직접 호출합니다. rpm의 `%{optflags}` 값이 컴파일러까지 도달할 경로가 없습니다.
2. 설령 `CXXFLAGS`로 전달되더라도, CMake는 `CMAKE_CXX_STANDARD`로부터 자신의 `-std` 플래그를 구성해 뒤에 붙입니다. 뒤에 오는 플래그가 이깁니다.

즉 이것은 "느린 우회로"가 아니라 **막다른 길**입니다. 해결은 프로젝트의 CMakeLists.txt에서만 가능합니다.

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

---

## 변경 사항

### 1. GBS 실행 전 프리플라이트

**파일:** `common/scripts/tizen-build-project/tizen-build-project.sh`

`check_dali_cxx_standard()`를 추가하고 `build_platform_project()`의 **맨 앞**(GBS 실행 파일 해석보다도 먼저)에서 호출합니다. 실패는 결정적이므로 몇 분을 소모한 뒤 같은 결론에 도달할 이유가 없습니다.

판정 절차:

| 단계 | 내용 |
|------|------|
| 1 | `CMakeLists.txt`가 없으면 통과 (검사 대상 아님) |
| 2 | 검사 파일 수집 — `CMakeLists.txt` + 프로젝트 하위 3단계의 `*.cmake`, `*.spec` |
| 3 | `dali2?-(core\|adaptor\|toolkit)` 미검출 시 통과 (DALi 프로젝트가 아님) |
| 4 | C++17 이상 마커 검출 시 통과 |
| 5 | 미검출 → exit 4 + 해결 방법 출력 |

4단계에서 인정하는 표기는 다음과 같습니다. 작성자가 어떤 방식으로 썼든 오탐하지 않습니다.

```
CMAKE_CXX_STANDARD[^0-9]*(17|20|23|26)
cxx_std_(17|20|23|26)
-std=(gnu|c)\+\+(17|1z|20|2a|23|2b|26)
```

`*.cmake`를 포함하는 이유는 표준 설정이 `include(cmake/flags.cmake)`로 분리된 프로젝트를 오탐하지 않기 위해서이고, `*.spec`을 포함하는 이유는 `%build`에서 `-DCMAKE_CXX_STANDARD=17`을 넘기는 프로젝트가 있기 때문입니다.

에러 출력에는 검사한 파일 목록, 추가할 CMake 구문, 그리고 **optflags를 시도하지 말라는 경고**가 함께 나갑니다. 마지막 항목이 없으면 에이전트가 같은 막다른 길에 다시 들어갑니다.

### 2. 실패 로그의 HINT

**파일:** `common/lib/core/output-summary.js`

프리플라이트를 통과했는데도 이 시그니처로 실패하는 경로가 남아 있습니다. 예를 들어 표준이 지정돼 있지만 하위 타깃에서 덮어써진 경우, 또는 Platform이 아닌 Native 빌드로 들어온 경우입니다.

`buildFailureHints()`를 추가하고 `extractBuildDiagnostics()`가 결과 맨 앞에 붙이도록 했습니다.

감지 시그니처:

| 패턴 | 예시 |
|------|------|
| `'<type>' in namespace 'std'` / `is not a member of 'std'` | `'string_view' in namespace 'std' does not name a type` |
| `std::string_view` / `std::any` + 미선언 | `'std::any' has not been declared` |
| libstdc++ 표준 가드 | `requires compiler and library support for the ISO C++ 2017 standard` |
| gcc 자체 안내 | `note: '-std=c++17' or '-std=gnu++17'` |

출력되는 HINT 3줄:

```
HINT: this compile is not running as C++17 — Tizen 9.0 dali2 headers use
      std::string_view / std::any, so C++17 is mandatory.
HINT: add `set(CMAKE_CXX_STANDARD 17)` and `set(CMAKE_CXX_STANDARD_REQUIRED ON)`
      to CMakeLists.txt, before add_executable().
HINT: `gbs build --define "optflags ..."` does NOT work around this — the spec runs
      plain `cmake`, so rpm optflags never reach the compile.
```

HINT는 `max` 상한과 `maxLineLength` 절단에서 **제외**됩니다. 정작 실행 가능한 정보가 잘려 나가면 의미가 없기 때문입니다. 상한은 진단 줄에만 적용됩니다.

### 3. 스킬 문서

**파일:** `common/skills/tizen-build-project/SKILL.md`, `tizen-cli/skills/tizen-build-project/SKILL.md`

- `DALi / Platform projects require C++17` 섹션 추가 — 수정 방법과 optflags 금지 명시
- Handoff에 `exit 4` 항목 추가 (`exit 3` → `tizen-dotnet-setup`과 같은 형태)

---

## 검증

### 프리플라이트

7개 픽스처로 확인했습니다.

| 픽스처 | 구성 | 기대 | 결과 |
|--------|------|------|------|
| `good` | 표준 템플릿 (`CMAKE_CXX_STANDARD 17`) | 통과 | 통과 |
| `bad` | C++17 줄 제거 | exit 4 | exit 4 |
| `bad2` | `CMAKE_CXX_STANDARD 11` 명시 | exit 4 | exit 4 |
| `okflags` | `add_compile_options(-std=gnu++17)` | 통과 | 통과 |
| `okmodule` | `cmake/flags.cmake`에서 설정 | 통과 | 통과 |
| `okspec` | spec `%build`에서 `-DCMAKE_CXX_STANDARD=17` | 통과 | 통과 |
| `nondali` | DALi 의존성 없음, C++17 없음 | 통과 (검사 대상 아님) | 통과 |

### 단위 테스트

**파일:** `common/lib/tests/output-summary.test.js`

```bash
cd common/lib/tests
node output-summary.test.js
```

추가 검증 9개:

- HINT 3줄이 진단보다 앞에 나오는지
- 컴파일러 진단이 HINT 뒤에 그대로 남는지
- `std::any`, libstdc++ ISO C++ 2017 가드 시그니처도 발동하는지
- **무관한 실패에는 발동하지 않는지** (`fatal error: dali/dali.h: No such file` — DALi인데도 원인이 다름)
- HINT가 `max` 상한에 먹히지 않는지

기존 6개 테스트 파일 모두 통과를 확인했습니다.

---

## 배포

`tizen-cli`는 esbuild로 `common/lib`를 번들에 인라인하므로 재빌드하면 반영됩니다. 프리플라이트는 셸 스크립트이므로 스크립트 배포 경로를 함께 갱신해야 합니다.

```bash
cd tizen-cli
pnpm build
bash cline/setup/setup.sh
```

---

## 알려진 제약

프리플라이트는 **정적 검사**입니다. `if(SOME_OPTION)` 안에서 조건부로 표준을 설정하는 프로젝트는 조건이 거짓이어도 통과합니다. 이 경우 2번(HINT)이 받아냅니다.

우회 스위치는 두지 않았습니다. C++17 지정은 DALi 프로젝트에서 언제나 무해하고, 검사가 발동하는 조건(DALi 의존성 존재 + C++17 표기 전무)에서 빌드가 성공할 경로가 없기 때문입니다.

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `common/scripts/tizen-build-project/tizen-build-project.sh` | `check_dali_cxx_standard()` 신규, GBS 실행 전 호출 (exit 4) |
| `common/lib/core/output-summary.js` | `buildFailureHints()` 신규, 진단 앞에 HINT 삽입 |
| `common/lib/tests/output-summary.test.js` | 검증 9개 추가 |
| `common/skills/tizen-build-project/SKILL.md` | C++17 섹션, exit 4 handoff |
| `tizen-cli/skills/tizen-build-project/SKILL.md` | C++17 섹션 |
| `docs/platform-gbs-build.md` (+`.en`) | C++17 필수 섹션, 트러블슈팅 2건, 빌드 흐름 갱신 |

---

## 관련 문서

- [Platform 앱 GBS 빌드 가이드](../platform-gbs-build.md)
- [빌드 실패 진단 정보 개선](build-failure-diagnostics.md)
