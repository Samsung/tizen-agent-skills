// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * TV SDK ZIP installer end-to-end tests.
 *
 * Two bugs met installing TIZEN-SDK-IMG_20260121070826490-v2-02_macos-64.zip:
 *
 *   - The TV version was read from the field after the LAST "_" of each inner
 *     ZIP name. Real names are <name>_<version>_<os>-<bits>
 *     (TV-SAMSUNG-Public_10.0.0_macos-64.zip), so that field is "macos-64",
 *     no version was found, and the install stopped asking for --tv-version.
 *   - tv-samsung-emulator-qemu-x86-v2_9.3.4.7_macos-64.zip stores
 *     emulator-v2/bin/emulator-x86_64 and emulator-x86_64.bin as -rw-rw-r--,
 *     so launching the TV emulator failed with "Permission denied".
 *
 * Covered here:
 *   - both installers read the version from the field after the package name
 *     (static check on .sh and .ps1)
 *   - the .sh installer, run on a fake bundle with real-style names and no
 *     --tv-version, detects TV 10.0 and records it (skipped on win32 / no zip)
 *   - it restores +x on executables in tv-samsung bin/ folders (ELF, "#!"),
 *     and leaves data files in bin/ alone
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== TV SDK ZIP installer tests ===\n");

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
  "tizen-tv-sdk-install-from-zip",
);
const zipShPath = path.join(scriptDir, "tizen-tv-sdk-install-from-zip.sh");
const zipSh = fs.readFileSync(zipShPath, "utf8");
const zipPs1 = fs.readFileSync(
  path.join(scriptDir, "tizen-tv-sdk-install-from-zip.ps1"),
  "utf8",
);

// --- static: version field ---------------------------------------------------
check(
  ".sh reads the version from the field after the package name",
  /version_part="\$\{basename#\*_\}"/.test(zipSh) &&
    /version_part="\$\{version_part%%_\*\}"/.test(zipSh) &&
    !/version_part="\$\{basename##\*_\}"/.test(zipSh),
);
check(
  ".ps1 reads the version from the field after the package name",
  /\$fields = \$baseName\.Split\('_'\)/.test(zipPs1) &&
    /\$versionPart = if \(\$fields\.Count -ge 2\) \{ \$fields\[1\] \}/.test(
      zipPs1,
    ) &&
    !/LastIndexOf\('_'\) \+ 1/.test(zipPs1),
);

// --- end-to-end (.sh) ----------------------------------------------------------
const hasZip =
  process.platform !== "win32" &&
  spawnSync("zip", ["-v"], { stdio: "ignore" }).status === 0;

if (!hasZip) {
  console.log("SKIP end-to-end: needs a POSIX host with the zip command");
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tv-zip-test-"));
  try {
    const sdk = path.join(tmp, "sdk");
    fs.mkdirSync(sdk);
    fs.writeFileSync(path.join(sdk, "sdk.info"), "TIZEN_SDK_VERSION=test\n");

    const binary = path.join(tmp, "bundle", "binary");
    fs.mkdirSync(binary, { recursive: true });

    // One inner ZIP: <name>_<version>_<os>-<bits>.zip holding data/<sdk paths>.
    function innerZip(fileName, files) {
      const stage = fs.mkdtempSync(path.join(tmp, "stage-"));
      for (const [rel, content, mode] of files) {
        const p = path.join(stage, "data", rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
        fs.chmodSync(p, mode);
      }
      const r = spawnSync("zip", ["-qr", path.join(binary, fileName), "data"], {
        cwd: stage,
      });
      if (r.status !== 0) throw new Error(`zip failed for ${fileName}`);
    }

    const v2bin = "platforms/tizen-10.0/tv-samsung/emulator-v2/bin";
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    innerZip("TV-SAMSUNG-Public_10.0.0_macos-64.zip", [
      ["platforms/tizen-10.0/tv-samsung/info.ini", "profile=tv\n", 0o644],
    ]);
    innerZip("TV-SAMSUNG-Public-Emulator_10.0.0_macos-64.zip", [
      ["platforms/tizen-10.0/tv-samsung/emulator.ini", "x=1\n", 0o644],
    ]);
    // Excluded from the version vote, and the package that drops +x.
    innerZip("tv-samsung-emulator-qemu-x86-v2_9.3.4.7_macos-64.zip", [
      [`${v2bin}/emulator-x86_64`, "#!/bin/bash\nexit 0\n", 0o664],
      [`${v2bin}/emulator-x86_64.bin`, elf, 0o664],
      [`${v2bin}/README.txt`, "not a program\n", 0o664],
      [`${v2bin}/emulator.sh`, "#!/bin/sh\n", 0o755],
    ]);

    const bundle = path.join(tmp, "TIZEN-SDK-IMG_test-v2_macos-64.zip");
    const z = spawnSync("zip", ["-qr", bundle, "binary"], {
      cwd: path.join(tmp, "bundle"),
    });
    check("fixture: outer bundle ZIP built", z.status === 0);

    const run = spawnSync(
      "bash",
      [zipShPath, `--sdk-path=${sdk}`, `--zip-path=${bundle}`],
      { encoding: "utf8", env: { ...process.env, HOME: tmp } },
    );
    const out = `${run.stdout}\n${run.stderr}`;
    check(
      `installer exits 0 without --tv-version (exit ${run.status})`,
      run.status === 0,
    );
    if (run.status !== 0) console.log(out);
    check(
      "detects TV 10.0 from <name>_<version>_<os>-<bits> names",
      /Detected TV milestone version: 10\.0/.test(out),
    );
    const records = fs.existsSync(path.join(sdk, ".platform-installed"))
      ? fs.readFileSync(path.join(sdk, ".platform-installed"), "utf8")
      : "";
    check(
      ".platform-installed records TV 10.0 (tv-samsung)",
      /Platform version: 10\.0/.test(records) &&
        /Profile: tv-samsung/.test(records),
    );

    // null when the file was not installed, so a failed install is a FAIL
    // line below rather than a crash.
    const isExec = (rel) => {
      const p = path.join(sdk, v2bin, rel);
      return fs.existsSync(p) ? (fs.statSync(p).mode & 0o100) !== 0 : null;
    };
    check(
      "restores +x on a #! script stored without it",
      isExec("emulator-x86_64") === true,
    );
    check(
      "restores +x on an ELF binary stored without it",
      isExec("emulator-x86_64.bin") === true,
    );
    check(
      "leaves a data file in bin/ non-executable",
      isExec("README.txt") === false,
    );
    check(
      "keeps +x on a file the ZIP already marked",
      isExec("emulator.sh") === true,
    );
    check(
      "logs how many execute bits it restored",
      /Restored the execute bit on 2 file\(s\)/.test(out),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(
  `\n${failures === 0 ? "All tv-sdk-install-from-zip tests passed" : `${failures} FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
