# Tizen Emulator in WSL (Windows Subsystem for Linux)

English | [한국어](WSL_EMULATOR_GUIDE.md)

## Overview

Running Tizen emulator in Windows Subsystem for Linux (WSL2) requires specific configuration due to nested virtualization constraints. This guide covers setup, troubleshooting, and recommended profiles for different WSL environments.

## Prerequisites

### Windows Host Requirements
- Windows 11 21H2 or later (for nested Hyper-V)
- WSL2 (not WSL1 — version check: `wsl -l -v`)

### .wslconfig Configuration

Create or edit `%userprofile%\.wslconfig` file (example: `C:\Users\YourUsername\.wslconfig`):

```ini
[interop]
appendWindowsPath = true

[experimental]
nestedVirtualization = true
autoMemoryReclaim = gradual
```

**Important**: After editing `.wslconfig`, fully restart WSL:
```bash
# In PowerShell (host):
wsl --shutdown
# Then re-open WSL terminal
```

## Emulator Profiles

### Standard Tizen Profile (tizen)

**Pros:**
- Full Tizen mobile experience
- Standard development workflow
- Home screen app (`org.tizen.homescreen`) + Enlightenment compositor desktop environment

**Cons:**
- In WSL the home screen app exits right after start. The cause is **the Flutter home screen
  failing EGL config selection**; the Buxton permission errors seen alongside it are a byproduct
  (see [The actual cause](#the-actual-cause--the-flutter-home-screen-fails-egl-config-selection-verified)).
  **Field-verified: neither the chmod workaround nor the GL options below bring the home screen back.**
  (Enlightenment is the compositor/window manager; the home screen is a separate app on top of it —
  field-verified: the compositor and user-installed apps launch and render fine)
- More resource-intensive
- Requires hwVirtualization enabled

**When to use:** Linux host or VMware Fusion on macOS with nested virtualization support.

### TV Profile (tv)

**Pros:**
- Lighter-weight, more reliable in WSL environments
- TV launcher instead of mobile home screen
- Better WSL compatibility
- Lower system resource requirements

**Cons:**
- TV-specific UI (larger targets, TV remote control paradigm)
- Not suitable for mobile app testing

**Recommended for WSL.**

### Hybrid Approach: Create Both

```bash
# Standard Tizen (for Linux/native development)
em-cli create -n tizen-vm -P <platform> -T "HD1080" -p tizen -w yes

# TV (for WSL testing)
em-cli create -n tv-vm -P <platform> -T "HD1080" -p tv -w yes
```

Switch based on where you're running:
- Linux host → use `tizen-vm`
- WSL host → use `tv-vm`

## Why TV Profile Works on WSL (Technical Deep Dive)

Understanding the architectural difference helps explain why TV profile is WSL-compatible while standard Tizen encounters permission errors.

### Boot Architecture Comparison

#### Standard Tizen Profile (`tizen-10.0-x86_64`)

**Stack:**
```
┌──────────────────────────────────┐
│    Enlightenment Window Manager   │  ← Full desktop environment
│  ┌─────────────────────────────┐  │
│  │  Mobile Home Screen (UI)    │  │
│  │  - App icons, notifications │  │
│  │  - Full mobile experience   │  │
│  └─────────────────────────────┘  │
│                                   │
│  Home screen = a Flutter app      │  ← launched by launchpad
│  - flutter_tizen_engine           │
│  - needs an EGL config            │
│                                   │
│  starter                          │  ← launches and watches it
│  - retries forever on failure     │
└──────────────────────────────────┘
        ↓
    Boot sequence on Linux:
    - Enlightenment starts ✓
    - Home screen picks an EGL config ✓
    - Home screen shows ✓

        ↓
    Boot sequence on WSL:
    - Enlightenment starts ✓
    - ChooseEGLConfiguration fails ✗ (No matching configuration found)
    - app_create_cb() false → assertion → SIGABRT
    - starter retry loop → crash dumps fill /opt
    - as a byproduct, dlog shows BUXTON "Failed to set permissions"
    - Home screen fails to start ✗
```

**Observed failure:** the home screen (a Flutter app) fails to choose an EGL configuration, so `app_create_cb()` returns false and the teardown path aborts on an assertion. The BUXTON permission errors that appear alongside it in dlog are a byproduct of crash dump collection — see [The actual cause](#the-actual-cause--the-flutter-home-screen-fails-egl-config-selection-verified).

---

#### TV Profile (`tv-samsung-10.0-x86_64`)

**Stack:**
```
┌──────────────────────────────────┐
│      TV Launcher (Direct)         │  ← No Enlightenment
│  ┌─────────────────────────────┐  │
│  │  TV Remote UI               │  │
│  │  - Channel selection         │  │
│  │  - App grid for TV           │  │
│  │  - Fixed configuration       │  │
│  └─────────────────────────────┘  │
│                                   │
│  Not a Flutter launcher → no crash│  ← Key difference!
│  - Uses hardcoded settings        │
│  - No permission changes needed   │
│  - No chown/chmod calls           │
└──────────────────────────────────┘
        ↓
    Boot sequence on Linux:
    - TV launcher starts ✓
    - Settings loaded (no chown) ✓
    
        ↓
    Boot sequence on WSL:
    - TV launcher starts ✓
    - Settings loaded (no chown) ✓
    - TV UI shows ✓ (identical to Linux)
```

**Why it works (inference):** the TV launcher is not a Flutter app, so it never
takes the EGL config selection path that kills the standard profile's home
screen. No crash loop follows, and therefore none of the crash dumps, disk
exhaustion or BUXTON errors either. (The TV image's graphics stack was not
instrumented directly — only the outcome "works on WSL" is field-verified.)

---

### Filesystem Layers — Clearing Up a Misconception

> **Correction:** earlier versions of this document claimed "WSL's 9p filesystem
> rejects the chown". That explanation does not hold, for the two reasons below,
> and has been removed. The symptom itself (the home screen dies only on WSL) is
> field-verified and still stands.

**1. The Linux root is not 9p — 9p is on the Windows drive side**

WSL2's Linux root (`/`, `/home/...`) is **ext4** on a virtual disk (VHDX). There,
`chown`/`chmod` behave exactly as on native Linux and persist across reboots. The
9p (drvfs) bridge is involved when reading Windows drives such as `/mnt/c` or
`/mnt/d` (some WSL-internal mounts like `/usr/lib/wsl/drivers` are 9p too, but
they play no part in development work).

| Path | Actual filesystem | chmod / chown |
|---|---|---|
| `/`, `/home/...`, `~/tizen-sdk-data` | ext4 (virtual disk) | ✓ works, persists |
| `/mnt/c/...` | 9p (`aname=drvfs`) → NTFS | ✗ chmod ignored, chown EPERM (default setup) |

> **Caveat on the `/mnt/c` row:** that is the behaviour **without** the `metadata`
> mount option. With `[automount] options="metadata"` in `/etc/wsl.conf`, drvfs
> stores POSIX ownership and permissions in NTFS extended attributes, so
> `chmod`/`chown` work and stick. "9p can never do chown" is therefore not a valid
> claim.
>
> Measured (WSL2 kernel 6.18, default automount): `/mnt/c` is
> `type 9p ... aname=drvfs` with no `metadata` option → after `chmod 700` the mode
> stays `777` and `chown` returns `Operation not permitted`. The same operations on
> ext4 correctly yield `700`.

This plugin installs the SDK and VMs under `~/tizen-sdk-data` (= ext4). In other
words, **the BUXTON errors reproduce in a default setup where no 9p path is
involved at all.**

**2. `/etc/buxton2/user.db` is not a host path**

That path lives **inside the emulator guest image** (`emulimg-*.x86_64`). The
guest kernel writes to a filesystem on its own virtual block device; the host
merely reads and writes one image file byte by byte. A `chown` inside the guest
is not translated down into host filesystem semantics, and whether the image
file sits on `/mnt/c` or `~` has no bearing on UID/GID inside the guest.

```
Guest (Tizen)  chown /etc/buxton2/user.db
      ↓        handled by the guest kernel — it ends here
  virtual block device (emulimg image)
      ↓        the host only reads/writes the image *file*
  host FS (ext4 or NTFS) ← never sees the guest's UID/GID
```

---

### What is BUXTON (buxton2)?

Buxton (buxton2) is Tizen's **system settings storage daemon**. Like Android's
Settings Provider or the Windows registry, it centrally stores, serves, and
notifies changes to system-wide key-value settings (screen brightness,
language, ringtone — the vconf values). The name comes from Intel's original
open-source configuration daemon "Buxton"; Tizen's improved second-generation
implementation is called buxton2.

Key characteristics:

- **SQLite-backed** — settings live in `/etc/buxton2/*.db` (system defaults)
  and `/var/lib/buxton2/*.db` (runtime changes). The `user.db` and
  `user_memory.db` in the dlog errors are exactly these files.
- **A security layer** — it controls which app/process may read or write which
  setting, via Smack labels and file permissions. That is why the daemon
  **enforces file ownership/permissions itself** with
  `set_sqlite_related_file_perms()` whenever it starts or opens a DB.
- **Backend of the higher-level APIs** — the `vconf`/`system-settings` APIs
  apps use go through buxton2 underneath.

> **Important:** the `E/BUXTON ... Failed to set permissions` lines in dlog are a
> **byproduct, not the cause** of the home screen failure. Evidence below.

### The actual cause — the Flutter home screen fails EGL config selection (verified)

Established by opening the crash dumps on a `tizen-10.0-x86_64` VM (WSL2, nested
virtualization, `hwGLAcceleration=true`).

**1. The home screen is a Flutter app, and it dies choosing an EGL config**

On Tizen 10, `org.tizen.homescreen` is a Flutter app. From the first boot's dlog:

```
E/ConsoleMessage: Failed to initialize ecore_wl2
E/ConsoleMessage: tizen_renderer_egl.cc: ChooseEGLConfiguration(265) > No matching configuration found.
E/ConsoleMessage: tizen_renderer_egl.cc: CreateSurface(82) > Could not choose an EGL configuration.
E/ConsoleMessage: flutter_tizen_engine.cc: RunEngine(111) > The display was not valid.
E/ConsoleMessage: Could not launch a Flutter application.
E/CAPI_APPFW_APPLICATION: [OnCreate] INVALID_CONTEXT : app_create_cb() returns false
E/ConsoleMessage: flutter_app.cc:64 FlutterApp::OnTerminate(): Assertion `IsRunning()' failed.   ← SIGABRT
```

The callstack in the crash dump
(`/opt/usr/share/crash/dump/org.tizen.homescreen_*.zip`) agrees: `runner` →
app-core create callback → libc abort, Signal 6 (SIGABRT).

At the same moment, DALI-based apps initialize EGL **successfully**. So the GL
stack as a whole is not dead — only the config combination the Flutter engine
asks for is missing. That matches the observed symptom exactly: compositor and
ordinary apps fine, home screen only.

**2. The crash loop fills `/opt`**

starter restarts the home screen endlessly and crash-manager dumps a core every
time. In the observed case, **3620 crash zips totalling 2.85 GB accumulated in
15 seconds**, taking the 3 GB `/opt` partition to **0 bytes free**.

**3. Only then do the BUXTON errors appear — both paths are byproducts**

- `/var` is a symlink to `opt/var`, so buxton2's runtime DBs sit on the full
  `/opt`. Once it fills, sqlite WAL writes fail first (`send_res: error -2` =
  ENOENT, repeating).
- More decisively, the crash dump log itself contains:

  ```
  ==== System configuration ( /usr/libexec/dump_systemstate/buxton-wait dump memory)
  ==== System configuration ( /usr/libexec/dump_systemstate/buxton-wait dump system)
  ```

  The `Failed to set permissions` errors appear **one second after** the crash,
  from short-lived PIDs unrelated to the home screen, and those same PIDs also
  log `direct_dump: RO DB ... does not exist`. They come from crash-manager
  running `dump_systemstate` → `buxton-wait dump`. They show up on every home
  screen crash, which made the correlation perfect — but **the causality ran the
  other way**.

**Conclusion:** home screen EGL failure → crash loop → `/opt` exhaustion →
buxton2/sqlite failures. That is why `chmod` never changed anything: it was never
a permission problem. (On the observed VM, `/etc/buxton2` and `/var/lib/buxton2`
were **already 777** and the home screen still died.)

### Tried and ineffective

| Attempt | Result |
|---|---|
| `chmod 777` + home screen restart | ✗ home screen not restored |
| `em-cli modify -g no` (disable HW GL) | ✗ `No matching configuration found` returns; boot much slower (load average 34) |
| Force host GL to llvmpipe (`LIBGL_ALWAYS_SOFTWARE=1`) | ✗ same error, 40 occurrences |

WSL's host GL is WSLg's Mesa **d3d12** driver (`/usr/lib/wsl/lib/libd3d12.so`),
but swapping it for llvmpipe changed nothing. So "WSL's host GL driver" is not a
proven explanation either.

### Still unresolved

- **Is this actually WSL-specific?** The same image needs to be booted on a
  native Linux host and compared. The fact that both host GL backends fail
  identically leaves open that this affects any environment without real GPU
  passthrough — or the Tizen 10 image itself.
- **Exactly which EGL attributes does the Flutter engine require?** Comparing
  what `ChooseEGLConfiguration` filters on (multisampling, depth/stencil, alpha)
  against the config list the guest's yagl driver exposes would pin down the
  missing one.

### Diagnosing a home screen that will not start

Look at the **crash dumps**, not the BUXTON tag. It is much faster.

```bash
S=emulator-26101
sdb -s $S root on

# (1) Is the home screen crash-looping? Thousands of entries = confirmed
sdb -s $S shell "ls /opt/usr/share/crash/dump | wc -l"
sdb -s $S shell "ls /opt/usr/share/crash/dump | head -3"

# (2) Has /opt filled up with dumps? (Avail 0 = collateral damage in progress)
sdb -s $S shell "df -h /opt"

# (3) The real cause — pull a dump and read the callstack and preceding log
sdb -s $S pull /opt/usr/share/crash/dump/<dump>.zip .
unzip -q <dump>.zip && cd <dump>
sed -n '/Callstack Information/,/^$/p' ./*.info
grep -aiE "EGL|Flutter|app_create_cb|Assertion" ./*.log | tail -20

# (4) Reclaim the space if it filled up (the dumps are all home screen crashes)
sdb -s $S shell "rm -rf /opt/usr/share/crash/dump/* /opt/usr/share/crash/temp/*"
```

The responses with verified effect remain **use the TV profile** or **launch apps
directly without the home screen**.

---

### Platform Image Composition

**Standard Tizen Platform Includes:**
```
tizen-10.0-x86_64/
├── emulator-resources/
│   ├── skins/tizen-general-3btn/
│   │   └── layout.xml (Enlightenment)
│   ├── system/bin/
│   │   └── enlightenment (WM binary)
│   └── system/lib/
│       └── libecore.so (Enlightenment libraries)
├── emulimg-10.0.x86_64 (bootable image)
└── emulator.conf
    ├── [DESKTOP]
    │   launcher = enlightenment
    └── [BUXTON]
        manager = enabled
```

**TV Profile Platform Includes:**
```
tv-samsung-10.0-x86_64/
├── emulator-resources/
│   ├── skins/tv-1920x1080/
│   │   └── layout.xml (TV launcher)
│   └── system/bin/
│       └── tv-launcher (TV binary, no Enlightenment)
├── emulimg-10.0.x86_64 (bootable image)
└── emulator.conf
    ├── [DISPLAY]
    │   launcher = tv-launcher
    └── [SETTINGS]
        manager = simple  # No BUXTON
```

These are **different SDK packages** installed separately:
```bash
# Standard Tizen
tizen-emulator-manager-resources (includes Enlightenment)

# TV
tv-samsung-emulator-manager-resources (excludes Enlightenment)
```

---

### dlog Evidence

**Standard Tizen on WSL — dlog Output:**
```
E/BUXTON  (1234): sqlite.c: set_sqlite_related_file_perms(183) > Failed to set permissions for /etc/buxton2/user.db
E/BUXTON  (1234): sqlite.c: set_sqlite_related_file_perms(183) > Failed to set permissions for /var/lib/buxton2/user.db
E/ENLIGHTENMENT(1256): system.c: Could not set up configuration database
```

The error shows BUXTON is being invoked and failing at the permission-setting step.

**TV Profile on WSL — dlog Output:**
```
I/TV-LAUNCHER(1234): Initializing display...
I/TV-LAUNCHER(1234): Loading app grid...
I/TV-LAUNCHER(1234): Ready for input...
```

No BUXTON, no permission errors, no Enlightenment.

---

## Troubleshooting

### Symptom: "Error: Failed to start this VM"

**Check 1: KVM Disabled in VM Profile**

> The plugin's launch actions auto-heal this case: when the profile says
> `<hwVirtualization>false</hwVirtualization>` but `/dev/kvm` is usable, the
> launch runs `em-cli modify -n <vm-name> -w yes` itself before booting the VM
> (reported as an `HW_VIRT_AUTOFIX` warning). The manual fix below is only
> needed when launching outside the plugin, or when `/dev/kvm` is still not
> accessible (fix the host first — kvm group, `.wslconfig`).

```bash
# View configuration
cat ~/tizen-sdk-data/emulator/vms/<vm-name>/vm_config.xml | grep hwVirtualization
# Should show: <hwVirtualization>true</hwVirtualization>

# Fix if false:
em-cli modify -n <vm-name> -w yes
```

**Check 2: .wslconfig Not Set**

Ensure `nestedVirtualization = true` is in `.wslconfig` as shown above.

### Symptom: "BUXTON permission errors in dlog"

```bash
# After emulator boots, check dlog:
sdb -s emulator-26101 dlog -d -t 20 | grep -i buxton
```

Example error:
```
E/BUXTON: sqlite.c: set_sqlite_related_file_perms(183) > Failed to set permissions for /etc/buxton2/user.db
```

**This is a known WSL limitation with the home screen app (`org.tizen.homescreen`).** (The Enlightenment compositor itself and user-installed apps launch and render fine — app development works without the home screen.)

#### Built-in Auto-Detection and Auto-Fix (WSL) — shipped in the plugin

The emulator launch flow (`tizen-emulator-manager.sh` → `emulator.js`) handles this
automatically on WSL. After the emulator connects to sdb it:

1. **Detects** — polls up to 30s for crash dumps
   (`org.tizen.homescreen_*` under `/opt/usr/share/crash/dump`) and for the EGL
   failure in dlog. Either signal is enough.
2. **Stops the retry loop** — masks starter's user units (the mask persists across a
   guest reboot), stops them **in the running session** too (see below), and deletes
   the accumulated crash dumps to reclaim `/opt`. This is the part that removes the
   "Unable to launch" popup.
3. **Starts the home screen** — execs the app binary directly, bypassing launchpad,
   then polls up to 20s to confirm it stayed up.
4. **Reports** — `homescreen_fix: ok | fixed | popup_fixed | fix_failed` in the launch
   result. The field is absent when the check does not apply.

> **Why masking alone is not enough:** `systemctl --global mask` does not stop
> already-loaded units, and `pkill starter` alone is useless — systemd restarts it
> within seconds and the crash loop resumes (measured: dumps kept accumulating and a
> launchpad-spawned home screen reappeared). `systemctl --user` cannot be reached as
> root (`Cannot access user instance remotely`, and the user bus rejects root with
> EPERM), so the stop has to run **as the session user via `su`, on its user bus**.
> `starter.path` must be stopped too or it reactivates the service.

**This applies only to the standard `tizen` emulator profile on WSL.** Real devices,
TV/wearable images and non-WSL hosts are left completely untouched, with no status
line emitted at all.

To apply it to an already-running emulator (no relaunch needed):

```bash
node <plugin>/lib/cli/emulator-manager-cli.js fix-homescreen [--vm-name <name>]
```

> ⚠️ **Two caveats on `fixed`:** the home screen then runs as **root** rather than the
> session user (behaviour depending on the user session may differ), and it **does not
> survive a guest reboot** — the launch flow re-applies it every time. Restore stock
> behaviour with
> `sdb -s <serial> shell "systemctl --global unmask starter.service starter.path"`
> followed by a guest reboot.

Tuning via environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `TIZEN_HOMESCREEN_CHECK` | `auto` | `auto` = WSL + tizen emulator only, `force` = anywhere (unverified), `off` = never |
| `TIZEN_HOMESCREEN_LAUNCH` | `1` | `0` = stop the retry loop only, leave the display empty |
| `TIZEN_HOMESCREEN_MASK_STARTER` | `1` | `0` = leave starter alone |
| `TIZEN_HOMESCREEN_CHECK_TIMEOUT` | `30` | Seconds to poll for the crash signature after connect |
| `TIZEN_HOMESCREEN_VERIFY_DELAY` | `20` | Seconds to poll for the home screen after starting it |

**Migrating from the retired `TIZEN_BUXTON_*`**

`TIZEN_BUXTON_CHECK` / `_AUTOFIX` / `_CHECK_TIMEOUT` / `_VERIFY_DELAY` and the
`buxton_check` result field are gone. They are **not silently ignored**, though:
this hook touches the guest more than the old buxton probe did (it masks starter
and restarts the home screen), so an opt-out must not come back to life on upgrade.

| Old setting | What happens now |
|---|---|
| `TIZEN_BUXTON_CHECK=off` | Warns, then **disables the check** (same as `TIZEN_HOMESCREEN_CHECK=off`) |
| `TIZEN_BUXTON_AUTOFIX=0` | Warns, then treated as **report-only** (`_LAUNCH=0`, `_MASK_STARTER=0`) |
| Any other `TIZEN_BUXTON_*` | Warns and is ignored |
| `buxton_check` result field | Replaced by `homescreen_fix` (different values too — parsers must be updated) |

An explicit `TIZEN_HOMESCREEN_*` value always wins over the legacy one.

If `fix_failed` is reported, use the manual solutions below.

**Solution 1: Switch to TV Profile (Recommended)**
```bash
em-cli delete -n <vm-name>
em-cli create -n <vm-name> -P <platform> -T "HD1080" -p tv -w yes
```

**Solution 2: Keep Tizen Profile but Skip Home Screen**
1. Disable Enlightenment autostart
2. Use `app_launcher` to launch your app directly:
   ```bash
   sdb -s emulator-26101 shell app_launcher -S "org.example.myapp"
   ```

**Solution 3: Manually Fix BUXTON Permissions (ineffective — diagnostic only)**

⚠️ **Field-verified: this does NOT bring the home screen back.** It is only useful
for reproducing the investigation by hand. **The plugin's auto-fix no longer runs
these commands** — it stops starter and starts the home screen directly instead
(see [Built-in Auto-Detection and Auto-Fix](#built-in-auto-detection-and-auto-fix-wsl--shipped-in-the-plugin)).

```bash
sdb -s emulator-26101 root on
sdb -s emulator-26101 shell "chmod 777 /etc/buxton2 /var/lib/buxton2 2>/dev/null || true"
# Tizen 10 images have no enlightenment.service — fall back to relaunching the home screen app
sdb -s emulator-26101 shell "systemctl restart enlightenment || app_launcher -s org.tizen.homescreen" || true
```

**What is actually observed:**

- The `chmod` itself succeeds, and in some runs the BUXTON errors stop appearing
  in dlog.
- **`org.tizen.homescreen` still does not come up.**
- Rebooting the guest reverts the permissions.

So chmod erases one visible symptom without touching what kills the home screen.
**The BUXTON errors are a consequence of the home screen crashing, not its
cause** — see [The actual cause](#the-actual-cause--the-flutter-home-screen-fails-egl-config-selection-verified).

To see the real cause, look at the crash dumps rather than the BUXTON tag:

```bash
sdb -s emulator-26101 shell "ls /opt/usr/share/crash/dump | wc -l"   # thousands = crash loop
sdb -s emulator-26101 shell "dlogutil -d | grep -aiE 'EGL|Flutter|app_create_cb'" | tail -20
```

Full procedure in [Diagnosing a home screen that will not start](#diagnosing-a-home-screen-that-will-not-start).

---

**Practical outcome:**

| Scenario | Result |
|---|---|
| chmod 777 + home screen restart | ✗ home screen not restored |
| BUXTON errors in dlog | may disappear, but they are a byproduct anyway |
| After a guest reboot | ✗ permissions revert, back to square one |
| `em-cli modify -g no` (disable HW GL) | ✗ EGL error returns, boot only gets slower |
| Force host GL to llvmpipe | ✗ EGL error returns |
| Clearing crash dumps (reclaiming `/opt`) | △ fixes the collateral damage only |
| Installing/launching/debugging apps without the home screen | ✓ works |
| TV profile | ✓ works |

---

**Recommendation:**

- **You need the home screen UI** → TV profile (Solution 1). The only approach
  with verified effect on WSL.
- **You only need to build and test apps** → keep the standard `tizen` profile
  and launch with `app_launcher` without the home screen (Solution 2). Install,
  launch and debug are unaffected by the home screen.
- **CI/automation** → TV profile (no manual intervention).
- **You want the home screen but on the standard profile** → leave the plugin's
  auto-fix on (the default on WSL): it stops the retry loop and popup and starts
  the home screen directly. For an already-running emulator use
  `emulator-manager --action fix-homescreen`. Keep in mind the home screen then
  runs as root and does not survive a guest reboot.
- **Check `/opt` if a standard-profile VM has been up for a while.** The home
  screen crash loop piles up core dumps until the partition is full, at which
  point app installs, settings writes and everything else start failing too.
  Check with `sdb shell df -h /opt` and reclaim with
  `rm -rf /opt/usr/share/crash/dump/*`.

### Symptom: Low Performance / Lag

**Check VM Resources:**
```bash
em-cli list-vm -n <vm-name> -d
```

**Recommendations for WSL:**
- RAM: 768 MiB minimum (1024 MiB for smooth performance)
- vCPU: 2–4 cores (check `cat /proc/cpuinfo`)
- Disable hardware GL acceleration if laggy:
  ```bash
  em-cli modify -n <vm-name> -g no
  ```

### Symptom: sdb Connection Timeout (>300s)

1. Ensure emulator has fully booted:
   ```bash
   # Monitor boot progress via:
   tail -f ~/tizen-sdk-data/emulator/vms/<vm-name>/logs/emulator.log
   ```

2. Check host system load (Windows Task Manager: Resource Monitor)

3. Try increasing the wait timeout:
   ```bash
   # In tizen-cli or direct em-cli call:
   em-cli launch -n <vm-name> -t 600  # 10 minutes instead of 5
   ```

## Performance Tips

### WSL-Specific Optimizations

1. **Disable Unused Graphics** (if testing non-visual services):
   ```bash
   em-cli modify -n <vm-name> -g no
   ```

2. **Shared File System** (slow in WSL):
   - Avoid mounting Windows paths inside the VM
   - Use `sdb push` / `sdb pull` instead for file transfer

3. **CPU Virtualization**:
   - Always enable: `em-cli modify -n <vm-name> -w yes`
   - Disable only if explicitly required for testing

4. **Memory Allocation**:
   - Start with 768 MiB, increase to 1024 MiB if laggy
   ```bash
   em-cli modify -n <vm-name> -r 1024
   ```

## Emulator Platform Selection

List available platforms:
```bash
em-cli list-platform -P tizen -d  # Standard Tizen
em-cli list-platform -P tv -d     # TV profiles
```

Naming convention: `{profile}-{version}-{arch}`
Example: `tizen-10.0-x86_64`, `tv-samsung-10.0-x86_64`

## Debugging Emulator Launch Failures

The `tizen-emulator-manager.sh` script emits structured diagnostics (LAUNCH_DIAG lines) on failure:

```bash
# Captured in error output:
LAUNCH_DIAG=phase|launch_failed
LAUNCH_DIAG=wsl|yes
LAUNCH_DIAG=hw_virtualization|false
LAUNCH_DIAG=kvm|present
LAUNCH_DIAG=kvm_writable|yes
LAUNCH_DIAG=java_jna|failed
```

**Key fields for WSL:**
- `wsl|yes` — detected WSL environment
- `hw_virtualization|{true|false}` — VM profile setting
- `kvm|present|missing` — host kernel support
- `kvm_writable|yes|no` — permission issue
- `java_jna|failed` — em-cli itself crashed inside its Java runtime (e.g.
  `NoClassDefFoundError: com/sun/jna/Native`) before touching the VM. This is a
  host problem, not a VM problem — the KVM/library layers above don't apply.
  Reinstall the emulator package (`download-emulator-package`) and verify the
  SDK's bundled JRE. `--doctor` probes em-cli health (`em-cli list-vm`) up front.

All diagnostics are automatically included in error messages from `tizen-cli` or the
CLI runner. The failure envelope's `errors[0].details` also carries the untouched tail
of the script's stdout+stderr as `raw: ...` lines, so the original em-cli/Java error
reaches remote (MCP) clients that cannot read temp files on the SDK host.

## Further Reading

- [Tizen Emulator Official Docs](https://docs.tizen.org/application/tizen-studio/setup/emulator/)
- [WSL Nested Virtualization (Microsoft Docs)](https://learn.microsoft.com/en-us/windows/wsl/nested-virtualization)
- [Tizen TV Development Guide](https://docs.tizen.org/application/tizen-studio/develop/tv-app)
