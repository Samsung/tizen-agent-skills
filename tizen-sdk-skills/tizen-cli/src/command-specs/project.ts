// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Project lifecycle commands — scaffold, delete, template discovery, WGT
 * import, build.
 */

import { CommandSpec, PROJECT_TYPES, sdkCommands } from "./types";

export const PROJECT_SPECS: CommandSpec[] = [
  {
    name: "create-project",
    description:
      "Scaffold a new Tizen project from an installed SDK template (discover templates with list-templates first)",
    collectAllMissing: true,
    options: [
      {
        flags: "--type <type>",
        description: "Project type",
        choices: PROJECT_TYPES,
        required: true,
        missingHint: "Project type (native|dotnet|webapp|rpk|tv|platform)",
      },
      {
        flags: "--template <name>",
        description: "Template name as returned by list-templates",
        required: true,
        missingHint: "Template name (use list-templates to discover)",
      },
      {
        flags: "--parent-path <dir>",
        description:
          "Workspace (parent) directory — the app folder is created inside it",
        required: true,
        missingHint: "Workspace (parent) directory",
      },
      {
        flags: "--name <appName>",
        description: "App name (folder to be created)",
        required: true,
      },
      {
        flags: "--force",
        description:
          "Replace the target folder if it already exists (only when it is empty or a Tizen project — makes fresh-project runs repeatable)",
      },
      {
        flags: "--open",
        description:
          "Open the generated .code-workspace in VS Code after creation (default: create only, no window switch)",
      },
    ],
    handler: (o) =>
      sdkCommands.createProject(
        o.type,
        o.template,
        o.parentPath,
        o.name,
        !!o.force,
        "tizen-sdk create-project",
        !!o.open,
      ),
  },
  {
    name: "project-delete",
    description:
      "Delete a Tizen project directory on the SDK host (refuses paths that do not look like a Tizen project)",
    // Pure fs operation on the host — works without a Tizen SDK install.
    requiresSdk: false,
    collectAllMissing: true,
    options: [
      {
        flags: "--project <path>",
        description: "Project root directory to delete",
        required: true,
      },
      {
        flags: "--expect-name <appName>",
        description:
          "User-confirmed app name — the delete is refused when the resolved folder name differs (wrong-target guard)",
      },
      {
        flags: "--dry-run",
        description:
          'Run every safety gate and report what WOULD be deleted (result.status = "dry-run") without deleting',
      },
    ],
    handler: (o) =>
      sdkCommands.deleteProject(o.project, "tizen-sdk project-delete", {
        expectName: o.expectName,
        dryRun: !!o.dryRun,
      }),
  },
  {
    name: "list-templates",
    description:
      "List available project templates from the installed Tizen SDK",
    options: [
      {
        flags: "--type <type>",
        description: "Filter by project type (omit for all)",
        choices: PROJECT_TYPES,
      },
    ],
    handler: (o) =>
      sdkCommands.listTemplates(o.type, "tizen-sdk list-templates"),
  },
  {
    name: "import-wgt",
    description:
      "Import an existing .wgt archive as an SDK-generated Web project (tz import-wgt) — the project is created at <working-dir>/<wgt file name without .wgt>",
    collectAllMissing: true,
    options: [
      {
        flags: "--wgt-path <path>",
        description:
          "Existing .wgt archive; its file name becomes the project name, so tz allows only letters and digits [A-Za-z0-9]",
        required: true,
        missingHint: "Path to the .wgt archive",
      },
      {
        flags: "--profile <profile>",
        description: "SDK profile family",
        choices: ["tizen", "tv-samsung"],
        required: true,
        missingHint: "Profile (tizen|tv-samsung)",
      },
      {
        flags: "--platform-version <version>",
        description:
          "Installed platform version in <major>.<minor> form, e.g. 10.0 (refused when <profile>-<version> is not an installed tz profile)",
        required: true,
        missingHint: "Platform version, e.g. 10.0",
      },
      {
        flags: "--working-dir <dir>",
        description:
          "Existing destination workspace directory — the project folder is created inside it and must not exist yet",
        required: true,
        missingHint: "Destination workspace directory",
      },
    ],
    handler: (o) =>
      sdkCommands.importWgt(
        o.wgtPath,
        o.profile,
        o.platformVersion,
        o.workingDir,
        "tizen-sdk import-wgt",
      ),
  },
  {
    name: "build-project",
    description:
      "Build and package a Tizen project (.tpk/.wgt/.rpk) — result.artifacts contains the package paths",
    collectAllMissing: true,
    options: [
      {
        flags: "--project <path>",
        description: "Project root directory",
        required: true,
      },
      {
        flags: "--build-type <type>",
        description: "Build configuration",
        choices: ["Debug", "Release", "Test"],
        default: "Debug",
      },
      { flags: "--sign-profile <name>", description: "Signing profile name" },
      {
        flags: "--arch <arch>",
        description: "Target architecture (for GBS/platform builds)",
        choices: ["armv7l", "aarch64", "i586", "x86_64"],
        default: "x86_64",
      },
      {
        flags: "--clean",
        description:
          "Remove previous build output on the SDK host before building (forces a full, non-incremental rebuild — compiler warnings reappear)",
      },
    ],
    handler: (o) =>
      sdkCommands.buildProject(
        o.project,
        o.buildType,
        o.signProfile,
        o.arch,
        !!o.clean,
        "tizen-sdk build-project",
      ),
  },
];
