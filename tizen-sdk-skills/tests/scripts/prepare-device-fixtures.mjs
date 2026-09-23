#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Build the host-side fixtures the device-tier TCs point at through
 * ${FIXTURE_*} placeholders (see fixtures/fixtures.env), and write their
 * absolute values to fixtures/apps/fixtures.generated.env for
 * scripts/run-device-tier.mjs.
 *
 *   node scripts/prepare-device-fixtures.mjs                 # everything (first run: 6-12 min)
 *   node scripts/prepare-device-fixtures.mjs --skip-build    # re-read ids/artifacts, rewrite the env
 *   node scripts/prepare-device-fixtures.mjs --only=web,tmp  # a subset (native,dotnet,web,tmp,playwright,projects)
 *   node scripts/prepare-device-fixtures.mjs --only=tmp,projects  # minimal prepare for run-mutating-tier.mjs
 *   node scripts/prepare-device-fixtures.mjs --clean         # delete fixtures/apps/ first
 *   node scripts/prepare-device-fixtures.mjs --replace-profile  # replace a myProfile that points
 *                                                                # at another certificate
 *
 * What it produces under tests/fixtures/apps/ (gitignored):
 *
 *   MyNativeApp/   native BasicUI project, Debug build   → FIXTURE_NATIVE_TPK, _BIN, _APP_ID, _EXEC
 *   MyDotNetApp/   dotnet TizenNUITemplate, Debug build  → FIXTURE_DOTNET_TPK, _APP_ID
 *   MyWebApp01/    webapp Basic, Debug build             → FIXTURE_WEB_WGT, _APP_ID
 *   tmp/           FIXTURE_TMP_DIR: config.xml (push source), logs/ (pull target),
 *                  shots/ (screenshot --output), emulator-images/ (create-image
 *                  --output-dir, which em-cli refuses to create itself),
 *                  test-project/ (package.json + `npm install playwright`; the
 *                  test file itself is written by playwright-test.scaffold),
 *                  profiles/ (scratch profiles.xml for create-profile)
 *   projects/      FIXTURE_PROJECTS_DIR: scratch parent dir for the mutating tier's
 *                  create-project / build-project / project-delete TCs
 *   fixtures.generated.env
 *
 * Why the apps are built rather than committed: the plugin cannot create a
 * project with a chosen app id (native ids are org.example.<lowercased name>,
 * .NET ids org.tizen.example.<name>, web ids get a random 10-char package
 * prefix each time), so the ids are read back from tizen-manifest.xml /
 * config.xml after the build and exported for the TC argv.
 *
 * Signing: the builds pass --sign-profile myProfile. The script creates that
 * profile from fixtures/certs/test-fixture-author.p12 (unlock value:
 * FIXTURE_CERT_UNLOCK from fixtures.env, overridable via the environment,
 * handed to certificate-manager through a temporary password file) and seeds
 * the .pwd sidecar next to the .p12 (gitignored; tz re-encodes it). An
 * existing myProfile that already points at the fixture cert is kept; one
 * that points at another certificate stops the script unless
 * --replace-profile is given, which removes and recreates it.
 *
 * Network: the first dotnet build restores NuGet packages; `npm install
 * playwright` downloads the package (~40 MB, no browsers). Idempotent:
 * create-project uses --force, npm install is skipped when playwright is
 * already resolvable, the .pwd sidecar is only written when missing.
 *
 * Exit 1 on the first failed step (the step name and the envelope's first
 * error are printed); re-run with --skip-build to resume after a fix that
 * does not need a rebuild.
 */

import {
  copyFileSync,
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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parseFixturesEnv } from "../runner.mjs";
import {
  FIXTURE_APPS_DIR,
  FIXTURE_GENERATED_ENV,
  TESTS,
  bad,
  checkDistFresh,
  checkDoctor,
  color,
  firstError,
  log,
  note,
  ok,
  readGeneratedFixtureEnv,
  resolvePaths,
  sdk,
  step,
  warn,
} from "./lib/driver-common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ENV = join(TESTS, "fixtures", "fixtures.env");
const CERT_P12 = join(TESTS, "fixtures", "certs", "test-fixture-author.p12");
const CERT_PWD = CERT_P12.replace(/\.p12$/, ".pwd");
const PROFILE = "myProfile";

const PROJECTS = {
  native: {
    name: "MyNativeApp",
    type: "native",
    template: "BasicUI",
    ext: ".tpk",
    buildTimeoutSec: 300,
  },
  dotnet: {
    name: "MyDotNetApp",
    type: "dotnet",
    template: "TizenNUITemplate",
    ext: ".tpk",
    buildTimeoutSec: 900, // first build restores NuGet packages
  },
  web: {
    name: "MyWebApp01",
    type: "webapp",
    template: "Basic",
    ext: ".wgt",
    buildTimeoutSec: 120,
  },
};
const ALL_PARTS = ["native", "dotnet", "web", "tmp", "playwright", "projects"];

// ── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    only: new Set(ALL_PARTS),
    skipBuild: false,
    clean: false,
    replaceProfile: false,
  };
  for (const a of argv) {
    if (a === "--skip-build") opts.skipBuild = true;
    else if (a === "--clean") opts.clean = true;
    else if (a === "--replace-profile") opts.replaceProfile = true;
    else if (a.startsWith("--only=")) {
      const parts = a
        .slice(7)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const unknown = parts.filter((p) => !ALL_PARTS.includes(p));
      if (!parts.length || unknown.length) {
        console.error(
          `--only: unknown part(s) ${unknown.join(", ") || "(none given)"}; have ${ALL_PARTS.join(", ")}`,
        );
        process.exit(2);
      }
      opts.only = new Set(parts);
    } else if (a === "--help" || a === "-h") {
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

// ── Helpers ───────────────────────────────────────────────────────────────

class StepError extends Error {
  constructor(stepName, message) {
    super(message);
    this.stepName = stepName;
  }
}
const fail = (stepName, message) => {
  throw new StepError(stepName, message);
};

/** Forward slashes everywhere: the values end up in argv and YAML-adjacent text. */
const fwd = (p) => p.replace(/\\/g, "/");

/** Run a host tool (argv array, no shell) and return trimmed stdout or null. */
function tool(cmd, args, { timeoutMs = 60_000, cwd } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf-8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
    cwd,
  });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || "").trim();
}

/**
 * npm without the .cmd shim (execFile refuses it on Windows): run npm-cli.js
 * with the current node. Falls back to a shell `npm` on hosts with an
 * unusual layout.
 */
function npm(args, { cwd, timeoutMs }) {
  const nodeDir = dirname(process.execPath);
  const candidates = [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const cli = candidates.find((p) => existsSync(p));
  const r = cli
    ? spawnSync(process.execPath, [cli, ...args], {
        encoding: "utf-8",
        timeout: timeoutMs,
        stdio: ["ignore", "pipe", "pipe"],
        cwd,
      })
    : spawnSync("npm", args, {
        encoding: "utf-8",
        timeout: timeoutMs,
        stdio: ["ignore", "pipe", "pipe"],
        cwd,
        shell: true,
      });
  return {
    status: r.status,
    out: ((r.stdout || "") + (r.stderr || "")).trim(),
    error: r.error,
  };
}

/** Depth-limited file search; returns absolute paths, newest first. */
function findFiles(dir, predicate, maxDepth = 6) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > maxDepth || !existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p, depth + 1);
      else if (predicate(p, entry.name)) found.push(p);
    }
  };
  walk(dir, 0);
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

function readXmlAttr(file, re, what) {
  const m = readFileSync(file, "utf-8").match(re);
  if (!m) fail("read ids", `${what} not found in ${file}`);
  return m[1];
}

// Same patterns the install script uses to read the launchable id
// (common/scripts/tizen-install-app/tizen-install-app.ps1, Get-ManifestAppId).
const RE_TPK_APPID =
  /<(?:ui|service|widget|watch)-application[^>]*\sappid=["']([^"']+)["']/;
const RE_TPK_EXEC =
  /<(?:ui|service|widget|watch)-application[^>]*\sexec=["']([^"']+)["']/;
const RE_WGT_APPID = /<tizen:application[^>]*\sid=["']([^"']+)["']/;

// ── Steps ─────────────────────────────────────────────────────────────────

function preflight() {
  step("preflight");
  let fine = checkDistFresh();
  fine = checkDoctor() && fine;
  const paths = resolvePaths();
  fine = !!paths && fine;
  const dotnet = tool("dotnet", ["--version"]);
  if (dotnet) ok(`dotnet ${dotnet}`);
  else {
    bad("dotnet not found on PATH (needed for the .NET fixture)");
    fine = false;
  }
  const npmVer = npm(["--version"], { timeoutMs: 30_000 });
  if (npmVer.status === 0) ok(`npm ${npmVer.out.split(/\r?\n/).pop()}`);
  else {
    bad(`npm not runnable: ${npmVer.error?.message || npmVer.out}`);
    fine = false;
  }
  if (!fine) fail("preflight", "fix the items above, then re-run");
  return paths;
}

/** Same file? Windows paths differ in case and slashes between tz and node. */
function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (p) => resolve(p).replace(/[\\/]+/g, "/");
  return process.platform === "win32"
    ? norm(a).toLowerCase() === norm(b).toLowerCase()
    : norm(a) === norm(b);
}

/**
 * Make sure signing profile `myProfile` uses the fixture certificate.
 *
 *   no myProfile                       → create it
 *   myProfile → fixture cert           → keep it (recreate with --replace-profile)
 *   myProfile → some other cert        → STOP; --replace-profile removes it first
 *
 * So the default never destroys a profile the user built themselves. The
 * unlock value is the committed throwaway fixture's, documented as non-secret
 * in fixtures.env; it still stays off the command line (a temp password file
 * in the certificate-manager's `VAR=value` format, deleted afterwards).
 */
function ensureSigningProfile(opts) {
  step(`signing profile ${PROFILE}`);
  if (!existsSync(CERT_P12))
    fail("signing", `fixture cert missing: ${CERT_P12}`);
  const unlock =
    process.env.FIXTURE_CERT_UNLOCK ||
    parseFixturesEnv(readFileSync(FIXTURES_ENV, "utf-8")).FIXTURE_CERT_UNLOCK;
  if (!unlock) fail("signing", "FIXTURE_CERT_UNLOCK is not defined");

  // tz keeps <cert>.pwd next to the .p12 (common/lib/core/certificate.js,
  // ensurePwdSidecar): seed it when missing (gitignored, mode 600 where that
  // means anything); `tz security-profiles add` rewrites it in its own
  // encoding (a DPAPI blob on Windows) when the profile is created.
  if (existsSync(CERT_PWD)) ok(`password sidecar present: ${CERT_PWD}`);
  else {
    writeFileSync(CERT_PWD, unlock, { encoding: "utf-8", mode: 0o600 });
    ok(`password sidecar written: ${CERT_PWD}`);
  }

  const list = sdk(["certificate-manager", "--action", "list-profiles"], {
    timeoutSec: 60,
  });
  if (list.status !== "success")
    fail("signing", `list-profiles: ${firstError(list)}`);
  const existing = (list.result?.profiles || []).find(
    (p) => p.name === PROFILE,
  );
  if (existing) {
    const key = existing.author?.key_path || "";
    if (samePath(key, CERT_P12) && !opts.replaceProfile) {
      ok(
        `profile ${PROFILE} already uses the fixture cert — kept (--replace-profile recreates it)`,
      );
      return;
    }
    if (!opts.replaceProfile)
      fail(
        "signing",
        `signing profile "${PROFILE}" exists and points at ${key || "(no author cert)"}, not the fixture cert. ` +
          `Re-run with --replace-profile to remove and recreate it (destructive), or rename that profile first.`,
      );
    const rm = sdk(
      [
        "certificate-manager",
        "--action",
        "remove-profile",
        "--profile-name",
        PROFILE,
      ],
      { timeoutSec: 60 },
    );
    if (rm.status !== "success")
      fail("signing", `remove-profile ${PROFILE}: ${firstError(rm)}`);
    warn(`removed existing profile ${PROFILE} (--replace-profile; was ${key})`);
  }

  const pwdFile = join(tmpdir(), `tizen-fixture-author-${process.pid}.pwd`);
  writeFileSync(pwdFile, `TIZEN_AUTHOR_CERTIFICATE_PASSWORD=${unlock}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  let created;
  try {
    created = sdk(
      [
        "certificate-manager",
        "--action",
        "create-profile",
        "--profile-name",
        PROFILE,
        "--author-cert",
        CERT_P12,
        "--author-password-file",
        pwdFile,
        "--distributor-type",
        "public",
        "--distributor-version",
        "new",
        "--active",
      ],
      { timeoutSec: 90 },
    );
  } finally {
    rmSync(pwdFile, { force: true });
  }
  if (created.status !== "success")
    fail("signing", `create-profile ${PROFILE}: ${firstError(created)}`);
  ok(
    `profile ${PROFILE} created from ${relative(TESTS, CERT_P12)} (active: ${created.result?.active ?? "?"})`,
  );
}

function createAndBuild(key, opts) {
  const p = PROJECTS[key];
  const projectDir = join(FIXTURE_APPS_DIR, p.name);
  if (opts.skipBuild) {
    step(`${key}: reuse ${p.name} (--skip-build)`);
    if (!existsSync(projectDir))
      fail(key, `${projectDir} does not exist — run without --skip-build`);
  } else {
    step(`${key}: create-project ${p.type}/${p.template} ${p.name}`);
    const created = sdk(
      [
        "create-project",
        "--type",
        p.type,
        "--template",
        p.template,
        "--parent-path",
        FIXTURE_APPS_DIR,
        "--name",
        p.name,
        "--force",
      ],
      { timeoutSec: 300 },
    );
    if (created.status !== "success")
      fail(`${key} create-project`, firstError(created));
    ok(`created ${created.result?.project_path || projectDir}`);

    step(`${key}: build-project Debug --sign-profile ${PROFILE}`);
    const t0 = Date.now();
    const built = sdk(
      [
        "build-project",
        "--project",
        projectDir,
        "--build-type",
        "Debug",
        "--sign-profile",
        PROFILE,
      ],
      { timeoutSec: p.buildTimeoutSec },
    );
    if (built.status !== "success")
      fail(`${key} build-project`, firstError(built));
    for (const w of built.details?.warnings || built.warnings || [])
      note(`warning: ${typeof w === "string" ? w : JSON.stringify(w)}`);
    ok(
      `built in ${Math.round((Date.now() - t0) / 1000)}s: ${(
        built.result?.artifacts || []
      )
        .map((a) => relative(FIXTURE_APPS_DIR, a.path))
        .join(", ")}`,
    );
  }

  // Artifact: prefer the envelope's list; --skip-build searches the tree.
  const artifacts = findFiles(projectDir, (_, n) => n.endsWith(p.ext));
  if (!artifacts.length)
    fail(key, `no ${p.ext} under ${projectDir} after the build`);
  const artifact = artifacts[0];
  ok(`${p.ext} ${relative(FIXTURE_APPS_DIR, artifact)}`);
  return { projectDir, artifact };
}

function readNativeIds(projectDir) {
  const manifest = join(projectDir, "tizen-manifest.xml");
  if (!existsSync(manifest)) fail("read ids", `missing ${manifest}`);
  const appId = readXmlAttr(manifest, RE_TPK_APPID, "appid");
  const exec = readXmlAttr(manifest, RE_TPK_EXEC, "exec");
  let bin = join(projectDir, "Debug", "tpk", "bin", exec);
  if (!existsSync(bin)) {
    const found = findFiles(
      projectDir,
      (p, n) => n === exec && /[\\/]bin[\\/]/.test(p),
    );
    if (!found.length)
      fail("read ids", `native binary ${exec} not found under ${projectDir}`);
    warn(`binary not at Debug/tpk/bin — using ${found[0]}`);
    bin = found[0];
  }
  ok(`native app id ${appId}, exec ${exec}`);
  return { appId, exec, bin };
}

function readDotnetId(projectDir) {
  const manifests = findFiles(
    projectDir,
    (_, n) => n === "tizen-manifest.xml",
    3,
  );
  if (!manifests.length)
    fail("read ids", `no tizen-manifest.xml under ${projectDir}`);
  const appId = readXmlAttr(manifests[0], RE_TPK_APPID, "appid");
  ok(`dotnet app id ${appId}`);
  return { appId };
}

function readWebId(projectDir) {
  const config = join(projectDir, "config.xml");
  if (!existsSync(config)) fail("read ids", `missing ${config}`);
  const appId = readXmlAttr(config, RE_WGT_APPID, "tizen:application id");
  ok(`web app id ${appId}`);
  return { appId, config };
}

function prepareTmp(webConfig) {
  step("tmp: FIXTURE_TMP_DIR layout");
  const tmp = join(FIXTURE_APPS_DIR, "tmp");
  // profiles/: scratch profiles.xml for certificate-manager.create-profile
  // (mutating tier), so the TC never touches the SDK's real profiles.xml.
  for (const d of [
    "logs",
    "shots",
    "emulator-images",
    "test-project",
    "profiles",
  ])
    mkdirSync(join(tmp, d), { recursive: true });
  const target = join(tmp, "config.xml");
  if (webConfig && existsSync(webConfig)) {
    copyFileSync(webConfig, target);
    ok(`config.xml copied from ${relative(FIXTURE_APPS_DIR, webConfig)}`);
  } else if (!existsSync(target)) {
    // Push source only; any small file will do when the web part was skipped.
    writeFileSync(
      target,
      '<?xml version="1.0" encoding="UTF-8"?>\n<widget xmlns="http://www.w3.org/ns/widgets" id="http://example.org/fixture" version="1.0.0"><name>fixture</name></widget>\n',
    );
    ok("config.xml written (placeholder — web part not selected)");
  } else ok("config.xml kept");
  ok(`${fwd(tmp)}/{config.xml,logs,shots,emulator-images,test-project}`);
  return tmp;
}

function preparePlaywright(tmp) {
  step("playwright: test-project/package.json + npm install");
  const project = join(tmp, "test-project");
  mkdirSync(project, { recursive: true });
  const pkg = join(project, "package.json");
  if (!existsSync(pkg)) {
    // Same content as the scaffold's renderPackageJson()
    // (common/lib/core/playwright-test-template.js).
    writeFileSync(
      pkg,
      JSON.stringify(
        {
          name: "tizen-playwright-tests",
          private: true,
          type: "commonjs",
          dependencies: { playwright: "^1.62.1" },
        },
        null,
        2,
      ) + "\n",
    );
    ok("package.json written");
  } else ok("package.json kept");

  const resolvable = () =>
    spawnSync(process.execPath, ["-e", "require.resolve('playwright')"], {
      cwd: project,
      stdio: "ignore",
      timeout: 30_000,
    }).status === 0;
  if (resolvable()) {
    ok("playwright already resolvable — npm install skipped");
    return;
  }
  const t0 = Date.now();
  const install = (extra) =>
    npm(["install", "--no-audit", "--no-fund", ...extra], {
      cwd: project,
      timeoutMs: 300_000,
    });
  let r = install([]);
  if (r.status !== 0) {
    // A plain-http registry in ~/.npmrc behind a corporate proxy answers 503
    // for every request (seen 2026-09-22); the https endpoint works. Retry
    // once with it before giving up.
    warn(
      `npm install failed (${r.error?.message || r.out.split(/\r?\n/).find((l) => /npm error/.test(l)) || `exit ${r.status}`}) — retrying with --registry=https://registry.npmjs.org/`,
    );
    r = install(["--registry=https://registry.npmjs.org/"]);
  }
  if (r.status !== 0)
    fail(
      "playwright npm install",
      r.error?.message || r.out.split(/\r?\n/).slice(-5).join(" | "),
    );
  if (!resolvable())
    fail(
      "playwright",
      "npm install finished but require.resolve('playwright') still fails",
    );
  ok(`playwright installed in ${Math.round((Date.now() - t0) / 1000)}s`);
}

function writeGeneratedEnv(values, { quiet = false } = {}) {
  if (!quiet) step(`write ${relative(TESTS, FIXTURE_GENERATED_ENV)}`);
  // Keep keys from a previous run that this (--only) run did not touch.
  const merged = { ...(readGeneratedFixtureEnv() || {}), ...values };
  const lines = [
    "# Generated by scripts/prepare-device-fixtures.mjs — do not edit, do not commit.",
    `# ${new Date().toISOString()} on ${process.platform}`,
    "# Absolute values for the ${FIXTURE_*} placeholders in tc/**.yaml; merged",
    "# into the runner's environment by scripts/run-device-tier.mjs.",
    ...Object.entries(merged).map(([k, v]) => `${k}=${v}`),
    "",
  ];
  mkdirSync(dirname(FIXTURE_GENERATED_ENV), { recursive: true });
  writeFileSync(FIXTURE_GENERATED_ENV, lines.join("\n"), "utf-8");
  return merged;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  log(
    color(
      "cyan",
      `tizen-sdk device-tier fixtures — parts: ${[...opts.only].join(", ")}${opts.skipBuild ? " (--skip-build)" : ""}${opts.clean ? " (--clean)" : ""}`,
    ),
  );
  log(color("gray", `  workspace: ${FIXTURE_APPS_DIR}`));

  if (opts.clean && existsSync(FIXTURE_APPS_DIR)) {
    // Only ever delete our own workspace under tests/fixtures/ — checked on
    // real paths so a junction named "apps" cannot redirect the delete.
    if (lstatSync(FIXTURE_APPS_DIR).isSymbolicLink())
      fail("clean", `refusing to delete ${FIXTURE_APPS_DIR}: symbolic link`);
    const rel = relative(
      realpathSync.native(TESTS),
      realpathSync.native(FIXTURE_APPS_DIR),
    );
    if (rel.startsWith("..") || isAbsolute(rel) || rel !== `fixtures${sep}apps`)
      fail("clean", `refusing to delete ${FIXTURE_APPS_DIR}`);
    rmSync(FIXTURE_APPS_DIR, { recursive: true, force: true });
    ok(`removed ${FIXTURE_APPS_DIR}`);
  }
  mkdirSync(FIXTURE_APPS_DIR, { recursive: true });

  preflight();

  const wantsBuild = ["native", "dotnet", "web"].some((k) => opts.only.has(k));
  if (wantsBuild && !opts.skipBuild) ensureSigningProfile(opts);

  // Persist after every part: a later part failing (typically `npm install`
  // behind a proxy) must not lose the ids the builds just produced.
  const values = {};
  const persist = (more) => {
    Object.assign(values, more);
    writeGeneratedEnv(values, { quiet: true });
  };
  let webConfig = null;
  if (opts.only.has("native")) {
    const { projectDir, artifact } = createAndBuild("native", opts);
    const ids = readNativeIds(projectDir);
    persist({
      FIXTURE_NATIVE_TPK: fwd(artifact),
      FIXTURE_NATIVE_BIN: fwd(ids.bin),
      FIXTURE_NATIVE_APP_ID: ids.appId,
      FIXTURE_NATIVE_EXEC: ids.exec,
    });
  }
  if (opts.only.has("dotnet")) {
    const { projectDir, artifact } = createAndBuild("dotnet", opts);
    persist({
      FIXTURE_DOTNET_TPK: fwd(artifact),
      FIXTURE_DOTNET_APP_ID: readDotnetId(projectDir).appId,
    });
  }
  if (opts.only.has("web")) {
    const { projectDir, artifact } = createAndBuild("web", opts);
    const ids = readWebId(projectDir);
    persist({ FIXTURE_WEB_WGT: fwd(artifact), FIXTURE_WEB_APP_ID: ids.appId });
    webConfig = ids.config;
  } else {
    const existing = join(FIXTURE_APPS_DIR, PROJECTS.web.name, "config.xml");
    if (existsSync(existing)) webConfig = existing;
  }
  let tmp = join(FIXTURE_APPS_DIR, "tmp");
  if (opts.only.has("tmp")) {
    tmp = prepareTmp(webConfig);
    persist({ FIXTURE_TMP_DIR: fwd(tmp) });
  }
  if (opts.only.has("playwright")) preparePlaywright(tmp);
  if (opts.only.has("projects")) {
    // Scratch parent dir for the mutating tier's create-project /
    // build-project / project-delete TCs; scripts/run-mutating-tier.mjs
    // empties it before phase p1-projects.
    step("projects: FIXTURE_PROJECTS_DIR");
    const projects = join(FIXTURE_APPS_DIR, "projects");
    mkdirSync(projects, { recursive: true });
    persist({ FIXTURE_PROJECTS_DIR: fwd(projects) });
    ok(fwd(projects));
  }

  const merged = writeGeneratedEnv(values);
  step("summary");
  const width = Math.max(...Object.keys(merged).map((k) => k.length));
  for (const [k, v] of Object.entries(merged))
    log(`  ${k.padEnd(width)}  ${v}`);
  log(
    color(
      "green",
      `\nfixtures ready — next: node ${relative(process.cwd(), join(HERE, "run-device-tier.mjs")) || "scripts/run-device-tier.mjs"} --include-drafts`,
    ),
  );
}

try {
  main();
} catch (e) {
  if (e instanceof StepError) {
    bad(`step "${e.stepName}" failed: ${e.message}`);
    log(
      color(
        "gray",
        "  fix the cause and re-run (add --skip-build when the apps are already built)",
      ),
    );
    process.exitCode = 1;
  } else {
    console.error(color("red", `fatal: ${e.stack || e.message}`));
    process.exitCode = 1;
  }
}
