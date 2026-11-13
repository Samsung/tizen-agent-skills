// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Tests for the Apple Silicon TV launch (tv_v2_* in tizen-emulator-manager.sh)
 * and the TV_V2_* parsing in lib/core/emulator.js.
 *
 * em-cli cannot boot a tv-samsung VM on an ARM Mac (it requires HAXM), so the
 * script boots it with the platform's emulator-v2 and a generated --conf. These
 * tests RUN the script against a throwaway SDK tree with stub em-cli, sdb,
 * qemu-img and emulator-x86_64. TIZEN_TV_V2_LAUNCH=force takes the v2 path on
 * any host, so the tests do not need an Apple Silicon Mac.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const {
  TV_V2_CONSENT,
  parseTvV2Needs,
  tvV2ConsentRequest,
  tvV2LaunchWarnings,
  buildEmulatorArgs,
} = require("../core/emulator");

console.log("=== Emulator TV emulator-v2 Launch Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  if (!condition) {
    failures++;
    console.log(`FAIL ${name}`);
    if (details) console.log(`     ${details}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------
console.log("--- TV_V2 parsing ---");
{
  const out = [
    "[ERROR] quarantine",
    "TV_V2_NEEDS=clear_quarantine",
    "TV_V2_NEEDS=rebase_disk",
    "TV_V2_NEEDS=unknown_key",
  ].join("\n");
  const needs = parseTvV2Needs(out);
  check(
    "parseTvV2Needs keeps the known keys in order and drops unknown ones",
    needs.length === 2 &&
      needs[0] === "clear_quarantine" &&
      needs[1] === "rebase_disk",
    JSON.stringify(needs),
  );
  const ask = tvV2ConsentRequest(
    needs,
    "node emulator-manager-cli.js launch --vm-name tv",
  );
  check(
    "consent command re-runs the launch with both flags",
    ask.command ===
      "node emulator-manager-cli.js launch --vm-name tv --clear-quarantine --rebase-disk",
    ask.command,
  );
  check(
    "consent message says nothing was changed and names the data loss",
    /Nothing was changed/.test(ask.message) && /DISCARDS/.test(ask.message),
    ask.message,
  );
  check(
    "every consent key has a runner flag",
    Object.values(TV_V2_CONSENT).every((c) => /^--[a-z-]+$/.test(c.flag)),
  );

  check(
    "no warnings without TV_V2_LAUNCH",
    tvV2LaunchWarnings("TV_V2_DISK_REBASED=tv").length === 0,
  );
  const w = tvV2LaunchWarnings(
    "TV_V2_DISK_REBASED=tv\nTV_V2_QUARANTINE_CLEARED=1\nTV_V2_LAUNCH=tv\n",
  );
  check(
    "launch warnings cover the v2 launch, the rebased disk and the cleared quarantine",
    w.length === 3 &&
      /HAXM/.test(w[0]) &&
      /recreated/.test(w[1]) &&
      /quarantine/.test(w[2]),
    JSON.stringify(w),
  );

  const argsOf = (opts) => {
    const built = buildEmulatorArgs({
      action: "launch",
      vmName: "tv",
      ...opts,
    });
    return JSON.stringify(built);
  };
  check(
    "consent flags map to -Q / -B only when set",
    argsOf({ clearQuarantine: true, rebaseDisk: true }).includes('"-Q"') &&
      argsOf({ clearQuarantine: true, rebaseDisk: true }).includes('"-B"') &&
      !argsOf({}).includes('"-Q"') &&
      !argsOf({}).includes('"-B"'),
    argsOf({ clearQuarantine: true, rebaseDisk: true }),
  );
}

// ---------------------------------------------------------------------------
// Behaviour: run the real script against stubs
// ---------------------------------------------------------------------------
if (process.platform === "win32") {
  console.log(
    "\nSKIP script tests on win32 (the emulator-v2 path is macOS-only)",
  );
  finish();
}

const SCRIPT_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "scripts",
  "tizen-emulator-manager",
  "tizen-emulator-manager.sh",
);

const STUB_EM_CLI = `#!/usr/bin/env bash
printf 'em-cli %s\\n' "$*" >> "$STUB_LOG"
case "\${1:-}" in
  list-vm) echo "tv            stopped" ;;
  launch) echo "em-cli launch must not run on the emulator-v2 path"; touch "$STUB_STATE/emcli_launch" ;;
esac
exit 0
`;

// Reports the VM only once the stub emulator-v2 recorded its start.
const STUB_SDB = `#!/usr/bin/env bash
case "\${1:-}" in
  devices)
    echo "List of devices attached"
    [ -f "$STUB_STATE/launched" ] && printf 'emulator-26101\\tdevice\\ttv\\n'
    ;;
esac
exit 0
`;

// qemu-img: "info" reports the backing file recorded by "create"; a disk not
// created by this stub reports the em-cli v1 base.
const STUB_QEMU_IMG = `#!/usr/bin/env bash
printf 'qemu-img %s\\n' "$*" >> "$STUB_LOG"
case "\${1:-}" in
  info)
    for a; do disk="$a"; done
    if [ -f "$disk.backing" ]; then echo "backing file: $(cat "$disk.backing")"
    else echo "backing file: /sdk/platforms/tizen-10.0/tv-samsung/emulator-images/v1/emulimg-v1.x86_64"; fi
    ;;
  create)
    back=""; out=""
    while [ $# -gt 0 ]; do
      case "$1" in -b) back="$2"; shift ;; -f|-F) shift ;; create) ;; *) [ -z "$out" ] && out="$1" ;; esac
      shift
    done
    : > "$out"; [ -n "$back" ] && printf '%s' "$back" > "$out.backing"
    ;;
esac
exit 0
`;

// emulator-v2: records its --conf and stays up (STUB_V2_DIES=1 exits at once).
const STUB_V2 = `#!/usr/bin/env bash
printf 'emulator-v2 %s\\n' "$*" >> "$STUB_LOG"
if [ "\${STUB_V2_DIES:-0}" = "1" ]; then echo "qemu: could not load the VirGL renderer"; exit 1; fi
touch "$STUB_STATE/launched"
sleep 20
`;

function makeTree({ quarantine = false, v1Disk = false, withV2 = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-tv-v2-test-"));
  const sdk = path.join(root, "sdk");
  const home = path.join(root, "home");
  const emBin = path.join(sdk, "tools", "emulator", "bin");
  fs.mkdirSync(emBin, { recursive: true });
  fs.writeFileSync(path.join(emBin, "em-cli"), STUB_EM_CLI, { mode: 0o755 });
  fs.writeFileSync(path.join(emBin, "qemu-img"), STUB_QEMU_IMG, {
    mode: 0o755,
  });
  fs.writeFileSync(path.join(sdk, "tools", "sdb"), STUB_SDB, { mode: 0o755 });

  const tv = path.join(sdk, "platforms", "tizen-10.0", "tv-samsung");
  const v2 = path.join(tv, "emulator-v2");
  if (withV2) {
    fs.mkdirSync(path.join(v2, "bin"), { recursive: true });
    // Stored without the execute bit, as the TV SDK ZIP does.
    fs.writeFileSync(path.join(v2, "bin", "emulator-x86_64"), STUB_V2, {
      mode: 0o644,
    });
    fs.writeFileSync(path.join(v2, "bin", "emulator-x86_64.bin"), "", {
      mode: 0o644,
    });
  }
  const baseDir = path.join(tv, "emulator-images-v2", "tv-samsung-10.0-x86_64");
  fs.mkdirSync(baseDir, { recursive: true });
  const base = path.join(baseDir, "emulimg-10.0.x86_64");
  fs.writeFileSync(base, "");
  const tunerDir = path.join(tv, "emulator-resources", "tuner-template");
  fs.mkdirSync(tunerDir, { recursive: true });
  fs.writeFileSync(
    path.join(tunerDir, "tuner_default_template.cfg"),
    "tuner\n",
  );

  const vmDir = path.join(home, "tizen-sdk-data", "emulator", "vms", "tv");
  fs.mkdirSync(vmDir, { recursive: true });
  fs.writeFileSync(
    path.join(vmDir, "vm_launch.conf"),
    [
      "[[Emulator]]",
      `studio_path="${sdk}"`,
      "profile=tv-samsung",
      "platform_version=tizen-10.0",
      "display_resolution=3840x1080",
      `skin_path=${tv}/emulator-resources/skins/tv-3840x1080`,
      "ram=2048",
      "",
    ].join("\n"),
  );
  if (v1Disk) fs.writeFileSync(path.join(vmDir, "emulimg-tv.x86_64"), "");

  if (quarantine && withV2) {
    spawnSync("xattr", [
      "-w",
      "com.apple.quarantine",
      "0081;00000000;test;",
      path.join(v2, "bin", "emulator-x86_64.bin"),
    ]);
  }

  const state = path.join(root, "state");
  fs.mkdirSync(state);
  return {
    root,
    sdk,
    home,
    v2,
    base,
    vmDir,
    state,
    log: path.join(root, "log"),
  };
}

function run(tree, args, env = {}) {
  fs.writeFileSync(tree.log, "");
  const result = spawnSync("bash", [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    timeout: 90000,
    env: {
      ...process.env,
      HOME: tree.home,
      TMPDIR: tree.root,
      TIZEN_SDK_PATH: tree.sdk,
      STUB_LOG: tree.log,
      STUB_STATE: tree.state,
      TIZEN_TV_V2_LAUNCH: "force",
      TIZEN_TV_V2_START_CHECK: "1",
      TIZEN_HOMESCREEN_CHECK: "off",
      TIZEN_SDB_RESTART_RETRY: "0",
      ...env,
    },
  });
  const v2conf = path.join(tree.vmDir, "vm_launch-v2.conf");
  const out = {
    code: typeof result.status === "number" ? result.status : 1,
    output: `${result.stdout || ""}${result.stderr || ""}`,
    stubLog: fs.readFileSync(tree.log, "utf8"),
    state: fs.readdirSync(tree.state),
    v2conf: fs.existsSync(v2conf) ? fs.readFileSync(v2conf, "utf8") : null,
    diskBacking: (() => {
      try {
        return fs.readFileSync(
          path.join(tree.vmDir, "emulimg-tv.x86_64.backing"),
          "utf8",
        );
      } catch {
        return null;
      }
    })(),
    v2Exec: (() => {
      try {
        return (
          (fs.statSync(path.join(tree.v2, "bin", "emulator-x86_64")).mode &
            0o100) !==
          0
        );
      } catch {
        return null;
      }
    })(),
  };
  // Stop the stub emulator-v2 left running by nohup.
  spawnSync("pkill", ["-f", tree.root]);
  return out;
}

const cleanup = (tree) =>
  fs.rmSync(tree.root, { recursive: true, force: true });

const canQuarantine =
  process.platform === "darwin" &&
  spawnSync("xattr", ["-h"]).error === undefined;

// --- 1. An existing VM with a v1 disk: consent needed, nothing changed ------
console.log("\n--- consent gate: rebase_disk ---");
{
  const tree = makeTree({ v1Disk: true });
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "5"]);
  check(
    "launch exits non-zero without consent",
    r.code !== 0,
    `exit=${r.code}`,
  );
  check(
    "TV_V2_NEEDS=rebase_disk is printed",
    /^TV_V2_NEEDS=rebase_disk$/m.test(r.output),
    r.output,
  );
  check("the disk was not recreated", r.diskBacking === null);
  check("no v2 conf was written", r.v2conf === null);
  check("emulator-v2 was not started", !r.stubLog.includes("emulator-v2 "));
  check("em-cli launch was not run", !r.state.includes("emcli_launch"));
  cleanup(tree);
}

// --- 2. With -B: disk rebased, conf generated, emulator-v2 started ---------
console.log("\n--- launch with consent ---");
{
  const tree = makeTree({ v1Disk: true });
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "20", "-B"]);
  check("launch exits 0", r.code === 0, r.output);
  check(
    "disk rebased on the v2 base image",
    r.diskBacking === tree.base,
    String(r.diskBacking),
  );
  check(
    "TV_V2_DISK_REBASED and TV_V2_LAUNCH are printed",
    /^TV_V2_DISK_REBASED=tv$/m.test(r.output) &&
      /^TV_V2_LAUNCH=tv$/m.test(r.output),
    r.output,
  );
  check(
    "DEVICE_SERIAL is reported",
    /^DEVICE_SERIAL=emulator-26101$/m.test(r.output),
    r.output,
  );
  check("em-cli launch was not run", !r.state.includes("emcli_launch"));
  check(
    "emulator-v2 got --conf vm_launch-v2.conf",
    r.stubLog.includes(
      `emulator-v2 --conf ${path.join(tree.vmDir, "vm_launch-v2.conf")}`,
    ),
    r.stubLog,
  );
  check("the execute bit was restored on emulator-x86_64", r.v2Exec === true);
  const conf = r.v2conf || "";
  check(
    "conf has no placeholders left",
    conf.length > 0 && !conf.includes("__"),
    conf.slice(0, 200),
  );
  check(
    "conf takes the VM's resolution",
    /^display_resolution=3840x1080$/m.test(conf),
  );
  check(
    "virtio-vga-gl takes the VM's resolution",
    conf.includes("xres=3840,yres=1080"),
  );
  check("conf takes the VM's RAM", /^ram=2048$/m.test(conf));
  check(
    "conf takes the VM's skin",
    conf.includes("skin_path=") && conf.includes("tv-3840x1080"),
  );
  check("conf keeps -cpu max", conf.includes("-cpu max"));
  check(
    "swap and tuner table were made",
    fs.existsSync(path.join(tree.vmDir, "swap-tv.img")) &&
      fs.existsSync(path.join(tree.vmDir, "tuner_default.cfg")),
  );
  check(
    "JS warnings name the v2 launch and the rebased disk",
    tvV2LaunchWarnings(r.output).length === 2,
    JSON.stringify(tvV2LaunchWarnings(r.output)),
  );
  cleanup(tree);
}

// --- 3. Disk already on the v2 base: no consent needed on a re-launch -------
console.log("\n--- re-launch of a prepared VM ---");
{
  const tree = makeTree();
  // Model a VM already prepared by an earlier launch.
  const disk = path.join(tree.vmDir, "emulimg-tv.x86_64");
  fs.writeFileSync(disk, "");
  fs.writeFileSync(`${disk}.backing`, tree.base);
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "20"]);
  check("launch exits 0 without any flag", r.code === 0, r.output);
  check("no TV_V2_NEEDS line", !/^TV_V2_NEEDS=/m.test(r.output));
  check("disk was not recreated", !/^TV_V2_DISK_REBASED=/m.test(r.output));
  cleanup(tree);
}

// --- 4. emulator-v2 dies at once → TV_V2_EXITED ----------------------------
console.log("\n--- emulator-v2 exits right away ---");
{
  const tree = makeTree({ v1Disk: true });
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "5", "-B"], {
    STUB_V2_DIES: "1",
  });
  check("launch exits non-zero", r.code !== 0);
  check(
    "TV_V2_EXITED=1 is printed",
    /^TV_V2_EXITED=1$/m.test(r.output),
    r.output,
  );
  check(
    "the QEMU log tail is shown",
    r.output.includes("could not load the VirGL renderer"),
    r.output,
  );
  cleanup(tree);
}

// --- 5. No emulator-v2 stack → TV_V2_UNAVAILABLE ---------------------------
console.log("\n--- no emulator-v2 stack ---");
{
  const tree = makeTree({ withV2: false });
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "5"]);
  check("launch exits non-zero", r.code !== 0);
  check(
    "TV_V2_UNAVAILABLE=no_emulator_v2",
    /^TV_V2_UNAVAILABLE=no_emulator_v2$/m.test(r.output),
    r.output,
  );
  check(
    "em-cli launch was not tried as a fallback",
    !r.state.includes("emcli_launch"),
  );
  cleanup(tree);
}

// --- 6. TIZEN_TV_V2_LAUNCH=off keeps em-cli --------------------------------
console.log("\n--- TIZEN_TV_V2_LAUNCH=off ---");
{
  const tree = makeTree({ v1Disk: true });
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "1"], {
    TIZEN_TV_V2_LAUNCH: "off",
  });
  check("em-cli launch is used", r.state.includes("emcli_launch"), r.stubLog);
  check("no TV_V2 lines", !/^TV_V2_/m.test(r.output));
  cleanup(tree);
}

// --- 7. Quarantine (macOS only: needs xattr) --------------------------------
if (canQuarantine) {
  console.log("\n--- consent gate: clear_quarantine ---");
  const tree = makeTree({ quarantine: true });
  const binPath = path.join(tree.v2, "bin", "emulator-x86_64.bin");
  const marked =
    spawnSync("xattr", ["-p", "com.apple.quarantine", binPath]).status === 0;
  if (!marked) {
    console.log(
      "SKIP quarantine tests (could not set the xattr in the temp dir)",
    );
  } else {
    const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "5"]);
    check("launch exits non-zero without consent", r.code !== 0);
    check(
      "TV_V2_NEEDS=clear_quarantine is printed",
      /^TV_V2_NEEDS=clear_quarantine$/m.test(r.output),
      r.output,
    );
    check(
      "a fresh VM disk is not a consent case",
      !/^TV_V2_NEEDS=rebase_disk$/m.test(r.output),
    );
    check(
      "the quarantine is still there",
      spawnSync("xattr", ["-p", "com.apple.quarantine", binPath]).status === 0,
    );

    const r2 = run(tree, ["-a", "launch", "-n", "tv", "-t", "20", "-Q"]);
    check("launch with -Q exits 0", r2.code === 0, r2.output);
    check(
      "TV_V2_QUARANTINE_CLEARED=1 is printed",
      /^TV_V2_QUARANTINE_CLEARED=1$/m.test(r2.output),
    );
    check(
      "the quarantine is gone",
      spawnSync("xattr", ["-p", "com.apple.quarantine", binPath]).status !== 0,
    );
  }
  cleanup(tree);
} else {
  console.log("\nSKIP quarantine tests (macOS xattr not available)");
}

finish();

function finish() {
  console.log(
    `\n${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
