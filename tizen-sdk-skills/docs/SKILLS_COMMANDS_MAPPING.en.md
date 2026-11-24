# Skill ↔ Command Mapping — Why 32 Skills but 37 Commands

English | [한국어](SKILLS_COMMANDS_MAPPING.md)

> **Scope**: the correspondence between `common/skills/` (skills) and `tizen-cli/src/command-specs/` (commands)

---

## Summary

| Unit | Count | Source of truth |
|---|---|---|
| **Skills** (natural-language trigger unit for Cline/Claude Code) | **32** | `common/skills/*/SKILL.md` |
| **Commands** (`tizen-cli tizen-sdk <command>`) | **37** | `tizen-cli/src/command-specs/*.ts` |
| SKILL.md files for tizen-cli (for reference) | 32 | `tizen-cli/skills/*/SKILL.md` — see [Why there are two skill sets](#why-there-are-two-skill-sets) |

The counts differ **by design**. A skill is a user-intent unit while a command is an execution unit, so **one skill can own multiple commands**. For example, the "create project" skill (`tizen-create-project`) owns four commands: `create-project`, `project-delete`, `list-templates`, and `import-wgt`.

---

## The 7 extra commands

The difference 37 − 30 = 7 comes from auxiliary commands attached to existing skills:

| Extra command | Owning skill | Notes |
|---|---|---|
| `sdk-repo-info` | `tizen-sdk-install` | Repository-info action of the same skill as `sdk-install` |
| `validate-repo-url` | `tizen-sdk-install-custom-repo` | Standalone URL validation without installing |
| `project-delete` | `tizen-create-project` | Delete action of the create skill |
| `list-templates` | `tizen-create-project` | List-templates action of the create skill (tizen-cli has a dedicated SKILL.md — see below) |
| `import-wgt` | `tizen-create-project` | Import-wgt action of the create skill (`tz import-wgt` on an existing `.wgt`) |
| `emulator-manager` | `tizen-create-emulator` + `tizen-launch-emulator` | Full em-cli surface (modify/reset/image capture) shared by two skills |
| `platform-list` | `tizen-platform-install` | Read-only list of the installed platform versions (`platform-install-cli.js --list`) |

The remaining 30 commands map 1:1 to skills.

---

## Full mapping table (37 commands → 32 skills)

Grouping matches the [routing table in the tizen-cli umbrella skill](../tizen-cli/skills/tizen-sdk/SKILL.md).

### SDK / platform / packages (13 commands → 10 skills)

| Command | Skill | Relation |
|---|---|---|
| `sdk-init` | `tizen-sdk-init` | 1:1 |
| `sdk-install` | `tizen-sdk-install` | shared |
| `sdk-repo-info` | `tizen-sdk-install` | shared (repo-info action) |
| `sdk-install-custom-repo` | `tizen-sdk-install-custom-repo` | shared |
| `validate-repo-url` | `tizen-sdk-install-custom-repo` | shared (validation-only action) |
| `tv-sdk-install` | `tizen-tv-sdk-install` | 1:1 |
| `tv-sdk-install-from-zip` | `tizen-tv-sdk-install-from-zip` | 1:1 |
| `update-package` | `tizen-update-package` | 1:1 |
| `platform-install` | `tizen-platform-install` | 1:1 |
| `platform-list` | `tizen-platform-install` | List action of the same skill |
| `download-emulator-package` | `tizen-download-emulator-package` | 1:1 |
| `download-mobile-platform` | `tizen-download-mobile-platform` | 1:1 |
| `install-rootstrap` | `tizen-install-rootstrap` | 1:1 |

### Preflight / toolchain (3 commands → 3 skills)

| Command | Skill | Relation |
|---|---|---|
| `check-node` | `tizen-check-node` | 1:1 |
| `check-disk-space` | `tizen-check-disk-space` | 1:1 |
| `dotnet-setup` | `tizen-dotnet-setup` | 1:1 |

### Project (5 commands → 2 skills)

| Command | Skill | Relation |
|---|---|---|
| `create-project` | `tizen-create-project` | shared |
| `project-delete` | `tizen-create-project` | shared (delete action) |
| `list-templates` | `tizen-create-project` | shared (list-templates action)¹ |
| `import-wgt` | `tizen-create-project` | shared (import-wgt action) |
| `build-project` | `tizen-build-project` | 1:1 |

¹ The tizen-cli skill set additionally has a dedicated `tizen-list-templates` SKILL.md for this command (see below).

### Emulator / device (8 commands → 7 skills)

| Command | Skill | Relation |
|---|---|---|
| `create-emulator` | `tizen-create-emulator` | shared |
| `launch-emulator` | `tizen-launch-emulator` | shared |
| `emulator-manager` | `tizen-create-emulator` + `tizen-launch-emulator` | shared by two skills |
| `device-manager` | `tizen-device-manager` | 1:1 |
| `remote-device` | `tizen-remote-device` | 1:1 (8 built-in actions: scan/connect/…) |
| `sdb-helper` | `tizen-sdb-helper` | 1:1 |
| `ecp` | `tizen-ecp` | 1:1 (Emulator Control Panel — running emulator only) |
| `file-transfer` | `tizen-file-transfer` | 1:1 |

### App / debugging / test (6 commands → 6 skills)

| Command | Skill | Relation |
|---|---|---|
| `install-app` | `tizen-install-app` | 1:1 |
| `gdb-debug` | `tizen-gdb-debug` | 1:1 (Native only) |
| `dotnet-debug` | `tizen-dotnet-debug` | 1:1 (DotNET only) |
| `webapp-debug` | `tizen-webapp-debug` | 1:1 (WebApp only) |
| `playwright-test` | `tizen-playwright-test` | 1:1 (WebApp only, run/--scaffold actions built in) |
| `screenshot` | `tizen-screenshot` | 1:1 |

### Certificates / diagnostics (2 commands → 2 skills)

| Command | Skill | Relation |
|---|---|---|
| `certificate-manager` | `tizen-certificate-manager` | 1:1 (profile/distributor/Samsung online CA actions built in) |
| `dlog-analyzer` | `tizen-dlog-analyzer` | 1:1 (start/stop/check/status/app-launch/app-terminate/dlog-collect/stop-collect/error-analyze actions built in) |

**Check**: commands 13+3+5+8+6+2 = 37; skills 10+3+2+7+6+2 = 30 (plus `tizen-handoff` and `tizen-guide`, which have no command, for 32).

---

## Why there are two skill sets

Skill directories exist per harness, with different counts:

| Location | SKILL.md count | Purpose | Contents |
|---|---|---|---|
| `common/skills/` | **32** | Cline/Claude Code — the agent runs `node <cli-runner>` directly | The 32 skills (the table above plus `tizen-handoff` and `tizen-guide`, which have no command) |
| `tizen-cli/skills/` | **32** | Agents driving tizen-cli — call `tizen-cli tizen-sdk <command>` | The same 30 + 2 extras (below) |

The 2 extras that exist only in `tizen-cli/skills/`:

1. **`tizen-sdk`** (umbrella router) — the entry-point skill containing the routing table for all 37 commands. It has no counterpart in common (Cline/Claude Code route via each skill's own description).
2. **`tizen-list-templates`** — in tizen-cli, `list-templates` is a standalone command and therefore gets a dedicated skill. In common it is handled as the list-templates action of the `tizen-create-project` skill.

In other words, "32 skills" in the docs is counted against **common/skills**, while "37 commands" is counted against the **tizen-cli command surface**. Keep this difference in bases in mind when comparing the two numbers.

---

## Related documents

- [SDK_COMMANDS_ARCHITECTURE.en.md](SDK_COMMANDS_ARCHITECTURE.en.md) — call flow: CLI runners → sdk-commands.js → domain modules
- [COMMAND_MAPPING.md](COMMAND_MAPPING.md) — command-spec ↔ envelope `command` field string mapping
- [SKILLS_REFERENCE.en.md](SKILLS_REFERENCE.en.md) — detailed reference for all 32 skills (parameters, CLI runners, response formats)
- [tizen-cli umbrella skill routing table](../tizen-cli/skills/tizen-sdk/SKILL.md)
