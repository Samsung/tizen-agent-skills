#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Unified CLI runner for Tizen project lifecycle — create, list-templates,
 * build, and install.
 *
 * This file consolidates the four former single-purpose positional CLI runners
 * (build-project-cli.js, create-project-cli.js, list-templates-cli.js,
 * install-app-cli.js) into one action-based dispatcher, following the same
 * pattern as cert-manager-cli.js.
 *
 * Run directly without the agent having to assemble require paths:
 *   node <plugin>/lib/cli/project-manager-cli.js <action> [options]
 *
 * Examples:
 *   node .../project-manager-cli.js build --project "$HOME/tizen-apps/MyApp" --build-type Debug
 *   node .../project-manager-cli.js build --project "$HOME/tizen-apps/MyApp" --build-type Release --sign-profile myProfile --arch armv7l
 *   node .../project-manager-cli.js create --type webapp --template Basic --parent-path "$HOME/tizen-apps" --name MyTizenApp
 *   node .../project-manager-cli.js list-templates --type native
 *   node .../project-manager-cli.js list-templates
 *   node .../project-manager-cli.js install --package "$HOME/tizen-apps/MyApp/Debug/MyApp.tpk"
 *   node .../project-manager-cli.js install --package "$HOME/tizen-apps/MyApp/Debug/MyApp.tpk" --device-serial emulator-26101 --run
 *
 * Actions:
 *   build | create | delete | list-templates | install
 *
 * Action arguments:
 *   build:
 *     --project <path>        (required) Project root directory
 *     --build-type <type>     (optional) Debug (default) | Release | Test
 *     --sign-profile <name>   (optional) Signing profile name
 *     --arch <arch>           (optional) Target architecture (armv7l|aarch64|i586|x86_64), default x86_64
 *     --clean                 (optional) Remove previous build output before building (full rebuild)
 *
 *   create:
 *     --type <type>           (required) native | dotnet | webapp | rpk | tv | platform
 *     --template <name>       (required) Template name (use list-templates to discover)
 *     --parent-path <dir>     (required) Workspace (parent) directory — app folder is created inside it
 *     --name <appName>        (required) App name (folder to be created)
 *     --force                 (optional) Replace the target folder if it already exists
 *                             (only when empty or a Tizen project — never an arbitrary dir)
 *     --open                  (optional) Open the generated .code-workspace in VS Code
 *                             (default: create only, no window switch)
 *
 *   delete:
 *     --project <path>        (required) Project root directory to delete on the SDK host
 *                             (refuses paths without a Tizen project marker)
 *     --expect-name <appName> (optional) User-confirmed app name — the delete is refused
 *                             when the resolved folder name differs (wrong-target guard)
 *     --dry-run               (optional) Run every safety gate and report what WOULD be
 *                             deleted (result.status = "dry-run") without deleting
 *
 *   list-templates:
 *     --type <type>           (optional) Filter by project type (omit for all)
 *
 *   install:
 *     --package <path>        (required) Absolute path to .tpk/.wgt/.rpk/.rpm
 *     --device-serial <serial> (optional) Target device serial. Omit to auto-select
 *     --run                   (optional) Run app after installation
 *
 * Exit code: success=0, failure/error=1
 */

const {
  buildProject,
  createProject,
  deleteProject,
  listTemplates,
  installApp,
} = require("../core/sdk-commands");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk project";

const USAGE =
  "Usage: node project-manager-cli.js <action> [options]. Actions: build, " +
  "create, delete, list-templates, install. " +
  "build --project <path> [--build-type Debug|Release|Test] [--sign-profile <name>] [--arch <arch>] [--clean] | " +
  "create --type <type> --template <name> --parent-path <dir> --name <appName> [--force] [--open] | " +
  "delete --project <path> [--expect-name <appName>] [--dry-run] | " +
  "list-templates [--type <type>] | " +
  "install --package <path> [--device-serial <serial>] [--run]";

const usageError = (message) => exitWithUsageError(COMMAND, USAGE, message);

const args = process.argv.slice(2);

const OPTION_FLAGS = {
  "--project": "project",
  "--build-type": "buildType",
  "--sign-profile": "signProfile",
  "--arch": "arch",
  "--type": "type",
  "--template": "template",
  "--parent-path": "parentPath",
  "--name": "name",
  "--package": "packagePath",
  "--device-serial": "deviceSerial",
  "--expect-name": "expectName",
};
const BOOLEAN_FLAGS = {
  "--run": "run",
  "--clean": "clean",
  "--force": "force",
  "--open": "open",
  "--dry-run": "dryRun",
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

switch (action) {
  case "build": {
    if (!options.project) usageError("build requires --project");
    runCli("tizen-sdk build-project", () =>
      buildProject(
        options.project,
        options.buildType || "Debug",
        options.signProfile,
        options.arch,
        !!options.clean,
        "tizen-sdk build-project",
      ),
    );
    break;
  }
  case "create": {
    if (!options.type) usageError("create requires --type");
    if (!options.template) usageError("create requires --template");
    if (!options.parentPath) usageError("create requires --parent-path");
    if (!options.name) usageError("create requires --name");
    runCli("tizen-sdk create-project", () =>
      createProject(
        options.type,
        options.template,
        options.parentPath,
        options.name,
        !!options.force,
        "tizen-sdk create-project",
        !!options.open,
      ),
    );
    break;
  }
  case "delete": {
    if (!options.project) usageError("delete requires --project");
    runCli("tizen-sdk project-delete", () =>
      deleteProject(options.project, "tizen-sdk project-delete", {
        expectName: options.expectName,
        dryRun: !!options.dryRun,
      }),
    );
    break;
  }
  case "list-templates": {
    runCli("tizen-sdk list-templates", () =>
      listTemplates(options.type, "tizen-sdk list-templates"),
    );
    break;
  }
  case "install": {
    if (!options.packagePath) usageError("install requires --package");
    runCli("tizen-sdk install-app", () =>
      installApp(
        options.packagePath,
        options.deviceSerial,
        !!options.run,
        "tizen-sdk install-app",
      ),
    );
    break;
  }
  default:
    usageError(action ? `Unknown action: ${action}` : "Missing action");
}
