// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * agent-convert tests
 *
 * Runs the converter over the REAL common/agents/*.md set into a temp dir and
 * checks the two output formats structurally (no TOML/YAML parser is available
 * in this repo, so the checks are shape-based):
 *   - codex-toml: one .toml per agent; name/description/developer_instructions
 *     present; literal-string fences balanced; body preserved verbatim
 *   - gemini-md: frontmatter keeps name/description, maps tools, renames
 *     maxTurns → max_turns, drops model; body preserved verbatim
 *   - CLI entry point: usage error → exit 1
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  GEMINI_TOOL_MAP,
  parseFrontmatter,
  toCodexToml,
  toGeminiMd,
  convertPath,
} = require("../tools/agent-convert");

console.log("=== agent-convert Test ===\n");

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

const agentsDir = path.join(__dirname, "..", "..", "agents");
const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

// Test 1: unit — a synthetic agent covering every frontmatter key
console.log("Test 1: single-file conversion");
const sample = [
  "---",
  "name: tizen-sample",
  'description: Sample agent: does "things" with C:\\paths, 한글 included',
  "tools: Bash, Read, Glob, Grep, Monitor",
  "model: sonnet",
  "maxTurns: 20",
  "---",
  "",
  "## Body",
  "",
  'Run `node "C:\\Users\\me\\x.js"` and keep \\backslashes\\ intact.',
  "",
].join("\n");

const warnings = [];
const toml = toCodexToml(sample, "sample.md");
check("  toml: name line", toml.includes('name = "tizen-sample"'), true);
check(
  "  toml: description escaped as basic string",
  toml.includes(
    'description = "Sample agent: does \\"things\\" with C:\\\\paths, 한글 included"',
  ),
  true,
);
check(
  "  toml: body in literal ''' block, backslashes untouched",
  toml.includes(
    "developer_instructions = '''\n\n## Body\n\nRun `node \"C:\\Users\\me\\x.js\"` and keep \\backslashes\\ intact.\n'''",
  ),
  true,
);
check(
  "  toml: tools/model/maxTurns dropped",
  /tools|model|maxTurns/.test(toml.split("developer_instructions")[0]),
  false,
);

const gem = toGeminiMd(sample, "sample.md", (m) => warnings.push(m));
const gemFront = parseFrontmatter(gem).front;
check(
  "  gemini: name kept",
  gemFront.find(([k]) => k === "name")[1],
  "tizen-sample",
);
check(
  "  gemini: tools mapped, unknown dropped",
  gemFront.find(([k]) => k === "tools")[1],
  "[run_shell_command, read_file, glob, search_file_content]",
);
check(
  "  gemini: maxTurns → max_turns",
  gemFront.find(([k]) => k === "max_turns")[1],
  "20",
);
check(
  "  gemini: model dropped",
  gemFront.some(([k]) => k === "model"),
  false,
);
check("  gemini: warned about Monitor", warnings, [
  'sample.md: no Gemini tool for "Monitor" — dropped',
]);
check(
  "  gemini: body preserved verbatim",
  parseFrontmatter(gem).body,
  parseFrontmatter(sample).body,
);

// Test 2: whole real agents/ directory, both formats
console.log("\nTest 2: convert the real agents/ directory");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-convert-test-"));
try {
  const tomls = convertPath("codex-toml", agentsDir, path.join(tmp, "codex"));
  const mds = convertPath("gemini-md", agentsDir, path.join(tmp, "gemini"));
  check(
    `  codex: ${agentFiles.length} .toml written`,
    tomls.length,
    agentFiles.length,
  );
  check(
    `  gemini: ${agentFiles.length} .md written`,
    mds.length,
    agentFiles.length,
  );

  const badToml = [];
  for (const f of tomls) {
    const t = fs.readFileSync(f, "utf-8");
    const fences =
      (t.match(/'''/g) || []).length + (t.match(/"""/g) || []).length;
    if (
      !/^name = ".+"$/m.test(t) ||
      !/^description = ".+"$/m.test(t) ||
      !/^developer_instructions = ('''|""")$/m.test(t) ||
      fences !== 2
    ) {
      badToml.push(path.basename(f));
    }
  }
  check(
    "  codex: every .toml has name/description/instructions + balanced fences",
    badToml,
    [],
  );

  const badMd = [];
  for (const f of mds) {
    const { front } = parseFrontmatter(fs.readFileSync(f, "utf-8"));
    const keys = front.map(([k]) => k);
    const tools = front.find(([k]) => k === "tools");
    const known = new Set(Object.values(GEMINI_TOOL_MAP));
    const toolsOk =
      !tools ||
      tools[1]
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .every((t) => known.has(t));
    if (
      !keys.includes("name") ||
      !keys.includes("description") ||
      keys.includes("model") ||
      keys.includes("maxTurns") ||
      !toolsOk
    ) {
      badMd.push(path.basename(f));
    }
  }
  check(
    "  gemini: every .md has name/description, no model/maxTurns, only Gemini tool names",
    badMd,
    [],
  );

  // Body round-trip for one real agent
  const first = agentFiles[0];
  const srcBody = parseFrontmatter(
    fs.readFileSync(path.join(agentsDir, first), "utf-8"),
  ).body;
  const gemBody = parseFrontmatter(
    fs.readFileSync(path.join(tmp, "gemini", first), "utf-8"),
  ).body;
  check(`  gemini: body of ${first} preserved`, gemBody, srcBody);
  const tomlText = fs.readFileSync(
    path.join(tmp, "codex", first.replace(/\.md$/, ".toml")),
    "utf-8",
  );
  check(
    `  codex: body of ${first} embedded verbatim`,
    tomlText.includes(srcBody.replace(/\s+$/, "")),
    true,
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Test 3: CLI usage error
console.log("\nTest 3: CLI usage");
const r = spawnSync(
  process.execPath,
  [path.join(__dirname, "..", "tools", "agent-convert.js")],
  { encoding: "utf-8" },
);
check("  no args → exit 1", r.status, 1);
check("  usage on stderr", r.stderr.includes("usage: agent-convert.js"), true);

console.log(
  `\n${failures === 0 ? "All tests passed" : `${failures} check(s) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
