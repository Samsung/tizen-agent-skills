#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for the Tizen certificate manager (local Tizen certs, signing
 * profiles, and Samsung online-CA certificates).
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/cert-manager-cli.js <action> [args]
 *
 * Examples:
 *   node .../cert-manager-cli.js generate-author --name "Jane Dev" --password "<password>"
 *   node .../cert-manager-cli.js generate-author --name "Jane Dev" --password "<password>" --file jane-dev
 *   node .../cert-manager-cli.js generate-author --name "Jane Dev" --password "<password>" \
 *     --email jane@example.com --organization Acme --department Mobile --city Seoul --state Seoul --country KR
 *   node .../cert-manager-cli.js list-distributors                        # all bundled distributor certs
 *   node .../cert-manager-cli.js list-distributors --type public          # both versions of "public"
 *   node .../cert-manager-cli.js list-distributors --type public --version new   # one exact combo
 *   node .../cert-manager-cli.js generate-samsung-author --profile-name MyProfile \
 *     --identity "Jane Dev" --password "<password>" --organization Acme
 *   node .../cert-manager-cli.js generate-samsung-distributor --profile-name MyProfile \
 *     --password "<password>" --duid-list "1.0#DEV001,2.0#DEV002" --privilege Public
 *   node .../cert-manager-cli.js import-samsung-certificate --profile-name MyProfile \
 *     --source /path/to/existing.p12 --password "<password>" --certificate-type author
 *   node .../cert-manager-cli.js create-samsung-profile --profile-name MyProfile --active
 *   node .../cert-manager-cli.js cancel-samsung-cert
 *   node .../cert-manager-cli.js parse-duids --duid-list "1.0#DEV001,2.0#DEV002"
 *   node .../cert-manager-cli.js import-duids --duid-file /path/to/duids.txt
 *   node .../cert-manager-cli.js acquire-duid
 *   node .../cert-manager-cli.js acquire-duids-all
 *
 * Actions:
 *   generate-author | list-distributors | create-profile | list-profiles |
 *   set-active-profile | remove-profile | set-distributor2 |
 *   import-certificate | inspect-certificate | get-sdk-data-path |
 *   generate-samsung-author | generate-samsung-distributor |
 *   import-samsung-certificate | create-samsung-profile |
 *   cancel-samsung-cert | samsung-login | samsung-reveal-password |
 *   parse-duids | import-duids | acquire-duid | acquire-duids-all
 *
 * Common arguments:
 *   --name          - generate-author (required): author's name
 *   --password      - generate-author / Samsung cert actions (required): certificate password (>=8 chars, upper+lower+digit)
 *   --file          - generate-author (optional): output file name without extension; defaults to a sanitized --name
 *   --email         - generate-author (optional)
 *   --department    - generate-author (optional)
 *   --organization  - generate-author (optional)
 *   --city          - generate-author (optional)
 *   --state         - generate-author (optional)
 *   --country       - generate-author (optional)
 *   --type          - list-distributors (optional): public | partner | platform; omit to list all
 *   --version       - list-distributors (optional): legacy | new; omit to list all
 *   --profile-name  - Samsung cert actions (required): unique profile identifier
 *   --identity      - generate-samsung-author (required): author's name (becomes CN)
 *   --duid-list     - generate-samsung-distributor (required): comma/newline separated DUIDs
 *   --duid-file     - import-duids / generate-samsung-distributor (optional): file containing DUIDs
 *   --privilege     - generate-samsung-distributor (optional): Public | Partner (default: Public)
 *   --source        - import-samsung-certificate (required): path to existing .p12 file
 *   --certificate-type - import-samsung-certificate (optional): author | distributor (default: author)
 *   --overwrite     - import-samsung-certificate (optional): overwrite existing certificate
 *   --active        - create-samsung-profile (optional): set as active profile
 *   --author-password - create-samsung-profile (optional): author cert password (decrypted from .pwd if omitted)
 *   --distributor-password - create-samsung-profile (optional): distributor cert password
 *   --serial        - acquire-duid (optional): device serial; if omitted, uses first connected device
 *
 * Exit code: success=0, failure/error=1
 */

const {
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
  generateSamsungAuthorCertificate,
  generateSamsungDistributorCertificate,
  importSamsungCertificate,
  createSamsungProfile,
  cancelSamsungCertificateGeneration,
  parseDuidList,
  importDuidsFromFile,
  acquireDuidFromDevice,
  acquireDuidsFromAllDevices,
  getSamsungAccessToken,
  getSamsungCertificatePassword,
} = require("../core/sdk-commands");

const {
  runCli,
  parseArgsOrExit,
  exitWithUsageError,
  UsageError,
  backgroundRequested,
} = require("./cli-runner");
const { promptHiddenPassword } = require("./hidden-password");
const { readPasswordFile } = require("./password-file");

const COMMAND = "tizen-sdk cert";

const USAGE =
  "Usage: node cert-manager-cli.js <action> [options]. Actions: generate-author, " +
  "list-distributors, create-profile, list-profiles, set-active-profile, remove-profile, " +
  "set-distributor2, import-certificate, inspect-certificate, get-sdk-data-path, " +
  "generate-samsung-author, generate-samsung-distributor, import-samsung-certificate, " +
  "create-samsung-profile, cancel-samsung-cert, samsung-login, samsung-reveal-password, " +
  "parse-duids, import-duids, acquire-duid, acquire-duids-all.";

const usageError = (message) => exitWithUsageError(COMMAND, USAGE, message);

const args = process.argv.slice(2);

const OPTION_FLAGS = {
  "--name": "name",
  "--password": "password",
  "--password-file": "passwordFile",
  "--file": "fileName",
  "--email": "email",
  "--department": "department",
  "--organization": "organization",
  "--city": "city",
  "--state": "state",
  "--country": "country",
  "--type": "type",
  "--version": "version",
  "--distributor-version": "distributorVersion",
  "--distributor-type": "distributorType",
  "--distributor-password": "distributorPassword",
  "--distributor-password-file": "distributorPasswordFile",
  "--profile-name": "profileName",
  "--author-cert": "authorCertPath",
  "--author-password": "authorPassword",
  "--author-password-file": "authorPasswordFile",
  "--distributor2-cert": "distributor2CertPath",
  "--distributor2-password": "distributor2Password",
  "--distributor2-password-file": "distributor2PasswordFile",
  "--distributor2-ca": "distributor2CaPath",
  "--distributor2-type": "distributor2Type",
  "--distributor2-version": "distributor2Version",
  "--profiles-xml": "profilesXml",
  "--source": "sourcePath",
  "--certificate-type": "certificateType",
  "--target-file": "fileName",
  "--certificate": "certificatePath",
  "--identity": "identity",
  "--duid-list": "duidList",
  "--duid-file": "duidFile",
  "--privilege": "privilege",
  "--serial": "serial",
};

const BOOLEAN_FLAGS = {
  "--active": "active",
  "--overwrite": "overwrite",
  "--prompt-password": "promptPassword",
  "--prompt-author-password": "promptAuthorPassword",
  "--prompt-distributor-password": "promptDistributorPassword",
  "--prompt-distributor2-password": "promptDistributor2Password",
};

const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  args,
  OPTION_FLAGS,
  BOOLEAN_FLAGS,
);

const [action, ...extraPositionals] = positional;
if (extraPositionals.length > 0) {
  usageError(`Unexpected argument(s): ${extraPositionals.join(" ")}`);
}

// A detached job has no terminal: the hidden password prompt would fail
// inside it, after the receipt was already printed. Refuse up front.
if (
  backgroundRequested() &&
  Object.keys(BOOLEAN_FLAGS)
    .filter((f) => f.startsWith("--prompt-"))
    .some((f) => options[BOOLEAN_FLAGS[f]])
) {
  usageError(
    "--prompt-* flags read the terminal and cannot be combined with --background. " +
      "Use --password-file (or the corresponding --*-password-file) instead.",
  );
}

function applyPasswordSources(target) {
  const sources = [
    [
      "promptPassword",
      "passwordFile",
      "password",
      "Certificate password",
      "TIZEN_CERTIFICATE_PASSWORD",
    ],
    [
      "promptAuthorPassword",
      "authorPasswordFile",
      "authorPassword",
      "Author certificate password",
      "TIZEN_AUTHOR_CERTIFICATE_PASSWORD",
    ],
    [
      "promptDistributorPassword",
      "distributorPasswordFile",
      "distributorPassword",
      "Distributor certificate password",
      "TIZEN_DISTRIBUTOR_CERTIFICATE_PASSWORD",
    ],
    [
      "promptDistributor2Password",
      "distributor2PasswordFile",
      "distributor2Password",
      "Distributor key 2 password",
      "TIZEN_DISTRIBUTOR2_CERTIFICATE_PASSWORD",
    ],
  ];
  for (const [
    promptKey,
    fileKey,
    passwordKey,
    label,
    variableName,
  ] of sources) {
    const sourceCount =
      Number(Boolean(target[promptKey])) +
      Number(Boolean(target[fileKey])) +
      Number(Boolean(target[passwordKey]));
    if (sourceCount > 1) {
      throw new UsageError(
        "Use only one password source: a visible option, hidden prompt, or password file.",
      );
    }
    if (target[promptKey]) {
      try {
        target[passwordKey] = promptHiddenPassword(label);
      } catch (error) {
        throw new Error(`Failed to prompt for password: ${error.message}`);
      }
    }
    if (target[fileKey]) {
      try {
        target[passwordKey] = readPasswordFile(target[fileKey], variableName);
      } catch (error) {
        throw new Error(`Failed to read password file: ${error.message}`);
      }
    }
  }
}
try {
  applyPasswordSources(options);
} catch (error) {
  if (error instanceof UsageError) {
    usageError(error.message);
  } else {
    // Print synchronously and exit — runCli's async exit would let control
    // fall through into the action switch below and dispatch the real action
    // without a password.
    console.log(
      JSON.stringify(
        {
          command: "tizen-sdk cert",
          status: "error",
          errors: [{ code: "password_source_error", message: error.message }],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}
switch (action) {
  case "generate-author":
    if (!options.name) usageError("generate-author requires --name");
    if (!options.password) usageError("generate-author requires --password");
    runCli("tizen-sdk certificate-manager generate-author", () =>
      generateAuthorCertificate(
        options,
        "tizen-sdk certificate-manager generate-author",
      ),
    );
    break;
  case "list-distributors":
    runCli("tizen-sdk certificate-manager list-distributors", () =>
      listDistributorCertificates(
        {
          type: options.type || options.distributorType,
          version: options.version || options.distributorVersion,
        },
        "tizen-sdk certificate-manager list-distributors",
      ),
    );
    break;
  case "create-profile":
    if (!options.profileName)
      usageError("create-profile requires --profile-name");
    if (!options.authorCertPath)
      usageError("create-profile requires --author-cert");
    if (!options.authorPassword)
      usageError("create-profile requires --author-password");
    runCli("tizen-sdk certificate-manager create-profile", () =>
      createSigningProfile(
        options,
        "tizen-sdk certificate-manager create-profile",
      ),
    );
    break;
  case "list-profiles":
    runCli("tizen-sdk certificate-manager list-profiles", () =>
      listSigningProfiles(
        options,
        "tizen-sdk certificate-manager list-profiles",
      ),
    );
    break;
  case "set-active-profile":
    if (!options.profileName)
      usageError("set-active-profile requires --profile-name");
    runCli("tizen-sdk certificate-manager set-active-profile", () =>
      setActiveSigningProfile(
        options,
        "tizen-sdk certificate-manager set-active-profile",
      ),
    );
    break;
  case "remove-profile":
    if (!options.profileName)
      usageError("remove-profile requires --profile-name");
    runCli("tizen-sdk certificate-manager remove-profile", () =>
      removeSigningProfile(
        options,
        "tizen-sdk certificate-manager remove-profile",
      ),
    );
    break;
  case "set-distributor2":
    if (!options.profileName)
      usageError("set-distributor2 requires --profile-name");
    if (!options.authorPassword)
      usageError("set-distributor2 requires --author-password");
    runCli("tizen-sdk certificate-manager set-distributor2", () =>
      setSigningProfileDistributor2(
        options,
        "tizen-sdk certificate-manager set-distributor2",
      ),
    );
    break;
  case "import-certificate":
    if (!options.sourcePath) usageError("import-certificate requires --source");
    runCli("tizen-sdk certificate-manager import-certificate", () =>
      importCertificate(
        {
          ...options,
          password: options.password,
        },
        "tizen-sdk certificate-manager import-certificate",
      ),
    );
    break;
  case "inspect-certificate":
    if (!options.certificatePath)
      usageError("inspect-certificate requires --certificate");
    runCli("tizen-sdk certificate-manager inspect-certificate", () =>
      inspectCertificate(
        {
          certificatePath: options.certificatePath,
          password: options.password,
        },
        "tizen-sdk certificate-manager inspect-certificate",
      ),
    );
    break;
  case "get-sdk-data-path":
    runCli("tizen-sdk certificate-manager get-sdk-data-path", () =>
      getCertificateSdkDataPath(
        "tizen-sdk certificate-manager get-sdk-data-path",
      ),
    );
    break;
  case "generate-samsung-author":
    if (!options.profileName)
      usageError("generate-samsung-author requires --profile-name");
    if (!options.identity)
      usageError("generate-samsung-author requires --identity");
    if (!options.password)
      usageError("generate-samsung-author requires --password");
    runCli("tizen-sdk certificate-manager generate-samsung-author", () =>
      generateSamsungAuthorCertificate(options),
    );
    break;
  case "generate-samsung-distributor":
    if (!options.profileName)
      usageError("generate-samsung-distributor requires --profile-name");
    if (!options.password)
      usageError("generate-samsung-distributor requires --password");
    if (!options.duidList && !options.duidFile) {
      usageError(
        "generate-samsung-distributor requires --duid-list or --duid-file",
      );
    }
    // If --duid-file is provided, read DUIDs from file and pass as duidList.
    // Read inside runCli so a bad file yields an error envelope, not a raw
    // uncaught-exception stack trace.
    runCli("tizen-sdk certificate-manager generate-samsung-distributor", () => {
      if (options.duidFile && !options.duidList) {
        const result = importDuidsFromFile(options.duidFile);
        options.duidList = result.duids;
      }
      return generateSamsungDistributorCertificate(options);
    });
    break;
  case "import-samsung-certificate":
    if (!options.profileName)
      usageError("import-samsung-certificate requires --profile-name");
    if (!options.sourcePath)
      usageError("import-samsung-certificate requires --source");
    if (!options.password)
      usageError("import-samsung-certificate requires --password");
    runCli("tizen-sdk certificate-manager import-samsung-certificate", () =>
      importSamsungCertificate(options),
    );
    break;
  case "create-samsung-profile":
    if (!options.profileName)
      usageError("create-samsung-profile requires --profile-name");
    runCli("tizen-sdk certificate-manager create-samsung-profile", () =>
      createSamsungProfile(options),
    );
    break;
  case "cancel-samsung-cert":
    runCli("tizen-sdk certificate-manager cancel-samsung-cert", () =>
      cancelSamsungCertificateGeneration(),
    );
    break;
  case "samsung-login":
    if (!options.profileName)
      usageError("samsung-login requires --profile-name");
    runCli("tizen-sdk certificate-manager samsung-login", () =>
      getSamsungAccessToken(options.profileName),
    );
    break;
  case "samsung-reveal-password":
    if (!options.profileName)
      usageError("samsung-reveal-password requires --profile-name");
    // maskSecrets: false — the command's purpose is to return the password;
    // the default masking would rewrite it to "***"
    runCli(
      "tizen-sdk certificate-manager samsung-reveal-password",
      () => getSamsungCertificatePassword(options.profileName),
      { maskSecrets: false },
    );
    break;

  // ── DUID utilities ───────────────────────────────────────────────────
  case "parse-duids":
    if (!options.duidList) usageError("parse-duids requires --duid-list");
    runCli("tizen-sdk certificate-manager parse-duids", () => {
      const { Envelope } = require("../envelope/envelope");
      const result = parseDuidList(options.duidList);
      const envelope = new Envelope(
        "tizen-sdk certificate-manager parse-duids",
      );
      return envelope.success(result);
    });
    break;
  case "import-duids":
    if (!options.duidFile) usageError("import-duids requires --duid-file");
    runCli("tizen-sdk certificate-manager import-duids", () => {
      const { Envelope } = require("../envelope/envelope");
      const result = importDuidsFromFile(options.duidFile);
      const envelope = new Envelope(
        "tizen-sdk certificate-manager import-duids",
      );
      return envelope.success(result);
    });
    break;
  case "acquire-duid":
    runCli("tizen-sdk certificate-manager acquire-duid", () => {
      const { Envelope } = require("../envelope/envelope");
      const result = acquireDuidFromDevice(options.serial);
      const envelope = new Envelope(
        "tizen-sdk certificate-manager acquire-duid",
      );
      return envelope.success(result);
    });
    break;
  case "acquire-duids-all":
    runCli("tizen-sdk certificate-manager acquire-duids-all", () => {
      const { Envelope } = require("../envelope/envelope");
      const result = acquireDuidsFromAllDevices();
      const envelope = new Envelope(
        "tizen-sdk certificate-manager acquire-duids-all",
      );
      return envelope.success(result);
    });
    break;

  default:
    usageError(action ? `Unknown action: ${action}` : "Missing action");
}
