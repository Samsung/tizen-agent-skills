// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared scanner utilities — ignore-pattern prefixing and bounded-concurrency
 * hashing, used by both input-scanner.js and output-scanner.js.
 *
 * Split out of baseline-manager.js (where the reference, baseline-manager.ts,
 * defines and exports both) specifically to avoid a CommonJS circular-require
 * bug: baseline-manager.js itself requires input-scanner.js/output-scanner.js
 * (for generateBaselineManifestAsync), so if those two required these
 * functions back from baseline-manager.js, whichever one Node loads first
 * would see baseline-manager.js's `module.exports` mid-assignment — a
 * wholesale `module.exports = {...}` reassignment, not incremental
 * `exports.foo = ...` — and get `undefined` for both. Neither scanner needs
 * anything else from baseline-manager.js, so giving them (and it) a shared,
 * dependency-free source avoids the cycle entirely rather than relying on
 * require-order timing. baseline-manager.js still re-exports both, since
 * that's its module boundary per docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 4.
 *
 * @module core/rds/scanner-shared
 */

/** Concurrency limit for async file hashing — enough to saturate I/O without memory spikes. */
const HASH_CONCURRENCY = 16;

/**
 * Prefix ignore patterns so they match at any depth in picomatch calls.
 *
 * @param {string[]} patterns - raw ignore patterns
 * @returns {string[]} patterns guaranteed to start with `**\/`
 */
function prefixIgnorePatterns(patterns) {
  return patterns.map((p) => (p.startsWith("**/") ? p : `**/${p}`));
}

/**
 * Run an async worker over `items` with at most `limit` running at once.
 * A fixed pool of workers each pull the next index off a shared counter,
 * so slots are refilled immediately as they free up (no batching stalls).
 *
 * @param {string[]} items
 * @param {number} limit
 * @param {(item: string) => Promise<*>} worker
 * @returns {Promise<Array>} results in the same order as `items`
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runOne() {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runOne));
  return results;
}

/**
 * Run hash computation over a list of items in parallel with a bounded
 * concurrency pool, collecting the results into a Record.
 *
 * Each item is processed by `hashFn`, which should return a `[key, {hash}]`
 * tuple on success or `null` to skip (e.g. the file was deleted between the
 * directory scan and the hash read).
 *
 * @param {string[]} items - typically relative file paths
 * @param {(item: string) => Promise<[string, {hash: string}] | null>} hashFn
 * @returns {Promise<Record<string, {hash: string}>>}
 */
async function buildHashRecord(items, hashFn) {
  const entries = await mapWithConcurrency(items, HASH_CONCURRENCY, hashFn);
  const result = {};
  for (const entry of entries) {
    if (entry) result[entry[0]] = entry[1];
  }
  return result;
}

module.exports = {
  prefixIgnorePatterns,
  buildHashRecord,
};
