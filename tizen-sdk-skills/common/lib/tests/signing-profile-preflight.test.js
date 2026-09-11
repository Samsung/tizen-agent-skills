// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Signing-profile preflight tests. The preflight is deliberately file-only:
 * it must fail before either `tz build` or `tz pack` is invoked.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { preflightSigningProfile } = require("../core/certificate");

let failures = 0;
const sandbox = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-signing-preflight-"),
);

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${actual}, expected ${expected}`}`,
  );
}

function writeProfile(
  name,
  active,
  authorPath,
  distributorPath,
  { authorPassword = "" } = {},
) {
  const profilesXml = path.join(sandbox, `${name}.xml`);
  const pwdAttr = authorPassword ? ` password="${authorPassword}"` : "";
  fs.writeFileSync(
    profilesXml,
    `<?xml version="1.0"?><profiles version="2.2" active="${active}"><profile name="${name}"><profileitem distributor="0" key="${authorPath}"${pwdAttr}/><profileitem distributor="1" key="${distributorPath}"/></profile></profiles>`,
  );
  return profilesXml;
}

try {
  const author = path.join(sandbox, "author.p12");
  const distributor = path.join(sandbox, "distributor.p12");
  fs.writeFileSync(author, "author");
  fs.writeFileSync(distributor, "distributor");
  // The author password sidecar tz reads next to the .p12 (issue #75).
  fs.writeFileSync(path.join(sandbox, "author.pwd"), "Secret123");

  const usableXml = writeProfile("usable", "usable", author, distributor);
  check(
    "active profile with usable author/distributor certificates",
    preflightSigningProfile({ profilesXml: usableXml }).valid,
    true,
  );
  check(
    "explicit usable profile",
    preflightSigningProfile({ profilesXml: usableXml, profileName: "usable" })
      .valid,
    true,
  );
  check(
    "missing explicit profile",
    preflightSigningProfile({ profilesXml: usableXml, profileName: "missing" })
      .valid,
    false,
  );

  const missingXml = writeProfile(
    "missing-author",
    "missing-author",
    path.join(sandbox, "gone.p12"),
    distributor,
  );
  const missing = preflightSigningProfile({ profilesXml: missingXml });
  check("missing author certificate is rejected", missing.valid, false);
  check(
    "missing author error is actionable",
    /missing or unreadable/.test(missing.error),
    true,
  );

  // Issue #75: an author .p12 without its .pwd sidecar AND without a password
  // stored in profiles.xml fails inside tz with an opaque decryption error at
  // packaging time — the preflight must catch it first.
  const noPwdAuthor = path.join(sandbox, "no-sidecar.p12");
  fs.writeFileSync(noPwdAuthor, "author");
  const noPwdXml = writeProfile("no-pwd", "no-pwd", noPwdAuthor, distributor);
  const noPwd = preflightSigningProfile({ profilesXml: noPwdXml });
  check(
    "author .p12 without .pwd or stored password is rejected",
    noPwd.valid,
    false,
  );
  check(
    "missing .pwd error names the sidecar and generate-author",
    /password file is missing or unreadable: ".*no-sidecar.pwd"/.test(
      noPwd.error,
    ) && /generate-author/.test(noPwd.error),
    true,
  );
  const storedPwdXml = writeProfile(
    "stored-pwd",
    "stored-pwd",
    noPwdAuthor,
    distributor,
    { authorPassword: "ENCRYPTED" },
  );
  check(
    "no .pwd but a password stored in profiles.xml is accepted",
    preflightSigningProfile({ profilesXml: storedPwdXml }).valid,
    true,
  );

  // When no profile is specified and no active profile exists, the preflight
  // now returns valid=true with usingDefaultCertificates=true — `tz` uses its
  // built-in default developer certificates (tempMobile.p12), mirroring the
  // VS Code extension's behavior of not passing signing args to `tz`.
  const noActiveXml = writeProfile("configured", "", author, distributor);
  const noActive = preflightSigningProfile({ profilesXml: noActiveXml });
  check(
    "no active profile falls back to default certificates",
    noActive.valid,
    true,
  );
  check(
    "usingDefaultCertificates flag is set",
    noActive.usingDefaultCertificates,
    true,
  );

  // Standalone RPK projects are packaged by the legacy `tizen` CLI, which has
  // no default-certificate fallback — buildProject disables the fallback for
  // them and the old actionable rejection must come back.
  const noActiveRpk = preflightSigningProfile({
    profilesXml: noActiveXml,
    allowDefaultCertificates: false,
  });
  check(
    "no active profile is rejected when default certificates are disallowed",
    noActiveRpk.valid,
    false,
  );
  check(
    "default-certificates-disallowed error names the RPK/legacy CLI cause",
    /no active signing profile/i.test(noActiveRpk.error) &&
      /RPK/.test(noActiveRpk.error),
    true,
  );
  check(
    "default-certificates-disallowed result carries no usingDefaultCertificates flag",
    noActiveRpk.usingDefaultCertificates,
    undefined,
  );
  check(
    "explicit profile still wins when default certificates are disallowed",
    preflightSigningProfile({
      profilesXml: noActiveXml,
      profileName: "configured",
      allowDefaultCertificates: false,
    }).valid,
    true,
  );
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(
  failures === 0 ? "=== ALL PASS ===" : `=== ${failures} FAILURE(S) ===`,
);
process.exit(failures === 0 ? 0 : 1);
