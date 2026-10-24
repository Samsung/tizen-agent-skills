// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Several Tizen platform versions side by side (e.g. 10.0 + 9.0).
 *
 * The base SDK ships platforms/tizen-X.Y/common (features, privileges) for
 * older API versions too, so a directory alone does not mean TIZEN-X.Y is
 * installed; .platform-installed held one version and was overwritten by the
 * next install; and create-project / list-templates always used the newest
 * platform.
 *
 * Covered here:
 *   - isPlatformInstalled / listFullyInstalledPlatformVersions: a profile
 *     besides "common", and no .platform-installing-X.Y marker
 *   - listPlatforms (platform-install-cli.js --list, tizen-cli platform-list)
 *   - installPlatform pre-check per version (other versions do not matter)
 *   - create-project / list-templates --platform-version validation and the
 *     --tz-profile / -TzProfile hand-off to the scripts
 *   - tizen-platform-install.{sh,ps1}: in-progress marker, history append,
 *     no wholesale marker removal on --force; platform_installed in bash
 *     (bash behaviour skipped on win32)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const sandboxHome = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-multi-platform-home-"),
);
const savedHome = process.env.HOME;
const savedUserprofile = process.env.USERPROFILE;
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;

// Must come AFTER the env redirect: CONFIG_FILE is computed at require time.
const {
  CONFIG_FILE,
  isPlatformInstalled,
  listFullyInstalledPlatformVersions,
  listPlatforms,
  installPlatform,
} = require("../core/sdk");
const {
  listTemplates,
  createProject,
  platformVersionArgs,
} = require("../core/project");

console.log("=== multi-platform tests ===\n");

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

// A fake SDK: 9.0 has only the shared "common" data, 10.0 is installed (with
// the TV extension and an emulator image), 11.0 is an unfinished install.
const sdkPath = path.join(sandboxHome, "tizen-sdk");
const mk = (...p) =>
  fs.mkdirSync(path.join(sdkPath, ...p), { recursive: true });
mk("platforms", "tizen-9.0", "common");
// What tizen-create-project's template sync leaves behind for a version whose
// platform was never installed: it must not make 9.0 look installed.
mk("platforms", "tizen-9.0", "tizen", "samples", "Template");
mk("platforms", "tizen-10.0", "common");
mk("platforms", "tizen-10.0", "tizen", "emulator-images", "tizen-10.0-x86_64");
mk("platforms", "tizen-10.0", "tv-samsung");
mk("platforms", "tizen-11.0", "tizen", "rootstraps");
fs.writeFileSync(path.join(sdkPath, ".platform-installing-11.0"), "");
fs.writeFileSync(
  path.join(sdkPath, "sdk.info"),
  "TIZEN_SDK_INSTALLED_PATH=x\n",
);
fs.writeFileSync(CONFIG_FILE, `${sdkPath}\n`);

(async () => {
  try {
    console.log("--- isPlatformInstalled ---");
    check(
      "common + synced samples only → not installed",
      isPlatformInstalled(sdkPath, "9.0"),
      false,
    );
    check(
      "profile besides common → installed",
      isPlatformInstalled(sdkPath, "10.0"),
      true,
    );
    check(
      "in-progress marker → not installed",
      isPlatformInstalled(sdkPath, "11.0"),
      false,
    );
    check(
      "missing directory → not installed",
      isPlatformInstalled(sdkPath, "8.0"),
      false,
    );
    check(
      "listFullyInstalledPlatformVersions keeps only installed ones",
      listFullyInstalledPlatformVersions(sdkPath),
      ["10.0"],
    );

    console.log("--- listPlatforms ---");
    {
      const env = await listPlatforms();
      check("status success", env.status, "success");
      check(
        "one entry per directory, oldest first, with its status",
        env.result.platforms.map((p) => [p.version, p.status]),
        [
          ["9.0", "not_installed"],
          ["10.0", "installed"],
          ["11.0", "incomplete"],
        ],
      );
      const p10 = env.result.platforms[1];
      check("10.0 profiles", p10.profiles, ["common", "tizen", "tv-samsung"]);
      check("10.0 emulator images", p10.emulator_images, [
        { profile: "tizen", image: "tizen-10.0-x86_64" },
      ]);
      check(
        "newest is the newest installed version",
        env.result.newest,
        "10.0",
      );
      check(
        "incomplete version gets a resume warning",
        (env.warnings || []).some((w) => w.includes("TIZEN-11.0")),
        true,
      );
    }
    {
      const bare = path.join(sandboxHome, "no-sdk");
      fs.mkdirSync(bare);
      fs.writeFileSync(CONFIG_FILE, `${bare}\n`);
      const env = await listPlatforms();
      check("no SDK → failure", env.status, "failure");
      check(
        "no SDK → sdk_path_invalid",
        env.errors[0].error_category,
        "sdk_path_invalid",
      );
      fs.writeFileSync(CONFIG_FILE, `${sdkPath}\n`);
    }

    console.log("--- installPlatform pre-check ---");
    {
      const env = await installPlatform("10.0");
      check("installed 10.0 → success", env.status, "success");
    }
    for (const v of ["9.0", "11.0"]) {
      const env = await installPlatform(v);
      check(`${v} → failure (install needed)`, env.status, "failure");
      check(
        `${v} → suggested_fix installs that version`,
        String(env.errors[0].suggested_fix.command).includes(
          `--platform-version="${v}"`,
        ),
        true,
      );
    }
    {
      const env = await installPlatform("10.0", true);
      check("--force on 10.0 → install command", env.status, "failure");
      check(
        "--force reaches the installer",
        String(env.errors[0].suggested_fix.command).includes("--force"),
        true,
      );
    }

    console.log("--- create-project / list-templates --platform-version ---");
    {
      const env = await listTemplates(
        "webapp",
        "tizen-sdk list-templates",
        "9.0",
      );
      check(
        "list-templates 9.0 (common only) → failure",
        env.status,
        "failure",
      );
      check(
        "→ platform_version_not_found",
        env.errors[0].error_category,
        "platform_version_not_found",
      );
      check(
        "→ names the installed platforms and the install command",
        env.errors[0].message.includes("installed platforms: 10.0") &&
          env.errors[0].suggested_fix.command ===
            "tizen-sdk platform-install --platform-version 9.0",
        true,
      );
    }
    {
      const env = await listTemplates(
        "webapp",
        "tizen-sdk list-templates",
        "9",
      );
      check(
        "list-templates 9 → invalid_argument",
        env.errors[0].error_category,
        "invalid_argument",
      );
    }
    {
      const parent = path.join(sandboxHome, "ws");
      fs.mkdirSync(parent);
      const env = await createProject(
        "webapp",
        "Basic",
        parent,
        "MyTizenWebApp",
        false,
        "tizen-sdk create-project",
        false,
        "11.0",
      );
      check(
        "create 11.0 (incomplete) → platform_version_not_found",
        env.errors[0].error_category,
        "platform_version_not_found",
      );
      check(
        "nothing was created",
        fs.existsSync(path.join(parent, "MyTizenWebApp")),
        false,
      );
    }
    {
      // No --platform-version: pin the newest INSTALLED platform (result.newest),
      // not the highest `tz list templates` section, which also lists versions
      // that hold only "common".
      const dflt = platformVersionArgs("", "tizen-sdk list-templates", 0);
      check(
        "default pins the newest installed platform",
        [dflt.unix, dflt.win],
        [" --tz-profile=tizen-10.0", ' -TzProfile "tizen-10.0"'],
      );
      const explicit = platformVersionArgs(
        "10.0",
        "tizen-sdk list-templates",
        0,
      );
      check(
        "explicit version is pinned strictly (TV may not fall back)",
        [explicit.unix, explicit.win],
        [
          " --tz-profile=tizen-10.0 --strict-profile",
          ' -TzProfile "tizen-10.0" -StrictProfile',
        ],
      );
      const bare = path.join(sandboxHome, "no-platform-sdk");
      fs.mkdirSync(bare);
      fs.writeFileSync(CONFIG_FILE, `${bare}\n`);
      const none = platformVersionArgs("", "tizen-sdk list-templates", 0);
      check(
        "nothing installed → no pin (the script's own detection decides)",
        [none.unix, none.win],
        ["", ""],
      );
      fs.writeFileSync(CONFIG_FILE, `${sdkPath}\n`);
    }
    {
      const src = fs.readFileSync(
        path.join(__dirname, "..", "core", "project.js"),
        "utf8",
      );
      check(
        "project.js hands the version to the scripts as --tz-profile / -TzProfile",
        /--tz-profile=tizen-\$\{version\}/.test(src) &&
          /-TzProfile "tizen-\$\{version\}"/.test(src) &&
          (src.match(/\$\{versionArgs\.unix\}/g) || []).length === 2 &&
          (src.match(/\$\{versionArgs\.win\}/g) || []).length === 2,
        true,
      );
      const sh = read("tizen-create-project", "create-project-app.sh");
      const ps1 = read("tizen-create-project", "create-project-app.ps1");
      check(
        "create-project-app.sh takes --tz-profile",
        /--tz-profile=\*\)\s+TZ_PROFILE="\$\{1#\*=\}"/.test(sh),
        true,
      );
      check(
        "create-project-app.ps1 takes -TzProfile ahead of TIZEN_TZ_PROFILE",
        /\[string\]\$TzProfile/.test(ps1) &&
          /\$TZ_PROFILE = if \(\$TzProfile\) \{ \$TzProfile \} elseif \(\$env:TIZEN_TZ_PROFILE\)/.test(
            ps1,
          ),
        true,
      );
    }

    console.log("--- tizen-platform-install.{sh,ps1} ---");
    {
      const sh = read("tizen-platform-install", "tizen-platform-install.sh");
      const ps1 = read("tizen-platform-install", "tizen-platform-install.ps1");
      check(
        "sh: skips only when THIS version is installed",
        (
          sh.match(/platform_installed "\$SDK_PATH" "\$PLATFORM_VERSION"/g) ||
          []
        ).length,
        2,
      );
      check(
        "ps1: skips only when THIS version is installed",
        (
          ps1.match(
            /Test-PlatformInstalled -SdkPath \$SdkPath -Version \$PlatformVersion/g,
          ) || []
        ).length,
        2,
      );
      check(
        "sh: in-progress marker written after the dry-run exit, removed on success",
        sh.indexOf('> "$PLATFORM_INSTALLING_MARKER"') >
          sh.indexOf('if [[ "$DRY_RUN" == "true" ]]') &&
          /rm -f "\$PLATFORM_INSTALLING_MARKER"/.test(sh),
        true,
      );
      check(
        "ps1: in-progress marker written after the dry-run exit, removed on success",
        ps1.indexOf("Set-Content -Path $platformInstallingMarkerPath") >
          ps1.indexOf("if ($DryRun) {") &&
          /Remove-Item \$platformInstallingMarkerPath/.test(ps1),
        true,
      );
      check(
        "sh/ps1: history is appended once per version, never rewritten or wiped",
        /grep -qxF "Platform version: \$PLATFORM_VERSION"/.test(sh) &&
          /\} >> "\$PLATFORM_PKG_MARKER"/.test(sh) &&
          !/> "\$PLATFORM_PKG_MARKER"/.test(
            sh.replace(/>> "\$PLATFORM_PKG_MARKER"/g, ""),
          ) &&
          !/rm -f "\$PLATFORM_PKG_MARKER"/.test(sh) &&
          /Add-Content -Path \$platformPkgMarkerPath/.test(ps1) &&
          !/Set-Content -Path \$platformPkgMarkerPath/.test(ps1) &&
          !/Remove-Item \$platformPkgMarkerPath/.test(ps1),
        true,
      );
    }

    {
      const ps1 = read("lib", "common.ps1");
      const fn = ps1.slice(ps1.indexOf("function Test-PlatformInstalled"));
      check(
        "Test-PlatformInstalled skips common, synced samples and the in-progress marker",
        /\$_\.Name -ne 'common'/.test(fn) &&
          /\$_\.Name -ne 'samples'/.test(fn) &&
          /\.platform-installing-\$Version/.test(fn),
        true,
      );
    }

    {
      const cps = read("tizen-create-project", "create-project-app.ps1");
      check(
        "create-project-app.ps1: -StrictProfile limits Detect-TvProfile to the pinned version",
        /\[switch\]\$StrictProfile/.test(cps) &&
          /if \(\$StrictProfile\) \{ \$candidates = @\(\$candidates \| Where-Object \{ \$_ -eq \$wanted \}\) \}/.test(
            cps,
          ),
        true,
      );
    }

    console.log("--- bash ---");
    if (process.platform === "win32") {
      console.log("SKIP bash checks (win32)");
    } else {
      const common = path.join(scriptsDir, "lib", "common.sh");
      const probe = spawnSync(
        "bash",
        [
          "-c",
          'set -euo pipefail; source "$1"; for v in 9.0 10.0 11.0 8.0; do if platform_installed "$2" "$v"; then echo "$v yes"; else echo "$v no"; fi; done',
          "_",
          common,
          sdkPath,
        ],
        { encoding: "utf8" },
      );
      check(
        "platform_installed matches isPlatformInstalled",
        probe.stdout.trim().split("\n"),
        ["9.0 no", "10.0 yes", "11.0 no", "8.0 no"],
      );
      fs.mkdirSync(path.join(sdkPath, ".package"), { recursive: true });
      const run = spawnSync(
        "bash",
        [
          path.join(
            scriptsDir,
            "tizen-platform-install",
            "tizen-platform-install.sh",
          ),
          `--sdk-path=${sdkPath}`,
          "--platform-version=10.0",
        ],
        { encoding: "utf8" },
      );
      check(
        "installer exits 0 at once for an installed version (no download)",
        run.status === 0 &&
          /TIZEN-10\.0 is already installed/.test(run.stderr + run.stdout),
        true,
      );

      // TV profile choice in create-project-app.sh, with a stub `tz` that
      // lists tv-samsung-9.0 and tv-samsung-10.0 (both extensions installed).
      const tvRoot = path.join(sandboxHome, "tv");
      const tvSdk = path.join(tvRoot, "sdk");
      const tvHome = path.join(tvRoot, "home");
      for (const d of [
        ["tools", "tizen-core"],
        ["platforms", "tizen-9.0", "tv-samsung"],
        ["platforms", "tizen-10.0", "tv-samsung"],
      ]) {
        fs.mkdirSync(path.join(tvSdk, ...d), { recursive: true });
      }
      fs.mkdirSync(tvHome);
      fs.writeFileSync(
        path.join(tvHome, ".tizen.sdk.path.config"),
        `${tvSdk}\n`,
      );
      const stub = path.join(tvSdk, "tools", "tizen-core", "tz");
      fs.writeFileSync(
        stub,
        "#!/bin/sh\nprintf 'tizen-10.0:\\n  Basic [web_app]\\ntv-samsung-10.0:\\n  Tv10 [web_app]\\ntv-samsung-9.0:\\n  Tv9 [web_app]\\n'\n",
      );
      fs.chmodSync(stub, 0o755);
      const tvProfile = (...extra) => {
        const r = spawnSync(
          "bash",
          [
            path.join(
              scriptsDir,
              "tizen-create-project",
              "create-project-app.sh",
            ),
            "--list-templates",
            "--type=tv",
            ...extra,
          ],
          { encoding: "utf8", env: { ...process.env, HOME: tvHome } },
        );
        const m = /^TV_PROFILE=(.*)$/m.exec(r.stdout);
        return m
          ? m[1]
          : `none: ${(r.stderr.match(/\[ERROR\][^\n]*/) || [""])[0]}`;
      };
      check(
        "TV: no version → newest TV profile",
        tvProfile(),
        "tv-samsung-10.0",
      );
      check(
        "TV: default pin (--tz-profile only) keeps the newest-first scan",
        tvProfile("--tz-profile=tizen-9.0"),
        "tv-samsung-10.0",
      );
      check(
        "TV: --strict-profile uses the requested version",
        tvProfile("--tz-profile=tizen-9.0", "--strict-profile"),
        "tv-samsung-9.0",
      );
      check(
        "TV: --strict-profile without that TV extension → named error",
        /TV SDK extension is not installed for tizen-8\.0/.test(
          tvProfile("--tz-profile=tizen-8.0", "--strict-profile"),
        ),
        true,
      );

      // The runner's hint, end to end: 9.0 asked for, TV extension on 10.0 only.
      const hintSdk = path.join(sandboxHome, "tv-hint-sdk");
      for (const d of [
        ["tools", "tizen-core"],
        ["platforms", "tizen-9.0", "tizen", "rootstraps"],
        ["platforms", "tizen-10.0", "tizen", "rootstraps"],
        ["platforms", "tizen-10.0", "tv-samsung", "x"],
      ]) {
        fs.mkdirSync(path.join(hintSdk, ...d), { recursive: true });
      }
      fs.writeFileSync(path.join(hintSdk, "sdk.info"), "x=y\n");
      const hintStub = path.join(hintSdk, "tools", "tizen-core", "tz");
      fs.writeFileSync(
        hintStub,
        "#!/bin/sh\nprintf 'tizen-10.0:\\n  Basic [web_app]\\ntizen-9.0:\\n  Basic [web_app]\\ntv-samsung-10.0:\\n  Tv10 [web_app]\\n'\n",
      );
      fs.chmodSync(hintStub, 0o755);
      fs.writeFileSync(CONFIG_FILE, `${hintSdk}\n`);
      const hintEnv = await listTemplates(
        "tv",
        "tizen-sdk list-templates",
        "9.0",
      );
      check(
        "TV hint names the version that lacks the extension and where it is installed",
        hintEnv.status === "failure" &&
          hintEnv.errors[0].message.includes(
            "not installed for TIZEN-9.0 (installed for: 10.0)",
          ),
        true,
      );
      // create --type tv for that version stops BEFORE the script runs, with
      // the same message (it used to end in "Install TV SDK extension first").
      const tvWs = path.join(sandboxHome, "tv-ws");
      fs.mkdirSync(tvWs);
      const tvCreate = await createProject(
        "tv",
        "Tv10",
        tvWs,
        "MyTizenTvAppX",
        false,
        "tizen-sdk create-project",
        false,
        "9.0",
      );
      check(
        "create --type tv for a version without TV → platform_version_not_found naming 10.0",
        tvCreate.status === "failure" &&
          tvCreate.errors[0].error_category === "platform_version_not_found" &&
          tvCreate.errors[0].message.includes(
            "not installed for TIZEN-9.0 (installed for: 10.0)",
          ),
        true,
      );
      check("nothing was created for it", fs.readdirSync(tvWs).length, 0);
      // The extension installed for 9.0 too, but tz lists no TV templates
      // under it: not "not installed" — an incomplete extension.
      fs.mkdirSync(
        path.join(hintSdk, "platforms", "tizen-9.0", "tv-samsung", "x"),
        {
          recursive: true,
        },
      );
      fs.writeFileSync(
        hintStub,
        "#!/bin/sh\nprintf 'tizen-10.0:\\n  Basic [web_app]\\ntizen-9.0:\\n  Basic [web_app]\\ntv-samsung-10.0:\\n  Tv10 [web_app]\\ntv-samsung-9.0:\\n'\n",
      );
      const bothEnv = await listTemplates(
        "tv",
        "tizen-sdk list-templates",
        "9.0",
      );
      check(
        "TV hint for an installed extension without templates says it may be incomplete",
        bothEnv.status === "failure" &&
          bothEnv.errors[0].message.includes(
            "is installed for TIZEN-9.0, but tz lists no TV templates",
          ) &&
          bothEnv.errors[0].message.includes("may target another version") &&
          bothEnv.errors[0].message.includes("pass one of: 10.0"),
        true,
      );
      fs.rmSync(path.join(hintSdk, "platforms", "tizen-9.0", "tv-samsung"), {
        recursive: true,
      });
      fs.rmSync(path.join(hintSdk, "platforms", "tizen-10.0", "tv-samsung"), {
        recursive: true,
      });
      const noTv = await createProject(
        "tv",
        "Tv10",
        tvWs,
        "MyTizenTvAppX",
        false,
        "tizen-sdk create-project",
        false,
        "9.0",
      );
      check(
        "no TV extension anywhere → points at tizen-tv-sdk-install",
        /not installed for TIZEN-9\.0\. Install it with tizen-tv-sdk-install/.test(
          noTv.errors[0].message,
        ),
        true,
      );
      fs.writeFileSync(CONFIG_FILE, `${sdkPath}\n`);
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
    `\n${failures === 0 ? "All multi-platform tests passed" : `${failures} FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error = realConsoleError;
  console.error(e);
  process.exit(1);
});
