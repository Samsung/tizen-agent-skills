#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// Unit test for the timezone-based CDN mirror selection in the SDK installers:
//   common/scripts/tizen-sdk-install/tizen-sdk-install.sh   (select_cdn_repo)
//   common/scripts/tizen-sdk-install/tizen-sdk-install.ps1  (Select-CdnRepo)
//
// Both functions must map the same UTC offset to the same mirror. Each one is
// extracted from its installer (nothing else in the installer runs) and fed a
// fixed offset instead of the live clock:
//   - bash: `date` is shadowed by a function that echoes a fixed `+HHMM` string
//   - PowerShell: the `[TimeZoneInfo]...TotalHours` expression is replaced by a
//     literal before the function is defined
//
// The PowerShell half is skipped (not failed) when neither `pwsh` nor
// `powershell` is on PATH, e.g. on the Linux CI runner.
//
// Run from tests/: node scripts/cdn-mirror-selection.test.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SH = join(ROOT, "common/scripts/tizen-sdk-install/tizen-sdk-install.sh");
const PS1 = join(
  ROOT,
  "common/scripts/tizen-sdk-install/tizen-sdk-install.ps1",
);

const MIRROR = {
  usa: "https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official",
  brazil: "https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official",
  official: "https://download.tizen.org/sdk/tizenstudio/official",
  singapore: "https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official",
};

// [ `date +%z` string, expected mirror, note ]
// The PowerShell offset (TotalHours) is derived from the same string.
const CASES = [
  ["-1200", "usa", "Baker Island"],
  ["-0700", "usa", "Los Angeles (PDT)"],
  ["-0500", "usa", "New York (EST)"],
  ["-0430", "usa", "-4.5 rounds away from zero to -5"],
  ["-0400", "brazil", "New York (EDT) / Santiago"],
  ["-0330", "brazil", "Newfoundland: -3.5 rounds to -4"],
  ["-0300", "brazil", "Sao Paulo"],
  ["-0100", "brazil", "Azores"],
  ["+0000", "official", "London"],
  ["+0100", "official", "Berlin"],
  ["+0400", "official", "Dubai"],
  ["+0430", "singapore", "Kabul: 4.5 rounds to 5 (not banker's 4)"],
  ["+0500", "singapore", "Karachi"],
  ["+0530", "singapore", "Kolkata: 5.5 rounds to 6"],
  ["+0545", "singapore", "Kathmandu: 5.75 rounds to 6"],
  ["+0800", "singapore", "Shanghai / Singapore"],
  ["+0830", "singapore", "8.5 rounds to 9 but is NOT exactly +09:00"],
  ["+0900", "official", "Seoul / Tokyo: exact +09:00 -> Seoul origin"],
  ["+0930", "singapore", "Adelaide: 9.5 rounds to 10, not +09:00"],
  ["+1000", "singapore", "Sydney"],
  ["+1030", "singapore", "Lord Howe: 10.5 rounds to 11"],
  ["+1200", "singapore", "Auckland"],
  ["+1245", "singapore", "Chatham: 12.75 rounds to 13"],
];

function totalHours(z) {
  const sign = z[0] === "-" ? -1 : 1;
  const h = Number(z.slice(1, 3));
  const m = Number(z.slice(3, 5));
  return sign * (h + m / 60);
}

// ---------------------------------------------------------------- bash
function extractBashFn() {
  const src = readFileSync(SH, "utf8");
  const m = src.match(/^select_cdn_repo\(\) \{\n[\s\S]*?\n\}/m);
  if (!m)
    throw new Error("select_cdn_repo() not found in tizen-sdk-install.sh");
  return m[0];
}

function runBash(fn, z) {
  const script = `date() { echo '${z}'; }\n${fn}\nselect_cdn_repo`;
  const r = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`bash exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}

// ---------------------------------------------------------- PowerShell
function findPowerShell() {
  for (const exe of ["pwsh", "powershell"]) {
    const r = spawnSync(exe, ["-NoProfile", "-Command", "exit 0"], {
      encoding: "utf8",
    });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}

function extractPsFn() {
  const src = readFileSync(PS1, "utf8");
  const m = src.match(/function Select-CdnRepo \{[\s\S]*?\n\}/);
  if (!m) throw new Error("Select-CdnRepo not found in tizen-sdk-install.ps1");
  const live =
    /\[TimeZoneInfo\]::Local\.GetUtcOffset\(\[DateTime\]::UtcNow\)\.TotalHours/;
  if (!live.test(m[0]))
    throw new Error(
      "Select-CdnRepo no longer reads TotalHours; update this test",
    );
  return m[0].replace(live, "[double]$env:CDN_TEST_OFFSET");
}

function runPs(exe, fn, hours) {
  const r = spawnSync(
    exe,
    ["-NoProfile", "-NonInteractive", "-Command", `${fn}\nSelect-CdnRepo`],
    {
      encoding: "utf8",
      env: { ...process.env, CDN_TEST_OFFSET: String(hours) },
    },
  );
  if (r.status !== 0) throw new Error(`${exe} exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}

// ---------------------------------------------------------------- run
const failures = [];
let pass = 0;
const check = (label, got, want) => {
  if (got === want) pass++;
  else failures.push(`${label}\n    want ${want}\n    got  ${got}`);
};

const bashFn = extractBashFn();
const psExe = findPowerShell();
const psFn = psExe ? extractPsFn() : null;

for (const [z, key, note] of CASES) {
  const want = MIRROR[key];
  const gotBash = runBash(bashFn, z);
  check(`bash ${z} (${note})`, gotBash, want);

  if (psFn) {
    const gotPs = runPs(psExe, psFn, totalHours(z));
    check(`ps1  ${z} (${note})`, gotPs, want);
    check(`bash/ps1 agree for ${z}`, gotBash, gotPs);
  }
}

const psNote = psFn
  ? `with ${psExe}`
  : "PowerShell not on PATH, .ps1 half skipped";
if (failures.length) {
  console.error(
    `✗ cdn-mirror-selection: ${failures.length} failed, ${pass} passed (${psNote})`,
  );
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `✓ cdn-mirror-selection: ${pass} checks passed over ${CASES.length} offsets (${psNote})`,
);
