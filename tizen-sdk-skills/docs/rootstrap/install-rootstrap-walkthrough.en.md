# Scenario Guide: Install Custom Rootstrap Packages

English | [한국어](install-rootstrap-walkthrough.md)

This document walks you through installing custom rootstrap packages from ZIP files into the Tizen SDK. Custom rootstraps allow you to add support for new device profiles, architectures, or platform versions that are not included in the standard SDK distribution.

Each step runs automatically when you **tell Claude in natural language** — no commands to memorize.

> 💡 **Why install a custom rootstrap?**
> - **Custom Device Support**: Adding rootstraps for non-standard or proprietary devices
> - **Extended Architecture Support**: Supporting additional CPU architectures beyond the default set
> - **Platform Extensions**: Adding support for unreleased or custom Tizen platform versions
> - **Development and Testing**: Testing rootstraps before official release
> - **Enterprise Customization**: Creating device-specific rootstraps for enterprise products

---

## 0. Before You Start

- **Tizen SDK installed**: The base Tizen SDK must be installed and configured
- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed
- **Valid ZIP file**: You must have a rootstrap ZIP file with the correct structure
- **Disk space**: Rootstrap packages typically require 1-5 GB of disk space

**What is a valid rootstrap ZIP structure?**

A valid rootstrap ZIP file must contain one of two directory structures:

### Structure 1: `data/` Layout (Common)

```
rootstrap.zip
└── data/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core.{public|private}.{timestamp}/
```

### Structure 2: `tizen-studio/` Layout

```
rootstrap.zip
└── tizen-studio/
    ├── tools/
    │   └── smart-build-interface/
    │       └── plugins/
    │           └── {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml
    └── platforms/
        └── tizen-{version}/
            └── tizen/
                └── rootstraps/
                    └── {profile}-{version}-{device}.core.{public|private}.{timestamp}/
```

**XML Metadata File Format:**

The XML filename contains important metadata:
- **Format**: `{profile}-{version}-{device}.core.{public|private}.{timestamp}.xml`
- **Examples**: 
  - `tizen-9.0-arm.core.public.20260819_095020.xml` (public rootstrap)
  - `tv-samsung-8.0-device.core.private.20260819_095020.xml` (private rootstrap)
- **Parsed Information**:
  - `profile`: Target profile (e.g., `tizen`, `tv-samsung`, `wearable`)
  - `version`: Platform version (e.g., `9.0`, `8.0`, `7.0`)
  - `device`: Target device/architecture (e.g., `arm`, `aarch64`, `x86`, `x86_64`, `device`)
  - `type`: Rootstrap type - `public` or `private`
  - `timestamp`: Build timestamp in `YYYYMMDD_HHMMSS` format (e.g., `20260819_095020`)

> 💡 **Copy the "Say this" examples in each step as-is.**

---

## The Whole Flow at a Glance

| Step | Task | When | Agent |
|------|------|------|-------|
| 1 | Pre-check rootstrap installation | Before installing (automatic) | `tizen-install-rootstrap` |
| 2 | Install rootstrap from ZIP | Main installation step | `tizen-install-rootstrap` |
| 3 | Verify installation | After installation completes | `tizen-install-rootstrap` |

---

## Step 1 — Pre-Check Installation

The pre-check validates the ZIP file path, detects its structure, and checks if the rootstrap is already installed. This completes in seconds.

**Say this:**
```
Install the custom rootstrap from C:\Downloads\custom-arm-rootstrap.zip
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

**Success check (rootstrap not installed yet):** the pre-check returns a `suggested_fix` command:

```json
{
  "status": "error",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "zip_exists": true,
    "rootstrap_installed": false
  },
  "warnings": [],
  "errors": [
    {
      "error_code": "TIZEN_ROOTSTRAP_EXEC_E001",
      "error_category": "execution_error",
      "message": "Rootstrap not installed yet. Run the suggested fix command to install.",
      "suggested_fix": {
        "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\<username>\\.cline\\plugins\\cache\\tizen-platform\\tizen-sdk-skills\\v1.2.3\\scripts\\tizen-install-rootstrap\\tizen-install-rootstrap.ps1\" --zip-path \"C:\\Downloads\\custom-arm-rootstrap.zip\"",
        "description": "Install custom rootstrap from ZIP file"
      }
    }
  ],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 1000
}
```

**Success check (rootstrap already installed):**

```json
{
  "status": "success",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "rootstraps": [
      {
        "name": "tizen-9.0-arm.core",
        "profile": "tizen",
        "version": "9.0",
        "architecture": "arm"
      }
    ],
    "structure_type": "data",
    "installation_status": "already_installed"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 800
}
```

> ⚠️ **Already installed:** If the rootstrap already exists, the pre-check returns **success** and no further action is needed. To force reinstallation, add `--force` to the request.

---

## Step 2 — Install Rootstrap from ZIP

The actual installation copies the rootstrap files to the SDK's `rootstrap` directory. This typically takes seconds to a minute depending on ZIP size.

**Say this:**
```
Install the custom rootstrap from C:\Downloads\custom-arm-rootstrap.zip
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

The agent will automatically run the `suggested_fix.command` from Step 1.

### Installation Process

The installer:
1. Validates the ZIP file path and existence
2. Extracts the ZIP to a temporary directory
3. Performs security validation:
   - **Path traversal detection**: Rejects entries containing `..` in paths
   - **Symlink rejection**: Refuses to extract symbolic links
   - **Absolute path rejection**: Rejects entries with absolute paths
4. Detects the ZIP structure (`data/` or `tizen-studio/`)
5. Parses XML metadata from `tools/smart-build-interface/plugins/*.xml`
6. Copies `tools/` and `platforms/` folders to the SDK
7. Cleans up the temporary extraction directory

**Success check:** after installation completes:

```json
{
  "status": "success",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "rootstraps": [
      {
        "name": "tizen-9.0-arm.core",
        "profile": "tizen",
        "version": "9.0",
        "architecture": "arm"
      }
    ],
    "structure_type": "data",
    "warnings": [],
    "installation_status": "installed",
    "installation_time_ms": 45000
  },
  "errors": [],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 45000
}
```

> ⚠️ **Time estimate:** This step typically takes 30-60 seconds depending on ZIP size and disk speed.

---

## Step 3 — Verify Installation

After installation completes, verify that the rootstrap is properly installed in the SDK.

**Say this:**
```
Verify the custom rootstrap installation
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

**Success check:**

```json
{
  "status": "success",
  "result": {
    "zip_path": "C:\\Downloads\\custom-arm-rootstrap.zip",
    "rootstraps": [
      {
        "name": "tizen-9.0-arm.core",
        "profile": "tizen",
        "version": "9.0",
        "architecture": "arm"
      }
    ],
    "structure_type": "data",
    "installation_status": "already_installed"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-rootstrap",
  "duration_ms": 800
}
```

---

## Full E2E Paths

### Path 1: Standard Rootstrap Installation

Use this for a typical rootstrap installation:

```
1) Install the custom rootstrap from C:\Downloads\custom-arm-rootstrap.zip
2) Verify the rootstrap installation
```

**tizen-cli commands:**
```bash
# Step 1: Install
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"

# Step 2: Verify
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip"
```

**Time estimate:** ~1 minute (pre-check is instant; installation is 30-60 seconds).

### Path 2: Force Reinstall

If you need to reinstall an existing rootstrap:

```
1) Force reinstall the custom rootstrap from C:\Downloads\custom-arm-rootstrap.zip
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk install-rootstrap --zip-path "C:\Downloads\custom-arm-rootstrap.zip" --force
```

> ⚠️ **`--force` is required:** Without it, the installer detects the existing rootstrap and exits without copying anything.

---

## ZIP Structure Detection

The installer automatically detects which structure your ZIP file uses:

| Structure | Detection Criteria | Handling |
|-----------|-------------------|----------|
| `data/` | `data/tools/smart-build-interface/plugins/` exists | Standard copy to SDK |
| `tizen-studio/` | `tizen-studio/tools/smart-build-interface/plugins/` exists | May require native packages |

The detected structure type is reported in `result.structure_type`.

---

## Security Validation

The installer performs comprehensive security checks on the ZIP file:

### Path Traversal Detection

**What it checks:** ZIP entries containing `..` in their paths.

**Example malicious entry:** `../../../etc/passwd`

**Error response:**
```json
{
  "status": "error",
  "errors": [
    {
      "error_code": "security_violation",
      "error_category": "path_traversal",
      "message": "Path traversal detected in ZIP entry: ../../../etc/passwd"
    }
  ]
}
```

### Symlink Rejection

**What it checks:** ZIP entries that are symbolic links.

**Error response:**
```json
{
  "status": "error",
  "errors": [
    {
      "error_code": "security_violation",
      "error_category": "symlink_detected",
      "message": "Symlink detected in ZIP archive: path/to/symlink"
    }
  ]
}
```

### Absolute Path Rejection

**What it checks:** ZIP entries with absolute paths (e.g., `/etc/config`).

**Error response:**
```json
{
  "status": "error",
  "errors": [
    {
      "error_code": "security_violation",
      "error_category": "absolute_path",
      "message": "Absolute path detected in ZIP entry: /etc/config"
    }
  ]
}
```

---

## Architecture Support

### Supported Architectures

| Architecture | XML Value | Description |
|--------------|-----------|-------------|
| x86 (32-bit) | `i386`, `x86` | Intel/AMD 32-bit |
| x86_64 (64-bit) | `x86_64`, `emulator64` | Intel/AMD 64-bit |
| ARM (32-bit) | `arm`, `device` | ARM 32-bit (armhf) |
| AArch64 (64-bit) | `aarch64`, `device64` | ARM 64-bit |
| RISC-V 64-bit | `riscv64` | RISC-V 64-bit |

The installer automatically maps XML architecture values to the standard format used by the SDK.

---

## Troubleshooting

### ZIP File Not Found

**Symptoms:** `file_not_found` error.

**Say this:**
```
The rootstrap ZIP file was not found — diagnose the issue
```

**Common causes and fixes:**

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Wrong path | `zip_exists: false` | Verify the path is correct |
| Relative path | Path not resolved | Use absolute path |
| File deleted | File was moved/deleted | Re-download the ZIP file |

### Invalid ZIP Structure

**Symptoms:** `invalid_zip_structure` error.

**Say this:**
```
The ZIP structure is invalid — diagnose the issue
```

**Common causes and fixes:**

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Missing tools/ | No `smart-build-interface/plugins/` | Re-package ZIP with correct structure |
| Missing platforms/ | No `platforms/tizen-*/` | Ensure platforms folder exists |
| Wrong root | Files at ZIP root, not in data/ | Re-package with `data/` or `tizen-studio/` root |

### No XML Metadata Found

**Symptoms:** `no_xml_found` error.

**Say this:**
```
No rootstrap XML metadata files found — diagnose the issue
```

**Common causes and fixes:**

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Missing plugins/ | No `tools/smart-build-interface/plugins/` | Re-package with correct path |
| Wrong filename | XML doesn't match `{profile}-{version}-{arch}.core.{timestamp}.xml` | Rename XML file |
| Corrupted ZIP | ZIP extraction failed | Re-download ZIP file |

### Security Validation Failed

**Symptoms:** `security_violation` error.

**Say this:**
```
Security validation failed — diagnose the issue
```

**Common causes and fixes:**

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Path traversal | Entry contains `..` | Re-package ZIP without path traversal |
| Symlink | Entry is a symbolic link | Re-package with actual files |
| Absolute path | Entry starts with `/` or `C:` | Re-package with relative paths |

### Installation Fails Midway

**Symptoms:** Installation exits with error, partial files copied.

**Say this:**
```
The rootstrap installation failed — resume or retry
```

**Recovery:** Simply re-run the same command. The installer will detect the existing files and complete the installation.

---

## Error Reference

| `error_code` | `error_category` | Cause | Fix |
|--------------|------------------|-------|-----|
| `file_not_found` | `zip_path_invalid` | ZIP file does not exist at specified path | Verify path is correct and file exists |
| `invalid_zip` | `zip_invalid` | File is not a valid ZIP archive | Re-download or re-package the ZIP |
| `invalid_zip_structure` | `structure_unknown` | ZIP does not match `data/` or `tizen-studio/` layout | Re-package with correct structure |
| `no_xml_found` | `metadata_missing` | No XML files in `plugins/` directory | Ensure XML metadata files exist |
| `security_violation` | `path_traversal` | ZIP entry contains `..` | Re-package without path traversal |
| `security_violation` | `symlink_detected` | ZIP contains symbolic links | Re-package with actual files |
| `security_violation` | `absolute_path` | ZIP entry has absolute path | Re-package with relative paths |
| `execution_error` | `execution_error` | Installation script failed | Check error details and retry |

---

## After Installation

After a successful rootstrap installation:

1. **Rootstrap directory** — Files are copied to `{SDK_PATH}/data/platforms/tizen-{version}/tizen/rootstraps/`
2. **Tools installed** — Build plugins are in `{SDK_PATH}/data/tools/smart-build-interface/plugins/`
3. **Ready for use** — The rootstrap is available for project creation and builds

### Using the Installed Rootstrap

After installation, you can use the rootstrap for:

1. **Create a new native project:**
   ```
   Create a new Tizen native project using the tizen-9.0-arm rootstrap
   ```

2. **Build with the rootstrap:**
   ```
   Build my project using the custom arm rootstrap
   ```

3. **Cross-compile for the target architecture:**
   ```
   Set up cross-compilation for ARM devices
   ```

---

## Related Documents

- Technical reference: [tizen-install-rootstrap/SKILL.md](../../common/skills/tizen-install-rootstrap/SKILL.md)
- SDK installation: [INSTALLATION_FLOW.en.md](../sdk-install/INSTALLATION_FLOW.en.md)
- Custom repository install: [custom-repo-walkthrough.en.md](../sdk-install/custom-repo-walkthrough.en.md)
- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (`tizen-install-rootstrap`)

---

## Keyboard Shortcuts & Tips

- **Natural language:** just describe what you want — "Install the rootstrap from C:\...", "Verify the installation".
- **Pre-check first:** the pre-check validates the ZIP and detects its structure in seconds — always run it first.
- **`--force` to reinstall:** if the rootstrap already exists and you want to reinstall, you **must** use `--force`.
- **Security is automatic:** path traversal, symlinks, and absolute paths are automatically rejected.
- **Structure detection is automatic:** the installer automatically detects `data/` vs `tizen-studio/` layouts.
- **XML metadata is parsed:** the installer extracts profile, version, and architecture from the XML filename.
- **Fast installation:** unlike SDK installation (10-15 minutes), rootstrap installation takes 30-60 seconds.

---

## Example Scenarios

### Scenario 1: Custom ARM Rootstrap for IoT Device (Public)

**ZIP:** `custom-arm-iot.zip`
**Structure:** `data/` layout
**XML:** `tizen-9.0-arm.core.public.20260819_095020.xml`

```
Install the custom ARM rootstrap from C:\Downloads\custom-arm-iot.zip
```

**Result:**
- Profile: `tizen`
- Version: `9.0`
- Device: `arm`
- Type: `public`
- Timestamp: `20260819_095020`
- Location: `{SDK}/data/platforms/tizen-9.0/tizen/rootstraps/tizen-9.0-arm.core/`

### Scenario 2: TV Samsung Rootstrap (Private)

**ZIP:** `tv-samsung-rootstrap.zip`
**Structure:** `tizen-studio/` layout
**XML:** `tv-samsung-8.0-device.core.private.20260819_095020.xml`

```
Install the TV Samsung rootstrap from C:\Downloads\tv-samsung.zip
```

**Result:**
- Profile: `tv-samsung`
- Version: `8.0`
- Device: `device`
- Type: `private`
- Timestamp: `20260819_095020`
- Location: `{SDK}/data/platforms/tizen-8.0/tizen/rootstraps/tv-samsung-8.0-device.core/`

### Scenario 3: Multi-Architecture Rootstrap

**ZIP:** `multi-arch-rootstrap.zip`
**Structure:** `data/` layout
**XMLs:** Multiple XML files for different architectures (e.g., `tizen-9.0-arm.core.public.20260819_095020.xml`, `tizen-9.0-aarch64.core.public.20260819_095020.xml`)

```
Install the multi-architecture rootstrap from C:\Downloads\multi-arch.zip
```

**Result:**
- Multiple rootstraps installed for different architectures
- All reported in `result.rootstraps[]`

### Scenario 4: Enterprise Custom Profile (Public)

**ZIP:** `enterprise-device.zip`
**Structure:** `data/` layout
**XML:** `enterprise-device-10.0-aarch64.core.public.20260819_095020.xml`

```
Install the enterprise custom rootstrap from C:\Downloads\enterprise.zip
```

**Result:**
- Profile: `enterprise-device`
- Version: `10.0`
- Device: `aarch64`
- Type: `public`
- Timestamp: `20260819_095020`
