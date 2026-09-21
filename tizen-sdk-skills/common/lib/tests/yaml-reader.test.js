// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * yaml-reader.js tests.
 *
 * Ported from project-yaml-reader.ts — covers the hand-rolled YAML subset
 * parser (comments, `key: scalar`, `key: []`, indented and unindented
 * `- item` lists, quoted scalars/items), findProjectYamlPath for all three
 * app types (including the dotnet csproj-directory search), and the three
 * per-app-type extractors + the ignore-config fallback.
 *
 * The native/web fixtures below are copied verbatim from real
 * `tz create`-generated tizen_native_project.yaml / tizen_web_project.yaml
 * files (see also usage/TetrisApp/tizen_web_project.yaml) — including the
 * unindented `src_file_patterns`/`test_file_patterns` lists tizen-core
 * actually emits, which is the one shape a naive "list items are indented"
 * assumption would miss.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseProjectYaml,
  findProjectYamlPath,
  parseNativeProjectYaml,
  parseWebProjectYaml,
  parseDotnetProjectYaml,
  readInputInterestConfig,
  readInputIgnoreConfig,
} = require("../core/rds/yaml-reader");
const { DEFAULT_INPUT_IGNORE_PATTERNS } = require("../core/rds/constants");

console.log("=== yaml-reader Test ===\n");

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "tizen-yaml-reader-test-"));
}

function writeFile(dir, relPath, content) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

const NATIVE_YAML_FIXTURE = `# Project type [native_app, shared_lib, static_lib, test_runner]
project_type: native_app

# Default profile, Tizen API version
profile: tizen
api_version: "10.0"

# Output name for compiled binary/ lib
output_name: t10nativeiotserviceapp

# Output path for build
output_path: ""

# Build type [Debug/ Release/ Test]
build_type: Debug

# Rootstrap for compiling native app
rootstrap: public

# Default compiler for native app compilation
compiler: gcc

# Supported architectures for building:
arch: x86_64

# Signing profile to be used for Tizen package signing
signing_profile: ""

# list of source files (.c, .cpp, .asm, .S etc}} and headers
sources:
  - inc/t10nativeiotserviceapp.h
  - src/t10nativeiotserviceapp.c

# preprocessor defines, passed to the C/C++ compiler with -D options
defines:
  - DEPRECATION_WARNING
  - TIZEN_DEPRECATION
  - _APP_LOG

# header include directories, passed to the C/C++ compiler with -I option
include_dirs:
  - inc

# common compilation flags, passed to both C/C++ compiler
cflags: []

# c compilation flags, passed to only C compiler
cflags_c: []

# cpp compilation flags, passed to only C++ compiler
cflags_cc: []

# assembler flags
asmflags: []

# list of library names or library paths to link with target
libs: []

# list of library dirs, to be passed to linker with -L option
lib_dirs: []

# list of library files, to be passed to linker as input
lib_files: []

# additional linker flags for the target
ldflags: []

# list of edc files
edc_files: []

# list of directories containing images
edc_images_dirs: []

# list of directories containing sound files
edc_sound_dirs: []

# list of directories containing font files
edc_font_dirs: []

# list of po files
po_files: []

# list of resource files, to be packed in tpk
resources:
  - shared/res/t10nativeiotserviceapp.png

# list of certs in native project (.trust-anchor)
trust_anchor: []

# project dependencies
deps: []

# Source files matching these pattern will always be excluded from build
src_file_patterns:
- "_exclude*"

# Source files matching these patterns will only be included while building in test mode
test_file_patterns:
- "_test*"
`;

const WEB_YAML_FIXTURE = `# Project type [web_app, test_runner]
project_type: web_app

# Default profile, Tizen API version
profile: tizen
api_version: "10.0"

# Build type [Debug/ Release/ Test]
build_type: Debug

# Output name for application
output_name: TetrisApp

# Output path for build
output_path: ""

# Enable size optimization of wgt for web workspace
opt: false

# Signing profile to be used for Tizen package signing
signing_profile: ""

# list of certs in web project (.trust-anchor)
trust_anchor: []

# list of files in web project (.html,.css etc) and resources
files:
  - css/style.css
  - icon.png
  - images/tizen_32.png
  - index.html
  - js/main.js

# list of files to exclude based on the matched patterns
excludes:
  - Build/*
  - Debug/*
  - Directory.Build.targets
  - Release/*
  - Test/*
  - \\.Build/.*
  - \\.csproj
  - \\.tproject
  - \\.wgt
  - tizen_web_project.yaml
  - webUnitTest/*

# project dependencies
deps: []
`;

const DOTNET_YAML_FIXTURE = `# csproj file path
csproj_file: TizenNUIApp.csproj

# Default profile, Tizen API version
profile: tizen
api_version: "10.0"

# Build type [Debug/ Release/ Test]
build_type: Debug

# Signing profile to be used for Tizen package signing
signing_profile: ""

# files monitored for dirty/modified status
files:
  - TizenNUIApp.csproj
  - TizenNUIApp.cs
  - tizen-manifest.xml
  - shared/res/TizenNUIApp.png

# project dependencies
deps: []
`;

// ─── parseProjectYaml (pure) ──────────────────────────────────────────────────

console.log("parseProjectYaml:");

{
  const raw = parseProjectYaml(NATIVE_YAML_FIXTURE);
  check("scalar value", raw.project_type, "native_app");
  check("quoted scalar is unquoted", raw.api_version, "10.0");
  check("empty quoted scalar", raw.output_path, "");
  check("indented list", raw.sources, [
    "inc/t10nativeiotserviceapp.h",
    "src/t10nativeiotserviceapp.c",
  ]);
  check("empty list via []", raw.cflags, []);
  check("unindented quoted list item", raw.src_file_patterns, ["_exclude*"]);
  check(
    "second unindented list is not appended to the first",
    raw.test_file_patterns,
    ["_test*"],
  );
}

{
  const raw = parseProjectYaml("# just a comment\n\n\n");
  check("comment-only / blank content yields empty object", raw, {});
}

// ─── findProjectYamlPath ──────────────────────────────────────────────────────

console.log("\nfindProjectYamlPath:");

{
  const dir = makeSandbox();
  check("native: null when absent", findProjectYamlPath(dir, "native"), null);
  writeFile(dir, "tizen_native_project.yaml", NATIVE_YAML_FIXTURE);
  check(
    "native: found at project root",
    findProjectYamlPath(dir, "native"),
    path.join(dir, "tizen_native_project.yaml"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  writeFile(dir, "tizen_web_project.yaml", WEB_YAML_FIXTURE);
  check(
    "web: found at project root",
    findProjectYamlPath(dir, "web"),
    path.join(dir, "tizen_web_project.yaml"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  check(
    "dotnet: null when no .csproj present",
    findProjectYamlPath(dir, "dotnet"),
    null,
  );
  writeFile(dir, "TizenNUIApp/TizenNUIApp.csproj", "");
  check(
    "dotnet: null when .csproj present but yaml missing alongside it",
    findProjectYamlPath(dir, "dotnet"),
    null,
  );
  writeFile(dir, "TizenNUIApp/tizen_dotnet_project.yaml", DOTNET_YAML_FIXTURE);
  check(
    "dotnet: found alongside .csproj in a subdirectory",
    findProjectYamlPath(dir, "dotnet"),
    path.join(dir, "TizenNUIApp", "tizen_dotnet_project.yaml"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeSandbox();
  check("unknown app type -> null", findProjectYamlPath(dir, "rpk"), null);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── per-app-type parsers + readInputInterestConfig + readInputIgnoreConfig ──

(async () => {
  console.log("\nparseNativeProjectYaml:");
  {
    const dir = makeSandbox();
    const yamlPath = path.join(dir, "tizen_native_project.yaml");
    writeFile(dir, "tizen_native_project.yaml", NATIVE_YAML_FIXTURE);
    const config = await parseNativeProjectYaml(yamlPath);
    check("sources", config.sources, [
      "inc/t10nativeiotserviceapp.h",
      "src/t10nativeiotserviceapp.c",
    ]);
    check("resources", config.resources, [
      "shared/res/t10nativeiotserviceapp.png",
    ]);
    check("srcFilePatterns", config.srcFilePatterns, ["_exclude*"]);
    check("deps defaults to empty array", config.deps, []);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\nparseWebProjectYaml:");
  {
    const dir = makeSandbox();
    const yamlPath = path.join(dir, "tizen_web_project.yaml");
    writeFile(dir, "tizen_web_project.yaml", WEB_YAML_FIXTURE);
    const config = await parseWebProjectYaml(yamlPath);
    check("excludes", config.excludes.slice(0, 3), [
      "Build/*",
      "Debug/*",
      "Directory.Build.targets",
    ]);
    check("projectPath defaults to empty string", config.projectPath, "");
    check("deps defaults to empty array", config.deps, []);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\nparseDotnetProjectYaml:");
  {
    const dir = makeSandbox();
    const yamlPath = path.join(dir, "tizen_dotnet_project.yaml");
    writeFile(dir, "tizen_dotnet_project.yaml", DOTNET_YAML_FIXTURE);
    const config = await parseDotnetProjectYaml(yamlPath);
    check("files", config.files, [
      "TizenNUIApp.csproj",
      "TizenNUIApp.cs",
      "tizen-manifest.xml",
      "shared/res/TizenNUIApp.png",
    ]);
    check("csprojFile", config.csprojFile, "TizenNUIApp.csproj");
    check(
      "resources defaults to empty array (key absent)",
      config.resources,
      [],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\nreadInputInterestConfig:");
  {
    const dir = makeSandbox();
    writeFile(dir, "tizen_native_project.yaml", NATIVE_YAML_FIXTURE);
    const result = await readInputInterestConfig(dir, "native");
    check("appType tag", result.appType, "native");
    check("config.sources", result.config.sources, [
      "inc/t10nativeiotserviceapp.h",
      "src/t10nativeiotserviceapp.c",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    let threw = false;
    try {
      await readInputInterestConfig(dir, "native");
    } catch {
      threw = true;
    }
    check("throws when the YAML file is missing", threw, true);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log("\nreadInputIgnoreConfig:");
  {
    const dir = makeSandbox();
    writeFile(dir, "tizen_web_project.yaml", WEB_YAML_FIXTURE);
    const result = await readInputIgnoreConfig(dir, "web");
    check(
      "defaults are included",
      DEFAULT_INPUT_IGNORE_PATTERNS.every((p) => result.patterns.includes(p)),
      true,
    );
    check(
      "web excludes are appended",
      result.patterns.includes("Directory.Build.targets"),
      true,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "tizen_native_project.yaml", NATIVE_YAML_FIXTURE);
    const result = await readInputIgnoreConfig(dir, "native");
    check(
      "native src_file_patterns are appended",
      result.patterns.includes("_exclude*"),
      true,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    const originalWarn = console.warn;
    console.warn = () => {};
    const result = await readInputIgnoreConfig(dir, "native");
    console.warn = originalWarn;
    check(
      "falls back to defaults alone when YAML is missing (never throws)",
      result.patterns,
      DEFAULT_INPUT_IGNORE_PATTERNS,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
