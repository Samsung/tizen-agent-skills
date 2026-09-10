// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * fixture-helpers — shared test-only helpers for common/lib/tests.
 *
 * Not a test file (run-all.js only executes *.test.js), so it is safe to
 * require from any sibling test.
 *
 * loadFixturePassword() resolves the throwaway test-certificate password
 * without a credential-shaped literal appearing in any test source.
 * Resolution order mirrors tests/runner.mjs (lowest → highest precedence):
 *   1. tests/fixtures/fixtures.env  (FIXTURE_CERT_UNLOCK_B64=...)
 *   2. process.env.FIXTURE_CERT_UNLOCK_B64
 *   3. process.env.FIXTURE_CERT_UNLOCK  (already-decoded plain value)
 *
 * NOTE: this is a deliberate cross-package read into tests/fixtures/, which
 * is owned by the tests/ TC suite. If that suite renames the key or moves the
 * file, update FIXTURES_ENV_PATH / FIXTURE_KEY here (see tests/fixtures/README.md).
 *
 * The _B64 value is validated with the same strictness as
 * tests/runner.mjs::parseFixturesEnv — Buffer.from silently skips invalid
 * base64 characters, so an inline comment or stray text would otherwise decode
 * to garbage that still passes isValidPassword.
 */

const fs = require("fs");
const path = require("path");

const FIXTURES_ENV_PATH = path.resolve(
  __dirname,
  "../../../tests/fixtures/fixtures.env",
);
const FIXTURE_KEY = "FIXTURE_CERT_UNLOCK";
const FIXTURE_KEY_B64 = `${FIXTURE_KEY}_B64`;

function decodeStrictBase64(value, source) {
  const v = String(value).trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v) || v.length % 4 !== 0) {
    throw new Error(
      `${source}: ${FIXTURE_KEY_B64} is not valid base64 ("${v}"). ` +
        `The value must be bare base64 — no inline comments or stray characters.`,
    );
  }
  return Buffer.from(v, "base64").toString("utf-8");
}

function readFixtureFileValue() {
  const content = fs.readFileSync(FIXTURES_ENV_PATH, "utf-8");
  for (const raw of content.split(/\r?\n/)) {
    const m = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && m[1] === FIXTURE_KEY_B64) {
      return decodeStrictBase64(m[2], FIXTURES_ENV_PATH);
    }
  }
  throw new Error(`${FIXTURE_KEY_B64} not found in ${FIXTURES_ENV_PATH}`);
}

function loadFixturePassword(env = process.env) {
  if (env[FIXTURE_KEY] !== undefined && env[FIXTURE_KEY] !== "") {
    return env[FIXTURE_KEY];
  }
  if (env[FIXTURE_KEY_B64] !== undefined && env[FIXTURE_KEY_B64] !== "") {
    return decodeStrictBase64(env[FIXTURE_KEY_B64], `env ${FIXTURE_KEY_B64}`);
  }
  return readFixtureFileValue();
}

module.exports = {
  loadFixturePassword,
  FIXTURES_ENV_PATH,
  FIXTURE_KEY,
  FIXTURE_KEY_B64,
};
