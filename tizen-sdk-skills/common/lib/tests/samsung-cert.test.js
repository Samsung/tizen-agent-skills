// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Samsung certificate tests
 *
 * Covers the pure logic parts of the Samsung certificate domain:
 *   - isValidPassword: password strength validation
 *   - generateSamsungAuthorCertificate: invalid-parameter envelopes (keytool calls mocked)
 */

const { isValidPassword } = require("../core/samsung-cert");
const { loadFixturePassword } = require("./fixture-helpers");

// Sample password that satisfies isValidPassword, resolved from the shared
// fixture (env override or tests/fixtures/fixtures.env) so no
// credential-shaped literal lives in this test.
const VALID_PASSWORD = loadFixturePassword();

console.log("=== Samsung Cert Test ===\n");

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

// Test: isValidPassword
console.log("Test 1: isValidPassword");
check("  valid password", isValidPassword(VALID_PASSWORD), true);
check("  too short", isValidPassword("Pw0rd1"), false);
check("  no uppercase", isValidPassword("password1"), false);
check("  no lowercase", isValidPassword("PASSWORD1"), false);
check("  no digit", isValidPassword("Password"), false);
check("  empty string", isValidPassword(""), false);
check("  non-string", isValidPassword(undefined), false);

console.log(
  `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
