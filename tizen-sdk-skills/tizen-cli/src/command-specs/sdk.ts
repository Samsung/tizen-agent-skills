// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * SDK / environment setup commands — install, init, update, .NET workload
 * setup. Pre-flight environment checks live in check.ts.
 */

import { CommandSpec, sdkCommands } from "./types";

export const SDK_SPECS: CommandSpec[] = [
  {
    name: "sdk-init",
    description:
      "Configure the Tizen SDK installation path (writes to ~/.tizen.sdk.path.config; validates existence and read/write permissions)",
    requiresSdk: false,
    options: [
      {
        flags: "--sdk-path <path>",
        description: "Tizen SDK installation path (default: ~/tizen-sdk)",
      },
    ],
    handler: (o) =>
      sdkCommands.initSdk(
        o.sdkPath || sdkCommands.DEFAULT_SDK_PATH,
        "tizen-sdk sdk-init",
      ),
  },
  {
    name: "sdk-install",
    description:
      "Install the Tizen SDK (fast pre-check; when not installed, returns suggested_fix with the installer command to run in background)",
    requiresSdk: false,
    options: [
      {
        flags: "--tizen-version <version>",
        description: "Tizen platform version to install",
        default: "10.0",
      },
      {
        flags: "--label <label>",
        description: "Installation label",
        default: "tizen",
      },
      {
        flags: "--force",
        description: "Force reinstall even if already installed",
        default: false,
      },
      {
        flags: "--repo-url <url>",
        description:
          "Install from a custom package repository URL instead of the timezone-selected CDN mirror (equivalent to sdk-install-custom-repo; the URL must serve pkg_list_{OS}-{64,32})",
      },
    ],
    handler: (o) =>
      sdkCommands.installSdk(
        o.tizenVersion,
        o.label,
        !!o.force,
        o.repoUrl || "",
        "tizen-sdk sdk-install",
      ),
  },
  {
    name: "sdk-install-custom-repo",
    description:
      "Install the Tizen SDK from a custom package repository URL (validates that the URL serves pkg_list_{OS}-{64,32} first; fast pre-check that returns suggested_fix with the installer command)",
    requiresSdk: false,
    collectAllMissing: true,
    options: [
      {
        flags: "--repo-url <url>",
        description:
          "Package repository base URL to install from. Must serve pkg_list_{OS}-64 or pkg_list_{OS}-32 (OS = windows | ubuntu | macos) at its root.",
        required: true,
        missingHint:
          "Repository base URL, e.g. http://mirror.example.com/packages/tizen_sdk_11.0",
      },
      {
        flags: "--platform-version <version>",
        description:
          "Tizen platform version to install (e.g. 10.0, 11.0). Auto-selects the highest version the repository offers if omitted.",
      },
      {
        flags: "--force",
        description:
          "Force reinstall even if already installed (required to re-point an existing install at a different repository)",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.installSdkFromRepo(
        o.repoUrl,
        o.platformVersion || "",
        !!o.force,
      ),
  },
  {
    name: "validate-repo-url",
    description:
      "Check whether a URL is a usable Tizen package repository (must serve pkg_list_{OS}-{64,32} for this OS). Read-only — downloads and installs nothing.",
    requiresSdk: false,
    collectAllMissing: true,
    options: [
      {
        flags: "--repo-url <url>",
        description: "Package repository base URL to validate",
        required: true,
        missingHint:
          "Repository base URL to validate, e.g. https://download.tizen.org/sdk/tizenstudio/official",
      },
    ],
    handler: (o) => sdkCommands.validateRepoUrl(o.repoUrl),
  },
  {
    name: "tv-sdk-install",
    description:
      "Install the Tizen TV SDK extension (TV-SAMSUNG-Public) on top of an existing Tizen SDK",
    requiresSdk: false,
    options: [
      {
        flags: "--force",
        description: "Force reinstall even if already installed",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.installTvSdk(!!o.force, "tizen-sdk tv-sdk-install"),
  },
  {
    name: "tv-sdk-install-from-zip",
    description:
      "Install the Tizen TV SDK extension (TV-SAMSUNG-Public) from a local ZIP file (offline, no download). All packages must already be bundled in the ZIP.",
    requiresSdk: false,
    collectAllMissing: true,
    options: [
      {
        flags: "--zip-path <path>",
        description:
          "Path to the TV SDK ZIP file containing all bundled packages (inner ZIPs in binary/ or at root).",
        required: true,
        missingHint:
          "Path to the TV SDK ZIP file, e.g. /home/user/downloads/tv-samsung-sdk.zip",
      },
      {
        flags: "--force",
        description: "Force reinstall even if already installed",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.installTvSdkFromZip(
        o.zipPath,
        !!o.force,
        "tizen-sdk tv-sdk-install-from-zip",
      ),
  },
  {
    name: "update-package",
    description:
      "Check for and install available updates for installed Tizen SDK packages (downloads pkg_list, compares versions with installed manifests, updates outdated packages)",
    requiresSdk: false,
    options: [
      {
        flags: "--force",
        description:
          "Force update all installed packages regardless of version",
        default: false,
      },
      {
        flags: "--dry-run",
        description: "List outdated packages without updating",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.updatePackage(
        !!o.force,
        !!o.dryRun,
        "tizen-sdk update-package",
      ),
  },
  {
    name: "sdk-repo-info",
    description:
      "Show Tizen SDK package repository information (CDN mirrors, internal mirrors, current repository URL)",
    requiresSdk: false,
    options: [],
    handler: () => sdkCommands.getRepoInfo("tizen-sdk sdk-repo-info"),
  },
  {
    name: "download-emulator-package",
    description:
      "Download and install the Tizen emulator package (TIZEN-{platform_version}-Emulator) from the Tizen package repository (reads repository.info for the CDN mirror URL)",
    requiresSdk: false,
    options: [
      {
        flags: "--platform-version <version>",
        description:
          "Tizen platform version (e.g., 10.0, 11.0). Auto-detects latest if not specified.",
      },
      {
        flags: "--force",
        description: "Force reinstall even if already installed",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.downloadEmulatorPackage(
        o.platformVersion || "",
        !!o.force,
        "tizen-sdk download-emulator-package",
      ),
  },

  {
    name: "platform-install",
    description:
      "Download and install the Tizen platform package (TIZEN-{version}) from the Tizen package repository (reads repository.info for the CDN mirror URL)",
    requiresSdk: false,
    collectAllMissing: true,
    options: [
      {
        flags: "--platform-version <version>",
        description:
          "Tizen platform version (e.g., 10.0, 11.0). Required — the TIZEN-{version} package to install.",
        required: true,
        missingHint: "Tizen platform version, e.g. 10.0, 11.0",
      },
      {
        flags: "--force",
        description: "Force reinstall even if already installed",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.installPlatform(
        o.platformVersion,
        !!o.force,
        "tizen-sdk platform-install",
      ),
  },
  {
    name: "download-mobile-platform",
    description:
      "Download and install the Tizen Mobile platform package (MOBILE-{version}) from the Tizen package repository. Optionally downloads IOT-Headed extension by first downloading extension_info.xml to get the IoT repository URL, then downloading IOT-Headed-{version} package.",
    requiresSdk: false,
    collectAllMissing: true,
    options: [
      {
        flags: "--platform-version <version>",
        description:
          "Tizen Mobile platform version (e.g., 10.0, 11.0). Auto-detects latest MOBILE-X.Y if not specified.",
      },
      {
        flags: "--include-iot-headed",
        description:
          "Also download and install the IOT-Headed extension. First downloads extension_info.xml to get the IoT Headed repository URL, then downloads IOT-Headed-{version}.",
        default: false,
      },
      {
        flags: "--iot-headed-version <version>",
        description:
          "Specific IOT-Headed version to install (e.g., 10.0, 11.0). Auto-detects latest if not specified. Requires --include-iot-headed.",
      },
      {
        flags: "--force",
        description: "Force reinstall even if already installed",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.downloadMobilePlatform(
        o.platformVersion || "",
        !!o.includeIotHeaded,
        o.iotHeadedVersion || "",
        !!o.force,
        "tizen-sdk download-mobile-platform",
      ),
  },
  {
    name: "install-rootstrap",
    description:
      "Install a custom rootstrap package from a ZIP file into the Tizen SDK. The ZIP must contain either data/ or tizen-studio/ structure with tools/smart-build-interface/plugins/*.xml metadata files.",
    requiresSdk: false,
    collectAllMissing: true,
    options: [
      {
        flags: "--zip-path <path>",
        description:
          "Path to the rootstrap ZIP file to install. Must be a valid ZIP containing data/ or tizen-studio/ structure with XML metadata.",
        required: true,
        missingHint:
          "Path to rootstrap ZIP file, e.g. C:\\rootstraps\\custom-arm.zip",
      },
      {
        flags: "--force",
        description: "Force reinstall even if already installed",
        default: false,
      },
    ],
    handler: (o) =>
      sdkCommands.installRootstrap(
        o.zipPath,
        !!o.force,
        "tizen-sdk install-rootstrap",
      ),
  },
  {
    name: "dotnet-setup",
    description:
      "Verify the .NET SDK (auto-installing it user-scope if missing) and install the Tizen .NET workload (idempotent; can take several minutes)",
    requiresSdk: false,
    options: [
      {
        flags: "--force",
        description: "Reinstall the workload even if it exists",
        default: false,
      },
      {
        flags: "--workload-version <version>",
        description: "Specific Tizen workload version to install",
      },
      {
        // commander negation flag: passing --no-install-sdk sets o.installSdk=false
        flags: "--no-install-sdk",
        description:
          "Do not auto-install a missing .NET SDK (by default one is installed user-scope, no sudo/admin needed)",
      },
      {
        flags: "--sdk-channel <channel>",
        description: ".NET SDK channel for the auto-install (default: 8.0)",
      },
    ],
    handler: (o) =>
      sdkCommands.setupDotnet(
        !!o.force,
        o.workloadVersion,
        "tizen-sdk dotnet-setup",
        { noInstallSdk: o.installSdk === false, sdkChannel: o.sdkChannel },
      ),
  },
];
