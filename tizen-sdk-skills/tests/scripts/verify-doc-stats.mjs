#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// Doc-stats consistency gate — verifies that the TC statistics quoted in
// README.md and CSV-YAML-MAPPING.md match the actual TC YAML files under tc/.
//
// Checks:
//   1. Ground truth: parse every TC YAML → totals, per-domain, per-tier,
//      per-status, and TC-CLI-nnn / TC-P-nnn traceability-comment counts.
//   2. CSV-YAML-MAPPING.md: summary table (total/mapped/cli/prompt/unmapped),
//      domain table, tier table, per-section row counts, and link integrity
//      (every linked tc/ path must exist).
//   3. README.md: total/file counts, domain tree, tier table, status table.
//
// Exit 0 when everything matches; exit 1 with a diff report otherwise.
// Run from tests/: node scripts/verify-doc-stats.mjs

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TC_DIR = join(ROOT, "tc");

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
    const id = ids[i++];
    if (!id) actual.unmapped++;
    else if (id.startsWith("TC-CLI")) actual.cliMapped++;
    else actual.promptMapped++;
  }
}

// ── 2 & 3. Numbers quoted in the docs ─────────────────────────────────────

const failures = [];

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

// README.md
const readme = readFileSync(join(ROOT, "README.md"), "utf-8");

expect(
  "README total/files",
  num(readme, /(\d+) test cases in \d+ YAML files/, "README total"),
  actual.total,
);
expect(
  "README file count",
  num(readme, /\d+ test cases in (\d+) YAML files/, "README files"),
  actual.files,
);

// Directory-tree domain counts: `    device/               ← 101 TCs (...)`
for (const m of readme.matchAll(/^\s{4}([a-z-]+)\/\s+←\s+(\d+) TCs?/gm)) {
  const [, d, n] = m;
  expect(`README tree ${d}`, Number(n), actual.domains[d] ?? 0);
}

// Tier table: | safe     | 6        | 63  | ...
for (const m of readme.matchAll(
  /^\| (safe|mutating|device)\s*\|\s*\d+\s*\|\s*(\d+)\s*\|/gm,
)) {
  expect(`README tier ${m[1]}`, Number(m[2]), actual.tiers[m[1]] ?? 0);
}

// Status table: | `draft`       | 163   | ...
for (const m of readme.matchAll(
  /^\| `(draft|candidate|approved|quarantined)`\s*\|\s*(\d+)\s*\|/gm,
)) {
  expect(`README status ${m[1]}`, Number(m[2]), actual.status[m[1]] ?? 0);
}

// ── Report ────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`✗ doc-stats mismatch (${failures.length}):`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}

console.log(
  `✓ doc stats consistent — ${actual.total} TCs in ${actual.files} files ` +
    `(mapped ${actual.cliMapped + actual.promptMapped} = cli ${actual.cliMapped} + prompt ${actual.promptMapped}, unmapped ${actual.unmapped})`,
);
