// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Recursive directory walk, replacing the `glob` package.
 *
 * `glob` drags in `minimatch`/`path-scurry`/`lru-cache` and Node 20 (this
 * repo's floor — see .nvmrc) has no `fs.glob`. The extension's own ignore
 * checks already run through `picomatch`, so a plain recursive
 * `fs.readdirSync(dir, { withFileTypes: true })` walk filtered through the
 * vendored picomatch reproduces the same matching semantics without the
 * dependency — see docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 6.
 *
 * Directories that match an ignore pattern are pruned rather than filtered
 * after listing, so an ignored `node_modules/` is never descended into —
 * this is load-bearing for performance, not just correctness, since `glob`'s
 * `ignore` option does the same short-circuiting.
 *
 * Symlinks are not followed (unlike `glob`'s default). Tizen project trees
 * don't rely on symlinked sources/outputs, and skipping them sidesteps
 * cycle detection entirely.
 */

const fs = require("fs");
const path = require("path");
const picomatch = require("../../vendor/picomatch");

/**
 * Recursively list every regular file under `rootDir`.
 *
 * @param {string} rootDir
 * @param {string[]} [ignorePatterns] - picomatch glob patterns matched
 *   against the POSIX-style path relative to `rootDir`, with `dot: true`
 *   (matches glob's `ignore` + `dot: true` combination). Patterns are used
 *   as-is — callers wanting `**\/foo`-style "any depth" semantics must
 *   pre-prefix them (see scanner-shared.js `prefixIgnorePatterns`).
 * @returns {string[]} relative POSIX paths, sorted for deterministic output
 */
function walkFiles(rootDir, ignorePatterns = []) {
  const isIgnored = picomatch(ignorePatterns, { dot: true });
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // removed/inaccessible since the parent was listed — skip
    }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, absPath).split(path.sep).join("/");

      if (ignorePatterns.length > 0 && isIgnored(relPath)) continue;

      if (entry.isDirectory()) {
        walk(absPath);
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }

  walk(rootDir);
  return results.sort();
}

/**
 * Directories a *lookup* walk (as opposed to a manifest scan) never needs to
 * enter: dot-directories (matching the extension's `globSync({ dot: false })`
 * default), package caches, and .NET build output. The files these lookups
 * hunt for — `tizen-manifest.xml` beside a `.csproj`, `tizen_*_project.yaml`,
 * the `.csproj` itself — live in source directories; the copies under
 * `bin/…/tpkroot/` are build artifacts and would only produce false hits.
 */
const LOOKUP_PRUNED_DIRS = new Set(["node_modules", "bin", "obj"]);

/**
 * Breadth-first search for files matching `predicate`, shallowest first.
 *
 * This is the single implementation behind every "find <file> somewhere
 * under the project" lookup in the RDS code (`findFilesByName`,
 * `findFirstFileByExtension`). BFS order is load-bearing: callers that take
 * the first match get the one closest to the project root — e.g. the
 * project's own `.csproj`, not `MyApp.Tests/MyApp.Tests.csproj` that a
 * depth-first `readdir`-order walk would return because `MyApp.Tests` sorts
 * before `MyApp`.
 *
 * Unlike {@link walkFiles} this returns absolute paths, prunes
 * {@link LOOKUP_PRUNED_DIRS} and dot-directories, and does not follow symlinks.
 *
 * @param {string} rootDir
 * @param {(name: string, absPath: string) => boolean} predicate - tested on
 *   regular files only
 * @param {{ first?: boolean }} [opts] - `first: true` stops at the first match
 * @returns {string[]} absolute paths, shallowest first, `readdir` order within
 *   a depth
 */
function findFiles(rootDir, predicate, opts = {}) {
  const matches = [];
  let level = [rootDir];

  while (level.length > 0) {
    const nextLevel = [];
    for (const dir of level) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue; // removed/inaccessible since the parent was listed — skip
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const absPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!LOOKUP_PRUNED_DIRS.has(entry.name)) nextLevel.push(absPath);
        } else if (entry.isFile() && predicate(entry.name, absPath)) {
          matches.push(absPath);
          if (opts.first) return matches;
        }
      }
    }
    level = nextLevel;
  }

  return matches;
}

module.exports = { walkFiles, findFiles };
