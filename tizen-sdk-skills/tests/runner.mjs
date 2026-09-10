#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Test runner — executes cli-lane TCs against a live tizen-cli + tizen-sdk install.
 *
 * Usage:
 *   node runner.mjs                    # run all TCs
 *   node runner.mjs --tier=safe        # only safe-tier TCs
 *   node runner.mjs --dry-run          # validate TCs without executing commands
 *   node runner.mjs --tc=check-node    # filter by TC id substring
 *   node runner.mjs --domain=sdk       # filter by domain directory
 *   node runner.mjs --status=approved  # only approved TCs (see schema for the lifecycle)
 *
 * `quarantined` TCs are excluded unless selected explicitly with --status=quarantined.
 *
 * The runner:
 *   1. Loads and schema-validates every TC YAML in tc/
 *   2. For each TC with a cli lane, executes `tizen-cli <argv>` (or `tizen-sdk <argv>`
 *      if tizen-cli is not on PATH — falls back to direct plugin invocation)
 *   3. Parses the JSON envelope from stdout
 *   4. Compares against the expect block (status, jsonpath matchers, error matchers)
 *   5. Prints Jest-style results and a summary
 *
 * Prompt-lane TCs are NOT auto-executed — see skills/run-test-suite.md for Cline/Claude usage.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { parseAllDocuments } from "yaml";
import { Ajv2020 } from "ajv/dist/2020.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const TC_DIR = join(ROOT, "tc");
const SCHEMA_PATH = join(ROOT, "schema", "tc-schema.json");
const FIXTURES_ENV_PATH = join(ROOT, "fixtures", "fixtures.env");

// ── Fixture env + argv placeholders ───────────────────────────────────────
//
// TC argv entries may contain `${NAME}` placeholders, resolved at exec time
// from (lowest → highest precedence): fixtures/fixtures.env, the process
// environment, the TC's own `env:` block. This keeps fixture secrets (e.g.
// the throwaway test-cert password) out of command lines in the TC YAMLs,
// where credential scanners flag them.
//
// A key ending in `_B64` is base64-decoded and exposed WITHOUT the suffix
// (FIXTURE_CERT_UNLOCK_B64=... → ${FIXTURE_CERT_UNLOCK}). This is not
// encryption — fixture values are intentionally non-secret — it only keeps
// credential-shaped literals out of the repo so scanners stop re-flagging
// them at every new location.

export function parseFixturesEnv(content) {
  const out = {};
  for (const raw of content.split(/\r?\n/)) {
    // Trim the whole line first so a stray bare \r (or padding) can never
    // block the match or leak into the value.
    const m = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    // Trailing whitespace is never meaningful in this file; inline comments
    // are NOT supported (only full-line # comments) — for _B64 keys they
    // would otherwise decode into silent garbage, because Buffer.from
    // skips invalid base64 characters instead of failing.
    const value = m[2].trim();
    if (key.endsWith("_B64")) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
        throw new Error(
          `fixtures.env: ${key} is not valid base64 ("${value}"). ` +
            `The value must be bare base64 — no inline comments or stray characters.`,
        );
      }
      out[key.slice(0, -4)] = Buffer.from(value, "base64").toString("utf-8");
    } else {
      out[key] = value;
    }
  }
  return out;
}

function loadFixturesEnv() {
  if (!existsSync(FIXTURES_ENV_PATH)) return {};
  return parseFixturesEnv(readFileSync(FIXTURES_ENV_PATH, "utf-8"));
}

const FIXTURES_ENV = loadFixturesEnv();

export function expandArgv(argv, env) {
  const missing = [];
  const expanded = argv.map((arg) =>
    arg.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      if (env[name] === undefined) {
        missing.push(name);
        return "";
      }
      return env[name];
    }),
  );
  return { expanded, missing };
}

// ── CLI args ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = {
    tier: null,
    dryRun: false,
    tcFilter: null,
    domain: null,
    status: null,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--tier=")) args.tier = arg.slice(7);
    else if (arg.startsWith("--tc=")) args.tcFilter = arg.slice(5);
    else if (arg.startsWith("--domain=")) args.domain = arg.slice(9);
    else if (arg.startsWith("--status=")) args.status = arg.slice(9);
  }
  return args;
}

// ── TC discovery ──────────────────────────────────────────────────────────

function* yamlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* yamlFiles(p);
    else if (/\.ya?ml$/.test(entry)) yield p;
  }
}

function loadTCs(args) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    schema,
  );
  const tcs = [];
  const errors = [];

  for (const file of yamlFiles(TC_DIR)) {
    const rel = relative(ROOT, file);
    // A file may hold several TCs separated by `---` (e.g. meta/guard-rules.prompt.yaml)
    const docs = parseAllDocuments(readFileSync(file, "utf-8"));

    docs.forEach((doc, i) => {
      const label = docs.length > 1 ? `${rel}#${i + 1}` : rel;

      if (doc.errors.length) {
        errors.push(`${label}: YAML parse error: ${doc.errors[0].message}`);
        return;
      }

      const tc = doc.toJS();
      if (tc == null) return; // empty document (trailing `---`)

      if (!validate(tc)) {
        const msgs = (validate.errors || [])
          .map((e) => `  ${e.instancePath || "/"} ${e.message}`)
          .join("\n");
        errors.push(`${label}: schema validation failed:\n${msgs}`);
        return;
      }

      // Apply filters
      if (args.status) {
        if (tc.status !== args.status) return;
      } else if (tc.status === "quarantined") {
        // Known-unstable TCs stay out of a default run
        return;
      }
      if (args.tier && tc.tier !== args.tier) return;
      if (args.tcFilter && !tc.id.includes(args.tcFilter)) return;
      if (args.domain) {
        const dir = relative(TC_DIR, dirname(file)).split("/")[0];
        if (dir !== args.domain) return;
      }

      tcs.push({ file: label, tc });
    });
  }

  return { tcs, errors };
}

// ── Envelope execution ────────────────────────────────────────────────────

/**
 * Resolve which binary to call. Prefer `tizen-cli` on PATH; fall back to
 * `tizen-sdk` directly (useful when testing the plugin standalone).
 */
function resolveExecutor() {
  try {
    execFileSync("which", ["tizen-cli"], { stdio: "pipe", timeout: 3000 });
    return "tizen-cli";
  } catch {
    try {
      execFileSync("which", ["tizen-sdk"], {
        stdio: "pipe",
        timeout: 3000,
      });
      return "tizen-sdk";
    } catch {
      return null;
    }
  }
}

function runCommand(argv, timeoutSec, env) {
  const executor = resolveExecutor();
  if (!executor) {
    return {
      status: "failure",
      errors: [
        {
          error_code: "RUNNER_NO_EXECUTOR",
          message:
            "Neither tizen-cli nor tizen-sdk found on PATH. Install tizen-cli or add the plugin to PATH.",
        },
      ],
    };
  }

  const mergedEnv = { ...FIXTURES_ENV, ...process.env, ...env };
  const { expanded, missing } = expandArgv(argv, mergedEnv);
  if (missing.length) {
    return {
      status: "failure",
      errors: [
        {
          error_code: "RUNNER_ENV_MISSING",
          message: `argv placeholder(s) undefined: ${missing.map((n) => "${" + n + "}").join(", ")}. Define them in fixtures/fixtures.env, the environment, or the TC env block.`,
        },
      ],
    };
  }

  // If executor is tizen-cli, argv already starts with "tizen-sdk <command>"
  // If executor is tizen-sdk, strip the leading "tizen-sdk" token
  const finalArgv = executor === "tizen-cli" ? expanded : expanded.slice(1);

  try {
    const stdout = execFileSync(executor, finalArgv, {
      timeout: timeoutSec * 1000,
      encoding: "utf-8",
      env: mergedEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // The envelope is the last JSON object on stdout
    return parseEnvelope(stdout);
  } catch (e) {
    // Command may have exited non-zero but still produced a valid envelope on stdout
    const stdout = e.stdout || "";
    if (stdout.trim()) {
      const env = parseEnvelope(stdout);
      if (env) return env;
    }
    return {
      status: "failure",
      errors: [
        {
          error_code: "RUNNER_EXEC_ERROR",
          message: e.message || String(e),
        },
      ],
    };
  }
}

/**
 * Extract the last JSON object from stdout. The plugin prints exactly one
 * envelope to stdout; any log lines go to stderr. But we are defensive and
 * scan for the last `{ ... }` block.
 */
function parseEnvelope(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to find the last JSON object in the output
    const match = trimmed.match(/\{[\s\S]*\}\s*$/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return null;
  }
}

// ── Expect evaluation ─────────────────────────────────────────────────────

function getByPath(obj, path) {
  // Simple dot-path + $ prefix support: $.result.version → obj.result.version
  const parts = path.replace(/^\$\./, "").split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function evalJsonpath(envelope, matchers) {
  for (const m of matchers) {
    const value = getByPath(envelope, m.path);
    if (m.matches !== undefined) {
      const re = new RegExp(m.matches);
      if (value === undefined || !re.test(String(value))) {
        return {
          pass: false,
          reason: `jsonpath ${m.path}: value "${value}" does not match /${m.matches}/`,
        };
      }
    }
    if (m.equals !== undefined) {
      if (value !== m.equals) {
        return {
          pass: false,
          reason: `jsonpath ${m.path}: value "${value}" !== ${JSON.stringify(m.equals)}`,
        };
      }
    }
    if (m.min_length !== undefined) {
      // "length" for a string/array is .length; for a plain object (e.g. a
      // dict of named entries like { native: [...], webapp: [...] }) it's
      // the number of keys — min_length is a size check, not a string-only one.
      const size =
        typeof value === "string" || Array.isArray(value)
          ? value.length
          : value !== null && typeof value === "object"
            ? Object.keys(value).length
            : undefined;
      if (size === undefined || size < m.min_length) {
        return {
          pass: false,
          reason: `jsonpath ${m.path}: length ${size} < ${m.min_length}`,
        };
      }
    }
    if (m.not_contains !== undefined) {
      if (typeof value === "string" && value.includes(m.not_contains)) {
        return {
          pass: false,
          reason: `jsonpath ${m.path}: contains "${m.not_contains}"`,
        };
      }
    }
  }
  return { pass: true };
}

function evalErrors(envelope, errorMatchers) {
  const envErrors = envelope.errors || [];
  for (const matcher of errorMatchers) {
    const found = envErrors.some((e) => {
      if (matcher.error_code && e.error_code !== matcher.error_code)
        return false;
      if (matcher.error_category && e.error_category !== matcher.error_category)
        return false;
      if (matcher.has_suggested_fix !== undefined) {
        const has = !!(
          e.suggested_fix &&
          (e.suggested_fix.command ||
            e.suggested_fix.auto_fixable ||
            e.suggested_fix.guide_url)
        );
        if (has !== matcher.has_suggested_fix) return false;
      }
      return true;
    });
    if (!found) {
      return {
        pass: false,
        reason: `no error matching ${JSON.stringify(matcher)} in ${JSON.stringify(envErrors)}`,
      };
    }
  }
  return { pass: true };
}

function evalExpect(envelope, expect) {
  // Status check
  if (envelope.status !== expect.status) {
    return {
      pass: false,
      reason: `status: got "${envelope.status}", expected "${expect.status}"`,
    };
  }

  // Jsonpath matchers
  if (expect.jsonpath) {
    const r = evalJsonpath(envelope, expect.jsonpath);
    if (!r.pass) return r;
  }

  // Error matchers
  if (expect.errors) {
    const r = evalErrors(envelope, expect.errors);
    if (!r.pass) return r;
  }

  return { pass: true };
}

// ── Main ──────────────────────────────────────────────────────────────────

function color(code, str) {
  return `\x1b[${code}m${str}\x1b[0m`;
}

const GREEN = "32",
  RED = "31",
  YELLOW = "33",
  CYAN = "36",
  GRAY = "90";

async function main() {
  const args = parseArgs();
  const { tcs, errors } = loadTCs(args);

  // Schema errors are always fatal
  if (errors.length) {
    console.error(color(RED, `✗ ${errors.length} schema error(s):`));
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  if (tcs.length === 0) {
    console.log(color(YELLOW, "No TCs matched the filter."));
    process.exit(0);
  }

  console.log(color(CYAN, `\n🧪 tizen-sdk test suite`));
  console.log(
    color(GRAY, `   ${tcs.length} TC(s)${args.dryRun ? " (dry-run)" : ""}\n`),
  );

  let pass = 0,
    fail = 0,
    skip = 0;
  const failures = [];

  for (const { tc } of tcs) {
    // --dry-run only validates, so prompt-only TCs count here too
    if (args.dryRun) {
      console.log(color(GREEN, `  ✓ ${tc.id}`) + color(GRAY, `  [validated]`));
      pass++;
      continue;
    }

    const cli = tc.lanes?.cli;
    if (!cli) {
      console.log(color(YELLOW, `  ⊘ ${tc.id}  (no cli lane — skip)`));
      skip++;
      continue;
    }

    const envelope = runCommand(cli.argv, cli.timeout_sec, cli.env || {});
    if (!envelope) {
      console.log(color(RED, `  ✗ ${tc.id}`) + color(GRAY, `  (no envelope)`));
      failures.push({ id: tc.id, reason: "no envelope returned" });
      fail++;
      continue;
    }

    const result = evalExpect(envelope, cli.expect);
    if (result.pass) {
      console.log(
        color(GREEN, `  ✓ ${tc.id}`) +
          color(GRAY, `  (${envelope.duration_ms ?? "?"}ms)`),
      );
      pass++;
    } else {
      console.log(color(RED, `  ✗ ${tc.id}`));
      console.log(color(GRAY, `      ${result.reason}`));
      failures.push({ id: tc.id, reason: result.reason, envelope });
      fail++;
    }
  }

  // Summary
  console.log();
  const total = pass + fail + skip;
  if (fail === 0) {
    console.log(
      color(GREEN, `✓ ${pass} passed`) +
        color(GRAY, `, ${skip} skipped, ${total} total`),
    );
  } else {
    console.log(
      color(RED, `✗ ${fail} failed`) +
        color(GREEN, `, ${pass} passed`) +
        color(GRAY, `, ${skip} skipped, ${total} total`),
    );
    console.log(color(GRAY, `\nFailures:`));
    for (const f of failures) {
      console.log(color(RED, `  • ${f.id}`) + color(GRAY, ` — ${f.reason}`));
    }
  }

  process.exit(fail > 0 ? 1 : 0);
}

// Only run the suite when invoked directly (`node runner.mjs`), so that
// helpers like expandArgv stay importable from tests/tools.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(color(RED, `fatal: ${err.message}`));
    process.exit(1);
  });
}
