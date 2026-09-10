---
name: tizen-launch-emulator
description: Tizen launch emulator, 타이젠 에뮬레이터 실행, 에뮬레이터 켜기, 에뮬레이터 시작, emulator launch, start emulator, em-cli launch, 에뮬레이터 부팅, 에뮬레이터 켜줘, launch emulator VM, start emulator VM. Use this skill to launch an existing Tizen emulator VM via em-cli. If no VM name is given, launches the first VM from the list. Waits for the emulator to connect via sdb.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-31"
  keywords:
    - Tizen launch emulator
    - emulator launch
    - em-cli launch
    - 에뮬레이터 실행
    - 에뮬레이터 시작
    - 에뮬레이터 켜기
    - start emulator
    - emulator boot
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-launch-emulator` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-launch-emulator`)
2. 사용자의 요청을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*emulator-manager-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*emulator-manager-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*emulator-manager-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*emulator-manager-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\emulator-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" launch [--vm-name <name>] [--timeout <seconds>]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" launch [--vm-name <name>] [--timeout <seconds>]
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/emulator-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/emulator-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" launch [--vm-name <name>] [--timeout <seconds>]
```

### Codex CLI — the 30-second tool window

Codex's exec tool returns after at most 30 s (`yield_time_ms` max 30000), and a launch
waits up to 300 s for the boot. On Windows Codex's follow-up `wait` has been seen
reporting "Script completed" with only `[tizen-emulator] Launching VM: …` while the
runner was still running (issue #48). **Under Codex, always launch with `--background`:**

```powershell
node "$CLI" launch --vm-name my-vm --background

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: em-cli writes under `<sdk>-data/emulator`, qemu and sdb open localhost sockets, and the `--background` job must outlive this call, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.
# → result.job_id, e.g. 20260908T112233-a1b2c3
$JOB = Join-Path (Split-Path $CLI) "job-cli.js"
node "$JOB" wait --id <job_id>     # blocks ≤ 25 s; repeat while result.state is "running"
```

(bash: `JOB="$(dirname "$CLI")/job-cli.js"`.) The finished `wait` response **is** the
launch envelope (`result.device_serial`, plus a `job` block) — report it exactly as
below. A tool result that shows only the progress line and no `{ "status": … }` JSON is
not a result: the runner is still running.

## Arguments

1. **vmName** (optional) — emulator VM name to launch. If omitted, the first VM from `em-cli list-vm` is launched.
2. **timeoutSec** (1–540, default 300) — the **maximum time to wait for the emulator to appear in `sdb devices`**. It is a wait cap, not a run duration: the runner returns as soon as the VM connects (a warm boot takes 30–120 s, so a 300 s timeout usually ends early), and when the cap is hit it fails with `emulator_boot_failed`. **It never stops or closes the emulator** — there is no auto-shutdown after N seconds. To stop a running emulator use `tizen-device-manager` (`--action stop`). When a user asks for "a 300 second timeout", say this in one sentence so they do not expect the emulator to close (issue #98).

> **Note:** the runner resolves sdb from the SDK itself (`<TIZEN_SDK>/tools`) — do not look for it.

### Examples

```bash
# Launch the first available VM (default behavior)
node "$CLI" launch

# Launch a specific VM
node "$CLI" launch --vm-name my-vm

# Wait up to 120 s for the VM to show up in `sdb devices` (returns as soon as it connects;
# does NOT stop the emulator afterwards)
node "$CLI" launch --vm-name my-vm --timeout 120
```

Exit code: `0` = success envelope (with `result.device_serial`, `result.timeout_sec`, `result.waited_ms`, `result.emulator_keeps_running: true`), `1` = failure/error envelope.

> **Note:** Emulator cold boot may take 5–7 minutes. Claude Code: set the Bash tool timeout to **600000** (ms); the runner blocks until the emulator connects or the timeout expires. Codex CLI: use `--background` + `job-cli.js wait` (see "Codex CLI" above) — a foreground call cannot outlive Codex's 30 s window.

**Java/JNA prerequisite:** em-cli is a Java tool — it needs the SDK's bundled JRE and the
JNA jar shipped with the emulator package. If it crashes with a Java/JNA error
(`NoClassDefFoundError: com/sun/jna/Native`, `UnsatisfiedLinkError`, …), the failure envelope
carries the raw em-cli output as `raw: ...` lines in `errors[0].details` and a
`java_jna` diagnosis line. This is a host problem, not a VM problem: reinstall the emulator
package (`download-emulator-package`) and verify the SDK's bundled JRE runs. `doctor` probes
em-cli health (`em-cli list-vm`) and reports this state before any launch is attempted.
On a GUI host, launching once via Tizen Studio Emulator Manager can also repair the install.

EXCEPTION — a `NoSuchFieldError`/`NoSuchMethodError` trace (real case
`java.lang.NoSuchFieldError: isVirgl`) is NOT a reinstall case: the emulator-manager core
and the platform's emulator plugin are at mismatched versions. Run `tizen-update-package`
(long-running download — background it), then retry the identical launch once. If it fails
again, stop and report. The update overwrites the platform's `emulator-v2/bin` host
libraries, so manual workarounds there must be re-applied.

## Launch failure diagnosis (`error_category: emulator_boot_failed`)

em-cli reports every boot failure as the same "Failed to start this VM." line, so on
Linux/WSL2 the runner performs a layered diagnosis and returns it in
`errors[0].details` (plus `errors[0].suggested_fix.command` when the fix is a runner
command). The layers, in the order they mask each other:

| Layer | Detail line looks like | Fix |
|-------|------------------------|-----|
| em-cli crashed in its own Java runtime | `em-cli crashed inside its own Java runtime (JNA) ...` | Host problem, not a VM problem — the layers below don't apply. Reinstall the emulator package (`download-emulator-package`), verify the SDK's bundled JRE; the exact Java error is in the `raw: ...` detail lines |
| VM profile disables CPU virtualization | `vm_config hwVirtualization: false` + `/dev/kvm: present` | Run the suggested_fix: `node "$CLI" modify --vm-name <vm> --hw-virtualization yes`, then retry the launch ONCE |
| Kernel KVM unavailable | `/dev/kvm: missing` | WSL2: enable `nestedVirtualization` in `.wslconfig`; native Linux: load the kvm module / check BIOS VT-x |
| /dev/kvm not writable | `/dev/kvm: present (writable: no)` | `sudo usermod -aG kvm $USER`, then re-login |
| Missing system libraries | `missing libraries: libasound.so.2, ...` | Install host packages: `libasound2`/`libasound2t64`, `libsdl1.2debian`, `libv4l-0`/`libv4l-0t64` |
| Qt xcb plugin load failure | `Qt xcb platform plugin failed to LOAD ...` | Install the libxcb dependency set (`libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libxcb-shape0 libxcb-xinerama0 libxkbcommon-x11-0`) — the plugin file exists; its deps don't |

The `emulator.log: ...` detail lines are the tail of the VM's own log
(`~/tizen-sdk-data/emulator/vms/<vm>/logs/emulator.log`), and the `raw: ...` detail
lines are the untouched tail of the script's own stdout+stderr — the original
em-cli/Java error survives there even when no diagnosis layer matched, so a remote
client never has to read temp files on the SDK host. Note the diagnosis uses
`LD_LIBRARY_PATH=<sdk emulator bin> ldd` — SDK-bundled libraries (`libx264.so.142`,
`libicu*.so.48`) are NOT missing and are never reported; do not symlink system
libraries over them.

Only the `--hw-virtualization yes` fix is a runner command you may run yourself
(once, then retry the launch once). Package installation and WSL2 configuration are
the user's to do — surface the details and stop.

## WSL: home screen crash loop (automatic)

On WSL the standard `tizen` profile's home screen (`org.tizen.homescreen`, a
Flutter app) fails to pick an EGL config when launched through launchpad, aborts,
and `starter` retries it forever — leaving an "Unable to launch
org.tizen.homescreen." dialog on screen while crash dumps fill `/opt` until
unrelated things start failing.

The launch flow handles this automatically and reports `homescreen_fix` in the
result: `ok` (healthy), `fixed`, `popup_fixed`, `fix_failed`, or the field is
absent when the check does not apply. The fix masks starter's user units and
stops them in the running session, clears the crash dumps, and starts the home
screen directly (bypassing launchpad).

It only applies to the **standard tizen emulator profile on WSL** — real devices,
TV/wearable images and non-WSL hosts are skipped untouched.

To apply it to an already-running emulator without relaunching:

```bash
node <plugin>/lib/cli/emulator-manager-cli.js fix-homescreen [--vm-name <name>]
```

Two things to tell the user when reporting `fixed`: the home screen then runs as
**root** rather than the session user, and it does **not** survive a guest reboot
(the launch flow re-applies it). Stock behaviour is restored with
`sdb -s <serial> shell "systemctl --global unmask starter.service starter.path"`
plus a guest reboot.

| Variable | Default | Meaning |
|---|---|---|
| `TIZEN_HOMESCREEN_CHECK` | `auto` | `auto` = WSL + tizen emulator only, `force` = anywhere (unverified), `off` = never |
| `TIZEN_HOMESCREEN_LAUNCH` | `1` | `0` = stop the retry loop only, leave the display empty |
| `TIZEN_HOMESCREEN_MASK_STARTER` | `1` | `0` = leave starter alone |
| `TIZEN_HOMESCREEN_CHECK_TIMEOUT` | `30` | Seconds to poll for the crash signature after connect |
| `TIZEN_HOMESCREEN_VERIFY_DELAY` | `20` | Seconds to poll for the home screen after starting it |

## Scope: launch-emulator vs device-manager vs create-emulator

| Task | Use this skill (`tizen-launch-emulator`) | Use `tizen-device-manager` | Use `tizen-create-emulator` |
|------|:---:|:---:|:---:|
| Launch an **existing** emulator VM by name | ✅ | | |
| Launch the **first available** VM (no name) | ✅ | | |
| Find connected device via sdb | | ✅ | |
| Stop/shut down running emulator VMs | | ✅ | |
| Create a **custom** emulator VM | | | ✅ |
| List available platforms/templates | | | ✅ |
| List existing VMs | | | ✅ |
| Delete a VM | | | ✅ |

> **Rule of thumb:**
> - If the user wants to **launch/start/boot** an existing emulator → use `tizen-launch-emulator`.
> - If the user wants to **create** an emulator VM → use `tizen-create-emulator`.
> - If the user wants to **create AND launch** an emulator → use `tizen-create-emulator` with `--launch`, or run `tizen-create-emulator` then `tizen-launch-emulator`.
> - If the user needs to **find a connected device** or **stop emulators** → use `tizen-device-manager`.

## Envelope Output

**Success (`exit 0`):**

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "vm_name": "my-vm",
    "status": "launched",
    "timeout_sec": 300,
    "waited_ms": 48210,
    "emulator_keeps_running": true
  }
}
```

`vm_name` is `null` when the first VM from the list was launched (no name specified).
`timeout_sec` is the wait cap that was in effect and `waited_ms` how long the launch actually
took — the emulator stays running after the runner returns (`emulator_keeps_running`); the
timeout does not shut it down.

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

- **Single-task** (e.g., "에뮬 켜줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "에뮬 켜고 앱 설치해줘") → Continue to next step.
- SDK not installed → `tizen-sdk-install`
- No VMs exist → `tizen-create-emulator` (create one first)

**Suggested next steps (only when user asks):**

- `tizen-build-project` (build project)
- `tizen-install-app` (install app)
- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
