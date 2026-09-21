// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Follow-ups from the 2026-09-17 safe+device draft TC run — four defects the
 * run surfaced in the product (not in the TCs):
 *
 *   1. sdk-install on an already-installed SDK rewrote ~/.tizen.sdk.path.config
 *      even when it already held the same path (the "requested version echoed
 *      back as installed" half of that finding was fixed on main by PR #146:
 *      validateTizenVersion / requestedPlatformMissing).
 *        → ensureSdkPathConfig() is a no-op when the config already resolves
 *          to the SDK path.
 *   2. remote-device device_not_found failures (bookmark missing, network
 *      connect failed) fell through to the registry default suggested_fix,
 *      which launches an emulator — unrelated to either failure.
 *        → source guard: every device_not_found site passes its own command.
 *   3. create-emulator --launch had no way to raise the script's 300 s boot
 *      wait (a fresh Tizen 11 image took ~349 s to first-boot on the test host).
 *        → createEmulator() accepts timeoutSec with launch-emulator's bounds.
 *   4. tizen-emulator-manager.ps1 modify/reset reported only em-cli's headline
 *      ("Error: Failed to modify VM.") and a misleading "VM may be running"
 *      hint, dropping the real reason on the next line.
 *        → source guard: the scripts use Get-EmCliReason / head -3 and phrase
 *          the hint as conditional.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { createEmulator } = require("../core/emulator");

console.log("=== draft-run follow-up tests (2026-09-17) ===\n");

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

function makeFakeSdk(platforms, withTools = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-sdk-fake-"));
  for (const p of platforms) {
    fs.mkdirSync(path.join(root, "platforms", p), { recursive: true });
  }
  if (withTools) fs.mkdirSync(path.join(root, "tools"), { recursive: true });
  return root;
}

(async () => {
  // --- 1. ensureSdkPathConfig (child process with a scratch HOME) --------------
  console.log("--- ensureSdkPathConfig ---");
  {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-home-"));
    const sdk = makeFakeSdk(["tizen-10.0"]);
    const cfg = path.join(home, ".tizen.sdk.path.config");
    const sdkModule = path.resolve(__dirname, "..", "core", "sdk.js");
    const script = `
      const { ensureSdkPathConfig } = require(${JSON.stringify(sdkModule)});
      (async () => {
        const out = [];
        for (const p of process.argv.slice(1)) {
          const r = await ensureSdkPathConfig(p);
          out.push(r.written);
        }
        console.log(JSON.stringify(out));
      })();
    `;
    // Same path spelled two ways: first call writes, the second must be a no-op.
    const alt = sdk.replace(/\\/g, "/");
    const r = spawnSync(process.execPath, ["-e", script, "--", sdk, alt, sdk], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home, USERPROFILE: home },
      timeout: 20000,
    });
    const lines = (r.stdout || "").trim().split(/\r?\n/);
    check(
      "written once, then no-op for the same resolved path",
      JSON.parse(lines[lines.length - 1] || "null"),
      [true, false, false],
    );
    check(
      "config holds the SDK path as first written",
      fs.readFileSync(cfg, "utf-8").trim(),
      sdk,
    );
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(sdk, { recursive: true, force: true });
  }

  // --- 2. remote-device suggested_fix source guard -------------------------------
  console.log("--- remote-device device_not_found suggested_fix ---");
  {
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "core", "remote-device.js"),
      "utf-8",
    );
    // Every formatError(..., "device_not_found", <message>, <fix>, ...) must pass a
    // command, never null — null falls back to the registry's launch-emulator hint.
    const sites = [
      ...src.matchAll(/"device_not_found",\s*\n([^;]*?)\n\s*startTime,/g),
    ].map((m) => m[1]);
    check("three device_not_found sites", sites.length, 3);
    check(
      "none passes a null suggested fix",
      sites.every((s) => !/\n\s*null,\s*$/.test(s)),
      true,
    );
    check(
      "connect failure points at scan",
      /Failed to connect to[\s\S]*?remote-device --action scan"/.test(src),
      true,
    );
    check(
      "bookmark-not-found points at list-saved (remove + edit)",
      (src.match(/remote-device --action list-saved"/g) || []).length,
      2,
    );
  }

  // --- 3. createEmulator timeoutSec ----------------------------------------------
  console.log("--- createEmulator --timeout ---");
  {
    const base = {
      action: "create",
      vmName: "unit-vm",
      size: "1080",
      launch: true,
    };
    for (const bad of ["900", "0", "abc"]) {
      const r = await createEmulator({ ...base, timeoutSec: bad });
      check(
        `timeoutSec ${bad} → invalid_parameters`,
        [r.status, r.errors?.[0]?.error_category],
        ["failure", "invalid_parameters"],
      );
    }
    // Without --launch the value is ignored, so it must not be validated either:
    // the call must get past the timeout gate (it fails later for other reasons
    // on a host without em-cli, or succeeds — either way not invalid timeout).
    const ignored = await createEmulator({
      action: "list-vm",
      launch: false,
      timeoutSec: "900",
    });
    check(
      "timeoutSec ignored without --launch",
      /Invalid timeout/.test(ignored.errors?.[0]?.message || ""),
      false,
    );
  }

  // --- 4. emulator-manager script source guards ----------------------------------
  console.log("--- tizen-emulator-manager modify/reset reasons ---");
  {
    const ps1 = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "..",
        "scripts",
        "tizen-emulator-manager",
        "tizen-emulator-manager.ps1",
      ),
      "utf-8",
    );
    check(
      "ps1 defines Get-EmCliReason",
      /function Get-EmCliReason/.test(ps1),
      true,
    );
    check(
      "ps1 modify/reset/create-image report the em-cli reason",
      (ps1.match(/\$\(Get-EmCliReason \$\w+\)/g) || []).length >= 3,
      true,
    );
    check(
      "ps1 no longer reports only the Error: headline for modify/reset",
      /Failed to (modify|reset) VM '\$VmName': \$\(@\(\$\w+ \| Where-Object \{ \$_ -match '\^Error:' \}/.test(
        ps1,
      ),
      false,
    );
    check(
      "ps1 'may be running' hint is conditional",
      (
        ps1.match(
          /If the em-cli reason above does not explain it, the VM may be running/g,
        ) || []
      ).length,
      2,
    );
    const sh = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "..",
        "scripts",
        "tizen-emulator-manager",
        "tizen-emulator-manager.sh",
      ),
      "utf-8",
    );
    check(
      "sh 'may be running' hint is conditional too",
      (
        sh.match(
          /If the em-cli reason above does not explain it, the VM may be running/g,
        ) || []
      ).length,
      2,
    );
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
