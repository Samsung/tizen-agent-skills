# tizen-sdk-install Agent and installSdk() Integration Guide

English | [한국어](AGENT_TO_INSTALLSDK_INTEGRATION.md)

## 📋 Overview

This document explains how the `tizen-sdk-install` agent **calls the `installSdk()` function** in `lib/core/sdk-commands.js` and returns a response in Standard JSON Envelope format.

---

## ✅ Call Flow

### Step 1: User Natural Language Input

```
User: "Can you install the Tizen SDK?"
```

---

### Step 2: Cline Selects Agent

Cline automatically selects and runs the `tizen-sdk-install` agent.

```
agents/tizen-sdk-install.md → execute
```

---

### Step 3: Agent Calls installSdk()

```javascript
// Inside tizen-sdk-install agent

const { installSdk } = require('../../../lib/core/sdk-commands');

// Extract parameters from user request
const version = '10.0';   // parsed from user request
const label = 'tizen';     // default or user-specified

// ✅ Call installSdk() (called here!)
const result = await installSdk(version, label);

// Output as JSON
console.log(JSON.stringify(result));
```

---

### Step 4: installSdk() Executes

```javascript
// installSdk() function in lib/core/sdk-commands.js

async function installSdk(version = '10.0', label = 'tizen', force = false) {
  try {
    // 1. ✅ Node.js check (very first step) — NEW
    const nodeCheck = await checkNode();
    if (nodeCheck.status !== 'success') {
      return nodeCheck;  // node_not_found — aborts with install guide
    }

    // 2. Check if SDK is already installed
    const sdkPath = readSdkPath();
    const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);
    if (statusCheck.alreadyInstalled) {
      return formatSdkInstall(packages, warnings, startTime);  // success
    }

    // 3. ✅ Disk space check (15 GB, user's home drive)
    const diskCheck = await checkDiskSpace(os.homedir(), 15);
    if (diskCheck.status !== 'success') {
      return diskCheck;  // insufficient_disk_space — aborts installation
    }

    // 4. Return installer command for Phase 2 (background install)
    return formatError(
      'tizen-sdk sdk-install',
      'execution_error',
      'SDK is NOT installed. Run the suggested_fix command with run_in_background: true...',
      installerCommand,
      startTime
    );
  } catch (error) {
    return formatError(...);
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

function formatSdkInstall(packages, warnings = []) {
  const envelope = new Envelope('tizen-sdk sdk-install');
  
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

After Phase 2 installs the SDK in the background, the agent re-runs the same `installSdk('10.0', 'tizen')` pre-check. It now takes the already-installed branch (Step 4) and returns the success envelope. The SDK went to the default path `~/tizen-sdk`, and `Tizen SDK Tools` carries the requested version `10.0`:

```json
{
  "status": "success",
  "result": {
    "packages": [
      { "name": "Tizen Platform 9.0", "status": "not_installed", "version": "9.0", "profiles": [] },
      { "name": "Tizen Platform 10.0", "status": "installed", "version": "10.0", "profiles": ["tizen", "tv-samsung"] },
      { "name": "Tizen Platform 11.0", "status": "installed", "version": "11.0", "profiles": ["tizen"] },
      { "name": "Tizen SDK Tools", "status": "installed", "version": "10.0" }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "SDK installation verified at /home/user/tizen-sdk (sdk.info found). To force a reinstall, run with --force (script flag: -Force)."
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "duration_ms": 1900
}
```

`result.packages` has one `Tizen Platform X.Y` entry per `platforms/tizen-X.Y`, with the `status` of `platform-install --list` and its payload `profiles`, then `Tizen SDK Tools`, whose `version` is a label (the requested platform version, else the newest installed one) and not the SDK version.

---

### Step 7: Output to stdout

```javascript
console.log(JSON.stringify(envelope));
// ↑ JSON output to stdout
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
Platforms — installed: 10.0, 11.0 · not_installed: 9.0
```

---

## 📊 Complete Call Chain

```
┌────────────────────────────────┐
│ User                            │
│ "Can you install the SDK?"     │
└──────────────┬─────────────────┘
               │
               ▼
     ┌──────────────────────────────┐
     │ tizen-sdk-install agent      │
     │                              │
     │ const { installSdk } =       │
     │   require('./sdk-commands'); │
     │                              │
     │ const result =               │
     │   await installSdk('10.0'); │  ← caller!
     └──────────────┬───────────────┘
                    │ (call)
                    ▼
         ┌──────────────────────┐
         │ installSdk()          │
         │ 1. readSdkPath()      │
         │ 2. execSync()         │ (3 min)
         │ 3. JSON.parse()       │
         │ 4. formatSdkInstall() │ ← called (internal)
         │ 5. return envelope     │
         └──────────┬───────────┘
                    │
         ┌──────────▼────────────────┐
         │ formatSdkInstall()         │
         │ return envelope.success()  │
         └──────────┬────────────────┘
                    │
         ┌──────────▼────────────────┐
         │ Standard JSON Envelope     │
         └──────────┬────────────────┘
                    │
         ┌──────────▼────────────────┐
         │ console.log(JSON.stringify│
         │   (envelope))              │
         └──────────┬────────────────┘
                    │
         ┌──────────▼────────────────┐
         │ Display to user            │
         └───────────────────────────┘
```

---

## 🎯 Responsibilities by Component

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **User** | Natural language request | - |
| **tizen-sdk-install agent** | Parse request + call `installSdk()` | agents/ |
| **installSdk()** | Run script + call `formatSdkInstall()` | lib/core/sdk-commands.js |
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
  ├─ Node.js child_process (script execution)
  │
  └─ fs (file I/O)
```

---

## 🎁 Summary

| Question | Answer |
|----------|--------|
| **Who calls installSdk()?** | tizen-sdk-install agent |
| **Where is it called?** | In the agent's main logic |
| **How is it called?** | `const result = await installSdk('10.0');` |
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
  ↓ (call)
installSdk() ← lib/core/sdk-commands.js
  ├─ Run script (actual installation)
  ├─ Parse result
  └─ formatSdkInstall() ← lib/envelope/response-formatter.js
       ↓
       Return Standard JSON Envelope
       ↓
       Display JSON response to user ✅
```

**The agent now correctly calls `installSdk()` and receives a standardized JSON response!**
