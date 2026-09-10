// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * user_command tests
 *
 * Covers the envelope's user-facing command line:
 *   - envelope/user-command.js: secret redaction (both argv forms), shell
 *     quoting, prefix composition
 *   - cli/cli-runner.js: withUserCommand key placement, and the real CLI
 *     contract via a spawned runner (an unknown-option usage error terminates
 *     before any sdb/SDK access, so this stays environment-independent)
 *
 * The redaction cases are the load-bearing ones: certificate commands take
 * `--password <value>` on the command line, and the envelope is echoed into
 * logs, terminals, and model context — a verbatim replay would leak it.
 */

const { spawnSync } = require("child_process");
const path = require("path");
const {
  buildUserCommand,
  redactArgv,
  quoteArg,
  REDACTED,
} = require("../envelope/user-command");
const { withUserCommand } = require("../cli/cli-runner");

console.log("=== user-command Test ===\n");

/**
 * Stand-in for a secret value.
 *
 * Held in a variable rather than written inline next to `--password`: a
 * realistic-looking literal in that position reads as a leaked credential to
 * secret scanners (it tripped one), and a named sentinel also makes the
 * "never reaches the output" assertion below say what it means.
 */
const SENTINEL = "sentinel-value";

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

// Test 1: redaction
console.log("Test 1: secret redaction");
check(
  "  --password <value> (space form)",
  redactArgv(["--password", SENTINEL]),
  ["--password", REDACTED],
);
check(
  "  --password=<value> (equals form)",
  redactArgv([`--password=${SENTINEL}`]),
  [`--password=${REDACTED}`],
);
check(
  "  redacts only the secret, keeps its neighbours",
  redactArgv(["generate-author", "--name", "Jane", "--password", SENTINEL]),
  ["generate-author", "--name", "Jane", "--password", REDACTED],
);
check(
  "  --password-file is a PATH, not a secret",
  redactArgv(["--password-file", "/home/u/pw.txt"]),
  ["--password-file", "/home/u/pw.txt"],
);
check(
  "  --prompt-password is a boolean, not a secret",
  redactArgv(["--prompt-password", "--name", "Jane"]),
  ["--prompt-password", "--name", "Jane"],
);
check(
  "  missing value is left for the parser to report",
  redactArgv(["--password", "--name", "Jane"]),
  ["--password", "--name", "Jane"],
);
check("  trailing --password with no value", redactArgv(["--password"]), [
  "--password",
]);
check(
  "  a value starting with a dash is still a secret",
  redactArgv(["--password", `-${SENTINEL}`]),
  ["--password", REDACTED],
);
check("  non-secret argv untouched", redactArgv(["--vm-name", "myEmul"]), [
  "--vm-name",
  "myEmul",
]);

// The prefixed certificate flags — every one of these leaked in full until
// the exact-match set was audited, which is why matching is now suffix-based.
console.log("\nTest 1b: prefixed certificate password flags");
for (const flag of [
  "--author-password",
  "--distributor-password",
  "--distributor2-password",
]) {
  check(`  ${flag} <value>`, redactArgv([flag, SENTINEL]), [flag, REDACTED]);
  check(`  ${flag}=<value>`, redactArgv([`${flag}=${SENTINEL}`]), [
    `${flag}=${REDACTED}`,
  ]);
  check(
    `  ${flag}-file is a PATH`,
    redactArgv([`${flag}-file`, "/home/u/pw.txt"]),
    [`${flag}-file`, "/home/u/pw.txt"],
  );
}
check(
  "  --prompt-author-password is a boolean, not a secret",
  redactArgv(["--prompt-author-password", "--name", "Jane"]),
  ["--prompt-author-password", "--name", "Jane"],
);
check(
  "  a flag added later is covered by the suffix rule",
  redactArgv(["--distributor3-password", SENTINEL]),
  ["--distributor3-password", REDACTED],
);
check(
  "  --client-secret is covered by the suffix rule",
  redactArgv(["--client-secret", SENTINEL]),
  ["--client-secret", REDACTED],
);
check(
  "  --bypass merely ends in 'pass' and is not a secret",
  redactArgv(["--bypass", "cache"]),
  ["--bypass", "cache"],
);

// Test 2: quoting
console.log("\nTest 2: shell quoting");
check("  plain token unquoted", quoteArg("myEmul"), "myEmul");
check("  path unquoted", quoteArg("/home/u/app"), "/home/u/app");
check("  value with a space is quoted", quoteArg("Jane Dev"), '"Jane Dev"');
check("  empty string becomes explicit quotes", quoteArg(""), '""');
check(
  "  embedded double quote is escaped",
  quoteArg('say "hi"'),
  '"say \\"hi\\""',
);

// Test 3: buildUserCommand
console.log("\nTest 3: buildUserCommand");
check(
  "  tizen-cli form",
  buildUserCommand(
    ["create-emulator", "--vm-name", "myEmul", "--size", "1080", "--launch"],
    "tizen-cli tizen-sdk",
  ),
  "tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch",
);
check(
  "  standalone runner form",
  buildUserCommand(
    ["launch", "--vm-name", "my-vm"],
    "node emulator-manager-cli.js",
  ),
  "node emulator-manager-cli.js launch --vm-name my-vm",
);
check(
  "  redaction applies through buildUserCommand",
  buildUserCommand(
    ["generate-author", "--name", "Jane Dev", "--password", SENTINEL],
    "node cert-manager-cli.js",
  ),
  `node cert-manager-cli.js generate-author --name "Jane Dev" --password ${REDACTED}`,
);
check(
  "  no args → prefix only",
  buildUserCommand([], "node check-node-cli.js"),
  "node check-node-cli.js",
);
check("  no prefix → args only", buildUserCommand(["launch"], ""), "launch");
check(
  "  non-array argv is tolerated",
  buildUserCommand(undefined, "node x.js"),
  "node x.js",
);

// Test 4: withUserCommand key placement
console.log("\nTest 4: withUserCommand placement");
{
  const enveloped = withUserCommand({
    status: "success",
    result: {},
    command: "tizen-sdk launch-emulator",
    duration_ms: 12,
  });
  check("  user_command sits right after command", Object.keys(enveloped), [
    "status",
    "result",
    "command",
    "user_command",
    "duration_ms",
  ]);
  check(
    "  appended when the envelope has no command key",
    Object.keys(withUserCommand({ status: "success" })),
    ["status", "user_command"],
  );
  check("  non-object passthrough", withUserCommand(null), null);
}

// Test 5: real CLI contract (spawned; usage error path needs no sdb/SDK)
console.log("\nTest 5: spawned runner envelope");
{
  const CLI = path.join(__dirname, "..", "cli", "sdb-helper-cli.js");
  const r = spawnSync(process.execPath, [CLI, "--password", SENTINEL], {
    encoding: "utf8",
    timeout: 30000,
  });
  const stderr = r.stderr || "";
  let parsed = null;
  try {
    parsed = JSON.parse(stderr);
  } catch {
    /* left null — checked below */
  }

  check("  usage error exits 1", r.status, 1);
  check(
    "  stderr envelope carries user_command",
    parsed && typeof parsed.user_command === "string",
    true,
  );
  check(
    "  user_command names the runner and redacts the secret",
    parsed && parsed.user_command,
    `node sdb-helper-cli.js --password ${REDACTED}`,
  );
  check(
    "  the plaintext secret appears NOWHERE in the output",
    (stderr + (r.stdout || "")).includes(SENTINEL),
    false,
  );
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
