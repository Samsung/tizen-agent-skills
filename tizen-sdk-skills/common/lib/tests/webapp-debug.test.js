// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * webapp-debug tests
 *
 * Covers the environment-independent surface of the tizen-webapp-debug stack:
 *   - parseRwiLaunch / parseCdpJsonBlock: pure marker/fence parsing of the
 *     worker-script output contract (no device needed)
 *   - setupWebappDebug parameter validation: every path returns an
 *     invalid_parameters envelope BEFORE any sdb/SDK/plugin-cache access
 *   - webapp-debug-cli.js spawned as a child process:
 *     usage errors → invalid_parameters envelope on STDERR, exit 1;
 *     missing --app-id → Standard JSON Envelope from the core on STDOUT
 */

const { spawnSync } = require("child_process");
const path = require("path");
const {
  setupWebappDebug,
  parseRwiLaunch,
  parseCdpJsonBlock,
} = require("../core/webapp-debug");

console.log("=== webapp-debug Test ===\n");

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

// Test 1: parseRwiLaunch marker parsing
console.log("Test 1: parseRwiLaunch");
check(
  "  happy path",
  parseRwiLaunch("App PID: 1234\nRWI device port: 45678\n"),
  { appPid: 1234, devicePort: 45678 },
);
check(
  "  CRLF line endings",
  parseRwiLaunch("App PID: 1234\r\nRWI device port: 45678\r\n"),
  { appPid: 1234, devicePort: 45678 },
);
check(
  "  log noise around the markers",
  parseRwiLaunch(
    "[INFO]  Using sdb: /opt/sdb\n    ... successfully launched pid = 1234 with debug 1\nApp PID: 1234\nRWI device port: 45678\nForwarded: tcp:9222 -> tcp:45678\n",
  ),
  { appPid: 1234, devicePort: 45678 },
);
check("  missing port marker", parseRwiLaunch("App PID: 1234\n"), {
  appPid: 1234,
  devicePort: null,
});
check("  missing pid marker", parseRwiLaunch("RWI device port: 45678\n"), {
  appPid: null,
  devicePort: 45678,
});
check("  empty output", parseRwiLaunch(""), { appPid: null, devicePort: null });
check(
  "  marker must be at line start (device port line is not a PID line)",
  parseRwiLaunch("some log App PID: 99\nRWI device port: 45678\n"),
  { appPid: null, devicePort: 45678 },
);

// Test 2: parseCdpJsonBlock fence parsing
console.log("\nTest 2: parseCdpJsonBlock");
const versionBlock = [
  "CDP endpoint: http://127.0.0.1:9222",
  "CDP_VERSION_JSON_BEGIN",
  '{"Browser": "Chrome/76.0.3809.146", "Protocol-Version": "1.3"}',
  "CDP_VERSION_JSON_END",
  "CDP_PAGES_JSON_BEGIN",
  '[{"id": "abc", "type": "page", "title": "MyWebApp", "url": "file:///index.html", "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/abc"}]',
  "CDP_PAGES_JSON_END",
  "[OK]    Web app is running with RWI",
].join("\n");
check("  version object", parseCdpJsonBlock(versionBlock, "VERSION"), {
  Browser: "Chrome/76.0.3809.146",
  "Protocol-Version": "1.3",
});
check("  pages array", parseCdpJsonBlock(versionBlock, "PAGES"), [
  {
    id: "abc",
    type: "page",
    title: "MyWebApp",
    url: "file:///index.html",
    webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/abc",
  },
]);
check(
  "  CRLF tolerated",
  parseCdpJsonBlock(
    'CDP_VERSION_JSON_BEGIN\r\n{"Browser": "X"}\r\nCDP_VERSION_JSON_END\r\n',
    "VERSION",
  ),
  { Browser: "X" },
);
check(
  "  multi-line pretty-printed JSON",
  parseCdpJsonBlock(
    'CDP_PAGES_JSON_BEGIN\n[\n  {\n    "id": "a"\n  }\n]\nCDP_PAGES_JSON_END\n',
    "PAGES",
  ),
  [{ id: "a" }],
);
check(
  "  missing fences → null",
  parseCdpJsonBlock("no fences here", "VERSION"),
  null,
);
check(
  "  malformed JSON → null",
  parseCdpJsonBlock(
    "CDP_VERSION_JSON_BEGIN\nnot json\nCDP_VERSION_JSON_END\n",
    "VERSION",
  ),
  null,
);
check("  empty output → null", parseCdpJsonBlock("", "PAGES"), null);

// Test 3: setupWebappDebug parameter validation (returns before plugin-cache/sdb access)
console.log("\nTest 3: setupWebappDebug validation");

async function validationCategory(name, args, expectedFragment) {
  const env = await setupWebappDebug(...args);
  check(`  ${name}: status`, env.status, "failure");
  check(
    `  ${name}: error_category`,
    env.errors && env.errors[0].error_category,
    "invalid_parameters",
  );
  if (expectedFragment) {
    check(
      `  ${name}: message mentions offending value`,
      Boolean(env.errors && env.errors[0].message.includes(expectedFragment)),
      true,
    );
  }
}

(async () => {
  await validationCategory("missing appId", [undefined]);
  await validationCategory("shell metachars in appId", ["bad;id"], "bad;id");
  await validationCategory("space in appId", ["bad id"], "bad id");
  await validationCategory(
    "quote in serial",
    ["good.App", { serial: 'emu"lator' }],
    'emu"lator',
  );
  await validationCategory("port 0", ["good.App", { port: 0 }], "0");
  await validationCategory(
    "port 70000",
    ["good.App", { port: 70000 }],
    "70000",
  );
  await validationCategory(
    "non-numeric port",
    ["good.App", { port: "abc" }],
    "abc",
  );
  await validationCategory("timeout 0", ["good.App", { timeout: 0 }], "0");
  await validationCategory(
    "timeout 999",
    ["good.App", { timeout: 999 }],
    "999",
  );

  // Test 4: webapp-debug-cli.js CLI contract (spawned; no sdb/SDK access needed)
  console.log("\nTest 4: webapp-debug-cli.js contract");
  const CLI = path.join(__dirname, "..", "cli", "webapp-debug-cli.js");

  function runCliProc(args) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      timeout: 30000,
    });
    return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
  }

  // 4a. Missing --app-id → core validation → Standard JSON Envelope on STDOUT
  {
    const r = runCliProc([]);
    check("  no args: exit code", r.status, 1);
    let env = null;
    try {
      env = JSON.parse(r.stdout);
    } catch (_e) {
      /* handled by checks below */
    }
    check("  no args: stdout is JSON", env !== null, true);
    check("  no args: status", env && env.status, "failure");
    check(
      "  no args: error_category",
      env && env.errors && env.errors[0].error_category,
      "invalid_parameters",
    );
    check(
      "  no args: suggested_fix present",
      Boolean(env && env.errors && env.errors[0].suggested_fix),
      true,
    );
  }

  // 4b. Unknown option → usage envelope on STDERR, empty STDOUT
  {
    const r = runCliProc(["--bogus", "x"]);
    check("  unknown option: exit code", r.status, 1);
    check("  unknown option: stdout empty", r.stdout.trim(), "");
    let env = null;
    try {
      env = JSON.parse(r.stderr);
    } catch (_e) {
      /* handled by checks below */
    }
    check("  unknown option: stderr is JSON", env !== null, true);
    check(
      "  unknown option: code",
      env && env.errors && env.errors[0].code,
      "invalid_parameters",
    );
    check(
      "  unknown option: message names the flag",
      Boolean(env && env.errors[0].message.includes("--bogus")),
      true,
    );
  }

  // 4c. Positional calling convention → rejected with usage envelope
  {
    const r = runCliProc(["abcDEF1234.MyWebApp"]);
    check("  positional args: exit code", r.status, 1);
    let env = null;
    try {
      env = JSON.parse(r.stderr);
    } catch (_e) {
      /* handled by checks below */
    }
    check(
      "  positional args: message says unexpected",
      Boolean(env && env.errors[0].message.includes("Unexpected argument(s)")),
      true,
    );
  }

  // 4d. --app-id without a value → usage envelope
  {
    const r = runCliProc(["--app-id"]);
    check("  missing value: exit code", r.status, 1);
    let env = null;
    try {
      env = JSON.parse(r.stderr);
    } catch (_e) {
      /* handled by checks below */
    }
    check(
      "  missing value: message says value required",
      Boolean(env && env.errors[0].message.includes("requires a value")),
      true,
    );
  }

  // 4e. Bad port reaches the core guard → envelope on STDOUT (not a usage error)
  {
    const r = runCliProc(["--app-id", "good.App", "--port", "70000"]);
    check("  bad port: exit code", r.status, 1);
    let env = null;
    try {
      env = JSON.parse(r.stdout);
    } catch (_e) {
      /* handled by checks below */
    }
    check("  bad port: stdout is JSON", env !== null, true);
    check(
      "  bad port: error_category",
      env && env.errors && env.errors[0].error_category,
      "invalid_parameters",
    );
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
