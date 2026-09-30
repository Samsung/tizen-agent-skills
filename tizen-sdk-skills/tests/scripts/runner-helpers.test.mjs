#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// Unit tests for runner.mjs helpers (parseFixturesEnv, expandArgv) plus
// repo-level placeholder consistency checks:
//   - _B64 decoding: valid input, suffix drop, and fail-loud rejection of
//     inline comments / invalid base64 / bad padding (Buffer.from would
//     otherwise skip invalid characters and decode silent garbage)
//   - every ${NAME} placeholder used in any TC argv resolves against
//     fixtures/fixtures.env (no stale names like FIXTURE_CERT_PASSWORD)
// Run from tests/: node scripts/runner-helpers.test.mjs

import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";
import {
  parseFixturesEnv,
  expandArgv,
  parseSkipRequires,
  missingCapabilities,
  parseArgs,
  applyOrder,
} from "../runner.mjs";
import {
  FIXTURE_NEEDS,
  GENERATED_FIXTURE_KEYS,
  SCRATCH_HOME_MARKER,
  USER_ENV_KEYS,
  createScratchHome,
  guardedScratchDir,
  scratchHomeRemovable,
  userEnvValue,
  validateUserEnvSnapshot,
} from "./lib/driver-common.mjs";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Sample _B64 value and its decoded form. The expected plaintext is derived
// here instead of being written out, so no credential-shaped literal appears
// in the repo (the same reason fixtures.env uses _B64 keys).
const SAMPLE_B64 = "UGFzc3cwcmQx";
const SAMPLE = Buffer.from(SAMPLE_B64, "base64").toString("utf8");

let pass = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertThrows(fn, msg) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(msg);
}

// ── parseFixturesEnv ──────────────────────────────────────────────────────

check("B64 key decodes and drops suffix", () => {
  const env = parseFixturesEnv(`FIXTURE_CERT_UNLOCK_B64=${SAMPLE_B64}`);
  assert(env.FIXTURE_CERT_UNLOCK === SAMPLE, "wrong decode");
  assert(!("FIXTURE_CERT_UNLOCK_B64" in env), "suffix key leaked");
});

check("plain keys pass through, full-line comments ignored", () => {
  const env = parseFixturesEnv("# comment\nFOO=bar\n\nBAZ_B64=aGk=");
  assert(env.FOO === "bar" && env.BAZ === "hi", "plain/mixed broken");
});

check("trailing whitespace is trimmed before decoding", () => {
  const env = parseFixturesEnv(`A_B64=${SAMPLE_B64}   \r`);
  assert(env.A === SAMPLE, "trailing whitespace broke decode");
});

check(
  "inline comment on a _B64 value fails loudly (not silent garbage)",
  () => {
    assertThrows(
      () => parseFixturesEnv("A_B64=UGFzc3cwcmQx # the fixture password"),
      "inline comment was silently decoded",
    );
  },
);

check("invalid base64 characters fail loudly", () => {
  assertThrows(
    () => parseFixturesEnv("A_B64=!!!not-base64!!!"),
    "invalid base64 was silently decoded",
  );
});

check("bad base64 padding length fails loudly", () => {
  assertThrows(
    () => parseFixturesEnv("A_B64=UGFzc3cwcmQ"), // length % 4 !== 0
    "bad padding was silently decoded",
  );
});

check("empty _B64 value fails loudly", () => {
  assertThrows(() => parseFixturesEnv("A_B64="), "empty value accepted");
});

// ── expandArgv ────────────────────────────────────────────────────────────

check("placeholder expands from env", () => {
  const r = expandArgv(["--author-password", "${X}"], { X: "v" });
  assert(
    r.expanded[1] === "v" && r.missing.length === 0,
    "basic expansion broken",
  );
});

check("undefined placeholder is reported, not silently emptied", () => {
  const r = expandArgv(["${NOPE}"], {});
  assert(
    r.missing.length === 1 && r.missing[0] === "NOPE",
    "missing not reported",
  );
});

check("non-placeholder args pass through untouched", () => {
  const r = expandArgv(["plain", "has $DOLLAR but no braces"], {});
  assert(
    r.expanded[0] === "plain" && r.expanded[1].includes("$DOLLAR"),
    "args mutated",
  );
});

// ── --skip-requires / requires.capabilities ───────────────────────────────

check("parseSkipRequires splits, trims and drops empty entries", () => {
  const r = parseSkipRequires(" sdk, net,,");
  assert(
    r.length === 2 && r[0] === "sdk" && r[1] === "net",
    `got ${JSON.stringify(r)}`,
  );
  assert(parseSkipRequires("").length === 0, "empty string not empty list");
});

check("TC requiring a skipped capability is reported", () => {
  const tc = { requires: { capabilities: ["sdk"] } };
  const r = missingCapabilities(tc, ["sdk", "net"]);
  assert(r.length === 1 && r[0] === "sdk", `got ${JSON.stringify(r)}`);
});

check("TC without requires, or with only available capabilities, runs", () => {
  assert(missingCapabilities({}, ["sdk"]).length === 0, "no requires block");
  assert(
    missingCapabilities({ requires: { capabilities: ["kvm"] } }, ["sdk"])
      .length === 0,
    "unrelated capability skipped",
  );
});

check("no --skip-requires means nothing is skipped", () => {
  const tc = { requires: { capabilities: ["sdk", "net"] } };
  assert(missingCapabilities(tc, []).length === 0, "skipped without flag");
});

// ── parseArgs ─────────────────────────────────────────────────────────────
//
// parseArgs is pure (no output, no process.exit): it returns
// { args, exitCode: null } or { args: null, exitCode, message }, and main()
// turns exitCode into process.exitCode. So the tests assert on the result.

check("known options parse into filters", () => {
  const { args, exitCode } = parseArgs([
    "--tier=safe",
    "--status=approved",
    "--skip-requires=sdk,net",
    "--dry-run",
  ]);
  assert(exitCode === null, "exited on valid options");
  assert(
    args.tier === "safe" &&
      args.status === "approved" &&
      args.dryRun === true &&
      args.skipRequires.join(",") === "sdk,net",
    `wrong parse: ${JSON.stringify(args)}`,
  );
});

check("no options = no filters (every TC), exitCode null", () => {
  const { args, exitCode } = parseArgs([]);
  assert(exitCode === null && args.tier === null, "bare run mis-parsed");
});

check("--help / -h return exit 0 with the usage, no args", () => {
  for (const flag of ["--help", "-h"]) {
    const r = parseArgs([flag]);
    assert(r.exitCode === 0, `${flag} exitCode ${r.exitCode}`);
    assert(r.args === null, `${flag} still returned args`);
    assert(/^usage: node runner\.mjs/.test(r.message), `${flag} no usage`);
  }
});

check("unknown option returns exit 2 instead of widening the run", () => {
  for (const argv of [
    ["--hlep"],
    ["--tier", "safe"],
    ["--tier=safe", "--verbose"],
  ]) {
    const r = parseArgs(argv);
    assert(r.exitCode === 2, `${argv.join(" ")}: exitCode ${r.exitCode}`);
    assert(r.args === null, `${argv.join(" ")}: args returned`);
    assert(
      r.message.startsWith("unknown option: ") && r.message.includes("usage:"),
      `${argv.join(" ")}: message lacks option or usage`,
    );
  }
});

check(
  "--help wins even after valid options; unknown before --help wins",
  () => {
    assert(parseArgs(["--tier=safe", "--help"]).exitCode === 0, "help lost");
    assert(parseArgs(["--bogus", "--help"]).exitCode === 2, "bogus lost");
  },
);

check("--order resolves the path; --phase without --order exits 2", () => {
  const r = parseArgs(["--order=policy/x.yaml", "--phase=b"]);
  assert(r.exitCode === null, "valid --order/--phase rejected");
  assert(
    r.args.order.endsWith("x.yaml") && r.args.phase === "b",
    `order/phase mis-parsed: ${JSON.stringify(r.args)}`,
  );
  assert(parseArgs(["--phase=b"]).exitCode === 2, "--phase alone accepted");
  assert(parseArgs(["--order="]).exitCode === 2, "empty --order accepted");
});

// ── applyOrder (explicit run order) ───────────────────────────────────────

const loaded = [
  { file: "tc/a.yaml", tc: { id: "p.a" } },
  { file: "tc/b.yaml", tc: { id: "p.b" } },
  { file: "tc/dup1.yaml", tc: { id: "p.dup" } },
  { file: "tc/dup2.yaml", tc: { id: "p.dup" } },
];

check("applyOrder keeps file order and allows repeats", () => {
  const doc = { phases: [{ name: "one", tcs: ["p.b", "p.a", "p.b"] }] };
  const { ordered, errors } = applyOrder(loaded, doc);
  assert(errors.length === 0, `unexpected errors: ${errors.join("; ")}`);
  assert(
    ordered.map((e) => e.tc.id).join(",") === "p.b,p.a,p.b",
    "order not preserved",
  );
  assert(
    ordered.every((e) => e.phase === "one" && e.file),
    "phase/file not attached",
  );
});

check("applyOrder: unknown id, ambiguous id, unknown phase are errors", () => {
  const doc = {
    phases: [
      { name: "one", tcs: ["p.nope"] },
      { name: "two", tcs: ["p.dup"] },
    ],
  };
  const { ordered, errors } = applyOrder(loaded, doc);
  assert(ordered.length === 0, "bad ids produced entries");
  assert(
    errors.some((e) => e.includes("p.nope") && e.includes("matches no")) &&
      errors.some((e) => e.includes("p.dup") && e.includes("ambiguous")),
    `errors missing: ${errors.join("; ")}`,
  );
  const r = applyOrder(loaded, doc, "three");
  assert(
    r.errors.some((e) => e.includes("no such phase")),
    "unknown phase accepted",
  );
});

check("applyOrder --phase selects one phase; malformed docs are errors", () => {
  const doc = {
    phases: [
      { name: "one", tcs: ["p.a"] },
      { name: "two", tcs: ["p.b"] },
    ],
  };
  const r = applyOrder(loaded, doc, "two");
  assert(
    r.errors.length === 0 &&
      r.ordered.length === 1 &&
      r.ordered[0].tc.id === "p.b",
    "phase filter broken",
  );
  assert(applyOrder(loaded, {}).errors.length === 1, "missing phases accepted");
  assert(
    applyOrder(loaded, { phases: [{ tcs: [] }] }).errors.length === 1,
    "phase without name accepted",
  );
});

check("applyOrder: empty phase and duplicate phase name are errors", () => {
  const empty = applyOrder(loaded, { phases: [{ name: "one", tcs: [] }] });
  assert(
    empty.errors.some((e) => e.includes("lists no TCs")),
    "empty phase accepted",
  );
  const dup = applyOrder(loaded, {
    phases: [
      { name: "one", tcs: ["p.a"] },
      { name: "one", tcs: ["p.b"] },
    ],
  });
  assert(
    dup.errors.some((e) => e.includes("appears more than once")),
    "duplicate phase name accepted",
  );
});

// The two ordered tiers: order file ↔ the tier whose TCs it lists. Both are
// driven by scripts/run-<tier>-tier.mjs and share FIXTURE_NEEDS.
const ORDER_FILES = [
  { tier: "device", file: "device-run-order.yaml" },
  { tier: "mutating", file: "mutating-run-order.yaml" },
];
const loadOrder = (file) =>
  parseAllDocuments(
    readFileSync(join(ROOT, "policy", file), "utf-8"),
  )[0].toJS();
/** Every cli-lane TC of a tier as [{file, tc}] (optionally filtered). */
function cliTcsOfTier(tier, keep = () => true) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(entry)) {
        for (const d of parseAllDocuments(readFileSync(p, "utf-8"))) {
          const tc = d.toJS();
          if (tc?.tier === tier && tc.lanes?.cli && keep(tc))
            out.push({ file: p, tc });
        }
      }
    }
  };
  walk(join(ROOT, "tc"));
  return out;
}

for (const { tier, file } of ORDER_FILES) {
  check(
    `${file} resolves against the runnable ${tier} TCs and lists every approved one`,
    () => {
      const doc = loadOrder(file);
      // What `runner.mjs --tier=<tier>` (no --status) would load: every
      // cli-lane TC of the tier that is not quarantined. The order file may
      // list drafts (the driver's --include-drafts promotion run); it must
      // never list an id that does not exist, is ambiguous, or is quarantined.
      const runnable = cliTcsOfTier(tier, (tc) => tc.status !== "quarantined");
      const { ordered, errors } = applyOrder(runnable, doc);
      assert(errors.length === 0, `order file errors: ${errors.join("; ")}`);
      const listed = new Set(ordered.map((e) => e.tc.id));
      const missing = runnable
        .filter((e) => e.tc.status === "approved")
        .map((e) => e.tc.id)
        .filter((id) => !listed.has(id));
      assert(
        missing.length === 0,
        `approved ${tier} TCs not in ${file}: ${missing.join(", ")}`,
      );
    },
  );
}

check(
  "every ${FIXTURE_*} a phase's TCs use is declared in FIXTURE_NEEDS for that phase",
  () => {
    // Both drivers gate a run on FIXTURE_NEEDS[phase] (which
    // fixtures.generated.env keys must be present before the phase runs). A
    // TC that starts using a placeholder the table does not list for its
    // phase would only fail inside the run, so check the table here. Only
    // generated keys count: ${FIXTURE_CERT_UNLOCK} comes from fixtures.env.
    const argvById = new Map();
    for (const { tier } of ORDER_FILES)
      for (const { tc } of cliTcsOfTier(tier))
        argvById.set(tc.id, tc.lanes.cli.argv);
    const problems = [];
    const phaseNames = new Set();
    for (const { file } of ORDER_FILES) {
      for (const phase of loadOrder(file).phases) {
        assert(
          !phaseNames.has(phase.name),
          `phase ${phase.name} appears in more than one order file (FIXTURE_NEEDS is keyed by phase name)`,
        );
        phaseNames.add(phase.name);
        const declared = new Set(FIXTURE_NEEDS[phase.name] || []);
        for (const id of phase.tcs) {
          for (const arg of argvById.get(id) || []) {
            for (const m of arg.matchAll(/\$\{(FIXTURE_[A-Z0-9_]+)\}/g)) {
              if (GENERATED_FIXTURE_KEYS.has(m[1]) && !declared.has(m[1]))
                problems.push(`${phase.name}: ${id} uses \${${m[1]}}`);
            }
          }
        }
      }
    }
    assert(
      problems.length === 0,
      `FIXTURE_NEEDS (scripts/lib/driver-common.mjs) is missing: ${problems.join("; ")}`,
    );
    const stale = Object.keys(FIXTURE_NEEDS).filter((p) => !phaseNames.has(p));
    assert(
      stale.length === 0,
      `FIXTURE_NEEDS names phases not in any order file: ${stale.join(", ")}`,
    );
  },
);

// ── guardedScratchDir (what the driver hooks are allowed to empty) ────────

check(
  "guardedScratchDir accepts only real dirs strictly inside fixtures/apps",
  () => {
    const apps = join(ROOT, "fixtures", "apps");
    const inside = join(apps, ".guard-test");
    try {
      const real = guardedScratchDir(inside, "test");
      assert(
        real && existsSync(real),
        "a dir inside fixtures/apps was refused",
      );
      assert(
        relative(realpathSync.native(apps), real) === ".guard-test",
        `unexpected real path ${real}`,
      );
      // Not strictly inside: the base itself, a sibling reached via "..", an
      // absolute path elsewhere, another drive root, and nothing at all.
      for (const bad of [
        apps,
        join(apps, "..", "certs"),
        join(ROOT, "tc"),
        resolve(tmpdir()),
        process.platform === "win32" ? "Z:\\nope" : "/nope",
        "",
        undefined,
      ]) {
        let r;
        try {
          r = guardedScratchDir(bad, "test");
        } catch (e) {
          r = null; // an unreachable drive throws in realpath — still refused
          void e;
        }
        assert(r === null, `${JSON.stringify(bad)} was accepted as ${r}`);
      }
    } finally {
      rmSync(inside, { recursive: true, force: true });
      rmSync(join(ROOT, "tc", ".guard-test"), { recursive: true, force: true });
    }
  },
);

// ── Installer-phase safeguards (run-mutating-tier.mjs teardown) ───────────

check("validateUserEnvSnapshot: every key present, string or null", () => {
  assert(
    validateUserEnvSnapshot({ Path: "C:\\x;C:\\y", TIZEN_SDK_PATH: null }) ===
      null,
    "a complete snapshot was rejected",
  );
  assert(
    validateUserEnvSnapshot({ Path: "C:\\x", TIZEN_SDK_PATH: "C:\\sdk" }) ===
      null,
    "a complete string snapshot was rejected",
  );
  // A missing key is the dangerous case: $e.<key> would be $null in
  // PowerShell and SetEnvironmentVariable(..., $null, 'User') deletes the
  // variable — a truncated snapshot must never reach the restore.
  for (const bad of [
    null,
    undefined,
    [],
    "{}",
    {},
    { Path: "C:\\x" },
    { TIZEN_SDK_PATH: null },
    { Path: 5, TIZEN_SDK_PATH: null },
    { Path: "C:\\x", TIZEN_SDK_PATH: undefined },
  ]) {
    assert(
      typeof validateUserEnvSnapshot(bad) === "string",
      `${JSON.stringify(bad)} was accepted`,
    );
  }
  assert(
    USER_ENV_KEYS.length === 2 &&
      USER_ENV_KEYS.includes("Path") &&
      USER_ENV_KEYS.includes("TIZEN_SDK_PATH"),
    "USER_ENV_KEYS drifted — the restore touches exactly these two values",
  );
});

check("userEnvValue treats an absent and an empty variable alike", () => {
  assert(userEnvValue(null) === null, "null");
  assert(userEnvValue(undefined) === null, "undefined");
  assert(userEnvValue("") === null, "empty string");
  assert(userEnvValue("C:\\x") === "C:\\x", "value kept");
});

check(
  "scratchHomeRemovable allows only the marked <scratch>/home the driver made",
  () => {
    const scratch = mkdtempSync(join(tmpdir(), "tizen-scratch-test-"));
    try {
      const home = join(scratch, "home");
      // Nothing there yet: nothing to refuse (the delete is a no-op) — the
      // same holds for an unreachable path, which is why that is not in the
      // refusal list below.
      assert(scratchHomeRemovable(home, scratch) === null, "absent home");
      // A plain directory named home WITHOUT the marker: not ours.
      mkdirSync(home);
      assert(
        /marker/.test(scratchHomeRemovable(home, scratch) || ""),
        "unmarked home was allowed",
      );
      // Created by the driver: allowed.
      createScratchHome(home);
      assert(
        existsSync(join(home, SCRATCH_HOME_MARKER)),
        "createScratchHome wrote no marker",
      );
      assert(
        scratchHomeRemovable(home, scratch) === null,
        "marked home refused",
      );
      // Wrong name, nested path, the scratch dir itself, a sibling, another drive.
      const other = join(scratch, "other");
      createScratchHome(other);
      for (const [dir, base] of [
        [other, scratch],
        [join(home, "AppData"), scratch],
        [scratch, scratch],
        [home, join(scratch, "other")],
        [home, dirname(scratch)],
        ["", scratch],
        [home, ""],
      ]) {
        let why;
        try {
          why = scratchHomeRemovable(dir, base);
        } catch (e) {
          why = `threw: ${e.message}`; // unreachable drive — still refused
        }
        assert(
          typeof why === "string",
          `${JSON.stringify(dir)} under ${JSON.stringify(base)} was allowed`,
        );
      }
      // A symlink named home pointing at a marked directory: refused.
      const linkScratch = mkdtempSync(join(tmpdir(), "tizen-scratch-link-"));
      try {
        symlinkSync(home, join(linkScratch, "home"), "junction");
        assert(
          /symbolic link/.test(
            scratchHomeRemovable(join(linkScratch, "home"), linkScratch) || "",
          ),
          "symlinked home was allowed",
        );
      } catch (e) {
        if (!/EPERM|EACCES|ENOSYS/.test(e.message)) throw e; // no symlink rights: skip
      } finally {
        rmSync(linkScratch, { recursive: true, force: true });
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
);

// ── Repo-level placeholder consistency ────────────────────────────────────

check("real fixtures.env parses and defines FIXTURE_CERT_UNLOCK", () => {
  const env = parseFixturesEnv(
    readFileSync(join(ROOT, "fixtures", "fixtures.env"), "utf-8"),
  );
  assert(
    typeof env.FIXTURE_CERT_UNLOCK === "string" &&
      env.FIXTURE_CERT_UNLOCK.length > 0,
    "FIXTURE_CERT_UNLOCK not defined by fixtures.env",
  );
});

check("every ${NAME} in every TC argv resolves against fixtures.env", () => {
  const env = parseFixturesEnv(
    readFileSync(join(ROOT, "fixtures", "fixtures.env"), "utf-8"),
  );
  const unresolved = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(entry)) {
        for (const doc of parseAllDocuments(readFileSync(p, "utf-8"))) {
          const tc = doc.toJS();
          const argv = tc?.lanes?.cli?.argv;
          if (!argv) continue;
          const { missing } = expandArgv(argv, {
            ...env,
            ...(tc.lanes.cli.env || {}),
          });
          for (const name of missing) unresolved.push(`${tc.id}: \${${name}}`);
        }
      }
    }
  };
  walk(join(ROOT, "tc"));
  assert(
    unresolved.length === 0,
    `unresolved placeholders: ${unresolved.join(", ")}`,
  );
});

// ── verify-doc-stats.mjs: the README regexes bind to the current wording ──
//
// The gate reports a regex that no longer matches as "pattern not found" and
// a wrong number as "documented X, actual Y". Perturb one number per README
// pattern in a temp copy of the docs and require the latter for each — that
// proves every pattern still matches the real README.md / README.ko.md text
// (a stale pattern would surface as the former).

check(
  "verify-doc-stats: perturbed README numbers are reported per pattern",
  () => {
    const tmp = mkdtempSync(join(tmpdir(), "tizen-doc-stats-"));
    try {
      for (const p of [
        "tc",
        "policy",
        "README.md",
        "README.ko.md",
        "CSV-YAML-MAPPING.md",
      ])
        cpSync(join(ROOT, p), join(tmp, p), { recursive: true });

      // [pattern in the current doc, replacement, expected failure line prefix]
      const edits = {
        "README.md": [
          [
            /\*\*\d+ test cases\*\* across/,
            "**900 test cases** across",
            "README.md intro total: documented 900",
          ],
          [
            /\d+ Test Cases \(\d+ YAML files\)/,
            "901 Test Cases (902 YAML files)",
            "README.md diagram total: documented 901",
          ],
          [
            /"safe \(\d+ cmds \/ \d+ TCs\)/,
            '"safe (903 cmds / 904 TCs)',
            "README.md diagram safe cmds: documented 903",
          ],
          [
            /\| \*\*cli lane\*\*\s*\| \d+ \|/,
            "| **cli lane**    | 905 |",
            "README.md lane cli: documented 905",
          ],
          [
            /add up to the \d+ TCs/,
            "add up to the 906 TCs",
            "README.md lane sum: documented 906",
          ],
          [
            /\d+ test cases in \d+ YAML files/,
            "907 test cases in 908 YAML files",
            "README.md tree total: documented 907",
          ],
        ],
        "README.ko.md": [
          [
            /\*\*\d+개 테스트 케이스\*\*가 있으며/,
            "**910개 테스트 케이스**가 있으며",
            "README.ko.md intro total: documented 910",
          ],
          [
            /\| \*\*cli 레인\*\*\s*\| \d+ \|/,
            "| **cli 레인**    | 911 |",
            "README.ko.md lane cli: documented 911",
          ],
          [
            /전체 \d+개가 됩니다/,
            "전체 912개가 됩니다",
            "README.ko.md lane sum: documented 912",
          ],
          [
            /\d+개 YAML 파일에 \d+개 테스트 케이스/,
            "913개 YAML 파일에 914개 테스트 케이스",
            "README.ko.md tree files: documented 913",
          ],
        ],
      };
      const wanted = [];
      for (const [file, list] of Object.entries(edits)) {
        let text = readFileSync(join(tmp, file), "utf8");
        for (const [re, repl, label] of list) {
          assert(
            re.test(text),
            `${file}: fixture pattern ${re} not in the doc`,
          );
          text = text.replace(re, repl);
          wanted.push(label);
        }
        writeFileSync(join(tmp, file), text);
      }

      const r = spawnSync(
        process.execPath,
        [join(ROOT, "scripts", "verify-doc-stats.mjs")],
        { env: { ...process.env, DOC_STATS_ROOT: tmp }, encoding: "utf8" },
      );
      assert(
        r.status === 1,
        `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`,
      );
      for (const w of wanted)
        assert(r.stderr.includes(w), `missing "${w}" in:\n${r.stderr}`);
      assert(
        !r.stderr.includes("pattern not found"),
        `a README regex no longer matches the doc wording:\n${r.stderr}`,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
);

// ── verify-doc-stats.mjs: tiers.yaml ↔ plugin.json gate ───────────────────
//
// An unclassified command defaults to `skip`, so its TCs never run (how
// import-wgt shipped without a tier). The gate must name a plugin.json command
// missing from tiers.yaml, and must stay quiet when the CLI tree is absent
// while DOC_STATS_ROOT is set (the perturbation test above has no tizen-cli).

check(
  "verify-doc-stats: plugin.json command missing from tiers.yaml fails",
  () => {
    const tmp = mkdtempSync(join(tmpdir(), "tizen-doc-stats-cli-"));
    try {
      for (const p of [
        "tc",
        "policy",
        "README.md",
        "README.ko.md",
        "CSV-YAML-MAPPING.md",
      ])
        cpSync(join(ROOT, p), join(tmp, p), { recursive: true });
      const tiers = parseAllDocuments(
        readFileSync(join(ROOT, "policy", "tiers.yaml"), "utf-8"),
      )[0].toJS();
      const classified = Object.keys(tiers.commands).map((k) =>
        k.replace(/^[^.]+\./, ""),
      );
      const cli = join(tmp, "cli");
      mkdirSync(cli, { recursive: true });
      writeFileSync(
        join(cli, "plugin.json"),
        JSON.stringify({ commands: [...classified, "bogus-cmd"] }),
      );
      const env = {
        ...process.env,
        DOC_STATS_ROOT: tmp,
        DOC_STATS_CLI_DIR: cli,
      };
      const r = spawnSync(
        process.execPath,
        [join(ROOT, "scripts", "verify-doc-stats.mjs")],
        {
          env,
          encoding: "utf8",
        },
      );
      assert(
        r.status === 1,
        `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`,
      );
      assert(
        r.stderr.includes('plugin.json command "bogus-cmd" is not classified'),
        `missing bogus-cmd finding in:\n${r.stderr}`,
      );
      // …and a classified command the CLI no longer registers is reported too.
      writeFileSync(
        join(cli, "plugin.json"),
        JSON.stringify({ commands: classified.slice(1) }),
      );
      const r2 = spawnSync(
        process.execPath,
        [join(ROOT, "scripts", "verify-doc-stats.mjs")],
        {
          env,
          encoding: "utf8",
        },
      );
      assert(r2.status === 1, `expected exit 1, got ${r2.status}`);
      assert(
        r2.stderr.includes(
          `"${classified[0]}" is classified but is not a plugin.json command`,
        ),
        `missing stale-classification finding in:\n${r2.stderr}`,
      );
      // No plugin.json under DOC_STATS_ROOT → the gate is skipped, docs still pass.
      const r3 = spawnSync(
        process.execPath,
        [join(ROOT, "scripts", "verify-doc-stats.mjs")],
        {
          env: {
            ...process.env,
            DOC_STATS_ROOT: tmp,
            DOC_STATS_CLI_DIR: join(tmp, "no-cli"),
          },
          encoding: "utf8",
        },
      );
      assert(
        r3.status === 0,
        `expected exit 0 without a CLI tree, got ${r3.status}\n${r3.stderr}`,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
);

// ── Report ────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`✗ runner-helpers: ${failures.length} failed, ${pass} passed`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`✓ runner-helpers: ${pass} tests passed`);
