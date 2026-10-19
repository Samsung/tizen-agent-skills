// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Follow-ups to the emulator.js refactor (#49), run against a stubbed
 * plugin-cache so no SDK, em-cli or device is touched:
 *   - launch-emulator rejects --timeout 0 instead of waiting 300 s (#58)
 *   - modify --size without --platform lists templates for the VM's own
 *     platform, and keeps the old behaviour when that lookup fails (#59)
 */

const Module = require("module");

console.log("=== emulator follow-ups Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

// Every script call is recorded; `respond` decides what each one returns.
const calls = [];
let respond = () => "";
let mockApplied = false;

const emulatorPath = require.resolve("../core/emulator");
const originalLoad = Module._load;
Module._load = function mockPluginCache(request, parent, isMain) {
  if (request === "./plugin-cache" && parent?.filename === emulatorPath) {
    mockApplied = true;
    return {
      resolveScript: () => ({ scriptPath: "/stub/tizen-emulator-manager.sh" }),
      execPluginScript: (_script, _winArgs, unixArgs) => {
        calls.push(unixArgs);
        return respond(unixArgs);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[emulatorPath];
const { launchEmulator, manageEmulator } = require("../core/emulator");
Module._load = originalLoad;

check("plugin-cache mock applied to emulator.js", mockApplied);
if (!mockApplied) process.exit(1);

const VM_DETAIL =
  "VM_DETAIL=my-tv|tv-samsung-10.0-x86_64|HD1080 TV|1920x1080|2048|x86_64|4|default|/skins";
const TEMPLATES = [
  "TEMPLATE_DETAIL=HD720 TV|tv|1280x720|2048",
  "TEMPLATE_DETAIL=HD1080 TV|tv|1920x1080|2048",
].join("\n");

const firstError = (envelope) => (envelope.errors && envelope.errors[0]) || {};

(async () => {
  // --- #58: --timeout 0 -------------------------------------------------
  calls.length = 0;
  let r = await launchEmulator({ vmName: "my-vm", timeoutSec: 0 });
  check(
    "launch --timeout 0 is rejected",
    r.status === "failure" &&
      firstError(r).error_category === "invalid_parameters" &&
      /Invalid timeout: 0\b/.test(firstError(r).message),
    JSON.stringify(firstError(r)),
  );
  check("launch --timeout 0 runs no script", calls.length === 0);

  r = await launchEmulator({ vmName: "bad name" });
  check(
    "launch without --timeout still defaults (reaches the VM name check)",
    /Invalid VM name/.test(firstError(r).message || ""),
    JSON.stringify(firstError(r)),
  );

  // --- #59: modify --size without --platform -----------------------------
  calls.length = 0;
  respond = (args) => {
    if (/-a list-vm/.test(args)) return VM_DETAIL;
    if (/-a list-template/.test(args)) return TEMPLATES;
    if (/-a modify/.test(args)) return VM_DETAIL;
    return "";
  };
  r = await manageEmulator({ action: "modify", vmName: "my-tv", size: "720" });
  const listTemplate = calls.find((a) => /-a list-template/.test(a)) || "";
  const modify = calls.find((a) => /-a modify/.test(a)) || "";
  check("modify --size succeeds", r.status === "success", JSON.stringify(r));
  check(
    "list-template uses the VM's own platform",
    /-P "tv-samsung-10.0-x86_64"/.test(listTemplate),
    listTemplate,
  );
  check(
    "modify gets the template for the requested size",
    /-T "HD720 TV"/.test(modify),
    modify,
  );
  check(
    "a warning says which platform was used",
    (r.warnings || []).some((w) => /tv-samsung-10\.0-x86_64/.test(w)),
    JSON.stringify(r.warnings),
  );

  calls.length = 0;
  r = await manageEmulator({
    action: "modify",
    vmName: "my-tv",
    size: "720",
    platform: "tv-samsung-10.0-x86_64",
  });
  check(
    "an explicit --platform skips the VM lookup",
    r.status === "success" && !calls.some((a) => /-a list-vm/.test(a)),
    calls.join(" || "),
  );

  calls.length = 0;
  respond = (args) => {
    if (/-a list-vm/.test(args)) throw new Error("em-cli list-vm failed");
    if (/-a list-template/.test(args)) return TEMPLATES;
    if (/-a modify/.test(args)) return VM_DETAIL;
    return "";
  };
  r = await manageEmulator({ action: "modify", vmName: "my-tv", size: "720" });
  const fallback = calls.find((a) => /-a list-template/.test(a)) || "";
  check(
    "a failed VM lookup falls back to listing without a platform",
    r.status === "success" && fallback && !/-P /.test(fallback),
    fallback,
  );

  console.log(`\n${failures ? `${failures} FAILED` : "All tests passed"}`);
  process.exit(failures ? 1 : 0);
})();
