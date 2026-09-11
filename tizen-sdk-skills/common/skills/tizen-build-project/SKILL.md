---
name: tizen-build-project
description: Build a Tizen app/project (Native, DotNET, WebApp, standalone RPK resource package, or Platform/GBS). TRIGGERS — 빌드, 빌드해줘, 앱 빌드, 앱 빌드해줘, 프로젝트 빌드, 타이젠 빌드, 타이젠 앱 빌드, RPK 빌드, build, build app, build the app, build project, tz build, gbs build, build native/dotnet/webapp/rpk/platform. When the user asks to build, ROUTE HERE FIRST and follow this skill — do NOT run SDK tools by hand or debug PATH yourself; this skill's CLI runner detects the type and builds/packages correctly.

metadata:
  author: Samsung Electronics
  last-updated: "2026-08-20"
  keywords:
    - 빌드
    - 빌드해줘
    - 앱 빌드
    - 앱 빌드해줘
    - 프로젝트 빌드
    - 타이젠 빌드
    - 타이젠 앱 빌드
    - build
    - build app
    - build the app
    - build project
    - Tizen build
    - tz build
    - tz build native
    - tz build dotnet
    - tz build webapp
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-build-project` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-build-project`)
2. 수집된 입력(프로젝트 경로, 빌드 타입, 프로필)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\project-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" build --project "<project-path>" --build-type Debug
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" build --project "<project-path>" --build-type Debug
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" build --project "<project-path>" --build-type Debug
```

### Codex CLI — run the build as a job (one exec call waits ≤ 30 s)

Under Codex CLI a tool call returns after at most 30 s, and a native, .NET or GBS build (and any
`--clean` build) usually takes longer — the call would come back with only the runner's
`[tizen-build] Building …` header while the build keeps running unseen (issue #48). Add
**`--background`**: the runner returns a job receipt (`result.job_id`) within a second. Then poll

```
node "<same lib/cli dir>/job-cli.js" wait --id <job_id>   # blocks ≤ 25 s; repeat while result.state is "running"
```

`status`/`wait` show the live `tz build` output (`progress_tail`, `log_file`); when `job.state` is
`done` the response **is** this runner's build envelope — report it exactly as below. A result
that shows only progress lines and no `{ "status": … }` JSON is not a result.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: `tz build`/`tz pack` sign with the profile in `<sdk>-data/profile/profiles.xml` and the `--background` job must outlive this call, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

1. **projectPath** (required) — absolute path to project directory
2. **buildType** (optional, default `Debug`) — `Debug` | `Release` | `Test`. Use Debug unless user explicitly requests Release.
3. **signProfile** (optional) — signing profile name
4. **`--clean`** (optional flag) — remove previous build output on the SDK host before
   building, forcing a full non-incremental rebuild. Use when the user asks for a
   clean/full rebuild ("클린 빌드", "전체 재빌드") or when the complete compiler
   warning list is needed (incremental builds skip unchanged files, so their
   warnings do NOT reappear). Do NOT `rm -rf Debug/` yourself — the project lives
   on the SDK host, and deleting a local path is a silent no-op for remote clients.

Exit code: `0` = success envelope (with `result.artifacts`), `1` = failure/error envelope.

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash 결과를 "Ran 1 shell command"로 접어 둔다). 사용자에게 보이는 것은
최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 / CLI Runner 직접
실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (산출물 경로 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

```json
{ "command": "tizen-sdk build-project", "status": "success", ... }
```

✅ dali2 RPM 6개 생성 — `~/GBS-ROOT/local/repos/tizen/x86_64/RPMS/`

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 빌드를 여러 번 재시도했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`의 진단 줄을 다시
  타이핑하지 말고 JSON 안의 것을 그대로 보이게 한다.

> **ℹ️ Signing profile (default certificates):** When no signing profile is specified and no
> active profile exists, the build proceeds using `tz`'s built-in default developer
> certificates (`tempMobile.p12` + `tizen-distributor-signer.p12`) — the same behavior as the
> VS Code extension. The build envelope includes a warning: "Using Tizen default developer
> certificates (tempMobile.p12)." This is sufficient for development and testing.
>
> **For distribution or app store submission**, create a custom signing profile with
> `tizen-certificate-manager` (generate-author → create-profile), then pass the profile name:
> `node "$CLI" build --project "<project>" --build-type Debug --sign-profile MyProfile`.
>
> If an **active signing profile** is registered but its certificate files are missing or
> unreadable, the runner rejects the build with `signing_profile_invalid`
> (`TIZEN_SDK_CERT_E021`) before `tz` is invoked. Recreate or repair the profile before
> retrying; do not run the build unchanged.
>
> **NEVER run `tz build` or `tz pack` directly** — the CLI runner handles both internally.


> **RPK:** A standalone resource project is marked by `tizen_resource_project.yaml` and
> is packaged internally with `tizen package -t rpk -- <project>`, not `tz build`.
> A .NET project with `pack_as_rpk: true` remains a DotNET project and builds through its
> normal .NET flow. Both produce `.rpk`; neither may be launched after installation.
> The RPK packager crashes (`StringIndexOutOfBoundsException` in PropertyParser.getKey) on an
> `sdk.info` with a comment header or BOM, as written by installers ≤ 1.1.1. The runner repairs
> the file before every build and, if it did, adds a `Repaired <sdk>/sdk.info: …` warning.

## DALi / Platform projects require C++17

Tizen 9.0 `dali2` headers use `std::string_view` and `std::any`. A DALi project that
does not select C++17 fails inside `/usr/include/dali*`, which reads as a broken SDK
rather than a missing build setting.

The build script preflights this and **exits 4 before GBS runs** when a project
declares a `dali2-*` dependency but no C++17 setting. The only fix is in the project:

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

Add it to `CMakeLists.txt` before `add_executable()`, then rebuild.

**Do not** attempt `gbs build --define "optflags -std=c++17"`. The spec's `%build`
runs plain `cmake`, so rpm optflags never reach the compiler, and CMake composes its
own `-std` flag from `CMAKE_CXX_STANDARD` regardless. This is a dead end, not a
slower path to the same result.

## On failure — read the errors before retrying

The failure envelope already contains the compile errors. You do NOT need to open the
host log file to find out what broke:

- `errors[0].message` — headline, the diagnostic lines (compiler errors first), and the
  full-log path.
- `errors[0].details` — the same diagnostic lines as a string array, for structured use.

Rules:

1. **Report the actual diagnostic** (file, line, message) to the user — never just
   "빌드 실패" or a bare log path.
2. **Never re-run the same build unchanged.** An identical rebuild produces an identical
   failure. Retry only after the cause is addressed, or when the envelope points to a
   specific fix (e.g. exit 3 → `tizen-dotnet-setup`).
3. **Do not guess the cause** when `details` names it. `Full log:` is only for cases where
   the diagnostics are empty or insufficient.

## Handoff

- **Single-task** (e.g., "빌드해줘") → DONE. Report the envelope per the "결과 보고" rules
  (verbatim fenced `json` block first, then a 1–2 line summary), suggest next steps.
- **Multi-step** (e.g., "빌드해서 설치해줘") → Continue to next step.
- SDK or `tz` not found → `tizen-sdk-install`
- DotNET build fails with exit 3 (dotnet not found) → `tizen-dotnet-setup` then retry
- Platform build fails with exit 4 (DALi without C++17) → add `set(CMAKE_CXX_STANDARD 17)`
  to the project's `CMakeLists.txt`, then retry
- `--clean` fails with exit 5 (build output could not be fully removed — a file
  is locked by an editor/emulator/sdb) → the build is deliberately aborted, NOT
  run incrementally; close the locking process and retry
- No project → `tizen-create-project`

**Suggested next steps (only when user asks):**

- `tizen-install-app` — install built `.tpk`/`.wgt`/`.rpk`/`.rpm` to device/emulator
  - RPK is resource-only: install the `.rpk` without `--run`. The runner internally uses
    direct `sdb install` for RPK; do not replace it with `tz install`.
  - Platform (GBS) builds produce `.rpm` packages (not `.tpk`/`.wgt`).
    RPMs are output to `~/GBS-ROOT/local/repos/<arch>/RPMS/` and **can** be installed
    via `tizen-install-app` (which supports `.rpm` — it handles `sdb root on`, `rpm -i`,
    and app execution as `owner` user with proper Wayland/DBus environment internally).
    **NEVER run `sdb` or `rpm` directly** — always use `tizen-install-app` for RPM installation.

- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
