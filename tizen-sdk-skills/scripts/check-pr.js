#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * check-pr.js — check the files a pull request changes against the rules in
 * AGENTS.md and CONTRIBUTING.md that can be verified mechanically.
 *
 * Usage:
 *   node scripts/check-pr.js --base origin/main                  # text
 *   node scripts/check-pr.js --base origin/main --format jsonl   # one JSON object per finding
 *   node scripts/check-pr.js --base origin/main --format github  # GitHub Actions annotations
 *
 * Compares the working tree with the merge base of --base, so committed and
 * uncommitted changes to tracked files are both checked (stage a new file with
 * `git add -N` to include it before committing). Only tizen-sdk-skills/ is
 * inspected.
 *
 * ERROR blocks the pull request. WARN must be fixed or explained in the pull
 * request description. The summary line is always printed; if it is missing,
 * the check did not run.
 *
 * Exit code: 0 no ERROR, 1 at least one ERROR, 2 usage or git failure.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const VERSION_FILES = ["package.json", "common/.claude-plugin/plugin.json"];

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\bghp_[A-Za-z0-9]{36}\b/, "GitHub token"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
];
// The documented throwaway signing fixture (AGENTS.md → Security).
const SECRET_EXEMPT = /^tests\/fixtures\/certs\//;

const PRIVATE_IP =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/;
const HOME_PATH =
  /(?:\/Users\/|\/home\/|[A-Za-z]:\\{1,2}Users\\{1,2})([^\s/\\"'`<>$%{}()]+)/gi;
const PLACEHOLDER_USERS = new Set([
  "user",
  "username",
  "you",
  "me",
  "name",
  "runner",
  "example",
  "shared",
  "public",
]);

// Agent, skill and hook prompts are not hand-written documents.
const H1_EXEMPT = /(^|\/)(agents|skills|hooks|commands)\//;
const NAME_EXEMPT = [
  /^common\/scripts\/tizen-create-project\/templates\//,
  /^tests\/fixtures\//,
  /^usage\//,
  /^_repo-root\//,
];
const KEBAB = /^\.?[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
const UPPER_CONVENTION = /^[A-Z0-9_]+(?:\.[a-zA-Z0-9]+)*$/; // README.md, SKILL.md

const CODE_DIRS = /^(common|tizen-cli\/src|vscode\/src|scripts)\//;

function finding(severity, rule, file, line, message) {
  return { severity, rule, file, line, message };
}

/** versions: { [file]: version | undefined } */
function checkVersionSync(versions) {
  const present = Object.entries(versions).filter(([, v]) => v !== undefined);
  if (new Set(present.map(([, v]) => v)).size <= 1) return [];
  const list = present.map(([f, v]) => `${f}=${v}`).join(", ");
  return [
    finding(
      "ERROR",
      "V-SYNC",
      present[0][0],
      0,
      `plugin versions differ: ${list}`,
    ),
  ];
}

/** lines: [{ line, text }] added by the change */
function checkAddedLines(file, lines) {
  const out = [];
  for (const { line, text } of lines) {
    if (!SECRET_EXEMPT.test(file)) {
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(text)) {
          out.push(finding("ERROR", "S-SECRET", file, line, `${label} added`));
        }
      }
    }
    const ip = text.match(PRIVATE_IP);
    if (ip) {
      out.push(
        finding("WARN", "S-PRIVATE", file, line, `private IP ${ip[0]} added`),
      );
    }
    for (const m of text.matchAll(HOME_PATH)) {
      if (PLACEHOLDER_USERS.has(m[1].toLowerCase())) continue;
      out.push(
        finding("WARN", "S-PRIVATE", file, line, `home path ${m[0]} added`),
      );
    }
  }
  return out;
}

/** Counterpart of a paired document, or null. docs/ is Korean-first. */
function docCounterpart(file) {
  if (!file.endsWith(".md")) return null;
  if (file.startsWith("docs/")) {
    return file.endsWith(".en.md")
      ? file.replace(/\.en\.md$/, ".md")
      : file.replace(/\.md$/, ".en.md");
  }
  return file.endsWith(".ko.md")
    ? file.replace(/\.ko\.md$/, ".md")
    : file.replace(/\.md$/, ".ko.md");
}

/** changed: Set of changed paths; exists: (path) => boolean */
function checkDocPairs(changed, exists) {
  const out = [];
  for (const file of changed) {
    const other = docCounterpart(file);
    if (!other || changed.has(other) || !exists(other)) continue;
    out.push(
      finding("WARN", "D-PAIR", file, 0, `changed without its pair ${other}`),
    );
  }
  return out;
}

function checkH1(file, text) {
  if (!file.endsWith(".md") || H1_EXEMPT.test(file)) return [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  if (lines[0] === "---") {
    i = lines.indexOf("---", 1) + 1;
  }
  let fence = false;
  let first = 0;
  let h1 = 0;
  for (; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const m = lines[i].match(/^(#{1,6})\s/);
    if (!m) continue;
    if (!first) first = m[1].length;
    if (m[1].length === 1) h1++;
  }
  if (first === 1 && h1 === 1) return [];
  return [
    finding(
      "WARN",
      "D-H1",
      file,
      0,
      `needs exactly one H1 as its first heading (found ${h1})`,
    ),
  ];
}

function checkName(file) {
  if (NAME_EXEMPT.some((re) => re.test(file))) return [];
  const base = path.posix.basename(file);
  if (KEBAB.test(base) || UPPER_CONVENTION.test(base)) return [];
  return [
    finding("WARN", "F-NAME", file, 0, "new file name is not kebab-case"),
  ];
}

function checkChangelog(changed) {
  if (changed.has("CHANGELOG.md")) return [];
  if (![...changed].some((f) => CODE_DIRS.test(f))) return [];
  return [
    finding(
      "WARN",
      "C-LOG",
      "CHANGELOG.md",
      0,
      "code changed without a CHANGELOG.md entry",
    ),
  ];
}

/** GitHub Actions workflow command; prefix makes the path repository-relative. */
function formatGithub(f, prefix) {
  const prop = (v) =>
    String(v)
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A")
      .replace(/:/g, "%3A")
      .replace(/,/g, "%2C");
  const data = f.message
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  const level = f.severity === "ERROR" ? "error" : "warning";
  const line = f.line ? `,line=${f.line}` : "";
  return `::${level} file=${prop(prefix + f.file)}${line},title=${prop(f.rule)}::${data}`;
}

/** Parse `git diff -U0` output into { file: [{ line, text }] }. */
function parseAddedLines(diff) {
  const added = {};
  let file = null;
  let line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw === "+++ /dev/null" ? null : raw.slice(6);
      if (file) added[file] = added[file] || [];
    } else if (raw.startsWith("@@")) {
      line = Number(raw.match(/\+(\d+)/)[1]);
    } else if (file && raw.startsWith("+")) {
      added[file].push({ line, text: raw.slice(1) });
      line++;
    }
  }
  return added;
}

/** Parse `git diff --name-status` output. */
function parseNameStatus(text) {
  const changed = new Set();
  const created = [];
  for (const row of text.split("\n").filter(Boolean)) {
    const [status, ...paths] = row.split("\t");
    paths.forEach((p) => changed.add(p));
    if (status === "A" || status.startsWith("R") || status.startsWith("C")) {
      created.push(paths[paths.length - 1]);
    }
  }
  return { changed, created };
}

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function usage(message) {
  console.error(`check-pr: ${message}`);
  console.error(
    "usage: node scripts/check-pr.js --base <rev> [--format text|jsonl|github]",
  );
  process.exit(2);
}

function parseCli(argv) {
  const opts = { base: null, format: "text" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base" || arg === "--format") {
      const value = argv[++i];
      if (!value || value.startsWith("-")) usage(`${arg} requires a value`);
      opts[arg.slice(2)] = value;
    } else {
      usage(`unknown argument ${arg}`);
    }
  }
  if (!opts.base) usage("--base is required");
  if (!["text", "jsonl", "github"].includes(opts.format)) {
    usage(`--format must be text, jsonl or github, got ${opts.format}`);
  }
  return opts;
}

function readVersion(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return undefined;
  return JSON.parse(fs.readFileSync(abs, "utf8")).version;
}

function main() {
  const started = Date.now();
  const opts = parseCli(process.argv.slice(2));

  let mergeBase;
  try {
    git(["rev-parse", "--verify", "--quiet", `${opts.base}^{commit}`]);
    mergeBase = git(["merge-base", opts.base, "HEAD"]).trim();
  } catch {
    usage(`cannot resolve --base ${opts.base} (fetch it first?)`);
  }

  let nameStatus;
  let diff;
  try {
    const scope = ["--relative", mergeBase, "--", "."];
    nameStatus = git(["diff", "--name-status", "-M", ...scope]);
    diff = git(["diff", "-U0", "--no-color", "--no-ext-diff", ...scope]);
  } catch (err) {
    console.error(`check-pr: git diff failed: ${err.message}`);
    process.exit(2);
  }

  const { changed, created } = parseNameStatus(nameStatus);
  const added = parseAddedLines(diff);
  const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

  const versions = Object.fromEntries(
    VERSION_FILES.map((f) => [f, readVersion(f)]),
  );
  const findings = [
    ...checkVersionSync(versions),
    ...Object.entries(added).flatMap(([f, lines]) => checkAddedLines(f, lines)),
    ...checkDocPairs(changed, exists),
    ...created
      .filter(exists)
      .flatMap((f) => [
        ...checkName(f),
        ...checkH1(f, fs.readFileSync(path.join(ROOT, f), "utf8")),
      ]),
    ...checkChangelog(changed),
  ];

  const prefix =
    opts.format === "github" ? git(["rev-parse", "--show-prefix"]).trim() : "";
  for (const f of findings) {
    if (opts.format === "jsonl") {
      console.log(JSON.stringify(f));
    } else if (opts.format === "github") {
      console.log(formatGithub(f, prefix));
    } else {
      const where = f.line ? `${f.file}:${f.line}` : f.file;
      console.log(`${f.severity} ${f.rule} ${where} ${f.message}`);
    }
  }
  const errors = findings.filter((f) => f.severity === "ERROR").length;
  const warns = findings.length - errors;
  const secs = ((Date.now() - started) / 1000).toFixed(2);
  console.log(
    `check-pr: ${errors} ERROR, ${warns} WARN (${changed.size} files, ${secs}s)`,
  );
  process.exit(errors ? 1 : 0);
}

module.exports = {
  checkVersionSync,
  checkAddedLines,
  checkDocPairs,
  checkH1,
  checkName,
  checkChangelog,
  formatGithub,
  parseAddedLines,
  parseNameStatus,
};

if (require.main === module) main();
