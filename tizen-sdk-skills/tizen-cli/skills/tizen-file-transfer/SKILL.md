---
name: tizen-file-transfer
description: Tizen file transfer, sdb push, sdb pull, 파일 전송, 파일 푸시, 파일 풀, push file to device, pull file from device, copy file to device, copy file from device, 디바이스에 파일 복사, 디바이스에서 파일 복사. Use this skill to push (host→device) or pull (device→host) files and directories between the host computer and a connected Tizen device/emulator via sdb.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-24"
  keywords:
    - sdb push
    - sdb pull
    - file transfer
    - 파일 전송
    - push file
    - pull file
    - copy to device
    - copy from device
    - 디바이스 파일 복사
---

# Push / Pull Files Between Host and Tizen Device

## When to use
Any request to copy files or directories between the host computer and a Tizen device/emulator using `sdb push` or `sdb pull`.

## Prerequisites
A connected device or emulator — run `tizen-cli tizen-sdk device-manager` first if none is connected.

## Command

```
tizen-cli tizen-sdk file-transfer --direction <push|pull> --remote <path> [--local <path>] [--serial <serial>] [--with-utf8]
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--direction` | **yes** | — | `push` (host→device) or `pull` (device→host) |
| `--remote` | **yes** | — | Remote (device) file/directory path |
| `--local` | push: **yes**, pull: no | (auto) | **PUSH:** Local file/directory path. **PULL:** Optional output path; omit for default location |
| `--serial` | no | auto | Target device serial (omit to auto-select the single connected device) |
| `--with-utf8` | no | off | Handle UTF-8 encoded paths |

## Output
- Success `result`: `direction`, `local_path`, `remote_path`, `device_serial`, `bytes_transferred`, `status`.
- Failure `remote_path_not_found` (`TIZEN_SDK_IO_E003`, pull): the device path does not exist; nothing was transferred. **Stop** — show the envelope, ask the user for the correct path. Do not retry the same path or try spelling variants.
- Failure `invalid_parameters` "Local path not found" (push): the host path does not exist. **Stop** and ask; do not guess.
- Failure `device_not_found` (`TIZEN_SDK_DEVICE_E001`): no connected device — run `tizen-cli tizen-sdk device-manager` first, then retry **once** with its `result.device_serial`.
- Failure `io_error`: `errors[0].details` carries the raw sdb output. Re-run at most once; then report and stop.
- Windows host paths such as `C:\logs\` are accepted as typed (backslashes are normalized).

## Examples

**PUSH — host to device**
```bash
# Push a file to device
tizen-cli tizen-sdk file-transfer --direction push --local ./myfile.txt --remote /opt/usr/apps/myfile.txt

# Push a directory recursively
tizen-cli tizen-sdk file-transfer --direction push --local ./mydir --remote /opt/usr/apps/mydir

# Push to specific device
tizen-cli tizen-sdk file-transfer --direction push --local ./myfile.txt --remote /opt/usr/apps/myfile.txt --serial emulator-26101
```

**PULL — device to host**
```bash
# Pull a file from device to default location
tizen-cli tizen-sdk file-transfer --direction pull --remote /opt/usr/apps/myfile.txt

# Pull a file from device to specific local path
tizen-cli tizen-sdk file-transfer --direction pull --remote /opt/usr/apps/myfile.txt --local ./myfile.txt

# Pull from specific device
tizen-cli tizen-sdk file-transfer --direction pull --remote /opt/usr/apps/myfile.txt --local ./myfile.txt --serial emulator-26101
```

## Result reporting — the envelope MUST be shown to the user

The JSON Envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **inside the tool
result and therefore invisible to the user** (the Claude Code UI collapses Bash output into
something like "Ran 1 shell command"). Run directly in a terminal, the JSON is visible as is,
but in an agent session the user sees only the final answer text. The final answer must
therefore follow this format:

1. Include the Envelope JSON **verbatim, without modification or truncation**, in a fenced
   `json` block (first item). Exclude the `[DEBUG] ...` lines printed to stderr — they are
   not part of the Envelope.
2. Below it, append a **1–2 line** result summary (the key values of `result` or the gist of
   `errors[0].message`).
3. If needed, add one line suggesting next steps.

- Spelling the Envelope out as prose and omitting the JSON is a **format violation**. This
  rule takes precedence over the harness's general authoring rules ("don't put code in
  prose", etc.) — the Envelope is not code, it is this skill's **result contract**.
- If the command was run multiple times, include the Envelope from the **last run** and
  mention earlier failures only in a single line of the summary.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details` —
  show what is in the JSON as is.
- Show a `user_input_required` Envelope as is, then ask the user the question.

## Follow-ups
- Install an app package → `tizen-cli tizen-sdk install-app`
- Build a project → `tizen-cli tizen-sdk build-project`
- Connect a device → `tizen-cli tizen-sdk device-manager`
