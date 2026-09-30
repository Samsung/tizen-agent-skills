#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Ordered, self-cleaning run of the mutating-tier TCs a provisioned host can
 * execute (policy/mutating-run-order.yaml).
 *
 *   node scripts/run-mutating-tier.mjs                # preflight + print the plan, change nothing
 *   node scripts/run-mutating-tier.mjs --yes          # run everything (see DESTRUCTIVE below)
 *   node scripts/run-mutating-tier.mjs --yes --include-drafts   # also run the draft TCs the order
 *                                                                # file lists (promotion runs)
 *   node scripts/run-mutating-tier.mjs --yes --phase=<name>     # one phase (its hooks still run)
 *   node scripts/run-mutating-tier.mjs --yes --scratch=<dir>
 *   node scripts/run-mutating-tier.mjs --yes --with-installers  # also the installer phases s2/s3
 *                                                                # (60-90 min, ~10 GB download)
 *   node scripts/run-mutating-tier.mjs --yes --with-installers --keep-scratch-sdk
 *                                                                # keep <scratch>/home/tizen-sdk for triage
 *   node scripts/run-mutating-tier.mjs --restore-user-env=<scratch>/user-env.json
 *                                                                # after a killed installer run: put the
 *                                                                # User Path/TIZEN_SDK_PATH back, nothing else
 *
 * Ctrl+C during a run stops after the current TC (the whole process tree —
 * on Windows the PowerShell installer would otherwise keep writing) and
 * still runs the teardown.
 *
 * Installer phases (INSTALLER_PHASES; skipped unless --with-installers or
 * --phase= names one): s2-sdk-installers runs the real SDK installers with
 * USERPROFILE/HOME pointed at <scratch>/home (TIZEN_SDK_PATH removed from the
 * env, TIZEN_SDK_INLINE_INSTALLER=1 so common/lib/core/sdk.js runs the
 * installer inline instead of returning it as suggested_fix), so everything
 * lands in <scratch>/home/tizen-sdk and the host's SDK is never opened.
 * tizen-sdk-install.ps1 still rewrites the USER environment (Path,
 * TIZEN_SDK_PATH) to that scratch SDK — the driver snapshots both to
 * <scratch>/user-env.json before the phase and restores them FIRST in the
 * teardown (after stopping any installer PowerShell still running); if the
 * process is killed outright, --restore-user-env=<that file> redoes just the
 * restore. The scratch home carries an ownership marker and is only ever
 * deleted as exactly <scratch>/home with that marker. s3-dotnet-workload reinstalls the
 * host's real .NET Tizen workload (no redirect). Both phases run without the
 * --status=approved filter (their TCs are promoted by this very run).
 *
 * Why not `node runner.mjs --tier=mutating`: readdir order builds a project
 * before the TC that creates it and deletes it before the later builds,
 * remove-profile consumes its fixture, and generate-author / import-certificate
 * refuse to overwrite what a previous run left in the keystore. This driver
 * runs the phases of the order file through runner.mjs --order/--phase —
 * with cwd = tests/, because the certificate TCs use `fixtures/...` relative
 * paths — and adds what a TC file cannot express:
 *
 *   preflight  dist bundle fresh; `tizen-sdk --doctor` clean; SDK/data paths;
 *              fixtures.generated.env keys the selected phases need
 *              (FIXTURE_TMP_DIR, FIXTURE_PROJECTS_DIR — from
 *              scripts/prepare-device-fixtures.mjs --only=tmp,projects);
 *              fixtures/profiles/*.xml unmodified in git (the run restores them
 *              from a backup and would otherwise clobber local edits); the
 *              already-installed markers phase s1 relies on (informational)
 *   backup     fixtures/profiles/with-profile.xml, with-profile-for-removal.xml
 *   hooks      (PHASE_HOOKS below) cleanKeystore before k2; resetProfileFixtures
 *              before k3; resetProjectsDir before p1
 *   teardown   restore the profile fixtures, delete the scratch profiles.xml,
 *              cleanKeystore again (no test certificates left behind)
 *
 * DESTRUCTIVE with --yes: deletes the fixture-named certificates under
 * <sdk-data>/keystore (author/{TestDev,Jane-Dev,TestDev-v2,test-fixture-author}.*,
 * distributor/test-fixture-author.*), rewrites and restores
 * tests/fixtures/profiles/*.xml, empties tests/fixtures/apps/projects, and lets
 * sdk-install / tv-sdk-install take their already-installed path (which may
 * rewrite <sdk>/sdk.info and ~/.tizen.sdk.path.config). Without
 * --with-installers it never installs or removes SDK packages; with it, s2
 * downloads ~10 GB into <scratch>/home/tizen-sdk (deleted afterwards unless
 * --keep-scratch-sdk), rewrites and restores the User Path / TIZEN_SDK_PATH,
 * and s3 reinstalls the .NET Tizen workload. Without --yes nothing is changed.
 *
 * Windows-first: everything is spawned as `node <script>` directly (no .cmd
 * shims). Works the same on POSIX.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { parseFixturesEnv } from "../runner.mjs";
import {
  REPO,
  TESTS,
  USER_ENV_KEYS,
  bad,
  checkDistFresh,
  checkDoctor,
  color,
  createScratchHome,
  emptyDir,
  guardedScratchDir,
  killTree,
  loadFixtureEnv,
  log,
  logChunk,
  note,
  ok,
  powershell,
  readUserEnv,
  removeScratchHome,
  resolvePaths,
  restoreUserEnv,
  setLogFile,
  step,
  stopOrphanedInstallers,
  validateUserEnvSnapshot,
  warn,
} from "./lib/driver-common.mjs";

const RUNNER = join(TESTS, "runner.mjs");
const ORDER = join(TESTS, "policy", "mutating-run-order.yaml");
const PROFILES_DIR = join(TESTS, "fixtures", "profiles");
const PROFILE_FIXTURES = ["with-profile.xml", "with-profile-for-removal.xml"];
const PREPARE_HINT =
  "node scripts/prepare-device-fixtures.mjs --only=tmp,projects,rootstrap";

/** Phases that install for real; opt-in (see the header). */
const INSTALLER_PHASES = ["s2-sdk-installers", "s3-dotnet-workload"];
/** The one phase that runs against the throwaway home. */
const HOME_PHASE = "s2-sdk-installers";
const INSTALL_MIN_FREE_GB = 15; // what sdk.js checkDiskSpace() demands of the home drive

/**
 * The only files cleanKeystore may delete under <sdk-data>/keystore: what the
 * k2 TCs create (generate-author --name TestDev / "Jane Dev" / --file TestDev-v2,
 * import-certificate of the fixture cert as author and as distributor) plus the
 * .pwd sidecars tz writes next to them. Nothing else is ever touched.
 */
const KEYSTORE_FILES = {
  author: [
    "TestDev.p12",
    "TestDev.pwd",
    "Jane-Dev.p12",
    "Jane-Dev.pwd",
    "TestDev-v2.p12",
    "TestDev-v2.pwd",
    "test-fixture-author.p12",
    "test-fixture-author.pwd",
  ],
  distributor: ["test-fixture-author.p12", "test-fixture-author.pwd"],
};

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    yes: false,
    includeDrafts: false,
    phase: null,
    scratch: null,
    withInstallers: false,
    keepScratchSdk: false,
    restoreUserEnv: null,
  };
  for (const a of argv) {
    if (a === "--yes") opts.yes = true;
    else if (a === "--include-drafts") opts.includeDrafts = true;
    else if (a === "--with-installers") opts.withInstallers = true;
    else if (a === "--keep-scratch-sdk") opts.keepScratchSdk = true;
    else if (a.startsWith("--restore-user-env="))
      opts.restoreUserEnv = resolve(a.slice(19));
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

/** The profile fixtures must be clean in git: the teardown restores a backup over them. */
function checkProfileFixturesClean() {
  const r = spawnSync(
    "git",
    ["status", "--porcelain", "--", relative(REPO, PROFILES_DIR)],
    { cwd: REPO, encoding: "utf-8", timeout: 30_000 },
  );
  if (r.error || r.status !== 0) {
    warn(
      `git status unavailable (${r.error?.message || `exit ${r.status}`}) — profile fixtures not verified`,
    );
    return true;
  }
  const dirty = r.stdout.trim();
  if (dirty) {
    bad(
      `fixtures/profiles has local modifications — commit or revert them first:\n${dirty}`,
    );
    return false;
  }
  for (const f of PROFILE_FIXTURES)
    if (!existsSync(join(PROFILES_DIR, f))) {
      bad(`missing fixture ${join(PROFILES_DIR, f)}`);
      return false;
    }
  ok("fixtures/profiles clean in git");
  return true;
}

/** Informational: what phase s1's already-installed short-circuits rely on. */
function reportSdkState(paths, selected) {
  if (!selected.includes("s1-sdk-idempotent")) return;
  const facts = [
    ["platforms/tizen-10.0", join(paths.sdkRoot, "platforms", "tizen-10.0")],
    [".tv-sdk-installed marker", join(paths.sdkRoot, ".tv-sdk-installed")],
  ];
  for (const [label, p] of facts)
    (existsSync(p) ? ok : warn)(
      `${label}: ${existsSync(p) ? "present" : "MISSING — the matching s1 TC would try a real install"}`,
    );
  const wl = spawnSync("dotnet", ["workload", "list"], {
    encoding: "utf-8",
    timeout: 60_000,
  });
  const hasTizen = /\btizen\b/i.test(wl.stdout || "");
  (hasTizen ? ok : warn)(
    `dotnet Tizen workload: ${hasTizen ? "installed" : "not listed — dotnet-setup.* would install it"}`,
  );
  const fx = parseFixturesEnv(
    readFileSync(join(TESTS, "fixtures", "fixtures.env"), "utf-8"),
  );
  const repo = process.env.TC_CUSTOM_REPO_URL || fx.TC_CUSTOM_REPO_URL;
  note(
    `s1 --repo-url TCs validate ${repo} over the network (pkg_list download) before the short-circuit`,
  );
}

// ── Installer phases: host checks ─────────────────────────────────────────

const pkgListName = () =>
  ({ win32: "pkg_list_windows-64", darwin: "pkg_list_macos-64" })[
    process.platform
  ] || "pkg_list_ubuntu-64";

/**
 * What the real installers need from this host, beyond the normal preflight:
 * the throwaway home is fresh, its drive has the space sdk.js will demand,
 * the repository answers, and on Windows long paths are already enabled —
 * otherwise tizen-sdk-install.ps1 opens a UAC prompt and a headless run
 * hangs on it.
 */
async function checkInstallerHost(scratchHome, s2Selected) {
  let fine = true;
  if (process.platform === "win32") {
    let enabled = null;
    try {
      enabled = powershell(
        "(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled",
      );
    } catch (e) {
      warn(`LongPathsEnabled not readable: ${e.message}`);
    }
    if (enabled === "1")
      ok("Windows LongPathsEnabled = 1 (installer will not ask for elevation)");
    else {
      bad(
        `Windows LongPathsEnabled is ${enabled || "unset"} — tizen-sdk-install.ps1 would open a UAC prompt; enable it first (admin: New-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD)`,
      );
      fine = false;
    }
  }
  if (s2Selected) {
    if (existsSync(scratchHome) && readdirSync(scratchHome).length) {
      bad(`scratch home ${scratchHome} exists and is not empty`);
      fine = false;
    } else ok(`scratch home ${scratchHome} (fresh)`);
    try {
      const probe = existsSync(scratchHome)
        ? scratchHome
        : dirname(scratchHome);
      const st = statfsSync(probe);
      const freeGb = (Number(st.bavail) * Number(st.bsize)) / 1024 ** 3;
      (freeGb >= INSTALL_MIN_FREE_GB ? ok : bad)(
        `${freeGb.toFixed(1)} GB free on the scratch drive (installer needs ${INSTALL_MIN_FREE_GB})`,
      );
      if (freeGb < INSTALL_MIN_FREE_GB) fine = false;
    } catch (e) {
      warn(`free space not measurable (${e.message}) — sdk.js will check it`);
    }
    const fx = parseFixturesEnv(
      readFileSync(join(TESTS, "fixtures", "fixtures.env"), "utf-8"),
    );
    const repo = (
      process.env.TC_CUSTOM_REPO_URL ||
      fx.TC_CUSTOM_REPO_URL ||
      ""
    ).replace(/\/+$/, "");
    const url = `${repo}/${pkgListName()}`;
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(15_000),
      });
      (res.ok ? ok : warn)(`${url} → HTTP ${res.status}`);
    } catch (e) {
      // A proxy-only network makes this probe fail while PowerShell's
      // downloads still work, so it is a warning, not a gate.
      warn(
        `${url} not reachable from node (${e.cause?.message || e.message}) — the installer will tell`,
      );
    }
  }
  return fine;
}

/**
 * Environment for one phase. Installer phases get the inline-installer toggle
 * and a longer script timeout (execPluginScript defaults to 30 min); the home
 * phase additionally moves the home directory to the scratch dir and drops
 * TIZEN_SDK_PATH, which Get-SdkPath (common/scripts/lib/common.ps1) would
 * otherwise resolve to the host's SDK. createScratchHome() also creates
 * AppData\Roaming and AppData\Local under the scratch home: PowerShell 5.1
 * resolves LocalAppData as %USERPROFILE%\AppData\Local and, when that folder
 * is missing, writes its ModuleAnalysisCache relative to the runner's cwd
 * (tests/Microsoft/...). APPDATA/LOCALAPPDATA are moved as well for tools
 * that read the variables directly.
 */
function phaseEnv(name, base, scratchHome) {
  if (!INSTALLER_PHASES.includes(name)) return base;
  const env = {
    ...base,
    TIZEN_SDK_INLINE_INSTALLER: "1",
    TIZEN_TOOL_TIMEOUT: "3600000",
  };
  if (name === HOME_PHASE) {
    createScratchHome(scratchHome); // also drops the ownership marker the teardown requires
    env.APPDATA = join(scratchHome, "AppData", "Roaming");
    env.LOCALAPPDATA = join(scratchHome, "AppData", "Local");
    env.USERPROFILE = scratchHome;
    env.HOME = scratchHome;
    delete env.TIZEN_SDK_PATH;
  }
  return env;
}

function keystoreDir(paths) {
  return join(paths.dataPath, "keystore");
}

function keystoreLeftovers(paths) {
  const found = [];
  for (const [sub, names] of Object.entries(KEYSTORE_FILES))
    for (const n of names)
      if (existsSync(join(keystoreDir(paths), sub, n)))
        found.push(`${sub}/${n}`);
  return found;
}

// ── Phase hooks ───────────────────────────────────────────────────────────
//
// Same contract as run-device-tier.mjs: each hook receives the context, returns
// true when its precondition holds, false otherwise (listed in the summary and
// the run exits 1); exceptions are caught by attempt().

/** k2 (and teardown): remove the certificates the k2 TCs (re)create. */
function cleanKeystore({ paths }) {
  const before = keystoreLeftovers(paths);
  for (const rel of before) {
    const [sub, name] = rel.split("/");
    rmSync(join(keystoreDir(paths), sub, name), { force: true });
  }
  const after = keystoreLeftovers(paths);
  if (after.length) {
    bad(`keystore still has ${after.join(", ")}`);
    return false;
  }
  ok(
    `keystore clean (${before.length ? `removed ${before.join(", ")}` : "nothing to remove"})`,
  );
  return true;
}

/** k3 (and teardown): committed profile fixtures back to their backup; scratch profiles.xml gone. */
function resetProfileFixtures({ backupDir, fixtureEnv }) {
  for (const f of PROFILE_FIXTURES) {
    const src = join(backupDir, f);
    if (!existsSync(src)) {
      bad(`no backup of ${f} in ${backupDir}`);
      return false;
    }
    copyFileSync(src, join(PROFILES_DIR, f));
  }
  ok(`fixtures/profiles restored from ${backupDir}`);
  if (fixtureEnv.FIXTURE_TMP_DIR) {
    const scratchDir = join(fixtureEnv.FIXTURE_TMP_DIR, "profiles");
    mkdirSync(scratchDir, { recursive: true });
    const scratch = join(scratchDir, "created-profiles.xml");
    const existed = existsSync(scratch);
    rmSync(scratch, { force: true });
    ok(`scratch profiles.xml ${existed ? "removed" : "absent"} (${scratch})`);
  }
  return true;
}

/** p1: an empty FIXTURE_PROJECTS_DIR (create-project.* then start from scratch). */
function resetProjectsDir({ fixtureEnv }) {
  // guardedScratchDir: real path strictly inside tests/fixtures/apps, no
  // symlink/junction, no other drive — the value comes from a user-editable file.
  const dir = guardedScratchDir(
    fixtureEnv.FIXTURE_PROJECTS_DIR,
    "FIXTURE_PROJECTS_DIR",
  );
  if (!dir) return false;
  const n = emptyDir(dir);
  ok(`emptied ${dir} (${n} entr${n === 1 ? "y" : "ies"} removed)`);
  return true;
}

const PHASE_HOOKS = {
  "k2-cert-keystore": [cleanKeystore],
  "k3-cert-profiles": [resetProfileFixtures],
  "p1-projects": [resetProjectsDir],
};

// ── Runner phases ─────────────────────────────────────────────────────────

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
  killTree(currentChild);
}

/** Installed only while the teardown runs: log and keep restoring. */
function shieldTeardown(signal) {
  log(color("yellow", `\n! ${signal} ignored — teardown in progress`));
}

function runPhase(name, env, includeDrafts) {
  return new Promise((done) => {
    // Installer phases never filter on status: they only run when asked for,
    // and their TCs are the ones this run promotes.
    const drafts = includeDrafts || INSTALLER_PHASES.includes(name);
    const args = [
      RUNNER,
      "--tier=mutating",
      ...(drafts ? [] : ["--status=approved"]),
      `--order=${ORDER}`,
      `--phase=${name}`,
    ];
    // cwd = tests/: the certificate TCs pass `fixtures/...` relative paths.
    const child = spawn(process.execPath, args, {
      cwd: TESTS,
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

/** Run one hook/teardown step; returns false when it threw or returned false. */
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
  if (opts.restoreUserEnv) {
    // Recovery after a killed installer run: only the User environment.
    step(`restore User environment from ${opts.restoreUserEnv}`);
    process.exitCode = restoreUserEnv(opts.restoreUserEnv) ? 0 : 1;
    return;
  }
  const order = parseYaml(readFileSync(ORDER, "utf-8"));
  const phases = order.phases.map((p) => p.name);
  const selected = opts.phase
    ? phases.filter((p) => p === opts.phase)
    : phases.filter(
        (p) => opts.withInstallers || !INSTALLER_PHASES.includes(p),
      );
  if (opts.phase && !selected.length) {
    console.error(`unknown phase ${opts.phase}; have ${phases.join(", ")}`);
    process.exit(2);
  }
  const installerPhases = selected.filter((p) => INSTALLER_PHASES.includes(p));
  const s2Selected = selected.includes(HOME_PHASE);

  const scratch =
    opts.scratch ||
    join(
      tmpdir(),
      `tizen-mutating-run-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
  mkdirSync(scratch, { recursive: true });
  const scratchHome = join(scratch, "home");
  const userEnvSnapshot = join(scratch, "user-env.json");
  const logFile = join(scratch, "run.log");
  setLogFile(logFile);
  log(
    color(
      "cyan",
      `tizen-sdk mutating-tier run — ${opts.yes ? "LIVE" : "plan only (no --yes)"}${opts.includeDrafts ? ", drafts included" : ""}${installerPhases.length ? `, installers: ${installerPhases.join(" ")}` : ""}`,
    ),
  );
  note(`scratch/log: ${scratch}`);

  // 1. Preflight (read-only)
  step("preflight");
  let fine = checkDistFresh();
  fine = checkDoctor() && fine;
  const paths = resolvePaths();
  fine = !!paths && fine;
  const fixtureEnv = loadFixtureEnv(selected, { prepareHint: PREPARE_HINT });
  fine = !!fixtureEnv && fine;
  fine = checkProfileFixturesClean() && fine;
  if (installerPhases.length)
    fine = (await checkInstallerHost(scratchHome, s2Selected)) && fine;
  if (!fine) {
    bad("preflight failed — nothing was changed");
    process.exitCode = 2;
    return;
  }
  reportSdkState(paths, selected);
  const leftovers = keystoreLeftovers(paths);
  note(
    `keystore ${keystoreDir(paths)}: ${leftovers.length ? `test certificates present (${leftovers.join(", ")})` : "no test certificates"}`,
  );
  const runnerEnv = { ...process.env, ...fixtureEnv };

  // 2. Plan
  step("plan");
  log(`  phases: ${selected.join(" → ")}`);
  log(
    `  TC filter: --tier=mutating${opts.includeDrafts ? " (drafts included — the order file may list draft ids)" : " --status=approved"}${installerPhases.length ? ` (installer phases always run their drafts)` : ""}`,
  );
  if (!opts.withInstallers && !opts.phase)
    note(
      `installer phases skipped: ${INSTALLER_PHASES.join(", ")} (--with-installers)`,
    );
  log(`  runner cwd: ${TESTS}`);
  if (installerPhases.length) {
    log(
      `  installer env: TIZEN_SDK_INLINE_INSTALLER=1 TIZEN_TOOL_TIMEOUT=3600000`,
    );
    if (s2Selected) {
      log(
        `  ${HOME_PHASE}: USERPROFILE/HOME=${scratchHome}, TIZEN_SDK_PATH removed → SDK installs into ${join(scratchHome, "tizen-sdk")} (~10 GB, 60-90 min)`,
      );
      log(
        `  backup: User ${USER_ENV_KEYS.join("/")} → ${userEnvSnapshot}; restored in the teardown (tizen-sdk-install.ps1 rewrites them)`,
      );
      log(
        `  teardown: ${opts.keepScratchSdk ? `keep ${scratchHome} (--keep-scratch-sdk)` : `delete ${scratchHome}`}`,
      );
    }
    if (installerPhases.includes("s3-dotnet-workload"))
      log(
        `  s3-dotnet-workload: reinstalls the host's real .NET Tizen workload (no redirect)`,
      );
  }
  for (const name of selected) {
    const hooks = PHASE_HOOKS[name];
    if (hooks) log(`  before ${name}: ${hooks.map((h) => h.name).join(", ")}`);
  }
  log(
    `  backup: ${PROFILE_FIXTURES.join(", ")} → ${scratch}; restored before k3 and at the end`,
  );
  log(
    `  teardown: restore fixtures/profiles; delete the scratch profiles.xml; cleanKeystore (${Object.entries(
      KEYSTORE_FILES,
    )
      .map(
        ([s, n]) =>
          `${s}/{${n
            .map((x) => x.replace(/\.(p12|pwd)$/, ""))
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(",")}}.{p12,pwd}`,
      )
      .join(
        ", ",
      )}); keep ${fixtureEnv.FIXTURE_PROJECTS_DIR || "the projects dir"}`,
  );
  if (!opts.yes) {
    log(
      color(
        "yellow",
        "\nplan only — re-run with --yes to execute (destructive: see the header of this script)",
      ),
    );
    return;
  }

  // 3. Backup
  step("backup");
  const backupDir = join(scratch, "profiles.bak");
  mkdirSync(backupDir, { recursive: true });
  for (const f of PROFILE_FIXTURES) {
    copyFileSync(join(PROFILES_DIR, f), join(backupDir, f));
    ok(`backed up ${f}`);
  }
  let userEnvSaved = false;
  if (s2Selected) {
    const snap = readUserEnv();
    if (snap) {
      const invalid = validateUserEnvSnapshot(snap);
      if (invalid) {
        bad(`User environment snapshot unusable (${invalid}) — not starting`);
        process.exitCode = 2;
        return;
      }
      writeFileSync(userEnvSnapshot, JSON.stringify(snap, null, 2), "utf-8");
      userEnvSaved = true;
      ok(`backed up User ${USER_ENV_KEYS.join("/")} → ${userEnvSnapshot}`);
      note(
        `if this process is killed before its teardown: node scripts/run-mutating-tier.mjs --restore-user-env="${userEnvSnapshot}"`,
      );
    } else note("User environment snapshot: not applicable on this platform");
  }

  // 4. Phases
  const results = [];
  const hookFailures = [];
  const teardownFailures = [];
  const started = Date.now();
  const ctx = { paths, opts, fixtureEnv, backupDir };
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
      const code = await runPhase(
        name,
        phaseEnv(name, runnerEnv, scratchHome),
        opts.includeDrafts,
      );
      results.push({ name, code, sec: Math.round((Date.now() - t0) / 1000) });
      (code === 0 ? ok : bad)(
        `phase ${name} exit ${code} (${results.at(-1).sec}s)`,
      );
    }
  } finally {
    // 5. Teardown — always: after a failed phase, an exception, or Ctrl+C.
    // Every step is attempted; a failure in one never skips the next. A second
    // Ctrl+C during the teardown is swallowed (default handling would kill the
    // process mid-restore and leave the fixtures/keystore modified); the
    // result of every step is recorded and fails the run.
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    process.on("SIGINT", shieldTeardown);
    process.on("SIGTERM", shieldTeardown);
    step(aborted ? "teardown (interrupted)" : "teardown");
    const td = (label, fn) => {
      if (!attempt(label, fn)) teardownFailures.push(label);
    };
    // Host-visible state first: an installer PowerShell that outlived its
    // runner (timeout, Ctrl+C) would rewrite the User environment after the
    // restore, so stop those before putting Path/TIZEN_SDK_PATH back. The
    // profile fixtures and keystore are recoverable from git either way.
    if (s2Selected)
      td("stop orphaned installer scripts", () => {
        const stopped = stopOrphanedInstallers();
        if (!stopped.length) {
          ok("no installer PowerShell process left running");
          return true;
        }
        warn(`stopped ${stopped.length} installer PowerShell process(es):`);
        for (const { pid, commandLine } of stopped)
          note(`  pid ${pid}: ${commandLine.slice(0, 200)}`);
        return true;
      });
    if (userEnvSaved)
      td("restore User environment", () => restoreUserEnv(userEnvSnapshot));
    td("restore profile fixtures", () => resetProfileFixtures(ctx));
    td("clean keystore", () => cleanKeystore(ctx));
    if (s2Selected) {
      if (opts.keepScratchSdk)
        note(`scratch home kept (--keep-scratch-sdk): ${scratchHome}`);
      else
        td("remove scratch home", () =>
          removeScratchHome(scratchHome, scratch),
        );
    }
    // Self-check of the invariant the driver promises: the committed fixtures
    // are byte-identical to git after the run.
    td("fixtures/profiles clean in git", () => checkProfileFixturesClean());
    note(
      `${fixtureEnv.FIXTURE_PROJECTS_DIR || "projects dir"} kept for triage (emptied before the next p1)`,
    );
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
