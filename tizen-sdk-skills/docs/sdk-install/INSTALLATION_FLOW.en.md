# Install SDK via Natural Language and Get JSON Response

English | [한국어](INSTALLATION_FLOW.md)

## 📋 Full Scenario

A **complete flow** where the user requests SDK installation via natural language and ultimately receives a response in **Standard JSON Envelope format**.

---

## 🎯 From User Input to JSON Response

### Step 1️⃣: User Natural Language Input

```
User: "Can you install Tizen SDK 10.0?"
```

The request names 10.0, so the agent passes it to the runner (`node sdk-install-cli.js 10.0`). Without a version the runner gets `""`: the installer installs the newest platform the repository offers, and `Tizen SDK Tools` is labelled with that version instead.

Claude Code, Codex and Gemini CLI hand this request to the `tizen-sdk-install` agent. Cline has no agents, so its main agent runs the `tizen-sdk-install` skill itself; the steps below are the same either way.

---

### Step 2️⃣: Agent Auto-Selection

Claude Code / Codex / Gemini CLI select and run the `tizen-sdk-install` agent (on Cline, the main agent loads the skill of the same name).

```markdown
---
name: tizen-sdk-install
description: Install Tizen SDK, tizen sdk install, ...
---

Analyzing user request...
```

---

### Step 3️⃣: The Agent Runs the Runner, Which Calls installSdk()

```javascript
// Inside sdk-install-cli.js, which the agent runs as `node sdk-install-cli.js 10.0`
const { installSdk } = require('../core/sdk-commands');

const result = await installSdk('10.0', 'tizen');  // '10.0' = first positional argument
// cli-runner.js prints result as JSON (Step 7)
```

**Key point:**
- The agent runs the `sdk-install-cli.js` runner, which calls `installSdk()`
- `installSdk()` runs the **pre-checks** and builds the result envelope. The install itself is a separate background command (Phase 2), and the agent calls `installSdk()` again once it finishes (Phase 3)

---

### Step 4️⃣: installSdk() Function Executes

```javascript
// installSdk() in lib/core/sdk-commands.js

async function installSdk(version = '', label = 'tizen', force = false, repoUrl = '', command = 'tizen-sdk sdk-install') {  // '' = newest platform

  // 4-0️⃣ Version syntax first (X.Y, else invalid_argument); a custom repository hands off
  const versionCheck = validateTizenVersion(version);
  if (versionCheck.error) return formatError(command, 'invalid_argument', versionCheck.error);
  if (repoUrl) return installSdkFromRepo(repoUrl, version, force);

  // 4-1️⃣ Node.js check
  const nodeCheck = await checkNode();
  if (nodeCheck.status !== 'success') {
    return nodeCheck;  // node_not_found error — aborts with install guide
  }

  // 4-2️⃣ Check if SDK is already installed
  const sdkPath = readSdkPath();
  const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);
  if (statusCheck.alreadyInstalled) {
    const missing = requestedPlatformMissing(sdkPath, version, command, startTime);
    if (missing) return missing;  // requested version not installed: platform_version_not_found
    const packages = installedPackageSummary(sdkPath, version);
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
    'SDK is NOT installed. This pre-check CLI cannot install it (10-15 min job). ' +
      harnessGuidance('detach') + '…',   // 'Run the suggested_fix command per your harness: …'
    installerCommand,   // suggested_fix: { command, background_command }
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

### Step 7️⃣: Output to stdout

```javascript
// cli-runner.js (shared by the CLI runners, incl. sdk-install-cli.js)
process.stdout.write(JSON.stringify(withUserCommand(envelope), null, 2) + "\n");
// ↑ JSON to stdout, with user_command inserted right after command
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
Platforms — installed: 10.0 · not_installed: 9.0
```

---

## 🔄 Complete Flow Diagram

```
User: "Can you install Tizen SDK 10.0?"
  │
  ▼
tizen-sdk-install agent (Claude Code / Codex / Gemini CLI) or skill (Cline, in the main agent)
  │
  ├─ Phase 1 — pre-check
  │    node sdk-install-cli.js 10.0  →  installSdk('10.0', 'tizen')
  │      version syntax → Node.js check → already installed? (no) → disk space (15 GB)
  │    ← failure envelope (execution_error) with the installer in suggested_fix.command
  │
  ├─ Phase 2 — install, in the background (10–15 min, ~121 packages)
  │    the harness runs suggested_fix — tizen-sdk-install.sh --path "<sdk>" --platform "10.0" --download-jobs 4
  │    (PowerShell: tizen-sdk-install.ps1 -Path "<sdk>" -Platform "10.0" -DownloadJobs 4):
  │      Claude Code: command with run_in_background, resumes on the task notification
  │      Cline and other hosts without a completion notice: command with --detach / -Detach, polls --status / -Status
  │      Codex: background_command (a job-cli.js job), polls job-cli.js wait
  │    the installer writes sdk.info and ~/.tizen.sdk.path.config
  │
  └─ Phase 3 — the same pre-check again
       node sdk-install-cli.js 10.0  →  installSdk('10.0', 'tizen')
         already installed → installedPackageSummary() → formatSdkInstall()
       ← success envelope (Step 6)
  │
  ▼
Reply to the user: envelope JSON, then a 1–2 line summary (Step 8)
```

---

## 📊 Timeline

```
t=0s          User input, agent starts
t≈1s          Phase 1: installSdk() pre-check
t≈2s            ← execution_error envelope with the installer command
t≈2s          Phase 2: installer runs in the background
t≈10–15 min     ← installer exits 0 (sdk.info written)
              Phase 3: installSdk() pre-check again
  + ≈2s         ← success envelope (installation_status: completed)
              Reply to the user
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
  │ (the sdk-install-cli.js runner calls; the agent runs the runner)
  │
tizen-sdk-install agent
  ↑
  │ (user request)
  │
User
```

**A connecting link was needed!**

- `formatSdkInstall()` alone can't do anything (formatting only)
- `installSdk()` **runs the pre-checks**: it returns the installer command when the SDK is missing, or builds `result.packages` with `installedPackageSummary()` and calls `formatSdkInstall()` when it is installed
- The agent runs the `sdk-install-cli.js` runner, which calls `installSdk()`, to connect the full flow

---

## 📝 Code Summary

```javascript
// ===== Caller =====
// sdk-install-cli.js (run by the agent as `node sdk-install-cli.js 10.0`)
const { installSdk } = require('../core/sdk-commands');
const result = await installSdk('10.0');
// cli-runner.js prints withUserCommand(result) as JSON

// ===== installSdk() (lib/core/sdk-commands.js) =====
async function installSdk(version) {
  // 1. Node.js check
  // 2. SDK already installed? → per-version packages, then formatSdkInstall() ← here!
  if (alreadyInstalled) {
    return formatSdkInstall(installedPackageSummary(sdkPath, version), warnings);
  }
  // 3. Disk space check
  // 4. Not installed: return the installer command (Phase 2 runs it in the background)
  return formatError('tizen-sdk sdk-install', 'execution_error', 'SDK is NOT installed…', installerCommand);
}

// ===== formatSdkInstall() (lib/envelope/response-formatter.js) =====
function formatSdkInstall(packages, warnings) {
  const envelope = new Envelope('tizen-sdk sdk-install');
  return envelope.success({ packages, installation_status: 'completed' }, { warnings });
}

// ===== Envelope.success() (lib/envelope/envelope.js) =====
success(result, options) {
  return {
    status: 'success',
    result,
    warnings: options.warnings || [],
    errors: [],
    command: this.command,
    duration_ms: Date.now() - this.startTime,
  };
}
```

---

## 🎁 Answer Summary

| Step | Item | Description |
|------|------|-------------|
| 1 | User input | "Can you install Tizen SDK 10.0?" (natural language) |
| 2 | Agent selection | tizen-sdk-install |
| 3 | **Call installSdk()** (Phase 1) | Pre-check; returns the installer command |
| 4 | Install (Phase 2) | Installer in the background (10–15 min) |
| 5 | Call installSdk() again (Phase 3) | Takes the already-installed branch |
| 6 | **Call formatSdkInstall()** | ← Called inside installSdk(), with `installedPackageSummary()` |
| 7 | Standard JSON Envelope | Auto-generated |
| 8 | Display to user | Envelope JSON + 1–2 line summary |

---

## ✅ Conclusion

```
Where is formatSdkInstall() called?
  → Inside the installSdk() function in lib/core/sdk-commands.js

What data does it receive?
  → result.packages from installedPackageSummary() and the warnings of the
    already-installed branch (Phase 3, after the background install)

What does it return?
  → Standard JSON Envelope (status, result, duration_ms)

What does the user receive?
  → Standardized JSON response
```

**The complete flow from natural language input to JSON response is now established!** 🎉
