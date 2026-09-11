// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Tizen certificate manager domain: local (self-signed) Tizen author/distributor
 * certificate and signing-profile management. Samsung online-CA certificates,
 * DUID retrieval, and Android JKS import are explicitly out of scope.
 *
 * `tz` (the Tizen SDK core CLI already used elsewhere in this repo) natively
 * implements certificate generation (`tz cert`) and signing-profile CRUD
 * (`tz security-profiles list|add|set-active|remove`) — this module is a thin
 * wrapper over those commands, not a crypto reimplementation.
 *
 * Actions:
 *   - generateAuthorCertificate: `tz cert` — generate a local Tizen author certificate
 *   - listDistributorCertificates: resolve bundled distributor cert/CA paths (no generation, no `tz` call)
 *   - createSigningProfile: combine author + distributor certificates into a named signing profile
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
// One resolver for SDK root + data path, shared with remote-device, samsung-cert,
// samsung-auth and sdk-commands. Do not clone it here: certificate.test.js
// mocks this exact import to keep generateAuthorCertificate() off the real SDK.
const { resolveSdkDataPath } = require("./sdb");

/** Bundled distributor certificate types (subdir is `sdk-<type>`) */
const DISTRIBUTOR_TYPES = ["public", "partner", "platform"];
/** Bundled distributor certificate versions (file name suffix for "new") */
const DISTRIBUTOR_VERSIONS = ["legacy", "new"];
const DEFAULT_DISTRIBUTOR_PASSWORD = "tizenpkcs12passfordsigner";

/**
 * Validate password strength: at least 8 characters, with at least one
 * uppercase letter, one lowercase letter, and one digit. Matches the
 * validation the Tizen certificate tooling itself expects.
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
 * Sanitize a certificate file name: strip characters that are unsafe in a
 * file name (path separators, quotes, etc.), collapse whitespace to "-".
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeFileName(name) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Resolve the `tz` binary path from the configured Tizen SDK.
 * `tz` always lives at `<sdk-root>/tools/tizen-core/tz[.exe]`.
 *
 * @returns {{tzPath: string, sdkRoot: string, dataPath: string}|{error: string}}
 */
function resolveTzBinary() {
  const resolved = resolveSdkDataPath();
  if (resolved.error) return { error: resolved.error };
  const ext = process.platform === "win32" ? ".exe" : "";
  const tzPath = path.join(resolved.sdkRoot, "tools", "tizen-core", `tz${ext}`);
  if (!fs.existsSync(tzPath)) {
    return {
      error: `tz binary not found at ${tzPath}. Run tizen-sdk-init with the correct SDK path.`,
    };
  }
  return { tzPath, sdkRoot: resolved.sdkRoot, dataPath: resolved.dataPath };
}

/**
 * Run `tz` and return { stdout, stderr }. Does not throw on non-zero exit —
 * callers inspect stdout/stderr themselves, since `tz cert` errors are more
 * informative in text than via exit code alone.
 *
 * @param {string} tzPath
 * @param {string[]} args
 * @returns {{stdout: string, stderr: string, status: number}}
 */
function runTz(tzPath, args) {
  try {
    const stdout = execFileSync(tzPath, args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ? error.stdout.toString() : "",
      stderr: error.stderr ? error.stderr.toString() : error.message,
      status: typeof error.status === "number" ? error.status : 1,
    };
  }
}

/**
 * Pass a value through as a single argv entry. runTz uses execFileSync (no shell),
 * so no quoting/escaping is needed — passwords and names reach `tz` byte-for-byte.
 */
function quote(value) {
  return String(value);
}

/**
 * Error text that means the write itself was refused — the profile store lives
 * under <sdk>-data, which Codex CLI's sandbox (and a root-owned SDK) deny.
 */
const PERMISSION_DENIED_RE =
  /\b(EACCES|EPERM|EROFS)\b|Permission denied|Access is denied|access denied|Read-only file system|Operation not permitted|UnauthorizedAccessException/i;

function isPermissionDenied(...texts) {
  return texts.some(
    (t) => typeof t === "string" && PERMISSION_DENIED_RE.test(t),
  );
}

/**
 * formatError for a profiles.xml / keystore write that failed: when the tz
 * output or the exception is a permission refusal the category becomes
 * permission_denied (TIZEN_SDK_IO_E002) and the message says how to get the
 * write through — issue #75 saw "profiles.xml is access-denied" surface as an
 * opaque profile_update_failed under Codex's sandbox.
 *
 * @param {string} command
 * @param {string} fallbackCategory - category when it is not a permission problem
 * @param {string} message
 * @param {string} target - the file/dir that was being written
 * @param {string[]} texts - tz stdout/stderr / exception message to classify
 * @param {number} [startTime]
 */
function profileWriteError(
  command,
  fallbackCategory,
  message,
  target,
  texts,
  startTime,
) {
  if (!isPermissionDenied(...texts)) {
    return formatError(command, fallbackCategory, message, null, startTime);
  }
  return formatError(
    command,
    "permission_denied",
    `${message} Write access to "${target}" was denied. Under Codex CLI the default sandbox blocks writes ` +
      "outside the workspace — re-run this exact command with escalated permissions; otherwise fix the " +
      "permissions/ownership of that file (it is under <sdk>-data).",
    null,
    startTime,
  );
}

/**
 * Write the author certificate's password sidecar when `tz cert` did not.
 * `tz security-profiles add` and `tz build -s <profile>` read <file>.pwd next
 * to <file>.p12; some SDK builds never create it, and the workaround used to
 * be a hand-run `echo -n <password> > …pwd` — which a sandboxed agent cannot
 * do (issue #75: "the .pwd sidecar is missing"). Plain text, mode 0600, the
 * same content the manual step wrote. Never overwrites an existing file.
 *
 * @param {string} certPath - the .p12 path
 * @param {string} password
 * @returns {{pwd_path: string, existed: boolean, created: boolean, error: string|null}}
 */
function ensurePwdSidecar(certPath, password) {
  const pwdPath = certPath.replace(/\.p12$/i, ".pwd");
  if (fs.existsSync(pwdPath)) {
    return { pwd_path: pwdPath, existed: true, created: false, error: null };
  }
  try {
    fs.writeFileSync(pwdPath, password, { encoding: "utf-8", mode: 0o600 });
    return { pwd_path: pwdPath, existed: false, created: true, error: null };
  } catch (error) {
    return {
      pwd_path: pwdPath,
      existed: false,
      created: false,
      error: error.message,
    };
  }
}

/**
 * Generate a local Tizen author certificate via `tz cert`.
 *
 * @param {object} input
 * @param {string} input.name - Author's name (required, `tz cert -n`)
 * @param {string} input.password - Certificate password (required, `tz cert -p`)
 * @param {string} [input.fileName] - Output file name without extension (`tz cert -f`); defaults to a sanitized `name`
 * @param {string} [input.email] - `tz cert -e`
 * @param {string} [input.department] - `tz cert -d`
 * @param {string} [input.organization] - `tz cert -o`
 * @param {string} [input.city] - `tz cert -c`
 * @param {string} [input.state] - `tz cert -s`
 * @param {string} [input.country] - `tz cert -C`
 * @returns {Promise<object>} Standard JSON Envelope — result.cert_path / result.pwd_file_exists
 */
async function generateAuthorCertificate(
  input = {},
  command = "tizen-sdk certificate-manager generate-author",
) {
  const startTime = Date.now();
  try {
    const {
      name,
      password,
      email,
      department,
      organization,
      city,
      state,
      country,
    } = input;
    let { fileName } = input;

    if (!name || typeof name !== "string" || !name.trim()) {
      return formatError(
        command,
        "invalid_parameters",
        "Author name is required (--name).",
        "tizen-sdk certificate-manager --action generate-author --name <name> --password <password>",
      );
    }
    if (!password || typeof password !== "string") {
      return formatError(
        command,
        "invalid_parameters",
        "Password is required (--password).",
        `tizen-sdk certificate-manager --action generate-author --name ${quote(name)} --password <password>`,
      );
    }
    if (!isValidPassword(password)) {
      return formatError(
        command,
        "cert_password_invalid",
        "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a digit.",
      );
    }

    fileName =
      fileName && fileName.trim()
        ? sanitizeFileName(fileName)
        : sanitizeFileName(name);
    if (!fileName) {
      return formatError(
        command,
        "invalid_parameters",
        "Could not derive a valid certificate file name — pass --file explicitly.",
      );
    }

    const resolvedTz = resolveTzBinary();
    if (resolvedTz.error) {
      return formatError(command, "sdk_path_not_set", resolvedTz.error);
    }

    const expectedPath = path.join(
      resolvedTz.dataPath,
      "keystore",
      "author",
      `${fileName}.p12`,
    );
    if (fs.existsSync(expectedPath)) {
      return formatError(
        command,
        "cert_already_exists",
        `Author certificate already exists at "${expectedPath}". Certificates are never overwritten. Reuse this certificate with create-profile, or run generate-author again with a unique --file value.`,
      );
    }

    const args = [
      "cert",
      "-n",
      quote(name),
      "-p",
      quote(password),
      "-f",
      quote(fileName),
    ];
    if (email) args.push("-e", quote(email));
    if (department) args.push("-d", quote(department));
    if (organization) args.push("-o", quote(organization));
    if (city) args.push("-c", quote(city));
    if (state) args.push("-s", quote(state));
    if (country) args.push("-C", quote(country));

    const { stdout, stderr, status } = runTz(resolvedTz.tzPath, args);

    // tz cert prints: "certificate created at : <path>"
    const match = /certificate created at\s*:\s*(.+)/i.exec(stdout);
    let certPath = match ? match[1].trim() : null;

    const warnings = [];
    if (certPath && path.resolve(certPath) !== path.resolve(expectedPath)) {
      warnings.push(
        `tz reported the certificate at "${certPath}", which differs from the expected path "${expectedPath}".`,
      );
    }
    if (!certPath) {
      certPath = expectedPath;
    }

    if (status !== 0 || !fs.existsSync(certPath)) {
      return formatError(
        command,
        "cert_generation_failed",
        `tz cert did not produce a certificate at "${certPath}". stdout: ${stdout.trim() || "(empty)"} stderr: ${stderr.trim() || "(empty)"}`,
        null,
        startTime,
      );
    }

    const sidecar = ensurePwdSidecar(certPath, password);
    if (sidecar.error) {
      warnings.push(
        `tz cert did not create the password sidecar and writing it failed (${sidecar.error}). ` +
          `Signing will fail until it exists: create "${sidecar.pwd_path}" containing exactly the password ` +
          "(mode 600), or re-run generate-author with escalated permissions under Codex CLI.",
      );
    } else if (sidecar.created) {
      warnings.push(
        `tz cert did not create the password sidecar; wrote "${sidecar.pwd_path}" (mode 600) so create-profile and tz build can read the password.`,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        name,
        file_name: fileName,
        cert_path: certPath,
        pwd_path: sidecar.pwd_path,
        pwd_file_exists: sidecar.existed || sidecar.created,
        pwd_file_created: sidecar.created,
      },
      { warnings },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to generate author certificate: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Resolve the CA/signer paths for one bundled distributor certificate
 * (type, version) pair. Distributor certs are pre-built and shipped with the
 * SDK — nothing is generated here, this only resolves and checks paths.
 *
 * @param {string} sdkRoot
 * @param {string} type - 'public' | 'partner' | 'platform'
 * @param {string} version - 'legacy' | 'new'
 * @returns {{type: string, version: string, ca_path: string, signer_path: string, exists: boolean}}
 */
function resolveDistributorAssetPaths(sdkRoot, type, version) {
  const dir = path.join(
    sdkRoot,
    "tools",
    "certificate-generator",
    "certificates",
    "distributor",
    `sdk-${type}`,
  );
  const suffix = version === "new" ? "-new" : "";
  const caPath = path.join(dir, `tizen-distributor-ca${suffix}.cer`);
  const signerPath = path.join(dir, `tizen-distributor-signer${suffix}.p12`);
  return {
    type,
    version,
    ca_path: caPath,
    signer_path: signerPath,
    exists: fs.existsSync(caPath) && fs.existsSync(signerPath),
  };
}

/**
 * List (or select a specific) bundled Tizen distributor certificate. These
 * are pre-built and shipped with the SDK — no generation, no `tz` call.
 *
 * @param {object} [input]
 * @param {string} [input.type] - 'public' | 'partner' | 'platform' (omit to list all types)
 * @param {string} [input.version] - 'legacy' | 'new' (omit to list all versions)
 * @returns {Promise<object>} Standard JSON Envelope — result.distributors / result.unavailable
 */
async function listDistributorCertificates(
  input = {},
  command = "tizen-sdk certificate-manager list-distributors",
) {
  const startTime = Date.now();
  try {
    let { type, version } = input;
    type = type ? String(type).toLowerCase() : undefined;
    version = version ? String(version).toLowerCase() : undefined;

    if (type !== undefined && !DISTRIBUTOR_TYPES.includes(type)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid --type: "${type}". Must be one of ${DISTRIBUTOR_TYPES.join(", ")}.`,
      );
    }
    if (version !== undefined && !DISTRIBUTOR_VERSIONS.includes(version)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid --version: "${version}". Must be one of ${DISTRIBUTOR_VERSIONS.join(", ")}.`,
      );
    }

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(command, "sdk_path_not_set", resolved.error);
    }

    const types = type ? [type] : DISTRIBUTOR_TYPES;
    const versions = version ? [version] : DISTRIBUTOR_VERSIONS;

    const resolvedPairs = [];
    for (const t of types) {
      for (const v of versions) {
        resolvedPairs.push(
          resolveDistributorAssetPaths(resolved.sdkRoot, t, v),
        );
      }
    }

    const available = resolvedPairs
      .filter((p) => p.exists)
      .map(({ _exists, ...rest }) => rest);
    const unavailable = resolvedPairs
      .filter((p) => !p.exists)
      .map(({ type: t, version: v }) => ({ type: t, version: v }));

    if (type !== undefined && version !== undefined && available.length === 0) {
      return formatError(
        command,
        "distributor_asset_not_found",
        `No bundled distributor certificate found for type "${type}", version "${version}" on this SDK install.`,
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      sdk_root: resolved.sdkRoot,
      distributors: available,
      unavailable,
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to list distributor certificates: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Resolve the profiles.xml used by certificate-manager operations.
 *
 * @param {string} dataPath
 * @param {string} [profilesXml]
 * @returns {string}
 */
function resolveProfilesXmlPath(dataPath, profilesXml) {
  return profilesXml
    ? path.resolve(String(profilesXml))
    : path.join(dataPath, "profile", "profiles.xml");
}

/**
 * `tz security-profiles` requires profiles.xml to exist even for the first
 * profile. Initialize an empty version-2.2 document when needed.
 *
 * @param {string} profilesXml
 */
function ensureProfilesXml(profilesXml) {
  if (fs.existsSync(profilesXml)) return;
  fs.mkdirSync(path.dirname(profilesXml), { recursive: true });
  fs.writeFileSync(
    profilesXml,
    '<?xml version="1.0" encoding="UTF-8"?>\n<profiles version="2.2">\n</profiles>\n',
    "utf-8",
  );
}

function decodeXmlAttribute(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseXmlAttributes(source) {
  const attributes = {};
  const pattern = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    attributes[match[1]] = decodeXmlAttribute(match[2]);
  }
  return attributes;
}

/**
 * Describe a configured profile file path without opening certificate contents
 * or exposing profile passwords. `available` means only that a readable
 * regular file exists; it does not claim that the certificate/password is
 * cryptographically valid.
 */
function getProfilePathStatus(filePath) {
  if (!filePath) return "not_configured";
  try {
    if (!fs.statSync(filePath).isFile()) return "not_file";
    fs.accessSync(filePath, fs.constants.R_OK);
    return "available";
  } catch (_error) {
    return fs.existsSync(filePath) ? "unreadable" : "missing";
  }
}

function addProfilePathStatuses(profile) {
  const unavailable = [];
  for (const [role, certificate] of [
    ["author", profile.author],
    ["distributor", profile.distributor],
    ["distributor2", profile.distributor2],
  ]) {
    if (!certificate) continue;
    for (const [field, statusField] of [
      ["key_path", "key_status"],
      ["ca_path", "ca_status"],
      ["rootca_path", "rootca_status"],
    ]) {
      const status = getProfilePathStatus(certificate[field]);
      certificate[statusField] = status;
      if (certificate[field] && status !== "available") {
        unavailable.push({ role, field, path: certificate[field], status });
      }
    }
  }

  profile.unavailable_certificate_paths = unavailable;
  profile.certificate_files_available =
    profile.author?.key_status === "available" &&
    profile.distributor?.key_status === "available" &&
    unavailable.length === 0;
  return profile;
}

/**
 * Parse profiles.xml into a stable, password-free result shape.
 *
 * @param {string} profilesXml
 * @returns {{active_profile: string|null, profiles: object[]}}
 */
function readSigningProfiles(profilesXml) {
  if (!fs.existsSync(profilesXml)) {
    return { active_profile: null, profiles: [] };
  }
  const xml = fs.readFileSync(profilesXml, "utf-8");
  const rootMatch = /<profiles\b([^>]*)>/i.exec(xml);
  const activeProfile = rootMatch
    ? parseXmlAttributes(rootMatch[1]).active || null
    : null;
  const profiles = [];
  const profilePattern = /<profile\b([^>]*)>([\s\S]*?)<\/profile>/gi;
  let profileMatch;
  while ((profileMatch = profilePattern.exec(xml)) !== null) {
    const profileAttrs = parseXmlAttributes(profileMatch[1]);
    const items = {};
    const itemPattern = /<profileitem\b([^>]*)>/gi;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(profileMatch[2])) !== null) {
      const item = parseXmlAttributes(itemMatch[1]);
      items[item.distributor] = {
        key_path: item.key || "",
        ca_path: item.ca || "",
        rootca_path: item.rootca || "",
        // tz stores the (encrypted) password on the item when it could read
        // it at add time; empty means signing depends on the .pwd sidecar.
        has_password: Boolean(item.password && item.password.trim()),
      };
    }
    profiles.push(
      addProfilePathStatuses({
        name: profileAttrs.name || "",
        active: profileAttrs.name === activeProfile,
        author: items["0"] || null,
        distributor: items["1"] || null,
        distributor2: items["2"] || null,
      }),
    );
  }
  return { active_profile: activeProfile, profiles };
}

/**
 * Check the signing-profile state required by `tz pack` without reading
 * passwords or invoking the SDK. A profile can only be selected when its
 * author and primary distributor certificate files still exist and are
 * readable. Cryptographic/password validation remains the responsibility of
 * `tz pack`, because profile passwords are intentionally not exposed here.
 *
 * @param {object} [input]
 * @param {string} [input.profileName] Explicit profile; otherwise use active
 * @param {string} [input.profilesXml] Test/advanced override for profiles.xml
 * @returns {{valid: boolean, profileName?: string, profilesXml?: string, error?: string}}
 */
function preflightSigningProfile(input = {}) {
  let profilesXml = input.profilesXml
    ? path.resolve(String(input.profilesXml))
    : "";
  if (!profilesXml) {
    const resolved = resolveSdkDataPath();
    if (resolved.error) return { valid: false, error: resolved.error };
    profilesXml = resolveProfilesXmlPath(resolved.dataPath);
  }

  const requestedName =
    typeof input.profileName === "string" ? input.profileName.trim() : "";
  const parsed = readSigningProfiles(profilesXml);
  const profileName = requestedName || parsed.active_profile;
  if (!profileName) {
    // No explicit --sign-profile and no active profile in profiles.xml.
    // Mirror the VS Code extension: let `tz` use its built-in default
    // developer certificates (tempMobile.p12 + tizen-distributor-signer.p12)
    // instead of blocking the build. The user only needs a custom profile
    // for distribution to real devices or app store submission.
    return {
      valid: true,
      profilesXml,
      usingDefaultCertificates: true,
    };
  }

  const profile = parsed.profiles.find((entry) => entry.name === profileName);

  if (!profile) {
    return {
      valid: false,
      profileName,
      profilesXml,
      error: `Signing profile "${profileName}" was not found in "${profilesXml}". Use tizen-certificate-manager --action list-profiles, then create or select a valid profile.`,
    };
  }

  const missing = [];
  for (const [label, certificate] of [
    ["author", profile.author],
    ["distributor", profile.distributor],
  ]) {
    const certificatePath = certificate?.key_path;
    if (!certificatePath) {
      missing.push(`${label} certificate path is not configured`);
      continue;
    }
    try {
      fs.accessSync(certificatePath, fs.constants.R_OK);
      if (!fs.statSync(certificatePath).isFile()) {
        missing.push(
          `${label} certificate is not a file: "${certificatePath}"`,
        );
      }
    } catch (_error) {
      missing.push(
        `${label} certificate is missing or unreadable: "${certificatePath}"`,
      );
    }
  }

  // The author password: tz reads it from the item's password attribute or
  // from the <file>.pwd sidecar next to the .p12. With neither, packaging
  // fails inside tz with an opaque decryption error (issue #75).
  const authorKey = profile.author?.key_path || "";
  if (
    missing.length === 0 &&
    /\.p12$/i.test(authorKey) &&
    !profile.author.has_password
  ) {
    const pwdPath = authorKey.replace(/\.p12$/i, ".pwd");
    let readable = false;
    try {
      fs.accessSync(pwdPath, fs.constants.R_OK);
      readable = fs.statSync(pwdPath).isFile();
    } catch (_error) {
      readable = false;
    }
    if (!readable) {
      missing.push(
        `author certificate password file is missing or unreadable: "${pwdPath}" (and profiles.xml stores no password for it) — re-run generate-author (it recreates the sidecar) or restore the file with the same password`,
      );
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      profileName,
      profilesXml,
      error: `Signing profile "${profileName}" cannot package an app: ${missing.join("; ")}. Recreate or repair the profile with tizen-certificate-manager before building.`,
    };
  }

  return { valid: true, profileName, profilesXml };
}

/**
 * Create a named Tizen signing profile.
 *
 * @param {object} input
 * @param {string} input.profileName
 * @param {string} input.authorCertPath
 * @param {string} input.authorPassword
 * @param {string} [input.distributorType='public']
 * @param {string} [input.distributorVersion='new']
 * @param {string} [input.distributorPassword]
 * @param {string} [input.distributor2CertPath]
 * @param {string} [input.distributor2Password]
 * @param {string} [input.distributor2CaPath]
 * @param {boolean} [input.active=false]
 * @param {string} [input.profilesXml]
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function createSigningProfile(
  input = {},
  command = "tizen-sdk certificate-manager create-profile",
) {
  const startTime = Date.now();
  try {
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";
    const authorCertPath = input.authorCertPath
      ? path.resolve(String(input.authorCertPath))
      : "";
    const authorPassword =
      typeof input.authorPassword === "string" ? input.authorPassword : "";
    const distributorType = String(
      input.distributorType || "public",
    ).toLowerCase();
    const distributorVersion = String(
      input.distributorVersion || "new",
    ).toLowerCase();

    if (!profileName) {
      return formatError(
        command,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }
    if (!authorCertPath || !authorPassword) {
      return formatError(
        command,
        "invalid_parameters",
        "Author certificate and password are required (--author-cert and --author-password).",
      );
    }
    if (
      !fs.existsSync(authorCertPath) ||
      path.extname(authorCertPath).toLowerCase() !== ".p12"
    ) {
      return formatError(
        command,
        "invalid_parameters",
        `Author certificate must be an existing .p12 file: "${authorCertPath}".`,
      );
    }
    if (
      !DISTRIBUTOR_TYPES.includes(distributorType) ||
      !DISTRIBUTOR_VERSIONS.includes(distributorVersion)
    ) {
      return formatError(
        command,
        "invalid_parameters",
        `Distributor must use type ${DISTRIBUTOR_TYPES.join(", ")} and version ${DISTRIBUTOR_VERSIONS.join(", ")}.`,
      );
    }

    const resolvedTz = resolveTzBinary();
    if (resolvedTz.error) {
      return formatError(command, "sdk_path_not_set", resolvedTz.error);
    }

    const distributor = resolveDistributorAssetPaths(
      resolvedTz.sdkRoot,
      distributorType,
      distributorVersion,
    );
    if (!distributor.exists) {
      return formatError(
        command,
        "distributor_asset_not_found",
        `No bundled distributor certificate found for type "${distributorType}", version "${distributorVersion}" on this SDK install.`,
      );
    }

    const profilesXml = resolveProfilesXmlPath(
      resolvedTz.dataPath,
      input.profilesXml,
    );
    ensureProfilesXml(profilesXml);

    const args = [
      "security-profiles",
      "add",
      "-n",
      quote(profileName),
      "-a",
      quote(authorCertPath),
      "-p",
      quote(authorPassword),
      "-d",
      quote(distributor.signer_path),
      "-P",
      quote(input.distributorPassword || DEFAULT_DISTRIBUTOR_PASSWORD),
      "-C",
      quote(distributor.ca_path),
      "-x",
      quote(profilesXml),
    ];
    if (input.active) args.push("-A");

    let distributor2 = null;
    if (
      input.distributor2CertPath ||
      input.distributor2Password ||
      input.distributor2CaPath
    ) {
      const certPath = input.distributor2CertPath
        ? path.resolve(String(input.distributor2CertPath))
        : "";
      const password =
        typeof input.distributor2Password === "string"
          ? input.distributor2Password
          : "";
      if (!certPath || !password || !fs.existsSync(certPath)) {
        return formatError(
          command,
          "invalid_parameters",
          "Distributor 2 requires an existing --distributor2-cert and --distributor2-password.",
        );
      }
      args.push("-D", quote(certPath), "-w", quote(password));
      if (input.distributor2CaPath) {
        const caPath = path.resolve(String(input.distributor2CaPath));
        if (!fs.existsSync(caPath)) {
          return formatError(
            command,
            "invalid_parameters",
            `Distributor 2 CA file not found: "${caPath}".`,
          );
        }
        args.push("-e", quote(caPath));
      }
      distributor2 = {
        signer_path: certPath,
        ca_path: input.distributor2CaPath
          ? path.resolve(String(input.distributor2CaPath))
          : null,
      };
    }

    const { stdout, stderr, status } = runTz(resolvedTz.tzPath, args);
    if (status !== 0) {
      return profileWriteError(
        command,
        "profile_creation_failed",
        `Failed to create signing profile "${profileName}". stdout: ${stdout.trim() || "(empty)"} stderr: ${stderr.trim() || "(empty)"}`,
        profilesXml,
        [stdout, stderr],
        startTime,
      );
    }

    const persisted = readSigningProfiles(profilesXml);
    const createdProfile = persisted.profiles.find(
      (profile) => profile.name === profileName,
    );
    if (!createdProfile) {
      return formatError(
        command,
        "profile_creation_failed",
        `tz reported success but profile "${profileName}" was not found in "${profilesXml}".`,
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      profile_name: profileName,
      active: createdProfile.active,
      profiles_xml: profilesXml,
      author_cert_path: authorCertPath,
      distributor: {
        type: distributorType,
        version: distributorVersion,
        ca_path: distributor.ca_path,
        signer_path: distributor.signer_path,
      },
      distributor2,
    });
  } catch (error) {
    return profileWriteError(
      command,
      "profile_creation_failed",
      `Failed to create signing profile: ${error.message}`,
      "<sdk>-data/profile/profiles.xml",
      [error.message],
      startTime,
    );
  }
}

/**
 * List signing profiles from the SDK's profiles.xml.
 *
 * @param {object} [input]
 * @param {string} [input.profilesXml]
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function listSigningProfiles(
  input = {},
  command = "tizen-sdk certificate-manager list-profiles",
) {
  const startTime = Date.now();
  try {
    const resolvedTz = resolveTzBinary();
    if (resolvedTz.error) {
      return formatError(command, "sdk_path_not_set", resolvedTz.error);
    }
    const profilesXml = resolveProfilesXmlPath(
      resolvedTz.dataPath,
      input.profilesXml,
    );
    if (!fs.existsSync(profilesXml)) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success({
        profiles_xml: profilesXml,
        active_profile: null,
        profiles: [],
      });
    }

    const { stdout, stderr, status } = runTz(resolvedTz.tzPath, [
      "security-profiles",
      "list",
      "-x",
      quote(profilesXml),
    ]);
    if (status !== 0) {
      return formatError(
        command,
        "profile_list_failed",
        `Failed to list signing profiles. stdout: ${stdout.trim() || "(empty)"} stderr: ${stderr.trim() || "(empty)"}`,
        null,
        startTime,
      );
    }

    const parsed = readSigningProfiles(profilesXml);
    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      profiles_xml: profilesXml,
      active_profile: parsed.active_profile,
      profiles: parsed.profiles,
    });
  } catch (error) {
    return formatError(
      command,
      "profile_list_failed",
      `Failed to list signing profiles: ${error.message}`,
      null,
      startTime,
    );
  }
}

async function setActiveSigningProfile(
  input = {},
  command = "tizen-sdk certificate-manager set-active-profile",
) {
  const startTime = Date.now();
  try {
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";
    if (!profileName) {
      return formatError(
        command,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }
    const resolvedTz = resolveTzBinary();
    if (resolvedTz.error) {
      return formatError(command, "sdk_path_not_set", resolvedTz.error);
    }
    const profilesXml = resolveProfilesXmlPath(
      resolvedTz.dataPath,
      input.profilesXml,
    );
    const before = readSigningProfiles(profilesXml);
    if (!before.profiles.some((profile) => profile.name === profileName)) {
      return formatError(
        command,
        "profile_not_found",
        `Signing profile not found: "${profileName}".`,
      );
    }

    const { stdout, stderr, status } = runTz(resolvedTz.tzPath, [
      "security-profiles",
      "set-active",
      quote(profileName),
      "-x",
      quote(profilesXml),
    ]);
    if (status !== 0) {
      return profileWriteError(
        command,
        "profile_update_failed",
        `Failed to set active profile "${profileName}". stdout: ${stdout.trim() || "(empty)"} stderr: ${stderr.trim() || "(empty)"}`,
        profilesXml,
        [stdout, stderr],
        startTime,
      );
    }
    const after = readSigningProfiles(profilesXml);
    if (after.active_profile !== profileName) {
      return formatError(
        command,
        "profile_update_failed",
        `tz reported success but active profile is "${after.active_profile || "(none)"}".`,
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      profile_name: profileName,
      previous_active_profile: before.active_profile,
      active_profile: after.active_profile,
      profiles_xml: profilesXml,
    });
  } catch (error) {
    return profileWriteError(
      command,
      "profile_update_failed",
      `Failed to set active signing profile: ${error.message}`,
      "<sdk>-data/profile/profiles.xml",
      [error.message],
      startTime,
    );
  }
}

async function removeSigningProfile(
  input = {},
  command = "tizen-sdk certificate-manager remove-profile",
) {
  const startTime = Date.now();
  try {
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";
    if (!profileName) {
      return formatError(
        command,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }
    const resolvedTz = resolveTzBinary();
    if (resolvedTz.error) {
      return formatError(command, "sdk_path_not_set", resolvedTz.error);
    }
    const profilesXml = resolveProfilesXmlPath(
      resolvedTz.dataPath,
      input.profilesXml,
    );
    const before = readSigningProfiles(profilesXml);
    if (!before.profiles.some((profile) => profile.name === profileName)) {
      return formatError(
        command,
        "profile_not_found",
        `Signing profile not found: "${profileName}".`,
      );
    }

    const { stdout, stderr, status } = runTz(resolvedTz.tzPath, [
      "security-profiles",
      "remove",
      quote(profileName),
      "-x",
      quote(profilesXml),
    ]);
    if (status !== 0) {
      return formatError(
        command,
        "profile_remove_failed",
        `Failed to remove profile "${profileName}". stdout: ${stdout.trim() || "(empty)"} stderr: ${stderr.trim() || "(empty)"}`,
        null,
        startTime,
      );
    }
    const after = readSigningProfiles(profilesXml);
    if (after.profiles.some((profile) => profile.name === profileName)) {
      return formatError(
        command,
        "profile_remove_failed",
        `tz reported success but profile "${profileName}" still exists.`,
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      removed_profile: profileName,
      previous_active_profile: before.active_profile,
      active_profile: after.active_profile,
      profiles_xml: profilesXml,
      remaining_profiles: after.profiles.map((profile) => profile.name),
    });
  } catch (error) {
    return formatError(
      command,
      "profile_remove_failed",
      `Failed to remove signing profile: ${error.message}`,
      null,
      startTime,
    );
  }
}

async function setSigningProfileDistributor2(
  input = {},
  command = "tizen-sdk certificate-manager set-distributor2",
) {
  const startTime = Date.now();
  let tempProfilesXml = null;
  try {
    const profileName =
      typeof input.profileName === "string" ? input.profileName.trim() : "";
    const authorPassword =
      typeof input.authorPassword === "string" ? input.authorPassword : "";
    const distributor2Type = String(
      input.distributor2Type || "partner",
    ).toLowerCase();
    const distributor2Version = String(
      input.distributor2Version || "new",
    ).toLowerCase();
    if (!profileName || !authorPassword) {
      return formatError(
        command,
        "invalid_parameters",
        "Profile name and author password are required (--profile-name and --author-password).",
      );
    }
    if (
      !DISTRIBUTOR_TYPES.includes(distributor2Type) ||
      !DISTRIBUTOR_VERSIONS.includes(distributor2Version)
    ) {
      return formatError(
        command,
        "invalid_parameters",
        "Invalid distributor 2 type or version.",
      );
    }

    const resolvedTz = resolveTzBinary();
    if (resolvedTz.error) {
      return formatError(command, "sdk_path_not_set", resolvedTz.error);
    }
    const profilesXml = resolveProfilesXmlPath(
      resolvedTz.dataPath,
      input.profilesXml,
    );
    const before = readSigningProfiles(profilesXml);
    const profile = before.profiles.find((entry) => entry.name === profileName);
    if (!profile) {
      return formatError(
        command,
        "profile_not_found",
        `Signing profile not found: "${profileName}".`,
      );
    }
    if (!profile.author?.key_path || !profile.distributor?.key_path) {
      return formatError(
        command,
        "distributor2_update_failed",
        `Profile "${profileName}" is missing author or distributor 1 data.`,
      );
    }

    const distributor2 = resolveDistributorAssetPaths(
      resolvedTz.sdkRoot,
      distributor2Type,
      distributor2Version,
    );
    if (!distributor2.exists) {
      return formatError(
        command,
        "distributor_asset_not_found",
        `No bundled distributor certificate found for type "${distributor2Type}", version "${distributor2Version}" on this SDK install.`,
      );
    }

    tempProfilesXml = `${profilesXml}.tmp-${process.pid}-${Date.now()}`;
    fs.copyFileSync(profilesXml, tempProfilesXml);

    const removeResult = runTz(resolvedTz.tzPath, [
      "security-profiles",
      "remove",
      quote(profileName),
      "-x",
      quote(tempProfilesXml),
    ]);
    if (removeResult.status !== 0) {
      return formatError(
        command,
        "distributor2_update_failed",
        `Failed to prepare profile update. stderr: ${removeResult.stderr.trim() || "(empty)"}`,
        null,
        startTime,
      );
    }

    const addArgs = [
      "security-profiles",
      "add",
      "-n",
      quote(profileName),
      "-a",
      quote(profile.author.key_path),
      "-p",
      quote(authorPassword),
      "-d",
      quote(profile.distributor.key_path),
      "-P",
      quote(input.distributorPassword || DEFAULT_DISTRIBUTOR_PASSWORD),
      "-D",
      quote(distributor2.signer_path),
      "-w",
      quote(input.distributor2Password || DEFAULT_DISTRIBUTOR_PASSWORD),
      "-e",
      quote(distributor2.ca_path),
      "-x",
      quote(tempProfilesXml),
    ];
    if (profile.distributor.ca_path) {
      addArgs.push("-C", quote(profile.distributor.ca_path));
    }
    if (profile.active) addArgs.push("-A");

    const addResult = runTz(resolvedTz.tzPath, addArgs);
    if (addResult.status !== 0) {
      return profileWriteError(
        command,
        "distributor2_update_failed",
        `Failed to add distributor 2 to profile "${profileName}". stdout: ${addResult.stdout.trim() || "(empty)"} stderr: ${addResult.stderr.trim() || "(empty)"}`,
        profilesXml,
        [addResult.stdout, addResult.stderr],
        startTime,
      );
    }

    const updated = readSigningProfiles(tempProfilesXml);
    const updatedProfile = updated.profiles.find(
      (entry) => entry.name === profileName,
    );
    if (
      !updatedProfile ||
      updatedProfile.distributor2?.key_path !== distributor2.signer_path
    ) {
      return formatError(
        command,
        "distributor2_update_failed",
        `Updated profile did not persist the requested distributor 2 certificate.`,
        null,
        startTime,
      );
    }

    fs.copyFileSync(tempProfilesXml, profilesXml);
    fs.unlinkSync(tempProfilesXml);
    tempProfilesXml = null;

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      profile_name: profileName,
      active: updatedProfile.active,
      profiles_xml: profilesXml,
      distributor2: {
        type: distributor2Type,
        version: distributor2Version,
        ca_path: distributor2.ca_path,
        signer_path: distributor2.signer_path,
      },
      replaced: Boolean(profile.distributor2?.key_path),
    });
  } catch (error) {
    return profileWriteError(
      command,
      "distributor2_update_failed",
      `Failed to update distributor 2: ${error.message}`,
      "<sdk>-data/profile/profiles.xml",
      [error.message],
      startTime,
    );
  } finally {
    if (tempProfilesXml && fs.existsSync(tempProfilesXml)) {
      try {
        fs.unlinkSync(tempProfilesXml);
      } catch (_) {
        // Best-effort cleanup; the original profiles.xml was never replaced.
      }
    }
  }
}

function resolveKeytoolBinary(sdkRoot) {
  const ext = process.platform === "win32" ? ".exe" : "";
  const sdkKeytool = path.join(sdkRoot, "jdk", "bin", `keytool${ext}`);
  if (fs.existsSync(sdkKeytool)) return sdkKeytool;
  return `keytool${ext}`;
}

function validateCertificateFile(filePath, password, sdkRoot) {
  const extension = path.extname(filePath).toLowerCase();
  const keytool = resolveKeytoolBinary(sdkRoot);
  const args =
    extension === ".p12"
      ? [
          "-list",
          "-keystore",
          filePath,
          "-storetype",
          "PKCS12",
          "-storepass",
          password,
        ]
      : ["-printcert", "-file", filePath];
  try {
    const stdout = execFileSync(keytool, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      windowsHide: true,
    });
    return { valid: true, stdout };
  } catch (error) {
    return {
      valid: false,
      error: error.stderr ? error.stderr.toString().trim() : error.message,
    };
  }
}

async function importCertificate(
  input = {},
  command = "tizen-sdk certificate-manager import-certificate",
) {
  const startTime = Date.now();
  try {
    const sourcePath = input.sourcePath
      ? path.resolve(String(input.sourcePath))
      : "";
    const certificateType = String(
      input.certificateType || "author",
    ).toLowerCase();
    if (
      !sourcePath ||
      !fs.existsSync(sourcePath) ||
      !fs.statSync(sourcePath).isFile()
    ) {
      return formatError(
        command,
        "invalid_parameters",
        `Certificate source file not found: "${sourcePath}".`,
      );
    }
    if (!["author", "distributor"].includes(certificateType)) {
      return formatError(
        command,
        "invalid_parameters",
        "Certificate type must be author or distributor.",
      );
    }
    const extension = path.extname(sourcePath).toLowerCase();
    if (![".p12", ".cer"].includes(extension)) {
      return formatError(
        command,
        "invalid_parameters",
        "Only .p12 and .cer certificate files are supported.",
      );
    }
    if (extension === ".p12" && !input.password) {
      return formatError(
        command,
        "invalid_parameters",
        "A password is required to import a .p12 certificate.",
      );
    }

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(command, "sdk_path_not_set", resolved.error);
    }
    const validation = validateCertificateFile(
      sourcePath,
      input.password || "",
      resolved.sdkRoot,
    );
    if (!validation.valid) {
      return formatError(
        command,
        "cert_import_failed",
        `Certificate validation failed: ${validation.error || "unknown keytool error"}`,
        null,
        startTime,
      );
    }

    const requestedBase = input.fileName
      ? sanitizeFileName(path.parse(String(input.fileName)).name)
      : sanitizeFileName(path.parse(sourcePath).name);
    if (!requestedBase) {
      return formatError(
        command,
        "invalid_parameters",
        "Could not derive a valid imported certificate file name.",
      );
    }
    const destinationDir = path.join(
      resolved.dataPath,
      "keystore",
      certificateType,
    );
    const destinationPath = path.join(
      destinationDir,
      `${requestedBase}${extension}`,
    );
    if (fs.existsSync(destinationPath) && !input.overwrite) {
      return formatError(
        command,
        "cert_already_exists",
        `Certificate already exists at "${destinationPath}". Use --overwrite to replace it.`,
      );
    }
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      certificate_type: certificateType,
      source_path: sourcePath,
      imported_path: destinationPath,
      format: extension.slice(1),
      overwritten: Boolean(input.overwrite),
    });
  } catch (error) {
    return formatError(
      command,
      "cert_import_failed",
      `Failed to import certificate: ${error.message}`,
      null,
      startTime,
    );
  }
}

function firstMatch(source, pattern) {
  const match = pattern.exec(source);
  return match ? match[1].trim() : null;
}

function parseKeytoolMetadata(output) {
  const certificateSection =
    /Certificate\[1\]:([\s\S]*?)(?:Certificate\[2\]:|$)/i.exec(output);
  const source = certificateSection ? certificateSection[1] : output;
  const validity = /Valid from:\s*(.*?)\s+until:\s*(.*)/i.exec(source);
  const chainLength = firstMatch(output, /Certificate chain length:\s*(\d+)/i);
  return {
    alias: firstMatch(output, /Alias name:\s*(.+)/i),
    entry_type: firstMatch(output, /Entry type:\s*(.+)/i),
    certificate_chain_length: chainLength === null ? null : Number(chainLength),
    subject: firstMatch(source, /Owner:\s*(.+)/i),
    issuer: firstMatch(source, /Issuer:\s*(.+)/i),
    serial_number: firstMatch(source, /Serial number:\s*(.+)/i),
    valid_from: validity ? validity[1].trim() : null,
    valid_until: validity ? validity[2].trim() : null,
    signature_algorithm: firstMatch(
      source,
      /Signature algorithm name:\s*(.+)/i,
    ),
    public_key_algorithm: firstMatch(
      source,
      /Subject Public Key Algorithm:\s*(.+)/i,
    ),
    version: firstMatch(source, /^Version:\s*(.+)$/im),
    fingerprints: {
      md5: firstMatch(source, /^\s*MD5:\s*(.+)$/im),
      sha1: firstMatch(source, /^\s*SHA1:\s*(.+)$/im),
      sha256: firstMatch(source, /^\s*SHA256:\s*(.+)$/im),
    },
  };
}

async function inspectCertificate(
  input = {},
  command = "tizen-sdk certificate-manager inspect-certificate",
) {
  const startTime = Date.now();
  try {
    const certificatePath = input.certificatePath
      ? path.resolve(String(input.certificatePath))
      : "";
    if (
      !certificatePath ||
      !fs.existsSync(certificatePath) ||
      !fs.statSync(certificatePath).isFile()
    ) {
      return formatError(
        command,
        "invalid_parameters",
        `Certificate file not found: "${certificatePath}".`,
      );
    }
    const extension = path.extname(certificatePath).toLowerCase();
    if (![".p12", ".cer"].includes(extension)) {
      return formatError(
        command,
        "invalid_parameters",
        "Only .p12 and .cer certificate files are supported.",
      );
    }
    if (extension === ".p12" && !input.password) {
      return formatError(
        command,
        "invalid_parameters",
        "A password is required to inspect a .p12 certificate.",
      );
    }

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(command, "sdk_path_not_set", resolved.error);
    }
    const keytool = resolveKeytoolBinary(resolved.sdkRoot);
    const args =
      extension === ".p12"
        ? [
            "-list",
            "-v",
            "-keystore",
            certificatePath,
            "-storetype",
            "PKCS12",
            "-storepass",
            input.password,
          ]
        : ["-printcert", "-v", "-file", certificatePath];
    let output;
    try {
      output = execFileSync(keytool, args, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
        windowsHide: true,
      });
    } catch (error) {
      const detail = error.stderr
        ? error.stderr.toString().trim()
        : error.message;
      return formatError(
        command,
        "cert_inspection_failed",
        `keytool could not inspect the certificate: ${detail}`,
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      certificate_path: certificatePath,
      format: extension.slice(1),
      metadata: parseKeytoolMetadata(output),
    });
  } catch (error) {
    return formatError(
      command,
      "cert_inspection_failed",
      `Failed to inspect certificate: ${error.message}`,
      null,
      startTime,
    );
  }
}

async function getCertificateSdkDataPath(
  command = "tizen-sdk certificate-manager get-sdk-data-path",
) {
  const startTime = Date.now();
  try {
    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(command, "sdk_path_not_set", resolved.error);
    }
    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      sdk_root: resolved.sdkRoot,
      sdk_data_path: resolved.dataPath,
      sdk_info_path: path.join(resolved.sdkRoot, "sdk.info"),
      profiles_xml: resolveProfilesXmlPath(resolved.dataPath),
      author_keystore: path.join(resolved.dataPath, "keystore", "author"),
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to resolve SDK data path: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  generateAuthorCertificate,
  listDistributorCertificates,
  createSigningProfile,
  listSigningProfiles,
  setActiveSigningProfile,
  removeSigningProfile,
  setSigningProfileDistributor2,
  importCertificate,
  inspectCertificate,
  getCertificateSdkDataPath,
  // pure helpers exported for tests
  isValidPassword,
  isPermissionDenied,
  profileWriteError,
  ensurePwdSidecar,
  sanitizeFileName,
  resolveTzBinary,
  resolveDistributorAssetPaths,
  DISTRIBUTOR_TYPES,
  DISTRIBUTOR_VERSIONS,
  DEFAULT_DISTRIBUTOR_PASSWORD,
  resolveProfilesXmlPath,
  ensureProfilesXml,
  readSigningProfiles,
  getProfilePathStatus,
  addProfilePathStatuses,
  preflightSigningProfile,
  resolveKeytoolBinary,
  validateCertificateFile,
  parseKeytoolMetadata,
};
