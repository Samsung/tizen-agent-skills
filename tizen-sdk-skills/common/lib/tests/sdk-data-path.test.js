// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * resolveSdkDataPath() — SDK root + data directory resolution (lib/core/sdb.js).
 *
 * Every scenario runs in a child node process with HOME pointed at a throwaway
 * directory (so `~/.tizen.sdk.path.config` and the `~/tizen-sdk` default are
 * ours) and PATH reduced to a directory we control (so "sdb on PATH" is ours
 * too). The developer's real SDK is never consulted.
 *
 * Regression for PR #68's follow-up: the config-only rewrite trusted
 * `~/.tizen.sdk.path.config` blindly, so a machine without an SDK resolved to
 * a phantom `~/tizen-sdk-data` and reported success (remote-device add then
 * created that directory), and a stale config lost the recovery through the
 * sdb on PATH. Config must win when it points at a real SDK, PATH must rescue
 * a stale config, and "no SDK anywhere" must be an error.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== sdk-data-path Test ===\n");

const IS_WIN = process.platform === "win32";
const SDB = IS_WIN ? "sdb.exe" : "sdb";
const SDB_JS = path.join(__dirname, "..", "core", "sdb.js");

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

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-sdk-data-path-"));

/** A fake SDK root: optional sdk.info, optional tools/sdb. */
function makeSdk(name, { sdkInfo = null, withSdb = false } = {}) {
  const root = path.join(workDir, name);
  fs.mkdirSync(root, { recursive: true });
  if (sdkInfo !== null) fs.writeFileSync(path.join(root, "sdk.info"), sdkInfo);
  if (withSdb) {
    fs.mkdirSync(path.join(root, "tools"), { recursive: true });
    fs.writeFileSync(path.join(root, "tools", SDB), "", { mode: 0o755 });
  }
  return root;
}

/**
 * Run resolveSdkDataPath() in a child with our HOME and PATH.
 * @param {{configured?: string, pathDirs?: string[]}} opts
 */
function resolveIn({ configured, pathDirs = [] } = {}) {
  const home = fs.mkdtempSync(path.join(workDir, "home-"));
  if (configured !== undefined) {
    fs.writeFileSync(path.join(home, ".tizen.sdk.path.config"), configured);
  }
  // node itself must stay reachable for the child; everything else drops off
  // PATH so `command -v sdb` / `where sdb` only ever finds our fake.
  const nodeDir = path.dirname(process.execPath);
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `process.stdout.write(JSON.stringify(require(${JSON.stringify(SDB_JS)}).resolveSdkDataPath()))`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        PATH: [...pathDirs, nodeDir].join(path.delimiter),
        Path: [...pathDirs, nodeDir].join(path.delimiter),
      },
      timeout: 30000,
    },
  );
  try {
    return JSON.parse(r.stdout);
  } catch (_e) {
    return { error: `child failed: ${r.stderr || r.stdout}` };
  }
}

// 1. Configured root is a real SDK with sdk.info -> config wins, data path from sdk.info
console.log("Test 1: configured SDK with TIZEN_SDK_DATA_PATH in sdk.info");
{
  const data = path.join(workDir, "elsewhere-data");
  const root = makeSdk("sdk-a", {
    sdkInfo: `TIZEN_SDK_INSTALLED_PATH=${path.join(workDir, "sdk-a")}\nTIZEN_SDK_DATA_PATH=${data}\n`,
  });
  const r = resolveIn({ configured: root });
  check("  sdkRoot is the configured root", r.sdkRoot, root);
  check("  dataPath comes from sdk.info", r.dataPath, data);
  check("  source", r.source, "sdk_path+sdk.info");
}

// 2. Configured root has sdk.info without the key -> sibling convention
console.log("\nTest 2: sdk.info without TIZEN_SDK_DATA_PATH -> sibling");
{
  const root = makeSdk("tizen-studio", {
    sdkInfo: "TIZEN_SDK_INSTALLED_PATH=/whatever\n",
  });
  const r = resolveIn({ configured: root });
  check("  sdkRoot", r.sdkRoot, root);
  check("  dataPath is <root>-data", r.dataPath, `${root}-data`);
  check("  source", r.source, "sdk_path+sibling");
}

// 3. Configured root has only tools/sdb (manual unpack, no sdk.info) -> still accepted
console.log("\nTest 3: configured root with tools/sdb but no sdk.info");
{
  const root = makeSdk("sdk-manual", { withSdb: true });
  const r = resolveIn({ configured: root });
  check("  sdkRoot", r.sdkRoot, root);
  check("  source", r.source, "sdk_path+sibling");
}

// 4. Config wins over a different SDK on PATH (the PR #68 bug: PATH used to win
//    whenever the configured root had no tools/sdb)
console.log("\nTest 4: config beats a different SDK whose sdb is on PATH");
{
  const configured = makeSdk("sdk-tz-only", {
    sdkInfo: `TIZEN_SDK_DATA_PATH=${path.join(workDir, "tz-only-data")}\n`,
  });
  const other = makeSdk("sdk-on-path", { withSdb: true, sdkInfo: "" });
  const r = resolveIn({
    configured,
    pathDirs: [path.join(other, "tools")],
  });
  check(
    "  sdkRoot is the configured SDK, not the PATH one",
    r.sdkRoot,
    configured,
  );
  check("  source", r.source, "sdk_path+sdk.info");
}

// 5. Stale config (directory gone) + sdb on PATH -> recovered from PATH
console.log("\nTest 5: stale config recovers via sdb on PATH");
{
  const other = makeSdk("sdk-real", {
    withSdb: true,
    sdkInfo: `TIZEN_SDK_DATA_PATH=${path.join(workDir, "real-data")}\n`,
  });
  const r = resolveIn({
    configured: path.join(workDir, "moved-away"),
    pathDirs: [path.join(other, "tools")],
  });
  check("  sdkRoot is two levels up from the PATH sdb", r.sdkRoot, other);
  check(
    "  dataPath from that SDK's sdk.info",
    r.dataPath,
    path.join(workDir, "real-data"),
  );
  check("  source", r.source, "path_env+sdk.info");
}

// 6. No config, no ~/tizen-sdk, no sdb on PATH -> error, no phantom path
console.log("\nTest 6: no SDK anywhere -> error");
{
  const r = resolveIn({});
  check("  returns an error", typeof r.error, "string");
  check("  no dataPath fabricated", r.dataPath, undefined);
  check(
    "  error names the checked default path",
    r.error.includes(path.join("tizen-sdk")) &&
      /sdb is not on PATH/.test(r.error),
    true,
  );
  check(
    "  error tells the user how to fix it",
    /tizen-sdk-init/.test(r.error),
    true,
  );
}

// 7. Config points at an existing directory that is not an SDK -> error too
console.log("\nTest 7: configured directory exists but is not an SDK");
{
  const notSdk = path.join(workDir, "just-a-folder");
  fs.mkdirSync(notSdk);
  const r = resolveIn({ configured: notSdk });
  check("  returns an error", typeof r.error, "string");
  check("  error names the configured path", r.error.includes(notSdk), true);
}

fs.rmSync(workDir, { recursive: true, force: true });

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
