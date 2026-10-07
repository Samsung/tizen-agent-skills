# tizen-sdk-skills Architecture Diagrams

English | [한국어](ARCHITECTURE_DIAGRAMS.md)

A set of diagrams that shows the whole `tizen-sdk-skills` repository at a glance: how the AI coding assistants (Claude Code, Cline, Codex CLI, Gemini CLI, the VS Code extension) and the standalone `tizen-sdk` CLI share **one `common/`**, which layers a natural-language request passes through before it reaches the real Tizen SDK tools (`tizen`/`tz`, `sdb`, `em-cli`, `dotnet`, `gbs`), and how the result comes back as a Standard JSON Envelope.

> The counts in the diagrams (29 skills, 24 agents, 35 commands, 61 error codes, 290 TCs) describe the public release tree and match the "Project at a Glance" table in [README.md](../README.md) (v1.4.2). Re-measure them with the commands in that table's last column.

---

## 1. Big Picture

The user asks in natural language, the host picks a skill and runs a CLI runner, the runner drives the SDK tools and returns exactly one JSON Envelope.

```mermaid
graph TB
    USER["Developer<br/>Natural-language request (EN / KO)<br/>'Create a web app and install it on the emulator'"]

    subgraph HOSTS["AI hosts (6 harnesses)"]
        CLAUDE["Claude Code<br/>skills + agents + PreToolUse hooks"]
        CLINE["Cline<br/>skills + rules + PreToolUse adapter"]
        CODEX["Codex CLI<br/>skills + agents(.toml) + hooks.json"]
        GEMINI["Gemini CLI<br/>skills + agents + BeforeTool adapter"]
        VSCODE["VS Code extension<br/>installs & syncs the plugin for Claude/Cline/Codex"]
        CLI["tizen-sdk standalone CLI<br/>runs all 35 commands without an AI host"]
    end

    subgraph COMMON["common/ — single source of truth"]
        SKILLS["skills/<br/>29 SKILL.md<br/>(trigger phrases + how to call the runner)"]
        AGENTS["agents/<br/>24 agent .md<br/>(sub-agent delegation)"]
        HOOKS["hooks/<br/>3 guard scripts + 13 rules"]
        LIB["lib/<br/>cli/ → core/ → envelope/"]
        SCRIPTS["scripts/<br/>tizen-*/ .ps1 + .sh feature scripts"]
    end

    subgraph SDK["Tizen SDK tools"]
        TZ["tizen / tz<br/>create · build · package"]
        SDB["sdb<br/>install · shell · forward · dlog"]
        EMCLI["em-cli<br/>emulator VM management"]
        DOTNET["dotnet<br/>workload · restore"]
        GBS["gbs<br/>Platform .rpm build"]
    end

    subgraph TARGET["Targets"]
        EMU["Emulator VM"]
        DEV["Device / TV<br/>(USB or network sdb)"]
    end

    USER --> HOSTS
    CLAUDE & CLINE & CODEX & GEMINI --> SKILLS
    CLAUDE --> AGENTS
    CLAUDE & CLINE & CODEX & GEMINI --> HOOKS
    VSCODE -->|"install · sync"| COMMON
    SKILLS --> LIB
    AGENTS --> LIB
    CLI -->|"esbuild bundle"| LIB
    LIB --> SCRIPTS
    SCRIPTS --> TZ & SDB & EMCLI & DOTNET & GBS
    SDB --> EMU & DEV
    EMCLI --> EMU
    LIB -.->|"Standard JSON Envelope<br/>(one object on stdout)"| HOSTS

    style USER fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style COMMON fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style LIB fill:#a5d6a7,stroke:#546e7a,color:#1a1a1a
    style SDK fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style TARGET fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style CLI fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
```

---

## 2. Repository Layout

`common/` holds all the logic; every other directory is either a **thin per-harness adapter** or a tool (CLI, extension, tests, docs).

```mermaid
graph LR
    ROOT["tizen-sdk-skills/"]

    ROOT --> COMMON["common/<br/>shared logic (single source of truth)"]
    ROOT --> CLAUDE["claude/setup/<br/>2-line wrappers (setup.sh/.ps1/.bat)"]
    ROOT --> CLINE["cline/<br/>hooks/ PreToolUse adapter + guard.md<br/>setup/ wrappers"]
    ROOT --> CODEX["codex/setup/<br/>wrappers (~/.codex, ~/.agents/skills)"]
    ROOT --> GEMINI["gemini/<br/>hooks/ BeforeTool adapter<br/>setup/ wrappers"]
    ROOT --> TCLI["tizen-cli/<br/>standalone tizen-sdk CLI (TypeScript + esbuild)"]
    ROOT --> VSC["vscode/<br/>Tizen AI Extension (.vsix)"]
    ROOT --> TESTS["tests/<br/>290 TC YAML + runner.mjs + fixtures"]
    ROOT --> DOCS["docs/ · usage/<br/>documentation (ko/en pairs) · scenarios"]
    ROOT --> SCR["scripts/<br/>repo maintenance (SPDX, runner-snippet sync, publication)"]
    ROOT --> REPOROOT["_repo-root/<br/>staging copy of the public repo root files"]

    COMMON --> C_PLUGIN[".claude-plugin/plugin.json"]
    COMMON --> C_SKILLS["skills/&lt;tizen-*&gt;/SKILL.md"]
    COMMON --> C_AGENTS["agents/tizen-*.md"]
    COMMON --> C_LIB["lib/"]
    COMMON --> C_SCRIPTS["scripts/tizen-*/ (.ps1 + .sh)<br/>scripts/lib/ shared shell library"]
    COMMON --> C_HOOKS["hooks/<br/>check-tizen-commands.sh<br/>check-project-writes.sh<br/>check-skill-routing.sh<br/>hooks.json · guard.md"]
    COMMON --> C_SETUP["setup/<br/>setup.sh/.ps1 --harness X<br/>setup-lib.* · hosts/X.sh/.ps1"]
    COMMON --> C_TOOLS["tools/<br/>dlog-analyzer binaries (win/linux/mac)"]

    C_LIB --> L_CLI["cli/ *-cli.js<br/>one entry point per command (run via node)"]
    C_LIB --> L_CORE["core/<br/>sdk-commands · plugin-cache · sdk · sdb<br/>emulator · device · project · debug · certificate ..."]
    C_LIB --> L_ENV["envelope/<br/>envelope · envelope-wrapper<br/>response-formatter · mask-secrets"]
    C_LIB --> L_TESTS["tests/ unit tests (run-all.js)"]

    TCLI --> T_SRC["src/ index · commands · doctor<br/>envelope-adapter · command-specs/"]
    TCLI --> T_SKILLS["skills/ 31 SKILL.md (for agents driving the CLI)"]
    TCLI --> T_DIST["dist/tizen-sdk.js (build output)<br/>bin/tizen-sdk.js (launcher)"]

    style ROOT fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style COMMON fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style C_LIB fill:#a5d6a7,stroke:#546e7a,color:#1a1a1a
    style TCLI fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style TESTS fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
```

---

## 3. Call Flow

The layers one request passes through. Why each intermediate layer exists is explained in [SDK_LAYERS_OVERVIEW.en.md](SDK_LAYERS_OVERVIEW.en.md); the function-level mapping is in [SDK_COMMANDS_ARCHITECTURE.en.md](SDK_COMMANDS_ARCHITECTURE.en.md).

```mermaid
sequenceDiagram
    participant U as Developer
    participant H as AI host<br/>(Claude Code / Cline / ...)
    participant S as SKILL.md<br/>(routing + input collection)
    participant A as Agent .md<br/>(Claude Code only, optional)
    participant R as CLI runner<br/>lib/cli/*-cli.js
    participant C as core/sdk-commands.js
    participant P as core/plugin-cache.js
    participant X as scripts/tizen-*/<br/>.ps1 or .sh
    participant T as tizen · sdb · em-cli

    U->>H: "Build this project"
    H->>S: trigger phrase match → tizen-build-project
    S->>H: confirm required inputs (path, build type, profile)
    alt Claude Code (Agent tool available)
        H->>A: delegate to sub-agent
        A->>R: Bash: node project-manager-cli.js build ...
    else Cline / Codex / Gemini
        H->>R: runner-lookup snippet → node <cache>/lib/cli/project-manager-cli.js build ...
    end
    R->>C: buildProject({ project, buildType, ... })
    C->>C: validate args (path exists, port range, shell-safe chars)
    C->>P: execPluginScript(scriptName, args, { captureViaTempFile })
    P->>P: resolve script path (__dirname → newest cache version)
    P->>X: run platform script (win32 → .ps1, else → .sh)
    X->>T: tz build && tz pack (or gbs build)
    T-->>X: toolchain output (thousands of lines)
    X-->>P: exit code + stdout (temp file)
    P-->>C: raw output
    C->>C: summarise (≤10 warning/error lines) + map error code + suggested_fix
    C-->>R: Envelope (success / failure)
    R-->>H: one JSON Envelope on stdout, diagnostics on stderr
    H-->>U: report (json block + 1–2 line summary)
```

**Key rule:** the agent never calls `.ps1`/`.sh` or `sdb` directly. It always goes through the runner and relays only the Envelope the runner returned. The guard hooks in section 5 enforce this.

---

## 4. Standard JSON Envelope

Every command prints **exactly one Envelope** on stdout. An agent can decide its next step from `status` and `errors[].suggested_fix` alone.

```mermaid
graph LR
    subgraph ENV["Standard JSON Envelope"]
        ST["status<br/>success | failure | error"]
        CMD["command<br/>internal label (e.g. tizen-sdk build-project)"]
        UC["user_command<br/>what the user typed (tizen-cli)"]
        DUR["duration_ms"]
        RES["result<br/>command-specific structured data<br/>(artifacts, sdk_path, devices, ...)"]
        WARN["warnings[]"]
        ERRS["errors[]"]
    end

    ERRS --> E1["error_code<br/>TIZEN_SDK_*_E###<br/>(61 in the registry)"]
    ERRS --> E2["error_category<br/>device_not_found · build_failed<br/>sdk_path_not_set · invalid_argument ..."]
    ERRS --> E3["message"]
    ERRS --> E4["suggested_fix<br/>{ command, auto_fixable, description }"]
    ERRS --> E5["details[]<br/>diagnostic lines such as compiler errors"]

    subgraph LAYER["envelope/ layer"]
        L1["envelope.js<br/>Envelope class + ERROR_CODES"]
        L2["envelope-wrapper.js<br/>wrapEnvelope · CommonErrors"]
        L3["response-formatter.js<br/>per-command result formatters"]
        L4["mask-secrets.js<br/>masks passwords · tokens"]
    end

    L1 --> ENV
    L2 --> L1
    L3 --> L1
    L4 --> L1

    style ENV fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style ST fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style ERRS fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
    style LAYER fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
```

The dependency direction is always `cli/ → core/ → envelope/` with no reverse dependency. See [envelope/ENVELOPE_USAGE_GUIDE.en.md](envelope/ENVELOPE_USAGE_GUIDE.en.md) for details.

---

## 5. Guard Hooks

PreToolUse hooks that stop an agent from bypassing the runner to call SDK tools directly or from hand-writing project files. The hook scripts exist once in `common/hooks/`; a per-host adapter connects each host's hook protocol to those scripts.

```mermaid
graph TB
    subgraph TOOLS["Agent tool calls"]
        BASH["Bash / PowerShell<br/>(sdb ..., tizen ..., em-cli ...)"]
        WRITE["Write / Bash<br/>(writing config.xml, tizen-manifest.xml)"]
        SKILL["Skill<br/>(routing to the wrong skill)"]
    end

    subgraph GUARDS["common/hooks/ — 3 guards, 13 rules"]
        G1["check-tizen-commands.sh<br/>blocks direct sdb · tizen · em-cli calls<br/>→ points to the right skill"]
        G2["check-project-writes.sh<br/>blocks hand-written Tizen project files<br/>→ points to tizen-create-project"]
        G3["check-skill-routing.sh<br/>validates skill routing rules<br/>(e.g. logs → dlog-analyzer)"]
        RULES["tizen-sdk-skills-guard.md<br/>host-neutral rules (for AGENTS.md / GEMINI.md)"]
    end

    subgraph ADAPTERS["Per-host wiring"]
        HC["Claude Code<br/>hooks.json → settings.json snippet<br/>matcher: Bash|PowerShell · Write|Bash · Skill"]
        HL["Cline<br/>cline/hooks/PreToolUse adapter<br/>Documents/Cline/Hooks + Rules"]
        HX["Codex CLI<br/>~/.codex/hooks.json + ~/.codex/AGENTS.md"]
        HG["Gemini CLI<br/>gemini/hooks BeforeTool adapter<br/>settings.json + ~/.gemini/GEMINI.md"]
    end

    BASH --> G1
    WRITE --> G2
    SKILL --> G3
    HC & HL & HX & HG --> GUARDS
    RULES -.-> HX & HG

    G1 & G2 & G3 -->|"allow / deny + guidance message"| RESULT["tool call allowed or blocked"]

    style GUARDS fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
    style ADAPTERS fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style RESULT fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
```

Run the hook tests with `bash common/hooks/hooks.test.sh` (122 cases).

---

## 6. Harness Setup & Sync

Every harness mirrors **the same `common/` into the same cache path layout**. The only differences are where skills, agents and hooks are loaded from and the agent file format.

```mermaid
graph TB
    SRC["Local checkout<br/>tizen-sdk-skills/common/"]

    subgraph WRAP["Per-harness 2-line wrappers"]
        W1["claude/setup/setup.sh/.ps1"]
        W2["cline/setup/setup.sh/.ps1"]
        W3["codex/setup/setup.sh/.ps1"]
        W4["gemini/setup/setup.sh/.ps1"]
    end

    CORE["common/setup/setup.sh/.ps1 --harness X<br/>setup-lib.*: mirror copy · compare · version · guard section"]

    subgraph HOSTDEF["common/setup/hosts/"]
        HD1["claude.sh/.ps1"]
        HD2["cline.sh/.ps1"]
        HD3["codex.sh/.ps1"]
        HD4["gemini.sh/.ps1"]
    end

    CACHE["~/&lt;dot-dir&gt;/plugins/cache/tizen-platform/tizen-sdk-skills/&lt;version&gt;/<br/>skills · agents · lib · scripts · hooks · docs (clean mirror)"]

    subgraph LOAD["Where each host actually loads from"]
        LC["Claude Code<br/>~/.claude/skills · ~/.claude/agents<br/>settings.json hooks snippet"]
        LL["Cline<br/>~/.cline/skills<br/>Documents/Cline/Hooks · Rules"]
        LX["Codex CLI<br/>~/.agents/skills · ~/.codex/agents/*.toml<br/>~/.codex/hooks.json · AGENTS.md"]
        LG["Gemini CLI<br/>~/.gemini/skills · ~/.gemini/agents/*.md<br/>settings.json · GEMINI.md"]
    end

    VSC["VS Code extension (Tizen AI Extension)<br/>installs & syncs the bundled common/ from inside the editor<br/>merges Claude Code hooks into settings.json"]

    SRC --> WRAP --> CORE
    CORE --> HOSTDEF
    HOSTDEF --> CACHE
    HD1 --> LC
    HD2 --> LL
    HD3 --> LX
    HD4 --> LG
    VSC --> CACHE
    VSC --> LC & LL & LX

    LOOKUP["Runner-lookup snippet (shared by every SKILL.md / agent.md)<br/>1. prefer the running host's dot-dir (CLAUDECODE · GEMINI_CLI · CODEX_* env vars)<br/>2. fall back through .claude → .cline → .codex → .gemini<br/>3. pick the highest version directory"]
    LC & LL & LX & LG -.-> LOOKUP --> CACHE

    style SRC fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style CORE fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style CACHE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style VSC fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style LOOKUP fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
```

`node scripts/rewrite-runner-snippets.js --check` keeps the runner-lookup snippet identical across all skills and agents. Per-host paths are listed in [deployment/HARNESS_SETUP.en.md](deployment/HARNESS_SETUP.en.md).

---

## 7. Standalone tizen-sdk CLI (tizen-cli/)

A CLI that runs the same commands without any AI host. esbuild inlines `common/lib` into **a single JS file** and copies `common/scripts` next to it.

```mermaid
graph LR
    subgraph BUILD["Build (pnpm run build)"]
        SRC_TS["tizen-cli/src/*.ts<br/>index · commands · doctor<br/>envelope-adapter · command-specs/"]
        C_LIB["../common/lib/**<br/>(CommonJS core)"]
        C_SCR["../common/scripts/<br/>(minus the t-cli wrapper)"]
        C_SK["tizen-cli/skills/"]
        ESB["esbuild.config.js<br/>package.json is the single version source"]
    end

    subgraph DIST["dist/"]
        BUNDLE["tizen-sdk.js<br/>(pure JS bundle)"]
        D_SCR["scripts/"]
        D_SK["skills/"]
        PJ["plugin.json<br/>commands auto-updated"]
    end

    LAUNCHER["bin/tizen-sdk.js launcher<br/>PLUGIN_NOT_BUILT Envelope when dist/ is missing"]

    subgraph IFACE["run(args) — 4 interfaces"]
        I1["--schema<br/>command catalog (generated from commander)"]
        I2["--doctor<br/>SDK path · cache · runner status"]
        I3["--capabilities<br/>commands usable right now"]
        I4["&lt;command&gt; [options]<br/>run one of 35 flat commands"]
    end

    ADAPT["envelope-adapter.ts<br/>inner Envelope → tizen-cli Envelope<br/>records user_command · never process.exit"]

    SRC_TS & C_LIB --> ESB --> BUNDLE
    C_SCR --> ESB --> D_SCR
    C_SK --> ESB --> D_SK
    ESB --> PJ
    LAUNCHER --> BUNDLE
    BUNDLE --> IFACE
    I4 --> ADAPT --> OUT["stdout: Standard JSON Envelope"]

    style BUILD fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style DIST fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style IFACE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style OUT fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
```

`command-specs/` holds declarative per-domain specs (sdk, check, project, device, debug, dlog-analyzer, test, certificate). `tests/runner.mjs` executes this same bundle.

---

## 8. Command Domains (35)

Skills are named `tizen-<command>`; the CLI form is `tizen-sdk <command>`. The exact correspondence is in [SKILLS_COMMANDS_MAPPING.en.md](SKILLS_COMMANDS_MAPPING.en.md).

```mermaid
graph LR
    ROOT["tizen-sdk<br/>35 commands"]

    ROOT --> SDK["SDK (13)"]
    ROOT --> CHECK["Check (2)"]
    ROOT --> PROJECT["Project (5)"]
    ROOT --> DEVICE["Device (9)"]
    ROOT --> DEBUG["Debug (4)"]
    ROOT --> TEST["Test (1)"]
    ROOT --> CERT["Certificate (1)"]

    SDK --> SDK_CMDS["sdk-init<br/>sdk-install<br/>sdk-install-custom-repo<br/>validate-repo-url<br/>sdk-repo-info<br/>tv-sdk-install<br/>tv-sdk-install-from-zip<br/>update-package<br/>platform-install<br/>download-emulator-package<br/>download-mobile-platform<br/>install-rootstrap<br/>dotnet-setup"]
    CHECK --> CHECK_CMDS["check-node<br/>check-disk-space"]
    PROJECT --> PROJECT_CMDS["create-project<br/>list-templates<br/>import-wgt<br/>build-project<br/>project-delete"]
    DEVICE --> DEVICE_CMDS["create-emulator<br/>launch-emulator<br/>emulator-manager<br/>device-manager<br/>install-app<br/>sdb-helper<br/>screenshot<br/>file-transfer<br/>remote-device"]
    DEBUG --> DEBUG_CMDS["gdb-debug<br/>dotnet-debug<br/>webapp-debug<br/>dlog-analyzer"]
    TEST --> TEST_CMDS["playwright-test"]
    CERT --> CERT_CMDS["certificate-manager"]

    style ROOT fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style SDK fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style CHECK fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style PROJECT fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style DEVICE fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style DEBUG fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style TEST fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style CERT fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
```

---

## 9. Typical End-to-End Flow

The order in which skills chain together when a first-time user goes from SDK install to debugging in natural language. Every step can also run on its own.

```mermaid
flowchart LR
    subgraph ENVSET["1. Environment"]
        N["check-node"] --> D["check-disk-space"] --> SI["sdk-install<br/>(two-phase: pre-check + background install)"]
        SI --> EP["download-emulator-package /<br/>platform-install"]
        SI -.-> TV["tv-sdk-install<br/>(TV development)"]
        SI -.-> DN["dotnet-setup<br/>(.NET development)"]
    end

    subgraph DEVICE["2. Target"]
        CE["create-emulator"] --> LE["launch-emulator"] --> DM["device-manager<br/>(sdb devices)"]
        RD["remote-device<br/>(TV over the network)"] --> DM
    end

    subgraph PROJ["3. Project"]
        CP["create-project<br/>Native · DotNET · Web · TV · Platform"] --> BP["build-project<br/>.tpk / .wgt / .rpk / .rpm"]
        CM["certificate-manager<br/>signing profile"] -.-> BP
    end

    subgraph RUN["4. Deploy & run"]
        IA["install-app --run"] --> SS["screenshot"]
        IA --> FT["file-transfer"]
        IA --> SH["sdb-helper"]
    end

    subgraph DBG["5. Debug & test"]
        GD["gdb-debug<br/>(Native)"]
        DD["dotnet-debug<br/>(.NET netcoredbg)"]
        WD["webapp-debug<br/>(RWI/CDP)"] --> PT["playwright-test"]
        DL["dlog-analyzer<br/>crash · exception analysis"]
    end

    ENVSET --> DEVICE --> PROJ --> RUN --> DBG

    style ENVSET fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style DEVICE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style PROJ fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style RUN fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style DBG fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
```

Step-by-step scenarios live in [usage/usage.en.md](../usage/usage.en.md) and the walkthrough documents under `docs/`.

---

## 10. Tests & CI (Quality Gates)

Three layers of verification: unit tests (functions), hook tests (guards) and integration TCs (whole commands). CI runs only the side-effect-free `safe` tier automatically.

```mermaid
graph TB
    subgraph UNIT["Unit · hook tests"]
        UT["common/lib/tests/run-all.js<br/>80 files · ≈2,890 assertions"]
        HT["common/hooks/hooks.test.sh<br/>122 cases"]
        SLT["common/scripts/lib/common.test.sh<br/>shell library"]
        VT["vscode: npm test<br/>118 cases"]
    end

    subgraph SUITE["tests/ integration TC suite (290 TCs)"]
        TC["tc/*.yaml<br/>cli lane + prompt lane"]
        RUNNER["runner.mjs<br/>→ runs tizen-cli/dist/tizen-sdk.js<br/>→ checks the Envelope (status · jsonpath · errors)"]
        TIERS["policy/tiers.yaml"]
        SAFE["safe 66<br/>no side effects · CI gate"]
        MUT["mutating 79<br/>scripts/run-mutating-tier.mjs"]
        DEV["device 141<br/>scripts/run-device-tier.mjs"]
        TC --> RUNNER
        TIERS --> SAFE & MUT & DEV
    end

    subgraph CI[".github/workflows/ci.yml (every PR)"]
        J1["Lint & Type Check<br/>ESLint · Prettier · SPDX headers<br/>runner-snippet sync · internal-only fence · tsc"]
        J2["Build<br/>tizen-cli (public variant verified) · vscode extension"]
        J3["Test<br/>unit · hooks · shell · TC schema lint<br/>runner.mjs --tier=safe --status=approved --skip-requires=sdk,net"]
    end

    subgraph REL[".github/workflows/release.yml (tag tizen-sdk-skills-vX.Y.Z)"]
        R1["tizen-sdk-vX.Y.Z.zip<br/>(dist/)"]
        R2["tizen-ai-extension-vX.Y.Z.vsix"]
        R3["create GitHub Release"]
        R1 & R2 --> R3
    end

    UNIT --> J3
    SAFE --> J3
    J1 & J2 & J3 -->|"all green"| MERGE["merge to main"] --> REL

    style UNIT fill:#e1f5fe,stroke:#546e7a,color:#1a1a1a
    style SUITE fill:#fff9c4,stroke:#546e7a,color:#1a1a1a
    style SAFE fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
    style MUT fill:#ffe0b2,stroke:#546e7a,color:#1a1a1a
    style DEV fill:#ffcdd2,stroke:#546e7a,color:#1a1a1a
    style CI fill:#f3e5f5,stroke:#546e7a,color:#1a1a1a
    style REL fill:#c8e6c9,stroke:#546e7a,color:#1a1a1a
```

How to run the TC suite and the per-tier caveats are in [tests/README.md](../tests/README.md).

---

## Related Documents

- [README.md](../README.md) — project overview, quick start, the 35-command table, "Project at a Glance"
- [SDK_LAYERS_OVERVIEW.en.md](SDK_LAYERS_OVERVIEW.en.md) — why the intermediate layers (CLI runner → sdk-commands → plugin-cache → script) exist
- [SDK_COMMANDS_ARCHITECTURE.en.md](SDK_COMMANDS_ARCHITECTURE.en.md) — full call flow and runner-to-function mapping
- [SKILLS_REFERENCE.en.md](SKILLS_REFERENCE.en.md) — trigger phrases, parameters and response formats per skill
- [SKILLS_COMMANDS_MAPPING.en.md](SKILLS_COMMANDS_MAPPING.en.md) — skills ↔ commands correspondence
- [envelope/ENVELOPE_USAGE_GUIDE.en.md](envelope/ENVELOPE_USAGE_GUIDE.en.md) — Standard JSON Envelope usage guide
- [deployment/HARNESS_SETUP.en.md](deployment/HARNESS_SETUP.en.md) — per-host install paths and how to add a new harness
- [tizen-cli/build-and-install.en.md](tizen-cli/build-and-install.en.md) — building and installing the standalone CLI
- [tests/README.md](../tests/README.md) — test suite architecture
