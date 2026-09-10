---
name: tizen-create-emulator
description: Tizen create emulator, 타이젠 에뮬레이터 생성, custom emulator, 커스텀 에뮬레이터, em-cli, 에뮬레이터 만들기, 에뮬레이터 VM 생성, emulator VM create, 에뮬레이터 사이즈, 에뮬레이터 해상도, emulator size, emulator resolution, 1080 에뮬레이터, 720 에뮬레이터, list platforms, list emulator templates, 에뮬레이터 템플릿, list VMs, delete emulator, 에뮬레이터 삭제, TV 에뮬레이터 생성, Samsung TV emulator create. Use this skill to CREATE a custom Tizen emulator VM with a user-selected screen size (default 1080) plus configurable platform and profile via em-cli (located at {TIZEN_SDK_PATH}/tools/emulator/bin/em-cli). Supports listing available screen sizes/platforms/templates/VMs, creating new VMs, and deleting VMs. Templates here are EMULATOR VM templates (screen sizes/resolutions) — for APP/project templates, use tizen-create-project instead. For LAUNCHING (booting) an existing emulator VM, use tizen-launch-emulator instead.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-31"
  keywords:
    - Tizen create emulator
    - custom emulator
    - em-cli
    - 에뮬레이터 생성
    - 커스텀 에뮬레이터
    - emulator VM
    - list platform
    - list template
    - delete emulator
    - TV 에뮬레이터
---

## Step 1 (create only): ask the user which screen size — MANDATORY

**⚠️ CRITICAL: For the `create` action you MUST ask the user which screen size via
AskUserQuestion, and you MUST NOT run `create` until they have answered.**
Running `create` without having asked is a bug — the whole point of this step is that
the user picks the size. This applies to EVERY create request, including bare ones like
"에뮬레이터 생성해줘" / "create an emulator".

**This is enforced by the runner, not just by this document.** `create` without `--size`
returns a `user_input_required` failure whose message already lists the supported sizes —
so if you forget to ask, you get the size menu back instead of a VM. Ask the user with
that menu, then re-run with `--size`.

**The 1080 default is NOT permission to skip the question.** It is the option you
pre-select *inside* the question. "The user didn't mention a size" is the case this step
exists for — it is not a reason to proceed. Never auto-pick, never assume, never
"just use the default and mention it afterwards".

> `--assume-defaults` exists to use 1080 without asking. It is for **non-interactive
> callers only** (scripts, CI). If you have the AskUserQuestion tool, using it is a bug —
> ask instead.

The ONLY cases where you skip the question:
1. **The user's own message already named a size** ("720 에뮬레이터 만들어줘", "3840으로 만들어줘") → pass that size straight through with `--size`.
2. **The user provided a raw disk image path** (`--raw-image-path`) → the disk image determines the VM, so size/template selection is skipped entirely. Do NOT ask for a size in this case.

Resolution is a property of the emulator's device template — `em-cli create` has no
width/height flag — so the size list must come from the SDK, not from memory.

1. Run the `list-template` action for the target profile (see the CLI Runner section
   below for the runner path). **This is the FIRST command you run for a create
   request** — before `list-vm`, before anything else:

   ```bash
   node "$CLI" list-template --profile tizen    # or --profile tv
   ```

   `result.template_details` gives `{name, profile, resolution, size, ram}` per template,
   and `result.available_sizes` the bare size keys (e.g. `["1080", "720"]`).

2. Present those sizes with **AskUserQuestion**, one option per size, each showing the
   resolution — e.g. `1080 — 1920x1080 (HD1080 Tizen)`. **List `1080` first and label it
   `(기본값/Recommended)`.** Only present sizes the SDK actually reported; never invent
   one. If the SDK reported only one size, you may proceed with it without asking.

3. Create with the chosen size: `--size <chosen>`.

If the user answers "아무거나" / "기본으로" to your question, that IS an answer — use
`--size 1080`. The difference from skipping is that they were asked.

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. **⚠️ 필수: 먼저 위 Step 1대로 AskUserQuestion으로 사용자에게 사이즈를 물어보세요.**
   서브에이전트에는 AskUserQuestion tool이 없으므로, 사이즈 선택은 호출자(당신)의
   책임입니다. **물어보지 않고 서브에이전트에 위임하면 사용자는 선택 기회를 영구히
   잃습니다** — 이는 버그입니다.
2. Agent tool로 `tizen-create-emulator` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-create-emulator`)
3. 사용자의 요청 + 선택된 사이즈를 프롬프트로 전달 (예: "my-vm 이름으로 720 사이즈 에뮬레이터 생성")
4. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
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
node "$CLI" <action> [options]
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" <action> [options]
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/emulator-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/emulator-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" <action> [options]
```

> **⚠️ Do NOT collapse those three lines into
> `ls "$HOME"/.{claude,cline}/... | sort | tail -1`.** `sort` orders the whole path, so
> `.cline` always beats `.claude` and you end up running the other tool's plugin copy —
> which is how a new flag-style command (`list-template --profile tizen`) ends up in an
> old positional runner and gets read as `vm=--profile, platform=tizen`. Plain `sort` is
> also lexicographic, so `10.0.0` loses to `2.0.0`. The version above prefers this
> host's own root (`CLAUDECODE` in Claude Code, `GEMINI_CLI` in Gemini CLI, `CODEX_*`
> in Codex CLI), falls back host by host, and compares versions with `sort -V`.

### Codex CLI — the 30-second tool window

Codex's exec tool returns after at most 30 s (`yield_time_ms` max 30000); on Windows its
follow-up `wait` has been seen reporting "Script completed" with only the runner's
`[tizen-emulator] …` progress line while the runner was still running (issue #48). So:

- Pass `yield_time_ms: 30000` on every runner call. `list-*`, `detail`, `create` (without
  `--launch`), `modify` and `delete` finish inside that window.
- **`create --launch` boots the emulator (up to 300 s) — never run it in the foreground
  under Codex.** Add `--background`: the runner returns a job receipt at once. Then poll:

  ```powershell
  node "$CLI" create --vm-name my-vm --size 1080 --launch --background
  # → result.job_id, e.g. 20260908T112233-a1b2c3
  $JOB = Join-Path (Split-Path $CLI) "job-cli.js"
  node "$JOB" wait --id <job_id>     # blocks ≤ 25 s; repeat while result.state is "running"
  ```

  (bash: `JOB="$(dirname "$CLI")/job-cli.js"`.) The finished `wait` response **is** the
  create envelope (plus a `job` block) — report it exactly as below.
- A tool result that shows only the progress line and no `{ "status": … }` JSON is not a
  result: the runner is still running. Re-run with `--background` rather than concluding.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: em-cli (a JVM) writes the VM under `<sdk>-data/emulator` and hangs on Windows when it cannot; `launch` opens sockets for sdb, and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Arguments

The action is the first positional argument; everything else is a flag.

| Argument              | Required      | Default  | Description                                                                                                          |
| --------------------- | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `<action>`            | no            | `create` | `create`, `list-platform`, `list-template`, `list-vm`, or `delete`                                                    |
| `--vm-name <name>`    | create/delete | —        | Emulator VM name                                                                                                     |
| `--size <size>`       | **create**    | —        | Screen size: `1080`, `720`, `3840`, or a full resolution like `1920x1080`. Ask the user (Step 1); omitting it fails with `user_input_required`. |
| `--assume-defaults`   | no            | off      | Use 1080 without asking. **Non-interactive callers only** — if you can ask, ask.                                     |
| `--platform <name>`   | no            | resolved | Platform image name (e.g. `tizen-10.0-x86_64`). Omitted → the runner picks the first `list-platform` image for the profile so `--size` still applies (it used to fall back to em-cli's 720p default). |
| `--template <name>`   | no            | —        | Exact template name (e.g. `HD1080 Tizen`). Overrides `--size`; normally prefer `--size`.                             |
| `--profile <profile>` | no            | `tizen`  | `tizen` (standard) or `tv` (Samsung TV)                                                                              |
| `--launch`            | no            | `false`  | Launch the VM after creating (create only). **Omit entirely for create-only** — do NOT pass `--launch false`.         |
| `--raw-image-path <path>` | no       | —        | Directory holding raw disk images (create only). Creates a VM from a raw disk image instead of a template. **Skips size/template selection** — the disk image determines the VM. em-cli prompts for confirmation; the runner auto-answers "y". |

> **⚠️ This runner accepts only `--profile tizen` or `tv` — never narrate a `mobile`
> profile.** The tizen|tv restriction is this runner's (and its wrapper script's) own
> validation; em-cli itself has no profile flag — a profile is a property of the
> installed platform's templates, and only the `tizen` and `tv` template sets are
> supported here. `mobile` is a real Tizen profile name elsewhere (MOBILE-X.Y platform
> packages, `profile_name:` in `sdb capability`), but passing it here fails validation.
> When you summarize the request back to the user (platform / size / profile), echo only
> the value actually being passed — write `tizen (default)` when the user didn't
> specify one.

### Examples

```bash
# Create at the size the user picked in Step 1
node "$CLI" create --vm-name my-vm --size 1080
node "$CLI" create --vm-name my-vm --size 720

# Non-interactive only: take the 1080 default without asking
node "$CLI" create --vm-name my-vm --assume-defaults

# Create with a specific platform
node "$CLI" create --vm-name my-vm --size 1080 --platform tizen-10.0-x86_64

# Create a TV emulator VM at 3840x1080
node "$CLI" create --vm-name my-tv-vm --profile tv --size 3840

# Create and launch immediately (waits up to 300s for boot)
node "$CLI" create --vm-name my-vm --size 1080 --launch

# Create a VM from a raw disk image (skips size/template selection;
# em-cli's confirmation prompt is auto-answered)
node "$CLI" create --vm-name my-vm --raw-image-path /path/to/raw-images --platform tizen-10.0-x86_64
```

### Creating a VM from a raw disk image

When `--raw-image-path` is given, the VM is created from a raw disk image instead
of a platform template. This bypasses the size/template selection (Step 1 is
skipped — no `--size` needed) because the disk image itself determines the VM's
configuration.

The underlying em-cli command is:
```
em-cli create -n <vm-name> -a <raw-image-path> -p <platform>
```

em-cli prompts for confirmation when using a raw image; the runner automatically
answers "y" so the command does not hang.


> **⚠️ Launch flag:** `--launch` is a boolean flag that defaults to off — omit it
> entirely for create-only. Do NOT pass `--launch false`; just omit it.
> Only pass it when the user explicitly asks to create AND launch in one step.

> **⚠️ Size vs template:** Pass `--size` (the user's choice), not `--template`. The
> size is resolved to the matching device template at runtime, per profile. Use
> `--template` only when the user names an exact template; it overrides `--size` and
> also satisfies the `user_input_required` gate.

> **⚠️ TV size fallback:** For `profile=tv`, some older SDK versions reject an explicit
> template with a Java/JNA error. The script then deletes the partial VM and retries once
> without the template, so the VM is still created — at em-cli's own size. When that
> happens the envelope reports `size_applied: false` plus a warning naming the
> `em-cli modify` command to apply the size afterwards. Tell the user the requested size
> was not applied.

> **⚠️ Partial VM cleanup:** If `em-cli create` fails, the script automatically attempts
> to delete the partial VM (`em-cli delete -n <vmName>`) before exiting. This prevents
> stale "VM already exists" errors on retry. If the automatic cleanup fails, run
> `em-cli delete -n <vmName>` manually before retrying.

```bash
# List available platforms (default profile: tizen)
node "$CLI" list-platform

# List available TV platforms (profile: tv)
node "$CLI" list-platform --profile tv

# List available templates + their resolutions (this is the size list for Step 1)
node "$CLI" list-template --profile tizen

# List existing VMs
node "$CLI" list-vm

# Delete a VM
node "$CLI" delete --vm-name my-vm
```

## Inspecting and changing an existing VM

The runner covers the whole em-cli surface, so you never need to shell out to
`em-cli` by hand.

```bash
# What size/RAM does each existing VM have? (--detail is what carries resolution)
node "$CLI" list-vm --detail

# One VM's resolution, RAM, skin, and CPU count
node "$CLI" detail --vm-name my-vm

# The emulator manager itself: version, workspace path, package version
node "$CLI" detail

# Change an existing VM's screen size — resolution lives on the template, so this
# swaps the template for you (same size resolution as create)
node "$CLI" modify --vm-name my-vm --size 1080

# Change hardware without recreating the VM
node "$CLI" modify --vm-name my-vm --ram-size 512 --hw-gl-acceleration no
node "$CLI" modify --vm-name my-vm --file-sharing-path /home/me/share

# Capture a VM's disk as a reusable platform image.
# --output-dir must ALREADY EXIST — em-cli will not create it.
node "$CLI" create-image --vm-name my-vm --output-dir /tmp/images --compress
```

`create` also accepts the hardware flags, so a VM can be built right the first time:

```bash
node "$CLI" create --vm-name my-vm --size 720 --ram-size 1024 --hw-gl-acceleration no
```

The create/modify envelopes include a `vm_detail` object read back from em-cli
*after* the change. Report that rather than the requested values — it is the
observed result, so it is the honest answer to "did my size actually apply?".

> **⚠️ `reset` is destructive.** `node "$CLI" reset --vm-name my-vm` formats the VM's
> disk image and deletes every app installed on it. Without `--confirm` it fails with
> `user_input_required` on purpose: **ask the user first**, then re-run with `--confirm`.
> Never add `--confirm` on your own initiative.

Exit code: `0` = success envelope, `1` = failure/error envelope.

> **Note:** With `--launch`, the runner waits up to 300s for the emulator to boot and connect via sdb. Claude Code: set the Bash tool timeout to 600000ms. Codex CLI: add `--background` and poll with `job-cli.js wait` (see "Codex CLI" above). sdb is located in {TIZEN_SDK}/tools.
> If the emulator never connects, the envelope is still `status: "success"` (the VM exists) but `result.launched` is `false`, `result.status` is `created_launch_timeout`, and a warning tells you to relaunch — do not report it as launched.

## Envelope Output

**Create success:**

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "platform": "tizen-10.0-x86_64",
    "template": "HD1080 Tizen",
    "size": "1080",
    "resolution": "1920x1080",
    "size_applied": true,
    "profile": "tizen",
    "launched": false,
    "device_serial": null,
    "raw_image_path": null,
    "status": "created"
  }
}
```

**List-template success — the size menu for Step 1:**

```json
{
  "status": "success",
  "result": {
    "templates": ["HD1080 Tizen", "HD720 Tizen"],
    "template_details": [
      {
        "name": "HD1080 Tizen",
        "profile": "tizen",
        "resolution": "1920x1080",
        "size": "1080",
        "ram": "512"
      },
      {
        "name": "HD720 Tizen",
        "profile": "tizen",
        "resolution": "1280x720",
        "size": "720",
        "ram": "512"
      }
    ],
    "available_sizes": ["1080", "720"],
    "default_size": "1080",
    "count": 2,
    "profile": "tizen"
  }
}
```

**List-platform success (profile=tizen):**

```json
{
  "status": "success",
  "result": {
    "platforms": ["tizen-10.0-x86_64"],
    "count": 1,
    "profile": "tizen"
  }
}
```

**List-platform success (profile=tv):**

```json
{
  "status": "success",
  "result": {
    "platforms": ["tv-samsung-7.0-x86_64"],
    "count": 1,
    "profile": "tv"
  }
}
```

**List-vm success:**

```json
{
  "status": "success",
  "result": {
    "vms": ["my-vm", "tizen-vm-default"],
    "count": 2
  }
}
```

**Create failure — em-cli version mismatch (SELF-HEAL):**

`error_code: TIZEN_SDK_EXEC_E002` / `error_category: package_version_mismatch` means
em-cli crashed with a `NoSuchFieldError`/`NoSuchMethodError` (real case
`java.lang.NoSuchFieldError: isVirgl`) — the emulator-manager core and the platform's
emulator plugin are at mismatched versions — or the pre-create probe refused the create
early (machine line `EMCLI_MISMATCH=1`). Do NOT reinstall the emulator package for this:

1. Run the envelope's `suggested_fix` update-package command. It downloads packages for
   minutes — run it in the background and wait for it to finish.
2. Retry the IDENTICAL create command ONCE. If it fails again, stop and report both
   envelopes.
3. Tell the user the update overwrites the platform's `emulator-v2/bin` host libraries,
   so any manual workarounds there must be re-applied.

Distinguish it from the plain Java/JNA case (`com/sun/jna`, `NoClassDefFoundError`):
that one stays a `tizen-download-emulator-package` reinstall. Escape hatch: setting
`TIZEN_EMCLI_GATE=off` skips the pre-create probe gate and lets the create proceed
warn-only (the create-time crash is still classified as `TIZEN_SDK_EXEC_E002`).

## Scope: create-emulator vs launch-emulator vs device-manager

| Task                                        | Use this skill (`tizen-create-emulator`) | Use `tizen-launch-emulator` | Use `tizen-device-manager` |
| ------------------------------------------- | :--------------------------------------: | :-------------------------: | :------------------------: |
| Create a **custom** emulator VM             |                    ✅                    |                             |                            |
| List available platforms/templates          |                    ✅                    |                             |                            |
| List existing VMs                           |                    ✅                    |                             |                            |
| Delete a VM                                 |                    ✅                    |                             |                            |
| Launch (boot) an **existing** emulator VM   |                                          |             ✅              |                            |
| Launch the **first available** VM (no name) |                                          |             ✅              |                            |
| Find connected device via sdb               |                                          |                             |             ✅             |
| Stop/shut down running emulator VMs         |                                          |                             |             ✅             |

> **Rule of thumb:**
>
> - If the user wants to **create** an emulator VM → use `tizen-create-emulator`.
> - If the user wants to **launch/start/boot** an existing emulator → use `tizen-launch-emulator`.
> - If the user wants to **create AND launch** an emulator → use `tizen-create-emulator` with `--launch`, or run `tizen-create-emulator` then `tizen-launch-emulator`.
> - If the user needs to **find a connected device** or **stop emulators** → use `tizen-device-manager`.

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

- **Single-task** (e.g., "에뮬레이터 만들어줘") → DONE. Report envelope, suggest next steps.
- **Multi-step** (e.g., "에뮬레이터 만들고 앱 설치해줘") → Continue to next step.
- SDK not installed → `tizen-sdk-install`
- No platform image installed → `tizen-sdk-install` (install emulator package)
- TV SDK not installed → `tizen-tv-sdk-install`

**Suggested next steps (only when user asks):**

- `tizen-launch-emulator` (launch the created emulator VM, if not already launched with `--launch`)
- `tizen-device-manager` (find a connected device)
- `tizen-build-project` (build project)
- `tizen-install-app` (install app)
- Debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
