// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Source guards for the on-demand gdbserver install in the gdb-debug scripts
 * (found by the device-tier fixture run, 2026-09-22):
 *
 *   Emulator images since Tizen 8 ship no gdbserver, so both scripts used to
 *   stop at "gdbserver not found at /usr/bin/gdbserver" although the SDK
 *   carries the binary as <sdk>/tools/on-demand/gdbserver_<ver>_<arch>.tar.
 *   Like tizen-dotnet-debug does for netcoredbg, Step 2 must now push and
 *   extract that tar to /home/owner/share/tmp/sdk_tools/ when neither
 *   `which gdbserver`, /usr/bin/gdbserver nor a previous on-demand copy
 *   exists, pick the tar by device arch (armv7l → "armel") and newest
 *   version, and verify with a `test -x … && echo ok` probe because sdb shell
 *   never propagates the remote exit code.
 *
 * These are text guards, not behavioural tests: the behaviour needs a booted
 * emulator, which is what tests/scripts/run-device-tier.mjs exercises
 * (phases c5a–c5c).
 */

const fs = require("fs");
const path = require("path");

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}

const scripts = path.resolve(__dirname, "..", "..", "scripts");
const read = (...p) => fs.readFileSync(path.join(scripts, ...p), "utf-8");

const ps1 = read("tizen-gdb-debug", "tizen-native-gdb-debug.ps1");
const sh = read("tizen-gdb-debug", "tizen-native-gdb-debug.sh");
const ONDEMAND_BIN = "/home/owner/share/tmp/sdk_tools/gdbserver/gdbserver";

console.log("--- gdb-debug: gdbserver installed on demand from the SDK ---");

check(
  "ps1 no longer defaults blindly to /usr/bin/gdbserver",
  /\|\| echo \/usr\/bin\/gdbserver"/.test(ps1),
  false,
);
check(
  "sh no longer defaults blindly to /usr/bin/gdbserver",
  /\|\| echo \/usr\/bin\/gdbserver'/.test(sh),
  false,
);

check(
  "ps1 looks for a previous on-demand copy before installing",
  ps1.includes(`$GdbserverOnDemandBin = "${ONDEMAND_BIN}"`) &&
    /test -x \$GdbserverOnDemandBin && echo \$GdbserverOnDemandBin/.test(ps1),
  true,
);
check(
  "sh looks for a previous on-demand copy before installing",
  sh.includes(`GDBSERVER_ONDEMAND_BIN="${ONDEMAND_BIN}"`) &&
    /test -x \$GDBSERVER_ONDEMAND_BIN && echo \$GDBSERVER_ONDEMAND_BIN/.test(
      sh,
    ),
  true,
);

check(
  "ps1 picks the tar from <sdk>\\tools\\on-demand by arch, newest version",
  /function Find-GdbserverTar/.test(ps1) &&
    /Join-Path \(Join-Path \(Get-SdkPath\) "tools"\) "on-demand"/.test(ps1) &&
    /-Filter "gdbserver_\*_\$Arch\.tar"/.test(ps1) &&
    /\[version\]\$Matches\[1\]/.test(ps1),
  true,
);
check(
  "sh picks the tar from <sdk>/tools/on-demand by arch, newest version",
  /^find_gdbserver_tar\(\) \{/m.test(sh) &&
    /tools\/on-demand\/gdbserver_\*_"\$1"\.tar/.test(sh) &&
    /sort -V \| tail -1/.test(sh),
  true,
);

check(
  "ps1 maps uname -m to the tar arch token (armv7l → armel, riscv64 kept)",
  /'\^arm'\s*\{ return 'armel' \}/.test(ps1) &&
    /'riscv64'\s*\{ return 'riscv64' \}/.test(ps1) &&
    /'aarch64'\s*\{ return 'aarch64' \}/.test(ps1),
  true,
);
check(
  "sh maps uname -m to the tar arch token (armv7l → armel, riscv64 kept)",
  /arm\*\)\s+echo "armel"/.test(sh) &&
    /riscv64\)\s+echo "riscv64"/.test(sh) &&
    /aarch64\)\s+echo "aarch64"/.test(sh),
  true,
);

check(
  "ps1 pushes to /home/owner/share/tmp and extracts under sdk_tools with plain tar",
  /function Install-Gdbserver/.test(ps1) &&
    /& \$Sdb -s \$Serial push "\$TarPath" \$deviceTar/.test(ps1) &&
    /cd \/home\/owner\/share\/tmp\/sdk_tools && tar -xf \$deviceTar/.test(ps1),
  true,
);
check(
  "sh pushes to /home/owner/share/tmp and extracts under sdk_tools with plain tar",
  /^install_gdbserver\(\) \{/m.test(sh) &&
    /"\$SDB" -s "\$SERIAL" push "\$tar_path" "\$device_tar"/.test(sh) &&
    /cd \/home\/owner\/share\/tmp\/sdk_tools && tar -xf \$device_tar/.test(sh),
  true,
);

check(
  "ps1 verifies the install and the final path with `test -x … && echo ok` (sdb shell drops exit codes)",
  (ps1.match(/test -x [^"]*&& echo ok/g) || []).length >= 2,
  true,
);
check(
  "sh verifies the install and the final path with `test -x … && echo ok` (sdb shell drops exit codes)",
  (sh.match(/test -x [^"]*&& echo ok/g) || []).length >= 2 &&
    !/if ! "\$SDB" shell "test -f '\$GDBSERVER_PATH'"/.test(sh),
  true,
);

check(
  "ps1 names the missing tar pattern when the SDK has none for the arch",
  /gdbserver package for '\$arch' not found under .*on-demand/.test(ps1),
  true,
);
check(
  "sh names the missing tar pattern when the SDK has none for the arch",
  /gdbserver package for '\$ARCH' not found under .*on-demand/.test(sh),
  true,
);

console.log(
  failures
    ? `\n${failures} check(s) failed`
    : "\nAll gdb on-demand guard checks passed",
);
process.exit(failures ? 1 : 0);
