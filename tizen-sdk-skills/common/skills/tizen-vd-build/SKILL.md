---
name: tizen-vd-build
description: Build a Tizen VD DotNET in-house app and directly re-sign its TPK through AppSign. Use for VD apps with manifest type dotnet-inhouse; do not use for ordinary Tizen builds. VD build, VD app, Appstore app, dotnet-inhouse, AppSign, VDStorePlatform, re-sign TPK, VD NuGet, tizen_bixby, VD_nuget, remove Appstore, pkgcmd uninstall.
---

## CRITICAL: Use `vd-build-cli.js`, NOT `project-manager-cli.js`

VD DotNET in-house apps have a **different build flow** than ordinary Tizen projects. You MUST use
the `vd-build-cli.js` runner. The standard `project-manager-cli.js build` command is wrong for
them because it:

- Does not run `dotnet restore` (required for the VD NuGet sources)
- Signs with the Tizen certificate profile instead of AppSign (`VDStorePlatform` / `VDInHouse`)
- Never sends the signatures to AppSign

If the project's `tizen-manifest.xml` does NOT declare `type="dotnet-inhouse"`, it is an ordinary
project — use `tizen-build-project` instead.

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-vd-build` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-vd-build`)
2. 수집된 입력(프로젝트 경로, distributor mode, bixby NuGet 디렉터리, 제거할 패키지 ID)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/vd-build-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/vd-build-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" build --project "<project-path>" --distributor-mode platform
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\vd-build-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" build --project "<project-path>" --distributor-mode platform
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*vd-build-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*vd-build-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*vd-build-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*vd-build-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" build --project "<project-path>" --distributor-mode platform
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Builds can take a while — set the Bash tool timeout to 600000 ms, or use `--background` (below).

## Full VD build workflow

### Step 1: One-time NuGet setup

Register the three VD NuGet sources (nuget.org, VD_nuget, tizen_bixby). Already-registered names
are skipped, so re-running is safe:

```
node "$CLI" setup-nuget --bixby-source "<absolute-path-to-local-nuget-dir>"
```

`--bixby-source` must be an existing local directory holding the ARM `Tizen.Bixby` NuGet packages
(usually a `nuget-source/arm` folder next to the app's source checkout — ask the user where it is).

### Step 2: Remove the pre-installed app from the device (precondition)

The device's package manager refuses to overwrite a pre-installed app, so remove it first:

```
node "$CLI" remove-app --package-id com.samsung.tv.store
```

Add `--serial <serial>` when several devices are connected. The runner runs `pkgcmd -u -n <id>`
over sdb and re-lists packages to confirm the removal (`result.uninstalled`).

### Step 3: Build + re-sign the project

```
node "$CLI" build --project "<absolute-project-path>" --distributor-mode platform
```

This single command does ALL of the following:

1. Finds the `type="dotnet-inhouse"` manifest under `--project` (refuses if none) and uses that
   manifest's directory as the project root — passing a parent folder is fine
2. Runs `dotnet restore` (non-fatal on failure; the reason is reported in `warnings`)
3. Runs `tz build` + `tz pack` → `.tpk` (`--arch arm` by default for VD TV targets)
4. Extracts `signature1.xml` (+ `author-signature.xml`) from the `.tpk`
5. POSTs them to AppSign with `VDStorePlatform` (+ `VDInHouse` for the author signature)
6. Replaces the signature entries in the `.tpk`, keeping the original as `<package>.vd-original`
7. Verifies the final archive and returns `result.package_path` / `result.backup_path`

### Step 4: Install on device

Use the `tizen-install-app` skill with `result.package_path` from the build envelope.

## Re-sign an already-built package

```
node "$CLI" resign --package "<absolute-tpk-path>" --distributor-mode platform
```

## Options

| Option                      | Action        | Description                                                         |
| --------------------------- | ------------- | ------------------------------------------------------------------- |
| `--project <path>`          | build         | Absolute path to the VD project (or a parent — the manifest is searched recursively) |
| `--build-type <type>`       | build         | `Debug` (default), `Release`, or `Test`                             |
| `--distributor-mode <mode>` | build, resign | `platform` (default), `partner`, or `public`                        |
| `--distributor-only`        | build, resign | Skip the author signature (default re-signs both)                   |
| `--arch <arch>`             | build         | Architecture passed to `tz build`; `arm` (default) for VD TV targets |
| `--sign-profile <name>`     | build         | Tizen certificate profile for the initial `tz` signing (optional)  |
| `--sign-url <url>`          | build, resign | Override the AppSign endpoint                                       |
| `--proxy-url <url>`         | build, resign | HTTP proxy for the AppSign request, `http(s)://host:port` (a bare `host:port` is rejected) |
| `--package <path>`          | resign        | Absolute path to the `.tpk` to re-sign                              |
| `--bixby-source <dir>`      | setup-nuget   | Local NuGet directory registered as `tizen_bixby`                   |
| `--package-id <id>`         | remove-app    | Tizen package ID to remove (e.g. `com.samsung.tv.store`)            |
| `--serial <serial>`         | remove-app    | Device serial (auto-selected when exactly one device is connected)  |
| `--background`              | any           | Run as a detached job and return a job receipt (see below)          |

## Distributor mode mapping

| Mode                 | AppSign cert ID   |
| -------------------- | ----------------- |
| `platform` (default) | `VDStorePlatform` |
| `partner`            | `VDStorePartner`  |
| `public`             | `VDStorePublic`   |

## Codex CLI — run the build as a job (one exec call waits ≤ 30 s)

Under Codex CLI a tool call returns after at most 30 s, and a VD build (dotnet restore + tz build +
AppSign) usually takes longer. Add **`--background`**: the runner returns a job receipt
(`result.job_id`) within a second. Then poll

```
node "<same lib/cli dir>/job-cli.js" wait --id <job_id>   # blocks ≤ 25 s; repeat while result.state is "running"
```

`status`/`wait` show the live `dotnet restore` / `tz build` output (`progress_tail`, `log_file`);
when `job.state` is `done` the response **is** this runner's envelope — report it exactly as below.

Run the runner — and its `--background` form — **with escalated permissions**: AppSign requires
network access and the `--background` job must outlive this call. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost` means exactly that — re-run
`suggested_fix.command` with escalated permissions; do not retry inside the sandbox.

## Do NOT

- Do NOT use `project-manager-cli.js build` for VD in-house projects
- Do NOT install or configure VSCodeSignExtension
- Do NOT run `dotnet restore`, `dotnet build`, `tz build` or `tz pack` yourself — the runner does
- Do NOT call AppSign yourself (curl, Invoke-WebRequest, …) — the runner does
- Do NOT use `dnatpkresigner` — the runner replaces it with direct AppSign API calls
- Do NOT edit the runner or the scripts inside a plugin cache directory — fixes belong in the
  tizen-sdk-skills repository

## On failure — read `error_category` before retrying

| `error_category`               | Meaning                                          | What to do                                                                                   |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `vd_inhouse_manifest_required` | No `type="dotnet-inhouse"` manifest under `--project` | Ordinary project → `tizen-build-project`                                                |
| `nuget_source_setup_failed`    | A `dotnet nuget add source` call failed          | `errors[0].message` carries dotnet's output — fix that source (URL/proxy/permissions), re-run |
| `vd_remove_app_failed`         | `pkgcmd -u` failed on the device                 | Check `sdb devices`; pass `--serial`; some images need `sdb root on` first                  |
| `build_failed`                 | `tz build` compile/packaging error               | Report the diagnostics in the envelope; `dotnet` missing → `tizen-dotnet-setup`              |
| `vd_package_not_found`         | Build succeeded but no `.tpk` appeared           | Check `bin/<BuildType>/` output of the manifest's directory                                  |
| `vd_resign_failed`             | AppSign request or signature replacement failed  | The message is the script output: HTTP status → network/VPN/permission; "Backup already exists" → remove `<package>.vd-original` |
| `invalid_parameters`           | Path/URL contains `"` or a newline; `$` / backtick (Linux, macOS); a `%NAME%` pair (Windows) | Rename the path or fix the URL                                                  |

Never re-run the same failed command unchanged.

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**. 최종 답변은
**어느 실행 경로(서브에이전트 위임 / CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result.package_path` 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다 (예: `tizen-install-app`으로 설치).

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다.
- 명령을 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣는다.
