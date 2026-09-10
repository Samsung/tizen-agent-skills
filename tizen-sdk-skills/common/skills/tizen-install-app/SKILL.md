---
name: tizen-install-app
description: Tizen install app, 타이젠 앱 설치, tpk 설치, wgt 설치, rpk 설치, rpm 설치, 앱 패키지 설치, tizen app install, run app, run the app, launch app, 앱 실행, 실행해줘, 앱 실행해줘, 타이젠 앱 실행, run MyApp. A Tizen executable app runs on a DEVICE/EMULATOR, never on the host — for any request to run/launch an executable Tizen app or project folder, use THIS skill. Installs *.tpk / *.wgt / *.rpk / *.rpm on a connected device or emulator. RPK is resource-only and must be installed without launching. RPM packages from GBS (Platform) builds ARE executable apps — pass --run to launch their /usr/bin binary on the device. Automatically manages device/emulator discovery and installation.

metadata:
  author: Samsung Electronics
  last-updated: "2026-07-14"
  keywords:
    - Tizen install app
    - tpk install
    - wgt install
    - app install
    - 타이젠 앱 설치
    - tpk 설치
    - wgt 설치
    - install tizen application
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-install-app` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-install-app`)
2. 수집된 입력(패키지 경로, 설치 후 실행 여부)을 프롬프트로 전달
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
node "$CLI" install --package "<package-path>"
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" install --package "<package-path>"
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
# Install only (do NOT launch the app):
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" install --package "<package-path>"

# Install and launch the app:
node "$CLI" install --package "<package-path>" --run
```

### Codex CLI — run the install as a job (one exec call waits ≤ 30 s)

Under Codex CLI a tool call returns after at most 30 s; installing a large package on an emulator
(`sdb push` + `tz install` + launch verification with `--run`) often takes longer, and the call
would come back with only the runner's header while the install keeps running (issue #48). Add
**`--background`**: the runner returns a job receipt (`result.job_id`) within a second, then poll
`node "<same lib/cli dir>/job-cli.js" wait --id <job_id>` (≤ 25 s per call; `progress_tail`/
`log_file` show the live script output) until `job.state` is `done` — that response **is** this
runner's envelope. A result that shows only progress lines and no `{ "status": … }` JSON is not a result.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb needs a localhost TCP socket and the install writes the device state under `<sdk>-data`, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments (flags)

- **`--package`** (required) — absolute path to `.tpk`, `.wgt`, `.rpk`, or `.rpm`
- **`--device-serial`** (optional) — device serial; omit to auto-select the single connected device
- **`--run`** (optional) — flag to launch an executable app after install. **It is invalid for `.rpk`**; it is valid for `.tpk`, `.wgt`, and `.rpm`. Omit entirely for install-only — do NOT pass `false` or `no`, just omit it.

If user provides a project directory instead of a package path, build first with `tizen-build-project`.

Exit code: `0` = success envelope, `1` = failure/error envelope.

With `--run`, the success envelope carries two launch fields: `app_launched`
(the launch was accepted) and `app_running` (the app was still alive seconds
later). For `.tpk`/`.wgt` the running check is the `app_launcher -S` list; for
`.rpm` it is a `pgrep` poll of the `/usr/bin/<name>` process. `null` = not
verifiable (install-only, or `-S` unusable on this profile).

## RPK packages

An `.rpk` is a resource package, not a launchable app. It may come from a standalone
resource project (`tizen_resource_project.yaml`) or a .NET project configured with
`pack_as_rpk: true`. Always install it through this runner **without `--run`**. The runner
uses direct `sdb install` internally because `tz install` accepts `.tpk` and `.wgt`, not
`.rpk`. Do not run `sdb` yourself.

If installation reports `Invalid certificate chain` or a device package-manager failure,
the RPK was **not installed**. Do not enable root, copy CA/signer files into the emulator,
or use `pkgcmd` as a fallback. Hand off to `tizen-certificate-manager` to repair or select
the signing profile, rebuild, and retry this runner once.

## RPM (Platform) packages

An `.rpm` from a `tizen-build-project` Platform (GBS) build — e.g. the `dali-demo`
template — **is an executable app**, not a resource package; do not confuse it with
`.rpk`. The runner installs it with `sdb push` + `rpm -ivh` (after `sdb root on`) and,
with `--run`, launches `/usr/bin/<name>` directly as user `owner` (uid 5001) with the
Wayland/DBus environment set — platform apps are not registered with `app_launcher`, so
they have no home-screen icon and `app_id` is `null` in the envelope. `app_launched` /
`app_running` are still real: both come from the `pgrep` poll of the launched binary.

The runner also writes `~/bin/run-<name>.sh` on the host so the app can be re-launched
later without re-installing the RPM. Never run `sdb`, `rpm`, or the binary yourself.

**Note:** If no device is connected, emulator cold boot may take 5–7 minutes.

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Handoff

- **Single-task** (e.g., "앱 설치해줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "앱 설치하고 실행해줘") → Continue to next step.
- SDK not installed → `tizen-sdk-install`
- Device creation failed → `tizen-device-manager`
- **`app_running: false` in a success envelope** → the app launched but exited right after start. For `.tpk`/`.wgt` the most common cause is a full `/opt` partition (crash dumps; `/opt` is separate from `/`): use the `tizen-sdb-helper` skill's storage-triage commands (`df -h /opt`) and `clean-crash-dumps` recipe — the cleanup requires `sdb root on` first. For `.rpm` the envelope `warnings` carry the device-side `app-log:` lines from `/tmp/<name>.log` plus a hint (display-server/`owner` problem, or missing `dali`/`dali-toolkit` runtime RPMs) — report those, not the `/opt` advice.
- **Certificate/signing error** ("Invalid certificate chain", "Check certificate error") → `tizen-certificate-manager` to generate author cert + create signing profile, then rebuild with `tizen-build-project` passing the profile name, then retry install. **NEVER attempt `sdb root on` or manual cert installation.**

**Suggested next steps (only when user asks):**

- **WebApp 자동화 테스트 (권장)** — `tizen-playwright-test`
  ```
  <앱 이름> 을 위한 playwright 테스트를 홈 밑의 tizen-playwright-test 폴더에 스캐폴딩해줘
  ```
  테스트 프로젝트 스캐폴딩 및 Playwright로 자동화 테스트 (웹앱 전용)

- Re-run an executable app (use `--run`; valid for `.tpk`/`.wgt`/`.rpm`, never for `.rpk`)
- Debugging: 
  - Native → `tizen-gdb-debug`
  - DotNET → `tizen-dotnet-debug`
  - WebApp → `tizen-webapp-debug` (Chrome DevTools 또는 Playwright attach)
