// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * samsung-pwd-store tests.
 *
 * 1. The certificate password must not ride along in an error's `cause`. The
 *    store passes the password to wincrypt.exe / security / secret-tool on the
 *    command line; when one of them cannot be started (ENOENT, EACCES), Node's
 *    error carries `spawnargs` — the argument list, password included — and
 *    `util.inspect` / `console.error` print a cause's own fields.
 * 2. Command output handling: wincrypt's CRLF output, UTF-8 characters split
 *    across output chunks, and the exit code (not stderr) deciding success.
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
  withoutSpawnArgs,
  parseWincryptOutput,
  encryptPasswordMacOS,
  encryptPasswordLinux,
  decryptPasswordLinux,
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

const SECRET = "TOPSECRET-pwd-store-test";
const isPosix = process.platform !== "win32";

/** Write an executable bash script. */
function writeScript(file, body) {
  fs.writeFileSync(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
}

async function main() {
  // --- withoutSpawnArgs on a real spawn failure -------------------------------
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

  // --- wincrypt.exe output -----------------------------------------------------
  console.log("\n--- parseWincryptOutput ---");
  check("LF", parseWincryptOutput("PASSWORD:secret\n").password, "secret");
  check(
    "CRLF with more lines → no trailing \\r",
    parseWincryptOutput("PASSWORD:secret\r\nDone.\r\n").password,
    "secret",
  );
  check(
    "single CRLF line",
    parseWincryptOutput("PASSWORD:secret\r\n").password,
    "secret",
  );
  check(
    "leading blank line skipped",
    parseWincryptOutput("\r\nPASSWORD:secret\r\n").password,
    "secret",
  );
  check(
    "trailing spaces in the password kept",
    parseWincryptOutput("PASSWORD:pw  \r\n").password,
    "pw  ",
  );
  check(
    "unexpected output → null + the line",
    parseWincryptOutput("ERROR: bad file\r\n"),
    { password: null, line: "ERROR: bad file" },
  );

  // --- `security` (macOS store), faked on PATH ---------------------------------
  // encryptPasswordMacOS has no platform guard. Never run it where the real
  // `security` exists (macOS) — it would write to the Keychain.
  console.log("\n--- encryptPasswordMacOS ---");
  const hasSecurity =
    process.platform === "darwin" ||
    spawnSync(process.platform === "win32" ? "where" : "which", ["security"])
      .status === 0;
  if (hasSecurity || !isPosix) {
    console.log("SKIP real `security` available, or not a POSIX host");
  } else {
    // a) the command cannot be started at all
    const marker = path.join(sandbox, "author.pwd");
    const r = await settle(encryptPasswordMacOS(SECRET, marker));
    check(
      "missing `security` → samsung_pwd_store_failed",
      Boolean(
        r.error &&
        r.error.message.startsWith(
          "samsung_pwd_store_failed: failed to spawn security",
        ),
      ),
      true,
    );
    check(
      "missing `security` → cause.code ENOENT",
      r.error && r.error.cause && r.error.cause.code,
      "ENOENT",
    );
    check(
      "missing `security` → secret not in util.inspect",
      util.inspect(r.error, { depth: 10 }).includes(SECRET),
      false,
    );
    check("missing `security` → no marker", fs.existsSync(marker), false);

    // b) a warning on stderr with exit 0 is a success
    const bin = path.join(sandbox, "bin");
    fs.mkdirSync(bin);
    writeScript(
      path.join(bin, "security"),
      'echo "security: SecKeychain warning" >&2\nexit 0',
    );
    process.env.PATH = `${bin}${path.delimiter}${savedPath}`;
    const ok = await settle(encryptPasswordMacOS(SECRET, marker));
    check("stderr warning, exit 0 → resolves", ok.error, null);
    check(
      "stderr warning, exit 0 → marker written",
      fs.existsSync(marker),
      true,
    );

    // c) a non-zero exit is a failure, with stderr in the message
    writeScript(path.join(bin, "security"), 'echo "denied" >&2\nexit 51');
    const bad = await settle(encryptPasswordMacOS(SECRET, marker));
    check(
      "exit 51 → Keychain encrypt failed: denied",
      Boolean(
        bad.error && /Keychain encrypt failed: denied/.test(bad.error.message),
      ),
      true,
    );
    process.env.PATH = savedPath;
  }

  // --- secret-tool (Linux store / lookup), faked in the SDK --------------------
  // findSecretTool only looks on Linux, under <sdk>/tools/certificate-encryptor.
  console.log("\n--- secret-tool ---");
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

    writeScript(tool, 'echo "(secret-tool): GLib-WARNING" >&2\nexit 0');
    const stored = await settle(encryptPasswordLinux(SECRET, pwd));
    check("store: stderr warning, exit 0 → resolves", stored.error, null);
    check("store: marker written", fs.existsSync(pwd), true);

    writeScript(tool, 'echo "no keyring" >&2\nexit 1');
    const failed = await settle(encryptPasswordLinux(SECRET, pwd));
    check(
      "store: exit 1 → secret-tool store failed: no keyring",
      Boolean(
        failed.error &&
        /secret-tool store failed: no keyring/.test(failed.error.message),
      ),
      true,
    );

    // "한글" (ED 95 9C EA B8 80) written in two parts that split "한", with a
    // pause so they arrive as separate chunks.
    writeScript(
      tool,
      "printf '\\xed\\x95'; sleep 0.3; printf '\\x9c\\xea\\xb8\\x80\\n'\n" +
        'echo "(secret-tool): GLib-WARNING" >&2\nexit 0',
    );
    const looked = await settle(decryptPasswordLinux(pwd));
    check("lookup: stderr warning, exit 0 → resolves", looked.error, null);
    check(
      "lookup: UTF-8 split across chunks stays intact",
      looked.value,
      "한글",
    );

    writeScript(tool, "exit 1");
    const missing = await settle(decryptPasswordLinux(pwd));
    check(
      "lookup: exit 1 → secret-tool lookup failed: exit code 1",
      Boolean(
        missing.error &&
        /secret-tool lookup failed: exit code 1/.test(missing.error.message),
      ),
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
