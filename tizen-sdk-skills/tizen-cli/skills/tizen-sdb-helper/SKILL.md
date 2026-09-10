---
name: tizen-sdb-helper
description: sdb helper, sdb command, sdb shell, run shell command on the device, shell command, 쉘 명령 실행, sdb dlog, tail logs, device log, sdb forward, forward port, port forward, port forwarding, 포트 포워딩, sdb reboot, reboot the device, 디바이스 재부팅, shutdown device, sdb root, root on, sendkey, launch app, kill app, list running apps, list installed packages, disk space df /opt. Runs ONE sdb action on a Tizen device — shell command, port forward, reboot/shutdown, log capture, launch/kill, root toggle, sendkey — with device auto-selection and confirmation gates on destructive actions. For ANY request that would be answered with an sdb command, ROUTE HERE FIRST — do NOT locate sdb or type `sdb ...` yourself. Connect to an IP → remote-device; install → install-app; push/pull → file-transfer.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-30"
  keywords:
    - sdb
    - sdb command
    - sdb shell
    - sdb dlog
    - sdb forward
    - sdb reboot
    - sdb log
    - tail logs
    - port forward
    - sdb root
---

# Tizen sdb Helper

## When to use

User asks for a single sdb action on a Tizen device — run a shell command, log capture,
port forward, reboot, screen state, etc. The command matches the request to an intent,
resolves the correct sdb invocation, and either executes it (read-only) or returns it for
confirmation (gated/destructive).

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
| `--request <text>`  | **yes**  | —       | Natural-language sdb request (e.g., "list devices", "tail the logs", "screenshot the TV") |
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
| Launch app           | "launch app"                     | No     | —                         |
| Kill app             | "kill app"                       | Yes    | —                         |
| List running apps    | "list running apps"              | No     | —                         |
| Stream log           | "tail the logs"                  | No     | —                         |
| Clear log            | "clear log"                      | Yes    | —                         |
| Save log             | "save logs"                      | No     | —                         |
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
    "intent": "log-stream",
    "command": "sdb -s \"emulator-26101\" dlog -v threadtime",
    "device_serial": "emulator-26101",
    "output": "...",
    "gated": false
  }
}
```

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

- Screenshot capture → `tizen-cli tizen-sdk screenshot`
- Package install/uninstall → `tizen-cli tizen-sdk install-app`
- Device discovery → `tizen-cli tizen-sdk device-manager`
- Create an emulator VM → `tizen-cli tizen-sdk create-emulator`
- Launch an emulator VM → `tizen-cli tizen-sdk launch-emulator`
- Remote device connect/disconnect → `tizen-cli tizen-sdk remote-device`
- File transfer (push/pull) → `tizen-cli tizen-sdk file-transfer`
- Native debugging → `tizen-cli tizen-sdk gdb-debug`
- .NET debugging → `tizen-cli tizen-sdk dotnet-debug`
