#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * agent-convert.js — turn common/agents/*.md (Claude Code subagent format)
 * into the file format another harness loads.
 *
 * Usage:
 *   node agent-convert.js --to codex-toml <src.md | srcDir> <destDir>
 *   node agent-convert.js --to gemini-md  <src.md | srcDir> <destDir>
 *
 * Source format (Claude Code):
 *   ---
 *   name: tizen-build-project
 *   description: …one line…
 *   tools: Bash, Read, Glob, Grep
 *   model: sonnet
 *   maxTurns: 20
 *   ---
 *   <body = system prompt>
 *
 * codex-toml  → ~/.codex/agents/<name>.toml
 *   name / description as TOML basic strings, body as `developer_instructions`
 *   in a LITERAL multi-line string ('''…''') so Windows paths and backslashes
 *   in the prompt survive untouched. `tools`, `model`, `maxTurns` have no Codex
 *   equivalent and are dropped.
 *
 * gemini-md   → ~/.gemini/agents/<name>.md
 *   Same markdown shape; frontmatter rewritten: name and description emitted
 *   as YAML single-quoted strings (Gemini parses strict YAML), tools mapped to
 *   Gemini CLI built-in tool names, maxTurns → max_turns, model dropped (Claude
 *   aliases like "sonnet" are not Gemini models; Gemini falls back to its
 *   default).
 *
 * Frontmatter values: a value written as ONE complete YAML quoted scalar
 * ('…' with '' for a quote, or "…" with JSON-compatible escapes) is unquoted
 * on parse; anything else is taken verbatim. Every output format then escapes
 * the plain value itself, so no writer has to guess whether a value is
 * "already quoted". name and description are required for both formats.
 *
 * Exit 0 on success, 1 on any failure (message on stderr). Exported for tests.
 */

const fs = require("fs");
const path = require("path");

// Claude Code tool → Gemini CLI built-in tool. Unmapped tools are dropped with
// a note on stderr rather than passed through (an unknown name would make
// Gemini reject the whole agent definition).
const GEMINI_TOOL_MAP = {
  Bash: "run_shell_command",
  Read: "read_file",
  Write: "write_file",
  Edit: "replace",
  Glob: "glob",
  Grep: "search_file_content",
  WebFetch: "web_fetch",
  WebSearch: "google_web_search",
};

// A value that is exactly one YAML quoted scalar. `'a' or 'b'` and
// `"a" or "b"` start and end with a quote but are NOT one scalar, so they
// fail these patterns and stay verbatim.
const SINGLE_QUOTED = /^'((?:[^']|'')*)'$/;
const DOUBLE_QUOTED = /^"(?:[^"\\]|\\.)*"$/;

/**
 * Unquote one frontmatter value. Single-quoted: `''` → `'`. Double-quoted:
 * JSON escapes (\\ \" \/ \b \f \n \r \t \uXXXX), the subset YAML and JSON
 * share; any other escape (e.g. `"C:\Users"`, where YAML rejects `\U…`) is an
 * error instead of a silent pass-through.
 */
function unquoteValue(key, raw) {
  const s = raw.match(SINGLE_QUOTED);
  if (s) return s[1].replace(/''/g, "'");
  if (DOUBLE_QUOTED.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(
        `frontmatter "${key}": unsupported escape in double-quoted value — ${raw} ` +
          "(use single quotes, or escape the backslash as \\\\)",
      );
    }
  }
  return raw;
}

/**
 * Split a markdown file into frontmatter pairs and body.
 * Only `key: value` lines are understood; a value that is one complete quoted
 * scalar is unquoted (see unquoteValue), any other value is kept verbatim.
 * @param {string} text
 * @returns {{ front: Array<[string,string]>, body: string }}
 */
function parseFrontmatter(text) {
  const norm = text.replace(/\r\n/g, "\n");
  const m = norm.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("no frontmatter block (--- … ---) found");
  const front = [];
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const i = line.indexOf(":");
    if (i === -1) throw new Error(`frontmatter line without ':' — ${line}`);
    const key = line.slice(0, i).trim();
    front.push([key, unquoteValue(key, line.slice(i + 1).trim())]);
  }
  return { front, body: m[2] };
}

const get = (front, key) => (front.find(([k]) => k === key) || [])[1];

/** Parse an agent file and require name + description, naming the file on error. */
function parseAgent(text, sourceName) {
  let parsed;
  try {
    parsed = parseFrontmatter(text);
  } catch (e) {
    throw new Error(`${sourceName}: ${e.message}`, { cause: e });
  }
  if (!get(parsed.front, "name") || !get(parsed.front, "description")) {
    throw new Error(`${sourceName}: name and description are required`);
  }
  return parsed;
}

// YAML single-quoted scalar, applied to every plain value. Source values are
// written unquoted for Claude Code's lenient frontmatter reader, but Gemini CLI
// parses agent frontmatter as strict YAML, where an inner `": "` (e.g.
// `"목록": \`x\``) reads as a mapping and the whole agent fails to load. Single
// quotes need only `'` → `''`; backslashes and double quotes stay literal.
// Values are single-line (parseFrontmatter splits on newlines).
const yamlSingle = (s) => `'${String(s).replace(/'/g, "''")}'`;

const tomlBasic = (s) =>
  `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

/** Claude agent .md → Codex agent TOML text. */
function toCodexToml(text, sourceName) {
  const { front, body } = parseAgent(text, sourceName);
  const name = get(front, "name");
  const description = get(front, "description");
  let instructions = body.replace(/\s+$/, "");
  let block;
  if (!instructions.includes("'''")) {
    // Literal multi-line string: no escaping, backslashes are literal.
    block = `'''\n${instructions}\n'''`;
  } else {
    // Rare fallback: basic multi-line string with escaping.
    block = `"""\n${instructions
      .replace(/\\/g, "\\\\")
      .replace(/"""/g, '\\"""')}\n"""`;
  }
  return [
    `# Generated from common/agents/${sourceName} by agent-convert.js — do not edit here.`,
    `name = ${tomlBasic(name)}`,
    `description = ${tomlBasic(description)}`,
    `developer_instructions = ${block}`,
    "",
  ].join("\n");
}

/** Claude agent .md → Gemini agent .md text. */
function toGeminiMd(text, sourceName, warn = () => {}) {
  const { front, body } = parseAgent(text, sourceName);
  const out = [];
  for (const [key, value] of front) {
    switch (key) {
      case "name":
      case "description":
        out.push(`${key}: ${yamlSingle(value)}`);
        break;
      case "tools": {
        const mapped = [];
        for (const t of value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)) {
          if (GEMINI_TOOL_MAP[t]) mapped.push(GEMINI_TOOL_MAP[t]);
          else warn(`${sourceName}: no Gemini tool for "${t}" — dropped`);
        }
        if (mapped.length) out.push(`tools: [${mapped.join(", ")}]`);
        break;
      }
      case "maxTurns":
        out.push(`max_turns: ${value}`);
        break;
      case "model":
        // Claude model aliases are not Gemini models; let Gemini use its default.
        break;
      default:
        warn(`${sourceName}: unknown frontmatter key "${key}" — dropped`);
    }
  }
  return `---\n${out.join("\n")}\n---\n${body}`;
}

const CONVERTERS = {
  "codex-toml": { ext: ".toml", convert: toCodexToml },
  "gemini-md": { ext: ".md", convert: toGeminiMd },
};

/**
 * Convert one file or every *.md in a directory.
 * @returns {string[]} written file paths
 */
function convertPath(to, src, destDir) {
  const conv = CONVERTERS[to];
  if (!conv)
    throw new Error(
      `unknown --to "${to}" (${Object.keys(CONVERTERS).join(", ")})`,
    );
  const files = fs.statSync(src).isDirectory()
    ? fs
        .readdirSync(src)
        .filter((f) => f.endsWith(".md"))
        .map((f) => path.join(src, f))
    : [src];
  fs.mkdirSync(destDir, { recursive: true });
  const written = [];
  for (const file of files) {
    const base = path.basename(file, ".md");
    const text = fs.readFileSync(file, "utf-8");
    const out = conv.convert(text, path.basename(file), (msg) =>
      process.stderr.write(`agent-convert: ${msg}\n`),
    );
    const dest = path.join(destDir, base + conv.ext);
    fs.writeFileSync(dest, out);
    written.push(dest);
  }
  return written;
}

function main(argv) {
  const i = argv.indexOf("--to");
  const to = i !== -1 ? argv[i + 1] : null;
  const rest = argv.filter((a, k) => k !== i && k !== i + 1);
  if (!to || rest.length !== 2) {
    process.stderr.write(
      "usage: agent-convert.js --to codex-toml|gemini-md <src.md|srcDir> <destDir>\n",
    );
    process.exit(1);
  }
  try {
    const written = convertPath(to, rest[0], rest[1]);
    process.stdout.write(`${written.length} agent(s) → ${rest[1]} (${to})\n`);
  } catch (e) {
    process.stderr.write(`agent-convert: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  GEMINI_TOOL_MAP,
  parseFrontmatter,
  toCodexToml,
  toGeminiMd,
  convertPath,
};
