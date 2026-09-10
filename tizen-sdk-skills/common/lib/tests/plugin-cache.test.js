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
        if (!text.includes(gen.PS_HOST_PICK_LINE)) {
          incomplete.push(`${rel} (PowerShell host pick missing or stale)`);
        }
        if (!text.includes(gen.PS_BLOCK_MARKER)) {
          incomplete.push(`${rel} (PowerShell lookup missing or stale)`);
        }
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
  }
}

console.log(
  `\n${failures === 0 ? "All tests passed" : `${failures} check(s) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
