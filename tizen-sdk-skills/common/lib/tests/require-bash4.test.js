// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * require-bash4 tests (issue #127)
 *
 * macOS ships bash 3.2, which rejects `declare -A`. Every script that uses
 * associative arrays must call require_bash4 "$@" (lib/common.sh) before its
 * first `declare -A`, so a stock Mac re-runs it with a Homebrew bash 4+ or
 * stops with a clear message instead of failing mid-script.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== require-bash4 Test ===\n");

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

const scriptsDir = path.join(__dirname, "..", "..", "scripts");
const common = path.join(scriptsDir, "lib", "common.sh");

function shellScripts(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return shellScripts(p);
    return e.name.endsWith(".sh") ? [p] : [];
  });
}

// Test 1: the guard runs before the first associative array
console.log("Test 1: scripts with declare -A call require_bash4 first");
const assoc = /^\s*(declare|local|typeset)\s+-[a-zA-Z]*A/;
let guarded = 0;
for (const file of shellScripts(scriptsDir)) {
  if (file === common) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const firstAssoc = lines.findIndex((l) => assoc.test(l));
  if (firstAssoc === -1) continue;
  const guard = lines.findIndex((l) => /^require_bash4 "\$@"$/.test(l));
  guarded++;
  check(
    `  ${path.relative(scriptsDir, file)}`,
    guard !== -1 && guard < firstAssoc,
    true,
  );
}
check("  found the scripts that use declare -A", guarded > 0, true);

// Test 2: behaviour of the guard itself
const bashMajor = (bin) => {
  const r = spawnSync(bin, ["-c", 'echo "${BASH_VERSINFO[0]}"'], {
    encoding: "utf8",
  });
  return r.status === 0 ? Number(r.stdout.trim()) : null;
};

if (process.platform === "win32" || bashMajor("bash") === null) {
  console.log("\nSKIP Test 2 (win32 or no bash)");
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "require-bash4-"));
  const probe = path.join(dir, "probe.sh");
  fs.writeFileSync(
    probe,
    [
      "set -euo pipefail",
      `source ${JSON.stringify(common)}`,
      'require_bash4 "$@"',
      "declare -A M=( [k]=v )",
      'printf "%s|%s|%s\\n" "${M[k]}" "$#" "$1"',
      "",
    ].join("\n"),
  );
  const run = (bin) =>
    spawnSync(bin, [probe, "a b", "c"], { encoding: "utf8" });

  console.log("\nTest 2: require_bash4 behaviour");
  if (bashMajor("bash") >= 4) {
    const r = run("bash");
    check("  bash 4+ runs the script as is", r.stdout.trim(), "v|2|a b");
    check("  exit 0", r.status, 0);
  }

  // Only where a bash 3 exists (macOS /bin/bash): it re-runs with a Homebrew
  // bash 4+, or stops before the first declare -A with the brew hint.
  if (fs.existsSync("/bin/bash") && bashMajor("/bin/bash") === 3) {
    const r = run("/bin/bash");
    check(
      "  bash 3.2 never reaches declare -A",
      /invalid option/.test(r.stderr),
      false,
    );
    if (r.status === 0) {
      check("  bash 3.2 re-runs with bash 4+", r.stdout.trim(), "v|2|a b");
    } else {
      check("  bash 3.2 exits 1", r.status, 1);
      check(
        "  bash 3.2 names the fix",
        /bash 4 or newer[\s\S]*brew install bash/.test(r.stderr),
        true,
      );
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? "All passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
