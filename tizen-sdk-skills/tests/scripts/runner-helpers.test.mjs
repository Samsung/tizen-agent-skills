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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllDocuments } from "yaml";
import { parseFixturesEnv, expandArgv } from "../runner.mjs";

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

// ── Report ────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`✗ runner-helpers: ${failures.length} failed, ${pass} passed`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
console.log(`✓ runner-helpers: ${pass} tests passed`);
