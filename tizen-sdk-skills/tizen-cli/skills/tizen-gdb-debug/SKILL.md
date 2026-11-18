---
name: tizen-gdb-debug
description: Tizen GDB debug, tizen gdb debug, 타이젠 GDB 디버깅, 원격 디버깅, 앱 디버그, Tizen 네이티브 디버깅. Use this skill for automated remote GDB debugging of Tizen NATIVE apps ONLY — device check, app start, PID lookup, gdbserver launch, port forwarding, and host GDB attach command generation. NEVER use for WebApp (.wgt) projects — web apps have no native binary and this command will refuse them.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - Tizen GDB
    - tizen native debug
    - gdbserver
    - remote debug
    - 타이젠 디버깅
    - tizen gdb debug
    - sdb port forwarding
---

# Tizen Native GDB Debug (setup-only)

## When to use
The user wants to debug a Tizen **Native** app remotely with GDB. The app must already be installed on a connected device/emulator (`install-app`).

## Do NOT use for Web apps (IMPORTANT)
**Never run this command for a WebApp (.wgt) project, even if the user asks to "debug the app".** Web apps run inside the web runtime and have no native binary — GDB cannot attach to them, and the script refuses wgt packages with an error. When the project is a WebApp:
- Do not attempt `gdb-debug` or `dotnet-debug` at all.
- Use the **`webapp-debug`** command instead — it sets up RWI/CDP (Chrome DevTools Protocol) debugging and returns a ready CDP endpoint.
- Determine the project type first (e.g. `config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET) before choosing a debug command.

## Command

```
tizen-cli tizen-sdk gdb-debug --app-id <id> --binary <path>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | **yes** | — | Tizen package ID (e.g. `org.example.myapp`) |
| `--binary <path>` | **yes** | — | Host binary path with debug symbols (approximate paths are validated/auto-searched by the script) |
| `--mode <mode>` | no | `attach` | `attach` \| `launch` (launch pauses before main) |
| `--breakpoints <list>` | no | none | Comma-separated function names, e.g. `"main,service_app_create"` |
| `--port <port>` | no | `5039` | Debug port |
| `--timeout <seconds>` | no | `30` | PID search wait (1–300, attach mode) |

## Setup-only semantics (IMPORTANT)
This command only PREPARES the session (starts the app, launches gdbserver, forwards the port, writes a gdb init file) and then exits. Interactive gdb cannot be run by an agent — **give the user `result.gdb_command` to paste into their own terminal**. gdbserver, the port forward, and the init file stay alive for their session.

## Output
- Success `result`: `gdb_command` (one or more shell-form lines) + instructions.
- Failure: `device_not_found` → run `device-manager` first; `invalid_parameters` → fix app-id/binary/breakpoint format.

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
- No device → `tizen-cli tizen-sdk device-manager`
- App not installed → `tizen-cli tizen-sdk install-app --package <tpk>`
