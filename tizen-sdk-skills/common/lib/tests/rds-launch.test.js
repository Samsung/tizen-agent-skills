// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS launch.js tests (Part of the RDS plan, step 16).
 *
 * Covers `runNoChain()`'s own logic — validation guards and success/error
 * mapping — exercised through a real execFile spawn against a fake `tz`
 * binary (fixtures/rds-tz-bin/tz), so argv construction (no shell,
 * `--proj-dir=`/`--serial=` flags) is actually proven, not just asserted.
 *
 * `opts.tzPath` is an injectable override added specifically so these tests
 * don't depend on — and can't accidentally exercise — a real Tizen SDK that
 * may be configured on the machine running them (same pattern as
 * rds-sdb.test.js's `opts.sdbPath`).
 *
 * NOT covered here: `resolveTzBinary()`'s own SDK-path resolution logic
 * (lives in certificate.js, exercised when opts.tzPath is omitted) and real
 * on-device `tz run` behavior.
 */

const path = require("path");
const { runNoChain } = require("../core/rds/launch");

console.log("=== rds/launch.js Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

const FAKE_TZ = path.join(__dirname, "fixtures", "rds-tz-bin", "tz");

(async () => {
  try {
    console.log("Validation guards (no binary spawned):");

    check(
      "missing projectDir returns error without spawning",
      await runNoChain("", "launch-ok", {
        tzPath: "/nonexistent/should-not-run",
      }),
      { status: "error", output: "Project directory is not set" },
    );

    check(
      "missing deviceSerial returns error without spawning",
      await runNoChain("/some/project", "", {
        tzPath: "/nonexistent/should-not-run",
      }),
      { status: "error", output: "Device serial is not set" },
    );

    if (process.platform === "win32") {
      // The fake `tz` fixture is a POSIX shell script spawned via execFile;
      // Windows cannot execute it. CI runs the spawn tests on Linux.
      console.log(
        "\nSKIP: tz spawn tests need the POSIX fake tz fixture (fixtures/rds-tz-bin/tz)",
      );
      console.log(
        `\n${failures === 0 ? "=== ALL PASS ===" : `=== ${failures} FAILURE(S) ===`}`,
      );
      process.exitCode = failures === 0 ? 0 : 1;
      return;
    }

    console.log("\ntz run invocation (via fake tz binary):");

    const okResult = await runNoChain("/some/project", "launch-ok", {
      tzPath: FAKE_TZ,
    });
    check(
      "successful launch returns status success",
      okResult.status,
      "success",
    );
    check(
      "successful launch returns tz stdout as output",
      okResult.output.trim(),
      "Application launched successfully.",
    );

    const failResult = await runNoChain("/some/project", "launch-fail", {
      tzPath: FAKE_TZ,
    });
    check("failed launch returns status error", failResult.status, "error");
    check(
      "failed launch returns tz stderr as output",
      failResult.output.trim(),
      "error: application not installed on device",
    );

    // Nonexistent binary path → spawn itself fails (ENOENT), not a thrown exception
    const missingBinaryResult = await runNoChain("/some/project", "launch-ok", {
      tzPath: "/definitely/does/not/exist/tz",
    });
    check(
      "nonexistent tz binary returns error, not a throw",
      missingBinaryResult.status,
      "error",
    );

    console.log(
      `\n${failures === 0 ? "=== ALL PASS ===" : `=== ${failures} FAILURE(S) ===`}`,
    );
    process.exitCode = failures === 0 ? 0 : 1;
  } catch (err) {
    console.error("FATAL ERROR:", err);
    process.exitCode = 1;
  }
})();
