# formatSdkInit Complete Guide — Who, When, Why, How

This document explains the **complete call scenario** of the `formatSdkInit(sdkPath, configFile)` function.

---

## At a Glance

| Item | Description |
|------|-------------|
| **Who** | `initSdk()` function in `sdk-commands.js` |
| **When** | When user requests SDK initialization (or auto-init flow) |
| **Why** | Set Tizen SDK path and persist it for future commands |
| **How** | Path validation → config file write → `formatSdkInit()` call → return Envelope |
| **Result** | Standard JSON Envelope (with success/failure status) |

---

## Detailed Explanation

### 1. Who — The Caller

```
initSdk() function (defined in lib/core/sdk-commands.js)
    │
    └─ Internally calls formatSdkInit()
```

**Code**:
```javascript
// lib/core/sdk-commands.js
async function initSdk(sdkPath) {
  // ... path validation ...
  
  // ← formatSdkInit() called here
  return formatSdkInit(sdkPath, CONFIG_FILE);
}
```

**Invocation**:
```javascript
// When someone calls initSdk()
const result = await initSdk('/opt/tizen-studio');
// ↓ formatSdkInit() is called internally
```

---

### 2. When — Invocation Timing

#### Scenario A: User Request

```
User: "Find the Tizen SDK at /opt/tizen-studio"
  │
  ├─ Method 1: Agent auto-execution
  │   tizen-sdk-install agent → initSdk() → formatSdkInit()
  │
  ├─ Method 2: CLI command
  │   $ tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio
  │   → plugin.run(["sdk-init", ...]) → initSdk() → formatSdkInit()
  │
  └─ Method 3: Direct script execution
      node script.js /opt/tizen-studio
      → initSdk() → formatSdkInit()
```

#### Scenario B: Auto-Initialization

```
Project creation request
  │
  ├─ Check current SDK path
  ├─ Detect SDK not set
  ├─ Auto-call initSdk()
  └─ formatSdkInit() executes
```

#### Timing

```
t=0ms   User request or auto flow starts
  │
  ├─ t=10ms  initSdk() called
  ├─ t=50ms  path validation complete
  ├─ t=100ms file write complete
  ├─ t=110ms formatSdkInit() called
  └─ t=150ms JSON response sent to stdout
```

---

### 3. Why — Invocation Reason

#### Purpose: SDK Path Management

```
┌─────────────────────────────────────┐
│ Role of formatSdkInit()              │
├─────────────────────────────────────┤
│ 1. Confirm path validation complete │
│ 2. Record config file save path     │
│ 3. Provide reference point for future commands │
│ 4. Provide self-recovery guide on error │
└─────────────────────────────────────┘
```

#### Why It's Needed

| Situation | Reason |
|-----------|--------|
| **First dev environment setup** | Store where SDK was installed |
| **Multi-project work** | Ensure all projects use same SDK |
| **Automation pipeline** | Auto-detect SDK path in CI/CD |
| **Environment reconfiguration** | Change path on SDK move/upgrade |

---

### 4. How — Invocation Method

#### Flow Diagram

```
┌─────────────────────┐
│ User/System request │
└──────────┬──────────┘
           │
           ▼
     ┌──────────────────────────────────┐
     │ initSdk(sdkPath)                  │
     │ (lib/core/sdk-commands.js)        │
     └──────────┬───────────────────────┘
                │
         ┌──────┴──────┐
         │             │
         ▼             ▼
     [Path        [Permission
      validation]  validation]
         │             │
         └──────┬──────┘
                │
                ▼
         ┌────────────────────┐
         │ Create config file │
         │ ~/.tizen.path...   │
         └──────┬─────────────┘
                │
                ▼
     ┌──────────────────────────────────┐
     │ formatSdkInit(sdkPath, configFile)│
     │ (lib/envelope/response-formatter.js) │
     └──────────┬───────────────────────┘
                │
                ▼
     ┌──────────────────────────────────┐
     │ new Envelope('tizen-sdk sdk-init')│
     │   .success({...})                 │
     └──────────┬───────────────────────┘
                │
                ▼
     ┌──────────────────────────────────┐
     │ Generate JSON Envelope            │
     │ { command, status, duration_ms,  │
     │   result, errors }                │
     └──────────┬───────────────────────┘
                │
                ▼
     ┌──────────────────────────────────┐
     │ Output JSON to stdout             │
     └──────────────────────────────────┘
```

#### Code-Level Call

```javascript
// Step 1: Call initSdk()
const result = await initSdk('/opt/tizen-studio');

// Step 2: Internal flow in initSdk()
//   2-1. Path validation
//   2-2. Config file creation
//   2-3. formatSdkInit() called ← here!
//        return formatSdkInit(sdkPath, CONFIG_FILE);

// Step 3: formatSdkInit() execution
//   3-1. Create Envelope
//   3-2. Call success()
//   3-3. Return { command, status, duration_ms, result, ... }

// Step 4: Return result
console.log(JSON.stringify(result));  // stdout output
```

---

### 5. Function-Level Role Division

```
┌─────────────────────────────────────────┐
│ initSdk(sdkPath)                        │
│ ├─ Path validation (fs.existsSync)      │
│ ├─ Permission validation (fs.accessSync)│
│ ├─ Create config directory              │
│ ├─ Write config file                    │
│ └─ Call formatSdkInit() ← here!        │
│    (passes validated data)              │
└──────────────┬──────────────────────────┘
               │ (success or error)
               ▼
┌─────────────────────────────────────────┐
│ formatSdkInit(sdkPath, configFile)      │
│ ├─ Create Envelope instance             │
│ └─ success({ sdk_path, config_file })   │
│    (generate JSON format)               │
└──────────────┬──────────────────────────┘
               │ (Envelope object)
               ▼
┌─────────────────────────────────────────┐
│ Envelope.success(data)                  │
│ ├─ { command, status, duration_ms }     │
│ ├─ { result: data }                      │
│ └─ { warnings: [], errors: [] }         │
│    (final JSON object)                   │
└──────────────┬──────────────────────────┘
               │ (completed Envelope)
               ▼
       Output to stdout (JSON string)
```

---

## Real Usage Examples

### Example 1: Simple Call

```javascript
const { initSdk } = require('./lib/core/sdk-commands');

(async () => {
  const result = await initSdk('/opt/tizen-studio');
  console.log(JSON.stringify(result));
})();
```

**Output**:
```json
{
  "status": "success",
  "result": {
    "sdk_path": "/opt/tizen-studio",
    "config_file": "/home/user/.tizen.sdk.path.config"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-init",
  "duration_ms": 120
}
```

### Example 2: Called from Agent

```markdown
---
name: my-setup-agent
description: Setup Tizen environment
---

const { initSdk } = require('../lib/core/sdk-commands');

Initialize with the user-provided SDK path.

const sdkPath = '/opt/tizen-studio';
const result = await initSdk(sdkPath);

// formatSdkInit() is called, generating Envelope
console.log(JSON.stringify(result));
```

### Example 3: Auto-Initialization Flow

```javascript
const { initSdk, readSdkPath } = require('./lib/core/sdk-commands');

async function ensureSdkInitialized() {
  const sdkPath = readSdkPath();
  
  if (!sdkPath) {
    // SDK not set → auto-initialize
    const result = await initSdk('/opt/tizen-studio');
    // ↓ formatSdkInit() called internally
    
    if (result.status !== 'success') {
      throw new Error(result.errors[0].message);
    }
  }
}
```

---

## Response Structure

### Success Response

```json
{
  "status": "success",
  "result": {
    "sdk_path": "/opt/tizen-studio",
    "config_file": "/home/user/.tizen.sdk.path.config"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-init",
  "duration_ms": 150
}
```

**Fields**:
- `command`: "tizen-sdk sdk-init" (fixed)
- `status`: "success" (set by formatSdkInit)
- `duration_ms`: execution time (auto-calculated by Envelope)
- `result.sdk_path`: stored SDK path
- `result.config_file`: config file path

### Failure Response

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_CONFIG_E002",
      "error_category": "sdk_path_invalid",
      "message": "SDK path does not exist: /nonexistent/path",
      "suggested_fix": {
        "command": "Verify that Tizen SDK is installed at /nonexistent/path",
        "auto_fixable": false,
        "guide_url": null
      }
    }
  ],
  "command": "tizen-sdk sdk-init",
  "duration_ms": 50
}
```

---

## Call Chain Summary

```
Top-level call:
  initSdk('/opt/tizen-studio')
    │
    ├─ fs.existsSync(path)              // check path
    ├─ fs.accessSync(path)              // check permissions
    ├─ fs.mkdirSync(configDir)          // create directory
    ├─ fs.writeFileSync(configFile)     // write file
    │
    └─ formatSdkInit(sdkPath, configFile)  // ← called here!
         │
         └─ new Envelope('tizen-sdk sdk-init')
              │
              └─ .success({ sdk_path, config_file })
                   │
                   └─ { command, status, duration_ms, result, warnings, errors }
                        │
                        └─ return (Envelope object)
```

---

## Key Points

| Category | Content |
|----------|---------|
| **Definition** | Generate Standard JSON Envelope after path setup |
| **Caller** | `initSdk()` function (internal call) |
| **Timing** | On SDK initialization request |
| **Input** | sdkPath, configFile |
| **Output** | Standard JSON Envelope (success/failure) |
| **Role** | Response formatting (JSON structuring) |
| **Location** | `lib/envelope/response-formatter.js` |
| **Dependency** | `Envelope` class (`lib/envelope/envelope.js`) |

---

## Next Steps

The following functions are called with the same pattern:

- `formatSdkStatus()` ← called within `getSdkStatus()`
- `formatProjectCreate()` ← called from project create command
- `formatProjectBuild()` ← called from project build command
- `formatDeviceList()` ← called from device list command
- ... and more

All follow the same principle:
1. Perform operation
2. Collect results
3. Call `formatXxx()`
4. Return Envelope
5. Output JSON to stdout

---

## Related Documents

- [Envelope Usage Guide](ENVELOPE_USAGE_GUIDE.en.md)
- [Call Flow Diagram](ENVELOPE_CALL_FLOW.en.md)
- [Library README](../../common/lib/README.md)
