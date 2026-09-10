---
name: tizen-create-emulator
description: Tizen create emulator, 타이젠 에뮬레이터 생성, custom emulator, 커스텀 에뮬레이터, em-cli, 에뮬레이터 만들기, 에뮬레이터 VM 생성, 에뮬레이터 사이즈, 에뮬레이터 해상도, emulator size, emulator resolution, list platforms, list templates, list VMs, delete emulator, 에뮬레이터 삭제, TV 에뮬레이터 생성, emulator-manager, 에뮬레이터 수정, 에뮬레이터 정보, 에뮬레이터 초기화, 에뮬레이터 이미지 캡처, modify emulator, emulator detail, emulator RAM, reset emulator, create emulator image, full em-cli surface. Use this skill to CREATE a custom Tizen emulator VM with a user-selected screen size (default 1080) plus configurable platform and profile via em-cli. Supports listing available screen sizes/platforms/templates/VMs, creating new VMs, and deleting VMs. It also documents the `emulator-manager` command — the full em-cli surface, including inspecting a VM's resolution/RAM (detail), modifying an existing VM, resetting its disk, and capturing it as a platform image. For LAUNCHING (booting) an existing emulator VM, use tizen-launch-emulator instead.
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
    - emulator size
    - 에뮬레이터 사이즈
    - emulator resolution
    - delete emulator
    - TV 에뮬레이터
    - emulator-manager
    - 에뮬레이터 수정
    - 에뮬레이터 정보
    - 에뮬레이터 초기화
    - modify emulator
    - emulator detail
    - reset emulator
---

# Tizen Create Emulator

## When to use

The user wants to create a custom Tizen emulator VM at a particular screen size, list available screen sizes/platforms/templates/VMs, or delete an existing VM. Uses em-cli from `{TIZEN_SDK_PATH}/tools/emulator/bin/em-cli`.

Also use this skill for the rest of the em-cli surface — inspecting a VM's resolution/RAM, modifying an existing VM, resetting its disk, or capturing it as a platform image — via the `emulator-manager` command; see [Beyond create-emulator](#beyond-create-emulator-the-emulator-manager-command).

## Before creating: offer the screen size — MANDATORY

**⚠️ CRITICAL: For a create request you MUST ask the user which screen size via
AskUserQuestion, and you MUST NOT create until they have answered.** Creating without
having asked is a bug. This applies to bare requests like "에뮬레이터 생성해줘" too —
"the user didn't mention a size" is the case this step exists for, NOT a reason to skip.
**The 1080 default is the option you pre-select inside the question, not permission to
skip it.**

**This is enforced by the command, not just by this document.** Creating without
`--size` returns a `user_input_required` failure whose message already lists the
supported sizes — so a forgotten question gets you the size menu back instead of a VM.
`--assume-defaults` bypasses it for **non-interactive runs only**; if you can ask, ask.

Resolution is a property of the emulator's device template — `em-cli create` has no
width/height flag — so the size list must come from the SDK. **Run this first, before
anything else:**

```bash
tizen-cli tizen-sdk create-emulator --action list-template --profile tizen
```

`result.available_sizes` (e.g. `["1080", "720"]`) and `result.template_details` (name +
resolution per template) are the menu. Present those with **AskUserQuestion**, `1080`
first and labelled `(기본값/Recommended)`, then create with `--size <chosen>`.

The ONLY cases where you skip the question:
1. The user's own message already named a size ("720 에뮬레이터 만들어줘") → pass it straight through.
2. The user provided a raw disk image path (`--raw-image-path`) → the disk image determines the VM, so size/template selection is skipped entirely. Do NOT ask for a size in this case.

## Command

```
tizen-cli tizen-sdk create-emulator
```

| Option                | Required      | Default  | Description                                                                                                          |
| --------------------- | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `--action <action>`   | no            | `create` | `create`, `list-platform`, `list-template`, `list-vm`, or `delete`                                                   |
| `--vm-name <name>`    | create/delete | —        | Emulator VM name (required for create/delete)                                                                        |
| `--size <size>`       | **create**    | —        | Screen size: `1080`, `720`, `3840`, or a full resolution like `1920x1080`. Ask the user; omitting it fails with `user_input_required`. |
| `--assume-defaults`   | no            | `false`  | Use 1080 without asking. **Non-interactive runs only** — if you can ask, ask.                                        |
| `--platform <name>`   | no            | auto     | Platform image name (auto-detect if omitted for create)                                                              |
| `--template <name>`   | no            | —        | Exact template name (e.g. `HD1080 Tizen`). Overrides `--size`; normally prefer `--size`.                             |
| `--profile <profile>` | no            | `tizen`  | `tizen` (standard) or `tv` (Samsung TV; requires TV SDK extension)                                                   |
| `--launch`            | no            | `false`  | Launch the VM after creating (create action only). **Omit entirely for create-only** — do NOT pass `--launch false`. |
| `--raw-image-path <path>` | no       | —        | Directory holding raw disk images (create only). Creates a VM from a raw disk image instead of a template — skips size/template selection. em-cli prompts for confirmation; the runner auto-answers 'y'. |

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
# Create at the size the user picked
tizen-cli tizen-sdk create-emulator --vm-name my-vm --size 1080
tizen-cli tizen-sdk create-emulator --vm-name my-vm --size 720

# Non-interactive only: take the 1080 default without asking
tizen-cli tizen-sdk create-emulator --vm-name my-vm --assume-defaults

# Create with a specific platform (no launch)
tizen-cli tizen-sdk create-emulator --vm-name my-vm --size 1080 --platform tizen-10.0-x86_64

# Create a TV emulator VM at 3840x1080
tizen-cli tizen-sdk create-emulator --vm-name my-tv-vm --profile tv --size 3840

# Create and launch immediately (--launch — waits up to 300s for boot)
tizen-cli tizen-sdk create-emulator --vm-name my-vm --size 1080 --launch

# Create from a raw disk image (skips size/template selection; confirmation auto-answered)
tizen-cli tizen-sdk create-emulator --vm-name my-vm --raw-image-path /path/to/raw-images --platform tizen-10.0-x86_64

# List available platforms (default profile: tizen)
tizen-cli tizen-sdk create-emulator --action list-platform

# List available TV platforms (profile: tv)
tizen-cli tizen-sdk create-emulator --action list-platform --profile tv

# List the supported screen sizes (templates + resolutions)
tizen-cli tizen-sdk create-emulator --action list-template --profile tizen

# List existing VMs
tizen-cli tizen-sdk create-emulator --action list-vm

# Delete a VM
tizen-cli tizen-sdk create-emulator --action delete --vm-name my-vm
```

## Beyond create-emulator: the `emulator-manager` command

`create-emulator` exposes five actions (`create`, `list-platform`, `list-template`,
`list-vm`, `delete`). The sibling command `emulator-manager` runs the **full em-cli
surface** on the same core — same options, same envelopes — and is the only way to reach
the remaining actions:

```
tizen-cli tizen-sdk emulator-manager --action <action> [options]
```

| Action           | What it does                                                                 | Reachable via `create-emulator`? |
| ---------------- | ---------------------------------------------------------------------------- | :------------------------------: |
| `create`         | Create a VM (same as above)                                                  | ✅ |
| `delete`         | Delete a VM                                                                  | ✅ |
| `list-platform`  | List platform images                                                         | ✅ |
| `list-template`  | List device templates / supported sizes                                      | ✅ |
| `list-vm`        | List existing VMs (`--detail` for per-VM resolution/RAM, `--count` for just the number) | ✅ |
| `detail`         | Inspect one VM (`--vm-name`), or the emulator manager itself (omit the name)  | ❌ |
| `modify`         | Change an existing VM's template/size, RAM, skin, file sharing, or acceleration | ❌ |
| `reset`          | **Destructive** — format the VM's disk, deleting every app installed on it    | ❌ |
| `create-image`   | Capture a VM as a platform image into `--output-dir` (must already exist)     | ❌ |
| `launch`         | Boot a VM — prefer the dedicated `launch-emulator` (see `tizen-launch-emulator`) | ❌ |
| `fix-homescreen` | Re-apply the WSL home screen fix to an already-running VM without relaunching — documented in `tizen-launch-emulator` | ❌ |

Reading an existing VM's screen size and RAM comes from `--action detail` or
`--action list-vm --detail` — the plain `list-vm` output carries names only.

Options specific to these actions:

| Option                        | Applies to        | Notes                                                                 |
| ----------------------------- | ----------------- | --------------------------------------------------------------------- |
| `--ram-size <mib>`            | create, modify    | `512`, `768`, or `1024`                                               |
| `--skin <number>`             | create, modify    | `1` general-purpose, `2` profile-specific                             |
| `--file-sharing-path <path>`  | create, modify    | Host directory shared with the VM                                     |
| `--hw-virtualization <yes\|no>` | create, modify  | CPU virtualization                                                    |
| `--hw-gl-acceleration <yes\|no>` | create, modify | Hardware GL acceleration                                              |
| `--custom-path <path>`        | create            | Custom base disk image path                                           |
| `--output-dir <path>`         | create-image      | Destination directory — em-cli will **not** create it                 |
| `--compress`                  | create-image      | Compress the captured image                                           |
| `--confirm`                   | **reset**         | Required; without it `reset` fails with `user_input_required`          |
| `--detail`                    | list-* , detail   | Full per-record detail (this is where resolution and RAM come from)   |
| `--count`                     | list-vm           | Report only the VM count (takes precedence over `--detail`)           |

**`reset` deletes data — confirm with the user first.** It formats the VM's disk image and
removes every app installed on it. The command gates this itself: without `--confirm` it
returns `user_input_required` rather than proceeding, so ask the user, then retry with
`--confirm`. Never pass `--confirm` on the user's behalf without having asked.

```bash
# Inspect one VM (resolution, RAM, template)
tizen-cli tizen-sdk emulator-manager --action detail --vm-name my-vm

# List every VM with per-VM detail
tizen-cli tizen-sdk emulator-manager --action list-vm --detail

# Change an existing VM's size and RAM
tizen-cli tizen-sdk emulator-manager --action modify --vm-name my-vm --size 720 --ram-size 1024

# Reset a VM's disk (destructive — ask the user first)
tizen-cli tizen-sdk emulator-manager --action reset --vm-name my-vm --confirm

# Capture a VM as a platform image (output dir must exist)
tizen-cli tizen-sdk emulator-manager --action create-image --vm-name my-vm --output-dir /path/to/existing-dir --compress
```

## Output

- **Create success** `result`: `vm_name`, `platform`, `template`, `size`, `resolution`, `size_applied`, `profile`, `launched`, `device_serial` (if launched), `raw_image_path` (if created from raw image), `status: "created"`.
- **List-platform success** `result`: `platforms` (array), `count`, `profile` (`tizen` or `tv`).
- **List-template success** `result`: `templates` (array), `template_details` (array of `{name, profile, resolution, size, ram}`), `available_sizes` (array), `default_size`, `count`, `profile`.
- **List-vm success** `result`: `vms` (array), `count`.
- **Delete success** `result`: `vm_name`, `action: "delete"`, `status: "deleted"`.
- Failure: em-cli errors — surface `message`; a missing `--size` returns `user_input_required` and an unsupported one returns `invalid_parameters`, both listing the supported sizes (ask the user, then retry); SDK not installed → run `sdk-install` first; TV SDK not installed → run `tizen-tv-sdk-install`.
- `size_applied: false` means em-cli rejected the template and the VM was created at em-cli's own size — tell the user, and point at the `em-cli modify` command in the warnings.

## Scope: create-emulator vs launch-emulator vs device-manager

| Task                                        | Use this skill (`tizen-create-emulator`) | Use `tizen-launch-emulator` | Use `tizen-device-manager` |
| ------------------------------------------- | :--------------------------------------: | :-------------------------: | :------------------------: |
| Create a **custom** emulator VM             |                    ✅                    |                             |                            |
| List available platforms/templates          |                    ✅                    |                             |                            |
| List existing VMs                           |                    ✅                    |                             |                            |
| Delete a VM                                 |                    ✅                    |                             |                            |
| Inspect a VM's resolution/RAM (`detail`)    |                    ✅                    |                             |                            |
| Modify / reset a VM, capture it as an image |                    ✅                    |                             |                            |
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

- Use `tizen-launch-emulator` to launch the created VM (if not already launched with `--launch`).
- Use `tizen-device-manager` to find a connected device.
- Use `result.device_serial` (when launched) with `tizen-cli tizen-sdk install-app --serial <serial> ...` or the debug commands.
