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
- Requires Node.js 18+ (warns if older, but does not abort)
- If not installed: returns `node_not_found` error with:
  - Clear message: "Node.js is not installed or not on PATH. Tizen SDK CLI runners require Node.js 18+."
  - OS-specific install guide (Windows: `winget install OpenJS.NodeJS.LTS`, macOS: `brew install node`, Linux: `sudo apt install -y nodejs npm`)
  - Download URL: https://nodejs.org/
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

```json
{
  "status": "success",
  "result": {
    "packages": [
      {
        "name": "Tizen Studio Tools",
        "version": "6.5",
        "size_mb": 200,
        "status": "installed"
      },
      {
        "name": "Tizen SDK 10.0",
        "version": "10.0",
        "size_mb": 400,
        "status": "installed"
      },
      {
        "name": "Tizen SDK 8.0",
        "version": "8.0",
        "size_mb": 350,
        "status": "installed"
      }
    ],
    "installation_status": "completed"
  },
  "warnings": [
    "Emulator requires 4GB RAM minimum",
    "Some optional tools are missing"
  ],
  "errors": [],
  "command": "tizen-sdk sdk-install",
  "duration_ms": 185000
}
```

---

### Step 7: Output to stdout

```javascript
console.log(JSON.stringify(envelope));
// ↑ JSON output to stdout
```

---

### Step 8: Display Result to User

Cline parses the JSON and displays it to the user.

```
✅ SDK Installation Complete!

Installed packages (3):
  • Tizen Studio Tools (6.5)
  • Tizen SDK 10.0 (400MB)
  • Tizen SDK 8.0 (350MB)

Duration: 3 min 5 sec

⚠️ Warnings:
  • Emulator requires 4GB RAM minimum
  • Some optional tools are missing
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
