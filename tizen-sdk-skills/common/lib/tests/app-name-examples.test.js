// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * App-name rule: the documented examples must agree with validatePackageId().
 *
 * createProject() rejects an app name whose ASCII letters/digits number fewer
 * than 10 (Tizen derives the 10-character package ID from them). The
 * tizen-create-project agent/skill instructions state that rule and list the
 * example names the agent may offer (✅) and the ones it must not (❌), each with
 * its letter/digit count. This test pins those lists — and the `--name` option
 * description in tizen-cli — to the real validator, so a future edit cannot
 * re-introduce an example the runner rejects.
 *
 * Pure unit test — reads the instruction files, spawns nothing.
 */

const fs = require("node:fs");
const path = require("node:path");
const { validatePackageId } = require("../core/project");

console.log("=== app-name examples vs validatePackageId() ===\n");

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

const REPO = path.resolve(__dirname, "..", "..", "..");
const alnumCount = (s) => s.replace(/[^A-Za-z0-9]/g, "").length;

// --- the validator itself: exactly what the instructions claim -------------------

check(
  "exactly 10 ASCII letters/digits passes",
  validatePackageId("MyTizenApp"),
  {
    valid: true,
    packageId: "mytizenapp",
    message: null,
  },
);
check(
  "9 letters/digits is rejected",
  validatePackageId("MyTizenAp").valid,
  false,
);
check(
  "package ID is the lowercased first 10 letters/digits",
  validatePackageId("MyTizenWebApp").packageId,
  "mytizenweb",
);
check(
  "'-', '_' and spaces are not counted",
  validatePackageId("my-app_01 x").valid,
  false,
);
check(
  "non-ASCII letters (한글) are not counted",
  validatePackageId("타이젠앱MyApp").valid,
  false,
);
check(
  "letters/digits count even when separated by other characters",
  validatePackageId("my-tizen-web-app").valid,
  true,
);

// --- the ✅ / ❌ example lines in the three instruction files ----------------------

const INSTRUCTION_FILES = [
  "common/agents/tizen-create-project.md",
  "common/skills/tizen-create-project/SKILL.md",
  "tizen-cli/skills/tizen-create-project/SKILL.md",
];

// `Name` (N) — a backticked example followed by its letter/digit count.
const EXAMPLE_RE = /`([^`]+)`\s*\((\d+)\)/g;
const hasExample = (line) => /`[^`]+`\s*\(\d+\)/.test(line);

for (const rel of INSTRUCTION_FILES) {
  const lines = fs.readFileSync(path.join(REPO, rel), "utf-8").split(/\r?\n/);
  // The files use ✅/❌ bullets elsewhere too (path rules, do/don't lists), so
  // the example bullets are the ones that carry `Name` (N) entries. The ✅
  // bullet may wrap onto indented continuation lines: everything from it up to
  // the ❌ bullet is "passing", the ❌ bullet itself is "rejected".
  const passIdx = lines.findIndex((l) => /^\s*- ✅/.test(l) && hasExample(l));
  const failIdx = lines.findIndex(
    (l, i) => i > passIdx && /^\s*- ❌/.test(l) && hasExample(l),
  );
  check(`${rel}: has a ✅ examples bullet`, passIdx >= 0, true);
  check(`${rel}: has a ❌ examples bullet after it`, failIdx > passIdx, true);
  if (passIdx < 0 || failIdx <= passIdx) continue;

  const passing = [
    ...lines.slice(passIdx, failIdx).join("\n").matchAll(EXAMPLE_RE),
  ];
  const rejected = [...lines[failIdx].matchAll(EXAMPLE_RE)];
  check(`${rel}: lists at least 3 passing examples`, passing.length >= 3, true);
  check(
    `${rel}: lists at least 3 rejected examples`,
    rejected.length >= 3,
    true,
  );

  for (const [, name, claimed] of passing) {
    check(
      `${rel}: ✅ ${name} passes validatePackageId`,
      validatePackageId(name).valid,
      true,
    );
    check(
      `${rel}: ✅ ${name} count (${claimed}) is right`,
      alnumCount(name),
      Number(claimed),
    );
  }
  for (const [, name, claimed] of rejected) {
    check(
      `${rel}: ❌ ${name} is rejected by validatePackageId`,
      validatePackageId(name).valid,
      false,
    );
    check(
      `${rel}: ❌ ${name} count (${claimed}) is right`,
      alnumCount(name),
      Number(claimed),
    );
  }
}

// --- the `--name` description in tizen-cli and the createProject() hint ----------

const spec = fs.readFileSync(
  path.join(REPO, "tizen-cli/src/command-specs/project.ts"),
  "utf-8",
);
const nameOpt = spec.match(
  /flags:\s*"--name <appName>",\s*description:\s*"([^"]*)"/,
);
check("project.ts: --name option has a description", Boolean(nameOpt), true);
if (nameOpt) {
  check(
    "project.ts: --name description states the 10 ASCII letters/digits rule",
    /at least 10 ASCII letters\/digits/.test(nameOpt[1]),
    true,
  );
  const example = nameOpt[1].match(/e\.g\.\s*([A-Za-z0-9]+)/);
  check(
    "project.ts: --name description carries an example name",
    Boolean(example),
    true,
  );
  if (example) {
    check(
      `project.ts: example ${example[1]} passes validatePackageId`,
      validatePackageId(example[1]).valid,
      true,
    );
  }
}

const projectJs = fs.readFileSync(
  path.join(REPO, "common/lib/core/project.js"),
  "utf-8",
);
const hint = projectJs.match(
  /createProject\("dotnet", "TizenNUITemplate", "\/path\/to", "([^"]+)"\)/,
);
check(
  "project.js: missing-parameter hint carries an example name",
  Boolean(hint),
  true,
);
if (hint) {
  check(
    `project.js: hint example ${hint[1]} passes validatePackageId`,
    validatePackageId(hint[1]).valid,
    true,
  );
}

console.log(
  failures
    ? `\n${failures} app-name example check(s) FAILED`
    : "\nAll app-name example checks passed",
);
process.exit(failures ? 1 : 0);
