# tizen-sdk 플러그인 구현 요약

[English](IMPLEMENTATION_SUMMARY.en.md) | 한국어

> 작성일: 2026-07-16
> 대상 저장소: `tizen-cli` (직접 수정)
> 로직 소스: `tizen-sdk-skills` 저장소 루트 (참조만, 수정 없음)

## 1. 개요

이 저장소의 플러그인(Claude Code / Cline 하네스 + `common/` 공유 로직)을
tizen-cli의 **세 번째 하네스**인 정식 플러그인으로 이식했다. 아래 경로는 tizen-cli 저장소 내부 경로이며, 그곳의 플러그인 디렉토리는 원래 이름 `plugins/tizen-sdk-agents/`를 유지한다.

- 기존 `plugins/tizen-sdk` 플러그인은 **유지** — 두 플러그인이 공존한다.
- `.agents/skills`는 새 플러그인 기준의 SKILL.md 15개로 **교체**했다.
- 호출 형태: `tizen-cli tizen-sdk <command> [--options...]`

## 2. 확정된 설계 결정

| 항목                   | 결정                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| 플러그인명             | `tizen-sdk` (구 tizen-sdk 플러그인을 대체, 이전 이름 tizen-sdk-skills)                                                         |
| 커맨드 체계            | **flat 14개** — 소스 저장소의 CLI 러너(`common/lib/cli/*-cli.js`)와 1:1 매핑 (현재 17개, 8장 참고) |
| SKILL.md               | 플러그인 dist에 **동봉** (plugin install이 dist 전체를 복사하므로 함께 배포)                       |
| Claude/Cline 하네스    | 소스 저장소에서 변경 없이 그대로 유지                                                              |

## 3. 커맨드 목록 (이식 시점 14개 — 현재 17개, 8장 참고)

| 커맨드             | 기능                                            | 매핑된 core 함수                                     |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------- |
| `sdk-install`      | Tizen SDK 설치 (빠른 pre-check + suggested_fix) | `installSdk(version, label, force)`                  |
| `sdk-repo-info`    | SDK 패키지 저장소 정보 조회 (공식 CDN·지역 미러, 현재 설정 URL; 사설 미러는 `--repo-url`로 지정) | `getRepoInfo()`                                      |
| `sdk-install-custom-repo` | 사용자 지정 패키지 저장소 URL에서 SDK 설치 (`pkg_list_{OS}-{64,32}` 검증) | `installSdkFromRepo(repoUrl, platformVersion, force)` |
| `validate-repo-url` | URL이 사용 가능한 Tizen 패키지 저장소인지 검증  | `validateRepoUrl(repoUrl)`                           |
| `tv-sdk-install`   | TV SDK 확장(TV-SAMSUNG-Public) 설치             | `installTvSdk(force)`                                |
| `check-node`       | Node.js 설치/PATH 확인                          | `checkNode()`                                        |
| `check-disk-space` | 설치 전 디스크 공간 확인                        | `checkDiskSpace(path, requiredGb)`                   |
| `dotnet-setup`     | .NET SDK 확인 + Tizen 워크로드 설치             | `setupDotnet(force, version)`                        |
| `create-project`   | SDK 템플릿 기반 프로젝트 생성                   | `createProject(type, template, parentPath, appName)` |
| `list-templates`   | 설치된 SDK의 템플릿 목록                        | `listTemplates(type)`                                |
| `build-project`    | 빌드 + 패키징 (.tpk/.wgt)                       | `buildProject(projectPath, buildType, signProfile)`  |
| `device-manager`   | 디바이스 탐색 / 에뮬레이터 생성·기동            | `manageDevice(timeoutSec, vmName)`                   |
| `install-app`      | 패키지 설치 (옵션: 실행)                        | `installApp(packagePath, serial, run)`               |
| `gdb-debug`        | Native 원격 GDB 디버깅 셋업 (setup-only)        | `setupGdbDebug(appId, binaryPath, opts)`             |
| `dotnet-debug`     | .NET netcoredbg 원격 디버깅 셋업 (setup-only)   | `setupDotnetDebug(appId, opts)`                      |
| `update-package`   | 설치된 SDK 패키지 업데이트                      | `updatePackage(force, dryRun)`                       |

필수 옵션은 `.requiredOption()`, 선택지는 `.choices()`로 등록되어
`tizen-cli --schema`에 `required` / `enum` / `default`가 자동 반영된다.
(스키마 생성기는 option만 인트로스펙션하므로 positional 인자는 사용하지 않음)

## 4. 변경/생성된 파일

### 4.1 신규: `plugins/tizen-sdk-agents/` (tizen-cli 저장소)

```
plugin.json                  플러그인 매니페스트 (commands는 빌드 시 --schema로 자동 갱신)
package.json                 deps: commander ^12.1.0 / dev: esbuild, typescript, @types/node
tsconfig.json                스캐폴드 템플릿 준수 (noEmit, strict:false)
esbuild.config.js            src/index.ts → dist/tizen-sdk.js (cjs, node18, minify)
                             + plugin.json/scripts/skills dist 복사 + commands 자동 갱신
README.md                    사용법, 아키텍처, skills 동기화 규칙, 미포함(추후 과제) 항목
src/
  index.ts                   run() 엔트리 — --schema/--doctor/--capabilities/목록/dispatch
  commands.ts                커맨드 등록 엔진 — registerCommand()/buildProgram()
                             (커맨드 정의는 command-specs/에서 가져옴, 아래 8장)
  command-specs/             선언적 커맨드 스펙 (도메인별 모듈)
    types.ts                 OptionSpec/CommandSpec 타입, SERIAL_OPTION, PROJECT_TYPES, sdkCommands
    sdk.ts                   sdk-init, sdk-install, sdk-install-custom-repo, validate-repo-url,
                             sdk-repo-info, tv-sdk-install, tv-sdk-install-from-zip, update-package,
                             download-emulator-package, dotnet-setup
    check.ts                 check-node, check-disk-space (사전 환경 점검)
    project.ts               create-project, list-templates, build-project
    device.ts                device-manager, install-app, sdb-helper, screenshot, file-transfer, remote-device
    debug.ts                 gdb-debug, dotnet-debug
    index.ts                 도메인 배열들을 COMMAND_SPECS로 concat
  envelope-adapter.ts        내부 envelope → tizen-cli envelope 변환 + didFail 플래그
  doctor.ts                  --doctor (6개 체크: Node/scripts/shell/SDK/sdb/em-cli) / --capabilities (SDK 상태 기반)
  lib/core-utils.ts          plugins/tizen-sdk에서 그대로 복사 (인라인 Plugin SDK)
  lib/schema-generator.ts    plugins/tizen-sdk에서 그대로 복사
vendor/
  core/plugin-cache.js       ★ 유일하게 수정한 vendored 파일 (아래 5.1)
  core/{sdk,project,device,dotnet,debug,preflight,output-summary,sdk-commands}.js
                             소스 저장소 common/lib/core/ 그대로 (무수정)
  envelope/{envelope,response-formatter}.js
                             소스 저장소 common/lib/envelope/ 그대로 (무수정)
scripts/                     소스 저장소 common/scripts/ 그대로 (t-cli.ps1/t-cli.sh/T-CLI.md 제외)
                             — 9개 기능 디렉터리 + lib/common.ps1|sh + create-project templates/
skills/                      SKILL.md 15개 (canonical 소스, 아래 4.2)
```

미포함(의도적): `common/lib/cli/*` (process.exit 사용 → commander로 대체),
`lib/tests/`, `envelope-wrapper.js`, `agents/`, `hooks/`, `t-cli.*`

### 4.2 교체: `.agents/skills/`

- **삭제 (7개)**: `tizen-cli`, `tizen-cli-build-project`, `tizen-cli-create-project`,
  `tizen-cli-device`, `tizen-cli-emulator`, `tizen-cli-install-sdk`, `tizen-cli-run-project`
- **추가 (15개)**: 커맨드별 14개 + 우산 스킬 `tizen-sdk`
  - frontmatter의 한/영 트리거 문구·keywords는 소스 저장소 스킬에서 유지
  - 본문은 `tizen-cli tizen-sdk <cmd> --opt` 호출 방식으로 재작성
    (Claude 서브에이전트 위임, Cline 캐시 경로 탐색, `node <runner>.js` 호출 모두 제거)
  - 본문 구조 통일: When to use → Prerequisites → Command → Options 표 → Output → Follow-ups
  - 특수 흐름 보존: sdk-install/tv-sdk-install 2단계 패턴, device/install 600000ms 타임아웃
    가이드, debug 커맨드 setup-only 의미
- **canonical은 `skills/`** — 스킬 변경 시 `.agents/skills/`에 재동기화 필요

### 4.3 수정: 루트 `package.json`

- `"build:tizen-sdk-agents": "cd plugins/tizen-sdk-agents && node esbuild.config.js"` 추가
- `build:all`: `plugin-sdk → tizen-sdk(구) → tizen-sdk → core` 순서로 갱신

## 5. 핵심 이식 포인트

### 5.1 스크립트 경로 해석 (`vendor/core/plugin-cache.js` — 유일한 수정)

원본은 `~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/`을 버전 스캔했다.
tizen-cli에서는 `plugin install`이 dist 전체를 `~/.tizen/plugins/tizen-sdk/`로 복사하므로
**번들 옆의 `scripts/`를 `__dirname` 기준으로 해석**하도록 변경했다
(`TIZEN_SDK_SKILLS_ROOT` 환경변수로 오버라이드 가능).

export 이름(`findLatestVersionDir`, `resolveScript`, `execPluginScript`)을 유지해
이를 직접 호출하는 `debug.js`를 포함한 나머지 core 모듈은 **무수정**으로 동작한다.
`execPluginScript`(captureViaTempFile, chcp 65001, -ExecutionPolicy Bypass, 64MB maxBuffer)는
바이트 단위로 동일하게 유지했다 — captureViaTempFile은 에뮬레이터/gdbserver 등
장수명 자식 프로세스로 인한 execSync 행(hang) 방지 장치이므로 단순화 금지.

### 5.2 envelope 어댑터 (`src/envelope-adapter.ts`)

| 내부 envelope (소스 저장소)                  | tizen-cli envelope                                        |
| -------------------------------------------- | --------------------------------------------------------- |
| `status: 'success'`                          | `'success'`                                               |
| `status: 'failure'` / `'error'` / 기타       | `'failure'`                                               |
| `errors[].error_code` (+ `code` 폴백)        | `errors[].error_code` (없으면 `EXECUTION_ERROR`)          |
| `error_category`, `suggested_fix`, `details` | 패스스루                                                  |
| `command`, `duration_ms`                     | 최상위 추가 정보 필드로 유지 (Core는 run() 반환값만 판정) |

### 5.3 in-process 안전성 (process.exit 금지)

tizen-cli Core는 플러그인 번들을 **in-process `require()`** 후 `await plugin.run(args)`한다.
소스 저장소의 `cli-runner.js`는 `process.exit()`를 호출하므로 사용하지 않고,
`execute()` 헬퍼가 envelope 출력 + `didFail` 플래그 기록 → `run()`이
`{status: 'success'|'failure'}`를 반환해 exit code(0/1)로 매핑된다.
vendored core/envelope 모듈에는 process.exit가 없음을 grep으로 확인했다.

### 5.4 장시간 설치의 2단계 패턴 (소스 설계 계승)

`sdk-install`/`tv-sdk-install`은 **빠른 pre-check 전용**이다. 미설치 시 failure envelope의
`errors[0].suggested_fix.command`에 바로 실행 가능한 installer 명령이 담기며,
에이전트가 이를 background로 실행 후 재확인한다. (JSON-only stdout과 10~15분 설치의 충돌 없음)

**하네스별 실행 방법:**

- **Claude Code**: `run_in_background: true` → `<task-notification>` 대기 → 검증
- **Cline**: `--detach` (Linux/macOS) / `-Detach` (Windows)로 프로세스 분리 → `--status` / `-Status`로 60초마다 폴링 → `STATUS=done` 시 검증
  - Cline은 백그라운드 10분 타임아웃이 있으므로 `run_in_background: true` 사용 금지
  - 포그라운드 실행 시 121개 패키지 로그가 컨텍스트 윈도우를 소모하므로 비권장

## 6. 검증 결과 (모두 통과, Windows)

| 검증 항목                                                | 결과                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm/npm install` + `npm run build`                     | 번들 82.4KB, plugin.json commands 12개 자동 갱신                                                                    |
| in-process 스모크 (`node -e "require(...).run([...])"`)  | check-node success / build-project 필수옵션 누락 → failure envelope 반환 후 **run() 정상 반환** (process.exit 없음) |
| `tizen-cli plugin install dist`                          | `~/.tizen/plugins/tizen-sdk/`에 번들+plugin.json+scripts+skills 설치                                         |
| `tizen-cli plugin list`                                  | tizen-sdk 0.1.0, 커맨드 12개                                                                                 |
| `tizen-cli tizen-sdk check-node`                  | success envelope, exit 0                                                                                            |
| `... build-project` (옵션 누락)                          | failure envelope, exit 1                                                                                            |
| `... sdk-install`                                        | 설치된 SDK 감지 (sdk.info) → success + 안내 warning                                                                 |
| `... list-templates --type webapp`                       | **실제 .ps1 실행** → `{"webapp":["Basic","WebService"]}` — 설치 위치 기준 스크립트 해석 전 구간 동작                |
| `tizen-cli --schema`                                     | 12개 flat 커맨드 + required/enum/default 반영                                                                       |
| `tizen-cli doctor`                                       | 플러그인 체크 6종(Node/scripts/shell/SDK/sdb/em-cli) 통합 표시 — em-cli 체크는 `em-cli list-vm` 프로브로 Java/JNA 런타임 문제를 사전 감지 (issue #40)  |
| `tizen-cli tizen-sdk --doctor` / `--capabilities` | 정상 (SDK 설치 시 12개 전부 available)                                                                              |

수정 후 재적용 절차:

```
cd plugins/tizen-sdk-agents
pnpm run build
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install <repo>/dist
```

## 7. 참고 / 미해결 사항 (팀 가이드 '세부사항' 기재용)

- **자체 SKILL.md 보유: 예 (15개 동봉)** — MCP tools/list 미지원 대비 Tool search용. 팀 표에 마킹 필요.
- **skills 이중 위치**: canonical `skills/` ↔ `.agents/skills/` 수동 동기화.
  추후 sync 스크립트 후보.
- **기존 tizen-sdk 플러그인과 기능 중복** (build/create/device 등): 우산 스킬에서
  현재 플러그인(tizen-sdk, 구 tizen-sdk-skills) 우선 라우팅을 명시해 혼용 방지.
- **PATH의 tizen-cli 주의**: 개발 머신에 전역 설치된 `tizen-cli`는 별개 도구
  (`@monorepo/tizen-sdk-cli`, SDK Server 클라이언트)여서 `plugin` 명령이 없음.
  검증은 저장소 빌드본(`node <repo>/dist/cli.js`)으로 수행 — 실사용 시 install 스크립트
  재실행 또는 PATH 정리 필요.
- **회사 프록시 환경의 TLS**: 의존성 설치 시 `npm install --strict-ssl=false`가 필요했음
  (명령 단위 한정, 전역 설정 미변경).
- `envelope.js` / `envelope-wrapper.js` / `sdk.js`의 `suggested_fix` 명령은 구 플러그인의
  중첩 문법(`tizen-cli tizen-sdk emulator start` 등)이었으나, 2026-09 플러그인 이름 변경 시
  현재 플러그인의 flat 명령(`launch-emulator`, `sdk-init` 등)으로 모두 갱신했다.

## 8. 커맨드 정의 구조 리팩토링 (2026-07-28)

> 이 문서의 1~7장은 최초 이식(2026-07-16) 시점의 기록이다. 이후 커맨드가 17개로
> 늘었고(sdk-init, sdb-helper, screenshot, file-transfer 추가), 커맨드 정의 구조가
> 아래와 같이 리팩토링되었다 (PR #59).

### 8.1 데이터 기반 커맨드 등록

`src/commands.ts`의 거의 동일한 Commander 빌더 체인 17개를 선언적
`COMMAND_SPECS: CommandSpec[]` 배열 + `registerCommand()` 등록 루프로 교체했다.

- 각 커맨드는 `{ name, description, options, handler }` 스펙 하나로 정의 —
  handler는 공유 코어 함수(`common/lib/core/sdk-commands`)를 호출하는 한 줄 매핑
- `registerCommand()`가 실제 Commander `Option` 객체(`choices`/`default`/
  `makeOptionMandatory`)를 등록하므로 `schema-generator.ts`의 런타임 스키마
  introspection(3장 참고)이 그대로 동작 — 리팩토링 전후 17개 커맨드의
  `--schema` 출력이 커맨드 단위로 동일함을 검증
- create-project의 "누락된 필수 옵션을 한 번에 모두 보고" 동작은
  `collectAllMissing` 플래그로 일반화 (동일한 error_code/메시지 형식)
- `src/index.ts`의 `COMMANDS` 목록은 하드코딩 대신
  `getCommandNames(buildProgram())`으로 파생 — 실제 등록 커맨드와 어긋날 수 없음

### 8.2 도메인별 스펙 모듈 분리

`commands.ts`는 엔진 전용(약 100줄)이 되고, 스펙은 `src/command-specs/`에
기능 도메인별로 배치했다. 커맨드 추가 = 해당 도메인 파일에 스펙 하나 추가.

| 모듈         | 커맨드 (17개)                                                       |
| ------------ | ------------------------------------------------------------------- |
| `sdk.ts`     | sdk-init, sdk-install, sdk-install-custom-repo, validate-repo-url, sdk-repo-info, tv-sdk-install, tv-sdk-install-from-zip, update-package, download-emulator-package, dotnet-setup |
| `check.ts`   | check-node, check-disk-space                                        |
| `project.ts` | create-project, list-templates, build-project                       |
| `device.ts`  | device-manager, install-app, sdb-helper, screenshot, file-transfer, remote-device |
| `debug.ts`   | gdb-debug, dotnet-debug                                             |

`check` 도메인은 `--doctor` 메타 커맨드 핸들러(`src/doctor.ts`)와의 혼동을 피해
"doctor" 대신 `check-*` 커맨드 이름과 일치하는 이름을 사용했다.

### 8.3 커맨드 명명 규칙

- **기존 이름은 유지** — create-project 등 액션-도메인 형태의 기존 이름은 문서,
  SKILL.md, 사용자 스크립트, MCP 툴 이름(스키마 생성기에서 파생)이 의존하는
  공개 인터페이스이므로 리네임하지 않는다.
- **신규 커맨드는 도메인-액션** — `<domain>-<action>` (예: `project-create`,
  `app-install`) 형식을 적용한다. `command-specs/index.ts` 헤더 주석에 명문화.

## 9. Platform 프로젝트 생성 및 RPM 설치 개선 (2026-07-28)

### 9.1 템플릿 이름 자동 치환 (`create-project-app.sh`)

`dali_demo` 플랫폼 템플릿은 기본 이름 `dali-demo`를 CMakeLists.txt, `.spec` 파일 등에
하드코딩하고 있다. 사용자가 `--name`으로 다른 프로젝트 이름을 지정하면, 생성 스크립트가
자동으로 다음 치환을 수행한다:

1. **CMakeLists.txt** — `dali-demo` → `<project-name>` 전역 치환 (CMake 타겟명, 바이너리명)
2. **packaging/`dali-demo.spec`** — 내용 치환 후 `<project-name>.spec`으로 rename
3. **기타 텍스트 파일** (`.txt`, `.cmake`, `.yaml`, `.json`, `.md`, `.spec`) — `dali-demo` → `<project-name>` 치환

이를 통해 사용자는 템플릿 이름에 구애받지 않고 원하는 이름으로 GBS 빌드 및 RPM 패키지를
생성할 수 있다. 예: `--name my-app` → `my-app-1.0.0-1.x86_64.rpm`

또한 "Next steps" 메시지에서 `.tpk`를 `RPM`으로 수정하여 플랫폼 앱의 실제 산출물 형식을
정확히 반영했다.

### 9.2 RPM 앱 rerun 스크립트 자동 생성 (`tizen-install-app.sh`)

Platform (RPM) 앱은 `app_launcher`에 등록되지 않아, 앱이 종료된 후(예: Back 키) 디바이스
홈 화면에서 재실행할 수 없다. 이를 해결하기 위해 `install-app` 명령이 RPM 패키지 설치 후
호스트에 `~/bin/run-<app-name>.sh` 재실행 스크립트를 자동으로 생성한다.

**스크립트 기능:**

- 디바이스 자동 감지 (또는 시리얼 인자로 지정)
- root 권한 획득 (`sdb root on`)
- owner 사용자를 display 그룹에 추가 (Wayland 소켓 접근)
- 디바이스에 런처 스크립트 작성 (Wayland 환경 변수, nohup setsid 실행)
- owner 사용자(uid 5001)로 앱 실행 (`su - owner`)
- 프로세스 실행 확인 (`pgrep`)

**사용 예:**

```bash
# 앱 재실행 (RPM 재설치 불필요)
~/bin/run-dali-demo.sh
```
