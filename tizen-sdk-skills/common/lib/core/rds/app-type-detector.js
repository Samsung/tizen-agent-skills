// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * App type detection — identifies whether a project is native, web, or
 * .NET, so RDS knows which input/output interest lists to apply.
 *
 * Ported from `ProjectUtils.isWebProject/isNativeProject/isDotNetProject`
 * (order matters — first match wins) and `baseline-manager.ts`'s
 * `detectAppType()`, which chains them the same way.
 *
 * One deliberate divergence: the extension's `detectAppType()` defaults an
 * unmatched project to `'native'` ("conservative — native interest list is a
 * superset for unknown projects"). That default is safe there because the
 * extension only calls it on projects already known to be installable apps.
 * The CLI has no such prior filter — `detectAppType()` here can be reached
 * from a GBS/platform project or any other unrecognized layout — so an
 * unmatched project returns `null` instead. Every RDS entry point treats
 * `null` as "not eligible" (see docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 2b/4);
 * silently falling back to `'native'` would hash the wrong file set and
 * produce a garbage manifest for a project RDS has no business touching.
 *
 * Reference: packages/server/src/features/rds/baseline-manager.ts:130-145
 *            packages/server/src/features/project-manager/utils/project-utils.ts
 *
 * @module core/rds/app-type-detector
 */

const fs = require("fs");
const path = require("path");
const { findFiles } = require("./fs-walk");

/** @typedef {'native' | 'web' | 'dotnet'} AppType */

const WEB_CONFIG_FILE = "config.xml";
const NATIVE_YAML_FILE = "tizen_native_project.yaml";
const NATIVE_PROP_FILE = "project_def.prop";
const DOTNET_YAML_FILE = "tizen_dotnet_project.yaml";
const DOTNET_MANIFEST_FILE = "tizen-manifest.xml";

/**
 * @param {string} projectDir
 * @returns {boolean} true if `config.xml` exists at the project root.
 */
function isWebProject(projectDir) {
  return fs.existsSync(path.join(projectDir, WEB_CONFIG_FILE));
}

/**
 * @param {string} projectDir
 * @returns {boolean} true if `tizen_native_project.yaml` or
 *   `project_def.prop` exists at the project root.
 */
function isNativeProject(projectDir) {
  return (
    fs.existsSync(path.join(projectDir, NATIVE_YAML_FILE)) ||
    fs.existsSync(path.join(projectDir, NATIVE_PROP_FILE))
  );
}

/**
 * Find every file under `rootDir` whose basename is `filename`, shallowest
 * first. Stands in for the extension's unrestricted `globSync(rootDir +
 * '/**\/' + filename)` — including its default `dot: false` behavior — but
 * additionally prunes `node_modules/`, `bin/`, `obj/` (see fs-walk.js
 * `findFiles`), so a built .NET project's `bin/…/tpkroot/tizen-manifest.xml`
 * copy is never mistaken for the source manifest.
 *
 * @param {string} rootDir
 * @param {string} filename
 * @returns {string[]} absolute paths, shallowest first
 */
function findFilesByName(rootDir, filename) {
  return findFiles(rootDir, (name) => name === filename);
}

/**
 * @param {string} projectDir
 * @returns {boolean} true if `tizen_dotnet_project.yaml` exists anywhere
 *   under the project, or a `tizen-manifest.xml` exists anywhere under the
 *   project with a sibling `.csproj` file in the same directory.
 */
function isDotNetProject(projectDir) {
  if (findFilesByName(projectDir, DOTNET_YAML_FILE).length > 0) {
    return true;
  }

  const manifestPaths = findFilesByName(projectDir, DOTNET_MANIFEST_FILE);
  for (const manifestPath of manifestPaths) {
    const manifestDir = path.dirname(manifestPath);
    const hasCsproj = fs
      .readdirSync(manifestDir)
      .some((entry) => entry.endsWith(".csproj"));
    if (hasCsproj) return true;
  }

  return false;
}

/**
 * Detect the app type of a project directory. First match wins, in the
 * same order as `ProjectUtils.identifyProjectType()`: web, then native,
 * then dotnet.
 *
 * Platform/GBS projects (see `isPlatformProject()` in `project.js`), RPK
 * resource projects, and any other unrecognized layout return `null` — see
 * the module doc comment for why this differs from the extension's default.
 *
 * @param {string} projectDir - absolute path to the project directory
 * @returns {AppType | null}
 */
function detectAppType(projectDir) {
  if (isWebProject(projectDir)) return "web";
  if (isNativeProject(projectDir)) return "native";
  if (isDotNetProject(projectDir)) return "dotnet";
  return null;
}

module.exports = {
  detectAppType,
  isWebProject,
  isNativeProject,
  isDotNetProject,
  findFilesByName,
};
