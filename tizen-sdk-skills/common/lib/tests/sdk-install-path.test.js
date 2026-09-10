// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * SDK install-path resolution tests — issue #70.
 *
 * Under Codex CLI (Linux) the installer unpacked tizen-sdk INTO the user's
 * existing ~/tizen-studio: the JS pre-check resolved the SDK path from the
 * config file / default, but the installer command it returned carried no
 * --path, so tizen-sdk-install.sh fell back to the .zshrc export
 * TIZEN_SDK_PATH=~/tizen-studio. The shell helper get_sdk_path also put that
 * env var ahead of the config file and accepted a Tizen Studio tree (it has
 * tools/sdb too) as "a tizen-sdk".
 *
 * Covered here:
 *   - installerPathArgs(): the explicit --path / -Path argument pair
 *   - sdk.js source guards: both installer pre-checks pass it, readSdkPath
 *     ignores TIZEN_SDK_PATH
 *   - lib/common.sh (bash): get_sdk_path order config → env → defaults,
 *     Tizen Studio directories rejected, default_sdk_install_path never
 *     targets a Tizen Studio install. Skipped on win32 unless TIZEN_TEST_BASH
 *     names a Git Bash executable (the .ps1 twin holds the same logic).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { installerPathArgs } = require("../core/sdk");

console.log("=== SDK install-path tests (#70) ===\n");

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

// --- installerPathArgs ---------------------------------------------------------
console.log("--- installerPathArgs ---");
{
  const a = installerPathArgs("C:\\Users\\me\\tizen-sdk");
  check(
    "win: -Path with forward slashes (PowerShell-safe)",
    a.win,
    '-Path "C:/Users/me/tizen-sdk"',
  );
  check(
    "unix: --path keeps the path verbatim",
    a.unix,
    '--path "C:\\Users\\me\\tizen-sdk"',
  );
  const b = installerPathArgs("/home/u/tizen sdk");
  check("unix: spaces stay quoted", b.unix, '--path "/home/u/tizen sdk"');
}

// --- sdk.js source guards -------------------------------------------------------
console.log("\n--- sdk.js source guards ---");
{
  const src = fs.readFileSync(
    path.resolve(__dirname, "../core/sdk.js"),
    "utf-8",
  );
  const installSdkBody = src.slice(
    src.indexOf("async function installSdk("),
    src.indexOf("function buildScriptCommand("),
  );
  check(
    "installSdk: installerFix(tizen-sdk-install) receives installerPathArgs",
    /installerFix\(\s*"tizen-sdk-install",\s*installer\.scriptPath,\s*`\$\{pathArgs\.win\}/.test(
      installSdkBody,
    ),
    true,
  );
  check(
    "installSdk: pkg branch execPluginScript receives installerPathArgs",
    /execPluginScript\(\s*installer\.scriptPath,\s*`\$\{pathArgs\.win\}/.test(
      installSdkBody,
    ),
    true,
  );
  const fromRepoBody = src.slice(
    src.indexOf("async function installSdkFromRepo("),
    src.indexOf("async function installSdkFromRepo(") + 20000,
  );
  check(
    "installSdkFromRepo: flags start with -RepoUrl + pathArgs",
    /winFlags = \[`-RepoUrl "\$\{normalizedUrl\}"`, pathArgs\.win\]/.test(
      fromRepoBody,
    ) &&
      /unixFlags = \[`--repo-url="\$\{normalizedUrl\}"`, pathArgs\.unix\]/.test(
        fromRepoBody,
      ),
    true,
  );
  const readSdkPathBody = src.slice(
    src.indexOf("function readSdkPath()"),
    src.indexOf("function readSdkPath()") + 1500,
  );
  check(
    "readSdkPath: TIZEN_SDK_PATH is reported, never used",
    readSdkPathBody.includes("Ignoring TIZEN_SDK_PATH=") &&
      !/return\s+(process\.env\.TIZEN_SDK_PATH|envPath)/.test(readSdkPathBody),
    true,
  );
}

// --- lib/common.sh behaviour (bash) ------------------------------------------------
console.log("\n--- lib/common.sh get_sdk_path / default_sdk_install_path ---");
const BASH =
  process.env.TIZEN_TEST_BASH || (process.platform === "win32" ? null : "bash");
if (!BASH) {
  console.log(
    "SKIP: bash tests need bash (set TIZEN_TEST_BASH=<git-bash.exe> on Windows); lib/common.ps1 holds the same logic",
  );
} else {
  const COMMON_SH = path.resolve(__dirname, "../../scripts/lib/common.sh");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-sdkpath-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home);

  // A real tizen-sdk: tools/tizen-core + tools/sdb
  const realSdk = path.join(root, "real-sdk");
  fs.mkdirSync(path.join(realSdk, "tools", "tizen-core"), { recursive: true });
  fs.writeFileSync(path.join(realSdk, "tools", "sdb"), "");
  // Tizen Studio: tools/ide + tools/sdb, no tizen-core
  const studio = path.join(root, "tizen-studio");
  fs.mkdirSync(path.join(studio, "tools", "ide"), { recursive: true });
  fs.writeFileSync(path.join(studio, "tools", "sdb"), "");
  // Legacy layout: sdb only
  const legacy = path.join(root, "legacy-sdk");
  fs.mkdirSync(path.join(legacy, "tools"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "tools", "sdb"), "");

  // Git Bash sees Windows paths as-is; POSIX bash needs nothing special.
  const toBash = (p) =>
    process.platform === "win32" ? p.replace(/\\/g, "/") : p;

  function run(fn, env = {}) {
    const r = spawnSync(BASH, ["-c", `source "${toBash(COMMON_SH)}"; ${fn}`], {
      encoding: "utf-8",
      env: {
        PATH: process.env.PATH,
        HOME: toBash(home),
        ...env,
      },
      timeout: 20000,
    });
    return {
      out: (r.stdout || "").trim(),
      err: (r.stderr || "").trim(),
      code: r.status,
    };
  }
  const writeConfig = (p) =>
    fs.writeFileSync(path.join(home, ".tizen.sdk.path.config"), `${p}\n`);
  const clearConfig = () => {
    try {
      fs.unlinkSync(path.join(home, ".tizen.sdk.path.config"));
    } catch (_e) {
      /* absent */
    }
  };

  try {
    check(
      "common.sh passes bash -n",
      spawnSync(BASH, ["-n", toBash(COMMON_SH)]).status,
      0,
    );
    // Git Bash renders a Windows HOME in its own POSIX form (/tmp/... for
    // %TEMP%), so take $HOME as the shell sees it for the default-path cases.
    const homeAsSeen = run('echo "$HOME"').out;
    const defaultSdk = `${homeAsSeen}/tizen-sdk`;

    // _is_tizen_sdk classification
    check(
      "_is_tizen_sdk: tizen-core → yes",
      run(`_is_tizen_sdk "${toBash(realSdk)}" && echo yes || echo no`).out,
      "yes",
    );
    check(
      "_is_tizen_sdk: Tizen Studio (tools/ide, sdb, no tizen-core) → no",
      run(`_is_tizen_sdk "${toBash(studio)}" && echo yes || echo no`).out,
      "no",
    );
    check(
      "_is_tizen_sdk: legacy sdb-only → yes",
      run(`_is_tizen_sdk "${toBash(legacy)}" && echo yes || echo no`).out,
      "yes",
    );

    // get_sdk_path ordering
    clearConfig();
    check(
      "no config, TIZEN_SDK_PATH=tizen-studio → env skipped, default",
      run("get_sdk_path", { TIZEN_SDK_PATH: toBash(studio) }).out,
      defaultSdk,
    );
    check(
      "no config, TIZEN_SDK_PATH=real sdk → env honoured",
      run("get_sdk_path", { TIZEN_SDK_PATH: toBash(realSdk) }).out,
      toBash(realSdk),
    );
    writeConfig(toBash(realSdk));
    check(
      "config=real sdk beats TIZEN_SDK_PATH=legacy (the #70 order)",
      run("get_sdk_path", { TIZEN_SDK_PATH: toBash(legacy) }).out,
      toBash(realSdk),
    );
    writeConfig(path.join(toBash(root), "missing-sdk"));
    check(
      "config points at a missing dir → next valid candidate (env)",
      run("get_sdk_path", { TIZEN_SDK_PATH: toBash(legacy) }).out,
      toBash(legacy),
    );

    // default_sdk_install_path
    clearConfig();
    {
      const r = run("default_sdk_install_path", {
        TIZEN_SDK_PATH: toBash(studio),
      });
      check(
        "install default: TIZEN_SDK_PATH=tizen-studio → $HOME/tizen-sdk",
        r.out,
        defaultSdk,
      );
      check(
        "install default: warns about the ignored Tizen Studio path",
        r.err.includes("Ignoring TIZEN_SDK_PATH") &&
          r.err.includes("Tizen Studio"),
        true,
      );
    }
    check(
      "install default: TIZEN_SDK_PATH=fresh dir → honoured",
      run("default_sdk_install_path", {
        TIZEN_SDK_PATH: `${toBash(root)}/fresh`,
      }).out,
      `${toBash(root)}/fresh`,
    );
    writeConfig(`${toBash(root)}/configured-sdk`);
    check(
      "install default: config file wins over TIZEN_SDK_PATH",
      run("default_sdk_install_path", {
        TIZEN_SDK_PATH: `${toBash(root)}/fresh`,
      }).out,
      `${toBash(root)}/configured-sdk`,
    );
    check(
      "install default: no config, no env → $HOME/tizen-sdk",
      (clearConfig(), run("default_sdk_install_path").out),
      defaultSdk,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

console.log(
  `\n${failures === 0 ? "All sdk-install-path tests passed" : `${failures} FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
