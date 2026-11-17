// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Handoff notes through the real runCli() hook (lib/cli/cli-runner.js) and the
 * real handoff-cli.js / job-cli.js. Throwaway runners named like the real ones
 * (project-manager-cli.js, sdb-helper-cli.js, cert-manager-cli.js) stand in for
 * the SDK, so no SDK or device is involved.
 *
 * What must hold: the first recorded call in a Tizen project creates its notes
 * with no setup, OUTSIDE the project; a folder that is not a Tizen project gets
 * nothing; the runner's own output and exit code never change because of the
 * notes (a failing write included); the off switches work; --background jobs
 * are recorded once, by the child; secrets stay out; `show` catches an agent up.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== handoff runner Test ===\n");

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

const CLI_RUNNER = path
  .join(__dirname, "../cli/cli-runner.js")
  .replace(/\\/g, "/");
const JOB_CLI = path.join(__dirname, "../cli/job-cli.js");
const HANDOFF_CLI = path.join(__dirname, "../cli/handoff-cli.js");
const notes = require("../core/handoff/notes");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-handoff-run-"));
const bin = path.join(work, "bin");
const HOME = path.join(work, "home"); // TIZEN_HANDOFF_HOME for every child
fs.mkdirSync(bin);
const ENV = { TIZEN_HANDOFF_HOME: HOME };

// --- throwaway runners ----------------------------------------------------------
function writeRunner(name, body) {
  const file = path.join(bin, name);
  fs.writeFileSync(
    file,
    `const { runCli, parseArgsOrExit } = require("${CLI_RUNNER}");\n${body}`,
  );
  return file;
}

const PM = writeRunner(
  "project-manager-cli.js",
  `
const { options, positional } = parseArgsOrExit(
  "tizen-sdk project", "usage", process.argv.slice(2),
  { "--project": "project", "--package": "package", "--sleep": "sleep" },
  { "--fail": "fail" },
);
runCli("tizen-sdk " + (positional[0] === "install" ? "install-app" : "build-project"), async () => {
  await new Promise((r) => setTimeout(r, Number(options.sleep || 0) * 1000));
  if (options.fail) {
    return { status: "failure", command: "tizen-sdk build-project", duration_ms: 5,
      errors: [{ error_code: "TIZEN_SDK_BUILD_E001", error_category: "build_failed",
        message: "Build failed (exit 1).\\n\\nBuild errors:\\n  main.c:3 error: boom" }], warnings: [] };
  }
  if (positional[0] === "install") {
    return { status: "success", command: "tizen-sdk install-app", duration_ms: 900,
      result: { package_path: options.package, device_serial: "emulator-26101", deploy_type: "full",
        app_id: "abcdefghij.App", installation_status: "completed", app_launched: false, app_running: null },
      warnings: [], errors: [] };
  }
  return { status: "success", command: "tizen-sdk build-project", duration_ms: 1500,
    result: { artifacts: [{ path: options.project + "/Debug/App.wgt", format: ".wgt", size_bytes: 10 }],
      author_password: "hunter2" },
    warnings: ["a warning"], errors: [] };
});
`,
);
const SDB = writeRunner(
  "sdb-helper-cli.js",
  `
const { options } = parseArgsOrExit("tizen-sdk sdb-helper", "usage", process.argv.slice(2),
  { "--request": "request" }, {});
runCli("tizen-sdk sdb-helper", async () => ({ status: "success", command: "tizen-sdk sdb-helper",
  duration_ms: 40, result: { serial: "emulator-26101", request: options.request }, warnings: [], errors: [] }));
`,
);
const CERT = writeRunner(
  "cert-manager-cli.js",
  `
parseArgsOrExit("tizen-sdk certificate-manager", "usage", process.argv.slice(2), {}, {});
runCli("tizen-sdk certificate-manager create-profile", async () => ({ status: "success",
  command: "tizen-sdk certificate-manager create-profile", duration_ms: 70,
  result: { profile: "MyProfile", author_password: "hunter2", path: "C:/keys/a.p12" }, warnings: [], errors: [] }));
`,
);
const CHECK_NODE = writeRunner(
  "check-node-cli.js",
  `
runCli("tizen-sdk check-node", async () => ({ status: "success", command: "tizen-sdk check-node",
  duration_ms: 3, result: { version: "v20" }, warnings: [], errors: [] }));
`,
);

// --- helpers -----------------------------------------------------------------------
const HOST_VARS = [
  "CLAUDECODE",
  "GEMINI_CLI",
  "CODEX_THREAD_ID",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_SANDBOX",
  "CODEX_VERSION",
  "TIZEN_HANDOFF",
  "TIZEN_HANDOFF_DIR",
  "TIZEN_HANDOFF_HOME",
];
const jobsDir = path.join(work, "jobs");
function envFor(extra = {}) {
  const env = { ...process.env };
  for (const v of HOST_VARS) delete env[v];
  return {
    ...env,
    TIZEN_SANDBOX: "off",
    TIZEN_JOBS_DIR: jobsDir,
    ...ENV,
    ...extra,
  };
}
const AS_CLAUDE = { CLAUDECODE: "1" };
const AS_CODEX = { CODEX_THREAD_ID: "t1" };

function run(script, args, { env = {}, cwd = work } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: envFor(env),
    encoding: "utf8",
  });
  let json = null;
  for (const text of [r.stdout, r.stderr]) {
    try {
      json = JSON.parse(text);
      break;
    } catch (_e) {
      /* try stderr (usage errors) */
    }
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

/** A Tizen web project (the Tizen namespace is what the strict gate checks). */
function project(name) {
  const dir = path.join(work, name);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config.xml"),
    '<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"><tizen:application id="abcdefghij.App" package="abcdefghij"/></widget>',
  );
  fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
  return dir;
}
const notesOf = (dir) => notes.notesDirFor(dir, ENV);
const read = (dir, f) => fs.readFileSync(path.join(notesOf(dir), f), "utf8");
const logLines = (dir) =>
  read(dir, "LOG.md")
    .split("\n")
    .filter((l) => l.startsWith("- "));
const listing = (dir) => fs.readdirSync(dir).sort().join(",");

// --- no setup: the first build creates the notes, outside the project ------------------
const P1 = project("P1");
const P1before = listing(P1);
check(
  "no notes exist before the first recorded call",
  !fs.existsSync(notesOf(P1)),
);
const r1 = run(PM, ["build", "--project", P1], { env: AS_CLAUDE });
check(
  "runner output and exit code are normal",
  r1.code === 0 && r1.json && r1.json.status === "success",
);
check(
  "the first call created the project's notes with every file (no init)",
  fs.existsSync(notesOf(P1)) &&
    [
      "README.md",
      "STATE.md",
      "DECISIONS.md",
      "BUILDS.md",
      "DEVICES.md",
      "DEBUG.md",
      "ENVIRONMENT.md",
      "LOG.md",
    ].every((f) => fs.existsSync(path.join(notesOf(P1), f))),
);
check(
  "…and NOTHING was added to the project folder",
  listing(P1) === P1before,
  `${P1before} -> ${listing(P1)}`,
);
check(
  "…the notes folder is outside the project",
  !notesOf(P1)
    .toLowerCase()
    .startsWith(P1.toLowerCase() + path.sep),
);
check(
  "the runner's own secret masking still applies to its output",
  r1.json.result.author_password === "***",
);
check(
  "a first entry adds no warning",
  r1.json.warnings.length === 1 && r1.json.warnings[0] === "a warning",
);
check(
  "exactly one LOG line: agent, action, result, package",
  logLines(P1).length === 1 &&
    /\| claude \| build-project \| success \| 1\.5s \| package=.*App\.wgt \(\.wgt, 10 B\)/.test(
      logLines(P1)[0],
    ),
  logLines(P1).join("\n"),
);
check(
  "BUILDS.md has the block with the command line",
  read(P1, "BUILDS.md").includes("— claude — build-project — success") &&
    read(P1, "BUILDS.md").includes(
      "- command: `node project-manager-cli.js build --project",
    ),
);
check("README names the project", read(P1, "README.md").includes(P1));
check(
  "no secret reached any notes file",
  !/hunter2/.test(
    ["LOG.md", "BUILDS.md", "DEVICES.md", "DEBUG.md", "ENVIRONMENT.md"]
      .map((f) => read(P1, f))
      .join(""),
  ),
);

const rFail = run(PM, ["build", "--project", P1, "--fail"], { env: AS_CLAUDE });
check(
  "a failing runner still exits 1 with its own envelope",
  rFail.code === 1 && rFail.json.status === "failure",
);
check(
  "the failure is recorded with its code and message",
  logLines(P1).length === 2 &&
    /\| failure \|/.test(logLines(P1)[1]) &&
    read(P1, "BUILDS.md").includes(
      "- error [TIZEN_SDK_BUILD_E001]: Build failed (exit 1).",
    ),
  logLines(P1).join("\n"),
);

const rInst = run(
  PM,
  ["install", "--package", path.join(P1, "Debug", "App.wgt")],
  {
    env: AS_CLAUDE,
  },
);
check(
  "install is recorded in DEVICES.md, found through --package",
  rInst.json.status === "success" &&
    read(P1, "DEVICES.md").includes("install-app — success") &&
    read(P1, "DEVICES.md").includes("- device_serial: emulator-26101") &&
    read(P1, "DEVICES.md").includes("- deploy_type: full"),
  read(P1, "DEVICES.md"),
);

// --- the switch -------------------------------------------------------------------------------
const rSwitch = run(PM, ["build", "--project", P1], { env: AS_CODEX });
const handoffWarn = rSwitch.json.warnings.filter((w) =>
  w.startsWith("Handoff notes: claude last worked"),
);
check(
  "first call from the OTHER agent warns once, naming the folder",
  handoffWarn.length === 1 && handoffWarn[0].includes(notesOf(P1)),
  JSON.stringify(rSwitch.json.warnings),
);
const rAgain = run(PM, ["build", "--project", P1], { env: AS_CODEX });
check(
  "…and not again for the same agent",
  !rAgain.json.warnings.some((w) => w.startsWith("Handoff notes:")),
);
check(
  "the log shows both agents in order",
  logLines(P1)
    .map((l) => l.split(" | ")[1])
    .join(",") === "claude,claude,claude,codex,codex",
  logLines(P1).join("\n"),
);

// --- not a Tizen project: nothing created anywhere ---------------------------------------------
const plain = path.join(work, "Plain");
fs.mkdirSync(plain);
fs.writeFileSync(path.join(plain, "config.xml"), '<widget id="io.cordova.x"/>');
const homeBefore = fs.readdirSync(HOME).sort().join(",");
const rPlain = run(PM, ["build", "--project", plain], { env: AS_CLAUDE });
check(
  "a folder that is not a Tizen project (generic config.xml): normal output, nothing created",
  rPlain.code === 0 &&
    rPlain.json.warnings.length === 1 &&
    listing(plain) === "config.xml" &&
    fs.readdirSync(HOME).sort().join(",") === homeBefore,
);
check(
  "a read-only runner (check-node) is not recorded",
  (() => {
    const before = logLines(P1).length;
    const r = run(CHECK_NODE, [], { env: AS_CLAUDE, cwd: P1 });
    return r.code === 0 && logLines(P1).length === before;
  })(),
);

// --- cwd-based finding (no --project) ----------------------------------------------------------
const rSdb = run(SDB, ["--request", "list apps"], {
  env: AS_CLAUDE,
  cwd: path.join(P1, "src"),
});
check(
  "a runner with no project argument finds its project from the cwd (sub-folder)",
  rSdb.code === 0 &&
    read(P1, "DEVICES.md").includes("sdb-helper — success") &&
    read(P1, "DEVICES.md").includes("- serial: emulator-26101"),
  read(P1, "DEVICES.md"),
);
const P2 = project("P2");
const P1lines = logLines(P1).length;
const rElsewhere = run(PM, ["build", "--project", P2], {
  env: AS_CLAUDE,
  cwd: P1,
});
check(
  "naming ANOTHER project while the cwd is in P1 never writes into P1",
  rElsewhere.code === 0 &&
    logLines(P1).length === P1lines &&
    fs.existsSync(notesOf(P2)) &&
    logLines(P2).length === 1,
);
const rNoProject = run(SDB, ["--request", "x"], { env: AS_CLAUDE, cwd: work });
check(
  "a device action from a folder that is in no project: normal output, nothing recorded",
  rNoProject.code === 0 && rNoProject.json.status === "success",
);

// --- the off switches and robustness -------------------------------------------------------------
const before = logLines(P1).length;
const rOff = run(PM, ["build", "--project", P1], {
  env: { ...AS_CLAUDE, TIZEN_HANDOFF: "0" },
});
check(
  "TIZEN_HANDOFF=0 records nothing",
  rOff.code === 0 && logLines(P1).length === before,
);

const P3 = project("P3");
const rExisting = run(PM, ["build", "--project", P3], {
  env: { ...AS_CLAUDE, TIZEN_HANDOFF: "existing" },
});
check(
  "TIZEN_HANDOFF=existing creates nothing for a project with no notes yet",
  rExisting.code === 0 && !fs.existsSync(notesOf(P3)),
);
run(HANDOFF_CLI, ["init", "--project", P3], { env: AS_CLAUDE });
run(PM, ["build", "--project", P3], {
  env: { ...AS_CLAUDE, TIZEN_HANDOFF: "existing" },
});
check("…but records once the notes exist", logLines(P3).length === 1);

const P4 = project("P4");
run(HANDOFF_CLI, ["init", "--project", P4], { env: AS_CLAUDE });
fs.rmSync(path.join(notesOf(P4), "LOG.md"));
fs.mkdirSync(path.join(notesOf(P4), "LOG.md")); // a directory: every append fails
const r4 = run(PM, ["build", "--project", P4], { env: AS_CLAUDE });
check(
  "a notes write that fails changes nothing: same output, exit 0, quiet stderr",
  r4.code === 0 && r4.json.status === "success" && r4.stderr.trim() === "",
  `${r4.code} / ${r4.stderr.slice(0, 200)}`,
);

// --- certificates -----------------------------------------------------------------------------
const P5 = project("P5");
const rCert = run(CERT, [], { env: AS_CLAUDE, cwd: P5 });
check(
  "certificate runner: stdout is masked as always",
  rCert.json.result.author_password === "***",
);
check(
  "certificate runner: action + status recorded, no result data",
  read(P5, "ENVIRONMENT.md").includes(
    "certificate-manager create-profile — success",
  ) &&
    !/MyProfile|hunter2|a\.p12/.test(
      read(P5, "ENVIRONMENT.md") + read(P5, "LOG.md"),
    ),
  read(P5, "ENVIRONMENT.md"),
);

// --- background jobs --------------------------------------------------------------------------
const P6 = project("P6");
const rBg = run(
  PM,
  ["build", "--project", P6, "--sleep", "1", "--background"],
  {
    env: AS_CLAUDE,
  },
);
check(
  "the --background launcher prints a receipt and records nothing yet",
  rBg.code === 0 &&
    rBg.json.result &&
    rBg.json.result.job_id &&
    !fs.existsSync(notesOf(P6)),
  JSON.stringify(rBg.json && rBg.json.result),
);
let done = null;
for (let i = 0; i < 12 && !(done && done.json && done.json.job); i++) {
  done = run(
    JOB_CLI,
    ["wait", "--id", rBg.json.result.job_id, "--timeout", "10"],
    {
      env: AS_CLAUDE,
      cwd: P6,
    },
  );
}
check(
  "the finished job is relayed by job-cli with the runner's own result",
  done &&
    done.json &&
    done.json.status === "success" &&
    done.json.job &&
    done.json.job.state === "done",
  done && done.stdout.slice(0, 300),
);
check(
  "…and recorded exactly once, by the job itself (not by job-cli polling)",
  logLines(P6).length === 1 &&
    /\| claude \| build-project \| success/.test(logLines(P6)[0]),
  fs.existsSync(notesOf(P6)) ? logLines(P6).join("\n") : "no notes",
);
check(
  "…and the relayed envelope has no handoff warning of its own",
  !(done.json.warnings || []).some((w) =>
    String(w).startsWith("Handoff notes:"),
  ),
);

// --- handoff-cli show ----------------------------------------------------------------------------
const P7 = project("P7");
const rShow0 = run(HANDOFF_CLI, ["show"], {
  env: AS_CODEX,
  cwd: path.join(P7, "src"),
});
check(
  "show before anything was recorded: success, exists:false, says there is nothing yet",
  rShow0.code === 0 &&
    rShow0.json.result.exists === false &&
    rShow0.json.result.notes_dir === notesOf(P7) &&
    !fs.existsSync(notesOf(P7)),
  rShow0.stdout.slice(0, 300),
);
check("show itself does not create the folder", !fs.existsSync(notesOf(P7)));
run(PM, ["build", "--project", P7], { env: AS_CLAUDE });
fs.writeFileSync(
  path.join(notesOf(P7), "STATE.md"),
  "# State\n\n## Current task\n\nChange the title\n\n## In progress\n\n- index.html half edited\n",
);
const rShow = run(HANDOFF_CLI, ["show"], {
  env: AS_CODEX,
  cwd: path.join(P7, "src"),
});
check(
  "show from a sub-folder, no arguments: the project, folder, last agent, STATE and recent log",
  rShow.code === 0 &&
    rShow.json.result.exists === true &&
    rShow.json.result.project_path === P7 &&
    rShow.json.result.notes_dir === notesOf(P7) &&
    rShow.json.result.last_activity.agent === "claude" &&
    rShow.json.result.state.includes("index.html half edited") &&
    rShow.json.result.recent_log.length === 1 &&
    rShow.json.result.recent_log[0].includes("build-project") &&
    rShow.json.result.files.includes("LOG.md"),
  rShow.stdout.slice(0, 400),
);
check("show is not itself logged as an action", logLines(P7).length === 1);
const rShowP = run(HANDOFF_CLI, ["show", "--project", P7], {
  env: AS_CODEX,
  cwd: work,
});
check(
  "show --project works from anywhere",
  rShowP.code === 0 && rShowP.json.result.project_path === P7,
);
const rShowBad = run(HANDOFF_CLI, ["show"], { env: AS_CODEX, cwd: work });
check(
  "show outside any Tizen project → clear failure, nothing created",
  rShowBad.code === 1 &&
    rShowBad.json.errors[0].error_category === "invalid_parameters",
);
const bigState = project("P8");
run(HANDOFF_CLI, ["init", "--project", bigState], { env: AS_CLAUDE });
fs.writeFileSync(
  path.join(notesOf(bigState), "STATE.md"),
  `# State\n${"line\n".repeat(5000)}end\n`,
);
const rBig = run(HANDOFF_CLI, ["show", "--project", bigState], {
  env: AS_CLAUDE,
});
check(
  "show caps a huge STATE.md and keeps its end",
  rBig.json.result.state.length <= 4000 &&
    rBig.json.result.state.trimEnd().endsWith("end"),
  String(rBig.json.result.state.length),
);

// --- handoff-cli init ------------------------------------------------------------------------------
const P9 = project("P9");
const rInit = run(HANDOFF_CLI, ["init", "--project", P9], { env: AS_CLAUDE });
check(
  "init: success, creates the folder outside the project with every file",
  rInit.code === 0 &&
    rInit.json.status === "success" &&
    rInit.json.result.notes_dir === notesOf(P9) &&
    rInit.json.result.created.length === 8 &&
    listing(P9) === "index.html,config.xml,src".split(",").sort().join(","),
  rInit.stdout.slice(0, 300),
);
check("init itself is not logged as an action", logLines(P9).length === 0);
fs.writeFileSync(path.join(notesOf(P9), "STATE.md"), "# State\nedited\n");
const rInit2 = run(HANDOFF_CLI, ["init", "--project", P9], { env: AS_CLAUDE });
check(
  "init twice: nothing overwritten, says what was kept",
  rInit2.code === 0 &&
    rInit2.json.result.created.length === 0 &&
    read(P9, "STATE.md").includes("edited") &&
    rInit2.json.warnings.some((w) => /Kept existing/.test(w)),
);
const rInitSub = run(HANDOFF_CLI, ["init", "--project", path.join(P9, "src")], {
  env: AS_CLAUDE,
});
check(
  "init with a folder inside the project uses the project root and says so",
  rInitSub.code === 0 &&
    rInitSub.json.result.project_path === P9 &&
    rInitSub.json.warnings.some((w) => /project root/.test(w)),
);
const rBad = run(HANDOFF_CLI, ["init", "--project", plain], { env: AS_CLAUDE });
check(
  "init in a folder that is not a Tizen project → failure, nothing created",
  rBad.code === 1 &&
    rBad.json.errors[0].error_category === "invalid_parameters" &&
    listing(plain) === "config.xml",
);
const rMissing = run(
  HANDOFF_CLI,
  ["init", "--project", path.join(work, "nope")],
  {
    env: AS_CLAUDE,
  },
);
check(
  "init on a missing folder → io_error",
  rMissing.code === 1 && rMissing.json.errors[0].error_category === "io_error",
);
const rUsage = run(HANDOFF_CLI, ["init"], { env: AS_CLAUDE });
check(
  "init without --project → usage error, exit 1",
  rUsage.code === 1 && rUsage.json && rUsage.json.status === "error",
);
const rUnknown = run(HANDOFF_CLI, ["frobnicate"], { env: AS_CLAUDE });
check(
  "unknown action → usage error",
  rUnknown.code === 1 && rUnknown.json && rUnknown.json.status === "error",
);

fs.rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
