# Screenshot: enlightenment_info Fallback and Image in the Response

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-08-02  
**License:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**Target:** `common/` (scripts/tizen-screenshot, lib/core, skills)  
**Verified on:** `emulator-26101` (`tizen-vm-default`), against live hardware

---

## Overview

Two pieces of work:

1. **Added `enlightenment_info` as a capture method** — device-side capture through the Tizen window manager
2. **Put the image in the response** — the envelope returned only a path; it now carries the capture itself plus metadata

Live verification exposed **three defects** in the initial implementation, all since fixed. This document includes that record.

---

## 1. enlightenment_info capture

### Why it is needed

The emulator used for verification ships **none** of the existing device-side tools:

```
$ ls -l /usr/bin/screencapture /usr/bin/capture_screen
ls: cannot access '/usr/bin/screencapture': No such file or directory
ls: cannot access '/usr/bin/capture_screen': No such file or directory
```

Enlightenment is the Tizen window manager, so it works on platform images like this one. Unlike `/dev/fb0` it returns the **composited screen** — the framebuffer frequently yields only the kernel console.

### Three defects found during live verification

The initial implementation used the `-dump_topvwins` spelling commonly seen in documentation. All three assumptions behind it were wrong.

#### (1) The option does not exist

```
$ enlightenment_info -dump_topvwins /tmp/e_probe
unknown option: -dump_topvwins
exit=0
```

The correct spelling has a **space**: `-dump topvwins <DIR>`. The tool's own help says so:

```
enlightenment_info -dump [Option..] [DIR]
	topvwins     : Dump buffer commit on top visible clients
```

And there is a separate option better suited to screenshots:

```
enlightenment_info -dump_screen   winfo -dump_screen -p /tmp/ -n xxx.png   :make dump /tmp/xxx.png
```

#### (2) The exit code cannot be trusted

As above, an unknown option still returns **`exit=0`**. Judging success by the exit status turns a failure into a false success. Success must be judged by **whether the file was produced**.

#### (3) It requires root

```
$ ls -l /usr/bin/enlightenment_info
-r-xr-x--- 1 root root 178048 /usr/bin/enlightenment_info

$ id
uid=5001(owner) gid=100(users) ... context="User::Shell"
→ Permission denied
```

The default sdb user is `owner` (uid 5001) and cannot execute it. `sdb root on` is required, and the previous mode is **restored afterwards**.

### Implementation

`try_enlightenment_info()` tries two forms in order.

**Form 1 — `-dump_screen` (preferred)**

```bash
enlightenment_info -dump_screen -p /tmp/ -n <name>.png
```

One file, full screen, at an exact path. `-p` is the directory, `-n` the filename.

**Form 2 — `-dump topvwins <DIR>` (for older images)**

Produces one PNG per top visible window. Note that it creates **its own timestamped subdirectory** inside the directory you give it:

```
directory: /tmp/e_probe/topvwins-20260803.104653
/tmp/e_probe/topvwins-20260803.104653/0x56281fb57d30_0.png SAVED   ← 1099839 bytes (full screen)
/tmp/e_probe/topvwins-20260803.104653/0x56281fb3c740_0.png SAVED   ←    4847 bytes
/tmp/e_probe/topvwins-20260803.104653/0x56281f9edad0_0.png SAVED   ←    2759 bytes
/tmp/e_probe/topvwins-20260803.104653/0x56281fc1f510_0.png SAVED   ←     147 bytes
```

So the PNG search must **recurse**, and the full screen is the **largest** file.

When `sdb root on` is refused the function returns `1` immediately and the chain continues. Retail devices take that path, so their behavior is unchanged.

### Fallback reordering

The method was first placed after the existing capture tools, ahead of the framebuffer. On emulators, however, **xwd succeeded first and `enlightenment_info` never ran** — the addition was dead code.

Capturing the same frame both ways:

| | host-side xwd | enlightenment_info |
|---|---|---|
| Resolution | 960×581 (downscaled) | **1920×1080** (native) |
| Window chrome | `tizen-vm-default` title bar and borders baked in | none |
| Control panel | removed by a stitching heuristic, seams remain | not applicable |
| Host dependencies | xwd, xwininfo, python3+PIL | none |

The quality gap is unambiguous, so it was **moved to first in both chains**:

```
Emulator: enlightenment_info → xwd → screencapture → capture_screen → fb0
Device:   enlightenment_info → fb0 → screencapture → capture_screen → xwd
```

Because it skips when root is unavailable, **it only takes precedence where it actually works.** Everywhere else the previous order applies.

---

## 2. Image in the response

The envelope previously returned only `output_path`, so the caller could not see the screenshot without opening the file separately.

### New fields

```json
"image": {
  "path": "/abs/path/shot.png",
  "size_bytes": 1102917,
  "mime_type": "image/png",
  "width": 1920,
  "height": 1080,
  "base64_omitted_reason": "Image is 1077 KB, over the 512 KB inline limit. Open ... to view it."
},
"capture_method": "enlightenment_info -dump_screen"
```

- **`base64`** — inlined only at or below 512 KB. Past that, `base64_omitted_reason` appears instead, so the field's absence reads as **a size decision, not a capture failure**.
- **`mime_type`** — detected from magic numbers (PNG/JPEG)
- **`width`/`height`** — parsed directly from the PNG IHDR chunk
- **`capture_method`** — which fallback won. An image from `/dev/fb0` may be the kernel console rather than the app UI, so the caller needs the provenance to judge whether to trust it.

### On the 512 KB limit

A 1920×1080 capture is roughly 1.1 MB, so in practice **base64 is essentially always omitted** and only the path remains.

Raising the limit is not the answer: base64-encoding 1.1 MB produces about 1.5 MB of text, which would swamp an envelope that is read as text. A downscaled thumbnail was considered but adds a host-side PIL dependency, so the **current behavior was kept**.

For any caller that can read files, `image.path` is sufficient.

---

## Usage

### tizen-cli

```bash
tizen-cli tizen-sdk screenshot --serial emulator-26101 --output ./shot.png
```

| Option | Description |
|---|---|
| `--serial <serial>` | omit to auto-select (when a single device is attached) |
| `--output <path>` | defaults to `./emulator_screenshot.png` |

**There is no option to force a capture method.** The fallback chain chooses, and `capture_method` reports the result.

### Script directly

```bash
bash <plugin>/scripts/tizen-screenshot/tizen-screenshot.sh emulator-26101 ./shot.png
```

### CLI runner

```bash
node <plugin>/lib/cli/screenshot-cli.js emulator-26101 ./shot.png
```

### Manual sdb (for reference)

```bash
sdb -s emulator-26101 root on
sdb -s emulator-26101 shell "enlightenment_info -dump_screen -p /tmp/ -n shot.png"
sdb -s emulator-26101 pull /tmp/shot.png ./shot.png
sdb -s emulator-26101 shell "rm -f /tmp/shot.png"
sdb -s emulator-26101 root off
```

---

## Verification

Against live `emulator-26101` (`tizen-vm-default`):

```
pre  uid: 5001
Detected: emulator target — after enlightenment_info, host-side xwd is preferred ...
Trying: device-side enlightenment_info...
SUCCESS: enlightenment_info -dump_screen
post uid: 5001          ← root mode restored

capture_method : enlightenment_info -dump_screen
dims           : 1920x1080
size           : 1102917 bytes
base64         : omitted (over limit)
```

Confirmed:

- 1920×1080 capture via `-dump_screen`, image inspected visually
- root elevated, then uid 5001 **restored**
- `enlightenment_info` selected first across the full chain
- same result through the tizen-cli command path
- envelope `capture_method`, dimensions, size and omission reason all correct

---

## Note on updating tizen-cli

`tizen-cli` runs a **copy under `~/.tizen/plugins/`**, not the repository's `dist/`. `pnpm build` alone does not reach it.

`plugin install` also refuses to overwrite an existing installation:

```
PLUGIN_ALREADY_INSTALLED: Plugin "tizen-sdk-skills" is already installed. Uninstall it first.
```

So the procedure after a code change is:

```bash
cd <repo>/tizen-cli
pnpm build
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install <repo>/tizen-cli/dist
```

Skip it and **the old plugin runs silently**. That happened during this verification: the command returned an xwd capture with no `capture_method` field at all.

The plugin cache (CLI runners and skill paths) is separate and is synchronized by the setup script:

```bash
bash <repo>/cline/setup/setup.sh
```

---

## Changed Files

| File | Change |
|------|--------|
| `scripts/tizen-screenshot/tizen-screenshot.sh` | added `try_enlightenment_info()`, moved to first in the chain, corrected the detection log |
| `scripts/tizen-screenshot/tizen-screenshot.ps1` | same (Windows) |
| `lib/core/screenshot.js` | `image` block, `capture_method`, MIME/IHDR parsing, 512 KB limit |
| `lib/core/sdb-helper.js` | enlightenment_info added to the fallback chain |
| `lib/tests/sdb-helper.test.js` | asserts 4 fallbacks and that the bogus `-dump_topvwins` spelling is not used |
| `skills/tizen-screenshot/SKILL.md` | both chain tables, image-in-response contract |

6 files, +345 / -23

---

## Related

- [Build Failure Diagnostics Improvement](build-failure-diagnostics.en.md)
- [sdb-helper Placeholder Substitution Fix](sdb-helper-placeholder-substitution.en.md)
- [Hook git-route Rejection Fix](hook-git-route-fix.en.md)
