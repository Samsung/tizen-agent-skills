// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * sdk-install --tizen-version handling.
 *
 * Reported bug: `tizen-sdk sdk-install --tizen-version 99.99.99` returned
 * success on any host that already had an SDK. The pre-check stopped at
 * sdk.info, never looked at the requested version, and even echoed the bogus
 * version in result.packages[].version. On a clean host the value was not
 * forwarded to the installer either, so the newest platform was installed and
 * reported as the requested one.
 *
 * Covered here:
 *   - validateTizenVersion(): X.Y accepted, empty = auto, anything else rejected
 *   - listInstalledPlatformVersions(): platforms/tizen-X.Y → sorted "X.Y" list
 *   - installSdk(): malformed version → invalid_argument before any other check
 *   - installSdk() on an installed SDK: requested version must be among the
 *     installed platforms (platform_version_not_found otherwise); the summary
 *     reports the requested / newest installed version, never a made-up one
 *   - installSdkFromRepo(): same syntax check, before the URL is touched
 *   - installPlatform(): same syntax check for --platform-version
 *   - shell safety: every accepted version passes shellUnsafeReason(); every
 *     UNSAFE_SHELL_CHARS character and non-ASCII digit is rejected
 *   - sdkInstallerFlags(): argument order / quoting for both script dialects,
 *     identical for the pkg and suggested_fix branches, refuses unvalidated
 *     versions
 *   - source guard: the version is forwarded to the installer as
 *     -Platform / --platform
 *
 * installSdk() reads ~/.tizen.sdk.path.config (resolved once at require time
 * via os.homedir()), so HOME / USERPROFILE are pointed at a temp sandbox
 * BEFORE the module is required. The real user config is never touched.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const sandboxHome = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-sdk-install-version-home-"),
);
const savedHome = process.env.HOME;
const savedUserprofile = process.env.USERPROFILE;
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;

// Must come AFTER the env redirect: CONFIG_FILE is computed at require time.
const {
  CONFIG_FILE,
  validateTizenVersion,
  listInstalledPlatformVersions,
  sdkInstallerFlags,
  installSdk,
  installSdkFromRepo,
  installPlatform,
} = require("../core/sdk");
const { shellUnsafeReason } = require("../core/shell-safety");

console.log("=== sdk-install --tizen-version tests ===\n");

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

// Keep the pre-check's own progress lines out of the test output.
const realConsoleError = console.error;
console.error = () => {};

(async () => {
  try {
    // --- sandbox guard ---------------------------------------------------------
    console.log("--- sandbox guard ---");
    const expectedConfig = path.join(sandboxHome, ".tizen.sdk.path.config");
    check(
      "CONFIG_FILE resolved inside the sandbox",
      CONFIG_FILE,
      expectedConfig,
    );
    if (CONFIG_FILE !== expectedConfig) {
      throw new Error(
        `refusing to run: CONFIG_FILE=${CONFIG_FILE} is outside the sandbox`,
      );
    }

    // --- validateTizenVersion ----------------------------------------------------
    console.log("\n--- validateTizenVersion ---");
    for (const ok of ["10.0", "11.0", "5.5", "  9.0 "]) {
      const r = validateTizenVersion(ok);
      check(`"${ok}" accepted`, r.error, null);
      check(`"${ok}" trimmed`, r.version, ok.trim());
    }
    for (const auto of ["", "   ", null, undefined]) {
      const r = validateTizenVersion(auto);
      check(`${JSON.stringify(auto)} → auto (empty, no error)`, r, {
        version: "",
        error: null,
      });
    }
    // Shape errors and every shell-injection vector the value could carry
    // into `-Platform "<v>"` / `--platform "<v>"`. Includes non-ASCII digits
    // (Arabic-Indic, fullwidth) and a fullwidth dot: `[0-9]` and the literal
    // "." are ASCII-only, so these must not slip through as "digits".
    const rejected = [
      "99.99.99",
      "10",
      "abc",
      "v10.0",
      "10.0.",
      ".10",
      "10.0; rm -rf /",
      '10.0"',
      "10.0$(id)",
      "10.0`id`",
      "10.0&&whoami",
      "10.0|x",
      "10.0<x",
      "10.0>x",
      "10.0\\",
      "10\n.0", // embedded line break (a trailing one is trimmed, see below)
      "10\r.0",
      "١٠.٠", // Arabic-Indic digits
      "１０.０", // fullwidth digits
      "10．0", // fullwidth full stop
      "10.0 11.0",
    ];
    for (const bad of rejected) {
      const r = validateTizenVersion(bad);
      check(
        `${JSON.stringify(bad)} rejected`,
        typeof r.error === "string",
        true,
      );
      check(
        `${JSON.stringify(bad)} error names the value and the X.Y shape`,
        r.error.includes(`"${bad.trim()}"`) && r.error.includes("MAJOR.MINOR"),
        true,
      );
    }
    // Surrounding whitespace / line breaks are trimmed, never forwarded.
    for (const padded of ["10.0\n", "10.0\r\n", "\t10.0 "]) {
      check(
        `${JSON.stringify(padded)} → accepted as "10.0"`,
        validateTizenVersion(padded),
        { version: "10.0", error: null },
      );
    }
    // Invariant the installer command line relies on: whatever this check
    // accepts is inert inside a double-quoted shell argument. Cross-check
    // against the repo's own shell-safety screen over a broad sample.
    {
      let unsafeAccepted = 0;
      let accepted = 0;
      for (let major = 0; major <= 120; major++) {
        for (const minor of ["0", "1", "5", "10", "99", "007"]) {
          const v = `${major}.${minor}`;
          const r = validateTizenVersion(v);
          if (r.error) continue;
          accepted++;
          if (shellUnsafeReason(r.version) !== null) unsafeAccepted++;
        }
      }
      check("accepted values are a non-empty sample", accepted > 0, true);
      check(
        "every accepted version passes shellUnsafeReason()",
        unsafeAccepted,
        0,
      );
      // ...and the whole UNSAFE_SHELL_CHARS alphabet is rejected when
      // appended to an otherwise valid version.
      const unsafeAlphabet = [
        '"',
        "`",
        "$",
        ";",
        "|",
        "&",
        "<",
        ">",
        "\r",
        "\n",
      ];
      check(
        "every UNSAFE_SHELL_CHARS char appended to 10.0 is rejected",
        unsafeAlphabet.every((c) => validateTizenVersion(`10.0${c}x`).error),
        true,
      );
    }

    // --- listInstalledPlatformVersions ------------------------------------------
    console.log("\n--- listInstalledPlatformVersions ---");
    const sdkPath = path.join(sandboxHome, "tizen-sdk");
    check("missing SDK → []", listInstalledPlatformVersions(sdkPath), []);
    fs.mkdirSync(sdkPath, { recursive: true });
    check("no platforms dir → []", listInstalledPlatformVersions(sdkPath), []);
    for (const d of [
      "tizen-10.0",
      "tizen-9.0",
      "tizen-11.0",
      "tizen-5.5",
      "common",
    ]) {
      fs.mkdirSync(path.join(sdkPath, "platforms", d), { recursive: true });
    }
    // A stray file must not be mistaken for a platform.
    fs.writeFileSync(path.join(sdkPath, "platforms", "tizen-12.0"), "");
    check(
      "tizen-X.Y directories, numeric order, non-platform entries skipped",
      listInstalledPlatformVersions(sdkPath),
      ["5.5", "9.0", "10.0", "11.0"],
    );
    check("empty path → []", listInstalledPlatformVersions(""), []);

    // --- installSdk: malformed version -------------------------------------------
    console.log("\n--- installSdk: malformed version ---");
    {
      const env = await installSdk("99.99.99");
      check("99.99.99 → failure", env.status, "failure");
      check(
        "99.99.99 → invalid_argument",
        env.errors[0].error_category,
        "invalid_argument",
      );
      check(
        "99.99.99 → PARAM_E003",
        env.errors[0].error_code,
        "TIZEN_SDK_PARAM_E003",
      );
      check(
        "99.99.99 → message quotes the value",
        env.errors[0].message.includes('"99.99.99"'),
        true,
      );
      check("99.99.99 → no packages reported", env.result ?? null, null);
      check(
        "malformed version fails before the config file is touched",
        fs.existsSync(CONFIG_FILE),
        false,
      );
    }

    // --- installSdk: installed SDK, requested version ----------------------------
    console.log("\n--- installSdk: installed SDK ---");
    fs.writeFileSync(CONFIG_FILE, `${sdkPath}\n`);
    fs.writeFileSync(
      path.join(sdkPath, "sdk.info"),
      `TIZEN_SDK_INSTALLED_PATH=${sdkPath}\nTIZEN_SDK_DATA_PATH=${sdkPath}-data\n`,
    );
    {
      const env = await installSdk("99.0");
      check(
        "99.0 (well-formed, not installed) → failure",
        env.status,
        "failure",
      );
      check(
        "99.0 → platform_version_not_found",
        env.errors[0].error_category,
        "platform_version_not_found",
      );
      check(
        "99.0 → PLATFORM_E001",
        env.errors[0].error_code,
        "TIZEN_SDK_PLATFORM_E001",
      );
      check(
        "99.0 → message lists the installed platforms",
        env.errors[0].message.includes("5.5, 9.0, 10.0, 11.0") &&
          env.errors[0].message.includes("TIZEN-99.0"),
        true,
      );
      check(
        "99.0 → suggested_fix points at platform-install for that version",
        env.errors[0].suggested_fix.command,
        "tizen-cli tizen-sdk platform-install --platform-version 99.0",
      );
    }
    {
      const env = await installSdk("10.0");
      check("10.0 (installed) → success", env.status, "success");
      check(
        "10.0 → packages report the requested version",
        env.result.packages.every((p) => p.version === "10.0"),
        true,
      );
    }
    {
      const env = await installSdk("");
      check("no version → success", env.status, "success");
      check(
        "no version → packages report the newest installed platform",
        env.result.packages.every((p) => p.version === "11.0"),
        true,
      );
    }
    {
      const env = await installSdk();
      check("omitted version → success (auto)", env.status, "success");
    }
    {
      // Directory-name matching is case-insensitive (tizen-X.Y is the
      // installer's spelling, but a hand-copied "Tizen-13.0" still counts).
      fs.mkdirSync(path.join(sdkPath, "platforms", "Tizen-13.0"));
      const env = await installSdk("13.0");
      check(
        "Tizen-13.0 directory satisfies --tizen-version 13.0",
        env.status,
        "success",
      );
      fs.rmSync(path.join(sdkPath, "platforms", "Tizen-13.0"), {
        recursive: true,
      });
    }
    {
      // sdk.info present but no platforms/ directory at all: an explicit
      // version cannot be verified, so it is reported missing (not success),
      // and the message says why.
      const bareSdk = path.join(sandboxHome, "bare-sdk");
      fs.mkdirSync(bareSdk);
      fs.writeFileSync(
        path.join(bareSdk, "sdk.info"),
        `TIZEN_SDK_INSTALLED_PATH=${bareSdk}\n`,
      );
      fs.writeFileSync(CONFIG_FILE, `${bareSdk}\n`);
      const env = await installSdk("10.0");
      check("no platforms/ dir + 10.0 → failure", env.status, "failure");
      check(
        "no platforms/ dir → platform_version_not_found",
        env.errors[0].error_category,
        "platform_version_not_found",
      );
      check(
        "no platforms/ dir → message explains the empty list",
        env.errors[0].message.includes(
          "no platforms/tizen-X.Y directory found",
        ),
        true,
      );
      const auto = await installSdk("");
      check(
        "no platforms/ dir, no version → still success (nothing to verify)",
        auto.status,
        "success",
      );
      check(
        "no platforms/ dir, no version → neutral version label",
        auto.result.packages.every((p) => p.version === "installed"),
        true,
      );
      fs.writeFileSync(CONFIG_FILE, `${sdkPath}\n`);
    }

    // --- sdkInstallerFlags: order and quoting ----------------------------------
    console.log("\n--- sdkInstallerFlags ---");
    {
      const full = sdkInstallerFlags({
        sdkPath: "C:\\Users\\me\\tizen-sdk",
        version: "10.0",
        force: true,
        downloadJobs: "6",
      });
      check(
        "win: -Path, -Platform, -Force, -DownloadJobs in installer order",
        full.win,
        [
          '-Path "C:/Users/me/tizen-sdk"',
          '-Platform "10.0"',
          "-Force",
          "-DownloadJobs 6",
        ],
      );
      check(
        "unix: --path, --platform, --force, --download-jobs in installer order",
        full.unix,
        [
          '--path "C:\\Users\\me\\tizen-sdk"',
          '--platform "10.0"',
          "--force",
          "--download-jobs 6",
        ],
      );
      const minimal = sdkInstallerFlags({ sdkPath: "/home/u/tizen-sdk" });
      check(
        "no version / no force → path + default jobs only (installer auto-picks)",
        minimal.unix,
        ['--path "/home/u/tizen-sdk"', "--download-jobs 4"],
      );
      check(
        "no version → no -Platform on Windows either",
        minimal.win.some((f) => f.startsWith("-Platform")),
        false,
      );
      check(
        "empty-string version is treated as none",
        sdkInstallerFlags({ sdkPath: "/s", version: "" }).unix.some((f) =>
          f.startsWith("--platform"),
        ),
        false,
      );
      // The command lines both branches build are the very same arrays.
      check(
        "pkg and suggested_fix command lines are identical for the same inputs",
        full.unix.join(" "),
        sdkInstallerFlags({
          sdkPath: "C:\\Users\\me\\tizen-sdk",
          version: "10.0",
          force: true,
          downloadJobs: "6",
        }).unix.join(" "),
      );
      // Defence in depth: refuses to splice an unvalidated value.
      let threw = null;
      try {
        sdkInstallerFlags({ sdkPath: "/s", version: '10.0"; rm -rf /' });
      } catch (e) {
        threw = e.message;
      }
      check(
        "unvalidated version → throws instead of building a command line",
        typeof threw === "string" && threw.includes("validateTizenVersion"),
        true,
      );
      threw = null;
      try {
        sdkInstallerFlags({ sdkPath: "/s", downloadJobs: "9" });
      } catch (e) {
        threw = e.message;
      }
      check(
        "download-jobs outside 1-8 → throws (normalizeDownloadJobs)",
        typeof threw === "string" && threw.includes("1 to 8"),
        true,
      );
    }

    // --- installSdkFromRepo: malformed version ----------------------------------
    console.log("\n--- installSdkFromRepo: malformed version ---");
    {
      const env = await installSdkFromRepo(
        "http://127.0.0.1:9/never-contacted",
        "99.99.99",
      );
      check("custom repo + 99.99.99 → failure", env.status, "failure");
      check(
        "custom repo + 99.99.99 → invalid_argument",
        env.errors[0].error_category,
        "invalid_argument",
      );
      check(
        "custom repo envelope keeps its own command name",
        env.command,
        "tizen-sdk sdk-install-custom-repo",
      );
    }
    {
      // sdk-install --repo-url delegates; the version check happens first.
      const env = await installSdk(
        "10.0.1",
        "tizen",
        false,
        "http://127.0.0.1:9/never-contacted",
      );
      check(
        "sdk-install --repo-url + 10.0.1 → invalid_argument",
        env.errors[0].error_category,
        "invalid_argument",
      );
    }

    // --- installPlatform: malformed version --------------------------------------
    console.log("\n--- installPlatform: malformed version ---");
    {
      const env = await installPlatform("99.99.99");
      check("platform-install 99.99.99 → failure", env.status, "failure");
      check(
        "platform-install 99.99.99 → invalid_argument",
        env.errors[0].error_category,
        "invalid_argument",
      );
      check(
        "platform-install 99.99.99 → message quotes the value",
        env.errors[0].message.includes('"99.99.99"') &&
          env.errors[0].message.includes("MAJOR.MINOR"),
        true,
      );
      check(
        "platform-install → no 'omit the version' hint (version is required)",
        env.errors[0].message.includes("Omit the version"),
        false,
      );
      check(
        "platform-install envelope keeps its own command name",
        env.command,
        "tizen-sdk platform-install",
      );
    }
    {
      // The "missing" message must still win over the syntax message.
      const env = await installPlatform("");
      check(
        "platform-install without a version → invalid_argument (missing)",
        env.errors[0].error_category === "invalid_argument" &&
          env.errors[0].message.startsWith("Missing required option"),
        true,
      );
    }

    // --- source guard: version forwarded to the installer ------------------------
    console.log("\n--- source guard ---");
    {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../core/sdk.js"),
        "utf-8",
      );
      const body = src.slice(
        src.indexOf("async function installSdk("),
        src.indexOf("function buildScriptCommand("),
      );
      check(
        "installSdk builds its installer arguments via sdkInstallerFlags()",
        /sdkInstallerFlags\(\{\s*sdkPath,\s*version,\s*force,\s*downloadJobs,?\s*\}\)/.test(
          body,
        ),
        true,
      );
      check(
        "installSdk: both branches join the same winFlags / unixFlags",
        (body.match(/winFlags\.join\(" "\)/g) || []).length === 2 &&
          (body.match(/unixFlags\.join\(" "\)/g) || []).length === 2,
        true,
      );
      const flagsBody = src.slice(
        src.indexOf("function sdkInstallerFlags("),
        src.indexOf("function installerFix("),
      );
      check(
        "sdkInstallerFlags forwards the version as -Platform / --platform",
        /win\.push\(`-Platform "\$\{version\}"`\)/.test(flagsBody) &&
          /unix\.push\(`--platform "\$\{version\}"`\)/.test(flagsBody),
        true,
      );
      check(
        "TIZEN_VERSION_RE is an ASCII whitelist without the m flag",
        /const TIZEN_VERSION_RE = \/\^\[0-9\]\+\\\.\[0-9\]\+\$\/;/.test(src),
        true,
      );
      check(
        "installSdk --repo-url hands the version to installSdkFromRepo",
        /installSdkFromRepo\(repoUrl, version, force, downloadJobs\)/.test(
          body,
        ),
        true,
      );
    }
  } finally {
    console.error = realConsoleError;
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserprofile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserprofile;
    fs.rmSync(sandboxHome, { recursive: true, force: true });
  }

  console.log(
    `\n${failures === 0 ? "All sdk-install --tizen-version tests passed" : `${failures} FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error = realConsoleError;
  console.error(e);
  process.exit(1);
});
