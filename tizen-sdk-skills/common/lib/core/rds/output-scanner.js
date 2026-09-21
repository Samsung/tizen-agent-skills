// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Output Scanner — strategy-based build output file discovery for RDS.
 *
 * Scans build output directories to find files tracked for RDS delta
 * deployment. Dispatches on a strategy per app type
 * (`constants.js`'s `DEFAULT_OUTPUT_INTEREST_LIST`):
 *
 * - **`read_file`** (native): reads `Debug/tpk_contents` — the manifest
 *   tizen-core writes listing every packaged file — and hashes each entry.
 * - **`watch_folder`** (web): walks `Debug/projects/{projectName}/` for
 *   all web resources.
 * - **`watch_folder`** (dotnet): walks
 *   `{csprojDir}/bin/Debug/{targetFramework}/tpkroot/` — the on-device
 *   layout — for the published output.
 *
 * All returned paths are relative to the project root, POSIX-separated.
 *
 * Only the async scanning path is ported — see
 * docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 6. `isOutputFile`/
 * `getOutputInterestPatterns` (single-file classification) are not ported:
 * upstream they exist solely to back the watcher's classification cache
 * (`classification-cache.ts`), which Part 4 ("Deliberately not ported")
 * drops — there's no file watcher in the CLI, so nothing needs to answer
 * "is this one file an output file?" in isolation (same reasoning as
 * `input-scanner.js`'s dropped `isInputFile`).
 *
 * Reference: packages/server/src/features/rds/output-scanner.ts
 *
 * @module core/rds/output-scanner
 */

const fs = require("fs");
const path = require("path");
const picomatch = require("../../vendor/picomatch");
const { walkFiles } = require("./fs-walk");
const { computeFileHash } = require("./hash");
const { prefixIgnorePatterns, buildHashRecord } = require("./scanner-shared");
const { findFirstFileByExtension } = require("./yaml-reader");
const { parseTpkContentsAsync } = require("./tpk-contents-parser");
const {
  DEFAULT_OUTPUT_INTEREST_LIST,
  DEFAULT_IGNORE_LIST,
} = require("./constants");

/** @typedef {{patterns: string[]}} IgnoreListConfig */

// ─── Placeholder resolution ─────────────────────────────────────────────────

/**
 * Parse the `<TargetFramework>` XML element out of raw `.csproj` content.
 *
 * Pure — no I/O. Reference: tizen-core/pkg/ws/dotnet_project.go:156-161
 *
 * @param {string} content - raw .csproj file content
 * @returns {string|null} e.g. `"net6.0-tizen7.0"`, or null if not found
 */
function parseTargetFrameworkFromContent(content) {
  const match = content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/);
  return match ? match[1].trim() : null;
}

/**
 * Substitute resolved placeholder values into a path template. Pure — the
 * I/O (finding the .csproj, reading its content) happens in
 * {@link resolvePlaceholders}, which calls this.
 *
 * @param {string} template - contains `{projectName}`/`{csprojDir}`/`{targetFramework}`
 * @param {string} projectName
 * @param {string} csprojDirRel - relative to projectDir, POSIX-separated
 * @param {string} targetFramework
 * @returns {string}
 */
function resolvePlaceholdersWithCsproj(
  template,
  projectName,
  csprojDirRel,
  targetFramework,
) {
  return template
    .replace(/\{projectName\}/g, projectName)
    .replace(/\{csprojDir\}/g, csprojDirRel)
    .replace(/\{targetFramework\}/g, targetFramework);
}

/**
 * Resolve `{projectName}` / `{csprojDir}` / `{targetFramework}` placeholders
 * in a path template relative to `projectDir`.
 *
 * @param {string} template
 * @param {string} projectDir - absolute path to the project directory
 * @returns {string} resolved path relative to projectDir, POSIX-separated
 */
function resolvePlaceholders(template, projectDir) {
  const projectName = path.basename(projectDir);

  let csprojDirRel = "";
  let targetFramework = "";
  if (
    template.includes("{csprojDir}") ||
    template.includes("{targetFramework}")
  ) {
    const csprojAbs = findFirstFileByExtension(projectDir, ".csproj");
    if (csprojAbs) {
      const rel = path
        .relative(projectDir, path.dirname(csprojAbs))
        .split(path.sep)
        .join("/");
      csprojDirRel = rel || ".";
      try {
        const content = fs.readFileSync(csprojAbs, "utf-8");
        targetFramework = parseTargetFrameworkFromContent(content) ?? "";
      } catch {
        targetFramework = "";
      }
    }
  }

  return resolvePlaceholdersWithCsproj(
    template,
    projectName,
    csprojDirRel,
    targetFramework,
  );
}

// ─── Common directory scanner ───────────────────────────────────────────────

/**
 * Hash every file under `baseDir`, ignoring `.tizen-rds/**`-style patterns.
 * Shared implementation for the `watch_folder` strategy.
 *
 * @param {string} projectDir - absolute path (for relative path computation)
 * @param {string} baseDir - absolute path to the directory to scan
 * @param {IgnoreListConfig} ignoreList
 * @returns {Promise<Record<string, {hash: string}>>}
 */
async function scanGlobDirAsync(projectDir, baseDir, ignoreList) {
  const prefixedIgnore = prefixIgnorePatterns(ignoreList.patterns);
  const relToBase = walkFiles(baseDir, prefixedIgnore);
  const absPaths = relToBase.map((rel) => path.join(baseDir, rel));

  return buildHashRecord(absPaths, async (absPath) => {
    const relPath = path
      .relative(projectDir, absPath)
      .split(path.sep)
      .join("/");
    try {
      return [relPath, { hash: await computeFileHash(absPath) }];
    } catch {
      // File may have been deleted — skip
      return null;
    }
  });
}

// ─── Strategy-specific scanners ─────────────────────────────────────────────

/**
 * Scan output files using the `read_file` strategy: read the manifest file
 * (e.g. `tpk_contents`) listing the built files, then hash each one that
 * exists on disk.
 *
 * @param {string} projectDir
 * @param {string} filename - manifest path relative to projectDir (already placeholder-resolved)
 * @param {IgnoreListConfig} ignoreList
 * @returns {Promise<Record<string, {hash: string}>>}
 * @throws {Error} if the manifest file is not found
 */
async function scanFromFileAsync(projectDir, filename, ignoreList) {
  const manifestPath = path.join(projectDir, filename);
  const buildDirName = path.dirname(filename);

  let stats;
  try {
    stats = await fs.promises.stat(manifestPath);
  } catch {
    stats = null;
  }
  if (!stats || !stats.isFile()) {
    throw new Error(
      `Manifest file not found: ${filename}. Build the project first before using RDS.`,
    );
  }

  const result = await parseTpkContentsAsync(manifestPath, buildDirName);
  if (result.errors.length > 0) {
    console.warn("[RDS] manifest file parse warnings:", result.errors);
  }

  const prefixedIgnore = prefixIgnorePatterns(ignoreList.patterns);
  const isIgnored = picomatch(prefixedIgnore, { dot: true });

  const pathsToHash = result.localPaths.filter(
    (localPath) => !isIgnored(localPath) && !localPath.endsWith("/"),
  );

  return buildHashRecord(pathsToHash, async (localPath) => {
    const absPath = path.join(projectDir, localPath);
    try {
      const fileStats = await fs.promises.stat(absPath);
      if (fileStats.isFile()) {
        return [localPath, { hash: await computeFileHash(absPath) }];
      }
    } catch {
      // File may have been deleted between scan and hash — skip
    }
    return null;
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan build output files for a project using the strategy appropriate to
 * its app type.
 *
 * Unlike the extension's version, `appType` is required rather than
 * auto-detected — same rationale as `input-scanner.js`/`yaml-reader.js`:
 * callers already have it from the eligibility-gating `detectAppType()`
 * call.
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {'native'|'web'|'dotnet'} appType
 * @param {IgnoreListConfig} [ignoreList] - defaults to `DEFAULT_IGNORE_LIST`
 * @returns {Promise<Record<string, {hash: string}>>} relative path → { hash }
 * @throws {Error} if the native tpk_contents manifest, or the dotnet
 *   tpkroot directory, hasn't been produced by a build yet
 */
async function scanOutputFilesAsync(
  projectDir,
  appType,
  ignoreList = DEFAULT_IGNORE_LIST,
) {
  const config = DEFAULT_OUTPUT_INTEREST_LIST[appType];
  if (!config) {
    throw new Error(`Unsupported app type: ${appType}`);
  }

  switch (config.strategy) {
    case "read_file": {
      const filename = resolvePlaceholders(config.filename, projectDir);
      return scanFromFileAsync(projectDir, filename, ignoreList);
    }

    case "watch_folder": {
      const dirname = resolvePlaceholders(config.dirname, projectDir);
      const absDir = path.join(projectDir, dirname);

      let stats;
      try {
        stats = await fs.promises.stat(absDir);
      } catch {
        stats = null;
      }

      if (!stats || !stats.isDirectory()) {
        if (appType === "dotnet") {
          throw new Error(
            "tpkroot directory not found for dotnet project. Build the project first before using RDS.",
          );
        }
        // Web: the projects/ directory may not exist yet on a first build — empty is fine
        return {};
      }

      return scanGlobDirAsync(projectDir, absDir, ignoreList);
    }

    default:
      throw new Error(
        `Unknown strategy "${config.strategy}" for scanning output files`,
      );
  }
}

module.exports = {
  scanOutputFilesAsync,
  parseTargetFrameworkFromContent,
  resolvePlaceholdersWithCsproj,
  resolvePlaceholders,
};
