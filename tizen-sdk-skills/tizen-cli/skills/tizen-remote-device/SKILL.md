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
tizen-cli tizen-sdk remote-device [--action <scan|connect|disconnect|list|add|remove|edit|list-saved>] [--ip <ip>] [--subnet <prefix>] [--port <port>] [--timeout <ms>] [--name <name>] [--new-ip <ip>] [--new-port <port>]
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--action` | no | `scan` | `scan` (search network), `connect`, `disconnect`, `list`, `add`, `remove`, `edit`, `list-saved` |
| `--ip` | connect/disconnect/add/remove/edit: **yes** | — | Device IPv4 address; for `edit` this is the bookmark's **current** address |
| `--subnet` | no | all local subnets | Subnet /24 prefix to scan, e.g. `192.168.1` (scan only) |
| `--port` | no | `26101` | SDB port; for `edit`, the bookmark's **current** port |
| `--timeout` | no | `3000` | Per-host TCP timeout in ms (scan only, 100–30000) |
| `--name` | add: **yes** | — | Display name to bookmark the device under; for `edit`, the new name |
| `--new-ip` | no | — | Move the bookmark to this IPv4 address (edit only) |
| `--new-port` | no | — | Move the bookmark to this SDB port (edit only) |

`edit` needs at least one of `--name` / `--new-ip` / `--new-port`.

## Output
- `scan` success `result`: `subnets_scanned`, `port`, `device_count`, `devices[]` (`ip`, `port`, `status: connected|disconnected`). A whole-subnet scan takes ~3 seconds.
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
- Install an app on the connected device → `tizen-cli tizen-sdk install-app --serial <ip>:<port>`
- Push/pull files → `tizen-cli tizen-sdk file-transfer --serial <ip>:<port>`
- Logs / screenshot / shell → `tizen-cli tizen-sdk sdb-helper --serial <ip>:<port>`
- USB device or emulator instead → `tizen-cli tizen-sdk device-manager`
