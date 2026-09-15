// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * mask-secrets tests
 *
 * envelope/mask-secrets.js is applied to EVERY envelope the tizen-cli plugin
 * prints and to every CLI runner that does not opt out. Its own comment says
 * the sensitive-field list drifted once (author-/distributor-password flags
 * leaked until noticed) — these tests make the next drift a failing test:
 *   - field-name matching in every casing the runners and specs use
 *   - the two deliberate exclusions (prompt* booleans, *File paths)
 *   - deep masking through nested objects and arrays
 *   - the input is never mutated
 */

const {
  maskEnvelopeSecrets,
  isSensitiveField,
  REDACTED,
} = require("../envelope/mask-secrets");

console.log("=== mask-secrets Test ===\n");

/**
 * Stand-in for a secret value (same convention as user-command.test.js).
 *
 * Held in a named constant rather than written inline next to a `password`
 * key: a realistic-looking literal in that position reads as a leaked
 * credential to secret scanners (it tripped one — AVAS #134/#135), and the
 * sentinel makes the "value is replaced" assertions say what they mean.
 */
const SENTINEL = "sentinel-value";

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

console.log("Test 1: isSensitiveField — names that must be masked");
const sensitive = [
  "password",
  "passwd",
  "pass",
  "authorPassword",
  "author-password",
  "author_password",
  "AUTHOR_PASSWORD",
  "distributorPassword",
  "distributor2Password",
  "distributor2-password",
  "distributor3_password", // future flag: caught by the suffix rule, not the list
  "token",
  "accessToken",
  "access_token",
  "refresh-token",
  "secret",
  "clientSecret", // camelCase suffix: not in the list, caught by the case-change boundary
  "sessionToken",
  "userPass",
  "apiKey",
  "api-key",
  "api_key",
  "privateKey",
];
for (const name of sensitive) check(`  ${name}`, isSensitiveField(name), true);

console.log("\nTest 2: isSensitiveField — names that must NOT be masked");
const plain = [
  "bypass", // ends in "pass" but is not a credential
  "compass",
  "overpass",
  "passwordFile",
  "authorPasswordFile",
  "promptPassword",
  "promptDistributorPassword",
  "profileName",
  "serial",
  "compass",
  "",
  undefined,
  42,
];
for (const name of plain) {
  check(`  ${JSON.stringify(name)}`, isSensitiveField(name), false);
}

console.log("\nTest 3: maskEnvelopeSecrets — deep masking");
const input = {
  status: "success",
  result: {
    password: SENTINEL,
    passwordFile: "/home/me/.pw",
    promptPassword: true,
    profile: {
      name: "dev",
      authorPassword: SENTINEL,
      nested: [{ token: SENTINEL }],
    },
    list: ["plain", { api_key: SENTINEL }],
  },
  errors: [{ message: "ok", details: { distributor2Password: SENTINEL } }],
};
const snapshot = JSON.stringify(input);
const masked = maskEnvelopeSecrets(input);
check("  top-level password", masked.result.password, REDACTED);
check("  path field kept", masked.result.passwordFile, "/home/me/.pw");
check("  boolean prompt flag kept", masked.result.promptPassword, true);
check(
  "  nested authorPassword",
  masked.result.profile.authorPassword,
  REDACTED,
);
check(
  "  token inside array of objects",
  masked.result.profile.nested[0].token,
  REDACTED,
);
check("  object inside mixed array", masked.result.list[1].api_key, REDACTED);
check("  string array element untouched", masked.result.list[0], "plain");
check(
  "  errors[].details masked",
  masked.errors[0].details.distributor2Password,
  REDACTED,
);
check("  non-secret fields intact", masked.result.profile.name, "dev");
check("  input not mutated", JSON.stringify(input), snapshot);
check(
  "  sentinel never reaches the masked output",
  JSON.stringify(masked).includes(SENTINEL),
  false,
);

console.log("\nTest 4: maskEnvelopeSecrets — pass-through cases");
check("  null", maskEnvelopeSecrets(null), null);
check("  undefined", maskEnvelopeSecrets(undefined), undefined);
check("  string", maskEnvelopeSecrets("password"), "password");
check("  number", maskEnvelopeSecrets(7), 7);
check("  empty object", maskEnvelopeSecrets({}), {});
const cyclic = { password: SENTINEL };
cyclic.self = cyclic;
check(
  "  non-serialisable input returned as-is (not thrown)",
  maskEnvelopeSecrets(cyclic) === cyclic,
  true,
);

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
