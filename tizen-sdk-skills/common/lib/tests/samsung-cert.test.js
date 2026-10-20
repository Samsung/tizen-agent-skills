// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Samsung certificate tests
 *
 * Covers the pure logic parts of the Samsung certificate domain:
 *   - isValidPassword: password strength validation
 *   - early validation errors of the author / distributor / import / profile
 *     flows: duration_ms is measured from the call's own start time
 */

const {
  isValidPassword,
  generateSamsungAuthorCertificate,
  generateSamsungDistributorCertificate,
  importSamsungCertificate,
  createSamsungProfile,
} = require("../core/samsung-cert");
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

// Test: early validation errors measure duration_ms from the call's start.
// Date.now() is stubbed so the function's own startTime is BASE and every
// later call is BASE + STEP: an envelope given that startTime reports STEP,
// one that fell back to its construction time reports 0. Every case returns
// before the SDK path, OpenSSL or the network is touched.
const BASE = 1_000_000;
const STEP = 5000;

async function expectStartTime(name, fn, category) {
  const realNow = Date.now;
  let calls = 0;
  Date.now = () => (calls++ === 0 ? BASE : BASE + STEP);
  let env;
  try {
    env = await fn();
  } finally {
    Date.now = realNow;
  }
  check(`  ${name}: status`, env && env.status, "failure");
  check(
    `  ${name}: error_category`,
    env && env.errors && env.errors[0] && env.errors[0].error_category,
    category,
  );
  check(`  ${name}: duration_ms`, env && env.duration_ms, STEP);
}

(async () => {
  console.log("\nTest 2: early errors carry the call's startTime");
  const author = {
    profileName: "p1",
    identity: "Me",
    password: VALID_PASSWORD,
  };
  await expectStartTime(
    "author: missing profile name",
    () => generateSamsungAuthorCertificate({ ...author, profileName: "" }),
    "invalid_parameters",
  );
  await expectStartTime(
    "author: missing identity",
    () => generateSamsungAuthorCertificate({ ...author, identity: "" }),
    "invalid_parameters",
  );
  await expectStartTime(
    "author: weak password",
    () => generateSamsungAuthorCertificate({ ...author, password: "weak" }),
    "cert_password_invalid",
  );

  const distributor = {
    profileName: "p1",
    password: VALID_PASSWORD,
    duidList: ["DUID0001"],
  };
  await expectStartTime(
    "distributor: missing password",
    () =>
      generateSamsungDistributorCertificate({
        ...distributor,
        password: undefined,
      }),
    "invalid_parameters",
  );
  await expectStartTime(
    "distributor: missing DUID list",
    () =>
      generateSamsungDistributorCertificate({
        ...distributor,
        duidList: undefined,
      }),
    "invalid_parameters",
  );
  await expectStartTime(
    "distributor: invalid privilege",
    () =>
      generateSamsungDistributorCertificate({
        ...distributor,
        privilege: "Admin",
      }),
    "invalid_parameters",
  );

  await expectStartTime(
    "import: missing source",
    () => importSamsungCertificate({}),
    "invalid_parameters",
  );
  await expectStartTime(
    "create profile: missing profile name",
    () => createSamsungProfile({}),
    "invalid_parameters",
  );

  console.log(
    `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
