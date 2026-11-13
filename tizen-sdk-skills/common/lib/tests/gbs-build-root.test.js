// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Platform (GBS) project detection and GBS output lookup.
 *
 *   - isPlatformProject(): packaging/*.spec plus a CMakeLists.txt at the root
 *     or nested (DALi keeps it in build/tizen/CMakeLists.txt); CMakeLists.txt
 *     deeper than three levels or a spec-less tree does not qualify
 *   - resolveGbsBuildRoot(): TIZEN_BUILD_ROOT > profile buildroot > [general]
 *     buildroot > ~/GBS-ROOT, with ~ / ${profile} / ${tmpdir} expanded, and the
 *     project's .gbs.conf ahead of ~/.gbs.conf
 *   - parseGbsLocalRepoDirs(): the path depanneur prints on the line after
 *     "generated RPM packages can be found from local repo:", ANSI codes and all
 *   - tizen-build-project.sh (Linux/macOS): a stubbed `gbs` that writes its RPM
 *     into a custom buildroot is found, and a nested-CMakeLists project is
 *     detected as Platform
 *
 * HOME points at a temporary directory, so the real ~/.gbs.conf is never read.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== GBS build root / Platform detection Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(`     got:      ${actual}\n     expected: ${expected}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gbs-build-root-"));
const home = path.join(tmp, "home");
fs.mkdirSync(home);
process.env.HOME = home;
process.env.USERPROFILE = home;
delete process.env.TIZEN_BUILD_ROOT;

const {
  isPlatformProject,
  resolveGbsBuildRoot,
  parseGbsLocalRepoDirs,
} = require("../core/project");

function mk(file, content = "") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

try {
  // --- isPlatformProject ---
  console.log("--- isPlatformProject ---");
  const rootCmake = path.join(tmp, "root-cmake");
  mk(path.join(rootCmake, "CMakeLists.txt"));
  mk(path.join(rootCmake, "packaging", "app.spec"));
  check("root CMakeLists.txt + spec", isPlatformProject(rootCmake), true);

  const dali = path.join(tmp, "dali-demo");
  mk(path.join(dali, "build", "tizen", "CMakeLists.txt"));
  mk(path.join(dali, "packaging", "dali-demo.spec"));
  check(
    "build/tizen/CMakeLists.txt + spec (DALi layout)",
    isPlatformProject(dali),
    true,
  );

  const tooDeep = path.join(tmp, "too-deep");
  mk(path.join(tooDeep, "a", "b", "c", "CMakeLists.txt"));
  mk(path.join(tooDeep, "packaging", "x.spec"));
  check("CMakeLists.txt four levels down", isPlatformProject(tooDeep), false);

  const inGit = path.join(tmp, "in-git");
  mk(path.join(inGit, ".git", "x", "CMakeLists.txt"));
  mk(path.join(inGit, "packaging", "x.spec"));
  check("CMakeLists.txt only under .git", isPlatformProject(inGit), false);

  const noSpec = path.join(tmp, "no-spec");
  mk(path.join(noSpec, "CMakeLists.txt"));
  mk(path.join(noSpec, "packaging", "README"));
  check("CMakeLists.txt without spec", isPlatformProject(noSpec), false);

  // --- resolveGbsBuildRoot ---
  console.log("\n--- resolveGbsBuildRoot ---");
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj);
  const userConf = path.join(home, ".gbs.conf");

  fs.writeFileSync(
    userConf,
    "[general]\nprofile = profile.tizen\nbuildroot = ~/custom_gbs_root/\n\n[profile.tizen]\nrepos = repo.a\n",
  );
  check(
    "[general] buildroot with ~",
    resolveGbsBuildRoot(proj),
    path.join(home, "custom_gbs_root"),
  );

  fs.writeFileSync(
    userConf,
    "[general]\nprofile = profile.tizen\nbuildroot = /srv/general\n\n[profile.tizen]\n# buildroot = /commented/out\nbuildroot = /srv/gbs/${profile}\n",
  );
  check(
    "profile buildroot wins, ${profile} expanded",
    resolveGbsBuildRoot(proj),
    "/srv/gbs/profile.tizen",
  );

  fs.writeFileSync(
    userConf,
    "[general]\ntmpdir = /data/tmp\nbuildroot = ${tmpdir}/gbs\n",
  );
  check(
    "${tmpdir} expanded from [general] tmpdir",
    resolveGbsBuildRoot(proj),
    "/data/tmp/gbs",
  );

  mk(path.join(proj, ".gbs.conf"), "[general]\nbuildroot = /srv/project\n");
  check(
    "project .gbs.conf ahead of ~/.gbs.conf",
    resolveGbsBuildRoot(proj),
    "/srv/project",
  );
  fs.unlinkSync(path.join(proj, ".gbs.conf"));

  process.env.TIZEN_BUILD_ROOT = "/srv/env-root";
  check("TIZEN_BUILD_ROOT wins", resolveGbsBuildRoot(proj), "/srv/env-root");
  delete process.env.TIZEN_BUILD_ROOT;

  fs.unlinkSync(userConf);
  if (fs.existsSync("/etc/gbs.conf")) {
    console.log("SKIP no gbs.conf → ~/GBS-ROOT (/etc/gbs.conf exists)");
  } else {
    check(
      "no gbs.conf → ~/GBS-ROOT",
      resolveGbsBuildRoot(proj),
      path.join(home, "GBS-ROOT"),
    );
  }

  // --- parseGbsLocalRepoDirs ---
  console.log("\n--- parseGbsLocalRepoDirs ---");
  const repo = path.join(tmp, "root", "local", "repos", "tizen", "x86_64");
  fs.mkdirSync(path.join(repo, "RPMS"), { recursive: true });
  fs.mkdirSync(path.join(repo, "SRPMS"), { recursive: true });
  const log = [
    "\x1b[32minfo: \x1b[0mfinished building app",
    "\x1b[32minfo: \x1b[0mgenerated RPM packages can be found from local repo:",
    `     ${path.join(repo, "RPMS")}`,
    "\x1b[32minfo: \x1b[0mgenerated source RPM packages can be found from local repo:",
    `     ${path.join(repo, "SRPMS")}`,
  ].join("\n");
  const dirs = parseGbsLocalRepoDirs(log);
  check("binary RPMS dir only", dirs.join("|"), path.join(repo, "RPMS"));
  check(
    "same-line path also accepted",
    parseGbsLocalRepoDirs(
      `info: generated RPM packages can be found from local repo: ${path.join(repo, "RPMS")}`,
    ).join("|"),
    path.join(repo, "RPMS"),
  );
  check(
    "missing directory ignored",
    parseGbsLocalRepoDirs(
      "info: generated RPM packages can be found from local repo:\n     /no/such/dir",
    ).length,
    0,
  );

  // --- tizen-build-project.sh with a stubbed gbs ---
  console.log("\n--- tizen-build-project.sh (stub gbs) ---");
  const gitCheck = spawnSync("git", ["--version"]);
  if (process.platform === "win32" || gitCheck.status !== 0) {
    console.log("SKIP shell end-to-end (needs bash and git)");
  } else {
    const script = path.resolve(
      __dirname,
      "../../scripts/tizen-build-project/tizen-build-project.sh",
    );
    const customRoot = path.join(tmp, "custom_gbs_root");
    fs.writeFileSync(
      path.join(home, ".gbs.conf"),
      `[general]\nprofile = profile.tizen\nbuildroot = ${customRoot}\n\n[profile.tizen]\nrepos = repo.a\n`,
    );
    const bin = path.join(tmp, "bin");
    // Writes the RPM into the configured buildroot (not ~/GBS-ROOT) and prints
    // the same local-repo lines depanneur prints.
    mk(
      path.join(bin, "gbs"),
      [
        "#!/usr/bin/env bash",
        `out="${customRoot}/local/repos/tizen/x86_64/RPMS"`,
        'mkdir -p "$out"',
        'touch "$out/dali-demo-1.0-1.x86_64.rpm"',
        'printf "\\033[32minfo: \\033[0mgenerated RPM packages can be found from local repo:\\n     %s\\n" "$out"',
      ].join("\n"),
    );
    fs.chmodSync(path.join(bin, "gbs"), 0o755);

    const runScript = (extraEnv = {}) =>
      spawnSync("bash", [script, "-w", dali], {
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:/usr/bin:/bin`,
          ...extraEnv,
        },
      });

    let res = runScript();
    check("nested-CMakeLists project builds (exit 0)", res.status, 0);
    check(
      "detected as Platform",
      /Detected project type: Platform/.test(res.stderr),
      true,
    );
    check(
      "RPM found under custom buildroot",
      res.stderr.includes(
        path.join(customRoot, "local/repos/tizen/x86_64/RPMS/dali-demo"),
      ),
      true,
    );

    // Without the log line, the gbs.conf buildroot alone must be enough.
    mk(
      path.join(bin, "gbs"),
      [
        "#!/usr/bin/env bash",
        `out="${customRoot}/local/repos/tizen/x86_64/RPMS"`,
        'mkdir -p "$out"',
        'touch "$out/dali-demo-1.0-2.x86_64.rpm"',
      ].join("\n"),
    );
    res = runScript();
    check("gbs.conf buildroot alone (exit 0)", res.status, 0);
    check(
      "RPM found via gbs.conf buildroot",
      res.stderr.includes("dali-demo-1.0-2.x86_64.rpm"),
      true,
    );
    if (res.status !== 0) console.log(res.stdout, res.stderr);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? "All tests passed" : `${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
