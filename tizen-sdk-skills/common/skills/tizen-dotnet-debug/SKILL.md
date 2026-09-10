---
name: tizen-dotnet-debug
description: Tizen DotNET debug, tizen dotnet debug, 타이젠 닷넷 디버깅, netcoredbg, C# 디버깅, .NET 원격 디버깅, NUI 앱 디버그. Use this skill for automated remote debugging of Tizen .NET apps ONLY with netcoredbg — device check, on-demand debugger install, app start, PID lookup, and either an interactive CLI attach command or a VS Code DAP server. NEVER use for WebApp (.wgt) projects — web apps have no CoreCLR process and the script will refuse them.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - Tizen dotnet debug
    - netcoredbg
    - C# debug
    - .NET remote debug
    - 타이젠 닷넷 디버깅
    - NUI 디버그
    - coreclr debug
---

## Do NOT use for Web apps (IMPORTANT)

**Never run this flow for a WebApp (.wgt) project, even if the user asks to "debug the app".**
Web apps run inside the web runtime — there is no CoreCLR process for netcoredbg to attach to,
and the script auto-detects wgt packages on the device and refuses them with an error.
When the project is a WebApp:

- Do not attempt `tizen-dotnet-debug` or `tizen-gdb-debug` at all.
- Use the **`tizen-webapp-debug`** skill instead — it sets up RWI/CDP (Chrome DevTools
  Protocol) debugging and returns a ready CDP endpoint.
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native;
  `.csproj` → DotNET) before choosing a debug flow.

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-dotnet-debug` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-dotnet-debug`)
2. 수집된 입력(App ID, 모드, 브레이크포인트)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**
```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*dotnet-debug-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\dotnet-debug-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" <appId> [launch|attach|-] "File.cs:line" <port> <serial>
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:
```
node "<found-path>" <appId> <attach|launch> "File.cs:line" <port> <serial>
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**
```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/dotnet-debug-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" <appId> [launch|attach|-] "File.cs:line" <port> <serial>
```

### Codex CLI — run the setup as a job (one exec call waits ≤ 30 s)

The setup starts the app, polls for its PID (up to `--timeout`, default 30 s), installs
netcoredbg on the device on first use (tens of MB over sdb) and waits for it to appear — it
routinely passes Codex's 30 s per tool call, after which only the runner's header comes back
while the setup keeps running (issue #48). Add **`--background`**: the runner returns a job
receipt (`result.job_id`) within a second, then poll `node "<same lib/cli dir>/job-cli.js" wait
--id <job_id>` (≤ 25 s per call; `progress_tail`/`log_file` show the live script output) until
`job.state` is `done` — that response **is** this runner's envelope with the attach command.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: sdb port forwarding and netcoredbg need localhost sockets, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

1. **appId** (required) — Tizen package ID, e.g. `org.tizen.example.MyApp`. The runner resolves the launchable app id from the device (`app_launcher -l`) itself; if the package is not installed it fails with `invalid_parameters` and lists what is installed — do not guess ids.
2. **mode** (optional, **default `launch`**; `-` = default) — `launch` or `attach`. **Launch is the default and the recommended mode** for .NET: the app starts under a netcoredbg DAP server and catches `Main()`. `attach` only when the user explicitly asks — on Tizen a normally-launched .NET app has no CoreCLR debug transport, so attach fails (`0x80131c08`).
3. **breakpoints** (optional, `-` for none) — C# breakpoints as `File.cs:line`, comma-separated. Ask user which file/line.
4. **port** (optional, default `4711`, launch mode only) — DAP server port
5. **serial** (optional) — device serial (default: first connected device)

**Ask the user for the breakpoint(s)**; confirm the mode only if they mention attach. Fall back to launch mode with no breakpoints if the user has no preference.

> **Launch mode does not show the app on screen — that is expected.** The app is started under netcoredbg and *suspended before `Main()`* until VS Code connects (F5). A blank/absent app window after a successful envelope is **not** a failed launch (issue #97). Say this to the user in your first sentence.

Exit code: `0` = success envelope, `1` = failure/error envelope.

## Result Handling

- **Launch mode (success):** First sentence to the user: *"The app is running under netcoredbg but suspended before `Main()` — it shows no window until you press F5 in VS Code; this is expected."* (`result.note` starts with exactly this; `result.app_state` is `suspended_under_debugger`.) Then relay `result.launch_config` and guide: create `.vscode/launch.json`, set breakpoint, press F5. Never tell the user the launch failed because no window appeared.
- **Attach mode (success):** Relay `result.debug_command` verbatim — BOTH `powershell` and `cmd` forms. The leading `&` is PowerShell-only.
- **App not installed (failure, `invalid_parameters` "is not installed on the device"):** Do NOT retry with guessed ids. `errors[0].details` lists the ids the device knows — show them, then route to `tizen-install-app` if the app is missing.
- **Debug launch refused (failure, `io_error` "did not start ... under netcoredbg"):** `errors[0].details` carries the raw `launch_app` output — show it verbatim. The image may not support `__AUL_SDK__` debug launch; do not fall back to raw `sdb shell` commands.
- **Release build detected (failure, `build_failed`):** Do NOT proceed. Guide user to rebuild with Debug (`tizen-build-project`), reinstall (`tizen-install-app`), then retry.
- **No device (failure, `device_not_found`):** → `tizen-device-manager`

The runner is **setup-only** — it returns debug commands/configs for the user. Do NOT start interactive sessions yourself.

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

- WebApp (.wgt) → netcoredbg/gdb cannot debug web apps → `tizen-webapp-debug` (RWI/CDP)
- SDK not installed → `tizen-sdk-install`
- .NET workload missing → `tizen-dotnet-setup`
- App not built/installed → `tizen-build-project` (Debug) then `tizen-install-app`
- No device/emulator → `tizen-device-manager`
- Native (C/C++) app → `tizen-gdb-debug`
