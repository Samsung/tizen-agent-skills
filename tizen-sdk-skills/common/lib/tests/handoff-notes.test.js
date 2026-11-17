// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Handoff notes — the pure parts (lib/core/handoff/): what gets recorded and
 * where (classify), how entries are formatted, how a runner call is mapped to
 * a Tizen project and to a notes folder OUTSIDE it, creation on first use,
 * rotation, and the guarantee that recording never throws.
 *
 * No SDK and no runner process: temp folders and in-process calls only. The
 * runner-level behaviour is in handoff-runner.test.js.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

console.log("=== handoff notes Test ===\n");

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

const notes = require("../core/handoff/notes");
const record = require("../core/handoff/record");
const { FILES, AUTO_FILES } = require("../core/handoff/templates");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-handoff-unit-"));
const HOME = path.join(work, "home"); // where notes go in these tests
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
function cleanEnv(extra = {}) {
  for (const v of HOST_VARS) delete process.env[v];
  Object.assign(process.env, { TIZEN_HANDOFF_HOME: HOME }, extra);
}
const ENV = { TIZEN_HANDOFF_HOME: HOME };

function classify(runner, argv = [], label = "") {
  return record.classify({ runner, label, argv });
}
const fileOf = (c) => (c ? c.file : null);

/** A real-looking Tizen web project: the namespace is what the strict gate wants. */
function webProject(parent, name) {
  const dir = path.join(parent, name);
  fs.mkdirSync(path.join(dir, "Debug"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config.xml"),
    '<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://example.org/a" version="1.0.0">' +
      '<tizen:application id="abcdefghij.App" package="abcdefghij" required_version="2.3"/></widget>',
  );
  fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "Debug", "App.wgt"), "x");
  return dir;
}

// --- classify: what is recorded, and where ---------------------------------
check(
  "project-manager: build → BUILDS",
  fileOf(classify("project-manager", ["build", "--project", "x"])) ===
    "BUILDS.md",
);
check(
  "project-manager: create / import-wgt / delete → BUILDS",
  ["create", "import-wgt", "delete"].every(
    (a) => fileOf(classify("project-manager", [a])) === "BUILDS.md",
  ),
);
check(
  "project-manager: install → DEVICES",
  fileOf(classify("project-manager", ["install", "--package", "p"])) ===
    "DEVICES.md",
);
check(
  "project-manager: list-templates is not recorded",
  classify("project-manager", ["list-templates"]) === null,
);
// internal-only:begin
check("vd-build → BUILDS", fileOf(classify("vd-build")) === "BUILDS.md");
// internal-only:end
check(
  "emulator: launch/create/delete → DEVICES; list/detail are not recorded",
  ["launch", "create", "delete", "modify", "reset"].every(
    (a) => fileOf(classify("emulator-manager", [a])) === "DEVICES.md",
  ) &&
    ["list-vm", "list-platform", "list-template", "detail"].every(
      (a) => classify("emulator-manager", [a]) === null,
    ),
);
check(
  "emulator: the action is found even when flags come first",
  classify("emulator-manager", ["--vm-name", "vm1", "launch"]).action ===
    "launch",
);
check(
  "device-manager: stop (all spellings) → DEVICES; start/list are not recorded",
  fileOf(classify("device-manager", ["stop"])) === "DEVICES.md" &&
    fileOf(classify("device-manager", ["--action", "stop"])) === "DEVICES.md" &&
    fileOf(classify("device-manager", ["--action=stop"])) === "DEVICES.md" &&
    classify("device-manager", []) === null &&
    classify("device-manager", ["--action", "start"]) === null,
);
check(
  "sdb-helper / file-transfer / screenshot → DEVICES",
  ["sdb-helper", "file-transfer", "screenshot"].every(
    (r) => fileOf(classify(r)) === "DEVICES.md",
  ),
);
check(
  "remote-device: connect/disconnect/scan → DEVICES; list/list-saved are not recorded",
  ["connect", "disconnect", "scan", "add", "edit", "remove"].every(
    (a) => fileOf(classify("remote-device", [a])) === "DEVICES.md",
  ) &&
    classify("remote-device", ["list"]) === null &&
    classify("remote-device", ["list-saved"]) === null,
);
check(
  "dlog-analyzer: investigate/search/collect → DEBUG; check/status/probe list are not recorded",
  ["investigate", "search", "dlog-collect", "log-clear", "kernel"].every(
    (a) => fileOf(classify("dlog-analyzer", [a])) === "DEBUG.md",
  ) &&
    classify("dlog-analyzer", ["check"]) === null &&
    classify("dlog-analyzer", ["status"]) === null &&
    classify("dlog-analyzer", ["probe", "list"]) === null &&
    fileOf(classify("dlog-analyzer", ["probe", "run", "cpu"])) === "DEBUG.md",
);
check(
  "debug runners → DEBUG",
  ["gdb-debug", "dotnet-debug", "webapp-debug", "playwright-test"].every(
    (r) => fileOf(classify(r)) === "DEBUG.md",
  ),
);
check(
  "SDK / platform / package / dotnet setup → ENVIRONMENT",
  [
    "sdk-init",
    "sdk-install",
    "sdk-install-custom-repo",
    "tv-sdk-install",
    "tv-sdk-install-from-zip",
    "update-package",
    "platform-install",
    "download-emulator-package",
    "download-mobile-platform",
    "install-rootstrap",
    "dotnet-setup",
  ].every((r) => fileOf(classify(r)) === "ENVIRONMENT.md"),
);
const certCreate = classify(
  "cert-manager",
  [],
  "tizen-sdk certificate-manager create-profile",
);
check(
  "certificates: a changing action → ENVIRONMENT, and detail is OFF",
  certCreate && certCreate.file === "ENVIRONMENT.md" && !certCreate.detail,
);
check(
  "certificates: read-only actions are not recorded",
  [
    "list-profiles",
    "inspect-certificate",
    "get-sdk-data-path",
    "parse-duids",
    "list-distributors",
  ].every(
    (a) =>
      classify("cert-manager", [], `tizen-sdk certificate-manager ${a}`) ===
      null,
  ),
);
check(
  "read-only / meta runners are not recorded",
  [
    "check-node",
    "check-disk-space",
    "sdk-repo-info",
    "validate-repo-url",
    "job",
    "handoff",
    "something-new",
  ].every((r) => classify(r) === null),
);

// --- formatting ----------------------------------------------------------------
check(
  "oneLine: newlines → ' / ', truncated, pipes and everything else untouched",
  record.oneLine("a\nb | c", 50) === "a / b | c" &&
    record.oneLine("x".repeat(500), 20).length === 20 &&
    record.oneLine("x".repeat(500), 20).endsWith("…"),
);
check(
  "a command line with a pipe is recorded exactly as run (block), pipe-safe in the log line",
  (() => {
    const cmd = 'node sdb-helper-cli.js --request "ls | grep app"';
    const block = record.formatBlock({
      ts: "2026-10-14T05:00:00Z",
      host: "claude",
      name: "sdb-helper",
      status: "success",
      userCommand: cmd,
      facts: [],
      warnings: [],
      error: null,
    });
    const logLine = record.formatLogLine({
      ts: "2026-10-14T05:00:00Z",
      host: "claude",
      name: "sdb-helper",
      status: "success",
      durationMs: 10,
      summary: "ls | grep app",
    });
    return (
      block.includes("ls | grep app") &&
      logLine.split(" | ").length === 6 &&
      logLine.includes("ls / grep app")
    );
  })(),
);
check(
  "displayName: no duplicated action, generic labels get it",
  record.displayName("tizen-sdk build-project", "build") === "build-project" &&
    record.displayName("tizen-sdk emulator", "launch") === "emulator launch" &&
    record.displayName("tizen-sdk install-app", "install") === "install-app" &&
    record.displayName(
      "tizen-sdk certificate-manager create-profile",
      "create-profile",
    ) === "certificate-manager create-profile",
);
const facts = record.resultFacts({
  artifacts: [{ path: "C:\\p\\App.wgt", format: ".wgt", size_bytes: 12 }],
  device_serial: "emulator-26101",
  deploy_type: "full",
  app_running: false,
  nested: { secret: "x" },
  nothing: null,
  empty: "",
});
check(
  "resultFacts: artifacts and allowlisted scalars only",
  facts.some(
    ([k, v]) => k === "package" && v.includes("App.wgt (.wgt, 12 B)"),
  ) &&
    facts.some(([k, v]) => k === "device_serial" && v === "emulator-26101") &&
    facts.some(([k, v]) => k === "app_running" && v === "false") &&
    !facts.some(([k]) => ["nested", "nothing", "empty"].includes(k)),
  JSON.stringify(facts),
);
const line = record.formatLogLine({
  ts: "2026-10-14T05:00:00Z",
  host: "claude",
  name: "build-project",
  status: "success",
  durationMs: 4200,
  summary: "ok",
});
check(
  "log line shape: '- ts | host | name | status | secs | summary'",
  line ===
    "- 2026-10-14T05:00:00Z | claude | build-project | success | 4.2s | ok\n",
  line,
);

// --- environment helpers ---------------------------------------------------------
cleanEnv();
check(
  "mode: on by default",
  notes.mode({}) === "on" && notes.enabled({}) === true,
);
check(
  "mode: 0 / off / false / no → off (any case)",
  ["0", "off", "false", "no", "OFF", " No "].every(
    (v) => notes.mode({ TIZEN_HANDOFF: v }) === "off",
  ) && notes.enabled({ TIZEN_HANDOFF: "0" }) === false,
);
check(
  "mode: 'existing' records but does not create; 1 stays on",
  notes.mode({ TIZEN_HANDOFF: "existing" }) === "existing" &&
    notes.enabled({ TIZEN_HANDOFF: "existing" }) === true &&
    notes.mode({ TIZEN_HANDOFF: "1" }) === "on",
);
check(
  "host: markers → claude / codex / gemini; no marker → cline",
  notes.hostName({ CLAUDECODE: "1" }) === "claude" &&
    notes.hostName({ CODEX_THREAD_ID: "t" }) === "codex" &&
    notes.hostName({ CODEX_SANDBOX_NETWORK_DISABLED: "1" }) === "codex" &&
    notes.hostName({ GEMINI_CLI: "1" }) === "gemini" &&
    notes.hostName({}) === "cline",
);
check(
  "host: TIZEN_HANDOFF_HOST overrides the markers; a bad value is ignored",
  notes.hostName({ CLAUDECODE: "1", TIZEN_HANDOFF_HOST: "cline" }) ===
    "cline" &&
    notes.hostName({ TIZEN_HANDOFF_HOST: "Codex" }) === "codex" &&
    notes.hostName({ TIZEN_HANDOFF_HOST: "gemini" }) === "gemini" &&
    notes.hostName({ CLAUDECODE: "1", TIZEN_HANDOFF_HOST: "bogus" }) ===
      "claude",
);
check(
  "host: a Codex started inside Claude counts as claude",
  notes.hostName({ CLAUDECODE: "1", CODEX_THREAD_ID: "t" }) === "claude",
);

// --- project root and notes folder ---------------------------------------------------
const projA = webProject(work, "App");
const deep = path.join(projA, "src", "deep", "er");
fs.mkdirSync(deep, { recursive: true });
check(
  "findProjectRoot: a project root is itself",
  notes.findProjectRoot(projA) === projA,
);
check(
  "findProjectRoot: from a sub-folder walks up to the project",
  notes.findProjectRoot(deep) === projA,
);
const cordova = path.join(work, "Cordova");
fs.mkdirSync(cordova);
fs.writeFileSync(
  path.join(cordova, "config.xml"),
  '<widget id="io.cordova.x" xmlns="http://www.w3.org/ns/widgets"/>',
);
check(
  "findProjectRoot: a plain config.xml (no Tizen namespace) is NOT a Tizen project",
  notes.findProjectRoot(cordova) === null,
);
check(
  "findProjectRoot: an unrelated folder is not a project",
  notes.findProjectRoot(work) === null,
);
const sln = path.join(work, "Sol");
fs.mkdirSync(path.join(sln, "Proj"), { recursive: true });
fs.writeFileSync(path.join(sln, "Sol.sln"), "");
fs.writeFileSync(
  path.join(sln, "Proj", "Proj.csproj"),
  "<Project><PropertyGroup><TargetFramework>net6.0-tizen</TargetFramework></PropertyGroup></Project>",
);
check(
  "findProjectRoot: a .NET solution and its project are ONE project (outermost wins)",
  notes.findProjectRoot(path.join(sln, "Proj")) === sln &&
    notes.findProjectRoot(sln) === sln,
  `${notes.findProjectRoot(path.join(sln, "Proj"))}`,
);

const dirA = notes.notesDirFor(projA, ENV);
check(
  "notes folder is OUTSIDE the project and under the handoff home",
  !dirA.toLowerCase().startsWith(projA.toLowerCase() + path.sep) &&
    dirA.startsWith(HOME) &&
    /^App-[0-9a-f]{10}$/.test(path.basename(dirA)),
  dirA,
);
check(
  "notes folder is stable: same project, same folder; another project, another",
  notes.notesDirFor(projA, ENV) === dirA &&
    notes.notesDirFor(path.join(projA, "."), ENV) === dirA &&
    notes.notesDirFor(webProject(work, "Other"), ENV) !== dirA,
);
if (process.platform === "win32") {
  check(
    "Windows: the folder does not depend on path case",
    notes.notesDirFor(projA.toUpperCase(), ENV) === dirA,
  );
}
const odd = webProject(work, "we ird;&name");
check(
  "odd project names give a safe folder name",
  /^we_ird__name-[0-9a-f]{10}$/.test(
    path.basename(notes.notesDirFor(odd, ENV)),
  ),
  path.basename(notes.notesDirFor(odd, ENV)),
);

// --- locate: which project does a runner call belong to ------------------------------
const loc = (argv, cwd, env = ENV) => notes.locate({ argv, cwd, env });
check(
  "locate: from the cwd (a sub-folder of the project)",
  loc([], deep).projectRoot === projA && loc([], deep).dir === dirA,
);
check("locate: cwd outside any project → null", loc([], work) === null);
const projB = webProject(work, "Other");
check(
  "locate: --project names the project; the cwd is ignored",
  loc(["build", "--project", projB], projA).projectRoot === projB,
);
check(
  "locate: --project naming a NON-project → null, never falls back to the cwd",
  loc(["build", "--project", cordova], projA) === null,
);
check(
  "locate: --project=<dir> form",
  loc([`--project=${projA}`], work).projectRoot === projA,
);
check(
  "locate: --package inside a project finds that project",
  loc(["install", "--package", path.join(projA, "Debug", "App.wgt")], work)
    .projectRoot === projA,
);
check(
  "locate: TIZEN_HANDOFF_DIR wins when the folder exists; missing → null",
  (() => {
    const there = path.join(work, "explicit");
    fs.mkdirSync(there);
    return (
      loc([], work, { TIZEN_HANDOFF_DIR: there }).dir === there &&
      loc([], projA, { TIZEN_HANDOFF_DIR: path.join(work, "nope") }) === null
    );
  })(),
);

// --- creation on first use -----------------------------------------------------------------
check(
  "before anything is recorded the folder does not exist",
  !fs.existsSync(dirA),
);
check(
  "ensure: 'existing' mode never creates",
  notes.ensure(loc([], projA), { ...ENV, TIZEN_HANDOFF: "existing" }) ===
    null && !fs.existsSync(dirA),
);
check(
  "ensure: 'off' mode never creates",
  notes.ensure(loc([], projA), { ...ENV, TIZEN_HANDOFF: "off" }) === null &&
    !fs.existsSync(dirA),
);
check("ensure: no project → null", notes.ensure(null, ENV) === null);
const created = notes.ensure(loc([], projA), ENV);
check(
  "ensure: 'on' mode creates the folder on first use, with every file",
  created === dirA &&
    Object.keys(FILES).every((f) => fs.existsSync(path.join(dirA, f))),
);
check(
  "nothing was written INTO the project",
  fs.readdirSync(projA).sort().join() === "Debug,config.xml,index.html,src",
  fs.readdirSync(projA).join(),
);
check(
  "README names the project, the one catch-up command, and the agent-written split",
  FILES["README.md"].includes("{{PROJECT}}") &&
    fs.readFileSync(path.join(dirA, "README.md"), "utf8").includes(projA) &&
    fs
      .readFileSync(path.join(dirA, "README.md"), "utf8")
      .includes("handoff-cli.js show") &&
    /written by agents/i.test(
      fs.readFileSync(path.join(dirA, "README.md"), "utf8"),
    ),
);
check(
  "runner-written files say append-only",
  AUTO_FILES.every((f) => /append-only/.test(FILES[f])),
);
fs.writeFileSync(path.join(dirA, "STATE.md"), "# State\nmy edit\n");
const again = notes.initNotes(projA, ENV);
check(
  "init twice keeps what an agent wrote",
  again.created.length === 0 &&
    again.kept.includes("STATE.md") &&
    fs.readFileSync(path.join(dirA, "STATE.md"), "utf8").includes("my edit"),
);

// --- append, rotation, last entry ------------------------------------------------------
fs.rmSync(path.join(dirA, "DEBUG.md"));
notes.append(dirA, "DEBUG.md", "### x\n");
check(
  "append recreates a deleted file from its template",
  fs
    .readFileSync(path.join(dirA, "DEBUG.md"), "utf8")
    .startsWith("# Debugging and logs") &&
    fs.readFileSync(path.join(dirA, "DEBUG.md"), "utf8").endsWith("### x\n"),
);
fs.writeFileSync(
  path.join(dirA, "DEVICES.md"),
  "x".repeat(notes.ROTATE_BYTES + 10),
);
notes.append(dirA, "DEVICES.md", "### after rotation\n");
const archived = fs.existsSync(path.join(dirA, "archive"))
  ? fs.readdirSync(path.join(dirA, "archive"))
  : [];
check(
  "a file past the limit is moved to archive/ and a fresh one started",
  archived.length === 1 &&
    /-DEVICES\.md$/.test(archived[0]) &&
    fs.statSync(path.join(dirA, "DEVICES.md")).size < 2000 &&
    fs
      .readFileSync(path.join(dirA, "DEVICES.md"), "utf8")
      .includes("### after rotation"),
  JSON.stringify(archived),
);
fs.writeFileSync(
  path.join(dirA, "LOG.md"),
  `${FILES["LOG.md"]}- 2026-10-14T01:00:00Z | claude | build-project | success | 1.0s | a\n` +
    "- 2026-10-14T02:00:00Z | codex | install-app | failure | 2.0s | b\n",
);
const last = notes.lastEntry(dirA);
check(
  "lastEntry: newest LOG.md line → {ts, host}",
  last && last.host === "codex" && last.ts === "2026-10-14T02:00:00Z",
  JSON.stringify(last),
);
fs.writeFileSync(path.join(dirA, "LOG.md"), FILES["LOG.md"]);
check("lastEntry on an empty log → null", notes.lastEntry(dirA) === null);

// --- applyHandoff ---------------------------------------------------------------------------
const read = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
const ctx = (over = {}) => ({
  label: "tizen-sdk build-project",
  argv: ["build", "--project", projA],
  script: "/x/project-manager-cli.js",
  userCommand: "node project-manager-cli.js build --project x",
  mask: true,
  ...over,
});
const okEnvelope = () => ({
  status: "success",
  command: "tizen-sdk build-project",
  duration_ms: 2500,
  result: {
    artifacts: [{ path: "/p/App.wgt", format: ".wgt", size_bytes: 7 }],
  },
  warnings: ["w"],
  errors: [],
});
function freshHome() {
  fs.rmSync(HOME, { recursive: true, force: true });
}

cleanEnv({ CLAUDECODE: "1" });
freshHome();
const env1 = okEnvelope();
record.applyHandoff(env1, ctx());
check(
  "first recorded call creates the folder and writes one LOG line + one BUILDS block",
  fs.existsSync(dirA) &&
    /\| claude \| build-project \| success \| 2\.5s \| package=\/p\/App\.wgt/.test(
      read(dirA, "LOG.md"),
    ) &&
    read(dirA, "BUILDS.md").includes(
      "- command: `node project-manager-cli.js build --project x`",
    ) &&
    read(dirA, "BUILDS.md").includes("- warning: w"),
);
check("a first entry adds no warning", env1.warnings.length === 1);
check(
  "…and the project folder is untouched",
  fs.readdirSync(projA).sort().join() === "Debug,config.xml,index.html,src",
);

const failEnv = {
  status: "failure",
  command: "tizen-sdk build-project",
  duration_ms: 100,
  errors: [
    {
      error_code: "TIZEN_SDK_BUILD_E001",
      error_category: "build_failed",
      message:
        "Build failed (exit 1).\n\nBuild errors:\n  main.c:3 error: boom",
    },
  ],
};
record.applyHandoff(failEnv, ctx());
const logAfterFail = read(dirA, "LOG.md").trimEnd().split("\n").pop();
check(
  "failure: the log line is ONE line with the whole message",
  logAfterFail.includes("| failure |") &&
    logAfterFail.includes(
      "Build failed (exit 1). / Build errors: / main.c:3 error: boom",
    ),
  logAfterFail,
);
check(
  "failure block carries [code]",
  read(dirA, "BUILDS.md").includes("- error [TIZEN_SDK_BUILD_E001]:"),
);

// the switch warning
cleanEnv({ CODEX_THREAD_ID: "t" });
const env2 = okEnvelope();
record.applyHandoff(env2, ctx());
check(
  "another agent last → exactly one 'Handoff notes' warning naming the folder",
  env2.warnings.filter((w) => /^Handoff notes: claude last worked/.test(w))
    .length === 1 && env2.warnings.some((w) => w.includes(dirA)),
  JSON.stringify(env2.warnings),
);
const env3 = okEnvelope();
record.applyHandoff(env3, ctx());
check("same agent again → no warning", env3.warnings.length === 1);
cleanEnv(); // no marker: Cline
const env4 = okEnvelope();
record.applyHandoff(env4, ctx());
check(
  "Cline (no marker) after codex → warns, and is logged as cline",
  env4.warnings.some((w) => w.startsWith("Handoff notes: codex last worked")) &&
    read(dirA, "LOG.md").trimEnd().split("\n").pop().includes("| cline |"),
);
cleanEnv({ TIZEN_HANDOFF_HOST: "cline", CLAUDECODE: "1" });
const env5 = okEnvelope();
record.applyHandoff(env5, ctx());
check(
  "TIZEN_HANDOFF_HOST wins: a forced cline call after cline is not a switch",
  env5.warnings.length === 1 &&
    !env5.warnings.some((w) => w.startsWith("Handoff notes:")),
);

// what must NOT be recorded
freshHome();
cleanEnv({ CLAUDECODE: "1" });
const certEnv = {
  status: "success",
  command: "tizen-sdk certificate-manager create-profile",
  duration_ms: 5,
  result: {
    profile: "MyProfile",
    author_password: "hunter2",
    path: "C:\\keys\\a.p12",
  },
  warnings: ["pw hint"],
  errors: [],
};
record.applyHandoff(
  certEnv,
  ctx({
    label: "tizen-sdk certificate-manager create-profile",
    script: "/x/cert-manager-cli.js",
    argv: ["create-profile", "--project", projA],
    userCommand:
      "node cert-manager-cli.js create-profile --author-password ***",
  }),
);
check(
  "certificate: action + status recorded, result data and warnings are NOT",
  read(dirA, "ENVIRONMENT.md").includes("create-profile — success") &&
    !/MyProfile|hunter2|a\.p12|pw hint/.test(read(dirA, "ENVIRONMENT.md")) &&
    !/MyProfile|hunter2|a\.p12/.test(read(dirA, "LOG.md")),
  read(dirA, "ENVIRONMENT.md"),
);
const before = read(dirA, "LOG.md");
record.applyHandoff(okEnvelope(), ctx({ mask: false }));
check(
  "a runner that returns a secret (mask off) is never recorded",
  read(dirA, "LOG.md") === before,
);
record.applyHandoff({ ...okEnvelope(), user_command: "node x.js" }, ctx());
check(
  "a relayed envelope (carries user_command) is not recorded twice",
  read(dirA, "LOG.md") === before,
);
record.applyHandoff(
  okEnvelope(),
  ctx({ script: "/x/check-node-cli.js", label: "tizen-sdk check-node" }),
);
check("a read-only runner is not recorded", read(dirA, "LOG.md") === before);
record.applyHandoff(okEnvelope(), ctx({ argv: ["list-templates"] }));
check(
  "project-manager list-templates is not recorded",
  read(dirA, "LOG.md") === before,
);
cleanEnv({ CLAUDECODE: "1", TIZEN_HANDOFF: "0" });
record.applyHandoff(okEnvelope(), ctx());
check("TIZEN_HANDOFF=0 records nothing", read(dirA, "LOG.md") === before);

cleanEnv({ CLAUDECODE: "1" });
freshHome();
record.applyHandoff(
  okEnvelope(),
  ctx({ argv: ["build", "--project", cordova] }),
);
record.applyHandoff(okEnvelope(), ctx({ argv: ["build", "--project", work] }));
check(
  "a folder that is not a Tizen project: nothing is created anywhere",
  !fs.existsSync(HOME) && fs.readdirSync(cordova).join() === "config.xml",
);

cleanEnv({ CLAUDECODE: "1", TIZEN_HANDOFF: "existing" });
record.applyHandoff(okEnvelope(), ctx());
check(
  "TIZEN_HANDOFF=existing: no folder yet → nothing is created",
  !fs.existsSync(HOME),
);
notes.initNotes(projA, ENV);
record.applyHandoff(okEnvelope(), ctx());
check(
  "TIZEN_HANDOFF=existing: once the folder exists, it records",
  /build-project \| success/.test(read(dirA, "LOG.md")),
);

// never throws
cleanEnv({ CLAUDECODE: "1" });
const realAppend = fs.appendFileSync;
fs.appendFileSync = () => {
  throw new Error("disk full");
};
let threw = false;
const envX = okEnvelope();
try {
  record.applyHandoff(envX, ctx());
} catch (_e) {
  threw = true;
}
fs.appendFileSync = realAppend;
check(
  "a failing write never throws into the runner",
  !threw && envX.status === "success",
);
for (const odd of [null, undefined, 5, "text", []]) {
  try {
    record.applyHandoff(odd, ctx());
  } catch (_e) {
    threw = true;
  }
}
check("odd input (null, number, array) is ignored", !threw);

fs.rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
