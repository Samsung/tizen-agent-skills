# formatSdkInit Call Flow and Scenarios

## Overview

The `formatSdkInit` function generates a response in **Standard JSON Envelope format** after executing the SDK initialization command.

---

## Call Flow

### Full Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ User makes a request in Cline                                    │
│ (e.g., "Initialize the Tizen SDK" or direct command execution)   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
         ┌────────────────────────────┐
         │ Cline main loop             │
         │ (or Skill interface)         │
         └────────────┬───────────────┘
                      │
                      ▼
     ┌──────────────────────────────────────────┐
     │ tizen-sdk-skills plugin routing           │
     │ (tizen-sdk namespace from plugin.json)    │
     └────────────┬─────────────────────────────┘
                  │
                  ▼
     ┌─────────────────────────────────────────┐
     │ Check if request is "sdk init"           │
     │ args: ["sdk-init", "--sdk-path", ".."]│
     └────────────┬────────────────────────────┘
                  │
                  ▼
     ┌─────────────────────────────────────────────┐
     │ lib/core/sdk-commands.js                     │
     │ initSdk(sdkPath) function call               │
     └────────────┬────────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
     [Path validation]  [Config file creation]
         │                 │
         └────────┬────────┘
                  │
                  ▼
     ┌─────────────────────────────────────────────┐
     │ lib/envelope/response-formatter.js          │
     │ formatSdkInit(sdkPath, configFile) call     │
     └────────────┬────────────────────────────────┘
                  │
                  ▼
     ┌─────────────────────────────────────────────┐
     │ lib/envelope/envelope.js                    │
     │ new Envelope('tizen-sdk sdk-init')          │
     │   .success({ sdk_path, config_file })       │
     └────────────┬────────────────────────────────┘
                  │
                  ▼
     ┌─────────────────────────────────────────────┐
     │ Return Standard JSON Envelope               │
     │ {                                           │
     │   "command": "tizen-sdk sdk-init",         │
     │   "status": "success",                      │
     │   "duration_ms": 150,                       │
     │   "result": {                               │
     │     "sdk_path": "/opt/tizen-studio",       │
     │     "config_file": "~/.tizen.sdk.path.config"  │
     │   },                                        │
     │   "warnings": [],                           │
     │   "errors": []                              │
     │ }                                           │
     └────────────┬────────────────────────────────┘
                  │
                  ▼
     ┌─────────────────────────────────────────────┐
     │ Output to stdout (JSON only)                │
     │ console.log(JSON.stringify(result))         │
     └─────────────────────────────────────────────┘
                  │
                  ▼
     ┌─────────────────────────────────────────────┐
     │ Cline parses and processes JSON             │
     │ (agent/skill complete)                      │
     └─────────────────────────────────────────────┘
```

---

## When — Invocation Timing

### Scenario 1: Direct User Request

```
User: "Install the Tizen SDK at /opt/tizen-studio"
  ↓
tizen-sdk-install agent runs
  ↓
(SDK installation complete)
  ↓
Automatically calls initSdk()
  ↓
formatSdkInit() executes
  ↓
Returns JSON response
```

### Scenario 2: Auto-Initialization Flow

```
tizen-create-project agent starts
  ↓
Detects SDK path not set
  ↓
Auto-initializes via initSdk()
  ↓
formatSdkInit() executes
  ↓
Continues project creation
```

### Scenario 3: Direct CLI Command Execution

```
$ tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio
  ↓
Core loads tizen-sdk plugin
  ↓
plugin.run(["sdk-init", "--sdk-path", "/opt/tizen-studio"])
  ↓
sdk-commands.initSdk("/opt/tizen-studio")
  ↓
formatSdkInit() executes
  ↓
Returns JSON response
```

---

## Why — Invocation Reasons

| Reason | Situation | Next Action |
|--------|-----------|-------------|
| **SDK initialization** | First development environment setup | Project creation available |
| **Path change** | SDK reinstalled or moved | Update previous path |
| **Auto-validation** | Before executing other commands | Verify SDK path |
| **CI/CD pipeline** | Automated environment setup | Proceed to build/deploy |

---

## How — Invocation Methods

### Method 1: Direct Node.js Call (Test/Script)

```javascript
const { initSdk } = require('./lib/core/sdk-commands');

(async () => {
  const result = await initSdk('/opt/tizen-studio');
  console.log(JSON.stringify(result, null, 2));
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
  "duration_ms": 150
}
```

### Method 2: Called from Agent

```markdown
---
name: my-custom-agent
description: Custom SDK initialization
---

const { initSdk } = require('../lib/core/sdk-commands');

Analyzes the SDK path requested by the user.

const sdkPath = '/opt/tizen-studio';
const result = await initSdk(sdkPath);
console.log(JSON.stringify(result));
```

### Method 3: Called from tizen-cli Plugin

```javascript
// tizen-sdk-plugin/index.js
const { initSdk } = require('./lib/core/sdk-commands');

async function run(args) {
  if (args[0] === 'sdk' && args[1] === 'init') {
    const sdkPath = args[3]; // value after --sdk-path
    const result = await initSdk(sdkPath);
    console.log(JSON.stringify(result));
    process.exit(result.status === 'success' ? 0 : 1);
  }
}

module.exports = { run };
```

---

## Function-Level Call Relationships

### formatSdkInit

```javascript
formatSdkInit(sdkPath, configFile)
  │
  ├─ new Envelope('tizen-sdk sdk-init')
  │   │
  │   └─ envelope.success({
  │       sdk_path: sdkPath,
  │       config_file: configFile
  │     })
  │       │
  │       └─ {
  │           command,
  │           status: 'success',
  │           duration_ms,
  │           result,
  │           warnings: [],
  │           errors: []
  │         }
  │
  └─ return Envelope object
```

### Call Chain

```
initSdk(sdkPath)
  │
  ├─ fs.existsSync(sdkPath) // path validation
  │
  ├─ fs.accessSync(sdkPath) // permission validation
  │
  ├─ fs.mkdirSync(configDir) // create config directory
  │
  ├─ fs.writeFileSync(CONFIG_FILE, sdkPath) // write config file
  │
  └─ formatSdkInit(sdkPath, CONFIG_FILE)
      │
      └─ return Envelope object
```

---

## Error Cases

### Case 1: SDK Path Not Set

```
initSdk(null)
  │
  └─ formatError(
       'tizen-sdk sdk-init',
       'sdk_path_invalid',
       'SDK path must be a non-empty string'
     )
       │
       └─ {
            "command": "tizen-sdk sdk-init",
            "status": "failure",
            "errors": [{
              "error_code": "TIZEN_SDK_UNKNOWN_E001",
              "error_category": "sdk_path_invalid",
              "message": "SDK path must be a non-empty string"
            }]
          }
```

### Case 2: Path Does Not Exist

```
initSdk('/nonexistent/path')
  │
  └─ formatError(
       'tizen-sdk sdk-init',
       'sdk_path_invalid',
       'SDK path does not exist: /nonexistent/path'
     )
```

### Case 3: No Permission

```
initSdk('/root/sdk')  // inaccessible
  │
  └─ formatError(
       'tizen-sdk sdk-init',
       'sdk_path_not_accessible',
       'No read/write permission for SDK path'
     )
```

---

## Timing Diagram

```
t=0ms   initSdk() call starts
  │
  ├─ t=10ms   path validation complete
  │
  ├─ t=20ms   config directory created
  │
  ├─ t=30ms   config file written
  │
  ├─ t=40ms   formatSdkInit() called
  │
  ├─ t=50ms   Envelope object created
  │
  ├─ t=60ms   JSON serialization
  │
  └─ t=150ms  output to stdout (duration_ms: 150)
```

---

## Control Flow Summary

```
┌────────────────────────────────────────────┐
│ Who:     formatSdkInit, sdk-commands       │
│ When:    SDK initialization needed          │
│ Why:     Create config file                │
│ How:     Wrap in Envelope                  │
│ Where:   lib/envelope/response-formatter.js│
│ Result:  Standard JSON Envelope             │
└────────────────────────────────────────────┘
```

---

## Reference: Related Function Call Map

```
User Request
    │
    ├─ sdk init ──→ initSdk() ──→ formatSdkInit()
    │
    ├─ sdk status ──→ getSdkStatus() ──→ formatSdkStatus()
    │
    ├─ project create ──→ (readSdkPath internal check) ──→ formatProjectCreate()
    │
    └─ device list ──→ (readSdkPath internal check) ──→ formatDeviceList()
```

Each command checks the current SDK path via `readSdkPath()` as needed.
