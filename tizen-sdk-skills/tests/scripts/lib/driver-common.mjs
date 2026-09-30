// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Shared helpers for the host-side device-tier scripts
 * (scripts/run-device-tier.mjs, scripts/prepare-device-fixtures.mjs):
 * coloured logging with an optional tee file, plugin invocation through the
 * tizen-sdk launcher, the dist-freshness / --doctor preflight checks, and
 * SDK / sdb / data-path resolution.
 *
 * Windows-first: everything is spawned as `node <script>` directly (no .cmd
 * shims — execFile refuses them since CVE-2024-27980). Works the same on
 * POSIX, where the launcher path is identical.
 */

import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TESTS = resolve(HERE, "..", "..");
export const REPO = resolve(TESTS, "..");
export const LAUNCHER = join(REPO, "tizen-cli", "bin", "tizen-sdk.js");
export const DIST_BUNDLE = join(REPO, "tizen-cli", "dist", "tizen-sdk.js");
export const BUNDLE_SOURCES = [
  join(REPO, "common", "lib"),
  join(REPO, "common", "scripts"),
  join(REPO, "tizen-cli", "src"),
  join(REPO, "tizen-cli", "bin"),
];

/** Where prepare-device-fixtures.mjs builds the fixture apps (gitignored). */
export const FIXTURE_APPS_DIR = join(TESTS, "fixtures", "apps");
/** Absolute-path values for the ${FIXTURE_*} placeholders, written by prepare. */
export const FIXTURE_GENERATED_ENV = join(
  FIXTURE_APPS_DIR,
  "fixtures.generated.env",
);

// ── Output ────────────────────────────────────────────────────────────────

const C = { red: "31", green: "32", yellow: "33", cyan: "36", gray: "90" };
const ESC = String.fromCharCode(27);
export const color = (c, s) => `${ESC}[${C[c]}m${s}${ESC}[0m`;
// Built at runtime so eslint's no-control-regex does not trip on a literal ESC.
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
export const stripAnsi = (s) => s.replace(ANSI_RE, "");

let logFile = null;
/** Tee every log() line (ANSI-stripped) into `path`; null disables the tee. */
export function setLogFile(path) {
  logFile = path;
}
export function getLogFile() {
  return logFile;
}
export function log(line = "") {
  console.log(line);
  if (logFile) appendFileSync(logFile, stripAnsi(line) + "\n");
}
/** Raw passthrough for a child's stdout/stderr chunk (no newline added). */
export function logChunk(chunk) {
  process.stdout.write(chunk);
  if (logFile) appendFileSync(logFile, stripAnsi(chunk.toString()));
}
export const step = (s) => log(color("cyan", `\n▶ ${s}`));
export const ok = (s) => log(color("green", `  ✓ ${s}`));
export const warn = (s) => log(color("yellow", `  ! ${s}`));
export const bad = (s) => log(color("red", `  ✗ ${s}`));
export const note = (s) => log(color("gray", `  ${s}`));

// ── Plugin invocation ─────────────────────────────────────────────────────

/** The envelope is the last JSON object on stdout; log lines go to stderr. */
export function parseEnvelope(stdout) {
  const t = (stdout || "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}\s*$/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Run `tizen-sdk <argv>` through the launcher and return its envelope. A
 * missing envelope (timeout, crash, no JSON) is reported as a failure
 * envelope with error_code DRIVER_NO_ENVELOPE so callers have one shape.
 */
export function sdk(argv, { timeoutSec = 120, cwd, env } = {}) {
  const r = spawnSync(process.execPath, [LAUNCHER, ...argv], {
    encoding: "utf-8",
    timeout: timeoutSec * 1000,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    cwd,
    env: env || process.env,
  });
  const envelope = parseEnvelope(r.stdout);
  if (!envelope) {
    return {
      status: "failure",
      errors: [
        {
          error_code: "DRIVER_NO_ENVELOPE",
          message:
            (r.error && r.error.message) ||
            (r.stderr || "").trim().split("\n").slice(-3).join(" | ") ||
            `exit ${r.status}`,
        },
      ],
      stderr: r.stderr || "",
    };
  }
  return envelope;
}

export const firstError = (env) =>
  env?.errors?.[0]?.message || env?.errors?.[0]?.error_code || "unknown error";

// ── Preflight ─────────────────────────────────────────────────────────────

export function newestMtime(dir) {
  let newest = 0;
  let newestPath = null;
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "tests") continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        const m = statSync(p).mtimeMs;
        if (m > newest) {
          newest = m;
          newestPath = p;
        }
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return { newest, newestPath };
}

/** The dist bundle must be newer than every plugin source it is built from. */
export function checkDistFresh() {
  if (!existsSync(DIST_BUNDLE)) {
    bad(`plugin bundle missing: ${DIST_BUNDLE}`);
    return false;
  }
  const bundle = statSync(DIST_BUNDLE).mtimeMs;
  let stale = null;
  for (const src of BUNDLE_SOURCES) {
    const { newest, newestPath } = newestMtime(src);
    if (newest > bundle) stale = newestPath;
  }
  if (stale) {
    bad(`dist bundle is older than ${stale}`);
    log(`    rebuild first:  cd tizen-cli && pnpm build`);
    return false;
  }
  ok(`dist bundle is current (${new Date(bundle).toISOString()})`);
  return true;
}

/** `tizen-sdk --doctor` must return checks and none may be a failure. */
export function checkDoctor() {
  const env = sdk(["--doctor"], { timeoutSec: 90 });
  const checks = env?.result?.checks || [];
  if (env.status !== "success" || !checks.length) {
    bad(`--doctor did not return checks: ${firstError(env)}`);
    return false;
  }
  let fine = true;
  for (const c of checks) {
    const line = `${c.name}: ${c.message}`;
    if (c.status === "fail") {
      bad(line);
      fine = false;
    } else if (c.status === "warn") warn(line);
    else ok(line);
  }
  return fine;
}

/** Resolve the SDK root, its data path, sdb, em-cli and the bookmark list. */
export function resolvePaths() {
  const cfg = join(homedir(), ".tizen.sdk.path.config");
  let sdkRoot = null;
  if (existsSync(cfg)) {
    // The config file carries a UTF-8 BOM on some hosts; strip it.
    sdkRoot = readFileSync(cfg, "utf-8").trim();
    if (sdkRoot.charCodeAt(0) === 0xfeff) sdkRoot = sdkRoot.slice(1).trim();
  }
  if (!sdkRoot) sdkRoot = join(homedir(), "tizen-sdk");
  const sdkInfo = join(sdkRoot, "sdk.info");
  if (!existsSync(sdkInfo)) {
    bad(`no sdk.info under ${sdkRoot}`);
    return null;
  }
  const m = readFileSync(sdkInfo, "utf-8").match(/^TIZEN_SDK_DATA_PATH=(.+)$/m);
  const dataPath = m ? m[1].trim() : `${sdkRoot}-data`;
  const paths = {
    sdkRoot,
    dataPath,
    sdb: join(
      sdkRoot,
      "tools",
      process.platform === "win32" ? "sdb.exe" : "sdb",
    ),
    emuBin: join(sdkRoot, "tools", "emulator", "bin"),
    bookmarks: join(
      dataPath,
      "device-manager",
      "config",
      "remote_device_scan.list",
    ),
  };
  ok(`SDK ${sdkRoot}`);
  ok(`SDK data ${dataPath}`);
  if (!existsSync(paths.sdb)) {
    bad(`sdb not found at ${paths.sdb}`);
    return null;
  }
  return paths;
}

// ── sdb ───────────────────────────────────────────────────────────────────

/** Run sdb with an argv array (never a shell) and return {status, stdout, stderr}. */
export function sdbRun(paths, argv, { timeoutMs = 30_000 } = {}) {
  const r = spawnSync(paths.sdb, argv, {
    encoding: "utf-8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    error: r.error || null,
  };
}

/** Every `sdb devices` row as [serial, state, name?] (any state). */
export function sdbRows(paths) {
  return sdbRun(paths, ["devices"])
    .stdout.split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((cols) => cols.length >= 2 && cols[0]);
}

export function onlineEmulators(paths) {
  return sdbRows(paths)
    .filter((cols) => cols[1] === "device")
    .map((cols) => cols[0]);
}

export const sleep = (ms) =>
  spawnSync(process.execPath, ["-e", `setTimeout(()=>{}, ${ms})`]);

// ── Fixture env ───────────────────────────────────────────────────────────

/**
 * Which fixtures.generated.env keys each phase of policy/device-run-order.yaml
 * and policy/mutating-run-order.yaml needs: the ${FIXTURE_*} placeholders in
 * the argv of its TCs, plus what its hooks use (c2: the packages
 * deviceFixtures installs; c5*: the exec name debugCleanup kills; k3: the
 * scratch profiles.xml; p1: the projects dir). scripts/runner-helpers.test.mjs
 * checks the placeholder half against the TC files and that no phase name is
 * shared by the two order files, so a TC that starts using a new placeholder
 * fails the lint gate until it is listed here. Phases absent from this table
 * need no fixture.
 */
export const FIXTURE_NEEDS = {
  // device tier
  "b-vm-lifecycle": ["FIXTURE_TMP_DIR"],
  "c2-fixture-apps": [
    "FIXTURE_TMP_DIR",
    "FIXTURE_NATIVE_TPK",
    "FIXTURE_DOTNET_TPK",
    "FIXTURE_WEB_WGT",
  ],
  "c3-web-debug": ["FIXTURE_TMP_DIR", "FIXTURE_WEB_APP_ID"],
  "c4-dotnet-debug": ["FIXTURE_DOTNET_APP_ID"],
  "c5a-gdb-launch": [
    "FIXTURE_NATIVE_APP_ID",
    "FIXTURE_NATIVE_BIN",
    "FIXTURE_NATIVE_EXEC",
  ],
  "c5b-gdb-attach": [
    "FIXTURE_NATIVE_APP_ID",
    "FIXTURE_NATIVE_BIN",
    "FIXTURE_NATIVE_EXEC",
  ],
  "c5c-gdb-attach-bp": [
    "FIXTURE_NATIVE_APP_ID",
    "FIXTURE_NATIVE_BIN",
    "FIXTURE_NATIVE_EXEC",
  ],
  "c5d-gdb-serial": [
    "FIXTURE_NATIVE_APP_ID",
    "FIXTURE_NATIVE_BIN",
    "FIXTURE_NATIVE_EXEC",
  ],
  // mutating tier
  "k3-cert-profiles": ["FIXTURE_TMP_DIR"],
  "p1-projects": ["FIXTURE_PROJECTS_DIR"],
  "s2-sdk-installers": ["FIXTURE_ROOTSTRAP_ZIP"],
};
/**
 * Every key prepare-device-fixtures.mjs writes to fixtures.generated.env.
 * Placeholders outside this set (e.g. ${FIXTURE_CERT_UNLOCK}) come from
 * fixtures/fixtures.env and are not gated per phase.
 */
export const GENERATED_FIXTURE_KEYS = new Set([
  "FIXTURE_TMP_DIR",
  "FIXTURE_PROJECTS_DIR",
  "FIXTURE_NATIVE_TPK",
  "FIXTURE_NATIVE_BIN",
  "FIXTURE_NATIVE_APP_ID",
  "FIXTURE_NATIVE_EXEC",
  "FIXTURE_DOTNET_TPK",
  "FIXTURE_DOTNET_APP_ID",
  "FIXTURE_WEB_WGT",
  "FIXTURE_WEB_APP_ID",
  "FIXTURE_ROOTSTRAP_ZIP",
]);
/** Keys whose value is a path that must exist on disk (the rest are ids). */
export const FIXTURE_FILE_KEYS = new Set([
  "FIXTURE_TMP_DIR",
  "FIXTURE_PROJECTS_DIR",
  "FIXTURE_NATIVE_TPK",
  "FIXTURE_NATIVE_BIN",
  "FIXTURE_DOTNET_TPK",
  "FIXTURE_WEB_WGT",
  "FIXTURE_ROOTSTRAP_ZIP",
]);

/** A key is usable when set and, for path keys, present on disk. */
export const fixtureKeyOk = (env, k) =>
  Boolean(env[k]) && (!FIXTURE_FILE_KEYS.has(k) || existsSync(env[k]));

/**
 * Load fixtures.generated.env and gate a run on it: every key that a
 * SELECTED phase needs (FIXTURE_NEEDS) must be set and, for paths, exist —
 * otherwise the preflight fails (null → the caller exits 2) with the prepare
 * command to run. Keys only other phases need are reported as warnings, so a
 * phase without fixtures runs on a bare host and a partial prepare
 * (`--only=web,tmp`) is enough for `--phase=c3-web-debug`. The whole file is
 * always merged into the runner's environment when it exists.
 *
 * @param {string[]} selected - phase names about to run
 * @param {{prepareHint?: string}} [opts]
 * @returns {Record<string,string>|null}
 */
export function loadFixtureEnv(selected, { prepareHint } = {}) {
  const hint = prepareHint || "node scripts/prepare-device-fixtures.mjs";
  const needed = new Set(selected.flatMap((p) => FIXTURE_NEEDS[p] || []));
  const env = readGeneratedFixtureEnv();
  if (!env) {
    if (needed.size) {
      bad(`${FIXTURE_GENERATED_ENV} not found`);
      log(`    run first:  ${hint}`);
      return null;
    }
    note("no fixtures.generated.env (not needed by the selected phases)");
    return {};
  }
  const describe = (k) =>
    `${k}=${env[k] ? `${env[k]}${FIXTURE_FILE_KEYS.has(k) ? " (missing on disk)" : ""}` : "(unset)"}`;
  const missing = [...needed].filter((k) => !fixtureKeyOk(env, k));
  if (missing.length) {
    bad(
      `fixture(s) needed by the selected phases missing: ${missing.map(describe).join(", ")}`,
    );
    log(`    rebuild:  ${hint}`);
    return null;
  }
  const others = [...new Set(Object.values(FIXTURE_NEEDS).flat())].filter(
    (k) => !needed.has(k) && !fixtureKeyOk(env, k),
  );
  if (others.length)
    warn(
      `fixture(s) not needed by this run but missing: ${others.map(describe).join(", ")}`,
    );
  ok(
    `fixtures: ${needed.size} key(s) needed by the selected phases present (${Object.keys(env).length} values in fixtures.generated.env)`,
  );
  return env;
}

// ── Scratch-dir guard ─────────────────────────────────────────────────────

/**
 * The only directories a driver hook may empty are scratch dirs strictly
 * inside tests/fixtures/apps (`base`). The value comes from a generated env
 * file a user can edit, so the check is done on REAL paths:
 *   - `dir` is created if missing, then must not itself be a symlink/junction
 *     (a link named "projects" pointing at the home dir would otherwise pass
 *     a textual check and have its target emptied);
 *   - realpath(dir) must be strictly below realpath(base) — `relative()`
 *     must be non-empty, not start with "..", and not be absolute (on Windows
 *     `relative()` returns an absolute path for a different drive).
 * Returns the real path, or null after logging why.
 */
export function guardedScratchDir(dir, label, base = FIXTURE_APPS_DIR) {
  if (!dir) {
    warn(`${label}: no directory configured`);
    return null;
  }
  mkdirSync(base, { recursive: true });
  const realBase = realpathSync.native(base);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (lstatSync(dir).isSymbolicLink()) {
    bad(
      `${label}: refusing to empty ${dir} — it is a symbolic link / junction`,
    );
    return null;
  }
  const real = realpathSync.native(dir);
  const rel = relative(realBase, real);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    bad(
      `${label}: refusing to empty ${real} — not strictly inside ${realBase}`,
    );
    return null;
  }
  return real;
}

/**
 * Remove every entry of a directory returned by guardedScratchDir(). Entries
 * that are symlinks are unlinked, not followed (rmSync uses lstat).
 * @returns {number} entries removed
 */
export function emptyDir(realDir) {
  let n = 0;
  for (const entry of readdirSync(realDir)) {
    rmSync(join(realDir, entry), { recursive: true, force: true });
    n++;
  }
  return n;
}

// ── Installer phases: host processes, User environment, scratch home ──────
//
// Used by run-mutating-tier.mjs for the opt-in installer phases. Everything
// here that touches the host is deliberately narrow: exactly two User-scope
// environment values, one directory the run itself created, and only
// PowerShell processes running this repo's plugin scripts.

/** Run one PowerShell command (no profile, non-interactive); stdout or throw. */
export function powershell(command, { timeoutMs = 30_000 } = {}) {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (r.error) throw r.error;
  if (r.status !== 0)
    throw new Error((r.stderr || r.stdout || `exit ${r.status}`).trim());
  return (r.stdout || "").trim();
}

/** The User-scope values tizen-sdk-install.ps1 rewrites (Windows only). */
export const USER_ENV_KEYS = ["Path", "TIZEN_SDK_PATH"];

/**
 * Normalise a User-scope value for comparison: the registry cannot tell an
 * absent variable from an empty one the way .NET reports them (null vs ""),
 * and SetEnvironmentVariable deletes the variable for both.
 */
export const userEnvValue = (v) => (v === undefined || v === "" ? null : v);

/**
 * A snapshot is only usable when every key is present as its own property
 * with a string or null value. `$e.Path` on a missing property is $null in
 * PowerShell, and SetEnvironmentVariable(..., $null) DELETES the variable —
 * so a truncated or hand-edited snapshot must never reach the restore.
 * Returns null when valid, otherwise the reason.
 */
export function validateUserEnvSnapshot(snap) {
  if (!snap || typeof snap !== "object" || Array.isArray(snap))
    return "snapshot is not an object";
  for (const k of USER_ENV_KEYS) {
    if (!Object.hasOwn(snap, k)) return `snapshot lacks "${k}"`;
    if (snap[k] !== null && typeof snap[k] !== "string")
      return `snapshot "${k}" is not a string or null`;
  }
  return null;
}

/** User-scope Path / TIZEN_SDK_PATH as an object (Windows); null elsewhere. */
export function readUserEnv() {
  if (process.platform !== "win32") return null;
  const json = powershell(
    "[pscustomobject]@{" +
      USER_ENV_KEYS.map(
        (k) => `${k}=[Environment]::GetEnvironmentVariable('${k}','User')`,
      ).join(";") +
      "} | ConvertTo-Json -Compress",
  );
  return JSON.parse(json);
}

/**
 * Write the User-scope values back from `snapshotFile` and re-read them to
 * prove it. Refuses an invalid snapshot before touching anything. Safe to
 * run again by hand after a killed run:
 *   node scripts/run-mutating-tier.mjs --restore-user-env=<snapshotFile>
 */
export function restoreUserEnv(snapshotFile) {
  if (process.platform !== "win32") {
    note("User environment: nothing to restore on this platform");
    return true;
  }
  if (!existsSync(snapshotFile)) {
    bad(`no User-environment snapshot at ${snapshotFile}`);
    return false;
  }
  let want;
  try {
    want = JSON.parse(readFileSync(snapshotFile, "utf-8"));
  } catch (e) {
    bad(`User-environment snapshot unreadable: ${e.message}`);
    return false;
  }
  const invalid = validateUserEnvSnapshot(want);
  if (invalid) {
    bad(`refusing to restore from ${snapshotFile}: ${invalid}`);
    return false;
  }
  powershell(
    `$e = Get-Content -Raw -LiteralPath '${snapshotFile.replace(/'/g, "''")}' | ConvertFrom-Json; ` +
      USER_ENV_KEYS.map(
        (k) => `[Environment]::SetEnvironmentVariable('${k}', $e.${k}, 'User')`,
      ).join("; "),
  );
  const have = readUserEnv();
  const differ = USER_ENV_KEYS.filter(
    (k) => userEnvValue(have[k]) !== userEnvValue(want[k]),
  );
  if (differ.length) {
    bad(`User environment still differs after restore: ${differ.join(", ")}`);
    return false;
  }
  ok(`User ${USER_ENV_KEYS.join(" / ")} restored from ${snapshotFile}`);
  return true;
}

/** Marker the driver drops into the scratch home it creates; the delete needs it. */
export const SCRATCH_HOME_MARKER = ".tizen-mutating-scratch-home";
export const SCRATCH_HOME_NAME = "home";

/** Create <scratch>/home (and the AppData dirs) and mark it as ours. */
export function createScratchHome(scratchHome) {
  mkdirSync(join(scratchHome, "AppData", "Roaming"), { recursive: true });
  mkdirSync(join(scratchHome, "AppData", "Local"), { recursive: true });
  writeFileSync(
    join(scratchHome, SCRATCH_HOME_MARKER),
    `created by tests/scripts/run-mutating-tier.mjs ${new Date().toISOString()}\n`,
  );
}

/**
 * Why `scratchHome` may NOT be deleted, or null when it may: it must exist,
 * not be a symlink/junction, resolve to exactly `<realpath(scratch)>/home`
 * (the one directory the driver creates — never a nested path, a sibling,
 * another drive or the scratch dir itself), and carry SCRATCH_HOME_MARKER,
 * so a pre-existing `home` under a user-supplied --scratch is left alone.
 */
export function scratchHomeRemovable(scratchHome, scratch) {
  if (!scratchHome || !scratch) return "no directory configured";
  if (!existsSync(scratchHome)) return null; // nothing to delete
  if (lstatSync(scratchHome).isSymbolicLink()) return "it is a symbolic link";
  const rel = relative(
    realpathSync.native(scratch),
    realpathSync.native(scratchHome),
  );
  if (isAbsolute(rel) || rel !== SCRATCH_HOME_NAME)
    return `it is not <scratch>/${SCRATCH_HOME_NAME} (resolved to ${rel || "the scratch dir itself"})`;
  if (!existsSync(join(scratchHome, SCRATCH_HOME_MARKER)))
    return `it has no ${SCRATCH_HOME_MARKER} marker (not created by this driver)`;
  return null;
}

/** Delete <scratch>/home when scratchHomeRemovable() allows it. */
export function removeScratchHome(scratchHome, scratch) {
  const why = scratchHomeRemovable(scratchHome, scratch);
  if (why) {
    bad(`refusing to delete ${scratchHome}: ${why}`);
    return false;
  }
  if (!existsSync(scratchHome)) {
    note(`scratch home ${scratchHome} absent`);
    return true;
  }
  rmSync(scratchHome, { recursive: true, force: true });
  ok(`removed ${scratchHome}`);
  return true;
}

/**
 * Stop a spawned child together with its descendants. child.kill() on
 * Windows ends only the node process; the `cmd /c ... powershell` installer
 * it spawned would keep writing into the SDK — and into the User
 * environment — after the driver has moved on to its teardown.
 */
export function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], {
      stdio: "ignore",
      timeout: 30_000,
    });
  } else child.kill();
}

/** Where the runner's plugin scripts live; used to recognise our own PowerShell processes. */
export const PLUGIN_SCRIPTS_DIR = join(REPO, "tizen-cli", "dist", "scripts");

/** The script groups the installer phases run; only these are ever stopped. */
export const INSTALLER_SCRIPT_GROUPS = [
  "tizen-sdk-install",
  "tizen-sdk-install-custom-repo",
  "tizen-tv-sdk-install",
  "tizen-tv-sdk-install-from-zip",
  "tizen-update-package",
  "tizen-platform-install",
  "tizen-download-emulator-package",
  "tizen-download-mobile-platform",
  "tizen-install-rootstrap",
  "tizen-dotnet-setup",
];

/**
 * Kill PowerShell processes still running one of THIS repo's installer
 * scripts (a runner timeout kills node, not the script it spawned; left
 * alone, tizen-sdk-install.ps1 would rewrite the User environment after the
 * teardown restored it). Matches `-File "<PLUGIN_SCRIPTS_DIR>\<group>\..."`
 * for the installer groups only, and never the querying shell itself — its
 * own command line contains the same path, which is how an earlier version
 * matched (and stopped) itself. Returns [{pid, commandLine}] of what it
 * stopped; [] on non-Windows or when none were found.
 */
export function stopOrphanedInstallers() {
  if (process.platform !== "win32") return [];
  const dir = PLUGIN_SCRIPTS_DIR.replace(/'/g, "''");
  const patterns = INSTALLER_SCRIPT_GROUPS.map(
    (g) => `'*-File*${dir}\\${g}\\*'`,
  ).join(",");
  // $PID is the querying shell: its own command line carries every pattern.
  const out = powershell(
    `$pats = @(${patterns}); ` +
      `Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" | ` +
      `Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine } | ` +
      `Where-Object { $c = $_.CommandLine; @($pats | Where-Object { $c -like $_ }).Count -gt 0 } | ` +
      `ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; commandLine = $_.CommandLine } } | ` +
      `ConvertTo-Json -Compress`,
    { timeoutMs: 60_000 },
  );
  if (!out) return [];
  const parsed = JSON.parse(out);
  const found = (Array.isArray(parsed) ? parsed : [parsed]).filter((p) =>
    Number.isInteger(p?.pid),
  );
  for (const { pid } of found)
    spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], {
      stdio: "ignore",
      timeout: 30_000,
    });
  return found;
}

/**
 * Parse fixtures.generated.env (plain KEY=value lines, no _B64 handling —
 * the file is machine-written with absolute paths). Returns null when the
 * file does not exist.
 */
export function readGeneratedFixtureEnv(path = FIXTURE_GENERATED_ENV) {
  if (!existsSync(path)) return null;
  const env = {};
  for (const raw of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}
