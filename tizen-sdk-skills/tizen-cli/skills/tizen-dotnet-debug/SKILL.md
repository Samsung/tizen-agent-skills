---
name: tizen-dotnet-debug
description: Tizen DotNET debug, tizen dotnet debug, 타이젠 닷넷 디버깅, netcoredbg, C# 디버깅, .NET 원격 디버깅, NUI 앱 디버그. Use this skill for automated remote debugging of Tizen .NET apps ONLY with netcoredbg — device check, on-demand debugger install, app start, PID lookup, and either an interactive CLI attach command or a VS Code DAP server. NEVER use for WebApp (.wgt) projects — web apps have no CoreCLR process and this command will refuse them.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - Tizen dotnet debug
    - netcoredbg
    - C# debug
    - .NET remote debug
    - 타이젠 닷넷 디버깅
    - NUI 디버그
    - coreclr debug
---

# Tizen .NET Debug with netcoredbg (setup-only)

## When to use
The user wants to debug a Tizen **.NET** (C#/NUI) app remotely. The app must already be installed on a connected device/emulator.

## Do NOT use for Web apps (IMPORTANT)
**Never run this command for a WebApp (.wgt) project, even if the user asks to "debug the app".** Web apps run inside the web runtime — there is no CoreCLR process for netcoredbg to attach to, and the script refuses wgt packages with an error. When the project is a WebApp:
- Do not attempt `dotnet-debug` or `gdb-debug` at all.
- Use the **`webapp-debug`** command instead — it sets up RWI/CDP (Chrome DevTools Protocol) debugging and returns a ready CDP endpoint.
- Determine the project type first (e.g. `config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET) before choosing a debug command.

## Command

```
tizen-cli tizen-sdk dotnet-debug --app-id <id>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | **yes** | — | Tizen package ID (e.g. `org.tizen.example.MyApp`). The launchable app id is resolved from the device (`app_launcher -l`); a package that is not installed fails with `invalid_parameters` and the installed ids in `details` |
| `--mode <mode>` | no | `launch` | `launch` (**default, recommended** — VS Code DAP server, catches `Main()`) \| `attach` (CLI netcoredbg; usually fails on Tizen: no CoreCLR debug transport, `0x80131c08`) |
| `--breakpoints <list>` | no | none | Comma-separated `File.cs:line`, e.g. `"Program.cs:25,App.cs:10"` |
| `--port <port>` | no | `4711` | DAP server port (launch mode) |
| `--serial <serial>` | no | first device | Device serial |
| `--force-install` | no | off | Reinstall netcoredbg on the device |
| `--timeout <seconds>` | no | `30` | PID search wait (1–300, attach mode) |

## Setup-only semantics (IMPORTANT)
The command installs netcoredbg on demand, starts the app, and exits. Interactive netcoredbg cannot be run by an agent:
- **launch mode (default)** → give the user `result.launch_config` (a launch.json snippet) for VS Code; the DAP server listens on the forwarded port. **The app is suspended before `Main()` and shows no window until VS Code connects (F5) — say so first; it is not a failed launch.**
- **attach mode** → give the user `result.debug_command` to paste into their terminal.

## Output
- Success `result`: `launch_config` + `note` (launch; `app_state` = `suspended_under_debugger`, `launch_app_id` = the id actually launched) or `debug_command` (attach) + instructions.
- Failure: `device_not_found` → run `device-manager`; missing `.pdb` symbols (`build_failed`) → rebuild with `--build-type Debug`; `invalid_parameters` "is not installed on the device" → the package id is not in `app_launcher -l`, `details` lists what is — do not guess ids, install first; `io_error` "did not start ... under netcoredbg" → `details` carries the raw `launch_app` output.

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
- Workload issues → `tizen-cli tizen-sdk dotnet-setup`
