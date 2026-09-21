// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * app-type-detector.js tests.
 *
 * Ported from ProjectUtils.isWebProject/isNativeProject/isDotNetProject +
 * baseline-manager.ts's detectAppType() — covers marker-file detection,
 * order-of-precedence (web > native > dotnet), the dotnet manifest+csproj
 * pairing, the dot-directory skip (matches glob's default `dot: false`),
 * and the null-for-unrecognized divergence from the extension's default.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  detectAppType,
  isWebProject,
  isNativeProject,
  isDotNetProject,
} = require("../core/rds/app-type-detector");

console.log("=== app-type-detector Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tizen-app-type-test-"));
}

function writeFile(dir, relPath, content = "") {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

// ─── isWebProject ────────────────────────────────────────────────────────────

console.log("isWebProject:");

{
  const dir = makeSandbox();
  check("false when config.xml absent", isWebProject(dir), false);
  writeFile(dir, "config.xml", "<widget/>");
  check("true when config.xml present at root", isWebProject(dir), true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── isNativeProject ─────────────────────────────────────────────────────────

console.log("\nisNativeProject:");

{
  const dir = makeSandbox();
  check("false when no native markers", isNativeProject(dir), false);
  writeFile(dir, "tizen_native_project.yaml", "");
  check("true with tizen_native_project.yaml", isNativeProject(dir), true);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "project_def.prop", "");
  check("true with project_def.prop", isNativeProject(dir), true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── isDotNetProject ─────────────────────────────────────────────────────────

console.log("\nisDotNetProject:");

{
  const dir = makeSandbox();
  check("false when no dotnet markers", isDotNetProject(dir), false);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "TizenNUIApp/tizen_dotnet_project.yaml", "");
  check(
    "true with tizen_dotnet_project.yaml nested under a subdirectory",
    isDotNetProject(dir),
    true,
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "TizenNUIApp/tizen-manifest.xml", "<manifest/>");
  writeFile(dir, "TizenNUIApp/TizenNUI.csproj", "");
  check(
    "true with tizen-manifest.xml + sibling .csproj",
    isDotNetProject(dir),
    true,
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "TizenNUIApp/tizen-manifest.xml", "<manifest/>");
  check(
    "false with tizen-manifest.xml but no sibling .csproj",
    isDotNetProject(dir),
    false,
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, ".git/tizen_dotnet_project.yaml", "");
  check(
    "dot-directories are not descended into (matches glob's dot:false)",
    isDotNetProject(dir),
    false,
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── detectAppType — order of precedence ────────────────────────────────────

console.log("\ndetectAppType:");

{
  const dir = makeSandbox();
  check("null for an empty/unrecognized project", detectAppType(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "tizen_native_project.yaml", "");
  check(
    "native when only native markers present",
    detectAppType(dir),
    "native",
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "config.xml", "<widget/>");
  check("web when only web markers present", detectAppType(dir), "web");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "tizen-manifest.xml", "<manifest/>");
  writeFile(dir, "App.csproj", "");
  check(
    "dotnet when only dotnet markers present",
    detectAppType(dir),
    "dotnet",
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "config.xml", "<widget/>");
  writeFile(dir, "tizen_native_project.yaml", "");
  check("web wins over native when both present", detectAppType(dir), "web");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "tizen_native_project.yaml", "");
  writeFile(dir, "tizen-manifest.xml", "<manifest/>");
  writeFile(dir, "App.csproj", "");
  check(
    "native wins over dotnet when both present",
    detectAppType(dir),
    "native",
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
