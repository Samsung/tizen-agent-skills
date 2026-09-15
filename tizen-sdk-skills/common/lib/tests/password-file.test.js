// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * password-file tests
 *
 * cli/password-file.js is the documented way to hand a certificate password
 * to a runner without putting it on the command line. The format is
 * deliberately strict (exactly one VARIABLE=value line, 0600 on POSIX); every
 * rejection below is a message the user actually sees, so each one is pinned.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readPasswordFile } = require("../cli/password-file");

console.log("=== password-file Test ===\n");

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

function throwsMatching(fn, pattern) {
  try {
    fn();
    return `no error thrown`;
  } catch (error) {
    return pattern.test(error.message)
      ? true
      : `wrong message: ${error.message}`;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-password-file-"));
const VAR = "TIZEN_CERTIFICATE_PASSWORD";

/**
 * Stand-in for the password value (same convention as user-command.test.js):
 * a realistic-looking literal after `TIZEN_CERTIFICATE_PASSWORD=` reads as a
 * leaked credential to secret scanners.
 */
const SENTINEL = "sentinel-value";

function write(name, content) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(file, 0o600);
  return file;
}

try {
  console.log("Test 1: well-formed files");
  check(
    "  plain",
    readPasswordFile(write("a", `${VAR}=${SENTINEL}`), VAR),
    SENTINEL,
  );
  check(
    "  trailing newline",
    readPasswordFile(write("b", `${VAR}=abc\n`), VAR),
    "abc",
  );
  check("  CRLF", readPasswordFile(write("c", `${VAR}=abc\r\n`), VAR), "abc");
  check(
    "  UTF-8 BOM stripped",
    readPasswordFile(write("d", `\uFEFF${VAR}=abc\n`), VAR),
    "abc",
  );
  check(
    "  value may contain '='",
    readPasswordFile(write("e", `${VAR}=a=b=c`), VAR),
    "a=b=c",
  );
  check(
    "  value keeps spaces",
    readPasswordFile(write("f", `${VAR}=a b`), VAR),
    "a b",
  );

  console.log("\nTest 2: rejected shapes");
  check(
    "  missing path",
    throwsMatching(() => readPasswordFile("", VAR), /path is required/),
    true,
  );
  check(
    "  missing file",
    throwsMatching(
      () => readPasswordFile(path.join(dir, "nope"), VAR),
      /Cannot read password file/,
    ),
    true,
  );
  check(
    "  directory",
    throwsMatching(() => readPasswordFile(dir, VAR), /regular file/),
    true,
  );
  check(
    "  wrong variable name",
    throwsMatching(
      () => readPasswordFile(write("g", `OTHER=abc`), VAR),
      /exactly one line/,
    ),
    true,
  );
  check(
    "  two lines",
    throwsMatching(
      () => readPasswordFile(write("h", `${VAR}=abc\nX=1\n`), VAR),
      /exactly one line/,
    ),
    true,
  );
  check(
    "  empty value",
    throwsMatching(() => readPasswordFile(write("i", `${VAR}=`), VAR), /empty/),
    true,
  );
  check(
    "  empty file",
    throwsMatching(
      () => readPasswordFile(write("j", ``), VAR),
      /exactly one line/,
    ),
    true,
  );

  console.log("\nTest 3: POSIX permission check");
  if (process.platform === "win32") {
    console.log(
      "SKIP   mode bits are not meaningful on Windows (ACLs documented instead)",
    );
  } else {
    const loose = write("k", `${VAR}=abc`);
    fs.chmodSync(loose, 0o644);
    check(
      "  group/other-readable file is refused",
      throwsMatching(() => readPasswordFile(loose, VAR), /chmod 600/),
      true,
    );
    fs.chmodSync(loose, 0o600);
    check("  0600 is accepted", readPasswordFile(loose, VAR), "abc");
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
