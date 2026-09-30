#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// Doc-stats consistency gate — verifies that the TC statistics quoted in
// README.md, README.ko.md and CSV-YAML-MAPPING.md match the actual TC YAML
// files under tc/ and the command classification in policy/tiers.yaml.
//
// Checks:
//   1. Ground truth: parse every TC YAML → totals, per-domain, per-tier,
//      per-status, per-lane, commands covered, and TC-CLI-nnn / TC-P-nnn
//      traceability-comment counts; parse policy/tiers.yaml → commands per tier.
//   2. CSV-YAML-MAPPING.md: summary table (total/mapped/cli/prompt/unmapped),
//      domain table, tier table, per-section row counts, and link integrity
//      (every linked tc/ path must exist).
//   3. README.md and README.ko.md (same numbers, language-specific wording):
//      intro sentence (TCs, domains, commands covered / classified), the
//      mermaid architecture diagram (TC/file node, tiers.yaml node, per-tier
//      nodes), lane table + "one lane per TC" sentence, directory tree, tier
//      table (commands and TCs), status table, and that every command with
//      no TC is named in the text.
//   4. policy/tiers.yaml contract: every TC outside tc/meta/ resolves to a
//      "<plugin>.<command>" key there and declares a tier no higher than
//      its command's classification (safe < mutating < device).
//
// Exit 0 when everything matches; exit 1 with a diff report otherwise.
// Run from tests/: node scripts/verify-doc-stats.mjs
// DOC_STATS_ROOT=<dir> runs it against another tests/ tree (used by
// scripts/runner-helpers.test.mjs to prove the README regexes bind).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments, parse as parseYaml } from "yaml";

// DOC_STATS_ROOT points the gate at another tests/ tree. runner-helpers.test.mjs
// uses it on a temp copy of the docs with perturbed numbers to prove that every
// README regex below still binds to a number in the current wording.
const ROOT =
  process.env.DOC_STATS_ROOT ??
  join(dirname(fileURLToPath(import.meta.url)), "..");
const TC_DIR = join(ROOT, "tc");

const failures = [];

// ── 1. Ground truth from tc/**/*.yaml ─────────────────────────────────────

function* yamlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* yamlFiles(p);
    else if (/\.ya?ml$/.test(entry)) yield p;
  }
}

const actual = {
  total: 0,
  files: 0,
  cliMapped: 0,
  promptMapped: 0,
  unmapped: 0,
  domains: {},
  tiers: {},
  status: {},
  lanes: { cli: 0, prompt: 0, both: 0 },
  commands: new Set(), // "<plugin>.<command>" of every TC, tiers.yaml key format
  tcs: [], // { id, key, tier, domain } for the tiers.yaml contract check
};

for (const file of yamlFiles(TC_DIR)) {
  actual.files++;
  const raw = readFileSync(file, "utf-8");
  const domain = relative(TC_DIR, dirname(file)).split(sep)[0];
  // Traceability comments link YAML docs to CSV TC IDs, in document order
  const ids = [...raw.matchAll(/#\s*(TC-CLI-\d+|TC-P-\d+)\s*:/g)].map(
    (m) => m[1],
  );
  let i = 0;
  for (const doc of parseAllDocuments(raw)) {
    const tc = doc.toJS();
    if (tc == null || !tc.id) continue;
    actual.total++;
    actual.domains[domain] = (actual.domains[domain] || 0) + 1;
    actual.tiers[tc.tier] = (actual.tiers[tc.tier] || 0) + 1;
    actual.status[tc.status] = (actual.status[tc.status] || 0) + 1;
    const hasCli = Boolean(tc.lanes?.cli);
    const hasPrompt = Boolean(tc.lanes?.prompt);
    if (hasCli) actual.lanes.cli++;
    if (hasPrompt) actual.lanes.prompt++;
    if (hasCli && hasPrompt) actual.lanes.both++;
    const key = `${tc.plugin}.${tc.command}`;
    actual.commands.add(key);
    actual.tcs.push({ id: tc.id, key, tier: tc.tier, domain });
    const id = ids[i++];
    if (!id) actual.unmapped++;
    else if (id.startsWith("TC-CLI")) actual.cliMapped++;
    else actual.promptMapped++;
  }
}

// policy/tiers.yaml — the real commands and their tiers. Its keys are
// "<plugin>.<command>" (tizen-sdk.check-node), the same string a TC's
// `plugin` + `command` fields form above. Meta pseudo-commands (--doctor,
// --schema, no-args, …) live in tc/meta/ and are not classified there.
const META_DOMAIN = "meta";
const policy = { total: 0, perTier: {}, covered: 0, uncovered: [] };
const tiersDoc = parseYaml(
  readFileSync(join(ROOT, "policy", "tiers.yaml"), "utf-8"),
);
const tierCommands = tiersDoc.commands ?? {};

// tiers.yaml ↔ tizen-cli/plugin.json: every command the CLI registers must be
// classified (an unclassified command silently defaults to `skip`, so its TCs
// never run — that is how `import-wgt` shipped without a tier), and every
// classified command must still exist. Command groups under
// tizen-cli/src/command-specs/internal/ are left out: the public tree has
// neither that directory nor their plugin.json entries, so reading the names
// from the directory (when present) keeps the check valid in both trees.
// DOC_STATS_CLI_DIR points at another tizen-cli/ (runner-helpers.test.mjs).
{
  const CLI_DIR =
    process.env.DOC_STATS_CLI_DIR ??
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tizen-cli");
  const pluginJson = join(CLI_DIR, "plugin.json");
  if (existsSync(pluginJson)) {
    const internal = new Set();
    const internalDir = join(CLI_DIR, "src", "command-specs", "internal");
    if (existsSync(internalDir)) {
      for (const f of readdirSync(internalDir).filter((f) => f.endsWith(".ts")))
        for (const m of readFileSync(join(internalDir, f), "utf-8").matchAll(
          /^\s*name:\s*"([^"]+)"/gm,
        ))
          internal.add(m[1]);
    }
    const declared = (
      JSON.parse(readFileSync(pluginJson, "utf-8")).commands ?? []
    ).filter((c) => !internal.has(c));
    const classified = Object.keys(tierCommands).map((k) =>
      k.replace(/^[^.]+\./, ""),
    );
    for (const c of declared)
      if (!classified.includes(c))
        failures.push(
          `tiers.yaml: plugin.json command "${c}" is not classified (add tizen-sdk.${c})`,
        );
    for (const c of classified)
      if (!declared.includes(c))
        failures.push(
          `tiers.yaml: "${c}" is classified but is not a plugin.json command`,
        );
  } else if (!process.env.DOC_STATS_ROOT) {
    failures.push(`plugin.json not found at ${pluginJson}`);
  }
}

{
  const commands = tierCommands;
  for (const [cmd, spec] of Object.entries(commands)) {
    policy.total++;
    policy.perTier[spec.tier] = (policy.perTier[spec.tier] || 0) + 1;
    if (actual.commands.has(cmd)) policy.covered++;
    else policy.uncovered.push(cmd.replace(/^[^.]+\./, ""));
  }

  // Key contract: every non-meta TC must resolve to a tiers.yaml entry. A
  // format drift between the two would otherwise only show up as a silently
  // wrong "covered" count. tiers.yaml classifies a COMMAND by its largest
  // side effect; a TC may declare a lower tier than its command (30 do:
  // missing-required / invalid-argument TCs of mutating and device commands
  // fail before touching anything and run in the safe CI gate) but never a
  // higher one — that would mean tiers.yaml under-classifies the command.
  const RANK = { safe: 0, mutating: 1, device: 2, skip: 3 };
  for (const tc of actual.tcs) {
    if (tc.domain === META_DOMAIN) continue;
    const spec = commands[tc.key];
    if (!spec)
      failures.push(
        `tiers.yaml: ${tc.id} → no entry "${tc.key}" (keys are "<plugin>.<command>")`,
      );
    else if (RANK[tc.tier] > RANK[spec.tier])
      failures.push(
        `tiers.yaml: ${tc.id} declares tier ${tc.tier}, above its command's classification ${spec.tier}`,
      );
  }
  if (policy.covered === 0)
    failures.push(
      "tiers.yaml: no TC command matched any key — key format changed?",
    );
}

// ── 2 & 3. Numbers quoted in the docs ─────────────────────────────────────

function expect(label, documented, real) {
  if (documented !== real) {
    failures.push(`${label}: documented ${documented}, actual ${real}`);
  }
}

function num(source, re, label) {
  const m = source.match(re);
  if (!m) {
    failures.push(`${label}: pattern not found — doc wording changed? (${re})`);
    return null;
  }
  return Number(m[1]);
}

// Like num() for a regex with named groups: returns { name: Number } or null.
function nums(source, re, label) {
  const m = source.match(re);
  if (!m) {
    failures.push(`${label}: pattern not found — doc wording changed? (${re})`);
    return null;
  }
  return Object.fromEntries(
    Object.entries(m.groups).map(([k, v]) => [k, Number(v)]),
  );
}

// CSV-YAML-MAPPING.md
const mapping = readFileSync(join(ROOT, "CSV-YAML-MAPPING.md"), "utf-8");

expect(
  "MAPPING total",
  num(mapping, /YAML 테스트 케이스 총 개수 \| \*\*(\d+)\*\*/, "MAPPING total"),
  actual.total,
);
expect(
  "MAPPING mapped",
  num(mapping, /CSV TC ID 가 매핑된 케이스 \| \*\*(\d+)\*\*/, "MAPPING mapped"),
  actual.cliMapped + actual.promptMapped,
);
expect(
  "MAPPING cli-lane",
  num(mapping, /CLI 레인 \(`TC-CLI-\*`\) \| (\d+)/, "MAPPING cli-lane"),
  actual.cliMapped,
);
expect(
  "MAPPING prompt-lane",
  num(mapping, /Prompt 레인 \(`TC-P-\*`\) \| (\d+)/, "MAPPING prompt-lane"),
  actual.promptMapped,
);
expect(
  "MAPPING unmapped",
  num(
    mapping,
    /CSV TC ID 가 없는 케이스[^|]* \| \*\*(\d+)\*\*/,
    "MAPPING unmapped",
  ),
  actual.unmapped,
);

// Domain / tier tables (section-scoped so the two `device` rows don't collide)
function tableRows(source, heading) {
  const section = source.split(heading)[1]?.split(/\n#{2,3} /)[0] ?? "";
  const rows = {};
  for (const m of section.matchAll(/^\| `([a-z-]+)` \| (\d+) \|/gm)) {
    rows[m[1]] = Number(m[2]);
  }
  return rows;
}

const domainRows = tableRows(mapping, "### 도메인별 분포");
for (const [d, n] of Object.entries(actual.domains)) {
  expect(`MAPPING domain ${d}`, domainRows[d] ?? "(missing)", n);
}
for (const d of Object.keys(domainRows)) {
  if (!(d in actual.domains))
    failures.push(`MAPPING domain ${d}: listed but no tc/${d}/ TCs exist`);
}

const tierRows = tableRows(mapping, "### 티어별 분포");
for (const [t, n] of Object.entries(actual.tiers)) {
  expect(`MAPPING tier ${t}`, tierRows[t] ?? "(missing)", n);
}

// Per-section row counts must equal the summary they claim to itemize
function sectionRowCount(source, heading) {
  const section = source.split(heading)[1]?.split(/\n## /)[0] ?? "";
  return [...section.matchAll(/^\| (\[?tc\/|`TC-)/gm)].length;
}
expect(
  "MAPPING §2 rows (TC-CLI)",
  sectionRowCount(mapping, "## 2."),
  actual.cliMapped,
);
expect(
  "MAPPING §3 rows (TC-P)",
  sectionRowCount(mapping, "## 3."),
  actual.promptMapped,
);
expect(
  "MAPPING §4 rows (unmapped)",
  sectionRowCount(mapping, "## 4."),
  actual.unmapped,
);

// Link integrity: every tc/ path linked from the mapping doc must exist
for (const m of mapping.matchAll(/\((tc\/[^)]+\.yaml)\)/g)) {
  if (!existsSync(join(ROOT, m[1])))
    failures.push(`MAPPING broken link: ${m[1]}`);
}

// README.md / README.ko.md — identical numbers, language-specific sentences.
// The mermaid diagram, tables and the directory tree share their wording.
const READMES = [
  {
    file: "README.md",
    // **286 test cases** across 8 domains, covering 33 of the 34 commands
    intro:
      /\*\*(?<total>\d+) test cases\*\* across (?<domains>\d+) domains, covering (?<covered>\d+) of the (?<commands>\d+) commands/,
    // tc/  ← 286 test cases in 279 YAML files
    tree: /(?<total>\d+) test cases in (?<files>\d+) YAML files/,
    laneWord: "lane",
    // Every TC defines exactly one lane, so the two counts add up to the 286 TCs.
    laneSum: /add up to the (\d+) TCs/,
  },
  {
    file: "README.ko.md",
    // 8개 도메인에 걸쳐 **286개 테스트 케이스**가 있으며, 34개 명령 중 33개
    intro:
      /(?<domains>\d+)개 도메인에 걸쳐 \*\*(?<total>\d+)개 테스트 케이스\*\*가 있으며, (?<commands>\d+)개 명령 중 (?<covered>\d+)개/,
    // tc/  ← 279개 YAML 파일에 286개 테스트 케이스
    tree: /(?<files>\d+)개 YAML 파일에 (?<total>\d+)개 테스트 케이스/,
    laneWord: "레인",
    // 모든 TC는 레인을 하나만 정의하므로 두 수를 더하면 전체 286개가 됩니다.
    laneSum: /전체 (\d+)개가 됩니다/,
  },
];

const domainCount = Object.keys(actual.domains).length;

for (const cfg of READMES) {
  const L = cfg.file;
  const readme = readFileSync(join(ROOT, cfg.file), "utf-8");

  // Intro sentence
  const intro = nums(readme, cfg.intro, `${L} intro`);
  if (intro) {
    expect(`${L} intro total`, intro.total, actual.total);
    expect(`${L} intro domains`, intro.domains, domainCount);
    expect(`${L} intro commands covered`, intro.covered, policy.covered);
    expect(`${L} intro commands classified`, intro.commands, policy.total);
  }
  for (const cmd of policy.uncovered) {
    if (!readme.includes(`\`${cmd}\``))
      failures.push(
        `${L}: command ${cmd} has no TC but is not named in the text`,
      );
  }

  // Directory tree: tc/ line and per-domain lines
  const tree = nums(readme, cfg.tree, `${L} tree tc/`);
  if (tree) {
    expect(`${L} tree total`, tree.total, actual.total);
    expect(`${L} tree files`, tree.files, actual.files);
  }
  // `    device/               ← 101 TCs (...)`
  for (const m of readme.matchAll(/^\s{4}([a-z-]+)\/\s+←\s+(\d+) TCs?/gm)) {
    const [, d, n] = m;
    expect(`${L} tree ${d}`, Number(n), actual.domains[d] ?? 0);
  }

  // Mermaid architecture diagram
  const diagram = nums(
    readme,
    /(?<total>\d+) Test Cases \((?<files>\d+) YAML files\)/,
    `${L} diagram TC node`,
  );
  if (diagram) {
    expect(`${L} diagram total`, diagram.total, actual.total);
    expect(`${L} diagram files`, diagram.files, actual.files);
  }
  expect(
    `${L} diagram tiers.yaml node`,
    num(
      readme,
      /(\d+) commands → tier classification/,
      `${L} diagram tiers.yaml node`,
    ),
    policy.total,
  );
  // SAFE["safe (6 cmds / 66 TCs)<br/>…"]
  const tierNodes = [
    ...readme.matchAll(/"(safe|mutating|device) \((\d+) cmds \/ (\d+) TCs\)/g),
  ];
  if (tierNodes.length !== 3)
    failures.push(
      `${L} diagram: expected 3 tier nodes, found ${tierNodes.length}`,
    );
  for (const [, t, cmds, tcs] of tierNodes) {
    expect(`${L} diagram ${t} cmds`, Number(cmds), policy.perTier[t] ?? 0);
    expect(`${L} diagram ${t} TCs`, Number(tcs), actual.tiers[t] ?? 0);
  }

  // Lane table: | **cli lane**    | 167 | …   /   | **cli 레인**    | 167 | …
  for (const lane of ["cli", "prompt"]) {
    const re = new RegExp(
      `^\\| \\*\\*${lane} ${cfg.laneWord}\\*\\*\\s*\\| (\\d+) \\|`,
      "m",
    );
    expect(
      `${L} lane ${lane}`,
      num(readme, re, `${L} lane ${lane}`),
      actual.lanes[lane],
    );
  }
  expect(
    `${L} lane sum`,
    num(readme, cfg.laneSum, `${L} lane sum`),
    actual.total,
  );
  // tc-schema.json allows a TC to define both lanes; none does today and the
  // lane paragraph says so. When one appears, reword that paragraph in both
  // READMEs and update `laneSum` in READMES — the gate cannot guess new wording.
  if (actual.lanes.both !== 0)
    failures.push(
      `${L}: ${actual.lanes.both} TC(s) define both lanes, but the lane paragraph says every TC has exactly one — reword it and update laneSum in READMES`,
    );

  // Tier table: | safe     | 6        | 66  | ...
  for (const m of readme.matchAll(
    /^\| (safe|mutating|device)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gm,
  )) {
    expect(`${L} tier ${m[1]} cmds`, Number(m[2]), policy.perTier[m[1]] ?? 0);
    expect(`${L} tier ${m[1]} TCs`, Number(m[3]), actual.tiers[m[1]] ?? 0);
  }
  // | **Total** | **34**   | **286** |
  const totalRow = readme.match(
    /^\| \*\*(?:Total|합계)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/m,
  );
  if (!totalRow) failures.push(`${L} tier table: Total row not found`);
  else {
    expect(`${L} tier Total cmds`, Number(totalRow[1]), policy.total);
    expect(`${L} tier Total TCs`, Number(totalRow[2]), actual.total);
  }

  // Status table: | `draft`       | 163   | ...
  for (const m of readme.matchAll(
    /^\| `(draft|candidate|approved|quarantined)`\s*\|\s*(\d+)\s*\|/gm,
  )) {
    expect(`${L} status ${m[1]}`, Number(m[2]), actual.status[m[1]] ?? 0);
  }
}

// ── Report ────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`✗ doc-stats mismatch (${failures.length}):`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}

console.log(
  `✓ doc stats consistent — ${actual.total} TCs in ${actual.files} files ` +
    `(mapped ${actual.cliMapped + actual.promptMapped} = cli ${actual.cliMapped} + prompt ${actual.promptMapped}, unmapped ${actual.unmapped}; ` +
    `lanes cli ${actual.lanes.cli} + prompt ${actual.lanes.prompt}; ` +
    `commands ${policy.covered}/${policy.total} covered)`,
);
