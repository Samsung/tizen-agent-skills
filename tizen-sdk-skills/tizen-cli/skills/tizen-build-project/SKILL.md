---
name: tizen-build-project
description: Build a Tizen app/project (Native, DotNET, WebApp, standalone RPK resource package, or Platform/GBS). TRIGGERS — 빌드, 빌드해줘, 앱 빌드, 앱 빌드해줘, 프로젝트 빌드, 타이젠 빌드, 타이젠 앱 빌드, RPK 빌드, build, build app, build the app, build project, tz build, gbs build, build native/dotnet/webapp/rpk/platform. When the user asks to build (빌드), ROUTE HERE FIRST and follow this skill — do NOT run tz/tizen/gbs by hand or debug PATH yourself; this command detects the project type and builds/packages correctly.

metadata:
  author: Samsung Electronics
  last-updated: "2026-10-20"
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
| `--arch <arch>`         | no       | `x86_64` | GBS platform builds: `armv7l` \| `aarch64` \| `i586` \| `x86_64` — see "Target architecture" below |
| `--clean`               | no       | off      | Remove previous build output on the SDK host before building — forces a full, non-incremental rebuild |

Builds can take a while — set the Bash tool timeout to 600000 ms.

For Native, DotNET, and WebApp projects, the command validates the requested (or active)
signing profile before compiling: its author and distributor certificate files must exist and
be readable. `signing_profile_invalid` (`TIZEN_SDK_CERT_E021`) means the build did not start;
repair/create the profile with `tizen-certificate-manager` and retry. Platform/GBS builds are
not subject to this check because they produce RPMs without `tz pack`.

When **no profile is requested and none is active**, Native/DotNET/WebApp builds still succeed:
`tz` signs with the SDK's default developer certificates and the envelope carries a warning
starting "Signed with Tizen default developer certificates". Such a package installs on the
**emulator only** — real Samsung devices reject it with "Invalid certificate chain", so create a
profile and rebuild with `--sign-profile` before installing on hardware. Standalone RPK projects
get no such fallback (they are packaged by the legacy `tizen package -t rpk`) and are rejected
with `signing_profile_invalid` until a profile is created and activated.

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
| Platform | `packaging/*.spec` + `CMakeLists.txt` (root or nested) | **GBS build** (see below) |

Detection runs top-down, so a project with `tizen_native_project.yaml` is Native even if it also
has a `CMakeLists.txt`. `tizen-manifest.xml` is **not** a Platform marker — every Native app has
one. **GBS is used only for Platform projects**; Native, DotNET, WebApp and RPK builds never
invoke GBS, so a slow native build is `tz build` compiling, not GBS.

### RPK resource packages

A standalone resource project (marked by `tizen_resource_project.yaml`) is packaged internally
with `tizen package -t rpk -- <project>`, not `tz build`. A .NET project with `pack_as_rpk: true`
remains a DotNET project and builds through its normal .NET flow. Both produce `.rpk`; neither
may be launched after installation — install with `install-app` **without** `--run`.

### Platform (GBS) Builds

Platform projects use **GBS** instead of `tz build`. GBS is resolved via 3-level fallback:

1. **tizen-cli GBS plugin** — if a GBS plugin is installed in tizen-cli, it is used
2. **System-installed `gbs`** — if `gbs` is on PATH, it is used directly
3. **Neither found** — the script exits 6 and the envelope reports `gbs_not_found`
   (`TIZEN_SDK_BUILD_E002`) with the install command in `suggested_fix.command`. It needs
   `sudo`, so show it to the user instead of running it; do not retry the build until GBS is installed.

The build script automatically:

- Preflights the DALi C++17 requirement (see below) and exits 4 before GBS if unmet
- Initializes a git repository if one doesn't exist (GBS requires git)
- Runs `gbs build -A <arch> --include-all` from the project directory
- Searches for `.tpk`/`.wgt`/`.rpm` artifacts in the project dir, the local repo `gbs build` reports, and the GBS build root (`TIZEN_BUILD_ROOT`, then `buildroot` in `.gbs.conf`, default `~/GBS-ROOT`)

### Target architecture (`--arch`)

A Platform build produces RPMs for **one** CPU architecture. Without `--arch` it builds
**`x86_64`**, which installs only on the emulator — an x86_64 RPM on an ARM device fails at
`rpm -i`. Map the request:

| User says | Pass |
|---|---|
| emulator, x86, 에뮬레이터 (or nothing about the target) | `--arch x86_64` (default) |
| arm, armv7, armv7l, 32-bit ARM, 32비트 ARM | `--arch armv7l` |
| arm64, aarch64, 64-bit ARM, 64비트 ARM | `--arch aarch64` |
| i586, 32-bit x86 | `--arch i586` |

- **Ask when the target is unclear.** If the RPM is for a real device but no architecture is
  named, ask which one (`x86_64` / `armv7l` / `aarch64`) instead of silently building `x86_64`.
- **A connected device tells you.**
  `tizen-cli tizen-sdk sdb-helper --request "run shell command uname -m; ls -d /usr/lib*"`
  prints the CPU family and the library directories. `/usr/lib64` exists only on a 64-bit
  userspace (`aarch64`, `x86_64`); 32-bit images (`armv7l`, `i586`) have only `/usr/lib`.
  So `aarch64` / `x86_64` **with** `/usr/lib64` → `--arch aarch64` / `--arch x86_64`, and
  without it → `--arch armv7l` (any ARM) / `--arch i586` (x86). Check both: `uname -m`
  names the kernel, which is `aarch64` even under a 32-bit userspace.
- **Only these four names are accepted** — `arm`, `arm64` or `armv7` are rejected by the
  option's choices; map them as in the table. `--arch` has no effect on Native/DotNET/WebApp/RPK
  projects.

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

- Success `result.artifacts`: array of `{ path, format, size_bytes }` — the produced `.tpk`/`.wgt`/`.rpk`/`.rpm` package paths. For Platform (GBS) builds, artifacts are `.rpm` files under `<buildroot>/local/repos/<repo>/<arch>/RPMS/` (`buildroot` from `.gbs.conf`, default `~/GBS-ROOT`). `warnings` may carry a build-output summary.
- Failure: the envelope already contains the compile diagnostics — `errors[0].message` carries the headline, the diagnostic lines (compiler errors first) and the full-log path; `errors[0].details` carries the same diagnostic lines as a string array. Read the host log file only when `details` is empty or insufficient.

### On failure — read the errors before retrying

1. **Report the actual diagnostic** (file, line, message) to the user — never just "build failed" or a bare log path.
2. **Never re-run the same build unchanged.** An identical rebuild produces an identical failure. Retry only after the cause is addressed, or when the envelope points to a specific fix (e.g. dotnet not found → `dotnet-setup`; `signing_profile_invalid` → `certificate-manager`).
3. **Do not guess the cause** when `details` names it.

## Result reporting — the envelope MUST be shown to the user

The JSON Envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **buried inside
the tool result and invisible to the user** (the Claude Code UI collapses Bash output behind
a "Ran 1 shell command" line). Run directly in a terminal the JSON is visible as-is, but in
an agent session the user sees only the final answer text. Therefore the final answer MUST
follow this format:

1. Include the Envelope JSON **verbatim, unmodified and unabridged** in a fenced `json`
   block (as the first item). Exclude the `[DEBUG] ...` lines that go to stderr — they are
   not part of the Envelope.
2. Below it, append a result summary of **1–2 lines** only (the key values of `result`, or
   the gist of `errors[0].message`).
3. If useful, add one line suggesting the next step.

- Expanding the Envelope into a prose list and dropping the JSON is a **format violation**.
  This rule takes precedence over the harness's general writing guidance ("don't put code in
  prose" and the like) — the Envelope is not merely code, it is this skill's **result
  contract**.
- If the command ran more than once, include the Envelope of the **last run** and mention
  earlier failures in the summary line only, in a single line.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`
  — show what is inside the JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user the question.

## Follow-ups

- Install/run the artifact: `tizen-cli tizen-sdk install-app --package <result.artifacts[0].path> --run`
  - `.rpk` is resource-only: install it **without** `--run`.
