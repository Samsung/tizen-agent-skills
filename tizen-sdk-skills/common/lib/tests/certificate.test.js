// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * certificate tests
 *
 * Covers the pure and temporary-fixture parts of the certificate domain:
 *   - isValidPassword: password strength validation
 *   - sanitizeFileName: file-name-safe sanitization
 *   - generateAuthorCertificate: invalid-parameter envelopes (does not shell out to `tz`)
 *   - resolveDistributorAssetPaths: path-join logic (no filesystem assumptions)
 *   - listDistributorCertificates: invalid-parameter envelopes and result shape
 *   - generateAuthorCertificate: existing-output preflight (does not invoke `tz`)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const {
  isValidPassword,
  sanitizeFileName,
  generateAuthorCertificate,
  ensurePwdSidecar,
  isPermissionDenied,
  profileWriteError,
  resolveDistributorAssetPaths,
  listDistributorCertificates,
  readSigningProfiles,
  DISTRIBUTOR_TYPES,
  DISTRIBUTOR_VERSIONS,
} = require("../core/certificate");

const { loadFixturePassword } = require("./fixture-helpers");

// Sample password that satisfies isValidPassword, resolved from the shared
// fixture (env override or tests/fixtures/fixtures.env) so no
// credential-shaped literal lives in this test.
const VALID_PASSWORD = loadFixturePassword();

console.log("=== certificate Test ===\n");

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

// Test 1: isValidPassword
console.log("Test 1: isValidPassword");
check("  valid password", isValidPassword(VALID_PASSWORD), true);
check("  too short", isValidPassword("Pw0rd1"), false);
check("  no uppercase", isValidPassword("password1"), false);
check("  no lowercase", isValidPassword("PASSWORD1"), false);
check("  no digit", isValidPassword("Password"), false);
check("  empty string", isValidPassword(""), false);
check("  non-string", isValidPassword(undefined), false);

// Test 2: sanitizeFileName
console.log("\nTest 2: sanitizeFileName");
check("  plain name unchanged", sanitizeFileName("janedev"), "janedev");
check("  spaces become dashes", sanitizeFileName("Jane Dev"), "Jane-Dev");
check(
  "  strips path separators and quotes",
  sanitizeFileName('a/b\\c:d*e?f"g<h>i|j'),
  "abcdefghij",
);
check(
  "  trims surrounding whitespace",
  sanitizeFileName("  Jane Dev  "),
  "Jane-Dev",
);

// Test 3: resolveDistributorAssetPaths — pure path-join logic, no filesystem assumptions
console.log("\nTest 3: resolveDistributorAssetPaths");
const sdkRoot = ["C:", "tizen-studio"].join(path.sep);
const legacyPublic = resolveDistributorAssetPaths(sdkRoot, "public", "legacy");
check(
  "  legacy ca path has no -new suffix",
  legacyPublic.ca_path.includes("-new"),
  false,
);
check(
  "  legacy ca path is under sdk-public",
  legacyPublic.ca_path,
  path.join(
    sdkRoot,
    "tools",
    "certificate-generator",
    "certificates",
    "distributor",
    "sdk-public",
    "tizen-distributor-ca.cer",
  ),
);
const newPartner = resolveDistributorAssetPaths(sdkRoot, "partner", "new");
check(
  "  new signer path has -new suffix and sdk-partner dir",
  newPartner.signer_path,
  path.join(
    sdkRoot,
    "tools",
    "certificate-generator",
    "certificates",
    "distributor",
    "sdk-partner",
    "tizen-distributor-signer-new.p12",
  ),
);
check("  exists is a boolean", typeof legacyPublic.exists, "boolean");
check("  DISTRIBUTOR_TYPES", DISTRIBUTOR_TYPES, [
  "public",
  "partner",
  "platform",
]);
check("  DISTRIBUTOR_VERSIONS", DISTRIBUTOR_VERSIONS, ["legacy", "new"]);

// Test 4: list-profiles parser — path availability must be reported, not inferred.
console.log("\nTest 4: readSigningProfiles certificate path availability");
const profileFixtureDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-profile-list-test-"),
);
try {
  const authorCertificate = path.join(profileFixtureDir, "author.p12");
  const missingCertificate = path.join(
    profileFixtureDir,
    "missing-distributor.p12",
  );
  const profilesXml = path.join(profileFixtureDir, "profiles.xml");
  fs.writeFileSync(authorCertificate, "fixture");
  fs.writeFileSync(
    profilesXml,
    `<?xml version="1.0"?><profiles version="2.2" active="StaleProfile"><profile name="StaleProfile"><profileitem distributor="0" key="${authorCertificate}"/><profileitem distributor="1" key="${missingCertificate}"/></profile></profiles>`,
  );
  const parsedProfiles = readSigningProfiles(profilesXml);
  const staleProfile = parsedProfiles.profiles[0];
  check(
    "  existing author certificate is available",
    staleProfile.author.key_status,
    "available",
  );
  check(
    "  missing distributor certificate is marked missing",
    staleProfile.distributor.key_status,
    "missing",
  );
  check(
    "  stale profile is not reported as usable",
    staleProfile.certificate_files_available,
    false,
  );
  check(
    "  stale path is returned for recovery",
    staleProfile.unavailable_certificate_paths[0].path,
    missingCertificate,
  );
} finally {
  fs.rmSync(profileFixtureDir, { recursive: true, force: true });
}

// Test 5: generateAuthorCertificate — invalid-parameter envelopes (async, no `tz` invocation)
console.log("\nTest 5: generateAuthorCertificate invalid-parameter envelopes");
(async () => {
  const noName = await generateAuthorCertificate({ password: VALID_PASSWORD });
  check("  missing name -> failure", noName.status, "failure");
  check(
    "  missing name category",
    noName.errors[0].error_category,
    "invalid_parameters",
  );

  const noPassword = await generateAuthorCertificate({ name: "Jane Dev" });
  check("  missing password -> failure", noPassword.status, "failure");
  check(
    "  missing password category",
    noPassword.errors[0].error_category,
    "invalid_parameters",
  );

  const weakPassword = await generateAuthorCertificate({
    name: "Jane Dev",
    password: "weak",
  });
  check("  weak password -> failure", weakPassword.status, "failure");
  check(
    "  weak password category",
    weakPassword.errors[0].error_category,
    "cert_password_invalid",
  );

  console.log("\nTest 6: generateAuthorCertificate existing-output preflight");
  const temporarySdkRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "tizen-cert-test-"),
  );
  const temporaryAuthorDir = path.join(temporarySdkRoot, "keystore", "author");
  const temporaryTzPath = path.join(
    temporarySdkRoot,
    "tools",
    "tizen-core",
    process.platform === "win32" ? "tz.exe" : "tz",
  );
  const certificateModulePath = require.resolve("../core/certificate");
  const originalCertificateModule = require.cache[certificateModulePath];
  const originalLoad = Module._load;
  let existingOutput;
  // Set when certificate.js actually asks for "./sdb". If a refactor changes
  // that import, the mock below silently stops applying and this test runs
  // generateAuthorCertificate() against the developer's REAL SDK — creating a
  // real author certificate there (PR #68 did exactly this). Assert on it.
  let mockApplied = false;
  try {
    fs.mkdirSync(temporaryAuthorDir, { recursive: true });
    fs.mkdirSync(path.dirname(temporaryTzPath), { recursive: true });
    fs.writeFileSync(temporaryTzPath, "");
    fs.writeFileSync(
      path.join(temporaryAuthorDir, "already-exists.p12"),
      "fixture",
    );

    Module._load = function mockCertificateDependencies(
      request,
      parent,
      isMain,
    ) {
      if (request === "./sdb" && parent?.filename === certificateModulePath) {
        mockApplied = true;
        return {
          resolveSdkDataPath: () => ({
            sdkRoot: temporarySdkRoot,
            dataPath: temporarySdkRoot,
          }),
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[certificateModulePath];
    const fixtureCertificate = require("../core/certificate");
    existingOutput = await fixtureCertificate.generateAuthorCertificate({
      name: "Already Exists",
      password: VALID_PASSWORD,
      fileName: "already-exists",
    });
  } finally {
    Module._load = originalLoad;
    delete require.cache[certificateModulePath];
    if (originalCertificateModule) {
      require.cache[certificateModulePath] = originalCertificateModule;
    }
    fs.rmSync(temporarySdkRoot, { recursive: true, force: true });
  }
  check(
    "  certificate.js resolves the SDK through ./sdb (mock applied)",
    mockApplied,
    true,
  );
  check("  existing output -> failure", existingOutput.status, "failure");
  check(
    "  existing output category",
    existingOutput.errors[0].error_category,
    "cert_already_exists",
  );
  check(
    "  existing output code",
    existingOutput.errors[0].error_code,
    "TIZEN_SDK_CERT_E010",
  );

  console.log(
    "\nTest 7: listDistributorCertificates invalid-parameter envelopes and shape",
  );
  const badType = await listDistributorCertificates({ type: "samsung" });
  check("  bad type -> failure", badType.status, "failure");
  check(
    "  bad type category",
    badType.errors[0].error_category,
    "invalid_parameters",
  );

  const badVersion = await listDistributorCertificates({ version: "old" });
  check("  bad version -> failure", badVersion.status, "failure");
  check(
    "  bad version category",
    badVersion.errors[0].error_category,
    "invalid_parameters",
  );

  // No SDK assumption here: on a machine with a configured SDK this succeeds
  // with distributors/unavailable arrays; without one it fails with
  // sdk_path_not_set. Either is correct — only an unexpected category is a bug.
  const listed = await listDistributorCertificates();
  if (listed.status === "success") {
    check(
      "  result has distributors array",
      Array.isArray(listed.result.distributors),
      true,
    );
    check(
      "  result has unavailable array",
      Array.isArray(listed.result.unavailable),
      true,
    );
  } else {
    check(
      "  failure without SDK is sdk_path_not_set",
      listed.errors[0].error_category,
      "sdk_path_not_set",
    );
  }

  // --- Issue #75: the .pwd sidecar and permission-denied classification -----
  console.log("\nTest 9: ensurePwdSidecar writes the author password sidecar");
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-pwd-"));
    try {
      const p12 = path.join(dir, "jane-dev.p12");
      fs.writeFileSync(p12, "cert");
      const created = ensurePwdSidecar(p12, "Secret123");
      check(
        "  sidecar path is <file>.pwd",
        created.pwd_path,
        path.join(dir, "jane-dev.pwd"),
      );
      check(
        "  created when missing",
        [created.existed, created.created, created.error],
        [false, true, null],
      );
      check(
        "  content is exactly the password",
        fs.readFileSync(created.pwd_path, "utf-8"),
        "Secret123",
      );
      if (process.platform !== "win32") {
        check(
          "  mode 0600",
          (fs.statSync(created.pwd_path).mode & 0o777).toString(8),
          "600",
        );
      }
      const again = ensurePwdSidecar(p12, "Other456");
      check(
        "  never overwrites an existing sidecar",
        [again.existed, again.created],
        [true, false],
      );
      check(
        "  existing content untouched",
        fs.readFileSync(created.pwd_path, "utf-8"),
        "Secret123",
      );
      const unwritable = ensurePwdSidecar(
        path.join(dir, "no-such-dir", "x.p12"),
        "Secret123",
      );
      check(
        "  a failed write is reported, not thrown",
        [unwritable.created, typeof unwritable.error],
        [false, "string"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("\nTest 10: permission-denied classification for profile writes");
  {
    check(
      "  EACCES is a permission refusal",
      isPermissionDenied("EACCES: permission denied, open 'profiles.xml'"),
      true,
    );
    check(
      "  Windows 'Access is denied' too",
      isPermissionDenied("tz: Access is denied."),
      true,
    );
    check(
      "  read-only filesystem too",
      isPermissionDenied("", "Read-only file system"),
      true,
    );
    check(
      "  an ordinary tz error is not",
      isPermissionDenied("Error: profile already exists"),
      false,
    );
    const denied = profileWriteError(
      "t",
      "profile_update_failed",
      'Failed to set active profile "p".',
      "/sdk-data/profile/profiles.xml",
      ["", "java.io.IOException: Permission denied"],
      Date.now(),
    );
    check(
      "  denied → permission_denied",
      denied.errors[0].error_category,
      "permission_denied",
    );
    check(
      "  denied → TIZEN_SDK_IO_E002",
      denied.errors[0].error_code,
      "TIZEN_SDK_IO_E002",
    );
    check(
      "  message names the target and the escalated re-run",
      /profiles\.xml/.test(denied.errors[0].message) &&
        /escalated permissions/.test(denied.errors[0].message),
      true,
    );
    const other = profileWriteError(
      "t",
      "profile_update_failed",
      "msg",
      "/x",
      ["Error: no such profile"],
      Date.now(),
    );
    check(
      "  other failures keep the fallback category",
      other.errors[0].error_category,
      "profile_update_failed",
    );
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
