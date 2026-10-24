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
const { listTemplates, createProject } = require("../core/project");

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
          ["9.0", "common_only"],
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
