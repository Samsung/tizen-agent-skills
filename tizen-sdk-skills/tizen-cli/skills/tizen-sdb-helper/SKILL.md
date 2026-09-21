---
name: tizen-sdb-helper
description: sdb helper, sdb command, sdb shell, run shell command on the device, shell command, 쉘 명령 실행, sdb forward, forward port, port forward, port forwarding, 포트 포워딩, sdb reboot, reboot the device, 디바이스 재부팅, shutdown device, sdb root, root on, sendkey, launch app, kill app, list running apps, list installed packages, disk space df /opt. Runs ONE sdb action on a Tizen device — shell command, port forward, reboot/shutdown, launch/kill, root toggle, sendkey — with device auto-selection and confirmation gates on destructive actions. For ANY request that would be answered with an sdb command, ROUTE HERE FIRST — do NOT locate sdb or type `sdb ...` yourself. Connect to an IP → remote-device; install → install-app; push/pull → file-transfer; device logs of ANY kind (tail/show/save/clear logs, dlog) → dlog-analyzer (sdb-helper returns a handoff for them).
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-18"
  keywords:
    - sdb
    - sdb command
    - sdb shell
    - sdb forward
    - sdb reboot
    - port forward
    - sdb root
---

# Tizen sdb Helper

## When to use

User asks for a single sdb action on a Tizen device — run a shell command, port forward,
reboot, screen state, etc. The command matches the request to an intent, resolves the
correct sdb invocation, and either executes it (read-only) or returns it for confirmation
(gated/destructive). Device-log requests (tail/show/save/clear logs, dlog) are matched but
**handed off** to `tizen-cli tizen-sdk dlog-analyzer` (`--action log-dump` / `log-clear`).

**✅ ALWAYS run this command with the user's request — NEVER search for the sdb binary
(`which`/`where`/`Get-Command sdb`, `find -name sdb`), parse `sdb devices`, or type
`sdb ...` yourself (issue #96).** The only sdb line you may run directly is a gated
`result.command` the user has explicitly confirmed, copied verbatim.

## Command

```
tizen-cli tizen-sdk sdb-helper --request "<natural-language request>" [--serial <serial>]
```

| Option              | Required | Default | Description                                                                               |
| ------------------- | -------- | ------- | ----------------------------------------------------------------------------------------- |
| `--request <text>`  | **yes**  | —       | Natural-language sdb request (e.g., "run shell command ls -la", "reboot the device", "forward port 9229") |
| `--serial <serial>` | no       | auto    | Target device serial (omit to auto-select the single connected device)                    |

## Boundary

**In scope:** every action that goes through the `sdb` binary.

Some intents are matched by sdb-helper but **handed off** to a dedicated skill
that provides a richer pipeline (e.g., emulator fallback, bookmark management,
control-panel removal for screenshots). When a handoff occurs, sdb-helper
returns a success envelope with `handoff` and `suggested_skill` fields instead
of executing the command.

**Out of scope (not matched at all — use other skills directly):**

- File transfer (push/pull) → `tizen-cli tizen-sdk file-transfer`
- Native debug port forwarding → `tizen-cli tizen-sdk gdb-debug`
- .NET debug port forwarding → `tizen-cli tizen-sdk dotnet-debug`

## Supported intents

| Intent               | Example request                  | Gated? | Handoff to                |
| -------------------- | -------------------------------- | ------ | ------------------------- |
| List devices         | "list devices"                   | No     | `tizen-device-manager`    |
| Device info          | "device capability"              | No     | —                         |
| Connect over network | "connect to 192.168.1.100:26101" | No     | `tizen-remote-device`     |
| Disconnect           | "disconnect 192.168.1.100"       | No     | `tizen-remote-device`     |
| Install              | "install app"                    | Yes    | `tizen-install-app`       |
| Uninstall            | "uninstall app"                  | Yes    | `tizen-install-app`       |
| List packages        | "list installed packages"        | No     | —                         |
| Package info         | "show package info"              | No     | —                         |
| Launch app           | "launch app"                     | No     | — (`app_launcher -s`; when it prints no `successfully launched` — Samsung TV images are silent for a non-root shell — retried with the TV launcher `0 was_execute <appid>`, accepted on `app_id[<appid>] launched` / `resumed`) |
| Kill app             | "kill app"                       | Yes    | —                         |
| List running apps    | "list running apps"              | No     | —                         |
| Logs — tail / save / clear | "tail the logs", "save logs", "clear log" | — | `tizen-dlog-analyzer` (`result.note` names the action: `log-dump`, `log-clear --confirm`, `start`) |
| Screenshot           | "screenshot the TV"             | No     | `tizen-screenshot`        |

| Shell command | "run shell command" | No | — |
| Interactive shell | "open shell" | No | — |
| Check shell user | "whoami" | No | — |
| Root on | "enable root" | Yes | — |
| Add port forward | "forward port 9229" | No | — |
| List forwards | "list forwards" | No | — |
| Remove forward | "remove forward 9229" | Yes | — |
| Reboot | "reboot device" | Yes | — |
| Shutdown | "shutdown device" | Yes | — |
| Factory reset | "factory reset" | Yes | — |
| Send key | "sendkey KEY_HOME" | No | — |

## Output

**Success (read-only intent, executed):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "success",
  "result": {
    "intent": "shell-command",
    "command": "sdb -s \"emulator-26101\" shell \"ls -la; echo __SDB_EXIT:$?\"",
    "device_serial": "emulator-26101",
    "output": "total 12\ndrwxr-xr-x ...",
    "gated": false
  }
}
```

**Success (handoff intent — device logs):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "success",
  "result": {
    "intent": "log-stream",
    "handoff": "tizen-dlog-analyzer",
    "message": "Intent \"log-stream\" is handled by the tizen-dlog-analyzer skill. Use that skill instead.",
    "suggested_skill": "tizen-dlog-analyzer",
    "note": "Run the dlog-analyzer runner: log-dump [serial] [--filter \"*:E\"] for a one-shot view, or start start-monitoring for continuous monitoring with crash detection."
  }
}
```

Follow it with `tizen-cli tizen-sdk dlog-analyzer --action log-dump` (view/save) or
`--action log-clear` (clear; refused without `--confirm`). Never run `sdb dlog` yourself.

**Success (gated intent, not executed — returns command for confirmation):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "success",
  "result": {
    "intent": "reboot",
    "gated": true,
    "command": "sdb -s \"emulator-26101\" shell reboot",
    "device_serial": "emulator-26101",
    "message": "This is a gated action. Confirm before running: sdb -s \"emulator-26101\" shell reboot"
  }
}
```

**Success (handoff intent — install/uninstall):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "success",
  "result": {
    "intent": "install",
    "handoff": "tizen-install-app",
    "message": "Intent \"install\" is handled by the tizen-install-app skill. Use that skill instead.",
    "suggested_skill": "tizen-install-app"
  }
}
```

**Success (handoff intent — screenshot):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "success",
  "result": {
    "intent": "screenshot",
    "handoff": "tizen-screenshot",
    "message": "Intent \"screenshot\" is handled by the tizen-screenshot skill. Use that skill instead.",
    "suggested_skill": "tizen-screenshot"
  }
}
```

**Success (handoff intent — list devices):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "success",
  "result": {
    "intent": "list-devices",
    "handoff": "tizen-device-manager",
    "message": "Intent \"list-devices\" is handled by the tizen-device-manager skill. Use that skill instead.",
    "suggested_skill": "tizen-device-manager"
  }
}
```

**Success (handoff intent — connect/disconnect):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "success",
  "result": {
    "intent": "connect",
    "handoff": "tizen-remote-device",
    "message": "Intent \"connect\" is handled by the tizen-remote-device skill. Use that skill instead.",
    "suggested_skill": "tizen-remote-device"
  }
}
```

**Failure (no device):**

```json
{
  "command": "tizen-sdk sdb-helper",
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_DEVICE_E001",
      "error_category": "device_not_found",
      "message": "No connected Tizen device or emulator found. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it.",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk create-emulator",
        "auto_fixable": false
      }
    }
  ]
}
```

## Follow-ups

- Device logs (view / save / clear) and crash analysis → `tizen-cli tizen-sdk dlog-analyzer`
- Screenshot capture → `tizen-cli tizen-sdk screenshot`
- Package install/uninstall → `tizen-cli tizen-sdk install-app`
- Device discovery → `tizen-cli tizen-sdk device-manager`
- Create an emulator VM → `tizen-cli tizen-sdk create-emulator`
- Launch an emulator VM → `tizen-cli tizen-sdk launch-emulator`
- Remote device connect/disconnect → `tizen-cli tizen-sdk remote-device`
- File transfer (push/pull) → `tizen-cli tizen-sdk file-transfer`
- Native debugging → `tizen-cli tizen-sdk gdb-debug`
- .NET debugging → `tizen-cli tizen-sdk dotnet-debug`
