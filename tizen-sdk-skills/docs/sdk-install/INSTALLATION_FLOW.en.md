# Install SDK via Natural Language and Get JSON Response

English | [한국어](INSTALLATION_FLOW.md)

## 📋 Full Scenario

A **complete flow** where the user requests SDK installation via natural language and ultimately receives a response in **Standard JSON Envelope format**.

---

## 🎯 From User Input to JSON Response

### Step 1️⃣: User Natural Language Input

```
User: "Can you install the Tizen SDK?"
```

Cline recognizes this request.

---

### Step 2️⃣: Agent Auto-Selection

Cline automatically selects and runs the `tizen-sdk-install` agent.

```markdown
---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, ...
---

Analyzing user request...
```

---

### Step 3️⃣: Agent Calls installSdk()

```javascript
// Inside tizen-sdk-install agent
const { installSdk } = require('../lib/core/sdk-commands');

const result = await installSdk('10.0', 'tizen');
console.log(JSON.stringify(result));  // JSON Envelope output
```

**Key point:**
- The agent calls the `installSdk()` function
- `installSdk()` **handles all operations**

---

### Step 4️⃣: installSdk() Function Executes

```javascript
// installSdk() in lib/core/sdk-commands.js

async function installSdk(version = '10.0', label = 'tizen', force = false) {
  
  // 4-1️⃣ Node.js check (very first step) ⭐ NEW
  const nodeCheck = await checkNode();
  if (nodeCheck.status !== 'success') {
    return nodeCheck;  // node_not_found error — aborts with install guide
  }

  // 4-2️⃣ Check if SDK is already installed
  const sdkPath = readSdkPath();
  const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);
  if (statusCheck.alreadyInstalled) {
    return formatSdkInstall(packages, warnings, startTime);  // success
  }

  // 4-3️⃣ Disk space check (15 GB, user's home drive)
  const diskCheck = await checkDiskSpace(os.homedir(), 15);
  if (diskCheck.status !== 'success') {
    return diskCheck;  // insufficient_disk_space error — aborts installation
  }

  // 4-4️⃣ Return installer command for Phase 2 (background install)
  return formatError(
    'tizen-sdk sdk-install',
    'execution_error',
    'SDK is NOT installed. Run the suggested_fix command with run_in_background: true...',
    installerCommand,
    startTime
  );
}
```

**Node.js check details:**
- Uses the interpreter running the runner (`process.version` / `process.execPath`) as proof that Node.js is installed; `where node` / `which node` only adds a PATH warning (issue #71: a sandboxed child PATH must not report node_not_found)
- Requires Node.js 22+ (v18–v21: warning only; below v18: fails with `node_version_unsupported`)
- If not installed or below v18: returns an error whose `suggested_fix.command` is an install command only when the source of the running Node.js is known (winget for the Windows installer, `brew upgrade node` for Homebrew's node, the version manager's own command), otherwise `null` with `guide_url` https://nodejs.org/en/download
- If installed: proceeds to SDK installation check

**Disk space check details:**
- Checks the drive containing the user's home directory only
- Threshold: 15 GB minimum free space
- If insufficient: returns error with current free space, required space, and deficit amount
- If sufficient: proceeds to return the installer command for Phase 2

**CDN Mirror Selection (automatic, timezone-based):**

During the actual SDK install (Phase 2), the installer script automatically selects the fastest CDN mirror based on the system's UTC timezone offset:

| UTC Offset Range | Mirror     | URL                                                            |
|------------------|------------|----------------------------------------------------------------|
| UTC-12 .. UTC-5  | Global     | `https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official`        |
| UTC-4  .. UTC-1  | Brazil     | `https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official`      |
| UTC+0  .. UTC+4  | Official   | `https://download.tizen.org/sdk/tizenstudio/official`           |
| UTC+5  .. UTC+8  | Singapore  | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official`   |
| UTC+9            | Official   | `https://download.tizen.org/sdk/tizenstudio/official`           |
| UTC+10 .. UTC+12 | Singapore  | `https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official`   |

UTC+9 (Korea / Japan) is routed to the official server because `download.tizen.org` is hosted in AWS Seoul (ap-northeast-2), the closest origin for those regions.

After a successful install, the selected mirror URL is written to `{SDK_PATH}/.package/repository.info`. The package updater (`tizen-update-package`) reads this file to download updates from the same mirror — no further timezone check is needed during updates.

**Custom repository URL (overrides mirror selection):**

When a repository URL is supplied (`installSdkFromRepo()` / `--repo-url` / `-RepoUrl`), timezone-based mirror selection is skipped and every package — starting with `pkg_list` — is downloaded from that URL. The URL is validated **before** step 3 of the pre-check: it must serve `pkg_list_{OS}-64` or `pkg_list_{OS}-32`, otherwise the install is refused and nothing is downloaded. The custom URL is what gets written to `repository.info`, so updates and emulator packages follow it too.

See [CUSTOM_REPOSITORY_INSTALL.en.md](CUSTOM_REPOSITORY_INSTALL.en.md) for the full flow.




---

### Step 5️⃣: formatSdkInstall() Called

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
  // ↑ Returns Standard JSON Envelope
}
```

---

### Step 6️⃣: Standard JSON Envelope Generated

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

### Step 7️⃣: Output to stdout

```javascript
console.log(JSON.stringify(envelope));
// ↑ JSON output to stdout
```

---

### Step 8️⃣: Display Result to User

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

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────┐
│ User: "Can you install the SDK?"            │
│ (Natural language input)                    │
└────────────────┬──────────────────────────┘
                  │
          ┌───────▼────────┐
          │ Cline           │
          │ Select agent    │
          └───────┬────────┘
                  │
          ┌───────▼──────────────────────┐
          │ tizen-sdk-install agent      │
          │ (Parse natural language)     │
          └───────┬──────────────────────┘
                  │
          ┌───────▼──────────────────────────────┐
          │ installSdk('10.0', 'tizen')           │  ⭐ Core!
          │ (lib/core/sdk-commands.js)            │
          │                                      │
          │ 1. readSdkPath() - check path        │
          │ 2. execSync() - run script           │ (3 min)
          │ 3. JSON.parse() - parse result       │
          │ 4. formatSdkInstall() - format JSON  │ ⭐ Called here!
          │ 5. return envelope                    │
          └───────┬──────────────────────────────┘
                  │
          ┌───────▼──────────────────────┐
          │ formatSdkInstall()            │
          │ return envelope.success()     │
          └───────┬──────────────────────┘
                  │
          ┌───────▼──────────────────────┐
          │ Standard JSON Envelope        │
          └───────┬──────────────────────┘
                  │
          ┌───────▼──────────────────────┐
          │ Output JSON to stdout         │
          └───────┬──────────────────────┘
                  │
          ┌───────▼──────────────────────┐
          │ Display result to user        │
          └──────────────────────────────┘
```

---

## 📊 Timeline

```
t=0s      User input
  │
  ├─ t=1s     Agent starts
  ├─ t=5s     installSdk() called
  │  │
  │  ├─ t=10s    Script execution starts
  │  ├─ t=70s    Download complete (1 min)
  │  ├─ t=185s   Installation complete (3 min 5 sec)
  │  ├─ t=186s   JSON parsing (< 1ms)
  │  └─ t=187s   formatSdkInstall() called (< 1ms)
  │
  ├─ t=188s   Standard JSON Envelope generated
  └─ t=189s   Display result to user
```

---

## 🎯 Key Points

### Why installSdk() Was Created

```
formatSdkInstall()
  ↑
  │ (called)
  │
installSdk()
  ↑
  │ (agent calls)
  │
tizen-sdk-install agent
  ↑
  │ (user request)
  │
User
```

**A connecting link was needed!**

- `formatSdkInstall()` alone can't do anything (formatting only)
- `installSdk()` **handles the actual work** and calls `formatSdkInstall()` in between
- The agent calls `installSdk()` to connect the full flow

---

## 📝 Code Summary

```javascript
// ===== Caller =====
// tizen-sdk-install agent
const { installSdk } = require('./lib/core/sdk-commands');
const result = await installSdk('10.0');
console.log(JSON.stringify(result));

// ===== installSdk() (lib/core/sdk-commands.js) =====
async function installSdk(version) {
  // 1. Validate
  // 2. Run script (actual installation)
  // 3. Parse result
  // 4. Call formatSdkInstall() ← here!
  return formatSdkInstall(packages, warnings);
}

// ===== formatSdkInstall() (lib/envelope/response-formatter.js) =====
function formatSdkInstall(packages, warnings) {
  const envelope = new Envelope('tizen-sdk sdk-install');
  return envelope.success({ packages, installation_status: 'completed' }, { warnings });
}

// ===== Envelope.success() (lib/envelope/envelope.js) =====
success(result, options) {
  return {
    command: this.command,
    status: 'success',
    duration_ms: Date.now() - this.startTime,
    result,
    warnings: options.warnings || [],
    errors: [],
  };
}
```

---

## 🎁 Answer Summary

| Step | Item | Description |
|------|------|-------------|
| 1 | User input | "Can you install the SDK?" (natural language) |
| 2 | Agent selection | tizen-sdk-install |
| 3 | **Call installSdk()** | ← Called here! |
| 4 | Script execution | Actual installation (3 min) |
| 5 | Parse result | JSON parsing |
| 6 | **Call formatSdkInstall()** | ← Called inside installSdk()! |
| 7 | Standard JSON Envelope | Auto-generated |
| 8 | Display to user | JSON format response |

---

## ✅ Conclusion

```
Where is formatSdkInstall() called?
  → Inside the installSdk() function in lib/core/sdk-commands.js

What data does it receive?
  → Script execution result (packages, warnings)

What does it return?
  → Standard JSON Envelope (status, result, duration_ms)

What does the user receive?
  → Standardized JSON response
```

**The complete flow from natural language input to JSON response is now established!** 🎉
