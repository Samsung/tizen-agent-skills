---
name: tizen-check-node
description: Check Node.js, node check, node 설치 확인, Node.js installed, node version, 노드 확인, "Node.js가 설치되어 있는지 확인해줘", "Do I have Node.js installed? Check the version.", 노드 버전, node 있어?, is node installed. Use this skill for ANY question about whether Node.js is installed or which Node.js version is present — `tizen-cli tizen-sdk check-node` is the dedicated command for that question and answers with version/path info in a Standard JSON Envelope. Do NOT route a Node.js question to the generic environment health check (`tizen-cli tizen-sdk --doctor` / core `doctor`) — doctor is a broad multi-component sweep (shell, scripts, SDK, sdb, em-cli) for "is my whole setup healthy?", not the answer to "is Node.js installed?". Also the pre-check before tizen-sdk-install.
metadata:
  author: Samsung Electronics
  last-updated: "2026-07-16"
  keywords:
    - node check
    - node.js
    - node installed
    - node version
    - 노드 확인
    - Tizen SDK install prerequisite
---

# Check Node.js

## When to use
Whenever the user asks whether Node.js is installed or which version it is ("Node.js가 설치되어 있는지 확인해줘",
"Do I have Node.js installed? Check the version."), and as the pre-check before `tizen-cli tizen-sdk sdk-install`.

This is the dedicated command for that question. Do **not** answer it with `tizen-cli tizen-sdk --doctor`
(or the core `doctor` command): doctor is a multi-component health sweep — shell, scripts dir, SDK, sdb,
em-cli — for "is my whole setup healthy?". A Node.js-only question routes here, every time.

## Command

```
tizen-cli tizen-sdk check-node
```

No options.

## Output
- Success `result`: `installed`, `version` (e.g. `v24.15.0`), `path`, `major_version`.
- A `warnings` entry "older than the required v22+" means Node.js 18–21: it still runs, but tell the user to upgrade to Node.js 22 LTS or later.
- Failure (`node_not_found`): Node.js is missing or not on PATH — the user must install Node.js (22+) manually before SDK installation; do not attempt to install it automatically.
- Failure (`node_version_unsupported`): Node.js is below v18 and the runners do not work — same handling: the user upgrades to Node.js 22+ manually.

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
- `tizen-cli tizen-sdk check-disk-space` then `tizen-cli tizen-sdk sdk-install`.
