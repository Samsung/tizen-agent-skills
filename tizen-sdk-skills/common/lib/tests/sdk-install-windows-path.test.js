// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * tizen-sdk-install.ps1 — install-path separator normalisation.
 *
 * The JS layer passes -Path with forward slashes ("C:/Users/me/tizen-sdk",
 * see installerPathArgs: a trailing backslash would escape the closing quote).
 * The script used that value verbatim, so every derived string mixed
 * separators: the User Path entries became "C:/Users/me/tizen-sdk\bin", and
 * TIZEN_SDK_PATH, sdk.info and ~\.tizen.sdk.path.config kept the slash form.
 * The "already on Path" check is a plain string match, so a backslash entry
 * written by hand was never recognised and the three entries were appended
 * again on every run.
 *
 * The fix is ConvertTo-CanonicalWindowsPath in scripts/lib/common.ps1, called
 * once by the installer right after $Path is resolved.
 *
 * Covered here:
 *   - source guards on the installer, evaluated on CODE lines only (comments
 *     stripped, so a mention in a comment can neither satisfy nor break a
 *     guard): common.ps1 is dot-sourced, then $Path is resolved, then
 *     normalised, and only after that is the first value derived from $Path
 *   - behaviour (PowerShell available, Windows host): common.ps1 is
 *     dot-sourced in a fresh PowerShell and the real helper is called —
 *     slash form, trailing separator, mixed separators, redundant segments,
 *     already-canonical input, a drive root, and a relative path anchored at
 *     $PWD after Set-Location rather than at the process working directory
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== tizen-sdk-install.ps1 path normalisation tests ===\n");

const SCRIPTS = path.join(__dirname, "..", "..", "scripts");
const INSTALLER = path.join(
  SCRIPTS,
  "tizen-sdk-install",
  "tizen-sdk-install.ps1",
);
const COMMON = path.join(SCRIPTS, "lib", "common.ps1");
const HELPER = "ConvertTo-CanonicalWindowsPath";

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

// --- source guards -----------------------------------------------------------
console.log("--- source guards (installer, code lines only) ---");

/** 0-based index of the first CODE line matching re, or -1. */
function firstCodeLine(lines, re) {
  return lines.findIndex((l) => re.test(l.replace(/#.*$/, "")));
}

const installerLines = fs.readFileSync(INSTALLER, "utf-8").split(/\r?\n/);
const commonSrc = fs.readFileSync(COMMON, "utf-8");

const dotSourceAt = firstCodeLine(
  installerLines,
  /^\s*\.\s+\(Join-Path \$PSScriptRoot "\.\.\\lib\\common\.ps1"\)/,
);
const defaultAt = firstCodeLine(
  installerLines,
  /^\s*\$Path = Get-DefaultSdkInstallPath\s*$/,
);
const normaliseAt = firstCodeLine(
  installerLines,
  new RegExp(`^\\s*\\$Path = ${HELPER} \\$Path\\s*$`),
);
// Anything that builds a value from $Path: Join-Path $Path ..., "$Path\...".
const firstDerivedAt = firstCodeLine(
  installerLines,
  /Join-Path \$Path\b|"\$Path\\/,
);
// 1-based line numbers for the failure details; 0 = not found.
const where =
  `dotSource@${dotSourceAt + 1} default@${defaultAt + 1} ` +
  `normalise@${normaliseAt + 1} firstDerived@${firstDerivedAt + 1}`;

check(
  `common.ps1 defines function ${HELPER}`,
  new RegExp(`^function ${HELPER}\\s*\\{`, "m").test(commonSrc),
);
check(`installer assigns $Path = ${HELPER} $Path`, normaliseAt !== -1, where);
check(
  "common.ps1 is dot-sourced before the helper is called",
  dotSourceAt !== -1 && dotSourceAt < normaliseAt,
  where,
);
check(
  "normalisation comes after the default path is resolved",
  defaultAt !== -1 && defaultAt < normaliseAt,
  where,
);
check(
  "normalisation comes before the first value derived from $Path",
  firstDerivedAt !== -1 && normaliseAt < firstDerivedAt,
  where,
);
const inlineGetFullPathAt = firstCodeLine(
  installerLines,
  /\$Path = \[System\.IO\.Path\]::GetFullPath/,
);
check(
  "the helper is the only normalisation (no inline GetFullPath on $Path)",
  inlineGetFullPathAt === -1,
  `inline GetFullPath at line ${inlineGetFullPathAt + 1}`,
);

// --- behaviour: call the real helper in PowerShell --------------------------
console.log("\n--- behaviour (PowerShell) ---");

function findPowerShell() {
  for (const exe of ["pwsh", "powershell"]) {
    const r = spawnSync(exe, ["-NoProfile", "-Command", "exit 0"], {
      encoding: "utf8",
    });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}

const ps = findPowerShell();
if (!ps) {
  console.log("SKIP  no pwsh/powershell on this host");
} else if (process.platform !== "win32") {
  console.log("SKIP  drive-letter expectations only hold on a Windows host");
} else {
  // Dot-source the real common.ps1 (function definitions only) and print the
  // helper's result with no trailing newline. `pre` runs before the call, so a
  // test can Set-Location without changing the spawn's working directory.
  const canon = (input, pre = "") => {
    const script =
      `. '${COMMON}'; ${pre}` + `[Console]::Out.Write((${HELPER} '${input}'))`;
    const r = spawnSync(ps, ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      timeout: 30000,
    });
    return r.status === 0 ? r.stdout : `<exit ${r.status}: ${r.stderr}>`;
  };
  const expectCanon = (name, input, expected, pre = "") => {
    const got = canon(input, pre);
    check(name, got === expected, `got ${JSON.stringify(got)}`);
  };

  const sdk = "C:\\Users\\me\\tizen-sdk";
  expectCanon(
    "slash form from installerPathArgs becomes a backslash path",
    "C:/Users/me/tizen-sdk",
    sdk,
  );
  expectCanon(
    "trailing separator is dropped (no '\\\\bin' once '\\bin' is appended)",
    "C:/Users/me/tizen-sdk/",
    sdk,
  );
  expectCanon(
    "mixed separators collapse to one canonical form",
    "C:/Users/me\\tizen-sdk",
    sdk,
  );
  expectCanon(
    "redundant separators and . / .. segments are collapsed",
    "C:/Users//me/./tizen-sdk/x/..",
    sdk,
  );
  expectCanon("already-canonical path is left untouched", sdk, sdk);
  expectCanon("surrounding whitespace is trimmed", `  ${sdk}  `, sdk);
  expectCanon("drive root keeps its separator (not bare 'C:')", "C:/", "C:\\");
  check(
    "derived Path entry has a single separator style",
    !/\//.test(canon("C:/Users/me/tizen-sdk") + "\\bin"),
  );

  // Relative path: anchored at PowerShell's $PWD, which Set-Location moved to
  // scripts\lib — NOT at the process working directory (this test's cwd),
  // which is what a bare GetFullPath would have used.
  const libDir = path.dirname(COMMON);
  const got = canon("tizen-sdk", `Set-Location '${libDir}'; `);
  check(
    "relative path is anchored at $PWD after Set-Location",
    got.toLowerCase() === path.join(libDir, "tizen-sdk").toLowerCase(),
    `got ${JSON.stringify(got)}, expected under ${libDir}`,
  );
  check(
    "relative path is NOT anchored at the process working directory",
    got.toLowerCase() !== path.join(process.cwd(), "tizen-sdk").toLowerCase(),
    `got ${JSON.stringify(got)}, cwd ${process.cwd()}`,
  );
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
