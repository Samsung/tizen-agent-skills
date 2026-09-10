---
name: tizen-build-project
description: Build a Tizen app/project (Native, DotNET, WebApp, standalone RPK resource package, or Platform/GBS). TRIGGERS — 빌드, 빌드해줘, 앱 빌드, 앱 빌드해줘, 프로젝트 빌드, 타이젠 빌드, 타이젠 앱 빌드, RPK 빌드, build, build app, build the app, build project, tz build, gbs build, build native/dotnet/webapp/rpk/platform. When the user asks to build (빌드), ROUTE HERE FIRST and follow this skill — do NOT run tz/tizen/gbs by hand or debug PATH yourself; this command detects the project type and builds/packages correctly.

metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
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

# Build Tizen Project

## When to use

Any request to build a Tizen project. Do NOT run `tz`/`tizen`/`dotnet build` by hand or debug PATH yourself — this command detects the project type (Native/DotNET/WebApp/RPK/Platform) and builds + packages it.

## Prerequisites

Tizen SDK installed. For DotNET projects, `dotnet-setup` must have succeeded once.

## Command

```
tizen-cli tizen-sdk build-project --project <path>
```

| Option                  | Required | Default  | Description                                                      |
| ----------------------- | -------- | -------- | ---------------------------------------------------------------- |
| `--project <path>`      | **yes**  | —        | Project root directory                                           |
| `--build-type <type>`   | no       | `Debug`  | `Debug` \| `Release` \| `Test`                                   |
| `--sign-profile <name>` | no       | —        | Signing profile name                                             |
| `--arch <arch>`         | no       | `x86_64` | GBS platform builds: `armv7l` \| `aarch64` \| `i586` \| `x86_64` |
| `--clean`               | no       | off      | Remove previous build output on the SDK host before building — forces a full, non-incremental rebuild |

Builds can take a while — set the Bash tool timeout to 600000 ms.

For Native, DotNET, and WebApp projects, the command validates the requested (or active)
signing profile before compiling: its author and distributor certificate files must exist and
be readable. `signing_profile_invalid` (`TIZEN_SDK_CERT_E021`) means the build did not start;
repair/create the profile with `tizen-certificate-manager` and retry. Platform/GBS builds are
not subject to this check because they produce RPMs without `tz pack`.

### Clean (full) rebuilds

Builds are incremental by default: unchanged sources are not recompiled, so
compiler warnings from earlier runs do NOT reappear. Pass `--clean` when the
user asks for a clean/full rebuild ("클린 빌드", "전체 재빌드", "rebuild from
scratch") or when a pipeline needs the complete warning list. The deletion
happens **on the SDK host** (where the build runs) — removing `Debug/` etc.
yourself is a silent no-op when the MCP client runs on a different machine.
For tz builds `--clean` removes `Debug/`, `Release/`, `Test/` (plus `bin/`,
`obj/` for DotNET); for Platform builds it runs `gbs build --clean`.

If the removal cannot complete (a file inside is locked by an editor,
emulator, or sdb), the build **aborts with exit 5** instead of silently
continuing with a partial clean — an incremental build after a failed clean
would misreport itself as clean. Close the locking process and re-run.

## Project Type Detection

The command auto-detects the project type:

| Type     | Detection                                         | Build Method              |
| -------- | ------------------------------------------------- | ------------------------- |
| Native   | `tizen_native_project.yaml` or `project_def.prop` | `tz build` + `tz pack`    |
| DotNET   | `tizen_dotnet_project.yaml` or `*.csproj`         | `tz build` + `tz pack`    |
| WebApp   | `config.xml` or `index.html`                      | `tz build` + `tz pack`    |
| RPK      | `tizen_resource_project.yaml`                     | `tizen package -t rpk` (see below) |
| Platform | `tizen-manifest.xml` + `CMakeLists.txt`           | **GBS build** (see below) |

### RPK resource packages

A standalone resource project (marked by `tizen_resource_project.yaml`) is packaged internally
with `tizen package -t rpk -- <project>`, not `tz build`. A .NET project with `pack_as_rpk: true`
remains a DotNET project and builds through its normal .NET flow. Both produce `.rpk`; neither
may be launched after installation — install with `install-app` **without** `--run`.

### Platform (GBS) Builds

Platform projects use **GBS** instead of `tz build`. GBS is resolved via 3-level fallback:

1. **tizen-cli GBS plugin** — if a GBS plugin is installed in tizen-cli, it is used
2. **System-installed `gbs`** — if `gbs` is on PATH, it is used directly
3. **Neither found** — the error message provides installation guidance

The build script automatically:

- Preflights the DALi C++17 requirement (see below) and exits 4 before GBS if unmet
- Initializes a git repository if one doesn't exist (GBS requires git)
- Runs `gbs build -A <arch> --include-all` from the project directory
- Searches for `.tpk`/`.wgt`/`.rpm` artifacts in both the project dir and `~/GBS-ROOT`

### DALi projects require C++17

Tizen 9.0 `dali2` headers use `std::string_view` / `std::any`, so a DALi project built
at the toolchain default fails inside `/usr/include/dali*`. The fix belongs in the
project's `CMakeLists.txt`, before `add_executable()`:

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

`gbs build --define "optflags -std=c++17"` does **not** work around this — the spec's
`%build` runs plain `cmake`, so rpm optflags never reach the compiler.

## Output

- Success `result.artifacts`: array of `{ path, format, size_bytes }` — the produced `.tpk`/`.wgt`/`.rpk`/`.rpm` package paths. For Platform (GBS) builds, artifacts are `.rpm` files under `~/GBS-ROOT/local/repos/<arch>/RPMS/`. `warnings` may carry a build-output summary.
- Failure: the envelope already contains the compile diagnostics — `errors[0].message` carries the headline, the diagnostic lines (compiler errors first) and the full-log path; `errors[0].details` carries the same diagnostic lines as a string array. Read the host log file only when `details` is empty or insufficient.

### On failure — read the errors before retrying

1. **Report the actual diagnostic** (file, line, message) to the user — never just "빌드 실패" or a bare log path.
2. **Never re-run the same build unchanged.** An identical rebuild produces an identical failure. Retry only after the cause is addressed, or when the envelope points to a specific fix (e.g. dotnet not found → `dotnet-setup`; `signing_profile_invalid` → `certificate-manager`).
3. **Do not guess the cause** when `details` names it.

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

`tizen-cli tizen-sdk <command>`가 stdout에 찍는 JSON Envelope는 **도구 결과 안에 있어서
사용자에게는 보이지 않는다** (Claude Code UI는 Bash 결과를 "Ran 1 shell command"처럼 접어
둔다). 터미널에서 직접 실행하면 JSON이 그대로 보이지만, 에이전트 세션에서 사용자에게 보이는
것은 최종 답변 텍스트만이다. 따라서 최종 답변은 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
   stderr로 나오는 `[DEBUG] ...` 줄은 Envelope가 아니므로 제외한다.
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 명령을 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Follow-ups

- Install/run the artifact: `tizen-cli tizen-sdk install-app --package <result.artifacts[0].path> --run`
  - `.rpk` is resource-only: install it **without** `--run`.
