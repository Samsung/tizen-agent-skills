# tizen-sdk-install Agent and installSdk() Integration Guide

English | [한국어](AGENT_TO_INSTALLSDK_INTEGRATION.md)

## 📋 Overview

This document explains how the `tizen-sdk-install` agent **calls the `installSdk()` function** in `lib/core/sdk-commands.js` and returns a response in Standard JSON Envelope format.

---

## ✅ Call Flow

### Step 1: User Natural Language Input

```
User: "Can you install Tizen SDK 10.0?"
```

The request names 10.0, so the agent passes it to the runner (`node sdk-install-cli.js 10.0`). Without a version the runner gets `""`: the installer installs the newest platform the repository offers, and `Tizen SDK Tools` is labelled with that version instead.

---

### Step 2: The Host Selects the Agent

Claude Code, Codex and Gemini CLI hand this request to the `tizen-sdk-install` agent. Cline has no agents, so its main agent runs the `tizen-sdk-install` skill itself; the steps below are the same either way.

```
agents/tizen-sdk-install.md → execute
```

---

### Step 3: The Agent Runs the Runner, Which Calls installSdk()

```javascript
// Inside sdk-install-cli.js, which the agent runs as `node sdk-install-cli.js 10.0`

const { installSdk } = require('../core/sdk-commands');

// Arguments from the command line the agent built from the request
const version = '10.0';   // first positional argument
const label = 'tizen';     // default or second positional argument

// ✅ Call installSdk() (called here!)
const result = await installSdk(version, label);

// cli-runner.js prints result as JSON (Step 7)
```

---

### Step 4: installSdk() Executes

```javascript
// installSdk() in lib/core/sdk-commands.js (re-exported from lib/core/sdk.js)

async function installSdk(version = '', label = 'tizen', force = false, repoUrl = '', command = 'tizen-sdk sdk-install', downloadJobs = 4) {  // '' = newest platform

  // 4-0️⃣ Version syntax first (X.Y, else invalid_argument); a custom repository hands off
  const versionCheck = validateTizenVersion(version);
  if (versionCheck.error) return formatError(command, 'invalid_argument', versionCheck.error);
  if (repoUrl) return installSdkFromRepo(repoUrl, version, force);

  try {
    // 4-1️⃣ Node.js check
    const nodeCheck = await checkNode();
    if (nodeCheck.status !== 'success') {
      return nodeCheck;  // node_not_found / node_version_unsupported — aborts with install guide
    }

    // 4-2️⃣ Check if SDK is already installed
    const sdkPath = readSdkPath();
    const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);
    if (statusCheck.alreadyInstalled) {
      const missing = requestedPlatformMissing(sdkPath, version, command, startTime);
      if (missing) return missing;  // requested version not installed: platform_version_not_found
      const packages = installedPackageSummary(sdkPath, version);
      return formatSdkInstall(packages, warnings, startTime, command);  // success
    }

    // 4-3️⃣ Disk space check (15 GB, user's home drive)
    const diskCheck = await checkDiskSpace(os.homedir(), 15);
    if (diskCheck.status !== 'success') {
      return diskCheck;  // insufficient_disk_space — aborts installation
    }

    // 4-4️⃣ Return installer command for Phase 2 (background install)
    return formatError(
      command,
      'execution_error',
      'SDK is NOT installed. This pre-check CLI cannot install it (10-15 min job). ' +
        harnessGuidance('detach') +   // 'Run the suggested_fix command per your harness: …'
        sdkPrecheckRerunHint('…'),    // re-run with the same version, without --force
      installerCommand,   // suggested_fix: { command, background_command }
      startTime
    );
  } catch (error) {
    return formatError(command, 'io_error', `Failed to install SDK: ${error.message}`);
  }
}
```

**Node.js check behavior:**
- Uses the interpreter running the runner (`process.version` / `process.execPath`) as proof that Node.js is installed; `where node` / `which node` only adds a PATH warning (issue #71: a sandboxed child PATH must not report node_not_found)
- Requires Node.js 22+ (v18–v21: warning only; below v18: fails with `node_version_unsupported`)
- If not installed: returns `node_not_found` error with:
  - Clear message: "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 22+."
  - an install command only when the source of the running Node.js is known (winget for the Windows installer, `brew upgrade node` for Homebrew's node, the version manager's own command under nvm / nvm-windows / fnm / volta); otherwise `suggested_fix.command` is null and `guide_url` is https://nodejs.org/en/download
  - Download URL: https://nodejs.org/en/download
- If installed: proceeds to SDK installation check

**Disk space check behavior:**
- Checks the drive containing the user's home directory only (e.g., `C:\` on Windows)
- Threshold: 15 GB minimum free space
- If insufficient: returns `insufficient_disk_space` error with:
  - Current free space (e.g., "3.2 GB free")
  - Required space ("15 GB required")
  - Deficit amount ("Need 11.8 GB more")
- If sufficient: proceeds to return the installer command for Phase 2



---

### Step 5: formatSdkInstall() Called

```javascript
// formatSdkInstall() in lib/envelope/response-formatter.js

function formatSdkInstall(packages, warnings = [], startTime, command = 'tizen-sdk sdk-install') {
  const envelope = new Envelope(command);
  if (typeof startTime === 'number') envelope.startTime = startTime;  // duration_ms from the CLI start
  
  return envelope.success(
    {
      packages: packages || [],
      installation_status: 'completed',
    },
    { warnings }
  );
}
```

---

### Step 6: Standard JSON Envelope Generated

After Phase 2 installs the SDK in the background, the agent re-runs the same `installSdk('10.0', 'tizen')` pre-check — the same version, without `--force`. It now takes the already-installed branch (Step 4) and returns the success envelope. The SDK went to the default path `~/tizen-sdk`, and `Tizen SDK Tools` carries the requested version `10.0`:

```json
{
  "status": "success",
  "result": {
    "packages": [
      { "name": "Tizen Platform 9.0", "status": "not_installed", "version": "9.0", "profiles": [] },
      { "name": "Tizen Platform 10.0", "status": "installed", "version": "10.0", "profiles": ["tizen"] },
      { "name": "Tizen SDK Tools", "status": "installed", "version": "10.0" }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "SDK installation verified at /home/user/tizen-sdk (sdk.info found). To force a reinstall, run with --force (script flag: -Force)."
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "user_command": "node sdk-install-cli.js 10.0",
  "duration_ms": 12
}
```

`result.packages` has one `Tizen Platform X.Y` entry per `platforms/tizen-X.Y`, with the `status` of `platform-install --list` and its payload `profiles`, then `Tizen SDK Tools`, whose `version` is a label (the requested platform version, else the newest installed one) and not the SDK version.

With `installSdk('10.0')` the installer installs `TIZEN-10.0` and its emulator package (profile `tizen`). The base SDK also ships the shared `common` data for older API versions; those directories hold no platform payload and appear as `not_installed` (only 9.0 is shown here).

---

### Step 7: Output to stdout

```javascript
// cli-runner.js (shared by the CLI runners, incl. sdk-install-cli.js)
process.stdout.write(JSON.stringify(withUserCommand(envelope), null, 2) + "\n");
// ↑ JSON to stdout, with user_command inserted right after command
```

---

### Step 8: Display Result to User

The reply follows the skill's "결과 보고" (result reporting) rules in
[`tizen-sdk-install/SKILL.md`](../../common/skills/tizen-sdk-install/SKILL.md): the envelope JSON
above goes first, verbatim, in a fenced `json` block, followed by a 1–2 line summary with the
platforms on one line grouped by status, every version listed.

```
<the envelope JSON from Step 6, verbatim, in a ```json block>

SDK installation complete (installation_status: completed).
Platforms — installed: 10.0 · not_installed: 9.0
```

---

## 📊 Complete Call Chain

```
User: "Can you install Tizen SDK 10.0?"
  │
  ▼
tizen-sdk-install agent
  │
  ├─ Phase 1: node sdk-install-cli.js 10.0
  │    installSdk('10.0', 'tizen')      ← caller: the CLI runner
  │      version syntax → Node.js check → already installed? (no) → disk space
  │    ← execution_error envelope; suggested_fix.command = installer
  │
  ├─ Phase 2: installer in the background (10–15 min) — Claude Code runs
  │    suggested_fix.command with run_in_background; Cline and other hosts
  │    without a completion notice add --detach / -Detach and poll
  │    --status / -Status; Codex runs suggested_fix.background_command (job-cli.js)
  │
  └─ Phase 3: node sdk-install-cli.js 10.0 again
       installSdk('10.0', 'tizen')
         already installed
         → installedPackageSummary(sdkPath, '10.0')
         → formatSdkInstall(packages, warnings)   ← called (internal)
         → envelope.success()
       ← Standard JSON Envelope on stdout
  │
  ▼
Display to user (envelope JSON + 1–2 line summary)
```

---

## 🎯 Responsibilities by Component

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **User** | Natural language request | - |
| **tizen-sdk-install agent** | Parse request, run the pre-check, run the installer in the background, run the pre-check again | agents/ |
| **installSdk()** | Pre-checks: return the installer command, or build `result.packages` (`installedPackageSummary()`) and call `formatSdkInstall()` | lib/core/sdk-commands.js |
| **formatSdkInstall()** | JSON formatting | lib/envelope/response-formatter.js |
| **Envelope** | Add metadata | lib/envelope/envelope.js |

---

## ✨ Dependencies

```
tizen-sdk-install agent
  ↓
lib/core/sdk-commands.js (installSdk)
  ├─ lib/envelope/response-formatter.js (formatSdkInstall)
  │   ↓
  │   lib/envelope/envelope.js (Envelope class)
  │
  ├─ Node.js child_process (checks and, with a custom repository, the
  │   URL probe; the installer itself runs here only in the pkg-compiled
  │   tizen-cli, which installs inline)
  │
  └─ fs (file I/O)
```

---

## 🎁 Summary

| Question | Answer |
|----------|--------|
| **Who calls installSdk()?** | The `sdk-install-cli.js` runner, which the agent (or, on Cline, the skill) runs |
| **Where is it called?** | In `common/lib/cli/sdk-install-cli.js` |
| **How is it called?** | Through the runner, `node sdk-install-cli.js 10.0`, once before and once after the background install |
| **What is returned?** | Standard JSON Envelope object |
| **Where is JSON generated?** | Inside installSdk() via formatSdkInstall() |

---

## 📚 Related Files

- [lib/core/sdk-commands.js](../../common/lib/core/sdk-commands.js) - installSdk() function
- [lib/envelope/response-formatter.js](../../common/lib/envelope/response-formatter.js) - formatSdkInstall() function
- [lib/envelope/envelope.js](../../common/lib/envelope/envelope.js) - Envelope class
- [agents/tizen-sdk-install.md](../../common/agents/tizen-sdk-install.md) - Agent definition
- [INSTALLATION_FLOW.en.md](./INSTALLATION_FLOW.en.md) - Full usage scenario

---

## 🎉 Conclusion

```
tizen-sdk-install agent
  ↓ (runs node sdk-install-cli.js 10.0, which calls)
installSdk() ← lib/core/sdk-commands.js
  ├─ Phase 1: pre-check → installer command (Phase 2 runs it in the background)
  └─ Phase 3: already installed → installedPackageSummary()
       └─ formatSdkInstall() ← lib/envelope/response-formatter.js
       ↓
       Return Standard JSON Envelope
       ↓
       Display JSON response to user ✅
```

**The agent now correctly calls `installSdk()` and receives a standardized JSON response!**
