# TV emulator launch conf for Apple Silicon Macs

English | [한국어](vm-launch-tv-v2.ko.md)

`vm-launch-tv-v2.conf.template` is a launch conf template for booting a **TV emulator
(`tv-samsung` profile, Tizen 10.0, emulator-v2 stack) with TCG software emulation** on an
Apple Silicon (ARM64) Mac. The
[`tizen-launch-emulator` skill](../../skills/tizen-launch-emulator/SKILL.md#apple-silicon-arm64-macs-tv-emulator-launch)
uses it. This file describes the same procedure in more detail.

## Why em-cli is bypassed

For image version 3.0 and later, em-cli's `checkVTProperty` (in `em-lib.jar`) throws
`CPUVT.Invalid` on macOS whenever `isVTSupported()` is false, that is, whenever HAXM is
missing. HAXM is Intel-only, so Apple Silicon never has it, and `hwVirtualization=false` in
the VM config does not bypass the check. The SDK's emulator-v2 binary (QEMU 9.x with VirGL)
is therefore started directly with `--conf`. The template comes from an em-cli-generated conf
that booted successfully.

## Placeholders

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `__VM_NAME__` | VM name, also used in the image and log file names | `TV-1080` |
| `__SDK_PATH__` | Tizen SDK path (named in `~/.tizen.sdk.path.config`) | `/Users/<u>/tizen-sdk` |
| `__SDK_DATA_PATH__` | Tizen SDK data path | `/Users/<u>/tizen-sdk-data` |

In the commands below, `<SDK_PATH>`, `<SDK_DATA_PATH>` and `<VM>` are the same values, and
`<VM_DIR>` is `<SDK_DATA_PATH>/emulator/vms/<VM>`. Resolve every placeholder to the real path
before you run or show a command.

## Procedure

Create the VM with em-cli first, without `--launch` (`tizen-create-emulator`). em-cli then
creates the VM folder, the swap image and `tuner_default.cfg`, so steps 3 and 4 are only
needed when one of those files is missing.

1. **Generate the conf.** Write it to `vm_launch-v2.conf` and leave em-cli's own
   `vm_launch.conf` unchanged:

   ```bash
   mkdir -p "<VM_DIR>/logs"
   sed -e "s/__VM_NAME__/<VM>/g" \
       -e "s|__SDK_PATH__|<SDK_PATH>|g" \
       -e "s|__SDK_DATA_PATH__|<SDK_DATA_PATH>|g" \
       vm-launch-tv-v2.conf.template > "<VM_DIR>/vm_launch-v2.conf"
   ```

2. **Child disk image.** Boot from the base image under `emulator-images-v2/`, not the v1
   `emulator-images/` one. **This replaces the VM's disk with an empty one**, so apps and data
   installed in that VM are lost. A VM you just created has nothing to lose. For an existing
   VM, ask the user before running it.

   ```bash
   "<SDK_PATH>/tools/emulator/bin/qemu-img" create -f qcow2 \
     -b "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-images-v2/tv-samsung-10.0-x86_64/emulimg-10.0.x86_64" \
     -F qcow2 "<VM_DIR>/emulimg-<VM>.x86_64"
   ```

3. **Swap image** (raw), only if `<VM_DIR>/swap-<VM>.img` is missing:

   ```bash
   "<SDK_PATH>/tools/emulator/bin/qemu-img" create -f raw "<VM_DIR>/swap-<VM>.img" 512M
   ```

4. **Tuner table**, only if `<VM_DIR>/tuner_default.cfg` is missing. The `maru-virtual-tuner`
   device reads it, and QEMU fails to start without it. Copy the template that ships with the
   platform:

   ```bash
   cp "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-resources/tuner-template/tuner_default_template.cfg" \
     "<VM_DIR>/tuner_default.cfg"
   ```

5. **Gatekeeper quarantine (only when needed, and only with the user's consent).** After a
   fresh SDK or ZIP install, the emulator-v2 binaries can still carry macOS's download
   quarantine, and the launch dies with `zsh: killed` or
   `library load disallowed by system policy`. Check first:

   ```bash
   xattr -l "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2/bin/emulator-x86_64.bin"
   ```

   If it lists `com.apple.quarantine`, explain to the user that clearing it removes a macOS
   security flag from the SDK's `emulator-v2` folder. Run this only after the user agrees:

   ```bash
   chmod -R u+w "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2"
   xattr -dr com.apple.quarantine "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2"
   ```

6. **Launch.** `emulator-x86_64` is a universal binary, and its wrapper re-executes the arm64
   slice natively on Apple Silicon, so there is no double emulation under Rosetta.

   ```bash
   nohup "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2/bin/emulator-x86_64" \
     --conf "<VM_DIR>/vm_launch-v2.conf" > "<VM_DIR>/logs/qemu-v2.log" 2>&1 &
   ```

7. **Check the boot.** With TCG, booting takes 1–2 minutes. The guest is up when
   `tizen-device-manager` lists an `emulator-NNNNN` device for `<VM>` (by hand:
   `<SDK_PATH>/tools/sdb devices`). The guest kernel log
   is written to `<VM_DIR>/logs/emulator.klog`, and the QEMU output to
   `<VM_DIR>/logs/qemu-v2.log`.

## Using another Tizen version

These template values are for **Tizen 10.0**. Check and replace each of them for another
version:

- the `platforms/tizen-10.0/tv-samsung/...` paths (change to `tizen-<X.Y>`)
- `image_ver=10.0.6` and `platform_version=tizen-10.0`
- the base image folder `emulator-images-v2/tv-samsung-10.0-x86_64`
- whether the `skins/tv-1920x1080` skin exists
- `model=4ksero` (the TV model name) in `append`

If `platforms/tizen-<X.Y>/tv-samsung/emulator-v2/` does not exist, this path is not available
for that version.

These options are required on Apple Silicon: `-accel tcg,thread=multi`, `-cpu max`,
`-display sdl,gl=on`, `-device virtio-vga-gl`, and `force_pat` in `append`. Without
`-cpu max`, the default `qemu64` CPU model lacks instructions that current glibc uses, and the
guest kernel panics with "invalid opcode".
