#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * add-spdx-headers.js — insert the Apache-2.0 SPDX header into every source file
 * that does not have one yet.
 *
 * Usage:
 *   node scripts/add-spdx-headers.js            # apply
 *   node scripts/add-spdx-headers.js --check    # exit 1 if any file lacks a header
 *
 * Covered: git-tracked *.js / *.mjs / *.cjs / *.ts / *.sh / *.ps1 / *.bat plus
 * the extensionless hook adapters. Excluded: scaffolding templates copied into
 * user projects, usage/ samples, _repo-root/ staging, build outputs.
 *
 * The header goes after a shebang line, after PowerShell `#requires`
 * directives and after a leading `@echo off` in batch files (a REM before it
 * would be echoed), keeps a UTF-8 BOM if present, and follows the line ending
 * of the file's first line (CRLF for .ps1/.bat per .gitattributes, LF
 * elsewhere). Only the first lines are inspected for an existing header, so a
 * file that merely mentions the SPDX tag in its body is not mistaken for one
 * that carries it.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CHECK = process.argv.includes("--check");
const MARKER = "SPDX-License-Identifier: Apache-2.0";
const COPYRIGHT = "Copyright 2026 Samsung Electronics Co., Ltd.";
// A header is only recognised within the first lines of a file.
const HEAD_LINES = 10;

const EXTRA_FILES = new Set([
  "cline/hooks/PreToolUse",
  "gemini/hooks/BeforeTool",
]);
const EXCLUDE = [
  /^common\/scripts\/tizen-create-project\/templates\//,
  /^usage\//,
  /^_repo-root\//,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
];

function commentPrefix(rel) {
  const ext = path.extname(rel).toLowerCase();
  if ([".js", ".mjs", ".cjs", ".ts"].includes(ext)) return "//";
  if (ext === ".bat") return "REM";
  return "#"; // .sh, .ps1, extensionless bash hooks
}

/** Line ending of the first line (falls back to LF for single-line files). */
function detectEol(text) {
  const nl = text.indexOf("\n");
  if (nl > 0 && text[nl - 1] === "\r") return "\r\n";
  return "\n";
}

function hasHeader(text) {
  return text.split(/\r?\n/, HEAD_LINES).some((l) => l.includes(MARKER));
}

const files = execSync("git ls-files -z", { cwd: ROOT })
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((rel) => {
    if (EXCLUDE.some((re) => re.test(rel))) return false;
    if (EXTRA_FILES.has(rel)) return true;
    return /\.(js|mjs|cjs|ts|sh|ps1|bat)$/i.test(rel);
  });

let missing = 0;
let updated = 0;

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let text = fs.readFileSync(abs, "utf8");
  if (hasHeader(text)) continue;
  missing++;
  if (CHECK) {
    console.log(`missing header: ${rel}`);
    continue;
  }

  let bom = "";
  if (text.charCodeAt(0) === 0xfeff) {
    bom = "﻿";
    text = text.slice(1);
  }
  const eol = detectEol(text);
  const lines = text.split(eol);

  // Keep shebang / #requires directives / a leading `@echo off` at the very top.
  const isBatch = path.extname(rel).toLowerCase() === ".bat";
  let insertAt = 0;
  while (
    insertAt < lines.length &&
    (lines[insertAt].startsWith("#!") ||
      /^#requires\b/i.test(lines[insertAt]) ||
      (isBatch && /^@?echo\s+off\b/i.test(lines[insertAt])))
  ) {
    insertAt++;
  }

  const p = commentPrefix(rel);
  const header = [`${p} ${MARKER}`, `${p} ${COPYRIGHT}`, ""];
  lines.splice(insertAt, 0, ...header);
  fs.writeFileSync(abs, bom + lines.join(eol), "utf8");
  updated++;
}

if (CHECK) {
  console.log(
    missing
      ? `${missing} file(s) lack the SPDX header`
      : "all source files carry the SPDX header",
  );
  process.exit(missing ? 1 : 0);
}
console.log(
  `SPDX header added to ${updated} file(s); ${files.length - updated} already had it`,
);
