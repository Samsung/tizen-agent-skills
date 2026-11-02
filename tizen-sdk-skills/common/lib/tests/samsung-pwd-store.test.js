// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * samsung-pwd-store tests: the certificate password must not ride along in an
 * error's `cause`.
 *
 * The store passes the password to wincrypt.exe / security / secret-tool on
 * the command line. When one of them cannot be started (ENOENT, EACCES), Node's
 * error carries `spawnargs` — that argument list, password included — and
 * `util.inspect` / `console.error` print a cause's own fields. Errors are kept
 * as `cause` (ESLint 10 preserve-caught-error), so they go through
 * withoutSpawnArgs() first.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const { spawnSync } = require("child_process");
const {
  withoutSpawnArgs,
  encryptPasswordMacOS,
} = require("../core/samsung-pwd-store");

console.log("=== samsung-pwd-store Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

const SECRET = "TOPSECRET-pwd-store-test";

// --- withoutSpawnArgs on a real spawn failure ---------------------------------
console.log("--- withoutSpawnArgs ---");
{
  const spawnError = spawnSync("tizen-no-such-binary-xyz", [
    "-w",
    SECRET,
  ]).error;
  check(
    "precondition: a spawn ENOENT carries the args",
    util.inspect(spawnError).includes(SECRET),
    true,
  );
  const safe = withoutSpawnArgs(spawnError);
  check("spawnargs dropped", "spawnargs" in safe, false);
  check(
    "code / syscall kept",
    [safe.code, safe.syscall],
    [spawnError.code, spawnError.syscall],
  );
  check("message kept", safe.message, spawnError.message);
  check(
    "wrapped with it as cause → secret not in util.inspect",
    util.inspect(new Error("x", { cause: safe })).includes(SECRET),
    false,
  );
}
{
  const plain = new Error("plain");
  check(
    "error without spawnargs → same object",
    withoutSpawnArgs(plain) === plain,
    true,
  );
  check(
    "non-object passes through",
    [withoutSpawnArgs(undefined), withoutSpawnArgs("s")],
    [undefined, "s"],
  );
}

// --- end to end: a store command that cannot be started ------------------------
// encryptPasswordMacOS has no platform guard: on a host without `security` it
// hits the real ENOENT path. Never run it where `security` exists (macOS) — it
// would write to the Keychain.
console.log("\n--- encryptPasswordMacOS without `security` ---");
const hasSecurity =
  process.platform === "darwin" ||
  spawnSync(process.platform === "win32" ? "where" : "which", ["security"])
    .status === 0;
if (hasSecurity) {
  console.log("SKIP `security` is available on this host");
} else {
  const marker = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pwd-store-")),
    "author.pwd",
  );
  (async () => {
    let err = null;
    try {
      await encryptPasswordMacOS(SECRET, marker);
    } catch (e) {
      err = e;
    }
    check("rejects", err !== null, true);
    check(
      "samsung_pwd_store_failed message",
      Boolean(
        err &&
        err.message.startsWith(
          "samsung_pwd_store_failed: failed to spawn security",
        ),
      ),
      true,
    );
    check(
      "cause keeps the errno code",
      err && err.cause && err.cause.code,
      "ENOENT",
    );
    check(
      "secret not in util.inspect of the error",
      util.inspect(err, { depth: 10 }).includes(SECRET),
      false,
    );
    check("no marker file written", fs.existsSync(marker), false);
    fs.rmSync(path.dirname(marker), { recursive: true, force: true });
    finish();
  })();
}

function finish() {
  console.log(
    failures === 0
      ? "\nAll samsung-pwd-store tests passed"
      : `\n${failures} FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
if (hasSecurity) finish();
