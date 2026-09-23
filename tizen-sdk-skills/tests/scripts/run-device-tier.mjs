#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Ordered, self-cleaning run of the device-tier TCs.
 *
 *   node scripts/run-device-tier.mjs                # preflight + print the plan, change nothing
 *   node scripts/run-device-tier.mjs --yes          # run everything (destructive, see below)
 *   node scripts/run-device-tier.mjs --yes --include-drafts   # also run the draft TCs the order
 *                                                              # file lists (promotion runs)
 *   node scripts/run-device-tier.mjs --yes --skip-tv-boot
 *   node scripts/run-device-tier.mjs --yes --keep-test-vm
 *   node scripts/run-device-tier.mjs --yes --phase=<name>   # one phase, no VM pre-clean/teardown
 *                                                            # (its hooks still run; bookmarks restored)
 *   node scripts/run-device-tier.mjs --yes --scratch=<dir>
 *
 * Ctrl+C during a run stops after the current TC and still runs the teardown.
 *
 * Why not `node runner.mjs --tier=device`: readdir order destroys its own
 * preconditions (see policy/device-run-order.yaml). This driver runs the
 * phases of that file through runner.mjs --order/--phase and adds what a TC
 * file cannot express:
 *
 *   preflight  dist bundle newer than common/lib, common/scripts, tizen-cli/src;
 *              `tizen-sdk --doctor` has no failing check; SDK/data paths resolve;
 *              hypervisor probes (informational); no emulator online;
 *              fixtures/apps/fixtures.generated.env present and its artifacts
 *              exist when a fixture phase is selected (else: run
 *              scripts/prepare-device-fixtures.mjs first)
 *   backup     Device Manager bookmark list (remote_device_scan.list)
 *   pre-clean  delete `test-vm` and `tv-vm` (the TCs create both)
 *   hooks      (PHASE_HOOKS below) empty the create-image output dir before b;
 *              install the .NET and web fixture apps (the native one is
 *              installed by the install-app TCs), write /tmp/log.txt on the
 *              device before c2; drop port forwards, kill debuggers/apps before every
 *              debug phase and before c6; delete the scaffolded test file
 *              before c3; strip 192.168.1.50/.51 bookmarks before e-network;
 *              boot tv-vm between f1-tv-create and f2-tv-detect
 *   teardown   stop all emulators, delete test-vm, restore the bookmark list
 *
 * The ${FIXTURE_*} placeholders in the TC argv resolve from
 * fixtures/apps/fixtures.generated.env (written by prepare-device-fixtures.mjs),
 * merged over process.env for the runner; fixtures/fixtures.env only holds
 * documentation defaults.
 *
 * DESTRUCTIVE with --yes: deletes/recreates the VMs named test-vm and tv-vm,
 * factory-resets test-vm, stops EVERY running emulator, sweeps the local /24
 * on TCP 26101 three times, rewrites the Device Manager bookmark list
 * (restored from the backup afterwards), and installs / launches / kills the
 * fixture apps on test-vm. Without --yes nothing is changed.
 *
 * Windows-first: everything is spawned as `node <script>` directly (no .cmd
 * shims — execFile refuses them since CVE-2024-27980). Works the same on
 * POSIX, where the launcher path is identical.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import {
  TESTS,
  bad,
  checkDistFresh,
  checkDoctor,
  color,
  emptyDir,
  firstError,
  guardedScratchDir,
  loadFixtureEnv,
  log,
  logChunk,
  note,
  ok,
  onlineEmulators,
  resolvePaths,
  sdbRows,
  sdbRun,
  sdk,
  setLogFile,
  sleep,
  step,
  warn,
} from "./lib/driver-common.mjs";

const RUNNER = join(TESTS, "runner.mjs");
const ORDER = join(TESTS, "policy", "device-run-order.yaml");

const VM_TEST = "test-vm";
const VM_TV = "tv-vm";
const BOOKMARK_IPS = new Set(["192.168.1.50", "192.168.1.51"]);
const TV_BOOT_TIMEOUT_SEC = 480;

/** Phases that assume c2's deviceFixtures hook already installed the apps. */
const NEEDS_INSTALLED_APPS = new Set([
  "c3-web-debug",
  "c4-dotnet-debug",
  "c5a-gdb-launch",
  "c5b-gdb-attach",
  "c5c-gdb-attach-bp",
  "c5d-gdb-serial",
]);

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    yes: false,
    skipTvBoot: false,
    keepTestVm: false,
    includeDrafts: false,
    phase: null,
    scratch: null,
  };
  for (const a of argv) {
    if (a === "--yes") opts.yes = true;
    else if (a === "--skip-tv-boot") opts.skipTvBoot = true;
    else if (a === "--keep-test-vm") opts.keepTestVm = true;
    else if (a === "--include-drafts") opts.includeDrafts = true;
    else if (a.startsWith("--phase=")) opts.phase = a.slice(8);
    else if (a.startsWith("--scratch=")) opts.scratch = resolve(a.slice(10));
    else if (a === "--help" || a === "-h") {
      console.log(
        readFileSync(fileURLToPath(import.meta.url), "utf-8")
          .match(/\/\*\*([\s\S]*?)\*\//)[1]
          .replace(/^ \* ?/gm, ""),
      );
      process.exit(0);
    } else {
      console.error(`unknown option: ${a} (see --help)`);
      process.exit(2);
    }
  }
  return opts;
}

// ── Preflight extras ──────────────────────────────────────────────────────

function probeHypervisor(paths) {
  if (process.platform !== "win32") {
    note("(hypervisor probe: Windows only; on Linux check /dev/kvm)");
    return;
  }
  for (const exe of ["check-whpx.exe", "check-hax.exe"]) {
    const p = join(paths.emuBin, exe);
    if (!existsSync(p)) {
      warn(`${exe} not present`);
      continue;
    }
    const r = spawnSync(p, [], { encoding: "utf-8", timeout: 10_000 });
    const first =
      ((r.stdout || "") + (r.stderr || "")).trim().split(/\r?\n/)[0] ||
      "(no output)";
    note(`${exe}: exit ${r.status ?? "timeout"} — ${first}`);
  }
  note(
    "(informational: the plugin never probes the hypervisor; a missing one shows up as a boot timeout)",
  );
}

/** Shared gate (lib/driver-common.mjs) plus the device tier's playwright check. */
function loadDeviceFixtureEnv(selected) {
  const env = loadFixtureEnv(selected);
  if (
    env &&
    selected.includes("c3-web-debug") &&
    !existsSync(
      join(env.FIXTURE_TMP_DIR, "test-project", "node_modules", "playwright"),
    )
  )
    warn(
      "playwright not installed in test-project — playwright-test.run/.no-setup/.serial/.custom-port-timeout will fail (prepare-device-fixtures.mjs --only=playwright)",
    );
  return env;
}

// ── VM + bookmark helpers ─────────────────────────────────────────────────

function listVms() {
  const env = sdk(["emulator-manager", "--action", "list-vm"], {
    timeoutSec: 90,
  });
  if (env.status !== "success") {
    warn(`list-vm failed: ${firstError(env)}`);
    return null;
  }
  return env.result?.vms || [];
}

function deleteVm(name) {
  const env = sdk(
    ["emulator-manager", "--action", "delete", "--vm-name", name],
    { timeoutSec: 180 },
  );
  if (env.status === "success") ok(`deleted VM ${name}`);
  else bad(`delete ${name}: ${firstError(env)}`);
  return env.status === "success";
}

function stopEmulators(paths) {
  const env = sdk(["device-manager", "--action", "stop"], { timeoutSec: 120 });
  if (env.status === "success")
    ok(`emulators stopped: ${env.result?.emulators_stopped ?? "?"}`);
  else bad(`device-manager stop: ${firstError(env)}`);
  // The stop script hangs in `sdb shell poweroff` when the emulator process
  // is already gone but the sdb server still lists the device (seen with a
  // TV VM on Windows: the TC timed out, so did the teardown). A phantom row
  // also breaks the next launch's serial detection. Bounce the server and
  // re-check; `sdb devices` restarts it.
  let rows = sdbRows(paths);
  if (rows.length) {
    warn(
      `sdb still lists ${rows.map((r) => `${r[0]} ${r[1]}`).join(", ")} — restarting the sdb server`,
    );
    sdbRun(paths, ["kill-server"]);
    sleep(2000);
    rows = sdbRows(paths);
  }
  if (rows.length) {
    bad(
      `sdb still lists ${rows.map((r) => r[0]).join(", ")} after kill-server`,
    );
    return false;
  }
  ok("sdb lists no device");
  return env.status === "success";
}

function stripBookmarks(bookmarks) {
  if (!existsSync(bookmarks)) return;
  const kept = readFileSync(bookmarks, "utf-8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !BOOKMARK_IPS.has(l.split("/")[1]));
  writeFileSync(
    bookmarks,
    kept.join("\r\n") + (kept.length ? "\r\n" : ""),
    "utf-8",
  );
  ok(
    `bookmark list stripped of ${[...BOOKMARK_IPS].join(", ")} (${kept.length} kept)`,
  );
}

// ── Phase hooks ───────────────────────────────────────────────────────────
//
// Hooks run right before the phase whose precondition they establish,
// whenever THAT phase is selected — a single-phase run gets them too. Each
// receives { paths, opts, fixtureEnv } and returns true when the precondition
// holds, false when it could not be established (logged in detail here,
// listed again in the summary, and the run exits 1 even if the phase's TCs
// happen to pass). A hook never throws on purpose; an unexpected exception
// is caught by attempt() and counted the same way. The phase still runs so
// its TCs report the concrete consequence.

/** The one online emulator the device-bound TCs will talk to, or null. */
function targetSerial(paths) {
  const online = onlineEmulators(paths);
  if (!online.length) {
    bad("no emulator online — this phase needs test-vm booted (c-boot-1)");
    return null;
  }
  if (online.length > 1)
    warn(
      `${online.length} emulators online (${online.join(", ")}) — resolveSerial() will refuse`,
    );
  return online[0];
}

/** One-line `sdb -s <serial> shell <cmd>`; returns trimmed stdout. */
function deviceShell(paths, serial, cmd, timeoutMs = 30_000) {
  const r = sdbRun(paths, ["-s", serial, "shell", cmd], { timeoutMs });
  return (r.stdout || "").replace(/\r/g, "").trim();
}

/** b: emulator-manager.create-image refuses a non-empty --output-dir target. */
function resetImageDir({ fixtureEnv }) {
  // guardedScratchDir: real path strictly inside tests/fixtures/apps, no
  // symlink/junction — FIXTURE_TMP_DIR comes from a user-editable env file.
  const dir = guardedScratchDir(
    fixtureEnv.FIXTURE_TMP_DIR &&
      join(fixtureEnv.FIXTURE_TMP_DIR, "emulator-images"),
    "FIXTURE_TMP_DIR/emulator-images",
  );
  if (!dir) return false;
  const n = emptyDir(dir);
  ok(`emptied ${dir} (${n} entr${n === 1 ? "y" : "ies"} removed)`);
  return true;
}

/** c2: the fixture apps on the device, /tmp/log.txt for the pull TCs. */
function deviceFixtures({ paths, fixtureEnv }) {
  const serial = targetSerial(paths);
  if (!serial) return false;
  let fine = true;
  const root = sdbRun(paths, ["-s", serial, "root", "on"]);
  note(
    `sdb root on: ${(root.stdout || root.stderr).trim() || `exit ${root.status}`}`,
  );
  // The native package is installed by the install-app.* TCs themselves (the
  // first three TCs of c2); only the .NET and web packages come from here.
  for (const key of ["FIXTURE_DOTNET_TPK", "FIXTURE_WEB_WGT"]) {
    const pkg = fixtureEnv[key];
    if (!pkg) {
      warn(`${key} unset — skipped`);
      fine = false;
      continue;
    }
    const env = sdk(["install-app", "--package", pkg, "--serial", serial], {
      timeoutSec: 300,
    });
    if (env.status === "success")
      ok(`installed ${env.result?.app_id ?? "?"} (${key})`);
    else {
      bad(`install-app ${key}: ${firstError(env)}`);
      fine = false;
    }
  }
  deviceShell(paths, serial, "echo fixture > /tmp/log.txt");
  const back = deviceShell(paths, serial, "cat /tmp/log.txt");
  if (back === "fixture") ok("/tmp/log.txt written on the device");
  else {
    bad(`/tmp/log.txt not readable back (got "${back}")`);
    fine = false;
  }
  // Informational: the gdb scripts install gdbserver on demand from the SDK
  // when the image lacks it; this only tells the log which case applies.
  const gs = deviceShell(
    paths,
    serial,
    "which gdbserver 2>/dev/null || ls /home/owner/share/tmp/sdk_tools/gdbserver/gdbserver 2>/dev/null || echo none",
  );
  note(`gdbserver on device: ${gs || "none"}`);
  return fine;
}

/**
 * c3, c4, c5a-c, c6: every debug TC forwards a host port (9222/9223 RWI, 4711
 * DAP, 5039 gdb) and leaves the app under a debugger; gdb attach mode does
 * `pidof <exec>` before it kills stale gdbservers, so each gdb TC needs a
 * clean device. --remove-all is host-side; the shell line is best-effort.
 */
function debugCleanup({ paths, fixtureEnv }) {
  const serial = targetSerial(paths);
  if (!serial) return false;
  const fwd = sdbRun(paths, ["-s", serial, "forward", "--remove-all"]);
  (fwd.status === 0 ? ok : warn)(
    `sdb forward --remove-all (exit ${fwd.status ?? fwd.error?.message})`,
  );
  const ids = [
    "FIXTURE_WEB_APP_ID",
    "FIXTURE_DOTNET_APP_ID",
    "FIXTURE_NATIVE_APP_ID",
  ]
    .map((k) => fixtureEnv[k])
    .filter(Boolean);
  const parts = ["pkill -f netcoredbg", "pkill gdbserver"];
  if (fixtureEnv.FIXTURE_NATIVE_EXEC)
    parts.push(`pkill ${fixtureEnv.FIXTURE_NATIVE_EXEC}`);
  for (const id of ids) parts.push(`app_launcher -t ${id}`);
  parts.push("true");
  const r = sdbRun(paths, ["-s", serial, "shell", parts.join("; ")], {
    timeoutMs: 30_000,
  });
  sleep(1000);
  if (r.error) {
    warn(`device cleanup: ${r.error.message}`);
    return false;
  }
  ok(`debuggers and fixture apps stopped on ${serial}`);
  return fwd.status === 0;
}

/** c3: playwright-test.scaffold refuses an existing test file without --force. */
function resetTestProject({ fixtureEnv }) {
  const project = guardedScratchDir(
    fixtureEnv.FIXTURE_TMP_DIR &&
      join(fixtureEnv.FIXTURE_TMP_DIR, "test-project"),
    "FIXTURE_TMP_DIR/test-project",
  );
  if (!project) return false;
  let n = 0;
  for (const f of ["tizen-playwright.test.js", "test-failure.png"]) {
    const p = join(project, f);
    if (existsSync(p)) {
      unlinkSync(p);
      n++;
    }
  }
  ok(`test-project reset (${n} file${n === 1 ? "" : "s"} removed)`);
  return true;
}

function stripBookmarksHook({ paths }) {
  stripBookmarks(paths.bookmarks);
  return true;
}

function bootTvVm({ opts }) {
  if (opts.skipTvBoot) {
    // Requested by the caller, so not a hook failure.
    warn("skipped (--skip-tv-boot) — device-manager.tv is an expected failure");
    return true;
  }
  if (!(listVms() || []).includes(VM_TV)) {
    bad(
      `${VM_TV} does not exist — run f1-tv-create first; device-manager.tv will fail`,
    );
    return false;
  }
  // launch-emulator is idempotent: an already-online VM is reported, not booted twice.
  const env = sdk(
    [
      "launch-emulator",
      "--vm-name",
      VM_TV,
      "--timeout",
      String(TV_BOOT_TIMEOUT_SEC),
    ],
    { timeoutSec: TV_BOOT_TIMEOUT_SEC + 120 },
  );
  if (env.status === "success") {
    ok(
      `${VM_TV} online as ${env.result?.device_serial ?? "?"} after ${env.result?.waited_ms ?? "?"} ms`,
    );
    return true;
  }
  bad(`${VM_TV} boot: ${firstError(env)}`);
  return false;
}

const PHASE_HOOKS = {
  "b-vm-lifecycle": [resetImageDir],
  "c2-fixture-apps": [deviceFixtures],
  "c3-web-debug": [debugCleanup, resetTestProject],
  "c4-dotnet-debug": [debugCleanup],
  "c5a-gdb-launch": [debugCleanup],
  "c5b-gdb-attach": [debugCleanup],
  "c5c-gdb-attach-bp": [debugCleanup],
  "c5d-gdb-serial": [debugCleanup],
  "c6-stop": [debugCleanup],
  "e-network": [stripBookmarksHook],
  "f2-tv-detect": [bootTvVm],
};

// ── Runner phases ─────────────────────────────────────────────────────────

// Ctrl+C / SIGTERM must not skip the teardown: without a handler Node exits
// at once, leaving the emulator running and the bookmark list stripped. The
// handler kills the runner child (its TC finishes or dies with it), the phase
// resolves with 130, the loop stops, and `finally` cleans up as usual.
let currentChild = null;
let aborted = false;
function onInterrupt(signal) {
  if (aborted) return;
  aborted = true;
  log(
    color(
      "yellow",
      `\n! ${signal} — stopping after the current TC, then tearing down`,
    ),
  );
  if (currentChild) currentChild.kill();
}

/** Installed only while the teardown runs: log and keep cleaning up. */
function shieldTeardown(signal) {
  log(color("yellow", `\n! ${signal} ignored — teardown in progress`));
}

function runPhase(name, scratch, env, includeDrafts) {
  return new Promise((done) => {
    const args = [
      RUNNER,
      "--tier=device",
      ...(includeDrafts ? [] : ["--status=approved"]),
      `--order=${ORDER}`,
      `--phase=${name}`,
    ];
    const child = spawn(process.execPath, args, {
      cwd: scratch,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    currentChild = child;
    child.stdout.on("data", logChunk);
    child.stderr.on("data", logChunk);
    child.on("close", (code) => {
      currentChild = null;
      done(aborted ? 130 : (code ?? 1));
    });
    child.on("error", (e) => {
      currentChild = null;
      bad(`cannot spawn runner: ${e.message}`);
      done(1);
    });
  });
}

/**
 * Run one teardown/hook step. An exception is logged and never lets the next
 * step be skipped. Returns false when the step threw or returned false.
 */
function attempt(label, fn) {
  try {
    return fn() !== false;
  } catch (e) {
    bad(`${label}: ${e.message}`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const order = parseYaml(readFileSync(ORDER, "utf-8"));
  const phases = order.phases.map((p) => p.name);
  const selected = opts.phase ? phases.filter((p) => p === opts.phase) : phases;
  if (opts.phase && !selected.length) {
    console.error(`unknown phase ${opts.phase}; have ${phases.join(", ")}`);
    process.exit(2);
  }

  const scratch =
    opts.scratch ||
    join(
      tmpdir(),
      `tizen-device-run-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
  mkdirSync(scratch, { recursive: true });
  const logFile = join(scratch, "run.log");
  setLogFile(logFile);
  log(
    color(
      "cyan",
      `tizen-sdk device-tier run — ${opts.yes ? "LIVE" : "plan only (no --yes)"}${opts.includeDrafts ? ", drafts included" : ""}`,
    ),
  );
  note(`scratch/log: ${scratch}`);

  // 1. Preflight (read-only)
  step("preflight");
  let fine = checkDistFresh();
  fine = checkDoctor() && fine;
  const paths = resolvePaths();
  fine = !!paths && fine;
  if (paths) probeHypervisor(paths);
  const fixtureEnv = loadDeviceFixtureEnv(selected);
  fine = !!fixtureEnv && fine;
  if (!fine) {
    bad("preflight failed — nothing was changed");
    process.exitCode = 2;
    return;
  }
  let online = onlineEmulators(paths);
  if (online.length) {
    warn(
      `emulator(s) online: ${online.join(", ")} — the run needs none (screenshot.serial asserts emulator-26101)`,
    );
  } else ok("no emulator online");
  const vms = listVms();
  if (vms === null) {
    process.exitCode = 2;
    return;
  }
  ok(`existing VMs: ${vms.length ? vms.join(", ") : "(none)"}`);
  const bookmarksExisted = existsSync(paths.bookmarks);
  const runnerEnv = { ...process.env, ...fixtureEnv };

  // 2. Plan
  step("plan");
  const fullRun = !opts.phase;
  log(`  phases: ${selected.join(" → ")}`);
  log(
    `  TC filter: --tier=device${opts.includeDrafts ? " (drafts included — the order file may list draft ids)" : " --status=approved"}`,
  );
  if (fullRun) {
    for (const vm of [VM_TEST, VM_TV])
      if (vms.includes(vm)) log(`  pre-clean: delete VM ${vm}`);
    if (online.length) log(`  pre-clean: stop ${online.join(", ")}`);
  }
  for (const name of selected) {
    const hooks = PHASE_HOOKS[name];
    if (hooks) log(`  before ${name}: ${hooks.map((h) => h.name).join(", ")}`);
  }
  log(
    `  bookmark list: back up ${paths.bookmarks}${bookmarksExisted ? "" : " (does not exist yet)"}, strip .50/.51 before e-network, restore at the end`,
  );
  if (selected.includes("f2-tv-detect"))
    log(
      `  before f2-tv-detect: ${opts.skipTvBoot ? "SKIP tv-vm boot (device-manager.tv will fail)" : `launch-emulator --vm-name tv-vm --timeout ${TV_BOOT_TIMEOUT_SEC} (tv-vm must exist)`}`,
    );
  if (fullRun)
    log(
      `  teardown: device-manager stop; ${opts.keepTestVm ? "keep" : "delete"} ${VM_TEST}; keep ${VM_TV}; restore bookmark list`,
    );
  else {
    warn(
      `--phase: no VM pre-clean and no VM teardown — only the bookmark list is restored. Existing VMs: ${vms.length ? vms.join(", ") : "(none)"}`,
    );
    if (
      ["c-boot-1", "d-boot-2"].includes(opts.phase) &&
      vms.some((v) => v !== VM_TEST)
    )
      warn(
        `launch-emulator.first-available boots whatever em-cli lists first; with VMs other than ${VM_TEST} present that may be a different (TV) VM`,
      );
    if (opts.phase === "c-boot-1")
      warn(
        `c-boot-1 leaves ${VM_TEST} running (device-manager.stop moved to c6-stop so c2–c5 can use it) — stop it with --phase=c6-stop or device-manager --action stop`,
      );
    if (NEEDS_INSTALLED_APPS.has(opts.phase))
      warn(
        `${opts.phase} assumes ${VM_TEST} is booted AND the fixture apps are installed — that is c2-fixture-apps' hook deviceFixtures; run --phase=c2-fixture-apps first on a fresh emulator`,
      );
  }
  if (!opts.yes) {
    log(
      color(
        "yellow",
        "\nplan only — re-run with --yes to execute (destructive: see the header of this script)",
      ),
    );
    return;
  }

  // 3. Backup + pre-clean
  step("backup + pre-clean");
  const backup = join(scratch, "remote_device_scan.list.bak");
  if (bookmarksExisted) {
    copyFileSync(paths.bookmarks, backup);
    ok(`bookmark list backed up to ${backup}`);
  }
  if (fullRun) {
    if (online.length) {
      stopEmulators(paths);
      online = onlineEmulators(paths);
      if (online.length) {
        bad(`still online after stop: ${online.join(", ")}`);
        process.exitCode = 2;
        return;
      }
    }
    for (const vm of [VM_TEST, VM_TV]) {
      if (vms.includes(vm) && !deleteVm(vm)) {
        process.exitCode = 2;
        return;
      }
    }
  }

  // 4. Phases
  const results = [];
  const hookFailures = []; // "hook (before phase)" — a precondition not established
  const teardownFailures = [];
  const started = Date.now();
  const ctx = { paths, opts, fixtureEnv };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);
  try {
    for (const name of selected) {
      if (aborted) break;
      for (const hook of PHASE_HOOKS[name] || []) {
        step(`hook ${hook.name} (before ${name})`);
        if (!attempt(hook.name, () => hook(ctx))) {
          hookFailures.push(`${hook.name} (before ${name})`);
          bad(`hook ${hook.name} could not establish ${name}'s precondition`);
        }
      }
      if (aborted) break;
      step(`phase ${name}`);
      const t0 = Date.now();
      const code = await runPhase(name, scratch, runnerEnv, opts.includeDrafts);
      results.push({ name, code, sec: Math.round((Date.now() - t0) / 1000) });
      (code === 0 ? ok : bad)(
        `phase ${name} exit ${code} (${results.at(-1).sec}s)`,
      );
    }
  } finally {
    // 5. Teardown — always: after a failed phase, an exception, or Ctrl+C.
    // Every step is attempted; a failure in one never skips the next, and the
    // bookmark list is restored last so it happens even if sdb is wedged. A
    // second Ctrl+C during the teardown is swallowed (default handling would
    // kill the process mid-restore); every step's result is recorded and a
    // failed step fails the run.
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    process.on("SIGINT", shieldTeardown);
    process.on("SIGTERM", shieldTeardown);
    step(aborted ? "teardown (interrupted)" : "teardown");
    const td = (label, fn) => {
      if (!attempt(label, fn)) teardownFailures.push(label);
    };
    if (fullRun) {
      td("stop emulators", () => stopEmulators(paths));
      td("delete test-vm", () => {
        const after = listVms() || [];
        if (after.includes(VM_TEST)) {
          if (opts.keepTestVm) warn(`keeping ${VM_TEST} (--keep-test-vm)`);
          else return deleteVm(VM_TEST);
        }
        if (after.includes(VM_TV)) ok(`keeping ${VM_TV}`);
        return true;
      });
    }
    td("restore bookmark list", () => {
      if (bookmarksExisted) {
        // The backup was written before any phase ran (step 3); restore it
        // byte-for-byte even when no hook touched the file.
        copyFileSync(backup, paths.bookmarks);
        ok("bookmark list restored from backup");
      } else if (existsSync(paths.bookmarks)) {
        unlinkSync(paths.bookmarks);
        ok("bookmark list removed (did not exist before the run)");
      } else
        ok("bookmark list: nothing to restore (did not exist, still absent)");
      return true;
    });
    process.off("SIGINT", shieldTeardown);
    process.off("SIGTERM", shieldTeardown);
  }

  // 6. Summary
  step("summary");
  for (const r of results)
    (r.code === 0 ? ok : bad)(`${r.name.padEnd(18)} exit ${r.code}  ${r.sec}s`);
  for (const h of hookFailures) bad(`hook failed: ${h}`);
  for (const t of teardownFailures) bad(`teardown step failed: ${t}`);
  const failed = results.filter((r) => r.code !== 0).length;
  const skipped = selected.length - results.length;
  const broken =
    failed || hookFailures.length || teardownFailures.length || aborted;
  log(
    color(
      broken ? "red" : "green",
      `\n${aborted ? `interrupted — ${skipped} phase(s) not run, ` : ""}${failed ? `${failed} phase(s) failed` : "all run phases passed"}${hookFailures.length ? `, ${hookFailures.length} hook(s) failed` : ""}${teardownFailures.length ? `, ${teardownFailures.length} teardown step(s) failed` : ""} in ${Math.round((Date.now() - started) / 60000)} min — log: ${logFile}`,
    ),
  );
  process.exitCode = broken ? 1 : 0;
}

main().catch((e) => {
  console.error(color("red", `fatal: ${e.stack || e.message}`));
  process.exitCode = 1;
});
