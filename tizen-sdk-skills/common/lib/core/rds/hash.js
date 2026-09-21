// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * XXH3-128 file hashing for RDS.
 *
 * Must produce output byte-identical to the VS Code extension's
 * `computeFileHashAsync()` (`@node-rs/xxhash`'s `xxh3.xxh128`), since the two
 * write/read the same `.tizen-rds/*.json` state files. Parity is verified in
 * `common/lib/tests/rds-hash.test.js` against hashes computed with the real
 * `@node-rs/xxhash` package — see `common/lib/vendor/README.md`.
 */

const fs = require("fs");
const {
  xxhash128,
  createXXHash128,
} = require("../../vendor/xxhash128.umd.min.js");

// Files at or above this size are streamed through createXXHash128() instead
// of being read into a single Buffer, so a large .NET publish output doesn't
// require holding the whole file in memory.
const STREAM_THRESHOLD_BYTES = 4 * 1024 * 1024;

/**
 * Compute the XXH3-128 hash of a file's contents.
 * @param {string} filePath
 * @returns {Promise<string>} 32-char lowercase hex digest
 */
async function computeFileHash(filePath) {
  const { size } = await fs.promises.stat(filePath);
  if (size < STREAM_THRESHOLD_BYTES) {
    const buffer = await fs.promises.readFile(filePath);
    return xxhash128(buffer);
  }
  return computeFileHashStreaming(filePath);
}

async function computeFileHashStreaming(filePath) {
  const hasher = await createXXHash128();
  hasher.init();
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hasher.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hasher.digest("hex");
}

module.exports = { computeFileHash };
