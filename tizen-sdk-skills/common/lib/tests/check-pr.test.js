// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * check-pr rule tests
 *
 * Covers the pure rule functions of scripts/check-pr.js. Sample secrets and
 * private addresses are assembled at runtime so this file does not trip the
 * checker itself.
 */

const {
  checkVersionSync,
  checkAddedLines,
  checkDocPairs,
  checkH1,
  checkName,
  checkChangelog,
  formatGithub,
  parseAddedLines,
  parseNameStatus,
} = require("../../../scripts/check-pr");

console.log("=== check-pr Test ===\n");

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

const rules = (findings) => findings.map((f) => `${f.severity} ${f.rule}`);
const at = (text) => [{ line: 1, text }];

// V-SYNC
check(
  "versions in sync",
  rules(checkVersionSync({ "package.json": "1.0.0", "plugin.json": "1.0.0" })),
  [],
);
check(
  "versions differ",
  rules(checkVersionSync({ "package.json": "1.0.1", "plugin.json": "1.0.0" })),
  ["ERROR V-SYNC"],
);
check(
  "missing file ignored",
  rules(
    checkVersionSync({ "package.json": "1.0.0", "plugin.json": undefined }),
  ),
  [],
);

// S-SECRET / S-PRIVATE
const key = "-----BEGIN " + "RSA PRIVATE KEY-----";
const ip = ["192", "168", "0", "10"].join(".");
check("private key", rules(checkAddedLines("a.js", at(key))), [
  "ERROR S-SECRET",
]);
check(
  "fixture key exempt",
  rules(checkAddedLines("tests/fixtures/certs/x.pem", at(key))),
  [],
);
check("private IP", rules(checkAddedLines("a.md", at(`sdb ${ip}`))), [
  "WARN S-PRIVATE",
]);
check("public IP", rules(checkAddedLines("a.md", at("8.8.8.8"))), []);
check("home path", rules(checkAddedLines("a.md", at("/" + "Users/jdoe/sdk"))), [
  "WARN S-PRIVATE",
]);
check(
  "windows home path",
  rules(checkAddedLines("a.js", at("C:\\\\" + "Users\\\\jdoe\\\\sdk"))),
  ["WARN S-PRIVATE"],
);
check(
  "placeholder home paths",
  rules(
    checkAddedLines(
      "a.md",
      at("/" + "Users/<user>/x /" + "home/$USER/x /" + "home/user/x"),
    ),
  ),
  [],
);

// D-PAIR
const exists = () => true;
check(
  "root doc without ko pair",
  rules(checkDocPairs(new Set(["README.md"]), exists)),
  ["WARN D-PAIR"],
);
check(
  "root doc with ko pair",
  rules(checkDocPairs(new Set(["README.md", "README.ko.md"]), exists)),
  [],
);
check(
  "docs/ pair is .en.md",
  checkDocPairs(new Set(["docs/a.md"]), exists)[0].message,
  "changed without its pair docs/a.en.md",
);
check(
  "unpaired doc",
  rules(checkDocPairs(new Set(["docs/a.md"]), () => false)),
  [],
);

// D-H1
check("one H1", rules(checkH1("a.md", "# Title\n\n## Part\n")), []);
check(
  "front matter then H1",
  rules(checkH1("a.md", "---\nx: 1\n---\n# Title\n")),
  [],
);
check("starts with H2", rules(checkH1("a.md", "## Part\n# Title\n")), [
  "WARN D-H1",
]);
check("two H1", rules(checkH1("a.md", "# A\n# B\n")), ["WARN D-H1"]);
check("H1 in code fence", rules(checkH1("a.md", "# A\n```\n# x\n```\n")), []);
check("agent prompt exempt", rules(checkH1("common/agents/a.md", "text")), []);

// F-NAME
check("kebab-case", rules(checkName("common/lib/my-file.test.js")), []);
check("upper convention", rules(checkName("docs/SKILLS_REFERENCE.md")), []);
check("camelCase", rules(checkName("common/lib/myFile.js")), ["WARN F-NAME"]);
check(
  "template exempt",
  rules(checkName("common/scripts/tizen-create-project/templates/X/A.cs")),
  [],
);

// C-LOG
check(
  "code without changelog",
  rules(checkChangelog(new Set(["common/lib/a.js"]))),
  ["WARN C-LOG"],
);
check(
  "code with changelog",
  rules(checkChangelog(new Set(["common/lib/a.js", "CHANGELOG.md"]))),
  [],
);
check("docs only", rules(checkChangelog(new Set(["README.md"]))), []);

// GitHub annotations
check(
  "warning with line",
  formatGithub(
    {
      severity: "WARN",
      rule: "S-PRIVATE",
      file: "a.md",
      line: 3,
      message: "m",
    },
    "plugin/",
  ),
  "::warning file=plugin/a.md,line=3,title=S-PRIVATE::m",
);
check(
  "error without line, escaped",
  formatGithub(
    {
      severity: "ERROR",
      rule: "V-SYNC",
      file: "a,b.json",
      line: 0,
      message: "50%\nx",
    },
    "",
  ),
  "::error file=a%2Cb.json,title=V-SYNC::50%25%0Ax",
);

// Parsers
check(
  "parseAddedLines",
  parseAddedLines(
    "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,0 +5,2 @@\n+one\n+two\n",
  ),
  {
    x: [
      { line: 5, text: "one" },
      { line: 6, text: "two" },
    ],
  },
);
check(
  "parseNameStatus",
  (() => {
    const r = parseNameStatus("A\tnew.js\nM\tmod.js\nR100\told.md\tnew.md\n");
    return { changed: [...r.changed], created: r.created };
  })(),
  {
    changed: ["new.js", "mod.js", "old.md", "new.md"],
    created: ["new.js", "new.md"],
  },
);

console.log(`\n${failures ? `${failures} FAILED` : "All tests passed"}`);
process.exit(failures ? 1 : 0);
