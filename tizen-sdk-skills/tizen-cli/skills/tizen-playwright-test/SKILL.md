---
name: tizen-playwright-test
description: Tizen Playwright test, tizen playwright test, 타이젠 플레이라이트 테스트, 웹앱 자동화 테스트, 웹앱 테스트, E2E 테스트, UI 자동화 테스트, wgt 테스트, playwright 테스트 실행, automated webapp testing, run playwright tests, web app UI test, connectOverCDP test, scaffold playwright test. Use this skill to RUN (or scaffold) Playwright tests against a Tizen Web app (.wgt) ONLY over RWI/CDP — it sets up debug mode + port forward via the webapp-debug flow, then executes `node <test-file>` in the user's test project and returns pass/fail in the envelope. NEVER use for Native (.tpk C/C++) or DotNET apps — they have no web runtime, so Playwright cannot attach; use gdb-debug or dotnet-debug for debugging those.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-11"
  keywords:
    - Tizen playwright test
    - 타이젠 플레이라이트 테스트
    - 웹앱 자동화 테스트
    - E2E 테스트
    - wgt 테스트
    - Playwright connectOverCDP
    - UI automation
    - automated webapp testing
---

# Tizen Web App Playwright Test over RWI/CDP

## When to use
The user wants to run **automated Playwright tests** against a Tizen **Web** (.wgt HTML/JS/CSS) app — assertions, UI automation, E2E checks. The app must already be installed on a connected device/emulator. (For interactive DevTools debugging use `webapp-debug` instead.)

## Do NOT use for Native or .NET apps (IMPORTANT)
**Never run this command for a Native (.tpk C/C++) or DotNET project, even if the user asks to "test the app".** Only Web apps run inside the web runtime — Playwright attaches over CDP, and a native binary or CoreCLR process has no CDP endpoint. When the project is NOT a WebApp:
- Do not attempt `playwright-test` at all.
- Native (C/C++) app → `gdb-debug`; DotNET app → `dotnet-debug` (debugging, not Playwright).
- Determine the project type first (`config.xml` present → WebApp; `tizen-manifest.xml` → Native; `.csproj` → DotNET).

## Command

```
tizen-cli tizen-sdk playwright-test --app-id <id> --project-dir <dir>
```

| Option | Required | Default | Description |
|---|---|---|---|
| `--app-id <id>` | for a run | — | Tizen web app ID (e.g. `abcDEF1234.MyWebApp`) |
| `--test-file <path>` | no | `<project-dir>/tizen-playwright.test.js` | Test script to execute with node |
| `--project-dir <path>` | no (yes for `--scaffold`) | cwd / test-file dir | Test project dir (cwd for the run; needs `playwright` in `node_modules`) |
| `--port <port>` | no | `9222` | Host port forwarded to the device RWI port |
| `--serial <serial>` | no | first device | Device serial |
| `--setup-timeout <seconds>` | no | `30` | CDP setup readiness timeout (1–300) |
| `--timeout <seconds>` | no | `120` | Test run timeout (1–600) |
| `--no-setup` | no | off | Reuse an already-live CDP endpoint (skip debug relaunch + forward) |
| `--scaffold` | no | off | Generate `tizen-playwright.test.js` (+ `package.json` if absent) into `--project-dir` and exit |
| `--force` | no | off | Overwrite an existing scaffolded test file (with `--scaffold`) |

## Playwright dependency (IMPORTANT)
Playwright resolves from the **test project's** `node_modules` — never from this plugin. On `dependency_missing`, run `npm install playwright` in the test project directory and retry. The scaffolded template attaches to the ALREADY-RUNNING app page (`connectOverCDP` → `contexts()[0].pages()[0]`) — it never navigates or opens pages.

## Output
- Success `result`: `passed`, `exit_code`, `summary` (assertion counts from the `TEST_RESULT:` marker), `output_tail`, `cdp_endpoint` + `note` (the RWI session/forward stay alive — rerun with `--no-setup` while the app runs).
- Failure: `test_failed` → assertions failed, relay `output_tail` + `test-failure.png`, do NOT auto-retry; `dependency_missing` → `npm install playwright` in the project dir; `inspector_not_available` → app restarted or image lacks RWI, re-run without `--no-setup`; `test_timeout` → raise `--timeout` once; `invalid_parameters` mentioning `--scaffold` → no test file yet, scaffold one; `device_not_found` → run `device-manager`; `node_not_found` → no external `node` on PATH, install Node.js 22+ / fix PATH; `execution_error` saying node "is on PATH but ... exited abnormally" or "did not answer" → Node.js IS installed but broken/hung (the message quotes the exit code and stderr) — advise repair/reinstall, do not say it is missing.

## Result reporting — the envelope MUST be shown to the user

The JSON Envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **buried inside
the tool result and invisible to the user** (the Claude Code UI collapses Bash output behind
a "Ran 1 shell command" line). Run directly in a terminal the JSON is visible as-is, but in
an agent session the user sees only the final answer text. Therefore the final answer MUST
follow this format:

1. Include the Envelope JSON **verbatim, unmodified and unabridged** in a fenced `json`
   block (as the first item). Exclude the `[DEBUG] ...` lines that go to stderr — they are
   not part of the Envelope.
2. Below it, append a result summary of **1–2 lines** only (the key values of `result`, or
   the gist of `errors[0].message`).
3. If useful, add one line suggesting the next step.

- Expanding the Envelope into a prose list and dropping the JSON is a **format violation**.
  This rule takes precedence over the harness's general writing guidance ("don't put code in
  prose" and the like) — the Envelope is not merely code, it is this skill's **result
  contract**.
- If the command ran more than once, include the Envelope of the **last run** and mention
  earlier failures in the summary line only, in a single line.
- Include a failure Envelope verbatim as well. Do not retype `errors[0].message`/`details`
  — show what is inside the JSON as-is.
- Show a `user_input_required` Envelope as-is, then ask the user the question.

## Follow-ups
- Interactive DevTools debugging instead → `tizen-cli tizen-sdk webapp-debug`
- No device → `tizen-cli tizen-sdk device-manager`
- App not installed → `tizen-cli tizen-sdk install-app`
- Native app → `tizen-cli tizen-sdk gdb-debug`; .NET app → `tizen-cli tizen-sdk dotnet-debug`
