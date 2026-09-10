---
name: tizen-device-manager
description: Tizen device manager, 타이젠 디바이스 관리, 디바이스 연결, sdb devices, 디바이스 찾기, 에뮬레이터 중지, TV 에뮬레이터, Samsung TV emulator, TV emulator. Use this skill to find connected Tizen devices via sdb or stop/shut down running emulator VMs. For creating an emulator VM, use tizen-create-emulator. For launching an existing emulator VM, use tizen-launch-emulator. Supports both standard Tizen and Samsung TV emulator profiles.

metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
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


## Command

```
tizen-cli tizen-sdk device-manager
```

| Option                | Required | Default            | Description                                                                          |
| --------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------ |
| `--action <action>`   | no       | `start`            | `start` (find connected device) or `stop` (shut down emulators)                      |
| `--timeout <seconds>` | no       | `300`              | Emulator connection wait time (1–540)                                                |
| `--vm-name <name>`    | no       | `tizen-vm-default` | Emulator VM name to look for (this command never creates or starts a VM)             |
| `--profile <profile>` | no       | `tizen`            | Emulator profile: `tizen` (standard) or `tv` (Samsung TV; requires TV SDK extension) |

Behavior: if a device is already connected via sdb it is returned immediately. If no device is found, the envelope returns `device_not_found` and directs the user to `tizen-create-emulator` (to create a VM) and `tizen-launch-emulator` (to launch a VM). This skill does **not** create or launch emulators itself — that is handled by the dedicated skills to avoid ambiguity.

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

- If `device_not_found`, direct the user to `tizen-create-emulator` then `tizen-launch-emulator`.
- Use `result.device_serial` with `tizen-cli tizen-sdk install-app --serial <serial> ...` or the debug commands.
