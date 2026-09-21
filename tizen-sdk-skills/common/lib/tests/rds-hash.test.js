// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS hash.js parity test.
 *
 * The CLI's computeFileHash() must produce output byte-identical to the VS
 * Code extension's computeFileHashAsync() (`@node-rs/xxhash`'s `xxh3.xxh128`),
 * because both read/write the same `.tizen-rds/*.json` state files.
 *
 * `common/` ships with zero third-party dependencies (see
 * docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 0), so this test cannot require
 * `@node-rs/xxhash` directly. Instead, the fixtures below were hashed once
 * with the real `@node-rs/xxhash@1.7.6` package (run from
 * Tizen.Extension.V2/packages/server) and the resulting hashes are hardcoded
 * as the expected values. A mismatch here means the vendored `hash-wasm`
 * build (common/lib/vendor/xxhash128.umd.min.js) no longer agrees with the
 * extension's hash algorithm.
 */

const fs = require("fs");
const path = require("path");
const { computeFileHash } = require("../core/rds/hash");

console.log("=== rds/hash.js parity Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok ? "" : ` — got ${actual}, expected ${expected}`),
  );
}

const FIXTURE_DIR = path.join(__dirname, "fixtures", "rds-hash");

// Hashes computed with @node-rs/xxhash@1.7.6:
//   xxh3.xxh128(buffer).toString(16).padStart(32, "0")
const EXPECTED = {
  "empty.bin": "99aa06d3014798d86001c324468d497f", // 0 bytes
  "small.bin": "df8d09e93f874900a99b8775cc15b6c7", // 11 bytes, "hello world"
  "medium.bin": "4dfe064dec7535aca6c7ae8f6830160a", // 1000 bytes, deterministic PRNG content
  "large.bin": "ac7fb3cae081ad778f7205b571226322", // 70000 bytes, deterministic PRNG content
};

(async () => {
  for (const [file, expectedHash] of Object.entries(EXPECTED)) {
    const actualHash = await computeFileHash(path.join(FIXTURE_DIR, file));
    check(file, actualHash, expectedHash);
  }

  // computeFileHash() must also be stable across repeated calls on the same file.
  const repeatA = await computeFileHash(path.join(FIXTURE_DIR, "small.bin"));
  const repeatB = await computeFileHash(path.join(FIXTURE_DIR, "small.bin"));
  check("small.bin hash is stable across calls", repeatA, repeatB);

  // Sanity check the fixtures themselves haven't drifted (would invalidate EXPECTED above).
  check(
    "large.bin fixture size unchanged",
    fs.statSync(path.join(FIXTURE_DIR, "large.bin")).size,
    70000,
  );

  // Streaming path (>= 4 MiB, hash.js STREAM_THRESHOLD_BYTES) must agree with
  // the one-shot path. The fixtures are all far below the threshold, so build a
  // 5 MiB file from a deterministic PRNG and compare against the same bytes
  // fed through the one-shot vendored hasher — a chunk-boundary bug in the
  // incremental update would show up here as a mismatch.
  const { xxhash128 } = require("../vendor/xxhash128.umd.min.js");
  const os = require("os");
  const bigDir = fs.mkdtempSync(path.join(os.tmpdir(), "rds-hash-big-"));
  try {
    const size = 5 * 1024 * 1024 + 12345; // not a multiple of the stream chunk size
    const big = Buffer.alloc(size);
    let seed = 0x12345678;
    for (let i = 0; i < size; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      big[i] = seed & 0xff;
    }
    const bigPath = path.join(bigDir, "big.bin");
    fs.writeFileSync(bigPath, big);
    const streamed = await computeFileHash(bigPath);
    const oneShot = await xxhash128(big);
    check("5 MiB file: streaming hash equals one-shot hash", streamed, oneShot);
    check(
      "5 MiB file: streaming hash is 32 lowercase hex chars",
      /^[0-9a-f]{32}$/.test(streamed),
      true,
    );
  } finally {
    fs.rmSync(bigDir, { recursive: true, force: true });
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
