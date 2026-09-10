# Scenario Guide: Tizen Emulator Manager End to End

This document walks you through the **complete Tizen emulator VM workflow** with the `tizen-sdk-skills` plugin: "SDK install → emulator package download → list templates/platforms → create emulator VM → launch → use for app testing".

Each step runs automatically when you **tell Claude in natural language** — no commands to memorize.

> Tizen emulator VMs are managed via `em-cli` (located at `{TIZEN_SDK_PATH}/tools/emulator/bin/em-cli`). You can create multiple VMs at different screen sizes (1080, 720, 3840, etc.), customize hardware (RAM, CPU, GL acceleration), and choose profiles (standard Tizen or Samsung TV). The responsible skill is `tizen-create-emulator` for creation and `tizen-launch-emulator` for launching.

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Cline plugin install" in [README.en.md](../README.en.md))
- **Tizen SDK installed**: the SDK must be installed and `~/.tizen.sdk.path.config` must point to it. (If not, see "Install the Tizen SDK" below)
- **Emulator package downloaded**: the emulator runtime package must be installed. (If not, see Step 1)
- **OS**: Windows / Ubuntu (Linux) / macOS are all supported. Claude detects the current OS and runs the matching script.
- **Disk space**: emulator VMs require several GB of free space per VM.
- **Example goal**:
  - Scenario A (Quick start): Create a 1080p emulator VM and launch it for app testing.
  - Scenario B (TV development): Create a 4K TV emulator VM for Samsung TV app testing.
  - Scenario C (Custom hardware): Create an emulator with custom RAM, no GL acceleration, and file sharing enabled.
  - Scenario D (Raw image): Create a VM from a custom disk image (snapshot restore or pre-configured image).

> 💡 Copy the "Say this" examples in each step as-is.

---

## The Whole Flow at a Glance

| Step | Task | When | Agent |
|------|------|------|-------|
| 1 | Download emulator package | After SDK install | `tizen-download-emulator-package` |
| 2 | List available screen sizes | Before creating emulator | `tizen-create-emulator` |
| 3 | Create emulator VM | First time or adding new VM | `tizen-create-emulator` |
| 4 | Launch emulator VM | Before app install/testing | `tizen-launch-emulator` |
| 5 | Verify sdb connection | After launch | `tizen-device-manager` |
| 6 (optional) | Modify VM configuration | Change size/RAM/hardware | `tizen-create-emulator` |
| 7 (optional) | List/manage existing VMs | View or clean up VMs | `tizen-create-emulator` |
| 8 | Install and test app | Deploy your Tizen app | `tizen-install-app` |

---

## Step 1 — Download Emulator Package

After installing the Tizen SDK, download the emulator runtime package. Skip if already installed.

**Say this:**
```
Download the Tizen emulator package
```

**Success check:** a Standard JSON Envelope is returned with a `result` like:

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "packages_installed": [
      {
        "name": "TIZEN-10.0-Emulator",
        "version": "emulator",
        "status": "installed"
      }
    ]
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk download-emulator-package",
  "duration_ms": 45000
}
```

> ⚠️ **Time estimate:** This step takes 2-5 minutes depending on your network speed.

---

## Step 2 — List Available Screen Sizes (Templates)

Before creating an emulator, view the available screen sizes/templates your SDK supports. **This is required** because screen size is a **user choice** — Claude will ask you which size to create.

**Say this:**
```
List available emulator screen sizes
```

**Success check:** a Standard JSON Envelope showing available templates:

```json
{
  "status": "success",
  "result": {
    "templates": ["HD1080 Tizen", "HD720 Tizen", "HD3840 TV"],
    "template_details": [
      {
        "name": "HD1080 Tizen",
        "profile": "tizen",
        "resolution": "1920x1080",
        "size": "1080",
        "ram": "512"
      },
      {
        "name": "HD720 Tizen",
        "profile": "tizen",
        "resolution": "1280x720",
        "size": "720",
        "ram": "512"
      },
      {
        "name": "HD3840 TV",
        "profile": "tv",
        "resolution": "3840x1080",
        "size": "3840",
        "ram": "1024"
      }
    ],
    "available_sizes": ["1080", "720", "3840"],
    "default_size": "1080",
    "count": 3,
    "profile": "tizen"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager list-template",
  "duration_ms": 500
}
```

**What size to choose?**
- **1080 (1920x1080)** — Recommended for most development; matches standard Full HD displays.
- **720 (1280x720)** — Smaller, faster boot; good for low-resource hosts.
- **3840 (3840x1080)** — 4K TV resolution; requires TV SDK extension.

---

## Step 3 — Create Emulator VM

Create a new emulator VM at your chosen screen size. You can also specify platform, profile, and hardware options.

### Option A — Create at 1080p (Recommended Default)

**Say this:**
```
Create an emulator VM named "my-vm" at 1080p screen size
```

**Success check:** a Standard JSON Envelope is returned:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "platform": "tizen-10.0-x86_64",
    "template": "HD1080 Tizen",
    "size": "1080",
    "resolution": "1920x1080",
    "size_applied": true,
    "profile": "tizen",
    "launched": false,
    "device_serial": null,
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 3500
}
```

### Option B — Create and Launch Immediately

**Say this:**
```
Create an emulator VM named "my-vm" at 1080p and launch it immediately
```

**Success check:** the VM is created and launched; `device_serial` is populated:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "platform": "tizen-10.0-x86_64",
    "template": "HD1080 Tizen",
    "size": "1080",
    "resolution": "1920x1080",
    "size_applied": true,
    "profile": "tizen",
    "launched": true,
    "device_serial": "emulator-26101",
    "status": "created_and_launched"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 180000
}
```

> ⚠️ **Cold boot time:** First launch can take 5-7 minutes. Subsequent launches are faster.

### Option C — Create TV Emulator (4K)

**Say this:**
```
Create a TV emulator VM named "tv-vm" at 3840 screen size
```

**Success check:** a TV-profile VM is created:

```json
{
  "status": "success",
  "result": {
    "vm_name": "tv-vm",
    "platform": "tv-samsung-7.0-x86_64",
    "template": "HD3840 TV",
    "size": "3840",
    "resolution": "3840x1080",
    "size_applied": true,
    "profile": "tv",
    "launched": false,
    "device_serial": null,
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 3500
}
```

> ⚠️ **TV SDK required:** If you don't have the TV SDK extension, install it first with `tizen-tv-sdk-install`.

### Option D — Create with Custom Hardware

**Say this:**
```
Create an emulator VM named "my-vm" at 720p with 1024MB RAM and no GL acceleration
```

**Success check:** the VM is created with custom hardware:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "platform": "tizen-10.0-x86_64",
    "template": "HD720 Tizen",
    "size": "720",
    "resolution": "1280x720",
    "ram": "1024",
    "hw_gl_acceleration": "no",
    "size_applied": true,
    "profile": "tizen",
    "launched": false,
    "device_serial": null,
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 3500
}
```

**Available hardware options:**
- `--ram-size <512|768|1024>` — VM memory in MiB
- `--hw-gl-acceleration <yes|no>` — OpenGL acceleration (disable for troubleshooting)
- `--hw-virtualization <yes|no>` — CPU virtualization (enable for better performance)
- `--file-sharing-path <path>` — Host directory shared with VM
- `--skin <1|2>` — Skin style (1=general, 2=profile-specific)

### Option E — Create Custom VM from Raw Disk Image

If you have a custom disk image (e.g., a pre-configured VM snapshot or a platform image you created), you can create a new VM from it instead of using a template. **This bypasses screen size and template selection** — the disk image determines the VM's configuration.

**Prerequisites:**
- A directory containing the raw disk image files (e.g., `.qcow2` or `.img` files)
- The platform image name that matches your disk image

**Say this:**
```
Create an emulator VM named "custom-vm" from the raw disk image at "/path/to/custom-images" using platform "tizen-10.0-x86_64"
```

**Success check:** the VM is created from the raw disk image:

```json
{
  "status": "success",
  "result": {
    "vm_name": "custom-vm",
    "platform": "tizen-10.0-x86_64",
    "template": null,
    "raw_image_path": "/path/to/custom-images",
    "size": null,
    "resolution": null,
    "size_applied": false,
    "profile": "tizen",
    "launched": false,
    "device_serial": null,
    "status": "created_from_raw_image"
  },
  "warnings": ["VM created from raw disk image — resolution and size depend on the image contents"],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 5000
}
```

> ⚠️ **Important notes for raw image creation:**
> - **No size/template selection:** The disk image determines the VM's resolution and hardware. Do NOT pass `--size` or `--template` with raw images.
> - **Platform must match:** Ensure the platform image matches what the disk image was created for.
> - **Confirmation auto-answered:** em-cli prompts for confirmation when using raw images; the runner automatically answers "y".
> - **Use case:** This is useful for restoring VM snapshots, using pre-configured development images, or reusing platform images you created with `create-image`.

**How to get a raw disk image:**
1. **From an existing VM:** Use `create-image` to capture a VM's disk:
   ```
   Capture the disk image of "my-vm" as a reusable platform image, output to "/path/to/images"
   ```
2. **From a backup:** Restore a previously exported VM disk image.
3. **From external sources:** Use disk images provided by your team or organization.

**Say this (with launch):**
```
Create an emulator VM named "custom-vm" from the raw disk image at "/path/to/custom-images" using platform "tizen-10.0-x86_64" and launch it immediately
```

**Success check:** the VM is created and launched from the raw image.

---

## Step 4 — Launch Emulator VM

Launch an existing emulator VM and wait for it to connect via sdb.

**Say this:**
```
Launch the emulator VM named "my-vm"
```

**Success check:** a Standard JSON Envelope showing the VM is running:

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "vm_name": "my-vm",
    "launch_time_ms": 120000,
    "sdb_connected": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk launch-emulator",
  "duration_ms": 120000
}
```

> ⚠️ **Launch timeout:** Cold boots can take 5-7 minutes. The launcher waits up to 300 seconds by default. If launch fails, see Step 10 (Troubleshooting).

### Launch First Available VM

If you have only one VM or want to launch the first available one:

**Say this:**
```
Launch the emulator
```

**Success check:** the first VM from `list-vm` is launched.

---

## Step 5 — Verify sdb Connection

After launch, verify the emulator is connected via sdb and ready for app installation.

**Say this:**
```
Find connected Tizen devices
```

**Success check:** a Standard JSON Envelope showing connected devices:

```json
{
  "status": "success",
  "result": {
    "devices": [
      {
        "serial": "emulator-26101",
        "type": "emulator",
        "model": "Tizen Emulator",
        "sdk_version": "10.0"
      }
    ],
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "status": "connected"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 2000
}
```

---

## Step 6 (Optional) — Modify VM Configuration

Change an existing VM's configuration without recreating it.

### Change Screen Size

**Say this:**
```
Change the screen size of "my-vm" to 720p
```

**Success check:** the VM's template is swapped:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "template": "HD720 Tizen",
    "resolution": "1280x720",
    "size": "720",
    "template_changed": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager modify",
  "duration_ms": 2000
}
```

### Enable CPU Virtualization (Fix Boot Issues)

**Say this:**
```
Enable CPU virtualization on "my-vm"
```

**Success check:** hardware virtualization is enabled:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "hw_virtualization": "yes",
    "changed": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager modify",
  "duration_ms": 2000
}
```

### Change RAM

**Say this:**
```
Change the RAM of "my-vm" to 1024MB
```

**Success check:** RAM is updated.

### Set File Sharing

**Say this:**
```
Set the file sharing path of "my-vm" to "/home/user/share"
```

**Success check:** the host directory is shared with the VM.

---

## Step 7 (Optional) — List and Manage Existing VMs

### List All VMs

**Say this:**
```
List all emulator VMs
```

**Success check:** a list of VM names:

```json
{
  "status": "success",
  "result": {
    "vms": ["my-vm", "tv-vm", "tizen-vm-default"],
    "count": 3
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager list-vm",
  "duration_ms": 500
}
```

### List VMs with Details

**Say this:**
```
List all emulator VMs with details
```

**Success check:** full configuration per VM:

```json
{
  "status": "success",
  "result": {
    "vm_details": [
      {
        "name": "my-vm",
        "platform": "tizen-10.0-x86_64",
        "template": "HD1080 Tizen",
        "resolution": "1920x1080",
        "ram": "512",
        "cpu_arch": "x86_64",
        "cpu_count": "2"
      }
    ],
    "count": 1
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager list-vm",
  "duration_ms": 500
}
```

### Delete a VM

**Say this:**
```
Delete the emulator VM named "old-vm"
```

**Success check:** the VM is removed.

---

## Step 8 — Install and Test App

With the emulator running, install and test your Tizen app.

**Say this:**
```
Install my Tizen app on the emulator
```

**Success check:** the app is installed and optionally launched:

```json
{
  "status": "success",
  "result": {
    "package_path": "C:\\ws\\MyApp\\MyApp-1.0.0.wgt",
    "device_serial": "emulator-26101",
    "app_id": "org.example.myapp",
    "installed": true,
    "launched": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-app",
  "duration_ms": 15000
}
```

---

## Full E2E Paths

### Path 1: Quick Start (1080p Emulator)

Use this for standard app development and testing:

```
1) Download the Tizen emulator package
2) List available emulator screen sizes
3) Create an emulator VM named "my-vm" at 1080p screen size
4) Launch the emulator VM named "my-vm"
5) Find connected Tizen devices
6) Install my Tizen app on the emulator
```

**Time estimate:** ~10-15 minutes (Step 1 is the longest; Step 4 cold boot takes 5-7 minutes).

### Path 2: TV Emulator (4K Samsung TV)

Use this for Samsung TV app development:

```
1) Install the TV SDK extension (tizen-tv-sdk-install)
2) Download the Tizen emulator package
3) List available TV emulator screen sizes
4) Create a TV emulator VM named "tv-vm" at 3840 screen size
5) Launch the emulator VM named "tv-vm"
6) Install my Tizen TV app on the emulator
```

**Time estimate:** ~15-20 minutes (TV SDK install + emulator package + cold boot).

### Path 3: Custom Hardware Configuration

Use this for low-resource hosts or specific testing scenarios:

```
1) Download the Tizen emulator package
2) Create an emulator VM named "my-vm" at 720p with 512MB RAM and no GL acceleration
3) Launch the emulator VM named "my-vm"
4) Find connected Tizen devices
5) Install my Tizen app on the emulator
```

**Time estimate:** ~10-15 minutes (720p boots faster than 1080p).

### Path 4: Create and Launch in One Step

For quick iteration:

```
1) Download the Tizen emulator package
2) Create an emulator VM named "my-vm" at 1080p and launch it immediately
3) Install my Tizen app on the emulator
```

**Time estimate:** ~10-15 minutes (single create+launch step).

---

## Management & Troubleshooting

### View Emulator Manager Info

**Say this:**
```
Show emulator manager version and workspace path
```

**Result:** shows the emulator manager version, workspace path, and package version.

### View Single VM Details

**Say this:**
```
Show details of the emulator VM named "my-vm"
```

**Result:** shows resolution, RAM, CPU, skin path, and other configuration.

### Reset VM to Factory State (Destructive)

**Say this:**
```
Reset the emulator VM named "my-vm" to factory state
```

> ⚠️ **Warning:** This formats the VM's disk image and deletes all installed apps. You must confirm explicitly.

**Result:** the VM is wiped clean; all data is lost.

### Create Platform Image from VM

**Say this:**
```
Capture the disk image of "my-vm" as a reusable platform image, output to "/tmp/images"
```

**Result:** the VM's disk is saved as a reusable platform image.

---

## Troubleshooting

### Emulator Won't Boot

**Symptoms:** `emulator_boot_failed` error, timeout waiting for sdb.

**Say this:**
```
The emulator "my-vm" failed to boot — diagnose the issue
```

**Common causes and fixes:**

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| CPU virtualization disabled | `hw_virtualization: "no"` in diagnosis | `Enable CPU virtualization on "my-vm"` |
| Missing KVM (Linux) | `/dev/kvm: missing` | Install `qemu-kvm`; add user to `kvm` group |
| Missing libraries | `missing_libs: ["libasound2", "libsdl1.2"]` | Install host packages |
| Qt xcb failure | `qt_xcb: failed` | Install `libxcb-*` packages |
| Java/JNA crash | `java_jna: failed` | Reinstall emulator package |
| No display (WSL/SSH) | `display: "missing"` | Enable WSLg or set DISPLAY |

### Java/JNA Dependency Error

**Symptoms:** em-cli crashes with `NoClassDefFoundError` or `UnsatisfiedLinkError`.

**Say this:**
```
Reinstall the emulator package
```

**Result:** the emulator package is reinstalled, restoring JNA native libraries.

### VM Already Exists

**Symptoms:** `An emulator VM named 'my-vm' already exists.`

**Say this:**
```
Delete the emulator VM named "my-vm"
```

Then recreate with the same name.

### No Templates Found

**Symptoms:** `em-cli reported no templates`.

**Say this:**
```
List available emulator screen sizes
```

If empty, the emulator package may not be installed — run Step 1.

### TV Emulator Not Available

**Symptoms:** `profile 'tv' not found` or no TV templates.

**Say this:**
```
Install the TV SDK extension
```

Then retry creating a TV emulator.

---

## E2E Verification Checklist

Verify these items during a manual E2E test.

### Basic Emulator Path

| # | Check | Expected |
|---|-------|----------|
| 1 | Step 1 envelope | `status: "success"`, emulator package listed as installed |
| 2 | Step 2 envelope | `template_details` array with resolution/RAM per template |
| 3 | Step 3 envelope | `status: "success"`, `vm_name` matches request, `size_applied: true` |
| 4 | VM file exists | VM directory visible in `{SDK_DATA}/emulator/vm/` |
| 5 | Step 4 envelope | `device_serial` populated (e.g., `emulator-26101`) |
| 6 | sdb connection | `sdb devices` shows the emulator |
| 7 | App install | `tizen-install-app` completes successfully |

### TV Emulator Path

| # | Check | Expected |
|---|-------|----------|
| 8 | TV SDK installed | `tv-samsung-7.0-x86_64` platform visible in `list-platform` |
| 9 | Step 3 envelope | `profile: "tv"`, `size: "3840"`, `resolution: "3840x1080"` |
| 10 | Launch succeeds | `device_serial` populated after cold boot |

### Troubleshooting Path

| # | Check | Expected |
|---|-------|----------|
| 11 | Boot diagnosis | `LAUNCH_DIAG` lines present in error details |
| 12 | Virtualization fix | `modify --hw-virtualization yes` resolves boot failure |
| 13 | Java/JNA fix | Reinstall emulator package resolves `NoClassDefFoundError` |

### Failure Paths (Error Mapping)

| # | Scenario | Expected |
|---|----------|----------|
| 14 | VM name collision | `error_category: "invalid_parameters"` — "VM already exists" |
| 15 | No size specified | `error_category: "user_input_required"` — ask user for size |
| 16 | Invalid size | `error_category: "invalid_parameters"` — shows supported sizes |
| 17 | SDK not installed | `error_category: "sdk_path_not_set"` — run `tizen-sdk-install` first |
| 18 | No VMs exist (launch) | `error_category: "emulator_not_found"` — run `create` first |
| 19 | TV SDK missing | `error_category: "tv_sdk_not_installed"` — run `tizen-tv-sdk-install` |

---

## Keyboard Shortcuts & Tips

- **Natural language:** just describe what you want in plain English. Claude understands "Make a 1080p emulator", "Create a 4K TV emulator", and "Resize my-vm to 720p".
- **Screen size is a user choice:** Claude will always ask which size you want before creating — this is intentional. The default (1080) is pre-selected, but you decide.
- **Cold boot is slow:** First launch takes 5-7 minutes; subsequent launches are faster. Be patient.
- **Copy-paste VM names:** VM names are case-sensitive. If you created `my-vm`, use exactly `my-vm` in subsequent commands.
- **Use `--detail` for troubleshooting:** The `list-vm --detail` and `detail --vm-name` actions show what actually applied vs. what was requested.
- **Enable virtualization for performance:** If your host supports KVM/VT-x, enable `hw-virtualization` for better emulator performance.
- **Disable GL acceleration for troubleshooting:** If the emulator crashes on launch, try `--hw-gl-acceleration no`.
- **TV emulators need TV SDK:** Install the TV SDK extension before creating TV-profile VMs.
- **Clean up old VMs:** Use `delete` to remove unused VMs and free disk space.

---

## Related Documents

- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (tizen-create-emulator, tizen-launch-emulator)
- Certificate management scenario: [certificate-manager-walkthrough.en.md](../certificate/certificate-manager-walkthrough.en.md)

- Web app debugging scenario: [scenario-webapp-debug-walkthrough.en.md](../debug/scenario-webapp-debug-walkthrough.en.md)
- Native app debugging scenario: [scenario-native-app-walkthrough.en.md](../project/scenario-native-app-walkthrough.en.md)


