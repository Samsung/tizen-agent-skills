// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * SDK installer --force / -Force tests.
 *
 * On an installed SDK, --force skipped the "already installed" early exit but
 * then resume-skipped every package whose .package/<pkg>.manifest existed, so
 * nothing was re-downloaded: newer packages never arrived and a --repo-url
 * switch only rewrote repository.info. The detached re-launch also added
 * --force / -Force unconditionally, so making the resume skip honour --force
 * alone would have made every resumed detached install start over.
 *
 * A forced run also kept the old sdk.info, so one that failed partway was
 * later reported as a completed install. And the Cline launch templates in
 * the SKILL.md files dropped the flags the pre-check put into
 * suggested_fix.command, so a forced reinstall never reached the installer.
 *
 * Covered here (source guards):
 *   - the per-package resume skip is bypassed under --force / -Force
 *   - --detach / -Detach forwards --force / -Force only when it was given
 *   - a forced run removes sdk.info before installing
 *   - the Cline launch templates run suggested_fix.command with its arguments
 */

const fs = require("fs");
const path = require("path");

console.log("=== SDK installer --force tests ===\n");

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

const scriptDir = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "tizen-sdk-install",
);
const sh = fs.readFileSync(
  path.join(scriptDir, "tizen-sdk-install.sh"),
  "utf8",
);
const ps1 = fs.readFileSync(
  path.join(scriptDir, "tizen-sdk-install.ps1"),
  "utf8",
);

console.log("--- resume skip ---");
check(
  "sh: manifest resume skip requires FORCE != true",
  /if \[ "\$FORCE" != true \] && \[ -f "\$INSTALL_PATH\/\.package\/\$pkg\.manifest" \]; then/.test(
    sh,
  ),
);
check(
  "sh: no manifest resume skip without the FORCE guard",
  !/if \[ -f "\$INSTALL_PATH\/\.package\/\$pkg\.manifest" \]; then/.test(sh),
);
check(
  "ps1: manifest resume skip requires -not $Force",
  /if \(-not \$Force -and \(Test-Path \(Join-Path \$pkgInfoDir "\$pkg\.manifest"\)\)\)/.test(
    ps1,
  ),
);
check(
  "ps1: no manifest resume skip without the -Force guard",
  !/if \(Test-Path \(Join-Path \$pkgInfoDir "\$pkg\.manifest"\)\)/.test(ps1),
);

console.log("--- detach forwarding ---");
check(
  "sh: detach_args does not hard-code --force",
  /detach_args=\(--path "\$INSTALL_PATH"\)/.test(sh) &&
    !/detach_args=\(--force/.test(sh),
);
check(
  "sh: detach forwards --force only when FORCE is true",
  /\[ "\$FORCE" = true \] && detach_args\+=\(--force\)/.test(sh),
);
const procArgs = ps1.match(/\$procArgs = @\(([\s\S]*?)\)/);
check(
  "ps1: -Detach procArgs does not hard-code -Force",
  procArgs !== null && !/'-Force'/.test(procArgs[1]),
);
check(
  "ps1: -Detach forwards -Force only when $Force is set",
  /if \(\$Force\) \{ \$procArgs \+= '-Force' \}/.test(ps1),
);

console.log("--- stale sdk.info ---");
check(
  "sh: a forced run removes sdk.info before installing",
  /\[ "\$FORCE" = true \] && rm -f "\$INSTALL_PATH\/sdk\.info"/.test(sh) &&
    sh.indexOf('rm -f "$INSTALL_PATH/sdk.info"') <
      sh.indexOf("if ! install_platform_packages; then"),
);
check(
  "ps1: a forced run removes sdk.info before installing",
  /if \(\$Force\) \{ Remove-Item \$sdkInfoPath /.test(ps1) &&
    ps1.indexOf("Remove-Item $sdkInfoPath") <
      ps1.indexOf("$pkgOk = Install-PlatformPackages"),
);

console.log("--- Cline launch templates ---");
const skillsDir = path.join(__dirname, "..", "..", "skills");
for (const skill of ["tizen-sdk-install", "tizen-sdk-install-custom-repo"]) {
  const md = fs.readFileSync(path.join(skillsDir, skill, "SKILL.md"), "utf8");
  check(
    `${skill}: bash launch runs suggested_fix.command under nohup`,
    /nohup <suggested_fix\.command> > /.test(md) && !/nohup bash "</.test(md),
  );
  check(
    `${skill}: PowerShell launch appends -Detach to suggested_fix.command`,
    /<suggested_fix\.command> -Detach/.test(md) &&
      !/path>"(?: -RepoUrl "<url>")? -Detach/.test(md),
  );
}

console.log(
  `\n${failures === 0 ? "All sdk-install-force tests passed" : `${failures} FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
