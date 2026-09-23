// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== import-wgt Test ===\n");
let failures = 0;
function check(name, actual, expected = true) {
  if (actual !== expected) {
    failures++;
    console.log(`FAIL ${name}: expected ${expected}, got ${actual}`);
  } else console.log(`PASS ${name}`);
}

const { importWgt, buildImportWgtScriptArgs } = require("../core/project");
const CLI = path.join(__dirname, "..", "cli", "project-manager-cli.js");
const SCRIPT_ROOT = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "tizen-import-wgt",
);

for (const script of ["tizen-import-wgt.sh", "tizen-import-wgt.ps1"]) {
  const source = fs.readFileSync(path.join(SCRIPT_ROOT, script), "utf8");
  check(`${script} invokes tz import-wgt`, source.includes("import-wgt"));
  check(
    `${script} passes WGT, profile, and workspace arguments`,
    source.includes("wgt-path") &&
      source.includes("profile") &&
      source.includes("ws-dir"),
  );
}
const bashImportScript = fs.readFileSync(
  path.join(SCRIPT_ROOT, "tizen-import-wgt.sh"),
  "utf8",
);
const powershellImportScript = fs.readFileSync(
  path.join(SCRIPT_ROOT, "tizen-import-wgt.ps1"),
  "utf8",
);
check(
  "Bash script rejects missing import arguments independently",
  bashImportScript.includes('[[ -z "$wgt_path"'),
);
check(
  "PowerShell script rejects empty import arguments independently",
  powershellImportScript.includes("ValidateNotNullOrEmpty"),
);
check(
  "Bash script restricts --profile to tizen|tv-samsung like the PowerShell ValidateSet",
  bashImportScript.includes("tizen|tv-samsung)"),
);
for (const [script, source] of [
  ["tizen-import-wgt.sh", bashImportScript],
  ["tizen-import-wgt.ps1", powershellImportScript],
]) {
  check(
    `${script} refuses a profile that tz list templates does not know`,
    source.includes("list templates") && source.includes("is not installed"),
  );
  check(
    `${script} rejects WGT file names tz cannot use as a project name`,
    source.includes("[A-Za-z0-9]"),
  );
}
// The tizen-cli command spec must mirror the runner contract: four required
// options, --profile limited to the two profiles importWgt() accepts, and the
// handler passing Commander's camelCased option keys to importWgt() in the
// runner's positional order. Read from source — the spec is TypeScript.
const specPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "tizen-cli",
  "src",
  "command-specs",
  "project.ts",
);
// Only present in the source repository (the shipped plugin has no tizen-cli/).
const specSource = fs.existsSync(specPath)
  ? fs.readFileSync(specPath, "utf8")
  : null;
if (specSource === null)
  console.log("SKIP tizen-cli spec checks (no tizen-cli/src)");
const importSpec = ((specSource || "").match(
  /name: "import-wgt",[\s\S]*?handler:[\s\S]*?\),\n {2}\},/,
) || [""])[0];
if (specSource !== null) {
  check(
    "tizen-cli registers an import-wgt command spec",
    importSpec.length > 0,
  );
  check(
    "import-wgt spec collects all missing options at once",
    /collectAllMissing: true/.test(importSpec),
  );
  for (const flag of [
    "--wgt-path <path>",
    "--profile <profile>",
    "--platform-version <version>",
    "--working-dir <dir>",
  ]) {
    const optionBlock = (importSpec.match(
      new RegExp(`\\{[^{}]*flags: "${flag}"[^{}]*\\}`),
    ) || [""])[0];
    check(
      `import-wgt option ${flag} is required`,
      /required: true/.test(optionBlock),
    );
  }
  check(
    "import-wgt restricts --profile to the profiles importWgt() accepts",
    /flags: "--profile <profile>"[^}]*choices: \["tizen", "tv-samsung"\]/.test(
      importSpec,
    ),
  );
  check(
    "import-wgt handler maps camelCased options to importWgt() in runner order",
    /sdkCommands\.importWgt\(\s*o\.wgtPath,\s*o\.profile,\s*o\.platformVersion,\s*o\.workingDir,\s*"tizen-sdk import-wgt",\s*\)/.test(
      importSpec,
    ),
  );
}

const scriptArgs = buildImportWgtScriptArgs(
  "C:\\Widgets\\Weather.wgt",
  "tizen",
  "10.0",
  "C:\\Workspace",
);
check(
  "one helper keeps PowerShell and Bash arguments aligned",
  scriptArgs.winArgs.includes('-WgtPath "C:/Widgets/Weather.wgt"') &&
    scriptArgs.winArgs.includes('-Profile "tizen"') &&
    scriptArgs.unixArgs.includes('--wgt-path="C:\\Widgets\\Weather.wgt"') &&
    scriptArgs.unixArgs.includes('--profile="tizen"'),
);

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "import-wgt-test-"));
  const scriptDir = path.join(root, "scripts", "tizen-import-wgt");
  fs.mkdirSync(scriptDir, { recursive: true });
  const script = [
    "#!/usr/bin/env bash",
    'for arg in "$@"; do case "$arg" in --wgt-path=*) wgt="${arg#*=}";; --working-dir=*) ws="${arg#*=}";; esac; done',
    'mkdir -p "$ws/$(basename "${wgt%.wgt}")"',
  ].join("\n");
  fs.writeFileSync(path.join(scriptDir, "tizen-import-wgt.sh"), `${script}\n`, {
    mode: 0o755,
  });
  const ps1 = [
    "param([string]$WgtPath, [string]$WorkingDir)",
    "$name = [IO.Path]::GetFileNameWithoutExtension($WgtPath)",
    "New-Item -ItemType Directory -Path (Join-Path $WorkingDir $name) -Force | Out-Null",
  ].join("\n");
  fs.writeFileSync(path.join(scriptDir, "tizen-import-wgt.ps1"), `${ps1}\n`);
  return root;
}

async function withRoot(fn) {
  const root = makeRoot();
  const prior = process.env.TIZEN_SDK_SKILLS_ROOT;
  process.env.TIZEN_SDK_SKILLS_ROOT = root;
  try {
    return await fn();
  } finally {
    if (prior === undefined) delete process.env.TIZEN_SDK_SKILLS_ROOT;
    else process.env.TIZEN_SDK_SKILLS_ROOT = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

(async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "import-wgt-fixture-"));
  const wgt = path.join(fixture, "WeatherWidget.wgt");
  const workspace = path.join(fixture, "workspace");
  fs.writeFileSync(wgt, "widget");
  fs.mkdirSync(workspace);
  try {
    const success = await withRoot(() =>
      importWgt(wgt, "tizen", "10.0", workspace),
    );
    check("imports through the platform script", success.status, "success");
    check(
      "reports the SDK output convention project path",
      success.result?.project_path,
      path.join(workspace, "WeatherWidget"),
    );
    check(
      "preserves profile and version separately",
      success.result?.profile === "tizen" &&
        success.result?.platform_version === "10.0",
    );

    // The stub script created <workspace>/WeatherWidget above — a second
    // import must be refused up front (tz would fail with "already exists").
    const duplicate = await withRoot(() =>
      importWgt(wgt, "tizen", "10.0", workspace),
    );
    check(
      "refuses to import over an existing project folder",
      duplicate.errors?.[0]?.error_category,
      "project_creation_failed",
    );
    check(
      "existing-folder refusal points at the delete action",
      /project-delete/.test(duplicate.errors?.[0]?.message || ""),
    );

    // tz names the project after the file and allows only [a-zA-Z0-9].
    const dotted = path.join(fixture, "Weather.Widget.wgt");
    fs.writeFileSync(dotted, "widget");
    const badName = await withRoot(() =>
      importWgt(dotted, "tizen", "10.0", workspace),
    );
    check(
      "rejects a WGT file name tz cannot use as a project name",
      badName.errors?.[0]?.error_category,
      "invalid_parameters",
    );
    check(
      "file-name refusal suggests a sanitized name",
      /WeatherWidget\.wgt/.test(badName.errors?.[0]?.message || ""),
    );
    check(
      "file-name refusal happens before the script runs (no folder created)",
      fs.existsSync(path.join(workspace, "Weather.Widget")),
      false,
    );

    const zip = path.join(fixture, "not-widget.zip");
    fs.writeFileSync(zip, "archive");
    const badExtension = await importWgt(zip, "tizen", "10.0", workspace);
    check(
      "rejects a non-WGT archive",
      badExtension.errors?.[0]?.error_category,
      "invalid_parameters",
    );
    const badProfile = await importWgt(wgt, "mobile", "10.0", workspace);
    check(
      "rejects unsupported profile",
      badProfile.errors?.[0]?.error_category,
      "invalid_parameters",
    );
    const badVersion = await importWgt(wgt, "tizen", "10.0; whoami", workspace);
    check(
      "rejects unsafe platform version",
      badVersion.errors?.[0]?.error_category,
      "invalid_parameters",
    );
    const unsupportedVersion = await importWgt(
      wgt,
      "tizen",
      "10.0.1",
      workspace,
    );
    check(
      "rejects versions that cannot name an SDK profile",
      unsupportedVersion.errors?.[0]?.error_category,
      "invalid_parameters",
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  const cli = spawnSync(
    process.execPath,
    [CLI, "import-wgt", "--wgt-path", "x.wgt"],
    { encoding: "utf8" },
  );
  let envelope;
  try {
    envelope = JSON.parse(cli.stderr);
  } catch (_e) {
    envelope = null;
  }
  check(
    "CLI requires profile/version/destination arguments",
    cli.status === 1 && envelope?.errors?.[0]?.code === "invalid_parameters",
  );

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
