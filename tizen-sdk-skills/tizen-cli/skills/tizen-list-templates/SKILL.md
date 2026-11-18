---
name: tizen-list-templates
description: List Tizen templates, tizen list templates, 타이젠 템플릿 목록, 템플릿 확인, template list, available templates, 어떤 템플릿. Use this skill to list project templates available in the installed Tizen SDK, per project type (native, dotnet, webapp, rpk, tv, platform). Run before tizen-create-project so the user picks a real template name.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-18"
  keywords:
    - Tizen templates
    - template list
    - list templates
    - 타이젠 템플릿
    - 템플릿 목록
    - create project prerequisite
---

# List Tizen Project Templates

## When to use

Before `create-project`, or when the user asks which templates/app types are available. Requires the Tizen SDK to be installed.

## Command

```
tizen-cli tizen-sdk list-templates [--type <type>]
```

| Option          | Required | Default | Description                                            |
| --------------- | -------- | ------- | ------------------------------------------------------ |
| `--type <type>` | no       | all     | `native` \| `dotnet` \| `webapp` \| `rpk` \| `tv` \| `platform` |
| `--platform-version <X.Y>` | no | newest installed | List the templates of that installed platform (e.g. `9.0`) instead of the newest one. Not installed → `platform_version_not_found`. See installed versions with `platform-list`. |

## Output

- Success `result.templates`: map of type → template name array, e.g. `{ "webapp": ["Basic", "WebService"] }`.
  The untyped list always includes `platform` — the plugin's GBS-buildable sample apps
  (e.g. `dali-demo`); show them as their own "Platform apps" group, created with
  `create-project --type platform`.
- Success `result.profile`: the `tizen-X.Y` profile the templates were listed under.
- Success `result.tv` — **only when the Samsung TV SDK extension is installed**, on typed
  calls too: `{ "profile": "tv-samsung-10.0", "web": ["Basic_Empty", …], "dotnet": ["TizenNUIApp", …] }`.
  This field is the only way to tell whether the TV SDK is installed. For a web-app request
  show `result.tv.web` next to `result.templates.webapp` (heading "Samsung TV web app
  templates");
  for a generic "어떤 템플릿 있어?" show the TV list next to the per-type lists. A TV
  template is created with `create-project --type tv`.
- Failure: SDK not installed → run `tizen-cli tizen-sdk sdk-install` first. `--type <type>`
  with no templates is a `template_not_found` failure whose message names the fix (for `tv`:
  install the TV SDK).

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

- Pass an exact template name to `tizen-cli tizen-sdk create-project --template <name> ...`.
