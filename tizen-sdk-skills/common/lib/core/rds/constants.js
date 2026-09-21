// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS constants — ported from the extension's type definitions and services.
 *
 * All values are byte-identical to the extension's originals, since both sides
 * read/write the same `.tizen-rds/*.json` state and manifest files. Changing
 * any constant without updating the extension's copy will cause the CLI and
 * extension to diverge in their interest/ignore/drift logic.
 *
 * Source files:
 *   - packages/shared/src/types/rds-interest.types.ts
 *   - packages/server/src/features/rds/reconcile-service.ts:24
 */

/**
 * Default input ignore patterns — applied to all app types during source
 * file scanning. Excludes build output, IDE metadata, VCS directories, and
 * RDS state so that change detection only considers actual source files.
 *
 * @type {string[]}
 */
const DEFAULT_INPUT_IGNORE_PATTERNS = [
  ".tizen-rds/**", // RDS state directory
  "Debug/**", // Build output
  "Release/**", // Build output
  "bin/**", // Build output (dotnet)
  "obj/**", // Build intermediate (dotnet)
  ".git/**", // VCS
  ".vscode/**", // IDE
  ".idea/**", // IDE
  "node_modules/**", // Dependencies
  "*.tpk", // Package files
  "*.wgt", // Package files
  ".rds_*", // RDS metadata
  "author-signature.xml", // Signature
  "signature1.xml", // Signature
  ".manifest.tmp", // Signature temp
  "*.pdb", // Debug symbols
];

/**
 * Output interest configuration per app type — defines HOW to discover
 * output files (build artifacts) for change tracking.
 *
 *   - native:  read `Debug/tpk_contents` manifest for the file list
 *   - web:     watch `Debug/projects/{projectName}/` for all web resources
 *   - dotnet:  watch `{csprojDir}/bin/Debug/{targetFramework}/tpkroot/` for
 *              the on-device structure
 *
 * @type {{native: {strategy: 'read_file', filename: string}, web: {strategy: 'watch_folder', dirname: string}, dotnet: {strategy: 'watch_folder', dirname: string}}}
 */
const DEFAULT_OUTPUT_INTEREST_LIST = {
  native: {
    strategy: "read_file",
    filename: "Debug/tpk_contents",
  },
  web: {
    strategy: "watch_folder",
    dirname: "Debug/projects/{projectName}",
  },
  dotnet: {
    strategy: "watch_folder",
    dirname: "{csprojDir}/bin/Debug/{targetFramework}/tpkroot",
  },
};

/**
 * Default ignore list — these patterns are always excluded from tracking.
 * Applied to all app types during both input and output scanning.
 *
 * @type {{patterns: string[]}}
 */
const DEFAULT_IGNORE_LIST = {
  patterns: [
    ".tizen-rds/**", // RDS state directory
    "**/author-signature.xml",
    "**/signature1.xml",
    "**/*.tpk",
    ".rds_*",
    "**/*.pdb",
    ".manifest.tmp", // Signature temp file
  ],
};

/**
 * Drift threshold — if the hash mismatch ratio (changed files / total files)
 * exceeds this fraction, bail from RDS and perform a full install instead.
 *
 * Rationale: below 50% drift, a delta push is almost always faster than a
 * full install. Above 50%, the delta is so large that a full install becomes
 * competitive, and we avoid the complexity of staged pushes and manifests.
 *
 * @type {number}
 */
const DRIFT_THRESHOLD = 0.5;

module.exports = {
  DEFAULT_INPUT_IGNORE_PATTERNS,
  DEFAULT_OUTPUT_INTEREST_LIST,
  DEFAULT_IGNORE_LIST,
  DRIFT_THRESHOLD,
};
