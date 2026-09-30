// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * dotnet-debug launch.json / tasks.json generation
 *
 * In launch mode the runner used to hand back a template with an
 * <APP_FOLDER_NAME> placeholder and leave .vscode/launch.json to the user (or
 * the agent) — which is exactly where things went wrong: wrong debug type,
 * hard-coded TargetFramework. With --project the runner resolves program/cwd
 * from the .csproj and writes the file itself, merging into an existing
 * launch.json without touching other configurations.
 *
 * It also writes tasks.json with a relaunch task wired in as preLaunchTask:
 * netcoredbg ends the app and itself when VS Code disconnects, while the sdb
 * forward keeps accepting connections, so a second F5 without a relaunch
 * "starts" and terminates at once.
 *
 * Run: node lib/tests/dotnet-debug-launch-json.test.js
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DOTNET_LAUNCH_CONFIG_NAME,
  DOTNET_LAUNCH_TASK_LABEL,
  parseCsprojProps,
  resolveDotnetLaunchProgram,
  buildDotnetLaunchConfiguration,
  buildDotnetLaunchTask,
  jsonDeepEqual,
  mergeVscodeJson,
  writeDotnetLaunchJson,
} = require("../core/debug");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message}`);
  }
}

const tmpRoots = [];
function mkProject({ nested = true, csproj, name = "MyApp" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-launch-json-"));
  tmpRoots.push(root);
  const dir = nested ? path.join(root, name) : root;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name}.csproj`),
    csproj ??
      `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0-tizen10.0</TargetFramework>
  </PropertyGroup>
</Project>
`,
  );
  return root;
}
const vscodeFile = (root, name) => path.join(root, ".vscode", name);
const readJson = (root, name) =>
  JSON.parse(fs.readFileSync(vscodeFile(root, name), "utf-8"));
const readLaunch = (root) => readJson(root, "launch.json");
const readTasks = (root) => readJson(root, "tasks.json");
const APP = { appId: "org.tizen.example.MyApp", serial: "emulator-26101" };

console.log("=== parseCsprojProps ===");

test("reads TargetFramework and AssemblyName", () => {
  const p = parseCsprojProps(
    "<Project><PropertyGroup><TargetFramework> net6.0-tizen7.0 </TargetFramework><AssemblyName>Custom</AssemblyName></PropertyGroup></Project>",
  );
  assert.strictEqual(p.targetFramework, "net6.0-tizen7.0");
  assert.strictEqual(p.assemblyName, "Custom");
});

test("missing elements → null", () => {
  const p = parseCsprojProps("<Project></Project>");
  assert.strictEqual(p.targetFramework, null);
  assert.strictEqual(p.assemblyName, null);
});

console.log("\n=== resolveDotnetLaunchProgram ===");

test("csproj one level down (tz new layout) → <App>/bin/Debug/<tfm>/<App>.dll", () => {
  const root = mkProject({ nested: true, name: "MyDotnetApp10" });
  const r = resolveDotnetLaunchProgram(root);
  assert.strictEqual(r.csprojDirRel, "MyDotnetApp10");
  assert.strictEqual(r.targetFramework, "net8.0-tizen10.0");
  assert.strictEqual(
    r.program,
    "${workspaceFolder}/MyDotnetApp10/bin/Debug/net8.0-tizen10.0/MyDotnetApp10.dll",
  );
  assert.strictEqual(
    r.cwd,
    "${workspaceFolder}/MyDotnetApp10/bin/Debug/net8.0-tizen10.0",
  );
});

test("csproj at the workspace root → bin/Debug/<tfm>/<App>.dll", () => {
  const root = mkProject({ nested: false, name: "RootApp" });
  const r = resolveDotnetLaunchProgram(root);
  assert.strictEqual(r.csprojDirRel, ".");
  assert.strictEqual(
    r.program,
    "${workspaceFolder}/bin/Debug/net8.0-tizen10.0/RootApp.dll",
  );
  assert.strictEqual(r.cwd, "${workspaceFolder}/bin/Debug/net8.0-tizen10.0");
});

test("AssemblyName overrides the csproj file name; TFM is not hard-coded", () => {
  const root = mkProject({
    name: "Proj",
    csproj:
      "<Project><PropertyGroup><TargetFramework>net6.0-tizen7.0</TargetFramework><AssemblyName>RealName</AssemblyName></PropertyGroup></Project>",
  });
  const r = resolveDotnetLaunchProgram(root);
  assert.strictEqual(r.assemblyName, "RealName");
  assert.strictEqual(
    r.program,
    "${workspaceFolder}/Proj/bin/Debug/net6.0-tizen7.0/RealName.dll",
  );
});

test("no .csproj → throws", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-launch-json-"));
  tmpRoots.push(root);
  assert.throws(() => resolveDotnetLaunchProgram(root), /No \.csproj found/);
});

test("csproj without TargetFramework → throws", () => {
  const root = mkProject({ csproj: "<Project></Project>" });
  assert.throws(() => resolveDotnetLaunchProgram(root), /no <TargetFramework>/);
});

console.log("\n=== buildDotnetLaunchConfiguration / buildDotnetLaunchTask ===");

test("coreclr + debugServer on the given port; preLaunchTask only when given", () => {
  const base = {
    program: "${workspaceFolder}/A/bin/Debug/net8.0-tizen10.0/A.dll",
    cwd: "${workspaceFolder}/A/bin/Debug/net8.0-tizen10.0",
    port: 4712,
  };
  const c = buildDotnetLaunchConfiguration(base);
  assert.strictEqual(c.name, DOTNET_LAUNCH_CONFIG_NAME);
  assert.strictEqual(c.type, "coreclr");
  assert.strictEqual(c.request, "launch");
  assert.strictEqual(c.debugServer, 4712);
  assert.strictEqual(c.stopAtEntry, false);
  assert.strictEqual("preLaunchTask" in c, false);
  const c2 = buildDotnetLaunchConfiguration({ ...base, preLaunchTask: "t" });
  assert.strictEqual(c2.preLaunchTask, "t");
});

test("relaunch task runs this runner: appId launch - port serial --project ${workspaceFolder}", () => {
  const t = buildDotnetLaunchTask({
    appId: "org.tizen.example.MyApp",
    port: 4711,
    serial: "emulator-26101",
  });
  assert.strictEqual(t.label, DOTNET_LAUNCH_TASK_LABEL);
  assert.strictEqual(t.type, "process");
  assert.strictEqual(t.command, "node");
  assert.match(t.args[0].replace(/\\/g, "/"), /\/cli\/dotnet-debug-cli\.js$/);
  assert.ok(
    fs.existsSync(t.args[0]),
    `default cli path must exist: ${t.args[0]}`,
  );
  assert.deepStrictEqual(t.args.slice(1), [
    "org.tizen.example.MyApp",
    "launch",
    "-",
    "4711",
    "emulator-26101",
    "--project",
    "${workspaceFolder}",
  ]);
  assert.deepStrictEqual(t.problemMatcher, []);
});

test("relaunch task without serial leaves the slot out; cliPath override honoured", () => {
  const t = buildDotnetLaunchTask({
    appId: "a.b.c",
    port: 4711,
    cliPath: "/x/dotnet-debug-cli.js",
  });
  assert.deepStrictEqual(t.args, [
    "/x/dotnet-debug-cli.js",
    "a.b.c",
    "launch",
    "-",
    "4711",
    "--project",
    "${workspaceFolder}",
  ]);
});

console.log("\n=== writeDotnetLaunchJson — launch.json only (no appId) ===");

test("no launch.json → created with one configuration, no preLaunchTask, no tasks.json", () => {
  const root = mkProject({ name: "MyDotnetApp10" });
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "created");
  assert.strictEqual(r.launch_json_path, vscodeFile(root, "launch.json"));
  assert.strictEqual(r.pre_launch_task, undefined);
  assert.strictEqual(r.tasks_json_path, undefined);
  assert.strictEqual(fs.existsSync(vscodeFile(root, "tasks.json")), false);
  const doc = readLaunch(root);
  assert.strictEqual(doc.version, "0.2.0");
  assert.strictEqual(doc.configurations.length, 1);
  assert.strictEqual(doc.configurations[0].name, DOTNET_LAUNCH_CONFIG_NAME);
  assert.strictEqual(doc.configurations[0].type, "coreclr");
  assert.strictEqual(doc.configurations[0].debugServer, 4711);
  assert.strictEqual("preLaunchTask" in doc.configurations[0], false);
  assert.strictEqual(
    doc.configurations[0].program,
    "${workspaceFolder}/MyDotnetApp10/bin/Debug/net8.0-tizen10.0/MyDotnetApp10.dll",
  );
});

test("existing launch.json → our configuration appended, others preserved", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  fs.writeFileSync(
    vscodeFile(root, "launch.json"),
    JSON.stringify(
      {
        version: "0.2.0",
        configurations: [
          { name: "Other", type: "node", request: "launch", program: "x.js" },
        ],
      },
      null,
      2,
    ),
  );
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "updated");
  const doc = readLaunch(root);
  assert.strictEqual(doc.configurations.length, 2);
  assert.strictEqual(doc.configurations[0].name, "Other");
  assert.strictEqual(doc.configurations[0].type, "node");
  assert.strictEqual(doc.configurations[1].name, DOTNET_LAUNCH_CONFIG_NAME);
});

test("stale configuration with our name → replaced in place, not duplicated", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  fs.writeFileSync(
    vscodeFile(root, "launch.json"),
    JSON.stringify({
      version: "0.2.0",
      configurations: [
        { name: DOTNET_LAUNCH_CONFIG_NAME, type: "tizen-netcoredbg", port: 1 },
        { name: "Other", type: "node" },
      ],
    }),
  );
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "updated");
  const doc = readLaunch(root);
  assert.strictEqual(doc.configurations.length, 2);
  assert.strictEqual(doc.configurations[0].name, DOTNET_LAUNCH_CONFIG_NAME);
  assert.strictEqual(doc.configurations[0].type, "coreclr");
  assert.strictEqual(doc.configurations[0].debugServer, 4711);
  assert.strictEqual(doc.configurations[1].name, "Other");
});

test("second run with identical inputs → unchanged, file not rewritten", () => {
  const root = mkProject();
  writeDotnetLaunchJson(root, 4711);
  const p = vscodeFile(root, "launch.json");
  const before = fs.readFileSync(p, "utf-8");
  fs.writeFileSync(p, before.replace(/\n$/, "\n\n"));
  const marker = fs.readFileSync(p, "utf-8");
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "unchanged");
  assert.strictEqual(fs.readFileSync(p, "utf-8"), marker);
});

test("port change → updated with the new debugServer", () => {
  const root = mkProject();
  writeDotnetLaunchJson(root, 4711);
  const r = writeDotnetLaunchJson(root, 4712);
  assert.strictEqual(r.action, "updated");
  assert.strictEqual(readLaunch(root).configurations[0].debugServer, 4712);
});

test("existing launch.json with comments (JSONC) → skipped, file untouched", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "launch.json");
  const original = `{
  // user's own file
  "version": "0.2.0",
  "configurations": [],
}
`;
  fs.writeFileSync(p, original);
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "skipped");
  assert.match(r.reason, /not strict JSON/);
  assert.strictEqual(fs.readFileSync(p, "utf-8"), original);
  // the configuration is still returned so the caller can show it
  assert.strictEqual(r.configuration.type, "coreclr");
});

test("existing launch.json that is a JSON array → skipped, file untouched", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "launch.json");
  fs.writeFileSync(p, "[]");
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "skipped");
  assert.strictEqual(fs.readFileSync(p, "utf-8"), "[]");
});

console.log(
  "\n=== writeDotnetLaunchJson — with appId: tasks.json + preLaunchTask ===",
);

test("appId given → tasks.json created and the configuration gets preLaunchTask", () => {
  const root = mkProject({ name: "MyDotnetApp10" });
  const r = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r.action, "created");
  assert.strictEqual(r.tasks_json_action, "created");
  assert.strictEqual(r.tasks_json_path, vscodeFile(root, "tasks.json"));
  assert.strictEqual(r.pre_launch_task, DOTNET_LAUNCH_TASK_LABEL);
  const launch = readLaunch(root);
  assert.strictEqual(
    launch.configurations[0].preLaunchTask,
    DOTNET_LAUNCH_TASK_LABEL,
  );
  const tasks = readTasks(root);
  assert.strictEqual(tasks.version, "2.0.0");
  assert.strictEqual(tasks.tasks.length, 1);
  const t = tasks.tasks[0];
  assert.strictEqual(t.label, DOTNET_LAUNCH_TASK_LABEL);
  assert.strictEqual(t.command, "node");
  assert.deepStrictEqual(t.args.slice(1), [
    APP.appId,
    "launch",
    "-",
    "4711",
    APP.serial,
    "--project",
    "${workspaceFolder}",
  ]);
});

test("existing tasks.json → our task appended, other tasks preserved", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  fs.writeFileSync(
    vscodeFile(root, "tasks.json"),
    JSON.stringify({
      version: "2.0.0",
      tasks: [{ label: "build", type: "shell", command: "dotnet build" }],
    }),
  );
  const r = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r.tasks_json_action, "updated");
  const tasks = readTasks(root);
  assert.strictEqual(tasks.tasks.length, 2);
  assert.strictEqual(tasks.tasks[0].label, "build");
  assert.strictEqual(tasks.tasks[0].command, "dotnet build");
  assert.strictEqual(tasks.tasks[1].label, DOTNET_LAUNCH_TASK_LABEL);
});

test("stale task with our label → replaced in place; identical rerun → unchanged", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  fs.writeFileSync(
    vscodeFile(root, "tasks.json"),
    JSON.stringify({
      version: "2.0.0",
      tasks: [
        { label: DOTNET_LAUNCH_TASK_LABEL, type: "shell", command: "old" },
        { label: "other", type: "shell", command: "x" },
      ],
    }),
  );
  const r1 = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r1.tasks_json_action, "updated");
  const tasks = readTasks(root);
  assert.strictEqual(tasks.tasks.length, 2);
  assert.strictEqual(tasks.tasks[0].label, DOTNET_LAUNCH_TASK_LABEL);
  assert.strictEqual(tasks.tasks[0].command, "node");
  assert.strictEqual(tasks.tasks[1].label, "other");
  const r2 = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r2.tasks_json_action, "unchanged");
  assert.strictEqual(r2.action, "unchanged");
});

test("serial/port change → task args follow", () => {
  const root = mkProject();
  writeDotnetLaunchJson(root, 4711, APP);
  const r = writeDotnetLaunchJson(root, 4712, {
    appId: APP.appId,
    serial: "emulator-26111",
  });
  assert.strictEqual(r.tasks_json_action, "updated");
  assert.strictEqual(r.action, "updated");
  const t = readTasks(root).tasks[0];
  assert.strictEqual(t.args[4], "4712");
  assert.strictEqual(t.args[5], "emulator-26111");
  assert.strictEqual(readLaunch(root).configurations[0].debugServer, 4712);
});

test("tasks.json with comments (JSONC) → tasks skipped, launch.json written WITHOUT preLaunchTask", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "tasks.json");
  const original = `{ // mine\n  "version": "2.0.0", "tasks": [] }\n`;
  fs.writeFileSync(p, original);
  const r = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r.tasks_json_action, "skipped");
  assert.match(r.tasks_reason, /not strict JSON/);
  assert.strictEqual(fs.readFileSync(p, "utf-8"), original);
  assert.strictEqual(r.pre_launch_task, undefined);
  assert.strictEqual(r.action, "created");
  assert.strictEqual(
    "preLaunchTask" in readLaunch(root).configurations[0],
    false,
  );
});

console.log("\n=== review follow-ups: csproj variants ===");

test("<TargetFrameworks> multi-target → the Tizen TFM is chosen", () => {
  const p = parseCsprojProps(
    "<Project><PropertyGroup><TargetFrameworks>net8.0;net8.0-tizen10.0;net8.0-android</TargetFrameworks></PropertyGroup></Project>",
  );
  assert.strictEqual(p.targetFramework, "net8.0-tizen10.0");
});

test("<TargetFrameworks> without a Tizen entry → first entry", () => {
  const p = parseCsprojProps(
    "<Project><TargetFrameworks> net8.0 ; net9.0 </TargetFrameworks></Project>",
  );
  assert.strictEqual(p.targetFramework, "net8.0");
});

test('<TargetFramework Condition="..."> and <AssemblyName Label="..."> are matched', () => {
  const p = parseCsprojProps(
    `<Project><PropertyGroup Condition=" '$(Configuration)' == 'Debug' ">
       <TargetFramework Condition=" '$(TizenTarget)' == 'true' ">net8.0-tizen10.0</TargetFramework>
       <AssemblyName Label="x">My.App</AssemblyName>
     </PropertyGroup></Project>`,
  );
  assert.strictEqual(p.targetFramework, "net8.0-tizen10.0");
  assert.strictEqual(p.assemblyName, "My.App");
});

test("multi-target project resolves program under the Tizen TFM", () => {
  const root = mkProject({
    name: "Multi",
    csproj:
      "<Project><PropertyGroup><TargetFrameworks>net8.0;net8.0-tizen10.0</TargetFrameworks></PropertyGroup></Project>",
  });
  const r = resolveDotnetLaunchProgram(root);
  assert.strictEqual(
    r.program,
    "${workspaceFolder}/Multi/bin/Debug/net8.0-tizen10.0/Multi.dll",
  );
});

console.log("\n=== review follow-ups: user file preservation ===");

test("jsonDeepEqual ignores key order, catches value/shape differences", () => {
  assert.strictEqual(
    jsonDeepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }),
    true,
  );
  assert.strictEqual(jsonDeepEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.strictEqual(jsonDeepEqual([1, 2], [2, 1]), false);
  assert.strictEqual(jsonDeepEqual({ a: null }, { a: 0 }), false);
  assert.strictEqual(jsonDeepEqual({ a: [] }, { a: {} }), false);
});

test("same configuration with different key order → unchanged, file byte-identical", () => {
  const root = mkProject({ name: "MyDotnetApp10" });
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "launch.json");
  const reordered = {
    version: "0.2.0",
    configurations: [
      {
        stopAtEntry: false,
        debugServer: 4711,
        cwd: "${workspaceFolder}/MyDotnetApp10/bin/Debug/net8.0-tizen10.0",
        program:
          "${workspaceFolder}/MyDotnetApp10/bin/Debug/net8.0-tizen10.0/MyDotnetApp10.dll",
        request: "launch",
        type: "coreclr",
        name: DOTNET_LAUNCH_CONFIG_NAME,
      },
    ],
  };
  const original = `${JSON.stringify(reordered, null, 4)}\n`;
  fs.writeFileSync(p, original);
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "unchanged");
  assert.strictEqual(fs.readFileSync(p, "utf-8"), original);
});

test("appending to a 4-space-indented file keeps 4-space indentation and other entries", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "launch.json");
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        version: "0.2.0",
        configurations: [{ name: "Other", type: "node", request: "launch" }],
      },
      null,
      4,
    ),
  ); // no trailing newline on purpose
  const r = writeDotnetLaunchJson(root, 4711);
  assert.strictEqual(r.action, "updated");
  const text = fs.readFileSync(p, "utf-8");
  assert.match(text.split("\n")[1], /^ {4}"version"/);
  assert.strictEqual(text.endsWith("\n"), false, "trailing-newline style kept");
  const doc = JSON.parse(text);
  assert.strictEqual(doc.configurations[0].name, "Other");
  assert.strictEqual(doc.configurations[1].name, DOTNET_LAUNCH_CONFIG_NAME);
});

test("tab-indented tasks.json keeps tabs after merge", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "tasks.json");
  fs.writeFileSync(
    p,
    `{\n\t"version": "2.0.0",\n\t"tasks": [\n\t\t{ "label": "build", "type": "shell", "command": "dotnet build" }\n\t]\n}\n`,
  );
  const r = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r.tasks_json_action, "updated");
  const text = fs.readFileSync(p, "utf-8");
  assert.match(text.split("\n")[1], /^\t"version"/);
  assert.strictEqual(JSON.parse(text).tasks[0].label, "build");
});

test("mergeVscodeJson: structurally equal entry → unchanged and no write", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "x.json");
  const original = '{"items":[{"b":2,"a":1}],"version":"1"}';
  fs.writeFileSync(p, original);
  const r = mergeVscodeJson(p, {
    defaults: { version: "1" },
    key: "items",
    match: (e) => e.a === 1,
    entry: { a: 1, b: 2 },
  });
  assert.strictEqual(r.action, "unchanged");
  assert.strictEqual(fs.readFileSync(p, "utf-8"), original);
});

console.log("\n=== review follow-ups: no orphan relaunch task ===");

test("launch.json is JSONC → tasks.json is NOT created, both reported skipped", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  const p = vscodeFile(root, "launch.json");
  const original = `{\n  // mine\n  "version": "0.2.0",\n  "configurations": [],\n}\n`;
  fs.writeFileSync(p, original);
  const r = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r.action, "skipped");
  assert.match(r.reason, /not strict JSON/);
  assert.strictEqual(r.tasks_json_action, "skipped");
  assert.match(r.tasks_reason, /launch\.json could not be updated/);
  assert.strictEqual(r.pre_launch_task, undefined);
  assert.strictEqual(fs.existsSync(vscodeFile(root, "tasks.json")), false);
  assert.strictEqual(fs.readFileSync(p, "utf-8"), original);
});

test("launch.json is JSONC and tasks.json already exists → tasks.json left untouched", () => {
  const root = mkProject();
  fs.mkdirSync(path.join(root, ".vscode"));
  fs.writeFileSync(vscodeFile(root, "launch.json"), "{ // x\n}\n");
  const tasksOriginal = JSON.stringify({
    version: "2.0.0",
    tasks: [{ label: "build" }],
  });
  fs.writeFileSync(vscodeFile(root, "tasks.json"), tasksOriginal);
  const r = writeDotnetLaunchJson(root, 4711, APP);
  assert.strictEqual(r.action, "skipped");
  assert.strictEqual(r.tasks_json_action, "skipped");
  assert.strictEqual(
    fs.readFileSync(vscodeFile(root, "tasks.json"), "utf-8"),
    tasksOriginal,
  );
});

for (const root of tmpRoots) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
