---
name: tizen-device-manager
description: Tizen device manager, 타이젠 디바이스 관리, 디바이스 연결, sdb devices, 디바이스 찾기, 에뮬레이터 중지, TV 에뮬레이터, Samsung TV emulator, TV emulator. Use this skill ONLY to find connected Tizen devices via sdb (one device, or ALL of them with `list` — "show all connected devices", "연결된 디바이스 전체 목록") or stop/shut down running emulator VMs. NOT for problem reports — a crash, error, freeze, high CPU usage, memory growth, video/audio not playing, slow emulator, or any "investigate / analyze this issue" request belongs to dlog-analyzer even when it mentions the emulator or device (that command detects the device itself). For creating an emulator VM, use tizen-create-emulator. For launching an existing emulator VM, use tizen-launch-emulator. Supports both standard Tizen and Samsung TV emulator profiles.

metadata:
  author: Samsung Electronics
  last-updated: "2026-09-30"
  keywords:
    - Tizen device manager
    - sdb devices
    - tizen emulator
    - em-cli
    - 타이젠 디바이스
    - emulator launch
    - 디바이스 연결
    - TV 에뮬레이터
    - Samsung TV emulator
    - TV emulator
---

# Tizen Device Manager

## When to use

The user needs to find a connected Tizen device via sdb, or stop/shut down running emulator VMs. Supports both standard Tizen and Samsung TV emulator profiles.

> **Note:** This skill handles **device discovery** and **emulator stop** only. For **creating** an emulator VM, use `tizen-create-emulator`. For **launching** an existing emulator VM, use `tizen-launch-emulator`. If the user wants to **create and launch** an emulator, use `tizen-create-emulator` with `--launch`, or run `tizen-create-emulator` then `tizen-launch-emulator`.

> **Not a diagnostic command.** A problem report — crash, error, freeze, high CPU usage ("the emulator CPU went to 300%"), memory growth, video/audio not playing, slow emulator, "investigate / analyze this issue", 원인 분석해줘 — is `tizen-cli tizen-sdk dlog-analyzer`'s job even when it mentions the emulator or device: that command detects the device itself and returns `device_not_found` / `multiple_devices` when that is the real problem. Do not run device-manager "first, to find the device" before investigating.


## Command

```
tizen-cli tizen-sdk device-manager
```

| Option                | Required | Default            | Description                                                                          |
| --------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------ |
| `--action <action>`   | no       | `start`            | `start` (find ONE connected device), `list` (list ALL devices sdb reports) or `stop` |
| `--timeout <seconds>` | no       | `300`              | Emulator connection wait time (1–540)                                                |
| `--vm-name <name>`    | no       | `tizen-vm-default` | Emulator VM name to look for (this command never creates or starts a VM)             |
| `--profile <profile>` | no       | `tizen`            | Emulator profile: `tizen` (standard) or `tv` (Samsung TV; requires TV SDK extension) |

To see every connected device ("sdb devices" list), use `tizen-cli tizen-sdk device-manager --action list`. `result.devices[]` holds `{ serial, state, device_type }` (`state`: `device` / `offline` / `locked` / `unauthorized`, or any other state as sdb prints it, e.g. `no permissions`; `device_type`: `emulator` / `usb` / `remote`), with `device_count` and `online_count`. Zero devices is a success envelope with a warning, not an error.

Behavior (`start`): if a device is already connected via sdb it is returned immediately. If no device is found, the envelope returns `device_not_found` and directs the user to `tizen-create-emulator` (to create a VM) and `tizen-launch-emulator` (to launch a VM). This skill does **not** create or launch emulators itself — that is handled by the dedicated skills to avoid ambiguity.

### TV Emulator

Use `--profile tv` to look for a connected Samsung TV emulator via sdb:

```
tizen-cli tizen-sdk device-manager --profile tv --vm-name tizen-tv-vm
```

If no TV emulator is connected, the envelope returns `device_not_found` and directs the user to:
1. `tizen-create-emulator` with `--profile tv` — to create a TV emulator VM
2. `tizen-launch-emulator` — to launch the TV emulator VM

**Prerequisite:** TV SDK extension must be installed. Use `tizen-tv-sdk-install` skill first.

## Output

- Success `result`: `device_serial` (e.g. `emulator-26101`), `device_type` (`emulator` \| `usb`), `device_profile` (`tizen` \| `tv`).
- Failure: emulator/sdb errors — surface `message`; SDK not installed → run `sdk-install` first; TV SDK not installed → run `tizen-tv-sdk-install`.

## Result reporting — the envelope MUST be shown to the user

The JSON envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **buried inside the
tool result and invisible to the user** (the Claude Code UI collapses Bash output into a
"Ran 1 shell command" line). Run directly in a terminal, the JSON is plainly visible, but in an
agent session the user sees only the final answer text. The final answer therefore follows this format:

1. Include the envelope JSON **verbatim, without edits or truncation** in a fenced `json` block (first item).
   Exclude `[DEBUG] ...` lines from stderr — they are not part of the envelope.
2. Below it, add a **1–2 line** summary of the result (the key `result` values, or the gist of `errors[0].message`).
3. If useful, add one line suggesting next steps.

- Expanding the envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general writing guidance ("don't put code in prose", etc.) —
  the envelope is not code; it is this skill's **result contract**.
- If the command was run several times, include the envelope from the **last run** and mention
  earlier failures in a single line of the summary.
- Include a failure envelope verbatim as well. Do not retype `errors[0].message`/`details`; show what is
  inside the JSON as-is.
- Show a `user_input_required` envelope as-is, then ask the user the question.

## Follow-ups

- If `device_not_found`, direct the user to `tizen-create-emulator` then `tizen-launch-emulator`.
- Use `result.device_serial` with `tizen-cli tizen-sdk install-app --serial <serial> ...` or the debug commands.
