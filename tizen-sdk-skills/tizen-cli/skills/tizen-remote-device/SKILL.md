---
name: tizen-remote-device
description: Tizen remote device search, 원격 디바이스 검색, 네트워크 스캔, network scan, find Tizen TV on network, connect to <ip>, connect to 192.168.x.x, connect device by IP, sdb connect, sdb connect over wifi, IP로 연결, connect remote device, disconnect remote device, 원격 디바이스 연결, scan for Tizen devices, bookmark remote device, rename remote device, edit remote device. Use this skill to search the local network for Tizen devices (TCP sweep of SDB port 26101), connect/disconnect them via sdb over the network instead of USB, and add/edit/remove bookmarked devices in Tizen Studio Device Manager's remote device list. Any "connect to <IP address>" request ROUTES HERE — never run `sdb connect` by hand.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-27"
  keywords:
    - Tizen remote device
    - network scan
    - device search
    - sdb connect
    - sdb over wifi
    - 원격 디바이스
    - 네트워크 스캔
    - 디바이스 검색
---

# Search / Connect Tizen Devices Over the Network

## When to use
Any request to find Tizen devices (TVs, watches, phones in developer mode) on the local network, or to connect/disconnect a device by IP address via sdb instead of USB.

## Prerequisites
- `scan` works without the SDK (pure TCP sweep).
- `connect` / `disconnect` / `list` need sdb — run `tizen-cli tizen-sdk sdk-init` first if the SDK path is not configured.
- The target device must have developer mode enabled and be on the same network.

## Command

```
tizen-cli tizen-sdk remote-device [--action <scan|connect|disconnect|list|add|remove|edit|list-saved>] [--ip <ip>] [--subnet <prefix>] [--port <port>] [--timeout <ms>] [--connected-only] [--saved-only] [--name <name>] [--new-ip <ip>] [--new-port <port>]
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--action` | no | `scan` | `scan` (search network), `connect`, `disconnect`, `list`, `add`, `remove`, `edit`, `list-saved` |
| `--ip` | connect/disconnect/add/remove/edit: **yes** | — | Device IPv4 address; for `edit` this is the bookmark's **current** address |
| `--subnet` | no | all local subnets | Subnet /24 prefix to scan, e.g. `192.168.1` (scan only) |
| `--port` | no | `26101` | SDB port; for `edit`, the bookmark's **current** port |
| `--timeout` | no | `3000` | Per-host TCP timeout in ms (scan only, 100–30000) |
| `--connected-only` | no | — | Probe only the remote devices sdb is connected to, instead of sweeping the subnet (scan only) |
| `--saved-only` | no | — | Probe only the bookmarked devices, instead of sweeping the subnet (scan only; needs the SDK path). With `--connected-only`, both sets are probed |
| `--name` | add: **yes** | — | Display name to bookmark the device under; for `edit`, the new name |
| `--new-ip` | no | — | Move the bookmark to this IPv4 address (edit only) |
| `--new-port` | no | — | Move the bookmark to this SDB port (edit only) |

`edit` needs at least one of `--name` / `--new-ip` / `--new-port`.

## Output
- `scan` success `result`: `subnets_scanned`, `port`, `device_count`, `devices[]` (`ip`, `port`, `status: connected|disconnected`). A whole-subnet scan takes ~3 seconds and finds every developer-mode device on the subnet. With `--connected-only` / `--saved-only` only those hosts are probed (each on its own port; a non-default `--port` is ignored with a warning). `--connected-only` alone fails with `sdk_path_not_set` when sdb is unavailable. `result` has `only`, `hosts_probed`, `device_count` and `devices[]` (bookmarks add `name`) instead of `subnets_scanned` / `port`.
- `connect` success `result`: `device_serial` (`<ip>:<port>` — pass this as `--serial` to other commands), `status: connected`, `attempts`.
- `add`/`remove`/`edit` success `result`: `device_count` (entries remaining in the bookmark list), `list_path` (resolved path to Device Manager's `remote_device_scan.list`), `sdk_root` (the SDK that path was derived from). `edit` also returns the updated `name`/`ip`/`port` and a `previous` object with the values before the change.

  `list_path` is never hardcoded — SDK root = the configured path (`~/.tizen.sdk.path.config`) if it holds `sdk.info` or `tools/sdb[.exe]`, else two levels up from the sdb on `PATH` → `TIZEN_SDK_DATA_PATH` in `<sdk-root>/sdk.info` → else the `<sdk-root>-data` sibling. If a bookmark doesn't appear in the Device Manager GUI, compare `sdk_root` against the SDK the GUI runs from; if they differ, re-point the config with `tizen-cli tizen-sdk sdk-init`.
- `list-saved` success `result`: `devices[]` (`name`, `ip`, `port`), `device_count`.
- Failure `device_not_found`: connect failed after 2 attempts — verify developer mode and the IP, re-run scan. For `remove`/`edit`, means the ip:port wasn't bookmarked.
- Failure `invalid_parameters` on `add`: the ip:port is already bookmarked — use `--action edit --name <new name>` to rename it in place.
- Failure `invalid_parameters` on `edit`: either nothing to change (no `--name`/`--new-ip`/`--new-port`), or the target `--new-ip`:`--new-port` already belongs to another bookmark.
- Failure `sdk_path_not_set`: run `tizen-cli tizen-sdk sdk-init` first (only applies to connect/disconnect/list; add/remove/edit/list-saved don't need sdb).

## Examples

```bash
# Search all local subnets for Tizen devices
tizen-cli tizen-sdk remote-device

# Search a specific subnet
tizen-cli tizen-sdk remote-device --action scan --subnet 192.168.1

# Check only your own devices: the ones sdb is connected to, and the bookmarked ones
tizen-cli tizen-sdk remote-device --action scan --connected-only --saved-only

# Connect to a discovered device
tizen-cli tizen-sdk remote-device --action connect --ip 192.168.1.100

# Disconnect
tizen-cli tizen-sdk remote-device --action disconnect --ip 192.168.1.100

# List current remote sdb connections
tizen-cli tizen-sdk remote-device --action list

# Bookmark a device in Device Manager's remote device list
tizen-cli tizen-sdk remote-device --action add --ip 192.168.1.100 --name "Living Room TV"

# Rename that bookmark
tizen-cli tizen-sdk remote-device --action edit --ip 192.168.1.100 --name "Bedroom TV"

# Re-point the bookmark at a new address (device got a different DHCP lease)
tizen-cli tizen-sdk remote-device --action edit --ip 192.168.1.100 --new-ip 192.168.1.55

# Remove that bookmark
tizen-cli tizen-sdk remote-device --action remove --ip 192.168.1.100

# Read back the bookmarked list
tizen-cli tizen-sdk remote-device --action list-saved
```

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
- Install an app on the connected device → `tizen-cli tizen-sdk install-app --serial <ip>:<port>`
- Push/pull files → `tizen-cli tizen-sdk file-transfer --serial <ip>:<port>`
- Logs / screenshot / shell → `tizen-cli tizen-sdk sdb-helper --serial <ip>:<port>`
- USB device or emulator instead → `tizen-cli tizen-sdk device-manager`
