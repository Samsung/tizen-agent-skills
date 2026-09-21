# RDS / Fast Deploy — 투명한 통합 계획

[English](RDS_FAST_DEPLOY_PLAN.en.md) | 한국어

> **상태**: 완료
> **날짜**: 2026-09-09
> **저장소**: `tizen-sdk-skills`(구현), `Tizen.Extension.V2`(참조: `main` 브랜치)

## 목표

AI 에이전트가 RDS(Rapid Development Support) / Fast Deploy를 활용해 반복 검증을 더 빠르게 하되, 그 과정이 **투명**해야 한다. 에이전트에게는 새 명령도, 새 스킬도, 워크플로 변경도 보이지 않는다. RDS 로직은 `project.js`의 기존 `buildProject()`와 `installApp()` 함수 안에 통합된다.

## 배경

RDS는 이미 `Tizen.Extension.V2`의 `main` 브랜치에 구현되어 있다. 전체 build→install→launch 사이클 대신 변경된 파일(delta)만 배포해 반복 시간을 5–30초에서 2초 미만으로 줄인다.

서버 구현은 `packages/server/src/features/rds/` 아래 12개 TypeScript 모듈에 있지만, 포팅에는 그 폴더 밖의 코드도 필요하다:

| 위치 | 내용 |
|------|------|
| `packages/server/src/features/rds/` | 핵심 모듈 12개 |
| `packages/shared/src/types/rds-interest.types.ts` | `DEFAULT_IGNORE_LIST`, `DEFAULT_INPUT_IGNORE_PATTERNS`, `DEFAULT_OUTPUT_INTEREST_LIST` |
| `packages/server/src/features/rds/reconcile-service.ts:24` | `DRIFT_THRESHOLD = 0.5` |
| `packages/server/src/features/project-manager/utils/project-utils.ts` | `ProjectUtils.isWebProject/isNativeProject/isDotNetProject` — `detectAppType()`의 근거 |
| `packages/server/src/features/project-manager/usecases/run-project-no-chain.ts` | `runNoChain()` — 두 RDS 분기 모두가 쓰는 앱 실행 |
| `packages/server/src/shared/sdb-executor.ts` | `SdbExecutor` |

`tizen-sdk-skills` 저장소는 독립 CLI 명령(`tz build`, `sdb push`, `tz install`)으로 동작하며 서버 REST API를 호출하지 않는다. 이 계획은 RDS 로직을 JavaScript로 포팅해 기존 플러그인 명령에 투명하게 통합한다.

## 아키텍처

```
Agent:  build-project  →  install-app --package <tpk> --run
            ↓                    ↓
      buildProject()        installApp()
       ┌──────────┐         ┌─────────────────────┐
       │ BUILD    │         │ eligible?           │──no──┐
       │ (tz/pack)│         │ (rds on, not GBS,   │      │
       │ save     │         │  tpk/wgt, 1 device) │      │
       │ build-   │         └─────────────────────┘      │
       │ manifest │              ↓ yes                   │
       │ (if RDS  │         ┌─────────────────────┐      │
       │  state)  │         │ reconcile()         │      │
       └──────────┘         │  → changelist       │      │
                            │  → rdsStatus        │      │
                            └─────────────────────┘      │
                                 ↓ rds / fast-deploy     │ full
                            ┌─────────────────────┐      │
                            │ tryRdsDeploy()      │──ok──┼→ return
                            └─────────────────────┘      │
                                 ↓ fail                  │
                            ┌─────────────────────┐      │
                            │ full install        │←─────┘
                            │ + updateRdsState    │
                            └─────────────────────┘
```

**`isBuildNeeded()`도, 빌드 중 플래그도, 입력 변경 추적기도, snapshot/restore도 없다.** CLI 에이전트는 항상 설치 전에 빌드한다 — 그것이 기존 흐름이다. RDS는 *설치* 단계만 빠르게 만든다.

---

## Part 0: 하드 제약 — 플러그인 경로에 npm 의존성 금지

이 제약이 다른 모든 결정을 좌우하므로 먼저 둔다.

오늘날 `common/lib/**`에는 서드파티 require가 **하나도** 없다 — 모든 모듈이 Node 내장 모듈만 쓴다. 우연이 아니다:

- [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json)은 `"source": "./common"`을 배포한다. 플러그인은 `~/.claude/plugins/…`(그리고 `~/.cline`, `~/.codex`, `~/.gemini`)로의 **디렉터리 그대로 복사**다.
- `common/`에는 `package.json`이 전혀 없으므로 `node_modules`가 존재할 수 없다.
- 스킬은 이를 raw Node로 호출한다: `node "$CLI" install --package …` ([`common/skills/tizen-install-app/SKILL.md:40`](../../common/skills/tizen-install-app/SKILL.md#L40)).

`tizen-cli/package.json`에 의존성을 추가해도 esbuild로 번들되는 `tizen-cli` 경로에만 도움이 된다. 주 에이전트 경로에서는 `require("yaml")`이 `MODULE_NOT_FOUND`를 던진다. [`.nvmrc`](../../.nvmrc)는 Node **20**을 고정하므로 `fs.glob`(Node 22+)도 대안이 될 수 없다.

**따라서: RDS가 필요로 하는 모든 것은 Node 내장 모듈이거나 `common/lib/vendor/` 아래에 vendoring된 파일이어야 한다.** 각 항목의 해결책은 [Part 6](#part-6-vendored-dependencies)을 보라 — 네 가지 모두 해결되었고, 확장과의 해시 일치는 실측으로 검증했다.

---

## Part 1: `buildProject()` — 빌드 후 `build-manifest.json` 기록

**파일**: `common/lib/core/project.js` — `buildProject()` 수정(시그니처는 800행)

`buildProject()`는 return 지점이 6개쯤 있는 하나의 `try/catch`이며, 성공 값은 [`project.js:958`](../../common/lib/core/project.js#L958)의 `formatProjectBuild(...)`가 만든다. **훅은 그 return 바로 앞에 들어간다.** 그래서 모든 실패 경로는 구조상 자동으로 건너뛰며 `status` 검사가 필요 없다:

```javascript
    // ── RDS: write build-manifest.json after a successful build ──
    // Gated: only for projects that already carry RDS state. A project that has
    // never been deployed has nothing to interop with, and the scan is not free.
    if (rdsEnabled() && rdsStateExists(normalizedProjectPath)) {
      try {
        const appType = detectAppType(normalizedProjectPath); // null for GBS/platform
        if (appType) {
          saveBuildManifest(normalizedProjectPath, {
            projectDir: normalizedProjectPath,
            timestamp: new Date().toISOString(),
            hashAlgorithm: "xxh3-128",
            input: await scanInputFilesAsync(normalizedProjectPath, appType),
            output: await scanOutputFilesAsync(normalizedProjectPath, appType),
          });
        }
      } catch (err) {
        // Non-fatal — the build did succeed.
        console.warning("[RDS] Failed to write build-manifest:", err.message);
      }
    }

    return formatProjectBuild(artifacts, summarizeBuildOutput(output), startTime);
```

### 게이팅 근거

- **`rdsStateExists()`** — `.tizen-rds/`는 첫 배포 이후에만 존재한다. 그 전에는 manifest가 보완할 baseline이 없고, 확장의 `isBuildNeeded()`도 자체 첫 실행 분기에서 올바르게 `true`를 반환한다. 이 게이트가 있어야, 빌드만 하는 프로젝트의 매 빌드마다 전체 입력+출력 해시가 돌지 않는다.
- **`detectAppType()`이 `null`을 반환** — Part 4 참조. 서버 버전은 *절대* 실패하지 않고 `'native'`를 기본값으로 쓰는데, GBS/플랫폼 프로젝트에 대해 쓰레기 manifest를 만들게 된다. CLI 포팅은 대신 `null`을 반환해야 하며, 모든 RDS 진입점은 `null`이면 건너뛴다.

**왜 `build-manifest.json`인가?** 이후에 VS Code 확장이 실행될 경우 방금 빌드가 있었음을 보고 자체 `isBuildNeeded()` 검사를 건너뛸 수 있게 하기 위해서다. 이는 프로세스 경계를 넘어 동작한다: `isBuildNeeded()` level 3은 디스크에서 `loadBuildManifest()`를 호출해 baseline과 병합한다(`baseline-manager.ts:846-852`). manifest의 키 공간이 일치할 때만 — 같은 상대 경로, 같은 interest list, 같은 ignore 패턴 — 동작하므로, 스캐너는 근사치가 아니라 충실하게 포팅해야 한다.

---

## Part 2: `installApp()` — RDS 배포

**파일**: `common/lib/core/project.js` — `installApp()` 수정(시그니처는 1126행)

**아키텍처 노트**: `installApp()`은 SDB를 직접 호출하지 않는다 — `resolveScript("tizen-install-app")`을 호출한 뒤 `execPluginScript()`로 쉘 스크립트를 실행한다. RDS는 스크립트 호출 **이전**에 개입해야 한다.

### 2a. 디바이스 serial 결정

`deviceSerial`은 선택 항목이고 보통 없다 — 문서화된 호출은 `install --package <tpk>`이며 쉘 스크립트가 자동 선택한다. 그대로 두면 RDS가 두 번 깨진다: `state.devices[undefined]`가 `no-device-state`를 내서 RDS가 절대 동작하지 않고, fallback `updateRdsState(projectDir, undefined, "full")`은 `deploy-state.json`에 문자열 `"undefined"` 디바이스 키를 쓴다.

**쉘 스크립트가 아니라 JS에서 결정한다.** 스크립트의 디바이스 없음 분기는 device manager를 호출해 에뮬레이터를 생성/실행한다([`tizen-install-app.sh:549`](../../common/scripts/tizen-install-app/tizen-install-app.sh#L549)); 이를 두 번째 스크립트에 복제하면 유지보수 함정이 된다. 대신 [`sdb.js`](../../common/lib/core/sdb.js)에 이미 있는 것을 쓴다 — `resolveSdbBinary()` + `runSdb(sdbPath, "devices")` + `parseDevices()`:

| `sdb devices` 결과 | 동작 |
|---|---|
| 온라인 디바이스 정확히 1대 | 그 serial을 RDS에 쓰고, **동시에** 설치 스크립트에 `-s <serial>`을 넘겨 두 경로가 같은 디바이스를 대상으로 하게 한다 |
| 0대 | RDS 건너뜀; 스크립트가 에뮬레이터를 자동 준비하게 둔다 |
| 2대 이상이고 명시적 `--device` 없음 | RDS 건너뜀; 스크립트의 기존 "serial을 지정하라" 오류를 그대로 보고하게 둔다 |

full install fallback에서는 스크립트가 출력하는 `Device Serial:` 줄에서 serial을 얻는다 — `installApp()`이 [`project.js:1300`](../../common/lib/core/project.js#L1300)에서 이미 파싱한다 — undefined일 수 있는 파라미터에서 얻지 않는다.

### 2b. 적용 조건 게이트

다음 중 하나라도 해당하면 RDS는 시도조차 없이 조용히 건너뛴다:

- `TIZEN_RDS_ENABLED=0` ([Kill switch](#kill-switch-and-reset) 참조)
- `isPlatformProject(projectDir)` — GBS/플랫폼 프로젝트는 `sdb push` + `rpm -ivh`로 시스템 경로에 설치된다. 앱별 `rds_info` 디렉터리도 `tpk_contents`도 없어 RDS가 다룰 대상이 없다.
- 패키지 확장자가 `.rpm` 또는 `.rpk` — RPM은 위의 플랫폼 케이스; RPK 리소스 패키지는 실행할 앱이 없고 [`project.js:1158`](../../common/lib/core/project.js#L1158)에서 이미 `--run`이 거부된다.
- `detectAppType(projectDir)`이 `null` 반환
- 디바이스 serial 미결정(2a)
- `rdsStateExists(projectDir)`이 false — 첫 배포이므로 full install이어야 한다

### 2c. 흐름

```javascript
    // ── existing validation (unchanged, through the resolveScript call) ──

    const projectDir = resolveProjectDirFromPackage(resolvedPath);
    const serial = resolveSingleDeviceSerial(deviceSerial); // §2a — may be null
    let rdsResult = null;

    if (serial && rdsEligible(projectDir, resolvedPath)) {          // §2b
      try {
        rdsResult = await tryRdsDeploy(projectDir, serial, runAfterInstall);
      } catch (err) {
        console.error("[RDS] deploy attempt failed:", err.message);  // → full install
      }
    }

    if (rdsResult && rdsResult.deployed) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success({
        package_path: resolvedPath,
        device_serial: serial,
        app_id: rdsResult.appId ?? null,
        installation_status: "completed",
        app_launched: Boolean(rdsResult.launched),
        app_running: null,             // no app_launcher -S check on this path
        deploy_type: rdsResult.type,   // "rds" | "fast-deploy" | "full"
      }, { warnings: [] });
    }

    // ── EXISTING FULL INSTALL LOGIC (unchanged) ──
    // execPluginScript(resolved.scriptPath, winArgs, unixArgs, { captureViaTempFile: true })
    // … through the success-marker parsing at project.js:1283-1308 …

    // ── RDS: update state after successful full install ──
    // Uses the serial the script reported, not the input parameter.
    const installedSerial = serialMatch ? serialMatch[1].trim() : serial;
    if (projectDir && installedSerial && rdsEligible(projectDir, resolvedPath)) {
      await updateRdsState(projectDir, installedSerial, "full").catch(() => {});
    }
```

[`project.js:1319`](../../common/lib/core/project.js#L1319)의 기존 성공 envelope에 `deploy_type: "full"`이 추가되어 두 경로가 하나의 동일한 형태를 반환한다.

`deploy_type`은 추가되는 **유일한** 필드다. RDS가 동작하고 있는지를 알 수 있는 유일한 신호이기 때문에 자격이 있다 — ignore 리스트가 어긋나거나 marker 검사가 실패하기 시작하면 모든 설치가 조용히 full install로 떨어지는데, 아무도 재지 않는 소요 시간 차이 외에는 이를 드러내는 것이 없다. `files_pushed` 카운트도 검토했지만 기각했다: 아무것도 그 값으로 분기하지 않고, `fast-deploy`와 `full` 모두 `0`이라 `deploy_type`이 구별하지 못하는 것을 구별하지도 못한다. delta 파일 수는 원래 자리 — 기존 `[RDS] N delta file(s) to push` stderr 줄 — 에 남는다.

**RDS 경로의 `app_id`**: `getRdsInfoPath()`가 이미 패키지 ID를 결정한다(`parseManifestPackageId()` / `parseWebPackageId()`). 거기서 앱 ID를 저렴하게 얻을 수 없으면 `null`을 반환한다 — 이 필드는 [`project.js:1325`](../../common/lib/core/project.js#L1325)에서 이미 nullable이다.

### 2d. `tryRdsDeploy()` 흐름 — 서버와 다른 점

서버의 `tryRdsDeploy(projectDir, deviceSerial)`은 인자가 **둘**이고 두 분기 모두에서 **항상** `runNoChain()`으로 실행한다. 또한 **`reconcile()`을 절대 호출하지 않는다** — 서버에서는 VS Code 파일 watcher가 `POST /rds/changes` → `addChanges()`로 changelist를 채운다([`rds-routes.ts:110`](../../../Tizen.Extension.V2/packages/server/src/routes/v1/rds-routes.ts#L110)).

**CLI에는 파일 watcher가 없다.** 그대로 포팅하면 매번 `deltaEntries.length === 0`이 되어 fast-deploy 분기를 타고 변경 파일을 하나도 push하지 않는다. 그래서 CLI 래퍼가 reconcile을 직접 구동해야 한다 — watcher가 없는 세계에서 changelist를 쓰는 것은 `reconcile()`이다([`reconcile-service.ts:183`](../../../Tizen.Extension.V2/packages/server/src/features/rds/reconcile-service.ts#L183)).

CLI 실행 순서:

1. RDS 상태 로드 → 디바이스 상태 존재 확인
2. SDB로 디바이스 marker 읽기 → deploy ID 검증(`marker.deployId > lastDeployId` → full install로 회귀)
3. **`reconcileDetailedAsync(projectDir)`** — 출력을 스캔해 `baseline-manifest.json`과 비교하고, drift를 `replaceNextChanges()`로 `changelist.json`에 쓴 뒤(CLI는 매번 전체 delta를 다시 계산하므로 `next`는 append가 아니라 교체), `{ rdsStatus, driftRatio, currentManifest }`를 반환한다. `tizen-manifest.xml`/`config.xml`이 delta에 포함되면 항상 `full`.
4. `rdsStatus === "full"`(baseline 없음, 또는 drift > `DRIFT_THRESHOLD`) → `{deployed: false}` 반환 → full install
5. `getDeltaForDevice()` → `resolveDevicePaths()`
6. delta 없음 → fast-deploy; delta 있음 → `pushDeltaFiles()`
7. **`runAfterInstall`일 때만** 실행 — 아니면 `runNoChain()`을 건너뛴다. `syncDeployState()`는 어느 경우든 실행된다: 앱을 재실행했든 아니든 디바이스 *파일*은 이제 새 baseline과 일치하므로, 상태 동기화를 건너뛰면 `deploy-state.json`이 영구히 뒤처진다.
8. `syncDeployState()` — baseline 저장, marker + snapshot push, `promoteNextGroup()`, 상태 커밋, `clearBuildManifest()`

`determineRdsStatusByRatio(buildNeeded, driftRatio)`는 항상 `buildNeeded = false`로 호출된다; `'build-needed'` 상태는 CLI 경로에서 절대 발생하지 않는다.

### 2e. reconcile과 sync 사이에서 스캔 재사용

`compareCurrentAgainstStored()`는 이미 `generateBaselineManifest(projectDir, ignoreList, nextDeployId)`로 완전한 현재 manifest를 만든다([`baseline-manager.ts:353`](../../../Tizen.Extension.V2/packages/server/src/features/rds/baseline-manager.ts#L353)) — 이는 `syncDeployState()`가 몇백 밀리초 뒤에 같은 `nextDeployId`로, 디스크에 아무 변화도 없는 상태에서 처음부터 다시 만드는 것과 *정확히* 같다.

**CLI 포팅은 그 manifest를 관통시켜야 한다**: `reconcileDetailedAsync()`가 반환하고, `syncDeployState()`가 선택 인자로 받아 없을 때만 재생성한다. 이로써 배포당 전체 트리 해시 한 번이 사라진다.

빌드와 설치는 별개 프로세스라 빌드 시 스캔(Part 1)은 어느 쪽과도 공유할 수 없다 — 그것은 단독으로 남는다.

---

## Part 3: `build-manifest.json` 생명주기

```
buildProject()  →  build succeeds  →  WRITE build-manifest.json (if .tizen-rds/ exists)
                                          ↓
installApp()    →  tryRdsDeploy()   →  deploy succeeds
                     ↓                    ↓
                  syncDeployState()  →  DELETE build-manifest.json
                                        (baseline-manifest.json is now authoritative)
```

서버에서 이 삭제는 *간접적으로* 일어난다: `syncDeployState()`가 `clearInputChanges()`를 호출하고, 그 마지막 문장이 `clearBuildManifest()`다([`baseline-manager.ts:633-638`](../../../Tizen.Extension.V2/packages/server/src/features/rds/baseline-manager.ts#L633-L638)). 이 포팅은 메모리 내 입력 추적기를 통째로 버리므로 `clearInputChanges()`에는 할 일이 남지 않는다 — **CLI의 `syncDeployState()`는 `clearBuildManifest(projectDir)`를 직접 호출한다.** 디스크상 관찰되는 효과는 같고 간접 계층은 하나 줄어든다.

배포가 실패해 full install로 넘어가면 → `updateRdsState()` → `syncDeployState()` → 역시 `build-manifest.json`을 삭제한다.

빌드가 실패하면 → `build-manifest.json`은 쓰이지 않는다(훅이 마지막 실패 return 뒤에 있다). 이전 빌드의 낡은 파일은 다음 성공 배포가 지울 때까지 남는다 — 빌드 실패가 manifest를 건드리지 않는 서버 동작과 같다.

---

## Part 4: RDS 핵심 라이브러리 — `common/lib/core/rds/`

단순화된 집합 — `isBuildNeeded()` 없음, 메모리 내 추적기 없음, 플래그 없음:

| 파일 | 서버 원본 | 역할 |
|------|-----------|------|
| `constants.js` | `packages/shared/…/rds-interest.types.ts` + `reconcile-service.ts:24` | `DEFAULT_IGNORE_LIST`, `DEFAULT_INPUT_IGNORE_PATTERNS`, `DEFAULT_OUTPUT_INTEREST_LIST`, `DRIFT_THRESHOLD=0.5` |
| `hash.js` | `baseline-manager.ts:94-112` | vendoring된 `xxhash128`로 XXH3-128. `computeFileHash(path)` → 32자 hex. **비동기 전용**(Part 6) |
| `app-type-detector.js` | `baseline-manager.ts:detectAppType` + `project-manager/utils/project-utils.ts` | native/web/dotnet 감지. 플랫폼/GBS/미확인이면 `'native'` 기본값 대신 **`null` 반환** |
| `yaml-reader.js` | `project-yaml-reader.ts` | interest list + ignore 패턴용 `tizen_*_project.yaml` 파싱 |
| `tpk-contents-parser.js` | `tpk-contents-parser.ts` | `Debug/tpk_contents` 파싱 |
| `input-scanner.js` | `input-scanner.ts` | 소스 파일 스캔, 전부 해시 → `Record<relPath, {hash}>`(`*Async` 변형 포팅) |
| `output-scanner.js` | `output-scanner.ts` | 빌드 출력 파일 스캔, 전부 해시 → `Record<relPath, {hash}>`(`*Async` 변형 포팅) |
| `forward-scan-composer.js` | `forward-scan-composer.ts` | 순수 함수: `computeDelta()`, `composeChanges()` |
| `state-manager.js` | `rds-state-manager.ts` | 상태 파일 4개 로드/저장. `addChanges()`, `getDeltaForDevice()`, `promoteNextGroup()`, `pruneOldDeploys()`, `getOrCreateState()`, `resetAllRdsState()`, `resetDevice()`, `saveBuildManifest()`, `loadBuildManifest()`, `clearBuildManifest()` |
| `baseline-manager.js` | `baseline-manager.ts`(단순화) | `generateBaselineManifestAsync()`, `compareAgainstBaseline()`, `compareCurrentAgainstStoredAsync()`(**재사용을 위해 현재 manifest 반환 — §2e**), `getIgnoreList()`, `prefixIgnorePatterns()`. **`isBuildNeeded()` 없음, 추적기 없음, 플래그 없음.** |
| `reconcile-service.js` | `reconcile-service.ts`(단순화) | `reconcileDetailedAsync()` — 출력과 baseline 비교, changelist 기록, 배포 유형 결정. `isBuildNeeded`는 `false`로 고정. |
| `device-path-resolver.js` | `rds-deploy-service.ts:resolveDevicePaths`(+ `resolveNativeDevicePaths`, `resolveWebDevicePaths`, `resolveDotnetDevicePaths`, `stripNativePrefix`) | 호스트→디바이스 경로 매핑 |
| `app-install-path.js` | `rds-deploy-service.ts:getRdsInfoPath`(+ `parseWebPackageId`, `findManifestPath`, `parseManifestPackageId`) | 디바이스상 `rds_info` 디렉터리와 패키지 ID 결정. **모듈 수준 `rdsInfoPathCache`는 제거** — CLI 호출마다 새 프로세스라 캐시가 맞을 일이 없다. |
| `launch.js` | `project-manager/usecases/run-project-no-chain.ts` | `runNoChain()` 대응 — 재빌드 없이 앱 실행. 서버에서는 `rds/` 폴더 밖이지만 `tryRdsDeploy`는 이것 없이 동작할 수 없다. |
| `deploy-service.js` | `rds-deploy-service.ts` | `tryRdsDeploy()`, `updateRdsState()`, `pushDeltaFiles()`(단순 `sdb push`가 아니라 hardlink/tmpdir staging 사용), `readDeviceMarker()`, `pushDeviceMarkerAndSnapshot()`, `syncDeployState()` |
| `index.js` | — | 재export |

### 의도적으로 포팅하지 않은 것

- `classification-cache.ts` — watcher 쪽 인프라. 컴파일된 ignore 매처는 여전히 필요하므로, 매처 생성 로직만 `output-scanner.js` / `baseline-manager.js`에 일반(비캐시) 함수로 가져온다. 프로세스별 캐시는 여기서 아무 이득이 없다.
- `rds-flush-coordinator.ts`, `rds-runtime-config.ts` — watcher debounce와 서버 런타임 설정; CLI 대응물이 없다.
- `isBuildNeeded()`와 메모리 내 추적기 일족 전체(`pendingInputChanges`, `buildCompletedFlags`, `inBuildFlags`, `snapshotAndClearInputChanges()`, `restoreInputChanges()`, `markBuildCompleted()`, `accumulateBuildHashes()`) — [범위 밖](#out-of-scope) 참조.
- 모든 동기 스캐너 변형 — Part 6이 해시를 비동기로 만든다.

---

## Part 5: SDB 확장 — `common/lib/core/sdb-helper.js`

**노트**: SDB 명령 실행은 `runSdbCommand()`가 이미 있는 `sdb-helper.js`에 있다. `sdb.js`는 바이너리 결정만 담당한다(`resolveSdb()`, `resolveSdbBinary()`, `runSdb()`, `parseDevices()`). `sdb-helper.js`를 확장한다.

서버 `SdbExecutor`를 본뜬 함수를 추가한다:

- `execute(serial, args)` — `sdb -s <serial> shell <args>`
- `pushFile(serial, localPath, remotePath)` — `sdb push`
- `pushDirectory(serial, localDir, remoteDir)` — delta용 일괄 push
- `getAppInstallPath(serial)` — 앱 설치 기본 경로 조회
- `root(serial, onOrOff)` — `sdb root on/off`

---

### 실기기 검증 (Tizen 11 에뮬레이터, 2026-09-17)

merge 후 리뷰 후속 작업의 일부로 `tizen-vm-1080`(Tizen 11.0 / x86_64)에서, `project-manager-cli.js`로 `Basic` 웹앱을 생성·빌드하고 두 번 설치해 수행했다:

| 확인 항목 | 결과 |
|-----------|------|
| `sdb shell 0 getappinstallpath` (tier 1) | 이 이미지에는 없는 명령(`/bin/sh: 0: command not found`) → 설계대로 다음 tier로 넘어감 |
| `sdb shell /usr/bin/pkgcmd -a` (tier 2) | `Tizen Application Installation Path: /opt/usr/home/owner/apps_rw` |
| `test -d X && echo <marker>` (tier 3/4) | 디렉터리가 있을 때만 marker 출력; sdb는 어느 경우든 exit 0 — marker 확인이 필수 |
| sdb shell 사용자 | `owner`(uid 5001), Smack `User::Shell` |
| `<apps_rw>/<pkgid>/` | `drwxr-xr-x owner users User::Home` → **marker/snapshot push는 root 불필요**(확인: 첫 설치가 `.rds_deploy_marker` + `.rds_snapshot.json`을 비root로 기록) |
| `<apps_rw>/<pkgid>/res`, `bin` | `tizenglobalapp:root` 소유 `/opt/usr/globalapps/<pkgid>/`로의 **symlink**, `owner`로는 읽기 불가 → **delta push는 `root on` 필요**(확인: 두 번째 설치가 root로 변경 파일 2개 push, `deploy_type: "rds"`, `root off` 후 `owner` 복귀) |
| push된 파일 | `root:root`, 호스트의 모드 비트 그대로(NTFS에서 `-rwxr-xrwx`); Smack 라벨은 디렉터리에서 상속(`User::Pkg::<pkgid>::RO`), 앱 프로세스 라벨은 `User::Pkg::<pkgid>` → 앱이 읽을 수 있고, 내용 갱신, 앱 재실행 및 동작 확인. `pushDeltaFiles()`는 이제 root 상태에서 push된 경로에 `chmod go-w`를 실행해 설치기의 `-rw-r--r--`와 맞춘다 |
| stdout | 두 설치 모두 순수 JSON envelope(진행 로그는 stderr에만) |
| `app_id` | full 경로와 RDS 경로 모두 `Ij1CHQbPKZ.RdsProbeWeb` |

따라서 코드의 비대칭 — root로 delta push, 비root로 marker push — 이 이 플랫폼에 맞는 구조다. 아직 미검증: 실제 Samsung 단말 / TV 프로파일, native(`.tpk`)·dotnet의 `bin/`, `lib/` delta push.

## Part 6: Vendoring된 의존성

이 절의 어떤 항목도 `common/`의 npm 의존성이 아니다. 원래 후보 넷 모두 해결되었다.

| 원래 후보 | 해결 |
|---|---|
| `xxhash-wasm` | **XXH3를 구현하지 않는다** — XXH32/XXH64만 노출한다. 대신 `hash-wasm`의 단독 파일 `dist/xxhash128.umd.min.js`를 vendoring한다(아래 참조). |
| `yaml` | 60줄 안팎의 자체 리더. `tizen_*_project.yaml` 파일은 사소한 부분집합이다: 주석, `key: scalar`, `key: []`, `key:` + `- item` 리스트. 앵커도, 중첩도, 다중 행 스칼라도 없다. |
| `picomatch` | vendoring — v4.0.7, **의존성 0**, 124 KB, MIT, 순수 CJS. ignore 패턴 의미가 확장과 바이트 단위로 같아야 하므로 재구현은 잘못된 리스크다. |
| `glob` | 제거. vendoring된 picomatch로 필터링하는 재귀 `fs.readdirSync(dir, { withFileTypes: true })` 탐색(~30줄)으로 대체. `glob`은 `minimatch`/`path-scurry`/`lru-cache`를 끌어오고, Node 20에는 `fs.glob`이 없다. |

### 해싱 — 검증 완료

확장은 `@node-rs/xxhash`로 `xxh3.xxh128(buffer).toString(16).padStart(32, '0')`을 계산한다([`baseline-manager.ts:94-97`](../../../Tizen.Extension.V2/packages/server/src/features/rds/baseline-manager.ts#L94-L97)). 그 패키지는 napi-rs 네이티브다: vendoring하려면 플랫폼별 `.node` 바이너리(linux-x64-gnu/musl, linux-arm64, darwin-x64/arm64, win32-x64)를 커밋해야 한다 — 수 MB의 바이너리, esbuild `external` 예외, macOS quarantine / Windows AV 노출.

**`hash-wasm`의 `xxhash128`은 그것과 바이트 단위로 동일하며 그런 것이 전혀 필요 없다.** 빈 입력, 소·중형, 70 KB 랜덤 입력에 대해 `@node-rs/xxhash@1.7.6`과 대조 검증 — 스트리밍 `createXXHash128()` API를 포함해 전부 일치:

```
     0 bytes  node-rs: 99aa06d3014798d86001c324468d497f  hash-wasm: 99aa06d3014798d86001c324468d497f
     5 bytes  node-rs: b5e9c1ad071b3e7fc779cfaa5e523818  hash-wasm: b5e9c1ad071b3e7fc779cfaa5e523818
  1000 bytes  node-rs: b01da365eddaa29cb3e7af627147db7c  hash-wasm: b01da365eddaa29cb3e7af627147db7c
 70000 bytes  node-rs: c3a001a1c4280565838680304203eaf9  hash-wasm: c3a001a1c4280565838680304203eaf9
```

**파일 하나**만 vendoring — `hash-wasm@4.12.0/dist/xxhash128.umd.min.js`, 20 KB, MIT, wasm은 base64로 인라인:

- 아키텍처 독립 — 플러그인이 배포되는 모든 플랫폼에 산출물 하나
- 순수 UMD/CJS — 빌드 없이 raw Node에서 `require()` 동작
- esbuild가 설정 없이 `dist/tizen-sdk.js`에 인라인(`.node` 바이너리와 달리)
- 정확히 `{ xxhash128, createXXHash128 }`를 export; 큰 파일에는 스트리밍 형태 사용

**결과: 해싱은 비동기다.** `xxhash128()`은 Promise를 반환한다. 이로써 서버의 동기 스캐너 변형은 배제된다 — 대신 `scanInputFilesAsync`, `scanOutputFilesAsync`, `generateBaselineManifestAsync`, `compareCurrentAgainstStoredAsync`, `reconcileDetailedAsync`를 포팅한다. 두 호출 지점(`buildProject`, `installApp`)이 이미 `async`이므로 비용은 없다.

### Vendor 레이아웃

```
common/lib/vendor/
  README.md                  ← source package, version, license, upgrade steps
  xxhash128.umd.min.js       ← hash-wasm@4.12.0, MIT
  picomatch/                 ← picomatch@4.0.7, MIT (verbatim package dir)
```

[`.gitattributes`](../../.gitattributes)에 `common/lib/vendor/** linguist-vendored`를 추가하고, [`eslint.config.mjs`](../../eslint.config.mjs)와 [`.prettierignore`](../../.prettierignore)에서 이 디렉터리를 제외한다.

---

## 상태 파일 호환성

`.tizen-rds/` 아래 모든 파일 + 디바이스상 파일 — 서버와 동일한 형식:

| 파일 | CLI가 기록 | 확장이 기록 |
|------|:-:|:-:|
| `deploy-state.json` | ✅ | ✅ |
| `changelist.json` | ✅ | ✅ |
| `baseline-manifest.json` | ✅ | ✅ |
| `build-manifest.json` | ✅(빌드 후, 배포 후 삭제) | ✅(빌드 후, 배포 후 삭제) |
| 디바이스: `.rds_deploy_marker` | ✅ | ✅ |
| 디바이스: `.rds_snapshot.json` | ✅ | ✅ |

XXH3-128 — `@node-rs/xxhash`와의 일치 검증 완료, Part 6 참조.

### 상태 파일 형식

**`deploy-state.json`** (`DeployState`):
```json
{
  "projectDir": "/path/to/MyApp",
  "nextDeployId": 3,
  "baselineManifestPath": "/path/to/MyApp/.tizen-rds/baseline-manifest.json",
  "devices": {
    "emulator-26101": {
      "lastDeployId": 2,
      "lastDeployTimestamp": "2026-09-08T12:00:00.000Z",
      "deployType": "rds",
      "appInstalled": true
    }
  }
}
```

**`changelist.json`** (`ChangeList`) — `deploys`는 deploy ID 문자열과 대기 중인 `"next"` 그룹을 키로 한다:
```json
{
  "projectDir": "/path/to/MyApp",
  "deploys": {
    "next": [
      { "path": "Debug/tpk/bin/myapp", "type": "modify" }
    ]
  }
}
```

**`baseline-manifest.json`** (`BaselineManifest`):
```json
{
  "deployId": 2,
  "projectDir": "/path/to/MyApp",
  "timestamp": "2026-09-08T12:00:00.000Z",
  "hashAlgorithm": "xxh3-128",
  "input": {
    "src/main.c": { "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }
  },
  "output": {
    "Debug/tpk/bin/myapp": { "hash": "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2" }
  }
}
```

**`build-manifest.json`** (`BuildManifest`) — 같은 형태, `deployId` 없음:
```json
{
  "projectDir": "/path/to/MyApp",
  "timestamp": "2026-09-08T11:55:00.000Z",
  "hashAlgorithm": "xxh3-128",
  "input": {
    "src/main.c": { "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }
  },
  "output": {
    "Debug/tpk/bin/myapp": { "hash": "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2" }
  }
}
```

**디바이스 `.rds_deploy_marker`**:
```json
{
  "deployId": 2,
  "deployType": "rds",
  "timestamp": "2026-09-08T12:00:00.000Z"
}
```

**디바이스 `.rds_snapshot.json`**: 배포 시점의 `baseline-manifest.json` 복사본.

---

## Kill switch and reset

RDS 상태는 에이전트가 진단할 수 없는 방식으로 낡을 수 있으므로 탈출구가 둘 있다:

- **`TIZEN_RDS_ENABLED=0`** — `rdsEnabled()`가 확인하는 환경 변수. `buildProject()`와 `installApp()`의 모든 RDS 진입점을 비활성화한다; 동작은 오늘과 정확히 같아진다.
- 설치 runner의 **`--reset-rds`** — `resetAllRdsState(projectDir)`(이미 포팅 목록에 있음)를 호출하고 반환한다. 이것이 없으면 에이전트는 손상된 `.tizen-rds/`에서 복구할 방법이 없다 — 그 디렉터리는 에이전트에게 보이지 않는다.

둘 다 [`common/skills/tizen-install-app/SKILL.md`](../../common/skills/tizen-install-app/SKILL.md)의 트러블슈팅 노트에 문서화한다.

---

## Out of scope

리뷰 중에 버그로 재발견되지 않도록 명시한다:

- **낡은 바이너리 감지.** 서버의 `isBuildNeeded()`는 소스가 수정됐지만 재빌드되지 않아 배포가 옛 바이너리를 보내는 경우를 잡는다. 이 포팅은 그것을 버린다: 설치 전 빌드를 순서 짓는 것은 `installApp()`이 아니라 에이전트 스킬의 책임이다. 수용한 결과: 소스 수정 후 재빌드 없이 `install-app`을 실행하면 fast-deploy로 이전 바이너리를 재실행하고 성공을 보고한다.
- **같은 프로젝트에서 CLI와 확장의 동시 실행.** 둘 다 잠금 없이 `.tizen-rds/`를 쓴다. 마지막 기록자가 이긴다. 실제로는 자기 치유된다 — 서버 상태보다 앞선 디바이스 marker는 full install로 회귀한다([`rds-deploy-service.ts:800-806`](../../../Tizen.Extension.V2/packages/server/src/features/rds/rds-deploy-service.ts#L800-L806)) — 그러나 이를 위해 설계된 것은 없다.
- **플랫폼/GBS 및 RPK 프로젝트.** 영구히 부적격(§2b), 일시적 제한이 아니다.

---

## 구현 순서

전체 작업을 무효화할 수 있는 두 가지 — 해시 일치와 디바이스상 SDB 동작 — 를 대부분의 포팅 전에 입증하도록 순서를 잡았다.

| 단계 | 파일 | 설명 |
|------|------|------|
| 1 | `vendor/xxhash128.umd.min.js`, `rds/hash.js` | vendoring + 비동기 `computeFileHash()`. **fixture 테스트: 실제 파일 집합을 이것과 확장 양쪽으로 해시해 동일함을 단정.** |
| 2 | `vendor/picomatch/`, `rds/fs-walk.js` | picomatch vendoring; `glob`을 대체하는 재귀 탐색 |
| 3 | `sdb-helper.js` 확장 | `execute`, `pushDirectory`, `getAppInstallPath`, `root`(`pushFile`은 제거 — RDS는 항상 디렉터리 단위로 일괄 push). `getAppInstallPath` + `sdb root on`은 Tizen 11 에뮬레이터에서 입증 — Part 5의 "실기기 검증" 참조 |
| 4 | `rds/constants.js` | 상수(원본 파일 둘 — 배경 참조) |
| 5 | `rds/forward-scan-composer.js` | 순수 함수 — 포팅 + 테스트 |
| 6 | `rds/tpk-contents-parser.js` | 순수 파서 — 포팅 + 테스트 |
| 7 | `rds/app-type-detector.js` | 앱 유형 감지, 플랫폼/미확인이면 `null` |
| 8 | `rds/yaml-reader.js` | 자체 파서 + [`usage/`](../../usage/)의 템플릿에 대한 fixture 테스트 |
| 9 | `rds/input-scanner.js` | 입력 파일 스캔(비동기) |
| 10 | `rds/output-scanner.js` | 출력 파일 스캔(비동기) + 인라인 매처 생성 |
| 11 | `rds/state-manager.js` | 상태 파일 로드/저장/수정, build-manifest 포함 |
| 12 | `rds/baseline-manager.js` | baseline 생성 + 비교, 재사용을 위해 현재 manifest 반환 |
| 13 | `rds/reconcile-service.js` | reconcile(`buildNeeded = false`) |
| 14 | `rds/device-path-resolver.js` | 호스트→디바이스 경로 매핑 |
| 15 | `rds/app-install-path.js` | `rds_info` 경로 + 패키지 ID 결정 |
| 16 | `rds/launch.js` | `runNoChain()` 대응 |
| 17 | `rds/deploy-service.js` | 배포 흐름: reconcile → delta → push → launch → sync |
| 18 | `rds/index.js` | 재export |
| 19 | `project.js` — `buildProject()` | 빌드 후 build-manifest.json 기록 |
| 20 | `project.js` — `installApp()` | serial 결정, 적용 조건 게이트, RDS 빠른 경로, envelope 필드 |
| 21 | `SKILL.md` | `TIZEN_RDS_ENABLED=0` + `--reset-rds` 문서 |
| 22 | 테스트 | 모듈별 단위 테스트 + 저장소 간 interop 테스트: CLI가 배포하고 확장이 상태를 읽어 일치함 |

---

## 에이전트가 보는 것

```
Agent: build-project --project /path/to/MyApp
  → tz build/pack runs + build-manifest.json written silently

Agent: install-app --package /path/to/MyApp/Debug/MyApp-1.0.0.tpk --run
  → tryRdsDeploy (delta/fast) or full install + updateRdsState
  → First time: full install (~30s)
  → After that: RDS delta (~2s) or fast-deploy (~1s)
```

같은 명령, 같은 스킬, 같은 스크립트, 같은 envelope 계약. 설치 결과에 추가 필드 하나 — `deploy_type`(`"rds"` | `"fast-deploy"` | `"full"`) — 가 나타나며 에이전트는 이를 완전히 무시해도 된다; 이 필드는 full install로의 조용한 영구 회귀를 감지할 수 있게 하기 위해 존재한다. [`common/skills/tizen-install-app/SKILL.md`](../../common/skills/tizen-install-app/SKILL.md)와 envelope 형태 테스트는 이에 맞춰 갱신해야 한다.

위의 시간 수치는 목표이고 측정치가 아니다. `rds-deploy-service.ts`의 `isBenchmarkMode()` / `RdsDeployTimings`를 포팅해 — 거의 공짜다 — publish 디렉터리가 커서 reconcile 스캔이 지배적 비용이 되는 .NET 프로젝트에서 확인하라.

---

## Tizen.Extension.V2 쪽

RDS는 이미 `main`에 있다. Tizen.Extension.V2에는 코드 변경이 필요 없다 — CLI가 같은 로직을 JS로 포팅하고 호환되는 상태를 쓴다. 그쪽에 변경을 강제할 수 있었던 유일한 것, 해시 알고리즘 불일치는 Part 6으로 해결되었다.
