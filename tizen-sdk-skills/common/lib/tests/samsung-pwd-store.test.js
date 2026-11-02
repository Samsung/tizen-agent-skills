// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * samsung-pwd-store tests.
 *
 * 1. The certificate password must not leave the module inside an error. The
 *    store passes the password to wincrypt.exe / security / secret-tool on the
 *    command line; when one of them cannot be started (ENOENT, EACCES), Node's
 *    error carries `spawnargs` — the argument list, password included — and
 *    `util.inspect` / `console.error` print the fields of an error's causes.
 *    A password spawn() would quote in its own error (NUL byte, non-string) is
 *    refused up front.
 * 2. Command output: wincrypt's CRLF output, UTF-8 characters split across
 *    output chunks, spaces in the secret, and when a store or lookup fails
 *    (macOS `security`: exit code; the TV SDK's secret-tool: exit code or any
 *    stderr, and an empty lookup).
 *
 * The store commands are replaced by fake scripts (a fake SDK for secret-tool,
 * PATH for `security`); real ones are never run, so no Keychain or keyring is
 * touched.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const { spawnSync } = require("child_process");

// sdk.js resolves ~/.tizen.sdk.path.config at require time: point HOME at a
// sandbox with a fake SDK BEFORE requiring the store.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pwd-store-"));
const savedHome = process.env.HOME;
const savedUserprofile = process.env.USERPROFILE;
const savedPath = process.env.PATH;
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
const fakeSdk = path.join(sandbox, "tizen-sdk");
fs.mkdirSync(path.join(fakeSdk, "tools", "certificate-encryptor"), {
  recursive: true,
});
fs.writeFileSync(path.join(sandbox, ".tizen.sdk.path.config"), `${fakeSdk}\n`);

const {
  stripSpawnArgs,
  withoutSpawnArgs,
  parseWincryptOutput,
  encryptPassword,
  decryptPassword,
  encryptPasswordMacOS,
  decryptPasswordMacOS,
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

async function settle(promise) {
  try {
    return { value: await promise, error: null };
  } catch (error) {
    return { value: undefined, error };
  }
}

function messageMatches(result, re) {
  return Boolean(result.error && re.test(result.error.message));
}

const SECRET = "TOPSECRET-pwd-store-test";
const isPosix = process.platform !== "win32";

/** Write a bash script, executable unless `mode` says otherwise. */
function writeScript(file, body, mode = 0o755) {
  fs.writeFileSync(file, `#!/bin/bash\n${body}\n`, { mode });
  fs.chmodSync(file, mode);
}

async function main() {
  // --- stripSpawnArgs ----------------------------------------------------------
  console.log("--- stripSpawnArgs ---");
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
    const outer = new Error("outer", {
      cause: new Error("middle", { cause: spawnError }),
    });
    check("returns the same error", stripSpawnArgs(outer) === outer, true);
    check(
      "secret gone from the whole cause chain",
      util.inspect(outer, { depth: 10 }).includes(SECRET),
      false,
    );
    check(
      "code / syscall kept",
      [spawnError.code, spawnError.syscall],
      ["ENOENT", "spawnSync tizen-no-such-binary-xyz"],
    );
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b; // a cycle must not hang
    check("cause cycle terminates", stripSpawnArgs(a) === a, true);
    const fresh = spawnSync("tizen-no-such-binary-xyz", ["-w", SECRET]).error;
    const copy = withoutSpawnArgs(fresh);
    check(
      "withoutSpawnArgs: copy without spawnargs, code kept, original untouched",
      ["spawnargs" in copy, copy.code, "spawnargs" in fresh],
      [false, "ENOENT", true],
    );
    check(
      "non-object passes through",
      [stripSpawnArgs(undefined), stripSpawnArgs("s")],
      [undefined, "s"],
    );
  }

  // --- a password spawn() would quote is refused up front ----------------------
  console.log("\n--- encryptPassword: password validation ---");
  for (const [name, bad] of [
    ["NUL byte", `${SECRET}\0x`],
    ["non-string", 12345],
  ]) {
    const marker = path.join(sandbox, `invalid-${name}.pwd`);
    const r = await settle(encryptPassword(bad, marker));
    check(
      `${name} → samsung_pwd_store_failed`,
      messageMatches(
        r,
        /^samsung_pwd_store_failed: the certificate password must be a string without NUL characters$/,
      ),
      true,
    );
    check(
      `${name} → value not in util.inspect`,
      util.inspect(r.error, { depth: 10 }).includes(String(bad).slice(0, 10)),
      false,
    );
    check(`${name} → no marker`, fs.existsSync(marker), false);
  }

  // --- wincrypt.exe output -----------------------------------------------------
  console.log("\n--- parseWincryptOutput ---");
  for (const [name, out, expected] of [
    ["LF", "PASSWORD:secret\n", "secret"],
    ["CRLF with more lines", "PASSWORD:secret\r\nDone.\r\n", "secret"],
    ["text-mode \\r\\r\\n", "PASSWORD:secret\r\r\nDone.\r\r\n", "secret"],
    ["bare trailing \\r", "PASSWORD:secret\r", "secret"],
    ["leading blank line", "\r\nPASSWORD:secret\r\n", "secret"],
    ["trailing spaces kept", "PASSWORD:pw  \r\n", "pw  "],
    // "" is rejected by decryptPasswordWindows as "returned no password"
    ['empty PASSWORD: line → ""', "PASSWORD:\r\n", ""],
  ]) {
    check(name, parseWincryptOutput(out).password, expected);
  }
  check(
    "unexpected output → null + the line",
    parseWincryptOutput("ERROR: bad file\r\n"),
    { password: null, line: "ERROR: bad file" },
  );

  // --- macOS `security`, faked on PATH -----------------------------------------
  // encrypt/decryptPasswordMacOS have no platform guard. Never run them where
  // the real `security` exists (macOS) — they would use the Keychain.
  console.log("\n--- macOS `security` ---");
  const hasSecurity =
    process.platform === "darwin" ||
    spawnSync(process.platform === "win32" ? "where" : "which", ["security"])
      .status === 0;
  if (hasSecurity || !isPosix) {
    console.log("SKIP real `security` available, or not a POSIX host");
  } else {
    const marker = path.join(sandbox, "author.pwd");
    const missing = await settle(encryptPasswordMacOS(SECRET, marker));
    check(
      "missing `security` → failed to spawn, cause.code ENOENT",
      [
        messageMatches(missing, /failed to spawn security/),
        missing.error && missing.error.cause && missing.error.cause.code,
      ],
      [true, "ENOENT"],
    );
    check(
      "missing `security` → secret not in util.inspect (helper called directly)",
      util.inspect(missing.error, { depth: 10 }).includes(SECRET),
      false,
    );

    const bin = path.join(sandbox, "bin");
    fs.mkdirSync(bin);
    const security = path.join(bin, "security");
    process.env.PATH = `${bin}${path.delimiter}${savedPath}`;

    // Apple's tool reports failure through its exit code: a warning on stderr
    // with exit 0 is a successful store.
    writeScript(security, 'echo "security: SecKeychain warning" >&2\nexit 0');
    const ok = await settle(encryptPasswordMacOS(SECRET, marker));
    check("store: stderr warning, exit 0 → resolves", ok.error, null);
    check("store: marker written", fs.existsSync(marker), true);

    writeScript(security, 'echo "denied" >&2\nexit 51');
    const bad = await settle(encryptPasswordMacOS(SECRET, marker));
    check(
      "store: exit 51 → Keychain encrypt failed: denied",
      messageMatches(bad, /Keychain encrypt failed: denied/),
      true,
    );

    writeScript(security, "printf ' pw \\n'");
    const looked = await settle(decryptPasswordMacOS(marker));
    check("lookup: spaces in the secret kept", looked.value, " pw ");

    writeScript(security, "printf '\\n'");
    const empty = await settle(decryptPasswordMacOS(marker));
    check(
      "lookup: exit 0 with an empty secret → fails",
      messageMatches(empty, /Keychain lookup returned no password/),
      true,
    );
    process.env.PATH = savedPath;
  }

  // --- the TV SDK's secret-tool, faked in the SDK ------------------------------
  // findSecretTool only looks on Linux, under <sdk>/tools/certificate-encryptor.
  // These go through the module's entry points, encrypt/decryptPassword.
  console.log(
    "\n--- secret-tool (through encryptPassword / decryptPassword) ---",
  );
  if (process.platform !== "linux") {
    console.log("SKIP not Linux");
  } else {
    const tool = path.join(
      fakeSdk,
      "tools",
      "certificate-encryptor",
      "secret-tool",
    );
    const pwd = path.join(sandbox, "linux.pwd");

    // Present but not executable → spawn fails with EACCES, and its spawnargs
    // hold `--password=<secret>`.
    writeScript(tool, "exit 0", 0o644);
    const denied = await settle(encryptPassword(SECRET, pwd));
    check(
      "store: EACCES → failed to spawn secret-tool",
      messageMatches(denied, /failed to spawn secret-tool/),
      true,
    );
    check(
      "store: EACCES → secret not in util.inspect of the error",
      util.inspect(denied.error, { depth: 10 }).includes(SECRET),
      false,
    );
    check(
      "store: EACCES → cause.code kept",
      denied.error && denied.error.cause && denied.error.cause.code,
      "EACCES",
    );

    writeScript(tool, "exit 0");
    const stored = await settle(encryptPassword(SECRET, pwd));
    check(
      "store: exit 0, no stderr → resolves + marker",
      [stored.error, fs.existsSync(pwd)],
      [null, true],
    );

    // The SDK's helpers do not report failure through the exit code reliably,
    // so any stderr output fails a store or lookup.
    writeScript(tool, 'echo "cannot reach the keyring" >&2\nexit 0');
    const warned = await settle(encryptPassword(SECRET, pwd));
    check(
      "store: stderr with exit 0 → fails",
      messageMatches(
        warned,
        /secret-tool store failed: cannot reach the keyring/,
      ),
      true,
    );

    writeScript(tool, 'echo "no keyring" >&2\nexit 1');
    const failed = await settle(encryptPassword(SECRET, pwd));
    check(
      "store: exit 1 → fails with stderr",
      messageMatches(failed, /secret-tool store failed: no keyring/),
      true,
    );

    // "한글" (ED 95 9C EA B8 80) in two writes that split "한", with a pause so
    // they arrive as separate chunks; a trailing space belongs to the secret.
    writeScript(
      tool,
      "printf '\\xed\\x95'; sleep 0.3; printf '\\x9c\\xea\\xb8\\x80 \\n'",
    );
    const looked = await settle(decryptPassword(pwd));
    check(
      "lookup: UTF-8 split across chunks intact, spaces kept",
      looked.value,
      "한글 ",
    );

    writeScript(
      tool,
      'printf "secret\\n"; echo "No matching secret" >&2\nexit 0',
    );
    const noisy = await settle(decryptPassword(pwd));
    check(
      "lookup: stderr with exit 0 → fails",
      messageMatches(noisy, /secret-tool lookup failed: No matching secret/),
      true,
    );

    writeScript(tool, "exit 0");
    const empty = await settle(decryptPassword(pwd));
    check(
      "lookup: exit 0 with no output → fails",
      messageMatches(empty, /secret-tool lookup returned no password/),
      true,
    );

    writeScript(tool, "exit 1");
    const notFound = await settle(decryptPassword(pwd));
    check(
      "lookup: exit 1 → fails",
      messageMatches(notFound, /secret-tool lookup failed: exit code 1/),
      true,
    );
  }
}

main()
  .catch((error) => {
    failures++;
    console.error(error);
  })
  .finally(() => {
    process.env.HOME = savedHome;
    process.env.USERPROFILE = savedUserprofile;
    process.env.PATH = savedPath;
    fs.rmSync(sandbox, { recursive: true, force: true });
    console.log(
      failures === 0
        ? "\nAll samsung-pwd-store tests passed"
        : `\n${failures} FAILED`,
    );
    process.exit(failures === 0 ? 0 : 1);
  });
