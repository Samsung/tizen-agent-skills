// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * ERROR_CODES registry completeness tests
 *
 * An error_category used by a formatError() call but missing from ERROR_CODES
 * does not fail — it silently degrades to TIZEN_SDK_UNKNOWN_E001, so the
 * envelope loses its specific error_code and any registered suggested_fix.
 * A sweep found EIGHT categories in that state (node_not_found,
 * insufficient_disk_space, invalid_argument, certificate_error,
 * invalid_package_id, rpk_res_type_conflict, runner_not_found, runner_failed).
 * This suite makes the registry contract enforceable: every category named at
 * a formatError() call site must be registered, and codes must stay unique.
 *
 * Run: node lib/tests/error-codes-registry.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { ERROR_CODES } = require("../envelope/envelope");
const { formatError } = require("../envelope/response-formatter");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message}`);
  }
}

const LIB_ROOT = path.join(__dirname, "..");

/** Every .js source under lib/, excluding this tests directory. */
function sourceFiles() {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "tests" && entry.name !== "node_modules") walk(p);
      } else if (entry.name.endsWith(".js")) {
        files.push(p);
      }
    }
  })(LIB_ROOT);
  return files;
}

/** Category string literals passed as formatError()'s 2nd argument. */
function categoriesUsedAtCallSites() {
  const used = new Map(); // category -> first site (for the failure message)
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, "utf8");
    const re = /formatError\(\s*[^,]+,\s*["'`]([a-z0-9_]+)["'`]/g;
    let m;
    while ((m = re.exec(src))) {
      if (!used.has(m[1])) {
        const line = src.slice(0, m.index).split("\n").length;
        used.set(
          m[1],
          path.relative(LIB_ROOT, file).replace(/\\/g, "/") + ":" + line,
        );
      }
    }
  }
  return used;
}

console.log("=== registry completeness ===");

test("every error_category used at a formatError() call site is registered", () => {
  const registered = new Set(
    Object.values(ERROR_CODES).map((v) => v.error_category),
  );
  const unregistered = [...categoriesUsedAtCallSites().entries()]
    .filter(([cat]) => !registered.has(cat))
    .map(([cat, site]) => `${cat} (${site})`);
  assert.deepStrictEqual(
    unregistered,
    [],
    `unregistered categories degrade to TIZEN_SDK_UNKNOWN_E001:\n       ${unregistered.join("\n       ")}`,
  );
});

test("error codes are unique across the registry", () => {
  const seen = new Map();
  for (const [key, def] of Object.entries(ERROR_CODES)) {
    assert.ok(
      !seen.has(def.error_code),
      `${def.error_code} used by both ${seen.get(def.error_code)} and ${key}`,
    );
    seen.set(def.error_code, key);
  }
});

test("error categories are unique across the registry", () => {
  const seen = new Map();
  for (const [key, def] of Object.entries(ERROR_CODES)) {
    assert.ok(
      !seen.has(def.error_category),
      `${def.error_category} used by both ${seen.get(def.error_category)} and ${key}`,
    );
    seen.set(def.error_category, key);
  }
});

test("every entry has a well-formed TIZEN_SDK_*_E### code", () => {
  for (const [key, def] of Object.entries(ERROR_CODES)) {
    assert.ok(
      /^TIZEN_SDK_[A-Z0-9]+_E\d{3}$/.test(def.error_code),
      `${key}: malformed error_code ${def.error_code}`,
    );
    assert.ok(
      /^[a-z0-9_]+$/.test(def.error_category),
      `${key}: malformed category`,
    );
  }
});

console.log("\n=== the eight formerly-degraded categories ===");

// Before registration these all surfaced as TIZEN_SDK_UNKNOWN_E001.
const EXPECTED = {
  node_not_found: "TIZEN_SDK_ENV_E001",
  insufficient_disk_space: "TIZEN_SDK_ENV_E002",
  sandbox_blocked: "TIZEN_SDK_SANDBOX_E001",
  sandbox_job_lost: "TIZEN_SDK_SANDBOX_E002",
  permission_denied: "TIZEN_SDK_IO_E002",
  invalid_argument: "TIZEN_SDK_PARAM_E003",
  certificate_error: "TIZEN_SDK_INSTALL_E001",
  invalid_package_id: "TIZEN_SDK_INSTALL_E002",
  rpk_res_type_conflict: "TIZEN_SDK_INSTALL_E003",
  runner_not_found: "TIZEN_SDK_DLOG_E001",
  runner_failed: "TIZEN_SDK_DLOG_E002",
};

for (const [category, code] of Object.entries(EXPECTED)) {
  test(`${category} -> ${code}`, () => {
    const env = formatError("cmd", category, "msg", null, Date.now());
    assert.strictEqual(env.errors[0].error_code, code);
    assert.strictEqual(env.errors[0].error_category, category);
  });
}

test("node_not_found keeps its registry guide_url even under a caller override", () => {
  // preflight.js overrides the command with a platform-specific installer;
  // the nodejs.org guide_url must survive the override.
  const env = formatError(
    "cmd",
    "node_not_found",
    "msg",
    "winget install OpenJS.NodeJS.LTS",
    Date.now(),
  );
  assert.strictEqual(
    env.errors[0].suggested_fix.command,
    "winget install OpenJS.NodeJS.LTS",
  );
  assert.strictEqual(
    env.errors[0].suggested_fix.guide_url,
    "https://nodejs.org/en/download",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
