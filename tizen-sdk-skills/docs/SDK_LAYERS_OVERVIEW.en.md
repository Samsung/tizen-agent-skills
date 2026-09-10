# Intermediate Layer Introductions

> The call flow has multiple intermediate layers (CLI runner → sdk-commands.js → plugin-cache.js → .ps1). Below is an introduction to each layer and why it exists.

---

## 1. Harness Command Tools Use Synchronous Blocking + stdout Capture

Cline's `execute_command` and Claude Code's `Bash` tool both wait for the command to finish, then capture stdout. However:

- **Emulator launch** (`manageDevice`) → qemu process stays alive in the background
- **App install** (`installApp`) → sdb server daemon inherits the stdout pipe
- **GDB debug** (`setupGdbDebug`) → gdbserver remains as a detached process

In these cases, calling `.ps1` directly causes **the child process to hold the pipe handle, so `execSync` blocks forever**.

`sdk-commands.js` → `plugin-cache.js`'s `execPluginScript()` solves this with the `captureViaTempFile: true` option, which redirects stdout to a temp file instead of a pipe. This is a Node.js `execSync`-level issue that the .ps1 script itself cannot solve.

---

## 2. Parameter Validation + Error Code Mapping

The `.ps1` script is a general-purpose tool. It runs even with invalid paths, invalid ports, or invalid app IDs. `sdk-commands.js` provides:

- **Pre-validation**: path existence, port range (1–65535), timeout range, shell-safe character filtering
- **Error code mapping**: analyzes script exit code + stdout patterns to produce structured error codes (`device_not_found`, `build_failed`, `dotnet_sdk_not_found`, etc.)
- **Next-step suggestion**: `suggested_fix` field with actionable guidance (e.g., "connect a device first")

Doing this in .ps1 would make the PowerShell script enormous and only produce text output that's hard for the agent to parse.

---

## 3. Standard JSON Envelope Wrapping

The agent needs **structured JSON** to decide its next action. Direct `.ps1` output requires the agent to parse raw text:

```
# Direct .ps1 call (agent must parse):
Building project...
[100%] Linking target
Created: C:\...\MyApp-1.0.0-x86_64.tpk (188889 bytes)
```

```
# Via sdk-commands.js (agent uses directly):
{
  "status": "success",
  "result": {
    "artifacts": [{ "path": "C:\\...\\MyApp-1.0.0-x86_64.tpk", "size_bytes": 188889 }]
  }
}
```

For the agent to decide "build succeeded, next step is install", it needs JSON.

---

## 4. Cross-Platform Abstraction

The same functionality uses `.ps1` on Windows and `.sh` on Linux/macOS:

```js
// sdk-commands.js handles this:
const ext = process.platform === 'win32' ? '.ps1' : '.sh';
const scriptPath = path.join(versionDir, 'scripts', 'tizen-build-project', `tizen-build-project${ext}`);
```

If the agent calls .ps1 directly, it won't work on Linux/macOS.

---

## 5. Plugin Cache Path Resolution

Scripts live in `~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/...` (on the Claude Code harness, `~/.claude/plugins/cache/...` is also searched — the `CLAUDECODE` environment variable controls the search order). When the version changes, the path changes too. `plugin-cache.js`'s `findLatestVersionDir()` + `resolveScript()` resolves this automatically. If the agent assembles the path directly, it breaks on version updates.

---

## 6. Context Window Conservation

Calling `.ps1` directly dumps thousands of lines of toolchain output into the agent's context window. `sdk-commands.js`:

- `summarize*Output()` functions extract only key warnings/errors (max 10 lines)
- Full logs are saved to temp files (referenced if needed)
- On success, only artifact info is included in the envelope

Without this, a single build could consume tens of thousands of tokens in the context window.

---

## Summary: Role of Each Layer

| Layer | Role | Without It? |
|---|---|---|
| **CLI runner** (`*-cli.js`) | argv parsing, async execution, exit code | Agent must require/call sdk-commands.js directly |
| **sdk-commands.js** | Parameter validation, output parsing, envelope generation, error mapping | Agent must parse .ps1 text output directly |
| **plugin-cache.js** | Cache path resolution, `captureViaTempFile` | execSync blocks, no cross-platform support, hardcoded paths |
| **.ps1 / .sh** | Actual `tz`/`sdb`/`dotnet` command execution | — |

**Key insight**: The agent (LLM) reads text and makes decisions, but the system needs structured JSON and safe process management. The intermediate layers bridge this gap.

---

## Related Documents

- [Tizen SDK Command Layer Architecture](SDK_COMMANDS_ARCHITECTURE.en.md) — Full call flow, CLI runner-function mapping, exported functions
