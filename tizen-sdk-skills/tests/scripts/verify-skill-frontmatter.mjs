#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// Skill / agent frontmatter gate.
//
// Every common/skills/*/SKILL.md, common/agents/*.md and tizen-cli/skills/*/SKILL.md
// must open with a YAML frontmatter block carrying `name` and `description`.
// The description is what the host shows the model when it picks a skill,
// and the Agent Skills spec caps it at 1024 characters — longer ones are
// truncated by the host, which is how the closing "NEVER hand-write
// config.xml" rule of tizen-create-project silently disappeared. A skill's
// `name` must also equal its directory name, or the host cannot resolve it.
//
// Exit 0 when everything passes; exit 1 with one line per problem otherwise.
// Run from tests/: node scripts/verify-skill-frontmatter.mjs
// SKILL_FM_ROOT=<dir> points it at another checkout (used by the tests).

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_DESCRIPTION_CHARS = 1024;

const ROOT =
  process.env.SKILL_FM_ROOT ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Files to check: [path, expectedName|null]. */
export function frontmatterFiles(root) {
  const out = [];
  for (const skillsDir of ["common/skills", "tizen-cli/skills"]) {
    const dir = join(root, skillsDir);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const file = join(dir, entry, "SKILL.md");
      if (statSync(join(dir, entry)).isDirectory() && existsSync(file))
        out.push([file, entry]);
    }
  }
  const agentsDir = join(root, "common/agents");
  if (existsSync(agentsDir)) {
    for (const entry of readdirSync(agentsDir)) {
      if (entry.endsWith(".md"))
        out.push([join(agentsDir, entry), basename(entry, ".md")]);
    }
  }
  return out;
}

/**
 * Minimal frontmatter reader: the block between the opening `---` line and
 * the next `---` line, as { key: value } for single-line scalars. Nested
 * keys (metadata:, keywords:) are ignored — only `name` and `description`
 * matter here, and both are single-line in every file of this repo.
 */
export function readFrontmatter(text) {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

/** Problems for one file, as human-readable strings (empty = ok). */
export function checkFile(file, expectedName, root) {
  const rel = relative(root, file).split("\\").join("/");
  const fm = readFrontmatter(readFileSync(file, "utf-8"));
  if (!fm) return [`${rel}: no YAML frontmatter block`];
  const problems = [];
  if (!fm.name) problems.push(`${rel}: frontmatter has no name`);
  else if (expectedName && fm.name !== expectedName)
    problems.push(
      `${rel}: name "${fm.name}" does not match its directory/file name "${expectedName}"`,
    );
  if (!fm.description) problems.push(`${rel}: frontmatter has no description`);
  else {
    const len = [...fm.description].length; // code points, not UTF-8 bytes
    if (len > MAX_DESCRIPTION_CHARS)
      problems.push(
        `${rel}: description is ${len} characters (limit ${MAX_DESCRIPTION_CHARS}) — hosts truncate it; move the routing rules into the body`,
      );
  }
  return problems;
}

export function run(root = ROOT) {
  const files = frontmatterFiles(root);
  const failures = files.flatMap(([f, name]) => checkFile(f, name, root));
  return { files: files.length, failures };
}

// Run the gate only when executed directly (the tests import the helpers).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { files, failures } = run();
  if (files === 0) {
    console.error("✗ skill-frontmatter: no SKILL.md / agent files found");
    process.exit(1);
  }
  if (failures.length) {
    console.error(`✗ skill-frontmatter mismatch (${failures.length}):`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ skill frontmatter consistent — ${files} files, every description ≤ ${MAX_DESCRIPTION_CHARS} chars`,
  );
}
