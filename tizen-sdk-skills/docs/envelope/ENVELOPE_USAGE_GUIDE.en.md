# Standard JSON Envelope Usage Guide

English | [한국어](ENVELOPE_USAGE_GUIDE.md)

## Overview

The Standard JSON Envelope standardizes all `tizen-sdk` command responses into a **deterministic, structured JSON format**, enabling AI agents and automation tools to reliably parse responses.

**Related PRD Requirements**:
- REQ-SDK-OUT-001: All commands output Standard JSON Envelope
- REQ-SDK-OUT-002: On failure, include error_code, error_category, message, suggested_fix
- REQ-SDK-OUT-003: Large logs returned as path references
- REQ-SDK-OUT-004: Block ANSI escape/log from text-based tools

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
  "user_command": "tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio",
  "duration_ms": 150
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Internal core label (e.g. `tizen-sdk sdk-init`) |
| `user_command` | string | The command the user actually issued — for reproducing/retrying |
| `status` | string | `success` |
| `duration_ms` | number | Execution time (ms) |
| `result` | object | Command-specific result data |
| `warnings` | array | Warning messages (optional) |
| `errors` | array | Always empty |

### Failure Response

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_DEVICE_E001",
      "error_category": "device_not_found",
      "message": "No connected device or emulator found.",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch",
        "auto_fixable": false,
        "guide_url": "https://docs.tizen.org/application/native/tutorials/getting-started/"
      }
    }
  ],
  "command": "tizen-sdk install-app",
  "user_command": "tizen-cli tizen-sdk run-project --project /home/user/MyApp",
  "duration_ms": 50
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Internal core label (e.g. `tizen-sdk install-app`) |
| `user_command` | string | The command the user actually issued — for reproducing/retrying |
| `status` | string | `failure` |
| `duration_ms` | number | Execution time |
| `errors` | array | Error object array |
| `.error_code` | string | Unique error code (e.g., `TIZEN_SDK_DEVICE_E001`) |
| `.error_category` | string | Error classification (e.g., `device_not_found`) |
| `.message` | string | Human-readable message |
| `.suggested_fix` | object | Recovery suggestion (optional) |
| `.suggested_fix.command` | string | Recommended command |
| `.suggested_fix.auto_fixable` | boolean | Whether auto-fix is possible |
| `.suggested_fix.guide_url` | string | Help doc URL |

### `command` vs `user_command`

The two fields differ **on purpose**.

- `command` — the internal label the core attaches (`tizen-sdk create-emulator`). It is the same value for the same operation regardless of entry point, which is what makes it useful for log aggregation.
- `user_command` — what the user actually typed, so the envelope alone is enough to reproduce or retry.

The form depends on the entry point:

| Entry point | `user_command` example |
|---|---|
| tizen-cli plugin | `tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch` |
| Standalone runner (skills call `node "$CLI" …`) | `node emulator-manager-cli.js launch --vm-name my-vm` |

For standalone runners only the file name is rendered: `$CLI` is a machine- and version-specific absolute path (`~/.claude/plugins/cache/…/1.0.0/lib/cli/…`).

**Secrets are redacted.** The envelope ends up in logs, terminals, and model context, so the value of a `--password`-style flag is replaced with `***`:

```json
"user_command": "node cert-manager-cli.js generate-author --name \"Jane Dev\" --password ***"
```

`--password-file` (a path) and `--prompt-password` (a boolean) carry no secret and are left intact. The flag list lives in `SENSITIVE_FLAGS` in `common/lib/envelope/user-command.js`.

---

## Usage

### 1. Basic Usage (wrapEnvelope)

```javascript
const { wrapEnvelope } = require('../lib/envelope/envelope-wrapper');

// Success
const result = wrapEnvelope('tizen-sdk sdk-init', {
  sdk_path: '/opt/tizen-studio',
  config_file: '/home/user/.tizen.sdk.path.config',
});
console.log(JSON.stringify(result));

// Failure
const error = wrapEnvelope(
  'tizen-sdk build-project', null, 'build_failed', 'Compilation error in main.c:42'
);
console.log(JSON.stringify(error));
```

### 2. Common Errors

```javascript
const { CommonErrors } = require('../lib/envelope/envelope-wrapper');

CommonErrors.sdkPathNotSet('tizen-sdk build-project');
CommonErrors.deviceNotFound('tizen-sdk install-app');
CommonErrors.templateNotFound('tizen-sdk create-project', 'BasicWeb');
CommonErrors.buildFailed('tizen-sdk build-project', 'Linking error');
CommonErrors.emulatorNotFound('tizen-sdk launch-emulator', 'tizen-mobile-10.0');
CommonErrors.emulatorAlreadyRunning('tizen-sdk launch-emulator', 'tizen-mobile-10.0');
```

### 3. Response Formatting Helpers

```javascript
const { formatSdkInit, formatProjectCreate, formatDeviceList, formatEmulatorList } = require('../lib/envelope/response-formatter');

formatSdkInit('/opt/tizen-studio', '/home/user/.tizen.sdk.path.config');
formatProjectCreate('/home/user/projects/MyApp', 'native', 'tizen', '10.0', 'MyApp');
formatDeviceList([{ device_id: 'emulator-26101', device_name: 'Tizen 10.0 Mobile', status: 'online', platform: 'Tizen', version: '10.0', type: 'emulator' }]);
```

---

## Error Categories

| Category | Error Code | Description |
|----------|-----------|-------------|
| `sdk_path_not_set` | TIZEN_SDK_CONFIG_E001 | SDK path not set |
| `sdk_path_invalid` | TIZEN_SDK_CONFIG_E002 | SDK path invalid |
| `sdk_path_not_accessible` | TIZEN_SDK_CONFIG_E003 | SDK path not accessible |
| `device_not_found` | TIZEN_SDK_DEVICE_E001 | No connected device |
| `template_not_found` | TIZEN_SDK_TEMPLATE_E001 | Template not found |
| `project_creation_failed` | TIZEN_SDK_PROJECT_E001 | Project creation failed |
| `build_failed` | TIZEN_SDK_BUILD_E001 | Build failed |
| `emulator_not_found` | TIZEN_SDK_EMULATOR_E001 | Emulator not found |
| `emulator_already_running` | TIZEN_SDK_EMULATOR_E002 | Emulator already running |
| `io_error` | TIZEN_SDK_IO_E001 | File I/O error |
| `permission_denied` | TIZEN_SDK_IO_E002 | Write refused (EACCES / Access is denied) |
| `remote_path_not_found` | TIZEN_SDK_IO_E003 | Device-side path does not exist (file-transfer pull) — do not retry the same path |

---

## Command-Specific Response Examples

### sdk init (Success)

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

### project create (Success)

```json
{
  "status": "success",
  "result": {
    "project_path": "/home/user/projects/MyWebApp",
    "app_type": "web",
    "profile": "tizen",
    "platform_version": "10.0",
    "project_name": "MyWebApp"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-project",
  "duration_ms": 2500
}
```

### project build (Success)

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "/home/user/projects/MyApp/Debug/MyApp.tpk",
        "format": ".tpk",
        "size_bytes": 1048576
      }
    ],
    "build_time_ms": 5000
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 5000
}
```

### device list (Success)

```json
{
  "status": "success",
  "result": {
    "devices": [
      {
        "device_id": "emulator-26101",
        "device_name": "Tizen 10.0 Mobile Emulator",
        "status": "online",
        "platform": "Tizen",
        "version": "10.0",
        "type": "emulator"
      },
      {
        "device_id": "RF123456789",
        "device_name": "Galaxy Watch 6",
        "status": "connected",
        "platform": "Tizen",
        "version": "8.0",
        "type": "usb"
      }
    ]
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 1200
}
```

### device list (Failure — No Device)

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_DEVICE_E001",
      "error_category": "device_not_found",
      "message": "No connected device or emulator found.",
      "suggested_fix": {
        "command": "tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch",
        "auto_fixable": false,
        "guide_url": "https://docs.tizen.org/application/native/tutorials/getting-started/"
      }
    }
  ],
  "command": "tizen-sdk install-app",
  "duration_ms": 50
}
```

---

## Applying to Existing Agents

### Example: tizen-create-project Agent

**Before:**
```markdown
---
name: tizen-create-project
description: Create a new Tizen project
---
Creates the project requested by the user.
Project created at /path/to/project.
```

**After:**
```markdown
---
name: tizen-create-project
description: Create a new Tizen project
---
const { formatProjectCreate } = require('../lib/envelope/response-formatter');

// ... project creation logic ...

// On success
const envelope = formatProjectCreate(projectPath, appType, profile, platformVersion, projectName);
console.log(JSON.stringify(envelope));

// On failure
const { CommonErrors } = require('../lib/envelope/envelope-wrapper');
const error = CommonErrors.projectCreationFailed('tizen-sdk create-project', reason);
console.log(JSON.stringify(error));
```

---

## Testing

```bash
# Navigate to project root
cd ~/path/to/tizen-sdk-skills

# Run tests
node lib/tests/envelope.test.js
```

---

## Notes

1. **stdout only**: All JSON Envelopes are output to stdout
2. **Debug logs**: Debug/diagnostic info goes to stderr (no Envelope contamination)
3. **Large logs**: Logs ≥1MB are saved to file, only path returned
4. **ANSI escape removal**: Colored output from legacy tools must be stripped
5. **Timeouts**: Set appropriate timeouts per command (e.g., build: 30 min)

---

## Related Files

- `lib/envelope/envelope.js` — Envelope core class
- `lib/envelope/envelope-wrapper.js` — Wrapper and common errors
- `lib/envelope/response-formatter.js` — Command-specific response formatting helpers
- `lib/tests/envelope.test.js` — Tests and examples
