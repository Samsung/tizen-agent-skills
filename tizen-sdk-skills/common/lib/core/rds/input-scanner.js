// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Input Scanner — source/input file discovery for RDS baseline hashing.
 *
 * Scans a project's source tree to find the input files whose hashes go
 * into `baseline-manifest.json` / `build-manifest.json`. Uses the YAML
 * config interest lists (`yaml-reader.js`) to determine which files to
 * include:
 *
 * - **Native**: expands `sources`, `edc_files`, `resources`, etc. from
 *   `tizen_native_project.yaml` into concrete file paths
 * - **Web**: walks the whole project directory minus `excludes` from
 *   `tizen_web_project.yaml` (tizen-core auto-discovers web files, so
 *   there's no fixed interest list to expand)
 * - **Dotnet**: expands `files` and `resources` from
 *   `tizen_dotnet_project.yaml` into concrete file paths
 *
 * All returned paths are relative to the project root, POSIX-separated.
 *
 * Only the async scanning path is ported — see
 * docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 6 ("hashing is async"). The single-file
 * classification helpers (`isInputFile`, `getInputInterestPatterns`) exist
 * upstream only to support the watcher's classification cache, which Part 4
 * ("Deliberately not ported") drops entirely — there's no file watcher in
 * the CLI, so nothing here needs to answer "is this one file an input
 * file?" in isolation.
 *
 * Reference: packages/server/src/features/rds/input-scanner.ts
 *
 * @module core/rds/input-scanner
 */

const fs = require("fs");
const path = require("path");
const picomatch = require("../../vendor/picomatch");
const { walkFiles } = require("./fs-walk");
const { computeFileHash } = require("./hash");
const { prefixIgnorePatterns, buildHashRecord } = require("./scanner-shared");
const {
  findProjectYamlPath,
  readInputIgnoreConfig,
  parseNativeProjectYaml,
  parseDotnetProjectYaml,
} = require("./yaml-reader");

// ─── Glob pattern expansion ─────────────────────────────────────────────────

/**
 * Normalize an absolute path to a POSIX-separated path relative to `base`.
 *
 * @param {string} base
 * @param {string} absPath
 * @returns {string}
 */
function toPosixRelative(base, absPath) {
  return path.relative(base, absPath).split(path.sep).join("/");
}

/**
 * Expand a list of YAML interest entries (files, directories, or glob
 * patterns) into concrete file paths relative to `projectDir`.
 *
 * For each entry:
 * - an existing file → added directly
 * - an existing directory → every file under it, recursively (ignore
 *   patterns prune subdirectories during the walk, same as upstream's
 *   glob-`ignore` short-circuiting)
 * - anything else → treated as a glob pattern and matched against a full
 *   project walk (computed once, lazily, and shared across every
 *   glob-pattern entry in this call)
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {string[]} entries - relative paths/globs from YAML config
 * @param {string[]} ignorePatterns - patterns to exclude
 * @returns {Set<string>} relative POSIX file paths
 */
function expandEntriesToFiles(projectDir, entries, ignorePatterns) {
  const files = new Set();
  const prefixedIgnore = prefixIgnorePatterns(ignorePatterns);
  const isIgnored = picomatch(prefixedIgnore, { dot: true });

  let allProjectFiles = null;
  function getAllProjectFiles() {
    if (!allProjectFiles)
      allProjectFiles = walkFiles(projectDir, prefixedIgnore);
    return allProjectFiles;
  }

  for (const entry of entries) {
    if (!entry) continue;

    const absEntry = path.join(projectDir, entry);
    let stats;
    try {
      stats = fs.statSync(absEntry);
    } catch {
      stats = null;
    }

    if (stats && stats.isFile()) {
      const relPath = toPosixRelative(projectDir, absEntry);
      if (!isIgnored(relPath)) files.add(relPath);
    } else if (stats && stats.isDirectory()) {
      for (const rel of walkFiles(absEntry, prefixedIgnore)) {
        files.add(`${entry}/${rel}`);
      }
    } else {
      const isMatch = picomatch(entry, { dot: true });
      for (const relPath of getAllProjectFiles()) {
        if (isMatch(relPath)) files.add(relPath);
      }
    }
  }

  return files;
}

/**
 * Hash a set of relative file paths in parallel (bounded concurrency).
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {Set<string>} filePaths - relative file paths to hash
 * @returns {Promise<Record<string, {hash: string}>>}
 */
async function hashFilePathsAsync(projectDir, filePaths) {
  return buildHashRecord([...filePaths], async (relPath) => {
    const absPath = path.join(projectDir, relPath);
    try {
      const stats = await fs.promises.stat(absPath);
      if (stats.isFile()) {
        return [relPath, { hash: await computeFileHash(absPath) }];
      }
    } catch {
      // File may have been deleted since the directory scan — skip
    }
    return null;
  });
}

// ─── Interest entry collection ──────────────────────────────────────────────

/**
 * Build the base entries list from a parsed native YAML config (pure).
 *
 * @param {import('./yaml-reader').NativeInputInterestConfig} config
 * @returns {string[]}
 */
function buildNativeBaseEntries(config) {
  return [
    ...config.sources,
    ...config.edcFiles,
    ...config.edcImagesDirs,
    ...config.edcSoundDirs,
    ...config.edcFontDirs,
    ...config.poFiles,
    ...config.resources,
    ...config.libFiles,
    ...config.includeDirs,
    ...config.libDirs,
    "tizen_native_project.yaml",
  ];
}

/**
 * Get the input interest entries for a native project: everything from
 * `tizen_native_project.yaml`'s interest keys, plus the YAML file itself
 * and (if present) `tizen-manifest.xml` / `project_def.prop`.
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {string|null} [yamlPath] - pre-resolved YAML path, to skip a
 *   redundant lookup when the caller already has it
 * @returns {Promise<string[]>} relative path/glob entries
 */
async function getNativeInputEntriesAsync(projectDir, yamlPath) {
  const resolvedPath = yamlPath ?? findProjectYamlPath(projectDir, "native");
  if (!resolvedPath) return [];

  try {
    const config = await parseNativeProjectYaml(resolvedPath);
    const allEntries = buildNativeBaseEntries(config);

    if (fs.existsSync(path.join(projectDir, "tizen-manifest.xml"))) {
      allEntries.push("tizen-manifest.xml");
    }
    if (fs.existsSync(path.join(projectDir, "project_def.prop"))) {
      allEntries.push("project_def.prop");
    }

    return allEntries;
  } catch {
    return [];
  }
}

/**
 * Build the base entries list from a parsed dotnet YAML config (pure).
 * Entries are prefixed with the YAML's subdirectory, since dotnet YAML
 * lives alongside the `.csproj` rather than at the project root.
 *
 * @param {import('./yaml-reader').DotnetInputInterestConfig} config
 * @param {string} prefix - e.g. `"TizenNUIApp/"`, or `""` at the root
 * @returns {string[]}
 */
function buildDotnetBaseEntries(config, prefix) {
  const allEntries = [];

  for (const entry of config.files) allEntries.push(prefix + entry);
  for (const entry of config.resources) allEntries.push(prefix + entry);
  if (config.csprojFile) allEntries.push(prefix + config.csprojFile);
  allEntries.push(`${prefix}tizen_dotnet_project.yaml`);

  return allEntries;
}

/**
 * Get the input interest entries for a dotnet project: `files` and
 * `resources` from `tizen_dotnet_project.yaml`, the `.csproj` file, the
 * YAML file itself, and (if present) `tizen-manifest.xml` — all prefixed
 * with the YAML's subdirectory relative to `projectDir`.
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {string|null} [yamlPath] - pre-resolved YAML path, to skip a
 *   redundant lookup when the caller already has it
 * @returns {Promise<string[]>} relative path/glob entries
 */
async function getDotnetInputEntriesAsync(projectDir, yamlPath) {
  const resolvedPath = yamlPath ?? findProjectYamlPath(projectDir, "dotnet");
  if (!resolvedPath) return [];

  try {
    const config = await parseDotnetProjectYaml(resolvedPath);

    const yamlDir = path.dirname(resolvedPath);
    const subdir = toPosixRelative(projectDir, yamlDir);
    const prefix = subdir ? `${subdir}/` : "";

    const allEntries = buildDotnetBaseEntries(config, prefix);

    if (fs.existsSync(path.join(yamlDir, "tizen-manifest.xml"))) {
      allEntries.push(`${prefix}tizen-manifest.xml`);
    }

    return allEntries;
  } catch {
    return [];
  }
}

// ─── Strategy-specific scanners ─────────────────────────────────────────────

/**
 * Scan input files for a native app using `tizen_native_project.yaml`.
 *
 * @param {string} projectDir
 * @param {import('./yaml-reader').InputIgnoreConfig} ignoreConfig
 * @returns {Promise<Record<string, {hash: string}>>}
 */
async function scanNativeInputFilesAsync(projectDir, ignoreConfig) {
  const allEntries = await getNativeInputEntriesAsync(projectDir);
  if (allEntries.length === 0) return {};

  const filePaths = expandEntriesToFiles(
    projectDir,
    allEntries,
    ignoreConfig.patterns,
  );
  return hashFilePathsAsync(projectDir, filePaths);
}

/**
 * Scan input files for a web app: the `files` key in
 * `tizen_web_project.yaml` is often empty (tizen-core auto-discovers web
 * files), so this walks the whole project directory minus `excludes`.
 *
 * @param {string} projectDir
 * @param {import('./yaml-reader').InputIgnoreConfig} ignoreConfig
 * @returns {Promise<Record<string, {hash: string}>>}
 */
async function scanWebInputFilesAsync(projectDir, ignoreConfig) {
  const prefixedIgnore = prefixIgnorePatterns(ignoreConfig.patterns);
  const allFiles = walkFiles(projectDir, prefixedIgnore);
  return hashFilePathsAsync(projectDir, new Set(allFiles));
}

/**
 * Scan input files for a dotnet app using `tizen_dotnet_project.yaml`.
 *
 * @param {string} projectDir
 * @param {import('./yaml-reader').InputIgnoreConfig} ignoreConfig
 * @returns {Promise<Record<string, {hash: string}>>}
 */
async function scanDotnetInputFilesAsync(projectDir, ignoreConfig) {
  const allEntries = await getDotnetInputEntriesAsync(projectDir);
  if (allEntries.length === 0) return {};

  const filePaths = expandEntriesToFiles(
    projectDir,
    allEntries,
    ignoreConfig.patterns,
  );
  return hashFilePathsAsync(projectDir, filePaths);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan input (source) files for a project using YAML config-based interest
 * lists, hashing every discovered file.
 *
 * Unlike the extension's version, `appType` is required rather than
 * auto-detected — callers already have it from the eligibility-gating
 * `detectAppType()` call, so re-deriving it here would just be a second,
 * redundant filesystem scan (same rationale as `yaml-reader.js`).
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {'native'|'web'|'dotnet'} appType
 * @param {import('./yaml-reader').InputIgnoreConfig} [ignoreConfig] - auto-read from YAML if omitted
 * @returns {Promise<Record<string, {hash: string}>>} relative path → { hash }
 */
async function scanInputFilesAsync(projectDir, appType, ignoreConfig) {
  if (appType !== "native" && appType !== "web" && appType !== "dotnet") {
    throw new Error(`Unsupported app type: ${appType}`);
  }

  const resolvedIgnore =
    ignoreConfig ?? (await readInputIgnoreConfig(projectDir, appType));

  switch (appType) {
    case "native":
      return scanNativeInputFilesAsync(projectDir, resolvedIgnore);
    case "web":
      return scanWebInputFilesAsync(projectDir, resolvedIgnore);
    case "dotnet":
      return scanDotnetInputFilesAsync(projectDir, resolvedIgnore);
  }
}

module.exports = {
  scanInputFilesAsync,
  expandEntriesToFiles,
  getNativeInputEntriesAsync,
  getDotnetInputEntriesAsync,
  scanNativeInputFilesAsync,
  scanWebInputFilesAsync,
  scanDotnetInputFilesAsync,
};
