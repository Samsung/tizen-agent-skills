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
 *   (d) cmd.exe lookup:  dir /s /b "%USERPROFILE%\.claude\…\*X.js" "%USERPROFILE%\.cline\…\*X.js" …
 *                        → dir /s /b "…\.claude\…" 2>nul & dir /s /b "…\.cline\…" 2>nul & … & ver >nul
 *       (one dir per host: a single dir with several paths prints nothing
 *       when any host dir is missing). Only behind `dir /s /b `; a run naming
 *       several runners gets one chain per runner under a single `ver >nul`.
 *   (e) PowerShell — the fenced PowerShell lookup block (skills/agents only):
 *       host pick from HOST_MARKERS, then own host first, then every host,
 *       version-sorted with [version]. The old inline `Get-ChildItem
 *       "…\.claude\…","…\.cline\…" -ErrorAction SilentlyContinue` list is
 *       replaced by the same two lines. The `node` line that follows the lookup
 *       is prefixed with PS_GUARD (`if (-not $CLI) { throw '…' }; `): run on its
 *       own — `$CLI` never set — Windows PowerShell drops the empty `"$CLI"`
 *       argument, node treats the first runner argument as the script path and
 *       fails with a misleading MODULE_NOT_FOUND for `<cwd>\list-templates`; the
 *       guard names the real cause instead. A bare `node "$CLI"` line after a
 *       lookup gains the guard; an existing guard is regenerated. A section
 *       with a fenced cmd.exe lookup but no PowerShell block gets one in (g).
 *   (f) prose: "If neither the `~/.claude` nor the `~/.cline` cache contains the runner"
 *              → "If none of the `~/.claude`, `~/.cline`, … caches contains the runner";
 *       "Pick the highest-version path, then:" → mentions that the PowerShell
 *       form already resolved $CLI;
 *       the cmd.exe / PowerShell block headings → say the cmd chain is cmd.exe
 *       only and the PowerShell lines must not be wrapped in
 *       `powershell -Command "…"` (outer-shell expansion of $CLI / $env:).
 *   (g) block order (skills/agents only) — every lookup section with a fenced
 *       cmd.exe block is re-emitted in a fixed order: SHELL_PICK_LINE (how to
 *       pick the block for your shell), Bash, PowerShell, cmd.exe, then the
 *       `node "<found-path>"` step and the "Runner not found?" note. The model
 *       tends to run the FIRST block it sees — with cmd.exe first, a Cline
 *       PowerShell terminal ran the `&` chain (AmpersandNotAllowed) and then
 *       wrapped the PowerShell block in `powershell -Command "…"` — so the
 *       blocks come in order of how many hosts they serve. A section is the run
 *       of recognised chunks (the headings, the three fences, the pick line,
 *       the note) around the cmd.exe fence, separated only by blank lines;
 *       anything else ends it, and so does a chunk kind the section already
 *       has. Boundaries between two adjacent sections are decided by what can
 *       sit on which side of a cmd.exe fence in BOTH the old (cmd.exe-first)
 *       and the new layout: the shell-pick line only ever opens a section, the
 *       pick line / `node "<found-path>"` step / note only ever follow their
 *       cmd.exe fence, a heading belongs to the fence right after it (and
 *       moves with it), and a Bash / PowerShell fence that names a different
 *       runner than the cmd.exe fence belongs to another section. Hand-written
 *       Bash / cmd.exe headings are canonicalised; a missing PowerShell block
 *       or `node "<found-path>"` step is generated from the cmd.exe fence's
 *       runner name and the node arguments found in the section (a section
 *       whose cmd.exe fence names no `*.js` and has no PowerShell block is
 *       left as it is rather than given a broken one). The indent of the
 *       cmd.exe fence (sections inside list items) is kept on generated lines.
 *
 * After rewriting, any remaining line that mentions a host cache path but not
 * every host is printed under "UNCLASSIFIED" for manual review.
 *
 * Exports NEW_BASE_LINE / FALLBACK_LINE / PS_HOST_PICK_LINE / PS_GUARD /
 * psLookupLine / psNodeLine / rewrite for common/lib/tests/plugin-cache.test.js
 * (drift guard).
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

// (d) cmd.exe: `dir` given several paths prints NOTHING (and exits 1) as soon
//     as one of them sits under a dot-dir that does not exist — and no machine
//     has all four harnesses installed — so the lookup is one `dir` per host,
//     chained with `&`, each with its own `2>nul`; the trailing `ver >nul`
//     resets ERRORLEVEL so a missing last host does not report the listing as
//     failed (issue #227 review). CMD_RUN_RE matches the old one-dir-many-paths
//     run, the chained form, or a mix — but only behind `dir /s /b `, so the
//     same quoted path quoted in prose is left alone. The run is canonicalised
//     to one `dir` per HOST_DOT_DIRS entry for every runner tail it names
//     (tails in first-appearance order; a run that looked up two runners at
//     once becomes two chains under a single `ver >nul`).
//     Group 1 = host name, group 2 = tail after tizen-sdk-skills\.
const HOST_ALT = names.join("|");
const CMD_ARG = `"%USERPROFILE%\\\\\\.(${HOST_ALT})\\\\${esc(CACHE_TAIL_WIN)}\\\\([^"]+)"`;
const CMD_DIR = "dir /s /b ";
const CMD_RUN_RE = new RegExp(
  `${CMD_DIR}${CMD_ARG}(?: 2>nul)?(?: (?:& ${CMD_DIR})?${CMD_ARG}(?: 2>nul)?)*(?: & ver >nul)?`,
  "g",
);
// Every host for one tail, chained: `"…\.claude\…" 2>nul & dir /s /b "…\.cline\…" 2>nul & …`
const cmdChainDirs = (tail) =>
  HOST_DOT_DIRS.map(
    (d) => `"%USERPROFILE%\\${d}\\${CACHE_TAIL_WIN}\\${tail}" 2>nul`,
  ).join(` & ${CMD_DIR}`);
const cmdChainArgs = (tail) => `${cmdChainDirs(tail)} & ver >nul`;
const PS_ARG = `"\\$env:USERPROFILE\\\\\\.(${HOST_ALT})\\\\${esc(CACHE_TAIL_WIN)}\\\\([^"]+)"`;
// Inline PowerShell lookup: Get-ChildItem <run> -ErrorAction SilentlyContinue
const PS_INLINE_RE = new RegExp(
  `Get-ChildItem ${PS_ARG}(?:,${PS_ARG})*(?: -ErrorAction SilentlyContinue)?`,
  "g",
);

function canonicalCmdRun(run) {
  const items = [...run.matchAll(new RegExp(CMD_ARG, "g"))];
  const tails = [...new Set(items.map((m) => m[2]))];
  return `${CMD_DIR}${tails.map(cmdChainDirs).join(` & ${CMD_DIR}`)} & ver >nul`;
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
  `| Sort-Object { [version]$_.Directory.Parent.Parent.Name }, FullName | Select-Object -Last 1 -ExpandProperty FullName; ` +
  `if ($CLI) { break } }`;

// Guard in front of the PowerShell `node "$CLI" …` line. With `$CLI` unset
// (the node line run on its own, or in a fresh session) Windows PowerShell
// drops the empty `"$CLI"` argument altogether, so node gets
// `node list-templates --type native`, treats `list-templates` as the script
// and dies with `Cannot find module '<cwd>\list-templates'` — nothing in that
// message points at the lookup. The guard sits on the SAME line as `node`, so
// it fires even when only that line is pasted. Single quotes: PowerShell must
// not expand anything inside the message.
const PS_GUARD =
  "if (-not $CLI) { throw 'tizen-sdk-skills runner not found: $CLI is empty. Run the two lookup lines above in THIS PowerShell session first; if they still find nothing, the tizen-sdk-skills plugin is not installed.' }";
const psNodeLine = (nodeArgs) => `${PS_GUARD}; node "$CLI"${nodeArgs}`;

// Previously generated PowerShell lines (any marker set / host list) — matched
// so a change in HOST_MARKERS or HOST_DOT_DIRS regenerates them in place.
const CUR_PS_HOST_PICK_RE =
  /\$h = "\.[a-z]+"(?:; if \([^)]*\) \{ \$h = "\.[a-z]+" \})*/g;
const CUR_PS_LOOKUP_SRC = `\\$CLI = \\$null; foreach \\(\\$d in @\\(\\$h(?:, "\\.[a-z]+")*\\)\\) \\{ \\$CLI = Get-ChildItem "\\$env:USERPROFILE\\\\\\$d\\\\${esc(CACHE_TAIL_WIN)}\\\\([^"]+)" -ErrorAction SilentlyContinue \\| Sort-Object \\{ \\[version\\]\\$_\\.Directory\\.Parent\\.Parent\\.Name \\}(?:, FullName)? \\| Select-Object -Last 1 -ExpandProperty FullName; if \\(\\$CLI\\) \\{ break \\} \\}`;
const CUR_PS_LOOKUP_RE = new RegExp(CUR_PS_LOOKUP_SRC, "g");
// A lookup line directly followed by a bare `node "$CLI" …` line (the form
// generated before the guard existed). Group 1 = lookup line, group 2 = the
// lookup's runner tail (inner group of CUR_PS_LOOKUP_SRC), group 3 = the node
// line's indent. Idempotent: once guarded, the next line starts with `if`.
const UNGUARDED_PS_NODE_RE = new RegExp(
  `(${CUR_PS_LOOKUP_SRC})\\n([ \\t]*)node "\\$CLI"`,
  "g",
);
// An existing guard (any message) — regenerated so a wording change propagates.
const CUR_PS_GUARD_RE =
  /if \(-not \$CLI\) \{ throw '[^'\n]*' \}; node "\$CLI"/g;

// Headings around the Windows lookup blocks. The cmd.exe chain (`&`, `2>nul`) is a
// parse error in PowerShell, and a PowerShell block wrapped in
// `powershell -Command "…"` from PowerShell or Git Bash has `$h` / `$CLI` /
// `$env:` expanded by the OUTER shell first, so the inner one receives
// ` = ; foreach ( in @(…` — both seen in Cline on Windows. The headings say so;
// the OLD_* forms are rewritten in place.
const OLD_CMD_HEADING =
  "**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**";
// Two more legacy headings over a fenced cmd.exe lookup (webapp-debug /
// playwright-test, and create-project step 2) that the OLD_CMD_HEADING swap
// missed — they still said "cmd.exe / PowerShell" over the `&` chain.
const OLD_CMD_HEADING_2 =
  "**Cline on Windows ONLY (`execute_command` = cmd.exe / PowerShell, no Bash tool):**";
// `**Windows:**` only when it heads the cmd.exe fence (group 1 = indent,
// group 2 = the blank line(s) + fence open + `cmd /c dir /s /b ` that follow).
const OLD_CMD_HEADING_3_RE =
  /^([ \t]*)\*\*Windows:\*\*(\n+[ \t]*```[a-z]*\n[ \t]*cmd \/c dir \/s \/b )/gm;
// Said "PowerShell block below" / "Bash block below" while cmd.exe led the
// section; (g) now puts cmd.exe last.
const OLD_CMD_HEADING_4 =
  "**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block below instead. Claude Code on Windows runs Git Bash — use the Bash block below:**";
const CMD_BLOCK_HEADING =
  '**Windows — cmd.exe terminal only (Cline with a cmd.exe terminal). `&` and `2>nul` are cmd.exe syntax — in a PowerShell terminal run the PowerShell block above instead; Claude Code on Windows runs Git Bash — use the Bash block above. cmd.exe cannot version-sort, so this only lists every copy: pick your own host\'s highest version and paste it into the `node "<found-path>"` step below:**';
const OLD_PS_BLOCK_HEADING =
  "**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**";
const OLD_PS_BLOCK_HEADING_2 =
  '**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness\'s own cache, then the newest version. Run the lines below as-is in the PowerShell terminal; never wrap them in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**';
const PS_BLOCK_HEADING =
  '**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness\'s own cache, then the newest version. Run all three lines below, in order, in the SAME PowerShell session: the `node` line needs the `$CLI` the lookup line sets (on its own, `node "$CLI" …` becomes `node <first-arg>` and fails with a misleading `MODULE_NOT_FOUND`), so it carries a guard that stops with a clear message when `$CLI` is empty. Never wrap the lines in `powershell -Command "…"` (PowerShell and Git Bash expand `$h`, `$CLI` and `$env:…` before the inner shell runs, so the lookup arrives empty):**';

const PS_BLOCK_MARKER = `foreach ($d in ${PS_HOST_LIST})`;

function psFence(runnerJs, nodeArgs) {
  return [
    "```powershell",
    PS_HOST_PICK_LINE,
    psLookupLine(`*\\lib\\cli\\${runnerJs}`),
    psNodeLine(nodeArgs),
    "```",
  ].join("\n");
}

// (g) block order. Bash and PowerShell resolve `$CLI` themselves and between
//     them cover every host but a cmd.exe terminal, so they lead; the line in
//     front tells the model how to tell the shells apart instead of taking the
//     first block.
const SHELL_PICK_LINE =
  '**Pick the ONE block for the shell your terminal / tool runs — the prompt tells you: `$` is Bash (Linux, macOS, Claude Code\'s Git Bash on Windows, Codex on Linux / macOS) → Bash block; `PS C:\\…>` is PowerShell (Codex on Windows, Cline PowerShell terminal) → PowerShell block; `C:\\…>` is cmd.exe (Cline cmd.exe terminal) → cmd.exe block. Run that block as-is: a block pasted into another shell, or wrapped in `powershell -Command "…"`, is a parse error.**';
const BASH_BLOCK_HEADING =
  "**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**";
// Hand-written headings over a Bash lookup fence, canonicalised to BASH_BLOCK_HEADING.
const BASH_HEADING_RE =
  /^\*\*(?:Bash — |Linux \/ macOS|Claude Code — Bash tool)[^\n]*:\*\*$/;
const CMD_HEADING_LEAD = CMD_BLOCK_HEADING.slice(
  0,
  CMD_BLOCK_HEADING.indexOf(" ("),
);
const CMD_FENCE_LINE_RE = /^cmd \/c dir \/s \/b /;
// The runner a lookup fence names: the first `<name>.js` behind a path
// separator or the cmd.exe `*` glob (`\*x-cli.js`, `\lib\cli\x-cli.js`,
// `/lib/cli/x-cli.js`), followed by a quote, whitespace or the end of line.
const RUNNER_JS_RE = /(?<=[\\/*])([\w-]+\.js)(?=["\s]|$)/m;
const fenceRunner = (text) => (text.match(RUNNER_JS_RE) || [])[1] || null;

// Section grammar. A heading belongs to the fence right after it; `pick`,
// `nodeFound` and `notFound` only ever follow their cmd.exe fence (old and
// new layout alike); the shell-pick line only ever opens a section.
const HEAD_FENCE = {
  bashHead: "bashFence",
  psHead: "psFence",
  cmdHead: "cmdFence",
};
const TAIL_KINDS = new Set(["pick", "nodeFound", "notFound"]);
const RUNNER_FENCES = new Set(["bashFence", "psFence", "cmdFence"]);

// Chunks: a fenced block (kept whole, blank lines inside included), a
// paragraph (non-blank lines up to a blank line or a fence), or a run of blank
// lines. Joining the chunk texts with "\n" gives the input back.
function splitChunks(text) {
  const lines = text.split("\n");
  const chunks = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    if (/^[ \t]*```/.test(lines[i])) {
      j = i + 1;
      while (j < lines.length && !/^[ \t]*```\s*$/.test(lines[j])) j++;
      j = Math.min(j + 1, lines.length);
      chunks.push({ kind: "fence", text: lines.slice(i, j).join("\n") });
    } else if (lines[i].trim() === "") {
      while (j < lines.length && lines[j].trim() === "") j++;
      chunks.push({ kind: "blank", text: lines.slice(i, j).join("\n") });
    } else {
      while (
        j < lines.length &&
        lines[j].trim() !== "" &&
        !/^[ \t]*```/.test(lines[j])
      ) {
        j++;
      }
      chunks.push({ kind: "para", text: lines.slice(i, j).join("\n") });
    }
    i = j;
  }
  return chunks;
}

function classifyChunk(c) {
  if (c.kind === "blank") return "blank";
  const t = c.text.trim();
  if (c.kind === "fence") {
    const ls = c.text.split("\n");
    const open = ls[0].trim();
    const body = ls.slice(1, -1);
    const first = (body[0] || "").trim();
    if (CMD_FENCE_LINE_RE.test(first)) return "cmdFence";
    if (first.startsWith('node "<found-path>"')) return "nodeFound";
    if (
      open === "```powershell" &&
      body.some((l) => l.includes(PS_BLOCK_MARKER))
    ) {
      return "psFence";
    }
    if (open === "```bash" && body.some((l) => l.trim() === NEW_BASE_LINE)) {
      return "bashFence";
    }
    return null;
  }
  // The prefix-matched kinds are re-emitted from their canonical text, so a
  // paragraph that carries more lines under the heading / pick line must not
  // match (its extra lines would be dropped); it ends the section instead.
  const oneLine = !t.includes("\n");
  if (t === SHELL_PICK_LINE) return "shellPick";
  if (t === PS_BLOCK_HEADING) return "psHead";
  if (oneLine && t.startsWith(CMD_HEADING_LEAD) && t.endsWith(":**")) {
    return "cmdHead";
  }
  if (BASH_HEADING_RE.test(t)) return "bashHead";
  if (oneLine && t.startsWith("Pick the highest-version path")) return "pick";
  if (t.startsWith("> **Runner not found?**")) return "notFound";
  return null;
}

// Classify every chunk, record the runner a lookup fence names, and bind each
// heading to the fence right after it (blank lines between allowed) — a
// heading with no such fence is not part of any section.
function annotateChunks(text) {
  const chunks = splitChunks(text).map((c) => ({
    ...c,
    cls: classifyChunk(c),
  }));
  for (const c of chunks) {
    c.runner = RUNNER_FENCES.has(c.cls) ? fenceRunner(c.text) : null;
  }
  chunks.forEach((c, j) => {
    const fence = HEAD_FENCE[c.cls];
    if (!fence) return;
    let n = j + 1;
    while (n < chunks.length && chunks[n].cls === "blank") n++;
    if (n < chunks.length && chunks[n].cls === fence) c.pair = n;
    else c.cls = null;
  });
  return chunks;
}

// The text after `prefix` on the first line of `text` that carries it.
function argsAfter(text, prefix) {
  if (!text) return null;
  const line = text.split("\n").find((l) => l.includes(prefix));
  return line == null ? null : line.slice(line.indexOf(prefix) + prefix.length);
}

// Re-emit one section (chunks lo..hi, each kind at most once) in canonical
// order. Returns null when the section cannot be completed — no PowerShell
// block and no runner name in the cmd.exe fence to generate one from — so
// the caller leaves it untouched instead of emitting `\lib\cli\undefined`.
function renderSection(blocks) {
  const by = {};
  for (const b of blocks) {
    if (b.cls !== "blank" && !(b.cls in by)) by[b.cls] = b;
  }
  const cmd = by.cmdFence;
  if (!by.psFence && !cmd.runner) return null;
  const text = (cls) => (by[cls] ? by[cls].text : null);
  const nodeArgs =
    argsAfter(text("nodeFound"), 'node "<found-path>"') ??
    argsAfter(text("psFence"), 'node "$CLI"') ??
    argsAfter(text("bashFence"), 'node "$CLI"') ??
    "";
  // Generated lines take the cmd.exe fence's indent (sections in list items);
  // existing chunks already carry their own.
  const indent = /^[ \t]*/.exec(cmd.text)[0];
  const ind = (s) =>
    s
      .split("\n")
      .map((l) => indent + l)
      .join("\n");
  const parts = [ind(SHELL_PICK_LINE)];
  if (by.bashFence) parts.push(ind(BASH_BLOCK_HEADING), by.bashFence.text);
  parts.push(
    ind(PS_BLOCK_HEADING),
    text("psFence") ?? ind(psFence(cmd.runner, nodeArgs)),
  );
  parts.push(ind(CMD_BLOCK_HEADING), cmd.text);
  parts.push(
    ind(NEW_PICK_THEN),
    text("nodeFound") ?? ind(`\`\`\`\nnode "<found-path>"${nodeArgs}\n\`\`\``),
  );
  if (by.notFound) parts.push(by.notFound.text);
  return parts.join("\n\n");
}

function reorderLookupSections(text) {
  const chunks = annotateChunks(text);
  const out = [];
  let i = 0;
  while (i < chunks.length) {
    let k = i;
    while (k < chunks.length && chunks[k].cls !== "cmdFence") k++;
    if (k === chunks.length) break;
    // Grow the section from the cmd.exe fence over recognised chunks, each
    // kind at most once. An unknown chunk, a repeat, or a chunk that cannot
    // sit on this side of the fence (see HEAD_FENCE / TAIL_KINDS) ends it;
    // the backward pass is also bounded by the previous section (`i - 1`).
    const runner = chunks[k].runner;
    const sameRunner = (c) => !runner || !c.runner || c.runner === runner;
    const seen = new Set(["cmdFence"]);
    const accepts = (c, step) => {
      if (!c.cls || seen.has(c.cls)) return false;
      if (step > 0 && c.cls === "shellPick") return false;
      if (step < 0 && TAIL_KINDS.has(c.cls)) return false;
      if (c.kind === "fence") return sameRunner(c);
      // A heading moves with its fence: going forward, that fence must still
      // be free for this section; going backward it was taken just before.
      if (c.cls in HEAD_FENCE && step > 0) {
        const f = chunks[c.pair];
        return !seen.has(f.cls) && sameRunner(f);
      }
      return true;
    };
    const grow = (step, stop) => {
      let edge = k;
      for (let j = k + step; j !== stop; j += step) {
        const c = chunks[j];
        if (c.cls === "blank") continue;
        if (!accepts(c, step)) break;
        seen.add(c.cls);
        edge = j;
      }
      return edge;
    };
    const lo = grow(-1, i - 1);
    const hi = grow(1, chunks.length);
    out.push(...chunks.slice(i, lo).map((c) => c.text));
    const section = renderSection(chunks.slice(lo, hi + 1));
    if (section === null)
      out.push(...chunks.slice(lo, hi + 1).map((c) => c.text));
    else out.push(section);
    i = hi + 1;
  }
  out.push(...chunks.slice(i).map((c) => c.text));
  return out.join("\n");
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
  out = out.replace(CMD_RUN_RE, canonicalCmdRun);
  out = replaceInlinePs(out);
  out = out.replace(CUR_PS_HOST_PICK_RE, PS_HOST_PICK_LINE);
  out = out.replace(CUR_PS_LOOKUP_RE, (_m, tail) => psLookupLine(tail));
  out = out.replace(
    UNGUARDED_PS_NODE_RE,
    (_m, lookup, _tail, indent) =>
      `${lookup}\n${indent}${PS_GUARD}; node "$CLI"`,
  );
  out = out.replace(CUR_PS_GUARD_RE, () => `${PS_GUARD}; node "$CLI"`);
  out = out.split(OLD_PROSE).join(NEW_PROSE);
  out = out.split(OLD_CMD_HEADING).join(CMD_BLOCK_HEADING);
  out = out.split(OLD_PS_BLOCK_HEADING).join(PS_BLOCK_HEADING);
  out = out.split(OLD_PS_BLOCK_HEADING_2).join(PS_BLOCK_HEADING);
  out = out.split(OLD_CMD_HEADING_2).join(CMD_BLOCK_HEADING);
  out = out.replace(
    OLD_CMD_HEADING_3_RE,
    (_m, indent, rest) => `${indent}${CMD_BLOCK_HEADING}${rest}`,
  );
  out = out.split(OLD_CMD_HEADING_4).join(CMD_BLOCK_HEADING);
  out = out.split(OLD_PICK_THEN).join(NEW_PICK_THEN);
  out = out.split(OLD_PICK_RESULTS).join(NEW_PICK_RESULTS);
  // Last: the section parser relies on the headings being canonical.
  if (psBlocks) out = reorderLookupSections(out);
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
  cmdChainDirs,
  cmdChainArgs,
  PS_HOST_PICK_LINE,
  PS_HOST_LIST,
  PS_BLOCK_MARKER,
  CMD_BLOCK_HEADING,
  PS_BLOCK_HEADING,
  BASH_BLOCK_HEADING,
  SHELL_PICK_LINE,
  PS_GUARD,
  psLookupLine,
  psNodeLine,
  rewrite,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
