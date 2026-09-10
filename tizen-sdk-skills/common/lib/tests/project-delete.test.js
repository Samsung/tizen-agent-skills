// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * deleteProject / isTizenProjectDir safety-gate tests
 *
 * deleteProject runs fs.rmSync(..., { recursive: true }) on the SDK host, so
 * every gate in front of it is load-bearing. The regressions these tests
 * guard (each was demonstrated live before the gates were hardened):
 *
 *  - a stray NON-Tizen config.xml qualified any directory for deletion
 *    (config.xml is a generic file name used by many tools)
 *  - a bare .sln in a SUBFOLDER qualified a whole workspace (~/repos) for
 *    deletion via the depth-1 DotNET-solution-layout check
 *  - path.resolve() is lexical, so a junction/symlink in the middle of the
 *    path defeated the home/root guards while rmSync wiped the real target
 *  - deleteProject on a symlink itself reported success while only the link
 *    was unlinked (the project survived — a silently wrong envelope)
 *  - the depth-1 marker descent (DotNET solution layout) qualified any
 *    WORKSPACE containing Tizen projects — deleteProject(~/tizen-apps) wiped
 *    every project at once; now the descent requires a top-level .sln
 *  - createProject --force had no protected-path guard, so
 *    --parent-path C:\Users --name <user> --force deleted the entire home
 *    directory when any immediate child carried a Tizen marker
 *
 * All fixtures live under a temp sandbox; nothing outside it is touched.
 * Junction creation (no admin needed on Windows) is skipped where symlinks
 * are unavailable.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createProject,
  deleteProject,
  isTizenProjectDir,
} = require("../core/project");

console.log("=== project-delete safety-gate Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-delete-test-"));
const mk = (p, content) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content !== undefined ? content : "x");
};
const tryJunction = (link, target) => {
  try {
    fs.symlinkSync(target, link, "junction");
    return true;
  } catch (_e) {
    return false;
  }
};

const TIZEN_CONFIG_XML =
  '<?xml version="1.0"?><widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://yourdomain/App"></widget>';
const TIZEN_CSPROJ =
  '<Project Sdk="Tizen.NET.Sdk/1.1.9"><PropertyGroup><TargetFramework>net8.0-tizen</TargetFramework></PropertyGroup></Project>';
const PLAIN_CSPROJ =
  '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>';

(async () => {
  // --- isTizenProjectDir: marker strength ---
  console.log("--- isTizenProjectDir ---");

  const strong = path.join(SANDBOX, "strong");
  mk(path.join(strong, "tizen_web_project.yaml"), "project_type: web_app");
  check(
    "strong marker (tizen_web_project.yaml)",
    isTizenProjectDir(strong),
    true,
  );

  const tizenWidget = path.join(SANDBOX, "tizen-widget");
  mk(path.join(tizenWidget, "config.xml"), TIZEN_CONFIG_XML);
  check(
    "Tizen config.xml (tizen.org namespace)",
    isTizenProjectDir(tizenWidget),
    true,
  );

  const strayConfig = path.join(SANDBOX, "stray-config");
  mk(
    path.join(strayConfig, "config.xml"),
    "<settings><theme>dark</theme></settings>",
  );
  check(
    "stray NON-Tizen config.xml rejected",
    isTizenProjectDir(strayConfig),
    false,
  );

  // Real tz new dotnet layout: Solution/Solution.sln + Solution/Project/Project.csproj
  const tizenSolution = path.join(SANDBOX, "tizen-solution");
  mk(path.join(tizenSolution, "tizen-solution.sln"), "");
  mk(path.join(tizenSolution, "App", "App.csproj"), TIZEN_CSPROJ);
  check(
    "DotNET solution layout (.sln + Tizen .csproj one level down)",
    isTizenProjectDir(tizenSolution),
    true,
  );

  // Depth-1 descent requires solution evidence: WITHOUT a top-level .sln, a
  // folder that merely CONTAINS Tizen projects is a workspace, not a project.
  const projectWorkspace = path.join(SANDBOX, "project-workspace");
  mk(path.join(projectWorkspace, "AppOne", "config.xml"), TIZEN_CONFIG_XML);
  mk(
    path.join(projectWorkspace, "AppTwo", "tizen_web_project.yaml"),
    "project_type: web_app",
  );
  check(
    "workspace CONTAINING Tizen projects (no .sln) rejected",
    isTizenProjectDir(projectWorkspace),
    false,
  );

  const plainWorkspace = path.join(SANDBOX, "plain-workspace");
  mk(path.join(plainWorkspace, "SomeApp", "SomeApp.sln"), "");
  mk(path.join(plainWorkspace, "SomeApp", "SomeApp.csproj"), PLAIN_CSPROJ);
  check(
    "non-Tizen .sln/.csproj workspace rejected",
    isTizenProjectDir(plainWorkspace),
    false,
  );

  const gbs = path.join(SANDBOX, "gbs");
  mk(path.join(gbs, "CMakeLists.txt"), "project(x)");
  mk(path.join(gbs, "packaging", "x.spec"), "Name: x");
  check(
    "GBS project (CMakeLists + packaging/*.spec)",
    isTizenProjectDir(gbs),
    true,
  );

  // --- deleteProject: refusal paths ---
  console.log("\n--- deleteProject: refusals ---");

  const strayEnv = await deleteProject(strayConfig);
  check("refuses dir with stray config.xml", strayEnv.status, "failure");
  check("stray-config dir survives", fs.existsSync(strayConfig), true);

  const wsEnv = await deleteProject(plainWorkspace);
  check("refuses non-Tizen workspace (depth-1 .sln)", wsEnv.status, "failure");
  check("workspace survives", fs.existsSync(plainWorkspace), true);

  const projWsEnv = await deleteProject(projectWorkspace);
  check(
    "refuses workspace CONTAINING Tizen projects",
    projWsEnv.status,
    "failure",
  );
  check("project workspace survives", fs.existsSync(projectWorkspace), true);

  const missingEnv = await deleteProject(path.join(SANDBOX, "does-not-exist"));
  check("missing path is io_error failure", missingEnv.status, "failure");

  const fileTarget = path.join(SANDBOX, "just-a-file.txt");
  mk(fileTarget);
  const fileEnv = await deleteProject(fileTarget);
  check("plain file refused", fileEnv.status, "failure");

  // Protected-path guards run BEFORE the marker check; passing the home dir
  // must be refused with "not a project directory" regardless of contents.
  // (Real deletion is impossible here: the guard is the first gate, and this
  // test would fail loudly if the refusal ever stopped happening.)
  const homeEnv = await deleteProject(os.homedir());
  check("home directory refused", homeEnv.status, "failure");
  check(
    "home refusal comes from the path guard (not marker check)",
    /not a project directory/.test(homeEnv.errors[0].message),
    true,
  );

  const ancestorEnv = await deleteProject(path.dirname(os.homedir()));
  check(
    "ancestor of home (e.g. C:\\Users, /home) refused",
    ancestorEnv.status,
    "failure",
  );
  check(
    "ancestor refusal comes from the path guard",
    /not a project directory/.test(ancestorEnv.errors[0].message),
    true,
  );

  // --- deleteProject: symlink handling (skipped if links unavailable) ---
  console.log("\n--- deleteProject: symlinks/junctions ---");

  const linkTargetProj = path.join(SANDBOX, "link-target-proj");
  mk(
    path.join(linkTargetProj, "tizen_web_project.yaml"),
    "project_type: web_app",
  );
  const link = path.join(SANDBOX, "link-to-proj");
  if (tryJunction(link, linkTargetProj)) {
    const linkEnv = await deleteProject(link);
    check("symlink/junction target refused", linkEnv.status, "failure");
    check("link left in place", fs.existsSync(link), true);
    check(
      "link target untouched",
      fs.existsSync(path.join(linkTargetProj, "tizen_web_project.yaml")),
      true,
    );

    // Symlinked PARENT: the physical target here is a legit Tizen project, so
    // deletion proceeds — but it must resolve to and report the REAL path
    // (this is the path.resolve-is-lexical hole: guards must see through links).
    const realParent = path.join(SANDBOX, "real-parent");
    const realProj = path.join(realParent, "proj");
    mk(path.join(realProj, "tizen_web_project.yaml"), "project_type: web_app");
    const parentLink = path.join(SANDBOX, "parent-link");
    tryJunction(parentLink, realParent);
    const viaParent = await deleteProject(path.join(parentLink, "proj"));
    check(
      "delete via symlinked parent succeeds for a real Tizen project",
      viaParent.status,
      "success",
    );
    check(
      "envelope reports the physical (realpath) location",
      /real-parent/i.test(viaParent.result.project_path),
      true,
    );
    check("physical project actually deleted", fs.existsSync(realProj), false);
  } else {
    console.log("SKIP  symlink tests (symlinks not available on this system)");
  }

  // --- createProject --force: replacement scope ---
  // os.homedir() reads USERPROFILE (win) / HOME (posix) at call time, so the
  // protected-path guard can be exercised against a SANDBOX stand-in home —
  // the real home directory is never used as a deletion target here.
  console.log("\n--- createProject --force: protected paths ---");
  {
    const standinUsers = path.join(SANDBOX, "standin-users");
    const standinHome = path.join(standinUsers, "johndoe1234");
    mk(path.join(standinHome, "MyTizenApp", "config.xml"), TIZEN_CONFIG_XML);
    mk(path.join(standinHome, "Documents", "thesis.txt"), "precious");

    const savedUserprofile = process.env.USERPROFILE;
    const savedHome = process.env.HOME;
    process.env.USERPROFILE = standinHome;
    process.env.HOME = standinHome;
    try {
      // force-replace the (stand-in) home itself: parent=Users, name=<user>
      const homeForce = await createProject(
        "webapp",
        "Basic",
        standinUsers,
        "johndoe1234",
        true,
      );
      check("force on home refused", homeForce.status, "failure");
      check(
        "home refusal is the protected-path guard",
        /protected directory/.test(homeForce.errors[0].message),
        true,
      );
      check(
        "home contents survive",
        fs.existsSync(path.join(standinHome, "Documents", "thesis.txt")),
        true,
      );
    } finally {
      process.env.USERPROFILE = savedUserprofile;
      process.env.HOME = savedHome;
    }

    // force on a non-empty NON-Tizen dir → marker gate refuses
    const parent = path.join(SANDBOX, "force-parent");
    mk(path.join(parent, "NotTizen001", "data.txt"), "keep");
    const nonTizen = await createProject(
      "webapp",
      "Basic",
      parent,
      "NotTizen001",
      true,
    );
    check("force on non-Tizen dir refused", nonTizen.status, "failure");
    check(
      "non-Tizen dir survives",
      fs.existsSync(path.join(parent, "NotTizen001", "data.txt")),
      true,
    );

    // without force, an existing non-empty target is refused with remedy
    const noForce = await createProject(
      "webapp",
      "Basic",
      parent,
      "NotTizen001",
      false,
    );
    check("existing target without force refused", noForce.status, "failure");
    check(
      "refusal mentions --force remedy",
      /--force|force=true/.test(noForce.errors[0].message),
      true,
    );
  }

  // --- deleteProject: --expect-name cross-check and --dry-run ---
  console.log("\n--- deleteProject: expect-name / dry-run ---");
  {
    const guarded = path.join(SANDBOX, "GuardedApp");
    mk(path.join(guarded, "tizen_web_project.yaml"), "project_type: web_app");

    // A wrong sibling project passes the marker gate — only the name
    // cross-check catches it.
    const mismatch = await deleteProject(guarded, undefined, {
      expectName: "OtherApp",
    });
    check("expect-name mismatch refused", mismatch.status, "failure");
    check(
      "mismatch message names both sides",
      /GuardedApp/.test(mismatch.errors[0].message) &&
        /OtherApp/.test(mismatch.errors[0].message),
      true,
    );
    check("mismatched project survives", fs.existsSync(guarded), true);

    // Dry run passes every gate but must not delete.
    const dry = await deleteProject(guarded, undefined, { dryRun: true });
    check("dry-run reports success", dry.status, "success");
    check("dry-run status is dry-run", dry.result.status, "dry-run");
    check("dry-run leaves project in place", fs.existsSync(guarded), true);

    // Dry run still runs the gates: a non-project is refused, not reported
    // as deletable.
    const dryRefused = await deleteProject(
      path.join(SANDBOX, "stray-config"),
      undefined,
      { dryRun: true },
    );
    check(
      "dry-run on non-Tizen dir still refused",
      dryRefused.status,
      "failure",
    );

    // Matching name proceeds to a real delete.
    const matched = await deleteProject(guarded, undefined, {
      expectName: "GuardedApp",
    });
    check("expect-name match deletes", matched.status, "success");
    check("project gone after matched delete", fs.existsSync(guarded), false);
  }

  // --- deleteProject: legitimate deletion still works ---
  console.log("\n--- deleteProject: happy path ---");

  const okEnv = await deleteProject(strong);
  check("legit Tizen project deleted", okEnv.status, "success");
  check("project gone", fs.existsSync(strong), false);

  fs.rmSync(SANDBOX, { recursive: true, force: true });

  console.log(
    failures === 0 ? "\n=== ALL PASS ===" : `\n=== ${failures} FAILURE(S) ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
