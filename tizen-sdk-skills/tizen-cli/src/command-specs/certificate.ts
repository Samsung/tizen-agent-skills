// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Tizen certificate manager commands — local author certificate generation,
 * bundled distributor selection, signing-profile lifecycle, certificate
 * import/inspection, Samsung online-CA certificates, and SDK-data path discovery.
 */

import { CommandSpec, sdkCommands } from "./types";

const {
  promptHiddenPassword,
} = require("../../../common/lib/cli/hidden-password");
const { readPasswordFile } = require("../../../common/lib/cli/password-file");

function applyPasswordSources(options: Record<string, any>): void {
  const sources: Array<[string, string, string, string, string]> = [
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
      Number(Boolean(options[promptKey])) +
      Number(Boolean(options[fileKey])) +
      Number(Boolean(options[passwordKey]));
    if (sourceCount > 1)
      throw new Error(
        "Use only one password source: a visible option, hidden prompt, or password file.",
      );
    if (options[promptKey]) options[passwordKey] = promptHiddenPassword(label);
    if (options[fileKey])
      options[passwordKey] = readPasswordFile(options[fileKey], variableName);
  }
}

export const CERTIFICATE_SPECS: CommandSpec[] = [
  {
    name: "certificate-manager",
    description:
      "Manage Tizen certificates (local self-signed and Samsung online-CA) and signing profiles: generate, select distributors, create/update/remove profiles, import, inspect, and resolve SDK-data paths",
    options: [
      {
        flags: "--action <action>",
        description: "Action to perform",
        choices: [
          "generate-author",

          "generate-samsung-author",
          "generate-samsung-distributor",
          "import-samsung-certificate",
          "create-samsung-profile",
          "cancel-samsung-cert",
          "samsung-login",
          "samsung-reveal-password",
          "parse-duids",
          "import-duids",
          "acquire-duid",
          "acquire-duids-all",
          "list-distributors",

          "create-profile",

          "list-profiles",

          "set-active-profile",

          "remove-profile",

          "set-distributor2",

          "import-certificate",

          "inspect-certificate",

          "get-sdk-data-path",
        ],
        default: "generate-author",
      },
      {
        flags: "--name <name>",
        description: "Author's name (generate-author, required)",
      },
      {
        flags: "--password <password>",
        description:
          "Certificate password — >=8 chars, upper+lower+digit (generate-author, required)",
      },
      {
        flags: "--prompt-password",
        description: "Prompt for --password with terminal echo disabled",
        default: false,
      },
      {
        flags: "--password-file <path>",
        description:
          "Read TIZEN_CERTIFICATE_PASSWORD from a protected environment file",
      },
      {
        flags: "--file <fileName>",
        description:
          "Unused output file name without extension (generate-author; default: sanitized --name)",
      },
      {
        flags: "--email <email>",
        description: "Author's email (generate-author)",
      },
      {
        flags: "--department <dept>",
        description:
          "Author's department (generate-author, generate-samsung-author)",
      },
      {
        flags: "--organization <org>",
        description:
          "Author's organization (generate-author, generate-samsung-author)",
      },
      {
        flags: "--city <city>",
        description: "Author's city (generate-author, generate-samsung-author)",
      },
      {
        flags: "--state <state>",
        description:
          "Author's state (generate-author, generate-samsung-author)",
      },
      {
        flags: "--country <country>",
        description:
          "Author's country (generate-author, generate-samsung-author)",
      },
      {
        flags: "--identity <identity>",
        description:
          "Author's identity/name for Samsung certificate (generate-samsung-author, required)",
      },
      {
        flags: "--type <type>",
        description:
          "Distributor certificate type (list-distributors; omit to list all types)",
        choices: ["public", "partner", "platform"],
      },
      {
        flags: "--version <version>",
        description:
          "Distributor certificate version (list-distributors; omit to list all versions)",
        choices: ["legacy", "new"],
      },
      {
        flags: "--profile-name <name>",
        description: "Signing profile name (create-profile)",
      },
      {
        flags: "--author-cert <path>",
        description: "Existing author .p12 path (create-profile)",
      },
      {
        flags: "--author-password <password>",
        description: "Author .p12 password (create-profile)",
      },
      {
        flags: "--prompt-author-password",
        description: "Prompt for --author-password with terminal echo disabled",
        default: false,
      },
      {
        flags: "--author-password-file <path>",
        description:
          "Read TIZEN_AUTHOR_CERTIFICATE_PASSWORD from a protected environment file",
      },
      {
        flags: "--distributor-type <type>",
        description:
          "Bundled distributor type (create-profile; default: public)",
        choices: ["public", "partner", "platform"],
      },
      {
        flags: "--distributor-version <version>",
        description:
          "Bundled distributor version (create-profile default: new; also safe alias for list-distributors --version)",
        choices: ["legacy", "new"],
      },
      {
        flags: "--distributor-password <password>",
        description:
          "Distributor .p12 password (create-profile; SDK bundled default is used when omitted)",
      },
      {
        flags: "--prompt-distributor-password",
        description:
          "Prompt for --distributor-password with terminal echo disabled",
        default: false,
      },
      {
        flags: "--distributor-password-file <path>",
        description:
          "Read TIZEN_DISTRIBUTOR_CERTIFICATE_PASSWORD from a protected environment file",
      },
      {
        flags: "--distributor2-cert <path>",
        description: "Optional distributor key 2 .p12 path (create-profile)",
      },
      {
        flags: "--distributor2-password <password>",
        description: "Optional distributor key 2 password (create-profile)",
      },
      {
        flags: "--prompt-distributor2-password",
        description:
          "Prompt for --distributor2-password with terminal echo disabled",
        default: false,
      },
      {
        flags: "--distributor2-password-file <path>",
        description:
          "Read TIZEN_DISTRIBUTOR2_CERTIFICATE_PASSWORD from a protected environment file",
      },
      {
        flags: "--distributor2-ca <path>",
        description:
          "Optional distributor key 2 CA certificate path (create-profile)",
      },
      {
        flags: "--distributor2-type <type>",
        description:
          "Bundled distributor 2 type (set-distributor2; default: partner)",
        choices: ["public", "partner", "platform"],
      },
      {
        flags: "--distributor2-version <version>",
        description:
          "Bundled distributor 2 version (set-distributor2; default: new)",
        choices: ["legacy", "new"],
      },
      {
        flags: "--profiles-xml <path>",
        description:
          "Custom profiles.xml path (profile operations; default: SDK data profile/profiles.xml)",
      },
      {
        flags: "--active",
        description: "Set the created signing profile active (create-profile)",
        default: false,
      },
      {
        flags: "--source <path>",
        description: "Source .p12 or .cer path (import-certificate)",
      },
      {
        flags: "--certificate-type <type>",
        description: "Imported certificate destination type",
        choices: ["author", "distributor"],
        default: "author",
      },
      {
        flags: "--target-file <name>",
        description: "Imported destination file name without extension",
      },
      {
        flags: "--overwrite",
        description: "Replace an existing imported certificate",
        default: false,
      },
      {
        flags: "--certificate <path>",
        description: "Certificate .p12 or .cer path (inspect-certificate)",
      },
      {
        flags: "--duid-list <duids>",
        description:
          "Comma/newline separated DUIDs (generate-samsung-distributor, parse-duids)",
      },
      {
        flags: "--duid-file <path>",
        description:
          "File containing DUIDs (import-duids, generate-samsung-distributor)",
      },
      {
        flags: "--privilege <level>",
        description:
          "Privilege level for distributor certificate (generate-samsung-distributor, create-samsung-profile; default: Public)",
        choices: ["Public", "Partner"],
      },
      {
        flags: "--serial <serial>",
        description:
          "Device serial for DUID acquisition (acquire-duid; default: first connected device)",
      },
    ],
    handler: async (o) => {
      applyPasswordSources(o);
      switch (o.action) {
        case "get-sdk-data-path":
          return sdkCommands.getCertificateSdkDataPath(
            "tizen-sdk certificate-manager get-sdk-data-path",
          );
        case "inspect-certificate":
          return sdkCommands.inspectCertificate(
            {
              certificatePath: o.certificate,
              password: o.password,
            },
            "tizen-sdk certificate-manager inspect-certificate",
          );
        case "import-certificate":
          return sdkCommands.importCertificate(
            {
              sourcePath: o.source,
              certificateType: o.certificateType,
              fileName: o.targetFile,
              password: o.password,
              overwrite: o.overwrite,
            },
            "tizen-sdk certificate-manager import-certificate",
          );
        case "set-distributor2":
          return sdkCommands.setSigningProfileDistributor2(
            {
              profileName: o.profileName,
              authorPassword: o.authorPassword,
              distributorPassword: o.distributorPassword,
              distributor2Type: o.distributor2Type,
              distributor2Version: o.distributor2Version,
              distributor2Password: o.distributor2Password,
              profilesXml: o.profilesXml,
            },
            "tizen-sdk certificate-manager set-distributor2",
          );
        case "remove-profile":
          return sdkCommands.removeSigningProfile(
            {
              profileName: o.profileName,
              profilesXml: o.profilesXml,
            },
            "tizen-sdk certificate-manager remove-profile",
          );
        case "set-active-profile":
          return sdkCommands.setActiveSigningProfile(
            {
              profileName: o.profileName,
              profilesXml: o.profilesXml,
            },
            "tizen-sdk certificate-manager set-active-profile",
          );
        case "list-profiles":
          return sdkCommands.listSigningProfiles(
            {
              profilesXml: o.profilesXml,
            },
            "tizen-sdk certificate-manager list-profiles",
          );
        case "create-profile":
          return sdkCommands.createSigningProfile(
            {
              profileName: o.profileName,
              authorCertPath: o.authorCert,
              authorPassword: o.authorPassword,
              distributorType: o.distributorType,
              distributorVersion: o.distributorVersion,
              distributorPassword: o.distributorPassword,
              distributor2CertPath: o.distributor2Cert,
              distributor2Password: o.distributor2Password,
              distributor2CaPath: o.distributor2Ca,
              profilesXml: o.profilesXml,
              active: o.active,
            },
            "tizen-sdk certificate-manager create-profile",
          );
        case "list-distributors":
          return sdkCommands.listDistributorCertificates(
            {
              type: o.type || o.distributorType,
              version: o.version || o.distributorVersion,
            },
            "tizen-sdk certificate-manager list-distributors",
          );
        case "generate-samsung-author":
          return sdkCommands.generateSamsungAuthorCertificate({
            profileName: o.profileName,
            identity: o.identity,
            password: o.password,
            department: o.department,
            organization: o.organization,
            city: o.city,
            state: o.state,
            country: o.country,
          });
        case "generate-samsung-distributor": {
          // If --duid-file is provided, read DUIDs from file
          let duidList = o.duidList;
          if (!duidList && o.duidFile) {
            const result = sdkCommands.importDuidsFromFile(o.duidFile);
            duidList = result.duids;
          }
          return sdkCommands.generateSamsungDistributorCertificate({
            profileName: o.profileName,
            password: o.password,
            duidList,
            privilege: o.privilege,
          });
        }
        case "import-samsung-certificate":
          return sdkCommands.importSamsungCertificate({
            profileName: o.profileName,
            sourcePath: o.source,
            password: o.password,
            certificateType: o.certificateType,
            overwrite: o.overwrite,
          });
        case "create-samsung-profile":
          return sdkCommands.createSamsungProfile({
            profileName: o.profileName,
            privilege: o.privilege,
            authorPassword: o.authorPassword,
            distributorPassword: o.distributorPassword,
            active: o.active,
          });
        case "cancel-samsung-cert":
          return sdkCommands.cancelSamsungCertificateGeneration();
        case "samsung-login":
          return sdkCommands.getSamsungAccessToken(o.profileName);
        case "samsung-reveal-password":
          return sdkCommands.getSamsungCertificatePassword(o.profileName);
        case "parse-duids": {
          const { Envelope } = require("../../../common/lib/envelope/envelope");
          const result = sdkCommands.parseDuidList(o.duidList);
          const envelope = new Envelope(
            "tizen-sdk certificate-manager parse-duids",
          );
          return envelope.success(result);
        }
        case "import-duids": {
          const { Envelope } = require("../../../common/lib/envelope/envelope");
          const result = sdkCommands.importDuidsFromFile(o.duidFile);
          const envelope = new Envelope(
            "tizen-sdk certificate-manager import-duids",
          );
          return envelope.success(result);
        }
        case "acquire-duid": {
          const { Envelope } = require("../../../common/lib/envelope/envelope");
          const result = sdkCommands.acquireDuidFromDevice(o.serial);
          const envelope = new Envelope(
            "tizen-sdk certificate-manager acquire-duid",
          );
          return envelope.success(result);
        }
        case "acquire-duids-all": {
          const { Envelope } = require("../../../common/lib/envelope/envelope");
          const result = sdkCommands.acquireDuidsFromAllDevices();
          const envelope = new Envelope(
            "tizen-sdk certificate-manager acquire-duids-all",
          );
          return envelope.success(result);
        }
        case "generate-author":
        default:
          return sdkCommands.generateAuthorCertificate(
            {
              name: o.name,
              password: o.password,
              fileName: o.file,
              email: o.email,
              department: o.department,
              organization: o.organization,
              city: o.city,
              state: o.state,
              country: o.country,
            },
            "tizen-sdk certificate-manager generate-author",
          );
      }
    },
  },
];
