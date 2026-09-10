// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Samsung online-CA certificate manager: author and distributor certificate generation.
 *
 * This module handles:
 *   - CSR generation via keytool (no node-forge dependency)
 *   - Samsung API calls (mocked for step 1; real endpoint in operation 3)
 *   - PKCS#12 packaging via keytool
 *   - Password storage (mocked as plaintext; real wincrypt/security/secret-tool in operation 2)
 *
 * All Samsung certificates are stored under <tizen-sdk-data>/keystore/samsung/<profileName>/,
 * consistent with local Tizen certificates.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");

const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { resolveSdkDataPath } = require("./sdb");
const samsungAuth = require("./samsung-auth");
const samsungPwdStore = require("./samsung-pwd-store");
const samsungApi = require("./samsung-api");
const samsungDuid = require("./samsung-duid");

/**
 * Validate password strength: at least 8 characters, with at least one
 * uppercase letter, one lowercase letter, and one digit.
 *
 * @param {string} password
 * @returns {boolean}
 */
function isValidPassword(password) {
  if (typeof password !== "string" || password.length < 8) return false;
  return (
    /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
  );
}

/**
 * Resolve the keytool binary path from the configured Tizen SDK.
 *
 * @param {string} sdkRoot
 * @returns {string}
 */
function resolveKeytoolBinary(sdkRoot) {
  const ext = process.platform === "win32" ? ".exe" : "";
  const sdkKeytool = path.join(sdkRoot, "jdk", "bin", `keytool${ext}`);
  if (fs.existsSync(sdkKeytool)) return sdkKeytool;
  return `keytool${ext}`;
}

/**
 * Resolve the OpenSSL binary path.
 *
 * Prefers the SDK-bundled binary so the version is deterministic: a bare
 * `openssl` on PATH can resolve to any of several installs (msys2, mingw64,
 * Git-for-Windows), which differ in default PKCS#12 encryption.
 *
 * @param {string} sdkRoot
 * @returns {string}
 */
function resolveOpenSslBinary(sdkRoot) {
  if (process.platform === "win32") {
    const sdkOpenSsl = path.join(
      sdkRoot,
      "tools",
      "msys2",
      "usr",
      "bin",
      "openssl.exe",
    );
    if (fs.existsSync(sdkOpenSsl)) return sdkOpenSsl;
    return "openssl.exe";
  }
  return "openssl";
}

/**
 * Build an OpenSSL request config for the given subject.
 *
 * A config file is used instead of `-subj` because on Windows the MSYS2-based
 * openssl.exe rewrites arguments that look like POSIX paths, mangling
 * `/CN=...` into a filesystem path. The config file also gives distributor
 * certificates a place to declare subjectAltName later.
 *
 * @private
 * @param {object} subject - {identity, department, organization, city, state, country}
 * @returns {string} openssl config file contents
 */
function buildRequestConfig(subject) {
  // Newlines would let a value inject extra config directives or sections.
  const clean = (v) =>
    String(v)
      .replace(/[\r\n]+/g, " ")
      .trim();

  const fields = [
    ["CN", subject.identity],
    ["OU", subject.department],
    ["O", subject.organization],
    ["L", subject.city],
    ["ST", subject.state],
    ["C", subject.country],
  ].filter(
    ([, value]) =>
      value !== undefined && value !== null && String(value).trim() !== "",
  );

  return [
    "[req]",
    "prompt = no",
    "distinguished_name = dn",
    "",
    "[dn]",
    ...fields.map(([key, value]) => `${key} = ${clean(value)}`),
    "",
  ].join("\n");
}

/**
 * Resolve the Samsung VD CA certificate path.
 *
 * Assets may be at different paths depending on context:
 * - When bundled by esbuild (tizen-cli): __dirname is the plugin root, assets are at ./assets/
 * - When not bundled (Cline): __dirname is lib/core/, assets are at ../../assets/
 *
 * @param {string} caType - 'author', 'public2', or 'partner2'
 * @returns {string}
 */
function resolveSamsungCaPath(caType) {
  const caFileName = {
    author: "vd_tizen_dev_author_ca.cer",
    public2: "vd_tizen_dev_public2.crt",
    partner2: "vd_tizen_dev_partner2.crt",
  }[caType];

  if (!caFileName) {
    throw new Error(`Invalid CA type: ${caType}`);
  }

  // Try bundled path first (tizen-cli: plugin root)
  let caPath = path.join(__dirname, "assets", "samsung-tv-ca", caFileName);
  if (fs.existsSync(caPath)) {
    return caPath;
  }

  // Try unbundled path (Cline: lib/core/)
  caPath = path.join(__dirname, "../../assets", "samsung-tv-ca", caFileName);
  if (fs.existsSync(caPath)) {
    return caPath;
  }

  throw new Error(
    `Samsung CA certificate not found. Checked: ${path.join(__dirname, "assets", "samsung-tv-ca", caFileName)} and ${path.join(__dirname, "../../assets", "samsung-tv-ca", caFileName)}`,
  );
}

/**
 * Run an OpenSSL subcommand, surfacing its stderr on failure.
 *
 * @private
 * @param {string} openssl - openssl binary path
 * @param {string[]} args
 * @param {object} [extraEnv] - additional environment variables
 */
function runOpenSsl(openssl, args, extraEnv) {
  try {
    execFileSync(openssl, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      windowsHide: true,
      env: { ...process.env, ...(extraEnv || {}) },
    });
  } catch (error) {
    // OpenSSL reports the useful diagnostic on stderr; execFileSync's own
    // message is just the command line.
    const detail = (error.stderr || error.stdout || "").toString().trim();
    throw new Error(
      detail ? `openssl ${args[0]} failed: ${detail}` : error.message,
    );
  }
}

/**
 * Generate a private key and a Certificate Signing Request.
 *
 * OpenSSL is used rather than keytool because keytool cannot export a private
 * key, so the key could not be re-packaged with the Samsung-signed reply.
 *
 * @private
 * @param {string} openssl - openssl binary path
 * @param {object} subject - {identity, department, organization, city, state, country}
 * @returns {{tempDir: string, keyPath: string, csr: string}}
 */
function generateKeyAndCsr(openssl, subject) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-samsung-cert-"));
  const keyPath = path.join(tempDir, "author.key");
  const csrPath = path.join(tempDir, "author.csr");
  const configPath = path.join(tempDir, "req.cnf");

  try {
    fs.writeFileSync(configPath, buildRequestConfig(subject), "utf-8");

    runOpenSsl(openssl, ["genrsa", "-out", keyPath, "2048"]);
    runOpenSsl(openssl, [
      "req",
      "-new",
      "-config",
      configPath,
      "-key",
      keyPath,
      "-out",
      csrPath,
      "-sha512",
    ]);

    return { tempDir, keyPath, csr: fs.readFileSync(csrPath, "utf-8") };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Package the private key, the Samsung-signed certificate and the CA into a
 * password-protected PKCS#12 keystore.
 *
 * Notes on the flags:
 *   - No `-chain`/`-CAfile`: the Samsung VD Author CA is itself issued by the
 *     "Tizen Developers Root Class" root, which is not bundled, so full chain
 *     verification cannot succeed. The bags are assembled without validation,
 *     matching how the Tizen Studio extension builds this file.
 *   - Explicit legacy PBE: the SDK ships OpenJDK 8, which cannot parse the
 *     PBES2/AES parameters that OpenSSL 3.x writes by default
 *     ("parseAlgParameters failed"). PBE-SHA1-3DES is understood by every
 *     OpenSSL version in play and by OpenJDK 8.
 *   - Password via `env:` so it does not appear in the process arguments.
 *
 * @private
 * @param {string} openssl - openssl binary path
 * @param {string} keyPath - private key (PEM)
 * @param {string} signedCertPath - Samsung-signed certificate (PEM)
 * @param {string} caPath - CA certificate to include in the chain
 * @param {string} destPath - destination .p12 file
 * @param {string} password - keystore password
 */
function packagePkcs12(
  openssl,
  keyPath,
  signedCertPath,
  caPath,
  destPath,
  password,
) {
  const PASS_VAR = "TIZEN_P12_PASS";

  try {
    runOpenSsl(
      openssl,
      [
        "pkcs12",
        "-export",
        "-in",
        signedCertPath,
        "-inkey",
        keyPath,
        "-certfile",
        caPath,
        "-name",
        "author",
        "-certpbe",
        "PBE-SHA1-3DES",
        "-keypbe",
        "PBE-SHA1-3DES",
        "-macalg",
        "sha1",
        "-passout",
        `env:${PASS_VAR}`,
        "-out",
        destPath,
      ],
      { [PASS_VAR]: password },
    );
  } catch (error) {
    try {
      fs.unlinkSync(destPath);
    } catch (_) {
      // best-effort cleanup
    }
    throw error;
  }
}

/**
 * Generate a Samsung author certificate.
 *
 * @param {object} input
 * @param {string} input.profileName - unique profile identifier
 * @param {string} input.identity - author's name (required)
 * @param {string} input.password - certificate password (required, validated)
 * @param {string} [input.department] - optional subject field
 * @param {string} [input.organization] - optional subject field
 * @param {string} [input.city] - optional subject field
 * @param {string} [input.state] - optional subject field
 * @param {string} [input.country] - optional subject field
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function generateSamsungAuthorCertificate(input = {}) {
  const COMMAND = "tizen-sdk certificate-manager generate-samsung-author";
  const startTime = Date.now();
  let tempDir = null;

  try {
    const { identity, password } = input;
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";

    if (!profileName) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }
    if (!identity || typeof identity !== "string" || !identity.trim()) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Author identity is required (--identity).",
      );
    }
    if (!password || typeof password !== "string") {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Password is required (--password).",
      );
    }
    if (!isValidPassword(password)) {
      return formatError(
        COMMAND,
        "cert_password_invalid",
        "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a digit.",
      );
    }

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(COMMAND, "sdk_path_not_set", resolved.error);
    }

    const openssl = resolveOpenSslBinary(resolved.sdkRoot);
    const outputDir = path.join(
      resolved.dataPath,
      "keystore",
      "samsung",
      profileName,
    );
    const authorP12Path = path.join(outputDir, "author.p12");
    const authorPwdPath = path.join(outputDir, "author.pwd");

    // Check if certificate already exists
    if (fs.existsSync(authorP12Path)) {
      return formatError(
        COMMAND,
        "cert_already_exists",
        `Samsung author certificate already exists at "${authorP12Path}". Certificates are never overwritten. Remove the profile and try again, or use a unique --profile-name.`,
      );
    }

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      // Step 1 & 2: Generate the key pair and a CSR for the requested subject
      const subject = {
        identity: identity.trim(),
        department: input.department
          ? String(input.department).trim()
          : undefined,
        organization: input.organization
          ? String(input.organization).trim()
          : undefined,
        city: input.city ? String(input.city).trim() : undefined,
        state: input.state ? String(input.state).trim() : undefined,
        country: input.country ? String(input.country).trim() : undefined,
      };

      const generated = generateKeyAndCsr(openssl, subject);
      tempDir = generated.tempDir;
      const csr = generated.csr;
      const csrPath = path.join(outputDir, "author.csr");
      fs.writeFileSync(csrPath, csr, "utf-8");

      // Step 3: Obtain Samsung Account OAuth token (real login)
      let authInfo;
      try {
        authInfo = await samsungAuth.getSamsungAccessToken(profileName);
      } catch (authError) {
        // Map auth errors to envelope error codes
        let errorCode = "samsung_auth_failed";
        if (authError.message.includes("samsung_auth_timeout")) {
          errorCode = "samsung_auth_timeout";
        } else if (
          authError.message.includes("samsung_auth_port_unavailable")
        ) {
          errorCode = "samsung_auth_port_unavailable";
        } else if (
          authError.message.includes("samsung_auth_invalid_response")
        ) {
          errorCode = "samsung_auth_invalid_response";
        }
        return formatError(COMMAND, errorCode, authError.message);
      }

      // Step 4: Submit CSR to Samsung online-CA for signing
      let signedCertPem;
      try {
        signedCertPem = await samsungApi.signCsrWithSamsung(
          csr,
          authInfo.accessToken,
          authInfo.userId,
        );
      } catch (apiError) {
        // Map Samsung API errors to envelope error codes
        const errorMsg = apiError.message || String(apiError);
        if (errorMsg.includes("samsung_api_error")) {
          return formatError(COMMAND, "samsung_api_failed", errorMsg);
        }
        return formatError(
          COMMAND,
          "samsung_cert_generation_failed",
          `Failed to get signed certificate from Samsung: ${errorMsg}`,
        );
      }

      // Step 5: Write signed certificate to disk
      const signedCertPath = path.join(outputDir, "author.crt");
      try {
        fs.writeFileSync(signedCertPath, signedCertPem, "utf-8");
      } catch (writeError) {
        return formatError(
          COMMAND,
          "samsung_cert_generation_failed",
          `Failed to save signed certificate: ${writeError.message}`,
        );
      }

      // Step 6: Resolve Samsung CA certificate
      let caCertPath;
      try {
        caCertPath = resolveSamsungCaPath("author");
      } catch (error) {
        return formatError(COMMAND, "samsung_ca_not_found", error.message);
      }

      // Step 7: Package the key, the signed certificate and the CA into author.p12
      packagePkcs12(
        openssl,
        generated.keyPath,
        signedCertPath,
        caCertPath,
        authorP12Path,
        password,
      );

      // Step 8: Store password using OS-level secure storage
      try {
        await samsungPwdStore.encryptPassword(password, authorPwdPath);
      } catch (pwdError) {
        // Map password storage error to envelope error code
        const errorMsg = pwdError.message || String(pwdError);
        if (errorMsg.includes("samsung_pwd_store_failed")) {
          return formatError(COMMAND, "samsung_pwd_store_failed", errorMsg);
        }
        return formatError(
          COMMAND,
          "samsung_pwd_store_failed",
          `Failed to encrypt password: ${errorMsg}`,
        );
      }

      // Verify files exist
      if (!fs.existsSync(authorP12Path) || !fs.existsSync(authorPwdPath)) {
        return formatError(
          COMMAND,
          "samsung_cert_generation_failed",
          `Certificate generation reported success but files are missing at "${outputDir}".`,
        );
      }

      const envelope = new Envelope(COMMAND);
      envelope.startTime = startTime;
      return envelope.success({
        profile_name: profileName,
        identity,
        cert_path: authorP12Path,
        pwd_path: authorPwdPath,
        sdk_data_path: resolved.dataPath,
        auth_source: authInfo.source,
        user_id: authInfo.userId,
        user_email: authInfo.email,
      });
    } catch (error) {
      // Clean up only this run's author artifacts — outputDir is shared with
      // distributor files, which must survive an author-generation failure
      try {
        fs.rmSync(authorP12Path, { force: true });
        fs.rmSync(authorPwdPath, { force: true });
      } catch (_) {}
      throw error;
    }
  } catch (error) {
    return formatError(
      COMMAND,
      "samsung_cert_generation_failed",
      `Failed to generate Samsung author certificate: ${error.message}`,
      null,
      startTime,
    );
  } finally {
    // Remove the temporary directory holding the unencrypted private key
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {
        // best-effort cleanup
      }
    }
  }
}

/**
 * Build an OpenSSL request config for a distributor certificate with subjectAltName.
 *
 * The distributor CSR includes device DUIDs as subjectAltName URN entries,
 * matching the reference implementation's format:
 *   URN:tizen:packageid=
 *   URN:tizen:deviceid=<duid>
 *
 * @private
 * @param {string[]} duidList - array of DUID strings
 * @returns {string} openssl config file contents for the SAN section
 */
function buildDistributorSanConfig(duidList) {
  const altNames = ["URN:tizen:packageid="];
  for (const duid of duidList) {
    altNames.push(`URN:tizen:deviceid=${duid}`);
  }

  return [
    "[req]",
    "prompt = no",
    "distinguished_name = dn",
    "req_extensions = v3_req",
    "",
    "[dn]",
    "CN = TizenSDK",
    "",
    "[v3_req]",
    "subjectAltName = @alt_names",
    "",
    "[alt_names]",
    ...altNames.map((urn, i) => `URI.${i + 1} = ${urn}`),
    "",
  ].join("\n");
}

/**
 * Generate a private key and a distributor CSR with subjectAltName DUIDs.
 *
 * @private
 * @param {string} openssl - openssl binary path
 * @param {string[]} duidList - DUID list for SAN entries
 * @returns {{tempDir: string, keyPath: string, csr: string}}
 */
function generateDistributorKeyAndCsr(openssl, duidList) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-samsung-dist-"));
  const keyPath = path.join(tempDir, "distributor.key");
  const csrPath = path.join(tempDir, "distributor.csr");
  const configPath = path.join(tempDir, "req.cnf");

  try {
    fs.writeFileSync(configPath, buildDistributorSanConfig(duidList), "utf-8");

    runOpenSsl(openssl, ["genrsa", "-out", keyPath, "2048"]);
    runOpenSsl(openssl, [
      "req",
      "-new",
      "-config",
      configPath,
      "-key",
      keyPath,
      "-out",
      csrPath,
      "-sha512",
    ]);

    return { tempDir, keyPath, csr: fs.readFileSync(csrPath, "utf-8") };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Package a distributor PKCS#12 keystore with a custom friendly name.
 *
 * @private
 */
function packageDistributorPkcs12(
  openssl,
  keyPath,
  signedCertPath,
  caPath,
  destPath,
  password,
  friendlyName,
) {
  const PASS_VAR = "TIZEN_P12_PASS";

  try {
    runOpenSsl(
      openssl,
      [
        "pkcs12",
        "-export",
        "-in",
        signedCertPath,
        "-inkey",
        keyPath,
        "-certfile",
        caPath,
        "-name",
        friendlyName || "distributor",
        "-certpbe",
        "PBE-SHA1-3DES",
        "-keypbe",
        "PBE-SHA1-3DES",
        "-macalg",
        "sha1",
        "-passout",
        `env:${PASS_VAR}`,
        "-out",
        destPath,
      ],
      { [PASS_VAR]: password },
    );
  } catch (error) {
    try {
      fs.unlinkSync(destPath);
    } catch (_) {
      // best-effort cleanup
    }
    throw error;
  }
}

/**
 * Generate a Samsung distributor certificate.
 *
 * The distributor certificate flow differs from the author flow:
 *   1. The CSR includes DUIDs as subjectAltName URN entries
 *   2. The subject is hardcoded to CN=TizenSDK
 *   3. The API endpoint is /apis/v1/distributors (not /apis/v3/authors)
 *   4. For VD mode devices, a second fetch to /apis/v3/distributors is needed
 *   5. The CA certificate depends on privilege level (public2 vs partner2)
 *   6. The v1 response may be a device-profile XML, not a PEM certificate
 *
 * @param {object} input
 * @param {string} input.profileName - unique profile identifier
 * @param {string} input.password - certificate password (required, validated)
 * @param {string[]} input.duidList - list of DUIDs (required, at least 1)
 * @param {string} [input.privilege='Public'] - 'Public' or 'Partner'
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function generateSamsungDistributorCertificate(input = {}) {
  const COMMAND = "tizen-sdk certificate-manager generate-samsung-distributor";
  const startTime = Date.now();
  let tempDir = null;

  try {
    const { password } = input;
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";
    const privilege = input.privilege || "Public";

    if (!profileName) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }
    if (!password || typeof password !== "string") {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Password is required (--password).",
      );
    }
    if (!isValidPassword(password)) {
      return formatError(
        COMMAND,
        "cert_password_invalid",
        "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a digit.",
      );
    }

    // Parse and validate DUID list
    let duidList = input.duidList;
    if (!duidList) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "DUID list is required (--duid-list or --duid-file).",
      );
    }

    // If duidList is a string, parse it
    if (typeof duidList === "string") {
      const parsed = samsungDuid.parseDuidList(duidList);
      duidList = parsed.duids;
    }

    if (!Array.isArray(duidList) || duidList.length === 0) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "At least one DUID is required.",
      );
    }

    // Validate privilege
    const normalizedPrivilege =
      privilege.charAt(0).toUpperCase() + privilege.slice(1).toLowerCase();
    if (normalizedPrivilege !== "Public" && normalizedPrivilege !== "Partner") {
      return formatError(
        COMMAND,
        "invalid_parameters",
        `Invalid privilege "${privilege}". Must be "Public" or "Partner".`,
      );
    }

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(COMMAND, "sdk_path_not_set", resolved.error);
    }

    const openssl = resolveOpenSslBinary(resolved.sdkRoot);
    const outputDir = path.join(
      resolved.dataPath,
      "keystore",
      "samsung",
      profileName,
    );
    const distributorP12Path = path.join(outputDir, "distributor.p12");
    const distributorPwdPath = path.join(outputDir, "distributor.pwd");

    // Check if certificate already exists
    if (fs.existsSync(distributorP12Path)) {
      return formatError(
        COMMAND,
        "cert_already_exists",
        `Samsung distributor certificate already exists at "${distributorP12Path}". Certificates are never overwritten. Remove the profile and try again, or use a unique --profile-name.`,
      );
    }

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      // Step 1 & 2: Generate the key pair and a distributor CSR with DUID SANs
      const generated = generateDistributorKeyAndCsr(openssl, duidList);
      tempDir = generated.tempDir;
      const csr = generated.csr;
      const csrPath = path.join(outputDir, "distributor.csr");
      fs.writeFileSync(csrPath, csr, "utf-8");

      // Step 3: Obtain Samsung Account OAuth token
      let authInfo;
      try {
        authInfo = await samsungAuth.getSamsungAccessToken(profileName);
      } catch (authError) {
        let errorCode = "samsung_auth_failed";
        if (authError.message.includes("samsung_auth_timeout")) {
          errorCode = "samsung_auth_timeout";
        } else if (
          authError.message.includes("samsung_auth_port_unavailable")
        ) {
          errorCode = "samsung_auth_port_unavailable";
        } else if (
          authError.message.includes("samsung_auth_invalid_response")
        ) {
          errorCode = "samsung_auth_invalid_response";
        }
        return formatError(COMMAND, errorCode, authError.message);
      }

      // Determine device version and VD mode
      const minVersion = samsungDuid.getMinVersion(duidList);
      const bVDMode = true; // VD mode is always selected (matching reference)
      const isV0 = minVersion === samsungDuid.DeviceVersion.V0;

      // Step 4: Submit CSR to Samsung v1 distributor endpoint
      let v1Response;
      try {
        v1Response = await samsungApi.signDistributorCsrWithSamsung({
          csrContent: csr,
          accessToken: authInfo.accessToken,
          userId: authInfo.userId,
          privilege: normalizedPrivilege,
          bVDMode,
          isV0,
          apiVersion: "v1",
          csrFileName: "distributor.csr",
        });
      } catch (apiError) {
        const errorMsg = apiError.message || String(apiError);
        if (errorMsg.includes("samsung_api_error")) {
          return formatError(COMMAND, "samsung_api_failed", errorMsg);
        }
        return formatError(
          COMMAND,
          "samsung_cert_generation_failed",
          `Failed to get distributor certificate from Samsung: ${errorMsg}`,
        );
      }

      // The v1 response may be a device-profile XML or a PEM certificate
      const v1CertPath = path.join(outputDir, "device-profile.xml");
      fs.writeFileSync(v1CertPath, v1Response, "utf-8");

      // For VD mode, fetch an additional certificate from the v3 endpoint
      let v3CertPem = null;
      if (bVDMode) {
        try {
          v3CertPem = await samsungApi.signDistributorCsrWithSamsung({
            csrContent: csr,
            accessToken: authInfo.accessToken,
            userId: authInfo.userId,
            privilege: normalizedPrivilege,
            bVDMode: false, // don't add VD platform again for v3
            isV0: false,
            apiVersion: "v3",
            csrFileName: "distributor.csr",
          });
        } catch (apiError) {
          const errorMsg = apiError.message || String(apiError);
          if (errorMsg.includes("samsung_api_error")) {
            return formatError(
              COMMAND,
              "samsung_api_failed",
              `VD mode v3 fetch failed: ${errorMsg}`,
            );
          }
          return formatError(
            COMMAND,
            "samsung_cert_generation_failed",
            `VD mode v3 fetch failed: ${errorMsg}`,
          );
        }

        // Write the v3 certificate
        const v3CertPath = path.join(outputDir, "distributor.crt");
        fs.writeFileSync(v3CertPath, v3CertPem, "utf-8");
      }

      // Step 5: Resolve Samsung CA certificate based on privilege
      let caCertPath;
      try {
        caCertPath = resolveSamsungCaPath(
          normalizedPrivilege === "Partner" ? "partner2" : "public2",
        );
      } catch (error) {
        return formatError(COMMAND, "samsung_ca_not_found", error.message);
      }

      // Step 6: Package into distributor.p12
      // Use the v3 certificate if available (VD mode), otherwise use v1 response
      const signedCertPath = v3CertPem
        ? path.join(outputDir, "distributor.crt")
        : path.join(outputDir, "device-profile.xml");

      packageDistributorPkcs12(
        openssl,
        generated.keyPath,
        signedCertPath,
        caCertPath,
        distributorP12Path,
        password,
        profileName,
      );

      // Step 7: Store password using OS-level secure storage
      try {
        await samsungPwdStore.encryptPassword(password, distributorPwdPath);
      } catch (pwdError) {
        const errorMsg = pwdError.message || String(pwdError);
        if (errorMsg.includes("samsung_pwd_store_failed")) {
          return formatError(COMMAND, "samsung_pwd_store_failed", errorMsg);
        }
        return formatError(
          COMMAND,
          "samsung_pwd_store_failed",
          `Failed to encrypt password: ${errorMsg}`,
        );
      }

      // Verify files exist
      if (
        !fs.existsSync(distributorP12Path) ||
        !fs.existsSync(distributorPwdPath)
      ) {
        return formatError(
          COMMAND,
          "samsung_cert_generation_failed",
          `Certificate generation reported success but files are missing at "${outputDir}".`,
        );
      }

      // Delete auth data after successful distributor cert generation (per reference)
      const authDataFile = path.join(outputDir, "samsung-auth-data.json");
      try {
        if (fs.existsSync(authDataFile)) {
          fs.unlinkSync(authDataFile);
        }
      } catch (_) {
        // best-effort cleanup
      }

      const envelope = new Envelope(COMMAND);
      envelope.startTime = startTime;
      return envelope.success({
        profile_name: profileName,
        privilege: normalizedPrivilege,
        duid_count: duidList.length,
        cert_path: distributorP12Path,
        pwd_path: distributorPwdPath,
        sdk_data_path: resolved.dataPath,
        auth_source: authInfo.source,
        user_id: authInfo.userId,
        user_email: authInfo.email,
        vd_mode: bVDMode,
        device_version: minVersion,
      });
    } catch (error) {
      // Clean up only this run's distributor artifacts — outputDir also holds
      // the author certificate, which must survive a distributor failure
      try {
        fs.rmSync(distributorP12Path, { force: true });
        fs.rmSync(distributorPwdPath, { force: true });
      } catch (_) {}
      throw error;
    }
  } catch (error) {
    return formatError(
      COMMAND,
      "samsung_cert_generation_failed",
      `Failed to generate Samsung distributor certificate: ${error.message}`,
      null,
      startTime,
    );
  } finally {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {
        // best-effort cleanup
      }
    }
  }
}

/**
 * Import an existing Samsung .p12 certificate (author or distributor) into
 * a Samsung profile directory, storing the password via OS-level secure storage.
 *
 * This allows users who already have a Samsung-issued certificate (e.g. from
 * Tizen Studio) to use it with this toolchain without regenerating it.
 *
 * @param {object} input
 * @param {string} input.sourcePath - path to the existing .p12 file
 * @param {string} input.password - password for the .p12 file
 * @param {string} input.profileName - profile name to import into
 * @param {string} [input.certificateType='author'] - 'author' or 'distributor'
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function importSamsungCertificate(input = {}) {
  const COMMAND = "tizen-sdk certificate-manager import-samsung-certificate";
  const startTime = Date.now();

  try {
    const { sourcePath, password } = input;
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";
    const certType = input.certificateType || "author";

    if (!sourcePath || typeof sourcePath !== "string") {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Source path is required (--source).",
      );
    }
    if (!password || typeof password !== "string") {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Password is required (--password).",
      );
    }
    if (!profileName) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }

    if (certType !== "author" && certType !== "distributor") {
      return formatError(
        COMMAND,
        "invalid_parameters",
        `Invalid certificate type "${certType}". Must be "author" or "distributor".`,
      );
    }

    if (!fs.existsSync(sourcePath)) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        `Source file not found: ${sourcePath}`,
      );
    }

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(COMMAND, "sdk_path_not_set", resolved.error);
    }

    const outputDir = path.join(
      resolved.dataPath,
      "keystore",
      "samsung",
      profileName,
    );
    const destFileName =
      certType === "author" ? "author.p12" : "distributor.p12";
    const destPath = path.join(outputDir, destFileName);
    const destPwdPath = path.join(
      outputDir,
      certType === "author" ? "author.pwd" : "distributor.pwd",
    );

    // Check if certificate already exists
    if (fs.existsSync(destPath) && !input.overwrite) {
      return formatError(
        COMMAND,
        "cert_already_exists",
        `Certificate already exists at "${destPath}". Use --overwrite to replace it.`,
      );
    }

    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });

    // Validate the .p12 file using keytool before importing
    const keytool = resolveKeytoolBinary(resolved.sdkRoot);
    try {
      const { execFileSync } = require("child_process");
      execFileSync(
        keytool,
        [
          "-list",
          "-keystore",
          sourcePath,
          "-storepass",
          password,
          "-storetype",
          "PKCS12",
        ],
        {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
          windowsHide: true,
        },
      );
    } catch (err) {
      const detail = (err.stderr || err.stdout || "").toString().trim();
      return formatError(
        COMMAND,
        "cert_import_failed",
        `Failed to validate .p12 file: ${detail || err.message}. Check the password and file format.`,
      );
    }

    // Copy the .p12 file
    try {
      fs.copyFileSync(sourcePath, destPath);
    } catch (err) {
      return formatError(
        COMMAND,
        "cert_import_failed",
        `Failed to copy certificate: ${err.message}`,
      );
    }

    // Store password using OS-level secure storage
    try {
      await samsungPwdStore.encryptPassword(password, destPwdPath);
    } catch (pwdError) {
      // Clean up the copied file since password storage failed
      try {
        fs.unlinkSync(destPath);
      } catch (_) {}
      const errorMsg = pwdError.message || String(pwdError);
      if (errorMsg.includes("samsung_pwd_store_failed")) {
        return formatError(COMMAND, "samsung_pwd_store_failed", errorMsg);
      }
      return formatError(
        COMMAND,
        "samsung_pwd_store_failed",
        `Failed to encrypt password: ${errorMsg}`,
      );
    }

    // Verify files exist
    if (!fs.existsSync(destPath) || !fs.existsSync(destPwdPath)) {
      return formatError(
        COMMAND,
        "cert_import_failed",
        `Import reported success but files are missing at "${outputDir}".`,
      );
    }

    const envelope = new Envelope(COMMAND);
    envelope.startTime = startTime;
    return envelope.success({
      profile_name: profileName,
      certificate_type: certType,
      cert_path: destPath,
      pwd_path: destPwdPath,
      source_path: sourcePath,
      sdk_data_path: resolved.dataPath,
    });
  } catch (error) {
    return formatError(
      COMMAND,
      "cert_import_failed",
      `Failed to import Samsung certificate: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Create a Samsung signing profile that uses a Samsung-issued distributor.p12
 * as distributor slot 1, instead of the bundled SDK distributor certificates.
 *
 * This is the key difference from `createSigningProfile` in certificate.js:
 * that function only accepts bundled SDK distributor certs (public/partner/platform).
 * This function accepts a Samsung-issued distributor.p12 (from generate-samsung-distributor
 * or import-samsung-certificate) and registers it as distributor slot 1.
 *
 * The profile is created via `tz security-profiles add` with:
 *   - Author: Samsung author.p12 from the same profile directory
 *   - Distributor 1: Samsung distributor.p12 + CA from the same profile directory
 *   - Passwords decrypted from the OS-level secure storage
 *
 * @param {object} input
 * @param {string} input.profileName - profile name (must match the Samsung cert profile)
 * @param {string} [input.authorPassword] - author cert password (if not provided, decrypted from .pwd)
 * @param {string} [input.distributorPassword] - distributor cert password (defaults to author password)
 * @param {string} [input.privilege='Public'] - 'Public' or 'Partner' (determines CA cert)
 * @param {boolean} [input.active=false] - set as active profile
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function createSamsungProfile(input = {}) {
  const COMMAND = "tizen-sdk certificate-manager create-samsung-profile";
  const startTime = Date.now();

  try {
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";
    const privilege = input.privilege || "Public";

    if (!profileName) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }

    const normalizedPrivilege =
      privilege.charAt(0).toUpperCase() + privilege.slice(1).toLowerCase();
    if (normalizedPrivilege !== "Public" && normalizedPrivilege !== "Partner") {
      return formatError(
        COMMAND,
        "invalid_parameters",
        `Invalid privilege "${privilege}". Must be "Public" or "Partner".`,
      );
    }

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(COMMAND, "sdk_path_not_set", resolved.error);
    }

    const samsungDir = path.join(
      resolved.dataPath,
      "keystore",
      "samsung",
      profileName,
    );
    const authorP12Path = path.join(samsungDir, "author.p12");
    const authorPwdPath = path.join(samsungDir, "author.pwd");
    const distributorP12Path = path.join(samsungDir, "distributor.p12");
    const distributorPwdPath = path.join(samsungDir, "distributor.pwd");

    // Verify author certificate exists
    if (!fs.existsSync(authorP12Path)) {
      return formatError(
        COMMAND,
        "profile_not_found",
        `Samsung author certificate not found at "${authorP12Path}". Run generate-samsung-author first.`,
      );
    }

    // Verify distributor certificate exists
    if (!fs.existsSync(distributorP12Path)) {
      return formatError(
        COMMAND,
        "profile_not_found",
        `Samsung distributor certificate not found at "${distributorP12Path}". Run generate-samsung-distributor first.`,
      );
    }

    // Decrypt author password
    let authorPassword = input.authorPassword;
    if (!authorPassword) {
      if (!fs.existsSync(authorPwdPath)) {
        return formatError(
          COMMAND,
          "profile_not_found",
          `Author password file not found at "${authorPwdPath}". Provide --author-password.`,
        );
      }
      try {
        authorPassword = await samsungPwdStore.decryptPassword(authorPwdPath);
      } catch (err) {
        return formatError(
          COMMAND,
          "samsung_pwd_store_failed",
          `Failed to decrypt author password: ${err.message}`,
        );
      }
    }

    // Decrypt distributor password (or reuse author password)
    let distributorPassword = input.distributorPassword || authorPassword;
    if (!input.distributorPassword && fs.existsSync(distributorPwdPath)) {
      try {
        distributorPassword =
          await samsungPwdStore.decryptPassword(distributorPwdPath);
      } catch (err) {
        return formatError(
          COMMAND,
          "samsung_pwd_store_failed",
          `Failed to decrypt distributor password: ${err.message}`,
        );
      }
    }

    // Resolve the Samsung distributor CA certificate
    let caCertPath;
    try {
      caCertPath = resolveSamsungCaPath(
        normalizedPrivilege === "Partner" ? "partner2" : "public2",
      );
    } catch (error) {
      return formatError(COMMAND, "samsung_ca_not_found", error.message);
    }

    // Resolve tz binary
    const { resolveTzBinary } = require("./certificate");
    const resolvedTz = resolveTzBinary();
    if (resolvedTz.error) {
      return formatError(COMMAND, "sdk_path_not_set", resolvedTz.error);
    }

    // Build profiles.xml path
    const profilesXml = path.join(resolved.dataPath, "profile", "profiles.xml");

    // Ensure profiles.xml exists
    const { ensureProfilesXml } = require("./certificate");
    ensureProfilesXml(profilesXml);

    // Build tz security-profiles add command
    const args = [
      "security-profiles",
      "add",
      "-n",
      profileName,
      "-a",
      authorP12Path,
      "-p",
      authorPassword,
      "-d",
      distributorP12Path,
      "-P",
      distributorPassword,
      "-C",
      caCertPath,
      "-x",
      profilesXml,
    ];
    if (input.active) args.push("-A");

    // Run tz command
    const { execFileSync } = require("child_process");
    let tzError = "";
    try {
      execFileSync(resolvedTz.tzPath, args, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
        windowsHide: true,
      });
    } catch (err) {
      tzError = (err.stderr || err.stdout || "").toString().trim();
      return formatError(
        COMMAND,
        "profile_creation_failed",
        `Failed to create Samsung signing profile: ${tzError || err.message}`,
      );
    }

    const envelope = new Envelope(COMMAND);
    envelope.startTime = startTime;
    return envelope.success({
      profile_name: profileName,
      privilege: normalizedPrivilege,
      author_cert: authorP12Path,
      distributor_cert: distributorP12Path,
      distributor_ca: caCertPath,
      profiles_xml: profilesXml,
      active: !!input.active,
      message: `Samsung signing profile "${profileName}" created successfully with Samsung-issued distributor certificate.`,
    });
  } catch (error) {
    return formatError(
      COMMAND,
      "profile_creation_failed",
      `Failed to create Samsung signing profile: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Cancel any active Samsung certificate generation.
 *
 * Aborts the pending OAuth authentication flow if one is in progress.
 *
 * @returns {object} Standard JSON Envelope
 */
function cancelSamsungCertificateGeneration() {
  const COMMAND = "tizen-sdk certificate-manager cancel-samsung-cert";
  const startTime = Date.now();

  const cancelled = samsungAuth.cancelSamsungAuth();

  const envelope = new Envelope(COMMAND);
  envelope.startTime = startTime;
  return envelope.success({
    cancelled,
    message: cancelled
      ? "Active Samsung authentication was cancelled."
      : "No active Samsung authentication to cancel.",
  });
}

module.exports = {
  generateSamsungAuthorCertificate,
  generateSamsungDistributorCertificate,
  importSamsungCertificate,
  createSamsungProfile,
  cancelSamsungCertificateGeneration,
  // DUID helpers (re-exported from samsung-duid for convenience)
  parseDuidList: samsungDuid.parseDuidList,
  importDuidsFromFile: samsungDuid.importDuidsFromFile,
  acquireDuidFromDevice: samsungDuid.acquireDuidFromDevice,
  acquireDuidsFromAllDevices: samsungDuid.acquireDuidsFromAllDevices,
  // internal helpers exported for testing
  isValidPassword,
  resolveKeytoolBinary,
  resolveOpenSslBinary,
  buildRequestConfig,
  buildDistributorSanConfig,
  generateKeyAndCsr,
  generateDistributorKeyAndCsr,
  packagePkcs12,
  packageDistributorPkcs12,
  resolveSamsungCaPath,
};
