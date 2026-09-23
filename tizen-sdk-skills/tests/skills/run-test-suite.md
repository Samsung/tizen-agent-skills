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
node runner.mjs --status=approved   # only verified TCs
node runner.mjs --tier=safe --status=approved --skip-requires=sdk,net
                                    # the CI gate: skip TCs that need an installed SDK or network
```

A bare `node runner.mjs` executes EVERY TC, including the mutating (install, create/remove
certificate profiles) and device (create/launch emulator) tiers — pass `--tier=safe` unless
the user explicitly wants a full run. An unknown option aborts instead of widening the run.

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

### Device tier

Never run `node runner.mjs --tier=device` bare: readdir order deletes the emulator before the
TCs that use it and runs the debug TCs before any emulator exists. Use the driver instead:

```bash
cd tizen-sdk-skills/tests
node scripts/prepare-device-fixtures.mjs  # once per host (6-12 min): builds the fixture apps
                                          # under fixtures/apps/, creates signing profile myProfile
                                          # from the fixture cert (--replace-profile if one exists
                                          # with another cert), installs playwright in a test project
node scripts/run-device-tier.mjs          # preflight + plan, changes nothing
node scripts/run-device-tier.mjs --yes    # ~20 min; destructive (deletes/creates test-vm and
                                          # tv-vm, stops every emulator, scans the local subnet,
                                          # installs/launches/kills the fixture apps on test-vm)
node scripts/run-device-tier.mjs --yes --include-drafts   # promotion run: drafts listed in the
                                                          # order file are executed too
```

It runs the `approved` device TCs in the order of `policy/device-run-order.yaml` through
`runner.mjs --order/--phase`, merges `fixtures/apps/fixtures.generated.env` into the runner's
environment (the `${FIXTURE_*}` argv placeholders), backs up and restores the Device Manager
bookmark list, installs the fixture apps and cleans up debuggers/port forwards between the debug
phases, boots `tv-vm` for `device-manager.tv`, and tears everything down afterwards. Ask the user
before passing `--yes`; the plan-only output lists exactly what will be deleted, stopped and
scanned. See `tests/README.md`, "Device tier", for the phases, hooks and invariants, and for the
two network-device drafts it still excludes.

### Mutating tier

Likewise never run `node runner.mjs --tier=mutating` bare (builds sort before the create that
makes the project, `remove-profile` consumes its fixture, `generate-author` refuses to overwrite
the previous run's certificates). Use the driver:

```bash
cd tizen-sdk-skills/tests
node scripts/prepare-device-fixtures.mjs --only=tmp,projects   # scratch dirs (once per host)
node scripts/run-mutating-tier.mjs          # preflight + plan, changes nothing
node scripts/run-mutating-tier.mjs --yes    # ~5 min; deletes the fixture-named test certificates
                                            # under <sdk-data>/keystore, rewrites and restores
                                            # tests/fixtures/profiles/*.xml, empties the projects dir
```

It runs the `approved` mutating TCs of `policy/mutating-run-order.yaml` with cwd = `tests/`
(the certificate TCs use `fixtures/...` relative paths), only the SDK-installer TCs whose
already-installed short-circuit makes them idempotent — it never installs or removes SDK
packages. Ask the user before passing `--yes`. See `tests/README.md`, "Mutating tier".

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
