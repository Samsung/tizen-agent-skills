// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Source guards for two device-tier fixes found by the first ordered run of
 * the approved device TCs (tests/scripts/run-device-tier.mjs, 2026-09-22):
 *
 *   1. device-manager stop hung forever. Its last resort `sdb shell poweroff`
 *      never returns when the guest's sdbd accepts the connection but does not
 *      answer (a frozen TV emulator; a row sdb kept after the process died).
 *      Both scripts must bound that call (15 s) and then restart the sdb
 *      server to drop phantom rows (Method 5) instead of blocking past every
 *      caller's timeout.
 *
 *   2. launch-emulator without --vm-name tried to launch a VM named "t".
 *      With exactly one VM, PowerShell unrolled Get-VmList's one-element
 *      array into a string and `$vms[0]` returned its first character. The
 *      list helpers must return a real array (leading comma) and the call
 *      site must wrap in @(). Hardening added alongside: poll while an
 *      emulator row still shows "<unknown>" as its name right after a boot,
 *      and when em-cli refuses a launch but sdb shows the VM online, report
 *      that serial as success.
 *
 * These are text guards, not behavioural tests: the behaviour needs a booted
 * emulator, which is what tests/scripts/run-device-tier.mjs exercises.
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

const stopPs1 = read("tizen-device-manager", "tizen-device-manager.ps1");
const stopSh = read("tizen-device-manager", "tizen-device-manager.sh");
const launchPs1 = read("tizen-emulator-manager", "tizen-emulator-manager.ps1");
const launchSh = read("tizen-emulator-manager", "tizen-emulator-manager.sh");

console.log(
  "--- device-manager stop: bounded poweroff + phantom-row cleanup ---",
);
check(
  "ps1 no longer runs an unbounded `sdb shell poweroff`",
  /& \$sdb -s \$serial shell poweroff 2>&1 \| Out-Null/.test(stopPs1),
  false,
);
check(
  "ps1 bounds poweroff with WaitForExit(15000) and kills the client",
  /WaitForExit\(15000\)/.test(stopPs1) && /\$po\.Kill\(\)/.test(stopPs1),
  true,
);
check(
  "ps1 has Method 5: kill-server + start-server when rows remain",
  /Method 5/.test(stopPs1) &&
    /& \$sdb kill-server/.test(stopPs1) &&
    /& \$sdb start-server/.test(stopPs1),
  true,
);
check(
  "ps1 still exits 0 with EMULATOR_STOPPED= after the fallbacks",
  (stopPs1.match(/Write-Host "EMULATOR_STOPPED=/g) || []).length,
  2,
);
check(
  "sh no longer runs an unbounded `sdb shell poweroff`",
  /if "\$SDB" -s "\$serial" shell poweroff <\/dev\/null 2>\/dev\/null; then/.test(
    stopSh,
  ),
  false,
);
check(
  "sh bounds poweroff with a portable background+poll helper (no `timeout`)",
  /poweroff_bounded\(\) \{/.test(stopSh) &&
    /poweroff_bounded "\$serial" \|\| true/.test(stopSh) &&
    !/\btimeout 15\b/.test(stopSh),
  true,
);
check(
  "sh has Method 5: kill-server + start-server when rows remain",
  /Method 5/.test(stopSh) &&
    /"\$SDB" kill-server/.test(stopSh) &&
    /"\$SDB" start-server/.test(stopSh),
  true,
);

console.log(
  "--- launch-emulator: unresolved-name poll + em-cli refusal fallback ---",
);
check(
  "ps1 wraps every VM-list result in @() (no bare `$x = Get-VmList` / ConvertTo-VmNames)",
  /\$vms = @\(Get-VmList\)/.test(launchPs1) &&
    /\$existingVms = @\(Get-VmList\)/.test(launchPs1) &&
    /\$vmNames = @\(ConvertTo-VmNames \$listRaw\)/.test(launchPs1) &&
    /@\(ConvertTo-VmNames \$raw\) -notcontains \$Target/.test(launchPs1) &&
    !/=\s*Get-VmList\s*$/m.test(launchPs1) &&
    !/=\s*ConvertTo-VmNames \$\w+\s*$/m.test(launchPs1),
  true,
);
check(
  "ps1 polls while an emulator row is still '<unknown>'",
  /\$parts\[2\] -eq '<unknown>'/.test(launchPs1) &&
    /\$nameWait -le 15/.test(launchPs1),
  true,
);
check(
  "ps1 reports success when em-cli refuses but sdb shows the VM online",
  /em-cli refused the launch, but VM '\$VmName' is already running/.test(
    launchPs1,
  ),
  true,
);
check(
  "ps1 collects device rows without pipeline flattening (ArrayList + ,\\$result)",
  /New-Object System\.Collections\.ArrayList/.test(launchPs1) &&
    /return ,\$result/.test(launchPs1),
  true,
);
check(
  "sh polls while an emulator row is still '<unknown>'",
  /"\$VM_NAME_OF_DEVICE" = "<unknown>"/.test(launchSh) &&
    /"\$name_wait" -ge 15/.test(launchSh),
  true,
);
check(
  "sh reports success when em-cli refuses but sdb shows the VM online",
  /em-cli refused the launch, but VM '\$vm' is already running/.test(
    launchSh,
  ) && /echo "DEVICE_SERIAL=\$running_serial"/.test(launchSh),
  true,
);

console.log(
  failures
    ? `\n${failures} check(s) failed`
    : "\nAll emulator stop/launch guard checks passed",
);
process.exit(failures ? 1 : 0);
