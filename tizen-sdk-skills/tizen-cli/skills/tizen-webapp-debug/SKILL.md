---
name: tizen-webapp-debug
description: Tizen WebApp debug, tizen webapp debug, 타이젠 웹앱 디버깅, 웹앱 디버깅, RWI, Remote Web Inspector, CDP, Chrome DevTools 디버깅, wgt 디버깅, Playwright connectOverCDP, web inspector debugging. Use this skill for automated remote debugging of Tizen Web apps (.wgt) ONLY via RWI/CDP — device check, debug-mode app launch (app_launcher -w), RWI port forwarding, and CDP endpoint verification; returns the CDP endpoint plus Playwright/DevTools connect snippets. NEVER use for Native (.tpk C/C++) or DotNET apps — they have no web runtime; use gdb-debug or dotnet-debug instead.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-10"
  keywords:
    - Tizen webapp debug
    - Remote Web Inspector
    - RWI
    - CDP
    - Chrome DevTools
    - 타이젠 웹앱 디버깅
    - wgt 디버깅
    - Playwright connectOverCDP
---

# Tizen Web App Debug via RWI/CDP (setup-only)

## When to use
The user wants to debug a Tizen **Web** (.wgt HTML/JS/CSS) app remotely. The app must already be installed on a connected device/emulator.

## Do NOT use for Native or .NET apps (IMPORTANT)
**Never run this command for a Native (.tpk C/C++) or DotNET project, even if the user asks to "debug the app".** Only Web apps run inside the web runtime — a native binary or CoreCLR process has no RWI server to expose, and the script refuses non-wgt packages with an error. When the project is NOT a WebApp:
- Do not attempt `webapp-debug` at all.
- Native (C/C++) app → `gdb-debug`; DotNET app → `dotnet-debug`.
- Determine the project type first (e.g. `config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET) before choosing a debug command.

## Command

```
tizen-cli tizen-sdk webapp-debug --app-id <id>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | **yes** | — | Tizen web app ID (e.g. `abcDEF1234.MyWebApp`) |
| `--port <port>` | no | `9222` | Host port forwarded to the device RWI port |
| `--serial <serial>` | no | first device | Device serial |
| `--timeout <seconds>` | no | `30` | CDP endpoint readiness timeout (1–300) |

## Setup-only semantics (IMPORTANT)
The command relaunches the app in web-debug mode (`app_launcher -w -s`), forwards the host port to the device RWI port, verifies the CDP endpoint (`/json/version`, `/json/list`), and exits. The RWI session and the port forward stay alive:
- highlight `result.connect.devtools` as THE link — the direct Chrome DevTools inspector URL (`http://127.0.0.1:<port>/devtools/inspector.html?ws=...`) the user opens in Chrome; do NOT list `/json/list`, `chrome://inspect`, or raw WebSocket URLs as extra options;
- also give the user `result.connect.playwright` — a ready-to-use `chromium.connectOverCDP(...)` snippet.

## Output
- Success `result`: `cdp_endpoint`, `host_port`, `device_port`, `pages`, `connect` snippets + `note`.
- Failure: `device_not_found` → run `device-manager`; `invalid_parameters` ("not a Web app") → use `gdb-debug`/`dotnet-debug`; `inspector_not_available` → the image may not support RWI, or retry with a longer `--timeout`.

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
- Run automated Playwright tests against the endpoint → `tizen-cli tizen-sdk playwright-test`
- No device → `tizen-cli tizen-sdk device-manager`
- App not installed → `tizen-cli tizen-sdk install-app`
- Native app → `tizen-cli tizen-sdk gdb-debug`; .NET app → `tizen-cli tizen-sdk dotnet-debug`
