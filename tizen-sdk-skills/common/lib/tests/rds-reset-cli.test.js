// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * project-manager-cli.js --reset-rds tests.
 *
 * The reset path is intentionally independent of the SDK and connected
 * devices: it locates the project from the package path, deletes host-side
 * RDS state, and emits a machine-readable Standard JSON Envelope.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CLI = path.join(__dirname, "..", "cli", "project-manager-cli.js");

console.log("=== project-manager-cli --reset-rds Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  const ok = condition === true;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${details ? ` — ${details}` : ""}`,
  );
}

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
  let envelope = null;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    // The checks below report malformed stdout with useful context.
  }
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    envelope,
  };
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-rds-reset-cli-"));
const projectDir = path.join(tempRoot, "MyApp");
const packagePath = path.join(projectDir, "Debug", "MyApp-1.0.0.tpk");
const stateDir = path.join(projectDir, ".tizen-rds");
const stateFiles = [
  "deploy-state.json",
  "changelist.json",
  "baseline-manifest.json",
  "build-manifest.json",
];

try {
  fs.mkdirSync(path.dirname(packagePath), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "tizen_native_project.yaml"),
    "ignore: []\n",
    "utf8",
  );
  fs.mkdirSync(stateDir, { recursive: true });
  for (const file of stateFiles) {
    fs.writeFileSync(path.join(stateDir, file), "stale state\n", "utf8");
  }

  console.log("--- reset with a missing package file ---");
  const reset = run(["install", "--package", packagePath, "--reset-rds"]);
  check("reset exits successfully", reset.status === 0);
  check(
    "reset stdout is one JSON envelope",
    reset.envelope !== null,
    reset.stdout,
  );
  check("reset reports success", reset.envelope?.status === "success");
  check(
    "reset reports the project path",
    reset.envelope?.result?.project_path === projectDir,
  );
  check(
    "reset reports rds_state=reset",
    reset.envelope?.result?.rds_state === "reset",
  );
  check(
    "reset does not leak diagnostics into stdout",
    !reset.stdout.includes("[RDS]"),
  );
  for (const file of stateFiles) {
    check(`reset deletes ${file}`, !fs.existsSync(path.join(stateDir, file)));
  }

  console.log("\n--- reset cannot be combined with --run ---");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "deploy-state.json"), "stale\n", "utf8");
  const invalid = run([
    "install",
    "--package",
    packagePath,
    "--reset-rds",
    "--run",
  ]);
  check("conflicting flags exit with failure", invalid.status === 1);
  check(
    "conflicting flags report a JSON envelope",
    invalid.envelope !== null,
    invalid.stdout,
  );
  check(
    "conflicting flags report invalid_parameters",
    invalid.envelope?.errors?.[0]?.error_category === "invalid_parameters",
  );
  check(
    "conflicting flags leave state untouched",
    fs.existsSync(path.join(stateDir, "deploy-state.json")),
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(
  `\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`,
);
process.exit(failures === 0 ? 0 : 1);
