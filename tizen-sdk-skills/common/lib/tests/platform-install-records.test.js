// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * .platform-installed — the record of the platforms the user installed.
 *
 * The directories under platforms/ cannot say which versions the user asked
 * for: the TV extension lays down tv / tv-samsung for 2.4 … 9.0 next to the
 * one TV version it is for. Every installer appends a block to the record,
 * and sdk-install result.packages / platform-install --list read it.
 *
 * Covered here:
 *   - readPlatformRecords: Profile / Installed by / Source, a block from
 *     before the Profile line, a BOM and CRLF line ends
 *   - installedPlatformEntries / installedPackageSummary on the layout of a
 *     real SDK (TIZEN-10.0, TIZEN-11.0 and the 10.0 TV extension installed,
 *     tv folders for 2.4 … 9.0 bundled): only 10.0 and 11.0, as "Tizen SDK X.Y"
 *   - TV versions from ZIPs side by side; a record whose folders are gone
 *   - installTvSdkFromZip pre-check: a recorded ZIP / --tv-version is
 *     installed, another TV version is not, an invalid --tv-version is refused
 *   - bash (skipped on win32): platform_records reads the same as
 *     readPlatformRecords, record_platform_install appends once,
 *     platform_installed leaves the TV folders out, migrate_tv_sdk_marker,
 *     and tizen-tv-sdk-install-from-zip.sh end to end (when zip/unzip exist)
 *   - .ps1 sources: every installer records through Add-PlatformRecord
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const sandboxHome = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-platform-records-home-"),
);
const savedHome = process.env.HOME;
const savedUserprofile = process.env.USERPROFILE;
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;

// Must come AFTER the env redirect: CONFIG_FILE is computed at require time.
const {
  CONFIG_FILE,
  readPlatformRecords,
  installedPlatformEntries,
  installedPackageSummary,
  isTizenPlatformInstalled,
  isPlatformInstalled,
  isTvVersionRecorded,
  installTvSdkFromZip,
} = require("../core/sdk");

console.log("=== platform install record tests ===\n");

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

const realConsoleError = console.error;
console.error = () => {};

const scriptsDir = path.join(__dirname, "..", "..", "scripts");
const read = (...p) => fs.readFileSync(path.join(scriptsDir, ...p), "utf8");
const bashOk =
  process.platform !== "win32" && spawnSync("bash", ["--version"]).status === 0;

const block = (lines) =>
  ["Platform package installed at 2026-11-03T10:00:00+0900", ...lines]
    .map((l) => `${l}\n`)
    .join("");

/** An SDK laid out like the one in the bug report. */
function makeReportedSdk(root) {
  const mk = (...p) => fs.mkdirSync(path.join(root, ...p), { recursive: true });
  mk("tools");
  mk("platforms", "tizen-2.4", "tv", "x");
  mk("platforms", "tizen-2.4", "tv-samsung-public", "x");
  for (const v of ["3.0", "4.0", "5.0", "5.5", "6.0", "6.5", "8.0", "9.0"]) {
    mk("platforms", `tizen-${v}`, "tv", "x");
    mk("platforms", `tizen-${v}`, "tv-samsung", "x");
  }
  mk("platforms", "tizen-7.0", "iot-headed", "x");
  mk("platforms", "tizen-7.0", "tv", "x");
  mk("platforms", "tizen-7.0", "tv-samsung", "x");
  mk("platforms", "tizen-10.0", "tizen", "rootstraps");
  mk("platforms", "tizen-10.0", "tv-samsung", "rootstraps");
  mk("platforms", "tizen-11.0", "tizen", "rootstraps");
  fs.writeFileSync(path.join(root, "sdk.info"), "TIZEN_SDK_INSTALLED_PATH=x\n");
  // platform-install TIZEN-10.0 wrote this (before the Profile line existed);
  // the base install (11.0) and the online TV install wrote no record.
  fs.writeFileSync(
    path.join(root, ".platform-installed"),
    "Platform package installed at 2026-09-29T21:26:29.1166874+09:00\n" +
      "Target: TIZEN-10.0\nPlatform version: 10.0\n",
  );
  fs.writeFileSync(
    path.join(root, ".tv-sdk-installed"),
    "TV SDK installed at 2026-09-01T10:00:00+09:00\n",
  );
}

(async () => {
  try {
    console.log("--- readPlatformRecords ---");
    {
      const sdk = path.join(sandboxHome, "parse-sdk");
      fs.mkdirSync(sdk, { recursive: true });
      check("no file → []", readPlatformRecords(sdk), []);
      // Windows PowerShell 5.1's Add-Content starts the file with a BOM;
      // a file edited on Windows may have CRLF line ends.
      const text =
        "\uFEFF" +
        block(["Target: TIZEN-10.0", "Platform version: 10.0"]) +
        block([
          "Target: TV-SAMSUNG ZIP",
          "Platform version: 9.0",
          "Profile: tv-samsung",
          "Installed by: tv-sdk-install-from-zip",
          "Source: C:\\Users\\me\\tv-9.0.zip",
        ]).replace(/\n/g, "\r\n") +
        block([
          "Target: TIZEN-7.0",
          "Platform version: 7.0",
          "Profile: mobile, wearable",
        ]) +
        block(["Target: TIZEN-x", "Platform version: latest"]);
      fs.writeFileSync(path.join(sdk, ".platform-installed"), text);
      check(
        "blocks, an old block's profile from its Target, a list, a bad version skipped",
        readPlatformRecords(sdk).map((r) => [
          r.version,
          r.profiles,
          r.installedBy,
          r.source,
        ]),
        [
          ["10.0", ["tizen"], "", ""],
          [
            "9.0",
            ["tv-samsung"],
            "tv-sdk-install-from-zip",
            "C:\\Users\\me\\tv-9.0.zip",
          ],
          ["7.0", ["mobile", "wearable"], "", ""],
        ],
      );
    }

    console.log("--- the reported SDK ---");
    const reported = path.join(sandboxHome, "reported-sdk");
    makeReportedSdk(reported);
    {
      check(
        "only the installed versions, as Tizen SDK X.Y, no tools row",
        installedPackageSummary(reported, ""),
        [
          {
            name: "Tizen SDK 10.0",
            status: "installed",
            version: "10.0",
            profiles: ["tizen", "tv-samsung"],
          },
          {
            name: "Tizen SDK 11.0",
            status: "installed",
            version: "11.0",
            profiles: ["tizen"],
          },
        ],
      );
      check(
        "a bundled tv folder is not TIZEN-9.0 itself (installer check)",
        isTizenPlatformInstalled(reported, "9.0"),
        false,
      );
      check(
        "… but create-project may still use it",
        isPlatformInstalled(reported, "9.0"),
        true,
      );
      check(
        "the old online TV install counts for 10.0 only",
        [
          isTvVersionRecorded(reported, "10.0"),
          isTvVersionRecorded(reported, "9.0"),
        ],
        [true, false],
      );
    }

    console.log("--- TV versions from ZIPs side by side ---");
    {
      fs.mkdirSync(
        path.join(reported, "platforms", "tizen-11.0", "tv-samsung", "x"),
        {
          recursive: true,
        },
      );
      // The TV installers first turn the old marker into a record
      // (migrate_tv_sdk_marker / Convert-TvSdkMarkerToRecord) — the guess
      // from the marker stops once any TV version is recorded.
      fs.appendFileSync(
        path.join(reported, ".platform-installed"),
        block([
          "Target: TV-SAMSUNG-Public",
          "Platform version: 10.0",
          "Profile: tv-samsung",
          "Installed by: tv-sdk-install",
        ]) +
          block([
            "Target: TV-SAMSUNG ZIP",
            "Platform version: 9.0",
            "Profile: tv-samsung",
            "Installed by: tv-sdk-install-from-zip",
            `Source: ${path.join(sandboxHome, "tv-9.0.zip")}`,
          ]) +
          block([
            "Target: TV-SAMSUNG ZIP",
            "Platform version: 11.0",
            "Profile: tv-samsung",
            "Installed by: tv-sdk-install-from-zip",
            `Source: ${path.join(sandboxHome, "tv-11.0.zip")}`,
          ]),
      );
      check(
        "TV 9.0 and 11.0 join; 9.0 shows tv-samsung, not the bundled tv folder",
        installedPlatformEntries(reported).map((e) => [
          e.version,
          e.status,
          e.profiles,
        ]),
        [
          ["9.0", "installed", ["tv-samsung"]],
          ["10.0", "installed", ["tizen", "tv-samsung"]],
          ["11.0", "installed", ["tizen", "tv-samsung"]],
        ],
      );
      check(
        "each recorded TV version counts on its own",
        ["9.0", "10.0", "11.0", "8.0"].map((v) =>
          isTvVersionRecorded(reported, v),
        ),
        [true, true, true, false],
      );
      fs.rmSync(path.join(reported, "platforms", "tizen-9.0", "tv-samsung"), {
        recursive: true,
      });
      check(
        "a recorded version whose folders are gone → not_installed",
        installedPlatformEntries(reported)[0],
        { version: "9.0", status: "not_installed", profiles: ["tv-samsung"] },
      );
    }

    console.log("--- installTvSdkFromZip pre-check ---");
    {
      fs.writeFileSync(CONFIG_FILE, `${reported}\n`);
      const zip9 = path.join(sandboxHome, "tv-9.0.zip");
      const byPath = await installTvSdkFromZip(zip9, false, "t", "");
      check(
        "the recorded ZIP → already installed (its TV version)",
        [byPath.status, (byPath.result?.packages || []).map((p) => p.version)],
        ["success", ["9.0"]],
      );
      const byVersion = await installTvSdkFromZip(
        path.join(sandboxHome, "another.zip"),
        false,
        "t",
        "11.0",
      );
      check(
        "--tv-version of a recorded TV version → already installed",
        byVersion.status,
        "success",
      );
      const other = await installTvSdkFromZip(
        path.join(sandboxHome, "tv-8.0.zip"),
        false,
        "t",
        "8.0",
      );
      check(
        "another TV version → the installer command, with --tv-version",
        [
          other.status,
          /--tv-version=8\.0|-TvVersion 8\.0/.test(
            JSON.stringify(other.errors?.[0]?.suggested_fix || ""),
          ),
        ],
        ["failure", true],
      );
      const bad = await installTvSdkFromZip(zip9, false, "t", "9;rm");
      check(
        "an invalid --tv-version → invalid_parameters",
        bad.errors?.[0]?.error_category,
        "invalid_parameters",
      );
    }

    console.log("--- bash ---");
    if (!bashOk) {
      console.log("SKIP bash checks (win32 or no bash)");
    } else {
      const common = path.join(scriptsDir, "lib", "common.sh");
      const sh = (script, ...args) =>
        spawnSync(
          "bash",
          [
            "-c",
            `set -euo pipefail; source "$1" >/dev/null 2>&1; shift; ${script}`,
            "_",
            common,
            ...args,
          ],
          { encoding: "utf8" },
        );
      {
        const sdk = path.join(sandboxHome, "parse-sdk");
        const flat = readPlatformRecords(sdk).flatMap((r) =>
          r.profiles.map((p) => `${r.version} ${p}`),
        );
        check(
          "platform_records reads what readPlatformRecords reads (BOM, CRLF, old block)",
          sh('platform_records "$1"', sdk).stdout.trim().split("\n"),
          flat,
        );
      }
      {
        const sdk = path.join(sandboxHome, "record-sdk");
        fs.mkdirSync(
          path.join(sdk, "platforms", "tizen-11.0", "tizen", "rootstraps"),
          {
            recursive: true,
          },
        );
        // A last block without a newline must not swallow the next one.
        fs.writeFileSync(
          path.join(sdk, ".platform-installed"),
          "Platform package installed at x\nTarget: TIZEN-10.0\nPlatform version: 10.0",
        );
        sh(
          'record_platform_install "$1" TIZEN-11.0 11.0 "$(platform_install_profiles "$1" 11.0)" sdk-install https://repo; ' +
            'record_platform_install "$1" TIZEN-11.0 11.0 tizen sdk-install https://repo',
          sdk,
        );
        check(
          "record_platform_install appends once, after a newline",
          readPlatformRecords(sdk).map((r) => [
            r.version,
            r.profiles,
            r.installedBy,
            r.source,
          ]),
          [
            ["10.0", ["tizen"], "", ""],
            ["11.0", ["tizen"], "sdk-install", "https://repo"],
          ],
        );
      }
      check(
        "platform_installed leaves the TV folders out, as isTizenPlatformInstalled",
        sh(
          'for v in 9.0 10.0 11.0; do platform_installed "$1" "$v" && echo "$v yes" || echo "$v no"; done',
          reported,
        )
          .stdout.trim()
          .split("\n"),
        ["9.0", "10.0", "11.0"].map(
          (v) => `${v} ${isTizenPlatformInstalled(reported, v) ? "yes" : "no"}`,
        ),
      );
      {
        const sdk = path.join(sandboxHome, "migrate-sdk");
        makeReportedSdk(sdk);
        sh('migrate_tv_sdk_marker "$1"; migrate_tv_sdk_marker "$1"', sdk);
        check(
          "migrate_tv_sdk_marker records the old online TV install once (10.0)",
          readPlatformRecords(sdk)
            .filter((r) => r.profiles.includes("tv-samsung"))
            .map((r) => [r.version, r.installedBy]),
          [["10.0", "tv-sdk-install"]],
        );
        check(
          "… and the report stays the same",
          installedPackageSummary(sdk, "").map((p) => [p.version, p.profiles]),
          [
            ["10.0", ["tizen", "tv-samsung"]],
            ["11.0", ["tizen"]],
          ],
        );
      }

      const haveZip =
        spawnSync("zip", ["-v"]).status === 0 &&
        spawnSync("unzip", ["-v"]).status === 0;
      if (!haveZip) {
        console.log("SKIP ZIP installer run (zip/unzip not found)");
      } else {
        const sdk = path.join(sandboxHome, "zip-sdk");
        makeReportedSdk(sdk);
        const build = path.join(sandboxHome, "zip-build");
        const zips = {};
        for (const v of ["9.0", "11.0"]) {
          const inner = path.join(build, `in-${v}`);
          const outer = path.join(build, `out-${v}`, "binary");
          fs.mkdirSync(
            path.join(
              inner,
              "data",
              "platforms",
              `tizen-${v}`,
              "tv-samsung",
              "rootstraps",
            ),
            {
              recursive: true,
            },
          );
          fs.writeFileSync(
            path.join(
              inner,
              "data",
              "platforms",
              `tizen-${v}`,
              "tv-samsung",
              "rootstraps",
              "f",
            ),
            "x",
          );
          fs.mkdirSync(outer, { recursive: true });
          for (const name of [
            `tv-samsung-public-platform_${v}.12.zip`,
            `tv-samsung-public-web_${v}.3.zip`,
          ]) {
            spawnSync("zip", ["-qr", path.join(outer, name), "data"], {
              cwd: inner,
            });
          }
          zips[v] = path.join(build, `tv-${v}.zip`);
          spawnSync("zip", ["-qr", zips[v], "binary"], {
            cwd: path.dirname(outer),
          });
        }
        const zipSh = path.join(
          scriptsDir,
          "tizen-tv-sdk-install-from-zip",
          "tizen-tv-sdk-install-from-zip.sh",
        );
        const run = (...args) =>
          spawnSync("bash", [zipSh, `--sdk-path=${sdk}`, ...args], {
            encoding: "utf8",
          });
        const before = fs.readFileSync(
          path.join(sdk, ".tv-sdk-installed"),
          "utf8",
        );
        const mismatch = run(`--zip-path=${zips["9.0"]}`, "--tv-version=11.0");
        check(
          "ZIP: --tv-version that does not match → exit 2, nothing extracted",
          [
            mismatch.status,
            fs.existsSync(
              path.join(
                sdk,
                "platforms",
                "tizen-9.0",
                "tv-samsung",
                "rootstraps",
              ),
            ),
            fs.readFileSync(path.join(sdk, ".tv-sdk-installed"), "utf8"),
          ],
          [2, false, before],
        );
        const nine = run(`--zip-path=${zips["9.0"]}`);
        const eleven = run(
          `--zip-path=${zips["11.0"]}`,
          "--tv-version",
          "11.0",
        );
        check(
          "ZIP: TV 9.0 then TV 11.0 → both exit 0",
          [nine.status, eleven.status],
          [0, 0],
        );
        check(
          "ZIP: both recorded with their ZIP, the old online TV install kept",
          readPlatformRecords(sdk)
            .filter((r) => r.profiles.includes("tv-samsung"))
            .map((r) => [r.version, r.installedBy, r.source]),
          [
            ["10.0", "tv-sdk-install", ""],
            ["9.0", "tv-sdk-install-from-zip", zips["9.0"]],
            ["11.0", "tv-sdk-install-from-zip", zips["11.0"]],
          ],
        );
        const again = run(`--zip-path=${zips["9.0"]}`);
        check(
          "ZIP: the same TV version again → skipped",
          [again.status, /already installed/.test(again.stdout + again.stderr)],
          [0, true],
        );
        check(
          "ZIP: --status after the run → done",
          run("--status").stdout.trim(),
          "STATUS=done EXIT=0",
        );
        check(
          "ZIP: the report lists 9.0, 10.0 and 11.0 with their TV profiles",
          installedPackageSummary(sdk, "").map((p) => [p.version, p.profiles]),
          [
            ["9.0", ["tv-samsung"]],
            ["10.0", ["tizen", "tv-samsung"]],
            ["11.0", ["tizen", "tv-samsung"]],
          ],
        );
      }
    }

    console.log("--- .ps1 sources ---");
    {
      const sdkPs1 = read("tizen-sdk-install", "tizen-sdk-install.ps1");
      const platPs1 = read(
        "tizen-platform-install",
        "tizen-platform-install.ps1",
      );
      const tvPs1 = read("tizen-tv-sdk-install", "tizen-tv-sdk-install.ps1");
      const zipPs1 = read(
        "tizen-tv-sdk-install-from-zip",
        "tizen-tv-sdk-install-from-zip.ps1",
      );
      check(
        "every installer records through Add-PlatformRecord",
        [
          /-InstalledBy "sdk-install"/.test(sdkPs1),
          /-InstalledBy "platform-install"/.test(platPs1),
          /-InstalledBy "tv-sdk-install"/.test(tvPs1),
          /-InstalledBy "tv-sdk-install-from-zip"/.test(zipPs1),
        ],
        [true, true, true, true],
      );
      check(
        "both TV installers migrate the old marker and skip per TV version",
        [tvPs1, zipPs1].map(
          (s) =>
            /Convert-TvSdkMarkerToRecord -SdkPath \$SdkPath/.test(s) &&
            /Test-TvVersionRecorded -SdkPath \$SdkPath/.test(s) &&
            !/if \(\(Test-Path \$tvSdkMarkerPath\) -and -not \$Force\)/.test(s),
        ),
        [true, true],
      );
      check(
        "ZIP .ps1 takes -TvVersion, validates it and forwards it to -Detach",
        /\[string\]\$TvVersion = ""/.test(zipPs1) &&
          /\$TvVersion -notmatch '\^\[0-9\]\+\\\.\[0-9\]\+\$'/.test(zipPs1) &&
          /\$argList \+= @\("-TvVersion", \$TvVersion\)/.test(zipPs1),
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
    `\n${failures === 0 ? "All platform install record tests passed" : `${failures} FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
