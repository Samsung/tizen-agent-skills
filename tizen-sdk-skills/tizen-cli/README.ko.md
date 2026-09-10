# tizen-cli 하네스 (tizen-sdk 플러그인)

**tizen-sdk-skills**의 세 번째 하네스 (`claude/`, `cline/`과 병행):
tizen-cli 플러그인으로,
공유 워크플로우를 표준 CLI 명령어로 노출합니다.

```
tizen-cli tizen-sdk <command> [--options...]
```

## 명령어 (flat, 34개)

| 명령어 | 용도 |
|---|---|
| `sdk-init` | Tizen SDK 설치 경로 구성 (`~/.tizen.sdk.path.config`에 기록) |
| `sdk-install` | Tizen SDK 설치 (빠른 사전 체크 + `suggested_fix` 설치 명령) |
| `sdk-install-custom-repo` | 사용자 지정 패키지 저장소 URL에서 Tizen SDK 설치 (`pkg_list_{OS}-{64,32}` 검증) |
| `validate-repo-url` | URL이 사용 가능한 Tizen 패키지 저장소인지 확인 (읽기 전용) |
| `tv-sdk-install` | TV SDK 확장 설치 (TV-SAMSUNG-Public) |
| `tv-sdk-install-from-zip` | 로컬 ZIP 파일로 TV SDK 확장 설치 (오프라인, 모든 패키지가 ZIP에 포함되어야 함) |
| `update-package` | 설치된 Tizen SDK 패키지 업데이트 |
| `sdk-repo-info` | Tizen SDK 패키지 저장소 정보 조회 (CDN 미러, 내부 미러, 현재 저장소 URL) |
| `download-emulator-package` | 패키지 저장소에서 Tizen 에뮬레이터 패키지 다운로드 및 설치 |
| `platform-install` | Tizen 플랫폼 패키지(TIZEN-{version}) 다운로드 및 설치 |
| `download-mobile-platform` | Tizen 모바일 플랫폼 패키지(MOBILE-{version}) 다운로드 및 설치, IOT-Headed 옵션 |
| `install-rootstrap` | ZIP 파일의 커스텀 루트스트랩을 Tizen SDK에 설치 |
| `dotnet-setup` | .NET SDK 확인 + Tizen .NET workload 설치 |
| `check-node` | Node.js 설치 여부 및 PATH 확인 |
| `check-disk-space` | SDK 설치 전 디스크 여유 공간 확인 |
| `create-project` | SDK 템플릿으로 Native/DotNET/WebApp/TV/Platform 프로젝트 생성 (Platform은 GBS로 .rpm 생성) |
| `project-delete` | SDK 호스트의 Tizen 프로젝트 디렉터리 삭제 |
| `list-templates` | 사용 가능한 프로젝트 템플릿 목록 조회 |
| `build-project` | 프로젝트 빌드 + 패키징 (.tpk/.wgt/.rpm) |
| `create-emulator` | 커스텀 Tizen 에뮬레이터 VM 생성 (플랫폼/템플릿/VM 조회 및 삭제도 지원) |
| `launch-emulator` | em-cli로 기존 Tizen 에뮬레이터 VM 실행 |
| `emulator-manager` | em-cli 전체 기능: 생성, 삭제, 실행, 조회, 수정, 리셋, 이미지 캡처 |
| `device-manager` | sdb로 디바이스 탐지, 또는 에뮬레이터 중지 |
| `install-app` | 디바이스에 .tpk/.wgt/.rpm 설치 (및 선택적 실행) |
| `sdb-helper` | 자연어 요청으로 적절한 sdb 명령 실행 |
| `screenshot` | Tizen 에뮬레이터 또는 디바이스에서 스크린샷 캡처 |
| `file-transfer` | sdb로 파일/디렉터리 푸시(호스트→디바이스) 또는 풀(디바이스→호스트) |
| `remote-device` | 원격 Tizen 디바이스 스캔, 연결, 해제, 북마크 관리 |
| `gdb-debug` | Native 앱 원격 GDB 디버깅 설정 (setup-only, WebApp 제외) |
| `dotnet-debug` | .NET 앱 원격 netcoredbg 디버깅 설정 (setup-only, WebApp 제외) |
| `webapp-debug` | 웹 앱 원격 디버깅 설정 (RWI/CDP, setup-only) |
| `dlog-analyzer` | dlog 수집, 크래시/예외 감지 및 근본 원인 분석 (start/stop/status, app-launch, error-analyze) |
| `playwright-test` | Tizen 웹 앱에 대한 Playwright 테스트 실행 (또는 스캐폴드) |
| `certificate-manager` | Tizen 인증서 및 서명 프로필 관리 (생성, 가져오기, 검사, 프로필 생성/삭제, Samsung online-CA) |

모든 명령어는 stdout에 단일 Standard JSON Envelope를 출력하며,
진단 메시지는 stderr로만 출력됩니다.

## 명령어 스키마 참조

각 명령어의 옵션, 필수 플래그, 기본값은 빌드 시점(`--schema`)에
Commander 프로그램에서 자동 생성됩니다. 전체 참조는 아래와 같습니다.

| 명령어 | 필수 옵션 | 선택 옵션 |
|---|---|---|
| `sdk-init` | — | `--sdk-path` (기본: `~/tizen-sdk`) |
| `sdk-install` | — | `--tizen-version` (기본: `10.0`), `--label` (기본: `tizen`), `--force`, `--repo-url` |
| `sdk-install-custom-repo` | `--repo-url` | `--platform-version`, `--force` |
| `validate-repo-url` | `--repo-url` | — |
| `tv-sdk-install` | — | `--force` |
| `tv-sdk-install-from-zip` | `--zip-path` | `--force` |
| `update-package` | — | `--force`, `--dry-run` |
| `sdk-repo-info` | — | — |
| `download-emulator-package` | — | `--platform-version`, `--force` |
| `platform-install` | `--platform-version` | `--force` |
| `download-mobile-platform` | — | `--platform-version`, `--include-iot-headed`, `--iot-headed-version`, `--force` |
| `install-rootstrap` | `--zip-path` | `--force` |
| `dotnet-setup` | — | `--force`, `--workload-version` |
| `check-node` | — | — |
| `check-disk-space` | — | `--path`, `--required-gb` (기본: `15`) |
| `create-project` | `--type` (`native`\|`dotnet`\|`webapp`\|`tv`\|`platform`), `--template`, `--parent-path`, `--name` | `--force` (기존 대상 폴더 대체) |
| `project-delete` | `--project` | — (서버 측 삭제; Tizen 프로젝트가 아닌 경로는 거부) |
| `list-templates` | — | `--type` (`native`\|`dotnet`\|`webapp`\|`tv`\|`platform`) |
| `build-project` | `--project` | `--build-type` (기본: `Debug`, enum: `Debug`\|`Release`\|`Test`), `--sign-profile`, `--arch` (기본: `x86_64`, enum: `armv7l`\|`aarch64`\|`i586`\|`x86_64`), `--clean` (전체 재빌드) |
| `create-emulator` | — | `--action` (기본: `create`, enum: `create`\|`list-platform`\|`list-template`\|`list-vm`\|`delete`), `--vm-name`, `--platform`, `--size`, `--assume-defaults`, `--template`, `--profile` (기본: `tizen`), `--launch`, `--raw-image-path` |
| `launch-emulator` | — | `--vm-name` (기본: 첫 번째 VM), `--timeout` (기본: `300`) |
| `emulator-manager` | — | `--action` (기본: `create`, enum: `create`\|`delete`\|`launch`\|`list-vm`\|`list-platform`\|`list-template`\|`detail`\|`modify`\|`reset`\|`create-image`), `--vm-name`, `--size`, `--assume-defaults`, `--template`, `--platform`, `--profile` (기본: `tizen`), `--launch`, `--skin`, `--ram-size`, `--file-sharing-path`, `--hw-virtualization`, `--hw-gl-acceleration`, `--custom-path`, `--raw-image-path`, `--output-dir`, `--compress`, `--confirm`, `--detail`, `--count`, `--timeout` (기본: `300`), `--emulator-path` |
| `device-manager` | — | `--action` (기본: `start`, enum: `start`\|`stop`), `--timeout` (기본: `300`), `--vm-name` (기본: `tizen-vm-default`), `--profile` (기본: `tizen`, enum: `tizen`\|`tv`) |
| `install-app` | `--package` | `--serial`, `--run` |
| `sdb-helper` | `--request` | `--serial` |
| `screenshot` | — | `--serial`, `--output` (기본: `./emulator_screenshot.png`) |
| `file-transfer` | `--direction` (`push`\|`pull`), `--remote` | `--local` (push 시 필수, pull 시 기본 `.`), `--serial`, `--with-utf8` |
| `remote-device` | — | `--action` (기본: `scan`, enum: `scan`\|`connect`\|`disconnect`\|`list`\|`add`\|`remove`\|`edit`\|`list-saved`), `--ip`, `--subnet`, `--port` (기본: `26101`), `--timeout` (기본: `3000`), `--name`, `--new-ip`, `--new-port` |
| `gdb-debug` | `--app-id`, `--binary` | `--mode` (기본: `attach`, enum: `attach`\|`launch`), `--breakpoints`, `--port` (기본: `5039`), `--timeout` (기본: `30`) |
| `dotnet-debug` | `--app-id` | `--mode` (기본: `attach`, enum: `attach`\|`launch`), `--breakpoints`, `--port` (기본: `4711`), `--serial`, `--force-install`, `--timeout` (기본: `30`) |
| `webapp-debug` | `--app-id` | `--port` (기본: `9222`), `--serial`, `--timeout` (기본: `30`) |
| `dlog-analyzer` | `--action` | `--subcommand` (기본: `start-monitoring`), `--app-id`, `--format`, `--output-dir` |
| `playwright-test` | — | `--app-id`, `--test-file`, `--project-dir`, `--port` (기본: `9222`), `--serial`, `--setup-timeout` (기본: `30`), `--timeout` (기본: `120`), `--no-setup`, `--scaffold`, `--force` |
| `certificate-manager` | — | `--action` (기본: `generate-author`, 21개 선택지), `--name`, `--password`, `--prompt-password`, `--password-file`, `--file`, `--email`, `--department`, `--organization`, `--city`, `--state`, `--country`, `--identity`, `--type`, `--version`, `--profile-name`, `--author-cert`, `--author-password`, `--prompt-author-password`, `--author-password-file`, `--distributor-type`, `--distributor-version`, `--distributor-password`, `--prompt-distributor-password`, `--distributor-password-file`, `--distributor2-cert`, `--distributor2-password`, `--prompt-distributor2-password`, `--distributor2-password-file`, `--distributor2-ca`, `--distributor2-type`, `--distributor2-version`, `--profiles-xml`, `--active`, `--source`, `--certificate-type`, `--target-file`, `--overwrite`, `--certificate`, `--duid-list`, `--duid-file`, `--privilege`, `--serial` |

> **참고:** 스키마는 런타임에 `src/commands.ts`가 `src/command-specs/`의
> 선언적 스펙(도메인별 모듈: sdk, check, project, device, debug, test, certificate)으로부터
> 구성한 Commander 프로그램에서 자동 생성됩니다.
> `tizen-cli tizen-sdk --schema`를 실행하면 머신 리더블 JSON 버전을
> 얻을 수 있습니다. `plugin.json`의 `"commands"` 배열은 `pnpm build`
> (또는 `npm run build`) 시 자동 업데이트됩니다.

## 장시간 실행 작업 및 타임아웃

MCP/mcporter의 기본 호출 타임아웃은 **60초**이며, 일부 작업에는 너무 짧습니다.
플러그인의 `execPluginScript`는 **30분(1,800,000ms) 기본 타임아웃**을 사용하며,
재정의할 수 있습니다.

| 작업 | 일반 소요 시간 | 대응 방법 |
|---|---|---|
| `sdk-install` | 10–30분 | 2단계 패턴: 빠른 사전 체크 → 백그라운드 설치용 `suggested_fix.command` |
| `sdk-install-custom-repo` | 10–30분 | 동일한 2단계 패턴; URL을 먼저 검증하므로 잘못된 저장소는 몇 초 내 실패 |
| `device-manager` (디바이스 탐지) | < 10초 | `sdb devices` — 에뮬레이터 부팅 없음; 디바이스가 없으면 `device_not_found` 반환 |
| `build-project` (대형 프로젝트) | 1–10분 | 10분 기본 타임아웃; 환경 변수로 연장 |
| `gdb-debug` / `dotnet-debug` | < 30초 | setup-only 패턴 — 타임아웃 문제 없음 |

### 타임아웃 연장 방법

```bash
# 옵션 1: 플러그인 레벨 타임아웃 (모든 스크립트 실행에 적용)
# 단위는 밀리초. 기본값: 600000 (10분)
export TIZEN_TOOL_TIMEOUT=1800000   # 30분

# 옵션 2: MCP/mcporter 호출 타임아웃
export MCPORTER_CALL_TIMEOUT=1800000

# 옵션 3: 호출별 타임아웃 (프로그래밍 방식, opts.timeout)
# 특정 명령어가 커스텀 한도가 필요한 경우 내부적으로 사용
```

> **참고:** SDK 설치의 경우, 타임아웃 연장보다 2단계 패턴이 권장됩니다 —
> 사전 체크는 빠르게(< 60초) 반환되며, 에이전트가 백그라운드에서 실행할
> `suggested_fix.command`를 제공합니다.

## 아키텍처 — vendor copy 없음

이 하네스는 **`vendor/` 스냅샷이 없습니다**:
esbuild가 공유 소스를 직접 번들링합니다.

```
src/               TypeScript 플러그인 셸 (커맨드 엔진 + command-specs/ 도메인별
                   선언적 스펙: sdk, check, project, device, debug, test, certificate —
                   envelope adapter, --schema/--doctor/--capabilities) — ../common/lib/core 필요
../common/lib/     공유 CommonJS 도메인 로직 (단일 소스)
../common/scripts/ 플랫폼 .ps1/.sh 기능 스크립트 → dist/scripts로 복사
skills/            tizen-cli 구동 에이전트용 SKILL.md 31개 (29개 + 우산 라우터 + tizen-list-templates) → dist/skills
```

- `common/lib/core/plugin-cache.js`가 모든 하네스의 `scripts/` 경로를 해석합니다
  (환경 변수 → 번들 옆 → repo/cache 상대 경로 → `.claude/.cline/.codex/.gemini` 캐시 레거시 스캔),
  하네스별 패치가 불필요합니다.
- 플러그인은 tizen-cli 내부에서 **in-process**로 실행됩니다 —
  `process.exit()`를 호출하지 않으며, 실패는 `run()`의 반환값으로 전파됩니다.
- 장시간 SDK 설치는 2단계 패턴을 사용합니다: 빠른 사전 체크; 실패 시
  `errors[0].suggested_fix.command`에 백그라운드 실행용 설치 명령을 포함합니다.

## 빌드

```
cd tizen-cli
pnpm install          # 또는 npm install
pnpm build            # src → dist/tizen-sdk.js 번들링,
                      # plugin.json + ../common/scripts + skills/ 복사,
                      # --schema로 plugin.json "commands" 자동 업데이트
```

`pnpm build`는 먼저 `dist/`를 비우므로, 이전 빌드의 파일(이름이 바뀐 번들, 삭제된
스크립트나 스킬)이 `tizen-cli plugin install dist/`로 흘러들지 않습니다.

> **참고:** pnpm이 선호 패키지 매니저입니다 (ahub CI에서 사용).
> esbuild의 postinstall 스크립트를 허용하기 위해 `pnpm-workspace.yaml`이
> 포함되어 있습니다. npm도 폴백으로 사용 가능합니다.

## 설치 / 재설치

> 플러그인은 `tizen-sdk` 이름으로 등록되며, 중첩 커맨드(`sdk init` / `emulator create`)를
> 쓰던 구 `tizen-sdk` 플러그인을 대체합니다. 구 플러그인이나 이전 `tizen-sdk-skills` 빌드가
> 설치돼 있으면 먼저 제거하세요:
> `tizen-cli plugin uninstall tizen-sdk` / `tizen-cli plugin uninstall tizen-sdk-skills`.

```
tizen-cli plugin install <repo>/tizen-cli/dist
# 수정 후:
pnpm build
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install <repo>/tizen-cli/dist
```

## 미포함 (향후 작업)

- Claude/Cline 전용 레이어 (`../common/agents`, `hooks`, setup 스크립트)는
  이 플러그인에 포함되지 않습니다.
