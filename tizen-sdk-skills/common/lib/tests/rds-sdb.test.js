// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS sdb-helper.js extension tests (Part 5 of the RDS plan).
 *
 * Covers two layers:
 *   1. Pure parsing helpers (parsePushDirectoryResult, extractAppInstallPath)
 *      — no process spawning involved.
 *   2. The argv-based primitives (execute/pushDirectory/root/
 *      getAppInstallPath) against a fake `sdb` binary
 *      (fixtures/rds-sdb-bin/sdb), exercised through a real execFile spawn
 *      so the argv construction (no shell, `-s <serial>` prefix) is actually
 *      proven, not just asserted.
 *
 * `opts.sdbPath` is an injectable override added specifically so these tests
 * don't depend on — and can't accidentally exercise — a real Tizen SDK that
 * may be configured on the machine running them (see remote-device.js's
 * `computeSubnets(ifaces = ...)` for the same pattern elsewhere in this repo).
 *
 * NOT covered here (needs a real device/emulator):
 *   - actual `sdb root on` permission semantics on a device
 *   - actual on-device output of `0 getappinstallpath` / `pkgcmd -a` /
 *     `apps_rw` vs `apps` layout across real Tizen versions
 * Both were verified manually on a Tizen 11 emulator — see
 * docs/rds/RDS_FAST_DEPLOY_PLAN.en.md "Real-device verification".
 */

const path = require("path");
const {
  execute,
  pushDirectory,
  root,
  getAppInstallPath,
  parsePushDirectoryResult,
  extractAppInstallPath,
} = require("../core/sdb-helper");

console.log("=== rds-sdb Test ===\n");

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

async function checkRejects(name, promise, messageSubstring) {
  try {
    await promise;
    failures++;
    console.log(`FAIL ${name} — expected rejection, got success`);
  } catch (error) {
    const ok = error.message.includes(messageSubstring);
    if (!ok) failures++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${name}` +
        (ok
          ? ""
          : ` — got error "${error.message}", expected to include "${messageSubstring}"`),
    );
  }
}

const FAKE_SDB = path.join(__dirname, "fixtures", "rds-sdb-bin", "sdb");

console.log("Test 1: parsePushDirectoryResult (pure)");
check(
  "well-formed summary",
  parsePushDirectoryResult("5 file(s) pushed. 0 file(s) skipped."),
  {
    pushed: 5,
    skipped: 0,
  },
);
check(
  "summary embedded in noisier output",
  parsePushDirectoryResult(
    "pushing...\n12 file(s) pushed. 3 file(s) skipped.\ndone",
  ),
  { pushed: 12, skipped: 3 },
);
check("no match -> null", parsePushDirectoryResult("sdb: sync failed"), null);

console.log("\nTest 2: extractAppInstallPath (pure)");
check(
  "extracts path",
  extractAppInstallPath("Tizen Application Installation Path: /opt/usr/apps"),
  "/opt/usr/apps",
);
check(
  "trims whitespace",
  extractAppInstallPath(
    "Tizen Application Installation Path:   /home/owner/apps_rw  \n",
  ),
  "/home/owner/apps_rw",
);
check("no match -> null", extractAppInstallPath("permission denied"), null);
check(
  "empty path -> null",
  extractAppInstallPath("Tizen Application Installation Path: "),
  null,
);

if (process.platform === "win32") {
  // The fake `sdb` fixture is a POSIX shell script spawned via execFile;
  // Windows cannot execute it. CI runs the spawn tests on Linux.
  console.log(
    "\nSKIP: spawn tests need the POSIX fake sdb fixture (fixtures/rds-sdb-bin/sdb)",
  );
  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

(async () => {
  console.log(
    "\nTest 3: execute() runs argv with no shell, -s <serial> shell <args>",
  );
  const out = await execute("exec-ok", ["echo", "hello"], {
    sdbPath: FAKE_SDB,
  });
  check("stdout echoes the argv it received", out.trim(), "shell echo hello");

  console.log("\nTest 4: execute() propagates device failure");
  await checkRejects(
    "exec-fail rejects with stderr detail",
    execute("exec-fail", ["whoami"], { sdbPath: FAKE_SDB }),
    "device says no",
  );

  console.log("\nTest 6: pushDirectory()");
  const dirOut = await pushDirectory(
    "pushdir-ok",
    "/local/dir",
    "/remote/dir",
    5,
    {
      sdbPath: FAKE_SDB,
    },
  );
  check(
    "pushDirectory success output",
    dirOut.trim(),
    "5 file(s) pushed. 0 file(s) skipped.",
  );
  await checkRejects(
    "pushDirectory rejects on any skipped file",
    pushDirectory("pushdir-skipped", "/local/dir", "/remote/dir", 4, {
      sdbPath: FAKE_SDB,
    }),
    "skipped",
  );
  await checkRejects(
    "pushDirectory rejects on count mismatch",
    pushDirectory("pushdir-mismatch", "/local/dir", "/remote/dir", 5, {
      sdbPath: FAKE_SDB,
    }),
    "file count mismatch",
  );
  await checkRejects(
    "pushDirectory rejects when summary line is missing",
    pushDirectory("pushdir-garbled", "/local/dir", "/remote/dir", 1, {
      sdbPath: FAKE_SDB,
    }),
    "unexpected sdb push output",
  );

  console.log("\nTest 7: root()");
  await root("root-ok", "on", { sdbPath: FAKE_SDB }); // resolves without throwing
  console.log("PASS root('on') resolves");
  await checkRejects(
    "root() rejects an invalid onOrOff value",
    root("root-ok", "sideways", { sdbPath: FAKE_SDB }),
    'must be "on" or "off"',
  );

  console.log("\nTest 8: getAppInstallPath() multi-tier fallback");
  check(
    "tier 1 (0 getappinstallpath) succeeds directly",
    await getAppInstallPath("tier1-ok", { sdbPath: FAKE_SDB }),
    "/opt/usr/apps",
  );
  check(
    "tier 2 (pkgcmd -a) used when tier 1 fails",
    await getAppInstallPath("tier2-ok", { sdbPath: FAKE_SDB }),
    "/opt/usr/apps",
  );
  check(
    "tier 3 (apps_rw existence) used when tiers 1-2 fail",
    await getAppInstallPath("tier3-ok", { sdbPath: FAKE_SDB }),
    "/home/owner/apps_rw",
  );
  check(
    "tier 4 (apps existence) used when tiers 1-3 fail",
    await getAppInstallPath("tier4-ok", { sdbPath: FAKE_SDB }),
    "/opt/usr/apps",
  );
  await checkRejects(
    "all tiers failing throws a descriptive error",
    getAppInstallPath("all-fail", { sdbPath: FAKE_SDB }),
    "Cannot determine app install path",
  );
  // sdb exits 0 even when the remote `test -d` fails — a silent exit-0 must
  // not be mistaken for "directory exists".
  await checkRejects(
    "tier 3/4 exit-0 without the echoed marker is not treated as success",
    getAppInstallPath("tier-none-silent", { sdbPath: FAKE_SDB }),
    "Cannot determine app install path",
  );

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
