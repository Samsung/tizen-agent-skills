# Vendored dependencies

`common/lib/` ships as a verbatim directory copy into `~/.claude/plugins/...`
(and `~/.cline`, `~/.codex`, `~/.gemini`) with no `package.json` and therefore
no `node_modules`. Everything it needs must be a Node built-in or a file
vendored here. See [`docs/rds/RDS_FAST_DEPLOY_PLAN.en.md`](../../../docs/rds/RDS_FAST_DEPLOY_PLAN.en.md)
Part 0 and Part 6 for the full rationale.

## `xxhash128.umd.min.js`

- **Source package**: [`hash-wasm`](https://www.npmjs.com/package/hash-wasm)
- **Version**: 4.12.0
- **License**: MIT (Dani Biró) — full text in `hash-wasm-LICENSE` (the
  minified file only carries a one-line `@license` header, and MIT requires
  the license text to accompany copies)
- **File**: `dist/xxhash128.umd.min.js` from the npm tarball, copied verbatim
  (not built locally)
- **Why this file and not `@node-rs/xxhash`**: the extension (`Tizen.Extension.V2`)
  hashes with `@node-rs/xxhash`'s XXH3-128, which is a napi-rs native addon —
  vendoring it would mean checking in a `.node` binary per platform
  (linux-x64-gnu/musl, linux-arm64, darwin-x64/arm64, win32-x64). `hash-wasm`'s
  `xxhash128` produces byte-identical output (verified empirically — see
  `common/lib/tests/rds-hash.test.js`) via a single architecture-independent
  WASM file with the wasm binary inlined as base64, so one file covers every
  platform the plugin ships to.
- **API surface used**: exports exactly `{ xxhash128, createXXHash128 }`.
  `xxhash128(buffer)` returns `Promise<string>` (32-char lowercase hex, one
  shot). `createXXHash128()` returns `Promise<IHasher>` with `.init()`,
  `.update(chunk)`, `.digest("hex")` for streaming large files without
  loading the whole thing into memory.
- **Upgrade steps**:
  1. `npm pack hash-wasm@<version>` in a scratch directory, extract the
     tarball.
  2. Copy `dist/xxhash128.umd.min.js` over this file verbatim.
  3. Re-run `common/lib/tests/rds-hash.test.js` — it hardcodes hashes computed
     against a real `@node-rs/xxhash` run (the extension's algorithm) for the
     fixtures in `common/lib/tests/fixtures/rds-hash/`. Any mismatch means the
     new version changed the XXH3-128 output and must not be vendored.
  4. Update the version number above.

## `picomatch/`

- **Source package**: [`picomatch`](https://www.npmjs.com/package/picomatch)
- **Version**: 4.0.7
- **License**: MIT (Jon Schlinkert) — see `picomatch/LICENSE`
- **Contents**: the npm package directory, copied verbatim (`index.js`,
  `posix.js`, `lib/`, `package.json`, `LICENSE`, `README.md`) — zero runtime
  dependencies, plain CJS, no build step.
- **Why vendor instead of reimplement**: the extension's ignore-pattern
  semantics (`picomatch(patterns, { dot: true })`) must match byte-for-byte,
  since both sides read/write the same `.tizen-rds/*.json` state — glob
  syntax edge cases (extglobs, brace expansion, POSIX brackets) are the wrong
  place to take a reimplementation risk.
- **Used by**: `common/lib/core/rds/fs-walk.js` (`walkFiles()`), which
  replaces the `glob` package entirely — see its module doc comment and
  docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 6 for why `glob` itself isn't vendored
  (it drags in `minimatch`/`path-scurry`/`lru-cache`, and Node 20 has no
  `fs.glob`).
- **Upgrade steps**:
  1. `npm pack picomatch@<version>` in a scratch directory, extract the
     tarball.
  2. Replace this directory's contents with the extracted package dir
     verbatim.
  3. Re-run `common/lib/tests/fs-walk.test.js`.
  4. Update the version number above.
