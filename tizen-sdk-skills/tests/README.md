# tizen-sdk Test Suite

Self-contained test suite for the `tizen-sdk` plugin. Verifies that each of the 34 plugin commands produces the correct JSON envelope output and that LLM agents (Cline, Claude, tizen-cli) resolve natural-language prompts to the correct commands.

**281 test cases** across 8 domains, covering 33 of the 34 commands plus CLI meta-interfaces (`--capabilities`, `--doctor`, `--schema`). `tv-sdk-install-from-zip` is classified in `policy/tiers.yaml` (mutating) but has no TCs yet.


## Architecture Diagram

```mermaid
graph TB
    subgraph "Test Suite Components"
        TC["tc/*.yaml<br/>281 Test Cases (274 YAML files)"]
        SCHEMA["schema/tc-schema.json<br/>JSON Schema validator"]
        POLICY["policy/tiers.yaml<br/>34 commands → tier classification"]
        RUNNER["runner.mjs<br/>CLI-lane test runner"]
        SKILLS["skills/run-test-suite.md<br/>Prompt-lane execution guide"]
    end

    subgraph "CLI Lane (Automated)"
        RUNNER -->|"1. Load & validate"| TC
        RUNNER -->|"Schema validate"| SCHEMA
        RUNNER -->|"Filter by tier"| POLICY
        RUNNER -->|"2. Execute"| PLUGIN["tizen-sdk<br/>(or tizen-cli)"]
        PLUGIN -->|"3. JSON Envelope"| RUNNER
        RUNNER -->|"4. evalExpect<br/>status + jsonpath + errors"| RUNNER
        RUNNER -->|"5. PASS/FAIL"| RESULT["Jest-style output"]
    end

    subgraph "Prompt Lane (LLM Agent)"
        SKILLS -->|"Read TC"| TC
        SKILLS -->|"Send prompt.text"| LLM["Cline / Claude<br/>(LLM Agent)"]
        LLM -->|"MCP tool call"| PLUGIN
        PLUGIN -->|"JSON Envelope"| LLM
        LLM -->|"Verify must_call_tool<br/>+ must_resolve_command<br/>+ envelope_status"| SKILLS
        SKILLS -->|"PASS/FAIL<br/>(pass_rate: 2/3)"| RESULT2["Prompt-lane result"]
    end

    subgraph "Tier System"
        SAFE["safe (6 cmds / 63 TCs)<br/>No side effects<br/>CI-safe ✅"]
        MUTATING["mutating (14 cmds / 79 TCs)<br/>Install/modify/delete<br/>⚠️ With setup"]
        DEVICE["device (14 cmds / 139 TCs)<br/>Requires emulator/device<br/>❌ Manual"]
        POLICY --> SAFE
        POLICY --> MUTATING
        POLICY --> DEVICE
    end

    style TC fill:#e1f5fe
    style RUNNER fill:#c8e6c9
    style PLUGIN fill:#fff9c4
    style LLM fill:#f3e5f5
    style SAFE fill:#c8e6c9
    style MUTATING fill:#fff9c4
    style DEVICE fill:#ffcdd2
```

### CLI Lane Flow (runner.mjs)

```mermaid
sequenceDiagram
    participant User as Developer
    participant Runner as runner.mjs
    participant FS as tc/*.yaml
    participant Schema as tc-schema.json
    participant Plugin as tizen-sdk
    participant Policy as tiers.yaml

    User->>Runner: node runner.mjs --tier=safe
    Runner->>FS: Recursively load *.yaml
    FS-->>Runner: TC objects
    Runner->>Schema: Ajv validate each TC
    Schema-->>Runner: valid ✓ / invalid ✗
    Runner->>Policy: Filter by --tier
    Policy-->>Runner: Filtered TC list
    loop For each TC with cli lane
        Runner->>Plugin: execFileSync(argv, timeout)
        Plugin-->>Runner: JSON envelope (stdout)
        Runner->>Runner: evalExpect(envelope, expect)
        Note over Runner: Check: status, jsonpath<br/>matches/equals/min_length,<br/>errors error_code/category/has_suggested_fix
    end
    Runner-->>User: ✓ passed / ✗ failed summary
```

### Prompt Lane Flow (Cline/Claude)

```mermaid
sequenceDiagram
    participant Agent as Cline/Claude
    participant TC as TC YAML
    participant LLM as LLM Agent
    participant Plugin as tizen-sdk
    participant MCP as MCP Tool

    Agent->>TC: Read prompt-lane TC
    TC-->>Agent: prompt.text + prompt.expect
    Agent->>LLM: Send prompt.text as user message
    LLM->>MCP: Call tizen_cli_run_commands
    MCP->>Plugin: Execute resolved command
    Plugin-->>MCP: JSON envelope
    MCP-->>LLM: Envelope result
    LLM-->>Agent: Tool call + envelope
    Agent->>Agent: Verify must_call_tool ✓<br/>Verify must_resolve_command ✓<br/>Verify envelope_status ✓
    Agent->>Agent: Repeat ×3 (pass_rate: 2/3)
    Agent-->>Agent: PASS if ≥2/3 attempts pass
```

### TC YAML Structure

```mermaid
graph LR
    subgraph "TC YAML File"
        META["Metadata<br/>id, plugin, command,<br/>tier, status, since_cli"]
        LANES["lanes"]
        CLI_LANE["cli lane<br/>(automated)"]
        PROMPT_LANE["prompt lane<br/>(LLM agent)"]
    end

    META --> LANES
    LANES --> CLI_LANE
    LANES --> PROMPT_LANE

    CLI_LANE --> CLI_CONTENT["argv: command + args<br/>timeout_sec<br/>expect: status, jsonpath[], errors[]"]
    PROMPT_LANE --> PROMPT_CONTENT["text: natural language<br/>timeout_sec, max_tool_calls<br/>expect: must_call_tool,<br/>must_resolve_command,<br/>envelope_status<br/>pass_rate: 2/3"]

    style META fill:#e1f5fe
    style CLI_LANE fill:#c8e6c9
    style PROMPT_LANE fill:#f3e5f5
```

## Quick Start

```bash
cd tests
npm install
node runner.mjs              # run all TCs
node runner.mjs --tier=safe  # only safe-tier (no side effects)
node runner.mjs --dry-run    # validate TCs without executing
```

## What This Tests

| Layer           | TCs | What                                   | How                                                                                      |
| --------------- | --- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| **cli lane**    | 171 | Command produces correct envelope      | `runner.mjs` executes `tizen-sdk <command>` and checks status, jsonpath, errors   |
| **prompt lane** | 118 | LLM resolves prompt to correct command | Cline/Claude reads TC, sends prompt, verifies tool call (see `skills/run-test-suite.md`) |

8 TCs define both lanes, so the lane counts sum to more than 281.

### vs. Existing Unit Tests (`common/lib/tests/`)

|             | Unit Tests                 | This Suite                 |
| ----------- | -------------------------- | -------------------------- |
| Scope       | Individual functions       | Complete commands          |
| Environment | Node.js only               | tizen-cli + plugin         |
| LLM         | Not tested                 | Prompt resolution verified |
| Purpose     | Regression during refactor | Release quality gate       |

## Directory Structure

```
tests/
  README.md               ← this file
  TEST-SUITE-PLAN.md      ← design document
  CSV-YAML-MAPPING.md     ← CSV TC ID ↔ YAML traceability table
  package.json            ← dependencies (yaml, ajv)
  runner.mjs              ← cli-lane test runner
  schema/
    tc-schema.json        ← TC YAML JSON Schema
  policy/
    tiers.yaml            ← 34 commands classified by tier
  fixtures/               ← committed state files (test cert, profiles.xml) for mutating TCs
    fixtures.env          ← values for ${NAME} argv placeholders (keeps passwords off argv)
  scripts/
    verify-doc-stats.mjs  ← CI gate: doc statistics must match actual TC files
  tc/                     ← 283 test cases in 276 YAML files
    device/               ← 103 TCs (create-emulator, launch-emulator, emulator-manager,
                                     device-manager, install-app, file-transfer,
                                     remote-device, screenshot, sdb-helper)
    sdk/                  ←  64 TCs (check-node, check-disk-space, sdk-init, sdk-install,
                                     sdk-install-custom-repo, tv-sdk-install, sdk-repo-info,
                                     validate-repo-url, update-package, platform-install,
                                     download-emulator-package, download-mobile-platform,
                                     install-rootstrap, dotnet-setup)
    debug/                ←  32 TCs (gdb-debug, dotnet-debug, webapp-debug)
    project/              ←  26 TCs (create-project, build-project, project-delete,
                                     list-templates)
    certificate/          ←  25 TCs (certificate-manager actions)
    meta/                 ←  16 TCs (--capabilities, --doctor, --schema, list-commands,
                                     no-args, guard-rules)
    test/                 ←  15 TCs (playwright-test)
    dlog-analyzer/        ←   2 TCs (dlog-analyzer)
  skills/
    run-test-suite.md     ← Cline/Claude prompt-lane execution guide
```

## TC Patterns

| Pattern                   | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `*.happy.yaml`            | Normal execution → expect `status: success`                             |
| `*.missing-required.yaml` | Required option omitted → expect `status: failure` + `invalid_argument` |
| `*.invalid-type.yaml`     | Invalid choice value → expect `status: failure`                         |
| `*.invalid-path.yaml`     | Non-existent path → expect `status: failure`                            |
| `*.prompt-happy.yaml`     | LLM prompt resolution → verify tool call + command                      |
| `*.scan-happy.yaml`       | Network scan → expect `status: success`                                 |

## Runner Options

```
node runner.mjs                    # run all TCs
node runner.mjs --tier=safe        # only safe-tier TCs
node runner.mjs --tier=mutating    # only mutating-tier TCs
node runner.mjs --tier=device      # only device-tier TCs
node runner.mjs --dry-run          # validate TCs without executing commands
node runner.mjs --tc=check-node    # filter by TC id substring
node runner.mjs --domain=sdk       # filter by domain directory
node runner.mjs --status=approved  # only verified TCs (regression gate)
```

`quarantined` TCs are excluded unless selected explicitly with `--status=quarantined`.

## Status Classification

`tier` says what a TC needs in order to run; `status` says how far it has been verified.

| Status        | Count | Meaning                                                           |
| ------------- | ----- | ----------------------------------------------------------------- |
| `draft`       | 165   | Authored, never executed — assertions unproven                    |
| `candidate`   | 8     | Executed and passing, but not every lane verified yet              |
| `approved`    | 110   | Every lane executed and passing; a regression is a release blocker |
| `quarantined` | 0     | Known unstable or environment-broken; excluded by default          |

Schema validation (`--dry-run`) never justifies a promotion — it only checks the YAML shape.

## Tier Classification

| Tier     | Commands | TCs | Description              | CI-safe?      |
| -------- | -------- | --- | ------------------------ | ------------- |
| safe     | 6        | 63  | No side effects          | ✅ Yes        |
| mutating | 14       | 79  | Install/modify/delete    | ⚠️ With setup |
| device   | 14       | 141 | Requires emulator/device | ❌ Manual     |
| **Total**| **34**   | **281** |                      |               |

See `policy/tiers.yaml` for the full classification.

## Adding a New TC

1. Create a YAML file in the appropriate `tc/<domain>/` directory
2. Follow the schema in `schema/tc-schema.json`
3. Use the naming convention: `<command>.<variant>.yaml`
4. Validate with `node runner.mjs --dry-run`
5. Update the counts in this README and `CSV-YAML-MAPPING.md` — CI runs
   `scripts/verify-doc-stats.mjs`, which fails if the documented statistics
   drift from the actual TC files
6. Never put passwords or other credential-shaped values literally in `argv`
   (security scanners flag them) — use a `${NAME}` placeholder and define the
   value in `fixtures/fixtures.env` as a base64-encoded `NAME_B64=` entry
   (the runner decodes it and exposes `${NAME}`); the runner expands
   placeholders at exec time from fixtures.env → process env → the TC's
   `env:` block. Avoid `PASSWORD`-like substrings in the key name itself

Example:

```yaml
id: tizen-sdk.check-node.happy
plugin: tizen-sdk
command: check-node
tier: safe
status: draft
since_cli: 1.0.0

lanes:
  cli:
    argv: ["tizen-sdk", "check-node"]
    timeout_sec: 30
    expect:
      status: success
      jsonpath:
        - { path: "$.result.node_version", matches: "^v\\d+" }
```

## Running Prompt-Lane TCs in Cline/Claude

See `skills/run-test-suite.md` for instructions on how Cline or Claude agents execute prompt-lane TCs by reading the TC YAML and simulating the user prompt.

## Prerequisites

- Node.js >= 20
- `tizen-cli` on PATH (for cli-lane execution)
- `tizen-sdk` plugin installed (for cli-lane execution)
- For `--dry-run` mode: no runtime needed, just Node.js + npm dependencies
