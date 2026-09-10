#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * rewrite-runner-snippets.js — keep the "find the CLI runner" snippets in the
 * agent/skill/doc markdown in sync with plugin-cache.js (HOST_DOT_DIRS,
 * HOST_MARKERS, HOST_DETECT_ORDER).
 *
 * Every agents/*.md, skills/<n>/SKILL.md, scripts/T-CLI.md and docs walkthrough
 * carries a copy of the same mechanical snippets that locate <runner>-cli.js
 * under ~/<host-dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/
 * lib/cli/. When a harness (or a harness marker) is added, ~120 files need the
 * same edit; this script does it deterministically and reports anything it
 * could not classify.
 *
 * Usage:
 *   node scripts/rewrite-runner-snippets.js            # rewrite in place
 *   node scripts/rewrite-runner-snippets.js --check    # exit 1 if a rewrite would apply
 *   node scripts/rewrite-runner-snippets.js --dry-run  # print what would change
 *
 * Patterns handled (all derived from plugin-cache.js so this stays correct when
 * the host list or the markers change again):
 *   (a) bash host pick — any line of the form
 *         BASE="$HOME/.x"; [ -z "$MARKER" ] || BASE="$HOME/.y"; …
 *       (the old two-host `[ -n … ]` form included) → NEW_BASE_LINE: default
 *       host first, then one `[ -z "${M1:-}${M2:-}…" ] || BASE=…` clause per
 *       marker host, in REVERSE detection order (bash: last clause wins, so the
 *       highest-precedence host comes last). `[ -z … ] ||` exits 0 under `set -e`.
 *   (b) bash fallback —
 *         [ -n "$CLI" ] || CLI=$(ls "$HOME"/.{claude,cline,…}/<tail>/<VER>/lib/cli/X.js … | sort -V | tail -1)
 *       sorted the WHOLE path, so the alphabetically-last dot-dir (.gemini) won
 *       regardless of version (issue #41). → FALLBACK_LINE: walk HOST_DOT_DIRS
 *       in order and version-sort within each host; first host with a copy wins.
 *   (c) bash bare form (no host pick at all) —
 *         CLI=$(ls "$HOME"/.{…}/<tail>/<VER>/lib/cli/X.js … | sort | tail -1)
 *       → the full three-line block (a)+(line 2)+(b).
 *   (d) cmd.exe dir args:  "%USERPROFILE%\.claude\…\*X.js" "%USERPROFILE%\.cline\…\*X.js"
 *                          → one quoted arg per host (unchanged behaviour).
 *   (e) PowerShell — a fenced cmd.exe lookup block gains a fenced PowerShell
 *       block right after it (skills/agents only): host pick from HOST_MARKERS,
 *       then own host first, then every host, version-sorted with [version].
 *       The old inline `Get-ChildItem "…\.claude\…","…\.cline\…" -ErrorAction
 *       SilentlyContinue` list is replaced by the same two lines.
 *   (f) prose: "If neither the `~/.claude` nor the `~/.cline` cache contains the runner"
 *              → "If none of the `~/.claude`, `~/.cline`, … caches contains the runner";
 *       "Pick the highest-version path, then:" → mentions that the PowerShell
 *       form already resolved $CLI.
 *
 * After rewriting, any remaining line that mentions a host cache path but not
 * every host is printed under "UNCLASSIFIED" for manual review.
 *
 * Exports NEW_BASE_LINE / FALLBACK_LINE / PS_HOST_PICK_LINE / psLookupLine /
 * rewrite for common/lib/tests/plugin-cache.test.js (drift guard).
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const {
  HOST_DOT_DIRS,
  HOST_MARKERS,
  HOST_DETECT_ORDER,
  DEFAULT_HOST_DOT_DIR,
} = require("../common/lib/core/plugin-cache.js");

const CACHE_TAIL = "plugins/cache/tizen-platform/tizen-sdk-skills";
const CACHE_TAIL_WIN = CACHE_TAIL.split("/").join("\\");

const names = HOST_DOT_DIRS.map((d) => d.slice(1)); // claude, cline, ...

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------------
// Replacement builders
// ---------------------------------------------------------------------------

// (a) bash host pick line. Reverse detection order: bash's last matching clause
//     wins, so the host with the highest precedence must come last.
const NEW_BASE_LINE = [
  `BASE="$HOME/${DEFAULT_HOST_DOT_DIR}"`,
  ...[...HOST_DETECT_ORDER].reverse().map((d) => {
    const probe = HOST_MARKERS[d].map((v) => `\${${v}:-}`).join("");
    return `[ -z "${probe}" ] || BASE="$HOME/${d}"`;
  }),
].join("; ");

// Snippets inside list items are indented; every line rule below captures the
// leading whitespace as group 1 and re-emits it.
const INDENT = "^([ \\t]*)";

// Any host-pick line, old or new: BASE="$HOME/.x"; then zero or more
// `; [ -n|-z "…" ] || BASE="$HOME/.y"` clauses, and nothing else on the line.
const BASE_LINE_RE = new RegExp(
  `${INDENT}BASE="\\$HOME/\\.[a-z]+"(?:; \\[ -[nz] "[^"]*" \\] \\|\\| BASE="\\$HOME/\\.[a-z]+")*$`,
  "gm",
);

// (b) bash lines for <VAR> and a path tail under <VERSION>/ (e.g.
//     lib/cli/x-cli.js or scripts/g/g.ps1). The `|| true` keeps a missing cache
//     from aborting a `set -o pipefail` shell: `ls` exits 2 when the glob has no
//     match, and pipefail would make that the status of the whole assignment.
const LS_TAIL = "2>/dev/null | sort -V | tail -1) || true";
const OWN_HOST_LINE = (varName, tail) =>
  `${varName}=$(ls "$BASE"/${CACHE_TAIL}/*/${tail} ${LS_TAIL}`;
const FALLBACK_LINE = (varName, tail) =>
  `[ -n "$${varName}" ] || for d in ${HOST_DOT_DIRS.join(" ")}; do ` +
  `${varName}=$(ls "$HOME/$d"/${CACHE_TAIL}/*/${tail} ${LS_TAIL}; ` +
  `[ -z "$${varName}" ] || break; done`;

// Current or previous own-host line (with or without `|| true`).
//   group 1 = indent, group 2 = var name, group 3 = tail after <VERSION>/
const OWN_HOST_RE = new RegExp(
  `${INDENT}([A-Z_]+)=\\$\\(ls "\\$BASE"/${esc(CACHE_TAIL)}/\\*/(\\S+) 2>/dev/null \\| sort -V \\| tail -1\\)(?: \\|\\| true)?$`,
  "gm",
);

// Old fallback: brace glob over the hosts, whole-path sort.
//   group 1 = indent, group 2 = var name, group 3 = tail after <VERSION>/
const OLD_FALLBACK_RE = new RegExp(
  `${INDENT}\\[ -n "\\$([A-Z_]+)" \\] \\|\\| \\2=\\$\\(ls "\\$HOME"/\\.\\{[a-z,]+\\}/${esc(CACHE_TAIL)}/\\*/(\\S+) 2>/dev/null \\| sort(?: -V)? \\| tail -1\\)$`,
  "gm",
);
// Current fallback form (any host list) — regenerated so a host-list change
// propagates.
const CUR_FALLBACK_RE = new RegExp(
  `${INDENT}\\[ -n "\\$([A-Z_]+)" \\] \\|\\| for d in [ .a-z]+; do \\2=\\$\\(ls "\\$HOME/\\$d"/${esc(CACHE_TAIL)}/\\*/(\\S+) 2>/dev/null \\| sort -V \\| tail -1\\)(?: \\|\\| true)?; \\[ -z "\\$\\2" \\] \\|\\| break; done$`,
  "gm",
);

// (c) bare form: the same ls without any host pick.
const BARE_RE = new RegExp(
  `${INDENT}([A-Z_]+)=\\$\\(ls "\\$HOME"/\\.\\{[a-z,]+\\}/${esc(CACHE_TAIL)}/\\*/(\\S+) 2>/dev/null \\| sort(?: -V)? \\| tail -1\\)$`,
  "gm",
);

// Legacy brace glob in prose or odd spots.
const OLD_BRACE = `.{claude,cline}/${CACHE_TAIL}/`;
const NEW_BRACE = `.{${names.join(",")}}/${CACHE_TAIL}/`;

// (d) cmd.exe: match the MAXIMAL run of consecutive host cache paths and
//     canonicalise it to one path per HOST_DOT_DIRS entry — but only when the
//     run does not already name every host and all paths share the same tail.
//     Group 1 = host name, group 2 = tail after tizen-sdk-skills\.
const HOST_ALT = names.join("|");
const CMD_ARG = `"%USERPROFILE%\\\\\\.(${HOST_ALT})\\\\${esc(CACHE_TAIL_WIN)}\\\\([^"]+)"`;
const CMD_RE = new RegExp(`${CMD_ARG}(?: ${CMD_ARG})*`, "g");
const PS_ARG = `"\\$env:USERPROFILE\\\\\\.(${HOST_ALT})\\\\${esc(CACHE_TAIL_WIN)}\\\\([^"]+)"`;
// Inline PowerShell lookup: Get-ChildItem <run> -ErrorAction SilentlyContinue
const PS_INLINE_RE = new RegExp(
  `Get-ChildItem ${PS_ARG}(?:,${PS_ARG})*(?: -ErrorAction SilentlyContinue)?`,
  "g",
);

function fanOutCmd(run) {
  const items = [...run.matchAll(new RegExp(CMD_ARG, "g"))];
  const tails = new Set(items.map((m) => m[2]));
  if (tails.size !== 1) return run; // mixed runners — UNCLASSIFIED will show it
  const hosts = new Set(items.map((m) => `.${m[1]}`));
  if (HOST_DOT_DIRS.every((d) => hosts.has(d))) return run; // already complete
  const [tail] = tails;
  return HOST_DOT_DIRS.map(
    (d) => `"%USERPROFILE%\\${d}\\${CACHE_TAIL_WIN}\\${tail}"`,
  ).join(" ");
}

// (e) PowerShell host pick + lookup. Same precedence as the bash line: the
//     highest-precedence host is assigned last.
const PS_HOST_PICK_LINE = [
  `$h = "${DEFAULT_HOST_DOT_DIR}"`,
  ...[...HOST_DETECT_ORDER].reverse().map((d) => {
    const probe = HOST_MARKERS[d].map((v) => `$env:${v}`).join(" -or ");
    return `if (${probe}) { $h = "${d}" }`;
  }),
].join("; ");

const PS_HOST_LIST = `@($h, ${HOST_DOT_DIRS.map((d) => `"${d}"`).join(", ")})`;

/** @param {string} tailWin e.g. `*\lib\cli\x-cli.js` (after tizen-sdk-skills\) */
const psLookupLine = (tailWin) =>
  `$CLI = $null; foreach ($d in ${PS_HOST_LIST}) { ` +
  `$CLI = Get-ChildItem "$env:USERPROFILE\\$d\\${CACHE_TAIL_WIN}\\${tailWin}" -ErrorAction SilentlyContinue ` +
  `| Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; ` +
  `if ($CLI) { break } }`;

// Previously generated PowerShell lines (any marker set / host list) — matched
// so a change in HOST_MARKERS or HOST_DOT_DIRS regenerates them in place.
const CUR_PS_HOST_PICK_RE =
  /\$h = "\.[a-z]+"(?:; if \([^)]*\) \{ \$h = "\.[a-z]+" \})*/g;
const CUR_PS_LOOKUP_RE = new RegExp(
  `\\$CLI = \\$null; foreach \\(\\$d in @\\(\\$h(?:, "\\.[a-z]+")*\\)\\) \\{ \\$CLI = Get-ChildItem "\\$env:USERPROFILE\\\\\\$d\\\\${esc(CACHE_TAIL_WIN)}\\\\([^"]+)" -ErrorAction SilentlyContinue \\| Sort-Object \\{ \\[version\\]\\$_\\.Directory\\.Parent\\.Parent\\.Name \\} \\| Select-Object -Last 1 -ExpandProperty FullName; if \\(\\$CLI\\) \\{ break \\} \\}`,
  "g",
);

const PS_BLOCK_HEADING =
  "**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**";

function psBlock(runnerJs, nodeArgs) {
  return [
    "\n",
    PS_BLOCK_HEADING,
    "",
    "```powershell",
    PS_HOST_PICK_LINE,
    psLookupLine(`*\\lib\\cli\\${runnerJs}`),
    `node "$CLI"${nodeArgs}`,
    "```",
  ].join("\n");
}

// A fenced block whose body is exactly one cmd.exe lookup line.
//   group 1 = fence open (``` or ```text …), group 2 = runner js name
const CMD_FENCE_RE = new RegExp(
  "```[a-z]*\\n(cmd /c dir /s /b " +
    `"%USERPROFILE%\\\\\\.${names[0]}\\\\${esc(CACHE_TAIL_WIN)}\\\\\\*(?:[^"]*\\\\)?([A-Za-z0-9-]+\\.js)"` +
    "[^\\n]*)\\n```",
  "g",
);
const PS_BLOCK_MARKER = `foreach ($d in ${PS_HOST_LIST})`;
const NODE_FOUND_PATH_RE = /```[a-z]*\nnode "<found-path>"([^\n]*)\n```/;

function insertPsBlocks(text) {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(CMD_FENCE_RE)) {
    const end = m.index + m[0].length;
    out += text.slice(last, end);
    last = end;
    const ahead = text.slice(end, end + 700);
    if (ahead.includes(PS_BLOCK_MARKER)) continue; // already has the PS block
    const nodeMatch = ahead.slice(0, 500).match(NODE_FOUND_PATH_RE);
    const nodeArgs = nodeMatch ? nodeMatch[1] : "";
    out += psBlock(m[2], nodeArgs);
  }
  return out + text.slice(last);
}

function replaceInlinePs(text) {
  return text.replace(PS_INLINE_RE, (run) => {
    const items = [...run.matchAll(new RegExp(PS_ARG, "g"))];
    const tails = new Set(items.map((m) => m[2]));
    if (tails.size !== 1) return run;
    const [tail] = tails;
    return `${PS_HOST_PICK_LINE}; ${psLookupLine(tail)}`;
  });
}

// (f) prose
const OLD_PROSE =
  "If neither the `~/.claude` nor the `~/.cline` cache contains the runner";
const NEW_PROSE = `If none of the ${HOST_DOT_DIRS.map((d) => `\`~/${d}\``).join(", ")} caches contains the runner`;
const OLD_PICK_THEN = "Pick the highest-version path, then:";
const NEW_PICK_THEN =
  "Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:";
const OLD_PICK_RESULTS = "Pick the highest-version path from the results.";
const NEW_PICK_RESULTS =
  "Pick the highest-version path from the results (the PowerShell form already resolved `$CLI`).";

// One BASE line per fenced code block is enough: the bare-form expansion (c)
// emits one per occurrence, which duplicates it when a block has two lookups.
function dedupeBaseLines(text) {
  const parts = text.split("```");
  for (let i = 1; i < parts.length; i += 2) {
    // odd indices are fenced code bodies
    const lines = parts[i].split("\n");
    let seen = false;
    parts[i] = lines
      .filter((line) => {
        if (line.trim() !== NEW_BASE_LINE) return true;
        if (seen) return false;
        seen = true;
        return true;
      })
      .join("\n");
  }
  return parts.join("```");
}

function rewrite(text, { psBlocks = true } = {}) {
  let out = text;
  out = out.replace(BASE_LINE_RE, (_m, indent) => indent + NEW_BASE_LINE);
  out = out.split(OLD_BRACE).join(NEW_BRACE);
  out = out.replace(
    OWN_HOST_RE,
    (_m, indent, varName, tail) => indent + OWN_HOST_LINE(varName, tail),
  );
  for (const re of [OLD_FALLBACK_RE, CUR_FALLBACK_RE]) {
    out = out.replace(
      re,
      (_m, indent, varName, tail) => indent + FALLBACK_LINE(varName, tail),
    );
  }
  out = out.replace(BARE_RE, (_m, indent, varName, tail) =>
    [NEW_BASE_LINE, OWN_HOST_LINE(varName, tail), FALLBACK_LINE(varName, tail)]
      .map((l) => indent + l)
      .join("\n"),
  );
  out = dedupeBaseLines(out);
  out = out.replace(CMD_RE, fanOutCmd);
  out = replaceInlinePs(out);
  out = out.replace(CUR_PS_HOST_PICK_RE, PS_HOST_PICK_LINE);
  out = out.replace(CUR_PS_LOOKUP_RE, (_m, tail) => psLookupLine(tail));
  if (psBlocks) out = insertPsBlocks(out);
  out = out.split(OLD_PROSE).join(NEW_PROSE);
  out = out.split(OLD_PICK_THEN).join(NEW_PICK_THEN);
  out = out.split(OLD_PICK_RESULTS).join(NEW_PICK_RESULTS);
  return out;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

const TARGET_DIRS = [
  "common/agents",
  "common/skills",
  "common/scripts",
  "docs",
];
// The PowerShell block is what the model reads in the skill/agent it loaded;
// docs walkthroughs keep the bash form only.
const PS_BLOCK_DIRS = ["common/agents", "common/skills"];

// A line that talks about a host cache path but does not name every host.
const CACHE_MENTION = new RegExp(
  `\\.(${names.join("|")})[\\\\/]${esc(CACHE_TAIL.replace(/\//g, "/"))}`.replace(
    /\//g,
    "[\\\\/]",
  ),
);
function unclassified(text) {
  const lines = text.split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    if (!CACHE_MENTION.test(line)) return;
    if (HOST_DOT_DIRS.every((d) => line.includes(d.slice(1)))) return;
    hits.push({ line: i + 1, text: line.trim().slice(0, 160) });
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(argv) {
  const check = argv.includes("--check");
  const dryRun = argv.includes("--dry-run");

  const files = TARGET_DIRS.flatMap((d) => {
    const abs = path.join(REPO_ROOT, d);
    return fs.existsSync(abs) ? walk(abs, []) : [];
  });

  let changed = 0;
  const leftovers = [];
  for (const file of files) {
    const before = fs.readFileSync(file, "utf-8");
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    const psBlocks = PS_BLOCK_DIRS.some((d) => rel.startsWith(`${d}/`));
    const after = rewrite(before, { psBlocks });
    if (after !== before) {
      changed++;
      if (dryRun || check) {
        const beforeLines = before.split("\n");
        const delta = after
          .split("\n")
          .filter((l, i) => beforeLines[i] !== l).length;
        console.log(
          `${check ? "STALE" : "WOULD REWRITE"}  ${rel}  (${delta} line(s))`,
        );
      } else {
        fs.writeFileSync(file, after);
        console.log(`rewrote  ${rel}`);
      }
    }
    for (const hit of unclassified(after)) {
      leftovers.push({ rel, ...hit });
    }
  }

  console.log(
    `\n${files.length} markdown file(s) scanned, ${changed} ${check || dryRun ? "would change" : "rewritten"}.`,
  );
  console.log(`Hosts: ${HOST_DOT_DIRS.join(" ")}`);
  console.log(`bash host pick → ${NEW_BASE_LINE}`);
  console.log(`PowerShell host pick → ${PS_HOST_PICK_LINE}`);

  if (leftovers.length) {
    console.log(
      `\nUNCLASSIFIED (${leftovers.length}) — mention a host cache path but not every host; review by hand:`,
    );
    for (const l of leftovers) console.log(`  ${l.rel}:${l.line}  ${l.text}`);
  }

  if (check && changed > 0) {
    console.error(
      `\n--check: ${changed} file(s) still carry the old snippet. Run without --check to rewrite.`,
    );
    process.exit(1);
  }
}

module.exports = {
  NEW_BASE_LINE,
  FALLBACK_LINE,
  OWN_HOST_LINE,
  PS_HOST_PICK_LINE,
  PS_HOST_LIST,
  PS_BLOCK_MARKER,
  psLookupLine,
  rewrite,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
