# Skill: Run Test Suite

## When to use

Use this skill when the user asks to run the tizen-sdk plugin test suite, verify plugin commands, or test LLM prompt resolution.

## What it does

Executes test cases (TCs) from `tests/tc/` against the tizen-sdk plugin. Each TC has two lanes:

- **cli lane**: Runs `tizen-sdk <command>` and checks the JSON envelope output
- **prompt lane**: Sends a natural-language prompt and verifies the LLM calls the correct tool

## How to run

### Option 1: Automated runner (cli lane only)

```bash
cd tizen-sdk-skills/tests
npm install
node runner.mjs                    # run all TCs
node runner.mjs --tier=safe        # only safe-tier TCs
node runner.mjs --dry-run           # validate TCs without executing
node runner.mjs --tc=check-node     # filter by TC id
node runner.mjs --domain=sdk        # filter by domain
```

### Option 2: Cline/Claude prompt lane execution

For prompt-lane TCs, you (the AI agent) execute them directly:

1. Read the TC YAML file (e.g., `tests/tc/sdk/check-node.prompt-happy.yaml`)
2. Find the `prompt.text` field — this is the user prompt
3. Find the `prompt.expect` block — this defines what to verify:
   - `must_call_tool`: The MCP tool the LLM must call (e.g., `tizen_cli_run_commands`)
   - `must_resolve_command`: The command the LLM must resolve to (e.g., `tizen-sdk check-node`)
   - `envelope_status`: The expected envelope status (`success` or `failure`)
4. Simulate the user prompt and verify the LLM calls the correct tool
5. Report PASS/FAIL based on the expect criteria

### Example: Running a prompt-lane TC

```
TC: tizen-sdk.check-node.prompt-happy
Prompt: "Node.js가 설치되어 있는지 확인해줘"
Expected:
  - must_call_tool: tizen_cli_run_commands
  - must_resolve_command: "tizen-sdk check-node"
  - envelope_status: success
  - pass_rate: 2/3 (at least 2 of 3 attempts must pass)
```

To execute: send the prompt text as if the user said it, then check whether the tool call matches the expected command.

## TC structure

Each TC YAML has this shape:

```yaml
id: <plugin>.<command>.<variant>
plugin: tizen-sdk
command: <command-name>
tier: safe | mutating | device
status: draft
since_cli: 1.0.0

lanes:
  cli:
    argv: ["tizen-sdk", "<command>", ...args]
    timeout_sec: 30
    expect:
      status: success | failure
      jsonpath:
        - { path: "$.result.field", matches: "regex" }
      errors:
        - error_category: "invalid_argument"
          has_suggested_fix: true

  prompt: # optional
    text: "natural language request"
    timeout_sec: 300
    max_tool_calls: 4
    expect:
      must_call_tool: tizen_cli_run_commands
      must_resolve_command: "tizen-sdk <command>"
      envelope_status: success
    pass_rate: "2/3"
```

## TC patterns

| Pattern             | Description                             | Example                                    |
| ------------------- | --------------------------------------- | ------------------------------------------ |
| `.happy`            | Normal execution, expect success        | `check-node.happy`                         |
| `.missing-required` | Required option omitted, expect failure | `sdk-install-custom-repo.missing-required` |
| `.invalid-type`     | Invalid choice value, expect failure    | `create-project.invalid-type`              |
| `.invalid-path`     | Non-existent path, expect failure       | `sdk-init.invalid-path`                    |
| `.prompt-happy`     | LLM resolves prompt to correct command  | `check-node.prompt-happy`                  |
| `.scan-happy`       | Network scan, expect success            | `remote-device.scan-happy`                 |

## Tier meanings

- **safe**: No side effects, can run anywhere (check-node, sdk-repo-info, etc.)
- **mutating**: Installs/modifies/deletes (sdk-install, create-project, build-project)
- **device**: Requires connected emulator or physical device (install-app, screenshot, etc.)

Only `safe`-tier TCs should be run in CI without special setup.

## Status meanings

`tier` says what a TC needs to run; `status` says how far it has been verified.

- **draft**: Authored but never executed. The assertions are unproven — a `draft` TC passing schema validation says nothing about whether its `expect` block is correct.
- **candidate**: Executed and passing, but not every lane is verified yet. Typical case: the prompt lane was run by an agent while the cli lane still needs a real SDK.
- **approved**: Every lane has been executed and passes. A regression here is a release blocker.
- **quarantined**: Known unstable or environment-broken. Excluded from runs by default.

Promote a TC only after recording the run that justifies it. Never promote on the strength of `--dry-run`, which only checks the schema.

```bash
node runner.mjs --status=approved     # regression gate — verified TCs only
node runner.mjs --status=draft        # what still needs a first run
node runner.mjs --status=quarantined  # the only way to run quarantined TCs
```
