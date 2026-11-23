---
name: tizen-ecp
description: ECP, Emulator Control Panel, ecp-cli, emulator control, battery, emulator battery, set battery level, list devices for a platform version, what devices are available, 지원 기기, emulator commands. Runs ONE Emulator Control Panel request against a RUNNING emulator — `ecp-cli --version <V> --profile <P> help` lists the devices a platform version supports; `ecp-cli [--target <vm|serial>] battery [cmds]` and the other device commands control the running emulator. Requires at least one running emulator; with none up it fails and points at launch-emulator. Create/list/delete VMs → create-emulator; launch/boot → launch-emulator; stop → device-manager; sdb commands → sdb-helper; logs → dlog-analyzer.
metadata:
  author: Samsung Electronics
  last-updated: "2026-11-23"
  keywords:
    - ECP
    - Emulator Control Panel
    - ecp-cli
    - emulator battery
    - list devices
    - emulator commands
---

# Tizen ECP (Emulator Control Panel)

## When to use

User asks for one Emulator Control Panel action on a **running** emulator — list
the devices a platform version supports, list the available commands, or run a
device command such as battery. ECP commands require at least one running
emulator; with none up the runner returns a `device_not_found` failure envelope
pointing at `tizen-cli tizen-sdk launch-emulator`.

**✅ ALWAYS run this command with the user's request — NEVER run the raw
`{TIZEN_SDK_PATH}/tools/emulator/bin/ecp-cli` binary yourself.**

## Command

```
tizen-cli tizen-sdk ecp --request "<natural-language request>" [--target <vm|serial>] [--version <VERSION>] [--profile <PROFILE>]
```

| Option               | Required | Default | Description                                                              |
| -------------------- | -------- | ------- | ------------------------------------------------------------------------ |
| `--request <text>`   | **yes**  | —       | Natural-language ECP request (e.g., "battery status", "what devices are available for version 9.0, profile tv") |
| `--target <vm\|serial>` | no    | auto    | VM name or `emulator-<port>` serial (omit to use the running emulator)   |
| `--version <VERSION>` | no      | from request | Platform version for the device-list intent                          |
| `--profile <PROFILE>` | no      | from request | Profile for the device-list intent: tv / tizen / mobile / wearable    |

## Boundary

**In scope:** device listing per platform/version, the command surface (`help`),
and device commands (`battery`, …). **Out of scope:** VM create/list/delete →
`tizen-cli tizen-sdk create-emulator`; launch/boot → `tizen-cli tizen-sdk launch-emulator`;
stop → `tizen-cli tizen-sdk device-manager`; sdb commands → `tizen-cli tizen-sdk sdb-helper`;
logs → `tizen-cli tizen-sdk dlog-analyzer`.

## Supported intents

| Intent         | Example request                                        | ecp-cli invocation                              |
| -------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `list-devices` | "what devices are available for version 9.0, profile tv" | `ecp-cli --version 9.0 --profile tv help`     |
| `help`         | "help" / "what commands are available"                 | `ecp-cli [--target <t>] help`                   |
| `battery`      | "battery status" / "set the battery level to 50"       | `ecp-cli [--target <t>] battery [args]`         |
| `command`      | any other device command ecp-cli's help lists          | `ecp-cli [--target <t>] <args>` (pass-through)  |

A device-list request missing the version or the profile fails with
`TIZEN_SDK_ECP_E008` asking for both.

## Envelope

**Success:**

```json
{
  "command": "tizen-sdk ecp",
  "status": "success",
  "result": {
    "intent": "battery",
    "ecp_cli": "/opt/tizen-studio/tools/emulator/bin/ecp-cli",
    "command_line": "ecp-cli --target emulator-26101 battery status",
    "target": "emulator-26101",
    "version": null,
    "profile": null,
    "output": "Battery level: 50\nCharger: disconnected"
  }
}
```

**Failure (no running emulator):**

```json
{
  "command": "tizen-sdk ecp",
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_ECP_E004",
      "error_category": "device_not_found",
      "message": "No running emulator found. ECP commands control a RUNNING emulator — launch one first with the tizen-launch-emulator skill.",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk launch-emulator",
        "auto_fixable": false
      }
    }
  ]
}
```

Other codes: `E001` SDK not configured → `tizen-cli tizen-sdk sdk-init`; `E002`
ecp-cli missing → `tizen-cli tizen-sdk download-emulator-package`; `E007`
unknown target; `E008` missing version/profile; `E009` ecp-cli failed (`details`
carries its output).

## Follow-ups

- Create an emulator VM → `tizen-cli tizen-sdk create-emulator`
- Launch an emulator VM → `tizen-cli tizen-sdk launch-emulator`
- Install an app → `tizen-cli tizen-sdk install-app`
- Screenshot → `tizen-cli tizen-sdk screenshot`
- sdb-level device control → `tizen-cli tizen-sdk sdb-helper`