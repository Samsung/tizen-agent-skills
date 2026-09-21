// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * forward-scan-composer.js tests.
 *
 * Ported 1:1 from the extension's
 * packages/server/tests/forward-scan-composer.test.ts — same cases, same
 * expected results, since composeChanges()/computeDelta() must agree with
 * the extension byte-for-byte (both resolve the same changelist.json).
 */

const {
  computeDelta,
  composeChanges,
} = require("../core/rds/forward-scan-composer");

console.log("=== forward-scan-composer Test ===\n");

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

/** Shorthand to create a FileChange */
function fc(path, type) {
  return { path, type };
}

/** Assert a result array contains an entry for the given path+type (order-independent) */
function checkContains(name, result, path, type) {
  const entry = result.find((e) => e.path === path);
  const ok = entry !== undefined && entry.type === type;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — no entry {path: ${path}, type: ${type}} in ${JSON.stringify(result)}`),
  );
}

// ─── composeChanges ──────────────────────────────────────────────────────────

console.log("composeChanges:");

check("returns an empty array for empty input", composeChanges([]), []);

{
  const result = composeChanges([fc("a.txt", "modify")]);
  check("passes through a single change unchanged (length)", result.length, 1);
  checkContains(
    "passes through a single change unchanged",
    result,
    "a.txt",
    "modify",
  );
}

{
  const result = composeChanges([
    fc("a.txt", "add"),
    fc("b.txt", "modify"),
    fc("c.txt", "delete"),
  ]);
  check("preserves multiple distinct files (length)", result.length, 3);
  checkContains("preserves a.txt add", result, "a.txt", "add");
  checkContains("preserves b.txt modify", result, "b.txt", "modify");
  checkContains("preserves c.txt delete", result, "c.txt", "delete");
}

{
  const result = composeChanges([fc("a.txt", "modify"), fc("a.txt", "modify")]);
  check("dedupes two modifies (length)", result.length, 1);
  checkContains(
    "dedupes two modifies into a single modify",
    result,
    "a.txt",
    "modify",
  );
}

{
  const result = composeChanges([fc("a.txt", "add"), fc("a.txt", "delete")]);
  check("add then delete -> no-op (omitted)", result.length, 0);
}

{
  const result = composeChanges([fc("a.txt", "delete"), fc("a.txt", "add")]);
  check("delete then add -> modify (length)", result.length, 1);
  checkContains("delete then add -> modify", result, "a.txt", "modify");
}

{
  const result = composeChanges([fc("a.txt", "add"), fc("a.txt", "modify")]);
  check("add then modify -> add (length)", result.length, 1);
  checkContains("add then modify -> add", result, "a.txt", "add");
}

{
  const result = composeChanges([fc("a.txt", "modify"), fc("a.txt", "delete")]);
  check("modify then delete -> delete (length)", result.length, 1);
  checkContains("modify then delete -> delete", result, "a.txt", "delete");
}

{
  const result = composeChanges([
    fc("a.txt", "add"),
    fc("a.txt", "delete"),
    fc("a.txt", "add"),
  ]);
  check("add then delete then add -> add (length)", result.length, 1);
  checkContains("add then delete then add -> add", result, "a.txt", "add");
}

{
  const result = composeChanges([
    fc("a.txt", "add"),
    fc("b.txt", "modify"),
    fc("a.txt", "modify"), // add + modify = add
    fc("c.txt", "delete"),
    fc("b.txt", "delete"), // modify + delete = delete
    fc("d.txt", "add"),
  ]);
  check(
    "composes mixed overlapping and distinct files (length)",
    result.length,
    4,
  );
  checkContains("mixed: a.txt add", result, "a.txt", "add");
  checkContains("mixed: b.txt delete", result, "b.txt", "delete");
  checkContains("mixed: c.txt delete", result, "c.txt", "delete");
  checkContains("mixed: d.txt add", result, "d.txt", "add");
}

// ─── computeDelta ────────────────────────────────────────────────────────────

console.log("\ncomputeDelta:");

check(
  "returns empty for a changelist with no deploy groups",
  computeDelta({ projectDir: "/proj", deploys: {} }, 0),
  [],
);

{
  const changelist = {
    projectDir: "/proj",
    deploys: { 1: [fc("a.txt", "add"), fc("b.txt", "modify")] },
  };
  const result = computeDelta(changelist, 0);
  check(
    "returns entries from a single deploy group (length)",
    result.length,
    2,
  );
  checkContains("single group: a.txt add", result, "a.txt", "add");
  checkContains("single group: b.txt modify", result, "b.txt", "modify");
}

{
  const changelist = {
    projectDir: "/proj",
    deploys: {
      1: [fc("a.txt", "add")],
      2: [fc("a.txt", "modify")], // add + modify = add
      3: [fc("a.txt", "delete")], // add + delete = no-op
    },
  };
  const result = computeDelta(changelist, 0);
  check(
    "composes overlapping changes across deploy groups -> no-op",
    result.length,
    0,
  );
}

{
  const changelist = {
    projectDir: "/proj",
    deploys: {
      1: [fc("a.txt", "add")],
      2: [fc("b.txt", "add")],
      3: [fc("c.txt", "add")],
    },
  };
  // lastDeployId = 1 -> only groups 2 and 3 are included
  const result = computeDelta(changelist, 1);
  check(
    "only includes groups with ID > lastDeployId (length)",
    result.length,
    2,
  );
  checkContains("excludes group 1, includes b.txt", result, "b.txt", "add");
  checkContains("excludes group 1, includes c.txt", result, "c.txt", "add");
}

{
  const changelist = {
    projectDir: "/proj",
    deploys: { 1: [fc("a.txt", "add")], next: [fc("b.txt", "modify")] },
  };
  const result = computeDelta(changelist, 0);
  check('includes the "next" group (length)', result.length, 2);
  checkContains("next group: a.txt add", result, "a.txt", "add");
  checkContains("next group: b.txt modify", result, "b.txt", "modify");
}

{
  const changelist = {
    projectDir: "/proj",
    deploys: { 1: [fc("a.txt", "add")], next: [fc("a.txt", "delete")] }, // add + delete = no-op
  };
  const result = computeDelta(changelist, 0);
  check('composes "next" group with numeric groups -> no-op', result.length, 0);
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
