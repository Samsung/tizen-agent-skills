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
  launchRetryCommand,
  tvV2ConsentFlags,
  tvV2ConsentRequest,
  tvV2LaunchWarnings,
  tvV2FailureMessage,
  createFailureError,
  createVmResult,
  launchFailureError,
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
    "no warnings without any TV_V2 line",
    tvV2LaunchWarnings("DEVICE_SERIAL=emulator-26101").length === 0,
  );
  const waitedAndCleared = tvV2LaunchWarnings(
    "TV_V2_QUARANTINE_CLEARED=1\nTV_V2_ALREADY_RUNNING=tv\n",
  );
  check(
    "a change made in the same run is still reported when emulator-v2 was already running",
    waitedAndCleared.length === 2 &&
      /already running/.test(waitedAndCleared[0]) &&
      /quarantine/.test(waitedAndCleared[1]),
    JSON.stringify(waitedAndCleared),
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
  const fresh = tvV2LaunchWarnings(
    "VM_CREATED=tv\nTV_V2_DISK_REBASED=tv\nTV_V2_LAUNCH=tv\n",
  );
  check(
    "a VM created in the same run gets no 'apps and data are gone' warning",
    fresh.length === 1 && !fresh.some((x) => /gone/.test(x)),
    JSON.stringify(fresh),
  );
  const waited = tvV2LaunchWarnings("TV_V2_ALREADY_RUNNING=tv\n");
  check(
    "an emulator-v2 that was already running is reported, not a new start",
    waited.length === 1 && /already running/.test(waited[0]),
    JSON.stringify(waited),
  );
  check(
    "the quarantine consent names the chmod as well as the xattr",
    /chmod -R u\+w/.test(TV_V2_CONSENT.clear_quarantine.ask) &&
      /xattr -dr/.test(TV_V2_CONSENT.clear_quarantine.ask),
  );

  check(
    "tvV2FailureMessage covers UNAVAILABLE and EXITED, and nothing else",
    /disk_info_failed/.test(
      tvV2FailureMessage("TV_V2_UNAVAILABLE=disk_info_failed", "tv") || "",
    ) &&
      /exited right after/.test(
        tvV2FailureMessage("TV_V2_EXITED=1", "tv") || "",
      ) &&
      tvV2FailureMessage("VM_CREATED=tv", "tv") === null,
  );
  check(
    "still_running says to stop the leftover emulator-v2 first",
    /Stop it first/.test(
      tvV2FailureMessage("TV_V2_UNAVAILABLE=still_running", "tv") || "",
    ),
  );

  // An unreadable disk blocks the launch, so it is reported before any
  // consent request, as a consent of its own (recreating it loses data).
  const diskEnv = launchFailureError(
    {
      message: "Command failed",
      stdout:
        "TV_V2_NEEDS=clear_quarantine\nTV_V2_UNAVAILABLE=disk_info_failed\n",
      stderr: "",
    },
    "tv",
    300,
    "launch",
    Date.now(),
  );
  const diskErr = (diskEnv.errors || [])[0] || {};
  check(
    "disk_info_failed wins over a pending consent and asks before --rebase-disk",
    diskErr.error_category === "user_input_required" &&
      /could not read the disk/.test(diskErr.message) &&
      /DISCARDS/.test(diskErr.message) &&
      /launch --vm-name tv --rebase-disk$/.test(
        (diskErr.suggested_fix || {}).command || "",
      ) &&
      !/--clear-quarantine/.test(JSON.stringify(diskEnv)),
    JSON.stringify(diskEnv),
  );
  // A retry command keeps the consents this run already had; otherwise the
  // user is asked again for one they gave and the flow loops.
  const retryCommand = (stdout, granted) =>
    (
      (
        (launchFailureError(
          { message: "Command failed", stdout, stderr: "" },
          "tv",
          300,
          "launch",
          Date.now(),
          granted,
        ).errors || [])[0] || {}
      ).suggested_fix || {}
    ).command || "";
  check(
    "tvV2ConsentFlags: fixed order, needs plus granted, no duplicates",
    tvV2ConsentFlags(["rebase_disk"], { clearQuarantine: true }).join(" ") ===
      "--clear-quarantine --rebase-disk" &&
      tvV2ConsentFlags(["rebase_disk"], { rebaseDisk: true }).join(" ") ===
        "--rebase-disk" &&
      tvV2ConsentFlags([], {}).length === 0,
  );
  check(
    "a quarantine request after a granted --rebase-disk keeps it",
    /launch --vm-name tv --clear-quarantine --rebase-disk$/.test(
      retryCommand("TV_V2_NEEDS=clear_quarantine\n", { rebaseDisk: true }),
    ),
    retryCommand("TV_V2_NEEDS=clear_quarantine\n", { rebaseDisk: true }),
  );
  check(
    "a disk_info_failed fix after a granted --clear-quarantine keeps it",
    /launch --vm-name tv --clear-quarantine --rebase-disk$/.test(
      retryCommand("TV_V2_UNAVAILABLE=disk_info_failed\n", {
        clearQuarantine: true,
      }),
    ),
  );
  // The granted flags only help if launchEmulator hands them over: every
  // launchFailureError call in it must pass both options.
  {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "core", "emulator.js"),
      "utf8",
    );
    const body = src.slice(
      src.indexOf("async function launchEmulator("),
      src.indexOf("\n}\n", src.indexOf("async function launchEmulator(")),
    );
    // Anchored on the full argument list: the run's own timeout and start
    // time come first, then the granted consents as the sixth argument.
    const calls =
      body.match(
        /launchFailureError\(\s*error,\s*vmName,\s*timeout,\s*command,\s*startTime,\s*\{[^}]*\}\s*,?\s*\)/g,
      ) || [];
    check(
      "launchEmulator passes timeout, startTime and both consents to every launchFailureError call",
      calls.length > 0 &&
        (body.match(/launchFailureError\(/g) || []).length === calls.length &&
        calls.every(
          (c) =>
            /clearQuarantine: opts\.clearQuarantine/.test(c) &&
            /rebaseDisk: opts\.rebaseDisk/.test(c),
        ),
      calls.join("\n---\n") || "launchEmulator not found",
    );
  }
  // A retry keeps a non-default --timeout, and the default stays implicit.
  check(
    "retry commands keep --timeout 540 and omit the default 300",
    launchRetryCommand("tv", 540) ===
      "node emulator-manager-cli.js launch --vm-name tv --timeout 540" &&
      launchRetryCommand("tv", 300) ===
        "node emulator-manager-cli.js launch --vm-name tv" &&
      launchRetryCommand("tv", undefined) ===
        "node emulator-manager-cli.js launch --vm-name tv",
  );
  check(
    "a consent retry after launch --timeout 540 waits 540 s again",
    /launch --vm-name tv --timeout 540 --clear-quarantine$/.test(
      (
        (
          (launchFailureError(
            {
              message: "Command failed",
              stdout: "TV_V2_NEEDS=clear_quarantine\n",
              stderr: "",
            },
            "tv",
            540,
            "launch",
            Date.now(),
          ).errors || [])[0] || {}
        ).suggested_fix || {}
      ).command || "",
    ),
  );
  {
    // create --launch --timeout 540: every relaunch command in the envelope
    // waits 540 s, not only the timeout warning's.
    const env = createVmResult(
      {
        action: "create",
        launch: true,
        launchTimeoutSec: 540,
        vmName: "tv",
        sizeWarnings: [],
        profile: "tv",
      },
      {},
      "VM_CREATED=tv\nTV_V2_PREPARED=tv\n",
      "create",
      Date.now(),
    );
    const cmds =
      (env.warnings || [])
        .join("\n")
        .match(/node emulator-manager-cli\.js launch --vm-name tv[^\n.]*/g) ||
      [];
    check(
      "create --launch --timeout 540: every relaunch command keeps --timeout 540",
      cmds.length >= 2 && cmds.every((c) => /--timeout 540\b/.test(c)),
      cmds.join("\n"),
    );
  }
  check(
    "prepare_failed has its own message",
    /could not be written/.test(
      tvV2FailureMessage("TV_V2_UNAVAILABLE=prepare_failed", "tv") || "",
    ),
  );
  const otherEnv = launchFailureError(
    {
      message: "Command failed",
      stdout: "TV_V2_NEEDS=clear_quarantine\nTV_V2_EXITED=1\n",
      stderr: "",
    },
    "tv",
    5,
    "launch",
    Date.now(),
  );
  check(
    "any v2 failure is reported before a consent request",
    ((otherEnv.errors || [])[0] || {}).error_category ===
      "emulator_boot_failed",
    JSON.stringify(otherEnv),
  );

  // create's launch_method: "emulator-v2" only when this run started it.
  const createMethod = (launch, output) =>
    createVmResult(
      {
        action: "create",
        launch,
        vmName: "tv",
        sizeWarnings: [],
        profile: "tv",
      },
      {},
      output,
      "create",
      Date.now(),
    ).result.launch_method;
  check(
    "create launch_method: emulator-v2 when started or not launching, none otherwise",
    createMethod(
      true,
      "VM_CREATED=tv\nTV_V2_PREPARED=tv\nTV_V2_LAUNCH=tv\n",
    ) === "emulator-v2" &&
      createMethod(false, "VM_CREATED=tv\nTV_V2_PREPARED=tv\n") ===
        "emulator-v2" &&
      createMethod(
        true,
        "VM_CREATED=tv\nTV_V2_PREPARED=tv\nTV_V2_NEEDS=clear_quarantine\n",
      ) === "none",
  );

  // create --launch: the create half succeeded, emulator-v2 then died. The
  // envelope must say the VM exists and point at launch, not re-create.
  for (const marker of ["TV_V2_EXITED=1", "TV_V2_UNAVAILABLE=no_emulator_v2"]) {
    const env = createFailureError(
      { action: "create" },
      {},
      {
        message: "Command failed",
        stdout: `VM_CREATED=tv\nTV_V2_PREPARED=tv\n${marker}\n`,
        stderr: "",
      },
      "create",
      Date.now(),
    );
    const text = JSON.stringify(env);
    check(
      `create --launch + ${marker} is emulator_boot_failed with a relaunch fix`,
      /emulator_boot_failed/.test(text) &&
        /VM 'tv' was created/.test(text) &&
        /launch --vm-name tv/.test(text) &&
        !/execution_error/.test(text),
      text,
    );
  }

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
  list-vm)
    if [ "\${STUB_NO_VM:-0}" != "1" ] || [ -f "$STUB_STATE/created" ]; then echo "tv            stopped"; fi
    ;;
  launch)
    touch "$STUB_STATE/emcli_launch"
    # em-cli on Apple Silicon: HAXM is missing; error on stdout, exit 0.
    if [ "\${STUB_EMCLI_LAUNCH_FAILS:-0}" = "1" ]; then
      echo "Error: Failed to start this VM."
      echo "Your system cannot support HW virtualization."
    fi
    ;;
  create)
    # What em-cli makes: the VM folder, its conf and a disk on the v1 base.
    mkdir -p "$STUB_VM_DIR"
    printf '%s' "$STUB_VM_CONF" > "$STUB_VM_DIR/vm_launch.conf"
    : > "$STUB_VM_DIR/emulimg-tv.x86_64"
    touch "$STUB_STATE/created"
    echo "New virtual machine is created"
    ;;
  detail)
    echo "tv"
    echo "  Platform          : tv-samsung-10.0-x86_64"
    echo "  Template          : HD1080 TV"
    echo "  Resolution        : 1920x1080"
    ;;
esac
exit 0
`;

// An Apple Silicon Mac seen from an Intel (Rosetta) bash, which is what
// require_bash4's re-exec with /usr/local/bin/bash gives: uname -m says
// x86_64, sysctl hw.optional.arm64 still says 1.
const STUB_UNAME = `#!/usr/bin/env bash
case "\${1:-}" in
  -m) echo x86_64 ;;
  *) echo Darwin ;;
esac
`;
const STUB_SYSCTL = `#!/usr/bin/env bash
case "$*" in
  *hw.optional.arm64*) echo "\${STUB_HW_ARM64:-1}" ;;
esac
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
    if [ "\${STUB_QEMU_INFO_FAILS:-0}" = "1" ]; then echo "qemu-img: Could not open the image: Permission denied" >&2; exit 1; fi
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

function makeTree({
  quarantine = false,
  v1Disk = false,
  withV2 = true,
  noVm = false,
  sdkName = "sdk",
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-tv-v2-test-"));
  const sdk = path.join(root, sdkName);
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
  const vmConf = [
    "[[Emulator]]",
    `studio_path="${sdk}"`,
    "profile=tv-samsung",
    "platform_version=tizen-10.0",
    "display_resolution=3840x1080",
    `skin_path=${tv}/emulator-resources/skins/tv-3840x1080`,
    "ram=2048",
    "",
  ].join("\n");
  // noVm: the VM does not exist yet; the stub em-cli create makes it.
  if (!noVm) {
    fs.mkdirSync(vmDir, { recursive: true });
    fs.writeFileSync(path.join(vmDir, "vm_launch.conf"), vmConf);
    if (v1Disk) fs.writeFileSync(path.join(vmDir, "emulimg-tv.x86_64"), "");
  }

  // PATH-prepended uname / sysctl stubs, used only by the Rosetta tests.
  const rosettaBin = path.join(root, "rosetta-bin");
  fs.mkdirSync(rosettaBin);
  fs.writeFileSync(path.join(rosettaBin, "uname"), STUB_UNAME, { mode: 0o755 });
  fs.writeFileSync(path.join(rosettaBin, "sysctl"), STUB_SYSCTL, {
    mode: 0o755,
  });

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
    vmConf,
    rosettaBin,
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
      STUB_VM_DIR: tree.vmDir,
      STUB_VM_CONF: tree.vmConf,
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

// --- 6b. VM already running: nothing is prepared or started ---------------
console.log("\n--- VM already running ---");
{
  const tree = makeTree({ v1Disk: true });
  fs.writeFileSync(path.join(tree.state, "launched"), "");
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "5"]);
  check("launch exits 0", r.code === 0, r.output);
  check(
    "the running VM's serial is reported",
    /^DEVICE_SERIAL=emulator-26101$/m.test(r.output),
    r.output,
  );
  check(
    "no consent is asked and nothing is started",
    !/^TV_V2_/m.test(r.output) && !r.stubLog.includes("emulator-v2 "),
    r.output,
  );
  // launchedResult reports launch_method "none" from this log line.
  check(
    "the script says the VM is already running",
    /is already running and connected/.test(r.output),
  );
  cleanup(tree);
}

// --- 6c. Apple Silicon detected under a Rosetta (Intel) bash ----------------
// require_bash4 re-execs with /usr/local/bin/bash, an Intel binary on a Mac
// with Intel Homebrew; `uname -m` then says x86_64 and the auto gate used to
// pick em-cli, which cannot boot the VM (HAXM).
console.log("\n--- auto gate under Rosetta ---");
{
  const tree = makeTree({ v1Disk: true });
  const env = {
    PATH: `${tree.rosettaBin}:${process.env.PATH}`,
    TIZEN_TV_V2_LAUNCH: "auto",
  };
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "5"], env);
  check(
    "uname -m x86_64 + hw.optional.arm64=1 takes the emulator-v2 path",
    /^TV_V2_NEEDS=rebase_disk$/m.test(r.output) &&
      !r.state.includes("emcli_launch"),
    r.output,
  );
  cleanup(tree);

  const intel = makeTree({ v1Disk: true });
  const r2 = run(intel, ["-a", "launch", "-n", "tv", "-t", "1"], {
    ...env,
    PATH: `${intel.rosettaBin}:${process.env.PATH}`,
    STUB_HW_ARM64: "0",
  });
  check(
    "an Intel Mac (hw.optional.arm64=0) keeps em-cli",
    r2.state.includes("emcli_launch") && !/^TV_V2_/m.test(r2.output),
    r2.output,
  );
  cleanup(intel);
}

// --- 6d. create --launch of a new TV VM: no consent, boots with emulator-v2 -
console.log("\n--- create --launch (Apple Silicon) ---");
{
  const tree = makeTree({ noVm: true });
  const r = run(
    tree,
    [
      "-a",
      "create",
      "-n",
      "tv",
      "-p",
      "tv",
      "-P",
      "tv-samsung-10.0-x86_64",
      "-l",
      "-t",
      "20",
    ],
    { STUB_NO_VM: "1" },
  );
  check("create --launch exits 0", r.code === 0, r.output);
  check(
    "the new VM's disk is rebased without asking (nothing to lose)",
    r.diskBacking === tree.base && !/^TV_V2_NEEDS=/m.test(r.output),
    r.output,
  );
  check(
    "TV_V2_PREPARED and TV_V2_LAUNCH are printed",
    /^TV_V2_PREPARED=tv$/m.test(r.output) &&
      /^TV_V2_LAUNCH=tv$/m.test(r.output),
    r.output,
  );
  check("em-cli launch was not run", !r.state.includes("emcli_launch"));
  check(
    "the new emulator is reported (serial snapshot taken before the launch)",
    /^VM_LAUNCHED=emulator-26101$/m.test(r.output),
    r.output,
  );
  cleanup(tree);
}

// --- 6e. create --launch whose em-cli launch fails: no unbound $SDB --------
console.log("\n--- create --launch, em-cli launch fails ---");
{
  const tree = makeTree({ noVm: true });
  const r = run(
    tree,
    [
      "-a",
      "create",
      "-n",
      "tv",
      "-p",
      "tv",
      "-P",
      "tv-samsung-10.0-x86_64",
      "-l",
      "-t",
      "1",
    ],
    {
      STUB_NO_VM: "1",
      TIZEN_TV_V2_LAUNCH: "off",
      STUB_EMCLI_LAUNCH_FAILS: "1",
    },
  );
  check(
    "the launch failure is reported without 'SDB: unbound variable'",
    !/unbound variable/.test(r.output) && /Failed to launch/.test(r.output),
    r.output,
  );
  cleanup(tree);
}

// --- 6f. emulator-v2 still booting (not in sdb yet): no second start --------
// A launch that timed out leaves emulator-v2 running; a retry must wait for it,
// not start a second QEMU on the same qcow2 disk.
console.log("\n--- emulator-v2 already running, not yet in sdb ---");
{
  const tree = makeTree({ v1Disk: true });
  const v2conf = path.join(tree.vmDir, "vm_launch-v2.conf");
  const bootState = path.join(tree.root, "boot-state");
  fs.mkdirSync(bootState);
  // The earlier emulator-v2, with the same --conf the script would pass.
  const earlier = require("child_process").spawn(
    "bash",
    [path.join(tree.v2, "bin", "emulator-x86_64"), "--conf", v2conf],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        STUB_LOG: path.join(tree.root, "earlier.log"),
        STUB_STATE: bootState,
      },
    },
  );
  earlier.unref();
  // It connects to sdb a few seconds into the retry.
  const connect = require("child_process").spawn(
    "bash",
    ["-c", `sleep 4; touch "${path.join(tree.state, "launched")}"`],
    { detached: true, stdio: "ignore" },
  );
  connect.unref();
  spawnSync("sleep", ["1"]);
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "30"]);
  check("launch exits 0", r.code === 0, r.output);
  check(
    "TV_V2_ALREADY_RUNNING is printed",
    /^TV_V2_ALREADY_RUNNING=tv$/m.test(r.output),
    r.output,
  );
  check(
    "no second emulator-v2 was started",
    !r.stubLog.includes("emulator-v2 ") && !/^TV_V2_LAUNCH=/m.test(r.output),
    r.stubLog,
  );
  check(
    "the running VM is not prepared again (no consent asked, disk untouched)",
    !/^TV_V2_NEEDS=/m.test(r.output) && r.diskBacking === null,
    r.output,
  );
  check(
    "the VM's serial is reported once it connects",
    /^DEVICE_SERIAL=emulator-26101$/m.test(r.output),
    r.output,
  );
  const pidFile = path.join(tree.root, "tizen-emulator-tv.pid");
  const storedPid = fs.existsSync(pidFile)
    ? fs.readFileSync(pidFile, "utf8").trim()
    : null;
  check(
    "the PID file names the running emulator-v2, not a guess",
    storedPid === String(earlier.pid),
    `stored ${storedPid}, emulator-v2 ${earlier.pid}`,
  );
  try {
    process.kill(-earlier.pid);
  } catch {
    /* already gone */
  }
  cleanup(tree);
}

// --- 6g. qemu-img info fails: never read as "needs rebase" -----------------
console.log("\n--- qemu-img info fails ---");
{
  const tree = makeTree({ v1Disk: true });
  const r = run(tree, ["-a", "launch", "-n", "tv", "-t", "5"], {
    STUB_QEMU_INFO_FAILS: "1",
  });
  check("launch exits non-zero", r.code !== 0);
  check(
    "TV_V2_UNAVAILABLE=disk_info_failed, and no rebase_disk consent is asked",
    /^TV_V2_UNAVAILABLE=disk_info_failed$/m.test(r.output) &&
      !/^TV_V2_NEEDS=rebase_disk$/m.test(r.output),
    r.output,
  );

  check(
    "the unreadable disk was not touched without consent",
    r.diskBacking === null && !r.stubLog.includes("emulator-v2 "),
    r.stubLog,
  );

  // A corrupt disk is cured by recreating it — once the user agreed (-B).
  const r2 = run(tree, ["-a", "launch", "-n", "tv", "-t", "20", "-B"], {
    STUB_QEMU_INFO_FAILS: "1",
  });
  check(
    "with -B the unreadable disk is recreated and the VM boots",
    r2.code === 0 &&
      r2.diskBacking === tree.base &&
      /^TV_V2_DISK_REBASED=tv$/m.test(r2.output) &&
      !/^TV_V2_UNAVAILABLE=/m.test(r2.output) &&
      /^TV_V2_LAUNCH=tv$/m.test(r2.output),
    r2.output,
  );
  cleanup(tree);
}

// --- 6i. create with a leftover emulator-v2 for the same name ---------------
// Deleting a VM with em-cli leaves its emulator-v2 running. Waiting for that
// process would never boot the new VM. The new VM is still prepared (it is
// brand new), and only the launch half is refused.
const CREATE_ARGS = [
  "-a",
  "create",
  "-n",
  "tv",
  "-p",
  "tv",
  "-P",
  "tv-samsung-10.0-x86_64",
];
const createEnvelope = (launch, output) =>
  createVmResult(
    { action: "create", launch, vmName: "tv", sizeWarnings: [], profile: "tv" },
    {},
    output,
    "create",
    Date.now(),
  );
for (const launch of [true, false]) {
  console.log(
    `\n--- create${launch ? " --launch" : ""}, leftover emulator-v2 running ---`,
  );
  const tree = makeTree({ noVm: true });
  const bootState = path.join(tree.root, "boot-state");
  fs.mkdirSync(bootState);
  const leftover = require("child_process").spawn(
    "bash",
    [
      path.join(tree.v2, "bin", "emulator-x86_64"),
      "--conf",
      path.join(tree.vmDir, "vm_launch-v2.conf"),
    ],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        STUB_LOG: path.join(tree.root, "leftover.log"),
        STUB_STATE: bootState,
      },
    },
  );
  leftover.unref();
  spawnSync("sleep", ["1"]);
  const r = run(tree, [...CREATE_ARGS, ...(launch ? ["-l", "-t", "5"] : [])], {
    STUB_NO_VM: "1",
  });
  check("create exits 0 (the VM exists)", r.code === 0, r.output);
  check(
    "the new VM is still prepared on the v2 base, and nothing is started",
    /^TV_V2_PREPARED=tv$/m.test(r.output) &&
      r.diskBacking === tree.base &&
      !/^TV_V2_ALREADY_RUNNING=/m.test(r.output) &&
      !r.stubLog.includes("emulator-v2 "),
    r.output,
  );
  const env = createEnvelope(launch, r.output);
  const warned = (env.warnings || []).join("\n");
  if (launch) {
    check(
      "--launch: still_running → created_launch_blocked, launch_method none, stop it first",
      /^TV_V2_UNAVAILABLE=still_running$/m.test(r.output) &&
        env.result.status === "created_launch_blocked" &&
        env.result.launch_method === "none" &&
        /Stop it first/.test(warned),
      JSON.stringify(env).slice(0, 900),
    );
  } else {
    check(
      "no --launch: a plain created VM, warned to stop the leftover before launching",
      /^TV_V2_LEFTOVER_RUNNING=tv$/m.test(r.output) &&
        !/^TV_V2_UNAVAILABLE=/m.test(r.output) &&
        env.result.status === "created" &&
        /before you launch/.test(warned) &&
        !/not launched/.test(warned),
      JSON.stringify(env).slice(0, 900),
    );
  }
  try {
    process.kill(-leftover.pid);
  } catch {
    /* already gone */
  }
  cleanup(tree);
}

// --- 6j. create on an unreadable disk: a new VM has nothing to lose --------
for (const launch of [false, true]) {
  console.log(
    `\n--- create${launch ? " --launch" : ""}, qemu-img info fails ---`,
  );
  const tree = makeTree({ noVm: true });
  const r = run(tree, [...CREATE_ARGS, ...(launch ? ["-l", "-t", "20"] : [])], {
    STUB_NO_VM: "1",
    STUB_QEMU_INFO_FAILS: "1",
  });
  check(
    "the new VM's unreadable disk is recreated without asking",
    r.code === 0 &&
      /^TV_V2_DISK_REBASED=tv$/m.test(r.output) &&
      /^TV_V2_PREPARED=tv$/m.test(r.output) &&
      !/^TV_V2_UNAVAILABLE=/m.test(r.output) &&
      r.diskBacking === tree.base,
    r.output,
  );
  if (launch) {
    check(
      "and create --launch boots it",
      /^TV_V2_LAUNCH=tv$/m.test(r.output) &&
        /^VM_LAUNCHED=emulator-26101$/m.test(r.output),
      r.output,
    );
  }
  cleanup(tree);
}

// --- 6k. A failed prepare is a marked failure, never a boot timeout --------
// No tuner table and no template: writing the v2 files fails part-way.
for (const action of ["launch", "create --launch"]) {
  console.log(`\n--- ${action}, the v2 files cannot be written ---`);
  const creating = action !== "launch";
  const tree = makeTree({ noVm: creating });
  fs.rmSync(
    path.join(
      tree.sdk,
      "platforms",
      "tizen-10.0",
      "tv-samsung",
      "emulator-resources",
      "tuner-template",
      "tuner_default_template.cfg",
    ),
  );
  const r = creating
    ? run(tree, [...CREATE_ARGS, "-l", "-t", "5"], {
        STUB_NO_VM: "1",
      })
    : run(tree, ["-a", "launch", "-n", "tv", "-t", "5"]);
  check(
    "TV_V2_UNAVAILABLE=prepare_failed, once, and emulator-v2 is not started",
    (r.output.match(/^TV_V2_UNAVAILABLE=/gm) || []).length === 1 &&
      /^TV_V2_UNAVAILABLE=prepare_failed$/m.test(r.output) &&
      !r.stubLog.includes("emulator-v2 "),
    r.output,
  );
  if (creating) {
    const env = createEnvelope(true, r.output);
    const warned = (env.warnings || []).join("\n");
    check(
      "create --launch: created_launch_blocked with the prepare message, not a timeout",
      r.code === 0 &&
        env.result.status === "created_launch_blocked" &&
        /could not be written/.test(warned) &&
        !/did not connect/.test(warned),
      JSON.stringify(env).slice(0, 900),
    );
  } else {
    const err =
      (launchFailureError(
        { message: "Command failed", stdout: r.output, stderr: "" },
        "tv",
        5,
        "launch",
        Date.now(),
      ).errors || [])[0] || {};
    check(
      "launch: emulator_boot_failed that names the failed prepare",
      r.code !== 0 &&
        err.error_category === "emulator_boot_failed" &&
        /could not be written/.test(err.message),
      JSON.stringify(err).slice(0, 900),
    );
  }
  cleanup(tree);
}

// --- 6k2. The second prepare of create --launch fails ----------------------
// The first prepare succeeds; the one after the consent check cannot move
// the new conf into place (a PATH stub for mv fails its second such call).
{
  console.log("\n--- create --launch, the second prepare fails ---");
  const tree = makeTree({ noVm: true });
  const mvBin = path.join(tree.root, "mv-bin");
  fs.mkdirSync(mvBin);
  fs.writeFileSync(
    path.join(mvBin, "mv"),
    [
      "#!/bin/bash",
      'case "$*" in',
      "  *vm_launch-v2.conf*)",
      '    n=$(cat "$MV_COUNT" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$MV_COUNT"',
      '    [ "$n" -lt 2 ] || exit 1 ;;',
      "esac",
      'exec /bin/mv "$@"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  const r = run(tree, [...CREATE_ARGS, "-l", "-t", "5"], {
    STUB_NO_VM: "1",
    PATH: `${mvBin}:${process.env.PATH}`,
    MV_COUNT: path.join(tree.root, "mv-count"),
  });
  const env = createEnvelope(true, r.output);
  check(
    "prepared, then a blocked launch: exit 0, created_launch_blocked, nothing started",
    r.code === 0 &&
      /^TV_V2_PREPARED=tv$/m.test(r.output) &&
      (r.output.match(/^TV_V2_UNAVAILABLE=/gm) || []).length === 1 &&
      /^TV_V2_UNAVAILABLE=prepare_failed$/m.test(r.output) &&
      !r.stubLog.includes("emulator-v2 ") &&
      env.result.status === "created_launch_blocked" &&
      env.result.launch_method === "none" &&
      /could not be written/.test((env.warnings || []).join("\n")),
    `${r.output}\n${JSON.stringify(env).slice(0, 600)}`,
  );
  cleanup(tree);
}

// --- 6l. A leftover emulator-v2 plus a v2 path that is not usable ----------
// The v2 failure is the one reported; a second TV_V2_UNAVAILABLE line
// (still_running) would hide it. The leftover is still reported: a later
// launch would wait for it as if it were this VM's.
for (const launch of [true, false]) {
  console.log(
    `\n--- create${launch ? " --launch" : ""}, leftover running and no v2 base image ---`,
  );
  const tree = makeTree({ noVm: true });
  fs.mkdirSync(path.join(tree.root, "boot-state"));
  const leftover = require("child_process").spawn(
    "bash",
    [
      path.join(tree.v2, "bin", "emulator-x86_64"),
      "--conf",
      path.join(tree.vmDir, "vm_launch-v2.conf"),
    ],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        STUB_LOG: path.join(tree.root, "leftover.log"),
        STUB_STATE: path.join(tree.root, "boot-state"),
      },
    },
  );
  leftover.unref();
  spawnSync("sleep", ["1"]);
  fs.rmSync(tree.base);
  const r = run(tree, [...CREATE_ARGS, ...(launch ? ["-l", "-t", "5"] : [])], {
    STUB_NO_VM: "1",
  });
  const env = createEnvelope(launch, r.output);
  const warned = (env.warnings || []).join("\n");
  check(
    "the leftover is detected and reported, and only no_base_image is UNAVAILABLE",
    /^TV_V2_LEFTOVER_RUNNING=tv$/m.test(r.output) &&
      (r.output.match(/^TV_V2_UNAVAILABLE=/gm) || []).length === 1 &&
      /^TV_V2_UNAVAILABLE=no_base_image$/m.test(r.output) &&
      env.result.status === (launch ? "created_launch_blocked" : "created") &&
      /no_base_image/.test(warned) &&
      /before you launch/.test(warned) &&
      !/cannot be booted/.test(warned),
    `${r.output}\n${JSON.stringify(env).slice(0, 900)}`,
  );
  try {
    process.kill(-leftover.pid);
  } catch {
    /* already gone */
  }
  cleanup(tree);
}

// --- 6h. SDK path with sed metacharacters; --emulator-path is ignored ------
console.log("\n--- SDK path with & and | ---");
{
  const tree = makeTree({ sdkName: "sdk&co|x" });
  const r = run(tree, [
    "-a",
    "launch",
    "-n",
    "tv",
    "-t",
    "20",
    "-E",
    "/some/emulator",
  ]);
  check("launch exits 0", r.code === 0, r.output);
  const conf = r.v2conf || "";
  check(
    "the conf carries the SDK path literally",
    conf.includes(`${tree.sdk}/platforms/tizen-10.0/tv-samsung`) &&
      !conf.includes("__SDK_PATH__"),
    conf.slice(0, 400),
  );
  check(
    "the skin path keeps its & and |",
    conf.includes(`skin_path=${tree.sdk}/platforms/`),
    conf,
  );
  check(
    "--emulator-path is reported as ignored on the emulator-v2 path",
    /Ignoring the emulator path option \(\/some\/emulator\)/.test(r.output),
    r.output,
  );
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

    // An unreadable disk is reported first, not after a quarantine consent.
    const both = makeTree({ quarantine: true, v1Disk: true });
    const r3 = run(both, ["-a", "launch", "-n", "tv", "-t", "5"], {
      STUB_QEMU_INFO_FAILS: "1",
    });
    check(
      "disk_info_failed comes without a clear_quarantine request",
      /^TV_V2_UNAVAILABLE=disk_info_failed$/m.test(r3.output) &&
        !/^TV_V2_NEEDS=/m.test(r3.output),
      r3.output,
    );
    // Follow the suggested fixes round by round, as an agent would: each
    // retry must carry the consents already given, and the flow must end.
    const fixFor = (out, granted) =>
      (
        (
          (launchFailureError(
            { message: "Command failed", stdout: out, stderr: "" },
            "tv",
            20,
            "launch",
            Date.now(),
            granted,
          ).errors || [])[0] || {}
        ).suggested_fix || {}
      ).command || "";
    const fix1 = fixFor(r3.output, {});
    const r4 = run(both, ["-a", "launch", "-n", "tv", "-t", "20", "-B"], {
      STUB_QEMU_INFO_FAILS: "1",
    });
    const fix2 = fixFor(r4.output, { rebaseDisk: true });
    check(
      "round 2 (-B) asks for the quarantine and keeps --rebase-disk and --timeout 20",
      /launch --vm-name tv --timeout 20 --rebase-disk$/.test(fix1) &&
        /^TV_V2_NEEDS=clear_quarantine$/m.test(r4.output) &&
        /launch --vm-name tv --timeout 20 --clear-quarantine --rebase-disk$/.test(
          fix2,
        ),
      `${fix1}\n${fix2}\n${r4.output}`,
    );
    // Run round 2's suggested fix as given (it carries --timeout 20 too):
    // its CLI options, mapped to the script's own.
    const SCRIPT_FLAG = {
      "--vm-name": "-n",
      "--timeout": "-t",
      "--rebase-disk": "-B",
      "--clear-quarantine": "-Q",
    };
    const fix2Args = fix2
      .replace(/^node emulator-manager-cli\.js launch /, "")
      .split(/\s+/)
      .map((t) => SCRIPT_FLAG[t] || t);
    const r5 = run(both, ["-a", "launch", ...fix2Args], {
      STUB_QEMU_INFO_FAILS: "1",
    });
    check(
      "round 3 (round 2's suggested fix) boots the VM",
      r5.code === 0 &&
        /^TV_V2_LAUNCH=tv$/m.test(r5.output) &&
        /^DEVICE_SERIAL=emulator-26101$/m.test(r5.output),
      r5.output,
    );
    cleanup(both);
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
