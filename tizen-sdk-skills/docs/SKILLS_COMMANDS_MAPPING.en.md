# Skill ↔ Command Mapping — Why 29 Skills but 34 Commands

> **Scope**: the correspondence between `common/skills/` (skills) and `tizen-cli/src/command-specs/` (commands)
>
> **한국어 버전**: [SKILLS_COMMANDS_MAPPING.md](SKILLS_COMMANDS_MAPPING.md)

---

## Summary

| Unit | Count | Source of truth |
|---|---|---|
| **Skills** (natural-language trigger unit for Cline/Claude Code) | **29** | `common/skills/*/SKILL.md` |
| **Commands** (`tizen-cli tizen-sdk <command>`) | **34** | `tizen-cli/src/command-specs/*.ts` |
| SKILL.md files for tizen-cli (for reference) | 31 | `tizen-cli/skills/*/SKILL.md` — see [Why there are two skill sets](#why-there-are-two-skill-sets) |

The counts differ **by design**. A skill is a user-intent unit while a command is an execution unit, so **one skill can own multiple commands**. For example, the "create project" skill (`tizen-create-project`) owns three commands: `create-project`, `project-delete`, and `list-templates`.

---

## The 5 extra commands

The difference 34 − 29 = 5 comes from auxiliary commands attached to existing skills:

| Extra command | Owning skill | Notes |
|---|---|---|
| `sdk-repo-info` | `tizen-sdk-install` | Repository-info action of the same skill as `sdk-install` |
| `validate-repo-url` | `tizen-sdk-install-custom-repo` | Standalone URL validation without installing |
| `project-delete` | `tizen-create-project` | Delete action of the create skill |
| `list-templates` | `tizen-create-project` | List-templates action of the create skill (tizen-cli has a dedicated SKILL.md — see below) |
| `emulator-manager` | `tizen-create-emulator` + `tizen-launch-emulator` | Full em-cli surface (modify/reset/image capture) shared by two skills |

The remaining 29 commands map 1:1 to skills.

---

## Full mapping table (34 commands → 29 skills)

Grouping matches the [routing table in the tizen-cli umbrella skill](../tizen-cli/skills/tizen-sdk/SKILL.md).

### SDK / platform / packages (12 commands → 10 skills)

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
| `download-emulator-package` | `tizen-download-emulator-package` | 1:1 |
| `download-mobile-platform` | `tizen-download-mobile-platform` | 1:1 |
| `install-rootstrap` | `tizen-install-rootstrap` | 1:1 |

### Preflight / toolchain (3 commands → 3 skills)

| Command | Skill | Relation |
|---|---|---|
| `check-node` | `tizen-check-node` | 1:1 |
| `check-disk-space` | `tizen-check-disk-space` | 1:1 |
| `dotnet-setup` | `tizen-dotnet-setup` | 1:1 |

### Project (4 commands → 2 skills)

| Command | Skill | Relation |
|---|---|---|
| `create-project` | `tizen-create-project` | shared |
| `project-delete` | `tizen-create-project` | shared (delete action) |
| `list-templates` | `tizen-create-project` | shared (list-templates action)¹ |
| `build-project` | `tizen-build-project` | 1:1 |

¹ The tizen-cli skill set additionally has a dedicated `tizen-list-templates` SKILL.md for this command (see below).

### Emulator / device (7 commands → 6 skills)

| Command | Skill | Relation |
|---|---|---|
| `create-emulator` | `tizen-create-emulator` | shared |
| `launch-emulator` | `tizen-launch-emulator` | shared |
| `emulator-manager` | `tizen-create-emulator` + `tizen-launch-emulator` | shared by two skills |
| `device-manager` | `tizen-device-manager` | 1:1 |
| `remote-device` | `tizen-remote-device` | 1:1 (8 built-in actions: scan/connect/…) |
| `sdb-helper` | `tizen-sdb-helper` | 1:1 |
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

**Check**: commands 12+3+4+7+6+2 = 34; skills 10+3+2+6+6+2 = 29.

---

## Why there are two skill sets

Skill directories exist per harness, with different counts:

| Location | SKILL.md count | Purpose | Contents |
|---|---|---|---|
| `common/skills/` | **29** | Cline/Claude Code — the agent runs `node <cli-runner>` directly | The 29 skills in the table above |
| `tizen-cli/skills/` | **31** | Agents driving tizen-cli — call `tizen-cli tizen-sdk <command>` | The same 29 + 2 extras (below) |

The 2 extras that exist only in `tizen-cli/skills/`:

1. **`tizen-sdk`** (umbrella router) — the entry-point skill containing the routing table for all 34 commands. It has no counterpart in common (Cline/Claude Code route via each skill's own description).
2. **`tizen-list-templates`** — in tizen-cli, `list-templates` is a standalone command and therefore gets a dedicated skill. In common it is handled as the list-templates action of the `tizen-create-project` skill.

In other words, "29 skills" in the docs is counted against **common/skills**, while "34 commands" is counted against the **tizen-cli command surface**. Keep this difference in bases in mind when comparing the two numbers.

---

## Related documents

- [SDK_COMMANDS_ARCHITECTURE.en.md](SDK_COMMANDS_ARCHITECTURE.en.md) — call flow: CLI runners → sdk-commands.js → domain modules
- [COMMAND_MAPPING.md](COMMAND_MAPPING.md) — command-spec ↔ envelope `command` field string mapping
- [SKILLS_REFERENCE.en.md](SKILLS_REFERENCE.en.md) — detailed reference for all 29 skills (parameters, CLI runners, response formats)
- [tizen-cli umbrella skill routing table](../tizen-cli/skills/tizen-sdk/SKILL.md)
