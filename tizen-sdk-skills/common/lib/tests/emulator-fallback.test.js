// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Tests for the create-failure paths in tizen-emulator-manager.sh:
 * partial-VM cleanup, deletion verification, and the TV template fallback.
 *
 * These tests RUN the script against a stub em-cli rather than grepping its
 * source. The previous version asserted on source strings, which meant it
 * happily passed while the deletion-verify loop was exiting after a single poll
 * (`[ 0.5 -lt 10 ]` is a fatal "integer expression expected" in bash) and while
 * the list-vm error branch was unreachable dead code under `set -e`. A source
 * grep cannot see either failure; executing the script can.
 *
 * The stub is driven by env vars, so each case pins one behaviour:
 *   STUB_CREATE_WITH_TEMPLATE_RC  exit code for `create ... -t <template>`
 *   STUB_CREATE_RC                exit code for `create` without -t
 *   STUB_LIST_VM_FAILS            make list-vm exit non-zero (Java/JNA case)
 *   STUB_VMS_BEFORE_DELETE        VM names list-vm reports before any delete
 *   STUB_VMS_AFTER_DELETE         VM names list-vm reports after a delete
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

console.log("=== Emulator Fallback Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  if (!condition) {
    failures++;
    console.log(`FAIL ${name}`);
    if (details) console.log(`     ${details}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

const SCRIPT_PATH = path.join(
  __dirname,
  "../../scripts/tizen-emulator-manager/tizen-emulator-manager.sh",
);

// ---------------------------------------------------------------------------
// Static prerequisites
// ---------------------------------------------------------------------------
console.log("--- Script prerequisites ---");

check(
  "tizen-emulator-manager.sh exists at the expected path",
  fs.existsSync(SCRIPT_PATH),
  `Expected path: ${SCRIPT_PATH}`,
);
if (!fs.existsSync(SCRIPT_PATH)) {
  console.log(`\n=== CRITICAL: script missing at ${SCRIPT_PATH} ===`);
  process.exit(1);
}

// NTFS has no POSIX exec bits (Node fakes stat.mode on Windows), so on win32
// assert the git index mode instead — that is the mode a Linux CI checkout
// actually receives. Outside a git checkout there is nothing to assert.
let isExecutable;
if (process.platform === "win32") {
  try {
    const indexEntry = execFileSync(
      "git",
      ["ls-files", "-s", "--", SCRIPT_PATH],
      { cwd: path.dirname(SCRIPT_PATH), encoding: "utf8" },
    );
    isExecutable = /^100755\s/.test(indexEntry);
  } catch (_e) {
    isExecutable = true; // not a git checkout — exec bit is not representable here
  }
} else {
  isExecutable = (fs.statSync(SCRIPT_PATH).mode & 0o111) !== 0;
}
check(
  "tizen-emulator-manager.sh is executable",
  isExecutable,
  "Script must have executable permissions (git index mode 100755 on Windows)",
);

const SCRIPT_CONTENT = fs.readFileSync(SCRIPT_PATH, "utf8");

check(
  "script starts with a bash shebang",
  /^#!\/usr\/bin\/env bash|^#!\/bin\/bash/.test(SCRIPT_CONTENT),
  "Script must start with a bash shebang",
);

check(
  "script uses strict error handling",
  SCRIPT_CONTENT.includes("set -euo pipefail"),
  "Script should use `set -euo pipefail`",
);

// The bug this replaced: a fractional accumulator compared with `[ -lt ]`.
// Guard against it coming back in any form.
check(
  "no fractional loop counter is built with awk printf",
  !/printf\s+\\?"%\.\d+f/.test(SCRIPT_CONTENT),
  "Loop counters must be integers: `[ 0.5 -lt 10 ]` is a fatal bash error",
);

// ---------------------------------------------------------------------------
// Behavioural tests — run the real script against a stub em-cli
// ---------------------------------------------------------------------------
if (process.platform === "win32") {
  console.log(
    "\nSKIP: behavioural tests need bash (see tizen-emulator-manager.ps1 for the Windows path)",
  );
  console.log(
    `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

// Syntax check the whole script before trusting any behavioural result.
try {
  execFileSync("bash", ["-n", SCRIPT_PATH], { stdio: "pipe" });
  check("script passes `bash -n` syntax check", true);
} catch (error) {
  check(
    "script passes `bash -n` syntax check",
    false,
    String(error.stderr || error.message).trim(),
  );
}

const STUB_EM_CLI = `#!/usr/bin/env bash
# Stub em-cli driven by env vars — see emulator-fallback.test.js.
set -u
printf '%s\\n' "$*" >> "$STUB_LOG"
action="\${1:-}"
shift || true

vm_names() {
  if [ -f "$STUB_STATE/deleted" ]; then
    printf '%s' "\${STUB_VMS_AFTER_DELETE:-}"
  else
    printf '%s' "\${STUB_VMS_BEFORE_DELETE:-}"
  fi
}

case "$action" in
  list-vm)
    if [ "\${STUB_LIST_VM_FAILS:-0}" = "1" ]; then
      echo 'Exception in thread "main" java.lang.NoClassDefFoundError: com/sun/jna/Native' >&2
      exit 1
    fi
    names=$(vm_names)
    if [ -z "$names" ]; then
      echo "VM list is empty"
    else
      for n in $names; do
        echo "$n            running"
      done
    fi
    ;;
  list-platform)
    echo "tizen-10.0-x86_64"
    echo "tv-samsung-10.0-x86_64"
    ;;
  create)
    # A create with -t is the "with template" attempt; without it, the fallback.
    if printf '%s\\n' "$@" | grep -qx -- "-t"; then
      exit "\${STUB_CREATE_WITH_TEMPLATE_RC:-0}"
    fi
    exit "\${STUB_CREATE_RC:-0}"
    ;;
  delete)
    touch "$STUB_STATE/deleted"
    ;;
  detail)
    echo "\${2:-stub-vm}"
    echo "  Platform          : tizen-10.0-x86_64"
    echo "  Template          : HD1080 Tizen"
    echo "  Resolution        : 1920x1080"
    echo "  RAM Size          : 1024"
    ;;
esac
exit 0
`;

/**
 * Build a throwaway SDK tree the script's get_sdk_path()/find_emcli() will accept,
 * with the stub em-cli in place of the real one.
 */
function makeSdk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-emulator-test-"));
  const emcliDir = path.join(root, "sdk", "tools", "emulator", "bin");
  fs.mkdirSync(emcliDir, { recursive: true });
  // get_sdk_path() only accepts a directory that looks like a real SDK.
  fs.writeFileSync(path.join(root, "sdk", "tools", "sdb"), "#!/bin/sh\n", {
    mode: 0o755,
  });
  const emcli = path.join(emcliDir, "em-cli");
  fs.writeFileSync(emcli, STUB_EM_CLI, { mode: 0o755 });
  const state = path.join(root, "state");
  fs.mkdirSync(state);
  return {
    root,
    sdk: path.join(root, "sdk"),
    state,
    log: path.join(root, "log"),
  };
}

const POLL_ATTEMPTS = "6";

/**
 * Run the script for one scenario.
 *
 * @returns {{code: number, output: string, calls: string[]}}
 */
function runScript(args, stubEnv = {}) {
  const sdk = makeSdk();
  fs.writeFileSync(sdk.log, "");
  // spawnSync, not execFileSync: the script's diagnostics go to stderr, and
  // execFileSync discards stderr on a zero exit — which would hide every
  // assertion about what a SUCCESSFUL fallback logged.
  const result = spawnSync("bash", [SCRIPT_PATH, ...args], {
    encoding: "utf8",
    timeout: 60000,
    env: {
      ...process.env,
      TIZEN_SDK_PATH: sdk.sdk,
      // Keep the polling budget observable but fast: the point is that the loop
      // runs every attempt, not that it takes ten seconds to prove it.
      TIZEN_EMULATOR_DELETE_POLL_ATTEMPTS: POLL_ATTEMPTS,
      TIZEN_EMULATOR_DELETE_POLL_INTERVAL: "0.02",
      STUB_LOG: sdk.log,
      STUB_STATE: sdk.state,
      ...stubEnv,
    },
  });
  const code = typeof result.status === "number" ? result.status : 1;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const calls = fs.readFileSync(sdk.log, "utf8").split("\n").filter(Boolean);
  fs.rmSync(sdk.root, { recursive: true, force: true });
  return { code, output, calls };
}

/** list-vm calls issued after the first delete — i.e. the verification polls. */
function pollsAfterDelete(calls) {
  const deleteAt = calls.findIndex((c) => c.startsWith("delete "));
  if (deleteAt === -1) return 0;
  return calls.slice(deleteAt + 1).filter((c) => c.startsWith("list-vm"))
    .length;
}

const CREATE_ARGS = [
  "-a",
  "create",
  "-n",
  "my-vm",
  "-P",
  "tizen-10.0-x86_64",
  "-T",
  "HD1080 Tizen",
];

// -- 1: the deletion-verify loop actually polls its full budget ---------------
console.log("\n--- Deletion verification polls the full budget ---");

const stuck = runScript(CREATE_ARGS, {
  STUB_CREATE_WITH_TEMPLATE_RC: "1",
  STUB_VMS_AFTER_DELETE: "my-vm",
});

check(
  "cleanup polls list-vm once per configured attempt",
  pollsAfterDelete(stuck.calls) === Number(POLL_ATTEMPTS),
  `Expected ${POLL_ATTEMPTS} polls, saw ${pollsAfterDelete(stuck.calls)}. ` +
    `A fractional loop counter collapses this to 1.`,
);

check(
  "a VM that never disappears is reported as needing manual cleanup",
  /still exists after cleanup attempt/.test(stuck.output) &&
    /Manual cleanup required/.test(stuck.output),
  stuck.output.slice(-400),
);

check(
  "stuck cleanup still exits non-zero",
  stuck.code !== 0,
  `exit ${stuck.code}`,
);

check(
  "no bash integer-comparison error leaks into the output",
  !/integer expression expected/.test(stuck.output),
  stuck.output.slice(-400),
);

// -- 2: cleanup stops polling as soon as the VM is gone ----------------------
console.log("\n--- Deletion verification stops early when the VM is gone ---");

const cleaned = runScript(CREATE_ARGS, {
  STUB_CREATE_WITH_TEMPLATE_RC: "1",
  STUB_VMS_AFTER_DELETE: "",
});

check(
  "a confirmed deletion needs only one poll",
  pollsAfterDelete(cleaned.calls) === 1,
  `Saw ${pollsAfterDelete(cleaned.calls)} polls`,
);

check(
  "a confirmed deletion is reported as successful",
  /Partial VM deleted successfully/.test(cleaned.output) &&
    !/still exists after cleanup/.test(cleaned.output),
  cleaned.output.slice(-400),
);

// -- 3: VM names are matched exactly, not as substrings ----------------------
console.log("\n--- VM name matching is exact ---");

const substring = runScript(
  ["-a", "create", "-n", "tv", "-P", "tizen-10.0-x86_64", "-T", "HD1080 Tizen"],
  {
    STUB_CREATE_WITH_TEMPLATE_RC: "1",
    // A DIFFERENT VM that merely contains "tv" as a substring.
    STUB_VMS_AFTER_DELETE: "tv-emulator",
  },
);

check(
  "'tv' is not considered present just because 'tv-emulator' is listed",
  /Partial VM deleted successfully/.test(substring.output) &&
    pollsAfterDelete(substring.calls) === 1,
  `polls=${pollsAfterDelete(substring.calls)} :: ${substring.output.slice(-300)}`,
);

// -- 4: a broken list-vm is reported, not silently fatal ---------------------
console.log("\n--- Unreadable list-vm is reported ---");

const jna = runScript(CREATE_ARGS, {
  STUB_CREATE_WITH_TEMPLATE_RC: "1",
  STUB_LIST_VM_FAILS: "1",
});

check(
  "a failing list-vm is reported as an unconfirmed cleanup",
  /Could not confirm cleanup/.test(jna.output),
  jna.output.slice(-500),
);

check(
  "the phase guidance still reaches the user when list-vm fails",
  /Creation failed with template 'HD1080 Tizen'/.test(jna.output),
  "`set -e` must not abort cleanup_and_fail before its guidance is printed",
);

check(
  "a failing list-vm does not claim a successful cleanup",
  !/Partial VM deleted successfully/.test(jna.output),
  jna.output.slice(-400),
);

// -- 5: phase-specific guidance --------------------------------------------
console.log("\n--- Error guidance matches the failing phase ---");

const withTemplate = runScript(CREATE_ARGS, {
  STUB_CREATE_WITH_TEMPLATE_RC: "1",
});

check(
  "a template create failure names the template and offers both retries",
  /Creation failed with template 'HD1080 Tizen'/.test(withTemplate.output) &&
    /Create without template/.test(withTemplate.output),
  withTemplate.output.slice(-500),
);

const noTemplate = runScript(
  ["-a", "create", "-n", "my-vm", "-P", "tizen-10.0-x86_64"],
  { STUB_CREATE_RC: "1" },
);

check(
  "a no-template create failure uses the without_template guidance",
  /Even creation without template failed/.test(noTemplate.output) &&
    /deeper issue/.test(noTemplate.output),
  noTemplate.output.slice(-500),
);

check(
  "a no-template failure never suggests an empty -t",
  !/-t ""/.test(noTemplate.output) &&
    !/Creation failed with template ''/.test(noTemplate.output),
  'With no template, the with_template phase would suggest `-t ""`',
);

// -- 6: TV fallback --------------------------------------------------------
console.log("\n--- TV profile template fallback ---");

const tvFallback = runScript(
  [
    "-a",
    "create",
    "-n",
    "my-tv-vm",
    "-p",
    "tv",
    "-P",
    "tv-samsung-10.0-x86_64",
    "-T",
    "HD1080 TV",
  ],
  { STUB_CREATE_WITH_TEMPLATE_RC: "1", STUB_CREATE_RC: "0" },
);

check(
  "TV fallback succeeds overall",
  tvFallback.code === 0,
  tvFallback.output.slice(-500),
);

check(
  "TV fallback reports TEMPLATE_FALLBACK on stdout",
  /^TEMPLATE_FALLBACK=HD1080 TV$/m.test(tvFallback.output),
  tvFallback.output.slice(-400),
);

check(
  "TV fallback waits for the deletion before recreating",
  /Deletion verified/.test(tvFallback.output),
  tvFallback.output.slice(-400),
);

check(
  "TV fallback retries create without -t",
  tvFallback.calls.filter((c) => c.startsWith("create ")).length === 2 &&
    !tvFallback.calls
      .filter((c) => c.startsWith("create "))[1]
      .includes(" -t "),
  tvFallback.calls.join(" :: "),
);

const tvStuck = runScript(
  [
    "-a",
    "create",
    "-n",
    "my-tv-vm",
    "-p",
    "tv",
    "-P",
    "tv-samsung-10.0-x86_64",
    "-T",
    "HD1080 TV",
  ],
  {
    STUB_CREATE_WITH_TEMPLATE_RC: "1",
    STUB_CREATE_RC: "0",
    STUB_VMS_AFTER_DELETE: "my-tv-vm",
  },
);

check(
  "TV fallback does not claim 'Deletion verified' when the VM is still listed",
  !/Deletion verified/.test(tvStuck.output) &&
    /still listed after/.test(tvStuck.output),
  tvStuck.output.slice(-400),
);

// -- 7: a double failure is distinguished from the first ---------------------
console.log("\n--- TV double failure ---");

const tvDouble = runScript(
  [
    "-a",
    "create",
    "-n",
    "my-tv-vm",
    "-p",
    "tv",
    "-P",
    "tv-samsung-10.0-x86_64",
    "-T",
    "HD1080 TV",
  ],
  { STUB_CREATE_WITH_TEMPLATE_RC: "1", STUB_CREATE_RC: "1" },
);

check(
  "both creates failing reports the without_template diagnosis",
  /Even creation without template failed/.test(tvDouble.output),
  tvDouble.output.slice(-500),
);

check(
  "double failure exits non-zero",
  tvDouble.code !== 0,
  `exit ${tvDouble.code}`,
);

// -- 8: list-vm distinguishes "no VMs" from "em-cli is broken" (issue #41) ---
console.log("\n--- list-vm tri-state ---");

const listOk = runScript(["-a", "list-vm"], {
  STUB_VMS_BEFORE_DELETE: "vm-a vm-b",
});
check(
  "list-vm reports the VMs em-cli lists",
  listOk.code === 0 &&
    /^VM_LIST=vm-a,vm-b$/m.test(listOk.output) &&
    /^VM_COUNT=2$/m.test(listOk.output),
  `exit ${listOk.code} :: ${listOk.output.slice(-300)}`,
);

const listEmpty = runScript(["-a", "list-vm"], { STUB_VMS_BEFORE_DELETE: "" });
check(
  "an empty list is a success with VM_COUNT=0",
  listEmpty.code === 0 &&
    /^VM_LIST=$/m.test(listEmpty.output) &&
    /^VM_COUNT=0$/m.test(listEmpty.output),
  `exit ${listEmpty.code} :: ${listEmpty.output.slice(-300)}`,
);

const listBroken = runScript(["-a", "list-vm"], { STUB_LIST_VM_FAILS: "1" });
check(
  "a failing em-cli list-vm exits non-zero instead of reporting zero VMs",
  listBroken.code !== 0 && !/^VM_LIST=/m.test(listBroken.output),
  `exit ${listBroken.code} :: ${listBroken.output.slice(-300)}`,
);
check(
  "the failure names list-vm and carries the Java trace",
  /list-vm failed/.test(listBroken.output) &&
    /NoClassDefFoundError/.test(listBroken.output),
  listBroken.output.slice(-400),
);

const countBroken = runScript(["-a", "list-vm", "-C"], {
  STUB_LIST_VM_FAILS: "1",
});
check(
  "a failing em-cli list-vm -c exits non-zero instead of VM_COUNT=0",
  countBroken.code !== 0 && !/^VM_COUNT=/m.test(countBroken.output),
  `exit ${countBroken.code} :: ${countBroken.output.slice(-300)}`,
);

// -- 9: the CLI runner points at this script --------------------------------
console.log("\n--- CLI wiring ---");

const CLI_PATH = path.join(__dirname, "../cli/emulator-manager-cli.js");
check(
  "emulator-manager-cli.js exists",
  fs.existsSync(CLI_PATH),
  `Expected path: ${CLI_PATH}`,
);

// Summary
console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
