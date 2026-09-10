# Platform 앱 GBS 빌드 가이드

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-07-22  
**라이선스:** Apache License 2.0 ([LICENSE](../LICENSE))

---

## 개요

이 문서는 `tizen-sdk-skills` 플러그인을 사용하여 **Platform 프로젝트**를 **GBS (Git Build System)** 로 빌드하는 방법을 설명합니다. Platform 프로젝트는 Native/DotNET/WebApp과 달리 `tz build` 대신 GBS를 사용하여 빌드하며, `.tpk`/`.wgt` 대신 **`.rpm` 패키지**를 생성합니다.

---

## Platform 프로젝트란?

Platform 프로젝트는 Tizen 플랫폼 패키지로 빌드되는 C/C++ 프로젝트입니다. 일반적인 Native 앱과 달리 GBS를 통해 RPM 패키지로 빌드되며, Tizen 플랫폼에 직접 설치됩니다.

### 프로젝트 구조

```
my-platform-app/
├── CMakeLists.txt              # CMake 빌드 설정
├── tizen-manifest.xml          # Tizen 패키지 매니페스트
├── packaging/
│   └── my-app.spec             # RPM spec 파일 (GBS 빌드에 사용)
├── src/
│   └── main.cpp                # 소스 코드
└── include/                    # 헤더 파일 (선택)
```

### 감지 조건

빌드 스크립트는 다음 조건으로 Platform 프로젝트를 자동 감지합니다:

- `tizen-manifest.xml` 파일이 있고
- `CMakeLists.txt` 파일이 있는 경우

---

## 사전 요구사항

### 1. GBS (Git Build System)

GBS는 Tizen 플랫폼 패키지를 빌드하는 데 필요합니다. 빌드 스크립트는 3단계 fallback으로 GBS를 찾습니다:

1. **tizen-cli GBS 플러그인** — tizen-cli에 GBS 플러그인이 설치되어 있으면 사용
2. **시스템 설치 gbs** — `gbs`가 PATH에 있으면 직접 사용
3. **모두 없음** — 설치 가이드와 함께 에러 반환

**설치 방법:**

```bash
# Ubuntu/Debian
sudo apt-get install gbs

```

### 2. Git 저장소

GBS는 빌드를 위해 **Git 저장소**가 필요합니다. 빌드 스크립트가 자동으로 Git 저장소를 초기화합니다:

- `.git` 디렉토리가 이미 있으면: 아무 작업 없이 진행
- `.git` 디렉토리가 없으면: `git init` → `git add -A` → `git commit` 자동 실행

### 3. Tizen 플랫폼 개발 패키지

프로젝트의 `.spec` 파일에 명시된 `BuildRequires` 패키지가 GBS 빌드 환경에 설치되어 있어야 합니다. 예를 들어 DALi 데모의 경우:

```
BuildRequires:  cmake
BuildRequires:  pkgconfig(dali2-core)
BuildRequires:  pkgconfig(dali2-adaptor)
BuildRequires:  pkgconfig(dali2-toolkit)
```

### 4. .gbs.conf

GBS 빌드를 위해 홈 디렉토리에 `.gbs.conf` 파일이 필요합니다. 이 파일은 GBS가 사용할 Tizen 플랫폼 저장소 프로파일을 정의합니다.

---

## 프로젝트 생성

### 방법 1: tizen-cli 명령 (권장)

`tizen-cli tizen-sdk` 명령어를 사용하여 Platform 프로젝트를 생성할 수 있습니다.

**1. 사용 가능한 Platform 템플릿 목록 확인:**

```bash
tizen-cli tizen-sdk list-templates --type platform
```

**2. 프로젝트 생성:**

```bash
tizen-cli tizen-sdk create-project \
  --type platform \
  --template dali_demo \
  --parent-path /home/user/tizen-apps \
  --name MyApp
```

| 옵션                  | 필수    | 설명                                                      |
| --------------------- | ------- | --------------------------------------------------------- |
| `--type <type>`       | **yes** | `platform`                                                |
| `--template <name>`   | **yes** | `list-templates`에서 확인한 템플릿 이름 (예: `dali_demo`) |
| `--parent-path <dir>` | **yes** | 워크스페이스(부모) 디렉토리 — 앱 폴더가 그 안에 생성됨    |
| `--name <appName>`    | **yes** | 앱 이름 = 생성할 폴더 이름                                |

**3. 생성 결과 확인:**

```json
{
  "status": "success",
  "result": {
    "project_name": "MyApp",
    "project_type": "platform",
    "template_name": "dali_demo",
    "project_path": "/home/user/tizen-apps/MyApp",
    "status": "created"
  },
  "command": "tizen-sdk create-project"
}
```

### 방법 2: 자연어 (Cline/Claude Code)

Cline/Claude Code에게 자연어로 요청:

```
플랫폼 dali_demo 템플릿으로 MyApp 만들어줘
```

### 방법 3: CLI 러너 직접 실행

```bash
node <plugin>/lib/cli/project-manager-cli.js create --type platform --template dali_demo --parent-path <parentPath> --name <appName>
```

---

## 빌드 실행

### 방법 1: tizen-cli 명령 (권장)

`tizen-cli tizen-sdk build-project` 명령어를 사용하여 Platform 프로젝트를 GBS로 빌드합니다:

```bash
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/MyApp
```

| 옵션                  | 필수    | 기본값   | 설명                                        |
| --------------------- | ------- | -------- | ------------------------------------------- |
| `--project <path>`    | **yes** | —        | 프로젝트 루트 디렉토리                      |
| `--build-type <type>` | no      | `Debug`  | `Debug` \| `Release` \| `Test`              |
| `--arch <arch>`       | no      | `x86_64` | `armv7l` \| `aarch64` \| `i586` \| `x86_64` |

**아키텍처 지정 빌드:**

```bash
# armv7l 타겟 빌드
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/MyApp --arch armv7l

# Release 빌드
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/MyApp --build-type Release
```

### 방법 2: 자연어 (Cline/Claude Code)

Cline/Claude Code에게 자연어로 요청:

```
프로젝트 빌드해줘
```

### 방법 3: CLI 러너 직접 실행

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" build --project "<project-path>" --build-type Debug
```

### 방법 4: GBS 직접 실행

```bash
cd <project-path>
gbs build -A x86_64 --include-all
```

---

## 빌드 산출물

GBS 빌드가 성공하면 다음 위치에 `.rpm` 패키지가 생성됩니다:

```
~/GBS-ROOT/local/repos/<arch>/RPMS/
├── <app-name>-<version>-<release>.<arch>.rpm          # 메인 패키지
├── <app-name>-debuginfo-<version>-<release>.<arch>.rpm  # 디버그 정보
└── <app-name>-debugsource-<version>-<release>.<arch>.rpm # 디버그 소스

~/GBS-ROOT/local/repos/<arch>/SRPMS/
└── <app-name>-<version>-<release>.src.rpm               # 소스 RPM
```

> **참고:** Platform (GBS) 빌드는 `.tpk`/`.wgt`가 아닌 `.rpm`을 생성합니다. `tizen-install-app` 스킬은 `.tpk`/`.wgt` 및 `.rpm` 패키지를 모두 지원합니다. RPM 패키지 설치 시 `--run` 옵션을 사용하면 설치 후 자동으로 앱을 실행할 수 있습니다. 자세한 내용은 [RPM 패키지 설치 및 실행](#rpm-패키지-설치-및-실행) 섹션을 참조하세요.

### 성공 응답 예시

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm",
        "format": ".rpm",
        "size_bytes": 11579
      },
      {
        "path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-debuginfo-1.0.0-1.x86_64.rpm",
        "format": ".rpm",
        "size_bytes": 94539
      }
    ],
    "build_time_ms": 22806
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 22806
}
```

---

## 빌드 스크립트 내부 동작

`tizen-build-project.sh` 스크립트의 Platform 빌드 흐름:

1. **프로젝트 타입 감지** — `tizen-manifest.xml` + `CMakeLists.txt` 존재 확인 → Platform
2. **DALi C++17 프리플라이트** — `dali2-*` 의존성이 있으면 C++17 설정 확인, 없으면 exit 4로 즉시 중단
3. **GBS 실행 파일 확인** — 3단계 fallback (tizen-cli 플러그인 → 시스템 gbs → 에러)
4. **Git 저장소 확인** — `.git`이 없으면 자동 초기화
5. **GBS 빌드 실행** — `gbs build -A <arch> --include-all`
6. **산출물 검색** — 프로젝트 디렉토리 및 `~/GBS-ROOT`에서 `.tpk`/`.wgt`/`.rpm` 파일 검색
7. **결과 반환** — Standard JSON Envelope로 빌드 결과 전달

---

## DALi 개발 시 주의사항

DALi (3D UI engine) 기반 Platform 앱을 개발할 때 다음 사항에 주의해야 합니다:

### C++17 필수

Tizen 9.0 dali2 헤더는 `std::string_view` / `std::any`를 사용합니다. C++17을 지정하지 않으면 툴체인 기본값(gnu++14)으로 컴파일되어 `/usr/include/dali*` **내부에서** 실패합니다. 에러가 시스템 헤더를 가리키므로 "SDK가 깨졌다"로 오인하기 쉽지만, 실제 원인은 CMakeLists.txt에 한 줄이 없는 것입니다.

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

`add_executable()` **앞에** 넣어야 합니다.

> **gbs optflags 주입으로는 우회할 수 없습니다.**
>
> ```bash
> gbs build --define "optflags -std=c++17"   # 효과 없음
> ```
>
> spec의 `%build`가 `CXXFLAGS` export 없이 `cmake`를 그대로 호출하므로 rpm optflags가 컴파일러까지 도달하지 않고, CMake는 `CMAKE_CXX_STANDARD`로부터 자체 `-std` 플래그를 구성합니다.

빌드 스크립트는 이 조건을 **GBS 실행 전에 프리플라이트로 검사**합니다. `dali2-*` 의존성은 있는데 C++17 설정이 없으면 **exit 4**로 즉시 중단하고 위 수정 방법을 출력합니다. 검사 대상은 `CMakeLists.txt`, 프로젝트 하위 `*.cmake`, `*.spec` 이며 `CMAKE_CXX_STANDARD`, `cxx_std_17`, `-std=c++17`/`-std=gnu++17` 중 어떤 표기든 인정합니다.

### Stage 헤더 포함

`dali.h` 헤더는 **public-api**만 포함합니다. `Stage` 클래스는 `dali/devel-api/common/stage.h`에 정의되어 있으므로, 명시적으로 include해야 합니다:

```cpp
#include <dali/dali.h>
#include <dali/devel-api/common/stage.h>  // ← 필수! dali.h에 포함되지 않음
#include <dali-toolkit/dali-toolkit.h>
```

### 링크 라이브러리

CMakeLists.txt에서 DALi 라이브러리를 링크해야 합니다:

```cmake
TARGET_LINK_LIBRARIES(${PROJECT_NAME}
  dali2-core
  dali2-adaptor
  dali2-toolkit
)
```

### spec 파일 BuildRequires

`.spec` 파일에 DALi 패키지 의존성을 명시해야 합니다:

```
BuildRequires:  pkgconfig(dali2-core)
BuildRequires:  pkgconfig(dali2-adaptor)
BuildRequires:  pkgconfig(dali2-toolkit)
```

---

## RPM 패키지 설치 및 실행

GBS 빌드로 생성된 `.rpm` 패키지는 `tizen-install-app` 스킬을 통해 디바이스/에뮬레이터에 설치할 수 있습니다.

### 설치 및 실행

```bash
tizen-cli tizen-sdk install-app \
  --package /home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm \
  --run
```

| 옵션               | 필수    | 설명                 |
| ------------------ | ------- | -------------------- |
| `--package <path>` | **yes** | RPM 패키지 파일 경로 |
| `--run`            | no      | 설치 후 앱 자동 실행 |

### RPM 앱 실행 환경 변수

RPM 플랫폼 앱은 디바이스에 `su`가 있으면 `sdb shell`을 통해 **`owner` 사용자(uid 5001)로 실행**됩니다 (`su`가 없으면 현재 셸 사용자로 폴백). rpm 설치 자체는 root 권한(`sdb root on`)으로 수행되지만, `/run/user/5001`의 Wayland 소켓과 DBus 세션 버스는 `owner` 소유이므로 root로 실행된 GUI 프로세스는 디스플레이/세션 정책에 의해 거부되어 즉시 종료됩니다. 다음 환경 변수가 자동으로 설정됩니다:

| 환경 변수                  | 값                             | 설명                         |
| -------------------------- | ------------------------------ | ---------------------------- |
| `WAYLAND_DISPLAY`          | `wayland-0`                    | Wayland 디스플레이 소켓 이름 |
| `XDG_RUNTIME_DIR`          | `/run/user/5001`               | XDG 런타임 디렉토리          |
| `ELM_ENGINE`               | `wayland_egl`                  | EFL 렌더링 엔진              |
| `DBUS_SESSION_BUS_ADDRESS` | `unix:path=/run/user/5001/bus` | DBus 세션 버스 주소          |

또한 `setsid`를 사용하여 앱 프로세스를 새 세션으로 분리하며, `sdb shell` 종료 후에도 프로세스가 유지됩니다. 앱 실행 후 `pgrep`으로 프로세스 생존을 폴링 검증하고(1초 간격, 최대 5회), 출력은 `/tmp/<app-name>.log`로 리다이렉트됩니다.

폴링 후에도 프로세스를 찾지 못하면, 스크립트가 `/tmp/<app-name>.log`의 마지막 20줄을 자동으로 가져와 envelope `warnings`에 표시하고(`app-log:` 접두사), 흔한 실패 유형(Wayland 연결 거부, 공유 라이브러리 누락)에 대한 힌트를 함께 출력합니다.

### 설치 응답 예시

```json
{
  "status": "success",
  "result": {
    "package_path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm",
    "device_serial": "emulator-26101",
    "app_id": null,
    "installation_status": "completed",
    "app_launched": true
  }
}
```

---

## 트러블슈팅

### 'Stage' was not declared in this scope

**원인:** `dali.h`에 `Stage` 클래스가 포함되어 있지 않음  
**해결:** `#include <dali/devel-api/common/stage.h>` 추가

### Package file not found after GBS build

**원인:** 빌드 스크립트가 `.tpk`만 검색하고 `.rpm`을 찾지 못함 (이전 버전)  
**해결:** 최신 버전의 `tizen-build-project.sh`와 `project.js`로 업데이트 (`.rpm` 검색 지원)

### GBS is not available

**원인:** GBS가 설치되어 있지 않음  
**해결:**

```bash
sudo apt-get install gbs
```

또는 tizen-cli GBS 플러그인 설치 확인:

```bash
tizen-cli plugin list
```

### 'string_view' in namespace 'std' does not name a type

**원인:** C++17 미지정. Tizen 9.0 dali2 헤더가 `std::string_view` / `std::any`를 사용합니다.  
**해결:** `CMakeLists.txt`의 `add_executable()` 앞에 `set(CMAKE_CXX_STANDARD 17)` + `set(CMAKE_CXX_STANDARD_REQUIRED ON)` 추가. `gbs --define optflags`로는 우회 불가 — [C++17 필수](#c17-필수) 참조.

### DALi project does not select C++17 (exit 4)

**원인:** 프리플라이트 검사가 `dali2-*` 의존성은 있는데 C++17 설정이 없는 것을 GBS 실행 전에 감지  
**해결:** 위와 동일. 에러 메시지가 검사한 파일 목록과 추가할 CMake 구문을 그대로 출력합니다.

### error: Bad exit status from /var/tmp/rpm-tmp.XXX (%build)

**원인:** 컴파일 에러 또는 의존성 패키지 누락  
**해결:** 빌드 로그 확인:

```bash
cat ~/GBS-ROOT/local/repos/tizen/<arch>/logs/fail/<app-name>-<version>-1/log.txt
```

### No local package repository for arch x86_64

**원인:** GBS 로컬 저장소에 해당 아키텍처의 패키지가 없음  
**해결:** `.gbs.conf` 설정 확인 및 Tizen 플랫폼 저장소 프로파일 점검

### RPM 앱 실행 후 프로세스가 즉시 종료됨

**원인 1:** `sdb shell`이 종료되면 자식 프로세스도 함께 종료됨  
**해결:** `setsid`를 사용하여 프로세스를 새 세션으로 분리 (최신 버전에서 자동 적용됨)

**원인 2:** root(`sdb root on` 이후)로 실행된 앱이 `owner`(uid 5001) 소유의 Wayland/DBus 소켓(`/run/user/5001`)에 연결하지 못함  
**해결:** `su - owner -c`로 `owner` 사용자로 실행 (최신 버전에서 자동 적용됨). 실행 실패 시 envelope warnings에 `/tmp/<app-name>.log`의 마지막 내용(`app-log:` 접두사)이 포함되어 실제 크래시 원인을 확인할 수 있습니다.

### RPM 앱 실행 시 eldbus 연결 에러가 무한히 발생

**원인:** `DBUS_SESSION_BUS_ADDRESS` 환경 변수가 설정되지 않음  
**해결:** `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/5001/bus` 설정 (최신 버전에서 자동 적용됨)

### RPM 앱 실행 시 Wayland 디스플레이 연결 실패

**원인:** `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR` 환경 변수가 설정되지 않음  
**해결:** 환경 변수 자동 설정 (최신 버전에서 자동 적용됨)

> DALi Demo 앱의 생성부터 스크린샷 캡처까지의 전체 과정은 [DALi Demo 엔드투엔드 가이드](tizen-cli/dali-demo-e2e-walkthrough.md)를 참조하세요.

---

## 관련 문서

- [DALi C++17 빌드 실패 사전 차단](figma2dali/dali-cxx17-preflight.md)
- [DALi Demo 엔드투엔드 가이드](tizen-cli/dali-demo-e2e-walkthrough.md)
- [스킬 레퍼런스](SKILLS_REFERENCE.md)
- [네이티브 앱 시나리오 가이드](project/scenario-native-app-walkthrough.md)

- [SDK 명령 아키텍처](SDK_COMMANDS_ARCHITECTURE.md)
- [dali_demo 템플릿 README](../common/scripts/tizen-create-project/templates/platform/dali-demo/)
