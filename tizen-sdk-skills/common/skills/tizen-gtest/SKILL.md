---
name: tizen-gtest
description: Tizen gtest, g test, google test, native unit test, gtest 만들기, gtest 실행, 단위 테스트, 유닛 테스트, 구글 테스트, native app test, run gtest, unit test 실행, 테스트 빌드. TRIGGERS — gtest, google test, g test, unit test, 단위 테스트, 유닛 테스트, 구글 테스트, gtest 프로젝트, gtest 만들어줘, gtest 실행해줘, 테스트 빌드, test build, run unit tests, native unit test, 테스트 코드 실행. When the user asks to create, build, install or run Google Test (gtest) tests for a native Tizen app, ROUTE HERE FIRST and follow this skill — do NOT hand-write a gtest scaffold, do NOT run `tz build` by hand, and do NOT type raw `sdb` commands.

metadata:
  author: Samsung Electronics
  last-updated: "2026-11-24"
  keywords:
    - gtest
    - g test
    - google test
    - unit test
    - 단위 테스트
    - 유닛 테스트
    - 구글 테스트
    - gtest 프로젝트
    - gtest 실행
    - native test
    - test build
    - test_runner
    - run unit tests
---

> **Handoff notes:** Claude Code and Codex CLI may share this project. Before you start, run
> `handoff-cli.js show` (see the `tizen-handoff` skill) to catch up on what the other agent did.
> The runners used here record their own results there automatically; nothing to set up.

## Scope

Google Test for **native** Tizen projects (`tizen_native_project.yaml` with
`project_type: test_runner`). The full cycle is:

| Step | Action | Runner action |
|---|---|---|
| 1 | Create a gtest project (or reuse an existing one) | `create --type native --template gtest` |
| 2 | Add / edit the test sources in `src/*_test.cpp` | (plain file edits) |
| 3 | Build the test binary/package | `build --build-type Test` |
| 4 | Install the built `.tpk` on a device/emulator and launch it | `install --package <tpk> --run` |
| 5 | Run the installed test binary and read the gtest output | `tizen-sdb-helper` (shell action) |

Routing:

| User asks | Skill |
|---|---|
| Build the **app** (not tests), Debug/Release | `tizen-build-project` |
| Test a **web app** in a browser | `tizen-playwright-test` |
| Install only | `tizen-install-app` |
| The test run **crashed** / analyze a failure symptom | `tizen-dlog-analyzer` |
| Any other raw sdb question | `tizen-sdb-helper` |

### Claude Code (subagent delegation)

> If there is no Agent tool (e.g., Cline), go to the "CLI Runner" section below.

1. Call the `tizen-gtest` agent with the Agent tool (personal deployment or `tizen-sdk-skills:tizen-gtest`)
2. Pass the collected inputs (existing project path or new project name/parent path, target device) in the prompt
3. Pass the subagent's JSON Envelope to the user as-is — follow the "Result reporting" rules below
   (include the original text in a fenced `json` block, with only a 1–2 line summary below it)

### CLI Runner (Cline / Claude Code)

**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code's Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**

**Run the `node` line exactly as written and read the JSON envelope it prints to stdout. Do NOT redirect or capture the output (`> file`, `2>&1 | tee`, `Out-File`, `| Out-String`), do NOT wrap the line in `cmd /c`, `powershell -Command "…"` or any second shell, and do NOT mix shell dialects: `%TEMP%` and `2>nul` are cmd.exe only, `$env:TEMP` and `Out-File` are PowerShell only — in the other shell they are literal text or a parse error. A tool message that the command's completion or output "could not be observed / captured" means the terminal is still busy with an earlier command or its shell-integration hooks have broken, not that the runner failed: open a NEW terminal and re-run the SAME line unchanged. Runners that drive em-cli, sdb or a JVM can take 10–30 s and print the envelope only when they exit — wait for it rather than retrying with a redirect.**

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
_tz_o=; [ -z "${ZSH_VERSION:-}" ] || { [[ ! -o nomatch ]] || _tz_o=1; unsetopt nomatch; }; _tz_s=; CLI=; for _tz_d in "$BASE" "$HOME"/.claude "$HOME"/.cline "$HOME"/.codex "$HOME"/.gemini; do [ "$_tz_d" != "$BASE" ] || [ -z "$_tz_s" ] || continue; _tz_s=1; for _tz_f in "$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js; do [ -f "$_tz_f" ] || continue; _tz_v=${_tz_f#"$_tz_d"/plugins/cache/tizen-platform/tizen-sdk-skills/}; _tz_v=${_tz_v%%/*}; case $_tz_v in *[!0-9.]*|.*|*.|*..*|*.*.*.*) continue ;; *.*.*) ;; *) continue ;; esac; _tz_a=${_tz_v%%.*}; _tz_c=${_tz_v##*.}; _tz_b=${_tz_v#*.}; _tz_b=${_tz_b%.*}; if [ -z "$CLI" ] || [ "$_tz_a" -gt "$_tz_A" ] || { [ "$_tz_a" -eq "$_tz_A" ] && { [ "$_tz_b" -gt "$_tz_B" ] || { [ "$_tz_b" -eq "$_tz_B" ] && [ "$_tz_c" -gt "$_tz_C" ]; }; }; }; then CLI=$_tz_f; _tz_A=$_tz_a; _tz_B=$_tz_b; _tz_C=$_tz_c; fi; done; [ -z "$CLI" ] || break; done; unset _tz_s _tz_d _tz_f _tz_v _tz_a _tz_b _tz_c _tz_A _tz_B _tz_C; [ -z "$_tz_o" ] || setopt nomatch; unset _tz_o
node "$CLI" create --type native --template gtest --parent-path "<parent-dir>" --name "<AppName>"
# Step 3 — build the test binary/package (Test, not Debug):
# node "$CLI" build --project "<project-path>" --build-type Test
# Step 4 — install on the target and launch the test runner:
# node "$CLI" install --package "<project-path>/test/<pkgid>-<version>-<arch>.tpk" --run
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\project-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }; node "$CLI" create --type native --template gtest --parent-path "<parent-dir>" --name "<AppName>"
```

**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host's highest version and paste it into the `node "<found-path>"` step below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & dir /s /b "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul & ver >nul
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" create --type native --template gtest --parent-path "<parent-dir>" --name "<AppName>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

## Step 1 — create (or identify) the gtest project

- **Existing gtest project** (`project_type: test_runner` in `tizen_native_project.yaml`): skip creation.
- **New project**: run the `create` line from the CLI Runner block above. The template produces
  `src/main_test.cpp` (the Elementary UI shell that calls `RUN_ALL_TESTS()`) and
  `src/gtestsmoke_test.cpp` (sample tests — one passing, one **deliberately failing**;
  delete or replace them with the real tests).

## Step 2 — edit the test sources

The template's `src/gtestsmoke_test.cpp` shows the fixture style
(`TEST_F(TestSuite, ...)`, `ASSERT_*`/`EXPECT_*`). Add real tests in the same
files (or new `src/*_test.cpp` files) — plain file edits, no runner involved.
Keep the sample tests only for a smoke run; delete `test02`
(`ASSERT_TRUE(false)`) once real tests exist.

## Step 3 — build with `--build-type Test`

```
node "$CLI" build --project "<project-path>" --build-type Test
```

- `Test` builds the gtest runner binary and packages it as
  `<project>/test/<pkgid>-<version>-<arch>.tpk` — the package path comes back in
  `result.artifacts[0].path`. `Debug`/`Release` would build a plain app; for tests
  always pass `Test` explicitly.
- The arch comes from `tizen_native_project.yaml` (`arch: x86_64` = emulator). For a
  real ARM device, change `arch` in the yaml to `arm`/`aarch64` before building —
  the native gtest template has no `--arch` build flag.

## Step 4 — install and launch

```
node "$CLI" install --package "<artifacts path>" --run
```

**The app launches and exits immediately — that is SUCCESS for a test_runner, not a crash.**
The runner's envelope carries a warning ("launched but is no longer running …") that assumes a
normal app; ignore that advice here and go to Step 5 to read the actual test results. Only treat
it as a failure if Step 5 shows the binary cannot start at all (missing libs, `/opt` full).

## Step 5 — read the gtest results

The gtest output goes to the test binary's stdout, which is NOT in the runner envelope and NOT
reliably in dlog. Run the installed binary directly — route this through the `tizen-sdb-helper`
skill's runner (never type raw `sdb` yourself). The `$CLI` in the lines below is the
`sdb-helper-cli.js` runner, located with the same lookup form as above (see the
`tizen-sdb-helper` skill for its own copy-paste blocks):

```
node "$CLI" --request "root on"
node "$CLI" --request "run shell command /opt/usr/globalapps/<pkgid>/bin/<output_name>"
node "$CLI" --request "root off"
```

- `<pkgid>` is the package id from `tizen-manifest.xml` (envelope `result.app_id` from Step 4);
  `<output_name>` is `output_name` from `tizen_native_project.yaml` (e.g. `gtestsmoke`).
- `root on` is a confirmation-gated action: the runner returns a confirmation request — surface it
  to the user before proceeding. `root off` restores the device afterwards.

**Interpreting the output** (standard gtest format):

```
[==========] Running 2 tests from 1 test suite.
[ RUN      ] TestSuite.test01
[       OK ] TestSuite.test01 (0 ms)
[ RUN      ] TestSuite.test02
../src/gtestsmoke_test.cpp:31: Failure
[  FAILED  ] TestSuite.test02
[==========] 2 tests from 1 test suite ran. (0 ms total)
[  PASSED  ] 1 test.
[  FAILED  ] 1 test, listed below:
[  FAILED  ] TestSuite.test02
```

- `[  PASSED  ] N tests.` — all green.
- `[  FAILED  ]` lines name the failing suites/tests and the source `file:line` of each failure —
  report those verbatim, fix the test or the code, rebuild (Step 3), reinstall (Step 4), rerun (Step 5).
- EFL/Wayland `ERR` lines before the gtest output are the UI shell failing to open a window from
  the shell context — harmless for the test result; do not chase them.
- If the shell exits without printing a gtest banner, the binary did not start (wrong arch, missing
  lib) — check `uname -m` on the target vs the package arch, then route to `tizen-dlog-analyzer`.

## Result reporting — the envelope must always be shown to the user

Each runner's stdout JSON Envelope is **inside the tool result, so the user cannot see it**. In the
final answer:

1. Put the **Step 5 gtest output** (or, if the flow stopped earlier, that step's Envelope JSON)
   **verbatim, without modification or truncation** in a fenced `json`/text block (first item).
2. Below it, append a **1–2 line** summary — e.g. `✅ 1/2 gtest tests passed — TestSuite.test02
   failed at src/gtestsmoke_test.cpp:31 (intentional template failure)`.
3. If needed, add one line suggesting next steps.

- Expanding the gtest output into a prose list and omitting the raw lines is a **format violation** —
  the gtest summary is this skill's **result contract**.
- If steps were retried, include the output of the **last run**; mention earlier failures in at most
  one line.

## On failure — read the errors before retrying

1. **Never re-run the same step unchanged.** An identical retry produces an identical failure.
2. Build failure → `errors[0].message` already carries the compiler diagnostics; report
   file/line/message verbatim.
3. Install failure → device missing (`tizen-device-manager`), certificate rejected
   (`tizen-certificate-manager`).
4. Binary runs but no gtest banner → wrong package arch for the target, or `/opt` full
   (`tizen-sdb-helper` → `run shell command df -h /opt`; crash dumps under
   `/opt/usr/share/crash/dump`).
5. A test **failure is not a tool failure** — the flow succeeded; report the failing tests.

## Handoff

- **Single-task** (e.g., "gtest 실행해줘") → DONE. Report per the "Result reporting" rules, suggest next steps.
- SDK or `tz` not found → `tizen-sdk-install`
- No device/emulator → `tizen-device-manager` / `tizen-launch-emulator`
- Certificate rejected on a real device → `tizen-certificate-manager`
- Test run crashes the app → `tizen-dlog-analyzer` (`investigate --symptoms "<user's words>" <app-id>`)
- Built package for a real device rejected with "Invalid certificate chain" → the default
  developer certificate only installs on the emulator; create a Samsung/local profile with
  `tizen-certificate-manager`, rebuild, reinstall.
