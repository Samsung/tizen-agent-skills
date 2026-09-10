---
name: tizen-sdk
description: Tizen CLI agent workflows umbrella — 타이젠, Tizen 개발, 타이젠 개발 환경, Tizen SDK, 타이젠 앱, tizen-cli 사용법. Use this skill as the router for any Tizen development request that doesn't match a more specific tizen-* skill. It documents the tizen-sdk plugin for tizen-cli — 34 commands covering SDK/platform install and package update, project create/delete/build, emulator and device management, app install, certificates, remote debugging, Playwright web app testing, and dlog analysis — all returning a Standard JSON Envelope.

metadata:
  author: Samsung Electronics
  last-updated: "2026-08-26"
  keywords:
    - Tizen
    - tizen-cli
    - Tizen SDK
    - 타이젠
    - 타이젠 개발
    - tizen-sdk
---

# Tizen CLI Agent Workflows (tizen-sdk plugin)

All Tizen development tasks run through the `tizen-sdk` plugin:

```
tizen-cli tizen-sdk <command> [--options...]
```

Every command prints exactly one Standard JSON Envelope to stdout:

- Success: `{ "status": "success", "result": {...}, "warnings": [], "errors": [] }`
- Failure: `{ "status": "failure", "result": null, "errors": [{ "error_code", "message", "error_category"?, "suggested_fix"? }] }`

Exit code is 0 on success, 1 on failure. Diagnostics go to stderr only — parse stdout as JSON.

## Command routing table

All 34 commands. Several commands share one skill — a skill can own more than one
command (e.g. `create-project` / `project-delete`), so the counts differ by design:
34 commands map onto 29 core skills (the `common/skills/` set). This directory adds
two tizen-cli-only SKILL.md files on top of those 29 — this umbrella router and
`tizen-list-templates` — for 31 total. See
`docs/SKILLS_COMMANDS_MAPPING.md` for the full mapping.

### SDK, platform, packages (12)

| User intent (ko/en) | Command | Skill |
|---|---|---|
| SDK 경로 설정 / set SDK path | `sdk-init` | tizen-sdk-init |
| SDK 설치 / install Tizen SDK | `sdk-install` | tizen-sdk-install |
| 커스텀 저장소로 SDK 설치 / install from mirror URL | `sdk-install-custom-repo` | tizen-sdk-install-custom-repo |
| 저장소 URL 검증 / validate repository URL | `validate-repo-url` | tizen-sdk-install-custom-repo |
| 저장소 정보 / repository info, CDN mirrors | `sdk-repo-info` | tizen-sdk-install |
| TV SDK 설치 / TV extension | `tv-sdk-install` | tizen-tv-sdk-install |
| TV SDK ZIP 설치 / TV extension from ZIP | `tv-sdk-install-from-zip` | tizen-tv-sdk-install-from-zip |
| 패키지 업데이트 / update packages | `update-package` | tizen-update-package |
| 플랫폼 설치 / install platform package | `platform-install` | tizen-platform-install |
| 에뮬레이터 패키지 다운로드 / emulator package | `download-emulator-package` | tizen-download-emulator-package |
| 모바일 플랫폼 다운로드 / MOBILE platform | `download-mobile-platform` | tizen-download-mobile-platform |
| 커스텀 루트스트랩 설치 / install rootstrap | `install-rootstrap` | tizen-install-rootstrap |

### Preflight and toolchain (3)

| User intent (ko/en) | Command | Skill |
|---|---|---|
| node 확인 | `check-node` | tizen-check-node |
| 디스크 공간 확인 | `check-disk-space` | tizen-check-disk-space |
| 닷넷 워크로드 설치 / .NET setup | `dotnet-setup` | tizen-dotnet-setup |

### Project (4)

| User intent (ko/en) | Command | Skill |
|---|---|---|
| 템플릿 목록 / list templates | `list-templates` | tizen-list-templates (tizen-cli 전용; common에서는 tizen-create-project의 list-templates 액션) |
| 앱/프로젝트 생성 / create app | `create-project` | tizen-create-project |
| 프로젝트 삭제 / delete project | `project-delete` | tizen-create-project (delete 액션) |
| 빌드 / build | `build-project` | tizen-build-project |

### Emulator and device (7)

| User intent (ko/en) | Command | Skill |
|---|---|---|
| 에뮬레이터 생성 / create emulator VM | `create-emulator` | tizen-create-emulator |
| 에뮬레이터 실행 / launch emulator VM | `launch-emulator` | tizen-launch-emulator |
| 에뮬레이터 수정·초기화·이미지 캡처 / full em-cli surface | `emulator-manager` | tizen-create-emulator, tizen-launch-emulator |
| 디바이스 찾기·에뮬레이터 종료 / find device, stop emulator | `device-manager` | tizen-device-manager |
| 원격 디바이스 검색·연결 / network scan, sdb connect | `remote-device` | tizen-remote-device |
| sdb 명령 / shell, port forward, reboot | `sdb-helper` | tizen-sdb-helper |
| 파일 전송 / sdb push, pull | `file-transfer` | tizen-file-transfer |

### App, debugging, test (6)

| User intent (ko/en) | Command | Skill |
|---|---|---|
| 앱 설치·실행 / install, run app | `install-app` | tizen-install-app |
| 네이티브 디버깅 / GDB debug (**Native 전용**) | `gdb-debug` | tizen-gdb-debug |
| 닷넷 디버깅 / netcoredbg (**DotNET 전용**) | `dotnet-debug` | tizen-dotnet-debug |
| 웹앱 디버깅 / RWI, CDP (**WebApp 전용**) | `webapp-debug` | tizen-webapp-debug |
| 웹앱 자동화 테스트 / Playwright, E2E (**WebApp 전용**) | `playwright-test` | tizen-playwright-test |
| 화면 캡처 / screenshot | `screenshot` | tizen-screenshot |

### Certificates and diagnostics (2)

| User intent (ko/en) | Command | Skill |
|---|---|---|
| 인증서·서명 프로파일 / certificates, signing profiles | `certificate-manager` | tizen-certificate-manager |
| 로그 분석·크래시 탐지 / dlog analysis, crash detection | `dlog-analyzer` | tizen-dlog-analyzer |

## Discovering state

- `tizen-cli tizen-sdk --capabilities` — which commands are currently runnable (SDK-dependent commands are unavailable until `sdk-install` succeeds).
- `tizen-cli tizen-sdk --doctor` — environment checks (Node, scripts, shell, SDK, sdb, em-cli). The em-cli check probes `em-cli list-vm`, so a broken emulator Java/JNA runtime is reported here before any create/launch-emulator call fails.
- `tizen-cli tizen-sdk --schema` — full option schema (required/enum/default) for all 34 commands.
- `tizen-cli --schema` — full option schema for every installed plugin.

## Typical pipeline

```
check-node → check-disk-space → sdk-install [→ platform-install / tv-sdk-install]
  → list-templates → create-project → build-project
  → create-emulator → launch-emulator (또는 device-manager / remote-device)
  → install-app (--run)
  → gdb-debug (Native) / dotnet-debug (DotNET) / webapp-debug (WebApp)
  → playwright-test (WebApp 자동화 테스트)
```

Off-pipeline commands, used when the request calls for them rather than in sequence:
`sdk-init`, `sdk-repo-info`, `sdk-install-custom-repo`, `validate-repo-url`,
`update-package`, `install-rootstrap`,
`download-emulator-package`, `download-mobile-platform`, `dotnet-setup`, `project-delete`,
`emulator-manager`, `sdb-helper`, `file-transfer`, `screenshot`, `certificate-manager`,
`dlog-analyzer` (앱 실행 전에 `--action start`로 먼저 띄워 두는 것이 유효).

## Notes


- This plugin replaces the older `tizen-sdk` plugin, which used a nested command surface (`tizen-cli tizen-sdk sdk init`, `tizen-cli tizen-sdk emulator create`). Only the flat commands documented here are valid; if `tizen-cli tizen-sdk --schema` does not list them, uninstall the old plugin (`tizen-cli plugin uninstall tizen-sdk`) and install this one.
- Never hand-write Tizen project files (config.xml, tizen-manifest.xml) — always scaffold via `create-project`.
- Never `rm -rf` a project to delete it — use `project-delete`, which runs on the SDK host and refuses paths without a Tizen project marker.
- A Tizen app runs on a device/emulator, never on the host — "run the app" means `install-app --run`.
- **WebApp (.wgt) projects must NEVER be debugged with `gdb-debug` or `dotnet-debug`** — web apps have no native binary or CoreCLR process, and both commands refuse wgt packages. For web app debugging, use the `webapp-debug` command (RWI/CDP); for automated Playwright testing of a web app, use `playwright-test`. Check the project type first (config.xml → WebApp, tizen-manifest.xml → Native, .csproj → DotNET).
