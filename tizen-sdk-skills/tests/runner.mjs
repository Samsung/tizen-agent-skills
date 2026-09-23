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
 *   node runner.mjs --skip-requires=sdk,net
 *                                      # skip TCs whose requires.capabilities need
 *                                      # something this host lacks (CI: no SDK, no network)
 *   node runner.mjs --order=policy/device-run-order.yaml [--phase=<name>]
 *                                      # run the ids listed in that file, in that order
 *                                      # (repeats allowed) instead of readdir order
 *   node runner.mjs --help             # usage; any unknown option aborts with exit 2
 *
 * `quarantined` TCs are excluded unless selected explicitly with --status=quarantined.
 *
 * Without --order the run order is readdir order (alphabetical by directory,
 * then file). For the device tier that order is self-destructive (emulator
 * deleted before the TCs that use it) — see policy/device-run-order.yaml and
 * scripts/run-device-tier.mjs.
 *
 * The CI safe-tier gate is
 *   node runner.mjs --tier=safe --status=approved --skip-requires=sdk,net
 * (.github/workflows/ci.yml) — run it locally with a throwaway HOME before
 * promoting a safe TC to `approved`, since sdk-init.explicit-path writes
 * ~/.tizen.sdk.path.config.
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
import { join, dirname, relative, resolve } from "node:path";
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

// ── Capability requirements ───────────────────────────────────────────────
//
// A TC's `requires.capabilities` names what the host must provide beyond the
// plugin itself (schema enum: kvm, dind, chroot, net-device, sdk, net,
// samsung-account, gbs). The
// runner does not probe the host — `--skip-requires=sdk,net` declares what
// the host LACKS, and every TC that requires one of those is reported as
// skipped instead of failing. CI uses this to run the safe tier on a runner
// with no Tizen SDK and no guaranteed route to download.tizen.org.

export function parseSkipRequires(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Capabilities the TC requires that the host declared missing. */
export function missingCapabilities(tc, skipRequires) {
  if (!skipRequires.length) return [];
  const needed = tc.requires?.capabilities || [];
  return needed.filter((c) => skipRequires.includes(c));
}

// ── CLI args ─────────────────────────────────────────────────────────────

const USAGE = `usage: node runner.mjs [options]

  --dry-run                  validate TC YAMLs against the schema, execute nothing
  --tier=<tier>              safe | mutating | device | skip
  --status=<status>          draft | candidate | approved | quarantined
  --tc=<substring>           only TCs whose id contains <substring>
  --domain=<dir>             only TCs under tc/<dir>/
  --skip-requires=<cap,...>  skip TCs whose requires.capabilities include one of
                             these (the host lacks them), e.g. sdk,net
  --order=<yaml>             run the TC ids listed in <yaml> ({ phases: [{ name,
                             tcs: [id, ...] }] }) in that order, repeats allowed,
                             instead of readdir order; ids must match a loaded TC
  --phase=<name>             with --order: run only that phase
  -h, --help                 show this help

With no filter EVERY TC runs, including the mutating (install, certificate
profiles) and device (create/launch emulator) tiers. Unknown options abort
with exit 2 instead of widening the run.

CI gate:     node runner.mjs --tier=safe --status=approved --skip-requires=sdk,net
Device tier: node scripts/run-device-tier.mjs   (ordered, self-cleaning; see tests/README.md)`;

/**
 * Parse argv into runner options. Pure — no output, no process.exit — so the
 * unit tests can assert on it directly and main() decides how to exit.
 *
 * Returns { args, exitCode: null } when every option is recognised, otherwise
 * { args: null, exitCode, message }: 0 with the usage for --help / -h, 2 with
 * "unknown option" + usage for anything else. An unknown flag must never
 * silently widen the run: `--help` once fell through the old parser and
 * executed every mutating and device TC on a developer machine.
 */
export function parseArgs(argv) {
  const args = {
    tier: null,
    dryRun: false,
    tcFilter: null,
    domain: null,
    status: null,
    skipRequires: [],
    order: null,
    phase: null,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      return { args: null, exitCode: 0, message: USAGE };
    } else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--tier=")) args.tier = arg.slice(7);
    else if (arg.startsWith("--tc=")) args.tcFilter = arg.slice(5);
    else if (arg.startsWith("--domain=")) args.domain = arg.slice(9);
    else if (arg.startsWith("--status=")) args.status = arg.slice(9);
    else if (arg.startsWith("--skip-requires="))
      args.skipRequires = parseSkipRequires(arg.slice(16));
    else if (arg.startsWith("--order=")) {
      const file = arg.slice(8);
      if (!file) {
        return {
          args: null,
          exitCode: 2,
          message: `--order needs a file\n${USAGE}`,
        };
      }
      args.order = resolve(file);
    } else if (arg.startsWith("--phase=")) args.phase = arg.slice(8);
    else {
      return {
        args: null,
        exitCode: 2,
        message: `unknown option: ${arg}\n${USAGE}`,
      };
    }
  }
  if (args.phase !== null && !args.order) {
    return {
      args: null,
      exitCode: 2,
      message: `--phase requires --order\n${USAGE}`,
    };
  }
  return { args, exitCode: null, message: null };
}

// ── Explicit run order ────────────────────────────────────────────────────
//
// An order file names TC ids in the sequence they must execute, grouped in
// phases: { phases: [{ name, description?, tcs: [id, ...] }] }. The same id
// may appear more than once (e.g. `emulator-manager.delete` between the three
// create-emulator TCs that all create `test-vm`). Ids are matched against the
// TCs that survived the other filters, so `--tier=device --status=approved
// --order=...` fails loudly when the file names a draft TC.

/**
 * Resolve an order document against the loaded TCs. Pure.
 * @returns {{ ordered: Array<{file: string, tc: object, phase: string}>, errors: string[] }}
 */
export function applyOrder(tcs, orderDoc, phase = null) {
  const errors = [];
  const phases = Array.isArray(orderDoc?.phases) ? orderDoc.phases : null;
  if (!phases) {
    return { ordered: [], errors: ["order file: expected { phases: [...] }"] };
  }
  const byId = new Map();
  for (const entry of tcs) {
    const list = byId.get(entry.tc.id) || [];
    list.push(entry);
    byId.set(entry.tc.id, list);
  }
  const selected =
    phase === null ? phases : phases.filter((p) => p?.name === phase);
  if (phase !== null && selected.length === 0) {
    errors.push(
      `--phase=${phase}: no such phase (have: ${phases.map((p) => p?.name).join(", ")})`,
    );
  }
  // Phase names are addresses (--phase=<name>): a duplicate would silently
  // run twice, an empty phase would silently run nothing.
  const seenNames = new Set();
  for (const p of phases) {
    if (p && typeof p.name === "string") {
      if (seenNames.has(p.name))
        errors.push(
          `order file: phase name "${p.name}" appears more than once`,
        );
      seenNames.add(p.name);
    }
  }
  const ordered = [];
  for (const p of selected) {
    if (!p || typeof p.name !== "string" || !Array.isArray(p.tcs)) {
      errors.push(`order file: every phase needs { name, tcs: [...] }`);
      continue;
    }
    if (p.tcs.length === 0) {
      errors.push(`${p.name}: phase lists no TCs`);
      continue;
    }
    for (const id of p.tcs) {
      const matches = byId.get(id) || [];
      if (matches.length === 0) {
        errors.push(
          `${p.name}: ${id} matches no loaded TC (check --tier/--status filters and the id)`,
        );
      } else if (matches.length > 1) {
        errors.push(
          `${p.name}: ${id} is ambiguous (${matches.map((m) => m.file).join(", ")})`,
        );
      } else {
        ordered.push({ ...matches[0], phase: p.name });
      }
    }
  }
  return { ordered, errors };
}

function loadOrderDoc(orderPath) {
  const docs = parseAllDocuments(readFileSync(orderPath, "utf-8"));
  if (docs[0]?.errors?.length) {
    throw new Error(`${orderPath}: ${docs[0].errors[0].message}`);
  }
  return docs[0]?.toJS() ?? null;
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
 *
 * Returns { bin, prefix, kind } where `kind` is "tizen-cli" or "tizen-sdk"
 * (decides whether the leading "tizen-sdk" argv token is stripped), and
 * `prefix` holds any arguments that must precede the TC argv.
 *
 * Windows: Node's execFileSync refuses the .cmd shims that pnpm/npm create
 * (EINVAL since CVE-2024-27980) and a POSIX shell shim is not a Win32
 * executable (ENOENT). So on win32 the runner drives the standalone launcher
 * through the current Node binary instead of a PATH lookup:
 *   - TC_LAUNCHER_JS=<path to tizen-sdk.js launcher>   (explicit)
 *   - ../tizen-cli/bin/tizen-sdk.js                    (source checkout after `pnpm build`)
 */
const LAUNCHER_JS_CANDIDATES = [
  process.env.TC_LAUNCHER_JS,
  join(ROOT, "..", "tizen-cli", "bin", "tizen-sdk.js"),
].filter(Boolean);

function resolveExecutor() {
  if (process.platform === "win32") {
    const launcher = LAUNCHER_JS_CANDIDATES.find((p) => existsSync(p));
    return launcher
      ? { bin: process.execPath, prefix: [launcher], kind: "tizen-sdk" }
      : null;
  }
  try {
    execFileSync("which", ["tizen-cli"], { stdio: "pipe", timeout: 3000 });
    return { bin: "tizen-cli", prefix: [], kind: "tizen-cli" };
  } catch {
    try {
      execFileSync("which", ["tizen-sdk"], {
        stdio: "pipe",
        timeout: 3000,
      });
      return { bin: "tizen-sdk", prefix: [], kind: "tizen-sdk" };
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
            process.platform === "win32"
              ? "No tizen-sdk launcher found. Build tizen-cli (`pnpm build`) or set TC_LAUNCHER_JS to the launcher's tizen-sdk.js."
              : "Neither tizen-cli nor tizen-sdk found on PATH. Install tizen-cli or add the plugin to PATH.",
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
  const finalArgv = [
    ...executor.prefix,
    ...(executor.kind === "tizen-cli" ? expanded : expanded.slice(1)),
  ];

  try {
    const stdout = execFileSync(executor.bin, finalArgv, {
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
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.exitCode !== null) {
    // process.exitCode + return (not process.exit) so a piped stdout is
    // flushed before the process ends and the usage is never truncated.
    if (parsed.exitCode === 0) console.log(parsed.message);
    else console.error(color(RED, parsed.message));
    process.exitCode = parsed.exitCode;
    return;
  }
  const args = parsed.args;
  let { tcs, errors } = loadTCs(args);

  // Schema errors are always fatal
  if (errors.length) {
    console.error(color(RED, `✗ ${errors.length} schema error(s):`));
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  if (args.order) {
    let orderDoc;
    try {
      orderDoc = loadOrderDoc(args.order);
    } catch (e) {
      console.error(color(RED, `✗ cannot read order file: ${e.message}`));
      process.exitCode = 2;
      return;
    }
    const resolved = applyOrder(tcs, orderDoc, args.phase);
    if (resolved.errors.length) {
      console.error(
        color(
          RED,
          `✗ ${resolved.errors.length} order error(s) in ${args.order}:`,
        ),
      );
      for (const e of resolved.errors) console.error(`  ${e}`);
      process.exitCode = 2;
      return;
    }
    tcs = resolved.ordered;
  }

  if (tcs.length === 0) {
    console.log(color(YELLOW, "No TCs matched the filter."));
    process.exit(0);
  }

  console.log(color(CYAN, `\n🧪 tizen-sdk test suite`));
  console.log(
    color(
      GRAY,
      `   ${tcs.length} TC(s)${args.dryRun ? " (dry-run)" : ""}` +
        (args.order
          ? ` — ordered by ${relative(process.cwd(), args.order) || args.order}` +
            (args.phase ? `, phase ${args.phase}` : "")
          : "") +
        "\n",
    ),
  );

  // Phase headers and "(#n)" suffixes for repeated ids, only under --order.
  let currentPhase = null;
  const seen = new Map();
  const label = (entry) => {
    if (!args.order) return entry.tc.id;
    if (entry.phase !== currentPhase) {
      currentPhase = entry.phase;
      console.log(color(CYAN, `\n  ── phase ${currentPhase} ──`));
    }
    const n = (seen.get(entry.tc.id) || 0) + 1;
    seen.set(entry.tc.id, n);
    return n > 1 ? `${entry.tc.id} (#${n})` : entry.tc.id;
  };

  let pass = 0,
    fail = 0,
    skip = 0;
  const failures = [];
  // Skips broken down by reason for the summary line, so a `requires` skip
  // (a declaration about the host, never probed) cannot hide in the total.
  const skipReasons = new Map();
  const countSkip = (reason) => {
    skip++;
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  for (const entry of tcs) {
    const { tc } = entry;
    const id = label(entry);
    // --dry-run only validates, so prompt-only TCs count here too
    if (args.dryRun) {
      console.log(color(GREEN, `  ✓ ${id}`) + color(GRAY, `  [validated]`));
      pass++;
      continue;
    }

    const cli = tc.lanes?.cli;
    if (!cli) {
      console.log(color(YELLOW, `  ⊘ ${id}  (no cli lane — skip)`));
      countSkip("no cli lane");
      continue;
    }

    const missing = missingCapabilities(tc, args.skipRequires);
    if (missing.length) {
      console.log(
        color(YELLOW, `  ⊘ ${id}  (requires ${missing.join(", ")} — skip)`),
      );
      countSkip(`requires ${missing.join("+")}`);
      continue;
    }

    const envelope = runCommand(cli.argv, cli.timeout_sec, cli.env || {});
    if (!envelope) {
      console.log(color(RED, `  ✗ ${id}`) + color(GRAY, `  (no envelope)`));
      failures.push({ id, reason: "no envelope returned" });
      fail++;
      continue;
    }

    const result = evalExpect(envelope, cli.expect);
    if (result.pass) {
      console.log(
        color(GREEN, `  ✓ ${id}`) +
          color(GRAY, `  (${envelope.duration_ms ?? "?"}ms)`),
      );
      pass++;
    } else {
      console.log(color(RED, `  ✗ ${id}`));
      console.log(color(GRAY, `      ${result.reason}`));
      // The first plugin error, so a run log explains itself without a re-run.
      const err = envelope.errors?.[0];
      if (err && result.reason.startsWith("status:")) {
        const msg = String(err.message || "").replace(/\s+/g, " ");
        console.log(
          color(
            GRAY,
            `      ${err.error_code || err.error_category || "error"}: ${msg.length > 300 ? msg.slice(0, 300) + "…" : msg}`,
          ),
        );
      }
      failures.push({ id, reason: result.reason, envelope });
      fail++;
    }
  }

  // Summary
  console.log();
  const total = pass + fail + skip;
  const skipDetail = skipReasons.size
    ? ` (${[...skipReasons].map(([r, n]) => `${r}: ${n}`).join(", ")})`
    : "";
  if (fail === 0) {
    console.log(
      color(GREEN, `✓ ${pass} passed`) +
        color(GRAY, `, ${skip} skipped${skipDetail}, ${total} total`),
    );
  } else {
    console.log(
      color(RED, `✗ ${fail} failed`) +
        color(GREEN, `, ${pass} passed`) +
        color(GRAY, `, ${skip} skipped${skipDetail}, ${total} total`),
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
