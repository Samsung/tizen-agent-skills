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
 * Removing sdk.info alone was not enough: a non-forced resume of a failed
 * forced run resume-skipped every package the run never reached, because
 * their old manifests were still there. Removing every .package/*.manifest
 * went too far: the TV SDK, emulator and platform installers keep their
 * manifests in the same directory, and tizen-update-package stopped seeing
 * those packages.
 *
 * Covered here (source guards):
 *   - under --force / -Force each resolved package's own manifest is removed
 *     instead of resume-skipping it, and no manifest is removed by wildcard
 *   - --detach / -Detach forwards --force / -Force only when it was given
 *   - a forced run removes sdk.info (not repository.info) before installing
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
  "sh: --force drops the package's manifest instead of resume-skipping it",
  /if \[ "\$FORCE" = true \]; then\n\s*rm -f "\$INSTALL_PATH\/\.package\/\$pkg\.manifest"\n\s*elif \[ -f "\$INSTALL_PATH\/\.package\/\$pkg\.manifest" \]; then/.test(
    sh,
  ),
);
check(
  "sh: no manifest resume skip without the FORCE guard",
  !/^\s*if \[ -f "\$INSTALL_PATH\/\.package\/\$pkg\.manifest" \]; then/m.test(
    sh,
  ),
);
check(
  "ps1: -Force drops the package's manifest instead of resume-skipping it",
  /if \(\$Force\) \{\r?\n\s*Remove-Item \(Join-Path \$pkgInfoDir "\$pkg\.manifest"\) [^\r\n]*\r?\n\s*\} elseif \(Test-Path \(Join-Path \$pkgInfoDir "\$pkg\.manifest"\)\) \{/.test(
    ps1,
  ),
);
check(
  "ps1: no manifest resume skip without the -Force guard",
  !/^\s*if \(Test-Path \(Join-Path \$pkgInfoDir "\$pkg\.manifest"\)\)/m.test(
    ps1,
  ),
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
// Start-Process does not quote -ArgumentList elements, so a path with a space
// split into two arguments and the detached install never started.
check(
  "ps1: -Detach quotes the script path and -Path for Start-Process",
  procArgs !== null &&
    /'-File', "`"\$PSCommandPath`""/.test(procArgs[1]) &&
    /if \(\$Path\) \{ \$procArgs \+= @\('-Path', "`"\$Path`""\) \}/.test(ps1),
);

console.log("--- stale sdk.info and manifests ---");
const shInstall = sh.indexOf("if ! install_platform_packages; then");
const shCleanup = sh.search(
  /\[ "\$FORCE" = true \] && rm -f "\$INSTALL_PATH\/sdk\.info"\n/,
);
check(
  "sh: a forced run removes sdk.info before installing",
  shCleanup !== -1 && shCleanup < shInstall,
);
const ps1Install = ps1.indexOf("$pkgOk = Install-PlatformPackages");
const ps1Cleanup = ps1.search(
  /if \(\$Force\) \{ Remove-Item \$sdkInfoPath -Force -ErrorAction SilentlyContinue \}/,
);
check(
  "ps1: a forced run removes sdk.info before installing",
  ps1Cleanup !== -1 && ps1Cleanup < ps1Install,
);
// .package/ is shared with the TV SDK, emulator and platform installers, so a
// forced base-SDK run must never remove manifests by wildcard.
check(
  "sh: no wildcard removal of .package manifests",
  !/rm -f[^\n]*\.package\/\*\.manifest/.test(sh),
);
check(
  "ps1: no wildcard removal of .package manifests",
  !/Remove-Item[^\n]*\.package[\\/]\*\.manifest/.test(ps1),
);
for (const [name, src] of [
  ["sh", sh],
  ["ps1", ps1],
]) {
  check(
    `${name}: the forced cleanup keeps repository.info`,
    !/(rm -f|Remove-Item)[^\n]*repository\.info/.test(src),
  );
}

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
