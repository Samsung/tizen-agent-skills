// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * tpk-contents-parser.js tests.
 *
 * Ported from packages/server/src/features/rds/tpk-contents-parser.ts —
 * covers the " || " split, ".tpk/" prefix stripping, "../" resolution
 * relative to the build dir, and the malformed-input error paths.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseTpkContentsContent,
  parseTpkContents,
  findTpkContentsPath,
} = require("../core/rds/tpk-contents-parser");

console.log("=== tpk-contents-parser Test ===\n");

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

// ─── parseTpkContentsContent (pure) ──────────────────────────────────────────

console.log("parseTpkContentsContent:");

{
  const result = parseTpkContentsContent(
    '["tpk/bin/myapp || .tpk/bin/myapp"]',
    "Debug",
  );
  check("basic entry: entries", result.entries, [
    { sourcePath: "Debug/tpk/bin/myapp", destPath: "bin/myapp" },
  ]);
  check("basic entry: localPaths", result.localPaths, ["Debug/tpk/bin/myapp"]);
  check("basic entry: no errors", result.errors, []);
}

{
  const result = parseTpkContentsContent(
    '["../shared/res/icon.png || .tpk/shared/res/icon.png"]',
    "Debug",
  );
  check("../ resolves relative to buildDir", result.localPaths, [
    "shared/res/icon.png",
  ]);
  check(
    "../ dest path stripped of .tpk/",
    result.entries[0].destPath,
    "shared/res/icon.png",
  );
}

{
  const result = parseTpkContentsContent(
    JSON.stringify([
      "tpk/bin/myapp || .tpk/bin/myapp",
      "../shared/res/icon.png || .tpk/shared/res/icon.png",
      "tpk/lib/libfoo.so || .tpk/lib/libfoo.so",
    ]),
    "Debug",
  );
  check("multiple entries: count", result.entries.length, 3);
  check("multiple entries: no errors", result.errors, []);
  check("multiple entries: localPaths", result.localPaths, [
    "Debug/tpk/bin/myapp",
    "shared/res/icon.png",
    "Debug/tpk/lib/libfoo.so",
  ]);
}

{
  const result = parseTpkContentsContent(
    '["some/path || not-tpk-prefixed"]',
    "Debug",
  );
  check(
    "dest without .tpk/ prefix is left as-is",
    result.entries[0].destPath,
    "not-tpk-prefixed",
  );
}

{
  const result = parseTpkContentsContent(
    '["  tpk/bin/myapp   ||   .tpk/bin/myapp  "]',
    "Debug",
  );
  check("whitespace around separator is trimmed", result.entries[0], {
    sourcePath: "Debug/tpk/bin/myapp",
    destPath: "bin/myapp",
  });
}

check("empty array -> empty result", parseTpkContentsContent("[]", "Debug"), {
  entries: [],
  localPaths: [],
  errors: [],
});

{
  const result = parseTpkContentsContent("not json", "Debug");
  check("invalid JSON -> parse error", result.errors, [
    "failed to parse tpk_contents JSON",
  ]);
  check("invalid JSON -> empty entries", result.entries, []);
}

{
  const result = parseTpkContentsContent('{"not": "an array"}', "Debug");
  check("non-array JSON -> error", result.errors, [
    "tpk_contents is not a JSON array",
  ]);
}

{
  const result = parseTpkContentsContent(
    '["valid || .tpk/valid", 42, "also/valid || .tpk/also"]',
    "Debug",
  );
  check("non-string entry is skipped with error", result.errors, [
    "non-string entry: 42",
  ]);
  check("valid entries around it are still parsed", result.entries.length, 2);
}

{
  const result = parseTpkContentsContent(
    '["missing-separator-entry"]',
    "Debug",
  );
  check("missing separator -> error", result.errors, [
    'no separator in: "missing-separator-entry"',
  ]);
  check("missing separator -> no entries", result.entries, []);
}

{
  const result = parseTpkContentsContent(
    '["good || .tpk/good", "bad-entry", "also-good || .tpk/also-good"]',
    "Debug",
  );
  check(
    "malformed entries don't block valid ones (entries)",
    result.entries.length,
    2,
  );
  check(
    "malformed entries don't block valid ones (errors)",
    result.errors.length,
    1,
  );
}

check(
  "defaults buildDirName to Debug",
  parseTpkContentsContent('["tpk/bin/myapp || .tpk/bin/myapp"]').localPaths,
  ["Debug/tpk/bin/myapp"],
);

// ─── findTpkContentsPath ──────────────────────────────────────────────────────

console.log("\nfindTpkContentsPath:");

const SANDBOX = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-tpk-parser-test-"),
);

check(
  "returns null when tpk_contents doesn't exist",
  findTpkContentsPath(path.join(SANDBOX, "Debug")),
  null,
);

fs.mkdirSync(path.join(SANDBOX, "Debug"), { recursive: true });
fs.writeFileSync(
  path.join(SANDBOX, "Debug", "tpk_contents"),
  '["tpk/bin/myapp || .tpk/bin/myapp"]',
);
check(
  "returns the path when tpk_contents exists",
  findTpkContentsPath(path.join(SANDBOX, "Debug")),
  path.join(SANDBOX, "Debug", "tpk_contents"),
);

// ─── parseTpkContents (file-based, async) ─────────────────────────────────────

(async () => {
  console.log("\nparseTpkContents (async):");

  const result = await parseTpkContents(
    path.join(SANDBOX, "Debug", "tpk_contents"),
    "Debug",
  );
  check("reads and parses a real file", result, {
    entries: [{ sourcePath: "Debug/tpk/bin/myapp", destPath: "bin/myapp" }],
    localPaths: ["Debug/tpk/bin/myapp"],
    errors: [],
  });

  const missing = await parseTpkContents(
    path.join(SANDBOX, "Debug", "does-not-exist"),
    "Debug",
  );
  check("missing file -> empty result, no errors", missing, {
    entries: [],
    localPaths: [],
    errors: [],
  });

  fs.writeFileSync(path.join(SANDBOX, "Debug", "garbled"), "not valid json");
  const garbled = await parseTpkContents(
    path.join(SANDBOX, "Debug", "garbled"),
    "Debug",
  );
  check("existing but garbled file -> parse error surfaces", garbled.errors, [
    "failed to parse tpk_contents JSON",
  ]);

  fs.rmSync(SANDBOX, { recursive: true, force: true });

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
