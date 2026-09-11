# DALi 템플릿 빌드 엔드투엔드 가이드

[English](dali-template-build-e2e.en.md) | 한국어

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-08-25  
**라이선스:** Apache License 2.0 ([LICENSE](../../LICENSE))

---

## 개요

이 문서는 `dali_demo` 템플릿을 사용하여 DALi Platform 앱을 **사전 준비 → 프로젝트 생성 → GBS 빌드 → RPM 설치/실행 → 스크린샷 캡처**까지의 전체 과정을 하나의 가이드로 안내합니다.

> GBS 빌드 자체에 대한 상세한 내용은 [Platform 앱 GBS 빌드 가이드](../platform-gbs-build.md)를 참조하세요.

이 가이드는 figma2dali 작업에서 얻은 개선 사항들을 통합한 최신 워크플로우를 반영합니다:

| 개선 사항 | 관련 문서 | 효과 |
|-----------|----------|------|
| C++17 프리플라이트 사전 차단 | [dali-cxx17-preflight.md](dali-cxx17-preflight.md) | GBS 실행 전에 빌드 실패를 즉시 감지 (exit 4) |
| 빌드 실패 진단 정보 개선 | [build-failure-diagnostics.md](build-failure-diagnostics.md) | 실패 원인이 Envelope에 직접 포함됨 |
| enlightenment_info 스크린샷 폴백 | [screenshot-enlightenment-capture.md](screenshot-enlightenment-capture.md) | 에뮬레이터에서 네이티브 해상도 캡처 |

---

## 사전 요구사항

### 1. GBS (Git Build System)

DALi Platform 프로젝트는 `tz build`가 아닌 **GBS**로 빌드됩니다. 빌드 스크립트는 3단계 fallback으로 GBS를 찾습니다:

1. **tizen-cli GBS 플러그인** — tizen-cli에 GBS 플러그인이 설치되어 있으면 사용
2. **시스템 설치 gbs** — `gbs`가 PATH에 있으면 직접 사용
3. **모두 없음** — 설치 가이드와 함께 에러 반환

```bash
# Ubuntu/Debian
sudo apt-get install gbs
```

### 2. Git 저장소

GBS는 빌드를 위해 **Git 저장소**가 필요합니다. 빌드 스크립트가 자동으로 초기화합니다:

- `.git` 디렉토리가 이미 있으면: 아무 작업 없이 진행
- `.git` 디렉토리가 없으면: `git init` → `git add -A` → `git commit` 자동 실행

### 3. .gbs.conf

홈 디렉토리에 `.gbs.conf` 파일이 필요합니다. GBS가 사용할 Tizen 플랫폼 저장소 프로파일을 정의합니다.

### 4. Tizen 플랫폼 개발 패키지

`.spec` 파일에 명시된 `BuildRequires` 패키지가 GBS 빌드 환경에 설치되어 있어야 합니다:

```
BuildRequires:  cmake
BuildRequires:  pkgconfig(dali2-core)
BuildRequires:  pkgconfig(dali2-adaptor)
BuildRequires:  pkgconfig(dali2-toolkit)
```

### 5. 디바이스 또는 에뮬레이터

RPM 설치 및 실행을 위해 Tizen 디바이스 또는 에뮬레이터가 필요합니다. 에뮬레이터가 없으면 설치 단계에서 자동 생성됩니다.

---

## 전체 흐름 한눈에 보기

| 단계 | 작업 | 담당 스킬 | 예상 소요 시간 |
|------|------|-----------|----------------|
| 1 | 템플릿 목록 조회 | `tizen-create-project` | ~5초 |
| 2 | 프로젝트 생성 | `tizen-create-project` | ~11초 |
| 3 | GBS 빌드 | `tizen-build-project` | ~23초 |
| 4 | 디바이스/에뮬레이터 준비 | `tizen-device-manager` | ~159초 (에뮬레이터 부팅 포함) |
| 5 | RPM 설치 및 실행 | `tizen-install-app` | ~13초 |
| 6 | 스크린샷 캡처 | `tizen-screenshot` | ~3초 |

---

## 1단계: 템플릿 목록 조회

사용 가능한 Platform 템플릿을 확인합니다.

**tizen-cli 명령:**

```bash
tizen-cli tizen-sdk list-templates --type platform
```

**자연어 (Cline/Claude Code):**

```
플랫폼 템플릿 목록 보여줘
```

**CLI 러너 직접 실행:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" list-templates --type platform
```

**응답 예시:**

```json
{
  "status": "success",
  "result": {
    "templates": {
      "platform": ["dali_demo"]
    }
  },
  "command": "tizen-sdk list-templates",
  "duration_ms": 4739
}
```

---

## 2단계: 프로젝트 생성

`dali_demo` 템플릿으로 새 프로젝트를 생성합니다.

**tizen-cli 명령:**

```bash
tizen-cli tizen-sdk create-project \
  --type platform \
  --template dali_demo \
  --parent-path /home/user/tizen-apps \
  --name dali-demo
```

| 옵션                  | 필수    | 설명                                                      |
| --------------------- | ------- | --------------------------------------------------------- |
| `--type <type>`       | **yes** | `platform`                                                |
| `--template <name>`   | **yes** | `list-templates`에서 확인한 템플릿 이름 (예: `dali_demo`)  |
| `--parent-path <dir>` | **yes** | 워크스페이스(부모) 디렉토리 — 앱 폴더가 그 안에 생성됨     |
| `--name <appName>`    | **yes** | 앱 이름 = 생성할 폴더 이름                                |

**자연어 (Cline/Claude Code):**

```
플랫폼 dali_demo 템플릿으로 dali-demo 앱 만들어줘
```

**CLI 러너 직접 실행:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" create --type platform --template dali_demo --parent-path /home/user/tizen-apps --name dali-demo
```

**응답 예시:**

```json
{
  "status": "success",
  "result": {
    "project_name": "dali-demo",
    "project_type": "platform",
    "template_name": "dali_demo",
    "project_path": "/home/user/tizen-apps/dali-demo",
    "status": "created"
  },
  "command": "tizen-sdk create-project",
  "duration_ms": 11280
}
```

### 생성된 프로젝트 구조

```
dali-demo/
├── CMakeLists.txt              # CMake 빌드 설정 (C++17 포함)
├── tizen-manifest.xml          # Tizen 패키지 매니페스트
├── packaging/
│   └── dali-demo.spec          # RPM spec 파일 (GBS 빌드에 사용)
├── src/
│   └── main.cpp                # DALi 데모 소스 코드
└── shared/                     # 공유 리소스 (선택)
```

> **템플릿 이름 자동 치환:** `dali_demo` 템플릿의 기본 이름인 `dali-demo`는 CMakeLists.txt, `.spec` 파일 등에 하드코딩되어 있습니다. 프로젝트 이름을 `dali-demo`가 아닌 다른 이름으로 지정하면, 생성 스크립트가 자동으로 템플릿 이름을 사용자가 지정한 프로젝트 이름으로 치환합니다. 예: `--name my-dali-app` → 빌드 산출물이 `my-dali-app-1.0.0-1.x86_64.rpm`이 됩니다.

### C++17 설정 확인

`dali_demo` 템플릿은 기본적으로 C++17을 포함하고 있으므로 프리플라이트를 통과합니다. CMakeLists.txt에 다음 두 줄이 `add_executable()` 앞에 있어야 합니다:

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

> **주의:** `gbs build --define "optflags -std=c++17"`로는 C++17을 우회할 수 없습니다. spec의 `%build`가 `CXXFLAGS` export 없이 `cmake`를 직접 호출하므로 rpm optflags가 컴파일러에 도달하지 않습니다. 반드시 CMakeLists.txt에서 설정해야 합니다. 자세한 내용은 [DALi C++17 빌드 실패 사전 차단](dali-cxx17-preflight.md)을 참조하세요.

---

## 3단계: GBS 빌드

생성한 프로젝트를 GBS로 빌드합니다.

**tizen-cli 명령:**

```bash
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/dali-demo
```

| 옵션                  | 필수    | 기본값   | 설명                                        |
| --------------------- | ------- | -------- | ------------------------------------------- |
| `--project <path>`    | **yes** | —        | 프로젝트 루트 디렉토리                      |
| `--build-type <type>` | no      | `Debug`  | `Debug` \| `Release` \| `Test`              |
| `--arch <arch>`       | no      | `x86_64` | `armv7l` \| `aarch64` \| `i586` \| `x86_64` |

**자연어 (Cline/Claude Code):**

```
dali-demo 프로젝트 빌드해줘
```

**CLI 러너 직접 실행:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" build --project "/home/user/tizen-apps/dali-demo" --build-type Debug
```

**응답 예시 (성공):**

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
  "command": "tizen-sdk build-project",
  "duration_ms": 22806
}
```

### 빌드 스크립트 내부 동작

1. **프로젝트 타입 감지** — `tizen-manifest.xml` + `CMakeLists.txt` 존재 확인 → Platform
2. **DALi C++17 프리플라이트** — `dali2-*` 의존성이 있으면 C++17 설정 확인, 없으면 **exit 4**로 즉시 중단
3. **GBS 실행 파일 확인** — 3단계 fallback (tizen-cli 플러그인 → 시스템 gbs → 에러)
4. **Git 저장소 확인** — `.git`이 없으면 자동 초기화
5. **GBS 빌드 실행** — `gbs build -A <arch> --include-all`
6. **산출물 검색** — 프로젝트 디렉토리 및 `~/GBS-ROOT`에서 `.rpm` 파일 검색
7. **결과 반환** — Standard JSON Envelope로 빌드 결과 전달

### 빌드 실패 시 진단

빌드가 실패하면 응답 Envelope에 **실제 컴파일 에러가 직접 포함**됩니다. 별도로 로그 파일을 열지 않아도 원인을 확인할 수 있습니다.

**실패 응답 예시:**

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_BUILD_E001",
      "error_category": "build_failed",
      "message": "Build failed (exit 1).\n\nBuild errors:\n  .../main.cpp:42:10: fatal error: dali/dali.h: No such file or directory\n  ...\n\nFull log: /tmp/tizen-build-1785717621350.log",
      "details": [
        ".../main.cpp:42:10: fatal error: dali/dali.h: No such file or directory",
        "make[2]: *** [CMakeFiles/dali-demo.dir/build.make:76: main.o] Error 1",
        "error: Bad exit status from /var/tmp/rpm-tmp.k3Jd91 (%build)",
        "gbs:error: Local build failed"
      ]
    }
  ]
}
```

> **주의:** 빌드 실패 시 **동일한 빌드를 재실행하지 마세요.** `errors[0].details`에 진단 정보가 있으면 이를 기반으로 원인을 파악하세요. 진단이 비어 있을 때만 `Full log:` 경로의 로그 파일을 확인하세요. 자세한 내용은 [빌드 실패 진단 정보 개선](build-failure-diagnostics.md)을 참조하세요.

### 빌드 산출물 위치

```
~/GBS-ROOT/local/repos/tizen/x86_64/RPMS/
├── dali-demo-1.0.0-1.x86_64.rpm              # 메인 패키지
├── dali-demo-debuginfo-1.0.0-1.x86_64.rpm     # 디버그 정보
└── dali-demo-debugsource-1.0.0-1.x86_64.rpm   # 디버그 소스

~/GBS-ROOT/local/repos/tizen/x86_64/SRPMS/
└── dali-demo-1.0.0-1.src.rpm                  # 소스 RPM
```

> 빌드 산출물 경로는 다음 단계에서 사용됩니다: `~/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm`

---

## 4단계: 디바이스/에뮬레이터 준비

앱을 설치할 디바이스 또는 에뮬레이터를 준비합니다.

**tizen-cli 명령:**

```bash
tizen-cli tizen-sdk device-manager
```

**자연어 (Cline/Claude Code):**

```
디바이스 연결해줘
```

**CLI 러너 직접 실행:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/device-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/device-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"
```

**응답 예시:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "emulator_launched": true,
    "status": "connected"
  },
  "command": "tizen-sdk device-manager",
  "duration_ms": 159000
}
```

> 에뮬레이터가 없으면 자동으로 생성 및 실행됩니다.

---

## 5단계: RPM 설치 및 실행

빌드한 RPM 패키지를 디바이스에 설치하고 실행합니다.

**tizen-cli 명령:**

```bash
tizen-cli tizen-sdk install-app \
  --package /home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm \
  --run
```

| 옵션               | 필수    | 설명                 |
| ------------------ | ------- | -------------------- |
| `--package <path>` | **yes** | RPM 패키지 파일 경로 |
| `--run`            | no      | 설치 후 앱 자동 실행 |

**자연어 (Cline/Claude Code):**

```
dali-demo RPM 에뮬레이터에 설치하고 실행해줘
```

**CLI 러너 직접 실행:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" install --package "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm" --device-serial emulator-26101 --run
```

**응답 예시:**

```json
{
  "status": "success",
  "result": {
    "package_path": "/home/user/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm",
    "device_serial": "emulator-26101",
    "app_id": null,
    "installation_status": "completed",
    "app_launched": true
  },
  "command": "tizen-sdk install-app",
  "duration_ms": 13000
}
```

> `app_id`가 `null`인 것은 정상입니다 — Platform (RPM) 앱은 `app_launcher`에 등록되지 않으므로 app_id가 없습니다. 대신 `/usr/bin/dali-demo` 바이너리로 직접 실행됩니다.

### RPM 앱 실행 환경

RPM 플랫폼 앱은 `sdb shell`을 통해 **`owner` 사용자(uid 5001)로 실행**됩니다. 다음 환경 변수가 자동으로 설정됩니다:

| 환경 변수                  | 값                             | 설명                         |
| -------------------------- | ------------------------------ | ---------------------------- |
| `WAYLAND_DISPLAY`          | `wayland-0`                    | Wayland 디스플레이 소켓 이름 |
| `XDG_RUNTIME_DIR`          | `/run/user/5001`               | XDG 런타임 디렉토리          |
| `ELM_ENGINE`               | `wayland_egl`                  | EFL 렌더링 엔진              |
| `DBUS_SESSION_BUS_ADDRESS` | `unix:path=/run/user/5001/bus` | DBus 세션 버스 주소          |

`setsid`를 사용하여 앱 프로세스를 새 세션으로 분리하며, `sdb shell` 종료 후에도 프로세스가 유지됩니다. 실행 후 `pgrep`으로 프로세스 생존을 폴링 검증(1초 간격, 최대 5회)하며, 출력은 `/tmp/dali-demo.log`로 리다이렉트됩니다.

### 앱 재실행

Platform 앱은 `app_launcher`에 아이콘이 없어 앱 종료 후 디바이스 홈에서 재실행할 수 없습니다. 설치 시 호스트에 재실행 스크립트가 자동 생성됩니다:

```bash
# 앱 재실행 (RPM 재설치 불필요)
~/bin/run-dali-demo.sh
```

---

## 6단계: 스크린샷 캡처

실행 중인 앱의 스크린샷을 캡처합니다.

**tizen-cli 명령:**

```bash
tizen-cli tizen-sdk screenshot
```

특정 디바이스와 출력 경로를 지정할 수도 있습니다:

```bash
tizen-cli tizen-sdk screenshot --serial emulator-26101 --output ./dali-demo-screenshot.png
```

**자연어 (Cline/Claude Code):**

```
에뮬레이터 스크린샷 찍어줘
```

**CLI 러너 직접 실행:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/screenshot-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/screenshot-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI"                              # 자동 디바이스 선택, 기본 출력 경로
node "$CLI" emulator-26101               # 디바이스 지정
node "$CLI" emulator-26101 ./dali-demo-screenshot.png  # 출력 경로 지정
```

| 인자     | 필수 | 기본값                      | 설명                |
| -------- | ---- | --------------------------- | ------------------- |
| `serial` | no   | 자동 선택 (단일 디바이스)   | sdb 디바이스 시리얼 |
| `output` | no   | `./emulator_screenshot.png` | 출력 PNG 파일 경로  |

> 캡처 방법을 지정하는 옵션은 없습니다. 폴백 체인이 자동 선택하며, 결과는 `capture_method`로 확인합니다. 에뮬레이터에서는 `enlightenment_info -dump_screen`이 1순위로 선택되어 1920×1080 네이티브 해상도로 캡처됩니다. 자세한 내용은 [스크린샷 enlightenment_info 폴백 추가](screenshot-enlightenment-capture.md)를 참조하세요.

**응답 예시:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "screenshot_path": "/home/user/tizen-apps/emulator_screenshot.png",
    "capture_method": "enlightenment_info -dump_screen",
    "file_size_bytes": 1102917,
    "dimensions": "1920x1080",
    "image": {
      "path": "/home/user/tizen-apps/emulator_screenshot.png",
      "size_bytes": 1102917,
      "mime_type": "image/png",
      "width": 1920,
      "height": 1080,
      "base64_omitted_reason": "Image is 1077 KB, over the 512 KB inline limit."
    }
  },
  "command": "tizen-sdk screenshot",
  "duration_ms": 2500
}
```

---

## 전체 워크플로우 한눈에 보기

```bash
# 1. 템플릿 조회
tizen-cli tizen-sdk list-templates --type platform

# 2. 프로젝트 생성
tizen-cli tizen-sdk create-project \
  --type platform --template dali_demo \
  --parent-path /home/user/tizen-apps --name dali-demo

# 3. GBS 빌드
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/dali-demo

# 4. 디바이스/에뮬레이터 준비
tizen-cli tizen-sdk device-manager

# 5. RPM 설치 및 실행
tizen-cli tizen-sdk install-app \
  --package ~/GBS-ROOT/local/repos/tizen/x86_64/RPMS/dali-demo-1.0.0-1.x86_64.rpm \
  --run

# 6. 스크린샷 캡처
tizen-cli tizen-sdk screenshot
```

### 자연어로 한 번에 따라 하기

```
1) 플랫폼 템플릿 목록 보여줘
2) 플랫폼 dali_demo 템플릿으로 dali-demo 앱 만들어줘
3) dali-demo 프로젝트 빌드해줘
4) 디바이스 연결해줘
5) dali-demo RPM 에뮬레이터에 설치하고 실행해줘
6) 에뮬레이터 스크린샷 찍어줘
```

---

## 트러블슈팅

### C++17 관련 (exit 4)

| 증상 | 원인 | 해결 |
|------|------|------|
| `exit 4`로 빌드 전 중단 | `dali2-*` 의존성이 있는데 C++17 설정이 없음 | CMakeLists.txt의 `add_executable()` 앞에 `set(CMAKE_CXX_STANDARD 17)` + `set(CMAKE_CXX_STANDARD_REQUIRED ON)` 추가 |
| `'string_view' in namespace 'std' does not name a type` | C++17 미지정. Tizen 9.0 dali2 헤더가 `std::string_view` / `std::any` 사용 | 위와 동일. `gbs --define optflags`로는 우회 불가 |
| 프리플라이트는 통과했는데 같은 에러 | 표준이 지정되어 있지만 하위 타깃에서 덮어쓰기됨 | HINT가 진단에 자동으로 첨부됨 — CMakeLists.txt 확인 |

> 자세한 내용은 [DALi C++17 빌드 실패 사전 차단](dali-cxx17-preflight.md)을 참조하세요.

### 빌드 실패

| 증상 | 원인 | 해결 |
|------|------|------|
| `fatal error: dali/dali.h: No such file or directory` | `BuildRequires` 패키지가 GBS 환경에 없음 | `.spec` 파일의 `pkgconfig(dali2-core)` 등이 설치되어 있는지 확인 |
| `error: Bad exit status from /var/tmp/rpm-tmp.XXX (%build)` | 컴파일 에러 또는 의존성 누락 | 응답 `details` 배열에서 실제 에러 확인. 비어 있으면 `cat ~/GBS-ROOT/local/repos/tizen/<arch>/logs/fail/<app-name>-<version>-1/log.txt` |
| `GBS is not available` | GBS 미설치 | `sudo apt-get install gbs` 또는 tizen-cli GBS 플러그인 확인 |
| `No local package repository for arch x86_64` | GBS 로컬 저장소에 해당 아키텍처 패키지 없음 | `.gbs.conf` 설정 및 Tizen 플랫폼 저장소 프로파일 점검 |

> 빌드 실패 시 **동일한 빌드를 재실행하지 마세요.** 응답 Envelope의 `details` 배열에서 원인을 먼저 확인하세요. 자세한 내용은 [빌드 실패 진단 정보 개선](build-failure-diagnostics.md)을 참조하세요.

### RPM 실행 실패

| 증상 | 원인 | 해결 |
|------|------|------|
| 앱 프로세스가 즉시 종료 | root로 실행된 앱이 `owner` 소유의 Wayland/DBus 소켓에 연결 불가 | 최신 버전에서 `su - owner -c`로 자동 실행. `warnings`의 `app-log:` 내용 확인 |
| eldbus 연결 에러 무한 발생 | `DBUS_SESSION_BUS_ADDRESS` 미설정 | 최신 버전에서 자동 설정 |
| Wayland 디스플레이 연결 실패 | `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR` 미설정 | 최신 버전에서 자동 설정 |

> 실행 실패 시 envelope `warnings`에 `/tmp/dali-demo.log`의 마지막 20줄(`app-log:` 접두사)이 포함됩니다.

### 스크린샷 관련

| 증상 | 원인 | 해결 |
|------|------|------|
| `capture_method`가 `host-side xwd`로 표시 | enlightenment_info가 root 권한을 얻지 못함 | `sdb root on`이 가능한 환경인지 확인. xwd 결과는 해상도가 낮을 수 있음 |
| 스크린샷이 커널 콘솔만 잡힘 | `/dev/fb0`로 캡처된 경우 | `capture_method`를 확인. `fb0`이면 앱 화면이 아닐 수 있음 |

---

## 검증 체크리스트

각 단계가 성공적으로 완료되었는지 확인하세요:

- [ ] **1단계:** `templates.platform` 배열에 `dali_demo`가 포함되어 있는가?
- [ ] **2단계:** `project_path` 디렉토리에 `CMakeLists.txt`, `tizen-manifest.xml`, `packaging/*.spec`이 생성되었는가?
- [ ] **2단계:** CMakeLists.txt에 `CMAKE_CXX_STANDARD 17`이 있는가?
- [ ] **3단계:** `artifacts` 배열에 `.rpm` 파일이 포함되어 있는가?
- [ ] **3단계:** 빌드 시간(`build_time_ms`)이 합리적인 범위인가? (~20-30초)
- [ ] **4단계:** `device_serial`이 출력되고 `status`가 `connected`인가?
- [ ] **5단계:** `installation_status`가 `completed`이고 `app_launched`가 `true`인가?
- [ ] **6단계:** `capture_method`가 `enlightenment_info -dump_screen`이고 해상도가 1920×1080인가?

---

## 관련 문서

- [Platform 앱 GBS 빌드 가이드](../platform-gbs-build.md)
- [DALi C++17 빌드 실패 사전 차단](dali-cxx17-preflight.md)
- [빌드 실패 진단 정보 개선](build-failure-diagnostics.md)
- [스크린샷 enlightenment_info 폴백 추가](screenshot-enlightenment-capture.md)
- [DALi Demo 엔드투엔드 가이드 (tizen-cli)](../tizen-cli/dali-demo-e2e-walkthrough.md)
- [스킬 레퍼런스](../SKILLS_REFERENCE.md)
