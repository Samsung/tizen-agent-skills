# DALi Demo 엔드투엔드 가이드

[English](dali-demo-e2e-walkthrough.en.md) | 한국어

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-07-27  
**라이선스:** Apache License 2.0 ([LICENSE](../../LICENSE))

---

## 개요

이 문서는 `dali_demo` 템플릿을 사용하여 DALi 데모 앱을 **생성 → 빌드 → 설치/실행 → 스크린샷 캡처**하는 전체 과정을 단계별로 설명합니다.

> GBS 빌드 자체에 대한 상세한 내용은 [Platform 앱 GBS 빌드 가이드](../platform-gbs-build.md)를 참조하세요.

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
  "warnings": [],
  "errors": [],
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
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-project",
  "duration_ms": 11280
}
```

> **템플릿 이름 자동 치환:** `dali_demo` 템플릿의 기본 이름인 `dali-demo`는 CMakeLists.txt, `.spec` 파일 등에 하드코딩되어 있습니다. 프로젝트 이름을 `dali-demo`가 아닌 다른 이름으로 지정하면, 생성 스크립트가 자동으로 다음 파일들에서 템플릿 이름을 사용자가 지정한 프로젝트 이름으로 치환합니다:
>
> - **CMakeLists.txt** — CMake 타겟명, 바이너리명
> - **packaging/`<template>.spec`** — RPM 패키지명, 파일명 (예: `dali-demo.spec` → `<project-name>.spec`으로 rename)
> - **기타 텍스트 파일** (`.txt`, `.cmake`, `.yaml`, `.json`, `.md`, `.spec`)
>
> 예: `--name my-dali-app`으로 생성하면 빌드 산출물이 `my-dali-app-1.0.0-1.x86_64.rpm`이 됩니다.

---

## 3단계: GBS 빌드

생성한 프로젝트를 GBS로 빌드합니다.

**tizen-cli 명령:**

```bash
tizen-cli tizen-sdk build-project --project /home/user/tizen-apps/dali-demo
```

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

**응답 예시:**

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
  "warnings": [],
  "errors": [],
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
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-app",
  "duration_ms": 13000
}
```

> `app_id`가 `null`인 것은 정상입니다 — Platform (RPM) 앱은 `app_launcher`에 등록되지 않으므로 app_id가 없습니다. 대신 `/usr/bin/dali-demo` 바이너리로 직접 실행됩니다.

> **Rerun 스크립트 자동 생성:** RPM 설치 시 Platform 앱은 `app_launcher`에 아이콘이 없어서 앱이 종료된 후(예: Back 키) 디바이스 홈 화면에서 재실행할 수 없습니다. 이를 해결하기 위해 `install-app` 명령이 RPM 패키지 설치 후 호스트에 `~/bin/run-<app-name>.sh` 재실행 스크립트를 자동으로 생성합니다. 이 스크립트는 RPM을 재설치하지 않고도 이미 설치된 바이너리를 다시 실행할 수 있습니다:
>
> ```bash
> # 앱 재실행 (RPM 재설치 불필요)
> ~/bin/run-dali-demo.sh
> ```

스크립트는 디바이스 감지, root 권한 획득, Wayland 환경 설정, owner 사용자(uid 5001)로 앱 실행, 프로세스 확인을 자동으로 수행합니다.

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

**응답 예시:**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "screenshot_path": "/home/user/tizen-apps/emulator_screenshot.png",
    "capture_method": "host-side xwd",
    "file_size_bytes": 1234567,
    "dimensions": "1920x1080"
  },
  "warnings": [],
  "errors": [],
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

---

## 관련 문서

- [Platform 앱 GBS 빌드 가이드](../platform-gbs-build.md)
- [스킬 레퍼런스](../SKILLS_REFERENCE.md)
- [SDK 명령 아키텍처](../SDK_COMMANDS_ARCHITECTURE.md)
- [dali_demo 템플릿 README](../../common/scripts/tizen-create-project/templates/platform/dali-demo/)
