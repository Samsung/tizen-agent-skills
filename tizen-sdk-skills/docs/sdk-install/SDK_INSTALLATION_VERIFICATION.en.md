# SDK Installation Status Check and Verification Guide

English | [한국어](SDK_INSTALLATION_VERIFICATION.md)

## 📋 Overview

The `readSdkPath()` function has been extended to **check SDK installation status** and **prevent reinstallation when already installed**, implementing a safe installation procedure.

---

## 🎯 Core Requirements

### 1️⃣ Run Check Mode First

Before installation, check current status in **check mode**:

```
Windows:     tizen-sdk-install.ps1 -Check
Linux/macOS: tizen-sdk-install.sh --check
```

### 2️⃣ sdk.info Is the Completion Marker

- **Exists** → SDK fully installed (success)
- **Missing** → SDK not installed or incomplete installation

### 3️⃣ STOP If Already Installed

- Do not reinstall
- Abort without `force` flag
- Proceed with reinstall if `force=true`

### 4️⃣ Success Determination: exit code + sdk.info

```
exit code = 0 + sdk.info exists → success ✅
exit code ≠ 0 → failure ❌
Manual verification (cat, ls, grep) → do NOT do ❌
```

### 5️⃣ Remove Unnecessary Manual Verification

```
❌ cat sdk.info
❌ ls tools/
❌ grep sdb
❌ repeated reads
```

→ **Trust only script results**

---

## 🔧 Implemented Functions

### Function 1: `checkSdkInstallStatus()`

**Purpose**: Check local sdk.info file (fast check)

```javascript
const status = checkSdkInstallStatus('/opt/tizen-studio');

// Return value
{
  installed: true,                           // sdk.info exists
  sdkPath: '/opt/tizen-studio',
  sdkInfoPath: '/opt/tizen-studio/sdk.info',
  message: 'SDK is already installed (sdk.info found)'
}
```

**When to use**: When a quick pre-check is needed

---

### Function 2: `checkSdkInstallationViaScript()`

**Purpose**: Run the script's check mode

```javascript
const result = await checkSdkInstallationViaScript('/opt/tizen-studio');

// Return value
{
  status: 'done',                      // running, done, error
  exitCode: 0,
  message: 'SDK is already installed',
  alreadyInstalled: true              // important!
}
```

**When to use**: When accurate status check is needed (recommended)

**Execution method**:
- Windows: `powershell ... -Check ...`
- Linux/macOS: `bash ... --check ...`

---

### Function 3: `checkIfSdkAlreadyInstalled()` ⭐ Recommended

**Purpose**: Comprehensive 3-step check procedure

```javascript
const statusCheck = await checkIfSdkAlreadyInstalled(
  '/opt/tizen-studio',
  false  // force
);

// Return value
{
  alreadyInstalled: false,              // installed?
  shouldProceed: true,                  // can proceed with install?
  reason: 'SDK is not installed. Ready to proceed.'
}
```

**3-step procedure**:

```
Step 1: readSdkPath()
  └─ Read path from config file

Step 2: checkSdkInstallStatus()
  └─ Check local sdk.info file

Step 3: checkSdkInstallationViaScript()
  └─ Run script check mode
      (accurate status check)
```

---

## 📊 Integration: Used in installSdk()

```javascript
async function installSdk(version = '10.0', label = 'tizen', force = false) {
  try {
    const sdkPath = readSdkPath();

    if (!sdkPath) {
      return formatError(...);  // SDK path not set
    }

    // ✅ Step 1: Check SDK installation status (3 steps)
    console.error('[tizen-sdk] Checking if SDK is already installed...');
    const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);

    // ✅ Step 2: STOP if already installed
    if (statusCheck.alreadyInstalled) {
      return formatError(
        'tizen-sdk sdk-install',
        'sdk_path_invalid',
        statusCheck.reason,
        'tizen-cli tizen-sdk sdk-install --force'
      );
    }

    // ✅ Step 3: Abort if cannot proceed
    if (!statusCheck.shouldProceed) {
      return formatError('tizen-sdk sdk-install', 'build_failed', statusCheck.reason);
    }

    // ✅ Step 4: Run script (actual installation - 3 min)
    console.error(`[tizen-sdk] Installing SDK v${version}...`);
    const output = execSync(
      `powershell -ExecutionPolicy Bypass -File "tizen-sdk-install.ps1" ...`,
      { encoding: 'utf-8' }
    );

    // ✅ Step 5: Parse result
    const result = JSON.parse(output);
    const packages = result.packages || [];
    const warnings = result.warnings || [];

    // ✅ Step 6: Call formatSdkInstall()
    const envelope = formatSdkInstall(packages, warnings);

    console.error('[tizen-sdk] Installation completed successfully');
    return envelope;

  } catch (error) {
    return formatError('tizen-sdk sdk-install', 'io_error', `Failed: ${error.message}`);
  }
}
```

---

## 🎯 Call Flow

```
installSdk('10.0', 'tizen', false)
  │
  ├─ 1. readSdkPath()
  │      └─ Read ~/.tizen.sdk.path.config
  │
  ├─ 2. checkIfSdkAlreadyInstalled()
  │      │
  │      ├─ 2-1. checkSdkInstallStatus()
  │      │        └─ sdk.info file exists? (fast)
  │      │
  │      └─ 2-2. checkSdkInstallationViaScript()
  │               └─ Run script check mode (accurate)
  │
  ├─ 3. Already installed? → STOP (unless force)
  │
  ├─ 4. Can proceed? → YES → continue
  │
  ├─ 5. Run script (3 min)
  │      └─ tizen-sdk-install.ps1 / .sh
  │
  ├─ 6. Parse result
  │      └─ JSON parsing
  │
  ├─ 7. formatSdkInstall()
  │      └─ Generate Standard JSON Envelope
  │
  └─ 8. return envelope
```

---

## ✅ Safety Guarantee Mechanisms

### 1. Detect Already Installed

```javascript
if (statusCheck.alreadyInstalled) {
  // STOP
  return formatError(...);
}
```

### 2. Accurate Check via Check Mode

```javascript
const scriptCheckResult = await checkSdkInstallationViaScript(sdkPath);
// Script reports accurate status
```

### 3. Trust sdk.info

```
- sdk.info exists → installation complete
- sdk.info missing → not installed or incomplete
```

### 4. Control Reinstall via Force Flag

```javascript
if (statusCheck.alreadyInstalled && !force) {
  // abort
}

if (statusCheck.alreadyInstalled && force) {
  // proceed with reinstall
}
```

### 5. Safe Even on Interrupted Installation

```
Installation interrupted → on re-run:
  ├─ Check mode: "Installing..."
  ├─ sdk.info missing: "Incomplete installation"
  └─ Re-run: continue (skip packages with manifest)
```

---

## 📝 Function Signatures

```javascript
// Local status check
function checkSdkInstallStatus(sdkPath: string): {
  installed: boolean
  sdkPath: string
  sdkInfoPath: string
  message: string
}

// Script check mode
async function checkSdkInstallationViaScript(sdkPath: string): {
  status: 'running' | 'done' | 'error'
  exitCode: number
  message: string
  alreadyInstalled: boolean
}

// Comprehensive check (recommended)
async function checkIfSdkAlreadyInstalled(
  sdkPath: string,
  force: boolean = false
): {
  alreadyInstalled: boolean
  shouldProceed: boolean
  reason: string
}

// SDK install main
async function installSdk(
  version: string = '10.0',
  label: string = 'tizen',
  force: boolean = false
): Promise<Envelope>
```

---

## 🎁 Additional Features

### Force Reinstall

```javascript
const result = await installSdk('10.0', 'tizen', true);  // force=true

// Reinstalls even if already installed
```

### Error Handling

```javascript
const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath);

if (statusCheck.alreadyInstalled && !force) {
  return {
    status: 'error',
    message: 'SDK already installed. Use -Force to reinstall.'
  };
}
```

---

## 📚 Related Files

- `lib/core/sdk-commands.js` - Implementation
- `lib/sdk-check.test.js` - Tests and documentation
- `SDK_INSTALLATION_VERIFICATION.en.md` - This document

---

## ✨ Key Summary

```
readSdkPath() extension:

1️⃣ checkSdkInstallStatus()
   → Check sdk.info file (fast)

2️⃣ checkSdkInstallationViaScript()
   → Script check mode (-Check / --check)

3️⃣ checkIfSdkAlreadyInstalled()
   → 3-step comprehensive check (recommended)

This provides:
✅ Instant detection of already-installed SDK
✅ Prevents unnecessary reinstallation
✅ Trusts sdk.info completion marker
✅ Accurate verification via check mode
✅ Eliminates manual verification
✅ Maximizes installation safety
```

---

## 🎉 Conclusion

**readSdkPath() function extension** provides:

- ✅ Automatic SDK installation status check
- ✅ STOP if already installed (unless force)
- ✅ Accurate verification via check mode
- ✅ Trusts sdk.info completion marker
- ✅ Dramatically improved installation safety

**Safe and idempotent SDK installation is now complete!** 🎉
