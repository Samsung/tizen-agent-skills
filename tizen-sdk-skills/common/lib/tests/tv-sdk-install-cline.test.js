// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * TV SDK installer Cline-flow tests.
 *
 * The tizen-tv-sdk-install skill told Cline to launch the installer with
 * --detach / -Detach and poll it with --status / -Status, but the installer
 * had neither option: the bash poll failed with "Unknown option: --status"
 * and -Detach / -Status were PowerShell parameter errors. The Cline launch
 * templates of both TV skills also hard-coded the installer arguments, so
 * --force (and, for the ZIP skill on Windows, -ZipPath) never reached the
 * installer. And tizen-tv-sdk-install-from-zip.sh forwarded
 * ${FORCE:+--force} on --detach, which expands for FORCE=false too, so every
 * detached ZIP install was forced.
 *
 * Covered here:
 *   - tizen-tv-sdk-install.{sh,ps1} accept --status / -Status and
 *     --detach / -Detach, and forward --force / -Force only when given
 *   - bash --status prints STATUS=done EXIT=0 / EXIT=1 and exits 0
 *     (skipped on win32)
 *   - tizen-tv-sdk-install-from-zip.sh forwards --force only when given
 *   - the Cline launch templates of both TV skills run suggested_fix.command
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== TV SDK installer Cline-flow tests ===\n");

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

const scriptsDir = path.join(__dirname, "..", "..", "scripts");
const tvSh = path.join(
  scriptsDir,
  "tizen-tv-sdk-install",
  "tizen-tv-sdk-install.sh",
);
const read = (p) => fs.readFileSync(p, "utf8");
const sh = read(tvSh);
const ps1 = read(
  path.join(scriptsDir, "tizen-tv-sdk-install", "tizen-tv-sdk-install.ps1"),
);
const zipSh = read(
  path.join(
    scriptsDir,
    "tizen-tv-sdk-install-from-zip",
    "tizen-tv-sdk-install-from-zip.sh",
  ),
);

console.log("--- tizen-tv-sdk-install.sh ---");
check(
  "parses --status and --detach",
  /--status\)\s+STATUS=true; shift ;;/.test(sh) &&
    /--detach\)\s+DETACH=true; shift ;;/.test(sh),
);
check(
  "--status shares the --wait status check",
  /if \[\[ "\$WAIT" == "true" \|\| "\$STATUS" == "true" \]\]; then/.test(sh),
);
check(
  "--detach forwards --force only when FORCE is true",
  /detach_args=\(--sdk-path="\$SDK_PATH" --download-jobs "\$DOWNLOAD_JOBS"\)/.test(
    sh,
  ) && /\[\[ "\$FORCE" == "true" \]\] && detach_args\+=\(--force\)/.test(sh),
);

console.log("--- tizen-tv-sdk-install.ps1 ---");
check(
  "declares -Status and -Detach",
  /\[switch\]\$Status,/.test(ps1) && /\[switch\]\$Detach,/.test(ps1),
);
check(
  "-Status shares the -Wait status check",
  /if \(\$Wait -or \$Status\) \{/.test(ps1),
);
const procArgs = ps1.match(/\$procArgs = @\(([\s\S]*?)\)/);
check(
  "-Detach forwards -SdkPath and -DownloadJobs, not a hard-coded -Force",
  procArgs !== null &&
    /'-SdkPath'/.test(procArgs[1]) &&
    /'-DownloadJobs'/.test(procArgs[1]) &&
    !/'-Force'/.test(procArgs[1]),
);
check(
  "-Detach forwards -Force only when $Force is set",
  /if \(\$Force\) \{ \$procArgs \+= '-Force' \}/.test(ps1),
);

console.log("--- tizen-tv-sdk-install-from-zip.sh ---");
check(
  "--detach no longer uses ${FORCE:+--force}",
  !/\$\{FORCE:\+--force\}/.test(zipSh),
);
check(
  "--detach forwards --force only when FORCE is true",
  /\[\[ "\$FORCE" == "true" \]\] && detach_args\+=\(--force\)/.test(zipSh),
);

console.log("--- Cline launch templates ---");
const skillsDir = path.join(__dirname, "..", "..", "skills");
for (const skill of ["tizen-tv-sdk-install", "tizen-tv-sdk-install-from-zip"]) {
  const md = read(path.join(skillsDir, skill, "SKILL.md"));
  check(
    `${skill}: bash launch runs suggested_fix.command under nohup`,
    /nohup <suggested_fix\.command> > /.test(md) && !/nohup bash "</.test(md),
  );
  check(
    `${skill}: PowerShell launch appends -Detach to suggested_fix.command`,
    /<suggested_fix\.command> -Detach/.test(md) && !/path>" -Detach/.test(md),
  );
}

console.log("--- bash --status ---");
if (process.platform === "win32") {
  console.log("SKIP bash --status (win32)");
} else {
  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), "tv-sdk-status-"));
  try {
    const status = () =>
      spawnSync("bash", [tvSh, `--sdk-path=${sdk}`, "--status"], {
        encoding: "utf8",
      });
    let r = status();
    check(
      "no marker, no installer running → STATUS=done EXIT=1, exit 0",
      r.status === 0 && r.stdout.trim() === "STATUS=done EXIT=1",
    );
    fs.writeFileSync(path.join(sdk, ".tv-sdk-installed"), "");
    r = status();
    check(
      "marker present → STATUS=done EXIT=0, exit 0",
      r.status === 0 && r.stdout.trim() === "STATUS=done EXIT=0",
    );
  } finally {
    fs.rmSync(sdk, { recursive: true, force: true });
  }
}

console.log(
  `\n${failures === 0 ? "All tv-sdk-install-cline tests passed" : `${failures} FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
