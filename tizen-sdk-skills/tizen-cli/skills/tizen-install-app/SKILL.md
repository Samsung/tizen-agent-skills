---
name: tizen-install-app
description: Tizen install app, 타이젠 앱 설치, tpk 설치, wgt 설치, rpk 설치, rpm 설치, 앱 패키지 설치, tizen app install, run app, run the app, launch app, 앱 실행, 실행해줘, 앱 실행해줘, 타이젠 앱 실행, run MyApp. A Tizen app runs on a DEVICE/EMULATOR, never on the host — for any request to run/launch a Tizen app or project folder, use THIS skill. Installs *.tpk / *.wgt / *.rpk / *.rpm on a connected device or emulator and optionally launches the app afterward. RPK is a resource package and cannot be launched. RPM packages from GBS (Platform) builds ARE executable apps — pass --run to launch their /usr/bin binary on the device.

metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
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

# Install (and Run) Tizen App

## When to use

Any request to install or run a Tizen app. A Tizen app runs on a device/emulator, never on the host — "run the app" = install with `--run`.

## Prerequisites

A built package (`.tpk`/`.wgt`/`.rpk`/`.rpm`) — build with `tizen-cli tizen-sdk build-project` if needed. For `.rpm` (Platform/GBS builds), use `--type platform` when building.

## Command

```
# Install only (do NOT launch the app — omit --run entirely):
tizen-cli tizen-sdk install-app --package <path>

# Install on a specific device (install only):
tizen-cli tizen-sdk install-app --package <path> --serial emulator-26101

# Install and launch the app:
tizen-cli tizen-sdk install-app --package <path> --run
```

| Option             | Required | Default | Description                               |
| ------------------ | -------- | ------- | ----------------------------------------- |
| `--package <path>` | **yes**  | —       | Absolute path to the `.tpk`/`.wgt`/`.rpk`/`.rpm` |

| `--serial <serial>` | no | auto | Target device serial (omit to auto-select the single connected device) |
| `--run` | no | off | Launch the app after installation. Valid for `.tpk`/`.wgt`/`.rpm`; **invalid for `.rpk`.** **Omit entirely for install-only** — do NOT pass `--run false` or `--run no`. |

## RPK packages

An `.rpk` is a resource package, not a launchable app. It may come from a standalone resource
project (`tizen_resource_project.yaml`) or a .NET project configured with `pack_as_rpk: true`.
Always install it through this command **without `--run`**. The command uses direct `sdb install`
internally because `tz install` accepts `.tpk` and `.wgt`, not `.rpk`. Do not run `sdb` yourself.

If installation reports `Invalid certificate chain` or a device package-manager failure, the RPK
was **not installed**. Do not enable root, copy CA/signer files into the emulator, or use `pkgcmd`
as a fallback. Hand off to `certificate-manager` to repair or select the signing profile, rebuild,
and retry this command once.

## RPM (Platform) packages

An `.rpm` from a Platform (GBS) build — e.g. the `dali-demo` template — **is an executable app**,
not a resource package; do not confuse it with `.rpk`. The command installs it with `sdb push` +
`rpm -ivh` (after `sdb root on`) and, with `--run`, launches `/usr/bin/<name>` directly as user
`owner` (uid 5001) with the Wayland/DBus environment set. Platform apps are not registered with
`app_launcher`, so they have no home-screen icon and `app_id` is `null` in the envelope;
`app_launched`/`app_running` still come from a `pgrep` poll of the launched binary. The command
also writes `~/bin/run-<name>.sh` on the host for re-launching without a re-install. Never run
`sdb`, `rpm`, or the binary yourself.

Installation on a cold emulator can be slow — set the Bash tool timeout to 600000 ms.

## Output

- Success `result`: `device_serial` used, install/launch status.
- Failure `device_not_found` (`TIZEN_SDK_DEVICE_E001`): no connected device — run `tizen-cli tizen-sdk device-manager` first, then retry with its `result.device_serial`.

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

- Native debugging → `tizen-cli tizen-sdk gdb-debug`
- .NET debugging → `tizen-cli tizen-sdk dotnet-debug`
