// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * SDK config command tests: initSdk / getSdkStatus / readSdkPath
 *
 * These functions read and WRITE ~/.tizen.sdk.path.config. sdk.js resolves
 * that path once at module load via os.homedir(), so this test points HOME
 * (POSIX) and USERPROFILE (Windows) at a temp sandbox BEFORE requiring the
 * module. The real user config is never read or written — a guard below
 * fails the run if CONFIG_FILE did not land inside the sandbox.
 *
 * Covers:
 *   - initSdk: argument validation, non-existent path, happy path (config
 *     file content + POSIX 0600 mode), envelope shape
 *   - getSdkStatus: not configured / empty config / stale path / configured
 *   - readSdkPath: configured value vs. default fallback
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const sandboxHome = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-sdk-commands-home-"),
);
const savedHome = process.env.HOME;
const savedUserprofile = process.env.USERPROFILE;
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;

// Must come AFTER the env redirect: CONFIG_FILE is computed at require time.
const {
  initSdk,
  getSdkStatus,
  readSdkPath,
  CONFIG_FILE,
} = require("../core/sdk-commands");

console.log("=== SDK Commands Test ===\n");

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

function removeConfig() {
  fs.rmSync(CONFIG_FILE, { force: true });
}

(async () => {
  try {
    // --- 0. Safety guard -------------------------------------------------------
    console.log("--- sandbox guard ---");
    const expectedConfig = path.join(sandboxHome, ".tizen.sdk.path.config");
    check(
      "CONFIG_FILE resolved inside the sandbox home",
      CONFIG_FILE,
      expectedConfig,
    );
    if (CONFIG_FILE !== expectedConfig) {
      // Do not continue: the write tests below would hit the real user config.
      throw new Error(
        `refusing to run: CONFIG_FILE=${CONFIG_FILE} is outside the sandbox`,
      );
    }

    const validSdk = path.join(sandboxHome, "tizen-studio");
    fs.mkdirSync(validSdk);
    const missingSdk = path.join(sandboxHome, "nonexistent");

    // --- 1. initSdk: argument validation --------------------------------------
    console.log("\n--- initSdk: invalid arguments ---");
    for (const bad of [null, undefined, "", 42]) {
      const env = await initSdk(bad);
      check(`initSdk(${JSON.stringify(bad)}) → failure`, env.status, "failure");
      check(
        `initSdk(${JSON.stringify(bad)}) → sdk_path_invalid`,
        env.errors[0].error_category,
        "sdk_path_invalid",
      );
      check(
        `initSdk(${JSON.stringify(bad)}) → CONFIG_E002`,
        env.errors[0].error_code,
        "TIZEN_SDK_CONFIG_E002",
      );
    }
    check(
      "invalid args do not create the config file",
      fs.existsSync(CONFIG_FILE),
      false,
    );
    {
      const env = await initSdk(null);
      check(
        "invalid arg → suggested_fix shows the init command",
        env.errors[0].suggested_fix.command.includes("sdk-init --sdk-path"),
        true,
      );
      check(
        "invalid arg → default command name",
        env.command,
        "tizen-sdk sdk-init",
      );
      const custom = await initSdk(null, "my custom command");
      check(
        "command name override is echoed",
        custom.command,
        "my custom command",
      );
    }

    // --- 2. initSdk: path does not exist --------------------------------------
    console.log("\n--- initSdk: non-existent path ---");
    {
      const env = await initSdk(missingSdk);
      check("non-existent path → failure", env.status, "failure");
      check(
        "non-existent path → sdk_path_invalid",
        env.errors[0].error_category,
        "sdk_path_invalid",
      );
      check(
        "non-existent path → message names the path",
        env.errors[0].message.includes(missingSdk),
        true,
      );
      check(
        "non-existent path → no config written",
        fs.existsSync(CONFIG_FILE),
        false,
      );
    }

    // --- 3. initSdk: happy path -----------------------------------------------
    console.log("\n--- initSdk: valid path ---");
    {
      const env = await initSdk(validSdk);
      check("valid path → success", env.status, "success");
      check("valid path → result.sdk_path", env.result.sdk_path, validSdk);
      check(
        "valid path → result.config_file is CONFIG_FILE",
        env.result.config_file,
        CONFIG_FILE,
      );
      check("valid path → errors empty", env.errors, []);
      check("valid path → warnings empty", env.warnings, []);
      check("config file created", fs.existsSync(CONFIG_FILE), true);
      check(
        "config file content is the sdk path",
        fs.readFileSync(CONFIG_FILE, "utf-8"),
        validSdk,
      );
      if (process.platform !== "win32") {
        const mode = fs.statSync(CONFIG_FILE).mode & 0o777;
        check("config file is user-only (0600) on POSIX", mode, 0o600);
      }
    }
    {
      // Re-init overwrites, it does not append.
      const other = path.join(sandboxHome, "other-sdk");
      fs.mkdirSync(other);
      await initSdk(other);
      check(
        "re-init overwrites the config",
        fs.readFileSync(CONFIG_FILE, "utf-8"),
        other,
      );
      await initSdk(validSdk);
    }

    // --- 4. getSdkStatus / readSdkPath: configured --------------------------------
    console.log("\n--- getSdkStatus / readSdkPath: configured ---");
    {
      const env = await getSdkStatus();
      check("status → success", env.status, "success");
      check("status → sdk_path", env.result.sdk_path, validSdk);
      check("status → configured true", env.result.configured, true);
      check("status → default command", env.command, "tizen-sdk sdk-status");
      check("readSdkPath returns configured value", readSdkPath(), validSdk);
    }

    // --- 5. getSdkStatus: configured path no longer exists ----------------------
    console.log("\n--- getSdkStatus: stale config ---");
    {
      fs.writeFileSync(CONFIG_FILE, missingSdk, "utf-8");
      const env = await getSdkStatus();
      check("stale path → failure", env.status, "failure");
      check(
        "stale path → sdk_path_invalid",
        env.errors[0].error_category,
        "sdk_path_invalid",
      );
      check(
        "stale path → message names the path",
        env.errors[0].message.includes(missingSdk),
        true,
      );
      check(
        "readSdkPath still returns the configured (stale) value",
        readSdkPath(),
        missingSdk,
      );
    }

    // --- 6. getSdkStatus: config exists but is empty ----------------------------
    console.log("\n--- getSdkStatus: empty config ---");
    {
      fs.writeFileSync(CONFIG_FILE, "   \n", "utf-8");
      const env = await getSdkStatus();
      check("empty config → failure", env.status, "failure");
      check(
        "empty config → sdk_path_not_set",
        env.errors[0].error_category,
        "sdk_path_not_set",
      );
      check(
        "empty config → message says empty",
        env.errors[0].message.includes("empty"),
        true,
      );
      check(
        "readSdkPath falls back to default on empty config",
        readSdkPath(),
        path.join(sandboxHome, "tizen-sdk"),
      );
    }

    // --- 7. getSdkStatus / readSdkPath: not configured --------------------------
    console.log("\n--- getSdkStatus / readSdkPath: not configured ---");
    {
      removeConfig();
      const env = await getSdkStatus();
      check("no config → failure", env.status, "failure");
      check(
        "no config → sdk_path_not_set",
        env.errors[0].error_category,
        "sdk_path_not_set",
      );
      check(
        "no config → CONFIG_E001",
        env.errors[0].error_code,
        "TIZEN_SDK_CONFIG_E001",
      );
      check(
        "no config → fix shows init command",
        env.errors[0].suggested_fix.command.includes("sdk-init --sdk-path"),
        true,
      );
      check(
        "no config → registry guide_url preserved",
        typeof env.errors[0].suggested_fix.guide_url,
        "string",
      );
      check(
        "readSdkPath default is <home>/tizen-sdk",
        readSdkPath(),
        path.join(sandboxHome, "tizen-sdk"),
      );
    }
  } finally {
    // Assigning undefined to process.env stores the string "undefined", so
    // restore by deleting when the variable was not set to begin with.
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserprofile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserprofile;
    fs.rmSync(sandboxHome, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
