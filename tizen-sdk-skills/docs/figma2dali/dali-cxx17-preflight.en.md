# Blocking DALi C++17 Build Failures Before They Happen

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-08-03  
**License:** Apache License 2.0 ([LICENSE](../../LICENSE))

---

## Overview

Tizen 9.0 dali2 headers use `std::string_view` / `std::any`, so **a DALi project that does not select C++17 is guaranteed to fail.**

The problem is not that it fails — it's *how* it fails. The error points inside `/usr/include/dali*` rather than at code the author wrote, so it reads as "the SDK or the GBS root is broken." Getting from there to the actual cause (one missing line in CMakeLists.txt) costs several multi-minute GBS runs.

This change blocks it at two points:

1. **Before the build** — a preflight catches it before GBS starts and exits 4 immediately
2. **After the build** — if it still fails with this signature, the remedy is attached to the diagnostics as a HINT

---

## The Problem

### Symptom

Building a DALi Platform project with GBS fails like this:

```
[   42s] In file included from /usr/include/dali-toolkit/public-api/controls/control.h:22,
[   42s] /usr/include/dali/public-api/object/property-value.h:28:13: error: 'string_view' in
         namespace 'std' does not name a type
[   43s] make[2]: *** [CMakeFiles/dali-demo.dir/src/main.cpp.o] Error 1
[   44s] error: Bad exit status from /var/tmp/rpm-tmp.xxxx (%build)
```

The file the compiler names is not project source — it's a **platform-provided header**. So the first instinct is to look at the SDK version, the `.gbs.conf` profile, or BuildRequires. None of those is the cause.

### Root Cause

The Tizen 9.0 toolchain defaults to `gnu++14`. dali2 headers use C++17 types, so a project that does not state its standard collapses while the headers are being parsed.

### Why the optflags Workaround Fails

Injecting the standard at the rpm level does not work:

```bash
gbs build --define "optflags -std=c++17"   # no effect
```

Two reasons compound:

1. The spec's `%build` calls `cmake` directly without exporting `CXXFLAGS`. There is no path for rpm's `%{optflags}` to reach the compiler.
2. Even if it were passed via `CXXFLAGS`, CMake composes its own `-std` flag from `CMAKE_CXX_STANDARD` and appends it afterwards. The later flag wins.

This is a dead end, not a slower route. The fix is only possible in the project's CMakeLists.txt:

```cmake
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
```

---

## Changes

### 1. Preflight Before GBS

**File:** `common/scripts/tizen-build-project/tizen-build-project.sh`

Added `check_dali_cxx_standard()`, called at the **very top** of `build_platform_project()` — before even resolving the GBS executable. The failure is deterministic, so there is no reason to spend minutes reaching the same conclusion.

Decision procedure:

| Step | Action |
|------|--------|
| 1 | No `CMakeLists.txt` → pass (not in scope) |
| 2 | Collect files to scan — `CMakeLists.txt` plus `*.cmake` and `*.spec` up to 3 levels down |
| 3 | No `dali2?-(core\|adaptor\|toolkit)` match → pass (not a DALi project) |
| 4 | C++17-or-newer marker found → pass |
| 5 | Not found → exit 4 with the remedy printed |

Step 4 accepts any of these spellings, so it does not false-positive on however the author wrote it:

```
CMAKE_CXX_STANDARD[^0-9]*(17|20|23|26)
cxx_std_(17|20|23|26)
-std=(gnu|c)\+\+(17|1z|20|2a|23|2b|26)
```

`*.cmake` is scanned so projects that factor the setting into `include(cmake/flags.cmake)` are not flagged; `*.spec` is scanned because some projects pass `-DCMAKE_CXX_STANDARD=17` from `%build`.

The error output lists the files that were scanned, the CMake lines to add, and **a warning not to try optflags**. Without that last part, an agent walks back into the same dead end.

### 2. HINT in the Failure Diagnostics

**File:** `common/lib/core/output-summary.js`

Paths remain where this signature appears despite the preflight passing — the standard is set but overridden on a sub-target, or the build arrived as Native rather than Platform.

Added `buildFailureHints()`; `extractBuildDiagnostics()` prepends its output.

Detected signatures:

| Pattern | Example |
|---------|---------|
| `'<type>' in namespace 'std'` / `is not a member of 'std'` | `'string_view' in namespace 'std' does not name a type` |
| `std::string_view` / `std::any` + undeclared | `'std::any' has not been declared` |
| libstdc++ standard guard | `requires compiler and library support for the ISO C++ 2017 standard` |
| gcc's own note | `note: '-std=c++17' or '-std=gnu++17'` |

The three HINT lines emitted:

```
HINT: this compile is not running as C++17 — Tizen 9.0 dali2 headers use
      std::string_view / std::any, so C++17 is mandatory.
HINT: add `set(CMAKE_CXX_STANDARD 17)` and `set(CMAKE_CXX_STANDARD_REQUIRED ON)`
      to CMakeLists.txt, before add_executable().
HINT: `gbs build --define "optflags ..."` does NOT work around this — the spec runs
      plain `cmake`, so rpm optflags never reach the compile.
```

Hints are **exempt** from the `max` cap and `maxLineLength` truncation — truncating away the one actionable part would defeat the purpose. The cap applies to diagnostic lines only.

### 3. Skill Documentation

**Files:** `common/skills/tizen-build-project/SKILL.md`, `tizen-cli/skills/tizen-build-project/SKILL.md`

- Added a `DALi / Platform projects require C++17` section — the fix, and the optflags prohibition
- Added an `exit 4` entry to Handoff, matching the existing `exit 3` → `tizen-dotnet-setup` form

---

## Verification

### Preflight

Checked against 7 fixtures:

| Fixture | Setup | Expected | Result |
|---------|-------|----------|--------|
| `good` | Canonical template (`CMAKE_CXX_STANDARD 17`) | pass | pass |
| `bad` | C++17 lines removed | exit 4 | exit 4 |
| `bad2` | Explicit `CMAKE_CXX_STANDARD 11` | exit 4 | exit 4 |
| `okflags` | `add_compile_options(-std=gnu++17)` | pass | pass |
| `okmodule` | Set in `cmake/flags.cmake` | pass | pass |
| `okspec` | `-DCMAKE_CXX_STANDARD=17` in spec `%build` | pass | pass |
| `nondali` | No DALi deps, no C++17 | pass (not in scope) | pass |

### Unit Tests

**File:** `common/lib/tests/output-summary.test.js`

```bash
cd common/lib/tests
node output-summary.test.js
```

9 checks added:

- The three HINT lines precede the diagnostics
- The compiler diagnostic survives intact after the hints
- `std::any` and the libstdc++ ISO C++ 2017 guard also trigger it
- **Unrelated failures do not trigger it** (`fatal error: dali/dali.h: No such file` — DALi, but a different cause)
- Hints are not consumed by the `max` cap

All 6 pre-existing test files still pass.

---

## Deployment

`tizen-cli` inlines `common/lib` into its bundle via esbuild, so a rebuild picks up the JS change. The preflight is a shell script, so the script deployment path must be refreshed too.

```bash
cd tizen-cli
pnpm build
bash cline/setup/setup.sh
```

---

## Known Limitations

The preflight is a **static check**. A project that sets the standard conditionally inside `if(SOME_OPTION)` passes even when the condition is false. Change 2 (the HINT) catches those.

No bypass switch was added. Selecting C++17 is always harmless for a DALi project, and under the conditions that trigger the check (DALi dependency present, no C++17 spelling anywhere) there is no path to a successful build.

---

## Changed Files

| File | Change |
|------|--------|
| `common/scripts/tizen-build-project/tizen-build-project.sh` | New `check_dali_cxx_standard()`, called before GBS (exit 4) |
| `common/lib/core/output-summary.js` | New `buildFailureHints()`, prepended to diagnostics |
| `common/lib/tests/output-summary.test.js` | 9 checks added |
| `common/skills/tizen-build-project/SKILL.md` | C++17 section, exit 4 handoff |
| `tizen-cli/skills/tizen-build-project/SKILL.md` | C++17 section |
| `docs/platform-gbs-build.md` (+`.en`) | C++17 section, 2 troubleshooting entries, build flow updated |

---

## Related Documents

- [Platform App GBS Build Guide](../platform-gbs-build.en.md)
- [Build Failure Diagnostics](build-failure-diagnostics.en.md)
