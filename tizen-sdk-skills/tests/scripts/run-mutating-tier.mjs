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
 *
 * Ctrl+C during a run stops after the current TC and still runs the teardown.
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
 * rewrite <sdk>/sdk.info and ~/.tizen.sdk.path.config). It never installs or
 * removes SDK packages. Without --yes nothing is changed.
 *
 * Windows-first: everything is spawned as `node <script>` directly (no .cmd
 * shims). Works the same on POSIX.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { parseFixturesEnv } from "../runner.mjs";
import {
  REPO,
  TESTS,
  bad,
  checkDistFresh,
  checkDoctor,
  color,
  emptyDir,
  guardedScratchDir,
  loadFixtureEnv,
  log,
  logChunk,
  note,
  ok,
  resolvePaths,
  setLogFile,
  step,
  warn,
} from "./lib/driver-common.mjs";

const RUNNER = join(TESTS, "runner.mjs");
const ORDER = join(TESTS, "policy", "mutating-run-order.yaml");
const PROFILES_DIR = join(TESTS, "fixtures", "profiles");
const PROFILE_FIXTURES = ["with-profile.xml", "with-profile-for-removal.xml"];
const PREPARE_HINT =
  "node scripts/prepare-device-fixtures.mjs --only=tmp,projects";

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
  const opts = { yes: false, includeDrafts: false, phase: null, scratch: null };
  for (const a of argv) {
    if (a === "--yes") opts.yes = true;
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
  if (currentChild) currentChild.kill();
}

/** Installed only while the teardown runs: log and keep restoring. */
function shieldTeardown(signal) {
  log(color("yellow", `\n! ${signal} ignored — teardown in progress`));
}

function runPhase(name, env, includeDrafts) {
  return new Promise((done) => {
    const args = [
      RUNNER,
      "--tier=mutating",
      ...(includeDrafts ? [] : ["--status=approved"]),
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
      `tizen-mutating-run-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
  mkdirSync(scratch, { recursive: true });
  const logFile = join(scratch, "run.log");
  setLogFile(logFile);
  log(
    color(
      "cyan",
      `tizen-sdk mutating-tier run — ${opts.yes ? "LIVE" : "plan only (no --yes)"}${opts.includeDrafts ? ", drafts included" : ""}`,
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
    `  TC filter: --tier=mutating${opts.includeDrafts ? " (drafts included — the order file may list draft ids)" : " --status=approved"}`,
  );
  log(`  runner cwd: ${TESTS}`);
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
      const code = await runPhase(name, runnerEnv, opts.includeDrafts);
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
    td("restore profile fixtures", () => resetProfileFixtures(ctx));
    td("clean keystore", () => cleanKeystore(ctx));
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
