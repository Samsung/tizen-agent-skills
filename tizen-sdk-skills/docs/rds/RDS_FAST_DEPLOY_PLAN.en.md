# RDS / Fast Deploy — Transparent Integration Plan

English | [한국어](RDS_FAST_DEPLOY_PLAN.md)

> **Status**: Complete
> **Date**: 2026-09-09
> **Repos**: `tizen-sdk-skills` (implementation), `Tizen.Extension.V2` (reference: `main` branch)

## Goal

Allow AI agents to leverage RDS (Rapid Development Support) / Fast Deploy for faster iterative verification — **transparently**. The agent sees no new commands, no new skills, no changes to its workflow. RDS logic is integrated inside the existing `buildProject()` and `installApp()` functions in `project.js`.

## Background

RDS is already implemented on the `main` branch of `Tizen.Extension.V2`. It deploys only changed files (delta) instead of full build→install→launch cycles, reducing iteration time from 5–30s to <2s.

The server implementation lives in 12 TypeScript modules under `packages/server/src/features/rds/`, but the port also pulls from outside that folder:

| Location | What lives there |
|----------|------------------|
| `packages/server/src/features/rds/` | The 12 core modules |
| `packages/shared/src/types/rds-interest.types.ts` | `DEFAULT_IGNORE_LIST`, `DEFAULT_INPUT_IGNORE_PATTERNS`, `DEFAULT_OUTPUT_INTEREST_LIST` |
| `packages/server/src/features/rds/reconcile-service.ts:24` | `DRIFT_THRESHOLD = 0.5` |
| `packages/server/src/features/project-manager/utils/project-utils.ts` | `ProjectUtils.isWebProject/isNativeProject/isDotNetProject` — backs `detectAppType()` |
| `packages/server/src/features/project-manager/usecases/run-project-no-chain.ts` | `runNoChain()` — the app launch used by both RDS branches |
| `packages/server/src/shared/sdb-executor.ts` | `SdbExecutor` |

The `tizen-sdk-skills` repository operates via standalone CLI commands (`tz build`, `sdb push`, `tz install`) — it does not call the server REST API. This plan ports the RDS logic to JavaScript and integrates it transparently into the existing plugin commands.

## Architecture

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

**No `isBuildNeeded()`, no in-build flags, no input change tracker, no snapshot/restore.** The CLI agent always builds before installing — that's the existing flow. RDS only makes the *install* step faster.

---

## Part 0: Hard constraint — no npm dependencies on the plugin path

This shapes every other decision, so it comes first.

`common/lib/**` today has **zero** third-party requires — every module is Node built-ins only. That is not an accident:

- [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json) ships `"source": "./common"`. The plugin is a **verbatim directory copy** into `~/.claude/plugins/…` (and `~/.cline`, `~/.codex`, `~/.gemini`).
- `common/` has no `package.json` at all, so it can never have a `node_modules`.
- Skills invoke it as raw Node: `node "$CLI" install --package …` ([`common/skills/tizen-install-app/SKILL.md:40`](../../common/skills/tizen-install-app/SKILL.md#L40)).

Adding dependencies to `tizen-cli/package.json` only serves the esbuild-bundled `tizen-cli` path. On the primary agent path a `require("yaml")` throws `MODULE_NOT_FOUND`. [`.nvmrc`](../../.nvmrc) pins Node **20**, so `fs.glob` (Node 22+) is not available as a fallback either.

**Therefore: everything RDS needs is either a Node built-in or a vendored file under `common/lib/vendor/`.** See [Part 6](#part-6-vendored-dependencies) for the resolution of each one — all four are solved, and hash parity with the extension has been verified empirically.

---

## Part 1: `buildProject()` — Write `build-manifest.json` After Build

**File**: `common/lib/core/project.js` — modify `buildProject()` (signature at line 800)

`buildProject()` is a single `try/catch` with ~6 return points; the success value is produced by `formatProjectBuild(...)` at [`project.js:958`](../../common/lib/core/project.js#L958). **The hook goes immediately before that return**, so every failure path is skipped by construction and no `status` check is needed:

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

### Gating rationale

- **`rdsStateExists()`** — `.tizen-rds/` only exists after a first deploy. Before that there is no baseline for the manifest to complement, and the extension's `isBuildNeeded()` correctly returns `true` from its own first-run branch anyway. This keeps a full input+output hash off every build of every project the user only ever builds.
- **`detectAppType()` returning `null`** — see Part 4; the server's version *never* fails (it defaults to `'native'`), which would produce a garbage manifest for a GBS/platform project. The CLI port must return `null` instead, and every RDS entry point skips on `null`.

**Why `build-manifest.json`?** So the VS Code extension (if run after this) can see that a build just happened and skip its own `isBuildNeeded()` check. This works cross-process: `isBuildNeeded()` level 3 calls `loadBuildManifest()` from disk and merges it with the baseline (`baseline-manager.ts:846-852`). It only works if the manifest's key space matches — same relative paths, same interest lists, same ignore patterns — which is why the scanners must be ported faithfully rather than approximated.

---

## Part 2: `installApp()` — RDS Deploy

**File**: `common/lib/core/project.js` — modify `installApp()` (signature at line 1126)

**Architecture note**: `installApp()` does not call SDB directly — it invokes `resolveScript("tizen-install-app")` and runs the shell script via `execPluginScript()`. RDS must intercept **before** the script call.

### 2a. Device serial resolution

`deviceSerial` is optional and normally absent — the documented invocation is `install --package <tpk>` and the shell script auto-selects. Left as-is this breaks RDS twice over: `state.devices[undefined]` yields `no-device-state` so RDS never engages, and the fallback `updateRdsState(projectDir, undefined, "full")` writes a literal `"undefined"` device key into `deploy-state.json`.

**Resolve it in JS, not in the shell script.** The script's no-device branch invokes the device manager to create/launch an emulator ([`tizen-install-app.sh:549`](../../common/scripts/tizen-install-app/tizen-install-app.sh#L549)); duplicating that in a second script would be a maintenance trap. Instead, use what already exists in [`sdb.js`](../../common/lib/core/sdb.js) — `resolveSdbBinary()` + `runSdb(sdbPath, "devices")` + `parseDevices()`:

| `sdb devices` result | Action |
|---|---|
| Exactly 1 online device | Use its serial for RDS **and** pass `-s <serial>` to the install script, so both paths target the same device |
| 0 devices | Skip RDS; let the script auto-provision an emulator |
| >1 and no explicit `--device` | Skip RDS; let the script report the existing "specify device serial" error |

On the full-install fallback, take the serial from the script's own `Device Serial:` line, which `installApp()` already parses at [`project.js:1300`](../../common/lib/core/project.js#L1300) — never from the possibly-undefined parameter.

### 2b. Eligibility gate

RDS is skipped, silently and with no attempt, when any of these hold:

- `TIZEN_RDS_ENABLED=0` (see [Kill switch](#kill-switch-and-reset))
- `isPlatformProject(projectDir)` — GBS/platform projects install via `sdb push` + `rpm -ivh` into system paths. There is no per-app `rds_info` directory and no `tpk_contents`; RDS has nothing to work with.
- Package extension is `.rpm` or `.rpk` — RPM is the platform case above; RPK resource packages have no app to launch and are already rejected with `--run` at [`project.js:1158`](../../common/lib/core/project.js#L1158).
- `detectAppType(projectDir)` returns `null`
- Device serial unresolved (2a)
- `rdsStateExists(projectDir)` is false — first deploy, must be a full install

### 2c. Flow

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

The existing success envelope at [`project.js:1319`](../../common/lib/core/project.js#L1319) gains `deploy_type: "full"` so both paths return one uniform shape.

`deploy_type` is the **only** field added. It earns its place because it is the sole signal that RDS is working at all — if the ignore lists drift or the marker check starts failing, every install silently falls back to a full one and nothing surfaces that except a wall-clock difference nobody is measuring. A `files_pushed` count was considered and rejected: nothing branches on it, and it is `0` for both `fast-deploy` and `full`, so it discriminates nothing that `deploy_type` doesn't already. The delta file count stays where it belongs — the existing `[RDS] N delta file(s) to push` stderr line.

**`app_id` on the RDS path**: `getRdsInfoPath()` already resolves the package ID (`parseManifestPackageId()` / `parseWebPackageId()`). If the app ID cannot be derived from it cheaply, return `null` — the field is already nullable at [`project.js:1325`](../../common/lib/core/project.js#L1325).

### 2d. `tryRdsDeploy()` flow — what differs from the server

The server's `tryRdsDeploy(projectDir, deviceSerial)` takes **two** arguments and **always** launches via `runNoChain()` on both branches. It also **never calls `reconcile()`** — on the server the changelist is filled by the VS Code file watcher through `POST /rds/changes` → `addChanges()` ([`rds-routes.ts:110`](../../../Tizen.Extension.V2/packages/server/src/routes/v1/rds-routes.ts#L110)).

**There is no file watcher in the CLI.** A straight port would find `deltaEntries.length === 0` on every run, take the fast-deploy branch, and never push a single changed file. So the CLI wrapper must drive reconcile itself — `reconcile()` is what writes the changelist in a watcher-less world ([`reconcile-service.ts:183`](../../../Tizen.Extension.V2/packages/server/src/features/rds/reconcile-service.ts#L183)).

CLI order of operations:

1. Load RDS state → check device state exists
2. Read device marker via SDB → validate deploy ID (`marker.deployId > lastDeployId` → bail to full install)
3. **`reconcileDetailedAsync(projectDir)`** — scans output, compares against `baseline-manifest.json`, writes drift into `changelist.json` via `replaceNextChanges()` (the CLI recomputes the full delta every time, so `next` is replaced, not appended), returns `{ rdsStatus, driftRatio, currentManifest }`. A delta touching `tizen-manifest.xml`/`config.xml` is always `full`.
4. `rdsStatus === "full"` (no baseline, or drift > `DRIFT_THRESHOLD`) → return `{deployed: false}` → full install
5. `getDeltaForDevice()` → `resolveDevicePaths()`
6. No delta → fast-deploy; delta → `pushDeltaFiles()`
7. Launch **only if `runAfterInstall`** — otherwise skip `runNoChain()`. `syncDeployState()` still runs either way: the device *files* now match the new baseline regardless of whether the app was relaunched, so skipping the state sync would leave `deploy-state.json` permanently behind.
8. `syncDeployState()` — save baseline, push marker + snapshot, `promoteNextGroup()`, commit state, `clearBuildManifest()`

`determineRdsStatusByRatio(buildNeeded, driftRatio)` is always called with `buildNeeded = false`; the `'build-needed'` status never occurs on the CLI path.

### 2e. Reuse the scan between reconcile and sync

`compareCurrentAgainstStored()` already builds the complete current manifest via `generateBaselineManifest(projectDir, ignoreList, nextDeployId)` ([`baseline-manager.ts:353`](../../../Tizen.Extension.V2/packages/server/src/features/rds/baseline-manager.ts#L353)) — which is *exactly* what `syncDeployState()` then regenerates from scratch a few hundred milliseconds later, with the same `nextDeployId` and nothing on disk having changed in between.

**The CLI port must thread that manifest through**: `reconcileDetailedAsync()` returns it, `syncDeployState()` accepts it as an optional argument and only regenerates when absent. That removes one full tree hash per deploy.

Build and install are separate processes, so the build-time scan (Part 1) cannot be shared with either — that one stands alone.

---

## Part 3: `build-manifest.json` Lifecycle

```
buildProject()  →  build succeeds  →  WRITE build-manifest.json (if .tizen-rds/ exists)
                                          ↓
installApp()    →  tryRdsDeploy()   →  deploy succeeds
                     ↓                    ↓
                  syncDeployState()  →  DELETE build-manifest.json
                                        (baseline-manifest.json is now authoritative)
```

On the server this deletion happens *indirectly*: `syncDeployState()` calls `clearInputChanges()`, which calls `clearBuildManifest()` as its last statement ([`baseline-manager.ts:633-638`](../../../Tizen.Extension.V2/packages/server/src/features/rds/baseline-manager.ts#L633-L638)). Since this port drops the in-memory input tracker entirely, `clearInputChanges()` has nothing left to do — **the CLI's `syncDeployState()` calls `clearBuildManifest(projectDir)` directly.** Same observable effect on disk, one less indirection.

If deploy fails and falls through to full install → `updateRdsState()` → `syncDeployState()` → also deletes `build-manifest.json`.

If build fails → `build-manifest.json` is not written (the hook sits after the last failure return). A stale one from a previous build remains until the next successful deploy clears it — same as server behavior, where a build failure doesn't touch the manifest.

---

## Part 4: RDS Core Library — `common/lib/core/rds/`

Simplified set — no `isBuildNeeded()`, no in-memory trackers, no flags:

| File | Server Source | What it does |
|------|--------------|-------------|
| `constants.js` | `packages/shared/…/rds-interest.types.ts` + `reconcile-service.ts:24` | `DEFAULT_IGNORE_LIST`, `DEFAULT_INPUT_IGNORE_PATTERNS`, `DEFAULT_OUTPUT_INTEREST_LIST`, `DRIFT_THRESHOLD=0.5` |
| `hash.js` | `baseline-manager.ts:94-112` | XXH3-128 via vendored `xxhash128`. `computeFileHash(path)` → 32-char hex. **Async only** (Part 6) |
| `app-type-detector.js` | `baseline-manager.ts:detectAppType` + `project-manager/utils/project-utils.ts` | Detect native/web/dotnet. **Returns `null`** for platform/GBS/unknown instead of defaulting to `'native'` |
| `yaml-reader.js` | `project-yaml-reader.ts` | Parse `tizen_*_project.yaml` for interest lists + ignore patterns |
| `tpk-contents-parser.js` | `tpk-contents-parser.ts` | Parse `Debug/tpk_contents` |
| `input-scanner.js` | `input-scanner.ts` | Scan source files, hash all → `Record<relPath, {hash}>` (port the `*Async` variants) |
| `output-scanner.js` | `output-scanner.ts` | Scan build output files, hash all → `Record<relPath, {hash}>` (port the `*Async` variants) |
| `forward-scan-composer.js` | `forward-scan-composer.ts` | Pure: `computeDelta()`, `composeChanges()` |
| `state-manager.js` | `rds-state-manager.ts` | Load/save 4 state files. `addChanges()`, `getDeltaForDevice()`, `promoteNextGroup()`, `pruneOldDeploys()`, `getOrCreateState()`, `resetAllRdsState()`, `resetDevice()`, `saveBuildManifest()`, `loadBuildManifest()`, `clearBuildManifest()` |
| `baseline-manager.js` | `baseline-manager.ts` (simplified) | `generateBaselineManifestAsync()`, `compareAgainstBaseline()`, `compareCurrentAgainstStoredAsync()` (**returns the current manifest for reuse — §2e**), `getIgnoreList()`, `prefixIgnorePatterns()`. **No `isBuildNeeded()`, no trackers, no flags.** |
| `reconcile-service.js` | `reconcile-service.ts` (simplified) | `reconcileDetailedAsync()` — compare output vs baseline, write changelist, determine deploy type. `isBuildNeeded` hardwired to `false`. |
| `device-path-resolver.js` | `rds-deploy-service.ts:resolveDevicePaths` (+ `resolveNativeDevicePaths`, `resolveWebDevicePaths`, `resolveDotnetDevicePaths`, `stripNativePrefix`) | Host→device path mapping |
| `app-install-path.js` | `rds-deploy-service.ts:getRdsInfoPath` (+ `parseWebPackageId`, `findManifestPath`, `parseManifestPackageId`) | Resolve the on-device `rds_info` directory and package ID. **Drop the module-level `rdsInfoPathCache`** — each CLI invocation is a fresh process, so the cache can never hit. |
| `launch.js` | `project-manager/usecases/run-project-no-chain.ts` | `runNoChain()` equivalent — launch the app without rebuilding. Not in the `rds/` folder on the server, but `tryRdsDeploy` cannot work without it. |
| `deploy-service.js` | `rds-deploy-service.ts` | `tryRdsDeploy()`, `updateRdsState()`, `pushDeltaFiles()` (note: does hardlink/tmpdir staging, not a bare `sdb push`), `readDeviceMarker()`, `pushDeviceMarkerAndSnapshot()`, `syncDeployState()` |
| `index.js` | — | Re-exports |

### Deliberately not ported

- `classification-cache.ts` — watcher-side infrastructure. Its compiled ignore matchers are still needed, so pull the matcher-construction logic into `output-scanner.js` / `baseline-manager.js` as plain (uncached) functions. A per-process cache buys nothing here.
- `rds-flush-coordinator.ts`, `rds-runtime-config.ts` — watcher debounce and server runtime config; no CLI analogue.
- `isBuildNeeded()` and the whole in-memory tracker family (`pendingInputChanges`, `buildCompletedFlags`, `inBuildFlags`, `snapshotAndClearInputChanges()`, `restoreInputChanges()`, `markBuildCompleted()`, `accumulateBuildHashes()`) — see [Out of scope](#out-of-scope).
- All sync scanner variants — Part 6 makes hashing async.

---

## Part 5: SDB Extensions — `common/lib/core/sdb-helper.js`

**Note**: SDB command execution lives in `sdb-helper.js`, where `runSdbCommand()` already exists. `sdb.js` only handles binary resolution (`resolveSdb()`, `resolveSdbBinary()`, `runSdb()`, `parseDevices()`). Extend `sdb-helper.js`.

Add functions mirroring server's `SdbExecutor`:

- `execute(serial, args)` — `sdb -s <serial> shell <args>`
- `pushFile(serial, localPath, remotePath)` — `sdb push`
- `pushDirectory(serial, localDir, remoteDir)` — batched push for delta
- `getAppInstallPath(serial)` — query app install base path
- `root(serial, onOrOff)` — `sdb root on/off`

---

### Real-device verification (Tizen 11 emulator, 2026-09-17)

Done as part of the post-merge review follow-up, on `tizen-vm-1080` (Tizen 11.0 / x86_64) with a
`Basic` web app created, built and installed twice through `project-manager-cli.js`:

| Checked | Result |
|---------|--------|
| `sdb shell 0 getappinstallpath` (tier 1) | Not a command on this image (`/bin/sh: 0: command not found`) → falls through as designed |
| `sdb shell /usr/bin/pkgcmd -a` (tier 2) | `Tizen Application Installation Path: /opt/usr/home/owner/apps_rw` |
| `test -d X && echo <marker>` (tiers 3/4) | Marker echoed only when the directory exists; sdb exits 0 either way — the marker check is required |
| sdb shell user | `owner` (uid 5001), Smack `User::Shell` |
| `<apps_rw>/<pkgid>/` | `drwxr-xr-x owner users User::Home` → **marker/snapshot push needs no root** (confirmed: first install wrote `.rds_deploy_marker` + `.rds_snapshot.json` unrooted) |
| `<apps_rw>/<pkgid>/res`, `bin` | **Symlinks** into `/opt/usr/globalapps/<pkgid>/` owned `tizenglobalapp:root`, unreadable as `owner` → **delta push needs `root on`** (confirmed: second install pushed 2 changed files under root, `deploy_type: "rds"`, `root off` restored `owner`) |
| Pushed files | Landed as `root:root` with the host's mode bits (`-rwxr-xrwx` from NTFS); Smack label inherited from the directory (`User::Pkg::<pkgid>::RO`), app process label `User::Pkg::<pkgid>` → readable by the app, content updated, app relaunched and running. `pushDeltaFiles()` now runs `chmod go-w` on the pushed paths while still rooted so they match the installer's `-rw-r--r--` |
| stdout | Pure JSON envelope on both installs (progress logs on stderr only) |
| `app_id` | `Ij1CHQbPKZ.RdsProbeWeb` on both the full and the RDS path |

So the asymmetry in the code — rooted delta push, unrooted marker push — is the correct shape for
this platform. Not yet verified: physical Samsung devices / TV profile, and native (`.tpk`) or
dotnet delta pushes into `bin/` and `lib/`.

## Part 6: Vendored Dependencies

No entry here is an npm dependency of `common/`. All four original candidates are resolved.

| Original candidate | Resolution |
|---|---|
| `xxhash-wasm` | **Does not implement XXH3** — it exposes XXH32/XXH64 only. Vendor `hash-wasm`'s standalone `dist/xxhash128.umd.min.js` instead (see below). |
| `yaml` | Hand-rolled ~60-line reader. The `tizen_*_project.yaml` files are a trivial subset: comments, `key: scalar`, `key: []`, and `key:` + `- item` lists. No anchors, no nesting, no multi-line scalars. |
| `picomatch` | Vendor it — v4.0.7, **zero dependencies**, 124 KB, MIT, plain CJS. Ignore-pattern semantics must match the extension byte-for-byte, so reimplementing is the wrong risk to take. |
| `glob` | Drop. Replace with a recursive `fs.readdirSync(dir, { withFileTypes: true })` walk filtered through the vendored picomatch (~30 lines). `glob` drags in `minimatch`/`path-scurry`/`lru-cache`, and Node 20 has no `fs.glob`. |

### Hashing — verified

The extension computes `xxh3.xxh128(buffer).toString(16).padStart(32, '0')` via `@node-rs/xxhash` ([`baseline-manager.ts:94-97`](../../../Tizen.Extension.V2/packages/server/src/features/rds/baseline-manager.ts#L94-L97)). That package is napi-rs native: vendoring it means checking in a `.node` binary per platform (linux-x64-gnu/musl, linux-arm64, darwin-x64/arm64, win32-x64) — a few MB of binaries, an esbuild `external` carve-out, and macOS quarantine / Windows AV exposure.

**`hash-wasm`'s `xxhash128` is byte-identical to it and needs none of that.** Verified against `@node-rs/xxhash@1.7.6` on empty, small, medium and 70 KB random inputs — all match, including the streaming `createXXHash128()` API:

```
     0 bytes  node-rs: 99aa06d3014798d86001c324468d497f  hash-wasm: 99aa06d3014798d86001c324468d497f
     5 bytes  node-rs: b5e9c1ad071b3e7fc779cfaa5e523818  hash-wasm: b5e9c1ad071b3e7fc779cfaa5e523818
  1000 bytes  node-rs: b01da365eddaa29cb3e7af627147db7c  hash-wasm: b01da365eddaa29cb3e7af627147db7c
 70000 bytes  node-rs: c3a001a1c4280565838680304203eaf9  hash-wasm: c3a001a1c4280565838680304203eaf9
```

Vendor **one file** — `hash-wasm@4.12.0/dist/xxhash128.umd.min.js`, 20 KB, MIT, wasm inlined as base64:

- Architecture-independent — one artifact for every platform the plugin ships to
- Plain UMD/CJS — `require()` works from raw Node with no build step
- esbuild inlines it into `dist/tizen-sdk.js` with zero config (unlike a `.node` binary)
- Exports exactly `{ xxhash128, createXXHash128 }`; use the streaming form for large files

**Consequence: hashing is async.** `xxhash128()` returns a Promise. This rules out the server's sync scanner variants — port `scanInputFilesAsync`, `scanOutputFilesAsync`, `generateBaselineManifestAsync`, `compareCurrentAgainstStoredAsync`, `reconcileDetailedAsync` instead. Both call sites (`buildProject`, `installApp`) are already `async`, so this costs nothing.

### Vendor layout

```
common/lib/vendor/
  README.md                  ← source package, version, license, upgrade steps
  xxhash128.umd.min.js       ← hash-wasm@4.12.0, MIT
  picomatch/                 ← picomatch@4.0.7, MIT (verbatim package dir)
```

Add `common/lib/vendor/** linguist-vendored` to [`.gitattributes`](../../.gitattributes) and exclude the directory from [`eslint.config.mjs`](../../eslint.config.mjs) and [`.prettierignore`](../../.prettierignore).

---

## State File Compatibility

All files under `.tizen-rds/` + on-device files — identical format to server:

| File | Written by CLI | Written by Extension |
|------|:-:|:-:|
| `deploy-state.json` | ✅ | ✅ |
| `changelist.json` | ✅ | ✅ |
| `baseline-manifest.json` | ✅ | ✅ |
| `build-manifest.json` | ✅ (after build, deleted after deploy) | ✅ (after build, deleted after deploy) |
| Device: `.rds_deploy_marker` | ✅ | ✅ |
| Device: `.rds_snapshot.json` | ✅ | ✅ |

XXH3-128 — parity with `@node-rs/xxhash` verified, see Part 6.

### State file formats

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

**`changelist.json`** (`ChangeList`) — `deploys` is keyed by deploy ID string plus the pending `"next"` group:
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

**`build-manifest.json`** (`BuildManifest`) — same shape, no `deployId`:
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

**Device `.rds_deploy_marker`**:
```json
{
  "deployId": 2,
  "deployType": "rds",
  "timestamp": "2026-09-08T12:00:00.000Z"
}
```

**Device `.rds_snapshot.json`**: Copy of `baseline-manifest.json` at deploy time.

---

## Kill switch and reset

Two escape hatches, because RDS state can go stale in ways the agent cannot diagnose:

- **`TIZEN_RDS_ENABLED=0`** — env var checked by `rdsEnabled()`. Disables every RDS entry point in both `buildProject()` and `installApp()`; behavior reverts to today's exactly.
- **`--reset-rds`** on the install runner — calls `resetAllRdsState(projectDir)` (already in the port list) and returns. Without this the agent has no way to recover from a corrupt `.tizen-rds/`, since the directory is invisible to it.

Document both in [`common/skills/tizen-install-app/SKILL.md`](../../common/skills/tizen-install-app/SKILL.md) under a troubleshooting note.

---

## Out of scope

Stated explicitly so these don't get rediscovered as bugs during review:

- **Stale-binary detection.** The server's `isBuildNeeded()` catches the case where source was edited but not rebuilt, so a deploy would ship the old binary. This port drops it: sequencing build before install is the agent skill's responsibility, not `installApp()`'s. Consequence, accepted: `install-app` run after a source edit with no rebuild will fast-deploy and relaunch the previous binary, reporting success.
- **Concurrent CLI + extension on the same project.** Both write `.tizen-rds/` with no locking. Last writer wins. It is self-healing in practice — a device marker ahead of server state bails to full install ([`rds-deploy-service.ts:800-806`](../../../Tizen.Extension.V2/packages/server/src/features/rds/rds-deploy-service.ts#L800-L806)) — but nothing here is designed for it.
- **Platform/GBS and RPK projects.** Permanently ineligible (§2b), not a temporary limitation.

---

## Implementation Order

Ordered so the two things that can invalidate the whole effort — hash parity and on-device SDB behavior — are proven before the bulk of the porting.

| Step | Files | Description |
|------|-------|-------------|
| 1 | `vendor/xxhash128.umd.min.js`, `rds/hash.js` | Vendor + async `computeFileHash()`. **Fixture test: hash a set of real files with both this and the extension, assert identical.** |
| 2 | `vendor/picomatch/`, `rds/fs-walk.js` | Vendor picomatch; recursive walk replacing `glob` |
| 3 | `sdb-helper.js` extensions | `execute`, `pushDirectory`, `getAppInstallPath`, `root` (`pushFile` was dropped — RDS only ever pushes batched directories). `getAppInstallPath` + `sdb root on` proven against a Tizen 11 emulator — see "Real-device verification" under Part 5 |
| 4 | `rds/constants.js` | Constants (two source files — see Background) |
| 5 | `rds/forward-scan-composer.js` | Pure functions — port + test |
| 6 | `rds/tpk-contents-parser.js` | Pure parser — port + test |
| 7 | `rds/app-type-detector.js` | App type detection, `null` for platform/unknown |
| 8 | `rds/yaml-reader.js` | Hand-rolled parser + fixture tests against the templates in [`usage/`](../../usage/) |
| 9 | `rds/input-scanner.js` | Input file scanning (async) |
| 10 | `rds/output-scanner.js` | Output file scanning (async) + inlined matcher construction |
| 11 | `rds/state-manager.js` | State file load/save/modify, incl. build-manifest |
| 12 | `rds/baseline-manager.js` | Baseline gen + comparison, returning the current manifest for reuse |
| 13 | `rds/reconcile-service.js` | Reconcile (`buildNeeded = false`) |
| 14 | `rds/device-path-resolver.js` | Host→device path mapping |
| 15 | `rds/app-install-path.js` | `rds_info` path + package ID resolution |
| 16 | `rds/launch.js` | `runNoChain()` equivalent |
| 17 | `rds/deploy-service.js` | Deploy flow: reconcile → delta → push → launch → sync |
| 18 | `rds/index.js` | Re-exports |
| 19 | `project.js` — `buildProject()` | Write build-manifest.json after build |
| 20 | `project.js` — `installApp()` | Serial resolution, eligibility gate, RDS fast path, envelope fields |
| 21 | `SKILL.md` | `TIZEN_RDS_ENABLED=0` + `--reset-rds` docs |
| 22 | Tests | Unit tests per module + a cross-repo interop test: CLI deploys, extension reads the state and agrees |

---

## What the Agent Sees

```
Agent: build-project --project /path/to/MyApp
  → tz build/pack runs + build-manifest.json written silently

Agent: install-app --package /path/to/MyApp/Debug/MyApp-1.0.0.tpk --run
  → tryRdsDeploy (delta/fast) or full install + updateRdsState
  → First time: full install (~30s)
  → After that: RDS delta (~2s) or fast-deploy (~1s)
```

Same commands, same skill, same script, same envelope contract. One additive field appears in the install result — `deploy_type` (`"rds"` | `"fast-deploy"` | `"full"`) — which the agent can ignore entirely; it exists so that a silent permanent fallback to full installs is detectable. [`common/skills/tizen-install-app/SKILL.md`](../../common/skills/tizen-install-app/SKILL.md) and any envelope-shape tests need updating to match.

The timing figures above are targets, not measurements. Port `isBenchmarkMode()` / `RdsDeployTimings` from `rds-deploy-service.ts` — it is nearly free — and confirm them on a .NET project, where the publish directory is large enough to make the reconcile scan the dominant cost.

---

## Tizen.Extension.V2 Side

RDS is already on `main`. No code changes needed in Tizen.Extension.V2 — the CLI ports the same logic to JS and writes compatible state. The one thing that would have forced a change on that side, a hash algorithm mismatch, is resolved by Part 6.
