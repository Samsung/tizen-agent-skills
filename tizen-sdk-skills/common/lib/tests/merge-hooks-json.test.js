// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * merge-hooks-json tests
 *
 * Covers the settings.json merge the setup scripts use to actually REGISTER
 * the hooks (they used to only print a snippet — the defect this tool fixes):
 *   - missing file -> created with just the entries
 *   - existing entries of ours -> replaced, never duplicated
 *   - foreign entries -> kept untouched, order preserved (ours appended last)
 *   - unparsable / wrong-shaped file -> throws, file left untouched
 *   - pristine backup -> written once, not overwritten on re-merge
 *   - indentation / line endings -> reused from the existing file
 *   - CLI entry point: usage error -> exit 1; happy path -> exit 0
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  isOurEntry,
  isOurCommand,
  describeShapeError,
  detectIndent,
  detectEol,
  mergeHooksFile,
} = require("../tools/merge-hooks-json");

console.log("=== merge-hooks-json Test ===\n");

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

const ENTRIES = [
  {
    matcher: "Bash|PowerShell",
    hooks: [
      {
        type: "command",
        command:
          'bash "/home/me/.claude/hooks/tizen-sdk-skills/check-tizen-commands.sh"',
      },
    ],
  },
  {
    matcher: "Skill",
    hooks: [
      {
        type: "command",
        command:
          'bash "/home/me/.claude/hooks/tizen-sdk-skills/check-skill-routing.sh"',
      },
    ],
  },
];

// Test 1: entry recognition
console.log("Test 1: isOurEntry / isOurCommand");
check(
  "  our command (hooks/tizen-sdk-skills/)",
  isOurCommand('bash "/x/hooks/tizen-sdk-skills/check-tizen-commands.sh"'),
  true,
);
check(
  "  legacy command (hooks/tizen-sdk-agents/)",
  isOurCommand('bash "/x/hooks/tizen-sdk-agents/check-tizen-commands.sh"'),
  true,
);
check(
  "  old manual-merge path (common/hooks/)",
  isOurCommand('bash "/repo/common/hooks/check-tizen-commands.sh"'),
  true,
);
check(
  "  foreign command",
  isOurCommand('bash "/x/hooks/my-own-hook.sh"'),
  false,
);
check(
  "  foreign script under a common/hooks/ dir is NOT ours",
  isOurCommand('bash "/home/me/common/hooks/check-lint.sh"'),
  false,
);
check("  non-string command", isOurCommand(42), false);
check("  our entry", isOurEntry(ENTRIES[0]), true);
check(
  "  entry with legacy _source tag",
  isOurEntry({ _source: "tizen-sdk-agents", matcher: "Bash", hooks: [] }),
  true,
);
check(
  "  foreign entry",
  isOurEntry({
    matcher: "Bash",
    hooks: [{ type: "command", command: "echo hi" }],
  }),
  false,
);
check(
  "  mixed entry (our guard + user's own command) is NOT ours",
  isOurEntry({
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command: 'bash "/x/hooks/tizen-sdk-skills/check-tizen-commands.sh"',
      },
      { type: "command", command: "echo mine" },
    ],
  }),
  false,
);

// Test 2: shape errors
console.log("\nTest 2: describeShapeError");
check(
  "  mergeable object",
  describeShapeError({ hooks: { PreToolUse: [] } }, "PreToolUse"),
  undefined,
);
check("  no hooks key", describeShapeError({}, "PreToolUse"), undefined);
check(
  "  null hooks",
  describeShapeError({ hooks: null }, "PreToolUse"),
  undefined,
);
check(
  "  hooks is an array",
  describeShapeError({ hooks: [] }, "PreToolUse"),
  '"hooks" is an array, expected an object',
);
check(
  "  PreToolUse is an object",
  describeShapeError({ hooks: { PreToolUse: {} } }, "PreToolUse"),
  '"hooks.PreToolUse" is an object, expected an array',
);
check(
  "  top level is an array",
  describeShapeError([], "PreToolUse"),
  "the top level is an array, expected an object",
);

// Test 3: detectIndent
console.log("\nTest 3: detectIndent");
check("  two spaces", detectIndent('{\n  "a": 1\n}'), "  ");
check("  four spaces", detectIndent('{\n    "a": 1\n}'), "    ");
check("  tab", detectIndent('{\n\t"a": 1\n}'), "\t");
check("  minified falls back", detectIndent('{"a":1}'), "  ");
check(
  "  implausible indent falls back",
  detectIndent('{\n          "a": 1\n}'),
  "  ",
);

console.log("\nTest 3b: detectEol");
check("  LF", detectEol('{\n  "a": 1\n}'), "\n");
check("  CRLF", detectEol('{\r\n  "a": 1\r\n}'), "\r\n");
check("  single line falls back to LF", detectEol('{"a":1}'), "\n");

// Test 4: mergeHooksFile against a temp dir
console.log("\nTest 4: mergeHooksFile");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "merge-hooks-test-"));
const settings = path.join(tmp, "settings.json");
try {
  // 4a. missing file -> created
  let r = mergeHooksFile(settings, "PreToolUse", ENTRIES);
  check("  missing file: created", r.created, true);
  check(
    "  missing file: 2 entries",
    JSON.parse(fs.readFileSync(settings, "utf-8")).hooks.PreToolUse.length,
    2,
  );
  check(
    "  missing file: no backup",
    fs.existsSync(settings + ".tizen-backup"),
    false,
  );

  // 4b. re-merge -> replaced, not duplicated
  r = mergeHooksFile(settings, "PreToolUse", ENTRIES);
  check("  re-merge: replaced 2", r.replaced, 2);
  check(
    "  re-merge: still 2 entries",
    JSON.parse(fs.readFileSync(settings, "utf-8")).hooks.PreToolUse.length,
    2,
  );
  check(
    "  re-merge: backup now exists",
    fs.existsSync(settings + ".tizen-backup"),
    true,
  );

  // 4c. foreign entries kept, ours appended last
  const withForeign = {
    permissions: { allow: ["Bash"] },
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "echo user-hook" }],
        },
        ENTRIES[0],
      ],
    },
  };
  fs.writeFileSync(settings, JSON.stringify(withForeign, null, 4) + "\n");
  r = mergeHooksFile(settings, "PreToolUse", ENTRIES);
  const merged = JSON.parse(fs.readFileSync(settings, "utf-8"));
  check("  foreign kept: replaced 1 of ours", r.replaced, 1);
  check("  foreign kept: 3 entries total", merged.hooks.PreToolUse.length, 3);
  check(
    "  foreign kept: user entry first",
    merged.hooks.PreToolUse[0].hooks[0].command,
    "echo user-hook",
  );
  check("  foreign kept: permissions untouched", merged.permissions.allow, [
    "Bash",
  ]);
  check(
    "  indent reused (4 spaces)",
    detectIndent(fs.readFileSync(settings, "utf-8")),
    "    ",
  );

  // 4d. unparsable file -> throws, file untouched
  const badJson = "{ not json";
  fs.writeFileSync(settings, badJson);
  let threw = false;
  try {
    mergeHooksFile(settings, "PreToolUse", ENTRIES);
  } catch {
    threw = true;
  }
  check("  unparsable: throws", threw, true);
  check(
    "  unparsable: file untouched",
    fs.readFileSync(settings, "utf-8"),
    badJson,
  );

  // 4e. wrong-shaped hooks section -> throws, file untouched
  const badShape = JSON.stringify({ hooks: { PreToolUse: "nope" } });
  fs.writeFileSync(settings, badShape);
  threw = false;
  try {
    mergeHooksFile(settings, "PreToolUse", ENTRIES);
  } catch {
    threw = true;
  }
  check("  wrong shape: throws", threw, true);
  check(
    "  wrong shape: file untouched",
    fs.readFileSync(settings, "utf-8"),
    badShape,
  );

  // 4f. empty file -> treated as new
  fs.writeFileSync(settings, "");
  r = mergeHooksFile(settings, "PreToolUse", ENTRIES);
  check("  empty file: created", r.created, true);

  // 4g. bad entries argument -> throws
  threw = false;
  try {
    mergeHooksFile(path.join(tmp, "other.json"), "PreToolUse", []);
  } catch {
    threw = true;
  }
  check("  empty entries: throws", threw, true);

  // 4h. CRLF file -> stays CRLF (no whole-file line-ending diff)
  const crlfFile = path.join(tmp, "crlf.json");
  fs.writeFileSync(crlfFile, '{\r\n  "permissions": {}\r\n}\r\n');
  mergeHooksFile(crlfFile, "PreToolUse", ENTRIES);
  const crlfOut = fs.readFileSync(crlfFile, "utf-8");
  check("  crlf: no bare LF left", /[^\r]\n/.test(crlfOut), false);
  check("  crlf: ends with CRLF", crlfOut.endsWith("\r\n"), true);
  check(
    "  crlf: still parses with 2 entries",
    JSON.parse(crlfOut).hooks.PreToolUse.length,
    2,
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Test 5: CLI entry point
console.log("\nTest 5: CLI");
const tool = path.join(__dirname, "..", "tools", "merge-hooks-json.js");
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "merge-hooks-cli-"));
try {
  const file = path.join(tmp2, "settings.json");
  const entries = JSON.stringify([
    {
      matcher: "Bash",
      hooks: [
        { type: "command", command: 'bash "/x/hooks/tizen-sdk-skills/a.sh"' },
      ],
    },
  ]);

  let r = spawnSync(process.execPath, [tool], { encoding: "utf-8" });
  check("  no args -> exit 1", r.status, 1);
  check(
    "  usage on stderr",
    r.stderr.includes("usage: merge-hooks-json.js"),
    true,
  );

  r = spawnSync(
    process.execPath,
    [tool, "--file", file, "--event", "PreToolUse", "--entries", entries],
    { encoding: "utf-8" },
  );
  check("  happy path -> exit 0", r.status, 0);
  check(
    "  happy path: file written",
    JSON.parse(fs.readFileSync(file, "utf-8")).hooks.PreToolUse.length,
    1,
  );

  // stdin variant
  const file2 = path.join(tmp2, "settings2.json");
  r = spawnSync(
    process.execPath,
    [tool, "--file", file2, "--event", "BeforeTool", "--entries-file", "-"],
    { input: entries, encoding: "utf-8" },
  );
  check("  stdin entries -> exit 0", r.status, 0);
  check(
    "  stdin entries: BeforeTool written",
    JSON.parse(fs.readFileSync(file2, "utf-8")).hooks.BeforeTool.length,
    1,
  );

  // unparsable target -> exit 1
  fs.writeFileSync(file2, "broken{");
  r = spawnSync(
    process.execPath,
    [tool, "--file", file2, "--event", "BeforeTool", "--entries", entries],
    { encoding: "utf-8" },
  );
  check("  unparsable target -> exit 1", r.status, 1);
  check(
    "  unparsable target: file untouched",
    fs.readFileSync(file2, "utf-8"),
    "broken{",
  );
} finally {
  fs.rmSync(tmp2, { recursive: true, force: true });
}

console.log(
  `\n${failures === 0 ? "All tests passed" : `${failures} check(s) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
