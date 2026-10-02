// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * plugin-cache tests
 *
 * Covers the host-cache resolution surface of core/plugin-cache.js:
 *   - detectHostDotDir: env var → dot-dir mapping for every harness, including
 *     the Codex CLI markers (issue #41: Codex used to fall through to .cline and
 *     end up running another host's copy of the runner)
 *   - orderedCacheRoots: own host first, then every other HOST_DOT_DIRS entry
 *     exactly once, all under ~/<dot>/plugins/cache/tizen-platform/tizen-sdk-skills
 *   - findLatestVersionDir fallback scan (step 4) prefers this host's own cache
 *     even when other hosts have a copy too
 *   - Drift guard: every runner-lookup snippet shipped in agents/ and skills/
 *     is exactly what scripts/rewrite-runner-snippets.js renders from
 *     HOST_DOT_DIRS / HOST_MARKERS (bash host pick, per-host fallback, PowerShell
 *     host pick + lookup), and none still carries a whole-path sort.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  HOST_DOT_DIRS,
  HOST_MARKERS,
  HOST_DETECT_ORDER,
  DEFAULT_HOST_DOT_DIR,
  detectHostDotDir,
  orderedCacheRoots,
} = require("../core/plugin-cache");

console.log("=== plugin-cache Test ===\n");

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

const cacheSuffix = path.join(
  "plugins",
  "cache",
  "tizen-platform",
  "tizen-sdk-skills",
);
const dotOf = (root) =>
  path.basename(path.dirname(path.dirname(path.dirname(path.dirname(root)))));
const ALL_MARKERS = Object.values(HOST_MARKERS).flat();

// Test 0: the marker table itself
console.log("Test 0: HOST_MARKERS / HOST_DETECT_ORDER");
check(
  "  every HOST_DOT_DIRS entry has a HOST_MARKERS row",
  HOST_DOT_DIRS.every((d) => Array.isArray(HOST_MARKERS[d])),
  true,
);
check(
  "  HOST_DETECT_ORDER lists exactly the hosts that have markers",
  [...HOST_DETECT_ORDER].sort(),
  HOST_DOT_DIRS.filter((d) => HOST_MARKERS[d].length > 0).sort(),
);
check(
  "  the default host has no marker",
  HOST_MARKERS[DEFAULT_HOST_DOT_DIR],
  [],
);
check(
  "  Codex CLI has markers (issue #41)",
  HOST_MARKERS[".codex"].length > 0,
  true,
);

// Test 1: detectHostDotDir
console.log("\nTest 1: detectHostDotDir");
check(
  "  CLAUDECODE → .claude",
  detectHostDotDir({ CLAUDECODE: "1" }),
  ".claude",
);
check(
  "  GEMINI_CLI → .gemini",
  detectHostDotDir({ GEMINI_CLI: "1" }),
  ".gemini",
);
for (const marker of HOST_MARKERS[".codex"]) {
  check(`  ${marker} → .codex`, detectHostDotDir({ [marker]: "x" }), ".codex");
}
check(
  "  no marker → .cline (historical default)",
  detectHostDotDir({}),
  ".cline",
);
check(
  "  empty-string marker does not count",
  detectHostDotDir({ CODEX_THREAD_ID: "" }),
  ".cline",
);
check(
  "  CLAUDECODE wins over GEMINI_CLI when both set",
  detectHostDotDir({ CLAUDECODE: "1", GEMINI_CLI: "1" }),
  ".claude",
);
check(
  "  CLAUDECODE wins over CODEX_THREAD_ID (Codex launched from Claude Code)",
  detectHostDotDir({ CLAUDECODE: "1", CODEX_THREAD_ID: "t" }),
  ".claude",
);

// Test 2: orderedCacheRoots
console.log("\nTest 2: orderedCacheRoots");
check("  HOST_DOT_DIRS lists all four harnesses", HOST_DOT_DIRS, [
  ".claude",
  ".cline",
  ".codex",
  ".gemini",
]);
for (const [label, env, first] of [
  ["Claude Code", { CLAUDECODE: "1" }, ".claude"],
  ["Gemini CLI", { GEMINI_CLI: "1" }, ".gemini"],
  ["Codex CLI", { CODEX_THREAD_ID: "t" }, ".codex"],
  [
    "Codex CLI (sandbox marker only)",
    { CODEX_SANDBOX_NETWORK_DISABLED: "1" },
    ".codex",
  ],
  ["Cline (no marker)", {}, ".cline"],
]) {
  const roots = orderedCacheRoots(env);
  const dots = roots.map(dotOf);
  check(`  ${label}: own root first`, dots[0], first);
  check(
    `  ${label}: every dot-dir exactly once`,
    [...dots].sort(),
    [...HOST_DOT_DIRS].sort(),
  );
  check(
    `  ${label}: all roots under ~/<dot>/${cacheSuffix.split(path.sep).join("/")}`,
    roots.every(
      (r) =>
        r.startsWith(os.homedir()) &&
        r.endsWith(path.join(dotOf(r), cacheSuffix)),
    ),
    true,
  );
}
check(
  "  no-marker order keeps the legacy .cline, .claude prefix",
  orderedCacheRoots({}).slice(0, 2).map(dotOf),
  [".cline", ".claude"],
);

// Test 3: findLatestVersionDir fallback scan prefers this host's own cache.
// Run in a child process with HOME/USERPROFILE pointed at a temp dir so the
// module-level CACHE_ROOTS is computed against it, and TIZEN_SDK_SKILLS_ROOT
// unset so steps 1-3 cannot short-circuit. Step 3 (module-relative) still
// resolves in the repo checkout, so we copy the module into the temp home to
// defeat it and exercise step 4 alone. Every marker host has a copy, so the
// only way to land on the right one is to detect the host.
console.log("\nTest 3: findLatestVersionDir fallback scan (isolated HOME)");
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-cache-test-"));
  const results = {};
  try {
    for (const dot of [".claude", ".codex", ".gemini"]) {
      const root = path.join(home, dot, cacheSuffix);
      // Two versions plus a non-version sibling; 10.0.0 must beat 2.0.0.
      for (const v of ["2.0.0", "10.0.0", "docs"]) {
        fs.mkdirSync(path.join(root, v, "scripts"), { recursive: true });
      }
    }
    // Isolated copy of the module so <__dirname>/../../scripts does not exist.
    const isoCore = path.join(home, "iso", "lib", "core");
    fs.mkdirSync(isoCore, { recursive: true });
    // plugin-cache.js requires ./job-paths (job-aware execPluginScript) — the
    // isolated copy needs it beside it.
    fs.copyFileSync(
      path.join(__dirname, "..", "core", "job-paths.js"),
      path.join(isoCore, "job-paths.js"),
    );
    fs.copyFileSync(
      path.join(__dirname, "..", "core", "plugin-cache.js"),
      path.join(isoCore, "plugin-cache.js"),
    );
    const script = `
      const pc = require(${JSON.stringify(path.join(isoCore, "plugin-cache.js"))});
      process.stdout.write(JSON.stringify(pc.findLatestVersionDir()));
    `;
    for (const [label, env, expectDot] of [
      ["CLAUDECODE → ~/.claude/…/10.0.0", { CLAUDECODE: "1" }, ".claude"],
      ["GEMINI_CLI → ~/.gemini/…/10.0.0", { GEMINI_CLI: "1" }, ".gemini"],
      [
        "CODEX_THREAD_ID → ~/.codex/…/10.0.0",
        { CODEX_THREAD_ID: "t" },
        ".codex",
      ],
      [
        "CODEX_SANDBOX_NETWORK_DISABLED → ~/.codex/…/10.0.0",
        { CODEX_SANDBOX_NETWORK_DISABLED: "1" },
        ".codex",
      ],
      [
        "no marker, no .cline copy → first host in HOST_DOT_DIRS (.claude)",
        {},
        ".claude",
      ],
    ]) {
      const childEnv = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
      };
      delete childEnv.TIZEN_SDK_SKILLS_ROOT;
      // Scrub every host marker the test process itself may be running under
      // (this suite runs inside Claude Code, Codex, …), then apply the case's.
      for (const name of ALL_MARKERS) delete childEnv[name];
      Object.assign(childEnv, env);
      const r = spawnSync(process.execPath, ["-e", script], {
        env: childEnv,
        encoding: "utf-8",
      });
      results[label] = r.status === 0 ? JSON.parse(r.stdout) : r.stderr;
      check(
        `  ${label}`,
        results[label],
        path.join(home, expectDot, cacheSuffix, "10.0.0"),
      );
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// Test 4: drift guard — the markdown runner-lookup snippets must be exactly
// what scripts/rewrite-runner-snippets.js renders from plugin-cache.js. The
// script lives at the repo root, so this part only runs in a checkout (a cache
// copy of lib/tests has no ../../../scripts).
console.log("\nTest 4: agents/ + skills/ snippets match the generated forms");
{
  const commonDir = path.join(__dirname, "..", "..");
  const rewriteScript = path.join(
    commonDir,
    "..",
    "scripts",
    "rewrite-runner-snippets.js",
  );
  if (!fs.existsSync(rewriteScript)) {
    console.log(
      "  SKIP: scripts/rewrite-runner-snippets.js not present (not a repo checkout)",
    );
  } else {
    const gen = require(rewriteScript);
    const mdFiles = [];
    for (const f of fs.readdirSync(path.join(commonDir, "agents"))) {
      if (f.endsWith(".md")) mdFiles.push(path.join(commonDir, "agents", f));
    }
    for (const d of fs.readdirSync(path.join(commonDir, "skills"))) {
      const p = path.join(commonDir, "skills", d, "SKILL.md");
      if (fs.existsSync(p)) mdFiles.push(p);
    }

    const cacheTail = "plugins/cache/tizen-platform/tizen-sdk-skills/";
    // group 1 = tail after tizen-sdk-skills\ (e.g. *\lib\cli\x-cli.js)
    const CMD_ARG_RE =
      /"%USERPROFILE%\\\.[a-z]+\\plugins\\cache\\tizen-platform\\tizen-sdk-skills\\([^"]+)"/g;
    const stale = [];
    const incomplete = [];
    let withBase = 0;
    let withCmd = 0;
    for (const file of mdFiles) {
      const text = fs.readFileSync(file, "utf-8");
      const rel = path.relative(commonDir, file).split(path.sep).join("/");
      const lines = text.split("\n");

      // (a) a whole-path sort over the host glob — the .gemini-always-wins bug
      //     (snippets inside list items are indented, hence the trim)
      if (
        lines.some((l) =>
          /^(?:\[ -n "\$[A-Z_]+" \] \|\| )?[A-Z_]+=\$\(ls "\$HOME"\/\.\{[a-z,]+\}\/.*\| sort/.test(
            l.trim(),
          ),
        )
      ) {
        stale.push(`${rel} (whole-path sort over the host glob)`);
      }
      // (b) every bash host-pick line is the generated one
      for (const raw of lines) {
        const l = raw.trim();
        if (/^BASE="\$HOME\//.test(l)) {
          withBase++;
          if (l !== gen.NEW_BASE_LINE) stale.push(`${rel} (BASE line)`);
        }
        // (c) every bash fallback lists every host, in order
        if (/^\[ -n "\$[A-Z_]+" \] \|\| for d in /.test(l)) {
          const m = l.match(/for d in ([ .a-z]+); do/);
          if (!m || m[1] !== HOST_DOT_DIRS.join(" ")) {
            incomplete.push(`${rel} (fallback host list)`);
          }
        }
      }
      // (d) every cmd.exe lookup lists every dot-dir and is paired with the
      //     PowerShell host-preferring lookup
      if (text.includes("%USERPROFILE%\\.claude\\plugins\\cache")) {
        withCmd++;
        for (const dot of HOST_DOT_DIRS) {
          if (!text.includes(`%USERPROFILE%\\${dot}\\plugins\\cache`)) {
            incomplete.push(`${rel} (cmd lookup lacks ${dot})`);
          }
        }
        // Every cmd lookup line is checked on its own, per runner tail, against
        // the generated chain: one `dir` per host (a single dir given several
        // paths prints nothing when any host dir is missing), every host in
        // HOST_DOT_DIRS order with its own `2>nul`, then `& ver >nul`. A
        // second lookup on the same line, or a run that names two runners,
        // cannot hide behind one valid chain elsewhere in the file.
        for (const raw of lines) {
          if (!raw.includes('dir /s /b "%USERPROFILE%\\')) continue;
          if (
            /"%USERPROFILE%\\\.[a-z]+\\plugins\\cache\\[^"]+"\s+"%USERPROFILE%\\/.test(
              raw,
            )
          ) {
            stale.push(
              `${rel} (one dir with several paths — prints nothing when a host dir is missing)`,
            );
          }
          const tails = new Set([...raw.matchAll(CMD_ARG_RE)].map((m) => m[1]));
          for (const tail of tails) {
            if (!raw.includes(`dir /s /b ${gen.cmdChainDirs(tail)}`)) {
              incomplete.push(
                `${rel} (cmd lookup for ${tail} is not one dir per host in HOST_DOT_DIRS order)`,
              );
            }
          }
          if (!raw.includes(" 2>nul & ver >nul")) {
            incomplete.push(
              `${rel} (cmd lookup does not end in \`& ver >nul\`)`,
            );
          }
        }
        // Every fenced cmd.exe lookup sits under the generated "cmd.exe
        // terminal only" heading and every fenced PowerShell block under the
        // generated PowerShell heading: a heading the generator does not know
        // keeps saying "cmd.exe / PowerShell" over the `&` chain (seen in
        // webapp-debug / playwright-test / create-project step 2). The cmd
        // heading is matched on its lead-in — "**Windows — cmd.exe terminal
        // only" — so a hand-written variant that adds context (dlog-analyzer's
        // step ①/② note) passes as long as it keeps that claim.
        const cmdHeadingLead = gen.CMD_BLOCK_HEADING.slice(
          0,
          gen.CMD_BLOCK_HEADING.indexOf(" ("),
        );
        const headingAbove = (i) => {
          let j = i - 1;
          while (
            j >= 0 &&
            (lines[j].trim() === "" || lines[j].trim().startsWith("```"))
          ) {
            j--;
          }
          return j >= 0 ? lines[j].trim() : "";
        };
        lines.forEach((raw, i) => {
          if (/^cmd \/c dir \/s \/b /.test(raw.trim())) {
            if (!headingAbove(i).startsWith(cmdHeadingLead)) {
              stale.push(
                `${rel}:${i + 1} (fenced cmd.exe lookup not under the cmd.exe-only heading)`,
              );
            }
          }
          if (
            raw.trim() === "```powershell" &&
            (lines[i + 1] || "").includes(gen.PS_HOST_PICK_LINE) &&
            headingAbove(i) !== gen.PS_BLOCK_HEADING
          ) {
            stale.push(
              `${rel}:${i + 1} (fenced PowerShell block not under the generated PowerShell heading)`,
            );
          }
        });
        // (g) block order: every fenced cmd.exe lookup is the LAST of the
        // three shell blocks — its section opens with the shell-pick line,
        // then Bash, then PowerShell, then cmd.exe (the model tends to run
        // the first block it sees; Bash and PowerShell serve far more hosts).
        // Each section has its own shell-pick line (none shared by two
        // cmd.exe fences), and the section's Bash fence sits under the
        // generated Bash heading. Inline cmd lookups (the agents' 2-step
        // list) are not fenced and are not sections.
        const lastBefore = (i, pred) => {
          for (let j = i - 1; j >= 0; j--) if (pred(lines[j])) return j;
          return -1;
        };
        lines.forEach((raw, i) => {
          if (!/^cmd \/c dir \/s \/b /.test(raw.trim())) return;
          const prevCmd = lastBefore(i, (l) =>
            /^cmd \/c dir \/s \/b /.test(l.trim()),
          );
          const ps = lastBefore(i, (l) => l.includes(gen.PS_BLOCK_MARKER));
          const bash = lastBefore(i, (l) => l.trim() === gen.NEW_BASE_LINE);
          const pick = lastBefore(i, (l) => l.trim() === gen.SHELL_PICK_LINE);
          if (!(prevCmd < pick && pick < bash && bash < ps)) {
            stale.push(
              `${rel}:${i + 1} (cmd.exe lookup must follow the shell-pick line, the Bash block and the PowerShell block, in that order)`,
            );
          } else {
            const open = lastBefore(bash, (l) => l.trim().startsWith("```"));
            if (
              open < 0 ||
              lines[open].trim() !== "```bash" ||
              headingAbove(open) !== gen.BASH_BLOCK_HEADING
            ) {
              stale.push(
                `${rel}:${bash + 1} (the section's Bash lookup is not a fenced block under the generated Bash heading)`,
              );
            }
          }
        });
        if (!text.includes(gen.PS_HOST_PICK_LINE)) {
          incomplete.push(`${rel} (PowerShell host pick missing or stale)`);
        }
        if (!text.includes(gen.PS_BLOCK_MARKER)) {
          incomplete.push(`${rel} (PowerShell lookup missing or stale)`);
        }
        // A `node "$CLI" …` line after a PowerShell lookup carries the
        // empty-$CLI guard on the SAME line: pasted alone, Windows PowerShell
        // drops the empty argument and node fails with a misleading
        // MODULE_NOT_FOUND for `<cwd>\<first-arg>` (seen with
        // `list-templates --type native`). The inline one-line lookup in the
        // agents' 2-step procedure is followed by `node "<found-path>"`, not
        // `node "$CLI"`, and is left alone.
        lines.forEach((raw, i) => {
          if (!raw.includes(gen.PS_BLOCK_MARKER)) return;
          const next = (lines[i + 1] || "").trim();
          if (next.startsWith('node "$CLI"')) {
            incomplete.push(
              `${rel}:${i + 2} (PowerShell node line after the lookup lacks the empty-$CLI guard)`,
            );
          } else if (
            next.includes('node "$CLI"') &&
            !next.startsWith(`${gen.PS_GUARD}; node "$CLI"`)
          ) {
            incomplete.push(
              `${rel}:${i + 2} (PowerShell node line carries a stale guard)`,
            );
          }
        });
      }
      // (e) the whole file is a fixed point of the generator
      const psBlocks = true; // agents/ and skills/ both get the PS block
      if (gen.rewrite(text, { psBlocks }) !== text) {
        stale.push(`${rel} (rewrite-runner-snippets.js would change it)`);
      }
      // Legacy prose that names only two hosts
      if (text.includes(`.{claude,cline}/${cacheTail}`)) {
        stale.push(`${rel} (two-host brace glob)`);
      }
    }
    check(
      `  scanned ${mdFiles.length} markdown files (>= 40)`,
      mdFiles.length >= 40,
      true,
    );
    check(`  bash host-pick lines found (>= 40)`, withBase >= 40, true);
    check(`  cmd.exe lookups found (>= 25)`, withCmd >= 25, true);
    check("  no file still carries a stale snippet", stale, []);
    check("  every lookup snippet lists all HOST_DOT_DIRS", incomplete, []);
    check(
      "  generated BASE line names every marker host",
      HOST_DETECT_ORDER.every((d) =>
        gen.NEW_BASE_LINE.includes(`|| BASE="$HOME/${d}"`),
      ),
      true,
    );
    check(
      "  generated BASE line probes every marker",
      ALL_MARKERS.every((m) => gen.NEW_BASE_LINE.includes(`\${${m}:-}`)),
      true,
    );
    check(
      "  generated PowerShell host pick probes every marker",
      ALL_MARKERS.every((m) => gen.PS_HOST_PICK_LINE.includes(`$env:${m}`)),
      true,
    );

    // --check is the same guard for docs/ and scripts/ too.
    const r = spawnSync(process.execPath, [rewriteScript, "--check"], {
      encoding: "utf-8",
      cwd: path.dirname(path.dirname(rewriteScript)),
    });
    check(
      "  node scripts/rewrite-runner-snippets.js --check exits 0",
      r.status,
      0,
    );

    // Test 5: the cmd.exe canonicaliser itself — old, chained, mixed and
    // two-runner runs all land on the generated chain; a path quoted in prose
    // (not behind `dir /s /b `) is not a lookup and is left alone.
    console.log("\nTest 5: cmd.exe lookup canonicalisation");
    const P = (dot, tail) =>
      `"%USERPROFILE%\\${dot}\\plugins\\cache\\tizen-platform\\tizen-sdk-skills\\${tail}"`;
    const X = "*\\lib\\cli\\x-cli.js";
    const Y = "*\\lib\\cli\\y-cli.js";
    const chainX = `dir /s /b ${gen.cmdChainArgs(X)}`;
    const rw = (s) => gen.rewrite(s, { psBlocks: false });
    check(
      "  old one-dir-many-paths run → one dir per host",
      rw(`cmd /c dir /s /b ${P(".claude", X)} ${P(".cline", X)}`),
      `cmd /c ${chainX}`,
    );
    check(
      "  chained run without `ver >nul` gains it and every host",
      rw(
        `dir /s /b ${P(".claude", X)} 2>nul & dir /s /b ${P(".cline", X)} 2>nul`,
      ),
      chainX,
    );
    check(
      "  mixed old/chained run is canonicalised",
      rw(
        `dir /s /b ${P(".claude", X)} 2>nul & dir /s /b ${P(".cline", X)} ${P(".codex", X)}`,
      ),
      chainX,
    );
    check(
      "  run naming two runners → one chain per runner, single `ver >nul`",
      rw(`dir /s /b ${P(".claude", X)} ${P(".cline", Y)} ${P(".codex", X)}`),
      `dir /s /b ${gen.cmdChainDirs(X)} & dir /s /b ${gen.cmdChainDirs(Y)} & ver >nul`,
    );
    check(
      "  hosts out of order / repeated are normalised to HOST_DOT_DIRS order",
      rw(`dir /s /b ${P(".gemini", X)} ${P(".claude", X)} ${P(".gemini", X)}`),
      chainX,
    );
    check(
      "  a cache path quoted in prose is not rewritten",
      rw(`the runner lives under ${P(".claude", X)} on Windows`),
      `the runner lives under ${P(".claude", X)} on Windows`,
    );
    check("  the generated chain is a fixed point", rw(chainX), chainX);

    // Test 6: lookup section order — a cmd.exe-first section is re-emitted
    // as shell-pick → Bash → PowerShell → cmd.exe → node step → note, a
    // hand-written Bash heading is canonicalised, a section without a
    // PowerShell block or a `node "<found-path>"` step gains them (node
    // arguments taken from the Bash block), and the result is a fixed point.
    console.log("\nTest 6: lookup section order");
    const rwAll = (s) => gen.rewrite(s, { psBlocks: true });
    const bashFence = [
      "```bash",
      gen.NEW_BASE_LINE,
      gen.OWN_HOST_LINE("CLI", "lib/cli/x-cli.js"),
      gen.FALLBACK_LINE("CLI", "lib/cli/x-cli.js"),
      'node "$CLI" run --flag',
      "```",
    ].join("\n");
    const cmdFence = `\`\`\`\ncmd /c ${chainX}\n\`\`\``;
    const psFenceX = [
      "```powershell",
      gen.PS_HOST_PICK_LINE,
      gen.psLookupLine(X),
      gen.psNodeLine(" run --flag"),
      "```",
    ].join("\n");
    const nodeFound = '```\nnode "<found-path>" run --flag\n```';
    const note = "> **Runner not found?** Install the plugin first.";
    const pickThen =
      "Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:";
    const section = (withNote) =>
      [
        gen.SHELL_PICK_LINE,
        gen.BASH_BLOCK_HEADING,
        bashFence,
        gen.PS_BLOCK_HEADING,
        psFenceX,
        gen.CMD_BLOCK_HEADING,
        cmdFence,
        pickThen,
        nodeFound,
        ...(withNote ? [note] : []),
      ].join("\n\n");
    const wrap = (body) => `intro\n\n${body}\n\n### Next`;
    const oldOrder = wrap(
      [
        gen.CMD_BLOCK_HEADING,
        cmdFence,
        gen.PS_BLOCK_HEADING,
        psFenceX,
        note,
        pickThen,
        nodeFound,
        "**Linux / macOS / Ubuntu:**",
        bashFence,
      ].join("\n\n"),
    );
    check(
      "  cmd.exe-first section → shell-pick, Bash, PowerShell, cmd.exe, node step, note",
      rwAll(oldOrder),
      wrap(section(true)),
    );
    check(
      "  the reordered section is a fixed point",
      rwAll(wrap(section(true))),
      wrap(section(true)),
    );
    check(
      "  a section with only cmd.exe + Bash gains the PowerShell block and the node step",
      rwAll(wrap([gen.CMD_BLOCK_HEADING, cmdFence, bashFence].join("\n\n"))),
      wrap(section(false)),
    );
    // The Bash block beyond the prose is not part of the section, so the
    // generated PowerShell / node lines have no node arguments to copy.
    check(
      "  a paragraph between the blocks ends the section (nothing beyond it moves)",
      rwAll(
        wrap(
          [gen.CMD_BLOCK_HEADING, cmdFence, "Unrelated prose.", bashFence].join(
            "\n\n",
          ),
        ),
      ),
      wrap(
        [
          gen.SHELL_PICK_LINE,
          gen.PS_BLOCK_HEADING,
          psFenceX.replace(` run --flag\n\`\`\``, "\n```"),
          gen.CMD_BLOCK_HEADING,
          cmdFence,
          pickThen,
          '```\nnode "<found-path>"\n```',
          "Unrelated prose.",
          bashFence,
        ].join("\n\n"),
      ),
    );
    // Section boundaries. Two sections for different runners that touch
    // (blank lines only between them) must not share blocks: the X section
    // has no Bash block, so without the runner check it would take the Y
    // section's Bash block. The Y section is hand-written in the new order
    // without the shell-pick line, so the line's uniqueness cannot save it.
    const cmdFenceY = `\`\`\`\ncmd /c dir /s /b ${gen.cmdChainArgs(Y)}\n\`\`\``;
    const bashFenceY = bashFence
      .split("x-cli.js")
      .join("y-cli.js")
      .replace(" run --flag", " go");
    const psFenceY = [
      "```powershell",
      gen.PS_HOST_PICK_LINE,
      gen.psLookupLine(Y),
      gen.psNodeLine(" go"),
      "```",
    ].join("\n");
    const sectionXNoBash = [
      gen.SHELL_PICK_LINE,
      gen.PS_BLOCK_HEADING,
      psFenceX,
      gen.CMD_BLOCK_HEADING,
      cmdFence,
      pickThen,
      nodeFound,
    ].join("\n\n");
    const sectionY = [
      gen.SHELL_PICK_LINE,
      gen.BASH_BLOCK_HEADING,
      bashFenceY,
      gen.PS_BLOCK_HEADING,
      psFenceY,
      gen.CMD_BLOCK_HEADING,
      cmdFenceY,
      pickThen,
      '```\nnode "<found-path>" go\n```',
    ].join("\n\n");
    check(
      "  adjacent sections for two runners keep their own blocks",
      rwAll(
        wrap(
          [
            gen.CMD_BLOCK_HEADING,
            cmdFence,
            gen.PS_BLOCK_HEADING,
            psFenceX,
            pickThen,
            nodeFound,
            "**Linux / macOS / Ubuntu:**",
            bashFenceY,
            gen.PS_BLOCK_HEADING,
            psFenceY,
            gen.CMD_BLOCK_HEADING,
            cmdFenceY,
          ].join("\n\n"),
        ),
      ),
      wrap(`${sectionXNoBash}\n\n${sectionY}`),
    );
    check(
      "  two adjacent reordered sections are a fixed point",
      rwAll(wrap(`${sectionXNoBash}\n\n${sectionY}`)),
      wrap(`${sectionXNoBash}\n\n${sectionY}`),
    );
    // A heading is re-emitted from its canonical text, so a paragraph that
    // carries more lines under it is not a heading: it stays in place, intact.
    const headingPlus = `${gen.CMD_BLOCK_HEADING}\nKeep this line.`;
    check(
      "  a multi-line paragraph under the cmd.exe heading is kept, not swallowed",
      rwAll(wrap([headingPlus, cmdFence, bashFence].join("\n\n"))),
      wrap(`${headingPlus}\n\n${section(false)}`),
    );
    // No PowerShell block and no runner name in the cmd.exe fence: nothing to
    // generate the block from, so the section is left alone (no `undefined`).
    const noRunner = wrap(
      [
        gen.CMD_BLOCK_HEADING,
        '```\ncmd /c dir /s /b "%USERPROFILE%\\somewhere\\*" & ver >nul\n```',
      ].join("\n\n"),
    );
    check(
      "  a cmd.exe fence naming no runner and no PowerShell block is left alone",
      rwAll(noRunner),
      noRunner,
    );
    // Sections inside list items: generated lines take the fence's indent.
    const indent = (s) =>
      s
        .split("\n")
        .map((l) => (l === "" ? l : `  ${l}`))
        .join("\n");
    const indentedOld = `1. Step\n\n${indent([gen.CMD_BLOCK_HEADING, cmdFence, bashFence].join("\n\n"))}\n\n2. Next`;
    const indentedNew = `1. Step\n\n${indent(section(false))}\n\n2. Next`;
    check(
      "  an indented section keeps its indent on generated lines",
      rwAll(indentedOld),
      indentedNew,
    );
    check(
      "  the indented section is a fixed point",
      rwAll(indentedNew),
      indentedNew,
    );
  }
}

console.log(
  `\n${failures === 0 ? "All tests passed" : `${failures} check(s) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
