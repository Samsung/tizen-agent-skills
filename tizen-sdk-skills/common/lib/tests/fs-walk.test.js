// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * fs-walk.js tests
 *
 * Covers the behavior that replaces `glob(join(root, '**', '*'), { cwd: root,
 * nodir: true, ignore, dot: true })` in the extension's scanners:
 *   - recursive listing returns files only (no directory entries)
 *   - dotfiles/dot-directories are included by default (glob's `dot: true`)
 *   - ignore patterns prune matched directories rather than merely filtering
 *     their contents after the fact (load-bearing for perf on node_modules/.git)
 *   - ignore patterns also filter matched files directly
 *   - an empty ignore list matches nothing (walk is unfiltered)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { walkFiles, findFiles } = require("../core/rds/fs-walk");

console.log("=== fs-walk Test ===\n");

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

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-fs-walk-test-"));

function write(relPath, content = "") {
  const abs = path.join(SANDBOX, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

write("src/main.c", "int main() {}");
write("src/nested/util.c", "void util() {}");
write(".gitignore", "node_modules/");
write("node_modules/pkg/index.js", "module.exports = {};");
write(".git/HEAD", "ref: refs/heads/main");
write("Debug/tpk/bin/app", "binary");
write("empty-dir/.gitkeep", "");

// Test 1: unfiltered walk finds everything, including dotfiles, sorted
console.log("Test 1: unfiltered walk");
check("no ignore patterns", walkFiles(SANDBOX), [
  ".git/HEAD",
  ".gitignore",
  "Debug/tpk/bin/app",
  "empty-dir/.gitkeep",
  "node_modules/pkg/index.js",
  "src/main.c",
  "src/nested/util.c",
]);

// Test 2: ignore patterns prune whole subtrees
console.log("\nTest 2: ignore prunes directories");
check(
  "node_modules/ and .git/ pruned",
  walkFiles(SANDBOX, ["**/node_modules/**", "**/.git/**"]),
  [
    ".gitignore",
    "Debug/tpk/bin/app",
    "empty-dir/.gitkeep",
    "src/main.c",
    "src/nested/util.c",
  ],
);

// Test 3: file-level ignore pattern (not a directory prefix)
console.log("\nTest 3: ignore matches individual files");
check("single file excluded", walkFiles(SANDBOX, ["**/util.c"]), [
  ".git/HEAD",
  ".gitignore",
  "Debug/tpk/bin/app",
  "empty-dir/.gitkeep",
  "node_modules/pkg/index.js",
  "src/main.c",
]);

// Test 4: directory-with-no-files-after-pruning contributes nothing (no
// phantom directory entries — only files are ever returned)
console.log("\nTest 4: directories never appear in results");
const flat = walkFiles(SANDBOX);
check(
  "no directory-shaped entries",
  flat.some((p) => fs.statSync(path.join(SANDBOX, p)).isDirectory()),
  false,
);

// Test 5: a rootDir that doesn't exist returns an empty list rather than throwing
console.log("\nTest 5: missing root directory");
check("missing dir -> []", walkFiles(path.join(SANDBOX, "does-not-exist")), []);

// Test 6: findFiles — breadth-first lookup shared by findFilesByName /
// findFirstFileByExtension: shallowest match first, dot-dirs and
// node_modules/bin/obj pruned, `first` stops early.
console.log("\nTest 6: findFiles (BFS lookup)");
const LOOKUP = fs.mkdtempSync(path.join(os.tmpdir(), "fs-walk-lookup-"));
const mk = (rel, content = "") => {
  const abs = path.join(LOOKUP, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};
// A solution layout where the test project sorts BEFORE the app project.
mk("MyApp.Tests/MyApp.Tests.csproj");
mk("MyApp/MyApp.csproj");
mk("MyApp/tizen-manifest.xml");
mk("MyApp/bin/Debug/net6.0-tizen/tpkroot/tizen-manifest.xml"); // build copy
mk("MyApp/obj/project.assets.json");
mk("node_modules/dep/tizen-manifest.xml");
mk(".git/tizen-manifest.xml");
mk("tizen-manifest.xml"); // root-level, shallowest of all

const rel = (p) => path.relative(LOOKUP, p).split(path.sep).join("/");

check(
  "shallowest match comes first, build/dot/node_modules copies are pruned",
  findFiles(LOOKUP, (n) => n === "tizen-manifest.xml").map(rel),
  ["tizen-manifest.xml", "MyApp/tizen-manifest.xml"],
);
check(
  "first .csproj is the shallowest one, not the alphabetically first",
  // Both csproj files are at depth 1 — order within a depth is readdir order,
  // so make the point with an extra deeper decoy instead.
  (() => {
    mk("MyApp.Tests/Nested/Decoy.csproj");
    const [first] = findFiles(LOOKUP, (n) => n.endsWith(".csproj"), {
      first: true,
    });
    return path.dirname(rel(first)).includes("/");
  })(),
  false,
);
check(
  "first:true returns exactly one match",
  findFiles(LOOKUP, (n) => n.endsWith(".csproj"), { first: true }).length,
  1,
);
check(
  "no match -> []",
  findFiles(LOOKUP, (n) => n === "nope.txt"),
  [],
);
check(
  "missing root -> []",
  findFiles(path.join(LOOKUP, "missing"), () => true),
  [],
);
fs.rmSync(LOOKUP, { recursive: true, force: true });

fs.rmSync(SANDBOX, { recursive: true, force: true });

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
