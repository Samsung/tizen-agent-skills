---
name: tizen-launch-emulator
description: Tizen launch emulator, 타이젠 에뮬레이터 실행, 에뮬레이터 켜기, 에뮬레이터 시작, emulator launch, start emulator, em-cli launch, 에뮬레이터 부팅, 에뮬레이터 켜줘, launch emulator VM, start emulator VM. Use this skill to launch an existing Tizen emulator VM via em-cli. If no VM name is given, launches the first VM from the list. Waits for the emulator to connect via sdb.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
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

# Tizen Launch Emulator

## When to use

The user wants to launch (boot) an existing Tizen emulator VM via em-cli. If no VM name is given, the first VM from `em-cli list-vm` is launched. After launching, the skill waits for the emulator to connect via sdb.

> **Note:** For **creating** emulator VMs, use `tizen-create-emulator`. For **device discovery** (find connected devices) or **stopping emulators**, use `tizen-device-manager`. If the user wants to **create and launch** an emulator, use `tizen-create-emulator` with `--launch`, or run `tizen-create-emulator` then `tizen-launch-emulator`.

## Command

```
tizen-cli tizen-sdk launch-emulator
```

| Option                | Required | Default | Description                                                        |
| --------------------- | -------- | ------- | ------------------------------------------------------------------ |
| `--vm-name <name>`    | no       | —       | Emulator VM name to launch (default: first VM from `em-cli list-vm`)|
| `--timeout <seconds>` | no       | `300`   | Max time to wait for the VM to appear in `sdb devices` (1–540). Returns as soon as it connects; does **not** stop the emulator when the time is up |

### Examples

```bash
# Launch the first available VM (default behavior)
tizen-cli tizen-sdk launch-emulator

# Launch a specific VM
tizen-cli tizen-sdk launch-emulator --vm-name my-vm

# Wait up to 120 s for the VM to show up in sdb devices (a wait cap, not a run duration —
# the emulator keeps running afterwards; stop it with device-manager --action stop)
tizen-cli tizen-sdk launch-emulator --vm-name my-vm --timeout 120
```

## Output

- **Success** `result`: `device_serial` (e.g. `emulator-26101`), `device_type` (`emulator`), `vm_name` (or `null`), `status: "launched"`, `timeout_sec` (the wait cap in effect), `waited_ms` (actual wait), `emulator_keeps_running: true`, and on WSL `homescreen_fix` (see below). The timeout never shuts the emulator down (issue #98).
- Failure: emulator/sdb errors — surface `message`; SDK not installed → run `sdk-install` first; no VMs exist → run `create-emulator` first.
- `emulator_boot_failed`: `errors[0].details` carries a layered boot diagnosis (KVM state, missing libraries, Qt xcb, WSL) plus the untouched script output tail as `raw: ...` lines — relay the details; run `errors[0].suggested_fix.command` (the `--hw-virtualization yes` modify) once if present, then retry the launch once.
- Java/JNA error (em-cli crashed before touching the VM): host problem, not a VM problem — relay the `raw: ...` detail lines (they carry the actual Java error, e.g. `NoClassDefFoundError: com/sun/jna/Native`), then have the user run `download-emulator-package` to reinstall the emulator package and verify the SDK's bundled JRE. `tizen-cli tizen-sdk --doctor` probes em-cli health up front.
  - **EXCEPTION:** a `NoSuchFieldError` / `NoSuchMethodError` trace (real case `java.lang.NoSuchFieldError: isVirgl`) is NOT a reinstall case — the emulator-manager core and the platform's emulator plugin are at mismatched versions. Run `update-package` (long-running download), then retry the identical launch once. If it fails again, stop and report; do not reinstall the emulator package.

## WSL: home screen crash loop (automatic)

On WSL the standard `tizen` profile's home screen (`org.tizen.homescreen`, a Flutter
app) fails to pick an EGL config when launched through launchpad and aborts;
`starter` then retries it forever, leaving an "Unable to launch
org.tizen.homescreen." dialog on screen while crash dumps fill `/opt`.

The launch flow fixes this automatically and reports `homescreen_fix` in `result`:

| Value | Meaning |
|---|---|
| `ok` | Home screen healthy, guest untouched |
| `fixed` | Retry loop and popup stopped, dumps cleared, home screen started directly |
| `popup_fixed` | Retry loop stopped, home screen deliberately not started (`TIZEN_HOMESCREEN_LAUNCH=0`) |
| `fix_failed` | Retry loop stopped but the home screen would not come up — use the TV profile |
| absent | The check does not apply (real device, TV/wearable image, non-WSL host) |

Apply it to an already-running emulator without relaunching:

```bash
tizen-cli tizen-sdk emulator-manager --action fix-homescreen [--vm-name <name>]
```

(`fix-homescreen` is one action of the `emulator-manager` command; for its other actions —
`detail`, `modify`, `reset`, `create-image` — see the `tizen-create-emulator` skill.)

When relaying `fixed`, mention both caveats: the home screen runs as **root** rather
than the session user, and it does **not** survive a guest reboot (the launch flow
re-applies it). Restore stock behaviour with
`sdb -s <serial> shell "systemctl --global unmask starter.service starter.path"` plus
a guest reboot. Tunables: `TIZEN_HOMESCREEN_CHECK` (`auto`|`force`|`off`),
`TIZEN_HOMESCREEN_LAUNCH`, `TIZEN_HOMESCREEN_MASK_STARTER`,
`TIZEN_HOMESCREEN_CHECK_TIMEOUT`, `TIZEN_HOMESCREEN_VERIFY_DELAY`.

> **Note:** sdb is a tool which is located in <TIZEN_SDK>/tools

## Scope: launch-emulator vs device-manager vs create-emulator

| Task | Use this skill (`tizen-launch-emulator`) | Use `tizen-device-manager` | Use `tizen-create-emulator` |
|------|:---:|:---:|:---:|
| Launch an **existing** emulator VM by name | ✅ | | |
| Launch the **first available** VM (no name) | ✅ | | |
| Find connected device via sdb | | ✅ | |
| Stop/shut down running emulator VMs | | ✅ | |
| Create an emulator VM | | | ✅ |
| List available platforms/templates | | | ✅ |
| List existing VMs | | | ✅ |
| Delete a VM | | | ✅ |

> **Rule of thumb:**
> - If the user wants to **launch/start/boot** an existing emulator → use `tizen-launch-emulator`.
> - If the user wants to **create** an emulator VM → use `tizen-create-emulator`.
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

- Use `result.device_serial` with `tizen-cli tizen-sdk install-app --serial <serial> ...` or the debug commands.
