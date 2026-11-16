// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * frontmatter-yaml tests
 *
 * Every common/skills/<n>/SKILL.md and common/agents/*.md frontmatter must be
 * STRICT YAML. Claude Code reads frontmatter leniently, but other hosts do
 * not: Cline drops a skill whose frontmatter fails to parse without printing
 * any error (the skill just never appears), and Gemini CLI refuses to load
 * such an agent. Skills are copied verbatim to every host, so the source has
 * to be valid as written.
 *
 * No YAML parser ships in this repo, so this checks the rules that bite in
 * practice for the `key: value` / `- item` lines these files use:
 *   - a plain (unquoted) scalar must not contain ": " or " #", must not end
 *     with ":", and must not start with a YAML indicator character;
 *   - a single-quoted scalar is '…' with every inner quote doubled;
 *   - a double-quoted scalar is "…" with JSON-compatible escapes only;
 *   - block scalars (| > |- >- …) are skipped with their indented body in
 *     skills; an agent is also parsed by agent-convert.js (one line per key,
 *     no block scalars or nesting), so the Gemini / Codex conversion of every
 *     shipped agent is known to succeed.
 * Wrap a value that needs ": " in single quotes ('…', ' → '').
 */

const fs = require("fs");
const path = require("path");
const {
  SINGLE_QUOTED,
  DOUBLE_QUOTED,
  unquoteValue,
  parseFrontmatter,
} = require("../tools/agent-convert");

console.log("=== frontmatter-yaml Test ===\n");

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

const BLOCK_SCALAR = /^[|>][+-]?\d*$/;
// Characters that cannot start a plain scalar (YAML 1.2 c-indicator), plus
// "- ", "? ", ": " which start a sequence entry / complex key / mapping value.
const BAD_START = /^(?:[[\]{},&*!|>%@`#]|[-?:](?:\s|$))/;

/** Problem with one scalar value, or null when it is valid strict YAML. */
function scalarProblem(v, key = "item") {
  if (v === "" || BLOCK_SCALAR.test(v)) return null;
  // Flow sequence of plain items, e.g. `required_tools: [bash, read]`.
  const flow = v.match(/^\[([^[\]{}]*)\]$/);
  if (flow) {
    for (const item of flow[1].split(",")) {
      const p = scalarProblem(item.trim(), key);
      if (p) return `flow sequence item: ${p}`;
    }
    return null;
  }
  if (v.startsWith("'")) {
    return SINGLE_QUOTED.test(v) ? null : "unbalanced single-quoted value";
  }
  if (v.startsWith('"')) {
    if (!DOUBLE_QUOTED.test(v)) return "unbalanced double-quoted value";
    try {
      unquoteValue(key, v);
      return null;
    } catch (e) {
      return e.message;
    }
  }
  if (BAD_START.test(v)) return "plain value starts with a YAML indicator";
  if (v.includes(": ") || v.endsWith(":"))
    return 'plain value contains ": " (read as a mapping)';
  if (v.includes(" #")) return 'plain value contains " #" (read as a comment)';
  return null;
}

/** Problems in one file's frontmatter: Array<"line N: reason">. */
function frontmatterProblems(text, { agent = false } = {}) {
  if (agent) {
    try {
      parseFrontmatter(text);
    } catch (e) {
      return [`agent-convert: ${e.message}`];
    }
  }
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!m) return ["no frontmatter block"];
  const problems = [];
  const lines = m[1].split("\n");
  let blockIndent = -1; // inside a block scalar: skip lines indented deeper
  lines.forEach((line, i) => {
    const indent = line.match(/^ */)[0].length;
    if (blockIndent >= 0) {
      if (!line.trim() || indent > blockIndent) return;
      blockIndent = -1;
    }
    if (!line.trim() || /^\s*#/.test(line)) return;
    // `key: value`, `- key: value`, or a bare `- item`
    const kv = line.match(/^(\s*)(?:- )?([A-Za-z0-9_-]+):(?:\s+(.*))?$/);
    const item = kv ? null : line.match(/^\s*- (.*)$/);
    if (!kv && !item) {
      problems.push(`line ${i + 2}: not a "key: value" or "- item" line`);
      return;
    }
    const value = (kv ? kv[3] || "" : item[1]).trim();
    if (BLOCK_SCALAR.test(value)) blockIndent = indent;
    const p = scalarProblem(value, kv ? kv[2] : "item");
    if (p) problems.push(`line ${i + 2}: ${p}`);
  });
  return problems;
}

// Test 1: the checker itself
console.log("Test 1: scalar rules");
const fm = (v) => `---\nname: x\ndescription: ${v}\n---\nbody\n`;
for (const [label, v, ok] of [
  ["plain text", "Build a Tizen app, 빌드해줘", true],
  ['": " inside plain value', '("목록": `list-vm`)', false],
  ["# without a leading space", "issue#12, C#", true],
  ['" #" starts a comment', "see #12", false],
  ["flow sequence", "[bash, read]", true],
  ['flow sequence item with ": "', "[a: b, c]", false],
  ["trailing colon", "Usage:", false],
  ["indicator start", "`list-vm` lists VMs", false],
  ['single-quoted with ": "', "'(\"목록\": `list-vm`) — it''s ok'", true],
  ["single-quoted unbalanced", "'it's'", false],
  ["double-quoted JSON escapes", '"say \\"hi\\": now"', true],
  ["double-quoted bad escape", '"C:\\Tizen"', false],
  ["block scalar", ">-", true],
  ["double-quoted raw tab", '"a\tb"', true],
  ['"a" or "b" (not one scalar)', '"a" or "b"', false],
  ["quoted value + comment", "'ok' # note", true],
]) {
  check(`  ${label}`, frontmatterProblems(fm(v)).length === 0, ok);
}
check(
  "  agent: block scalar rejected (agent-convert reads one line per key)",
  frontmatterProblems("---\nname: x\ndescription: >-\n  long text\n---\n", {
    agent: true,
  }).length > 0,
  true,
);
check(
  "  block scalar body is not checked",
  frontmatterProblems("---\ndescription: |\n  a: b\n  c # d\nname: x\n---\n"),
  [],
);
check(
  "  nested list items checked",
  frontmatterProblems(
    "---\nname: x\nmetadata:\n  keywords:\n    - ok\n    - a: b\n    - c: d: e\n---\n",
  ),
  ['line 7: plain value contains ": " (read as a mapping)'],
);

// Test 2: every shipped skill and agent
console.log("\nTest 2: shipped skills and agents");
const commonDir = path.join(__dirname, "..", "..");
const files = [
  ...fs
    .readdirSync(path.join(commonDir, "skills"))
    .map((d) => path.join("skills", d, "SKILL.md"))
    .filter((f) => fs.existsSync(path.join(commonDir, f))),
  ...fs
    .readdirSync(path.join(commonDir, "agents"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join("agents", f)),
];
check("  found skills and agents", files.length > 20, true);
const bad = [];
for (const f of files) {
  for (const p of frontmatterProblems(
    fs.readFileSync(path.join(commonDir, f), "utf-8"),
    { agent: f.startsWith("agents") },
  )) {
    bad.push(`${f.split(path.sep).join("/")} ${p}`);
  }
}
check("  every frontmatter is strict YAML", bad, []);

console.log(
  `\n${failures === 0 ? "All tests passed" : `${failures} check(s) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
