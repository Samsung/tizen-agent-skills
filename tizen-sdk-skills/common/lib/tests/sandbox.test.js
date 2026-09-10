// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Codex sandbox awareness (core/sandbox.js) — issues #75, #76, #81, #82.
 *
 * Codex's workspace-write sandbox blocks TCP sockets, writes outside the
 * workspace and (Linux, bubblewrap --unshare-pid) kills detached jobs when the
 * exec call ends. detectSandbox() reads the markers Codex injects,
 * escalationFix() phrases "re-run this command with escalated permissions" as
 * a suggested_fix, and decorateSandboxFailure() annotates failure envelopes
 * produced inside the sandbox. Pure unit tests — no processes are spawned.
 */

const {
  detectSandbox,
  sandboxWarning,
  escalationFix,
  looksSandboxBlocked,
  sandboxBlockToken,
  decorateSandboxFailure,
} = require("../core/sandbox");
const { Envelope, ERROR_CODES } = require("../envelope/envelope");
const { formatError } = require("../envelope/response-formatter");

console.log("=== sandbox awareness tests ===\n");

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

// --- detectSandbox matrix ---------------------------------------------------------
console.log("--- detectSandbox ---");
check("no markers → not codex, not sandboxed", detectSandbox({}, "linux"), {
  host: null,
  sandboxed: false,
  marked: false,
  escalated: false,
  network_disabled: false,
  pid_namespace: false,
  kind: null,
});
check(
  "CODEX_THREAD_ID only → codex host, escalated (outside the sandbox)",
  detectSandbox({ CODEX_THREAD_ID: "t1" }, "linux"),
  {
    host: "codex",
    sandboxed: false,
    marked: false,
    escalated: true,
    network_disabled: false,
    pid_namespace: false,
    kind: null,
  },
);
check(
  "CODEX_SANDBOX_NETWORK_DISABLED + linux → bwrap with PID namespace",
  detectSandbox(
    { CODEX_THREAD_ID: "t1", CODEX_SANDBOX_NETWORK_DISABLED: "1" },
    "linux",
  ),
  {
    host: "codex",
    sandboxed: true,
    marked: true,
    escalated: false,
    network_disabled: true,
    pid_namespace: true,
    kind: "bwrap",
  },
);
check(
  "CODEX_SANDBOX_NETWORK_DISABLED + win32 → windows, no PID namespace",
  detectSandbox({ CODEX_SANDBOX_NETWORK_DISABLED: "1" }, "win32"),
  {
    host: "codex",
    sandboxed: true,
    marked: true,
    escalated: false,
    network_disabled: true,
    pid_namespace: false,
    kind: "windows",
  },
);
check(
  "CODEX_SANDBOX=seatbelt + darwin → seatbelt",
  detectSandbox({ CODEX_SANDBOX: "seatbelt" }, "darwin").kind,
  "seatbelt",
);
{
  const off = detectSandbox(
    { CODEX_SANDBOX_NETWORK_DISABLED: "1", TIZEN_SANDBOX: "off" },
    "linux",
  );
  check("TIZEN_SANDBOX=off beats the markers", off.sandboxed, false);
  check(
    "…but the markers' truth stays in marked/kind/pid_namespace (job post-mortem)",
    [off.marked, off.kind, off.pid_namespace],
    [true, "bwrap", true],
  );
}
check(
  "TIZEN_SANDBOX=on forces sandboxed without markers",
  detectSandbox({ TIZEN_SANDBOX: "on" }, "linux"),
  {
    host: "codex",
    sandboxed: true,
    marked: false,
    escalated: false,
    network_disabled: false,
    pid_namespace: true,
    kind: "bwrap",
  },
);
check(
  "CLAUDECODE alone is not codex",
  detectSandbox({ CLAUDECODE: "1" }, "linux").host,
  null,
);

// --- escalationFix / envelope passthrough ------------------------------------------
console.log("\n--- escalationFix ---");
{
  const fix = escalationFix(
    "node project-manager-cli.js build --project X --background",
  );
  check(
    "fix carries the exact command, auto_fixable false, escalate true",
    fix,
    {
      command: "node project-manager-cli.js build --project X --background",
      auto_fixable: false,
      escalate: true,
    },
  );
  const env = formatError("t", "sandbox_blocked", "msg", fix, Date.now());
  check(
    "sandbox_blocked → TIZEN_SDK_SANDBOX_E001",
    env.errors[0].error_code,
    "TIZEN_SDK_SANDBOX_E001",
  );
  check(
    "escalate survives Envelope normalisation",
    env.errors[0].suggested_fix.escalate,
    true,
  );
  check(
    "command survives normalisation",
    env.errors[0].suggested_fix.command,
    fix.command,
  );
  const plain = new Envelope("t").failure({
    ...ERROR_CODES.SANDBOX_JOB_LOST,
    message: "m",
    suggested_fix: { command: "x" },
  });
  check(
    "a fix without escalate does not gain the key",
    "escalate" in plain.errors[0].suggested_fix,
    false,
  );
  check(
    "sandbox_job_lost → TIZEN_SDK_SANDBOX_E002",
    plain.errors[0].error_code,
    "TIZEN_SDK_SANDBOX_E002",
  );
}

// --- looksSandboxBlocked -------------------------------------------------------------
console.log("\n--- looksSandboxBlocked ---");
const failing = (message, details) => ({
  status: "failure",
  errors: [
    { error_category: "io_error", message, ...(details ? { details } : {}) },
  ],
});
check(
  "EACCES on profiles.xml → blocked",
  sandboxBlockToken(
    failing(
      "Failed to set active profile: EACCES: permission denied, open 'profiles.xml'",
    ),
  ),
  "EACCES",
);
check(
  "ECONNREFUSED to sdb → blocked",
  looksSandboxBlocked(failing("connect ECONNREFUSED 127.0.0.1:26099")),
  true,
);
check(
  "Windows 'Access is denied' → blocked",
  looksSandboxBlocked(failing("tz: Access is denied.")),
  true,
);
check(
  "token found in details, not only message",
  looksSandboxBlocked(
    failing("build failed", ["raw: mkdir: Read-only file system"]),
  ),
  true,
);
check(
  "an ordinary usage error is not blocked",
  looksSandboxBlocked(failing("Unknown option: --foo")),
  false,
);
check(
  "success envelope → not blocked",
  looksSandboxBlocked({ status: "success", result: {} }),
  false,
);
// Issue #82: a sandboxed em-cli leaves no OS error token — only the runner's
// own diagnosis ("exited without printing anything", the wall-clock cap).
check(
  "em-cli exited without output (emcliExitHint wording) → blocked",
  sandboxBlockToken(
    failing(
      "Emulator list-template failed: Command failed: bash … em-cli exited with code 1 without printing anything — it was blocked before it could run (a sandbox or permission policy: …).",
    ),
  ),
  "without printing anything",
);
check(
  "em-cli hit the wall-clock cap (exit 124) → blocked",
  looksSandboxBlocked(
    failing("Emulator list-vm failed", [
      "raw: em-cli 'list-vm' did not finish within 120s (hung JVM — under Codex CLI re-run with escalated permissions)",
    ]),
  ),
  true,
);
check(
  "script reporter's 'produced no output at all' in details → blocked",
  looksSandboxBlocked(
    failing("Emulator list-template failed", [
      "raw: [WARN]  em-cli produced no output at all - it was blocked before it could run (a sandbox or",
    ]),
  ),
  true,
);
// Issue #72: the template sync could not write into the SDK.
check(
  "create-project 'SDK directory is not writable from this shell' → blocked",
  looksSandboxBlocked(
    failing(
      "No webapp templates found in the installed SDK under profile tizen-10.0.",
      [
        "raw: [WARN] The SDK directory is not writable from this shell (cp: cannot create directory '/home/u/tizen-sdk/platforms/tizen-10.0/tizen/samples/Template/Native': Read-only file system), so what 'tz' listed from here may be incomplete.",
      ],
    ),
  ),
  true,
);
check(
  "an OS error token wins over a symptom phrase in the same envelope",
  sandboxBlockToken(
    failing("em-cli exited with code 1 without printing anything", [
      "raw: java.io.IOException: Read-only file system",
    ]),
  ),
  "Read-only file system",
);
check(
  "a plain em-cli usage error is still not blocked",
  looksSandboxBlocked(
    failing("Emulator detail failed: Error: 'nope' does not match any VM"),
  ),
  false,
);

// --- decorateSandboxFailure --------------------------------------------------------------
console.log("\n--- decorateSandboxFailure ---");
const sandboxed = detectSandbox(
  { CODEX_SANDBOX_NETWORK_DISABLED: "1" },
  "linux",
);
const outside = detectSandbox({ CODEX_THREAD_ID: "t" }, "linux");
const CMD = "node cert-manager-cli.js set-active-profile --name p";
{
  const env = decorateSandboxFailure(
    failing("Unknown option: --foo"),
    sandboxed,
    CMD,
  );
  check(
    "sandboxed + non-matching failure → warning only, single error",
    [
      env.warnings.length,
      env.errors.length,
      env.warnings[0].startsWith("Running inside Codex's sandbox (bwrap)"),
    ],
    [1, 1, true],
  );
}
{
  const env = decorateSandboxFailure(
    failing("EACCES: permission denied, open 'profiles.xml'"),
    sandboxed,
    CMD,
  );
  check(
    "matching failure → an extra sandbox_blocked error is appended",
    env.errors.length,
    2,
  );
  check("errors[0] is untouched", env.errors[0], {
    error_category: "io_error",
    message: "EACCES: permission denied, open 'profiles.xml'",
  });
  check(
    "errors[1] is sandbox_blocked with the escalation fix on THIS command",
    [
      env.errors[1].error_category,
      env.errors[1].error_code,
      env.errors[1].suggested_fix,
    ],
    ["sandbox_blocked", "TIZEN_SDK_SANDBOX_E001", escalationFix(CMD)],
  );
  check(
    "the message names the matched token",
    /matched "EACCES"/.test(env.errors[1].message),
    true,
  );
  const again = decorateSandboxFailure(env, sandboxed, CMD);
  check(
    "decorating twice is idempotent",
    [again.errors.length, again.warnings.length],
    [2, 1],
  );
}
{
  const relay = {
    status: "failure",
    command: "tizen-sdk dummy",
    user_command: "node dummy-cli.js",
    errors: [{ error_category: "io_error", message: "EACCES" }],
  };
  const before = JSON.stringify(relay);
  decorateSandboxFailure(relay, sandboxed, CMD);
  check(
    "a relayed envelope (has user_command) is left untouched",
    JSON.stringify(relay),
    before,
  );
}
{
  const ok = { status: "success", result: { a: 1 }, warnings: [] };
  decorateSandboxFailure(ok, sandboxed, CMD);
  check("success envelopes are left untouched", ok, {
    status: "success",
    result: { a: 1 },
    warnings: [],
  });
  const env = decorateSandboxFailure(failing("EACCES"), outside, CMD);
  check(
    "outside the sandbox nothing is added",
    [env.warnings, env.errors.length],
    [undefined, 1],
  );
}
check(
  "sandboxWarning names the kind",
  sandboxWarning(
    detectSandbox({ CODEX_SANDBOX_NETWORK_DISABLED: "1" }, "win32"),
  ).startsWith("Running inside Codex's sandbox (windows)"),
  true,
);

console.log(
  `\n${failures === 0 ? "All sandbox tests passed" : `${failures} FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
